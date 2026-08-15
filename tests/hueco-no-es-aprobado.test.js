// ============================================================================
// tests/hueco-no-es-aprobado.test.js — «no hay» y «no se pudo mirar» son cosas
// distintas, y aplanarlas convierte un hueco en un aprobado
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. Los expedientes de falla y las fichas de foto se leen cada uno
// en su propio `try`, y que un fallo ahí NO tumbe la vista de la línea es una
// decisión CORRECTA y deliberada: el cálculo mecánico no depende de ellos.
//
// Pero el fallo solo se escribía en la consola del navegador —que nadie abre— y
// la lista quedaba vacía. Entonces la pantalla afirmaba, con la clase `ok` (o
// sea, estilo de estado BUENO):
//
//   «Esta línea no tiene ningún expediente de falla registrado.
//    No es un hueco de la aplicación: es el estado de la línea.»
//
// Esa segunda frase es FALSA cuando lo que pasó es que no se pudo comprobar. Y
// la galería decía lo propio de las fotos.
//
// POR QUÉ IMPORTA MÁS DE LO QUE PARECE: alguien puede descartar una familia de
// causas «sin evidencia» apoyándose en esa pantalla, cuando las fotos existían y
// solo no se pudieron traer. Ese descarte entra en un informe que se firma.
//
// Es `32 · L-44` en su forma pura: un tercer estado que la pantalla aplana se
// convierte en un aprobado. Esta prueba fija los TRES estados.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => readFileSync(join(RAIZ, p), 'utf-8');

const firestore = leer('web/src/datos/firestore.ts');
const repositorio = leer('web/src/datos/repositorio.ts');
const falla = leer('web/src/componentes/Falla.tsx');
const galeria = leer('web/src/componentes/Galeria.tsx');

describe('el hueco viaja con el dato, no se queda en la consola', () => {
  test('el tipo de estado puede declarar QUÉ no se pudo leer', () => {
    assert.match(repositorio, /noSePudoLeer\?:\s*\{\s*investigaciones\?/,
      'sin un sitio donde declarar el fallo, la pantalla no tiene con qué distinguir');
  });

  test('las dos lecturas opcionales dejan constancia al fallar, no solo un aviso en consola', () => {
    for (const [nombre, marca] of [['expedientes de falla', 'falloInvestigaciones'],
                                   ['fichas de evidencia', 'falloEvidencias']]) {
      assert.match(firestore, new RegExp(`${marca}\\s*=`),
        `el fallo leyendo ${nombre} no se registra en ninguna parte: se pierde en la consola`);
    }
  });

  test('el fallo llega hasta la pantalla dentro del estado', () => {
    assert.match(firestore, /noSePudoLeer/,
      'el repositorio no propaga el hueco: la pantalla nunca se entera');
  });

  test('se sigue adelante pese al fallo — la decisión correcta NO se rompe', () => {
    // Esto es tan importante como lo anterior: un fallo leyendo expedientes no
    // puede tumbar la vista de la línea, porque el cálculo mecánico no depende
    // de ellos. Si alguien "arregla" esto lanzando, rompe algo que estaba bien.
    assert.match(firestore, /console\.warn\('\[datos\] no se pudieron leer los expedientes/,
      'la lectura de expedientes debe seguir siendo tolerante a fallo');
    assert.doesNotMatch(firestore, /throw[\s\S]{0,80}no se pudieron leer/,
      'no se debe lanzar: eso tumbaría la línea entera por un dato accesorio');
  });
});

describe('la pantalla distingue los TRES estados', () => {
  test('Falla: no afirma «no hay» cuando no pudo comprobar', () => {
    assert.match(falla, /No se pudieron leer los expedientes de esta línea/,
      'falta el tercer estado: hoy un fallo se lee como «esta línea no tiene expedientes»');
    assert.match(falla, /NO significa que no\s*\n?\s*haya/,
      'el aviso tiene que decir explícitamente que no equivale a «no hay»');
  });

  test('Falla: el aviso NO usa la clase de estado bueno', () => {
    const i = falla.indexOf('No se pudieron leer los expedientes');
    const bloque = falla.slice(Math.max(0, i - 400), i);
    assert.doesNotMatch(bloque.slice(-120), /className="ok"/,
      'un hueco pintado de verde es exactamente el aprobado que esta prueba impide');
    assert.match(bloque, /className="alerta"/,
      'el hueco se pinta como alerta, no como estado correcto');
  });

  test('el tercer estado es ALCANZABLE: la condición mira el dato, no una constante', () => {
    // Comprobar que el TEXTO existe no basta: con `if (false)` el texto sigue
    // en el archivo y no se pinta jamás. Lo cazó una prueba de mutación sobre
    // esta misma prueba, que pasaba en verde con el tercer estado desactivado.
    assert.match(falla, /if\s*\(\s*noSePudoLeer\s*\)/,
      'la rama del hueco debe depender del dato: una condición constante la deja muerta');
    assert.match(galeria, /if\s*\(\s*noSePudoLeer\s*\)/,
      'lo mismo en la galería');
  });

  test('el dato llega de verdad hasta las dos pantallas', () => {
    // Y que la condición mire el dato tampoco basta si nadie se lo pasa.
    const linea = leer('web/src/componentes/Linea.tsx');
    assert.match(linea, /noSePudoLeer=\{noSePudoLeer\?\.investigaciones\}/,
      'la pestaña Falla no recibe el fallo de los expedientes');
    assert.match(linea, /noSePudoLeerFotos=\{noSePudoLeer\?\.evidencias\}/,
      'la pestaña Falla no recibe el fallo de las fichas de foto');
    assert.match(falla, /noSePudoLeer=\{noSePudoLeerFotos\}/,
      'la galería no recibe el fallo desde Falla');
  });

  test('Falla: el estado bueno SIGUE existiendo para el caso real', () => {
    // Una línea sin eventos es lo normal y debe poder decirse con tranquilidad.
    assert.match(falla, /Esta línea no tiene ningún expediente de falla registrado/,
      'el vacío legítimo no debe desaparecer: la mayoría de líneas no tienen eventos');
  });

  test('Galería: tampoco afirma que no hay fotos cuando no pudo leerlas', () => {
    assert.match(galeria, /No se pudieron leer las fichas de fotografía/,
      'sin esto, un fallo de lectura se lee como «este expediente no tiene fotografías»');
    assert.match(galeria, /descarte por «falta de evidencia»/,
      'el aviso debe nombrar la consecuencia real: descartar una causa por evidencia que sí existía');
  });
});
