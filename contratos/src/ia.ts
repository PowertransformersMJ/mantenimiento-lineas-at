// ============================================================================
// ia.ts — el subsistema de IA (ADR-004)
// ----------------------------------------------------------------------------
// LA REGLA MADRE, aquí convertida en tipos:
//
//   La IA mira y redacta; el núcleo mide; el ingeniero decide.
//   Nada que haya tocado el modelo entra a un informe sin que una persona lo
//   confirme, una por una.
//
// El modelo escribe SOLO en `sugerencias`. Las reglas de la base le niegan
// `hallazgos`, `calculos` y `apoyos`. Aunque el código se escriba mal, la
// doctrina se cumple porque la máquina no permite otra cosa.
// ============================================================================
import { z } from 'zod';
import { Base, Id, Instante, Uid, EstadoTrabajo, MotivoRechazo } from './comunes.js';

// ── Los cinco casos de uso, cerrados ────────────────────────────────────────

export const CasoDeUso = z.enum([
  'calidad_evidencia',   // 1 · revisa la CAPTURA, no la línea. Evita el re-viaje
  'redaccion_informe',   // 2 · prosa alrededor de números ya calculados
  'normalizacion_texto', // 3 · texto libre de campo → taxonomía cerrada
  'pregunta_incoherencia', // 4 · una regla detecta; el modelo solo PREGUNTA
  'extraccion_pdf',      // 5 · ficha de fabricante → campos con página y cita
]);

/** Tope de salida por caso de uso. Lo fija el SERVIDOR, jamás el cliente. */
export const MAX_TOKENS: Readonly<Record<string, number>> = Object.freeze({
  calidad_evidencia: 300,
  normalizacion_texto: 300,
  pregunta_incoherencia: 500,
  redaccion_informe: 2000,
  extraccion_pdf: 1500,
});

// ── Solicitud ───────────────────────────────────────────────────────────────

/**
 * Lo ÚNICO que el cliente puede crear. Nótese lo que NO tiene: prompt, modelo,
 * temperatura ni max_tokens. Si el frontend pudiera mandar prompt, habría una
 * fuga de presupuesto y un jailbreak gratis.
 */
export const SolicitudIA = Base.extend({
  tipo: z.literal('solicitud_ia'),
  casoDeUso: CasoDeUso,
  /** Referencias a documentos y objetos. NUNCA contenido, nunca bytes. */
  referencias: z.object({
    lineaId: Id.optional(),
    apoyoId: Id.optional(),
    inspeccionId: Id.optional(),
    evidenciaIds: z.array(Id).max(50).optional(),
    calculoId: Id.optional(),
    documentoId: Id.optional(),
  }),
  estado: EstadoTrabajo.default('pendiente'),
  motivoRechazo: MotivoRechazo.optional(),
  intentos: z.number().int().min(0).max(2).default(0),
  /**
   * Identificador de idempotencia: hash de (caso de uso + referencias + versión
   * de prompt). Dos toques del dedo en el monte crean el mismo documento y se
   * cobra una vez.
   */
  huella: z.string().regex(/^[a-f0-9]{64}$/),
});

/** Lo que el CLIENTE puede escribir al crear. Todo lo demás lo pone el servidor. */
export const SolicitudIA_Cliente = z.object({
  casoDeUso: CasoDeUso,
  referencias: SolicitudIA.shape.referencias,
}).strict();

// ── Sugerencia (el borrador del modelo) ─────────────────────────────────────

export const DefectoCaptura = z.enum([
  'foto_movida', 'exposicion_incorrecta', 'componente_no_visible',
  'placa_ilegible', 'duplicada', 'encuadre_insuficiente',
]);

export const ContenidoSugerencia = z.discriminatedUnion('casoDeUso', [
  z.object({
    casoDeUso: z.literal('calidad_evidencia'),
    evidenciaId: Id,
    defectos: z.array(DefectoCaptura),
    /** Lo que el código determinista concluyó. Si discrepa del modelo, GANA EL CÓDIGO. */
    veredictoDeterminista: z.array(DefectoCaptura),
    discrepancia: z.boolean(),
  }),
  z.object({
    casoDeUso: z.literal('redaccion_informe'),
    /** Prosa con MARCADORES. El servidor sustituye los números, no el modelo. */
    plantilla: z.string().max(20000),
    marcadores: z.array(z.string()),
  }),
  z.object({
    casoDeUso: z.literal('normalizacion_texto'),
    textoOriginal: z.string().max(2000),
    componente: z.string(),
    tipoHallazgo: z.string(),
    posicion: z.string().optional(),
  }),
  z.object({
    casoDeUso: z.literal('pregunta_incoherencia'),
    reglaDisparada: z.string(),
    pregunta: z.string().max(1000),
  }),
  z.object({
    casoDeUso: z.literal('extraccion_pdf'),
    campos: z.array(z.object({
      campo: z.string(),
      valor: z.string(),
      unidad: z.string().optional(),
      pagina: z.number().int().positive(),
      /** Sin cita literal el campo se descarta. No es negociable. */
      citaLiteral: z.string().min(1).max(500),
    })),
  }),
]);

export const Sugerencia = Base.extend({
  tipo: z.literal('sugerencia'),
  solicitudId: Id,
  casoDeUso: CasoDeUso,
  contenido: ContenidoSugerencia,
  /** El desenlace humano. Sin este campo no hay métrica de acierto — y sin métrica, no hay derecho a usar el subsistema. */
  decision: z.enum(['pendiente', 'aceptada', 'editada', 'rechazada']).default('pendiente'),
  revisadoPor: Uid.optional(),
  revisadoEn: Instante.optional(),
  /** Qué cambió la persona respecto de lo que propuso el modelo. */
  diffHumano: z.string().max(8000).optional(),
});

/** Lo ÚNICO que el cliente puede escribir en una sugerencia: su veredicto. Jamás el contenido. */
export const Sugerencia_Cliente = z.object({
  decision: z.enum(['aceptada', 'editada', 'rechazada']),
  diffHumano: z.string().max(8000).optional(),
}).strict();

// ── Bitácora de llamadas ────────────────────────────────────────────────────

/**
 * Escritura ÚNICA: las reglas no permiten modificar ni borrar, ni al
 * administrador. Es lo que hace defendible el sistema el día que alguien
 * pregunte por qué el modelo dijo lo que dijo.
 */
export const LlamadaIA = z.object({
  id: Id,
  orgId: z.string(),
  uid: Uid,
  rol: z.string(),
  casoDeUso: CasoDeUso,
  en: Instante,

  /** Identificador EXACTO y fechado. Un alias tipo "el último" vuelve irreproducible el histórico. */
  modelo: z.string().min(1),
  promptVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  promptSha256: z.string().regex(/^[a-f0-9]{64}$/),
  esquemaVersion: z.string(),
  versionNucleo: z.string(),
  versionContrato: z.string(),
  temperatura: z.number().min(0).max(1),
  maxTokens: z.number().int().positive(),

  /** Referencias y hashes. NUNCA los bytes, nunca identificadores de cliente. */
  entradaRefs: z.array(z.string()),
  entradaSha256: z.string().regex(/^[a-f0-9]{64}$/),

  salidaCruda: z.string().optional(),
  stopReason: z.string().optional(),
  esquemaValido: z.boolean(),

  tokensEntrada: z.number().int().nonnegative(),
  tokensSalida: z.number().int().nonnegative(),
  costoEstimadoUsd: z.number().nonnegative(),
  latencia_ms: z.number().int().nonnegative(),

  desenlaceHumano: z.enum(['pendiente', 'aceptada', 'editada', 'rechazada']).default('pendiente'),
});

// ── Presupuesto ─────────────────────────────────────────────────────────────

/** Los cuatro peldaños que APAGAN. Se prefiere el servicio que apaga al que cobra. */
export const PELDANOS = Object.freeze({
  topeDiarioProyectoUsd: 3.0,
  topeDiarioUsuarioUsd: 0.5,
  llamadasDiaUsuario: 40,
  llamadasHoraUsuario: 8,
  topeMensualProdUsd: 60.0,
  topeMensualDevUsd: 15.0,
});

export const PresupuestoDia = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  orgId: z.string(),
  gastadoUsd: z.number().nonnegative(),
  llamadas: z.number().int().nonnegative(),
  /** Se apaga el caso caro (visión) al 80 %, antes de tocar el resto. */
  visionApagada: z.boolean().default(false),
  todoApagado: z.boolean().default(false),
});

export type CasoDeUso = z.infer<typeof CasoDeUso>;
export type SolicitudIA = z.infer<typeof SolicitudIA>;
export type Sugerencia = z.infer<typeof Sugerencia>;
export type LlamadaIA = z.infer<typeof LlamadaIA>;
