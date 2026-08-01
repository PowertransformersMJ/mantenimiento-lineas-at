// ============================================================================
// tests/criterios-apoyo.test.js — los criterios que se evalúan en cada ficha
// ----------------------------------------------------------------------------
// QUÉ SE PRUEBA: `web/src/vistas/criteriosApoyo.ts`, la función que convierte un
// apoyo y su contexto geométrico en las cinco filas con semáforo de su ficha.
//
// POR QUÉ IMPORTA MÁS QUE UNA PRUEBA DE FORMATO: el peor fallo posible de este
// módulo no es reventar, es devolver un VERDE INVENTADO — decir «cumple» donde
// en realidad no hay dato. Por eso la mitad de las pruebas comprueban que lo
// que no se puede evaluar sale como `no_evaluable` CON SU MOTIVO, y nunca como
// conformidad.
//
// ⚠️ Estas pruebas las escribí yo (el integrador), no el agente que construyó el
// módulo: su proceso murió por un corte de conexión antes de escribirlas, así
// que el módulo llegó SIN VALIDAR. Verifican comportamiento observable contra
// los criterios declarados, no contra la implementación.
//
// Datos 100 % sintéticos: este repositorio es público.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { criteriosDeApoyo } from '../web/src/vistas/criteriosApoyo.ts';

/** Apoyo mínimo sintético. Nada de nombres ni coordenadas reales. */
const apoyo = (extra = {}) => ({
  id: 'a1',
  orden: 0,
  tipoPunto: 'Estructura',
  nombreCampo: 'P-01',
  funcionEstructural: 'Suspensión',
  coordenada: { lat: 4.6, lon: -74.08 },
  ...extra,
});

const buscar = (filas, fragmento) =>
  filas.find((f) => new RegExp(fragmento, 'i').test(f.id) || new RegExp(fragmento, 'i').test(f.etiqueta));

// ════════════════════════════════════════════════════════════════════════════
describe('criterios de apoyo — forma del resultado', () => {

  test('siempre devuelve filas completas, aunque no haya nada que evaluar', () => {
    const filas = criteriosDeApoyo(null, null);
    assert.ok(Array.isArray(filas) && filas.length > 0, 'no devuelve lista vacía');
    for (const f of filas) {
      for (const campo of ['id', 'etiqueta', 'valor', 'veredicto', 'detalle', 'criterio']) {
        assert.ok(typeof f[campo] === 'string' && f[campo].length > 0,
          `la fila ${f.id ?? '?'} trae ${campo} con contenido`);
      }
      assert.ok(['cumple', 'revisar', 'no_evaluable'].includes(f.veredicto),
        `veredicto válido en ${f.id}`);
    }
  });

  test('sin datos NADA sale como "cumple": el verde se gana, no se supone', () => {
    const filas = criteriosDeApoyo(null, null);
    assert.equal(filas.filter((f) => f.veredicto === 'cumple').length, 0);
  });

  test('los identificadores son estables y no se repiten', () => {
    const ids = criteriosDeApoyo(apoyo(), { deflexion_grados: 5 }).map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length, 'sin ids duplicados');
  });

  test('un empalme no se evalúa como apoyo — no sostiene el conductor', () => {
    const filas = criteriosDeApoyo(apoyo({ tipoPunto: 'Empalme' }), { deflexion_grados: null });
    assert.equal(filas.filter((f) => f.veredicto === 'cumple').length, 0,
      'ningún verde en un punto que no es apoyo');
    assert.ok(filas.some((f) => /empalme|no es un apoyo|no aplica/i.test(f.detalle + f.criterio)),
      'y se dice por qué');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('criterio 1 — función estructural contra la deflexión medida', () => {

  test('una suspensión casi recta es coherente', () => {
    const f = buscar(criteriosDeApoyo(
      apoyo({ funcionEstructural: 'Suspensión' }), { deflexion_grados: 1.2 }), 'funcion|deflex');
    assert.ok(f, 'la fila existe');
    assert.equal(f.veredicto, 'cumple');
  });

  test('una suspensión con 40° pide revisión: a ese ángulo debería anclar', () => {
    const f = buscar(criteriosDeApoyo(
      apoyo({ funcionEstructural: 'Suspensión' }), { deflexion_grados: 40 }), 'funcion|deflex');
    assert.equal(f.veredicto, 'revisar');
    assert.ok(/40/.test(f.valor + f.detalle), 'el ángulo medido aparece en la fila');
  });

  test('una retención donde no hace falta también se señala: es sobrecosto', () => {
    const f = buscar(criteriosDeApoyo(
      apoyo({ funcionEstructural: 'Retención / anclaje' }), { deflexion_grados: 0.4 }), 'funcion|deflex');
    assert.equal(f.veredicto, 'revisar');
  });

  test('sin deflexión (extremo de línea) no se inventa veredicto', () => {
    const f = buscar(criteriosDeApoyo(
      apoyo({ funcionEstructural: 'Terminal' }), { deflexion_grados: null }), 'funcion|deflex');
    assert.equal(f.veredicto, 'no_evaluable');
    assert.ok(f.criterio.length > 10, 'y explica por qué no se puede evaluar');
  });

  test('la deflexión del CONTEXTO manda sobre la guardada en el apoyo', () => {
    // El campo guardado existe para auditar lo que se calculó aquel día. Si se
    // usara para pintar, una coordenada corregida hoy seguiría mostrando el
    // ángulo viejo — con veredicto y todo, y sin que nadie lo note.
    const filas = criteriosDeApoyo(
      apoyo({ funcionEstructural: 'Suspensión', deflexion_grados: 0.5 }),
      { deflexion_grados: 40 });
    const f = buscar(filas, 'funcion|deflex');
    assert.equal(f.veredicto, 'revisar', 'usa los 40° del contexto, no los 0,5° guardados');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('criterios 2 a 5 — lo que hoy NO se puede evaluar, y lo dice', () => {

  test('la fuga específica no explota sin datos de aislamiento', () => {
    const f = buscar(criteriosDeApoyo(apoyo(), { deflexion_grados: 5 }), 'fuga');
    assert.ok(f, 'la fila de fuga existe igualmente');
    assert.equal(f.veredicto, 'no_evaluable');
    assert.ok(/aisla|tensión|unidades|falta/i.test(f.criterio + f.detalle),
      'y nombra el dato que falta');
  });

  test('la puesta a tierra sin medición es "no evaluable", nunca "cumple"', () => {
    const f = buscar(criteriosDeApoyo(apoyo(), { deflexion_grados: 5 }), 'tierra');
    assert.ok(f);
    assert.equal(f.veredicto, 'no_evaluable');
    assert.notEqual(f.veredicto, 'cumple');
  });

  test('el vano peso SIEMPRE es no evaluable con este levantamiento', () => {
    // No es un pendiente de programación: la altimetría de un GPS de mano (±8 m)
    // no da la cota del punto de sujeción, y sin ella el vano peso no existe.
    const f = buscar(criteriosDeApoyo(apoyo(), {
      deflexion_grados: 5, vanoAnterior_m: 200, vanoSiguiente_m: 180,
    }), 'peso');
    assert.ok(f, 'la fila de vano peso existe');
    assert.equal(f.veredicto, 'no_evaluable');
    assert.ok(/sujeci|altimetr|cota|GPS/i.test(f.criterio + f.detalle),
      'y declara el motivo físico, no un "pendiente"');
  });

  test('el vano viento se informa cuando hay vanos a ambos lados', () => {
    const f = buscar(criteriosDeApoyo(apoyo(), {
      deflexion_grados: 5, vanoAnterior_m: 200, vanoSiguiente_m: 180,
    }), 'viento');
    assert.ok(f, 'la fila de vano viento existe');
    // Semisuma de 200 y 180 = 190 m. Es aritmética, no hay margen de opinión.
    assert.ok(/190/.test(f.valor), `el vano viento se muestra (valor: ${f.valor})`);
  });

  test('en un extremo de línea el vano viento no se inventa con un cero', () => {
    const f = buscar(criteriosDeApoyo(apoyo(), {
      deflexion_grados: null, vanoAnterior_m: null, vanoSiguiente_m: 180,
    }), 'viento');
    assert.ok(f);
    assert.ok(!/^0[,.]0*\s*m/.test(f.valor.trim()),
      `un extremo no reporta 0 m de vano viento (valor: ${f.valor})`);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('criterios de apoyo — robustez', () => {

  test('entradas absurdas no revientan la ficha', () => {
    const casos = [
      [undefined, undefined],
      [apoyo(), { deflexion_grados: NaN }],
      [apoyo({ funcionEstructural: undefined }), { deflexion_grados: 10 }],
      [apoyo(), { deflexion_grados: 180 }],
    ];
    for (const [a, c] of casos) {
      const filas = criteriosDeApoyo(a, c);
      assert.ok(Array.isArray(filas) && filas.length > 0);
      for (const f of filas) {
        assert.ok(!/undefined|NaN|\[object/.test(f.valor + f.detalle + f.criterio),
          `sin basura en la fila ${f.id}`);
      }
    }
  });
});
