// ============================================================================
// tests/carga-sin-aprobacion.test.js — lo que él no aprobó no se escribe
// ----------------------------------------------------------------------------
// LA REGLA QUE DEFIENDE:
//
//     Un punto que el Ingeniero no ha aprobado NO se carga. Y no cargarlo no es
//     un error del programa: es un hecho sobre el punto, así que no revienta la
//     pantalla, no tumba la carga de los demás, y el MOTIVO viaja entero hasta
//     el acuse que él lee.
//
// POR QUÉ EL MOTIVO IMPORTA TANTO COMO EL FILTRO. Cargar un punto no se puede
// deshacer, así que dejar uno fuera es lo prudente; pero un acuse que dice «no
// se cargó» sin decir por qué se lee como «se perdió». El día que él vuelva a
// buscar ese punto tiene que encontrar escrito, con sus palabras, que lo dejó
// pendiente de verificar — no un hueco.
//
// Y hay un orden deliberado que también se prueba aquí: la aprobación se mira
// ANTES que ninguna otra cosa. Un punto sin aprobar al que además le falte el
// sitio, el nombre o la función tiene que salir como «pendiente», no como
// «error»: lo que le falta a un punto que no se va a cargar da igual.
//
// ⚠️ MUNDO SINTÉTICO. Línea LX-001, cuatro estructuras en un meridiano
// inventado. Ni una coordenada, ni una hora, ni un nombre reales.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { construirPuntoNuevo, MOTIVO_SIN_APROBAR } from '../importar/punto.js';
import { planDeCarga } from '../importar/plan.js';
import { idEstable, ORG_POR_DEFECTO } from '../herramientas/identidad.mjs';

const LINEA = 'LX-001';
const LINEA_ID = idEstable(ORG_POR_DEFECTO, LINEA, 'linea');

/** Un registro de mentira, acuñado con la misma fórmula del repositorio. */
const NOMBRES = ['LX-001 A01', 'LX-001 A02', 'LX-001 A03', 'LX-001 A04', 'LX-001 A05', 'LX-001 EMP A02-A03', 'LX-001 PORTICO'];
const REGISTRO = {
  [LINEA]: Object.fromEntries(NOMBRES.map((n) => [n, {
    semilla: `punto:${n}`, id: idEstable(ORG_POR_DEFECTO, LINEA, `punto:${n}`),
  }])),
};

const apoyo = (nombre, orden, lat, funcion) => ({
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
  coordenada: { lat, lon: -70, sistemaReferencia: 'WGS84', metodo: 'gps_mano', precision_m: 8 },
  funcionEstructural: funcion,
  funcionProcedencia: 'confirmado_humano',
  deflexion_grados: null,
  condicion: 'Sin evaluar',
  activo: true,
});

const BASE = [
  apoyo('LX-001 A01', 0, 5.0000, 'Terminal'),
  apoyo('LX-001 A02', 1, 5.0010, 'Suspensión'),
  apoyo('LX-001 A03', 2, 5.0020, 'Suspensión'),
  apoyo('LX-001 A04', 3, 5.0030, 'Terminal'),
];

const OPC = {
  codigoLinea: LINEA,
  creadoPor: 'uid-del-ingeniero',
  registro: REGISTRO,
  ahora: '2026-08-17T12:00:00.000Z',
};

/** Una decisión completa y aprobada, para partir de algo que SÍ se carga. */
const aprobado = (nombreCanonico, extra = {}) => ({
  nombreCanonico,
  nombreCampo: 'GRABADO EN EL APARATO',
  estado: 'aprobado',
  tipoPunto: 'Estructura',
  funcionEstructural: 'Terminal',
  lat: 5.0040,
  lon: -70,
  insertarAlFinal: true,
  ...extra,
});

// ════════════════════════════════════════════════════════════════════════════
describe('SIN APROBACIÓN NO HAY DOCUMENTO — y tampoco hay excepción', () => {

  test('una decisión sin estado devuelve `documento: null`, no lanza', () => {
    const r = construirPuntoNuevo(BASE, { nombreCanonico: 'LX-001 PORTICO', nombreCampo: 'X' }, OPC);
    assert.equal(r.documento, null, 'no se construye nada que se pueda escribir');
    assert.ok(r.ignorado, 'pero el punto no desaparece: sale declarado');
    assert.equal(r.ignorado.motivo, MOTIVO_SIN_APROBAR);
    assert.equal(MOTIVO_SIN_APROBAR, 'no está aprobado', 'el texto por defecto es este, y la pantalla lo enseña tal cual');
  });

  test('llamarla con DOS argumentos —sin opciones— tampoco lanza', () => {
    // La pantalla puede preguntar «¿qué pasaría con esto?» antes de tener
    // resuelta la sesión. Que eso reviente convertiría una consulta en un error.
    const r = construirPuntoNuevo(BASE, { nombreCanonico: 'LX-001 PORTICO' });
    assert.equal(r.documento, null);
    assert.equal(r.ignorado.motivo, MOTIVO_SIN_APROBAR);
  });

  test('la casilla empieza VACÍA: cualquier estado que no sea «aprobado» deja el punto fuera', () => {
    for (const estado of [undefined, null, '', 'pendiente', 'pendiente_verificacion', 'APROBADO', ' aprobado', 'aprobado ', true]) {
      const r = construirPuntoNuevo(BASE, { nombreCanonico: 'LX-001 PORTICO', estado }, OPC);
      assert.equal(r.documento, null, `«${String(estado)}» pasó por aprobación`);
    }
    // Y con el valor exacto sí se construye: el filtro no es un muro ciego.
    assert.ok(construirPuntoNuevo(BASE, aprobado('LX-001 PORTICO'), OPC).documento);
  });

  test('el motivo que él escribió viaja LITERAL hasta el acuse', () => {
    const suyo = 'lo dejé pendiente de verificar en campo';
    const r = construirPuntoNuevo(BASE, {
      nombreCanonico: 'LX-001 PORTICO', nombreCampo: 'MARCA 7',
      estado: 'pendiente_verificacion', motivoPendiente: suyo,
    }, OPC);
    assert.equal(r.ignorado.motivo, suyo, 'ni resumido, ni traducido, ni sustituido por el genérico');
    assert.equal(r.ignorado.estado, 'pendiente_verificacion');
    assert.equal(r.ignorado.nombreCanonico, 'LX-001 PORTICO');
    assert.equal(r.ignorado.nombreCampo, 'MARCA 7', 'el nombre del aparato también: es como él lo va a reconocer');
  });

  test('un punto sin estado DECLARADO se dice así, no se calla', () => {
    const r = construirPuntoNuevo(BASE, { nombreCanonico: 'LX-001 PORTICO' }, OPC);
    assert.equal(r.ignorado.estado, '(sin declarar)');
  });

  test('la aprobación se mira ANTES que nada: a un punto que no se carga no se le exige lo demás', () => {
    // Sin nombre anotado, sin sitio, sin función y sin coordenada. Cualquiera de
    // esas cosas LANZA en un punto aprobado; en uno sin aprobar, ninguna importa.
    const r = construirPuntoNuevo(BASE, { nombreCanonico: 'NOMBRE QUE NO EXISTE', estado: 'pendiente' }, OPC);
    assert.equal(r.documento, null);
    assert.equal(r.ignorado.motivo, MOTIVO_SIN_APROBAR);
    // Y ni siquiera hace falta el autor de la sesión para poder declararlo.
    assert.doesNotThrow(() => construirPuntoNuevo(BASE, { estado: 'pendiente' }, { registro: REGISTRO }));
  });

  test('mirar un punto sin aprobar no toca la línea ya cargada', () => {
    const copia = JSON.parse(JSON.stringify(BASE));
    construirPuntoNuevo(BASE, { nombreCanonico: 'LX-001 PORTICO', estado: 'pendiente' }, OPC);
    assert.deepEqual(BASE, copia, 'no se muta ni un documento de los que ya están escritos');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('EN EL PLAN COMPLETO: se cargan los aprobados y se DECLARAN los demás', () => {

  const DECISIONES = [
    aprobado('LX-001 EMP A02-A03', {
      tipoPunto: 'Empalme', funcionEstructural: 'Suspensión',
      lat: 5.0015, insertarAlFinal: false, insertarDespuesDe: 'LX-001 A02',
    }),
    aprobado('LX-001 PORTICO'),
    {
      nombreCanonico: 'LX-001 A05', nombreCampo: 'MARCA 9',
      estado: 'pendiente_verificacion', motivoPendiente: 'pendiente de verificar en campo',
    },
  ];

  const plan = planDeCarga(BASE, DECISIONES, OPC);

  test('2 aprobados → 2 documentos; 1 pendiente → 1 ignorado', () => {
    assert.equal(plan.documentos.length, 2);
    assert.equal(plan.ignorados.length, 1);
    assert.equal(plan.bloqueados.length, 0, 'nada bloqueado: los tres son casos previstos');
  });

  test('el motivo del ignorado llega al acuse tal cual', () => {
    assert.equal(plan.ignorados[0].motivo, 'pendiente de verificar en campo');
    assert.equal(plan.ignorados[0].nombreCanonico, 'LX-001 A05');
  });

  test('el pendiente NO produce documento: no hay forma de que se cuele en el lote', () => {
    const idPendiente = REGISTRO[LINEA]['LX-001 A05'].id;
    assert.ok(!plan.documentos.some((d) => d.id === idPendiente));
    assert.ok(!plan.documentos.some((d) => d.nombreNormalizado === 'LX-001 A05'));
  });

  test('las cifras del DESPUÉS cuentan solo lo que se va a escribir', () => {
    assert.equal(plan.antes.puntos, 4);
    assert.equal(plan.despues.puntos, 6, '4 + los 2 aprobados; el pendiente no suma');
    assert.equal(plan.despues.empalmes, 1);
    assert.equal(plan.despues.estructuras, 5);
  });

  test('un punto sin aprobar no arrastra a los buenos: los otros dos se cargan igual', () => {
    // Castigar la carga entera por un punto que él mismo dejó fuera sería
    // penalizarle por haber traído más información de la que aprobó.
    const soloPendiente = planDeCarga(BASE, [DECISIONES[2]], OPC);
    assert.equal(soloPendiente.documentos.length, 0);
    assert.equal(soloPendiente.ignorados.length, 1);
    assert.deepEqual(soloPendiente.antes, soloPendiente.despues,
      'sin nada que cargar, el antes y el después son idénticos: la pantalla dice «esto no cambia nada»');
  });

  test('sin decisiones el plan no revienta y no propone nada', () => {
    const vacio = planDeCarga(BASE, [], OPC);
    assert.deepEqual(vacio.documentos, []);
    assert.deepEqual(vacio.ignorados, []);
    assert.deepEqual(vacio.bloqueados, []);
    assert.equal(vacio.antes.puntos, 4);
    assert.equal(vacio.despues.puntos, 4);
  });

  test('el plan no toca los apoyos que ya están escritos', () => {
    const copia = JSON.parse(JSON.stringify(BASE));
    planDeCarga(BASE, DECISIONES, OPC);
    assert.deepEqual(BASE, copia);
  });
});
