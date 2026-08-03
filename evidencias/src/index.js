// ============================================================================
// evidencias — el portero de las fotos
// ----------------------------------------------------------------------------
// PROBLEMA QUE RESUELVE: el depósito de objetos nace privado y la aplicación
// web no tiene servidor. Sin algo en medio, las únicas salidas eran hacer el
// depósito PÚBLICO —y dejar las fotos de un cliente accesibles en internet para
// cualquiera con el enlace— o dejar las fotos fuera del sistema. Ninguna sirve.
//
// Este trabajador es ese algo en medio, y hace UNA cosa: comprueba que quien
// pide una foto trae una sesión válida de la organización dueña del dato, y
// solo entonces la entrega. No escribe, no borra y no lista — pero eso es una
// COSTUMBRE de este archivo, no un permiso: el binding de R2 expone el depósito
// entero, con `put`, `delete` y `list`. Se dice porque una barrera imaginaria
// es peor que ninguna: el día que alguien relaje la de verdad, la decisión se
// tomará contando con una protección que no existe (§ADR-013, hallazgo 19).
//
// EL INVARIANTE QUE HAY QUE MANTENER — un depósito, una organización
//   Con un token válido, este portero responde 404 si el objeto no existe y 200
//   si existe, o sea que quien pasa puede tantear qué hay en el depósito. Hoy
//   eso no filtra nada, porque el depósito guarda los datos de UNA sola
//   organización y quien pasa pertenece a ella y puede ver todas sus fotos. Deja
//   de ser cierto en el momento en que entre una segunda: entonces hay que
//   prefijar las claves por organización (`<orgId>/<línea>/…`) y exigir el
//   prefijo aquí. `PREFIJO_EVIDENCIAS` existe justo para eso y está preparado
//   más abajo; hoy va vacío, y eso también se dice en vez de suponerlo.
//
// POR QUÉ VERIFICA LA FIRMA Y NO SE FÍA DEL TOKEN
//   Un token es un papel que cualquiera puede escribir. Lo que no puede
//   falsificar es la FIRMA de Google. Por eso se descargan las llaves públicas
//   de Google y se verifica la firma criptográficamente, además de comprobar
//   para qué proyecto se emitió, quién lo emitió y que no haya caducado. Un
//   portero que solo mira si el papel "tiene pinta de token" no es un portero.
//
// LO QUE ESTE TRABAJADOR NO HACE, A PROPÓSITO
//   · No emite tokens ni toca contraseñas: de eso se encarga Firebase.
//   · No decide qué foto corresponde a qué expediente: eso lo dicen las fichas
//     de la base, y las reglas de Firestore ya gobiernan quién las lee.
//   · No cachea la imagen en el borde: son datos de cliente; se sirven con
//     `private` para que ninguna caché intermedia se quede una copia.
// ============================================================================

const JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

/** Llaves públicas de Google, cacheadas en memoria del aislado. */
let llaves = null;
let llavesHasta = 0;

async function llavesDeGoogle() {
  const ahora = Date.now();
  if (llaves && ahora < llavesHasta) return llaves;
  const r = await fetch(JWKS);
  if (!r.ok) throw new Error('no se pudieron leer las llaves públicas de Google');
  const { keys } = await r.json();
  // Se respeta el `max-age` que manda Google: sus llaves rotan, y cachearlas
  // más de la cuenta convierte una rotación normal en una caída total.
  const cc = r.headers.get('cache-control') ?? '';
  const max = Number(/max-age=(\d+)/.exec(cc)?.[1] ?? 3600);
  llaves = Object.fromEntries(keys.map((k) => [k.kid, k]));
  llavesHasta = ahora + Math.min(max, 86400) * 1000;
  return llaves;
}

const b64url = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

/**
 * Verifica un token de identidad de Firebase. Devuelve sus datos o lanza.
 *
 * ⚠️ El orden importa: primero la FIRMA, después el contenido. Al revés se
 * estarían leyendo como ciertos unos datos que todavía no se sabe si alguien
 * escribió a mano.
 */
async function verificarToken(token, proyecto) {
  const partes = token.split('.');
  if (partes.length !== 3) throw new Error('token mal formado');
  const [cabeceraB64, cuerpoB64, firmaB64] = partes;

  const cabecera = JSON.parse(new TextDecoder().decode(b64url(cabeceraB64)));
  if (cabecera.alg !== 'RS256') throw new Error('algoritmo no admitido');

  const jwk = (await llavesDeGoogle())[cabecera.kid];
  if (!jwk) throw new Error('la llave del token no está entre las de Google');

  const llave = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
  );
  const firmado = new TextEncoder().encode(`${cabeceraB64}.${cuerpoB64}`);
  const valida = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', llave, b64url(firmaB64), firmado);
  if (!valida) throw new Error('firma inválida');

  const cuerpo = JSON.parse(new TextDecoder().decode(b64url(cuerpoB64)));
  const ahora = Math.floor(Date.now() / 1000);
  if (cuerpo.aud !== proyecto) throw new Error('el token es de otro proyecto');
  if (cuerpo.iss !== `https://securetoken.google.com/${proyecto}`) throw new Error('emisor inesperado');
  if (!cuerpo.sub) throw new Error('token sin sujeto');
  // ⚠️ Se comprueba que la marca de tiempo EXISTA y sea un número, no solo que
  // esté dentro de rango. Con `exp` ausente, `undefined <= n` vale `false` y el
  // token pasaba: un token sin caducidad no caducaba nunca. Este mismo archivo
  // ya sabía hacerlo —tres líneas más arriba comprueba la presencia de `sub`— y
  // no lo hacía ni para `exp` ni para `iat`. Hoy no es explotable (solo Google
  // firma con esa llave, y Firebase siempre emite `exp`), pero una comprobación
  // que depende de lo que el emisor tenga a bien incluir no es una comprobación
  // (§ADR-013, hallazgo 17).
  //
  // Los 60 s de holgura cubren el desfase entre el reloj de ESTE trabajador y el
  // de Google, NO el del móvil: la comparación es contra el reloj propio.
  if (typeof cuerpo.exp !== 'number' || cuerpo.exp <= ahora - 60) throw new Error('token caducado');
  if (typeof cuerpo.iat !== 'number' || cuerpo.iat > ahora + 60) throw new Error('token emitido en el futuro');
  return cuerpo;
}

const cabecerasCors = (origen, permitido) => ({
  'Access-Control-Allow-Origin': origen === permitido ? origen : permitido,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
});

const noPasa = (motivo, codigo, cors) =>
  new Response(JSON.stringify({ error: motivo }), {
    status: codigo,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors },
  });

export default {
  async fetch(peticion, entorno) {
    const url = new URL(peticion.url);
    const cors = cabecerasCors(peticion.headers.get('Origin') ?? '', entorno.ORIGEN_PERMITIDO);

    if (peticion.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (peticion.method !== 'GET') return noPasa('solo se puede leer', 405, cors);

    // ⚠️ FALLAR CERRADO. Antes la comprobación de organización era
    // `if (ORG_PERMITIDA && sesion.orgId !== ORG_PERMITIDA)`: si la variable
    // faltaba, la comprobación entera se saltaba y CUALQUIER sesión válida del
    // proyecto —o sea, cualquiera con una cuenta de Google— bajaba fotos de
    // cliente. Nada fallaba y nada avisaba: la puerta quedaba abierta en
    // silencio. Una seguridad que depende de que una variable esté PUESTA no es
    // seguridad; es una casualidad de configuración.
    //
    // Ahora la ausencia de configuración APAGA el servicio en vez de abrirlo.
    // Un 503 con su motivo es ruidoso y se arregla en un minuto; una fuga
    // silenciosa no se descubre hasta que ya pasó.
    for (const [nombre, valor] of Object.entries({
      PROYECTO_FIREBASE: entorno.PROYECTO_FIREBASE,
      ORG_PERMITIDA: entorno.ORG_PERMITIDA,
    })) {
      if (typeof valor !== 'string' || !valor.trim()) {
        return noPasa(`el portero no está configurado (falta ${nombre}): no se sirve nada`, 503, cors);
      }
    }

    // Rutas: /e/<clave del objeto>. Nada más existe.
    if (!url.pathname.startsWith('/e/')) return noPasa('ruta desconocida', 404, cors);

    // ⚠️ `decodeURIComponent` LANZA con un porcentaje suelto (`/e/%`), y estaba
    // fuera de todo try/catch: Cloudflare respondía su 500 interno, sin
    // `Access-Control-Allow-Origin`, y la galería mostraba «HTTP 500» en vez del
    // motivo. La línea siguiente ya devolvía un 400 limpio para `..`; ésta no
    // (§ADR-013, hallazgo 17).
    let clave;
    try {
      clave = decodeURIComponent(url.pathname.slice(3));
    } catch {
      return noPasa('clave inválida: la ruta no está bien codificada', 400, cors);
    }
    // Una clave con ".." podría salirse del prefijo previsto. No debería poder,
    // pero el coste de comprobarlo es cero y el de equivocarse no.
    if (!clave || clave.includes('..')) return noPasa('clave inválida', 400, cors);

    // Acotar el depósito por prefijo. OPCIONAL a propósito, y su ausencia se
    // declara arriba en vez de disimularse: hoy el depósito guarda una sola
    // organización y las claves son `<línea>/<origen>/<huella>-<archivo>`, sin
    // sitio donde meter el `orgId`. El día que entre una segunda organización,
    // esto deja de ser opcional: se migran las claves a `<orgId>/…` y se pone
    // esta variable. Cuando ESTÁ puesta, se exige — nunca se ignora en silencio.
    const prefijo = typeof entorno.PREFIJO_EVIDENCIAS === 'string'
      ? entorno.PREFIJO_EVIDENCIAS.trim() : '';
    if (prefijo && !clave.startsWith(prefijo)) {
      return noPasa('esa evidencia queda fuera del alcance de esta sesión', 403, cors);
    }

    const cabecera = peticion.headers.get('Authorization') ?? '';
    const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;
    if (!token) return noPasa('hace falta iniciar sesión', 401, cors);

    let sesion;
    try {
      sesion = await verificarToken(token, entorno.PROYECTO_FIREBASE);
    } catch (e) {
      return noPasa(`sesión no válida: ${e.message}`, 401, cors);
    }

    // La organización va en el token, no en un documento consultable: es lo que
    // impide que una sesión válida de OTRA empresa lea estas fotos.
    // Sin condicional: si el token no declara organización, o declara otra, no
    // pasa. `undefined !== 'transpower'` es cierto, así que un token sin el
    // reclamo también se rechaza — que es lo correcto.
    if (sesion.orgId !== entorno.ORG_PERMITIDA) {
      return noPasa('esta sesión no pertenece a la organización dueña del dato', 403, cors);
    }

    const objeto = await entorno.EVIDENCIAS.get(clave);
    if (!objeto) return noPasa('no existe esa evidencia', 404, cors);

    const cabeceras = new Headers(cors);
    objeto.writeHttpMetadata(cabeceras);
    cabeceras.set('etag', objeto.httpEtag);
    // `private`: son datos de cliente. Que los cachee el navegador de quien ya
    // está autorizado, y NADIE por el camino.
    cabeceras.set('cache-control', 'private, max-age=3600');
    // La respuesta depende del token: sin esto, una caché intermedia (o el
    // propio navegador) podría devolverla a una petición SIN `Authorization`.
    cabeceras.set('vary', 'Authorization, Origin');
    cabeceras.set('x-content-type-options', 'nosniff');
    // Una imagen servida como documento puede ejecutarse; así no.
    cabeceras.set('content-disposition', 'inline');
    return new Response(objeto.body, { headers: cabeceras });
  },
};
