// ============================================================================
// tests/abi-satelite.test.js — sol y nubes vistos por el sensor del GOES
// ----------------------------------------------------------------------------
// Las capas «ahora» (`99 §ADR-081`) traen una geometría que las cinco de POWER
// no tenían: el satélite no entrega latitud y longitud, entrega **ángulos de
// barrido**. Y ahí hay tres formas de equivocarse que dan un mapa perfecto:
//
//   1. EL MAPA DESPLAZADO. Confundir la latitud del lugar con la GEOCÉNTRICA
//      —la Tierra es un elipsoide y el satélite ve el centro— corre el punto
//      decenas de kilómetros. El mapa sigue pareciendo un mapa, solo que el dato
//      de Riohacha aparece sobre Valledupar.
//   2. EL PUNTO QUE NO SE VE Y AUN ASÍ DEVUELVE NÚMERO. Medio planeta queda al
//      otro lado; sin comprobar la visibilidad, Tokio devuelve unos ángulos
//      perfectamente creíbles que caen dentro del disco.
//   3. EL CERO QUE NO ES CERO. Una celda que el sensor no midió no es «cero
//      vatios» ni «cielo despejado»: es un hueco. En los rayos sí es cero —que
//      no cayera ninguno es un dato—, y por eso el libro lo declara por capa.
//
// Puro: la geometría se prueba contra la que declara el propio archivo, sin
// bajar un byte del satélite.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { anguloDe, geometriaDe, puntoDe, ventanaDe } from '../herramientas/abi-geo.mjs';
import { ATLAS, ATLAS_EN_ORDEN, FAMILIAS } from '../web/src/vistas/atlasCatalogo.ts';
import { celdasDelLibro, claveColombia, diarioDelLibro } from '../herramientas/libro-acumulado.mjs';
import { PERFILES } from '../herramientas/abi-caribe.mjs';

/** La proyección tal y como la declara un archivo real del GOES-19. */
const PROYECCION = {
  perspective_point_height: 35786023,
  semi_major_axis: 6378137,
  semi_minor_axis: 6356752.31414,
  longitude_of_projection_origin: -75,
};
const G = geometriaDe(PROYECCION);

// ════════════════════════════════════════════════════════════════════════════
describe('la geometría del satélite, comprobada de tres formas', () => {

  test('el SUBPUNTO del satélite cae exactamente en el centro del barrido', () => {
    const a = anguloDe(G.lon0, 0, G);
    assert.ok(Math.abs(a.x) < 1e-9 && Math.abs(a.y) < 1e-9,
      `el subpunto salió en ${a.x}, ${a.y} y tenía que ser 0,0`);
  });

  test('IDA Y VUELTA sobre el recuadro del atlas: cierra a cinco decimales', () => {
    // EL FALLO Nº 1. Con la latitud sin corregir a geocéntrica, esto se desvía
    // decenas de kilómetros — y el mapa sigue saliendo bonito.
    for (const [lon, lat] of [[-75.5, 10.5], [-77, 13], [-71, 7], [-74, 10]]) {
      const a = anguloDe(lon, lat, G);
      const p = puntoDe(a.x, a.y, G);
      assert.ok(Math.abs(p.lon - lon) < 1e-5 && Math.abs(p.lat - lat) < 1e-5,
        `${lon},${lat} volvió como ${p.lon},${p.lat}`);
    }
  });

  test('EL FALLO Nº 2: lo que no se ve devuelve NADA, no un número creíble', () => {
    assert.equal(anguloDe(139, 35, G), null, 'Tokio no se ve desde un satélite sobre -75°');
    assert.equal(anguloDe(100, 0, G), null, 'el otro lado del ecuador tampoco');
    // Y el borde del disco, hacia el este de Brasil, sí se ve:
    assert.ok(anguloDe(-35, -5, G) !== null);
  });

  test('un ángulo que se pierde en el espacio no inventa un punto', () => {
    assert.equal(puntoDe(0.15, 0.15, G), null);
  });

  test('la ventana de lectura es un recorte pequeño, no el disco entero', () => {
    // 5424x5424 es el disco; el atlas son 6°x6°. Leer todo por leer una esquina
    // es lo que convierte una corrida de un minuto en una de veinte.
    const paso = 0.000056000000768108293, off = -0.15184399485588074;
    const X = Float64Array.from({ length: 5424 }, (_, i) => i * paso + off);
    const Y = Float64Array.from({ length: 5424 }, (_, i) => -(i * paso + off));
    const v = ventanaDe([-77, 7, -71, 13], X, Y, G);
    const ancho = v.x1 - v.x0 + 1, alto = v.y1 - v.y0 + 1;
    assert.ok(ancho > 300 && ancho < 400, `la ventana salió de ${ancho} píxeles de ancho`);
    assert.ok(alto > 300 && alto < 400, `la ventana salió de ${alto} píxeles de alto`);
    assert.ok(ancho * alto < 5424 * 5424 / 200, 'la ventana dejó de ser un recorte');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el hueco NO es un cero, y depende de la capa', () => {

  const libro = { horas: { 2026082512: { '0,0': 900 } } };

  test('EL FALLO Nº 3: sin medida, la celda queda VACÍA en sol y nubes', () => {
    const c = celdasDelLibro(libro, { ancho: 6, alto: 6, relleno: null });
    assert.equal(c.get('0,0')['2026082512'], 900);
    assert.equal(c.get('5,5')['2026082512'], undefined,
      'una celda que el sensor no midió se publicaría como «cero vatios»');
  });

  test('y en los RAYOS sí es cero, porque no caer ninguno es un dato', () => {
    const c = celdasDelLibro(libro, { ancho: 6, alto: 6, relleno: 0 });
    assert.equal(c.get('5,5')['2026082512'], 0);
  });

  test('cada capa resume su día como toca', () => {
    const l = { horas: { 2026082512: { '0,0': 900, '1,0': 300 }, 2026082513: { '0,0': 100 } } };
    assert.deepEqual(diarioDelLibro(l, 'maxima'), [{ d: '2026-08-25', v: 900 }]);
    assert.deepEqual(diarioDelLibro(l, 'suma'), [{ d: '2026-08-25', v: 1300 }]);
    assert.deepEqual(diarioDelLibro(l, 'media'), [{ d: '2026-08-25', v: 433.33 }]);
  });

  test('la hora del satélite también aquí es la de Colombia', () => {
    assert.equal(claveColombia(new Date('2026-08-25T17:00:00Z')), '2026082512');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('lo que estas capas NO son, dicho en su ficha', () => {

  test('el sol «ahora» no se disfraza de la media horaria de POWER', () => {
    const p = PERFILES['sol-vivo'];
    assert.match(p.aviso, /NO LA MEDIA HORARIA DE UN MODELO/);
    assert.match(p.aviso, /87 días/, 'el aviso dejó de decir por qué existe esta capa');
    assert.match(p.atribucion, /NOAA/);
  });

  test('las nubes «ahora» dicen que son una FRACCIÓN de píxeles', () => {
    const p = PERFILES['nubes-vivo'];
    assert.match(p.aviso, /FRACCIÓN DE PÍXELES/);
    assert.match(p.aviso, /No dice si está lloviendo/i,
      'el aviso dejó de separar nubosidad de lluvia y de tormenta');
  });

  test('comparten escala con sus hermanas de POWER, a propósito', async () => {
    // Si cada una eligiera su rampa, el mismo color diría cosas distintas en dos
    // capas que se miran seguidas — que es justo lo que se quiere evitar.
    const { PERFILES: POWER } = await import('../herramientas/atlas-caribe.mjs');
    assert.deepEqual(PERFILES['sol-vivo'].codificacion, POWER.sol.codificacion);
    assert.deepEqual(PERFILES['sol-vivo'].rampa.map((r) => r.c), POWER.sol.rampa.map((r) => r.c));
    assert.deepEqual(PERFILES['nubes-vivo'].codificacion, POWER.nubes.codificacion);
    assert.deepEqual(PERFILES['nubes-vivo'].rampa.map((r) => r.c), POWER.nubes.rampa.map((r) => r.c));
  });

  test('la geometría se lee del archivo, no está escrita en el código', () => {
    const GEO = readFileSync(
      fileURLToPath(new URL('../herramientas/abi-geo.mjs', import.meta.url)), 'utf-8');
    // Ni la altura del satélite ni su longitud pueden estar clavadas: el día que
    // cambien, el mapa saldría igual de bonito y desplazado.
    assert.ok(!/35786023|-75\.2|75\.2/.test(GEO),
      'se clavó una constante del satélite que el archivo ya declara');
    assert.match(GEO, /export function geometriaDe\(proyeccion\)/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// DE QUIÉN VIENE CADA ATLAS, SIN ABRIRLO (`§ADR-082`)
// ----------------------------------------------------------------------------
// El selector agrupa las ocho capas por quien publica el dato. Eso obliga a que
// el catálogo declare la familia de cada una… y una familia escrita a mano es
// justo lo que se desincroniza en silencio (`30 · M-01`): el día que una capa
// cambie de fuente, los botones seguirían agrupándola con la anterior y nadie
// vería un error. Este guardián abre las fichas PUBLICADAS y las confronta.
// ════════════════════════════════════════════════════════════════════════════
describe('la familia que dice el catálogo es la que declara la ficha', () => {

  test('las ocho capas cuadran con su fuente publicada', () => {
    const fallan = [];
    for (const clave of ATLAS_EN_ORDEN) {
      const a = ATLAS[clave];
      const ruta = fileURLToPath(new URL('../web/public' + a.ficha, import.meta.url));
      const ficha = JSON.parse(readFileSync(ruta, 'utf-8'));
      if (!FAMILIAS[a.familia].marca.test(ficha.fuente)) {
        fallan.push(`${clave}: familia «${a.familia}» pero la ficha dice «${ficha.fuente.slice(0, 40)}…»`);
      }
    }
    assert.deepEqual(fallan, [], 'capas agrupadas bajo una fuente que no es la suya');
  });

  test('ninguna capa se queda sin familia', () => {
    for (const clave of ATLAS_EN_ORDEN) {
      assert.ok(FAMILIAS[ATLAS[clave].familia], `${clave} no declara una familia conocida`);
    }
  });

  test('y el selector las agrupa en vez de ponerlas en fila', () => {
    const PANTALLA = readFileSync(
      fileURLToPath(new URL('../web/src/componentes/AtlasCaribe.tsx', import.meta.url)), 'utf-8');
    assert.match(PANTALLA, /FAMILIAS_EN_ORDEN\.map/,
      'el selector volvió a ser una fila plana: la fuente solo se vería al abrir');
    assert.match(PANTALLA, /ATLAS\[c\]\.familia === f/);
  });
});
