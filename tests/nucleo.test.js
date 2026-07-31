// ============================================================================
// tests/nucleo.test.js — pruebas de oro del núcleo de cálculo
// ----------------------------------------------------------------------------
// Estas pruebas son la red de seguridad de la migración: mientras pasen, el
// sistema nuevo calcula lo mismo que el módulo de campo original.
//
// Los valores esperados NO salen del propio código (eso sería circular). Salen
// de: (a) constantes geodésicas WGS84 publicadas, (b) identidades matemáticas
// verificables a mano, (c) tablas de fabricante, (d) propiedades físicas que el
// resultado debe cumplir sí o sí.
//
// ⚠️ Los datos reales de la línea LN-627 (coordenadas GPS de AFINIA) NO viven
// en este repo: viven en la bóveda privada. La prueba que los usa se SALTA
// sola cuando la bóveda no está (p. ej. en CI), y lo dice.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { vincenty, rumbo, deflexion, recorrer, vanoViento, vanoIdealRegulacion } from '../nucleo/geodesia.js';
import {
  flechaCatenaria, longitudCatenaria, flechaParabola, longitudParabola,
  presionDinamica, cargaViento, cargaResultante, cambioEstado,
  tramosDeTension, esAncla, FUNCIONES_ANCLA, tiroMaximoAdmisible,
  vanoPeso, relacionPesoViento,
} from '../nucleo/mecanica.js';
import { resistenciaDC, ampacidad, temperaturaLimite, MATERIALES } from '../nucleo/termica.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const cerca = (real, esperado, tol, msg) =>
  assert.ok(Math.abs(real - esperado) <= tol,
    `${msg}: ${real} vs ${esperado} esperado (tolerancia ${tol})`);

// ════════════════════════════════════════════════════════════════════════════
describe('geodesia — contra constantes WGS84 publicadas', () => {

  test('1° de latitud en el ecuador = 110 574,389 m', () => {
    cerca(vincenty(0, 0, 1, 0).d, 110574.389, 0.01, 'arco de meridiano');
  });

  test('1° de longitud en el ecuador = 111 319,491 m', () => {
    cerca(vincenty(0, 0, 0, 1).d, 111319.491, 0.01, 'arco de paralelo');
  });

  test('cuarto de meridiano (ecuador→polo) = 10 001 965,7 m', () => {
    cerca(vincenty(0, 0, 90, 0).d, 10001965.7, 1.0, 'cuarto de meridiano');
  });

  test('azimuts cardinales', () => {
    cerca(vincenty(0, 0, 1, 0).az, 0, 1e-6, 'hacia el norte');
    cerca(vincenty(0, 0, 0, 1).az, 90, 1e-6, 'hacia el este');
  });

  test('puntos coincidentes no rompen la iteración', () => {
    assert.deepEqual(vincenty(10.35, -75.49, 10.35, -75.49), { d: 0, az: 0 });
  });

  test('la distancia es simétrica', () => {
    // Coordenadas arbitrarias a latitud caribeña. NO son de una línea real:
    // las coordenadas de infraestructura de cliente no viven en este repo.
    const ida = vincenty(10.0, -75.0, 10.001, -75.0004).d;
    const vuelta = vincenty(10.001, -75.0004, 10.0, -75.0).d;
    cerca(ida, vuelta, 1e-9, 'ida y vuelta');
  });

  test('rumbos', () => {
    assert.equal(rumbo(0), 'N');
    assert.equal(rumbo(90), 'E');
    assert.equal(rumbo(180), 'S');
    assert.equal(rumbo(225), 'SO');
    assert.equal(rumbo(370), 'N', 'debe normalizar por encima de 360°');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('geodesia — topología de la línea', () => {

  test('VIR = √(Σa³/Σa), verificable a mano', () => {
    // (100³+200³+300³)/(100+200+300) = 36 000 000/600 = 60 000 → √60 000
    cerca(vanoIdealRegulacion([100, 200, 300]), Math.sqrt(60000), 1e-9, 'VIR');
  });

  test('con vanos iguales, el VIR es ese vano', () => {
    cerca(vanoIdealRegulacion([150, 150, 150, 150]), 150, 1e-9, 'VIR uniforme');
  });

  test('el VIR pondera hacia los vanos largos (no es la media)', () => {
    const v = [50, 50, 400];
    assert.ok(vanoIdealRegulacion(v) > v.reduce((s, x) => s + x, 0) / v.length,
      'el VIR debe superar a la media aritmética');
  });

  test('VIR sin vanos válidos = null', () => {
    assert.equal(vanoIdealRegulacion([]), null);
  });

  test('el vano viento es la semisuma de los adyacentes', () => {
    cerca(vanoViento(100, 200), 150, 1e-12, 'vano viento');
    cerca(vanoViento(null, 200), 100, 1e-12, 'extremo de línea');
  });

  test('la deflexión es null en los extremos y 0 en línea recta', () => {
    const recta = [
      { lat: 0, lon: 0 }, { lat: 0, lon: 0.01 }, { lat: 0, lon: 0.02 },
    ];
    assert.equal(deflexion(recta, 0), null, 'primer apoyo');
    assert.equal(deflexion(recta, 2), null, 'último apoyo');
    cerca(deflexion(recta, 1), 0, 1e-6, 'apoyo alineado');
  });

  test('la deflexión detecta un quiebre de 90°', () => {
    const quiebre = [
      { lat: 0, lon: 0 }, { lat: 0, lon: 0.01 }, { lat: 0.01, lon: 0.01 },
    ];
    cerca(deflexion(quiebre, 1), 90, 0.05, 'quiebre recto');
  });

  test('recorrer acumula la progresiva', () => {
    const r = recorrer([{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }, { lat: 0, lon: 0.002 }]);
    assert.equal(r[0].progresiva, 0);
    cerca(r[2].progresiva, r[1].vanoAnterior + r[2].vanoAnterior, 1e-9, 'suma de vanos');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('mecánica — catenaria y parábola', () => {
  // Conductor Darien AAAC del módulo de campo: w = 0,776 kg/m · RTS = 8 528 kgf
  const w = 0.776, RTS = 8528, H = 0.20 * RTS;

  test('en vanos cortos la parábola y la catenaria coinciden', () => {
    const a = 100;
    const rel = Math.abs(flechaCatenaria(w, a, H) - flechaParabola(w, a, H)) / flechaParabola(w, a, H);
    assert.ok(rel < 0.001, `diferencia relativa ${(rel * 100).toFixed(4)} % debería ser < 0,1 %`);
  });

  test('en el vano más largo de LN-627 (336,70 m) la diferencia sigue por debajo del 0,1 %', () => {
    const a = 336.697;
    const par = flechaParabola(w, a, H);
    const cat = flechaCatenaria(w, a, H);
    const rel = Math.abs(cat - par) / par;
    assert.ok(rel < 0.001, `diferencia ${(rel * 100).toFixed(3)} % — si crece, hay que usar catenaria`);
    assert.ok(cat > par, 'la catenaria siempre da flecha mayor que la parábola');
  });

  test('la longitud del conductor siempre supera al vano', () => {
    const a = 250;
    assert.ok(longitudCatenaria(w, a, H) > a);
    assert.ok(longitudParabola(a, flechaParabola(w, a, H)) > a);
  });

  test('más tiro = menos flecha (relación inversa)', () => {
    const a = 200;
    assert.ok(flechaCatenaria(w, a, H * 2) < flechaCatenaria(w, a, H));
  });

  test('la flecha crece con el cuadrado del vano', () => {
    // Al duplicar el vano con el mismo tiro, la flecha se cuadruplica.
    cerca(flechaParabola(w, 200, H) / flechaParabola(w, 100, H), 4, 1e-9, 'ley cuadrática');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('mecánica — viento', () => {

  test('la presión dinámica crece con el cuadrado de la velocidad', () => {
    cerca(presionDinamica(100) / presionDinamica(50), 4, 1e-9, 'q ∝ v²');
  });

  test('sin viento no hay carga transversal', () => {
    cerca(cargaViento(0.02179, 0), 0, 1e-12, 'viento nulo');
  });

  test('la carga resultante compone en cuadratura', () => {
    cerca(cargaResultante(3, 4), 5, 1e-12, 'triángulo 3-4-5');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('mecánica — ecuación de cambio de estado', () => {
  // Darien AAAC: S = 283,4 mm² · E = 6300 kg/mm² · α = 23,0e-6 /°C
  const base = { H1: 1705.6, w1: 0.776, t1: 28, w2: 0.776, a: 188.78, S: 283.4, E: 6300, alfa: 23.0e-6 };

  test('si nada cambia, el tiro no cambia', () => {
    const H2 = cambioEstado({ ...base, t2: 28 });
    cerca(H2, base.H1, 0.5, 'estado idéntico');
  });

  test('calentar el conductor AFLOJA el tiro', () => {
    assert.ok(cambioEstado({ ...base, t2: 75 }) < base.H1,
      'el conductor se dilata: el tiro debe bajar');
  });

  test('enfriar el conductor TENSA el tiro', () => {
    assert.ok(cambioEstado({ ...base, t2: 10 }) > base.H1,
      'el conductor se contrae: el tiro debe subir');
  });

  test('más carga (viento) TENSA el tiro', () => {
    assert.ok(cambioEstado({ ...base, t2: 28, w2: base.w1 * 2 }) > base.H1,
      'al duplicar la carga el tiro debe subir');
  });

  test('el resultado es monótono en la temperatura', () => {
    const H = [10, 28, 50, 75, 90].map((t2) => cambioEstado({ ...base, t2 }));
    for (let i = 1; i < H.length; i++) {
      assert.ok(H[i] < H[i - 1], `el tiro debe decrecer al subir la temperatura (paso ${i})`);
    }
  });

  test('el tiro admisible es el 50 % de la carga de rotura', () => {
    cerca(tiroMaximoAdmisible(8528), 4264, 1e-9, 'límite admisible');
  });

  // ── La validación que cierra la deuda de docs/40 §8 ──────────────────────
  // El solver se comprueba contra la IDENTIDAD FÍSICA de la que nace la
  // ecuación: L2 − L1 = alargamiento térmico + alargamiento elástico. Las
  // longitudes se calculan por CATENARIA, un camino independiente de la
  // ecuación parabólica que usa el solver. No es circular.
  test('el H2 devuelto satisface la identidad ΔL = térmico + elástico', () => {
    const c = { w: 0.776, S: 283.4, E: 6300, alfa: 23.0e-6 };
    const a = 188.78, H1 = 0.20 * 8528, t1 = 28;

    for (const t2 of [10, 20, 40, 55, 75, 90]) {
      const H2 = cambioEstado({ H1, w1: c.w, t1, w2: c.w, t2, a, S: c.S, E: c.E, alfa: c.alfa });
      const L1 = longitudCatenaria(c.w, a, H1);
      const L2 = longitudCatenaria(c.w, a, H2);
      const esperado = L1 * c.alfa * (t2 - t1) + (L1 * (H2 - H1)) / (c.E * c.S);
      // Tolerancia 0,1 mm sobre ~189 m de cable (5·10⁻⁷ relativo).
      cerca(L2 - L1, esperado, 1e-4, `identidad física a ${t2} °C`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('mecánica — vano peso y arrancamiento', () => {
  const base = { a1: 180, a2: 200, H: 1706, w: 0.776 };   // vano viento = 190 m

  test('en terreno plano el vano peso iguala al vano viento', () => {
    const r = vanoPeso({ ...base, zAnterior: 0, zApoyo: 0, zSiguiente: 0 });
    cerca(r.vanoPeso, r.vanoViento, 1e-12, 'terreno plano');
    cerca(r.vanoViento, 190, 1e-12, 'vano viento');
    assert.equal(r.arrancamiento, false);
  });

  test('en la cima de una loma el apoyo carga MÁS peso', () => {
    const r = vanoPeso({ ...base, zAnterior: 0, zApoyo: 15, zSiguiente: 0 });
    assert.ok(r.vanoPeso > r.vanoViento, 'la cima debe aumentar el vano peso');
    assert.ok(relacionPesoViento(r) > 2, 'con ±15 m el efecto es grande');
  });

  test('en una vaguada el vano peso se reduce', () => {
    const r = vanoPeso({ ...base, zAnterior: 0, zApoyo: -8, zSiguiente: 0 });
    assert.ok(r.vanoPeso < r.vanoViento);
    assert.ok(r.vanoPeso > 0, 'una vaguada suave todavía no arranca');
  });

  test('una vaguada pronunciada detecta ARRANCAMIENTO', () => {
    const r = vanoPeso({ ...base, zAnterior: 0, zApoyo: -25, zSiguiente: 0 });
    assert.ok(r.vanoPeso < 0, 'vano peso negativo');
    assert.equal(r.arrancamiento, true, 'debe marcarse la condición de arrancamiento');
  });

  test('en ladera uniforme se mantiene cerca del vano viento', () => {
    const r = vanoPeso({ ...base, zAnterior: 0, zApoyo: 10, zSiguiente: 20 });
    assert.ok(Math.abs(r.vanoPeso - r.vanoViento) < 25, 'pendiente constante casi no afecta');
  });

  test('en un extremo de línea no hay vano peso definido', () => {
    const r = vanoPeso({ ...base, a1: null, zAnterior: 0, zApoyo: 0, zSiguiente: 0 });
    assert.equal(r.vanoPeso, null);
    assert.equal(relacionPesoViento(r), null);
  });

  test('más tiro amplifica el efecto del relieve', () => {
    const flojo  = vanoPeso({ ...base, H: 1000, zAnterior: 0, zApoyo: 15, zSiguiente: 0 });
    const tenso  = vanoPeso({ ...base, H: 3000, zAnterior: 0, zApoyo: 15, zSiguiente: 0 });
    assert.ok(tenso.vanoPeso > flojo.vanoPeso,
      'a mayor tiro, el punto bajo se aleja y el apoyo de cima carga más');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('mecánica — tramos de tensión', () => {
  const apoyos = [
    { n: 1, funcionEstructural: 'Terminal' },
    { n: 2, funcionEstructural: 'Suspensión' },
    { n: 3, funcionEstructural: 'Suspensión' },
    { n: 4, funcionEstructural: 'Retención / anclaje' },
    { n: 5, funcionEstructural: 'Suspensión' },
    { n: 6, funcionEstructural: 'Terminal' },
  ];
  const vanos = [100, 150, 200, 120, 180];

  test('reconoce los anclajes por su función estructural — con los valores CANÓNICOS', () => {
    // Los cuatro valores del contrato que cortan tramo, tal cual se escriben.
    assert.ok(esAncla({ funcionEstructural: 'Retención / anclaje' }));
    assert.ok(esAncla({ funcionEstructural: 'Ángulo' }));
    assert.ok(esAncla({ funcionEstructural: 'Terminal' }));
    assert.ok(esAncla({ funcionEstructural: 'Derivación' }));
    // Los que NO cortan.
    assert.ok(!esAncla({ funcionEstructural: 'Suspensión' }));
    assert.ok(!esAncla({ funcionEstructural: 'Suspensión angular' }),
      'una suspensión angular sigue siendo suspensión: no corta el tramo');
    assert.ok(!esAncla({}), 'sin función declarada no es ancla');
    // Antes esto era una expresión regular y aceptaba CUALQUIER texto que
    // contuviera la sílaba. Ahora es una lista cerrada: un valor que no está
    // en el contrato no puede decidir en silencio dónde se corta un tramo.
    assert.ok(!esAncla({ funcionEstructural: 'Retención' }),
      'un valor fuera del contrato NO se acepta a la ligera');
    assert.ok(!esAncla({ funcionEstructural: 'poste terminal viejo' }),
      'un texto libre que contiene la sílaba tampoco');
  });

  test('la lista de anclajes del núcleo es IDÉNTICA a la del contrato', () => {
    // El núcleo no importa el contrato (debe seguir puro y sin dependencias),
    // así que la coincidencia no se confía a la memoria: se comprueba leyendo
    // el contrato como texto. Si alguien añade una función que ancla en un
    // sitio y no en el otro, esta prueba se pone roja.
    const fuente = readFileSync(join(AQUI, '..', 'contratos', 'src', 'activos.ts'), 'utf-8');
    const bloque = /FUNCIONES_ANCLA[^=]*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/.exec(fuente);
    assert.ok(bloque, 'no se encontró FUNCIONES_ANCLA en contratos/src/activos.ts');
    const delContrato = [...bloque[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual([...FUNCIONES_ANCLA].sort(), delContrato.sort(),
      'la lista del núcleo y la del contrato divergieron');
  });

  test('parte la línea en los anclajes', () => {
    const t = tramosDeTension(apoyos, vanos);
    assert.equal(t.length, 2, 'Terminal→Retención y Retención→Terminal');
    assert.deepEqual(t[0].vanos, [100, 150, 200]);
    assert.deepEqual(t[1].vanos, [120, 180]);
  });

  test('cada tramo calcula su propio VIR', () => {
    const t = tramosDeTension(apoyos, vanos);
    cerca(t[0].vir, vanoIdealRegulacion([100, 150, 200]), 1e-9, 'VIR del tramo 1');
    cerca(t[1].vir, vanoIdealRegulacion([120, 180]), 1e-9, 'VIR del tramo 2');
  });

  test('una línea sin anclajes intermedios es un solo tramo', () => {
    const simple = [{ funcionEstructural: 'Terminal' }, { funcionEstructural: 'Suspensión' }, { funcionEstructural: 'Terminal' }];
    assert.equal(tramosDeTension(simple, [100, 100]).length, 1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('térmica — resistencia', () => {
  const darien = { material: 'AAAC', seccion: 283.4, diametro: 0.02179 };

  test('R(20 °C) del Darien AAAC concuerda con la tabla del fabricante', () => {
    // Tabla ≈ 0,1198 Ω/km. Se admite 2 % por el factor de cableado aproximado.
    const calculado = resistenciaDC(darien, 20) * 1000;
    cerca(calculado, 0.1198, 0.1198 * 0.02, 'R20 en Ω/km');
  });

  test('la resistencia crece con la temperatura', () => {
    assert.ok(resistenciaDC(darien, 90) > resistenciaDC(darien, 20));
  });

  test('material desconocido cae en el genérico sin reventar', () => {
    assert.ok(resistenciaDC({ material: 'Inventado', seccion: 100 }, 20) > 0);
  });

  test('los límites térmicos por material son los del dominio', () => {
    assert.equal(temperaturaLimite('AAAC'), 90, 'aleación 6201-T81');
    assert.equal(temperaturaLimite('ACSR'), 75);
    assert.equal(temperaturaLimite('ACSS / ACCC'), 200);
    assert.equal(temperaturaLimite('Inventado'), 75, 'genérico conservador');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('térmica — ampacidad IEEE 738', () => {
  const darien = { material: 'AAAC', seccion: 283.4, diametro: 0.02179 };
  const caribe = { v: 0.61, eps: 0.5, abso: 0.5, qs: 1000, he: 10 };

  test('valor de referencia del módulo de campo: ~718 A a 90 °C', () => {
    cerca(ampacidad(darien, 90, 32, caribe), 718, 5, 'ampacidad nominal');
  });

  test('crece con la temperatura admitida en el conductor', () => {
    const I = [75, 80, 90, 100].map((tc) => ampacidad(darien, tc, 32, caribe));
    for (let i = 1; i < I.length; i++) assert.ok(I[i] > I[i - 1]);
  });

  test('cae al subir la temperatura ambiente — el caso Caribe', () => {
    const I = [25, 32, 38, 42].map((ta) => ampacidad(darien, 90, ta, caribe));
    for (let i = 1; i < I.length; i++) assert.ok(I[i] < I[i - 1]);
  });

  test('el viento es el factor dominante: en calma se pierde ~27 %', () => {
    const calma = ampacidad(darien, 90, 32, { ...caribe, v: 0 });
    const conViento = ampacidad(darien, 90, 32, caribe);
    const perdida = 1 - calma / conViento;
    assert.ok(perdida > 0.2 && perdida < 0.35,
      `pérdida por calma ${(perdida * 100).toFixed(1)} % — se esperaba en torno al 27 %`);
  });

  test('el sol resta capacidad', () => {
    assert.ok(ampacidad(darien, 90, 32, { ...caribe, qs: 1200 })
            < ampacidad(darien, 90, 32, { ...caribe, qs: 0 }));
  });

  test('si el conductor no puede evacuar ni el aporte solar, la ampacidad es 0', () => {
    // Conductor a la misma temperatura que el ambiente y con sol: no hay margen.
    assert.equal(ampacidad(darien, 32, 32, { ...caribe, v: 0 }), 0);
  });

  test('todos los materiales del catálogo están completos', () => {
    for (const [nombre, m] of Object.entries(MATERIALES)) {
      assert.ok(m.conductividad > 0 && m.conductividad <= 1, `${nombre}: conductividad`);
      assert.ok(m.beta > 0, `${nombre}: coeficiente térmico`);
      assert.ok(m.tMaxContinua > 0, `${nombre}: temperatura límite`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Prueba de NO REGRESIÓN contra la línea real. El fixture vive en la bóveda
// privada porque son coordenadas de infraestructura de cliente.
// ════════════════════════════════════════════════════════════════════════════
describe('no regresión — línea real LN-627', () => {
  const fixture = join(AQUI, '..', '..', 'brain-private', 'mantenimiento-lineas-at',
                       'fixtures', 'LN-627-geometria.json');

  test('reproduce los 25 vanos del levantamiento original', { skip: !existsSync(fixture) &&
      'fixture en la bóveda privada, no disponible aquí (esperado en CI)' }, () => {
    const apoyos = JSON.parse(readFileSync(fixture, 'utf-8'));
    let maxD = 0, maxAz = 0;
    for (let i = 1; i < apoyos.length; i++) {
      const r = vincenty(apoyos[i - 1].lat, apoyos[i - 1].lon, apoyos[i].lat, apoyos[i].lon);
      maxD = Math.max(maxD, Math.abs(r.d - apoyos[i].d));
      if (apoyos[i].az != null) maxAz = Math.max(maxAz, Math.abs(r.az - apoyos[i].az));
    }
    assert.ok(maxD < 1e-3, `desviación de distancia ${maxD} m — debe ser submilimétrica`);
    assert.ok(maxAz < 1e-6, `desviación de azimut ${maxAz}°`);

    const vanos = apoyos.filter((a) => a.d).map((a) => a.d);
    assert.equal(vanos.length, 25, 'la línea tiene 25 vanos');
    cerca(vanoIdealRegulacion(vanos), 188.78, 0.01, 'VIR de la línea completa');
  });
});
