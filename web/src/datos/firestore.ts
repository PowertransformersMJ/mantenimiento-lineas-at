// ============================================================================
// datos/firestore.ts — el repositorio real
// ----------------------------------------------------------------------------
// Lee de Firestore lo que las reglas permitan. No inventa nada: si no hay
// sesión, lo dice; si no hay líneas asignadas, lo dice.
//
// Valida CADA documento contra el contrato antes de usarlo. No es paranoia: es
// la frontera. Un documento que no cumple el esquema no entra al cálculo — y el
// cálculo es lo que el Ingeniero firma.
// ============================================================================
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { Apoyo, Hipotesis, Linea } from '@lineas/contratos';
import { baseDatos, esperarSesion, credenciales } from './firebase';
import type { EstadoDatos, EstadoSesion, Repositorio } from './repositorio';

/** Convierte lo que venga de la base en algo que el contrato acepte, o lo descarta. */
function validar<T>(esquema: { safeParse: (x: unknown) => { success: boolean; data?: T } }, crudo: unknown): T | null {
  const r = esquema.safeParse(crudo);
  return r.success && r.data ? r.data : null;
}

export const repositorioFirestore: Repositorio = {
  async sesion(): Promise<EstadoSesion> {
    const u = await esperarSesion();
    if (!u) return { fase: 'sin_sesion' };
    return { fase: 'autenticado', uid: u.uid, correo: u.email };
  },

  async listarLineas(): Promise<Linea[]> {
    const u = await esperarSesion();
    if (!u) return [];
    const { orgId } = await credenciales(u);
    if (!orgId) return [];   // sin organización en el token no hay nada que ver

    const q = query(
      collection(baseDatos(), 'lineas'),
      where('orgId', '==', orgId),
      where('activa', '==', true),
      limit(50),
    );
    const s = await getDocs(q);
    return s.docs.map((d) => validar<Linea>(Linea, d.data())).filter((x): x is Linea => x !== null);
  },

  async cargarLinea(lineaId: string): Promise<EstadoDatos> {
    const u = await esperarSesion();
    if (!u) return { fase: 'sin_sesion' };

    const db = baseDatos();
    const dLinea = await getDoc(doc(db, 'lineas', lineaId));
    if (!dLinea.exists()) return { fase: 'vacio' };

    const linea = validar<Linea>(Linea, dLinea.data());
    if (!linea) {
      return { fase: 'error', mensaje: 'La línea guardada no cumple el contrato del sistema. No se muestra por seguridad.' };
    }
    if (!linea.conductor) {
      return { fase: 'error', mensaje: 'La línea no tiene conductor declarado: sin él no hay cálculo mecánico posible.' };
    }

    // Se ordena por `orden`, NUNCA por nombre: en LN-627 conviven "E022",
    // "EMP TUB" y "EMPT", y ordenar por nombre daría vanos equivocados.
    const sApoyos = await getDocs(query(
      collection(db, 'apoyos'),
      where('lineaId', '==', lineaId),
      orderBy('orden', 'asc'),
    ));
    const apoyos = sApoyos.docs
      .map((d) => validar<Apoyo>(Apoyo, d.data()))
      .filter((x): x is Apoyo => x !== null);

    if (apoyos.length < 2) return { fase: 'vacio' };

    if (!linea.hipotesisId) {
      return { fase: 'error', mensaje: 'La línea no tiene hipótesis de cálculo asociadas.' };
    }
    const dHip = await getDoc(doc(db, 'hipotesis', linea.hipotesisId));
    const hipotesis = dHip.exists() ? validar<Hipotesis>(Hipotesis, dHip.data()) : null;
    if (!hipotesis) {
      return { fase: 'error', mensaje: 'No se pudieron leer las hipótesis de cálculo de esta línea.' };
    }

    return { fase: 'listo', linea, apoyos, conductor: linea.conductor, hipotesis };
  },
};
