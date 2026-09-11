// ============================================================================
// tests/horas-contra-ampacidad.test.js — horas ≥ 80 · 90 · 100 % contra la AMPACIDAD
// ----------------------------------------------------------------------------
// QUÉ VIGILA. `horasContraAmpacidad` es la PROPUESTA aprobada en la maqueta del
// histórico guardado (`99 §ADR-129`): con SCADA no llega el porcentaje del
// archivo, así que las «horas sobre 100 %» de `comportamientoEnElTiempo` salen
// siempre 0 de 0. Aquí se cuenta la corriente de cada hora contra la ampacidad.
//
// ⚠️ Lo que estas pruebas hacen cumplir es lo de siempre: un hueco NO es un
// cero, y sin ampacidad no se cuenta — no se supone una.
//
// ⚠️ Repo PÚBLICO: ninguna cifra de estas pruebas es de una línea real. Son
// números redondos inventados para que el umbral se lea a simple vista.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { horasContraAmpacidad, comportamientoEnElTiempo } from '../nucleo/electrica.js';

const h = (corriente_A) => ({ corriente_A });

describe('horasContraAmpacidad — los umbrales son exactos', () => {
  test('79,9 % NO cuenta en 80; 80 % sí', () => {
    const c = horasContraAmpacidad([h(799), h(800)], 1000);   // 79,9 % y 80 %
    assert.equal(c.n, 2);
    assert.equal(c.sobre80, 1);
    assert.equal(c.sobre90, 0);
    assert.equal(c.sobre100, 0);
    assert.equal(c.motivo, null);
  });

  test('89,9 / 90 y 99,9 / 100 — misma frontera en los otros dos umbrales', () => {
    const c = horasContraAmpacidad([h(899), h(900), h(999), h(1000)], 1000);
    assert.equal(c.sobre80, 4);
    assert.equal(c.sobre90, 3);
    assert.equal(c.sobre100, 1);
  });

  test('los umbrales son ACUMULADOS: una hora al 120 % cuenta en los tres', () => {
    const c = horasContraAmpacidad([h(120)], 100);
    assert.deepEqual(
      { sobre80: c.sobre80, sobre90: c.sobre90, sobre100: c.sobre100 },
      { sobre80: 1, sobre90: 1, sobre100: 1 },
    );
  });

  test('⚠️ el ruido de la coma flotante no le quita una hora al umbral', () => {
    // 699,3 / 777 es un 90 % exacto en decimal, pero (699.3 / 777) * 100 da
    // 89,99999999999999 en binario: sin el redondeo, esa hora se caería de sobre90.
    assert.ok((699.3 / 777) * 100 < 90, 'el caso debe seguir mostrando el ruido');
    const c = horasContraAmpacidad([h(699.3)], 777);
    assert.equal(c.sobre80, 1);
    assert.equal(c.sobre90, 1);
    assert.equal(c.sobre100, 0);
  });

  test('devuelve la ampacidad contra la que contó', () => {
    assert.equal(horasContraAmpacidad([h(10)], 500).ampacidad_A, 500);
  });
});

describe('horasContraAmpacidad — un hueco NO es un cero', () => {
  test('corriente null, ausente, NaN o texto no entra en n ni en ningún contador', () => {
    const c = horasContraAmpacidad(
      [h(null), {}, h(Number.NaN), h('950'), null, h(950), h(100)],
      1000,
    );
    assert.equal(c.n, 2);
    assert.equal(c.sobre80, 1);
    assert.equal(c.sobre90, 1);
    assert.equal(c.sobre100, 0);
  });

  test('n = 0 → contadores en 0 y el motivo lo dice', () => {
    for (const registros of [[], [h(null), {}], null, undefined]) {
      const c = horasContraAmpacidad(registros, 1000);
      assert.equal(c.n, 0);
      assert.equal(c.sobre80, 0);
      assert.equal(c.sobre90, 0);
      assert.equal(c.sobre100, 0);
      assert.equal(c.motivo, 'no hay lecturas con corriente');
    }
  });
});

describe('horasContraAmpacidad — sin ampacidad no se cuenta (no se supone una)', () => {
  for (const [nombre, amp] of [
    ['null', null], ['undefined', undefined], ['cero', 0], ['negativa', -800],
    ['NaN', Number.NaN], ['infinita', Number.POSITIVE_INFINITY], ['texto', '800'],
  ]) {
    test(`ampacidad ${nombre} → los tres contadores null y un motivo`, () => {
      const c = horasContraAmpacidad([h(900), h(1200)], amp);
      assert.equal(c.sobre80, null);
      assert.equal(c.sobre90, null);
      assert.equal(c.sobre100, null);
      assert.equal(c.ampacidad_A, null);
      assert.equal(c.n, 2, 'las lecturas sí se cuentan: lo que falta es la ampacidad');
      assert.equal(typeof c.motivo, 'string');
      assert.match(c.motivo, /ampacidad/);
    });
  }
});

describe('horasContraAmpacidad — es PURA', () => {
  test('no muta la entrada', () => {
    const registros = [
      { corriente_A: 850, fecha: '2026-01-01', hora: 3 },
      { corriente_A: null, fecha: '2026-01-01', hora: 4 },
      { corriente_A: 1010, fecha: '2026-01-02', hora: 0 },
    ];
    const copia = structuredClone(registros);
    Object.freeze(registros);
    registros.forEach(Object.freeze);
    horasContraAmpacidad(registros, 1000);
    assert.deepEqual(registros, copia);
  });

  test('misma entrada, mismo resultado', () => {
    const registros = [h(800), h(950), h(1100)];
    assert.deepEqual(horasContraAmpacidad(registros, 1000), horasContraAmpacidad(registros, 1000));
  });
});

describe('por qué hace falta — el hueco que tapa', () => {
  test('⚠️ sin cargabilidad_pct (SCADA) comportamientoEnElTiempo no cuenta nada; contra la ampacidad sí', () => {
    const registros = [h(700), h(820), h(930), h(1050), h(640), h(990)];
    const viejo = comportamientoEnElTiempo(registros);
    const bandas = viejo.horasPorBanda;
    assert.equal(bandas.normal + bandas.elevada + bandas.atencion + bandas.sobrecarga, 0);

    const nuevo = horasContraAmpacidad(registros, 1000);
    assert.equal(nuevo.n, 6);
    assert.equal(nuevo.sobre80, 4);
    assert.equal(nuevo.sobre90, 3);
    assert.equal(nuevo.sobre100, 1);
  });
});
