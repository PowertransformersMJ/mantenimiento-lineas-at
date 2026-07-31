// ============================================================================
// eventos.ts — lo INMUTABLE: lo que pasó, cuándo, y quién lo vio
// ----------------------------------------------------------------------------
// Un evento no se edita jamás. Una inspección de 2027 no pisa la de 2026: se
// añade. Corregir algo es registrar una corrección fechada, no reescribir el
// pasado. Es lo que permite tendencia de corrosión, defensa técnica ante el
// cliente, y reproducir un informe firmado años después.
// ============================================================================
import { z } from 'zod';
import { Base, Id, Instante, Uid, SelloCalculo, Procedencia } from './comunes.js';
import { Condicion } from './activos.js';

// ── Inspección ──────────────────────────────────────────────────────────────

export const TipoInspeccion = z.enum([
  'visual_pie', 'visual_ascenso', 'termografia', 'dron', 'topografia', 'posfalla',
]);

export const Inspeccion = Base.extend({
  tipo: z.literal('inspeccion'),
  lineaId: Id,
  tipoInspeccion: TipoInspeccion,
  campanaId: Id.optional(),
  inicioEn: Instante,
  finEn: Instante.optional(),
  cuadrilla: z.array(Uid).min(1),
  /** Apoyos que esta inspección alcanzó. Los que no están, NO se inspeccionaron. */
  apoyosCubiertos: z.array(Id),
  observaciones: z.string().max(4000).optional(),
  cerrada: z.boolean().default(false),
});

// ── Evidencia (metadatos de foto — NUNCA los bytes) ─────────────────────────

/**
 * La foto vive en almacenamiento de objetos. Aquí solo su ficha.
 * Guardar la imagen en base64 dentro del documento reventaría el límite de
 * 1 MiB y la memoria del móvil al parsear (ADR-002, guardarraíl de código).
 */
export const Evidencia = Base.extend({
  tipo: z.literal('evidencia'),
  inspeccionId: Id,
  apoyoId: Id.optional(),
  /** Ruta en el almacenamiento de objetos. El binario nunca entra a la base. */
  rutaObjeto: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive(),
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ancho: z.number().int().positive().optional(),
  alto: z.number().int().positive().optional(),
  tomadaEn: Instante.optional(),
  pie: z.string().max(500).optional(),
  /** Qué se supone que muestra. Es contra esto que el control de calidad compara. */
  componenteEsperado: z.string().optional(),
  /**
   * Estado de subida. Una inspección puede quedar sincronizada con sus fotos
   * pendientes: es un estado VÁLIDO, no un error (ADR-002, enmienda 1).
   */
  subida: z.enum(['pendiente', 'subiendo', 'completa', 'fallida']).default('pendiente'),
});

// ── Hallazgo (lo que una PERSONA confirmó) ──────────────────────────────────

export const Severidad = z.enum(['informativa', 'baja', 'media', 'alta', 'critica']);

/**
 * Un hallazgo es un juicio profesional. El modelo NO puede escribir aquí: las
 * reglas se lo niegan (ADR-004). Si nació de una sugerencia, queda registrado
 * de cuál y quién la confirmó.
 */
export const Hallazgo = Base.extend({
  tipo: z.literal('hallazgo'),
  lineaId: Id,
  apoyoId: Id.optional(),
  inspeccionId: Id,
  componente: z.string().min(1),
  tipoHallazgo: z.string().min(1),
  severidad: Severidad,
  descripcion: z.string().max(4000),
  evidenciaIds: z.array(Id).default([]),
  condicionResultante: Condicion.optional(),

  origen: z.enum(['humano_directo', 'confirmado_de_sugerencia']),
  /** Obligatorio si vino de una sugerencia: es la trazabilidad de la IA. */
  sugerenciaId: Id.optional(),
  confirmadoPor: Uid,
  confirmadoEn: Instante,

  estado: z.enum(['abierto', 'en_gestion', 'cerrado', 'descartado']).default('abierto'),
}).superRefine((h, ctx) => {
  if (h.origen === 'confirmado_de_sugerencia' && !h.sugerenciaId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sugerenciaId'],
      message: 'un hallazgo confirmado desde una sugerencia debe declarar CUÁL sugerencia',
    });
  }
});

// ── Cálculo (salida del núcleo, con su sello) ───────────────────────────────

export const EstadoMecanico = z.object({
  nombre: z.string(),
  tiro_kgf: z.number().positive(),
  cargaUnitaria_kg_m: z.number().positive(),
  temperatura_C: z.number(),
});

export const TramoCalculado = z.object({
  orden: z.number().int().nonnegative(),
  apoyoDesdeId: Id,
  apoyoHastaId: Id,
  vanos_m: z.array(z.number().positive()),
  vanoIdealRegulacion_m: z.number().positive(),
  estados: z.array(EstadoMecanico),
  tiroPico_kgf: z.number().positive(),
  pctRts: z.number().nonnegative(),
  flechaMaxima_m: z.number().nonnegative(),
  /** Contra qué límite se comparó. Sin esto, un porcentaje no significa nada. */
  limiteAplicado: z.object({
    descripcion: z.string(),
    valor: z.number(),
    unidad: z.string(),
    norma: z.string().optional(),
  }),
  cumple: z.boolean(),
});

/**
 * Un cálculo es un DICTAMEN FECHADO, no una caché. Por eso lleva el sello con
 * la versión del motor y las hipótesis: recalcular en 2029 daría la respuesta
 * de 2029, no la que se firmó (ADR-002, refutación 2).
 */
export const Calculo = Base.extend({
  tipo: z.literal('calculo'),
  lineaId: Id,
  sello: SelloCalculo,
  tramos: z.array(TramoCalculado),
  /** Lo que el cálculo NO pudo verificar. Se declara; no se omite. */
  limitaciones: z.array(z.string()).default([]),
  procedenciaEntradas: Procedencia,
  /** Congelado = se emitió un informe con él. Inmutable para siempre. */
  congelado: z.boolean().default(false),
});

// ── Investigación de falla ──────────────────────────────────────────────────

/**
 * Cuando una línea se abre, lo que queda no es un hallazgo suelto: es un
 * EXPEDIENTE. Tiene una cronología de lo que se hizo, observaciones sobre la
 * evidencia física, hipótesis causales jerarquizadas y —lo que más vale— la
 * lista de lo que TODAVÍA no se puede afirmar y con qué se cerraría.
 *
 * Se modela aparte de `Hallazgo` a propósito: un hallazgo es un defecto
 * observado en un apoyo; una investigación es un razonamiento fechado sobre un
 * evento, con grados de certeza declarados. Mezclarlos borraría justo la
 * distinción que hace defendible el informe: **qué se vio** frente a **qué se
 * concluye**.
 */
export const Verosimilitud = z.enum(['alta', 'media', 'baja']);
export const SeveridadObservacion = z.enum(['critica', 'advertencia', 'contexto']);

export const Investigacion = Base.extend({
  tipo: z.literal('investigacion'),
  lineaId: Id,
  /** El apoyo donde ocurrió. Por id inmutable, nunca por número de estructura. */
  apoyoId: Id,
  ocurrioEn: Instante,
  /** Cómo lo escribe el ingeniero en el informe («14 de marzo de 2027»). */
  fechaTexto: z.string().optional(),
  placa: z.string().optional(),
  componenteAfectado: z.string().min(1),

  cronologia: z.array(z.object({
    cuando: z.string().min(1),
    que: z.string().min(1),
  })).default([]),

  /** Lo que se VE en la evidencia. No son conclusiones. */
  observaciones: z.array(z.object({
    titulo: z.string().min(1),
    detalle: z.string().min(1),
    severidad: SeveridadObservacion,
  })).default([]),

  /** Lo que se CONCLUYE, con su grado de certeza y su sustento. */
  hipotesis: z.array(z.object({
    enunciado: z.string().min(1),
    verosimilitud: Verosimilitud,
    sustento: z.string().min(1),
  })).default([]),

  /**
   * ⚠️ La parte más honesta del expediente: lo que NO se puede afirmar todavía.
   * Un informe que omite esto parece más fuerte y es más frágil.
   */
  verificacionesPendientes: z.array(z.object({
    que: z.string().min(1),
    porQue: z.string().min(1),
    estado: z.enum(['pendiente', 'solicitado', 'recibido', 'no_disponible']).default('pendiente'),
  })).default([]),

  cerrada: z.boolean().default(false),
});

export type Inspeccion = z.infer<typeof Inspeccion>;
export type Evidencia = z.infer<typeof Evidencia>;
export type Hallazgo = z.infer<typeof Hallazgo>;
export type Calculo = z.infer<typeof Calculo>;
export type TramoCalculado = z.infer<typeof TramoCalculado>;
export type Severidad = z.infer<typeof Severidad>;
export type Investigacion = z.infer<typeof Investigacion>;
export type Verosimilitud = z.infer<typeof Verosimilitud>;
