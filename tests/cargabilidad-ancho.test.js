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
//   filas 3-5  /Membri1 /66kV · /PROELECT/I R · /MvMoment · 271 · 263 · …
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
  ['/Membri1 /66kV', '/PROELECT/I R', '/MvMoment', ...R],
  ['/Membri1 /66kV', '/PROELECT/I S', '/MvMoment', ...S],
  ['/Membri1 /66kV', '/PROELECT/I T', '/MvMoment', ...T],
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
    assert.equal(s[0].etiqueta, '/Membri1 /66kV · /PROELECT/I R · /MvMoment');
    assert.equal(s[0].valores.length, 24);
    assert.equal(s[0].valores[0], 271);
  });

  test('reconoce las tres fases de corriente por su nombre de SCADA', () => {
    assert.deepEqual(campoDeSenal('/Membri1 /66kV · /PROELECT/I R · /MvMoment'),
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
