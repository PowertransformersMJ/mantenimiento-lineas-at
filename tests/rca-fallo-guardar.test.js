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

// ════════════════════════════════════════════════════════════════════════════
// LA MITAD QUE FALTABA — cazada al triar la auditoría del entorno (2026-08-22)
// ----------------------------------------------------------------------------
// El arreglo de arriba era real y esta prueba lo vigilaba… y aun así el trabajo
// se seguía perdiendo en tres sitios. Porque las cuatro escrituras SE TRAGAN el
// fallo —lo convierten en la franja roja, que es lo correcto— y por eso su
// `await` termina BIEN aunque no se haya escrito nada. Quien las llamaba vaciaba
// el formulario igual:
//
//   · declarar la CAUSA RAÍZ (`Rca.tsx`) → `setNodoId(''); setEnunciado('')`
//   · congelar el SONDEO de IDEAM (`RcaEditores.tsx`) → `setR(null)`
//   · crear una ACCIÓN correctiva (`RcaEditores.tsx`) → `setQue('')`
//
// Y la franja decía, en negrita, «Lo que escribiste sigue en pantalla y no se ha
// perdido». Mentía, en el acto más caro del expediente y al final de una
// pantalla tan larga que el aviso ni siquiera se ve.
//
// La lección: **un guardián que vigila la función pero no a quien la llama solo
// cubre la mitad del recorrido** (`32 · L-67`).
// ════════════════════════════════════════════════════════════════════════════
describe('el formulario solo se vacía si la base CONFIRMÓ', () => {
  const editores = readFileSync(join(RAIZ, 'web/src/componentes/RcaEditores.tsx'), 'utf-8');

  test('las cuatro escrituras DICEN si se guardó, en vez de devolver nada', () => {
    for (const fn of ['crearAccion', 'guardarAccion', 'guardarSondeo', 'guardarParte']) {
      const c = cuerpo(enlace, fn);
      assert.match(c, /Promise<boolean>/,
        `${fn} devuelve \`void\`: quien la llama no puede saber si escribir funcionó, y vaciará `
        + 'el formulario igual cuando falle');
      assert.match(c, /return true;/, `${fn} nunca dice que sí`);
      assert.match(c, /return false;/, `${fn} nunca dice que no`);
    }
  });

  test('declarar la causa raíz no borra el enunciado si no se guardó', () => {
    const i = pantalla.indexOf('const declarar = async ()');
    assert.notEqual(i, -1);
    const c = pantalla.slice(i, i + 1600);
    assert.match(c, /const guardado = await almacen\.guardarParte/,
      'se ignora lo que devuelve la escritura');
    assert.match(c, /if \(guardado\) \{ setNodoId\(''\); setEnunciado\(''\); \}/,
      'el formulario de la causa raíz se vacía sin comprobar que la base lo aceptó');
  });

  test('el sondeo de clima no desaparece de la pantalla si no se congeló', () => {
    const i = editores.indexOf('const guardar = async ()');
    assert.notEqual(i, -1);
    const c = editores.slice(i, i + 1800);
    assert.match(c, /const ok = await almacen\.guardarSondeo/);
    assert.match(c, /if \(ok\) setR\(null\);/,
      'la consulta se borra de la pantalla aunque no se haya guardado — y hay que volver a '
      + 'pedírsela a un portal que este proyecto tiene documentado que se cuelga 90 s');
  });

  test('la acción correctiva no se borra del campo si no se creó', () => {
    const i = editores.indexOf('const crear = async ()');
    assert.notEqual(i, -1);
    const c = editores.slice(i, i + 700);
    assert.match(c, /if \(await almacen\.crearAccion\(.*\)\) setQue\(''\)/,
      'el campo se vacía aunque la acción no se haya creado');
  });

  test('la franja no promete algo que el código no cumpla', () => {
    // Si mañana alguien vuelve a vaciar un formulario sin comprobar, esta frase
    // se convierte en una mentira. Va atada a las tres pruebas de arriba.
    assert.match(pantalla, /sigue en pantalla y no se ha perdido/,
      'si se retira la promesa, retira también las comprobaciones que la sostienen');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('«no hay» y «no se pudo mirar» no se dicen igual DENTRO del expediente', () => {
  test('abrir un análisis no se traga el motivo de una lectura fallida', () => {
    const i = enlace.indexOf('async #abrirAnalisis(');
    assert.notEqual(i, -1);
    const c = enlace.slice(i, i + 2600);
    assert.ok(!/catch \{\s*\/\*[^*]*\*\/\s*\}/.test(c) && !/catch \{\s*\}/.test(c),
      'un `catch` vacío al abrir el expediente convierte «no se pudo leer» en «no hay»');
    assert.match(c, /noSePudoLeer\.evidencias = /);
    assert.match(c, /noSePudoLeer\.acciones = /);
    assert.match(c, /noSePudoLeer\.sondeos = /);
  });

  test('la tabla de familias distingue los tres estados', () => {
    assert.match(pantalla, /No se pudieron leer las evidencias de este expediente/,
      'sin este tercer estado se descarta una familia «por falta de evidencia» con las fotos '
      + 'existiendo, y eso entra en un informe firmado');
    assert.match(pantalla, /No descarte ni sostenga ninguna familia/,
      'no basta con avisar: hay que decir qué NO se puede hacer con la pantalla en ese estado');
    assert.match(pantalla, /evidencias\.length === 0 && !noSePudoLeer/,
      'el mensaje de «no hay» tiene que excluir el caso de «no se pudo leer»');
  });

  test('la ficha del apoyo también lo distingue, no solo la pestaña Falla', () => {
    const fichas = readFileSync(join(RAIZ, 'web/src/componentes/Fichas.tsx'), 'utf-8');
    const linea = readFileSync(join(RAIZ, 'web/src/componentes/Linea.tsx'), 'utf-8');
    assert.match(fichas, /noSePudoLeer=\{noSePudoLeerFotos\}/,
      'la galería de la ficha dice «no hay fotografías» aunque la lectura haya fallado');
    assert.match(linea, /noSePudoLeerFotos=\{noSePudoLeer\?\.evidencias\}/,
      'nadie le pasa el aviso a la pestaña Fichas');
  });
});
