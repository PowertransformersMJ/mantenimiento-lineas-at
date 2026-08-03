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
  test('solo GET; el resto se rechaza', async () => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const r = await pedir('/e/foto.jpg', { method });
      assert.equal(r.status, 405, `${method} no puede pasar`);
    }
  });

  test('la comprobación previa (OPTIONS) responde sin pedir token', async () => {
    const r = await pedir('/e/foto.jpg', { method: 'OPTIONS' });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
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
