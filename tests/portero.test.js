// ============================================================================
// tests/portero.test.js — el trabajador que sirve las fotos del cliente
// ----------------------------------------------------------------------------
// QUÉ SE PRUEBA: `evidencias/src/index.js`, lo único que impide que las fotos de
// AFINIA se bajen desde internet. Estaba EN PRODUCCIÓN sin una sola prueba, y la
// auditoría de la ola 4 le encontró cuatro cosas — una de ellas, la puerta
// abierta si faltaba una variable de configuración (§ADR-013).
//
// LO QUE ESTAS PRUEBAS SÍ CUBREN: las decisiones que el portero toma ANTES de
// verificar la firma criptográfica — configuración ausente, método, ruta, clave
// mal codificada, falta de token. Son justo donde vivían los fallos, y se pueden
// ejercitar sin red y sin una llave privada de Google.
//
// LO QUE NO CUBREN, y se dice en vez de suponerlo: la verificación de la firma
// contra las llaves públicas de Google exige salir a internet o inyectar un par
// de llaves falso, y ninguna de las dos cosas cabe en una suite que tiene que
// correr sin red. Esa parte sigue verificada a mano contra producción.
//
// ⚠️ Datos sintéticos: este repositorio es público (L-23).
// ============================================================================
import { test, describe } from 'node:test';
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
    assert.match(fuente, /ROLES_QUE_SUBEN\s*=\s*Object\.freeze\(\[['"]admin['"], ['"]editor['"], ['"]cuadrilla['"]\]\)/);
    assert.match(fuente, /ROLES_QUE_SUBEN\.includes\(sesion\.rol\)/);
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
