// ============================================================================
// usuarios — el trabajador administrativo de personas
// ----------------------------------------------------------------------------
// QUÉ RESUELVE. Hasta el 2026-09-05 dar de alta a alguien, cambiarle el rol o
// apagarle la cuenta se hacía SOLO desde la Mac del Ingeniero, por línea de
// comandos y con la llave maestra del proyecto delante. Nadie más podía
// hacerlo, no quedaba rastro de quién lo hizo, y la llave viajaba en un portátil.
//
// Este trabajador es la misma capacidad, desde la aplicación, sin llave maestra
// en el navegador y con bitácora. La herramienta de línea de comandos SE RETIRÓ
// del repositorio por orden del Ingeniero («todo lo viejo se borra»). El
// `propietario` nace en la CONSOLA de Firebase y lo reconoce `/bootstrap`, de un
// solo uso; el rescate, si esto falla, vive FUERA del repo, en la bóveda privada
// (`rescate.mjs`), porque la consola no sabe escribir reclamos (`99 §ADR-100`).
//
// LAS TRES COSAS QUE GOBIERNAN ESTE ARCHIVO
//
//   1. EL PERMISO SE DEFINE UNA VEZ, EN `contratos/src/usuarios.ts`. Aquí no hay
//      ni una tabla de roles, ni una lista de funciones, ni un código corto
//      escrito a mano. Todo se IMPORTA. El catálogo nació justo de haber medido
//      tres sistemas ajenos donde el permiso vivía en tres archivos que ya
//      habían divergido.
//
//   2. EL ACTOR SALE DEL TOKEN, JAMÁS DEL CUERPO DE LA PETICIÓN. Una bitácora
//      que el auditado puede firmar con el nombre de otro no es una bitácora.
//      Aquí `actorUid` es el `sub` del token cuya firma se acaba de verificar.
//
//   3. RECLAMO AUSENTE = MÍNIMO PRIVILEGIO. Sin `orgId` no se pasa. Sin la
//      función `usuarios.gestionar` no se administra. Un reclamo que falta nunca
//      es una promoción.
//
// LA JERARQUÍA QUE SE HACE CUMPLIR AQUÍ, y que va más allá de «sea admin»
//   · Al `propietario` NO lo toca la aplicación. Ni él mismo. Es la cuenta de
//     rescate: la acuña `/bootstrap` una sola vez y la repara el rescate de la bóveda.
//   · La fila de `admin` —darla o quitarla— es del `propietario`. Un
//     administrador gestiona editores, cuadrillas y auditores; no nombra a sus
//     iguales, no los degrada, no los apaga y no les repone la contraseña
//     (reponerle la contraseña a un igual es apoderarse de su cuenta).
//   · Y no se puede dejar la organización SIN nadie que administre: el último
//     admin activo no se degrada ni se apaga (409, con el motivo).
//   Esta jerarquía sale de lo que el propio catálogo dice del `propietario`
//   —«el único que puede nombrar administradores»— y la pantalla puede
//   dibujarla sin adivinar, porque `GET /usuarios` devuelve `puedeAsignar`.
//
// LO QUE ESTE TRABAJADOR NO HACE, A PROPÓSITO
//   · No borra cuentas. Se deshabilitan: borrar es permanente y el rastro de
//     quién tuvo acceso es parte de lo que hace auditable el sistema.
//   · No emite tokens de sesión ni devuelve contraseñas. Del alta por enlace
//     sale un enlace de un solo uso; la contraseña aleatoria que nace con la
//     cuenta no se devuelve, no se registra y nadie la ve nunca.
//   · No manda correos. El enlace lo entrega el administrador por el canal que
//     él controle: así el alta no depende del correo ni de su cuota.
// ============================================================================
import { verificarToken, revocadosAntesDeDe } from '../../comun/token-de-firebase.js';
import {
  ROLES_ASIGNABLES, CODIGOS_FUNCION, FUNCIONES, FUNCIONES_POR_ROL, FUNCION_POR_CORTO,
  TODAS_LAS_LINEAS, PerfilDeUsuario, EntradaDeAuditoria, reclamosDe, puede,
} from '../../contratos/src/usuarios.ts';
import { defectosDeContrasena } from '../../contratos/src/acceso.ts';
import { Google, cuentaDeServicio, FalloConCodigo } from './google.js';

/**
 * Se pinta en `/salud` para saber QUÉ está desplegado, no solo que responde.
 *
 * ⚠️ NO SE EXPORTA, y no es un descuido: el motor de trabajadores exige que todo
 * lo que exporte el archivo de entrada sea una función o un manejador, y arranca
 * con «Incorrect type for map entry 'VERSION'» si encuentra un texto. Se
 * descubrió corriéndolo de verdad; ni el empaquetado ni `--dry-run` lo ven.
 */
const VERSION = '1.0.0';

/** Quiénes administran personas. El resto de la jerarquía está en `puedeActuarSobre`. */
const ROLES_QUE_ADMINISTRAN = Object.freeze(['propietario', 'admin']);

/** La colección de la bitácora. Cerrada a la escritura del cliente en las reglas. */
const BITACORA = 'auditoria_accesos';

/**
 * LOS DOS CERROJOS DE UN SOLO USO (`99 §ADR-100`). Viven en `config/`, que las
 * reglas cierran a la escritura del cliente para estos dos identificadores en
 * concreto, y los escribe SOLO este trabajador con la cuenta de servicio.
 *
 *   · `config/arranque`  — quién es el propietario y cuándo se acuñó. Mientras
 *     exista, `/bootstrap` responde 409 aunque no haya propietario vivo:
 *     rearmar el arranque es un acto humano (borrar este documento a mano en
 *     la consola), no una casualidad del estado.
 *   · `config/limpieza`  — el progreso de la limpieza inicial y su marca de
 *     hecho. Tras el primer éxito, el borrado masivo no se puede repetir.
 */
const ARRANQUE = 'config/arranque';
const LIMPIEZA = 'config/limpieza';

/** Cuántas cuentas se procesan por petición en la limpieza: cabe de sobra en las 50 subpeticiones del plan gratuito. */
const LOTE_LIMPIEZA = 8;

/** Una sesión «reciente» para los actos que lo exigen: cinco minutos desde que se tecleó la contraseña. */
const SESION_RECIENTE_S = 5 * 60;

/** Correo enmascarado para listas que se enseñan y se guardan: `mi…@dominio`. */
const enmascarar = (correo) => {
  const c = String(correo ?? '');
  if (!c.includes('@')) return c ? '…' : '—';
  const [u, d] = c.split('@');
  return `${u.slice(0, 2)}…@${d}`;
};

/** Un identificador para documentos que este trabajador nombra él mismo (bitácora en lote). */
const idNuevo = () => {
  const b = crypto.getRandomValues(new Uint8Array(15));
  let x = '';
  for (const v of b) x += v.toString(16).padStart(2, '0');
  return x;
};

/**
 * Cubo de escrituras por persona, en memoria del aislado.
 *
 * ⚠️ ES BEST-EFFORT Y SE DICE: Cloudflare puede tener varios aislados vivos a la
 * vez y cada uno lleva su propia cuenta, así que el tope real es un múltiplo
 * pequeño de éste. No es un control de seguridad —lo son la jerarquía y la
 * verificación del token—: es un freno para que un fallo en bucle de la pantalla
 * no gaste el presupuesto del plan gratuito ni llene la bitácora.
 */
const TOPE_ESCRITURAS = 30;
const VENTANA_MS = 10 * 60 * 1000;
const cubos = new Map();

/** Lo que se cuenta para `/salud`. Vive lo que viva el aislado. */
const salud = { arrancado: Date.now(), operaciones: 0, fallosDeBitacora: 0 };

// ── LA PUERTA ───────────────────────────────────────────────────────────────

const cabecerasCors = (origen, permitido) => ({
  'Access-Control-Allow-Origin': origen === permitido ? origen : (permitido ?? ''),
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  // ⚠️ `X-Limpieza-Token` TIENE que estar aquí. Sin él, el navegador rechaza la
  // limpieza inicial en el preflight —antes de enviarla— y la pantalla solo ve
  // «no hubo conexión». Pasó en vivo el 2026-09-06, con el servidor intacto:
  // ninguna prueba sin navegador lo caza, por eso hay una que mira esta lista.
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Limpieza-Token',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
});

const responder = (cuerpo, codigo, cors) =>
  new Response(JSON.stringify(cuerpo), {
    status: codigo,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Nada de esto lo puede cachear nadie: son datos de personas.
      'cache-control': 'no-store',
      ...cors,
    },
  });

const noPasa = (motivo, codigo, cors, extra = {}) =>
  responder({ error: motivo, ...extra }, codigo, cors);

// ── HERRAMIENTAS PEQUEÑAS ───────────────────────────────────────────────────

/** Un uid de Firebase. Se comprueba porque va DENTRO de una URL que se llama. */
const uidValido = (u) => typeof u === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(u);

/** Los reclamos reales de una cuenta, tal como Google los guarda (texto JSON). */
function reclamosDeLaCuenta(cuenta) {
  try {
    const c = JSON.parse(cuenta?.customAttributes ?? '{}');
    return c && typeof c === 'object' ? c : {};
  } catch {
    return {};
  }
}

/** Las funciones en claro que declara un reclamo. Un código que no existe se ignora. */
const funcionesDeReclamos = (claims) =>
  (Array.isArray(claims?.f) ? claims.f : []).map((c) => FUNCION_POR_CORTO[c]).filter(Boolean);

/**
 * El perfil que IMPLICAN los reclamos reales de una cuenta. Es la inversa exacta
 * de `reclamosDe`, y es lo que hace posible `reconciliar`: el token es la
 * frontera, así que cuando espejo y token discrepan, manda el token.
 */
function perfilDesdeReclamos(cuenta, claims) {
  const rol = claims.rol;
  const efectivas = funcionesDeReclamos(claims);
  const base = FUNCIONES_POR_ROL[rol] ?? [];
  return {
    orgId: claims.orgId,
    correo: cuenta.email ?? '',
    nombre: cuenta.displayName || cuenta.email || '(sin nombre)',
    rol,
    funcionesExtra: efectivas.filter((f) => !base.includes(f) && FUNCIONES[f].delegable),
    // ⚠️ QUITAR NO ES DELEGAR, y el filtro `delegable` NO va aquí. Lo llevaba, y
    // con él una función no delegable retirada a mano —`ia.leer`,
    // `usuarios.auditoria`— desaparecía de `funcionesQuitadas` al reconciliar:
    // el token seguía sin darla y el espejo decía que sí. Esa es exactamente la
    // ilusión de control que el catálogo existe para impedir (`99 §ADR-100`), y
    // peor: la siguiente edición del perfil se la habría devuelto en silencio.
    // El catálogo nunca lo pidió — `funcionesEfectivas` borra CUALQUIER quitada.
    funcionesQuitadas: base.filter((f) => !efectivas.includes(f)),
    lineas: Array.isArray(claims.l) && claims.l.length ? [...claims.l] : [TODAS_LAS_LINEAS],
    activo: !cuenta.disabled,
  };
}

/** Los ocho campos que este trabajador gobierna del espejo. El resto es de la persona. */
const EJES_DEL_PERFIL = ['orgId', 'correo', 'nombre', 'rol', 'funcionesExtra', 'funcionesQuitadas', 'lineas', 'activo'];
const soloEjes = (p) => Object.fromEntries(EJES_DEL_PERFIL.map((k) => [k, p?.[k] ?? null]));
const mismosEjes = (a, b) => JSON.stringify(soloEjes(a)) === JSON.stringify(soloEjes(b));

/** Una contraseña que NADIE ve: 256 bits de azar que ni se devuelven ni se registran. */
function contrasenaQueNadieVe() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Lista de funciones válida, o se rechaza. Un código inventado no se ignora: se dice. */
function exigirFunciones(lista, campo) {
  if (lista === undefined || lista === null) return [];
  if (!Array.isArray(lista)) throw new FalloConCodigo(400, `${campo} tiene que ser una lista`);
  for (const f of lista) {
    if (!CODIGOS_FUNCION.includes(f)) throw new FalloConCodigo(400, `${campo}: no existe la función «${f}»`);
  }
  return [...lista];
}

// ── LA BITÁCORA ─────────────────────────────────────────────────────────────

/**
 * Escribe una entrada de auditoría. Devuelve `'ok'` o `'fallo'`, y NUNCA lanza.
 *
 * ⚠️ El fallo no se traga en silencio. La operación principal ya está hecha y se
 * reporta como hecha —negarla sería mentir al revés—, pero la respuesta lo dice
 * (`bitacora: 'fallo'`) y se cuenta en `/salud`. Una bitácora que falla sin que
 * nadie se entere es peor que no tenerla: da confianza sin dar rastro.
 */
async function auditar(google, entrada) {
  try {
    const validada = EntradaDeAuditoria.parse(entrada);
    await google.crearDocumento(BITACORA, validada);
    return 'ok';
  } catch {
    salud.fallosDeBitacora += 1;
    return 'fallo';
  }
}

// ── EL TRABAJADOR ───────────────────────────────────────────────────────────

export default {
  async fetch(peticion, entorno) {
    const url = new URL(peticion.url);
    const cors = cabecerasCors(peticion.headers.get('Origin') ?? '', entorno.ORIGEN_PERMITIDO);
    // Las costuras de prueba viajan en el entorno. En producción no existen —las
    // variables de Cloudflare son texto y los enlaces son objetos, nunca
    // funciones— y entonces se usan los globales de siempre.
    const traer = typeof entorno.PRUEBA_FETCH === 'function'
      ? entorno.PRUEBA_FETCH : (...a) => fetch(...a);
    const ahora = typeof entorno.PRUEBA_AHORA === 'function' ? entorno.PRUEBA_AHORA : () => Date.now();

    if (peticion.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const partes = url.pathname.split('/').filter(Boolean);

    // ── /salud: sin sesión, para el vigía ─────────────────────────────────
    // Dice si el trabajador PUEDE trabajar, no solo si responde. Un vigía que
    // recibe 200 de un servicio que no puede administrar nada no vigila nada.
    if (partes.length === 1 && partes[0] === 'salud') {
      if (peticion.method !== 'GET') return noPasa('a /salud se le pregunta con GET', 405, cors);
      const falta = [];
      for (const nombre of ['PROYECTO_FIREBASE', 'ORG_PERMITIDA', 'CUENTA_DE_SERVICIO']) {
        const v = entorno[nombre];
        if (typeof v !== 'string' || !v.trim()) falta.push(nombre);
      }
      // Exigir App Check apaga el servicio (ver más abajo). Si /salud no lo
      // dijera, el vigía vería un 200 mientras todo lo demás responde 503 — que
      // es exactamente la clase de mentira que este archivo evita en todo lo
      // demás.
      if (String(entorno.APP_CHECK_EXIGIDO ?? 'false').toLowerCase() === 'true') {
        falta.push('APP_CHECK_EXIGIDO=true, y todavía no se sabe comprobar App Check');
      }
      const cuerpo = {
        ok: falta.length === 0,
        version: VERSION,
        proyecto: entorno.PROYECTO_FIREBASE ?? null,
        // Solo el NOMBRE de lo que falta. Jamás su contenido: uno de ellos es el
        // secreto entero de la cuenta de servicio.
        ...(falta.length ? { falta } : {}),
        operaciones: salud.operaciones,
        fallosDeBitacora: salud.fallosDeBitacora,
        desde: new Date(salud.arrancado).toISOString(),
      };
      return responder(cuerpo, falta.length ? 503 : 200, cors);
    }

    // ── /estado: sin sesión, para el runbook ──────────────────────────────
    // Dice si el arranque está CONFIGURADO y si ya se HIZO, sin revelar uid ni
    // correo. Existe porque un secreto no se puede releer: si `PROPIETARIO_UID`
    // quedó mal puesto, la única señal sería un 403 mudo en el momento más
    // delicado del corte de acceso.
    if (partes.length === 1 && partes[0] === 'estado') {
      if (peticion.method !== 'GET') return noPasa('a /estado se le pregunta con GET', 405, cors);
      const configurado = ['PROYECTO_FIREBASE', 'ORG_PERMITIDA', 'CUENTA_DE_SERVICIO', 'PROPIETARIO_UID']
        .every((k) => typeof entorno[k] === 'string' && entorno[k].trim());
      let arrancado = null;
      let limpiezaHecha = null;
      try {
        const g = new Google({
          cuenta: cuentaDeServicio(entorno), proyecto: entorno.PROYECTO_FIREBASE, traer, ahora,
          cacheDeToken: entorno.PRUEBA_CACHE_TOKEN,
        });
        arrancado = (await g.leerDocumento(ARRANQUE)) != null;
        limpiezaHecha = (await g.leerDocumento(LIMPIEZA))?.hecho === true;
      } catch { /* sin cuenta de servicio no se puede saber, y se dice con null */ }
      let revocadosAntesDe = null;
      try { revocadosAntesDe = revocadosAntesDeDe(entorno); } catch { revocadosAntesDe = 'ilegible'; }
      return responder({ configurado, arrancado, limpiezaHecha, revocadosAntesDe, version: VERSION }, 200, cors);
    }

    if (!['GET', 'POST', 'PATCH'].includes(peticion.method)) {
      return noPasa('aquí solo se consulta (GET), se crea (POST) y se corrige (PATCH)', 405, cors);
    }

    // ── Fallar cerrado: sin configuración no se administra NADA ────────────
    // Misma doctrina que el portero de fotos: la ausencia de una variable APAGA
    // el servicio en vez de abrirlo. Una seguridad que depende de que una
    // variable esté puesta no es seguridad, es una casualidad de configuración.
    for (const nombre of ['PROYECTO_FIREBASE', 'ORG_PERMITIDA']) {
      const v = entorno[nombre];
      if (typeof v !== 'string' || !v.trim()) {
        return noPasa(`el trabajador no está configurado (falta ${nombre}): no se administra nada`, 503, cors);
      }
    }
    // ⚠️ App Check: HOY ESTE TRABAJADOR NO SABE COMPROBARLO. Si alguien pone la
    // variable en `true` creyendo que lo activa, lo que se activa es el apagado.
    // La alternativa —seguir sirviendo con la variable puesta— sería exactamente
    // la promesa que el código no cumple: la falta que más veces ha aparecido en
    // este proyecto.
    if (String(entorno.APP_CHECK_EXIGIDO ?? 'false').toLowerCase() === 'true') {
      return noPasa('se exige App Check y este trabajador todavía no sabe comprobarlo: no se administra nada', 503, cors);
    }

    let cuenta;
    try {
      cuenta = cuentaDeServicio(entorno);
    } catch (e) {
      return noPasa(e.motivo ?? 'configuración incompleta', e.codigo ?? 503, cors);
    }

    // ── La sesión de quien llama ──────────────────────────────────────────
    const cabecera = peticion.headers.get('Authorization') ?? '';
    const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;
    if (!token) return noPasa('hace falta iniciar sesión', 401, cors);

    let sesion;
    try {
      const revocadosAntesDe = revocadosAntesDeDe(entorno);
      sesion = await verificarToken(token, entorno.PROYECTO_FIREBASE, { fetch: traer, ahora, revocadosAntesDe });
    } catch (e) {
      const apagado = /REVOCADOS_ANTES_DE/.test(e.message);
      return noPasa(apagado ? e.message : `sesión no válida: ${e.message}`, apagado ? 503 : 401, cors);
    }
    // ⚠️ EL ARRANQUE ES LA ÚNICA RUTA A LA QUE SE LLEGA SIN ORGANIZACIÓN: la
    // cuenta recién creada en la consola no tiene ni un reclamo. Todo lo demás
    // exige `orgId`, y `arrancar` exige por su cuenta uid, proveedor y sesión
    // reciente — más de lo que exige cualquier otra ruta.
    const esArranque = partes.length === 1 && partes[0] === 'bootstrap';
    if (!esArranque && sesion.orgId !== entorno.ORG_PERMITIDA) {
      return noPasa('esta sesión no pertenece a la organización dueña del dato', 403, cors);
    }

    const google = new Google({
      cuenta, proyecto: entorno.PROYECTO_FIREBASE, traer, ahora,
      cacheDeToken: entorno.PRUEBA_CACHE_TOKEN,
    });
    const contexto = {
      google, ahora, cors, entorno,
      actorUid: sesion.sub,
      actorCorreo: typeof sesion.email === 'string' ? sesion.email : undefined,
      actorRol: sesion.rol,
      org: entorno.ORG_PERMITIDA,
      ip: peticion.headers.get('cf-connecting-ip') ?? undefined,
    };

    // ── El freno de escrituras, por persona ───────────────────────────────
    if (peticion.method !== 'GET' && !gastarCupo(sesion.sub, ahora())) {
      return noPasa(
        `demasiadas operaciones seguidas (${TOPE_ESCRITURAS} en ${VENTANA_MS / 60000} minutos): espere un momento`,
        429, cors);
    }

    let cuerpo = {};
    if (peticion.method !== 'GET') {
      try {
        const texto = await peticion.text();
        cuerpo = texto ? JSON.parse(texto) : {};
      } catch {
        return noPasa('el cuerpo de la petición no es JSON válido', 400, cors);
      }
      if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
        return noPasa('el cuerpo de la petición tiene que ser un objeto', 400, cors);
      }
    }

    try {
      // ── /bootstrap: lo ÚNICO que no exige administrar ───────────────────
      // Quien arranca no tiene reclamos todavía: es la cuenta que el Ingeniero
      // acaba de crear en la consola. Todo lo demás lo comprueba `arrancar`.
      if (partes.length === 1 && partes[0] === 'bootstrap') {
        if (peticion.method !== 'POST') return noPasa('ruta desconocida', 404, cors);
        return await arrancar(contexto, sesion, entorno);
      }

      // ── /limpieza-inicial: solo el propietario, y solo una vez ──────────
      if (partes.length === 1 && partes[0] === 'limpieza-inicial') {
        const veto = await exigirPropietario(contexto, sesion, entorno);
        if (veto) return veto;
        if (peticion.method === 'GET') {
          if (url.searchParams.get('simular') !== '1') {
            return noPasa('la limpieza se ENSAYA primero: GET /limpieza-inicial?simular=1', 400, cors);
          }
          return await simularLimpieza(contexto, sesion, entorno);
        }
        if (peticion.method === 'POST') return await ejecutarLimpieza(contexto, sesion, entorno, peticion, cuerpo);
        return noPasa('ruta desconocida', 404, cors);
      }

      if (partes[0] !== 'usuarios') return noPasa('ruta desconocida', 404, cors);

      // ── De aquí abajo, todo exige administrar personas ──────────────────
      //
      // Primero, gratis: lo que dice el propio token. No decide nada por sí solo
      // —abajo se comprueba contra el estado vivo— pero evita salir a Google por
      // una sesión que ni siquiera dice ser de administrador.
      if (!ROLES_QUE_ADMINISTRAN.includes(sesion.rol)) {
        return noPasa('esta sesión no administra personas', 403, cors);
      }
      //
      // ⚠️ Y LA AUTORIDAD SALE DEL ESTADO VIVO, NO DEL PAPEL. El token demuestra
      // QUIÉN es quien llama —su firma no se puede falsificar—, pero no demuestra
      // qué puede hacer HOY: un token de identidad de Firebase vive hasta una
      // hora y no se invalida al apagar una cuenta ni al cambiarle el rol.
      // Fiándose solo del papel, un administrador recién degradado tendría una
      // hora larga para crearse otra cuenta de administrador — y la degradación
      // no habría servido de nada. Cuesta UNA consulta a Google, y es la
      // diferencia entre revocar de verdad y revocar en diferido.
      const [propia] = await google.consultarCuentas({ uids: [sesion.sub] });
      if (!propia || propia.disabled) {
        return noPasa('esta sesión pertenece a una cuenta apagada', 403, cors);
      }
      const vivos = reclamosDeLaCuenta(propia);
      if (vivos.orgId !== entorno.ORG_PERMITIDA) {
        return noPasa('esta sesión no pertenece a la organización dueña del dato', 403, cors);
      }
      if (!ROLES_QUE_ADMINISTRAN.includes(vivos.rol)) {
        return noPasa('esta sesión no administra personas', 403, cors);
      }
      // Y además la FUNCIÓN, que es donde el catálogo define el permiso. Para un
      // admin bien aprovisionado las dos comprobaciones dicen lo mismo; la
      // segunda es la que atrapa unos permisos anteriores al catálogo, que solo
      // traen el rol. Se dice qué hacer, porque un 403 sin salida es una avería,
      // no una defensa.
      if (!puede(vivos, 'usuarios.gestionar')) {
        return noPasa(
          'esta sesión es de administrador, pero sus permisos son anteriores al catálogo actual: '
          + 'pida al propietario que corrija su cuenta desde la pantalla de personas y entre de nuevo', 403, cors);
      }
      // El rol con el que se juzga la jerarquía es el de AHORA, no el del token.
      contexto.actorRol = vivos.rol;
      contexto.actorCorreo = propia.email ?? contexto.actorCorreo;

      if (partes.length === 1) {
        if (peticion.method === 'GET') return await listar(contexto);
        if (peticion.method === 'POST') return await alta(contexto, cuerpo);
        return noPasa('ruta desconocida', 404, cors);
      }

      const uid = partes[1];
      if (!uidValido(uid)) return noPasa('identificador de persona no válido', 400, cors);

      if (partes.length === 2) {
        if (peticion.method !== 'PATCH') return noPasa('ruta desconocida', 404, cors);
        return await corregir(contexto, uid, cuerpo);
      }

      if (partes.length === 3 && peticion.method === 'POST') {
        const accion = partes[2];
        if (accion === 'deshabilitar') return await deshabilitar(contexto, uid);
        if (accion === 'restituir') return await restituir(contexto, uid);
        // `/estado` es la MISMA operación con el interruptor en el cuerpo: es
        // como la pide la pantalla (`web/src/datos/usuariosRemoto.ts`). Se
        // admiten las dos formas a propósito — una ruta que la pantalla llama y
        // el servidor no conoce da un 404 que se lee como «hay dos versiones
        // desplegadas», y ese diagnóstico cuesta una tarde.
        if (accion === 'estado') {
          if (typeof cuerpo.activo !== 'boolean') {
            throw new FalloConCodigo(400, 'hay que decir si la cuenta queda activa (true) o no (false)');
          }
          return cuerpo.activo ? await restituir(contexto, uid) : await deshabilitar(contexto, uid);
        }
        if (accion === 'contrasena') return await reponerContrasena(contexto, uid, cuerpo);
        if (accion === 'reconciliar') return await reconciliar(contexto, uid);
      }
      return noPasa('ruta desconocida', 404, cors);
    } catch (e) {
      if (e instanceof FalloConCodigo) return noPasa(e.motivo, e.codigo, cors);
      // Un fallo no previsto no se convierte en 200 ni en silencio.
      return noPasa(`no se pudo completar la operación: ${e?.message ?? 'fallo interno'}`, 500, cors);
    }
  },
};

/** ¿Le queda cupo de escrituras a esta persona en esta ventana? */
function gastarCupo(uid, t) {
  const marcas = (cubos.get(uid) ?? []).filter((x) => t - x < VENTANA_MS);
  if (marcas.length >= TOPE_ESCRITURAS) {
    cubos.set(uid, marcas);
    return false;
  }
  marcas.push(t);
  cubos.set(uid, marcas);
  // El mapa no puede crecer sin fin en un aislado de larga vida.
  if (cubos.size > 500) {
    for (const [k, v] of cubos) {
      if (!v.length || t - v[v.length - 1] > VENTANA_MS) cubos.delete(k);
    }
  }
  return true;
}

// ── LA JERARQUÍA ────────────────────────────────────────────────────────────

/**
 * ¿Puede este administrador actuar sobre esta cuenta? Devuelve el motivo del
 * NO, o `null` si sí.
 *
 * La regla, en una frase: **nadie administra a un igual ni a un superior.**
 */
function motivoParaNoTocar(actorRol, objetivoRol, esUnoMismo = false, objetivoUid = null, entorno = null) {
  // El propietario configurado es intocable por UID, además de por rol: si sus
  // reclamos se corrompieran (rol borrado a medias) seguiría siendo él, y nadie
  // desde la aplicación podría apagarlo, cambiarle el correo o reponerle la
  // contraseña — es la cuenta de rescate (`99 §ADR-100`).
  const uidPropietario = typeof entorno?.PROPIETARIO_UID === 'string' ? entorno.PROPIETARIO_UID.trim() : '';
  if (uidPropietario && objetivoUid === uidPropietario) {
    return 'al propietario no lo toca la aplicación: es la cuenta de rescate';
  }
  if (objetivoRol === 'propietario') {
    return 'al propietario no lo toca la aplicación: es la cuenta de rescate';
  }
  // ⚠️ «UN IGUAL» NO INCLUYE A UNO MISMO. Bajarse el rol al nombrar sucesor, o
  // apagarse la propia cuenta al marcharse, son gestos legítimos y son
  // exactamente el caso en que la organización PUEDE quedarse sin nadie que
  // administre — para eso está el fusible de abajo, que es lo que de verdad lo
  // impide. Prohibirlo aquí además dejaría el fusible como código muerto: con la
  // autoridad comprobada contra el estado vivo, quien opera siempre es un
  // administrador activo, así que actuando sobre OTRO nunca se apaga la última
  // luz.
  if (objetivoRol === 'admin' && actorRol !== 'propietario' && !esUnoMismo) {
    return 'un administrador no gestiona a otro administrador: esto lo hace el propietario, o la herramienta';
  }
  return null;
}

/** Los roles que ESTA sesión puede repartir. La pantalla los usa para no mentir. */
const rolesQuePuedeAsignar = (actorRol) => (actorRol === 'propietario'
  ? [...ROLES_ASIGNABLES]
  : ROLES_ASIGNABLES.filter((r) => r !== 'admin'));

/** Rechaza y DEJA CONSTANCIA: un intento de saltarse la jerarquía es auditable. */
async function rechazar(ctx, codigo, motivo, sujeto = {}) {
  const bitacora = await auditar(ctx.google, {
    orgId: ctx.org, accion: 'rechazado', actorUid: ctx.actorUid, actorCorreo: ctx.actorCorreo,
    ...sujeto, motivo, ip: ctx.ip, en: new Date(ctx.ahora()).toISOString(),
  });
  return noPasa(motivo, codigo, ctx.cors, { bitacora });
}

/**
 * ¿Se quedaría la organización sin nadie que administre?
 *
 * Es el fusible que impide el fallo irreversible de este sistema: degradar o
 * apagar al último administrador deja a TODOS fuera de la administración, y
 * recuperarlo exige volver a la Mac del Ingeniero con la llave maestra.
 */
async function seQuedaSinAdministradores(ctx, uid) {
  const todas = await ctx.google.todasLasCuentas();
  const otros = todas.filter((c) => {
    if (c.localId === uid || c.disabled) return false;
    const claims = reclamosDeLaCuenta(c);
    return claims.orgId === ctx.org && ROLES_QUE_ADMINISTRAN.includes(claims.rol);
  });
  return otros.length === 0;
}

// ── GET /usuarios ───────────────────────────────────────────────────────────

/**
 * La lista, fusionando lo que dice Auth (la frontera) con el espejo de Firestore
 * (lo que la pantalla lee). Se devuelve además si los dos COINCIDEN: una fila
 * marcada como divergente es la que hay que reconciliar.
 *
 * ⚠️ NADA de lo que devuelve Google se copia entero: se toman los campos uno a
 * uno. `batchGet` trae también el hash de la contraseña y su sal, y un volcado
 * cómodo sería regalarlos.
 */
async function listar(ctx) {
  const cuentas = await ctx.google.todasLasCuentas();

  // Si el espejo no se puede leer, NO se disimula: todas las filas parecerían
  // «sin espejo» y quien administra saldría a reconciliar 20 cuentas sanas.
  let espejos = new Map();
  let espejoLegible = true;
  try {
    espejos = await ctx.google.listarColeccion('usuarios');
  } catch {
    espejoLegible = false;
  }

  const usuarios = [];
  const sinAprovisionar = [];
  for (const c of cuentas) {
    const claims = reclamosDeLaCuenta(c);
    // Cuentas de OTRA organización no se enseñan.
    if (claims.orgId && claims.orgId !== ctx.org) continue;

    const comun = {
      uid: c.localId,
      correo: c.email ?? '',
      nombre: c.displayName ?? '',
      activo: !c.disabled,
      // Con qué entra cada quien. Es lo que dice quién sigue dependiendo de
      // Google, que es justo lo que hay que saber para poder retirar ese botón.
      proveedores: (c.providerUserInfo ?? []).map((p) => p.providerId).filter(Boolean),
      ultimoAcceso: c.lastLoginAt ? new Date(Number(c.lastLoginAt)).toISOString() : null,
      creadaEn: c.createdAt ? new Date(Number(c.createdAt)).toISOString() : null,
    };

    // Una cuenta sin `orgId` y sin rol no es una persona del sistema: es lo que
    // el rescate de la bóveda llama una cuenta sin aprovisionar. Va aparte para
    // que la tabla de personas no tenga que dibujar filas a medias, y va — no se
    // esconde — porque verla es justo el trabajo.
    if (!claims.orgId || !claims.rol) {
      sinAprovisionar.push(comun);
      continue;
    }

    const implicado = perfilDesdeReclamos(c, claims);
    const espejo = espejos.get(c.localId) ?? null;
    usuarios.push({
      ...comun,
      rol: claims.rol,
      funcionesExtra: implicado.funcionesExtra,
      funcionesQuitadas: implicado.funcionesQuitadas,
      // Calculadas por el trabajador con la MISMA función del catálogo que usa
      // la pantalla: si algún día no coinciden, es que una de las dos capas dejó
      // de leer el catálogo.
      funcionesEfectivas: funcionesDeReclamos(claims),
      lineas: implicado.lineas,
      contrasenaProvisionalPendiente: claims.passwordProvisional === true,
      contrasenaOrdenadaEn: claims.contrasenaOrdenadaEn ?? null,
      // El espejo y el token no dicen lo mismo: hay que reconciliar. Con el
      // espejo ilegible no se afirma nada, porque no se sabe.
      desincronizado: espejoLegible ? !(espejo && mismosEjes(espejo, implicado)) : false,
      espejo: !espejoLegible ? 'desconocido' : (!espejo ? 'falta' : (mismosEjes(espejo, implicado) ? 'ok' : 'divergente')),
      perfil: espejo,
    });
  }
  const porCorreo = (a, b) => String(a.correo).localeCompare(String(b.correo));
  usuarios.sort(porCorreo);
  sinAprovisionar.sort(porCorreo);

  return responder({
    ok: true,
    total: usuarios.length,
    espejoLegible,
    // Para que la pantalla no ofrezca lo que este trabajador va a rechazar: un
    // botón que el servidor deniega no es más seguro ni menos, es MENTIROSO.
    puedeAsignar: rolesQuePuedeAsignar(ctx.actorRol),
    usuarios,
    sinAprovisionar,
  }, 200, ctx.cors);
}

// ── POST /usuarios ──────────────────────────────────────────────────────────

async function alta(ctx, cuerpo) {
  const rol = cuerpo.rol;
  const sujeto = { sujetoCorreo: typeof cuerpo.correo === 'string' ? cuerpo.correo : undefined };

  if (rol === 'propietario') {
    return rechazar(ctx, 403,
      'el propietario no se crea desde la aplicación: nace en la consola de Firebase y lo reconoce /bootstrap',
      sujeto);
  }
  if (!ROLES_ASIGNABLES.includes(rol)) {
    return rechazar(ctx, 400, `rol no válido: ${rol ?? '(ninguno)'}`, sujeto);
  }
  if (!rolesQuePuedeAsignar(ctx.actorRol).includes(rol)) {
    return rechazar(ctx, 403,
      'nombrar administradores es del propietario: un administrador da de alta editores, cuadrillas y auditores', sujeto);
  }

  const extras = exigirFunciones(cuerpo.funcionesExtra, 'funcionesExtra');
  const noDelegable = extras.find((f) => !FUNCIONES[f].delegable);
  if (noDelegable) {
    // El catálogo ya las ignoraría en silencio. Se responde igualmente, porque
    // una pantalla que ofrece algo y un servidor que lo tira sin decirlo dejan a
    // quien administra creyendo que dio un permiso que no dio.
    return rechazar(ctx, 400, `la función «${noDelegable}» no se delega: no se puede añadir a nadie`, sujeto);
  }
  const quitadas = exigirFunciones(cuerpo.funcionesQuitadas, 'funcionesQuitadas');
  const modo = cuerpo.modo;
  if (modo !== 'enlace' && modo !== 'contrasena') {
    throw new FalloConCodigo(400, "el modo de alta tiene que ser 'enlace' o 'contrasena'");
  }

  const en = new Date(ctx.ahora()).toISOString();
  const propuesta = {
    orgId: ctx.org,
    correo: typeof cuerpo.correo === 'string' ? cuerpo.correo.trim().toLowerCase() : '',
    nombre: typeof cuerpo.nombre === 'string' && cuerpo.nombre.trim()
      ? cuerpo.nombre.trim() : String(cuerpo.correo ?? ''),
    rol,
    funcionesExtra: extras,
    funcionesQuitadas: quitadas,
    ...(cuerpo.lineas === undefined ? {} : { lineas: cuerpo.lineas }),
    activo: true,
    creadoEn: en,
    creadoPor: ctx.actorUid,
  };
  // El molde manda: si esto no valida, no se crea nada en ninguna parte.
  const revision = PerfilDeUsuario.safeParse(propuesta);
  if (!revision.success) {
    const detalle = revision.error.issues.map((i) => `${i.path.join('.') || 'dato'}: ${i.message}`).join(' · ');
    return rechazar(ctx, 400, `los datos no cumplen el molde — ${detalle}`, sujeto);
  }
  const perfil = revision.data;

  // La contraseña, antes de tocar nada: rechazarla después de crear la cuenta
  // dejaría una cuenta a medias por un dato que se sabía malo desde el principio.
  let contrasena;
  if (modo === 'contrasena') {
    const fallos = defectosDeContrasena(cuerpo.contrasena ?? '', perfil.correo);
    if (fallos.length) return rechazar(ctx, 400, `contraseña rechazada: ${fallos.join(' · ')}`, sujeto);
    contrasena = cuerpo.contrasena;
  } else {
    contrasena = contrasenaQueNadieVe();
  }

  // Los reclamos se calculan ANTES de crear: si no caben en el token, es mejor
  // saberlo ahora que dejar una cuenta viva sin permisos.
  let reclamos;
  try {
    reclamos = reclamosDe({
      ...perfil,
      ...(modo === 'contrasena' ? { passwordProvisional: true, contrasenaOrdenadaEn: en } : {}),
    });
  } catch (e) {
    return rechazar(ctx, 400, e.message, sujeto);
  }

  // ── El orden: cuenta → reclamos → espejo → bitácora ────────────────────
  const uid = await ctx.google.crearCuenta({
    correo: perfil.correo, contrasena, nombre: perfil.nombre,
  });
  const hecho = ['cuenta creada'];

  try {
    await ctx.google.actualizarCuenta({ localId: uid, customAttributes: JSON.stringify(reclamos) });
    hecho.push('permisos escritos');
  } catch (e) {
    // Una credencial viva sin permisos es inerte (las reglas exigen `orgId`),
    // pero existe y puede entrar. Se apaga, y se dice exactamente qué quedó
    // hecho y qué no: un 200 a medias sería mentira.
    let apagada = false;
    try {
      await ctx.google.actualizarCuenta({ localId: uid, disableUser: true });
      apagada = true;
    } catch { /* si tampoco esto se puede, se dice abajo */ }
    await auditar(ctx.google, {
      orgId: ctx.org, accion: 'rechazado', actorUid: ctx.actorUid, actorCorreo: ctx.actorCorreo,
      sujetoUid: uid, sujetoCorreo: perfil.correo,
      motivo: `alta a medias: la cuenta se creó y los permisos no (${e.motivo ?? e.message})`,
      ip: ctx.ip, en,
    });
    return noPasa(
      `la cuenta se creó pero no se le pudieron escribir los permisos: ${e.motivo ?? e.message}`,
      500, ctx.cors,
      { uid, hecho, pendiente: ['permisos', 'espejo'], cuentaApagada: apagada });
  }

  let espejo = 'ok';
  try {
    await ctx.google.escribirDocumento(`usuarios/${uid}`, perfil);
    hecho.push('espejo escrito');
  } catch {
    // El espejo es para la pantalla; la frontera es el token, y ya está bien
    // puesto. Se avisa y se sigue: `reconciliar` lo repara sin tocar permisos.
    espejo = 'falta';
  }

  let enlace = null;
  if (modo === 'enlace') enlace = await ctx.google.enlaceDeContrasena(perfil.correo);

  const bitacora = await auditar(ctx.google, {
    orgId: ctx.org, accion: 'alta', actorUid: ctx.actorUid, actorCorreo: ctx.actorCorreo,
    sujetoUid: uid, sujetoCorreo: perfil.correo,
    despues: { rol: perfil.rol, funciones: reclamos.f, lineas: reclamos.l, modo },
    ip: ctx.ip, en,
  });
  salud.operaciones += 1;

  // ⚠️ Del modo 'enlace' sale un enlace, NUNCA la contraseña: la que nació con la
  // cuenta son 256 bits de azar que no se devuelven, no se registran y nadie ve.
  return responder({
    ok: true, uid, perfil, rol: perfil.rol, espejo, bitacora,
    ...(enlace ? { enlace } : {}),
  }, 201, ctx.cors);
}

// ── PATCH /usuarios/:uid ────────────────────────────────────────────────────

async function corregir(ctx, uid, cuerpo) {
  const [cuentaObjetivo] = await ctx.google.consultarCuentas({ uids: [uid] });
  if (!cuentaObjetivo) throw new FalloConCodigo(404, 'no existe esa persona');
  const claims = reclamosDeLaCuenta(cuentaObjetivo);
  const sujeto = { sujetoUid: uid, sujetoCorreo: cuentaObjetivo.email ?? undefined };

  const veto = motivoParaNoTocar(ctx.actorRol, claims.rol, uid === ctx.actorUid, uid, ctx.entorno);
  if (veto) return rechazar(ctx, 403, veto, sujeto);

  const antesPerfil = (await ctx.google.leerDocumento(`usuarios/${uid}`))
    ?? (claims.orgId ? perfilDesdeReclamos(cuentaObjetivo, claims) : null);
  if (!antesPerfil || !claims.rol) {
    throw new FalloConCodigo(409,
      'esa cuenta no está aprovisionada: no tiene permisos que corregir. Déle de alta');
  }

  const nuevoRol = cuerpo.rol ?? antesPerfil.rol;
  if (cuerpo.rol !== undefined) {
    if (nuevoRol === 'propietario') {
      return rechazar(ctx, 403, 'el propietario no se nombra desde la aplicación: es de un solo uso, por /bootstrap', sujeto);
    }
    if (!ROLES_ASIGNABLES.includes(nuevoRol)) {
      return rechazar(ctx, 400, `rol no válido: ${nuevoRol}`, sujeto);
    }
    if (!rolesQuePuedeAsignar(ctx.actorRol).includes(nuevoRol)) {
      return rechazar(ctx, 403, 'nombrar administradores es del propietario', sujeto);
    }
  }

  const extras = cuerpo.funcionesExtra === undefined
    ? antesPerfil.funcionesExtra ?? [] : exigirFunciones(cuerpo.funcionesExtra, 'funcionesExtra');
  const noDelegable = extras.find((f) => !FUNCIONES[f].delegable);
  if (noDelegable) {
    return rechazar(ctx, 400, `la función «${noDelegable}» no se delega: no se puede añadir a nadie`, sujeto);
  }
  const quitadas = cuerpo.funcionesQuitadas === undefined
    ? antesPerfil.funcionesQuitadas ?? [] : exigirFunciones(cuerpo.funcionesQuitadas, 'funcionesQuitadas');

  const en = new Date(ctx.ahora()).toISOString();
  const propuesta = {
    ...antesPerfil,
    rol: nuevoRol,
    nombre: cuerpo.nombre === undefined ? antesPerfil.nombre : cuerpo.nombre,
    funcionesExtra: extras,
    funcionesQuitadas: quitadas,
    lineas: cuerpo.lineas === undefined ? antesPerfil.lineas : cuerpo.lineas,
    orgId: ctx.org,
    correo: antesPerfil.correo || cuentaObjetivo.email || '',
    activo: !cuentaObjetivo.disabled,
    creadoEn: antesPerfil.creadoEn ?? en,
    creadoPor: antesPerfil.creadoPor ?? ctx.actorUid,
    actualizadoEn: en,
    actualizadoPor: ctx.actorUid,
  };
  const revision = PerfilDeUsuario.safeParse(propuesta);
  if (!revision.success) {
    const detalle = revision.error.issues.map((i) => `${i.path.join('.') || 'dato'}: ${i.message}`).join(' · ');
    return rechazar(ctx, 400, `los datos no cumplen el molde — ${detalle}`, sujeto);
  }
  const perfil = revision.data;

  // El fusible: solo si el cambio le quita la capacidad de administrar.
  const eraAdministrador = ROLES_QUE_ADMINISTRAN.includes(antesPerfil.rol);
  const sigueAdministrando = ROLES_QUE_ADMINISTRAN.includes(perfil.rol);
  if (eraAdministrador && !sigueAdministrando && await seQuedaSinAdministradores(ctx, uid)) {
    return rechazar(ctx, 409,
      'es la última persona activa que puede administrar: si se le quita el rol, nadie podría volver a dar permisos desde la aplicación',
      sujeto);
  }

  let reclamos;
  try {
    reclamos = reclamosDe({
      ...perfil,
      // Una orden de contraseña provisional pendiente NO se pierde por cambiarle
      // el rol a alguien: eso volvería definitiva una contraseña provisional.
      ...(claims.passwordProvisional === true
        ? { passwordProvisional: true, contrasenaOrdenadaEn: claims.contrasenaOrdenadaEn }
        : {}),
    });
  } catch (e) {
    return rechazar(ctx, 400, e.message, sujeto);
  }

  await ctx.google.actualizarCuenta({
    localId: uid,
    customAttributes: JSON.stringify(reclamos),
    ...(cuerpo.nombre === undefined ? {} : { displayName: perfil.nombre }),
    // SIN ESTO el permiso viejo sigue vivo hasta una hora: escribir reclamos no
    // invalida los tokens ya emitidos. Es el fallo más común de los sistemas con
    // reclamos, y aquí el rol decide quién escribe sobre un activo.
    validSince: String(Math.floor(ctx.ahora() / 1000)),
  });

  let espejo = 'ok';
  try {
    await ctx.google.escribirDocumento(`usuarios/${uid}`, {
      orgId: perfil.orgId, correo: perfil.correo, nombre: perfil.nombre, rol: perfil.rol,
      funcionesExtra: perfil.funcionesExtra, funcionesQuitadas: perfil.funcionesQuitadas,
      lineas: perfil.lineas, activo: perfil.activo,
      actualizadoEn: en, actualizadoPor: ctx.actorUid,
    });
  } catch {
    espejo = 'divergente';
  }

  // Una entrada por EJE cambiado, con su antes y su después. Un cambio de nombre
  // no tiene acción en la lista cerrada del catálogo, y la lista no se amplía
  // desde aquí: añadir una acción auditable es una decisión, no un trámite.
  const eventos = [];
  const antesFunciones = [
    ...(antesPerfil.funcionesExtra ?? []), '|', ...(antesPerfil.funcionesQuitadas ?? []),
  ].join(',');
  const despuesFunciones = [...perfil.funcionesExtra, '|', ...perfil.funcionesQuitadas].join(',');
  if (antesPerfil.rol !== perfil.rol) {
    eventos.push({ accion: 'rol_cambiado', antes: { rol: antesPerfil.rol }, despues: { rol: perfil.rol } });
  }
  if (antesFunciones !== despuesFunciones) {
    eventos.push({
      accion: 'funciones_cambiadas',
      antes: { extra: antesPerfil.funcionesExtra ?? [], quitadas: antesPerfil.funcionesQuitadas ?? [] },
      despues: { extra: perfil.funcionesExtra, quitadas: perfil.funcionesQuitadas },
    });
  }
  if (JSON.stringify(antesPerfil.lineas ?? []) !== JSON.stringify(perfil.lineas)) {
    eventos.push({ accion: 'alcance_cambiado', antes: { lineas: antesPerfil.lineas ?? [] }, despues: { lineas: perfil.lineas } });
  }

  let bitacora = eventos.length ? 'ok' : 'omitida';
  for (const ev of eventos) {
    const r = await auditar(ctx.google, {
      orgId: ctx.org, accion: ev.accion, actorUid: ctx.actorUid, actorCorreo: ctx.actorCorreo,
      ...sujeto, antes: ev.antes, despues: ev.despues, ip: ctx.ip, en,
    });
    if (r === 'fallo') bitacora = 'fallo';
  }
  salud.operaciones += 1;

  return responder({ ok: true, uid, perfil, espejo, bitacora, cambios: eventos.map((e) => e.accion) }, 200, ctx.cors);
}

// ── POST /usuarios/:uid/deshabilitar ────────────────────────────────────────

/**
 * Apagar a alguien SIEMPRE toca Auth. «Un documento no es una credencial»: poner
 * `activo: false` en el espejo y quedarse ahí dejaría a la persona entrando con
 * total normalidad, con la pantalla diciendo que está fuera.
 */
async function deshabilitar(ctx, uid) {
  const [cuentaObjetivo] = await ctx.google.consultarCuentas({ uids: [uid] });
  if (!cuentaObjetivo) throw new FalloConCodigo(404, 'no existe esa persona');
  const claims = reclamosDeLaCuenta(cuentaObjetivo);
  const sujeto = { sujetoUid: uid, sujetoCorreo: cuentaObjetivo.email ?? undefined };

  const veto = motivoParaNoTocar(ctx.actorRol, claims.rol, uid === ctx.actorUid, uid, ctx.entorno);
  if (veto) return rechazar(ctx, 403, veto, sujeto);

  if (ROLES_QUE_ADMINISTRAN.includes(claims.rol) && await seQuedaSinAdministradores(ctx, uid)) {
    return rechazar(ctx, 409,
      'es la última persona activa que puede administrar: apagarla dejaría la organización sin nadie que pueda dar permisos', sujeto);
  }

  const en = new Date(ctx.ahora()).toISOString();

  // ⚠️ EL ESPEJO SE COMPLETA **ANTES** DE VACIAR LOS PERMISOS, y ése es el punto
  // delicado de esta operación: apagar borra del token el rol, las funciones y el
  // alcance, así que después ya no hay de dónde sacarlos. Si el espejo estuviera
  // incompleto —o no existiera— la persona quedaría apagada y sin constancia de
  // qué tenía, y restituirla obligaría a adivinar. Adivinando, un alcance de una
  // sola línea se convierte en «todas»: se ensancha el permiso por el camino de
  // recuperarlo. Por eso aquí se escribe el perfil ENTERO, no un `activo: false`.
  let espejo = 'ok';
  if (claims.orgId && claims.rol) {
    try {
      const guardado = await ctx.google.leerDocumento(`usuarios/${uid}`);
      const completo = PerfilDeUsuario.safeParse({
        ...perfilDesdeReclamos(cuentaObjetivo, claims),
        activo: false,
        creadoEn: guardado?.creadoEn ?? en,
        creadoPor: guardado?.creadoPor ?? ctx.actorUid,
        actualizadoEn: en,
        actualizadoPor: ctx.actorUid,
      });
      if (!completo.success) throw new Error('el perfil no cumple el molde');
      await ctx.google.escribirDocumento(`usuarios/${uid}`, completo.data);
    } catch {
      espejo = 'divergente';
    }
  }

  await ctx.google.actualizarCuenta({
    localId: uid,
    disableUser: true,
    // Reclamos vaciados de poder: sin funciones y sin alcance. Si algún día la
    // cuenta se reactivara por otra vía, no vuelve con permisos puestos.
    //
    // ⚠️ A una cuenta que NO estaba aprovisionada no se le escribe nada: darle
    // `orgId` al apagarla sería, literalmente, aprovisionar a la intrusa que se
    // está cerrando — y `orgId` es lo que las reglas miran para dejar leer.
    customAttributes: JSON.stringify(
      claims.orgId ? { orgId: claims.orgId, rol: claims.rol, f: [], l: [] } : {},
    ),
    validSince: String(Math.floor(ctx.ahora() / 1000)),
  });

  const bitacora = await auditar(ctx.google, {
    orgId: ctx.org, accion: 'deshabilitado', actorUid: ctx.actorUid, actorCorreo: ctx.actorCorreo,
    ...sujeto, antes: { activo: true, rol: claims.rol }, despues: { activo: false }, ip: ctx.ip, en,
  });
  salud.operaciones += 1;
  return responder({ ok: true, uid, activo: false, espejo, bitacora }, 200, ctx.cors);
}

// ── POST /usuarios/:uid/restituir ───────────────────────────────────────────

async function restituir(ctx, uid) {
  const [cuentaObjetivo] = await ctx.google.consultarCuentas({ uids: [uid] });
  if (!cuentaObjetivo) throw new FalloConCodigo(404, 'no existe esa persona');
  const claims = reclamosDeLaCuenta(cuentaObjetivo);
  const sujeto = { sujetoUid: uid, sujetoCorreo: cuentaObjetivo.email ?? undefined };

  const veto = motivoParaNoTocar(ctx.actorRol, claims.rol, uid === ctx.actorUid, uid, ctx.entorno);
  if (veto) return rechazar(ctx, 403, veto, sujeto);

  // Al apagar se vacían las funciones, así que los permisos NO se pueden
  // reconstruir desde el token: se reconstruyen desde el espejo. Si no hay
  // espejo, no se adivina — se dice qué hacer.
  const espejoGuardado = await ctx.google.leerDocumento(`usuarios/${uid}`);
  if (!espejoGuardado || !espejoGuardado.rol) {
    throw new FalloConCodigo(409,
      'no queda constancia de qué permisos tenía esta persona: asígnele rol con una corrección (PATCH) y quedará restituida');
  }

  const en = new Date(ctx.ahora()).toISOString();
  const propuesta = {
    ...espejoGuardado,
    orgId: ctx.org,
    correo: espejoGuardado.correo || cuentaObjetivo.email || '',
    activo: true,
    creadoEn: espejoGuardado.creadoEn ?? en,
    creadoPor: espejoGuardado.creadoPor ?? ctx.actorUid,
    actualizadoEn: en,
    actualizadoPor: ctx.actorUid,
  };
  const revision = PerfilDeUsuario.safeParse(propuesta);
  if (!revision.success) {
    throw new FalloConCodigo(409, 'el perfil guardado no cumple el molde: reconcilie o corrija antes de restituir');
  }
  const perfil = revision.data;
  const veto2 = motivoParaNoTocar(ctx.actorRol, perfil.rol, uid === ctx.actorUid, uid, ctx.entorno);
  if (veto2) return rechazar(ctx, 403, veto2, sujeto);

  const reclamos = reclamosDe({
    ...perfil,
    ...(claims.passwordProvisional === true
      ? { passwordProvisional: true, contrasenaOrdenadaEn: claims.contrasenaOrdenadaEn } : {}),
  });

  await ctx.google.actualizarCuenta({
    localId: uid, disableUser: false, customAttributes: JSON.stringify(reclamos),
    validSince: String(Math.floor(ctx.ahora() / 1000)),
  });

  let espejo = 'ok';
  try {
    await ctx.google.escribirDocumento(`usuarios/${uid}`,
      { activo: true, actualizadoEn: en, actualizadoPor: ctx.actorUid });
  } catch { espejo = 'divergente'; }

  const bitacora = await auditar(ctx.google, {
    orgId: ctx.org, accion: 'restituido', actorUid: ctx.actorUid, actorCorreo: ctx.actorCorreo,
    ...sujeto, antes: { activo: false }, despues: { activo: true, rol: perfil.rol, funciones: reclamos.f },
    ip: ctx.ip, en,
  });
  salud.operaciones += 1;
  return responder({ ok: true, uid, activo: true, perfil, espejo, bitacora }, 200, ctx.cors);
}

// ── POST /usuarios/:uid/contrasena ──────────────────────────────────────────

async function reponerContrasena(ctx, uid, cuerpo) {
  const [cuentaObjetivo] = await ctx.google.consultarCuentas({ uids: [uid] });
  if (!cuentaObjetivo) throw new FalloConCodigo(404, 'no existe esa persona');
  const claims = reclamosDeLaCuenta(cuentaObjetivo);
  const sujeto = { sujetoUid: uid, sujetoCorreo: cuentaObjetivo.email ?? undefined };

  // Reponerle la contraseña a un igual es apoderarse de su cuenta: por eso esto
  // sigue la misma jerarquía que el resto.
  const veto = motivoParaNoTocar(ctx.actorRol, claims.rol, uid === ctx.actorUid, uid, ctx.entorno);
  if (veto) return rechazar(ctx, 403, veto, sujeto);

  const correo = cuentaObjetivo.email;
  if (!correo) throw new FalloConCodigo(409, 'esa cuenta no tiene correo: no se le puede poner contraseña');

  const en = new Date(ctx.ahora()).toISOString();
  const modo = cuerpo.modo;

  if (modo === 'enlace') {
    const enlace = await ctx.google.enlaceDeContrasena(correo);
    const bitacora = await auditar(ctx.google, {
      orgId: ctx.org, accion: 'enlace_emitido', actorUid: ctx.actorUid, actorCorreo: ctx.actorCorreo,
      ...sujeto, ip: ctx.ip, en,
    });
    salud.operaciones += 1;
    return responder({ ok: true, uid, enlace, bitacora }, 200, ctx.cors);
  }

  if (modo !== 'contrasena') {
    throw new FalloConCodigo(400, "el modo tiene que ser 'enlace' o 'contrasena'");
  }

  const fallos = defectosDeContrasena(cuerpo.contrasena ?? '', correo);
  if (fallos.length) return rechazar(ctx, 400, `contraseña rechazada: ${fallos.join(' · ')}`, sujeto);

  // Nace PROVISIONAL y con fecha: quien no teclea su propia contraseña tiene que
  // cambiarla al entrar, y la fecha es lo que hace que una reposición NUEVA
  // vuelva a exigirse aunque haya un recibo viejo (`contratos/src/acceso.ts`).
  const reclamos = { ...claims, passwordProvisional: true, contrasenaOrdenadaEn: en };
  await ctx.google.actualizarCuenta({
    localId: uid,
    password: cuerpo.contrasena,
    customAttributes: JSON.stringify(reclamos),
    validSince: String(Math.floor(ctx.ahora() / 1000)),
  });

  const bitacora = await auditar(ctx.google, {
    orgId: ctx.org, accion: 'contrasena_repuesta', actorUid: ctx.actorUid, actorCorreo: ctx.actorCorreo,
    ...sujeto, despues: { passwordProvisional: true }, ip: ctx.ip, en,
  });
  salud.operaciones += 1;
  // La contraseña NO vuelve en la respuesta: la tecleó quien administra y ya la tiene.
  return responder({ ok: true, uid, passwordProvisional: true, sesionesRevocadas: true, bitacora }, 200, ctx.cors);
}

// ── POST /usuarios/:uid/reconciliar ─────────────────────────────────────────

/**
 * Rehace el espejo desde los reclamos REALES. Convergente: lee el estado real,
 * compara, y escribe solo si difiere.
 *
 * ⚠️ La dirección no es negociable: **del token al espejo, nunca al revés.** El
 * token es la frontera —es lo que las reglas leen— y el espejo es una copia para
 * la pantalla. Reconciliar al revés convertiría un documento editable en la
 * fuente del permiso.
 */
async function reconciliar(ctx, uid) {
  const [cuentaObjetivo] = await ctx.google.consultarCuentas({ uids: [uid] });
  if (!cuentaObjetivo) throw new FalloConCodigo(404, 'no existe esa persona');
  const claims = reclamosDeLaCuenta(cuentaObjetivo);
  const sujeto = { sujetoUid: uid, sujetoCorreo: cuentaObjetivo.email ?? undefined };

  // ⚠️ EL PROPIETARIO TAMBIÉN ES INTOCABLE AQUÍ, y era la ÚNICA ruta con `:uid`
  // a la que le faltaba el veto. Reconciliar es convergente —del token al
  // espejo— así que no puede SUBIRLE el permiso a nadie; pero sigue siendo una
  // escritura sobre `usuarios/{propietario}` firmada por otra persona
  // (`actualizadoPor`), y el veredicto del comité no dejó ni una operación de la
  // aplicación con el propietario de sujeto (`99 §ADR-100`). Su reparación tiene
  // camino propio y más estrecho —`POST /bootstrap`: ser él, con contraseña
  // tecleada hace menos de cinco minutos— y, si el trabajador no responde, el
  // rescate de la bóveda. Rechazar aquí no le quita ninguna salida.
  const veto = motivoParaNoTocar(ctx.actorRol, claims.rol, uid === ctx.actorUid, uid, ctx.entorno);
  if (veto) return rechazar(ctx, 403, veto, sujeto);

  if (!claims.orgId || !claims.rol) {
    throw new FalloConCodigo(409,
      'esa cuenta no tiene permisos que reflejar: está sin aprovisionar. Déle de alta, corríjala o apáguela');
  }
  if (claims.orgId !== ctx.org) throw new FalloConCodigo(403, 'esa cuenta es de otra organización');
  // ⚠️ Una cuenta apagada tiene los permisos VACIADOS a propósito, y eso no es un
  // perfil: es la ausencia de uno. Reflejarlo escribiría un alcance vacío, que el
  // molde no admite, y la única forma de expresarlo sería «todas las líneas» —
  // ensanchar el permiso justo al recuperarlo. Se para aquí y se dice.
  if (cuentaObjetivo.disabled && !(claims.f ?? []).length) {
    throw new FalloConCodigo(409,
      'esa cuenta está apagada y sus permisos están vaciados a propósito: no hay nada que reflejar. Restitúyala o corríjala');
  }

  const en = new Date(ctx.ahora()).toISOString();
  const guardado = await ctx.google.leerDocumento(`usuarios/${uid}`);
  const implicado = perfilDesdeReclamos(cuentaObjetivo, claims);
  const cambios = !guardado || !mismosEjes(guardado, implicado);

  if (cambios) {
    const revision = PerfilDeUsuario.safeParse({
      ...implicado,
      creadoEn: guardado?.creadoEn ?? en,
      creadoPor: guardado?.creadoPor ?? ctx.actorUid,
      actualizadoEn: en,
      actualizadoPor: ctx.actorUid,
    });
    if (!revision.success) {
      throw new FalloConCodigo(500, 'los permisos reales no se pueden expresar como perfil: revise los reclamos de esa cuenta');
    }
    await ctx.google.escribirDocumento(`usuarios/${uid}`, revision.data);
  }

  const bitacora = await auditar(ctx.google, {
    orgId: ctx.org, accion: 'reconciliado', actorUid: ctx.actorUid, actorCorreo: ctx.actorCorreo,
    ...sujeto,
    antes: guardado ? soloEjes(guardado) : { espejo: 'no existía' },
    despues: { ...soloEjes(implicado), cambios },
    ip: ctx.ip, en,
  });
  salud.operaciones += 1;
  return responder({ ok: true, uid, cambios, perfil: implicado, bitacora }, 200, ctx.cors);
}

// ── POST /bootstrap ─────────────────────────────────────────────────────────

/**
 * EL ARRANQUE DEL PROPIETARIO, de un solo uso (`99 §ADR-100`).
 *
 * El comité del delta tumbó el primer diseño con tres golpes que aquí están
 * cerrados uno a uno:
 *   1. Se anclaba a un CORREO publicado en un repositorio público → ahora se
 *      ancla al UID que la consola enseña al crear la cuenta (`PROPIETARIO_UID`).
 *   2. «Comprobar que no hay propietario» y «estampar» eran dos pasos → ahora es
 *      UNA escritura con precondición «solo si no existe» en `config/arranque`.
 *   3. Con la variable ausente, `undefined === undefined` coronaba a cualquiera →
 *      ahora falla CERRADO (503) si falta cualquiera de las dos variables.
 *
 * Y dos cerrojos más: la sesión tiene que venir de CONTRASEÑA (no de un
 * proveedor federado) y ser RECIENTE (cinco minutos desde que se tecleó).
 *
 * Idempotente por diseño: si `config/arranque` ya existe y quien llama ES ese
 * uid, se REPARAN sus reclamos y se devuelve 200 `reparado`. Cualquier otro uid
 * recibe 409 para siempre — rearmar exige borrar el documento a mano.
 */
async function arrancar(ctx, sesion, entorno) {
  const uidPropietario = typeof entorno.PROPIETARIO_UID === 'string' ? entorno.PROPIETARIO_UID.trim() : '';
  if (!uidPropietario) {
    return noPasa('el arranque no está configurado (falta PROPIETARIO_UID): no se arranca nada', 503, ctx.cors);
  }
  const proveedor = sesion?.firebase?.sign_in_provider;
  if (proveedor !== 'password') {
    return noPasa('el arranque exige haber entrado con correo y contraseña', 403, ctx.cors);
  }
  const authTime = Number(sesion.auth_time);
  const ahoraS = Math.floor(ctx.ahora() / 1000);
  if (!Number.isFinite(authTime) || ahoraS - authTime > SESION_RECIENTE_S) {
    return noPasa('el arranque exige una sesión reciente: salga, vuelva a entrar y pulse de nuevo', 403, ctx.cors);
  }
  if (sesion.sub !== uidPropietario) {
    // Se audita: un intento de arrancar con otra cuenta es justo lo que hay que ver.
    return rechazar(ctx, 403, 'esta cuenta no es la del propietario configurado', {});
  }

  const en = new Date(ctx.ahora()).toISOString();
  const [cuenta] = await ctx.google.consultarCuentas({ uids: [sesion.sub] });
  if (!cuenta) throw new FalloConCodigo(404, 'esta sesión no corresponde a ninguna cuenta');
  if (cuenta.disabled) throw new FalloConCodigo(403, 'la cuenta del propietario está apagada');

  const reclamos = reclamosDe({ orgId: ctx.org, rol: 'propietario', lineas: [TODAS_LAS_LINEAS] });
  const perfil = PerfilDeUsuario.parse({
    orgId: ctx.org,
    correo: cuenta.email ?? `${sesion.sub}@sin-correo.invalid`,
    nombre: cuenta.displayName || cuenta.email || 'propietario',
    rol: 'propietario', funcionesExtra: [], funcionesQuitadas: [], lineas: [TODAS_LAS_LINEAS],
    activo: true, creadoEn: en, creadoPor: sesion.sub,
  });

  // ── El cerrojo, ANTES de escribir ningún reclamo ──────────────────────────
  let reparado = false;
  try {
    await ctx.google.escribirSiNoExiste(ARRANQUE, { propietarioUid: sesion.sub, orgId: ctx.org, en });
  } catch (e) {
    if (!(e instanceof FalloConCodigo && e.codigo === 409)) throw e;
    const marca = await ctx.google.leerDocumento(ARRANQUE);
    if (!marca || marca.propietarioUid !== sesion.sub) {
      return noPasa('el sistema ya tiene propietario: el arranque es de un solo uso', 409, ctx.cors, { arrancado: true });
    }
    reparado = true;
  }

  await ctx.google.actualizarCuenta({
    localId: sesion.sub, customAttributes: JSON.stringify(reclamos),
    // Se corta la sesión con la que se arrancó: la siguiente ya trae los reclamos.
    validSince: String(ahoraS),
  });
  let espejo = 'ok';
  try {
    await ctx.google.escribirDocumento(`usuarios/${sesion.sub}`, {
      ...perfil, ...(reparado ? { actualizadoEn: en, actualizadoPor: sesion.sub } : {}),
    });
  } catch { espejo = 'falta'; }

  const bitacora = await auditar(ctx.google, {
    orgId: ctx.org, accion: 'bootstrap', actorUid: sesion.sub, actorCorreo: cuenta.email ?? undefined,
    sujetoUid: sesion.sub, despues: { rol: 'propietario', funciones: reclamos.f, lineas: reclamos.l, reparado },
    ip: ctx.ip, en,
  });
  salud.operaciones += 1;
  return responder({ ok: true, uid: sesion.sub, reparado, reclamos, espejo, bitacora }, 200, ctx.cors);
}

// ── /limpieza-inicial ───────────────────────────────────────────────────────

/**
 * Solo el propietario, comprobado contra el ESTADO VIVO y contra el uid
 * configurado — las dos cosas. Un token que diga «propietario» no basta.
 */
async function exigirPropietario(ctx, sesion, entorno) {
  const uidPropietario = typeof entorno.PROPIETARIO_UID === 'string' ? entorno.PROPIETARIO_UID.trim() : '';
  if (!uidPropietario) return noPasa('no está configurado el propietario (PROPIETARIO_UID)', 503, ctx.cors);
  if (sesion.sub !== uidPropietario) return rechazar(ctx, 403, 'la limpieza inicial es solo del propietario', {});
  const [propia] = await ctx.google.consultarCuentas({ uids: [sesion.sub] });
  if (!propia || propia.disabled) return noPasa('esta sesión pertenece a una cuenta apagada', 403, ctx.cors);
  if (reclamosDeLaCuenta(propia).rol !== 'propietario') {
    return rechazar(ctx, 403, 'la cuenta configurada como propietario todavía no ha arrancado', {});
  }
  ctx.actorRol = 'propietario';
  ctx.actorCorreo = propia.email ?? ctx.actorCorreo;
  return null;
}

/** Las cuentas que la limpieza tocaría: todas menos el propietario y quien llama. */
async function candidatasALimpieza(ctx, sesion, entorno) {
  const uidPropietario = entorno.PROPIETARIO_UID.trim();
  const todas = await ctx.google.todasLasCuentas();
  return todas
    .filter((c) => c.localId !== uidPropietario && c.localId !== sesion.sub)
    .map((c) => {
      const claims = reclamosDeLaCuenta(c);
      return {
        uid: c.localId,
        correo: enmascarar(c.email),
        proveedores: (c.providerUserInfo ?? []).map((p) => p.providerId).filter(Boolean),
        deshabilitada: !!c.disabled,
        rol: claims.rol ?? 'ninguno',
        creadaEn: c.createdAt ? new Date(Number(c.createdAt)).toISOString() : null,
        // Lo que va a la lápida. No se enseña: se escribe.
        _correo: c.email ?? '', _nombre: c.displayName ?? '',
      };
    })
    .sort((a, b) => a.uid.localeCompare(b.uid));
}

/**
 * EL ENSAYO. Devuelve la lista exacta de lo que se borraría y deja constancia
 * en la bitácora. El borrado real exige devolver esta misma lista.
 */
async function simularLimpieza(ctx, sesion, entorno) {
  const hecho = await ctx.google.leerDocumento(LIMPIEZA);
  if (hecho?.hecho === true) return noPasa('la limpieza inicial ya se hizo: es de un solo uso', 409, ctx.cors);
  const cuentas = await candidatasALimpieza(ctx, sesion, entorno);
  const en = new Date(ctx.ahora()).toISOString();
  const lista = cuentas.map(({ _correo, _nombre, ...c }) => c);
  const bitacora = await auditar(ctx.google, {
    orgId: ctx.org, accion: 'limpieza', actorUid: ctx.actorUid, actorCorreo: ctx.actorCorreo,
    despues: { simulacion: true, total: lista.length, uids: lista.map((c) => c.uid) }, ip: ctx.ip, en,
  });
  return responder({
    ok: true, simulacion: true, total: lista.length, uids: lista.map((c) => c.uid), cuentas: lista,
    orgId: ctx.org, bitacora,
    aviso: 'Definitivo cuando se ejecute. Las cuentas quedan como lápida en usuarios/{uid}. '
      + 'Ponga REVOCADOS_ANTES_DE en los dos trabajadores antes de ejecutar.',
  }, 200, ctx.cors);
}

/**
 * EL BORRADO, con las cuatro redes del comité: secreto de un solo uso, lista
 * idéntica al ensayo, exclusión del llamante y del propietario, y lápida +
 * bitácora escritas ANTES de borrar en un solo viaje. Lotes de 8 y reanudable.
 *
 * ⚠️ POR QUÉ EL LOTE ES DE 8 Y NO «TODAS»: el plan gratuito de Cloudflare corta a
 * las **50 subpeticiones por invocación**, y una petición que las agota no
 * devuelve un error legible — se muere a mitad, con unas cuentas borradas y
 * otras no. Contadas una a una, esta invocación gasta:
 *
 *   1  llaves públicas de Google (solo con el aislado frío; después, en caché)
 *   1  token OAuth de la cuenta de servicio (ídem)
 *   1  `accounts:lookup`     — comprobar al propietario contra el estado vivo
 *   1  lectura `config/limpieza`
 *   1  `accounts:batchGet`   — el censo (+1 por cada 1.000 cuentas más)
 *   8  `accounts:update`     — apagar y vaciar, UNA por cuenta del lote
 *   1  `documents:commit`    — las 8 lápidas y sus 8 entradas de bitácora
 *   1  `accounts:batchDelete`— el borrado, `force:false`
 *   1  escritura `config/limpieza` (el progreso)
 *   1  entrada de bitácora del lote
 *   ── 17 de 50 en el peor caso (15 con el aislado caliente).
 *
 * El coste crece como `lote + 9`: 8 deja un tercio del cupo gastado y sitio de
 * sobra para la paginación del censo. Subirlo a 40 cabría en el papel y dejaría
 * cero margen; no se sube. Lo que no cabe en una invocación se lleva en la
 * siguiente — para eso está `config/limpieza.progreso` y la respuesta 202.
 *
 * (El ensayo, `GET ?simular=1`, gasta 6.)
 */
async function ejecutarLimpieza(ctx, sesion, entorno, peticion, cuerpo) {
  const secreto = typeof entorno.LIMPIEZA_TOKEN === 'string' ? entorno.LIMPIEZA_TOKEN.trim() : '';
  if (!secreto) return noPasa('la limpieza no está armada (falta LIMPIEZA_TOKEN): no se borra nada', 503, ctx.cors);
  const traido = (peticion.headers.get('X-Limpieza-Token') ?? '').trim();
  if (!traido || traido !== secreto) return rechazar(ctx, 403, 'el secreto de limpieza no coincide', {});

  const estado = await ctx.google.leerDocumento(LIMPIEZA);
  if (estado?.hecho === true) return noPasa('la limpieza inicial ya se hizo: es de un solo uso', 409, ctx.cors);

  if (cuerpo.confirmacion !== 'BORRAR') throw new FalloConCodigo(400, 'hay que confirmar tecleando BORRAR');
  if (cuerpo.orgId !== ctx.org) throw new FalloConCodigo(400, 'la organización no coincide');
  if (!Array.isArray(cuerpo.uids) || !cuerpo.uids.every(uidValido)) {
    throw new FalloConCodigo(400, 'hay que mandar la lista de uids del ensayo');
  }
  const uidPropietario = entorno.PROPIETARIO_UID.trim();
  if (cuerpo.uids.includes(uidPropietario) || cuerpo.uids.includes(sesion.sub)) {
    throw new FalloConCodigo(400, 'la lista incluye al propietario o a quien llama: eso no se borra');
  }

  // La lista tiene que ser EXACTAMENTE la del ensayo (menos lo ya hecho).
  const candidatas = await candidatasALimpieza(ctx, sesion, entorno);
  const hechos = new Set(Array.isArray(estado?.progreso) ? estado.progreso : []);
  const pendientesReales = candidatas.filter((c) => !hechos.has(c.uid)).map((c) => c.uid).sort();
  const pedidos = [...new Set(cuerpo.uids)].sort();
  if (Number(cuerpo.total) !== pedidos.length || JSON.stringify(pedidos) !== JSON.stringify(pendientesReales)) {
    throw new FalloConCodigo(400,
      `la lista no coincide con el ensayo (pedidas ${pedidos.length}, pendientes ${pendientesReales.length}): vuelva a ensayar`);
  }

  const en = new Date(ctx.ahora()).toISOString();
  const ahoraS = Math.floor(ctx.ahora() / 1000);
  const lote = candidatas.filter((c) => pedidos.slice(0, LOTE_LIMPIEZA).includes(c.uid));

  // 1 · Apagar y vaciar, cuenta a cuenta (una llamada por cuenta).
  for (const c of lote) {
    await ctx.google.actualizarCuenta({
      localId: c.uid, customAttributes: '{}', disableUser: true, validSince: String(ahoraS),
    });
  }
  // 2 · Lápidas + bitácora, en UN viaje, ANTES de borrar.
  const escrituras = [];
  for (const c of lote) {
    escrituras.push({ ruta: `usuarios/${c.uid}`, campos: {
      orgId: ctx.org, correo: c._correo, nombre: c._nombre || c._correo || c.uid,
      // ⚠️ EL ROL DE UNA LÁPIDA SIN ROL. Estas cuentas viejas no tienen ninguno
      // —`customAttributes` vacío—, pero el molde exige uno de los cinco y aquí
      // no se puede escribir «ninguno». Se pone el MÁS PEQUEÑO que existe,
      // `cuadrilla` (3 funciones: ver líneas, ver y aportar evidencias). Antes
      // se ponía `auditor`, que en el catálogo tiene SEIS —incluida
      // `usuarios.auditoria`, leer la bitácora—: es decir, la lápida de alguien
      // que nunca tuvo permisos le atribuía el rol que sí puede leer quién hizo
      // qué. Un dato inventado, y encima al alza.
      //
      // Sigue siendo un valor de relleno, y por eso LA VERDAD SE ESCRIBE APARTE:
      // la entrada `borrado` de la bitácora de esta misma operación guarda
      // `antes.rol = 'ninguno'` y los proveedores reales. La lápida existe para
      // que un `creadoPor` de hace dos años siga teniendo nombre, no para
      // afirmar qué podía hacer esa persona; quien quiera saberlo, la bitácora.
      // (Añadir un campo `rolAlBorrar` sería lo honesto, pero exige tocar el
      // molde en `contratos/src/usuarios.ts` — y un campo que el molde no
      // declara lo borra `zod` al leerlo: quedaría escrito y sería invisible.)
      rol: c.rol === 'ninguno' ? 'cuadrilla' : c.rol, funcionesExtra: [], funcionesQuitadas: [],
      lineas: [TODAS_LAS_LINEAS], activo: false, creadoEn: c.creadaEn ?? en, creadoPor: ctx.actorUid,
      borradoEn: en, borradoPor: ctx.actorUid,
    } });
    escrituras.push({ ruta: `${BITACORA}/${idNuevo()}`, campos: EntradaDeAuditoria.parse({
      orgId: ctx.org, accion: 'borrado', actorUid: ctx.actorUid, actorCorreo: ctx.actorCorreo,
      sujetoUid: c.uid, sujetoCorreo: c._correo || undefined,
      antes: { proveedores: c.proveedores, rol: c.rol, deshabilitada: c.deshabilitada }, ip: ctx.ip, en,
    }) });
  }
  await ctx.google.escribirVarios(escrituras);
  // 3 · Borrar en lote, solo las ya deshabilitadas.
  const noBorradas = await ctx.google.borrarCuentasEnLote(lote.map((c) => c.uid), { force: false });
  const borradas = lote.map((c) => c.uid).filter((u) => !noBorradas.some((x) => x.localId === u));

  // 4 · Progreso, y la marca de hecho si no queda nada.
  const progreso = [...hechos, ...borradas];
  const quedan = pendientesReales.filter((u) => !progreso.includes(u));
  await ctx.google.escribirDocumento(LIMPIEZA, {
    progreso, ultimoLoteEn: en, ...(quedan.length ? {} : { hecho: true, en, total: progreso.length }),
  });
  await auditar(ctx.google, {
    orgId: ctx.org, accion: 'limpieza', actorUid: ctx.actorUid, actorCorreo: ctx.actorCorreo,
    despues: { simulacion: false, borradas, noBorradas, quedan: quedan.length }, ip: ctx.ip, en,
  });
  salud.operaciones += 1;
  return responder({
    ok: true, borradas, noBorradas, hechos: progreso.length, pendientes: quedan.length, terminado: !quedan.length,
    revocacion: 'inmediata en las dos puertas si REVOCADOS_ANTES_DE está puesto; si no, hasta una hora',
  }, quedan.length ? 202 : 200, ctx.cors);
}
