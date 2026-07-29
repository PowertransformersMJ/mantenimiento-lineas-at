#!/usr/bin/env node
/**
 * session-handoff.mjs — Caja negra anti-saturación (TODO-28 #1, comité §33).
 * Escribe la foto REAL de la sesión (git, no promesas) a docs/.handoff-auto.md para que
 * el próximo operador arranque con datos aunque esta sesión muera sin consolidar (mata M-01).
 *
 * Modos:
 *   --end        SessionEnd/Stop: escribe la foto en silencio (exit 0 siempre — jamás bloquear).
 *   --precompact PreCompact: escribe la foto Y emite JSON con la ORDEN de consolidar docs/10 AHORA.
 *   --boot-echo  SessionStart: escribe el marker del canario + 💓 HEARTBEAT (F2 §52: sidecar
 *                docs/.estado-auto.md con la mitad DERIVABLE del estado — solo-local, SIN red,
 *                degradación RUIDOSA) + imprime foto/estado/nags (entra al contexto).
 * Kill-switch heartbeat (§52): si falla 2×/mes y su ausencia no cuesta nada medible → borrarlo.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', '.handoff-auto.md');
const MARKER = join(ROOT, 'docs', '.boot-marker'); // canario de boot (TODO-31b §49): prueba de que SessionStart corrió
const mode = process.argv[2] || '--end';

const git = (args, cwd = ROOT) => {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return '(git no disponible)'; }
};

// Guardián de la bóveda compartida (M-03 §49): el gate vive pegado al recurso, no en doctrina.
// Devuelve null si no hay bóveda/git; si hay, {root, dirty: n} con n = archivos sin commitear.
const boveda = () => {
  try {
    const archiveDir = JSON.parse(readFileSync(join(ROOT, 'docs', '.brain-manifest.json'), 'utf8')).archiveDir;
    if (!archiveDir) return null;
    let dir = join(ROOT, archiveDir);
    for (let i = 0; i < 4 && !existsSync(join(dir, '.git')); i++) dir = join(dir, '..');
    if (!existsSync(join(dir, '.git'))) return null;
    const porcelain = git(['status', '--porcelain'], dir);
    if (porcelain === '(git no disponible)') return null;
    return { root: dir, dirty: porcelain ? porcelain.split('\n').length : 0 };
  } catch { return null; }
};

// 💓 HEARTBEAT (F2 §52) — la mitad DERIVABLE del estado se GENERA en cada boot (el 05 ya no la
// escribe a mano: no puede mentir sobre lo que no contiene). SOLO lectura local, CERO red.
// Cada sonda degrada RUIDOSA: fallo = "❌ NO VERIFICADO (motivo)", jamás un valor viejo con sello fresco.
const heartbeat = () => {
  const probe = (fn) => { try { const v = fn(); return (v == null || v === '' || v === '(git no disponible)') ? '❌ NO VERIFICADO' : v; } catch (e) { return `❌ NO VERIFICADO (${String(e && e.message || e).slice(0, 40)})`; } };
  let costoPct = null; // lo llena la sonda de costo; el banner en cristiano lo reusa (F3 §53)
  let manifest = {}; try { manifest = JSON.parse(readFileSync(join(ROOT, 'docs', '.brain-manifest.json'), 'utf8')); } catch { /* banner degrada */ }
  const BRAIN_RE = /^(docs\/|CLAUDE\.md$|skills\/|scripts\/(brain|boot-gate|session-handoff)|_legacy\/)/;
  const swP = ['service-worker.js', 'public/sw.js', 'sw.js', 'public/service-worker.js'].map((c) => join(ROOT, c)).find((p) => existsSync(p));
  const lines = [
    '# 💓 Estado DERIVABLE (⚙️ GENERADO por heartbeat en cada boot — NO editar; sidecar gitignored, §52)',
    `- generado: ${new Date().toISOString()} · solo-local (las sondas de red viven en la resonancia F3)`,
    `- git: branch ${probe(() => git(['branch', '--show-current']))} · HEAD ${probe(() => git(['log', '-1', '--format=%h · %s']))}`,
    `- sucios sin commit: ${probe(() => { const d = git(['status', '--porcelain']); return d ? `${d.split('\n').length} archivo(s) (detalle: git status)` : '(limpio)'; })}`,
    `- origin visto hace: ${probe(() => { const p = join(ROOT, '.git', 'FETCH_HEAD'); if (!existsSync(p)) return 'NUNCA → git fetch antes de afirmar deploy (§3.3)'; const h = (Date.now() - statSync(p).mtimeMs) / 3.6e6; return `${h.toFixed(1)}h${h > 24 ? ' ⚠️ refs remotas VIEJAS → git fetch antes de afirmar deploy (§3.3)' : ''}`; })}`,
    `- SW cache vigente: ${swP ? probe(() => (readFileSync(swP, 'utf8').match(/CACHE_(?:NAME|VERSION)\s*=\s*['"]([^'"]+)['"]/) || [])[1]) + ` (${swP.split(/[\\/]/).pop()})` : '(sin service worker)'}`,
    `- CNAME: ${probe(() => existsSync(join(ROOT, 'CNAME')) ? readFileSync(join(ROOT, 'CNAME'), 'utf8').trim() : '(no aplica)')}`,
    `- 🧮 costo-cerebro 30d: ${probe(() => { const out = git(['log', '--since=30.days', '--name-only', '--format=%x01']); const cs = out.split('\x01').map((c) => c.trim()).filter(Boolean); if (!cs.length) return 'sin commits en 30d'; const brain = cs.filter((c) => { const fs_ = c.split('\n').map((l) => l.trim()).filter(Boolean); return fs_.length && fs_.every((f) => BRAIN_RE.test(f)); }).length; costoPct = Math.round((brain / cs.length) * 100); return `${costoPct}% (${brain}/${cs.length} commits solo-cerebro, por paths)${costoPct > 30 ? ' 🔴 > bandera 30% (TODO-28 #6: recortar doctrina, no añadir)' : ' ✅ ≤ 30%'}`; })}`,
    `- 🧊 consolidación: ${probe(() => { const last99 = git(['log', '-1', '--format=%ct', '--', 'docs/99-HISTORIAL-ADR.md']); if (!/^\d+$/.test(last99)) return 'sin 99 trackeado'; const prod = git(['log', `--since=${new Date(+last99 * 1000).toISOString()}`, '--name-only', '--format=%x01']).split('\x01').map((c) => c.trim()).filter(Boolean).filter((c) => c.split('\n').map((l) => l.trim()).filter(Boolean).some((f) => f && !BRAIN_RE.test(f))).length; return prod >= 3 ? `⚠️ ${prod} commits de PRODUCTO sin ADR desde el último toque a 99 → CONSOLIDAR EN FRÍO es la 1ª tarea de ESTA sesión (contexto fresco > saturado, M-02; fontanería: npm run brain:archive)` : `al día (${prod} commit(s) de producto desde el último ADR)`; })}`,
  ];
  // 🧭 Banner EN CRISTIANO (F3 §53 — primer entregable visible para el dueño; el calendario vive
  // en el tool, no en el humano: cuando algo dice TOCA, un mensaje suyo dispara el mantenimiento).
  const dias = (iso) => Math.floor((Date.now() - new Date(iso)) / 86400000);
  // v1.8: `lastOffsiteBackup` admite 3 estados, no 2. Antes, "sin fecha" = "NUNCA hecha ⚠️" para
  // siempre — y un aviso que el dueño YA decidió no atender deja de ser aviso y pasa a ser ruido
  // que tapa a los que sí importan. El sentinel "NINGUNA" distingue DECIDIDO de PENDIENTE, sin
  // mentir: sigue diciendo que hay una sola copia (que es el hecho), pero no pide una acción muerta.
  const backupOptOut = String(manifest.lastOffsiteBackup || '').toUpperCase() === 'NINGUNA';
  const backup = !backupOptOut && manifest.lastOffsiteBackup ? dias(manifest.lastOffsiteBackup) : null;
  const da = manifest.deepAudit || {};
  const audDias = da.last ? dias(da.last) : null;
  const audToca = audDias != null && da.maxDays && audDias > da.maxDays;
  lines.push('', '🧭 EN CRISTIANO (para el dueño):',
    `   · Mantenimiento del cerebro: ${costoPct != null ? costoPct + '% del trabajo del mes (meta: menos del 30%)' : 'sin medir aún'}${costoPct > 30 ? ' 🔴' : ''}`,
    `   · Copia de seguridad externa: ${backupOptOut ? 'ninguna, por decisión del dueño — la bóveda vive en UNA sola copia' : backup != null ? `hace ${backup} día(s)${backup > 35 ? ' ⚠️ TOCA renovarla' : ' ✅'}` : '⚠️ NUNCA hecha'}`,
    `   · Revisión profunda del cerebro: ${audDias != null ? (audToca ? `⚠️ TOCA (última hace ${audDias} días)` : `al día (hace ${audDias} días)`) : '⚠️ nunca'}${audToca || (backup != null && backup > 35) ? ' → di: "haz el mantenimiento mensual"' : ''}`);
  return lines.join('\n');
};

try {
  if (mode === '--boot-echo') {
    writeFileSync(MARKER, new Date().toISOString(), 'utf8'); // el canario: boot-gate exige este marker fresco
    const hb = heartbeat();
    writeFileSync(join(ROOT, 'docs', '.estado-auto.md'), hb + '\n', 'utf8');
    console.log(hb);
    if (existsSync(OUT)) {
      const ageH = (Date.now() - statSync(OUT).mtimeMs) / 3.6e6;
      if (ageH < 48) {
        console.log(`\n🕹️ HANDOFF AUTOMÁTICO de la sesión anterior (hace ${ageH.toFixed(1)}h — datos de git, no promesas):\n`);
        console.log(readFileSync(OUT, 'utf8'));
      }
    }
    const b = boveda();
    if (b && b.dirty) console.log(`\n⚠️ BÓVEDA COMPARTIDA SUCIA (M-03 §49): ${b.dirty} archivo(s) sin commitear en ${b.root} — commitea+pushea AHORA (respaldo ajeno también vale, aunque el crudo sea de otro cerebro).`);
    process.exit(0);
  }

  const b = boveda();
  const foto = [
    `# 🕹️ Handoff automático (escrito por hook, no por Claude) — ${new Date().toISOString()}`,
    `> Foto REAL de git al cierre/compactación. Si contradice a docs/10, ESTA es la verdad (M-01).`,
    ``,
    `- Branch: ${git(['branch', '--show-current'])} · HEAD: ${git(['log', '-1', '--format=%h · %s'])}`,
    `- Sucios sin commit: ${git(['status', '--porcelain']) || '(limpio)'}`,
    `- Bóveda (brain-private): ${b ? (b.dirty ? `⚠️ SUCIA — ${b.dirty} archivo(s) sin commitear (M-03: commitear+pushear)` : 'limpia ✅') : '(no accesible)'}`,
    ``,
    `## Últimos commits (24h)`,
    git(['log', '--since=24hours', '--format=- %h %s']) || '- (ninguno)',
  ].join('\n');
  writeFileSync(OUT, foto, 'utf8');

  if (mode === '--precompact') {
    console.log(JSON.stringify({
      systemMessage: '🧠 PreCompact: foto de sesión escrita en docs/.handoff-auto.md',
      hookSpecificOutput: {
        hookEventName: 'PreCompact',
        additionalContext: 'ORDEN DEL CEREBRO (hook PreCompact, TODO-28 #1): el contexto está por compactarse. ANTES de seguir con la tarea, consolida el estado vivo AHORA en docs/10-MEMORIA-CORTO-PLAZO.md (foco, avances no documentados, callejones) y si cambió la salud, docs/05. La foto real de git quedó en docs/.handoff-auto.md.',
      },
    }));
  }
  process.exit(0);
} catch {
  process.exit(0); // jamás bloquear la sesión por el hook
}
