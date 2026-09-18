// ============================================================================
// tests/geodesia.test.js — lo que se puede y lo que NO se puede saber de un
// levantamiento hecho con GPS de mano
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. Un levantamiento de una línea SIN torres registradas se publica
// con tres reservas que no son pintura, son criterio: de cuánto puede estar
// errado cada quiebre, qué vano es tan corto que ni siquiera se sabe hacia dónde
// va, y qué vano es tan largo que huele a torre que la cuadrilla no levantó.
// Esas tres reglas viven en `nucleo/geodesia.js` y aquí se prueban, para que
// ninguna pantalla se las vuelva a recalcular por su cuenta.
//
// ⚠️ LOS VALORES ESPERADOS NO SALEN DEL CÓDIGO: eso sería circular. Salen de
// triángulos que se resuelven a mano —el 3-4-5 y el de 30°— y de medianas que se
// cuentan con los dedos. La cuenta va escrita en el comentario de cada prueba.
//
// ⚠️ Nombres y cifras INVENTADOS (`/SubA`, `LX-1`, `TR-9`): este repositorio es
// PÚBLICO y el levantamiento real es de cliente (`33 · L-07`). La comprobación
// contra el levantamiento real se hace fuera del repositorio.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  margenDeAzimut,
  margenDeDeflexion,
  vanosConPintaDeTorreSinLevantar,
  UMBRAL_TORRE_SIN_LEVANTAR_VECES_LA_MEDIANA,
} from '../nucleo/geodesia.js';

const cerca = (real, esperado, tol, msg) =>
  assert.ok(Math.abs(real - esperado) <= tol,
    `${msg}: ${real} vs ${esperado} esperado (tolerancia ${tol})`);

// Los dos ángulos que se resuelven a mano y con los que se calibra todo:
//   · triángulo 3-4-5 → atan(3/4) = 36,869 897 645 844 02°
//   · triángulo de 30° → atan(1/√3) = 30° exactos, porque tan 30° = 1/√3
const ATAN_3_4 = 36.86989764584402;

// ════════════════════════════════════════════════════════════════════════════
describe('geodesia — ① margen de la dirección de un vano', () => {

  test('triángulo 3-4-5: con p = 3 m y un vano de 8 m el margen es atan(6/8) = 36,8699°', () => {
    // 2·p = 6 m de corrimiento lateral sobre una base de 8 m → tan = 6/8 = 3/4.
    // Es el ángulo del triángulo rectángulo de catetos 3 y 4: 36,869 897 645 844 02°.
    const r = margenDeAzimut(8, 3);
    assert.equal(r.determinado, true);
    cerca(r.margen_grados, ATAN_3_4, 1e-9, 'margen del 3-4-5');
    assert.equal(r.motivo, null);
  });

  test('30° exactos: con p = 3 m y un vano de 6·√3 m el margen es atan(1/√3) = 30°', () => {
    // 2·p / d = 6 / (6·√3) = 1/√3, y tan 30° = 1/√3 → 30° clavados.
    const r = margenDeAzimut(6 * Math.sqrt(3), 3);
    assert.equal(r.determinado, true);
    cerca(r.margen_grados, 30, 1e-9, 'margen de 30°');
  });

  test('un GPS sin error (p = 0) no deja margen: 0°', () => {
    const r = margenDeAzimut(120, 0);
    assert.equal(r.determinado, true);
    assert.equal(r.margen_grados, 0);
  });

  test('la precisión del levantamiento vuelve tal cual, para que la pantalla la escriba', () => {
    const r = margenDeAzimut(8, 3);
    assert.equal(r.longitudVano_m, 8);
    assert.equal(r.precision_m, 3);
  });

  // ── EL LÍMITE DECLARADO: d > 2·p ──────────────────────────────────────────
  test('con el vano justo igual a 2·p la dirección YA no se puede saber', () => {
    // p = 5 → los dos círculos de error miden 5 m de radio y el vano 10 m: se
    // tocan. El límite es estricto (d > 2p), así que el empate cae del lado malo.
    const r = margenDeAzimut(10, 5);
    assert.equal(r.determinado, false);
    assert.equal(r.margen_grados, null);
    assert.match(r.motivo, /no se puede saber/);
  });

  test('un vano MÁS CORTO que 2·p devuelve desconocido, NO un margen grande', () => {
    // Es el punto entero del hallazgo: contestar «±47°» aquí sería inventar una
    // cifra. p = 8 m y 14,9 m entre los dos puntos → no hay dirección que declarar.
    const r = margenDeAzimut(14.9, 8);
    assert.equal(r.determinado, false);
    assert.equal(r.margen_grados, null);
    assert.ok(typeof r.motivo === 'string' && r.motivo.length > 0, 'tiene que decir por qué');
  });

  test('dos puntos en el mismo sitio (d = 0) no tienen dirección', () => {
    assert.equal(margenDeAzimut(0, 3).determinado, false);
    assert.equal(margenDeAzimut(0, 0).determinado, false);
  });

  test('entradas que no son números, o negativas, salen como desconocido y lo dicen', () => {
    for (const [d, p] of [[NaN, 3], [Infinity, 3], [null, 3], ['120', 3], [120, NaN], [120, -1], [-120, 3], [undefined, undefined]]) {
      const r = margenDeAzimut(d, p);
      assert.equal(r.determinado, false, `${d} / ${p} tendría que ser desconocido`);
      assert.equal(r.margen_grados, null);
      assert.ok(r.motivo, 'sin motivo no sirve de nada');
    }
  });

  // ── PROPIEDADES QUE LA FÓRMULA TIENE QUE CUMPLIR SÍ O SÍ ──────────────────
  test('cuanto más largo el vano, menos margen; cuanto peor el GPS, más margen', () => {
    const p = 4;
    for (let d = 20; d < 400; d += 17) {
      assert.ok(margenDeAzimut(d + 17, p).margen_grados < margenDeAzimut(d, p).margen_grados,
        `el vano de ${d + 17} m tendría que tener menos margen que el de ${d} m`);
    }
    for (let q = 1; q < 20; q += 1) {
      assert.ok(margenDeAzimut(200, q + 1).margen_grados > margenDeAzimut(200, q).margen_grados,
        `±${q + 1} m tendría que dar más margen que ±${q} m`);
    }
  });

  test('LIMITACIÓN DECLARADA: la fórmula nunca pasa de 45°, y pegada al límite da 45°', () => {
    // atan(2p/d) < atan(1) = 45° para todo d > 2p. O sea: el margen de un vano
    // que apenas supera 2·p sale 45°, cuando la verdad es que su dirección es casi
    // desconocida (el peor caso exacto, asin(2p/d), tiende a 90° ahí). Está escrito
    // en el comentario de la función y se fija aquí para que nadie lo "arregle"
    // en silencio: el que protege de esa zona es el LÍMITE, no la fórmula.
    cerca(margenDeAzimut(10 + 1e-9, 5).margen_grados, 45, 1e-6, 'pegado al límite');
    for (const d of [10.5, 12, 30, 100, 1000]) {
      assert.ok(margenDeAzimut(d, 5).margen_grados < 45, `${d} m no puede pasar de 45°`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('geodesia — ② margen del quiebre', () => {

  test('se SUMAN los dos vanos que llegan al punto: 36,8699° + 30° = 66,8699°', () => {
    // Vano que entra: 8 m con p = 3 → 36,869 897 645 844 02° (triángulo 3-4-5).
    // Vano que sale: 6·√3 m con p = 3 → 30° exactos.
    // Suma a mano = 66,869 897 645 844 02°.
    const r = margenDeDeflexion(8, 6 * Math.sqrt(3), 3);
    assert.equal(r.determinado, true);
    cerca(r.margen_grados, ATAN_3_4 + 30, 1e-9, 'margen del quiebre');
    assert.equal(r.vanoIndeterminado, null);
  });

  test('da igual el orden de los dos vanos', () => {
    const a = margenDeDeflexion(90, 250, 6).margen_grados;
    const b = margenDeDeflexion(250, 90, 6).margen_grados;
    cerca(a, b, 1e-12, 'simetría');
  });

  test('el margen del quiebre es el de un vano más el del otro, uno a uno', () => {
    const p = 7;
    for (const [a, b] of [[60, 140], [200, 200], [95.5, 310.25]]) {
      cerca(margenDeDeflexion(a, b, p).margen_grados,
        margenDeAzimut(a, p).margen_grados + margenDeAzimut(b, p).margen_grados,
        1e-12, `${a} / ${b}`);
    }
  });

  test('si el vano que SALE es demasiado corto, el quiebre no es fiable y se dice cuál', () => {
    // p = 3 → 2·p = 6 m. El vano que sale mide 5 m: por debajo del límite.
    const r = margenDeDeflexion(8, 5, 3);
    assert.equal(r.determinado, false);
    assert.equal(r.margen_grados, null);
    assert.equal(r.vanoIndeterminado, 'sale');
    assert.match(r.motivo, /El quiebre de ese punto se apoya en esa dirección/);
  });

  test('si el que ENTRA es el corto, se nombra ese', () => {
    const r = margenDeDeflexion(5, 8, 3);
    assert.equal(r.determinado, false);
    assert.equal(r.vanoIndeterminado, 'entra');
  });

  test('si los dos son cortos, se dice «ambos» y no se repite la frase dos veces', () => {
    const r = margenDeDeflexion(5, 4, 3);
    assert.equal(r.vanoIndeterminado, 'ambos');
    const veces = r.motivo.split('no se puede saber').length - 1;
    assert.equal(veces, 1, 'el motivo no puede venir duplicado');
  });

  test('un quiebre construido sobre un vano desconocido NO devuelve «mucho margen»', () => {
    // Es la diferencia que pidió el Ingeniero: 93° ± desconocido no es 93° ± 52°.
    const r = margenDeDeflexion(14.9, 173.7, 8);
    assert.equal(r.margen_grados, null);
    assert.equal(r.determinado, false);
  });

  test('el margen del quiebre nunca pasa de 90° (dos veces el tope de cada vano)', () => {
    for (const [a, b] of [[16.1, 16.1], [30, 40], [1000, 1000]]) {
      assert.ok(margenDeDeflexion(a, b, 8).margen_grados < 90, `${a} / ${b}`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('geodesia — ③ vano con pinta de torre sin levantar', () => {

  test('el umbral está DECLARADO y vale 1,40 veces la mediana', () => {
    // Si alguien lo mueve, que sea a propósito y con esta prueba en la mano.
    assert.equal(UMBRAL_TORRE_SIN_LEVANTAR_VECES_LA_MEDIANA, 1.4);
  });

  test('levantamiento inventado de /SubA · LX-1: señala los dos vanos largos y solo esos', () => {
    // Nueve vanos: seis de 100 m, más 139, 141 y 200.
    // Ordenados: 100 100 100 100 100 100 139 141 200 → el de en medio (5º de 9)
    // es 100 → MEDIANA = 100 m. Umbral 1,40 × 100 = 140 m.
    //   139 / 100 = 1,39  → NO llega
    //   141 / 100 = 1,41  → sí
    //   200 / 100 = 2,00  → sí
    const r = vanosConPintaDeTorreSinLevantar([100, 100, 100, 100, 100, 141, 139, 200, 100]);
    assert.equal(r.mediana_m, 100);
    assert.equal(r.umbral, 1.4);
    assert.equal(r.umbral_m, 140);
    assert.deepEqual(r.sospechosos.map((v) => v.indice), [5, 7]);
    assert.deepEqual(r.sospechosos.map((v) => v.longitud_m), [141, 200]);
    cerca(r.vanos[6].vecesLaMediana, 1.39, 1e-12, 'el de 139 m');
    assert.equal(r.vanos[6].sospechoso, false);
  });

  test('justo EN el umbral se señala: 140 m sobre una mediana de 100 m es 1,40', () => {
    // El empate cae del lado de avisar: una torre de menos es más cara que un
    // aviso de más. 140/100 = 1,4 exacto también en coma flotante (comprobado).
    const r = vanosConPintaDeTorreSinLevantar([100, 100, 140, 100, 100]);
    assert.equal(r.mediana_m, 100);
    cerca(r.vanos[2].vecesLaMediana, 1.4, 1e-12, '140 sobre 100');
    assert.equal(r.vanos[2].sospechoso, true);
  });

  test('por eso se mide contra la MEDIANA y no contra el promedio', () => {
    // Cinco vanos: 100 100 100 100 150.
    //   mediana = 100 → 150/100 = 1,50 ≥ 1,40 → se señala.
    //   promedio = 550/5 = 110 → 150/110 = 1,36 < 1,40 → se habría escapado.
    // Un vano largo arrastra el promedio hacia arriba y se tapa a sí mismo.
    const vanos = [100, 100, 100, 100, 150];
    const r = vanosConPintaDeTorreSinLevantar(vanos);
    assert.equal(r.mediana_m, 100);
    assert.deepEqual(r.sospechosos.map((v) => v.indice), [4]);
    const promedio = vanos.reduce((s, x) => s + x, 0) / vanos.length;
    assert.equal(promedio, 110);
    assert.ok(150 / promedio < 1.4, 'contra el promedio se escaparía');
  });

  test('con número PAR de vanos la mediana es el promedio de los dos de en medio', () => {
    // Ordenados: 90 100 100 110 → (100 + 100) / 2 = 100 m.
    const r = vanosConPintaDeTorreSinLevantar([90, 110, 100, 100]);
    assert.equal(r.mediana_m, 100);
    assert.deepEqual(r.sospechosos, []);
  });

  test('un hueco de placa de verdad se ve: 1,49 y 1,87 veces la mediana pasan el umbral', () => {
    // Las dos proporciones que trae el levantamiento real (las cifras de metros NO
    // se copian aquí: el repositorio es público). Sobre una mediana inventada de
    // 100 m serían vanos de 149 m y 187 m.
    const r = vanosConPintaDeTorreSinLevantar([100, 100, 149, 100, 100, 187, 100]);
    assert.equal(r.mediana_m, 100);
    assert.deepEqual(r.sospechosos.map((v) => v.indice), [2, 5]);
    // …y el vano más largo SIN hueco de placa de ese mismo levantamiento, 1,34, no.
    const s = vanosConPintaDeTorreSinLevantar([100, 100, 134, 100, 100]);
    assert.deepEqual(s.sospechosos, []);
  });

  test('los vanos que no son números no cuentan, pero NO corren el índice de los demás', () => {
    // El vano nº 2 (índice 2) viene roto; el largo sigue siendo el índice 4.
    const r = vanosConPintaDeTorreSinLevantar([100, 100, NaN, 100, 250, 100, 100]);
    assert.equal(r.mediana_m, 100);
    assert.equal(r.vanos.length, 7, 'un sitio por cada vano que entró');
    assert.equal(r.vanos[2].longitud_m, null);
    assert.equal(r.vanos[2].vecesLaMediana, null);
    assert.equal(r.vanos[2].sospechoso, false);
    assert.deepEqual(r.sospechosos.map((v) => v.indice), [4]);
  });

  test('sin vanos utilizables no se inventa una mediana', () => {
    for (const entrada of [[], null, undefined, [0, -5, NaN, 'x']]) {
      const r = vanosConPintaDeTorreSinLevantar(entrada);
      assert.equal(r.mediana_m, null);
      assert.equal(r.umbral_m, null);
      assert.deepEqual(r.sospechosos, []);
    }
  });

  test('se puede pedir otro umbral, y uno que no sea número positivo no cuela', () => {
    const vanos = [100, 100, 130, 100, 100];
    assert.deepEqual(vanosConPintaDeTorreSinLevantar(vanos, { umbral: 1.2 }).sospechosos.map((v) => v.indice), [2]);
    assert.deepEqual(vanosConPintaDeTorreSinLevantar(vanos, { umbral: 1.4 }).sospechosos, []);
    for (const malo of [0, -1, NaN, 'dos', null]) {
      assert.equal(vanosConPintaDeTorreSinLevantar(vanos, { umbral: malo }).umbral, 1.4,
        `con umbral ${malo} hay que caer en el declarado`);
    }
    assert.equal(vanosConPintaDeTorreSinLevantar(vanos, null).umbral, 1.4);
  });

  test('no toca la lista que le dan', () => {
    const vanos = [100, 100, 250, 100];
    const copia = [...vanos];
    vanosConPintaDeTorreSinLevantar(vanos);
    assert.deepEqual(vanos, copia);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('geodesia — las tres reglas juntas, como las usaría la pantalla', () => {

  test('un levantamiento inventado de TR-9 sale con sus tres reservas', () => {
    // Levantamiento de juguete, ±5 m de precisión, siete puntos y seis vanos:
    //   T1→T2 = 8 m   (8 ≤ 2·5 = 10 → dirección DESCONOCIDA)
    //   T2→T3 = 100 m
    //   T3→T4 = 100 m
    //   T4→T5 = 100 m
    //   T5→T6 = 100 m
    //   T6→T7 = 180 m (ordenados: 8 100 100 100 100 180 → mediana (100+100)/2 = 100;
    //                  180/100 = 1,80 ≥ 1,40 → con pinta de torre sin levantar)
    const p = 5;
    const vanos = [8, 100, 100, 100, 100, 180];

    // ① y ② — el quiebre del punto T2 se apoya en el vano de 8 m: no es fiable.
    const quiebreT2 = margenDeDeflexion(vanos[0], vanos[1], p);
    assert.equal(quiebreT2.determinado, false);
    assert.equal(quiebreT2.vanoIndeterminado, 'entra');

    // …y el del punto T3, que ya no lo toca, sí tiene margen: dos vanos de 100 m
    // con 2·p = 10 → atan(0,1) = 5,710 593 137 499 64° cada uno → 11,421 186 27°.
    const quiebreT3 = margenDeDeflexion(vanos[1], vanos[2], p);
    assert.equal(quiebreT3.determinado, true);
    cerca(quiebreT3.margen_grados, 2 * Math.atan(0.1) * (180 / Math.PI), 1e-12, 'dos vanos de 100 m');
    cerca(quiebreT3.margen_grados, 11.42118627, 1e-7, 'la cuenta a mano');

    // ③ — el vano largo, y solo ese.
    const largos = vanosConPintaDeTorreSinLevantar(vanos);
    assert.equal(largos.mediana_m, 100);
    assert.deepEqual(largos.sospechosos.map((v) => v.indice), [5]);
    cerca(largos.sospechosos[0].vecesLaMediana, 1.8, 1e-12, '180 sobre 100');

    // El vano corto NO es sospechoso de esconder una torre: es lo contrario.
    assert.equal(largos.vanos[0].sospechoso, false);
  });
});
