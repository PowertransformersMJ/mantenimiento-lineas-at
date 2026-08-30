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
