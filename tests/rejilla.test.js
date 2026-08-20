// ============================================================================
// tests/rejilla.test.js — una rejilla de VALORES sobre el mapa
// ----------------------------------------------------------------------------
// La capa de datos del mapa dejó de ser una imagen pintada y pasó a ser la
// medida. Eso permite elegir la capa temporal y preguntar «¿cuánto hay AQUÍ?», y
// trae tres formas de equivocarse que son las que se vigilan:
//
//   1. EL BYTE RESERVADO NO ES CERO. Donde no se midió no hay dato, y leerlo
//      como 0 pinta el extremo de la rampa justo en el hueco.
//   2. LA CUENTA DEL PUNTO VA EN WEB MERCATOR. Hacerla en grados desplaza el
//      punto cientos de metros a esta latitud: el clic diría el valor de la
//      celda de al lado, con una cifra creíble.
//   3. LA RAMPA ES LA DE LA FICHA. Si la pantalla se inventara la suya, dos
//      capas se pintarían con escalas distintas y compararlas engañaría.
//
// Mundo sintético: rejilla de juguete sobre el ecuador y Greenwich (L-23).
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  valorDeByte, colorDeValor, pintarRejilla, celdaDe, valorEnPunto, esquinas,
} from '../web/src/vistas/rejilla.ts';

const COD = { offset: -10, paso: 0.3, sin_dato: 0 };

/** Una ficha de juguete: 4×2 celdas sobre el ecuador, con la rampa mínima. */
const FICHA = {
  bbox: [0, 0, 0.4, 0.2],
  ancho: 4,
  alto: 2,
  resolucion_m: 30,
  codificacion: COD,
  rampa: [{ c: 20, rgb: [0, 0, 255] }, { c: 40, rgb: [255, 0, 0] }],
};

// ════════════════════════════════════════════════════════════════════════════
describe('del byte a los grados', () => {

  test('el byte reservado es SIN DATO, no cero grados', () => {
    assert.equal(valorDeByte(0, COD), null);
    // El error que esto impide: 0 °C pintado de azul intenso donde había nube.
    assert.notEqual(valorDeByte(0, COD), 0);
  });

  test('el primer byte útil vale exactamente el desplazamiento declarado', () => {
    assert.equal(valorDeByte(1, COD), -10);
  });

  test('cada paso sube lo que dice la ficha', () => {
    assert.ok(Math.abs(valorDeByte(101, COD) - 20) < 1e-9);   // -10 + 100×0,3
    assert.ok(Math.abs(valorDeByte(201, COD) - 50) < 1e-9);
  });

  test('la codificación se lee de la ficha, no se supone', () => {
    const otra = { offset: 0, paso: 1, sin_dato: 0 };
    assert.equal(valorDeByte(31, otra), 30);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el color: la rampa de la ficha y ninguna otra', () => {

  test('por debajo y por encima se pega a los extremos, no se extrapola', () => {
    assert.deepEqual(colorDeValor(-40, FICHA.rampa), [0, 0, 255]);
    assert.deepEqual(colorDeValor(99, FICHA.rampa), [255, 0, 0]);
  });

  test('en medio interpola', () => {
    assert.deepEqual(colorDeValor(30, FICHA.rampa), [128, 0, 128]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('pintar la rejilla', () => {

  test('lo que no se midió queda TRANSPARENTE, no negro', () => {
    const rgba = pintarRejilla(new Uint8Array([0, 101]), FICHA);
    assert.equal(rgba[3], 0, 'el sin dato tiene que ser transparente');
    assert.equal(rgba[7], 255, 'lo medido va opaco');
  });

  test('un valor medido sale con el color de SU temperatura', () => {
    // byte 101 → 20 °C → el extremo frío de la rampa.
    const rgba = pintarRejilla(new Uint8Array([101]), FICHA);
    assert.deepEqual([...rgba.slice(0, 4)], [0, 0, 255, 255]);
  });

  test('la rejilla entera se pinta: cuatro bytes por celda', () => {
    const rgba = pintarRejilla(new Uint8Array(8), FICHA);
    assert.equal(rgba.length, 32);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('qué temperatura hay en este punto', () => {

  /** Rejilla 4×2: la fila de arriba a 20 °C y la de abajo a 50 °C. */
  const BYTES = new Uint8Array([101, 101, 101, 101, 201, 201, 201, 201]);

  test('las esquinas caen en la primera y en la última celda', () => {
    assert.deepEqual(celdaDe(0.001, 0.199, FICHA), { ix: 0, iy: 0 });     // noroeste
    assert.deepEqual(celdaDe(0.399, 0.001, FICHA), { ix: 3, iy: 1 });     // sureste
  });

  test('fuera del recorte no se inventa una lectura', () => {
    assert.equal(celdaDe(1, 1, FICHA), null);
    assert.equal(valorEnPunto(BYTES, FICHA, -5, 0.1), null);
  });

  test('la lectura devuelve los grados de ESA celda', () => {
    assert.ok(Math.abs(valorEnPunto(BYTES, FICHA, 0.05, 0.19) - 20) < 1e-9, 'arriba, 20 °C');
    assert.ok(Math.abs(valorEnPunto(BYTES, FICHA, 0.05, 0.01) - 50) < 1e-9, 'abajo, 50 °C');
  });

  test('bajo nube la respuesta es «no se midió», no un número', () => {
    const conHueco = new Uint8Array([0, 101, 101, 101, 201, 201, 201, 201]);
    assert.equal(valorEnPunto(conHueco, FICHA, 0.01, 0.19), null);
  });

  test('⚠️ la cuenta va en MERCATOR: el punto medio en latitud NO cae en la mitad', () => {
    // Es la prueba que impide «arreglarlo» con una regla de tres en grados. En
    // mercator la mitad de la altura está por DEBAJO del punto medio en latitud,
    // así que el centro geográfico cae en la fila de arriba de esta rejilla de
    // dos filas. Con la cuenta en grados caería justo en el borde.
    const grande = { ...FICHA, bbox: [0, 0, 0.4, 60], ancho: 4, alto: 2 };
    // La latitud media geométrica de 0 a 60° es 30°; en mercator, la mitad de la
    // altura corresponde a ~33,7°, así que 30° queda en la fila de ABAJO.
    assert.deepEqual(celdaDe(0.2, 30, grande), { ix: 2, iy: 1 });
    assert.deepEqual(celdaDe(0.2, 40, grande), { ix: 2, iy: 0 });
  });

  test('las esquinas para el mapa salen en el orden que pide MapLibre', () => {
    // Noroeste, noreste, sureste, suroeste. Cambiar el orden voltea la imagen y
    // el mapa saldría con el norte abajo sin que nada avise.
    assert.deepEqual(esquinas(FICHA), [[0, 0.2], [0.4, 0.2], [0.4, 0], [0, 0]]);
  });
});
