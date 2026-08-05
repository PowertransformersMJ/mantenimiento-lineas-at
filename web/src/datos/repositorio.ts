// ============================================================================
// datos/repositorio.ts — de dónde salen los datos de la aplicación
// ----------------------------------------------------------------------------
// REGLA (orden del Ingeniero, 2026-07-29): en esta página NO hay datos
// inventados. Todo lo que se muestre sale de un levantamiento real.
//
// Y su consecuencia arquitectónica: como el sitio publicado es PÚBLICO y sin
// sesión, los datos reales NO pueden viajar dentro del paquete que se sube a
// internet — son coordenadas de infraestructura de un cliente. Llegan por
// lectura autenticada contra la base, después de iniciar sesión.
//
// Por eso el estado inicial de la página es VACÍO, y eso no es un defecto: es
// la única forma honesta de cumplir las dos cosas a la vez.
//
// Este módulo es AGNÓSTICO a la interfaz: no toca el DOM. Si mañana cambia el
// framework de pantallas, esto sobrevive intacto.
// ============================================================================
import type { AccionCapa, Apoyo, AnalisisCausa, Conductor, Evidencia, Hipotesis, Investigacion, Linea, SondeoClima } from '@lineas/contratos';

export type EstadoSesion =
  | { fase: 'comprobando' }
  | { fase: 'sin_sesion' }
  | { fase: 'autenticado'; uid: string; correo: string | null };

export type EstadoDatos =
  | { fase: 'sin_sesion' }
  | { fase: 'cargando' }
  | { fase: 'vacio' }
  /**
   * `investigaciones` puede venir vacío: una línea sin eventos es lo normal.
   *
   * `lineas` es el PARQUE: todas las que el usuario tiene permiso de ver, para
   * que la columna izquierda las liste. Es opcional porque quien la rellena es
   * `enlace.ts` —que ya las pidió para saber cuál abrir y hasta ahora las
   * tiraba—, no cada implementación del repositorio. Si falta, la pantalla
   * lista únicamente la línea abierta: no se inventa un parque que no consta.
   */
  | { fase: 'listo'; linea: Linea; apoyos: Apoyo[]; conductor: Conductor; hipotesis: Hipotesis; investigaciones: Investigacion[]; evidencias: Evidencia[]; lineas?: Linea[] }
  | { fase: 'error'; mensaje: string };

/**
 * EL SEGMENTO RCA — estado propio, a propósito.
 *
 * Va aparte de `EstadoDatos` y no dentro, aunque tentaba: si el análisis
 * reemplazara el estado de la línea, salir del RCA obligaría a recargarla desde
 * la base. Aquí conviven, y volver al parque es instantáneo.
 *
 * Sigue habiendo UN solo almacén y UN solo puente (ADR-005): lo que la regla
 * prohíbe es que cada componente se suscriba por su cuenta o que haya dos copias
 * del MISMO dato — no que el almacén sepa de dos cosas distintas.
 */
export type EstadoRca =
  | { fase: 'cerrado' }                                   // el segmento no está abierto
  | { fase: 'cargando' }
  | { fase: 'indice'; analisis: AnalisisCausa[] }
  | { fase: 'abierto'; analisis: AnalisisCausa; indice: AnalisisCausa[]; evidencias: Evidencia[]; acciones: AccionCapa[]; sondeos: SondeoClima[] }
  | { fase: 'error'; mensaje: string };

/**
 * Contrato del repositorio. Hoy solo existe la implementación que reporta
 * "sin sesión"; cuando Firestore esté habilitado entra la real detrás de esta
 * misma interfaz, sin tocar la capa de pantallas.
 */
export interface Repositorio {
  sesion(): Promise<EstadoSesion>;
  /** Líneas que el usuario autenticado tiene permiso de ver. */
  listarLineas(): Promise<Linea[]>;
  cargarLinea(lineaId: string): Promise<EstadoDatos>;
  /** Los análisis de causa raíz de la organización. Vacío es un resultado válido. */
  listarAnalisis(): Promise<AnalisisCausa[]>;
  /** Abre un análisis. Devuelve su id, o `null` si no hay sesión u organización. */
  crearAnalisis(datos: { titulo: string; lineaId?: string; apoyoId?: string; investigacionId?: string; sinActivo?: string }): Promise<string | null>;
  /**
   * Guarda una PARTE completa del análisis (las espinas, las cadenas, el árbol,
   * las hipótesis…). Cada parte se manda entera, nunca a trozos: son listas con
   * sentido propio y guardarlas por pedazos abriría un estado a medias entre dos
   * escrituras.
   */
  guardarParte(analisisId: string, parche: Record<string, unknown>, revision: number): Promise<void>;
  /** Las evidencias que un análisis puede enlazar: las de sus investigaciones y las suyas propias. */
  evidenciasDeAnalisis(analisisId: string, investigacionIds: string[]): Promise<Evidencia[]>;

  /**
   * Las acciones CAPA de un análisis. Viven en su PROPIA colección, no dentro
   * del análisis: una acción sigue ejecutándose meses después de que el informe
   * se firme, y con las acciones dentro del documento habría que elegir entre
   * congelar el razonamiento o dejarlo editable. Se pueden las dos cosas.
   */
  listarAcciones(analisisId: string): Promise<AccionCapa[]>;
  /** Da de alta una acción. Nace `propuesta` y sin barrera: nada se presupone. */
  crearAccion(analisisId: string, datos: { clase: 'correctiva' | 'preventiva'; que: string }): Promise<string | null>;
  /** Guarda un cambio de una acción. Se valida contra el contrato antes de escribir. */
  guardarAccion(accionId: string, parche: Record<string, unknown>, revision: number): Promise<void>;

  /** Los sondeos de clima ya guardados de un análisis. */
  listarSondeos(analisisId: string): Promise<SondeoClima[]>;
  /**
   * Congela un sondeo en el expediente.
   *
   * NO es una caché: es un HECHO FECHADO. Si mañana IDEAM corrige la serie, el
   * informe firmado tiene que seguir mostrando lo que se consultó el día que se
   * firmó — por eso las reglas hacen `sondeos_clima` inmutable: se crea y no se
   * actualiza, ni por el administrador.
   */
  guardarSondeo(analisisId: string, sondeo: Record<string, unknown>): Promise<string | null>;
}

/**
 * Implementación provisional. No inventa nada: declara que no hay sesión.
 * Se sustituye por la de Firestore en cuanto la base esté creada.
 */
export const repositorioSinSesion: Repositorio = {
  async sesion() {
    return { fase: 'sin_sesion' };
  },
  async listarLineas() {
    return [];
  },
  async cargarLinea() {
    return { fase: 'sin_sesion' };
  },
  async listarAnalisis() {
    return [];
  },
  async crearAnalisis() {
    return null;
  },
  async guardarParte() {
    /* sin sesión no se escribe nada */
  },
  async evidenciasDeAnalisis() {
    return [];
  },
  async listarAcciones() {
    return [];
  },
  async crearAccion() {
    return null;
  },
  async guardarAccion() {
    /* sin sesión no se escribe nada */
  },
  async listarSondeos() {
    return [];
  },
  async guardarSondeo() {
    return null;
  },
};

export let repositorio: Repositorio = repositorioSinSesion;

/** Punto único de sustitución cuando entre Firestore. */
export function usarRepositorio(r: Repositorio): void {
  repositorio = r;
}
