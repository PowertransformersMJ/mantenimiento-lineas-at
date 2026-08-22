// ============================================================================
// tests/banda-y-pestanas.test.js — lo primero que se ve tiene que ser verdad
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. Dos señales que se leen ANTES que cualquier tabla —la banda de
// estado y el color de las pestañas— no miraban el dato:
//
//   · **«Cálculo mecánico» siempre en verde.** El número de tramos excedidos
//     estaba FIJADO A CERO en el código (`const excedidos = 0`) y el tono
//     escrito a mano como «bien». Si la pestaña Mecánico mostraba tramos por
//     encima del umbral, el Resumen seguía verde. Era la única de las cuatro
//     fichas que no derivaba del dato, y mentía hacia el lado peligroso: quien
//     dirige el mantenimiento veía un punto verde y no entraba.
//   · **La pestaña «Falla» siempre en rojo**, tuviera expedientes o ninguno,
//     mientras dentro decía «esta línea no tiene ningún expediente». Una alarma
//     que suena siempre deja de ser una alarma.
//
// Son pruebas de CÓDIGO FUENTE, como `estilo-tokens.test.js`: lo que vigilan no
// es un valor, es que la señal SALGA del dato y no de una constante (`ADR-051`).
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const LINEA = readFileSync(join(RAIZ, 'web/src/componentes/Linea.tsx'), 'utf-8');

describe('la banda de estado deriva del dato, las CUATRO fichas', () => {
  test('el número de tramos excedidos no está escrito en el código', () => {
    assert.ok(!/const excedidos = 0/.test(LINEA),
      'vuelve a estar fijado a cero: la banda dirá que el cálculo mecánico está bien '
      + 'aunque haya tramos por encima del umbral');
  });

  test('lo cuenta el MISMO dueño que la pestaña Mecánico', () => {
    assert.match(LINEA, /calcularTramos\(apoyos, conductor, hipotesis\)\.filter\(\(f\) => f\.excede\)\.length/,
      'si el Resumen cuenta los excedidos por su cuenta, un día dirá otra cosa que Mecánico');
    assert.match(LINEA, /excedidos=\{excedidos\}/);
  });

  test('ninguna ficha de la banda lleva el tono escrito a mano', () => {
    // Las cuatro se leen igual y tienen que decidirse igual: por el dato.
    const i = LINEA.indexOf('const fichas = [');
    const bloque = LINEA.slice(i, LINEA.indexOf('\n  ];', i));
    const tonos = [...bloque.matchAll(/tono: (.+),/g)].map((m) => m[1].trim());
    assert.equal(tonos.length, 4, 'la banda ya no tiene cuatro fichas: revisar esta prueba');
    for (const t of tonos) {
      assert.ok(t.includes('?'), `una ficha de la banda fija su tono a «${t}» sin mirar nada`);
    }
  });

  test('«sin tramos» tampoco se pinta de verde', () => {
    // Un hueco enseñado como aprobado es el patrón que este proyecto ya tiene por
    // lección (`32 · L-44`), y estaba aquí: sin un solo tramo calculado, verde.
    assert.match(LINEA, /!filasMecanico \|\| excedidos \? 'atender' : 'bien'/);
  });
});

describe('el color de una pestaña sale de sus datos', () => {
  test('«Falla» ya no nace roja en la lista de pestañas', () => {
    const i = LINEA.indexOf("id: 'falla'");
    const fila = LINEA.slice(i, LINEA.indexOf('\n', i));
    assert.ok(!/roja:\s*true/.test(fila),
      'la pestaña Falla vuelve a pintarse roja sin mirar si hay expedientes');
  });

  test('el rojo lo decide el número de expedientes ABIERTOS', () => {
    assert.match(LINEA, /const eventosAbiertos = investigaciones\.filter\(\(i\) => !i\.cerrada\)\.length/);
    assert.match(LINEA, /p\.id === 'falla' && eventosAbiertos \? ' roja' : ''/);
  });

  test('ninguna otra pestaña se pinta por una constante', () => {
    const i = LINEA.indexOf('const PESTANAS = [');
    const bloque = LINEA.slice(i, LINEA.indexOf('\n];', i));
    assert.ok(!/roja:/.test(bloque),
      'una pestaña con el color escrito en la lista no puede apagarse cuando el dato cambia');
  });
});
