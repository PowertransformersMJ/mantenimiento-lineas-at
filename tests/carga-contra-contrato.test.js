// ============================================================================
// tests/carga-contra-contrato.test.js — el papel estructural se valida contra
// EL MOLDE DE LOS DATOS, nunca contra una lista copiada
// ----------------------------------------------------------------------------
// LA REGLA QUE DEFIENDE:
//
//     Todo documento que la pantalla vaya a escribir tiene que pasar el molde de
//     los datos ANTES de salir. Y el papel estructural se acepta si —y solo si—
//     está en la lista del molde, leída del molde en tiempo de ejecución.
//
// POR QUÉ NO UNA LISTA COPIADA. Ya pasó en este repositorio: la lista del
// sembrador admite CINCO papeles estructurales y el molde admite SEIS —le falta
// 'Derivación'—. Dos copias empiezan iguales y terminan distintas, y la
// divergencia no da error: hace que un punto perfectamente válido se rechace, o
// —peor— que uno inválido se escriba y luego no valide al leerlo, con lo que la
// línea aparece VACÍA en pantalla y sin un solo mensaje. Leyendo del molde, el
// día que gane un séptimo papel esta pantalla lo admite sola.
//
// POR QUÉ VALIDAR ANTES DE MANDAR. La base no comprueba el contenido de un
// apoyo: sus reglas miran quién escribe y a qué organización, no si el documento
// tiene sentido. Y un apoyo no se puede borrar ni corregir desde la aplicación.
// O sea: lo que se escriba mal, se queda. Esta prueba es la frontera.
//
// ⚠️ MUNDO SINTÉTICO: línea LX-001, coordenadas inventadas.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { construirPuntoNuevo } from '../importar/punto.js';
import { planDeCarga } from '../importar/plan.js';
import { idEstable, ORG_POR_DEFECTO } from '../herramientas/identidad.mjs';
import { Apoyo, FuncionEstructural, TipoPunto, FUNCIONES_ANCLA } from '../contratos/src/activos.ts';
import { Procedencia } from '../contratos/src/comunes.ts';

const AQUI = dirname(fileURLToPath(import.meta.url));
const leerFuente = (p) => readFileSync(join(AQUI, '..', p), 'utf-8');

const LINEA = 'LX-001';
const LINEA_ID = idEstable(ORG_POR_DEFECTO, LINEA, 'linea');
const NOMBRES = ['LX-001 A01', 'LX-001 A02', 'LX-001 A03', 'LX-001 N1', 'LX-001 N2', 'LX-001 N3',
  'LX-001 N4', 'LX-001 N5', 'LX-001 N6', 'LX-001 N7', 'LX-001 N8', 'LX-001 N9'];
const REGISTRO = {
  [LINEA]: Object.fromEntries(NOMBRES.map((n) => [n, {
    semilla: `punto:${n}`, id: idEstable(ORG_POR_DEFECTO, LINEA, `punto:${n}`),
  }])),
};

const apoyo = (nombre, orden, lat) => ({
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
  funcionEstructural: orden === 0 ? 'Terminal' : 'Suspensión',
  funcionProcedencia: 'confirmado_humano',
  deflexion_grados: null,
  condicion: 'Sin evaluar',
  activo: true,
});

const BASE = [
  apoyo('LX-001 A01', 0, 5.0000),
  apoyo('LX-001 A02', 1, 5.0010),
  apoyo('LX-001 A03', 2, 5.0020),
];

const OPC = {
  codigoLinea: LINEA, creadoPor: 'uid-del-ingeniero', registro: REGISTRO,
  ahora: '2026-08-17T12:00:00.000Z',
};

const decision = (nombreCanonico, extra = {}) => ({
  nombreCanonico,
  nombreCampo: 'GRABADO EN EL APARATO',
  estado: 'aprobado',
  tipoPunto: 'Estructura',
  funcionEstructural: 'Terminal',
  lat: 5.0030,
  lon: -70,
  insertarAlFinal: true,
  ...extra,
});

// ════════════════════════════════════════════════════════════════════════════
describe('TODO LO QUE SE VA A ESCRIBIR PASA EL MOLDE DE LOS DATOS', () => {

  test('cada documento del plan valida — y el mensaje dice qué pasaría si no', () => {
    const plan = planDeCarga(BASE, [
      decision('LX-001 N1'),
      decision('LX-001 N2', { tipoPunto: 'Empalme', funcionEstructural: 'Suspensión', insertarAlFinal: false, insertarDespuesDe: 'LX-001 A02' }),
      decision('LX-001 N3', { tipoPunto: 'Punto de referencia', funcionEstructural: 'Suspensión', ele: 41.7, utc: '2026-03-04T10:15:00.000Z' }),
    ], OPC);
    assert.equal(plan.documentos.length, 3);
    for (const d of plan.documentos) {
      const v = Apoyo.safeParse(d);
      assert.equal(v.success, true,
        `«${d.nombreNormalizado}» no valida: ${JSON.stringify(v.error?.issues)}. ` +
        'La base no comprueba el contenido de un apoyo, y un apoyo no se puede borrar: lo que se escriba mal se queda.');
    }
  });

  test('el documento trae completo el sello común: quién, cuándo y de qué organización', () => {
    const { documento } = construirPuntoNuevo(BASE, decision('LX-001 N1'), OPC);
    assert.equal(documento.tipo, 'apoyo');
    assert.equal(documento.orgId, ORG_POR_DEFECTO);
    assert.equal(documento.creadoPor, 'uid-del-ingeniero', 'el autor es la sesión abierta, no una etiqueta');
    assert.equal(documento.creadoEn, '2026-08-17T12:00:00.000Z');
    assert.equal(documento.revision, 0);
    assert.equal(documento.lineaId, LINEA_ID);
  });

  test('una carga entera comparte el mismo instante: es UN hecho, no varios', () => {
    // El caso es quien NO declara instante —la pantalla de carga, hoy—: lo pone
    // el plan, una sola vez, y se lo pasa hecho a cada punto.
    //
    // ⚠️ ESTA PRUEBA PASABA POR SUERTE. El sello lo ponía cada documento por su
    // cuenta, así que los de una misma carga coincidían solo si se construían
    // dentro del mismo milisegundo: en frío falló el 17 % de las veces (34 de
    // 200 procesos, medido el 17-08-2026). El enunciado de arriba era verdad por
    // velocidad de la máquina, no por el código — que es exactamente lo que una
    // prueba no puede dejar pasar. Ver `30 · L-52`.
    //
    // Van NUEVE puntos y no dos a propósito: si el sello vuelve a ponerse por
    // documento, nueve construcciones no caben en un milisegundo y la regresión
    // se ve SIEMPRE, en vez de una de cada seis corridas. Una prueba que solo
    // caza el fallo a veces avisa tarde y enseña a desconfiar de ella.
    const plan = planDeCarga(BASE, NOMBRES.slice(3).map((n) => decision(n)), { ...OPC, ahora: undefined });
    assert.equal(plan.documentos.length, 9);
    assert.equal(new Set(plan.documentos.map((d) => d.creadoEn)).size, 1,
      'la carga se partió en varios instantes: un solo hecho fechado se convirtió en nueve');
    assert.ok(Number.isFinite(Date.parse(plan.documentos[0].creadoEn)),
      'y el sello tiene que ser un instante real, no la ausencia que dejaba un `ahora` sin valor');

    // `null` es la otra cara del mismo caso —es lo que devuelve un lector cuando
    // el dato no venía— y ahí ni siquiera actuaba el defecto del constructor,
    // que solo cubre `undefined`: se escribía un `creadoEn` nulo y lo paraba el
    // molde, ya en la frontera. Por eso el plan usa `??=` y no un spread.
    const conNulo = planDeCarga(BASE, [decision('LX-001 N1'), decision('LX-001 N2')], { ...OPC, ahora: null });
    assert.equal(new Set(conNulo.documentos.map((d) => d.creadoEn)).size, 1);
    assert.ok(Number.isFinite(Date.parse(conNulo.documentos[0].creadoEn)),
      'un `ahora` nulo tiene que sellarse igual: no declarar la clave y declararla vacía son lo mismo');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('EL PAPEL ESTRUCTURAL SALE DEL MOLDE, Y DEL MOLDE ENTERO', () => {

  test('las SEIS del molde se aceptan — incluida «Derivación», la que la lista vieja no tiene', () => {
    assert.equal(FuncionEstructural.options.length, 6);
    assert.ok(FuncionEstructural.options.includes('Derivación'));
    FuncionEstructural.options.forEach((funcion, i) => {
      const { documento } = construirPuntoNuevo(BASE, decision(NOMBRES[3 + i], { funcionEstructural: funcion }), OPC);
      assert.equal(documento.funcionEstructural, funcion);
      assert.equal(Apoyo.safeParse(documento).success, true);
    });
  });

  test('cualquier cosa que NO esté en el molde se para, y se dice cuáles valen', () => {
    for (const invento of ['Inventada', 'suspensión', 'SUSPENSIÓN', 'Suspension', 'Terminal ', '', undefined, null, 7]) {
      assert.throws(() => construirPuntoNuevo(BASE, decision('LX-001 N1', { funcionEstructural: invento }), OPC),
        /papel estructural válido/, `«${String(invento)}» se coló como papel estructural`);
    }
    try {
      construirPuntoNuevo(BASE, decision('LX-001 N1', { funcionEstructural: 'Inventada' }), OPC);
    } catch (err) {
      // El mensaje enumera las opciones LEÍDAS del molde: si el molde gana una,
      // el mensaje la nombra sin que nadie toque este archivo.
      for (const f of FuncionEstructural.options) assert.ok(err.message.includes(f), `el mensaje no nombra «${f}»`);
      assert.match(err.message, /tramo de tensión/, 'y dice por qué importa, no solo que falta');
    }
  });

  test('NO se asume ninguno por defecto: sin declararlo, el punto no se carga', () => {
    // De esto sale dónde se corta el tramo de tensión, y con eso el cálculo
    // mecánico. Adivinar «Suspensión» sería firmar por él.
    const sinFuncion = { ...decision('LX-001 N1') };
    delete sinFuncion.funcionEstructural;
    assert.throws(() => construirPuntoNuevo(BASE, sinFuncion, OPC), /papel estructural válido/);
  });

  test('las funciones que ANCLAN siguen siendo las del molde, y llegan enteras al cálculo', () => {
    // Una función de ancla corta el tramo de tensión. Si el documento la lleva
    // bien pero el motor no la reconociera, el reparto de tramos cambiaría.
    for (const ancla of FUNCIONES_ANCLA) {
      assert.ok(FuncionEstructural.options.includes(ancla), `«${ancla}» ancla pero no está entre los papeles válidos`);
    }
    const plan = planDeCarga(BASE, [decision('LX-001 N1', { funcionEstructural: 'Derivación' })], OPC);
    assert.equal(plan.despues.anclas.n, plan.antes.anclas.n + 1,
      'una derivación corta tramo: tiene que contarse como ancla en el DESPUÉS');
  });

  test('el archivo NO lleva una copia de la lista: la lee del molde', () => {
    // Guardián por texto, mismo patrón que el resto del repositorio: el fallo
    // consiste precisamente en volver a escribir la lista aquí.
    const fuente = leerFuente('importar/punto.js');
    assert.match(fuente, /FuncionEstructural\.options/, 'tiene que leer el molde en tiempo de ejecución');
    assert.match(fuente, /TipoPunto\.options/);
    const codigo = fuente
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    for (const opcion of [...FuncionEstructural.options, ...TipoPunto.options]) {
      assert.ok(!codigo.includes(`'${opcion}'`) && !codigo.includes(`"${opcion}"`),
        `«${opcion}» está escrito a mano en importar/punto.js: es una segunda copia de la lista del molde, y las copias divergen`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LO QUE SE VALIDA Y LO QUE SE ESCRIBE TIENEN QUE SER LO MISMO
// ----------------------------------------------------------------------------
// El defecto que esto caza: pasar el documento por el molde y después mandar a
// la base el documento CRUDO, el de antes de validar. Es la peor forma de este
// fallo, porque deja el comentario que dice «se escribe lo validado» encima de
// una línea que escribe otra cosa: la prueba de lectura da tranquilidad y el
// dato que entra es el que nadie miró.
//
// La diferencia no es teórica. El molde recorta y normaliza —quita las claves
// que sobran y convierte lo que puede—, así que el crudo puede llevar campos que
// nadie declaró. Y en apoyos NO hay deshacer: `allow delete: if false`.
// ════════════════════════════════════════════════════════════════════════════
describe('LA ESCRITURA MANDA EL DOCUMENTO VALIDADO, NO EL CRUDO', () => {

  /** El cuerpo de `cargarPuntosNuevos`, aislado de lo que hay alrededor. */
  const cuerpoDeLaCarga = () => {
    const fuente = leerFuente('web/src/datos/firestore.ts');
    const i = fuente.indexOf('async cargarPuntosNuevos(');
    assert.notEqual(i, -1, 'no existe el método que escribe los puntos nuevos');
    const j = fuente.indexOf('\n  async ', i + 10);
    return fuente.slice(i, j === -1 ? undefined : j);
  };

  test('lo que entra en el lote sale de `safeParse`, no del objeto sin validar', () => {
    const cuerpo = cuerpoDeLaCarga();
    assert.match(cuerpo, /Apoyo\.safeParse\(/, 'sin validar contra el molde no hay frontera ninguna');
    // Lo que se apunta para escribir tiene que salir de `r.data` —el resultado
    // del molde—, y NO del objeto de entrada. Que el crudo exista no es el
    // problema; el problema es que sea el crudo el que viaja.
    assert.match(cuerpo, /pendientes\.push\([^)]*documento:\s*validado[^)]*\)/,
      'lo que se apunta para escribir tiene que ser el documento ya validado');
    assert.match(cuerpo, /const\s+validado\s*=[\s\S]{0,80}r\.data/,
      'el documento que se escribe tiene que salir del molde, no del objeto de entrada');
    assert.doesNotMatch(cuerpo, /documento:\s*sellado\b/,
      'se valida un objeto y se escribe otro: a la base llega el que nadie comprobó');
  });

  test('y el `set` del lote escribe justo eso', () => {
    assert.match(cuerpoDeLaCarga(), /lote\.set\(\s*p\.ref\s*,\s*p\.documento\s*\)/,
      'el lote tiene que escribir el documento que se guardó ya validado');
  });

  test('un punto que ya está cargado no se vuelve a mandar', () => {
    // La INTENCIÓN no cambió: un `set` sobre un id existente no da error,
    // sobrescribe — y sobrescribir aquí es un punto pisando a otro, con sus
    // fotos y su expediente colgando. Lo que cambió es POR DÓNDE se comprueba.
    //
    // Antes se le preguntaba a la base «¿este punto ya existe?». Esa pregunta
    // ROMPÍA la pantalla entera: `puedeLeer()` decide mirando
    // `resource.data.orgId`, y en un documento que todavía no existe no hay
    // `resource` — la base no contesta «no está», DENIEGA. Y el caso normal de
    // esta pantalla es cargar puntos que aún no existen, así que fallaba
    // siempre, en el primero, con un mensaje en inglés sobre permisos.
    //
    // Ahora se comprueba contra los apoyos que la aplicación YA tiene en
    // memoria: los mismos con los que se calculó el antes/después que el
    // Ingeniero aprobó. Y queda una segunda red que no depende de nosotros: la
    // base distingue crear de actualizar, y `noTocaReservados()` rechaza un
    // `set` que traiga otro `creadoEn` sobre un documento que ya existe.
    const cuerpo = cuerpoDeLaCarga();
    assert.match(cuerpo, /yaCargados\.has\(/, 'sin comprobar, un id repetido sobrescribe en silencio');
    assert.match(cuerpo, /yaEstaban\.push\(/, 'y lo que ya estaba tiene que poder contarse en el acuse');
    assert.ok(!/getDoc\(/.test(cuerpo),
      'volvió la lectura previa a la base: la deniegan las reglas y deja la pantalla inservible');
  });

  test('el permiso se comprueba ANTES de mandar nada', () => {
    // ⚠️ CAMBIÓ EL CÓMO, NO EL QUÉ (`99 §ADR-100`). Antes esto comprobaba
    // `rol !== 'admin'`; ahora se pregunta por la FUNCIÓN del catálogo,
    // `cargar.puntos`, que es lo mismo que miran las reglas de la base. El
    // invariante que esta prueba defiende no se ha tocado: se pregunta ANTES de
    // armar el lote, porque un lote es atómico y su denegación es opaca.
    const cuerpo = cuerpoDeLaCarga();
    const iPermiso = cuerpo.indexOf("puede({ claims }, 'cargar.puntos')");
    const iLote = cuerpo.indexOf('writeBatch(db)');
    assert.notEqual(iPermiso, -1,
      'la carga tiene que preguntar por la función del catálogo, no comparar el rol a mano');
    assert.notEqual(iLote, -1);
    assert.ok(iPermiso < iLote,
      'un lote es atómico y su denegación es opaca: la base no dice cuál documento la causó');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('QUÉ ES EL PUNTO: también del molde, porque decide si entra al cálculo', () => {

  test('los tres tipos del molde se aceptan', () => {
    assert.deepEqual([...TipoPunto.options], ['Estructura', 'Empalme', 'Punto de referencia']);
    TipoPunto.options.forEach((tipo, i) => {
      const { documento } = construirPuntoNuevo(BASE, decision(NOMBRES[3 + i], { tipoPunto: tipo }), OPC);
      assert.equal(documento.tipoPunto, tipo);
      assert.equal(Apoyo.safeParse(documento).success, true);
    });
  });

  test('lo que no esté en el molde se para, y se explica la consecuencia', () => {
    for (const invento of ['Apoyo', 'estructura', 'Pórtico', '', undefined, null]) {
      assert.throws(() => construirPuntoNuevo(BASE, decision('LX-001 N1', { tipoPunto: invento }), OPC),
        /no declara qué es/, `«${String(invento)}» se coló como tipo de punto`);
    }
    try {
      construirPuntoNuevo(BASE, decision('LX-001 N1', { tipoPunto: 'Apoyo' }), OPC);
    } catch (err) {
      assert.match(err.message, /un empalme contado como apoyo parte un vano real en dos falsos/);
    }
  });

  test('un empalme NO cuenta como vano: no mueve el promedio ni el cálculo mecánico', () => {
    const conEmpalme = planDeCarga(BASE, [decision('LX-001 N1', {
      tipoPunto: 'Empalme', funcionEstructural: 'Suspensión',
      lat: 5.0015, insertarAlFinal: false, insertarDespuesDe: 'LX-001 A02',
    })], OPC);
    assert.equal(conEmpalme.despues.empalmes, conEmpalme.antes.empalmes + 1);
    assert.equal(conEmpalme.despues.estructuras, conEmpalme.antes.estructuras, 'no suma estructura');
    assert.equal(conEmpalme.despues.vanos.n, conEmpalme.antes.vanos.n, 'ni abre un vano nuevo');

    // ⚠️ La clave se comprueba ANTES de comparar. Esta línea comparaba
    // `promedio_m`, que el motor no devuelve nunca: eran dos ausencias iguales
    // entre sí, y la prueba pasaba pasara lo que pasara. Una prueba que no puede
    // ponerse roja es peor que no tenerla: ocupa el sitio de la que sí vigila.
    assert.ok('promedio' in conEmpalme.antes.vanos,
      'la estadística de vanos cambió de nombres: esta comparación se quedaría muda');
    assert.ok(Number.isFinite(conEmpalme.antes.vanos.promedio));
    assert.equal(conEmpalme.despues.vanos.promedio, conEmpalme.antes.vanos.promedio,
      'el promedio de vanos no se mueve: un empalme no es un apoyo');
  });

  test('y ese promedio SÍ se mueve cuando entra una estructura — la comparación no es muda', () => {
    // El contraste que demuestra que la aserción de arriba vigila algo: con una
    // ESTRUCTURA nueva el promedio tiene que moverse. Si las dos comparaciones
    // dieran igual, la de arriba no estaría comprobando nada.
    const conEstructura = planDeCarga(BASE, [decision('LX-001 N2', {
      tipoPunto: 'Estructura', funcionEstructural: 'Suspensión',
      lat: 5.0015, insertarAlFinal: false, insertarDespuesDe: 'LX-001 A02',
    })], OPC);
    assert.equal(conEstructura.despues.vanos.n, conEstructura.antes.vanos.n + 1);
    assert.notEqual(conEstructura.despues.vanos.promedio, conEstructura.antes.vanos.promedio);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('LA PROCEDENCIA DE LA FUNCIÓN: supuesta salvo que él la firme', () => {

  test('por defecto queda SUPUESTA, y la ficha lo dirá', () => {
    // Poner la firma de alguien sobre lo que no firmó es peor que no tener el
    // dato, y aquí no hay deshacer.
    const { documento } = construirPuntoNuevo(BASE, decision('LX-001 N1'), OPC);
    assert.equal(documento.funcionProcedencia, 'supuesto');
    assert.equal(Procedencia.safeParse(documento.funcionProcedencia).success, true);
  });

  test('solo un `true` explícito la convierte en confirmada por él', () => {
    for (const casi of [undefined, false, null, 'true', 1, 'sí']) {
      const { documento } = construirPuntoNuevo(BASE, decision('LX-001 N1', { funcionConfirmada: casi }), OPC);
      assert.equal(documento.funcionProcedencia, 'supuesto', `«${String(casi)}» pasó por firma del Ingeniero`);
    }
    const firmado = construirPuntoNuevo(BASE, decision('LX-001 N1', { funcionConfirmada: true }), OPC).documento;
    assert.equal(firmado.funcionProcedencia, 'confirmado_humano');
  });
});
