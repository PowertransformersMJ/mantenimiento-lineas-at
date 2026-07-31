// ============================================================================
// exportar/csv.js — CSV con separador ';', como el módulo original
// ----------------------------------------------------------------------------
// Conserva el contrato del original para que Excel en español lo abra bien:
// BOM UTF-8 + primera línea `sep=;` + CRLF + decimales con punto y toFixed
// idénticos (lat/lon 6, cota 3, distancias 2, azimut 2).
//
// Divergencia deliberada y documentada (ADR): el original llamaba
// "Vano_anterior_m" a la distancia entre puntos GPS consecutivos, empalmes
// incluidos — el error de dominio que este sistema corrigió. Aquí ese número
// se conserva ÍNTEGRO como `Dist_punto_anterior_m` (trazabilidad con el
// levantamiento) y `Vano_anterior_m` pasa a ser el vano REAL entre
// estructuras, el mismo que usan el cálculo y las demás pestañas.
//
// JavaScript puro: sin DOM. Devuelve el texto del archivo.
// ============================================================================

/** @typedef {import('./levantamiento.js').PuntoExportacion} PuntoExportacion */

/** Campo de texto: entre comillas, con las comillas internas dobladas. */
const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
/** Campo numérico: toFixed o vacío si no hay dato. Punto decimal, como el original. */
const num = (v, d) => (v == null ? '' : v.toFixed(d));

export const COLUMNAS_CSV = [
  'N', 'Tipo', 'Estructura', 'Nombre_GPX_original',
  'Latitud', 'Longitud', 'Lat_GMS', 'Lon_GMS',
  'Cota_GPS_m', 'Hora_local',
  'Dist_punto_anterior_m', 'Vano_anterior_m', 'Azimut_deg', 'Progresiva_m',
  'Dentro_del_vano',
];

/**
 * @param {ReturnType<import('./levantamiento.js').derivarLevantamiento>} lev
 * @returns {string}
 */
export function generarCsv(lev) {
  const r = ['sep=;', COLUMNAS_CSV.join(';')];

  for (const p of lev.puntos) {
    r.push([
      p.n,
      q(p.tipo),
      q(p.nombre),
      q(p.nombreCampo),
      num(p.lat, 6),
      num(p.lon, 6),
      q(p.latGMS),
      q(p.lonGMS),
      num(p.cota_m, 3),
      q(p.local ?? ''),
      num(p.distPuntoAnterior_m, 2),
      num(p.vanoAnterior_m, 2),
      num(p.azimut_deg, 2),
      num(p.progresiva_m, 2),
      q(p.enVano ?? ''),
    ].join(';'));
  }

  return '﻿' + r.join('\r\n');
}
