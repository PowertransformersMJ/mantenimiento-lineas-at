// ============================================================================
// tests/ampacidad-en-el-papel.test.js — que la capacidad LLEGUE al documento
// ----------------------------------------------------------------------------
// QUÉ VIGILA. La palabra «ampacidad» aparecía CERO veces en los quince
// generadores de papel. El número que decide cuánta corriente se puede despachar
// por una línea —el motivo de existir de la pestaña Térmica y de todo el módulo
// de cargabilidad— no viajaba al documento que se firma.
//
// ⚠️ Y NO BASTA CON QUE LLEGUE. Un amperaje suelto no significa nada: el mismo
// Darien AAAC da 522 A en calma y 965 A con 2 m/s. Estas pruebas exigen que el
// papel publique la cifra CON sus seis condiciones y CON quién las eligió —
// porque quien firma tiene derecho a saber qué eligió él y qué eligió el
// programa (`99 §ADR-093`).
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { informeHtml } from '../exportar/informe.js';
import { gerencialHtml } from '../exportar/gerencial.js';
import { ampacidadDeLinea } from '../nucleo/termica.js';

const leer = (p) => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf-8');
const LINEA = { codigo: 'LN-AAA', nombre: 'Línea sintética', tensionNominal_kV: 110 };
const DARIEN = { codigo: 'Darien', material: 'AAAC', seccion_mm2: 283.5,
  diametro_m: 0.02179, tempMaxOperacion_C: 90 };
const REF = ampacidadDeLinea({ conductor: DARIEN });

describe('el informe técnico publica la capacidad y su condición', () => {
  const html = informeHtml({ linea: LINEA, meta: { versionNucleo: '9.9.9' }, ampacidadReferencia: REF });

  test('⚠️ imprime los 718 A, no solo los recibe', () => {
    assert.match(html, /718/);
  });

  test('la sección entra en el índice de la portada', () => {
    // El índice se arma de la lista de secciones, así que si no sale aquí es
    // que la sección no existe de verdad.
    assert.match(html, /Capacidad en corriente/);
  });

  test('⚠️ publica las SEIS condiciones, no dos', () => {
    for (const t of ['Temperatura ambiente', 'Velocidad del viento', 'Radiación solar',
      'Emisividad', 'Absortividad', 'Altitud']) {
      assert.ok(html.includes(t), `el papel no declara «${t}»: publica un número medio ciego`);
    }
  });

  test('⚠️ dice que las condiciones las eligió el SISTEMA, no el ingeniero', () => {
    // Es la diferencia entre una referencia y un dictamen firmado.
    assert.match(html, /ADOPTADAS POR EL SISTEMA/);
  });

  test('enseña la sensibilidad al viento: lo que hace visible el riesgo', () => {
    assert.match(html, /calma/);
    assert.match(html, /965/);
  });

  test('⚠️ CAPACIDAD y MEDIDA no se confunden: sin archivo cargado lo DICE', () => {
    assert.match(html, /Sin medida de operación cargada/);
  });

  test('con medida cargada, publica el porcentaje contra la ampacidad', () => {
    const con = informeHtml({ linea: LINEA, meta: { versionNucleo: '9.9.9' },
      ampacidadReferencia: REF,
      cargabilidad: { corriente_A: 502, fecha: '2026-07-22', contraAmpacidad_pct: 69.9 } });
    assert.match(con, /502/);
    assert.match(con, /69,9|69\.9/);
    assert.doesNotMatch(con, /Sin medida de operación cargada/);
  });

  test('sin referencia declarada, el papel lo dice en vez de callarlo', () => {
    const sin = informeHtml({ linea: LINEA, meta: { versionNucleo: '9.9.9' } });
    assert.match(sin, /No se declaró la capacidad en corriente/);
  });

  test('si no es evaluable, publica el motivo y no un cero', () => {
    const noEval = informeHtml({ linea: LINEA, meta: { versionNucleo: '9.9.9' },
      ampacidadReferencia: ampacidadDeLinea({}) });
    assert.match(noEval, /no evaluable/);
    assert.match(noEval, /conductor/);
  });
});

describe('el gerencial lleva la cifra, no la tabla', () => {
  const html = gerencialHtml({ linea: LINEA, meta: { versionNucleo: '9.9.9' }, ampacidadReferencia: REF });

  test('⚠️ imprime la capacidad', () => {
    assert.match(html, /718 A/);
  });

  test('⚠️ y dice QUIÉN eligió las condiciones — es lo que decide si sirve', () => {
    assert.match(html, /las adoptó el sistema/);
    assert.match(html, /ratifi/i);
  });

  test('NO lleva la tabla de seis condiciones: quien lo lee no abre el cálculo', () => {
    // Es deliberado. Meterle la tabla lo convertiría en el técnico mal resumido.
    assert.ok(!html.includes('Absortividad'),
      'el gerencial se llenó de parámetros: deja de ser gerencial');
  });

  test('sin referencia sigue generándose: no se rompe un papel por una sección', () => {
    assert.match(gerencialHtml({ linea: LINEA, meta: {} }), /LN-AAA/);
  });
});

describe('quien manda a generar la calcula UNA vez para los dos papeles', () => {
  test('⚠️ Exportar la calcula una sola vez', () => {
    // Si cada generador la recalculara, dos documentos de la misma línea podrían
    // publicar amperajes distintos — justo lo que el dueño único vino a cerrar.
    const t = leer('web/src/componentes/Exportar.tsx');
    assert.equal((t.match(/ampacidadDeLinea\(/g) ?? []).length, 1,
      'se calcula más de una vez: dos papeles podrían discrepar');
    assert.match(t, /ampacidadReferencia,[\s\S]{0,400}cargabilidad: undefined/);
  });
});
