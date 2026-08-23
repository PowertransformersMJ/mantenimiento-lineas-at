// ============================================================================
// tests/horizonte-cobertura.test.js — el cruce de los dos ejes, apoyo por apoyo
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. `Horizonte.tsx` pintaba una torre hueca si le faltaba el
// veredicto en CUALQUIERA de los dos ejes, y NINGUNA prueba lo vigilaba: se
// podía romper en silencio. Hoy en LN-627 da igual —van 0 de 24 en ambos—, pero
// el dato transversal y el longitudinal llegan por caminos distintos, y el día
// que uno avance el dibujo diría «sin veredicto» de un apoyo que sí lo tiene en
// un eje.
//
// Las dos pruebas que mandan son las dos formas de mentir, una en cada
// dirección:
//   · volver al «y» pierde CUÁL de los dos ejes falta (miente a la baja);
//   · cambiar el «y» por un «o» daría por dictaminado lo que no lo está
//     (miente al alza, que es certificar sobre un hueco: mucho peor).
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  cobertura, coberturaPorApoyo, lecturaDeCobertura,
  resumenAccesible, tituloDeApoyo, tituloDeCarril,
} from '../web/src/vistas/coberturaEjes.ts';
import { estadoDeLinea } from '../web/src/vistas/estadoLinea.ts';

/** Filas de un eje: `con` son los apoyos que traen veredicto. */
const eje = (apoyos, con) =>
  apoyos.map((a) => ({ apoyo: a, utilizacion_pct: con.includes(a) ? 42 : null }));

const AP = ['E1', 'E2', 'E3', 'E4'];

describe('la cobertura distingue A CUÁL de los dos ejes le falta el dato', () => {
  test('EL CASO DE TODO-53: con veredicto solo transversal NO es «sin veredicto»', () => {
    const f = coberturaPorApoyo(eje(AP, ['E1']), eje(AP, []));
    const e1 = f.find((x) => x.apoyo === 'E1');

    assert.equal(e1.estado, 'solo_transversal');
    assert.equal(e1.dosEjes, false, 'un solo eje NO rellena la torre: no existe medio dictamen');
    assert.equal(e1.transversal, true);
    assert.equal(e1.longitudinal, false);

    // Lo que se rompe si alguien vuelve al «y» a secas: el rótulo diría que no
    // hay veredicto de un apoyo que sí lo tiene en un eje.
    const t = tituloDeApoyo(e1);
    assert.doesNotMatch(t, /SIN VEREDICTO/, 'el rótulo niega un veredicto que existe');
    assert.match(t, /veredicto TRANSVERSAL/);
    assert.match(t, /longitudinal: todavía sin veredicto/);
  });

  test('y al revés: solo longitudinal tampoco es «sin veredicto»', () => {
    const f = coberturaPorApoyo(eje(AP, []), eje(AP, ['E2']));
    const e2 = f.find((x) => x.apoyo === 'E2');
    assert.equal(e2.estado, 'solo_longitudinal');
    assert.equal(e2.dosEjes, false);
    assert.match(tituloDeApoyo(e2), /veredicto LONGITUDINAL/);
  });

  test('EL ARREGLO PELIGROSO: dos conjuntos DISTINTOS no son cobertura', () => {
    // E1 y E2 con veredicto transversal; E3 y E4 con longitudinal. Cambiar el
    // «y» por un «o» daría 4 dictaminados. La verdad es 0.
    const c = cobertura(eje(AP, ['E1', 'E2']), eje(AP, ['E3', 'E4']));
    assert.equal(c.ambos, 0, 'se dio por dictaminado un apoyo al que le falta un eje');
    assert.equal(c.filas.filter((f) => f.dosEjes).length, 0);
    assert.equal(c.soloTransversal, 2);
    assert.equal(c.soloLongitudinal, 2);
    assert.equal(c.conTransversal, 2);
    assert.equal(c.conLongitudinal, 2);
  });

  test('los cuatro estados se cuentan por separado y suman el total', () => {
    const c = cobertura(eje(AP, ['E1', 'E2']), eje(AP, ['E1', 'E3']));
    assert.equal(c.ambos, 1);            // E1
    assert.equal(c.soloTransversal, 1);  // E2
    assert.equal(c.soloLongitudinal, 1); // E3
    assert.equal(c.ninguno, 1);          // E4
    assert.equal(c.ambos + c.soloTransversal + c.soloLongitudinal + c.ninguno, c.dibujados);
  });

  test('el eje longitudinal no calculable NO se cuenta como «cero con veredicto»', () => {
    const c = cobertura(eje(AP, ['E1']), null);
    assert.equal(c.longitudinalCalculable, false);
    assert.match(lecturaDeCobertura(c, { totalLinea: 4 }), /no es calculable/);
  });
});

describe('los textos dicen lo que el dato dice, y ni una palabra más', () => {
  test('el caso de HOY: nada en ningún eje', () => {
    const c = cobertura(eje(AP, []), eje(AP, []));
    const t = lecturaDeCobertura(c, { totalLinea: 4 });
    assert.match(t, /Ninguno de los 4 apoyos tiene veredicto/);
    assert.match(t, /estado del inventario/, 'no dice de quién es el hueco');
    assert.doesNotMatch(t, /a medio/, 'insinúa un dictamen parcial');
  });

  test('un eje avanzó y el otro no: se dice cuál, y que no son la misma pregunta', () => {
    const c = cobertura(eje(AP, AP), eje(AP, []));
    const t = lecturaDeCobertura(c, { totalLinea: 4 });
    assert.match(t, /4 de los 4 apoyos ya tienen veredicto transversal/);
    assert.match(t, /longitudinal, ninguno/);
    assert.match(t, /dos preguntas distintas/);
  });

  test('mezcla: se desglosa sin sugerir que un eje valga medio dictamen', () => {
    const c = cobertura(eje(AP, ['E1', 'E2']), eje(AP, ['E1', 'E3']));
    const t = lecturaDeCobertura(c, { totalLinea: 4 });
    assert.match(t, /1 de los 4 apoyos tienen veredicto en los dos ejes/);
    assert.match(t, /1 solo transversal/);
    assert.match(t, /1 solo longitudinal/);
    assert.match(t, /no está a medio dictaminar/);
  });

  test('completo', () => {
    const c = cobertura(eje(AP, AP), eje(AP, AP));
    assert.match(lecturaDeCobertura(c, { totalLinea: 4 }), /Los 4 apoyos tienen veredicto en los dos ejes/);
  });

  test('si se dibujan menos apoyos que los que tiene la línea, se DECLARA', () => {
    const c = cobertura(eje(['E1', 'E2'], []), eje(['E1', 'E2'], []));
    assert.match(lecturaDeCobertura(c, { totalLinea: 24 }), /Se dibujan 2 de los 24 apoyos/);
    // Y no se declara cuando no hay nada que declarar.
    assert.doesNotMatch(lecturaDeCobertura(c, { totalLinea: 2 }), /Se dibujan/);
  });

  test('el resumen accesible dice «ninguno», no «0»: un cero se lee como medida', () => {
    const c = cobertura(eje(AP, ['E1']), eje(AP, ['E2']));
    const r = resumenAccesible(c, { vanosFuera: 14, totalLinea: 4 });
    assert.match(r, /ninguno con veredicto en los dos ejes/);
    assert.match(r, /14 vanos fuera/);
  });

  test('el rótulo del carril dice si SE SABE, nunca si cumple', () => {
    assert.match(tituloDeCarril('E6', 'transversal', true), /transversal \(de lado\): con veredicto/);
    assert.match(tituloDeCarril('E6', 'longitudinal', false), /todavía sin veredicto/);
    assert.doesNotMatch(tituloDeCarril('E6', 'transversal', true), /cumple/);
  });
});

describe('amarre: un solo dueño del cruce en todo el producto', () => {
  test('el cielo y el horizonte cuentan lo MISMO, apoyo por apoyo', () => {
    // Si alguien reimplementa el cruce en cualquiera de los dos sitios, estos
    // dos números dejan de coincidir y esta prueba se pone roja.
    const t = eje(AP, ['E1', 'E2']);
    const l = eje(AP, ['E2', 'E3']);

    const cielo = estadoDeLinea({
      transversal: { filas: t, total: 4, aRevisar: 0 },
      longitudinal: { filas: l, total: 4, aRevisar: 0 },
      investigaciones: [], hipotesis: { congelada: true },
    });

    assert.equal(cielo.dictaminados, cobertura(t, l).ambos);
    assert.equal(cielo.dictaminados, 1, 'solo E2 tiene los dos ejes');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('dónde se pinta el horizonte, y dónde NO', () => {

  const LINEA = readFileSync(
    fileURLToPath(new URL('../web/src/componentes/Linea.tsx', import.meta.url)), 'utf-8');

  test('en «Detalle GPS» no se pinta — orden del Ingeniero (§ADR-063)', () => {
    // Esa pestaña es el recorrido a pantalla entera: el horizonte le robaba el
    // primer golpe de vista dibujando los mismos apoyos por segunda vez y con
    // otro criterio (por orden de vano, no geográfico).
    const i = LINEA.indexOf('<Horizonte');
    assert.ok(i > 0, 'el horizonte desapareció de la pantalla por completo');
    const antes = LINEA.slice(Math.max(0, i - 260), i);
    assert.match(antes, /activa !== 'gps'/,
      'el horizonte volvió a pintarse en Detalle GPS');
  });

  test('pero SIGUE en el resto de pestañas: se retiró de una, no del sistema', () => {
    // El borrado fue el mínimo señalado: una pestaña. Quitarlo de todas habría
    // sido retirar el contenedor y no el elemento.
    assert.ok(!LINEA.includes("activa === 'resumen' && <Horizonte"),
      'el horizonte quedó atado a una sola pestaña en vez de a todas menos gps');
    assert.match(LINEA, /activa !== 'gps' && \(\s*<Horizonte/,
      'la condición dejó de ser «todas menos gps»');
  });
});
