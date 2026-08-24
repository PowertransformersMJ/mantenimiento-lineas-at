// ============================================================================
// tests/frescura-del-atlas.test.js — «¿de cuándo es lo que estoy mirando?»
// ----------------------------------------------------------------------------
// El Ingeniero lo pidió así (2026-08-24): «me gustaría que se pueda apreciar la
// fecha de última actualización y hora». Detrás de esa frase hay DOS fechas que
// no son la misma, y esta suite existe porque confundirlas es exactamente el
// fallo que se lee como verdad:
//
//   1. LA HORA EN UTC PRESENTADA COMO LA SUYA. Las fichas se sellan en UTC. Un
//      archivo construido a las 03:00Z se construyó a las **22:00 del día
//      ANTERIOR** en Colombia. Imprimir el sello tal cual adelanta un día entero
//      la «última actualización», y nadie lo nota.
//   2. «ACTUALIZADO HOY» SOBRE DATO DE MAYO. Reconstruir el archivo no adelanta
//      la fuente: el atlas solar se reconstruye cada semana y NASA sigue
//      publicando con ~87 días de retraso. Enseñar solo la fecha del archivo
//      diría «al día» sobre un mapa de hace tres meses.
//   3. EL RETRASO SIN DUEÑO. Un aviso que no dice si el atraso es del archivo o
//      de la fuente manda a buscar la avería al sitio equivocado — y a
//      reconstruir una y otra vez algo que no va a moverse.
//
// `ahora` se INYECTA siempre: una prueba que dependa del reloj de verdad se
// pone roja sola dentro de unos meses sin que nadie haya tocado nada.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { frescuraDelAtlas, diaEnPalabras } from '../web/src/vistas/atlasCaribe.ts';

/** Una ficha de juguete: solo lo que mira esta pieza. */
const ficha = (construido, ultimoDiaConHoras) => ({
  construido, ultimoDiaConHoras, capa: 'x', titulo: 'x', departamentos: [],
  bbox: [-77, 7, -71, 13], ancho: 6, alto: 6, resolucion_m: 1, resolucion_nativa_m: 1,
  codificacion: { offset: 0, paso: 1, sin_dato: 0 }, cuadros: { horas: 24, porFila: 24, celdaAncho: 6, celdaAlto: 6 },
  anio: 2026, meses: [], ultimoDiaConTotal: null, resumenDiario: [], resumenDiarioEtiqueta: '',
  resumenDiarioUnidad: '', resumenDiarioAviso: '', rampa: [], aviso: '', fuente: '',
  atribucion: '', unidad: '',
});

// ════════════════════════════════════════════════════════════════════════════
describe('la hora que se publica es la del reloj de la cuadrilla', () => {

  test('EL FALLO Nº 1: un sello de las 03:00Z son las 22:00 del día ANTERIOR', () => {
    const f = frescuraDelAtlas(ficha('2026-08-23T03:00:44.977Z', '2026-08-19'),
      new Date('2026-08-24T12:00:00Z'));
    assert.equal(f.construidoDia, '2026-08-22', 'se publicó el día UTC, no el de Colombia');
    assert.equal(f.construidoHora, '22:00');
    // Y lo que habría salido con el sello crudo, que es lo que se impide:
    assert.notEqual(f.construidoDia, '2026-08-23');
  });

  test('el mediodía de Colombia no cruza a otro día', () => {
    const f = frescuraDelAtlas(ficha('2026-08-24T17:00:00Z', '2026-08-19'),
      new Date('2026-08-24T18:00:00Z'));
    assert.equal(f.construidoDia, '2026-08-24');
    assert.equal(f.construidoHora, '12:00');
  });

  test('una ficha sin sello legible no inventa una fecha', () => {
    assert.equal(frescuraDelAtlas(ficha('', '2026-08-19'), new Date('2026-08-24T12:00:00Z')), null);
    assert.equal(frescuraDelAtlas(ficha('el jueves', '2026-08-19'), new Date('2026-08-24T12:00:00Z')), null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('las dos distancias, y de quién es el retraso', () => {

  const AHORA = new Date('2026-08-24T12:00:00Z');   // 07:00 en Colombia

  test('archivo de hoy y dato de anteayer: al día', () => {
    const f = frescuraDelAtlas(ficha('2026-08-24T09:00:00Z', '2026-08-21'), AHORA);
    assert.equal(f.diasDelArchivo, 0);
    assert.equal(f.diasDelDato, 3);
    assert.equal(f.porQue, 'al-dia');
  });

  test('EL FALLO Nº 2: archivo recién hecho y dato de mayo → el retraso es de la FUENTE', () => {
    // El caso real del atlas solar y el de nubes: NASA publica con ~87 días.
    const f = frescuraDelAtlas(ficha('2026-08-23T03:00:44.977Z', '2026-05-30'), AHORA);
    assert.equal(f.porQue, 'fuente-atrasada');
    assert.equal(f.diasDelDato, 86);
    assert.ok(f.diasDelArchivo <= 2, 'el archivo es nuevo: el problema no es él');
  });

  test('EL FALLO Nº 3: si el archivo lleva semanas quieto, el retraso es NUESTRO', () => {
    const f = frescuraDelAtlas(ficha('2026-07-10T09:00:00Z', '2026-07-08'), AHORA);
    assert.equal(f.porQue, 'archivo-viejo');
    assert.equal(f.diasDelArchivo, 45);
  });

  test('el vigía mira cada 4 h: diez días quieto ya es NUESTRO, no de la fuente', () => {
    // La frontera exacta, escrita: dentro del umbral no se acusa a nadie.
    const dentro = frescuraDelAtlas(ficha('2026-08-15T09:00:00Z', '2026-08-13'), AHORA);
    assert.equal(dentro.porQue, 'al-dia', 'nueve días todavía cabe en la cadencia');
    const fuera = frescuraDelAtlas(ficha('2026-08-13T09:00:00Z', '2026-08-11'), AHORA);
    assert.equal(fuera.porQue, 'archivo-viejo');
  });

  test('EL CASO QUE ACUSA AL INOCENTE: archivo viejo Y fuente muy atrasada', () => {
    // El atlas solar dentro de doce días: el vigía habrá mirado 72 veces y NASA
    // seguirá en mayo. Si la edad del archivo se preguntara primero, la pantalla
    // diría «hace 12 días que no se reconstruye» —una acusación falsa— y mandaría
    // a reconstruir algo que no puede adelantar un solo día.
    const f = frescuraDelAtlas(ficha('2026-08-23T03:00:00Z', '2026-05-30'),
      new Date('2026-09-10T12:00:00Z'));
    assert.equal(f.diasDelArchivo, 19, 'el archivo sí es viejo…');
    assert.equal(f.porQue, 'fuente-atrasada', '…pero el retraso sigue siendo de la fuente');
  });

  test('nunca se cuentan días en negativo', () => {
    // Un archivo con sello del futuro —reloj mal puesto en el que lo construyó—
    // diría «hace -3 días», que se lee como un fallo de la pantalla.
    const f = frescuraDelAtlas(ficha('2026-08-30T09:00:00Z', '2026-08-29'), AHORA);
    assert.equal(f.diasDelArchivo, 0);
    assert.equal(f.diasDelDato, 0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('la fecha en palabras no pasa por husos', () => {

  test('un día ISO se lee tal cual, sin adelantarse ni atrasarse', () => {
    // Con `new Date('2026-05-30')` y `toLocaleDateString` en una máquina al
    // oeste de Greenwich, esto imprimiría **29** de mayo.
    assert.equal(diaEnPalabras('2026-05-30'), '30 de mayo de 2026');
    assert.equal(diaEnPalabras('2026-01-01'), '1 de enero de 2026');
    assert.equal(diaEnPalabras('2026-12-31', false), '31 de diciembre');
  });

  test('lo que no es una fecha se devuelve tal cual, no se maquilla', () => {
    assert.equal(diaEnPalabras('2026-13-01'), '2026-13-01');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('lo que la pantalla y el vigía tienen que seguir haciendo', () => {

  const ATLAS = readFileSync(
    fileURLToPath(new URL('../web/src/componentes/AtlasCaribe.tsx', import.meta.url)), 'utf-8');
  const VIGIA = readFileSync(
    fileURLToPath(new URL('../.github/workflows/vigia-nasa.yml', import.meta.url)), 'utf-8');
  const DESPLIEGUE = readFileSync(
    fileURLToPath(new URL('../.github/workflows/desplegar.yml', import.meta.url)), 'utf-8');

  test('se publican LAS DOS fechas, no solo la del archivo', () => {
    assert.match(ATLAS, /<b>Actualizado<\/b>/, 'desapareció la fecha de actualización');
    assert.match(ATLAS, /dato medido hasta el/,
      'se quedó solo la fecha del archivo: «actualizado hoy» sobre dato de mayo');
  });

  test('y con la HORA, que es lo que se pidió', () => {
    assert.match(ATLAS, /frescura\.construidoHora/, 'se perdió la hora');
    assert.match(ATLAS, /hora de Colombia/, 'la hora dejó de decir de qué reloj es');
  });

  test('el retraso se atribuye: fuente o archivo', () => {
    assert.match(ATLAS, /El retraso es de la FUENTE, no del archivo/);
    assert.match(ATLAS, /no se reconstruye/);
  });

  test('el vigía mira CADA 4 HORAS', () => {
    // Orden del Ingeniero (2026-08-24). Si alguien lo devuelve a semanal, que
    // sea a propósito y no por un copiar y pegar.
    assert.match(VIGIA, /cron: '\d+ \*\/4 \* \* \*'/,
      'el vigía dejó de mirar cada 4 horas');
  });

  test('el despliegue COMPRUEBA que llegó, no se cree a sí mismo', () => {
    // `32 · L-65`: verde en Actions no es cambio en producción. Un despliegue
    // que solo mira su propia salida es el fallo que dejó un arreglo sin
    // publicar durante días — y sin nadie mirando duele el doble.
    assert.match(DESPLIEGUE, /Comprobar que producción sirve lo que se construyó/,
      'el despliegue dejó de comprobar que la página sirve lo construido');
    assert.match(DESPLIEGUE, /\?cb=/, 'la comprobación dejó de pedir la página con anti-caché');
    assert.match(DESPLIEGUE, /exit 1/, 'la comprobación dejó de poder ponerse roja');
  });

  test('sin credenciales, el despliegue se salta y lo DICE — no falla en silencio', () => {
    assert.match(DESPLIEGUE, /listo=no/);
    assert.match(DESPLIEGUE, /gh secret set CLOUDFLARE_API_TOKEN/,
      'el aviso dejó de decir qué hay que poner exactamente para encenderlo');
  });

  test('cada atlas decide POR SÍ MISMO, sin salidas compartidas de matriz', () => {
    // EL FALLO REAL (`§ADR-076`): las salidas de un trabajo con matriz las
    // machaca la última pata que termina, así que el «sí» de un atlas y el «no»
    // de otro se pisaban — y quien mandaba era el azar del reloj. La corrida del
    // 24-08 reconstruyó los CINCO cuando solo tres tenían dato nuevo.
    assert.ok(!/needs\.[a-z]+\.outputs/.test(VIGIA),
      'volvió una salida compartida entre patas de la matriz: el «sí» de un atlas decide por todos');
    assert.match(VIGIA, /if: steps\.comparar\.outputs\.hay == 'si'/,
      'los pasos caros dejaron de mirar la decisión de SU propio atlas');
  });

  test('y sigue PROPONIENDO, no publicando', () => {
    // Un robot que commitea y despliega una capa de datos sin nadie mirando
    // puede publicar una capa mala un domingo a las 3 de la mañana.
    assert.match(VIGIA, /peter-evans\/create-pull-request/,
      'el vigía pasó a publicar solo: eso es una decisión del Ingeniero, no un ajuste');
  });
});
