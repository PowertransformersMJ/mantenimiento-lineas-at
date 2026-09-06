// ============================================================================
// tests/portero.test.js — el trabajador que sirve las fotos del cliente
// ----------------------------------------------------------------------------
// QUÉ SE PRUEBA: `evidencias/src/index.js`, lo único que impide que las fotos de
// AFINIA se bajen desde internet. Estaba EN PRODUCCIÓN sin una sola prueba, y la
// auditoría de la ola 4 le encontró cuatro cosas — una de ellas, la puerta
// abierta si faltaba una variable de configuración (§ADR-013).
//
// LO QUE ESTAS PRUEBAS CUBREN, en tres capas:
//   · lo que el portero decide ANTES de mirar la sesión — configuración ausente,
//     método, ruta, clave mal codificada, falta de token. Ahí vivían los fallos;
//   · las dos condiciones de la subida, leídas del ARCHIVO: no se puede simular
//     el depósito entero, pero sí exigir que la REGLA siga escrita;
//   · y desde `99 §ADR-100`, la autorización EJECUTADA con un token firmado de
//     verdad (último bloque del archivo): quién baja (`ev`), quién sube (`ea`) y
//     el corte de revocación. Sin red: se genera un par de llaves al vuelo y se
//     sirve la pública como si fuera el llavero de Google.
//
// LO QUE SIGUE SIN CUBRIRSE, y se dice en vez de suponerlo: que Cloudflare
// ejecute esto tal cual —el depósito R2 de verdad, los límites del aislado— solo
// se comprueba desplegando. Lo que sí está probado es la decisión, que es donde
// se pierde una foto de cliente.
//
// ⚠️ Datos sintéticos: este repositorio es público (L-23).
// ============================================================================
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import portero from '../evidencias/src/index.js';

const ENTORNO = Object.freeze({
  PROYECTO_FIREBASE: 'proyecto-de-prueba',
  ORIGEN_PERMITIDO: 'https://ejemplo.invalid',
  ORG_PERMITIDA: 'organizacion-de-prueba',
  // Nunca se llega a tocar en estas pruebas: todas cortan antes.
  EVIDENCIAS: { get: async () => null },
});

const pedir = (ruta, opciones = {}) =>
  portero.fetch(new Request(`https://portero.invalid${ruta}`, opciones), { ...ENTORNO, ...opciones.entorno });

const cuerpo = async (r) => JSON.parse(await r.text());

// ════════════════════════════════════════════════════════════════════════════
describe('portero — la falta de configuración APAGA, no abre', () => {
  // El hallazgo grave de la ola 4: la comprobación de organización era
  // `if (ORG_PERMITIDA && sesion.orgId !== ORG_PERMITIDA)`. Sin la variable, la
  // condición entera valía `false` y no se comprobaba nada: cualquiera con una
  // cuenta de Google bajaba fotos de cliente, sin que nada fallara ni avisara.
  for (const falta of ['PROYECTO_FIREBASE', 'ORG_PERMITIDA']) {
    test(`sin ${falta} no se sirve NADA, y se dice por qué`, async () => {
      const r = await pedir('/e/foto.jpg', { entorno: { [falta]: undefined } });
      assert.equal(r.status, 503, 'una configuración incompleta apaga el servicio');
      assert.match((await cuerpo(r)).error, new RegExp(falta));
      assert.match((await cuerpo(await pedir('/e/foto.jpg', { entorno: { [falta]: '' } }))).error,
        /no está configurado/, 'una cadena vacía es lo mismo que ausente');
    });
  }

  test('y la respuesta de apagado TRAE cabeceras CORS: el navegador tiene que poder leerla', async () => {
    // Sin CORS el usuario ve «Error de red» en vez del motivo, y nadie sabe que
    // lo que hay que arreglar es una variable.
    const r = await pedir('/e/foto.jpg', { entorno: { ORG_PERMITIDA: '' } });
    assert.ok(r.headers.get('Access-Control-Allow-Origin'));
  });
});

describe('portero — la puerta: método, ruta y clave', () => {
  test('leer y subir; BORRAR y lo demás siguen sin existir', async () => {
    // ⚠️ Esta prueba exigía que TODO lo que no fuera GET se rechazara. El
    // 2026-08-17 el Ingeniero autorizó abrir la subida —para poder aportar
    // fotografías desde el teléfono en campo, sin la llave maestra— con dos
    // condiciones que están en la cabecera del portero. Lo que NO cambió, y esta
    // prueba lo sigue defendiendo, es que de este depósito no se borra nada: lo
    // que entra se queda, y por eso todo lo demás se comprueba antes de escribir.
    for (const method of ['POST', 'DELETE', 'PATCH', 'HEAD']) {
      const r = await pedir('/e/foto.jpg', { method });
      assert.equal(r.status, 405, `${method} no puede pasar`);
    }
    // Y subir NO es una puerta abierta: sin sesión no pasa, igual que leer.
    const sinSesion = await pedir('/subir?linea=LX&origen=pruebas&archivo=a.jpg', { method: 'PUT' });
    assert.equal(sinSesion.status, 401, 'subir sin sesión no puede pasar');
  });

  test('la comprobación previa (OPTIONS) responde sin pedir token', async () => {
    const r = await pedir('/e/foto.jpg', { method: 'OPTIONS' });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('Access-Control-Allow-Methods'), 'GET, PUT, OPTIONS');
  });

  test('fuera de /e/ no existe nada', async () => {
    assert.equal((await pedir('/')).status, 404);
    assert.equal((await pedir('/admin')).status, 404);
  });

  test('una clave MAL CODIFICADA da un 400 limpio, no un 500 sin CORS', async () => {
    // §ADR-013, hallazgo 17: `decodeURIComponent` estaba fuera de todo
    // try/catch. Un porcentaje suelto lanzaba `URIError`, Cloudflare respondía
    // con SU página de error 500 —sin `Access-Control-Allow-Origin`— y la
    // galería mostraba «HTTP 500» en vez del motivo del portero.
    const r = await pedir('/e/%');
    assert.equal(r.status, 400);
    assert.match((await cuerpo(r)).error, /codificada/);
    assert.ok(r.headers.get('Access-Control-Allow-Origin'),
      'el error tiene que poder leerlo el navegador que lo provocó');
  });

  test('una clave que intenta salirse del prefijo se rechaza', async () => {
    const r = await pedir('/e/..%2Fotra-cosa');
    assert.equal(r.status, 400);
  });

  test('sin clave tampoco pasa', async () => {
    assert.equal((await pedir('/e/')).status, 400);
  });

  test('con clave válida pero SIN token, 401 antes de tocar el depósito', async () => {
    let miro = false;
    const r = await pedir('/e/LN-000/falla/abc-foto.jpg', {
      entorno: { EVIDENCIAS: { get: async () => { miro = true; return null; } } },
    });
    assert.equal(r.status, 401);
    assert.equal(miro, false, 'sin sesión no se mira siquiera si el objeto existe');
  });

  test('un Authorization que no es Bearer se trata como si no hubiera token', async () => {
    const r = await pedir('/e/foto.jpg', { headers: { Authorization: 'Basic cXVpZW4=' } });
    assert.equal(r.status, 401);
  });
});

describe('portero — el prefijo por organización, cuando se configure', () => {
  // Hoy va vacío a propósito y así está declarado en el propio archivo: las
  // claves son `<línea>/<origen>/<huella>-<archivo>` y no llevan `orgId`. El día
  // que entre una segunda organización al depósito, esto deja de ser opcional.
  // La prueba existe para que el mecanismo no se oxide sin que nadie lo note.
  test('con PREFIJO_EVIDENCIAS puesto, lo que caiga fuera NO pasa', async () => {
    const r = await pedir('/e/OTRA-ORG/falla/abc-foto.jpg', {
      entorno: { PREFIJO_EVIDENCIAS: 'transpower/' },
    });
    assert.equal(r.status, 403);
    assert.match((await cuerpo(r)).error, /fuera del alcance/);
  });

  test('y lo que caiga dentro sigue su camino normal (llega a pedir el token)', async () => {
    const r = await pedir('/e/transpower/LN-000/abc-foto.jpg', {
      entorno: { PREFIJO_EVIDENCIAS: 'transpower/' },
    });
    assert.equal(r.status, 401, 'ya no lo para el prefijo, lo para la falta de sesión');
  });

  test('sin la variable, el prefijo no se exige — y eso es una decisión, no un olvido', async () => {
    const r = await pedir('/e/cualquier-cosa/foto.jpg');
    assert.equal(r.status, 401, 'lo único que lo para es la falta de sesión');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA PUERTA DE SUBIDA — las dos condiciones bajo las que se autorizó abrirla
// ----------------------------------------------------------------------------
// El 2026-08-17 el Ingeniero autorizó que este portero dejara de ser solo-lectura,
// para poder aportar fotografías desde el teléfono en campo sin la llave maestra.
// Lo autorizó con DOS condiciones, y estas pruebas son las que impiden que se
// pierdan por el camino:
//
//   1. El cliente NO elige dónde se guarda. La clave la calcula el portero con la
//      huella del contenido. El primer diseño dejaba que el cliente propusiera la
//      clave y comprobaba «que llevara la huella dentro»: se demostró que una
//      clave preparada pasaba y podía pisar la foto de otro.
//   2. Topes de verdad, porque NADA se puede borrar: lo que entra se queda.
//
// Se comprueban leyendo el ARCHIVO, igual que `tests/carga-contra-contrato.test.js`
// hace con la escritura de apoyos: no se puede simular una sesión válida sin
// falsificar la firma de Google, que es justo lo que este portero existe para
// impedir. Esto prueba que la REGLA sigue escrita, no que Cloudflare la ejecute.
// ════════════════════════════════════════════════════════════════════════════
describe('portero — la puerta de subida y sus dos condiciones', () => {
  const fuente = readFileSync(new URL('../evidencias/src/index.js', import.meta.url), 'utf-8');

  test('CONDICIÓN 1: la clave sale de la huella del contenido, no del cliente', () => {
    assert.match(fuente, /claveNueva\s*=\s*`\$\{linea\}\/\$\{origen\}\/\$\{await huellaDe\(cuerpo\)\}-\$\{archivo\}`/,
      'la clave del objeto tiene que construirla el portero con la huella de lo que recibe');
    assert.ok(!/searchParams\.get\(['"]clave['"]\)/.test(fuente),
      'el cliente volvió a poder proponer la clave: puede pisar la foto de otro');
    assert.ok(!/clave\w*\.includes\(['"]\/['"]\s*\+/.test(fuente),
      'volvió la comprobación por SUBCADENA, que se demostró que no impide nada');
  });

  test('CONDICIÓN 2: hay tope por archivo, y se mira ANTES y DESPUÉS de recibirlo', () => {
    assert.match(fuente, /TOPE_ARCHIVO\s*=\s*\d+\s*\*\s*1024\s*\*\s*1024/, 'desapareció el tope por archivo');
    assert.match(fuente, /content-length[\s\S]{0,400}TOPE_ARCHIVO/,
      'el tope tiene que mirarse antes de leer el cuerpo: si no, el gasto ya se hizo');
    assert.match(fuente, /byteLength\s*>\s*TOPE_ARCHIVO/,
      'y otra vez con el tamaño real: la cabecera la escribe quien sube');
  });

  test('el formato se reconoce por los BYTES, nunca por lo que diga el cliente', () => {
    assert.match(fuente, /function mimeReal/);
    assert.match(fuente, /mimeReal\(new Uint8Array\(cuerpo\.slice\(0, 8\)\)\)/);
    assert.ok(!/headers\.get\(['"]content-type['"]\)/.test(fuente),
      'se volvió a creer el `content-type` del cliente, que lo escribe quien sube');
  });

  test('subir exige un rol que trabaje: un auditor mira, no aporta', () => {
    // Desde `99 §ADR-100` la decisión es por FUNCIÓN del catálogo, no por rol:
    // `ea` (evidencias.aportar) para subir, `ev` (evidencias.ver) para mirar. Una
    // lista literal de roles aquí era justo lo que dejó al propietario sin poder
    // subir una foto: no estaba en ella.
    assert.ok(!/ROLES_QUE_SUBEN/.test(fuente), 'volvió la lista literal de roles');
    assert.match(fuente, /FUNCION_APORTAR = 'ea'/);
    assert.match(fuente, /FUNCION_VER = 'ev'/);
    assert.match(fuente, /tiene\(sesion, FUNCION_APORTAR\)/);
    assert.match(fuente, /tiene\(sesion, FUNCION_VER\)/);
  });

  test('la misma foto dos veces NO se escribe dos veces, y se dice', () => {
    // Nada se puede borrar: un duplicado se queda para siempre y además se paga.
    assert.match(fuente, /EVIDENCIAS\.head\(claveNueva\)/);
    assert.match(fuente, /if \(!yaEstaba\)[\s\S]{0,200}EVIDENCIAS\.put/);
    assert.match(fuente, /yaEstaba: Boolean\(yaEstaba\)/);
  });

  test('lo que este portero NUNCA hizo, sigue sin hacer: borrar y listar', () => {
    assert.ok(!/EVIDENCIAS\.delete\(/.test(fuente), 'el portero aprendió a borrar');
    assert.ok(!/EVIDENCIAS\.list\(/.test(fuente), 'el portero aprendió a listar el depósito');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA AUTORIZACIÓN, EJECUTADA DE VERDAD — con un token FIRMADO
// ----------------------------------------------------------------------------
// Todo lo de arriba prueba lo que el portero decide ANTES de mirar la sesión, y
// las dos condiciones de la subida se comprueban leyendo el archivo. Faltaba lo
// que de verdad decide quién entra: `f` (las funciones del token) y el corte de
// revocación. Eso NO se puede leer del archivo —una expresión regular no sabe si
// el `403` sale por el motivo correcto— y hasta hoy quedaba «verificado a mano
// contra producción», que es como decir que no está verificado.
//
// SE PUEDE PROBAR SIN RED Y SIN LLAVE DE GOOGLE. Se genera un par de llaves al
// vuelo, se firma un token con él y se sirve la llave PÚBLICA como si fuera el
// llavero de Google (`globalThis.fetch` sustituido durante estas pruebas). Lo
// que se comprueba es exactamente lo que corre en producción: el portero llama
// al mismo verificador compartido, con la misma firma RS256.
//
// ⚠️ POR QUÉ IMPORTAN ESTAS CUATRO. Las dos primeras son el motivo de migrar de
// roles a funciones (`99 §ADR-100`): la lista literal `ROLES_QUE_SUBEN` dejó al
// `propietario` sin poder subir una foto —no estaba en ella— y un token viejo,
// sin `f`, seguía bajando fotos de cliente durante la hora que vive. La tercera
// es el caso del propietario. La cuarta es el corte de revocación, que es lo que
// convierte «revocado en una hora» en «revocado ya» en ESTA puerta.
// ════════════════════════════════════════════════════════════════════════════
const PROYECTO = 'proyecto-de-prueba';
const ORG = 'organizacion-de-prueba';

// Un par de llaves de mentira que firma tokens de verdad. No sale del proceso.
// Va en el nivel superior del archivo porque `await` fuera de una función solo
// vale aquí, y generarlo una vez basta para todas las pruebas.
const par = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true, ['sign', 'verify'],
);
const jwk = { ...(await crypto.subtle.exportKey('jwk', par.publicKey)), kid: 'k1', use: 'sig', alg: 'RS256' };
delete jwk.key_ops;

describe('portero — quién baja y quién sube, con un token firmado', () => {
  const enB64 = (bytes) => { let s = ''; for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b); return btoa(s); };
  const aB64url = (s) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const t2b = (t) => aB64url(enB64(new TextEncoder().encode(t)));

  // El reloj es el REAL: el portero no inyecta reloj —en producción tampoco lo
  // tiene—, así que el token se fecha respecto de ahora, como el de una persona.
  const ahoraS = () => Math.floor(Date.now() / 1000);

  async function firmar(extra = {}) {
    const cab = t2b(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'k1' }));
    const carga = t2b(JSON.stringify({
      iss: `https://securetoken.google.com/${PROYECTO}`, aud: PROYECTO, sub: 'uid-de-prueba',
      iat: ahoraS() - 60, exp: ahoraS() + 3600, orgId: ORG, ...extra,
    }));
    const firma = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5', par.privateKey, new TextEncoder().encode(`${cab}.${carga}`),
    );
    return `${cab}.${carga}.${aB64url(enB64(firma))}`;
  }

  // El llavero público de Google, servido desde aquí. Se sustituye el `fetch`
  // global porque el portero NO lo inyecta: usa el del entorno del trabajador.
  const fetchDeVerdad = globalThis.fetch;
  before(() => {
    globalThis.fetch = async () => new Response(JSON.stringify({ keys: [jwk] }), {
      status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' },
    });
  });
  after(() => { globalThis.fetch = fetchDeVerdad; });

  /** Un objeto del depósito, con lo justo que el portero le pide. */
  const objetoFalso = () => ({
    body: 'bytes-de-una-foto',
    httpEtag: '"abc"',
    writeHttpMetadata: (h) => h.set('content-type', 'image/jpeg'),
  });

  /** Los tres bytes que hacen que algo SEA un JPEG para el reconocedor. */
  const jpegDeMentira = () => {
    const b = new Uint8Array(64);
    b.set([0xff, 0xd8, 0xff], 0);
    return b;
  };

  const conSesion = (ruta, token, opciones = {}) => pedir(ruta, {
    ...opciones,
    headers: { Authorization: `Bearer ${token}`, ...opciones.headers },
    entorno: { PROYECTO_FIREBASE: PROYECTO, ORG_PERMITIDA: ORG, ...opciones.entorno },
  });

  // ── BAJAR: exige `ev` ─────────────────────────────────────────────────────
  test('SIN `ev` no se baja nada, aunque la sesión sea válida y de la organización', async () => {
    let miro = false;
    const r = await conSesion('/e/LN-000/falla/abc-foto.jpg', await firmar({ rol: 'cuadrilla', f: ['ea'] }), {
      entorno: { EVIDENCIAS: { get: async () => { miro = true; return objetoFalso(); } } },
    });
    assert.equal(r.status, 403);
    assert.match((await cuerpo(r)).error, /permiso para ver/);
    assert.equal(miro, false, 'se miró el depósito antes de comprobar el permiso');
  });

  test('⚠️ y un token SIN `f` —los de antes del catálogo— tampoco baja', async () => {
    // Ésta es la ventana de la hora que cerró `99 §ADR-100`: un token de Firebase
    // vive sesenta minutos y no muere al cambiar los reclamos ni al borrar la
    // cuenta. Mientras el portero decidía por ROL, ese token seguía trayendo
    // `rol: 'admin'` y bajaba fotos de cliente. Reclamo ausente = mínimo
    // privilegio: sin `f` no pasa, y la revocación es inmediata en esta puerta.
    const r = await conSesion('/e/LN-000/falla/abc-foto.jpg', await firmar({ rol: 'admin' }));
    assert.equal(r.status, 403);
    assert.match((await cuerpo(r)).error, /permiso para ver/);
  });

  test('con `ev` sí se baja, y la respuesta no se deja cachear por el camino', async () => {
    const r = await conSesion('/e/LN-000/falla/abc-foto.jpg', await firmar({ rol: 'auditor', f: ['ev'] }), {
      entorno: { EVIDENCIAS: { get: async () => objetoFalso() } },
    });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('cache-control'), /private/, 'son datos de cliente');
    assert.match(r.headers.get('vary'), /Authorization/, 'sin esto una caché la sirve sin token');
  });

  test('una sesión de OTRA organización no baja nada, por muchas funciones que traiga', async () => {
    // Es el invariante que este portero existe para sostener: un depósito, una
    // organización. Se comprueba con token firmado porque es lo único que lo
    // separa de una fuga de datos de cliente.
    const r = await conSesion('/e/LN-000/falla/abc-foto.jpg', await firmar({ orgId: 'otra-empresa', rol: 'admin', f: ['ev', 'ea'] }));
    assert.equal(r.status, 403);
    assert.match((await cuerpo(r)).error, /organización dueña del dato/);
  });

  // ── SUBIR: exige `ea` ─────────────────────────────────────────────────────
  test('SIN `ea` no se sube: un auditor mira, no aporta', async () => {
    let escribio = false;
    const r = await conSesion('/subir?linea=LN-000&origen=pruebas&archivo=a.jpg',
      await firmar({ rol: 'auditor', f: ['ev'] }), {
        method: 'PUT',
        body: jpegDeMentira(),
        entorno: { EVIDENCIAS: { head: async () => null, put: async () => { escribio = true; } } },
      });
    assert.equal(r.status, 403);
    assert.match((await cuerpo(r)).error, /no subirlas/);
    assert.equal(escribio, false, 'nada se puede borrar de este depósito: lo que entra, se queda');
  });

  test('⚠️ con `ea` SÍ sube, aunque el rol sea `propietario`', async () => {
    // El fallo concreto que arregló la migración: la lista literal de roles que
    // había aquí no incluía al `propietario` —un rol que nació después—, así que
    // el dueño del sistema era el único que no podía aportar una fotografía. Una
    // lista de roles escrita a mano se queda vieja sin que nadie lo note; una
    // función del catálogo la reparte `reclamosDe()` sola.
    let guardado = null;
    const r = await conSesion('/subir?linea=LN-000&origen=pruebas&archivo=foto.jpg',
      await firmar({ rol: 'propietario', f: ['ev', 'ea'] }), {
        method: 'PUT',
        body: jpegDeMentira(),
        entorno: {
          EVIDENCIAS: { head: async () => null, put: async (clave, cuerpo, o) => { guardado = { clave, o }; } },
        },
      });
    assert.equal(r.status, 201);
    const datos = await cuerpo(r);
    assert.equal(datos.mime, 'image/jpeg', 'el formato se reconoce por los bytes');
    assert.match(datos.rutaObjeto, /^LN-000\/pruebas\/[0-9a-f]{12}-foto\.jpg$/,
      'la clave la calcula el portero con la huella del contenido, no el cliente');
    assert.equal(guardado.clave, datos.rutaObjeto);
  });

  // ── EL CORTE DE REVOCACIÓN ────────────────────────────────────────────────
  test('⚠️ un token emitido ANTES de REVOCADOS_ANTES_DE no pasa: 401', async () => {
    // El caso de la limpieza inicial: la cuenta se borró hace un minuto y la
    // pestaña sigue abierta con un token de hace veinte. Sin esta marca, seguiría
    // bajando fotos hasta una hora después de borrarla.
    const corte = new Date((ahoraS() - 600) * 1000).toISOString();
    const r = await conSesion('/e/LN-000/falla/abc-foto.jpg',
      await firmar({ rol: 'admin', f: ['ev', 'ea'], iat: ahoraS() - 1200 }),
      { entorno: { REVOCADOS_ANTES_DE: corte } });
    assert.equal(r.status, 401);
    assert.match((await cuerpo(r)).error, /anterior a la revocación/);
  });

  test('…y el emitido DESPUÉS de la marca sigue entrando: el corte no apaga a los vivos', async () => {
    const corte = new Date((ahoraS() - 600) * 1000).toISOString();
    const r = await conSesion('/e/LN-000/falla/abc-foto.jpg',
      await firmar({ rol: 'admin', f: ['ev'], iat: ahoraS() - 60 }), {
        entorno: { REVOCADOS_ANTES_DE: corte, EVIDENCIAS: { get: async () => objetoFalso() } },
      });
    assert.equal(r.status, 200);
  });

  test('una marca de revocación ILEGIBLE apaga el portero (503), no se ignora', async () => {
    // Una revocación que se cree puesta y no lo está es peor que ninguna: el día
    // de la limpieza se daría por revocado lo que sigue entrando. Falla cerrado.
    const r = await conSesion('/e/LN-000/falla/abc-foto.jpg', await firmar({ rol: 'admin', f: ['ev'] }),
      { entorno: { REVOCADOS_ANTES_DE: 'ayer' } });
    assert.equal(r.status, 503);
    assert.match((await cuerpo(r)).error, /REVOCADOS_ANTES_DE/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA CONFIGURACIÓN DEL PORTERO — que la marca de revocación esté donde se lee
// ----------------------------------------------------------------------------
// ⚠️ ESTO NACE DE UN FALLO MEDIDO, no de un exceso de celo. `REVOCADOS_ANTES_DE`
// se añadió al FINAL de `evidencias/wrangler.toml`, debajo de `[[r2_buckets]]`.
// En TOML una clave pertenece a la última tabla declarada encima, así que la
// marca no era una variable del trabajador: era un campo del depósito. Wrangler
// la descartaba con un aviso fácil de pasar por alto y desplegaba el portero SIN
// corte de revocación. El día de la limpieza inicial se habría dado por revocado
// lo que seguía entrando —durante la hora que vive cada token—, que es
// exactamente el daño que esa marca existe para evitar.
//
// La prueba que había miraba el archivo como TEXTO (`tests/token-de-firebase`,
// «los dos trabajadores leen la marca») y pasaba con la marca mal puesta: el
// renglón estaba escrito, solo que colgando de otra tabla. Por eso ésta mira la
// ESTRUCTURA. No es un analizador de TOML —no hace falta—: basta con saber bajo
// qué cabecera cae cada clave.
// ════════════════════════════════════════════════════════════════════════════
describe('portero — la marca de revocación cuelga de [vars], no de otra tabla', () => {
  /** Bajo qué cabecera `[…]` cae cada clave del archivo. */
  const tablaDeCadaClave = (toml) => {
    const dónde = {};
    let tabla = '';   // lo de antes de la primera cabecera
    for (const linea of toml.split('\n')) {
      const limpia = linea.trim();
      if (limpia.startsWith('#') || !limpia) continue;
      const cabecera = /^\[+([^\]]+)\]+$/.exec(limpia);
      if (cabecera) { tabla = cabecera[1]; continue; }
      const clave = /^([A-Za-z0-9_-]+)\s*=/.exec(limpia);
      if (clave) dónde[clave[1]] = tabla;
    }
    return dónde;
  };

  test('REVOCADOS_ANTES_DE es una variable del trabajador, no un campo del depósito', () => {
    const toml = readFileSync(new URL('../evidencias/wrangler.toml', import.meta.url), 'utf-8');
    const dónde = tablaDeCadaClave(toml);
    assert.equal(dónde.REVOCADOS_ANTES_DE, 'vars',
      'la marca de revocación quedó fuera de [vars]: wrangler la descarta y el portero se '
      + 'despliega sin corte, sin que nada falle. Se creería revocado lo que sigue entrando.');
    // Las otras tres, por el mismo motivo: si una se cae de [vars] el portero
    // responde 503 y se nota en un minuto, pero mejor cazarlo aquí.
    for (const v of ['PROYECTO_FIREBASE', 'ORIGEN_PERMITIDO', 'ORG_PERMITIDA']) {
      assert.equal(dónde[v], 'vars', `${v} dejó de ser una variable del trabajador`);
    }
  });
});
