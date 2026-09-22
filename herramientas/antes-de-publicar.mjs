// ============================================================================
// antes-de-publicar.mjs — EL PORTERO DEL DESPLIEGUE A MANO
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE (`35 · L-77`, `10 · TODO-102 ⑧`). El 2026-09-01 un despliegue
// salió perfecto —el paquete correcto, los hashes comprobados— y aun así
// **devolvió el atlas del clima varios días hacia atrás en producción**: 28
// ficheros de dato retrocedidos.
//
// La causa no fue un error de código. Fue que el vigía empuja commits de DATO
// cada pocas horas a `web/public/mapas/`, o sea **dentro del sitio publicado**,
// y el disco local llevaba 37 commits de retraso. `build` empaquetó la copia
// vieja y `deploy` la publicó encima de la buena.
//
// Lo traicionero es que **todas las comprobaciones daban verde**: el paquete de
// código sí era el más nuevo, y lo que había retrocedido era el DATO, que no
// viaja en el paquete y que ninguna prueba mira. Se descubrió por casualidad.
//
// Esto es el portero que faltaba. Corre SOLO antes de `npm run deploy` y dice
// que no cuando publicar borraría trabajo ajeno.
//
// LO QUE COMPRUEBA, en orden:
//   ① que el disco NO esté atrasado respecto al remoto  ← el fallo de L-77
//   ② que exista algo construido en `web/dist`
//   ③ que lo construido sea POSTERIOR a lo último que cambió en el sitio
//      (si trajiste datos nuevos y no volviste a construir, publicarías lo viejo)
//
// LO QUE **NO** HACE. No mira si el mapa dibuja —de eso va
// `mirar-los-atlas.mjs`— ni si producción quedó bien: eso se comprueba después.
//
// USO:  node herramientas/antes-de-publicar.mjs
// Se salta a propósito con:  PUBLICAR_IGUAL=1 npm run deploy --workspace web
// ============================================================================
import { spawnSync } from 'node:child_process';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RAIZ, 'web', 'dist');
const SITIO = join(RAIZ, 'web', 'public');
const FUENTE = join(RAIZ, 'web', 'src');

const git = (...args) => {
  const r = spawnSync('git', args, { cwd: RAIZ, encoding: 'utf8' });
  return { ok: r.status === 0, salida: (r.stdout ?? '').trim(), error: (r.stderr ?? '').trim() };
};

const no = (titulo, ...cuerpo) => {
  console.error(`\n🛑 NO SE PUBLICA — ${titulo}\n`);
  for (const l of cuerpo) console.error(`   ${l}`);
  console.error(`\n   Si aun así quieres publicar, dilo a propósito:`);
  console.error(`     PUBLICAR_IGUAL=1 npm run deploy --workspace web\n`);
  process.exit(1);
};

if (process.env.PUBLICAR_IGUAL === '1') {
  console.log('⚠️  portero del despliegue SALTADO a propósito (PUBLICAR_IGUAL=1).');
  process.exit(0);
}

// ── ① ¿está el disco atrasado respecto al remoto? ───────────────────────────
// Es LA comprobación: publicar con el disco atrasado borra de producción lo que
// el vigía ya había metido, y no hay ninguna otra señal que lo avise.
const esRepo = git('rev-parse', '--is-inside-work-tree').ok;
const tieneOrigen = esRepo && git('remote', 'get-url', 'origin').ok;

if (!esRepo || !tieneOrigen) {
  console.log('ℹ️  sin repositorio o sin remoto (esto pasa en CI): no hay nada con qué comparar.');
} else {
  const traido = git('fetch', '--quiet', 'origin', 'main');
  if (!traido.ok) {
    no(
      'no he podido preguntarle al remoto qué hay',
      'Sin saber qué hay en GitHub no se puede saber si esta copia está atrasada,',
      'y publicar atrasado es exactamente lo que devolvió el clima días atrás (35 · L-77).',
      '',
      `El error de git fue: ${traido.error.split('\n')[0] || '(sin detalle)'}`,
      'Revisa la conexión y vuelve a intentarlo.',
    );
  }

  const atras = git('rev-list', '--count', 'HEAD..origin/main');
  const adelante = git('rev-list', '--count', 'origin/main..HEAD');
  const nAtras = Number(atras.salida || 0);
  const nAdelante = Number(adelante.salida || 0);

  if (nAtras > 0) {
    // ¿Cuántos de esos commits tocan cosas que SE PUBLICAN? Eso convierte el
    // aviso abstracto en la cifra concreta de lo que se perdería.
    const conDato = git('rev-list', '--count', 'HEAD..origin/main', '--', 'web/public');
    const ficheros = git('diff', '--name-only', 'HEAD..origin/main', '--', 'web/public');
    const lista = ficheros.salida ? ficheros.salida.split('\n').filter(Boolean) : [];
    no(
      `esta copia va ${nAtras} commit(s) por detrás de GitHub`,
      `De esos, ${conDato.salida || 0} tocan ficheros que SE PUBLICAN (web/public).`,
      lista.length
        ? `Publicar ahora devolvería atrás ${lista.length} fichero(s) del sitio, entre ellos:`
        : 'Ninguno toca el sitio, pero el código publicado no sería el último.',
      ...lista.slice(0, 6).map((f) => `  · ${f}`),
      lista.length > 6 ? `  · …y ${lista.length - 6} más` : '',
      '',
      'Arréglalo así, en este orden:',
      '  git pull --ff-only          ← trae lo que el vigía fusionó',
      '  npm run build               ← vuelve a construir CON eso',
      '  npm run deploy --workspace web',
    );
  }

  console.log(
    `✅ al día con GitHub` +
      (nAdelante > 0 ? ` (esta copia va ${nAdelante} commit(s) por delante, sin empujar aún)` : ''),
  );
}

// ── ② ¿hay algo construido? ─────────────────────────────────────────────────
if (!existsSync(join(DIST, 'index.html'))) {
  no(
    'no hay nada construido',
    'No existe web/dist/index.html, así que no hay sitio que subir.',
    '',
    'Constrúyelo primero:  npm run build',
  );
}

// ── ③ ¿lo construido es posterior a lo último que cambió? ───────────────────
// El fallo de L-77 en su forma más común: traer datos nuevos y publicar sin
// volver a construir. El paquete sería el de antes de traerlos.
const masNuevo = (raiz) => {
  let tope = 0;
  const recorrer = (d) => {
    let entradas;
    try {
      entradas = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const p = join(d, e.name);
      if (e.isDirectory()) recorrer(p);
      else {
        try {
          const m = statSync(p).mtimeMs;
          if (m > tope) tope = m;
        } catch {
          /* un fichero que desaparece mientras miramos no es motivo de parar */
        }
      }
    }
  };
  recorrer(raiz);
  return tope;
};

const construido = statSync(join(DIST, 'index.html')).mtimeMs;
const ultimoCambio = Math.max(masNuevo(SITIO), masNuevo(FUENTE));
const horas = (ms) => (ms / 3_600_000).toFixed(1);

if (ultimoCambio > construido) {
  no(
    'lo construido es más viejo que el sitio',
    `web/dist se construyó hace ${horas(Date.now() - construido)} h,`,
    `pero algo de web/public o web/src cambió hace ${horas(Date.now() - ultimoCambio)} h.`,
    'Publicarías el paquete de ANTES de ese cambio: es justo el modo de fallar de 35 · L-77.',
    '',
    'Vuelve a construir:  npm run build',
  );
}

console.log(`✅ construido después del último cambio del sitio (hace ${horas(Date.now() - construido)} h)`);
console.log('🟢 portero del despliegue: adelante.\n');
