// ============================================================================
// tests/coherencia.test.js — criterios de coherencia declarado vs. medido
// ----------------------------------------------------------------------------
// Los valores esperados NO salen de ejecutar el propio módulo (eso sería
// circular). Salen de:
//   (a) las FRONTERAS del criterio declarado, atacadas por los dos lados
//       (2,9° / 3,1° / 15,1° / 30,1°) — un criterio solo está probado en su
//       borde: en el centro de la banda acierta hasta un código roto;
//   (b) aritmética verificable a mano (20 × 290 mm ÷ 145 kV = 40 mm/kV exactos);
//   (c) una identidad cruzada contra una tabla EXTERNA al módulo: los valores
//       exigidos, multiplicados por √3, deben devolver la RUSCD fase-tierra de
//       la IEC; y divididos como están, deben reproducir la tabla clásica
//       fase-fase (16 / 20 / 25 / 31 mm/kV). Dos tablas publicadas en épocas
//       distintas coincidiendo a ±0,06 mm/kV es lo que demuestra que la base de
//       tensión —la trampa del √3— está bien puesta.
//
// ⚠️ Datos SINTÉTICOS a propósito. Nombres E-01…E-06 inventados, sin relación
// con ninguna estructura real: este repositorio es público (CLAUDE.md §3.1).
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  coherenciaFuncionDeflexion,
  fugaEspecifica,
  avisoPuestaTierra,
} from '../nucleo/coherencia.js';

const AQUI = dirname(fileURLToPath(import.meta.url));

const cerca = (real, esperado, tol, msg) =>
  assert.ok(Math.abs(real - esperado) <= tol, `${msg}: ${real} vs ${esperado}`);

/** Un apoyo interior sintético: lo mínimo que el criterio necesita. */
const ap = (nombre, funcionEstructural, deflexion_grados) =>
  ({ nombre, funcionEstructural, deflexion_grados });

/**
 * Envuelve un apoyo entre dos extremos con deflexión nula declarada, para que
 * el que se está probando quede en el INTERIOR de la línea. Los extremos son
 * Terminal con deflexión null, que es lo que ocurre en una línea real y no debe
 * generar ningún aviso.
 */
const enLinea = (...interiores) => [
  { nombre: 'E-01', funcionEstructural: 'Terminal', deflexion_grados: null },
  ...interiores,
  { nombre: 'E-99', funcionEstructural: 'Terminal', deflexion_grados: null },
];

const soloDe = (avisos, nombre) => avisos.filter((v) => v.apoyo === nombre);

// ════════════════════════════════════════════════════════════════════════════
// 1 · FUNCIÓN DECLARADA vs DEFLEXIÓN MEDIDA
// ════════════════════════════════════════════════════════════════════════════

describe('coherencia función ↔ deflexión — las fronteras del criterio', () => {

  test('2,9° con Suspensión: por debajo de 3° basta suspensión, sin aviso', () => {
    const avisos = coherenciaFuncionDeflexion(enLinea(ap('E-02', 'Suspensión', 2.9)));
    assert.deepEqual(avisos, [], `no debía avisar: ${JSON.stringify(avisos)}`);
  });

  test('3,1° con Suspensión: cruza la primera frontera y avisa', () => {
    const avisos = soloDe(coherenciaFuncionDeflexion(enLinea(ap('E-02', 'Suspensión', 3.1))), 'E-02');
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].clase, 'funcion_insuficiente');
    // Un solo escalón de déficit fuera de la banda de retención: se advierte.
    assert.equal(avisos[0].severidad, 'advertencia');
  });

  test('3,1° con Suspensión angular: es justo lo que el criterio pide, sin aviso', () => {
    assert.deepEqual(coherenciaFuncionDeflexion(enLinea(ap('E-02', 'Suspensión angular', 3.1))), []);
  });

  test('15,1° con Suspensión angular: cruza la segunda frontera y avisa', () => {
    const avisos = soloDe(coherenciaFuncionDeflexion(enLinea(ap('E-03', 'Suspensión angular', 15.1))), 'E-03');
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].clase, 'funcion_insuficiente');
    assert.equal(avisos[0].severidad, 'advertencia');
  });

  test('15,1° con Ángulo y con Retención: el criterio admite LAS DOS, sin aviso', () => {
    // «por encima de 15° debería ser ángulo O RETENCIÓN»: entre 15° y 30° la
    // retención es una de las dos respuestas correctas, no un sobrecosto.
    assert.deepEqual(coherenciaFuncionDeflexion(enLinea(ap('E-03', 'Ángulo', 15.1))), []);
    assert.deepEqual(coherenciaFuncionDeflexion(enLinea(ap('E-03', 'Retención / anclaje', 15.1))), []);
  });

  test('30,1° con Ángulo: por encima de 30° la retención es OBLIGADA → crítica', () => {
    const avisos = soloDe(coherenciaFuncionDeflexion(enLinea(ap('E-04', 'Ángulo', 30.1))), 'E-04');
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].clase, 'funcion_insuficiente');
    // Aunque el déficit sea de un solo escalón: en esta banda no hay margen.
    assert.equal(avisos[0].severidad, 'critica');
  });

  test('30,1° con Retención: cumple, sin aviso', () => {
    assert.deepEqual(coherenciaFuncionDeflexion(enLinea(ap('E-04', 'Retención / anclaje', 30.1))), []);
  });

  test('29,9° con Ángulo cumple, pero 29,9° con Suspensión ya es crítico (2 escalones)', () => {
    assert.deepEqual(coherenciaFuncionDeflexion(enLinea(ap('E-04', 'Ángulo', 29.9))), []);
    const avisos = soloDe(coherenciaFuncionDeflexion(enLinea(ap('E-04', 'Suspensión', 29.9))), 'E-04');
    assert.equal(avisos[0].severidad, 'critica');
  });

  test('exactamente 3,0° y 15,0° y 30,0°: la frontera es inclusiva hacia arriba', () => {
    // «<3° suspensión» leído literalmente: en 3,0° el criterio ya pide angular.
    assert.equal(soloDe(coherenciaFuncionDeflexion(enLinea(ap('E-02', 'Suspensión', 3.0))), 'E-02').length, 1);
    assert.equal(soloDe(coherenciaFuncionDeflexion(enLinea(ap('E-02', 'Suspensión angular', 15.0))), 'E-02').length, 1);
    assert.equal(soloDe(coherenciaFuncionDeflexion(enLinea(ap('E-02', 'Ángulo', 30.0))), 'E-02').length, 1);
  });
});

describe('coherencia función ↔ deflexión — el otro sentido y los huecos', () => {

  test('línea coherente completa: CERO avisos', () => {
    const linea = [
      { nombre: 'E-01', funcionEstructural: 'Terminal', deflexion_grados: null },
      ap('E-02', 'Suspensión', 0.4),
      ap('E-03', 'Suspensión angular', 8.2),
      ap('E-04', 'Ángulo', 21.7),
      ap('E-05', 'Retención / anclaje', 47.3),
      ap('E-06', 'Suspensión', 1.1),
      { nombre: 'E-07', funcionEstructural: 'Terminal', deflexion_grados: null },
    ];
    assert.deepEqual(coherenciaFuncionDeflexion(linea), [],
      'una línea coherente no debe producir ni un aviso informativo');
  });

  test('retención donde bastaba suspensión: se reporta como sobrecosto, no como riesgo', () => {
    const avisos = soloDe(coherenciaFuncionDeflexion(enLinea(ap('E-05', 'Retención / anclaje', 1.0))), 'E-05');
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].clase, 'funcion_sobredimensionada');
    assert.equal(avisos[0].severidad, 'info');
  });

  test('el sobrecosto que se reporta es el ANCLAJE de más, no el escalón de más', () => {
    // Un Ángulo a 8,2° ancla —y corta un tramo de tensión— donde el criterio
    // solo pedía suspensión angular: eso sí es dinero y sí se reporta.
    const ancla = soloDe(coherenciaFuncionDeflexion(enLinea(ap('E-05', 'Ángulo', 8.2))), 'E-05');
    assert.equal(ancla.length, 1);
    assert.equal(ancla[0].clase, 'funcion_sobredimensionada');

    // Una suspensión angular donde bastaba una suspensión NO se reporta: ni
    // cuesta ni corta tramo, y el criterio mismo dice «por debajo de UNOS 3°».
    // Avisar aquí llenaría el listado de ruido que nadie puede accionar.
    assert.deepEqual(coherenciaFuncionDeflexion(enLinea(ap('E-06', 'Suspensión angular', 2.9))), []);
  });

  test('un Terminal a 0° NO es sobrecosto: su razón es topológica, no geométrica', () => {
    // Si esto avisara, toda línea real tendría dos falsos positivos garantizados.
    assert.deepEqual(coherenciaFuncionDeflexion([
      { nombre: 'E-01', funcionEstructural: 'Terminal', deflexion_grados: null },
      ap('E-02', 'Terminal', 0.0),
      ap('E-03', 'Derivación', 0.5),
      { nombre: 'E-04', funcionEstructural: 'Terminal', deflexion_grados: null },
    ]), []);
  });

  test('sin deflexión: se declara «no evaluable» en el interior y se calla en los extremos', () => {
    const avisos = coherenciaFuncionDeflexion([
      { nombre: 'E-01', funcionEstructural: 'Terminal', deflexion_grados: null },
      ap('E-02', 'Suspensión', null),
      { nombre: 'E-03', funcionEstructural: 'Terminal', deflexion_grados: null },
    ]);
    assert.equal(avisos.length, 1, 'solo el interior');
    assert.equal(avisos[0].apoyo, 'E-02');
    assert.equal(avisos[0].clase, 'deflexion_no_evaluable');
  });

  test('sin función declarada: se declara el hueco, no se deduce la función', () => {
    const avisos = soloDe(coherenciaFuncionDeflexion(enLinea(ap('E-02', undefined, 64.7))), 'E-02');
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].clase, 'funcion_no_declarada');
    // Lo que NO debe pasar: rellenar el campo con «Retención» porque mide 64,7°.
    assert.notEqual(avisos[0].clase, 'funcion_insuficiente');
  });

  test('una deflexión imposible (>180°) no se juzga: se denuncia el dato', () => {
    const avisos = soloDe(coherenciaFuncionDeflexion(enLinea(ap('E-02', 'Suspensión', 200))), 'E-02');
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].clase, 'deflexion_no_evaluable');
  });

  test('los empalmes no se contrastan: no sostienen conductor ni tienen función', () => {
    const avisos = coherenciaFuncionDeflexion([
      { nombre: 'E-01', funcionEstructural: 'Terminal', deflexion_grados: null },
      { nombre: 'EMP-1', tipoPunto: 'Empalme' },
      { nombre: 'E-02', funcionEstructural: 'Suspensión', deflexion_grados: 1.0 },
      { nombre: 'E-03', funcionEstructural: 'Terminal', deflexion_grados: null },
    ]);
    assert.deepEqual(avisos, [], `un empalme no genera avisos: ${JSON.stringify(avisos)}`);
  });

  test('lo crítico va primero: el orden de salida es el de la severidad', () => {
    const avisos = coherenciaFuncionDeflexion(enLinea(
      ap('E-02', 'Retención / anclaje', 0.5),   // info      (sobrecosto)
      ap('E-03', 'Suspensión', 4.0),            // advertencia
      ap('E-04', 'Suspensión', 60.0),           // crítica
    ));
    assert.deepEqual(avisos.map((v) => v.severidad), ['critica', 'advertencia', 'info']);
    assert.deepEqual(avisos.map((v) => v.apoyo), ['E-04', 'E-03', 'E-02']);
  });

  test('todo aviso viaja con su criterio escrito y con apoyo identificado', () => {
    const avisos = coherenciaFuncionDeflexion(enLinea(ap('E-02', 'Suspensión', 60)));
    for (const v of avisos) {
      assert.ok(v.apoyo && typeof v.apoyo === 'string', 'apoyo identificado');
      assert.ok(/CRITERIO DE DISEÑO/.test(v.criterio), 'declarado como criterio, no como norma');
      assert.ok(v.mensaje.length > 20, 'el mensaje explica algo');
    }
  });

  test('entradas vacías o basura no revientan: devuelven lista vacía', () => {
    assert.deepEqual(coherenciaFuncionDeflexion([]), []);
    assert.deepEqual(coherenciaFuncionDeflexion(null), []);
    assert.deepEqual(coherenciaFuncionDeflexion(undefined), []);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2 · FUGA ESPECÍFICA
// ════════════════════════════════════════════════════════════════════════════

describe('fuga específica — aritmética verificable a mano', () => {

  test('20 unidades × 290 mm ÷ 145 kV = 40 mm/kV exactos', () => {
    const r = fugaEspecifica({
      unidades: 20,
      fugaPorUnidad_mm: 290,
      tensionMaxima_kV: 145,
      nivelContaminacion: 'Medio',
    });
    cerca(r.fugaTotal_mm, 5800, 1e-9, 'fuga total');
    cerca(r.especifica_mm_kV, 40, 1e-9, 'fuga específica');
    assert.equal(r.cumple, true, '40 mm/kV supera lo exigido en nivel Medio');
  });

  test('una cadena corta reprueba: 10 × 145 mm ÷ 145 kV = 10 mm/kV', () => {
    const r = fugaEspecifica({
      unidades: 10,
      fugaPorUnidad_mm: 145,
      tensionMaxima_kV: 145,
      nivelContaminacion: 'Muy ligero',
    });
    cerca(r.especifica_mm_kV, 10, 1e-9, 'fuga específica');
    // Ni siquiera en el nivel de contaminación MÁS BENIGNO de la tabla.
    assert.equal(r.cumple, false);
  });

  test('la fuga total es lineal en las unidades: duplicar la cadena duplica la fuga', () => {
    const base = { fugaPorUnidad_mm: 292, tensionMaxima_kV: 72.5, nivelContaminacion: 'Fuerte' };
    const a = fugaEspecifica({ ...base, unidades: 6 });
    const b = fugaEspecifica({ ...base, unidades: 12 });
    cerca(b.fugaTotal_mm, 2 * a.fugaTotal_mm, 1e-9, 'fuga total');
    cerca(b.especifica_mm_kV, 2 * a.especifica_mm_kV, 1e-9, 'fuga específica');
    // El exigido NO depende de la cadena, solo del sitio.
    cerca(b.exigido_mm_kV, a.exigido_mm_kV, 1e-12, 'exigido');
  });

  test('la fuga específica es inversa en la tensión: el doble de Um, la mitad de mm/kV', () => {
    const base = { unidades: 12, fugaPorUnidad_mm: 300, nivelContaminacion: 'Ligero' };
    const a = fugaEspecifica({ ...base, tensionMaxima_kV: 72.5 });
    const b = fugaEspecifica({ ...base, tensionMaxima_kV: 145 });
    cerca(b.especifica_mm_kV, a.especifica_mm_kV / 2, 1e-9, 'fuga específica');
  });
});

describe('fuga específica — la tabla exigida, contrastada contra fuentes externas', () => {

  // Se lee la tabla A TRAVÉS de la función pública (no está exportada aparte).
  // Con Um = 1 kV la fuga específica es directamente la fuga total, así que el
  // campo `exigido_mm_kV` queda a la vista sin tocar nada interno.
  const exigido = (nivel) => fugaEspecifica({
    unidades: 1, fugaPorUnidad_mm: 1, tensionMaxima_kV: 1, nivelContaminacion: nivel,
  }).exigido_mm_kV;

  const NIVELES = ['Muy ligero', 'Ligero', 'Medio', 'Fuerte', 'Muy fuerte'];

  test('× √3 devuelve la RUSCD fase-tierra declarada en el módulo (IEC TS 60815)', () => {
    const RUSCD = { 'Muy ligero': 22.0, 'Ligero': 27.8, 'Medio': 34.7, 'Fuerte': 43.3, 'Muy fuerte': 53.7 };
    for (const nivel of NIVELES) {
      cerca(exigido(nivel) * Math.sqrt(3), RUSCD[nivel], 1e-9, `RUSCD de ${nivel}`);
    }
  });

  test('la base de tensión es FASE-FASE: reproduce la tabla clásica 16/20/25/31 mm/kV', () => {
    // Contraste independiente y el que caza la trampa del √3: los valores
    // convertidos coinciden con la tabla histórica fase-fase de la IEC dentro de
    // ±0,06 mm/kV. Si alguien "corrigiera" el ÷√3, esto se dispararía un 73 %.
    cerca(exigido('Ligero'), 16, 0.06, 'ligero fase-fase');
    cerca(exigido('Medio'), 20, 0.06, 'medio fase-fase');
    cerca(exigido('Fuerte'), 25, 0.06, 'fuerte fase-fase');
    cerca(exigido('Muy fuerte'), 31, 0.06, 'muy fuerte fase-fase');
  });

  test('a más contaminación, más fuga exigida (monotonía estricta)', () => {
    for (let i = 1; i < NIVELES.length; i++) {
      assert.ok(exigido(NIVELES[i]) > exigido(NIVELES[i - 1]),
        `${NIVELES[i]} debe exigir más que ${NIVELES[i - 1]}`);
    }
  });

  test('la misma cadena cumple en zona limpia y reprueba en zona salina', () => {
    const cadena = { unidades: 9, fugaPorUnidad_mm: 292, tensionMaxima_kV: 145 };  // 18,12 mm/kV
    assert.equal(fugaEspecifica({ ...cadena, nivelContaminacion: 'Muy ligero' }).cumple, true);
    assert.equal(fugaEspecifica({ ...cadena, nivelContaminacion: 'Muy fuerte' }).cumple, false);
  });
});

describe('fuga específica — lo que NO se puede calcular devuelve null', () => {

  const COMPLETA = {
    unidades: 18,
    fugaPorUnidad_mm: 292,
    tensionMaxima_kV: 145,
    nivelContaminacion: 'Fuerte',
  };

  test('la entrada completa sí da resultado (control de la prueba)', () => {
    assert.notEqual(fugaEspecifica(COMPLETA), null);
  });

  for (const campo of Object.keys(COMPLETA)) {
    test(`null si falta «${campo}»`, () => {
      const { [campo]: _fuera, ...incompleta } = COMPLETA;
      assert.equal(fugaEspecifica(incompleta), null, `sin ${campo} no hay resultado`);
      assert.equal(fugaEspecifica({ ...COMPLETA, [campo]: null }), null, `${campo} en null tampoco`);
      assert.equal(fugaEspecifica({ ...COMPLETA, [campo]: undefined }), null, `${campo} en undefined tampoco`);
    });
  }

  test('null con valores imposibles: cero, negativo o no numérico', () => {
    assert.equal(fugaEspecifica({ ...COMPLETA, unidades: 0 }), null);
    assert.equal(fugaEspecifica({ ...COMPLETA, fugaPorUnidad_mm: -292 }), null);
    assert.equal(fugaEspecifica({ ...COMPLETA, tensionMaxima_kV: NaN }), null);
    assert.equal(fugaEspecifica({ ...COMPLETA, unidades: '18' }), null, 'una cadena de texto no es un número');
  });

  test('null con un nivel fuera de tabla: no se aproxima al más parecido', () => {
    assert.equal(fugaEspecifica({ ...COMPLETA, nivelContaminacion: 'Medio-alto' }), null);
    assert.equal(fugaEspecifica({ ...COMPLETA, nivelContaminacion: 'medio' }), null, 'sin normalizar mayúsculas: mejor null que adivinar');
  });

  test('null sin entrada alguna: no revienta', () => {
    assert.equal(fugaEspecifica(undefined), null);
    assert.equal(fugaEspecifica(null), null);
    assert.equal(fugaEspecifica({}), null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PRUEBAS DE ORO — el núcleo y el contrato no pueden divergir
// ----------------------------------------------------------------------------
// `nucleo/` no importa el contrato (dejaría de ser puro y portable), así que la
// correspondencia no se confía a la memoria: se comprueba leyendo el contrato
// como TEXTO, igual que hace nucleo.test.js con FUNCIONES_ANCLA. Si alguien
// añade un valor al catálogo en un sitio y no en el otro, esto se pone rojo.
//
// Los catálogos se leen a través del comportamiento público del módulo, no de
// sus constantes: la superficie exportada son tres funciones y nada más.
// ════════════════════════════════════════════════════════════════════════════

describe('pruebas de oro — catálogos del contrato entendidos por el núcleo', () => {

  const enumDelContrato = (nombre) => {
    const fuente = readFileSync(join(AQUI, '..', 'contratos', 'src', 'activos.ts'), 'utf-8');
    const bloque = new RegExp(`${nombre}\\s*=\\s*z\\.enum\\(\\[([\\s\\S]*?)\\]\\)`).exec(fuente);
    assert.ok(bloque, `no se encontró ${nombre} en contratos/src/activos.ts`);
    return [...bloque[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  };

  test('toda FuncionEstructural del contrato tiene capacidad angular asignada', () => {
    for (const funcion of enumDelContrato('FuncionEstructural')) {
      const avisos = coherenciaFuncionDeflexion(enLinea(ap('E-02', funcion, 20)));
      const desconocida = avisos.filter((v) => v.clase === 'funcion_no_declarada');
      assert.deepEqual(desconocida, [],
        `«${funcion}» está en el contrato pero el núcleo no sabe qué ángulo aguanta`);
    }
  });

  test('todo NivelContaminacion del contrato tiene fuga exigida en la tabla', () => {
    for (const nivel of enumDelContrato('NivelContaminacion')) {
      const r = fugaEspecifica({
        unidades: 12, fugaPorUnidad_mm: 292, tensionMaxima_kV: 145, nivelContaminacion: nivel,
      });
      assert.notEqual(r, null, `«${nivel}» está en el contrato pero no en la tabla del núcleo`);
      assert.ok(r.exigido_mm_kV > 0, `«${nivel}» debe exigir una fuga positiva`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3 · PUESTA A TIERRA
// ════════════════════════════════════════════════════════════════════════════

describe('puesta a tierra — medido, sin medir y el umbral', () => {

  test('sin medición: aviso «sin medir», no un cumplimiento silencioso', () => {
    const avisos = avisoPuestaTierra([
      { nombre: 'E-02' },
      { nombre: 'E-03', puestaTierra: {} },
      { nombre: 'E-04', puestaTierra: { resistencia_ohm: null } },
    ]);
    assert.equal(avisos.length, 3);
    for (const v of avisos) {
      assert.equal(v.clase, 'sin_medir');
      assert.equal(v.severidad, 'advertencia');
    }
  });

  test('por encima del umbral: aviso «excede», crítico', () => {
    const avisos = avisoPuestaTierra([{ nombre: 'E-02', puestaTierra: { resistencia_ohm: 12 } }]);
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].clase, 'excede');
    assert.equal(avisos[0].severidad, 'critica');
  });

  test('por debajo del umbral: sin aviso', () => {
    assert.deepEqual(avisoPuestaTierra([{ nombre: 'E-02', puestaTierra: { resistencia_ohm: 4.7 } }]), []);
  });

  test('justo en el umbral: cumple («≤ umbral»), sin aviso', () => {
    assert.deepEqual(avisoPuestaTierra([{ nombre: 'E-02', puestaTierra: { resistencia_ohm: 10 } }]), []);
  });

  test('el umbral es un parámetro, no una constante escondida', () => {
    const apoyos = [{ nombre: 'E-02', puestaTierra: { resistencia_ohm: 18 } }];
    assert.equal(avisoPuestaTierra(apoyos, 25).length, 0, 'con criterio de 25 Ω, 18 Ω pasa');
    assert.equal(avisoPuestaTierra(apoyos, 10).length, 1, 'con criterio de 10 Ω, 18 Ω no pasa');
    assert.equal(avisoPuestaTierra(apoyos).length, 1, 'el defecto son 10 Ω');
    // Y el criterio escrito en el aviso dice el umbral REAL que se aplicó.
    assert.match(avisoPuestaTierra(apoyos, 10)[0].criterio, /10 Ω/);
  });

  test('lee la forma anidada del contrato y la plana de las vistas', () => {
    const anidada = avisoPuestaTierra([{ nombre: 'E-02', puestaTierra: { resistencia_ohm: 30 } }]);
    const plana = avisoPuestaTierra([{ nombre: 'E-02', resistencia_ohm: 30 }]);
    assert.equal(anidada.length, 1);
    assert.equal(plana.length, 1, 'leer solo una forma dejaría media línea sin revisar');
    assert.equal(anidada[0].clase, plana[0].clase);
  });

  test('los empalmes no se reportan: no tienen puesta a tierra que medir', () => {
    assert.deepEqual(avisoPuestaTierra([{ nombre: 'EMP-1', tipoPunto: 'Empalme' }]), []);
  });

  test('lo crítico va primero también aquí', () => {
    const avisos = avisoPuestaTierra([
      { nombre: 'E-02' },                                        // sin medir
      { nombre: 'E-03', puestaTierra: { resistencia_ohm: 45 } }, // excede
      { nombre: 'E-04', puestaTierra: { resistencia_ohm: 3 } },  // cumple
    ]);
    assert.deepEqual(avisos.map((v) => v.apoyo), ['E-03', 'E-02']);
    assert.deepEqual(avisos.map((v) => v.severidad), ['critica', 'advertencia']);
  });

  test('un apoyo sin nombre queda identificado igual: un aviso anónimo no sirve', () => {
    const avisos = avisoPuestaTierra([{ puestaTierra: { resistencia_ohm: 99 } }]);
    assert.equal(avisos.length, 1);
    assert.ok(avisos[0].apoyo.length > 0);
  });

  test('entradas vacías o basura no revientan', () => {
    assert.deepEqual(avisoPuestaTierra([]), []);
    assert.deepEqual(avisoPuestaTierra(null), []);
    assert.deepEqual(avisoPuestaTierra(undefined, 5), []);
  });
});
