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
  getAuth, GoogleAuthProvider, signInWithPopup, signOut as salirDeFirebase,
  onAuthStateChanged, type Auth, type User,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

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
  // Caché EN MEMORIA, a propósito.
  //
  // Se probó la caché persistente sobre IndexedDB y tumbó la lectura entera con
  // "Database is closing/hidden": basta una segunda pestaña o que el navegador
  // cierre la base para que un problema de CACHÉ se convierta en un fallo de
  // DATOS. Inaceptable — el dato está en el servidor y se puede leer.
  //
  // Y no se pierde nada importante: el trabajo sin señal en campo NO depende de
  // esta caché. Depende de nuestra propia cola con revisión base y cuarentena
  // (ADR-002), precisamente porque el último-que-escribe-gana de Firestore es
  // inaceptable cuando dos cuadrillas editan el mismo apoyo tras 14 días sin
  // señal. Esta caché solo habría suavizado la oficina con red intermitente.
  db = getFirestore(app);
  return app;
}

export function baseDatos(): Firestore {
  if (!db) iniciarFirebase();
  return db!;
}

export function autenticacion(): Auth {
  return getAuth(iniciarFirebase());
}

export async function entrarConGoogle(): Promise<User> {
  const { user } = await signInWithPopup(autenticacion(), new GoogleAuthProvider());
  return user;
}

export const salir = () => salirDeFirebase(autenticacion());

/** Espera a que Firebase resuelva si hay sesión. Sin esto se pinta un parpadeo. */
export function esperarSesion(): Promise<User | null> {
  return new Promise((resolver) => {
    const parar = onAuthStateChanged(autenticacion(), (u) => { parar(); resolver(u); });
  });
}

/** El rol y la organización viven en el token, no en un documento consultable. */
export async function credenciales(u: User): Promise<{ orgId: string; rol: string }> {
  const t = await u.getIdTokenResult();
  return {
    orgId: (t.claims.orgId as string) ?? '',
    rol: (t.claims.rol as string) ?? 'ninguno',
  };
}
