#!/usr/bin/env node
// ===========================================================
// 🧠 brain-diff — Inventario federado de cerebros (KERNEL · 2º archivo · MANUAL)
// ===========================================================
// Escanea la carpeta PADRE (ROOT/..) buscando repos git y reporta el estado del
// cerebro de cada uno: ¿tiene CLAUDE.md? ¿marcador de versión del template?
// ¿manifest? ¿kernel byte-idéntico al de ESTE repo?
//
// ⚠️ NUNCA va en SessionStart ni en --boot (inventario federado ≠ salud local;
//    ROOT/.. en otra máquina puede ser cualquier cosa — ADR §173).
//    Uso: npm run brain:diff (manual, p.ej. al sospechar drift o al crear un repo).
//
// La detección TERMINA en una fila TODO accionable (impresa al final), no en
// stdout que nadie persiste. ignoreDirs en docs/.brain-manifest.json.
// ===========================================================
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PARENT = join(ROOT, '..');
const read = (p) => readFileSync(p, 'utf-8');
const sha = (s) => createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('hex');

let manifest = {};
const mp = join(ROOT, 'docs', '.brain-manifest.json');
if (existsSync(mp)) { try { manifest = JSON.parse(read(mp)); } catch { /* defaults */ } }
const IGNORE = new Set([...(manifest.ignoreDirs || []), 'brain-private', 'node_modules']);

const myKernel = join(ROOT, 'scripts', 'brain-check.mjs');
const myHash = existsSync(myKernel) ? sha(read(myKernel)) : null;
const me = basename(ROOT);

console.log(`\n🧠 BRAIN-DIFF — inventario de cerebros en ${PARENT}\n   (referencia de kernel: ${me} → ${myHash ? myHash.slice(0, 12) + '…' : 'SIN brain-check.mjs'})\n`);

const todos = [];
const dirs = readdirSync(PARENT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !IGNORE.has(d.name));

for (const d of dirs) {
  const repo = join(PARENT, d.name);
  if (!existsSync(join(repo, '.git'))) continue; // solo repos git
  const claudeP = join(repo, 'CLAUDE.md');
  const hasClaude = existsSync(claudeP);
  let version = '—';
  if (hasClaude) {
    const first = read(claudeP).split('\n')[0];
    version = (first.match(/brain-template-version:\s*([\d.]+)/) || [])[1] || 'SIN marcador';
  }
  const kp = join(repo, 'scripts', 'brain-check.mjs');
  const kernel = existsSync(kp) ? (myHash && sha(read(kp)) === myHash ? '✅ idéntico' : '⚠️ DIVERGE') : '—';
  const hasManifest = existsSync(join(repo, 'docs', '.brain-manifest.json')) ? '✅' : '—';
  const ignored = IGNORE.has(d.name) ? ' (ignoreDirs)' : '';
  console.log(`  ${d.name}${d.name === me ? ' (este)' : ''}${ignored}`);
  console.log(`     CLAUDE.md: ${hasClaude ? '✅' : '❌ SIN CEREBRO'} · template: ${version} · manifest: ${hasManifest} · kernel: ${kernel}`);

  if (!hasClaude) todos.push(`| TODO-XX | 🧠 Repo \`${d.name}\` SIN cerebro → instalar con la receta \`../brain-private/NUEVO-PROYECTO.md\` | 🔲 | decisión del dueño |`);
  else if (version === 'SIN marcador') todos.push(`| TODO-XX | 🧠 \`${d.name}\`: CLAUDE.md sin marcador de versión del template → añadir línea 1 | 🔲 | — |`);
  if (kernel === '⚠️ DIVERGE') todos.push(`| TODO-XX | 🧠 \`${d.name}\`: kernel DIVERGE del canónico → \`npm run brain:pull\` en ese repo | 🔲 | — |`);
}

if (todos.length) {
  console.log('\n📋 Filas TODO accionables (copiar a la tabla del nodo 10 — la detección no vale si nadie la persiste):');
  for (const t of todos) console.log('  ' + t);
} else {
  console.log('\n✅ Todos los repos git del directorio tienen cerebro con marcador y kernel consistente.');
}
console.log('');
