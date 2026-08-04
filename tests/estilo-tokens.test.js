// ============================================================================
// tests/estilo-tokens.test.js — la guardia del tablero de color
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. Al tokenizar la hoja de estilos (fase 1 de «El Horizonte»)
// los ~113 colores que estaban escritos a mano dentro de las reglas pasaron a
// variables. A partir de ahí aparece un modo de fallo nuevo y silencioso:
//
//   una regla pide `var(--pill)` y nadie declaró `--pill`.
//
// El navegador NO avisa. No hay error en consola. La propiedad simplemente se
// descarta y el elemento hereda lo que haya — el mismo síntoma que ya tiene
// hoy `.kpi-v.gris`, que no existe y hace que un KPI sin dato se pinte del
// ámbar de acento, o sea: un hueco disfrazado de cifra buena.
//
// Es exactamente el patrón que este proyecto tiene documentado: «verde no
// prueba nada» — 667 pruebas pasaban con el veredicto inalcanzable desde la
// aplicación. Esta prueba es la señal que faltaba.
//
// NO comprueba estética. Comprueba una sola cosa, y es verificable: que toda
// variable que la hoja USA esté DECLARADA.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const RUTA = join(aqui, '..', 'web', 'src', 'estilo.css');
const css = readFileSync(RUTA, 'utf8');

/** Todas las variables DECLARADAS, vengan del :root base o del de impresión. */
function declaradas(texto) {
  const out = new Set();
  for (const m of texto.matchAll(/(--[\w-]+)\s*:/g)) out.add(m[1]);
  return out;
}

/** Todas las variables USADAS por una regla. */
function usadas(texto) {
  const out = new Map();
  const lineas = texto.split('\n');
  lineas.forEach((l, i) => {
    for (const m of l.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
      if (!out.has(m[1])) out.set(m[1], i + 1);
    }
  });
  return out;
}

describe('estilo.css — el tablero de color no tiene agujeros', () => {
  test('toda variable USADA está DECLARADA', () => {
    const dec = declaradas(css);
    const huerfanas = [...usadas(css)].filter(([v]) => !dec.has(v));
    assert.deepEqual(
      huerfanas, [],
      'variables usadas y nunca declaradas (el navegador las descarta EN SILENCIO): ' +
      huerfanas.map(([v, l]) => `${v} (línea ${l})`).join(', '),
    );
  });

  test('el :root base declara la paleta completa, no solo parte', () => {
    const base = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')));
    const dec = declaradas(base);
    // Los cuatro que gobiernan el 78 % de la hoja. Si alguno falta, la app
    // no se queda a medias: se queda sin identidad.
    for (const v of ['--bg', '--pnl', '--tx', '--mut', '--acc', '--bd']) {
      assert.ok(dec.has(v), `el :root base no declara ${v}`);
    }
  });

  test('ningún degradado mezcla literal y variable', () => {
    // Regla dura establecida en la fase 1. Un degradado con una parada
    // tokenizada y otra escrita a mano es la trampa que deja media pantalla
    // oscura al repintar: la mitad obedece al tablero y la otra no.
    const fallos = [];
    css.split('\n').forEach((l, i) => {
      if (!/gradient\(/.test(l)) return;
      const grad = l.slice(l.indexOf('gradient('));
      const tieneVar = /var\(--/.test(grad);
      const tieneLiteral = /#[0-9a-fA-F]{3,8}\b/.test(grad);
      if (tieneVar && tieneLiteral) fallos.push(`línea ${i + 1}: ${l.trim().slice(0, 90)}`);
    });
    assert.deepEqual(fallos, [], 'degradados que mezclan literal y variable:\n' + fallos.join('\n'));
  });

  test('fuera del :root y de @media print no quedan colores a mano', () => {
    // El cuerpo de la hoja debe pedir SIEMPRE al tablero. Las excepciones
    // legítimas son las declaraciones (:root) y el delta de impresión.
    const lineas = css.split('\n');
    const protegidas = new Set();
    for (let i = 0; i < lineas.length; i++) {
      if (!/^\s*:root|@media\s+print/.test(lineas[i])) continue;
      let prof = 0;
      for (let j = i; j < lineas.length; j++) {
        protegidas.add(j);
        prof += (lineas[j].match(/{/g) || []).length - (lineas[j].match(/}/g) || []).length;
        if (prof === 0 && j > i) { i = j; break; }
      }
    }
    // Los comentarios SÍ pueden nombrar colores — la cabecera documenta la
    // paleta a propósito. Hay que seguir los bloques /* */ a través de varias
    // líneas, no solo dentro de una.
    const fugas = [];
    let enComentario = false;
    lineas.forEach((l, i) => {
      let codigo = '', j = 0;
      while (j < l.length) {
        if (!enComentario && l.startsWith('/*', j)) { enComentario = true; j += 2; continue; }
        if (enComentario && l.startsWith('*/', j)) { enComentario = false; j += 2; continue; }
        if (!enComentario) codigo += l[j];
        j++;
      }
      if (protegidas.has(i)) return;
      for (const m of codigo.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)) {
        fugas.push(`línea ${i + 1}: ${m[0]}`);
      }
    });
    assert.deepEqual(fugas, [], 'colores escritos a mano fuera del tablero:\n' + fugas.join('\n'));
  });
});
