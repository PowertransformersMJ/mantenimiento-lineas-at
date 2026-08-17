// ============================================================================
// importar/punto.js — UN punto nuevo, nunca el levantamiento entero
// ----------------------------------------------------------------------------
// QUÉ HACE: recibe los apoyos TAL COMO ESTÁN en la base y devuelve UN documento
// para añadir. Nada más. No reconstruye los 26 de julio, no los reescribe y no
// los devuelve: si algo falla aquí, lo que ya está escrito ni se entera.
//
// POR QUÉ NO SE REUSA `herramientas/construir-apoyos.mjs`. Aquel archivo
// construye el levantamiento COMPLETO desde el fixture de la bóveda —26 puntos
// que ya están en producción— y para eso necesita la lista canónica, el fixture
// y la fórmula del hash. Traerlo al navegador significaría reconstruir 26
// documentos existentes para añadir dos: cualquier diferencia de una coma en un
// fixture se convertiría en 26 reescrituras silenciosas. Aquí solo se AÑADE.
// El sembrador se queda donde está y sigue siendo el camino para sembrar una
// línea desde cero.
//
// LAS CUATRO DECISIONES QUE ESTE ARCHIVO HACE EXPLÍCITAS
//
// 1. NADA POR DEFECTO EN LO QUE SE FIRMA. `funcionEstructural` no se adivina y
//    no tiene defecto: decide dónde se corta el tramo de tensión y con eso el
//    cálculo mecánico. `creadoPor` y el registro tampoco: sin autor real el
//    documento lo rechaza la propia base (las reglas exigen que el autor sea
//    quien está en sesión), y sin registro no hay identidad que buscar.
//
// 2. LA FUNCIÓN SE VALIDA CONTRA EL MOLDE DE LOS DATOS, no contra una lista
//    copiada. Una lista copiada empieza igual y termina distinta: hoy el
//    sembrador admite cinco funciones y el molde admite seis. Aquí se leen las
//    del molde, así que el día que gane una séptima, esta pantalla la admite
//    sola y sin que nadie se acuerde de este archivo.
//
// 3. ORDEN POR BISECCIÓN, Y HACIA ATRÁS. Un punto que se intercala recibe el
//    orden que hay ENTRE sus vecinos —(2+3)/2 = 2,5— en vez de correr a todos
//    los que van detrás. Correrlos reescribiría 26 documentos de producción
//    para registrar un hecho que no cambió y movería 64 de las 99 fotos, que se
//    resuelven por este mismo campo. Y un SEGUNDO punto en el mismo hueco va
//    DETRÁS del primero (2,75), no delante: el orden en que se declaran es el
//    orden del recorrido.
//
// 4. LAS CLAVES SIN VALOR NO SE MANDAN. El GPS puede no haber grabado la cota o
//    la hora. El sembrador corría con `ignoreUndefinedProperties` y se las
//    tragaba en silencio; el SDK del navegador LANZA con un `undefined` dentro
//    y tumbaría el lote entero. Aquí la clave sencillamente no existe, que
//    además es lo que el molde espera de un campo opcional.
//
// PURO: sin DOM, sin red, sin módulos nativos. Corre igual en las pruebas y en
// el navegador.
// ============================================================================
import { FuncionEstructural, TipoPunto } from '@lineas/contratos';
import { idDelRegistro, ORG_POR_DEFECTO } from './identidad.js';

/**
 * Precisión declarada de un GPS de mano, en metros.
 *
 * La auditoría fue tajante: el error vertical de un aparato de mano es del
 * mismo orden que el gálibo que hay que demostrar. Se declara SIEMPRE para que
 * nadie firme sobre él creyendo que es una cota topográfica.
 */
export const PRECISION_GPS_MANO_M = 8;

/** El motivo con que sale un punto que el Ingeniero no ha aprobado. */
export const MOTIVO_SIN_APROBAR = 'no está aprobado';

/**
 * Copia un objeto dejando fuera las claves sin valor.
 *
 * Se descartan `undefined` **y** `null`: un campo opcional del molde admite el
 * número o su ausencia, nunca un nulo, y `null` es justo lo que devuelve un
 * lector cuando el archivo no traía el dato. Ver decisión 4 de la cabecera.
 */
const sinAusentes = (obj) => Object.fromEntries(
  Object.entries(obj).filter(([, v]) => v !== undefined && v !== null),
);

/**
 * De qué línea es este punto: se toma de los apoyos que YA están cargados, que
 * es la única fuente que no exige recalcular nada. Si discrepan, se para: dos
 * `lineaId` distintos en la misma pantalla significan que se están mezclando
 * dos líneas, y un punto colgado de la línea equivocada no da error, desaparece
 * de la que le toca.
 */
function lineaDeLosApoyos(apoyos) {
  // Sin NINGÚN punto cargado el motivo no es que falte un dato: es que esta
  // pantalla no siembra líneas. Se dice con esas palabras y no con «no se pudo
  // deducir la línea», que le haría buscar un fallo donde no lo hay.
  if (!apoyos?.length) {
    throw new Error(
      'Esta línea no tiene todavía ningún punto cargado, y esta pantalla solo AÑADE a una línea que ya existe. ' +
      'Sembrar una línea desde cero se hace desde el repositorio, no desde aquí.'
    );
  }
  const ids = [...new Set(apoyos.map((a) => a?.lineaId).filter(Boolean))];
  if (ids.length === 1) return ids[0];
  if (!ids.length) {
    throw new Error(
      'No se pudo deducir a qué línea pertenece el punto: ninguno de los apoyos cargados declara su línea. ' +
      'Sin línea el punto no aparecería en ninguna pantalla, así que no se construye.'
    );
  }
  throw new Error(
    `Los apoyos cargados pertenecen a ${ids.length} líneas distintas. No se elige una: un punto colgado de la línea equivocada no da error, simplemente desaparece de la suya.`
  );
}

/**
 * Dónde entra un punto nuevo en la secuencia, SIN mover a nadie.
 *
 * · intercalado  → (orden del anterior + orden del siguiente) / 2
 * · al final     → último + 1
 *
 * La posición no es cosmética: de ella deducen `exportar/levantamiento.js` y la
 * ficha en qué VANO cae un empalme, y en ese orden se dibuja la traza. Meter el
 * empalme al final daría un vano nulo y un salto hacia atrás en el dibujo.
 */
function ordenDe(apoyos, decision) {
  const etiqueta = decision.nombreCanonico ?? '(sin nombre)';

  // Esta pantalla AÑADE a una línea que ya existe; no siembra levantamientos.
  // Sin ningún punto cargado no hay «detrás de» ni «al final» que signifiquen
  // nada, y el máximo de una lista vacía es menos infinito: un orden envenenado
  // que el molde aceptaría como número y que nadie vería hasta que la línea se
  // dibujara al revés.
  if (!apoyos.length) {
    throw new Error(
      `«${etiqueta}» no se puede colocar: esta línea no tiene todavía ningún punto cargado. ` +
      'Sembrar una línea desde cero se hace desde el repositorio, no desde aquí.'
    );
  }

  if (decision.insertarAlFinal) {
    return Math.max(...apoyos.map((a) => a.orden)) + 1;
  }
  // Un punto que va ANTES del primero no tiene hoy por dónde entrar, y hay que
  // decirlo en vez de colocarlo en cualquier sitio. Bisecar por delante daría
  // orden negativo, que el molde no admite; y la alternativa —correr los 26 de
  // producción— es justo lo que esta bisección existe para evitar, porque
  // movería 64 de las 99 fotos. Es el caso del pórtico del extremo de origen:
  // cuando se apruebe, se construye el camino a propósito.
  if (decision.insertarAntesDe || decision.insertarAlPrincipio) {
    const primero = [...apoyos].sort((a, b) => a.orden - b.orden)[0];
    throw new Error(
      `Este punto va antes de «${decision.insertarAntesDe ?? primero?.nombreNormalizado ?? 'todo lo cargado'}». ` +
      `Colocarlo hoy obligaría a mover los ${apoyos.length} puntos ya cargados, y eso dejaría huérfanas las fotos que cuelgan de ellos. ` +
      'No se puede cargar todavía: hay que construir ese camino a propósito, no colocarlo «donde quepa».'
    );
  }
  if (!decision.insertarDespuesDe) {
    throw new Error(
      `«${etiqueta}» no dice dónde va. Sin posición no hay vano, y sin vano el punto no significa nada.`
    );
  }
  const anterior = apoyos.find((a) => a.nombreNormalizado === decision.insertarDespuesDe);
  if (!anterior) {
    throw new Error(`«${etiqueta}» dice ir después de «${decision.insertarDespuesDe}», que no está entre los puntos cargados.`);
  }

  // Si en este mismo hueco YA se intercaló otro punto, el nuevo va DETRÁS de
  // él, no delante. Bisecar siempre contra el vecino inmediato repartía hacia
  // atrás: dos empalmes declarados A y B en el vano E03→E04 salían
  // «E03 · B · A · E04», el recorrido al revés y sin un solo aviso.
  //
  // ⚠️ PERO ESE SALTO SOLO CORRE DESDE UN PUNTO ORIGINAL DE LA LÍNEA (orden
  // entero). Elegir «detrás de E03» significa «en el vano que empieza en E03», y
  // ahí el salto es lo correcto: el vano ya tiene inquilinos y el nuevo va al
  // final de la cola. Elegir «detrás de X», donde X es a su vez un intercalado,
  // significa otra cosa: justo detrás de X y de nadie más. Saltar también ahí lo
  // dejaba detrás de un punto que él no eligió — un número válido, del sitio
  // equivocado, sin un solo aviso y sin forma de corregirlo después.
  const enOrden = [...apoyos].sort((a, b) => a.orden - b.orden);
  let i = enOrden.indexOf(anterior) + 1;
  if (Number.isInteger(anterior.orden)) {
    while (i < enOrden.length && !Number.isInteger(enOrden[i].orden)) i++;
  }
  const previo = enOrden[i - 1];               // el elegido, o el último intercalado tras él
  const siguiente = enOrden[i];
  return siguiente ? (previo.orden + siguiente.orden) / 2 : previo.orden + 1;
}

/**
 * @typedef {Object} DecisionDeCarga  lo que el Ingeniero declaró de UN punto
 * @property {string} nombreCanonico    uno de los nombres ya anotados en el registro
 * @property {string} nombreCampo       como quedó grabado en el aparato
 * @property {string} estado            'aprobado' o cualquier otra cosa (entonces no se carga)
 * @property {string} [motivoPendiente] por qué lo dejó fuera, en sus palabras
 * @property {string} tipoPunto         'Estructura' | 'Empalme' | 'Punto de referencia'
 * @property {string} funcionEstructural  una de las del molde de los datos
 * @property {boolean} [funcionConfirmada] true solo si ÉL la firma; si no, queda supuesta
 * @property {number} lat
 * @property {number} lon
 * @property {number} [ele]             cota del terreno, si el aparato la grabó
 * @property {string} [utc]             instante de la toma, si el aparato lo grabó
 * @property {number} [deflexion]       deflexión declarada; el sistema la recalcula igual
 * @property {string} [insertarDespuesDe]  nombre canónico del punto que lo precede
 * @property {boolean} [insertarAlFinal]
 * @property {string} [insertarAntesDe]    declarado solo para que se pueda NEGAR con motivo
 */

/**
 * Construye el documento de UN punto nuevo.
 *
 * @param {object[]} apoyosYaCargados  los apoyos tal como están en la base
 * @param {DecisionDeCarga} decision
 * @param {object} opciones  `codigoLinea`, `creadoPor` y `registro` son OBLIGATORIOS
 * @returns {{documento: object|null, ignorado: object|null}}
 *   `documento` si se carga; `ignorado` (con su motivo) si el Ingeniero no lo aprobó.
 *   Todo lo demás —nombre sin anotar, sitio imposible, función inválida— LANZA:
 *   son cosas que no se pueden cargar «a medias».
 */
export function construirPuntoNuevo(apoyosYaCargados, decision, opciones = {}) {
  const apoyos = [...(apoyosYaCargados ?? [])];
  if (!decision || typeof decision !== 'object') {
    throw new Error('No se recibió ninguna decisión de carga. Sin lo que el Ingeniero declaró no hay nada que construir.');
  }

  // ── Lo que él no aprobó no se carga, y tampoco se pierde ─────────────────
  // Va PRIMERO a propósito: no estar aprobado es un hecho sobre el punto, no un
  // error del programa, y tiene que poder contarse en el acuse aunque falte
  // cualquier otra cosa. El motivo VIAJA hasta la pantalla: «no se cargó» sin
  // por qué se lee como «se perdió».
  if (decision.estado !== 'aprobado') {
    return {
      documento: null,
      ignorado: {
        nombreCanonico: decision.nombreCanonico ?? null,
        nombreCampo: decision.nombreCampo ?? null,
        estado: decision.estado ?? '(sin declarar)',
        motivo: decision.motivoPendiente ?? MOTIVO_SIN_APROBAR,
      },
    };
  }

  // ⚠️ ESTE DEFECTO DE `ahora` SELLA UN SOLO DOCUMENTO, y es para quien construye
  // un punto suelto. Una carga de varios lo recibe YA HECHO desde `plan.js`, que
  // lo pone una única vez para todos. No se le quite allí creyendo que este
  // defecto lo cubre: cubriría cada punto por separado, y entonces los puntos de
  // una misma carga compartirían instante solo si caben en el mismo milisegundo
  // —o sea, por suerte—. Un hecho fechado se convertiría en varios sin un solo
  // aviso. Ver `plan.js` y `30 · L-52`.
  const {
    codigoLinea,
    creadoPor,
    registro,
    org = ORG_POR_DEFECTO,
    ahora = new Date().toISOString(),
    metodo = 'gps_mano',
    precision_m = PRECISION_GPS_MANO_M,
  } = opciones;

  // ── Sin autor real no se construye nada ──────────────────────────────────
  // No es una formalidad: las reglas de la base exigen que el autor del
  // documento sea exactamente quien tiene la sesión abierta. Un documento
  // sellado con una etiqueta genérica lo rechaza el servidor, y el rechazo de
  // un lote es opaco — no dice cuál de los documentos lo causó.
  if (typeof creadoPor !== 'string' || !creadoPor.trim()) {
    throw new Error(
      'No se sabe quién está cargando este punto. El autor tiene que ser la sesión abierta, no una etiqueta escrita a mano: ' +
      'la base rechaza el lote entero si no coinciden, y no dice cuál falló.'
    );
  }
  if (typeof codigoLinea !== 'string' || !codigoLinea.trim()) {
    throw new Error('No se declaró de qué línea es este punto, y la identidad se busca en el libro de esa línea.');
  }

  // ── La identidad se BUSCA. Si el nombre no está anotado, se para aquí ────
  const id = idDelRegistro(codigoLinea, decision.nombreCanonico, registro);

  // Dos documentos peleándose por el mismo id serían un punto pisando a otro,
  // con sus fotos y su expediente. La base no lo impediría: sobrescribiría.
  if (apoyos.some((a) => a.id === id || a.nombreNormalizado === decision.nombreCanonico)) {
    throw new Error(
      `«${decision.nombreCanonico}» ya está cargado en esta línea. No se carga dos veces: el segundo documento pisaría al primero, con sus fotos y su expediente.`
    );
  }

  // ── Lo que decide el cálculo se valida contra el molde, no contra una copia ─
  if (!FuncionEstructural.options.includes(decision.funcionEstructural)) {
    throw new Error(
      `«${decision.nombreCanonico}» no declara un papel estructural válido (trae «${decision.funcionEstructural ?? '—'}»). ` +
      `Solo se admite uno de: ${FuncionEstructural.options.join(' · ')}. ` +
      'No se asume ninguno: de esto sale dónde se corta el tramo de tensión, y con eso el cálculo mecánico.'
    );
  }
  if (!TipoPunto.options.includes(decision.tipoPunto)) {
    throw new Error(
      `«${decision.nombreCanonico}» no declara qué es (trae «${decision.tipoPunto ?? '—'}»). ` +
      `Solo se admite uno de: ${TipoPunto.options.join(' · ')}. ` +
      'De esto sale si entra o no al cálculo de vanos: un empalme contado como apoyo parte un vano real en dos falsos.'
    );
  }

  // ── Sin coordenada no hay punto ──────────────────────────────────────────
  if (!Number.isFinite(decision.lat) || !Number.isFinite(decision.lon)) {
    throw new Error(
      `«${decision.nombreCanonico}» no trae coordenada utilizable (lat «${decision.lat ?? '—'}», lon «${decision.lon ?? '—'}»). No se carga un punto sin sitio.`
    );
  }

  const lineaId = opciones.lineaId ?? lineaDeLosApoyos(apoyos);
  const orden = ordenDe(apoyos, decision);

  const documento = {
    id,
    orgId: org,
    creadoEn: ahora,
    creadoPor,
    revision: 0,
    tipo: 'apoyo',
    lineaId,
    orden,
    tipoPunto: decision.tipoPunto,
    // El nombre de campo se conserva TAL CUAL quedó en el aparato: es la
    // trazabilidad con el levantamiento, con sus errores incluidos.
    nombreCampo: String(decision.nombreCampo ?? decision.nombreCanonico),
    nombreNormalizado: decision.nombreCanonico,
    coordenada: sinAusentes({
      lat: decision.lat,
      lon: decision.lon,
      sistemaReferencia: 'WGS84',
      cotaTerreno_m: decision.ele,
      metodo,
      precision_m,
      tomadaEn: decision.utc,
    }),
    funcionEstructural: decision.funcionEstructural,
    // ⚠️ POR DEFECTO, «supuesto» — nunca «confirmado_humano».
    //
    // Que el papel estructural venga escrito NO significa que el Ingeniero lo
    // haya firmado. Con el defecto contrario, la ficha diría «Terminal —
    // confirmada por el Ingeniero» sobre una tipificación que él no confirmó, y
    // la memoria de cantidades contaría esa ancla como verificada en campo.
    // Poner la firma de alguien sobre lo que no firmó es peor que no tener el
    // dato, y aquí no hay deshacer: un apoyo no se puede borrar.
    funcionProcedencia: decision.funcionConfirmada === true ? 'confirmado_humano' : 'supuesto',
    // El sistema la recalcula sobre las estructuras cada vez que dibuja; se
    // guarda declarada como nula para que nadie la confunda con una medida.
    deflexion_grados: Number.isFinite(decision.deflexion) ? decision.deflexion : null,
    condicion: 'Sin evaluar',
    activo: true,
  };

  return { documento, ignorado: null };
}
