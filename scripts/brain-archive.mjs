#!/usr/bin/env node
// ===========================================================
// 📦 brain-archive.mjs — fontanería MECÁNICA del cierre de tarea (Cerebro v2 F2 · §52)
// ===========================================================
// Adoptado del consejo externo (Antigravity, propuesta C) en su parte MECÁNICA:
// el script hace la plomería (esqueleto ADR + fila en 00 + reconciliar índice);
// el JUICIO (causa raíz, callejones, anti-patterns) lo escribe Claude — prometer
// destilación automática de ADRs es vender maquinaria que no puede cumplir.
//
//   npm run brain:archive -- --adr 52 --title "Mi título" [--modelo FABLE-5] [--todo TODO-32] [--dry-run]
//
// Hace: (1) apéndea a docs/99 el esqueleto del ADR (7 puntos §2 con [JUICIO PENDIENTE]);
//       (2) inserta la fila en docs/00 (tras la última fila §); (3) corre brain-index
//       (reconcilia la columna Línea); (4) imprime el checklist de cierre restante.
// NO toca: 05 (juicio), 10 (poda = juicio), deepAudit (solo auditorías Nivel-2).
// ===========================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const REPO = process.cwd(); // invocar vía npm run (cwd = raíz del repo)
const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : null; };
const DRY = process.argv.includes('--dry-run');
const NN = arg('adr'), TITLE = arg('title');
const MODELO = arg('modelo') || 'FABLE-5';
const TODO = arg('todo');
if (!NN || !/^\d+$/.test(NN) || !TITLE) { console.error('uso: npm run brain:archive -- --adr NN --title "..." [--modelo M] [--todo TODO-NN] [--dry-run]'); process.exit(1); }

const histP = join(REPO, 'docs', '99-HISTORIAL-ADR.md');
const idxP = join(REPO, 'docs', '00-INDICE.md');
if (!existsSync(histP) || !existsSync(idxP)) { console.error('📦 archive: faltan docs/99 o docs/00 — ¿cwd correcto?'); process.exit(1); }
const hist = readFileSync(histP, 'utf8');
if (new RegExp(`^##\\s+${NN}\\.`, 'm').test(hist)) { console.error(`📦 archive: el ADR §${NN} YA existe en 99 — no lo piso (append-only). Elige otro NN.`); process.exit(1); }

const hoy = new Date().toISOString().slice(0, 10);
const adr = [
  '', `## ${NN}. ADR — ${TITLE} ⟦${MODELO}⟧ (${hoy})`, '',
  `**${NN}.1 Causa raíz**: [JUICIO PENDIENTE — RCA §3.3, verificada leyendo código]`,
  `**${NN}.2 Solución estructural**: [JUICIO PENDIENTE]`,
  `**${NN}.3 No-regresión**: [JUICIO PENDIENTE — IDs/funciones/callsites intactos, build OK]`,
  `**${NN}.4 Tests/verificación**: [JUICIO PENDIENTE — evidencia resoluble: comando/§/ruta]`,
  `**${NN}.5 Anti-patterns evitados (§3)**: [JUICIO PENDIENTE]`,
  `**${NN}.6 Archivos modificados/INTACTOS**: [JUICIO PENDIENTE]`,
  `**${NN}.7 Doctrina aplicada + cache bump (§4 si aplica)**: [JUICIO PENDIENTE]`,
].join('\n');

const idx = readFileSync(idxP, 'utf8').split('\n');
let lastRow = -1;
for (let i = 0; i < idx.length; i++) if (/^\|\s*§\d/.test(idx[i])) lastRow = i;
if (lastRow < 0) { console.error('📦 archive: 00 sin filas § — estructura inesperada, aborto'); process.exit(1); }
const fila = `| §${NN} | ${TITLE}${TODO ? ` (${TODO})` : ''} ⟦${MODELO}⟧ | 1 |`;
idx.splice(lastRow + 1, 0, fila);

if (DRY) { console.log('— DRY-RUN —\n' + adr + '\n\nFila 00: ' + fila); process.exit(0); }
writeFileSync(histP, hist.replace(/\s*$/, '\n') + adr + '\n', 'utf8');
writeFileSync(idxP, idx.join('\n'), 'utf8');
const bi = join(REPO, 'scripts', 'brain-index.mjs');
if (existsSync(bi)) { const r = spawnSync(process.execPath, [bi], { cwd: REPO, encoding: 'utf8' }); process.stdout.write(r.stdout || ''); }
else console.log('ℹ️ sin scripts/brain-index.mjs — reconcilia la columna Línea a mano');
console.log(`\n📦 brain:archive OK — esqueleto §${NN} en 99 + fila en 00 (línea reconciliada).`);
console.log(`✍️ TE TOCA EL JUICIO (el script no lo inventa): (1) rellenar ${NN}.1-${NN}.7 · (2) destilar la fila de 00 a hook ≤150c · (3) ${TODO ? `marcar ${TODO} ✅ en el 10 + podar (GC §G.4)` : 'poda del 10 si aplica'} · (4) lección → 30 si la hubo · (5) brain:check antes de commitear.`);
