// ============================================================================
// tests/temperatura-del-fabricante.test.js — la temperatura la dice el fabricante
// ----------------------------------------------------------------------------
// ORDEN DEL INGENIERO, 2026-09-05: *«tomemos la temperatura de operación que
// recomienda el fabricante, debe ser información del fabricante, no supongamos
// nada»*.
//
// ⚠️ POR QUÉ ES LA CIFRA MÁS CARA DEL MOTOR. La temperatura del conductor entra
// al balance térmico por el salto (Tc − Ta), así que gobierna el amperaje entero.
// Para el Darien: 90 °C → 718 A · 75 °C → 611 A. Son **15 °C de diferencia y un
// 17 % de capacidad**, siempre por el lado optimista — el lado que hace que una
// línea sobrecargada parezca sana.
//
// Y de dónde salían los 90 °C: del límite TÍPICO del material AAAC. Nadie los
// declaró para ESTE conductor. Siete fichas públicas dan 75 °C para el Darien.
//
// ⚠️ La regla NO es «bórralo»: la visibilidad no se pierde (orden suya, 24-08).
// La regla es que un número que descansa sobre un supuesto **no se presenta
// como dictamen**, y que se diga ANTES del número, no en la letra pequeña.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ampacidadDeLinea, temperaturaDelConductor } from '../nucleo/termica.js';

const leer = (p) => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf-8');

/** El conductor tal y como lo siembra hoy el sistema, con su procedencia REAL. */
const COMO_ESTA_HOY = Object.freeze({
  codigo: 'Darien', material: 'AAAC', seccion_mm2: 283.5, diametro_m: 0.02179,
  tempMaxOperacion_C: 90, procedencia: 'supuesto',
  fuente: 'catálogo del módulo de campo LN-627 v10 — PENDIENTE confirmar con el proveedor',
});

describe('la temperatura declara de quién es', () => {
  test('⚠️ la que RECOMIENDA el fabricante gana a todo lo demás', () => {
    const conFicha = {
      ...COMO_ESTA_HOY,
      ampacidadDeFabricante: {
        corriente_A: 665, tempConductor_C: 75, tempMaxOperacion_C: 75,
        fabricante: 'Fabricante de prueba', documento: 'ficha de prueba',
      },
    };
    const t = temperaturaDelConductor({ conductor: conFicha });
    assert.equal(t.valor_C, 75, 'siguió usando los 90 °C del material teniendo la del fabricante');
    assert.equal(t.origen, 'fabricante');
    assert.equal(t.naturaleza, 'declarada');
    assert.match(t.rotulo, /recomienda Fabricante de prueba/);
  });

  test('⚠️ una ficha con procedencia «supuesto» NO se hace pasar por declarada', () => {
    const t = temperaturaDelConductor({ conductor: COMO_ESTA_HOY });
    assert.equal(t.valor_C, 90, 'la visibilidad no se pierde: el número sigue');
    assert.equal(t.naturaleza, 'supuesta', 'un supuesto viajaba con insignia de fabricante');
    assert.match(t.aviso, /no se firma/);
  });

  test('el límite TÍPICO del material se declara supuesto, y dice que no es del conductor', () => {
    const { tempMaxOperacion_C, ...sinFicha } = COMO_ESTA_HOY;
    void tempMaxOperacion_C;
    const t = temperaturaDelConductor({ conductor: sinFicha });
    assert.equal(t.naturaleza, 'supuesta');
    assert.match(t.rotulo, /límite TÍPICO del material/);
    assert.match(t.rotulo, /no del conductor/);
  });

  test('un valor con procedencia de fabricante o de plano SÍ cuenta como declarado', () => {
    for (const p of ['catalogo_fabricante', 'documento_proyecto', 'confirmado_humano']) {
      const t = temperaturaDelConductor({ conductor: { ...COMO_ESTA_HOY, procedencia: p } });
      assert.equal(t.naturaleza, 'declarada', `«${p}» debería contar como declarada`);
    }
  });
});

describe('un amperaje sobre un supuesto NO es un dictamen', () => {
  test('⚠️ hoy, con el conductor tal y como está, NO se firma', () => {
    const r = ampacidadDeLinea({ conductor: COMO_ESTA_HOY });
    assert.equal(Math.round(r.ampacidad_A), 718, 'el número sigue: no se pierde visibilidad');
    assert.equal(r.esDictamen, false, 'se estaría firmando una capacidad sobre un supuesto');
    assert.match(r.rotulo, /NO ES DICTAMEN/);
  });

  test('con la temperatura del fabricante, sí', () => {
    const r = ampacidadDeLinea({
      conductor: {
        ...COMO_ESTA_HOY, procedencia: 'catalogo_fabricante', tempMaxOperacion_C: 75,
      },
    });
    assert.equal(r.esDictamen, true);
    assert.equal(Math.round(r.ampacidad_A), 611, '75 °C tienen que dar 611 A, no 718');
  });

  test('⚠️ LOS 15 °C SON UN 17 %, y ése es todo el argumento', () => {
    const a90 = ampacidadDeLinea({ conductor: COMO_ESTA_HOY, temperaturaConductor_C: 90 });
    const a75 = ampacidadDeLinea({ conductor: COMO_ESTA_HOY, temperaturaConductor_C: 75 });
    const demas = ((a90.ampacidad_A - a75.ampacidad_A) / a75.ampacidad_A) * 100;
    assert.ok(demas > 15 && demas < 20, `esperaba ~17 % y salió ${demas.toFixed(1)} %`);
  });
});

describe('lo dicen los sitios que publican, no solo el motor', () => {
  test('⚠️ el informe FIRMABLE lo declara, y antes de la tabla de condiciones', () => {
    const t = leer('exportar/informe.js');
    const i = t.indexOf('ESTE AMPERAJE NO ES UN DICTAMEN');
    assert.ok(i > 0, 'el informe que se firma no avisa de que el denominador es un supuesto');
    assert.ok(i < t.indexOf('Las condiciones con las que se calculó'),
      'el aviso va DESPUÉS de la tabla: en un papel firmado eso es letra pequeña');
  });

  test('el veredicto de Cargabilidad lo dice antes del número', () => {
    const t = leer('web/src/componentes/Cargabilidad.tsx');
    assert.match(t, /esDictamen === false/);
    assert.ok(t.indexOf('NO es un dictamen') < t.indexOf('<b>Ampacidad:</b>'),
      'el aviso tiene que ir antes de la cifra, no debajo');
  });

  test('el resumen gerencial también', () => {
    assert.match(leer('exportar/gerencial.js'), /esDictamen === false/);
  });

  test('⚠️ la semilla ya NO etiqueta como de fabricante lo que es del módulo de campo', () => {
    // Decía `catalogo_fabricante` mientras su propia `fuente` decía «catálogo
    // del módulo de campo … PENDIENTE confirmar con el proveedor». Las dos no
    // pueden ser ciertas, y la etiqueta era la que mentía.
    const t = leer('herramientas/sembrar.mjs');
    // ⚠️ El corte NO puede ser `const hipotesis`: `const hipotesisId` aparece
    // ANTES en el archivo y es su prefijo, así que el slice salía vacío y la
    // prueba habría pasado en verde sin mirar nada. Lo cazó ella misma.
    const bloque = t.slice(t.indexOf("codigo: 'Darien'"), t.indexOf('const hipotesis ='));
    assert.match(bloque, /procedencia: 'supuesto'/);
    assert.ok(!/procedencia: 'catalogo_fabricante'/.test(bloque),
      'la suposición volvió a ponerse la insignia del fabricante');
  });
});
