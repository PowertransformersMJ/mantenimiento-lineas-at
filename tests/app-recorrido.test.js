// ============================================================================
// tests/app-recorrido.test.js — que la pantalla no se quede en blanco, que
// `#/alta` lleve al alta, y que sin enlace se abra la línea de siempre
// ----------------------------------------------------------------------------
// QUÉ SE VIGILA AQUÍ, y por qué cada cosa es una forma real de hacer daño:
//
//   1. NINGUNA FASE SIN PANTALLA, Y LO EXIGE EL COMPILADOR. `Contenido()` no
//      declaraba su tipo de retorno, así que TypeScript infería
//      `ReactElement | undefined` y el `switch` sin caso por defecto **no
//      obligaba a nada** — justo lo contrario de lo que decía su propio
//      comentario. MEDIDO: con la fase «recorrido» añadida al molde y sin
//      tratar, `npx tsc --noEmit` pasaba LIMPIO y una línea sin torres pintaba
//      una pantalla EN BLANCO: ni datos, ni parque, ni error, ni «Reintentar».
//      Una función de React que devuelve `undefined` no dibuja nada y no se
//      queja. Con el tipo declarado, salirse por el final es error TS2366.
//
//      Por eso la lista de fases de esta prueba **no se escribe a mano**: se
//      saca del molde (`datos/repositorio.ts`). Una lista copiada es una lista
//      que se desincronizará el día que haya prisa (`30 · M-01`), y entonces
//      esta prueba diría que todo está tratado mientras la fase nueva pinta
//      la nada.
//
//   2. NO SE COPIA NADA DE OTRA LÍNEA (orden del Ingeniero, 2026-09-17). La
//      línea que todavía no calcula se pinta con conductor e hipótesis NULOS,
//      dichos explícitamente. Prestarle los de la línea vecina para que las
//      pestañas «se vean bien» sería el fallo más caro del proyecto: un número
//      firmado con la hipótesis de otra línea.
//
//   3. UN ENLACE LLEVA A DONDE DICE. `#/alta` abre el alta de línea, y el alta
//      vive en el ALMACÉN y no en la pantalla: es lo que hace que recargar a
//      media faena vuelva al alta —que escribe cosas que no se pueden
//      deshacer— en vez de a la línea de debajo con lo declarado perdido.
//
//   4. SIN ENLACE SE ABRE LA PRIMERA POR FECHA DE ALTA. Esa elección depende de
//      `ordenarParque`, y hasta hoy dependía de que OTRO archivo se acordara de
//      llamarlo antes de devolver la lista. Un invariante mantenido a mano en
//      otro sitio es un invariante que se rompe, y aquí el síntoma sería mudo:
//      se abriría otra línea, con sus cifras, sin un solo error en pantalla.
//
// POR QUÉ UNA PARTE SE PRUEBA COMO TEXTO. `web/src/App.tsx` es JSX y
// `web/src/datos/enlace.ts` arrastra el SDK de Firebase: ninguno de los dos se
// puede importar desde `node --test`. Lo que SÍ se importa y se ejecuta de
// verdad es la gramática de direcciones (`datos/ruta.ts`) y el criterio de
// orden del parque (`ordenarParque`), que es donde vive la decisión. Es el
// mismo reparto que ya usan `ruta.test.js` y `datos-recorrido.test.js`, y se
// dice aquí para que nadie confunda una comprobación de forma con una de
// comportamiento.
//
// ⚠️ MUNDO SINTÉTICO: líneas `LX-1` y `LX-2` de una organización inventada. Ni
// un código, ni un nombre, ni una coordenada reales.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { leerRuta } from '../web/src/datos/ruta.ts';
import { ordenarParque } from '../web/src/datos/repositorio.ts';
import { Linea } from '../contratos/src/activos.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => readFileSync(join(RAIZ, p), 'utf-8');
const APP = leer('web/src/App.tsx');
const ENLACE = leer('web/src/datos/enlace.ts');
const REPOSITORIO = leer('web/src/datos/repositorio.ts');

/**
 * Un texto SIN comentarios. Hace falta en todas las comprobaciones de forma:
 * los comentarios de este repositorio explican justamente lo que NO se hace y
 * por qué —«hasta 0.15.0 devolvía `{ fase: 'error' }`»—, así que buscar la
 * frase a secas encontraría la explicación y daría por bueno lo que está roto.
 */
const sinComentarios = (txt) => txt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** El cuerpo de un método del almacén, recortado hasta el siguiente. */
function metodoDelAlmacen(nombre) {
  const i = ENLACE.indexOf(`async ${nombre}(`);
  assert.ok(i > 0, `no existe el método ${nombre} en el almacén`);
  const siguiente = ['\n  async ', '\n  /**', '\n}']
    .map((marca) => ENLACE.indexOf(marca, i + 10))
    .filter((x) => x !== -1);
  return ENLACE.slice(i, siguiente.length ? Math.min(...siguiente) : undefined);
}

// ════════════════════════════════════════════════════════════════════════════
// 1 · NINGUNA FASE SE QUEDA SIN PANTALLA
// ════════════════════════════════════════════════════════════════════════════
describe('la pantalla trata todas las fases, y el compilador lo exige', () => {

  /**
   * LAS FASES QUE EXISTEN, SACADAS DEL MOLDE. No se escriben a mano aquí a
   * propósito: añadir una fase a `EstadoDatos` tiene que hacer fallar esta
   * prueba sin tocarla.
   */
  const fasesDelMolde = () => {
    const i = REPOSITORIO.indexOf('export type EstadoDatos =');
    assert.ok(i > 0, 'ya no existe `EstadoDatos` en la capa de datos');
    const fin = REPOSITORIO.indexOf('\n// ═', i);
    const union = sinComentarios(REPOSITORIO.slice(i, fin === -1 ? undefined : fin));
    const fases = [...union.matchAll(/\|\s*\{\s*fase:\s*'([a-z_]+)'/g)].map((m) => m[1]);
    assert.ok(fases.length >= 5, 'no se pudieron leer las fases del molde: la prueba se quedó ciega');
    return fases;
  };

  /** El `switch` de `Contenido()`, recortado antes de que empiece `App()`. */
  const elSwitch = () => {
    const i = APP.indexOf('switch (d.fase)');
    assert.ok(i > 0, 'ya no hay un `switch` por fase en App.tsx');
    const fin = APP.indexOf('export function App()', i);
    return APP.slice(i, fin === -1 ? undefined : fin);
  };

  test('cada fase del molde tiene su `case` en la pantalla', () => {
    // La que se olvidó fue «recorrido», y el daño no fue un error: fue una
    // pantalla en blanco. Quien entrara por enlace a una línea recién dada de
    // alta no vería ni el parque, o sea que perdía el acceso a la línea que sí
    // funciona sin que nada explicara por qué.
    const sw = elSwitch();
    const sinCaso = fasesDelMolde().filter((f) => !sw.includes(`case '${f}':`));
    assert.deepEqual(sinCaso, [],
      'hay fases sin pantalla: la aplicación pintará NADA cuando la capa de datos devuelva una de ellas');
  });

  test('`Contenido()` declara su tipo de retorno, que es lo que obliga', () => {
    // Sin esta anotación TypeScript infiere `... | undefined` y el `switch` sin
    // caso por defecto no obliga a nada. MEDIDO antes de escribirla: con la
    // fase «recorrido» sin tratar, `npx tsc --noEmit` salía con código 0.
    assert.match(APP, /function Contenido\(\): ReactElement \{/,
      'sin tipo de retorno declarado, olvidarse de una fase vuelve a compilar limpio');
  });

  test('el `switch` sigue SIN caso por defecto', () => {
    // Un `default` devolvería la pantalla de error —o peor, la de otra fase— y
    // apagaría el aviso del compilador: volvería a poderse añadir una fase sin
    // decidir qué se pinta.
    assert.ok(!/\n\s*default:/.test(elSwitch()),
      'un caso por defecto deja de obligar a tratar cada fase nueva');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2 · LA LÍNEA QUE TODAVÍA NO CALCULA SE PINTA, Y NO PIDE NADA PRESTADO
// ════════════════════════════════════════════════════════════════════════════
describe('la fase «recorrido» pinta la línea con lo que sí hay', () => {

  test('es la MISMA vista de línea que la fase completa', () => {
    // No es otra aplicación ni una pantalla aparte: es la misma línea con menos
    // cosas declaradas. Partirla en dos habría partido con ella el parque, las
    // pestañas y el mapa.
    const sw = APP.slice(APP.indexOf('switch (d.fase)'));
    assert.match(sw, /case 'recorrido':\s*return <VistaLinea /);
    assert.match(sw, /case 'listo':\s*return <VistaLinea /);
  });

  test('conductor e hipótesis van NULOS, y dichos en voz alta', () => {
    // Orden del Ingeniero (2026-09-17): no se copia nada de la línea vecina.
    // Van explícitos y no ausentes para que se lea en el sitio: «aquí no hay»,
    // en vez de dejar que quien mantenga esto los rellene «para que se vea
    // bien» con los de otra línea.
    assert.match(APP, /case 'recorrido':\s*return <VistaLinea \{\.\.\.d\} conductor=\{null\} hipotesis=\{null\} \/>;/,
      'la línea sin conductor ni hipótesis no puede pintarse con los de otra línea');
  });

  test('ningún conductor ni hipótesis sale de otra línea que la abierta', () => {
    // El daño que cierra: sacar «un conductor parecido» del parque
    // (`d.lineas.find(...)`) para que las pestañas no se vean vacías. No daría
    // ningún error y acabaría en un número firmado con la hipótesis de otra
    // línea — el fallo más caro que este proyecto puede cometer.
    //
    // La regla es simple y por eso se puede vigilar: todo lo que se entrega
    // como conductor o hipótesis o es `null` —«aquí no hay»— o sale de `d`, que
    // es el estado de LA LÍNEA ABIERTA. El atlas, por ejemplo, recibe la de la
    // línea abierta y solo en fase «listo», que es correcto: es la suya.
    const entregas = [...sinComentarios(APP).matchAll(/(conductor|hipotesis)=\{([^}]*)\}/g)];
    assert.ok(entregas.length >= 3, 'ya no se entregan conductor ni hipótesis: la prueba se quedó ciega');
    for (const [, que, valor] of entregas) {
      assert.ok(valor.trim() === 'null' || valor.includes('d.'),
        `se entrega un ${que} que no es nulo ni sale de la línea abierta: «${valor.trim()}»`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3 · LA DIRECCIÓN `#/alta`
// ════════════════════════════════════════════════════════════════════════════
describe('`#/alta` abre el alta de línea', () => {

  test('la gramática la reconoce, con barra final y sin ella', () => {
    assert.deepEqual(leerRuta('#/alta'), { tipo: 'alta' });
    assert.deepEqual(leerRuta('#/alta/'), { tipo: 'alta' });
  });

  test('no lleva segundo tramo: no cuelga de ninguna línea', () => {
    // Lo que se está dando de alta todavía no existe, así que ponerlo detrás de
    // un código de línea sería mentir sobre de quién es. `#/alta/loquesea` cae
    // al caso de línea, donde el código «alta» no existirá — una dirección
    // inventada no debe abrir una pantalla real.
    assert.deepEqual(leerRuta('#/alta/LN-617'), { tipo: 'linea', codigo: 'alta', pestana: 'LN-617' });
  });

  test('no le quita la dirección a nadie', () => {
    // Un `if` colocado sin mirar puede tragarse las direcciones vecinas y nadie
    // se entera hasta que un enlace pegado en un correo abre otra cosa.
    assert.deepEqual(leerRuta('#/personas'), { tipo: 'personas' });
    assert.deepEqual(leerRuta('#/rca'), { tipo: 'rca', codigo: undefined });
    assert.deepEqual(leerRuta('#/sol'), { tipo: 'atlas', cual: 'sol' });
    assert.deepEqual(leerRuta('#/LN-617/resumen'),
      { tipo: 'linea', codigo: 'LN-617', pestana: 'resumen' });
  });
});

describe('el alta vive en el almacén, no en la pantalla', () => {

  test('el almacén sabe abrirla, cerrarla y contarla', () => {
    // Si el interruptor viviera en la vista de línea, cambiar de línea en la
    // columna del parque —o abrir un atlas y volver— desmontaría el componente
    // y se perdería a medias lo que se estuviera declarando, sin un aviso.
    for (const [que, patron] of [
      ['abrir', /abrirAlta\(\): void \{/],
      ['cerrar', /cerrarAlta\(\): void \{/],
      ['leer', /leerAlta = \(\): boolean => this\.#alta;/],
      ['el gancho de la pantalla', /export function useAlta\(\): boolean \{/],
    ]) {
      assert.match(ENLACE, patron, `al almacén le falta ${que} el alta de línea`);
    }
  });

  test('abrir el alta cierra lo que estuviera encima', () => {
    // Con dos pantallas encendidas a la vez manda la que `App.tsx` mira
    // primero: se vería una y la dirección diría otra.
    const i = ENLACE.indexOf('abrirAlta(): void {');
    const cuerpo = ENLACE.slice(i, ENLACE.indexOf('\n  }', i));
    assert.match(cuerpo, /this\.#rca = \{ fase: 'cerrado' \}/);
    assert.match(cuerpo, /this\.#atlas = null;/);
    assert.match(cuerpo, /this\.#personas = false;/);
    assert.match(cuerpo, /irA\('#\/alta'\)/);
  });

  test('la dirección de vuelta nunca es `#/alta`', () => {
    // Ocurre de verdad: quien PEGA `#/alta` llega aquí con la dirección ya
    // puesta en `#/alta` —la vista de línea la reescribe en un efecto, o sea
    // después—. Si se guardara esa, «volver» llevaría al alta otra vez y no
    // habría forma de salir; y al recargar se reabriría sola una pantalla que
    // escribe cosas que no se pueden deshacer.
    const i = ENLACE.indexOf('abrirAlta(): void {');
    const cuerpo = ENLACE.slice(i, ENLACE.indexOf('\n  }', i));
    assert.match(cuerpo, /actual === '#\/alta' \? null : actual/,
      'cerrar el alta volvería al alta: no habría salida más que a mano');
  });

  test('pegar `#/alta` la abre, en vez de cargar la línea y borrar la dirección', () => {
    // Es lo que ya le pasó al atlas: la barra pasaba de `#/sol` a
    // `#/LN-627/resumen` sola, porque abrir la línea reescribe la dirección.
    assert.match(metodoDelAlmacen('cargar'), /if \(ruta\?\.tipo === 'alta'\) this\.abrirAlta\(\);/);
  });

  test('Atrás y Adelante mandan sobre el alta, como sobre todo lo demás', () => {
    assert.match(metodoDelAlmacen('sincronizarConRuta'),
      /const alta = r2\?\.tipo === 'alta';[\s\S]*?if \(alta !== this\.#alta\)/,
      'sin esto, salir del alta con Atrás dejaría el formulario en pantalla con la dirección de la línea');
  });

  test('el alta se apaga con la sesión', () => {
    // Volver a entrar no puede dejar a nadie dentro del formulario que empezó
    // otra persona, sobre una pantalla que escribe cosas que no se deshacen.
    assert.match(metodoDelAlmacen('cargar'),
      /this\.#personas = false;\s*\n\s*this\.#alta = false;/,
      'sin sesión el alta tiene que quedar apagada');
    assert.match(metodoDelAlmacen('cerrarSesionPorReloj'), /this\.#alta = false;/,
      'la sesión que caduca por el reloj también apaga el alta');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4 · SIN ENLACE SE ABRE LA PRIMERA POR FECHA DE ALTA
// ════════════════════════════════════════════════════════════════════════════
describe('la línea de defecto es la primera por fecha de alta', () => {

  const ORG = 'org-de-prueba';
  const QUIEN = 'uid-de-prueba';
  const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

  /** Una línea del molde, validada. Lo que no se diga, no está. */
  const linea = (codigo, id, creadoEn) => Linea.parse({
    id, orgId: ORG, creadoEn, creadoPor: QUIEN, revision: 0, tipo: 'linea',
    codigo, nombre: `Línea inventada ${codigo}`, tensionNominal_kV: 110, circuitos: 1,
  });

  // LAS FECHAS CRUZADAS, que es el caso que rompe la intuición: «09:00-05:00»
  // son las 14:00 en el reloj de referencia, o sea DOS HORAS DESPUÉS de las
  // «12:00Z» — aunque alfabéticamente vaya antes. Una comparación de texto
  // abriría LX-1; el reloj dice LX-2.
  const conOffset = linea('LX-1', uuid(1), '2026-09-15T09:00:00.000-05:00');   // 14:00 Z
  const enZeta = linea('LX-2', uuid(2), '2026-09-15T12:00:00.000Z');

  test('con fechas cruzadas se elige por INSTANTE, no por texto ni por id', () => {
    assert.equal(ordenarParque([conOffset, enZeta])[0].codigo, 'LX-2',
      'se abriría la línea equivocada: «09:00-05:00» es posterior a «12:00Z», no anterior');
    // Y no depende del orden en que vengan de la base: la lista llega sin
    // garantía ninguna de orden.
    assert.equal(ordenarParque([enZeta, conOffset])[0].codigo, 'LX-2');
  });

  test('el almacén ordena el parque ANTES de elegir, y no hereda el orden de nadie', () => {
    // La corrección: `lineas[0]` decide qué línea se ve al entrar sin enlace, y
    // hasta hoy eso dependía de que `firestore.ts` se acordara de ordenar. Un
    // invariante mantenido a mano en otro archivo se rompe, y el síntoma aquí
    // sería mudo: otra línea, con sus cifras, sin un solo error.
    const cuerpo = metodoDelAlmacen('cargar');
    const ordena = cuerpo.indexOf('const lineas = ordenarParque(await repositorio.listarLineas());');
    const elige = cuerpo.indexOf('let objetivo = lineas[0];');
    assert.ok(ordena > 0, 'el almacén volvió a heredar el orden de quien trajo la lista');
    assert.ok(elige > ordena, 'se elige la primera ANTES de ordenar: se abriría una línea cualquiera');
  });

  test('el criterio tiene UN solo dueño: `ordenarParque`', () => {
    // Nada de un segundo `sort` aquí. Dos criterios para lo mismo divergen, y
    // el día que lo hagan la columna del parque y la línea que se abre dirán
    // cosas distintas.
    assert.ok(!/\.sort\(/.test(sinComentarios(ENLACE)),
      'el almacén se escribió su propio orden del parque en vez de usar el criterio de la casa');
  });

  test('el aviso del enlace roto nombra la línea que SE ABRIÓ', () => {
    // Hoy son la misma y por eso el fallo sería mudo; el día que la de defecto
    // se elija de otra forma, el aviso diría un código y la pantalla otro.
    const cuerpo = metodoDelAlmacen('cargar');
    assert.ok(cuerpo.includes('Se abrió ${objetivo.codigo}.'),
      'el aviso se escribió contra `lineas[0]` en vez de contra la línea que de verdad se abre');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5 · LO QUE FALTA, DECLARADO
// ════════════════════════════════════════════════════════════════════════════
describe('lo que todavía no está', () => {

  // ⚠️ ESTA PRUEBA ESTÁ AL REVÉS DE COMO NACIÓ, y a propósito. Pedía que la
  // columna del parque tuviera el botón «+ Alta de línea» (maqueta M1/M4). El
  // Ingeniero lo retiró el 2026-09-24 —«no quiero que esto se vea en el
  // módulo»—, así que lo que hay que vigilar ya no es que esté: es que NO
  // vuelva a colarse ahí, y que al quitarlo no se haya llevado por delante la
  // capacidad de dar de alta.
  test('la columna del parque NO ofrece el alta de línea, y el alta sigue alcanzable', () => {
    const LINEA = leer('web/src/componentes/Linea.tsx');
    // El botón, fuera: ni la clase de la maqueta ni el rótulo, fuera de comentarios.
    const sinComentar = LINEA.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/parque-alta/.test(sinComentar),
      'volvió el botón de alta a la columna del parque: el Ingeniero lo retiró de ahí');
    assert.ok(!/\+ Alta de línea/.test(sinComentar),
      'volvió el rótulo del alta a la columna del parque');
    // Y la capacidad, intacta: el estado cero es el único camino que no se toca.
    const ESTADO = leer('web/src/componentes/Estado.tsx');
    assert.match(ESTADO, /abrirAlta\(\)/,
      'al retirar el botón del parque se perdió también el del parque VACÍO: '
      + 'entonces la primera línea no podría darse nunca desde la pantalla');
  });

  test('desde el parque VACÍO también se puede dar de alta la primera línea', {
    todo: 'Frontera del estado cero: con el parque vacío, `cargar()` devuelve la fase «vacio», que '
      + 'SUSTITUYE la pantalla entera — y la columna del parque, donde va el botón, no se pinta. '
      + 'O sea que hoy el alta solo se alcanza si YA hay una línea abierta, o pegando `#/alta` a mano. '
      + 'No se inventa aquí una salida: la decide el Ingeniero (pantalla `Vacio` con el botón, o el '
      + 'alta como pantalla de encima). `web/src/componentes/Estado.tsx` no es de esta tanda.',
  }, () => {
    const ESTADO = leer('web/src/componentes/Estado.tsx');
    assert.ok(/abrirAlta\(\)/.test(ESTADO),
      'con el parque vacío no hay por dónde crear la primera línea');
  });
});
