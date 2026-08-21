#!/usr/bin/env node
// ============================================================================
// sol-caribe.mjs — el recurso solar del Caribe colombiano, hora a hora
// ----------------------------------------------------------------------------
// QUÉ CONSTRUYE Y POR QUÉ EXISTE.
//
// El Ingeniero pidió ver el índice de radiación solar «a lo largo de cada día»
// y «desde inicio del año 2026» en Bolívar, Córdoba, Sucre, Cesar, Magdalena,
// Atlántico y La Guajira. La capa de radiación que YA existe no sirve para eso y
// no es un defecto suyo: cubre 0,29° x 0,38° (el corredor de Cartagena), viaja
// en kWh/m² AL DÍA y son promedios de largo plazo por mes. Esto es otra cosa —
// 6° x 6°, W/m² HORARIOS y días reales de 2026 — y por eso es otro archivo.
//
// ⚠️ ADR-001 INTACTO. Las consultas a NASA POWER las hace ESTA HERRAMIENTA al
// construir, igual que `construir-raster.py` con Global Solar Atlas. El sitio
// publicado no le pide nada a nadie en tiempo de ejecución.
//
// ⚠️ REPOSITORIO PÚBLICO. El recuadro son grados enteros y no aparece ni una
// coordenada de ninguna línea. Lo que sale de aquí es dato ambiental abierto.
//
// ── La fuente, verificada el 2026-08-21 llamándola ──────────────────────────
//
//   NASA POWER, parámetro ALLSKY_SFC_SW_DWN, comunidad RE. Sin clave, sin
//   cuenta y sin tarjeta: HTTP 200 sin una sola cabecera de autorización.
//   Datos libres; NASA pide CITARLOS, y la ficha los cita.
//   Resolución nativa del sol: 1° x 1° (CERES SYN1deg). No se remuestrea.
//
// ⚠️ LO QUE ESTE DATO ES, Y LO QUE NO ES. NASA publica el horario en `Wh/m²`,
// que en paso de una hora ES LA MEDIA de esa hora. NO es el pico instantáneo:
// el pico dentro de esa hora es por fuerza mayor. Por eso este archivo NO puede
// usarse para bajar los 1.000 W/m² adoptados de la ampacidad (IEEE 738), que son
// una irradiancia INSTANTÁNEA. Medido: el máximo de medias horarias de 2026 en
// la región es 1.027 W/m² y 11 de las 36 celdas superan los 1.000 adoptados.
// Sirve para VER el recurso y para discutir la hipótesis con número; no la cierra.
//
// ── Los DOS desfases, que no son el mismo ───────────────────────────────────
//
//   Medido el 2026-08-21: el paso HORARIO iba 83 días por detrás y el DIARIO 6.
//   Los dos están documentados como «near real time». Por eso 2026 tiene TRES
//   tramos y la ficha publica las tres fechas: hasta dónde hay horas, hasta
//   dónde hay total del día, y cuándo se construyó. La pantalla las lee de ahí
//   y NUNCA del código: escritas en el código, la frontera mentiría en silencio
//   en la siguiente reconstrucción, y los colores seguirían saliendo bonitos.
//
// Uso:  node herramientas/sol-caribe.mjs [--salida web/public/mapas]
// ============================================================================
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

// ── El recuadro y la malla ──────────────────────────────────────────────────
// Grados ENTEROS a propósito: coinciden con la celda nativa de 1° de CERES, así
// que cada píxel ES una celda medida y no hay remuestreo que declarar.
const OESTE = -77, ESTE = -71, SUR = 7, NORTE = 13;
const ANCHO = ESTE - OESTE;      // 6 celdas
const ALTO = NORTE - SUR;        // 6 celdas
const PARAM = 'ALLSKY_SFC_SW_DWN';

// ── Codificación, la misma convención que `vistas/rejilla.ts` ───────────────
// valor = (byte - 1) * paso + offset · el byte 0 está RESERVADO.
//
// ⚠️ BYTE 0 = SIN DATO. BYTE 1 = 0 W/m² MEDIDO. Aquí ese matiz muerde de verdad:
// de noche HAY medida y vale cero. Mapear la noche como «sin dato» borraría la
// mitad de las horas del año, y el mapa nocturno se leería como una avería.
const COD = { offset: 0, paso: 4.5, sin_dato: 0 };
const TOPE = 255;
const MAX_REPRESENTABLE = (TOPE - 1) * COD.paso + COD.offset;   // 1.143 W/m²

const aByte = (wm2) => {
  if (wm2 === null || !Number.isFinite(wm2) || wm2 <= -900) return COD.sin_dato;
  const b = Math.round((wm2 - COD.offset) / COD.paso) + 1;
  return Math.min(TOPE, Math.max(1, b));
};

// ── PNG en gris, escrito a mano ─────────────────────────────────────────────
// Sin dependencias: el proyecto no tiene librería de imagen en Node y esta
// herramienta tiene que correr igual en la Mac y en GitHub Actions, donde lo
// único garantizado es Node. Un PNG en gris de 8 bits son cuatro trozos.
function crc32(buf) {
  let c, tabla = crc32.t;
  if (!tabla) {
    tabla = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tabla[n] = c;
    }
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = tabla[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function trozo(tipo, datos) {
  const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const suma = Buffer.alloc(4); suma.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, suma]);
}
function pngGris(ancho, alto, bytes) {
  if (bytes.length !== ancho * alto) {
    throw new Error(`la imagen dice ${ancho}x${alto} y llegan ${bytes.length} bytes`);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;    // 8 bits por muestra
  ihdr[9] = 0;    // gris, sin paleta ni alfa
  // Cada línea lleva delante su byte de filtro; 0 = sin filtrar, que en un dato
  // que no es una foto comprime igual de bien y se lee sin ambigüedad.
  const crudo = Buffer.alloc(alto * (ancho + 1));
  for (let y = 0; y < alto; y++) {
    crudo[y * (ancho + 1)] = 0;
    Buffer.from(bytes.subarray(y * ancho, (y + 1) * ancho)).copy(crudo, y * (ancho + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr),
    trozo('IDAT', deflateSync(crudo, { level: 9 })),
    trozo('IEND', Buffer.alloc(0)),
  ]);
}

// ── La red, con reintentos y sin inventar nada ──────────────────────────────
async function pedir(url, intentos = 4) {
  let ultimo;
  for (let i = 0; i < intentos; i++) {
    if (i) await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const t = await r.text();
      // ⚠️ Un 200 con HTML es el fallo que más engaña: `r.ok` dice que sí y
      // `JSON.parse` revienta con un mensaje que no menciona al servidor.
      if (!t.trimStart().startsWith('{')) {
        throw new Error('el servidor contestó 200 pero no con JSON (¿página de error?)');
      }
      return JSON.parse(t);
    } catch (e) { ultimo = e; }
  }
  throw new Error(`no se pudo leer ${url.slice(0, 90)}… — ${ultimo?.message ?? ultimo}`);
}

const hoy = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');
const diasDelMes = (a, m) => new Date(a, m, 0).getDate();

// ── 1 · Las horas, celda por celda ──────────────────────────────────────────
async function bajarHorario(desde, hasta, aviso) {
  const celdas = new Map();
  let n = 0;
  for (let fy = 0; fy < ALTO; fy++) {
    for (let fx = 0; fx < ANCHO; fx++) {
      const lon = OESTE + fx + 0.5;
      const lat = NORTE - fy - 0.5;          // fila 0 = norte, como una imagen
      const u = `https://power.larc.nasa.gov/api/temporal/hourly/point?parameters=${PARAM}`
        + `&community=RE&longitude=${lon}&latitude=${lat}&start=${desde}&end=${hasta}`
        + `&format=JSON&time-standard=LST`;
      const j = await pedir(u);
      const serie = j?.properties?.parameter?.[PARAM];
      if (!serie) throw new Error(`la celda ${lon},${lat} no trajo el parámetro ${PARAM}`);
      celdas.set(`${fx},${fy}`, serie);
      aviso?.(++n, ANCHO * ALTO);
    }
  }
  return celdas;
}

// ── 2 · La energía del día, de una sola llamada ─────────────────────────────
async function bajarDiario(desde, hasta) {
  const u = `https://power.larc.nasa.gov/api/temporal/daily/regional?parameters=${PARAM}`
    + `&community=RE&latitude-min=${SUR}&latitude-max=${NORTE}`
    + `&longitude-min=${OESTE}&longitude-max=${ESTE}&start=${desde}&end=${hasta}&format=JSON`;
  const j = await pedir(u);
  if (!Array.isArray(j?.features)) throw new Error('el diario regional no trajo celdas');
  // Mediana regional por día: un promedio se lo lleva la celda más soleada, y
  // aquí lo que se enseña es «cómo fue el día en la región», no un total.
  const porDia = new Map();
  for (const f of j.features) {
    for (const [d, v] of Object.entries(f.properties.parameter[PARAM])) {
      if (v <= -900) continue;
      if (!porDia.has(d)) porDia.set(d, []);
      porDia.get(d).push(v);
    }
  }
  return [...porDia.entries()].sort().map(([d, vs]) => {
    vs.sort((a, b) => a - b);
    return { d: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      kwh: +vs[Math.floor(vs.length / 2)].toFixed(2) };
  });
}

// ── 3 · De las series a un PNG por mes ──────────────────────────────────────
// Cada cuadro es una hora de un día: 6x6 celdas. El mes se empaqueta como una
// rejilla de cuadros — 24 horas de ancho, un día por fila — así el navegador
// recorta el cuadro (día, hora) con una cuenta y sin pedir un archivo por hora.
function empaquetarMes(celdas, anio, mes) {
  const dias = diasDelMes(anio, mes);
  const anchoPx = 24 * ANCHO, altoPx = dias * ALTO;
  const px = new Uint8Array(anchoPx * altoPx);          // 0 = sin dato en todo
  let conDato = 0;
  for (let dia = 1; dia <= dias; dia++) {
    for (let h = 0; h < 24; h++) {
      const clave = `${anio}${String(mes).padStart(2, '0')}${String(dia).padStart(2, '0')}${String(h).padStart(2, '0')}`;
      for (let fy = 0; fy < ALTO; fy++) {
        for (let fx = 0; fx < ANCHO; fx++) {
          const v = celdas.get(`${fx},${fy}`)?.[clave];
          const b = aByte(v === undefined ? null : v);
          if (b !== COD.sin_dato) conDato++;
          px[((dia - 1) * ALTO + fy) * anchoPx + (h * ANCHO + fx)] = b;
        }
      }
    }
  }
  return { png: pngGris(anchoPx, altoPx, px), dias, conDato, total: dias * 24 * ANCHO * ALTO };
}

// ── 4 · La rampa ────────────────────────────────────────────────────────────
// Misma familia de color que el sol y la temperatura, para que las tres se lean
// con el mismo ojo. La parada de 1.000 NO es casual: es la hipótesis adoptada de
// la ampacidad, así que el color donde el mapa iguala a la suposición se
// reconoce a ojo — que es justo la conversación que este mapa tiene que abrir.
const RAMPA = [
  { c: 0, rgb: [12, 20, 44] }, { c: 150, rgb: [40, 60, 110] },
  { c: 300, rgb: [70, 110, 160] }, { c: 450, rgb: [130, 165, 175] },
  { c: 600, rgb: [200, 195, 150] }, { c: 750, rgb: [240, 190, 95] },
  { c: 875, rgb: [242, 145, 60] }, { c: 1000, rgb: [222, 85, 50] },
  { c: 1150, rgb: [150, 35, 40] },
];

async function principal() {
  const iSal = process.argv.indexOf('--salida');
  const salida = iSal > 0 ? process.argv[iSal + 1] : 'web/public/mapas';
  if (!existsSync(salida)) mkdirSync(salida, { recursive: true });
  const ANIO = 2026;
  const desde = `${ANIO}0101`, hasta = hoy();

  console.log(`· horas: ${ANCHO * ALTO} celdas, ${desde} → ${hasta}`);
  const celdas = await bajarHorario(desde, hasta, (n, t) => process.stdout.write(`\r  ${n}/${t}`));
  console.log('');
  console.log('· energía del día: 1 llamada regional');
  const diario = await bajarDiario(desde, hasta);

  // Hasta dónde llega CADA cosa. Se mide, no se supone.
  let ultimaHora = null;
  for (const serie of celdas.values()) {
    for (const [k, v] of Object.entries(serie)) {
      if (v > -900 && (ultimaHora === null || k > ultimaHora)) ultimaHora = k;
    }
  }
  if (!ultimaHora) throw new Error('ninguna celda trajo una sola hora con dato');
  const ultimoDiaConHoras = `${ultimaHora.slice(0, 4)}-${ultimaHora.slice(4, 6)}-${ultimaHora.slice(6, 8)}`;
  const ultimoDiaConTotal = diario.length ? diario[diario.length - 1].d : null;

  const meses = [];
  for (let m = 1; m <= 12; m++) {
    const { png, dias, conDato, total } = empaquetarMes(celdas, ANIO, m);
    if (!conDato) continue;                       // un mes sin una sola hora no se publica
    const nombre = `sol-caribe-${ANIO}-${String(m).padStart(2, '0')}.png`;
    writeFileSync(join(salida, nombre), png);
    meses.push({ clave: String(m).padStart(2, '0'), archivo: nombre, dias,
      horasConDato: conDato / (ANCHO * ALTO), bytes: png.length });
    console.log(`  ${nombre}  ${dias} días · ${(conDato / (ANCHO * ALTO)).toFixed(0)} horas con dato · ${(png.length / 1024).toFixed(1)} KiB`);
  }
  if (!meses.length) throw new Error('no se pudo publicar ni un mes');

  const ficha = {
    capa: 'sol-caribe',
    titulo: 'Recurso solar del Caribe colombiano, hora a hora',
    departamentos: ['Bolívar', 'Córdoba', 'Sucre', 'Cesar', 'Magdalena', 'Atlántico', 'La Guajira'],
    bbox: [OESTE, SUR, ESTE, NORTE],
    ancho: ANCHO, alto: ALTO,
    // Iguales A PROPÓSITO: el píxel ES la celda medida. No se remuestrea nada y
    // por eso la pantalla no tiene que avisar de un muestreo que no existe.
    resolucion_m: 111000, resolucion_nativa_m: 111000,
    remuestreo_pantalla: 'nearest',
    remuestreo: 'ninguno: cada píxel es una celda de 1° medida. Se pinta a cuadros '
      + 'porque a cuadros es como está medido; suavizarlo dibujaría un degradado que nadie midió.',
    unidad: 'W/m²',
    codificacion: COD,
    valorMaximoRepresentable: MAX_REPRESENTABLE,
    cuadros: { horas: 24, porFila: 24, celdaAncho: ANCHO, celdaAlto: ALTO },
    anio: ANIO,
    meses,
    // LAS TRES FECHAS. La pantalla las lee de aquí y nunca del código.
    ultimoDiaConHoras, ultimoDiaConTotal,
    construido: new Date().toISOString(),
    energiaDiaria: diario,
    unidadEnergiaDiaria: 'kWh/m² al día (mediana de las 36 celdas)',
    rampa: RAMPA,
    hipotesisMarcadaEnRampa: 1000,
    aviso: 'Es la MEDIA de cada hora, no el pico instantáneo: el pico dentro de esa hora es '
      + 'por fuerza mayor. La ampacidad usa 1.000 W/m² ADOPTADOS, que son una irradiancia '
      + 'INSTANTÁNEA de mediodía despejado. Este mapa acerca la comparación y NO la cierra: '
      + 'para eso hace falta una serie con percentiles del pico, no de la media.',
    fuente: 'NASA POWER (CERES SYN1deg), parámetro ALLSKY_SFC_SW_DWN, comunidad RE',
    atribucion: 'These data were obtained from the NASA Langley Research Center POWER Project',
    licencia: 'Datos libres; NASA solicita citar el proyecto POWER',
  };
  writeFileSync(join(salida, 'sol-caribe.json'), JSON.stringify(ficha, null, 1));

  const pesoTotal = meses.reduce((s, m) => s + m.bytes, 0);
  console.log(`\n✅ ${meses.length} meses · ${(pesoTotal / 1024).toFixed(0)} KiB de dato`);
  console.log(`   horas hasta ${ultimoDiaConHoras} · total del día hasta ${ultimoDiaConTotal}`);
}

principal().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
