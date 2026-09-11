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
// ⚠️ Y SE LEE CON LA REGLA DEL LECTOR, no con una propia (`99 §ADR-126`). Hasta
// el 10-09 esto traía su propia expresión —solo `d/m/aa`—: un eje `1/13/26`
// salía `20261301` y uno ISO se descartaba. Ahora la fecha la decide
// `encontrarEjeDeTiempo` del núcleo, la misma función que usa la pantalla.
// Y como esa regla decide archivo por archivo, aquí se mira además el MES
// entero: si un archivo DEMUESTRA mes/día y otro se leyó día/mes por defecto,
// no se escribe nada — uno de los dos está fechado al revés.
//
// ⚠️ EL ESTADÍSTICO SÍ SALE DEL NOMBRE, porque no está en ninguna otra parte:
// el archivo resultante se llama `<estadistico>-<fecha>.csv` para que el lector
// lo siga reconociendo.
//
// ⚠️ LA MISMA SEÑAL DOS VECES EN UN DÍA (`99 §ADR-126`). Su exportación de
// febrero trae 108 archivos «(1)»: el navegador renombra la segunda descarga de
// un nombre que ya existía. Muchos son el MISMO dato bajado dos veces —70 filas
// de la bahía, idénticas byte a byte—. Apilarlas daba al día una CUARTA fase, y
// la pantalla, con más de tres señales de una magnitud, entiende que el archivo
// trae media red y las deja todas sin usar. Por eso:
//   · repetida IDÉNTICA → se escribe una vez, y se cuenta y se dice;
//   · misma señal con valores DISTINTOS → ese día·estadístico NO se escribe, se
//     dice cuál y la herramienta sale con error. Elegir una sería decidir por él
//     qué medida es la buena.
//
// ⚠️ LO QUE NO ENTRA SE DICE CON NOMBRE Y SALE CON ERROR (`33 · L-84`). Un
// archivo de medidas que se aparta —sin estadístico, sin eje, eje distinto del
// de su grupo, eje de más de un día— no falla: FALTA. Por eso se nombra, sus
// filas entran en el recuento y la salida es 1. Solo el sello de calidad se
// aparta sin error: no es una medida, la pantalla lo lee aparte.
//
// ⚠️ DESTINO VACÍO, SIEMPRE. La herramienta no borra nada, así que en una
// carpeta con restos un día que ahora NO se escribe —por un choque— seguiría
// ahí con la versión anterior, y se cargaría. Si el destino trae CSV, se niega.
//
//   node herramientas/juntar-por-dia.mjs <carpeta-origen> <carpeta-destino>
// ============================================================================
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { celdasDeCsv, separadorDe } from '../importar/csv.js';
import {
  encontrarEjeDeTiempo, estadisticoDeNombre, esArchivoDeCalidad, ordenDeLaCarga,
} from '../nucleo/cargabilidadAncho.js';

const [origen, destino] = process.argv.slice(2);
if (!origen || !destino) {
  console.error('uso: node herramientas/juntar-por-dia.mjs <origen> <destino>');
  process.exit(2);
}
if (existsSync(destino) && readdirSync(destino).some((n) => /\.csv$/i.test(n))) {
  console.error(`❌ «${destino}» ya tiene archivos .csv. Esta herramienta no borra nada, y un resto de `
    + 'otra corrida se cargaría como si fuera de ésta. Use una carpeta nueva.');
  process.exit(2);
}
mkdirSync(destino, { recursive: true });

/** El eje, leído por el NÚCLEO: los días que declara, dónde empiezan los datos y cómo se leyó la fecha. */
function ejeDe(linea, separador) {
  const eje = encontrarEjeDeTiempo(celdasDeCsv(linea, { separador }));
  if (!eje) return null;
  return {
    fechas: [...new Set(eje.instantes.filter(Boolean).map((i) => i.fecha))],
    primeraColumna: eje.primeraColumna,
    orden: eje.ordenDeFecha,
  };
}

/**
 * La etiqueta de una fila, compuesta como la compone `leerSenales`.
 * ⚠️ Con el separador DEL ARCHIVO, no con el que adivine una fila suelta: en
 * «…I R /Mom;100,5;101,5» hay tantas comas como puntos y coma, y adivinando por
 * fila la etiqueta se llevaba un trozo del primer valor.
 */
function etiquetaDe(linea, primeraColumna, separador) {
  const celdas = celdasDeCsv(linea, { separador })[0] ?? [];
  return celdas.slice(0, primeraColumna)
    .map((v) => (v == null ? '' : String(v).trim())).filter((t) => t !== '').join(' · ');
}

function archivos(raiz) {
  const out = [];
  for (const n of readdirSync(raiz).filter((x) => !x.startsWith('.')).sort()) {
    const p = join(raiz, n);
    if (statSync(p).isDirectory()) out.push(...archivos(p));
    else if (/\.csv$/i.test(n)) out.push(p);
  }
  return out;
}

const grupos = new Map();
const apartados = [];
const ordenes = [];
let deCalidad = 0;
let leidas = 0;
for (const p of archivos(origen)) {
  const nombre = basename(p);
  if (esArchivoDeCalidad(nombre)) { deCalidad += 1; continue; }
  // La marca de orden de bytes se quita como la quita el lector: no es dato, y
  // con ella el eje de un archivo dejaba de ser idéntico al de sus hermanos.
  const lineas = readFileSync(p, 'utf8').replace(/^﻿/, '')
    .split(/\r?\n/).filter((l) => l.trim() !== '');
  const filas = Math.max(0, lineas.length - 1);
  leidas += filas;
  const apartar = (porQue) => apartados.push({ nombre, porQue, filas });

  const est = estadisticoDeNombre(nombre).id;
  if (!est) { apartar('el nombre no dice qué estadístico trae'); continue; }
  if (!filas) { apartar('sin filas de señal'); continue; }
  const separador = separadorDe(lineas[0]);
  const eje = ejeDe(lineas[0], separador);
  if (!eje) { apartar('la primera fila no es un eje de tiempo reconocible'); continue; }
  if (eje.fechas.length !== 1) {
    apartar(`su eje cubre ${eje.fechas.length} días: no se sabe a qué día va cada hora`); continue;
  }
  const k = `${est}-${eje.fechas[0].replaceAll('-', '')}`;
  if (!grupos.has(k)) {
    grupos.set(k, { eje: lineas[0], primero: nombre, filas: new Map(), repetidas: [], choques: [], leidas: 0 });
  }
  const g = grupos.get(k);
  // ⚠️ Si el eje no es el MISMO, no se juntan: alinear dos rejillas es
  // interpolar, y una medida interpolada no la tomó nadie.
  if (g.eje !== lineas[0]) { apartar(`su eje de tiempo no es idéntico al de «${g.primero}»`); continue; }
  ordenes.push({ nombre, orden: eje.orden });
  for (const fila of lineas.slice(1)) {
    g.leidas += 1;
    const et = etiquetaDe(fila, eje.primeraColumna, separador) || '(sin etiqueta)';
    const ya = g.filas.get(et);
    if (!ya) { g.filas.set(et, { fila, nombre }); continue; }
    if (ya.fila === fila) { g.repetidas.push({ nombre, igualA: ya.nombre }); continue; }
    g.choques.push({ etiqueta: et, nombres: [ya.nombre, nombre] });
  }
}

// ── ¿Día/mes o mes/día? Lo que DEMUESTRA un archivo vale para todo el mes ─────
// ⚠️ La regla es del NÚCLEO (`99 §ADR-127`): `ordenDeLaCarga` decide aquí y en la
// pantalla, así que lo que el paso 2 rechaza, la pantalla también lo rechaza.
// Hasta el 10-09 vivía escrita aquí, y la pantalla aceptaba lo que esto negaba.
const carga = ordenDeLaCarga(ordenes);
const demostrado = carga.demostrados;
const supuestos = carga.sinPrueba;
if (carga.mezcla) {
  console.log(`❌ NO SE ESCRIBE NADA: el orden de la fecha no es el mismo en todos los archivos.`);
  console.log(`   Lo demuestran: ${demostrado.join(' y ')}. Y ${supuestos.length} archivo(s) no traen `
    + 'prueba y se leerían día/mes, como los lee la pantalla: alguno quedaría fechado al revés.');
  for (const o of carga.conPrueba.filter((x) => x.orden !== 'dmy').slice(0, 5)) {
    console.log(`   · «${o.nombre}» demuestra ${o.orden}`);
  }
  process.exit(1);
}

let escritas = 0; let repetidas = 0; let deChoque = 0;
const conChoque = [];
for (const [k, g] of [...grupos].sort()) {
  repetidas += g.repetidas.length;
  if (g.choques.length) { conChoque.push([k, g]); deChoque += g.leidas - g.repetidas.length; continue; }
  writeFileSync(join(destino, `${k}.csv`), [g.eje, ...[...g.filas.values()].map((x) => x.fila)].join('\n') + '\n');
  escritas += g.filas.size;
}
const filasApartadas = apartados.reduce((n, a) => n + a.filas, 0);

const escritos = [...grupos.keys()].filter((k) => !conChoque.some(([c]) => c === k));
console.log(`${escritos.length} archivo(s) escritos — uno por día y estadístico`);
const dias = new Set(escritos.map((k) => k.split('-')[1]));
console.log(`${dias.size} día(s) distintos, según lo que declara el DATO`);
const porEst = new Map();
for (const k of escritos) { const [e] = k.split('-'); porEst.set(e, (porEst.get(e) ?? 0) + 1); }
console.log(`   ${[...porEst].sort().map(([e, n]) => `${e}: ${n} día(s)`).join(' · ')}`);
const nSeguros = carga.conPrueba.length;
console.log(`   fecha: ${nSeguros} archivo(s) demuestran ${demostrado.join('/') || '—'}; `
  + `${supuestos.length} sin prueba, leídos día/mes como la pantalla`);

console.log(`\n${leidas} fila(s) de señal leídas = ${escritas} escritas + ${repetidas} repetida(s) idéntica(s)`
  + ` + ${deChoque} de un día·estadístico con choque + ${filasApartadas} de archivos apartados`);
if (repetidas) {
  console.log(`\n${repetidas} fila(s) repetidas IDÉNTICAS —la misma señal, el mismo día, los mismos valores—: se escribe una.`);
  for (const [k, g] of [...grupos].sort()) {
    for (const r of g.repetidas) console.log(`   ${k} · «${r.nombre}» = «${r.igualA}»`);
  }
}
if (conChoque.length) {
  console.log(`\n❌ ${conChoque.length} día·estadístico NO se escribieron: traen la MISMA señal con valores DISTINTOS.`);
  console.log('   Elegir una sería decidir por usted qué medida es la buena. Revise estos archivos:');
  for (const [k, g] of conChoque) {
    for (const c of g.choques) console.log(`   ${k} · ${c.etiqueta} · «${c.nombres[0]}» ≠ «${c.nombres[1]}»`);
  }
  process.exitCode = 1;
}
if (apartados.length) {
  const conFilas = apartados.filter((a) => a.filas > 0);
  console.log(`\n${conFilas.length ? '❌ ' : ''}${apartados.length} archivo(s) de medidas APARTADOS${conFilas.length
    ? ` — ${filasApartadas} fila(s) que NO van a la carga` : ''}:`);
  for (const a of apartados) console.log(`   «${a.nombre}» · ${a.porQue}`);
  if (conFilas.length) process.exitCode = 1;
}
if (leidas !== escritas + repetidas + deChoque + filasApartadas) {
  console.log('\n❌ EL RECUENTO NO CUADRA: alguna fila se ha perdido por el camino. No cargue esto.');
  process.exitCode = 1;
}
if (deCalidad) console.log(`\n${deCalidad} sello(s) de calidad apartados: no son medidas (la pantalla los lee aparte).`);
