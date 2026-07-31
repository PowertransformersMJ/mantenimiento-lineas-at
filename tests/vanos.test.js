// ============================================================================
// tests/vanos.test.js — pruebas del detalle vano a vano y del control parábola
// ----------------------------------------------------------------------------
// Los valores esperados NO salen de ejecutar el propio código: eso sería
// circular y pasaría en verde aunque la fórmula estuviera mal. Salen de:
//
//   (a) DESARROLLO EN SERIE hecho a mano. cosh(x) = 1 + x²/2 + x⁴/24 + x⁶/720…
//       y  sinh(x) = x + x³/6 + x⁵/120…  Sumando esos términos con una
//       calculadora se obtiene la flecha y la longitud sin usar cosh() ni
//       sinh(), que es justo lo que el código sí usa. Vía independiente.
//   (b) IDENTIDADES FÍSICAS que el resultado debe cumplir sí o sí (el conductor
//       colgado no puede medir menos que la recta entre sus apoyos).
//   (c) UN CASO REDONDO verificable de cabeza: con C = 1 000 m y a = 200 m la
//       flecha parabólica es 200²/(8·1000) = 5 m exactos.
//
// ⚠️ Todos los datos son SINTÉTICOS: vanos redondos, conductor de w = 1 kg/m.
// Ninguna coordenada, cota ni nombre de estructura real entra en este repo.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { detalleVanos, controlParabola, resumenConductor } from '../nucleo/vanos.js';

const cerca = (real, esperado, tol, msg) =>
  assert.ok(Math.abs(real - esperado) <= tol,
    `${msg}: ${real} vs ${esperado} esperado (tolerancia ${tol})`);

// ── Valores calculados A MANO, fuera del código ──────────────────────────────
//
// Caso redondo: C = 1 000 m, a = 200 m  →  x = a/2C = 0,1
//   flecha  = C·(cosh x − 1) = 1000·(0,005 + 4,166666667e−6 + 1,388888889e−9 + …)
//   longitud= 2C·sinh x      = 2000·(0,1 + 1,666666667e−4 + 8,333333e−8 + …)
const FLECHA_C1000_A200 = 5.004168055804;    // m
const LONGITUD_C1000_A200 = 200.333500039683; // m
// Error de la parábola en ese caso: (5 − 5,004168055804) / 5,004168055804
const ERROR_C1000_A200_PCT = -0.0832917;      // %

// ════════════════════════════════════════════════════════════════════════════
describe('controlParabola — el argumento para el revisor externo', () => {

  test('caso redondo verificable a mano: C = 1 000 m, a = 200 m', () => {
    const r = controlParabola(200, 1000);
    // 200² / (8 · 1000) = 40 000 / 8 000 = 5 m EXACTOS. Sin decimales, sin
    // tolerancia: si esto falla, la fórmula de la parábola está mal.
    assert.equal(r.flechaParabola_m, 5, 'flecha parabólica');
    cerca(r.flechaCatenaria_m, FLECHA_C1000_A200, 1e-9, 'flecha catenaria (serie a mano)');
    cerca(r.error_pct, ERROR_C1000_A200_PCT, 1e-6, 'error relativo');
    assert.equal(r.aceptable, true);
  });

  test('la parábola SIEMPRE se queda corta: el error es negativo, nunca positivo', () => {
    // No es un detalle de signo: significa que la simplificación cree que el
    // conductor cuelga MENOS de lo que cuelga, o sea que se equivoca del lado
    // inseguro para la distancia al terreno. Debe ser así siempre.
    for (const [a, C] of [[100, 5000], [200, 1000], [340, 2300], [600, 900], [2000, 1000]]) {
      const r = controlParabola(a, C);
      assert.ok(r.flechaParabola_m < r.flechaCatenaria_m,
        `a=${a}, C=${C}: la parábola debe dar flecha menor que la catenaria`);
      assert.ok(r.error_pct < 0, `a=${a}, C=${C}: el error debe salir negativo`);
    }
  });

  test('el error crece de forma monótona con la relación a/C', () => {
    // Es la propiedad que justifica todo el control: mientras los vanos sean
    // cortos frente al parámetro C, la parábola sirve; en cuanto a/C crece, deja
    // de servir. Si esta monotonía se rompiera, el criterio no protegería nada.
    const C = 1000;
    const relaciones = [0.05, 0.1, 0.2, 0.4, 0.8, 1.6];
    let anterior = 0;
    for (const rel of relaciones) {
      const err = Math.abs(controlParabola(rel * C, C).error_pct);
      assert.ok(err > anterior,
        `a/C = ${rel}: el error (${err.toFixed(4)} %) debe superar al del caso anterior (${anterior.toFixed(4)} %)`);
      anterior = err;
    }
  });

  test('el error sigue la ley −(a/2C)²/12, desarrollada a mano', () => {
    // Vía independiente: dividiendo las dos series término a término,
    //   f_par / f_cat = (x²/2) / (x²/2 + x⁴/24 + …) = 1 / (1 + x²/12 + …)
    // o sea  error ≈ −x²/12  con x = a/2C. El código no conoce esta expresión:
    // calcula las dos flechas y las resta. Que coincidan valida ambas fórmulas.
    const C = 1000;
    for (const x of [0.02, 0.05, 0.1, 0.2, 0.3]) {
      const a = 2 * C * x;
      const predicho = -100 * (x * x) / 12;
      const tol = 100 * x ** 4 * 0.02; // orden del siguiente término de la serie
      cerca(controlParabola(a, C).error_pct, predicho, tol, `a/2C = ${x}`);
    }
  });

  test('con los vanos de una línea de este tipo la simplificación es admisible', () => {
    // Vano de 340 m con C = 2 300 m — el orden de magnitud de una línea AT de
    // un solo circuito tendida al 20 % de su carga de rotura. Datos sintéticos.
    const r = controlParabola(340, 2300);
    assert.equal(r.aceptable, true, 'debe pasar el criterio del 0,5 %');
    assert.ok(Math.abs(r.error_pct) < 0.05,
      `el error real (${r.error_pct.toFixed(4)} %) debe quedar un orden de magnitud por debajo del criterio`);
  });

  test('el criterio del 0,5 % se cruza cerca de a ≈ C/2, y ahí corta de verdad', () => {
    // Esto es lo que hace que el control no sea decorativo: existe un punto en
    // el que dice que NO. Con C = 1 000 m está entre 480 y 500 m de vano —
    // casi medio kilómetro, lejísimos de cualquier vano de esta línea.
    assert.equal(controlParabola(480, 1000).aceptable, true, 'a/C = 0,48 todavía pasa');
    assert.equal(controlParabola(500, 1000).aceptable, false, 'a/C = 0,50 ya no pasa');
    // Caso patológico, para ver que el veredicto no se queda pegado en true.
    const absurdo = controlParabola(2000, 1000);
    assert.equal(absurdo.aceptable, false);
    assert.ok(Math.abs(absurdo.error_pct) > 5, 'con a = 2C el error debe ser enorme');
  });

  test('sin datos utilizables NO inventa: devuelve nulos, no ceros', () => {
    // Un 0 en `flechaParabola_m` se leería como "conductor tenso y horizontal".
    // La ausencia de dato tiene que verse como ausencia.
    for (const [a, C] of [[0, 1000], [200, 0], [-200, 1000], [200, -1000],
                          [NaN, 1000], [200, null], [undefined, undefined]]) {
      assert.deepEqual(controlParabola(a, C), {
        flechaCatenaria_m: null, flechaParabola_m: null, error_pct: null, aceptable: null,
      }, `a=${a}, C=${C}`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('detalleVanos — el tramo bajado a vano por vano', () => {
  // Tramo sintético: VIR de 200 m y vanos escogidos para caer justo en los
  // bordes de la banda 0,7–1,3 (140 y 260) y claramente fuera (100 y 300).
  const tramo = { vanos: [140, 200, 260, 100, 300], vir: 200 };
  const conductor = { w: 1 }; // kg/m — conductor sintético, números redondos
  const estados = {
    eds:    { nombre: 'EDS',     H: 2000, w: 1, t: 25 }, // C = 2 000 m
    tMax:   { nombre: 'T máx',   H: 1000, w: 1, t: 75 }, // C = 1 000 m ← el peor
    tMin:   { nombre: 'T mín',   H: 2500, w: 1, t: 10 }, // C = 2 500 m
    viento: { nombre: 'Viento',  H: 3000, w: 2, t: 25 }, // C = 1 500 m
  };
  const filas = detalleVanos(tramo, conductor, estados);

  test('una fila por vano, numeradas dentro del tramo', () => {
    assert.equal(filas.length, 5);
    assert.deepEqual(filas.map((f) => f.n), [1, 2, 3, 4, 5]);
    assert.deepEqual(filas.map((f) => f.a_m), [140, 200, 260, 100, 300]);
  });

  test('relVir = vano / VIR, y la banda 0,7–1,3 se aplica con bordes ABIERTOS', () => {
    assert.deepEqual(filas.map((f) => f.relVir), [0.7, 1, 1.3, 0.5, 1.5]);
    // 0,7 y 1,3 exactos NO están fuera: el criterio es "menor que" y "mayor que".
    assert.deepEqual(filas.map((f) => f.fueraDeRango), [false, false, false, true, true]);
  });

  test('el parámetro C es el del estado MÁS DESFAVORABLE (el menor C)', () => {
    // De los cuatro estados: 2 000, 1 000, 2 500 y 1 500 m. El menor es 1 000
    // (temperatura máxima: caliente = destensado = más flecha y más cable).
    for (const f of filas) assert.equal(f.parametroC_m, 1000, `vano ${f.n}`);
  });

  test('flechas del vano de 200 m, contra la serie desarrollada a mano', () => {
    const f = filas[1];
    // EDS: C = 2 000 → x = 0,05 → 2000·(0,00125 + 2,604166667e−7 + 2,170e−11)
    cerca(f.flechaEds_m, 2.5005208768, 1e-9, 'flecha EDS');
    // T máx: C = 1 000 → x = 0,1 (el caso redondo de arriba)
    cerca(f.flechaTMax_m, FLECHA_C1000_A200, 1e-9, 'flecha a T máxima');
    // T mín: C = 2 500 → x = 0,04 → 2500·(0,0008 + 1,0666667e−7 + 5,689e−12)
    cerca(f.flechaTMin_m, 2.0002666809, 1e-9, 'flecha a T mínima');
  });

  test('más caliente = menos tiro = más flecha (en TODOS los vanos)', () => {
    // Es la física del asunto y la razón de que la temperatura máxima sea el
    // estado que decide la distancia al terreno.
    for (const f of filas) {
      assert.ok(f.flechaTMax_m > f.flechaEds_m, `vano ${f.n}: T máx debe colgar más que EDS`);
      assert.ok(f.flechaEds_m > f.flechaTMin_m, `vano ${f.n}: EDS debe colgar más que T mín`);
    }
  });

  test('la flecha crece con el vano', () => {
    const porVano = [...filas].sort((a, b) => a.a_m - b.a_m);
    for (let i = 1; i < porVano.length; i++) {
      assert.ok(porVano[i].flechaEds_m > porVano[i - 1].flechaEds_m,
        `${porVano[i].a_m} m debe colgar más que ${porVano[i - 1].a_m} m`);
    }
  });

  test('IDENTIDAD FÍSICA: el conductor SIEMPRE mide más que el vano', () => {
    // Un cable colgado no puede medir menos que la recta entre sus apoyos.
    // Si esta prueba se pone roja, el resultado es imposible, no impreciso.
    for (const f of filas) {
      assert.ok(f.longitudConductor_m > f.a_m,
        `vano ${f.n} (${f.a_m} m): el conductor mide ${f.longitudConductor_m} m`);
    }
  });

  test('longitud del vano de 200 m, contra la serie del seno hiperbólico', () => {
    cerca(filas[1].longitudConductor_m, LONGITUD_C1000_A200, 1e-9, 'arco de conductor');
  });

  test('el C de la fila alimenta directamente al control de parábola', () => {
    // Es el uso previsto: se toma la fila y se le pregunta si en ESE vano la
    // simplificación vale. Como el peor estado aquí es el de T máxima, la
    // flecha exacta que devuelve el control debe ser la misma de la fila.
    const f = filas[1];
    const r = controlParabola(f.a_m, f.parametroC_m);
    cerca(r.flechaCatenaria_m, f.flechaTMax_m, 1e-12, 'las dos vías deben coincidir');
    assert.equal(r.aceptable, true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('detalleVanos — lo que NO se puede calcular se declara', () => {

  test('sin VIR no hay veredicto de rango: relVir y fueraDeRango son null', () => {
    // null, no false. `false` afirmaría "el vano está dentro de rango", y eso
    // nadie lo sabe si no hay VIR contra qué compararlo.
    const filas = detalleVanos({ vanos: [100, 200], vir: null }, { w: 1 }, { eds: { H: 1000, w: 1 } });
    for (const f of filas) {
      assert.equal(f.relVir, null);
      assert.equal(f.fueraDeRango, null);
      assert.ok(f.flechaEds_m > 0, 'la flecha sí se puede calcular: eso no se pierde');
    }
  });

  test('un VIR de cero no se toma por bueno (dividir por él daría Infinity)', () => {
    const [f] = detalleVanos({ vanos: [100], vir: 0 }, { w: 1 }, {});
    assert.equal(f.relVir, null);
    assert.equal(f.fueraDeRango, null);
  });

  test('sin estados no hay flechas ni longitud: nulos, no ceros', () => {
    const [f] = detalleVanos({ vanos: [200], vir: 200 }, { w: 1 }, {});
    assert.equal(f.a_m, 200, 'el vano sí se conoce y se conserva');
    assert.equal(f.relVir, 1);
    assert.equal(f.flechaEds_m, null);
    assert.equal(f.flechaTMax_m, null);
    assert.equal(f.flechaTMin_m, null);
    assert.equal(f.longitudConductor_m, null);
    assert.equal(f.parametroC_m, null);
  });

  test('un estado con tiro inválido se descarta, sin contaminar a los demás', () => {
    const filas = detalleVanos({ vanos: [200], vir: 200 }, { w: 1 }, {
      eds: { H: 2000, w: 1 },
      tMax: { H: 0, w: 1 },        // tiro nulo: no es un estado, es un dato malo
      tMin: { H: NaN, w: 1 },
    });
    assert.equal(filas[0].flechaTMax_m, null);
    assert.equal(filas[0].flechaTMin_m, null);
    assert.equal(filas[0].parametroC_m, 2000, 'el peor C debe salir del único estado sano');
    assert.ok(filas[0].flechaEds_m > 0);
  });

  test('un estado sin w propia usa la del conductor', () => {
    const [f] = detalleVanos({ vanos: [200], vir: 200 }, { w: 1 }, { eds: { H: 1000 } });
    cerca(f.flechaEds_m, FLECHA_C1000_A200, 1e-9, 'debe caer al peso del conductor');
  });

  test('un tramo vacío o ausente devuelve lista vacía, no explota', () => {
    assert.deepEqual(detalleVanos({ vanos: [], vir: 100 }, { w: 1 }, {}), []);
    assert.deepEqual(detalleVanos(undefined, undefined, undefined), []);
  });

  test('un vano no numérico no arrastra al resto de la fila', () => {
    const filas = detalleVanos({ vanos: [200, null], vir: 200 }, { w: 1 }, { eds: { H: 1000, w: 1 } });
    assert.equal(filas[1].relVir, null);
    assert.equal(filas[1].flechaEds_m, null);
    assert.equal(filas[1].longitudConductor_m, null);
    assert.ok(filas[0].flechaEds_m > 0, 'el vano bueno se sigue calculando');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('resumenConductor — cuánto cable hay de más respecto a la recta', () => {

  test('caso aritmético de cabeza', () => {
    // 101 + 103 = 204 m de conductor sobre 100 + 100 = 200 m de vanos.
    // Sobrante = 4 m sobre 200 → 2 % exacto.
    const r = resumenConductor([
      { a_m: 100, longitudConductor_m: 101 },
      { a_m: 100, longitudConductor_m: 103 },
    ]);
    assert.equal(r.longitudTotal_m, 204);
    cerca(r.factorCatenaria_pct, 2, 1e-12, 'factor de catenaria');
  });

  test('el factor coincide con la serie sinh(x)/x − 1, desarrollada a mano', () => {
    // Un solo vano de 200 m con C = 1 000 m (x = 0,1):
    //   L/a = sinh x / x = 1 + x²/6 + x⁴/120 = 1 + 0,00166666667 + 8,3333e−7
    //   → sobrante = 0,166750002 %
    const filas = detalleVanos({ vanos: [200], vir: 200 }, { w: 1 }, { eds: { H: 1000, w: 1 } });
    cerca(resumenConductor(filas).factorCatenaria_pct, 0.166750002, 1e-7, 'sobrante');
  });

  test('IDENTIDAD FÍSICA: el sobrante es siempre positivo', () => {
    // Si sale cero o negativo, el conductor mediría menos que la recta entre
    // apoyos: imposible. Sería un dato malo disfrazado de línea muy tensa.
    const filas = detalleVanos(
      { vanos: [140, 200, 260, 100, 300], vir: 200 },
      { w: 1 },
      { eds: { H: 2000, w: 1 }, tMax: { H: 1000, w: 1 } },
    );
    const r = resumenConductor(filas);
    assert.ok(r.factorCatenaria_pct > 0, `sobrante ${r.factorCatenaria_pct} %`);
    assert.ok(r.longitudTotal_m > filas.reduce((s, f) => s + f.a_m, 0),
      'el total de conductor debe superar a la suma de vanos');
  });

  test('una fila sin longitud NO hunde el porcentaje: sale del resto o de nada', () => {
    // Ésta es la trampa del módulo. Si se sumara el vano al denominador sin
    // sumar su arco al numerador, el resultado saldría negativo y el informe
    // diría que el conductor mide menos que la recta: un imposible físico
    // provocado por un dato faltante, no por la línea.
    const r = resumenConductor([
      { a_m: 100, longitudConductor_m: 101 },
      { a_m: 100, longitudConductor_m: null },
    ]);
    assert.equal(r.longitudTotal_m, 101);
    cerca(r.factorCatenaria_pct, 1, 1e-12, 'debe calcularse solo sobre el vano conocido');
    assert.ok(r.factorCatenaria_pct > 0, 'jamás negativo por un dato que falta');
  });

  test('sin filas utilizables devuelve nulos, no un cero que parezca un resultado', () => {
    const vacio = { longitudTotal_m: null, factorCatenaria_pct: null };
    assert.deepEqual(resumenConductor([]), vacio);
    assert.deepEqual(resumenConductor(undefined), vacio);
    assert.deepEqual(resumenConductor([{ a_m: 100, longitudConductor_m: null }]), vacio);
    assert.deepEqual(resumenConductor([{ a_m: 0, longitudConductor_m: 0 }]), vacio);
  });
});
