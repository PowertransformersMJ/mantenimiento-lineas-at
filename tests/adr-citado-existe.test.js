// ============================================================================
// tests/adr-citado-existe.test.js — un ADR citado en el código TIENE que existir
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE (`99 §ADR-141`). El 2026-09-23 el código acabó citando
// «§ADR-139» en TRECE sitios —cuatro componentes, una hoja de estilo, una vista
// y una prueba— y ese ADR **no estaba escrito**. Nadie se enteró en dos días.
//
// Antes había pasado lo contrario y peor: se citó «§ADR-138» creyéndolo libre y
// ese número ya lo había ocupado OTRA SESIÓN trabajando en paralelo, día y medio
// antes. Trece comentarios mandando a leer una decisión que hablaba de otra cosa.
//
// ⚠️ LO QUE ESTO VIGILA, Y LO QUE NO. Vigila que el número EXISTA. No puede
// vigilar que hable de lo que el comentario dice —eso no lo sabe una máquina—,
// pero cierra el fallo barato: el puntero roto. Un comentario que manda a un ADR
// inexistente es peor que no tener comentario, porque hace perder el tiempo
// buscando algo que no está.
//
// `brain:check` NO cubre esto: sus gates miran DENTRO de `docs/` (duplicados,
// huecos, indexación) y nunca cruzan el código contra el historial.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const HISTORIAL = readFileSync(join(RAIZ, 'docs/99-HISTORIAL-ADR.md'), 'utf-8');

/** Los ADR que de verdad existen: los que abren sección con `## ADR-NNN`. */
const EXISTEN = new Set([...HISTORIAL.matchAll(/^## (ADR-\d+)\b/gm)].map((m) => m[1]));

/** Dónde se busca. `docs/` queda fuera: sus referencias las cruza `brain:check`. */
const CARPETAS = ['web/src', 'nucleo', 'contratos', 'exportar', 'importar', 'herramientas', 'tests'];
const EXTENSIONES = /\.(ts|tsx|js|mjs|css)$/;

function* archivos(dir) {
  let entradas;
  try { entradas = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entradas) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* archivos(p);
    else if (EXTENSIONES.test(e.name) && statSync(p).size < 2_000_000) yield p;
  }
}

describe('un ADR citado en el código tiene que existir en el historial', () => {

  test('ninguna cita del código apunta a un ADR que no está escrito', () => {
    const rotas = [];
    for (const carpeta of CARPETAS) {
      for (const ruta of archivos(join(RAIZ, carpeta))) {
        const texto = readFileSync(ruta, 'utf-8');
        // Este mismo archivo se cita a sí mismo en su cabecera: no se audita solo.
        if (ruta.endsWith('adr-citado-existe.test.js')) continue;
        for (const m of texto.matchAll(/\bADR-(\d+)\b/g)) {
          const id = `ADR-${m[1]}`;
          if (EXISTEN.has(id)) continue;
          const linea = texto.slice(0, m.index).split('\n').length;
          rotas.push(`${relative(RAIZ, ruta)}:${linea} → «${id}»`);
        }
      }
    }
    assert.deepEqual(rotas, [],
      'hay comentarios que mandan a leer un ADR que no existe. O se escribe ese ADR, '
      + 'o se corrige el número: un puntero roto hace perder más tiempo que no tener comentario.\n'
      + rotas.join('\n'));
  });

  test('el historial no tiene dos ADR con el mismo número', () => {
    const todos = [...HISTORIAL.matchAll(/^## (ADR-\d+)\b/gm)].map((m) => m[1]);
    const repes = todos.filter((x, i) => todos.indexOf(x) !== i);
    assert.deepEqual(repes, [],
      'dos decisiones con el mismo número: citarlo se vuelve ambiguo. '
      + 'Pasa cuando dos sesiones trabajan en paralelo y las dos cogen el siguiente libre.');
  });
});
