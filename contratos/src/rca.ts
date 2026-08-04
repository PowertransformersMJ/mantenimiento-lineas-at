// ============================================================================
// rca.ts — el ANÁLISIS DE CAUSA RAÍZ, y por qué es un documento aparte
// ----------------------------------------------------------------------------
// `Investigacion` (eventos.ts) es el EXPEDIENTE DE UN HECHO: qué pasó, en qué
// apoyo de qué línea, qué se ve, qué se concluye y qué falta por verificar. Eso
// funciona y no se toca.
//
// Un análisis de causa raíz es otra cosa: **es el razonamiento sobre uno o
// varios hechos**. Y por eso vive fuera, con dos consecuencias que no son de
// diseño sino de utilidad:
//
//   1. LA RECURRENCIA. La causa raíz más cara de un parque es la que se repite.
//      El mismo conector fallando en tres apoyos de dos líneas distintas es UNA
//      causa raíz y TRES eventos. Si el análisis viviera dentro de la vista de
//      una línea, ese patrón sería invisible POR CONSTRUCCIÓN: nadie lo vería
//      jamás, no porque el sistema falle sino porque nunca formuló la pregunta.
//
//   2. EL EVENTO SIN DUEÑO. Un aviso de las 2 de la mañana todavía no tiene
//      línea ni apoyo identificados. `Investigacion` exige los dos, y con razón:
//      un hecho SÍ ocurre en un sitio. Pero exigirlos para poder ABRIR el
//      análisis obliga a inventar el apoyo — el mismo error que el contrato ya
//      evita en `Evidencia`, donde exigir inspección a las 99 fotos «obligaba a
//      inventar quién iba en la cuadrilla».
//
// Por eso `Investigacion` queda INTACTA y esto es un documento hermano, con el
// alcance por listas y todas opcionales. Cambio ADITIVO: nada se renombra, nada
// migra.
//
// LA REGLA QUE GOBIERNA ESTE ARCHIVO. Las listas son CERRADAS. No hay texto
// libre donde deba haber una categoría, porque una categoría inventada al vuelo
// no se puede agregar entre análisis, y agregar entre análisis es justamente lo
// que hace valiosa la recurrencia.
// ============================================================================
import { z } from 'zod';
import { Base, Id, Instante, Uid } from './comunes';
// La escala de verosimilitud NO se redefine aquí: es la misma que ya usa
// `Investigacion`. Dos escalas con los mismos nombres divergen el día que
// alguien añade un valor a una sola, y entonces «alta» deja de significar lo
// mismo en dos pantallas del mismo informe. Un hecho, un dueño.
import { Verosimilitud } from './eventos';

// ── LAS ESPINAS DEL ISHIKAWA ────────────────────────────────────────────────

/**
 * Las 6M clásicas (máquina, método, material, medio ambiente, mano de obra,
 * medición) NO se usan, y no por gusto: nacieron en un astillero, para un
 * PROCESO que se repite. Una línea de 66 kV no es un proceso — es un activo
 * lineal, distribuido, expuesto y de cincuenta años de vida.
 *
 * Tres decisiones que conviene poder defender:
 *
 *   · «MÁQUINA» NO EXISTE aquí. No hay máquina: hay componentes pasivos, y cada
 *     uno se degrada por una física distinta.
 *
 *   · «MANO DE OBRA» SE ELIMINA COMO ESPINA. Es la que invita a terminar el
 *     análisis en un nombre propio, que es la forma más común de arruinar un
 *     RCA. El error humano existe y es real, pero entra como PROCESO (montaje,
 *     inspección) y como REGLA (diseño, especificación) — nunca como persona.
 *
 *   · «MEDICIÓN» NO ES ESPINA, ES EJE TRANSVERSAL. Un error de medición no
 *     tumba una línea: tumba el ANÁLISIS. Va en la calidad de cada evidencia.
 *     Confundir «el dato estaba mal» con «el activo falló» lleva derecho a un
 *     informe que culpa al inventario en vez de a la línea.
 */
export const Espina = z.enum([
  'conductor',              // el cable: fatiga, recocido, corrosión, daño de tendido
  'conexiones_empalmes',    // juntas y conectores: resistencia de contacto, embalamiento térmico
  'aislamiento_herrajes',   // cadenas, grapas, aisladores: contorneo, perforación, desgaste
  'estructura_cimentacion', // el apoyo y su fundación: pandeo, corrosión, socavación
  'tierra_apantallamiento', // puesta a tierra e hilo de guarda: el camino del rayo
  'ambiente_clima',         // viento, lluvia, temperatura, salinidad, descarga atmosférica
  'vegetacion_servidumbre', // árboles, invasión, quemas, terceros
  'diseno_hipotesis',       // la línea se calculó con supuestos que quizá no valen
  'montaje_tendido',        // cómo se construyó: par de apriete, poleas, torsión
  'operacion_maniobra',     // recierres, sobrecargas, maniobras
  'inspeccion_mantenimiento', // lo que debió detectarse y no se detectó
]);

/**
 * El estado de una espina. **NINGUNO DE LOS CUATRO ES UNA APROBACIÓN.**
 *
 * Y falta uno a propósito: NO existe «no aplica». Es el agujero por donde se
 * cuela el descarte cómodo — se marca «no aplica» sin mirar y la espina
 * desaparece del análisis sin que nadie haya descartado nada. Si de verdad no
 * aplica, es `descartada` y hay que decir con qué evidencia.
 */
export const EstadoEspina = z.enum([
  'descartada',    // la evidencia es INCOMPATIBLE con esta familia. Exige evidencia enlazada.
  'abierta',       // compatible con lo observado; sigue viva
  'sostenida',     // la evidencia apunta activamente aquí
  'no_evaluable',  // falta el dato. Exige decir CUÁL falta y quién lo tiene.
]);

export const EvaluacionEspina = z.object({
  espina: Espina,
  estado: EstadoEspina,
  /** Por qué está en ese estado. Obligatorio: un estado sin motivo no se puede auditar. */
  motivo: z.string().min(1).max(2000),
  /**
   * Evidencias que sostienen el estado. Para `descartada` y `sostenida` es
   * OBLIGATORIO al menos una — lo hace cumplir `nucleo/rca.js`, no este esquema,
   * porque la regla es de método y debe estar probada.
   */
  evidenciaIds: z.array(Id).default([]),
  /** Para `no_evaluable`: qué dato exacto falta y quién lo tiene. */
  datoQueFalta: z.string().max(500).optional(),
});

// ── LOS 5 PORQUÉS, CON ESCALERA DE NIVELES ──────────────────────────────────

/**
 * El método de los 5 porqués es famoso por lo fácil que es hacerlo mal: se para
 * en la primera respuesta cómoda. La escalera lo impide, porque nombra dónde
 * estás.
 *
 * ⚠️ UNA CADENA QUE TERMINA EN `mecanismo_fisico` NO ES CAUSA RAÍZ. Describe
 * física, no gestión — y sobre la física no se puede actuar. «El conector se
 * corroyó» no es una causa raíz: es lo que pasó. La causa raíz está en por qué
 * ESE conector, en ESA función, sin ESE control.
 */
export const NivelPorque = z.enum([
  'efecto',            // L1 · lo que se ve: la línea se abrió
  'modo_falla',        // L2 · qué pieza y cómo: el conector perdió continuidad
  'mecanismo_fisico',  // L3 · por qué falla así: corrosión galvánica + ciclado térmico
  'condicion',         // L4 · por qué existía aquí: herraje fuera de su función, sin par registrado
  'regla',             // L5 · qué regla lo permitió: la especificación no exigía inhibidor
]);

export const EslabonPorque = z.object({
  nivel: NivelPorque,
  enunciado: z.string().min(1).max(1000),
  /**
   * Con qué se sostiene este eslabón. Un porqué sin evidencia es una opinión
   * encadenada a otra opinión, y cinco de esas no son un análisis.
   */
  evidenciaIds: z.array(Id).default([]),
  /**
   * La cadena se corta aquí por falta de dato. Es preferible declararlo a
   * inventar el último eslabón, que es como se fabrica una causa raíz falsa.
   */
  cortadaPorFaltaDeDato: z.string().max(500).optional(),
});

export const CadenaPorques = z.object({
  id: Id,
  /** De qué espina cuelga esta cadena. */
  espina: Espina,
  eslabones: z.array(EslabonPorque).min(1).max(12),
});

// ── EL ÁRBOL DE CAUSAS Y EL ANÁLISIS DE BARRERAS ────────────────────────────

/**
 * Cómo se relaciona una causa con su consecuencia. La distinción importa: dos
 * causas NECESARIAS que se suman describen un evento que se pudo evitar
 * cortando cualquiera de las dos; una causa SUFICIENTE por sí sola, no.
 */
export const TipoArista = z.enum([
  'necesaria',   // sin ella el efecto no ocurre; con ella sola, tampoco basta
  'suficiente',  // por sí sola produce el efecto
  'contribuye',  // agrava o acelera, sin ser condición
]);

/**
 * LAS BARRERAS — la pregunta que suele valer más que la causa misma:
 * ¿qué defensa debió detener esto, y por qué no lo hizo?
 *
 * Un evento que atraviesa cinco barreras no tiene una causa raíz: tiene cinco
 * fallos de defensa, y arreglar solo la causa deja las otras cuatro abiertas.
 */
export const Barrera = z.enum([
  'apantallamiento',        // hilo de guarda: debió interceptar el rayo
  'puesta_a_tierra',        // debió evacuar la corriente sin contorneo inverso
  'aislamiento',            // la cadena debió soportar la sobretensión
  'distancia_seguridad',    // el despeje debió impedir el contacto
  'poda_servidumbre',       // la vegetación debió estar controlada
  'inspeccion_visual',      // el recorrido debió ver el defecto
  'termografia',            // la termografía debió detectar el punto caliente
  'proteccion_electrica',   // el relé debió despejar antes del daño
  'recierre',               // el recierre debió no insistir sobre falta permanente
  'mantenimiento_preventivo', // el plan debió intervenir antes
  'control_calidad_montaje',  // la recepción de obra debió rechazarlo
  'especificacion_diseno',    // la especificación debió exigirlo
  'gestion_repuestos',      // debió haber la pieza correcta disponible
]);

export const EstadoBarrera = z.enum([
  'ausente',       // nunca existió
  'inefectiva',    // existía y no funcionó
  'no_aplicada',   // existía, era aplicable, y no se aplicó
  'funciono',      // actuó: limitó el daño
  'no_evaluable',  // no consta si existía o actuó
]);

export const NodoCausa = z.object({
  id: Id,
  enunciado: z.string().min(1).max(1000),
  /** `null` en la raíz del árbol, que es el efecto observado. */
  padreId: Id.nullable(),
  tipoArista: TipoArista.optional(),
  nivel: NivelPorque,
  espina: Espina.optional(),
  evidenciaIds: z.array(Id).default([]),
  /** Qué defensa debió cortar esta rama, y qué le pasó. */
  barrera: z.object({
    cual: Barrera,
    estado: EstadoBarrera,
    detalle: z.string().max(1000),
  }).optional(),
});

// ── HIPÓTESIS, Y LO QUE LAS TUMBARÍA ────────────────────────────────────────

export const HipotesisRca = z.object({
  id: Id,
  enunciado: z.string().min(1).max(1000),
  espina: Espina,
  verosimilitud: Verosimilitud,
  sustento: z.string().min(1).max(2000),
  /**
   * ⚠️ EL CAMPO QUE HACE QUE ESTO SEA CIENCIA Y NO OPINIÓN.
   *
   * Qué evidencia REFUTARÍA esta hipótesis. Una hipótesis que ninguna evidencia
   * puede tumbar no es una hipótesis: es una creencia. Es obligatorio, y es la
   * diferencia entre un análisis y una narración convincente.
   */
  queLaRefutaria: z.string().min(1).max(1000),
  evidenciaIds: z.array(Id).default([]),
  /**
   * `true` si TODO su sustento es meteorológico. `nucleo/rca.js` topa estas
   * hipótesis en `baja`: que hubiera viento el día de la falla no prueba que el
   * viento la causara, y el clima es la correlación más tentadora que existe.
   */
  sustentoSoloClimatico: z.boolean().default(false),
});

// ── LO QUE NO SE PUEDE AFIRMAR ──────────────────────────────────────────────

/**
 * El bloque más honesto del expediente, y el que un informe convincente omite.
 * Va impreso: un análisis que no declara sus límites parece más fuerte y es más
 * frágil.
 */
export const Ausencia = z.object({
  que: z.string().min(1).max(500),
  porQue: z.string().min(1).max(1000),
  quienLoTiene: z.string().max(300).optional(),
  estado: z.enum(['pendiente', 'solicitado', 'recibido', 'no_disponible']).default('pendiente'),
});

// ── ACCIONES (CAPA) ─────────────────────────────────────────────────────────

export const Accion = z.object({
  id: Id,
  tipo: z.enum(['correctiva', 'preventiva']),
  que: z.string().min(1).max(1000),
  /** Sobre qué barrera actúa. Una acción que no cierra ninguna barrera es un deseo. */
  barrera: Barrera.optional(),
  responsable: z.string().max(300).optional(),
  plazo: z.string().max(100).optional(),
  estado: z.enum(['propuesta', 'aprobada', 'en_curso', 'cerrada', 'descartada']).default('propuesta'),
});

// ── EL DOCUMENTO ────────────────────────────────────────────────────────────

export const EstadoAnalisis = z.enum([
  'abierto',        // se está investigando
  'en_revision',    // el ingeniero lo está cerrando
  'cerrado',        // tiene causa raíz declarada y firmada
  'sin_conclusion', // se cierra SIN causa raíz. Es un final válido y honesto.
]);

export const AnalisisCausa = Base.extend({
  tipo: z.literal('analisis_causa'),
  /** Código legible para el informe («RCA-2026-004»). No es la identidad. */
  codigo: z.string().min(1).max(40),
  titulo: z.string().min(1).max(300),
  estado: EstadoAnalisis.default('abierto'),
  abiertoEn: Instante,

  /**
   * EL ALCANCE, y aquí está la razón de existir de este documento.
   *
   * Las tres listas son opcionales por separado, pero el `refine` de abajo
   * exige que haya AL MENOS UNA cosa — o, si no hay ninguna, el motivo escrito.
   * Un análisis sobre nada no es un análisis; pero un análisis sobre un evento
   * cuyo apoyo aún no se ha identificado SÍ lo es, y debe poder abrirse sin
   * inventar el apoyo.
   */
  alcance: z.object({
    lineaIds: z.array(Id).default([]),
    apoyoIds: z.array(Id).default([]),
    investigacionIds: z.array(Id).default([]),
    /** Por qué todavía no hay activo señalado. Se rellena solo si las tres listas van vacías. */
    sinActivoIdentificado: z.string().max(500).optional(),
  }),

  /**
   * LA TABLA DE DESCARTES. Se guardan las 11, siempre, incluso las que nadie ha
   * mirado — `nucleo/rca.js` las completa como `no_evaluable`. Una espina que
   * desaparece cuando falta el dato se lee como «eso ya no aplica».
   */
  espinas: z.array(EvaluacionEspina).default([]),
  cadenas: z.array(CadenaPorques).default([]),
  arbol: z.array(NodoCausa).default([]),
  hipotesis: z.array(HipotesisRca).default([]),
  ausencias: z.array(Ausencia).default([]),
  acciones: z.array(Accion).default([]),

  /**
   * La causa raíz DECLARADA. Opcional a propósito: durante días —a veces
   * semanas— el estado normal de un análisis es no tenerla.
   *
   * La marca una PERSONA. `nucleo/rca.js` calcula qué condiciones se cumplen y
   * cuáles no, y las imprime; no marca nunca. Es la misma línea que el resto del
   * producto: el motor mide, el ingeniero decide.
   */
  causaRaiz: z.object({
    nodoId: Id,
    enunciado: z.string().min(1).max(1000),
    declaradaPor: Uid,
    declaradaEn: Instante,
    /** Las condiciones que NO se cumplían al declararla. Se guardan: es la defensa del informe. */
    condicionesNoCumplidas: z.array(z.string()).default([]),
  }).optional(),

  /** Límites del análisis, impresos en el informe. Se declara; no se omite. */
  limitaciones: z.array(z.string().max(1000)).default([]),
  cerrado: z.boolean().default(false),
}).refine(
  (a) => a.alcance.lineaIds.length > 0
      || a.alcance.apoyoIds.length > 0
      || a.alcance.investigacionIds.length > 0
      || Boolean(a.alcance.sinActivoIdentificado),
  {
    message: 'Un análisis necesita alcance: al menos una línea, un apoyo o una investigación — '
           + 'o, si el evento aún no tiene activo identificado, el motivo escrito. '
           + 'Lo que no vale es dejarlo vacío en silencio.',
  },
);

// ── EL SONDEO DE CLIMA ──────────────────────────────────────────────────────

/**
 * Una consulta a IDEAM, congelada.
 *
 * NO es una caché: es un HECHO FECHADO. Si dentro de un año IDEAM corrige una
 * serie, el informe firmado tiene que seguir mostrando lo que se consultó el día
 * que se firmó. Por eso las reglas de Firestore lo hacen inmutable — se crea, no
 * se actualiza.
 */
export const SondeoClima = Base.extend({
  tipo: z.literal('sondeo_clima'),
  analisisId: Id,
  consultadoEn: Instante,
  /** La ventana de tiempo que se pidió, alrededor del evento. */
  desde: Instante,
  hasta: Instante,
  estacion: z.object({
    codigo: z.string().min(1),
    nombre: z.string().min(1),
    municipio: z.string().optional(),
    departamento: z.string().optional(),
    lat: z.number(),
    lon: z.number(),
    /** ⚠️ Va SIEMPRE junto al valor, nunca al pie. Una estación a 40 km no dice lo mismo. */
    distancia_km: z.number().nonnegative(),
  }),
  /**
   * `fechaobservacion` de IDEAM viene SIN zona horaria. Que se interprete como
   * hora de Colombia es una inferencia NUESTRA, y se declara como tal.
   */
  interpretacionHoraria: z.string().min(1),
  series: z.array(z.object({
    variable: z.enum(['temperatura', 'precipitacion', 'viento_velocidad', 'viento_direccion', 'presion']),
    conjunto: z.string().min(1),   // el identificador del conjunto en datos.gov.co
    unidad: z.string().min(1),
    n: z.number().int().nonnegative(),
    valores: z.array(z.object({ t: z.string(), v: z.number() })).default([]),
  })).default([]),
  /** Último dato que IDEAM tenía publicado al consultar. Se MIDE, no se supone. */
  ultimoDatoDisponible: z.string().optional(),
  /** `true` si el evento es posterior al último dato: no hay clima que traer todavía. */
  fueraDeVentana: z.boolean().default(false),
  /** El texto que se pinta. Lo redacta el núcleo, no la pantalla. */
  nota: z.string().max(2000),
});

export type Espina = z.infer<typeof Espina>;
export type EstadoEspina = z.infer<typeof EstadoEspina>;
export type NivelPorque = z.infer<typeof NivelPorque>;
export type Barrera = z.infer<typeof Barrera>;
export type EstadoBarrera = z.infer<typeof EstadoBarrera>;
export type AnalisisCausa = z.infer<typeof AnalisisCausa>;
export type SondeoClima = z.infer<typeof SondeoClima>;
export type EvaluacionEspina = z.infer<typeof EvaluacionEspina>;
export type CadenaPorques = z.infer<typeof CadenaPorques>;
export type NodoCausa = z.infer<typeof NodoCausa>;
export type HipotesisRca = z.infer<typeof HipotesisRca>;
