// ============================================================================
// exportar/gpx.js — GPX 1.1: waypoints + track, como el módulo original
// ----------------------------------------------------------------------------
// Mismo esqueleto que el exportador del módulo de campo (gpx 1.1 topografix,
// wpt + trk) con las precisiones idénticas (lat/lon a 6, cota a 3), y las
// mejoras de la auditoría 2026-07-30:
//   · <metadata><time> = instante de GENERACIÓN (así dos exportes se
//     distinguen); el rango del levantamiento va en la descripción.
//   · <bounds> del recorrido (BaseCamp y QGIS encuadran solos).
//   · un <trkseg> por JORNADA de levantamiento, no una traza única.
//   · <sym> y <type> distintos para estructura y empalme — en el GPS se ven
//     distintos, que es donde importa.
//   · la distancia GPS al punto anterior NUNCA se pierde: si difiere del vano
//     real (porque el punto anterior es un empalme), se declara con su nombre.
//   · bloque de procedencia (versión del exportador, sistema, precisión).
//
// Orden de elementos según el esquema GPX 1.1 (ele, time, name, desc, src,
// sym, type): un archivo que no valida contra el XSD no abre en el equipo
// del cliente.
//
// JavaScript puro: sin DOM. Devuelve el texto del archivo.
// ============================================================================
import { bloqueProcedencia } from './procedencia.js';

/** @typedef {import('./levantamiento.js').PuntoExportacion} PuntoExportacion */

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Jornada = fecha local de la toma; los puntos sin hora heredan la jornada abierta. */
const jornadaDe = (p) => p.local?.slice(0, 10) ?? null;

/**
 * @param {{ codigo: string, nombre?: string, tensionNominal_kV?: number, propietario?: string }} linea
 * @param {ReturnType<import('./levantamiento.js').derivarLevantamiento>} lev
 * @param {{ generadoEn?: string, generadoPor?: string, hipotesisNombre?: string }} [meta]
 * @returns {string}
 */
export function generarGpx(linea, lev, meta = {}) {
  const { puntos } = lev;
  const N = puntos.length;
  const jornadas = [...new Set(puntos.map(jornadaDe).filter(Boolean))];

  const g = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Mantenimiento Lineas AT" ' +
      'xmlns="http://www.topografix.com/GPX/1/1" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
      'xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
  ];

  const desc = bloqueProcedencia(linea, lev, meta).join(' | ') +
    (jornadas.length ? ` | Jornadas de levantamiento: ${jornadas.join(', ')}` : '');
  g.push('<metadata>' +
    `<name>${esc(linea.codigo)} — levantamiento de campo</name>` +
    `<desc>${esc(desc)}</desc>` +
    (meta.generadoEn ? `<time>${esc(meta.generadoEn)}</time>` : '') +
    (N ? `<bounds minlat="${Math.min(...puntos.map((p) => p.lat)).toFixed(6)}"` +
         ` minlon="${Math.min(...puntos.map((p) => p.lon)).toFixed(6)}"` +
         ` maxlat="${Math.max(...puntos.map((p) => p.lat)).toFixed(6)}"` +
         ` maxlon="${Math.max(...puntos.map((p) => p.lon)).toFixed(6)}"/>` : '') +
    '</metadata>');

  for (const p of puntos) {
    const esEstructura = p.tipo === 'Estructura';
    const partes = [`Punto ${p.n}/${N}`];
    if (esEstructura && p.indiceEstructura != null) {
      partes.push(`Estructura ${p.indiceEstructura} de ${lev.nEstructuras}`);
      if (p.funcionEstructural) {
        partes.push(`Función: ${p.funcionEstructural}${p.esAncla ? ' — corta tramo de tensión' : ''}`);
      }
      if (p.deflexion_grados != null) partes.push(`Deflexión ${p.deflexion_grados.toFixed(2)} deg`);
    }
    if (p.cota_m != null) {
      partes.push(`Cota GPS ${p.cota_m.toFixed(1)} m (referencial${p.precision_m != null ? `, ±${p.precision_m} m` : ''})`);
    }
    if (p.local) partes.push(`Hora local ${p.local.slice(11, 19)}`);
    if (esEstructura) {
      if (p.vanoAnterior_m != null) {
        partes.push(`Vano anterior ${p.vanoAnterior_m.toFixed(2)} m desde ${p.vanoDesde}`);
        partes.push(`Az ${p.azimut_deg.toFixed(1)} deg`);
      }
      // La medición del GPS no se pierde: si difiere del vano real es porque
      // el punto anterior del recorrido fue un empalme, y se dice.
      if (p.distPuntoAnterior_m != null && p.vanoAnterior_m != null &&
          Math.abs(p.distPuntoAnterior_m - p.vanoAnterior_m) > 0.005) {
        partes.push(`Dist. GPS al punto anterior ${p.distPuntoAnterior_m.toFixed(2)} m (el punto anterior es un empalme)`);
      }
      if (p.progresiva_m != null) partes.push(`Prog ${p.progresiva_m.toFixed(2)} m`);
    } else {
      partes.push(`${p.tipo} — no es apoyo`);
      if (p.enVano) partes.push(`Dentro del vano ${p.enVano}`);
      if (p.distPuntoAnterior_m != null) partes.push(`Dist. al punto anterior ${p.distPuntoAnterior_m.toFixed(2)} m`);
    }
    if (p.nombre !== p.nombreCampo) partes.push(`Nombre GPX original: ${p.nombreCampo}`);

    g.push(
      `<wpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">` +
        (p.cota_m != null ? `<ele>${p.cota_m.toFixed(3)}</ele>` : '') +
        (p.utc ? `<time>${esc(p.utc)}</time>` : '') +
        `<name>${esc(p.nombre)}</name>` +
        `<desc>${esc(partes.join(' | '))}</desc>` +
        (p.metodo ? `<src>${esc(p.metodo)}</src>` : '') +
        `<sym>${esEstructura ? 'Flag, Blue' : 'Circle, Green'}</sym>` +
        `<type>${esc(p.tipo)}</type>` +
        '</wpt>',
    );
  }

  g.push(`<trk><name>${esc(linea.codigo)} — traza del recorrido</name>`);
  let jornadaAbierta = null;
  let segAbierto = false;
  for (const p of puntos) {
    const j = jornadaDe(p);
    if (!segAbierto || (j !== null && jornadaAbierta !== null && j !== jornadaAbierta)) {
      if (segAbierto) g.push('</trkseg>');
      g.push('<trkseg>');
      segAbierto = true;
    }
    if (j !== null) jornadaAbierta = j;
    g.push(
      `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">` +
        (p.cota_m != null ? `<ele>${p.cota_m.toFixed(3)}</ele>` : '') +
        (p.utc ? `<time>${esc(p.utc)}</time>` : '') +
        '</trkpt>',
    );
  }
  if (segAbierto) g.push('</trkseg>');
  g.push('</trk></gpx>');

  return g.join('\n');
}
