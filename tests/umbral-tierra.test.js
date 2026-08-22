// ============================================================================
// tests/umbral-tierra.test.js — UN tope de puesta a tierra, no tres
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. El tope de resistencia de puesta a tierra tenía TRES versiones
// y ninguna miraba a las otras (`99 §ADR-052`):
//
//   · `nucleo/umbrales.js` lo leía de la HIPÓTESIS —bien— pero de un campo,
//     `resistenciaTierraMax_ohm`, que el MOLDE no admitía: la validación de
//     lectura lo descartaba en silencio, así que la rama «declarado» era
//     INALCANZABLE y el informe firmable decía «adoptado por defecto» pasara lo
//     que pasara.
//   · `nucleo/coherencia.js` caía a un `10` escrito en la firma de la función.
//   · la ficha del apoyo comparaba contra un `UMBRAL_TIERRA_OHM = 10` propio.
//
// El día que el Ingeniero declarara 25 Ω, la tabla de Umbrales habría juzgado
// con 25 y la ficha del MISMO apoyo con 10: dos veredictos distintos sobre la
// misma estructura el mismo día. Es el fallo que §ADR-051 cerró para el tope de
// tiro, vivo en la pieza hermana — «arreglado donde se veía, vivo en la pieza
// hermana» (`34 · L-65`).
//
// Es un tope de DISEÑO: una decisión de ingeniería fechada que viaja en la
// hipótesis y se congela al firmar, no una constante de programa.
//
// Y de regalo, el guardián que faltaba: la fila de umbrales publica `procedencia
// Umbral` como CAMPO desde §ADR-013, y la lista blanca de `fila()` se lo comía.
// Las pruebas del informe no lo veían porque construían el indicador A MANO con
// el campo ya puesto — un fixture que miente. Aquí se recorre la tabla REAL.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { umbralPuestaTierra, avisoPuestaTierra, UMBRAL_TIERRA_CRITERIO_OHM }
  from '../nucleo/coherencia.js';
import { evaluarUmbrales } from '../nucleo/umbrales.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => readFileSync(join(RAIZ, p), 'utf-8');

describe('de dónde sale el tope de tierra, y que se diga', () => {
  test('sin declarar: los 10 Ω de siempre, llamados por su nombre', () => {
    assert.equal(UMBRAL_TIERRA_CRITERIO_OHM, 10);
    assert.deepEqual(umbralPuestaTierra({}), { ohm: 10, procedencia: 'criterio_diseno' });
    assert.deepEqual(umbralPuestaTierra(undefined), { ohm: 10, procedencia: 'criterio_diseno' });
  });

  test('declarado en la hipótesis: manda el declarado, y se dice', () => {
    assert.deepEqual(umbralPuestaTierra({ resistenciaTierraMax_ohm: 25 }),
      { ohm: 25, procedencia: 'hipotesis_declarada' });
  });

  test('lo que no es un tope no se cuela como tope', () => {
    // El 0 es el peligroso: `r / umbral` publicaría «∞× el criterio» en un aviso
    // crítico, y un aviso que no se puede leer es un aviso que no existe.
    for (const malo of [0, -5, null, '25', NaN, undefined]) {
      assert.equal(umbralPuestaTierra({ resistenciaTierraMax_ohm: malo }).ohm, 10,
        `un tope de ${String(malo)} Ω tiene que caer al criterio de diseño`);
    }
  });

  test('la firma de `avisoPuestaTierra` sigue siendo ADITIVA', () => {
    // Con un solo argumento hace lo de siempre: quien la llame sin umbral no se
    // rompe. Lo que NO puede es quedarse ahí — ver el guardián de pantallas.
    const apoyos = [{ nombre: 'E-02', puestaTierra: { resistencia_ohm: 18 } }];
    assert.equal(avisoPuestaTierra(apoyos).length, 1, 'el defecto sigue siendo 10 Ω');
    assert.equal(avisoPuestaTierra(apoyos, 25).length, 0, 'con 25 Ω declarados, 18 Ω pasa');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el tope de la FICHA y el de la tabla de umbrales son el mismo', () => {
  // El guardián de verdad: se declara un tope propio —el caso que hoy no se da y
  // que rompería la coherencia— y se exige que las dos piezas usen el MISMO
  // número. Se comparan cifras, no textos.
  const escenario = (hipotesis) => ({
    tramos: [],
    conductor: { rts: 8528, w: 1 },
    hipotesis,
    apoyos: [{ nombreCampo: 'A-1', puestaTierra: { resistencia_ohm: 18 } }],
  });
  const filaDeTierra = (e) => evaluarUmbrales(e).find((f) => f.id === 'resistencia_puesta_tierra');

  for (const ohm of [5, 10, 20, 25]) {
    test(`con un tope declarado de ${ohm} Ω, las dos piezas dicen lo mismo`, () => {
      const e = escenario({ resistenciaTierraMax_ohm: ohm });
      const fila = filaDeTierra(e);
      assert.ok(fila, 'no está la fila de puesta a tierra en la tabla de umbrales');
      assert.equal(fila.umbral, ohm, `la tabla de umbrales no usa los ${ohm} Ω declarados`);
      assert.equal(umbralPuestaTierra(e.hipotesis).ohm, fila.umbral,
        'el dueño del número y la tabla discrepan sobre qué tope rige');

      // Y el veredicto que sale de ahí: 18 Ω pasa con 20 y 25, no con 5 ni 10.
      assert.equal(fila.estado, ohm >= 18 ? 'cumple' : 'revisar');
      const avisos = avisoPuestaTierra(
        [{ nombre: 'A-1', puestaTierra: { resistencia_ohm: 18 } }],
        umbralPuestaTierra(e.hipotesis).ohm,
      );
      assert.equal(avisos.length === 0, fila.estado === 'cumple',
        'la ficha del apoyo y la tabla de la línea dan veredictos distintos del mismo apoyo');
    });
  }

  test('sin declarar, las dos caen al mismo criterio y lo dicen igual', () => {
    const fila = filaDeTierra(escenario({}));
    assert.equal(fila.umbral, UMBRAL_TIERRA_CRITERIO_OHM);
    assert.equal(fila.procedenciaUmbral, 'criterio_diseno');
    assert.match(fila.criterio, /adoptado por defecto/,
      'los 10 Ω son una costumbre de diseño y la fila tiene que decirlo');
    assert.equal(fila.fuente, 'criterio de diseño (sin norma)',
      'la fuente no puede decir «RETIE» en la misma celda que avisa de que el RETIE no está verificado');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('ninguna pantalla se guarda su propio tope de tierra', () => {
  const FICHA = 'web/src/vistas/criteriosApoyo.ts';

  test('la ficha del apoyo NO tiene su propia constante de 10 Ω', () => {
    const txt = leer(FICHA);
    assert.ok(!/const UMBRAL_TIERRA_OHM\s*=/.test(txt),
      `${FICHA} volvió a guardarse su propio tope: el día que se declare otro, juzgará distinto que Umbrales`);
  });

  test('la ficha PIDE el tope al núcleo, con lo que declare la hipótesis', () => {
    const txt = leer(FICHA);
    assert.match(txt, /umbralPuestaTierra\(/,
      'la ficha tiene que pedirle el tope al dueño único, no decidirlo');
    const sueltas = [...txt.matchAll(/avisoPuestaTierra\(\s*\[[^\]]*\]\s*,?\s*\)/g)];
    assert.equal(sueltas.length, 0,
      `${FICHA} llama al núcleo sin umbral: se quedaría con los 10 Ω aunque se declare otro`);
  });

  test('la pantalla que monta la ficha le pasa el tope de la hipótesis', () => {
    assert.match(leer('web/src/componentes/Fichas.tsx'),
      /resistenciaTierraMax_ohm:\s*hipotesis\?\.resistenciaTierraMax_ohm/,
      'sin esto la ficha recibe siempre «no declarado» y el tope declarado no llega a la pantalla');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('la procedencia del umbral LLEGA al informe, no se queda en el núcleo', () => {
  // Se recorre la tabla REAL. Las pruebas del informe construyen el indicador a
  // mano, con `procedenciaUmbral` ya puesto, y por eso no vieron nunca que la
  // lista blanca de `fila()` se lo comía: el informe firmable llamaba «adoptado
  // por defecto» a un tope declarado por el Ingeniero (`30 · L-33`).
  const tabla = (hipotesis) => evaluarUmbrales({
    tramos: [], conductor: { rts: 8528, w: 1 }, hipotesis, apoyos: [],
  });

  test('el tope de TIRO declarado viaja con su procedencia', () => {
    const f = tabla({ tiroAdmisible_pct: 25 }).find((i) => i.id === 'tiro_maximo_pct_rts');
    assert.equal(f.umbral, 25);
    assert.equal(f.procedenciaUmbral, 'hipotesis_declarada',
      'sin este campo el informe firmable dice «adoptado por defecto» de un tope que declaró el Ingeniero');
  });

  test('el tope de TIERRA declarado viaja con su procedencia', () => {
    const f = tabla({ resistenciaTierraMax_ohm: 25 }).find((i) => i.id === 'resistencia_puesta_tierra');
    assert.equal(f.umbral, 25);
    assert.equal(f.procedenciaUmbral, 'hipotesis_declarada');
  });

  test('sin declarar, los dos dicen que el número lo puso el sistema', () => {
    const t = tabla({});
    assert.equal(t.find((i) => i.id === 'tiro_maximo_pct_rts').procedenciaUmbral, 'criterio_clasico');
    assert.equal(t.find((i) => i.id === 'resistencia_puesta_tierra').procedenciaUmbral, 'criterio_diseno');
  });
});
