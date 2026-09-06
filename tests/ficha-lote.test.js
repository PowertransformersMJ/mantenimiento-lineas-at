// ============================================================================
// tests/ficha-lote.test.js — el dato de catálogo aplicado a VARIOS apoyos
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. La escritura por lote lleva meses en el repositorio con sus
// cuatro salvaguardas y nunca se pudo pedir. Ahora tiene pantalla, y una
// pantalla que decide por su cuenta quién es elegible es exactamente la avería
// más cara posible de este proyecto: sería un SEGUNDO juez del mismo hecho, y el
// día que discrepara del primero o el botón se encendería sobre un apoyo que la
// base rechaza, o se apagaría sobre uno perfectamente escribible — y él
// concluiría que la herramienta está rota.
//
// Lo que se defiende aquí, en orden de daño:
//
//   1. LOS CAMPOS DEL EJEMPLAR NO SE COLAN POR EL LOTE. La altura libre, la del
//      amarre y las fases amarradas dependen del terreno y de qué hace ese
//      apoyo. Aplicarlas a veinte apoyos de un gesto llenaría la base de datos
//      que PARECEN medidos, y sobre eso se firma un dictamen.
//   2. EL HUECO SE MIDE CONTRA LO QUE VIAJA, no contra los tres campos siempre.
//      Es la regla fina: quien ya declara el tipo de apoyo sí puede recibir una
//      carga de rotura, y medirlo mal deja fuera a medio parque sin motivo.
//   3. SOLO ESTRUCTURAS, y el motivo se DICE. Un empalme no sostiene el
//      conductor y no tiene veredicto que desbloquear.
//   4. LO QUE LA PANTALLA PROMETE Y LO QUE LA ESCRITURA HACE SON LO MISMO. La
//      salvaguarda de verdad vive en `datos/firestore.ts`; esto comprueba que el
//      espejo no se desincronizó, leyendo su fuente.
//
// ⚠️ Mundo SINTÉTICO, como sus archivos hermanos: este repositorio es público.
// Apoyos con letras, coordenadas sobre el ecuador y capacidades de laboratorio.
// Ni un dato de la línea del cliente.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  CAMPOS_DE_FICHA, CAMPOS_POR_LOTE, borradorEnBlanco, loQueVaACambiar,
} from '../web/src/vistas/fichaEstructural.ts';
import {
  CAMPOS_DEL_LOTE, CAMPOS_QUE_NO_VAN_POR_LOTE,
  candidatosDeLote, clavesDeLaFicha, fichaDeLote, resumenDeLote, revisionesDe,
} from '../web/src/vistas/fichaLote.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => readFileSync(join(RAIZ, p), 'utf-8');

// ── Mundo sintético ─────────────────────────────────────────────────────────

const CUANDO = '2026-08-20T09:00:00.000Z';
const QUIEN = 'uid-sintetico';

const CONDUCTOR = Object.freeze({
  codigo: 'SINTETICO-25', material: 'ACSR', seccion_mm2: 300,
  diametro_m: 0.025, masaLineal_kg_m: 1, rts_kgf: 10000,
  moduloElastico_kg_mm2: 7000, moduloEs: 'no_declarado',
  dilatacion_1_C: 1.9e-5, tempMaxOperacion_C: 75, procedencia: 'supuesto',
});

const HIPOTESIS = Object.freeze({
  nombre: 'sintética', eds_pct: 20, tempEds_C: 25, tempMax_C: 75, tempMin_C: 10,
  vientoMax_kmh: 36, tempViento_C: 25,
  cx: 1.0, densidadAire_kg_m3: 1.2, procedencia: 'supuesto', congelada: false,
});

const P = [
  { lat: 0, lon: 0 },
  { lat: 0.001, lon: 0 },
  { lat: 0.002, lon: 0.0005 },
  { lat: 0.003, lon: 0.001 },
];

const apoyo = (i, nombre, funcionEstructural, extra = {}) => ({
  id: `ap-${i}`, tipo: 'apoyo', lineaId: 'linea-sintetica', orgId: 'org-sintetica',
  creadoEn: CUANDO, creadoPor: QUIEN, revision: 0,
  orden: i, tipoPunto: 'Estructura',
  nombreCampo: nombre, nombreNormalizado: nombre, coordenada: P[i],
  funcionEstructural, funcionProcedencia: 'supuesto',
  condicion: 'Sin evaluar', activo: true,
  ...extra,
});

/** Tres estructuras y UN empalme, que es el punto que nunca puede recibir. */
const LINEA = [
  apoyo(0, 'A', 'Terminal'),
  apoyo(1, 'B', 'Suspensión'),
  apoyo(2, 'C', 'Terminal'),
  { ...apoyo(3, 'EMP', 'Suspensión'), tipoPunto: 'Empalme' },
];

const TRAMOS = [{ n: 1, nVanos: 2, hEds: 800, hTMax: 700, hViento: 1000, hTMin: 1200, pico: 1200 }];
const estado = (nombre, H, t) => ({ nombre, H, t, w: 1 });
const RICOS = [{
  desde: { nombre: 'A' }, hasta: { nombre: 'C' },
  estados: {
    eds: estado('EDS / cada día', 800, 25),
    tMax: estado('Máxima temperatura', 700, 75),
    viento: estado('Máximo viento', 1000, 25),
    tMin: estado('Mínima temperatura', 1200, 10),
  },
}];

const contextoCon = (apoyos) => Object.freeze({
  apoyos, tramos: TRAMOS, tramosRicos: RICOS,
  conductor: CONDUCTOR, hipotesis: HIPOTESIS, circuitos: 1,
});

/** Un borrador con lo que él habría tecleado. Nada se rellena solo. */
function tecleado({ valores = {}, origenes = {}, fuentes = {} } = {}) {
  const b = borradorEnBlanco();
  return {
    valores: { ...b.valores, ...valores },
    origenes: { ...origenes },
    fuentes: { ...fuentes },
  };
}

/** El caso normal: la carga de rotura de un catálogo, con su origen y su fuente. */
const SOLO_CARGA = tecleado({
  valores: { cargaRotura_kgf: '3.600' },
  origenes: { cargaRotura_kgf: 'catalogo_fabricante' },
  fuentes: { cargaRotura_kgf: 'catálogo del fabricante, poste 14 m clase 350, hoja 2' },
});

const SOLO_TIPO = tecleado({
  valores: { tipoApoyo: 'Concreto' },
  origenes: { tipoApoyo: 'documento_proyecto' },
  fuentes: { tipoApoyo: 'plano de montaje 2019, hoja 4' },
});

// ════════════════════════════════════════════════════════════════════════════
// 1 · LOS CAMPOS DEL EJEMPLAR NO SE COLAN POR EL LOTE
// ════════════════════════════════════════════════════════════════════════════

describe('lo que depende del terreno no va por lote, y no hay puerta trasera', () => {
  test('los tres campos del lote son exactamente los del catálogo, derivados y no copiados', () => {
    assert.deepEqual(
      CAMPOS_DEL_LOTE.map((c) => c.clave).sort(),
      CAMPOS_DE_FICHA.filter((c) => c.porLote).map((c) => c.clave).sort(),
      'una segunda lista de campos es una segunda verdad: el día que uno cambie de bando, '
      + 'la pantalla seguiría ofreciendo el de ayer');
    assert.deepEqual([...CAMPOS_POR_LOTE].sort(), CAMPOS_DEL_LOTE.map((c) => c.clave).sort(),
      'la pantalla y la escritura tienen que ofrecer lo mismo');
    assert.equal(CAMPOS_DEL_LOTE.length, 3, 'son tres: carga de rotura, capacidad y tipo de apoyo');
  });

  test('los tres que NO van son los que dependen del terreno y del papel de cada apoyo', () => {
    assert.deepEqual(
      CAMPOS_QUE_NO_VAN_POR_LOTE.map((c) => c.clave).sort(),
      ['alturaAplicacion_m', 'alturaLibre_m', 'nFasesAmarradas'],
      'el empotramiento no se ve desde un escritorio, y un terminal amarra todas las fases '
      + 'mientras uno de paso puede no amarrar ninguna');
  });

  test('una altura libre dentro del borrador NO produce ficha, y se dice por qué', () => {
    const r = fichaDeLote(tecleado({
      valores: { alturaLibre_m: '11,5', cargaRotura_kgf: '3.600' },
      origenes: { alturaLibre_m: 'levantamiento_campo', cargaRotura_kgf: 'catalogo_fabricante' },
      fuentes: { alturaLibre_m: 'medida con cinta el 12-08', cargaRotura_kgf: 'catálogo, hoja 2' },
    }));
    assert.equal(r.ficha, null, 'con un campo de ejemplar dentro no se manda NADA: ni lo que sí iba');
    assert.deepEqual(r.deEjemplar, ['altura libre sobre el terreno']);
    assert.match(r.faltan.join(' '), /no se puede aplicar a varios apoyos/);
    assert.match(r.faltan.join(' '), /uno a uno/, 'decir que no se puede sin decir qué hacer es un callejón');
  });

  test('y la defensa de verdad no es esta pantalla: la escritura lo rechaza igual', () => {
    // La salvaguarda que cuenta vive en la base, no en el formulario: una guarda
    // que solo vive en la pantalla dura hasta la siguiente pantalla.
    const escritura = leer('web/src/datos/firestore.ts');
    const cuerpo = escritura.slice(escritura.indexOf('async guardarFichaApoyoEnLote('));
    assert.match(cuerpo, /!c\.porLote/,
      'la escritura tiene que cortar los campos de ejemplar por su cuenta');
    assert.match(cuerpo, /CAMPOS_POR_LOTE/,
      'y tiene que medir el hueco contra la MISMA lista que ofrece la pantalla');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2 · EL HUECO SE MIDE CONTRA LO QUE VIAJA
// ════════════════════════════════════════════════════════════════════════════

describe('solo rellena huecos, y el hueco es el de los campos que viajan', () => {
  test('las claves que viajan son las que la ficha trae, no las tres siempre', () => {
    const { ficha } = fichaDeLote(SOLO_CARGA);
    assert.deepEqual(clavesDeLaFicha(ficha), ['cargaRotura_kgf']);
  });

  test('quien ya declara la carga de rotura queda fuera de un lote de carga de rotura', () => {
    const linea = [apoyo(0, 'A', 'Terminal', { cargaRotura_kgf: 4000 }), apoyo(1, 'B', 'Suspensión')];
    const { ficha } = fichaDeLote(SOLO_CARGA);
    const cs = candidatosDeLote(linea, clavesDeLaFicha(ficha));
    const a = cs.find((c) => c.nombre.includes('A'));
    assert.equal(a.elegible, false);
    assert.match(a.motivo, /ya declara/);
    assert.match(a.motivo, /solo rellena huecos/,
      'sin el motivo, un apoyo que falta de la lista se lee como un dato perdido');
    assert.deepEqual(a.yaDeclara, ['Carga de rotura en la punta']);
    assert.equal(cs.find((c) => c.nombre.includes('B')).elegible, true);
  });

  test('…y ESE MISMO apoyo SÍ puede recibir un lote de tipo de apoyo', () => {
    // La regla fina. Medir la elegibilidad contra los tres campos siempre
    // dejaría fuera a medio parque sin un solo motivo defendible.
    const linea = [apoyo(0, 'A', 'Terminal', { cargaRotura_kgf: 4000 })];
    const { ficha } = fichaDeLote(SOLO_TIPO);
    const cs = candidatosDeLote(linea, clavesDeLaFicha(ficha));
    assert.equal(cs[0].elegible, true,
      'tener la carga de rotura no puede impedir que le declaren de qué está hecho');
  });

  test('un valor en `null` es un hueco, no un dato: se puede rellenar', () => {
    const linea = [apoyo(0, 'A', 'Terminal', { cargaRotura_kgf: null })];
    const { ficha } = fichaDeLote(SOLO_CARGA);
    assert.equal(candidatosDeLote(linea, clavesDeLaFicha(ficha))[0].elegible, true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3 · SOLO ESTRUCTURAS — y los que quedan fuera se ENSEÑAN
// ════════════════════════════════════════════════════════════════════════════

describe('un empalme no recibe nunca, y se dice por qué', () => {
  test('el empalme no es elegible ni con la ficha más completa', () => {
    const { ficha } = fichaDeLote(SOLO_CARGA);
    const cs = candidatosDeLote(LINEA, clavesDeLaFicha(ficha));
    const emp = cs.find((c) => c.nombre.includes('EMP'));
    assert.equal(emp.elegible, false);
    assert.match(emp.motivo, /no es una estructura/);
    assert.match(emp.motivo, /no sostiene el conductor/);
  });

  test('pero SIGUE EN LA LISTA: que un punto quede fuera es información, no ruido', () => {
    const { ficha } = fichaDeLote(SOLO_CARGA);
    const cs = candidatosDeLote(LINEA, clavesDeLaFicha(ficha));
    assert.equal(cs.length, LINEA.length,
      'una lista que solo enseña a los elegibles esconde justo lo que hace falta para confiar '
      + 'en ella: quien no ve un punto supone que se perdió');
  });

  test('la lista va en el orden de la línea, no en el de la base', () => {
    const revuelta = [LINEA[2], LINEA[0], LINEA[3], LINEA[1]];
    const cs = candidatosDeLote(revuelta, []);
    assert.deepEqual(cs.map((c) => c.nombre.replace(/^.*\s/, '')), ['A', 'B', 'C', 'EMP'],
      'un lote se decide caminando la línea');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4 · LOS TRES MONTONES, ANTES DE PULSAR
// ════════════════════════════════════════════════════════════════════════════

describe('qué va a pasar con lo marcado', () => {
  test('se separan los que reciben, los marcados que no y los elegibles sin marcar', () => {
    const linea = [
      apoyo(0, 'A', 'Terminal', { cargaRotura_kgf: 4000 }),   // marcado, pero ya lo tiene
      apoyo(1, 'B', 'Suspensión'),                            // marcado y recibe
      apoyo(2, 'C', 'Terminal'),                              // elegible y SIN marcar
    ];
    const { ficha } = fichaDeLote(SOLO_CARGA);
    const cs = candidatosDeLote(linea, clavesDeLaFicha(ficha));
    const r = resumenDeLote(cs, ['ap-0', 'ap-1']);
    assert.deepEqual(r.recibiran.map((c) => c.id), ['ap-1']);
    assert.deepEqual(r.quedanFuera.map((c) => c.id), ['ap-0']);
    assert.deepEqual(r.sinMarcar.map((c) => c.id), ['ap-2'],
      'un olvido de veinte apoyos es caro: se cuenta y se dice');
  });

  test('las revisiones que viajan son las que se ENSEÑARON, no las de la base', () => {
    // El cerrojo por documento: si mientras él escribía otra persona guardó, la
    // escritura lo caza y no entra ninguno. Eso exige que lo que viaja sea la
    // revisión que él vio.
    const linea = [apoyo(0, 'A', 'Terminal', { revision: 7 }), apoyo(1, 'B', 'Suspensión', { revision: 2 })];
    const cs = candidatosDeLote(linea, []);
    assert.deepEqual(revisionesDe(cs), { 'ap-0': 7, 'ap-1': 2 });
  });

  test('un apoyo sin revisión declarada viaja como revisión 0, no como indefinido', () => {
    const sinRevision = { ...apoyo(0, 'A', 'Terminal') };
    delete sinRevision.revision;
    assert.deepEqual(revisionesDe(candidatosDeLote([sinRevision], [])), { 'ap-0': 0 });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5 · EL ANTES/DESPUÉS DE UN LOTE — el mismo motor, muchos apoyos a la vez
// ════════════════════════════════════════════════════════════════════════════

describe('el panel del lote mueve varios apoyos de una vez', () => {
  test('dos apoyos que reciben el dato aparecen los dos como editados', () => {
    const linea = [
      apoyo(0, 'A', 'Terminal', { alturaLibre_m: 11, alturaAplicacion_m: 10, nFasesAmarradas: 3 }),
      apoyo(1, 'B', 'Suspensión', { alturaLibre_m: 11, alturaAplicacion_m: 10, nFasesAmarradas: 3 }),
      apoyo(2, 'C', 'Terminal'),
    ];
    const { ficha } = fichaDeLote(SOLO_CARGA);
    const panel = loQueVaACambiar(contextoCon(linea), [
      { apoyoId: 'ap-0', ficha }, { apoyoId: 'ap-1', ficha },
    ]);
    const editados = panel.filas.filter((f) => f.editado);
    assert.equal(editados.length, 2, 'el panel del lote tiene que enseñar TODOS los que reciben');
    assert.equal(panel.alcance.editados.length, 2);
  });

  test('los que PIERDEN veredicto se cuentan aparte, también en un lote', () => {
    // Es la cuenta que casi siempre da cero y por eso mismo se lleva: un lote
    // mueve muchos apoyos a la vez, y una pérdida silenciosa ahí no la ve nadie.
    const panel = loQueVaACambiar(contextoCon(LINEA), []);
    assert.equal(typeof panel.resumen.pierdenVeredicto, 'number');
    assert.ok(Array.isArray(panel.resumen.sinMover));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6 · LA PANTALLA: ni una fórmula, y el permiso correcto
// ════════════════════════════════════════════════════════════════════════════

const lote = leer('web/src/componentes/FichaLote.tsx');
const fichas = leer('web/src/componentes/Fichas.tsx');
const enlace = leer('web/src/datos/enlace.ts');

describe('ni una fórmula en la pantalla del lote', () => {
  test('no importa del núcleo y no hace aritmética', () => {
    assert.ok(!/@lineas\/nucleo/.test(lote),
      'si la pantalla llamara al motor por su cuenta, habría dos entradas del mismo cálculo');
    assert.ok(!/Math\./.test(lote),
      'cualquier aritmética en el .tsx es una segunda fuente del número que se firma');
  });

  test('se lo pide todo a los módulos puros, que son sus dueños', () => {
    for (const fn of ['fichaDeLote', 'candidatosDeLote', 'clavesDeLaFicha', 'resumenDeLote',
      'revisionesDe', 'loQueVaACambiar']) {
      assert.ok(lote.includes(fn), `la pantalla no usa ${fn}: algo está decidiendo por su cuenta`);
    }
    assert.ok(lote.includes('CAMPOS_DEL_LOTE'),
      'una lista de campos copiada en el .tsx se desincroniza en el primer cambio');
  });

  test('ningún color escrito a mano', () => {
    const fugas = [...lote.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)].map((m) => m[0]);
    assert.deepEqual(fugas, [], `colores a mano en FichaLote.tsx: ${fugas.join(', ')}`);
  });

  test('la frase de por qué no todo va por lote es PERMANENTE, no un aviso que se cierra', () => {
    assert.ok(lote.includes('POR_QUE_NO_TODO_VA_POR_LOTE'),
      'es la salvaguarda que impide que el lote se convierta en la herramienta que llena la base '
      + 'de datos que PARECEN medidos');
  });
});

describe('aplicar a varios es acto de administración', () => {
  test('la pantalla del lote exige la MISMA función que la escritura', () => {
    // ⚠️ CAMBIÓ EL CÓMO, NO EL QUÉ (`99 §ADR-100`). Antes las dos comparaban
    // `rol === 'admin'`; ahora las dos preguntan por `ficha.lote`, que el
    // catálogo declara NO DELEGABLE — o sea que sigue siendo administración y
    // no se puede regalar suelta. Lo que esta prueba defiende es que la pantalla
    // y la escritura pidan LO MISMO: un botón que promete algo que la base niega
    // no es más seguro ni menos, es mentiroso.
    assert.match(lote, /puede\(sesion, 'ficha\.lote'\)/,
      'el permiso que se comprueba tiene que ser el mismo que exige la base');
    assert.match(lote, /disabled=\{!puedeEscribir\}/);
    const escritura = leer('web/src/datos/firestore.ts');
    const cuerpo = escritura.slice(escritura.indexOf('async guardarFichaApoyoEnLote('));
    assert.match(cuerpo, /puede\(\{ claims \}, 'ficha\.lote'\)/, 'la guarda de verdad vive en la escritura');
  });

  test('sin ese permiso NO se esconde el botón: se explica', () => {
    assert.match(lote, /acto de <b>administración<\/b>/,
      'un botón que desaparece se lee como una avería de la aplicación');
    assert.match(fichas, /acto de administración/,
      'y también donde se ofrece, para no abrir un formulario que no va a poder mandarse');
  });

  test('el botón no se enciende si ningún apoyo marcado puede recibir el dato', () => {
    assert.match(lote, /no hay ningún apoyo marcado que pueda recibir este dato/);
  });
});

describe('el lote no destruye su propio acuse ni lo que ya se veía', () => {
  test('el puente escribe y NO recarga la línea', () => {
    const cuerpo = enlace.slice(enlace.indexOf('async guardarFichaEnLote('), enlace.indexOf('async refrescarLinea'));
    assert.ok(cuerpo.includes('guardarFichaApoyoEnLote'), 'tiene que delegar en el repositorio');
    assert.ok(!/this\.abrir\(/.test(cuerpo),
      'recargar aquí destruiría el acuse del lote en el instante en que se genera');
  });

  test('un fallo NO borra lo tecleado ni lo marcado', () => {
    const bloque = lote.slice(lote.indexOf('catch (e)'), lote.indexOf('finally'));
    assert.ok(!/setBorrador|setMarcados/.test(bloque),
      'perder veinte marcas por un conflicto de revisión es media mañana de trabajo');
    assert.match(lote, /setFallo\(e instanceof Error \? e\.message/,
      'el motivo entero: un conflicto de revisión NOMBRA al apoyo que otra persona tocó');
  });

  test('el acuse dice a quién se escribió Y a quién no, con su motivo', () => {
    assert.match(lote, /yaLoTenian/, 'quien quedó fuera por ya tenerlo tiene que aparecer');
    assert.match(lote, /No se escribió en ningún apoyo/,
      'un lote que no escribe nada es un resultado válido, no un silencio');
    assert.match(lote, /Ver la línea recalculada/);
  });

  test('la ficha de un apoyo sigue montada: el lote se AÑADE, no sustituye', () => {
    assert.match(fichas, /<FichaEditor/, 'el formulario de un apoyo no puede desaparecer bajo el lote');
    assert.match(fichas, /<FichaCriterios/);
    assert.match(fichas, /<Galeria/);
    assert.match(fichas, /<FichaLote/);
  });
});
