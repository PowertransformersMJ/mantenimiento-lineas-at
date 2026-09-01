// ============================================================================
// tests/cargabilidad-historico.test.js — quién escribe el histórico, y qué cuesta
// ----------------------------------------------------------------------------
// QUÉ VIGILA. Las tres colecciones de cargabilidad son las primeras de VOLUMEN
// de este proyecto: hasta ahora la base guardaba 26 apoyos, y esto mete miles de
// mediciones de operación al mes. Dos cosas se pueden equivocar aquí y las dos
// son caras:
//
//   1. **QUIÉN ESCRIBE.** Es dato de operación que alimenta un dictamen de
//      ampacidad. Quien va a campo con el teléfono no tiene por qué poder
//      reescribir el histórico de carga de una línea.
//   2. **CUÁNTO CUESTA LEER.** Un año horario son 8.760 lecturas por línea.
//      Guardadas una por documento, «histórico completo» de diez líneas pide
//      87.600 lecturas de un clic — más de lo que el plan gratuito da en un día
//      entero, y el módulo deja de funcionar justo cuando empieza a servir.
//
// Las reglas de la base son la última línea y no se apoyan en el cliente
// (`ADR-004`): lo que el cliente no puede escribir lo impide Firestore.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { costeDeLectura } from '../nucleo/cargabilidad.js';

const leer = (p) => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf-8');
const REGLAS = leer('firestore.rules');
const INDICES = JSON.parse(leer('firestore.indexes.json'));
const REPO = leer('web/src/datos/cargabilidadRepo.ts');

const COLECCIONES = ['cargabilidad_dias', 'cargabilidad_resumenes', 'cargabilidad_cargas'];

/** El bloque de reglas de una colección, para poder mirarlo aparte. */
function bloque(coleccion) {
  const i = REGLAS.indexOf(`match /${coleccion}/`);
  assert.ok(i > 0, `«${coleccion}» no tiene regla: la base la niega por defecto y nada funcionará`);
  return REGLAS.slice(i, REGLAS.indexOf('}', REGLAS.indexOf('allow delete', i)));
}

// ════════════════════════════════════════════════════════════════════════════
// 1 · QUIÉN ESCRIBE
// ════════════════════════════════════════════════════════════════════════════
describe('el histórico de carga lo escribe solo el administrador', () => {
  test('las tres colecciones existen en las reglas', () => {
    // Sin regla, la base las niega y el módulo falla entero y en silencio para
    // quien no sepa que hay que declararlas.
    for (const c of COLECCIONES) assert.ok(bloque(c).length > 0);
  });

  test('⚠️ escribe `esAdmin()`, NO `esEditor()` ni `esCuadrilla()`', () => {
    for (const c of COLECCIONES) {
      const b = bloque(c);
      assert.match(b, /allow create: if esAdmin\(\)/, `${c}: crear no exige administrador`);
      assert.ok(!/esCuadrilla\(\)/.test(b),
        `${c}: la cuadrilla puede escribir el histórico de carga de una línea`);
    }
  });

  test('⚠️ NADA se borra: un histórico con borrado no es un histórico', () => {
    for (const c of COLECCIONES) {
      assert.match(bloque(c), /allow delete: if false/, `${c}: se puede borrar`);
    }
  });

  test('el DÍA sí se puede reescribir; el RASTRO de la carga no', () => {
    // Volver a cargar el mismo día corregido tiene que escribir ENCIMA — el id
    // es determinista justo para eso. Pero el rastro de qué archivo trajo qué
    // no se toca: es lo que permite responder «¿de dónde salió este número?».
    assert.match(bloque('cargabilidad_dias'), /allow update: if esAdmin\(\)/);
    assert.match(bloque('cargabilidad_cargas'), /allow update: if false/);
  });

  test('un registro sin línea no entra, y lo dice la BASE', () => {
    // El `min(1)` del molde vive en el cliente. Las reglas son la última línea
    // y no pueden apoyarse en él (`ADR-004`).
    assert.match(REGLAS, /function cargabilidadCoherente\(\)/);
    assert.match(REGLAS, /request\.resource\.data\.linea\.size\(\) > 0/);
  });

  test('siguen sin poder nacer en otra organización', () => {
    for (const c of COLECCIONES) {
      assert.match(bloque(c), /altaCoherente\(\)|deMiOrg\(/, `${c}: no comprueba la organización`);
    }
  });

  test('la puerta cerrada por defecto sigue al final, DESPUÉS de las nuevas', () => {
    // Si el catch-all quedara antes, las reglas nuevas no se aplicarían nunca.
    assert.ok(REGLAS.lastIndexOf('match /{document=**}') > REGLAS.indexOf('match /cargabilidad_cargas/'),
      'el catch-all quedó por delante y tapa las colecciones nuevas');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2 · LO QUE CUESTA LEER
// ════════════════════════════════════════════════════════════════════════════
describe('el modelo evita la factura, y se puede demostrar', () => {
  test('⚠️ un año de diez líneas: 3.650 lecturas en vez de 87.600', () => {
    const c = costeDeLectura({ lineas: 10, dias: 365 });
    assert.equal(c.documentos, 3650);
    assert.equal(c.siFueraPorLectura, 87600);
    // 50.000 lecturas al día es el orden del plan gratuito: 87.600 de un clic
    // se lo come entero, y 3.650 no.
    assert.ok(c.documentos < 50000 && c.siFueraPorLectura > 50000,
      'el diseño dejó de estar del lado bueno de la cuota');
  });

  test('el TABLERO lee resúmenes, no días completos', () => {
    // Es la confusión que convierte un módulo gratis en uno que factura.
    const i = REPO.indexOf('export async function resumenesEntre');
    const j = REPO.indexOf('export async function diaCompleto');
    assert.ok(i > 0 && j > i, 'faltan las dos consultas separadas');
    assert.match(REPO.slice(i, j), /collection\(db, RESUMENES\)/,
      'la consulta del periodo abre los días completos');
    assert.match(REPO.slice(j), /doc\(db, DIAS,/,
      'el día concreto no se pide por su id: se estaría barriendo la colección');
  });

  test('⚠️ la consulta de periodo lleva TOPE, y dice si recortó', () => {
    // Sin tope, «histórico completo» sobre años de datos se trae todo de un
    // clic. Y si recorta sin decirlo, quien mire creerá que vio el total.
    assert.match(REPO, /tope = 1200/);
    assert.match(REPO, /recortado: filas\.length > tope/);
  });

  test('cada consulta tiene su índice, o Firestore la rechaza en producción', () => {
    const tiene = (grupo, campos) => INDICES.indexes.some((i) => i.collectionGroup === grupo
      && JSON.stringify(i.fields.map((f) => f.fieldPath)) === JSON.stringify(campos));
    assert.ok(tiene('cargabilidad_resumenes', ['orgId', 'linea', 'fecha']), 'falta el índice de una línea');
    assert.ok(tiene('cargabilidad_resumenes', ['orgId', 'fecha']), 'falta el índice de todas las líneas');
    assert.ok(tiene('cargabilidad_cargas', ['orgId', 'cargadoEn']), 'falta el índice de las últimas cargas');
  });

  test('las escrituras van en lotes por debajo del tope de Firestore', () => {
    // Un lote de más de 500 falla ENTERO, y con él la carga.
    const m = REPO.match(/const POR_LOTE = (\d+)/);
    assert.ok(m, 'desapareció el troceado de lotes');
    assert.ok(Number(m[1]) <= 500 && Number(m[1]) > 0, `POR_LOTE = ${m?.[1]}`);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3 · EL RASTRO
// ════════════════════════════════════════════════════════════════════════════
describe('de dónde salió cada número', () => {
  test('⚠️ el rastro de la carga se escribe ANTES que los días', () => {
    // Si falla a mitad, queda constancia de qué archivo se intentó. Al revés
    // habría días guardados sin poder decir de dónde salieron — y ésa es la
    // pregunta que este módulo existe para poder responder.
    const iCarga = REPO.indexOf('setDoc(doc(db, CARGAS, cargaId)');
    const iDias = REPO.indexOf('lote.commit()');
    assert.ok(iCarga > 0 && iDias > iCarga, 'los días se escriben antes que su rastro');
  });

  test('se cuenta qué días YA existían, y se cuenta ANTES de escribir', () => {
    // Después es imposible distinguir lo nuevo de lo reemplazado, y el
    // Ingeniero pidió expresamente poder diferenciarlos.
    const iCuenta = REPO.indexOf('const reemplazados');
    const iEscribe = REPO.indexOf('for (let i = 0; i < paraEscribir.length');
    assert.ok(iCuenta > 0 && iEscribe > iCuenta, 'se cuenta después de escribir: siempre daría 0');
  });

  test('la huella sirve para AVISAR, no para bloquear', () => {
    // Un archivo repetido puede traer correcciones: negarse a leerlo sería peor.
    assert.match(REPO, /export async function huellaDe/);
    assert.match(REPO, /No sirve para bloquear/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4 · LO QUE SE PINTA DEL HISTÓRICO GUARDADO
// ────────────────────────────────────────────────────────────────────────────
// El histórico guarda un resumen por línea y día, no horas sueltas. Pintar eso
// tiene dos trampas que estas pruebas existen para clavar:
//   1. **Promediar promedios.** Un día con 3 horas medidas no pesa igual que uno
//      con 24. Sin ponderar, tres lecturas altas mueven la media de un mes.
//   2. **Fundir líneas por su promedio.** El día que una línea llegó al 104 % no
//      puede desaparecer porque la vecina iba al 30 %.
// ════════════════════════════════════════════════════════════════════════════
import {
  serieDiaria, resumenDelHistorico, porLineaDesdeResumenes,
} from '../nucleo/cargabilidad.js';

/** Un resumen diario sintético. Líneas LN-AAA/LN-BBB: nunca dato real. */
const dia = (fecha, linea, { max, min, prom, horas = 24, sobre = 0 }) => ({
  linea, fecha, horasConMedida: horas,
  ...(max == null ? {} : { maxima_pct: max, minima_pct: min, promedio_pct: prom }),
  porBanda: { normal: horas - sobre, elevada: 0, atencion: 0, sobrecarga: sobre },
});

describe('la serie diaria del histórico', () => {
  test('con una línea, sale un punto por día y ordenado por fecha', () => {
    const s = serieDiaria([
      dia('2026-08-03', 'LN-AAA', { max: 70, min: 30, prom: 50 }),
      dia('2026-08-01', 'LN-AAA', { max: 60, min: 20, prom: 40 }),
    ], 'LN-AAA');
    assert.deepEqual(s.map((p) => p.fecha), ['2026-08-01', '2026-08-03']);
  });

  test('⚠️ sin línea, el punto del día es el PEOR, no el promedio de las líneas', () => {
    // Es la diferencia entre ver el día que hubo sobrecarga y no verlo.
    const s = serieDiaria([
      dia('2026-08-01', 'LN-AAA', { max: 104, min: 80, prom: 95 }),
      dia('2026-08-01', 'LN-BBB', { max: 30, min: 10, prom: 20 }),
    ]);
    assert.equal(s.length, 1, 'las dos líneas del mismo día deben fundirse en un punto');
    assert.equal(s[0].maxima_pct, 104, 'la sobrecarga de una línea se perdió al fundir');
    assert.equal(s[0].linea, 'LN-AAA', 'no dice cuál línea marcó el pico');
    assert.equal(s[0].lineas, 2);
  });

  test('⚠️ el promedio del día pondera por horas medidas', () => {
    // 24 h al 20 % y 2 h al 90 %: la media simple daría 55, la real 25,4.
    const s = serieDiaria([
      dia('2026-08-01', 'LN-AAA', { max: 25, min: 15, prom: 20, horas: 24 }),
      dia('2026-08-01', 'LN-BBB', { max: 90, min: 85, prom: 90, horas: 2 }),
    ]);
    assert.ok(s[0].promedio_pct < 30,
      `promedió sin ponderar: ${s[0].promedio_pct} % (la media simple sería 55)`);
  });

  test('un día guardado SIN medida no se dibuja', () => {
    // Dibujarlo como 0 % diría que la línea estuvo descargada, no que no se midió.
    const s = serieDiaria([
      dia('2026-08-01', 'LN-AAA', { max: 50, min: 40, prom: 45 }),
      dia('2026-08-02', 'LN-AAA', { max: null, horas: 0 }),
    ], 'LN-AAA');
    assert.equal(s.length, 1);
  });

  test('sin nada que pintar no revienta', () => {
    assert.deepEqual(serieDiaria([]), []);
    assert.deepEqual(serieDiaria(null), []);
  });
});

describe('el tablero del histórico', () => {
  const muestra = [
    dia('2026-08-01', 'LN-AAA', { max: 70, min: 30, prom: 50 }),
    dia('2026-08-02', 'LN-AAA', { max: 104, min: 60, prom: 88, sobre: 3 }),
    dia('2026-08-02', 'LN-BBB', { max: 45, min: 12, prom: 28 }),
    dia('2026-08-03', 'LN-AAA', { max: null, horas: 0 }),
  ];

  test('el pico dice CUÁNTO, CUÁNDO y DE QUÉ LÍNEA', () => {
    // Un pico sin fecha ni línea no se puede ir a comprobar, y este módulo
    // existe para que cada cifra se pueda rastrear.
    const t = resumenDelHistorico(muestra);
    assert.deepEqual(t.pico, { pct: 104, fecha: '2026-08-02', linea: 'LN-AAA' });
    assert.equal(t.valle.pct, 12);
  });

  test('cuenta los días con sobrecarga y las horas que duró', () => {
    const t = resumenDelHistorico(muestra);
    assert.equal(t.diasConSobrecarga, 1);
    assert.equal(t.horasDeSobrecarga, 3);
  });

  test('un día sin medida cuenta como día, pero no como día con dato', () => {
    const t = resumenDelHistorico(muestra);
    assert.equal(t.dias, 4);
    assert.equal(t.diasConMedida, 3);
    assert.equal(t.lineas, 2);
  });

  test('la cobertura se mide contra los días QUE HAY, no contra el calendario', () => {
    // 3 días guardados y completos son 100 %, no «10 % de un mes».
    const t = resumenDelHistorico([
      dia('2026-08-01', 'LN-AAA', { max: 50, min: 40, prom: 45, horas: 24 }),
    ]);
    assert.equal(t.cobertura_pct, 100);
  });

  test('sin datos devuelve ceros, no `undefined` ni una excepción', () => {
    const t = resumenDelHistorico([]);
    assert.equal(t.dias, 0);
    assert.equal(t.pico, null);
    assert.equal(t.promedio, null);
    assert.deepEqual(t.porBanda, { normal: 0, elevada: 0, atencion: 0, sobrecarga: 0 });
  });

  test('el ranking por línea encabeza por el PICO del periodo', () => {
    const filas = porLineaDesdeResumenes(muestra);
    assert.equal(filas[0].linea, 'LN-AAA');
    assert.equal(filas[0].maximo, 104);
    assert.equal(filas[0].horasDeSobrecarga, 3);
    assert.equal(filas[1].linea, 'LN-BBB');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5 · EL SELLO, Y LA NATURALEZA QUE SE PERDÍA AL RESUMIR
// ────────────────────────────────────────────────────────────────────────────
// El motor lleva la naturaleza hora a hora con cuidado —«declarada» si el
// porcentaje venía en el archivo, «derivada» si lo calculamos nosotros— y
// `resumirDia` la disolvía en una media única. Un día de 24 horas medidas y uno
// de 6 medidas + 18 derivadas se guardaban IDÉNTICOS, y eso no se reconstruye:
// el documento ya no lo tiene. `99 §ADR-091`.
// ════════════════════════════════════════════════════════════════════════════
import { resumirDia, empaquetarPorDia } from '../nucleo/cargabilidad.js';

const REPO_TXT = leer('web/src/datos/cargabilidadRepo.ts');

describe('la naturaleza del dato sobrevive al resumen diario', () => {
  const hora = (h, pct, naturaleza) => ({
    linea: 'LN-AAA', fecha: '2026-08-01', hora: h, cargabilidad_pct: pct, naturaleza,
  });

  test('⚠️ un día que MEZCLA medido y derivado ya no se guarda indistinguible', () => {
    const { dias } = empaquetarPorDia([
      hora(0, 40, 'declarada'), hora(1, 50, 'declarada'), hora(2, 90, 'derivada'),
    ]);
    const r = resumirDia(dias[0]);
    assert.equal(r.porNaturaleza.declarada, 2);
    assert.equal(r.porNaturaleza.derivada, 1);
    assert.equal(r.horasConMedida, 3);
  });

  test('el reparto por naturaleza suma las horas con medida', () => {
    const { dias } = empaquetarPorDia([hora(0, 40, 'declarada'), hora(1, 90, 'derivada')]);
    const r = resumirDia(dias[0]);
    const suma = r.porNaturaleza.declarada + r.porNaturaleza.derivada + r.porNaturaleza.sinDeclarar;
    assert.equal(suma, r.horasConMedida, 'hay horas que no declaran de dónde salen y nadie lo dice');
  });

  test('un día sin ninguna medida trae el reparto en ceros, no `undefined`', () => {
    const r = resumirDia({ linea: 'LN-AAA', fecha: '2026-08-01', horas: {} });
    assert.deepEqual(r.porNaturaleza, { declarada: 0, derivada: 0, sinDeclarar: 0 });
  });
});

describe('lo guardado dice con qué se produjo', () => {
  test('⚠️ el repositorio estampa la versión del MOTOR en lo que escribe', () => {
    // CLAUDE.md §3.1: todo resultado guardado lleva con qué versión del motor y
    // con qué hipótesis se produjo. Esta colección fue la única que no lo hacía.
    assert.match(REPO_TXT, /nucleoPkg\.version/, 'no se sella con la versión del motor');
    assert.match(REPO_TXT, /const SELLO = /, 'desapareció el sello');
  });

  test('el sello va en las TRES colecciones, no solo en una', () => {
    const i = REPO_TXT.indexOf('export async function guardarCarga');
    const cuerpo = REPO_TXT.slice(i, REPO_TXT.indexOf('export async function resumenesEntre'));
    assert.match(cuerpo, /\.\.\.SELLO/, 'la carga no lleva sello');
    assert.equal((cuerpo.match(/versionMotor: SELLO\.versionMotor/g) ?? []).length, 2,
      'el día o el resumen se están escribiendo sin la versión del motor');
  });

  test('⚠️ los días viejos NO se reescriben: se cuentan y se dicen', () => {
    // Ponerle un sello a un documento que nadie selló es inventarlo.
    const t = resumenDelHistorico([
      { linea: 'LN-AAA', fecha: '2026-08-01', horasConMedida: 24, maxima_pct: 50, minima_pct: 40,
        promedio_pct: 45, porBanda: { normal: 24, elevada: 0, atencion: 0, sobrecarga: 0 } },
      { linea: 'LN-AAA', fecha: '2026-08-02', horasConMedida: 24, maxima_pct: 60, minima_pct: 40,
        promedio_pct: 50, porBanda: { normal: 24, elevada: 0, atencion: 0, sobrecarga: 0 },
        porNaturaleza: { declarada: 24, derivada: 0, sinDeclarar: 0 }, versionMotor: '0.9.0' },
    ]);
    assert.equal(t.diasSinSello, 1, 'no distingue lo guardado antes del sello');
    assert.equal(t.porNaturaleza.declarada, 24);
  });
});
