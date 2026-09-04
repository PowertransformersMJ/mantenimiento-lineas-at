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
  // ⚠️ El corte llega hasta el bloque SIGUIENTE, no hasta un rótulo lejano: al
  // meterse `ElEntorno` en medio, la rebanada se tragaba sus números y la
  // prueba fallaba por un límite mal puesto, no por un dato falso.
  const bloque = PANTALLA.slice(PANTALLA.indexOf('function LoQueSaldra'),
    PANTALLA.indexOf('// EL ENTORNO COMPLETO'));

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

// ════════════════════════════════════════════════════════════════════════════
// EL ENTORNO VACÍO — se ve el instrumento entero, y NO hay un cero mentiroso
// ────────────────────────────────────────────────────────────────────────────
// Orden del Ingeniero (2026-09-04): «dame todo el entorno y los valores en 0
// hasta que yo vaya cargando, pero necesito ver las gráficas, los parámetros y
// las variables». Compatible con su orden del 29-08 porque enseñar la ESCALA no
// es inventar una MEDIDA.
//
// ⚠️ Y la distinción que estas pruebas defienden: **un hueco no es un cero**.
// «0 A» significa línea descargada; la ausencia significa que nadie midió. Los
// CONTADORES van a 0 (cero lecturas cargadas es verdad); las MEDIDAS van a «—»
// con su motivo (`99 §ADR-097`).
// ════════════════════════════════════════════════════════════════════════════
describe('el entorno se ve entero antes de cargar nada', () => {
  const ent = PANTALLA.slice(PANTALLA.indexOf('function ElEntorno'),
    PANTALLA.indexOf('// LAS VARIABLES OPERATIVAS', PANTALLA.indexOf('function ElEntorno')));

  test('⚠️ se monta SIEMPRE, no detrás de un archivo cargado', () => {
    // Va DENTRO de la rama `!cargado`, que es lo que garantiza que se vea sin
    // archivo. (Comparar índices con `{cargado && (` no valía: ese literal
    // aparece antes, en el botón de descartar.)
    assert.match(PANTALLA, /<ElEntorno referencia=/);
    const rama = PANTALLA.slice(PANTALLA.indexOf('{!cargado && !fallo && ('),
      PANTALLA.indexOf('{cargado && (', PANTALLA.indexOf('{!cargado && !fallo && (')));
    assert.match(rama, /<ElEntorno referencia=/,
      'el entorno quedó fuera de la rama sin archivo: no se vería hasta cargar');
  });

  test('las GRÁFICAS se dibujan vacías: eje, marcas y las tres bandas', () => {
    assert.match(ent, /<LienzoVacio/);
    const lz = PANTALLA.slice(PANTALLA.indexOf('function LienzoVacio'), PANTALLA.indexOf('function ElEntorno'));
    assert.match(lz, /marcasY\(techo\)/, 'la gráfica vacía perdió su eje');
    assert.match(lz, /REFERENCIAS\.filter/, 'perdió las bandas 80/90/100, que son ciertas sin dato');
  });

  test('el mapa de calor enseña sus 24 horas, en blanco', () => {
    assert.match(ent, /length: 24/);
    assert.match(ent, /sin-dato/, 'la celda sin medir dejó de marcarse como tal');
  });

  test('están TODOS los parámetros con su nombre y su unidad', () => {
    for (const r of ['Potencia aparente', 'Potencia activa', 'Potencia reactiva',
      'Factor de potencia', 'Corriente en reactiva', 'Tensión de operación',
      'Desbalance entre fases', 'Corriente residual', 'Pérdidas en el conductor']) {
      assert.ok(ent.includes(r), `falta el parámetro «${r}» en el entorno vacío`);
    }
  });

  test('⚠️ NINGUNA medida se escribe como 0: un hueco no es un cero', () => {
    // «0 A» o «0 %» significaría línea descargada o sin carga; la ausencia
    // significa que nadie midió. Es la confusión que el módulo existe para
    // impedir, y la puerta por la que se colaría.
    assert.ok(!/["'`]0\s*(A|%|kV|MW|MVAr|MVA|kW)["'`]/.test(ent),
      'se escribió una medida como cero en el entorno vacío');
    assert.match(ent, /Un hueco no es un cero|un hueco no es un cero|no se escribe «0 %»/i,
      'desapareció la frase que explica por qué no hay ceros');
  });

  test('los CONTADORES sí van a cero, porque eso sí es cierto', () => {
    assert.match(ent, /enElTiempo\.n/);
    assert.match(ent, /horasPorBanda\.sobrecarga/);
  });

  test('la ampacidad se enseña, y declara que NO sale del archivo', () => {
    assert.match(ent, /del conductor, no del archivo/);
    assert.match(ent, /referencia\.motivo/, 'sin conductor no dice por qué falta');
  });
});
