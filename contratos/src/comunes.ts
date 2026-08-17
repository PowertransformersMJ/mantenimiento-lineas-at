// ============================================================================
// comunes.ts — piezas que comparten todos los documentos
// ----------------------------------------------------------------------------
// Reglas que vienen de los ADR y que aquí se vuelven tipos:
//   · ADR-001 — la identidad es un UUID inmutable, NUNCA el número "E07"
//   · ADR-001 — columna de organización desde el día 1, en TODAS las tablas
//   · ADR-001 — todo resultado guardado lleva con qué versión del motor y con
//               qué hipótesis se produjo
//   · ADR-002 — revisión base para detectar conflictos: se ACEPTA y se pone en
//               cuarentena, jamás se rechaza y descarta
// ============================================================================
import { z } from 'zod';

/**
 * Versión del contrato. Un cambio mayor obliga a desplegar las dos mitades a la vez.
 *
 * 0.2.0 — MENOR (solo campos opcionales añadidos, nada renombrado ni cambiado de
 * tipo): `Apoyo.alturaLibre_m` y `Apoyo.alturaAplicacion_m`, que son los dos
 * datos que le faltaban a `nucleo/cargas.js` para poder decir si un apoyo
 * aguanta. Un documento escrito con 0.1.0 sigue validando sin tocarlo.
 *
 * 0.3.0 — MENOR (un solo campo opcional añadido, nada renombrado ni cambiado de
 * tipo): `Apoyo.capacidadLongitudinal`, que es el dato que le faltaba a
 * `nucleo/longitudinal.js` para poder decir si un apoyo aguanta a lo LARGO de
 * la línea (ADR-012). Un documento escrito con 0.2.0 sigue validando sin
 * tocarlo. La cifra se imprime en el pie de la aplicación: si no se sube, la
 * pantalla declara una versión que ya no es la que valida.
 *
 * 0.4.0 — MENOR (colecciones nuevas y un campo opcional; nada renombrado ni
 * cambiado de tipo): entra el segmento RCA — `AnalisisCausa` y `SondeoClima` en
 * `rca.ts`— y `Evidencia.analisisId`, para que una fotografía pueda colgar
 * también de un análisis. `Investigacion` NO se toca: sigue exigiendo `lineaId`
 * y `apoyoId`, porque un expediente de HECHO sí ocurre en un sitio concreto.
 * Aflojar un `refine` solo admite más documentos: cero migración.
 *
 * 0.5.0 — MENOR (una restricción que se AFLOJA; nada renombrado ni cambiado de
 * tipo): `Apoyo.orden` deja de exigir entero. Sigue siendo `number` y sigue
 * siendo no negativo, así que los documentos escritos con 0.4.0 validan sin
 * tocarlos: cero migración de datos. Lo que habilita es intercalar un punto
 * nuevo por BISECCIÓN (orden 2,5 entre el 2 y el 3) en vez de renumerar la
 * línea entera, que reescribiría 26 documentos de producción y movería las
 * fotos de apoyo. ⚠️ El cambio es de UNA SOLA DIRECCIÓN: un documento con
 * `orden` fraccionario NO valida contra un bundle con el contrato anterior, y
 * se descarta en silencio. Hay que DESPLEGAR la web con esta versión ANTES de
 * sembrar ningún punto intercalado.
 */
export const VERSION_CONTRATO = '0.5.0';

// ── Identificadores ─────────────────────────────────────────────────────────

/**
 * Identidad de cualquier entidad del sistema. Es un UUID y es INMUTABLE.
 * Renumerar un apoyo, seccionar una línea o corregir una coordenada NO cambian
 * este valor: son hechos fechados que se registran aparte. Sin esto no hay
 * tendencia de corrosión, no hay defensa técnica ante el cliente, y no se puede
 * reproducir un informe emitido en 2026.
 */
export const Id = z.string().uuid();

/** A qué organización pertenece el dato. Hoy hay una sola; añadirla después sería una migración. */
export const OrgId = z.string().min(1).max(64);

/** Marca de tiempo en ISO 8601 con zona. Nunca se guarda una fecha sin zona. */
export const Instante = z.string().datetime({ offset: true });

/** Quién hizo algo. Es el uid de autenticación, no un nombre escrito a mano. */
export const Uid = z.string().min(1).max(128);

// ── Procedencia: de dónde salió cada dato ───────────────────────────────────

/**
 * Un dato de este sistema no vale lo mismo según de dónde venga. Guardarlo es
 * lo que permite defender un informe tres años después.
 */
export const Procedencia = z.enum([
  'levantamiento_campo',   // lo midió una cuadrilla
  'deducido_geometria',    // lo calculó el sistema a partir del GPS
  'catalogo_fabricante',   // viene de una hoja de datos
  'confirmado_humano',     // una persona con criterio lo validó
  'importado',             // vino de otro sistema
  'supuesto',              // ⚠️ nadie lo verificó — se arrastra como tal
]);

/** Sello que acompaña a TODO resultado calculado. Sin él, el resultado no es reproducible. */
export const SelloCalculo = z.object({
  versionNucleo: z.string().min(1),          // qué motor lo produjo
  hipotesisId: Id,                            // con qué hipótesis
  calculadoEn: Instante,
  /** El vano de cálculo empleado. Se guarda porque un VIR mal elegido invalida todo el tramo. */
  vanoCalculo_m: z.number().positive().optional(),
});

// ── Base de todo documento ──────────────────────────────────────────────────

export const Base = z.object({
  id: Id,
  orgId: OrgId,
  creadoEn: Instante,
  creadoPor: Uid,
  actualizadoEn: Instante.optional(),
  actualizadoPor: Uid.optional(),
  /**
   * Revisión que el cliente tenía cuando descargó el documento (ADR-002).
   * Si al subir no coincide con la del servidor, el evento NO se pierde: entra
   * en cuarentena y una persona resuelve. Rechazar y descartar convertiría un
   * problema de calidad de dato en pérdida de una jornada de campo.
   */
  revisionBase: z.number().int().nonnegative().optional(),
  revision: z.number().int().nonnegative().default(0),
});

// ── Máquina de estados de los trabajos de IA ────────────────────────────────

/**
 * Los cinco estados. El frontend los pinta TODOS desde el día 1 — es
 * exactamente donde el trabajo en paralelo se estrella: el front construye el
 * camino feliz, el back devuelve degradaciones, y juntarlos cuesta una semana.
 */
export const EstadoTrabajo = z.enum(['pendiente', 'en_proceso', 'listo', 'fallido', 'rechazado']);

/** Motivos de rechazo CERRADOS. No hay texto libre: si no está aquí, no existe. */
export const MotivoRechazo = z.enum([
  'presupuesto',        // se agotó el tope; ni siquiera se llamó al proveedor
  'entrada_invalida',   // lo que se mandó no cumple el contrato
  'esquema',            // el modelo respondió algo que no valida
  'no_disponible',      // el proveedor no respondió
]);

/** Transiciones permitidas. Cualquier otra es un error de programación, no un caso de negocio. */
export const TRANSICIONES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  pendiente: ['en_proceso', 'rechazado'],
  en_proceso: ['listo', 'fallido', 'rechazado'],
  listo: [],
  fallido: [],
  rechazado: [],
});

export function transicionValida(desde: string, hasta: string): boolean {
  return (TRANSICIONES[desde] ?? []).includes(hasta);
}

export type Id = z.infer<typeof Id>;
export type Instante = z.infer<typeof Instante>;
export type Procedencia = z.infer<typeof Procedencia>;
export type EstadoTrabajo = z.infer<typeof EstadoTrabajo>;
export type MotivoRechazo = z.infer<typeof MotivoRechazo>;
export type SelloCalculo = z.infer<typeof SelloCalculo>;
