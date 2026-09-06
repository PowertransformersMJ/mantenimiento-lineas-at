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
import { Id } from './comunes.ts';
import { CasoDeUso, SolicitudIA_Cliente, Sugerencia_Cliente } from './ia.ts';

export * from './comunes.ts';
export * from './activos.ts';
export * from './eventos.ts';
export * from './ia.ts';
export * from './rca.ts';
export * from './acceso.ts';
export * from './cargabilidad.ts';
export * from './usuarios.ts';

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
// ⚠️ Se llamaba `FUNCIONES` y TAPABA —por orden de exportación— al catálogo de
// permisos `FUNCIONES` de `usuarios.ts`: `import { FUNCIONES } from '@lineas/contratos'`
// devolvía esto sin que TypeScript protestara (`99 §ADR-100`). Renombrado.
export const FUNCIONES_INVOCABLES = Object.freeze({
  crearSolicitudIA: { entrada: CrearSolicitudIA_Entrada, salida: CrearSolicitudIA_Salida },
  confirmarSugerencia: { entrada: ConfirmarSugerencia_Entrada, salida: ConfirmarSugerencia_Salida },
  estadoContrato: { entrada: z.object({}).strict(), salida: EstadoContrato_Salida },
});

// ── Colecciones ─────────────────────────────────────────────────────────────

/**
 * Diez tipos de documento, ni uno más en v1. La columna `escribeCliente` es
 * el contrato de seguridad: lo que el cliente NO puede tocar lo hace cumplir la
 * base de datos, no la buena voluntad del código.
 *
 * El décimo —`investigaciones`— entró el 2026-07-31 con su justificación
 * escrita: un expediente de falla (cronología, observaciones, hipótesis con
 * verosimilitud y verificaciones pendientes) no cabe en `hallazgos` sin borrar
 * la distinción entre lo que se VE y lo que se CONCLUYE, que es justo lo que
 * hace defendible el informe. Se declara aquí en vez de colarse en silencio.
 */
export const COLECCIONES = Object.freeze({
  lineas:        { escribeCliente: 'rol_editor' },
  apoyos:        { escribeCliente: 'rol_editor' },
  investigaciones: { escribeCliente: 'rol_editor' },
  inspecciones:  { escribeCliente: 'rol_cuadrilla' },
  evidencias:    { escribeCliente: 'rol_cuadrilla' },
  hallazgos:     { escribeCliente: 'solo_servidor' },  // ⛔ el modelo NUNCA
  calculos:      { escribeCliente: 'solo_servidor' },  // ⛔ el modelo NUNCA
  solicitudes_ia:{ escribeCliente: 'campos_limitados' },
  sugerencias:   { escribeCliente: 'solo_decision' },  // solo el veredicto humano
  llamadas_ia:   { escribeCliente: 'nadie' },          // escritura única, ni el admin
  /**
   * Los dos que entraron el 2026-08-04, con su justificación escrita — como se
   * hizo con el décimo, y por la misma razón: una colección que se cuela sin
   * argumento es una colección que nadie sabe defender.
   *
   * `analisis` NO cabe dentro de `investigaciones`, y no es una preferencia de
   * modelado: un expediente de falla es el HECHO —ocurrió en un apoyo de una
   * línea, y por eso `Investigacion` exige los dos—, mientras que un análisis de
   * causa raíz es el RAZONAMIENTO, y puede abarcar varias líneas o ninguna
   * todavía. Meterlo dentro haría INVISIBLE POR CONSTRUCCIÓN el patrón más caro
   * de un parque: el mismo componente fallando en apoyos de líneas distintas.
   *
   * `sondeos_clima` es aparte de `analisis` porque una consulta a IDEAM es un
   * HECHO FECHADO, no una caché: si mañana IDEAM corrige la serie, el informe
   * firmado tiene que seguir mostrando lo que se consultó el día que se firmó.
   * Por eso se crea y NO se actualiza — ni el admin.
   */
  analisis:      { escribeCliente: 'rol_editor' },
  sondeos_clima: { escribeCliente: 'rol_editor' },
});
