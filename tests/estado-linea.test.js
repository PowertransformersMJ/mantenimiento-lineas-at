// ============================================================================
// tests/estado-linea.test.js — el cielo de la línea no puede mentir
// ----------------------------------------------------------------------------
// La crítica de oficio de las cuatro maquetas de carcasa encontró el MISMO
// fallo en las cuatro: ninguna impedía que una línea se mostrara «sana» con
// cero apoyos dictaminados, y dos lo afirmaban activamente. En una, la palabra
// «firmable» era una cadena escrita a mano en los datos; en otra, `firmable`
// salía de la hipótesis y del estado sin mirar JAMÁS la capacidad de los
// apoyos.
//
// Estas pruebas existen para que ese fallo no pueda volver por la puerta de
// atrás. La más importante no comprueba un número: comprueba una NEGATIVA —
// que `amanecer`, el único estado que dice «al día», sea inalcanzable mientras
// quede un solo apoyo sin veredicto. Si alguien relaja esa condición, aquí se
// pone rojo.
//
// Los valores esperados no salen de ejecutar el módulo y copiar lo que dio: son
// propiedades que el resultado tiene que cumplir sí o sí.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { estadoDeLinea } from '../web/src/vistas/estadoLinea.ts';

/** Construye una entrada donde `n` apoyos están dictaminados en AMBOS ejes. */
const linea = ({ total = 24, dictaminados = 0, aRevisar = 0, eventos = [], congelada = true } = {}) => {
  const apoyos = Array.from({ length: total }, (_, i) => `E${String(i + 1).padStart(2, '0')}`);
  const fila = (a, i) => ({ apoyo: a, utilizacion_pct: i < dictaminados ? 42 : null });
  return {
    transversal: { filas: apoyos.map(fila), total, aRevisar },
    longitudinal: { filas: apoyos.map(fila), total, aRevisar: 0 },
    investigaciones: eventos,
    hipotesis: { congelada },
  };
};

describe('el cielo de la línea sale del dato, nunca de un texto', () => {
  test('LA NEGATIVA QUE MANDA: no amanece mientras falte UN solo apoyo', () => {
    // 23 de 24 dictaminados, nada que revisar, hipótesis congelada: todo lo
    // demás está perfecto y AUN ASÍ no puede decir «al día».
    const e = estadoDeLinea(linea({ total: 24, dictaminados: 23 }));
    assert.notEqual(e.cielo, 'amanecer', 'amaneció con un apoyo sin veredicto');
    assert.equal(e.cielo, 'atardecer');
    assert.equal(e.dictaminados, 23);
    assert.match(e.porQue, /1 de 24 apoyo sigue sin veredicto/);
  });

  test('amanece SOLO con la cobertura completa en los dos ejes', () => {
    const e = estadoDeLinea(linea({ total: 24, dictaminados: 24 }));
    assert.equal(e.cielo, 'amanecer');
    assert.equal(e.dictaminados, e.total);
  });

  test('LN-627 hoy: 0 de 24, y el cielo lo dice — niebla, no «sano»', () => {
    const e = estadoDeLinea(linea({ total: 24, dictaminados: 0 }));
    assert.equal(e.cielo, 'niebla');
    assert.equal(e.dictaminados, 0);
    assert.match(e.porQue, /Ninguno de los 24/);
  });

  test('la cobertura se CRUZA por apoyo: dos conteos iguales no son cobertura', () => {
    // Cinco apoyos con veredicto transversal y CINCO DISTINTOS con veredicto
    // longitudinal. Comparar conteos daría 5 dictaminados; la verdad es 0.
    const ap = Array.from({ length: 10 }, (_, i) => `E${i + 1}`);
    const e = estadoDeLinea({
      transversal: { filas: ap.map((a, i) => ({ apoyo: a, utilizacion_pct: i < 5 ? 30 : null })), total: 10, aRevisar: 0 },
      longitudinal: { filas: ap.map((a, i) => ({ apoyo: a, utilizacion_pct: i >= 5 ? 30 : null })), total: 10, aRevisar: 0 },
      investigaciones: [], hipotesis: { congelada: true },
    });
    assert.equal(e.porEje.transversal.con, 5);
    assert.equal(e.porEje.longitudinal.con, 5);
    assert.equal(e.dictaminados, 0, 'se tomó el menor de dos conteos en vez de la intersección');
    assert.equal(e.cielo, 'niebla');
  });

  test('un expediente CERRADO no cuenta como abierto', () => {
    const cerrados = estadoDeLinea(linea({ dictaminados: 24, eventos: [{ cerrada: true }, { cerrada: true }] }));
    assert.equal(cerrados.eventosAbiertos, 0);
    assert.equal(cerrados.cielo, 'amanecer', 'un expediente cerrado disparó tormenta');

    const uno = estadoDeLinea(linea({ dictaminados: 24, eventos: [{ cerrada: true }, { cerrada: false }] }));
    assert.equal(uno.eventosAbiertos, 1);
    assert.equal(uno.cielo, 'tormenta');
  });

  test('la tormenta manda sobre todo lo demás', () => {
    // Línea impecable salvo por un expediente abierto: el cielo es tormenta.
    const e = estadoDeLinea(linea({ dictaminados: 24, eventos: [{ cerrada: false }] }));
    assert.equal(e.cielo, 'tormenta');
    assert.match(e.porQue, /1 expediente sin cerrar/);
  });

  test('una hipótesis sin congelar impide el amanecer aunque todo esté dictaminado', () => {
    const e = estadoDeLinea(linea({ dictaminados: 24, congelada: false }));
    assert.equal(e.cielo, 'atardecer');
    assert.match(e.porQue, /hipótesis de cálculo no está congelada/);
  });

  test('un apoyo que pide revisión impide el amanecer', () => {
    const e = estadoDeLinea(linea({ dictaminados: 24, aRevisar: 3 }));
    assert.equal(e.cielo, 'atardecer');
    assert.match(e.porQue, /3 piden revisión/);
  });

  test('el total honesto es el mayor censo: un eje que no produjo fila no reduce el total', () => {
    const e = estadoDeLinea({
      transversal: { filas: [{ apoyo: 'E1', utilizacion_pct: 10 }], total: 24, aRevisar: 0 },
      longitudinal: { filas: [{ apoyo: 'E1', utilizacion_pct: 10 }], total: 2, aRevisar: 0 },
      investigaciones: [], hipotesis: { congelada: true },
    });
    assert.equal(e.total, 24);
    assert.equal(e.dictaminados, 1);
    assert.equal(e.cielo, 'atardecer');
  });
});
