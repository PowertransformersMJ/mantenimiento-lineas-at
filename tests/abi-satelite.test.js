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

// ════════════════════════════════════════════════════════════════════════════
// CADA FUENTE, CON SU MARCA (`§ADR-084`)
// ----------------------------------------------------------------------------
// Lo pidió el Ingeniero: «me gustaría que cada fuente en la página tenga su
// logo». Tres cosas hay que vigilar aquí, y ninguna daría un error rojo sola:
//
//  1. Que ninguna familia se quede SIN marca. Añadir una tercera fuente y
//     olvidar su emblema no rompe nada: sale el hueco y ya.
//  2. Que la marca esté en LOS DOS sitios donde se nombra la fuente —el
//     selector y la cinta—. Es el patrón que más veces ha mordido en este
//     proyecto: «arreglado donde se veía, vivo en la pieza hermana» (`30 ·
//     L-68`, `34 · L-65`). El 24-08 volvió a pasar con el hora a hora
//     (`§ADR-078`).
//  3. Que el emblema se DIBUJE y no se BAJE. Un logo traído por URL rompe dos
//     cosas de golpe: el sitio deja de servirse entero desde sí mismo, y lo que
//     entraría por ahí sería justo el escudo oficial que no se puede usar.
// ════════════════════════════════════════════════════════════════════════════
describe('cada fuente lleva su marca, y la lleva en los dos sitios', () => {
  const EMBLEMA = readFileSync(
    fileURLToPath(new URL('../web/src/componentes/EmblemaFuente.tsx', import.meta.url)), 'utf-8');
  const PANTALLA = readFileSync(
    fileURLToPath(new URL('../web/src/componentes/AtlasCaribe.tsx', import.meta.url)), 'utf-8');

  test('ninguna familia se queda sin marca', () => {
    // Se busca la ENTRADA de la tabla (`power: Marca…`) y no el texto «power»
    // suelto: el nombre de la familia aparece también en los comentarios, y un
    // guardián que se conforma con eso pasa en verde con la marca borrada.
    const sinComentarios = EMBLEMA.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const f of Object.keys(FAMILIAS)) {
      assert.match(sinComentarios, new RegExp(`^\\s*${f}:\\s*\\w+,`, 'm'),
        `la familia «${f}» no tiene marca en la tabla: saldría su nombre a secas`);
    }
  });

  test('la tabla obliga por TIPO, no por costumbre', () => {
    // Es lo que convierte «acordarse» en «no compila» (`30 · M-01`). Si esto se
    // volviera un `si … si no`, una tercera fuente heredaría en silencio la
    // marca de otra: dos proveedores con el mismo emblema y ni un error.
    assert.match(EMBLEMA, /Record<FamiliaAtlas,/,
      'el emblema volvió a elegirse con un condicional: una familia nueva heredaría marca ajena');
  });

  test('la marca acompaña al nombre en el selector Y en la cinta', () => {
    const veces = [...PANTALLA.matchAll(/<EmblemaFuente\s/g)].length;
    assert.equal(veces, 2,
      'el emblema tiene que salir en el grupo de botones y en la cinta de la fuente; '
      + `se encontró ${veces} vez(ces)`);
    assert.match(PANTALLA, /<EmblemaFuente familia=\{f\}/, 'falta en el selector, que agrupa');
    assert.match(PANTALLA, /<EmblemaFuente familia=\{def\.familia\}/, 'falta en la cinta del atlas abierto');
  });

  test('el emblema se dibuja aquí, no se baja de fuera', () => {
    assert.ok(!/https?:\/\//.test(EMBLEMA.replace(/^\/\/.*$/gm, '')),
      'un logo traído por URL: el sitio dejaría de servirse entero desde sí mismo');
    assert.ok(!/<img\b/.test(EMBLEMA), 'el emblema tiene que ser SVG dibujado, no una imagen');
  });

  test('y el nombre de la fuente NO desaparece detrás de la marca', () => {
    // La atribución es el texto. El emblema acompaña; si algún día sustituyera
    // al nombre, la página dejaría de decir de dónde viene el dato.
    assert.match(PANTALLA, /FAMILIAS\[f\]\.rotulo/, 'el selector dejó de escribir el nombre de la fuente');
    assert.match(PANTALLA, /ficha\.fuente\.split\(','\)\[0\]/, 'la cinta dejó de escribir la fuente exacta');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ¿ALGUIEN LO MIDIÓ, O UN MODELO LO CREE? (`99 §ADR-086`)
// ----------------------------------------------------------------------------
// Desde que hay atlas de pronóstico, «esto lo midió alguien» dejó de ser cierto
// por defecto. El Ingeniero decidió GUARDAR el pronóstico sabiendo el precio: un
// archivo guardado se puede leer dentro de meses como si fuera una medición.
// Esto es lo que hace imposible esa confusión, y por eso se vigila.
// ════════════════════════════════════════════════════════════════════════════
describe('cada capa dice si alguien la midió o un modelo la cree', () => {

  test('las once capas publicadas lo declaran, y ninguna se lo salta', () => {
    const fallan = [];
    for (const clave of ATLAS_EN_ORDEN) {
      const ruta = fileURLToPath(new URL('../web/public' + ATLAS[clave].ficha, import.meta.url));
      const ficha = JSON.parse(readFileSync(ruta, 'utf-8'));
      if (ficha.naturaleza !== 'medida' && ficha.naturaleza !== 'pronostico') {
        fallan.push(`${clave}: naturaleza «${ficha.naturaleza}»`);
      }
    }
    assert.deepEqual(fallan, [], 'capas que no dicen si son medición o pronóstico');
  });

  test('y lo que declara la ficha cuadra con su familia', () => {
    // Las dos tablas tienen que decir lo mismo: la familia `pronostico` del
    // catálogo y el `naturaleza` de la ficha. Si se desincronizan, el selector
    // agruparía un modelo entre las mediciones — o al revés (`30 · M-01`).
    for (const clave of ATLAS_EN_ORDEN) {
      const ruta = fileURLToPath(new URL('../web/public' + ATLAS[clave].ficha, import.meta.url));
      const ficha = JSON.parse(readFileSync(ruta, 'utf-8'));
      const esperada = ATLAS[clave].familia === 'pronostico' ? 'pronostico' : 'medida';
      assert.equal(ficha.naturaleza, esperada,
        `${clave}: la familia dice «${ATLAS[clave].familia}» y la ficha «${ficha.naturaleza}»`);
    }
  });

  test('solo los pronósticos caducan, y todos caducan', () => {
    for (const clave of ATLAS_EN_ORDEN) {
      const ruta = fileURLToPath(new URL('../web/public' + ATLAS[clave].ficha, import.meta.url));
      const ficha = JSON.parse(readFileSync(ruta, 'utf-8'));
      if (ficha.naturaleza === 'pronostico') {
        assert.ok(ficha.caduca, `${clave}: un pronóstico guardado SIN caducidad no se puede retirar`);
      } else {
        assert.equal(ficha.caduca, undefined,
          `${clave}: una medición no caduca — mayo sigue siendo mayo en agosto`);
      }
    }
  });

  test('el motor se NIEGA a publicar una capa que no diga qué es', () => {
    const MOTOR = readFileSync(
      fileURLToPath(new URL('../herramientas/atlas-caribe.mjs', import.meta.url)), 'utf-8');
    assert.match(MOTOR, /no declara su naturaleza/,
      'volvió el valor por defecto: una capa nueva se publicaría diciendo que alguien la midió');
    assert.ok(!/naturaleza:\s*perfil\.naturaleza\s*\?\?/.test(MOTOR),
      'un `?? medida` haría que olvidarlo se convirtiera en mentir');
  });

  test('el pronóstico usa la MISMA escala que su gemelo medido', () => {
    // Es lo que lo hace útil: poner «lo que viene» al lado de «lo que pasó» solo
    // sirve si un color significa lo mismo en los dos. Si alguien le pusiera
    // escala propia, los dos mapas seguirían saliendo bonitos y ya no se podrían
    // comparar — y nadie vería un error.
    const leer = (f) => JSON.parse(readFileSync(
      fileURLToPath(new URL(`../web/public/mapas/${f}.json`, import.meta.url)), 'utf-8'));
    for (const [pron, medido] of [
      ['pron-temp-caribe', 'temp-caribe'],
      ['pron-viento-caribe', 'viento-caribe'],
      ['pron-lluvia-caribe', 'lluvia-caribe'],
    ]) {
      const p = leer(pron), m = leer(medido);
      assert.deepEqual(p.codificacion, m.codificacion, `${pron}: se le cambió la codificación`);
      assert.deepEqual(p.rampa, m.rampa, `${pron}: se le cambió la rampa de color`);
      assert.equal(p.unidad, m.unidad, `${pron}: se le cambió la unidad`);
    }
  });

  test('y NINGÚN pronóstico marca una hipótesis de diseño en su escala', () => {
    // La temperatura medida SÍ marca sus 32 °C. Marcarlos sobre un modelo
    // invitaría a la lectura prohibida: «el jueves no llega, luego la hipótesis
    // va sobrada». Un extremo de diseño no se valida con el tiempo de la semana.
    for (const clave of ATLAS_EN_ORDEN) {
      if (ATLAS[clave].familia !== 'pronostico') continue;
      const ruta = fileURLToPath(new URL('../web/public' + ATLAS[clave].ficha, import.meta.url));
      const ficha = JSON.parse(readFileSync(ruta, 'utf-8'));
      assert.equal(ficha.hipotesisMarcadaEnRampa, undefined,
        `${clave}: marca un criterio de diseño sobre un pronóstico`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el nombre corto de la fuente no se rompe al cortarlo', () => {
  test('ninguna fuente queda con un paréntesis abierto en la cinta', () => {
    // La cinta publica `fuente.split(',')[0]` (`§ADR-080`). Con una coma DENTRO
    // de un paréntesis, lo que se enseña es medio nombre y un paréntesis sin
    // cerrar — pasó con el pronóstico: «(modelo» y la palabra «medición»
    // cortada, justo la que más importaba. No lo cazó una prueba: lo cazó la
    // foto del portero. Ahora sí lo caza una prueba.
    for (const clave of ATLAS_EN_ORDEN) {
      const ruta = fileURLToPath(new URL('../web/public' + ATLAS[clave].ficha, import.meta.url));
      const { fuente } = JSON.parse(readFileSync(ruta, 'utf-8'));
      const corto = fuente.split(',')[0];
      const abre = (corto.match(/\(/g) ?? []).length;
      const cierra = (corto.match(/\)/g) ?? []).length;
      assert.equal(abre, cierra,
        `${clave}: el nombre corto queda como «${corto}» — paréntesis sin cerrar`);
    }
  });
});
