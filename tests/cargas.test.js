// ============================================================================
// tests/cargas.test.js — pruebas de la carga transversal sobre las estructuras
// ----------------------------------------------------------------------------
// Los valores esperados NO salen de ejecutar el propio código: eso sería
// circular y pasaría en verde aunque la fórmula estuviera del revés. Salen de:
//
//   (a) UNA VÍA ALGEBRAICA DISTINTA. El código calcula el factor del quiebre con
//       2·sen(α/2). Aquí se calcula con |û₂ − û₁| = √(2 − 2·cos α), que es la
//       definición de la que sale: la resta de los dos vectores unitarios de
//       tiro. No comparte ni una función trigonométrica con el código (seno vs
//       coseno) ni la identidad del ángulo mitad. Si alguien "simplificara" mal
//       la fórmula del núcleo, esta vía no lo acompañaría en el error.
//   (b) GEOMETRÍA DE CABEZA. La cuerda de un arco de 60° vale exactamente el
//       radio (triángulo equilátero) → factor 1. La de 120° vale R·√3. La de
//       180° vale el diámetro → factor 2. Tres puntos verificables sin calculadora.
//   (c) ARITMÉTICA REDONDA A MANO. v = 90 km/h son 25 m/s exactos, así que
//       q = ½·1,2·25² = 375 Pa exactos, sin decimales que discutir.
//   (d) IDENTIDADES que el resultado debe cumplir sí o sí (la suma escalar nunca
//       puede quedar por debajo de la composición en cuadratura; el margen es
//       negativo exactamente cuando el estado es 'revisar').
//
// ⚠️ TODOS LOS DATOS SON SINTÉTICOS. Vanos redondos, apoyos 'AP-0n', y las
// únicas coordenadas que aparecen son un ángulo recto inventado en (45°, 7°)
// —en Europa, a un océano de cualquier línea real— para probar el camino
// geodésico. Ninguna coordenada, cota ni nombre de estructura de cliente entra
// en este repositorio, que es PÚBLICO.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  factorTransversal,
  cargaTransversalApoyo,
  utilizacionApoyo,
  cargasDeLaLinea,
  UMBRAL_UTILIZACION_PCT,
} from '../nucleo/cargas.js';

const cerca = (real, esperado, tol, msg) =>
  assert.ok(Number.isFinite(real) && Math.abs(real - esperado) <= tol,
    `${msg}: ${real} vs ${esperado} esperado (tolerancia ${tol})`);

// ── La vía independiente al factor del quiebre ───────────────────────────────
//
// El apoyo recibe la RESTA de los dos tirones: el vano de atrás tira en la
// dirección û₁ y el de adelante en la û₂, ambos con módulo H. La resultante es
// H·|û₂ − û₁|, y con û₁ = (1,0) y û₂ = (cos α, sen α):
//
//   |û₂ − û₁| = √((cos α − 1)² + sen²α) = √(2 − 2·cos α)
//
// El núcleo usa 2·sen(α/2), que es la misma cantidad por la identidad del
// ángulo mitad. Que las dos coincidan valida la identidad Y su aplicación.
const cuerda = (grados) => Math.sqrt(2 - 2 * Math.cos((grados * Math.PI) / 180));

// Tolerancia de máquina. NO se compara con `===` a propósito: 60° no tiene
// representación exacta en radianes binarios, así que 2·sen(30°) sale
// 0,9999999999999999 y no 1. Es ruido del último bit, no un error del cálculo
// —pero si alguien escribiera `if (factor === 1)` en la interfaz, ese `if`
// nunca se cumpliría y nadie entendería por qué. Queda dicho aquí.
const EPS = 1e-12;

// ════════════════════════════════════════════════════════════════════════════
describe('factorTransversal — el multiplicador que decide si el apoyo aguanta', () => {

  test('α = 0° (línea recta): la resultante es NULA, no "pequeña"', () => {
    // Los dos tirones son iguales y opuestos: se cancelan enteros. Si esto
    // diera algo distinto de cero, toda la línea recta aparecería cargada y
    // nadie sabría distinguir el apoyo que sí tiene problema.
    assert.equal(factorTransversal(0), 0);
  });

  test('α = 60°: la resultante vale EXACTAMENTE el tiro (cuerda = radio)', () => {
    // Geometría de cabeza: la cuerda de un arco de 60° es el lado del triángulo
    // equilátero inscrito, o sea el propio radio. Factor = 1.
    // Es la frontera del módulo: por debajo de 60° la estructura recibe menos
    // que la tensión del conductor; por encima, MÁS.
    cerca(factorTransversal(60), 1, EPS, 'factor a 60°');
    cerca(factorTransversal(60), cuerda(60), EPS, 'contra la vía vectorial');
  });

  test('α = 120°: la resultante vale H·√3 — un 73 % por encima del tiro', () => {
    cerca(factorTransversal(120), Math.sqrt(3), EPS, 'factor a 120°');
    cerca(factorTransversal(120), cuerda(120), EPS, 'contra la vía vectorial');
  });

  test('α = 180°: el tope físico es 2 — la línea se devuelve por donde vino', () => {
    // Cuerda = diámetro. Ningún quiebre puede pedirle a la estructura más del
    // doble de la tensión: si alguna vez sale un factor > 2, el dato de entrada
    // está corrupto, no es un apoyo muy cerrado.
    cerca(factorTransversal(180), 2, EPS, 'factor a 180°');
  });

  test('coincide con la vía vectorial en TODO el rango, no solo en los redondos', () => {
    for (let g = 0; g <= 180; g += 0.5) {
      cerca(factorTransversal(g), cuerda(g), 1e-12, `α = ${g}°`);
    }
  });

  test('crece de forma monótona: más quiebre es siempre más carga', () => {
    // Sin monotonía, un apoyo más cerrado podría salir menos cargado y el
    // orden de prioridades del mantenimiento quedaría al revés.
    let anterior = -1;
    for (let g = 0; g <= 180; g += 1) {
      const f = factorTransversal(g);
      assert.ok(f > anterior, `α = ${g}°: el factor debe superar al del ángulo anterior`);
      anterior = f;
    }
  });

  test('el ángulo que falta o está fuera de [0,180] es null, nunca 0', () => {
    // Un 0 diría "línea recta, sin carga de quiebre", que es una AFIRMACIÓN.
    // La ausencia de dato no afirma nada.
    for (const malo of [null, undefined, NaN, '90', -0.001, 180.001, 360, Infinity]) {
      assert.equal(factorTransversal(malo), null, `entrada inválida: ${String(malo)}`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('cargaTransversalApoyo — el caso de los 118° de esta línea', () => {

  // El apoyo real que motivó el módulo, con números sintéticos: 118° de
  // deflexión, 1 400 kgf de tiro, 3 conductores.
  const A118 = { deflexion_grados: 118, tiro_kgf: 1400, nConductores: 3,
                 vanoViento_m: 0, cargaViento_kg_m: 0 };

  test('a 118° la estructura recibe MÁS carga que la tensión del conductor', () => {
    // ESTE es el hallazgo del módulo. El factor 2·sen(59°) = 1,714: la
    // estructura aguanta un 71 % más de lo que tira el conductor, siempre, haya
    // o no haya viento. Un apoyo así dimensionado "por el tiro" está
    // dimensionado por poco más de la mitad de lo que necesita.
    const r = cargaTransversalApoyo(A118);
    const tensionPura = 1400 * 3; // 4 200 kgf — lo que se creería sin el factor

    assert.ok(r.ftAngulo_kgf > tensionPura,
      `la carga del quiebre (${r.ftAngulo_kgf.toFixed(0)} kgf) debe superar la tensión (${tensionPura} kgf)`);
    cerca(r.ftAngulo_kgf, cuerda(118) * 1400 * 3, 1e-9, 'ftAngulo por la vía vectorial');
    cerca(r.componentes.factorAngulo, 1.714334601404, 1e-11, 'el factor a 118°');
    assert.equal(r.componentes.amplificaTension, true,
      'la bandera que hace evidente el caso tiene que estar levantada');
  });

  test('`amplificaTension` marca exactamente el cruce por 60°', () => {
    assert.equal(cargaTransversalApoyo({ ...A118, deflexion_grados: 30 }).componentes.amplificaTension, false);
    assert.equal(cargaTransversalApoyo({ ...A118, deflexion_grados: 90 }).componentes.amplificaTension, true);
    assert.equal(cargaTransversalApoyo({ ...A118, deflexion_grados: 120 }).componentes.amplificaTension, true);
  });

  test('α = 0 da resultante de quiebre nula aunque el tiro sea enorme', () => {
    const r = cargaTransversalApoyo({ ...A118, deflexion_grados: 0, tiro_kgf: 99999 });
    assert.equal(r.ftAngulo_kgf, 0);
  });

  test('α = 60 da exactamente el tiro, multiplicado por los conductores', () => {
    const r = cargaTransversalApoyo({ ...A118, deflexion_grados: 60 });
    cerca(r.ftAngulo_kgf, 1400 * 3, 1e-9, 'ftAngulo a 60°');
  });

  test('α = 120 da el tiro por √3', () => {
    const r = cargaTransversalApoyo({ ...A118, deflexion_grados: 120 });
    cerca(r.ftAngulo_kgf, 1400 * 3 * Math.sqrt(3), 1e-9, 'ftAngulo a 120°');
  });

  test('el número de conductores multiplica la carga, linealmente', () => {
    const uno = cargaTransversalApoyo({ ...A118, nConductores: 1 }).ftAngulo_kgf;
    const seis = cargaTransversalApoyo({ ...A118, nConductores: 6 }).ftAngulo_kgf;
    cerca(seis, 6 * uno, 1e-9, 'seis conductores cargan seis veces');
  });

  test('el viento: carga por metro × vano viento × conductores', () => {
    // Aritmética redonda, comprobable con una calculadora de bolsillo:
    // 0,9 kg/m × 350 m × 3 = 945 kgf.
    const r = cargaTransversalApoyo({
      deflexion_grados: 0, tiro_kgf: 1000, nConductores: 3,
      vanoViento_m: 350, cargaViento_kg_m: 0.9,
    });
    cerca(r.ftViento_kgf, 945, 1e-9, 'ftViento');
  });

  test('la hipótesis de composición se declara ADOPTADA, y se dan las dos lecturas', () => {
    // No basta con que el número sea correcto: el revisor tiene que poder
    // DISCUTIR la hipótesis sin leer el código. Si este texto desaparece, el
    // informe pasa a afirmar algo sin decir de dónde salió.
    const r = cargaTransversalApoyo({ ...A118, vanoViento_m: 375, cargaViento_kg_m: 0.9 });
    assert.match(r.componentes.hipotesisComposicion, /ADOPTADA/);
    assert.match(r.componentes.hipotesisComposicion, /sin norma/i);
    assert.equal(typeof r.componentes.ftTotalPerpendicular_kgf, 'number');
  });

  test('el total adoptado (suma) es la ENVOLVENTE de la lectura en cuadratura', () => {
    // Identidad: a + b ≥ √(a² + b²) para a,b ≥ 0. La hipótesis adoptada tiene
    // que ser la cota superior de las dos, o dejaría de ser conservadora — y
    // una hipótesis de carga que se queda corta no protege nada.
    for (const [ang, vv, w] of [[0, 300, 0.9], [30, 350, 1.2], [118, 375, 0.9], [180, 400, 2]]) {
      const r = cargaTransversalApoyo({
        deflexion_grados: ang, tiro_kgf: 1400, nConductores: 3,
        vanoViento_m: vv, cargaViento_kg_m: w,
      });
      const c = r.componentes;
      cerca(r.ftTotal_kgf, r.ftAngulo_kgf + r.ftViento_kgf, 1e-9, `α=${ang}: el total es la suma`);
      cerca(c.ftTotalPerpendicular_kgf, Math.hypot(r.ftAngulo_kgf, r.ftViento_kgf), 1e-9,
        `α=${ang}: la lectura perpendicular es la cuadratura`);
      assert.ok(c.ftTotalAlineado_kgf >= c.ftTotalPerpendicular_kgf - 1e-9,
        `α=${ang}: la suma debe envolver a la cuadratura`);
    }
  });

  test('un cero DECLARADO de viento no es un dato ausente', () => {
    // Con hipótesis climática sin viento, w = 0 es un hecho: el total existe y
    // vale la carga del quiebre. Confundirlo con "falta el dato" dejaría sin
    // evaluar todos los apoyos de un cálculo sin viento.
    const r = cargaTransversalApoyo({ ...A118, vanoViento_m: 0, cargaViento_kg_m: 0 });
    assert.equal(r.ftViento_kgf, 0);
    assert.equal(r.componentes.faltan.length, 0);
    cerca(r.ftTotal_kgf, r.ftAngulo_kgf, 1e-12, 'el total es solo el quiebre');
  });

  test('si falta UNA componente, el total es null — no se entrega la mitad', () => {
    // Es la regla madre: devolver solo el quiebre cuando falta el viento sería
    // afirmar que el viento vale cero. Alguien firma ese número.
    const sinViento = cargaTransversalApoyo({ ...A118, cargaViento_kg_m: undefined, vanoViento_m: 375 });
    assert.ok(sinViento.ftAngulo_kgf > 0, 'el quiebre sí se pudo calcular');
    assert.equal(sinViento.ftViento_kgf, null);
    assert.equal(sinViento.ftTotal_kgf, null, 'el total NO puede salir con media carga dentro');
    assert.ok(sinViento.componentes.faltan.some((m) => /cargaViento_kg_m/.test(m)),
      'y el hueco tiene que quedar escrito con su motivo');

    const sinAngulo = cargaTransversalApoyo({ ...A118, deflexion_grados: null, vanoViento_m: 375, cargaViento_kg_m: 0.9 });
    assert.ok(sinAngulo.ftViento_kgf > 0);
    assert.equal(sinAngulo.ftAngulo_kgf, null);
    assert.equal(sinAngulo.ftTotal_kgf, null);
  });

  test('cada ingrediente que falta se nombra, uno por uno', () => {
    const r = cargaTransversalApoyo({});
    assert.equal(r.ftAngulo_kgf, null);
    assert.equal(r.ftViento_kgf, null);
    assert.equal(r.ftTotal_kgf, null);
    for (const clave of ['nConductores', 'tiro_kgf', 'deflexion_grados', 'vanoViento_m', 'cargaViento_kg_m']) {
      assert.ok(r.componentes.faltan.some((m) => m.includes(clave)), `debe nombrar ${clave}`);
    }
  });

  test('medio conductor no existe: nConductores tiene que ser entero positivo', () => {
    for (const malo of [0, -3, 2.5, '3', null]) {
      const r = cargaTransversalApoyo({ ...A118, nConductores: malo });
      assert.equal(r.ftAngulo_kgf, null, `nConductores = ${String(malo)} no puede pasar`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('utilizacionApoyo — contra una capacidad DECLARADA, jamás supuesta', () => {

  // Caso base sintético: poste de 2 000 kgf de rotura, 10 m libres, conductor
  // amarrado en la punta. Todos los números salen exactos, sin tolerancia.
  const BASE = { ftTotal_kgf: 500, cargaRotura_kgf: 2000, alturaLibre_m: 10, alturaAplicacion_m: 10 };

  test('caso redondo: 500 de 2 000 en la punta son el 25 %', () => {
    // (500 · 10) / (2 000 · 10) · 100 = 25 % exacto.
    // Margen: el 50 % de 2 000 son 1 000 kgf admisibles; quedan 500.
    const r = utilizacionApoyo(BASE);
    assert.equal(r.utilizacion_pct, 25);
    assert.equal(r.margen_kgf, 500);
    assert.equal(r.estado, 'cumple');
  });

  test('bajar el punto de amarre a la mitad divide la utilización por dos', () => {
    // Lo que rompe el poste es el MOMENTO, no la fuerza. El mismo kgf colgado a
    // 5 m en vez de 10 hace la mitad de daño — y admite el doble de carga.
    // Comparar kgf contra kgf sin la palanca castigaría al apoyo sin motivo.
    const r = utilizacionApoyo({ ...BASE, alturaAplicacion_m: 5 });
    assert.equal(r.utilizacion_pct, 12.5);
    assert.equal(r.margen_kgf, 1500); // 1 000 · 10/5 − 500
  });

  test('pasado el umbral adoptado se marca "revisar", y el margen se vuelve negativo', () => {
    const r = utilizacionApoyo({ ...BASE, ftTotal_kgf: 1500 });
    assert.equal(r.utilizacion_pct, 75);
    assert.equal(r.estado, 'revisar');
    assert.equal(r.margen_kgf, -500);
  });

  test('justo EN el umbral cumple: el criterio es superarlo, no alcanzarlo', () => {
    const r = utilizacionApoyo({ ...BASE, ftTotal_kgf: 1000 });
    assert.equal(r.utilizacion_pct, UMBRAL_UTILIZACION_PCT);
    assert.equal(r.estado, 'cumple');
    assert.equal(r.margen_kgf, 0);
  });

  test('el margen es ≥ 0 exactamente cuando el estado es "cumple"', () => {
    // Las dos salidas tienen que contar la MISMA historia. Si un día divergen,
    // la tabla diría "cumple" con margen negativo y nadie sabría a cuál creerle.
    for (let F = 0; F <= 2500; F += 25) {
      const r = utilizacionApoyo({ ...BASE, ftTotal_kgf: F });
      assert.equal(r.margen_kgf >= 0, r.estado === 'cumple', `con F = ${F} kgf`);
    }
  });

  test('SIN CARGA DE ROTURA NO HAY VEREDICTO: null, y no se estima', () => {
    // La rotura de un poste depende del material, la clase y el año de
    // fabricación. Suponerla es fabricar la conclusión del informe. Un apoyo
    // que "cumple" contra una capacidad inventada es peor que un hueco.
    assert.equal(utilizacionApoyo({ ...BASE, cargaRotura_kgf: undefined }), null);
    assert.equal(utilizacionApoyo({ ...BASE, cargaRotura_kgf: null }), null);
    assert.equal(utilizacionApoyo({ ...BASE, cargaRotura_kgf: 0 }), null);
    assert.equal(utilizacionApoyo({ ftTotal_kgf: 500, alturaLibre_m: 10, alturaAplicacion_m: 10 }), null);
  });

  test('tampoco hay veredicto sin las alturas ni sin la carga', () => {
    assert.equal(utilizacionApoyo({ ...BASE, alturaLibre_m: undefined }), null);
    assert.equal(utilizacionApoyo({ ...BASE, alturaAplicacion_m: undefined }), null);
    assert.equal(utilizacionApoyo({ ...BASE, ftTotal_kgf: null }), null);
    assert.equal(utilizacionApoyo(undefined), null);
  });

  test('carga 0 SÍ se evalúa: es un dato (recta sin viento), no una ausencia', () => {
    const r = utilizacionApoyo({ ...BASE, ftTotal_kgf: 0 });
    assert.equal(r.utilizacion_pct, 0);
    assert.equal(r.estado, 'cumple');
    assert.equal(r.margen_kgf, 1000);
  });

  test('geometría imposible (amarre por encima de la punta) → null', () => {
    // Un número calculado sobre datos contradictorios se lee igual de bien que
    // uno bueno. Es exactamente lo que no puede pasar en una memoria de cálculo.
    assert.equal(utilizacionApoyo({ ...BASE, alturaAplicacion_m: 12 }), null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA LÍNEA SINTÉTICA DE PRUEBA
// ----------------------------------------------------------------------------
// 5 estructuras + 1 empalme intercalado. El tercer apoyo tiene los 118° que
// motivaron el módulo; el cuarto tiene 60° (factor 1) para poder comparar.
// Dos tramos de tensión, anclados en AP-01, AP-03 y AP-05.
//
//   AP-01 ──300── AP-02 ──400── [AP-03 118°] ──350── AP-04 ──250── AP-05
//    ext.          0°            el del caso          60°           ext.
// ════════════════════════════════════════════════════════════════════════════

const ESTADOS = {
  eds:    { nombre: 'EDS / cada día',     H: 1000 },
  tMax:   { nombre: 'Máxima temperatura', H: 900 },
  viento: { nombre: 'Máximo viento',      H: 1400 },
  tMin:   { nombre: 'Mínima temperatura', H: 1500 },
};

const lineaSintetica = () => [
  { nombre: 'AP-01', funcionEstructural: 'Terminal' },
  { nombre: 'AP-02', funcionEstructural: 'Suspensión', vanoAnterior_m: 300, deflexion_grados: 0,
    cargaRotura_kgf: 9000, alturaLibre_m: 12, alturaAplicacion_m: 10 },
  { nombre: 'EMP-A', tipoPunto: 'Empalme' },
  { nombre: 'AP-03', funcionEstructural: 'Ángulo', vanoAnterior_m: 400, deflexion_grados: 118,
    cargaRotura_kgf: 9000, alturaLibre_m: 12, alturaAplicacion_m: 10 },
  { nombre: 'AP-04', funcionEstructural: 'Suspensión', vanoAnterior_m: 350, deflexion_grados: 60,
    cargaRotura_kgf: 9000, alturaLibre_m: 12, alturaAplicacion_m: 10 },
  { nombre: 'AP-05', funcionEstructural: 'Terminal', vanoAnterior_m: 250 },
];

const tramosSinteticos = () => [
  { vanos: [300, 400], estados: ESTADOS },
  { vanos: [350, 250], estados: ESTADOS },
];

const CONDUCTOR = { diametro: 0.024 };            // 24 mm, sintético
const HIPOTESIS = { vViento: 90, rho: 1.2, cx: 1.0, circuitos: 1 };

// Carga de viento a mano: v = 90 km/h = 25 m/s exactos → q = ½·1,2·25² = 375 Pa.
// w = q·cx·d/g = 375·1·0,024/9,80665 kg/m. El 9,80665 es la gravedad normal, la
// misma constante que usa mecanica.js para pasar de newton a kgf.
const Q_PA = 375;
const W_VIENTO = (Q_PA * 1.0 * 0.024) / 9.80665;  // ≈ 0,91774 kg/m

describe('cargasDeLaLinea — la tabla que se lleva al informe', () => {

  test('una fila por ESTRUCTURA: el empalme no inventa un apoyo', () => {
    // Un empalme puede colgar a mitad de vano. Darle fila partiría el vano real
    // en dos y le atribuiría a un apoyo que no existe la carga de los que sí.
    const filas = cargasDeLaLinea(lineaSintetica(), tramosSinteticos(), CONDUCTOR, HIPOTESIS);
    assert.equal(filas.length, 5);
    assert.deepEqual(filas.map((f) => f.apoyo), ['AP-01', 'AP-02', 'AP-03', 'AP-04', 'AP-05']);
    assert.deepEqual(filas.map((f) => f.n), [1, 2, 3, 4, 5]);
  });

  test('AP-03 (118°): la estructura recibe 8,5 veces la carga del apoyo recto', () => {
    // El titular del módulo, con la línea entera montada. Mismo conductor,
    // misma tensión, mismo viento: lo único que cambia es el ángulo.
    const filas = cargasDeLaLinea(lineaSintetica(), tramosSinteticos(), CONDUCTOR, HIPOTESIS);
    const recto = filas[1];   // AP-02, 0°
    const quiebre = filas[2]; // AP-03, 118°

    // Vano viento de AP-03 = (400 + 350)/2 = 375 m, a mano.
    assert.equal(quiebre.vanoViento_m, 375);
    assert.equal(quiebre.nConductores, 3);
    assert.equal(quiebre.presionViento_Pa, Q_PA);
    cerca(quiebre.cargaViento_kg_m, W_VIENTO, 1e-12, 'carga de viento por metro');

    // Se compone con el tiro del estado en que el viento SÍ sopla: 1 400 kgf.
    assert.equal(quiebre.tiro_kgf, 1400);
    assert.equal(quiebre.estadoTiro, 'Máximo viento');

    cerca(quiebre.ftAngulo_kgf, cuerda(118) * 1400 * 3, 1e-9, 'quiebre de AP-03');
    cerca(quiebre.ftViento_kgf, W_VIENTO * 375 * 3, 1e-9, 'viento de AP-03');
    cerca(quiebre.ftTotal_kgf, cuerda(118) * 1400 * 3 + W_VIENTO * 375 * 3, 1e-9, 'total de AP-03');

    // Y el número que cambia la conversación:
    assert.ok(quiebre.ftTotal_kgf / recto.ftTotal_kgf > 8,
      `AP-03 (${quiebre.ftTotal_kgf.toFixed(0)} kgf) debe recibir más de 8× lo de AP-02 (${recto.ftTotal_kgf.toFixed(0)} kgf)`);
    assert.ok(quiebre.ftAngulo_kgf > quiebre.tiro_kgf * quiebre.nConductores,
      'y más carga transversal que la propia tensión de sus conductores');
  });

  test('el 118° va ESCRITO en una nota, no escondido en una columna', () => {
    // Que el número esté en la tabla no basta: hay que decir qué significa, o
    // el apoyo se dimensiona "por el tiro" como se ha hecho siempre.
    const filas = cargasDeLaLinea(lineaSintetica(), tramosSinteticos(), CONDUCTOR, HIPOTESIS);
    const nota = filas[2].notas.find((t) => /multiplica la tensión/.test(t));
    assert.ok(nota, 'AP-03 debe traer la nota del quiebre');
    assert.match(nota, /71 % MÁS/);
    assert.match(nota, /con viento o sin él/);

    // El apoyo recto NO la lleva: una nota en todas las filas no la lee nadie.
    assert.equal(filas[1].notas.some((t) => /multiplica la tensión/.test(t)), false);
    // A 60° el factor es 1: tampoco amplifica, así que tampoco hay nota.
    assert.equal(filas[3].notas.some((t) => /multiplica la tensión/.test(t)), false);
  });

  test('AP-04 (60°) cumple y AP-03 (118°) hay que revisarlo — mismo poste', () => {
    // Dos postes idénticos, misma línea, mismo día: el veredicto lo cambia el
    // ángulo. Es exactamente la conclusión que el módulo tiene que hacer visible.
    const filas = cargasDeLaLinea(lineaSintetica(), tramosSinteticos(), CONDUCTOR, HIPOTESIS);
    assert.equal(filas[3].utilizacion.estado, 'cumple');
    assert.equal(filas[2].utilizacion.estado, 'revisar');
    assert.ok(filas[2].utilizacion.margen_kgf < 0, 'a AP-03 ya no le queda margen');

    // Utilización de AP-03 a mano: (F · 10) / (9 000 · 12) · 100
    const F = cuerda(118) * 1400 * 3 + W_VIENTO * 375 * 3;
    cerca(filas[2].utilizacion.utilizacion_pct, ((F * 10) / (9000 * 12)) * 100, 1e-9, 'utilización de AP-03');
  });

  test('el quiebre con el tiro MÁXIMO sale aparte: es carga permanente', () => {
    // El tiro más alto (mínima temperatura, 1 500 kgf) no coexiste con el
    // viento, pero el quiebre sí está ahí todo el año. Es la otra punta de la
    // envolvente y por eso viaja en su propia columna, sin mezclarse.
    const filas = cargasDeLaLinea(lineaSintetica(), tramosSinteticos(), CONDUCTOR, HIPOTESIS);
    assert.equal(filas[2].tiroMaximo_kgf, 1500);
    assert.equal(filas[2].estadoTiroMaximo, 'Mínima temperatura');
    cerca(filas[2].ftAnguloTiroMaximo_kgf, cuerda(118) * 1500 * 3, 1e-9, 'quiebre con el tiro máximo');
  });

  test('los apoyos extremos se declaran no evaluables, con el motivo', () => {
    // En un extremo no hay deflexión definida: trabaja a carga LONGITUDINAL,
    // que es otro caso de carga y este módulo no lo evalúa. Decirlo es la
    // diferencia entre un hueco honesto y un cero que alguien firma.
    const filas = cargasDeLaLinea(lineaSintetica(), tramosSinteticos(), CONDUCTOR, HIPOTESIS);
    for (const f of [filas[0], filas[4]]) {
      assert.equal(f.esExtremo, true);
      assert.equal(f.deflexion_grados, null);
      assert.equal(f.ftAngulo_kgf, null);
      assert.equal(f.ftTotal_kgf, null, 'sin quiebre no se entrega un total a medias');
      assert.match(f.noEvaluable, /extremo/);
      assert.match(f.noEvaluable, /LONGITUDINAL/);
    }
    // Pero lo que SÍ se pudo calcular se entrega: el viento sobre el semivano.
    cerca(filas[0].ftViento_kgf, W_VIENTO * 150 * 3, 1e-9, 'viento del extremo AP-01');
  });

  test('sin velocidad de viento declarada, el total NO se rellena con el quiebre', () => {
    // Sería el error cómodo: "no hay viento en los datos, pues no lo cuento".
    // Eso convierte un dato que falta en una hipótesis de cero viento.
    const filas = cargasDeLaLinea(lineaSintetica(), tramosSinteticos(), CONDUCTOR, { circuitos: 1 });
    const q = filas[2];
    assert.ok(q.ftAngulo_kgf > 0, 'el quiebre sí se puede calcular');
    assert.equal(q.cargaViento_kg_m, null);
    assert.equal(q.ftViento_kgf, null);
    assert.equal(q.ftTotal_kgf, null);
    assert.equal(q.utilizacion, null, 'y sin total no hay veredicto de utilización');
    assert.match(q.noEvaluable, /velocidad de viento/);
  });

  test('sin diámetro del conductor no hay área expuesta, y se dice', () => {
    const filas = cargasDeLaLinea(lineaSintetica(), tramosSinteticos(), {}, HIPOTESIS);
    assert.match(filas[2].noEvaluable, /diámetro/);
    assert.equal(filas[2].ftViento_kgf, null);
    // La presión dinámica sí se conoce: depende de la hipótesis, no del cable.
    assert.equal(filas[2].presionViento_Pa, Q_PA);
  });

  test('sin nConductores ni circuitos no se adivina: multiplica TODA la carga', () => {
    const filas = cargasDeLaLinea(lineaSintetica(), tramosSinteticos(), CONDUCTOR, { vViento: 90 });
    assert.equal(filas[2].nConductores, null);
    assert.equal(filas[2].ftTotal_kgf, null);
    assert.match(filas[2].noEvaluable, /nConductores/);
  });

  test('contar 3 por circuito DECLARA que los cables de guarda no van dentro', () => {
    // Cada guarda añade su propio empuje de viento y su propia componente de
    // quiebre. Olvidarlos deja la carga corta justo en los apoyos más cargados,
    // así que el supuesto no puede quedarse callado.
    const filas = cargasDeLaLinea(lineaSintetica(), tramosSinteticos(), CONDUCTOR, HIPOTESIS);
    assert.ok(filas[2].notas.some((t) => /guarda NO están contados/.test(t)));

    // Declarado explícitamente, no hace falta el aviso.
    const conN = cargasDeLaLinea(lineaSintetica(), tramosSinteticos(), CONDUCTOR,
      { ...HIPOTESIS, circuitos: undefined, nConductores: 4 });
    assert.equal(conN[2].nConductores, 4);
    assert.equal(conN[2].notas.some((t) => /guarda NO están contados/.test(t)), false);
  });

  test('sin capacidad declarada no hay utilización, y se explica qué falta', () => {
    // AP-05 no trae carga de rotura ni alturas: no se le inventa nada.
    const filas = cargasDeLaLinea(lineaSintetica(), tramosSinteticos(), CONDUCTOR, HIPOTESIS);
    assert.equal(filas[4].utilizacion, null);
    assert.ok(filas[4].notas.some((t) => /Sin utilización/.test(t)));
  });

  test('si el reparto de tramos no cuadra, no se reparte NINGÚN tiro', () => {
    // Un desfase de un apoyo le atribuiría a una estructura el tiro de otro
    // tramo: número creíble, unidades correctas, y equivocado. La peor clase de
    // error, porque no se ve. Mejor cinco huecos que cinco mentiras.
    const filas = cargasDeLaLinea(lineaSintetica(), [{ vanos: [300], estados: ESTADOS }], CONDUCTOR, HIPOTESIS);
    for (const f of filas) {
      assert.equal(f.tiro_kgf, null);
      assert.equal(f.ftAngulo_kgf, null);
      assert.match(f.noEvaluable, /cálculo mecánico del tramo/);
    }
  });

  test('el apoyo que ancla dos tramos con tiros distintos lo declara', () => {
    // La fórmula 2·H·sen(α/2) supone el MISMO tiro a los dos lados. Con tiros
    // distintos el valor sigue sirviendo como envolvente, pero deja de ser
    // exacto — y eso se dice, no se calla.
    const desiguales = [
      { vanos: [300, 400], estados: ESTADOS },
      { vanos: [350, 250], estados: { ...ESTADOS, tMin: { nombre: 'Mínima temperatura', H: 2100 } } },
    ];
    const filas = cargasDeLaLinea(lineaSintetica(), desiguales, CONDUCTOR, HIPOTESIS);
    assert.deepEqual(filas[2].tramos_n, [1, 2], 'AP-03 cuelga de los dos tramos');
    assert.ok(filas[2].notas.some((t) => /ancla dos tramos con tiros distintos/.test(t)));
    assert.equal(filas[2].tiroMaximo_kgf, 2100, 'se usa el mayor de los dos: es envolvente');
  });

  test('la deflexión declarada manda sobre la geométrica', () => {
    // La declarada puede venir corregida a mano tras una visita a campo. La
    // geodésica es el respaldo, no la autoridad.
    const apoyos = lineaSintetica();
    apoyos[3].coordenada = { lat: 45.0, lon: 7.004 }; // coordenada sintética
    const filas = cargasDeLaLinea(apoyos, tramosSinteticos(), CONDUCTOR, HIPOTESIS);
    assert.equal(filas[2].deflexion_grados, 118);
  });

  test('sin deflexión declarada se calcula con la geometría (ángulo recto sintético)', () => {
    // Tres puntos inventados en (45°, 7°) que forman una L: la línea entra por
    // el este y sale por el norte, así que la deflexión es 90°. No es 90,000000
    // exacto porque el rumbo de una geodésica entre dos puntos de la misma
    // latitud no es 90° clavados sobre un elipsoide — se abomba hacia el polo.
    const apoyos = [
      { nombre: 'AP-A', coordenada: { lat: 45.0, lon: 7.0 } },
      { nombre: 'AP-B', coordenada: { lat: 45.0, lon: 7.004 } },
      { nombre: 'AP-C', coordenada: { lat: 45.004, lon: 7.004 } },
    ];
    const filas = cargasDeLaLinea(apoyos, [{ vanos: [1, 1], estados: ESTADOS }], CONDUCTOR,
      { ...HIPOTESIS, nConductores: 3 });
    cerca(filas[1].deflexion_grados, 90, 0.01, 'deflexión geodésica del codo');
    // Vano viento = semisuma de los dos vanos medidos con Vincenty:
    // ~315 m al este y ~445 m al norte → ~380 m.
    assert.ok(filas[1].vanoViento_m > 370 && filas[1].vanoViento_m < 390,
      `vano viento fuera de lo esperado: ${filas[1].vanoViento_m}`);
    assert.equal(filas[1].noEvaluable, null, 'con coordenadas la fila SÍ se puede evaluar');
  });

  test('un vano intermedio sin longitud NO se toma como cero', () => {
    // Trampa fina: `geodesia.vanoViento` trata el null como 0, y eso solo vale
    // en un extremo. En un apoyo intermedio, un vano desconocido tomado como 0
    // recorta a la mitad el empuje del viento sin que nada avise.
    const apoyos = lineaSintetica();
    delete apoyos[3].vanoAnterior_m; // AP-03 pierde su vano de entrada
    const filas = cargasDeLaLinea(apoyos, tramosSinteticos(), CONDUCTOR, HIPOTESIS);
    assert.equal(filas[2].vanoViento_m, null);
    assert.equal(filas[2].ftViento_kgf, null);
    assert.equal(filas[2].ftTotal_kgf, null);
    assert.match(filas[2].noEvaluable, /vanos adyacentes/);
  });

  test('es una función PURA: no toca lo que le entra', () => {
    // Si mutara los apoyos, un recálculo daría distinto al anterior y nadie
    // podría reproducir el informe que ya se firmó.
    const apoyos = lineaSintetica();
    const tramos = tramosSinteticos();
    const copiaA = structuredClone(apoyos);
    const copiaT = structuredClone(tramos);
    cargasDeLaLinea(apoyos, tramos, CONDUCTOR, HIPOTESIS);
    assert.deepEqual(apoyos, copiaA);
    assert.deepEqual(tramos, copiaT);
  });

  test('sin apoyos, sin tramos o con basura no explota: devuelve tabla vacía o huecos', () => {
    assert.deepEqual(cargasDeLaLinea([], [], CONDUCTOR, HIPOTESIS), []);
    assert.deepEqual(cargasDeLaLinea(undefined, undefined, undefined, undefined), []);
    const filas = cargasDeLaLinea(lineaSintetica(), undefined, undefined, undefined);
    assert.equal(filas.length, 5);
    for (const f of filas) assert.ok(f.noEvaluable, 'toda fila sin datos debe traer su motivo escrito');
  });

  test('cada fila cuadra consigo misma: total = quiebre + viento', () => {
    // Control de cordura sobre la tabla entera. Si una fila dejara de cuadrar,
    // el informe tendría una suma que no suma y el revisor lo vería antes que
    // nosotros.
    const filas = cargasDeLaLinea(lineaSintetica(), tramosSinteticos(), CONDUCTOR, HIPOTESIS);
    for (const f of filas) {
      if (f.ftTotal_kgf === null) continue;
      cerca(f.ftTotal_kgf, f.ftAngulo_kgf + f.ftViento_kgf, 1e-9, `fila ${f.apoyo}`);
      cerca(f.ftAngulo_kgf, f.factorAngulo * f.tiro_kgf * f.nConductores, 1e-9, `quiebre de ${f.apoyo}`);
      cerca(f.ftViento_kgf, f.cargaViento_kg_m * f.vanoViento_m * f.nConductores, 1e-9, `viento de ${f.apoyo}`);
    }
  });
});
