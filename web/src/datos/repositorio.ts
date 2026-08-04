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
import type { Apoyo, AnalisisCausa, Conductor, Evidencia, Hipotesis, Investigacion, Linea } from '@lineas/contratos';

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
  | { fase: 'abierto'; analisis: AnalisisCausa; indice: AnalisisCausa[] }
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
};

export let repositorio: Repositorio = repositorioSinSesion;

/** Punto único de sustitución cuando entre Firestore. */
export function usarRepositorio(r: Repositorio): void {
  repositorio = r;
}
