// ============================================================================
// tests/tope-de-tiro.test.js — UN tope de tiro, no dos
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. El tope de tiro tenía DOS dueños y nadie los comparaba:
//
//   · `nucleo/umbrales.js` lo leía de la HIPÓTESIS —bien—, cayendo al 50 %
//     clásico si no está declarado, y publicando de dónde salió.
//   · las pantallas (Fundamentos, Mecánico, Viento) leían un `0,5` escrito en
//     código.
//
// Hoy cuadraba **por suerte**: nadie había declarado un tope propio todavía. El
// día que se declarara, la pestaña Umbrales habría evaluado contra el valor
// declarado mientras Fundamentos y Mecánico seguían con el 50 — dos veredictos
// distintos sobre el mismo tramo, en la misma línea, el mismo día. Y en la misma
// tarjeta de Fundamentos la FIGURA ya dibujaba el tope declarado mientras el
// TEXTO decía 50 %: dibujo y letra en desacuerdo (`99 §ADR-051`).
//
// Es un tope de DISEÑO: una decisión de ingeniería fechada que viaja en la
// hipótesis y se congela al firmar, no una constante de programa.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { tiroMaximoAdmisible, topeDeTiro, TOPE_TIRO_CLASICO_PCT } from '../nucleo/mecanica.js';
import { evaluarUmbrales } from '../nucleo/umbrales.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => readFileSync(join(RAIZ, p), 'utf-8');

const RTS = 8528;

describe('de dónde sale el tope, y que se diga', () => {
  test('sin declarar: el 50 % clásico, y se llama por su nombre', () => {
    assert.equal(TOPE_TIRO_CLASICO_PCT, 50);
    assert.deepEqual(topeDeTiro({}), { pct: 50, procedencia: 'criterio_clasico' });
    assert.deepEqual(topeDeTiro(undefined), { pct: 50, procedencia: 'criterio_clasico' });
  });

  test('declarado en la hipótesis: manda el declarado, y se dice', () => {
    assert.deepEqual(topeDeTiro({ tiroAdmisible_pct: 25 }),
      { pct: 25, procedencia: 'hipotesis_declarada' });
  });

  test('un valor que no es número no se cuela como tope', () => {
    for (const malo of [null, '25', NaN, undefined]) {
      assert.equal(topeDeTiro({ tiroAdmisible_pct: malo }).pct, 50,
        'un tope que no es un número tiene que caer al clásico, no producir NaN kgf');
    }
  });

  test('la firma sigue siendo ADITIVA: con un solo argumento hace lo de siempre', () => {
    assert.equal(tiroMaximoAdmisible(RTS), 0.5 * RTS);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el tope de la PANTALLA y el de la tabla de umbrales son el mismo', () => {
  // El guardián de verdad: se declara un tope propio —el caso que hoy no se da y
  // que rompería la coherencia— y se exige que las dos piezas usen el MISMO
  // número. Se comparan cifras, no textos.
  const escenario = (hipotesis) => ({
    conductor: { rts_kgf: RTS, masaLineal_kg_m: 1.0 },
    hipotesis, tramos: [],
  });
  const filaDelTope = (e) => evaluarUmbrales(e).find((f) => f.id === 'tiro_maximo_pct_rts');

  for (const pct of [25, 40, 50, 60]) {
    test(`con un tope declarado del ${pct} %, las dos piezas dicen lo mismo`, () => {
      const e = escenario({ tiroAdmisible_pct: pct, tempMax_C: 50, tempMin_C: 10 });
      const fila = filaDelTope(e);
      assert.ok(fila, 'no está la fila del tope de tiro en la tabla de umbrales');
      assert.equal(fila.umbral, pct, `la tabla de umbrales no usa el ${pct} % declarado`);
      assert.equal(topeDeTiro(e.hipotesis).pct, fila.umbral,
        'el motor y la tabla discrepan sobre qué tope rige');
      assert.equal(tiroMaximoAdmisible(RTS, e.hipotesis), (RTS * pct) / 100,
        `la pantalla no usa el ${pct} % declarado: volverían a salir dos veredictos`);
    });
  }

  test('sin declarar, las dos caen al mismo clásico y lo dicen igual', () => {
    const e = escenario({ tempMax_C: 50, tempMin_C: 10 });
    const fila = filaDelTope(e);
    assert.equal(fila.umbral, TOPE_TIRO_CLASICO_PCT);
    assert.equal(topeDeTiro(e.hipotesis).pct, fila.umbral);
    assert.match(fila.criterio, /criterio_clasico/,
      'la fila tiene que decir que el 50 es una costumbre heredada, no una norma');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('ninguna pantalla se guarda su propio tope', () => {
  const fuentes = ['web/src/vistas/tramos.ts', 'web/src/vistas/vientoDatos.ts',
                   'web/src/componentes/Fundamentos.tsx'];

  test('el tope se PIDE con la hipótesis, no se llama sin ella', () => {
    for (const f of fuentes) {
      const txt = leer(f);
      const sueltas = [...txt.matchAll(/tiroMaximoAdmisible\(([^)]*)\)/g)]
        .map((m) => m[1]).filter((args) => !args.includes(','));
      assert.equal(sueltas.length, 0,
        `${f} pide el tope sin la hipótesis: se quedaría con el 50 % aunque se declare otro`);
    }
  });

  test('ni un «50 %» escrito a mano en el texto que el ingeniero lee', () => {
    for (const f of fuentes) {
      assert.ok(!/\(50 % de la carga de rotura\)|tope adoptado \(50 %/.test(leer(f)),
        `${f} imprime el 50 % como si fuera fijo: el día que se declare otro, mentirá`);
    }
  });

  test('la copia dormida de la tabla de tramos no volvió', () => {
    // Tenía su PROPIO tope y no la llamaba nadie: quien corrigiera un texto podía
    // hacerlo en la copia equivocada y creer que quedó hecho (`30 · L-28`).
    assert.ok(!/export function dibujarTramos/.test(leer('web/src/vistas/tramos.ts')));
  });
});
