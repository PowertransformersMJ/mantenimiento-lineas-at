#!/usr/bin/env node
// ============================================================================
// atlas-caribe.mjs — EL MOTOR de los atlas del Caribe colombiano, hora a hora
// ----------------------------------------------------------------------------
// QUÉ ES ESTO Y POR QUÉ EXISTE.
//
// El primer atlas fue el del sol (`99 §ADR-045`). Cuando el Ingeniero pidió
// «un atlas igual pero de temperatura en los mismos departamentos», había dos
// caminos: copiar los 304 renglones del solar y cambiarle el parámetro, o
// separar lo que es MOTOR de lo que es PRODUCTO. Copiar habría creado un segundo
// sitio donde arreglar cada fallo — y este archivo ya tiene dentro dos fallos
// caros que se cazaron una vez: el byte 0 que no es un cero medido, y el 200 con
// HTML que revienta al parsear (`30 · L-28`, `99 §ADR-052`).
//
// Aquí vive TODO lo que los dos atlas comparten: la malla, el codificador PNG
// sin dependencias, la red con reintentos, el empaquetado del mes y la ficha.
// Lo que cambia entre uno y otro es un PERFIL de veinte renglones al final.
//
// ⚠️ ADR-001 INTACTO. Las consultas a NASA POWER las hace ESTA HERRAMIENTA al
// construir. El sitio publicado no le pide nada a nadie en tiempo de ejecución.
//
// ⚠️ REPOSITORIO PÚBLICO. El recuadro son grados enteros y no aparece ni una
// coordenada de ninguna línea. Lo que sale de aquí es dato ambiental abierto.
//
// ── La fuente, verificada llamándola ────────────────────────────────────────
//
//   NASA POWER, comunidad RE. Sin clave, sin cuenta y sin tarjeta: HTTP 200 sin
//   una sola cabecera de autorización. Datos libres; NASA pide CITARLOS, y la
//   ficha los cita. Resolución nativa 1° x 1°. No se remuestrea.
//
// ── Los DOS desfases, que no son el mismo ───────────────────────────────────
//
//   Medido el 2026-08-21 en el solar: el paso HORARIO iba 83 días por detrás y
//   el DIARIO 6. Los dos están documentados como «near real time». Por eso el
//   año tiene TRES tramos y la ficha publica las tres fechas: hasta dónde hay
//   horas, hasta dónde hay resumen del día, y cuándo se construyó. La pantalla
//   las lee de ahí y NUNCA del código: escritas en el código, la frontera
//   mentiría en silencio en la siguiente reconstrucción, y los colores seguirían
//   saliendo bonitos (`31 · L-64`).
//
// Uso:  node herramientas/atlas-caribe.mjs --capa sol|temperatura [--salida …]
//       (o los envoltorios `sol-caribe.mjs` y `temp-caribe.mjs`)
// ============================================================================
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

// ── El recuadro y la malla ──────────────────────────────────────────────────
// Grados ENTEROS a propósito: coinciden con la celda nativa de 1°, así que cada
// píxel ES una celda medida y no hay remuestreo que declarar. Los siete
// departamentos que pidió el Ingeniero caben enteros aquí dentro.
export const OESTE = -77, ESTE = -71, SUR = 7, NORTE = 13;
export const ANCHO = ESTE - OESTE;      // 6 celdas
export const ALTO = NORTE - SUR;        // 6 celdas
export const DEPARTAMENTOS = ['Bolívar', 'Córdoba', 'Sucre', 'Cesar',
  'Magdalena', 'Atlántico', 'La Guajira'];

const TOPE = 255;

// ── Codificación, la misma convención que `vistas/rejilla.ts` ───────────────
// valor = (byte - 1) * paso + offset · el byte 0 está RESERVADO.
//
// ⚠️ BYTE 0 = SIN DATO. BYTE 1 = el valor más bajo MEDIDO. En el sol ese matiz
// muerde de verdad: de noche HAY medida y vale cero, y mapear la noche como «sin
// dato» borraría la mitad de las horas del año — el mapa nocturno se leería como
// una avería. En la temperatura muerde al revés: el cero no existe como valor
// natural, pero un offset mal puesto convertiría un 25 °C en un hueco.
const aByte = (v, cod) => {
  if (v === null || !Number.isFinite(v) || v <= -900) return cod.sin_dato;
  const b = Math.round((v - cod.offset) / cod.paso) + 1;
  return Math.min(TOPE, Math.max(1, b));
};

const maxRepresentable = (cod) => (TOPE - 1) * cod.paso + cod.offset;

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
export function pngGris(ancho, alto, bytes) {
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
async function bajarHorario(param, desde, hasta, aviso) {
  const celdas = new Map();
  let n = 0;
  for (let fy = 0; fy < ALTO; fy++) {
    for (let fx = 0; fx < ANCHO; fx++) {
      const lon = OESTE + fx + 0.5;
      const lat = NORTE - fy - 0.5;          // fila 0 = norte, como una imagen
      const u = `https://power.larc.nasa.gov/api/temporal/hourly/point?parameters=${param}`
        + `&community=RE&longitude=${lon}&latitude=${lat}&start=${desde}&end=${hasta}`
        + `&format=JSON&time-standard=LST`;
      const j = await pedir(u);
      const serie = j?.properties?.parameter?.[param];
      if (!serie) throw new Error(`la celda ${lon},${lat} no trajo el parámetro ${param}`);
      celdas.set(`${fx},${fy}`, serie);
      aviso?.(++n, ANCHO * ALTO);
    }
  }
  return celdas;
}

// ── 2 · El resumen del día, de una sola llamada ─────────────────────────────
//
// Mediana regional por día: un promedio se lo lleva la celda extrema, y aquí lo
// que se enseña es «cómo fue el día en la región», no un total.
async function bajarDiario(param, desde, hasta) {
  const u = `https://power.larc.nasa.gov/api/temporal/daily/regional?parameters=${param}`
    + `&community=RE&latitude-min=${SUR}&latitude-max=${NORTE}`
    + `&longitude-min=${OESTE}&longitude-max=${ESTE}&start=${desde}&end=${hasta}&format=JSON`;
  const j = await pedir(u);
  if (!Array.isArray(j?.features)) throw new Error('el diario regional no trajo celdas');
  const porDia = new Map();
  for (const f of j.features) {
    for (const [d, v] of Object.entries(f.properties.parameter[param])) {
      if (v <= -900) continue;
      if (!porDia.has(d)) porDia.set(d, []);
      porDia.get(d).push(v);
    }
  }
  return [...porDia.entries()].sort().map(([d, vs]) => {
    vs.sort((a, b) => a - b);
    return { d: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      v: +vs[Math.floor(vs.length / 2)].toFixed(2) };
  });
}

// ── 3 · De las series a un PNG por mes ──────────────────────────────────────
// Cada cuadro es una hora de un día: 6x6 celdas. El mes se empaqueta como una
// rejilla de cuadros — 24 horas de ancho, un día por fila — así el navegador
// recorta el cuadro (día, hora) con una cuenta y sin pedir un archivo por hora.
export function empaquetarMes(celdas, anio, mes, cod) {
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
          const b = aByte(v === undefined ? null : v, cod);
          if (b !== cod.sin_dato) conDato++;
          px[((dia - 1) * ALTO + fy) * anchoPx + (h * ANCHO + fx)] = b;
        }
      }
    }
  }
  return { png: pngGris(anchoPx, altoPx, px), dias, conDato, total: dias * 24 * ANCHO * ALTO };
}

// ════════════════════════════════════════════════════════════════════════════
// LOS PERFILES — lo único que cambia entre un atlas y el otro
// ════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ LA RAMPA DEL SOL. Misma familia de color que la capa mensual, para que las
 * dos se lean con el mismo ojo. La parada de 1.000 NO es casual: es la hipótesis
 * adoptada de la ampacidad, así que el color donde el mapa iguala a la suposición
 * se reconoce a ojo — que es justo la conversación que este mapa abre.
 */
const RAMPA_SOL = [
  { c: 0, rgb: [12, 20, 44] }, { c: 150, rgb: [40, 60, 110] },
  { c: 300, rgb: [70, 110, 160] }, { c: 450, rgb: [130, 165, 175] },
  { c: 600, rgb: [200, 195, 150] }, { c: 750, rgb: [240, 190, 95] },
  { c: 875, rgb: [242, 145, 60] }, { c: 1000, rgb: [222, 85, 50] },
  { c: 1150, rgb: [150, 35, 40] },
];

/**
 * ⚠️ LA RAMPA DE LA TEMPERATURA, y por qué NO empieza en cero.
 *
 * Una rampa de 0 a 50 °C gastaría media escala en temperaturas que en el Caribe
 * no ocurren, y las diferencias que SÍ deciden la ampacidad —de 26 a 38 °C—
 * saldrían todas del mismo color. Medido con la fuente antes de elegirla: en
 * 2026 la región va de 11,3 °C a 42,0 °C — y ese 42 está DOS GRADOS por encima
 * del peor escenario adoptado de la pestaña Térmica (El Niño, 40 °C). La escala
 * se ajusta a lo que hay, con margen a los dos lados: si empezara en el mínimo
 * medido, el día más fresco del año saldría del color del borde y se leería como
 * un recorte.
 *
 * Las CUATRO paradas del medio no son estéticas: son los cuatro escenarios
 * adoptados de la pestaña Térmica —24 · 32 · 38 · 40 °C (`vistas/termicaDatos`)—.
 * Así, mirar el mapa y ver dónde cae el color del escenario de referencia es la
 * misma pregunta que «¿la hipótesis de 32 °C aguanta en esta región?».
 */
const RAMPA_TEMP = [
  { c: 10, rgb: [40, 60, 110] },
  { c: 18, rgb: [90, 140, 175] },
  { c: 24, rgb: [150, 190, 190] },
  { c: 28, rgb: [225, 215, 160] },
  { c: 32, rgb: [242, 175, 85] },
  { c: 35, rgb: [235, 125, 55] },
  { c: 38, rgb: [214, 70, 45] },
  { c: 40, rgb: [175, 40, 45] },
  { c: 44, rgb: [110, 25, 40] },
];

export const PERFILES = Object.freeze({
  sol: Object.freeze({
    capa: 'sol-caribe',
    prefijo: 'sol-caribe',
    param: 'ALLSKY_SFC_SW_DWN',
    paramDiario: 'ALLSKY_SFC_SW_DWN',
    titulo: 'Recurso solar del Caribe colombiano, hora a hora',
    unidad: 'W/m²',
    // paso 4,5 → 1.143 W/m² representables, por encima del máximo medido (1.027).
    codificacion: { offset: 0, paso: 4.5, sin_dato: 0 },
    rampa: RAMPA_SOL,
    hipotesisMarcadaEnRampa: 1000,
    etiquetaHipotesis: 'la hipótesis adoptada de la ampacidad (1.000 W/m² de irradiancia)',
    resumenDiarioEtiqueta: 'Energía del día',
    resumenDiarioUnidad: 'kWh/m² al día (mediana de las 36 celdas)',
    resumenDiarioAviso: 'Es OTRA magnitud que la del mapa y no se convierte en ella con una regla de tres.',
    aviso: 'Es la MEDIA de cada hora, no el pico instantáneo: el pico dentro de esa hora es '
      + 'por fuerza mayor. La ampacidad usa 1.000 W/m² ADOPTADOS, que son una irradiancia '
      + 'INSTANTÁNEA de mediodía despejado. Este mapa acerca la comparación y NO la cierra: '
      + 'para eso hace falta una serie con percentiles del pico, no de la media.',
    fuente: 'NASA POWER (CERES SYN1deg), parámetro ALLSKY_SFC_SW_DWN, comunidad RE',
  }),

  temperatura: Object.freeze({
    capa: 'temp-caribe',
    prefijo: 'temp-caribe',
    param: 'T2M',
    // ⚠️ EL RESUMEN DEL DÍA ES EL MÁXIMO, no la media, y esa elección es de
    // ingeniería: la ampacidad la decide la HORA MÁS CALUROSA del día, no el
    // promedio. Un promedio diario de 28 °C con picos de 38 °C diría que la
    // hipótesis de 32 °C va sobrada, y sería exactamente al revés.
    paramDiario: 'T2M_MAX',
    titulo: 'Temperatura del aire del Caribe colombiano, hora a hora',
    unidad: '°C',
    // offset -10 y paso 0,25 → de -10 a 53,5 °C con resolución de un cuarto de
    // grado. Medido con el año entero: la región va de 11,3 a 42,0 °C, así que
    // hay margen por los dos lados sin gastar escala en lo que no ocurre. El
    // motor comprueba ese encaje y se niega a publicar si el dato se sale.
    codificacion: { offset: -10, paso: 0.25, sin_dato: 0 },
    rampa: RAMPA_TEMP,
    hipotesisMarcadaEnRampa: 32,
    etiquetaHipotesis: 'el escenario de REFERENCIA de la pestaña Térmica (32 °C de ambiente)',
    resumenDiarioEtiqueta: 'Máxima del día',
    resumenDiarioUnidad: '°C (mediana regional de la máxima diaria)',
    resumenDiarioAviso: 'Es la máxima de cada celda, resumida por la mediana de las 36: '
      + 'no es la máxima de la región, que siempre será mayor.',
    aviso: 'Es la temperatura del aire a 2 m, que es la que entra en el balance térmico del '
      + 'conductor (IEEE 738) — NO es la temperatura del conductor ni la del suelo. Y es la '
      + 'MEDIA de cada hora sobre una celda de 111 km: un apoyo concreto, a pleno sol y sobre '
      + 'asfalto, puede estar por encima. Sirve para discutir con número los 32 °C adoptados; '
      + 'no los sustituye por una medida de sitio.',
    fuente: 'NASA POWER (MERRA-2), parámetro T2M, comunidad RE',
  }),
});

// ════════════════════════════════════════════════════════════════════════════
// EL MOTOR
// ════════════════════════════════════════════════════════════════════════════

export async function construirAtlas(perfil, { salida = 'web/public/mapas', anio = 2026 } = {}) {
  if (!existsSync(salida)) mkdirSync(salida, { recursive: true });
  const cod = perfil.codificacion;
  const desde = `${anio}0101`, hasta = hoy();

  console.log(`· ${perfil.capa} · horas: ${ANCHO * ALTO} celdas, ${desde} → ${hasta}`);
  const celdas = await bajarHorario(perfil.param, desde, hasta,
    (n, t) => process.stdout.write(`\r  ${n}/${t}`));
  console.log('');
  console.log(`· resumen del día (${perfil.paramDiario}): 1 llamada regional`);
  const diario = await bajarDiario(perfil.paramDiario, desde, hasta);

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

  // Los extremos REALES de lo que se publica: sirven para comprobar que la
  // codificación elegida no está recortando por arriba ni por abajo, que es un
  // fallo que no da error — solo aplana el mapa en el extremo que importa.
  let vMin = Infinity, vMax = -Infinity;
  for (const serie of celdas.values()) {
    for (const v of Object.values(serie)) {
      if (v <= -900) continue;
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
  }
  const tope = maxRepresentable(cod);
  if (vMin < cod.offset || vMax > tope) {
    throw new Error(`la codificación recorta el dato: medido ${vMin.toFixed(1)}…${vMax.toFixed(1)} `
      + `y solo se representa ${cod.offset}…${tope.toFixed(1)} ${perfil.unidad}`);
  }

  const meses = [];
  for (let m = 1; m <= 12; m++) {
    const { png, dias, conDato } = empaquetarMes(celdas, anio, m, cod);
    if (!conDato) continue;                       // un mes sin una sola hora no se publica
    const nombre = `${perfil.prefijo}-${anio}-${String(m).padStart(2, '0')}.png`;
    writeFileSync(join(salida, nombre), png);
    meses.push({ clave: String(m).padStart(2, '0'), archivo: nombre, dias,
      horasConDato: conDato / (ANCHO * ALTO), bytes: png.length });
    console.log(`  ${nombre}  ${dias} días · ${(conDato / (ANCHO * ALTO)).toFixed(0)} horas con dato · ${(png.length / 1024).toFixed(1)} KiB`);
  }
  if (!meses.length) throw new Error('no se pudo publicar ni un mes');

  const ficha = {
    capa: perfil.capa,
    titulo: perfil.titulo,
    departamentos: DEPARTAMENTOS,
    bbox: [OESTE, SUR, ESTE, NORTE],
    ancho: ANCHO, alto: ALTO,
    // Iguales A PROPÓSITO: el píxel ES la celda medida. No se remuestrea nada y
    // por eso la pantalla no tiene que avisar de un muestreo que no existe.
    resolucion_m: 111000, resolucion_nativa_m: 111000,
    remuestreo_pantalla: 'nearest',
    remuestreo: 'ninguno: cada píxel es una celda de 1° medida. Se pinta a cuadros '
      + 'porque a cuadros es como está medido; suavizarlo dibujaría un degradado que nadie midió.',
    unidad: perfil.unidad,
    codificacion: cod,
    valorMaximoRepresentable: tope,
    // Los extremos de lo que de verdad se publicó. La pantalla los usa para no
    // prometer una escala que el dato no llena.
    medido: { min: +vMin.toFixed(2), max: +vMax.toFixed(2) },
    cuadros: { horas: 24, porFila: 24, celdaAncho: ANCHO, celdaAlto: ALTO },
    anio,
    meses,
    // LAS TRES FECHAS. La pantalla las lee de aquí y nunca del código.
    ultimoDiaConHoras, ultimoDiaConTotal,
    construido: new Date().toISOString(),
    // El resumen de cada día, con nombre GENÉRICO: en el sol es la energía y en
    // la temperatura la máxima. Un nombre por producto obligaría a la pantalla a
    // saber cuál está abriendo, que es justo lo que este motor evita.
    resumenDiario: diario,
    resumenDiarioEtiqueta: perfil.resumenDiarioEtiqueta,
    resumenDiarioUnidad: perfil.resumenDiarioUnidad,
    resumenDiarioAviso: perfil.resumenDiarioAviso,
    rampa: perfil.rampa,
    hipotesisMarcadaEnRampa: perfil.hipotesisMarcadaEnRampa,
    etiquetaHipotesis: perfil.etiquetaHipotesis,
    aviso: perfil.aviso,
    fuente: perfil.fuente,
    atribucion: 'These data were obtained from the NASA Langley Research Center POWER Project',
    licencia: 'Datos libres; NASA solicita citar el proyecto POWER',
  };
  writeFileSync(join(salida, `${perfil.prefijo}.json`), JSON.stringify(ficha, null, 1));

  const pesoTotal = meses.reduce((s, m) => s + m.bytes, 0);
  console.log(`\n✅ ${meses.length} meses · ${(pesoTotal / 1024).toFixed(0)} KiB de dato`);
  console.log(`   medido ${vMin.toFixed(1)} … ${vMax.toFixed(1)} ${perfil.unidad}`);
  console.log(`   horas hasta ${ultimoDiaConHoras} · resumen del día hasta ${ultimoDiaConTotal}`);
  return ficha;
}

/** Punto de entrada compartido por los dos envoltorios y por el `--capa` de aquí. */
export function correr(perfil) {
  const iSal = process.argv.indexOf('--salida');
  const salida = iSal > 0 ? process.argv[iSal + 1] : 'web/public/mapas';
  construirAtlas(perfil, { salida })
    .catch((e) => { console.error('\n❌', e.message); process.exit(1); });
}

// Ejecutado directamente: `--capa sol` o `--capa temperatura`.
if (process.argv[1] && process.argv[1].endsWith('atlas-caribe.mjs')) {
  const iCapa = process.argv.indexOf('--capa');
  const clave = iCapa > 0 ? process.argv[iCapa + 1] : null;
  const perfil = PERFILES[clave];
  if (!perfil) {
    console.error(`❌ falta --capa: ${Object.keys(PERFILES).join(' | ')}`);
    process.exit(1);
  }
  correr(perfil);
}
