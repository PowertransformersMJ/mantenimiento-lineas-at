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
export * from './levantamiento.ts';

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
 * EL CATÁLOGO DE COLECCIONES. La columna `escribeCliente` es el contrato de
 * seguridad: lo que el cliente NO puede tocar lo hace cumplir la base de datos,
 * no la buena voluntad del código.
 *
 * ⚠️ TIENE QUE ESTAR COMPLETO, y desde el 2026-09-17 hay una prueba que lo exige
 * (`tests/contrato-levantamiento.test.js`): toda colección de `firestore.rules`
 * está aquí, y toda fila de aquí tiene regla allí. Se cruzan en las DOS
 * direcciones porque los dos huecos duelen: una colección con regla y sin fila es
 * una puerta que el catálogo no conoce —así entró `levantamientos`, con su regla y
 * su índice escritos y sin declarar—, y una fila sin regla es una promesa de un
 * sitio donde no se puede escribir nada, porque `match /{document=**}` lo cierra
 * todo lo no declarado.
 *
 * Aquí se decía «diez tipos de documento, ni uno más en v1» cuando ya eran doce y
 * las reglas gobernaban veintiuna. El texto se corrige en vez de borrarse: lo que
 * valía de aquella frase —que una colección nueva se declara con su argumento, no
 * se cuela— sigue valiendo, y es lo que hicieron el décimo, el undécimo y el
 * duodécimo.
 *
 * El décimo —`investigaciones`— entró el 2026-07-31 con su justificación
 * escrita: un expediente de falla (cronología, observaciones, hipótesis con
 * verosimilitud y verificaciones pendientes) no cabe en `hallazgos` sin borrar
 * la distinción entre lo que se VE y lo que se CONCLUYE, que es justo lo que
 * hace defendible el informe. Se declara aquí en vez de colarse en silencio.
 *
 * ── QUÉ SIGNIFICA CADA VALOR DE `escribeCliente` ──────────────────────────
 *   · `rol_editor`       quien edita datos de línea, dentro de su alcance.
 *   · `rol_cuadrilla`    quien captura en campo.
 *   · `solo_admin`       hace falta ADEMÁS ser administrador de la organización.
 *   · `campos_limitados` el cliente escribe, pero solo una lista cerrada de campos.
 *   · `solo_decision`    solo el veredicto humano; el contenido es intocable.
 *   · `solo_servidor`    lo escribe una función del servidor, nunca el navegador.
 *   · `nadie`            escritura única o ninguna: ni el administrador.
 */
export const COLECCIONES = Object.freeze({
  lineas:        { escribeCliente: 'rol_editor' },
  apoyos:        { escribeCliente: 'rol_editor' },
  /**
   * EL RECORRIDO TAL CUAL LO TRAJO EL GPS (`contratos/src/levantamiento.ts`).
   * Faltaba en este catálogo aunque su regla (`firestore.rules §levantamientos`) y
   * su índice ya estaban escritos: exactamente el hueco que la prueba de abajo
   * cierra.
   *
   * `campos_limitados` y no `rol_editor`, porque el permiso es de dos tiempos: lo
   * CREA quien puede cargar puntos —la misma función `cp` que crea apoyos, porque
   * es el mismo acto—, pero después **solo se puede mover la nota**. Ni un punto
   * se reescribe y la fecha tampoco. Es un hecho fechado, no un borrador: lo que
   * el GPS midió ese día tiene que decir lo mismo dentro de seis años, cuando
   * alguien pregunte de dónde salió una distancia de un informe firmado.
   */
  levantamientos: { escribeCliente: 'campos_limitados' },
  /** Congelada = intocable: una hipótesis congelada ya respalda un informe firmado. */
  hipotesis:     { escribeCliente: 'rol_editor' },
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
  /** Lo que se decide hacer tras un análisis. Cuelga del análisis, no de una línea. */
  acciones_capa: { escribeCliente: 'rol_editor' },

  /**
   * Las que faltaban por declarar, y no porque fueran menores: las gobierna
   * `firestore.rules` desde hace meses y este catálogo no las nombraba, así que
   * quien lo leyera creería que el sistema tiene doce puertas cuando tiene
   * veintiuna. Se escriben con lo que la regla hace cumplir HOY, verificado línea
   * a línea, no con lo que se planeó.
   */

  /**
   * El interruptor de la IA y demás ajustes de operación. Lo escribe un
   * ADMINISTRADOR con la función `ce`; los dos cerrojos —`config/arranque` y
   * `config/limpieza`— quedan fuera de esa regla y **no los escribe nadie**:
   * borrar `arranque` rearmaría la coronación del propietario.
   */
  config:        { escribeCliente: 'solo_admin' },
  /**
   * El espejo del token, para que la pantalla pueda LISTAR personas. Lo escribe el
   * servidor, que salta las reglas; el navegador solo puede dejar en SU PROPIA
   * ficha `contrasenaCambiadaEn` y `ultimoAcceso`, y con la hora del servidor. Ni
   * su rol, ni su alcance, ni su nombre.
   */
  usuarios:      { escribeCliente: 'campos_limitados' },
  /**
   * Quién dio de alta a quién y quién cambió un permiso. La escribe SOLO el
   * servidor, con el actor sacado del token verificado: un registro que el
   * auditado puede firmar con el nombre de otro no es un registro de auditoría.
   */
  auditoria_accesos: { escribeCliente: 'nadie' },

  /**
   * CARGABILIDAD (`99 §ADR-088`). Las tres son de VOLUMEN —miles de mediciones de
   * operación al mes— y **solo las escribe un administrador**: la regla exige
   * `tiene('cc') && esAdmin()`, más estricto que editar un apoyo a propósito,
   * porque esto alimenta un dictamen.
   *
   * ⚠️ `ESCRIBE_CARGABILIDAD` (`cargabilidad.ts`) dice `'rol_editor'` y se queda
   * corto: eso es la función, no el rol. Aquí manda lo que hace cumplir la base.
   * Queda anotado en vez de tocarse, para que quien unifique las dos vea por qué
   * difieren. Los nombres de las tres los guarda `COLECCIONES_CARGABILIDAD`.
   */
  cargabilidad_dias:      { escribeCliente: 'solo_admin' },
  cargabilidad_resumenes: { escribeCliente: 'solo_admin' },
  /** De qué archivo salió cada cosa. Se crea y se queda: no se actualiza jamás. */
  cargabilidad_cargas:    { escribeCliente: 'solo_admin' },
});
