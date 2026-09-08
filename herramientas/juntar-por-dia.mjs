#!/usr/bin/env node
// ============================================================================
// herramientas/juntar-por-dia.mjs — un archivo por DÍA y ESTADÍSTICO
// ----------------------------------------------------------------------------
// QUÉ RESUELVE (`99 §ADR-119`). Tras quedarnos con la bahía, un mes son ~900
// archivos diminutos: uno por magnitud, estadístico y día. Subirlos de uno en
// uno es trabajo mecánico sin valor, y a mano se cometen errores.
//
// Esto los junta EXACTAMENTE como los juntaría el lector: comparten la fila del
// eje de tiempo —es el mismo día— y cada señal aporta su fila. No se toca un
// solo número. El resultado es el mismo dato en 1/8 de archivos.
//
// ⚠️ EL DÍA SALE DEL DATO, no del nombre. Medido en la exportación real: 46 de
// 902 archivos traen la fecha equivocada en el nombre, y una carpeta llamada
// «30Enero» resultó ser el 29 de julio. La fila de sellos de tiempo es lo único
// que el propio dato afirma sobre cuándo se midió.
//
// ⚠️ Y EL ESTADÍSTICO SÍ SALE DEL NOMBRE, porque no está en ninguna otra parte:
// el archivo resultante se llama `<estadistico>-<fecha>.csv` para que el lector
// lo siga reconociendo. Un archivo cuyo estadístico no se reconoce NO se junta
// con nadie: se deja aparte y se dice.
//
//   node herramientas/juntar-por-dia.mjs <carpeta-origen> <carpeta-destino>
// ============================================================================
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { estadisticoDeNombre, esArchivoDeCalidad } from '../nucleo/cargabilidadAncho.js';

const [origen, destino] = process.argv.slice(2);
if (!origen || !destino) {
  console.error('uso: node herramientas/juntar-por-dia.mjs <origen> <destino>');
  process.exit(2);
}
mkdirSync(destino, { recursive: true });

/** La fecha que declara la fila del eje: `15/01/26 0:00` → `20260115`. */
function fechaDelEje(cabecera) {
  const m = cabecera.match(/(\d{1,2})\/(\d{2})\/(\d{2})[ ,]/);
  return m ? `20${m[3]}${m[2]}${String(m[1]).padStart(2, '0')}` : null;
}

function archivos(raiz) {
  const out = [];
  for (const n of readdirSync(raiz).filter((x) => !x.startsWith('.'))) {
    const p = join(raiz, n);
    if (statSync(p).isDirectory()) out.push(...archivos(p));
    else if (/\.csv$/i.test(n)) out.push(p);
  }
  return out;
}

const grupos = new Map();
const sueltos = [];
for (const p of archivos(origen)) {
  const nombre = basename(p);
  if (esArchivoDeCalidad(nombre)) { sueltos.push([nombre, 'sello de calidad']); continue; }
  const est = estadisticoDeNombre(nombre).id;
  if (!est) { sueltos.push([nombre, 'el nombre no dice qué estadístico trae']); continue; }
  const lineas = readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lineas.length < 2) { sueltos.push([nombre, 'sin filas de señal']); continue; }
  const fecha = fechaDelEje(lineas[0]);
  if (!fecha) { sueltos.push([nombre, 'sin eje de tiempo reconocible']); continue; }
  const k = `${est}-${fecha}`;
  if (!grupos.has(k)) grupos.set(k, { eje: lineas[0], filas: [] });
  const g = grupos.get(k);
  // ⚠️ Si el eje no es el MISMO, no se juntan: alinear dos rejillas es
  // interpolar, y una medida interpolada no la tomó nadie.
  if (g.eje !== lineas[0]) { sueltos.push([nombre, 'su eje de tiempo no coincide con el del grupo']); continue; }
  g.filas.push(...lineas.slice(1));
}

for (const [k, g] of [...grupos].sort()) {
  writeFileSync(join(destino, `${k}.csv`), [g.eje, ...g.filas].join('\n') + '\n');
}
console.log(`${grupos.size} archivo(s) escritos — uno por día y estadístico`);
const dias = new Set([...grupos.keys()].map((k) => k.split('-')[1]));
console.log(`${dias.size} día(s) distintos, según lo que declara el DATO`);
if (sueltos.length) {
  console.log(`\n${sueltos.length} archivo(s) NO se juntaron:`);
  const porQue = new Map();
  for (const [n, r] of sueltos) porQue.set(r, (porQue.get(r) ?? 0) + 1);
  for (const [r, n] of porQue) console.log(`   ${n} · ${r}`);
}
