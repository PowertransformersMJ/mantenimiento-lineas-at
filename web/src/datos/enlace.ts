// ============================================================================
// datos/enlace.ts — el ÚNICO puente entre los datos y las pantallas
// ----------------------------------------------------------------------------
// REGLA DE ADR-005: hay UNA sola forma de conectar la pantalla a los datos, y
// es ésta. Ningún componente se suscribe a Firestore por su cuenta, ninguno
// guarda una segunda copia del estado, y no hay una segunda capa de caché.
//
// Por qué `useSyncExternalStore` y no un estado de React: porque la verdad NO
// vive en React. Vive en la capa de datos, que es un módulo puro que no importa
// React y que sobrevive intacto si mañana cambiamos de framework. React solo
// se entera de que algo cambió y repinta.
//
// ⚠️ PROHIBIDO por ADR-005: el "estado optimista" de React para la cola de
// envíos. Esa herramienta está pensada para esperas de segundos contra un
// servidor; aquí la confirmación puede tardar DÍAS, y cualquier dato pendiente
// que solo viva en la memoria del framework DESAPARECE cuando el teléfono mata
// la pestaña — sin avisar, con el técnico en mitad de una inspección.
// ============================================================================
import { useSyncExternalStore } from 'react';
import type { Linea } from '@lineas/contratos';
import { cargarFirebase } from './cargar';
import { repositorio, usarRepositorio, type EstadoDatos, type EstadoRca } from './repositorio';
import { repositorioFirestore } from './firestore';

/**
 * Cambia el repositorio provisional por el real la primera vez que hace falta.
 * Va por importación diferida a propósito: el SDK de Firebase pesa 725 kB y no
 * debe descargarse solo por abrir la página.
 */
let conectado = false;
function conectarBase(): void {
  if (conectado) return;
  usarRepositorio(repositorioFirestore);
  conectado = true;
}

type Oyente = () => void;

/**
 * Almacén mínimo, fuera de React. Guarda el estado actual y avisa a quien
 * escuche. Es deliberadamente aburrido: cuanto menos haga, menos hay que
 * entender dentro de 18 meses.
 */
class Almacen {
  #estado: EstadoDatos = { fase: 'cargando' };
  /**
   * El segmento RCA vive AL LADO del estado de la línea, no dentro. Si lo
   * reemplazara, salir del análisis obligaría a recargar la línea desde la base.
   * Sigue habiendo un solo almacén y un solo puente (ADR-005).
   */
  #rca: EstadoRca = { fase: 'cerrado' };
  #oyentes = new Set<Oyente>();

  leer = (): EstadoDatos => this.#estado;

  suscribir = (o: Oyente): (() => void) => {
    this.#oyentes.add(o);
    return () => this.#oyentes.delete(o);
  };

  poner(e: EstadoDatos): void {
    this.#estado = e;
    this.#avisar();
  }

  #avisar(): void { for (const o of this.#oyentes) o(); }

  // ── El segmento RCA ───────────────────────────────────────────────────────

  leerRca = (): EstadoRca => this.#rca;

  #ponerRca(e: EstadoRca): void { this.#rca = e; this.#avisar(); }

  /** Abre el segmento y trae el índice. El estado de la línea NO se toca. */
  async abrirRca(): Promise<void> {
    this.#ponerRca({ fase: 'cargando' });
    try {
      conectarBase();
      this.#ponerRca({ fase: 'indice', analisis: await repositorio.listarAnalisis() });
    } catch (e) {
      this.#ponerRca({ fase: 'error', mensaje: e instanceof Error ? e.message : 'no se pudo leer los análisis' });
    }
  }

  /** Abre un análisis del índice. No vuelve a consultar: ya está en memoria. */
  verAnalisis(id: string): void {
    const r = this.#rca;
    const indice = r.fase === 'indice' ? r.analisis : r.fase === 'abierto' ? r.indice : [];
    const a = indice.find((x) => x.id === id);
    if (a) this.#ponerRca({ fase: 'abierto', analisis: a, indice });
  }

  /** Vuelve al índice del segmento. */
  volverAlIndice(): void {
    const r = this.#rca;
    if (r.fase === 'abierto') this.#ponerRca({ fase: 'indice', analisis: r.indice });
  }

  /** Cierra el segmento y devuelve la pantalla a la línea, sin recargarla. */
  cerrarRca(): void { this.#ponerRca({ fase: 'cerrado' }); }

  /**
   * Abre un análisis desde un evento de falla y lo deja en pantalla.
   * Se relee el índice después de crear: así la lista y lo abierto no pueden
   * discrepar, que es como se acaba enseñando algo que ya no existe.
   */
  async crearRcaDesdeEvento(datos: { titulo: string; lineaId?: string; apoyoId?: string; investigacionId?: string }): Promise<void> {
    this.#ponerRca({ fase: 'cargando' });
    try {
      conectarBase();
      const id = await repositorio.crearAnalisis(datos);
      const indice = await repositorio.listarAnalisis();
      const a = indice.find((x) => x.id === id);
      this.#ponerRca(a ? { fase: 'abierto', analisis: a, indice } : { fase: 'indice', analisis: indice });
    } catch (e) {
      this.#ponerRca({ fase: 'error', mensaje: e instanceof Error ? e.message : 'no se pudo abrir el análisis' });
    }
  }

  /** Guarda la tabla de descartes y refresca lo que hay en pantalla. */
  async guardarEspinas(espinas: unknown[]): Promise<void> {
    const r = this.#rca;
    if (r.fase !== 'abierto') return;
    const previo = r.analisis;
    try {
      await repositorio.guardarEspinas(previo.id, espinas, previo.revision ?? 0);
      const indice = await repositorio.listarAnalisis();
      const a = indice.find((x) => x.id === previo.id);
      if (a) this.#ponerRca({ fase: 'abierto', analisis: a, indice });
    } catch (e) {
      this.#ponerRca({ fase: 'error', mensaje: e instanceof Error ? e.message : 'no se pudo guardar' });
    }
  }

  /** Carga la línea que el usuario tenga permiso de ver. Nunca inventa nada. */
  async cargar(): Promise<void> {
    this.poner({ fase: 'cargando' });
    try {
      conectarBase();
      // Si venimos de vuelta de Google por redirección, hay que recoger el
      // resultado ANTES de preguntar por la sesión.
      const { recogerRedireccion } = await cargarFirebase();
      await recogerRedireccion();
      const s = await repositorio.sesion();
      if (s.fase !== 'autenticado') return this.poner({ fase: 'sin_sesion' });

      const lineas = await repositorio.listarLineas();
      if (!lineas.length) return this.poner({ fase: 'vacio' });

      await this.abrir(lineas[0].id, lineas);
    } catch (e) {
      this.poner({ fase: 'error', mensaje: e instanceof Error ? e.message : 'error desconocido' });
    }
  }

  /**
   * Abre una línea del parque conservando la LISTA. Antes se pedía la lista
   * solo para saber cuál abrir y se tiraba; por eso la pantalla no podía
   * enseñar el parque. La lista viaja con el estado, no se vuelve a pedir.
   */
  async abrir(lineaId: string, lineas?: Linea[]): Promise<void> {
    const previo = this.#estado;
    const conocidas = lineas ?? (previo.fase === 'listo' ? previo.lineas : undefined);
    this.poner({ fase: 'cargando' });
    try {
      conectarBase();
      const e = await repositorio.cargarLinea(lineaId);
      this.poner(e.fase === 'listo' ? { ...e, lineas: conocidas } : e);
    } catch (e) {
      this.poner({ fase: 'error', mensaje: e instanceof Error ? e.message : 'error desconocido' });
    }
  }
}

export const almacen = new Almacen();

/** El único gancho que las pantallas usan para leer datos. */
export function useDatos(): EstadoDatos {
  return useSyncExternalStore(almacen.suscribir, almacen.leer, almacen.leer);
}

/** El gancho del segmento RCA. Misma suscripción, otro trozo del estado. */
export function useRca(): EstadoRca {
  return useSyncExternalStore(almacen.suscribir, almacen.leerRca, almacen.leerRca);
}
