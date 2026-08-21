#!/usr/bin/env node
// ===========================================================
// 🧠 brain-check v1.7 — Linter de integridad del cerebro neuronal (CANÓNICO · portable)
// ===========================================================
// KERNEL del cerebro multi-proyecto. Linaje: brain-kit v1.0 → canónico v1.6.0 (ecosistema
// de origen, otro dueño) → v1.7.0 = ESTE canónico, ecosistema ~/Desktop/GitHub-MJ (ADR-058).
// Este archivo es IDÉNTICO en todos los repos del ecosistema — escritor único = este canónico.
// v1.7 (delta propio vs 1.6.0): gate #5 acepta LECCIONES SHARDEADAS (30 + 3X-LECCIONES-*.md).
// Los DATOS (topes/budgets/rutas) son INSTANCE: viven en docs/.brain-manifest.json.
// ⚠️ La SEVERIDAD de cada gate está HARDCODEADA aquí (anti green-tuning, ADR §173):
// el manifest NUNCA puede degradar un warn; solo aporta datos. Campo `downgrades`
// (con ADR citado) se IMPRIME en cada corrida — visible, no silencioso.
// READ-ONLY: reporta, no modifica. Sin child_process (portabilidad + byte-identidad ×repos).
//
//   node scripts/brain-check.mjs           → --full (default): TODO (pre-commit / manual)
//   node scripts/brain-check.mjs --boot    → arranque LIVIANO + SILENCIOSO (presupuesto de stdout;
//                                            NO lee 99-HISTORIAL; el hook re-inyecta cada línea)
//
// Checks (fija) · v1.3 F0-§50: #1→#10 · #6b/#11 QUITADOS · #13 endurecida · +5c/+7b/+tableFile:
//   (2) Caps chars+líneas [warn] · pre-shard ≥90% [info] (8) SSoT: hecho duplicado fuera del nodo dueño [warn, --full]
//       · boot-budget [info: condición ×3 no cumplida]   (9) Consolidado-aún-en-10: fila ✅+§NN indexado [warn, --full]
//   (3) Desync 00→99 [warn, --full]                     (10) Huérfanas: BFS 2º orden + neurona NN- sin registro directo [warn, --full]
//   (4) Frescura cache SW↔05 [warn, opcional]           (12) Fechas stale en 05/10 [info, --boot]
//   (5) Refs cruzadas ADR/L-M/hojas [warn]              (13) Specs: checklist con evidencia RESOLUBLE [warn, --full]
//       + 5c) cita viva a lección ⚰️ cuarentenada [warn] (14) deepAudit Nivel-2 vencida [info] + tableFile existe [warn]
//   (6) Skills↔inventario [warn, --full]                (15) Schema del manifest: clave desconocida [warn]
//   (7) archiveDir íntegro [warn, --full]               (16) Fiabilidad M-22: `verificado-vivo` stale [info, --full]
//       + 7b) bóveda: commits ≠ origin vía fs [warn]
// ===========================================================
const KERNEL_VERSION = '1.8.0';
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
let problems = 0;
const BOOT = process.argv.includes('--boot');
// Presupuesto de stdout en --boot (el SessionStart re-inyecta CADA línea como contexto).
const lines = [];
const say = (m) => { lines.push(m); };
const warn = (m) => { say('  ⚠️  ' + m); problems++; };
const ok = (m) => { if (!BOOT) say('  ✅ ' + m); };
const info = (m) => say('  ℹ️  ' + m);
const head = (m) => { if (!BOOT) say(m); };
const read = (p) => readFileSync(p, 'utf-8');

say(`\n🧠 BRAIN-CHECK v${KERNEL_VERSION}${BOOT ? ' --boot (liviano+silencioso)' : ' --full'} — integridad del cerebro\n`);

// Pre-flight
const CLAUDE_PATH = join(ROOT, 'CLAUDE.md');
if (!existsSync(CLAUDE_PATH) || !existsSync(DOCS)) {
  console.log('  ⚠️  CLAUDE.md o docs/ no existe — ¿directorio correcto? Cerebro no cableado.');
  process.exit(1);
}

// ---- Manifest (DATOS instance; jamás severidades) + validación de schema (#15) ----
const MANIFEST_PATH = join(DOCS, '.brain-manifest.json');
let manifest = {};
if (existsSync(MANIFEST_PATH)) {
  try { manifest = JSON.parse(read(MANIFEST_PATH)); }
  catch { info('.brain-manifest.json ilegible (JSON inválido) — defaults'); }
}
const KNOWN_KEYS = new Set([
  'brainTemplateVersion', 'repo', 'bootCharsTarget', 'alwaysOn', 'caps', 'archiveDir',
  'deepAudit', 'peers', 'kernelFiles', 'ssotFacts', 'specsDir', 'staleDays', 'ignoreDirs',
  'downgrades', 'orphanAllowlist', 'verifiedLiveStaleDays', 'verifiedLiveScan', 'lastOffsiteBackup',
]);
for (const k of Object.keys(manifest)) {
  if (!k.startsWith('_') && !KNOWN_KEYS.has(k)) warn(`manifest: clave desconocida "${k}" (¿typo? un typo apaga gates en silencio) — schema v1.2`);
}
if (Array.isArray(manifest.downgrades) && manifest.downgrades.length) {
  for (const d of manifest.downgrades) info(`DOWNGRADE activo: ${typeof d === 'string' ? d : JSON.stringify(d)} (visible por diseño — exige ADR)`);
}
// Compat kernel↔manifest (v1.4 §51): degradación RUIDOSA, jamás silencio.
const REQUIRED_MANIFEST_MAJOR = 1;
const mMajor = parseInt(String(manifest.brainTemplateVersion || '1').split('.')[0], 10) || 1;
if (mMajor !== REQUIRED_MANIFEST_MAJOR) warn(`manifest brainTemplateVersion "${manifest.brainTemplateVersion}" ≠ major ${REQUIRED_MANIFEST_MAJOR} que exige este kernel → migrar el manifest (el kernel corre degradado)`);

// 0) Identidad del kernel vs canónico (v1.4 §51 — reemplaza al viejo #11; corre también en --boot):
//    el kernel canónico vive UNA vez en <bóveda>/kernel/; cada repo lo trae con `npm run brain:pull`
//    que escribe scripts/.kernel-version.json (stamp commiteado). Editar scripts/*.mjs a mano = fork.
{
  const stampP = join(ROOT, 'scripts', '.kernel-version.json');
  if (!existsSync(stampP)) { if (!BOOT) info('sin scripts/.kernel-version.json — repo pre-F1 (migrar: npm run brain:pull)'); }
  else {
    let stamp = null; try { stamp = JSON.parse(read(stampP)); } catch { warn('scripts/.kernel-version.json ilegible (JSON inválido)'); }
    const shaHex = (p) => createHash('sha256').update(read(p).replace(/\r\n/g, '\n')).digest('hex');
    let bad = 0;
    for (const [name, h] of Object.entries((stamp && stamp.files) || {})) {
      const p = join(ROOT, 'scripts', name);
      if (!existsSync(p)) { warn(`kernel: ${name} está en el stamp pero AUSENTE en scripts/`); bad++; }
      else if (shaHex(p) !== h) { warn(`kernel EDITADO LOCALMENTE: ${name} ≠ stamp (fork prohibido §51) → editar el CANÓNICO y npm run brain:pull`); bad++; }
    }
    let vault = manifest.archiveDir ? join(ROOT, manifest.archiveDir) : null;
    if (vault) for (let i = 0; i < 4 && !existsSync(join(vault, '.git')); i++) vault = join(vault, '..');
    const canonVerP = vault ? join(vault, 'kernel', 'VERSION') : null;
    const canonVer = canonVerP && existsSync(canonVerP) ? read(canonVerP).trim() : null;
    if (stamp && canonVer && canonVer !== stamp.version) { warn(`kernel v${stamp.version} STALE vs canónico v${canonVer} → npm run brain:pull`); bad++; }
    // v1.5.1 §52 (punto ciego cazado EN VIVO): una edición del canónico SIN bump de VERSION era
    // invisible (el gate solo miraba stamp+versión). Con el canónico presente, comparar CONTENIDO.
    if (stamp && vault && existsSync(join(vault, 'kernel'))) for (const name of Object.keys(stamp.files || {})) {
      const c = join(vault, 'kernel', name), l = join(ROOT, 'scripts', name);
      if (existsSync(c) && existsSync(l) && shaHex(c) !== shaHex(l)) { warn(`kernel: ${name} difiere del CANÓNICO aun con versión igual (edición canónica sin bump / pull a medias) → npm run brain:pull`); bad++; break; }
    }
    if (stamp && !bad) {
      if (BOOT) say(`  ✅ kernel v${stamp.version} íntegro${canonVer ? ' == canónico' : ''}`);
      else ok(`kernel v${stamp.version} íntegro (${Object.keys(stamp.files || {}).length} archivos)${canonVer ? ' == canónico v' + canonVer : ' (canónico no clonado en esta máquina)'}`);
    }
  }
}

const DEFAULT_CAPS = {
  'CLAUDE.md': { lines: 320 }, 'docs/05-ESTADO-GLOBAL.md': { lines: 25 },
  'docs/10-MEMORIA-CORTO-PLAZO.md': { lines: 110 }, 'docs/20-MEMORIA-ESPACIAL.md': { lines: 280 },
  'docs/30-LECCIONES.md': { lines: 350 }, 'docs/00-INDICE.md': { lines: 450 },
  'docs/40-LOBULOS-DOMINIO.md': { lines: 280 },
};
const CAPS = manifest.caps || DEFAULT_CAPS;
const ALWAYS_ON = manifest.alwaysOn || ['CLAUDE.md', 'docs/05-ESTADO-GLOBAL.md', 'docs/10-MEMORIA-CORTO-PLAZO.md'];
const BOOT_CHARS_TARGET = manifest.bootCharsTarget || null;

const claude = read(CLAUDE_PATH);
const indicePath = join(DOCS, '00-INDICE.md');
const histPath = join(DOCS, '99-HISTORIAL-ADR.md');
const lobeRegistryPath = join(DOCS, '40-LOBULOS-DOMINIO.md');
const lobeRegistry = existsSync(lobeRegistryPath) ? read(lobeRegistryPath) : '';

// Índice posiblemente RANGE-SHARDED (ADR): 00-INDICE.md + hermanas 00[a-z]-INDICE*.md
// (descubrimiento por PATRÓN → byte-idéntico ×repos, cero config; repos sin shard ⇒ solo 00).
// Los checks que leen el ÍNDICE como fuente (#3 desync, #5a refs-ADR, #9 consolidado) lo tratan
// como UNO vía readIndex() — así mover filas viejas a 00a NO dispara falsos "ADR sin fila en 00".
const indexNames = readdirSync(DOCS).filter((f) => /^00[a-z]?-INDICE.*\.md$/.test(f)).sort();
const indexPaths = indexNames.map((f) => join(DOCS, f));
const readIndex = () => indexPaths.map((p) => read(p)).join('\n');

// 2) Capacidad (§G.5) + pre-shard 90% + boot-budget
head('\n2) Capacidad de neuronas (§G.5 · chars = unidad real de contexto):');
let bootChars = 0;
const preShard = [];
let okCaps = 0, capCount = 0;
for (const [rel, cap] of Object.entries(CAPS)) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) continue;
  capCount++;
  const txt = read(p);
  const nLines = txt.split('\n').length;
  const chars = txt.length;
  if (ALWAYS_ON.includes(rel)) bootChars += chars;
  const lc = cap.lines, cc = cap.chars;
  const over = (lc && nLines > Math.round(lc * 1.1)) || (cc && chars > Math.round(cc * 1.1));
  const nudge = (lc && nLines > lc) || (cc && chars > cc);
  const near = (cc && chars >= Math.round(cc * 0.9)) || (lc && nLines >= Math.round(lc * 0.9));
  const tag = cc ? `${chars}c/${cc} · ${nLines}L/${lc}` : `${nLines}L/${lc} (${chars}c)`;
  if (over) warn(`${rel}: ${tag} → SHARD/poda (excede tope)`);
  else if (nudge) say(`  ↗  ${rel}: ${tag} (leve exceso — destilar)`);
  else { ok(`${rel}: ${tag}`); okCaps++; if (near) preShard.push(rel); }
}
if (BOOT && okCaps) say(`  ✅ ${okCaps}/${capCount} neuronas dentro de tope`);
if (preShard.length) info(`pre-shard: ${preShard.length} neurona(s) ≥90% de su cap (${preShard.join(', ')}) — planear shard/GC ANTES de reventar`);
if (BOOT_CHARS_TARGET) {
  const bootTok = Math.round(bootChars / 3.5);
  // INFORMATIVO por diseño MIENTRAS los 3 repos no estén bajo presupuesto (condición §173;
  // al cumplirse ×3, este gate sube a warn EN EL KERNEL, no por manifest).
  if (bootChars > Math.round(BOOT_CHARS_TARGET * 1.1))
    info(`BOOT always-on = ${bootChars}c (~${bootTok} tok) vs objetivo ${BOOT_CHARS_TARGET}c — destilar/diferir (informativo)`);
  else if (bootChars > BOOT_CHARS_TARGET) // fix TODO-28 #2: antes imprimía ✅ falso en este tramo
    info(`BOOT always-on = ${bootChars}c (~${bootTok} tok) > objetivo ${BOOT_CHARS_TARGET}c (leve exceso — destilar)`);
  else say(`  ✅ BOOT always-on = ${bootChars}c (~${bootTok} tok) ≤ objetivo ${BOOT_CHARS_TARGET}c`);
}

// 3) Desync índice → 99 [--full]
head('\n3) Desync índice 00-INDICE → 99-HISTORIAL:');
if (BOOT) { head('  ⏭️  omitido en --boot'); }
else if (indexPaths.length && existsSync(histPath)) {
  const indice = readIndex().split('\n');
  const hist = read(histPath).split('\n');
  const numberedConvention = hist.some((l) => /^##\s+\d+\.\s/.test(l));
  let checked = 0, desync = 0;
  for (const row of indice) {
    const m = row.match(/^\|\s*§([\w.]+)\s*\|.*\|\s*(\d+)\s*\|\s*$/);
    if (!m) continue;
    const sec = m[1], ln = parseInt(m[2], 10);
    const target = hist[ln - 1] || '';
    checked++;
    if (!/^##\s/.test(target)) { warn(`§${sec} → línea ${ln} NO es un header (desync: "${target.slice(0, 40)}")`); desync++; }
    else if (numberedConvention && /^\d+$/.test(sec.split('.')[0]) && !new RegExp(`^##\\s+${sec.split('.')[0]}[.\\s]`).test(target)) {
      warn(`§${sec} → línea ${ln} apunta a OTRO § → offset drift`); desync++;
    }
  }
  if (!checked) info('índice sin filas § — omitido');
  else if (!desync) ok(`${checked} entradas del índice apuntan a headers válidos`);
}

// 4) Frescura cache SW ↔ 05 (opcional)
head('\n4) Frescura (cache SW ↔ 05) — OPCIONAL:');
const hasSwSection = /##\s*§4\s*—\s*Cache bump/i.test(claude);
const swCandidates = ['service-worker.js', 'public/sw.js', 'sw.js', 'public/service-worker.js'];
let swFile = null;
for (const c of swCandidates) { if (existsSync(join(ROOT, c))) { swFile = c; break; } }
if (hasSwSection && swFile) {
  const swSrc = read(join(ROOT, swFile));
  const swVer =
    (swSrc.match(/CACHE_VERSION\s*=\s*'v?(\d{14})'/) || [])[1] ||
    (swSrc.match(/CACHE_(?:NAME|VERSION)\s*=\s*['"]([^'"]+)['"]/) || [])[1] || null;
  if (!swVer) info(`${swFile} sin CACHE_NAME/CACHE_VERSION parseable`);
  else {
    head(`  ℹ️  service-worker: ${swFile} → cache "${swVer}"`);
    const cmCandidates = ['js/core/cache-manager.js', 'src/cache-manager.js', 'src/lib/cache-manager.js'];
    let cmVer = null, cmPath = null;
    for (const c of cmCandidates) {
      const p = join(ROOT, c);
      if (existsSync(p)) { const v = (read(p).match(/APP_VERSION\s*=\s*'v?(\d{14})'/) || [])[1]; if (v) { cmVer = v; cmPath = c; break; } }
    }
    if (cmVer) {
      if (swVer === cmVer || swVer === 'v' + cmVer) ok(`cache SW == ${cmPath} (${swVer})`);
      else warn(`cache DESYNC: SW=${swVer} ≠ ${cmPath}=v${cmVer} → bumpear AMBOS (§4)`);
    }
    const estadoPath = join(DOCS, '05-ESTADO-GLOBAL.md');
    if (existsSync(estadoPath)) {
      const estado = read(estadoPath);
      const vigLine = estado.split('\n').find((l) => /Cache version vigente|Versi[oó]n.*Cache/i.test(l)) || '';
      const vig = (vigLine.match(/`([^`]+)`/) || [])[1] || (vigLine.match(/v\d{14}/) || [])[0] || null;
      if (vig) {
        const nv = (s) => String(s).replace(/^v/, '');
        if (nv(vig) === nv(swVer)) ok(`05 cache vigente == SW ("${swVer}")`);
        else warn(`05 STALE: declara "${vig}" pero SW="${swVer}" → actualizar 05`);
      } else if (!existsSync(join(DOCS, '.estado-auto.md'))) info('05 sin "Cache version vigente" parseable (y sin heartbeat §52 — en era-heartbeat el campo vive en el sidecar)');
    }
  }
} else head('  ℹ️  sin service-worker o sin §4 — omitido');
if (BOOT && hasSwSection && swFile) say('  ✅ cache verificada (SW↔manager↔05)');

// 5) Referencias cruzadas
head('\n5) Referencias cruzadas (huecos en el cerebro):');
if (!BOOT && existsSync(histPath) && indexPaths.length) {
  const histText = read(histPath);
  const indiceText = readIndex();
  const adrNums = new Set([...histText.matchAll(/^##\s+(\d+)\./gm)].map((m) => m[1]));
  const idxNums = new Set([...indiceText.matchAll(/^\|\s*§(\d+)\b/gm)].map((m) => m[1]));
  const missingIdx = [...adrNums].filter((n) => !idxNums.has(n)).sort((a, b) => +a - +b);
  if (!adrNums.size) info('99 con headers por fecha — 5a omitido');
  else if (!missingIdx.length) ok(`${adrNums.size} ADRs de 99 indexados en 00`);
  else warn(`${missingIdx.length} ADR(s) de 99 SIN fila en 00-INDICE: §${missingIdx.join(', §')}`);
}
const leccionesPath = join(DOCS, '30-LECCIONES.md');
if (!BOOT && existsSync(leccionesPath)) {
  // v1.7: nodos HIJOS de lecciones (shards §G.5: 31-LECCIONES-IA, 32-LECCIONES-GIT, …).
  // Sus defs `### L-NN` cuentan igual que las de la madre — 30 deja el puntero, la def vive
  // en la hija. Mismo idioma que el índice shardeado (00[a-z]?-INDICE, línea ~132).
  // Sin esto, shardear lecciones convierte cada def de la hija en ref COLGANTE (warn bloqueante).
  const leccionesShards = readdirSync(DOCS).filter((f) => /^3[1-9]-LECCIONES.*\.md$/.test(f)).sort();
  const leccionesText = [leccionesPath, ...leccionesShards.map((f) => join(DOCS, f))].map(read).join('\n');
  const cortoPath = join(DOCS, '10-MEMORIA-CORTO-PLAZO.md');
  const espacialPath = join(DOCS, '20-MEMORIA-ESPACIAL.md');
  const estadoPath = join(DOCS, '05-ESTADO-GLOBAL.md');
  const histText = existsSync(histPath) ? read(histPath) : '';
  const indiceText = indexPaths.length ? readIndex() : '';
  const defined = new Set([...leccionesText.matchAll(/^###\s+([LM]-\d{2})\b/gm)].map((m) => m[1]));
  const allBrain = [claude, indiceText, existsSync(estadoPath) ? read(estadoPath) : '', leccionesText, histText,
    existsSync(cortoPath) ? read(cortoPath) : '', existsSync(espacialPath) ? read(espacialPath) : ''].join('\n');
  const referenced = new Set([...allBrain.matchAll(/\b([LM]-\d{2})\b/g)].map((m) => m[1]));
  const dangling = [...referenced].filter((r) => !defined.has(r)).sort();
  if (!referenced.size) info('sin refs L-NN/M-NN aún');
  else if (!dangling.length) ok(`refs L-/M- (${referenced.size} usadas / ${defined.size} def) resuelven en 30${leccionesShards.length ? `+${leccionesShards.length} shard(s)` : ''}`);
  else warn(`refs L-/M- COLGANTES: ${dangling.join(', ')}`);
  // 5c) Tombstones-lite (v1.3 §50): lección ⚰️ citada desde nodos VIVOS (99 puede: es historia).
  const quarantined = new Set([...leccionesText.matchAll(/^###\s+([LM]-\d{2})\b[^\n]*⚰️/gm)].map((m) => m[1]));
  if (quarantined.size) {
    const liveText = [claude, existsSync(estadoPath) ? read(estadoPath) : '',
      existsSync(cortoPath) ? read(cortoPath) : '', existsSync(espacialPath) ? read(espacialPath) : ''].join('\n');
    const cited = [...quarantined].filter((id) => new RegExp(`\\b${id}\\b`).test(liveText)).sort();
    if (cited.length) warn(`nodo VIVO cita lección ⚰️ cuarentenada: ${cited.join(', ')} → apuntar al reemplazo o retirar la cita`);
    else ok(`${quarantined.size} lección(es) ⚰️ sin citas desde nodos vivos`);
  }
}
if (BOOT) head('  ⏭️  5a/5b omitidas en --boot');
const refDocs = new Set([...claude.matchAll(/docs\/([\w-]+\.md)/g)].map((m) => m[1]));
const PLACEHOLDER = /^NN-|NOMBRE|<tema>|<carpeta>/;
const missingDocs = [...refDocs].filter((f) => !PLACEHOLDER.test(f) && !existsSync(join(DOCS, f)));
if (!missingDocs.length) ok(`hojas docs/*.md referenciadas en CLAUDE.md (${refDocs.size}) existen`);
else warn(`hojas referenciadas en CLAUDE.md INEXISTENTES: ${missingDocs.join(', ')}`);
if (BOOT && !missingDocs.length) say(`  ✅ ${refDocs.size} hojas referenciadas existen`);

// 6) Skills ↔ inventario [--full] (v1.1: skills/ sin inventario = WARN)
head('\n6) Skills del repo catalogadas en skills-inventory:');
const SKILLS_DIR = join(ROOT, 'skills');
const invPath = join(DOCS, 'skills-inventory.md');
if (BOOT) head('  ⏭️  omitido en --boot');
else if (existsSync(SKILLS_DIR) && existsSync(invPath)) {
  const inv = read(invPath);
  const grabName = (p) => { const m = read(p).match(/^[ \t]*name:[ \t]*["']?([^"'\n]+)/im); return m ? m[1].trim() : null; };
  const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
  let uncat = 0;
  for (const d of dirs) {
    const names = [];
    const own = join(SKILLS_DIR, d.name, 'SKILL.md');
    if (existsSync(own)) { const n = grabName(own); if (n) names.push(n); }
    else {
      try {
        for (const sub of readdirSync(join(SKILLS_DIR, d.name), { withFileTypes: true })) {
          if (!sub.isDirectory()) continue;
          const p = join(SKILLS_DIR, d.name, sub.name, 'SKILL.md');
          if (existsSync(p)) { const n = grabName(p); if (n) names.push(n); }
        }
      } catch { /* ilegible → por nombre de carpeta */ }
    }
    const catalogued = inv.includes(d.name) || names.some((n) => inv.includes(n));
    if (!catalogued) { warn(`skill '${d.name}' NO está en skills-inventory.md → catalogar (§G.4)`); uncat++; }
  }
  if (!uncat) ok(`${dirs.length} carpetas de skills/ catalogadas`);
  // (6b QUITADO en v1.3 — sentencia G-11: 0 señal en 3 auditorías, puro ruido.)
} else if (existsSync(SKILLS_DIR)) {
  warn('skills/ existe pero docs/skills-inventory.md NO → crear el catálogo (§G.4)');
} else head('  ℹ️  skills/ no existe — omitido');

// 7) Integridad de archiveDir (deliberaciones) [--full]
head('\n7) Integridad de archiveDir (deliberación capturada ↔ conectada):');
const archiveDir = manifest.archiveDir ? join(ROOT, manifest.archiveDir) : null;
if (BOOT) head('  ⏭️  omitido en --boot');
else if (!archiveDir) info('manifest sin archiveDir — gate omitido (declararlo, §G.4)');
else if (!existsSync(archiveDir)) info(`archiveDir no existe en esta máquina (${manifest.archiveDir}) — bóveda no clonada; gate omitido`);
else {
  // v1.9: una deliberación es una CARPETA (la convención real) o un fichero suelto .json/.jsonl/.md.
  // Antes solo casaban ficheros sueltos del nivel superior → 0 crudos indexados y un ✅ vacuo con la bóveda llena.
  const files = readdirSync(archiveDir).filter((f) => !/^README/i.test(f) && f !== 'runs.log' && !f.startsWith('.')
    && (/\.(json|jsonl|md)$/i.test(f) || statSync(join(archiveDir, f)).isDirectory()));
  const readmePath = join(archiveDir, 'README.md');
  const readme = existsSync(readmePath) ? read(readmePath) : '';
  let bad = 0;
  if (!readme) { warn('archiveDir sin README.md índice — todo crudo debe estar indexado'); bad++; }
  else for (const f of files) if (!readme.includes(f)) { warn(`archivo de deliberación SIN fila en el README del archive: ${f}`); bad++; }
  // anclas: toda ref "research-archive/<file>" en 99/00/10/specs debe resolver en archiveDir
  const scanFiles = [histPath, indicePath, join(DOCS, '10-MEMORIA-CORTO-PLAZO.md')];
  if (manifest.specsDir && existsSync(join(ROOT, manifest.specsDir)))
    for (const s of readdirSync(join(ROOT, manifest.specsDir)).filter((f) => f.endsWith('.md')))
      scanFiles.push(join(ROOT, manifest.specsDir, s));
  const refd = new Set();
  for (const sf of scanFiles) {
    if (!existsSync(sf)) continue;
    for (const m of read(sf).matchAll(/research-archive\/([\w][\w.-]+(?:\.(?:json|jsonl|md))?)\/?/g)) refd.add(m[1]);
  }
  const danglingRefs = [...refd].filter((f) => !existsSync(join(archiveDir, f)));
  if (danglingRefs.length) { warn(`anclas de deliberación que NO resuelven en archiveDir: ${danglingRefs.join(', ')}`); bad++; }
  const runsLog = join(archiveDir, 'runs.log');
  if (existsSync(runsLog)) {
    for (const l of read(runsLog).split('\n').filter(Boolean)) {
      const f = (l.split('|')[2] || '').trim();
      if (f && f !== 'DESCARTADO' && !existsSync(join(archiveDir, f))) { warn(`runs.log cita archivo inexistente: ${f}`); bad++; }
    }
  }
  if (!bad) ok(`archiveDir íntegro (${files.length} crudos indexados; anclas resuelven)`);
  // 7b) Bóveda vía fs (M-03 §50): commits ≠ origin. Lo no-commiteado lo cubre session-handoff.
  let vaultGit = archiveDir;
  for (let i = 0; i < 4 && !existsSync(join(vaultGit, '.git')); i++) vaultGit = join(vaultGit, '..');
  if (existsSync(join(vaultGit, '.git'))) {
    const refSha = (name) => {
      const direct = join(vaultGit, '.git', name);
      if (existsSync(direct)) return read(direct).trim().slice(0, 40);
      const packed = join(vaultGit, '.git', 'packed-refs');
      if (existsSync(packed)) { const l = read(packed).split('\n').find((x) => x.endsWith(' ' + name)); if (l) return l.slice(0, 40); }
      return null;
    };
    const headRef = (read(join(vaultGit, '.git', 'HEAD')).match(/ref:\s*(\S+)/) || [])[1];
    const local = headRef ? refSha(headRef) : null;
    const remote = headRef ? refSha(headRef.replace('refs/heads/', 'refs/remotes/origin/')) : null;
    if (local && remote && local !== remote)
      warn(`bóveda: HEAD local (${local.slice(0, 7)}) ≠ origin (${remote.slice(0, 7)}) → push pendiente (o pull si origin avanzó)`);
    else if (local && remote) ok('bóveda: HEAD local == origin (respaldo remoto al día)');
  }
}

// 8) SSoT — hecho duplicado fuera del nodo dueño [--full]
head('\n8) SSoT (un hecho = un nodo dueño):');
if (BOOT) head('  ⏭️  omitido en --boot');
else if (!Array.isArray(manifest.ssotFacts) || !manifest.ssotFacts.length) info('manifest sin ssotFacts — gate omitido (declarar hechos críticos)');
else {
  let hits = 0;
  for (const fact of manifest.ssotFacts) {
    try {
      const re = new RegExp(fact.regex, 'g');
      for (const rel of fact.scan || []) {
        if (rel === fact.owner) continue;
        const p = join(ROOT, rel);
        if (!existsSync(p)) continue;
        const m = read(p).match(re);
        if (m) { warn(`SSoT: "${fact.regex}" (dueño: ${fact.owner}) aparece en ${rel} (${m.length}×) → reemplazar por puntero`); hits++; }
      }
    } catch { warn(`ssotFacts: regex inválida "${fact.regex}"`); hits++; }
  }
  if (!hits) ok(`${manifest.ssotFacts.length} hecho(s) SSoT sin duplicados fuera de su dueño`);
}

// 9) Consolidado-aún-en-10 (síntoma exacto de la inflación) [--full]
head('\n9) Consolidado-aún-en-10 (GC pendiente):');
const cortoP = join(DOCS, '10-MEMORIA-CORTO-PLAZO.md');
if (BOOT) head('  ⏭️  omitido en --boot');
else if (existsSync(cortoP) && indexPaths.length) {
  const idxNums = new Set([...readIndex().matchAll(/^\|\s*§(\d+)\b/gm)].map((m) => m[1]));
  let flagged = 0;
  for (const l of read(cortoP).split('\n')) {
    if (!l.trim().startsWith('|')) continue; // solo filas de tabla (TODO ledger)
    // el ✅ debe estar en la CELDA de estado (no inline en el texto del item) — anti falso-positivo
    const cells = l.split('|').map((c) => c.trim());
    if (!cells.some((c) => /^✅/.test(c))) continue;
    const secs = [...l.matchAll(/§(\d+)/g)].map((m) => m[1]);
    if (secs.some((s) => idxNums.has(s))) { warn(`fila con estado ✅ ya consolidada (§${secs.join(',§')}) sigue en la tabla del 10 → retirarla en la poda (GC §G.4)`); flagged++; }
  }
  if (!flagged) ok('tabla TODO del 10 sin filas ✅ ya consolidadas');
}

// 10) Huérfanas (v1.3: fusiona el viejo #1): BFS 2º orden + registro DIRECTO de neuronas NN- [--full]
head('\n10) Huérfanas (BFS de ruteo + registro directo de neuronas):');
if (BOOT) head('  ⏭️  omitido en --boot');
else {
  const allow = new Set(manifest.orphanAllowlist || []);
  const universe = readdirSync(DOCS).filter((f) => f.endsWith('.md'));
  const edgeRe = /(?:docs\/)?([\w][\w-]*\.md)/g;
  const fileText = (f) => existsSync(join(DOCS, f)) ? read(join(DOCS, f)) : '';
  const reachable = new Set();
  const queue = [];
  // raíces: CLAUDE.md + 00 + 40 (sus referencias arrancan el grafo)
  for (const rootTxt of [claude, fileText('00-INDICE.md'), fileText('40-LOBULOS-DOMINIO.md')])
    for (const m of rootTxt.matchAll(edgeRe)) if (universe.includes(m[1]) && !reachable.has(m[1])) { reachable.add(m[1]); queue.push(m[1]); }
  reachable.add('00-INDICE.md'); reachable.add('40-LOBULOS-DOMINIO.md');
  while (queue.length) {
    const cur = queue.pop();
    for (const m of fileText(cur).matchAll(edgeRe)) if (universe.includes(m[1]) && !reachable.has(m[1])) { reachable.add(m[1]); queue.push(m[1]); }
  }
  const orphans = universe.filter((f) => !reachable.has(f) && !allow.has(f));
  if (orphans.length) warn(`huérfanas de 2º ORDEN (existen pero ningún nodo de ruteo llega a ellas): ${orphans.join(', ')} → conectar o allowlist con razón`);
  // registro DIRECTO (regla §G.5 "si CLAUDE.md no la conoce, el cerebro está roto" — ex-#1):
  let unregistered = 0;
  for (const n of universe.filter((f) => /^\d{2}-/.test(f))) {
    const isChildLobe = /^4[1-9]-/.test(n);
    if (claude.includes(n)) continue;
    if (isChildLobe && lobeRegistry.includes(n)) continue;
    warn(`neurona ${n} sin registro DIRECTO en ${isChildLobe ? '40-LOBULOS' : 'CLAUDE.md §0'} (§G.5)`); unregistered++;
  }
  if (!orphans.length && !unregistered) ok(`${universe.length} docs alcanzables y neuronas registradas`);
}

// (11 QUITADO v1.3: peer-hash warn no cazó 3 kernels divergentes; F1 = hash-gate BLOQUEANTE vs canónico.)

// 12) Fechas stale en 05/10 [info · corre también en --boot]
{
  const staleDays = manifest.staleDays || 10;
  const today = new Date();
  let oldest = null, oldestWhere = '';
  for (const rel of ['docs/05-ESTADO-GLOBAL.md', 'docs/10-MEMORIA-CORTO-PLAZO.md']) {
    const p = join(ROOT, rel);
    if (!existsSync(p)) continue;
    const m = read(p).match(/(?:última actualización[:* ]*|\(al |actualizado )\**(\d{4}-\d{2}-\d{2})/i);
    if (m) { const d = new Date(m[1]); if (!oldest || d < oldest) { oldest = d; oldestWhere = rel; } }
  }
  if (oldest) {
    const days = Math.floor((today - oldest) / 86400000);
    if (days > staleDays) info(`frescura: ${oldestWhere} sellado hace ${days} días (> ${staleDays}) → re-verificar vs git real y re-sellar`);
  }
}

// 13) Specs: checklist con evidencia [--full]
head('\n13) Specs con checklist tickeable (evidencia, no dibujito):');
if (BOOT) head('  ⏭️  omitido en --boot');
else if (!manifest.specsDir) info('manifest sin specsDir — gate omitido');
else {
  const sd = join(ROOT, manifest.specsDir);
  if (!existsSync(sd)) info(`specsDir no existe (${manifest.specsDir})`);
  else {
    const specs = readdirSync(sd).filter((f) => f.endsWith('.md'));
    let noCk = 0, badTicks = 0;
    // v1.3 §50: solo evidencia RESOLUBLE (ancla seguible); la vieja aceptaba backtick/fecha = tautológica.
    const EVIDENCE = /§\d+|TODO-\d+|research-archive\/|docs\/[\w-]+\.md|specs\/[\w-]+\.md|https?:\/\/|\b[0-9a-f]{7,40}\b/;
    for (const s of specs) {
      const t = read(join(sd, s));
      if (!/^##+\s*.*Checklist/im.test(t)) { noCk++; continue; }
      // v1.4.1 §51: agregar POR SPEC (no por tick) — 33 warns idénticos en un repo hermano eran
      // ruido inaccionable; 1 warn con conteo + 1er ejemplo empuja igual y se LEE.
      let n = 0, first = '';
      for (const l of t.split('\n')) {
        if (!/^\s*-\s*\[x\]/i.test(l)) continue;
        if (!EVIDENCE.test(l)) { n++; if (!first) first = l.trim().slice(0, 60); }
      }
      if (n) { warn(`${s}: ${n} ítem(s) tickeado(s) SIN evidencia resoluble (1º: "${first}…") → anclar §/TODO/ruta/URL/sha`); badTicks += n; }
    }
    if (!badTicks) ok(`ticks de checklist con evidencia en ${specs.length - noCk} spec(s) con checklist`);
    if (noCk) info(`${noCk} spec(s) sin sección "## Checklist" (los previos a la convención §173 — info)`);
  }
}

// 14) deepAudit — auditoría Nivel-2 vigente [nudge info; días en --boot, headers solo en --full]
{
  const da = manifest.deepAudit;
  if (da && da.last) {
    const days = Math.floor((new Date() - new Date(da.last)) / 86400000);
    let due = da.maxDays && days > da.maxDays ? `hace ${days} días (> ${da.maxDays})` : null;
    let gap = 0;
    if (!BOOT && da.maxAdrGap && existsSync(histPath)) {
      const headers = (read(histPath).match(/^##\s+/gm) || []).length;
      gap = da.coveredHeaderCount ? headers - da.coveredHeaderCount : 0;
      if (gap >= da.maxAdrGap) due = (due ? due + ' y ' : '') + `${gap} ADRs nuevos (≥ ${da.maxAdrGap})`;
    }
    // v1.6 F3 §53 (escalación con GRACIA — el nudge info se ignoró semanas; el warn BLOQUEA commits
    // del cerebro vía pre-commit): vencida dentro de gracia (maxDays+7 / gap+6) = info; pasada = WARN.
    const pastGrace = (da.maxDays && days > da.maxDays + 7) || (da.maxAdrGap && gap >= da.maxAdrGap + 6);
    if (due && pastGrace) warn(`🔬 auditoría Nivel-2 MUY vencida (${due}; gracia agotada) → correr skill auditoria-cerebro / mantenimiento-general AHORA`);
    else if (due) info(`🔬 auditoría Nivel-2 VENCIDA: última ${da.last}, ${due} → correr skill auditoria-cerebro (§173)`);
    // v1.3 §50: la tabla de la auditoría debe EXISTIR (sin ella la Sonda 0 no puede diffear).
    if (!BOOT && da.tableFile && archiveDir && existsSync(archiveDir) && !existsSync(join(archiveDir, da.tableFile)))
      warn(`deepAudit.tableFile "${da.tableFile}" NO existe en archiveDir → la Sonda 0 de la próxima auditoría no tiene input`);
  } else info('manifest sin deepAudit — la auditoría Nivel-2 no tiene disparador (declararlo, §173)');
}

// 16) Fiabilidad (M-22 §257/TODO-44): marcadores `verificado-vivo:` stale [info, --full]
//     Cura del hueco "documentado ✅ ≠ real": una afirmación sobre realidad externa
//     (desplegado/live/datos) lleva `verificado-vivo: YYYY-MM-DD`; este gate avisa cuando se
//     vuelve stale. Opt-in: 0 marcadores → 0 hallazgos → no rompe ningún repo (mecaniza M-22).
head('\n16) Fiabilidad (M-22): claims `verificado-vivo` vs realidad:');
if (BOOT) head('  ⏭️  omitido en --boot');
else {
  const vlStaleDays = manifest.verifiedLiveStaleDays || 30;
  const vlScan = manifest.verifiedLiveScan || ['docs/05-ESTADO-GLOBAL.md', 'docs/10-MEMORIA-CORTO-PLAZO.md'];
  const today = new Date();
  let total = 0, stale = 0;
  for (const rel of vlScan) {
    const p = join(ROOT, rel);
    if (!existsSync(p)) continue;
    for (const m of read(p).matchAll(/verificado-vivo:\s*(\d{4}-\d{2}-\d{2})/gi)) {
      total++;
      const days = Math.floor((today - new Date(m[1])) / 86400000);
      if (days > vlStaleDays) { info(`claim "verificado-vivo: ${m[1]}" en ${rel} tiene ${days}d (> ${vlStaleDays}) → re-verificar contra realidad o retirar la afirmación (M-22)`); stale++; }
    }
  }
  if (total && !stale) ok(`${total} claim(s) \`verificado-vivo\` vigentes (≤ ${vlStaleDays}d)`);
  else if (!total) ok('check de fiabilidad activo (sin marcadores `verificado-vivo:` aún — opt-in M-22/§257)');
}

// ---- salida (presupuesto de stdout en --boot) ----
lines.push(`\n${problems === 0 ? '✅ CEREBRO SANO (estructura íntegra' + (manifest.deepAudit && manifest.deepAudit.last ? ' · auditoría semántica: ' + manifest.deepAudit.last : '') + ')' : '⚠️  ' + problems + ' problema(s) — revisar antes de avanzar'}\n`);
let out = lines;
if (BOOT && out.join('\n').length > 2000) {
  // presupuesto duro: cada línea del boot se re-inyecta como contexto en CADA sesión
  out = out.filter((l) => !l.startsWith('  ✅') || /BOOT|SANO/.test(l));
  if (out.join('\n').length > 2000) out = out.slice(0, 24).concat(['  … (recortado por presupuesto de stdout; detalle: npm run brain:check)']);
}
console.log(out.join('\n'));
process.exit(problems ? 1 : 0);
