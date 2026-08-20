// ============================================================================
// tests/radiacion.test.js — el recurso solar del corredor
// ----------------------------------------------------------------------------
// ESTA CAPA NO ES DECORACIÓN Y POR ESO SE VIGILA DISTINTO. La radiación solar es
// una ENTRADA del cálculo térmico de esta misma aplicación: la ampacidad
// (IEEE 738) se calcula con 1.000 W/m² ADOPTADOS. Poner una cifra de sol al lado
// de una línea invita a una conversión que NO se puede hacer —lo mapeado es
// energía diaria (kWh/m² al día) y lo que come la norma es una irradiancia
// instantánea (W/m² al mediodía)— así que la frase que lo impide se prueba como
// se prueba una defensa, no como se prueba un texto.
//
// Lo demás que se vigila: que el orden de las capas ponga la media del año al
// final y no en medio de los meses, que la oscilación entre el mes más soleado y
// el más flojo se publique —una media anual sola se la lleva por delante— y que
// el muestreo grueso se DECLARE.
//
// Datos sintéticos.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  capasOrdenadas, capaElegida, oscilacionAnual, avisoDeMuestreo, NOTA_AMPACIDAD,
} from '../web/src/vistas/radiacion.ts';

const capa = (clave, rotulo, p50) => ({
  clave, rotulo, archivo: `x-${clave}.png`, cobertura_pct: 100,
  resumen: { min: p50 - 0.3, p50, max: p50 + 0.3 },
});

const FICHA = {
  bbox: [0, 0, 0.4, 0.2], ancho: 4, alto: 2, resolucion_m: 2000, resolucion_nativa_m: 1000,
  codificacion: { offset: 0, paso: 0.03, sin_dato: 0 },
  rampa: [{ c: 3, rgb: [0, 0, 255] }, { c: 7, rgb: [255, 0, 0] }],
  unidad: 'kWh/m² al día',
  capas: [
    capa('anual', 'Media del año', 5.4),
    capa('03', 'Marzo', 6.2),
    capa('01', 'Enero', 5.8),
    capa('11', 'Noviembre', 4.6),
  ],
};

// ════════════════════════════════════════════════════════════════════════════
describe('el orden de las capas', () => {

  test('los meses van en orden y la media del año al FINAL', () => {
    // Si «anual» se colara entre los meses, el selector diría que después de
    // febrero viene la media del año — y quien elija a ojo se lleva otra cosa.
    assert.deepEqual(capasOrdenadas(FICHA).map((c) => c.clave), ['01', '03', '11', 'anual']);
  });

  test('sin elección se enseña la media del año, no el primer mes que caiga', () => {
    assert.equal(capaElegida(FICHA, null).clave, 'anual');
    assert.equal(capaElegida(FICHA, 'no-existe').clave, 'anual');
  });

  test('la capa pedida manda', () => {
    assert.equal(capaElegida(FICHA, '11').rotulo, 'Noviembre');
  });

  test('una ficha sin capas no revienta: devuelve nada', () => {
    assert.equal(capaElegida({ ...FICHA, capas: [] }, '01'), null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('la oscilación del año: lo que una media anual esconde', () => {

  test('nombra el mes más soleado, el más flojo y cuánto los separa', () => {
    const o = oscilacionAnual(FICHA);
    assert.equal(o.alto.rotulo, 'Marzo');
    assert.equal(o.bajo.rotulo, 'Noviembre');
    // (6,2 − 4,6) / 4,6 = 34,8 %
    assert.ok(Math.abs(o.pct - 34.7826) < 0.01, `esperaba ~34,8 %, dio ${o.pct}`);
  });

  test('la media del AÑO no entra en la comparación de meses', () => {
    // Con «anual» dentro, el mes «más flojo» podría salir siendo la media, que no
    // es un mes: la cifra dejaría de significar lo que dice.
    const o = oscilacionAnual({ ...FICHA, capas: [capa('anual', 'Media del año', 0.1), ...FICHA.capas.slice(1)] });
    assert.equal(o.bajo.rotulo, 'Noviembre');
  });

  test('con un solo mes no se inventa una oscilación', () => {
    assert.equal(oscilacionAnual({ ...FICHA, capas: [capa('01', 'Enero', 5)] }), null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('las dos frases que impiden el mal uso', () => {

  test('la nota de ampacidad nombra la magnitud que SÍ entra en el cálculo', () => {
    assert.match(NOTA_AMPACIDAD, /1\.000 W\/m²/,
      'sin nombrar el valor adoptado, la advertencia es un descargo genérico');
    assert.match(NOTA_AMPACIDAD, /INSTANT/i);
    assert.match(NOTA_AMPACIDAD, /ENERGÍA DIARIA/);
    assert.match(NOTA_AMPACIDAD, /regla de tres/,
      'hay que decir que NO se convierte, no solo que son distintas');
  });

  test('el muestreo grueso se declara cuando lo es', () => {
    const a = avisoDeMuestreo(FICHA);
    assert.match(a, /2\.0 km/);
    assert.match(a, /una muestra, no el original/);
  });

  test('si se muestrea al nativo o más fino, no se molesta con el aviso', () => {
    assert.equal(avisoDeMuestreo({ ...FICHA, resolucion_m: 1000 }), null);
    assert.equal(avisoDeMuestreo({ ...FICHA, resolucion_nativa_m: undefined }), null);
  });
});
