#!/usr/bin/env node
// ============================================================
// brain-index.mjs — GENERA el mapa de ruteo §→línea desde los headers de 99-HISTORIAL.
//
// TODO-32 Etapa 1 (PRUEBA, cars-local, SHADOW): emite `docs/00-INDICE.generated.md`
// SIN tocar el índice hecho a mano. La idea (deliberación comité+Gemini, bóveda
// 2026-06-22-TODO32-…): el índice no debe COMPRIMIRSE a mano (pérdida permanente,
// el error de §227) — debe COMPILARSE del genoma del documento (lossless, regenerable).
// Esta etapa lo prueba con cero riesgo: genera un shadow y se diffea contra el real.
//
// GATE (invariante del experto adversarial A): si un header no parsea, falta título,
// o hay id duplicado → ERROR (exit 1). Un índice generado solo vale si es mecánico
// y rechaza lo malformado — sin honor.
//
// La capa de ruteo SEMÁNTICO (síntoma→neurona) NO se autogenera: es inteligencia
// humana y sigue viviendo a mano en 00-INDICE.md (eso es lo que Gemini llamó la capa
// de traducción / anzuelos ricos). Este script solo compila el mapa §→línea mecánico.
// ============================================================
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'docs/99-HISTORIAL-ADR.md';
const OUT = 'docs/00-INDICE.generated.md';
// Captura ADRs top-level (`## 227. …`) Y sub-numerados (`## 60.1 …`, `## 60.1.1 …`).
const reHeader = /^## (\d+(?:\.\d+)*)\.?\s+(.+?)\s*$/;
// Orden numérico por segmentos: §60 < §60.1 < §60.2 < §61.
const cmpId = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d) return d;
  }
  return 0;
};

const lines = readFileSync(SRC, 'utf8').split('\n');
const rows = [];
const seen = new Map();
const errors = [];

// Tombstone (TODO-32 anti-Data-Rot): una marca `⛔ REEMPLAZADO POR §M` bajo el header de
// un ADR superado avisa al próximo "yo" que NO aplique esa decisión vieja, y a dónde ir.
const reTomb = /⛔.*?REEMPLAZAD[OA].*?§\s*([\d.]+)/i; // tolera negrita markdown (**…**) y espacios
let current = null;

lines.forEach((line, i) => {
  const m = line.match(reHeader);
  if (m) {
    const id = m[1];
    const lineNo = i + 1;
    // hook = título limpio: quita "ADR-NNN — " redundante, el ⟦tag⟧ y la (fecha) final.
    const hook = m[2]
      .replace(/^ADR-\d+\s*[—-]\s*/, '')
      .replace(/\s*⟦[^⟧]*⟧\s*/g, ' ')
      .replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, '')
      .trim();
    if (!hook) errors.push(`§${id} (línea ${lineNo}): header sin título tras parsear`);
    if (seen.has(id)) errors.push(`§${id} DUPLICADO (líneas ${seen.get(id)} y ${lineNo})`);
    seen.set(id, lineNo);
    current = { id, hook, lineNo, replacedBy: null };
    rows.push(current);
    return;
  }
  const t = current && line.match(reTomb);
  if (t) current.replacedBy = t[1];
});

// GATE: un tombstone que apunta a un § inexistente es un puntero colgante (peor que nada).
const tombs = rows.filter((r) => r.replacedBy);
tombs.forEach((r) => {
  if (!seen.has(r.replacedBy)) errors.push(`§${r.id}: tombstone "REEMPLAZADO POR §${r.replacedBy}" → destino INEXISTENTE`);
});

if (errors.length) {
  console.error(`❌ GATE brain-index: ${errors.length} problema(s) de integridad:`);
  errors.forEach((e) => console.error('  - ' + e));
  process.exit(1);
}

void cmpId; // (reservado para un futuro modo de orden; el reconcile no ordena)
// Mapa §id → línea ACTUAL en 99.
const lineById = new Map(rows.map((r) => [r.id, r.lineNo]));

// RECONCILIA el índice vivo (00): actualiza SOLO la columna de línea de cada fila
// `| §X | desc | N |` cuyo §X exista como header en 99 — preservando la descripción HUMANA.
// Cura el drift que CUALQUIER inserción en 99 provoca (p.ej. una marca de tombstone corre
// todas las líneas siguientes): la fragilidad que motivó TODO-32. El generador mantiene la
// parte MECÁNICA (líneas); el humano mantiene las descripciones + entradas especiales
// (BLOQUE T, §13.bis…) y la capa de ruteo semántico → esas NO matchean y quedan intactas.
const IDX = 'docs/00-INDICE.md';
const reRow = /^(\| §([\d.]+) \| .* \| )(\d+)( \|\s*)$/;
let checked = 0, fixed = 0;
const idxOut = readFileSync(IDX, 'utf8').split('\n').map((line) => {
  const m = line.match(reRow);
  if (!m || !lineById.has(m[2])) return line;
  checked++;
  const cur = String(lineById.get(m[2]));
  if (m[3] === cur) return line;
  fixed++;
  return `${m[1]}${cur}${m[4]}`;
}).join('\n');
writeFileSync(IDX, idxOut);
void OUT; // (el modo shadow se reemplazó por el reconcile del índice vivo)
console.log(`✅ 99: ${rows.length} ADRs · ${tombs.length} tombstone(s) válido(s). Índice 00: ${checked} filas verificadas, ${fixed} líneas reconciliadas.`);
