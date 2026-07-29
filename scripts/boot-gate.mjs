#!/usr/bin/env node
// ===========================================================
// 🔒 boot-gate.mjs — candado del presupuesto de boot (TODO-28 #2)
// ===========================================================
// Comité 2026-07-18 (bóveda comite-futuro-cerebro): "advertir se ignoró
// 3 veces; bloquear funciona". Si los archivos always-on superan
// bootCharsTarget, el commit NO pasa (lo invoca githooks/pre-commit).
//
// ⚠️ INSTANCE-SIDE a propósito: el kernel (brain-check.mjs, escritor único
// = inmobiliaria) mantiene boot-budget INFORMATIVO hasta que los 3 repos
// estén bajo presupuesto (condición §173). Inmobiliaria adopta el BLOQUEO
// primero, aquí. Cuando la condición ×3 se cumpla y el gate suba al kernel,
// BORRAR este script y su bloque del pre-commit (one-in-one-out).
//
// Medición idéntica al kernel (brain-check.mjs líneas 123-126):
//   readFileSync(p, 'utf-8').length  (sin normalizar CRLF)
// ===========================================================
import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'docs', '.brain-manifest.json'), 'utf-8'));
const TARGET = manifest.bootCharsTarget;
const ALWAYS_ON = manifest.alwaysOn || [];

// 🐤 Canario de boot (TODO-31b §49): session-handoff --boot-echo escribe docs/.boot-marker en CADA
// SessionStart. Si nadie lo escribió en 48h, los hooks del harness están MUERTOS (el cerebro arranca
// sin signos vitales y nada lo detecta — A-03). Un commit en ese estado se bloquea A PROPÓSITO.
// v1.4 §51 (kernel-safe ×repos): solo aplica donde el contrato está INSTALADO (settings.json con
// session-handoff) — un repo sin ese hook no debe bloquearse por un marker que nada escribe.
const MARKER = join(ROOT, 'docs', '.boot-marker');
const settingsP = join(ROOT, '.claude', 'settings.json');
const canaryWired = existsSync(settingsP) && readFileSync(settingsP, 'utf-8').includes('session-handoff');
const markerFresh = existsSync(MARKER) && (Date.now() - statSync(MARKER).mtimeMs) < 48 * 3.6e6;
if (canaryWired && !markerFresh && !process.env.BOOT_CANARY_SKIP) {
  console.error('\n🐤 BOOT-CANARY: ningún SessionStart escribió docs/.boot-marker en 48h — los hooks del');
  console.error('   harness pueden estar MUERTOS (máquina nueva, settings.json roto, node fuera de PATH).');
  console.error('   Verifica .claude/settings.json y arranca una sesión (o corre:');
  console.error('   node scripts/session-handoff.mjs --boot-echo) y reintenta. Intencional → BOOT_CANARY_SKIP=1.');
  process.exit(1);
}

if (!TARGET || !ALWAYS_ON.length) process.exit(0); // sin presupuesto declarado → gate no aplica

let bootChars = 0;
const detail = [];
for (const rel of ALWAYS_ON) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) continue;
  const chars = readFileSync(p, 'utf-8').length;
  bootChars += chars;
  detail.push(`   ${rel}: ${chars}c`);
}

if (bootChars > TARGET) {
  console.error(`\n🔒 BOOT-GATE: always-on = ${bootChars}c > objetivo ${TARGET}c (exceso ${bootChars - TARGET}c)`);
  console.error(detail.join('\n'));
  console.error('   Regla one-in-one-out (§G.5): toda regla nueva desplaza o fusiona una existente.');
  console.error('   PODA antes de commitear (o --no-verify SOLO si es intencional y documentado).');
  process.exit(1);
}
console.log(`🔒 boot-gate OK: ${bootChars}c ≤ ${TARGET}c (margen ${TARGET - bootChars}c)`);
process.exit(0);
