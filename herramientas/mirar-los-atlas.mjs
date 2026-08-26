// ============================================================================
// mirar-los-atlas.mjs — EL PORTERO: abre cada atlas, lo mira y decide
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE (`99 §ADR-085`). El Ingeniero encendió la fusión automática de
// las propuestas del vigía. Antes de eso, entre «el vigía reconstruyó un atlas»
// y «eso llega a producción» había una persona que abría el mapa y lo miraba; el
// aviso que acompañaba a la decisión era exactamente ése: **nadie mirará el mapa
// antes de publicar**.
//
// Esto es esa persona. No un sustituto retórico: hace lo mismo que hacía ella —
// construir el banco, abrir el atlas, esperar a que pinte y comprobar que hay un
// mapa vivo, que la capa nueva está puesta y que el lienzo tiene dibujo— y puede
// **decir que no**. Si dice que no, no hay propuesta y la corrida sale roja: el
// atlas se queda como estaba, que es exactamente lo que pasaba antes cuando
// nadie fusionaba. Nunca publica a ciegas.
//
// ⚠️ LO QUE **NO** ES. No opina de estética ni compara con la foto de ayer. Dice
// si hay algo dibujado, no si está bien dibujado. La diferencia importa: cierra
// el fallo caro y verificable (el lienzo en blanco, la capa que no se montó, la
// página que murió callada) y no pretende cerrar el del criterio.
//
// USO:
//   node herramientas/mirar-los-atlas.mjs temperatura
//   node herramientas/mirar-los-atlas.mjs rayos solVivo nubesVivo
//   node herramientas/mirar-los-atlas.mjs corredor:radiacion corredor:temperatura
//
// Construye el banco él mismo (`SONDA_MAPA=1`), levanta el servidor, mira cada
// atlas y lo apaga todo. Sale 1 si alguno no pasa. Las fotos quedan en
// `fotos-del-portero/` para poder mirarlas después — sobre todo las que fallan.
// ============================================================================
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDAS = join(RAIZ, 'fotos-del-portero');
const PUERTO = Number(process.env.PUERTO_BANCO ?? 4173);

const claves = process.argv.slice(2);
if (!claves.length) {
  console.error('⛔ dime qué atlas mirar. Ej.: node herramientas/mirar-los-atlas.mjs temperatura');
  process.exit(2);
}

const { ATLAS } = await import('../web/src/vistas/atlasCatalogo.ts');
const { CORREDOR, ID_CAPA_CORREDOR } = await import('../web/src/vistas/corredor.ts');

/**
 * QUÉ HAY QUE ABRIR Y QUÉ CAPA TIENE QUE APARECER, para cada clave.
 *
 * ⚠️ LAS DOS CAPAS FINAS DEL CORREDOR TAMBIÉN PASAN POR AQUÍ (`99 §ADR-087`).
 * Se mudaron al atlas, y `§ADR-071` no distingue: **no se publica dibujo de mapa
 * que no se pueda mirar**. Dejarlas fuera del portero habría sido volver al
 * estado en que verificar un dibujo dependía de que alguien abriera su
 * navegador — que es exactamente lo que costó una sesión entera.
 *
 * Se piden con el prefijo `corredor:` porque no son atlas: no tienen calendario
 * ni fecha, y meterlas en la misma lista invitaría a tratarlas como si la
 * tuvieran.
 */
function loQueSeMira(clave) {
  if (clave.startsWith('corredor:')) {
    const cual = clave.slice('corredor:'.length);
    if (!CORREDOR[cual]) return null;
    // Se abre un atlas cualquiera de la región Y ADEMÁS la capa fina encima: es
    // el estado real que ve el Ingeniero, no un montaje aparte.
    return {
      idCapa: ID_CAPA_CORREDOR,
      direccion: `que=atlas-una&atlas=temperatura&corredor=${cual}`,
      rotulo: `corredor · ${CORREDOR[cual].rotulo}`,
    };
  }
  if (!ATLAS[clave]) return null;
  return {
    idCapa: ATLAS[clave].idCapa,
    direccion: `que=atlas-una&atlas=${clave}`,
    rotulo: clave,
  };
}

for (const c of claves) {
  if (!loQueSeMira(c)) {
    console.error(`⛔ «${c}» no es un atlas ni una capa del corredor. Los que hay: `
      + `${Object.keys(ATLAS).join(', ')}`
      + `, ${Object.keys(CORREDOR).map((k) => `corredor:${k}`).join(', ')}`);
    process.exit(2);
  }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** El banco NO viaja al sitio publicado: se construye aparte, con la sonda. */
console.log('🔨 construyendo el banco (con sonda)…');
const build = spawnSync('npm', ['run', 'build'], {
  cwd: RAIZ, stdio: 'inherit', env: { ...process.env, SONDA_MAPA: '1' },
});
if (build.status !== 0) { console.error('⛔ el banco no construye'); process.exit(1); }
if (!existsSync(join(RAIZ, 'web/dist/sonda-satelital.html'))) {
  console.error('⛔ se construyó sin el banco: falta `web/dist/sonda-satelital.html`.');
  process.exit(1);
}

console.log(`🌐 levantando el banco en el puerto ${PUERTO}…`);
const servidor = spawn('npx', ['vite', 'preview', '--port', String(PUERTO), '--strictPort'], {
  cwd: join(RAIZ, 'web'), stdio: ['ignore', 'ignore', 'inherit'],
});

/** Se espera a que CONTESTE, no un número de segundos a ojo. */
async function esperarAlBanco() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${PUERTO}/sonda-satelital.html`);
      if (r.ok) return true;
    } catch { /* aún no */ }
    await dormir(500);
  }
  return false;
}

let fallaron = [];
try {
  if (!await esperarAlBanco()) {
    console.error(`⛔ el banco no contestó en 30 s en el puerto ${PUERTO}`);
    process.exit(1);
  }
  mkdirSync(SALIDAS, { recursive: true });

  for (const clave of claves) {
    const { idCapa, direccion, rotulo } = loQueSeMira(clave);
    console.log(`\n👁️  mirando «${rotulo}» (capa ${idCapa})…`);
    // Uno detrás de otro y no a la vez: cada foto levanta su propio Chrome con
    // WebGL por software, y tres a la vez en un servidor de dos núcleos se
    // estorban hasta que alguno no llega a pintar a tiempo. Un portero lento es
    // molesto; un portero que falla por prisa es peor, porque enseña a
    // desactivarlo.
    const r = spawnSync(process.execPath, [
      join(RAIZ, 'herramientas/foto-del-banco.mjs'),
      `http://localhost:${PUERTO}/sonda-satelital.html?${direccion}`,
      '--salida', join(SALIDAS, `${clave.replace(':', '-')}.png`),
      '--espera', String(process.env.ESPERA_BANCO ?? 14),
      '--exigir', '--exigir-capa', idCapa,
    ], { stdio: 'inherit' });
    if (r.status !== 0) fallaron.push(clave);
  }
} finally {
  servidor.kill();
}

console.log('');
if (fallaron.length) {
  console.error(`⛔ EL PORTERO DICE QUE NO en: ${fallaron.join(', ')}.`);
  console.error(`   Las fotos están en ${SALIDAS}/ — míralas antes de tocar nada.`);
  console.error('   Esto NO se publica: el atlas se queda como estaba.');
  process.exit(1);
}
console.log(`✅ el portero dice que sí en las ${claves.length} capas: ${claves.join(', ')}.`);
