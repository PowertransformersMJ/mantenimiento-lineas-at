// ============================================================================
// @lineas/contratos — ÚNICA fuente de verdad del sistema
// ----------------------------------------------------------------------------
// De aquí salen: los tipos de las dos mitades, el validador del servidor, el
// esquema que se le impone al modelo y los datos de prueba. Nadie escribe tipos
// a mano en ninguno de los dos lados.
//
// Con Firestore NO hay una API que diseñar, y eso engaña: el frontend habla
// directo con la base. El contrato real son los esquemas, la máquina de estados
// y las reglas de seguridad. Si no se congelan antes de la primera línea de
// código, "trabajar en paralelo" son dos proyectos que se enteran en la semana
// 6 de que no encajan (ADR-004).
//
// EVOLUCIÓN
//   menor  → solo AÑADIR campos opcionales. Nunca renombrar, nunca cambiar tipo.
//   mayor  → único evento que obliga a desplegar las dos mitades a la vez.
//            Conviven 30 días. El cambio de contrato va en su propio commit y
//            se mergea ANTES que cualquier implementación.
// ============================================================================
import { z } from 'zod';
import { Id } from './comunes.js';
import { CasoDeUso, SolicitudIA_Cliente, Sugerencia_Cliente } from './ia.js';

export * from './comunes.js';
export * from './activos.js';
export * from './eventos.js';
export * from './ia.js';

// ── Las tres funciones invocables ───────────────────────────────────────────
// Solo `onCall`, jamás `onRequest` abierta. Con verificación de identidad y de
// aplicación antes de tocar la red (ADR-004).

export const CrearSolicitudIA_Entrada = SolicitudIA_Cliente;
export const CrearSolicitudIA_Salida = z.object({
  solicitudId: Id,
  /** true si la huella ya existía: se reusa y no se cobra dos veces. */
  reusada: z.boolean(),
});

export const ConfirmarSugerencia_Entrada = z.object({
  sugerenciaId: Id,
  veredicto: Sugerencia_Cliente,
}).strict();
export const ConfirmarSugerencia_Salida = z.object({
  /** Presente solo si el veredicto creó un hallazgo. */
  hallazgoId: Id.optional(),
});

export const EstadoContrato_Salida = z.object({
  versionContrato: z.string(),
  versionNucleo: z.string(),
  iaHabilitada: z.boolean(),
  presupuestoRestanteUsd: z.number().nonnegative(),
  casosDeUsoActivos: z.array(CasoDeUso),
});

/** Catálogo de las funciones. El cliente no llama nada que no esté aquí. */
export const FUNCIONES = Object.freeze({
  crearSolicitudIA: { entrada: CrearSolicitudIA_Entrada, salida: CrearSolicitudIA_Salida },
  confirmarSugerencia: { entrada: ConfirmarSugerencia_Entrada, salida: ConfirmarSugerencia_Salida },
  estadoContrato: { entrada: z.object({}).strict(), salida: EstadoContrato_Salida },
});

// ── Colecciones ─────────────────────────────────────────────────────────────

/**
 * Nueve tipos de documento, ni uno más en v1. La columna `escribeCliente` es
 * el contrato de seguridad: lo que el cliente NO puede tocar lo hace cumplir la
 * base de datos, no la buena voluntad del código.
 */
export const COLECCIONES = Object.freeze({
  lineas:        { escribeCliente: 'rol_editor' },
  apoyos:        { escribeCliente: 'rol_editor' },
  inspecciones:  { escribeCliente: 'rol_cuadrilla' },
  evidencias:    { escribeCliente: 'rol_cuadrilla' },
  hallazgos:     { escribeCliente: 'solo_servidor' },  // ⛔ el modelo NUNCA
  calculos:      { escribeCliente: 'solo_servidor' },  // ⛔ el modelo NUNCA
  solicitudes_ia:{ escribeCliente: 'campos_limitados' },
  sugerencias:   { escribeCliente: 'solo_decision' },  // solo el veredicto humano
  llamadas_ia:   { escribeCliente: 'nadie' },          // escritura única, ni el admin
});
