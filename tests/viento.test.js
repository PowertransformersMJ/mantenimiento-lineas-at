// ============================================================================
// tests/viento.test.js — pruebas de la caracterización del viento
// ----------------------------------------------------------------------------
// Ningún valor esperado sale de ejecutar el módulo y copiar lo que dio: eso
// congela el error en verde. Salen de tres sitios independientes:
//
//   (a) ARITMÉTICA DE CABEZA con números elegidos redondos. 36 km/h son 10 m/s
//       exactos, así que con ρ = 1,2 kg/m³ la presión es 0,5·1,2·10² = 60 Pa
//       EXACTOS, sin decimales y sin tolerancia. Sobre un cable de 25 mm eso
//       son 60 · 0,025 = 1,5 N por metro, y en kilogramos-fuerza 1,5 ÷ g.
//   (b) IDENTIDADES FÍSICAS que el resultado tiene que cumplir sí o sí: la
//       presión va con el CUADRADO de la velocidad; la resultante es la
//       hipotenusa de peso y empuje, así que nunca puede ser menor que el peso;
//       la tangente del ángulo de balanceo es exactamente la relación
//       empuje/peso.
//   (c) CASOS DEGENERADOS con respuesta obvia: sin viento el ángulo es 0 y la
//       resultante es el peso propio, exactamente.
//
// La única constante que se escribe aquí es g = 9,80665 m/s², que es la
// gravedad estándar publicada, no una cifra del código.
//
// ⚠️ Todos los datos son SINTÉTICOS: este repositorio es público. Conductor
// inventado, tramos con letras, ni una coordenada, ni un nombre de estructura
// real. Nada de la línea del cliente entra aquí.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { caracterizacionViento } from '../web/src/vistas/vientoDatos.ts';

// ── Constantes y datos sintéticos ───────────────────────────────────────────

/** Gravedad estándar (CGPM, 1901). Sirve para pasar de newton a kgf. */
const G = 9.80665;

/** Presión a 36 km/h (= 10 m/s) con aire de 1,2 kg/m³: 0,5·1,2·100 = 60 Pa. */
const PRESION_36KMH = 60;

/** Empuje sobre un cable de 25 mm con cx = 1: 60 Pa · 0,025 m = 1,5 N/m → kgf. */
const CARGA_36KMH_D25 = 1.5 / G;   // 0,152957431946689 kg/m

/** Conductor de laboratorio: cifras redondas, ningún catálogo real. */
const CONDUCTOR = Object.freeze({
  codigo: 'SINTETICO-25',
  material: 'ACSR',
  seccion_mm2: 300,
  diametro_m: 0.025,
  masaLineal_kg_m: 1,
  rts_kgf: 10000,
  moduloElastico_kg_mm2: 7000,
  dilatacion_1_C: 1.9e-5,
  tempMaxOperacion_C: 75,
  procedencia: 'supuesto',
});

const HIPOTESIS = Object.freeze({
  nombre: 'sintética',
  eds_pct: 20, tempEds_C: 25, tempMax_C: 75, tempMin_C: 10,
  vientoMax_kmh: 36, tempViento_C: 25,
  cx: 1.0, densidadAire_kg_m3: 1.2,
  procedencia: 'supuesto',
});

/** Dos tramos con cifras redondas. `hViento` es el tiro del estado de viento. */
const TRAMOS = Object.freeze([
  Object.freeze({ n: 1, desde: 'A', hasta: 'B', vanoMax: 200, hViento: 2000 }),
  Object.freeze({ n: 2, desde: 'B', hasta: 'C', vanoMax: 300, hViento: 5000 }),
]);

const con = (cambios = {}, cambiosH = {}, tramos = TRAMOS) =>
  caracterizacionViento({ ...CONDUCTOR, ...cambios }, { ...HIPOTESIS, ...cambiosH }, tramos);

const cerca = (real, esperado, tol, msg) =>
  assert.ok(Math.abs(real - esperado) <= tol,
    `${msg}: ${real} vs ${esperado} esperado (tolerancia ${tol})`);

const avisoQueHabla = (r, texto) =>
  r.avisos.find((a) => (a.concepto + ' ' + a.motivo).toLowerCase().includes(texto.toLowerCase()));

// ════════════════════════════════════════════════════════════════════════════
describe('la presión del viento va con el CUADRADO de la velocidad', () => {

  test('caso exacto de cabeza: 36 km/h y aire de 1,2 kg/m³ → 60 Pa', () => {
    // 36 km/h ÷ 3,6 = 10 m/s exactos. 0,5 · 1,2 · 10² = 60. Sin tolerancia: si
    // esto falla, la conversión de km/h a m/s está mal, y con ella TODO lo demás.
    assert.equal(con().presion_Pa, PRESION_36KMH);
  });

  test('doblar la velocidad CUADRUPLICA la presión', () => {
    // Es la propiedad que hace del viento el estado que manda: una hipótesis un
    // 30 % más alta no cuesta un 30 % más de carga, cuesta un 69 % más. Quien
    // discute la velocidad de diseño necesita ver esto.
    const base = con({}, { vientoMax_kmh: 20 }).presion_Pa;
    for (const factor of [1, 2, 3, 4, 10]) {
      const r = con({}, { vientoMax_kmh: 20 * factor });
      cerca(r.presion_Pa, base * factor * factor, base * factor * factor * 1e-12,
        `presión a ${20 * factor} km/h`);
    }
  });

  test('la presión es proporcional a la densidad del aire', () => {
    const p12 = con({}, { densidadAire_kg_m3: 1.2 }).presion_Pa;
    const p06 = con({}, { densidadAire_kg_m3: 0.6 }).presion_Pa;
    cerca(p06, p12 / 2, 1e-12, 'aire con la mitad de densidad, mitad de presión');
  });

  test('el empuje sobre el cable, calculado a mano: 1,5 N/m pasados a kgf', () => {
    // 60 Pa sobre una cara de 0,025 m por metro de cable = 1,5 N/m. En kilos de
    // fuerza, 1,5 ÷ 9,80665. El núcleo trabaja en kgf y kg/m, no en newton.
    cerca(con().cargaViento_kg_m, CARGA_36KMH_D25, 1e-15, 'empuje por metro');
  });

  test('el empuje es proporcional al diámetro: cable más gordo, más vela', () => {
    const fino = con({ diametro_m: 0.01 }).cargaViento_kg_m;
    const gordo = con({ diametro_m: 0.03 }).cargaViento_kg_m;
    cerca(gordo, fino * 3, fino * 3 * 1e-12, 'triple diámetro, triple empuje');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el ángulo de balanceo: 0 sin viento y creciente con él', () => {

  test('sin viento el ángulo es CERO y la resultante es el peso propio, exacto', () => {
    // Caso degenerado con respuesta obvia: si sale otra cosa, hay una división
    // por cero o un atan mal orientado escondido.
    const r = con({}, { vientoMax_kmh: 0 });
    assert.equal(r.presion_Pa, 0, 'presión');
    assert.equal(r.cargaViento_kg_m, 0, 'empuje');
    assert.equal(r.anguloBalanceo_grados, 0, 'ángulo');
    assert.equal(r.relacionVientoPeso, 0, 'relación empuje/peso');
    assert.equal(r.resultante_kg_m, CONDUCTOR.masaLineal_kg_m, 'resultante = peso propio');
  });

  test('el ángulo CRECE de forma monótona con la velocidad, y nunca alcanza 90°', () => {
    // Nunca 90° porque el peso no desaparece: por mucho viento que sople, el
    // cable no llega a quedar horizontal. Un 90° en pantalla sería una fórmula
    // rota, no un huracán.
    let anterior = -1;
    for (const kmh of [0, 10, 20, 40, 80, 160, 320]) {
      const r = con({}, { vientoMax_kmh: kmh });
      assert.ok(r.anguloBalanceo_grados > anterior,
        `a ${kmh} km/h el ángulo (${r.anguloBalanceo_grados}) no creció respecto a ${anterior}`);
      assert.ok(r.anguloBalanceo_grados < 90, `a ${kmh} km/h el ángulo llegó a 90° o más`);
      anterior = r.anguloBalanceo_grados;
    }
  });

  test('45° EXACTOS cuando el empuje iguala al peso', () => {
    // Se elige un conductor cuyo peso por metro sea exactamente el empuje
    // calculado a mano arriba. Si el empuje y el peso son iguales, el cable
    // cuelga a media asta entre la vertical y la horizontal: 45°, sin discusión.
    const r = con({ masaLineal_kg_m: CARGA_36KMH_D25 });
    cerca(r.anguloBalanceo_grados, 45, 1e-9, 'ángulo con empuje = peso');
    cerca(r.relacionVientoPeso, 1, 1e-12, 'relación empuje/peso');
    cerca(r.resultante_kg_m, CARGA_36KMH_D25 * Math.SQRT2, 1e-15, 'resultante = peso · √2');
  });

  test('IDENTIDAD: la tangente del ángulo es la relación empuje/peso', () => {
    // No es redundante con lo anterior: amarra las dos cifras que se publican
    // juntas en el tablero. Si una se calculara con otro criterio, aquí se ve.
    for (const kmh of [12, 36, 75, 120]) {
      for (const peso of [0.5, 1, 2.4]) {
        const r = con({ masaLineal_kg_m: peso }, { vientoMax_kmh: kmh });
        cerca(Math.tan((r.anguloBalanceo_grados * Math.PI) / 180), r.relacionVientoPeso,
          1e-12, `tan(ángulo) a ${kmh} km/h con w = ${peso}`);
      }
    }
  });

  test('el ángulo crece si el cable es más liviano y baja si es más pesado', () => {
    const liviano = con({ masaLineal_kg_m: 0.5 }).anguloBalanceo_grados;
    const medio = con({ masaLineal_kg_m: 1 }).anguloBalanceo_grados;
    const pesado = con({ masaLineal_kg_m: 3 }).anguloBalanceo_grados;
    assert.ok(liviano > medio && medio > pesado,
      `el peso debe frenar el balanceo: ${liviano} > ${medio} > ${pesado}`);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('la resultante es SIEMPRE mayor que el peso propio', () => {

  test('IDENTIDAD DE PITÁGORAS: resultante² = peso² + empuje²', () => {
    for (const kmh of [5, 36, 90, 200]) {
      for (const peso of [0.3, 1, 2.4]) {
        const r = con({ masaLineal_kg_m: peso }, { vientoMax_kmh: kmh });
        cerca(r.resultante_kg_m ** 2, peso ** 2 + r.cargaViento_kg_m ** 2,
          1e-12, `Pitágoras a ${kmh} km/h con w = ${peso}`);
      }
    }
  });

  test('con viento la resultante SUPERA al peso; sin viento lo iguala', () => {
    // Es lo que justifica que el estado de viento se calcule aparte: el cable
    // pesa más de lo que dice su ficha en cuanto sopla, y ese exceso es el que
    // tira de las estructuras.
    for (const kmh of [1, 10, 36, 120]) {
      const r = con({}, { vientoMax_kmh: kmh });
      assert.ok(r.resultante_kg_m > CONDUCTOR.masaLineal_kg_m,
        `a ${kmh} km/h la resultante (${r.resultante_kg_m}) no supera al peso propio`);
    }
    assert.equal(con({}, { vientoMax_kmh: 0 }).resultante_kg_m, CONDUCTOR.masaLineal_kg_m);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('la tabla por tramo', () => {

  test('el % de la rotura es aritmética de cabeza', () => {
    // 2 000 kgf de 10 000 son 20 %; 5 000 de 10 000 son 50 %. Exacto.
    const r = con();
    assert.equal(r.porTramo.length, 2);
    assert.equal(r.porTramo[0].pctRts, 20);
    assert.equal(r.porTramo[1].pctRts, 50);
    assert.equal(r.porTramo[0].tiroViento_kgf, 2000, 'el tiro se pasa tal cual, no se recalcula');
    assert.equal(r.porTramo[0].desde, 'A');
    assert.equal(r.porTramo[1].hasta, 'C');
  });

  test('la flecha con viento usa la RESULTANTE, no el peso propio', () => {
    // Discriminador: a igual tiro horizontal, más viento = más carga colgando =
    // más flecha. Si el módulo hubiera usado el peso propio, la flecha saldría
    // idéntica soplara o no — que es justo el error que se quiere cazar.
    const suave = con({}, { vientoMax_kmh: 10 }).porTramo[0].flechaViento_m;
    const fuerte = con({}, { vientoMax_kmh: 120 }).porTramo[0].flechaViento_m;
    assert.ok(fuerte > suave, `más viento debe dar más flecha: ${fuerte} vs ${suave}`);
  });

  test('la flecha cumple la aproximación parabólica a²/(8·C), como debe', () => {
    // Vía independiente: para vanos cortos frente al parámetro C = H/w, la
    // catenaria y la parábola coinciden salvo décimas de por mil. Con w = 1
    // kg/m, H = 2 000 kgf y a = 200 m: C = 2 000 m y la parábola da
    // 200² / (8 · 2 000) = 2,5 m. La carga real es algo mayor que 1 (lleva el
    // viento), así que la flecha sale algo mayor que 2,5 — y se comprueba con
    // la parábola calculada con la resultante que el propio resultado publica.
    const r = con();
    const C = 2000 / r.resultante_kg_m;
    const parabola = (200 * 200) / (8 * C);
    cerca(r.porTramo[0].flechaViento_m, parabola, parabola * 0.01, 'flecha vs parábola');
    assert.ok(r.porTramo[0].flechaViento_m > parabola,
      'la catenaria cuelga SIEMPRE más que la parábola: si sale al revés, hay un signo cambiado');
  });

  test('IDENTIDAD EXACTA de la catenaria, con la carga calculada a mano', () => {
    // La prueba de la parábola de arriba admite un 1 % de holgura, y con esa
    // holgura pasaría también un módulo que usara una carga equivocada por poco
    // (el peso propio y la resultante solo se diferencian aquí en un 1,2 %).
    // Ésta no perdona: reconstruye la flecha con la fórmula exacta
    // f = C·(cosh(a/2C) − 1) y con la resultante calculada A MANO desde las
    // constantes del encabezado — no desde lo que el módulo devolvió. Si alguien
    // vuelve a colgar el cable de su peso propio en vez de la resultante, esto
    // se pone rojo y dice exactamente cuánto se equivocó.
    const wResultante = Math.hypot(1, CARGA_36KMH_D25);   // peso 1 kg/m ⊕ empuje
    const C = 2000 / wResultante;                          // C = H/w, con H = 2 000 kgf
    const flechaExacta = C * (Math.cosh(200 / (2 * C)) - 1);
    cerca(con().porTramo[0].flechaViento_m, flechaExacta, 1e-12, 'flecha por catenaria exacta');
  });

  test('la flecha crece con el vano', () => {
    const r = con({}, {}, [
      { n: 1, desde: 'A', hasta: 'B', vanoMax: 100, hViento: 2000 },
      { n: 2, desde: 'B', hasta: 'C', vanoMax: 400, hViento: 2000 },
    ]);
    assert.ok(r.porTramo[1].flechaViento_m > r.porTramo[0].flechaViento_m);
  });

  test('sin tramos no se inventa ninguna fila, y se dice', () => {
    const r = con({}, {}, []);
    assert.deepEqual(r.porTramo, []);
    assert.ok(avisoQueHabla(r, 'Sin tramos de tensión'), 'debe declarar por qué no hay tabla');
    // Las magnitudes del conductor SÍ salen: no dependen de que haya tramos.
    assert.equal(r.presion_Pa, PRESION_36KMH);
  });

  test('un tramo con tiro no numérico da fila con huecos, no NaN', () => {
    const r = con({}, {}, [{ n: 1, desde: 'A', hasta: 'B', vanoMax: 200, hViento: null }]);
    assert.equal(r.porTramo[0].tiroViento_kgf, null);
    assert.equal(r.porTramo[0].pctRts, null);
    assert.equal(r.porTramo[0].flechaViento_m, null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('lo que no se puede calcular se declara — nunca se rellena', () => {

  test('sin velocidad de viento no hay nada, y se dice con severidad alta', () => {
    const r = con({}, { vientoMax_kmh: undefined });
    for (const campo of ['presion_Pa', 'cargaViento_kg_m', 'resultante_kg_m',
                         'anguloBalanceo_grados', 'relacionVientoPeso']) {
      assert.equal(r[campo], null, `${campo} debe quedar sin evaluar, no en cero`);
    }
    const a = avisoQueHabla(r, 'Velocidad de viento no declarada');
    assert.ok(a, 'debe declarar que falta la velocidad');
    assert.equal(a.severidad, 'atencion');
  });

  test('sin diámetro no hay superficie: el empuje queda sin evaluar, la presión no', () => {
    // La presión es del AIRE, no del cable: se puede dar aunque falte el
    // conductor. El empuje no. Distinguirlo evita borrar información buena.
    const r = con({ diametro_m: undefined });
    assert.equal(r.presion_Pa, PRESION_36KMH, 'la presión no depende del conductor');
    assert.equal(r.cargaViento_kg_m, null);
    assert.equal(r.resultante_kg_m, null);
    assert.equal(r.anguloBalanceo_grados, null);
    assert.ok(avisoQueHabla(r, 'Diámetro del conductor ausente'));
  });

  test('sin masa lineal no hay con qué componer', () => {
    const r = con({ masaLineal_kg_m: 0 });
    assert.equal(r.pesoPropio_kg_m, null, 'un peso de 0 kg/m no es un dato, es una ausencia');
    assert.equal(r.anguloBalanceo_grados, null);
    assert.equal(r.resultante_kg_m, null);
    assert.ok(avisoQueHabla(r, 'Masa lineal del conductor ausente'));
  });

  test('sin RTS los tiros se muestran, pero el porcentaje no se inventa', () => {
    const r = con({ rts_kgf: undefined });
    assert.equal(r.porTramo[0].tiroViento_kgf, 2000);
    assert.equal(r.porTramo[0].pctRts, null);
    assert.ok(avisoQueHabla(r, 'Carga de rotura'));
  });

  test('cx y densidad no declarados: se calcula con el defecto del núcleo y SE DICE', () => {
    // El defecto de aire estándar (1,2 kg/m³) y cx = 1,0 sigue dando los 60 Pa y
    // el 1,5 N/m calculados a mano. Lo que no puede pasar es que se use en
    // silencio: sin el aviso, nadie sabría que hay dos supuestos dentro.
    const r = con({}, { cx: undefined, densidadAire_kg_m3: undefined });
    assert.equal(r.presion_Pa, PRESION_36KMH);
    cerca(r.cargaViento_kg_m, CARGA_36KMH_D25, 1e-15, 'empuje con los valores por defecto');
    assert.ok(avisoQueHabla(r, 'Coeficiente de arrastre'), 'debe declarar el cx supuesto');
    assert.ok(avisoQueHabla(r, 'Densidad del aire'), 'debe declarar la densidad supuesta');
  });

  test('la distancia mínima entre fases se declara NO EVALUABLE, siempre', () => {
    // Aunque todos los datos estén completos y perfectos. Es el límite del
    // módulo: falta la geometría de la cruceta, y sin ella un despeje sería un
    // número inventado en una memoria que alguien firma.
    for (const r of [con(), con({}, { vientoMax_kmh: 0 }), con({ diametro_m: undefined })]) {
      const a = avisoQueHabla(r, 'Distancia mínima entre fases');
      assert.ok(a, 'la declaración de no evaluable no puede faltar en ningún escenario');
      assert.match(a.motivo, /cruceta/i);
    }
  });

  test('el ángulo publicado declara que NO es el de la cadena de suspensión', () => {
    const a = avisoQueHabla(con(), 'cadena de suspensión');
    assert.ok(a, 'debe declararse la simplificación de vano peso = vano viento');
    assert.match(a.motivo, /vaguada/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('hallazgos y orden de lectura', () => {

  test('un tramo que pasa del 50 % de la rotura solo con viento se marca como atención', () => {
    const r = con({}, {}, [
      { n: 1, desde: 'A', hasta: 'B', vanoMax: 200, hViento: 2000 },
      { n: 2, desde: 'B', hasta: 'C', vanoMax: 300, hViento: 6000 },   // 60 % de 10 000
    ]);
    const a = avisoQueHabla(r, 'supera el tiro admisible');
    assert.ok(a, 'un tramo por encima del umbral adoptado tiene que salir');
    assert.equal(a.severidad, 'atencion');
    assert.match(a.motivo, /Tramos 2\b/);
  });

  test('justo en el umbral (50 %) NO se marca: el criterio es superarlo', () => {
    // El tramo 2 de los datos base va exactamente al 50 %. Marcarlo sería
    // discutir con el propio criterio declarado.
    assert.equal(avisoQueHabla(con(), 'supera el tiro admisible'), undefined);
  });

  test('los avisos salen ordenados de más grave a menos', () => {
    const rango = { atencion: 0, aviso: 1, info: 2 };
    const r = con({ diametro_m: undefined, rts_kgf: undefined }, { cx: undefined });
    let anterior = -1;
    for (const a of r.avisos) {
      assert.ok(rango[a.severidad] >= anterior,
        `aviso fuera de orden: ${a.severidad} después de rango ${anterior}`);
      anterior = rango[a.severidad];
    }
    assert.ok(r.avisos.length >= 3);
  });

  test('la función es PURA: no toca lo que le entra', () => {
    // Las entradas van congeladas. Si el módulo intentara escribir en el
    // conductor, la hipótesis o los tramos, Node lanzaría en modo estricto.
    assert.doesNotThrow(() => caracterizacionViento(CONDUCTOR, HIPOTESIS, TRAMOS));
    assert.equal(CONDUCTOR.diametro_m, 0.025);
    assert.equal(TRAMOS[0].hViento, 2000);
  });

  test('sin conductor y sin hipótesis no explota: devuelve huecos y los explica', () => {
    // La pantalla puede montarse antes de que haya datos cargados. Reventar
    // aquí dejaría la pestaña en blanco sin decir por qué.
    const r = caracterizacionViento(undefined, undefined, undefined);
    assert.equal(r.presion_Pa, null);
    assert.equal(r.anguloBalanceo_grados, null);
    assert.deepEqual(r.porTramo, []);
    assert.ok(r.avisos.length > 0, 'un hueco sin motivo es peor que un hueco con motivo');
  });
});
