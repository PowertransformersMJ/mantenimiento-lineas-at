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
  simboloDelDia, HORA_DE_LA_JORNADA,
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

  test('no se consulta al pintar: la pantalla del atlas es un acto deliberado', () => {
    // MISMA REGLA, OTRA PANTALLA (`§ADR-069`). El pronóstico vivía detrás de una
    // casilla del mapa de la línea; desde que el clima migró al ATLAS, la
    // consulta va donde va la pantalla. El criterio de `32 · L-57` no se relaja:
    // una consulta a un tercero no puede ser un efecto de que alguien mire algo.
    // Aquí se cumple porque ABRIR el atlas ya es deliberado —hay que pulsarlo o
    // escribir su dirección— y porque solo se pide UNA vez y solo si hay línea:
    // sin línea no hay punto por el que preguntar, y no se pregunta.
    const atlas = readFileSync(
      fileURLToPath(new URL('../web/src/componentes/AtlasCaribe.tsx', import.meta.url)), 'utf-8');
    const i = atlas.indexOf('pedirPronostico(');
    assert.ok(i > 0, 'el atlas dejó de pedir el pronóstico');
    const antes = atlas.slice(Math.max(0, i - 400), i);
    assert.match(antes, /if \(!recorrido \|\| yaPedido\.current\) return;/,
      'la consulta dejó de estar detrás de «hay línea, y solo una vez»');
    // Y donde estaba antes no puede quedar rastro: dos consultas al mismo
    // tercero desde dos pantallas es la duplicación que este día costó cara.
    const mapa = readFileSync(
      fileURLToPath(new URL('../web/src/componentes/Mapa.tsx', import.meta.url)), 'utf-8');
    assert.ok(!mapa.includes('pedirPronostico('),
      'el mapa de la línea volvió a consultar el pronóstico: el clima ya no vive ahí');
  });

  test('el efecto que consulta no se cancela a sí mismo', () => {
    // El fallo real (`32 · L-57`): con el estado que el propio efecto escribe en
    // sus dependencias, el `set` re-dispara el efecto y la limpieza del pase
    // anterior marca la petición como cancelada. Respuesta 200 y pantalla
    // colgada en «consultando…» para siempre.
    const atlas = readFileSync(
      fileURLToPath(new URL('../web/src/componentes/AtlasCaribe.tsx', import.meta.url)), 'utf-8');
    const i = atlas.indexOf('pedirPronostico(');
    const despues = atlas.slice(i, i + 900);
    const deps = despues.match(/\}, \[([^\]]*)\]\);/);
    assert.ok(deps, 'no se encontró la lista de dependencias del efecto que consulta');
    for (const prohibida of ['tiempo', 'falloTiempo', 'yaPedido']) {
      assert.ok(!deps[1].includes(prohibida),
        `\`${prohibida}\` en las dependencias: el efecto se cancela a sí mismo`);
    }
  });

  test('la atribución de la licencia viaja con el módulo', () => {
    assert.match(CODIGO, /ATRIBUCION_PRONOSTICO/);
    assert.match(FUENTE, /CC BY 4\.0/, 'la licencia de la fuente se declara donde se usa');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL CIELO DE LA JORNADA. Dos fallos vistos EN PRODUCCIÓN el 2026-08-22, los dos
// invisibles porque su resultado era plausible: una etiqueta creíble y un
// símbolo creíble, los dos equivocados.
// ════════════════════════════════════════════════════════════════════════════
describe('el cielo, traducido sin que una rama tape a otra', () => {

  /**
   * El catálogo REAL de la fuente (sus `symbol_code` base, sin el sufijo de
   * día/noche/crepúsculo). Se prueba entero a propósito: el fallo del 22-08 pasó
   * el guardián porque el guardián probaba cuatro familias sueltas y ninguna era
   * la que chocaba. Un test que recorre la tubería completa (`30 · L-68`).
   */
  const CATALOGO = [
    ['clearsky', 'despejado'],
    ['fair', 'poco nuboso'],
    ['partlycloudy', 'parcialmente nublado'],
    ['cloudy', 'nublado'],
    ['fog', 'niebla'],
    ['lightrain', 'llovizna'],
    ['lightrainshowers', 'llovizna'],
    ['rain', 'lluvia'],
    ['rainshowers', 'lluvia'],
    ['heavyrain', 'lluvia fuerte'],
    ['heavyrainshowers', 'lluvia fuerte'],
    ['lightsleet', 'aguanieve'],
    ['sleet', 'aguanieve'],
    ['heavysleet', 'aguanieve'],
    ['sleetshowers', 'aguanieve'],
    ['lightsnow', 'nieve'],
    ['snow', 'nieve'],
    ['heavysnow', 'nieve'],
    ['snowshowers', 'nieve'],
    // La tormenta manda sobre la familia de la que cuelga: lo que decide una
    // jornada no es si además llueve fuerte, es que hay aparato eléctrico.
    ['rainandthunder', 'tormenta eléctrica'],
    ['heavyrainshowersandthunder', 'tormenta eléctrica'],
    ['lightrainshowersandthunder', 'tormenta eléctrica'],
    ['snowandthunder', 'tormenta eléctrica'],
    ['sleetshowersandthunder', 'tormenta eléctrica'],
  ];

  test('cada familia de la fuente cae en SU rama, con y sin sufijo', () => {
    for (const [codigo, esperado] of CATALOGO) {
      for (const sufijo of ['', '_day', '_night', '_polartwilight']) {
        assert.equal(eltiempoEnCastellano(codigo + sufijo), esperado,
          `«${codigo}${sufijo}» se tradujo mal`);
      }
    }
  });

  test('NINGUNA rama es inalcanzable', () => {
    // ESTE es el test que habría cazado el fallo del 22-08. `partlycloudy`
    // contiene `cloudy`, así que con las preguntas en el orden equivocado la
    // rama de «parcialmente nublado» no la alcanzaba ningún código del mundo —
    // y nadie se enteraba, porque la respuesta que salía («nublado») era
    // perfectamente creíble. Una rama que ninguna entrada real puede alcanzar es
    // un fallo, no código de más.
    const alcanzadas = new Set(CATALOGO.map(([c]) => eltiempoEnCastellano(c)));
    const todasLasEtiquetas = [
      'despejado', 'poco nuboso', 'parcialmente nublado', 'nublado', 'niebla',
      'llovizna', 'lluvia', 'lluvia fuerte', 'aguanieve', 'nieve', 'tormenta eléctrica',
    ];
    for (const etiqueta of todasLasEtiquetas) {
      assert.ok(alcanzadas.has(etiqueta),
        `«${etiqueta}» es INALCANZABLE: ningún código real de la fuente llega a esa rama`);
    }
  });

  test('el cielo intermedio no se disfraza de cielo cerrado', () => {
    // El 22-08 la fuente entregaba 50 tramos «parcialmente nublado» y 11
    // «nublado», y la pantalla pintaba los 61 iguales.
    assert.equal(eltiempoEnCastellano('partlycloudy_day'), 'parcialmente nublado');
    assert.notEqual(eltiempoEnCastellano('partlycloudy_day'), eltiempoEnCastellano('cloudy'));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el símbolo que representa el día se busca en el reloj de la cuadrilla', () => {

  const inst = (cuando, simbolo) => ({
    cuando, simbolo, temperatura_C: null, viento_kmh: null,
    vientoDesde_deg: null, humedad_pct: null, nubes_pct: null, lluvia_mm: null,
  });

  test('en un día lejano NO manda la madrugada', () => {
    // EL FALLO REAL. Pasado el tercer día la fuente solo publica bloques de seis
    // horas —00, 06, 12 y 18 UTC—, así que el instante de las 17 UTC que se
    // buscaba NO EXISTE y el respaldo era «el primero del día»: las 06 UTC, o
    // sea LA UNA DE LA MADRUGADA. El cielo de una jornada de trabajo lo decidía
    // la madrugada, y con símbolo nocturno.
    const dia = [
      inst('2026-09-01T06:00:00Z', 'clearsky_night'),      // 01:00 local
      inst('2026-09-01T12:00:00Z', 'partlycloudy_day'),    // 07:00 local
      inst('2026-09-01T18:00:00Z', 'heavyrain'),           // 13:00 local ← la jornada
      inst('2026-09-02T00:00:00Z', 'cloudy'),              // 19:00 local
    ];
    assert.equal(simboloDelDia(dia), 'heavyrain',
      'se quedó con un instante que no representa la jornada');
    assert.notEqual(simboloDelDia(dia), 'clearsky_night',
      'volvió a mandar la madrugada: ese era exactamente el fallo');
  });

  test('las 18 UTC son la jornada de Colombia, y por eso el criterio no se rompe al cambiar el paso', () => {
    // La razón de elegir las 13:00 y no las 12:00: el bloque de seis horas
    // sellado a las 18 UTC ES las 13:00 de Colombia. El mismo criterio cae
    // clavado en un bloque real tanto con detalle horario como sin él.
    const enBogota = (iso) => new Date(iso)
      .toLocaleString('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hour12: false });
    assert.equal(Number(enBogota('2026-09-01T18:00:00Z')), HORA_DE_LA_JORNADA);
  });

  test('con detalle horario elige la hora de la jornada, no la primera del día', () => {
    const dia = [];
    for (let h = 5; h < 24; h++) {                       // 00:00 → 19:00 local
      dia.push(inst(`2026-09-01T${String(h).padStart(2, '0')}:00:00Z`,
        h === 18 ? 'rainshowers_day' : 'clearsky_day'));
    }
    assert.equal(simboloDelDia(dia), 'rainshowers_day');
  });

  test('un instante sin símbolo no se elige aunque caiga en la hora', () => {
    const dia = [
      inst('2026-09-01T18:00:00Z', null),                 // 13:00 local, pero sin dato
      inst('2026-09-01T12:00:00Z', 'partlycloudy_day'),   // 07:00 local
    ];
    assert.equal(simboloDelDia(dia), 'partlycloudy_day');
  });

  test('el día que ya va empezado se queda con lo que QUEDA, no se inventa un mediodía que pasó', () => {
    const dia = [
      inst('2026-09-02T02:00:00Z', 'partlycloudy_night'), // 21:00 local
      inst('2026-09-02T03:00:00Z', 'fair_night'),         // 22:00 local
    ];
    assert.equal(simboloDelDia(dia), 'partlycloudy_night');
  });

  test('un día entero sin un solo símbolo es hueco, no invento', () => {
    assert.equal(simboloDelDia([inst('2026-09-01T18:00:00Z', null)]), null);
    assert.equal(simboloDelDia([]), null);
  });

  test('de punta a punta: el día lejano llega a la tabla con el cielo de su jornada', () => {
    const p = leerPronostico({ properties: { timeseries: [
      { time: '2026-09-01T06:00:00Z', data: { instant: { details: { air_temperature: 24 } },
        next_6_hours: { summary: { symbol_code: 'clearsky_night' }, details: { precipitation_amount: 0 } } } },
      { time: '2026-09-01T12:00:00Z', data: { instant: { details: { air_temperature: 28 } },
        next_6_hours: { summary: { symbol_code: 'partlycloudy_day' }, details: { precipitation_amount: 0 } } } },
      { time: '2026-09-01T18:00:00Z', data: { instant: { details: { air_temperature: 33 } },
        next_6_hours: { summary: { symbol_code: 'rainshowers_day' }, details: { precipitation_amount: 6 } } } },
    ] } });
    const dia = p.dias.find((d) => d.dia === '2026-09-01');
    assert.equal(dia.simbolo, 'rainshowers_day');
    assert.equal(eltiempoEnCastellano(dia.simbolo), 'lluvia');
  });
});
