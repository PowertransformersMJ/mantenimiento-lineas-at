// ============================================================================
// tests/codigos-emitidos.test.js — el libro de CÓDIGOS DE SERIE se verifica solo
// ----------------------------------------------------------------------------
// QUÉ DEFIENDE ESTE ARCHIVO. Una SERIE es lo que lleva torres colgando: una
// LÍNEA (`LN-`) o un TRAMO COMPARTIDO (`TR-`), que es el trozo por el que pasan
// dos líneas en la misma torre y donde cada torre se registra UNA sola vez.
//
// El id de una serie es la raíz de todo lo demás: de él cuelgan la ficha de la
// línea, sus torres, sus hipótesis, sus cálculos y sus fotos. Y `firestore.rules`
// no deja borrar líneas, así que un id equivocado no se corrige: se queda. Si
// el id se mueve, nada revienta — el parque enseña una línea vacía y la
// pantalla no da un solo error. Fallo silencioso, el peor que hay.
//
// La regla, en una frase:
//
//     El código de una serie se ELIGE del libro, nunca se teclea; y su id sale
//     de la misma fórmula que ya emitió lo que está en producción.
//
// NO NECESITA LA BÓVEDA, a propósito: tiene que correr en CI, que es justo donde
// la bóveda privada no está montada. Aquí no hay ni una coordenada, ni un nombre
// de instalación, ni una foto: códigos de serie, hashes y fechas.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  ORG_POR_DEFECTO, PREFIJO_DE_TIPO, RUTA_CODIGOS, RUTA_REGISTRO, SEMILLA_DE_TIPO,
  esDiaDelCalendario, idDeLevantamiento, idDeSerie, idEstable, leerCodigos, leerRegistro,
  semillaDeLevantamiento, semillaDeSerie, tipoDeSerie,
} from '../herramientas/identidad.mjs';
import { Id } from '../contratos/src/comunes.ts';

const LIBRO = leerCodigos();
const REGISTRO = leerRegistro();

/** Las claves `_nota`, `_porQue…` son prosa que explica el archivo, no filas. */
const esNota = (clave) => clave.startsWith('_');
const filasDelLibro = () => Object.entries(LIBRO).filter(([c]) => !esNota(c));
const paginasDelRegistro = () => Object.entries(REGISTRO).filter(([c]) => !esNota(c));

// ────────────────────────────────────────────────────────────────────────────
// LOS CUATRO IDS, ESCRITOS A MANO Y LITERALES.
//
// No se derivan de nada dentro del repositorio a propósito: si se calcularan con
// la misma función que se está probando, la prueba diría «lo que hago es lo que
// hago» y pasaría aunque la fórmula cambiara entera.
//
// Si alguno deja de coincidir byte a byte, lo que está mal es el CÓDIGO: no se
// ajusta el valor esperado. El de LN-627 ya está escrito en producción desde el
// 30-07-2026 (lo fija también `tests/sembrar-ficha-de-linea.test.js`).
// ────────────────────────────────────────────────────────────────────────────
const IDS_DE_SERIE = {
  'LN-627': 'f50d70ec-ad33-8af9-8aeb-742e49ed2fab',
  'LN-617': '6d9ca4ca-1734-8823-2b99-7a107ddae99f',
  'LN-628': '85038a14-252b-fcdf-1c0c-c9d5b187f2b6',
  'TR-618': '32987a44-128c-cb40-66e4-ae46604a7c29',
};

/** El tercer testigo: la fórmula escrita aquí a pelo, sin importar ningún módulo. */
const idAPelo = (org, codigo, semilla) =>
  createHash('sha256').update(`${org}|${codigo}|${semilla}`).digest('hex').slice(0, 32)
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');

describe('LOS CUATRO CÓDIGOS — byte a byte, o no se da de alta nada', () => {

  for (const [codigo, id] of Object.entries(IDS_DE_SERIE)) {
    test(`«${codigo}» sigue siendo ${id}`, () => {
      assert.equal(idDeSerie(codigo), id,
        `el id de «${codigo}» se movió. De él cuelgan la ficha, las torres, las hipótesis y las fotos de esa serie, ` +
        'y una línea no se puede borrar. Si esto se pone rojo, lo que está mal es el código: NO se ajusta el valor esperado.');
      assert.equal(LIBRO[codigo].id, id, 'y la fila del libro tiene que decir lo mismo');
    });
  }

  test('la fórmula no se tocó: sha256("org|código|semilla"), 32 hex, con guiones de identificador', () => {
    // Se recalcula aquí, a pelo, sin pasar por el módulo. Si alguien cambiara el
    // algoritmo, el separador, el orden de los trozos o el recorte a 32, esto se
    // pone rojo antes que producción.
    for (const [codigo, id] of Object.entries(IDS_DE_SERIE)) {
      assert.equal(idAPelo('transpower', codigo, LIBRO[codigo].semilla), id);
      assert.equal(idEstable(ORG_POR_DEFECTO, codigo, LIBRO[codigo].semilla), id);
    }
  });

  test('el id de una LÍNEA sigue saliendo de la semilla `linea` — la del sembrador', () => {
    // Es lo que emitió el id de LN-627 que está en producción. Cambiarla movería
    // esa línea entera, con sus 30 puntos y sus 99 fotos detrás.
    for (const codigo of ['LN-627', 'LN-617', 'LN-628']) {
      assert.equal(semillaDeSerie(codigo), 'linea');
      assert.equal(idDeSerie(codigo), idEstable(ORG_POR_DEFECTO, codigo, 'linea'));
    }
  });

  test('el id de un TRAMO usa la MISMA fórmula, con la semilla `tramo`', () => {
    // La decisión está razonada en la cabecera de `herramientas/identidad.mjs`:
    // el código ya va dentro del hash y por sí solo separaría un tramo de una
    // línea, así que la palabra distinta no se elige por miedo a un choque —se
    // elige para que la semilla DIGA qué clase de serie es, y para que una fila
    // que declare `tipo: "tramo"` con semilla de línea se pueda cazar.
    assert.equal(semillaDeSerie('TR-618'), 'tramo');
    assert.equal(idDeSerie('TR-618'), idEstable(ORG_POR_DEFECTO, 'TR-618', 'tramo'));
    // Y no es lo mismo que si se hubiera usado la semilla de una línea: por eso
    // esta decisión no se puede deshacer más tarde sin mover las 28 torres.
    assert.notEqual(idDeSerie('TR-618'), idEstable(ORG_POR_DEFECTO, 'TR-618', 'linea'));
  });

  test('los cuatro ids pasan la validación del molde de los datos', () => {
    // Si esto se rompiera al subir zod, la línea se quedaría VACÍA en pantalla y
    // sin un solo error visible (`web/src/datos/firestore.ts` valida y filtra).
    for (const [codigo, id] of Object.entries(IDS_DE_SERIE)) {
      assert.equal(Id.safeParse(id).success, true, `«${codigo}» (${id}) ya no valida contra el molde`);
    }
  });
});

describe('EL PREFIJO ES OBLIGATORIO — dice si es una línea o un tramo', () => {

  test('toda fila del libro empieza por `LN-` o por `TR-`', () => {
    for (const [codigo] of filasDelLibro()) {
      assert.match(codigo, /^(LN|TR)-/,
        `«${codigo}» no trae prefijo. El prefijo no es decoración: es lo que dice si el documento que se va a escribir es una línea o un tramo.`);
    }
  });

  test('el `tipo` declarado coincide con el prefijo, fila por fila', () => {
    for (const [codigo, fila] of filasDelLibro()) {
      assert.equal(tipoDeSerie(codigo), fila.tipo,
        `«${codigo}» dice ser «${fila.tipo}» pero su prefijo dice otra cosa`);
      assert.ok(codigo.startsWith(PREFIJO_DE_TIPO[fila.tipo]));
    }
  });

  test('la `semilla` declarada es la que le toca a su tipo, fila por fila', () => {
    for (const [codigo, fila] of filasDelLibro()) {
      assert.equal(fila.semilla, SEMILLA_DE_TIPO[fila.tipo],
        `«${codigo}» es un «${fila.tipo}» y su semilla tendría que ser «${SEMILLA_DE_TIPO[fila.tipo]}»`);
      assert.equal(fila.semilla, semillaDeSerie(codigo));
    }
  });

  test('un código SIN prefijo conocido no produce identidad: lanza', () => {
    // El peligro concreto: «618» a secas, que es como lo llama el GPS, o el
    // nombre de pantalla. Derivar de ahí crearía una serie nueva y permanente.
    for (const suelto of ['618', 'TR618', 'ln-617', 'LX-1', '', null, undefined, 42]) {
      assert.throws(() => tipoDeSerie(suelto), /código de serie/,
        `«${suelto}» pasó por código de serie`);
      assert.throws(() => idDeSerie(suelto), /código de serie/);
    }
  });

  test('el prefijo no basta: dos series distintas no se pisan', () => {
    // Series inventadas (L-23: el mundo de prueba no sale de la bóveda).
    assert.notEqual(idDeSerie('LN-1'), idDeSerie('LN-2'));
    assert.notEqual(idDeSerie('LN-9'), idDeSerie('TR-9'),
      'una línea y un tramo con el mismo número tienen que ser dos cosas distintas');
  });
});

describe('EL LIBRO CUADRA CONSIGO MISMO', () => {

  test('cada fila cumple id === idEstable(org, código, semilla)', () => {
    for (const [codigo, fila] of filasDelLibro()) {
      assert.equal(fila.id, idEstable(ORG_POR_DEFECTO, codigo, fila.semilla),
        `la fila de «${codigo}» miente: su id no es el hash de su semilla. O se tocó la fórmula, o se editó una fila ya escrita.`);
    }
  });

  test('son exactamente estos cuatro códigos, ni uno más ni uno menos', () => {
    assert.deepEqual(filasDelLibro().map(([c]) => c).sort(), Object.keys(IDS_DE_SERIE).sort());
  });

  test('toda fila trae las mismas cinco columnas, sin sobras ni huecos', () => {
    // Una columna de menos deja un `undefined` circulando; una de más es un
    // campo que nadie lee y que mañana alguien creerá que manda.
    for (const [codigo, fila] of filasDelLibro()) {
      assert.deepEqual(Object.keys(fila).sort(), ['emitidoEn', 'id', 'origen', 'semilla', 'tipo'],
        `la fila de «${codigo}» no tiene las columnas del libro`);
      assert.match(fila.emitidoEn, /^\d{4}-\d{2}-\d{2}$/, `la fecha de «${codigo}» no es AAAA-MM-DD`);
      assert.ok(fila.origen.length > 20, `«${codigo}» no dice de dónde sale`);
    }
  });

  test('ninguna clave «_» DENTRO de una fila: la autoverificación solo salta las de arriba', () => {
    // Si alguien metiera un `_comentario` dentro de una fila, el bucle de arriba
    // lo trataría como columna y la comprobación de columnas se pondría roja —
    // pero se deja dicho aquí para que el motivo se lea sin deducirlo.
    for (const [codigo, fila] of filasDelLibro()) {
      for (const campo of Object.keys(fila)) {
        assert.ok(!campo.startsWith('_'), `«${codigo}» trae la clave «${campo}»: la prosa va arriba, no dentro de una fila`);
      }
    }
  });

  test('DOS SERIES NUNCA COMPARTEN ID', () => {
    const ids = filasDelLibro().map(([, f]) => f.id);
    assert.equal(new Set(ids).size, ids.length,
      'dos series con el mismo id serían dos líneas peleándose por las mismas torres y las mismas fotos');
  });

  test('el libro está en el repositorio PÚBLICO, junto al de nombres, no en la bóveda', () => {
    assert.ok(RUTA_CODIGOS.includes('herramientas'));
    assert.doesNotMatch(RUTA_CODIGOS, /brain-private/);
  });

  test('el libro no lleva ni una coordenada ni un nombre de instalación', () => {
    // ⚠️ Los nombres de subestación o bahía del cliente NO se escriben aquí ni
    // siquiera para prohibirlos: teclearlos en este archivo sería publicarlos.
    // Se comprueba por FORMA — el libro solo puede contener códigos, tipos,
    // semillas, hashes, fechas y prosa.
    const crudo = readFileSync(RUTA_CODIGOS, 'utf-8');
    for (const [codigo, fila] of filasDelLibro()) {
      assert.match(codigo, /^(LN|TR)-\d{3}$/, 'un código de serie es su prefijo y su número, nada más');
      assert.match(fila.id, /^[0-9a-f-]{36}$/, 'el id es un hash, no un texto de campo');
      assert.match(fila.semilla, /^(linea|tramo)$/);
    }
    assert.doesNotMatch(crudo, /-7[45]\.\d{4}/, 'eso parece una longitud real');
    assert.doesNotMatch(crudo, /\bSSEE\b/i, 'ni una referencia a instalación');
  });

  test('todo el libro es ASCII imprimible salvo la prosa: el código ES parte de la semilla', () => {
    // Un código escrito en NFC o en NFD daría otro sha256 y por tanto otro id.
    for (const [codigo, fila] of filasDelLibro()) {
      assert.match(codigo, /^[\x20-\x7E]+$/, `«${codigo}» tiene un carácter fuera de ASCII y el código ES la semilla`);
      assert.match(fila.semilla, /^[\x20-\x7E]+$/);
    }
  });
});

describe('LO QUE YA ESTÁ ESCRITO NO SE TOCA', () => {

  test('la página de nombres de LN-627 sigue con sus 30 filas', () => {
    assert.equal(Object.keys(REGISTRO['LN-627']).length, 30,
      'el libro de códigos es un archivo NUEVO: no tenía que rozar el de nombres');
  });

  test('LN-627 tiene en el libro el MISMO id que ya está en producción', () => {
    assert.equal(LIBRO['LN-627'].id, 'f50d70ec-ad33-8af9-8aeb-742e49ed2fab');
    assert.equal(LIBRO['LN-627'].emitidoEn, '2026-07-30',
      'su id no se estrenó al nacer este libro: se anotó el que ya estaba desde el 30-07-2026');
  });

  test('TR-618 TODAVÍA NO tiene página de nombres: sus torres no se han emitido', () => {
    // Es la orden del 17-09: las dos líneas entran SIN torres. Lo que hay del
    // recorrido es el LEVANTAMIENTO guardado tal cual, que no es una torre. Los
    // nombres canónicos «TR-618 E07»… se emitirán cuando el Ingeniero declare la
    // función de cada una, y este archivo se pondrá rojo ese día para que quien
    // los emita tenga que pasar por aquí y leer lo que cuesta.
    assert.equal(REGISTRO['TR-618'], undefined,
      'apareció la página de TR-618. Emitir el nombre de una torre es permanente: se hace cuando él declare su función, no antes.');
  });

  test('ninguna de las tres series nuevas tiene página de nombres todavía', () => {
    for (const codigo of ['LN-617', 'LN-628', 'TR-618']) {
      assert.equal(REGISTRO[codigo], undefined, `«${codigo}» ya tiene nombres emitidos y no debería`);
    }
  });
});

describe('DOS PUNTOS NUNCA COMPARTEN ID — en NINGUNA página', () => {

  test('dentro de cada página, ni un id ni una semilla repetidos', () => {
    for (const [codigo, pagina] of paginasDelRegistro()) {
      const filas = Object.entries(pagina).filter(([n]) => !esNota(n));
      const ids = filas.map(([, f]) => f.id);
      assert.equal(new Set(ids).size, ids.length,
        `en «${codigo}» hay dos puntos con el mismo id: serían dos documentos peleándose por las mismas fotos y el mismo expediente`);
      const semillas = filas.map(([, f]) => f.semilla);
      assert.equal(new Set(semillas).size, semillas.length, `en «${codigo}» hay dos puntos con la misma semilla`);
    }
  });

  test('y tampoco entre páginas distintas', () => {
    // Hoy solo hay una página. La prueba se escribe genérica porque el día que
    // nazca la de TR-618 nadie va a volver a este archivo a ampliarla.
    const visto = new Map();
    for (const [codigo, pagina] of paginasDelRegistro()) {
      for (const [nombre, fila] of Object.entries(pagina)) {
        if (esNota(nombre)) continue;
        const antes = visto.get(fila.id);
        assert.equal(antes, undefined,
          `«${codigo} · ${nombre}» comparte id con «${antes}»: dos torres distintas con las mismas fotos`);
        visto.set(fila.id, `${codigo} · ${nombre}`);
      }
    }
  });

  test('ningún punto comparte id con una SERIE', () => {
    // Sería una torre y una línea en el mismo documento. No debería poder pasar
    // —la semilla de un punto lleva `punto:` y la de una serie no—; se comprueba
    // igual, porque el coste de que pase es que no se ve.
    const idsDeSerie = new Set(filasDelLibro().map(([, f]) => f.id));
    for (const [codigo, pagina] of paginasDelRegistro()) {
      for (const [nombre, fila] of Object.entries(pagina)) {
        if (esNota(nombre)) continue;
        assert.ok(!idsDeSerie.has(fila.id), `«${codigo} · ${nombre}» tiene el id de una serie`);
      }
    }
  });
});

describe('EL LEVANTAMIENTO — subir dos veces el mismo archivo no crea dos recorridos', () => {

  // Mundo sintético: serie inventada y huellas fabricadas (L-23). Ni un byte del
  // levantamiento real sale de la bóveda.
  const SERIE = 'TR-9';
  const HUELLA = 'a'.repeat(64);
  const OTRA_HUELLA = `b${'a'.repeat(63)}`;
  const FECHA = '2026-01-02';

  test('la semilla es `levantamiento-<AAAA-MM-DD>-<huella>`, y se lee', () => {
    assert.equal(semillaDeLevantamiento(FECHA, HUELLA), `levantamiento-${FECHA}-${HUELLA}`);
  });

  test('el mismo archivo, la misma fecha y la misma serie dan SIEMPRE el mismo id', () => {
    const primero = idDeLevantamiento(SERIE, FECHA, HUELLA);
    for (let i = 0; i < 100; i += 1) assert.equal(idDeLevantamiento(SERIE, FECHA, HUELLA), primero);
    assert.equal(primero, idAPelo('transpower', SERIE, `levantamiento-${FECHA}-${HUELLA}`));
    assert.equal(Id.safeParse(primero).success, true, 'tiene que valer como identificador del molde');
  });

  test('otro archivo, otra fecha u otra serie dan OTRO id', () => {
    const base = idDeLevantamiento(SERIE, FECHA, HUELLA);
    assert.notEqual(idDeLevantamiento(SERIE, FECHA, OTRA_HUELLA), base, 'otro archivo tiene que ser otro recorrido');
    assert.notEqual(idDeLevantamiento(SERIE, '2026-01-03', HUELLA), base, 'otra jornada tiene que ser otro recorrido');
    assert.notEqual(idDeLevantamiento('LN-9', FECHA, HUELLA), base, 'el levantamiento de otra serie no puede caer encima');
  });

  test('un levantamiento no puede caer encima de la serie a la que pertenece', () => {
    assert.notEqual(idDeLevantamiento('TR-618', FECHA, HUELLA), IDS_DE_SERIE['TR-618']);
  });

  test('una fecha o una huella con mala forma LANZAN, no producen un id cualquiera', () => {
    // El fallo que esto cierra: un `undefined` que se cuela da el hash de la
    // cadena «undefined» — un id con forma perfecta, repetible, y apuntando al
    // documento equivocado. Nadie lo ve nunca.
    for (const malaFecha of [undefined, null, '', '09-08-2026', '2026-8-9', '2026-01-02T10:52:46Z', 20260102]) {
      assert.throws(() => semillaDeLevantamiento(malaFecha, HUELLA), /AAAA-MM-DD/,
        `la fecha «${malaFecha}» pasó el filtro`);
    }
    for (const malaHuella of [undefined, null, '', 'abc', HUELLA.toUpperCase(), `${HUELLA}a`, 'z'.repeat(64)]) {
      assert.throws(() => semillaDeLevantamiento(FECHA, malaHuella), /sha256 de 64/,
        `la huella «${malaHuella}» pasó el filtro`);
    }
  });

  test('UNA FECHA CON BUENA FORMA PERO IMPOSIBLE TAMBIÉN LANZA: el 31 de febrero no existe', () => {
    // Estos tres pasaban el filtro de forma y acuñaban un identificador PERMANENTE
    // con una fecha que no existe. Lo que costaba: el documento no se puede borrar,
    // su fecha no se puede reescribir —la regla solo deja mover la nota— y la lista
    // se ordena por TEXTO, así que un «9999-…» se queda para siempre arriba como el
    // recorrido más reciente. No hay forma de corregirlo: solo poner otro encima.
    for (const imposible of ['2026-02-31', '2026-13-01', '0000-99-99']) {
      assert.throws(() => semillaDeLevantamiento(imposible, HUELLA), /no es un día que exista/,
        `la fecha «${imposible}» pasó el filtro y quedaría dentro de un id que no se puede borrar`);
      assert.throws(() => idDeLevantamiento(SERIE, imposible, HUELLA), /no es un día que exista/);
    }
    for (const imposible of ['2026-00-10', '2026-09-00', '2026-04-31', '2026-02-30', '2026-01-32']) {
      assert.throws(() => semillaDeLevantamiento(imposible, HUELLA), /no es un día que exista/);
    }
  });

  test('y los días REALES siguen pasando — no se apretó de más', () => {
    // El riesgo del arreglo es el contrario: dejar al Ingeniero sin poder cargar una
    // jornada buena. Los bisiestos son donde se falla al contar a mano.
    for (const real of ['2026-09-10', '2024-02-29', '2000-02-29', '2026-12-31', '0001-01-01']) {
      assert.equal(semillaDeLevantamiento(real, HUELLA), `levantamiento-${real}-${HUELLA}`);
    }
    // La regla del 400: 2000 sí es bisiesto, 1900 y 2100 no.
    assert.throws(() => semillaDeLevantamiento('1900-02-29', HUELLA), /no es un día que exista/);
    assert.throws(() => semillaDeLevantamiento('2100-02-29', HUELLA), /no es un día que exista/);
    // El año 0 SÍ es bisiesto (0 % 400 === 0). Con `new Date` saldría 1900 y diría
    // que no: por eso la cuenta se hace a mano y no con `Date`.
    assert.equal(semillaDeLevantamiento('0000-02-29', HUELLA), `levantamiento-0000-02-29-${HUELLA}`);
  });

  test('los ids que YA daba una fecha válida no se movieron', () => {
    // Apretar la validación no puede cambiar la fórmula: si un id se moviera, el
    // recorrido cargado ayer quedaría colgando de un identificador que ya no existe.
    assert.equal(
      idDeLevantamiento(SERIE, FECHA, HUELLA),
      idAPelo('transpower', SERIE, `levantamiento-${FECHA}-${HUELLA}`),
    );
  });
});

describe('LAS DOS FÓRMULAS DAN LO MISMO — la de consola y la del navegador', () => {
  // Desde ADR-031 hay dos implementaciones de la misma fórmula:
  // `herramientas/identidad.mjs` con `node:crypto` (síncrona, solo Node) e
  // `importar/identidad.js` con `crypto.subtle` (asíncrona, igual en Node y en
  // el navegador). El peligro no es acuñar: es que DIVERJAN. Su desacuerdo no
  // rompe nada visible — escribe el mismo recorrido dos veces, o da de alta una
  // línea con un id que el resto del sistema no reconoce.

  test('serie y levantamiento: las dos dan el mismo identificador', async () => {
    const nav = await import('@lineas/importar/identidad');

    for (const codigo of [...Object.keys(IDS_DE_SERIE), 'LN-9', 'TR-9']) {
      assert.equal(await nav.idDeSerie(codigo), idDeSerie(codigo),
        `las dos fórmulas discrepan en la serie «${codigo}»`);
      assert.equal(nav.semillaDeSerie(codigo), semillaDeSerie(codigo));
      assert.equal(nav.tipoDeSerie(codigo), tipoDeSerie(codigo));
    }

    const huellas = Array.from({ length: 6 }, (_, i) => String.fromCharCode(97 + i).repeat(64));
    for (const h of huellas) {
      assert.equal(
        await nav.idDeLevantamiento('TR-9', '2026-01-02', h, 'org-inventada'),
        idDeLevantamiento('TR-9', '2026-01-02', h, 'org-inventada'),
        'las dos fórmulas discrepan en el id de un levantamiento',
      );
      assert.equal(nav.semillaDeLevantamiento('2026-01-02', h), semillaDeLevantamiento('2026-01-02', h));
    }

    // Y las tablas que las dos usan para decidir la semilla.
    assert.deepEqual(nav.PREFIJO_DE_TIPO, PREFIJO_DE_TIPO);
    assert.deepEqual(nav.SEMILLA_DE_TIPO, SEMILLA_DE_TIPO,
      'si las semillas por tipo divergen, los ids divergen aunque la fórmula sea idéntica');
  });

  test('LA FECHA IMPOSIBLE SE CAE EN LAS DOS, y el calendario dice lo mismo día a día', async () => {
    const nav = await import('@lineas/importar/identidad');
    // Que una de las dos apriete y la otra no sería peor que si no apretara
    // ninguna: la consola rechazaría lo que el navegador ya escribió, o al revés,
    // y el desacuerdo no rompe nada visible.
    const huella = 'c'.repeat(64);   // fabricada aquí: este bloque no comparte la de arriba
    for (const imposible of ['2026-02-31', '2026-13-01', '0000-99-99', '2026-04-31', '1900-02-29']) {
      assert.throws(() => semillaDeLevantamiento(imposible, huella), /no es un día que exista/);
      assert.throws(() => nav.semillaDeLevantamiento(imposible, huella), /no es un día que exista/,
        `el navegador dejó pasar «${imposible}» que la consola rechaza`);
    }

    // Y el calendario entero de un año bisiesto y de uno que no lo es, día a día:
    // las dos cuentas tienen que decir lo mismo en los 732 casos y en los 32 × 13
    // que no existen.
    for (const anio of [2024, 2026]) {
      for (let mes = 0; mes <= 13; mes += 1) {
        for (let dia = 0; dia <= 32; dia += 1) {
          const f = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
          assert.equal(nav.esDiaDelCalendario(f), esDiaDelCalendario(f),
            `las dos cuentas del calendario discrepan en «${f}»`);
        }
      }
    }
  });

  test('el navegador BUSCA el id en el libro; no lo calcula', async () => {
    const { idDelLibro, codigosDelLibro, filaDelLibro } = await import('@lineas/importar/identidad');

    // La lista del alta sale del libro y salta la prosa.
    assert.deepEqual(codigosDelLibro(LIBRO), Object.keys(LIBRO).filter((c) => !esNota(c)));
    for (const [codigo, id] of Object.entries(IDS_DE_SERIE)) {
      assert.equal(idDelLibro(LIBRO, codigo), id);
      assert.equal(filaDelLibro(LIBRO, codigo).tipo, LIBRO[codigo].tipo);
    }
  });

  test('un código que no está en el libro NO se estrena desde la pantalla: lanza', async () => {
    const { idDelLibro, filaDelLibro } = await import('@lineas/importar/identidad');
    // El dedazo concreto que esto cierra: un cero de más. `firestore.rules` no
    // deja borrar líneas, así que esa línea fantasma se quedaría para siempre.
    for (const inexistente of ['LN-6280', 'LN-618', 'TR-617', '618', 'constructor', 'toString', '_nota']) {
      assert.equal(filaDelLibro(LIBRO, inexistente), undefined);
      assert.throws(() => idDelLibro(LIBRO, inexistente), /libro de códigos/,
        `«${inexistente}» se coló como código de serie`);
    }
    assert.throws(() => idDelLibro(null, 'LN-617'), /libro de códigos/);
    assert.throws(() => idDelLibro({ 'LN-1': { id: 'esto-no-es-un-id' } }, 'LN-1'), /forma de identificador/);
  });

  test('leer el libro no lo modifica', async () => {
    const { idDelLibro, codigosDelLibro } = await import('@lineas/importar/identidad');
    const copia = JSON.parse(JSON.stringify(LIBRO));
    codigosDelLibro(copia).forEach((c) => idDelLibro(copia, c));
    Object.keys(IDS_DE_SERIE).forEach((c) => idDeSerie(c));
    assert.deepEqual(copia, LIBRO, 'resolver un id no puede escribir en el libro');
  });
});
