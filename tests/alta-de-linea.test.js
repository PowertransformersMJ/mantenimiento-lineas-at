// ============================================================================
// tests/alta-de-linea.test.js — el alta de una línea, que NO se puede deshacer
// ----------------------------------------------------------------------------
// QUÉ VIGILA, y por qué hacía falta una prueba que EJECUTE en vez de leer texto:
//
//   1. **LOS DOCUMENTOS QUE SE VAN A ESCRIBIR.** Una línea no se borra y un
//      recorrido levantado tampoco (`firestore.rules`). Lo que esta pantalla
//      arma es lo que se queda escrito para siempre, así que se comprueba campo
//      a campo Y contra el molde de verdad (`Linea`, `Levantamiento`): si el
//      documento no valida, la pantalla enseñaría un alta que la base va a
//      rechazar — o peor, la escribiría con un campo de menos.
//
//   2. **QUE SE PREGUNTE ANTES DE ESCRIBIR.** El identificador de una línea sale
//      del libro de códigos y el de un recorrido sale de la fecha y de la huella
//      del archivo: los dos son SIEMPRE el mismo. Sin la comprobación previa, el
//      segundo alta de una línea la PISA (las reglas dejan actualizarla) y el
//      segundo guardado del mismo GPX se cae con «Missing or insufficient
//      permissions» — «no tienes permiso» donde la verdad es «esto ya estaba
//      cargado» (`35 · L-24`). Aquí se demuestra con un doble de la base que
//      cuenta las lecturas y las escrituras, que es la única forma de saber que
//      el `getDoc` está DELANTE del `setDoc` y no detrás.
//
//   3. **QUE SIN PULSAR NO SE ESCRIBA NADA.** Elegir el código, aportar el
//      archivo, leer los 28 puntos y pintar la tabla entera no manda un byte.
//      Se comprueba de dos maneras: corriendo el camino entero de lectura contra
//      el doble (cero lecturas, cero escrituras) y leyendo el componente para
//      exigir que las dos escrituras vivan DENTRO de la función que solo dispara
//      el botón de confirmar.
//
//   4. **QUE EL ACUSE PUEDA CAZAR UN GUARDADO A MEDIAS.** Escribir menos de lo
//      enseñado no da error en ninguna capa (`35 · L-79`). Se fabrica ese caso
//      —la base se queda con menos puntos de los que se mandaron— y se exige que
//      el acuse lo diga en vez de contestar «hecho».
//
// ⚠️ CÓMO SE EJECUTA ALGO QUE NO SE PUEDE IMPORTAR. `AltaDeLinea.tsx` trae JSX y
// `firestore.ts` arrastra el SDK de Firebase: ninguno de los dos entra en
// `node --test`. Aquí se RECORTA LA FUENTE REAL de los dos archivos publicados
// —no una copia—, se le quitan los tipos con la herramienta de Node y se carga
// como módulo. Todo lo que DECIDE se trae de verdad: los moldes de
// `contratos/`, el catálogo de permisos de `permisos.ts`, la geodesia del núcleo
// y el libro de códigos de `importar/identidad.js`. Lo único de mentira es la
// red, que es justo lo que hay que poder contar.
//
// ⚠️ Datos SINTÉTICOS: el repositorio es público (`L-23`). Serie `LN-901`, tramo
// `TR-909`, ecuador y Greenwich. Ni una coordenada, ni un nombre de instalación.
// Los códigos del parque real (LN-617, LN-628, TR-618) sí salen, porque un
// código de línea no es un dato de cliente y el libro ya vive en este mismo
// repositorio público.
// ============================================================================
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { createHash } from 'node:crypto';

import { Levantamiento, Linea, Procedencia } from '@lineas/contratos';

// El aviso de «experimental» de la herramienta de tipos ensuciaría la salida de
// `npm test`. Se silencia SOLO ése; cualquier otro aviso sigue saliendo.
const avisosDeAntes = process.listeners('warning');
process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.name !== 'ExperimentalWarning') for (const l of avisosDeAntes) l(w);
});

const ruta = (p) => fileURLToPath(new URL('../' + p, import.meta.url));
const leer = (p) => readFileSync(ruta(p), 'utf-8');
const comoUrl = (p) => JSON.stringify(pathToFileURL(ruta(p)).href);

const PANTALLA = leer('web/src/componentes/AltaDeLinea.tsx');
const DATOS = leer('web/src/datos/firestore.ts');
const CONTRATO = leer('web/src/datos/repositorio.ts');
const LIBRO_REAL = JSON.parse(leer('herramientas/codigos-emitidos.json'));

// ════════════════════════════════════════════════════════════════════════════
// LA FUENTE REAL, RECORTADA Y EJECUTABLE
// ════════════════════════════════════════════════════════════════════════════

/**
 * Recorta del archivo publicado el cuerpo de una función, desde su firma hasta
 * la primera llave de cierre a principio de línea. Si alguien cambia la forma
 * del archivo, esto falla RUIDOSAMENTE en vez de probar un trozo equivocado.
 */
function funcionDe(texto, nombre, dondeSale) {
  // El nombre puede llevar detrás `(` o un parámetro de tipo (`<T>`): se admiten
  // los dos, y nada más — así un nombre que sea el PREFIJO de otro no se cuela.
  const firmas = ['export function ', 'export async function ', 'function ', 'async function ']
    .flatMap((f) => ['(', '<'].map((abre) => `\n${f}${nombre}${abre}`));
  const i = firmas.map((f) => texto.indexOf(f)).filter((k) => k >= 0).sort((a, b) => a - b)[0];
  assert.ok(i !== undefined, `no está \`${nombre}\` en ${dondeSale}: ¿se renombró?`);
  const j = texto.indexOf('\n}\n', i + 1);
  assert.ok(j > i, `no se encontró el final de \`${nombre}\` en ${dondeSale}`);
  const trozo = texto.slice(i + 1, j + 3);
  assert.ok(trozo.includes('return') || trozo.includes('await'),
    `\`${nombre}\` se recortó mal: no llega a su cuerpo`);
  return trozo.startsWith('export') ? trozo : `export ${trozo}`;
}

/** Igual, para una constante (`const x = …;`), que puede ocupar varias líneas. */
function constanteDe(texto, nombre, dondeSale) {
  // La declaración puede llevar su tipo escrito en medio (`const x: T = …`), así
  // que se busca el nombre y se comprueba que lo que sigue es una asignación.
  const i = texto.indexOf(`\nconst ${nombre}`);
  assert.ok(i >= 0, `no está la constante \`${nombre}\` en ${dondeSale}`);
  const igual = texto.indexOf(' = ', i);
  assert.ok(igual > i && igual < texto.indexOf('\n', i + 1) + 400,
    `\`${nombre}\` no parece una asignación en ${dondeSale}`);
  const j = texto.indexOf(';\n', i);
  assert.ok(j > i, `no se encontró el final de \`${nombre}\``);
  return 'export ' + texto.slice(i + 1, j + 1);
}

/**
 * Una función declarada DENTRO del componente, que por eso va indentada. No se
 * carga: solo se lee, para poder exigir qué vive dentro de ella y qué no.
 */
function funcionAnidadaDe(texto, nombre, dondeSale) {
  const i = texto.indexOf(`\n  async function ${nombre}(`);
  assert.ok(i >= 0, `no está \`${nombre}\` dentro del componente de ${dondeSale}: ¿se renombró?`);
  const j = texto.indexOf('\n  }\n', i);
  assert.ok(j > i, `no se encontró el final de \`${nombre}\``);
  return texto.slice(i + 1, j + 4);
}

/** Un método del objeto `repositorioFirestore`, convertido en función suelta. */
function metodoDe(nombre) {
  const i = DATOS.indexOf(`\n  async ${nombre}(`);
  assert.ok(i >= 0, `no está el método \`${nombre}\` en firestore.ts: ¿se renombró?`);
  const j = DATOS.indexOf('\n  },\n', i);
  assert.ok(j > i, `no se encontró el final de \`${nombre}\``);
  // `\n  async nombre(` → se salta el salto de línea y el `  async `.
  return `export async function ${DATOS.slice(i + 9, j + 4)}\n`;
}

/**
 * LO PURO DE LA PANTALLA. Nada de esto toca el DOM ni la red: decide qué
 * códigos se pueden ofrecer, qué dice el recorrido de sí mismo y qué documentos
 * se van a escribir.
 */
const PRELUDIO_PANTALLA = `
import { codigosDelLibro, filaDelLibro, idDelLibro, tipoDeSerie } from ${comoUrl('importar/identidad.js')};
import { estadisticasVanos } from ${comoUrl('nucleo/estadisticas.js')};
import { deflexion, margenDeAzimut, margenDeDeflexion, vanosConPintaDeTorreSinLevantar, vincenty } from ${comoUrl('nucleo/geodesia.js')};
import { horaLocalBogota } from ${comoUrl('exportar/levantamiento.js')};
import { Procedencia } from ${comoUrl('contratos/src/index.ts')};
`;

/**
 * LA CAPA DE DATOS, con un doble de la base que GUARDA y RESUELVE en vez de
 * devolver respuestas enlatadas. Es lo que permite comprobar que el `getDoc` va
 * DELANTE del `setDoc`: un doble que solo contestara «no existe» dejaría pasar
 * la versión que pregunta después de escribir.
 *
 * ⚠️ Los moldes, el catálogo de permisos y el resto de la decisión se traen DE
 * VERDAD, por su ruta. Un doble ahí probaría la prueba, no el producto.
 */
const PRELUDIO_DATOS = `
import { Levantamiento, Linea } from ${comoUrl('contratos/src/index.ts')};
import { alcanza, puede } from ${comoUrl('web/src/datos/permisos.ts')};

export const BASE = new Map();
export const ESCRITURAS = [];
export const LECTURAS = [];
let SESION = null;
let AL_GUARDAR = null;

export const ponerSesion = (s) => { SESION = s; };
export const sembrar = (coleccion, id, documento) => { BASE.set(coleccion + '/' + id, documento); };
export const loQueHay = (coleccion, id) => BASE.get(coleccion + '/' + id);
export const alGuardar = (f) => { AL_GUARDAR = f; };
export const vaciar = () => {
  BASE.clear(); ESCRITURAS.length = 0; LECTURAS.length = 0; SESION = null; AL_GUARDAR = null;
};

const cargarFirebase = async () => ({
  esperarSesion: async () => (SESION ? { uid: SESION.uid, email: SESION.correo ?? null } : null),
  credenciales: async () => ({ rol: SESION.rol, orgId: SESION.orgId, claims: SESION.claims }),
  baseDatos: async () => ({ nombre: 'base-de-prueba' }),
});

const firestore = async () => ({
  doc: (db, coleccion, id) => ({ clave: coleccion + '/' + id, coleccion, id }),
  getDoc: async (ref) => {
    LECTURAS.push(ref.clave);
    const d = BASE.get(ref.clave);
    return { exists: () => d !== undefined, data: () => d };
  },
  setDoc: async (ref, datos) => {
    ESCRITURAS.push({ clave: ref.clave, datos });
    // La base guarda lo que LE LLEGA. Un doble que "arreglara" el documento
    // escondería justo el fallo que el acuse existe para cazar.
    BASE.set(ref.clave, AL_GUARDAR ? AL_GUARDAR(datos) : datos);
  },
});
`;

async function cargarModulo(fuente) {
  const js = stripTypeScriptTypes(fuente, { mode: 'strip' });
  return import('data:text/javascript;base64,' + Buffer.from(js, 'utf-8').toString('base64'));
}

/** @type {any} */ let puro;
/** @type {any} */ let datos;
/** @type {any} */ let contrato;

before(async () => {
  puro = await cargarModulo(PRELUDIO_PANTALLA
    + funcionDe(PANTALLA, 'codigosDisponibles', 'AltaDeLinea.tsx')
    + funcionDe(PANTALLA, 'lecturaDelRecorrido', 'AltaDeLinea.tsx')
    + funcionDe(PANTALLA, 'placasQueFaltan', 'AltaDeLinea.tsx')
    + funcionDe(PANTALLA, 'documentosDelAlta', 'AltaDeLinea.tsx')
    + funcionDe(PANTALLA, 'diaDelPunto', 'AltaDeLinea.tsx')
    + funcionDe(PANTALLA, 'horaDelPunto', 'AltaDeLinea.tsx')
    + constanteDe(PANTALLA, 'ORIGENES_DECLARABLES', 'AltaDeLinea.tsx')
    + constanteDe(PANTALLA, 'comoSeDice', 'AltaDeLinea.tsx'));

  datos = await cargarModulo(PRELUDIO_DATOS
    + funcionDe(DATOS, 'sinIndefinidos', 'firestore.ts')
    + funcionDe(DATOS, 'validar', 'firestore.ts')
    + funcionDe(DATOS, 'sellarTramos', 'firestore.ts')
    // La procedencia del tramo se exige AL ESCRIBIR (revisión del 17-09).
    + funcionDe(DATOS, 'faltaProcedenciaDeTramo', 'firestore.ts')
    + metodoDe('crearLinea')
    + metodoDe('guardarLevantamiento'));

  // `repositorio.ts` no importa nada en tiempo de ejecución: se puede traer tal
  // cual, y eso es parte de lo que se comprueba más abajo.
  contrato = await import(pathToFileURL(ruta('web/src/datos/repositorio.ts')).href);
});

// ════════════════════════════════════════════════════════════════════════════
// EL MUNDO SINTÉTICO
// ════════════════════════════════════════════════════════════════════════════

const ORG = 'org-de-prueba';
const UID = 'uid-de-prueba';
const AHORA = '2026-01-20T15:00:00.000Z';

const ID_LINEA = '11111111-1111-4111-8111-111111111111';
const ID_TRAMO = '22222222-2222-4222-8222-222222222222';
const ID_OTRA = '33333333-3333-4333-8333-333333333333';
const ID_RECORRIDO = '44444444-4444-4444-8444-444444444444';

/** Un libro de códigos de mentira, con la misma forma que el de verdad. */
const LIBRO = {
  _nota: 'libro sintético de prueba; no es el del repositorio',
  'LN-901': { tipo: 'linea', semilla: 'linea', id: ID_LINEA, emitidoEn: '2026-01-01' },
  'LN-902': { tipo: 'linea', semilla: 'linea', id: ID_OTRA, emitidoEn: '2026-01-01' },
  'TR-909': { tipo: 'tramo', semilla: 'tramo', id: ID_TRAMO, emitidoEn: '2026-01-01' },
};

/** Una sesión que lo puede todo, con alcance a todas las series. */
const SESION_COMPLETA = {
  uid: UID, correo: 'quien@ejemplo', rol: 'admin', orgId: ORG,
  claims: { rol: 'admin', orgId: ORG, f: ['lv', 'le', 'ae', 'cp', 'ev', 'ea'], l: ['*'] },
};

/**
 * EL RECORRIDO SINTÉTICO. Seis puntos sobre el ecuador, con dos trampas puestas
 * a mano porque son las dos que la pantalla tiene que saber decir:
 *
 *   · `LX E01 → LX E02` mide ~11 m, menos que los dos círculos de error juntos
 *     (2 × 8 m): su DIRECCIÓN no se puede saber.
 *   · `LX E06 → LX E07` mide ~267 m, 2,4 veces la mediana: tiene pinta de
 *     esconder una torre sin levantar — y además la numeración salta el 04.
 */
const LONGITUDES = [0, 0.0001, 0.0011, 0.0021, 0.0031, 0.0055];
const LATITUDES = [0, 0, 0, 0.0002, 0, 0];
const NOMBRES = ['LX E01', 'LX E02', 'LX E03', 'LX E05', 'LX E06', 'LX E07'];
const HORAS = [
  '2026-01-15T14:30:00Z', '2026-01-15T14:33:00Z', '2026-01-15T14:38:00Z',
  '2026-01-15T14:44:00Z', '2026-01-15T14:51:00Z', '2026-01-15T15:02:00Z',
];

const GPX = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<gpx version="1.1" creator="Aparato de prueba">',
  ...NOMBRES.map((n, i) => [
    `  <wpt lat="${LATITUDES[i].toFixed(7)}" lon="${LONGITUDES[i].toFixed(7)}">`,
    `    <ele>${(10 + i).toFixed(1)}</ele>`,
    `    <time>${HORAS[i]}</time>`,
    `    <name>${n}</name>`,
    '    <sym>Flag, Blue</sym>',
    '  </wpt>',
  ].join('\n')),
  '</gpx>',
].join('\n');

const HUELLA = createHash('sha256').update(GPX).digest('hex');

const PUNTOS = NOMBRES.map((n, i) => ({
  nombreCampo: n, lat: LATITUDES[i], lon: LONGITUDES[i], ele: 10 + i, instante: HORAS[i],
}));

/** El plan tal y como lo arma la pantalla con todo relleno. */
const planCompleto = (extra = {}) => ({
  linea: {
    codigo: 'LN-901', id: ID_LINEA, nombre: 'Línea de prueba',
    tensionNominal_kV: 66, circuitos: 1,
    tramo: { id: ID_TRAMO, codigo: 'TR-909', procedencia: 'documento_proyecto', fuente: 'plano de prueba' },
    recorridoCompleto: false,
    ...(extra.linea ?? {}),
  },
  levantamiento: extra.levantamiento === null ? null : {
    id: ID_RECORRIDO, serieId: ID_TRAMO, codigoSerie: 'TR-909',
    fecha: '2026-01-15', aparato: 'Aparato de prueba',
    archivo: { nombre: 'recorrido.gpx', huella: HUELLA },
    puntos: PUNTOS.map((p, i) => (i === 1 ? { ...p, nota: 'la letra de más es anotación mía' } : p)),
    nota: 'jornada de prueba',
    ...(extra.levantamiento ?? {}),
  },
  quien: { uid: UID, orgId: ORG, ahora: AHORA },
});

// ════════════════════════════════════════════════════════════════════════════
// 1 · EL LIBRO MANDA: los códigos se ELIGEN, no se teclean
// ════════════════════════════════════════════════════════════════════════════

describe('qué códigos puede ofrecer el alta', () => {
  test('separa líneas de tramos por el PREFIJO y trae el id que el libro emitió', () => {
    const r = puro.codigosDisponibles(LIBRO, []);
    assert.deepEqual(r.lineas.map((l) => l.codigo), ['LN-901', 'LN-902']);
    assert.deepEqual(r.tramos.map((t) => t.codigo), ['TR-909']);
    assert.equal(r.lineas[0].id, ID_LINEA);
    assert.equal(r.tramos[0].id, ID_TRAMO);
    assert.deepEqual(r.ilegibles, []);
  });

  test('la línea que YA está en el parque se marca y no se puede volver a dar de alta', () => {
    const r = puro.codigosDisponibles(LIBRO, [{ codigo: 'LN-902' }]);
    assert.equal(r.lineas.find((l) => l.codigo === 'LN-902').yaEstaEnElParque, true);
    assert.equal(r.lineas.find((l) => l.codigo === 'LN-901').yaEstaEnElParque, false);
  });

  test('una fila cuyo `tipo` contradice a su prefijo NO se ofrece, y se dice', () => {
    // Es el caso que escribiría un documento permanente en el sitio equivocado:
    // un tramo dado de alta como línea no se puede mover ni borrar después.
    const roto = { ...LIBRO, 'TR-909': { ...LIBRO['TR-909'], tipo: 'linea' } };
    const r = puro.codigosDisponibles(roto, []);
    assert.equal(r.tramos.length, 0);
    assert.equal(r.lineas.length, 2, 'tampoco se cuela por el otro lado');
    assert.equal(r.ilegibles.length, 1);
    assert.match(r.ilegibles[0].motivo, /prefijo/);
  });

  test('una fila sin id con forma de identificador se aparta con su motivo', () => {
    const roto = { ...LIBRO, 'LN-902': { tipo: 'linea', semilla: 'linea', id: 'no-es-un-id' } };
    const r = puro.codigosDisponibles(roto, []);
    assert.deepEqual(r.lineas.map((l) => l.codigo), ['LN-901']);
    assert.equal(r.ilegibles[0].codigo, 'LN-902');
  });

  test('un código que no empieza por LN- ni TR- no se ofrece: no se adivina su clase', () => {
    const roto = { ...LIBRO, '618': { tipo: 'tramo', semilla: 'tramo', id: ID_TRAMO } };
    const r = puro.codigosDisponibles(roto, []);
    assert.ok(r.ilegibles.some((x) => x.codigo === '618'));
  });

  test('las notas `_` del libro no son códigos', () => {
    const r = puro.codigosDisponibles(LIBRO, []);
    assert.equal([...r.lineas, ...r.tramos].some((x) => x.codigo.startsWith('_')), false);
  });

  test('sobre el libro DE VERDAD: ofrece LN-617 y LN-628, y el tramo TR-618', () => {
    // El libro del repositorio es el que alimenta la pantalla publicada. Si
    // alguien lo rompe, esto se pone rojo aquí y no en producción.
    const r = puro.codigosDisponibles(LIBRO_REAL, [{ codigo: 'LN-627' }]);
    assert.deepEqual(r.ilegibles, []);
    const ofrecibles = r.lineas.filter((l) => !l.yaEstaEnElParque).map((l) => l.codigo);
    assert.deepEqual(ofrecibles, ['LN-617', 'LN-628']);
    assert.deepEqual(r.tramos.map((t) => t.codigo), ['TR-618']);
    assert.equal(r.lineas.find((l) => l.codigo === 'LN-627').yaEstaEnElParque, true,
      'LN-627 ya está en el parque: no se puede volver a dar de alta');
    assert.equal(r.tramos[0].id, LIBRO_REAL['TR-618'].id,
      'el id del tramo sale del libro, nunca se recalcula en la pantalla');
  });

  test('«TR-618» se dice «tramo compartido 618» (decisión del Ingeniero, 16-09-2026)', () => {
    assert.equal(puro.comoSeDice('TR-618'), 'tramo compartido 618');
    assert.equal(puro.comoSeDice('LN-617'), 'LN-617', 'una línea se dice por su código');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2 · LO QUE EL RECORRIDO DICE DE SÍ MISMO
// ════════════════════════════════════════════════════════════════════════════

describe('lo que se lee del recorrido antes de guardarlo', () => {
  test('los vanos salen del núcleo y son uno menos que los puntos', () => {
    const r = puro.lecturaDelRecorrido(PUNTOS, 8);
    assert.equal(r.vanos_m.length, PUNTOS.length - 1);
    assert.equal(r.filas.length, PUNTOS.length);
    // ~11 m, ~111 m ×3, ~267 m. Se comprueba el orden de magnitud, no el decimal:
    // el decimal es de Vincenty y ya tiene sus propias pruebas de oro.
    assert.ok(r.vanos_m[0] > 10 && r.vanos_m[0] < 12);
    assert.ok(r.vanos_m[4] > 260 && r.vanos_m[4] < 270);
    assert.ok(r.mediana_m > 110 && r.mediana_m < 116);
  });

  test('el vano larguísimo sale señalado como «pinta de torre sin levantar»', () => {
    const r = puro.lecturaDelRecorrido(PUNTOS, 8);
    assert.deepEqual(r.sospechosos, [5], 'el vano que llega al último punto');
    assert.equal(r.filas[5].sospechoso, true);
    assert.ok(r.filas[5].vecesLaMediana > 2);
    // Y el resto NO se señala: un aviso que salta siempre no es un aviso.
    assert.deepEqual(r.filas.filter((f) => f.sospechoso).map((f) => f.i), [5]);
  });

  test('el vano cortísimo NO tiene dirección, y se dice así — no con un margen enorme', () => {
    const r = puro.lecturaDelRecorrido(PUNTOS, 8);
    assert.deepEqual(r.indeterminados, [1]);
    assert.equal(r.filas[1].direccionEntra.determinado, false);
    assert.equal(r.filas[1].direccionEntra.margen_grados, null);
    assert.match(r.filas[1].direccionEntra.motivo, /no se puede saber/);
    // El quiebre que se apoya en esa dirección tampoco es fiable.
    assert.equal(r.filas[1].margen.determinado, false);
  });

  test('los dos extremos no tienen quiebre ni margen, y el primero tampoco vano', () => {
    const r = puro.lecturaDelRecorrido(PUNTOS, 8);
    assert.equal(r.filas[0].vanoEntra_m, null);
    assert.equal(r.filas[0].quiebre_grados, null);
    assert.equal(r.filas[0].margen, null);
    assert.equal(r.filas[0].direccionEntra, null);
    const ultimo = r.filas[r.filas.length - 1];
    assert.equal(ultimo.vanoSale_m, null);
    assert.equal(ultimo.quiebre_grados, null);
    assert.equal(ultimo.margen, null);
  });

  test('un punto repetido no mueve el índice del vano más corto', () => {
    // `estadisticasVanos` descarta los vanos que no son positivos ANTES de
    // contar, así que sus índices son los de la lista ya filtrada. Señalar con
    // ellos apuntaría al vano equivocado en cuanto la cuadrilla marcara dos
    // veces el mismo sitio, que pasa.
    const conRepetido = [PUNTOS[0], { ...PUNTOS[0], nombreCampo: 'LX E01 bis' }, ...PUNTOS.slice(1)];
    const r = puro.lecturaDelRecorrido(conRepetido, 8);
    assert.equal(r.vanos_m[0], 0, 'el vano entre dos puntos iguales es cero');
    assert.ok(r.minimo_m > 10 && r.minimo_m < 12, 'el mínimo real es el vano de 11 m');
    assert.equal(r.vanos_m[r.indiceMinimo], r.minimo_m,
      'el índice señala el vano cuyo valor es el mínimo, no una posición corrida');
  });

  test('con un solo punto no hay nada que medir, y no revienta', () => {
    const r = puro.lecturaDelRecorrido([PUNTOS[0]], 8);
    assert.deepEqual(r.vanos_m, []);
    assert.equal(r.mediana_m, null);
    assert.equal(r.longitudLevantada_m, null);
    assert.equal(r.enRecta_m, null);
    assert.deepEqual(r.sospechosos, []);
  });

  test('lo levantado es la suma de los vanos, y la recta es siempre menor o igual', () => {
    const r = puro.lecturaDelRecorrido(PUNTOS, 8);
    const suma = r.vanos_m.reduce((s, x) => s + x, 0);
    assert.ok(Math.abs(r.longitudLevantada_m - suma) < 1e-6);
    assert.ok(r.enRecta_m < r.longitudLevantada_m,
      'el recorrido quiebra, así que la recta de punta a punta es más corta');
  });
});

describe('las placas que la numeración salta', () => {
  test('señala el número que falta ENTRE los levantados', () => {
    const r = puro.placasQueFaltan(NOMBRES);
    assert.equal(r.desde, 1);
    assert.equal(r.hasta, 7);
    assert.deepEqual(r.huecos, [4]);
  });

  test('NO inventa las placas de antes del primero ni las de después del último', () => {
    // Que el recorrido empiece en E07 no dice que existan E01 a E06: dice dónde
    // empieza. Suponer que la numeración arranca en 1 sería inventar torres.
    const r = puro.placasQueFaltan(['618 E07', '618 E08', '618 E10']);
    assert.equal(r.desde, 7);
    assert.deepEqual(r.huecos, [9], 'solo el hueco cierto, el 9');
    assert.equal(r.huecos.includes(1), false);
    assert.equal(r.huecos.includes(6), false);
  });

  test('el rótulo del tramo pegado al nombre no se lee como número de placa', () => {
    // «618» solo, sin letra delante del número, se leería como la placa 618 y
    // llenaría la lista de huecos con seiscientos números inventados.
    const r = puro.placasQueFaltan(['618', '618 E07', '618 E08']);
    assert.deepEqual(r.huecos, []);
    assert.deepEqual(r.sinNumero, ['618']);
  });

  test('lee el número aunque el nombre traiga letras de más («ER16»)', () => {
    const r = puro.placasQueFaltan(['618 E15', '618 ER16', '618 E17']);
    assert.deepEqual(r.huecos, []);
    assert.deepEqual(r.sinNumero, []);
  });

  test('los ceros a la izquierda no hacen dos placas de la misma', () => {
    const r = puro.placasQueFaltan(['E007', 'E08', 'E09']);
    assert.equal(r.desde, 7);
    assert.equal(r.hasta, 9);
    assert.deepEqual(r.huecos, []);
  });

  test('un número repetido se declara en vez de tragarse', () => {
    const r = puro.placasQueFaltan(['E01', 'E02', 'E02', 'E04']);
    assert.deepEqual(r.repetidas, [2]);
    assert.deepEqual(r.huecos, [3]);
  });

  test('sin ningún nombre con número no se afirma nada', () => {
    const r = puro.placasQueFaltan(['puente', 'cruce']);
    assert.equal(r.desde, null);
    assert.equal(r.hasta, null);
    assert.deepEqual(r.huecos, []);
    assert.deepEqual(r.sinNumero, ['puente', 'cruce']);
  });
});

describe('la fecha de la jornada sale de la hora del aparato, en el reloj de Colombia', () => {
  test('un instante de la tarde en Colombia se queda en su día', () => {
    assert.equal(puro.diaDelPunto('2026-01-15T14:30:00Z'), '2026-01-15');
    assert.equal(puro.horaDelPunto('2026-01-15T14:30:00Z'), '09:30:00');
  });

  test('un instante de madrugada UTC es la NOCHE ANTERIOR aquí, y así se fecha', () => {
    // Con la fecha en UTC, una jornada que acabara a las 19:30 hora local
    // quedaría fechada al día siguiente — y esa fecha entra en un identificador
    // permanente que no se puede corregir.
    assert.equal(puro.diaDelPunto('2026-01-16T00:30:00Z'), '2026-01-15');
    assert.equal(puro.horaDelPunto('2026-01-16T00:30:00Z'), '19:30:00');
  });

  test('sin hora no se inventa ningún día', () => {
    assert.equal(puro.diaDelPunto(undefined), '');
    assert.equal(puro.horaDelPunto(undefined), '');
  });
});

describe('los orígenes que se pueden declarar', () => {
  test('son los del contrato menos «confirmado_humano», que no es un origen', () => {
    assert.deepEqual(
      [...puro.ORIGENES_DECLARABLES].sort(),
      Procedencia.options.filter((o) => o !== 'confirmado_humano').sort(),
    );
    assert.equal(puro.ORIGENES_DECLARABLES.includes('confirmado_humano'), false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3 · LOS DOCUMENTOS QUE SE VAN A ESCRIBIR
// ════════════════════════════════════════════════════════════════════════════

describe('los documentos del alta, campo a campo', () => {
  test('la línea sale exactamente como se espera', () => {
    const { linea } = puro.documentosDelAlta(planCompleto());
    assert.deepEqual(linea, {
      id: ID_LINEA,
      orgId: ORG,
      creadoEn: AHORA,
      creadoPor: UID,
      revision: 0,
      tipo: 'linea',
      codigo: 'LN-901',
      nombre: 'Línea de prueba',
      tensionNominal_kV: 66,
      circuitos: 1,
      activa: true,
      recorridoCompleto: false,
      tramosCompartidos: [{
        id: ID_TRAMO,
        codigo: 'TR-909',
        procedencia: 'documento_proyecto',
        fuente: 'plano de prueba',
        declaradoEn: AHORA,
        declaradoPor: UID,
      }],
    });
  });

  test('la línea NO trae conductor ni hipótesis: no se copia nada de otra línea', () => {
    const { linea } = puro.documentosDelAlta(planCompleto());
    assert.equal('conductor' in linea, false);
    assert.equal('hipotesisId' in linea, false);
  });

  test('el tramo se declara ENTERO: no se inventan los extremos', () => {
    // Acotar de una torre a otra exige los identificadores de dos TORRES, y
    // todavía no hay ninguna registrada. Inventarlos dejaría escrito para
    // siempre un recorte que nadie decidió.
    const { linea } = puro.documentosDelAlta(planCompleto());
    assert.equal('desdeApoyoId' in linea.tramosCompartidos[0], false);
    assert.equal('hastaApoyoId' in linea.tramosCompartidos[0], false);
  });

  test('sin tramo compartido, el campo NO se pone (no viaja una lista vacía)', () => {
    const { linea } = puro.documentosDelAlta(planCompleto({ linea: { tramo: null } }));
    assert.equal('tramosCompartidos' in linea, false);
  });

  test('«sin declarar» el recorrido NO escribe el campo: ausente es «no consta»', () => {
    const { linea } = puro.documentosDelAlta(planCompleto({ linea: { recorridoCompleto: null } }));
    assert.equal('recorridoCompleto' in linea, false,
      'un hueco no es un «no», y escribir `false` afirmaría algo que nadie declaró');

    const si = puro.documentosDelAlta(planCompleto({ linea: { recorridoCompleto: true } })).linea;
    assert.equal(si.recorridoCompleto, true);
    const no = puro.documentosDelAlta(planCompleto({ linea: { recorridoCompleto: false } })).linea;
    assert.equal(no.recorridoCompleto, false);
  });

  test('el levantamiento sale exactamente como se espera, con su nota de punto', () => {
    const { levantamiento } = puro.documentosDelAlta(planCompleto());
    assert.equal(levantamiento.id, ID_RECORRIDO);
    assert.equal(levantamiento.tipo, 'levantamiento');
    assert.equal(levantamiento.serieId, ID_TRAMO);
    assert.equal(levantamiento.codigoSerie, 'TR-909');
    assert.equal(levantamiento.fecha, '2026-01-15');
    assert.equal(levantamiento.aparato, 'Aparato de prueba');
    assert.deepEqual(levantamiento.archivo, { nombre: 'recorrido.gpx', huella: HUELLA });
    assert.equal(levantamiento.cargadoEn, AHORA);
    assert.equal(levantamiento.cargadoPor, UID);
    assert.equal(levantamiento.creadoPor, UID);
    assert.equal(levantamiento.orgId, ORG);
    assert.equal(levantamiento.nota, 'jornada de prueba');
    assert.equal(levantamiento.puntos.length, 6);
    assert.deepEqual(levantamiento.puntos[0],
      { nombreCampo: 'LX E01', lat: 0, lon: 0, ele: 10, instante: HORAS[0] });
    assert.equal(levantamiento.puntos[1].nota, 'la letra de más es anotación mía');
  });

  test('el levantamiento NO lleva ni una interpretación', () => {
    const { levantamiento } = puro.documentosDelAlta(planCompleto());
    for (const p of levantamiento.puntos) {
      for (const prohibido of ['funcionEstructural', 'funcionProcedencia', 'tipoPunto', 'orden',
        'nombreNormalizado', 'deflexion_grados', 'vano_m']) {
        assert.equal(prohibido in p, false, `un punto trae «${prohibido}», que no es suyo`);
      }
    }
  });

  test('ninguna clave llega con `undefined`: el SDK de la base lanza con una sola', () => {
    // Y en una escritura eso es la diferencia entre guardar la jornada y perderla.
    const sinNada = puro.documentosDelAlta(planCompleto({
      levantamiento: { aparato: null, nota: '   ', puntos: [{ nombreCampo: 'LX E01', lat: 0, lon: 0 }] },
    }));
    const recorre = (o, camino = '') => {
      for (const [k, v] of Object.entries(o)) {
        assert.notEqual(v, undefined, `«${camino}${k}» llega como undefined`);
        if (v && typeof v === 'object') recorre(v, `${camino}${k}.`);
      }
    };
    recorre(sinNada.linea);
    recorre(sinNada.levantamiento);
    assert.equal('aparato' in sinNada.levantamiento, false);
    assert.equal('nota' in sinNada.levantamiento, false, 'una nota en blanco no es una nota');
    assert.equal('ele' in sinNada.levantamiento.puntos[0], false);
    assert.equal('instante' in sinNada.levantamiento.puntos[0], false);
  });

  test('sin archivo del GPS solo se arma la línea', () => {
    const r = puro.documentosDelAlta(planCompleto({ levantamiento: null }));
    assert.equal(r.levantamiento, null);
    assert.equal(r.linea.codigo, 'LN-901');
  });

  test('LOS DOS DOCUMENTOS VALIDAN CONTRA EL MOLDE DE VERDAD', () => {
    // Es la comprobación que importa: lo que esta pantalla arma es lo que se
    // queda escrito para siempre. Si el molde lo rechazara, la capa de datos
    // lanzaría después de que él pulse, con el formulario entero relleno.
    const { linea, levantamiento } = puro.documentosDelAlta(planCompleto());
    const l = Linea.safeParse(linea);
    assert.equal(l.success, true, l.success ? '' : JSON.stringify(l.error.issues[0]));
    const v = Levantamiento.safeParse(levantamiento);
    assert.equal(v.success, true, v.success ? '' : JSON.stringify(v.error.issues[0]));

    // Y el molde no descarta nada por el camino: lo que se arma es lo que entra.
    assert.deepEqual(l.data.tramosCompartidos, linea.tramosCompartidos);
    assert.equal(v.data.puntos.length, levantamiento.puntos.length);
    assert.equal(v.data.puntos[1].nota, 'la letra de más es anotación mía');
  });

  test('el camino ENTERO desde el archivo: GPX → puntos → documento que valida', async () => {
    const { puntosDesdeGpx } = await import('@lineas/importar/levantamientoDesdeGpx');
    const leido = puntosDesdeGpx(GPX);
    assert.equal(leido.puntos.length, 6);
    assert.equal(leido.creator, 'Aparato de prueba');
    // El icono del aparato se queda fuera y se DICE, no se tira callando.
    assert.ok(leido.avisos.some((a) => a.tipo === 'campo_descartado' && a.campo === 'simbolo'));

    const plan = planCompleto({ levantamiento: { puntos: leido.puntos } });
    const { levantamiento } = puro.documentosDelAlta(plan);
    assert.equal(Levantamiento.safeParse(levantamiento).success, true);
    assert.deepEqual(
      levantamiento.puntos.map((p) => p.nombreCampo),
      NOMBRES,
      'los nombres se conservan tal y como los grabó el aparato',
    );
  });

  test('el identificador del recorrido sale de la fecha y de la huella, y no se mueve', async () => {
    const { idDeLevantamiento } = await import('@lineas/importar/identidad');
    const a = await idDeLevantamiento('TR-909', '2026-01-15', HUELLA);
    const b = await idDeLevantamiento('TR-909', '2026-01-15', HUELLA);
    assert.equal(a, b, 'el mismo archivo el mismo día cae SIEMPRE en el mismo documento');
    const otroDia = await idDeLevantamiento('TR-909', '2026-01-16', HUELLA);
    assert.notEqual(a, otroDia);
    const otroArchivo = await idDeLevantamiento('TR-909', '2026-01-15', createHash('sha256').update('otra cosa').digest('hex'));
    assert.notEqual(a, otroArchivo);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4 · ANTES DE ESCRIBIR SE PREGUNTA SI YA ESTÁ
// ════════════════════════════════════════════════════════════════════════════

describe('el alta de la línea contra la base', () => {
  beforeEach(() => { datos.vaciar(); datos.ponerSesion(SESION_COMPLETA); });

  const documentoDeLinea = () => puro.documentosDelAlta(planCompleto()).linea;

  test('escribe UNA línea, la vuelve a leer y lo cuenta', async () => {
    const acuse = await datos.crearLinea(documentoDeLinea());
    assert.equal(acuse.yaEstaba, false);
    assert.equal(acuse.codigo, 'LN-901');
    assert.equal(acuse.id, ID_LINEA);
    assert.deepEqual(acuse.releida, {
      codigo: 'LN-901', nombre: 'Línea de prueba', tensionNominal_kV: 66,
      circuitos: 1, tramosCompartidos: 1,
    });
    assert.equal(datos.ESCRITURAS.length, 1);
    assert.equal(datos.ESCRITURAS[0].clave, `lineas/${ID_LINEA}`);
  });

  test('PREGUNTA ANTES DE ESCRIBIR, no después', async () => {
    await datos.crearLinea(documentoDeLinea());
    // Primero una lectura, después la escritura, y solo entonces la relectura.
    assert.deepEqual(datos.LECTURAS, [`lineas/${ID_LINEA}`, `lineas/${ID_LINEA}`]);
    assert.equal(datos.ESCRITURAS.length, 1);
  });

  test('si la línea YA existe no se vuelve a escribir: la pisaría entera', async () => {
    // Las reglas dejan ACTUALIZAR una línea a quien tiene `lineas.editar`, así
    // que un segundo alta no daría error: se llevaría por delante su conductor,
    // sus hipótesis y sus tramos declarados. Aquí no hay red salvo ésta.
    const viva = {
      ...documentoDeLinea(),
      nombre: 'La que ya estaba', conductor: undefined, hipotesisId: undefined,
    };
    delete viva.conductor; delete viva.hipotesisId;
    datos.sembrar('lineas', ID_LINEA, viva);

    const acuse = await datos.crearLinea(documentoDeLinea());
    assert.equal(acuse.yaEstaba, true);
    assert.equal(datos.ESCRITURAS.length, 0, 'NO se escribió nada');
    assert.equal(acuse.releida.nombre, 'La que ya estaba',
      'el acuse enseña la que está, no la que se iba a escribir');
    assert.equal(datos.loQueHay('lineas', ID_LINEA).nombre, 'La que ya estaba');
  });

  test('sella la organización y el autor con la SESIÓN, no con lo que le llega', async () => {
    const falsificado = { ...documentoDeLinea(), orgId: 'otra-organizacion', creadoPor: 'otro-uid' };
    falsificado.tramosCompartidos = [{ ...falsificado.tramosCompartidos[0], declaradoPor: 'otro-uid', declaradoEn: '1999-01-01T00:00:00.000Z' }];
    await datos.crearLinea(falsificado);
    const escrito = datos.ESCRITURAS[0].datos;
    assert.equal(escrito.orgId, ORG);
    assert.equal(escrito.creadoPor, UID);
    assert.equal(escrito.tramosCompartidos[0].declaradoPor, UID,
      'la firma del tramo también: dentro del array las reglas no miran a nadie');
    assert.notEqual(escrito.tramosCompartidos[0].declaradoEn, '1999-01-01T00:00:00.000Z');
  });

  test('sin el permiso de líneas NO se manda nada, y se dice cuál falta', async () => {
    datos.ponerSesion({
      ...SESION_COMPLETA,
      rol: 'cuadrilla',
      claims: { ...SESION_COMPLETA.claims, rol: 'cuadrilla', f: ['lv', 'ev', 'ea'] },
    });
    await assert.rejects(
      () => datos.crearLinea(documentoDeLinea()),
      (e) => /crear y editar líneas/.test(e.message) && /No se ha mandado nada/.test(e.message),
    );
    assert.equal(datos.ESCRITURAS.length, 0);
    assert.equal(datos.LECTURAS.length, 0, 'ni siquiera se llegó a preguntar');
  });

  test('sin organización en el token NO se manda nada', async () => {
    datos.ponerSesion({ ...SESION_COMPLETA, orgId: '' });
    await assert.rejects(() => datos.crearLinea(documentoDeLinea()), /organización/);
    assert.equal(datos.ESCRITURAS.length, 0);
  });

  test('con alcance acotado que no incluye la línea NO se manda nada', async () => {
    // La regla exige `alcanza(lineaId)`: sin esta comprobación la denegación
    // llegaría en inglés con el formulario entero relleno.
    datos.ponerSesion({
      ...SESION_COMPLETA,
      claims: { ...SESION_COMPLETA.claims, l: [ID_OTRA] },
    });
    await assert.rejects(() => datos.crearLinea(documentoDeLinea()), /no alcanza a LN-901/);
    assert.equal(datos.ESCRITURAS.length, 0);
  });

  test('un documento que el molde rechaza NO llega a la base', async () => {
    const roto = { ...documentoDeLinea(), tensionNominal_kV: -66 };
    await assert.rejects(() => datos.crearLinea(roto), /no cumple el molde/);
    assert.equal(datos.ESCRITURAS.length, 0);
  });

  test('sin sesión no se escribe nada y se dice con esas palabras', async () => {
    datos.ponerSesion(null);
    await assert.rejects(() => datos.crearLinea(documentoDeLinea()), /No hay ninguna sesión abierta/);
    assert.equal(datos.ESCRITURAS.length, 0);
  });
});

describe('el recorrido levantado contra la base', () => {
  beforeEach(() => { datos.vaciar(); datos.ponerSesion(SESION_COMPLETA); });

  const documentoDeRecorrido = () => puro.documentosDelAlta(planCompleto()).levantamiento;

  test('escribe UN recorrido y cuenta los puntos que la base devuelve', async () => {
    const acuse = await datos.guardarLevantamiento(documentoDeRecorrido());
    assert.equal(acuse.yaEstaba, false);
    assert.equal(acuse.codigoSerie, 'TR-909');
    assert.equal(acuse.fecha, '2026-01-15');
    assert.equal(acuse.puntosEnviados, 6);
    assert.equal(acuse.puntosReleidos, 6, '6 de 6: el conteo cuadra');
    assert.equal(datos.ESCRITURAS.length, 1);
    assert.equal(datos.ESCRITURAS[0].clave, `levantamientos/${ID_RECORRIDO}`);
  });

  test('«ESTE RECORRIDO YA ESTABA CARGADO»: se comprueba ANTES y no se reintenta', async () => {
    // Reescribirlo está DENEGADO por regla —solo se mueve la nota— y la
    // denegación llega como «Missing or insufficient permissions», que se lee
    // como «no tienes permiso» cuando la verdad es «esto ya estaba cargado».
    // El reintento no puede salir bien: la regla está bien puesta (`35 · L-24`).
    const ya = documentoDeRecorrido();
    datos.sembrar('levantamientos', ID_RECORRIDO, ya);

    const acuse = await datos.guardarLevantamiento(documentoDeRecorrido());
    assert.equal(acuse.yaEstaba, true);
    assert.equal(datos.ESCRITURAS.length, 0, 'NO se intentó reescribir');
    assert.deepEqual(datos.LECTURAS, [`levantamientos/${ID_RECORRIDO}`],
      'una sola lectura: se preguntó, salió que sí, y se paró ahí');
    assert.equal(acuse.puntosEnviados, 6);
    assert.equal(acuse.puntosReleidos, 6, 'los del que ya estaba, para poder compararlos');
  });

  test('el mismo archivo cargado dos veces cae en el MISMO documento', async () => {
    await datos.guardarLevantamiento(documentoDeRecorrido());
    const segundo = await datos.guardarLevantamiento(documentoDeRecorrido());
    assert.equal(segundo.yaEstaba, true);
    assert.equal(datos.ESCRITURAS.length, 1, 'una sola escritura entre las dos cargas');
  });

  test('EL ACUSE CAZA UN GUARDADO A MEDIAS: 5 de 6 no es «hecho»', async () => {
    // Escribir menos de lo enseñado no da error en ninguna capa (`35 · L-79`).
    // El único que puede verlo es el conteo de la relectura.
    datos.alGuardar((d) => ({ ...d, puntos: d.puntos.slice(0, 5) }));
    const acuse = await datos.guardarLevantamiento(documentoDeRecorrido());
    assert.equal(acuse.puntosEnviados, 6);
    assert.equal(acuse.puntosReleidos, 5);
    assert.notEqual(acuse.puntosReleidos, acuse.puntosEnviados,
      'el acuse tiene con qué ponerse en rojo');
  });

  test('si la relectura no vale, se dice «no se pudo contar», no «cero»', async () => {
    // Un documento que vuelve roto no es un documento vacío: `null` es un tercer
    // estado y la pantalla lo enseña con otras palabras.
    datos.alGuardar(() => ({ esto: 'no es un levantamiento' }));
    const acuse = await datos.guardarLevantamiento(documentoDeRecorrido());
    assert.equal(acuse.puntosEnviados, 6);
    assert.equal(acuse.puntosReleidos, null);
  });

  test('sella el autor con la sesión y no se cree lo que le llega', async () => {
    const falsificado = { ...documentoDeRecorrido(), cargadoPor: 'otro-uid', creadoPor: 'otro-uid', orgId: 'otra' };
    await datos.guardarLevantamiento(falsificado);
    const escrito = datos.ESCRITURAS[0].datos;
    assert.equal(escrito.cargadoPor, UID);
    assert.equal(escrito.creadoPor, UID);
    assert.equal(escrito.orgId, ORG);
  });

  test('el permiso es el de CARGAR PUNTOS, no el de editar líneas', async () => {
    // Es el mismo acto que crear un apoyo —cargar el trazado que trajo el GPS—
    // y pedir menos aquí abriría por la puerta de al lado lo que la regla de
    // `apoyos` cierra.
    datos.ponerSesion({
      ...SESION_COMPLETA,
      rol: 'editor',
      claims: { ...SESION_COMPLETA.claims, rol: 'editor', f: ['lv', 'le', 'ae'] },
    });
    await assert.rejects(
      () => datos.guardarLevantamiento(documentoDeRecorrido()),
      /No se ha mandado nada a la base/,
    );
    assert.equal(datos.ESCRITURAS.length, 0);
  });

  test('el alcance se comprueba contra la SERIE, que puede no ser la línea', async () => {
    // Una sesión acotada a la línea NO alcanza al tramo compartido: son dos
    // identificadores distintos y la regla mira el del documento.
    datos.ponerSesion({
      ...SESION_COMPLETA,
      claims: { ...SESION_COMPLETA.claims, l: [ID_LINEA] },
    });
    await assert.rejects(() => datos.guardarLevantamiento(documentoDeRecorrido()), /no alcanza a TR-909/);
    assert.equal(datos.ESCRITURAS.length, 0);
  });

  test('un recorrido sin serie NO llega a la base', async () => {
    // Un recorrido que no se sabe de qué serie es no lo puede leer nadie con
    // alcance acotado, no sale en ninguna consulta por serie… y no se borra.
    const roto = { ...documentoDeRecorrido() };
    delete roto.serieId;
    await assert.rejects(() => datos.guardarLevantamiento(roto), /no cumple el molde/);
    assert.equal(datos.ESCRITURAS.length, 0);
  });

  test('un recorrido sin ningún punto NO llega a la base', async () => {
    const roto = { ...documentoDeRecorrido(), puntos: [] };
    await assert.rejects(() => datos.guardarLevantamiento(roto), /no cumple el molde/);
    assert.equal(datos.ESCRITURAS.length, 0);
  });

  test('un punto con una interpretación dentro NO llega a la base', async () => {
    const doc = documentoDeRecorrido();
    const roto = {
      ...doc,
      puntos: [{ ...doc.puntos[0], funcionEstructural: 'Retención' }, ...doc.puntos.slice(1)],
    };
    await assert.rejects(() => datos.guardarLevantamiento(roto), /no cumple el molde/);
    assert.equal(datos.ESCRITURAS.length, 0);
  });

  test('sin sesión no se escribe nada', async () => {
    datos.ponerSesion(null);
    await assert.rejects(() => datos.guardarLevantamiento(documentoDeRecorrido()), /No hay ninguna sesión abierta/);
    assert.equal(datos.ESCRITURAS.length, 0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5 · SIN PULSAR NO SE ESCRIBE NADA
// ════════════════════════════════════════════════════════════════════════════

describe('sin pulsar no se escribe nada', () => {
  test('el camino entero de lectura no toca la base ni una vez', async () => {
    datos.vaciar();
    datos.ponerSesion(SESION_COMPLETA);
    const { puntosDesdeGpx } = await import('@lineas/importar/levantamientoDesdeGpx');

    // Todo lo que la pantalla hace ANTES de que él pulse: elegir de la lista,
    // leer el archivo, medir el recorrido, leer las placas y armar los
    // documentos que se van a enseñar en el antes y el después.
    const codigos = puro.codigosDisponibles(LIBRO, []);
    const leido = puntosDesdeGpx(GPX);
    const lectura = puro.lecturaDelRecorrido(leido.puntos, 8);
    const placas = puro.placasQueFaltan(leido.puntos.map((p) => p.nombreCampo));
    const docs = puro.documentosDelAlta(planCompleto({ levantamiento: { puntos: leido.puntos } }));

    assert.ok(codigos.lineas.length && lectura.vanos_m.length && placas.huecos.length && docs.linea);
    assert.equal(datos.ESCRITURAS.length, 0, 'no se escribió nada');
    assert.equal(datos.LECTURAS.length, 0, 'ni siquiera se leyó nada');
  });

  test('las dos escrituras viven DENTRO de la función que dispara el botón de confirmar', () => {
    const cuerpo = funcionAnidadaDe(PANTALLA, 'darDeAlta', 'AltaDeLinea.tsx');
    assert.ok(cuerpo.includes('repositorio.crearLinea('), 'el alta de la línea vive en `darDeAlta`');
    assert.ok(cuerpo.includes('repositorio.guardarLevantamiento('), 'y el recorrido también');

    // Y en NINGÚN otro sitio del archivo.
    const veces = (aguja) => PANTALLA.split(aguja).length - 1;
    assert.equal(veces('repositorio.crearLinea('), 1);
    assert.equal(veces('repositorio.guardarLevantamiento('), 1);
    assert.equal(veces('darDeAlta()'), 2, 'su declaración y el único sitio que la llama');
  });

  test('el primer botón solo ABRE la confirmación; escribir es el segundo', () => {
    // Sobre algo que no se puede deshacer, el primer clic no puede escribir.
    assert.ok(PANTALLA.includes('onClick={() => setConfirmando(true)}'));
    assert.ok(PANTALLA.includes('onClick={() => void darDeAlta()}'));
    const iConfirmar = PANTALLA.indexOf('confirmando && plan && documentos');
    const iEscribir = PANTALLA.indexOf('onClick={() => void darDeAlta()}');
    assert.ok(iConfirmar >= 0 && iEscribir > iConfirmar,
      'el botón que escribe está dentro del bloque de confirmación');
  });

  test('la pantalla solo le pide tres cosas al repositorio, y dos son las suyas', () => {
    const usos = [...PANTALLA.matchAll(/repositorio\.([a-zA-Z]+)\(/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(usos)].sort(),
      ['crearLinea', 'guardarLevantamiento', 'listarLevantamientos']);
  });

  test('el archivo del GPS no sube a ningún sitio: se lee en el computador', () => {
    // Lo que viaja a la base son los documentos, nunca el archivo.
    assert.ok(PANTALLA.includes('archivo.arrayBuffer()'));
    assert.equal(PANTALLA.includes('FormData'), false);
    assert.equal(PANTALLA.includes('fetch('), false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6 · EL CONTRATO DEL REPOSITORIO
// ════════════════════════════════════════════════════════════════════════════

describe('el contrato del repositorio', () => {
  test('sin sesión, las dos escrituras LANZAN en vez de devolver un acuse vacío', async () => {
    // Un acuse vacío se leería como «se dio de alta y no hay nada que contar».
    await assert.rejects(() => contrato.repositorioSinSesion.crearLinea({}),
      /No hay ninguna sesión abierta/);
    await assert.rejects(() => contrato.repositorioSinSesion.guardarLevantamiento({}),
      /No hay ninguna sesión abierta/);
  });

  test('`repositorio.ts` sigue sin importar nada en tiempo de ejecución', () => {
    // Es lo que permite traerlo desde una prueba de Node, y lo que impide que
    // crezca hasta ser una segunda capa de datos.
    const imports = [...CONTRATO.matchAll(/^import .*$/gm)].map((m) => m[0]);
    assert.ok(imports.length > 0);
    for (const i of imports) {
      assert.ok(i.startsWith('import type '), `«${i}» no es un import de tipos`);
    }
  });

  test('la implementación de Firestore declara los dos métodos nuevos', () => {
    assert.ok(DATOS.includes('async crearLinea(documento'));
    assert.ok(DATOS.includes('async guardarLevantamiento(documento'));
  });
});
