// ============================================================================
// tests/cargar-cargabilidad.test.js — cargar el histórico sin escribir de más
// ----------------------------------------------------------------------------
// QUÉ PRUEBA. `herramientas/cargar-cargabilidad.mjs` mete en la base los días ya
// procesados por los pasos 0·1·2. Es la herramienta con las consecuencias más
// caras de todo el repositorio: `firestore.rules` PROHÍBE borrar las tres
// colecciones de cargabilidad («un histórico del que se puede quitar una hora
// incómoda no es un histórico»), así que **todo lo que escriba se queda para
// siempre**. Lo que no puede fallar en silencio:
//
//   · un día con UNA hora cuyo sello no sea «Actual» se aparta ENTERO —decisión
//     del Ingeniero, 2026-09-20— y se dice por qué;
//   · un día bueno entra completo, con su documento, su resumen y su identidad;
//   · un documento que no cabe en su molde NO se manda, y no se manda NADA;
//   · lo ya guardado e idéntico no se reescribe, y lo guardado y DISTINTO no se
//     pisa sin que el Ingeniero lo pida;
//   · el recuento de lo leído contra lo escrito se comprueba, y si no cuadra se
//     para (`feedback: guardado parcial silencioso`);
//   · **en seco no se abre ninguna conexión** y `firebase-admin` no se importa.
//
// ⚠️ DATOS SINTÉTICOS. Las etiquetas reales del SCADA llevan la subestación y la
// bahía del cliente y este repositorio es PÚBLICO (`CLAUDE.md §3.1`, `33 · L-07`):
// aquí todo es inventado —`/SubA`, `BAHIA1`, línea `LX-1`— y los archivos se
// crean en una carpeta temporal que se borra al acabar.
//
// ⚠️ NINGUNA PRUEBA TOCA LA RED NI PIDE CREDENCIAL. Las que necesitan decidir
// contra «lo que ya hay guardado» llaman a las piezas PURAS que la herramienta
// exporta, no a Firestore.
// ============================================================================
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { empaquetarPorDia, resumirDia } from '../nucleo/cargabilidad.js';
import {
  ARCHIVOS_POR_CARGA as TOPE_DEL_NUCLEO,
  repartirEnLotes as repartirEnLotesDelNucleo,
} from '../nucleo/cargaPorLotes.js';
import {
  apartadosParaElRastro, ARCHIVOS_POR_CARGA, armarDocumentos, cuadre, decidirEscritura, leerArgumentos,
  mismoContenido, NO_SE_COMPARAN, partidaDeNacimiento, repartirEnLotes, validarDocumentos, VERSION_MOTOR,
} from '../herramientas/cargar-cargabilidad.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const HERRAMIENTA = join(AQUI, '..', 'herramientas', 'cargar-cargabilidad.mjs');

const ORG = 'org-de-prueba';
const UID = 'uid-de-prueba';
const LINEA = 'LX-1';
const AHORA = '2026-04-25T12:00:00.000Z';
const CARGA_ID = '6f1f5e2e-2a3c-4f8e-9a1d-0b7c2d3e4f50';

const temporales = [];
after(() => { for (const d of temporales) rmSync(d, { recursive: true, force: true }); });

// ── Los ladrillos de un archivo ancho de SCADA, inventados ──────────────────
/** La fila del eje: 24 horas del día escrito tal cual (`20/04/26`). */
const eje = (dia) => ['', ...Array.from({ length: 24 }, (_, h) => `${dia} ${h}:00`)].join(',');
const etiqueta = (senal) => `/SubA    /66kV    /BAHIA1  /${senal}     /Momento`;
/** Una fila de señal: 24 celdas, la de la hora `h` la da `celda(h)`. */
const fila = (senal, celda) => [etiqueta(senal), ...Array.from({ length: 24 }, (_, h) => celda(h))].join(',');
/** 24 sellos: `malo` en las horas de `horas`, «Actual» en el resto. */
const sellos = (horas = [], malo = 'Not Renewed') => (h) => (horas.includes(h) ? malo : 'Actual');

/** Un día de medidas: las tres corrientes y la tensión RS. */
const medidas = (dia, { base = 200 } = {}) => [
  eje(dia),
  fila('I R', (h) => base + h),
  fila('I S', (h) => base + h + 2),
  fila('I T', (h) => base + h + 1),
  fila('U RS', (h) => 68 + (h % 5) / 10),
];

/** Escribe `{ 'ruta/archivo.csv': [líneas] }` debajo de `base`. */
function montar(base, arbol) {
  mkdirSync(base, { recursive: true });
  for (const [ruta, lineas] of Object.entries(arbol)) {
    mkdirSync(dirname(join(base, ruta)), { recursive: true });
    writeFileSync(join(base, ruta), `${typeof lineas === 'string' ? lineas : lineas.join('\n')}\n`);
  }
}

/**
 * Monta el paso 2 y la bahía del paso 1, corre la herramienta y devuelve la
 * consola, el código de salida y el informe `--json` (que cae FUERA del repo,
 * en el temporal: la herramienta se niega a escribirlo dentro).
 */
function correr(paso2, { bahia = null, extra = [], antesDelGuion = [], env = {} } = {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'cargar-cargabilidad-'));
  temporales.push(raiz);
  const dias = join(raiz, 'dias');
  montar(dias, paso2);
  const argv = [...antesDelGuion, HERRAMIENTA, '--linea', LINEA, '--origen', dias, '--org', ORG, '--uid', UID];
  if (bahia) { const b = join(raiz, 'bahia'); montar(b, bahia); argv.push('--sellos', b); }
  const json = join(raiz, 'salida', 'plan.json');
  argv.push('--json', json, ...extra);
  const r = spawnSync(process.execPath, argv, {
    encoding: 'utf8',
    env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: '', ...env },
  });
  return {
    codigo: r.status,
    texto: `${r.stdout ?? ''}${r.stderr ?? ''}`,
    plan: existsSync(json) ? JSON.parse(readFileSync(json, 'utf8')) : null,
    raiz,
  };
}

/** Todos los días que la corrida escribiría, de todos los lotes. */
const diasDelPlan = (plan) => plan.lotes.flatMap((l) => l.dias);

// ════════════════════════════════════════════════════════════════════════════
// EL CASO NORMAL: un día bueno entra entero; uno con sello malo se aparta entero
// ════════════════════════════════════════════════════════════════════════════
const CASO = {
  paso2: {
    'maximo-20260420.csv': medidas('20/04/26'),
    'promedio-20260420.csv': medidas('20/04/26', { base: 190 }),
    'maximo-20260421.csv': medidas('21/04/26'),
    'promedio-20260421.csv': medidas('21/04/26', { base: 190 }),
  },
  bahia: {
    // El 20 está limpio; el 21 trae «Not Renewed» de 10 a 12 h en una sola señal.
    'Abril/20/ir_quality-20260420.csv': [eje('20/04/26'), fila('I R', sellos())],
    'Abril/20/urs_quality-20260420.csv': [eje('20/04/26'), fila('U RS', sellos())],
    'Abril/21/ir_quality-20260421.csv': [eje('21/04/26'), fila('I R', sellos([10, 11, 12]))],
    'Abril/21/urs_quality-20260421.csv': [eje('21/04/26'), fila('U RS', sellos())],
    // La bahía trae también medidas: NO se leen, los valores salen del paso 2.
    'Abril/21/ir_current-20260421.csv': medidas('21/04/26'),
  },
};

describe('EL DÍA CON UN SELLO QUE NO ES «Actual» SE APARTA ENTERO', () => {
  test('el 21 se aparta con su motivo, y el 20 —limpio— entra', () => {
    const { codigo, texto, plan } = correr(CASO.paso2, { bahia: CASO.bahia, extra: ['--seco'] });
    assert.equal(codigo, 0, texto);

    assert.equal(plan.apartados.length, 1);
    assert.equal(plan.apartados[0].fecha, '2026-04-21');
    assert.match(plan.apartados[0].porQue, /Not Renewed/);
    assert.match(plan.apartados[0].porQue, /10, 11, 12 h/);

    const escritos = diasDelPlan(plan);
    assert.deepEqual([...new Set(escritos.map((d) => d.fecha))], ['2026-04-20'],
      'del 21 no se escribe NADA: ni las horas buenas, el día entero queda fuera');
    assert.match(texto, /1 DÍA\(S\) APARTADOS — el día entero, no las horas malas/);
  });

  test('⚠️ se aparta el DÍA, no las horas: el 21 no deja ni un documento con sus 21 horas buenas', () => {
    const { plan } = correr(CASO.paso2, { bahia: CASO.bahia, extra: ['--seco'] });
    assert.equal(diasDelPlan(plan).filter((d) => d.fecha === '2026-04-21').length, 0);
    // Y sus cuatro archivos quedan CONTADOS como apartados, no desaparecidos.
    assert.equal(plan.cuadre.archivos.apartados, 2, 'los dos archivos del 21');
    assert.equal(plan.cuadre.archivos.escritos, 2, 'los dos del 20');
    assert.equal(plan.leido.archivos, 4);
  });

  test('el motivo NO lleva la etiqueta del SCADA: ni subestación ni bahía salen del informe', () => {
    const { plan, texto } = correr(CASO.paso2, { bahia: CASO.bahia, extra: ['--seco'] });
    // La etiqueta inventada de esta prueba hace de centinela: si algún día el
    // motivo empezara a copiarla, aquí se vería —y en producción sería el nombre
    // de una subestación real dentro de un informe que se pega donde sea.
    assert.doesNotMatch(JSON.stringify(plan), /SubA|BAHIA1/);
    assert.doesNotMatch(texto, /SubA|BAHIA1/);
  });
});

describe('EL DÍA BUENO ENTRA ENTERO, Y CON LA IDENTIDAD QUE USA LA PANTALLA', () => {
  test('un documento por día Y estadístico, con sus 24 horas y su resumen', () => {
    const { plan } = correr(CASO.paso2, { bahia: CASO.bahia, extra: ['--seco'] });
    const escritos = diasDelPlan(plan).sort((a, b) => a.estadistico.localeCompare(b.estadistico));
    assert.equal(escritos.length, 2, 'el máximo y el promedio del 20 son DOS documentos, no uno');
    assert.deepEqual(escritos.map((d) => d.estadistico), ['maximo', 'promedio']);
    for (const d of escritos) assert.equal(d.horas, 24);

    // ⚠️ El máximo NO lleva sufijo y los demás SÍ (`99 §ADR-112`): es la
    // identidad con la que la pantalla ya escribió LN-627, y cambiarla
    // duplicaría el histórico sin poder retirar el viejo.
    assert.equal(escritos[0].id, `${ORG}__lx-1__-__2026-04-20`);
    assert.equal(escritos[1].id, `${ORG}__lx-1__-__2026-04-20__promedio`);

    assert.equal(plan.lotes[0].resumenes, 2, 'un resumen por documento de día');
    assert.deepEqual(plan.porEstadistico.maximo, { dias: 1, horas: 24, apartados: 1 });
  });

  test('el cuadre suma: archivos leídos = escritos + apartados, y lecturas = horas', () => {
    const { plan, texto } = correr(CASO.paso2, { bahia: CASO.bahia, extra: ['--seco'] });
    const c = plan.cuadre;
    assert.equal(c.archivos.escritos + c.archivos.apartados + c.archivos.fuera
      + c.archivos.sinRegistros.length, plan.leido.archivos);
    assert.equal(c.lecturas, c.horas, 'ninguna lectura se pierde al empaquetar');
    assert.equal(c.horas, 48, '24 horas × 2 estadísticos del único día que entra');
    assert.match(texto, /✅ todos pasan/);
  });

  test('sin sellos no se carga nada: ninguna hora se puede dar por medida', () => {
    const { codigo, texto, plan } = correr(CASO.paso2, { extra: ['--seco'] });
    assert.equal(codigo, 1);
    assert.match(texto, /NINGÚN archivo de sello/);
    assert.match(texto, /--sellos <carpeta del paso 1>/);
    assert.equal(plan, null, 'ni siquiera se escribe el informe: no hay nada que informar');
  });

  test('un archivo cuyo nombre no dice el estadístico para la carga ENTERA', () => {
    const { codigo, texto } = correr({
      ...CASO.paso2, 'loquesea-20260422.csv': medidas('22/04/26'),
    }, { bahia: CASO.bahia, extra: ['--seco'] });
    assert.equal(codigo, 1);
    assert.match(texto, /no dicen en su nombre qué estadístico traen/);
    assert.match(texto, /loquesea-20260422\.csv/);
    assert.match(texto, /No se ha escrito nada/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL MOLDE: lo que no cabe no se manda, y con él no se manda NADA
// ════════════════════════════════════════════════════════════════════════════
describe('UN DOCUMENTO QUE NO PASA EL MOLDE PARA LA CARGA ENTERA', () => {
  /** Una corriente NEGATIVA: el molde la niega (`corriente_A: min(0)`). */
  const conCorrienteNegativa = {
    ...CASO.paso2,
    'maximo-20260422.csv': [eje('22/04/26'), fila('I R', (h) => (h === 5 ? -7 : 200 + h))],
  };
  const bahiaCon22 = {
    ...CASO.bahia,
    'Abril/22/ir_quality-20260422.csv': [eje('22/04/26'), fila('I R', sellos())],
  };

  test('se dice CUÁL y POR QUÉ, y no se escribe ningún documento de ningún lote', () => {
    const { codigo, texto, plan } = correr(conCorrienteNegativa, { bahia: bahiaCon22, extra: ['--seco'] });
    assert.equal(codigo, 1);
    assert.match(texto, /NO pasan su molde/);
    assert.match(texto, new RegExp(`${ORG}__lx-1__-__2026-04-22`), 'se nombra el documento');
    assert.match(texto, /corriente/i, 'y el campo que lo tumba');
    assert.match(texto, /No se ha escrito nada/);
    assert.ok(plan.moldeRechaza.length >= 1, 'el informe deja escrito qué rechazó el molde');
  });

  test('sin el día malo, los mismos archivos pasan: el molde rechaza el dato, no la herramienta', () => {
    const { codigo, texto } = correr(CASO.paso2, { bahia: bahiaCon22, extra: ['--seco'] });
    assert.equal(codigo, 0, texto);
    assert.match(texto, /✅ todos pasan/);
  });

  test('⚠️ UNA hora mala tumba el día y su RESUMEN pasa: por eso se validan los dos', () => {
    // El resumen es derivado y resume con el MÁXIMO, así que una corriente
    // negativa a las 3 h no lo toca: su `corrienteMaxima_A` sigue siendo la de
    // las 23 h y cabe en el molde. Si solo se validara el resumen, este día
    // habría entrado en la base con una hora que el molde niega.
    const lote = loteSintetico({ corriente: (h) => (h === 3 ? -1 : 100 + h) });
    const { malos, salida } = validarDocumentos(armarDocumentos(lote, contexto()));
    assert.equal(malos.length, 1, malos.join('\n'));
    assert.match(malos[0], /^el día «org-de-prueba__lx-1__-__2026-04-20» · horas\.03\.corriente_A/);
    assert.equal(salida.dias.length, 0, 'lo que no pasa no llega a la lista de lo que se manda');
    assert.equal(salida.resumenes.length, 1, 'el resumen sí cabe — y por eso hay que mirar el día');
  });

  test('cuando la cifra mala también asoma en el resumen, se nombran los dos', () => {
    const lote = loteSintetico({ corriente: () => -1 });
    const { malos, salida } = validarDocumentos(armarDocumentos(lote, contexto()));
    assert.ok(malos.some((m) => m.startsWith('el día «')), malos.join('\n'));
    assert.ok(malos.some((m) => m.startsWith('el resumen «')), malos.join('\n'));
    assert.equal(salida.dias.length, 0);
    assert.equal(salida.resumenes.length, 0);
  });

  test('un día correcto pasa los tres moldes —día, resumen y rastro de carga—', () => {
    const { malos, salida } = validarDocumentos(armarDocumentos(loteSintetico(), contexto()));
    assert.deepEqual(malos, []);
    assert.equal(salida.dias.length, 1);
    assert.equal(salida.resumenes.length, 1);
    assert.equal(salida.carga.doc.estado, 'guardada');
    assert.deepEqual(salida.carga.doc.lineas, [LINEA]);
    assert.deepEqual(salida.carga.doc.estadisticos, ['maximo']);
    assert.equal(salida.carga.doc.versionMotor, VERSION_MOTOR);
    assert.ok(salida.carga.doc.nombreArchivo.length <= 260,
      'el rótulo corto existe porque cien nombres pegados tumbaban el guardado entero');
  });
});

// ── Un lote sintético, por el mismo camino que la herramienta ───────────────
/** Registros → `empaquetarPorDia` → `resumirDia` → el lote que arma documentos. */
function loteSintetico({ corriente = (h) => 100 + h, fecha = '2026-04-20', estadistico = 'maximo' } = {}) {
  const registros = Array.from({ length: 24 }, (_, h) => ({
    linea: LINEA, circuito: null, fecha, hora: h, estadistico,
    corriente_A: corriente(h), corrienteR_A: corriente(h), tension_kV: 68.1,
  }));
  const { dias } = empaquetarPorDia(registros);
  return {
    indice: 1,
    dias,
    resumenes: dias.map((d) => resumirDia(d)),
    registros,
    archivos: [`${estadistico}-${fecha.replaceAll('-', '')}.csv`],
    huella: 'a'.repeat(64),
    filas: 2,
    presentes: [estadistico],
    fechas: [fecha],
  };
}
const contexto = (extra = {}) => ({
  org: ORG, uid: UID, ahora: AHORA, linea: LINEA, totalLotes: 1, nuevoId: () => CARGA_ID, ...extra,
});

// ════════════════════════════════════════════════════════════════════════════
// IDEMPOTENCIA: lo idéntico no se reescribe; lo distinto no se pisa
// ════════════════════════════════════════════════════════════════════════════
describe('IDEMPOTENCIA', () => {
  /** Lo que estaría guardado: el mismo documento, con otra partida y otra carga. */
  const comoSiEstuvieraGuardado = (x, cambios = {}) => ({
    ...x.doc,
    creadoEn: '2026-01-01T00:00:00.000Z',
    creadoPor: 'otra-persona',
    revision: 4,
    cargaId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    ...cambios,
  });

  test('volver a cargar lo mismo NO reescribe nada', () => {
    const { salida } = validarDocumentos(armarDocumentos(loteSintetico(), contexto()));
    const docs = [...salida.dias, ...salida.resumenes];
    const previos = new Map(docs.map((x) => [`${x.coleccion}/${x.id}`, comoSiEstuvieraGuardado(x)]));

    const d = decidirEscritura(docs, previos);
    assert.equal(d.nuevos.length, 0);
    assert.equal(d.distintos.length, 0);
    assert.equal(d.identicos.length, docs.length);
  });

  test('lo que no existe nace', () => {
    const { salida } = validarDocumentos(armarDocumentos(loteSintetico(), contexto()));
    const docs = [...salida.dias, ...salida.resumenes];
    const d = decidirEscritura(docs, new Map());
    assert.equal(d.nuevos.length, docs.length);
    assert.equal(d.identicos.length, 0);
    assert.equal(d.distintos.length, 0);
  });

  test('⚠️ una cifra distinta NO se pisa: se devuelve como «distinto» con lo que había', () => {
    const { salida } = validarDocumentos(armarDocumentos(loteSintetico(), contexto()));
    const dia = salida.dias[0];
    const guardado = comoSiEstuvieraGuardado(dia);
    guardado.horas = { ...guardado.horas, '05': { ...guardado.horas['05'], corriente_A: 999 } };

    const d = decidirEscritura([dia], new Map([[`${dia.coleccion}/${dia.id}`, guardado]]));
    assert.equal(d.identicos.length, 0);
    assert.equal(d.distintos.length, 1);
    assert.equal(d.distintos[0].previo.horas['05'].corriente_A, 999,
      'se devuelve lo que HABÍA, para poder decir en qué se diferencia');
  });

  test('⚠️ otra VERSIÓN DE MOTOR con las mismas cifras es idéntico: se dice, no se reescribe', () => {
    const { salida } = validarDocumentos(armarDocumentos(loteSintetico(), contexto()));
    const dia = salida.dias[0];
    const guardado = comoSiEstuvieraGuardado(dia, { versionMotor: '0.0.1-vieja' });

    const d = decidirEscritura([dia], new Map([[`${dia.coleccion}/${dia.id}`, guardado]]));
    assert.equal(d.identicos.length, 1, 'reescribir 800 días por un cambio de versión no corrige nada');
    assert.equal(d.distintos.length, 0);
    assert.deepEqual(d.otroMotor.map((x) => x.versionMotor), ['0.0.1-vieja']);
  });

  test('el orden de las claves no cuenta: Firestore no devuelve los campos como se escribieron', () => {
    const { salida } = validarDocumentos(armarDocumentos(loteSintetico(), contexto()));
    const dia = salida.dias[0];
    const alReves = Object.fromEntries(Object.entries(dia.doc).reverse());
    alReves.horas = Object.fromEntries(Object.entries(alReves.horas).reverse());
    assert.ok(mismoContenido(dia.doc, alReves));
  });

  test('la metadata que cambia en cada pasada NO se compara', () => {
    for (const campo of NO_SE_COMPARAN) {
      assert.ok(mismoContenido({ linea: LINEA, [campo]: 'a' }, { linea: LINEA, [campo]: 'b' }),
        `«${campo}» no puede decidir si un día cambió`);
    }
    assert.equal(mismoContenido({ linea: LINEA, fecha: '2026-04-20' }, { linea: LINEA, fecha: '2026-04-21' }), false);
  });

  test('⚠️ reescribir NO toca la partida de nacimiento: `creadoEn`, `creadoPor` y la revisión', () => {
    // `firestore.rules` deniega cualquier escritura que cambie esos campos
    // (`99 §ADR-111`). Con la llave de administrador las reglas no se aplican, así
    // que esto es la única barrera que queda.
    const previo = { creadoEn: '2026-01-01T00:00:00.000Z', creadoPor: 'otra-persona', revision: 4 };
    assert.deepEqual(partidaDeNacimiento(previo, { ahora: AHORA, uid: UID }), {
      creadoEn: '2026-01-01T00:00:00.000Z', creadoPor: 'otra-persona',
      revision: 5, actualizadoEn: AHORA, actualizadoPor: UID,
    });
    assert.deepEqual(partidaDeNacimiento(undefined, { ahora: AHORA, uid: UID }),
      { creadoEn: AHORA, creadoPor: UID, revision: 0 });
  });

  test('un día que ya existe se arma con SU partida, no con una nueva', () => {
    const lote = loteSintetico();
    const { dias } = armarDocumentos(lote, contexto());
    const previos = new Map([[`${dias[0].coleccion}/${dias[0].id}`, {
      creadoEn: '2026-01-01T00:00:00.000Z', creadoPor: 'otra-persona', revision: 0,
    }]]);
    const otra = armarDocumentos(lote, contexto({ previos }));
    assert.equal(otra.dias[0].doc.creadoEn, '2026-01-01T00:00:00.000Z');
    assert.equal(otra.dias[0].doc.creadoPor, 'otra-persona');
    assert.equal(otra.dias[0].doc.revision, 1);
    assert.equal(otra.dias[0].doc.actualizadoPor, UID);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL CUADRE: si no suma, no se escribe
// ════════════════════════════════════════════════════════════════════════════
describe('EL CUADRE QUE FALLA PARA LA CARGA', () => {
  const bien = { archivos: 4, explicados: 4, documentos: 2, resumenes: 2, lecturas: 48, horas: 48 };

  test('cuando todo suma, no hay nada que decir', () => {
    assert.deepEqual(cuadre(bien), []);
  });

  test('un archivo que ni se escribe, ni se aparta, ni se dice', () => {
    const d = cuadre({ ...bien, explicados: 3 });
    assert.equal(d.length, 1);
    assert.match(d[0], /4 archivo\(s\) de medidas y solo 3 explicados/);
  });

  test('un día sin su resumen: el tablero leería un histórico que no existe', () => {
    const d = cuadre({ ...bien, resumenes: 1 });
    assert.equal(d.length, 1);
    assert.match(d[0], /tiene que haber uno de cada/);
  });

  test('⚠️ lecturas que se pierden al empaquetar: el guardado parcial silencioso', () => {
    const d = cuadre({ ...bien, horas: 47 });
    assert.equal(d.length, 1);
    assert.match(d[0], /alguna se perdió al empaquetar/);
  });

  test('varios desajustes a la vez se dicen todos, no solo el primero', () => {
    assert.equal(cuadre({ archivos: 4, explicados: 2, documentos: 2, resumenes: 1, lecturas: 48, horas: 1 }).length, 3);
  });

  test('un archivo que no produce ninguna lectura se NOMBRA, no desaparece', () => {
    // Un día cuyo archivo trae el eje pero ninguna celda con número: no se
    // escribe nada de él, y por eso tiene que salir con su nombre y su fecha.
    const sinNumeros = {
      ...CASO.paso2,
      'minimo-20260423.csv': [eje('23/04/26'), fila('I R', () => 'n/d')],
    };
    const { codigo, texto, plan } = correr(sinNumeros, { bahia: CASO.bahia, extra: ['--seco'] });
    assert.equal(codigo, 0, texto);
    assert.match(texto, /sin lecturas: minimo-20260423\.csv · 2026-04-23 · minimo/);
    assert.equal(plan.cuadre.archivos.sinRegistros.length, 1);
    // Y el recuento sigue sumando: lo que no entra queda EXPLICADO.
    const c = plan.cuadre.archivos;
    assert.equal(c.escritos + c.apartados + c.fuera + c.sinRegistros.length, plan.leido.archivos);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LOS LOTES: cien archivos como mucho, y ningún día partido
// ════════════════════════════════════════════════════════════════════════════
describe('LOS LOTES', () => {
  test('nunca se pasan del tope, y un día viaja entero', () => {
    const dias = Array.from({ length: 60 }, (_, i) => ({ fecha: `d${i}`, archivos: 4 }));
    const lotes = repartirEnLotes(dias, { tope: 100 });
    assert.ok(lotes.every((l) => l.archivos <= 100));
    assert.equal(lotes.reduce((k, l) => k + l.elementos.length, 0), 60, 'no se pierde ningún día');
    assert.equal(lotes.flatMap((l) => l.elementos).filter((d) => d.fecha === 'd12').length, 1,
      'ni se duplica ninguno');
  });

  test('un día más grande que el tope va solo, no se parte', () => {
    const lotes = repartirEnLotes([{ fecha: 'a', archivos: 2 }, { fecha: 'b', archivos: 150 }], { tope: 100 });
    assert.equal(lotes.length, 2);
    assert.deepEqual(lotes[1].elementos.map((d) => d.fecha), ['b']);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EN SECO NO SE ABRE NINGUNA CONEXIÓN
// ════════════════════════════════════════════════════════════════════════════
describe('EN SECO NO SE TOCA LA RED', () => {
  /**
   * Un cerrojo que se precarga con `--import`: revienta si alguien abre un
   * socket o si alguien importa `firebase-admin`. Va en un temporal, fuera del
   * repositorio, y se borra con los demás.
   */
  function cerrojo() {
    const dir = mkdtempSync(join(tmpdir(), 'cerrojo-red-'));
    temporales.push(dir);
    writeFileSync(join(dir, 'ganchos.mjs'), `
export async function resolve(especificador, contexto, siguiente) {
  if (/^firebase-admin/.test(especificador)) {
    throw new Error('SE IMPORTÓ FIREBASE-ADMIN: ' + especificador);
  }
  return siguiente(especificador, contexto);
}
`);
    writeFileSync(join(dir, 'cerrojo.mjs'), `
import { register } from 'node:module';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
register(new URL('./ganchos.mjs', import.meta.url));
const reventar = () => { throw new Error('SE ABRIÓ UNA CONEXIÓN EN MODO SECO'); };
net.Socket.prototype.connect = reventar;
net.connect = reventar; net.createConnection = reventar;
tls.connect = reventar;
dns.lookup = reventar; dns.promises.lookup = reventar;
`);
    return ['--import', pathToFileURL(join(dir, 'cerrojo.mjs')).href];
  }

  test('con la red y `firebase-admin` cerrados a cal y canto, «--seco» termina bien', () => {
    const { codigo, texto, plan } = correr(CASO.paso2, {
      bahia: CASO.bahia, extra: ['--seco'], antesDelGuion: cerrojo(),
    });
    assert.equal(codigo, 0, texto);
    assert.doesNotMatch(texto, /SE ABRIÓ UNA CONEXIÓN|SE IMPORTÓ FIREBASE-ADMIN/);
    assert.match(texto, /no se ha tocado la red, no se ha pedido credencial y no se ha escrito nada/);
    assert.ok(plan.seco);
  });

  test('y el cerrojo NO es decorativo: sin «--seco» salta al ir a importar firebase-admin', () => {
    // El control negativo de la prueba de arriba. Con una llave (falsa) puesta,
    // la herramienta entra en el camino de escritura y lo primero que hace es
    // importar `firebase-admin` — que el cerrojo niega. Si esto dejara de
    // saltar, la prueba de arriba habría dejado de probar nada.
    const dir = mkdtempSync(join(tmpdir(), 'llave-falsa-'));
    temporales.push(dir);
    const llave = join(dir, 'llave.json');
    writeFileSync(llave, JSON.stringify({ project_id: 'no-existe', client_email: 'x@y.z', private_key: 'no' }));

    const { codigo, texto } = correr(CASO.paso2, {
      bahia: CASO.bahia, antesDelGuion: cerrojo(), env: { GOOGLE_APPLICATION_CREDENTIALS: llave },
    });
    assert.notEqual(codigo, 0);
    assert.match(texto, /SE IMPORTÓ FIREBASE-ADMIN/);
  });

  test('sin «--seco» y sin llave no se hace nada, y se explica cómo conseguirla', () => {
    const { codigo, texto } = correr(CASO.paso2, { bahia: CASO.bahia });
    assert.equal(codigo, 2);
    assert.match(texto, /Falta la credencial de administrador/);
    assert.match(texto, /GOOGLE_APPLICATION_CREDENTIALS/);
    assert.match(texto, /--seco/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LOS FRENOS DE USO
// ════════════════════════════════════════════════════════════════════════════
describe('LOS FRENOS', () => {
  test('el informe NO se escribe dentro del repositorio, que es público', () => {
    const dentro = join(AQUI, '..', 'no-deberia-existir.json');
    const r = spawnSync(process.execPath, [
      HERRAMIENTA, '--linea', LINEA, '--origen', AQUI, '--seco', '--json', dentro,
    ], { encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.match(r.stdout + r.stderr, /cae dentro del repositorio/);
    assert.equal(existsSync(dentro), false, 'y no lo escribió de todas formas');
  });

  test('los argumentos se leen enteros, y una opción desconocida se dice por su nombre', () => {
    const { opciones } = leerArgumentos(['--linea', 'LX-1', '--origen', '/tmp/x', '--seco',
      '--sellos', '/tmp/a', '--sellos', '/tmp/b', '--criterio-fase', 'promedio']);
    assert.equal(opciones.linea, 'LX-1');
    assert.equal(opciones.seco, true);
    assert.deepEqual(opciones.sellos, ['/tmp/a', '/tmp/b']);
    assert.equal(opciones.criterioFase, 'promedio');

    assert.match(leerArgumentos(['--lienea', 'x']).error, /opción desconocida «--lienea»/);
    assert.match(leerArgumentos(['--linea', '--seco']).error, /«--linea» necesita un valor detrás/);
  });

  test('un periodo acotado deja fuera lo de fuera, y lo dice', () => {
    const { codigo, texto, plan } = correr(CASO.paso2, {
      bahia: CASO.bahia, extra: ['--seco', '--desde', '2026-04-21'],
    });
    assert.equal(codigo, 0, texto);
    assert.deepEqual(plan.fueraDelPeriodo, ['2026-04-20']);
    assert.equal(diasDelPlan(plan).length, 0, 'el 20 queda fuera del periodo y el 21 está apartado');
    assert.match(texto, /quedan fuera del periodo pedido/);
  });

  test('«--criterio-fase» solo admite los dos criterios que existen', () => {
    const { codigo, texto } = correr(CASO.paso2, {
      bahia: CASO.bahia, extra: ['--seco', '--criterio-fase', 'mediana'],
    });
    assert.equal(codigo, 2);
    assert.match(texto, /solo admite «maxima».*«promedio»/s);
  });
});
