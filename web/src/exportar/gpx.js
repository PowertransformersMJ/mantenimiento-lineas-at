// ============================================================================
// exportar/gpx.js — GPX 1.1: waypoints + track, como el módulo original
// ----------------------------------------------------------------------------
// Mismo esqueleto que el exportador del módulo de campo (gpx 1.1 topografix,
// wpt con ele/time/name/desc/sym y un trk con la traza completa), pero generado
// desde los datos ya derivados en levantamiento.js. Precisiones idénticas al
// original: lat/lon a 6 decimales, cota a 3.
//
// JavaScript puro: sin DOM. Devuelve el texto del archivo.
// ============================================================================

/** @typedef {import('./levantamiento.js').PuntoExportacion} PuntoExportacion */

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * @param {{ codigo: string, nombre?: string }} linea
 * @param {ReturnType<import('./levantamiento.js').derivarLevantamiento>} lev
 * @returns {string}
 */
export function generarGpx(linea, lev) {
  const { puntos } = lev;
  const N = puntos.length;
  const primeraToma = puntos.find((p) => p.utc)?.utc ?? null;

  const g = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Mantenimiento Lineas AT" ' +
      'xmlns="http://www.topografix.com/GPX/1/1" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
      'xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
    '<metadata>' +
      `<name>${esc(linea.codigo)} — levantamiento de campo</name>` +
      `<desc>${esc(`${linea.nombre ?? linea.codigo} · ${lev.nEstructuras} estructuras + ${lev.nEmpalmes} empalmes · generado desde los datos del sistema, no desde la pantalla`)}</desc>` +
      (primeraToma ? `<time>${esc(primeraToma)}</time>` : '') +
      '</metadata>',
  ];

  for (const p of puntos) {
    const partes = [`Punto ${p.n}/${N}`];
    if (p.cota_m != null) partes.push(`Cota GPS ${p.cota_m.toFixed(1)} m (referencial)`);
    if (p.local) partes.push(`Hora local ${p.local.slice(11, 19)}`);
    if (p.tipo === 'Estructura') {
      if (p.vanoAnterior_m != null) {
        partes.push(`Vano anterior ${p.vanoAnterior_m.toFixed(2)} m desde ${p.vanoDesde}`);
        partes.push(`Az ${p.azimut_deg.toFixed(1)} deg`);
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
        '<sym>Flag, Blue</sym>' +
        '</wpt>',
    );
  }

  g.push(`<trk><name>${esc(linea.codigo)} — traza del recorrido</name><trkseg>`);
  for (const p of puntos) {
    g.push(
      `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">` +
        (p.cota_m != null ? `<ele>${p.cota_m.toFixed(3)}</ele>` : '') +
        (p.utc ? `<time>${esc(p.utc)}</time>` : '') +
        '</trkpt>',
    );
  }
  g.push('</trkseg></trk></gpx>');

  return g.join('\n');
}
