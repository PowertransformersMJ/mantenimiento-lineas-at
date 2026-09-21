// ============================================================================
// tests/cargabilidad-repo.test.js — el recorte del periodo y la lista del parque
// ----------------------------------------------------------------------------
// QUÉ VIGILA, y por qué hacía falta una prueba que EJECUTE el repositorio en vez
// de leerlo:
//
//   1. **EL RECORTE SE QUEDABA CON LO MÁS VIEJO.** La consulta del periodo pedía
//      `orderBy('fecha')` —de la más antigua hacia adelante— y cortaba con
//      `slice(0, tope)`. Al pasar de 1.200 resúmenes, la pantalla enseñaba los
//      días más ANTIGUOS y escondía los meses recientes, que son por los que se
//      abre esta pestaña. Con tres líneas cargadas el tope se alcanza ya; a la
//      línea piloto sola le llegaría en diciembre. Ninguna prueba lo cazaba
//      porque todas leían el archivo como TEXTO: `slice(0, tope)` se lee igual
//      de bien tanto si trae lo reciente como si trae lo viejo.
//
//   0. **LA CARGA LARGA, POR TANDAS** (§7, y es lo más caro de equivocar de todo
//      el archivo): que los días APARTADOS queden escritos en el rastro con su
//      motivo —la colección es INMUTABLE: lo que no se escriba al crearla no se
//      escribe nunca—, que cada tanda devuelva contado lo suyo para poder
//      sumarlo, que lo ya guardado e igual NO se reescriba, y que nada de esto
//      toque lo que ya está en producción de otra línea.
//
//   2. **Y EL AVISO SE MEDÍA MAL.** `recortado` se calculaba sobre las filas ya
//      filtradas por línea, así que un filtro que quitaba 300 de los 1.201
//      documentos leídos contestaba «no se recortó nada» habiendo dejado atrás
//      meses enteros. Un recorte que no se anuncia se lee como «esto es todo lo
//      que hay», que es la mentira que este módulo lleva evitando desde el
//      principio.
//
// ⚠️ CÓMO SE EJECUTA ALGO QUE HABLA CON FIRESTORE. `cargabilidadRepo.ts` no se
// puede importar desde Node —trae `@lineas/...`, un `package.json` y rutas sin
// extensión, que solo resuelve el empaquetador—, y por eso hasta hoy solo se
// probaba leyendo su texto. Aquí se extrae la FUENTE REAL de las funciones (no
// una copia: se recorta del archivo publicado), se le quitan los tipos con la
// herramienta de Node y se carga como módulo con un doble de Firestore que
// respeta `where`, `orderBy` y `limit`. Si alguien vuelve a poner la consulta
// ascendente, el doble devuelve los días viejos y estas pruebas se ponen rojas.
//
// ⚠️ Datos SINTÉTICOS: el repositorio es público (`L-23`). Líneas `LX-1`/`LX-2`,
// organización `org-de-prueba`. Ni un byte de cliente.
// ============================================================================
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

import { empaquetarPorDia, resumirDia } from '../nucleo/cargabilidad.js';
import { CargaDeCargabilidad, idDelDia } from '../contratos/src/cargabilidad.ts';
// ⚠️ EL CRITERIO DE «ESTE DÍA YA ESTÁ IGUAL» TIENE UN SOLO DUEÑO. El cargador de
// consola y esta pantalla escriben en las MISMAS tres colecciones; si cada uno
// decidiera a su manera qué cuenta como cambio, una misma carpeta pasada por los
// dos caminos dejaría dos históricos. Se traen los de la herramienta para
// compararlos de verdad, no para copiarlos.
import {
  mismoContenido as mismoContenidoDeLaHerramienta,
  NO_SE_COMPARAN as NO_SE_COMPARAN_DE_LA_HERRAMIENTA,
} from '../herramientas/cargar-cargabilidad.mjs';

// El aviso de «experimental» de la herramienta de tipos ensuciaría la salida de
// `npm test`. Se silencia SOLO ése; cualquier otro aviso sigue saliendo.
const avisosDeAntes = process.listeners('warning');
process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.name !== 'ExperimentalWarning') for (const l of avisosDeAntes) l(w);
});

const leer = (p) => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf-8');
const REPO = leer('web/src/datos/cargabilidadRepo.ts');
const INDICES = JSON.parse(leer('firestore.indexes.json'));
const VERSION_MOTOR = JSON.parse(leer('nucleo/package.json')).version;

const ORG = 'org-de-prueba';
const SESION = { uid: 'uid-de-prueba', orgId: ORG };

/** Comparación por código, la misma que usa Firestore para ordenar cadenas. */
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);

// ════════════════════════════════════════════════════════════════════════════
// LA FUENTE REAL, ejecutable
// ════════════════════════════════════════════════════════════════════════════

/**
 * Recorta del archivo publicado el cuerpo de una función, desde su firma hasta
 * la primera llave de cierre a principio de línea. Si alguien cambia la forma
 * del archivo, esto falla RUIDOSAMENTE en vez de probar un trozo equivocado.
 */
function fuenteDe(nombre) {
  const firmas = [
    `export function ${nombre}(`, `export async function ${nombre}(`,
    // Las de dentro del módulo —`ordenarHondo`— también se ejecutan: son parte
    // del criterio con el que se decide si un día cambió.
    `function ${nombre}(`,
  ];
  const i = firmas.map((f) => REPO.indexOf(f)).find((k) => k >= 0);
  assert.ok(i != null && i >= 0, `no está \`${nombre}\` en el repositorio: ¿se renombró?`);
  const j = REPO.indexOf('\n}\n', i);
  assert.ok(j > i, `no se encontró el final de \`${nombre}\``);
  const trozo = REPO.slice(i, j + 3);
  assert.ok(trozo.includes('return'), `\`${nombre}\` se recortó mal: no llega a su \`return\``);
  return trozo;
}

/**
 * Igual que `fuenteDe`, para una constante (`const x = …;`). Con `exportada` se
 * conserva el `export`, que es lo que permite leerla desde la prueba y
 * compararla con la del cargador de consola.
 */
function constanteDe(nombre, { exportada = false } = {}) {
  const marca = `${exportada ? 'export ' : ''}const ${nombre} = `;
  const i = REPO.indexOf(marca);
  assert.ok(i >= 0, `no está la constante \`${nombre}\` en el repositorio`);
  const j = REPO.indexOf(';\n', i);
  assert.ok(j > i, `no se encontró el final de \`${nombre}\``);
  return REPO.slice(i, j + 1);
}

/**
 * EL DOBLE DE FIRESTORE. No es un montón de respuestas guardadas: guarda un
 * universo de documentos y RESUELVE la consulta —filtros, orden y tope— como lo
 * haría la base. Eso es lo que permite que una consulta ascendente se note.
 */
const PRELUDIO_BASE = `
let BASE = [];
export const guardarEnLaBase = (xs) => { BASE = xs; };
export const consultas = [];
const RESUMENES = 'cargabilidad_resumenes';
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
const cargarFirebase = async () => ({ baseDatos: async () => ({ nombre: 'base-de-prueba' }) });
const firestore = async () => ({
  collection: (db, nombre) => ({ clase: 'collection', nombre }),
  where: (campo, op, valor) => ({ clase: 'where', campo, op, valor }),
  orderBy: (campo, direccion = 'asc') => ({ clase: 'orderBy', campo, direccion }),
  limit: (n) => ({ clase: 'limit', n }),
  query: (col, ...partes) => ({ col, partes }),
  getDocs: async (q) => {
    consultas.push(q);
    const condiciones = q.partes.filter((p) => p.clase === 'where');
    const orden = q.partes.find((p) => p.clase === 'orderBy');
    const tope = q.partes.find((p) => p.clase === 'limit');
    let filas = BASE.filter((d) => condiciones.every((w) => {
      const v = d[w.campo];
      if (w.op === '==') return v === w.valor;
      if (w.op === '>=') return String(v) >= String(w.valor);
      if (w.op === '<=') return String(v) <= String(w.valor);
      throw new Error('la prueba no contempla el operador ' + w.op);
    }));
    if (orden) {
      // Firestore desempata por id de documento, y en la MISMA dirección.
      filas = filas.slice().sort((a, b) => {
        const c = cmp(String(a[orden.campo]), String(b[orden.campo])) || cmp(String(a.id), String(b.id));
        return orden.direccion === 'desc' ? -c : c;
      });
    }
    if (tope) filas = filas.slice(0, tope.n);
    return { docs: filas.map((d) => ({ data: () => d })) };
  },
});
`;

/**
 * El doble del repositorio de líneas, para la lista del parque.
 *
 * ⚠️ `ordenarParque` se trae EL DE VERDAD, no un doble: desde 2026-09-17
 * `lineasDelParque` reusa el criterio del parque en vez de reordenar por su
 * cuenta —ordenaba `creadoEn` como TEXTO, y «…T09:00:00-05:00» es tres horas
 * POSTERIOR a «…T12:00:00Z» aunque alfabéticamente vaya antes—, así que la
 * columna del parque y este desplegable enseñaban el mismo parque en distinto
 * orden. Copiar aquí un doble del comparador reharía justo el problema que se
 * acaba de cerrar: dos criterios para lo mismo.
 */
const PRELUDIO_PARQUE = `
import { ordenarParque } from ${JSON.stringify(new URL('../web/src/datos/repositorio.ts', import.meta.url).href)};
let LINEAS = [];
let FALLO = null;
export const parqueDevuelve = (xs) => { LINEAS = xs; FALLO = null; };
export const parqueFalla = (m) => { FALLO = m; };
const repositorioFirestore = {
  listarLineas: async () => { if (FALLO) throw new Error(FALLO); return LINEAS; },
};
`;

/**
 * EL DOBLE PARA ESCRIBIR — una base que GUARDA lo que se le manda y apunta cada
 * escritura, para poder responder las dos preguntas que de verdad importan aquí:
 * **qué se escribió** y **qué NO se tocó**.
 *
 * ⚠️ Los moldes son LOS DE VERDAD (`contratos/src/cargabilidad.ts`), no un
 * doble. El campo donde van los días apartados vive ahí, y un doble permisivo
 * dejaría pasar exactamente lo que esta prueba existe para cazar: que el molde
 * se coma el campo en silencio y la carga afirme que entró todo.
 *
 * `moldeDeLaCarga.ciego` simula un molde que NO conoce el campo `apartados`: un
 * `z.object` sin `passthrough` borra lo que no conoce **sin error y sin aviso**,
 * y ése es exactamente el estado en el que el repositorio se tiene que parar en
 * vez de escribir una carga que calla lo que se dejó fuera.
 */
const PRELUDIO_GUARDADO = `
import {
  CargaDeCargabilidad as CargaReal, DiaDeCargabilidad, ResumenDiarioCargabilidad,
  idDelDia, idDelResumen, ROTULO_MOTIVO_APARTADO,
} from ${JSON.stringify(new URL('../contratos/src/cargabilidad.ts', import.meta.url).href)};
import { VERSION_CONTRATO } from ${JSON.stringify(new URL('../contratos/src/comunes.ts', import.meta.url).href)};

const nucleoPkg = { version: VERSION_MOTOR_DE_LA_PRUEBA };

export const moldeDeLaCarga = { ciego: false };
const CargaDeCargabilidad = {
  parse: (x) => {
    const salida = CargaReal.parse(x);
    if (!moldeDeLaCarga.ciego) return salida;
    const copia = { ...salida };
    delete copia.apartados;
    return copia;
  },
};

/** El universo guardado: clave «coleccion/id» → documento, como en la base. */
let BASE = new Map();
export const escrituras = [];
export const lotes = [];
export const vaciarLaBase = () => { BASE = new Map(); escrituras.length = 0; lotes.length = 0; };
export const loGuardado = (coleccion, id) => BASE.get(coleccion + '/' + id) ?? null;
export const todoLoGuardado = () => [...BASE.entries()].map(([clave, doc]) => [clave, doc]);

const cargarFirebase = async () => ({ baseDatos: async () => ({ nombre: 'base-de-prueba' }) });
const firestore = async () => ({
  doc: (db, coleccion, id) => ({ coleccion, id }),
  getDoc: async (ref) => {
    const d = BASE.get(ref.coleccion + '/' + ref.id);
    return { exists: () => d !== undefined, data: () => d };
  },
  setDoc: async (ref, datos) => {
    escrituras.push({ via: 'suelta', coleccion: ref.coleccion, id: ref.id, doc: datos });
    BASE.set(ref.coleccion + '/' + ref.id, datos);
  },
  writeBatch: () => {
    const pendientes = [];
    return {
      set: (ref, datos) => { pendientes.push([ref, datos]); },
      commit: async () => {
        lotes.push(pendientes.length);
        for (const [ref, datos] of pendientes) {
          escrituras.push({ via: 'lote', coleccion: ref.coleccion, id: ref.id, doc: datos });
          BASE.set(ref.coleccion + '/' + ref.id, datos);
        }
      },
    };
  },
});
`;

async function cargar(preludio, nombres) {
  const fuente = preludio + '\n' + nombres.map(fuenteDe).join('\n');
  const js = stripTypeScriptTypes(fuente, { mode: 'strip' });
  return import('data:text/javascript;charset=utf-8,' + encodeURIComponent(js));
}

let repo;      // resumenesEntre + recorteDeResumenes, con el doble de Firestore
let parque;    // lineasDelParque + codigoEnElParque, con el doble del repositorio
let guardado;  // guardarCarga + acumularAcuses, con una base que guarda de verdad

before(async () => {
  // `conMiles` es del propio repositorio (no una copia): el aviso que ve el
  // Ingeniero tiene que salir con el separador de miles de verdad.
  repo = await cargar(PRELUDIO_BASE + constanteDe('conMiles'), ['recorteDeResumenes', 'resumenesEntre']);
  parque = await cargar(PRELUDIO_PARQUE, ['lineasDelParque', 'codigoEnElParque']);
  guardado = await cargar(
    PRELUDIO_GUARDADO.replace('VERSION_MOTOR_DE_LA_PRUEBA', JSON.stringify(VERSION_MOTOR))
      + [
        constanteDe('SELLO'), constanteDe('DIAS'), constanteDe('RESUMENES'), constanteDe('CARGAS'),
        constanteDe('POR_LOTE'), constanteDe('NO_SE_COMPARAN', { exportada: true }),
        constanteDe('conMiles'),
      ].join('\n'),
    ['ordenarHondo', 'mismoContenido', 'guardarCarga', 'acumularAcuses'],
  );
});

// ── El universo de prueba ───────────────────────────────────────────────────

/** Un día a partir del 2026-01-01, sin inventar ninguna fecha de cliente. */
const dia = (n) => new Date(Date.UTC(2026, 0, 1) + n * 86400000).toISOString().slice(0, 10);

/** Un resumen diario sintético, con una cifra que se pueda seguir de punta a punta. */
const resumen = (linea, fecha, maxima_pct) => ({
  id: `${ORG}__${linea.toLowerCase()}__${fecha}`,
  orgId: ORG, tipo: 'resumen_cargabilidad', linea, fecha,
  horasConMedida: 24, maxima_pct, minima_pct: maxima_pct - 20, promedio_pct: maxima_pct - 10,
  porBanda: { normal: 24, elevada: 0, atencion: 0, sobrecarga: 0 },
});

/** `n` días seguidos de una línea. La cifra crece con el día: se sabe cuál es cuál. */
const serie = (linea, n, desdeDia = 0) =>
  Array.from({ length: n }, (_, k) => resumen(linea, dia(desdeDia + k), 30 + ((desdeDia + k) % 60)));

/** Todo el periodo, para que «desde el principio» no deje nada fuera. */
const TODO = { desde: '2000-01-01', hasta: '2099-12-31' };

/**
 * LA IMPLEMENTACIÓN DE ANTES DE ESTE CAMBIO, tal como estaba en el repositorio:
 * consulta ascendente, `limit(tope + 1)`, filtro por línea en el cliente y
 * `slice(0, tope)`. Sirve para demostrar dos cosas distintas: que por debajo del
 * tope el resultado es IDÉNTICO, y que por encima no lo es —ni debe serlo—.
 */
function comoAntes(universo, { desde, hasta, lineas = [], tope }) {
  let filas = universo
    .filter((d) => d.orgId === ORG && String(d.fecha) >= desde && String(d.fecha) <= hasta)
    .filter((d) => (lineas.length === 1 ? d.linea === lineas[0] : true))
    .slice()
    .sort((a, b) => cmp(String(a.fecha), String(b.fecha)) || cmp(String(a.id), String(b.id)))
    .slice(0, tope + 1);
  if (lineas.length > 1) filas = filas.filter((f) => lineas.includes(String(f.linea)));
  return { resumenes: filas.slice(0, tope), recortado: filas.length > tope, tope };
}

// ════════════════════════════════════════════════════════════════════════════
// 1 · LA CONSULTA QUE SE MANDA
// ════════════════════════════════════════════════════════════════════════════
describe('la consulta del periodo', () => {
  test('⚠️ pide de la MÁS NUEVA hacia atrás, y uno más que el tope', () => {
    // Descendente + `limit(tope + 1)` es lo único que hace que el recorte se
    // coma lo viejo y que se pueda saber que había más sin leerlo.
    repo.guardarEnLaBase(serie('LX-1', 5));
    repo.consultas.length = 0;
    return repo.resumenesEntre(TODO, SESION, { tope: 3 }).then(() => {
      const q = repo.consultas.at(-1);
      assert.equal(q.col.nombre, 'cargabilidad_resumenes', 'no se lee la colección de resúmenes');
      const orden = q.partes.find((p) => p.clase === 'orderBy');
      assert.deepEqual(orden, { clase: 'orderBy', campo: 'fecha', direccion: 'desc' });
      assert.deepEqual(q.partes.find((p) => p.clase === 'limit'), { clase: 'limit', n: 4 });
    });
  });

  test('los filtros de siempre: organización y las dos puntas del periodo', async () => {
    repo.guardarEnLaBase(serie('LX-1', 5));
    repo.consultas.length = 0;
    await repo.resumenesEntre({ desde: dia(1), hasta: dia(3) }, SESION, { tope: 10 });
    const w = repo.consultas.at(-1).partes.filter((p) => p.clase === 'where');
    assert.deepEqual(w.map((x) => [x.campo, x.op, x.valor]), [
      ['orgId', '==', ORG], ['fecha', '>=', dia(1)], ['fecha', '<=', dia(3)],
    ]);
  });

  test('«solo esta línea» entra EN la consulta; «todas» no filtra por línea', async () => {
    repo.guardarEnLaBase([...serie('LX-1', 4), ...serie('LX-2', 4)]);

    repo.consultas.length = 0;
    const una = await repo.resumenesEntre({ ...TODO, lineas: ['LX-1'] }, SESION, { tope: 10 });
    const w = repo.consultas.at(-1).partes.filter((p) => p.clase === 'where');
    assert.deepEqual(w[1], { clase: 'where', campo: 'linea', op: '==', valor: 'LX-1' },
      'la línea tiene que ir pegada a la organización, antes del rango de fechas');
    assert.ok(una.resumenes.every((r) => r.linea === 'LX-1'));
    assert.equal(una.resumenes.length, 4);

    repo.consultas.length = 0;
    const todas = await repo.resumenesEntre(TODO, SESION, { tope: 10 });
    assert.ok(!repo.consultas.at(-1).partes.some((p) => p.campo === 'linea'));
    assert.equal(todas.resumenes.length, 8);
  });

  test('⚠️ el índice DESCENDENTE está declarado — sin él la consulta muere en producción', () => {
    // `35 · L-85`: el emulador sirve la consulta sin índice y no se queja, así
    // que un índice que falte no aparece hasta producción… y cuando aparece, lo
    // hace como «no existen registros» teniéndolos.
    const hay = (campos) => INDICES.indexes.some((i) => i.collectionGroup === 'cargabilidad_resumenes'
      && JSON.stringify(i.fields.map((f) => [f.fieldPath, f.order]))
        === JSON.stringify(campos));
    assert.ok(hay([['orgId', 'ASCENDING'], ['fecha', 'DESCENDING']]),
      'falta el índice descendente de «todas las líneas»');
    assert.ok(hay([['orgId', 'ASCENDING'], ['linea', 'ASCENDING'], ['fecha', 'DESCENDING']]),
      'falta el índice descendente de «una línea»');
  });

  test('y no se estrena ninguna consulta nueva: misma forma, otra dirección', () => {
    const i = REPO.indexOf('export async function resumenesEntre');
    const cuerpo = REPO.slice(i, REPO.indexOf('\n}\n', i));
    assert.match(cuerpo, /orderBy\('fecha', 'desc'\)/);
    assert.match(cuerpo, /limit\(tope \+ 1\)/);
    assert.doesNotMatch(cuerpo, /orderBy\('fecha'\)/, 'volvió la consulta ascendente');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2 · EL RECORTE SE QUEDA CON LO MÁS RECIENTE, Y LO DICE
// ════════════════════════════════════════════════════════════════════════════
describe('cuando hay más días de los que caben', () => {
  const TOPE = 30;

  test('⚠️ se queda con los MÁS RECIENTES, no con los más viejos', async () => {
    repo.guardarEnLaBase(serie('LX-1', 100));            // del día 0 al 99
    const r = await repo.resumenesEntre(TODO, SESION, { tope: TOPE });

    assert.equal(r.resumenes.length, TOPE);
    assert.equal(r.resumenes[0].fecha, dia(70), 'el primero que se ve no es el más reciente-30');
    assert.equal(r.resumenes.at(-1).fecha, dia(99), 'falta el último día guardado');
    assert.ok(!r.resumenes.some((x) => x.fecha < dia(70)), 'se colaron días viejos');

    // Y la prueba que faltaba: lo de ANTES traía justo los otros treinta.
    const antes = comoAntes(serie('LX-1', 100), { ...TODO, tope: TOPE });
    assert.equal(antes.resumenes[0].fecha, dia(0));
    assert.equal(antes.resumenes.at(-1).fecha, dia(29),
      'la implementación anterior no se quedaba con lo viejo: revise el montaje de la prueba');
  });

  test('⚠️ y lo DICE: qué se trajo, desde cuándo y qué hacer para ver el resto', async () => {
    repo.guardarEnLaBase(serie('LX-1', 100));
    const r = await repo.resumenesEntre({ desde: dia(0), hasta: dia(99) }, SESION, { tope: TOPE });

    assert.equal(r.recortado, true);
    assert.equal(r.tope, TOPE);
    assert.deepEqual(r.pedido, { desde: dia(0), hasta: dia(99) });
    assert.equal(r.desdeLeido, dia(70));
    assert.equal(r.hastaLeido, dia(99));
    assert.ok(r.aviso, 'se recortó y no hay nada que enseñar en pantalla');
    assert.match(r.aviso, new RegExp(`${TOPE} días más recientes`));
    assert.match(r.aviso, new RegExp(dia(0)), 'el aviso no dice qué periodo se pidió');
    assert.match(r.aviso, new RegExp(dia(70)), 'el aviso no dice desde cuándo se está viendo');
    assert.match(r.aviso, /Acote el periodo/, 'no dice cómo ver el resto');
  });

  test('y el número del aviso se escribe como se lee en Colombia: 1.200, no 1200', () => {
    const r = repo.recorteDeResumenes(
      serie('LX-1', 1201).reverse(), { tope: 1200, desde: dia(0), hasta: dia(1200) },
    );
    assert.equal(r.recortado, true);
    assert.match(r.aviso, /los 1\.200 días más recientes/);
  });

  test('la frontera: justo en el tope no se recorta ni se avisa; uno más, sí', async () => {
    repo.guardarEnLaBase(serie('LX-1', TOPE));
    const justo = await repo.resumenesEntre(TODO, SESION, { tope: TOPE });
    assert.equal(justo.recortado, false);
    assert.equal(justo.aviso, null);
    assert.equal(justo.resumenes.length, TOPE);

    repo.guardarEnLaBase(serie('LX-1', TOPE + 1));
    const uno = await repo.resumenesEntre(TODO, SESION, { tope: TOPE });
    assert.equal(uno.recortado, true);
    assert.equal(uno.resumenes.length, TOPE);
    assert.equal(uno.resumenes[0].fecha, dia(1), 'el que se cae tiene que ser el más VIEJO');
  });

  test('⚠️ con varias líneas, el tope se mide sobre lo LEÍDO, no sobre lo que queda', async () => {
    // La regresión de antes: el filtro por línea quitaba filas DESPUÉS de leer,
    // la cuenta se hacía sobre las que quedaban y la pantalla contestaba «no se
    // recortó nada» habiendo dejado meses atrás sin leer.
    repo.guardarEnLaBase([...serie('LX-1', 100), ...serie('LX-2', 100), ...serie('LX-3', 100)]);
    const r = await repo.resumenesEntre({ ...TODO, lineas: ['LX-1', 'LX-2'] }, SESION, { tope: TOPE });

    assert.ok(r.resumenes.length < TOPE, 'el filtro tiene que quitar las de LX-3');
    assert.ok(r.resumenes.every((x) => x.linea !== 'LX-3'), 'se coló una línea que no se pidió');
    assert.equal(r.recortado, true, 'se leyó hasta el tope: hay días anteriores sin leer y hay que decirlo');

    const antes = comoAntes(
      [...serie('LX-1', 100), ...serie('LX-2', 100), ...serie('LX-3', 100)],
      { ...TODO, lineas: ['LX-1', 'LX-2'], tope: TOPE },
    );
    assert.equal(antes.recortado, false,
      'la implementación anterior no mentía aquí: revise el montaje de la prueba');
  });

  test('un periodo sin nada guardado no revienta ni avisa de un recorte que no hubo', async () => {
    repo.guardarEnLaBase(serie('LX-1', 10));
    const r = await repo.resumenesEntre({ desde: dia(500), hasta: dia(600) }, SESION, { tope: TOPE });
    assert.deepEqual(r.resumenes, []);
    assert.equal(r.recortado, false);
    assert.equal(r.aviso, null);
    assert.equal(r.desdeLeido, null);
    assert.equal(r.hastaLeido, null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3 · POR DEBAJO DEL TOPE, IDÉNTICO A HOY
// ────────────────────────────────────────────────────────────────────────────
// Es la mitad del encargo que nadie ve si sale bien: lo que ya está guardado
// tiene que leerse igual. La línea piloto tiene 807 días guardados —muy por
// debajo de los 1.200 del tope—, así que este cambio no puede moverle ni una
// cifra ni una posición.
// ════════════════════════════════════════════════════════════════════════════
describe('lo que ya está guardado se lee IGUAL', () => {
  test('⚠️ 807 días de una línea: mismas filas, mismo orden, mismas cifras', async () => {
    const universo = serie('LX-1', 807);
    repo.guardarEnLaBase(universo);

    const ahora = await repo.resumenesEntre({ ...TODO, lineas: ['LX-1'] }, SESION);   // tope 1.200 por defecto
    const antes = comoAntes(universo, { ...TODO, lineas: ['LX-1'], tope: 1200 });

    assert.equal(ahora.resumenes.length, 807);
    assert.equal(ahora.recortado, false, 'con 807 días y tope 1.200 no se recorta nada');
    assert.equal(ahora.aviso, null);
    // Fila a fila, con sus cifras: es la comprobación de verdad.
    assert.deepEqual(ahora.resumenes, antes.resumenes);
    assert.equal(ahora.resumenes[0].fecha, dia(0));
    assert.equal(ahora.resumenes.at(-1).fecha, dia(806));
    assert.equal(ahora.resumenes[0].maxima_pct, universo[0].maxima_pct);
    assert.equal(ahora.resumenes.at(-1).maxima_pct, universo[806].maxima_pct);
  });

  test('y con el tope por defecto sigue habiendo margen: 807 de 1.200', async () => {
    // Si alguien baja el tope por debajo de lo guardado, la pantalla empezará a
    // recortar: que sea una decisión, no un descuido.
    assert.match(REPO, /tope = 1200/, 'cambió el tope por defecto del periodo');
  });

  test('el mismo día con varias filas no cambia de orden (empates por documento)', async () => {
    // Dos líneas el mismo día, o el mismo día con dos estadísticos: la consulta
    // ascendente los devolvía en un orden y la descendente, al revés. Por eso se
    // da la vuelta a la lista entera en vez de reordenar por fecha.
    const universo = [
      resumen('LX-1', dia(0), 40), resumen('LX-2', dia(0), 50),
      resumen('LX-1', dia(1), 41), resumen('LX-2', dia(1), 51),
    ];
    repo.guardarEnLaBase(universo);
    const ahora = await repo.resumenesEntre(TODO, SESION, { tope: 10 });
    const antes = comoAntes(universo, { ...TODO, tope: 10 });
    assert.deepEqual(ahora.resumenes.map((r) => [r.fecha, r.linea]),
      antes.resumenes.map((r) => [r.fecha, r.linea]));
  });

  test('el orden que espera la pantalla: de la fecha más vieja a la más nueva, siempre', async () => {
    for (const tope of [5, 40, 1200]) {
      repo.guardarEnLaBase(serie('LX-1', 40));
      const r = await repo.resumenesEntre(TODO, SESION, { tope });
      const fechas = r.resumenes.map((x) => String(x.fecha));
      assert.deepEqual(fechas, [...fechas].sort(), `con tope ${tope} el orden no es ascendente`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4 · EL RECORTE, POR SEPARADO (la pieza pura)
// ════════════════════════════════════════════════════════════════════════════
describe('la decisión del recorte, sin base de datos', () => {
  const nuevoPrimero = (n) => serie('LX-1', n).slice().reverse();

  test('recibe de la más nueva a la más vieja y devuelve al revés', () => {
    const r = repo.recorteDeResumenes(nuevoPrimero(4), { tope: 10, desde: dia(0), hasta: dia(3) });
    assert.deepEqual(r.resumenes.map((x) => x.fecha), [dia(0), dia(1), dia(2), dia(3)]);
    assert.equal(r.recortado, false);
  });

  test('no toca los documentos: se devuelven tal como llegaron', () => {
    const entrada = nuevoPrimero(3);
    const copia = JSON.parse(JSON.stringify(entrada));
    const r = repo.recorteDeResumenes(entrada, { tope: 2, desde: dia(0), hasta: dia(2) });
    assert.deepEqual(entrada, copia, 'la lista de entrada se modificó por el camino');
    assert.equal(r.resumenes.length, 2);
    assert.deepEqual(r.resumenes.map((x) => x.fecha), [dia(1), dia(2)]);
  });

  test('sin nada leído, ni avisa ni inventa fechas', () => {
    const r = repo.recorteDeResumenes([], { tope: 5, desde: dia(0), hasta: dia(9) });
    assert.deepEqual(r, {
      resumenes: [], recortado: false, tope: 5,
      pedido: { desde: dia(0), hasta: dia(9) }, desdeLeido: null, hastaLeido: null, aviso: null,
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5 · LA LISTA DEL PARQUE, para que la línea se ELIJA y no se escriba
// ════════════════════════════════════════════════════════════════════════════
describe('las líneas del parque', () => {
  const linea = (id, codigo, nombre, creadoEn) => ({
    id, codigo, nombre, creadoEn, tipo: 'linea', orgId: ORG, creadoPor: 'uid', revision: 0,
  });

  test('vienen en el orden en que se dieron de alta, no como las devuelva la base', async () => {
    parque.parqueDevuelve([
      linea('id-3', 'LX-3', 'Línea de prueba 3', '2026-09-17T10:00:00.000Z'),
      linea('id-1', 'LX-1', 'Línea de prueba 1', '2026-07-30T10:00:00.000Z'),
      linea('id-2', 'LX-2', 'Línea de prueba 2', '2026-09-17T09:00:00.000Z'),
    ]);
    const xs = await parque.lineasDelParque();
    assert.deepEqual(xs.map((x) => x.codigo), ['LX-1', 'LX-2', 'LX-3']);
    assert.deepEqual(xs[0], { id: 'id-1', codigo: 'LX-1', nombre: 'Línea de prueba 1' },
      'la lista tiene que traer id, código y nombre — y nada más');
  });

  test('con la misma fecha de alta, por código: la lista no baila entre dos lecturas', async () => {
    const mismo = '2026-09-17T10:00:00.000Z';
    parque.parqueDevuelve([
      linea('id-b', 'LX-9', 'Nueve', mismo),
      linea('id-a', 'LX-2', 'Dos', mismo),
    ]);
    const xs = await parque.lineasDelParque();
    assert.deepEqual(xs.map((x) => x.codigo), ['LX-2', 'LX-9']);
    const otra = await parque.lineasDelParque();
    assert.deepEqual(otra, xs, 'dos lecturas seguidas dan órdenes distintos');
  });

  test('una cuenta sin líneas devuelve la lista vacía…', async () => {
    parque.parqueDevuelve([]);
    assert.deepEqual(await parque.lineasDelParque(), []);
  });

  test('⚠️ …pero un fallo de lectura LANZA: vacío significa «no tiene», no «no se pudo»', async () => {
    parque.parqueFalla('Missing or insufficient permissions');
    await assert.rejects(() => parque.lineasDelParque(), /insufficient permissions/);
  });

  test('no abre consulta propia a `lineas`: reusa la del repositorio', () => {
    const cuerpo = fuenteDe('lineasDelParque');
    assert.match(cuerpo, /repositorioFirestore\.listarLineas\(\)/);
    assert.doesNotMatch(cuerpo, /collection\(/, 'se abrió una segunda forma de decir qué líneas existen');
    assert.doesNotMatch(cuerpo, /getDocs|where\(/);
    // Y contra el singleton NO, que arranca en «sin sesión» y devolvería [].
    assert.doesNotMatch(cuerpo, /\brepositorio\.listarLineas/);
  });
});

describe('el código elegido es el del parque, con su grafía', () => {
  const PARQUE = [
    { id: 'id-1', codigo: 'LX-1', nombre: 'Uno' },
    { id: 'id-2', codigo: 'LX-2', nombre: 'Dos' },
  ];

  test('devuelve el código canónico, no lo que se escribió', () => {
    // ⚠️ El `id` del día colapsa mayúsculas y espacios, pero el campo `linea` se
    // guarda tal cual y las consultas son literales: dos grafías escriben el
    // MISMO documento y luego una de las dos no encuentra nada.
    assert.equal(parque.codigoEnElParque('lx-1', PARQUE), 'LX-1');
    assert.equal(parque.codigoEnElParque('  LX-1  ', PARQUE), 'LX-1');
    assert.equal(parque.codigoEnElParque('LX-2', PARQUE), 'LX-2');
  });

  test('un código que no está en el parque no es nadie', () => {
    assert.equal(parque.codigoEnElParque('LX-9', PARQUE), null);
    assert.equal(parque.codigoEnElParque('LX1', PARQUE), null, 'sin el guion es otro código');
    assert.equal(parque.codigoEnElParque('', PARQUE), null);
    assert.equal(parque.codigoEnElParque('   ', PARQUE), null);
    assert.equal(parque.codigoEnElParque('LX-1', []), null, 'sin parque no se puede confirmar nada');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6 · LO QUE NO SE TOCÓ
// ════════════════════════════════════════════════════════════════════════════
describe('el resto del repositorio sigue en su sitio', () => {
  test('el día completo se sigue pidiendo por su id, y los del periodo son los últimos', () => {
    assert.match(REPO, /export async function diaCompleto/);
    assert.match(REPO, /const traer = pedidas\.slice\(-tope\);/,
      'los días completos del periodo ya se quedaban con los más recientes');
  });

  test('guardar no cambió: sigue escribiendo el rastro primero y sellando lo que escribe', () => {
    const i = REPO.indexOf('export async function guardarCarga');
    const cuerpo = REPO.slice(i, REPO.indexOf('export interface ResumenesDelPeriodo'));
    assert.ok(cuerpo.indexOf('setDoc(doc(db, CARGAS, cargaId)') < cuerpo.indexOf('lote.commit()'));
    assert.equal((cuerpo.match(/versionMotor: SELLO\.versionMotor/g) ?? []).length, 2);
  });

  test('y nada de esto abre la puerta a borrar: aquí no hay `deleteDoc`', () => {
    assert.doesNotMatch(REPO, /deleteDoc/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 7 · GUARDAR POR TANDAS — lo apartado, lo repetido y lo que de verdad se escribe
// ────────────────────────────────────────────────────────────────────────────
// QUÉ SE JUEGA AQUÍ. La pantalla admite CIEN archivos por carga —es el tope del
// rastro de procedencia, `CargaDeCargabilidad.archivos`—, así que enero-agosto
// de una línea son unas DIECISIETE tandas. Tres cosas no pueden fallar:
//
//   1. **lo que se deja fuera se escribe.** Un día con alguna hora que no es
//      «Actual» se aparta ENTERO (decisión del Ingeniero, 2026-09-20) y su
//      motivo va en el rastro, que es INMUTABLE: lo que no se escriba al
//      crearlo no se escribe nunca, y una carga que calla lo apartado afirma
//      dentro de seis meses que aquel día no vino;
//   2. **cada tanda devuelve lo suyo ya contado** —escrito, repetido, apartado—
//      para que la pantalla sume y no recalcule: un total recalculado por quien
//      no escribió acaba discrepando de la base sin que nadie lo note;
//   3. **nada de esto toca lo que ya está guardado.** El histórico no se puede
//      retirar: `firestore.rules` niega el borrado a propósito.
//
// ⚠️ Datos SINTÉTICOS (`L-23`): líneas `LX-…`, nunca las del cliente.
// ════════════════════════════════════════════════════════════════════════════

/** Un día completo de 24 horas, tal y como lo produce el motor de verdad. */
function diaSintetico({ linea = 'LX-1', fecha = dia(0), estadistico = 'maximo', amperios = (h) => 100 + h } = {}) {
  const registros = Array.from({ length: 24 }, (_, h) => ({
    linea, fecha, hora: h, estadistico, corriente_A: amperios(h), tension_kV: 68.4,
  }));
  const { dias } = empaquetarPorDia(registros);
  assert.equal(dias.length, 1, 'el montaje de la prueba no produjo un día');
  return { dias, resumenes: dias.map((d) => resumirDia(d)) };
}

/** El rastro de la carga, con lo mínimo que su molde exige. */
const carga = (extra = {}) => ({
  nombreArchivo: 'tanda-sintetica.csv',
  archivos: ['tanda-sintetica.csv'],
  filasDelArchivo: 24, registrosGuardados: 24, filasConError: 0,
  mapeo: {}, lineas: ['LX-1'], estadisticos: ['maximo'],
  desde: dia(0), hasta: dia(0),
  ...extra,
});

/**
 * LOS DOS DÍAS APARTADOS DE LA PRUEBA, con la forma del molde: fecha, motivo de
 * un catálogo CERRADO y el detalle de qué sello lo marcó y en qué horas.
 *
 * ⚠️ Fechas y sellos SINTÉTICOS; y sin una sola etiqueta del SCADA —la ruta de
 * subestación y bahía es material del cliente y este repositorio es público—.
 */
const APARTADOS = [
  {
    fecha: '2026-04-20', motivo: 'sello_no_actual', sellos: ['Not Renewed'],
    horas: ['07', '08', '09'], senalesAfectadas: 3,
    detalle: '3 señal(es) con sello «Not Renewed» ×39 en la(s) hora(s) 7, 8, 9 h',
  },
  { fecha: '2026-06-20', motivo: 'fuera_del_periodo', detalle: 'el archivo es de 2025' },
];
const soloLoQueImporta = (xs) => (xs ?? []).map((x) => [x.fecha, x.motivo, x.detalle]);

describe('el rastro de la carga dice lo que se dejó FUERA', () => {
  test('⚠️ EL APRETÓN DE MANOS: el molde de los datos conserva `apartados`', () => {
    // Ésta es la única pieza de este encargo que NO vive en el repositorio: el
    // campo lo pone el molde (`contratos/src/cargabilidad.ts`). Si esta prueba
    // está roja, lo que falta es ESO —o el nombre cambió—, y hasta entonces el
    // guardado de una carga con días apartados se PARA a propósito, en vez de
    // escribir una carga que afirma que entró todo.
    const conApartados = CargaDeCargabilidad.parse({
      id: '6f1f5e2e-2a3c-4f8e-9a1d-0b7c2d3e4f50', orgId: ORG,
      creadoEn: '2026-09-20T12:00:00.000Z', creadoPor: SESION.uid, revision: 0,
      nombreArchivo: 'tanda-sintetica.csv', filasDelArchivo: 24, registrosGuardados: 24,
      filasConError: 0, mapeo: {}, lineas: ['LX-1'], estado: 'guardada',
      cargadoEn: '2026-09-20T12:00:00.000Z', cargadoPor: SESION.uid,
      apartados: APARTADOS,
    });
    assert.deepEqual(soloLoQueImporta(conApartados.apartados), soloLoQueImporta(APARTADOS),
      'el molde se come los días apartados: el rastro de una carga es INMUTABLE («update: if false» '
      + 'en las reglas), así que lo que no se escriba al crearlo NO SE ESCRIBE NUNCA. Hace falta el '
      + 'campo `apartados` en `contratos/src/cargabilidad.ts`');
  });

  test('⚠️ los días apartados se escriben, con su motivo, en el rastro y en el acuse', async () => {
    guardado.vaciarLaBase();
    const { dias, resumenes } = diaSintetico();
    const acuse = await guardado.guardarCarga(
      { dias, resumenes, carga: carga({ apartados: APARTADOS }) }, SESION,
    );

    const rastro = guardado.escrituras.find((e) => e.coleccion === 'cargabilidad_cargas');
    assert.ok(rastro, 'no se escribió el rastro de la carga');
    assert.deepEqual(soloLoQueImporta(rastro.doc.apartados), soloLoQueImporta(APARTADOS),
      'el rastro no se lleva los días apartados');
    assert.deepEqual(rastro.doc.apartados[0].sellos, ['Not Renewed'],
      'sin decir CUÁL sello lo marcó, la decisión no se puede revisar');
    assert.deepEqual(soloLoQueImporta(acuse.apartados), soloLoQueImporta(APARTADOS),
      'el acuse no devuelve lo apartado y la pantalla tendría que volver a calcularlo');
    // Y se escribe ANTES que los días, como todo el rastro: si algo falla a
    // mitad, queda dicho qué se dejó fuera y por qué.
    assert.equal(guardado.escrituras[0].coleccion, 'cargabilidad_cargas');
  });

  test('⚠️ si el molde no conservara el campo NO se guarda NADA, y se dice por qué', async () => {
    // Un `z.object` sin `passthrough` borra lo que no conoce **sin error y sin
    // aviso**: ése es el silencio que aquí no se puede permitir. Y se para ANTES
    // de escribir el rastro, para no dejar una carga a medias.
    guardado.vaciarLaBase();
    guardado.moldeDeLaCarga.ciego = true;
    try {
      const { dias, resumenes } = diaSintetico();
      await assert.rejects(
        () => guardado.guardarCarga(
          { dias, resumenes, carga: carga({ apartados: APARTADOS }) }, SESION,
        ),
        (e) => {
          assert.match(e.message, /apartados/);
          assert.match(e.message, /No se guarda nada/);
          assert.match(e.message, /2 día\(s\)/, 'no dice cuántos días se iban a dejar fuera');
          return true;
        },
      );
      assert.deepEqual(guardado.escrituras, [],
        'se escribió algo antes de pararse: el rastro de una carga no se puede corregir después');
    } finally {
      guardado.moldeDeLaCarga.ciego = false;
    }
  });

  test('y si se apartan más días de los que el molde admite, tampoco se escribe nada', async () => {
    // El tope del molde RECHAZA, no recorta: una lista de apartados que se corta
    // deja de explicar los huecos, y en silencio. Aquí lo que importa es que ese
    // rechazo llega ANTES de tocar la base.
    guardado.vaciarLaBase();
    const { dias, resumenes } = diaSintetico();
    const demasiados = Array.from({ length: 400 }, (_, k) => ({
      fecha: dia(k), motivo: 'sin_lecturas',
    }));
    await assert.rejects(
      () => guardado.guardarCarga({ dias, resumenes, carga: carga({ apartados: demasiados }) }, SESION),
    );
    assert.deepEqual(guardado.escrituras, [], 'se escribió antes de que el molde dijera que no');
  });

  test('una carga sin nada apartado se guarda como siempre, y el acuse lo dice vacío', async () => {
    guardado.vaciarLaBase();
    const { dias, resumenes } = diaSintetico();
    const acuse = await guardado.guardarCarga({ dias, resumenes, carga: carga() }, SESION);
    assert.deepEqual(acuse.apartados, []);
    assert.deepEqual(acuse.escritos, { dias: 1, resumenes: 1 });
  });
});

describe('cada tanda devuelve lo suyo ya contado', () => {
  test('la primera vez: nace todo, no se repite nada', async () => {
    guardado.vaciarLaBase();
    const { dias, resumenes } = diaSintetico();
    const a = await guardado.guardarCarga({ dias, resumenes, carga: carga() }, SESION);

    assert.equal(a.dias, 1); assert.equal(a.resumenes, 1);
    assert.deepEqual(a.escritos, { dias: 1, resumenes: 1 });
    assert.deepEqual(a.repetidos, { dias: 0, resumenes: 0 });
    assert.equal(a.reemplazados, 0);
    assert.equal(a.otroMotor, 0);
    assert.equal(a.escrituras, 3, 'el día, su resumen y el rastro de la carga');
    assert.ok(a.cargaId, 'sin id de carga no se puede rastrear de dónde salió');
  });

  test('⚠️ la segunda vez con los mismos archivos NO se reescribe nada', async () => {
    // Es lo que hace cara la carga larga: diecisiete tandas reescribiendo lo de
    // las anteriores gastarían la cuota del plan gratuito en no cambiar nada, y
    // le subirían la revisión a días que nadie corrigió.
    guardado.vaciarLaBase();
    const { dias, resumenes } = diaSintetico();
    await guardado.guardarCarga({ dias, resumenes, carga: carga() }, SESION);
    const id = idDelDia(ORG, 'LX-1', null, dia(0), 'maximo');
    const comoQuedo = JSON.parse(JSON.stringify(guardado.loGuardado('cargabilidad_dias', id)));
    guardado.escrituras.length = 0;

    const otra = diaSintetico();       // los mismos archivos, otra pasada
    const a = await guardado.guardarCarga({ ...otra, carga: carga() }, SESION);

    assert.deepEqual(a.escritos, { dias: 0, resumenes: 0 });
    assert.deepEqual(a.repetidos, { dias: 1, resumenes: 1 });
    assert.equal(a.reemplazados, 0, 'no se reemplazó nada: decían exactamente lo mismo');
    assert.equal(a.escrituras, 1, 'solo el rastro de la carga, que SÍ deja constancia del intento');
    assert.ok(!guardado.escrituras.some((e) => e.coleccion !== 'cargabilidad_cargas'),
      'se volvió a escribir un día o un resumen que ya decía lo mismo');
    assert.deepEqual(guardado.loGuardado('cargabilidad_dias', id), comoQuedo,
      'el documento guardado cambió: revisión, fecha de carga o sello');
    assert.equal(comoQuedo.revision, 0, 'la revisión subió sin que nadie corrigiera nada');
    assert.equal(comoQuedo.actualizadoEn, undefined);
  });

  test('pero un día que ya estaba y dice OTRA cosa sí se pisa, y se cuenta', async () => {
    guardado.vaciarLaBase();
    await guardado.guardarCarga({ ...diaSintetico(), carga: carga() }, SESION);
    guardado.escrituras.length = 0;

    // El mismo día, corregido: otros amperios.
    const corregido = diaSintetico({ amperios: (h) => 200 + h });
    const a = await guardado.guardarCarga({ ...corregido, carga: carga() }, SESION);

    assert.equal(a.reemplazados, 1, 'un día corregido tiene que contarse como reemplazado');
    assert.deepEqual(a.escritos, { dias: 1, resumenes: 1 });
    assert.deepEqual(a.repetidos, { dias: 0, resumenes: 0 });

    const id = idDelDia(ORG, 'LX-1', null, dia(0), 'maximo');
    const guardadoAhora = guardado.loGuardado('cargabilidad_dias', id);
    assert.equal(guardadoAhora.horas['00'].corriente_A, 200, 'la corrección no llegó a la base');
    assert.equal(guardadoAhora.revision, 1, 'una corrección sube la revisión');
    assert.ok(guardadoAhora.actualizadoEn, 'no consta cuándo se corrigió');
  });

  test('⚠️ mismas cifras con otro motor: no se reescribe, se DICE', async () => {
    // Ponerle el sello de hoy a una cifra que produjo otro motor es inventar la
    // trazabilidad; reescribir ochocientos días por un cambio de versión es
    // gastar la cuota en no cambiar nada. Se cuenta y se dice.
    guardado.vaciarLaBase();
    await guardado.guardarCarga({ ...diaSintetico(), carga: carga() }, SESION);
    const id = idDelDia(ORG, 'LX-1', null, dia(0), 'maximo');
    guardado.loGuardado('cargabilidad_dias', id).versionMotor = '0.9.0';
    guardado.escrituras.length = 0;

    const a = await guardado.guardarCarga({ ...diaSintetico(), carga: carga() }, SESION);
    assert.deepEqual(a.repetidos, { dias: 1, resumenes: 1 });
    assert.equal(a.otroMotor, 1, 'no se dice que aquel día lo escribió otro motor');
    assert.equal(guardado.loGuardado('cargabilidad_dias', id).versionMotor, '0.9.0',
      'se le puso el sello de hoy a una cifra que produjo otro motor');
  });

  test('y lo que se escribe sigue yendo sellado y en lotes por debajo del tope', async () => {
    guardado.vaciarLaBase();
    await guardado.guardarCarga({ ...diaSintetico(), carga: carga() }, SESION);
    const escrito = guardado.escrituras.filter((e) => e.via === 'lote');
    assert.equal(escrito.length, 2);
    for (const e of escrito) assert.equal(e.doc.versionMotor, VERSION_MOTOR, 'se escribió sin sello');
    assert.ok(guardado.lotes.every((n) => n > 0 && n <= 400), 'un lote se pasó del tope de la base');
  });
});

describe('lo que ya está guardado no se toca', () => {
  test('⚠️ guardar una línea nueva no escribe NI UNA VEZ sobre la que ya estaba', async () => {
    // Es la mitad del encargo que nadie ve si sale bien: la línea que lleva
    // ocho meses cargada no puede moverse ni un byte porque se cargue otra.
    guardado.vaciarLaBase();
    const vieja = diaSintetico({ linea: 'LX-627', fecha: dia(0) });
    await guardado.guardarCarga({ ...vieja, carga: carga({ lineas: ['LX-627'] }) }, SESION);
    const antes = JSON.parse(JSON.stringify(guardado.todoLoGuardado()));
    guardado.escrituras.length = 0;

    const nueva = diaSintetico({ linea: 'LX-617', fecha: dia(0) });
    const a = await guardado.guardarCarga(
      { ...nueva, carga: carga({ lineas: ['LX-617'] }) }, SESION,
    );

    assert.deepEqual(a.escritos, { dias: 1, resumenes: 1 });
    assert.ok(!guardado.escrituras.some((e) => e.id.includes('lx-627')),
      'se escribió encima de la línea que ya estaba en producción');
    for (const [clave, doc] of antes) {
      if (!clave.includes('lx-627')) continue;
      const [coleccion, id] = clave.split('/');
      assert.deepEqual(guardado.loGuardado(coleccion, id), doc,
        `cambió «${clave}», que no tenía por qué tocarse`);
    }
  });

  test('y las consultas de lectura no saben nada de esto: leen igual que ayer', () => {
    const lectura = ['ultimoDiaGuardado', 'resumenesEntre', 'diaCompleto', 'diasCompletos', 'ultimasCargas']
      .map(fuenteDe).join('\n');
    assert.doesNotMatch(lectura, /apartad/i, 'una consulta de lectura filtra por lo apartado');
    assert.doesNotMatch(lectura, /mismoContenido|repetidos|acumularAcuses/,
      'una consulta de lectura se metió en la decisión de qué se escribe');
    assert.doesNotMatch(lectura, /setDoc|writeBatch|deleteDoc/, 'una consulta de lectura escribe');
    // Y las dos que sostienen la pestaña, intactas.
    assert.match(lectura, /orderBy\('fecha', 'desc'\), limit\(tope \+ 1\)/);
    assert.match(lectura, /const traer = pedidas\.slice\(-tope\);/);
  });
});

describe('el mismo criterio que el cargador de consola', () => {
  test('⚠️ la lista de lo que NO se compara es LA MISMA en los dos caminos', () => {
    // Escriben en las mismas tres colecciones. Dos criterios para decidir si un
    // día cambió son dos históricos que se pisan el uno al otro.
    assert.deepEqual([...guardado.NO_SE_COMPARAN], [...NO_SE_COMPARAN_DE_LA_HERRAMIENTA],
      'el repositorio y `herramientas/cargar-cargabilidad.mjs` ya no comparan lo mismo');
  });

  test('y ante los mismos documentos deciden lo mismo', () => {
    const base = { fecha: '2026-01-01', horas: { '00': { corriente_A: 100 }, '01': { corriente_A: 110 } } };
    const casos = [
      ['idéntico', { ...base }, { ...base }],
      ['solo cambia la metadata', { ...base, revision: 0, cargaId: 'a', versionMotor: '0.21.0' },
        { ...base, revision: 7, cargaId: 'b', versionMotor: '0.9.0' }],
      ['las claves en otro orden', { fecha: '2026-01-01', horas: base.horas },
        { horas: base.horas, fecha: '2026-01-01' }],
      ['cambia una medida', base, { ...base, horas: { '00': { corriente_A: 999 }, '01': { corriente_A: 110 } } }],
      ['falta una hora', base, { ...base, horas: { '00': { corriente_A: 100 } } }],
      ['una lista en otro orden', { ...base, lineas: ['a', 'b'] }, { ...base, lineas: ['b', 'a'] }],
    ];
    for (const [que, a, b] of casos) {
      assert.equal(guardado.mismoContenido(a, b), mismoContenidoDeLaHerramienta(a, b),
        `«${que}»: el repositorio y la herramienta deciden distinto`);
    }
  });
});

describe('el acuse acumulado de una carga larga', () => {
  const tanda = (i, extra = {}) => ({
    cargaId: `carga-${i}`, dias: 50, resumenes: 50, reemplazados: 0, escrituras: 101,
    escritos: { dias: 50, resumenes: 50 }, repetidos: { dias: 0, resumenes: 0 },
    otroMotor: 0, apartados: APARTADOS, ...extra,
  });

  test('suma lo escrito, lo repetido y las escrituras de todas las tandas', () => {
    const t = guardado.acumularAcuses([tanda(1), tanda(2), tanda(3)]);
    assert.equal(t.tandas, 3);
    assert.deepEqual(t.cargas, ['carga-1', 'carga-2', 'carga-3']);
    assert.equal(t.dias, 150);
    assert.deepEqual(t.escritos, { dias: 150, resumenes: 150 });
    assert.equal(t.escrituras, 303);
  });

  test('⚠️ los días apartados NO se suman: se unen sin repetir', () => {
    // La lista de lo apartado es la misma para todas las tandas de una carpeta.
    // Sumarla diría «34 días apartados» donde hay dos, y cada uno de esos días
    // es una decisión pendiente del Ingeniero, no una estadística.
    const t = guardado.acumularAcuses([tanda(1), tanda(2), tanda(3)]);
    assert.equal(t.apartados.length, 2);
    assert.deepEqual(t.apartados.map((x) => x.fecha), ['2026-04-20', '2026-06-20']);
    assert.match(t.frase, /2 día\(s\) apartados SIN CARGAR/);
  });

  test('un día apartado que solo sale en una tanda no se pierde, y van ordenados', () => {
    const t = guardado.acumularAcuses([
      tanda(1, { apartados: [{ fecha: '2026-06-20', motivo: 'sin_lecturas' }] }),
      tanda(2, { apartados: [{ fecha: '2026-02-24', motivo: 'sello_no_actual', sellos: ['Invalid'] }] }),
    ]);
    assert.deepEqual(t.apartados.map((x) => x.fecha), ['2026-02-24', '2026-06-20']);
  });

  test('⚠️ y se cuentan POR MOTIVO, que es para lo que el catálogo es cerrado', () => {
    const t = guardado.acumularAcuses([tanda(1), tanda(2)]);
    assert.deepEqual(t.apartadosPorMotivo.map((m) => [m.motivo, m.dias]),
      [['sello_no_actual', 1], ['fuera_del_periodo', 1]]);
    assert.match(t.apartadosPorMotivo[0].rotulo, /sello distinto de «Actual»/,
      'el rótulo no sale del molde: habría dos maneras de llamar al mismo motivo');
    assert.match(t.frase, /1 porque alguna hora no se midió/);
  });

  test('un día con dos motivos se cuenta UNA vez: la suma no puede pasarse de los días', () => {
    const t = guardado.acumularAcuses([tanda(1, {
      apartados: [
        { fecha: '2026-04-20', motivo: 'sello_no_actual', sellos: ['Not Renewed'] },
        { fecha: '2026-04-20', motivo: 'sin_lecturas' },
      ],
    })]);
    assert.equal(t.apartados.length, 2, 'ninguno de los dos motivos se pierde de la lista');
    assert.equal(t.apartadosPorMotivo.reduce((k, m) => k + m.dias, 0), 1,
      'la suma por motivo dice más días apartados de los que hay');
    assert.match(t.frase, /1 día\(s\) apartados SIN CARGAR/);
  });

  test('la frase la redacta el que escribió, no la pantalla', () => {
    const t = guardado.acumularAcuses([
      tanda(1, { escritos: { dias: 600, resumenes: 600 }, repetidos: { dias: 0, resumenes: 0 } }),
      tanda(2, { escritos: { dias: 600, resumenes: 600 }, repetidos: { dias: 12, resumenes: 12 }, reemplazados: 3 }),
    ]);
    assert.match(t.frase, /1\.200 día\(s\)/, 'los miles se escriben como en Colombia: 1.200');
    assert.match(t.frase, /12 día\(s\) ya estaban igual/);
    assert.match(t.frase, /3 día\(s\) ya estaban y decían otra cosa/);
    assert.match(t.frase, /no se puede retirar/);
  });

  test('sin ninguna tanda no inventa nada', () => {
    const t = guardado.acumularAcuses([]);
    assert.equal(t.tandas, 0);
    assert.deepEqual(t.apartados, []);
    assert.deepEqual(t.escritos, { dias: 0, resumenes: 0 });
    assert.equal(t.frase, 'No se guardó ninguna tanda.');
  });

  test('⚠️ y el acumulado cuadra con lo que de verdad quedó en la base', async () => {
    // Tres tandas de días distintos, la tercera repetida a propósito: lo que
    // dice el acuse acumulado tiene que ser lo que hay guardado, ni uno más.
    guardado.vaciarLaBase();
    const acuses = [];
    for (const k of [0, 1, 2, 2]) {
      const { dias, resumenes } = diaSintetico({ fecha: dia(k) });
      acuses.push(await guardado.guardarCarga(
        { dias, resumenes, carga: carga({ desde: dia(k), hasta: dia(k), apartados: APARTADOS }) },
        SESION,
      ));
    }
    const t = guardado.acumularAcuses(acuses);

    assert.equal(t.tandas, 4);
    assert.equal(t.escritos.dias, 3, 'la cuarta tanda traía un día ya guardado e igual');
    assert.deepEqual(t.repetidos, { dias: 1, resumenes: 1 });
    assert.equal(t.apartados.length, 2, 'los apartados de las cuatro tandas son los mismos dos días');

    const enLaBase = guardado.todoLoGuardado();
    assert.equal(enLaBase.filter(([c]) => c.startsWith('cargabilidad_dias/')).length, t.escritos.dias);
    assert.equal(enLaBase.filter(([c]) => c.startsWith('cargabilidad_cargas/')).length, t.tandas,
      'cada tanda deja su rastro, aunque no escriba ningún día');
  });
});
