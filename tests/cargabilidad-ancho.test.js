// ============================================================================
// tests/cargabilidad-ancho.test.js — la exportación de SCADA, tal como sale
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. El primer archivo real del Ingeniero —«Cargas 22 Jul
// LN-627.xlsx»— no es una tabla: es una matriz TRANSPUESTA. El tiempo va en
// columnas y cada magnitud en su fila. Ninguna mejora de la detección de
// cabecera podía leerlo, porque **no hay cabecera que encontrar**.
//
// La forma que se reproduce aquí es la suya, medida en su pantalla:
//
//   fila 1     vacía
//   fila 2     46225 · 46225,0417 · …          ← sellos de tiempo, en horizontal
//   filas 3-5  /SubA /66kV · /PROELECT/I R · /MvMoment · 271 · 263 · …
//
// ⚠️ Los VALORES de las tres fases son los suyos y están aquí a propósito: son
// lo que hace que esta suite pruebe el caso real y no una idealización. No son
// dato personal ni secreto —son amperios de una hora—, pero si alguna vez lo
// fueran, se sustituyen y las pruebas siguen valiendo igual.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { leerXlsx } from '../importar/xlsx.js';
import { contrasteConLaAmpacidad, encontrarCabecera, resumen } from '../nucleo/cargabilidad.js';

import {
  campoDeSenal, cerosAlFinal, CRITERIOS_DE_FASE, encontrarEjeDeTiempo, instanteDeSerial,
  leerSenales, pareceAncho, pareceSelloDeTiempo, registrosDesdeAncho,
  ordenDeFecha, instanteDeTexto, instanteDeSello, unirAnchas,
  campoDeFase,
} from '../nucleo/cargabilidadAncho.js';

/** El eje de tiempo de un día completo: 24 sellos, hora a hora. */
const EJE = (() => { const t = [46225]; for (let h = 1; h < 24; h++) t.push(46225 + h / 24); return t; })();

const R = [271, 263, 259, 251, 238, 233, 224, 206, 195, 212, 251, 271, 276, 256, 248, 280, 255,
  453, 457, 478, 480, 483, 0, 0];
const S = [268, 260, 257, 251, 237, 233, 223, 205, 190, 229, 250, 271, 275, 257, 247, 278, 252,
  458, 461, 480, 486, 488, 0, 0];
const T = [269, 260, 257, 248, 237, 231, 223, 205, 190, 231, 251, 274, 280, 260, 251, 282, 257,
  470, 472, 492, 500, 502, 0, 0];

const MATRIZ = [
  [],
  [null, null, null, ...EJE],
  ['/SubA /66kV', '/PROELECT/I R', '/MvMoment', ...R],
  ['/SubA /66kV', '/PROELECT/I S', '/MvMoment', ...S],
  ['/SubA /66kV', '/PROELECT/I T', '/MvMoment', ...T],
  [], [], [],
];

// ════════════════════════════════════════════════════════════════════════════
// 1 · EL EJE DE TIEMPO
// ════════════════════════════════════════════════════════════════════════════
describe('el tiempo va en columnas, y hay que reconocerlo', () => {
  test('el serial 46225 es el 22 de julio de 2026, que es el nombre del archivo', () => {
    // La comprobación que cierra el diagnóstico: si la fecha no cuadrara con el
    // nombre, la lectura entera estaría mal y nadie lo notaría.
    assert.deepEqual(instanteDeSerial(46225), { fecha: '2026-07-22', hora: 0 });
  });

  test('⚠️ las fracciones son horas EXACTAS, y hay que redondear al minuto', () => {
    // El serial trae 0,041666666664 y no el sexto decimal exacto. Truncar sin
    // redondear deja las 00:59 en vez de la 01:00 — y con eso, todo el día
    // corrido una hora hacia atrás sin dar un error.
    assert.equal(instanteDeSerial(46225.041666666664).hora, 1);
    assert.equal(instanteDeSerial(46225.5).hora, 12);
    assert.equal(instanteDeSerial(46225.958333333336).hora, 23);
  });

  test('encuentra la fila del eje y en qué columnas empieza el dato', () => {
    const eje = encontrarEjeDeTiempo(MATRIZ);
    assert.equal(eje.fila, 1);
    assert.equal(eje.columnas.length, 24);
    assert.equal(eje.primeraColumna, 3, 'las tres primeras celdas son la etiqueta de la señal');
  });

  test('⚠️ una fila de AMPERAJES no se confunde con un eje de tiempo', () => {
    // Es la trampa: 46225 está en el rango de un serial, pero también podría
    // serlo un número suelto. Lo que decide es que haya varios Y CRECIENDO —
    // una fila de medidas no crece sola.
    assert.equal(encontrarEjeDeTiempo([[30000, 25000, 40000, 21000]]), null,
      'aceptó una fila desordenada como eje de tiempo');
    assert.equal(encontrarEjeDeTiempo([[271, 263, 259, 251]]), null);
    assert.equal(pareceSelloDeTiempo(271), false);
    assert.equal(pareceSelloDeTiempo(46225), true);
  });

  test('con menos de tres sellos no se da por bueno', () => {
    assert.equal(encontrarEjeDeTiempo([[46225, 46226]]), null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2 · LAS SEÑALES
// ════════════════════════════════════════════════════════════════════════════
describe('cada fila es una señal, con su etiqueta entera', () => {
  test('la etiqueta NO se corta: las tres celdas dicen algo', () => {
    const s = leerSenales(MATRIZ, encontrarEjeDeTiempo(MATRIZ));
    assert.equal(s.length, 3, 'las filas vacías del final se colaron como señales');
    assert.equal(s[0].etiqueta, '/SubA /66kV · /PROELECT/I R · /MvMoment');
    assert.equal(s[0].valores.length, 24);
    assert.equal(s[0].valores[0], 271);
  });

  test('reconoce las tres fases de corriente por su nombre de SCADA', () => {
    assert.deepEqual(campoDeSenal('/SubA /66kV · /PROELECT/I R · /MvMoment'),
      { campo: 'corriente_A', fase: 'R', porQue: 'corriente de la fase R' });
    assert.equal(campoDeSenal('… /I S …').fase, 'S');
    assert.equal(campoDeSenal('… /I T …').fase, 'T');
  });

  test('reconoce las demás magnitudes por su unidad', () => {
    assert.equal(campoDeSenal('/SE /P MW').campo, 'potenciaActiva_MW');
    assert.equal(campoDeSenal('/SE /Q MVAr').campo, 'potenciaReactiva_MVAr');
    assert.equal(campoDeSenal('/SE /U kV').campo, 'tension_kV');
    assert.equal(campoDeSenal('/SE /Cargabilidad %').campo, 'cargabilidad_pct');
  });

  test('⚠️ lo que NO reconoce devuelve null, no arriesga una asignación', () => {
    // Una señal asignada mal no da error: da una gráfica falsa con cara de buena.
    assert.equal(campoDeSenal('/SE /Frecuencia Hz'), null);
    assert.equal(campoDeSenal(''), null);
  });

  test('«PROELECT» no se lee como la P de potencia activa', () => {
    // La bahía se llama así en su archivo. Sin la guarda, las tres señales de
    // corriente habrían acabado también en potencia.
    assert.equal(campoDeSenal('/PROELECT/I R').campo, 'corriente_A');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3 · LA MATRIZ → REGISTROS
// ════════════════════════════════════════════════════════════════════════════
describe('de la matriz transpuesta a los registros de siempre', () => {
  test('salen 24 registros, uno por hora, con su fecha', () => {
    const r = registrosDesdeAncho(MATRIZ, { linea: 'LN-627' });
    assert.equal(r.registros.length, 24);
    assert.equal(r.registros[0].fecha, '2026-07-22');
    assert.deepEqual(r.registros.map((x) => x.hora), Array.from({ length: 24 }, (_, i) => i));
  });

  test('⚠️ las tres fases se juntan con la MÁS CARGADA, que es lo conservador', () => {
    // El conductor que primero llega a su límite decide. Promediar las tres
    // esconde justo la fase que está peor.
    const r = registrosDesdeAncho(MATRIZ, { linea: 'LN-627', criterioFase: 'maxima' });
    const pico = r.registros.reduce((a, b) => (b.corriente_A > a.corriente_A ? b : a));
    assert.equal(pico.corriente_A, 502, 'no se quedó con la fase más cargada');
    assert.equal(pico.hora, 21);
    // Y en la hora 0: R=271, S=268, T=269 → manda 271.
    assert.equal(r.registros[0].corriente_A, 271);
  });

  test('el otro criterio existe y da otro número, dicho con su porqué', () => {
    const r = registrosDesdeAncho(MATRIZ, { linea: 'LN-627', criterioFase: 'promedio' });
    assert.equal(r.registros[0].corriente_A, 269.33);
    assert.equal(CRITERIOS_DE_FASE.length, 2);
    assert.ok(CRITERIOS_DE_FASE.every((c) => c.porQue.length > 40),
      'un criterio sin su porqué es una casilla que nadie sabe elegir');
  });

  test('⚠️ la LÍNEA la pone quien carga: el archivo no la nombra', () => {
    // Dice la subestación y la bahía, no la línea. Deducirla sería inventar la
    // atribución del dato, que es lo más caro de equivocar aquí.
    const r = registrosDesdeAncho(MATRIZ, { linea: 'LA QUE SEA' });
    assert.ok(r.registros.every((x) => x.linea === 'LA QUE SEA'));
  });

  test('sin cargabilidad en el archivo, el registro NO se la inventa', () => {
    const r = registrosDesdeAncho(MATRIZ, { linea: 'LN-627' });
    assert.ok(r.registros.every((x) => x.cargabilidad_pct === null),
      'se calculó un porcentaje sin saber contra qué capacidad');
    assert.ok(r.registros.every((x) => x.naturaleza === null));
  });

  test('una señal sin asignar no aporta nada, y se puede corregir a mano', () => {
    const sinAsignar = registrosDesdeAncho(MATRIZ, { linea: 'X', asignado: { 2: null, 3: null, 4: null } });
    assert.equal(sinAsignar.registros.length, 0, 'una señal sin campo aportó datos igualmente');

    const aMano = registrosDesdeAncho(MATRIZ, { linea: 'X', asignado: { 2: 'tension_kV', 3: null, 4: null } });
    assert.equal(aMano.registros[0].tension_kV, 271, 'la corrección a mano no se respetó');
    assert.equal(aMano.registros[0].corriente_A, null);
  });

  test('un instante sin NINGUNA medida no se guarda como hora vacía', () => {
    const conHueco = [
      [null, null, 46225, 46225 + 1 / 24, 46225 + 2 / 24],
      ['/I R', null, 10, null, 30],
    ];
    const r = registrosDesdeAncho(conHueco, { linea: 'X' });
    assert.deepEqual(r.registros.map((x) => x.hora), [0, 2],
      'la hora sin medida entró en el histórico como una hora con todo a null');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4 · LOS CEROS DEL FINAL — se avisan, no se deciden
// ════════════════════════════════════════════════════════════════════════════
describe('un cero medido y una hora sin medir son cosas distintas', () => {
  test('⚠️ se AVISA de la cola de ceros, y no se toca el dato', () => {
    // En su archivo, las horas 22 y 23 vienen en 0 en las tres fases. Puede ser
    // que no se midieran (el archivo se exportó antes de acabar el día) o que la
    // línea estuviera FUERA DE SERVICIO — y eso sería el dato más importante del
    // día. El sistema no puede saberlo, así que avisa y deja el dato como está.
    const r = registrosDesdeAncho(MATRIZ, { linea: 'LN-627' });
    const c = cerosAlFinal(r.senales, r.eje);
    assert.equal(c.horas, 2);
    assert.equal(c.desde, '22:00');
    assert.match(c.aviso, /fuera/);
    assert.match(c.aviso, /no lo puede\s+decidir el sistema|no lo puede decidir el sistema/);
    // Y el dato sigue ahí: no se ha convertido en hueco.
    assert.equal(r.registros[22].corriente_A, 0);
    assert.equal(r.registros[23].corriente_A, 0);
  });

  test('sin cola de ceros no se avisa de nada', () => {
    const sinCola = [
      [null, 46225, 46225 + 1 / 24, 46225 + 2 / 24],
      ['/I R', 10, 20, 30],
    ];
    const r = registrosDesdeAncho(sinCola, { linea: 'X' });
    assert.equal(cerosAlFinal(r.senales, r.eje), null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5 · ANCHO O TABLA — decidir sin equivocarse
// ════════════════════════════════════════════════════════════════════════════
describe('reconocer la forma del archivo antes de leerlo', () => {
  test('la matriz de SCADA se reconoce como ancha', () => {
    const p = pareceAncho(MATRIZ, { fila: null });
    assert.equal(p.ancho, true);
    assert.match(p.porQue, /transpuesta/);
  });

  test('⚠️ una tabla normal con columna de fechas NO se lee como ancha', () => {
    // Es el falso positivo que rompería lo que ya funciona: una tabla con una
    // columna de fechas tiene sellos de tiempo crecientes… hacia abajo, no a lo
    // ancho. Si además hay cabecera con campos requeridos, manda la cabecera.
    const p = pareceAncho(MATRIZ, { fila: 0, requeridos: 2 });
    assert.equal(p.ancho, false);
    assert.match(p.porQue, /cabecera/);
  });

  test('un archivo sin sellos de tiempo tampoco es ancho', () => {
    assert.equal(pareceAncho([['Fecha', 'Línea'], ['22/07/2026', 'LN-627']], { fila: 0 }).ancho, false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6 · LA CADENA ENTERA, desde un `.xlsx` DE VERDAD
// ════════════════════════════════════════════════════════════════════════════
//
// Las suites de arriba prueban la lógica sobre una matriz escrita a mano. Ésta
// prueba lo mismo pasando por el LECTOR real, con un `.xlsx` que tiene la
// estructura de su exportación: si algún día el lector cambia y deja de entregar
// la matriz cruda, esto se pone rojo y las otras no.
describe('del .xlsx de SCADA al tablero, sin tocar nada a mano', () => {
  const ARCHIVO = fileURLToPath(new URL('./fixtures/cargabilidad-scada-ancho.xlsx', import.meta.url));

  test('se reconoce como matriz, no como tabla', async () => {
    const { hojas } = await leerXlsx(readFileSync(ARCHIVO));
    const forma = pareceAncho(hojas[0].matriz, encontrarCabecera(hojas[0].matriz));
    assert.equal(forma.ancho, true, 'se intentó leer como tabla y no lo es');
    assert.match(forma.porQue, /24 sellos de tiempo/);
  });

  test('las tres fases se reconocen solas y salen 24 horas del 22 de julio', async () => {
    const { hojas } = await leerXlsx(readFileSync(ARCHIVO));
    const r = registrosDesdeAncho(hojas[0].matriz, { linea: 'LN-627' });
    assert.equal(r.senales.length, 3);
    assert.ok(r.senales.every((s) => s.campo === 'corriente_A'));
    assert.deepEqual(r.senales.map((s) => s.fase), ['R', 'S', 'T']);
    assert.equal(r.registros.length, 24);
    assert.equal(r.registros[0].fecha, '2026-07-22');
  });

  test('el tablero cuenta el día entero, y el pico es el de la fase más cargada', async () => {
    const { hojas } = await leerXlsx(readFileSync(ARCHIVO));
    const r = registrosDesdeAncho(hojas[0].matriz, { linea: 'LN-627' });
    const t = resumen(r.registros);
    assert.equal(t.registros, 24);
    assert.equal(t.lineas, 1);
    const pico = r.registros.reduce((a, b) => (b.corriente_A > a.corriente_A ? b : a));
    assert.equal(pico.corriente_A, 502);
    assert.equal(pico.hora, 21);
  });

  test('⚠️ sin porcentaje en el archivo, el contraste con la AMPACIDAD sí se puede dar', () => {
    // Es lo único que este sistema aporta y el archivo no traía: 502 A no dicen
    // nada solos; contra la ampacidad de un día en calma son el 98 %.
    const c = contrasteConLaAmpacidad(
      { cargabilidad_pct: null, corriente_A: 502, naturaleza: null }, 512);
    assert.equal(c.comparable, true);
    assert.equal(c.contraAmpacidad_pct, 98.05);
    assert.equal(c.banda, 'atencion');
    assert.equal(c.declarado_pct, null, 'se inventó un porcentaje que el archivo no traía');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 7 · SE PUEDE MIRAR SIN SESIÓN Y SIN TOCAR PRODUCCIÓN
// ════════════════════════════════════════════════════════════════════════════
//
// ⚠️ `§ADR-071` dejó escrito que no se publica dibujo que no se pueda mirar, y
// el Ingeniero añadió el 29-08 que no se le carguen archivos ajenos contra su
// producción. Las dos cosas se cumplen con lo mismo: la pantalla vive también en
// el BANCO, que no pide sesión y no es el sitio publicado.
describe('la pantalla se puede mirar en el banco', () => {
  const leer = (p) => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf-8');

  test('el banco monta la pantalla de cargabilidad y se abre por la dirección', () => {
    const banco = leer('web/src/sonda-satelital.tsx');
    assert.match(banco, /import Cargabilidad from '\.\/componentes\/Cargabilidad'/,
      'el banco dejó de montar la pantalla: verificarla vuelve a exigir su navegador');
    assert.match(banco, /'cargabilidad'/, 'no se puede abrir por `?que=cargabilidad`');
    assert.match(banco, /<Cargabilidad lineaAbierta=/,
      'el banco no le pasa una línea: no se puede probar la propuesta');
  });

  test('el banco NO viaja al sitio publicado', () => {
    // Es lo que permite que exista sin riesgo: se construye aparte, con
    // `SONDA_MAPA=1`, y Vite solo publica `index.html`.
    const vite = leer('web/vite.config.ts');
    assert.match(vite, /SONDA_MAPA/, 'el banco dejó de estar detrás de su bandera');
  });
});

// ============================================================================
// EL CSV DE SCADA — sellos escritos, varios archivos, una sola carga (`§ADR-105`)
// ----------------------------------------------------------------------------
// El histórico no siempre llega en `.xlsx`: el sistema de supervisión exporta
// CSV, con las fechas ESCRITAS en vez del serial de Excel, y **una magnitud por
// archivo**. Medido con los tres archivos reales del 2026-01-01: sin esto, el
// eje de tiempo no se encontraba y el archivo no entraba por la puerta aunque
// el resto del módulo lo entendiera entero.
// ============================================================================
describe('sellos de tiempo ESCRITOS, no seriales de Excel', () => {
  test('los reconoce, y sigue reconociendo el serial', () => {
    assert.equal(pareceSelloDeTiempo('1/01/26 0:00'), true);
    assert.equal(pareceSelloDeTiempo('01/01/2026 00:00:00'), true);
    assert.equal(pareceSelloDeTiempo('2026-01-01 05:00'), true);
    assert.equal(pareceSelloDeTiempo(46225), true, 'el serial de Excel no puede dejar de valer');
  });

  test('y NO confunde un amperaje ni un texto cualquiera con una fecha', () => {
    assert.equal(pareceSelloDeTiempo(271), false);
    assert.equal(pareceSelloDeTiempo('/PROELECT/U RS'), false);
    assert.equal(pareceSelloDeTiempo('31/02/26 0:00'), false, 'el 31 de febrero no existe');
    assert.equal(pareceSelloDeTiempo('1/13/26 0:00'), true, 'como mes 13 no vale, se lee como día 13');
  });

  test('día/mes o mes/día se decide con la EVIDENCIA del archivo, y se dice si no la hay', () => {
    const conPrueba = ordenDeFecha(['13/01/26 0:00', '13/01/26 1:00']);
    assert.equal(conPrueba.orden, 'dmy');
    assert.equal(conPrueba.seguro, true);

    const alReves = ordenDeFecha(['01/13/26 0:00']);
    assert.equal(alReves.orden, 'mdy');
    assert.equal(alReves.seguro, true);

    // Un archivo de UN SOLO DÍA nunca trae la prueba. Se toma día/mes —como se
    // escribe aquí— y se declara suposición en vez de venderlo como un hecho.
    const ambiguo = ordenDeFecha(['1/01/26 0:00', '1/01/26 1:00']);
    assert.equal(ambiguo.orden, 'dmy');
    assert.equal(ambiguo.seguro, false);
    assert.match(ambiguo.porQue, /lo desempata/);
  });

  test('el año delante manda sobre todo', () => {
    const r = ordenDeFecha(['2026-01-01 00:00']);
    assert.equal(r.orden, 'ymd');
    assert.equal(r.seguro, true);
    assert.deepEqual(instanteDeTexto('2026-01-01 05:00', 'ymd'), { fecha: '2026-01-01', hora: 5 });
  });

  test('el eje de tiempo aparece con las fechas escritas, y trae cómo las leyó', () => {
    const matriz = [
      ['', '1/01/26 0:00', '1/01/26 1:00', '1/01/26 2:00'],
      ['/SubA /66kV /PROELECT/U RS /MvMoment', 68.8, 68.9, 68.7],
    ];
    const eje = encontrarEjeDeTiempo(matriz);
    assert.ok(eje, 'sin eje no hay ni una señal');
    assert.equal(eje.fila, 0);
    assert.equal(eje.primeraColumna, 1);
    assert.deepEqual(eje.instantes[0], { fecha: '2026-01-01', hora: 0 });
    assert.deepEqual(eje.instantes[2], { fecha: '2026-01-01', hora: 2 });
    assert.equal(eje.ordenDeFecha.seguro, false, 'un solo día no demuestra el orden: hay que decirlo');
  });

  test('una fila de fechas que NO crece no es un eje', () => {
    const matriz = [['', '3/01/26 0:00', '1/01/26 0:00', '2/01/26 0:00']];
    assert.equal(encontrarEjeDeTiempo(matriz), null);
  });
});

describe('varios archivos, una sola carga', () => {
  const eje = ['', '1/01/26 0:00', '1/01/26 1:00', '1/01/26 2:00'];
  const rs = [eje, ['/SubA /66kV /PROELECT/U RS /MvMoment', 68.8, 68.9, 68.7]];
  const st = [eje, ['/SubA /66kV /PROELECT/U ST /MvMoment', 69.3, 69.5, 69.3]];
  const tr = [eje, ['/SubA /66kV /PROELECT/U TR /MvMoment', 68.9, 69.0, 68.8]];

  test('las tres tensiones acaban en la MISMA lectura, no pisándose', () => {
    const u = unirAnchas([{ nombre: 'RS', matriz: rs }, { nombre: 'ST', matriz: st }, { nombre: 'TR', matriz: tr }]);
    assert.equal(u.matriz.length, 4, 'una fila de eje y tres de señal');
    assert.deepEqual(u.deCada.map((d) => d.senales), [1, 1, 1]);
    const r = registrosDesdeAncho(u.matriz, { linea: 'LN-627', criterioFase: 'maxima' });
    assert.equal(r.registros.length, 3);
    // «La fase más cargada» sobre tres tensiones de línea = la más alta.
    assert.equal(r.registros[0].tension_kV, 69.3);
    assert.equal(r.registros[1].tension_kV, 69.5);
  });

  test('el promedio de las tres también sale, si ése es el criterio', () => {
    const u = unirAnchas([{ nombre: 'RS', matriz: rs }, { nombre: 'ST', matriz: st }, { nombre: 'TR', matriz: tr }]);
    const r = registrosDesdeAncho(u.matriz, { linea: 'LN-627', criterioFase: 'promedio' });
    assert.equal(r.registros[0].tension_kV, 69);
  });

  test('⚠️ dos rejillas de tiempo DISTINTAS no se unen: alinearlas sería interpolar', () => {
    const otroDia = [['', '2/01/26 0:00', '2/01/26 1:00', '2/01/26 2:00'], st[1]];
    assert.throws(
      () => unirAnchas([{ nombre: 'RS', matriz: rs }, { nombre: 'otro día', matriz: otroDia }]),
      /no coinciden en el instante 1/,
    );
  });

  test('⚠️ y tampoco si a uno le faltan horas: se dice cuántas trae cada uno', () => {
    // Los dos con eje válido (hacen falta 3 sellos), pero de distinta longitud.
    const largo = [[...eje, '1/01/26 3:00'], [...st[1], 69.6]];
    assert.throws(
      () => unirAnchas([{ nombre: 'RS', matriz: rs }, { nombre: 'largo', matriz: largo }]),
      /trae 4 instantes y «RS» 3/,
    );
  });

  test('un archivo sin eje de tiempo se nombra en vez de romper en silencio', () => {
    assert.throws(
      () => unirAnchas([{ nombre: 'RS', matriz: rs }, { nombre: 'basura', matriz: [['a', 1, 2]] }]),
      /«basura» no trae una fila de sellos de tiempo/,
    );
  });
});

// ============================================================================
// UN EXPORT DE LA RED ENTERA NO SE ASIGNA SOLO (`99 §ADR-105`)
// ----------------------------------------------------------------------------
// Lo cazó la primera carga real, ya en producción: los tres archivos del
// 2026-01-01 traen **7.302 señales** —toda la red, no una línea—, y como TODAS
// dicen «U», el reconocedor las acierta TODAS. Con la propuesta automática, el
// módulo habría combinado la tensión de media Colombia en un solo número por
// hora. No es un error que se vea: es una gráfica falsa con cara de buena.
//
// La aritmética que lo demuestra vive aquí; que la pantalla deje todo en «no
// usar» por encima del umbral es un guardián de fuente, más abajo.
// ============================================================================
describe('muchas señales de la misma magnitud: el peligro es real y medible', () => {
  // Tres instantes: el eje exige un mínimo de tres sellos para no confundir una
  // fila de números cualesquiera con el tiempo.
  const eje = ['', '1/01/26 0:00', '1/01/26 1:00', '1/01/26 2:00'];
  const suya = ['/SubA /66kV /PROELECT/U RS /MvMoment', 68.8, 68.9, 68.7];
  const ajena1 = ['/Zaragoc /66kV /Barra1 /U RS /MvMoment', 160.7, 160.7, 160.7];
  const ajena2 = ['/ABA302 /Valdupar/R-11957 /U RS /MvMoment', 12.8, 12.87, 12.79];
  const matriz = [eje, suya, ajena1, ajena2];

  test('sin elegir, las tres se combinan y sale una tensión que no es de nadie', () => {
    const r = registrosDesdeAncho(matriz, { linea: 'LN-627', criterioFase: 'maxima' });
    assert.equal(r.registros[0].tension_kV, 160.7,
      'esto es una subestación distinta: la prueba documenta el peligro, no lo aprueba');
  });

  test('eligiendo SOLO la suya, sale la suya', () => {
    const soloSuya = { 2: null, 3: null };   // por número de fila: las ajenas, fuera
    const r = registrosDesdeAncho(matriz, { linea: 'LN-627', asignado: soloSuya, criterioFase: 'maxima' });
    assert.equal(r.registros[0].tension_kV, 68.8);
    assert.equal(r.registros[1].tension_kV, 68.9);
  });

  test('el reconocedor acierta TODAS, que es justo por lo que hay que elegir', () => {
    for (const f of [suya, ajena1, ajena2]) {
      assert.equal(campoDeSenal(f[0])?.campo, 'tension_kV');
    }
  });
});

// ── Y el guardián de la PANTALLA, que es donde se decide ────────────────────
describe('la pantalla no asigna sola un volcado del sistema entero', () => {
  const pantalla = readFileSync(new URL('../web/src/componentes/Cargabilidad.tsx', import.meta.url), 'utf8');

  test('más de las tres fases de una magnitud: todas nacen en «no usar»', () => {
    // ⚠️ El umbral era un TOTAL de señales, y dejaba fuera el caso bueno: un mes
    // de UNA bahía son ~38 señales —ocho magnitudes por cinco estadísticos— y
    // ninguna es ambigua (`99 §ADR-117`). Lo que hay que impedir es COMBINAR:
    // tres señales de la misma magnitud y el mismo estadístico son las tres
    // fases; una cuarta significa que el archivo trae más de una bahía.
    // ⚠️ Desde el `§ADR-127` el umbral y la cuenta viven en el NÚCLEO, con prueba
    // de oro: en la pantalla se contaban solo sobre el primer día.
    const nucleo = readFileSync(new URL('../nucleo/cargabilidadAncho.js', import.meta.url), 'utf8');
    assert.match(nucleo, /export const FASES_POR_MAGNITUD = 3;/,
      'sin umbral declarado, la decisión vuelve a estar escondida en un `if`');
    assert.match(nucleo, /cubos\.set\(k,/,
      'se cuenta por magnitud + estadístico, no el total de señales');
    assert.match(pantalla, /revisarFasesPorDia\(/, 'y la pantalla se lo pregunta al núcleo');
    assert.match(pantalla, /ambiguo\s*\n?\s*\?\s*Object\.fromEntries/,
      'y el ambiguo tiene que sembrar el mapa de asignaciones en null');
  });

  test('y se puede elegir en bloque lo que casa con la búsqueda', () => {
    assert.match(pantalla, /Usar las \{nf\(casan\.length\)\} que casan/,
      'elegir tres señales entre 7.302 de una en una no es una opción');
    assert.match(pantalla, /Quitar todas/);
  });

  test('el tope de lo que se PINTA se anuncia: un tope callado se lee como «esto es todo»', () => {
    assert.match(pantalla, /se enseñan \{TOPE_SENALES\}/);
  });
});

// ============================================================================
// LAS FASES SE GUARDAN, NO SOLO SE COMBINAN (`99 §ADR-106`)
// ----------------------------------------------------------------------------
// Se detectaban aquí mismo y se tiraban en la misma función: el registro solo
// llevaba el agregado. Consecuencia medida: el indicador «desbalance entre
// fases» de la pantalla no se podía calcular NUNCA — pedía `corrienteR_A`,
// `corrienteS_A` y `corrienteT_A`, y esos tres nombres no existían en ninguna
// otra parte del repositorio.
// ============================================================================
describe('las fases sobreviven al registro', () => {
  const eje = ['', '1/01/26 0:00', '1/01/26 1:00', '1/01/26 2:00'];

  test('la tensión: RS, ST y TR se guardan Y se combinan', () => {
    const m = [eje,
      ['/SubA /66kV /PROELECT/U RS /MvMoment', 68.8, 68.9, 68.7],
      ['/SubA /66kV /PROELECT/U ST /MvMoment', 69.3, 69.5, 69.3],
      ['/SubA /66kV /PROELECT/U TR /MvMoment', 68.9, 69.0, 68.8]];
    const r = registrosDesdeAncho(m, { linea: 'LN-627', criterioFase: 'maxima' });
    const h0 = r.registros[0];
    assert.equal(h0.tensionRS_kV, 68.8);
    assert.equal(h0.tensionST_kV, 69.3);
    assert.equal(h0.tensionTR_kV, 68.9);
    assert.equal(h0.tension_kV, 69.3, 'el agregado sigue saliendo, con el criterio pedido');
    assert.equal(h0.criterioFase, 'maxima', 'un agregado que no dice cómo se hizo es un número sin procedencia');
  });

  test('la corriente: R, S y T — las tres que la pantalla lleva pidiendo', () => {
    const m = [eje,
      ['/SubA /66kV /PROELECT/I R /MvMoment', 271, 263, 259],
      ['/SubA /66kV /PROELECT/I S /MvMoment', 268, 260, 257],
      ['/SubA /66kV /PROELECT/I T /MvMoment', 269, 260, 257]];
    const h0 = registrosDesdeAncho(m, { linea: 'LN-627' }).registros[0];
    assert.equal(h0.corrienteR_A, 271);
    assert.equal(h0.corrienteS_A, 268);
    assert.equal(h0.corrienteT_A, 269);
    assert.equal(h0.corriente_A, 271, 'por defecto, la fase más cargada');
  });

  test('⚠️ la tensión entre fases y la de fase a tierra NO caen en el mismo campo', () => {
    // Es un factor de 1,73: mezclarlas daría una línea al 58 % o al 173 %.
    assert.equal(campoDeSenal('/x/U RS /MvMoment').fase, 'RS');
    assert.equal(campoDeFase('tension_kV', 'RS'), 'tensionRS_kV');
    assert.equal(campoDeSenal('/x/U R /MvMoment').fase, 'R');
    assert.equal(campoDeFase('tension_kV', 'R'), 'tensionR_kV');
    assert.match(campoDeSenal('/x/U RS /MvMoment').porQue, /entre las fases/);
    assert.match(campoDeSenal('/x/U R /MvMoment').porQue, /a tierra/);
  });

  test('la potencia aparente se reconoce por MVA, y la «S» suelta NO se adivina', () => {
    assert.equal(campoDeSenal('/x/MVA /MvMoment').campo, 'potenciaAparente_MVA');
    assert.equal(campoDeSenal('/x/S R /MvMoment').campo, 'potenciaAparente_MVA');
    assert.equal(campoDeSenal('/x/S R /MvMoment').fase, 'R');
    // Sin la barra, una «S» suelta es tan fase como magnitud: se devuelve null y
    // se asigna a mano. Arriesgar aquí no da error, da una gráfica falsa.
    assert.equal(campoDeSenal('SUBESTACION S T'), null);
  });

  test('una sola señal no inventa criterio: no hubo nada que combinar', () => {
    const m = [eje, ['/x/I R /MvMoment', 271, 263, 259]];
    const h0 = registrosDesdeAncho(m, { linea: 'LN-627' }).registros[0];
    assert.equal(h0.corrienteR_A, 271);
    assert.equal(h0.criterioFase, null, 'declarar un criterio donde no se combinó nada sería ruido');
  });
});

// ============================================================================
// UNA CARGA DE VARIOS DÍAS SE REVISA, SE ASIGNA Y SE FECHA ENTERA (`99 §ADR-127`)
// ----------------------------------------------------------------------------
// La revisión del `§ADR-126` dejó tres fallos latentes en la pantalla, y la
// reescritura destapó un cuarto. Los cuatro tienen la misma forma: una decisión
// tomada mirando SOLO el primer día —o SOLO un archivo— y aplicada después a
// todos. Ninguno da error: dan un día mal fechado, una señal cambiada por otra o
// un estadístico metido en otro. Cada uno lleva aquí el caso que lo demuestra,
// en los dos sentidos: el fallo como era y el arreglo (`30 · L-68`).
// Etiquetas INVENTADAS: este repositorio es público (`33 · L-07`).
// ============================================================================
import {
  estadisticoPorFilaCorregido, FASES_POR_MAGNITUD, ordenDeLaCarga, registrosDeVariosDias,
  revisarFasesPorDia, unirPorDia,
} from '../nucleo/cargabilidadAncho.js';

const HORAS = (dia) => ['', `${dia} 0:00`, `${dia} 1:00`, `${dia} 2:00`];
const SEN = (senal, v) => [`/SubX /BAHIA-9/${senal} /Momento`, ...v];

describe('① el tope de «tres fases por magnitud» se mira en TODOS los días', () => {
  const dia2 = { fecha: '2026-02-02', matriz: [HORAS('2/02/26'),
    SEN('I R', [100, 101, 102]), SEN('I S', [110, 111, 112]), SEN('I T', [120, 121, 122])],
  estadisticoPorFila: { 1: 'maximo', 2: 'maximo', 3: 'maximo' } };
  // El día 3 trae la fase R DOS veces: el archivo «(1)» de `33 · L-86`.
  const dia3 = { fecha: '2026-02-03', matriz: [HORAS('3/02/26'),
    SEN('I R', [200, 201, 202]), SEN('I S', [210, 211, 212]), SEN('I T', [220, 221, 222]),
    SEN('I R', [200, 201, 202])],
  estadisticoPorFila: { 1: 'maximo', 2: 'maximo', 3: 'maximo', 4: 'maximo' } };

  test('el umbral son las tres fases, y lo declara el núcleo: no un `if` de la pantalla', () => {
    assert.equal(FASES_POR_MAGNITUD, 3);
  });

  test('⚠️ el primer día, solo, está limpio — por eso mirar solo el primero era el fallo', () => {
    assert.equal(revisarFasesPorDia([dia2]).ambiguo, false);
  });

  test('con todos los días, la cuarta corriente del día 3 se ve y se nombra', () => {
    const r = revisarFasesPorDia([dia2, dia3]);
    assert.equal(r.ambiguo, true);
    assert.equal(r.excesos.length, 1);
    assert.equal(r.excesos[0].fecha, '2026-02-03');
    assert.equal(r.excesos[0].campo, 'corriente_A');
    assert.equal(r.excesos[0].estadistico, 'maximo');
    assert.equal(r.excesos[0].senales, 4);
    assert.match(r.excesos[0].porQue, /2026-02-03/);
  });

  test('⚠️ y una fase REPETIDA se ve aunque falte otra: tres señales no bastan para estar tranquilos', () => {
    // Febrero trae días a los que les falta una fase (`§ADR-126`). Si uno de ésos
    // trae además un «(1)», son TRES corrientes —pasan el tope— y dos son la R.
    const cojo = { fecha: '2026-02-06', matriz: [HORAS('6/02/26'),
      SEN('I R', [300, 301, 302]), SEN('I S', [310, 311, 312]), SEN('I R', [300, 301, 302])],
    estadisticoPorFila: { 1: 'maximo', 2: 'maximo', 3: 'maximo' } };
    const r = revisarFasesPorDia([dia2, cojo]);
    assert.equal(r.ambiguo, true);
    assert.equal(r.excesos[0].fase, 'R');
    assert.match(r.excesos[0].porQue, /fase R/);
  });

  test('el mismo sensor en DOS estadísticos no es una fase de más', () => {
    const conPromedio = { ...dia2,
      matriz: [...dia2.matriz, SEN('I R', [90, 91, 92]), SEN('I S', [95, 96, 97]), SEN('I T', [98, 99, 97])],
      estadisticoPorFila: { 1: 'maximo', 2: 'maximo', 3: 'maximo', 4: 'promedio', 5: 'promedio', 6: 'promedio' } };
    assert.equal(revisarFasesPorDia([conPromedio]).ambiguo, false);
  });

  test('las etiquetas salen de TODOS los días: la que solo trae el día 3 también se siembra', () => {
    const conActiva = { ...dia3, matriz: [HORAS('3/02/26'), SEN('I R', [1, 2, 3]), SEN('MW', [5, 6, 7])],
      estadisticoPorFila: { 1: 'maximo', 2: 'maximo' } };
    const { etiquetas } = revisarFasesPorDia([dia2, conActiva]);
    assert.ok(etiquetas.includes('/SubX /BAHIA-9/MW /Momento'));
  });
});

describe('② la asignación a mano viaja por ETIQUETA, no por número de fila', () => {
  // El mismo par de días con las filas en OTRO orden: así llegan de verdad,
  // porque cada día se une en el orden en que se leyeron sus archivos.
  const d2 = { fecha: '2026-02-02', matriz: [HORAS('2/02/26'),
    SEN('I R', [100, 101, 102]), SEN('I S', [110, 111, 112]), SEN('I T', [120, 121, 122])] };
  const d3 = { fecha: '2026-02-03', matriz: [HORAS('3/02/26'),
    SEN('I T', [220, 221, 222]), SEN('I R', [200, 201, 202]), SEN('I S', [210, 211, 212])] };

  test('⚠️ el fallo: la fila del día 2 aplicada al día 3 quita OTRA señal, sin un error', () => {
    // «No usar» sobre la S del día 2, que es su fila 2. En el día 3 la fila 2 es la R.
    const h = registrosDesdeAncho(d3.matriz, { linea: 'LN-X', asignado: { 2: null } }).registros[0];
    assert.equal(h.corrienteR_A, null, 'quitó la R');
    assert.equal(h.corrienteS_A, 210, 'y dejó la S que se quería quitar');
  });

  test('por etiqueta, la S sale de los DOS días y el resto se queda', () => {
    const r = registrosDeVariosDias([d2, d3], {
      linea: 'LN-X', asignadoPorEtiqueta: { '/SubX /BAHIA-9/I S /Momento': null },
    });
    assert.equal(r.registros.length, 6);
    const h2 = r.registros[0]; const h3 = r.registros[3];
    assert.equal(h2.fecha, '2026-02-02');
    assert.equal(h3.fecha, '2026-02-03');
    for (const h of [h2, h3]) assert.equal(h.corrienteS_A, null);
    assert.equal(h2.corrienteR_A, 100);
    assert.equal(h2.corrienteT_A, 120);
    assert.equal(h3.corrienteR_A, 200);
    assert.equal(h3.corrienteT_A, 220);
    assert.equal(h3.corriente_A, 220, 'la más cargada de las que quedan');
  });

  test('la asignación por fila NO se acepta con varios días: se niega en vez de aplicarse mal', () => {
    assert.throws(() => registrosDeVariosDias([d2, d3], { linea: 'LN-X', asignado: { 2: null } }),
      /número de fila/);
  });

  test('la lista de señales es la de la carga ENTERA, no la del primer día', () => {
    const d4 = { fecha: '2026-02-04', matriz: [HORAS('4/02/26'), SEN('I R', [1, 2, 3]), SEN('MW', [5, 6, 7])] };
    const r = registrosDeVariosDias([d2, d4], { linea: 'LN-X' });
    const etiquetas = r.senalesDeLaCarga.map((s) => s.etiqueta);
    assert.ok(etiquetas.includes('/SubX /BAHIA-9/MW /Momento'),
      'una señal que solo trae el día 4 se tiene que poder ver y quitar');
    assert.equal(etiquetas.filter((e) => e.includes('/I R ')).length, 1,
      'y la que traen los dos días sale UNA vez');
    assert.deepEqual(r.senalesDeLaCarga.find((s) => s.etiqueta.includes('/I R ')).fechas,
      ['2026-02-02', '2026-02-04']);
  });
});

describe('③ día/mes o mes/día se decide en la CARGA ENTERA', () => {
  const archivo = (nombre, dia) => ({ nombre, matriz: [HORAS(dia), SEN('I R', [1, 2, 3])] });

  test('⚠️ el fallo: cada archivo, solo, se lee «bien», y juntos doce días caen en otro mes', () => {
    assert.equal(encontrarEjeDeTiempo(archivo('a', '1/05/26').matriz).instantes[0].fecha, '2026-05-01',
      'solo, el 1/05 es el 1 de mayo');
    assert.equal(encontrarEjeDeTiempo(archivo('b', '1/13/26').matriz).instantes[0].fecha, '2026-01-13',
      'y el 1/13 de la misma carga demuestra mes/día');
  });

  test('la carga mezclada se NIEGA, y dice qué archivo lo demuestra', () => {
    assert.throws(() => unirPorDia([archivo('max-a.csv', '1/05/26'), archivo('max-b.csv', '1/13/26')]),
      /«max-b\.csv» demuestra mes\/día/);
  });

  test('dos archivos que demuestran órdenes OPUESTOS también se niegan', () => {
    assert.throws(() => unirPorDia([archivo('a.csv', '13/01/26'), archivo('b.csv', '1/13/26')]),
      /día\/mes y otros mes\/día/);
  });

  test('un mes día/mes con días sin prueba se carga, y dice que lo DEMUESTRA', () => {
    const u = unirPorDia([archivo('a.csv', '5/02/26'), archivo('b.csv', '15/02/26')]);
    assert.deepEqual(u.fechas, ['2026-02-05', '2026-02-15']);
    assert.equal(u.ordenDeFecha.orden, 'dmy');
    assert.equal(u.ordenDeFecha.seguro, true);
    assert.equal(u.ordenDeFecha.mezcla, false);
  });

  test('sin ninguna prueba se lee día/mes, y se dice que es una SUPOSICIÓN', () => {
    const u = unirPorDia([archivo('a.csv', '5/02/26'), archivo('b.csv', '6/02/26')]);
    assert.equal(u.ordenDeFecha.seguro, false);
    assert.match(u.ordenDeFecha.porQue, /suposición/);
  });

  test('un tramo entero mes/día, sin días ambiguos, se lee mes/día', () => {
    const u = unirPorDia([archivo('a.csv', '1/13/26'), archivo('b.csv', '1/14/26')]);
    assert.deepEqual(u.fechas, ['2026-01-13', '2026-01-14']);
  });

  test('el serial de Excel no es ambiguo: no cuenta como archivo «sin prueba»', () => {
    const r = ordenDeLaCarga([
      { nombre: 'serial.xlsx', orden: ordenDeFecha([46225, 46225.04]) },
      { nombre: 'b.csv', orden: ordenDeFecha(['1/13/26 0:00']) },
    ]);
    assert.equal(r.mezcla, false);
    assert.deepEqual(r.sinPrueba, []);
  });
});

describe('④ el estadístico corregido a mano vale para SU archivo, en todos los días', () => {
  // Un archivo cuyo nombre no dice qué estadístico trae se corrige en pantalla.
  // La corrección se aplicaba SOLO al día 1 —y dentro de él a todo archivo con
  // el mismo estadístico DETECTADO—; los demás días seguían sin estadístico, y
  // una señal sin estadístico entra en TODOS los que se guardan.
  const d = unirPorDia([
    { nombre: 'ir_max-a.csv', matriz: [HORAS('2/02/26'), SEN('I R', [100, 101, 102])] },
    { nombre: 'ir-a.csv', matriz: [HORAS('2/02/26'), SEN('I R', [60, 61, 62])] },
    { nombre: 'ir_max-b.csv', matriz: [HORAS('3/02/26'), SEN('I R', [200, 201, 202])] },
    { nombre: 'ir-b.csv', matriz: [HORAS('3/02/26'), SEN('I R', [70, 71, 72])] },
  ]);
  const corregido = { 'ir-a.csv': 'minimo', 'ir-b.csv': 'minimo' };
  const dias = d.porDia.map((x) => ({
    fecha: x.fecha, matriz: x.union.matriz,
    estadisticoPorFila: estadisticoPorFilaCorregido(x.union.senales, corregido),
  }));

  test('⚠️ el fallo: sin la corrección, el archivo sin marca entra también en el MÁXIMO', () => {
    const crudo = d.porDia.map((x) => ({
      fecha: x.fecha, matriz: x.union.matriz, estadisticoPorFila: x.union.estadisticoPorFila,
    }));
    const r = registrosDeVariosDias(crudo, { linea: 'LN-X', estadistico: 'maximo' });
    assert.equal(r.registros[3].criterioFase, 'maxima',
      'el día 3: dos «fases R» combinadas — el mínimo metido dentro del máximo');
  });

  test('corregido archivo a archivo, el máximo es solo el máximo, los dos días', () => {
    const r = registrosDeVariosDias(dias, { linea: 'LN-X', estadistico: 'maximo' });
    assert.deepEqual(r.registros.map((h) => h.corrienteR_A), [100, 101, 102, 200, 201, 202]);
    assert.ok(r.registros.every((h) => h.criterioFase == null), 'una sola señal: nada combinado');
    const m = registrosDeVariosDias(dias, { linea: 'LN-X', estadistico: 'minimo' });
    assert.deepEqual(m.registros.map((h) => h.corrienteR_A), [60, 61, 62, 70, 71, 72]);
  });

  test('⚠️ dos archivos sin marca corregidos a estadísticos DISTINTOS no se confunden', () => {
    const u = unirAnchas([
      { nombre: 'x.csv', matriz: [HORAS('2/02/26'), SEN('I R', [1, 2, 3])] },
      { nombre: 'y.csv', matriz: [HORAS('2/02/26'), SEN('I S', [4, 5, 6])] },
    ]);
    const porFila = estadisticoPorFilaCorregido(u.senales, { 'x.csv': 'maximo', 'y.csv': 'promedio' });
    assert.deepEqual(Object.values(porFila), ['maximo', 'promedio'],
      'el mapa iba por estadístico DETECTADO: los dos «sin marca» caían en el mismo');
  });

  test('«no lo dice» elegido a mano deja el archivo SIN estadístico, como lo cuenta la pantalla', () => {
    const porFila = estadisticoPorFilaCorregido(d.porDia[0].union.senales, { 'ir_max-a.csv': '' });
    assert.equal(porFila[1], null);
  });
});

// ── Y la PANTALLA, que es quien las llama (`30 · L-28`: lo que nadie llama no existe)
describe('la pantalla lee la carga ENTERA, no el primer día (`99 §ADR-127`)', () => {
  const pantalla = readFileSync(new URL('../web/src/componentes/Cargabilidad.tsx', import.meta.url), 'utf8');

  test('① la revisión de fases recibe TODOS los días', () => {
    assert.match(pantalla, /const revision = revisarFasesPorDia\(diasARevisar\)/);
    assert.match(pantalla, /const diasARevisar = [\s\S]{0,200}dias\.porDia\.map/,
      'el conteo sobre `dias.porDia[0]` era el fallo');
    assert.doesNotMatch(pantalla, /porFilaEst\[/, 'la cuenta vieja, en la pantalla, no vuelve');
  });

  test('② ninguna lectura aplica la asignación por fila: todas van por etiqueta', () => {
    assert.doesNotMatch(pantalla, /registrosDesdeAncho\(/,
      'toda lectura de la carga pasa por registrosDeVariosDias');
    assert.equal((pantalla.match(/asignadoPorEtiqueta: asignado/g) ?? []).length, 2,
      'lo que se MIRA y lo que se GUARDA, con la misma asignación');
    assert.match(pantalla, /\[s\.etiqueta\]: e\.target\.value \|\| null/);
  });

  test('③ cómo se leyó la fecha se ENSEÑA', () => {
    assert.match(pantalla, /cargado\.ordenDeFecha/);
  });

  test('④ el estadístico corregido va por archivo en todos los días, y sin él no se guarda', () => {
    assert.match(pantalla, /estadisticoPorFilaCorregido\(d\.anotadas, corregido\)/);
    assert.match(pantalla, /if \(cargado\.ancho && sinResolver\.length\)/,
      '«No se guardan así» era una promesa que nadie cumplía');
  });
});
