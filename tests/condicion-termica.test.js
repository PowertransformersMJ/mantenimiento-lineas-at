// ============================================================================
// tests/condicion-termica.test.js — el dueño único de las condiciones
// ----------------------------------------------------------------------------
// QUÉ VIGILA. La FÓRMULA de la ampacidad siempre tuvo un solo dueño. Lo que no
// lo tenía eran las CONDICIONES: cada pantalla escribía a mano su ambiente, su
// viento y su sol, y la misma línea salía con números distintos bajo el mismo
// rótulo «IEEE 738».
//
// ⚠️ Y LA DIFERENCIA NO ES COSMÉTICA. Con el mismo Darien AAAC a 90 °C:
// calma 522 A · 0,61 m/s 718 A · 1,0 m/s 807 A · 2,0 m/s 965 A. El mismo cable,
// de 522 a 965 A. **Elegir la condición es elegir el veredicto**, y una
// capacidad inflada hace que una línea sobrecargada parezca sana.
//
// Por eso estas pruebas no comprueban «que calcule bien» —de eso ya hay pruebas
// de oro contra tabla de fabricante— sino que **NUNCA publique un número sin
// decir con qué condiciones salió y cuáles se adoptaron** (`99 §ADR-093`).
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ampacidadDeLinea, condicionesDeAmpacidad, temperaturaDelConductor,
  CONDICION_DE_REFERENCIA, VIENTOS_DE_SENSIBILIDAD, ampacidad,
} from '../nucleo/termica.js';

/** El conductor real de LN-627, tal y como lo declara el contrato. */
const DARIEN = Object.freeze({
  codigo: 'Darien', material: 'AAAC', seccion_mm2: 283.5,
  diametro_m: 0.02179, tempMaxOperacion_C: 90,
});

describe('la ampacidad de referencia es la del dominio, verificada', () => {
  test('⚠️ el Darien AAAC a 90 °C da 718 A con la condición de referencia', () => {
    // Es EL número: el que va al papel que se firma. Si esto cambia sin que
    // nadie lo decida, hay que enterarse aquí y no en un informe.
    const r = ampacidadDeLinea({ conductor: DARIEN });
    assert.equal(Math.round(r.ampacidad_A), 718);
  });

  test('la tabla entera del dominio sigue saliendo: 611 · 649 · 718 · 779', () => {
    const corto = { material: 'AAAC', seccion: 283.5, diametro: 0.02179 };
    const c = { v: 0.61, eps: 0.5, abso: 0.5, qs: 1000, he: 10 };
    assert.deepEqual([75, 80, 90, 100].map((t) => Math.round(ampacidad(corto, t, 32, c))),
      [611, 649, 718, 779]);
  });

  test('⚠️ la sensibilidad al viento se calcula UNA vez y viaja con el número', () => {
    // Para que nadie vuelva a rehacer una ampacidad con condiciones propias.
    const r = ampacidadDeLinea({ conductor: DARIEN });
    assert.deepEqual(r.sensibilidadViento.map((x) => Math.round(x.ampacidad_A)),
      [522, 718, 807, 965]);
    assert.deepEqual(r.sensibilidadViento.map((x) => x.viento_m_s), [...VIENTOS_DE_SENSIBILIDAD]);
  });
});

describe('un número nunca sale sin decir de quién son sus condiciones', () => {
  test('⚠️ sin hipótesis, las SEIS condiciones se declaran ADOPTADAS', () => {
    const c = condicionesDeAmpacidad({});
    assert.equal(c.adoptadas.length, 6, 'alguna condición se coló sin declarar su origen');
    assert.equal(c.declaradas.length, 0);
    assert.equal(c.todoAdoptado, true);
    assert.deepEqual(c.valores, { ...CONDICION_DE_REFERENCIA });
  });

  test('⚠️ sin ratificar, SIEMPRE hay aviso — es lo que impide adoptar en silencio', () => {
    const c = condicionesDeAmpacidad({});
    assert.ok(c.aviso, 'se adoptó una condición y la pantalla no tiene nada que decir');
    assert.equal(c.ratificada, false);
    assert.match(c.aviso, /ADOPTADA/);
  });

  test('lo que el Ingeniero declara MANDA, y se marca como declarado', () => {
    const c = condicionesDeAmpacidad({
      hipotesis: { condicionTermica: { viento_m_s: 0.2, ratificada: false } },
    });
    assert.equal(c.valores.viento_m_s, 0.2);
    assert.ok(c.declaradas.includes('viento_m_s'));
    assert.ok(c.adoptadas.includes('ambiente_C'), 'lo no declarado dejó de marcarse como adoptado');
  });

  test('ratificada de verdad: el aviso se retira y queda la firma', () => {
    const c = condicionesDeAmpacidad({
      hipotesis: { condicionTermica: {
        viento_m_s: 0.61, ratificada: true, ratificadaPor: 'uid-1',
        ratificadaEn: '2026-09-01T12:00:00.000Z', fuente: 'criterio del Ingeniero' } },
    });
    assert.equal(c.ratificada, true);
    assert.equal(c.aviso, null);
    assert.equal(c.ratificadaPor, 'uid-1');
  });

  test('el rótulo nombra las seis, no dos', () => {
    const r = ampacidadDeLinea({ conductor: DARIEN });
    for (const t of ['ambiente', 'viento', 'sol', 'ε', 'α', 'msnm']) {
      assert.ok(r.rotulo.includes(t), `el rótulo no dice ${t}: publica un número medio ciego`);
    }
  });
});

describe('la temperatura del conductor: la FICHA manda sobre el material', () => {
  test('⚠️ una ficha a 75 °C ya no se ignora — eran 107 A de más', () => {
    // Es el error caro y va siempre por el lado optimista: con el límite del
    // material (90 °C) saldrían 718 A donde la ficha solo permite 611 A.
    const conFicha = { ...DARIEN, tempMaxOperacion_C: 75 };
    assert.equal(Math.round(ampacidadDeLinea({ conductor: conFicha }).ampacidad_A), 611);
    assert.equal(temperaturaDelConductor({ conductor: conFicha }).origen, 'ficha');
  });

  test('sin ficha se cae al material, y se DICE que es del material', () => {
    const t = temperaturaDelConductor({ conductor: { material: 'AAAC' } });
    assert.equal(t.valor_C, 90);
    assert.equal(t.origen, 'material');
    assert.match(t.rotulo, /material/);
  });

  test('lo que pide quien llama gana a las dos', () => {
    assert.equal(temperaturaDelConductor({ pedida_C: 50, conductor: DARIEN }).origen, 'pedida');
  });
});

describe('cuando no se puede, se dice — y no se inventa un número', () => {
  test('sin conductor devuelve null CON motivo, nunca 0', () => {
    const r = ampacidadDeLinea({});
    assert.equal(r.ampacidad_A, null);
    assert.match(r.motivo, /conductor/);
    assert.deepEqual(r.sensibilidadViento, [], 'dibujaría una sensibilidad de la nada');
  });

  test('⚠️ sin material declarado SÍ calcula, pero lo CONFIESA', () => {
    // Cae en el perfil genérico «Otro» (75 °C) porque así se comporta el motor
    // desde siempre y hay pantallas que dependen de ello. Lo que no puede pasar
    // es que salga un amperaje con cara de dato del conductor: aquí se exige el
    // aviso, que es lo que separa «adoptar» de «adoptar en silencio».
    const r = ampacidadDeLinea({ conductor: { seccion_mm2: 283.5, diametro_m: 0.02179 } });
    assert.ok(r.ampacidad_A > 0, 'dejó de calcular: eso rompe a quien ya dependía');
    assert.equal(r.temperatura.origen, 'generico');
    assert.ok(r.avisos.some((a) => /genérico|NO declarado|no declara/i.test(a)),
      'publica un amperaje del perfil genérico sin decirlo');
  });

  test('⚠️ el no evaluable SIGUE llevando sus condiciones', () => {
    // Para que la pantalla pueda decir «con estas condiciones no se pudo».
    const r = ampacidadDeLinea({});
    assert.equal(r.condiciones.adoptadas.length, 6);
  });
});
