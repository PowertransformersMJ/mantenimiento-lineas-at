#!/usr/bin/env node
// ============================================================================
// herramientas/extraer-bahia.mjs — quedarse con las señales de UNA bahía
// ----------------------------------------------------------------------------
// QUÉ RESUELVE (`99 §ADR-117`). El Ingeniero exporta del SCADA la RED ENTERA:
// cada archivo trae ~3.000 señales de decenas de subestaciones y pesa medio
// mega. Un mes son ~1.000 archivos y **509 MB**. De todo eso, a una línea le
// importan ocho señales: sus tres tensiones compuestas, sus tres corrientes de
// fase y sus dos potencias.
//
// Esto NO transforma el dato: **selecciona filas**. Es exactamente lo que hace a
// mano el selector de señales de la pantalla —«de estas 3.000, éstas ocho»—,
// hecho antes de subir. Se conserva la fila del eje de tiempo tal cual, la
// etiqueta tal cual y los valores tal cual; no se redondea, no se convierte, no
// se rellena. Un archivo de salida abierto en Excel dice lo mismo que el suyo.
//
// ⚠️ Y NO TOCA SUS ORIGINALES. Escribe en otra carpeta. Si algún día hay que
// rehacerlo con otro criterio, el crudo sigue donde estaba.
//
//   node herramientas/extraer-bahia.mjs <carpeta-origen> <carpeta-destino> <patrón>
//
// El patrón es una expresión regular contra la etiqueta de la señal, p. ej.
// «/SubA .*/PROELECT/». Se exige a propósito: no hay bahía por defecto, porque
// adivinarla sería elegir por él de qué línea son los datos.
// ============================================================================
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const [origen, destino, patron] = process.argv.slice(2);
if (!origen || !destino || !patron) {
  console.error('uso: node herramientas/extraer-bahia.mjs <origen> <destino> <patrón>');
  process.exit(2);
}
const re = new RegExp(patron, 'i');

/** Los días son las subcarpetas; si no hay, la carpeta misma es un día. */
function carpetasDeDia(raiz) {
  const hijos = readdirSync(raiz).filter((n) => !n.startsWith('.'));
  const dirs = hijos.filter((n) => statSync(join(raiz, n)).isDirectory());
  return dirs.length ? dirs.map((n) => join(raiz, n)) : [raiz];
}

let totalArchivos = 0; let totalFilas = 0; let vacios = 0;
const resumen = [];

for (const dia of carpetasDeDia(origen)) {
  const salida = join(destino, basename(dia));
  mkdirSync(salida, { recursive: true });
  let delDia = 0; let filasDelDia = 0;

  for (const nombre of readdirSync(dia).filter((n) => /\.csv$/i.test(n))) {
    const texto = readFileSync(join(dia, nombre), 'utf8');
    const lineas = texto.split(/\r?\n/);
    // La primera línea no vacía es el eje de tiempo: se conserva SIEMPRE, o el
    // archivo deja de ser una matriz ancha y no hay de dónde sacar las horas.
    const iEje = lineas.findIndex((l) => l.trim() !== '');
    if (iEje < 0) { vacios += 1; continue; }
    const suyas = lineas.slice(iEje + 1).filter((l) => re.test(l));
    if (!suyas.length) { vacios += 1; continue; }
    writeFileSync(join(salida, nombre), [lineas[iEje], ...suyas].join('\n') + '\n');
    delDia += 1; filasDelDia += suyas.length;
  }
  totalArchivos += delDia; totalFilas += filasDelDia;
  resumen.push({ dia: basename(dia), archivos: delDia, filas: filasDelDia });
}

for (const r of resumen) {
  console.log(`${r.dia.padEnd(10)} ${String(r.archivos).padStart(3)} archivo(s) · ${r.filas} fila(s)`);
}
console.log(`\n${totalArchivos} archivo(s) escritos · ${totalFilas} fila(s) · `
  + `${vacios} archivo(s) sin ninguna señal de esa bahía (no se escriben: un archivo vacío `
  + `parecería un día sin dato)`);
