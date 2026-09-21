// ============================================================================
// cargabilidad.ts — el molde del histórico de cargabilidad ELÉCTRICA
// ----------------------------------------------------------------------------
// QUÉ GUARDA. Cuánta corriente circuló por una línea, hora a hora, y de dónde
// salió ese dato. **Es cargabilidad ELÉCTRICA** — no la utilización mecánica del
// apoyo, que vive en `activos.ts` y es otro veredicto (`99 §ADR-088`, `30 · M-02`).
//
// ⚠️ LA DECISIÓN QUE MANDA SOBRE ESTE ARCHIVO: **UN DOCUMENTO POR LÍNEA Y DÍA**,
// con las 24 horas dentro. No un documento por lectura.
//
// Y no es una preferencia de modelado, es aritmética de factura. Un año de datos
// horarios son **8.760 lecturas por línea**. Guardadas una a una, el botón de
// «histórico completo» de diez líneas pediría **87.600 documentos de un solo
// clic** — más de lo que el plan gratuito da en un día entero, y el módulo
// dejaría de funcionar justo cuando empezara a servir. Empaquetadas por día, el
// mismo año son **3.650**; y el tablero, que lee el resumen diario, unas diez.
// Es `CLAUDE.md §3.1`: «antes el que APAGA que el que COBRA» aplicado al diseño,
// no al proveedor.
//
// LOS TRES DOCUMENTOS Y POR QUÉ SON TRES:
//
//   · `DiaDeCargabilidad` — el dato crudo, hora a hora. Se lee cuando alguien
//     abre un día o pide una gráfica fina.
//   · `ResumenDiarioCargabilidad` — máximo, mínimo, media y horas en cada banda
//     de ESE día. Es lo que lee el tablero y el selector de fechas, y por eso va
//     APARTE: pedir un año de días completos para pintar una línea de tendencia
//     sería traerse 8.760 lecturas para enseñar 365 puntos.
//   · `CargaDeCargabilidad` — de qué archivo salió todo: nombre, cuándo, quién,
//     cuántas filas entraron y cuántas no. Sin esto, dentro de seis meses nadie
//     sabe de dónde vino un número — y este producto entero se sostiene sobre
//     poder responder esa pregunta.
// ============================================================================
import { z } from 'zod';
import { Base, Id, Instante, OrgId, Uid } from './comunes.ts';

/**
 * DE DÓNDE SALE EL PORCENTAJE. Es obligatorio y no tiene valor por defecto.
 *
 * ⚠️ Es la misma regla que `99 §ADR-086/087` puso en las capas del mapa: una
 * magnitud sin su naturaleza declarada es una magnitud que miente. Aquí la
 * mentira concreta sería confundir el % que trajo el archivo —calculado contra
 * la capacidad NOMINAL, que es fija— con el que sale de la ampacidad IEEE 738
 * del día, que se mueve con el clima. Medido en LN-627: los mismos 512 A son el
 * 71 % de la nominal y el 100 % de la de un día en calma.
 *
 *   · `declarada` — el porcentaje venía hecho en el archivo.
 *   · `derivada`  — lo calculamos de la corriente y la capacidad NOMINAL del
 *                   propio archivo, porque el archivo no lo traía.
 *
 * NO existe un tercer valor para «contra la ampacidad del día»: ese número no se
 * GUARDA, se calcula al mirarlo, porque depende de con qué condiciones de
 * ambiente se pida. Guardarlo lo convertiría en un segundo dueño (`§ADR-052`).
 */
export const NaturalezaCargabilidad = z.enum(['declarada', 'derivada']);

/** `AAAA-MM-DD`. Se valida la FORMA aquí; que el día exista lo mira el motor. */
export const DiaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'la fecha va como AAAA-MM-DD');

/** La hora, como clave del mapa: `00`…`23`. Texto, porque es una clave. */
export const ClaveHora = z.string().regex(/^([01]\d|2[0-3])$/, 'la hora va de «00» a «23»');

/**
 * LO QUE SE MIDIÓ EN UNA HORA.
 *
 * ⚠️ TODO OPCIONAL MENOS NADA, y a propósito: un archivo puede traer solo el
 * porcentaje, o solo la corriente, o las dos. Lo que NO puede pasar es que un
 * hueco se guarde como cero — por eso los campos se OMITEN cuando no hay dato,
 * y nunca se escriben a `0`. En una línea de transmisión el 0 % no es «no se
 * sabe»: es que la línea está fuera de servicio, que es un hecho grave.
 */
export const HoraDeCargabilidad = z.object({
  cargabilidad_pct: z.number().min(0).max(400).optional(),
  corriente_A: z.number().min(0).optional(),
  potenciaActiva_MW: z.number().optional(),
  potenciaReactiva_MVAr: z.number().optional(),
  potenciaAparente_MVA: z.number().min(0).optional(),
  tension_kV: z.number().min(0).optional(),
  capacidadNominal_A: z.number().positive().optional(),
  estado: z.string().max(120).optional(),
  observaciones: z.string().max(500).optional(),

  // ── LAS FASES (`99 §ADR-106`) ────────────────────────────────────────────
  // ⚠️ ESTE MOLDE BORRA EN SILENCIO LO QUE NO CONOCE: es un `z.object` sin
  // `passthrough`, así que un campo que el núcleo produzca y aquí no esté se
  // guardaría VACÍO, sin error y sin aviso. Por eso la lista de abajo tiene que
  // ser exactamente el catálogo de `nucleo/cargabilidad.js`, y hay una prueba
  // de paridad que se pone roja si se separan.
  //
  // La tensión lleva su BASE en el nombre —`RS` entre fases, `R` a tierra—
  // porque son dos magnitudes distintas separadas por un factor de 1,73.
  tensionRS_kV: z.number().min(0).optional(),
  tensionST_kV: z.number().min(0).optional(),
  tensionTR_kV: z.number().min(0).optional(),
  tensionR_kV: z.number().min(0).optional(),
  tensionS_kV: z.number().min(0).optional(),
  tensionT_kV: z.number().min(0).optional(),
  corrienteR_A: z.number().min(0).optional(),
  corrienteS_A: z.number().min(0).optional(),
  corrienteT_A: z.number().min(0).optional(),
  potenciaActivaR_MW: z.number().optional(),
  potenciaActivaS_MW: z.number().optional(),
  potenciaActivaT_MW: z.number().optional(),
  potenciaReactivaR_MVAr: z.number().optional(),
  potenciaReactivaS_MVAr: z.number().optional(),
  potenciaReactivaT_MVAr: z.number().optional(),
  potenciaAparenteR_MVA: z.number().min(0).optional(),
  potenciaAparenteS_MVA: z.number().min(0).optional(),
  potenciaAparenteT_MVA: z.number().min(0).optional(),

  /** Obligatoria si hay porcentaje. Lo comprueba el `refine` de abajo. */
  naturaleza: NaturalezaCargabilidad.optional(),
  /**
   * DE DÓNDE SALIÓ LA APARENTE, y es obligatoria si la hay.
   *
   * El sistema sabe derivarla de la activa y la reactiva, así que puede venir
   * MEDIDA del archivo o CALCULADA aquí — y son cosas distintas que se parecen
   * en la pantalla. Es la misma regla que ya rige el porcentaje: una magnitud
   * sin su naturaleza declarada es una magnitud que miente.
   */
  naturalezaAparente: z.enum(['medida', 'derivada']).optional(),
  /**
   * CON QUÉ CRITERIO se resumieron las fases en el valor agregado.
   *
   * Hasta hoy no se guardaba, y un mismo amperaje podía ser «la fase más
   * cargada» o «el promedio de las tres» sin que el documento lo dijera. Con
   * las fases guardadas al lado, el agregado deja de ser un dato suelto y pasa
   * a ser un resultado: tiene que declarar cómo se hizo.
   */
  criterioFase: z.enum(['maxima', 'promedio']).optional(),
}).refine((h) => h.cargabilidad_pct == null || h.naturaleza != null, {
  message: 'una cargabilidad sin declarar su naturaleza no se guarda: no se sabría contra qué se calculó',
  path: ['naturaleza'],
}).refine((h) => h.potenciaAparente_MVA == null || h.naturalezaAparente != null, {
  message: 'una potencia aparente sin declarar si se midió o se derivó no se guarda',
  path: ['naturalezaAparente'],
});

/**
 * UN DÍA DE UNA LÍNEA. El documento que de verdad se guarda.
 *
 * ⚠️ SU IDENTIDAD ES DETERMINISTA — `{orgId}__{linea}__{circuito}__{fecha}` — y
 * NO un UUID. Es la excepción razonada a `ADR-001`, y la razón es exactamente lo
 * que el Ingeniero pidió: **volver a cargar el mismo archivo no puede duplicar
 * el histórico**. Con un id al azar, la segunda carga crearía un documento
 * gemelo y ese día tendría dos verdades; con el id derivado del instante, la
 * segunda carga ESCRIBE ENCIMA del mismo sitio, que es lo correcto — una
 * corrección es el mismo día, no un día nuevo.
 *
 * La regla de `ADR-001` sigue intacta donde importa: la identidad de un APOYO
 * —un activo físico, que se renumera y se secciona— sigue siendo un UUID
 * inmutable. Una medición no es un activo.
 */
/**
 * EL SELLO DE TRAZABILIDAD — con qué se produjo lo que se guarda.
 *
 * ⚠️ `CLAUDE.md §3.1` lo exige para TODO resultado guardado: «con qué versión del
 * motor y con qué hipótesis se produjo». Cargabilidad era la única colección que
 * escribía sin él, y el daño era permanente: un día guardado sin sello no se
 * puede comparar con uno posterior porque no se sabe si el cálculo cambió entre
 * medias (`99 §ADR-091`).
 *
 * OPCIONAL, y a propósito: los días escritos ANTES de esta versión no lo tienen,
 * y rellenarlos ahora sería inventar un sello que nadie puso. Se leen, se marcan
 * «sin sello» y se dejan en paz. La regla del proyecto es que los cambios son
 * ADITIVOS, no retroactivos.
 */
export const SelloDeCalculo = z.object({
  /** Versión de `@lineas/nucleo` que produjo estas cifras. */
  versionMotor: z.string().max(30),
  /** Versión del molde con la que se escribió el documento. */
  versionContrato: z.string().max(30).optional(),
});

/**
 * CUÁNTAS HORAS DEL DÍA ERAN MEDIDAS Y CUÁNTAS LAS CALCULAMOS NOSOTROS.
 *
 * Sin esto, un promedio de 24 horas medidas y uno de 6 medidas + 18 derivadas se
 * guardan idénticos. El motor lleva la naturaleza hora a hora; el resumen la
 * disolvía. Aquí sobrevive.
 */
export const RepartoPorNaturaleza = z.object({
  declarada: z.number().int().min(0).max(24),
  derivada: z.number().int().min(0).max(24),
  sinDeclarar: z.number().int().min(0).max(24),
});

/**
 * ⚠️ EL `id` DE ESTAS DOS COLECCIONES NO ES UN UUID, y el molde tiene que
 * decirlo (`99 §ADR-109`). Arriba está escrito por qué —volver a cargar el
 * mismo día debe ESCRIBIR ENCIMA, no crear un gemelo—, pero el molde seguía
 * heredando `id: Id` de `Base`, que exige UUID. Resultado: `DiaDeCargabilidad
 * .parse()` rechazaba TODO día real con «Invalid uuid», y como nadie había
 * llegado a guardar nunca, nadie lo vio. Un molde que contradice a su propio
 * comentario es un molde que no se ha ejecutado.
 *
 * La forma es la que produce `idDelDia` / `idDelResumen`: trozos unidos por
 * `__`, ya normalizados por `clave()` — minúsculas, sin tildes, sin espacios.
 */
const IdDeterminista = z.string().min(3).max(400).regex(
  /^[^_\s][^\s]*(__[^\s]*)+$/,
  'el id de un día o un resumen se deriva de {orgId}__{linea}[__{circuito}]__{fecha}',
);

/**
 * QUÉ ESTADÍSTICO DE LA HORA ES ESTA LECTURA (`99 §ADR-112`).
 *
 * ⚠️ NO SON LA MISMA MEDIDA, y hasta hoy el módulo no sabía distinguirlas. El
 * sistema de supervisión del Ingeniero exporta la MISMA magnitud cuatro veces —un
 * archivo por estadístico— y los valores difieren de verdad: el 2026-01-01, la
 * corriente de la fase R llegó a **244 A de máximo** y **233 A de promedio**.
 * Meterlas en el mismo hueco no daría error: daría un número que nadie midió.
 *
 * Cuál sirve para qué, y no es preferencia:
 *   · `maximo`      — el peor instante de la hora. **Es el que dictamina**: un
 *                     límite térmico se comprueba contra el pico, no contra la
 *                     media. Con el promedio, una línea que se pasa media hora
 *                     por encima de su ampacidad parecería sana.
 *   · `promedio`    — lo que habilita energía, pérdidas y factor de carga.
 *   · `instantaneo` — la muestra puntual del momento de la exportación.
 *
 * ⚠️ **AUSENTE = `maximo`, y solo por historia.** Los días guardados antes de
 * esta decisión son máximos —se cargaron de los archivos `_max`— y las reglas
 * PROHÍBEN borrar (`firestore.rules`), así que renombrarles la identidad
 * dejaría huérfanos imposibles de retirar. Por eso el máximo conserva el `id`
 * que ya tenía y son los otros dos los que lo llevan escrito. Todo documento
 * NUEVO lo declara, venga el que venga.
 */
export const ESTADISTICOS = ['maximo', 'promedio', 'instantaneo', 'minimo'] as const;
export const Estadistico = z.enum(ESTADISTICOS);
export type Estadistico = z.infer<typeof Estadistico>;

/** El que dictamina, y el que se supone en un documento que no lo declara. */
export const ESTADISTICO_POR_DEFECTO: Estadistico = 'maximo';

/** Cómo se llama cada uno en pantalla. Aquí, para que no haya dos verdades. */
export const ROTULO_ESTADISTICO: Record<Estadistico, string> = {
  maximo: 'máximo', promedio: 'promedio', instantaneo: 'instantáneo', minimo: 'mínimo',
};

export const DiaDeCargabilidad = Base.extend({
  id: IdDeterminista,
  /** La línea, TAL Y COMO LA NOMBRA EL ARCHIVO. Ver la nota de abajo. */
  linea: z.string().min(1).max(120),
  /**
   * El `id` de la línea en `lineas/`, cuando se ha podido reconocer.
   *
   * ⚠️ OPCIONAL A PROPÓSITO, y esto es una decisión de producto: el archivo de
   * cargabilidad viene de SCADA y nombra las líneas a su manera, que no tiene
   * por qué coincidir con el inventario. Exigir la correspondencia dejaría fuera
   * el 100 % de los datos el primer día. Se guarda lo que el archivo dice, y
   * emparejarlo es un paso posterior y reversible — nunca un requisito de
   * entrada. `null` significa «todavía no se ha emparejado», no «no existe».
   */
  lineaId: Id.nullish(),
  /**
   * ⚠️ `null`, NO `undefined` — y es una decisión, no una tolerancia
   * (`99 §ADR-109`). `empaquetarPorDia` escribe `null` en estos tres cuando el
   * archivo no los trae, y significa **«el archivo no lo dijo»**, que es un
   * hecho que merece guardarse. Con `.optional()` a secas el molde los
   * rechazaba y no se guardaba NADA; y quitarlos del documento sería peor:
   * Firestore no acepta `undefined`, así que la alternativa real era mentir.
   */
  circuito: z.string().max(60).nullish(),
  subestacionOrigen: z.string().max(120).nullish(),
  subestacionDestino: z.string().max(120).nullish(),
  fecha: DiaIso,
  /** Qué estadístico de la hora trae este día. Ausente = `maximo` (ver arriba). */
  estadistico: Estadistico.optional(),
  /**
   * Las horas medidas, por su clave. **Solo las que tienen dato**: una hora sin
   * lectura NO aparece. Recorrer de 0 a 23 rellenando huecos es cosa de quien
   * pinta, y así el documento nunca afirma una medida que nadie tomó.
   */
  horas: z.record(ClaveHora, HoraDeCargabilidad),
  /** De qué carga vino la última escritura de este día. Para poder rastrearlo. */
  cargaId: Id,
  /** Con qué motor se produjo. Ausente = escrito antes del sello (`§ADR-091`). */
  versionMotor: z.string().max(30).optional(),
});

/**
 * EL RESUMEN DE UN DÍA — lo que lee el tablero y el selector de fechas.
 *
 * Es un dato DERIVADO y por eso se puede reconstruir entero desde los días; se
 * guarda igualmente porque leerlo es la diferencia entre 365 documentos y 8.760.
 * Al ser derivado, **nunca es la fuente**: si algún día discrepara del día que
 * resume, manda el día.
 */
export const ResumenDiarioCargabilidad = Base.extend({
  id: IdDeterminista,
  linea: z.string().min(1).max(120),
  lineaId: Id.nullish(),
  fecha: DiaIso,
  /** Qué estadístico resume. Ausente = `maximo`. */
  estadistico: Estadistico.optional(),
  /**
   * Cuántas horas del día traen **PORCENTAJE**. De 0 a 24; el resto son huecos.
   *
   * ⚠️ NO es «horas con dato», aunque el tablero lo rotulara así durante tres
   * decisiones (`99 §ADR-110`). Es la base con la que se ponderan los promedios
   * del periodo, y por eso su significado no se toca. Lo que el tablero necesita
   * está en `horasConDato`.
   */
  horasConMedida: z.number().int().min(0).max(24),
  /**
   * Horas con AL MENOS una magnitud medida — corriente, tensión o potencias.
   *
   * ⚠️ **Ausente ≠ 0**: un resumen guardado antes de `§ADR-110` no lo dice, y el
   * motor se cae a `horasConMedida` en vez de suponer que aquel día vino vacío.
   */
  horasConDato: z.number().int().min(0).max(24).optional(),
  /** De qué está hecho ese dato: horas por cada magnitud agregada. */
  horasPorMagnitud: z.record(z.string(), z.number().int().min(0).max(24)).optional(),
  maxima_pct: z.number().optional(),
  minima_pct: z.number().optional(),
  promedio_pct: z.number().optional(),
  /** La hora del máximo, para poder señalarla sin abrir el día entero. */
  horaMaxima: ClaveHora.optional(),
  /**
   * LOS AMPERIOS DEL DÍA. Sin ellos el histórico DIBUJA pero no DICTAMINA: el
   * porcentaje del archivo se calculó contra la capacidad nominal, y el veredicto
   * exige la corriente cruda para dividirla por la ampacidad (`99 §ADR-093`).
   *
   * `horasConCorriente` ausente (≠ 0) significa **resumen escrito antes de que
   * el resumen llevara amperios**. Cero significa «ese día no trajo corriente».
   * Confundirlos haría parecer vacío un día que sí se midió.
   */
  horasConCorriente: z.number().int().min(0).max(24).optional(),
  corrienteMaxima_A: z.number().min(0).optional(),
  horaCorrienteMaxima: ClaveHora.optional(),
  /** Cuántas horas cayeron en cada banda de lectura. Suma ≤ `horasConMedida`. */
  porBanda: z.object({
    normal: z.number().int().min(0).max(24),
    elevada: z.number().int().min(0).max(24),
    atencion: z.number().int().min(0).max(24),
    sobrecarga: z.number().int().min(0).max(24),
  }),
  /** De qué naturaleza eran esas horas. Ausente = resumen anterior al sello. */
  porNaturaleza: RepartoPorNaturaleza.optional(),
  /** Con qué motor se produjo. Ausente = escrito antes del sello (`§ADR-091`). */
  versionMotor: z.string().max(30).optional(),
});

/** En qué acabó el procesamiento de un archivo. Sin texto libre. */
export const EstadoCarga = z.enum([
  'previsualizada',   // se leyó y se enseñó, pero NADIE dijo que se guardara
  'guardada',         // sus registros están en el histórico
  'descartada',       // se leyó y se tiró; queda el rastro de que se intentó
]);

/**
 * POR QUÉ UN DÍA NO ENTRÓ AL HISTÓRICO. Catálogo CERRADO, sin texto libre — la
 * misma regla que `MotivoRechazo` en `comunes.ts`: si no está aquí, no existe.
 *
 * Es cerrado porque este dato se va a CONTAR —«¿cuántos días de agosto se
 * apartaron por sello?»— y una frase escrita a mano no se cuenta, se lee. El
 * matiz —qué sello, en qué horas, cuántas señales— va en los campos de al lado.
 *
 *   · `sello_no_actual`   — alguna hora del día traía un sello distinto de
 *     «Actual», así que **el día se apartó ENTERO**. Es la decisión del
 *     Ingeniero del 2026-09-20, y su razón está escrita en
 *     `herramientas/cargar-cargabilidad.mjs`: no se recortan «las horas
 *     buenas», porque lo apartado se puede sumar después y **lo cargado NO se
 *     puede retirar** — `firestore.rules` niega el borrado de las tres
 *     colecciones a propósito.
 *   · `fuera_del_periodo` — el día no cae en el periodo que se pidió cargar.
 *     Suele ser una exportación traspapelada: en LN-617 vino uno de 2025.
 *   · `sin_lecturas`      — los archivos de ese día no produjeron ninguna
 *     lectura con número. El día existe en el origen y no existe en la base, y
 *     esa diferencia hay que poder explicarla.
 *
 * ⚠️ **UN DÍA SIN NINGÚN SELLO NO ES UN DÍA APARTADO Y NO VA EN ESTA LISTA.**
 * Los días sin archivo de calidad —del 1 al 12 de enero y el 31-05— ENTRAN:
 * ninguna de sus horas trae un sello distinto de «Actual» porque no traen sello
 * ninguno. Que se NOMBREN, para saber qué entró sin respaldo, es otra cosa y
 * vive en el informe de la herramienta. Meterlos aquí diría que falta un día que
 * sí está, que es exactamente la mentira contraria.
 *
 * ⚠️ Un motivo NUEVO es una versión del contrato, como lo fue
 * `documento_proyecto` en 0.6.0. Un catálogo que se amplía a escondidas deja de
 * poder contarse, y contarlo es para lo que existe.
 */
export const MOTIVOS_APARTADO = ['sello_no_actual', 'fuera_del_periodo', 'sin_lecturas'] as const;
export const MotivoApartado = z.enum(MOTIVOS_APARTADO);
export type MotivoApartado = z.infer<typeof MotivoApartado>;

/** Cómo se llama cada motivo en pantalla. Aquí, para que no haya dos verdades. */
export const ROTULO_MOTIVO_APARTADO: Record<MotivoApartado, string> = {
  sello_no_actual: 'alguna hora no se midió: sello distinto de «Actual»',
  fuera_del_periodo: 'el día queda fuera del periodo que se cargó',
  sin_lecturas: 'ese día no trajo ninguna lectura con número',
};

/**
 * CUÁNTOS DÍAS APARTADOS CABEN EN UNA CARGA. 366 = los días de un año bisiesto.
 *
 * No es una cifra de gusto. Una carga no puede apartar más días de los que tiene
 * el periodo que carga, y un periodo de más de un año no es una carga: son
 * varias. De referencia, el periodo que se está cargando —enero a agosto— son
 * 243 días de calendario, y de ellos se apartan 8 en LN-617 y 11 en LN-628.
 *
 * ⚠️ **El tope RECHAZA, no recorta**, por la misma razón que `archivos`: una
 * lista que se corta deja de responder la pregunta para la que existe —«¿por qué
 * falta el 26-01?»— y encima lo hace en silencio. Si una carga aparta más días
 * que esto, se parte por periodo, igual que `archivos` obliga a partir en lotes
 * de cien (`99 §ADR-113`).
 */
export const DIAS_APARTADOS_POR_CARGA = 366;

/**
 * UN DÍA QUE NO ENTRÓ, con su porqué.
 *
 * Es el reverso del resto de este archivo: todo lo demás guarda lo que se midió
 * y con qué se produjo; esto guarda **lo que NO se guardó y por qué no**. Sin
 * ello un hueco del histórico no se distingue de un fallo del sistema, y la
 * única forma de responder «¿por qué falta el 26-01?» sería volver a correr la
 * lectura de sellos sobre unos CSV que viven en el disco del Ingeniero.
 */
export const DiaApartado = z.object({
  /** Qué día es el que falta. Es literalmente la pregunta que se hará después. */
  fecha: DiaIso,
  /** De qué catálogo cerrado. Un motivo en blanco no es un motivo: no valida. */
  motivo: MotivoApartado,
  /**
   * EL SELLO QUE LO MARCÓ, tal y como venía en el archivo de calidad: «Not
   * Renewed», «Invalid»… Es una LISTA y no una sola cadena porque un mismo día
   * puede traer dos sellos distintos en horas distintas, y quedarse con uno
   * sería decidir por el Ingeniero cuál de los dos cuenta.
   *
   * ⚠️ OBLIGATORIO cuando el motivo es `sello_no_actual`, y lo hace cumplir el
   * `refine` de abajo: un día apartado «por el sello» que no dice CUÁL sello no
   * deja revisar la decisión, que es justo para lo que se escribe.
   */
  sellos: z.array(z.string().min(1).max(60)).max(12).optional(),
  /**
   * LAS HORAS que traían ese sello, con las mismas claves que el día: `00`…`23`.
   * No cambian la decisión —el día se aparta entero— pero son la diferencia
   * entre «ese día no se midió» y «ese día se cayó el enlace de 3 a 8».
   */
  horas: z.array(ClaveHora).max(24).optional(),
  /**
   * CUÁNTAS señales del día quedaron afectadas.
   *
   * Va aparte de `senales` a propósito: la CIFRA se puede escribir siempre —dos
   * señales de veinte no es lo mismo que veinte de veinte, y eso ya orienta la
   * revisión—, mientras que los NOMBRES son la ruta del SCADA del cliente y hay
   * salidas que se pegan en un correo o en un informe. Quien escribe elige si
   * los pone; el recuento no se pierde por ello.
   */
  senalesAfectadas: z.number().int().positive().max(500).optional(),
  /**
   * CUÁLES, cuando quien escribe puede nombrarlas. Nunca puede haber más
   * nombres que señales declaradas: lo comprueba el `refine` de abajo.
   */
  senales: z.array(z.string().min(1).max(200)).max(50).optional(),
  /**
   * LA FRASE ENTERA, la que se leyó en pantalla el día de la carga.
   *
   * Se guarda además de los campos de arriba para que la base diga LO MISMO que
   * dijo la consola, sin recomponerlo. ⚠️ Si está, no puede estar en blanco: un
   * detalle vacío es peor que ninguno, porque parece que alguien lo explicó.
   */
  detalle: z.string().min(1).max(300).optional(),
}).refine((d) => d.motivo !== 'sello_no_actual' || (d.sellos?.length ?? 0) > 0, {
  message: 'un día apartado por su sello tiene que decir CUÁL sello lo marcó: sin eso la decisión no se puede revisar',
  path: ['sellos'],
}).refine((d) => d.senales == null || d.senalesAfectadas == null || d.senales.length <= d.senalesAfectadas, {
  message: 'se nombran más señales de las que se declaran afectadas: una de las dos cifras miente',
  path: ['senales'],
});

/**
 * DE QUÉ ARCHIVO SALIÓ TODO.
 *
 * ⚠️ **No se guarda el archivo, solo su rastro.** El `.xlsx` original es material
 * de operación del cliente y este sistema no tiene dónde ponerlo que no sea el
 * R2 privado; hasta que eso se decida, se conserva lo que permite responder «¿de
 * dónde salió este número?»: nombre, cuándo, quién y qué entró. Y la huella, que
 * es lo que permite reconocer el MISMO archivo aunque venga renombrado.
 */
export const CargaDeCargabilidad = Base.extend({
  nombreArchivo: z.string().min(1).max(260),
  /** SHA-256 del contenido. Dos archivos con el mismo contenido son el mismo. */
  huella: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  hoja: z.string().max(120).optional(),
  cargadoEn: Instante,
  cargadoPor: Uid,
  filasDelArchivo: z.number().int().nonnegative(),
  registrosGuardados: z.number().int().nonnegative(),
  filasConError: z.number().int().nonnegative(),
  /** Qué columna del archivo se leyó como qué campo. Sin esto no se audita nada. */
  mapeo: z.record(z.string(), z.string()),
  /** Qué líneas y qué días tocó. Permite deshacer y saber qué pisó. */
  /**
   * LOS ARCHIVOS, uno a uno (`99 §ADR-113`).
   *
   * ⚠️ `nombreArchivo` era una CADENA con todos los nombres pegados, y con 15
   * archivos —los tres estadísticos de un día— se pasaba del tope de 260 y el
   * guardado moría entero. Pero el problema no era el tope: era la forma. Una
   * lista de nombres es una lista, y pegarlos con « + » convierte el rastro de
   * procedencia —«¿de qué archivo salió este número?»— en un texto que hay que
   * despiezar. Ahora `nombreArchivo` es el rótulo corto y esto es el rastro.
   */
  archivos: z.array(z.string().min(1).max(200)).max(100).optional(),
  lineas: z.array(z.string().max(120)).max(500),
  /**
   * Qué estadísticos traía la carga (`99 §ADR-112`).
   *
   * ⚠️ Esta colección es INMUTABLE —`update: if false` en las reglas—, así que
   * esto se escribe al crearla o no se escribe nunca. Las cargas anteriores no
   * lo traen y se leen como **no declarado**, jamás como «máximo»: rellenarlas
   * sería fabricar dato en el único registro que existe para auditar.
   */
  estadisticos: z.array(Estadistico).max(8).optional(),
  desde: DiaIso.optional(),
  hasta: DiaIso.optional(),
  /**
   * LOS DÍAS QUE NO ENTRARON, Y POR QUÉ.
   *
   * ⚠️ Hasta hoy este documento anotaba lo que SÍ entró —`archivos`, `lineas`,
   * `desde`/`hasta`, cuántas filas— y **no tenía dónde decir lo que se quedó
   * fuera**. Y lo que se queda fuera no es una anécdota: al preparar LN-617 y
   * LN-628 se apartan 8 y 11 días por sellos que no son «Actual», más un día de
   * 2025 que cae fuera del periodo. Sin esto, dentro de seis meses «¿por qué
   * falta el 26-01?» no se responde desde la base.
   *
   * ⚠️ **Ausente ≠ «no se apartó nada»**: significa que esa carga no lo dijo.
   * Las cargas ya escritas no lo traen y **no se pueden completar** —la
   * colección es INMUTABLE, `update: if false` en las reglas—, así que se leen
   * como no declarado. Rellenarlas sería fabricar una decisión que nadie tomó,
   * en el único registro que existe para auditar.
   */
  apartados: z.array(DiaApartado).max(
    DIAS_APARTADOS_POR_CARGA,
    `no caben más de ${DIAS_APARTADOS_POR_CARGA} días apartados en una carga (un año): `
    + 'la lista no se recorta —dejaría de explicar los huecos, y en silencio—, así que parta la carga por periodo',
  ).optional(),
  estado: EstadoCarga,
  /** Con qué motor y con qué molde se proceso este archivo. */
  versionMotor: z.string().max(30).optional(),
  versionContrato: z.string().max(30).optional(),
});

// ── Tipos ───────────────────────────────────────────────────────────────────
export type SelloDeCalculo = z.infer<typeof SelloDeCalculo>;
export type RepartoPorNaturaleza = z.infer<typeof RepartoPorNaturaleza>;
export type NaturalezaCargabilidad = z.infer<typeof NaturalezaCargabilidad>;
export type HoraDeCargabilidad = z.infer<typeof HoraDeCargabilidad>;
export type DiaDeCargabilidad = z.infer<typeof DiaDeCargabilidad>;
export type ResumenDiarioCargabilidad = z.infer<typeof ResumenDiarioCargabilidad>;
export type CargaDeCargabilidad = z.infer<typeof CargaDeCargabilidad>;
export type EstadoCarga = z.infer<typeof EstadoCarga>;
export type DiaApartado = z.infer<typeof DiaApartado>;

/**
 * EL `id` DE UN DÍA, derivado y estable.
 *
 * Se normaliza el nombre de la línea —sin tildes, sin espacios dobles, en
 * minúsculas— porque «LN-627», «ln-627 » y «LN‑627» son la misma línea escrita
 * por tres manos distintas, y con tres ids serían tres históricos. Lo que NO se
 * normaliza es lo que se GUARDA: el campo `linea` conserva el texto original,
 * que es el que el Ingeniero reconoce.
 */
export function idDelDia(
  orgId: string, linea: string, circuito: string | null | undefined, fecha: string,
  estadistico: Estadistico = ESTADISTICO_POR_DEFECTO,
): string {
  return [orgId, clave(linea), circuito ? clave(circuito) : '-', fecha, ...sufijo(estadistico)].join('__');
}

export function idDelResumen(
  orgId: string, linea: string, fecha: string,
  estadistico: Estadistico = ESTADISTICO_POR_DEFECTO,
): string {
  return [orgId, clave(linea), fecha, ...sufijo(estadistico)].join('__');
}

/**
 * ⚠️ EL MÁXIMO NO LLEVA SUFIJO, y es una decisión, no un olvido (`§ADR-112`).
 *
 * Cuando esto se escribió ya había días guardados —máximos, de los archivos
 * `_max`— con la identidad corta. `firestore.rules` prohíbe BORRAR un día a
 * propósito («un histórico del que se puede borrar una hora incómoda no es un
 * histórico»), así que darles un `id` nuevo no los movería: los duplicaría, y
 * el viejo quedaría ahí para siempre sin forma de retirarlo.
 *
 * Y encaja con lo que significan: el máximo es el que dictamina y el que se
 * supone cuando un documento no dice nada. Los otros TRES —promedio, instantáneo
 * y mínimo (`99 §ADR-117`)— son los que hay que declarar, y lo llevan escrito en
 * el nombre.
 */
function sufijo(estadistico: Estadistico): string[] {
  return estadistico === ESTADISTICO_POR_DEFECTO ? [] : [estadistico];
}

function clave(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010-\u2015]/g, '-')      // guiones «bonitos» que copia Excel
    .toLowerCase().replace(/\s+/g, ' ').trim()
    .replace(/[^a-z0-9 .-]/g, '_');
}

/** Las tres colecciones nuevas, para que las reglas y la app las llamen igual. */
export const COLECCIONES_CARGABILIDAD = Object.freeze({
  dias: 'cargabilidad_dias',
  resumenes: 'cargabilidad_resumenes',
  cargas: 'cargabilidad_cargas',
} as const);

/** Cabe aquí porque las reglas de la base lo miran: quién puede escribir esto. */
export const ESCRIBE_CARGABILIDAD = 'rol_editor';

// Se declaran para que `OrgId`/`Uid` no queden como importaciones sin uso: el
// molde los usa a través de `Base`, y dejarlos fuera rompería el `tsc` estricto.
export type OrgIdDeCargabilidad = z.infer<typeof OrgId>;
export type UidDeCargabilidad = z.infer<typeof Uid>;
