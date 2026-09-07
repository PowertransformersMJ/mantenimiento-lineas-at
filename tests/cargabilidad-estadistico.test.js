// ============================================================================
// tests/cargabilidad-estadistico.test.js — máximo, promedio e instantáneo
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE (`99 §ADR-112`). El sistema de supervisión exporta la MISMA
// magnitud tres veces —un archivo por estadístico— y los valores difieren de
// verdad. Hasta hoy el módulo tenía UN hueco por magnitud, así que los tres
// caían en el mismo sitio y `combinar()` devolvía uno solo: con criterio «la más
// alta», el promedio y el instantáneo desaparecían sin dejar rastro.
//
// ⚠️ LO QUE ESTA SUITE DEFIENDE, y es lo caro: que **nadie adivine el
// estadístico**. Escribir un promedio con la identidad de un máximo lo PISA —
// para las reglas es una corrección legítima del mismo día—, `delete` está
// prohibido a propósito y el archivo original no se guarda. Ese número no se
// recupera de ninguna parte. Por eso «no se sabe» tiene que parar el guardado,
// no caer a un valor por defecto.
//
// ⚠️ Nombres de archivo INVENTADOS: los reales traen subestaciones de cliente y
// este repositorio es público (`33 · L-07/L-23`).
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ESTADISTICOS, IDS_ESTADISTICO, empaquetarPorDia, resumirDia,
} from '../nucleo/cargabilidad.js';
import { estadisticoDeNombre, registrosDesdeAncho, unirAnchas } from '../nucleo/cargabilidadAncho.js';
import { ESTADISTICOS as ENUM_CONTRATO, idDelDia, idDelResumen } from '../contratos/src/cargabilidad.ts';

describe('QUÉ ESTADÍSTICO TRAE UN ARCHIVO, LEÍDO DE SU NOMBRE', () => {
  test('reconoce los tres, en mayúsculas y minúsculas, con guion o con raya baja', () => {
    const casos = [
      ['MAG_max-20260101.csv', 'maximo'], ['mag_MAX.csv', 'maximo'],
      ['MAG_Average-20260101.csv', 'promedio'], ['mag_average_20260101.xls', 'promedio'],
      ['MAG_Current-20260101.csv', 'instantaneo'], ['mag_inst.csv', 'instantaneo'],
    ];
    for (const [nombre, id] of casos) {
      assert.equal(estadisticoDeNombre(nombre).id, id, nombre);
    }
  });

  test('⚠️ sin marca devuelve null — «no se sabe» NO es «será el máximo»', () => {
    const r = estadisticoDeNombre('exportacion-20260101.csv');
    assert.equal(r.id, null);
    assert.match(r.porQue, /no dice/);
  });

  test('⚠️ con DOS marcas tampoco elige: un nombre ambiguo se pregunta', () => {
    const r = estadisticoDeNombre('max_average-20260101.csv');
    assert.equal(r.id, null);
    assert.match(r.porQue, /a la vez/);
  });

  test('la marca va ANCLADA: «Maximiliano» no es un máximo', () => {
    assert.equal(estadisticoDeNombre('Maximiliano.csv').id, null);
    assert.equal(estadisticoDeNombre('averaged.csv').id, null);
  });

  test('el catálogo y el molde dicen los MISMOS tres, o esta prueba se cae', () => {
    // Dos listas escritas a mano se separan solas. El núcleo no puede importar
    // el molde —no depende de nadie—, así que la paridad se comprueba aquí.
    assert.deepEqual([...IDS_ESTADISTICO], [...ENUM_CONTRATO]);
    assert.deepEqual(ESTADISTICOS.map((e) => e.id), [...ENUM_CONTRATO]);
  });
});

// ── Una exportación ancha sintética: el tiempo en columnas ──────────────────
const anchа = (valores) => [
  ['', '1/01/26 0:00', '1/01/26 1:00', '1/01/26 2:00'],
  ['/SubA /66kV /BAHIA/I R /MvMoment', ...valores],
];

describe('TRES ARCHIVOS DEL MISMO DÍA NO SE FUNDEN EN UN NÚMERO', () => {
  const entradas = [
    { nombre: 'MAG_max-20260101.csv', matriz: anchа([244, 240, 238]) },
    { nombre: 'MAG_Average-20260101.csv', matriz: anchа([233, 230, 228]) },
    { nombre: 'MAG_Current-20260101.csv', matriz: anchа([236, 231, 229]) },
  ];

  test('unirAnchas conserva de qué archivo salió cada señal', () => {
    const u = unirAnchas(entradas);
    assert.deepEqual(u.estadisticos, ['maximo', 'promedio', 'instantaneo']);
    assert.deepEqual(u.sinDeclarar, []);
    // La anotación va FUERA de la matriz: meterla como columna correría el eje.
    assert.equal(u.matriz[0].length, 4, 'la fila del eje no gana columnas');
    assert.equal(u.matriz[1].length, 4, 'la fila de la señal tampoco');
    assert.deepEqual(Object.values(u.estadisticoPorFila), ['maximo', 'promedio', 'instantaneo']);
  });

  test('⚠️ las tres etiquetas son IDÉNTICAS: sin la anotación no habría cómo separarlas', () => {
    const u = unirAnchas(entradas);
    const etiquetas = new Set(u.senales.map((s) => s.etiqueta));
    assert.equal(etiquetas.size, 1, 'el archivo no deja ninguna marca en la etiqueta');
    assert.equal(u.senales.length, 3);
  });

  test('⚠️ SIN ELEGIR ESTADÍSTICO NO SE LEE NADA: se para y se dice', () => {
    const u = unirAnchas(entradas);
    const r = registrosDesdeAncho(u.matriz, {
      linea: 'LN-000', estadisticoPorFila: u.estadisticoPorFila,
    });
    assert.equal(r.registros.length, 0, 'no se produce ni un registro mezclado');
    assert.match(r.porQue, /no se pueden mezclar/);
    assert.equal(r.estadisticos.length, 3);
  });

  test('eligiendo el máximo salen los 244, no una mezcla', () => {
    const u = unirAnchas(entradas);
    const r = registrosDesdeAncho(u.matriz, {
      linea: 'LN-000', estadistico: 'maximo', estadisticoPorFila: u.estadisticoPorFila,
    });
    assert.deepEqual(r.registros.map((x) => x.corriente_A), [244, 240, 238]);
    assert.ok(r.registros.every((x) => x.estadistico === 'maximo'));
  });

  test('y eligiendo el promedio salen los 233 — la diferencia que se perdía', () => {
    const u = unirAnchas(entradas);
    const r = registrosDesdeAncho(u.matriz, {
      linea: 'LN-000', estadistico: 'promedio', estadisticoPorFila: u.estadisticoPorFila,
    });
    assert.deepEqual(r.registros.map((x) => x.corriente_A), [233, 230, 228]);
  });
});

describe('UN DÍA GUARDADO = UN ESTADÍSTICO', () => {
  const reg = (estadistico, v) => ({
    linea: 'LN-000', fecha: '2026-01-01', hora: 0, estadistico, corriente_A: v,
  });

  test('el máximo y el promedio del mismo día son DOS documentos, no uno que pisa al otro', () => {
    const { dias } = empaquetarPorDia([reg('maximo', 244), reg('promedio', 233)]);
    assert.equal(dias.length, 2);
    assert.deepEqual(dias.map((d) => d.estadistico).sort(), ['maximo', 'promedio']);
    assert.notEqual(
      idDelDia('org', 'LN-000', null, '2026-01-01', 'maximo'),
      idDelDia('org', 'LN-000', null, '2026-01-01', 'promedio'),
    );
  });

  test('⚠️ el MÁXIMO conserva la identidad corta, y no es un olvido', () => {
    // Cuando esto se escribió ya había días guardados como máximos con el id
    // corto, y las reglas prohíben borrar: cambiárselo los duplicaría para
    // siempre. Si alguien «uniformara» los sufijos, esta prueba se pone roja.
    assert.equal(idDelDia('org', 'LN-000', null, '2026-01-01', 'maximo'), 'org__ln-000__-__2026-01-01');
    assert.equal(idDelDia('org', 'LN-000', null, '2026-01-01', 'promedio'), 'org__ln-000__-__2026-01-01__promedio');
    assert.equal(idDelResumen('org', 'LN-000', '2026-01-01', 'maximo'), 'org__ln-000__2026-01-01');
    assert.equal(idDelResumen('org', 'LN-000', '2026-01-01', 'instantaneo'), 'org__ln-000__2026-01-01__instantaneo');
  });

  test('el sufijo sale de la lista CERRADA, en minúscula, nunca del texto del archivo', () => {
    // `_Average` crudo pasaría el molde y crearía un gemelo de `average`.
    for (const id of IDS_ESTADISTICO) {
      assert.equal(id, id.toLowerCase());
      assert.ok(!/\s/.test(id));
    }
  });

  test('el resumen dice de qué estadístico salió', () => {
    const { dias } = empaquetarPorDia([reg('promedio', 233)]);
    assert.equal(resumirDia(dias[0]).estadistico, 'promedio');
  });

  test('⚠️ un registro sin estadístico deja el día en null — y NO en «maximo»', () => {
    const { dias } = empaquetarPorDia([{ linea: 'LN-000', fecha: '2026-01-01', hora: 0, corriente_A: 10 }]);
    assert.equal(dias[0].estadistico, null, 'suponerlo aquí sería pisar un máximo real');
  });
});
