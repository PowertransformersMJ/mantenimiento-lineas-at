// ============================================================================
// nucleo/termica.js — resistencia y ampacidad del conductor
// ----------------------------------------------------------------------------
// Funciones PURAS. Implementa IEEE Std 738 en régimen permanente.
// Ver docs/40-DOMINIO-LINEAS-AT.md §4.
// ============================================================================

const RHO_COBRE_20 = 1.7241e-8;  // Ω·m — resistividad del cobre patrón a 20 °C
const FACTOR_CABLEADO = 1.02;    // los hilos van helicoidales: recorren más que el cable

/**
 * Propiedades eléctricas por material: [conductividad relativa al cobre,
 * coeficiente térmico de resistencia β en 1/°C].
 */
export const MATERIALES = {
  ACSR:          { conductividad: 0.610, beta: 0.00403, tMaxContinua: 75 },
  AAAC:          { conductividad: 0.525, beta: 0.00347, tMaxContinua: 90 },
  ACAR:          { conductividad: 0.570, beta: 0.00380, tMaxContinua: 90 },
  'ACSS / ACCC': { conductividad: 0.610, beta: 0.00403, tMaxContinua: 200 },
  Otro:          { conductividad: 0.600, beta: 0.00390, tMaxContinua: 75 },
};

/**
 * Resistencia en corriente continua a temperatura T.
 * @param seccion  mm²
 * @returns Ω/m  (multiplicar por 1000 para Ω/km)
 */
export function resistenciaDC({ material, seccion }, T) {
  const m = MATERIALES[material] ?? MATERIALES.Otro;
  const R20 = (RHO_COBRE_20 / m.conductividad / (seccion * 1e-6)) * FACTOR_CABLEADO;
  return R20 * (1 + m.beta * (T - 20));
}

/**
 * Ampacidad en régimen permanente — IEEE Std 738.
 *
 * Balance térmico: el calor generado por efecto Joule iguala lo evacuado por
 * convección y radiación, menos lo ganado del sol.
 *
 *     I = √( (qc + qr − qs) / R(Tc) )
 *
 * @param conductor {material, seccion (mm²), diametro (METROS)}
 * @param Tc  temperatura del conductor, °C
 * @param Ta  temperatura ambiente, °C
 * @param opciones.v      velocidad del viento perpendicular, m/s
 * @param opciones.eps    emisividad de la superficie (0,23 nuevo … 0,91 envejecido)
 * @param opciones.abso   absortividad solar (idem rango)
 * @param opciones.qs     radiación solar incidente, W/m²
 * @param opciones.he     altitud sobre el nivel del mar, m
 * @returns amperios (0 si el conductor no puede evacuar ni el aporte solar)
 */
export function ampacidad(conductor, Tc, Ta, { v = 0.61, eps = 0.5, abso = 0.5, qs = 1000, he = 0 } = {}) {
  const D = conductor.diametro;
  const Tf = (Tc + Ta) / 2;                       // temperatura de película
  const dT = Tc - Ta;

  // Propiedades del aire a Tf, corregidas por altitud
  const rho = (1.293 - 1.525e-4 * he + 6.379e-9 * he * he) / (1 + 0.00367 * Tf);
  const mu  = (1.458e-6 * (Tf + 273) ** 1.5) / (Tf + 383.4);
  const kf  = 2.424e-2 + 7.477e-5 * Tf - 4.407e-9 * Tf * Tf;
  const Re  = (D * rho * v) / mu;

  // Convección: se toma la MAYOR de las tres correlaciones (viento bajo,
  // viento alto, convección natural). Es lo que manda la norma.
  const qcVientoBajo = (1.01 + 1.35 * Re ** 0.52) * kf * dT;
  const qcVientoAlto = 0.754 * Re ** 0.60 * kf * dT;
  const qcNatural    = 3.645 * Math.sqrt(rho) * D ** 0.75 * Math.max(dT, 0) ** 1.25;
  const qc = Math.max(qcVientoBajo, qcVientoAlto, qcNatural);

  const qr = 17.8 * D * eps * (((Tc + 273) / 100) ** 4 - ((Ta + 273) / 100) ** 4);
  const qSolar = abso * qs * D;

  const neto = qc + qr - qSolar;
  if (neto <= 0) return 0;
  return Math.sqrt(neto / resistenciaDC(conductor, Tc));
}

/**
 * Temperatura límite de operación continua del material. Para el AAAC los
 * 90 °C vienen de la aleación 6201-T81: por encima pierde propiedades
 * mecánicas de forma PERMANENTE. No es conservadurismo de catálogo.
 */
export const temperaturaLimite = (material) =>
  (MATERIALES[material] ?? MATERIALES.Otro).tMaxContinua;

/**
 * Derrateo: cuánta capacidad se pierde respecto a una condición de referencia.
 * Útil para explicar por qué la ampacidad de placa engaña — un día en calma
 * le quita al conductor cerca de un tercio de su capacidad.
 */
export function derrateo(conductor, Tc, condicionReal, condicionReferencia) {
  const real = ampacidad(conductor, Tc, condicionReal.Ta, condicionReal);
  const ref  = ampacidad(conductor, Tc, condicionReferencia.Ta, condicionReferencia);
  return { real, referencia: ref, factor: ref > 0 ? real / ref : 0 };
}
