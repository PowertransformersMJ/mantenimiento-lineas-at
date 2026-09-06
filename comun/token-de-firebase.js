// ============================================================================
// token-de-firebase.js — comprobar que quien llama es quien dice ser
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE ESTE ARCHIVO Y NO DOS COPIAS. Desde hoy hay DOS trabajadores
// que reciben peticiones del navegador con una sesión encima: el portero de las
// fotos (`evidencias/`) y el administrativo de personas (`usuarios/`). Los dos
// tienen que hacer exactamente la misma pregunta —«¿esta sesión es de verdad, es
// de este proyecto y no ha caducado?»— y la respuesta correcta es la MISMA en
// los dos sitios.
//
// Dos copias de una comprobación de seguridad no se quedan iguales: una recibe
// el arreglo y la otra no. Ya pasó dentro de este repositorio con la regla de la
// contraseña (estaba escrita en la herramienta y otra vez en la pantalla, con
// mínimos distintos: 12 y 6), y el catálogo de permisos empieza con tres casos
// medidos de lo mismo en sistemas ajenos. Una definición, dos consumidores.
//
// POR QUÉ SE VERIFICA LA FIRMA Y NO SE MIRA EL CONTENIDO DEL TOKEN
//   Un token es un papel que cualquiera puede escribir. Lo que no se puede
//   falsificar es la FIRMA de Google. Por eso se descargan sus llaves públicas y
//   se comprueba criptográficamente, además de mirar para qué proyecto se
//   emitió, quién lo emitió y que no haya caducado. Un portero que solo mira si
//   el papel «tiene pinta de token» no es un portero.
//
// LAS COSTURAS DE PRUEBA (`fetch` y reloj) SON PARÁMETROS, NO GLOBALES
//   Sin ellas, probar esto exige salir a internet, y una suite que necesita red
//   no se corre. Con ellas, las pruebas generan un par de llaves de verdad,
//   firman un token de verdad y comprueban que este archivo lo acepta —o lo
//   rechaza— por las razones correctas. En producción esos parámetros no se
//   pasan y se usan los globales de siempre.
// ============================================================================

/** El llavero público de Firebase. Es un dato público: no es un secreto. */
export const JWKS_FIREBASE =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

/**
 * Llaves de Google cacheadas en memoria del aislado. Es la única caché global
 * del archivo y solo se usa cuando NO se inyecta `fetch`: en pruebas, cada
 * llamada trae las suyas, para que una prueba no pueda envenenar a la siguiente.
 */
const cacheDeLlaves = { llaves: null, hasta: 0 };

const traerCon = (opciones) =>
  typeof opciones?.fetch === 'function' ? opciones.fetch : (...a) => fetch(...a);
const ahoraCon = (opciones) =>
  typeof opciones?.ahora === 'function' ? opciones.ahora() : Date.now();

/** Descarga (o recuerda) las llaves públicas de Google, indexadas por `kid`. */
export async function llavesDeGoogle(opciones = {}) {
  const propias = typeof opciones.fetch === 'function';
  const ahora = ahoraCon(opciones);
  if (!propias && cacheDeLlaves.llaves && ahora < cacheDeLlaves.hasta) return cacheDeLlaves.llaves;

  const r = await traerCon(opciones)(JWKS_FIREBASE);
  if (!r.ok) throw new Error('no se pudieron leer las llaves públicas de Google');
  const { keys } = await r.json();
  const llaves = Object.fromEntries(keys.map((k) => [k.kid, k]));

  // Se respeta el `max-age` que manda Google: sus llaves rotan, y cachearlas
  // más de la cuenta convierte una rotación normal en una caída total.
  if (!propias) {
    const cc = r.headers.get('cache-control') ?? '';
    const max = Number(/max-age=(\d+)/.exec(cc)?.[1] ?? 3600);
    cacheDeLlaves.llaves = llaves;
    cacheDeLlaves.hasta = ahora + Math.min(max, 86400) * 1000;
  }
  return llaves;
}

/** base64url → bytes. Lo usan la firma y las dos mitades del token. */
export const b64url = (s) => {
  const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

/**
 * Verifica un token de identidad de Firebase. Devuelve sus datos o LANZA.
 *
 * ⚠️ El orden importa: primero la FIRMA, después el contenido. Al revés se
 * estarían leyendo como ciertos unos datos que todavía no se sabe si alguien
 * escribió a mano.
 */
export async function verificarToken(token, proyecto, opciones = {}) {
  const partes = String(token ?? '').split('.');
  if (partes.length !== 3) throw new Error('token mal formado');
  const [cabeceraB64, cuerpoB64, firmaB64] = partes;

  const cabecera = JSON.parse(new TextDecoder().decode(b64url(cabeceraB64)));
  if (cabecera.alg !== 'RS256') throw new Error('algoritmo no admitido');

  const jwk = (await llavesDeGoogle(opciones))[cabecera.kid];
  if (!jwk) throw new Error('la llave del token no está entre las de Google');

  const llave = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
  );
  const firmado = new TextEncoder().encode(`${cabeceraB64}.${cuerpoB64}`);
  const valida = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', llave, b64url(firmaB64), firmado);
  if (!valida) throw new Error('firma inválida');

  const cuerpo = JSON.parse(new TextDecoder().decode(b64url(cuerpoB64)));
  const ahora = Math.floor(ahoraCon(opciones) / 1000);
  if (cuerpo.aud !== proyecto) throw new Error('el token es de otro proyecto');
  if (cuerpo.iss !== `https://securetoken.google.com/${proyecto}`) throw new Error('emisor inesperado');
  if (!cuerpo.sub) throw new Error('token sin sujeto');
  // ⚠️ Se comprueba que la marca de tiempo EXISTA y sea un número, no solo que
  // esté dentro de rango. Con `exp` ausente, `undefined <= n` vale `false` y el
  // token pasaba: un token sin caducidad no caducaba nunca. Hoy no es explotable
  // (solo Google firma con esa llave, y Firebase siempre emite `exp`), pero una
  // comprobación que depende de lo que el emisor tenga a bien incluir no es una
  // comprobación (§ADR-013, hallazgo 17).
  //
  // Los 60 s de holgura cubren el desfase entre el reloj del TRABAJADOR y el de
  // Google, NO el del móvil: la comparación es contra el reloj propio.
  if (typeof cuerpo.exp !== 'number' || cuerpo.exp <= ahora - 60) throw new Error('token caducado');
  if (typeof cuerpo.iat !== 'number' || cuerpo.iat > ahora + 60) throw new Error('token emitido en el futuro');

  // ══════════════════════════════════════════════════════════════════════════
  // EL CORTE DE REVOCACIÓN — `99 §ADR-100`
  // ──────────────────────────────────────────────────────────────────────────
  // Un token de Firebase vive una hora y NO se invalida al deshabilitar, revocar
  // ni BORRAR la cuenta: Google solo deja de emitir tokens nuevos. Hasta hoy los
  // dos trabajadores comprobaban firma, proyecto, emisor y caducidad, y nada
  // más, así que una cuenta borrada seguía bajando y subiendo fotos hasta
  // sesenta minutos después (lo midió el comité del delta).
  //
  // La solución no necesita consultar a Google en cada petición: una MARCA DE
  // TIEMPO en la configuración de los dos trabajadores. Todo token emitido
  // antes de esa marca se rechaza, aquí, en el mismo sitio en que se comprueba
  // la firma. Al ejecutar la limpieza inicial se pone la marca = ahora en los
  // DOS trabajadores y la revocación pasa a ser inmediata en las dos puertas.
  // Es un número; cuesta cero.
  // ══════════════════════════════════════════════════════════════════════════
  const corte = opciones.revocadosAntesDe;
  if (typeof corte === 'number' && Number.isFinite(corte) && corte > 0 && cuerpo.iat < corte) {
    throw new Error('sesión anterior a la revocación: salga y vuelva a entrar');
  }
  return cuerpo;
}

/**
 * Lee la marca `REVOCADOS_ANTES_DE` del entorno del trabajador y la devuelve en
 * segundos desde la época, o `null` si no está puesta.
 *
 * Admite las dos formas en que un humano la escribe —una fecha ISO
 * («2026-09-06T03:00:00Z») o los segundos («1788663600»)— y **una marca que no
 * se entiende APAGA el trabajador** (lanza), no se ignora: una revocación que
 * se cree puesta y no lo está es peor que ninguna.
 */
export function revocadosAntesDeDe(entorno) {
  const crudo = entorno?.REVOCADOS_ANTES_DE;
  if (crudo === undefined || crudo === null) return null;
  const t = String(crudo).trim();
  if (!t) return null;
  if (/^\d{9,12}$/.test(t)) return Number(t);
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) {
    throw new Error(`REVOCADOS_ANTES_DE no se entiende («${t}»): use una fecha ISO o segundos desde la época`);
  }
  return Math.floor(ms / 1000);
}
