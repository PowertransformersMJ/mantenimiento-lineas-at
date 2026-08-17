// ============================================================================
// tests/ampliacion-2026-08.test.js — las cifras de oro DESPUÉS de la ampliación
// ----------------------------------------------------------------------------
// ⚠️ ESTO ES UNA AMPLIACIÓN FECHADA DEL 11-12 DE AGOSTO DE 2026, NO UNA
//    CORRECCIÓN DE UN ERROR.
//
// El levantamiento de julio no estaba mal: estaba INCOMPLETO. La cuadrilla
// volvió a campo el 11 y el 12 de agosto y trajo tres puntos nuevos; el
// Ingeniero aprobó dos de ellos el 2026-08-16 (el empalme dentro del vano
// E03→E04 y el pórtico del extremo final) y dejó el tercero —el pórtico del
// extremo de origen— PENDIENTE DE VERIFICACIÓN EN CAMPO. Corregir o ampliar un
// levantamiento es un HECHO FECHADO, nunca una sobrescritura (CLAUDE.md §3.1).
//
// POR ESO ESTE ARCHIVO ES NUEVO Y NO UNA EDICIÓN DE LOS DE JULIO. Las cifras de
// julio siguen VIVAS e INTACTAS en `tests/estadisticas.test.js` (24 estructuras ·
// 23 vanos · promedio 127,35 m) y en `tests/exportar.test.js` (26 puntos ·
// 6 tramos · reparto 1-2-2-14-1-3), porque aquellos dos archivos leen SOLO
// `LN-627-geometria.json`. Que sigan verdes sin tocarles una cifra ES la prueba
// de que el registro de julio no se reescribió. Los dos fixtures NO se fusionan
// jamás: el propio fixture de agosto lo prohíbe en su campo `_nota`, y aquí hay
// una prueba que exige que esa prohibición siga escrita.
//
// DE DÓNDE SALEN LOS NÚMEROS. Todos se DERIVARON ejecutando el motor sobre los
// dos fixtures (`construirApoyos` → `derivarLevantamiento` → `estadisticasVanos`
// y los tres exportadores). Ninguno se tecleó a ojo y ninguna tolerancia se
// ensanchó para que pasara: la mediana, por ejemplo, se mueve solo 2 cm
// (99,91 → 99,89) y se trata como cifra NUEVA, no como ruido.
//
// LO QUE SE ESCRIBE AQUÍ Y LO QUE NO. Agregados no identificables (25
// estructuras, 336,70 m, 7 tramos) sí: ya están publicados en docs/40 §10.
// Coordenadas, nombres de subestación y fotos NUNCA: se derivan del fixture en
// tiempo de ejecución. Este archivo se salta solo cuando la bóveda no está
// (CI), como los otros tres que la leen.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { construirApoyos } from '../herramientas/construir-apoyos.mjs';
import { derivarLevantamiento } from '../exportar/levantamiento.js';
import { estadisticasVanos } from '../nucleo/estadisticas.js';
import { generarGpx } from '../exportar/gpx.js';
import { generarKml } from '../exportar/kml.js';
import { generarCsv } from '../exportar/csv.js';
import { calidadLevantamiento } from '../exportar/calidad.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const BOVEDA = join(AQUI, '..', '..', 'brain-private', 'mantenimiento-lineas-at', 'fixtures');
const F_JULIO = join(BOVEDA, 'LN-627-geometria.json');
const F_AGOSTO = join(BOVEDA, 'LN-627-geometria-ampliacion-2026-08.json');
const SIN_BOVEDA = !(existsSync(F_JULIO) && existsSync(F_AGOSTO)) &&
  'fixtures en la bóveda privada, no disponibles aquí (esperado en CI)';

const cerca = (real, esperado, tol, msg) =>
  assert.ok(Math.abs(real - esperado) <= tol,
    `${msg}: ${real} vs ${esperado} esperado (tolerancia ${tol})`);

const leer = (r) => JSON.parse(readFileSync(r, 'utf-8'));
const julio = existsSync(F_JULIO) ? leer(F_JULIO) : [];
const agosto = existsSync(F_AGOSTO) ? leer(F_AGOSTO) : { puntos: [] };

// Un instante fijo: lo que se prueba es la geometría, no la hora de la corrida.
const OPC = { ahora: '2026-08-16T00:00:00.000Z' };
const construido = existsSync(F_JULIO) ? construirApoyos('LN-627', julio, agosto.puntos ?? [], OPC) : null;
const lev = construido ? derivarLevantamiento(construido.apoyos) : null;
const estructuras = () => lev.puntos.filter((p) => p.tipo === 'Estructura');
const estadistica = () => estadisticasVanos(estructuras().slice(1).map((p) => p.vanoAnterior_m));

const LINEA = { codigo: 'LN-627', nombre: 'Línea LN-627', tensionNominal_kV: 66 };
const META = { generadoEn: '2026-08-16T18:00:00-05:00', hipotesisNombre: 'Hipótesis del módulo de campo (SIN VALIDAR)' };

// ════════════════════════════════════════════════════════════════════════════
describe('ampliación 11-12 AGO 2026 — el recuento del levantamiento', () => {

  test('la secuencia: el empalme cae DENTRO del vano E03→E04 y el pórtico al final', { skip: SIN_BOVEDA }, () => {
    const nombres = lev.puntos.map((p) => p.nombre);
    assert.equal(nombres[0], 'LN-627 E01', 'la línea sigue empezando en E01');
    assert.equal(nombres[3], 'LN-627 EMP E03-E04', 'el empalme nuevo es el 4º punto del recorrido');
    assert.equal(nombres[4], 'LN-627 E04', 'y va justo antes de E04, no después');
    assert.equal(nombres[nombres.length - 2], 'LN-627 E24', 'E24 sigue penúltimo');
    assert.equal(nombres[nombres.length - 1], 'LN-627 PORTICO FIN', 'el pórtico cierra el recorrido');
    // La posición en la secuencia ES el dato: de ella deduce la aplicación en
    // qué vano vive un empalme. Meterlo al final daría `enVano: null`.
    const emp = lev.puntos.find((p) => p.nombre === 'LN-627 EMP E03-E04');
    assert.equal(emp.tipo, 'Empalme');
    assert.equal(emp.enVano, 'LN-627 E03 → LN-627 E04', 'declara dentro de qué vano real vive');
    assert.equal(emp.vanoAnterior_m, null, 'un empalme no tiene vano: no es apoyo');
  });

  test('28 puntos · 25 estructuras · 3 empalmes · 7 tramos [1,2,2,14,1,3,1]', { skip: SIN_BOVEDA }, () => {
    assert.equal(lev.puntos.length, 28, '26 de julio + 2 aprobados en agosto');
    assert.equal(lev.nEstructuras, 25, 'las 24 de julio + el pórtico final');
    assert.equal(lev.nEmpalmes, 3, 'los 2 de julio + el del vano E03→E04');
    assert.equal(lev.tramos.length, 7, 'un tramo de tensión más: el que cierra en el pórtico');
    assert.deepEqual(lev.tramos.map((t) => t.nVanos), [1, 2, 2, 14, 1, 3, 1],
      'el reparto de julio 1-2-2-14-1-3 INTACTO, más un tramo final de 1 vano');
    assert.equal(lev.tramos[6].desde, 'LN-627 E24');
    assert.equal(lev.tramos[6].hasta, 'LN-627 PORTICO FIN');
  });

  test('los `orden` de julio no se movieron: 0…25, y los nuevos entran por bisección', { skip: SIN_BOVEDA }, () => {
    const porNombre = new Map(construido.apoyos.map((a) => [a.nombreNormalizado, a.orden]));
    // Los 26 de julio conservan su orden entero: ni un documento de producción
    // se reescribe para registrar un hecho que no cambió.
    const canonicosJulio = [...porNombre.keys()].filter((n) => n !== 'LN-627 EMP E03-E04' && n !== 'LN-627 PORTICO FIN');
    assert.equal(canonicosJulio.length, 26);
    assert.deepEqual(canonicosJulio.map((n) => porNombre.get(n)), [...Array(26).keys()],
      'orden 0…25 sin renumerar');
    // Bisección: (2 + 3) / 2. Renumerar habría movido 64 de las 99 fotos.
    assert.equal(porNombre.get('LN-627 EMP E03-E04'), 2.5, 'entre E03 (2) y E04 (3)');
    assert.equal(porNombre.get('LN-627 PORTICO FIN'), 26, 'al final: último + 1');
  });

  test('el punto que el Ingeniero dejó PENDIENTE no se carga, y se dice', { skip: SIN_BOVEDA }, () => {
    assert.equal(construido.ignorados.length, 1, 'exactamente uno pendiente');
    const [p] = construido.ignorados;
    assert.equal(p.nombreCanonico, 'LN-627 PORTICO ORIGEN');
    assert.equal(p.estado, 'pendiente_verificacion');
    assert.ok(p.motivo && p.motivo.length > 20, 'con motivo legible, no un código');
    // Ni en los documentos, ni en el levantamiento, ni en los exportadores.
    assert.ok(!construido.apoyos.some((a) => a.nombreNormalizado === 'LN-627 PORTICO ORIGEN'));
    assert.ok(!lev.puntos.some((x) => x.nombre.includes('ORIGEN')));
    // Y sigue en el fixture de la bóveda: pendiente NO es descartado.
    assert.ok((agosto.puntos ?? []).some((x) => x.nombreCanonico === 'LN-627 PORTICO ORIGEN'),
      'no se borra del fixture: queda para el día que el Ingeniero lo verifique');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('ampliación 11-12 AGO 2026 — distribución de vanos re-sellada', () => {

  // Cada una de estas seis cifras se DERIVÓ ejecutando `estadisticasVanos`
  // sobre los vanos reales del levantamiento ampliado. Al lado, entre
  // paréntesis, la cifra de julio que sigue viva en estadisticas.test.js.
  test('24 vanos y los seis números del panel, cifra a cifra', { skip: SIN_BOVEDA }, () => {
    const e = estadistica();
    assert.equal(estructuras().length, 25, '25 estructuras (eran 24)');
    assert.equal(e.n, 24, '24 vanos (eran 23)');
    cerca(e.promedio, 125.99, 0.01, 'vano promedio (era 127,35)');
    // ⚠️ La mediana se mueve 2 CENTÍMETROS: 99,91 → 99,89. Es una cifra nueva,
    // no ruido de tolerancia — la tolerancia sigue siendo de 1 cm y con la
    // cifra vieja esta prueba fallaría por 2 cm, que es justo lo que se quiere.
    cerca(e.mediana, 99.89, 0.01, 'mediana (era 99,91)');
    cerca(e.desviacionEstandar, 77.30, 0.01, 'desviación estándar (era 78,74)');
    cerca(e.coeficienteVariacion_pct, 61.35, 0.01, 'coeficiente de variación (era 61,8)');
    // Los extremos NO se mueven: el vano nuevo (94,65 m) no es ni el mayor ni
    // el menor, así que máximo, mínimo y su relación siguen siendo los mismos.
    cerca(e.maximo, 336.70, 0.01, 'vano máximo — NO cambia');
    cerca(e.minimo, 13.35, 0.01, 'vano mínimo — NO cambia');
    cerca(e.relacionMaxMin, 25.22, 0.01, 'relación máx/mín — NO cambia');
  });

  test('el vano nuevo E24 → pórtico son 94,65 m, y es un vano normal', { skip: SIN_BOVEDA }, () => {
    const ultima = estructuras()[estructuras().length - 1];
    assert.equal(ultima.nombre, 'LN-627 PORTICO FIN');
    assert.equal(ultima.vanoDesde, 'LN-627 E24');
    cerca(ultima.vanoAnterior_m, 94.65, 0.01, 'vano E24 → pórtico');
    // 94,65 m es el 75 % del promedio: nada que ver con los 4.604 m del tramo
    // SIN LEVANTAR del otro extremo, que por eso no se carga como vano.
    assert.ok(ultima.vanoAnterior_m < estadistica().maximo, 'no es el vano mayor');
  });

  test('la longitud levantada pasa a 3 023,67 m', { skip: SIN_BOVEDA }, () => {
    cerca(lev.longitud_m, 3023.67, 0.01, 'longitud levantada (eran 2 929,02)');
    const sumaVanos = lev.puntos.filter((p) => p.vanoAnterior_m != null)
      .reduce((s, p) => s + p.vanoAnterior_m, 0);
    cerca(lev.longitud_m, sumaVanos, 0.01, 'y coincide con la suma de los 24 vanos reales');
  });

  test('8 anclajes — con E24 tal y como está sembrado hoy', { skip: SIN_BOVEDA }, () => {
    // ⚠️ PREGUNTA ABIERTA, NO DECIDIDA AQUÍ. El pórtico se tipifica 'Terminal'
    // (un pórtico de subestación ancla el conductor por definición) y eso lleva
    // los anclajes de 7 a 8 y los tramos de 6 a 7. E24 se queda EXACTAMENTE
    // como está sembrado —'Terminal'— aunque ahora la línea siga más allá de
    // él: re-tipificar un apoyo es decisión del INGENIERO, no del sembrador, y
    // arrastra el cálculo mecánico. Consecuencia aceptada y declarada: queda un
    // tramo final de un solo vano entre dos terminales consecutivos. El día que
    // el Ingeniero decida, esta cifra cambia a propósito y con su firma.
    const anclas = lev.puntos.filter((p) => p.esAncla).map((p) => p.nombre);
    assert.equal(anclas.length, 8, 'las 8 estructuras que cortan los 7 tramos');
    assert.ok(anclas.includes('LN-627 E24'), 'E24 sigue siendo ancla: no se re-tipificó');
    assert.ok(anclas.includes('LN-627 PORTICO FIN'), 'y el pórtico también lo es');
  });

  test('la serie canónica E01…E24 sigue completa: el pórtico NO inventa un hueco', { skip: SIN_BOVEDA }, () => {
    // `exportar/calidad.js` saca el número final del nombre para detectar
    // huecos y duplicados. 'LN-627 PORTICO FIN' no acaba en dígito y por eso
    // queda fuera de la serie numerada — que era el motivo técnico de no
    // llamarlo «E25».
    const titulos = calidadLevantamiento(lev).map((x) => x.titulo).join(' || ');
    assert.ok(!titulos.includes('Huecos en la serie'), 'sin falsos huecos');
    assert.ok(!titulos.includes('Numeración duplicada'), 'sin falsos duplicados');
    // Y lo que ya se detectaba se sigue detectando: la ampliación no tapa nada.
    assert.ok(/Quiebre de 118\.\d° en LN-627 E06/.test(titulos), 'el quiebre de E06 sigue saliendo');
    assert.ok(titulos.includes('±8 m'), 'la altimetría GPS sigue advertida');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('ampliación 11-12 AGO 2026 — los tres exportadores', () => {

  test('GPX: 28 waypoints y 5 jornadas', { skip: SIN_BOVEDA }, () => {
    const gpx = generarGpx(LINEA, lev, META);
    assert.equal((gpx.match(/<wpt /g) ?? []).length, 28, 'un waypoint por punto');
    assert.equal((gpx.match(/<trkpt /g) ?? []).length, 28);
    assert.equal((gpx.match(/<type>Empalme<\/type>/g) ?? []).length, 3, 'los tres empalmes');
    assert.ok(gpx.includes('<name>LN-627 PORTICO FIN</name>'), 'el pórtico va con su nombre canónico');
    // ⚠️ 5 <trkseg> y no 2. Cada trkseg es una jornada continua, y la línea se
    // levantó en TRES campañas con el empalme del 11-AGO intercalado en mitad
    // de la secuencia del 25-JUL: eso trocea la traza dibujada. Es correcto y
    // se sella tal cual en vez de retocar la lógica de jornadas de gpx.js.
    assert.equal((gpx.match(/<trkseg>/g) ?? []).length, 5, '5 jornadas (eran 2)');
    assert.ok(!gpx.includes('undefined') && !gpx.includes('NaN'), 'sin huecos sin datos');
    // CERO nombre de instalación de cliente en lo que se exporta. Los nombres
    // de subestación se LEEN del fixture de la bóveda y no se escriben aquí:
    // este archivo vive en el repositorio PÚBLICO, y teclearlos para prohibirlos
    // sería publicarlos igual.
    const instalaciones = (agosto.puntos ?? []).map((p) => p.subestacion).filter(Boolean);
    assert.ok(instalaciones.length >= 2, 'el fixture nombra las instalaciones (y por eso está en la bóveda)');
    for (const s of instalaciones) {
      assert.ok(!gpx.toUpperCase().includes(s.toUpperCase()),
        'ningún nombre de subestación real sale en el exporte');
    }
  });

  test('KML: 7 polilíneas, 28 placemarks, 28 filas de atributos', { skip: SIN_BOVEDA }, () => {
    const kml = generarKml(LINEA, lev, META);
    assert.equal((kml.match(/<LineString>/g) ?? []).length, 7, 'una polilínea por tramo');
    assert.equal((kml.match(/<Point>/g) ?? []).length, 28, 'un placemark por punto');
    assert.equal((kml.match(/<SchemaData /g) ?? []).length, 28, 'QGIS recibe atributos de los 28');
    const coords = [...kml.matchAll(/<coordinates>([^<]*)<\/coordinates>/g)]
      .map((m) => m[1].trim().split(/\s+/).length);
    assert.equal(coords.slice(0, 7).reduce((a, b) => a + b, 0), 28 + 6,
      'la traza pasa por los 28 puntos, con 6 bordes compartidos entre 7 tramos');
    assert.ok(!kml.includes('undefined') && !kml.includes('NaN'));
  });

  test('CSV: 28 filas de datos y la última progresiva es la longitud', { skip: SIN_BOVEDA }, () => {
    const filas = generarCsv(lev, { dialecto: 'datos' }).split('\r\n');
    assert.equal(filas.length, 1 + 28, 'cabecera + una fila por punto');
    const csvExcel = generarCsv(lev, { dialecto: 'excel', linea: LINEA, ...META });
    assert.ok(csvExcel.startsWith('﻿sep=;\r\n'), 'sigue abriendo bien en Excel es-CO');
    assert.ok(!csvExcel.includes('undefined') && !csvExcel.includes('NaN'));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL ANCLA QUE DEMUESTRA QUE ESTO ES UNA AMPLIACIÓN Y NO UNA SOBRESCRITURA
// ════════════════════════════════════════════════════════════════════════════
describe('julio sigue siendo julio', () => {

  test('leyendo SOLO el fixture de julio salen las cifras de julio, sin tocar una', { skip: SIN_BOVEDA }, () => {
    const soloJulio = derivarLevantamiento(construirApoyos('LN-627', julio, [], OPC).apoyos);
    const E = soloJulio.puntos.filter((p) => p.tipo === 'Estructura');
    const e = estadisticasVanos(E.slice(1).map((p) => p.vanoAnterior_m));
    assert.equal(soloJulio.puntos.length, 26, '26 puntos');
    assert.equal(soloJulio.nEstructuras, 24, '24 estructuras');
    assert.equal(soloJulio.nEmpalmes, 2, '2 empalmes');
    assert.equal(soloJulio.tramos.length, 6, '6 tramos');
    assert.deepEqual(soloJulio.tramos.map((t) => t.nVanos), [1, 2, 2, 14, 1, 3]);
    assert.equal(e.n, 23, '23 vanos');
    cerca(e.promedio, 127.35, 0.01, 'vano promedio de julio');
    cerca(e.mediana, 99.91, 0.01, 'mediana de julio');
    cerca(e.maximo, 336.70, 0.01, 'vano máximo de julio');
    cerca(e.desviacionEstandar, 78.74, 0.01, 'desviación de julio');
    cerca(soloJulio.longitud_m, 2929.02, 0.01, 'longitud levantada en julio');
  });

  test('los dos fixtures NO se fusionan, y el de agosto lo sigue prohibiendo por escrito', { skip: SIN_BOVEDA }, () => {
    // Si alguien fusionara los archivos, las pruebas de julio empezarían a
    // medir otra línea y su valor como línea base se perdería en silencio.
    assert.ok(Array.isArray(julio), 'el de julio es la lista cruda y congelada de puntos');
    assert.equal(julio.length, 26, 'y sigue teniendo 26 puntos: nadie le añadió los de agosto');
    assert.ok(typeof agosto._nota === 'string' && /NO se fusiona/i.test(agosto._nota),
      'el fixture de agosto conserva la prohibición de fusionarlos');
  });

  test('la aprobación del Ingeniero está fechada y es legible en el fixture', { skip: SIN_BOVEDA }, () => {
    // Lo que se carga y lo que no es una DECISIÓN del Ingeniero, con fecha, no
    // una consecuencia de cómo esté escrito el script.
    const porNombre = new Map((agosto.puntos ?? []).map((p) => [p.nombreCanonico, p]));
    for (const n of ['LN-627 EMP E03-E04', 'LN-627 PORTICO FIN']) {
      assert.equal(porNombre.get(n).estado, 'aprobado', `${n} aprobado`);
      assert.equal(porNombre.get(n).aprobadoEn, '2026-08-16', `${n} con fecha de aprobación`);
      assert.ok(porNombre.get(n).aprobadoPor, `${n} con quién lo aprobó`);
    }
    assert.equal(porNombre.get('LN-627 PORTICO ORIGEN').estado, 'pendiente_verificacion');
    assert.ok(porNombre.get('LN-627 PORTICO ORIGEN').motivoPendiente, 'y con su motivo escrito');
  });
});
