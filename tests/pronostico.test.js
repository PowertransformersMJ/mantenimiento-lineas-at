// ============================================================================
// tests/pronostico.test.js — el tiempo que viene, leído para una línea
// ----------------------------------------------------------------------------
// LO QUE SE VIGILA AQUÍ NO SON NÚMEROS BONITOS: son cuatro formas de equivocarse
// que salen caras y no se ven venir.
//
//   1. LAS UNIDADES. La fuente publica el viento en m/s. Leer 9,4 como km/h da
//      un tercio del viento real y pinta una jornada tranquila donde no la hay.
//   2. EL EJE DE UNA LÍNEA NO ES UNA FLECHA. Promediar azimuts a pelo hace que
//      un vano al norte y otro al sur den 90° — la perpendicular exacta, o sea
//      el peor resultado posible. Se promedia con el ángulo doblado.
//   3. EL VIENTO QUE CARGA ES EL DE LADO. Publicar la velocidad a secas obliga a
//      hacer la descomposición de cabeza, y en el campo esa cuenta no se hace.
//   4. NO PREGUNTAR POR LA LÍNEA. La coordenada se redondea a una rejilla ANTES
//      de salir hacia un tercero: su registro de consultas no tiene por qué
//      saber dónde está una torre de un cliente (misma doctrina que
//      `nucleo/clima.js · cajaConsulta`).
//
// Y una quinta, que es de doctrina: un pronóstico NO se guarda. Es un modelo
// diciendo qué cree, no un hecho fechado. Guardarlo haría que dentro de un año
// se leyera como si alguien hubiera medido algo.
//
// Datos sintéticos: coordenadas del ecuador y el meridiano de Greenwich (L-23).
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  aKmh, puntoDeConsulta, ejeDeLaLinea, vientoSobreLaLinea, contraLaHipotesis,
  leerPronostico, avisosDelPronostico, eltiempoEnCastellano, TOPES_AVISO,
} from '../web/src/vistas/pronostico.ts';

const cerca = (real, esperado, tol, msg) =>
  assert.ok(Number.isFinite(real) && Math.abs(real - esperado) <= tol,
    `${msg}: ${real} vs ${esperado} (tolerancia ${tol})`);

// ════════════════════════════════════════════════════════════════════════════
describe('las unidades: la fuente habla en m/s', () => {

  test('9,4 m/s son 33,8 km/h, no 9,4', () => {
    cerca(aKmh(9.4), 33.84, 1e-9, 'conversión');
    // El error que esto impide: publicar 9 km/h donde soplan 34.
    assert.ok(aKmh(9.4) > 30, 'leer m/s como km/h pinta una jornada tranquila que no existe');
  });

  test('un hueco no se convierte en cero', () => {
    assert.equal(aKmh(null), null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('dónde se pregunta: nunca en la línea', () => {

  test('la coordenada sale REDONDEADA a la rejilla', () => {
    const p = puntoDeConsulta(0.341164, 0.486957);
    assert.notEqual(p.lat, 0.341164, 'salió la coordenada exacta del activo');
    assert.notEqual(p.lon, 0.486957);
    assert.equal(p.lat, 0.3);
    assert.equal(p.lon, 0.5);
  });

  test('el redondeo no aleja el punto más que la celda del modelo', () => {
    // 0,1° son ~11 km, del orden de la celda del modelo global: redondear no
    // cuesta precisión. Se comprueba que nunca se va más de media celda.
    for (const [lat, lon] of [[0.341, 0.487], [0.049, 0.049], [-33.9, 151.2], [0.35, 0.45]]) {
      const p = puntoDeConsulta(lat, lon);
      assert.ok(Math.abs(p.lat - lat) <= 0.0501, `latitud demasiado lejos: ${p.lat} vs ${lat}`);
      assert.ok(Math.abs(p.lon - lon) <= 0.0501, `longitud demasiado lejos: ${p.lon} vs ${lon}`);
    }
  });

  test('la misma coordenada da SIEMPRE la misma celda', () => {
    // De aquí sale que la capa consulte una vez y no una por encendido: la clave
    // de la caché es la celda.
    assert.deepEqual(puntoDeConsulta(0.341, 0.487), puntoDeConsulta(0.341, 0.487));
    assert.deepEqual(puntoDeConsulta(0.341, 0.487), puntoDeConsulta(0.339, 0.489));
  });

  test('⚠️ dos apoyos a un lado y otro del borde caen en celdas DISTINTAS', () => {
    // No es un defecto que se pueda tapar redondeando de otra forma: cualquier
    // rejilla tiene bordes. Se resuelve aguas arriba —la capa consulta UN punto
    // de referencia de la línea, no uno por apoyo— y se fija aquí para que quien
    // lo cambie sepa lo que se lleva por delante.
    assert.notDeepEqual(puntoDeConsulta(0.341, 0.487), puntoDeConsulta(0.352, 0.487));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el eje de la línea: un eje, no una flecha', () => {

  test('un vano al NORTE y otro al SUR describen la MISMA dirección', () => {
    // Promediando a pelo daría 90°: la perpendicular, el peor error posible.
    cerca(ejeDeLaLinea([0, 180]), 0, 1e-9, 'eje norte-sur');
  });

  test('azimuts a un lado y otro del norte promedian al norte', () => {
    cerca(ejeDeLaLinea([10, 350]), 0, 1e-9, 'eje alrededor del norte');
  });

  test('una línea recta al nordeste da su propio azimut', () => {
    cerca(ejeDeLaLinea([45, 45, 45]), 45, 1e-9, 'eje nordeste');
  });

  test('el eje siempre cae en [0, 180)', () => {
    for (const az of [[200], [359], [181], [90, 270]]) {
      const e = ejeDeLaLinea(az);
      if (e === null) continue;
      assert.ok(e >= 0 && e < 180, `${e} fuera de [0,180)`);
    }
  });

  test('sin azimuts no se inventa una dirección', () => {
    assert.equal(ejeDeLaLinea([]), null);
    assert.equal(ejeDeLaLinea([null, undefined]), null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('cuánto del viento empuja la línea DE LADO', () => {

  test('viento perpendicular: entra entero', () => {
    const v = vientoSobreLaLinea(40, 90, 0);        // línea norte-sur, viento del este
    cerca(v.transversal_kmh, 40, 1e-9, 'transversal');
    cerca(v.longitudinal_kmh, 0, 1e-9, 'longitudinal');
    cerca(v.angulo_deg, 90, 1e-9, 'ángulo');
  });

  test('viento en la dirección de la línea: no la carga de lado', () => {
    const v = vientoSobreLaLinea(40, 0, 0);
    cerca(v.transversal_kmh, 0, 1e-9, 'transversal');
    cerca(v.longitudinal_kmh, 40, 1e-9, 'longitudinal');
    cerca(v.angulo_deg, 0, 1e-9, 'ángulo');
  });

  test('a 45° entra la raíz de dos partido por dos', () => {
    const v = vientoSobreLaLinea(40, 45, 0);
    cerca(v.transversal_kmh, 40 * Math.SQRT1_2, 1e-9, 'transversal a 45°');
  });

  test('da igual de dónde viene o hacia dónde va: la carga de lado es la misma', () => {
    // Es la confusión más fácil de esta capa (`wind_from_direction`), y aquí no
    // puede cambiar el resultado: |sen(Δ)| = |sen(Δ+180°)|.
    const a = vientoSobreLaLinea(40, 70, 10);
    const b = vientoSobreLaLinea(40, 250, 10);
    cerca(a.transversal_kmh, b.transversal_kmh, 1e-9, 'de ida y de vuelta');
  });

  test('sin viento o sin eje no se inventa una descomposición', () => {
    assert.equal(vientoSobreLaLinea(null, 90, 0), null);
    assert.equal(vientoSobreLaLinea(40, null, 0), null);
    assert.equal(vientoSobreLaLinea(40, 90, null), null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('frente a la hipótesis: la frase que no se puede leer al revés', () => {

  test('publica el porcentaje Y la advertencia de que no valida nada', () => {
    const r = contraLaHipotesis(25, 100);
    cerca(r.pct, 25, 1e-9, 'porcentaje');
    assert.match(r.frase, /extremo de\s+diseño/, 'sin esa frase, «sopla menos» se lee como «vamos sobrados»');
    assert.match(r.frase, /No lo valida ni lo desmiente/);
  });

  test('sin hipótesis declarada no se compara contra nada', () => {
    assert.equal(contraLaHipotesis(25, null), null);
    assert.equal(contraLaHipotesis(25, 0), null);
    assert.equal(contraLaHipotesis(null, 100), null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('leer lo que la fuente entrega', () => {

  /** Un payload con la forma REAL de la fuente (comprobada contra su API). */
  const CRUDO = {
    properties: {
      meta: { updated_at: '2026-08-19T19:15:20Z', units: { wind_speed: 'm/s' } },
      timeseries: [
        // 2026-08-19 15:00 hora de Colombia (20:00Z)
        { time: '2026-08-19T20:00:00Z',
          data: { instant: { details: { air_temperature: 31.4, wind_speed: 9.4, wind_from_direction: 9.5, relative_humidity: 69.1, cloud_area_fraction: 23.4 } },
            next_1_hours: { summary: { symbol_code: 'fair_day' }, details: { precipitation_amount: 0 } } } },
        { time: '2026-08-19T22:00:00Z',
          data: { instant: { details: { air_temperature: 30.0, wind_speed: 12.0, wind_from_direction: 30 } },
            next_1_hours: { summary: { symbol_code: 'rain' }, details: { precipitation_amount: 4.5 } } } },
        // 2026-08-19 22:00 hora de Colombia: SIGUE siendo el día 19 allí
        { time: '2026-08-20T03:00:00Z',
          data: { instant: { details: { air_temperature: 27.0, wind_speed: 3.0, wind_from_direction: 100 } },
            next_6_hours: { summary: { symbol_code: 'thunderstorm' }, details: { precipitation_amount: 20 } } } },
        // 2026-08-20 12:00 hora de Colombia
        { time: '2026-08-20T17:00:00Z',
          data: { instant: { details: { air_temperature: 33.0, wind_speed: 5.0, wind_from_direction: 200 } },
            next_1_hours: { summary: { symbol_code: 'clearsky_day' }, details: { precipitation_amount: 0 } } } },
      ],
    },
  };

  test('el viento sale en km/h y la temperatura tal cual', () => {
    const p = leerPronostico(CRUDO);
    cerca(p.instantes[0].viento_kmh, 33.84, 1e-9, 'viento del primer instante');
    assert.equal(p.instantes[0].temperatura_C, 31.4);
    assert.equal(p.instantes[0].vientoDesde_deg, 9.5);
    assert.equal(p.emitido, '2026-08-19T19:15:20Z');
  });

  test('lo que la fuente no manda queda en hueco, no en cero', () => {
    const p = leerPronostico(CRUDO);
    // El segundo instante no trae humedad ni nubes.
    assert.equal(p.instantes[1].humedad_pct, null);
    assert.equal(p.instantes[1].nubes_pct, null);
    // Un cero en la lluvia sería una promesa de que no llueve.
    assert.equal(p.instantes[0].lluvia_mm, 0, 'el cero que SÍ vino se conserva');
  });

  test('los días se agrupan en hora de COLOMBIA, no en la del meridiano', () => {
    const p = leerPronostico(CRUDO);
    // Los tres primeros instantes caen el 19 en Colombia aunque el tercero sea
    // ya día 20 en UTC. Agrupar por UTC partiría la jornada de trabajo en dos.
    assert.deepEqual(p.dias.map((d) => d.dia), ['2026-08-19', '2026-08-20']);
    assert.equal(p.dias[0].tempMin_C, 27.0);
    assert.equal(p.dias[0].tempMax_C, 31.4);
  });

  test('del día manda el viento MÁXIMO, no el promedio', () => {
    const p = leerPronostico(CRUDO);
    // Lo que impide subir a una estructura es la racha, no la media del día.
    cerca(p.dias[0].vientoMax_kmh, 43.2, 1e-9, 'viento máximo del día');
  });

  test('la lluvia del día se acumula', () => {
    const p = leerPronostico(CRUDO);
    cerca(p.dias[0].lluvia_mm, 24.5, 1e-9, 'lluvia acumulada');
  });

  test('un JSON vacío o roto no revienta: devuelve vacío', () => {
    for (const basura of [null, undefined, {}, { properties: {} }, 'texto', 42]) {
      const p = leerPronostico(basura);
      assert.deepEqual(p.instantes, []);
      assert.deepEqual(p.dias, []);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('los avisos: criterio adoptado, y se dice', () => {

  const conDias = (dias) => ({ dias, instantes: [], proximasHoras: [], emitido: null });

  test('el viento por encima del tope de trabajo se avisa con su fecha', () => {
    const a = avisosDelPronostico(conDias([
      { dia: '2026-08-19', vientoMax_kmh: TOPES_AVISO.vientoTrabajo_kmh + 5, lluvia_mm: 0, simbolo: 'fair_day' },
      { dia: '2026-08-20', vientoMax_kmh: 10, lluvia_mm: 0, simbolo: 'fair_day' },
    ]), 45);
    assert.equal(a.length, 1);
    assert.match(a[0], /08-19/);
    assert.match(a[0], /[Cc]riterio adoptado, sin norma citada/,
      'un umbral sin fuente presentado como norma es una opinión con uniforme');
  });

  test('la tormenta eléctrica se nombra aparte: no es «viento fuerte»', () => {
    const a = avisosDelPronostico(conDias([
      { dia: '2026-08-21', vientoMax_kmh: 10, lluvia_mm: 0, simbolo: 'thunderstorm' },
    ]), 45);
    assert.ok(a.some((x) => /[Tt]ormenta eléctrica/.test(x) && /cuadrilla/.test(x)));
  });

  test('sin eje resuelto se DICE que el viento se publica entero', () => {
    const a = avisosDelPronostico(conDias([]), null);
    assert.ok(a.some((x) => /no se puede decir sin saber hacia dónde va la línea/.test(x)));
  });

  test('un pronóstico tranquilo no inventa avisos', () => {
    const a = avisosDelPronostico(conDias([
      { dia: '2026-08-19', vientoMax_kmh: 12, lluvia_mm: 1, simbolo: 'fair_day' },
    ]), 45);
    assert.deepEqual(a, []);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el símbolo, en castellano y sin inventar', () => {

  test('las familias que importan se traducen', () => {
    assert.equal(eltiempoEnCastellano('thunderstorm'), 'tormenta eléctrica');
    assert.equal(eltiempoEnCastellano('lightrainshowers_day'), 'llovizna');
    assert.equal(eltiempoEnCastellano('heavyrain'), 'lluvia fuerte');
    assert.equal(eltiempoEnCastellano('clearsky_night'), 'despejado');
  });

  test('lo que no se reconoce sale crudo, no se adivina', () => {
    assert.equal(eltiempoEnCastellano('cosa_rara_nueva'), 'cosa_rara_nueva');
    assert.equal(eltiempoEnCastellano(null), 'sin dato');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// La consulta: lo que NO puede hacer.
// ════════════════════════════════════════════════════════════════════════════
describe('la consulta al servicio del tiempo', () => {
  const FUENTE = readFileSync(
    fileURLToPath(new URL('../web/src/datos/pronostico.ts', import.meta.url)), 'utf-8');
  const CODIGO = FUENTE.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');

  test('la petición NO lleva cabeceras propias', () => {
    // Sus condiciones dicen con esas palabras que no admiten preflight de CORS.
    // Una cabecera propia —por muy correcta que parezca— convierte esto en una
    // petición que su servidor rechaza, y la capa deja de encender.
    assert.ok(!/headers\s*:/.test(CODIGO),
      'una cabecera propia dispara el preflight que la fuente NO admite');
  });

  test('se pregunta por la CELDA, nunca por la coordenada que llega', () => {
    assert.match(CODIGO, /puntoDeConsulta\(lat, lon\)/,
      'la coordenada del activo tiene que redondearse antes de salir hacia un tercero');
    assert.match(CODIGO, /lat=\$\{punto\.lat\}&lon=\$\{punto\.lon\}/,
      'la URL tiene que llevar el punto REDONDEADO, no el que entró');
  });

  test('el pronóstico no se guarda en ninguna parte', () => {
    // Un pronóstico archivado se lee dentro de un año como si alguien hubiera
    // medido algo. Los hechos fechados son otra cosa (`datos/clima.ts`).
    for (const prohibido of ['firestore', 'setDoc', 'addDoc', 'localStorage', 'indexedDB']) {
      assert.ok(!CODIGO.includes(prohibido),
        `la consulta del pronóstico no puede tocar \`${prohibido}\`: no es un hecho fechado`);
    }
  });

  test('no se consulta al pintar: solo cuando ÉL enciende la capa', () => {
    // Misma regla que `datos/clima.ts`: una consulta a un tercero es un acto
    // deliberado, no un efecto de que alguien mire una pantalla. Un `useEffect`
    // sin ese freno dispararía una petición cada vez que se abre el resumen.
    const mapa = readFileSync(
      fileURLToPath(new URL('../web/src/componentes/Mapa.tsx', import.meta.url)), 'utf-8');
    const i = mapa.indexOf('pedirPronostico(');
    assert.ok(i > 0, 'el mapa dejó de pedir el pronóstico');
    const antes = mapa.slice(Math.max(0, i - 700), i);
    assert.match(antes, /if \(!pronostico[\s\S]*?return;/,
      'la consulta tiene que estar detrás del interruptor que él enciende');
  });

  test('el efecto que consulta no se cancela a sí mismo', () => {
    // El fallo real: con `pidiendoTiempo` en las dependencias, el propio
    // `setPidiendoTiempo(true)` re-dispara el efecto y la limpieza del pase
    // anterior marca la petición como cancelada. El servicio responde 200 y la
    // pantalla se queda en «consultando…» para siempre (`32 · L-57`).
    const mapa = readFileSync(
      fileURLToPath(new URL('../web/src/componentes/Mapa.tsx', import.meta.url)), 'utf-8');
    const i = mapa.indexOf('pedirPronostico(');
    const despues = mapa.slice(i, i + 1200);
    const deps = despues.match(/\}, \[([^\]]*)\]\);/);
    assert.ok(deps, 'no se encontró la lista de dependencias del efecto que consulta');
    for (const prohibida of ['pidiendoTiempo', 'tiempo,', 'falloTiempo']) {
      assert.ok(!deps[1].includes(prohibida),
        `\`${prohibida}\` en las dependencias: el efecto se cancela a sí mismo`);
    }
  });

  test('la atribución de la licencia viaja con el módulo', () => {
    assert.match(CODIGO, /ATRIBUCION_PRONOSTICO/);
    assert.match(FUENTE, /CC BY 4\.0/, 'la licencia de la fuente se declara donde se usa');
  });
});
