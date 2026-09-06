// ============================================================================
// google.js — hablar con Firebase COMO SERVIDOR, sin Cloud Functions
// ----------------------------------------------------------------------------
// EL PROBLEMA. Dar de alta a una persona y asignarle permisos son operaciones
// que el navegador NO puede hacer: escribir un reclamo en un token exige la
// llave maestra del proyecto, y las colecciones de espejo y de bitácora están
// cerradas a cal y canto en las reglas (`allow write: if false`). Hasta hoy eso
// obligaba a hacerlo desde la Mac del Ingeniero por línea de comandos.
//
// La vía canónica sería una Cloud Function con el SDK de administración. Está
// descartada por escrito: exige el plan Blaze, que FACTURA y no APAGA — la regla
// de oro del proyecto prefiere el servicio que se apaga al que cobra cuando
// nadie mira (`99 §ADR-001`).
//
// LA VÍA QUE SÍ CABE. Un trabajador de Cloudflare con una CUENTA DE SERVICIO
// guardada como secreto, que se fabrica él mismo el permiso:
//
//   1. firma un JWT con la llave privada de la cuenta (RS256, WebCrypto),
//   2. lo canjea en `oauth2.googleapis.com/token` por un token de acceso,
//   3. y con ese token llama a las APIs REST de Identity Toolkit (las cuentas)
//      y de Firestore (el espejo y la bitácora).
//
// La cuenta de servicio SE SALTA LAS REGLAS de Firestore: por eso es el único
// camino posible a una colección con `allow write: if false`, que es justo lo
// que hace que una bitácora de auditoría valga algo — quien es auditado no
// puede escribir en ella.
//
// ⚠️ DÓNDE SE GASTA EL PRESUPUESTO DE CPU. El plan gratuito de Cloudflare da
// 10 ms de CPU por petición, y la ESPERA de una llamada de red NO cuenta contra
// ellos: solo el cálculo. Lo único caro aquí es la FIRMA RSA. Por eso el token
// de acceso —que vive una hora— se guarda en la memoria del aislado y se
// reutiliza: sin caché, cada alta pagaría la firma otra vez sin necesidad.
//
// ⚠️ LO QUE ESTE ARCHIVO NO HACE: no decide nada. No sabe qué es un rol ni quién
// puede ascender a quién. Solo sabe hablar con Google. Las decisiones están en
// `index.js`, y el catálogo de permisos en `contratos/src/usuarios.ts`.
// ============================================================================

const OAUTH = 'https://oauth2.googleapis.com/token';
const IDENTIDAD = 'https://identitytoolkit.googleapis.com';
const FIRESTORE = 'https://firestore.googleapis.com';

/**
 * Los dos permisos que se piden, y ni uno más:
 *   · identitytoolkit — crear cuentas, escribir reclamos, deshabilitar, revocar
 *   · datastore       — el espejo `usuarios/{uid}` y la bitácora
 */
const ALCANCES = 'https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/datastore';

/** Un fallo con código HTTP y un motivo que se le puede enseñar a una persona. */
export class FalloConCodigo extends Error {
  constructor(codigo, motivo, detalle = null) {
    super(motivo);
    this.codigo = codigo;
    this.motivo = motivo;
    this.detalle = detalle;
  }
}

// ── LA CUENTA DE SERVICIO ───────────────────────────────────────────────────

/**
 * Lee el secreto y comprueba que sirve. **Falla cerrado**: sin cuenta de
 * servicio este trabajador no puede hacer NADA de lo suyo, y decirlo con un 503
 * ruidoso es infinitamente mejor que descubrirlo a mitad de un alta.
 *
 * ⚠️ Se exige además que la cuenta sea DEL MISMO proyecto que se va a
 * administrar. Una cuenta de otro proyecto no es un error tipográfico
 * inofensivo: es administrar la base de otro.
 */
export function cuentaDeServicio(entorno) {
  const crudo = entorno.CUENTA_DE_SERVICIO;
  if (typeof crudo !== 'string' || !crudo.trim()) {
    throw new FalloConCodigo(503,
      'el trabajador no está configurado (falta el secreto CUENTA_DE_SERVICIO): no se administra nada');
  }
  let cuenta;
  try {
    cuenta = JSON.parse(crudo);
  } catch {
    throw new FalloConCodigo(503, 'el secreto CUENTA_DE_SERVICIO no es un JSON válido');
  }
  for (const campo of ['client_email', 'private_key', 'project_id']) {
    if (typeof cuenta[campo] !== 'string' || !cuenta[campo]) {
      throw new FalloConCodigo(503, `el secreto CUENTA_DE_SERVICIO no trae ${campo}`);
    }
  }
  if (cuenta.project_id !== entorno.PROYECTO_FIREBASE) {
    throw new FalloConCodigo(503,
      'la cuenta de servicio es de otro proyecto que el configurado: no se administra nada');
  }
  return cuenta;
}

/** PEM → los bytes DER que espera `importKey('pkcs8', …)`. */
function derDePem(pem) {
  const limpio = String(pem)
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const b = atob(limpio);
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

const aB64Url = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const textoAB64Url = (t) => aB64Url(new TextEncoder().encode(t));

/** Caché del token de acceso, en memoria del aislado. Es lo que evita firmar de más. */
const cacheDeAcceso = new Map();

/**
 * Devuelve un token de acceso de Google, firmando uno nuevo solo si hace falta.
 *
 * El margen de 60 s antes de la caducidad evita el caso feo: un token que era
 * válido al empezar la petición y ha caducado cuando Google lo mira.
 */
export async function tokenDeAcceso({ cuenta, traer, ahora, cache = cacheDeAcceso }) {
  const clave = `${cuenta.client_email}·${ALCANCES}`;
  const t = ahora();
  const guardado = cache.get(clave);
  if (guardado && t < guardado.hasta) return guardado.token;

  const segundos = Math.floor(t / 1000);
  const cabecera = textoAB64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const cuerpo = textoAB64Url(JSON.stringify({
    iss: cuenta.client_email,
    scope: ALCANCES,
    aud: cuenta.token_uri || OAUTH,
    iat: segundos,
    exp: segundos + 3600,
  }));

  const llave = await crypto.subtle.importKey(
    'pkcs8', derDePem(cuenta.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const firma = new Uint8Array(await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', llave, new TextEncoder().encode(`${cabecera}.${cuerpo}`),
  ));
  const aserto = `${cabecera}.${cuerpo}.${aB64Url(firma)}`;

  const r = await traer(cuenta.token_uri || OAUTH, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: aserto,
    }).toString(),
  });
  const respuesta = await r.json().catch(() => ({}));
  if (!r.ok || !respuesta.access_token) {
    // ⚠️ NO se copia aquí la respuesta entera de Google: puede traer el asserto
    // de vuelta, y el asserto va firmado con la llave privada.
    throw new FalloConCodigo(502,
      `Google no entregó el permiso de administración (${respuesta.error ?? r.status})`);
  }
  const vida = Number(respuesta.expires_in ?? 3600);
  cache.set(clave, { token: respuesta.access_token, hasta: t + Math.max(vida - 60, 30) * 1000 });
  return respuesta.access_token;
}

// ── FIRESTORE: DEL OBJETO DE JAVASCRIPT AL DE LA API, Y AL REVÉS ────────────
//
// La API REST de Firestore no acepta un objeto normal: cada valor va etiquetado
// con su tipo. Esto es esa traducción, y solo cubre los tipos que este
// trabajador escribe de verdad — texto, sí/no, listas de texto, mapas y fechas.
// Un tipo que no se usa no se implementa: código muerto que nadie prueba.

export function aValor(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(aValor) } };
  if (typeof v === 'object') return { mapValue: { fields: aCampos(v) } };
  return { stringValue: String(v) };
}

export function aCampos(objeto) {
  const campos = {};
  for (const [k, v] of Object.entries(objeto)) {
    if (v === undefined) continue;      // un campo ausente no se escribe como nulo
    campos[k] = aValor(v);
  }
  return campos;
}

export function deValor(v) {
  if (!v || typeof v !== 'object') return null;
  if ('nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(deValor);
  if ('mapValue' in v) return deCampos(v.mapValue.fields ?? {});
  return null;
}

export function deCampos(campos) {
  const o = {};
  for (const [k, v] of Object.entries(campos ?? {})) o[k] = deValor(v);
  return o;
}

// ── EL CLIENTE ──────────────────────────────────────────────────────────────

/**
 * Todo lo que este trabajador sabe pedirle a Google. Una instancia por petición:
 * así el token de acceso se pide UNA vez aunque la operación toque tres APIs.
 */
export class Google {
  constructor({ cuenta, proyecto, traer, ahora, cacheDeToken }) {
    this.cuenta = cuenta;
    this.proyecto = proyecto;
    this.traer = traer;
    this.ahora = ahora;
    this.cacheDeToken = cacheDeToken;
    this.permiso = null;
  }

  async bearer() {
    if (!this.permiso) {
      this.permiso = await tokenDeAcceso({
        cuenta: this.cuenta, traer: this.traer, ahora: this.ahora,
        ...(this.cacheDeToken ? { cache: this.cacheDeToken } : {}),
      });
    }
    return this.permiso;
  }

  async llamar(url, opciones = {}) {
    const r = await this.traer(url, {
      ...opciones,
      headers: {
        authorization: `Bearer ${await this.bearer()}`,
        'content-type': 'application/json; charset=utf-8',
        ...(opciones.headers ?? {}),
      },
    });
    const texto = await r.text();
    let cuerpo = null;
    try { cuerpo = texto ? JSON.parse(texto) : null; } catch { cuerpo = null; }
    if (!r.ok) {
      const mensaje = cuerpo?.error?.message ?? `${r.status}`;
      throw new FalloConCodigo(codigoDeGoogle(r.status, mensaje), traducir(mensaje), mensaje);
    }
    return cuerpo ?? {};
  }

  // ── Identity Toolkit ──────────────────────────────────────────────────────

  /** Crea la cuenta. Devuelve solo el uid: lo demás que devuelva Google se tira. */
  async crearCuenta({ correo, contrasena, nombre }) {
    const r = await this.llamar(`${IDENTIDAD}/v1/accounts:signUp`, {
      method: 'POST',
      body: JSON.stringify({
        email: correo, password: contrasena,
        ...(nombre ? { displayName: nombre } : {}),
        targetProjectId: this.proyecto,
      }),
    });
    if (!r.localId) throw new FalloConCodigo(502, 'Google creó la cuenta y no dijo su identificador');
    // ⚠️ `signUp` devuelve también `idToken` y `refreshToken`. NO se devuelven ni
    // se registran en ninguna parte: son credenciales vivas de esa persona.
    return r.localId;
  }

  /**
   * Escribe sobre una cuenta que ya existe: reclamos, contraseña, habilitada o
   * no, y el corte de sesiones. Es el mismo endpoint para todo, a propósito de
   * Google.
   */
  async actualizarCuenta(campos) {
    return this.llamar(`${IDENTIDAD}/v1/projects/${this.proyecto}/accounts:update`, {
      method: 'POST', body: JSON.stringify(campos),
    });
  }

  /** Consulta una o varias cuentas por uid o por correo. */
  async consultarCuentas({ uids, correos }) {
    const r = await this.llamar(`${IDENTIDAD}/v1/projects/${this.proyecto}/accounts:lookup`, {
      method: 'POST',
      body: JSON.stringify({
        ...(uids?.length ? { localId: uids } : {}),
        ...(correos?.length ? { email: correos } : {}),
      }),
    });
    return r.users ?? [];
  }

  /**
   * Todas las cuentas del proyecto, paginando. El tope de 20 páginas es una
   * cuerda de seguridad: 20.000 cuentas es un orden de magnitud imposible aquí,
   * y sin tope un `nextPageToken` que no avanza es un bucle infinito que se come
   * el presupuesto del trabajador.
   */
  async todasLasCuentas() {
    const cuentas = [];
    let pagina = null;
    for (let vuelta = 0; vuelta < 20; vuelta += 1) {
      const url = new URL(`${IDENTIDAD}/v1/projects/${this.proyecto}/accounts:batchGet`);
      url.searchParams.set('maxResults', '1000');
      if (pagina) url.searchParams.set('nextPageToken', pagina);
      const r = await this.llamar(url.toString(), { method: 'GET' });
      cuentas.push(...(r.users ?? []));
      pagina = r.nextPageToken ?? null;
      if (!pagina || !(r.users ?? []).length) break;
    }
    return cuentas;
  }

  /**
   * El enlace de un solo uso para que la persona elija su contraseña, SIN que
   * Google mande ningún correo (`returnOobLink: true`). Lo entrega el
   * administrador por el canal que él controle: así el alta no depende de que el
   * correo llegue, ni de la cuota de correos del plan gratuito.
   */
  async enlaceDeContrasena(correo) {
    const r = await this.llamar(`${IDENTIDAD}/v1/accounts:sendOobCode`, {
      method: 'POST',
      body: JSON.stringify({
        requestType: 'PASSWORD_RESET', email: correo,
        returnOobLink: true, targetProjectId: this.proyecto,
      }),
    });
    if (!r.oobLink) throw new FalloConCodigo(502, 'Google no devolvió el enlace de contraseña');
    return r.oobLink;
  }

  // ── Firestore ─────────────────────────────────────────────────────────────

  get documentos() {
    return `${FIRESTORE}/v1/projects/${this.proyecto}/databases/(default)/documents`;
  }

  /** Un documento, o `null` si no existe. Un 404 aquí es una respuesta, no un fallo. */
  async leerDocumento(ruta) {
    try {
      const r = await this.llamar(`${this.documentos}/${ruta}`, { method: 'GET' });
      return deCampos(r.fields);
    } catch (e) {
      if (e instanceof FalloConCodigo && e.codigo === 404) return null;
      throw e;
    }
  }

  /**
   * Escribe un documento **por campos**, no de golpe.
   *
   * ⚠️ SIEMPRE con máscara. Sin ella, la API borra del documento todo lo que no
   * venga en esta escritura — y en `usuarios/{uid}` eso significaría llevarse por
   * delante el recibo de contraseña que escribe la propia persona. Escribir un
   * espejo no puede destruir lo que el espejo no conoce.
   */
  async escribirDocumento(ruta, campos) {
    const url = new URL(`${this.documentos}/${ruta}`);
    for (const campo of Object.keys(campos)) url.searchParams.append('updateMask.fieldPaths', campo);
    await this.llamar(url.toString(), {
      method: 'PATCH', body: JSON.stringify({ fields: aCampos(campos) }),
    });
  }

  /** El nombre completo de un documento, tal como lo exige `:commit`. */
  nombreDe(ruta) {
    return `projects/${this.proyecto}/databases/(default)/documents/${ruta}`;
  }

  /**
   * Escribe un documento SOLO SI (no) existe todavía. Es el cerrojo atómico del
   * arranque (`99 §ADR-100`): «comprobar que no hay propietario» y «estampar
   * propietario» como dos pasos dejaban una carrera entre dos llamadas; con la
   * precondición `currentDocument.exists=false` de Firestore, la segunda llamada
   * FALLA en el servidor de Google, no en una comprobación nuestra.
   *
   * Firestore responde 400 FAILED_PRECONDITION cuando no se cumple; aquí eso se
   * convierte en 409, que es lo que significa: «ya lo hizo alguien».
   */
  async escribirSiNoExiste(ruta, campos) {
    await this.llamar(`${this.documentos}:commit`, {
      method: 'POST',
      body: JSON.stringify({
        writes: [{
          update: { name: this.nombreDe(ruta), fields: aCampos(campos) },
          currentDocument: { exists: false },
        }],
      }),
    });
  }

  /**
   * Varias escrituras en UN solo viaje. Lo exige el plan gratuito —50
   * subpeticiones por invocación— y lo exige la limpieza inicial: las lápidas y
   * sus entradas de bitácora tienen que quedar escritas ANTES de borrar la
   * cuenta, y en una sola llamada, para que un corte a mitad no deje cuentas
   * borradas sin rastro.
   *
   * @param {{ruta: string, campos: Record<string, unknown>}[]} escrituras
   */
  async escribirVarios(escrituras) {
    if (!escrituras.length) return;
    await this.llamar(`${this.documentos}:commit`, {
      method: 'POST',
      body: JSON.stringify({
        writes: escrituras.map((e) => ({ update: { name: this.nombreDe(e.ruta), fields: aCampos(e.campos) } })),
      }),
    });
  }

  /**
   * Borra cuentas de Auth en lote. `force: false` es la red: Google solo borra
   * las que YA están deshabilitadas, así que una cuenta que por lo que sea siga
   * activa no se borra por accidente. Devuelve las que NO pudo borrar.
   *
   * @returns {{localId: string, message: string}[]}
   */
  async borrarCuentasEnLote(uids, { force = false } = {}) {
    if (!uids.length) return [];
    const r = await this.llamar(`${IDENTIDAD}/v1/projects/${this.proyecto}/accounts:batchDelete`, {
      method: 'POST', body: JSON.stringify({ localIds: uids, force }),
    });
    return (r.errors ?? []).map((e) => ({ localId: e.localId ?? uids[e.index] ?? '?', message: e.message ?? '' }));
  }

  /** Añade un documento con identificador generado por Firestore. */
  async crearDocumento(coleccion, campos) {
    const r = await this.llamar(`${this.documentos}/${coleccion}`, {
      method: 'POST', body: JSON.stringify({ fields: aCampos(campos) }),
    });
    return String(r.name ?? '').split('/').pop() ?? null;
  }

  /** Una colección entera, indexada por identificador de documento. */
  async listarColeccion(coleccion, tope = 300) {
    const porId = new Map();
    let pagina = null;
    for (let vuelta = 0; vuelta < 20; vuelta += 1) {
      const url = new URL(`${this.documentos}/${coleccion}`);
      url.searchParams.set('pageSize', String(tope));
      if (pagina) url.searchParams.set('pageToken', pagina);
      const r = await this.llamar(url.toString(), { method: 'GET' });
      for (const d of r.documents ?? []) {
        porId.set(String(d.name).split('/').pop(), deCampos(d.fields));
      }
      pagina = r.nextPageToken ?? null;
      if (!pagina) break;
    }
    return porId;
  }
}

// ── LOS FALLOS DE GOOGLE, EN CASTELLANO Y CON EL CÓDIGO CORRECTO ────────────

function codigoDeGoogle(estado, mensaje) {
  if (mensaje.startsWith('EMAIL_EXISTS')) return 409;
  // La precondición de `:commit` («solo si no existe») no se cumplió: alguien ya
  // escribió ese documento. Es un 409 con todas las letras.
  if (/FAILED_PRECONDITION|already exists|precondition/i.test(mensaje)) return 409;
  if (mensaje.startsWith('EMAIL_NOT_FOUND') || mensaje.startsWith('USER_NOT_FOUND')) return 404;
  if (mensaje.startsWith('INVALID_EMAIL') || mensaje.startsWith('WEAK_PASSWORD')
    || mensaje.startsWith('INVALID_ID_TOKEN') || mensaje.startsWith('CLAIMS_TOO_LARGE')) return 400;
  if (estado === 404) return 404;
  if (estado === 429 || mensaje.startsWith('QUOTA_EXCEEDED')
    || mensaje.startsWith('TOO_MANY_ATTEMPTS_TRY_LATER')) return 429;
  // Un 401/403 de Google NO es un 401/403 de este trabajador: quien no tiene
  // permiso es la cuenta de servicio, no quien llama. Decirle 403 a quien llama
  // lo mandaría a revisar SU sesión, que está perfectamente.
  if (estado === 401 || estado === 403) return 502;
  return estado >= 500 ? 502 : 502;
}

function traducir(mensaje) {
  const m = String(mensaje);
  if (m.startsWith('EMAIL_EXISTS')) return 'ya existe una cuenta con ese correo';
  if (m.startsWith('EMAIL_NOT_FOUND') || m.startsWith('USER_NOT_FOUND')) return 'no existe esa cuenta';
  if (m.startsWith('INVALID_EMAIL')) return 'ese correo no es válido';
  if (m.startsWith('WEAK_PASSWORD')) return 'Google rechazó la contraseña por débil';
  if (m.startsWith('CLAIMS_TOO_LARGE')) return 'los permisos no caben en el token';
  if (/FAILED_PRECONDITION|already exists|precondition/i.test(m)) return 'ese documento ya existe: alguien se adelantó';
  if (m.startsWith('TOO_MANY_ATTEMPTS_TRY_LATER') || m.startsWith('QUOTA_EXCEEDED')) {
    return 'Google está limitando las peticiones: inténtelo dentro de un rato';
  }
  return `Google rechazó la operación (${m})`;
}
