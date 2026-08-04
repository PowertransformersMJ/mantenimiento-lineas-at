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

export interface EjesDeLinea {
  /** Carga transversal sobre la estructura. */
  transversal: CargasEnPantalla;
  /** Carga longitudinal. `null` cuando no hay dos estructuras que comparar. */
  longitudinal: LongitudinalEnPantalla | null;
}

export function ejesDeLinea(
  apoyos: Apoyo[],
  conductor: Conductor,
  hipotesis: Hipotesis,
  circuitos?: number | null,
): EjesDeLinea {
  const transversal = cargasParaPantalla(
    apoyos, calcularTramos(apoyos, conductor, hipotesis), conductor, hipotesis, circuitos,
  );

  const E = soloEstructuras(apoyos);
  if (E.length < 2) return { transversal, longitudinal: null };

  const L = vanos(apoyos);
  const c = conductorParaNucleo(conductor);
  const p = paramsParaNucleo(hipotesis);
  const ricos = tramosDeTension(
    E.map((a) => ({ funcionEstructural: a.funcionEstructural, nombre: nombreVisible(a) })), L,
  ).map((t: { vanos: number[] }) => ({ ...t, estados: estadosDelTramo(t, c, p) }));

  return { transversal, longitudinal: longitudinalParaPantalla(apoyos, ricos, conductor) };
}
