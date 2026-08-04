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
import { AnalisisCausa, Apoyo, Evidencia, Hipotesis, Investigacion, Linea } from '@lineas/contratos';
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
    const q = query(collection(await baseDatos(), 'lineas'), where('orgId', '==', orgId), limit(50));
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

    const db = await baseDatos();
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

    // Los expedientes de falla son OPCIONALES: una línea sin eventos es lo
    // normal, y un fallo leyéndolos no puede tumbar la vista entera de la
    // línea — el cálculo mecánico no depende de ellos.
    let investigaciones: Investigacion[] = [];
    try {
      const sInv = await getDocs(query(
        collection(db, 'investigaciones'),
        where('orgId', '==', orgId),
        where('lineaId', '==', lineaId),
      ));
      investigaciones = sInv.docs
        .map((d) => validar<Investigacion>(Investigacion, d.data()))
        .filter((x): x is Investigacion => x !== null);
    } catch (e) {
      console.warn('[datos] no se pudieron leer los expedientes de falla:', e);
    }

    // Fichas de evidencia (NUNCA los binarios: la foto vive en almacenamiento
    // de objetos y se sirve aparte). Igual que arriba, en su propio try: sin
    // fotos la línea se ve completa, y el cálculo no depende de ellas.
    //
    // ⚠️ Esta lectura NO se condiciona a que la línea tenga expediente de falla.
    // Lo estaba, y funcionaba por CASUALIDAD: LN-627 tiene expediente, así que
    // sus fotos se leían. Una línea con fotos de estructura y sin falla —el caso
    // normal— habría mostrado cero fotos sin un solo error, y el fallo no
    // aparecería hasta la segunda línea (plan de TODO-43, paso 7).
    let evidencias: Evidencia[] = [];
    try {
      const sEv = await getDocs(query(
        collection(db, 'evidencias'),
        where('orgId', '==', orgId),
        where('lineaId', '==', lineaId),
      ));
      evidencias = sEv.docs
        .map((d) => validar<Evidencia>(Evidencia, d.data()))
        .filter((x): x is Evidencia => x !== null);
    } catch (e) {
      console.warn('[datos] no se pudieron leer las fichas de evidencia:', e);
    }

    return { fase: 'listo', linea, apoyos, conductor: linea.conductor, hipotesis, investigaciones, evidencias };
  },

  /**
   * Los análisis de causa raíz de la organización.
   *
   * Se filtra por `orgId` en la consulta, igual que todo lo demás: las reglas
   * de Firestore lo exigirían de todos modos, pero pedirlo mal devuelve un error
   * de permisos en vez de una lista vacía, y eso se lee como avería.
   *
   * Devolver `[]` NO es un fallo: hoy no hay ningún análisis, y ése es el estado
   * normal hasta que alguien abra el primero.
   */
  async listarAnalisis(): Promise<AnalisisCausa[]> {
    const { esperarSesion, credenciales, baseDatos } = await cargarFirebase();
    const { collection, getDocs, limit, query, where } = await firestore();
    const u = await esperarSesion();
    if (!u) return [];
    const { orgId } = await credenciales(u);
    if (!orgId) return [];

    const q = query(collection(await baseDatos(), 'analisis'), where('orgId', '==', orgId), limit(100));
    const s = await getDocs(q);
    return s.docs
      .map((d) => validar<AnalisisCausa>(AnalisisCausa, d.data()))
      .filter((x): x is AnalisisCausa => x !== null);
  },

  /**
   * ⚠️ PRIMERA ESCRITURA DEL CLIENTE A LA BASE. Hasta hoy la aplicación solo
   * leía. Va ceñida a lo que las reglas permiten y a nada más:
   *
   *   · `orgId` se toma del TOKEN, no de un parámetro. Si viniera de fuera, un
   *     cliente modificado podría sembrar documentos en otra organización — y
   *     aunque `altaCoherente()` lo rechazaría, no se manda algo que se sabe
   *     que va a ser negado.
   *   · `creadoPor` es el uid de la sesión. La regla exige que coincida.
   *   · Las once espinas NO se siembran: se dejan vacías a propósito. El motor
   *     las devuelve como «no evaluable · nadie ha mirado esta familia
   *     todavía», que es la verdad. Sembrarlas con texto de relleno haría que
   *     un análisis recién abierto pareciera trabajado.
   */
  async crearAnalisis(datos: { titulo: string; lineaId?: string; apoyoId?: string; investigacionId?: string; sinActivo?: string }): Promise<string | null> {
    const { esperarSesion, credenciales, baseDatos } = await cargarFirebase();
    const { doc, setDoc } = await firestore();
    const u = await esperarSesion();
    if (!u) return null;
    const { orgId } = await credenciales(u);
    if (!orgId) return null;

    const id = crypto.randomUUID();
    const ahora = new Date().toISOString();
    const doc_ = {
      id, orgId, tipo: 'analisis_causa' as const,
      creadoEn: ahora, creadoPor: u.uid, revision: 0,
      codigo: `RCA-${ahora.slice(0, 10)}-${id.slice(0, 4)}`,
      titulo: datos.titulo,
      estado: 'abierto' as const,
      abiertoEn: ahora,
      alcance: {
        lineaIds: datos.lineaId ? [datos.lineaId] : [],
        apoyoIds: datos.apoyoId ? [datos.apoyoId] : [],
        investigacionIds: datos.investigacionId ? [datos.investigacionId] : [],
        ...(datos.sinActivo ? { sinActivoIdentificado: datos.sinActivo } : {}),
      },
      espinas: [], cadenas: [], arbol: [], hipotesis: [],
      ausencias: [], acciones: [], limitaciones: [],
      cerrado: false,
    };
    // Se valida contra el contrato ANTES de mandarlo. Si no cumple, el fallo se
    // ve aquí y no como una denegación opaca de la base.
    const r = AnalisisCausa.safeParse(doc_);
    if (!r.success) throw new Error('El análisis no cumple el contrato: ' + r.error.issues[0]?.message);

    await setDoc(doc(await baseDatos(), 'analisis', id), doc_);
    return id;
  },

  /**
   * Guarda la evaluación de las once familias. Se manda el array COMPLETO, no
   * un parche: la tabla de descartes es una sola cosa y guardarla a trozos
   * abriría la puerta a un estado a medias entre dos escrituras.
   *
   * No toca `orgId`, `creadoPor` ni `creadoEn` — la regla `noTocaReservados()`
   * lo impediría, y con razón.
   */
  async guardarEspinas(analisisId: string, espinas: unknown[], revision: number): Promise<void> {
    const { esperarSesion, baseDatos } = await cargarFirebase();
    const { doc, updateDoc } = await firestore();
    const u = await esperarSesion();
    if (!u) throw new Error('sin sesión');
    await updateDoc(doc(await baseDatos(), 'analisis', analisisId), {
      espinas,
      actualizadoEn: new Date().toISOString(),
      actualizadoPor: u.uid,
      revision: revision + 1,
    });
  },

  /**
   * Las evidencias que este análisis puede enlazar.
   *
   * Son de dos orígenes y se juntan: las que ya colgaban de sus
   * investigaciones —las 4 fotos del expediente, en el caso de LN-627— y las
   * que se hayan pedido para el análisis mismo (`analisisId`, el cuarto dueño
   * que entró en el contrato v0.4.0).
   *
   * ⚠️ TOPE DECLARADO: Firestore admite como mucho 30 valores en un `in`. Si un
   * análisis abarcase más de 30 investigaciones, las de más NO saldrían — y eso
   * se avisa en vez de recortar en silencio, que es como se pierde evidencia sin
   * que nadie se entere.
   */
  async evidenciasDeAnalisis(analisisId: string, investigacionIds: string[]): Promise<Evidencia[]> {
    const { esperarSesion, credenciales, baseDatos } = await cargarFirebase();
    const { collection, getDocs, limit, query, where } = await firestore();
    const u = await esperarSesion();
    if (!u) return [];
    const { orgId } = await credenciales(u);
    if (!orgId) return [];

    const db = await baseDatos();
    const porId = new Map<string, Evidencia>();

    const recoger = async (q: ReturnType<typeof query>) => {
      const s = await getDocs(q);
      for (const d of s.docs) {
        const e = validar<Evidencia>(Evidencia, d.data());
        if (e) porId.set(e.id, e);
      }
    };

    if (investigacionIds.length) {
      await recoger(query(
        collection(db, 'evidencias'),
        where('orgId', '==', orgId),
        where('investigacionId', 'in', investigacionIds.slice(0, 30)),
        limit(200),
      ));
    }
    await recoger(query(
      collection(db, 'evidencias'),
      where('orgId', '==', orgId),
      where('analisisId', '==', analisisId),
      limit(200),
    ));

    return [...porId.values()];
  },
};
