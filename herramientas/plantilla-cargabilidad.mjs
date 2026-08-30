// ============================================================================
// plantilla-cargabilidad.mjs — el Excel MODELO para cargar cargabilidad
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE (`99 §ADR-088`). El Ingeniero lo pidió el 2026-08-29: «entrégame
// un documento en excel modelo de tal manera que lo interpretes». Es el camino
// simple: una hoja con las columnas que el detector reconoce a la primera, para
// llenar a mano o pegar desde donde sea.
//
// ⚠️ LA HOJA DE DATOS VA VACÍA, solo con su cabecera. Ni una fila de ejemplo:
// «no coloques información basura en el módulo de cargabilidad» (orden del
// 29-08). El ejemplo vive en la hoja de INSTRUCCIONES, donde nadie lo va a
// confundir con una medición — y si alguien carga la plantilla sin llenarla, la
// aplicación dirá «ninguna fila con datos», que es la verdad.
//
// ⚠️ Y SE ESCRIBE A MANO, sin librería. Un `.xlsx` es un ZIP con XML y aquí las
// piezas van SIN COMPRIMIR (método 0), que no necesita nada: es el mismo
// criterio que el lector (`importar/xlsx.js`) — cero dependencias en un repo
// público. También mantiene intacto que el único Python del repo siga siendo el
// generador de teselas.
//
//   uso:  node herramientas/plantilla-cargabilidad.mjs [salida.xlsx]
// ============================================================================
import { writeFileSync } from 'node:fs';
import { crc32 } from 'node:zlib';

const SALIDA = process.argv[2] ?? 'Plantilla-Cargabilidad-Lineas-AT.xlsx';

/**
 * LAS COLUMNAS, en el orden en que se leen y con el nombre que el detector
 * reconoce sin ayuda. La fuente de verdad es `nucleo/cargabilidad.js`; aquí se
 * escriben los nombres CANÓNICOS, que son los primeros de cada lista de
 * sinónimos, para que la plantilla acierte siempre a la primera.
 */
const COLUMNAS = [
  ['Fecha', 'OBLIGATORIA', 'dd/mm/aaaa', 'El día de la medición. 22/07/2026'],
  ['Hora', 'recomendada', '0 a 23', 'La hora, entera. Sin ella el registro no entra en el mapa de calor ni en el hora a hora'],
  ['Línea', 'OBLIGATORIA', 'texto', 'El nombre con el que usted la reconoce. LN-627'],
  ['Circuito', 'opcional', 'texto', 'Si la línea tiene más de uno. Distingue dos históricos de la misma línea'],
  ['Subestación origen', 'opcional', 'texto', ''],
  ['Subestación destino', 'opcional', 'texto', ''],
  ['Cargabilidad', 'opcional', '% (0 a 400)', 'Si ya viene calculada. Si no la trae pero sí Corriente y Capacidad nominal, la calcula el sistema'],
  ['Corriente', 'opcional', 'amperios', 'La que de verdad circuló. Es el dato que hace evaluable el indicador de ampacidad'],
  ['Potencia activa', 'opcional', 'MW', ''],
  ['Potencia reactiva', 'opcional', 'MVAr', ''],
  ['Tensión', 'opcional', 'kV', ''],
  ['Capacidad nominal', 'opcional', 'amperios', 'La capacidad de placa contra la que su informe calcula el porcentaje'],
  ['Estado', 'opcional', 'texto', 'Condición operativa, si la registra'],
  ['Observaciones', 'opcional', 'texto', ''],
];

const INSTRUCCIONES = [
  ['CÓMO SE LLENA ESTA PLANTILLA'],
  [''],
  ['1. Llene la hoja «Cargabilidad»: UNA FILA POR CADA HORA MEDIDA de cada línea.'],
  ['2. No cambie los nombres de la fila 1. Si los cambia, el sistema igual deja mapearlos a mano.'],
  ['3. Deje VACÍA la celda que no tenga dato. NUNCA escriba 0 para decir «no se midió»:'],
  ['   en una línea de transmisión el 0 significa que estuvo fuera de servicio, que es otra cosa.'],
  ['4. Puede añadir columnas suyas: no estorban, el sistema las enseña como «sin asignar».'],
  ['5. Si vuelve a cargar el mismo día corregido, NO se duplica: se reemplaza esa hora.'],
  [''],
  ['LO QUE SIGNIFICA CADA COLUMNA'],
  ['Columna', 'Hace falta', 'Formato', 'Qué es'],
  ...COLUMNAS,
  [''],
  ['UN EJEMPLO, PARA QUE SE VEA LA FORMA'],
  ['⚠️ Es un ejemplo de FORMATO y va aquí a propósito, no en la hoja de datos:'],
  ['   un ejemplo mezclado con mediciones de verdad deja de distinguirse de una.'],
  ['Fecha', 'Hora', 'Línea', 'Corriente', 'Capacidad nominal'],
  ['22/07/2026', '17', 'LN-627', '453', '718'],
  ['22/07/2026', '18', 'LN-627', '457', '718'],
  [''],
  ['SI SU DATO VIENE DE SCADA, NO HACE FALTA ESTA PLANTILLA'],
  ['Una exportación de SCADA suele venir TRANSPUESTA: los sellos de tiempo en una fila'],
  ['y cada señal en su propia fila (por ejemplo la corriente de las fases R, S y T).'],
  ['Ese formato se lee tal cual, sin pasarlo a esta plantilla. Si el suyo no se lee,'],
  ['dígalo: se añade su forma en vez de obligarle a reescribir el archivo.'],
];

// ── Escribir un .xlsx sin comprimir ─────────────────────────────────────────

const XML = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Una hoja con celdas de texto en línea: sin tabla de cadenas que mantener. */
function hoja(filas) {
  const cuerpo = filas.map((celdas, f) => {
    const cs = celdas.map((v, c) => (v === '' || v == null ? '' :
      `<c r="${letra(c)}${f + 1}" t="inlineStr"><is><t xml:space="preserve">${XML(v)}</t></is></c>`)).join('');
    return `<row r="${f + 1}">${cs}</row>`;
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<sheetData>${cuerpo}</sheetData></worksheet>`;
}

function letra(i) {
  let n = i + 1; let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

const LIBRO = '<?xml version="1.0" encoding="UTF-8"?>'
  + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
  + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
  + '<sheets><sheet name="Cargabilidad" sheetId="1" r:id="rId1"/>'
  + '<sheet name="Instrucciones" sheetId="2" r:id="rId2"/></sheets></workbook>';

const RELS = '<?xml version="1.0" encoding="UTF-8"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
  + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
  + '</Relationships>';

const RELS_RAIZ = '<?xml version="1.0" encoding="UTF-8"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
  + '</Relationships>';

const TIPOS = '<?xml version="1.0" encoding="UTF-8"?>'
  + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  + '<Default Extension="xml" ContentType="application/xml"/>'
  + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
  + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
  + '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
  + '</Types>';

/**
 * Un ZIP con todas las piezas GUARDADAS (método 0).
 *
 * Sin compresión no hace falta nada: las cabeceras del ZIP son unos cuantos
 * enteros y el CRC lo da `node:zlib`. Un `.xlsx` de 6 KB no necesita comprimirse,
 * y a cambio este archivo no depende de nada.
 */
function zip(piezas) {
  const trozos = []; const central = []; let desplazamiento = 0;
  const cab = (firma, extra, nombre, datos) => {
    const b = Buffer.alloc(extra.length + 4);
    b.writeUInt32LE(firma, 0); extra.copy(b, 4);
    return Buffer.concat([b, Buffer.from(nombre, 'utf-8'), datos ?? Buffer.alloc(0)]);
  };

  for (const [nombre, texto] of piezas) {
    const datos = Buffer.from(texto, 'utf-8');
    const crc = crc32(datos);
    const local = Buffer.alloc(26);
    local.writeUInt16LE(20, 0);   // versión necesaria
    local.writeUInt16LE(0, 2);    // banderas
    local.writeUInt16LE(0, 4);    // método 0 = guardado
    local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8);   // hora y fecha
    local.writeUInt32LE(crc, 10);
    local.writeUInt32LE(datos.length, 14);
    local.writeUInt32LE(datos.length, 18);
    local.writeUInt16LE(Buffer.byteLength(nombre), 22);
    local.writeUInt16LE(0, 24);
    const bloque = cab(0x04034b50, local, nombre, datos);
    trozos.push(bloque);

    const c = Buffer.alloc(42);
    c.writeUInt16LE(20, 0); c.writeUInt16LE(20, 2);
    c.writeUInt16LE(0, 4); c.writeUInt16LE(0, 6);
    c.writeUInt16LE(0, 8); c.writeUInt16LE(0, 10);
    c.writeUInt32LE(crc, 12);
    c.writeUInt32LE(datos.length, 16); c.writeUInt32LE(datos.length, 20);
    c.writeUInt16LE(Buffer.byteLength(nombre), 24);
    c.writeUInt16LE(0, 26); c.writeUInt16LE(0, 28);
    c.writeUInt16LE(0, 30); c.writeUInt16LE(0, 32);
    c.writeUInt32LE(0, 34);
    c.writeUInt32LE(desplazamiento, 38);
    central.push(cab(0x02014b50, c, nombre));
    desplazamiento += bloque.length;
  }

  const dir = Buffer.concat(central);
  const fin = Buffer.alloc(18);
  fin.writeUInt16LE(0, 0); fin.writeUInt16LE(0, 2);
  fin.writeUInt16LE(piezas.length, 4); fin.writeUInt16LE(piezas.length, 6);
  fin.writeUInt32LE(dir.length, 8);
  fin.writeUInt32LE(desplazamiento, 12);
  fin.writeUInt16LE(0, 16);
  return Buffer.concat([...trozos, dir, cab(0x06054b50, fin, '')]);
}

const libro = zip([
  ['[Content_Types].xml', TIPOS],
  ['_rels/.rels', RELS_RAIZ],
  ['xl/workbook.xml', LIBRO],
  ['xl/_rels/workbook.xml.rels', RELS],
  // ⚠️ La hoja de datos: SOLO la cabecera. Ni una fila de ejemplo.
  ['xl/worksheets/sheet1.xml', hoja([COLUMNAS.map((c) => c[0])])],
  ['xl/worksheets/sheet2.xml', hoja(INSTRUCCIONES)],
]);

writeFileSync(SALIDA, libro);
console.log(`✅ ${SALIDA} · ${libro.length} bytes · hoja de datos con ${COLUMNAS.length} columnas y CERO filas`);
