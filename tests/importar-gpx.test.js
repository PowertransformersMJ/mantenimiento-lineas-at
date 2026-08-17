// ============================================================================
// tests/importar-gpx.test.js — leer el archivo del GPS sin fingir un navegador
// ----------------------------------------------------------------------------
// QUÉ SE PRUEBA AQUÍ, y por qué en dos mitades distintas:
//
//   1. IDA Y VUELTA. El archivo lo genera el EXPORTADOR de este mismo
//      repositorio sobre puntos inventados, y el lector tiene que devolver
//      exactamente lo que se escribió. Es la prueba más honesta que se puede
//      hacer sin datos reales: si el lector y el exportador dejaran de
//      entenderse, se ve aquí. Y de paso queda demostrado que **el GPX de
//      prueba no sale de la bóveda**: se fabrica en cada corrida.
//
//   2. LO QUE MANDA UN APARATO DE VERDAD. Waypoints cerrados sobre sí mismos,
//      atributos en cualquier orden, comillas simples, entidades XML,
//      coordenadas ilegibles, nombres repetidos. Esos GPX se escriben a mano
//      aquí, cortos y sintéticos, porque son formas del archivo, no datos.
//
// LA REGLA QUE GOBIERNA EL LECTOR: **lo que no está, no se rellena.** Un aparato
// que no grabó la altura no grabó un cero. El hueco se DECLARA en los avisos,
// para que el Ingeniero lo vea antes de decidir y no después de cargar — que es
// cuando ya no hay marcha atrás.
//
// POR QUÉ NO SE USA EL LECTOR DE XML DEL NAVEGADOR: solo existe dentro de él, y
// un módulo que no se puede probar sin montar un navegador de mentira acaba sin
// pruebas. Este archivo es la demostración: corre con `node --test`, tal cual.
//
// ⚠️ CERO DATOS DE CLIENTE. Coordenadas, horas y nombres, todos inventados.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { leerGpx } from '../importar/gpx.js';
import { generarGpx } from '../exportar/gpx.js';
import { derivarLevantamiento } from '../exportar/levantamiento.js';
import { idEstable, ORG_POR_DEFECTO } from '../herramientas/identidad.mjs';

const LINEA = 'LX-001';
const LINEA_ID = idEstable(ORG_POR_DEFECTO, LINEA, 'linea');

/** Punto sintético: coordenadas con seis decimales, que es lo que el GPX escribe. */
const apoyo = (nombre, orden, lat, lon, coord = {}) => ({
  id: idEstable(ORG_POR_DEFECTO, LINEA, `punto:${nombre}`),
  orgId: ORG_POR_DEFECTO,
  creadoEn: '2026-01-01T00:00:00.000Z',
  creadoPor: 'uid-de-prueba',
  revision: 0,
  tipo: 'apoyo',
  lineaId: LINEA_ID,
  orden,
  tipoPunto: 'Estructura',
  nombreCampo: nombre,
  nombreNormalizado: nombre,
  coordenada: { lat, lon, sistemaReferencia: 'WGS84', metodo: 'gps_mano', precision_m: 8, ...coord },
  funcionEstructural: orden === 0 ? 'Terminal' : 'Suspensión',
  funcionProcedencia: 'confirmado_humano',
  deflexion_grados: null,
  condicion: 'Sin evaluar',
  activo: true,
});

const PUNTOS = [
  apoyo('LX-001 A01', 0, 5.001200, -70.123400, { cotaTerreno_m: 41.7, tomadaEn: '2026-03-04T10:15:00.000Z' }),
  apoyo('LX-001 A02', 1, 5.002300, -70.123900, { cotaTerreno_m: 34.25, tomadaEn: '2026-03-04T10:58:31.000Z' }),
  apoyo('LX-001 A03', 2, 5.003400, -70.124300),
];

const GPX = generarGpx(
  { codigo: LINEA, nombre: 'Línea sintética de prueba', tensionNominal_kV: 66 },
  derivarLevantamiento(PUNTOS),
  { generadoEn: '2026-08-17T09:00:00-05:00' },
);

// ════════════════════════════════════════════════════════════════════════════
describe('IDA Y VUELTA — lo que escribe el exportador es lo que lee el lector', () => {

  const leido = leerGpx(GPX);

  test('el archivo de prueba se FABRICA aquí: no hay ninguno guardado', () => {
    assert.match(GPX, /^<\?xml version="1\.0"/);
    assert.equal(leido.creator, 'Mantenimiento Lineas AT');
  });

  test('vuelven los 3 puntos marcados, y solo esos', () => {
    // El exportador escribe además la TRAZA del recorrido, con un `trkpt` por
    // punto. El lector la ignora a propósito: son posiciones automáticas del
    // aparato, ninguna de las cuales es un apoyo, y colarlas convertiría una
    // carga de tres puntos en una de miles.
    assert.equal(leido.waypoints.length, 3);
    assert.ok(GPX.includes('<trkpt'), 'el archivo sí trae traza…');
    assert.equal(GPX.match(/<trkpt/g).length, 3, '…y aquí son tres, que el lector no cuenta');
  });

  test('los nombres vuelven idénticos y en el orden del recorrido', () => {
    assert.deepEqual(leido.waypoints.map((p) => p.nombreCampo), ['LX-001 A01', 'LX-001 A02', 'LX-001 A03']);
  });

  test('cada coordenada vuelve byte a byte, sin deriva', () => {
    PUNTOS.forEach((a, i) => {
      assert.equal(leido.waypoints[i].lat, a.coordenada.lat, 'la latitud se movió al ir y volver');
      assert.equal(leido.waypoints[i].lon, a.coordenada.lon, 'la longitud se movió al ir y volver');
    });
  });

  test('la cota y la hora vuelven donde las había', () => {
    assert.equal(leido.waypoints[0].ele, 41.7);
    assert.equal(leido.waypoints[0].utc, '2026-03-04T10:15:00.000Z');
    assert.equal(leido.waypoints[1].ele, 34.25);
  });

  test('y donde NO las había, la clave sencillamente no existe', () => {
    assert.equal('ele' in leido.waypoints[2], false, 'un cero aquí se leería como nivel del mar');
    assert.equal('utc' in leido.waypoints[2], false);
  });

  test('el hueco se declara con la cuenta exacta', () => {
    const cota = leido.avisos.find((a) => a.tipo === 'sin_cota');
    assert.match(cota.mensaje, /1 de 3 sin cota/);
    assert.equal(cota.n, 1);
    assert.equal(cota.total, 3);
    assert.deepEqual(cota.puntos, ['LX-001 A03'], 'y nombra cuál, que es lo que él necesita para decidir');
    const hora = leido.avisos.find((a) => a.tipo === 'sin_hora');
    assert.match(hora.mensaje, /1 de 3 sin hora/);
  });

  test('1 de 2 sin cota: el aviso lleva la cuenta exacta, no un «faltan datos»', () => {
    // El caso mínimo, con las palabras exactas que va a leer el Ingeniero. Se
    // prueba aparte del de 3 porque lo que se defiende aquí es que la cuenta se
    // CALCULA —«1 de 2», «1 de 3»— y no es un texto fijo: un aviso genérico le
    // obligaría a ir punto por punto a averiguar a cuál le falta la cota.
    const dos = leerGpx(generarGpx(
      { codigo: LINEA, nombre: 'Línea sintética', tensionNominal_kV: 66 },
      derivarLevantamiento([PUNTOS[0], PUNTOS[2]]),
      { generadoEn: '2026-08-17T09:00:00-05:00' },
    ));
    assert.equal(dos.waypoints.length, 2);
    const cota = dos.avisos.find((a) => a.tipo === 'sin_cota');
    assert.match(cota.mensaje, /1 de 2 sin cota/);
    assert.equal(cota.n, 1);
    assert.equal(cota.total, 2);
    assert.deepEqual(cota.puntos, ['LX-001 A03']);
    // Y el que sí la traía conserva la suya: el aviso no es un borrado.
    assert.equal(dos.waypoints[0].ele, 41.7);
    assert.equal('ele' in dos.waypoints[1], false);
  });

  test('con todo completo no se inventa ningún aviso', () => {
    const completo = leerGpx(generarGpx(
      { codigo: LINEA, nombre: 'Línea sintética', tensionNominal_kV: 66 },
      derivarLevantamiento(PUNTOS.slice(0, 2)),
      { generadoEn: '2026-08-17T09:00:00-05:00' },
    ));
    assert.deepEqual(completo.avisos, [], 'avisar de lo que no falta enseña a ignorar los avisos');
    assert.equal(completo.waypoints.length, 2);
  });

  test('leer el mismo archivo dos veces da lo mismo', () => {
    assert.deepEqual(leerGpx(GPX), leerGpx(GPX));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('LO QUE MANDA UN APARATO DE VERDAD — formas del archivo, no datos', () => {

  const gpx = (...cuerpo) => [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Aparato de prueba" xmlns="http://www.topografix.com/GPX/1/1">',
    ...cuerpo,
    '</gpx>',
  ].join('\n');

  test('un waypoint cerrado sobre sí mismo también cuenta', () => {
    const r = leerGpx(gpx('<wpt lat="5.0012" lon="-70.1234"/>'));
    assert.equal(r.waypoints.length, 1);
    assert.equal(r.waypoints[0].lat, 5.0012);
    assert.equal(r.waypoints[0].nombreCampo, '', 'sin nombre, pero no perdido');
    assert.ok(r.avisos.some((a) => a.tipo === 'sin_nombre'));
  });

  test('los atributos valen en cualquier orden y con comillas de las dos clases', () => {
    const r = leerGpx(gpx(
      '<wpt lon="-70.1234" lat="5.0012"><name>UNO</name></wpt>',
      "<wpt lat='5.0023' lon='-70.1239'><name>DOS</name></wpt>",
    ));
    assert.deepEqual(r.waypoints.map((p) => [p.nombreCampo, p.lat, p.lon]),
      [['UNO', 5.0012, -70.1234], ['DOS', 5.0023, -70.1239]]);
  });

  test('las entidades XML se deshacen, y el ampersand el último', () => {
    // Si el ampersand se sustituyera primero, un «&amp;lt;» del archivo saldría
    // como «<» y se llevaría por delante el texto que viniera detrás.
    const r = leerGpx(gpx('<wpt lat="5" lon="-70"><name>A &amp; B &lt;C&gt; &quot;D&quot; &amp;lt;E&amp;gt;</name></wpt>'));
    assert.equal(r.waypoints[0].nombreCampo, 'A & B <C> "D" &lt;E&gt;');
  });

  test('la descripción, el símbolo y el tipo se conservan si vienen', () => {
    const r = leerGpx(gpx('<wpt lat="5" lon="-70"><name>N</name><desc>lo que anotó la cuadrilla</desc><sym>Flag, Blue</sym><type>Estructura</type></wpt>'));
    assert.equal(r.waypoints[0].descripcion, 'lo que anotó la cuadrilla');
    assert.equal(r.waypoints[0].simbolo, 'Flag, Blue');
    assert.equal(r.waypoints[0].tipo, 'Estructura');
  });

  test('una cota vacía NO es un cero: la clave no se crea', () => {
    const r = leerGpx(gpx('<wpt lat="5" lon="-70"><ele></ele><name>N</name></wpt>'));
    assert.equal('ele' in r.waypoints[0], false);
  });

  test('una cota de CERO sí es un dato y se conserva', () => {
    const r = leerGpx(gpx('<wpt lat="5" lon="-70"><ele>0</ele><name>N</name></wpt>'));
    assert.equal(r.waypoints[0].ele, 0);
    assert.ok(!r.avisos.some((a) => a.tipo === 'sin_cota'), 'cero es un valor: no es un hueco');
  });

  test('una cota NEGATIVA se conserva: hay terreno bajo el nivel del mar', () => {
    const r = leerGpx(gpx('<wpt lat="5" lon="-70"><ele>-3.5</ele><name>N</name></wpt>'));
    assert.equal(r.waypoints[0].ele, -3.5);
  });

  test('un punto con coordenada ilegible NO se descarta en silencio: se declara', () => {
    // Un punto que el aparato grabó y la pantalla no enseña es un punto perdido,
    // y nadie lo echaría de menos.
    const r = leerGpx(gpx(
      '<wpt lat="5.0012" lon="-70.1234"><name>BUENO</name></wpt>',
      '<wpt lat="no es un numero" lon="-70"><name>ROTO</name></wpt>',
      '<wpt lat="95" lon="-70"><name>FUERA DEL MUNDO</name></wpt>',
      '<wpt lon="-70"><name>SIN LATITUD</name></wpt>',
    ));
    assert.equal(r.waypoints.length, 1);
    const aviso = r.avisos.find((a) => a.tipo === 'coordenada_invalida');
    assert.equal(aviso.n, 3);
    assert.deepEqual(aviso.puntos, ['ROTO', 'FUERA DEL MUNDO', 'SIN LATITUD']);
  });

  test('dos puntos con el mismo nombre se delatan antes de cargarlos', () => {
    const r = leerGpx(gpx(
      '<wpt lat="5.0012" lon="-70"><name>MARCA 7</name></wpt>',
      '<wpt lat="5.0023" lon="-70"><name>MARCA 7</name></wpt>',
    ));
    const aviso = r.avisos.find((a) => a.tipo === 'nombres_repetidos');
    assert.ok(aviso, 'cargar el que no era es irreversible: hay que mirar cuál es cuál antes');
    assert.deepEqual(aviso.puntos, ['MARCA 7']);
  });

  test('un GPX con solo la traza dice que no trae ni un punto marcado', () => {
    const r = leerGpx(gpx('<trk><trkseg><trkpt lat="5" lon="-70"/><trkpt lat="5.001" lon="-70"/></trkseg></trk>'));
    assert.deepEqual(r.waypoints, []);
    const aviso = r.avisos.find((a) => a.tipo === 'sin_waypoints');
    assert.match(aviso.mensaje, /los apoyos se marcan a mano en el aparato/);
  });

  test('un archivo que NO es un GPX se dice con esas palabras, sin reventar', () => {
    for (const basura of ['', '   ', 'esto no es un archivo del GPS', '{"json": true}', null, undefined, 42]) {
      const r = leerGpx(basura);
      assert.deepEqual(r.waypoints, []);
      assert.equal(r.creator, null);
      assert.match(r.avisos[0].mensaje, /no parece un GPX/);
    }
  });

  test('leer no toca el texto que recibe ni guarda estado entre llamadas', () => {
    // El lector usa una expresión regular global: si conservara su posición
    // entre llamadas, la segunda lectura del mismo archivo devolvería menos
    // puntos que la primera. Callado, y solo a veces.
    const texto = gpx(
      '<wpt lat="5.0012" lon="-70"><name>UNO</name></wpt>',
      '<wpt lat="5.0023" lon="-70"><name>DOS</name></wpt>',
    );
    const a = leerGpx(texto);
    const b = leerGpx(texto);
    assert.equal(a.waypoints.length, 2);
    assert.deepEqual(a, b);
  });

  test('un archivo grande no se atraganta ni pierde puntos', () => {
    const muchos = Array.from({ length: 500 }, (_, i) =>
      `<wpt lat="${(5 + i * 0.0001).toFixed(6)}" lon="-70.000000"><ele>${i}</ele><name>P${i}</name></wpt>`);
    const r = leerGpx(gpx(...muchos));
    assert.equal(r.waypoints.length, 500);
    assert.equal(r.waypoints[499].nombreCampo, 'P499');
    assert.equal(r.waypoints[499].ele, 499);
  });
});
