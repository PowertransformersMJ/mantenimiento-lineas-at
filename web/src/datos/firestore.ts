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
import { Apoyo, Hipotesis, Linea } from '@lineas/contratos';
import { cargarFirebase } from './cargar';
import type { EstadoDatos, EstadoSesion, Repositorio } from './repositorio';

// El SDK de Firestore viaja DENTRO del trozo diferido de Firebase (ver
// `cargar.ts`). Este archivo es diminuto y va en el paquete principal: así hay
// UNA sola frontera de carga, no dos encadenadas.
const firestore = () => import('firebase/firestore');

/** Convierte lo que venga de la base en algo que el contrato acepte, o lo descarta. */
function validar<T>(esquema: { safeParse: (x: unknown) => { success: boolean; data?: T } }, crudo: unknown): T | null {
  const r = esquema.safeParse(crudo);
  return r.success && r.data ? r.data : null;
}

export const repositorioFirestore: Repositorio = {
  async sesion(): Promise<EstadoSesion> {
    const { esperarSesion } = await cargarFirebase();
    const u = await esperarSesion();
    if (!u) return { fase: 'sin_sesion' };
    return { fase: 'autenticado', uid: u.uid, correo: u.email };
  },

  async listarLineas(): Promise<Linea[]> {
    const { esperarSesion, credenciales, baseDatos } = await cargarFirebase();
    const { collection, getDocs, limit, query, where } = await firestore();
    const u = await esperarSesion();
    if (!u) return [];
    const { orgId } = await credenciales(u);
    if (!orgId) return [];   // sin organización en el token no hay nada que ver

    // Se filtra SOLO por organización en la consulta. Lo de "activa" se descarta
    // aquí, en el cliente: combinar dos filtros de igualdad puede exigir un
    // índice compuesto, y un índice que falta no da un error claro — deja la
    // consulta colgada. A esta escala (decenas de líneas) no compensa el riesgo.
    const q = query(collection(baseDatos(), 'lineas'), where('orgId', '==', orgId), limit(50));
    const s = await getDocs(q);
    return s.docs
      .map((d) => validar<Linea>(Linea, d.data()))
      .filter((x): x is Linea => x !== null && x.activa !== false);
  },

  async cargarLinea(lineaId: string): Promise<EstadoDatos> {
    const { esperarSesion, credenciales, baseDatos } = await cargarFirebase();
    const { collection, doc, getDoc, getDocs, orderBy, query, where } = await firestore();
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

    // ⚠️ EL FILTRO POR `orgId` ES OBLIGATORIO, aunque `lineaId` ya acote el
    // resultado. En Firestore **las reglas no son filtros**: para una consulta,
    // la base exige poder DEMOSTRAR de antemano que todo lo devuelto cumple la
    // regla. La regla pide que el documento sea de mi organización; si la
    // consulta no lo declara, Firestore no lo puede probar y **niega la consulta
    // entera** con "Missing or insufficient permissions" — aunque cada documento
    // individualmente sí fuera legible. Es la trampa clásica, y cuesta una tarde
    // porque el mensaje de error no menciona la consulta.
    //
    // Se ordena por `orden`, NUNCA por nombre: en LN-627 conviven "E022",
    // "EMP TUB" y "EMPT", y ordenar por nombre daría vanos equivocados.
    const { orgId } = await credenciales(u);
    const sApoyos = await getDocs(query(
      collection(db, 'apoyos'),
      where('orgId', '==', orgId),
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
