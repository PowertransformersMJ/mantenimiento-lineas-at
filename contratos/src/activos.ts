// ============================================================================
// activos.ts — lo que MUTA DESPACIO: la línea y sus apoyos
// ----------------------------------------------------------------------------
// Un activo describe la física de la instalación: dónde está y de qué está
// hecha. Cambia poco, y cuando cambia es un HECHO FECHADO, no una sobrescritura
// (ADR-002). Lo que sí ocurre a menudo —inspecciones, hallazgos— vive en
// eventos.ts como registro inmutable.
// ============================================================================
import { z } from 'zod';
import { Base, Id, Instante, Procedencia } from './comunes.ts';

// ── Catálogos cerrados del dominio ──────────────────────────────────────────

/**
 * Decide dónde se corta el tramo de tensión, y por tanto gobierna TODO el
 * cálculo mecánico. Cambiarlo obliga a recalcular el tramo entero, nunca solo
 * ese apoyo (ADR-002, enmienda 3).
 */
export const FuncionEstructural = z.enum([
  'Suspensión',
  'Suspensión angular',
  'Ángulo',
  'Retención / anclaje',
  'Terminal',
  'Derivación',
]);

/** Las funciones que ANCLAN el conductor y cortan el tramo. */
export const FUNCIONES_ANCLA: readonly string[] = Object.freeze([
  'Ángulo', 'Retención / anclaje', 'Terminal', 'Derivación',
]);

/**
 * Qué ES el número que alguien declaró como capacidad longitudinal. De esto —y
 * solo de esto— depende contra qué porcentaje se compara, así que sin tipo no
 * hay veredicto:
 *   · 'rotura'    — carga de FALLA. Se le aplica el coeficiente de seguridad 2
 *                   (umbral 50 %).
 *   · 'admisible' — carga de trabajo que YA lleva su factor de seguridad
 *                   dentro. Umbral 100 %.
 *   · 'diseno'    — la carga con la que el proyecto dimensionó el apoyo, ya
 *                   afectada por sus factores. Umbral 100 %.
 *
 * Es lista CERRADA a propósito: entre el 50 % y el 100 % hay un factor 2 sobre
 * el veredicto de un apoyo, y ante un texto que no sea uno de estos tres
 * ('ultima', 'nominal', 'ROTURA' en mayúsculas, un error de tecleo) el sistema
 * no adivina el más parecido — deja el apoyo sin veredicto y lo dice.
 *
 * Sin eñe a propósito: es una CLAVE del contrato, y una clave no lleva acentos
 * ni caracteres que cada exportador escriba de una manera.
 *
 * ⚠️ Esta lista se DUPLICA en `nucleo/longitudinal.js`, que no puede importar
 * del contrato (el núcleo no importa nada). Toda lista de dominio duplicada
 * lleva su guardián: una prueba lee los dos archivos como TEXTO y compara,
 * igual que la que ya protege `FUNCIONES_ANCLA` (`33 · L-19`, ADR-013).
 */
export const TipoCapacidadLongitudinal = z.enum(['rotura', 'admisible', 'diseno']);

export const MaterialConductor = z.enum(['ACSR', 'AAAC', 'ACAR', 'ACSS / ACCC', 'Otro']);

export const TipoApoyo = z.enum([
  'Poste de concreto', 'Poste metálico', 'Poste de madera',
  'Torre metálica', 'Torreta', 'Otro',
]);

/**
 * ⚠️ NO todo punto levantado con GPS es un apoyo.
 *
 * Un **empalme** es una unión del conductor: puede estar a mitad de vano y NO
 * sostiene nada. Un **punto de referencia** es una marca del levantamiento.
 * Contarlos como apoyos parte un vano real en dos falsos y **cambia el cálculo
 * mecánico**: en LN-627, dos empalmes convertían un vano real de 247,8 m en dos
 * de 84,4 y 163,5 m — y ese vano largo es justo el que gobierna la flecha.
 *
 * Solo las `Estructura` entran en vanos, deflexiones y tramos de tensión.
 */
export const TipoPunto = z.enum(['Estructura', 'Empalme', 'Punto de referencia']);

export const NivelContaminacion = z.enum(['Muy ligero', 'Ligero', 'Medio', 'Fuerte', 'Muy fuerte']);

export const Condicion = z.enum(['Buena', 'Regular', 'Mala', 'Crítica', 'Sin evaluar']);

// ── Coordenada ──────────────────────────────────────────────────────────────

/**
 * El levantamiento viene en WGS84 (es lo que da el GPS). El sistema oficial de
 * Colombia es MAGNA-SIRGAS: para cruzar con cartografía catastral hay que
 * transformar, y por eso el sistema de referencia se guarda explícito.
 *
 * `precision_m` NO es decoración: un GPS de mano tiene error vertical de 5 a
 * 10 m, del mismo orden que el gálibo que hay que demostrar. Sin este campo,
 * nadie sabe si una verificación de distancia al terreno es firmable.
 */
export const Coordenada = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  sistemaReferencia: z.enum(['WGS84', 'MAGNA-SIRGAS']).default('WGS84'),
  /** Cota del TERRENO, en metros. No es la del punto de sujeción del conductor. */
  cotaTerreno_m: z.number().optional(),
  precision_m: z.number().nonnegative().optional(),
  metodo: z.enum(['gps_mano', 'gnss_diferencial', 'estacion_total', 'lidar', 'cartografia']).optional(),
  tomadaEn: Instante.optional(),
});

// ── Conductor ───────────────────────────────────────────────────────────────

/**
 * Los datos del conductor son entrada directa del cálculo mecánico y térmico.
 * Por eso llevan procedencia: la diferencia entre un valor de catálogo genérico
 * y uno de la ficha del proveedor real ha decidido, en esta misma línea, si un
 * tramo cumple o no el límite del RETIE.
 */
export const Conductor = z.object({
  codigo: z.string().min(1),            // p. ej. "Darien"
  material: MaterialConductor,
  calibre: z.string().optional(),        // p. ej. "559,5 MCM"
  formacion: z.string().optional(),      // n.º de hilos
  seccion_mm2: z.number().positive(),
  diametro_m: z.number().positive(),
  masaLineal_kg_m: z.number().positive(),
  rts_kgf: z.number().positive(),        // carga de rotura
  moduloElastico_kg_mm2: z.number().positive(),
  /** ⚠️ Declarar si es INICIAL o FINAL: la fluencia del conductor depende de ello. */
  moduloEs: z.enum(['inicial', 'final', 'no_declarado']).default('no_declarado'),
  dilatacion_1_C: z.number().positive(),
  tempMaxOperacion_C: z.number().positive(),
  procedencia: Procedencia,
  fuente: z.string().optional(),         // fabricante y referencia de la ficha
});

// ── Línea ───────────────────────────────────────────────────────────────────

export const Linea = Base.extend({
  tipo: z.literal('linea'),
  codigo: z.string().min(1),             // p. ej. "LN-627"
  nombre: z.string().min(1),
  tensionNominal_kV: z.number().positive(),
  /** Las distancias de seguridad se basan en la MÁXIMA tensión de operación, no en la nominal. */
  tensionMaxima_kV: z.number().positive().optional(),
  circuitos: z.number().int().positive().default(1),
  propietario: z.string().optional(),
  conductor: Conductor.optional(),
  hipotesisId: Id.optional(),
  activa: z.boolean().default(true),
});

// ── Apoyo ───────────────────────────────────────────────────────────────────

export const Apoyo = Base.extend({
  tipo: z.literal('apoyo'),
  lineaId: Id,
  /**
   * Posición en la línea. Es lo que ORDENA los vanos. Se separa del nombre a
   * propósito: el nombre puede ser irregular (en LN-627 conviven "E022",
   * "EMP TUB" y "EMPT"), y ordenar por nombre daría vanos equivocados.
   */
  orden: z.number().int().nonnegative(),
  /**
   * Qué es este punto. **Decide si entra o no al cálculo.** Por defecto se
   * asume `Estructura`, pero si el levantamiento trae empalmes hay que
   * marcarlos: contarlos como apoyos falsea los vanos.
   */
  tipoPunto: TipoPunto.default('Estructura'),

  /** Como quedó grabado en el GPS. Se conserva tal cual, sin "arreglarlo". */
  nombreCampo: z.string().min(1),
  /**
   * Nombre canónico de la línea. NO sobrescribe al de campo: conviven.
   * El de campo es la trazabilidad con el levantamiento; el canónico es el que
   * usa el ingeniero y el que sale en los informes. En LN-627 el GPS grabó
   * "LN 627 E022" donde la línea tiene su **E02**.
   */
  nombreNormalizado: z.string().optional(),
  coordenada: Coordenada,

  funcionEstructural: FuncionEstructural,
  funcionProcedencia: Procedencia,
  /** Deflexión en grados. La calcula el sistema; se guarda para poder auditarla. */
  deflexion_grados: z.number().min(0).max(180).nullable().optional(),

  tipoApoyo: TipoApoyo.optional(),
  altura_m: z.number().positive().optional(),
  /** Cota del PUNTO DE SUJECIÓN del conductor. Es la que necesita el vano peso. */
  cotaSujecion_m: z.number().optional(),
  cargaRotura_kgf: z.number().positive().optional(),
  /**
   * Altura LIBRE del apoyo sobre el terreno, en metros: la parte que sobresale
   * del empotramiento, que es la misma a la que el fabricante ensayó la carga de
   * rotura.
   *
   * ⚠️ NO es `altura_m` (longitud total del poste) ni se deduce de ella: el
   * empotramiento depende del terreno y no se ve desde un escritorio. Se captura
   * en campo o viene del acta de montaje. Sin ella, `nucleo/cargas.js` deja la
   * utilización del apoyo en NO EVALUABLE, que es lo correcto — un apoyo que
   * "cumple" contra una capacidad supuesta es un informe firmado sobre un
   * supuesto.
   */
  alturaLibre_m: z.number().positive().optional(),
  /**
   * Altura sobre el terreno del punto donde el conductor amarra, en metros.
   *
   * Lo que rompe un poste no es la fuerza sino el MOMENTO en el empotramiento,
   * así que comparar kgf contra kgf solo vale si las dos fuerzas actúan a la
   * misma altura. Con el conductor amarrado por debajo de la punta el mismo kgf
   * hace menos daño. Tiene que ser ≤ `alturaLibre_m`: por encima de la punta la
   * geometría es imposible y el cálculo del momento no significaría nada.
   *
   * Es una ALTURA sobre el terreno, no una cota sobre el nivel del mar — no
   * confundir con `cotaSujecion_m`, que es la del vano peso.
   */
  alturaAplicacion_m: z.number().positive().optional(),
  /**
   * Capacidad del apoyo EN EL EJE DE LA LÍNEA (longitudinal), tal como la
   * declaró quien la conoce: la ficha del fabricante, la memoria de cálculo del
   * proyecto o un cálculo estructural firmado.
   *
   * Es el dato que hoy no tiene NINGÚN apoyo, y por eso ningún apoyo tiene
   * veredicto en este eje (ADR-012). Mientras falte, `nucleo/longitudinal.js`
   * deja la utilización en NO EVALUABLE con el motivo escrito — que es un hecho
   * sobre el INVENTARIO, no un fallo del cálculo. El día que el inventario lo
   * traiga —esta capacidad y `nFasesAmarradas`, que es su compañero obligado—, el
   * veredicto sale solo.
   *
   * ⚠️ NO se deduce de `cargaRotura_kgf`, y el sistema no lo intenta jamás:
   * aquélla es la carga de ensayo TRANSVERSAL aplicada en la punta, y su
   * validez a lo largo de la línea depende de la sección del apoyo (circular u
   * omnidireccional frente a eje fuerte y eje débil) y de si hay retenida —
   * ninguna de las dos está declarada en este contrato. Los dos errores caben
   * en el mismo número: «revisar» sobre un terminal retenido sano y «cumple»
   * sobre un poste con el eje débil hacia la línea.
   *
   * ⚠️ Es propiedad del APOYO, nunca de la línea, y no se acepta por parámetro
   * de línea en ningún punto del sistema. Un veredicto heredado de otro apoyo
   * es peor que no tener veredicto, en una línea donde conviven concreto,
   * metálico, madera, torre y torreta.
   */
  capacidadLongitudinal: z.object({
    /**
     * La capacidad, en kgf. Positiva de verdad: un cero o un negativo no es un
     * dato, es un error de captura, y no se trata como «sin capacidad».
     */
    valor_kgf: z.number().positive(),
    /** Contra qué porcentaje se compara. Sin él no hay veredicto (ver arriba). */
    tipo: TipoCapacidadLongitudinal,
    /**
     * Altura sobre el terreno A LA QUE ESA CAPACIDAD ESTÁ REFERIDA, en metros
     * — normalmente el nivel de la cruceta.
     *
     * Es obligatoria DENTRO del objeto porque lo que rompe un apoyo no es la
     * fuerza sino el MOMENTO: la utilización compara momento contra momento
     * —(FL · altura de amarre) frente a (capacidad · esta altura)— y sin ella
     * no hay con qué comparar.
     *
     * ⚠️ NO se supone que sea la punta. El convenio de `alturaLibre_m` existe
     * porque `cargaRotura_kgf` está definida como ensayo EN LA PUNTA; una
     * capacidad longitudinal se declara referida a una altura concreta, y
     * reescalarla en silencio devolvería un porcentaje impecable y falso, con
     * veredicto encima. Sin este dato el apoyo se queda sin veredicto.
     */
    alturaReferencia_m: z.number().positive(),
    /**
     * De dónde salió el número: ficha del fabricante con su referencia, acta de
     * montaje, memoria de cálculo. Opcional en el esquema, pero el informe lo
     * imprime: un número sin origen no es firmable, y quien revisa tiene que
     * poder discutirlo sin abrir el código.
     */
    fuente: z.string().min(1).optional(),
  }).optional(),

  /**
   * Cuántos conductores AMARRAN en este apoyo — fases y, si lo lleva, el cable
   * de guarda. Es el multiplicador que convierte la carga longitudinal POR
   * CONDUCTOR en la carga total sobre la estructura, y sin él no hay total: sin
   * total no hay nada contra qué comparar la capacidad, y por tanto no hay
   * veredicto por muy bien declarada que esté (ADR-017).
   *
   * ⚠️ NO se hereda del conteo de la carga TRANSVERSAL (`nConductores`). Aquél
   * cuenta 3·circuitos con el cable de guarda declaradamente FUERA; aquí el
   * guarda —que va más alto y por tanto hace más momento— manda. Heredarlo
   * dejaría la carga corta justo en el apoyo más cargado, y el porcentaje
   * saldría por el lado favorable.
   *
   * ⚠️ Va por APOYO. Un terminal amarra todas las fases; un apoyo de paso puede
   * amarrar ninguna. Un conteo de línea sería una suposición sobre cada
   * estructura, y el veredicto que sale de él no lo puede defender nadie.
   */
  nFasesAmarradas: z.number().int().positive().optional(),

  anioInstalacion: z.number().int().min(1900).max(2200).optional(),
  codigoInventario: z.string().optional(),

  aislamiento: z.object({
    modelo: z.string().optional(),
    unidadesPorCadena: z.number().int().positive().optional(),
    fugaPorUnidad_mm: z.number().positive().optional(),
    nivelContaminacion: NivelContaminacion.optional(),
  }).optional(),

  puestaTierra: z.object({
    tipo: z.string().optional(),
    numeroVarillas: z.number().int().nonnegative().optional(),
    resistencia_ohm: z.number().nonnegative().optional(),
    medidaEn: Instante.optional(),
  }).optional(),

  condicion: Condicion.default('Sin evaluar'),
  activo: z.boolean().default(true),
});

// ── Hipótesis de cálculo ────────────────────────────────────────────────────

/**
 * Se versiona como documento propio y NUNCA se edita en sitio: un informe
 * firmado en 2026 debe poder reproducirse en 2029, y para eso las hipótesis
 * con que se calculó tienen que seguir existiendo intactas.
 */
export const Hipotesis = Base.extend({
  tipo: z.literal('hipotesis'),
  nombre: z.string().min(1),
  lineaId: Id.optional(),

  eds_pct: z.number().positive().max(100),
  tempEds_C: z.number(),
  tempMax_C: z.number(),
  tempMin_C: z.number(),
  vientoMax_kmh: z.number().nonnegative(),
  /** Temperatura COINCIDENTE con el viento, que no es la del día templado. */
  tempViento_C: z.number(),
  cx: z.number().positive().default(1.0),
  densidadAire_kg_m3: z.number().positive().default(1.2),

  /**
   * Tope de tiro que el Ingeniero ADOPTA para esta línea, en % de la carga de
   * rotura del conductor. Si no se declara, `nucleo/umbrales.js` usa 50 % y lo
   * dice con esas palabras: «criterio clásico, no una norma citada».
   *
   * ⚠️ El campo se añade ADITIVO y OPCIONAL. Que exista NO decide nada: la
   * elección entre el 50 % clásico y el 25 % del RETIE sigue pendiente del
   * Ingeniero (TODO-33), y hasta que la declare aquí —y declare también
   * `criterioTiroQueRige`— el sistema muestra los dos criterios y no elige.
   * Antes de §ADR-013 `umbrales.js` ya leía este campo y el esquema no lo
   * admitía, así que la rama «declarado» era inalcanzable: pasara lo que
   * pasara, el tope valía 50 % y el informe lo atribuía a una hipótesis que no
   * lo había declarado.
   */
  tiroAdmisible_pct: z.number().positive().max(100).optional(),

  /**
   * Cuál de los dos criterios de tiro RIGE. Sin esto, la fila del RETIE sale
   * «no evaluable»: no falta el número, falta la DECISIÓN, y el sistema no la
   * toma por nadie.
   */
  criterioTiroQueRige: z.enum(['adoptado', 'retie_25']).optional(),

  /** Distancia mínima al terreno EXIGIDA, por categoría de terreno. Un valor único no es defendible. */
  despejeMinimo_m: z.record(z.string(), z.number().positive()).optional(),
  normaReferencia: z.string().optional(),
  procedencia: Procedencia,
  /** Congelada = ya se firmó un informe con ella; no se toca nunca más. */
  congelada: z.boolean().default(false),
});

export type Linea = z.infer<typeof Linea>;
export type Apoyo = z.infer<typeof Apoyo>;
export type Conductor = z.infer<typeof Conductor>;
export type Hipotesis = z.infer<typeof Hipotesis>;
export type Coordenada = z.infer<typeof Coordenada>;
export type FuncionEstructural = z.infer<typeof FuncionEstructural>;
export type TipoCapacidadLongitudinal = z.infer<typeof TipoCapacidadLongitudinal>;
