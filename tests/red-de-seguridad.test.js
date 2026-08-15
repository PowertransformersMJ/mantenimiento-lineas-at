// ============================================================================
// tests/red-de-seguridad.test.js — que un tropiezo no deje la página en blanco
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. La única red que tenía la aplicación era `RespaldoMapa`, y
// solo cubría el mapa. Cualquier otro tropiezo al pintar —un dato inesperado en
// una tabla, una cifra ausente donde el código daba por hecho que habría una—
// desmontaba el árbol entero y dejaba **una página en blanco**: ni cabecera, ni
// mensaje, ni botón.
//
// Lo peor no es el fallo: es que quien lo sufre no puede REPORTARLO. No hay nada
// que leer ni que copiar, así que el defecto se vuelve invisible para quien
// podría arreglarlo. Con varios ingenieros entrando, eso deja de ser teórico.
//
// LO QUE ESTA PRUEBA DEFIENDE, y son tres cosas distintas:
//   1. Que la red envuelva la aplicación ENTERA, no una parte.
//   2. Que NO se trague el error: sigue yendo a la consola con su traza.
//   3. Que el detalle técnico sea COPIABLE. Un fallo que no se puede reportar
//      no se arregla nunca.
//
// Es prueba de código fuente, como `estilo-tokens.test.js`. Y aprendida la
// lección de `hueco-no-es-aprobado.test.js`: no basta con que el texto exista en
// el archivo — hay que comprobar que la pieza esté CONECTADA.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => readFileSync(join(RAIZ, p), 'utf-8');

const red = leer('web/src/componentes/RedDeSeguridad.tsx');
const main = leer('web/src/main.tsx');
const css = leer('web/src/estilo.css');

describe('la red existe y es una red de verdad', () => {
  test('captura los fallos de pintado', () => {
    assert.match(red, /getDerivedStateFromError/,
      'sin esto React no entrega el fallo y la pantalla se queda en blanco igual');
    assert.match(red, /componentDidCatch/,
      'hace falta para quedarse con la pila de componentes, que es lo que localiza el fallo');
  });

  test('NO se traga el error: lo sigue mandando a la consola', () => {
    // Una red que silencia es peor que no tener red: el fallo desaparece para
    // quien está depurando y nadie se entera de que la aplicación tropieza.
    assert.match(red, /console\.error\(/,
      'el error debe seguir llegando a la consola con su traza');
  });

  test('no depende de nada que pueda fallar a su vez', () => {
    // Una red que necesita el almacén, la red o el repositorio puede caerse con
    // lo que intenta salvar.
    for (const prohibido of ['almacen', 'repositorio', 'firestore', 'fetch(']) {
      assert.ok(!red.includes(prohibido),
        `la red usa «${prohibido}»: si eso falla, la red cae con la aplicación`);
    }
  });
});

describe('la red está CONECTADA, no solo escrita', () => {
  test('envuelve la aplicación entera en el punto de entrada', () => {
    assert.match(main, /import \{ RedDeSeguridad \}/,
      'la red no se importa en main.tsx: existe y no cubre nada');
    // Que envuelva a <App/>, no un trozo: un tropiezo en la cabecera o en el
    // ruteo dejaría la página en blanco igual.
    assert.match(main, /<RedDeSeguridad>[\s\S]*<App \/>[\s\S]*<\/RedDeSeguridad>/,
      'la red debe envolver <App/> entero, no una parte');
  });

  test('los estilos de la red existen en la hoja', () => {
    for (const clase of ['red-seguridad', 'red-seguridad-caja', 'red-seguridad-detalle']) {
      assert.match(css, new RegExp(`\\.${clase}\\s*[,{]`),
        `.${clase} se usa y no está declarada: la pantalla de fallo saldría sin formato`);
    }
  });
});

describe('el fallo se puede reportar, que es de lo que se trata', () => {
  test('el detalle técnico se enseña y se puede seleccionar', () => {
    assert.match(red, /<details/,
      'el detalle va plegado: no es para leerlo, es para copiarlo');
    assert.match(red, /fallo\.stack/,
      'sin la traza, el detalle no sirve para arreglar nada');
    assert.match(css, /user-select:\s*text/,
      'si el texto no se puede seleccionar, no se puede copiar ni mandar');
  });

  test('ofrece DOS salidas, y ninguna encierra al usuario', () => {
    assert.match(red, /Reintentar/, 'a veces es un tropiezo puntual y basta con reintentar');
    assert.match(red, /Volver al parque/, 'y si no, hay que poder rearmar la aplicación');
    // Y que volver al parque NO cierre la sesión: obligar a entrar de nuevo por
    // un fallo de pintado es castigar al usuario por un defecto nuestro.
    assert.ok(!/cerrarSesion|signOut/.test(red),
      'volver al parque no puede cerrar la sesión: el fallo era de pintado, no de acceso');
  });

  test('dice que lo guardado NO se ha perdido', () => {
    // Es verdad —esto es un fallo al pintar, no al guardar— y es lo primero que
    // uno teme cuando la pantalla se cae.
    assert.match(red, /No se ha perdido nada de lo que está guardado/,
      'sin esa frase, el ingeniero supone lo peor y deja de confiar en la herramienta');
  });
});
