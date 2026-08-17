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
import { AccionCapa, AnalisisCausa, Apoyo, Evidencia, Hipotesis, Investigacion, Linea, ParteDeAccion, ParteDeAnalisis, SondeoClima } from '@lineas/contratos';
import { cargarFirebase } from './cargar';
import type { EstadoDatos, EstadoSesion, Repositorio, ResultadoCarga } from './repositorio';

// El SDK de Firestore viaja DENTRO del trozo diferido de Firebase (ver
// `cargar.ts`). Este archivo es diminuto y va en el paquete principal: así hay
// UNA sola frontera de carga, no dos encadenadas.
const firestore = () => import('firebase/firestore');

/**
 * Copia un documento dejando fuera las claves cuyo valor es `undefined`.
 *
 * El SDK del navegador **lanza** si encuentra un `undefined` dentro de lo que se
 * manda, y en un lote eso tumba la escritura entera: los tres puntos buenos se
 * caen por culpa de una cota que el GPS no grabó. El sembrador de la máquina del
 * Ingeniero corría con `ignoreUndefinedProperties` y se las tragaba en silencio;
 * aquí no existe esa opción, así que la clave sencillamente no viaja — que
 * además es lo que el molde espera de un campo opcional.
 *
 * `null` SÍ viaja: un nulo declarado es un dato («esto no se midió»), no una
 * ausencia. `deflexion_grados` es exactamente ese caso.
 */
function sinIndefinidos(x: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(x)) {
    if (v === undefined) continue;
    salida[k] = (v !== null && typeof v === 'object' && !Array.isArray(v))
      ? sinIndefinidos(v as Record<string, unknown>)
      : v;
  }
  return salida;
}

/** Convierte lo que venga de la base en algo que el contrato acepte, o lo descarta. */
function validar<T>(esquema: { safeParse: (x: unknown) => { success: boolean; data?: T } }, crudo: unknown): T | null {
  const r = esquema.safeParse(crudo);
  return r.success && r.data ? r.data : null;
}

export const repositorioFirestore: Repositorio = {
  /**
   * Quién entró, y CON QUÉ PERMISO.
   *
   * El permiso y la organización viajan en el token desde el día 1 y hasta hoy
   * no los leía nadie: la aplicación entera funcionaba sin saber con qué
   * credencial se había entrado. Mientras solo se leía daba igual. Desde que se
   * puede escribir, no: quien no sea administrador se enteraría de que no puede
   * cargar un punto por una denegación de la base — tarde, sin causa y con el
   * archivo del GPS ya puesto en pantalla.
   *
   * ⚠️ Si el token no se puede leer, esto NO tumba la sesión: se declara el
   * permiso más bajo y se sigue. Ésta es una capa de higiene, y una capa
   * opcional nunca tiene veto sobre una esencial (`31 · L-11`) — la frontera de
   * verdad son las reglas de la base, que miran el mismo token del otro lado.
   */
  async sesion(): Promise<EstadoSesion> {
    const { esperarSesion, credenciales } = await cargarFirebase();
    const u = await esperarSesion();
    if (!u) return { fase: 'sin_sesion' };
    try {
      const { rol, orgId } = await credenciales(u);
      return { fase: 'autenticado', uid: u.uid, correo: u.email, rol, orgId };
    } catch {
      return { fase: 'autenticado', uid: u.uid, correo: u.email, rol: 'ninguno', orgId: '' };
    }
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
    let falloInvestigaciones: string | undefined;
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
      // Se sigue adelante a propósito (el cálculo no depende de esto), pero el
      // hueco QUEDA DECLARADO: sin esto la pantalla afirma que no hay ninguno.
      console.warn('[datos] no se pudieron leer los expedientes de falla:', e);
      falloInvestigaciones = e instanceof Error ? e.message : 'fallo desconocido';
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
    let falloEvidencias: string | undefined;
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
      falloEvidencias = e instanceof Error ? e.message : 'fallo desconocido';
    }

    // El hueco viaja con el dato. Si no se pudo leer algo, la pantalla tiene que
    // poder decirlo en vez de afirmar que no hay nada (`32 · L-44`).
    const noSePudoLeer = (falloInvestigaciones || falloEvidencias)
      ? { investigaciones: falloInvestigaciones, evidencias: falloEvidencias }
      : undefined;

    return { fase: 'listo', linea, apoyos, conductor: linea.conductor, hipotesis, investigaciones, evidencias, noSePudoLeer };
  },

  /**
   * ⚠️ LA ÚNICA ESCRITURA DE ESTE SISTEMA QUE NO SE PUEDE DESHACER NI CORREGIR.
   *
   * Las reglas niegan `delete` sobre apoyos y congelan `orgId`, `creadoPor` y
   * `creadoEn` en cualquier edición posterior. Un punto mal cargado se queda
   * cargado. Todo lo que sigue existe por eso, y en este orden a propósito:
   *
   *   1. **Se comprueba el permiso ANTES de mandar nada.** Un lote es atómico y
   *      su denegación es opaca: la base no dice cuál de los documentos la
   *      causó, ni por qué. Preguntar aquí convierte «permiso denegado» en una
   *      frase que se entiende.
   *   2. **`creadoPor` se sella con la sesión abierta**, nunca con lo que venga
   *      de fuera: `firestore.rules` exige que el autor sea exactamente quien
   *      escribe, y es el único rechazo campo por campo que hay.
   *   3. **`orgId` se toma del TOKEN**, por lo mismo que en `crearAnalisis`: no
   *      se manda algo que se sabe que la base va a negar.
   *   4. **Cada documento se valida contra el molde ANTES de mandarlo.** Las
   *      reglas NO miran el contenido de un apoyo — no hay `hasOnly` —, así que
   *      este `safeParse` es la única defensa que tiene la forma del dato.
   *   5. **Se mira con `getDoc` si el punto ya existe.** Un `set` sobre un id
   *      que ya está NO da error: sobrescribe. Y sobrescribir aquí sería un
   *      punto pisando a otro, con sus fotos y su expediente colgando.
   *
   * Lo que falla punto a punto NO lanza: viaja en el resultado, para que el
   * acuse pueda decir qué entró, qué ya estaba y qué se rechazó.
   */
  async cargarPuntosNuevos(
    documentos: Record<string, unknown>[],
    idsYaCargados: string[] = [],
  ): Promise<ResultadoCarga> {
    const { esperarSesion, credenciales, baseDatos } = await cargarFirebase();
    const { doc, writeBatch } = await firestore();
    const u = await esperarSesion();
    if (!u) throw new Error('No hay ninguna sesión abierta: no se puede cargar ningún punto.');

    const { rol, orgId } = await credenciales(u);
    if (rol !== 'admin') {
      throw new Error(
        `Su sesión entró con el permiso «${rol}», y crear puntos de una línea es acto de administración. `
        + 'No se ha mandado nada a la base. Si esto le sorprende, es que el permiso de su cuenta cambió: '
        + 'hay que revisarlo antes de cargar, no después.',
      );
    }
    if (!orgId) {
      throw new Error(
        'Su sesión no declara a qué organización pertenece, y un punto sin organización no lo puede leer '
        + 'nadie después — ni usted. No se ha mandado nada a la base.',
      );
    }

    const db = await baseDatos();
    const yaCargados = new Set((idsYaCargados ?? []).map(String));
    const escritos: string[] = [];
    const yaEstaban: string[] = [];
    const rechazados: { nombre: string; motivo: string }[] = [];
    const pendientes: { nombre: string; ref: ReturnType<typeof doc>; documento: Record<string, unknown> }[] = [];

    for (const crudo of documentos ?? []) {
      // El punto se nombra por su NOMBRE en todo lo que vuelve a la pantalla:
      // el acuse lo lee una persona, y un identificador interno no le dice nada
      // a nadie.
      const nombre = String(crudo?.nombreNormalizado ?? crudo?.nombreCampo ?? 'punto sin nombre');
      const sellado = sinIndefinidos({ ...crudo, orgId, creadoPor: u.uid });

      const r = Apoyo.safeParse(sellado);
      if (!r.success) {
        const p = r.error.issues[0];
        const donde = p?.path?.length ? ` (en «${p.path.join('.')}»)` : '';
        rechazados.push({ nombre, motivo: `${p?.message ?? 'motivo desconocido'}${donde}` });
        continue;
      }

      // ⚠️ SE COMPRUEBA CONTRA LOS APOYOS QUE LA PANTALLA YA TIENE, NO PREGUNTÁNDOLE
      // A LA BASE SI EL PUNTO EXISTE.
      //
      // Preguntar parecía lo prudente y era justo lo que rompía la pantalla
      // entera: `puedeLeer()` (firestore.rules) decide mirando
      // `resource.data.orgId`, y en un documento que TODAVÍA NO EXISTE no hay
      // `resource` que mirar. La base no contesta «no está»: DENIEGA. Y como el
      // caso normal aquí es cargar puntos que aún no existen, fallaba siempre en
      // el primero — con «Missing or insufficient permissions» en inglés, dos
      // líneas debajo de donde la propia pantalla acaba de decir que el permiso
      // es de administrador.
      //
      // La lista de apoyos ya cargados la tiene la aplicación en memoria: es la
      // misma con la que pinta el mapa y con la que se calculó el antes/después
      // que el Ingeniero acaba de aprobar. Comprobar contra ella es igual de
      // fiable para este caso y no necesita ni una lectura más.
      if (yaCargados.has(String(r.data.id))) {
        yaEstaban.push(nombre);
        continue;
      }
      const ref = doc(db, 'apoyos', r.data.id);
      // ⚠️ SE GUARDA LO QUE SALIÓ DEL MOLDE (`r.data`), no lo que entró
      // (`sellado`). Validar una cosa y escribir otra es la peor forma de este
      // fallo: la comprobación da tranquilidad y a la base llega el objeto que
      // nadie miró, con los campos de más que el molde habría quitado. Y en
      // apoyos no hay deshacer.
      //
      // Se vuelve a pasar por `sinIndefinidos` porque el molde puede devolver
      // una clave opcional presente y sin valor, y el SDK lanza con eso dentro:
      // un `undefined` tumbaría el lote entero, o sea los puntos buenos también.
      const validado = sinIndefinidos(r.data as unknown as Record<string, unknown>);
      pendientes.push({ nombre, ref, documento: validado });
    }

    // Se escribe lo VALIDADO, en un solo lote: los puntos de una misma jornada
    // entran juntos o no entra ninguno. Un lote vacío no se manda — pedirle a la
    // base que no haga nada solo sirve para que un fallo de red se lea como un
    // fallo de carga.
    if (pendientes.length) {
      const lote = writeBatch(db);
      for (const p of pendientes) lote.set(p.ref, p.documento);
      await lote.commit();
      escritos.push(...pendientes.map((p) => p.nombre));
    }

    return { escritos, yaEstaban, rechazados };
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
   * Guarda una parte del análisis.
   *
   * `parche` lleva SIEMPRE la lista completa de lo que cambia (las once
   * espinas, todas las hipótesis…), no un delta. No toca `orgId`, `creadoPor`
   * ni `creadoEn` — la regla `noTocaReservados()` lo impediría, y con razón:
   * son los campos que dicen de quién es el documento.
   */
  async guardarParte(analisisId: string, parche: Record<string, unknown>, revision: number): Promise<void> {
    const { esperarSesion, baseDatos } = await cargarFirebase();
    const { doc, getDoc, updateDoc } = await firestore();
    const u = await esperarSesion();
    if (!u) throw new Error('sin sesión');

    // SE VALIDA ANTES DE ESCRIBIR, igual que en `crearAnalisis`. Hasta el
    // 2026-08-05 esto no pasaba: el documento nacía validado y **todas las
    // ediciones posteriores entraban sin mirar**, que es justo al revés de lo
    // que hace falta — un análisis se crea vacío en un segundo y se edita
    // durante semanas.
    //
    // `ParteDeAnalisis` es `strict`: una clave que no esté en la lista se
    // rechaza en vez de escribirse. Antes, un nombre de campo mal escrito
    // entraba en el documento y se quedaba ahí para siempre, sin que nadie lo
    // viera, dentro de un papel que se firma.
    const r = ParteDeAnalisis.safeParse(parche);
    if (!r.success) {
      const p = r.error.issues[0];
      const donde = p?.path?.length ? ` (en «${p.path.join('.')}»)` : '';
      throw new Error(`El cambio no cumple el contrato${donde}: ${p?.message ?? 'motivo desconocido'}`);
    }

    // ANTES DE ESCRIBIR, se comprueba que nadie haya guardado por en medio.
    //
    // Cada parte se manda ENTERA, no como delta: sin esta comprobación, quien
    // guarde el árbol a las 10:00 sustituye completo el que un compañero guardó
    // a las 09:40, y los dos ven que se guardó bien. Razonamiento perdido que
    // nadie sabe que perdió, dentro de un expediente que se firma.
    //
    // El cerrojo DE VERDAD es la regla de la base (revisión nueva == vieja + 1),
    // porque entre esta lectura y la escritura hay una ventana. Esto de aquí
    // existe para que el caso normal dé un mensaje que se entienda en vez de una
    // denegación opaca.
    const ref = doc(await baseDatos(), 'analisis', analisisId);
    const actual = await getDoc(ref);
    const revisionEnLaBase = (actual.data()?.revision as number | undefined) ?? 0;
    if (revisionEnLaBase !== revision) {
      throw new Error(
        'Otra persona guardó cambios en este análisis mientras lo tenías abierto. '
        + 'No se ha escrito nada para no borrar su trabajo. Copia lo que hayas escrito, '
        + 'recarga el expediente y vuelve a ponerlo.',
      );
    }

    await updateDoc(ref, {
      ...parche,
      actualizadoEn: new Date().toISOString(),
      actualizadoPor: u.uid,
      revision: revision + 1,
    });
  },

  /**
   * Las acciones CAPA de un análisis.
   *
   * Se filtra por `orgId` Y por `analisisId`, y el `orgId` NO es redundante: en
   * Firestore las reglas no son filtros — la base exige poder DEMOSTRAR de
   * antemano que todo lo devuelto cumple la regla, y si la consulta no declara
   * la organización niega la consulta entera con «Missing or insufficient
   * permissions». Es la trampa que ya costó una tarde en `cargarLinea`.
   *
   * NO se ordenan aquí ni en ningún sitio: ordenar es dictaminar (`99 §ADR-020`)
   * y la primera de una lista se lee como la más importante. Salen en el orden
   * en que se crearon, y eso lo decide quien las escribió.
   */
  async listarAcciones(analisisId: string): Promise<AccionCapa[]> {
    const { esperarSesion, credenciales, baseDatos } = await cargarFirebase();
    const { collection, getDocs, limit, query, where } = await firestore();
    const u = await esperarSesion();
    if (!u) return [];
    const { orgId } = await credenciales(u);
    if (!orgId) return [];

    const s = await getDocs(query(
      collection(await baseDatos(), 'acciones_capa'),
      where('orgId', '==', orgId),
      where('analisisId', '==', analisisId),
      limit(200),
    ));
    return s.docs
      .map((d) => validar<AccionCapa>(AccionCapa, d.data()))
      .filter((x): x is AccionCapa => x !== null);
  },

  /**
   * Da de alta una acción.
   *
   * Nace `propuesta`, SIN barrera y SIN responsable. Nada se presupone y nada se
   * rellena por adelantado: un valor por defecto en un campo de método es un
   * ancla, y aquí el ancla decidiría qué defensa se da por cubierta.
   */
  async crearAccion(analisisId: string, datos: { clase: 'correctiva' | 'preventiva'; que: string }): Promise<string | null> {
    const { esperarSesion, credenciales, baseDatos } = await cargarFirebase();
    const { doc, setDoc } = await firestore();
    const u = await esperarSesion();
    if (!u) return null;
    const { orgId } = await credenciales(u);
    if (!orgId) return null;

    const id = crypto.randomUUID();
    const doc_ = {
      id, orgId, tipo: 'accion_capa' as const,
      creadoEn: new Date().toISOString(), creadoPor: u.uid, revision: 0,
      analisisId,
      clase: datos.clase,
      que: datos.que,
      estado: 'propuesta' as const,
      evidenciaIds: [] as string[],
    };
    const r = AccionCapa.safeParse(doc_);
    if (!r.success) throw new Error('La acción no cumple el contrato: ' + r.error.issues[0]?.message);

    await setDoc(doc(await baseDatos(), 'acciones_capa', id), doc_);
    return id;
  },

  /** Guarda un cambio de una acción. Se valida ANTES de escribir, como todo. */
  async guardarAccion(accionId: string, parche: Record<string, unknown>, revision: number): Promise<void> {
    const { esperarSesion, baseDatos } = await cargarFirebase();
    const { doc, updateDoc } = await firestore();
    const u = await esperarSesion();
    if (!u) throw new Error('sin sesión');

    const r = ParteDeAccion.safeParse(parche);
    if (!r.success) {
      const p = r.error.issues[0];
      const donde = p?.path?.length ? ` (en «${p.path.join('.')}»)` : '';
      throw new Error(`El cambio no cumple el contrato${donde}: ${p?.message ?? 'motivo desconocido'}`);
    }

    await updateDoc(doc(await baseDatos(), 'acciones_capa', accionId), {
      ...parche,
      actualizadoEn: new Date().toISOString(),
      actualizadoPor: u.uid,
      revision: revision + 1,
    });
  },

  /** Los sondeos de clima ya congelados de un análisis. */
  /**
   * El recibo del cambio de contraseña: cuándo lo hizo esta persona.
   *
   * Devuelve `null` tanto si nunca lo hizo como si la lectura falla — y eso
   * segundo es deliberado: un fallo leyendo el recibo NO puede encerrar a nadie.
   * Quien decide es `puertaDeAcceso`, que ante la duda deja pasar.
   */
  async reciboContrasena(): Promise<number | null> {
    try {
      const { esperarSesion, baseDatos } = await cargarFirebase();
      const { doc, getDoc } = await firestore();
      const u = await esperarSesion();
      if (!u) return null;
      const d = await getDoc(doc(await baseDatos(), 'usuarios', u.uid));
      const t = d.exists() ? d.data()?.contrasenaCambiadaEn : null;
      // Firestore devuelve un Timestamp; `toMillis` es suyo.
      if (t && typeof t.toMillis === 'function') return t.toMillis();
      return typeof t === 'number' ? t : null;
    } catch {
      return null;
    }
  },

  /**
   * Deja el recibo. La fecha la pone EL SERVIDOR: las reglas exigen que el campo
   * sea exactamente `request.time`, así que no se puede fechar hacia atrás para
   * tapar una orden nueva.
   */
  async dejarReciboContrasena(): Promise<void> {
    const { esperarSesion, baseDatos } = await cargarFirebase();
    const { doc, setDoc, serverTimestamp } = await firestore();
    const u = await esperarSesion();
    if (!u) throw new Error('sin sesión');
    await setDoc(doc(await baseDatos(), 'usuarios', u.uid), { contrasenaCambiadaEn: serverTimestamp() });
  },

  async listarSondeos(analisisId: string): Promise<SondeoClima[]> {
    const { esperarSesion, credenciales, baseDatos } = await cargarFirebase();
    const { collection, getDocs, limit, query, where } = await firestore();
    const u = await esperarSesion();
    if (!u) return [];
    const { orgId } = await credenciales(u);
    if (!orgId) return [];

    const s = await getDocs(query(
      collection(await baseDatos(), 'sondeos_clima'),
      where('orgId', '==', orgId),
      where('analisisId', '==', analisisId),
      limit(50),
    ));
    return s.docs
      .map((d) => validar<SondeoClima>(SondeoClima, d.data()))
      .filter((x): x is SondeoClima => x !== null);
  },

  /**
   * Congela un sondeo en el expediente.
   *
   * ES UNA ESCRITURA ÚNICA. Las reglas niegan `update` y `delete` —ni el
   * administrador— porque esto no es una caché: es la prueba de qué decía IDEAM
   * el día que se consultó. Si mañana corrigen la serie, el informe firmado
   * tiene que seguir enseñando lo que se vio. Permitir actualizarlo convertiría
   * una prueba en una opinión editable.
   *
   * Se valida contra el contrato antes de mandarlo, como todo lo que se escribe.
   */
  async guardarSondeo(analisisId: string, sondeo: Record<string, unknown>): Promise<string | null> {
    const { esperarSesion, credenciales, baseDatos } = await cargarFirebase();
    const { doc, setDoc } = await firestore();
    const u = await esperarSesion();
    if (!u) return null;
    const { orgId } = await credenciales(u);
    if (!orgId) return null;

    const id = crypto.randomUUID();
    const doc_ = {
      ...sondeo,
      id, orgId, tipo: 'sondeo_clima' as const,
      creadoEn: new Date().toISOString(), creadoPor: u.uid, revision: 0,
      analisisId,
    };
    const r = SondeoClima.safeParse(doc_);
    if (!r.success) throw new Error('El sondeo no cumple el contrato: ' + r.error.issues[0]?.message);

    await setDoc(doc(await baseDatos(), 'sondeos_clima', id), doc_);
    return id;
  },

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
