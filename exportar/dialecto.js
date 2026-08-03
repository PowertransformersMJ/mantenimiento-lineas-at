// ============================================================================
// exportar/dialecto.js — cómo se escribe una celda, en UN solo sitio
// ----------------------------------------------------------------------------
// Los tres exportadores de CSV del proyecto —`csv.js` (levantamiento),
// `mecanica.js` (memoria de cálculo) y `bom.js` (cantidades)— escriben con las
// MISMAS reglas. Cuando cada uno llevaba su copia, la regla se corregía en uno
// y no en los otros: el día que eso pasara, un archivo saldría con coma decimal
// y otro con punto, y solo uno de los dos sumaría en Excel. El refactor estaba
// anotado en `mecanica.js`; la auditoría de la ola 4 (§ADR-013) lo hizo urgente
// al encontrar el mismo agujero copiado en los tres.
//
// LOS DOS DIALECTOS
//   · 'excel'  → para el Excel en español del Ingeniero: BOM + `sep=;` + CRLF
//                + COMA decimal.
//   · 'datos'  → RFC 4180 puro para QGIS/pandas/R: coma de columna, PUNTO
//                decimal, UTF-8 sin BOM.
//
// JavaScript puro: sin DOM, sin red.
// ============================================================================

/**
 * Caracteres con los que Excel, LibreOffice y Google Sheets interpretan la
 * celda como una FÓRMULA en vez de como texto.
 *
 * Las comillas del CSV no protegen de esto: se las come el analizador del
 * formato, y lo que llega a la hoja es el contenido. Una estructura que la
 * cuadrilla grabó en el GPS como `=1+1` deja la columna mostrando un `2` o un
 * `#NAME?`, y la hoja archivada junto al expediente ya no dice a qué apoyo
 * pertenece la fila. El nombre viene de datos de campo, así que esto no es
 * hipotético (§ADR-013, hallazgo 18).
 *
 * El TAB y el CR entran en la lista porque algunas versiones los tratan como
 * espacio inicial y evalúan lo que venga detrás.
 */
const ARRANQUES_DE_FORMULA = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Deja el texto tal cual, salvo que empiece por algo que la hoja de cálculo
 * evaluaría: entonces le antepone un apóstrofo, que es la marca universal de
 * «esto es texto» y que las hojas no muestran.
 *
 * ⚠️ Solo para TEXTO. Los números NO pasan por aquí: un tiro de −340 kgf empieza
 * por `-` y prefijarlo lo convertiría en texto, que es justo el defecto que este
 * archivo existe para no cometer.
 */
export function neutralizarFormula(texto) {
  const s = String(texto ?? '');
  return ARRANQUES_DE_FORMULA.includes(s[0]) ? `'${s}` : s;
}

/**
 * Herramientas de escritura del dialecto elegido.
 *
 * @param {{dialecto?: 'excel'|'datos'}} [opciones]
 */
export function dialectoCsv(opciones = {}) {
  const excel = (opciones.dialecto ?? 'excel') === 'excel';
  const sep = excel ? ';' : ',';

  /**
   * Texto: comillas dobladas (RFC 4180 en ambos dialectos) y, antes de eso,
   * neutralizado contra la evaluación como fórmula.
   */
  const q = (s) => `"${neutralizarFormula(s).replace(/"/g, '""')}"`;

  /**
   * Número con `d` decimales, o celda VACÍA si no hay número que escribir.
   * `null`, `undefined`, `NaN` e `Infinity` caen todos aquí: un «NaN» impreso en
   * una memoria de cálculo se lee como una cifra rara, y un «Infinity» se lee
   * como un tiro enorme. Ninguno de los dos es un dato; la celda vacía sí dice
   * la verdad, que es que ese valor no se pudo calcular.
   */
  const num = (v, d = 2) =>
    (Number.isFinite(v) ? (excel ? v.toFixed(d).replace('.', ',') : v.toFixed(d)) : '');

  /** Conteos: enteros sin decimales (un «3,00» en la columna de vanos chirría). */
  const ent = (v) => (Number.isFinite(v) ? String(Math.trunc(v)) : '');

  /**
   * Booleano de TRES estados. `null` no es `false`: decir «no» donde nadie pudo
   * medir es afirmar que se cumple. Se escribe «no evaluable», con esas palabras.
   */
  const siNo = (v) => (v === true ? 'si' : v === false ? 'no' : 'no evaluable');

  const fila = (celdas) => celdas.join(sep);

  return { excel, sep, q, num, ent, siNo, fila };
}
