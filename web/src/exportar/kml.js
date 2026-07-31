// ============================================================================
// exportar/kml.js — KML para Google Earth / QGIS, como el módulo original
// ----------------------------------------------------------------------------
// Misma organización que el exportador original: estilos arriba, una carpeta
// "Tramos" con las polilíneas (colores rotando, KML usa aabbggrr) y las
// carpetas de puntos con descripción rica en CDATA. Diferencias deliberadas y
// documentadas (ADR): los empalmes van en su PROPIA carpeta con el color
// morado que ya usaba el módulo original en el mapa (#b06bd6), y los tramos
// son los tramos de TENSIÓN reales del cálculo, no cortes visuales.
//
// JavaScript puro: sin DOM. Devuelve el texto del archivo.
// ============================================================================

/** @typedef {import('./levantamiento.js').PuntoExportacion} PuntoExportacion */

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Dentro de CDATA solo hay una secuencia prohibida: el cierre ']]>'. */
const cdata = (s) => `<![CDATA[${String(s).replace(/\]\]>/g, ']]&gt;')}]]>`;

// Colores de línea del original (formato KML aabbggrr), rotando cada 4 tramos.
const COLORES_TRAMO = ['ff3b3bd6', 'fff5b04b', 'ff6fc45b', 'ff1f7ad6'];

/**
 * @param {{ codigo: string, nombre?: string }} linea
 * @param {ReturnType<import('./levantamiento.js').derivarLevantamiento>} lev
 * @returns {string}
 */
export function generarKml(linea, lev) {
  const { puntos, tramos } = lev;
  const estructuras = puntos.filter((p) => p.tipo === 'Estructura');
  const empalmes = puntos.filter((p) => p.tipo !== 'Estructura');

  const k = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>',
    `<name>${esc(linea.codigo)} — levantamiento de campo</name>`,
    `<description>${esc(`${linea.nombre ?? linea.codigo} · ${lev.nEstructuras} estructuras + ${lev.nEmpalmes} empalmes · ${tramos.length} tramos de tensión · generado desde los datos del sistema`)}</description>`,
    // Estructura: banderín azul (como el original). Empalme: morado, el mismo
    // color con que el módulo original los pintaba en el mapa (#b06bd6).
    '<Style id="wp"><IconStyle><color>ff1e6feb</color><Icon><href>http://maps.google.com/mapfiles/kml/paddle/blu-circle.png</href></Icon></IconStyle><LabelStyle><scale>0.85</scale></LabelStyle></Style>',
    '<Style id="emp"><IconStyle><color>ffd66bb0</color><Icon><href>http://maps.google.com/mapfiles/kml/paddle/purple-circle.png</href></Icon></IconStyle><LabelStyle><scale>0.85</scale></LabelStyle></Style>',
  ];
  tramos.forEach((_, i) => {
    k.push(`<Style id="l${i}"><LineStyle><color>${COLORES_TRAMO[i % COLORES_TRAMO.length]}</color><width>5</width></LineStyle></Style>`);
  });

  // ── Tramos de tensión: la traza pasa por TODOS los puntos levantados ──────
  k.push('<Folder><name>Tramos de tensión</name>');
  tramos.forEach((t, i) => {
    const co = t.puntos.map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)},0`).join(' ');
    k.push(
      `<Placemark><name>Tramo ${t.n} · ${esc(t.desde)} → ${esc(t.hasta)} (${t.longitud_m.toFixed(0)} m)</name>` +
        `<description>${esc(`${t.nVanos} vano(s) reales entre estructuras`)}</description>` +
        `<styleUrl>#l${i}</styleUrl>` +
        `<LineString><tessellate>1</tessellate><coordinates>${co}</coordinates></LineString></Placemark>`,
    );
  });
  k.push('</Folder>');

  const ficha = (p) => {
    let h = `<b>${esc(p.nombre)}</b> — punto ${p.n}/${puntos.length}`;
    h += `<br>Lat ${p.latGMS}<br>Lon ${p.lonGMS}`;
    if (p.cota_m != null) h += `<br>Cota GPS: ${p.cota_m.toFixed(2)} m (referencial)`;
    if (p.local) h += `<br>Hora local: ${p.local}`;
    if (p.tipo === 'Estructura') {
      if (p.vanoAnterior_m != null) {
        h += `<br>Vano anterior: ${p.vanoAnterior_m.toFixed(2)} m (desde ${esc(p.vanoDesde)})`;
        h += `<br>Azimut: ${p.azimut_deg.toFixed(2)}&deg;`;
      }
      if (p.progresiva_m != null) h += `<br>Progresiva: ${p.progresiva_m.toFixed(2)} m`;
    } else {
      h += `<br><b>${esc(p.tipo)} — no es apoyo</b>`;
      if (p.enVano) h += `<br>Dentro del vano: ${esc(p.enVano)}`;
      if (p.distPuntoAnterior_m != null) h += `<br>Dist. al punto anterior: ${p.distPuntoAnterior_m.toFixed(2)} m`;
    }
    if (p.nombre !== p.nombreCampo) h += `<br><i>Nombre GPX original: ${esc(p.nombreCampo)}</i>`;
    return h;
  };

  k.push('<Folder><name>Estructuras</name>');
  for (const p of estructuras) {
    k.push(
      `<Placemark><name>${esc(p.nombre)}</name><description>${cdata(ficha(p))}</description>` +
        `<styleUrl>#wp</styleUrl><Point><coordinates>${p.lon.toFixed(6)},${p.lat.toFixed(6)},0</coordinates></Point></Placemark>`,
    );
  }
  k.push('</Folder>');

  if (empalmes.length) {
    k.push('<Folder><name>Empalmes (no son apoyos)</name>');
    for (const p of empalmes) {
      k.push(
        `<Placemark><name>${esc(p.nombre)}</name><description>${cdata(ficha(p))}</description>` +
          `<styleUrl>#emp</styleUrl><Point><coordinates>${p.lon.toFixed(6)},${p.lat.toFixed(6)},0</coordinates></Point></Placemark>`,
      );
    }
    k.push('</Folder>');
  }

  k.push('</Document></kml>');
  return k.join('\n');
}
