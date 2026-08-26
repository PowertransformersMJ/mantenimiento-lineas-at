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
import { ATLAS_EN_ORDEN } from '../web/src/vistas/atlasCatalogo.ts';

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

  test('la FUENTE se ve arriba, no en la letra pequeña', () => {
    // Lo pidió el Ingeniero (2026-08-24): «que se pueda apreciar la fuente de
    // cada atlas». Estaba publicada, pero al final del panel y mezclada con la
    // atribución de los límites departamentales — donde nadie la lee.
    assert.match(ATLAS, /ficha\.fuente\.split\(','\)\[0\]/,
      'la fuente dejó de publicarse en la cinta de arriba');
    // Y sigue entera abajo: el nombre corto no sustituye a la procedencia completa.
    assert.match(ATLAS, /\{ficha\.fuente\} · dato hasta/,
      'desapareció la procedencia completa de la letra pequeña');
  });

  test('y con la HORA, que es lo que se pidió', () => {
    assert.match(ATLAS, /frescura\.construidoHora/, 'se perdió la hora');
    assert.match(ATLAS, /hora de Colombia/, 'la hora dejó de decir de qué reloj es');
  });

  test('el retraso se atribuye: fuente o archivo', () => {
    assert.match(ATLAS, /El retraso es de la FUENTE, no del archivo/);
    assert.match(ATLAS, /no se reconstruye/);
  });

  test('el vigía mira CADA 4 HORAS, y los RAYOS cada hora', () => {
    // Orden del Ingeniero (2026-08-24). Y desde el 25-08, dos relojes: POWER va
    // con 4 días de retraso y mirar más seguido no adelanta nada; el satélite de
    // rayos publica al minuto, así que ahí el límite lo poníamos nosotros.
    assert.match(VIGIA, /cron: '\d+ \*\/4 \* \* \*'/, 'el vigía dejó de mirar cada 4 horas');
    assert.match(VIGIA, /cron: '\d+ \* \* \* \*'/, 'los rayos dejaron de mirarse cada hora');
    assert.match(VIGIA, /if: github\.event\.schedule != '\d+ \* \* \* \*'/,
      'el reloj horario dejó de saltarse los cinco atlas de POWER');
  });

  test('y también reacciona si avanza el TOTAL DEL DÍA', () => {
    // El hueco medido el 25-08: en el atlas solar la frontera horaria lleva meses
    // clavada, así que mirar solo esa dejaba el resumen diario envejeciendo solo.
    assert.match(VIGIA, /el TOTAL DEL DÍA avanzó/,
      'el vigía volvió a mirar solo la frontera horaria');
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

  test('y sigue pasando por una PROPUESTA, aunque ya la fusione él mismo', () => {
    // ⚠️ ESTA PRUEBA CAMBIÓ DE MOTIVO EL 25-08 (`§ADR-085`), y conviene saber por
    // qué. Nació diciendo «sigue PROPONIENDO, no publicando»: un robot que
    // commitea y despliega una capa sin nadie mirando puede publicar una capa
    // mala un domingo a las 3 de la mañana. El Ingeniero encendió la fusión
    // automática, así que ESE motivo ya no rige — y no se borra la prueba, se le
    // pone el que sí rige.
    //
    // Lo que sigue importando es que el cambio pase por una PROPUESTA y no por
    // un empujón directo a `main`: la propuesta es lo que deja rastro de qué
    // cambió, guarda las fotos del portero como artefactos y se puede revertir
    // de una pieza. Publicar sin propuesta no ahorra nada y borra el rastro.
    assert.match(VIGIA, /peter-evans\/create-pull-request/,
      'el vigía pasó a empujar directo a main: se pierde el rastro y las fotos del portero');
    assert.ok(!/git push .*origin (main|HEAD)/.test(VIGIA),
      'apareció un empujón directo a main saltándose la propuesta');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL PORTERO Y LA FUSIÓN AUTOMÁTICA (`99 §ADR-085`)
// ----------------------------------------------------------------------------
// El Ingeniero encendió la fusión automática de las propuestas del vigía. Lo que
// antes hacía una persona entre «se reconstruyó» y «llegó a producción» —abrir
// el mapa y mirarlo— ahora lo hace `mirar-los-atlas.mjs`. Estas pruebas vigilan
// las cinco formas de romperlo SIN que nada dé un error:
//
//  1. Que alguien quite el portero y deje la fusión. Sería publicar a ciegas, y
//     con más confianza que antes, porque ya nadie mira.
//  2. Que el portero acabe DESPUÉS de abrir la propuesta. Parece igual y no lo
//     es: `create-pull-request` devuelve el árbol a la rama base, así que
//     fotografiaría el atlas VIEJO y daría verde siempre.
//  3. Que entre un atlas nuevo y nadie lo añada a la lista del portero. Se
//     publicaría sin que nadie —ni persona ni máquina— lo hubiera visto. Es
//     `30 · M-01`: lo que se sincroniza a mano, se desincroniza.
//  4. Que el portero pierda la capacidad de decir que no.
//  5. Que para fusionar se acabe forzando la protección de rama.
// ════════════════════════════════════════════════════════════════════════════
describe('el portero mira el mapa, y la propuesta se fusiona sola', () => {

  const VIGIA = readFileSync(
    fileURLToPath(new URL('../.github/workflows/vigia-nasa.yml', import.meta.url)), 'utf-8');
  const FOTO = readFileSync(
    fileURLToPath(new URL('../herramientas/foto-del-banco.mjs', import.meta.url)), 'utf-8');
  const PORTERO = readFileSync(
    fileURLToPath(new URL('../herramientas/mirar-los-atlas.mjs', import.meta.url)), 'utf-8');

  test('no hay fusión automática sin portero delante', () => {
    const fusiona = /gh pr merge/.test(VIGIA);
    const mira = /mirar-los-atlas\.mjs/.test(VIGIA);
    assert.ok(!fusiona || mira,
      'el vigía fusiona solo y ya NADIE mira el mapa: eso es publicar a ciegas');
  });

  test('TODO trabajo que propone tiene su portero, y ANTES', () => {
    // ⚠️ ESTE GUARDIÁN LLEVABA UN NÚMERO ESCRITO A MANO —«los DOS trabajos»— y
    // se puso rojo el día que entró el tercero (el pronóstico, `§ADR-086`). El
    // número no era el invariante: el invariante es que **nadie proponga sin que
    // alguien haya mirado el mapa**. Escrito como número, cada trabajo nuevo
    // obliga a tocar la prueba; escrito así, la prueba ya sabe contar. Es
    // `30 · M-01` otra vez, y esta vez en la propia prueba que lo vigila.
    const trabajos = VIGIA.split(/^  [a-z][\w-]*:$/m);
    const proponen = trabajos.filter((t) => /uses: peter-evans\/create-pull-request/.test(t));
    assert.ok(proponen.length >= 2, 'esperaba al menos dos trabajos que propongan');
    for (const t of proponen) {
      assert.match(t, /mirar-los-atlas\.mjs/,
        'un trabajo abre propuesta sin que el portero haya mirado nada: publicaría a ciegas');
    }
    for (const t of proponen) {
      // Se compara contra el USO de la acción (`uses:`) y no contra el texto
      // «create-pull-request», que también sale en los comentarios que explican
      // por qué el portero va antes. Un guardián que lee prosa se cree cualquier
      // cosa: éste falló la primera vez por su propia explicación.
      assert.ok(t.indexOf('mirar-los-atlas.mjs') < t.indexOf('uses: peter-evans/create-pull-request'),
        'el portero quedó DESPUÉS de abrir la propuesta: fotografiaría el atlas viejo');
    }
  });

  test('NINGÚN atlas se publica sin que alguien lo haya mirado', () => {
    // Los de POWER van por matriz (`${{ matrix.clave }}`); los del satélite,
    // escritos a mano. La unión de los dos tiene que ser TODO el catálogo.
    const deLaMatriz = [...VIGIA.matchAll(/^\s*- clave:\s*(\w+)/gm)].map((m) => m[1]);
    const aMano = [...VIGIA.matchAll(/mirar-los-atlas\.mjs([^\n]*)/g)]
      .flatMap((m) => m[1].trim().split(/\s+/))
      .filter((x) => x && !x.includes('{{'));
    const porMatriz = /mirar-los-atlas\.mjs \$\{\{ matrix\.clave \}\}/.test(VIGIA) ? deLaMatriz : [];
    const vigilados = new Set([...porMatriz, ...aMano]);
    const sinMirar = ATLAS_EN_ORDEN.filter((c) => !vigilados.has(c));
    assert.deepEqual(sinMirar, [],
      `atlas que se publicarían sin que nadie los mire: ${sinMirar.join(', ')}`);
  });

  test('el portero puede DECIR QUE NO', () => {
    assert.match(FOTO, /--exigir/, 'la foto perdió el modo portero');
    assert.match(FOTO, /process\.exitCode = 1/,
      'la foto volvió a salir con 0 pase lo que pase: no puede suspender a nadie');
    assert.match(PORTERO, /process\.exit\(1\)/,
      'el portero no propaga el fallo: la corrida saldría verde con el mapa roto');
  });

  test('y mira las cuatro cosas que miraba una persona', () => {
    for (const [que, patron] of [
      ['que haya un mapa vivo', /vivo && m\.enElDom && m\.cargado === true/],
      ['que la página no se queje', /quejas\.length\) faltas\.push/],
      ['que la capa nueva esté puesta', /exigirCapa/],
      ['que el lienzo tenga dibujo', /distintos < 24 \|\| p\.dominante > 0\.9/],
    ]) {
      assert.match(FOTO, patron, `el portero dejó de comprobar: ${que}`);
    }
  });

  test('y cuando el propio portero falla, DICE POR QUÉ', () => {
    // `32 · L-48` reincidió aquí: la tubería de `stderr` de Chrome estaba
    // abierta y nadie la leía. Sin ese dato el primer fallo en el servidor se
    // diagnosticó MAL —se culpó a la caja de arena— y se llegó a escribir el
    // arreglo de una causa que no era. Un error que no se lee no solo se pierde:
    // manda a arreglar lo que no está roto.
    assert.match(FOTO, /chrome\.stderr\.on\('data'/,
      'se volvió a abrir la tubería de stderr sin leerla: la queja de Chrome se perdería');
    assert.match(FOTO, /Chrome dijo:/,
      'el error del portero dejó de contar lo que Chrome dijo');
  });

  test('y no suspende a un atlas bueno por su propia lentitud', () => {
    // La causa REAL del 25-08: arranque en frío con seis trabajos compartiendo
    // máquina. Cinco atlas abrieron Chrome y el sexto se quedó sin puerto a los
    // 10 s. Un portero que suspende por ir lento se acaba desactivando.
    const m = FOTO.match(/ESPERA_ARRANQUE_CHROME \?\? (\d+)/);
    assert.ok(m, 'desapareció la espera de arranque configurable');
    assert.ok(Number(m[1]) >= 30,
      `la espera de arranque bajó a ${m[1]} s: volverían los suspensos por máquina cargada`);
  });

  test('si no deja fusionar, la propuesta queda ABIERTA y nada se fuerza', () => {
    assert.ok(!/gh pr merge[^\n]*(--admin|--force)/.test(VIGIA),
      'el vigía se saltaría la protección de rama para poder fusionar');
    assert.match(VIGIA, /Queda ABIERTA/,
      'sin ese camino, una propuesta buena que no se deja fusionar se pierde en silencio');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// UN PRONÓSTICO NO SE MIDE COMO UNA MEDICIÓN (`99 §ADR-086`)
// ----------------------------------------------------------------------------
// El Ingeniero decidió GUARDAR el pronóstico, sabiendo lo que costaba: un
// pronóstico archivado se puede leer dentro de meses como si alguien hubiera
// medido algo. Estas pruebas vigilan las cuatro formas de que eso pase, y
// ninguna daría un error:
//
//  1. Que la cinta le aplique el texto de las mediciones. Con las cuentas de
//     arriba tal cual, el atlas del pronóstico diría «dato medido hasta el 4 de
//     septiembre (0 días atrás)»: fecha correcta, palabra falsa y número
//     engañoso, los tres a la vez.
//  2. Que se pierda la caducidad. Es la única salvaguarda de haberlo guardado.
//  3. Que la pantalla deje de decir que es un modelo.
//  4. Que alguien le ponga escala propia y deje de poder compararse con su
//     gemelo medido, que es para lo que sirve.
// ════════════════════════════════════════════════════════════════════════════
describe('el pronóstico se lee al revés que una medición', () => {
  const AHORA = new Date('2026-08-26T14:00:00Z');
  const basePron = {
    construido: '2026-08-26T13:00:00Z',
    naturaleza: 'pronostico',
    ultimoDiaConHoras: '2026-09-04',
    caduca: '2026-08-26T21:00:00Z',
  };

  test('dice los días POR DELANTE, no «0 días atrás»', () => {
    const f = frescuraDelAtlas(basePron, AHORA);
    assert.equal(f.naturaleza, 'pronostico');
    assert.equal(f.porQue, 'pronostico');
    assert.equal(f.diasPorDelante, 9, 'un pronóstico al 4 de septiembre mirado el 26 de agosto');
    assert.equal(f.caducado, false);
  });

  test('y cuando pasa su hora, lo dice', () => {
    const f = frescuraDelAtlas(basePron, new Date('2026-08-27T02:00:00Z'));
    assert.equal(f.caducado, true);
    assert.equal(f.porQue, 'pronostico-caducado',
      'sin esto, un pronóstico de anteayer se presentaría como el de ahora');
  });

  test('una MEDICIÓN sigue leyéndose igual que siempre', () => {
    // La bifurcación no puede haber cambiado el camino de los otros ocho atlas.
    const f = frescuraDelAtlas(
      { construido: '2026-08-26T13:00:00Z', naturaleza: 'medida', ultimoDiaConHoras: '2026-08-22' },
      AHORA);
    assert.equal(f.porQue, 'al-dia');
    assert.equal(f.diasDelDato, 4);
    assert.equal(f.diasPorDelante, undefined, 'a una medición no se le inventa adelanto');
  });

  test('una ficha SIN naturaleza se lee como medida, y no revienta', () => {
    // Las ocho fichas publicadas antes de `§ADR-086` no traen el campo. Una
    // pantalla que lo exigiera dejaría el mapa en blanco hasta que el vigía las
    // rehiciera todas — el arreglo sería peor que el fallo.
    const f = frescuraDelAtlas(
      { construido: '2026-08-26T13:00:00Z', ultimoDiaConHoras: '2026-08-22' }, AHORA);
    assert.equal(f.naturaleza, 'medida');
    assert.equal(f.porQue, 'al-dia');
  });

  test('la pantalla NO le pone a un pronóstico el texto de una medición', () => {
    const PANTALLA = readFileSync(
      fileURLToPath(new URL('../web/src/componentes/AtlasCaribe.tsx', import.meta.url)), 'utf-8');
    assert.match(PANTALLA, /frescura\.naturaleza === 'pronostico' \?/,
      'la cinta dejó de bifurcar: le aplicaría a un modelo el texto de lo medido');
    assert.match(PANTALLA, /por delante/, 'desapareció el «por delante» del pronóstico');
    assert.match(PANTALLA, /Es un PRONÓSTICO, no una medición/,
      'la cinta dejó de avisar de que no es una medición');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('la palabra «medida» no se le aplica a un pronóstico en NINGUNA pieza', () => {
  // ⚠️ ESTA PRUEBA NACE DE UN FALLO REAL Y CAZADO MIRANDO (`§ADR-086`). La cinta
  // de arriba ya bifurcaba bien… y el panel del día de al lado seguía diciendo
  // «20 de las 24 horas no traen MEDIDA» y «días MEDIDOS» sobre un modelo. Es
  // literalmente `30 · L-68`: arreglado donde se veía, vivo en la pieza hermana.
  // Las dos piezas comparten los once atlas, así que las dos tienen que preguntar.
  const PIEZAS = ['../web/src/componentes/AtlasCaribe.tsx', '../web/src/componentes/PanelDelClima.tsx'];

  test('las dos piezas que pintan un atlas preguntan qué es antes de hablar', () => {
    for (const ruta of PIEZAS) {
      const s = readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf-8');
      assert.match(s, /naturaleza === 'pronostico'/,
        `${ruta}: pinta los once atlas y no pregunta si lo midió alguien`);
    }
  });

  test('y el panel del día ya no llama «medido» a lo que nadie midió', () => {
    const s = readFileSync(
      fileURLToPath(new URL('../web/src/componentes/PanelDelClima.tsx', import.meta.url)), 'utf-8');
    for (const [que, patron] of [
      ['las horas sin dato', /no las da el modelo/],
      ['los días del mes', /días pronosticados/],
      ['el día entero vacío', /el modelo no da ni una hora/],
    ]) {
      assert.match(s, patron, `volvió la palabra fija en: ${que}`);
    }
  });
});
