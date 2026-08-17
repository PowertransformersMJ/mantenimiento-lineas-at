// ============================================================================
// tests/carga-nombre-no-emitido.test.js — desde el navegador NO se estrena identidad
// ----------------------------------------------------------------------------
// LA REGLA QUE DEFIENDE:
//
//     La aplicación solo puede cargar puntos cuyo nombre YA está anotado en el
//     libro del repositorio. Un nombre nunca usado se para en seco, con el
//     motivo escrito. No hay atajo, ni valor por defecto, ni «como no está, lo
//     calculo».
//
// POR QUÉ ES LA PIEZA QUE SOSTIENE TODO LO DEMÁS. El identificador de un punto
// es permanente y es el único enlace con sus fotos y con el expediente de su
// falla. Acuñar uno desde una pantalla significa que un error de tecleo crea un
// punto nuevo, invisible, que nadie va a echar de menos — y que no se puede
// borrar, porque la base no permite borrar apoyos a nadie.
//
// LO QUE ESTO LE CUESTA AL INGENIERO, dicho sin adornos: estrenar un nombre
// exige anotarlo antes en el repositorio, con su commit. Es el único punto donde
// este diseño le cobra algo, y se prueba aquí precisamente para que nadie lo
// «arregle» más adelante sin darse cuenta de lo que estaría abriendo.
//
// EL CASO REAL QUE LO MOTIVA: «LN-627 PORTICO ORIGEN». El Ingeniero ordenó
// verificarlo en campo antes de cargarlo, así que su nombre NO está emitido.
// Mientras no lo esté, esta prueba garantiza que la pantalla no puede cargarlo
// por accidente.
//
// ⚠️ Coordenadas y horas, TODAS inventadas. Los nombres canónicos ya son
// públicos (viven en el registro del repositorio); no lo son las coordenadas.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { construirPuntoNuevo } from '../importar/punto.js';
import { planDeCarga } from '../importar/plan.js';
import { idDelRegistro } from '../importar/identidad.js';
import { idEstable, leerRegistro, ORG_POR_DEFECTO } from '../herramientas/identidad.mjs';

const LINEA = 'LN-627';
const REGISTRO = leerRegistro();
const LINEA_ID = idEstable(ORG_POR_DEFECTO, LINEA, 'linea');

/** Tres estructuras inventadas sobre un meridiano que no existe en el mapa. */
const apoyo = (nombre, orden, lat, funcion) => ({
  id: idDelRegistro(LINEA, nombre, REGISTRO),
  orgId: ORG_POR_DEFECTO,
  creadoEn: '2026-01-01T00:00:00.000Z',
  creadoPor: 'uid-de-prueba',
  revision: 0,
  tipo: 'apoyo',
  lineaId: LINEA_ID,
  orden,
  tipoPunto: 'Estructura',
  nombreCampo: nombre,
  nombreNormalizado: nombre,
  coordenada: { lat, lon: -70, sistemaReferencia: 'WGS84', metodo: 'gps_mano', precision_m: 8 },
  funcionEstructural: funcion,
  funcionProcedencia: 'confirmado_humano',
  deflexion_grados: null,
  condicion: 'Sin evaluar',
  activo: true,
});

const BASE = [
  apoyo('LN-627 E01', 0, 5.0000, 'Terminal'),
  apoyo('LN-627 E02', 1, 5.0010, 'Suspensión'),
  apoyo('LN-627 E03', 2, 5.0020, 'Terminal'),
];

const OPC = {
  codigoLinea: LINEA,
  creadoPor: 'uid-del-ingeniero',
  registro: REGISTRO,
  ahora: '2026-08-17T12:00:00.000Z',
};

/** Una decisión APROBADA y por lo demás perfecta: lo único que falla es el nombre. */
const decision = (nombreCanonico) => ({
  nombreCanonico,
  nombreCampo: 'GRABADO EN EL APARATO',
  estado: 'aprobado',
  tipoPunto: 'Estructura',
  funcionEstructural: 'Terminal',
  lat: 5.0030,
  lon: -70,
  insertarAlFinal: true,
});

// ════════════════════════════════════════════════════════════════════════════
describe('UN NOMBRE NO ANOTADO SE PARA EN SECO', () => {

  test('«LN-627 PORTICO ORIGEN», aprobado y todo, no se puede cargar', () => {
    assert.throws(() => construirPuntoNuevo(BASE, decision('LN-627 PORTICO ORIGEN'), OPC),
      /no está en el registro/,
      'si esto deja de lanzar, la aplicación puede estrenar identidad permanente sin que nadie la revise');
  });

  test('y no es que esté mal escrito: ese nombre NO está en el libro', () => {
    assert.equal(REGISTRO[LINEA]['LN-627 PORTICO ORIGEN'], undefined,
      'una fila en el registro significa «esto ya existe y sostiene fotos». El pórtico de origen todavía no.');
  });

  test('el mensaje dice qué hacer, no solo que no se puede', () => {
    // Es lo único que va a leer el Ingeniero. Un «error de validación» le deja
    // sin saber si el problema es suyo, del archivo o del programa.
    try {
      construirPuntoNuevo(BASE, decision('LN-627 PORTICO ORIGEN'), OPC);
      assert.fail('tenía que haber lanzado');
    } catch (err) {
      assert.match(err.message, /LN-627 PORTICO ORIGEN/, 'nombra el punto: puede haber varios en la pantalla');
      assert.match(err.message, /anotarlo en el libro de nombres/);
      assert.match(err.message, /repositorio/);
      assert.match(err.message, /fotos/, 'y dice por qué la regla existe, no solo que existe');
    }
  });

  test('los nombres PARECIDOS tampoco se cuelan', () => {
    // Un dedo torpe, una tilde, un espacio de más: ninguno abre la puerta. El
    // nombre ES la semilla del identificador, y un carácter distinto daría otro
    // id — otro punto, con otras fotos, para siempre.
    for (const parecido of [
      'LN-627 E25', 'LN-627 PORTICO', 'LN-627 PORTICO  ORIGEN', 'LN-627 PÓRTICO ORIGEN',
      'ln-627 portico origen', 'LN-627 E01 ', ' LN-627 E01', 'LN-627E01', '',
    ]) {
      assert.throws(() => construirPuntoNuevo(BASE, decision(parecido), OPC), /no está en el registro/,
        `«${parecido}» se coló como nombre válido`);
    }
  });

  test('sin nombre canónico tampoco se construye nada', () => {
    assert.throws(() => construirPuntoNuevo(BASE, { ...decision('x'), nombreCanonico: undefined }, OPC),
      /no está en el registro/);
  });

  test('sin el libro delante no se resuelve nada, aunque el nombre sea correcto', () => {
    assert.throws(() => construirPuntoNuevo(BASE, decision('LN-627 E04'), { ...OPC, registro: undefined }),
      /No se recibió el registro/);
  });

  test('un nombre anotado SÍ se carga: la puerta está cerrada, no tapiada', () => {
    const r = construirPuntoNuevo(BASE, decision('LN-627 PORTICO FIN'), OPC);
    assert.equal(r.documento.id, REGISTRO[LINEA]['LN-627 PORTICO FIN'].id);
    assert.equal(r.documento.nombreNormalizado, 'LN-627 PORTICO FIN');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('EN EL PLAN: lo que no se puede cargar se DECLARA, y no arrastra a lo bueno', () => {

  const plan = planDeCarga(BASE, [
    { ...decision('LN-627 E04'), insertarAlFinal: true },
    { ...decision('LN-627 PORTICO ORIGEN'), nombreCampo: 'MARCA 12', insertarAlFinal: true },
  ], OPC);

  test('el bueno se carga y el imposible sale en `bloqueados`, no en un error de pantalla', () => {
    assert.equal(plan.documentos.length, 1);
    assert.equal(plan.documentos[0].nombreNormalizado, 'LN-627 E04');
    assert.equal(plan.bloqueados.length, 1);
    assert.equal(plan.bloqueados[0].nombreCanonico, 'LN-627 PORTICO ORIGEN');
    assert.equal(plan.bloqueados[0].nombreCampo, 'MARCA 12',
      'con el nombre del aparato, que es como él lo va a reconocer en la lista');
  });

  test('el motivo entero viaja hasta la pantalla, sin recortar', () => {
    assert.match(plan.bloqueados[0].motivo, /no está en el registro/);
    assert.match(plan.bloqueados[0].motivo, /anotarlo en el libro de nombres/);
  });

  test('NO se acuña ningún id para el bloqueado: no queda rastro de identidad inventada', () => {
    // Lo que se comprueba es que el documento nunca llega a existir. Si algún
    // día alguien «resolviera» esto calculando el hash, aquí aparecería un
    // segundo documento y esta prueba se pondría roja.
    assert.equal(plan.documentos.length, 1);
    for (const d of plan.documentos) assert.notEqual(d.nombreNormalizado, 'LN-627 PORTICO ORIGEN');
  });

  test('las cifras del DESPUÉS no cuentan el bloqueado', () => {
    assert.equal(plan.antes.puntos, 3);
    assert.equal(plan.despues.puntos, 4, 'entra el aprobado y anotado; el otro no');
  });

  test('un plan entero de nombres no anotados no escribe nada y no revienta', () => {
    const nada = planDeCarga(BASE, [decision('LN-627 PORTICO ORIGEN'), decision('LN-627 E99')], OPC);
    assert.deepEqual(nada.documentos, []);
    assert.equal(nada.bloqueados.length, 2);
    assert.deepEqual(nada.antes, nada.despues);
  });
});
