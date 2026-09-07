// ============================================================================
// tests/usuarios-worker.test.js — el trabajador que reparte permisos
// ----------------------------------------------------------------------------
// QUÉ SE PRUEBA: `usuarios/src/index.js`, la pieza que decide quién entra al
// sistema y con qué poder. Es la más peligrosa que se ha escrito en este
// proyecto: un fallo aquí no enseña un número raro, reparte llaves.
//
// POR QUÉ ESTAS PRUEBAS SÍ LLEGAN HASTA LA FIRMA, y las del portero de fotos no.
// Aquel archivo dice que verificar la firma «exige salir a internet o inyectar
// un par de llaves falso, y ninguna de las dos cosas cabe». La segunda mitad de
// esa frase resultó ser falsa: se puede generar un par RSA de verdad en el
// momento, servirlo como si fuera el llavero público de Google y firmar tokens
// con él. Sin red, sin llave real y sin un solo secreto en el repositorio.
//
// Lo que eso permite es probar el sistema COMPLETO: token firmado → firma
// verificada → jerarquía → llamada a Google → bitácora. Las llaves nacen y
// mueren dentro de este archivo.
//
// ⚠️ Ni un dato real: correos `.invalid`, organización de prueba y una cuenta de
// servicio inventada con una llave generada aquí mismo (L-23, repositorio
// público).
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import trabajador from '../usuarios/src/index.js';
import { reclamosDe, puede } from '../contratos/src/usuarios.ts';

const ORG = 'organizacion-de-prueba';
const PROYECTO = 'proyecto-de-prueba';
const AHORA = Date.parse('2026-09-05T12:00:00.000Z');
const ahora = () => AHORA;

// ── Las llaves: dos pares, uno «de Google» y otro «de la cuenta de servicio» ──

const generarPar = () => crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true, ['sign', 'verify'],
);

const parDeGoogle = await generarPar();
const parDeLaCuenta = await generarPar();

const jwkPublicaDeGoogle = {
  ...(await crypto.subtle.exportKey('jwk', parDeGoogle.publicKey)),
  kid: 'llave-de-prueba', use: 'sig', alg: 'RS256',
};
delete jwkPublicaDeGoogle.key_ops;

const enBase64 = (bytes) => {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
};
const b64url = (s) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const textoAB64Url = (t) => b64url(enBase64(new TextEncoder().encode(t)));

// La llave privada de la cuenta de servicio, en el mismo PEM que trae el JSON
// que descarga Google. Nace aquí, muere aquí y no vale para nada fuera.
const pkcs8 = await crypto.subtle.exportKey('pkcs8', parDeLaCuenta.privateKey);
const PEM = `-----BEGIN PRIVATE KEY-----\n${enBase64(pkcs8).replace(/(.{64})/g, '$1\n')}\n-----END PRIVATE KEY-----\n`;

const CUENTA_DE_SERVICIO = JSON.stringify({
  type: 'service_account',
  project_id: PROYECTO,
  client_email: 'administrador@proyecto-de-prueba.iam.gserviceaccount.invalid',
  private_key: PEM,
});

/** Firma un token como lo haría Firebase. */
async function firmarComoGoogle(cuerpo, { kid = 'llave-de-prueba' } = {}) {
  const cabecera = textoAB64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const carga = textoAB64Url(JSON.stringify({
    iss: `https://securetoken.google.com/${PROYECTO}`,
    aud: PROYECTO,
    iat: Math.floor(AHORA / 1000) - 60,
    exp: Math.floor(AHORA / 1000) + 3600,
    ...cuerpo,
  }));
  const firma = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', parDeGoogle.privateKey,
    new TextEncoder().encode(`${cabecera}.${carga}`));
  return `${cabecera}.${carga}.${b64url(enBase64(firma))}`;
}

let contador = 0;
const nuevoUid = () => `uid-actor-${++contador}`;

/** Un token de administrador bien aprovisionado, con los reclamos del catálogo. */
const tokenDeAdmin = async (extra = {}) => {
  const uid = extra.sub ?? nuevoUid();
  return firmarComoGoogle({
    sub: uid, email: `${uid}@prueba.invalid`,
    ...reclamosDe({ orgId: ORG, rol: extra.rol ?? 'admin' }),
    ...extra,
  });
};

// ── El Google de mentira ────────────────────────────────────────────────────
//
// Habla el mismo idioma que el de verdad: los mismos caminos, las mismas formas
// de respuesta. Guarda estado, así que una prueba puede crear a alguien y
// después mirarlo. Y apunta TODO lo que se le pidió, que es como se comprueba
// que el trabajador tocó Auth y no solo un documento.

function googleDeMentira({ cuentas = [], documentos = new Map(), fallaFirestore = false } = {}) {
  const estado = {
    cuentas: new Map(cuentas.map((c) => [c.localId, { disabled: false, ...c }])),
    documentos: new Map(documentos),
    llamadas: [],
    firmasDeAcceso: 0,
    siguiente: 0,
  };

  const json = (cuerpo, codigo = 200) => new Response(JSON.stringify(cuerpo), {
    status: codigo, headers: { 'content-type': 'application/json' },
  });

  estado.fetch = async (url, opciones = {}) => {
    const u = String(url);
    const cuerpo = opciones.body && typeof opciones.body === 'string' && opciones.body.startsWith('{')
      ? JSON.parse(opciones.body) : null;
    estado.llamadas.push({ url: u, metodo: opciones.method ?? 'GET', cuerpo });

    // 1 · El llavero público de Google.
    if (u.includes('/service_accounts/v1/jwk/')) {
      return new Response(JSON.stringify({ keys: [jwkPublicaDeGoogle] }), {
        status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' },
      });
    }

    // 2 · El canje del asserto por un permiso de administración. Se COMPRUEBA la
    //     firma RSA: es la única forma de saber que la llave de la cuenta de
    //     servicio se importó y se usó de verdad, que es el paso que la
    //     documentación de Cloudflare no garantiza.
    if (u.startsWith('https://oauth2.googleapis.com/token')) {
      const aserto = new URLSearchParams(opciones.body).get('assertion');
      const [c, p, f] = aserto.split('.');
      const valida = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', parDeLaCuenta.publicKey,
        Uint8Array.from(atob(f.replace(/-/g, '+').replace(/_/g, '/')), (x) => x.charCodeAt(0)),
        new TextEncoder().encode(`${c}.${p}`));
      if (!valida) return json({ error: 'invalid_grant' }, 400);
      estado.firmasDeAcceso += 1;
      return json({ access_token: 'permiso-de-prueba', expires_in: 3600, token_type: 'Bearer' });
    }

    // 3 · Identity Toolkit.
    if (u.includes('identitytoolkit.googleapis.com')) {
      if (u.includes('accounts:signUp')) {
        const localId = `uid-nuevo-${++estado.siguiente}`;
        if ([...estado.cuentas.values()].some((c) => c.email === cuerpo.email)) {
          return json({ error: { message: 'EMAIL_EXISTS' } }, 400);
        }
        estado.cuentas.set(localId, {
          localId, email: cuerpo.email, displayName: cuerpo.displayName,
          disabled: false, customAttributes: '{}', providerUserInfo: [{ providerId: 'password' }],
        });
        return json({ localId, idToken: 'NO-DEBERIA-SALIR-DE-AQUI', refreshToken: 'TAMPOCO' });
      }
      if (u.includes('accounts:update')) {
        const c = estado.cuentas.get(cuerpo.localId);
        if (!c) return json({ error: { message: 'USER_NOT_FOUND' } }, 400);
        if (cuerpo.customAttributes !== undefined) c.customAttributes = cuerpo.customAttributes;
        if (cuerpo.disableUser !== undefined) c.disabled = cuerpo.disableUser;
        if (cuerpo.displayName !== undefined) c.displayName = cuerpo.displayName;
        if (cuerpo.password !== undefined) c.contrasena = cuerpo.password;
        if (cuerpo.validSince !== undefined) c.validSince = cuerpo.validSince;
        return json({ localId: cuerpo.localId });
      }
      if (u.includes('accounts:lookup')) {
        const pedidos = cuerpo.localId ?? [];
        return json({ users: pedidos.map((id) => estado.cuentas.get(id)).filter(Boolean) });
      }
      if (u.includes('accounts:batchGet')) {
        return json({ users: [...estado.cuentas.values()] });
      }
      if (u.includes('accounts:sendOobCode')) {
        return json({ oobLink: `https://identidad.invalid/restablecer?oob=${estado.siguiente}` });
      }
      // 3b · Borrado en lote: con force=false solo caen las ya deshabilitadas.
      if (u.includes('accounts:batchDelete')) {
        const errors = [];
        (cuerpo.localIds ?? []).forEach((id, index) => {
          const c = estado.cuentas.get(id);
          if (!c) { errors.push({ index, localId: id, message: 'NOT_FOUND' }); return; }
          if (!cuerpo.force && !c.disabled) { errors.push({ index, localId: id, message: 'NOT_DISABLED' }); return; }
          estado.cuentas.delete(id);
          estado.borradas = [...(estado.borradas ?? []), id];
        });
        return json({ errors });
      }

      return json({ error: { message: 'RUTA_NO_PREVISTA' } }, 404);
    }

    // 4 · Firestore.
    if (u.includes('firestore.googleapis.com')) {
      if (fallaFirestore) return json({ error: { message: 'PERMISSION_DENIED' } }, 403);
      // 4a · :commit — varias escrituras en un viaje, con precondición opcional.
      if (u.endsWith(':commit') && (opciones.method ?? 'GET') === 'POST') {
        for (const w of cuerpo.writes ?? []) {
          const rutaDoc = String(w.update?.name ?? '').split('/documents/')[1];
          if (w.currentDocument?.exists === false && estado.documentos.has(rutaDoc)) {
            return json({ error: { message: 'FAILED_PRECONDITION: document already exists', status: 'FAILED_PRECONDITION' } }, 400);
          }
        }
        estado.commits = (estado.commits ?? 0) + 1;
        for (const w of cuerpo.writes ?? []) {
          const rutaDoc = String(w.update?.name ?? '').split('/documents/')[1];
          estado.documentos.set(rutaDoc, w.update.fields);
        }
        return json({ writeResults: (cuerpo.writes ?? []).map(() => ({})) });
      }
      const sinBase = u.split('/documents/')[1] ?? '';
      const ruta = sinBase.split('?')[0];
      const trozos = ruta.split('/').filter(Boolean);
      const metodo = opciones.method ?? 'GET';

      if (metodo === 'GET' && trozos.length === 1) {
        const documentos = [...estado.documentos.entries()]
          .filter(([k]) => k.startsWith(`${trozos[0]}/`))
          .map(([k, fields]) => ({ name: `proyectos/x/documents/${k}`, fields }));
        return json({ documents: documentos });
      }
      if (metodo === 'GET' && trozos.length === 2) {
        const d = estado.documentos.get(ruta);
        if (!d) return json({ error: { message: 'NOT_FOUND' } }, 404);
        return json({ name: ruta, fields: d });
      }
      if (metodo === 'PATCH') {
        const previo = estado.documentos.get(ruta) ?? {};
        estado.documentos.set(ruta, { ...previo, ...cuerpo.fields });
        return json({ name: ruta, fields: estado.documentos.get(ruta) });
      }
      if (metodo === 'POST') {
        const id = `entrada-${++estado.siguiente}`;
        estado.documentos.set(`${ruta}/${id}`, cuerpo.fields);
        return json({ name: `proyectos/x/documents/${ruta}/${id}`, fields: cuerpo.fields });
      }
    }
    return json({ error: { message: `URL NO PREVISTA: ${u}` } }, 500);
  };

  /** Las entradas de bitácora escritas, ya traducidas a objeto plano. */
  estado.bitacora = () => [...estado.documentos.entries()]
    .filter(([k]) => k.startsWith('auditoria_accesos/'))
    .map(([, f]) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, deValorDePrueba(v)])));

  estado.perfil = (uid) => {
    const f = estado.documentos.get(`usuarios/${uid}`);
    return f ? Object.fromEntries(Object.entries(f).map(([k, v]) => [k, deValorDePrueba(v)])) : null;
  };
  return estado;
}

function deValorDePrueba(v) {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(deValorDePrueba);
  if ('mapValue' in v) return Object.fromEntries(
    Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, deValorDePrueba(x)]));
  return null;
}

// ── El atajo para pedirle algo al trabajador ────────────────────────────────

const entornoDe = (falso, extra = {}) => ({
  PROYECTO_FIREBASE: PROYECTO,
  ORG_PERMITIDA: ORG,
  ORIGEN_PERMITIDO: 'https://ejemplo.invalid',
  CUENTA_DE_SERVICIO,
  PRUEBA_FETCH: falso.fetch,
  PRUEBA_AHORA: ahora,
  PRUEBA_CACHE_TOKEN: new Map(),
  ...extra,
});

/**
 * Los reclamos de un token, sin los campos que pone el formato. Es lo que Google
 * guardaría de esa persona en `customAttributes`.
 */
function reclamosDelToken(token) {
  const c = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  for (const k of ['iss', 'aud', 'iat', 'exp', 'sub', 'email']) delete c[k];
  return c;
}

/**
 * ⚠️ EL ACTOR SE REGISTRA EN EL GOOGLE DE MENTIRA, y no es comodidad: el
 * trabajador comprueba la autoridad de quien llama contra el ESTADO VIVO, no
 * contra el papel que trae. Una sesión cuyo dueño no existe en Google no
 * administra nada — que es justo lo que se quiere. Las pruebas que ejercitan a
 * un administrador apagado o degradado registran ellas mismas su cuenta antes,
 * y entonces esto no la toca.
 */
async function pedir(ruta, { metodo = 'GET', token, cuerpo, falso, entorno = {} } = {}) {
  const g = falso ?? googleDeMentira();
  if (token) {
    const claims = reclamosDelToken(token);
    const uid = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub;
    if (uid && !g.cuentas.has(uid)) {
      g.cuentas.set(uid, {
        localId: uid, email: `${uid}@prueba.invalid`, disabled: false,
        customAttributes: JSON.stringify(claims),
        providerUserInfo: [{ providerId: 'password' }],
      });
    }
  }
  const r = await trabajador.fetch(new Request(`https://personas.invalid${ruta}`, {
    method: metodo,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cuerpo === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  }), entornoDe(g, entorno));
  return { r, cuerpo: await r.clone().json().catch(() => null), google: g };
}

// ════════════════════════════════════════════════════════════════════════════
describe('la falta de configuración APAGA, no abre', () => {
  for (const falta of ['PROYECTO_FIREBASE', 'ORG_PERMITIDA', 'CUENTA_DE_SERVICIO']) {
    test(`sin ${falta} no se administra NADA, y se dice por qué`, async () => {
      const token = await tokenDeAdmin();
      const { r, cuerpo } = await pedir('/usuarios', { token, entorno: { [falta]: undefined } });
      assert.equal(r.status, 503);
      assert.match(cuerpo.error, new RegExp(falta));
      const vacia = await pedir('/usuarios', { token, entorno: { [falta]: '   ' } });
      assert.equal(vacia.r.status, 503, 'una cadena en blanco es lo mismo que ausente');
    });
  }

  test('una cuenta de servicio de OTRO proyecto no administra éste', async () => {
    const otra = JSON.stringify({ ...JSON.parse(CUENTA_DE_SERVICIO), project_id: 'otro-proyecto' });
    const { r, cuerpo } = await pedir('/usuarios', {
      token: await tokenDeAdmin(), entorno: { CUENTA_DE_SERVICIO: otra },
    });
    assert.equal(r.status, 503);
    assert.match(cuerpo.error, /otro proyecto/);
  });

  test('exigir App Check sin saber comprobarlo APAGA: no se finge que se exige', async () => {
    const { r, cuerpo } = await pedir('/usuarios', {
      token: await tokenDeAdmin(), entorno: { APP_CHECK_EXIGIDO: 'true' },
    });
    assert.equal(r.status, 503);
    assert.match(cuerpo.error, /App Check/);
    // Y /salud tiene que decirlo también: si no, el vigía vería un 200 mientras
    // todo lo demás está apagado.
    const salud = await pedir('/salud', { entorno: { APP_CHECK_EXIGIDO: 'true' } });
    assert.equal(salud.r.status, 503);
    assert.match(salud.cuerpo.falta.join(' '), /App Check/);
  });

  test('/salud responde sin sesión y DICE si puede trabajar', async () => {
    const sano = await pedir('/salud');
    assert.equal(sano.r.status, 200);
    assert.equal(sano.cuerpo.ok, true);
    assert.equal(sano.cuerpo.proyecto, PROYECTO);

    const roto = await pedir('/salud', { entorno: { CUENTA_DE_SERVICIO: undefined } });
    assert.equal(roto.r.status, 503, 'un vigía que recibe 200 de un servicio inservible no vigila nada');
    assert.deepEqual(roto.cuerpo.falta, ['CUENTA_DE_SERVICIO']);
    assert.ok(!JSON.stringify(roto.cuerpo).includes('PRIVATE KEY'), 'jamás se enseña el contenido del secreto');
  });
});

describe('la puerta: método, ruta y sesión', () => {
  test('la comprobación previa (OPTIONS) responde sin pedir token', async () => {
    const { r } = await pedir('/usuarios', { metodo: 'OPTIONS' });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('Access-Control-Allow-Methods'), 'GET, POST, PATCH, OPTIONS');
  });

  test('borrar no existe: aquí no se elimina a nadie', async () => {
    const { r } = await pedir('/usuarios/uid-1', { metodo: 'DELETE', token: await tokenDeAdmin() });
    assert.equal(r.status, 405);
  });

  test('una ruta que no existe es 404, no un 500', async () => {
    const token = await tokenDeAdmin();
    assert.equal((await pedir('/lo-que-sea', { token })).r.status, 404);
    assert.equal((await pedir('/usuarios/uid-1/ascender', { metodo: 'POST', token })).r.status, 404);
  });

  test('sin token, 401 — y sin haber preguntado nada a Google', async () => {
    const falso = googleDeMentira();
    const { r } = await pedir('/usuarios', { falso });
    assert.equal(r.status, 401);
    assert.equal(falso.llamadas.length, 0, 'sin sesión no se gasta ni una llamada');
  });

  test('un token firmado por OTRA llave no pasa', async () => {
    const impostor = await generarPar();
    const cabecera = textoAB64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'llave-de-prueba' }));
    const carga = textoAB64Url(JSON.stringify({
      iss: `https://securetoken.google.com/${PROYECTO}`, aud: PROYECTO, sub: 'colado',
      rol: 'admin', orgId: ORG, f: ['ug'], l: ['*'],
      iat: Math.floor(AHORA / 1000), exp: Math.floor(AHORA / 1000) + 3600,
    }));
    const firma = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', impostor.privateKey,
      new TextEncoder().encode(`${cabecera}.${carga}`));
    const token = `${cabecera}.${carga}.${b64url(enBase64(firma))}`;
    const { r, cuerpo } = await pedir('/usuarios', { token });
    assert.equal(r.status, 401);
    assert.match(cuerpo.error, /firma inválida/);
  });

  test('un token caducado no pasa, aunque venga bien firmado', async () => {
    const token = await firmarComoGoogle({
      sub: 'caducado', rol: 'admin', orgId: ORG, f: ['ug'], l: ['*'],
      exp: Math.floor(AHORA / 1000) - 3600,
    });
    const { r, cuerpo } = await pedir('/usuarios', { token });
    assert.equal(r.status, 401);
    assert.match(cuerpo.error, /caducado/);
  });

  test('una sesión de OTRA organización no pasa', async () => {
    const token = await firmarComoGoogle({ sub: 'ajeno', rol: 'admin', orgId: 'otra-empresa', f: ['ug'], l: ['*'] });
    const { r } = await pedir('/usuarios', { token });
    assert.equal(r.status, 403);
  });
});

describe('quién puede administrar personas', () => {
  const ADMINISTRATIVOS = [
    ['GET', '/usuarios', undefined],
    ['POST', '/usuarios', { correo: 'x@prueba.invalid', nombre: 'X', rol: 'cuadrilla', modo: 'enlace' }],
    ['PATCH', '/usuarios/uid-1', { rol: 'editor' }],
    ['POST', '/usuarios/uid-1/deshabilitar', {}],
    ['POST', '/usuarios/uid-1/restituir', {}],
    ['POST', '/usuarios/uid-1/estado', { activo: false }],
    ['POST', '/usuarios/uid-1/contrasena', { modo: 'enlace' }],
    ['POST', '/usuarios/uid-1/reconciliar', {}],
  ];

  for (const [metodo, ruta] of ADMINISTRATIVOS) {
    test(`${metodo} ${ruta}: un editor no pasa`, async () => {
      const token = await firmarComoGoogle({
        sub: nuevoUid(), ...reclamosDe({ orgId: ORG, rol: 'editor' }),
      });
      const cuerpo = ADMINISTRATIVOS.find((x) => x[1] === ruta && x[0] === metodo)[2];
      const { r } = await pedir(ruta, { metodo, token, cuerpo });
      assert.equal(r.status, 403, 'un editor administró personas');
    });
  }

  test('un token de admin ANTERIOR al catálogo (sin la función) no pasa, y se dice qué hacer', async () => {
    // El caso real de la migración: los reclamos que hoy tiene el Ingeniero solo
    // traen `orgId` y `rol`. Reclamo ausente = mínimo privilegio; pero un 403 sin
    // salida es una avería, así que la respuesta dice exactamente qué hacer.
    const token = await firmarComoGoogle({ sub: nuevoUid(), orgId: ORG, rol: 'admin' });
    const { r, cuerpo } = await pedir('/usuarios', { token });
    assert.equal(r.status, 403);
    // La salida ya no es una línea de comandos (retirada, `99 §ADR-100`): es la
    // pantalla de personas, donde el propietario corrige la cuenta.
    assert.match(cuerpo.error, /pantalla de personas/);
  });

  test('un auditor, que sí lee bitácoras, tampoco administra', async () => {
    const token = await firmarComoGoogle({ sub: nuevoUid(), ...reclamosDe({ orgId: ORG, rol: 'auditor' }) });
    assert.equal((await pedir('/usuarios', { token })).r.status, 403);
  });
});

describe('el alta', () => {
  const nueva = (extra = {}) => ({
    correo: 'nueva@prueba.invalid', nombre: 'Persona Nueva', rol: 'cuadrilla', modo: 'enlace', ...extra,
  });

  test('el rol «propietario» NO se acuña desde la aplicación (403 + bitácora)', async () => {
    const falso = googleDeMentira();
    const { r, cuerpo } = await pedir('/usuarios', {
      metodo: 'POST', token: await tokenDeAdmin(), cuerpo: nueva({ rol: 'propietario' }), falso,
    });
    assert.equal(r.status, 403);
    assert.equal(falso.llamadas.filter((l) => l.url.includes('signUp')).length, 0,
      'no se creó ninguna cuenta');
    const [entrada] = falso.bitacora();
    assert.equal(entrada.accion, 'rechazado', 'un intento de acuñar propietario tiene que quedar escrito');
    assert.match(entrada.motivo, /propietario/);
  });

  test('un admin NO nombra a otro admin; el propietario sí', async () => {
    const comoAdmin = await pedir('/usuarios', {
      metodo: 'POST', token: await tokenDeAdmin(), cuerpo: nueva({ rol: 'admin' }),
    });
    assert.equal(comoAdmin.r.status, 403);
    assert.match(comoAdmin.cuerpo.error, /propietario/);

    const comoPropietario = await pedir('/usuarios', {
      metodo: 'POST',
      token: await firmarComoGoogle({ sub: nuevoUid(), ...reclamosDe({ orgId: ORG, rol: 'propietario' }) }),
      cuerpo: nueva({ rol: 'admin' }),
    });
    assert.equal(comoPropietario.r.status, 201);
    assert.equal(comoPropietario.cuerpo.rol, 'admin');
  });

  test('modo enlace: sale un ENLACE y jamás la contraseña', async () => {
    const falso = googleDeMentira();
    const { r, cuerpo } = await pedir('/usuarios', {
      metodo: 'POST', token: await tokenDeAdmin(), cuerpo: nueva(), falso,
    });
    assert.equal(r.status, 201);
    assert.match(cuerpo.enlace, /^https:\/\//);

    // La contraseña con la que nació la cuenta son 256 bits de azar. Se busca en
    // TODO lo que salió: ni en la respuesta, ni en el espejo, ni en la bitácora.
    const alta = falso.llamadas.find((l) => l.url.includes('accounts:signUp'));
    const secreta = alta.cuerpo.password;
    assert.equal(typeof secreta, 'string');
    assert.ok(secreta.length >= 40, 'la contraseña aleatoria tiene que ser larga de verdad');
    const salida = JSON.stringify(cuerpo) + JSON.stringify(falso.bitacora()) + JSON.stringify(falso.perfil(cuerpo.uid));
    assert.ok(!salida.includes(secreta), 'la contraseña que nadie debe ver se escapó');
    assert.ok(!salida.includes('NO-DEBERIA-SALIR-DE-AQUI'), 'se devolvió el token de sesión que Google regala al crear');
  });

  test('modo contraseña: se exige el mínimo del proyecto, no el de Firebase', async () => {
    const falso = googleDeMentira();
    const { r, cuerpo } = await pedir('/usuarios', {
      metodo: 'POST', token: await tokenDeAdmin(), falso,
      cuerpo: nueva({ modo: 'contrasena', contrasena: 'corta1' }),
    });
    assert.equal(r.status, 400);
    assert.match(cuerpo.error, /caracteres/);
    assert.equal(falso.llamadas.filter((l) => l.url.includes('signUp')).length, 0,
      'se creó la cuenta antes de mirar la contraseña');
  });

  test('modo contraseña: nace PROVISIONAL y con la fecha de la orden', async () => {
    const falso = googleDeMentira();
    const { r, cuerpo } = await pedir('/usuarios', {
      metodo: 'POST', token: await tokenDeAdmin(), falso,
      cuerpo: nueva({ modo: 'contrasena', contrasena: 'provisional-2026' }),
    });
    assert.equal(r.status, 201);
    const claims = JSON.parse(falso.cuentas.get(cuerpo.uid).customAttributes);
    assert.equal(claims.passwordProvisional, true);
    assert.equal(claims.contrasenaOrdenadaEn, new Date(AHORA).toISOString());
  });

  test('los permisos que se escriben son EXACTAMENTE los del catálogo', async () => {
    const falso = googleDeMentira();
    const { cuerpo } = await pedir('/usuarios', {
      metodo: 'POST', token: await tokenDeAdmin(), falso,
      cuerpo: nueva({ rol: 'cuadrilla', funcionesExtra: ['informes.generar'], lineas: ['LN-001'] }),
    });
    const claims = JSON.parse(falso.cuentas.get(cuerpo.uid).customAttributes);
    assert.deepEqual(claims, reclamosDe({
      orgId: ORG, rol: 'cuadrilla', funcionesExtra: ['informes.generar'], lineas: ['LN-001'],
    }), 'el trabajador y el catálogo tienen que producir el MISMO token');
  });

  test('una función NO delegable no se regala por la puerta de atrás', async () => {
    const falso = googleDeMentira();
    const { r, cuerpo } = await pedir('/usuarios', {
      metodo: 'POST', token: await tokenDeAdmin(), falso,
      cuerpo: nueva({ funcionesExtra: ['usuarios.gestionar'] }),
    });
    assert.equal(r.status, 400);
    assert.match(cuerpo.error, /no se delega/);
    assert.equal(falso.bitacora()[0].accion, 'rechazado');
  });

  test('el presupuesto del token se mide ANTES de crear nada', async () => {
    const lineas = Array.from({ length: 40 }, (_, i) => `linea-${String(i).padStart(30, '0')}`);
    const falso = googleDeMentira();
    const { r, cuerpo } = await pedir('/usuarios', {
      metodo: 'POST', token: await tokenDeAdmin(), cuerpo: nueva({ lineas }), falso,
    });
    assert.equal(r.status, 400);
    assert.match(cuerpo.error, /bytes/);
    assert.equal(falso.llamadas.filter((l) => l.url.includes('signUp')).length, 0,
      'se creó una cuenta cuyos permisos no caben en su token');
  });

  test('un correo que no es correo se rechaza contra el molde, no a mano', async () => {
    const { r, cuerpo } = await pedir('/usuarios', {
      metodo: 'POST', token: await tokenDeAdmin(), cuerpo: nueva({ correo: 'esto-no-es-un-correo' }),
    });
    assert.equal(r.status, 400);
    assert.match(cuerpo.error, /molde/);
  });

  test('el alta escribe cuenta, permisos, espejo y bitácora — en ese orden', async () => {
    const falso = googleDeMentira();
    const { cuerpo } = await pedir('/usuarios', {
      metodo: 'POST', token: await tokenDeAdmin(), cuerpo: nueva(), falso,
    });
    // Se descartan el llavero, el canje del permiso y la consulta con la que se
    // comprueba la autoridad de quien llama: lo que se mira es el orden de las
    // ESCRITURAS.
    const orden = falso.llamadas.map((l) => l.url).filter((u) =>
      !u.includes('jwk') && !u.includes('oauth2') && !u.includes('accounts:lookup'));
    assert.match(orden[0], /accounts:signUp/);
    assert.match(orden[1], /accounts:update/);
    assert.match(orden[2], /documents\/usuarios\//);
    const perfil = falso.perfil(cuerpo.uid);
    assert.equal(perfil.rol, 'cuadrilla');
    assert.equal(perfil.activo, true);
    assert.equal(perfil.orgId, ORG);
    assert.equal(falso.bitacora().at(-1).accion, 'alta');
  });

  test('si los permisos no se pueden escribir, la cuenta se APAGA y se dice qué quedó a medias', async () => {
    const falso = googleDeMentira();
    const original = falso.fetch;
    let intentos = 0;
    falso.fetch = async (url, o) => {
      if (String(url).includes('accounts:update') && intentos++ === 0) {
        return new Response(JSON.stringify({ error: { message: 'INTERNAL' } }), { status: 500 });
      }
      return original(url, o);
    };
    const { r, cuerpo } = await pedir('/usuarios', {
      metodo: 'POST', token: await tokenDeAdmin(), cuerpo: nueva(), falso,
    });
    assert.equal(r.status, 500, 'nunca un 200 a medias');
    assert.deepEqual(cuerpo.hecho, ['cuenta creada']);
    assert.equal(cuerpo.cuentaApagada, true);
    assert.equal(falso.cuentas.get(cuerpo.uid).disabled, true);
  });
});

describe('el actor sale del TOKEN, jamás del cuerpo', () => {
  test('mandar un actorUid distinto en el cuerpo no cambia quién firma la bitácora', async () => {
    const falso = googleDeMentira();
    const uidReal = nuevoUid();
    const token = await tokenDeAdmin({ sub: uidReal });
    await pedir('/usuarios', {
      metodo: 'POST', token, falso,
      cuerpo: {
        correo: 'otra@prueba.invalid', nombre: 'Otra', rol: 'auditor', modo: 'enlace',
        // Lo que un cliente malicioso intentaría: firmar con el nombre de otro.
        actorUid: 'uid-de-alguien-inocente', actorCorreo: 'inocente@prueba.invalid', orgId: 'otra-empresa',
      },
    });
    const [entrada] = falso.bitacora();
    assert.equal(entrada.actorUid, uidReal);
    assert.equal(entrada.actorCorreo, `${uidReal}@prueba.invalid`);
    assert.equal(entrada.orgId, ORG, 'la organización también sale del entorno, no del cuerpo');
  });
});

describe('la jerarquía: nadie administra a un igual ni a un superior', () => {
  const conCuentas = () => googleDeMentira({
    cuentas: [
      { localId: 'uid-propietario', email: 'duenio@prueba.invalid', customAttributes: JSON.stringify(reclamosDe({ orgId: ORG, rol: 'propietario' })) },
      { localId: 'uid-admin-1', email: 'admin1@prueba.invalid', customAttributes: JSON.stringify(reclamosDe({ orgId: ORG, rol: 'admin' })) },
      { localId: 'uid-admin-2', email: 'admin2@prueba.invalid', customAttributes: JSON.stringify(reclamosDe({ orgId: ORG, rol: 'admin' })) },
      { localId: 'uid-editor', email: 'editor@prueba.invalid', customAttributes: JSON.stringify(reclamosDe({ orgId: ORG, rol: 'editor' })) },
    ],
  });

  for (const [ruta, metodo, cuerpo] of [
    ['/usuarios/uid-propietario', 'PATCH', { rol: 'cuadrilla' }],
    ['/usuarios/uid-propietario/deshabilitar', 'POST', {}],
    ['/usuarios/uid-propietario/restituir', 'POST', {}],
    ['/usuarios/uid-propietario/contrasena', 'POST', { modo: 'enlace' }],
    // ⚠️ `reconciliar` era la ruta con `:uid` a la que le faltaba el veto. No
    // podía subirle el permiso a nadie —va del token al espejo— pero sí escribía
    // `usuarios/{propietario}` firmado por otro (`actualizadoPor`), y el
    // veredicto no dejó ninguna operación de la aplicación con el propietario de
    // sujeto. Su reparación tiene camino propio: `/bootstrap`.
    ['/usuarios/uid-propietario/reconciliar', 'POST', {}],
  ]) {
    test(`al propietario no lo toca la aplicación (${metodo} ${ruta})`, async () => {
      const falso = conCuentas();
      const { r, cuerpo: respuesta } = await pedir(ruta, {
        metodo, cuerpo, falso,
        token: await firmarComoGoogle({ sub: nuevoUid(), ...reclamosDe({ orgId: ORG, rol: 'propietario' }) }),
      });
      assert.equal(r.status, 403, 'ni siquiera otro propietario');
      assert.match(respuesta.error, /rescate|herramienta/);
      assert.equal(falso.bitacora()[0].accion, 'rechazado');
    });
  }

  test('un admin no le repone la contraseña a otro admin: eso es apoderarse de su cuenta', async () => {
    const falso = conCuentas();
    const { r } = await pedir('/usuarios/uid-admin-2/contrasena', {
      metodo: 'POST', cuerpo: { modo: 'contrasena', contrasena: 'unaBuena2026x' }, falso,
      token: await tokenDeAdmin(),
    });
    assert.equal(r.status, 403);
    assert.equal(falso.cuentas.get('uid-admin-2').contrasena, undefined);
  });

  test('el propietario sí puede degradar a un admin (y quedan otros)', async () => {
    const falso = conCuentas();
    const { r, cuerpo } = await pedir('/usuarios/uid-admin-2', {
      metodo: 'PATCH', cuerpo: { rol: 'editor' }, falso,
      token: await firmarComoGoogle({ sub: nuevoUid(), ...reclamosDe({ orgId: ORG, rol: 'propietario' }) }),
    });
    assert.equal(r.status, 200);
    // Solo cambió el rol: las funciones extra y quitadas seguían vacías, y una
    // entrada de bitácora por algo que no cambió es ruido en el rastro.
    assert.deepEqual(cuerpo.cambios, ['rol_cambiado']);
    assert.equal(JSON.parse(falso.cuentas.get('uid-admin-2').customAttributes).rol, 'editor');
  });

  test('un admin sí gestiona a un editor', async () => {
    const falso = conCuentas();
    const { r, cuerpo } = await pedir('/usuarios/uid-editor', {
      metodo: 'PATCH', cuerpo: { lineas: ['LN-001', 'LN-002'] }, falso, token: await tokenDeAdmin(),
    });
    assert.equal(r.status, 200);
    assert.deepEqual(cuerpo.cambios, ['alcance_cambiado']);
    assert.deepEqual(JSON.parse(falso.cuentas.get('uid-editor').customAttributes).l, ['LN-001', 'LN-002']);
    const [entrada] = falso.bitacora();
    assert.equal(entrada.accion, 'alcance_cambiado');
    assert.deepEqual(entrada.despues.lineas, ['LN-001', 'LN-002']);
  });
});

describe('el fusible: no quedarse sin nadie que administre', () => {
  // ⚠️ EL CASO REAL ES ACTUAR SOBRE UNO MISMO, y no es un detalle: como la
  // autoridad se comprueba contra el estado vivo, quien opera es siempre un
  // administrador ACTIVO. Actuando sobre otra persona, la organización nunca se
  // queda a oscuras — queda él. La única forma de apagar la última luz es
  // apagarse uno, bajándose el rol o cerrándose la cuenta.
  const yoSolo = (otros = []) => googleDeMentira({
    cuentas: [
      { localId: 'uid-unico-admin', email: 'unico@prueba.invalid', customAttributes: JSON.stringify(reclamosDe({ orgId: ORG, rol: 'admin' })) },
      { localId: 'uid-editor', email: 'editor@prueba.invalid', customAttributes: JSON.stringify(reclamosDe({ orgId: ORG, rol: 'editor' })) },
      ...otros,
    ],
  });
  const miTokenDeAdmin = () => firmarComoGoogle({
    sub: 'uid-unico-admin', email: 'unico@prueba.invalid', ...reclamosDe({ orgId: ORG, rol: 'admin' }),
  });

  test('bajarse el rol siendo el último administrador: 409 con su motivo', async () => {
    const falso = yoSolo();
    const { r, cuerpo } = await pedir('/usuarios/uid-unico-admin', {
      metodo: 'PATCH', cuerpo: { rol: 'editor' }, falso, token: await miTokenDeAdmin(),
    });
    assert.equal(r.status, 409);
    assert.match(cuerpo.error, /última persona activa/);
    assert.equal(JSON.parse(falso.cuentas.get('uid-unico-admin').customAttributes).rol, 'admin');
  });

  test('apagarse siendo el último administrador, tampoco', async () => {
    const falso = yoSolo();
    const { r } = await pedir('/usuarios/uid-unico-admin/estado', {
      metodo: 'POST', cuerpo: { activo: false }, falso, token: await miTokenDeAdmin(),
    });
    assert.equal(r.status, 409);
    assert.equal(falso.cuentas.get('uid-unico-admin').disabled, false);
  });

  test('una cuenta DESHABILITADA no cuenta como relevo', async () => {
    // Es el fallo sutil del fusible: contar cuentas apagadas haría creer que hay
    // relevo donde no lo hay, y la última llave se perdería igualmente.
    const falso = yoSolo([{
      localId: 'uid-admin-apagado', email: 'apagado@prueba.invalid', disabled: true,
      customAttributes: JSON.stringify(reclamosDe({ orgId: ORG, rol: 'admin' })),
    }]);
    const { r } = await pedir('/usuarios/uid-unico-admin', {
      metodo: 'PATCH', cuerpo: { rol: 'auditor' }, falso, token: await miTokenDeAdmin(),
    });
    assert.equal(r.status, 409);
  });

  test('con relevo vivo, bajarse el rol SÍ se puede: el fusible no estorba', async () => {
    const falso = yoSolo([{
      localId: 'uid-otro-admin', email: 'otro@prueba.invalid',
      customAttributes: JSON.stringify(reclamosDe({ orgId: ORG, rol: 'admin' })),
    }]);
    const { r, cuerpo } = await pedir('/usuarios/uid-unico-admin', {
      metodo: 'PATCH', cuerpo: { rol: 'editor' }, falso, token: await miTokenDeAdmin(),
    });
    assert.equal(r.status, 200);
    assert.deepEqual(cuerpo.cambios, ['rol_cambiado']);
    assert.equal(JSON.parse(falso.cuentas.get('uid-unico-admin').customAttributes).rol, 'editor');
  });

  test('un administrador de OTRA organización no sirve de relevo', async () => {
    const falso = yoSolo([{
      localId: 'uid-admin-ajeno', email: 'ajeno@prueba.invalid',
      customAttributes: JSON.stringify({ orgId: 'otra-empresa', rol: 'admin', f: ['ug'], l: ['*'] }),
    }]);
    const { r } = await pedir('/usuarios/uid-unico-admin/estado', {
      metodo: 'POST', cuerpo: { activo: false }, falso, token: await miTokenDeAdmin(),
    });
    assert.equal(r.status, 409);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA AUTORIDAD SALE DEL ESTADO VIVO, NO DEL PAPEL
// ----------------------------------------------------------------------------
// Un token de identidad de Firebase vive hasta una hora y NO se invalida al
// apagar una cuenta ni al cambiarle el rol. Si este trabajador se fiara solo del
// papel, degradar a un administrador le dejaría una hora larga para crearse otra
// cuenta de administrador — y la degradación no habría servido de nada. Es el
// fallo clásico de los sistemas con reclamos, y aquí el reclamo reparte llaves.
// ════════════════════════════════════════════════════════════════════════════
describe('la autoridad sale del estado vivo', () => {
  test('una cuenta APAGADA con el token todavía vivo no administra', async () => {
    const claims = reclamosDe({ orgId: ORG, rol: 'admin' });
    const falso = googleDeMentira({
      cuentas: [{ localId: 'uid-ex', email: 'ex@prueba.invalid', disabled: true, customAttributes: JSON.stringify(claims) }],
    });
    const { r, cuerpo } = await pedir('/usuarios', {
      falso, token: await firmarComoGoogle({ sub: 'uid-ex', email: 'ex@prueba.invalid', ...claims }),
    });
    assert.equal(r.status, 403);
    assert.match(cuerpo.error, /apagada/);
  });

  test('una cuenta DEGRADADA no administra, aunque su token siga diciendo admin', async () => {
    const falso = googleDeMentira({
      cuentas: [{
        localId: 'uid-degradado', email: 'degradado@prueba.invalid',
        customAttributes: JSON.stringify(reclamosDe({ orgId: ORG, rol: 'editor' })),
      }],
    });
    const { r } = await pedir('/usuarios', {
      falso,
      token: await firmarComoGoogle({
        sub: 'uid-degradado', email: 'degradado@prueba.invalid', ...reclamosDe({ orgId: ORG, rol: 'admin' }),
      }),
    });
    assert.equal(r.status, 403);
  });

  test('un token que dice «propietario» no nombra administradores si Google dice «admin»', async () => {
    const falso = googleDeMentira({
      cuentas: [{
        localId: 'uid-ambicioso', email: 'ambicioso@prueba.invalid',
        customAttributes: JSON.stringify(reclamosDe({ orgId: ORG, rol: 'admin' })),
      }],
    });
    const { r, cuerpo } = await pedir('/usuarios', {
      metodo: 'POST', falso,
      cuerpo: { correo: 'nuevo-admin@prueba.invalid', nombre: 'Nuevo', rol: 'admin', modo: 'enlace' },
      token: await firmarComoGoogle({
        sub: 'uid-ambicioso', email: 'ambicioso@prueba.invalid', ...reclamosDe({ orgId: ORG, rol: 'propietario' }),
      }),
    });
    assert.equal(r.status, 403);
    assert.match(cuerpo.error, /propietario/);
    assert.equal(falso.llamadas.filter((l) => l.url.includes('signUp')).length, 0);
  });

  test('una cuenta que ya no existe en Google no administra', async () => {
    const falso = googleDeMentira();
    falso.cuentas.clear();
    const token = await tokenDeAdmin();
    // Se pide sin pasar por el atajo que registra al actor: la cuenta no existe.
    const r = await trabajador.fetch(new Request('https://personas.invalid/usuarios', {
      headers: { Authorization: `Bearer ${token}` },
    }), entornoDe(falso));
    assert.equal(r.status, 403);
  });
});

describe('apagar y restituir', () => {
  const conEditor = () => googleDeMentira({
    cuentas: [
      { localId: 'uid-jefe', email: 'jefe@prueba.invalid', customAttributes: JSON.stringify(reclamosDe({ orgId: ORG, rol: 'admin' })) },
      { localId: 'uid-editor', email: 'editor@prueba.invalid', customAttributes: JSON.stringify(reclamosDe({ orgId: ORG, rol: 'editor' })) },
    ],
    documentos: new Map([['usuarios/uid-editor', {
      orgId: { stringValue: ORG }, correo: { stringValue: 'editor@prueba.invalid' },
      nombre: { stringValue: 'Editora' }, rol: { stringValue: 'editor' },
      funcionesExtra: { arrayValue: { values: [] } }, funcionesQuitadas: { arrayValue: { values: [] } },
      lineas: { arrayValue: { values: [{ stringValue: '*' }] } }, activo: { booleanValue: true },
      creadoEn: { stringValue: '2026-01-01T00:00:00.000Z' }, creadoPor: { stringValue: 'uid-jefe' },
    }]]),
  });

  test('deshabilitar SIEMPRE toca Auth: un documento no es una credencial', async () => {
    const falso = conEditor();
    const { r } = await pedir('/usuarios/uid-editor/deshabilitar', {
      metodo: 'POST', falso, token: await tokenDeAdmin(),
    });
    assert.equal(r.status, 200);
    const cuenta = falso.cuentas.get('uid-editor');
    assert.equal(cuenta.disabled, true, 'se marcó el documento y se dejó la cuenta entrando');
    assert.ok(cuenta.validSince, 'sin revocar, el token viejo sigue valiendo hasta una hora');
    const claims = JSON.parse(cuenta.customAttributes);
    assert.deepEqual(claims.f, [], 'los permisos tienen que quedar vacíos');
    assert.deepEqual(claims.l, []);
    assert.equal(falso.perfil('uid-editor').activo, false);
    assert.equal(falso.bitacora()[0].accion, 'deshabilitado');
  });

  test('apagar una cuenta SIN aprovisionar no le regala organización', async () => {
    // La cuenta intrusa del 31-07-2026: existe, no tiene reclamos, y apagarla no
    // puede ser la primera vez que alguien le escribe un `orgId`.
    const falso = googleDeMentira({
      cuentas: [{ localId: 'uid-intrusa', email: 'colada@prueba.invalid', customAttributes: '{}' }],
    });
    const { r } = await pedir('/usuarios/uid-intrusa/deshabilitar', {
      metodo: 'POST', falso, token: await tokenDeAdmin(),
    });
    assert.equal(r.status, 200);
    assert.equal(falso.cuentas.get('uid-intrusa').disabled, true);
    assert.deepEqual(JSON.parse(falso.cuentas.get('uid-intrusa').customAttributes), {});
  });

  test('apagar deja el espejo COMPLETO: sin él, restituir tendría que adivinar', async () => {
    // El caso que ensancharía permisos: alguien con UNA línea a su cargo se apaga
    // sin espejo; al apagar se le vacía el alcance del token, y recuperarlo
    // después solo se podría adivinando «todas». Aquí el perfil entero se guarda
    // ANTES de vaciar nada.
    const falso = googleDeMentira({
      cuentas: [{
        localId: 'uid-de-una-linea', email: 'unalinea@prueba.invalid', displayName: 'De Una Línea',
        customAttributes: JSON.stringify(reclamosDe({ orgId: ORG, rol: 'cuadrilla', lineas: ['LN-627'] })),
      }],
    });
    const { r } = await pedir('/usuarios/uid-de-una-linea/deshabilitar', {
      metodo: 'POST', falso, token: await tokenDeAdmin(),
    });
    assert.equal(r.status, 200);
    const espejo = falso.perfil('uid-de-una-linea');
    assert.equal(espejo.rol, 'cuadrilla');
    assert.deepEqual(espejo.lineas, ['LN-627'], 'el alcance se perdió al apagar');
    assert.equal(espejo.activo, false);

    // Y restituir lo devuelve EXACTAMENTE como estaba, sin ensanchar.
    const vuelta = await pedir('/usuarios/uid-de-una-linea/restituir', {
      metodo: 'POST', falso, token: await tokenDeAdmin(),
    });
    assert.equal(vuelta.r.status, 200);
    assert.deepEqual(JSON.parse(falso.cuentas.get('uid-de-una-linea').customAttributes).l, ['LN-627']);
  });

  test('reconciliar NO refleja unos permisos vaciados a propósito', async () => {
    const falso = googleDeMentira({
      cuentas: [{
        localId: 'uid-apagado', email: 'apagado@prueba.invalid', disabled: true,
        customAttributes: JSON.stringify({ orgId: ORG, rol: 'cuadrilla', f: [], l: [] }),
      }],
    });
    const { r, cuerpo } = await pedir('/usuarios/uid-apagado/reconciliar', {
      metodo: 'POST', falso, token: await tokenDeAdmin(),
    });
    assert.equal(r.status, 409, 'reflejar un alcance vacío solo se puede escribiendo «todas»');
    assert.match(cuerpo.error, /vaciados a propósito/);
  });

  test('restituir devuelve los permisos que decía el espejo', async () => {
    const falso = conEditor();
    falso.cuentas.get('uid-editor').disabled = true;
    falso.cuentas.get('uid-editor').customAttributes = JSON.stringify({ orgId: ORG, rol: 'editor', f: [], l: [] });
    const { r } = await pedir('/usuarios/uid-editor/estado', {
      metodo: 'POST', cuerpo: { activo: true }, falso, token: await tokenDeAdmin(),
    });
    assert.equal(r.status, 200);
    const cuenta = falso.cuentas.get('uid-editor');
    assert.equal(cuenta.disabled, false);
    assert.deepEqual(JSON.parse(cuenta.customAttributes), reclamosDe({ orgId: ORG, rol: 'editor' }));
    assert.equal(falso.bitacora()[0].accion, 'restituido');
  });

  test('sin espejo NO se adivina: 409 con qué hacer', async () => {
    const falso = googleDeMentira({
      cuentas: [{ localId: 'uid-sin-espejo', email: 'huerfana@prueba.invalid', disabled: true, customAttributes: JSON.stringify({ orgId: ORG, rol: 'cuadrilla', f: [], l: [] }) }],
    });
    const { r, cuerpo } = await pedir('/usuarios/uid-sin-espejo/restituir', {
      metodo: 'POST', falso, token: await tokenDeAdmin(),
    });
    assert.equal(r.status, 409);
    assert.match(cuerpo.error, /PATCH|corrección/);
  });
});

describe('reconciliar: del token al espejo, nunca al revés', () => {
  test('si ya coinciden, no se escribe nada', async () => {
    const claims = reclamosDe({ orgId: ORG, rol: 'cuadrilla' });
    const falso = googleDeMentira({
      cuentas: [{ localId: 'uid-p', email: 'p@prueba.invalid', displayName: 'Pe', customAttributes: JSON.stringify(claims) }],
      documentos: new Map([['usuarios/uid-p', {
        orgId: { stringValue: ORG }, correo: { stringValue: 'p@prueba.invalid' }, nombre: { stringValue: 'Pe' },
        rol: { stringValue: 'cuadrilla' }, funcionesExtra: { arrayValue: { values: [] } },
        funcionesQuitadas: { arrayValue: { values: [] } },
        lineas: { arrayValue: { values: [{ stringValue: '*' }] } }, activo: { booleanValue: true },
        creadoEn: { stringValue: '2026-01-01T00:00:00.000Z' }, creadoPor: { stringValue: 'uid-jefe' },
      }]]),
    });
    const { r, cuerpo } = await pedir('/usuarios/uid-p/reconciliar', {
      metodo: 'POST', falso, token: await tokenDeAdmin(),
    });
    assert.equal(r.status, 200);
    assert.equal(cuerpo.cambios, false);
    const escrituras = falso.llamadas.filter((l) => l.metodo === 'PATCH');
    assert.equal(escrituras.length, 0, 'escribió un espejo que ya estaba bien');
  });

  test('si divergen, manda el TOKEN y el espejo se rehace', async () => {
    const falso = googleDeMentira({
      cuentas: [{ localId: 'uid-p', email: 'p@prueba.invalid', displayName: 'Pe', customAttributes: JSON.stringify(reclamosDe({ orgId: ORG, rol: 'cuadrilla' })) }],
      documentos: new Map([['usuarios/uid-p', {
        orgId: { stringValue: ORG }, correo: { stringValue: 'p@prueba.invalid' }, nombre: { stringValue: 'Pe' },
        rol: { stringValue: 'admin' }, activo: { booleanValue: true },
        creadoEn: { stringValue: '2026-01-01T00:00:00.000Z' }, creadoPor: { stringValue: 'uid-jefe' },
      }]]),
    });
    const { cuerpo } = await pedir('/usuarios/uid-p/reconciliar', {
      metodo: 'POST', falso, token: await tokenDeAdmin(),
    });
    assert.equal(cuerpo.cambios, true);
    assert.equal(falso.perfil('uid-p').rol, 'cuadrilla', 'el espejo decía admin: el token manda');
    // Y NO se han tocado los permisos reales: reconciliar no asciende a nadie.
    assert.equal(falso.llamadas.filter((l) => l.url.includes('accounts:update')).length, 0);
    assert.equal(falso.bitacora()[0].accion, 'reconciliado');
  });
});

describe('la lista', () => {
  test('nunca salen ni el hash de la contraseña ni su sal', async () => {
    const falso = googleDeMentira({
      cuentas: [{
        localId: 'uid-p', email: 'p@prueba.invalid', displayName: 'Pe',
        customAttributes: JSON.stringify(reclamosDe({ orgId: ORG, rol: 'editor' })),
        passwordHash: 'HASH-QUE-NO-DEBE-SALIR', salt: 'SAL-QUE-NO-DEBE-SALIR',
        providerUserInfo: [{ providerId: 'password', rawId: 'p@prueba.invalid' }],
        lastLoginAt: '1757073600000', createdAt: '1750000000000',
      }],
    });
    const { r, cuerpo } = await pedir('/usuarios', { token: await tokenDeAdmin(), falso });
    assert.equal(r.status, 200);
    const texto = JSON.stringify(cuerpo);
    assert.ok(!texto.includes('HASH-QUE-NO-DEBE-SALIR'));
    assert.ok(!texto.includes('SAL-QUE-NO-DEBE-SALIR'));
    assert.equal(cuerpo.usuarios[0].rol, 'editor');
    assert.deepEqual(cuerpo.usuarios[0].proveedores, ['password']);
    assert.equal(r.headers.get('cache-control'), 'no-store');
  });

  test('las cuentas SIN aprovisionar van aparte, y se ven', async () => {
    const falso = googleDeMentira({
      cuentas: [
        { localId: 'uid-p', email: 'p@prueba.invalid', customAttributes: JSON.stringify(reclamosDe({ orgId: ORG, rol: 'editor' })) },
        { localId: 'uid-colada', email: 'colada@prueba.invalid', customAttributes: '{}' },
        { localId: 'uid-ajena', email: 'ajena@prueba.invalid', customAttributes: JSON.stringify({ orgId: 'otra', rol: 'admin' }) },
      ],
    });
    const { cuerpo } = await pedir('/usuarios', { token: await tokenDeAdmin(), falso });
    // Dos aprovisionadas: la editora y quien pregunta, que también es una persona.
    assert.equal(cuerpo.usuarios.length, 2);
    assert.equal(cuerpo.sinAprovisionar.length, 1);
    assert.equal(cuerpo.sinAprovisionar[0].correo, 'colada@prueba.invalid');
    assert.ok(!JSON.stringify(cuerpo).includes('ajena@prueba.invalid'), 'se enseñó una cuenta de otra organización');
  });

  test('dice qué roles puede repartir quien pregunta, para que la pantalla no mienta', async () => {
    const comoAdmin = await pedir('/usuarios', { token: await tokenDeAdmin() });
    assert.deepEqual(comoAdmin.cuerpo.puedeAsignar, ['editor', 'cuadrilla', 'auditor']);
    const comoPropietario = await pedir('/usuarios', {
      token: await firmarComoGoogle({ sub: nuevoUid(), ...reclamosDe({ orgId: ORG, rol: 'propietario' }) }),
    });
    assert.deepEqual(comoPropietario.cuerpo.puedeAsignar, ['admin', 'editor', 'cuadrilla', 'auditor']);
  });

  test('marca quién tiene el espejo divergente', async () => {
    const falso = googleDeMentira({
      cuentas: [{ localId: 'uid-p', email: 'p@prueba.invalid', displayName: 'Pe', customAttributes: JSON.stringify(reclamosDe({ orgId: ORG, rol: 'editor' })) }],
      documentos: new Map([['usuarios/uid-p', { rol: { stringValue: 'admin' }, orgId: { stringValue: ORG } }]]),
    });
    const { cuerpo } = await pedir('/usuarios', { token: await tokenDeAdmin(), falso });
    assert.equal(cuerpo.usuarios[0].desincronizado, true);
    assert.equal(cuerpo.usuarios[0].espejo, 'divergente');
  });

  test('si el espejo no se puede LEER, no se afirma que falte', async () => {
    const falso = googleDeMentira({ fallaFirestore: true });
    falso.cuentas.set('uid-p', { localId: 'uid-p', email: 'p@prueba.invalid', customAttributes: JSON.stringify(reclamosDe({ orgId: ORG, rol: 'editor' })) });
    const { cuerpo } = await pedir('/usuarios', { token: await tokenDeAdmin(), falso });
    assert.equal(cuerpo.espejoLegible, false);
    assert.equal(cuerpo.usuarios[0].espejo, 'desconocido');
    assert.equal(cuerpo.usuarios[0].desincronizado, false);
  });
});

describe('la bitácora que falla se CUENTA, no se traga', () => {
  test('la operación se reporta hecha, y la respuesta dice que el registro falló', async () => {
    const falso = googleDeMentira();
    const original = falso.fetch;
    falso.fetch = async (url, o) => {
      if (String(url).includes('auditoria_accesos')) {
        return new Response(JSON.stringify({ error: { message: 'PERMISSION_DENIED' } }), { status: 403 });
      }
      return original(url, o);
    };
    const { r, cuerpo } = await pedir('/usuarios', {
      metodo: 'POST', token: await tokenDeAdmin(), falso,
      cuerpo: { correo: 'sin-registro@prueba.invalid', nombre: 'Sin Registro', rol: 'auditor', modo: 'enlace' },
    });
    assert.equal(r.status, 201, 'la cuenta se creó de verdad: negarlo sería mentir al revés');
    assert.equal(cuerpo.bitacora, 'fallo');
    const salud = await pedir('/salud');
    assert.ok(salud.cuerpo.fallosDeBitacora >= 1, 'el fallo tiene que verse en /salud');
  });
});

describe('el freno de escrituras y el ahorro de firmas', () => {
  test('a la escritura 31 en diez minutos se responde 429', async () => {
    const uid = 'uid-insistente';
    const token = await tokenDeAdmin({ sub: uid });
    const falso = googleDeMentira();
    let ultimo = 0;
    for (let i = 0; i < 31; i += 1) {
      const { r } = await pedir('/usuarios', {
        metodo: 'POST', token, falso,
        cuerpo: { correo: `n${i}@prueba.invalid`, nombre: `N${i}`, rol: 'auditor', modo: 'enlace' },
      });
      ultimo = r.status;
    }
    assert.equal(ultimo, 429);
    const consulta = await pedir('/usuarios', { token, falso });
    assert.equal(consulta.r.status, 200, 'el freno es de ESCRITURAS: consultar sigue funcionando');
  });

  test('el permiso de administración se firma UNA vez y se reutiliza', async () => {
    // La firma RSA es lo único que gasta los 10 ms de CPU del plan gratuito; la
    // espera de la red no cuenta. Sin caché, cada operación pagaría otra firma.
    const falso = googleDeMentira();
    const cache = new Map();
    const token = await tokenDeAdmin();
    for (let i = 0; i < 3; i += 1) {
      await trabajador.fetch(new Request('https://personas.invalid/usuarios', {
        headers: { Authorization: `Bearer ${token}` },
      }), entornoDe(falso, { PRUEBA_CACHE_TOKEN: cache }));
    }
    assert.equal(falso.firmasDeAcceso, 1, 'se volvió a firmar teniendo un permiso vivo');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL ARRANQUE Y LA LIMPIEZA (`99 §ADR-100`) — lo que el comité del delta exigió
// ════════════════════════════════════════════════════════════════════════════

const UID_PROPIETARIO = 'uid-propietario-configurado';
const S = Math.floor(AHORA / 1000);

/** Una sesión SIN reclamos, como la de la cuenta recién creada en la consola. */
const tokenVirgen = (extra = {}) => firmarComoGoogle({
  sub: UID_PROPIETARIO, email: 'propietario@prueba.invalid',
  auth_time: S - 30, firebase: { sign_in_provider: 'password' }, ...extra,
});

/** Un Google en el que la cuenta del propietario existe y aún no arrancó. */
const googleConPropietarioVirgen = (extra = {}) => googleDeMentira({
  cuentas: [{ localId: UID_PROPIETARIO, email: 'propietario@prueba.invalid', customAttributes: '{}',
    providerUserInfo: [{ providerId: 'password' }] }],
  ...extra,
});

const ENT_PROP = { PROPIETARIO_UID: UID_PROPIETARIO };

describe('/estado: sin sesión, sin revelar nada', () => {
  test('dice si está configurado y si ya arrancó, sin uid ni correo', async () => {
    const g = googleConPropietarioVirgen();
    const { r, cuerpo } = await pedir('/estado', { falso: g, entorno: ENT_PROP });
    assert.equal(r.status, 200);
    assert.equal(cuerpo.configurado, true);
    assert.equal(cuerpo.arrancado, false);
    assert.ok(!JSON.stringify(cuerpo).includes(UID_PROPIETARIO), 'reveló el uid del propietario');
  });

  test('sin PROPIETARIO_UID no está configurado', async () => {
    const { cuerpo } = await pedir('/estado', { falso: googleConPropietarioVirgen() });
    assert.equal(cuerpo.configurado, false);
  });
});

describe('el propietario es intocable también por UID (`99 §ADR-100`)', () => {
  // ── El propietario es intocable por UID, no solo por rol ──────────────────
  // Es la mitad que de verdad protege: si sus reclamos se corrompen —un rol
  // borrado a medias, un `customAttributes` vacío— la comprobación por ROL deja
  // de reconocerlo y, sin el ancla al uid configurado, la cuenta de rescate
  // pasaría a ser una cuenta cualquiera justo el día en que está averiada.
  for (const [ruta, metodo, cuerpo] of [
    [`/usuarios/${UID_PROPIETARIO}`, 'PATCH', { rol: 'cuadrilla' }],
    [`/usuarios/${UID_PROPIETARIO}/reconciliar`, 'POST', {}],
    [`/usuarios/${UID_PROPIETARIO}/deshabilitar`, 'POST', {}],
    [`/usuarios/${UID_PROPIETARIO}/contrasena`, 'POST', { modo: 'enlace' }],
  ]) {
    test(`con los reclamos CORROMPIDOS sigue intocable, por uid (${metodo} ${ruta})`, async () => {
      const falso = googleDeMentira({
        cuentas: [{
          localId: UID_PROPIETARIO, email: 'duenio@prueba.invalid',
          // Sin rol: por ROL ya no se le reconoce. Solo lo salva `PROPIETARIO_UID`.
          customAttributes: '{}', providerUserInfo: [{ providerId: 'password' }],
        }],
      });
      const { r, cuerpo: respuesta } = await pedir(ruta, {
        metodo, cuerpo, falso, entorno: ENT_PROP, token: await tokenDeAdmin(),
      });
      assert.equal(r.status, 403, JSON.stringify(respuesta));
      assert.match(respuesta.error, /rescate/);
      assert.equal(falso.bitacora()[0].accion, 'rechazado', 'un intento así tiene que quedar escrito');
      // Y no se tocó nada: ni la cuenta de Auth ni su espejo.
      assert.equal(falso.cuentas.get(UID_PROPIETARIO).customAttributes, '{}');
      assert.equal(falso.perfil(UID_PROPIETARIO), null, 'escribió el espejo del propietario');
    });
  }
});

describe('/bootstrap: el arranque de un solo uso', () => {
  test('⚠️ sin PROPIETARIO_UID falla CERRADO: nadie se corona por una variable ausente', async () => {
    const { r } = await pedir('/bootstrap', { metodo: 'POST', token: await tokenVirgen(), falso: googleConPropietarioVirgen(), cuerpo: {} });
    assert.equal(r.status, 503);
  });

  test('exige haber entrado con contraseña, no con un proveedor federado', async () => {
    const token = await tokenVirgen({ firebase: { sign_in_provider: 'google.com' } });
    const { r } = await pedir('/bootstrap', { metodo: 'POST', token, falso: googleConPropietarioVirgen(), cuerpo: {}, entorno: ENT_PROP });
    assert.equal(r.status, 403);
  });

  test('exige una sesión RECIENTE (cinco minutos)', async () => {
    const token = await tokenVirgen({ auth_time: S - 3600 });
    const { r, cuerpo } = await pedir('/bootstrap', { metodo: 'POST', token, falso: googleConPropietarioVirgen(), cuerpo: {}, entorno: ENT_PROP });
    assert.equal(r.status, 403);
    assert.match(cuerpo.error, /reciente/);
  });

  test('⚠️ otro uid, aunque tenga sesión válida, recibe 403 y queda en la bitácora', async () => {
    const token = await firmarComoGoogle({ sub: 'uid-intruso', email: 'x@prueba.invalid', auth_time: S - 10,
      firebase: { sign_in_provider: 'password' } });
    const g = googleConPropietarioVirgen();
    const { r, google } = await pedir('/bootstrap', { metodo: 'POST', token, falso: g, cuerpo: {}, entorno: ENT_PROP });
    assert.equal(r.status, 403);
    assert.ok(google.bitacora().some((e) => e.accion === 'rechazado' && e.actorUid === 'uid-intruso'));
  });

  test('la primera vez arranca: reclamos de propietario, espejo, cerrojo y bitácora', async () => {
    const g = googleConPropietarioVirgen();
    const { r, cuerpo, google } = await pedir('/bootstrap', { metodo: 'POST', token: await tokenVirgen(), falso: g, cuerpo: {}, entorno: ENT_PROP });
    assert.equal(r.status, 200, JSON.stringify(cuerpo));
    assert.equal(cuerpo.reparado, false);
    const escritos = JSON.parse(google.cuentas.get(UID_PROPIETARIO).customAttributes);
    assert.deepEqual(escritos, reclamosDe({ orgId: ORG, rol: 'propietario', lineas: ['*'] }));
    assert.ok(google.documentos.has('config/arranque'), 'no se puso el cerrojo');
    assert.equal(google.perfil(UID_PROPIETARIO).rol, 'propietario');
    assert.ok(google.bitacora().some((e) => e.accion === 'bootstrap'));
    assert.ok(google.cuentas.get(UID_PROPIETARIO).validSince, 'no cortó la sesión con la que arrancó');
  });

  test('⚠️ la segunda vez, con OTRO uid, es 409 para siempre — aunque no haya propietario vivo', async () => {
    const g = googleConPropietarioVirgen();
    await pedir('/bootstrap', { metodo: 'POST', token: await tokenVirgen(), falso: g, cuerpo: {}, entorno: ENT_PROP });
    // Se simula un rearme malicioso: el propietario desaparece de Auth y otro
    // correo se configura como propietario. El cerrojo sigue ahí: 409.
    g.cuentas.delete(UID_PROPIETARIO);
    const token = await firmarComoGoogle({ sub: 'uid-otro', email: 'otro@prueba.invalid', auth_time: S - 10,
      firebase: { sign_in_provider: 'password' } });
    g.cuentas.set('uid-otro', { localId: 'uid-otro', email: 'otro@prueba.invalid', disabled: false, customAttributes: '{}',
      providerUserInfo: [{ providerId: 'password' }] });
    const { r } = await pedir('/bootstrap', { metodo: 'POST', token, falso: g, cuerpo: {}, entorno: { PROPIETARIO_UID: 'uid-otro' } });
    assert.equal(r.status, 409);
  });

  test('el MISMO uid puede volver a llamar: repara sus reclamos, no acuña otro', async () => {
    const g = googleConPropietarioVirgen();
    await pedir('/bootstrap', { metodo: 'POST', token: await tokenVirgen(), falso: g, cuerpo: {}, entorno: ENT_PROP });
    // Reclamos corrompidos a medias.
    g.cuentas.get(UID_PROPIETARIO).customAttributes = JSON.stringify({ orgId: ORG, rol: 'propietario' });
    const { r, cuerpo, google } = await pedir('/bootstrap', { metodo: 'POST', token: await tokenVirgen(), falso: g, cuerpo: {}, entorno: ENT_PROP });
    assert.equal(r.status, 200);
    assert.equal(cuerpo.reparado, true);
    assert.deepEqual(JSON.parse(google.cuentas.get(UID_PROPIETARIO).customAttributes),
      reclamosDe({ orgId: ORG, rol: 'propietario', lineas: ['*'] }));
  });

  test('⚠️ CARRERA: dos llamadas a la vez, una sola gana', async () => {
    // El cerrojo es una escritura con precondición en Google, no una lectura
    // previa: la segunda falla en el servidor, no en una comprobación nuestra.
    const g = googleConPropietarioVirgen();
    const t = await tokenVirgen();
    const [a, b] = await Promise.all([
      pedir('/bootstrap', { metodo: 'POST', token: t, falso: g, cuerpo: {}, entorno: ENT_PROP }),
      pedir('/bootstrap', { metodo: 'POST', token: t, falso: g, cuerpo: {}, entorno: ENT_PROP }),
    ]);
    const codigos = [a.r.status, b.r.status].sort();
    // Mismo uid: la segunda entra como reparación (200) o como 409 según el
    // orden de llegada; lo que NO puede pasar es que se escriba el cerrojo dos
    // veces ni que se acuñen dos propietarios distintos.
    assert.ok(codigos.every((c) => c === 200 || c === 409), String(codigos));
    assert.equal(g.bitacora().filter((e) => e.accion === 'bootstrap' && e.despues?.reparado === false).length, 1,
      'se acuñó más de una vez');
  });
});

describe('/limpieza-inicial: ensayo y borrado con red', () => {
  /** Un proyecto con el propietario ya arrancado y tres cuentas viejas. */
  async function proyectoParaLimpiar() {
    const g = googleConPropietarioVirgen({
      cuentas: [
        { localId: UID_PROPIETARIO, email: 'propietario@prueba.invalid', customAttributes: '{}', providerUserInfo: [{ providerId: 'password' }] },
        { localId: 'uid-vieja-1', email: 'vieja1@prueba.invalid', customAttributes: JSON.stringify({ orgId: ORG, rol: 'admin' }), providerUserInfo: [{ providerId: 'google.com' }] },
        { localId: 'uid-vieja-2', email: 'vieja2@prueba.invalid', customAttributes: '{}', providerUserInfo: [{ providerId: 'google.com' }] },
        { localId: 'uid-vieja-3', email: 'vieja3@prueba.invalid', disabled: true, customAttributes: '{}', providerUserInfo: [{ providerId: 'google.com' }] },
      ],
    });
    await pedir('/bootstrap', { metodo: 'POST', token: await tokenVirgen(), falso: g, cuerpo: {}, entorno: ENT_PROP });
    return g;
  }
  const ENT_LIMPIA = { ...ENT_PROP, LIMPIEZA_TOKEN: 'secreto-de-un-solo-uso' };
  const tokenPropietario = () => firmarComoGoogle({ sub: UID_PROPIETARIO, email: 'propietario@prueba.invalid',
    auth_time: S - 30, firebase: { sign_in_provider: 'password' },
    ...reclamosDe({ orgId: ORG, rol: 'propietario', lineas: ['*'] }) });

  test('un admin (no propietario) no ensaya ni borra', async () => {
    const g = await proyectoParaLimpiar();
    const { r } = await pedir('/limpieza-inicial?simular=1', { token: await tokenDeAdmin(), falso: g, entorno: ENT_LIMPIA });
    assert.equal(r.status, 403);
  });

  test('el ensayo lista todo menos el propietario, enmascara correos y deja constancia', async () => {
    const g = await proyectoParaLimpiar();
    const { r, cuerpo, google } = await pedir('/limpieza-inicial?simular=1', { token: await tokenPropietario(), falso: g, entorno: ENT_LIMPIA });
    assert.equal(r.status, 200, JSON.stringify(cuerpo));
    assert.equal(cuerpo.total, 3);
    assert.ok(!cuerpo.uids.includes(UID_PROPIETARIO));
    assert.ok(cuerpo.cuentas.every((c) => /…@/.test(c.correo)), 'un correo sin enmascarar');
    assert.ok(google.bitacora().some((e) => e.accion === 'limpieza' && e.despues?.simulacion === true));
  });

  test('sin LIMPIEZA_TOKEN no se borra nada (503); con uno distinto, 403', async () => {
    const g = await proyectoParaLimpiar();
    const ensayo = (await pedir('/limpieza-inicial?simular=1', { token: await tokenPropietario(), falso: g, entorno: ENT_LIMPIA })).cuerpo;
    const cuerpo = { total: ensayo.total, uids: ensayo.uids, confirmacion: 'BORRAR', orgId: ORG };
    const sin = await pedir('/limpieza-inicial', { metodo: 'POST', token: await tokenPropietario(), falso: g, cuerpo, entorno: ENT_PROP });
    assert.equal(sin.r.status, 503);
    const mal = await trabajador.fetch(new Request('https://personas.invalid/limpieza-inicial', {
      method: 'POST', headers: { Authorization: `Bearer ${await tokenPropietario()}`, 'content-type': 'application/json', 'X-Limpieza-Token': 'otro' },
      body: JSON.stringify(cuerpo),
    }), entornoDe(g, ENT_LIMPIA));
    assert.equal(mal.status, 403);
    assert.equal(g.borradas, undefined, 'no debía borrar nada');
  });

  async function borrar(g, cuerpo, entorno = ENT_LIMPIA) {
    const r = await trabajador.fetch(new Request('https://personas.invalid/limpieza-inicial', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await tokenPropietario()}`, 'content-type': 'application/json', 'X-Limpieza-Token': 'secreto-de-un-solo-uso' },
      body: JSON.stringify(cuerpo),
    }), entornoDe(g, entorno));
    return { r, cuerpo: await r.clone().json().catch(() => null) };
  }

  test('una lista distinta del ensayo se rechaza (400), y si incluye al propietario también', async () => {
    const g = await proyectoParaLimpiar();
    const { cuerpo: ensayo } = await pedir('/limpieza-inicial?simular=1', { token: await tokenPropietario(), falso: g, entorno: ENT_LIMPIA });
    let x = await borrar(g, { total: 2, uids: ensayo.uids.slice(0, 2), confirmacion: 'BORRAR', orgId: ORG });
    assert.equal(x.r.status, 400);
    x = await borrar(g, { total: 4, uids: [...ensayo.uids, UID_PROPIETARIO], confirmacion: 'BORRAR', orgId: ORG });
    assert.equal(x.r.status, 400);
    x = await borrar(g, { total: 3, uids: ensayo.uids, confirmacion: 'si', orgId: ORG });
    assert.equal(x.r.status, 400);
    assert.equal(g.borradas, undefined, 'borró algo pese al rechazo');
  });

  test('⚠️ el borrado: lápida y bitácora ANTES, en un viaje; batchDelete con force=false; se apaga solo', async () => {
    const g = await proyectoParaLimpiar();
    const { cuerpo: ensayo } = await pedir('/limpieza-inicial?simular=1', { token: await tokenPropietario(), falso: g, entorno: ENT_LIMPIA });
    const x = await borrar(g, { total: ensayo.total, uids: ensayo.uids, confirmacion: 'BORRAR', orgId: ORG });
    assert.equal(x.r.status, 200, JSON.stringify(x.cuerpo));
    assert.equal(x.cuerpo.terminado, true);
    assert.deepEqual([...x.cuerpo.borradas].sort(), ['uid-vieja-1', 'uid-vieja-2', 'uid-vieja-3']);
    // Las tres se apagaron y vaciaron ANTES de borrarse: batchDelete solo cae sobre deshabilitadas.
    const llamadaDelete = g.llamadas.find((l) => l.url.includes('accounts:batchDelete'));
    assert.equal(llamadaDelete.cuerpo.force, false);
    // Lápidas con correo y nombre, y el propietario intacto.
    for (const u of ['uid-vieja-1', 'uid-vieja-2', 'uid-vieja-3']) {
      const lapida = g.perfil(u);
      assert.equal(lapida.activo, false);
      assert.ok(lapida.borradoEn, `sin fecha de borrado en ${u}`);
      assert.ok(lapida.correo.includes('@'), 'la lápida no conserva el correo');
      assert.ok(!g.cuentas.has(u), `${u} sigue en Auth`);
    }
    assert.ok(g.cuentas.has(UID_PROPIETARIO), 'borró al propietario');
    assert.equal(g.bitacora().filter((e) => e.accion === 'borrado').length, 3);
    // Orden: el commit de lápidas ocurrió antes que el batchDelete.
    const iCommit = g.llamadas.findIndex((l) => l.url.endsWith(':commit'));
    const iDelete = g.llamadas.findIndex((l) => l.url.includes('accounts:batchDelete'));
    assert.ok(iCommit < iDelete, 'borró antes de escribir la lápida');
    // Y se apagó sola.
    assert.equal(g.documentos.has('config/limpieza'), true);
    const otra = await borrar(g, { total: 0, uids: [], confirmacion: 'BORRAR', orgId: ORG });
    assert.equal(otra.r.status, 409);
    const ensayo2 = await pedir('/limpieza-inicial?simular=1', { token: await tokenPropietario(), falso: g, entorno: ENT_LIMPIA });
    assert.equal(ensayo2.r.status, 409);
  });

  test('la lápida de una cuenta SIN rol no le inventa uno alto: mínimo, y la verdad en la bitácora', async () => {
    const g = await proyectoParaLimpiar();
    const { cuerpo: ensayo } = await pedir('/limpieza-inicial?simular=1', { token: await tokenPropietario(), falso: g, entorno: ENT_LIMPIA });
    await borrar(g, { total: ensayo.total, uids: ensayo.uids, confirmacion: 'BORRAR', orgId: ORG });

    // `uid-vieja-2` y `uid-vieja-3` no tenían NINGÚN reclamo. El molde exige un
    // rol, así que se rellena con el más pequeño que existe — nunca con uno que
    // pueda leer la bitácora.
    for (const u of ['uid-vieja-2', 'uid-vieja-3']) {
      const lapida = g.perfil(u);
      assert.equal(lapida.rol, 'cuadrilla', `la lápida de ${u} inventa un rol más alto del que tuvo`);
      assert.ok(!puede({ rol: lapida.rol, f: [] }, 'usuarios.auditoria'),
        'una cuenta sin permisos acabó con el rol que lee la bitácora');
      // La verdad, entera, en la entrada de bitácora de esa misma operación.
      const entrada = g.bitacora().find((e) => e.accion === 'borrado' && e.sujetoUid === u);
      assert.equal(entrada.antes.rol, 'ninguno', 'la bitácora tampoco dice la verdad: no queda dónde mirarla');
    }
    // Y el rol de quien SÍ lo tenía se conserva tal cual.
    assert.equal(g.perfil('uid-vieja-1').rol, 'admin');
    assert.equal(g.bitacora().find((e) => e.accion === 'borrado' && e.sujetoUid === 'uid-vieja-1').antes.rol, 'admin');
  });

  test('con más de 8 cuentas se procesa por lotes (202) y se reanuda hasta terminar', async () => {
    const g = await proyectoParaLimpiar();
    for (let i = 4; i <= 12; i += 1) {
      g.cuentas.set(`uid-vieja-${i}`, { localId: `uid-vieja-${i}`, email: `v${i}@prueba.invalid`, disabled: false, customAttributes: '{}', providerUserInfo: [] });
    }
    const { cuerpo: ensayo } = await pedir('/limpieza-inicial?simular=1', { token: await tokenPropietario(), falso: g, entorno: ENT_LIMPIA });
    assert.equal(ensayo.total, 12);
    let x = await borrar(g, { total: 12, uids: ensayo.uids, confirmacion: 'BORRAR', orgId: ORG });
    assert.equal(x.r.status, 202);
    assert.equal(x.cuerpo.hechos, 8);
    assert.equal(x.cuerpo.pendientes, 4);
    // La segunda vuelta manda SOLO lo pendiente, que es lo que devuelve un nuevo ensayo.
    const { cuerpo: ensayo2 } = await pedir('/limpieza-inicial?simular=1', { token: await tokenPropietario(), falso: g, entorno: ENT_LIMPIA });
    assert.equal(ensayo2.total, 4);
    x = await borrar(g, { total: 4, uids: ensayo2.uids, confirmacion: 'BORRAR', orgId: ORG });
    assert.equal(x.r.status, 200);
    assert.equal(x.cuerpo.terminado, true);
    assert.equal(g.cuentas.size, 1, 'quedó alguna cuenta vieja');
  });

  test('el corte de revocación deja fuera al token viejo en este trabajador', async () => {
    const g = await proyectoParaLimpiar();
    const viejo = await firmarComoGoogle({ sub: UID_PROPIETARIO, iat: S - 7200, auth_time: S - 7200,
      ...reclamosDe({ orgId: ORG, rol: 'propietario', lineas: ['*'] }) });
    const { r } = await pedir('/usuarios', { token: viejo, falso: g, entorno: { ...ENT_PROP, REVOCADOS_ANTES_DE: String(S - 3600) } });
    assert.equal(r.status, 401);
  });
});

describe('/mi-contrasena ya no existe', () => {
  test('la ruta responde 404: el cambio de contraseña propio vive en el navegador', async () => {
    const { r } = await pedir('/mi-contrasena', { metodo: 'POST', token: await tokenDeAdmin(), cuerpo: { contrasena: 'x'.repeat(14) + '1' } });
    assert.equal(r.status, 404);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL PREFLIGHT QUE TUMBÓ LA LIMPIEZA EN VIVO (2026-09-06)
// ────────────────────────────────────────────────────────────────────────────
// La pantalla manda el secreto de un solo uso en `X-Limpieza-Token`. Una
// cabecera propia obliga al navegador a preguntar antes (OPTIONS), y si la
// respuesta no la nombra en Allow-Headers, la petición NUNCA sale: la pantalla
// dice «no hubo conexión» y el servidor no se entera. Se probó todo lo demás y
// esto no, porque solo un navegador lo ejerce. Ahora sí hay quien lo mire.
// ════════════════════════════════════════════════════════════════════════════
describe('el preflight deja pasar la cabecera del secreto de limpieza', () => {
  test('OPTIONS declara X-Limpieza-Token entre las cabeceras permitidas', async () => {
    const trabajador = (await import('../usuarios/src/index.js')).default;
    const r = await trabajador.fetch(new Request('https://usuarios.invalid/limpieza-inicial', {
      method: 'OPTIONS',
      headers: { Origin: 'https://ejemplo.invalid', 'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type,x-limpieza-token' },
    }), { PROYECTO_FIREBASE: 'p', ORIGEN_PERMITIDO: 'https://ejemplo.invalid', ORG_PERMITIDA: 'o' });
    assert.equal(r.status, 204);
    assert.match(r.headers.get('Access-Control-Allow-Headers') ?? '', /X-Limpieza-Token/i,
      'sin esta cabecera en Allow-Headers la limpieza muere en el navegador antes de salir');
  });
});
