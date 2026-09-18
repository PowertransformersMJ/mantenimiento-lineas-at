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
import { AccionCapa, AnalisisCausa, Apoyo, ETIQUETA_CAMPO_FICHA, Evidencia, FichaEstructural, Hipotesis, Investigacion, Levantamiento, Linea, ParteDeAccion, ParteDeAnalisis, SondeoClima } from '@lineas/contratos';
import { EntradaDeAuditoria } from '@lineas/contratos';
import { cargarFirebase } from './cargar';
import { anotarFalloDeBitacora } from './bitacora';
import { alcanza, permisosDeSesion, puede } from './permisos';
import { apoyosDeLasSeries, faltasYHuecosDeLinea, ordenarLevantamientos, ordenarParque, PAGINA_DE_AUDITORIA, seriesAvaladas, seriesDeLinea } from './repositorio';
import { LIBRO_DE_CODIGOS } from './registroCodigos';
import type { AcuseDeFicha, AcuseDeLevantamiento, AcuseDeLineaNueva, AcuseDeLote, EntradaLeidaDeAuditoria, EstadoDatos, EstadoSesion, FichaDeFoto, FiltroDeAuditoria, PaginaDeAuditoria, Repositorio, ResultadoCarga, ResultadoFotos, SerieDeLinea } from './repositorio';

/**
 * La mitad pensante de la ficha —qué campos hay, qué geometría no puede dar
 * veredicto, cómo se funde un parche— vive en `vistas/fichaEstructural.ts`, que
 * es PURO y está probado con `node --test`. Se trae con `import()` y no arriba
 * del todo por lo mismo que el SDK de Firestore: este archivo va en el paquete
 * principal y aquel módulo arrastra el motor de cálculo entero. Quien nunca abre
 * una ficha no debería descargarlo.
 */
const fichaPura = () => import('../vistas/fichaEstructural');

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

/**
 * SELLA LOS ORÍGENES CON LA SESIÓN ABIERTA, pase lo que pase venga de fuera.
 *
 * Quién declaró un dato y cuándo NO se los cree a la pantalla, por lo mismo que
 * `creadoPor` se sella en `cargarPuntosNuevos`: un sello dice quién responde de
 * ese número el día que se firme el informe, y eso no puede salir de un campo
 * que un cliente modificado rellena a su gusto. La `procedencia` y la `fuente`
 * sí vienen de fuera —son lo que el Ingeniero declara—; la firma y la hora, no.
 *
 * Lo que NO es un objeto se deja tal cual, a propósito: que lo rechace el molde
 * con su mensaje, en vez de que aquí se convierta en un sello a medias.
 */
function sellarFicha(ficha: Record<string, unknown>, uid: string, ahora: string): Record<string, unknown> {
  const { procedencias, ...valores } = (ficha ?? {}) as Record<string, unknown>;
  const sellos: Record<string, unknown> = {};
  for (const [campo, s] of Object.entries((procedencias ?? {}) as Record<string, unknown>)) {
    sellos[campo] = (s && typeof s === 'object' && !Array.isArray(s))
      ? { ...(s as Record<string, unknown>), declaradoEn: ahora, declaradoPor: uid }
      : s;
  }
  // `procedencias` viaja SIEMPRE, incluso vacío: sin él, una ficha con valores y
  // sin ningún sello pasaría por «no traía sellos» en vez de por lo que es —un
  // dato sin origen—, y el molde no podría rechazarla con el motivo correcto.
  return { ...valores, procedencias: sellos };
}

/**
 * SELLA LA FIRMA DE CADA TRAMO COMPARTIDO DECLARADO, con la sesión abierta.
 *
 * Mismo criterio que `sellarFicha` y por la misma razón: `declaradoEn` y
 * `declaradoPor` dicen quién responde de que esta línea recorra ese tramo, y eso
 * decide qué torres entran en su informe. No puede salir de un campo que la
 * pantalla rellena — las reglas solo comprueban el autor del DOCUMENTO
 * (`altaCoherente`), así que dentro del array no hay nadie mirando.
 *
 * Lo que NO sea un objeto se deja tal cual, a propósito: que lo rechace el molde
 * con su mensaje en vez de convertirse aquí en una firma a medias.
 */
function sellarTramos(tramos: unknown, uid: string, ahora: string): unknown {
  if (!Array.isArray(tramos)) return tramos;
  return tramos.map((t) => (t && typeof t === 'object' && !Array.isArray(t)
    ? { ...(t as Record<string, unknown>), declaradoEn: ahora, declaradoPor: uid }
    : t));
}

/**
 * ⚠️ LA PROCEDENCIA DEL TRAMO SE EXIGE AL ESCRIBIR, que es donde el molde dice
 * que se aprieta la tuerca: son opcionales en LECTURA (una línea vieja no las
 * trae) pero declarar que esta línea recorre un tramo decide qué torres entran
 * en su informe, y esa entrada no se borra nunca. Hasta el 17-09 lo único que
 * las pedía era un `if` de pantalla.
 */
function faltaProcedenciaDeTramo(tramos: unknown): string | null {
  if (!Array.isArray(tramos)) return null;
  for (const t of tramos) {
    if (!t || typeof t !== 'object' || Array.isArray(t)) continue;
    const e = t as Record<string, unknown>;
    if (e.cierre) continue; // una entrada cerrada ya no declara nada
    const codigo = String(e.codigo ?? 'sin código');
    if (!e.procedencia) return `el tramo ${codigo} no dice de dónde sale que esta línea lo recorre`;
    if (typeof e.fuente !== 'string' || !e.fuente.trim()) {
      return `el tramo ${codigo} no trae la fuente de esa declaración: la línea que otro pueda ir a comprobar`;
    }
  }
  return null;
}

/** El primer motivo de rechazo del molde, dicho de una vez y en castellano. */
function motivoDelMolde(error: { issues: { message?: string; path?: (string | number)[] }[] }): string {
  const p = error.issues[0];
  const ruta = (p?.path ?? []).filter((x) => x !== 'procedencias');
  const campo = ruta.length ? String(ruta[0]) : '';
  const donde = campo && ETIQUETA_CAMPO_FICHA[campo] ? ` (en ${ETIQUETA_CAMPO_FICHA[campo]})` : '';
  return `${p?.message ?? 'motivo desconocido'}${donde}`;
}

/**
 * LO QUE SE MANDA A LA BASE, CON LOS SELLOS EN RUTA PUNTEADA.
 *
 * ⚠️ `procedencias` NO se manda como objeto entero. `updateDoc` SUSTITUYE el
 * campo que recibe, así que guardar hoy la altura libre borraría el sello que
 * alguien puso el mes pasado en la carga de rotura — un dato que se queda sin
 * origen dentro de un documento que respalda un papel firmado, y sin un solo
 * error por el camino. Con `procedencias.alturaLibre_m` se toca esa clave y solo
 * esa; es la misma fusión campo a campo que hace `aplicarFicha` en la mitad pura.
 */
function parcheDeFicha(validado: Record<string, unknown>): Record<string, unknown> {
  const { procedencias, ...valores } = validado;
  const salida: Record<string, unknown> = { ...valores };
  for (const [campo, sello] of Object.entries((procedencias ?? {}) as Record<string, unknown>)) {
    if (sello !== undefined) salida[`procedencias.${campo}`] = sello;
  }
  return salida;
}

/** La frase del conflicto, con sus tres partes: qué pasó, que no se escribió, qué hacer. */
function conflicto(donde: string): string {
  return `Otra persona guardó cambios en ${donde} mientras lo tenías abierto. `
    + 'No se ha escrito nada para no borrar su trabajo. Copia lo que hayas escrito, '
    + 'recarga la ficha y vuelve a ponerlo.';
}

/**
 * CUÁNTOS RECORRIDOS LEVANTADOS SE TRAEN DE CADA SERIE, COMO MUCHO.
 *
 * Es un freno de coste y de memoria, no un criterio: una serie con doscientas
 * jornadas de campo no puede descargarlas todas cada vez que se abre la línea.
 * Cincuenta es lo que había —esto no cambia cuánto se trae—; lo que cambia es
 * que ahora, cuando el tope muerde, se DICE.
 */
export const TOPE_DE_LEVANTAMIENTOS = 50;

/**
 * CÓMO SE ENTERA QUIEN LLAMA DE QUE EL TOPE RECORTÓ LA LECTURA.
 *
 * ⚠️ POR QUÉ NO VIAJA EN LO DEVUELTO, que sería lo natural. Porque
 * `listarLevantamientos` devuelve una lista de recorridos y esa firma la declara
 * el repositorio (`repositorio.ts §Repositorio`), que lo implementan también el
 * repositorio sin sesión y el puente: cambiar el tipo de vuelta obligaría a
 * tocar tres archivos que no son de este cambio, y aquí los cambios son
 * ADITIVOS. Así que se recoge por un canal aparte y opcional: quien no lo pase
 * recibe exactamente lo de siempre.
 *
 * Es la misma idea que `recortado`/`aviso` en el histórico de cargabilidad, con
 * la frase redactada DONDE SE HIZO LA CONSULTA y no en cada pantalla: dos
 * pantallas redactando el mismo aviso acaban diciendo dos cosas distintas.
 */
export interface AvisoDeTopeDeRecorridos {
  /**
   * Identificador de serie → su código («LN-627», «TR-618»), para que el aviso
   * nombre la serie por donde se la conoce y no por un identificador que en
   * pantalla no dice nada. Sin rótulo el aviso sigue saliendo, más vago.
   */
  rotulos?: ReadonlyMap<string, string>;
  /** Se llama UNA vez por cada serie recortada, con la frase ya escrita. */
  avisar?: (aviso: string) => void;
}

/**
 * ⚠️ `satisfies Repositorio` Y NO `: Repositorio`, y la diferencia importa.
 *
 * Con la anotación de tipo, CADA método se ve desde fuera con la firma de la
 * interfaz, aunque aquí acepte más: `listarLevantamientos` admite un segundo
 * argumento opcional —el canal por donde dice si el tope recortó— y con
 * `: Repositorio` ese argumento era invisible para quien llama, incluso desde
 * este mismo archivo. Con `satisfies` se sigue comprobando, igual de estricto,
 * que este objeto cumple la interfaz entera —si mañana falta un método o cambia
 * un tipo, el error salta aquí—, pero lo que se ve desde fuera es lo que de
 * verdad hay. Es lo que permite que el aviso del tope no obligue a tocar
 * `repositorio.ts` ni `enlace.ts`, que no son de este cambio.
 */
export const repositorioFirestore = {
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
      const { rol, orgId, claims, motivoDeReclamos, autenticadoEn } = await credenciales(u);
      return {
        fase: 'autenticado', uid: u.uid, correo: u.email, rol, orgId,
        claims, motivoDeReclamos, permisos: permisosDeSesion({ claims }), autenticadoEn,
      };
    } catch {
      // Sin token legible NO se encierra a nadie —la sesión sigue— pero tampoco
      // se le regala nada: reclamos nulos, o sea mínimo privilegio.
      return {
        fase: 'autenticado', uid: u.uid, correo: u.email, rol: 'ninguno', orgId: '',
        claims: null,
        motivoDeReclamos: 'No se pudo leer el permiso de su sesión. Por precaución no se ofrece '
          + 'ninguna acción de escritura. Salga y vuelva a entrar.',
        permisos: permisosDeSesion(null), autenticadoEn: null,
      };
    }
  },

  async listarLineas(): Promise<Linea[]> {
    const { esperarSesion, credenciales, baseDatos } = await cargarFirebase();
    const { collection, getDocs, limit, query, where } = await firestore();
    const u = await esperarSesion();
    if (!u) return [];
    const { orgId, claims } = await credenciales(u);
    if (!orgId) return [];   // sin organización en el token no hay nada que ver

    // Se filtra SOLO por organización en la consulta. Lo de "activa" se descarta
    // aquí, en el cliente: combinar dos filtros de igualdad puede exigir un
    // índice compuesto, y un índice que falta no da un error claro — deja la
    // consulta colgada. A esta escala (decenas de líneas) no compensa el riesgo.
    const q = query(collection(await baseDatos(), 'lineas'), where('orgId', '==', orgId), limit(50));
    const s = await getDocs(q);
    // EL ALCANCE SE HACE CUMPLIR AQUÍ, y hasta hoy no se hacía cumplir en
    // ningún sitio: el token no traía `l`, así que «las líneas asignadas» era
    // una frase de pantalla sin nada detrás. Ahora existe, y por eso el filtro
    // existe también — un campo que se modela y nadie hace cumplir es la
    // «ilusión de control» que el catálogo prohíbe por escrito.
    //
    // Se filtra en el CLIENTE por lo mismo que `activa`: meter un segundo
    // filtro de igualdad en la consulta puede exigir un índice compuesto, y un
    // índice que falta no da error claro. A esta escala (decenas de líneas) no
    // compensa el riesgo. La frontera de verdad son las reglas, del otro lado.
    // EL ORDEN DEL PARQUE SE DECIDE AQUÍ, EN EL NAVEGADOR, y no en la consulta.
    // Por fecha de alta: la más antigua primero, que es lo que hace que entrar
    // sin enlace abra la línea de siempre. Un `orderBy('creadoEn')` en la
    // consulta pediría un índice compuesto que **el emulador no exige**
    // (`35 · L-85`) —verde aquí, parque vacío en producción— y encima dejaría
    // fuera cualquier línea sin ese campo. `ordenarParque` es puro y está
    // probado; aquí solo se aplica.
    return ordenarParque(s.docs
      .map((d) => validar<Linea>(Linea, d.data()))
      .filter((x): x is Linea => x !== null && x.activa !== false)
      .filter((l) => alcanza({ claims }, l.id)));
  },

  /**
   * LOS RECORRIDOS LEVANTADOS DE UNAS SERIES. Una consulta por serie.
   *
   * ⚠️ SIN `orderBy` EN LA CONSULTA, a propósito. El índice declarado para esta
   * colección es `(orgId, serieId)` y nada más: añadir aquí un orden pediría un
   * índice que **no existe**, y el emulador sirve la consulta sin quejarse
   * (`35 · L-85`) — o sea, verde en las pruebas y «no existen registros» en
   * producción. Se ordena abajo, en el cliente, por la fecha de la JORNADA de
   * campo: lo más reciente primero, que es lo que se enseña arriba.
   *
   * No lanza: lo que no se pueda leer se devuelve como lista corta y quien
   * llama decide. Una línea no se queda sin abrir porque falle esto.
   *
   * `avisoDeTope` es opcional y sirve para UNA cosa: enterarse de si el tope
   * recortó la lectura (`TOPE_DE_LEVANTAMIENTOS`). Quien no lo pase recibe
   * exactamente lo de siempre —una lista de recorridos—, y por eso la firma que
   * declara el repositorio (`repositorio.ts §Repositorio`) no cambia.
   */
  async listarLevantamientos(
    serieIds: string[],
    avisoDeTope?: AvisoDeTopeDeRecorridos,
  ): Promise<Levantamiento[]> {
    const { esperarSesion, credenciales, baseDatos } = await cargarFirebase();
    const { collection, getDocs, limit, query, where } = await firestore();
    const u = await esperarSesion();
    if (!u) return [];
    const { orgId } = await credenciales(u);
    if (!orgId) return [];

    const ids = [...new Set((serieIds ?? []).map(String).filter(Boolean))];
    if (!ids.length) return [];

    const db = await baseDatos();
    const leidos: Levantamiento[] = [];
    for (const serieId of ids) {
      // El filtro por `orgId` es OBLIGATORIO aunque `serieId` ya acote: en
      // Firestore las reglas NO son filtros, y una consulta que no declara lo
      // que la regla exige se niega ENTERA. Es la trampa que ya costó una tarde
      // en `apoyos`.
      //
      // SE PIDE UNO MÁS DEL TOPE, A PROPÓSITO. Es la única forma honesta de
      // saber si quedó algo fuera: con `limit(50)` a secas, cincuenta leídos
      // pueden ser el final justo o el principio de doscientos, y no hay manera
      // de distinguirlo. Se piden 51, se entregan 50 —los mismos de antes— y el
      // de más solo sirve para poder decirlo. Es lo que ya hace el histórico de
      // cargabilidad (`cargabilidadRepo.ts §recorteDeResumenes`).
      const s = await getDocs(query(
        collection(db, 'levantamientos'),
        where('orgId', '==', orgId),
        where('serieId', '==', serieId),
        limit(TOPE_DE_LEVANTAMIENTOS + 1),
      ));
      // ⚠️ EL AVISO NO DICE «LOS MÁS RECIENTES», Y ES UNA DIFERENCIA REAL. La
      // consulta no lleva orden —no hay índice para ello, y ponerlo sería verde
      // aquí y vacío en producción (`35 · L-85`)—, así que la base devuelve los
      // que quiera y la fecha se ordena DESPUÉS, con lo que ya llegó. O sea que
      // lo que se queda fuera no son «los más antiguos»: puede ser el recorrido
      // de la semana pasada. Prometer que son los más recientes sería el cartel
      // que miente, que es justo el defecto que esto cierra.
      for (const d of s.docs.slice(0, TOPE_DE_LEVANTAMIENTOS)) {
        const v = validar<Levantamiento>(Levantamiento, d.data());
        if (v) leidos.push(v);
      }
      if (s.docs.length > TOPE_DE_LEVANTAMIENTOS) {
        const rotulo = avisoDeTope?.rotulos?.get(serieId) ?? 'una de las series de esta línea';
        avisoDeTope?.avisar?.(
          `Se han traído ${TOPE_DE_LEVANTAMIENTOS} recorridos levantados de ${rotulo} y hay más guardados. `
          + `No son «los ${TOPE_DE_LEVANTAMIENTOS} más recientes»: la base los entrega en el orden en que `
          + 'están guardados y la fecha se ordena aquí, con los que ya llegaron, así que puede haberse '
          + 'quedado fuera alguno reciente.',
        );
      }
    }

    // Lo más reciente primero, por el día que se RECORRIÓ. La regla es pura y
    // está probada (`ordenarLevantamientos`); aquí solo se aplica.
    return ordenarLevantamientos(leidos);
  },

  async cargarLinea(lineaId: string): Promise<EstadoDatos> {
    const { esperarSesion, credenciales, baseDatos } = await cargarFirebase();
    const { collection, doc, getDoc, getDocs, orderBy, query, where } = await firestore();
    const u = await esperarSesion();
    if (!u) return { fase: 'sin_sesion' };

    // EL ALCANCE, ANTES DE PEDIR NADA. Si esta línea no está entre las suyas no
    // se lee ni un documento: pedirla y que la base la niegue daría el mismo
    // resultado con un mensaje en inglés y una lectura facturada de más.
    const { orgId, claims } = await credenciales(u);
    if (!alcanza({ claims }, lineaId)) {
      return {
        fase: 'error',
        mensaje: 'Esta línea no está entre las que su cuenta tiene asignadas. No se ha leído '
          + 'ningún dato. Si debería estarlo, el administrador puede añadírsela a su alcance.',
      };
    }

    const db = await baseDatos();
    const dLinea = await getDoc(doc(db, 'lineas', lineaId));
    if (!dLinea.exists()) return { fase: 'vacio' };

    const linea = validar<Linea>(Linea, dLinea.data());
    if (!linea) {
      return { fase: 'error', mensaje: 'La línea guardada no cumple el contrato del sistema. No se muestra por seguridad.' };
    }

    // ── LAS SERIES DE ESTA LÍNEA ─────────────────────────────────────────────
    // La suya SIEMPRE, y detrás un TRAMO COMPARTIDO por cada declaración
    // abierta: las torres de un trozo que recorren dos líneas se registran una
    // sola vez, a nombre del tramo (`§TramoCompartidoEnLinea`). Quién decide
    // qué series hay y cómo se juntan es `seriesDeLinea`/`apoyosDeLasSeries`,
    // que son PUROS y están probados sin base de datos; aquí solo se pide.
    //
    // ⚠️ Una línea SIN tramos devuelve UNA serie, o sea EXACTAMENTE la consulta
    // de siempre. LN-627 no cambia de camino, y hay una prueba que cuenta las
    // consultas para que siga siendo verdad dentro de un año.
    const series = seriesDeLinea(linea);

    // ⚠️ EL FILTRO POR `orgId` ES OBLIGATORIO, aunque la serie ya acote el
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
    //
    // La forma de la consulta es la MISMA para una línea y para un tramo —solo
    // cambia el valor de `lineaId`, que desde 0.16.0 se lee «id de la serie»—,
    // así que la sirve el índice `(orgId, lineaId, orden)` que ya existe: leer
    // por tramo no estrena ninguna consulta y no hace falta índice nuevo.
    const pedirApoyos = async (serie: SerieDeLinea): Promise<Apoyo[]> => {
      // EL ALCANCE DEL TRAMO, ANTES DE PEDIRLO. El de la línea ya se comprobó
      // arriba; el del tramo es OTRO id, y una cuenta con alcance acotado —que
      // no lo lleve en su lista— recibiría de la base un «Missing or
      // insufficient permissions» en inglés, después de pagar la lectura. Aquí
      // se convierte en una frase que dice qué hacer. Es el hueco que las
      // reglas ya dejaron medido y escrito.
      if (serie.tipo === 'tramo' && !alcanza({ claims }, serie.id)) {
        throw new Error(
          `el tramo compartido ${serie.codigo} no está entre lo que su cuenta tiene asignado. `
          + 'Sus torres no se han leído. El administrador puede añadir el tramo a su alcance.',
        );
      }
      const s = await getDocs(query(
        collection(db, 'apoyos'),
        where('orgId', '==', orgId),
        where('lineaId', '==', serie.id),
        orderBy('orden', 'asc'),
      ));
      return s.docs
        .map((d) => validar<Apoyo>(Apoyo, d.data()))
        .filter((x): x is Apoyo => x !== null);
    };
    // ⚠️ EL LIBRO DE CÓDIGOS VIAJA CON LA LECTURA, y no es un adorno: es lo
    // único que amarra el `codigo` que se ENSEÑA de un tramo con el `id` con el
    // que se PIDEN sus torres. Sin él, una línea que declare
    // `{ codigo: 'TR-618', id: <el id de otra línea> }` se trae las torres de
    // esa otra línea rotuladas como del tramo, en silencio, y esas torres
    // entran en el cálculo y en el informe. Quien decide es `seriesAvaladas`,
    // que es pura y está probada; aquí solo se le pasa el libro.
    const leido = await apoyosDeLasSeries(series, pedirApoyos, LIBRO_DE_CODIGOS);
    const apoyos = leido.apoyos;

    // ── LAS HIPÓTESIS ────────────────────────────────────────────────────────
    // Ya NO tumban la línea. Hay tres estados y son distintos: no hay ninguna
    // declarada (falta, y se dice cuál); hay una declarada que no se pudo leer
    // o no cumple el molde (falta Y se declara el motivo); o está y la línea
    // calcula como siempre. Aplanar los dos primeros en «no tiene hipótesis»
    // convertiría un fallo de lectura en una afirmación sobre la línea.
    let hipotesis: Hipotesis | null = null;
    let falloHipotesis: string | undefined;
    if (linea.hipotesisId) {
      try {
        const dHip = await getDoc(doc(db, 'hipotesis', linea.hipotesisId));
        hipotesis = dHip.exists() ? validar<Hipotesis>(Hipotesis, dHip.data()) : null;
        if (!hipotesis) {
          falloHipotesis = dHip.exists()
            ? 'Las hipótesis de cálculo que esta línea declara no cumplen el molde del sistema, así que '
              + 'no se usan. No se toman las de otra línea.'
            : 'Las hipótesis de cálculo que esta línea declara no están en la base.';
        }
      } catch (e) {
        console.warn('[datos] no se pudieron leer las hipótesis:', e);
        falloHipotesis = e instanceof Error ? e.message : 'fallo desconocido';
      }
    }

    // ── QUÉ LE FALTA A ESTA LÍNEA, Y QUÉ NO SE PUDO MIRAR ────────────────────
    // Tres datos que ENTREGA una persona y que no se deducen ni se copian de
    // otra línea (orden del Ingeniero, 2026-09-17).
    //
    // ⚠️ SE PASA `hipotesisDeclarada` —del DOCUMENTO— y no solo las leídas. Un
    // fallo de lectura llega aquí como `null`, indistinguible de «esta línea no
    // declara hipótesis», y la pantalla lo habría enumerado como «falta
    // declarar las hipótesis» cuando la línea las declara y lo que falló fue la
    // red, el permiso o el molde. Eso es afirmar algo falso sobre la línea
    // (`32 · L-44`): ahora `faltan` lleva solo lo no declarado y el motivo de
    // la lectura viaja aparte, en `noSePudoLeer.hipotesis`.
    const revisado = faltasYHuecosDeLinea({
      conductor: linea.conductor,
      hipotesisDeclarada: Boolean(linea.hipotesisId),
      hipotesis,
      falloHipotesis,
      apoyos: apoyos.length,
    });
    const faltan = revisado.faltan;

    // Los expedientes de falla son OPCIONALES: una línea sin eventos es lo
    // normal, y un fallo leyéndolos no puede tumbar la vista entera de la
    // línea — el cálculo mecánico no depende de ellos.
    //
    // Se piden por el id de la LÍNEA y no por serie, a propósito: un expediente
    // es un hecho que se registra DESDE una línea, y hoy no hay consulta por
    // torre. Consecuencia declarada: un expediente abierto en una torre
    // compartida solo lo ve la línea que lo registró.
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
    //
    // ⚠️ SE PIDEN POR SERIE, igual que los apoyos: la foto de una torre
    // compartida cuelga de la TORRE, y la torre pertenece al tramo — así que su
    // ficha lleva el id del tramo en `lineaId`. Preguntando solo por el id de
    // la línea, una línea con tramo compartido enseñaría CERO fotos de sus
    // torres sin un solo error por el camino. Una línea sin tramos hace, otra
    // vez, exactamente la consulta de hoy.
    let evidencias: Evidencia[] = [];
    let falloEvidencias: string | undefined;
    try {
      const porId = new Map<string, Evidencia>();
      for (const serie of series) {
        const sEv = await getDocs(query(
          collection(db, 'evidencias'),
          where('orgId', '==', orgId),
          where('lineaId', '==', serie.id),
        ));
        for (const d of sEv.docs) {
          const e = validar<Evidencia>(Evidencia, d.data());
          if (e) porId.set(e.id, e);
        }
      }
      evidencias = [...porId.values()];
    } catch (e) {
      console.warn('[datos] no se pudieron leer las fichas de evidencia:', e);
      falloEvidencias = e instanceof Error ? e.message : 'fallo desconocido';
    }

    // El hueco viaja con el dato. Si no se pudo leer algo, la pantalla tiene que
    // poder decirlo en vez de afirmar que no hay nada (`32 · L-44`).
    const hueco = {
      ...(falloInvestigaciones ? { investigaciones: falloInvestigaciones } : {}),
      ...(falloEvidencias ? { evidencias: falloEvidencias } : {}),
      ...(leido.noSePudoLeer ? { torres: leido.noSePudoLeer } : {}),
    };

    // ── LA LÍNEA QUE TODAVÍA NO CALCULA ──────────────────────────────────────
    // Abre igual y dice qué le falta. Antes esto era `{ fase: 'error' }` o
    // `{ fase: 'vacio' }`, y las dos SUSTITUYEN la pantalla entera: dar de alta
    // una línea incompleta se llevaba por delante el parque y con él el acceso
    // a la línea que sí funciona.
    // ⚠️ LA CONDICIÓN NO ES «¿FALTA ALGO?» SINO «¿PUEDE CALCULAR?», y la
    // diferencia es un caso real: una línea con conductor, torres e hipótesis
    // DECLARADAS que no se pudieron leer no echa nada en falta y aun así no
    // puede calcular. Preguntando solo por `faltan` seguiría al camino de
    // siempre y llegaría a `hipotesis!` siendo nula.
    if (!revisado.puedeCalcular) {
      // El recorrido levantado se lee SOLO aquí, y es deliberado: es lo que la
      // pantalla enseña cuando no hay torres que enseñar. Pedirlo también en el
      // camino bueno añadiría una lectura facturada a cada apertura de una
      // línea que hoy funciona, para un dato que ninguna pestaña le pide
      // todavía. Quien lo necesite en una línea completa lo pide por su nombre
      // (`listarLevantamientos`).
      let levantamientos: Levantamiento[] = [];
      let falloLevantamientos: string | undefined;
      // Lo que diga el tope si recorta, para que salga junto a los demás avisos
      // de series en vez de quedarse en la consola.
      const avisosDelTope: string[] = [];
      // ⚠️ LAS SERIES QUE EL LIBRO AVALA, NO LA LISTA CRUDA — y es el MISMO daño
      // que `apoyosDeLasSeries` ya cierra con las torres, por un camino que
      // estaba abierto. Pidiendo por la lista cruda, una línea que declare
      // `{ codigo: 'TR-618', id: <el id de otra línea> }` no se trae ni una
      // torre del tramo —el libro lo para— pero SÍ se trae su recorrido
      // levantado, y la pantalla lo dibuja rotulado como del tramo compartido.
      // Un trazado ajeno enseñado como propio es exactamente lo que el libro
      // existe para impedir.
      //
      // Se vuelve a cruzar el libro aquí en vez de reaprovechar el cruce de
      // `apoyosDeLasSeries` porque esa función no lo devuelve; y pasarle la
      // lista ya filtrada sería PEOR: los avisos de lo que se dejó fuera nacen
      // ahí dentro, y con la lista limpia no tendría de qué avisar. Cruzar dos
      // veces no cuesta ninguna lectura —es una cuenta pura sobre un mapa que ya
      // está en memoria—, y sus avisos NO se recogen aquí: son los mismos que ya
      // viajan en `leido.avisos` y decirlos otra vez sería un aviso duplicado.
      const avaladas = seriesAvaladas(series, LIBRO_DE_CODIGOS).series;
      try {
        // Por su nombre y no por `this`: quien llame a `cargarLinea` puede
        // haberla sacado del objeto (`const { cargarLinea } = repositorio`), y
        // entonces `this` no existe y la línea entera se caería por un dato
        // accesorio.
        levantamientos = await repositorioFirestore.listarLevantamientos(
          avaladas.map((s) => s.id),
          {
            rotulos: new Map(avaladas.map((s) => [s.id, s.codigo])),
            avisar: (aviso) => avisosDelTope.push(aviso),
          },
        );
      } catch (e) {
        console.warn('[datos] no se pudieron leer los levantamientos:', e);
        falloLevantamientos = e instanceof Error ? e.message : 'fallo desconocido';
      }
      // El motivo de las hipótesis sale de `revisado.noSePudoLeer` y NO de
      // `falloHipotesis` a pelo: ahí ya se decidió que unas hipótesis que la
      // línea no declara no son un hueco de lectura, sino una falta.
      const huecoRecorrido = {
        ...hueco,
        ...(falloLevantamientos ? { levantamientos: falloLevantamientos } : {}),
        ...revisado.noSePudoLeer,
      };
      // Los avisos de las series y los del tope salen por el mismo sitio: los
      // dos dicen «esto que ves no es todo lo que hay», que es lo único que la
      // pantalla necesita saber para no afirmar de más.
      const avisosDeSeries = [...leido.avisos, ...avisosDelTope];
      return {
        fase: 'recorrido',
        linea,
        apoyos,
        evidencias,
        investigaciones,
        faltan,
        levantamientos,
        ...(avisosDeSeries.length ? { avisosDeSeries } : {}),
        ...(Object.keys(huecoRecorrido).length ? { noSePudoLeer: huecoRecorrido } : {}),
      };
    }

    // A partir de aquí la línea está completa, y el camino es el de siempre.
    // Los dos `!` no son un atajo: `faltasYHuecosDeLinea` acaba de comprobar
    // que los dos están **y que las hipótesis se pudieron leer de verdad** —que
    // es justo lo que `faltan` por sí solo no distinguía—, y si mañana alguien
    // afloja esa comprobación, la prueba de «línea completa igual que hoy» se
    // pone roja antes que la pantalla.
    return {
      fase: 'listo',
      linea,
      apoyos,
      conductor: linea.conductor!,
      hipotesis: hipotesis!,
      investigaciones,
      evidencias,
      ...(leido.avisos.length ? { avisosDeSeries: leido.avisos } : {}),
      ...(Object.keys(hueco).length ? { noSePudoLeer: hueco } : {}),
    };
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

    const { rol, orgId, claims } = await credenciales(u);
    if (!puede({ claims }, 'cargar.puntos')) {
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
   * ⚠️ EL ALTA DE UNA LÍNEA: UN documento, y no se puede deshacer.
   *
   * `firestore.rules` niega `delete` sobre líneas —se marcan inactivas, no se
   * borran— y además deja ACTUALIZAR a quien tiene `lineas.editar`. Las dos
   * cosas juntas son lo que obliga a este orden, que es el mismo de
   * `cargarPuntosNuevos` con un paso más:
   *
   *   1. **Permiso ANTES de mandar nada.** Es `lineas.editar` ('le'), lo que la
   *      regla pide para crear. Preguntar aquí convierte una denegación opaca en
   *      una frase que se entiende.
   *   2. **`orgId` y `creadoPor` se sellan con la SESIÓN.** `altaCoherente()`
   *      exige que el autor sea exactamente quien escribe, y es el único rechazo
   *      campo por campo que hay. La firma de cada tramo compartido se sella
   *      igual (`sellarTramos`): dentro del array no mira nadie.
   *   3. **Se valida contra el molde antes de mandar.** Las reglas no miran el
   *      contenido de una línea, así que este `safeParse` es la única defensa que
   *      tiene la forma del dato — y una línea que el molde rechaza al LEERLA
   *      desaparecería del parque en silencio.
   *   4. **Se comprueba el ALCANCE.** La regla exige `alcanza(lineaId)`, y una
   *      sesión con alcance acotado no puede crear una línea que no tenga
   *      asignada. Sin esta comprobación, la denegación llegaría en inglés
   *      después de rellenar el formulario entero.
   *   5. **Se mira con `getDoc` si la línea YA existe, y si existe no se escribe.**
   *      El identificador sale del libro de códigos y es siempre el mismo para un
   *      código: un segundo alta sería un `setDoc` sobre el documento vivo, que
   *      la regla PERMITE, y se llevaría por delante su conductor, sus hipótesis
   *      y sus tramos. Preguntar es seguro: `puedeVer()` contempla el documento
   *      que no existe (`§existe()`), así que un `get` de algo que aún no está
   *      contesta vacío en vez de denegar.
   *   6. **Se vuelve a leer lo escrito y se CUENTA.** Una escritura que no lanza
   *      dice «la base la aceptó», no «está escrito lo que yo creía».
   */
  async crearLinea(documento: Record<string, unknown>): Promise<AcuseDeLineaNueva> {
    const { esperarSesion, credenciales, baseDatos } = await cargarFirebase();
    const { doc, getDoc, setDoc } = await firestore();
    const u = await esperarSesion();
    if (!u) throw new Error('No hay ninguna sesión abierta: no se puede dar de alta ninguna línea.');

    const { rol, orgId, claims } = await credenciales(u);
    if (!puede({ claims }, 'lineas.editar')) {
      throw new Error(
        `Su sesión entró con el permiso «${rol}», y dar de alta una línea necesita el permiso de crear y `
        + 'editar líneas y su conductor. No se ha mandado nada a la base. Si esto le sorprende, es que el '
        + 'permiso de su cuenta cambió: hay que revisarlo antes del alta, no después.',
      );
    }
    if (!orgId) {
      throw new Error(
        'Su sesión no declara a qué organización pertenece, y una línea sin organización no la puede leer '
        + 'nadie después — ni usted. No se ha mandado nada a la base.',
      );
    }

    const ahora = new Date().toISOString();
    const sellado = sinIndefinidos({
      ...documento,
      orgId,
      creadoPor: u.uid,
      ...(documento?.tramosCompartidos !== undefined
        ? { tramosCompartidos: sellarTramos(documento.tramosCompartidos, u.uid, ahora) }
        : {}),
    });

    const sinProcedencia = faltaProcedenciaDeTramo(sellado.tramosCompartidos);
    if (sinProcedencia) {
      throw new Error(
        `No se dio de alta nada: ${sinProcedencia}. Declarar que una línea recorre un tramo decide qué `
        + 'torres entran en su informe, y esa declaración no se borra: se cierra con fecha y motivo.',
      );
    }

    const r = Linea.safeParse(sellado);
    if (!r.success) {
      const p = r.error.issues[0];
      const donde = p?.path?.length ? ` (en «${p.path.join('.')}»)` : '';
      throw new Error(
        `La línea no cumple el molde de los datos y NO se ha mandado nada a la base: `
        + `${p?.message ?? 'motivo desconocido'}${donde}.`,
      );
    }

    if (!alcanza({ claims }, r.data.id)) {
      throw new Error(
        `Su sesión no alcanza a ${r.data.codigo}: tiene asignadas unas líneas concretas y ésta todavía no `
        + 'está entre ellas. La base negaría el alta. No se ha mandado nada. Un administrador tiene que '
        + 'añadir esta línea a su alcance antes de darla de alta.',
      );
    }

    const db = await baseDatos();
    const ref = doc(db, 'lineas', r.data.id);

    const antes = await getDoc(ref);
    if (antes.exists()) {
      // Ya estaba. NO se reescribe: un `setDoc` aquí lo permite la regla y
      // pisaría la línea viva entera.
      const viva = validar<Linea>(Linea, antes.data());
      return {
        codigo: r.data.codigo,
        id: r.data.id,
        yaEstaba: true,
        releida: viva
          ? {
            codigo: viva.codigo,
            nombre: viva.nombre,
            tensionNominal_kV: viva.tensionNominal_kV,
            circuitos: viva.circuitos,
            tramosCompartidos: viva.tramosCompartidos?.length ?? 0,
          }
          : null,
      };
    }

    // Se escribe lo que SALIÓ del molde, no lo que entró: validar una cosa y
    // escribir otra es la peor forma de este fallo. Y se vuelve a pasar por
    // `sinIndefinidos` porque el molde puede devolver una clave opcional
    // presente y sin valor, con la que el SDK lanza.
    const validado = sinIndefinidos(r.data as unknown as Record<string, unknown>);
    await setDoc(ref, validado);

    // La relectura NO tumba el alta: la línea ya está escrita, y decir que no lo
    // está sería peor que no poder contarla. Se devuelve `null`, que la pantalla
    // enseña como «no se pudo comprobar», nunca como «no se escribió».
    let releida: AcuseDeLineaNueva['releida'] = null;
    try {
      const despues = await getDoc(ref);
      const v = despues.exists() ? validar<Linea>(Linea, despues.data()) : null;
      if (v) {
        releida = {
          codigo: v.codigo,
          nombre: v.nombre,
          tensionNominal_kV: v.tensionNominal_kV,
          circuitos: v.circuitos,
          tramosCompartidos: v.tramosCompartidos?.length ?? 0,
        };
      }
    } catch { /* la comprobación falló; la escritura no. Se dice, no se inventa. */ }

    return { codigo: r.data.codigo, id: r.data.id, yaEstaba: false, releida };
  },

  /**
   * ⚠️ EL RECORRIDO LEVANTADO, GUARDADO TAL CUAL. Un documento, y tampoco se
   * puede deshacer: `firestore.rules` niega `delete` y congela los puntos.
   *
   * Mismo orden que el alta de la línea, con tres diferencias que hay que saber:
   *
   *   · El permiso es `cargar.puntos` ('cp') —la MISMA función que crea apoyos—
   *     porque es literalmente el mismo acto: cargar el trazado que trajo el GPS.
   *   · El alcance se comprueba contra la SERIE (`serieId`), que puede ser un
   *     tramo compartido y no la línea: son identificadores distintos, y una
   *     sesión con alcance acotado a la línea no alcanza al tramo.
   *   · **La comprobación previa no es una precaución, es obligatoria.** El
   *     identificador se deriva de la fecha de la jornada y de la huella del
   *     archivo, así que leer dos veces el mismo GPX cae sobre el mismo
   *     documento. Ahí la regla solo deja mover la nota, de modo que el segundo
   *     guardado se caería con «Missing or insufficient permissions»: «no tienes
   *     permiso» donde la verdad es «esto ya estaba cargado» (`35 · L-24`).
   */
  async guardarLevantamiento(documento: Record<string, unknown>): Promise<AcuseDeLevantamiento> {
    const { esperarSesion, credenciales, baseDatos } = await cargarFirebase();
    const { doc, getDoc, setDoc } = await firestore();
    const u = await esperarSesion();
    if (!u) throw new Error('No hay ninguna sesión abierta: no se puede guardar ningún recorrido levantado.');

    const { rol, orgId, claims } = await credenciales(u);
    if (!puede({ claims }, 'cargar.puntos')) {
      throw new Error(
        `Su sesión entró con el permiso «${rol}», y guardar el trazado que trajo el GPS es acto de `
        + 'administración: es el mismo permiso con el que se crean puntos. No se ha mandado nada a la base.',
      );
    }
    if (!orgId) {
      throw new Error(
        'Su sesión no declara a qué organización pertenece, y un recorrido sin organización no lo puede '
        + 'leer nadie después — ni usted. No se ha mandado nada a la base.',
      );
    }

    const sellado = sinIndefinidos({ ...documento, orgId, cargadoPor: u.uid, creadoPor: u.uid });

    const r = Levantamiento.safeParse(sellado);
    if (!r.success) {
      const p = r.error.issues[0];
      const donde = p?.path?.length ? ` (en «${p.path.join('.')}»)` : '';
      throw new Error(
        'El recorrido levantado no cumple el molde de los datos y NO se ha mandado nada a la base: '
        + `${p?.message ?? 'motivo desconocido'}${donde}.`,
      );
    }

    if (!alcanza({ claims }, r.data.serieId)) {
      throw new Error(
        `Su sesión no alcanza a ${r.data.codigoSerie}: tiene asignadas unas series concretas y ésta todavía `
        + 'no está entre ellas. La base negaría el guardado. No se ha mandado nada. Un administrador tiene '
        + 'que añadirla a su alcance.',
      );
    }

    const db = await baseDatos();
    const ref = doc(db, 'levantamientos', r.data.id);

    const antes = await getDoc(ref);
    if (antes.exists()) {
      const viejo = validar<Levantamiento>(Levantamiento, antes.data());
      return {
        codigoSerie: r.data.codigoSerie,
        id: r.data.id,
        fecha: r.data.fecha,
        puntosEnviados: r.data.puntos.length,
        puntosReleidos: viejo ? viejo.puntos.length : null,
        yaEstaba: true,
      };
    }

    const validado = sinIndefinidos(r.data as unknown as Record<string, unknown>);
    await setDoc(ref, validado);

    let puntosReleidos: number | null = null;
    try {
      const despues = await getDoc(ref);
      const v = despues.exists() ? validar<Levantamiento>(Levantamiento, despues.data()) : null;
      if (v) puntosReleidos = v.puntos.length;
    } catch { /* la comprobación falló; la escritura no. */ }

    return {
      codigoSerie: r.data.codigoSerie,
      id: r.data.id,
      fecha: r.data.fecha,
      puntosEnviados: r.data.puntos.length,
      puntosReleidos,
      yaEstaba: false,
    };
  },

  /**
   * LAS FICHAS DE UN LOTE DE FOTOGRAFÍAS. La segunda escritura de este sistema
   * que no se puede deshacer: `firestore.rules` niega `delete` sobre evidencias
   * y solo deja corregir el pie y el estado de subida — nunca de qué apoyo
   * cuelga la foto.
   *
   * El orden es el mismo que en `cargarPuntosNuevos`, y por las mismas razones:
   *
   *   1. **Permiso ANTES de mandar nada.** Un lote es atómico y su denegación es
   *      opaca: la base no dice cuál de los documentos la causó. Preguntar aquí
   *      convierte «permiso denegado» en una frase que se entiende. Y aquí basta
   *      con `cuadrilla`, que es lo que `esCuadrilla()` permite para evidencias —
   *      no `admin`: quien va a campo con el teléfono no es administrador.
   *   2. **`creadoPor` se sella con la sesión abierta**, nunca con lo que venga
   *      de fuera. `altaCoherente()` exige que el autor sea exactamente quien
   *      escribe, y es el único rechazo campo por campo que hay.
   *   3. **`orgId` se toma del TOKEN**, por lo mismo: no se manda algo que se
   *      sabe que la base va a negar.
   *   4. **Cada documento se valida contra el molde ANTES de mandarlo.** Las
   *      reglas no miran el contenido de una evidencia, así que este `safeParse`
   *      es la única defensa que tiene la forma del dato — y una ficha que el
   *      molde rechaza se descarta EN SILENCIO al leerla, o sea: la foto
   *      existiría en el depósito y no la vería nadie.
   *   5. **NO se le pregunta a la base si la ficha ya existe.** Ése fue el fallo
   *      del 17-08 (§ADR-028): `puedeLeer()` decide mirando `resource.data.orgId`
   *      y en un documento que aún no existe no hay `resource` — la base no
   *      contesta «no está», DENIEGA. Quien decide si una foto ya entró es su
   *      HUELLA contra las fichas que la aplicación ya tiene en memoria, y eso
   *      se resuelve en la pantalla, antes de llegar aquí.
   *
   * ⚠️ EL AUTOR CAMBIA, y hay que decirlo antes de que salga en un informe. Las
   * 99 fichas escritas con la llave maestra llevan `creadoPor: 'subidor'`; las
   * que entren por aquí llevarán el identificador de la sesión. Es correcto y es
   * aditivo, pero cualquier informe que agrupe por autor verá dos valores para
   * el mismo lote de fotos.
   *
   * Se escribe EN LOTES de 400: el límite del SDK son 500 operaciones por lote,
   * y 106 fotos caben de sobra — pero el día que entren 900 no puede fallar
   * entero por una cifra que nadie miró.
   */
  async crearEvidencias(fichas: FichaDeFoto[]): Promise<ResultadoFotos> {
    const { esperarSesion, credenciales, baseDatos } = await cargarFirebase();
    const { doc, writeBatch } = await firestore();
    const u = await esperarSesion();
    if (!u) throw new Error('No hay ninguna sesión abierta: no se puede escribir la ficha de ninguna fotografía.');

    const { rol, orgId, claims } = await credenciales(u);
    if (!puede({ claims }, 'evidencias.aportar')) {
      throw new Error(
        `Su sesión entró con el permiso «${rol}», y subir fotografías necesita permiso de cuadrilla o superior. `
        + 'No se ha escrito nada en la base.',
      );
    }
    if (!orgId) {
      throw new Error(
        'Su sesión no declara a qué organización pertenece, y una fotografía sin organización no la puede leer '
        + 'nadie después — ni usted. No se ha escrito nada en la base.',
      );
    }

    const db = await baseDatos();
    const ahora = new Date().toISOString();
    const fuera: ResultadoFotos['fuera'] = [];
    const pendientes: { punto: string; ref: ReturnType<typeof doc>; documento: Record<string, unknown> }[] = [];

    for (const f of fichas ?? []) {
      const sellado = sinIndefinidos({
        id: f.id,
        tipo: 'evidencia',
        orgId,
        creadoPor: u.uid,
        creadoEn: ahora,
        revision: 0,
        apoyoId: f.apoyoId,
        lineaId: f.lineaId,
        rutaObjeto: f.rutaObjeto,
        sha256: f.sha256,
        bytes: f.bytes,
        mime: f.mime,
        tomadaEn: f.tomadaEn,
        subida: 'completa',
      });

      const r = Evidencia.safeParse(sellado);
      if (!r.success) {
        const p = r.error.issues[0];
        const donde = p?.path?.length ? ` (en «${p.path.join('.')}»)` : '';
        fuera.push({ punto: f.punto, archivo: f.rutaObjeto, motivo: `${p?.message ?? 'motivo desconocido'}${donde}` });
        continue;
      }
      // Se guarda lo que salió del molde, no lo que entró: validar una cosa y
      // escribir otra es la peor forma de este fallo.
      pendientes.push({
        punto: f.punto,
        ref: doc(db, 'evidencias', f.id),
        documento: sinIndefinidos(r.data as unknown as Record<string, unknown>),
      });
    }

    for (let i = 0; i < pendientes.length; i += 400) {
      const trozo = pendientes.slice(i, i + 400);
      const lote = writeBatch(db);
      for (const p of trozo) lote.set(p.ref, p.documento);
      await lote.commit();
    }

    const porPunto = new Map<string, number>();
    for (const p of pendientes) porPunto.set(p.punto, (porPunto.get(p.punto) ?? 0) + 1);

    return {
      escritas: [...porPunto].map(([punto, fotos]) => ({ punto, fotos })),
      yaEstaban: [],
      fuera,
    };
  },

  /**
   * LA FICHA ESTRUCTURAL DE UN APOYO: los seis datos que le faltan para poder
   * tener veredicto, cada uno con su sello de procedencia.
   *
   * El orden es el mismo que en `cargarPuntosNuevos`, y por las mismas razones —
   * un apoyo no se borra (`firestore.rules`: `allow delete: if false`), así que
   * todo lo que se pueda comprobar antes de mandar se comprueba antes:
   *
   *   1. **Permiso ANTES de mandar.** Una denegación de la base llega en inglés
   *      y sin causa; aquí se convierte en una frase que se entiende.
   *   2. **La firma y la hora las pone la SESIÓN**, nunca lo que venga de fuera.
   *      Lo que el Ingeniero declara es de dónde salió el dato; quién responde de
   *      él y cuándo lo dijo no se lo pregunta nadie.
   *   3. **Se valida contra `FichaEstructural`**, que es `strict` y exige el par
   *      valor+sello. Las reglas NO miran el contenido de un apoyo, así que este
   *      `safeParse` es la única defensa que tiene la forma del dato.
   *   4. **Se relee el apoyo** — para el cerrojo de revisión y para poder juzgar
   *      la GEOMETRÍA sobre el apoyo COMPLETO. Un parche que solo trae el amarre
   *      no puede saber dónde está la punta; el apoyo de la base con el parche
   *      encima, sí, y es exactamente lo que verá el núcleo.
   *   5. **Se escribe lo que salió del molde**, no lo que entró.
   *
   * Lo puede hacer un EDITOR: es lo que permiten las reglas para un apoyo.
   */
  async guardarFichaApoyo(
    apoyoId: string,
    ficha: Record<string, unknown>,
    revision: number,
  ): Promise<AcuseDeFicha> {
    const { esperarSesion, credenciales, baseDatos } = await cargarFirebase();
    const { doc, getDoc, updateDoc } = await firestore();
    const u = await esperarSesion();
    if (!u) throw new Error('No hay ninguna sesión abierta: no se puede guardar la ficha de ningún apoyo.');

    const { rol, orgId, claims } = await credenciales(u);
    if (!puede({ claims }, 'apoyos.editar')) {
      throw new Error(
        `Su sesión entró con el permiso «${rol}», y completar la ficha de un apoyo exige permiso de `
        + 'edición. No se ha mandado nada a la base.',
      );
    }
    if (!orgId) {
      throw new Error(
        'Su sesión no declara a qué organización pertenece. No se ha mandado nada a la base.',
      );
    }

    const ahora = new Date().toISOString();
    const sellada = sellarFicha(ficha ?? {}, u.uid, ahora);
    const r = FichaEstructural.safeParse(sellada);
    if (!r.success) throw new Error(motivoDelMolde(r.error));
    const validada = r.data as unknown as Record<string, unknown>;

    const ref = doc(await baseDatos(), 'apoyos', apoyoId);
    const actual = await getDoc(ref);
    if (!actual.exists()) {
      throw new Error(
        'Ese apoyo ya no está en la base. No se ha escrito nada: si se escribiera, nacería un apoyo '
        + 'sin línea, sin orden y sin coordenada, y un apoyo no se borra.',
      );
    }
    const revisionEnLaBase = (actual.data()?.revision as number | undefined) ?? 0;
    if (revisionEnLaBase !== revision) throw new Error(conflicto('este apoyo'));

    // LA GEOMETRÍA, SOBRE EL APOYO COMPLETO. Si el amarre queda por encima de la
    // punta, el núcleo devuelve `null` EN SILENCIO: se guardarían cuatro números
    // impecables, no saldría veredicto y parecería una avería de la aplicación.
    // La regla tiene un solo dueño —el módulo puro—, y una prueba lo ata al
    // núcleo. Aquí solo se consulta.
    const { revisarGeometria, aplicarFicha, CAMPOS_DE_FICHA, etiquetaDeOrigen } = await fichaPura();
    const enLaBase = actual.data() as Record<string, unknown>;
    const avisos = revisarGeometria(aplicarFicha(
      enLaBase as unknown as Apoyo,
      validada as unknown as FichaEstructural,
    ));
    if (avisos.length) throw new Error(avisos[0].mensaje);

    await updateDoc(ref, sinIndefinidos({
      ...parcheDeFicha(validada),
      actualizadoEn: ahora,
      actualizadoPor: u.uid,
      revision: revision + 1,
    }));

    // El acuse habla en castellano y por el NOMBRE del apoyo: lo lee el
    // Ingeniero, y un identificador interno no le dice nada a nadie.
    const sellos = (validada.procedencias ?? {}) as Record<string, { procedencia?: string; fuente?: string } | undefined>;
    return {
      apoyo: String(enLaBase?.nombreNormalizado ?? enLaBase?.nombreCampo ?? 'apoyo sin nombre'),
      revision: revision + 1,
      campos: CAMPOS_DE_FICHA
        .filter((c) => validada[c.clave] !== undefined)
        .map((c) => ({
          etiqueta: c.etiqueta,
          origen: etiquetaDeOrigen(sellos[c.clave]?.procedencia),
          // La capacidad longitudinal lleva su fuente DENTRO del propio dato, y
          // es la que el informe imprime. Un hecho, un dueño.
          fuente: (c.clave === 'capacidadLongitudinal'
            ? (validada.capacidadLongitudinal as { fuente?: string } | undefined)?.fuente
            : sellos[c.clave]?.fuente) ?? null,
        })),
    };
  },

  /**
   * DECLARA SI EL VANO QUE SALE DE UN APOYO LLEVA CABLE DE GUARDA.
   *
   * Va aparte de la ficha estructural y no es pereza: la ficha son los seis
   * datos que dan VEREDICTO a un apoyo, su molde rechaza por diseño lo que no es
   * suyo, y esto no da ningún veredicto — es inventario de la protección de la
   * línea. Colarlo por la ficha habría obligado a aflojar justo el molde que
   * protege el veredicto.
   *
   * `null` BORRA la declaración y devuelve el vano a «no consta». Hace falta:
   * una marca equivocada tiene que poder deshacerse sin dejar afirmado lo
   * contrario de lo que se quiso decir, y «presente» no es la forma de borrar
   * «ausente».
   *
   * Mismo cerrojo de revisión que la ficha, y por el mismo motivo: un apoyo no
   * se borra, así que lo que se pise se pisa para siempre.
   */
  async declararCableGuarda(
    apoyoId: string,
    valor: 'presente' | 'ausente' | null,
    revision: number,
  ): Promise<{ apoyo: string; revision: number; valor: 'presente' | 'ausente' | null }> {
    const { esperarSesion, credenciales, baseDatos } = await cargarFirebase();
    const { doc, getDoc, updateDoc, deleteField } = await firestore();
    const u = await esperarSesion();
    if (!u) {
      throw new Error('No hay ninguna sesión abierta: no se puede declarar el cable de guarda.');
    }

    const { rol, orgId, claims } = await credenciales(u);
    if (!puede({ claims }, 'apoyos.editar')) {
      throw new Error(
        `Su sesión entró con el permiso «${rol}», y declarar el cable de guarda exige permiso de `
        + 'edición. No se ha mandado nada a la base.',
      );
    }
    if (!orgId) {
      throw new Error(
        'Su sesión no declara a qué organización pertenece. No se ha mandado nada a la base.',
      );
    }
    if (valor !== null && valor !== 'presente' && valor !== 'ausente') {
      throw new Error(`«${String(valor)}» no es un estado del cable de guarda. No se ha escrito nada.`);
    }

    const ref = doc(await baseDatos(), 'apoyos', apoyoId);
    const actual = await getDoc(ref);
    if (!actual.exists()) {
      throw new Error(
        'Ese apoyo ya no está en la base. No se ha escrito nada: un apoyo no se borra, así que si '
        + 'no está, lo que hay en pantalla no es lo que hay en la base — recargue antes de insistir.',
      );
    }
    const enLaBase = actual.data() as Record<string, unknown>;
    const revisionEnLaBase = (enLaBase?.revision as number | undefined) ?? 0;
    if (revisionEnLaBase !== revision) throw new Error(conflicto('este apoyo'));

    const ahora = new Date().toISOString();
    // `deleteField()` y no `undefined`: escribir `undefined` no borra nada, deja
    // el valor viejo en la base y la pantalla enseñaría el nuevo. Borrar es
    // volver a «no consta», que es un estado legítimo y distinto de «presente».
    await updateDoc(ref, {
      cableGuardaVanoSaliente: valor === null ? deleteField() : valor,
      actualizadoEn: ahora,
      actualizadoPor: u.uid,
      revision: revision + 1,
    });

    return {
      apoyo: String(enLaBase?.nombreNormalizado ?? enLaBase?.nombreCampo ?? 'apoyo sin nombre'),
      revision: revision + 1,
      valor,
    };
  },

  /**
   * EL DATO DE CATÁLOGO APLICADO A VARIOS APOYOS A LA VEZ.
   *
   * Es la pieza que más tiempo ahorra y la única capaz de hacer daño
   * irreversible, así que las salvaguardas no son adorno:
   *
   *   · **Solo los tres campos del MODELO** —carga de rotura, capacidad
   *     longitudinal y tipo de apoyo—, que vienen de un documento y ese
   *     documento es EL MISMO para todos. La altura libre, la del amarre y las
   *     fases amarradas dependen del terreno y de qué hace ese apoyo: copiarlas
   *     es el error que el contrato prohíbe por escrito, y aquí no hay puerta
   *     trasera ni confirmación que se pueda pulsar.
   *   · **Solo estructuras.** Un empalme no sostiene nada y no tiene veredicto
   *     que desbloquear; sellarle una carga de rotura sería inventarle un apoyo.
   *   · **Solo rellena huecos.** Si un apoyo ya declara el dato, queda fuera y el
   *     acuse lo NOMBRA. Así es como se pierde un dato medido debajo de uno de
   *     catálogo, y no se pierde.
   *   · **ADMINISTRADOR**, no editor: el daño de un lote no es el mismo.
   *   · **ATÓMICO.** Si a un solo apoyo lo tocó otra persona, no entra ninguno y
   *     el mensaje lo nombra, para que se desmarque y se reintente.
   */
  async guardarFichaApoyoEnLote(
    apoyoIds: string[],
    ficha: Record<string, unknown>,
    revisiones: Record<string, number>,
  ): Promise<AcuseDeLote> {
    const { esperarSesion, credenciales, baseDatos } = await cargarFirebase();
    const { doc, getDoc, writeBatch } = await firestore();
    const u = await esperarSesion();
    if (!u) throw new Error('No hay ninguna sesión abierta: no se puede guardar la ficha de ningún apoyo.');

    const { rol, orgId, claims } = await credenciales(u);
    if (!puede({ claims }, 'ficha.lote')) {
      throw new Error(
        `Su sesión entró con el permiso «${rol}», y aplicar un dato a varios apoyos de golpe es acto `
        + 'de administración: el daño de un lote no es el de una ficha. No se ha mandado nada a la '
        + 'base. Los apoyos se pueden completar uno a uno con su permiso.',
      );
    }
    if (!orgId) {
      throw new Error('Su sesión no declara a qué organización pertenece. No se ha mandado nada a la base.');
    }

    const ids = [...new Set((apoyoIds ?? []).map(String))];
    if (!ids.length) {
      throw new Error('No hay ningún apoyo marcado. No se ha mandado nada a la base.');
    }

    const { CAMPOS_DE_FICHA, CAMPOS_POR_LOTE, etiquetaDeOrigen } = await fichaPura();

    // EL CORTE, ANTES DE TOCAR NADA. Se traza por si el dato es del MODELO o del
    // EJEMPLAR, no por comodidad — y se hace cumplir aquí, en la escritura, no en
    // el formulario: una salvaguarda que vive solo en la pantalla dura hasta la
    // siguiente pantalla.
    const deEjemplar = CAMPOS_DE_FICHA
      .filter((c) => !c.porLote && (ficha ?? {})[c.clave] !== undefined)
      .map((c) => c.etiqueta.toLowerCase());
    if (deEjemplar.length) {
      throw new Error(
        `No se puede aplicar a varios apoyos: ${deEjemplar.join(', ')}. Depende${deEjemplar.length === 1 ? '' : 'n'} `
        + 'del terreno y de qué hace cada apoyo en la línea —el empotramiento no se ve desde un '
        + 'escritorio, y un terminal amarra todas las fases mientras un apoyo de paso puede no amarrar '
        + 'ninguna—. Se pone uno a uno. No se ha mandado nada a la base.',
      );
    }

    const ahora = new Date().toISOString();
    const sellada = sellarFicha(ficha ?? {}, u.uid, ahora);
    const r = FichaEstructural.safeParse(sellada);
    if (!r.success) throw new Error(motivoDelMolde(r.error));
    const validada = r.data as unknown as Record<string, unknown>;
    const claves = CAMPOS_POR_LOTE.filter((k) => validada[k] !== undefined);

    const db = await baseDatos();
    const nombre = (d: Record<string, unknown> | undefined): string =>
      String(d?.nombreNormalizado ?? d?.nombreCampo ?? 'apoyo sin nombre');

    const pendientes: { ref: ReturnType<typeof doc>; apoyo: string; revision: number }[] = [];
    const yaLoTenian: { apoyo: string; campos: string[] }[] = [];
    const desfasados: string[] = [];

    for (const id of ids) {
      const ref = doc(db, 'apoyos', id);
      const d = await getDoc(ref);
      if (!d.exists()) {
        throw new Error(
          `Uno de los apoyos marcados ya no está en la base. No se ha escrito nada: un lote entra `
          + 'entero o no entra.',
        );
      }
      const datos = d.data() as Record<string, unknown>;

      if ((datos.tipoPunto ?? 'Estructura') !== 'Estructura') {
        throw new Error(
          `«${nombre(datos)}» no es una estructura: es ${String(datos.tipoPunto).toLowerCase()}. Un `
          + 'empalme no sostiene el conductor y no tiene veredicto que desbloquear, así que no se le '
          + 'sella ningún dato de apoyo. No se ha escrito nada.',
        );
      }

      // El cerrojo, POR DOCUMENTO. Se recogen todos los desfasados antes de
      // lanzar: nombrar solo el primero obliga a descubrirlos de uno en uno.
      const revisionEnLaBase = (datos.revision as number | undefined) ?? 0;
      if (revisionEnLaBase !== (revisiones ?? {})[id]) {
        desfasados.push(nombre(datos));
        continue;
      }

      // ⚠️ SOLO RELLENA HUECOS. Un valor ya declarado no se pisa ni aunque el
      // documento del lote sea mejor: para cambiar un dato que ya está, uno a
      // uno y mirándolo.
      const ocupados = claves.filter((k) => datos[k] !== undefined && datos[k] !== null);
      if (ocupados.length) {
        yaLoTenian.push({
          apoyo: nombre(datos),
          campos: ocupados.map((k) => CAMPOS_DE_FICHA.find((c) => c.clave === k)?.etiqueta ?? k),
        });
        continue;
      }

      pendientes.push({ ref, apoyo: nombre(datos), revision: revisionEnLaBase });
    }

    if (desfasados.length) {
      throw new Error(
        `${conflicto(desfasados.length === 1 ? `el apoyo ${desfasados[0]}` : 'varios apoyos marcados')} `
        + `Apoyo${desfasados.length === 1 ? '' : 's'} con cambios de otra persona: ${desfasados.join(', ')}. `
        + 'Desmárquelo y vuelva a intentarlo; el resto del lote sigue intacto.',
      );
    }

    const campos = CAMPOS_DE_FICHA
      .filter((c) => validada[c.clave] !== undefined)
      .map((c) => {
        const sello = ((validada.procedencias ?? {}) as Record<string, { procedencia?: string; fuente?: string } | undefined>)[c.clave];
        return {
          etiqueta: c.etiqueta,
          origen: etiquetaDeOrigen(sello?.procedencia),
          fuente: (c.clave === 'capacidadLongitudinal'
            ? (validada.capacidadLongitudinal as { fuente?: string } | undefined)?.fuente
            : sello?.fuente) ?? null,
        };
      });

    // Un lote vacío NO se manda: pedirle a la base que no haga nada solo sirve
    // para que un fallo de red se lea como un fallo de carga.
    if (pendientes.length) {
      const lote = writeBatch(db);
      const parche = parcheDeFicha(validada);
      for (const p of pendientes) {
        lote.update(p.ref, sinIndefinidos({
          ...parche,
          actualizadoEn: ahora,
          actualizadoPor: u.uid,
          revision: p.revision + 1,
        }));
      }
      await lote.commit();
    }

    return {
      escritos: pendientes.map((p) => ({ apoyo: p.apoyo, revision: p.revision + 1 })),
      yaLoTenian,
      campos,
    };
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
   * DEJA CONSTANCIA DE QUE ESTA PERSONA ENTRÓ.
   *
   * La fecha la pone el SERVIDOR, como el recibo de contraseña: la regla exige
   * `request.time`, así que un navegador no puede fechar un acceso hacia atrás
   * ni hacia adelante. Se escribe con `merge` para tocar UNA sola clave —el
   * recibo de contraseña vive en el mismo documento y no puede quedar borrado
   * por un inicio de sesión—.
   *
   * ⚠️ NO LANZA. Entrar no puede depender de que se escriba una fecha: eso es
   * exactamente «una capa opcional con veto sobre una esencial» (`35 · L-11`).
   * Pero tampoco se traga en silencio: el fallo se CUENTA y la pantalla de
   * personas lo enseña, para que quien administra sepa que la bitácora tiene
   * huecos en vez de suponer que está completa.
   */
  async dejarUltimoAcceso(): Promise<void> {
    try {
      const { esperarSesion, baseDatos } = await cargarFirebase();
      const { doc, setDoc, serverTimestamp } = await firestore();
      const u = await esperarSesion();
      if (!u) return;
      await setDoc(
        doc(await baseDatos(), 'usuarios', u.uid),
        { ultimoAcceso: serverTimestamp() },
        { merge: true },
      );
    } catch (e) {
      anotarFalloDeBitacora('el último acceso', e);
    }
  },

  /**
   * LA BITÁCORA DE ACCESOS Y CAMBIOS DE PERMISO.
   *
   * Lectura directa: las reglas la abren a quien tiene `usuarios.auditoria`, y
   * la ESCRITURA es solo del servidor (`allow write: if false`). Un registro que
   * el auditado puede firmar con el nombre de otro no es un registro.
   *
   * ⚠️ SE FILTRA EN LA CONSULTA POR `orgId`, obligatorio aunque parezca
   * redundante: en Firestore las reglas NO son filtros — si la consulta no
   * declara lo que la regla exige, la base niega la consulta ENTERA aunque cada
   * documento fuera legible. Es la trampa que ya costó una tarde en `apoyos`.
   *
   * Los demás filtros (acción, persona) se aplican en el cliente a propósito:
   * combinarlos en la consulta pediría índices compuestos, y un índice que falta
   * no da un error claro — deja la consulta colgada. A esta escala no compensa.
   *
   * Lo que no valide el molde del catálogo **no entra**: una bitácora con
   * entradas de forma libre es un cajón donde nadie encuentra nada.
   */
  async listarAuditoria(filtro: FiltroDeAuditoria = {}): Promise<PaginaDeAuditoria> {
    const { esperarSesion, credenciales, baseDatos } = await cargarFirebase();
    const { collection, getDocs, limit, orderBy, query, startAfter, where } = await firestore();
    const u = await esperarSesion();
    if (!u) return { filas: [], cursor: null };
    const { orgId } = await credenciales(u);
    if (!orgId) return { filas: [], cursor: null };

    const cuantas = Math.min(Math.max(filtro.tope ?? PAGINA_DE_AUDITORIA, 1), 200);
    const s = await getDocs(query(
      collection(await baseDatos(), 'auditoria_accesos'),
      where('orgId', '==', orgId),
      orderBy('en', 'desc'),
      // El testigo va DELANTE del tope: es la posición desde la que se cuenta.
      ...(filtro.desde ? [startAfter(filtro.desde as Parameters<typeof startAfter>[0])] : []),
      limit(cuantas),
    ));

    // ⚠️ EL TESTIGO SALE DE LO LEÍDO, NO DE LO FILTRADO. Los filtros de acción y
    // de persona se aplican abajo, en el cliente; si el testigo saliera de la
    // lista ya filtrada, la página siguiente se saltaría todas las anotaciones
    // que el filtro descartó y la bitácora tendría huecos invisibles.
    //
    // Una página CORTA es la única prueba honesta de que no queda nada más:
    // pedir 50 y recibir 50 puede ser el final justo, y por eso el botón sigue
    // ofreciéndose una vez más — pulsarlo y no traer nada es barato; esconderlo
    // con la bitácora a medias, no.
    const cursor = s.docs.length === cuantas ? (s.docs[s.docs.length - 1] as unknown) : null;

    const filas = s.docs
      .map((d) => {
        const v = validar<EntradaDeAuditoria>(EntradaDeAuditoria, d.data());
        return v ? { ...v, id: d.id } : null;
      })
      .filter((x): x is EntradaLeidaDeAuditoria => x !== null)
      .filter((x) => !filtro.accion || x.accion === filtro.accion)
      .filter((x) => !filtro.sujetoUid || x.sujetoUid === filtro.sujetoUid);

    return { filas, cursor };
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
    // ⚠️ CON `merge`, Y NO ES UN DETALLE. Sin él, `setDoc` SUSTITUYE el
    // documento entero: se llevaría por delante el `ultimoAcceso` que se escribe
    // al entrar, y —peor— la regla nueva lo DENEGARÍA. `selloDelServidor` exige
    // que cada campo tocado valga `request.time`, y al borrar `ultimoAcceso` ese
    // campo queda ausente en lo que se manda: la comparación da falso y la
    // escritura se rechaza. O sea que el recibo dejaría de poder escribirse en
    // cuanto la persona hubiera entrado una vez, y la pantalla de cambio de
    // contraseña volvería a recibirla la próxima vez. Con `merge` se toca UNA
    // clave y solo una.
    await setDoc(
      doc(await baseDatos(), 'usuarios', u.uid),
      { contrasenaCambiadaEn: serverTimestamp() },
      { merge: true },
    );
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
} satisfies Repositorio;
