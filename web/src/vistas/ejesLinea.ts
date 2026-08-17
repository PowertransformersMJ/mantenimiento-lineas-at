// ============================================================================
// vistas/ejesLinea.ts — los DOS EJES de una línea, calculados en UN solo sitio
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. `Cargas.tsx` ya traía escrita la advertencia, y tenía razón:
//
//   «Los tramos NO se recalculan aquí: se piden a la misma función que alimenta
//    Mecánico y Viento. Si cada pestaña calculara su propio tiro, bastaría un
//    cambio en una para que la app se contradijera a sí misma ante el cliente.»
//
// Al llevar el cielo de la línea a la carcasa (F5) hacía falta la misma
// cobertura de veredicto que enseña la pestaña Cargas. Copiar allí las quince
// líneas de preparación —estructuras, vanos, tramos con estados ricos— habría
// creado exactamente la segunda fuente contra la que avisa ese comentario: dos
// sitios calculando la misma cifra, y un día distinta.
//
// Así que el cálculo se muda aquí y lo piden los dos. Un hecho, un dueño.
//
// El eje longitudinal necesita los tramos con sus estados RICOS (temperatura y
// carga unitaria incluidas): el núcleo rechaza la forma aplanada porque para
// RESTAR el tiro de dos tramos hay que poder comprobar que son comparables.
//
// Módulo PURO de presentación: no toca el DOM, ni la red, ni React. El cálculo
// es todo del núcleo; aquí solo se arma la entrada que el núcleo pide.
// ============================================================================
import type { Apoyo, Conductor, Hipotesis } from '@lineas/contratos';
import { tramosDeTension, estadosDelTramo } from '@lineas/nucleo/mecanica';
import { cargasParaPantalla, type CargasEnPantalla } from './cargasDatos';
import { longitudinalParaPantalla, type LongitudinalEnPantalla } from './longitudinalDatos';
import { calcularTramos, conductorParaNucleo, paramsParaNucleo } from './tramos';
import { soloEstructuras, vanos, nombreVisible } from './planta';
import { cobertura, type CoberturaDeEjes } from './coberturaEjes.ts';
import type { ContextoDeLinea } from './fichaEstructural.ts';

export interface EjesDeLinea {
  /** Carga transversal sobre la estructura. */
  transversal: CargasEnPantalla;
  /** Carga longitudinal. `null` cuando no hay dos estructuras que comparar. */
  longitudinal: LongitudinalEnPantalla | null;
}

/**
 * LOS DOS FORMATOS DE TRAMO QUE EL NÚCLEO PIDE, armados en UN solo sitio.
 *
 * Son dos y no uno por una razón del núcleo, no por comodidad: el eje
 * transversal trabaja con los tramos APLANADOS (`calcularTramos`), y el
 * longitudinal RESTA el tiro de dos tramos contiguos, para lo cual necesita
 * comprobar que vienen de la misma temperatura y la misma carga unitaria —
 * datos que la forma aplanada no trae, y por eso el núcleo la rechaza.
 *
 * Se expone porque la ficha estructural necesita exactamente esta entrada para
 * calcular su antes/después (`vistas/fichaEstructural.ts`), y armarla allí sería
 * la segunda fuente contra la que avisa la cabecera de este archivo: pasarle los
 * aplanados al eje longitudinal NO da error — deja el eje sin un solo tiro, y el
 * panel diría «no se mueve nada» sobre el eje que la ficha existe para
 * desbloquear.
 */
export function contextoDeLinea(
  apoyos: Apoyo[],
  conductor: Conductor,
  hipotesis: Hipotesis,
  circuitos?: number | null,
): ContextoDeLinea {
  const E = soloEstructuras(apoyos);
  const tramosRicos = E.length < 2 ? [] : tramosDeTension(
    E.map((a) => ({ funcionEstructural: a.funcionEstructural, nombre: nombreVisible(a) })),
    vanos(apoyos),
  ).map((t: { vanos: number[] }) => ({
    ...t, estados: estadosDelTramo(t, conductorParaNucleo(conductor), paramsParaNucleo(hipotesis)),
  }));

  return {
    apoyos,
    tramos: calcularTramos(apoyos, conductor, hipotesis),
    tramosRicos,
    conductor,
    hipotesis,
    circuitos,
  };
}

export function ejesDeLinea(
  apoyos: Apoyo[],
  conductor: Conductor,
  hipotesis: Hipotesis,
  circuitos?: number | null,
): EjesDeLinea {
  const ctx = contextoDeLinea(apoyos, conductor, hipotesis, circuitos);
  const transversal = cargasParaPantalla(
    apoyos, ctx.tramos, conductor, hipotesis, circuitos,
  );

  // La condición se mantiene EXACTA —«menos de dos estructuras»— y no se sustituye
  // por «sin tramos ricos», que casi siempre coincide pero no siempre: una línea
  // con dos estructuras y ningún tramo pasaría de enseñar filas sin tiro a
  // declarar el eje entero inexistente, que son dos cosas distintas.
  if (soloEstructuras(apoyos).length < 2) return { transversal, longitudinal: null };

  return { transversal, longitudinal: longitudinalParaPantalla(apoyos, ctx.tramosRicos, conductor) };
}

/**
 * La cobertura de veredicto apoyo por apoyo, en los dos ejes.
 *
 * Existe aquí para que nadie tenga que saber de qué campo de qué eje sale el
 * veredicto: se pide a los ejes, que son su dueño. El cruce en sí lo hace
 * `coberturaEjes.ts`, que es el dueño ÚNICO de esa operación.
 *
 * `longitudinal: null` —una línea sin dos estructuras que comparar— NO se
 * convierte en «cero apoyos con veredicto longitudinal»: se pasa como el hueco
 * que es, y el dibujo lo declara en vez de pintar un carril de ceros que se
 * leería como «se comprobó y no cumple ninguno».
 */
export function coberturaDeEjes(ejes: EjesDeLinea): CoberturaDeEjes {
  return cobertura(ejes.transversal.filas, ejes.longitudinal?.filas ?? null);
}
