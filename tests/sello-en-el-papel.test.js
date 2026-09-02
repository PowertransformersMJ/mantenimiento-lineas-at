// ============================================================================
// tests/sello-en-el-papel.test.js — que los papeles digan CON QUÉ se produjeron
// ----------------------------------------------------------------------------
// QUÉ VIGILA, y por qué es su propio archivo. `CLAUDE.md §3.1` exige que todo
// resultado lleve con qué versión del motor se produjo. En pantalla se cumplía;
// **en el papel que se firma, no**:
//
//   · `informe.js` sí sabía imprimirlo… pero quien mandaba a generar NUNCA le
//     pasaba la versión, así que el informe FIRMABLE imprimía en su portada
//     «versión NO declarada — sin ella este informe no es reproducible». El
//     papel se autodenunciaba, y por una línea que nadie escribió.
//   · `gerencial.js` no lo mencionaba.
//   · `acta.js` PROMETÍA por escrito que sus cifras «las produce el mismo motor»
//     y no decía cuál. Una promesa de reproducibilidad que no se puede
//     comprobar es peor que no hacerla, porque invita a confiar.
//
// ⚠️ LA TRAMPA QUE ESTAS PRUEBAS EXISTEN PARA CERRAR: había pruebas que le
// pasaban la versión al generador en su fixture y **ninguna comprobaba que
// saliera impresa**. Pasar el dato y publicarlo son dos cosas distintas, y el
// verde de la primera se leía como si cubriera la segunda (`99 §ADR-092`).
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { gerencialHtml } from '../exportar/gerencial.js';
import { actaHtml } from '../exportar/acta.js';
import { informeHtml } from '../exportar/informe.js';

const LINEA = { codigo: 'LN-AAA', nombre: 'Línea sintética', tensionNominal_kV: 110 };
const VERSION = '9.9.9';   // inventada a propósito: si sale, es que viajó de verdad

describe('los tres papeles dicen con qué motor se produjeron', () => {
  test('⚠️ el informe TÉCNICO deja de autodenunciarse cuando se le declara', () => {
    const con = informeHtml({ linea: LINEA, meta: { versionNucleo: VERSION } });
    assert.match(con, new RegExp(`v${VERSION}`), 'no imprime la versión que se le pasó');
    assert.doesNotMatch(con, /versión NO declarada/,
      'sigue diciendo «versión NO declarada» aunque se la declararon');
  });

  test('y SIGUE denunciándose si nadie se la declara — eso no se toca', () => {
    // El hueco declarado es la parte buena del diseño: lo que fallaba era el
    // llamador. Si esto se pusiera silencioso, el defecto volvería invisible.
    const sin = informeHtml({ linea: LINEA, meta: {} });
    assert.match(sin, /versión NO declarada/,
      'el informe sin versión pasó a callar el hueco: eso es peor que el bug original');
  });

  test('⚠️ el GERENCIAL la imprime — no basta con recibirla', () => {
    const html = gerencialHtml({ linea: LINEA, meta: { versionNucleo: VERSION } });
    assert.match(html, new RegExp(`v${VERSION}`),
      'el gerencial recibe la versión y no la publica: quien lo lee no puede reproducirlo');
  });

  test('el gerencial sin versión lo DICE, no lo calla', () => {
    assert.match(gerencialHtml({ linea: LINEA, meta: {} }), /NO declarada/);
  });

  test('⚠️ el ACTA dice CUÁL es ese «mismo motor» que promete', () => {
    const html = actaHtml({
      linea: LINEA, versionNucleo: VERSION,
      cifras: [{ que: 'longitud', antes: '1', despues: '2', cambia: true }],
    });
    assert.match(html, /mismo motor/, 'desapareció la promesa');
    assert.match(html, new RegExp(`v${VERSION}`), 'promete reproducibilidad y no dice con qué');
  });

  test('el acta sin versión avisa de que sus cifras no son reproducibles', () => {
    const html = actaHtml({
      linea: LINEA,
      cifras: [{ que: 'longitud', antes: '1', despues: '2', cambia: true }],
    });
    assert.match(html, /no son reproducibles|NO se declaró/);
  });
});

describe('quien manda a generar declara la versión', () => {
  // El defecto NUNCA estuvo en `exportar/`: estuvo en el llamador. Sin esta
  // prueba, el generador puede saber imprimirlo y el papel salir mudo igual.
  const leer = (p) => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf-8');

  test('la pestaña Exportar mete `versionNucleo` en la metadata', () => {
    assert.match(leer('web/src/componentes/Exportar.tsx'), /versionNucleo: nucleoPkg\.version/);
  });

  test('la pantalla de Cargar se la pone al acta', () => {
    assert.match(leer('web/src/componentes/Cargar.tsx'), /versionNucleo: nucleoPkg\.version/);
  });
});
