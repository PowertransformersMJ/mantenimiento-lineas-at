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
import { repositorio, usarRepositorio, type EstadoDatos } from './repositorio';

/**
 * Cambia el repositorio provisional por el real la primera vez que hace falta.
 * Va por importación diferida a propósito: el SDK de Firebase pesa 725 kB y no
 * debe descargarse solo por abrir la página.
 */
let conectado = false;
async function conectarBase(): Promise<void> {
  if (conectado) return;
  const { repositorioFirestore } = await import('./firestore');
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
  #oyentes = new Set<Oyente>();

  leer = (): EstadoDatos => this.#estado;

  suscribir = (o: Oyente): (() => void) => {
    this.#oyentes.add(o);
    return () => this.#oyentes.delete(o);
  };

  poner(e: EstadoDatos): void {
    this.#estado = e;
    for (const o of this.#oyentes) o();
  }

  /** Carga la línea que el usuario tenga permiso de ver. Nunca inventa nada. */
  async cargar(): Promise<void> {
    this.poner({ fase: 'cargando' });
    try {
      await conectarBase();
      // Si venimos de vuelta de Google por redirección, hay que recoger el
      // resultado ANTES de preguntar por la sesión.
      const { recogerRedireccion } = await import('./firebase');
      await recogerRedireccion();
      const s = await repositorio.sesion();
      if (s.fase !== 'autenticado') return this.poner({ fase: 'sin_sesion' });

      const lineas = await repositorio.listarLineas();
      if (!lineas.length) return this.poner({ fase: 'vacio' });

      this.poner(await repositorio.cargarLinea(lineas[0].id));
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
