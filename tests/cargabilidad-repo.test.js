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
  const firmas = [`export function ${nombre}(`, `export async function ${nombre}(`];
  const i = firmas.map((f) => REPO.indexOf(f)).find((k) => k >= 0);
  assert.ok(i != null && i >= 0, `no está \`${nombre}\` en el repositorio: ¿se renombró?`);
  const j = REPO.indexOf('\n}\n', i);
  assert.ok(j > i, `no se encontró el final de \`${nombre}\``);
  const trozo = REPO.slice(i, j + 3);
  assert.ok(trozo.includes('return'), `\`${nombre}\` se recortó mal: no llega a su \`return\``);
  return trozo;
}

/** Igual que `fuenteDe`, para una constante de una sola línea (`const x = …;`). */
function constanteDe(nombre) {
  const i = REPO.indexOf(`const ${nombre} = `);
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

async function cargar(preludio, nombres) {
  const fuente = preludio + '\n' + nombres.map(fuenteDe).join('\n');
  const js = stripTypeScriptTypes(fuente, { mode: 'strip' });
  return import('data:text/javascript;charset=utf-8,' + encodeURIComponent(js));
}

let repo;      // resumenesEntre + recorteDeResumenes, con el doble de Firestore
let parque;    // lineasDelParque + codigoEnElParque, con el doble del repositorio

before(async () => {
  // `conMiles` es del propio repositorio (no una copia): el aviso que ve el
  // Ingeniero tiene que salir con el separador de miles de verdad.
  repo = await cargar(PRELUDIO_BASE + constanteDe('conMiles'), ['recorteDeResumenes', 'resumenesEntre']);
  parque = await cargar(PRELUDIO_PARQUE, ['lineasDelParque', 'codigoEnElParque']);
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
