// ============================================================================
// nucleo/estadisticas.js — estadística descriptiva de los vanos de una línea
// ----------------------------------------------------------------------------
// Funciones PURAS. Alimentan el panel "Distribución de vanos" y, más adelante,
// el informe. Los números que salen de aquí se contrastaron uno a uno con el
// módulo de campo original (docs/40 §10).
//
// ⚠️ La desviación estándar es la de MUESTRA (divide entre n−1), porque es la
// que usa el módulo original que el Ingeniero ya validó. Para una enumeración
// completa de los vanos la de población sería defendible; queda anotado en
// docs/40 §10 y aquí para que nadie lo "corrija" sin saber por qué está así.
// ============================================================================

/**
 * Estadística de una lista de vanos (metros).
 *
 * @param {number[]} vanos  longitudes de vano, en el orden de la línea
 * @returns {null | {
 *   n: number, suma: number, promedio: number,
 *   maximo: number, indiceMaximo: number,
 *   minimo: number, indiceMinimo: number,
 *   mediana: number, desviacionEstandar: number,
 *   coeficienteVariacion_pct: number, relacionMaxMin: number,
 * }}
 */
export function estadisticasVanos(vanos) {
  const v = (vanos ?? []).filter((x) => Number.isFinite(x) && x > 0);
  if (!v.length) return null;

  const n = v.length;
  const suma = v.reduce((s, x) => s + x, 0);
  const promedio = suma / n;

  let indiceMaximo = 0, indiceMinimo = 0;
  v.forEach((x, i) => {
    if (x > v[indiceMaximo]) indiceMaximo = i;
    if (x < v[indiceMinimo]) indiceMinimo = i;
  });

  const orden = [...v].sort((a, b) => a - b);
  const mediana = n % 2
    ? orden[(n - 1) / 2]
    : (orden[n / 2 - 1] + orden[n / 2]) / 2;

  // Muestra (n−1); con un solo vano no hay dispersión que estimar.
  const desviacionEstandar = n > 1
    ? Math.sqrt(v.reduce((s, x) => s + (x - promedio) ** 2, 0) / (n - 1))
    : 0;

  return {
    n,
    suma,
    promedio,
    maximo: v[indiceMaximo],
    indiceMaximo,
    minimo: v[indiceMinimo],
    indiceMinimo,
    mediana,
    desviacionEstandar,
    coeficienteVariacion_pct: (desviacionEstandar / promedio) * 100,
    relacionMaxMin: v[indiceMaximo] / v[indiceMinimo],
  };
}
