// ============================================================================
// exportar/csv.js — CSV en DOS dialectos, porque un solo CSV miente en alguno
// ----------------------------------------------------------------------------
// Hallazgo de la auditoría 2026-07-30 (heredado del original): `sep=;` solo
// redefine el separador de COLUMNAS; el separador DECIMAL lo toma Excel de la
// configuración regional. En es-CO el decimal es la COMA, así que un CSV con
// punto decimal entra a Excel como texto. El original tenía este defecto; la
// web no lo hereda — emite dos dialectos desde las mismas filas:
//
//   · 'excel'  → para el Excel en español del ingeniero: BOM + `sep=;` + CRLF
//                + COMA decimal + renglones de procedencia arriba (con #).
//   · 'datos'  → RFC 4180 puro para QGIS/pandas/R: coma de columna, PUNTO
//                decimal, UTF-8 sin BOM, sin `sep=;`, sin renglones extra.
//
// Divergencia deliberada frente al original (ADR-006): `Dist_punto_anterior_m`
// conserva la medición GPS entre puntos consecutivos y `Vano_anterior_m` es el
// vano REAL entre estructuras — un empalme no es apoyo y no corta vanos.
//
// JavaScript puro: sin DOM. Devuelve el texto del archivo.
// ============================================================================
import { bloqueProcedencia } from './procedencia.js';

/** @typedef {import('./levantamiento.js').PuntoExportacion} PuntoExportacion */

export const COLUMNAS_CSV = [
  'N', 'Tipo', 'Estructura', 'Nombre_GPX_original',
  'Funcion_estructural', 'Corta_tramo', 'Deflexion_grados',
  'Latitud', 'Longitud', 'Lat_GMS', 'Lon_GMS',
  'Cota_GPS_m', 'Precision_m', 'Metodo', 'Sistema_referencia', 'Hora_local',
  'Dist_punto_anterior_m', 'Vano_anterior_m', 'Azimut_deg', 'Progresiva_m',
  'Dentro_del_vano',
];

/**
 * @param {ReturnType<import('./levantamiento.js').derivarLevantamiento>} lev
 * @param {{ dialecto?: 'excel'|'datos',
 *           linea?: { codigo: string, nombre?: string, tensionNominal_kV?: number, propietario?: string },
 *           generadoEn?: string, generadoPor?: string, hipotesisNombre?: string }} [opciones]
 * @returns {string}
 */
export function generarCsv(lev, opciones = {}) {
  const dialecto = opciones.dialecto ?? 'excel';
  const excel = dialecto === 'excel';
  const sep = excel ? ';' : ',';

  /** Texto: comillas dobladas (RFC 4180 en ambos dialectos). */
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  /** Número: toFixed; en el dialecto Excel el decimal es la COMA. */
  const num = (v, d) => (v == null ? '' : (excel ? v.toFixed(d).replace('.', ',') : v.toFixed(d)));

  const r = [];
  if (excel) {
    r.push('sep=;');
    if (opciones.linea) {
      for (const linea of bloqueProcedencia(opciones.linea, lev, opciones)) r.push(q('# ' + linea));
      r.push('');
    }
  }
  r.push(COLUMNAS_CSV.join(sep));

  for (const p of lev.puntos) {
    r.push([
      p.n,
      q(p.tipo),
      q(p.nombre),
      q(p.nombreCampo),
      q(p.funcionEstructural ?? ''),
      p.tipo === 'Estructura' ? (p.esAncla ? 'si' : 'no') : '',
      num(p.deflexion_grados, 2),
      num(p.lat, 6),
      num(p.lon, 6),
      q(p.latGMS),
      q(p.lonGMS),
      num(p.cota_m, 3),
      p.precision_m ?? '',
      q(p.metodo ?? ''),
      q(p.sistemaReferencia),
      q(p.local ?? ''),
      num(p.distPuntoAnterior_m, 2),
      num(p.vanoAnterior_m, 2),
      num(p.azimut_deg, 2),
      num(p.progresiva_m, 2),
      q(p.enVano ?? ''),
    ].join(sep));
  }

  return (excel ? '﻿' : '') + r.join('\r\n');
}
