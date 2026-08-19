// ============================================================================
// tests/exportar-calculo.test.js — pruebas de los exportes de CÁLCULO
// ----------------------------------------------------------------------------
// Cubre exportar/mecanica.js (verificación mecánica: tramos, vanos, carga sobre
// las estructuras y umbrales) y exportar/bom.js (memoria de cantidades).
//
// CÓMO SE MIDE AQUÍ
// Un exportador no inventa cifras: las escribe. Así que hay dos preguntas
// distintas y las dos se responden por separado:
//
//   1. ¿El NÚMERO es correcto? Se ancla a identidades físicas calculables a
//      mano, no a lo que devuelva este código:
//        · longitud de catenaria  L = 2C·senh(a/2C)
//        · flecha de catenaria    f = C·(cosh(a/2C) − 1)
//        · flecha de parábola     f = w·a²/(8H)  → con w=2, a=200, H=2500 da 4 m
//                                   EXACTOS, sin decimales que discutir
//        · VIR de vanos iguales   VIR = a  (√(Σa³/Σa) con todos los vanos iguales)
//      Los valores esperados están desarrollados en serie más abajo, a mano.
//
//   2. ¿La CELDA es correcta? Que el dialecto Excel lleve coma decimal y el de
//      datos punto, que la procedencia solo viaje en el de Excel, que estén las
//      cuatro secciones, y que con entradas vacías no se escape ni un «NaN» ni un
//      «undefined» — que en una memoria de cálculo se leen como si fueran datos.
//
// ⚠️ TODOS los datos de estas pruebas son SINTÉTICOS. Ni una coordenada ni un
// nombre de estructura real: este repositorio es público (CLAUDE.md §3.1).
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { detalleVanos } from '../nucleo/vanos.js';
import { tramosDeTension } from '../nucleo/mecanica.js';
import { cantidadesGeometricas } from '../nucleo/cantidades.js';
import { evaluarUmbrales } from '../nucleo/umbrales.js';
import {
  csvVerificacionMecanica, SECCIONES_MECANICA,
  COLUMNAS_TRAMOS, COLUMNAS_VANOS, COLUMNAS_CARGAS, COLUMNAS_LONGITUDINAL, COLUMNAS_UMBRALES,
} from '../exportar/mecanica.js';
import {
  csvCantidades, SECCIONES_BOM,
  COLUMNAS_CONTINUAS, COLUMNAS_CONTEOS, COLUMNAS_NO_CUANTIFICABLE,
} from '../exportar/bom.js';
import { CRITERIO_UTILIZACION_LONGITUDINAL } from '../nucleo/longitudinal.js';
import { dialectoCsv } from '../exportar/dialecto.js';

// ════════════════════════════════════════════════════════════════════════════
// Caso sintético: w = 2 kg/m, H = 2500 kgf → C = H/w = 1250 m; vanos de 200 m.
// Elegido para que a/(2C) = 0,08 y las series converjan en cuatro términos, de
// modo que los valores esperados se puedan escribir a mano y comprobar con una
// calculadora de bolsillo.
// ════════════════════════════════════════════════════════════════════════════
const W_KG_M = 2;
const H_KGF = 2500;
const A_M = 200;
const C_M = H_KGF / W_KG_M;          // 1250 m
const X = A_M / (2 * C_M);           // 0,08 — adimensional

// senh(0,08) = 0,08 + 0,08³/6 + 0,08⁵/120 + 0,08⁷/5040 = 0,080085360672…
const SENH_X = 0.08 + 0.08 ** 3 / 6 + 0.08 ** 5 / 120 + 0.08 ** 7 / 5040;
// cosh(0,08) = 1 + 0,08²/2 + 0,08⁴/24 + 0,08⁶/720 = 1,003201707…
const COSH_X = 1 + 0.08 ** 2 / 2 + 0.08 ** 4 / 24 + 0.08 ** 6 / 720;

const LONGITUD_ESPERADA_M = 2 * C_M * SENH_X;      // 200,2134017 m
const FLECHA_ESPERADA_M = C_M * (COSH_X - 1);      // 4,0021338 m
const FLECHA_PARABOLA_M = (W_KG_M * A_M * A_M) / (8 * H_KGF); // 4 m EXACTOS

// Cuatro apoyos, tres vanos iguales, anclas en los extremos. Nombres inventados.
const APOYOS = [
  { nombre: 'A01', funcionEstructural: 'Terminal' },
  { nombre: 'A02', funcionEstructural: 'Suspensión' },
  { nombre: 'A03', funcionEstructural: 'Suspensión' },
  { nombre: 'A04', funcionEstructural: 'Terminal' },
];
const VANOS_M = [A_M, A_M, A_M];

const LINEA = { codigo: 'LX-001', nombre: 'Línea de prueba sintética', tensionNominal_kV: 66 };
const META = {
  generadoEn: '2026-07-31T09:00:00-05:00',
  hipotesisNombre: 'Hipótesis sintética de prueba',
};

/** El levantamiento que pide `bloqueProcedencia`, con cifras inventadas y coherentes. */
const LEVANTAMIENTO = {
  puntos: [],                 // sin puntos: no se declara precisión que no existe
  tramos: [{}],
  nEstructuras: 4,
  nEmpalmes: 0,
  longitud_m: 600,
};

// ── Utilidades de lectura del CSV ───────────────────────────────────────────

const renglones = (texto) => texto.split('\r\n');

/**
 * Filas de datos de una sección: lo que hay entre su fila de columnas y el
 * siguiente renglón en blanco (o el final del archivo).
 */
function filasDeSeccion(texto, titulo) {
  const R = renglones(texto);
  const i = R.findIndex((f) => f.includes(titulo));
  assert.notEqual(i, -1, `no se encontró la sección ${titulo}`);
  const filas = [];
  for (let k = i + 2; k < R.length && R[k] !== ''; k++) filas.push(R[k]);
  return filas;
}

const cabeceraDeSeccion = (texto, titulo) => {
  const R = renglones(texto);
  const i = R.findIndex((f) => f.includes(titulo));
  assert.notEqual(i, -1, `no se encontró la sección ${titulo}`);
  return R[i + 1];
};

/** Corta una fila por el separador del dialecto respetando las comillas. */
function celdas(fila, sep) {
  const out = [];
  let actual = '';
  let dentro = false;
  for (let i = 0; i < fila.length; i++) {
    const ch = fila[i];
    if (ch === '"') {
      if (dentro && fila[i + 1] === '"') { actual += '"'; i++; }
      else dentro = !dentro;
    } else if (ch === sep && !dentro) { out.push(actual); actual = ''; }
    else actual += ch;
  }
  out.push(actual);
  return out;
}

// ── Armado del caso completo, con el núcleo real ────────────────────────────

const tramosNucleo = tramosDeTension(APOYOS, VANOS_M);

/** Filas de tramo como las arma la vista (`calcularTramos`), con cifras a mano. */
const FILAS_TRAMO = tramosNucleo.map((t, i) => ({
  n: i + 1,
  desde: t.desde.nombre,
  hasta: t.hasta.nombre,
  nVanos: t.vanos.length,
  vanoMax: Math.max(...t.vanos),
  vir: t.vir,
  hEds: H_KGF,
  hTMax: 2200,
  hViento: 3100,
  hTMin: 2900,
  pctRts: (3100 / 10000) * 100,   // 31 % de una RTS sintética de 10 000 kgf
  flechaMax: FLECHA_ESPERADA_M,
}));

/**
 * Filas de vano: `detalleVanos` numera DENTRO del tramo, así que aquí se
 * renumera de forma corrida y se les pega su tramo — que es exactamente el
 * contrato que el exportador exige (si no, salen tres «vano 1»).
 */
const FILAS_VANO = tramosNucleo.flatMap((t, iT) =>
  detalleVanos(t, { w: W_KG_M }, { eds: { H: H_KGF, w: W_KG_M } })
    .map((v) => ({ ...v, tramo: `${t.desde.nombre} → ${t.hasta.nombre}`, iT })))
  .map((v, i) => ({ ...v, n: i + 1 }));

const INDICADORES = [
  { id: 'vano_vir', etiqueta: 'Relación vano / VIR', valor: 1, unidad: '',
    umbral: [0.7, 1.3], comparador: 'entre', estado: 'cumple',
    criterio: 'Banda adoptada; fuera de ella el tiro común del tramo deja de representar al vano.',
    fuente: 'criterio de diseño (sin norma)' },
  { id: 'tiro_adoptado', etiqueta: 'Tiro máximo / RTS', valor: 31, unidad: '%',
    umbral: 50, comparador: '<=', estado: 'cumple',
    criterio: 'Umbral del 50 % adoptado por defecto; es práctica clásica, no norma citada.',
    fuente: 'criterio de diseño (sin norma)' },
  { id: 'ampacidad', etiqueta: 'Ampacidad', valor: null, unidad: 'A',
    umbral: null, comparador: 'ninguno', estado: 'no_evaluable',
    criterio: 'Falta la corriente máxima de operación de la línea.',
    fuente: 'IEEE 738' },
];

/**
 * Filas de carga como las produce `cargasDeLaLinea` (y las pasa la vista).
 * Se escriben a mano y no se calculan aquí a propósito: lo que esta suite mide
 * es el ESCRITOR del archivo, no la física — ésa ya tiene sus 31 pruebas en
 * `cargas.test.js` y `cargas-vista.test.js`. Los tres casos que importan al
 * escritor son: un apoyo completo, uno sin capacidad declarada y un extremo sin
 * carga ninguna.
 */
const FILAS_CARGA = [
  { n: 1, apoyo: 'A', funcionEstructural: 'Terminal', esExtremo: true, tramos_n: [1],
    deflexion_grados: null, factorAngulo: null, amplifica: null,
    nConductores: 3, vanoViento_m: 100, tiro_kgf: 3100, estadoTiro: 'Máximo viento',
    ftAngulo_kgf: null, ftViento_kgf: 45, ftTotal_kgf: null,
    utilizacion_pct: null, margen_kgf: null, estadoUtilizacion: 'no_evaluable',
    notas: ['Sin utilización: primero falta la carga total.'],
    noEvaluable: 'apoyo extremo: la deflexión no está definida. Un extremo trabaja a carga LONGITUDINAL.' },
  { n: 2, apoyo: 'B', funcionEstructural: 'Retención / anclaje', esExtremo: false, tramos_n: [1, 2],
    deflexion_grados: 120, factorAngulo: Math.sqrt(3), amplifica: true,
    nConductores: 3, vanoViento_m: 200, tiro_kgf: 3100, estadoTiro: 'Máximo viento',
    ftAngulo_kgf: 16108.4, ftViento_kgf: 91.8, ftTotal_kgf: 16200.2,
    utilizacion_pct: 45, margen_kgf: 1800, estadoUtilizacion: 'cumple',
    notas: ['El quiebre de 120.0° multiplica la tensión por 1.732.'], noEvaluable: null },
  { n: 3, apoyo: 'C', funcionEstructural: 'Suspensión', esExtremo: false, tramos_n: [2],
    deflexion_grados: 2, factorAngulo: 0.0349, amplifica: false,
    nConductores: 3, vanoViento_m: 200, tiro_kgf: 3100, estadoTiro: 'Máximo viento',
    ftAngulo_kgf: 324.6, ftViento_kgf: 91.8, ftTotal_kgf: 416.4,
    utilizacion_pct: null, margen_kgf: null, estadoUtilizacion: 'no_evaluable',
    notas: ['Sin utilización: falta carga de rotura del apoyo, altura libre sobre el terreno.'],
    noEvaluable: null },
];

const ENTRADA_MECANICA = {
  linea: LINEA,
  conductor: { codigo: 'CX-240' },
  hipotesis: { nombre: 'Hipótesis sintética de prueba' },
  tramos: FILAS_TRAMO,
  vanos: FILAS_VANO,
  cargas: FILAS_CARGA,
  indicadores: INDICADORES,
  levantamiento: LEVANTAMIENTO,
};

// ════════════════════════════════════════════════════════════════════════════
describe('exportar/mecanica.js — los números, contra identidades físicas', () => {

  test('el caso sintético reproduce las identidades de la catenaria', () => {
    // Antes de comprobar el archivo hay que comprobar el caso: si el núcleo no
    // diera estos números, la prueba del CSV estaría midiendo con una vara mala.
    const v = FILAS_VANO[0];
    assert.equal(v.a_m, 200);
    assert.ok(Math.abs(v.parametroC_m - 1250) < 1e-9, 'C = H/w = 1250 m');
    assert.ok(Math.abs(v.longitudConductor_m - LONGITUD_ESPERADA_M) < 1e-6,
      `L = 2C·senh(a/2C) = ${LONGITUD_ESPERADA_M} m`);
    assert.ok(Math.abs(v.flechaEds_m - FLECHA_ESPERADA_M) < 1e-6,
      `f = C·(cosh(a/2C) − 1) = ${FLECHA_ESPERADA_M} m`);
    // La parábola subestima la flecha SIEMPRE (nucleo/vanos.js lo declara):
    // 4 m exactos contra 4,0021 m de la catenaria.
    assert.equal(FLECHA_PARABOLA_M, 4);
    assert.ok(FLECHA_PARABOLA_M < v.flechaEds_m, 'la parábola queda por debajo de la catenaria');
    // VIR de vanos iguales = el propio vano: √(Σa³/Σa) = √(3a³/3a) = a.
    assert.ok(Math.abs(FILAS_TRAMO[0].vir - 200) < 1e-9, 'VIR de tres vanos de 200 m = 200 m');
  });

  test("la celda escribe el valor de la identidad, redondeado y sin tocar", () => {
    const datos = csvVerificacionMecanica(ENTRADA_MECANICA, { dialecto: 'datos', ...META });
    const fila = celdas(filasDeSeccion(datos, SECCIONES_MECANICA.vanos)[0], ',');
    const col = (nombre) => fila[COLUMNAS_VANOS.indexOf(nombre)];

    assert.equal(col('Vano_m'), '200.00');
    assert.equal(col('Longitud_conductor_m'), LONGITUD_ESPERADA_M.toFixed(3)); // 200.213
    assert.equal(col('Longitud_conductor_m'), '200.213');
    assert.equal(col('Flecha_EDS_m'), '4.002');
    assert.equal(col('Parametro_C_m'), '1250.0');
    assert.equal(col('Rel_VIR'), '1.000');
    assert.equal(col('Fuera_de_rango'), 'no');
    // El estado tMax no se pasó: la celda queda VACÍA, no en cero. Un cero se
    // leería como «conductor tenso y horizontal», que es una afirmación.
    assert.equal(col('Flecha_Tmax_m'), '');
    assert.equal(col('Flecha_Tmin_m'), '');
  });

  test('el VIR y el % de RTS salen tal cual en la sección de tramos', () => {
    const datos = csvVerificacionMecanica(ENTRADA_MECANICA, { dialecto: 'datos', ...META });
    const fila = celdas(filasDeSeccion(datos, SECCIONES_MECANICA.tramos)[0], ',');
    const col = (nombre) => fila[COLUMNAS_TRAMOS.indexOf(nombre)];

    assert.equal(col('VIR_m'), '200.00');
    assert.equal(col('Vano_max_m'), '200.00');
    assert.equal(col('N_vanos'), '3');
    assert.equal(col('Pct_RTS'), '31.00');
    assert.equal(col('H_EDS_kgf'), '2500.0');
    assert.equal(col('Flecha_max_m'), '4.002');
    assert.equal(col('Linea'), 'LX-001');
    assert.equal(col('Conductor'), 'CX-240');
    assert.equal(col('Desde'), 'A01');
    assert.equal(col('Hasta'), 'A04');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('exportar/mecanica.js — los dos dialectos', () => {
  const excel = csvVerificacionMecanica(ENTRADA_MECANICA, { dialecto: 'excel', ...META });
  const datos = csvVerificacionMecanica(ENTRADA_MECANICA, { dialecto: 'datos', ...META });

  test('el decimal cambia: coma en Excel, punto en datos', () => {
    const fExcel = celdas(filasDeSeccion(excel, SECCIONES_MECANICA.vanos)[0], ';');
    const fDatos = celdas(filasDeSeccion(datos, SECCIONES_MECANICA.vanos)[0], ',');
    const iL = COLUMNAS_VANOS.indexOf('Longitud_conductor_m');

    assert.equal(fExcel[iL], '200,213');
    assert.equal(fDatos[iL], '200.213');
    // Y que no se cuele el otro: un punto decimal en el archivo de Excel es la
    // columna que entra como TEXTO, se ve bien y no suma.
    assert.ok(!excel.includes('200.213'), 'el dialecto excel no debe llevar punto decimal');
    assert.ok(!datos.includes('200,213'), 'el dialecto datos no debe llevar coma decimal');
  });

  test('solo el dialecto Excel lleva BOM, sep=; y procedencia', () => {
    assert.ok(excel.startsWith('﻿'), 'el archivo de Excel abre con BOM');
    assert.ok(renglones(excel)[1] === 'sep=;' || renglones(excel)[0].endsWith('sep=;'),
      'sep=; va en el primer renglón útil');
    assert.ok(excel.includes('# Línea LX-001'), 'la procedencia identifica la línea');
    assert.ok(excel.includes('4 estructuras + 0 empalmes'), 'la procedencia sale de bloqueProcedencia');
    assert.ok(excel.includes('Exportador @lineas/exportar v'), 'la procedencia lleva la versión');
    assert.ok(excel.includes('Hipótesis sintética de prueba'), 'la procedencia lleva la hipótesis');

    assert.ok(!datos.startsWith('﻿'), 'el archivo de datos NO lleva BOM');
    assert.ok(!datos.includes('sep=;'), 'el archivo de datos NO lleva sep=;');
    assert.ok(!datos.includes('# '), 'el archivo de datos NO lleva renglones de comentario');
    assert.ok(!datos.includes('Exportador @lineas/exportar'), 'ni la cabecera de procedencia');
  });

  test('ambos dialectos escriben EXACTAMENTE las mismas filas de datos', () => {
    for (const seccion of Object.values(SECCIONES_MECANICA)) {
      assert.equal(
        filasDeSeccion(excel, seccion).length,
        filasDeSeccion(datos, seccion).length,
        `la sección ${seccion} debe traer el mismo número de filas en los dos dialectos`,
      );
    }
  });

  test('renglones separados por CRLF, sin saltos sueltos', () => {
    for (const texto of [excel, datos]) {
      assert.ok(texto.includes('\r\n'));
      assert.equal(texto.replace(/\r\n/g, '').includes('\n'), false, 'no debe haber \\n suelto');
    }
  });

  test('una celda de texto que empiece por = + - @ NO se le entrega a Excel como fórmula', () => {
    // §ADR-013, hallazgo 18. Las comillas del CSV no protegen: se las come el
    // analizador del formato y lo que llega a la hoja es el contenido. Un apoyo
    // que la cuadrilla grabó en el GPS como `=1+1` deja la columna mostrando un
    // `2` o un `#NAME?`, y la hoja archivada junto al expediente ya no dice a
    // qué estructura pertenece la fila. Los nombres vienen de datos de campo.
    for (const malo of ['=1+1', '+E07', '-E07', '@apoyo', '\tE07']) {
      const { q, num } = dialectoCsv({ dialecto: 'excel' });
      assert.equal(q(malo), `"'${malo}"`,
        `la celda «${malo}» tiene que salir con apóstrofo delante`);
    }
  });

  test('pero los NÚMEROS negativos siguen siendo números, no texto', () => {
    // El apóstrofo es solo para TEXTO. Un tiro de −340 kgf empieza por `-`:
    // prefijarlo lo convertiría en texto y la columna dejaría de sumar, que es
    // exactamente el defecto que esta protección existe para no cometer.
    const { num } = dialectoCsv({ dialecto: 'excel' });
    assert.equal(num(-339.9, 1), '-339,9');
    assert.ok(!num(-339.9, 1).startsWith("'"), 'un número negativo no lleva apóstrofo');
  });

  test('la comilla doble se sigue doblando después de neutralizar', () => {
    const { q } = dialectoCsv({ dialecto: 'excel' });
    assert.equal(q('=SUM("A")'), `"'=SUM(""A"")"`);
  });

  test('un solo renglón en blanco entre bloques, nunca dos seguidos', () => {
    // Dos filas vacías seguidas no rompen nada, pero al seleccionar el rango en
    // Excel se arrastran dentro y ensucian el conteo de filas del bloque. Además
    // es el síntoma de que el separador se está poniendo en dos sitios: el que
    // abre el bloque y el que cierra el anterior.
    for (const [nombre, texto] of [['excel', excel], ['datos', datos]]) {
      const R = renglones(texto);
      for (let i = 1; i < R.length; i++) {
        assert.ok(!(R[i] === '' && R[i - 1] === ''),
          `${nombre}: dos renglones vacíos seguidos en la fila ${i}`);
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('exportar/mecanica.js — las cinco secciones', () => {
  const excel = csvVerificacionMecanica(ENTRADA_MECANICA, { dialecto: 'excel', ...META });
  const datos = csvVerificacionMecanica(ENTRADA_MECANICA, { dialecto: 'datos', ...META });

  test('las cinco secciones están en los dos dialectos, con sus cabeceras', () => {
    for (const texto of [excel, datos]) {
      const sep = texto === excel ? ';' : ',';
      for (const seccion of Object.values(SECCIONES_MECANICA)) {
        assert.ok(texto.includes(seccion), `falta la sección ${seccion}`);
      }

      assert.deepEqual(celdas(cabeceraDeSeccion(texto, SECCIONES_MECANICA.tramos), sep),
        COLUMNAS_TRAMOS);
      assert.deepEqual(celdas(cabeceraDeSeccion(texto, SECCIONES_MECANICA.vanos), sep),
        COLUMNAS_VANOS);
      assert.deepEqual(celdas(cabeceraDeSeccion(texto, SECCIONES_MECANICA.cargas), sep),
        COLUMNAS_CARGAS);
      assert.deepEqual(celdas(cabeceraDeSeccion(texto, SECCIONES_MECANICA.longitudinal), sep),
        COLUMNAS_LONGITUDINAL);
      assert.deepEqual(celdas(cabeceraDeSeccion(texto, SECCIONES_MECANICA.umbrales), sep),
        COLUMNAS_UMBRALES);
    }
  });

  test('cada sección trae tantas filas como le entraron', () => {
    assert.equal(filasDeSeccion(datos, SECCIONES_MECANICA.tramos).length, FILAS_TRAMO.length);
    assert.equal(filasDeSeccion(datos, SECCIONES_MECANICA.vanos).length, 3);
    assert.equal(filasDeSeccion(datos, SECCIONES_MECANICA.cargas).length, FILAS_CARGA.length);
    assert.equal(filasDeSeccion(datos, SECCIONES_MECANICA.umbrales).length, INDICADORES.length);
  });

  test('el umbral de banda ocupa dos columnas numéricas, el escalar solo una', () => {
    const F = filasDeSeccion(datos, SECCIONES_MECANICA.umbrales).map((f) => celdas(f, ','));
    const col = (fila, nombre) => fila[COLUMNAS_UMBRALES.indexOf(nombre)];

    assert.equal(col(F[0], 'Comparador'), 'entre');
    assert.equal(col(F[0], 'Umbral_1'), '0.700');
    assert.equal(col(F[0], 'Umbral_2'), '1.300');

    assert.equal(col(F[1], 'Comparador'), '<=');
    assert.equal(col(F[1], 'Umbral_1'), '50.000');
    assert.equal(col(F[1], 'Umbral_2'), '', 'un umbral escalar deja vacía la segunda columna');

    // La fila no evaluable conserva su criterio: es donde dice QUÉ dato falta.
    assert.equal(col(F[2], 'Estado'), 'no_evaluable');
    assert.equal(col(F[2], 'Valor'), '');
    assert.match(col(F[2], 'Criterio'), /corriente máxima/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('exportar/mecanica.js — la sección de CARGAS sobre las estructuras', () => {
  const datos = csvVerificacionMecanica(ENTRADA_MECANICA, { dialecto: 'datos', ...META });
  const excel = csvVerificacionMecanica(ENTRADA_MECANICA, { dialecto: 'excel', ...META });
  const F = filasDeSeccion(datos, SECCIONES_MECANICA.cargas).map((f) => celdas(f, ','));
  const col = (fila, nombre) => fila[COLUMNAS_CARGAS.indexOf(nombre)];

  test('el factor del quiebre tiene columna propia y tres decimales', () => {
    // Es el número que cambia la conversación: en una hoja se ordena por él.
    assert.equal(col(F[1], 'Factor_quiebre'), Math.sqrt(3).toFixed(3));
    assert.equal(col(F[1], 'Amplifica_tension'), 'si');
    assert.equal(col(F[2], 'Amplifica_tension'), 'no');
  });

  test('sin ángulo, `Amplifica_tension` es «no evaluable» y NO «no»', () => {
    // Escribir «no» donde nadie pudo medirlo afirma que el apoyo está holgado,
    // que es justo lo contrario de lo que se sabe de un extremo.
    assert.equal(col(F[0], 'Amplifica_tension'), 'no evaluable');
    assert.equal(col(F[0], 'Factor_quiebre'), '', 'sin ángulo, celda vacía');
    assert.equal(col(F[0], 'Ft_total_kgf'), '');
  });

  test('sin capacidad declarada, utilización y margen quedan VACÍOS con su estado', () => {
    assert.equal(col(F[2], 'Utilizacion_pct'), '');
    assert.equal(col(F[2], 'Margen_kgf'), '');
    assert.equal(col(F[2], 'Estado_utilizacion'), 'no_evaluable');
    // Y con capacidad, el número sale.
    assert.equal(col(F[1], 'Utilizacion_pct'), '45.00');
    assert.equal(col(F[1], 'Estado_utilizacion'), 'cumple');
  });

  test('el estado se escribe CRUDO, que es la llave con la que se filtra la hoja', () => {
    for (const f of F) {
      assert.match(col(f, 'Estado_utilizacion'), /^(cumple|revisar|no_evaluable)$/);
    }
  });

  test('el motivo y las notas viajan en la celda de la fila, no en un anexo', () => {
    assert.match(col(F[0], 'Motivo'), /LONGITUDINAL/);
    assert.match(col(F[2], 'Motivo'), /falta carga de rotura/);
    // Quien lea la fila tiene que ver por qué falta el número sin salir de ella.
    assert.ok(col(F[0], 'Motivo').includes(' · '), 'motivo y notas se juntan con separador propio');
  });

  test('los tramos del apoyo NO usan el separador de columnas', () => {
    // Un '1;2' partiría la fila en Excel y correría todas las columnas.
    const fExcel = celdas(filasDeSeccion(excel, SECCIONES_MECANICA.cargas)[1], ';');
    assert.equal(fExcel[COLUMNAS_CARGAS.indexOf('Tramos')], '1+2');
    assert.equal(fExcel.length, COLUMNAS_CARGAS.length, 'la fila conserva sus columnas');
  });

  test('el dialecto Excel escribe coma decimal también aquí', () => {
    const fExcel = celdas(filasDeSeccion(excel, SECCIONES_MECANICA.cargas)[1], ';');
    assert.equal(fExcel[COLUMNAS_CARGAS.indexOf('Factor_quiebre')],
      Math.sqrt(3).toFixed(3).replace('.', ','));
    assert.equal(fExcel[COLUMNAS_CARGAS.indexOf('Utilizacion_pct')], '45,00');
  });

  // ⚠️ La columna que impide leer un «cumple» sin saber sobre qué se calculó. La
  // hoja se ordena y se filtra por ella: los apoyos cuyo veredicto se apoya en un
  // dato que nadie midió salen juntos. Vacía = ningún supuesto entró.
  test('los datos SUPUESTOS que entraron en el veredicto tienen columna propia', () => {
    const conSupuesto = csvVerificacionMecanica({
      ...ENTRADA_MECANICA,
      cargas: ENTRADA_MECANICA.cargas.map((c, i) => (i === 1
        ? { ...c, supuestosDelVeredicto: [
            { campo: 'alturaLibre_m', etiqueta: 'altura libre sobre el terreno', fuente: 'a ojo' }] }
        : c)),
    }, { dialecto: 'datos', ...META });
    const G = filasDeSeccion(conSupuesto, SECCIONES_MECANICA.cargas).map((f) => celdas(f, ','));

    assert.ok(COLUMNAS_CARGAS.includes('Datos_supuestos'));
    assert.equal(col(G[1], 'Datos_supuestos'), 'altura libre sobre el terreno');
    assert.equal(col(G[0], 'Datos_supuestos'), '',
      'sin supuestos la celda va vacía: no se inventa una marca');
    for (const f of G) assert.equal(f.length, COLUMNAS_CARGAS.length,
      'la columna nueva no puede descuadrar la fila');
  });

  test('la cabecera del archivo anuncia las cinco secciones y que los ejes NO se suman', () => {
    assert.match(excel, /Cinco secciones en un archivo/);
    assert.match(excel, /CARGA TRANSVERSAL/);
    assert.match(excel, /CARGA[\s\S]{0,20}LONGITUDINAL/);
    assert.match(excel, /Los dos ejes de carga NO se suman entre sí/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
// El VEREDICTO del eje longitudinal en la hoja de cálculo.
//
// ⚠️ Estas filas son SINTÉTICAS y con nombres inventados. En el inventario real
// no hay ni una capacidad longitudinal declarada, así que hoy la columna sale
// vacía en todas las filas de todas las líneas; sembrar una capacidad «para
// poder verlo funcionar» sería publicar un «cumple» sobre un número que nadie
// firmó, y es el error exacto que este sistema existe para no cometer. Aquí —y
// solo aquí— es donde se ve funcionar (CLAUDE.md §3.1, repositorio público).
// ════════════════════════════════════════════════════════════════════════════
describe('exportar/mecanica.js — el veredicto del eje longitudinal llega al CSV', () => {
  const BASE = {
    funcionEstructural: 'Terminal', caso: 'terminal',
    deflexion_grados: 0, factorLongitudinal: 1,
    flAdelanteMax_kgf: 1500, estadoAdelante: 'Mínima temperatura',
    flAtrasMax_kgf: null, estadoAtras: null,
    sensibilidadTendido_kgf: 60, sentidoResoluble: true, inversionResoluble: false,
    roturaAtras_kgf: null, roturaAdelante_kgf: null, notas: [], noEvaluable: null,
  };
  const FILAS_LONGITUDINAL = [
    // CON capacidad declarada: el día que el inventario la traiga.
    { ...BASE, n: 1, apoyo: 'AP-A',
      utilizacion_pct: 22.5, umbralAplicado_pct: 50, estadoUtilizacion: 'cumple',
      criterioUtilizacion: 'CRITERIO SINTÉTICO: capacidad de rotura de 20.000 kgf a 12,0 m.' },
    // Con capacidad declarada y por encima del tope.
    { ...BASE, n: 2, apoyo: 'AP-B',
      utilizacion_pct: 63.25, umbralAplicado_pct: 50, estadoUtilizacion: 'revisar',
      criterioUtilizacion: 'CRITERIO SINTÉTICO: capacidad de rotura de 8.000 kgf a 12,0 m.' },
    // SIN capacidad: el estado de HOY en el 100 % del inventario.
    { ...BASE, n: 3, apoyo: 'AP-C',
      utilizacion_pct: null, umbralAplicado_pct: null,
      estadoUtilizacion: null, criterioUtilizacion: null,
      notas: ['Sin veredicto en el eje longitudinal: nadie ha declarado la capacidad del apoyo.'] },
  ];
  const ENTRADA = { ...ENTRADA_MECANICA, longitudinal: FILAS_LONGITUDINAL };
  const datos = csvVerificacionMecanica(ENTRADA, { dialecto: 'datos', ...META });
  const excel = csvVerificacionMecanica(ENTRADA, { dialecto: 'excel', ...META });
  const F = filasDeSeccion(datos, SECCIONES_MECANICA.longitudinal).map((f) => celdas(f, ','));
  const col = (fila, nombre) => fila[COLUMNAS_LONGITUDINAL.indexOf(nombre)];

  test('la fila conserva sus columnas y la cabecera sigue siendo la declarada', () => {
    assert.deepEqual(celdas(cabeceraDeSeccion(datos, SECCIONES_MECANICA.longitudinal), ','),
      COLUMNAS_LONGITUDINAL);
    for (const f of F) assert.equal(f.length, COLUMNAS_LONGITUDINAL.length);
  });

  test('con capacidad declarada salen el porcentaje, el TOPE aplicado y el estado', () => {
    assert.equal(col(F[0], 'Utilizacion_pct'), '22.50');
    assert.equal(col(F[0], 'Umbral_aplicado_pct'), '50');
    assert.equal(col(F[0], 'Estado_utilizacion'), 'cumple');
    assert.equal(col(F[1], 'Estado_utilizacion'), 'revisar');
  });

  test('el TOPE viaja en su propia columna: aquí no es una constante', () => {
    // En el otro eje el 50 % es fijo y basta declararlo una vez al pie. Aquí
    // depende del TIPO de capacidad declarada, así que una hoja que publicara el
    // porcentaje sin el tope obligaría a adivinar contra qué se comparó — y esa
    // adivinanza es un factor 2 sobre el veredicto de un apoyo.
    assert.ok(COLUMNAS_LONGITUDINAL.includes('Umbral_aplicado_pct'));
    assert.equal(col(F[2], 'Umbral_aplicado_pct'), '', 'sin veredicto no se inventa un tope');
  });

  test('sin capacidad declarada la celda queda VACÍA y el estado es «no_evaluable»', () => {
    // El estado se escribe crudo y con la MISMA llave que la sección anterior:
    // el sistema tiene que decir lo mismo del mismo apoyo en los dos ejes.
    assert.equal(col(F[2], 'Utilizacion_pct'), '');
    assert.equal(col(F[2], 'Criterio_utilizacion'), '');
    assert.equal(col(F[2], 'Estado_utilizacion'), 'no_evaluable');
    for (const f of F) assert.match(col(f, 'Estado_utilizacion'), /^(cumple|revisar|no_evaluable)$/);
  });

  test('el motivo de la ausencia viaja en la fila, no en un anexo', () => {
    assert.match(col(F[2], 'Motivo'), /nadie ha declarado la capacidad del apoyo/);
  });

  test('cada fila declara CONTRA QUÉ se comparó: un número sin origen no es firmable', () => {
    assert.match(col(F[0], 'Criterio_utilizacion'), /20\.000 kgf a 12,0 m/);
    assert.notEqual(col(F[0], 'Criterio_utilizacion'), col(F[1], 'Criterio_utilizacion'),
      'el criterio es de cada apoyo: capacidades distintas, textos distintos');
  });

  test('el criterio del eje va PEGADO al título de la sección, y es el del núcleo', () => {
    // Mismo patrón que la sección de carga transversal (§ADR-013): un veredicto
    // sin decir contra qué se comparó es una opinión con formato de dato. Y el
    // texto se IMPORTA: copiarlo es cómo la hoja y el papel firmado acaban
    // diciendo cosas distintas.
    for (const texto of [datos, excel]) {
      const titulo = texto.split(/\r?\n/).find((f) => f.includes(SECCIONES_MECANICA.longitudinal));
      assert.ok(titulo.includes(CRITERIO_UTILIZACION_LONGITUDINAL),
        'el título de la sección longitudinal tiene que llevar el criterio del núcleo');
    }
  });

  test('el dialecto Excel escribe coma decimal también en la utilización', () => {
    const fExcel = celdas(filasDeSeccion(excel, SECCIONES_MECANICA.longitudinal)[1], ';');
    assert.equal(fExcel[COLUMNAS_LONGITUDINAL.indexOf('Utilizacion_pct')], '63,25');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('exportar/bom.js — memoria de cantidades', () => {
  // Caso que SÍ se puede cuantificar: tres vanos de 200 m con su longitud real
  // de catenaria, 3 conductores por circuito y 1 circuito.
  const cantidades = cantidadesGeometricas({
    vanos_m: VANOS_M.map((a) => ({ vano_m: a, longitudConductor_m: LONGITUD_ESPERADA_M })),
    apoyos: APOYOS.map((a) => ({ tipoPunto: 'Estructura', funcionEstructural: a.funcionEstructural,
      funcionProcedencia: 'confirmado_humano' })),
    conductor: { conductoresPorCircuito: 3, codigo: 'CX-240' },
    circuitos: 1,
  });

  const entrada = { linea: LINEA, cantidades, levantamiento: LEVANTAMIENTO };
  const excel = csvCantidades(entrada, { dialecto: 'excel', ...META });
  const datos = csvCantidades(entrada, { dialecto: 'datos', ...META });

  test('las tres secciones están, con sus cabeceras, en los dos dialectos', () => {
    for (const texto of [excel, datos]) {
      const sep = texto === excel ? ';' : ',';
      assert.ok(texto.includes(SECCIONES_BOM.continuas));
      assert.ok(texto.includes(SECCIONES_BOM.conteos));
      assert.ok(texto.includes(SECCIONES_BOM.noCuantificable));

      assert.deepEqual(celdas(cabeceraDeSeccion(texto, SECCIONES_BOM.continuas), sep),
        COLUMNAS_CONTINUAS);
      assert.deepEqual(celdas(cabeceraDeSeccion(texto, SECCIONES_BOM.conteos), sep),
        COLUMNAS_CONTEOS);
      assert.deepEqual(celdas(cabeceraDeSeccion(texto, SECCIONES_BOM.noCuantificable), sep),
        COLUMNAS_NO_CUANTIFICABLE);
    }
  });

  test('la cantidad de conductor es la identidad geométrica, no un redondeo', () => {
    // 3 vanos × 200,2134017 m × 3 conductores/circuito × 1 circuito, sin reserva.
    const esperado = 3 * LONGITUD_ESPERADA_M * 3;
    const F = filasDeSeccion(datos, SECCIONES_BOM.continuas).map((f) => celdas(f, ','));
    const conductor = F.find((f) => /Conductor de fase/.test(f[COLUMNAS_CONTINUAS.indexOf('Concepto')]));
    assert.ok(conductor, 'debe existir el renglón de conductor de fase');
    assert.equal(conductor[COLUMNAS_CONTINUAS.indexOf('Cantidad')], esperado.toFixed(2));
    assert.equal(conductor[COLUMNAS_CONTINUAS.indexOf('Cantidad')], '1801.92');

    // Y el eje horizontal es la suma de vanos: 600 m. Que sean distintos es el
    // punto entero del archivo — comprar por el eje deja la línea corta.
    const eje = F.find((f) => /eje horizontal/.test(f[COLUMNAS_CONTINUAS.indexOf('Concepto')]));
    assert.equal(eje[COLUMNAS_CONTINUAS.indexOf('Cantidad')], '600.00');
  });

  test('los conteos salen enteros y con su procedencia', () => {
    const F = filasDeSeccion(datos, SECCIONES_BOM.conteos).map((f) => celdas(f, ','));
    const suma = F.reduce((s, f) => s + Number(f[COLUMNAS_CONTEOS.indexOf('Cantidad')]), 0);
    assert.equal(suma, 4, 'cuatro apoyos, ni uno más');
    for (const f of F) {
      assert.match(f[COLUMNAS_CONTEOS.indexOf('Cantidad')], /^\d+$/, 'sin decimales');
      assert.equal(f[COLUMNAS_CONTEOS.indexOf('Procedencia')], 'levantamiento_campo');
      assert.equal(f[COLUMNAS_CONTEOS.indexOf('Linea')], 'LX-001');
    }
  });

  test('NO CUANTIFICABLE es obligatoria y trae el motivo de cada aviso', () => {
    const F = filasDeSeccion(datos, SECCIONES_BOM.noCuantificable).map((f) => celdas(f, ','));
    assert.equal(F.length, cantidades.avisos.length);
    assert.ok(F.length >= 5, 'lo que solo se ve en campo se declara SIEMPRE');

    for (const f of F) {
      const motivo = f[COLUMNAS_NO_CUANTIFICABLE.indexOf('Motivo')];
      assert.notEqual(motivo, '', 'un aviso sin motivo es un hueco, no una declaración');
    }
    const conceptos = F.map((f) => f[COLUMNAS_NO_CUANTIFICABLE.indexOf('Concepto')]);
    for (const esperado of ['Crucetas', 'Retenidas y anclas', 'Herrajes y grapas',
      'Aisladores / cadenas', 'Puestas a tierra']) {
      assert.ok(conceptos.includes(esperado), `falta el aviso «${esperado}»`);
    }
  });

  test('el decimal cambia entre dialectos también aquí', () => {
    assert.ok(excel.includes('1801,92'), 'coma decimal en el archivo de Excel');
    assert.ok(datos.includes('1801.92'), 'punto decimal en el archivo de datos');
    assert.ok(!excel.includes('1801.92'));
    assert.ok(!datos.includes('1801,92'));
  });

  test('la procedencia solo viaja en el dialecto Excel', () => {
    assert.ok(excel.startsWith('﻿'));
    assert.ok(excel.includes('sep=;'));
    assert.ok(excel.includes('# Línea LX-001'));
    assert.ok(excel.includes('NO CUANTIFICABLE'), 'la advertencia manda leer el bloque de avisos');

    assert.ok(!datos.startsWith('﻿'));
    assert.ok(!datos.includes('sep=;'));
    assert.ok(!datos.includes('# '));
  });

  test('el texto con separador o comillas no rompe la fila', () => {
    // Un motivo con «;» dentro es exactamente lo que parte una hoja de Excel si
    // el campo no va entrecomillado: la mitad del texto salta a la columna
    // siguiente y el renglón de al lado se corre entero.
    const conTrampa = csvCantidades({
      linea: LINEA,
      cantidades: {
        continuas: [], discretas: [],
        avisos: [{ concepto: 'Aviso "raro"', motivo: 'lleva ; y "comillas" adentro' }],
      },
    }, { dialecto: 'excel' });
    const F = filasDeSeccion(conTrampa, SECCIONES_BOM.noCuantificable).map((f) => celdas(f, ';'));
    assert.equal(F.length, 1);
    assert.equal(F[0][COLUMNAS_NO_CUANTIFICABLE.indexOf('Concepto')], 'Aviso "raro"');
    assert.equal(F[0][COLUMNAS_NO_CUANTIFICABLE.indexOf('Motivo')], 'lleva ; y "comillas" adentro');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('exportes de cálculo — entradas vacías: huecos declarados, nunca NaN', () => {
  /** Lo que jamás puede aparecer en una hoja que alguien firma o con la que compra. */
  const BASURA = /NaN|undefined|\[object Object\]|Infinity/;

  const vacios = [
    ['mecanica sin entrada', csvVerificacionMecanica(undefined, { dialecto: 'excel' })],
    ['mecanica entrada vacía excel', csvVerificacionMecanica({}, { dialecto: 'excel' })],
    ['mecanica entrada vacía datos', csvVerificacionMecanica({}, { dialecto: 'datos' })],
    ['mecanica sin opciones', csvVerificacionMecanica({})],
    ['mecanica con nulos dentro', csvVerificacionMecanica({
      linea: null, conductor: null, hipotesis: null,
      tramos: [{}, null], vanos: [{}, null], indicadores: [{}, null],
    }, { dialecto: 'datos' })],
    ['bom sin entrada', csvCantidades(undefined, { dialecto: 'excel' })],
    ['bom entrada vacía excel', csvCantidades({}, { dialecto: 'excel' })],
    ['bom entrada vacía datos', csvCantidades({}, { dialecto: 'datos' })],
    ['bom sin opciones', csvCantidades({})],
    ['bom con cantidades de entrada vacía', csvCantidades({
      linea: LINEA, cantidades: cantidadesGeometricas({}),
    }, { dialecto: 'datos' })],
    ['mecanica con umbrales de entrada vacía', csvVerificacionMecanica({
      linea: LINEA, indicadores: evaluarUmbrales({}),
    }, { dialecto: 'excel' })],
  ];

  for (const [nombre, texto] of vacios) {
    test(`${nombre}: ni NaN ni undefined en el archivo`, () => {
      assert.ok(typeof texto === 'string' && texto.length > 0, 'siempre devuelve texto');
      assert.doesNotMatch(texto, BASURA);
    });
  }

  test('sin filas, cada sección DICE por qué está vacía', () => {
    const texto = csvVerificacionMecanica({ linea: LINEA }, { dialecto: 'datos' });
    for (const seccion of Object.values(SECCIONES_MECANICA)) {
      const F = filasDeSeccion(texto, seccion);
      assert.equal(F.length, 1, `${seccion} debe traer el renglón que explica el vacío`);
      assert.match(F[0], /\(sin filas\)/);
      assert.ok(F[0].length > 60, 'el motivo se escribe entero, no con un guion');
    }
  });

  test('un BOM sin avisos avisa de que eso mismo es sospechoso', () => {
    const texto = csvCantidades({ linea: LINEA, cantidades: {} }, { dialecto: 'datos' });
    const F = filasDeSeccion(texto, SECCIONES_BOM.noCuantificable);
    assert.equal(F.length, 1);
    assert.match(F[0], /SOSPECHOSO/);
  });

  test('sin levantamiento, la procedencia se declara NO EVALUABLE en vez de inventarse', () => {
    const texto = csvVerificacionMecanica({ linea: LINEA, tramos: FILAS_TRAMO },
      { dialecto: 'excel', ...META });
    assert.ok(texto.includes('# Línea LX-001'));
    assert.ok(texto.includes('NO EVALUABLE'), 'dice que no puede declarar el origen geodésico');
    assert.ok(!texto.includes('empalmes'), 'no cuenta empalmes que nadie contó');
    assert.ok(texto.includes('Exportador @lineas/exportar v'), 'pero sí versiona el exportador');
  });
});
