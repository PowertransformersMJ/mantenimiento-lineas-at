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
  inMemoryPersistence, signOut as salirDeFirebase, onAuthStateChanged,
  type Auth, type User,
} from 'firebase/auth';
// ⚠️ Firestore NO se importa estáticamente: comprobar si hay sesión solo
// necesita Auth, y quien abre la página sin entrar no debe descargar el motor
// de base de datos entero (hallazgo P0 de la auditoría 2026-07-30). El tipo
// viaja solo (se borra al compilar); el módulo real llega en `baseDatos()`.
import type { Firestore } from 'firebase/firestore';
import type { Reclamos } from '@lineas/contratos';
import { leerReclamos } from './permisos';

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
      // Sin `popupRedirectResolver` a propósito: era lo que exigía «Entrar con
      // Google», retirado el 2026-09-06 (`99 §ADR-100`). Volver a ponerlo sin
      // volver a poner un proveedor federado es peso muerto.
    });
  } catch {
    // Ya estaba inicializada (recarga en caliente, doble montaje): se reusa.
    auth = getAuth(app);
  }
  return auth;
}

/**
 * DÓNDE SE GUARDA LA SESIÓN, y quién lo elige.
 *
 * Por defecto **la sesión muere al cerrar el navegador** (`browserSessionPersistence`,
 * o sea `sessionStorage`). Es el defecto conservador: un portátil de oficina
 * compartido, o un teléfono que se presta, no deben dejar la herramienta abierta
 * para el siguiente. Quien marca «Recordar en este dispositivo» pasa a
 * `browserLocalPersistence` y la sesión sobrevive al cierre.
 *
 * ⚠️ NINGUNA DE LAS DOS ES IndexedDB, y eso no es casualidad: es `35 · L-11`, el
 * fallo que tumbó el acceso al dato DOS veces con «Database is closing/hidden».
 * Si mañana alguien añade `indexedDBLocalPersistence` a esta lista, vuelve.
 *
 * Si el navegador no admite el almacén elegido —modo privado agresivo, permisos
 * de sitio—, **no se cae el ingreso**: se sigue con lo que Firebase ya tenía.
 * Una preferencia de comodidad jamás puede impedir entrar (misma regla de L-11).
 */
export async function recordarEnEsteDispositivo(recordar: boolean): Promise<void> {
  try {
    const { setPersistence } = await import('firebase/auth');
    await setPersistence(autenticacion(), recordar ? browserLocalPersistence : browserSessionPersistence);
  } catch (e) {
    console.warn('[acceso] no se pudo fijar dónde se guarda la sesión; se sigue con lo que había:', e);
  }
}

/**
 * Entra con correo y contraseña. Es la vía DEFINITIVA de esta herramienta.
 *
 * No hay registro PÚBLICO: las cuentas las crea quien tiene `usuarios.gestionar`
 * desde la pantalla de personas. Aquí no existe una función de alta, y **eso
 * SOLO no basta**: la API de Firebase deja crear cuentas con la clave pública
 * del proyecto aunque la pantalla no tenga botón. El cierre real está en la
 * consola (Authentication → Settings → User actions → «Enable create» apagado),
 * y es un paso del runbook, no una recomendación (`99 §ADR-100`).
 *
 * «Entrar con Google» SE RETIRÓ el 2026-09-06 por orden del Ingeniero: era una
 * vía de alta pública y el incidente de abajo lo demostró.
 *
 * ⚠️ EL 31-07-2026 UNA CUENTA AJENA SE DIO DE ALTA SOLA por «Entrar con Google».
 * Aquí decía que «no pudo leer NADA porque las reglas exigen orgId», y eso es
 * FALSO: lo desmintió `99 §ADR-024`. Lo cierto, que es distinto y menos cómodo:
 * no pudo tocar ningún dato de activo ni de cliente —esos sí exigen que el
 * `orgId` del documento coincida con el del token—, pero **tuvo abierta
 * `/config` hasta el 06-08-2026**, que era legible para cualquier sesión
 * autenticada. Una cuenta que no debió poder crearse leyó algo durante seis
 * días. Se cerró; se deja escrito porque una frase tranquilizadora y falsa es
 * peor que el agujero: hace que se decida mal el día que se relaja la barrera
 * de verdad.
 */
export async function entrarConContrasena(correo: string, contrasena: string, recordar = false): Promise<User> {
  const { signInWithEmailAndPassword } = await import('firebase/auth');
  await recordarEnEsteDispositivo(recordar);
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
  // Una pestaña abierta desde antes del despliegue conserva el botón de Google
  // en su paquete viejo; contra un proveedor apagado Firebase responde esto.
  if (c === 'auth/operation-not-allowed') {
    return 'El ingreso con Google ya no existe: use su correo y contraseña. Recargue la página.';
  }
  // La consola tiene el registro cerrado: un alta por la API muere aquí.
  if (c === 'auth/admin-restricted-operation') {
    return 'El registro de cuentas está cerrado: pídale acceso al administrador.';
  }
  return 'No se pudo entrar. Inténtelo de nuevo.';
}

/**
 * «OLVIDÉ MI CONTRASEÑA», por la vía estándar de Firebase, desde el navegador.
 *
 * ⚠️ LA RESPUESTA ES LA MISMA EXISTA O NO EL CORREO. Distinguirlas convierte el
 * formulario en un buscador de cuentas dadas de alta (lo vimos hecho en uno de
 * los tres CRM medidos). Por eso esta función NUNCA lanza por «no existe» y la
 * pantalla enseña una sola frase en todos los casos.
 *
 * Va por el cliente y no por el trabajador de personas a propósito: un extremo
 * sin sesión en un Worker sin freno es un enviador de correos abierto a
 * internet (hallazgo del comité, `99 §ADR-100`). Aquí el freno lo pone Firebase.
 */
export const FRASE_RECUPERACION = 'Si el correo existe en el sistema, recibirá un enlace para elegir una contraseña nueva.';

export async function pedirEnlaceDeRecuperacion(correo: string): Promise<string> {
  try {
    const { sendPasswordResetEmail } = await import('firebase/auth');
    await sendPasswordResetEmail(autenticacion(), correo.trim());
  } catch {
    // Misma frase. Un fallo de red también: decir «no se pudo» solo cuando el
    // correo no existe sería la misma fuga por otra puerta.
  }
  return FRASE_RECUPERACION;
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
/**
 * Los reclamos ENTEROS y CÓMO entró la persona.
 *
 * `signInProvider` es el cerrojo fuerte de la puerta de acceso: lo estampa
 * Firebase y **no lo aprovisiona nadie**, así que no depende de que una marca
 * esté bien puesta. Quien entró por Google no tiene contraseña que cambiar.
 */
export async function reclamosDeSesion(u: User): Promise<{ proveedor: string | null; claims: Record<string, unknown> }> {
  try {
    const t = await u.getIdTokenResult();
    return { proveedor: t.signInProvider ?? null, claims: t.claims as Record<string, unknown> };
  } catch {
    // Sin reclamos legibles no se encierra a nadie: se declara vacío y la puerta
    // deja pasar.
    return { proveedor: null, claims: {} };
  }
}

/**
 * QUIÉN ES Y QUÉ PUEDE, en una sola lectura del token.
 *
 * Los tres ejes del catálogo viajan juntos porque se decidieron juntos: el ROL
 * dice quién es, `f` qué puede hacer y `l` sobre qué líneas. La pantalla ya no
 * compara el rol con una cadena en ningún sitio — pregunta por la FUNCIÓN.
 *
 * ⚠️ SI LOS RECLAMOS NO VALIDAN, `claims` es `null` y eso es MÍNIMO PRIVILEGIO,
 * no un fallo que se traga: `motivoDeReclamos` trae la frase que la pantalla
 * tiene que enseñar. Un token de antes del catálogo (sin `f` ni `l`) cae aquí, y
 * es correcto que caiga: las reglas de la base miran esos mismos campos, así que
 * ofrecerle botones sería prometerle escrituras que la base va a negar.
 *
 * `autenticadoEn` es la hora en que Firebase abrió ESTA sesión, no la de emisión
 * del token —que se renueva cada hora—. Es la única base honesta para el reloj
 * absoluto de sesión: con la de emisión, la sesión no caducaría jamás.
 */
export async function credenciales(u: User): Promise<{
  orgId: string; rol: string;
  claims: Reclamos | null; motivoDeReclamos: string | null;
  autenticadoEn: number | null;
}> {
  const t = await u.getIdTokenResult();
  const { claims, motivo } = leerReclamos(t.claims);
  const authTime = Date.parse(String(t.authTime ?? ''));
  return {
    orgId: (t.claims.orgId as string) ?? '',
    rol: (t.claims.rol as string) ?? 'ninguno',
    claims,
    motivoDeReclamos: motivo,
    autenticadoEn: Number.isFinite(authTime) ? authTime : null,
  };
}

// ── APP CHECK: solo si hay clave, y sin fingir que la hay ───────────────────

/**
 * Prueba que quien llama es ESTA aplicación y no un guión ajeno.
 *
 * `CLAUDE.md §1` lo declara «obligatorio desde el día 1» y `docs/05` lo tiene en
 * rojo desde entonces: sin él, el sitio público es un proxy anónimo a Firebase.
 * Esto es la mitad del cliente. La otra mitad —crear la clave de reCAPTCHA y
 * registrar la aplicación— es del Ingeniero, y **sin clave esto NO se
 * inicializa**: se dice en consola y se sigue.
 *
 * ⚠️ Por qué no se fuerza: encender App Check en el servidor antes de que TODOS
 * los clientes lo manden deja fuera a la cuadrilla en campo, que es justo a
 * quien nunca se puede bloquear (`CLAUDE.md §1`, principio 3). El orden correcto
 * es: cliente primero, medir que llegan tokens, y solo entonces exigirlo.
 * Mientras tanto el trabajador de personas corre con `APP_CHECK_EXIGIDO=false`.
 *
 * La clave de sitio de reCAPTCHA v3 **no es un secreto**: viaja en el HTML de
 * cualquier sitio que la use. Por eso puede vivir en `.env.production` con la
 * dirección del portero, y no en `wrangler secret`.
 */
export type EstadoAppCheck = 'activado' | 'sin_clave' | 'fallo';

let appCheck: Promise<EstadoAppCheck> | null = null;

export function iniciarAppCheck(): Promise<EstadoAppCheck> {
  if (appCheck) return appCheck;
  appCheck = (async (): Promise<EstadoAppCheck> => {
    const clave = import.meta.env.VITE_APP_CHECK_SITE_KEY as string | undefined;
    if (!clave) {
      console.info(
        '[App Check] no se inicializa: no hay VITE_APP_CHECK_SITE_KEY en la configuración. '
        + 'El sitio sigue funcionando igual; lo que falta es la prueba de que quien llama a '
        + 'Firebase es esta aplicación.',
      );
      return 'sin_clave';
    }
    try {
      const { initializeAppCheck, ReCaptchaV3Provider } = await import('firebase/app-check');
      initializeAppCheck(iniciarFirebase(), {
        provider: new ReCaptchaV3Provider(clave),
        isTokenAutoRefreshEnabled: true,
      });
      return 'activado';
    } catch (e) {
      // Un fallo aquí NO puede impedir entrar: es una capa opcional y ya sabemos
      // lo que pasa cuando una de ésas tiene veto sobre una esencial (`35 · L-11`).
      console.warn('[App Check] no se pudo inicializar; el sitio sigue funcionando:', e);
      return 'fallo';
    }
  })();
  return appCheck;
}
