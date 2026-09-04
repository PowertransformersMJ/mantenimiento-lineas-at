// ============================================================================
// tests/veredicto-electrico.test.js — la única cifra del módulo que DICTAMINA
// ----------------------------------------------------------------------------
// QUÉ VIGILA. El módulo de cargabilidad enseña DOS porcentajes que no son el
// mismo, y confundirlos es el enredo que costó `30 · M-02`:
//
//   · **% del archivo** — corriente ÷ capacidad NOMINAL de placa. Fijo. Lo trae
//     el SCADA. NO es un veredicto: es lo que el archivo declaró.
//   · **% contra ampacidad** — corriente ÷ capacidad REAL del conductor con unas
//     condiciones declaradas (IEEE 738). **Éste sí dictamina.**
//
// Los mismos 502 A de LN-627 salen al 70 % de la ampacidad de referencia y al
// 98 % de la de un día en calma. Por eso estas pruebas exigen que las dos cifras
// se publiquen JUNTAS y del mismo tamaño: poner una grande y otra de nota al pie
// sería elegir el veredicto por el Ingeniero (`99 §ADR-093`).
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { contrasteConLaAmpacidad } from '../nucleo/cargabilidad.js';
import { ampacidadDeLinea } from '../nucleo/termica.js';

const leer = (p) => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf-8');
const PANTALLA = leer('web/src/componentes/Cargabilidad.tsx');

const DARIEN = { codigo: 'Darien', material: 'AAAC', seccion_mm2: 283.5,
  diametro_m: 0.02179, tempMaxOperacion_C: 90 };

describe('el veredicto sobre el caso real de LN-627', () => {
  // 502 A fue el pico de la fase T el 22-07. No es un ejemplo inventado: es la
  // cifra que salió del archivo del Ingeniero.
  const pico = { linea: 'LN-627', fecha: '2026-07-22', hora: 14, corriente_A: 502 };

  test('⚠️ 502 A contra la ampacidad de referencia dan 69,9 %', () => {
    const ref = ampacidadDeLinea({ conductor: DARIEN });
    const c = contrasteConLaAmpacidad(pico, ref.ampacidad_A);
    assert.equal(c.comparable, true);
    assert.equal(Math.round(c.contraAmpacidad_pct * 10) / 10, 69.9);
  });

  test('⚠️ los MISMOS amperios en calma dan 96,2 % — por eso la condición se declara', () => {
    // El mismo cable y la misma corriente. Lo único que cambió es el aire.
    const ref = ampacidadDeLinea({ conductor: DARIEN });
    const enCalma = ref.sensibilidadViento.find((x) => x.viento_m_s === 0);
    const c = contrasteConLaAmpacidad(pico, enCalma.ampacidad_A);
    assert.ok(c.contraAmpacidad_pct > 95 && c.contraAmpacidad_pct < 97,
      `en calma da ${c.contraAmpacidad_pct} %`);
  });

  test('sin ampacidad NO dictamina, y dice por qué', () => {
    const c = contrasteConLaAmpacidad(pico, null);
    assert.equal(c.comparable, false);
    assert.match(c.porQue, /ampacidad|IEEE 738/);
  });

  test('sin corriente tampoco: un porcentaje no basta para dictaminar', () => {
    const c = contrasteConLaAmpacidad({ linea: 'LN-627', cargabilidad_pct: 70 }, 718);
    assert.equal(c.comparable, false);
  });
});

describe('la pantalla no deja que una cifra tape a la otra', () => {
  test('⚠️ las dos van como indicador, no una de nota al pie', () => {
    const i = PANTALLA.indexOf('function ElVeredicto');
    const j = PANTALLA.indexOf('function Tablero', i);
    const bloque = PANTALLA.slice(i, j);
    assert.ok(i > 0, 'desapareció el veredicto');
    assert.match(bloque, /contra la AMPACIDAD/);
    assert.match(bloque, /% del ARCHIVO/);
    // Los dos como <Kpi>: mismo peso visual.
    assert.ok((bloque.match(/<Kpi /g) ?? []).length >= 2,
      'una de las dos cifras dejó de ser un indicador');
  });

  test('la pantalla EXPLICA que son preguntas distintas', () => {
    const bloque = PANTALLA.slice(PANTALLA.indexOf('function ElVeredicto'));
    assert.match(bloque, /preguntas distintas/);
    assert.match(bloque, /nominal/i);
  });

  test('⚠️ el veredicto sale del PICO, no del promedio', () => {
    // Lo que decide si una línea aguanta es el momento en que más cargó.
    assert.match(PANTALLA, /const pico = conA\.reduce/);
  });

  test('la condición adoptada se confiesa en la propia tarjeta', () => {
    const bloque = PANTALLA.slice(PANTALLA.indexOf('function ElVeredicto'));
    assert.match(bloque, /ADOPTADA/);
    assert.match(bloque, /referencia\.avisos/, 'los avisos del motor no llegan a la pantalla');
  });

  test('se enseña la sensibilidad al viento: es lo que hace visible el riesgo', () => {
    const bloque = PANTALLA.slice(PANTALLA.indexOf('function ElVeredicto'));
    assert.match(bloque, /sensibilidadViento/);
  });
});

describe('lo que se descarga dice de dónde viene', () => {
  test('⚠️ el CSV lleva línea, archivo, motor y las condiciones', () => {
    assert.match(PANTALLA, /function procedenciaDelCsv/);
    for (const t of ['Motor de cálculo', 'Ampacidad de referencia', 'Origen: archivo']) {
      assert.ok(PANTALLA.includes(t), `el CSV no declara «${t}»`);
    }
  });

  test('y avisa de que sus dos porcentajes no son el mismo', () => {
    assert.match(PANTALLA, /No son el mismo número/);
  });

  test('si la condición está adoptada, el archivo lo dice en su cabecera', () => {
    assert.match(PANTALLA, /ATENCIÓN: la condición ambiental está ADOPTADA/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA PANTALLA VACÍA ENSEÑA SU ESTRUCTURA — sin una sola cifra de ejemplo
// ────────────────────────────────────────────────────────────────────────────
// ⚠️ Nace de un fallo mío repetido TRES veces: el Ingeniero pidió ver «las
// gráficas y las variables» y las tres se encontró una pantalla que solo decía
// «cargue su archivo». Todo lo construido vivía detrás de esa frase.
//
// Y no se arregla con datos de ejemplo —prohibidos por orden suya del
// 2026-08-29—. Se arregla enseñando la ESTRUCTURA. Estas pruebas vigilan las dos
// mitades: que la estructura se enseñe, y que no se cuele ni un dato falso por
// esa puerta nueva (`99 §ADR-096`).
// ════════════════════════════════════════════════════════════════════════════
describe('sin archivo cargado, la pantalla dice lo que saldrá', () => {
  const bloque = PANTALLA.slice(PANTALLA.indexOf('function LoQueSaldra'),
    PANTALLA.indexOf('// LAS VARIABLES OPERATIVAS'));

  test('⚠️ el estado vacío monta la estructura, no solo la frase', () => {
    assert.match(PANTALLA, /<LoQueSaldra referencia=\{referencia\} \/>/,
      'el estado vacío volvió a ser una sola frase: el Ingeniero no puede ver qué hace el módulo');
    assert.ok(bloque.length > 0);
  });

  test('los seis bloques dicen QUÉ PREGUNTA contestan', () => {
    // Una lista de títulos no enseña nada; lo que orienta es la pregunta.
    for (const q of ['Veredicto eléctrico', 'Qué transporta', 'Las tres fases',
      'Lo que cuesta', 'En el tiempo', 'Qué NO trae su archivo']) {
      assert.ok(PANTALLA.includes(q), `falta el bloque «${q}» en lo que saldrá`);
    }
    assert.match(PANTALLA, /¿cuántos amperios NO están haciendo trabajo\?/);
  });

  test('y dicen QUÉ COLUMNA los enciende: es lo accionable', () => {
    assert.match(PANTALLA, /Se enciende con/);
    assert.match(PANTALLA, /potencia activa y reactiva/);
  });

  test('⚠️ NI UNA cifra de ejemplo en esa tarjeta', () => {
    // La puerta por la que se colaría un dato de demostración. El único número
    // permitido es la ampacidad, que sale del CONDUCTOR y no del archivo.
    const numeros = bloque.match(/(?<![\w.])\d{2,}(?![\w%])/g) ?? [];
    assert.deepEqual(numeros, [],
      `se coló un número literal en la tarjeta vacía: ${numeros.join(', ')}`);
  });

  test('el único número que sale es el denominador, y declara de dónde viene', () => {
    assert.match(bloque, /referencia\.ampacidad_A/);
    assert.match(bloque, /no de su archivo/,
      'enseña la ampacidad sin decir que no sale del archivo: se leería como un dato cargado');
  });

  test('si no hay conductor, lo dice en vez de callarlo', () => {
    assert.match(bloque, /Falta el denominador/);
    assert.match(bloque, /referencia\.motivo/);
  });
});
