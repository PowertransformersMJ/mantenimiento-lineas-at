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
//
// ⚠️ EL PATRÓN MIRA SOLO LA ETIQUETA —el primer campo de la fila—, NUNCA LOS
// VALORES. Hasta el 16-09 se probaba contra la fila entera, y medido sobre un
// mes real un patrón corto —las tres cifras de un código de línea— arrastraba
// decenas de miles de filas de otras bahías solo porque un VALOR llevaba esas
// cifras. Con una sola línea en el parque no se notaba: su patrón no se parecía
// a ningún número.
//
// ⚠️ CERO FILAS ES UN ERROR, NO UN MES VACÍO. La etiqueta del SCADA rellena cada
// tramo con espacios («/SubA  /66kV    /BAHIA1  /I R     /Momento»). Un patrón
// escrito sin ese relleno no encontraba nada y la herramienta terminaba «bien»,
// con la carpeta de destino vacía. Ahora sale con error, no escribe nada y, si
// recortando los espacios el patrón sí encontraría algo, dice qué.
//
// ⚠️ UNA SOLA BAHÍA, COMPROBADA. Se imprimen las etiquetas distintas que se
// eligieron, y si pertenecen a más de una bahía NO SE ESCRIBE NADA y sale con
// error. La bahía son los tres primeros tramos de la etiqueta entre «/» —
// subestación, tensión y bahía—, con sus espacios recortados y sin distinguir
// mayúsculas, igual que el patrón. Mezclar dos bahías en una carga daría a la
// línea las corrientes de otra, y el histórico no se borra.
// ============================================================================
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { celdasDeCsv, separadorDe } from '../importar/csv.js';

const [origen, destino, patron] = process.argv.slice(2);
if (!origen || !destino || !patron) {
  console.error('uso: node herramientas/extraer-bahia.mjs <origen> <destino> <patrón>');
  process.exit(2);
}
let re;
try {
  re = new RegExp(patron, 'i');
} catch (e) {
  console.error(`❌ El patrón «${patron}» no es una expresión regular válida: ${e.message}`);
  process.exit(2);
}

/** Los días son las subcarpetas; si no hay, la carpeta misma es un día. */
function carpetasDeDia(raiz) {
  const hijos = readdirSync(raiz).filter((n) => !n.startsWith('.'));
  const dirs = hijos.filter((n) => statSync(join(raiz, n)).isDirectory());
  return dirs.length ? dirs.map((n) => join(raiz, n)) : [raiz];
}

/**
 * La etiqueta de la señal: el PRIMER campo de la fila, con el separador del
 * archivo. Si viene entre comillas se lee con la regla del lector, que sabe
 * que una coma dentro de las comillas no separa nada.
 */
function etiquetaDe(linea, separador) {
  if (linea.startsWith('"')) return String(celdasDeCsv(linea, { separador })[0]?.[0] ?? '');
  const i = linea.indexOf(separador);
  return i < 0 ? linea : linea.slice(0, i);
}

/** Los tramos de la etiqueta entre «/», sin el relleno de espacios. */
const tramosDe = (etiqueta) => etiqueta.trim().replace(/^\//, '').split('/').map((t) => t.trim());

/** La bahía: subestación, tensión y bahía —los tres primeros tramos—. */
const bahiaDe = (etiqueta) => `/${tramosDe(etiqueta).slice(0, 3).join('/')}`;

let totalArchivos = 0; let totalFilas = 0; let vacios = 0; let csvLeidos = 0;
const resumen = [];
const plan = [];                 // lo que se escribirá, solo si todo cuadra
const elegidas = new Map();      // etiqueta tal cual → filas
const bahias = new Map();        // bahía en mayúsculas → { nombre, filas }
const vistas = new Set();        // todas las etiquetas leídas: para explicar un cero

// PRIMERO SE LEE Y SE ELIGE, SIN ESCRIBIR. Así, si el resultado no es una sola
// bahía, el destino no recibe ni un archivo a medias.
for (const dia of carpetasDeDia(origen)) {
  const salida = join(destino, basename(dia));
  const archivos = [];
  let filasDelDia = 0;

  for (const nombre of readdirSync(dia).filter((n) => /\.csv$/i.test(n))) {
    csvLeidos += 1;
    const texto = readFileSync(join(dia, nombre), 'utf8');
    const lineas = texto.split(/\r?\n/);
    // La primera línea no vacía es el eje de tiempo: se conserva SIEMPRE, o el
    // archivo deja de ser una matriz ancha y no hay de dónde sacar las horas.
    const iEje = lineas.findIndex((l) => l.trim() !== '');
    if (iEje < 0) { vacios += 1; continue; }
    const separador = separadorDe(lineas[iEje]);
    const suyas = [];
    for (const l of lineas.slice(iEje + 1)) {
      if (l.trim() === '') continue;
      const etiqueta = etiquetaDe(l, separador);
      vistas.add(etiqueta);
      if (!re.test(etiqueta)) continue;
      suyas.push(l);
      elegidas.set(etiqueta, (elegidas.get(etiqueta) ?? 0) + 1);
      const bahia = bahiaDe(etiqueta);
      const clave = bahia.toUpperCase();
      const b = bahias.get(clave) ?? { nombre: bahia, filas: 0 };
      b.filas += 1;
      bahias.set(clave, b);
    }
    if (!suyas.length) { vacios += 1; continue; }
    // Con dos bahías ya no se va a escribir: se sigue contando, pero no se
    // guarda el texto, que con un patrón demasiado corto sería media red.
    if (bahias.size <= 1) archivos.push({ nombre, texto: [lineas[iEje], ...suyas].join('\n') + '\n' });
    filasDelDia += suyas.length;
    totalFilas += suyas.length;
  }
  plan.push({ salida, archivos });
  resumen.push({ dia: basename(dia), archivos: archivos.length, filas: filasDelDia });
}

// LAS ETIQUETAS ELEGIDAS, entre «» para que se vean sus espacios. Una bahía son
// unas ocho; si salen cientos, el patrón es demasiado ancho y basta con ver el
// principio (las bahías, en cambio, se listan todas más abajo).
const TOPE_DE_ETIQUETAS = 60;
if (elegidas.size) {
  console.log(`Etiquetas elegidas por «${patron}» (${elegidas.size}):`);
  const orden = [...elegidas].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [etiqueta, filas] of orden.slice(0, TOPE_DE_ETIQUETAS)) {
    console.log(`  ${String(filas).padStart(7)} fila(s)  «${etiqueta}»`);
  }
  if (orden.length > TOPE_DE_ETIQUETAS) console.log(`  … y ${orden.length - TOPE_DE_ETIQUETAS} etiqueta(s) más`);
  console.log('');
}

if (!csvLeidos) {
  // Sin ningún CSV la culpa no es del patrón: p. ej. un mes que el portal no dejó
  // descargar trae solo avisos .txt. Echarle la culpa a los espacios despistaba.
  console.error(`❌ En «${origen}» no hay NINGÚN archivo CSV: no hay nada que elegir. No se escribe nada.`);
  console.error('   ¿Es la carpeta del mes correcta? ¿Faltó el paso 0 (.xls → CSV)?');
  process.exit(1);
}

if (!totalFilas) {
  console.error(`❌ El patrón «${patron}» no eligió NINGUNA fila en «${origen}». No se escribe nada.`);
  console.error('   La etiqueta del SCADA rellena cada tramo con espacios («/SubA  /66kV    /BAHIA1  /…»):');
  console.error('   el patrón tiene que llevarlos tal cual, o usar « *» o «.*» donde van.');
  // Una pista, no una elección: con los espacios de relleno recortados a los dos
  // lados, ¿encontraría algo? Se dice qué, y él decide.
  let sinRelleno = null;
  try { sinRelleno = new RegExp(patron.replace(/ *\/ */g, '/'), 'i'); } catch { /* sin pista */ }
  if (sinRelleno) {
    const cerca = new Map();
    for (const etiqueta of vistas) {
      if (sinRelleno.test(`/${tramosDe(etiqueta).join('/')}`)) {
        const bahia = bahiaDe(etiqueta);
        cerca.set(bahia.toUpperCase(), bahia);
      }
    }
    if (cerca.size) {
      const lista = [...cerca.values()].sort();
      console.error(`   Recortando esos espacios, el patrón sí encontraría ${lista.length} bahía(s):`);
      for (const b of lista.slice(0, 10)) console.error(`     ${b}`);
      if (lista.length > 10) console.error(`     … y ${lista.length - 10} más`);
    }
  }
  process.exit(1);
}

if (bahias.size > 1) {
  console.error(`❌ El patrón «${patron}» eligió filas de ${bahias.size} bahías distintas. No se escribe nada:`);
  for (const { nombre, filas } of [...bahias.values()].sort((a, b) => b.filas - a.filas)) {
    console.error(`  ${String(filas).padStart(7)} fila(s)  ${nombre}`);
  }
  console.error('   Afine el patrón hasta que nombre una sola: subestación, tensión y bahía.');
  process.exit(1);
}

for (const { salida, archivos } of plan) {
  mkdirSync(salida, { recursive: true });
  for (const { nombre, texto } of archivos) writeFileSync(join(salida, nombre), texto);
  totalArchivos += archivos.length;
}

for (const r of resumen) {
  console.log(`${r.dia.padEnd(10)} ${String(r.archivos).padStart(3)} archivo(s) · ${r.filas} fila(s)`);
}
console.log(`\n${totalArchivos} archivo(s) escritos · ${totalFilas} fila(s) · `
  + `${vacios} archivo(s) sin ninguna señal de esa bahía (no se escriben: un archivo vacío `
  + `parecería un día sin dato)`);
console.log(`Bahía: ${[...bahias.values()][0].nombre}`);
