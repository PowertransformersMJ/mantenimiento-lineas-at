// ============================================================================
// tests/ampacidad-de-fabricante.test.js — la ficha del fabricante MANDA
// ----------------------------------------------------------------------------
// ORDEN DEL INGENIERO, 2026-09-05: *«la ampacidad debe ser lo que dice el
// fabricante conforme a sus especificaciones técnicas»*.
//
// QUÉ VIGILA. Que el número de registro sea el de la ficha cuando la ficha
// existe, que el IEEE 738 baje a CONTRASTE sin desaparecer, y —lo más
// importante— que el sistema **no rellene en silencio** ninguna condición que
// el fabricante no haya impreso. Una ampacidad de catálogo sin sus condiciones
// es trazable y NO es comparable: las dos cosas a la vez, y las dos se dicen.
//
// ⚠️ POR QUÉ IMPORTA TANTO EL DETALLE DE LA TEMPERATURA. En este mismo Darien,
// la misma tabla da 611 A a 75 °C y 718 A a 90 °C. Tomar la fila equivocada es
// un 17 % de capacidad inventada, siempre por el lado optimista — y una
// capacidad inflada hace que una línea sobrecargada parezca sana.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ampacidadDeLinea, contrasteDeFabricante, condicionesDeLaFicha,
  condicionesDeAmpacidad, CONDICION_DE_REFERENCIA,
} from '../nucleo/termica.js';

const DARIEN = Object.freeze({
  codigo: 'Darien', material: 'AAAC', seccion_mm2: 283.5,
  diametro_m: 0.02179, tempMaxOperacion_C: 90,
});

/**
 * ⚠️ FICHA DE PRUEBA, NO UNA CIFRA REAL. 700 A es un número redondo elegido a
 * propósito para que NADIE lo confunda con un dato del fabricante del Darien de
 * LN-627, que a esta fecha el sistema no ha visto. Vive solo en `tests/`.
 */
const FICHA = Object.freeze({
  corriente_A: 700, tempConductor_C: 90,
  ambiente_C: 25, viento_m_s: 0.61, sol_W_m2: 1000,
  emisividad: 0.5, absortividad: 0.5, altitud_m: 0,
  metodo: 'IEEE 738',
  fabricante: 'Fabricante de prueba', documento: 'ficha de prueba rev. 0',
  declaradaPor: 'uid-de-prueba', declaradaEn: '2026-09-05T12:00:00.000Z',
});

describe('cuando la línea declara la ficha, manda la ficha', () => {
  test('la ampacidad de registro es la del fabricante, y lo DICE', () => {
    const r = ampacidadDeLinea({ conductor: { ...DARIEN, ampacidadDeFabricante: FICHA } });
    assert.equal(r.ampacidad_A, 700, 'no publicó la cifra del fabricante');
    assert.equal(r.naturaleza, 'declarada');
    assert.match(r.rotulo, /DECLARADA/);
    assert.match(r.rotulo, /Fabricante de prueba/, 'el rótulo no dice quién la declara');
  });

  test('el IEEE 738 no desaparece: baja a CONTRASTE', () => {
    const r = ampacidadDeLinea({ conductor: { ...DARIEN, ampacidadDeFabricante: FICHA } });
    assert.ok(r.contraste, 'se perdió el contraste');
    assert.equal(r.contraste.declarada_A, 700);
    assert.ok(Number.isFinite(r.contraste.enElSitio_A), 'no calculó lo del sitio');
    // Con esta ficha de prueba el sitio da 718 A contra 700 A impresos: la ficha
    // es CONSERVADORA y no hay nada que avisar. Es el caso cómodo.
    assert.equal(r.contraste.elSitioEsMasDuro, false);
    assert.ok(r.contraste.delta_A > 0);
    assert.ok(!r.avisos.some((a) => /MENOS que la ficha/.test(a)),
      'avisó de una promesa incumplida que no existe');
  });

  test('⚠️ y avisa cuando la ficha promete MÁS de lo que el sitio entrega', () => {
    // El caso peligroso, y el que la orden del Ingeniero hace posible: la cifra
    // de registro es la del catálogo, así que puede quedar por encima de lo que
    // el clima real permite. El sistema no la cambia — la delata.
    const optimista = { ...FICHA, corriente_A: 800 };
    const r = ampacidadDeLinea({ conductor: { ...DARIEN, ampacidadDeFabricante: optimista } });
    assert.equal(r.ampacidad_A, 800, 'la cifra de registro sigue siendo la suya');
    assert.equal(r.contraste.elSitioEsMasDuro, true);
    assert.ok(r.contraste.delta_A < 0);
    assert.ok(r.avisos.some((a) => /MENOS que la ficha/.test(a)),
      'no avisó de que el sitio no honra la cifra de registro');
    assert.ok(r.avisos.some((a) => /derratear es del ingeniero/.test(a)),
      'el sistema debe señalar el riesgo y NO decidir el derrateo por su cuenta');
  });

  test('⚠️ la cifra del fabricante SOBREVIVE a un conductor a medio describir', () => {
    // Ventaja real de la orden: el fabricante ya tuvo en cuenta la geometría.
    const flaco = { codigo: 'Darien', material: 'AAAC', ampacidadDeFabricante: FICHA };
    const r = ampacidadDeLinea({ conductor: flaco });
    assert.equal(r.ampacidad_A, 700, 'sin diámetro se quedó sin ampacidad, y no debe');
    assert.equal(r.naturaleza, 'declarada');
    assert.equal(r.contraste.comparable, false, 'sin geometría no puede contrastar, y debe decirlo');
  });
});

describe('lo que el sistema se NIEGA a suponer', () => {
  test('una ficha sin condiciones se publica igual, pero lo dice y no las inventa', () => {
    const pelada = {
      corriente_A: 700, tempConductor_C: 90, metodo: 'no_declarado',
      fabricante: 'Fabricante de prueba', documento: 'ficha de prueba rev. 0',
      declaradaPor: 'uid-de-prueba', declaradaEn: '2026-09-05T12:00:00.000Z',
    };
    const r = ampacidadDeLinea({ conductor: { ...DARIEN, ampacidadDeFabricante: pelada } });
    assert.equal(r.ampacidad_A, 700, 'el número es suyo: se publica');
    assert.ok(r.avisos.some((a) => /NO declara/.test(a)), 'no avisó de las condiciones ausentes');
    assert.equal(r.contraste.reproducida_A, null,
      '⚠️ recalculó la ficha con condiciones que el fabricante nunca imprimió');
    assert.equal(r.condicionesDeLaFicha.completa, false);
    assert.ok(r.condicionesDeLaFicha.faltan.includes('ambiente_C'));
  });

  test('ninguna condición ausente se rellena con la de referencia del sistema', () => {
    const c = condicionesDeLaFicha({ corriente_A: 700, tempConductor_C: 90, ambiente_C: 25 });
    assert.equal(c.valores.ambiente_C, 25);
    assert.equal(c.valores.viento_m_s, null, 'se coló un viento que nadie declaró');
    assert.notEqual(c.valores.viento_m_s, CONDICION_DE_REFERENCIA.viento_m_s);
    assert.equal(c.completa, false);
  });
});

describe('los dos desajustes que sobre-califican una línea sin que nadie lo note', () => {
  test('⚠️ una fila a 90 °C sobre un conductor declarado a 75 °C se avisa', () => {
    const conductor = {
      ...DARIEN, tempMaxOperacion_C: 75, ampacidadDeFabricante: FICHA,
    };
    const r = ampacidadDeLinea({ conductor });
    assert.ok(r.avisos.some((a) => /capacidad de MÁS/.test(a)),
      'usó la fila de 90 °C sobre un cable declarado a 75 °C sin decir nada');
  });

  test('una ficha sin método declarado se acepta, y se dice que no se puede explicar', () => {
    const sinMetodo = { ...FICHA, metodo: 'no_declarado' };
    const r = ampacidadDeLinea({ conductor: { ...DARIEN, ampacidadDeFabricante: sinMetodo } });
    assert.equal(r.ampacidad_A, 700);
    assert.ok(r.avisos.some((a) => /método/.test(a)));
  });
});

describe('sin ficha, nada cambia — y ahora lo declara', () => {
  test('el Darien sigue dando 718 A y se marca DERIVADA', () => {
    const r = ampacidadDeLinea({ conductor: DARIEN });
    assert.equal(Math.round(r.ampacidad_A), 718, 'regresión en el camino de siempre');
    assert.equal(r.naturaleza, 'derivada');
    assert.equal(r.fabricante, null);
    assert.equal(r.contraste, null);
    assert.match(r.rotulo, /CALCULADA \(IEEE 738\)/);
  });

  test('⚠️ la naturaleza NUNCA tiene valor por defecto: sin conductor es null', () => {
    // Un `?? 'derivada'` convertiría «no se sabe» en una afirmación.
    const r = ampacidadDeLinea({});
    assert.equal(r.ampacidad_A, null);
    assert.equal(r.naturaleza, null);
  });

  test('los cuatro vientos siguen saliendo del mismo dueño en las dos naturalezas', () => {
    const derivada = ampacidadDeLinea({ conductor: DARIEN });
    const declarada = ampacidadDeLinea({ conductor: { ...DARIEN, ampacidadDeFabricante: FICHA } });
    assert.equal(derivada.sensibilidadViento.length, 4);
    assert.equal(declarada.sensibilidadViento.length, 4);
    // El viento pesa igual sobre el cable, lo diga el catálogo o lo calculemos.
    assert.deepEqual(
      derivada.sensibilidadViento.map((s) => s.viento_m_s),
      declarada.sensibilidadViento.map((s) => s.viento_m_s));
  });
});

describe('el contraste, por separado', () => {
  test('dice cuánto se aleja el recálculo del número impreso', () => {
    const c = contrasteDeFabricante({
      conductor: DARIEN, ficha: FICHA,
      condicionesDelSitio: condicionesDeAmpacidad({}), tempConductor_C: 90,
    });
    assert.ok(Number.isFinite(c.reproducida_A), 'con las seis condiciones debe poder reproducir');
    assert.ok(Number.isFinite(c.desviacionDeLaFicha_pct));
    // A 25 °C ambiente el mismo cable da MÁS que a 32 °C: la ficha es optimista
    // respecto al sitio, que es justo lo que hay que poder ver.
    assert.ok(c.reproducida_A > c.enElSitio_A);
  });

  test('sin ficha no inventa un contraste', () => {
    const c = contrasteDeFabricante({ conductor: DARIEN, ficha: null });
    assert.equal(c.comparable, false);
    assert.match(c.motivo, /no declara ampacidad de fabricante/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA TRAMPA QUE ESTA ORDEN ABRE EN LAS PANTALLAS QUE DEMUESTRAN FÍSICA
// ────────────────────────────────────────────────────────────────────────────
// La cifra de registro pasa a ser una CONSTANTE IMPRESA. Cualquier pantalla que
// enseñe «mira cómo se mueve la ampacidad con el clima» y use `ampacidad_A`
// enseñará el MISMO número dos veces, que es lo contrario de lo que quiere
// demostrar — y sin dar ningún error. Pasó al implementar `99 §ADR-098`.
// ════════════════════════════════════════════════════════════════════════════
describe('la cifra de registro no sirve para demostrar que la ampacidad se mueve', () => {
  const conFicha = { ...DARIEN, ampacidadDeFabricante: FICHA };

  test('⚠️ con ficha declarada, cambiar el ambiente NO cambia la cifra de registro', () => {
    // Esto NO es un defecto: es lo que significa una cifra de catálogo. La
    // prueba lo fija para que nadie construya una demostración encima.
    const aqui = ampacidadDeLinea({ conductor: conFicha });
    const a40 = ampacidadDeLinea({ conductor: conFicha, pedida: { ambiente_C: 40 } });
    assert.equal(aqui.ampacidad_A, a40.ampacidad_A,
      'la cifra del fabricante dejó de ser constante: alguien la está recalculando');
  });

  test('…y el contraste SÍ se mueve, que es de donde debe salir la demostración', () => {
    const aqui = ampacidadDeLinea({ conductor: conFicha });
    const a40 = ampacidadDeLinea({ conductor: conFicha, pedida: { ambiente_C: 40 } });
    assert.ok(a40.contraste.enElSitio_A < aqui.contraste.enElSitio_A,
      'con 8 °C más de aire el conductor debe dar MENOS, y el contraste debe verlo');
  });

  test('Fundamentos demuestra con el contraste, no con la cifra de registro', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const t = readFileSync(fileURLToPath(
      new URL('../web/src/componentes/Fundamentos.tsx', import.meta.url)), 'utf-8');
    const tarjeta = t.slice(t.indexOf("case 'amp'"), t.indexOf("case 'terr'"));
    assert.match(tarjeta, /contraste\?\.enElSitio_A/,
      'la tarjeta que demuestra la física volvería a enseñar dos veces la cifra impresa');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA VIGENTE — el techo lo pone el fabricante, el suelo lo pone el día
// ────────────────────────────────────────────────────────────────────────────
// La cifra del fabricante es el valor de REGISTRO y no se toca. Pero el
// veredicto diario no puede dividir entre un número que la física del día no
// honra: FERC Orden 881 §35 lo llama, textualmente, «riesgo de sobrecarga
// inadvertida». Y la regla que hace que la orden del Ingeniero mande de verdad:
// **la vigente NUNCA sube por encima de la declarada**. Es un mínimo.
// ════════════════════════════════════════════════════════════════════════════
describe('la ampacidad vigente', () => {
  test('⚠️ cuando el día da MENOS que la ficha, manda el día', () => {
    const optimista = { ...FICHA, corriente_A: 800 };
    const r = ampacidadDeLinea({ conductor: { ...DARIEN, ampacidadDeFabricante: optimista } });
    assert.equal(r.ampacidad_A, 800, 'el registro no se toca');
    assert.ok(r.vigente_A < 800, 'el veredicto seguiría dividiendo entre lo que el cable no da');
    assert.equal(Math.round(r.vigente_A), Math.round(r.contraste.enElSitio_A));
    assert.match(r.vigenteRotulo, /la limita el clima del sitio/);
  });

  test('⚠️ cuando el día da MÁS, la vigente NO sube: el fabricante puso el techo', () => {
    // Es la mitad que hace que la orden se cumpla de verdad. Una noche fresca
    // con brisa no autoriza a pasarse del catálogo.
    const r = ampacidadDeLinea({ conductor: { ...DARIEN, ampacidadDeFabricante: FICHA } });
    assert.ok(r.contraste.enElSitio_A > 700, 'el escenario de la prueba ya no aplica');
    assert.equal(r.vigente_A, 700, 'la vigente se pasó del techo que fija la ficha');
    assert.match(r.vigenteRotulo, /la ficha del fabricante manda/);
  });

  test('sin poder contrastar, la vigente ES la ficha, y dice por qué', () => {
    const flaco = { codigo: 'Darien', material: 'AAAC', ampacidadDeFabricante: FICHA };
    const r = ampacidadDeLinea({ conductor: flaco });
    assert.equal(r.vigente_A, 700);
    assert.match(r.vigenteRotulo, /sin contrastar/);
  });

  test('sin ficha, registro y vigente son el mismo número', () => {
    const r = ampacidadDeLinea({ conductor: DARIEN });
    assert.equal(r.vigente_A, r.ampacidad_A);
  });

  test('el veredicto de Cargabilidad divide entre la VIGENTE, no entre el registro', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const t = readFileSync(fileURLToPath(
      new URL('../web/src/componentes/Cargabilidad.tsx', import.meta.url)), 'utf-8');
    assert.match(t, /contrasteConLaAmpacidad\(pico as never, referencia\.vigente_A\)/,
      'el veredicto volvería a dividir entre una capacidad que el cable puede no entregar hoy');
  });

  test('⚠️ CONVERGENCIA: la ficha real de CENTELSA y nuestro motor dan lo mismo', () => {
    // CENTELSA declara 665 A a 25 °C con el conductor a 75 °C. Llevado a los
    // 32 °C de Turbaco por IEEE 738 da ~611 A — que es EXACTAMENTE lo que da
    // nuestro motor calculando a 75 °C por su cuenta. Dos caminos
    // independientes, el mismo número: es la mejor prueba de que el motor no
    // está roto y de que la diferencia con los 718 A era la TEMPERATURA.
    const centelsa = {
      corriente_A: 665, tempConductor_C: 75, ambiente_C: 25, viento_m_s: 0.61,
      sol_W_m2: 1000, emisividad: 0.5, absortividad: 0.5, altitud_m: 0,
      metodo: 'IEEE 738', fabricante: 'CENTELSA (dato de la ficha pública, NO consta que sea el de LN-627)',
      documento: 'Aluminum Alloy Cables 6201 T81 (AAAC)',
      declaradaPor: 'uid-de-prueba', declaradaEn: '2026-09-05T12:00:00.000Z',
    };
    const r = ampacidadDeLinea({ conductor: { ...DARIEN, ampacidadDeFabricante: centelsa } });
    const propio = ampacidadDeLinea({ conductor: DARIEN, temperaturaConductor_C: 75 });
    assert.equal(Math.round(r.contraste.enElSitio_A), Math.round(propio.ampacidad_A));
    assert.equal(Math.round(r.vigente_A), 611);
  });
});
