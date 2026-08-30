// ============================================================================
// importar/xlsx.js — leer un .xlsx SIN una sola dependencia
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE, Y POR QUÉ NO ES UNA LIBRERÍA. Este proyecto no leía Excel, así
// que había que traer un tercero — y traer un tercero aquí tiene un precio que
// se paga en tres sitios: licencia (repo PÚBLICO y uso comercial), peso del
// paquete que baja el navegador, y una dependencia más que mantener viva. La
// alternativa resultó ser mejor que las tres: **la plataforma ya sabe hacerlo**.
//
// Un `.xlsx` es un ZIP con XML dentro. Y `DecompressionStream('deflate-raw')` es
// una API web estándar que descomprime — está en el navegador y en Node. Lo
// único que faltaba era recorrer el índice del ZIP y leer dos XML. Eso es lo que
// hay aquí: ~200 líneas, cero dependencias, cero licencia que revisar, cero
// bytes añadidos al paquete que baja el Ingeniero.
//
// Es la misma decisión que ya tomó este proyecto con los mapas (PMTiles servido
// por nosotros), con el GPX y con las rejillas PNG: **antes leerlo nosotros que
// depender de alguien que un día cambie de licencia** (`31 · L-03/L-10`).
//
// ⚠️ QUÉ **NO** HACE, dicho aquí para que nadie lo descubra tarde:
//   · **No lee `.xls`** (el binario viejo de Excel 97-2003). Ése no es un ZIP y
//     necesitaría un lector entero distinto. Se detecta y se dice con palabras:
//     «guárdelo como .xlsx», que es un clic.
//   · **No evalúa fórmulas.** Lee el valor CACHEADO que Excel dejó escrito. Si
//     una hoja se guardó sin recalcular, ese valor es el viejo — y eso le pasa
//     igual a cualquier librería.
//   · **No interpreta formatos de celda.** Una fecha llega como el número que
//     es (serial de Excel) y quien la convierte es `nucleo/cargabilidad.js`,
//     que ya sabe de qué día parte la cuenta.
//
// CERO `node:` — igual que el resto de `@lineas/importar`. Solo APIs web.
// ============================================================================

const TEXTO = new TextDecoder('utf-8');

/** Lectura de enteros pequeños en little-endian, que es como escribe ZIP. */
const u16 = (v, p) => v.getUint16(p, true);
const u32 = (v, p) => v.getUint32(p, true);

const FIRMA_EOCD = 0x06054b50;   // fin del directorio central
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_LOCAL = 0x04034b50;

/**
 * El índice del ZIP: nombre → dónde empiezan sus bytes y cómo están guardados.
 *
 * Se lee el DIRECTORIO CENTRAL y no las cabeceras locales una tras otra, que es
 * lo que hace un lector ingenuo: la cabecera local puede traer los tamaños en
 * cero y remitirlos a un descriptor que va DESPUÉS de los datos, y entonces no
 * se sabe dónde termina el archivo hasta haberlo leído. El directorio central
 * siempre los tiene.
 */
function indiceDelZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // El EOCD va al final y puede llevar un comentario detrás, así que se busca
  // hacia atrás. 65.557 = 22 de cabecera + 65.535 de comentario máximo.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(v, i) === FIRMA_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('no parece un archivo .xlsx: no se encuentra el índice del ZIP');

  const nEntradas = u16(v, eocd + 10);
  const inicioCentral = u32(v, eocd + 16);
  if (nEntradas === 0xffff || inicioCentral === 0xffffffff) {
    // ZIP64. Un Excel de estas dimensiones no es un informe de cargabilidad, es
    // otra cosa — y leerlo mal en silencio sería peor que negarse.
    throw new Error('el archivo usa ZIP64 (más de 65.535 piezas o más de 4 GB): no está soportado');
  }

  const entradas = new Map();
  let p = inicioCentral;
  for (let i = 0; i < nEntradas; i++) {
    if (u32(v, p) !== FIRMA_CENTRAL) throw new Error('el índice del ZIP está corrupto');
    const metodo = u16(v, p + 10);
    const comprimido = u32(v, p + 20);
    const largoNombre = u16(v, p + 28);
    const largoExtra = u16(v, p + 30);
    const largoComentario = u16(v, p + 32);
    const desplazamiento = u32(v, p + 42);
    const nombre = TEXTO.decode(bytes.subarray(p + 46, p + 46 + largoNombre));
    entradas.set(nombre, { metodo, comprimido, desplazamiento });
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return { v, entradas };
}

/** Los bytes de UNA pieza del ZIP, ya descomprimidos. */
async function sacarDelZip(bytes, { v, entradas }, nombre) {
  const e = entradas.get(nombre);
  if (!e) return null;
  if (u32(v, e.desplazamiento) !== FIRMA_LOCAL) throw new Error(`«${nombre}» no está donde dice el índice`);
  const inicio = e.desplazamiento + 30 + u16(v, e.desplazamiento + 26) + u16(v, e.desplazamiento + 28);
  const crudo = bytes.subarray(inicio, inicio + e.comprimido);

  if (e.metodo === 0) return crudo;                        // guardado tal cual
  if (e.metodo !== 8) throw new Error(`«${nombre}» usa una compresión que no se conoce (método ${e.metodo})`);

  // `deflate-raw` y no `deflate`: dentro de un ZIP los datos van SIN la
  // cabecera zlib. Pedir `deflate` falla con un error que no dice esto.
  const flujo = new Blob([crudo]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

// ── El XML, leído a mano y solo lo que hace falta ──────────────────────────
//
// No hay `DOMParser` en Node y no se va a traer uno: de estos dos archivos solo
// se necesitan las cadenas y las celdas, y eso se recorre con un escáner. Lo que
// SÍ hay que hacer bien son las entidades, o un nombre con «&» o una comilla
// llegan rotos a la pantalla.

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function desescapar(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (todo, cuerpo) => {
    if (cuerpo[0] === '#') {
      const n = cuerpo[1] === 'x' ? parseInt(cuerpo.slice(2), 16) : parseInt(cuerpo.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : todo;
    }
    return ENTIDADES[cuerpo] ?? todo;
  });
}

/**
 * La tabla de cadenas compartidas. Excel guarda los textos repetidos UNA vez y
 * en las celdas pone su número: sin esto, una hoja de texto sale llena de «0».
 *
 * ⚠️ Un `<si>` puede venir partido en varios `<t>` (texto con formatos mezclados
 * dentro de la misma celda). Se concatenan: quedarse con el primero cortaría
 * «LN-627 Norte» en «LN-627».
 */
function leerCadenas(xml) {
  if (!xml) return [];
  const out = [];
  for (const si of xml.split('<si>').slice(1)) {
    const trozo = si.slice(0, si.indexOf('</si>'));
    let texto = '';
    for (const m of trozo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) texto += m[1];
    out.push(desescapar(texto));
  }
  return out;
}

/** «BC» → 54. La columna de una celda sale de su referencia, no de su orden. */
export function columnaDeRef(ref) {
  const letras = String(ref ?? '').match(/^[A-Z]+/);
  if (!letras) return null;
  let n = 0;
  for (const c of letras[0]) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Las filas de una hoja, como matriz de celdas crudas.
 *
 * ⚠️ **La posición sale del atributo `r` de cada celda, nunca del orden.** Excel
 * OMITE las celdas vacías: una fila con la columna B en blanco escribe A y C
 * seguidas, y leerlas por orden correría la C a la B — todos los valores de esa
 * fila un puesto a la izquierda, sin un solo error. Es la misma familia del
 * `30 · M-01`: la posición es un dato, no una consecuencia.
 */
function leerHoja(xml, cadenas) {
  const filas = [];
  if (!xml) return filas;
  for (const mFila of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const celdas = [];
    for (const mCelda of mFila[1].matchAll(/<c\s([^>]*)>([\s\S]*?)<\/c>|<c\s([^>]*)\/>/g)) {
      const atributos = mCelda[1] ?? mCelda[3] ?? '';
      const cuerpo = mCelda[2] ?? '';
      const ref = (atributos.match(/r="([A-Z]+\d+)"/) ?? [])[1];
      const tipo = (atributos.match(/t="([^"]+)"/) ?? [])[1] ?? 'n';
      const col = columnaDeRef(ref);
      if (col == null) continue;
      celdas[col] = valorDeCelda(tipo, cuerpo, cadenas);
    }
    filas.push(celdas);
  }
  return filas;
}

function valorDeCelda(tipo, cuerpo, cadenas) {
  const v = (cuerpo.match(/<v[^>]*>([\s\S]*?)<\/v>/) ?? [])[1];
  if (tipo === 's') {                                   // cadena compartida
    const i = Number(v);
    return Number.isInteger(i) ? (cadenas[i] ?? null) : null;
  }
  if (tipo === 'inlineStr') {
    let texto = '';
    for (const m of cuerpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) texto += m[1];
    return desescapar(texto) || null;
  }
  if (tipo === 'str') return v == null ? null : desescapar(v);   // texto de fórmula
  if (tipo === 'b') return v === '1';
  if (tipo === 'e') return null;                        // #N/D, #¡VALOR! … es un hueco
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : desescapar(v);
}

/** Qué hoja es cuál, en el orden en que las ve el usuario. */
function leerNombresDeHojas(xmlLibro, relaciones) {
  const hojas = [];
  if (!xmlLibro) return hojas;
  for (const m of xmlLibro.matchAll(/<sheet\s([^>]*)\/?>/g)) {
    const nombre = desescapar((m[1].match(/name="([^"]*)"/) ?? [])[1] ?? '');
    const rid = (m[1].match(/r:id="([^"]*)"/) ?? [])[1];
    hojas.push({ nombre, destino: relaciones.get(rid) ?? null });
  }
  return hojas;
}

function leerRelaciones(xml) {
  const out = new Map();
  if (!xml) return out;
  for (const m of xml.matchAll(/<Relationship\s([^>]*)\/?>/g)) {
    const id = (m[1].match(/Id="([^"]*)"/) ?? [])[1];
    const destino = (m[1].match(/Target="([^"]*)"/) ?? [])[1];
    if (id && destino) out.set(id, destino.replace(/^\/?(xl\/)?/, ''));
  }
  return out;
}

/**
 * LAS FILAS DE UNA MATRIZ, a partir de la fila que sea la cabecera.
 *
 * Se separa del lector a propósito: **el lector no sabe qué fila es la
 * cabecera**, y no debe saberlo — eso depende del dominio, y quien lo decide es
 * `nucleo/cargabilidad.js` mirando qué fila reconoce más campos. Un lector que
 * además adivine la cabecera es un lector con opinión, y su opinión se equivocó
 * con el primer archivo real (`99 §ADR-088`).
 */
export function filasDesde(matriz, filaCabecera = 0) {
  const cruda = matriz[filaCabecera] ?? [];
  // Una cabecera vacía se nombra por su letra, no se descarta: la columna existe
  // y su dato también, y el usuario tiene que poder mapearla.
  const cabeceras = cruda.map((c, i) => (c == null || String(c).trim() === ''
    ? `(columna ${letraDeColumna(i)})` : String(c).trim()));
  const filas = matriz.slice(filaCabecera + 1)
    .filter((f) => f.some((c) => c != null && String(c).trim() !== ''))
    .map((f) => Object.fromEntries(cabeceras.map((h, i) => [h, f[i] ?? null])));
  return { cabeceras, filas };
}

/**
 * UN `.xlsx` → sus hojas, CRUDAS y también ya despiezadas.
 *
 * Cada hoja trae su `matriz` —las celdas tal cual, sin decidir nada— y, por
 * comodidad, `cabeceras`/`filas` calculadas desde `filaCabecera`. Quien quiera
 * elegir bien la cabecera usa la `matriz` y `filasDesde()`.
 *
 * @param {ArrayBuffer|Uint8Array} datos
 * @returns {Promise<{hojas: {nombre:string, matriz:(string|number|boolean|null)[][],
 *            cabeceras:string[], filas: Record<string, string|number|boolean|null>[],
 *            nFilas:number}[]}>}
 */
export async function leerXlsx(datos, { filaCabecera = 0 } = {}) {
  const bytes = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
  if (bytes.length < 4) throw new Error('el archivo está vacío');
  // `PK` es la firma de un ZIP. Un `.xls` viejo empieza por `D0 CF 11 E0`, y
  // decirlo por su nombre ahorra que alguien crea que su archivo está roto.
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) {
    throw new Error('esto es un .xls del formato viejo (Excel 97-2003), que no es un .xlsx. '
      + 'Ábralo en Excel y use «Guardar como → Libro de Excel (.xlsx)»');
  }
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error('el archivo no es un .xlsx (no empieza por la firma de un ZIP)');
  }

  const indice = indiceDelZip(bytes);
  const texto = async (nombre) => {
    const b = await sacarDelZip(bytes, indice, nombre);
    return b ? TEXTO.decode(b) : null;
  };

  const cadenas = leerCadenas(await texto('xl/sharedStrings.xml'));
  const relaciones = leerRelaciones(await texto('xl/_rels/workbook.xml.rels'));
  let declaradas = leerNombresDeHojas(await texto('xl/workbook.xml'), relaciones);
  if (!declaradas.length) declaradas = [{ nombre: 'Hoja1', destino: 'worksheets/sheet1.xml' }];

  const hojas = [];
  for (const { nombre, destino } of declaradas) {
    const xml = await texto(`xl/${destino}`) ?? await texto('xl/worksheets/sheet1.xml');
    const matriz = leerHoja(xml, cadenas);
    const { cabeceras, filas } = filasDesde(matriz, filaCabecera);
    hojas.push({ nombre, matriz, cabeceras, filas, nFilas: filas.length });
  }
  return { hojas };
}

/** 0 → «A», 26 → «AA». El inverso de `columnaDeRef`. */
export function letraDeColumna(i) {
  let n = i + 1; let s = '';
  while (n > 0) { const resto = (n - 1) % 26; s = String.fromCharCode(65 + resto) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
