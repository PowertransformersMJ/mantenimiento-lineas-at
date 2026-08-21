// ============================================================================
// tests/cable-de-guarda.test.js — dónde le falta a la línea el cable de guarda
// ----------------------------------------------------------------------------
// QUÉ SE VIGILA AQUÍ, y por qué cada cosa es una forma real de mentir:
//
//   1. EL HUECO NO ES UN «SÍ». Un vano que nadie declaró sale `sin_dato`, jamás
//      `presente`. Si el hueco se leyera como «lleva guarda», el mapa pintaría de
//      sana una línea que nadie ha comprobado — y eso es lo que este sistema no
//      hace en ninguna otra parte (`ADR-029/032`).
//   2. LOS VANOS SON ENTRE ESTRUCTURAS. Un empalme no sostiene el conductor.
//      Tomarlo como extremo parte un vano real en dos falsos (`40 §10`) y el
//      tramo pintado saldría corto y con los nombres equivocados.
//   3. EL ÚLTIMO APOYO NO TIENE VANO SALIENTE. Si trae el campo se IGNORA: no
//      existe el vano al que se referiría, y contarlo inventaría metros.
//   4. LOS VANOS CONSECUTIVOS SE UNEN. «E06 a E09» se entiende; tres vanos
//      sueltos pintados por separado, no. Y dos tramos separados NO se fusionan.
//   5. EL PORCENTAJE ES SOBRE LA LÍNEA ENTERA, no sobre lo declarado. Sobre lo
//      declarado, un solo vano medido y sin guarda daría «100 % de la línea».
//
// Mundo sintético: ecuador y meridiano de Greenwich (`33 · L-23`). Ni una
// coordenada real, y los nombres son inventados.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { cableDeGuarda } from '../web/src/vistas/cableGuarda.ts';
import { COLORES_TRAMO_CSS, COLOR_SIN_GUARDA, COLOR_SIN_GUARDA_FUNDA } from '../web/src/vistas/tramoColores.ts';

const MAPA = readFileSync(fileURLToPath(new URL('../web/src/componentes/Mapa.tsx', import.meta.url)), 'utf-8');

/** Un apoyo sintético. `guarda` es lo que declara para su vano SALIENTE. */
const apoyo = (n, orden, { guarda, empalme } = {}) => ({
  id: `id-${n}`,
  tipo: 'apoyo',
  lineaId: 'linea-falsa',
  orden,
  tipoPunto: empalme ? 'Empalme' : 'Estructura',
  nombreCampo: n,
  nombreNormalizado: n,
  // Ecuador y Greenwich: 0,001° de longitud ≈ 111,3 m en el ecuador.
  coordenada: { lat: 0, lon: orden * 0.001 },
  funcionEstructural: 'Suspensión',
  funcionProcedencia: { origen: 'supuesto', fuente: 'prueba' },
  ...(guarda ? { cableGuardaVanoSaliente: guarda } : {}),
});

/** Cinco estructuras en fila: A B C D E, cuatro vanos iguales. */
const linea = (declaraciones = {}) => ['A', 'B', 'C', 'D', 'E']
  .map((n, i) => apoyo(n, i + 1, { guarda: declaraciones[n] }));

describe('cable de guarda — qué tramos le faltan a la línea', () => {
  test('sin declarar nada: NO afirma que la línea lleve guarda', () => {
    const r = cableDeGuarda(linea());
    assert.equal(r.hayDato, false, 'sin una sola declaración no hay dato que enseñar');
    assert.equal(r.tramos.length, 0, 'no se pinta nada: no consta que falte en ningún sitio');
    assert.equal(r.nSinDato, 4, 'los cuatro vanos siguen sin comprobar, y se dice');
    assert.equal(r.metros.sinGuarda, 0);
    assert.ok(r.vanos.every((v) => v.estado === 'sin_dato'),
      'un vano sin declarar NO puede salir «presente»: sería pintar de sano lo que nadie miró');
  });

  test('un vano declarado sin guarda sale como tramo, con sus dos extremos', () => {
    const r = cableDeGuarda(linea({ B: 'ausente' }));
    assert.equal(r.tramos.length, 1);
    assert.equal(r.tramos[0].desde, 'B');
    assert.equal(r.tramos[0].hasta, 'C', 'el vano va del apoyo que lo declara al SIGUIENTE');
    assert.equal(r.tramos[0].vanos.length, 1);
    assert.equal(r.hayDato, true);
  });

  test('vanos consecutivos se unen en UN tramo; los separados NO', () => {
    const unidos = cableDeGuarda(linea({ A: 'ausente', B: 'ausente', C: 'ausente' }));
    assert.equal(unidos.tramos.length, 1, 'tres vanos seguidos son un tramo, no tres');
    assert.equal(unidos.tramos[0].desde, 'A');
    assert.equal(unidos.tramos[0].hasta, 'D');
    assert.equal(unidos.tramos[0].vanos.length, 3);

    const separados = cableDeGuarda(linea({ A: 'ausente', C: 'ausente' }));
    assert.equal(separados.tramos.length, 2, 'con un vano sano en medio son DOS tramos');
    assert.deepEqual(separados.tramos.map((t) => `${t.desde}-${t.hasta}`), ['A-B', 'C-D']);
  });

  test('un vano declarado PRESENTE corta el tramo, igual que uno sin dato', () => {
    const r = cableDeGuarda(linea({ A: 'ausente', B: 'presente', C: 'ausente' }));
    assert.equal(r.tramos.length, 2, '«presente» separa: no se puede unir a través de él');
    assert.equal(r.metros.conGuarda > 0, true);
  });

  test('el ÚLTIMO apoyo no tiene vano saliente: si lo declara, se ignora', () => {
    const r = cableDeGuarda(linea({ E: 'ausente' }));
    assert.equal(r.vanos.length, 4, 'cinco estructuras son cuatro vanos, no cinco');
    assert.equal(r.tramos.length, 0, 'no existe el vano al que se referiría: no se inventa');
    assert.equal(r.metros.sinGuarda, 0, 'contarlo habría inventado metros de línea');
  });

  test('un EMPALME en medio no parte el vano ni se lleva la declaración', () => {
    // A —(empalme)— B: el vano real es A→B, y lo declara A.
    const con = [
      apoyo('A', 1, { guarda: 'ausente' }),
      apoyo('EMP', 2, { empalme: true, guarda: 'presente' }),
      apoyo('B', 3),
      apoyo('C', 4),
    ];
    const r = cableDeGuarda(con);
    assert.equal(r.vanos.length, 2, 'tres estructuras (A, B, C) son dos vanos: el empalme no cuenta');
    assert.equal(r.tramos.length, 1);
    assert.equal(r.tramos[0].desde, 'A');
    assert.equal(r.tramos[0].hasta, 'B', 'el extremo es la ESTRUCTURA siguiente, nunca el empalme');
    // El vano A→B mide lo que separa a A de B (2 pasos), no lo que separa a A del empalme.
    const directo = r.vanos[0].metros;
    assert.ok(directo > 200, `el vano real es A→B entero (~222 m), y salió ${directo.toFixed(1)} m`);
  });

  test('el porcentaje se dice sobre la LÍNEA ENTERA, no sobre lo declarado', () => {
    const r = cableDeGuarda(linea({ A: 'ausente' }));
    // 1 vano de 4, todos iguales → 25 %. Sobre «lo declarado» habría dado 100 %.
    assert.ok(Math.abs(r.pctSinGuarda - 25) < 0.5,
      `esperaba ~25 % de la línea y salió ${r.pctSinGuarda}`);
    assert.equal(r.nSinDato, 3, 'y se dice cuántos vanos siguen sin comprobar');
  });

  test('una línea sin dos estructuras no inventa nada', () => {
    assert.equal(cableDeGuarda([]).tramos.length, 0);
    assert.equal(cableDeGuarda([apoyo('A', 1)]).vanos.length, 0);
    assert.equal(cableDeGuarda([apoyo('A', 1)]).pctSinGuarda, null, 'sin línea no hay porcentaje');
  });
});

describe('cómo se PINTA el tramo dañado', () => {
  test('la marca NO usa ningún color de tramo de tensión', () => {
    // El primer intento la pintó de `#dc2626` sobre un trazado cuyo primer tramo
    // es `#d63b3b`: los dos rojos son el mismo a simple vista y la marca
    // desaparecía justo encima de ese tramo. Una marca de daño que se esconde da
    // por sano un trozo de línea que está señalado — peor que no pintarla.
    for (const c of COLORES_TRAMO_CSS) {
      assert.notEqual(COLOR_SIN_GUARDA, c,
        `la marca de daño usa ${c}, que es un color de tramo de tensión: se confundirían`);
    }
    assert.match(MAPA, /'line-color': COLOR_SIN_GUARDA,/,
      'el mapa escribe el color a mano en vez de tomarlo del dueño de la paleta');
  });

  test('lleva funda blanca: tiene que verse sobre el callejero Y sobre la foto', () => {
    assert.equal(COLOR_SIN_GUARDA_FUNDA.toLowerCase(), '#ffffff',
      'la funda tiene que ser blanca: es lo que separa la marca de la foto y de los tramos');
    assert.match(MAPA, /'line-color': COLOR_SIN_GUARDA_FUNDA,/,
      'la funda no sale del dueño de la paleta');
  });

  test('va ENCIMA de los tramos y DEBAJO de los apoyos', () => {
    const i = (id) => MAPA.indexOf(`id: '${id}'`);
    assert.ok(i('tramos') > 0 && i('sin-guarda') > i('tramos'),
      'debajo de `tramos` la taparía el color del tramo, que es opaco al 95 %');
    assert.ok(i('apoyos') > i('sin-guarda'),
      'encima de los apoyos taparía el punto y su nombre, que es lo que dice DÓNDE está el daño');
  });

  test('sin dato no se crea ni la fuente ni la capa', () => {
    // Una fuente vacía no pinta nada, pero deja `sin-guarda` en el estilo y la
    // próxima sonda lo leería como «la capa está, luego hay dato».
    assert.match(MAPA, /if \(sinGuarda\.features\.length\) m\.addSource\('sin-guarda'/,
      'la fuente se crea siempre: sin dato no debe existir');
    assert.match(MAPA, /if \(sinGuarda\.features\.length\) \{/,
      'las capas se crean siempre: sin dato no deben existir');
  });

  test('la leyenda solo aparece si hay dato declarado', () => {
    assert.match(MAPA, /guarda\.tramos\.length > 0 && \(/,
      'una leyenda que dijera «0 m sin guarda» afirmaría que la línea está sana sin haberla mirado');
  });
});
