// ============================================================================
// exportar/kml.js — KML para Google Earth / QGIS, como el módulo original
// ----------------------------------------------------------------------------
// Misma organización que el exportador original: estilos arriba, una carpeta
// "Tramos" con las polilíneas (colores rotando, KML usa aabbggrr) y las
// carpetas de puntos con descripción rica en CDATA. Mejoras de la auditoría
// 2026-07-30:
//   · <Schema> + <ExtendedData> por punto: QGIS recibe una capa con ATRIBUTOS
//     reales (tipo, función, vano, azimut, progresiva, precisión), no un HTML.
//   · función estructural y deflexión en la ficha; el punto que corta tramo
//     lo dice.
//   · precisión GPS declarada con su advertencia.
//   · bloque de procedencia en la descripción del documento.
//
// Divergencias deliberadas (ADR-006): empalmes en su PROPIA carpeta con el
// morado del módulo original (#b06bd6); los tramos son los tramos de TENSIÓN
// reales del cálculo.
//
// JavaScript puro: sin DOM. Devuelve el texto del archivo.
// ============================================================================
import { bloqueProcedencia } from './procedencia.js';

/** @typedef {import('./levantamiento.js').PuntoExportacion} PuntoExportacion */

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Dentro de CDATA solo hay una secuencia prohibida: el cierre ']]>'. */
const cdata = (s) => `<![CDATA[${String(s).replace(/\]\]>/g, ']]&gt;')}]]>`;

// Colores de línea del original (formato KML aabbggrr), rotando cada 4 tramos.
const COLORES_TRAMO = ['ff3b3bd6', 'fff5b04b', 'ff6fc45b', 'ff1f7ad6'];

/** Campos que QGIS/Earth reciben como atributos de la capa. */
const CAMPOS_ESQUEMA = [
  ['tipo', 'string'], ['nombre_gpx_original', 'string'],
  ['funcion_estructural', 'string'], ['es_ancla', 'string'],
  ['deflexion_grados', 'double'], ['cota_gps_m', 'double'],
  ['hora_local', 'string'], ['dist_punto_anterior_m', 'double'],
  ['vano_anterior_m', 'double'], ['azimut_deg', 'double'],
  ['progresiva_m', 'double'], ['precision_m', 'double'], ['metodo', 'string'],
];

/**
 * @param {{ codigo: string, nombre?: string, tensionNominal_kV?: number, propietario?: string }} linea
 * @param {ReturnType<import('./levantamiento.js').derivarLevantamiento>} lev
 * @param {{ generadoEn?: string, generadoPor?: string, hipotesisNombre?: string }} [meta]
 * @returns {string}
 */
export function generarKml(linea, lev, meta = {}) {
  const { puntos, tramos } = lev;
  const estructuras = puntos.filter((p) => p.tipo === 'Estructura');
  const empalmes = puntos.filter((p) => p.tipo !== 'Estructura');

  const k = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>',
    `<name>${esc(linea.codigo)} — levantamiento de campo</name>`,
    `<description>${cdata(bloqueProcedencia(linea, lev, meta).join('\n'))}</description>`,
    // Esquema de atributos: lo que convierte el KML en una capa de datos.
    `<Schema name="levantamiento" id="esquemaLev">${CAMPOS_ESQUEMA
      .map(([n, t]) => `<SimpleField type="${t}" name="${n}"/>`).join('')}</Schema>`,
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

  const num = (v, d) => (v == null ? '' : v.toFixed(d));
  const datos = (p) => '<ExtendedData><SchemaData schemaUrl="#esquemaLev">' + [
    ['tipo', p.tipo], ['nombre_gpx_original', p.nombreCampo],
    ['funcion_estructural', p.funcionEstructural ?? ''],
    ['es_ancla', p.esAncla ? 'si' : 'no'],
    ['deflexion_grados', num(p.deflexion_grados, 2)], ['cota_gps_m', num(p.cota_m, 3)],
    ['hora_local', p.local ?? ''], ['dist_punto_anterior_m', num(p.distPuntoAnterior_m, 2)],
    ['vano_anterior_m', num(p.vanoAnterior_m, 2)], ['azimut_deg', num(p.azimut_deg, 2)],
    ['progresiva_m', num(p.progresiva_m, 2)], ['precision_m', p.precision_m ?? ''],
    ['metodo', p.metodo ?? ''],
  ].map(([n, v]) => `<SimpleData name="${n}">${esc(v)}</SimpleData>`).join('') +
    '</SchemaData></ExtendedData>';

  const ficha = (p) => {
    let h = `<b>${esc(p.nombre)}</b> — punto ${p.n}/${puntos.length}`;
    if (p.tipo === 'Estructura' && p.funcionEstructural) {
      h += `<br>Función: ${esc(p.funcionEstructural)}${p.esAncla ? ' — corta tramo de tensión' : ''}`;
      if (p.deflexion_grados != null) h += ` · deflexión ${p.deflexion_grados.toFixed(2)}&deg;`;
    }
    h += `<br>Lat ${p.latGMS}<br>Lon ${p.lonGMS}`;
    if (p.cota_m != null) {
      h += `<br>Cota GPS: ${p.cota_m.toFixed(2)} m (referencial${p.precision_m != null ? ` · ±${p.precision_m} m — NO apta para verificar distancias de seguridad` : ''})`;
    }
    if (p.local) h += `<br>Hora local: ${p.local}`;
    if (p.tipo === 'Estructura') {
      if (p.vanoAnterior_m != null) {
        h += `<br>Vano anterior: ${p.vanoAnterior_m.toFixed(2)} m (desde ${esc(p.vanoDesde)})`;
        h += `<br>Azimut: ${p.azimut_deg.toFixed(2)}&deg;`;
      }
      if (p.distPuntoAnterior_m != null && p.vanoAnterior_m != null &&
          Math.abs(p.distPuntoAnterior_m - p.vanoAnterior_m) > 0.005) {
        h += `<br>Dist. GPS al punto anterior: ${p.distPuntoAnterior_m.toFixed(2)} m (el punto anterior es un empalme)`;
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

  const placemark = (p, estilo) =>
    `<Placemark><name>${esc(p.nombre)}</name><description>${cdata(ficha(p))}</description>` +
      `<styleUrl>#${estilo}</styleUrl>${datos(p)}` +
      `<Point><coordinates>${p.lon.toFixed(6)},${p.lat.toFixed(6)},0</coordinates></Point></Placemark>`;

  k.push('<Folder><name>Estructuras</name>');
  for (const p of estructuras) k.push(placemark(p, 'wp'));
  k.push('</Folder>');

  if (empalmes.length) {
    k.push('<Folder><name>Empalmes (no son apoyos)</name>');
    for (const p of empalmes) k.push(placemark(p, 'emp'));
    k.push('</Folder>');
  }

  k.push('</Document></kml>');
  return k.join('\n');
}
