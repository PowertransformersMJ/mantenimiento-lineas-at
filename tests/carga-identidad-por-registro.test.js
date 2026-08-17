// ============================================================================
// tests/carga-identidad-por-registro.test.js — el navegador BUSCA el id, no lo calcula
// ----------------------------------------------------------------------------
// QUÉ DEFIENDE ESTE ARCHIVO, en una frase:
//
//     Lo que la pantalla de carga resuelve por BÚSQUEDA tiene que dar
//     exactamente el mismo identificador que la fórmula que ya emitió los que
//     están escritos en producción. Si alguna vez difieren, se descubre aquí y
//     no en la base.
//
// POR QUÉ IMPORTA TANTO. El id de un punto es el único enlace entre ese punto y
// sus fotos, y entre ese punto y el expediente de su falla. Si el navegador
// calculara el id con una segunda fórmula, las dos coincidirían mientras nadie
// tocara ninguna — y el día que divergieran no reventaría nada visible: se
// escribirían documentos con id nuevo, las fotos se quedarían colgando del
// viejo y la pantalla dibujaría dos puntos donde hay uno. Fallo silencioso.
//
// Aquí se atan las dos: `idDelRegistro` (búsqueda, la del navegador) contra
// `idDePunto` (sha256 de `node:crypto`, la del repositorio), fila por fila.
// Tocar cualquiera de las dos, o editar una fila ya emitida, pone esto rojo.
//
// ⚠️ CERO DATOS DE CLIENTE. El registro de nombres ya vive en el repositorio
// público y sus filas solo contienen nombres canónicos, semillas y hashes (lo
// vigila `tests/identidad-apoyos.test.js`). Aquí no se escribe ni una
// coordenada, ni una hora de captura, ni un nombre de instalación: los mundos
// de prueba son sintéticos y sus líneas se llaman LX-…
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  idDelRegistro, filaDelRegistro, nombresDelRegistro, nombresDisponibles, ORG_POR_DEFECTO,
} from '../importar/identidad.js';
import { idDePunto, idEstable, leerRegistro } from '../herramientas/identidad.mjs';

const LINEA = 'LN-627';
const REGISTRO = leerRegistro();

/**
 * Un registro inventado, para las esquinas que el real no puede tener porque
 * está sano. Sus ids se acuñan con la MISMA fórmula del repositorio: un id de
 * mentira con forma equivocada haría pasar por bueno un cambio de formato.
 */
const registroSintetico = (linea, nombres) => ({
  _nota: 'mundo sintético de prueba — ni un dato real',
  [linea]: Object.fromEntries(nombres.map((n) => [n, {
    semilla: `punto:${n}`,
    id: idEstable(ORG_POR_DEFECTO, linea, `punto:${n}`),
  }])),
});

// ════════════════════════════════════════════════════════════════════════════
describe('BUSCAR Y CALCULAR DAN LO MISMO — fila por fila, sin excepción', () => {

  const filas = Object.entries(REGISTRO[LINEA]);

  test('el registro trae las 28 filas emitidas de esta línea', () => {
    assert.equal(filas.length, 28,
      '26 de julio + los 2 aprobados en agosto. Si esta cuenta cambia, cambió el registro y hay que mirar por qué.');
  });

  for (const [nombre, fila] of filas) {
    test(`«${nombre}»: búsqueda === fórmula === lo escrito`, () => {
      // Las tres tienen que ser el MISMO valor. Se comprueban por separado para
      // que el mensaje diga cuál de las dos se movió.
      assert.equal(idDelRegistro(LINEA, nombre, REGISTRO), fila.id,
        'la búsqueda no devuelve el id que está escrito en la fila');
      assert.equal(idDelRegistro(LINEA, nombre, REGISTRO), idDePunto(LINEA, nombre),
        `el id que resolvería la pantalla ya no es el que produce la fórmula del repositorio. ` +
        'Se escribirían documentos nuevos y las fotos de este punto se quedarían huérfanas, sin un solo error visible.');
    });
  }

  test('la búsqueda no depende del orden ni de cuántas veces se llame', () => {
    const nombres = nombresDelRegistro(REGISTRO, LINEA);
    const alDerecho = nombres.map((n) => idDelRegistro(LINEA, n, REGISTRO));
    const alReves = [...nombres].reverse().map((n) => idDelRegistro(LINEA, n, REGISTRO));
    assert.deepEqual(alReves, [...alDerecho].reverse());
    const uno = idDelRegistro(LINEA, nombres[0], REGISTRO);
    for (let i = 0; i < 200; i += 1) assert.equal(idDelRegistro(LINEA, nombres[0], REGISTRO), uno);
  });

  test('resolver un id NO escribe en el registro que recibe', () => {
    // Una función que «resuelve» mutando acabaría emitiendo identidad de tapadillo.
    const copia = JSON.parse(JSON.stringify(REGISTRO));
    for (const n of nombresDelRegistro(copia, LINEA)) idDelRegistro(LINEA, n, copia);
    assert.deepEqual(copia, REGISTRO);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('LO QUE NO ESTÁ ANOTADO NO SE INVENTA — se para con el motivo escrito', () => {

  test('un nombre que nunca se anotó LANZA, y dice qué hay que hacer', () => {
    assert.throws(
      () => idDelRegistro(LINEA, 'LN-627 PORTICO ORIGEN', REGISTRO),
      /no está en el registro/,
      'devolver algo aquí sería estrenar identidad permanente desde el navegador',
    );
    // El mensaje no es decorativo: es lo único que el Ingeniero va a leer.
    try {
      idDelRegistro(LINEA, 'LN-627 PORTICO ORIGEN', REGISTRO);
    } catch (err) {
      assert.match(err.message, /anotarlo en el libro de nombres/);
      assert.match(err.message, /repositorio/);
    }
  });

  test('sin registro no se resuelve nada: no hay camino silencioso', () => {
    assert.throws(() => idDelRegistro(LINEA, 'LN-627 E01', undefined), /No se recibió el registro/);
    assert.throws(() => idDelRegistro(LINEA, 'LN-627 E01', null), /No se recibió el registro/);
  });

  test('una línea desconocida no hereda los nombres de otra', () => {
    assert.throws(() => idDelRegistro('LX-999', 'LN-627 E01', REGISTRO), /no está en el registro/);
    assert.deepEqual(nombresDelRegistro(REGISTRO, 'LX-999'), []);
  });

  test('las claves de prosa del registro (`_nota`…) no son nombres de punto', () => {
    // El registro se explica a sí mismo en claves que empiezan por guion bajo.
    // Si se colaran como nombres, el desplegable ofrecería cargar «_nota».
    assert.ok(Object.keys(REGISTRO).some((k) => k.startsWith('_')), 'el registro sí tiene notas');
    for (const n of nombresDelRegistro(REGISTRO, LINEA)) assert.doesNotMatch(n, /^_/);
    assert.equal(filaDelRegistro(LINEA, '_nota', REGISTRO), undefined);
  });

  test('un nombre heredado de JavaScript no pasa por fila válida', () => {
    // `pagina['toString']` devuelve una función si se consulta a la ligera, y
    // esa función pasaría por «fila encontrada» sin id ninguno.
    for (const hostil of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      assert.equal(filaDelRegistro(LINEA, hostil, REGISTRO), undefined);
      assert.throws(() => idDelRegistro(LINEA, hostil, REGISTRO), /no está en el registro/);
    }
  });

  test('una fila SIN id, o con un id deforme, se declara corrupta y se para', () => {
    // No es teoría: una fila a medias devolvería `undefined`, y un documento con
    // id indefinido no se escribe mal — se escribe en OTRO sitio.
    const roto = registroSintetico('LX-001', ['LX-001 A01']);
    roto['LX-001']['LX-001 A02'] = { semilla: 'punto:LX-001 A02' };            // sin id
    roto['LX-001']['LX-001 A03'] = { semilla: 'punto:LX-001 A03', id: 'E03' }; // id de campo
    assert.equal(idDelRegistro('LX-001', 'LX-001 A01', roto), idEstable(ORG_POR_DEFECTO, 'LX-001', 'punto:LX-001 A01'));
    assert.throws(() => idDelRegistro('LX-001', 'LX-001 A02', roto), /registro está corrupto/);
    assert.throws(() => idDelRegistro('LX-001', 'LX-001 A03', roto), /registro está corrupto/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('EL DESPLEGABLE SOLO PUEDE OFRECER LO QUE EXISTE Y FALTA', () => {

  test('sin nada cargado, ofrece los 28 nombres anotados', () => {
    assert.equal(nombresDisponibles(REGISTRO, LINEA, []).length, 28);
  });

  test('lo ya cargado desaparece de la lista — dé el nombre o dé el documento', () => {
    // La pantalla le pasará los apoyos tal como están en la base; las pruebas,
    // a veces solo los nombres. Las dos formas tienen que valer.
    const porTexto = nombresDisponibles(REGISTRO, LINEA, ['LN-627 E01', 'LN-627 E02']);
    const porDocumento = nombresDisponibles(REGISTRO, LINEA, [
      { nombreNormalizado: 'LN-627 E01' }, { nombreNormalizado: 'LN-627 E02' },
    ]);
    assert.deepEqual(porTexto, porDocumento);
    assert.equal(porTexto.length, 26);
    assert.ok(!porTexto.includes('LN-627 E01'));
    assert.ok(porTexto.includes('LN-627 PORTICO FIN'), 'lo aprobado y no cargado sigue ofreciéndose');
  });

  test('un punto que solo trae nombre de campo también cuenta como cargado', () => {
    const libres = nombresDisponibles(REGISTRO, LINEA, [{ nombreCampo: 'LN-627 E01' }]);
    assert.ok(!libres.includes('LN-627 E01'));
  });

  test('el desplegable NUNCA puede ofrecer un nombre sin id: todo lo que ofrece se resuelve', () => {
    // Es la garantía que hace imposible el error de teclear un nombre nuevo:
    // si está en la lista, la carga no se va a parar por identidad.
    for (const n of nombresDisponibles(REGISTRO, LINEA, [])) {
      assert.match(idDelRegistro(LINEA, n, REGISTRO), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }
  });

  test('«LN-627 PORTICO ORIGEN» no está en el registro, y por tanto tampoco en el desplegable', () => {
    assert.equal(REGISTRO[LINEA]['LN-627 PORTICO ORIGEN'], undefined,
      'una fila del registro significa «esto ya existe y sostiene fotos». El pórtico de origen todavía no.');
    assert.ok(!nombresDisponibles(REGISTRO, LINEA, []).includes('LN-627 PORTICO ORIGEN'));
  });

  test('el orden de la lista es el de EMISIÓN, que es el del recorrido — no alfabético', () => {
    // Alfabéticamente «LN-627 EMP E05-E06» iría antes que «LN-627 E06», y el
    // Ingeniero leería la lista al revés de como recorrió la línea.
    const nombres = nombresDelRegistro(REGISTRO, LINEA);
    assert.deepEqual(nombres, Object.keys(REGISTRO[LINEA]));
    assert.notDeepEqual(nombres, [...nombres].sort());
  });
});
