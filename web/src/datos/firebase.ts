// ============================================================================
// datos/firebase.ts — conexión con Firebase
// ----------------------------------------------------------------------------
// Estos valores son PÚBLICOS por diseño y pueden vivir en el paquete que se
// publica. No son un secreto: la seguridad de este sistema no viene de esconder
// el identificador del proyecto, viene de las reglas de Firestore y de los roles
// en el token. La clave que SÍ es secreta —la de la API de Anthropic— jamás toca
// el navegador: vive solo en Cloud Functions (ADR-004).
// ============================================================================
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  initializeAuth, getAuth, browserLocalPersistence, browserSessionPersistence,
  inMemoryPersistence, browserPopupRedirectResolver, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut as salirDeFirebase, onAuthStateChanged,
  type Auth, type User,
} from 'firebase/auth';
// ⚠️ Firestore NO se importa estáticamente: comprobar si hay sesión solo
// necesita Auth, y quien abre la página sin entrar no debe descargar el motor
// de base de datos entero (hallazgo P0 de la auditoría 2026-07-30). El tipo
// viaja solo (se borra al compilar); el módulo real llega en `baseDatos()`.
import type { Firestore } from 'firebase/firestore';

export const CONFIG = {
  apiKey: 'AIzaSyA3_kG3ow6wl847UNar7DXo2_aINxLVP3A',
  authDomain: 'mantenimiento-lineas-at.firebaseapp.com',
  projectId: 'mantenimiento-lineas-at',
  storageBucket: 'mantenimiento-lineas-at.firebasestorage.app',
  messagingSenderId: '797269656584',
  appId: '1:797269656584:web:f8eba0052160535f757dbd',
} as const;

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

export function iniciarFirebase(): FirebaseApp {
  if (app) return app;
  app = initializeApp(CONFIG);
  return app;
}

/**
 * Caché EN MEMORIA, a propósito.
 *
 * Se probó la caché persistente sobre IndexedDB y tumbó la lectura entera con
 * "Database is closing/hidden": basta una segunda pestaña o que el navegador
 * cierre la base para que un problema de CACHÉ se convierta en un fallo de
 * DATOS. Inaceptable — el dato está en el servidor y se puede leer.
 *
 * Y no se pierde nada importante: el trabajo sin señal en campo NO depende de
 * esta caché. Depende de nuestra propia cola con revisión base y cuarentena
 * (ADR-002), precisamente porque el último-que-escribe-gana de Firestore es
 * inaceptable cuando dos cuadrillas editan el mismo apoyo tras 14 días sin
 * señal. Esta caché solo habría suavizado la oficina con red intermitente.
 *
 * Es ASÍNCRONA porque el módulo de Firestore llega por importación diferida:
 * quien no ha iniciado sesión nunca lo descarga.
 */
export async function baseDatos(): Promise<Firestore> {
  if (db) return db;
  const { getFirestore } = await import('firebase/firestore');
  db = getFirestore(iniciarFirebase());
  return db;
}

let auth: Auth | null = null;

/**
 * Autenticación SIN IndexedDB, a propósito.
 *
 * Por defecto, Firebase Auth guarda la sesión en IndexedDB. Esa base la puede
 * cerrar el navegador por su cuenta —otra pestaña, poca memoria, o sencillamente
 * Safari— y entonces todo revienta con "Database is closing/hidden". Ya nos pasó
 * dos veces, y la segunda después de haber quitado la caché de Firestore
 * creyendo que el culpable era ése: el error venía de aquí.
 *
 * `localStorage` guarda la sesión igual de bien para lo que necesitamos, es
 * síncrono y no se cierra solo. El orden declarado es una cadena de reserva: si
 * una capa no está disponible, se usa la siguiente en vez de fallar.
 *
 * Es la misma regla que ya nos costó una vez: una capa opcional nunca puede
 * tener poder de veto sobre una esencial (`docs/31 · L-11`).
 */
export function autenticacion(): Auth {
  if (auth) return auth;
  const app = iniciarFirebase();
  try {
    auth = initializeAuth(app, {
      persistence: [browserLocalPersistence, browserSessionPersistence, inMemoryPersistence],
      // ⚠️ OBLIGATORIO y fácil de olvidar: `getAuth()` trae este resolvedor de
      // serie, pero `initializeAuth()` NO. Sin él, abrir la ventana de Google
      // falla con `auth/argument-error` — y el error no menciona en ningún
      // momento que lo que falta es esto.
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    // Ya estaba inicializada (recarga en caliente, doble montaje): se reusa.
    auth = getAuth(app);
  }
  return auth;
}

/** Fallos del método de ventana emergente que SÍ tienen salida por redirección. */
const SIN_VENTANA = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
]);

/**
 * Entra con Google. Intenta la ventana emergente y, si el navegador la bloquea,
 * **cae a redirección** en vez de rendirse.
 *
 * No es un adorno: los bloqueadores de ventanas emergentes son comunes, y en
 * varios navegadores de móvil la ventana emergente sencillamente no funciona.
 * Sin esta salida, la cuadrilla se queda fuera del sistema sin entender por qué.
 * Con redirección no hay ventana que bloquear: la propia página va a Google y
 * vuelve.
 */
export async function entrarConGoogle(): Promise<User | null> {
  const a = autenticacion();
  const proveedor = new GoogleAuthProvider();
  try {
    const { user } = await signInWithPopup(a, proveedor);
    olvidarSesion();
    return user;
  } catch (e) {
    const codigo = (e as { code?: string })?.code ?? '';
    if (!SIN_VENTANA.has(codigo)) throw e;
    // La página se va a Google y vuelve; al volver lo recoge `recogerRedireccion`.
    await signInWithRedirect(a, proveedor);
    return null;
  }
}

/**
 * Entra con correo y contraseña. Es la vía DEFINITIVA de esta herramienta.
 *
 * No hay registro: las cuentas las crea el administrador con
 * `herramientas/usuarios.mjs`. Aquí no existe —ni existirá— una función de alta,
 * y eso no es un olvido: es el control. El 31-07-2026 una cuenta ajena se dio
 * de alta sola por «Entrar con Google»; no pudo leer nada porque las reglas
 * exigen `orgId`, pero no debió poder crearse.
 */
export async function entrarConContrasena(correo: string, contrasena: string): Promise<User> {
  const { signInWithEmailAndPassword } = await import('firebase/auth');
  const { user } = await signInWithEmailAndPassword(autenticacion(), correo.trim(), contrasena);
  olvidarSesion();
  return user;
}

/**
 * Traduce el fallo de acceso a algo que una persona entienda —y que NO revele
 * si la cuenta existe—.
 *
 * Firebase unifica a propósito «no existe» y «contraseña mala» en un solo
 * código: distinguirlos permitiría averiguar qué correos están dados de alta
 * probando uno a uno. Aquí se respeta esa unificación en vez de deshacerla por
 * ser más amable.
 */
export function motivoDeFallo(e: unknown): string {
  const c = (e as { code?: string })?.code ?? '';
  if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found') {
    return 'Correo o contraseña incorrectos.';
  }
  if (c === 'auth/user-disabled') return 'Esta cuenta está deshabilitada. Avise al administrador.';
  if (c === 'auth/too-many-requests') return 'Demasiados intentos. Espere unos minutos.';
  if (c === 'auth/invalid-email') return 'Ese correo no tiene un formato válido.';
  if (c === 'auth/network-request-failed') return 'Sin conexión con el servidor de acceso.';
  return 'No se pudo entrar. Inténtelo de nuevo.';
}

/**
 * Recoge el resultado cuando se volvió de Google por redirección. Se llama al
 * arrancar; si no hubo redirección, devuelve null sin hacer ruido.
 */
export async function recogerRedireccion(): Promise<User | null> {
  try {
    const r = await getRedirectResult(autenticacion());
    if (r?.user) olvidarSesion();
    return r?.user ?? null;
  } catch {
    return null;   // no había redirección pendiente: no es un error
  }
}

export async function salir(): Promise<void> {
  await salirDeFirebase(autenticacion());
  olvidarSesion();
}

let sesionCache: Promise<User | null> | null = null;

/**
 * Espera a que Firebase resuelva si hay sesión.
 *
 * ⚠️ Tiene dos cuidados que no son adorno, los dos aprendidos a golpes:
 *
 * 1. `onAuthStateChanged` PUEDE invocar su callback de forma SÍNCRONA cuando ya
 *    conoce el estado. Si dentro del callback se llama a la función de baja
 *    antes de que la asignación haya terminado, revienta con un error que nadie
 *    atrapa y la promesa **no se resuelve jamás**: la pantalla se queda en
 *    "Cargando…" para siempre. Por eso se da de baja después, no dentro.
 * 2. Hay **tope de tiempo**. Colgarse es el peor final posible: un error se ve y
 *    se reintenta; un giro infinito no dice nada y no ofrece salida.
 */
export function esperarSesion(): Promise<User | null> {
  if (sesionCache) return sesionCache;

  sesionCache = new Promise<User | null>((resolver, rechazar) => {
    let parar: (() => void) | undefined;
    let resuelto = false;

    const cerrar = (fn: () => void) => {
      if (resuelto) return;
      resuelto = true;
      queueMicrotask(() => parar?.());
      fn();
    };

    const reloj = setTimeout(
      () => cerrar(() => rechazar(new Error('Firebase no respondió a tiempo. Revise su conexión.'))),
      15000,
    );

    parar = onAuthStateChanged(
      autenticacion(),
      (u) => { clearTimeout(reloj); cerrar(() => resolver(u)); },
      (e) => { clearTimeout(reloj); cerrar(() => rechazar(e)); },
    );

    if (resuelto) parar?.();
  });

  // Un fallo no debe quedar cacheado para siempre: el reintento tiene que poder
  // volver a preguntar.
  sesionCache.catch(() => { sesionCache = null; });
  return sesionCache;
}

/** Tras entrar o salir, la sesión cacheada deja de valer. */
export function olvidarSesion(): void { sesionCache = null; }

/** El rol y la organización viven en el token, no en un documento consultable. */
export async function credenciales(u: User): Promise<{ orgId: string; rol: string }> {
  const t = await u.getIdTokenResult();
  return {
    orgId: (t.claims.orgId as string) ?? '',
    rol: (t.claims.rol as string) ?? 'ninguno',
  };
}
