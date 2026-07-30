// ============================================================================
// activos.ts — lo que MUTA DESPACIO: la línea y sus apoyos
// ----------------------------------------------------------------------------
// Un activo describe la física de la instalación: dónde está y de qué está
// hecha. Cambia poco, y cuando cambia es un HECHO FECHADO, no una sobrescritura
// (ADR-002). Lo que sí ocurre a menudo —inspecciones, hallazgos— vive en
// eventos.ts como registro inmutable.
// ============================================================================
import { z } from 'zod';
import { Base, Id, Instante, Procedencia } from './comunes.js';

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
