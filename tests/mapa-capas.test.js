// ============================================================================
// tests/mapa-capas.test.js — las capas de imagen del mapa
// ----------------------------------------------------------------------------
// QUÉ SE VIGILA AQUÍ, y por qué no basta con «se ve bien»:
//
//   1. QUE NO SE LE PIDA NADA A NADIE. El mapa de este sistema se sirve entero
//      desde el propio sitio (ADR-001): sin cuota, sin clave, sin contrato y sin
//      nada que facture. Una capa satelital de las de siempre —Esri, Google,
//      Mapbox— rompería las tres cosas a la vez, y encima ninguna de ellas
//      permite el uso comercial en su plan gratuito (verificado, `31 · L-03`).
//      El guardián es por TEXTO porque el fallo sería por texto: basta que
//      alguien pegue una URL de teselas en el componente.
//
//   2. QUE LAS TRES CAPAS CUBRAN LO MISMO. Si el satelital tapara un trozo que
//      el callejero no, o al revés, el borde se leería como un fallo del mapa —
//      y quien lo mire pensará que falta información, no que falta imagen.
//
//   3. QUE CADA IMAGEN LLEVE SU FECHA. Una foto sin fecha en una herramienta de
//      mantenimiento se lee como «así está hoy», y así es como alguien concluye
//      que un vano está despejado mirando una imagen de hace dos años.
//
//   4. QUE EL TÉRMICO SE DECLARE COMO LO QUE ES. Es temperatura de SUPERFICIE,
//      no del aire, y en un instante. Sin esa declaración, ese mapa acaba
//      justificando una hipótesis de cálculo — que es el error más caro que
//      puede cometer este sistema, porque sale firmado.
//
// Cero datos de cliente: aquí solo se miran archivos públicos del repositorio.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const url = (r) => fileURLToPath(new URL(r, import.meta.url));
const MAPAS = url('../web/public/mapas/');
const FUENTE = readFileSync(url('../web/src/componentes/Mapa.tsx'), 'utf-8');

/**
 * El fuente SIN comentarios. Hace falta: la cabecera de ese archivo NOMBRA a
 * `tile.openstreetmap.org` para explicar por qué NO se usa, y un guardián que
 * busque por texto se dispararía justo con la frase que documenta la regla.
 * Lo que se vigila es el código, no la prosa.
 */
const CODIGO = FUENTE
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');

/** Cloudflare Pages no sirve un archivo de más de 25 MiB (verificado 2026-08-19). */
const TOPE_MIB = 25;

/**
 * La cabecera de un PMTiles v3: 127 bytes de posiciones fijas. Se lee a mano —
 * son cuatro enteros— en vez de traerse una dependencia para una prueba.
 */
function cabecera(nombre) {
  const b = readFileSync(MAPAS + nombre).subarray(0, 127);
  return {
    magia: b.subarray(0, 7).toString(),
    version: b[7],
    zMin: b[100],
    zMax: b[101],
    limites: [b.readInt32LE(102) / 1e7, b.readInt32LE(106) / 1e7,
      b.readInt32LE(110) / 1e7, b.readInt32LE(114) / 1e7],
  };
}

const ficha = (nombre) => JSON.parse(readFileSync(MAPAS + nombre, 'utf-8'));

/**
 * Las capas que viajan como TESELAS. El térmico ya no está aquí: desde que se
 * guarda la MEDIDA en vez de una imagen pintada, viaja como rejilla de valores y
 * se comprueba aparte, más abajo.
 */
const CAPAS = [
  { archivo: 'cartagena.pmtiles', ficha: null, rotulo: 'callejero' },
  { archivo: 'cartagena-satelital.pmtiles', ficha: 'cartagena-satelital.json', rotulo: 'satelital' },
];

/** El ancho y el alto que declara la cabecera de un PNG (IHDR, posición fija). */
function tamanoPng(nombre) {
  const b = readFileSync(MAPAS + nombre);
  assert.equal(b.subarray(1, 4).toString(), 'PNG', `${nombre} no es un PNG`);
  return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) };
}

// ════════════════════════════════════════════════════════════════════════════
describe('el mapa no le pide teselas a nadie', () => {

  test('el componente del mapa no trae ninguna URL de un servidor de teselas', () => {
    // El invariante de ADR-001, escrito como prueba. Se buscan las direcciones
    // de los sospechosos habituales y, en general, cualquier `https://` que
    // parezca una plantilla de teselas (`{z}/{x}/{y}`).
    const proveedores = /(tile\.openstreetmap|api\.mapbox|tiles\.stadiamaps|maptiler|arcgisonline|googleapis\.com\/vt|virtualearth|s2maps|eox\.at)/i;
    assert.ok(!proveedores.test(CODIGO),
      'apareció un proveedor de teselas de terceros en el componente del mapa');

    const plantillas = CODIGO.match(/['"`]https?:\/\/[^'"`]*\{z\}[^'"`]*['"`]/g) ?? [];
    assert.deepEqual(plantillas, [],
      'una plantilla de teselas remota: el mapa dejaría de funcionar sin señal y entraría una cuota');
  });

  test('las capas de imagen se piden por el protocolo propio, no por HTTP', () => {
    assert.match(CODIGO, /pmtiles:\/\/\$\{capa\.archivo\}\/\{z\}\/\{x\}\/\{y\}/,
      'la fuente raster dejó de usar el protocolo pmtiles autohospedado');
  });

  // ── Los dos guardianes del fallo que se vio en producción ────────────────
  //
  // Verde en pruebas y BLANCO en pantalla: la capa se añadía, se declaraba
  // cargada, no daba un solo error… y no pedía ni una tesela. Las dos líneas que
  // lo arreglan no se ven venir leyendo el código, así que se fijan aquí
  // (`32 · L-55`).
  test('tras añadir una capa raster se pide un fotograma', () => {
    assert.match(CODIGO, /m\.addLayer\(\{[\s\S]{0,400}?\}, debajoDe\);\s*m\.triggerRepaint\(\);/,
      'sin `triggerRepaint()` la fuente raster se queda esperando un fotograma que nadie pide');
  });

  test('las capas se vuelven a aplicar cuando el mapa se REHACE', () => {
    // El mapa vive en una referencia, y una referencia no dispara efectos. Si un
    // efecto de capa cae en el instante en que `mapa.current` es null —el mapa se
    // está rehaciendo— sale por la puerta de atrás y NO vuelve: ninguna de sus
    // dependencias cambió. El interruptor se queda muerto (`32 · L-58`).
    assert.match(CODIGO, /setMapaVivo\(creado\)/,
      'el mapa nuevo no se publica en el estado, así que nadie se entera');
    assert.ok(!/const m = mapa\.current;\s*\n\s*if \(!m/.test(CODIGO),
      'un efecto de capa vuelve a leer el mapa de la REFERENCIA: una referencia no dispara efectos');
    // Se miran los efectos que TOCAN el mapa. Los que solo piden datos —el
    // pronóstico, por ejemplo— no necesitan enterarse de que el lienzo es otro.
    const efectos = [...CODIGO.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\}, \[([^\]]*)\]\);/g)];
    const tocanElMapa = efectos.filter(([, cuerpo]) =>
      // El efecto que CREA el mapa queda fuera: es el que publica el mapa nuevo.
      !/crearMapa\(/.test(cuerpo)
      && /const m = mapaVivo|m\.(addSource|addLayer|setLayoutProperty)/.test(cuerpo));
    assert.ok(tocanElMapa.length >= 3, `esperaba al menos 3 efectos sobre el mapa, hallé ${tocanElMapa.length}`);
    for (const [, , deps] of tocanElMapa) {
      assert.ok(deps.includes('mapaVivo') || deps.trim() === '',
        `un efecto que toca el mapa no escucha al mapa nuevo: [${deps}]`);
    }
  });

  test('las capas esperan al `load` del mapa, NUNCA a `isStyleLoaded()`', () => {
    // `isStyleLoaded()` no contesta «¿está el estilo listo?» sino «¿está TODO
    // cargado?»: es `false` mientras a cualquier fuente le falte una tesela, así
    // que puede quedarse en `false` para siempre. Un efecto que la espere no se
    // ejecuta jamás y el interruptor se queda muerto, sin capa y sin error.
    assert.ok(!/isStyleLoaded\(\)/.test(CODIGO),
      'alguien volvió a usar isStyleLoaded() como puerta: no lo es');
    assert.match(CODIGO, /once\('load'[\s\S]{0,300}setMapaCargado\(true\)/,
      'nadie enciende la señal de que el mapa terminó de cargar');
    const efectos = [...CODIGO.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\}, \[([^\]]*)\]\);/g)];
    for (const [, cuerpo, deps] of efectos) {
      if (!/m\.(addSource|addLayer)/.test(cuerpo)) continue;
      assert.ok(/!mapaCargado/.test(cuerpo) && deps.includes('mapaCargado'),
        `un efecto añade fuentes sin esperar al \`load\`: [${deps}]`);
    }
  });

  test('cada archivo que el mapa nombra existe de verdad en el sitio', () => {
    // Un nombre mal escrito aquí no da error en ninguna parte: la capa
    // simplemente no se enciende, y el botón se queda muerto.
    const nombrados = [
      ...[...CODIGO.matchAll(/archivo:\s*'([^']+\.pmtiles)'/g)].map((m) => m[1]),
      ...[...CODIGO.matchAll(/'\/mapas\/([^']+\.json)'/g)].map((m) => m[1]),
    ];
    assert.ok(nombrados.length >= 2, 'el mapa no nombra ni un archivo de capa');
    for (const f of nombrados) {
      assert.ok(existsSync(MAPAS + f), `el mapa nombra «${f}» y ese archivo no está en web/public/mapas/`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('las tres capas hablan del MISMO territorio', () => {

  test('son archivos PMTiles v3 y ninguno pasa del tope de Cloudflare Pages', () => {
    for (const c of CAPAS) {
      const h = cabecera(c.archivo);
      assert.equal(h.magia, 'PMTiles', `${c.rotulo}: no es un archivo PMTiles`);
      assert.equal(h.version, 3, `${c.rotulo}: versión de PMTiles inesperada`);
      const mib = statSync(MAPAS + c.archivo).size / 1024 / 1024;
      assert.ok(mib <= TOPE_MIB,
        `${c.rotulo} pesa ${mib.toFixed(1)} MiB y Cloudflare Pages no sirve más de ${TOPE_MIB}`);
    }
  });

  test('los tres recortes tienen EXACTAMENTE los mismos límites', () => {
    const [base, ...resto] = CAPAS.map((c) => cabecera(c.archivo));
    for (const [i, h] of resto.entries()) {
      assert.deepEqual(h.limites, base.limites,
        `${CAPAS[i + 1].rotulo} cubre otro territorio que el callejero: el borde parecería un fallo`);
    }
  });

  test('el recorte sigue siendo el área metropolitana, no el corredor', () => {
    // ⚠️ Esto NO es una comprobación de forma: es la que impide publicar por
    // dónde pasa la línea. Un recorte ceñido al corredor lo DELATA, y este
    // repositorio es público (`33 · L-23`). Un grado son ~110 km; se exige que
    // el recorte pase de 20 km en las dos direcciones.
    const h = cabecera('cartagena-satelital.pmtiles');
    const anchoKm = (h.limites[2] - h.limites[0]) * 111 * Math.cos(10.4 * Math.PI / 180);
    const altoKm = (h.limites[3] - h.limites[1]) * 111;
    assert.ok(anchoKm > 20 && altoKm > 20,
      `el recorte quedó en ${anchoKm.toFixed(0)}×${altoKm.toFixed(0)} km: demasiado ceñido, delata el corredor`);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('cada imagen dice cuándo se tomó y a quién se le debe', () => {

  for (const c of CAPAS.filter((x) => x.ficha)) {   // solo las TESELADAS: el térmico va aparte
    test(`la ficha de la capa ${c.rotulo} está completa`, () => {
      const f = ficha(c.ficha);
      assert.ok(!Number.isNaN(Date.parse(f.fecha ?? '')),
        'sin fecha de la toma, la imagen se lee como «así está hoy»');
      assert.ok(String(f.atribucion ?? '').length > 10, 'falta el texto de atribución');
      assert.ok(String(f.licencia ?? '').length > 10, 'falta la licencia declarada');
      assert.ok(String(f.fuente ?? '').length > 10, 'falta de dónde salió la imagen');
      assert.ok(Number.isFinite(f.resolucion_m), 'falta la resolución: sin ella nadie sabe qué puede afirmar');
    });
  }

  test('la capa térmica declara su recorte, su codificación y sus fechas', () => {
    const f = ficha('cartagena-termico.json');
    assert.deepEqual(f.bbox, cabecera('cartagena.pmtiles').limites,
      'la rejilla cubre otro territorio que el mapa base: se colocaría desplazada');
    assert.ok(Number.isInteger(f.ancho) && Number.isInteger(f.alto));
    assert.ok(Number.isFinite(f.codificacion?.paso_c) && Number.isFinite(f.codificacion?.offset_c),
      'sin la codificación, un byte no se puede convertir en grados');
    assert.equal(f.codificacion.sin_dato, 0);
    assert.ok(Array.isArray(f.fechas) && f.fechas.length >= 1, 'ni una fecha medida');
  });

  test('cada fecha tiene su rejilla, y la rejilla mide lo que dice la ficha', () => {
    // Un PNG que no cuadre con la ficha desplaza TODAS las lecturas de grados y
    // nadie lo nota: los colores seguirían saliendo bonitos.
    const f = ficha('cartagena-termico.json');
    for (const d of f.fechas) {
      assert.ok(existsSync(MAPAS + d.archivo), `falta la rejilla ${d.archivo}`);
      assert.deepEqual(tamanoPng(d.archivo), { ancho: f.ancho, alto: f.alto },
        `${d.archivo} no mide lo que declara la ficha: las lecturas saldrían desplazadas`);
      assert.ok(!Number.isNaN(Date.parse(d.fecha)), 'una fecha sin instante');
      assert.ok(d.cobertura_pct >= 50,
        `${d.archivo} solo midió el ${d.cobertura_pct} %: eso es un mapa de nubes`);
      const r = d.resumen_c;
      assert.ok(r.min_c <= r.p05_c && r.p05_c <= r.p50_c && r.p50_c <= r.p95_c && r.p95_c <= r.max_c,
        `percentiles desordenados en ${d.fecha}`);
    }
  });

  test('las fechas no se repiten: una por instante medido', () => {
    const f = ficha('cartagena-termico.json');
    const vistas = new Set(f.fechas.map((d) => d.fecha));
    assert.equal(vistas.size, f.fechas.length, 'hay dos entradas para el mismo instante');
  });

  test('la máscara de nubes se declara: sin ella la capa miente donde parece acertar', () => {
    const f = ficha('cartagena-termico.json');
    assert.match(String(f.mascara ?? ''), /nube/i,
      'bajo una nube el sensor mide el techo de la nube, no el suelo');
  });

  test('la capa térmica se declara como temperatura de SUPERFICIE, no del aire', () => {
    // Es la línea que impide el error caro: que un mapa de color acabe
    // justificando la temperatura de una hipótesis de cálculo.
    const f = ficha('cartagena-termico.json');
    assert.equal(f.es_superficie_no_aire, true);
    assert.match(FUENTE, /temperatura de la SUPERFICIE/i,
      'la leyenda dejó de advertir que no es la temperatura del aire');
    assert.match(FUENTE, /No alimenta ningún cálculo/i,
      'la leyenda dejó de decir que este mapa no entra en el cálculo de la línea');
  });

  test('la rampa de color va en orden y con su escala en grados', () => {
    const f = ficha('cartagena-termico.json');
    assert.ok(Array.isArray(f.rampa) && f.rampa.length >= 3, 'sin rampa no hay leyenda posible');
    for (let i = 1; i < f.rampa.length; i++) {
      assert.ok(f.rampa[i].c > f.rampa[i - 1].c,
        'la rampa no va de menos a más grados: el degradado de la leyenda saldría al revés');
    }
    for (const p of f.rampa) {
      assert.equal(p.rgb.length, 3);
      assert.ok(p.rgb.every((v) => Number.isInteger(v) && v >= 0 && v <= 255));
    }
    // Los percentiles viven ahora POR FECHA —cada día tiene los suyos— y se
    // comprueban en la prueba de las rejillas, arriba.
  });
});
