// ============================================================================
// tests/decisiones-memoria.test.js — el libro RECUERDA, y no propone nada
// ----------------------------------------------------------------------------
// QUÉ DEFIENDE ESTE ARCHIVO, en una frase:
//
//     Lo que la pantalla le devuelve al Ingeniero sobre un punto que todavía no
//     está cargado tiene que ser algo que él decidió, con fecha, y nada más. Ni
//     una deducción del sistema con aspecto de recuerdo, ni un byte de cliente
//     dentro del archivo que lo sostiene.
//
// SON DOS GARANTÍAS DISTINTAS Y LAS DOS HACEN FALTA:
//
//   1. QUE NO SE PROPONGA. El veto de ADR-028 sigue en pie: el sistema no
//      deduce el papel estructural, ni el nombre canónico, ni en qué vano cae un
//      punto. Un recuerdo sin fecha ni firma sería un dictamen con sello, que es
//      PEOR que el que se vetó, porque parece firmado.
//
//   2. QUE NO SE FILTRE NADA. El libro vive en el repositorio PÚBLICO. Ni una
//      coordenada, ni una hora de captura, ni el nombre de una subestación, ni
//      un código de waypoint del GPS.
//
// ⚠️ SOBRE LA PRUEBA DE NO-FUGA DE ESTE ARCHIVO: es una LISTA NEGRA de formas, y
//    las listas negras se quedan cortas — una fuga que nadie previó pasa limpia.
//    La defensa primaria es la LISTA BLANCA de `herramientas/publicar-decisiones.mjs`,
//    que además compara lo emitido contra la bóveda de verdad, cosa que aquí es
//    imposible porque en CI la bóveda no está montada. Esto es la segunda línea,
//    no la primera. Que esté verde no autoriza a confiarle el archivo.
//
// ⚠️ MUNDOS SINTÉTICOS: las líneas de prueba se llaman LX-…, y sus fechas y
//    nombres son inventados. Regla `33 · L-50`: en un archivo que se declara
//    sintético, TODO literal copiado es sospechoso, no solo la coordenada. Aquí
//    no se ha copiado ni un valor de la bóveda.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  decisionVigente, decisionesVigentes, historialDe, pendientesDe, estaPendiente,
  filasSinSello, estaSellada, selloDe, enCastellano, loQueSeRecuerda,
  emparejarConDecisiones, SIN_EMPAREJAR, EVIDENCIA_ADMITIDA,
} from '../importar/decisiones.js';
import { nombresDisponibles } from '../importar/identidad.js';
import { leerRegistro, RUTA_REGISTRO } from '../herramientas/identidad.mjs';
import { FuncionEstructural, TipoPunto } from '../contratos/src/activos.ts';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RUTA_LIBRO = join(AQUI, '..', 'herramientas', 'decisiones-firmadas.json');
const CRUDO = readFileSync(RUTA_LIBRO, 'utf-8');
const LIBRO = JSON.parse(CRUDO);
const SEMILLAS = leerRegistro(RUTA_REGISTRO);
const LINEA = 'LN-627';

/** Todas las filas del archivo real, decisiones y pendientes juntas. */
const TODAS = [...(LIBRO[LINEA]?.decisiones ?? []), ...(LIBRO[LINEA]?.pendientes ?? [])];

// ════════════════════════════════════════════════════════════════════════════
describe('EL LIBRO NO LLEVA NI UN BYTE DE CLIENTE', () => {

  test('el libro vive en el repositorio PÚBLICO, no en la bóveda', () => {
    // Si viviera en la bóveda, el navegador no podría leerlo y esta prueba se
    // saltaría sola en CI, que es justo donde tiene que correr.
    assert.ok(existsSync(RUTA_LIBRO));
    assert.ok(RUTA_LIBRO.includes('herramientas'));
    assert.doesNotMatch(RUTA_LIBRO, /brain-private/);
  });

  test('NI UN SOLO NÚMERO en JSON — es la regla que impide la segunda aritmética', () => {
    // El libro dice QUÉ decidió, no CUÁNTO mide nada. Toda cifra de la línea
    // sale de `importar/plan.js`, corrido dos veces. Un número aquí sería o una
    // medida del activo, o un segundo sitio donde vive el antes/después — y ese
    // es el sitio donde algún día discrepan.
    const numeros = [];
    JSON.parse(CRUDO, function reconocer(clave, valor) {
      if (typeof valor === 'number') numeros.push(`${clave} = ${valor}`);
      return valor;
    });
    assert.deepEqual(numeros, [],
      'el libro ganó un campo numérico. Si es una cifra de la línea, la calcula el motor; si es una medida, es dato de cliente');
  });

  test('ninguna forma de coordenada, cota, distancia ni azimut', () => {
    // Se comprueba por FORMA y no por valor: teclear aquí una coordenada real
    // para prohibirla sería publicarla, que es lo que se quiere impedir.
    assert.doesNotMatch(CRUDO, /\d+[.,]\d{4,}/,
      'un número con cuatro o más decimales tiene forma de coordenada, de distancia medida o de azimut');
    assert.doesNotMatch(CRUDO, /-7[45]\.\d{3}/, 'eso parece una longitud real');
    assert.doesNotMatch(CRUDO, /\b10\.\d{4}/, 'eso parece una latitud real');
  });

  test('ninguna hora de captura: las fechas son de DECISIÓN, y son fechas a secas', () => {
    // `33 · L-50`: la hora de captura dice cuándo estuvo la cuadrilla en el
    // sitio. Es dato de cliente aunque no sea una coordenada.
    assert.doesNotMatch(CRUDO, /\d{4}-\d{2}-\d{2}T/, 'una fecha con hora es una hora de captura');
    assert.doesNotMatch(CRUDO, /\b\d{2}:\d{2}(:\d{2})?\b/, 'eso parece una hora');
    for (const fila of TODAS) {
      assert.match(fila.decididoEn, /^\d{4}-\d{2}-\d{2}$/);
      if (fila.funcionConfirmadaEn) assert.match(fila.funcionConfirmadaEn, /^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test('ningún nombre de instalación del cliente', () => {
    assert.doesNotMatch(CRUDO, /\bSSEE\b/i, 'ni una referencia a instalación');
    assert.doesNotMatch(CRUDO, /MEMBRILLAL|PROEL[EÉ]CTRICA/i, 'el nombre de una subestación del cliente');
    // Y por eso los nombres canónicos de los pórticos son ORIGEN y FIN.
    assert.ok(TODAS.some((f) => f.sobre.endsWith('PORTICO FIN')));
  });

  test('ningún código de waypoint del GPS suelto', () => {
    // El aparato graba códigos como «627 EPPRO»/«627 EPMBR», que pueden
    // descifrar el nombre de la instalación. El libro se lee por NOMBRE
    // CANÓNICO, así que el nombre de campo no hace ninguna falta aquí.
    for (const fila of TODAS) {
      assert.equal(fila.nombreCampo, undefined, 'el nombre de campo del GPS no se publica');
      assert.equal(fila.name, undefined);
    }
    assert.doesNotMatch(CRUDO, /\bE[PB]\w*(PRO|MBR)\b/i, 'eso tiene forma de código de waypoint de subestación');
  });

  test('no aparece el nombre personal de nadie: se publica el ROL', () => {
    // Verificado el 2026-08-17: la historia de este repositorio tiene un solo
    // autor y no es su nombre personal. Este archivo no va a ser el primero en
    // publicarlo; la pantalla dice «decidido por usted», que es lo que hace falta.
    for (const fila of TODAS) {
      assert.equal(fila.decididoPor, 'el Ingeniero',
        'se publica el rol, nunca la persona: el nombre completo se queda en la bóveda');
    }
    assert.doesNotMatch(CRUDO, /\bJimenez\b|\bJiménez\b/i);
  });

  test('el libro solo trae los campos de la lista blanca — nada más se cuela', () => {
    // Es la guardia contra el crecimiento: el día que alguien añada aquí un
    // campo «que ayuda», esto se pone rojo y obliga a que la decisión sea
    // explícita en vez de silenciosa.
    const DECISION = new Set(['sobre', 'decididoPor', 'decididoEn', 'origenDelLevantamiento',
      'estado', 'tipoPunto', 'sitio', 'funcionEstructural', 'funcionConfirmada',
      'funcionConfirmadaEn', 'porQue']);
    const PENDIENTE = new Set(['sobre', 'decididoPor', 'decididoEn', 'estado', 'porQue',
      'seOfreceEnLaPantalla', 'porQueNoSeOfrece']);
    for (const f of LIBRO[LINEA].decisiones) {
      for (const k of Object.keys(f)) assert.ok(DECISION.has(k), `campo no previsto en una decisión: «${k}»`);
      for (const k of Object.keys(f.sitio ?? {})) {
        assert.ok(['insertarDespuesDe', 'insertarAlFinal'].includes(k), `campo no previsto en «sitio»: «${k}»`);
      }
    }
    for (const f of LIBRO[LINEA].pendientes) {
      for (const k of Object.keys(f)) assert.ok(PENDIENTE.has(k), `campo no previsto en un pendiente: «${k}»`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('CADA FILA ESTÁ FIRMADA Y FECHADA — si no, no es memoria', () => {

  test('toda fila trae quién lo decidió y cuándo', () => {
    assert.ok(TODAS.length >= 3, 'las dos decisiones aprobadas y el pendiente');
    for (const fila of TODAS) {
      assert.ok(estaSellada(fila), `«${fila.sobre}» no está sellada: sin firma y sin fecha no se puede enseñar`);
    }
    assert.deepEqual(filasSinSello(LIBRO, LINEA), []);
  });

  test('el libro real no tiene ni una fila usable sin sello', () => {
    // Y una fila SIN sello no se usa a medias: se descarta entera.
    const sucio = { [LINEA]: { decisiones: [{ sobre: 'LN-627 E01', tipoPunto: 'Estructura' }] } };
    assert.equal(decisionVigente(sucio, LINEA, 'LN-627 E01'), undefined,
      'una fila sin firma ni fecha no puede llegar a la pantalla');
    assert.equal(filasSinSello(sucio, LINEA).length, 1, 'pero se puede DECIR que está ahí');
  });

  test('todo `sobre` de una DECISIÓN tiene nombre emitido en el libro de identidad', () => {
    // Si no lo tuviera, la pantalla le recordaría lo que decidió sobre un punto
    // que no puede cargar — un recuerdo que solo sirve para frustrar.
    for (const f of LIBRO[LINEA].decisiones) {
      assert.ok(SEMILLAS[LINEA]?.[f.sobre], `«${f.sobre}» está decidido pero no tiene semilla emitida`);
    }
  });

  test('ningún `sobre` de un PENDIENTE tiene nombre emitido — y así se queda', () => {
    // Es la garantía ESTRUCTURAL de que un pendiente no se puede ofrecer: el
    // desplegable sale solo del libro de identidad. Esta prueba se pone roja el
    // día que alguien emita su semilla «para completar el libro», saltándose la
    // verificación en campo que él pidió.
    for (const f of LIBRO[LINEA].pendientes) {
      assert.equal(SEMILLAS[LINEA]?.[f.sobre], undefined,
        `«${f.sobre}» está PENDIENTE de verificación en campo y le han emitido semilla: ahora se podría cargar sin que él lo verificara`);
      assert.ok(!nombresDisponibles(SEMILLAS, LINEA, []).includes(f.sobre));
      assert.equal(f.seOfreceEnLaPantalla, false);
      assert.ok(f.porQueNoSeOfrece.trim().length > 20, 'y se dice POR QUÉ no se ofrece, no solo que no');
    }
  });

  test('los valores del libro son valores del MOLDE de los datos, no textos parecidos', () => {
    // Una lista copiada empieza igual y termina distinta. Si el molde mueve una
    // función, esto se pone rojo aquí y no en producción.
    for (const f of LIBRO[LINEA].decisiones) {
      assert.ok(FuncionEstructural.options.includes(f.funcionEstructural),
        `«${f.funcionEstructural}» no es un papel estructural del molde`);
      assert.ok(TipoPunto.options.includes(f.tipoPunto), `«${f.tipoPunto}» no es un tipo de punto del molde`);
    }
  });

  test('cada fila trae su porqué escrito, y en castellano', () => {
    for (const fila of TODAS) {
      assert.equal(typeof fila.porQue, 'string');
      assert.ok(fila.porQue.trim().length > 30,
        `«${fila.sobre}» no explica por qué: es lo único que él va a releer dentro de seis meses`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('SE RECUERDA LO QUE ÉL DECIDIÓ, Y SOLO ESO', () => {

  test('las dos decisiones de agosto se recuerdan enteras, con su fecha', () => {
    const emp = decisionVigente(LIBRO, LINEA, 'LN-627 EMP E03-E04');
    assert.equal(emp.decididoEn, '2026-08-16');
    assert.equal(emp.tipoPunto, 'Empalme');
    assert.deepEqual(emp.sitio, { insertarDespuesDe: 'LN-627 E03' });
    assert.equal(emp.funcionEstructural, 'Suspensión');
    assert.equal(emp.funcionConfirmada, false, 'este papel NO lo firmó él: queda supuesto');

    const fin = decisionVigente(LIBRO, LINEA, 'LN-627 PORTICO FIN');
    assert.equal(fin.decididoEn, '2026-08-16');
    assert.equal(fin.tipoPunto, 'Estructura');
    assert.deepEqual(fin.sitio, { insertarAlFinal: true });
    assert.equal(fin.funcionEstructural, 'Terminal');
    assert.equal(fin.funcionConfirmada, true, 'éste SÍ lo firmó, el 17 de agosto');
    assert.equal(fin.funcionConfirmadaEn, '2026-08-17');
  });

  test('un punto sobre el que él NO decidió nada no recibe ningún recuerdo', () => {
    // Es la mitad que importa: que no se rellene nada donde no hay decisión.
    for (const nombre of ['LN-627 E01', 'LN-627 E24', 'LN-627 EMP E05-E06']) {
      assert.equal(decisionVigente(LIBRO, LINEA, nombre), undefined,
        `«${nombre}» no tiene decisión pendiente de carga y no puede recibir ninguna`);
      assert.deepEqual(loQueSeRecuerda(decisionVigente(LIBRO, LINEA, nombre)), { valores: {}, procedencia: {} });
    }
    assert.equal(decisionVigente(LIBRO, 'LX-999', 'LN-627 E01'), undefined, 'ni se heredan de otra línea');
    assert.equal(decisionVigente(undefined, LINEA, 'LN-627 E01'), undefined, 'ni sin libro');
  });

  test('el pendiente NO se ofrece: no es una decisión y no rellena nada', () => {
    const pendientes = pendientesDe(LIBRO, LINEA);
    assert.equal(pendientes.length, 1);
    assert.equal(pendientes[0].sobre, 'LN-627 PORTICO ORIGEN');
    assert.equal(pendientes[0].estado, 'pendiente_verificacion');
    // Y no aparece por la puerta de las decisiones, ni por descuido:
    assert.equal(decisionVigente(LIBRO, LINEA, 'LN-627 PORTICO ORIGEN'), undefined);
    assert.ok(!decisionesVigentes(LIBRO, LINEA).some((d) => d.sobre === 'LN-627 PORTICO ORIGEN'));
    assert.ok(estaPendiente(LIBRO, LINEA, 'LN-627 PORTICO ORIGEN'));
  });

  test('lo recordado NO incluye el nombre ni la aprobación — las dos que él contesta siempre', () => {
    const { valores, procedencia } = loQueSeRecuerda(decisionVigente(LIBRO, LINEA, 'LN-627 PORTICO FIN'));
    assert.equal(valores.nombreCanonico, undefined,
      'el nombre lo elige él: devolverlo aquí haría que el recuerdo se auto-alimentara');
    assert.equal(valores.aprobado, undefined, 'aprobar es el acto irreversible, y el recuerdo es memoria de una intención');
    assert.equal(valores.estado, undefined);
    assert.deepEqual(Object.keys(valores).sort(),
      ['funcionConfirmada', 'funcionEstructural', 'insertarAlFinal', 'tipoPunto']);
    // Y cada valor viene con su fecha pegada: no hay forma de pintar uno sin el otro.
    assert.deepEqual(Object.keys(valores).sort(), Object.keys(procedencia).sort());
    for (const p of Object.values(procedencia)) {
      assert.equal(p.decididoEn, '2026-08-16');
      assert.match(p.sello, /decidido por usted el 16 de agosto de 2026/);
    }
  });

  test('el papel que él NO firmó se recuerda diciendo con todas las letras que queda SUPUESTO', () => {
    const { valores, procedencia } = loQueSeRecuerda(decisionVigente(LIBRO, LINEA, 'LN-627 EMP E03-E04'));
    assert.equal(valores.funcionConfirmada, false);
    assert.match(procedencia.funcionConfirmada.sello, /no firmó este papel estructural.*SUPUESTO/);
  });

  test('el sello se lee en castellano y lleva la confirmación cuando la hay', () => {
    assert.equal(enCastellano('2026-08-16'), '16 de agosto de 2026');
    assert.equal(enCastellano('2026-08-17'), '17 de agosto de 2026');
    // Una fecha ilegible se devuelve tal cual: inventarle una sería peor.
    assert.equal(enCastellano('mañana'), 'mañana');
    assert.equal(enCastellano(undefined), '');
    assert.match(selloDe(decisionVigente(LIBRO, LINEA, 'LN-627 PORTICO FIN')),
      /^decidido por usted el 16 de agosto de 2026; confirmado por usted el 17 de agosto de 2026$/);
    assert.equal(selloDe({ sobre: 'x' }), null, 'sin sello no hay frase que enseñar');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('CAMBIAR DE OPINIÓN APENDA, NO PISA — manda la ÚLTIMA fechada', () => {

  /** Un libro sintético: línea LX-001, fechas y nombres inventados. */
  const libroConDosFilas = {
    'LX-001': {
      decisiones: [
        {
          sobre: 'LX-001 A09', decididoPor: 'el Ingeniero', decididoEn: '2026-03-01',
          estado: 'aprobado', tipoPunto: 'Estructura', sitio: { insertarAlFinal: true },
          funcionEstructural: 'Terminal', funcionConfirmada: true,
          porQue: 'lo decidido el primero de marzo (mundo sintético)',
        },
        {
          sobre: 'LX-001 A09', decididoPor: 'el Ingeniero', decididoEn: '2026-05-04',
          estado: 'aprobado', tipoPunto: 'Estructura', sitio: { insertarAlFinal: true },
          funcionEstructural: 'Retención / anclaje', funcionConfirmada: true,
          porQue: 'rectifica lo del primero de marzo (mundo sintético)',
        },
      ],
      pendientes: [],
    },
  };

  test('manda la última fecha, y la primera SIGUE en el archivo', () => {
    const vigente = decisionVigente(libroConDosFilas, 'LX-001', 'LX-001 A09');
    assert.equal(vigente.decididoEn, '2026-05-04');
    assert.equal(vigente.funcionEstructural, 'Retención / anclaje');

    const historial = historialDe(libroConDosFilas, 'LX-001', 'LX-001 A09');
    assert.equal(historial.length, 2, 'la fila vieja no se borra: ese día decidió eso, y es un hecho');
    assert.equal(historial[0].funcionEstructural, 'Terminal');
  });

  test('el orden del archivo no decide: manda la fecha', () => {
    // Aunque la rectificación se escriba antes en el array, gana por fecha.
    const alReves = { 'LX-001': { decisiones: [...libroConDosFilas['LX-001'].decisiones].reverse() } };
    assert.equal(decisionVigente(alReves, 'LX-001', 'LX-001 A09').decididoEn, '2026-05-04');
  });

  test('con la MISMA fecha manda la última escrita, que es la última apendada', () => {
    const empate = {
      'LX-001': {
        decisiones: libroConDosFilas['LX-001'].decisiones.map((f, i) => ({
          ...f, decididoEn: '2026-05-04', porQue: `fila ${i} (mundo sintético)`,
        })),
      },
    };
    assert.match(decisionVigente(empate, 'LX-001', 'LX-001 A09').porQue, /fila 1/);
  });

  test('una decisión por nombre en la lista de vigentes, en el orden del recorrido', () => {
    const vigentes = decisionesVigentes(libroConDosFilas, 'LX-001');
    assert.equal(vigentes.length, 1, 'dos filas del mismo nombre son UNA decisión vigente');
    assert.equal(decisionesVigentes(LIBRO, LINEA).map((d) => d.sobre).join(' · '),
      'LN-627 EMP E03-E04 · LN-627 PORTICO FIN');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('EL EMPAREJAMIENTO LO HACE ÉL, Y SE DICE POR QUÉ', () => {

  const punto = (clave, nombreCampo, nombreCanonico = '') => ({ clave, nombreCampo, nombreCanonico });

  test('nombrado + decidido → se empareja, y la razón es SU elección', () => {
    const { emparejados, sinEmparejar } = emparejarConDecisiones(LIBRO, LINEA, [
      punto('w1', 'punto del archivo 1', 'LN-627 PORTICO FIN'),
    ]);
    assert.equal(sinEmparejar.length, 0);
    assert.equal(emparejados.length, 1);
    const e = emparejados[0];
    assert.equal(e.nombreCanonico, 'LN-627 PORTICO FIN');
    assert.equal(e.decision.decididoEn, '2026-08-16');
    assert.equal(e.evidencia, EVIDENCIA_ADMITIDA);
    assert.match(e.porQue, /Usted eligió «LN-627 PORTICO FIN»/);
    assert.match(e.porQue, /su elección, no el sistema/);
    assert.match(e.sello, /decidido por usted el 16 de agosto de 2026/);
  });

  test('SIN nombrar → NO se empareja, y se dice que el sistema no lo averigua solo', () => {
    // Es la regla dura: la pregunta «¿cuál de sus puntos es éste?» no se
    // contesta sola NUNCA. Si se dedujera, las otras cuatro se rellenarían a
    // partir de una deducción del sistema vestida con la fecha de él.
    const { emparejados, sinEmparejar } = emparejarConDecisiones(LIBRO, LINEA, [
      punto('w1', 'punto del archivo 1'),
      punto('w2', 'punto del archivo 2', '   '),
    ]);
    assert.equal(emparejados.length, 0);
    assert.equal(sinEmparejar.length, 2);
    for (const s of sinEmparejar) {
      assert.equal(s.motivo, SIN_EMPAREJAR.SIN_NOMBRAR);
      assert.match(s.porQue, /no lo averigua solo/);
      assert.match(s.porQue, /±8 m/, 'y se dice por qué la cercanía no vale');
      assert.match(s.porQue, /nombre que grabó el GPS/, 'y por qué el nombre de campo tampoco');
    }
  });

  test('nombrado pero SIN decisión → no se rellena nada, y se dice', () => {
    const { emparejados, sinEmparejar } = emparejarConDecisiones(LIBRO, LINEA, [
      punto('w1', 'punto del archivo 1', 'LN-627 E12'),
    ]);
    assert.equal(emparejados.length, 0);
    assert.equal(sinEmparejar[0].motivo, SIN_EMPAREJAR.SIN_DECISION);
    assert.match(sinEmparejar[0].porQue, /no hay ninguna decisión suya sobre ese nombre/);
  });

  test('el mismo nombre en dos puntos → NINGUNO se empareja: la certeza se perdió', () => {
    // Elegir uno de los dos sería el sistema decidiendo cuál es cuál, que es
    // justo lo que no puede hacer.
    const { emparejados, sinEmparejar } = emparejarConDecisiones(LIBRO, LINEA, [
      punto('w1', 'punto del archivo 1', 'LN-627 PORTICO FIN'),
      punto('w2', 'punto del archivo 2', 'LN-627 PORTICO FIN'),
    ]);
    assert.equal(emparejados.length, 0, 'ni siquiera el primero');
    assert.equal(sinEmparejar.length, 2);
    for (const s of sinEmparejar) {
      assert.equal(s.motivo, SIN_EMPAREJAR.NOMBRE_REPETIDO);
      assert.match(s.porQue, /no se sabe a cuál/);
    }
  });

  test('un pendiente no rellena nada ni aunque llegue a nombrarse', () => {
    // No puede llegar (no tiene semilla), pero si llegara, lo que NO puede pasar
    // es que rellene una ficha.
    const { emparejados, sinEmparejar } = emparejarConDecisiones(LIBRO, LINEA, [
      punto('w1', 'punto del archivo 1', 'LN-627 PORTICO ORIGEN'),
    ]);
    assert.equal(emparejados.length, 0);
    assert.equal(sinEmparejar[0].motivo, SIN_EMPAREJAR.PENDIENTE);
    assert.match(sinEmparejar[0].porQue, /pendiente no es descartado/i);
  });

  test('lo decidido que hoy no viene en el archivo se declara, no se pierde', () => {
    const { decisionesSinPunto } = emparejarConDecisiones(LIBRO, LINEA, [
      punto('w1', 'punto del archivo 1', 'LN-627 PORTICO FIN'),
    ]);
    assert.deepEqual(decisionesSinPunto.map((d) => d.sobre), ['LN-627 EMP E03-E04']);
  });

  test('sin puntos y sin libro no revienta nada, y no se inventa nada', () => {
    assert.deepEqual(emparejarConDecisiones(LIBRO, LINEA, []).emparejados, []);
    assert.deepEqual(emparejarConDecisiones({}, LINEA, [punto('w1', 'x', 'LN-627 E01')]).emparejados, []);
    assert.deepEqual(emparejarConDecisiones(undefined, LINEA, undefined).sinEmparejar, []);
  });

  test('emparejar NO escribe en el libro que recibe', () => {
    // Una función que «recuerda» mutando acabaría fabricando recuerdos.
    const copia = JSON.parse(JSON.stringify(LIBRO));
    emparejarConDecisiones(copia, LINEA, [
      punto('w1', 'punto del archivo 1', 'LN-627 PORTICO FIN'),
      punto('w2', 'punto del archivo 2', 'LN-627 EMP E03-E04'),
    ]);
    assert.deepEqual(copia, LIBRO);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('EL LECTOR NO CONFUNDE UNA CLAVE CON UN PUNTO', () => {

  test('solo se leen las claves CON NOMBRE: nunca `Object.keys` de la página', () => {
    // El libro de identidad sí recorre las claves de su página —allí cada clave
    // ES un nombre de punto—. Copiar aquel patrón aquí haría que una nota o una
    // clave suelta apareciera como un punto decidido por él.
    const conRuido = {
      'LX-001': {
        _nota: 'una nota cualquiera (mundo sintético)',
        'LX-001 A01': { sobre: 'LX-001 A01', decididoPor: 'el Ingeniero', decididoEn: '2026-03-01' },
        decisiones: [{
          sobre: 'LX-001 A02', decididoPor: 'el Ingeniero', decididoEn: '2026-03-02',
          estado: 'aprobado', tipoPunto: 'Estructura', sitio: { insertarAlFinal: true },
          funcionEstructural: 'Terminal', funcionConfirmada: true, porQue: 'mundo sintético',
        }],
      },
    };
    assert.deepEqual(decisionesVigentes(conRuido, 'LX-001').map((d) => d.sobre), ['LX-001 A02']);
    assert.equal(decisionVigente(conRuido, 'LX-001', 'LX-001 A01'), undefined,
      'una clave suelta de la página NO es una decisión');
  });

  test('un nombre heredado de JavaScript no pasa por decisión', () => {
    for (const hostil of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      assert.equal(decisionVigente(LIBRO, LINEA, hostil), undefined);
      assert.deepEqual(historialDe(LIBRO, LINEA, hostil), []);
      assert.equal(estaPendiente(LIBRO, LINEA, hostil), false);
    }
  });

  test('una página con formas raras no rompe la lectura', () => {
    assert.deepEqual(decisionesVigentes({ 'LX-001': { decisiones: 'no soy una lista' } }, 'LX-001'), []);
    assert.deepEqual(decisionesVigentes({ 'LX-001': [] }, 'LX-001'), []);
    assert.deepEqual(pendientesDe({ 'LX-001': { pendientes: [null, 3, 'x'] } }, 'LX-001'), []);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('IMPORTAR/ SIGUE CORRIENDO EN EL NAVEGADOR', () => {

  test('`importar/decisiones.js` no importa ni un módulo de la máquina', () => {
    // Un solo `node:` aquí y la pantalla deja de poder empaquetarse (ADR-005).
    const fuente = readFileSync(join(AQUI, '..', 'importar', 'decisiones.js'), 'utf-8');
    assert.doesNotMatch(fuente, /from\s+['"]node:/, 'importar/ corre en el navegador');
    assert.doesNotMatch(fuente, /require\s*\(/);
    assert.doesNotMatch(fuente, /createHash|crypto/, 'aquí no se acuña identidad: eso es del otro libro');
  });

  test('el libro se puede leer con un `import` de JSON, como el de identidad', () => {
    // Es lo que hará `web/src/datos/registroDecisiones.ts` con una sola línea.
    assert.doesNotThrow(() => JSON.parse(CRUDO));
    assert.ok(LIBRO[LINEA].decisiones && LIBRO[LINEA].pendientes);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL EXTRACTO CONTRA LA BÓVEDA
// ----------------------------------------------------------------------------
// ⚠️ ESTE BLOQUE SE SALTA EN CI, y esa es la limitación declarada de todo el
// diseño: la bóveda no está montada allí, así que CI no puede comprobar que el
// extracto siga reflejando lo que el Ingeniero autoró. Es la misma limitación
// que `semillas-emitidas.json` ya acepta y declara.
//
// En la máquina del Ingeniero SÍ corre, y aquí es donde se caza la deriva:
// regenerar el extracto tiene que dar exactamente el archivo que está
// commiteado, byte por byte.
// ════════════════════════════════════════════════════════════════════════════
describe('EL EXTRACTO SIGUE SIENDO LO QUE DICE LA BÓVEDA', async () => {
  const BOVEDA = join(AQUI, '..', '..', 'brain-private', 'mantenimiento-lineas-at', 'fixtures');
  const F_JULIO = join(BOVEDA, 'LN-627-geometria.json');
  const F_AGOSTO = join(BOVEDA, 'LN-627-geometria-ampliacion-2026-08.json');
  const SIN_BOVEDA = !(existsSync(F_JULIO) && existsSync(F_AGOSTO))
    && 'fixtures en la bóveda privada, no disponibles aquí (esperado en CI)';

  const { construirLibro, motivosParaNoPublicar } = await import('../herramientas/publicar-decisiones.mjs');
  const { construirApoyos } = await import('../herramientas/construir-apoyos.mjs');
  const leer = (r) => JSON.parse(readFileSync(r, 'utf-8'));
  const fixture = SIN_BOVEDA ? null : leer(F_AGOSTO);

  test('regenerar desde la bóveda da EXACTAMENTE el archivo commiteado', { skip: SIN_BOVEDA }, () => {
    const regenerado = construirLibro(fixture, { codigoLinea: LINEA, registro: SEMILLAS, yaPublicado: LIBRO });
    assert.equal(`${JSON.stringify(regenerado, null, 2)}\n`, CRUDO,
      'el extracto ya no refleja la bóveda: o alguien lo editó a mano, o la bóveda cambió y falta republicar');
  });

  test('el generador declara el extracto limpio contra la bóveda de verdad', { skip: SIN_BOVEDA }, () => {
    // Ésta es la comprobación fuerte que las de arriba NO pueden hacer: busca
    // los literales reales de la bóveda dentro de lo emitido, en vez de adivinar
    // sus formas. `33 · L-50`: la comprobación no es leer la cabecera, es buscar
    // cada valor literal en la bóveda.
    assert.deepEqual(motivosParaNoPublicar(LIBRO, fixture), []);
  });

  test('ni un punto de la bóveda se queda fuera del libro, en un lado o en el otro', () => {
    if (SIN_BOVEDA) return;
    for (const p of fixture.puntos) {
      const donde = p.estado === 'aprobado' ? 'decisiones' : 'pendientes';
      assert.ok(LIBRO[LINEA][donde].some((f) => f.sobre === p.nombreCanonico),
        `«${p.nombreCanonico}» está en la bóveda como «${p.estado}» y no aparece en ${donde} del libro público`);
    }
  });

  test('lo que el libro recuerda es lo mismo que el sembrador construiría', { skip: SIN_BOVEDA }, () => {
    // Ata las dos ramas que salen del mismo fixture: la del repositorio (el
    // sembrador, que carga de verdad) y la del navegador (este extracto). Si
    // divergen, el Ingeniero vería recordado un papel estructural distinto del
    // que el sembrador escribiría — y no reventaría nada.
    const { apoyos } = construirApoyos(LINEA, leer(F_JULIO), fixture.puntos, { ahora: '2026-08-16T00:00:00.000Z' });
    for (const fila of LIBRO[LINEA].decisiones) {
      const doc = apoyos.find((a) => a.nombreNormalizado === fila.sobre);
      assert.ok(doc, `el sembrador no construye «${fila.sobre}», pero el libro dice que está decidido`);
      assert.equal(doc.tipoPunto, fila.tipoPunto, `«${fila.sobre}»: qué es`);
      assert.equal(doc.funcionEstructural, fila.funcionEstructural, `«${fila.sobre}»: papel estructural`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA PANTALLA RECUERDA (ADR-029) — segunda mitad de la garantía
// ----------------------------------------------------------------------------
// Lo de arriba prueba que el LIBRO es memoria y no dictamen. Esto prueba que la
// PANTALLA la use como memoria: que un valor recordado no se pueda pintar sin la
// fecha que lo respalda, que las dos preguntas que él contesta siempre —cuál de
// sus puntos es, y si lo aprueba— no se hereden jamás, y que cambiar de opinión
// cueste un clic y quede escrito.
//
// La vista se EJECUTA (es TypeScript sin React). La pantalla se comprueba por
// TEXTO, igual que en `carga-pantalla.test.js`: un `.tsx` no se puede correr
// desde `node --test` sin montar un navegador, y lo que de verdad se cae no es
// una fórmula — es que la frase que distingue memoria de dictamen desaparezca.
// ════════════════════════════════════════════════════════════════════════════
import {
  AL_FINAL, actaDeLaCarga, avisoDeLaAprobacion, cambiosSobreLoRecordado, fechaDelRecuerdo,
  fichaEnBlanco, loDecididoQueEntro, loQueDejoPendiente, loQueYaDecidio, olvidarElRecuerdo,
  recordarEnLaFicha, sellosVivos, vaciarLoRecordado,
} from '../web/src/vistas/puntosNuevos.ts';

const PANTALLA_CARGAR = readFileSync(
  join(AQUI, '..', 'web', 'src', 'componentes', 'Cargar.tsx'), 'utf-8');

/** El texto contiguo de la pantalla: sin saltos de línea ni etiquetas de negrita. */
const TEXTO_PANTALLA = PANTALLA_CARGAR
  .replace(/<\/?b>/g, '').replace(/\{'\s*'\}/g, ' ').replace(/\s+/g, ' ');

// ── Un mundo inventado, con sus propias fechas ──────────────────────────────
const LX = 'LX-900';
const LIBRO_LX = {
  [LX]: {
    decisiones: [
      {
        sobre: 'LX-900 N1', decididoPor: 'el Ingeniero', decididoEn: '2026-05-04',
        estado: 'aprobado', tipoPunto: 'Empalme', sitio: { insertarDespuesDe: 'LX-900 A02' },
        funcionEstructural: 'Suspensión', funcionConfirmada: false, porQue: 'inventado',
      },
      {
        sobre: 'LX-900 N2', decididoPor: 'el Ingeniero', decididoEn: '2026-05-04',
        estado: 'aprobado', tipoPunto: 'Estructura', sitio: { insertarAlFinal: true },
        funcionEstructural: 'Terminal', funcionConfirmada: true, funcionConfirmadaEn: '2026-05-06',
        porQue: 'inventado',
      },
    ],
    pendientes: [{
      sobre: 'LX-900 P0', decididoPor: 'el Ingeniero', decididoEn: '2026-05-04',
      estado: 'pendiente_verificacion', porQue: 'inventado', seOfreceEnLaPantalla: false,
    }],
  },
};
const SITIOS = [
  { valor: 'LX-900 A02', rotulo: 'detrás de LX-900 A02', distanciaAtras_m: 10, distanciaAdelante_m: 20 },
  { valor: AL_FINAL, rotulo: 'al final de la línea, después de LX-900 A03', distanciaAtras_m: 30, distanciaAdelante_m: null },
];
const DEL_GPS = { nombreCampo: 'MARCA 3', lat: 5.001, lon: -70 };
const enBlanco = () => fichaEnBlanco('jornada.gpx', 'k1', DEL_GPS);
const decisionDe = (nombre) => decisionVigente(LIBRO_LX, LX, nombre);

// ════════════════════════════════════════════════════════════════════════════
describe('LA FICHA RECUERDA LO SUYO — y sigue sin proponer nada', () => {

  test('sin decisión previa la ficha se queda EXACTAMENTE como estaba', () => {
    // El veto de ADR-028 entero: si él no decidió nada sobre ese nombre, la
    // pantalla no rellena nada. Un campo puesto sin decisión detrás sería una
    // propuesta del sistema sobre un acto que no se puede deshacer.
    const f = { ...enBlanco(), nombreCanonico: 'LX-900 SIN-DECIDIR' };
    const r = recordarEnLaFicha(f, decisionDe('LX-900 SIN-DECIDIR'), SITIOS);
    assert.deepEqual(r.ficha, f);
    assert.deepEqual(r.procedencia, {});
    assert.deepEqual(r.noSePudoPoner, []);
  });

  test('con decisión suya se rellenan los CUATRO campos, y ni uno más', () => {
    const r = recordarEnLaFicha({ ...enBlanco(), nombreCanonico: 'LX-900 N2' }, decisionDe('LX-900 N2'), SITIOS);
    assert.equal(r.ficha.tipoPunto, 'Estructura');
    assert.equal(r.ficha.sitio, AL_FINAL);
    assert.equal(r.ficha.funcionEstructural, 'Terminal');
    assert.equal(r.ficha.funcionConfirmada, true);
    assert.deepEqual(Object.keys(r.procedencia).sort(),
      ['funcionConfirmada', 'funcionEstructural', 'sitio', 'tipoPunto']);
  });

  test('la APROBACIÓN no se hereda nunca, aunque el libro diga «aprobado»', () => {
    // Aprobar es el ACTO irreversible; el recuerdo es memoria de una intención.
    const r = recordarEnLaFicha({ ...enBlanco(), nombreCanonico: 'LX-900 N2' }, decisionDe('LX-900 N2'), SITIOS);
    assert.equal(decisionDe('LX-900 N2').estado, 'aprobado', 'el libro sí dice que lo aprobó');
    assert.equal(r.ficha.aprobado, false, 'y aun así la casilla NO se marca sola');
    assert.equal('aprobado' in r.procedencia, false, 'ni se le pone sello a una aprobación');
  });

  test('el NOMBRE tampoco se recuerda: es lo que dispara el recuerdo', () => {
    // Si saliera de aquí, el recuerdo se auto-alimentaría: el sistema elegiría
    // el punto y después se recordaría a sí mismo lo que decidió sobre él.
    const r = recordarEnLaFicha({ ...enBlanco(), nombreCanonico: 'LX-900 N1' }, decisionDe('LX-900 N1'), SITIOS);
    assert.equal(r.ficha.nombreCanonico, 'LX-900 N1', 'sigue siendo el que él eligió');
    assert.equal('nombreCanonico' in r.procedencia, false);
  });

  test('NINGÚN valor recordado viaja sin quién lo decidió y cuándo', () => {
    const r = recordarEnLaFicha({ ...enBlanco(), nombreCanonico: 'LX-900 N1' }, decisionDe('LX-900 N1'), SITIOS);
    for (const [campo, s] of Object.entries(r.procedencia)) {
      assert.equal(s.decididoPor, 'el Ingeniero', `«${campo}» sin quién lo decidió`);
      assert.match(s.decididoEn, /^\d{4}-\d{2}-\d{2}$/, `«${campo}» sin fecha`);
      assert.match(s.sello, /decidido por usted el 4 de mayo de 2026/, `«${campo}» sin sello legible`);
      assert.ok(String(s.comoSeLee).trim(), `«${campo}» sin forma de leerse`);
    }
    assert.equal(fechaDelRecuerdo(r.procedencia), '4 de mayo de 2026');
  });

  test('el papel que él NO firmó se recuerda diciendo que quedará SUPUESTO', () => {
    const r = recordarEnLaFicha({ ...enBlanco(), nombreCanonico: 'LX-900 N1' }, decisionDe('LX-900 N1'), SITIOS);
    assert.equal(r.ficha.funcionConfirmada, false);
    assert.match(r.procedencia.funcionConfirmada.sello, /quedará como SUPUESTO/);
  });

  test('una fila SIN firma y sin fecha no rellena nada — no se usa a medias', () => {
    const anonima = { sobre: 'LX-900 N1', tipoPunto: 'Estructura', funcionEstructural: 'Terminal' };
    const r = recordarEnLaFicha({ ...enBlanco(), nombreCanonico: 'LX-900 N1' }, anonima, SITIOS);
    assert.deepEqual(r.procedencia, {});
    assert.equal(r.ficha.tipoPunto, '');
  });

  test('un sitio que hoy NO se ofrece no se pone, y se dice por qué', () => {
    // Rellenar un desplegable con una opción que no existe lo deja en blanco sin
    // una sola palabra: el hueco se leería como un fallo del programa.
    const r = recordarEnLaFicha({ ...enBlanco(), nombreCanonico: 'LX-900 N1' }, decisionDe('LX-900 N1'),
      [{ valor: AL_FINAL, rotulo: 'al final', distanciaAtras_m: 1, distanciaAdelante_m: null }]);
    assert.equal(r.ficha.sitio, '');
    assert.equal('sitio' in r.procedencia, false);
    assert.equal(r.noSePudoPoner.length, 1);
    assert.match(r.noSePudoPoner[0].porQue, /detrás de LX-900 A02/);
    assert.match(r.noSePudoPoner[0].porQue, /elíjalo usted/);
  });

  test('el recuerdo NO pisa lo que él ya contestó hoy, y lo declara', () => {
    const yaContestada = { ...enBlanco(), nombreCanonico: 'LX-900 N2', tipoPunto: 'Empalme' };
    const r = recordarEnLaFicha(yaContestada, decisionDe('LX-900 N2'), SITIOS);
    assert.equal(r.ficha.tipoPunto, 'Empalme', 'manda su respuesta de hoy');
    assert.equal('tipoPunto' in r.procedencia, false, 'y no se le pega el sello de otra cosa');
    assert.match(r.noSePudoPoner.map((x) => x.porQue).join(' '), /manda su respuesta de hoy/);
  });

  test('recordar es PURO: no toca la ficha que le entra', () => {
    const f = { ...enBlanco(), nombreCanonico: 'LX-900 N2' };
    const copia = JSON.parse(JSON.stringify(f));
    recordarEnLaFicha(f, decisionDe('LX-900 N2'), SITIOS);
    assert.deepEqual(f, copia);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('UN VALOR RECORDADO NO SE PINTA JAMÁS SIN SU FECHA', () => {

  const recordada = () =>
    recordarEnLaFicha({ ...enBlanco(), nombreCanonico: 'LX-900 N2' }, decisionDe('LX-900 N2'), SITIOS);

  test('mientras el campo siga como él lo decidió, hay sello', () => {
    const { ficha, procedencia } = recordada();
    assert.deepEqual(Object.keys(sellosVivos(ficha, procedencia)).sort(),
      ['funcionConfirmada', 'funcionEstructural', 'sitio', 'tipoPunto']);
  });

  test('en cuanto lo cambia, el sello DESAPARECE — la fecha vieja no viste el valor nuevo', () => {
    // Éste es el fallo que estaría peor que no recordar nada: «Retención /
    // anclaje — decidido por usted el 4 de mayo» sobre algo que él no decidió
    // ese día sería un dictamen con firma prestada.
    const { ficha, procedencia } = recordada();
    const cambiada = { ...ficha, funcionEstructural: 'Retención / anclaje' };
    assert.equal('funcionEstructural' in sellosVivos(cambiada, procedencia), false);
    assert.equal('tipoPunto' in sellosVivos(cambiada, procedencia), true, 'los demás siguen siendo suyos');
  });

  test('«Cambiar» vacía el campo y CONSERVA el recuerdo, que es lo que permite avisar', () => {
    const { ficha, procedencia } = recordada();
    const vaciada = vaciarLoRecordado(ficha, 'funcionEstructural');
    assert.equal(vaciada.funcionEstructural, '');
    assert.equal('funcionEstructural' in sellosVivos(vaciada, procedencia), false);
    const aviso = cambiosSobreLoRecordado(vaciada, procedencia).find((c) => c.campo === 'funcionEstructural');
    assert.match(aviso.aviso, /Ha retirado «Terminal»/);
    assert.match(aviso.aviso, /no se borra/);
  });

  test('cambiar de opinión avisa, con las DOS cosas escritas', () => {
    const { ficha, procedencia } = recordada();
    const hoy = { ...ficha, funcionEstructural: 'Retención / anclaje' };
    const [cambio] = cambiosSobreLoRecordado(hoy, procedencia);
    assert.equal(cambio.campo, 'funcionEstructural');
    assert.match(cambio.aviso, /Ha cambiado «Terminal» por «Retención \/ anclaje»/);
    assert.match(cambio.aviso, /Lo que usted decidió el 4 de mayo de 2026 NO se borra/);
    assert.match(cambio.aviso, /Las dos cosas son hechos, y el acta lleva las dos/);
  });

  test('ratificar no produce ningún aviso: dejarlo como está es una respuesta', () => {
    const { ficha, procedencia } = recordada();
    assert.deepEqual(cambiosSobreLoRecordado(ficha, procedencia), []);
  });

  test('al cambiar de nombre se retira lo del recuerdo y se respeta lo que contestó él', () => {
    const { ficha, procedencia } = recordada();
    const conSuMano = { ...ficha, tipoPunto: 'Punto de referencia' };
    const limpia = olvidarElRecuerdo(conSuMano, procedencia);
    assert.equal(limpia.tipoPunto, 'Punto de referencia', 'lo que contestó él NO se le borra');
    assert.equal(limpia.funcionEstructural, '', 'lo que puso el recuerdo sí se retira');
    assert.equal(limpia.sitio, '');
    assert.equal(limpia.funcionConfirmada, false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('LO QUE ÉL YA DECIDIÓ, LO PENDIENTE, Y EL CIERRE DEL ACUSE', () => {

  const DISPONIBLES = ['LX-900 N1', 'LX-900 N2'];

  test('las filas se leen enteras, con la fecha por delante', () => {
    const filas = loQueYaDecidio(LIBRO_LX, LX, DISPONIBLES);
    assert.deepEqual(filas.map((f) => f.sobre), ['LX-900 N1', 'LX-900 N2']);
    assert.equal(filas[1].texto,
      'LX-900 N2 — usted lo aprobó el 4 de mayo de 2026. Qué es: Estructura. '
      + 'Dónde va: al final de la línea. Papel estructural: Terminal, confirmado por usted el '
      + '6 de mayo de 2026.');
    assert.equal(filas[0].texto,
      'LX-900 N1 — usted lo aprobó el 4 de mayo de 2026. Qué es: Empalme. '
      + 'Dónde va: detrás de LX-900 A02. Papel estructural: Suspensión — este NO lo firmó usted, '
      + 'así que quedará como SUPUESTO.');
  });

  test('CARGADO manda sobre FIRMADO: lo ya cargado deja de enseñarse', () => {
    // En cuanto el punto está en la base, la verdad es la base. La fila del
    // libro se queda como historia, pero deja de mandar.
    const filas = loQueYaDecidio(LIBRO_LX, LX, ['LX-900 N1']);
    assert.deepEqual(filas.map((f) => f.sobre), ['LX-900 N1']);
  });

  test('el pendiente se nombra y NO se ofrece en ninguna lista de carga', () => {
    const [p] = loQueDejoPendiente(LIBRO_LX, LX);
    assert.equal(p.sobre, 'LX-900 P0');
    assert.match(p.texto, /Pendiente por decisión suya: LX-900 P0/);
    assert.match(p.texto, /Pendiente no es descartado: no se ha perdido/);
    // Y no aparece entre lo decidido, que es lo que la pantalla ofrece.
    assert.ok(!loQueYaDecidio(LIBRO_LX, LX, ['LX-900 P0']).length,
      'un pendiente no puede colarse por la lista de decisiones');
  });

  test('el acuse cierra el círculo: qué entró de lo decidido y qué sigue pendiente', () => {
    const filas = loQueYaDecidio(LIBRO_LX, LX, DISPONIBLES);
    const frase = loDecididoQueEntro(filas, ['LX-900 N1', 'LX-900 N2'], loQueDejoPendiente(LIBRO_LX, LX));
    assert.equal(frase,
      'De lo que usted decidió el 4 de mayo de 2026, hoy entró: LX-900 N1 · LX-900 N2. '
      + 'Sigue sin cargar, porque usted lo dejó pendiente: LX-900 P0.');
  });

  test('si no entró nada de lo decidido, no se inventa una frase que lo diga', () => {
    const filas = loQueYaDecidio(LIBRO_LX, LX, DISPONIBLES);
    assert.equal(loDecididoQueEntro(filas, [], loQueDejoPendiente(LIBRO_LX, LX)), null);
  });

  test('la casilla de aprobación SIEMPRE dice que empieza vacía, y nombra la fecha si la hay', () => {
    const conRecuerdo = avisoDeLaAprobacion(decisionDe('LX-900 N2'));
    assert.match(conRecuerdo, /Que el 4 de mayo de 2026 usted lo aprobara no lo aprueba hoy/);
    assert.match(conRecuerdo, /empieza vacía siempre/);
    const sinRecuerdo = avisoDeLaAprobacion(undefined);
    assert.match(sinRecuerdo, /Aprobar es el acto, no el recuerdo/);
    assert.match(sinRecuerdo, /empieza vacía siempre/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('EL ACTA LLEVA LAS DOS COSAS: lo que firmó y lo que cargó', () => {

  const armar = (ficha, procedencia) => actaDeLaCarga({
    linea: { codigo: LX }, quien: { correo: null, organizacion: 'org', rol: 'admin' },
    cuando: '2026-05-20T12:00:00.000Z', archivos: [], fichas: [ficha],
    ignorados: [], bloqueados: [],
    resultado: { escritos: [ficha.nombreCanonico], yaEstaban: [], rechazados: [] },
    cifras: [], sellos: { [ficha.clave]: procedencia },
  });

  test('lo ratificado sale con su fecha, no como si lo hubiera decidido hoy', () => {
    const { ficha, procedencia } = recordarEnLaFicha(
      { ...enBlanco(), nombreCanonico: 'LX-900 N2', aprobado: true }, decisionDe('LX-900 N2'), SITIOS);
    const [p] = armar(ficha, procedencia).cargados;
    assert.ok(p.ratificoDeLoFirmado.some((r) => /Terminal — decidido por usted el 4 de mayo de 2026/.test(r)));
    assert.equal('cambioSobreLoFirmado' in p, false);
  });

  test('y lo que cambió también, porque las dos cosas pasaron', () => {
    const r = recordarEnLaFicha(
      { ...enBlanco(), nombreCanonico: 'LX-900 N2', aprobado: true }, decisionDe('LX-900 N2'), SITIOS);
    const hoy = { ...r.ficha, funcionEstructural: 'Retención / anclaje' };
    const [p] = armar(hoy, r.procedencia).cargados;
    assert.ok(p.cambioSobreLoFirmado.some((c) => /Ha cambiado «Terminal»/.test(c)));
  });

  test('sin nada firmado detrás, el acta no gana ninguna clave nueva', () => {
    const f = { ...enBlanco(), nombreCanonico: 'LX-900 N9', aprobado: true, tipoPunto: 'Estructura' };
    const [p] = armar(f, {}).cargados;
    assert.equal('ratificoDeLoFirmado' in p, false);
    assert.equal('cambioSobreLoFirmado' in p, false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('LA PANTALLA ESTÁ ENCHUFADA AL LIBRO, Y SOLO LO LEE', () => {

  test('lee el libro del repositorio por la única línea que lo trae', () => {
    assert.match(PANTALLA_CARGAR, /from '\.\.\/datos\/registroDecisiones'/);
    assert.match(
      readFileSync(join(AQUI, '..', 'web', 'src', 'datos', 'registroDecisiones.ts'), 'utf-8'),
      /import registro from '\.\.\/\.\.\/\.\.\/herramientas\/decisiones-firmadas\.json'/);
  });

  test('la aplicación NO escribe en el libro: no hay forma de fabricar un recuerdo', () => {
    // Un libro que la pantalla pudiera escribir es un libro donde la pantalla
    // puede FABRICAR un recuerdo, y entonces «decidido por usted» deja de ser
    // verificable y pasa a ser una afirmación del sistema sobre sí mismo.
    assert.ok(!/REGISTRO_DECISIONES\s*[.[][^=]*=[^=]/.test(PANTALLA_CARGAR));
    assert.ok(!/setRegistroDecisiones|escribirDecision/.test(PANTALLA_CARGAR));
  });

  test('el recuerdo lo dispara SU elección del nombre, no el sistema', () => {
    assert.match(PANTALLA_CARGAR, /onChange=\{\(e\) => alElegirNombre\(e\.target\.value\)\}/);
    assert.match(PANTALLA_CARGAR, /recordarEnLaFicha\(limpia, decisionFirmadaDe\(/);
  });

  test('el único sitio que pinta un valor recordado pinta SIEMPRE su sello', () => {
    // No es una cuestión de estilo: si existiera un camino que pintara
    // `comoSeLee` sin `sello`, ese camino enseñaría un dictamen con aspecto de
    // recuerdo. Por eso `comoSeLee` solo aparece dentro de `SelloRecordado`.
    const usos = [...PANTALLA_CARGAR.matchAll(/comoSeLee/g)].length;
    assert.equal(usos, 1, 'un valor recordado se pinta fuera de SelloRecordado');
    const cuerpo = PANTALLA_CARGAR.slice(PANTALLA_CARGAR.indexOf('function SelloRecordado'));
    const componente = cuerpo.slice(0, cuerpo.indexOf('// ── La ficha de UN punto'));
    assert.match(componente, /if \(!sello\) return null;/, 'sin sello tiene que no pintar nada');
    assert.match(componente, /\{sello\.comoSeLee\}[\s\S]*\{sello\.sello\}/,
      'el valor y su fecha van juntos, en ese orden');
    assert.match(componente, /Cambiar<\/button>/, 'cambiar tiene que costar un clic, como ratificar');
  });

  test('las frases que distinguen MEMORIA de DICTAMEN están, literales', () => {
    for (const frase of [
      'Lo que usted ya decidió sobre esta línea y todavía no está cargado',
      'Esto no es una sugerencia del sistema: son decisiones suyas, con su fecha',
      'si de un dato no se puede decir quién lo decidió y cuándo, no se enseña',
      'Esta pregunta no se contesta sola nunca',
      'Lo de abajo es lo que decidió ese día, no lo que el sistema cree',
      'manda lo que usted deje hoy',
      // «Pendiente no es descartado» la escribe `loQueDejoPendiente()` en la
      // vista, junto a la fecha en que él lo dejó pendiente: es texto con dato
      // dentro, y ya lo comprueba la prueba de esa función. Aquí solo van las
      // frases que la pantalla dice por su cuenta.
      'Desde esta pantalla no se puede cargar, y no es una avería',
      'Cuando usted lo verifique en campo, se abre por el repositorio, no por aquí',
    ]) {
      assert.ok(TEXTO_PANTALLA.includes(frase), `falta por pantalla: «${frase}»`);
    }
  });

  test('la casilla de aprobación no se hereda, y la pantalla lo dice', () => {
    assert.match(PANTALLA_CARGAR, /checked=\{ficha\.aprobado\}/);
    assert.match(PANTALLA_CARGAR, /\{avisoAprobacion\}/, 'la explicación va SIEMPRE, haya recuerdo o no');
    assert.ok(!/aprobado:\s*true/.test(PANTALLA_CARGAR), 'nada marca la aprobación por su cuenta');
  });

  test('el punto pendiente no se cuenta en el botón ni en ninguna lista de carga', () => {
    // El botón sigue diciendo «los 2 puntos que ha aprobado», nunca 3.
    assert.match(PANTALLA_CARGAR, /const cuantos = plan\?\.documentos\.length \?\? 0;/);
    assert.ok(!/dejadoPendiente\.length \+|\+ dejadoPendiente/.test(PANTALLA_CARGAR),
      'lo pendiente no puede sumarse a ningún recuento');
    assert.ok(!/nombres=\{[^}]*dejadoPendiente/.test(PANTALLA_CARGAR),
      'lo pendiente no puede alimentar el desplegable');
  });

  test('ni un color escrito a mano: el color va por el tablero de la hoja', () => {
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(PANTALLA_CARGAR), 'hay un color a mano en la pantalla');
    assert.ok(!/style=\{\{/.test(PANTALLA_CARGAR), 'un estilo en línea se sale del tablero de color');
  });

  test('el Ingeniero no ve el nombre de ningún campo de la máquina', () => {
    const visible = TEXTO_PANTALLA.replace(/className="[^"]*"/g, '');
    for (const jerga of ['funcionEstructural:', 'tipoPunto:', 'nombreCanonico:', 'procedencia:']) {
      assert.ok(!visible.includes(`>${jerga}`), `«${jerga}» sale por pantalla`);
    }
  });
});
