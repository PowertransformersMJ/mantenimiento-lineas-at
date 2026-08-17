// ============================================================================
// tests/carga-sin-indefinidos.test.js — la clave que no tiene valor NO EXISTE
// ----------------------------------------------------------------------------
// LA REGLA QUE DEFIENDE:
//
//     Si el GPS no grabó la cota o la hora, el documento que se manda a la base
//     NO lleva esa clave. Ni con `undefined`, ni con `null`, ni con un cero.
//
// POR QUÉ ES UNA PRUEBA Y NO UN DETALLE. Son dos fallos distintos, y los dos
// caros:
//
//   1. EL CERO. Un aparato que no grabó la altura no grabó un cero: grabó nada.
//      Un cero se parece demasiado a «nivel del mar», entra en un cálculo sin
//      que nadie lo note y sale por el otro lado convertido en un gálibo. La
//      pantalla declara el hueco; no lo tapa.
//
//   2. EL `undefined`. El sembrador corría desde la máquina del Ingeniero con la
//      opción que se traga las claves sin valor, así que allí no molestaban. El
//      SDK del navegador hace lo contrario: LANZA. Y como la escritura va en un
//      lote atómico, un solo `undefined` tumba la carga entera y el mensaje no
//      dice cuál de los documentos lo causó.
//
// LO QUE SÍ SE MANDA ES EL NULO DECLARADO de la deflexión, y es a propósito: el
// sistema la recalcula sobre las estructuras cada vez que dibuja, y guardarla
// como nula explícita impide que alguien la confunda con una medida de campo.
//
// ⚠️ EL GPX DE PRUEBA LO GENERA EL PROPIO REPOSITORIO sobre puntos inventados.
// Ni una coordenada, ni una hora, ni un nombre del levantamiento real.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { leerGpx } from '../importar/gpx.js';
import { construirPuntoNuevo } from '../importar/punto.js';
import { planDeCarga } from '../importar/plan.js';
import { derivarLevantamiento } from '../exportar/levantamiento.js';
import { generarGpx } from '../exportar/gpx.js';
import { idEstable, ORG_POR_DEFECTO } from '../herramientas/identidad.mjs';
import { Apoyo } from '../contratos/src/activos.ts';

const LINEA = 'LX-001';
const LINEA_ID = idEstable(ORG_POR_DEFECTO, LINEA, 'linea');
const NOMBRES = ['LX-001 A01', 'LX-001 A02', 'LX-001 A03', 'LX-001 M1', 'LX-001 M2', 'LX-001 M3'];
const REGISTRO = {
  [LINEA]: Object.fromEntries(NOMBRES.map((n) => [n, {
    semilla: `punto:${n}`, id: idEstable(ORG_POR_DEFECTO, LINEA, `punto:${n}`),
  }])),
};

const apoyo = (nombre, orden, lat, extraCoordenada = {}) => ({
  id: REGISTRO[LINEA][nombre].id,
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
  coordenada: { lat, lon: -70, sistemaReferencia: 'WGS84', metodo: 'gps_mano', precision_m: 8, ...extraCoordenada },
  funcionEstructural: orden === 0 ? 'Terminal' : 'Suspensión',
  funcionProcedencia: 'confirmado_humano',
  deflexion_grados: null,
  condicion: 'Sin evaluar',
  activo: true,
});

// Tres puntos: uno con cota y hora, uno sin nada de eso, y uno con cota CERO
// —que es un dato de verdad y tiene que sobrevivir.
const BASE = [
  apoyo('LX-001 A01', 0, 5.0000, { cotaTerreno_m: 41.7, tomadaEn: '2026-03-04T10:15:00.000Z' }),
  apoyo('LX-001 A02', 1, 5.0010),
  apoyo('LX-001 A03', 2, 5.0020, { cotaTerreno_m: 0 }),
];

// ── El archivo del GPS, generado por el exportador de este mismo repositorio ──
const GPX = generarGpx(
  { codigo: LINEA, nombre: 'Línea sintética de prueba', tensionNominal_kV: 66 },
  derivarLevantamiento(BASE),
  { generadoEn: '2026-08-17T09:00:00-05:00' },
);
const LEIDO = leerGpx(GPX);
const wpt = (nombre) => LEIDO.waypoints.find((p) => p.nombreCampo === nombre);

const OPC = {
  codigoLinea: LINEA, creadoPor: 'uid-del-ingeniero', registro: REGISTRO,
  ahora: '2026-08-17T12:00:00.000Z', lineaId: LINEA_ID,
};

/** Convierte un waypoint leído en una decisión aprobada, sin rellenar nada. */
const desdeWaypoint = (nombreCampo, nombreCanonico, extra = {}) => {
  const p = wpt(nombreCampo);
  return {
    nombreCanonico,
    nombreCampo: p.nombreCampo,
    estado: 'aprobado',
    tipoPunto: 'Estructura',
    funcionEstructural: 'Suspensión',
    lat: p.lat,
    lon: p.lon,
    // Se pasa lo que el archivo traía, tal cual: si no traía nada, aquí llega
    // `undefined`, que es justo el caso que esta prueba vigila.
    ele: p.ele,
    utc: p.utc,
    insertarAlFinal: true,
    ...extra,
  };
};

/** Recorre un documento entero y devuelve las rutas cuyo valor es `undefined`. */
const rutasIndefinidas = (obj, prefijo = '') => Object.entries(obj).flatMap(([k, v]) => {
  const ruta = prefijo ? `${prefijo}.${k}` : k;
  if (v === undefined) return [ruta];
  if (v && typeof v === 'object' && !Array.isArray(v)) return rutasIndefinidas(v, ruta);
  return [];
});

/** Lo mismo, pero para los nulos. */
const rutasNulas = (obj, prefijo = '') => Object.entries(obj).flatMap(([k, v]) => {
  const ruta = prefijo ? `${prefijo}.${k}` : k;
  if (v === null) return [ruta];
  if (v && typeof v === 'object' && !Array.isArray(v)) return rutasNulas(v, ruta);
  return [];
});

// ════════════════════════════════════════════════════════════════════════════
describe('EL ARCHIVO DEL GPS DECLARA LOS HUECOS, no los rellena', () => {

  test('el punto sin cota ni hora llega SIN esas claves', () => {
    const p = wpt('LX-001 A02');
    assert.equal('ele' in p, false, 'la clave no existe: no es un cero ni un nulo');
    assert.equal('utc' in p, false);
  });

  test('el punto que sí las traía las conserva', () => {
    const p = wpt('LX-001 A01');
    assert.equal(p.ele, 41.7);
    assert.equal(p.utc, '2026-03-04T10:15:00.000Z');
  });

  test('una cota de CERO es un dato y sobrevive: no se confunde con «no hay»', () => {
    const p = wpt('LX-001 A03');
    assert.equal('ele' in p, true);
    assert.equal(p.ele, 0);
  });

  test('el hueco se DICE, con la cuenta exacta y el porqué', () => {
    const aviso = LEIDO.avisos.find((a) => a.tipo === 'sin_cota');
    assert.ok(aviso, 'un hueco que no se declara es un hueco que él descubre después de cargar');
    assert.match(aviso.mensaje, /1 de 3 sin cota/);
    assert.match(aviso.mensaje, /no se rellena con cero/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('EL DOCUMENTO QUE SE MANDA NO LLEVA NI UN `undefined`', () => {

  const sinNada = construirPuntoNuevo(BASE, desdeWaypoint('LX-001 A02', 'LX-001 M1'), OPC).documento;
  const conTodo = construirPuntoNuevo(BASE, desdeWaypoint('LX-001 A01', 'LX-001 M2'), OPC).documento;
  const conCero = construirPuntoNuevo(BASE, desdeWaypoint('LX-001 A03', 'LX-001 M3'), OPC).documento;

  test('sin cota ni hora: las claves NO EXISTEN en la coordenada', () => {
    assert.equal('cotaTerreno_m' in sinNada.coordenada, false);
    assert.equal('tomadaEn' in sinNada.coordenada, false);
  });

  test('y no es que valgan `undefined` o `null`: es que no están', () => {
    assert.ok(!Object.keys(sinNada.coordenada).includes('cotaTerreno_m'));
    assert.ok(!Object.keys(sinNada.coordenada).includes('tomadaEn'));
    assert.equal(sinNada.coordenada.cotaTerreno_m, undefined, '(leerla da undefined, pero la clave no viaja)');
  });

  test('NINGUNA clave del documento, a ninguna profundidad, vale `undefined`', () => {
    // Un solo `undefined` hace que el SDK del navegador lance, y como el lote es
    // atómico se cae la carga entera sin decir cuál de los documentos falló.
    for (const doc of [sinNada, conTodo, conCero]) {
      assert.deepEqual(rutasIndefinidas(doc), [], `«${doc.nombreNormalizado}» lleva claves sin valor`);
    }
  });

  test('el ÚNICO nulo del documento es la deflexión, y está declarada a propósito', () => {
    for (const doc of [sinNada, conTodo, conCero]) {
      assert.deepEqual(rutasNulas(doc), ['deflexion_grados'],
        'el sistema la recalcula al dibujar; se guarda nula para que nadie la confunda con una medida de campo');
    }
  });

  test('cuando el archivo SÍ traía cota y hora, las claves existen con su valor', () => {
    assert.equal(conTodo.coordenada.cotaTerreno_m, 41.7);
    assert.equal(conTodo.coordenada.tomadaEn, '2026-03-04T10:15:00.000Z');
  });

  test('una cota de CERO se escribe: cero es un valor, no una ausencia', () => {
    assert.equal('cotaTerreno_m' in conCero.coordenada, true);
    assert.equal(conCero.coordenada.cotaTerreno_m, 0);
  });

  test('lo que se manda vale para el molde de los datos, con clave y sin ella', () => {
    for (const doc of [sinNada, conTodo, conCero]) assert.equal(Apoyo.safeParse(doc).success, true);
  });

  test('ni el texto del documento contiene la palabra `undefined`', () => {
    // Cinturón y tirantes: `JSON.stringify` borra los `undefined` de los
    // objetos, así que esto solo caza los que se hubieran colado como TEXTO —el
    // clásico `${valor}` de una plantilla— que es el que acaba impreso en una
    // ficha delante del cliente.
    for (const doc of [sinNada, conTodo, conCero]) {
      assert.doesNotMatch(JSON.stringify(doc), /undefined|NaN/);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('EL PLAN COMPLETO TAMPOCO DEJA PASAR NINGUNO', () => {

  test('los tres documentos del plan salen limpios', () => {
    const plan = planDeCarga(BASE, [
      desdeWaypoint('LX-001 A02', 'LX-001 M1'),
      desdeWaypoint('LX-001 A01', 'LX-001 M2'),
      desdeWaypoint('LX-001 A03', 'LX-001 M3'),
    ], OPC);
    assert.equal(plan.documentos.length, 3);
    assert.equal(plan.bloqueados.length, 0);
    for (const d of plan.documentos) {
      assert.deepEqual(rutasIndefinidas(d), []);
      assert.equal(Apoyo.safeParse(d).success, true);
    }
  });

  test('un `null` que venga de fuera se trata como ausencia, no se escribe', () => {
    // Un lector cualquiera puede devolver `null` donde no había dato. En la base
    // ese nulo sería un campo opcional con valor prohibido por el molde.
    const { documento } = construirPuntoNuevo(BASE, {
      ...desdeWaypoint('LX-001 A02', 'LX-001 M1'), ele: null, utc: null,
    }, OPC);
    assert.equal('cotaTerreno_m' in documento.coordenada, false);
    assert.equal('tomadaEn' in documento.coordenada, false);
    assert.equal(Apoyo.safeParse(documento).success, true);
  });
});
