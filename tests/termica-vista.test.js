// ============================================================================
// tests/termica-vista.test.js — el tablero térmico de la vista
// ----------------------------------------------------------------------------
// QUÉ SE PRUEBA: `vistas/termicaDatos.ts`, la función que convierte UN número de
// ampacidad en la franja de escenarios que se publica en pantalla.
//
// CÓMO SE PRUEBA, Y POR QUÉ ASÍ: aquí NO se compara contra la salida del propio
// módulo — eso solo congelaría los errores que ya tuviera. Se comprueban cosas
// que se sostienen solas:
//
//  · IDENTIDADES FÍSICAS que no dependen de ninguna constante elegida por el
//    proyecto: si sube el ambiente, la ampacidad baja; si sube el viento, sube;
//    si sube el sol, baja. La resistencia va con 1/sección exacto y es AFÍN con
//    la temperatura, así que (R75−R50)/(R50−R20) = 25/30 exacto pase lo que pase
//    con β.
//  · IDENTIDADES ALGEBRAICAS del propio tablero: MVA/I tiene que ser √3·U/1000
//    exacto, y si se invierte cuál escenario es la referencia, los dos derrateos
//    cumplen (1−d₁)(1−d₂) = 1. Una columna que se desincronice de la otra cae
//    aquí — y ese es justo el fallo caro: dos cifras publicadas juntas que ya no
//    hablan del mismo cálculo.
//  · UN VALOR A MANO: la resistencia a 20 °C sale de la resistividad IACS del
//    cobre patrón (1,7241·10⁻⁸ Ω·m), la conductividad relativa del material y el
//    2 % de cableado. Se escribe la cuenta completa, no se importa del núcleo.
//  · LOS HUECOS: sin sección, sin diámetro o sin tensión, la celda va `null` y
//    el motivo baja a `avisos`. Un número de relleno en una memoria de cálculo
//    es peor que un hueco: alguien firma con él.
//
// Datos SINTÉTICOS a propósito: este repositorio es público. Ningún conductor,
// tensión ni estructura de una línea real.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { tableroTermico, ESCENARIOS_ADOPTADOS } from '../web/src/vistas/termicaDatos.ts';

// ── Datos sintéticos ────────────────────────────────────────────────────────
// Un conductor inventado, de valores redondos, para que las cuentas a mano se
// puedan seguir con una calculadora de bolsillo.
const CONDUCTOR = Object.freeze({
  codigo: 'DEMO-250',
  material: 'ACSR',
  seccion_mm2: 250,
  diametro_m: 0.020,          // 20 mm. ⚠️ El núcleo pide METROS, no milímetros.
  tempMaxOperacion_C: 75,
});

const HIPOTESIS = Object.freeze({ nombre: 'Hipótesis de prueba', tempMax_C: 75 });

/** Escenario mínimo. Todo igual salvo lo que la prueba quiera mover. */
const esc = (etiqueta, ta_C, extra = {}) => ({
  etiqueta, ta_C, viento_m_s: 0.61, sol_W_m2: 1000, ...extra,
});

const soloNumero = (v) => {
  assert.equal(typeof v, 'number', `se esperaba un número y llegó ${JSON.stringify(v)}`);
  assert.ok(Number.isFinite(v), `número no finito: ${v}`);
  return v;
};

// ── 1 · La identidad que da nombre a la pestaña ─────────────────────────────

describe('sube el ambiente, baja la capacidad', () => {
  test('la ampacidad decrece de forma ESTRICTA con la temperatura ambiente', () => {
    const t = tableroTermico(CONDUCTOR, HIPOTESIS, [
      esc('A', 20), esc('B', 25), esc('C', 30), esc('D', 35), esc('E', 40),
    ]);

    const A = t.escenarios.map((e) => soloNumero(e.ampacidad_A));
    for (let i = 1; i < A.length; i++) {
      assert.ok(A[i] < A[i - 1],
        `con ${t.escenarios[i].ta_C} °C de ambiente la línea no puede transportar más que con `
        + `${t.escenarios[i - 1].ta_C} °C (${A[i]} A ≥ ${A[i - 1]} A)`);
    }
  });

  test('con el aire quieto la capacidad cae, aunque el ambiente no cambie', () => {
    const t = tableroTermico(CONDUCTOR, HIPOTESIS, [
      esc('calma', 32, { viento_m_s: 0.2 }),
      esc('brisa', 32, { viento_m_s: 0.61 }),
      esc('viento', 32, { viento_m_s: 2 }),
    ]);
    const [calma, brisa, viento] = t.escenarios.map((e) => soloNumero(e.ampacidad_A));
    assert.ok(calma < brisa && brisa < viento,
      `el viento refrigera: ${calma} A < ${brisa} A < ${viento} A no se cumple`);
  });

  test('el sol resta capacidad: la misma hora sin sol siempre da más', () => {
    const t = tableroTermico(CONDUCTOR, HIPOTESIS, [
      esc('sin sol', 32, { sol_W_m2: 0 }),
      esc('con sol', 32, { sol_W_m2: 1000 }),
    ]);
    const [sinSol, conSol] = t.escenarios.map((e) => soloNumero(e.ampacidad_A));
    assert.ok(sinSol > conSol, `sin sol (${sinSol} A) debería superar a con sol (${conSol} A)`);
  });

  test('El Niño (40 °C y calma) es el peor de los escenarios ADOPTADOS', () => {
    const t = tableroTermico(CONDUCTOR, HIPOTESIS, { tensionNominal_kV: 115 });
    const nino = t.escenarios.find((e) => e.clave === 'nino');
    const otros = t.escenarios.filter((e) => e.clave !== 'nino');

    assert.ok(nino, 'el escenario de El Niño desapareció de los adoptados');
    for (const o of otros) {
      assert.ok(soloNumero(nino.ampacidad_A) < soloNumero(o.ampacidad_A),
        `El Niño debería quedar por debajo de «${o.etiqueta}» y no lo hace`);
    }
    // Y el mensaje tiene que llegar a la vista, no quedarse en la cabeza de quien lo programó.
    assert.ok(t.avisos.some((a) => a.severidad === 'atencion' && /El Niño/i.test(a.texto)),
      'la caída del peor escenario no se anuncia como «atención»');
  });
});

// ── 2 · Los escenarios adoptados son los que se declararon ──────────────────

describe('los escenarios ADOPTADOS por el proyecto', () => {
  test('son cuatro, con el clima acordado, y se dice que no son de norma', () => {
    const t = tableroTermico(CONDUCTOR, HIPOTESIS);
    const clima = t.escenarios.map((e) => [e.ta_C, e.viento_m_s, e.sol_W_m2]);

    assert.equal(t.escenarios.length, 4);
    assert.deepEqual(clima, [
      [24, 0.61, 0],      // noche fresca, sin sol
      [32, 0.61, 1000],   // día típico — la referencia
      [38, 0.61, 1000],   // día caluroso
      [40, 0.2, 1000],    // El Niño, viento en calma
    ]);
    assert.ok(t.avisos.some((a) => /ADOPTADOS/.test(a.texto) && /no.*norma/i.test(a.texto)),
      'la tabla no declara que su clima es adoptado y no normativo — sin eso, un revisor '
      + 'los lee como si vinieran de una norma');
  });

  test('la lista se puede sustituir, y entonces manda la de quien llama', () => {
    const t = tableroTermico(CONDUCTOR, HIPOTESIS, [esc('único', 30, { referencia: true })]);
    assert.equal(t.escenarios.length, 1);
    assert.equal(t.escenarios[0].etiqueta, 'único');
  });

  test('los escenarios adoptados están congelados: nadie los muta desde fuera', () => {
    assert.throws(() => { ESCENARIOS_ADOPTADOS[0].ta_C = 99; }, TypeError);
    const t = tableroTermico(CONDUCTOR, HIPOTESIS);
    assert.equal(t.escenarios[0].ta_C, 24);
  });
});

// ── 3 · Derrateo: contra qué se mide la pérdida ─────────────────────────────

describe('derrateo — la referencia y lo que se pierde contra ella', () => {
  test('el escenario de REFERENCIA tiene derrateo 0 %', () => {
    const t = tableroTermico(CONDUCTOR, HIPOTESIS);
    const ref = t.escenarios.filter((e) => e.esReferencia);

    assert.equal(ref.length, 1, 'debe haber exactamente UNA fila de referencia');
    assert.equal(ref[0].derrateo_pct, 0);
    assert.equal(ref[0].etiqueta, t.referencia.etiqueta);
    // Y es el día típico, que es el que se declaró como referencia.
    assert.equal(ref[0].clave, 'tipico');
  });

  test('la referencia sigue al escenario marcado, no a la posición en la lista', () => {
    const t = tableroTermico(CONDUCTOR, HIPOTESIS, [
      esc('primero', 24), esc('marcado', 38, { referencia: true }), esc('tercero', 30),
    ]);
    assert.equal(t.escenarios[1].esReferencia, true);
    assert.equal(t.escenarios[1].derrateo_pct, 0);
    assert.equal(t.escenarios[0].esReferencia, false);
    // El más fresco tiene MÁS capacidad que la referencia: pérdida negativa.
    assert.ok(soloNumero(t.escenarios[0].derrateo_pct) < 0,
      'un escenario mejor que la referencia debe dar derrateo negativo, no cero');
  });

  test('el derrateo cuadra con la columna de amperios de la MISMA tabla', () => {
    // Si un día las dos columnas se calculan por caminos distintos, dejan de
    // hablar del mismo cálculo y nadie sabe cuál de las dos está mal.
    const t = tableroTermico(CONDUCTOR, HIPOTESIS);
    const ref = soloNumero(t.escenarios.find((e) => e.esReferencia).ampacidad_A);

    for (const e of t.escenarios) {
      const esperado = (1 - soloNumero(e.ampacidad_A) / ref) * 100;
      assert.ok(Math.abs(soloNumero(e.derrateo_pct) - esperado) < 1e-9,
        `«${e.etiqueta}»: publica ${e.derrateo_pct} % pero sus amperios dicen ${esperado} %`);
    }
  });

  test('invertir la referencia cumple (1−d₁)·(1−d₂) = 1 — identidad exacta', () => {
    // d = 1 − I/I_ref. Al intercambiar cuál es la referencia, los dos factores
    // son inversos entre sí. No depende de cuánto valga la ampacidad.
    const ida = tableroTermico(CONDUCTOR, HIPOTESIS, [
      esc('X', 25, { referencia: true }), esc('Y', 40),
    ]);
    const vuelta = tableroTermico(CONDUCTOR, HIPOTESIS, [
      esc('X', 25), esc('Y', 40, { referencia: true }),
    ]);

    const d1 = soloNumero(ida.escenarios[1].derrateo_pct) / 100;
    const d2 = soloNumero(vuelta.escenarios[0].derrateo_pct) / 100;
    assert.ok(Math.abs((1 - d1) * (1 - d2) - 1) < 1e-12,
      `(1−${d1})·(1−${d2}) debería ser 1 y da ${(1 - d1) * (1 - d2)}`);
  });

  test('sin escenario marcado se toma el primero, y se avisa de que fue por defecto', () => {
    const t = tableroTermico(CONDUCTOR, HIPOTESIS, [esc('uno', 30), esc('dos', 40)]);
    assert.equal(t.escenarios[0].esReferencia, true);
    assert.equal(t.escenarios[0].derrateo_pct, 0);
    assert.ok(t.avisos.some((a) => /referencia/i.test(a.texto)));
  });

  test('dos referencias no se silencian: manda la primera y se dice', () => {
    const t = tableroTermico(CONDUCTOR, HIPOTESIS, [
      esc('uno', 30, { referencia: true }), esc('dos', 40, { referencia: true }),
    ]);
    assert.equal(t.escenarios.filter((e) => e.esReferencia).length, 1);
    assert.ok(t.avisos.some((a) => a.severidad === 'aviso' && /referencia/i.test(a.texto)));
  });
});

// ── 4 · MVA: la tensión se lee, nunca se supone ─────────────────────────────

describe('potencia — √3 · U · I / 1000', () => {
  test('SIN tensión declarada el MVA va null y los amperios siguen valiendo', () => {
    const t = tableroTermico(CONDUCTOR, HIPOTESIS);
    for (const e of t.escenarios) {
      assert.equal(e.mva, null, `«${e.etiqueta}» inventó una potencia sin saber a qué tensión`);
      soloNumero(e.ampacidad_A);
    }
    assert.equal(t.referencia.tension_kV, null);
    assert.ok(t.avisos.some((a) => /tensión/i.test(a.texto) && /MVA/.test(a.texto)),
      'el hueco de MVA no explica su motivo');
  });

  test('con tensión, MVA/I es exactamente √3·U/1000', () => {
    const U = 115;   // kV — valor sintético
    const t = tableroTermico(CONDUCTOR, HIPOTESIS, { tensionNominal_kV: U });
    const esperado = (Math.sqrt(3) * U) / 1000;

    for (const e of t.escenarios) {
      const razon = soloNumero(e.mva) / soloNumero(e.ampacidad_A);
      assert.ok(Math.abs(razon - esperado) < 1e-12,
        `«${e.etiqueta}»: MVA/A = ${razon}, se esperaba ${esperado}`);
    }
    assert.equal(t.referencia.tension_kV, U);
  });

  test('la tensión NO está fija en el código: al doblarla, el MVA se dobla', () => {
    const baja = tableroTermico(CONDUCTOR, HIPOTESIS, { tensionNominal_kV: 34.5 });
    const alta = tableroTermico(CONDUCTOR, HIPOTESIS, { tensionNominal_kV: 69 });

    for (let i = 0; i < baja.escenarios.length; i++) {
      const a = soloNumero(baja.escenarios[i].mva);
      const b = soloNumero(alta.escenarios[i].mva);
      assert.ok(Math.abs(b / a - 2) < 1e-12,
        `al doblar la tensión el MVA debería doblarse: ${a} → ${b}`);
      // Los amperios NO dependen de la tensión: el balance térmico es el mismo.
      assert.equal(baja.escenarios[i].ampacidad_A, alta.escenarios[i].ampacidad_A);
    }
  });

  test('una tensión de cero no multiplica la línea por cero: se declara no evaluable', () => {
    const t = tableroTermico(CONDUCTOR, HIPOTESIS, { tensionNominal_kV: 0 });
    assert.equal(t.referencia.tension_kV, null);
    for (const e of t.escenarios) assert.equal(e.mva, null);
    assert.ok(t.avisos.some((a) => a.severidad === 'atencion' && /tensión/i.test(a.texto)));
  });
});

// ── 5 · Resistencia: la única fila confrontable con el catálogo ─────────────

describe('resistencia en corriente continua', () => {
  test('son las cuatro temperaturas acordadas, en orden', () => {
    const t = tableroTermico(CONDUCTOR, HIPOTESIS);
    assert.deepEqual(t.resistencia.map((r) => r.T_C), [20, 50, 75, 90]);
  });

  test('R a 20 °C: la cuenta completa, hecha a mano con la resistividad IACS', () => {
    // ρ(cobre patrón, 20 °C) = 1,7241·10⁻⁸ Ω·m · conductividad ACSR = 0,610
    // · sección 250 mm² = 250·10⁻⁶ m² · factor de cableado 1,02 (los hilos van
    // helicoidales y recorren más camino que el cable).
    //   R = 1,7241e-8 / 0,610 / 250e-6 · 1,02 = 1,153168…·10⁻⁴ Ω/m
    //   → ·1000 = 0,1153168… Ω/km
    const aMano = ((1.7241e-8 / 0.610) / (250e-6)) * 1.02 * 1000;
    const t = tableroTermico(CONDUCTOR, HIPOTESIS);
    const r20 = soloNumero(t.resistencia.find((r) => r.T_C === 20).ohm_km);

    assert.ok(Math.abs(r20 - aMano) / aMano < 1e-12,
      `R(20 °C) publica ${r20} Ω/km y la cuenta a mano da ${aMano} Ω/km`);
    // El factor 1 000 es el error clásico: Ω/m publicados como Ω/km.
    assert.ok(r20 > 0.01 && r20 < 10, `${r20} Ω/km está fuera de todo orden de magnitud real`);
  });

  test('la resistencia va con 1/sección: doblar la sección la parte por dos, exacto', () => {
    const fino = tableroTermico({ ...CONDUCTOR, seccion_mm2: 125 }, HIPOTESIS);
    const grueso = tableroTermico({ ...CONDUCTOR, seccion_mm2: 250 }, HIPOTESIS);

    for (let i = 0; i < fino.resistencia.length; i++) {
      const a = soloNumero(fino.resistencia[i].ohm_km);
      const b = soloNumero(grueso.resistencia[i].ohm_km);
      assert.ok(Math.abs(a / b - 2) < 1e-12, `a ${fino.resistencia[i].T_C} °C: ${a} / ${b} ≠ 2`);
    }
  });

  test('el modelo es AFÍN en T: (R75−R50)/(R50−R20) = 25/30 sea cual sea β', () => {
    const t = tableroTermico(CONDUCTOR, HIPOTESIS);
    const R = Object.fromEntries(t.resistencia.map((r) => [r.T_C, soloNumero(r.ohm_km)]));
    const razon = (R[75] - R[50]) / (R[50] - R[20]);

    assert.ok(Math.abs(razon - 25 / 30) < 1e-9,
      `la resistencia no crece linealmente con la temperatura: razón ${razon}`);
    assert.ok(R[20] < R[50] && R[50] < R[75] && R[75] < R[90],
      'la resistencia debe crecer con la temperatura, siempre');
  });

  test('la fila del límite del material queda marcada — y cambia con el material', () => {
    const acsr = tableroTermico(CONDUCTOR, HIPOTESIS);           // límite 75 °C
    const aaac = tableroTermico({ ...CONDUCTOR, material: 'AAAC' }, HIPOTESIS); // límite 90 °C

    assert.deepEqual(acsr.resistencia.filter((r) => r.esLimite).map((r) => r.T_C), [75]);
    assert.deepEqual(aaac.resistencia.filter((r) => r.esLimite).map((r) => r.T_C), [90]);
  });
});

// ── 6 · Lo que no se puede calcular se declara — nunca se rellena ───────────

describe('los huecos son un resultado, no un fallo', () => {
  test('sin sección no hay resistencia NI ampacidad, y se dice con severidad alta', () => {
    const { seccion_mm2, ...sinSeccion } = CONDUCTOR;
    void seccion_mm2;
    const t = tableroTermico(sinSeccion, HIPOTESIS, { tensionNominal_kV: 115 });

    for (const r of t.resistencia) assert.equal(r.ohm_km, null);
    for (const e of t.escenarios) {
      assert.equal(e.ampacidad_A, null);
      assert.equal(e.mva, null);
      assert.equal(e.derrateo_pct, null);
    }
    assert.ok(t.avisos.some((a) => a.severidad === 'atencion' && /secci/i.test(a.texto)));
  });

  test('sin diámetro se pierde la ampacidad, pero la resistencia se conserva', () => {
    const { diametro_m, ...sinDiametro } = CONDUCTOR;
    void diametro_m;
    const t = tableroTermico(sinDiametro, HIPOTESIS);

    for (const r of t.resistencia) soloNumero(r.ohm_km);
    for (const e of t.escenarios) assert.equal(e.ampacidad_A, null);
    assert.ok(t.avisos.some((a) => a.severidad === 'atencion' && /di[áa]metro/i.test(a.texto)),
      'decir «no evaluable» de más también es perder información: hay que decir QUÉ falta');
  });

  test('un material fuera del catálogo no rompe nada — pero se avisa', () => {
    const t = tableroTermico({ ...CONDUCTOR, material: 'ALEACIÓN-X' }, HIPOTESIS);
    for (const e of t.escenarios) soloNumero(e.ampacidad_A);
    assert.ok(t.avisos.some((a) => /ALEACIÓN-X/.test(a.texto)),
      'un material mal escrito cambia los números en silencio si nadie lo dice');
  });

  test('un escenario con clima no numérico se deja sin evaluar, no se calcula con ceros', () => {
    const t = tableroTermico(CONDUCTOR, HIPOTESIS, [
      esc('bueno', 32, { referencia: true }),
      { etiqueta: 'roto', ta_C: null, viento_m_s: 0.61, sol_W_m2: 1000 },
    ]);
    soloNumero(t.escenarios[0].ampacidad_A);
    assert.equal(t.escenarios[1].ampacidad_A, null);
    assert.ok(t.avisos.some((a) => a.severidad === 'atencion' && /roto/.test(a.texto)));
  });

  test('sin ningún dato no explota: devuelve la tabla vacía y la explica', () => {
    const t = tableroTermico();
    assert.equal(t.escenarios.length, 4);
    assert.equal(t.resistencia.length, 4);
    assert.ok(t.avisos.length > 0);
    for (const e of t.escenarios) {
      assert.equal(e.ampacidad_A, null);
      assert.equal(e.mva, null);
    }
  });
});

// ── 7 · Coherencia con el resto del informe ─────────────────────────────────

describe('cruces que delatan una incoherencia cara', () => {
  test('si la ficha declara más grados que el límite del material, se grita', () => {
    const t = tableroTermico({ ...CONDUCTOR, tempMaxOperacion_C: 95 }, HIPOTESIS); // ACSR: límite 75
    assert.ok(t.avisos.some((a) => a.severidad === 'atencion' && /recoc/i.test(a.texto)),
      'operar un ACSR por encima de 75 °C lo recuece de forma permanente: no puede pasar callado');
    assert.equal(t.referencia.tc_C, 95);
  });

  test('si la térmica calienta más de lo que supuso la mecánica, se dice qué se rompe', () => {
    // La flecha del informe se calculó a 50 °C; la ampacidad se pide a 75 °C.
    const t = tableroTermico(CONDUCTOR, { nombre: 'H', tempMax_C: 50 });
    assert.ok(t.avisos.some((a) => /flecha/i.test(a.texto) && /g[áa]libo/i.test(a.texto)),
      'pedir una corriente que calienta más de lo supuesto cambia la flecha, y con ella el gálibo');
  });

  test('la temperatura de cálculo declara de dónde salió', () => {
    const deFicha = tableroTermico(CONDUCTOR, HIPOTESIS);
    assert.equal(deFicha.referencia.tc_C, 75);
    assert.match(deFicha.referencia.tcOrigen, /ficha/i);

    const { tempMaxOperacion_C, ...sinFicha } = CONDUCTOR;
    void tempMaxOperacion_C;
    const delMaterial = tableroTermico(sinFicha, HIPOTESIS);
    assert.equal(delMaterial.referencia.tc_C, 75);          // límite continuo del ACSR
    assert.match(delMaterial.referencia.tcOrigen, /material/i);

    const pedida = tableroTermico(CONDUCTOR, HIPOTESIS, { temperaturaConductor_C: 60 });
    assert.equal(pedida.referencia.tc_C, 60);
    assert.ok(soloNumero(pedida.escenarios[0].ampacidad_A)
      < soloNumero(deFicha.escenarios[0].ampacidad_A),
      'con menos temperatura permitida el conductor tiene que transportar menos');
  });

  test('la altitud no es decorativa: más alto, aire más ralo, menos capacidad', () => {
    const mar = tableroTermico(CONDUCTOR, HIPOTESIS, { altitud_m: 0 });
    const alto = tableroTermico(CONDUCTOR, HIPOTESIS, { altitud_m: 2000 });
    assert.ok(soloNumero(alto.escenarios[0].ampacidad_A)
      < soloNumero(mar.escenarios[0].ampacidad_A));
    assert.equal(alto.referencia.altitud_m, 2000);
  });
});

// ── 8 · Higiene: pureza y orden de lectura ─────────────────────────────────

describe('higiene del módulo', () => {
  test('es PURO: no toca lo que le entra y repite el mismo resultado', () => {
    const conductor = { ...CONDUCTOR };
    const hipotesis = { ...HIPOTESIS };
    const lista = [esc('a', 30, { referencia: true }), esc('b', 40)];
    const copia = JSON.stringify({ conductor, hipotesis, lista });

    const uno = tableroTermico(conductor, hipotesis, lista);
    const dos = tableroTermico(conductor, hipotesis, lista);

    assert.equal(JSON.stringify({ conductor, hipotesis, lista }), copia, 'mutó su entrada');
    assert.deepEqual(uno, dos, 'dos llamadas iguales dieron resultados distintos');
  });

  test('los avisos salen ordenados de más grave a menos', () => {
    const t = tableroTermico({ material: 'ACSR' }, HIPOTESIS); // sin sección ni diámetro
    const orden = { atencion: 0, aviso: 1, info: 2 };
    const s = t.avisos.map((a) => orden[a.severidad]);
    for (let i = 1; i < s.length; i++) {
      assert.ok(s[i] >= s[i - 1], 'un «info» quedó por encima de una «atención»');
    }
  });

  test('ni un NaN ni un undefined llegan a la pantalla', () => {
    const t = tableroTermico(CONDUCTOR, HIPOTESIS, { tensionNominal_kV: 220 });
    const crudo = JSON.stringify(t);
    assert.ok(!/NaN|undefined|Infinity/.test(crudo), `salida con basura numérica: ${crudo.slice(0, 200)}`);
  });

  test('la deuda del método se declara: el balance usa resistencia en c.c.', () => {
    const t = tableroTermico(CONDUCTOR, HIPOTESIS);
    assert.ok(t.avisos.some((a) => /continua/i.test(a.texto) && /optimista/i.test(a.texto)),
      'la ampacidad sale por el lado optimista y eso es deuda declarada, no un olvido');
  });
});
