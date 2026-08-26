#!/usr/bin/env node
// ============================================================================
// abi-caribe.mjs — SOL y NUBES casi en vivo, del sensor del GOES-19
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE (`99 §ADR-081`). Los atlas de sol y nubes vienen de NASA POWER
// (CERES SYN1deg) y van **87 días por detrás** — medido, no supuesto. El mismo
// satélite que ya nos cuenta los rayos publica **radiación solar en superficie**
// y **máscara de nubes** con **quince minutos** de retraso, gratis y sin llave.
//
// ⚠️ NO SUSTITUYEN A LOS DE POWER: SON OTRA CAPA, y por eso viven aparte.
//   · POWER da la MEDIA de la hora; esto es lo que el sensor vio en las tomas de
//     esa hora — para el sol, la media de las seis; para las nubes, de dos.
//   · La nubosidad de POWER es «% de cielo cubierto» de un modelo; ésta es la
//     FRACCIÓN de píxeles de 2 km que el sensor marcó como nublados.
//   · POWER tiene el año entero desde enero; esto empieza hoy y se acumula.
// Mezclarlas bajo el mismo color sin decirlo pondría dos verdades en el mismo
// cuadro. Se publican como capas hermanas, con la misma escala de color, para
// que se puedan comparar a ojo sin confundirlas.
//
// ⚠️ POR QUÉ DOS TOMAS PARA LAS NUBES Y SEIS PARA EL SOL. Medido el 2026-08-24
// sobre una hora real: la fracción nublada de la región fue 45,7 · 45,8 · 45,8 ·
// 45,6 · 45,4 · 44,9 % — la media de las seis y la de dos (:00 y :30) difieren
// en **0,12 puntos**, y el archivo de nubes pesa 27 MB frente a los 10 del sol.
// La radiación sí cambia rápido cuando pasa una nube, así que ahí van las seis.
//
// Uso:
//   node herramientas/abi-caribe.mjs --capa sol-vivo   [--horas 6] [--maximo 4]
//   node herramientas/abi-caribe.mjs --capa nubes-vivo [--solo-publicar]
// ============================================================================
import { writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import * as h5wasm from 'h5wasm/node';
import { ANCHO, ALTO, OESTE, ESTE, SUR, NORTE, publicarAtlas } from './atlas-caribe.mjs';
import { anguloDe, geometriaDe, puntoDe, ventanaDe } from './abi-geo.mjs';
import {
  celdasDelLibro, claveColombia, diarioDelLibro, escribirLibro, leerLibro,
} from './libro-acumulado.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CUBO = 'https://noaa-goes19.s3.amazonaws.com';

// ════════════════════════════════════════════════════════════════════════════
// LOS DOS PERFILES
// ════════════════════════════════════════════════════════════════════════════

const RAMPA_SOL = [
  { c: 0, rgb: [40, 45, 70] }, { c: 150, rgb: [70, 90, 130] }, { c: 300, rgb: [110, 145, 165] },
  { c: 450, rgb: [170, 195, 175] }, { c: 600, rgb: [225, 220, 150] }, { c: 750, rgb: [245, 190, 100] },
  { c: 875, rgb: [240, 145, 70] }, { c: 1000, rgb: [220, 90, 60] }, { c: 1150, rgb: [160, 40, 50] },
];
const RAMPA_NUBES = [
  { c: 0, rgb: [118, 170, 216] }, { c: 12.5, rgb: [163, 199, 228] }, { c: 37.5, rgb: [206, 216, 226] },
  { c: 62.5, rgb: [190, 190, 192] }, { c: 87.5, rgb: [150, 150, 154] }, { c: 100, rgb: [108, 110, 118] },
];

export const PERFILES = Object.freeze({
  'sol-vivo': Object.freeze({
    capa: 'sol-vivo-caribe',
    prefijo: 'sol-vivo-caribe',
    naturaleza: 'medida',
    producto: 'ABI-L2-DSRF',
    variable: 'DSR',
    /** Todas las tomas de la hora: bajo una nube la radiación cambia en minutos. */
    tomasPorHora: 6,
    agregar: 'media',
    titulo: 'Radiación solar del Caribe, casi en vivo',
    unidad: 'W/m²',
    // La MISMA codificación y la MISMA rampa que el atlas solar de POWER, a
    // propósito: así el mismo color significa lo mismo en las dos capas y se
    // pueden comparar a ojo. Lo que cambia es la fuente, no la escala.
    codificacion: { offset: 0, paso: 4.5, sin_dato: 0 },
    rampa: RAMPA_SOL,
    hipotesisMarcadaEnRampa: 1000,
    etiquetaHipotesis: 'la hipótesis adoptada de la ampacidad (1.000 W/m² de irradiancia)',
    resumenDiarioEtiqueta: 'Máxima del día',
    resumenDiarioUnidad: 'W/m² (la mayor de las 36 celdas)',
    resumenDiarioAviso: 'Es el PICO de la región en el día, no la energía acumulada: '
      + 'el atlas solar de POWER es el que publica kWh/m².',
    aviso: 'ES LO QUE EL SENSOR VIO EN ESA HORA, NO LA MEDIA HORARIA DE UN MODELO. Sale del '
      + 'producto DSR del GOES-19 —radiación de onda corta que llega al suelo— promediando las '
      + 'tomas de la hora, sobre píxeles de 2 km agregados a la celda de 1°. El atlas solar de '
      + 'NASA POWER mide lo mismo con otra cadena y va 87 días por detrás: sirven para cosas '
      + 'distintas y no se sustituyen. Ninguno de los dos valida la hipótesis de 1.000 W/m² de '
      + 'la ampacidad: la acercan.',
    // ⚠️ SIN COMAS DENTRO DEL NOMBRE: la cinta de la pantalla publica lo que hay
    // ANTES de la primera coma, y con una coma metida en el paréntesis salía
    // «GOES-19 ABI L2 DSR (Downward Shortwave Radiation» — cortado a la mitad.
    fuente: 'GOES-19 ABI L2 DSR (radiación de onda corta que llega al suelo), NOAA.',
    atribucion: 'GOES-19 ABI L2 · NOAA/NESDIS, datos abiertos en AWS Open Data',
    licencia: 'Dominio público (NOAA).',
  }),
  'nubes-vivo': Object.freeze({
    capa: 'nubes-vivo-caribe',
    prefijo: 'nubes-vivo-caribe',
    naturaleza: 'medida',
    producto: 'ABI-L2-ACMF',
    variable: 'BCM',
    /** Dos tomas: medido, la tercera decimal no cambia la fracción de la hora. */
    tomasPorHora: 2,
    agregar: 'fraccion',
    titulo: 'Nubosidad del Caribe, casi en vivo',
    unidad: '%',
    codificacion: { offset: 0, paso: 0.4, sin_dato: 0 },
    rampa: RAMPA_NUBES,
    hipotesisMarcadaEnRampa: undefined,
    etiquetaHipotesis: undefined,
    resumenDiarioEtiqueta: 'Cielo cubierto, media del día',
    resumenDiarioUnidad: '% (media de las 36 celdas y de sus horas)',
    resumenDiarioAviso: 'Es la media del día en la región: una mañana despejada y una tarde '
      + 'cerrada dan lo mismo que un día gris entero.',
    aviso: 'ES LA FRACCIÓN DE PÍXELES QUE EL SENSOR MARCÓ COMO NUBLADOS, no el «% de cielo '
      + 'cubierto» de un modelo. Cada celda de 1° son unos 3.000 píxeles de 2 km, y se cuenta '
      + 'cuántos vieron nube. **No dice si está lloviendo ni si hay tormenta eléctrica**: para '
      + 'eso están las capas de lluvia y de rayos. El atlas de nubes de NASA POWER mide una cosa '
      + 'parecida con otra cadena y va 87 días por detrás.',
    fuente: 'GOES-19 ABI L2 ACM (Clear Sky Mask), NOAA.',
    atribucion: 'GOES-19 ABI L2 · NOAA/NESDIS, datos abiertos en AWS Open Data',
    licencia: 'Dominio público (NOAA).',
  }),
});

const SOBRE = (p) => `${p.titulo}. Medido por el ${p.producto} del GOES-19 y agregado a las celdas `
  + 'de 1° del atlas del Caribe, hora a hora EN EL RELOJ DE COLOMBIA. Clave: AAAAMMDDHH. '
  + 'Este libro se ACUMULA: nunca se reconstruye entero.';

// ════════════════════════════════════════════════════════════════════════════
// BAJAR Y AGREGAR
// ════════════════════════════════════════════════════════════════════════════

const diaDelAnio = (d) => Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1;

async function traer(url, intentos = 4) {
  let ultimo;
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return r;
      ultimo = new Error(`respondió ${r.status}`);
      if (r.status === 404) throw ultimo;
    } catch (e) { ultimo = e; if (String(e.message).includes('404')) throw e; }
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  throw new Error(`${url.slice(-60)} — ${ultimo?.message ?? 'sin respuesta'}`);
}

async function listarHora(producto, fechaUtc) {
  const u = `${CUBO}/?list-type=2&prefix=${producto}/${fechaUtc.getUTCFullYear()}/`
    + `${String(diaDelAnio(fechaUtc)).padStart(3, '0')}/${String(fechaUtc.getUTCHours()).padStart(2, '0')}/`
    + '&max-keys=100';
  const xml = await (await traer(u)).text();
  return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
}

/**
 * DE QUÉ CELDA ES CADA PÍXEL — se calcula UNA vez por corrida y se reutiliza.
 *
 * La rejilla del satélite no se mueve: el mapa píxel→celda es el mismo para
 * todas las tomas de todas las horas. Recalcularlo por archivo serían cien mil
 * trigonometrías por toma, y con seis tomas por hora eso es lo que convierte un
 * trabajo de un minuto en uno de veinte.
 */
function mapaDeCeldas(f) {
  const pr = Object.fromEntries(Object.entries(f.get('goes_imager_projection').attrs)
    .map(([k, v]) => [k, v.value?.[0] ?? v.value]));
  const g = geometriaDe(pr);
  const ejeCrudo = (n) => {
    const d = f.get(n);
    const e = d.attrs.scale_factor.value[0], o = d.attrs.add_offset.value[0];
    return Float64Array.from(d.value, (v) => v * e + o);
  };
  const X = ejeCrudo('x'), Y = ejeCrudo('y');
  const v = ventanaDe([OESTE, SUR, ESTE, NORTE], X, Y, g);
  if (!v) throw new Error('el recuadro del atlas no se ve entero desde el satélite');
  const ancho = v.x1 - v.x0 + 1, alto = v.y1 - v.y0 + 1;
  const celda = new Int16Array(ancho * alto).fill(-1);
  for (let j = 0; j < alto; j++) {
    for (let i = 0; i < ancho; i++) {
      const p = puntoDe(X[v.x0 + i], Y[v.y0 + j], g);
      if (!p) continue;
      if (p.lon < OESTE || p.lon >= ESTE || p.lat < SUR || p.lat >= NORTE) continue;
      const fx = Math.min(ANCHO - 1, Math.floor(p.lon - OESTE));
      const fy = Math.min(ALTO - 1, Math.floor(NORTE - p.lat));
      celda[j * ancho + i] = fy * ANCHO + fx;
    }
  }
  return { v, ancho, alto, celda };
}

/** Las tomas de una hora, repartidas por igual: la primera, la de en medio, etc. */
const repartir = (claves, n) => {
  if (claves.length <= n) return claves;
  return Array.from({ length: n }, (_, i) => claves[Math.round((i * claves.length) / n)]);
};

export async function bajarHora(perfil, fechaUtc, mapa) {
  const claves = repartir(await listarHora(perfil.producto, fechaUtc), perfil.tomasPorHora);
  if (!claves.length) return null;
  const tmp = join(tmpdir(), `abi-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  const suma = new Float64Array(ANCHO * ALTO), cuenta = new Float64Array(ANCHO * ALTO);
  let mb = 0, m = mapa;
  try {
    for (const k of claves) {
      const ruta = join(tmp, 'toma.nc');
      writeFileSync(ruta, Buffer.from(await (await traer(`${CUBO}/${k}`)).arrayBuffer()));
      mb += statSync(ruta).size / 1e6;
      const f = new h5wasm.File(ruta, 'r');
      if (!m) m = mapaDeCeldas(f);
      const d = f.get(perfil.variable);
      const relleno = d.attrs._FillValue?.value?.[0];
      const escala = d.attrs.scale_factor?.value?.[0] ?? 1;
      const desfase = d.attrs.add_offset?.value?.[0] ?? 0;
      const px = d.slice([[m.v.y0, m.v.y1 + 1], [m.v.x0, m.v.x1 + 1]]);
      for (let i = 0; i < m.celda.length; i++) {
        const c = m.celda[i];
        if (c < 0) continue;
        const b = px[i];
        if (b === relleno) continue;
        // Fracción: el píxel vale 1 si el sensor vio nube y 0 si no. Media: el
        // valor físico, con la escala que declara el propio archivo.
        suma[c] += perfil.agregar === 'fraccion' ? (b === 1 ? 100 : 0) : b * escala + desfase;
        cuenta[c] += 1;
      }
      f.close();
      rmSync(ruta, { force: true });
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }

  const valores = {};
  for (let c = 0; c < ANCHO * ALTO; c++) {
    if (!cuenta[c]) continue;                     // celda que el sensor no midió
    valores[`${c % ANCHO},${Math.floor(c / ANCHO)}`] = +(suma[c] / cuenta[c]).toFixed(2);
  }
  return { valores, tomas: claves.length, mb, mapa: m };
}

// ════════════════════════════════════════════════════════════════════════════
// EL PROGRAMA
// ════════════════════════════════════════════════════════════════════════════

const arg = (n, d) => {
  const i = process.argv.indexOf('--' + n);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

async function principal() {
  const clave = arg('capa', null);
  const perfil = PERFILES[clave];
  if (!perfil) {
    console.error(`❌ falta --capa: ${Object.keys(PERFILES).join(' | ')}`);
    process.exit(1);
  }
  const ruta = join(AQUI, `${perfil.prefijo}-libro.json`);
  const salida = arg('salida', 'web/public/mapas');
  const libro = leerLibro(ruta);

  if (!process.argv.includes('--solo-publicar')) {
    await h5wasm.ready;
    const ahora = new Date();
    // La hora en curso no se baja: estaría a medias y quedaría escrita entera.
    const fin = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(),
      ahora.getUTCHours()) - 3600000);
    const horas = Number(arg('horas', 6));
    const inicio = new Date(fin.getTime() - (horas - 1) * 3600000);
    let pendientes = [];
    for (let t = inicio.getTime(); t <= fin.getTime(); t += 3600000) {
      const u = new Date(t);
      if (!libro.horas[claveColombia(u)]) pendientes.push(u);
    }
    const maximo = Number(arg('maximo', 0));
    if (maximo > 0 && pendientes.length > maximo) {
      console.log(`· ${pendientes.length} horas pendientes; esta pasada atiende ${maximo}`);
      pendientes = pendientes.slice(0, maximo);
    }
    console.log(`· ${clave} · ${pendientes.length} hora(s) por bajar`);
    let mapa = null;
    for (const u of pendientes) {
      const r = await bajarHora(perfil, u, mapa);
      if (!r) { console.log(`  ${u.toISOString().slice(0, 13)}Z · el satélite aún no la tiene`); continue; }
      mapa = r.mapa;
      libro.horas[claveColombia(u)] = r.valores;
      const vs = Object.values(r.valores);
      console.log(`  ${u.toISOString().slice(0, 13)}Z → ${claveColombia(u)} · ${r.tomas} tomas · `
        + `${r.mb.toFixed(0)} MB · ${vs.length}/36 celdas · máx ${Math.max(...vs).toFixed(0)} ${perfil.unidad}`);
      escribirLibro(ruta, libro, SOBRE(perfil));
    }
  }

  const claves = Object.keys(libro.horas);
  if (!claves.length) { console.error('⛔ el libro está vacío.'); process.exit(1); }
  publicarAtlas(perfil,
    // ⚠️ `relleno: null`: una celda que el sensor NO midió no es «cero vatios»
    // ni «cielo despejado». Se queda como hueco, y la pantalla lo dice.
    celdasDelLibro(libro, { ancho: ANCHO, alto: ALTO, relleno: null }),
    diarioDelLibro(libro, perfil.agregar === 'fraccion' ? 'media' : 'maxima'),
    { salida, anio: +claves[0].slice(0, 4) });
  console.log(`   libro: ${claves.length} horas`);
}

if (process.argv[1] && process.argv[1].endsWith('abi-caribe.mjs')) {
  principal().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
}
