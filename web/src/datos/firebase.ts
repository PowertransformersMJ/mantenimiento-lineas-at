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
import {
  getFirestore, initializeFirestore, persistentLocalCache,
  persistentMultipleTabManager, type Firestore,
} from 'firebase/firestore';

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
  try {
    // Caché local persistente: es lo que permite que la oficina siga
    // funcionando con la conexión intermitente. NO es el mecanismo de captura
    // de campo — ése es propio, con cola y cuarentena (ADR-002), porque el
    // último-que-escribe-gana de Firestore es inaceptable cuando dos cuadrillas
    // editan el mismo apoyo tras 14 días sin señal.
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    db = getFirestore(app);
  }
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
