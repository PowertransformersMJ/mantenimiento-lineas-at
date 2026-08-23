// ============================================================================
// tests/estilo-clases.test.js — toda clase que la pantalla USA está DECLARADA
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. El proyecto ya vigilaba que toda VARIABLE de color usada
// estuviera declarada (`estilo-tokens.test.js`). Faltaba la mitad gemela: que
// toda CLASE usada exista. El navegador se comporta igual con las dos — descarta
// en silencio lo que no encuentra, sin un solo error en consola.
//
// LO QUE PASÓ SIN ESTA PRUEBA. Siete clases del segmento de causa raíz se usaban
// y no existían: `pill`, `av`, `inf`, `h-pill`, `rca-aviso`, `rca-etiqueta` y
// `rca-enunciado`. Salían como texto corriente. Y con una consecuencia perversa,
// no neutra: `.ok` SÍ existe, así que «cerrado» heredaba fondo verde por
// casualidad mientras «sin conclusión», «sin activo identificado» y los DEFECTOS
// DEL MÉTODO salían sin nada.
//
//   La pantalla gritaba cuando todo estaba bien y se callaba cuando faltaba algo.
//
// En un producto cuyo oficio es que los huecos se vean, ése es el fallo más caro
// posible: el mismo patrón que `32 · L-44`, esta vez por CSS ausente.
//
// QUÉ NO COMPRUEBA: estética. Solo que la clase exista. Es verificable, barato y
// no opina sobre el diseño.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Todos los .tsx/.ts bajo web/src. */
function fuentes(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) fuentes(p, acc);
    else if (['.tsx', '.ts'].includes(extname(n))) acc.push(p);
  }
  return acc;
}

const css = readFileSync(join(RAIZ, 'web/src/estilo.css'), 'utf-8');
const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
const DECLARADAS = new Set([...sinComentarios.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));

/**
 * Las clases que la pantalla pide, leídas de cada `className`.
 *
 * Los trozos interpolados (`cielo-${estado}`) se descartan a propósito: el
 * nombre completo no existe en el fuente y comprobarlo exigiría ejecutar. Las
 * variantes fijas de esas familias las cubre `estilo-tokens.test.js`.
 */
function usadas() {
  const mapa = new Map();
  for (const f of fuentes(join(RAIZ, 'web/src'))) {
    const s = readFileSync(f, 'utf-8');
    for (const m of s.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)) {
      const crudo = [m[1], m[2], m[3]].filter(Boolean).join(' ');
      // Un trozo con interpolación se descarta ENTERO si toca la palabra: el
      // resto de la palabra no es una clase, es un prefijo.
      const limpio = crudo.replace(/[\w-]*\$\{[^}]*\}[\w-]*/g, ' ');
      for (const c of limpio.split(/\s+/)) {
        if (!c || c.startsWith('$')) continue;
        if (!mapa.has(c)) mapa.set(c, new Set());
        mapa.get(c).add(f.replace(RAIZ + '/', ''));
      }
    }
  }
  return mapa;
}

describe('estilo.css — toda clase que se pide existe', () => {
  test('ninguna clase usada se queda sin declarar', () => {
    const faltan = [...usadas().entries()]
      .filter(([c]) => !DECLARADAS.has(c))
      .map(([c, d]) => `.${c} (en ${[...d].join(', ')})`);
    assert.deepEqual(faltan, [],
      'clases que la pantalla usa y la hoja no declara. El navegador las descarta EN SILENCIO: '
      + 'el elemento se pinta sin formato y nadie se entera. Y si una hermana suya sí existe '
      + '—como pasó con `.ok`— el estado bueno se ve y el hueco no, que es lo contrario de lo '
      + 'que este producto quiere.');
  });

  test('las píldoras de estado del RCA existen las TRES, no solo la buena', () => {
    // El caso concreto que lo destapó: `.ok` existía y `.av`/`.inf` no, así que
    // «cerrado» salía verde y «sin conclusión» salía como texto pelado.
    for (const c of ['pill', 'ok', 'av', 'inf', 'h-pill']) {
      assert.ok(DECLARADAS.has(c),
        `.${c} no existe: si falta una variante y las otras están, la pantalla miente por omisión`);
    }
  });

  test('el hueco se marca punteado, como el resto de huecos de la aplicación', () => {
    // Un hueco nunca se pinta como un estado alcanzado. La casa ya usa borde
    // punteado para eso (`.sello.gris`, los apoyos sin veredicto).
    const bloque = css.slice(css.indexOf('.h-pill'), css.indexOf('.h-pill') + 320);
    assert.match(bloque, /dashed/,
      'el marcador de hueco debe distinguirse de un estado real, no solo por el color');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LAS CLASES QUE NO SE ESCRIBEN ENTERAS EN EL FUENTE (§ADR-066)
// ----------------------------------------------------------------------------
// El guardián de arriba lee `className="…"` y descarta a propósito lo que lleva
// interpolación. Pero hay familias enteras cuya clase se CONSTRUYE —`'g-' +
// grado.clave`— y para esas el guardián es CIEGO: el fuente no contiene nunca la
// palabra `g-seca`, así que se quedó sin declarar y nadie se enteró. La primera
// fila de la escala de lluvia se pintó sin su borde durante horas, en producción.
//
// Se caza como se cazó `L-69`: **recorriendo el catálogo entero**, no buscando
// ejemplos. Si mañana alguien añade un grado a la escala y olvida su color, este
// test se pone rojo antes de que llegue a la pantalla.
// ════════════════════════════════════════════════════════════════════════════
describe('las clases CONSTRUIDAS también tienen que existir', () => {

  test('cada grado de las dos escalas tiene su color declarado', async () => {
    const { ESCALA_LLUVIA, ESCALA_CIELO } = await import('../web/src/vistas/atlasCaribe.ts');
    const faltan = [];
    for (const g of [...ESCALA_LLUVIA, ...ESCALA_CIELO]) {
      if (!DECLARADAS.has('g-' + g.clave)) faltan.push(`g-${g.clave} (${g.nombre})`);
    }
    assert.deepEqual(faltan, [],
      'grados de la escala que la pantalla pinta y el estilo no conoce');
  });

  test('cada régimen del eje de tiempo tiene su cinta y su día declarados', () => {
    // Los cinco regímenes de `vistas/lineaDeTiempo.ts`, que la cuadrícula pinta
    // como `g-<regimen>` y la cinta como `r-<clase>`.
    const faltan = [];
    for (const r of ['medido_horas', 'medido_solo_total', 'sin_publicar', 'pronostico', 'fuera']) {
      if (!DECLARADAS.has('g-' + r)) faltan.push('g-' + r);
    }
    for (const c of ['r-medido', 'r-modelo', 'r-hueco']) {
      if (!DECLARADAS.has(c)) faltan.push(c);
    }
    assert.deepEqual(faltan, [], 'regímenes que la pantalla pinta sin color declarado');
  });
});
