// ============================================================================
// tests/recorridos-leidos.test.js — CÓMO SE PIDEN LOS RECORRIDOS LEVANTADOS:
// por las series que el libro avala, y diciéndolo cuando el tope recorta
// ----------------------------------------------------------------------------
// QUÉ SE VIGILA AQUÍ, y por qué cada cosa es una forma real de hacer daño:
//
//   1. EL RECORRIDO SE PIDE POR LAS SERIES QUE EL LIBRO AVALA. El libro de
//      códigos es lo único que amarra el `codigo` que se ENSEÑA de un tramo con
//      el `id` con el que se PIDEN sus datos. Ya protegía las torres; el
//      recorrido levantado se pedía con la lista CRUDA, así que una línea que
//      declarase `{ codigo: 'TR-618', id: <el id de otra línea> }` no traía ni
//      una torre del tramo —el libro la paraba— pero SÍ traía el recorrido de
//      esa otra línea, y la pantalla lo dibujaba rotulado como del tramo
//      compartido. Un trazado ajeno enseñado como propio, en silencio, y encima
//      justo en la pantalla que existe para las líneas que todavía no tienen
//      torres: la que se va a usar para dar de alta LN-617 y LN-628.
//
//   2. EL TOPE, CUANDO MUERDE, SE DICE. La consulta se corta a 50 recorridos por
//      serie. Con `limit(50)` a secas, cincuenta leídos pueden ser el final
//      justo o el principio de doscientos y no hay forma de distinguirlo: la
//      pantalla enseñaría media historia con cara de enseñarla entera. Se piden
//      51 para poder decirlo, se entregan 50 —ni uno más que antes—.
//
//   3. Y EL AVISO NO PUEDE MENTIR. La consulta NO lleva orden (el índice
//      declarado es `(orgId, serieId)` y pedir un orden que no tiene índice es
//      verde en el emulador y vacío en producción, `35 · L-85`): la fecha se
//      ordena DESPUÉS, con lo que llegó. Así que lo que se queda fuera no son
//      «los más antiguos» y decir «los 50 más recientes» sería el cartel que
//      miente — el mismo defecto que ya costó una corrección en Cargabilidad.
//
// POR QUÉ LA MITAD SE PRUEBA COMO TEXTO: `web/src/datos/firestore.ts` arrastra
// el SDK de Firebase y no se puede importar desde `node --test`. Lo que DECIDE
// vive en `repositorio.ts` —puro, y aquí se ejecuta de verdad—; de lo que queda
// en `firestore.ts` se comprueba la FORMA leyendo el archivo, igual que hacen
// `datos-recorrido` y `cerrojo-revision`.
//
// ⚠️ MUNDO SINTÉTICO en todo lo inventado: una línea `LX-1` y un tramo `TR-9`.
// Los códigos reales que sí aparecen (`LN-627`, `LN-617`, `LN-628`, `TR-618`)
// son rótulos de línea, no dato de cliente: ni una coordenada, ni un nombre de
// subestación, ni una bahía.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { avisosDeDatos, repositorioSinSesion, seriesAvaladas } from '../web/src/datos/repositorio.ts';
// El MISMO intérprete del libro que usa la aplicación: si mañana cambia qué es
// una fila válida, cambia en un solo sitio y esta prueba se entera.
import { codigosDelLibro, idDelLibro } from '../importar/identidad.js';
import { leerCodigos } from '../herramientas/identidad.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => readFileSync(join(RAIZ, p), 'utf-8');
const FIRESTORE = leer('web/src/datos/firestore.ts');
const ENLACE = leer('web/src/datos/enlace.ts');

/**
 * El cuerpo de UN método del repositorio, recortado hasta el siguiente. Sin este
 * corte, una comprobación de «aquí no se pide la lista cruda» se leería el
 * método de al lado y pasaría o fallaría por lo que hace otro: verde que engaña.
 * Es el mismo recorte que usa `tests/datos-recorrido.test.js`.
 */
function metodo(nombre) {
  const i = FIRESTORE.indexOf(`async ${nombre}(`);
  assert.ok(i > 0, `no existe el método ${nombre} en el repositorio de Firestore`);
  const siguiente = ['\n  async ', '\n  /**']
    .map((marca) => FIRESTORE.indexOf(marca, i + 10))
    .filter((x) => x !== -1);
  return FIRESTORE.slice(i, siguiente.length ? Math.min(...siguiente) : undefined);
}

/** El mismo cuerpo SIN comentarios: aquí los comentarios explican lo que NO se hace. */
const sinComentarios = (txt) => txt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// ════════════════════════════════════════════════════════════════════════════
describe('el recorrido se pide por las series que el LIBRO avala', () => {
  test('con el id de otra línea bajo el rótulo del tramo, ese recorrido NI SE PIDE', () => {
    // La cuenta de verdad, con el libro REAL del repositorio: es el mismo
    // `seriesAvaladas` que corre en producción, no una copia.
    const crudo = leerCodigos();
    const libro = new Map(codigosDelLibro(crudo).map((c) => [c, idDelLibro(crudo, c)]));
    assert.ok(libro.has('TR-618') && libro.has('LN-628') && libro.has('LN-617'),
      'los tres códigos de esta ampliación están anotados en el libro');

    const propia = { tipo: 'linea', id: libro.get('LN-617'), codigo: 'LN-617' };
    const suplantado = { tipo: 'tramo', id: libro.get('LN-628'), codigo: 'TR-618' };
    const bueno = { tipo: 'tramo', id: libro.get('TR-618'), codigo: 'TR-618' };

    // LO QUE SE LE PASA A `listarLevantamientos` ES ESTA LISTA DE IDENTIFICADORES.
    const pedidos = (series) => seriesAvaladas(series, libro).series.map((s) => s.id);

    assert.deepEqual(pedidos([propia, suplantado]), [libro.get('LN-617')],
      'el recorrido de LN-628 no puede pedirse bajo el rótulo del tramo compartido');
    assert.deepEqual(pedidos([propia, bueno]), [libro.get('LN-617'), libro.get('TR-618')],
      'y el par bien anotado se sigue pidiendo: esto no cierra el tramo, cierra la suplantación');
    // La serie PROPIA nunca se queda fuera: su id es el documento abierto, no
    // una declaración. Una línea sin su propio recorrido sería peor daño.
    assert.deepEqual(pedidos([propia]), [libro.get('LN-617')]);
  });

  test('el lector le pasa AL RECORRIDO la lista avalada, y la cruda ya no aparece', () => {
    const cuerpo = metodo('cargarLinea');
    const limpio = sinComentarios(cuerpo);
    assert.match(limpio, /const avaladas = seriesAvaladas\(series, LIBRO_DE_CODIGOS\)\.series/,
      'la comprobación es pura y está probada, pero solo sirve si el lector la ejecuta');
    assert.match(limpio, /listarLevantamientos\(\s*avaladas\.map\(\(s\) => s\.id\)/,
      'pidiendo por la lista cruda entra el recorrido de otra línea rotulado como del tramo');
    assert.ok(!/listarLevantamientos\(series\.map/.test(limpio),
      'el defecto exacto que se cierra: `listarLevantamientos(series.map((s) => s.id))`');
    assert.ok(limpio.indexOf('const avaladas =') < limpio.indexOf('listarLevantamientos('),
      'se cruza el libro ANTES de pedir: avalar después de traer no ahorra el daño');
    assert.match(FIRESTORE, /import \{[^}]*seriesAvaladas[^}]*\} from '\.\/repositorio'/,
      'sale del módulo puro; una segunda copia de la regla sería una segunda verdad');
  });

  test('el aviso nombra la serie por su CÓDIGO, no por un identificador', () => {
    const cuerpo = metodo('cargarLinea');
    assert.match(sinComentarios(cuerpo), /rotulos: new Map\(avaladas\.map\(\(s\) => \[s\.id, s\.codigo\]\)\)/,
      '«TR-618» se entiende; un UUID en pantalla es jerga y no dice de qué línea habla');
    const lectura = sinComentarios(metodo('listarLevantamientos'));
    assert.match(lectura, /avisoDeTope\?\.rotulos\?\.get\(serieId\) \?\? 'una de las series de esta línea'/,
      'sin rótulo el aviso sale igual, más vago: quedarse callado sería peor');
  });

  // Lo que queda ABIERTO, escrito aquí para que no se pierda: el MISMO cruce
  // falta en los otros dos caminos que piden por serie —las fichas de foto
  // (`firestore.ts`, el bucle `for (const serie of series)` de `evidencias`) y
  // `enlace.ts §levantamientosDeLaLinea`, que vuelve a componer la lista cruda
  // con `seriesDeLinea(...).map((s) => s.id)`—. Hoy no hay ni un tramo cargado,
  // así que no hay daño; el día del alta, sí: las fotos de otra línea saldrían
  // rotuladas como del tramo. Ninguno de los dos entra en este cambio.
  test.todo('las fichas de foto y `enlace.ts` piden por la lista avalada (hoy: por la cruda)');
});

// ════════════════════════════════════════════════════════════════════════════
describe('el tope de la lectura, cuando muerde, se DICE', () => {
  const cuerpo = () => sinComentarios(metodo('listarLevantamientos'));

  test('se pide UNO MÁS del tope: es la única forma de saber si quedó algo fuera', () => {
    assert.match(cuerpo(), /limit\(TOPE_DE_LEVANTAMIENTOS \+ 1\)/,
      'con `limit(50)` a secas, cincuenta leídos pueden ser el final justo o el principio de '
      + 'doscientos, y no hay manera de distinguirlo');
    assert.ok(!/limit\(50\)/.test(cuerpo()), 'el tope tiene nombre; el número suelto era el defecto');
    assert.match(cuerpo(), /if \(s\.docs\.length > TOPE_DE_LEVANTAMIENTOS\)/,
      'el de más solo sirve para poder decirlo');
  });

  test('se ENTREGAN los mismos de antes: pedir 51 no puede cambiar cuánto se trae', () => {
    assert.match(cuerpo(), /s\.docs\.slice\(0, TOPE_DE_LEVANTAMIENTOS\)/,
      'sin el recorte, el documento 51 entraría en la pantalla y esto habría cambiado el dato');
    assert.match(FIRESTORE, /export const TOPE_DE_LEVANTAMIENTOS = 50;/,
      'cincuenta es lo que había: este cambio dice cuándo el tope muerde, no mueve el tope');
  });

  test('⚠️ EL AVISO NO DICE «LOS MÁS RECIENTES», porque la consulta no lleva orden', () => {
    const texto = metodo('listarLevantamientos');
    assert.ok(!/orderBy\(/.test(sinComentarios(texto)),
      'el índice declarado es (orgId, serieId): un orderBy aquí sirve en el emulador y falla en '
      + 'producción (`35 · L-85`)');
    assert.match(texto, /No son «los \$\{TOPE_DE_LEVANTAMIENTOS\} más recientes»/,
      'la fecha se ordena DESPUÉS del recorte: lo que se queda fuera puede ser de la semana pasada, '
      + 'y prometer lo contrario es el cartel que miente');
    assert.match(texto, /puede haberse '\s*\+\s*'quedado fuera alguno reciente/,
      'y se dice en castellano llano lo que eso significa para quien mira la pantalla');
  });

  test('el aviso llega a la PANTALLA, no se queda en la consola', () => {
    const cuerpo_ = sinComentarios(metodo('cargarLinea'));
    assert.match(cuerpo_, /avisar: \(aviso\) => avisosDelTope\.push\(aviso\)/,
      'el canal existe para recogerlo; sin recogerlo, el tope seguiría callado');
    assert.match(cuerpo_, /const avisosDeSeries = \[\.\.\.leido\.avisos, \.\.\.avisosDelTope\]/,
      'sale por donde ya salen los avisos de series: los dos dicen «esto no es todo lo que hay»');
    assert.match(cuerpo_, /avisosDeSeries\.length \? \{ avisosDeSeries \} : \{\}/);

    // Y la lista que la pantalla pinta lo recoge de verdad. `avisosDeDatos` es
    // pura: aquí se ejecuta, no se lee.
    const frase = 'Se han traído 50 recorridos levantados de TR-618 y hay más guardados.';
    const salida = avisosDeDatos({
      fase: 'recorrido', linea: {}, apoyos: [], evidencias: [], investigaciones: [],
      faltan: [], levantamientos: [], avisosDeSeries: [frase],
    });
    assert.deepEqual(salida, [{ clase: 'serie', texto: frase }],
      'un aviso que el reparto no recoge es un aviso que nadie ve');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('lo que NO cambió, y hay que medir para poder decirlo', () => {
  test('quien llama con un solo argumento recibe lo de siempre', () => {
    assert.match(ENLACE, /listarLevantamientos\(seriesDeLinea\(e\.linea\)\.map\(\(s\) => s\.id\)\)/,
      'el segundo argumento es OPCIONAL: el puente no se tocó y tiene que seguir compilando');
    const lectura = sinComentarios(metodo('listarLevantamientos'));
    assert.match(lectura, /avisoDeTope\?: AvisoDeTopeDeRecorridos/,
      'con el `?`, y no sin él: sin el interrogante la firma dejaría de cumplir la del repositorio');
    assert.match(lectura, /return ordenarLevantamientos\(/,
      'el orden se sigue poniendo en el cliente, y sobre lo que llegó');
  });

  test('sin sesión no se inventa ningún recorrido, ni con el canal del aviso puesto', async () => {
    assert.deepEqual(await repositorioSinSesion.listarLevantamientos(['no-importa']), []);
  });

  test('⚠️ el objeto SIGUE comprobándose contra la interfaz del repositorio', () => {
    // `satisfies` en vez de `: Repositorio` es lo que deja ver el segundo
    // argumento desde fuera. Si alguien lo borra «porque sobra», el objeto deja
    // de comprobarse contra la interfaz ENTERA y un método que falte o que
    // cambie de tipo dejaría de dar error aquí: se descubriría en pantalla.
    assert.match(FIRESTORE, /\} satisfies Repositorio;/,
      'sin esta línea, `repositorioFirestore` ya no promete cumplir el repositorio');
    assert.match(FIRESTORE, /export const repositorioFirestore = \{/,
      'y con la anotación de tipo de vuelta, el aviso del tope volvería a ser invisible');
  });
});
