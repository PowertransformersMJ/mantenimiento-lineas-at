// ============================================================================
// tests/exportar.test.js — pruebas de oro de los exportadores GPX / KML / CSV
// ----------------------------------------------------------------------------
// La vara de medir es el MÓDULO ORIGINAL: el fixture de la bóveda es su propia
// tabla interna (26 puntos con GMS, horas locales, distancias, azimuts y
// progresivas ya calculados por él). Los exportadores nuevos deben reproducir
// esos números donde significan lo mismo — y donde DIVERGEN a propósito
// (un empalme no es apoyo → el vano real va de estructura a estructura; Excel
// es-CO exige coma decimal), la prueba verifica la divergencia exacta.
//
// ⚠️ Los datos reales viven en la bóveda privada; estas pruebas se SALTAN
// solas cuando la bóveda no está (p. ej. en CI), y lo dicen.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { vincenty } from '../nucleo/geodesia.js';
import { aGMS } from '../exportar/gms.js';
import { derivarLevantamiento, horaLocalBogota } from '../exportar/levantamiento.js';
import { generarGpx } from '../exportar/gpx.js';
import { generarKml } from '../exportar/kml.js';
import { generarCsv, COLUMNAS_CSV } from '../exportar/csv.js';
import { calidadLevantamiento } from '../exportar/calidad.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const fixture = join(AQUI, '..', '..', 'brain-private', 'mantenimiento-lineas-at',
                     'fixtures', 'LN-627-geometria.json');
const SIN_BOVEDA = !existsSync(fixture) &&
  'fixture en la bóveda privada, no disponible aquí (esperado en CI)';

const cerca = (real, esperado, tol, msg) =>
  assert.ok(Math.abs(real - esperado) <= tol,
    `${msg}: ${real} vs ${esperado} esperado (tolerancia ${tol})`);

// Nombres canónicos, los mismos que siembra herramientas/sembrar.mjs.
const CANONICOS = [
  'LN-627 E01', 'LN-627 E02', 'LN-627 E03', 'LN-627 E04', 'LN-627 E05',
  'LN-627 EMP E05-E06', 'LN-627 E06', 'LN-627 EMP E06-E07', 'LN-627 E07',
  'LN-627 E08', 'LN-627 E09', 'LN-627 E10', 'LN-627 E11', 'LN-627 E12',
  'LN-627 E13', 'LN-627 E14', 'LN-627 E15', 'LN-627 E16', 'LN-627 E17',
  'LN-627 E18', 'LN-627 E19', 'LN-627 E20', 'LN-627 E21', 'LN-627 E22',
  'LN-627 E23', 'LN-627 E24',
];

/** Reproduce el mapeo de sembrar.mjs: fixture → documentos Apoyo. */
function apoyosDesdeFixture(crudo) {
  return crudo.map((p, i) => ({
    id: `p${i}`,
    orden: i,
    tipoPunto: /EMP/i.test(String(p.name)) ? 'Empalme' : 'Estructura',
    nombreCampo: String(p.name),
    nombreNormalizado: CANONICOS[i],
    coordenada: { lat: p.lat, lon: p.lon, cotaTerreno_m: p.ele, tomadaEn: p.utc,
                  precision_m: 8, metodo: 'gps_mano', sistemaReferencia: 'WGS84' },
    funcionEstructural: p.funcionEstructural,
    funcionProcedencia: 'confirmado_humano',
  }));
}

const LINEA = { codigo: 'LN-627', nombre: 'Línea LN-627', tensionNominal_kV: 66 };
const META = { generadoEn: '2026-07-30T18:00:00-05:00', hipotesisNombre: 'Hipótesis del módulo de campo (SIN VALIDAR)' };

/** Todas las líneas del dialecto RFC 4180: filas[0] = cabecera, filas[n] = punto n. */
const filasDatos = (lev) => generarCsv(lev, { dialecto: 'datos' })
  .split('\r\n').map((f) => f.split(','));

// ════════════════════════════════════════════════════════════════════════════
describe('exportadores — contra la tabla del módulo original', () => {
  const crudo = existsSync(fixture) ? JSON.parse(readFileSync(fixture, 'utf-8')) : [];
  const lev = crudo.length ? derivarLevantamiento(apoyosDesdeFixture(crudo)) : null;

  test('GMS idéntico al original en los 26 puntos', { skip: SIN_BOVEDA }, () => {
    for (const p of crudo) {
      assert.equal(aGMS(p.lat, 'lat'), p.latdms, `lat GMS del punto ${p.n}`);
      assert.equal(aGMS(p.lon, 'lon'), p.londms, `lon GMS del punto ${p.n}`);
    }
  });

  test('hora local de Colombia idéntica a la del original', { skip: SIN_BOVEDA }, () => {
    for (const p of crudo) {
      assert.equal(horaLocalBogota(p.utc), p.local, `hora local del punto ${p.n}`);
    }
  });

  test('la derivación cuenta lo que el modelo corregido dice', { skip: SIN_BOVEDA }, () => {
    assert.equal(lev.puntos.length, 26, '26 puntos levantados');
    assert.equal(lev.nEstructuras, 24, '24 estructuras');
    assert.equal(lev.nEmpalmes, 2, '2 empalmes');
    assert.equal(lev.tramos.length, 6, '6 tramos de tensión');
    assert.deepEqual(lev.tramos.map((t) => t.nVanos), [1, 2, 2, 14, 1, 3],
      'los vanos por tramo del relevo: 1-2-2-14-1-3');
  });

  test('GPX: 26 waypoints, precisiones del original y jornadas separadas', { skip: SIN_BOVEDA }, () => {
    const gpx = generarGpx(LINEA, lev, META);
    assert.equal((gpx.match(/<wpt /g) ?? []).length, 26);
    assert.equal((gpx.match(/<trkpt /g) ?? []).length, 26);
    assert.ok(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(gpx.includes('<gpx version="1.1"'));
    assert.ok(gpx.trimEnd().endsWith('</gpx>'));
    // El primer punto, con los toFixed exactos del original (6 y 3 decimales).
    const p1 = crudo[0];
    assert.ok(gpx.includes(`<wpt lat="${p1.lat.toFixed(6)}" lon="${p1.lon.toFixed(6)}">`));
    assert.ok(gpx.includes(`<ele>${p1.ele.toFixed(3)}</ele>`));
    assert.ok(gpx.includes(`<time>${p1.utc}</time>`));
    assert.ok(gpx.includes('<name>LN-627 E01</name>'));
    // Mejoras de la auditoría: metadata time = generación, bounds, jornadas.
    assert.ok(gpx.includes(`<time>${META.generadoEn}</time>`), 'metadata time = instante de generación');
    assert.ok(gpx.includes('<bounds '), 'bounds del recorrido');
    assert.equal((gpx.match(/<trkseg>/g) ?? []).length, 2, 'una traza por jornada (25 y 26 JUL)');
    // Estructura y empalme se distinguen en el GPS.
    assert.equal((gpx.match(/<type>Empalme<\/type>/g) ?? []).length, 2);
    assert.ok(gpx.includes('<sym>Circle, Green</sym>'), 'símbolo distinto para el empalme');
    assert.ok(gpx.includes('Función: Retención / anclaje — corta tramo de tensión'));
    // La medición GPS no se pierde tras un empalme.
    assert.ok(gpx.includes('(el punto anterior es un empalme)'));
    assert.ok(gpx.includes('Empalme — no es apoyo'));
    assert.ok(!gpx.includes('undefined') && !gpx.includes('NaN'), 'sin huecos sin datos');
  });

  test('CSV Excel es-CO: BOM, sep=;, procedencia y COMA decimal', { skip: SIN_BOVEDA }, () => {
    const csv = generarCsv(lev, { dialecto: 'excel', linea: LINEA, ...META });
    assert.ok(csv.startsWith('﻿sep=;\r\n'), 'BOM UTF-8 + sep=; en la primera línea');
    assert.ok(csv.includes('"# Línea LN-627'), 'bloque de procedencia');
    assert.ok(csv.includes('@lineas/exportar v'), 'versión del exportador adentro');
    const filas = csv.replace('﻿', '').split('\r\n');
    const iCab = filas.findIndex((f) => f === COLUMNAS_CSV.join(';'));
    assert.ok(iCab > 0, 'cabecera presente tras la procedencia');
    assert.equal(filas.length - iCab - 1, 26, 'una fila por punto');
    // La divergencia que arregla al original: 10,351170 y no 10.351170.
    assert.ok(filas[iCab + 1].includes('10,351170'), 'coma decimal para Excel es-CO');
    assert.ok(!csv.includes('undefined') && !csv.includes('NaN'));
  });

  test('CSV datos RFC 4180: sin BOM, coma de columna, punto decimal', { skip: SIN_BOVEDA }, () => {
    const csv = generarCsv(lev, { dialecto: 'datos' });
    assert.ok(!csv.startsWith('﻿'), 'sin BOM');
    assert.ok(!csv.includes('sep='), 'sin la línea sep= (rompe pandas/QGIS)');
    const filas = csv.split('\r\n');
    assert.equal(filas[0], COLUMNAS_CSV.join(','), 'cabecera RFC');
    assert.equal(filas.length, 1 + 26, 'sin renglones extra: datos limpios');
    assert.ok(filas[1].includes('10.351170'), 'punto decimal para máquinas');
  });

  test('el dialecto de datos NO lleva cabecera de procedencia, y eso es deliberado', { skip: SIN_BOVEDA }, () => {
    // Una cabecera de comentarios rompe el formato que esperan pandas y QGIS.
    // La prueba fija la decisión para que nadie la "arregle" sin pensarlo, y
    // para que la pantalla no vuelva a prometer lo contrario (lo prometió una
    // vez y era falso — lo cazó la verificación adversarial, `30 · L-20`).
    const crudo = generarCsv(lev, { dialecto: 'datos', linea: LINEA, ...META });
    assert.ok(!crudo.includes('# Línea'), 'ni con linea y meta el crudo lleva cabecera');
    assert.ok(!crudo.includes('@lineas/exportar'), 'ni la versión del exportador');
    // Pero la procedencia SÍ viaja: columna por columna.
    for (const col of ['Precision_m', 'Metodo', 'Sistema_referencia']) {
      assert.ok(COLUMNAS_CSV.includes(col), `el crudo declara ${col} por fila`);
    }
    const filas = filasDatos(lev);
    assert.equal(filas[1][COLUMNAS_CSV.indexOf('Sistema_referencia')], '"WGS84"');
    assert.equal(filas[1][COLUMNAS_CSV.indexOf('Metodo')], '"gps_mano"');
    // Y el de Excel sí la lleva: los dos comportamientos quedan fijados juntos.
    assert.ok(generarCsv(lev, { dialecto: 'excel', linea: LINEA, ...META }).includes('@lineas/exportar'));
  });

  test('CSV: la distancia GPS entre puntos consecutivos es LA DEL ORIGINAL', { skip: SIN_BOVEDA }, () => {
    const filas = filasDatos(lev);
    const col = COLUMNAS_CSV.indexOf('Dist_punto_anterior_m');
    for (let i = 0; i < crudo.length; i++) {
      const original = crudo[i].d;
      const nuestra = filas[i + 1][col];
      if (original == null) assert.equal(nuestra, '', `punto ${i + 1} sin punto anterior`);
      else cerca(Number(nuestra), original, 0.01, `distancia GPS del punto ${i + 1}`);
    }
  });

  test('CSV: donde no hay empalme en medio, vano y azimut = los del original', { skip: SIN_BOVEDA }, () => {
    const filas = filasDatos(lev);
    const cVano = COLUMNAS_CSV.indexOf('Vano_anterior_m');
    const cAz = COLUMNAS_CSV.indexOf('Azimut_deg');
    let comparados = 0;
    for (let i = 1; i < crudo.length; i++) {
      const esE = (k) => !/EMP/i.test(String(crudo[k].name));
      if (!esE(i) || !esE(i - 1)) continue;      // el vano real cruza un empalme: se prueba aparte
      cerca(Number(filas[i + 1][cVano]), crudo[i].d, 0.01, `vano del punto ${i + 1}`);
      cerca(Number(filas[i + 1][cAz]), crudo[i].az, 0.01, `azimut del punto ${i + 1}`);
      comparados++;
    }
    assert.ok(comparados >= 20, `se compararon ${comparados} vanos directos contra el original`);
  });

  test('CSV: la divergencia deliberada — el vano real NO se parte en los empalmes', { skip: SIN_BOVEDA }, () => {
    const filas = filasDatos(lev);
    const cVano = COLUMNAS_CSV.indexOf('Vano_anterior_m');
    const cTipo = COLUMNAS_CSV.indexOf('Tipo');
    const cEnVano = COLUMNAS_CSV.indexOf('Dentro_del_vano');

    // Los empalmes (filas 6 y 8 del levantamiento) no tienen vano: no son apoyos.
    for (const i of [5, 7]) {
      assert.equal(filas[i + 1][cTipo], '"Empalme"');
      assert.equal(filas[i + 1][cVano], '', 'un empalme no corta ni tiene vanos');
      assert.ok(filas[i + 1][cEnVano].includes('→'), 'declara dentro de qué vano vive');
    }

    // E06→E07 (fila 9): el original lo partía en 84,4 + 163,5; el vano real es
    // la distancia directa entre las dos estructuras (~247,8 m, docs/40 §10).
    const directo = vincenty(crudo[6].lat, crudo[6].lon, crudo[8].lat, crudo[8].lon).d;
    cerca(Number(filas[9][cVano]), directo, 0.01, 'vano real E06→E07 (el CSV redondea a 2 decimales)');
    cerca(directo, 247.8, 0.3, 'el vano real que el original escondía');
    cerca(directo, crudo[7].d + crudo[8].d, 0.5,
      'coherencia: la suma de los dos falsos ≈ el real (empalmes casi en línea)');
  });

  test('CSV: función estructural y deflexión viajan en el archivo', { skip: SIN_BOVEDA }, () => {
    const filas = filasDatos(lev);
    const cFun = COLUMNAS_CSV.indexOf('Funcion_estructural');
    const cAncla = COLUMNAS_CSV.indexOf('Corta_tramo');
    const cDef = COLUMNAS_CSV.indexOf('Deflexion_grados');
    assert.equal(filas[1][cFun], '"Terminal"');
    assert.equal(filas[1][cAncla], 'si', 'un terminal corta tramo');
    assert.equal(filas[1][cDef], '', 'el primer apoyo no tiene deflexión');
    const anclas = filas.slice(1).filter((f) => f[cAncla] === 'si').length;
    assert.equal(anclas, 7, 'las 7 estructuras que cortan los 6 tramos');
  });

  test('progresivas: iguales al original hasta el primer empalme; el total es la línea', { skip: SIN_BOVEDA }, () => {
    const filas = filasDatos(lev);
    const cProg = COLUMNAS_CSV.indexOf('Progresiva_m');
    for (let i = 0; i < 5; i++) {           // E01..E05: aún no hay empalmes en medio
      cerca(Number(filas[i + 1][cProg]), crudo[i].acc, 0.01, `progresiva del punto ${i + 1}`);
    }
    const ultima = Number(filas[26][cProg]);
    cerca(ultima, lev.longitud_m, 0.01, 'la última progresiva es la longitud de la línea');
    const sumaVanos = lev.puntos.filter((p) => p.vanoAnterior_m != null)
      .reduce((s, p) => s + p.vanoAnterior_m, 0);
    cerca(ultima, sumaVanos, 0.01, 'y coincide con la suma de los 23 vanos reales');
  });

  test('KML: tramos, carpetas, y una capa con ATRIBUTOS de verdad', { skip: SIN_BOVEDA }, () => {
    const kml = generarKml(LINEA, lev, META);
    assert.equal((kml.match(/<LineString>/g) ?? []).length, 6, 'una polilínea por tramo');
    assert.equal((kml.match(/<Point>/g) ?? []).length, 26, 'un placemark por punto');
    assert.ok(kml.includes('<Folder><name>Empalmes (no son apoyos)</name>'));
    // La traza de los tramos pasa por TODOS los puntos: 26 + 5 bordes compartidos.
    const coords = [...kml.matchAll(/<coordinates>([^<]*)<\/coordinates>/g)]
      .map((m) => m[1].trim().split(/\s+/).length);
    const enTramos = coords.slice(0, 6).reduce((a, b) => a + b, 0);
    assert.equal(enTramos, 26 + 5, 'los empalmes también van en la traza dibujada');
    // Colores KML en aabbggrr, como el original.
    assert.ok(kml.includes('<color>ff3b3bd6</color>'));
    // Auditoría: Schema + SchemaData por punto → QGIS recibe atributos.
    assert.ok(kml.includes('<Schema name="levantamiento"'));
    assert.equal((kml.match(/<SchemaData /g) ?? []).length, 26);
    assert.ok(kml.includes('<SimpleData name="funcion_estructural">Terminal</SimpleData>'));
    assert.ok(kml.includes('NO apta para verificar distancias de seguridad'));
    assert.ok(!kml.includes('undefined') && !kml.includes('NaN'));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('calidad del levantamiento — las observaciones se CALCULAN', () => {
  const crudo = existsSync(fixture) ? JSON.parse(readFileSync(fixture, 'utf-8')) : [];

  test('sobre la línea real: quiebre >90°, vanos anómalos, altimetría GPS', { skip: SIN_BOVEDA }, () => {
    const hallazgos = calidadLevantamiento(derivarLevantamiento(apoyosDesdeFixture(crudo)));
    const titulos = hallazgos.map((x) => x.titulo).join(' || ');
    // 118,2° sobre ESTRUCTURAS (el original decía 119,3° porque metía los
    // empalmes en el ángulo — mismo error de dominio ya corregido).
    assert.ok(/Quiebre de 118\.\d° en LN-627 E06/.test(titulos), 'el quiebre de E06 (~118°) se detecta');
    assert.ok(titulos.includes('±8 m'), 'la altimetría GPS queda advertida');
    assert.ok(hallazgos.some((x) => /2\.\d× el promedio/.test(x.titulo)), 'vanos >2× el promedio detectados');
    assert.ok(hallazgos.some((x) => x.titulo.includes('nombre canónico distinto')), 'el renombrado queda trazado');
    // La serie canónica E01..E24 está completa: NO debe inventarse un hueco.
    assert.ok(!titulos.includes('Huecos en la serie'), 'sin falsos huecos con la serie completa');
    const ordenSev = hallazgos.map((x) => x.severidad);
    assert.deepEqual([...ordenSev].sort((a, b) =>
      ({ atencion: 0, aviso: 1, info: 2 })[a] - ({ atencion: 0, aviso: 1, info: 2 })[b]), ordenSev,
      'ordenados de mayor a menor severidad');
  });

  test('estado cero: sin puntos no hay hallazgos ni explosión', () => {
    assert.deepEqual(calidadLevantamiento(derivarLevantamiento([])), []);
  });

  test('detecta numeración duplicada y huecos cuando existen', () => {
    const lev = derivarLevantamiento([
      { id: 'a', orden: 0, tipoPunto: 'Estructura', nombreCampo: 'E01', coordenada: { lat: 10.5, lon: -75.5 }, funcionEstructural: 'Terminal' },
      { id: 'b', orden: 1, tipoPunto: 'Estructura', nombreCampo: 'E01 bis', nombreNormalizado: 'E01', coordenada: { lat: 10.51, lon: -75.51 }, funcionEstructural: 'Suspensión' },
      { id: 'c', orden: 2, tipoPunto: 'Estructura', nombreCampo: 'E04', coordenada: { lat: 10.52, lon: -75.52 }, funcionEstructural: 'Terminal' },
    ]);
    const titulos = calidadLevantamiento(lev).map((x) => x.titulo).join(' || ');
    assert.ok(titulos.includes('Numeración duplicada'), 'dos E01 se detectan');
    assert.ok(/falta\(n\) 2, 3/.test(titulos), 'el hueco E02-E03 se detecta');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('exportadores — fronteras del estado cero (sin bóveda también corren)', () => {
  test('sin apoyos: documentos válidos y vacíos, sin explotar', () => {
    const lev = derivarLevantamiento([]);
    assert.equal(lev.puntos.length, 0);
    assert.equal(lev.tramos.length, 0);
    assert.equal(lev.longitud_m, 0);
    for (const texto of [generarGpx({ codigo: 'X' }, lev), generarKml({ codigo: 'X' }, lev),
                         generarCsv(lev), generarCsv(lev, { dialecto: 'datos' })]) {
      assert.ok(!texto.includes('undefined') && !texto.includes('NaN'));
    }
    assert.ok(generarGpx({ codigo: 'X' }, lev).trimEnd().endsWith('</gpx>'));
  });

  test('un solo punto: sin vanos, sin tramos, sin nulos disfrazados', () => {
    const lev = derivarLevantamiento([{
      id: 'a', orden: 0, tipoPunto: 'Estructura', nombreCampo: 'E1',
      coordenada: { lat: 10.5, lon: -75.5 }, funcionEstructural: 'Terminal',
    }]);
    assert.equal(lev.puntos.length, 1);
    assert.equal(lev.tramos.length, 0);
    const p = lev.puntos[0];
    assert.equal(p.vanoAnterior_m, null);
    assert.equal(p.progresiva_m, 0);
    assert.equal(p.cota_m, null);
    assert.equal(p.local, null);
    const gpx = generarGpx({ codigo: 'X' }, lev);
    assert.ok(!gpx.includes('<ele>') && !gpx.includes('<time>'), 'lo que no existe no se emite');
    assert.ok(!gpx.includes('undefined') && !gpx.includes('NaN'));
  });

  test('caracteres especiales en nombres quedan escapados en XML y CSV', () => {
    const lev = derivarLevantamiento([
      { id: 'a', orden: 0, tipoPunto: 'Estructura', nombreCampo: 'E<1> & "rara"',
        coordenada: { lat: 10.5, lon: -75.5 }, funcionEstructural: 'Terminal' },
      { id: 'b', orden: 1, tipoPunto: 'Estructura', nombreCampo: 'E2',
        coordenada: { lat: 10.51, lon: -75.51 }, funcionEstructural: 'Terminal' },
    ]);
    const gpx = generarGpx({ codigo: 'X' }, lev);
    assert.ok(gpx.includes('E&lt;1&gt; &amp; &quot;rara&quot;'), 'XML escapado');
    assert.ok(!gpx.includes('<name>E<1>'), 'nada sin escapar');
    const csv = generarCsv(lev);
    assert.ok(csv.includes('"E<1> & ""rara"""'), 'comillas dobladas en CSV');
  });

  test('la hora local no inventa: sin instante, null; con basura, null', () => {
    assert.equal(horaLocalBogota(null), null);
    assert.equal(horaLocalBogota(undefined), null);
    assert.equal(horaLocalBogota('no-es-fecha'), null);
    assert.equal(horaLocalBogota('2026-07-25T14:19:21Z'), '2026-07-25 09:19:21');
  });
});
