// ============================================================================
// tests/formato.test.js — la coma decimal en la prosa del núcleo
// ----------------------------------------------------------------------------
// El núcleo escribe sus textos con `toFixed`, que emite PUNTO decimal, porque
// `toLocaleString` dependería del ICU de la máquina y un veredicto no puede
// decir una cosa aquí y otra en el CI. El precio se paga al pintar: en Colombia
// el punto es el separador de MILES, así que «multiplica la tensión por 1.726»
// se lee *mil setecientos veintiséis* — justo la frase que más pesa del informe.
//
// Lo que se vigila aquí es la frontera: que la sustitución arregle los decimales
// y NO toque nada más. Un `replace` demasiado ávido convertiría «docs/40 §8» o
// `v0.1.0` en basura dentro de un documento que se firma.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { textoNucleo } from '../web/src/vistas/formato.ts';

describe('textoNucleo — coma decimal sin romper lo demás', () => {
  test('un decimal suelto pasa a coma', () => {
    assert.equal(textoNucleo('multiplica la tensión por 1.726'),
      'multiplica la tensión por 1,726');
  });

  test('varios en la misma frase, todos', () => {
    assert.equal(textoNucleo('El quiebre de 119.3° da 1.726 y sobran 0.5 %'),
      'El quiebre de 119,3° da 1,726 y sobran 0,5 %');
  });

  test('NO toca las referencias del cerebro ni las rutas', () => {
    // Aquí el punto no lleva dígito a los dos lados, o no es decimal.
    for (const s of ['docs/40 §8', 'nucleo/cargas.js', 'ver §3.', 'fin de frase.']) {
      assert.equal(textoNucleo(s), s, `no debía tocar: ${s}`);
    }
  });

  test('las versiones con dos puntos SÍ se ven afectadas: no se pasan por aquí', () => {
    // Documentado a propósito, no es un descuido: `v0.1.0` cumple el patrón de
    // decimal. Por eso esta función se aplica a la PROSA del núcleo y nunca al
    // sello de versiones, que se pinta aparte con su propio formato.
    assert.equal(textoNucleo('v0.1.0'), 'v0,1.0');
  });

  test('un texto sin números vuelve idéntico', () => {
    const s = 'No se estima: un apoyo que “cumple” contra una capacidad supuesta.';
    assert.equal(textoNucleo(s), s);
  });

  test('no rompe fórmulas ni identificadores', () => {
    assert.equal(textoNucleo('2·H·sen(α/2) sobre ftTotalPerpendicular_kgf'),
      '2·H·sen(α/2) sobre ftTotalPerpendicular_kgf');
  });

  test('es idempotente: aplicarla dos veces da lo mismo', () => {
    const s = 'factor 1.726 con 119.3°';
    assert.equal(textoNucleo(textoNucleo(s)), textoNucleo(s));
  });
});
