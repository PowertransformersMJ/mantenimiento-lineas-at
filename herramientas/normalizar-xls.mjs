#!/usr/bin/env node
// ============================================================================
// herramientas/normalizar-xls.mjs — PASO 0 del SCADA: un `.xls` viejo, en CSV del SCADA
// ----------------------------------------------------------------------------
// QUÉ RESUELVE (`99 §ADR-128`). Algunas exportaciones de su SCADA salen como
// `.xls` BIFF —Excel viejo— y el lector de la pantalla no los abre. En enero se
// «convirtieron a mano» sin decir con qué, y de catorce se convirtieron DOS: la
// potencia activa promedio del 2 al 12 de enero vivió dos semanas fuera del
// histórico sin que nada lo dijera (`33 · L-84`).
//
// El camino validado es: LibreOffice convierte el `.xls` a CSV y esta
// herramienta le devuelve la FORMA de un CSV del SCADA. Solo la forma:
//   · eje «01/01/2026 00:00:00» → «1/01/26 0:00» (el del SCADA, día/mes);
//   · valor «"-18,43494862"»    → «-18.43494862» (ningún dígito cambia);
//   · fin de línea CRLF, como el CSV que se aceptó el 07-09.
// Validado el 10-09: los dos `.xls` que ya tenían su CSV aceptado salen
// IDÉNTICOS byte a byte, y un verificador independiente comparó los 14 por dos
// vías ajenas —una, un lector BIFF escrito desde cero—: 1.066.464 valores, 0
// distintos.
//
// ⚠️ Si una celda del EJE no tiene la forma esperada, NO se escribe nada y sale
// con error: un eje a medio convertir fecharía mal un día entero en silencio.
// Una celda de valor que no es número (su SCADA escribe «null») se deja como
// vino, entrecomillada si hace falta para no correr las columnas.
//
//   soffice --headless --convert-to csv --outdir <tmp> <archivo.xls>
//   node herramientas/normalizar-xls.mjs <tmp>/<archivo>.csv <carpeta-del-dia>/<archivo>.csv
// ============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [entrada, salida] = process.argv.slice(2);
if (!entrada || !salida) {
  console.error('uso: node herramientas/normalizar-xls.mjs <csv-de-libreoffice> <salida.csv>');
  process.exit(2);
}
if (existsSync(salida)) {
  console.error(`❌ «${salida}» ya existe. No se sobrescribe: el original manda.`);
  process.exit(2);
}

/** Parte una línea CSV respetando las comillas (el decimal con coma viene entrecomillado). */
function partir(linea) {
  const out = []; let c = ''; let q = false;
  for (let i = 0; i < linea.length; i += 1) {
    const ch = linea[i];
    if (q) {
      if (ch === '"') { if (linea[i + 1] === '"') { c += '"'; i += 1; } else q = false; } else c += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(c); c = ''; } else c += ch;
  }
  out.push(c);
  return out;
}
const comillas = (v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const lineas = readFileSync(entrada, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
const ejeMalo = [];
let raros = 0;
const salidaL = lineas.map((l, i) => {
  if (l === '') return l;
  const c = partir(l);
  if (i === 0) {
    return c.map((v, k) => {
      if (k === 0) return comillas(v);
      const m = v.match(/^(\d{2})\/(\d{2})\/\d{2}(\d{2}) (\d{2}):(\d{2}):00$/);
      if (!m) { ejeMalo.push(v); return v; }
      return `${Number(m[1])}/${m[2]}/${m[3]} ${Number(m[4])}:${m[5]}`;
    }).join(',');
  }
  return c.map((v, k) => {
    if (k === 0 || v === '') return comillas(v);
    if (!/^-?\d+(,\d+)?$/.test(v)) { raros += 1; return comillas(v); }
    return v.replace(',', '.');
  }).join(',');
});

if (ejeMalo.length) {
  console.log(`❌ NO SE ESCRIBE NADA: ${ejeMalo.length} celda(s) del eje sin la forma «dd/mm/aaaa hh:mm:00», `
    + `p. ej. «${ejeMalo[0]}». Convertirla a medias fecharía mal el día.`);
  process.exit(1);
}
writeFileSync(salida, salidaL.join('\r\n'));
console.log(`${salida}: ${lineas.filter(Boolean).length} línea(s) · ${raros} celda(s) de valor que no son número, `
  + 'dejadas como venían');
