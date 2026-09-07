// ============================================================================
// tests/token-de-firebase.test.js — el verificador compartido y el corte
// ----------------------------------------------------------------------------
// QUÉ VIGILA. `comun/token-de-firebase.js` es la pregunta «¿esta sesión es de
// verdad?» que hacen LOS DOS trabajadores. Aquí se firma un token de verdad con
// un par de llaves generado al vuelo y se comprueba que se acepta —o se rechaza—
// por las razones correctas, sin red.
//
// ⚠️ Y EL CORTE DE REVOCACIÓN (`99 §ADR-100`), que es lo nuevo: un token de
// Firebase vive una hora y no muere al borrar la cuenta. La marca
// `REVOCADOS_ANTES_DE` es lo que convierte «revocado en una hora» en «revocado
// ya», en las dos puertas a la vez. Si esto se rompe, la limpieza inicial deja
// una hora de cuentas borradas que siguen entrando.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { verificarToken, revocadosAntesDeDe } from '../comun/token-de-firebase.js';

const PROYECTO = 'proyecto-de-prueba';
const AHORA = Date.parse('2026-09-06T03:00:00.000Z');
const AHORA_S = Math.floor(AHORA / 1000);

const par = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true, ['sign', 'verify'],
);
const jwk = { ...(await crypto.subtle.exportKey('jwk', par.publicKey)), kid: 'k1', use: 'sig', alg: 'RS256' };
delete jwk.key_ops;

const enB64 = (bytes) => { let s = ''; for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b); return btoa(s); };
const b64url = (s) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const t2b = (t) => b64url(enB64(new TextEncoder().encode(t)));

async function firmar(cuerpo) {
  const cab = t2b(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'k1' }));
  const carga = t2b(JSON.stringify({
    iss: `https://securetoken.google.com/${PROYECTO}`, aud: PROYECTO, sub: 'uid-1',
    iat: AHORA_S - 60, exp: AHORA_S + 3600, ...cuerpo,
  }));
  const firma = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', par.privateKey, new TextEncoder().encode(`${cab}.${carga}`));
  return `${cab}.${carga}.${b64url(enB64(firma))}`;
}

const traer = async () => new Response(JSON.stringify({ keys: [jwk] }), {
  status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' },
});
const opciones = (extra = {}) => ({ fetch: traer, ahora: () => AHORA, ...extra });

describe('el verificador acepta lo firmado por Google y rechaza lo demás', () => {
  test('un token bien firmado devuelve su cuerpo', async () => {
    const c = await verificarToken(await firmar({ orgId: 'x' }), PROYECTO, opciones());
    assert.equal(c.sub, 'uid-1');
    assert.equal(c.orgId, 'x');
  });

  test('otro proyecto, no', async () => {
    await assert.rejects(verificarToken(await firmar({ aud: 'otro' }), PROYECTO, opciones()), /otro proyecto/);
  });

  test('caducado, no', async () => {
    await assert.rejects(verificarToken(await firmar({ exp: AHORA_S - 3600 }), PROYECTO, opciones()), /caducado/);
  });
});

describe('el corte de revocación', () => {
  test('⚠️ un token emitido ANTES de la marca se rechaza, aunque su firma sea buena', async () => {
    // Es el caso de la limpieza inicial: la cuenta se borró hace un minuto y la
    // pestaña sigue abierta con un token de hace veinte.
    const token = await firmar({ iat: AHORA_S - 1200 });
    await assert.rejects(
      verificarToken(token, PROYECTO, opciones({ revocadosAntesDe: AHORA_S - 600 })),
      /anterior a la revocación/);
  });

  test('un token emitido DESPUÉS de la marca pasa', async () => {
    const token = await firmar({ iat: AHORA_S - 60 });
    const c = await verificarToken(token, PROYECTO, opciones({ revocadosAntesDe: AHORA_S - 600 }));
    assert.equal(c.sub, 'uid-1');
  });

  test('sin marca, nada cambia: es opcional', async () => {
    const c = await verificarToken(await firmar({ iat: AHORA_S - 1200 }), PROYECTO, opciones());
    assert.equal(c.sub, 'uid-1');
  });
});

describe('leer la marca del entorno', () => {
  test('vacía o ausente = sin corte', () => {
    assert.equal(revocadosAntesDeDe({}), null);
    assert.equal(revocadosAntesDeDe({ REVOCADOS_ANTES_DE: '' }), null);
    assert.equal(revocadosAntesDeDe({ REVOCADOS_ANTES_DE: '   ' }), null);
  });

  test('admite segundos y admite una fecha ISO', () => {
    assert.equal(revocadosAntesDeDe({ REVOCADOS_ANTES_DE: '1788663600' }), 1788663600);
    assert.equal(revocadosAntesDeDe({ REVOCADOS_ANTES_DE: '2026-09-06T03:00:00.000Z' }), AHORA_S);
  });

  test('⚠️ una marca que no se entiende LANZA: no se ignora en silencio', () => {
    // Una revocación que se cree puesta y no lo está es peor que ninguna.
    assert.throws(() => revocadosAntesDeDe({ REVOCADOS_ANTES_DE: 'ayer' }), /no se entiende/);
  });
});

describe('los dos trabajadores leen la marca', () => {
  test('el portero y el de personas pasan revocadosAntesDe al verificador', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    for (const ruta of ['evidencias/src/index.js', 'usuarios/src/index.js']) {
      const t = readFileSync(fileURLToPath(new URL('../' + ruta, import.meta.url)), 'utf-8');
      assert.match(t, /revocadosAntesDeDe\(entorno\)/, `${ruta} no lee la marca`);
      assert.match(t, /revocadosAntesDe\s*\}\)/, `${ruta} no la pasa al verificador`);
    }
    for (const ruta of ['evidencias/wrangler.toml', 'usuarios/wrangler.toml']) {
      const t = readFileSync(fileURLToPath(new URL('../' + ruta, import.meta.url)), 'utf-8');
      // Vacía antes del corte; desde el 2026-09-07 lleva el instante del corte
      // (ISO o segundos). Lo que se vigila es que la variable EXISTA en [vars]:
      // sin ella los tokens viejos entrarían durante una hora.
      assert.match(t, /REVOCADOS_ANTES_DE = "(|\d{4}-\d{2}-\d{2}T[\d:]+Z|\d{9,})"/, `${ruta} no declara la marca`);
    }
  });
});
