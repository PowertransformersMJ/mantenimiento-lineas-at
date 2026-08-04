// ============================================================================
// vistas/vanosLinea.ts — los vanos de la línea, numerados de forma CORRIDA
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. La numeración corrida vivía atrapada dentro del componente
// que pinta la tabla «Vano a vano». El horizonte (F6) tiene que dibujar los
// mismos vanos y marcar los mismos fuera de banda — y si cada uno los numerase
// por su cuenta, «el vano 14» de la tabla y «el vano 14» del dibujo podrían no
// ser el mismo tramo de línea. Eso no es un fallo de pintura: es que el
// producto se contradice a sí mismo señalando un sitio distinto del que dice.
//
// `detalleVanos` del núcleo numera DENTRO de cada tramo de tensión, así que hay
// varios «vano 3». La numeración corrida sobre toda la línea es cosa de la
// presentación, y aquí es donde vive, con un solo dueño.
//
// Módulo PURO: no toca el DOM, ni la red, ni React. El cálculo es del núcleo.
// ============================================================================
import type { Apoyo, Conductor, Hipotesis } from '@lineas/contratos';
import { tramosDeTension, estadosDelTramo } from '@lineas/nucleo/mecanica';
import { detalleVanos, controlParabola, resumenConductor } from '@lineas/nucleo/vanos';
import { conductorParaNucleo, paramsParaNucleo } from './tramos';
import { soloEstructuras, vanos, nombreVisible } from './planta';

export interface FilaVano {
  n: number; a_m: number; relVir: number | null;
  flechaEds_m: number; flechaTMax_m: number; flechaTMin_m: number;
  longitudConductor_m: number; parametroC_m: number;
  /** `null` = no se pudo evaluar contra el VIR, que NO es lo mismo que «dentro». */
  fueraDeRango: boolean | null;
}

export interface VanosDeLinea {
  filas: (FilaVano & { tramo: number })[];
  res: { longitudTotal_m: number | null; factorCatenaria_pct: number | null };
  ctrl: { flechaCatenaria_m: number; flechaParabola_m: number; error_pct: number; aceptable: boolean } | null;
  /** El vano más largo. Existe siempre: sin filas la función devuelve null. */
  peor: FilaVano & { tramo: number };
}

export function vanosDeLinea(
  apoyos: Apoyo[], conductor: Conductor, hipotesis: Hipotesis,
): VanosDeLinea | null {
  const E = soloEstructuras(apoyos);
  if (E.length < 2) return null;

  const L = vanos(apoyos);
  const c = conductorParaNucleo(conductor);
  const p = paramsParaNucleo(hipotesis);
  const cortes = tramosDeTension(
    E.map((a) => ({ funcionEstructural: a.funcionEstructural, nombre: nombreVisible(a) })), L);

  // Se numera de forma CORRIDA sobre toda la línea: `detalleVanos` numera
  // dentro de cada tramo, y dos vanos con el mismo número confundirían al
  // que lee la tabla buscando "el vano 3".
  let corrido = 0;
  const filas: (FilaVano & { tramo: number })[] = [];
  cortes.forEach((t: { vanos: number[] }, i: number) => {
    const e = estadosDelTramo(t, c, p);
    for (const f of detalleVanos(t, c, e) as FilaVano[]) {
      filas.push({ ...f, n: ++corrido, tramo: i + 1 });
    }
  });
  if (!filas.length) return null;

  const res = resumenConductor(filas) as VanosDeLinea['res'];
  // Control de la simplificación parabólica en el vano MÁS LARGO, que es
  // donde el error es mayor: si ahí es admisible, lo es en toda la línea.
  const peor = filas.reduce((m, f) => (f.a_m > m.a_m ? f : m), filas[0]);
  const ctrl = peor ? controlParabola(peor.a_m, peor.parametroC_m) as VanosDeLinea['ctrl'] : null;

  return { filas, res, ctrl, peor };
}
