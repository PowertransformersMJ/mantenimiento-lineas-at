// ============================================================================
// tests/electrica.test.js — las variables operativas, y lo que se NIEGAN a hacer
// ----------------------------------------------------------------------------
// QUÉ VIGILA. Este fichero no comprueba sobre todo que la aritmética salga: eso
// es lo fácil. Comprueba que **ninguna función invente un ingrediente que falta**,
// que es la orden literal del Ingeniero del 2026-09-01: «no suponer nada, no
// colocar información basura».
//
// ⚠️ Nace de un error mío. Afirmé que su archivo de SCADA «no trae la columna de
// tensión» sin haberlo comprobado nunca — su archivo no está en el repositorio
// porque es dato de cliente. De ahí la regla que estas pruebas hacen cumplir:
// nada se cablea, todo se deriva de la carga real (`99 §ADR-094`).
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  desbalanceDeFases, residualDeFases, potenciasDelInstante, perdidasJoule,
  desviacionDeTension, comportamientoEnElTiempo, disponibilidadDeVariables,
} from '../nucleo/electrica.js';
import { resistenciaDC } from '../nucleo/termica.js';

const DARIEN = { material: 'AAAC', seccion_mm2: 283.5 };
const LONGITUD = 3032.8;   // m — dato real de LN-627

// ════════════════════════════════════════════════════════════════════════════
// LO QUE SE NIEGAN A INVENTAR — el corazón del fichero
// ════════════════════════════════════════════════════════════════════════════
describe('ninguna función se inventa un ingrediente que falta', () => {
  test('⚠️ sin P ni Q NO hay factor de potencia — ni uno «típico»', () => {
    // Suponer 0,90 «porque casi siempre es eso» cambiaría 219 A de veredicto.
    const p = potenciasDelInstante({ corriente_A: 502, tensionNominal_kV: 66 });
    assert.equal(p.factorDePotencia, null);
    assert.equal(p.naturaleza, null, 'declaró inductiva sin tener Q');
    assert.equal(p.corrienteReactiva_A, null);
  });

  test('⚠️ sin tensión de ninguna clase, no hay potencias — y se dice por qué', () => {
    const p = potenciasDelInstante({ corriente_A: 502 });
    assert.equal(p.aparente_MVA, null);
    assert.match(p.motivo, /tensión/);
  });

  test('⚠️ las pérdidas EXIGEN que se declare la temperatura', () => {
    // Entre 32 y 90 °C la misma corriente pierde un 19 % más: elegirla en
    // silencio sería publicar un número que nadie puede comprobar.
    const l = perdidasJoule({ conductor: DARIEN, corriente_A: 502, longitud_m: LONGITUD, resistenciaDC });
    assert.equal(l.perdidas_kW, null);
    assert.match(l.motivo, /temperatura/);
  });

  test('⚠️ la RESIDUAL se niega con solo las magnitudes, y explica el remedio', () => {
    // Sumar los módulos daría un número que se leería como corriente a tierra y
    // mandaría una cuadrilla a buscar una falla que no existe.
    const res = residualDeFases({ R: 480, S: 495, T: 502 });
    assert.equal(res.residual_A, null);
    assert.equal(res.comparable, false);
    assert.match(res.porQue, /fasorial/i);
    assert.match(res.porQue, /ángulo/i, 'no dice qué pedirle al SCADA para arreglarlo');
  });

  test('con los ángulos sí calcula: la negativa era por falta de dato, no por pereza', () => {
    const res = residualDeFases({ R: 500, S: 500, T: 500 }, { R: 0, S: -120, T: 120 });
    assert.equal(res.comparable, true);
    assert.ok(res.residual_A < 1, `tres fases equilibradas dan residual ~0, dio ${res.residual_A}`);
  });

  test('un desbalance de una sola fase no se publica', () => {
    assert.equal(desbalanceDeFases({ T: 502 }).desbalance_pct, null);
    assert.match(desbalanceDeFases({ T: 502 }).motivo, /una fase/);
  });

  test('la desviación de tensión NO dictamina: no hay banda que citar', () => {
    // Citar ±10 % de memoria es justo lo que `30 · L-09` prohíbe.
    const d = desviacionDeTension(63, 66);
    assert.ok('desviacion_pct' in d);
    assert.ok(!('cumple' in d) && !('banda' in d), 'emitió un veredicto sin banda declarada');
  });

  test('el comportamiento en el tiempo no se calcula con dos lecturas', () => {
    const c = comportamientoEnElTiempo([{ corriente_A: 400 }, { corriente_A: 500 }]);
    assert.equal(c.suficiente, false);
    assert.equal(c.factorDeCarga, null);
    assert.match(c.porQue, /hacen falta/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA ARITMÉTICA, contra las cifras reales de LN-627
// ════════════════════════════════════════════════════════════════════════════
describe('las cifras de LN-627 salen', () => {
  test('502 A a 66 kV son 57,4 MVA — y declara que la tensión es NOMINAL', () => {
    const p = potenciasDelInstante({ corriente_A: 502, tensionNominal_kV: 66 });
    assert.equal(Math.round(p.aparente_MVA * 10) / 10, 57.4);
    assert.equal(p.tensionUsada.de, 'nominal', 'no declara que el MVA salió de la placa');
  });

  test('la tensión MEDIDA gana a la nominal, y se dice', () => {
    const p = potenciasDelInstante({ corriente_A: 502, tension_kV: 63, tensionNominal_kV: 66 });
    assert.equal(p.tensionUsada.kV, 63);
    assert.equal(p.tensionUsada.de, 'medida');
  });

  test('⚠️ a fp 0,90, 219 de los 502 A no transportan nada', () => {
    // Es el hallazgo con más consecuencia del módulo: compensar libera capacidad
    // sin tocar un conductor.
    const p = potenciasDelInstante({ corriente_A: 502, tensionNominal_kV: 66,
      potenciaActiva_MW: 51.6, potenciaReactiva_MVAr: 25.0 });
    assert.equal(Math.round(p.corrienteReactiva_A), 219);
    assert.ok(p.corrienteReactiva_pct > 43 && p.corrienteReactiva_pct < 44);
    assert.equal(p.naturaleza, 'inductiva');
  });

  test('Q negativa es capacitiva — el signo manda, no el tamaño', () => {
    const p = potenciasDelInstante({ corriente_A: 502, tensionNominal_kV: 66,
      potenciaActiva_MW: 51.6, potenciaReactiva_MVAr: -25.0 });
    assert.equal(p.naturaleza, 'capacitiva');
  });

  test('pérdidas del Darien en 3,03 km: 282 kW a 32 °C y 337 a 90 °C', () => {
    const f = (T) => Math.round(perdidasJoule({ conductor: DARIEN, corriente_A: 502,
      longitud_m: LONGITUD, temperaturaConductor_C: T, resistenciaDC }).perdidas_kW);
    assert.equal(f(32), 282);
    assert.equal(f(90), 337);
  });

  test('las pérdidas viajan CON su temperatura pegada', () => {
    const l = perdidasJoule({ conductor: DARIEN, corriente_A: 502, longitud_m: LONGITUD,
      temperaturaConductor_C: 90, resistenciaDC });
    assert.equal(l.temperatura_C, 90);
    assert.equal(l.longitud_m, 3032.8);
  });

  test('el desbalance sale y nombra la peor fase', () => {
    const d = desbalanceDeFases({ R: 480, S: 495, T: 502 });
    assert.equal(d.faseMaxima, 'T');
    assert.ok(d.desbalance_pct > 2 && d.desbalance_pct < 3);
  });

  test('la caída de tensión sube la corriente para la misma potencia', () => {
    const d = desviacionDeTension(63, 66);
    assert.ok(d.desviacion_pct < 0, 'no detecta que la tensión bajó');
    assert.ok(d.efectoEnLaCorriente_pct > 0, 'no dice que eso SUBE la corriente');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// QUÉ TRAE EL ARCHIVO — la pieza que impide cablear un «falta»
// ════════════════════════════════════════════════════════════════════════════
describe('el estado de cada variable sale de la carga, nunca de un literal', () => {
  const conCorriente = [{ corriente_A: 502 }, { corriente_A: 480 }];

  test('⚠️ distingue «no viene la columna» de «viene vacía»', () => {
    // Son dos acciones distintas: pedírsela al SCADA, o mirar por qué no se
    // está registrando algo que sí se exporta.
    const sin = disponibilidadDeVariables(conCorriente, { corriente_A: 'I (A)' });
    const vacia = disponibilidadDeVariables(conCorriente, { corriente_A: 'I (A)', tension_kV: 'kV' });

    assert.equal(sin.find((v) => v.variable === 'tension_kV').estado, 'sin_columna');
    assert.equal(vacia.find((v) => v.variable === 'tension_kV').estado, 'columna_vacia');
  });

  test('⚠️ una cabecera no reconocida se declara FALLO NUESTRO, con su nombre', () => {
    // Si su SCADA sí exporta la tensión y nosotros no supimos leerla, el
    // remedio es un sinónimo, no pedirle nada a nadie.
    const d = disponibilidadDeVariables(conCorriente, { corriente_A: 'I (A)' }, ['Volt. Barra 66']);
    const t = d.find((v) => v.variable === 'tension_kV');
    assert.match(t.porQue, /Volt\. Barra 66/);
    assert.match(t.porQue, /fallo nuestro/);
  });

  test('lo que SÍ viene se cuenta: cuántas filas de cuántas', () => {
    const d = disponibilidadDeVariables(
      [{ corriente_A: 502 }, { corriente_A: null }, { corriente_A: 480 }], { corriente_A: 'I' });
    const c = d.find((v) => v.variable === 'corriente_A');
    assert.equal(c.hay, true);
    assert.equal(c.con, 2);
    assert.equal(c.de, 3);
  });

  test('cada variable dice QUÉ desbloquea: sin eso, pedirla al SCADA no se justifica', () => {
    for (const v of disponibilidadDeVariables([], {})) {
      assert.ok(v.desbloquea && v.desbloquea.length > 5, `${v.variable} no dice para qué sirve`);
      assert.ok(v.porQue, `${v.variable} enseña un hueco sin decir por qué: eso también es basura`);
    }
  });
});
