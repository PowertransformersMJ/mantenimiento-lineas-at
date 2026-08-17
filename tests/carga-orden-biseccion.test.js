// ============================================================================
// tests/carga-orden-biseccion.test.js — un punto nuevo NO mueve a los que ya están
// ----------------------------------------------------------------------------
// LA REGLA QUE DEFIENDE:
//
//     Un punto que se descubre DENTRO de un vano ya levantado entra por
//     BISECCIÓN —recibe el hueco que hay entre sus dos vecinos— en vez de correr
//     una posición a todos los que van detrás. Y un SEGUNDO punto en el mismo
//     hueco va DETRÁS del primero, nunca delante.
//
// POR QUÉ NO SE RENUMERA. La posición no es cosmética: de ella deduce el sistema
// en qué vano vive un empalme, en ese orden se dibuja la traza, y por ese mismo
// campo se resuelven las fotos de cada apoyo. Renumerar obligaría a reescribir
// los documentos que ya están en producción para registrar un hecho que no
// cambió, y arrastraría con ellos las fotos. La bisección deja intacto todo lo
// escrito: por eso el molde de los datos admite `orden` fraccionario desde 0.5.0.
//
// POR QUÉ EL SEGUNDO VA DETRÁS. Bisecar siempre contra el vecino inmediato
// repartía hacia atrás: dos empalmes declarados A y B en el mismo vano salían
// «vecino · B · A · vecino», el recorrido al revés y sin un solo aviso. El orden
// en que él los declara es el orden en que los recorrió.
//
// Y LO MÁS IMPORTANTE DE ESTE ARCHIVO: la carga es SOLO ADITIVA. Ninguno de los
// documentos que salen de aquí lleva el identificador de un punto ya cargado.
// Si alguna vez lo llevara, escribirlo sobrescribiría un documento de
// producción, y eso no se puede deshacer.
//
// ⚠️ MUNDO SINTÉTICO. Los nombres canónicos ya son públicos (viven en el
// registro del repositorio); las coordenadas, las horas y las funciones de estas
// pruebas son INVENTADAS: una recta sobre un meridiano que no es el de nadie.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { construirPuntoNuevo } from '../importar/punto.js';
import { planDeCarga } from '../importar/plan.js';
import { idDelRegistro } from '../importar/identidad.js';
import { idEstable, leerRegistro, CANONICOS, ORG_POR_DEFECTO } from '../herramientas/identidad.mjs';
import { Apoyo } from '../contratos/src/activos.ts';

const REGISTRO = leerRegistro();

/** Un apoyo cualquiera, con la geometría inventada y el id que le toca. */
const apoyoDe = (id, lineaId, nombre, orden, lat, tipoPunto = 'Estructura') => ({
  id,
  orgId: ORG_POR_DEFECTO,
  creadoEn: '2026-01-01T00:00:00.000Z',
  creadoPor: 'uid-de-prueba',
  revision: 0,
  tipo: 'apoyo',
  lineaId,
  orden,
  tipoPunto,
  nombreCampo: nombre,
  nombreNormalizado: nombre,
  coordenada: { lat, lon: -70, sistemaReferencia: 'WGS84', metodo: 'gps_mano', precision_m: 8 },
  funcionEstructural: orden === 0 ? 'Terminal' : 'Suspensión',
  funcionProcedencia: 'confirmado_humano',
  deflexion_grados: null,
  condicion: 'Sin evaluar',
  activo: true,
});

// ════════════════════════════════════════════════════════════════════════════
// LA FORMA DE PRODUCCIÓN: 26 puntos con orden 0…25, que es exactamente como
// están escritos. Las coordenadas, inventadas.
// ════════════════════════════════════════════════════════════════════════════
const LINEA = 'LN-627';
const LINEA_ID = idEstable(ORG_POR_DEFECTO, LINEA, 'linea');

const BASE = CANONICOS[LINEA].map((nombre, i) => apoyoDe(
  idDelRegistro(LINEA, nombre, REGISTRO), LINEA_ID, nombre, i, 5 + i * 0.001,
  nombre.includes(' EMP ') ? 'Empalme' : 'Estructura',
));

const OPC = {
  codigoLinea: LINEA,
  creadoPor: 'uid-del-ingeniero',
  registro: REGISTRO,
  ahora: '2026-08-17T12:00:00.000Z',
};

const decision = (nombreCanonico, extra = {}) => ({
  nombreCanonico,
  nombreCampo: 'GRABADO EN EL APARATO',
  estado: 'aprobado',
  tipoPunto: 'Estructura',
  funcionEstructural: 'Terminal',
  lat: 5.0265,
  lon: -70,
  ...extra,
});

describe('LA BISECCIÓN, EN LA FORMA QUE TIENE LA LÍNEA HOY', () => {

  test('los 26 de partida ocupan 0…25, enteros, como están escritos', () => {
    assert.deepEqual(BASE.map((a) => a.orden), [...Array(26).keys()]);
    assert.equal(BASE.find((a) => a.nombreNormalizado === 'LN-627 E03').orden, 2);
    assert.equal(Math.max(...BASE.map((a) => a.orden)), 25);
  });

  test('un empalme detrás de E03 (orden 2) recibe 2,5 — el hueco, no un puesto de nadie', () => {
    const { documento } = construirPuntoNuevo(BASE, decision('LN-627 EMP E03-E04', {
      tipoPunto: 'Empalme', funcionEstructural: 'Suspensión', insertarDespuesDe: 'LN-627 E03',
    }), OPC);
    assert.equal(documento.orden, 2.5, '(2 + 3) / 2');
  });

  test('un SEGUNDO punto en ese mismo hueco recibe 2,75 — detrás del primero, no delante', () => {
    // La cifra exacta importa, y por eso se comprueba sobre la forma REAL de la
    // línea y no solo sobre un mundo inventado: 2,75 es lo que sale de bisecar
    // contra el que ya se intercaló (2,5 y 3), no contra el vecino de partida
    // —que daría otra vez 2,5 y dos puntos empatados—, y tampoco contra el
    // anterior —que daría 2,25 y pondría el segundo DELANTE del primero.
    const plan = planDeCarga(BASE, [
      decision('LN-627 EMP E03-E04', { tipoPunto: 'Empalme', funcionEstructural: 'Suspensión', insertarDespuesDe: 'LN-627 E03' }),
      decision('LN-627 PORTICO FIN', { insertarDespuesDe: 'LN-627 E03' }),
    ], OPC);
    assert.deepEqual(plan.documentos.map((d) => d.orden), [2.5, 2.75]);
    // Y el orden DECLARADO es el del recorrido: el que él nombró primero va antes.
    const porOrden = [...plan.documentos].sort((a, b) => a.orden - b.orden).map((d) => d.nombreNormalizado);
    assert.deepEqual(porOrden, ['LN-627 EMP E03-E04', 'LN-627 PORTICO FIN']);
    // Los dos siguen DENTRO del vano E03→E04: no se le comen el puesto a nadie.
    for (const d of plan.documentos) assert.ok(d.orden > 2 && d.orden < 3);
  });

  test('al final: último + 1 = 26', () => {
    const { documento } = construirPuntoNuevo(BASE, decision('LN-627 PORTICO FIN', { insertarAlFinal: true }), OPC);
    assert.equal(documento.orden, 26);
  });

  test('NI UN documento devuelto lleva el id de un punto ya cargado — la carga es solo aditiva', () => {
    // Es la prueba que impide el único fallo verdaderamente irreversible de esta
    // pantalla: escribir encima de un documento de producción.
    const yaEscritos = new Set(BASE.map((a) => a.id));
    const plan = planDeCarga(BASE, [
      decision('LN-627 EMP E03-E04', { tipoPunto: 'Empalme', funcionEstructural: 'Suspensión', insertarDespuesDe: 'LN-627 E03' }),
      decision('LN-627 PORTICO FIN', { insertarAlFinal: true }),
    ], OPC);
    assert.equal(plan.documentos.length, 2);
    for (const d of plan.documentos) {
      assert.ok(!yaEscritos.has(d.id), `«${d.nombreNormalizado}» pisaría un documento ya escrito`);
    }
  });

  test('y los 26 que ya estaban NO se tocan: ni su orden, ni nada', () => {
    const copia = JSON.parse(JSON.stringify(BASE));
    planDeCarga(BASE, [
      decision('LN-627 EMP E03-E04', { tipoPunto: 'Empalme', funcionEstructural: 'Suspensión', insertarDespuesDe: 'LN-627 E03' }),
      decision('LN-627 PORTICO FIN', { insertarAlFinal: true }),
    ], OPC);
    assert.deepEqual(BASE, copia,
      'renumerar reescribiría 26 documentos de producción y arrastraría las fotos que cuelgan de ellos');
  });

  test('un punto ya cargado no se puede volver a cargar', () => {
    assert.throws(() => construirPuntoNuevo(BASE, decision('LN-627 E03', { insertarAlFinal: true }), OPC),
      /ya está cargado/, 'el segundo documento pisaría al primero, con sus fotos y su expediente');
  });

  test('un orden fraccionario valida contra el molde de los datos (0.5.0)', () => {
    const { documento } = construirPuntoNuevo(BASE, decision('LN-627 EMP E03-E04', {
      tipoPunto: 'Empalme', funcionEstructural: 'Suspensión', insertarDespuesDe: 'LN-627 E03',
    }), OPC);
    const v = Apoyo.safeParse(documento);
    assert.equal(v.success, true,
      'si esto falla, el documento se descarta EN SILENCIO al llegar a la base: no da error, simplemente no aparece');
    assert.equal(v.data.orden, 2.5);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL MISMO HUECO, VARIAS VECES. Aquí hace falta más nombres de los que la línea
// real tiene libres, así que el mundo es del todo inventado: línea LX-001.
// ════════════════════════════════════════════════════════════════════════════
const LX = 'LX-001';
const LX_ID = idEstable(ORG_POR_DEFECTO, LX, 'linea');
const LX_NOMBRES = ['LX-001 A01', 'LX-001 A02', 'LX-001 A03', 'LX-001 A04',
  'LX-001 M1', 'LX-001 M2', 'LX-001 M3', 'LX-001 M4'];
const LX_REGISTRO = {
  [LX]: Object.fromEntries(LX_NOMBRES.map((n) => [n, {
    semilla: `punto:${n}`, id: idEstable(ORG_POR_DEFECTO, LX, `punto:${n}`),
  }])),
};
const LX_BASE = ['LX-001 A01', 'LX-001 A02', 'LX-001 A03', 'LX-001 A04'].map((n, i) => apoyoDe(
  LX_REGISTRO[LX][n].id, LX_ID, n, i, 5 + i * 0.001,
));
const LX_OPC = { codigoLinea: LX, creadoPor: 'uid-del-ingeniero', registro: LX_REGISTRO, ahora: '2026-08-17T12:00:00.000Z' };

/** Un marcador aprobado que se mete detrás de A02 (orden 1). */
const marcador = (nombre) => ({
  nombreCanonico: nombre, nombreCampo: nombre, estado: 'aprobado',
  tipoPunto: 'Empalme', funcionEstructural: 'Suspensión',
  lat: 5.0015, lon: -70, insertarDespuesDe: 'LX-001 A02',
});

describe('DOS Y TRES PUNTOS EN EL MISMO HUECO — el segundo va DETRÁS, no delante', () => {

  test('1,5 · 1,75 · 1,875 — cada uno detrás del anterior', () => {
    const plan = planDeCarga(LX_BASE, [marcador('LX-001 M1'), marcador('LX-001 M2'), marcador('LX-001 M3')], LX_OPC);
    assert.equal(plan.bloqueados.length, 0);
    assert.deepEqual(plan.documentos.map((d) => d.orden), [1.5, 1.75, 1.875]);
  });

  test('el orden DECLARADO es el orden del recorrido: M1 antes que M2', () => {
    // Es la corrección que motivó todo esto. Con la bisección ingenua salían al
    // revés, y el recorrido dibujado no era el que hizo la cuadrilla.
    const plan = planDeCarga(LX_BASE, [marcador('LX-001 M1'), marcador('LX-001 M2')], LX_OPC);
    const porOrden = [...plan.documentos].sort((a, b) => a.orden - b.orden).map((d) => d.nombreNormalizado);
    assert.deepEqual(porOrden, ['LX-001 M1', 'LX-001 M2']);
  });

  test('todos caen DENTRO del hueco: entre A02 (1) y A03 (2), sin tocar a nadie', () => {
    const plan = planDeCarga(LX_BASE, [marcador('LX-001 M1'), marcador('LX-001 M2'), marcador('LX-001 M3')], LX_OPC);
    for (const d of plan.documentos) {
      assert.ok(d.orden > 1 && d.orden < 2, `${d.orden} se sale del vano A02→A03`);
    }
    // Y ninguno empata con otro: dos puntos con el mismo orden se dibujarían en
    // un orden que depende de cómo los devuelva la base, es decir, al azar.
    const ordenes = plan.documentos.map((d) => d.orden);
    assert.equal(new Set(ordenes).size, ordenes.length);
  });

  test('mezclar un intercalado y uno al final no se estorban', () => {
    const plan = planDeCarga(LX_BASE, [
      marcador('LX-001 M1'),
      { ...marcador('LX-001 M2'), tipoPunto: 'Estructura', funcionEstructural: 'Terminal', insertarDespuesDe: undefined, insertarAlFinal: true },
      marcador('LX-001 M3'),
    ], LX_OPC);
    assert.deepEqual(plan.documentos.map((d) => d.orden), [1.5, 4, 1.75]);
  });

  test('todos los órdenes producidos son números no negativos y finitos', () => {
    const plan = planDeCarga(LX_BASE, [marcador('LX-001 M1'), marcador('LX-001 M2'), marcador('LX-001 M3'), marcador('LX-001 M4')], LX_OPC);
    for (const d of plan.documentos) {
      assert.ok(Number.isFinite(d.orden) && d.orden >= 0, `orden envenenado: ${d.orden}`);
      assert.equal(Apoyo.safeParse(d).success, true);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL PUNTO SE COLOCA DETRÁS DEL QUE ÉL ELIGIÓ, NO DETRÁS DE OTRO
// ----------------------------------------------------------------------------
// El defecto que esto caza: el salto hacia adelante sobre los puntos ya
// intercalados existe para que un SEGUNDO punto en el mismo hueco caiga detrás
// del primero. Pero si el sitio elegido ES YA uno de esos intercalados, el salto
// se lo pasa de largo y lo deja detrás del SIGUIENTE — es decir, detrás de un
// punto que él no eligió.
//
// Con la forma A · X · Y · B y el sitio «detrás de X», el punto tiene que caer
// entre X e Y. Si cae entre Y y B, la traza dibuja el recorrido en un orden que
// la cuadrilla no hizo, y no hay ni un aviso: el número es válido, solo que es
// el de otro sitio. Y esto no se puede corregir después: un apoyo no se borra.
//
// LA REGLA CORRECTA, en una frase: el salto solo corre cuando el sitio elegido
// es un punto ORIGINAL de la línea (orden entero). Si el sitio ya es un
// intercalado, se bisecta contra su vecino inmediato.
// ════════════════════════════════════════════════════════════════════════════
describe('ANCLAR EN UN PUNTO YA INTERCALADO — el nuevo va detrás de ÉL', () => {

  /** La forma A(0) · X(0,5) · Y(0,75) · B(1), tal como queda tras dos cargas. */
  const conDosIntercalados = () => {
    const plan = planDeCarga(LX_BASE, [marcador('LX-001 M1'), marcador('LX-001 M2')], LX_OPC);
    assert.deepEqual(plan.documentos.map((d) => d.orden), [1.5, 1.75], '(la forma de partida)');
    return [...LX_BASE, ...plan.documentos];
  };

  test('detrás de X (1,5), habiendo un Y (1,75) delante → 1,625, no 1,875', () => {
    const { documento } = construirPuntoNuevo(conDosIntercalados(), {
      ...marcador('LX-001 M3'), insertarDespuesDe: 'LX-001 M1',
    }, LX_OPC);
    assert.equal(documento.orden, 1.625,
      'se pasó de largo: quedó detrás de un punto que el Ingeniero no eligió');
  });

  test('y sigue cayendo ENTRE el elegido y el que va justo detrás', () => {
    const base = conDosIntercalados();
    const { documento } = construirPuntoNuevo(base, {
      ...marcador('LX-001 M3'), insertarDespuesDe: 'LX-001 M1',
    }, LX_OPC);
    assert.ok(documento.orden > 1.5 && documento.orden < 1.75,
      `${documento.orden} no está entre el punto elegido y su vecino inmediato`);
  });

  test('anclar en el ÚLTIMO intercalado sí bisecta contra el punto original de delante', () => {
    // Detrás de Y (1,75) no hay más intercalados: el vecino inmediato es A03 (2).
    const { documento } = construirPuntoNuevo(conDosIntercalados(), {
      ...marcador('LX-001 M3'), insertarDespuesDe: 'LX-001 M2',
    }, LX_OPC);
    assert.equal(documento.orden, 1.875);
  });

  test('⚠️ y lo que YA funcionaba sigue funcionando: detrás de E03 con un 2,5 detrás → 2,75', () => {
    // La regla nueva no puede quitar la vieja. E03 es un punto ORIGINAL (orden
    // entero), así que el salto sobre el 2,5 ya intercalado tiene que seguir
    // corriendo, o dos puntos declarados en el mismo vano volverían a salir al
    // revés del recorrido.
    const plan = planDeCarga(BASE, [
      decision('LN-627 EMP E03-E04', { tipoPunto: 'Empalme', funcionEstructural: 'Suspensión', insertarDespuesDe: 'LN-627 E03' }),
      decision('LN-627 PORTICO FIN', { insertarDespuesDe: 'LN-627 E03' }),
    ], OPC);
    assert.deepEqual(plan.documentos.map((d) => d.orden), [2.5, 2.75]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('LO QUE NO SE PUEDE COLOCAR SE NIEGA CON EL MOTIVO ESCRITO', () => {

  test('un punto ANTES del primero se para: hoy no hay por dónde entrar', () => {
    // Bisecar por delante daría orden negativo, y correr los 26 es justo lo que
    // esta bisección existe para evitar. Es el caso del pórtico del extremo de
    // origen: cuando se apruebe, se construye el camino a propósito.
    assert.throws(() => construirPuntoNuevo(BASE, decision('LN-627 PORTICO FIN', { insertarAntesDe: 'LN-627 E01' }), OPC),
      /va antes de/);
    assert.throws(() => construirPuntoNuevo(BASE, decision('LN-627 PORTICO FIN', { insertarAlPrincipio: true }), OPC),
      /va antes de/);
  });

  test('y ese motivo llega al acuse, con las fotos nombradas', () => {
    const plan = planDeCarga(BASE, [decision('LN-627 PORTICO FIN', { insertarAntesDe: 'LN-627 E01' })], OPC);
    assert.equal(plan.documentos.length, 0);
    assert.equal(plan.bloqueados.length, 1);
    assert.match(plan.bloqueados[0].motivo, /va antes de/);
    assert.match(plan.bloqueados[0].motivo, /26 puntos ya cargados/);
    assert.match(plan.bloqueados[0].motivo, /fotos/);
  });

  test('un punto que no dice DÓNDE va no se coloca «donde quepa»', () => {
    assert.throws(() => construirPuntoNuevo(BASE, decision('LN-627 PORTICO FIN'), OPC),
      /no dice dónde va/);
  });

  test('«detrás de» un punto que no está cargado tampoco vale', () => {
    assert.throws(() => construirPuntoNuevo(BASE, decision('LN-627 PORTICO FIN', { insertarDespuesDe: 'LN-627 E99' }), OPC),
      /que no está entre los puntos cargados/);
  });

  test('sobre una línea VACÍA no se siembra: esta pantalla solo añade', () => {
    // Se para por los dos lados, y los dos dicen lo mismo con las palabras que
    // él necesita: esto AÑADE a una línea que ya existe. Sembrar desde cero se
    // hace en el repositorio.
    assert.throws(() => construirPuntoNuevo([], decision('LN-627 PORTICO FIN', { insertarAlFinal: true }), OPC),
      /no tiene todavía ningún punto cargado/);
    // Y aunque se le diga la línea a mano, tampoco hay dónde colocarlo: el
    // máximo de una lista vacía es menos infinito, un orden envenenado que el
    // molde aceptaría como número y que nadie vería hasta dibujar la línea.
    assert.throws(
      () => construirPuntoNuevo([], decision('LN-627 PORTICO FIN', { insertarAlFinal: true }), { ...OPC, lineaId: LINEA_ID }),
      /no tiene todavía ningún punto cargado/,
    );
    // El otro motivo sigue vivo para su caso: hay puntos, pero ninguno declara
    // su línea. Ese sí es un dato que falta.
    const sinLinea = BASE.map(({ lineaId, ...resto }) => resto);
    assert.throws(() => construirPuntoNuevo(sinLinea, decision('LN-627 PORTICO FIN', { insertarAlFinal: true }), OPC),
      /ninguno de los apoyos cargados declara su línea/);
  });

  test('si los apoyos cargados fueran de dos líneas distintas, se para', () => {
    // Un punto colgado de la línea equivocada no da error: desaparece de la suya.
    const mezcla = [...LX_BASE, { ...LX_BASE[0], id: 'otro', lineaId: LINEA_ID }];
    assert.throws(() => construirPuntoNuevo(mezcla, { ...marcador('LX-001 M1'), insertarAlFinal: true, insertarDespuesDe: undefined }, LX_OPC),
      /líneas distintas/);
  });
});
