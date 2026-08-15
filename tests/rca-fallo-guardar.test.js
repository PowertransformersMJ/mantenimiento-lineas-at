// ============================================================================
// tests/rca-fallo-guardar.test.js — que un fallo al GUARDAR no borre el trabajo
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. El modo de pérdida de trabajo más probable del sistema, y era
// invisible: las cuatro funciones que ESCRIBEN ponían el expediente en
// `fase: 'error'` cuando algo fallaba. Y la pantalla monta el editor **solo si
// la fase es 'abierto'** (`Rca.tsx`), así que el componente se desmontaba y se
// llevaba todo lo que el ingeniero acababa de teclear: la cadena de porqués, el
// árbol, las hipótesis. Media mañana de razonamiento por un parpadeo de red.
//
// Encima el cartel decía «No se pudo leer» cuando lo que había fallado era
// ESCRIBIR — mandando a recargar, que es justo lo que remata el borrado.
//
// LA DISTINCIÓN QUE ESTA PRUEBA DEFIENDE, y que es de método, no de estética:
//
//   · Si no se puede LEER no hay nada que enseñar → la pantalla entera es el
//     error. Correcto.
//   · Si no se puede ESCRIBIR, lo que hay en pantalla sigue siendo válido y es
//     exactamente lo que NO se debe tirar → aviso al lado, estado intacto.
//
// Es una prueba de CÓDIGO FUENTE, como `estilo-tokens.test.js`: no necesita
// navegador ni React, y por eso corre en cada `npm test`. Lo que vigila no es
// un valor, es una forma de fallar.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const enlace = readFileSync(join(RAIZ, 'web/src/datos/enlace.ts'), 'utf-8');
const pantalla = readFileSync(join(RAIZ, 'web/src/componentes/Rca.tsx'), 'utf-8');

/** El cuerpo de una función `async nombre(...)` del almacén, hasta la siguiente. */
function cuerpo(fuente, nombre) {
  const i = fuente.indexOf(`async ${nombre}(`);
  assert.notEqual(i, -1, `no existe la función ${nombre}: ¿se renombró? esta prueba hay que actualizarla`);
  const resto = fuente.slice(i + 1);
  const j = resto.search(/\n  (?:async |#|\/\*\*)/);
  return resto.slice(0, j === -1 ? undefined : j);
}

/** Las cuatro que ESCRIBEN en la base desde el segmento de causa raíz. */
const ESCRITURAS = ['guardarParte', 'crearAccion', 'guardarAccion', 'guardarSondeo'];

describe('un fallo al GUARDAR no puede tirar la pantalla', () => {
  for (const fn of ESCRITURAS) {
    test(`${fn}: al fallar NO pone la fase en 'error'`, () => {
      const c = cuerpo(enlace, fn);
      assert.doesNotMatch(c, /fase:\s*'error'/,
        `${fn} pone el expediente en fase 'error' al fallar. La pantalla solo monta el editor `
        + 'si la fase es «abierto», así que eso desmonta el componente y borra lo que el '
        + 'ingeniero tenía escrito sin guardar.');
    });

    test(`${fn}: al fallar deja constancia en falloAlGuardar`, () => {
      const c = cuerpo(enlace, fn);
      assert.match(c, /falloAlGuardar/,
        `${fn} no anota el fallo en ningún sitio. Un guardado que falla en silencio es peor `
        + 'que uno que tira la pantalla: el ingeniero cree que quedó guardado.');
    });
  }

  test('el estado se CONSERVA al fallar: se propaga con «...r»', () => {
    for (const fn of ESCRITURAS) {
      const c = cuerpo(enlace, fn);
      const captura = c.slice(c.indexOf('catch'));
      assert.match(captura, /\.\.\.r/,
        `${fn} no propaga el estado anterior al fallar: lo que hubiera en pantalla se pierde.`);
    }
  });
});

describe('leer y escribir fallan distinto, y se cuentan distinto', () => {
  test('las funciones que LEEN sí usan la fase de error, que es lo correcto', () => {
    // Si no se puede leer no hay nada que enseñar: ahí la pantalla entera SÍ es
    // el error. La prueba lo fija para que nadie «arregle» esto de más y deje
    // un fallo de lectura sin avisar.
    const abrir = cuerpo(enlace, '#abrirAnalisis') + cuerpo(enlace, 'abrirRca');
    assert.match(abrir, /fase:\s*'error'/,
      'un fallo al LEER debe seguir tomando la pantalla: no hay nada válido que conservar');
  });

  test('el cartel de pantalla completa ya no dice «no se pudo leer» a secas', () => {
    // Decía «No se pudo leer» también cuando fallaba una escritura, y eso manda
    // a recargar — que es lo que remata el borrado.
    assert.match(pantalla, /No se pudieron leer los análisis/,
      'el cartel de la fase de error debe nombrar la LECTURA, que es lo único que lo produce');
  });

  test('la pantalla pinta el aviso de escritura sin desmontar el editor', () => {
    assert.match(pantalla, /falloAlGuardar/,
      'la pantalla no lee el fallo de escritura: el error quedaría invisible');
    assert.match(pantalla, /rca-fallo-guardar/,
      'falta la franja de aviso');
    // Y que el aviso viva DENTRO de la fase abierta, no en su lugar.
    const i = pantalla.indexOf('rca-fallo-guardar');
    const j = pantalla.indexOf('<TablaDescartes');
    assert.ok(i !== -1 && j !== -1 && i < j,
      'el aviso va arriba del expediente, no reemplazándolo');
  });
});

describe('la franja de aviso existe en la hoja de estilos', () => {
  test('.rca-fallo-guardar está declarada', () => {
    const css = readFileSync(join(RAIZ, 'web/src/estilo.css'), 'utf-8');
    assert.match(css, /\.rca-fallo-guardar\s*\{/,
      'una clase que se usa y no existe deja el aviso como texto corriente: '
      + 'el mismo fallo silencioso que ya documenta `estilo-tokens.test.js`');
  });
});
