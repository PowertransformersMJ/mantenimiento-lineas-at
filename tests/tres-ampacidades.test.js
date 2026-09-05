// ============================================================================
// tests/tres-ampacidades.test.js — que «dueño único» signifique algo
// ----------------------------------------------------------------------------
// QUÉ VIGILA. Tres pantallas publicaban un número rotulado «IEEE 738» y cada una
// escribía a mano sus condiciones: Mecánico descartaba la ficha del conductor y
// usaba el límite del material, Térmica calculaba a 0 msnm y las otras dos a 10.
// La fórmula era la misma; las CONDICIONES no. Y el mismo Darien AAAC va de
// 522 A en calma a 965 A con 2 m/s, así que la condición ES el veredicto.
//
// ⚠️ Esta prueba no comprueba números —de eso está `condicion-termica.test.js`—
// sino que **nadie vuelva a calcular la ampacidad por su cuenta**. Es una prueba
// de ARQUITECTURA: si alguien mañana escribe otra vez `ampacidad(...)` con un
// objeto de condiciones a mano en una pantalla, esto se pone rojo (`§ADR-093`).
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const leer = (p) => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf-8');

/** Las tres que publicaban su propia ampacidad. */
const PANTALLAS = [
  'web/src/componentes/Linea.tsx',
  'web/src/componentes/Fundamentos.tsx',
];

describe('ninguna pantalla calcula la ampacidad por su cuenta', () => {
  for (const p of PANTALLAS) {
    test(`${p.split('/').pop()} llama al dueño único, no a la fórmula`, () => {
      const t = leer(p);
      assert.match(t, /ampacidadDeLinea\(/, 'no usa el dueño único');
      // `ampacidad(` a secas es la fórmula cruda: usarla en una pantalla es
      // volver a inventarse las condiciones.
      assert.ok(!/[^a-zA-Z]ampacidad\(/.test(t),
        'vuelve a llamar a la fórmula cruda con condiciones propias');
    });
  }

  test('⚠️ ninguna pantalla escribe a mano un objeto de condiciones', () => {
    // La firma del pecado: `{ v: 0.61, eps: 0.5, ... }` suelto en una vista.
    for (const p of PANTALLAS) {
      assert.ok(!/\{\s*v:\s*0?\.\d+.*eps:/s.test(leer(p)),
        `${p} tiene un objeto de condiciones escrito a mano`);
    }
  });

  test('Térmica saca sus tres constantes del dueño único, no de literales', () => {
    const t = leer('web/src/vistas/termicaDatos.ts');
    assert.match(t, /EMISIVIDAD_POR_DEFECTO = CONDICION_DE_REFERENCIA\.emisividad/);
    assert.match(t, /ALTITUD_POR_DEFECTO_M = CONDICION_DE_REFERENCIA\.altitud_m/,
      'Térmica volvió a su propia altitud: divergía a 0 msnm mientras las otras usaban 10');
  });
});

describe('lo que NO se tocó, y no se debe tocar', () => {
  test('la fórmula `ampacidad()` sigue exportada y con su firma corta', () => {
    // Migrar las pantallas no puede romper a quien la usa bien: el propio
    // dueño único, `derrateo()` y las pruebas de oro contra tabla de fabricante.
    const t = leer('nucleo/termica.js');
    assert.match(t, /export function ampacidad\(conductor, Tc, Ta,/);
    assert.match(t, /export function derrateo\(/);
  });

  test('`temperaturaLimite` conserva su caída al genérico «Otro»', () => {
    // Hay pantallas que dependen de ella y una ya avisa de la aproximación.
    // Cambiarla habría sido arreglar esto rompiendo aquello.
    assert.match(leer('nucleo/termica.js'), /MATERIALES\[material\] \?\? MATERIALES\.Otro/);
  });

  test('Fundamentos SIGUE enseñando dos ambientes: es su trabajo', () => {
    // Su tarjeta existe para demostrar que la ampacidad NO es una constante del
    // conductor. Fusionarla con Térmica habría borrado la única pantalla que lo
    // dice. Lo que se le añadió es explicar por qué su cifra difiere.
    const t = leer('web/src/componentes/Fundamentos.tsx');
    assert.match(t, /ambiente_C: 40/);
    assert.match(t, /solo el ambiente/i, 'perdió la frase que evita confundirla con Térmica');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Y EL PECADO HERMANO, que costó cuatro sitios (`99 §ADR-098`)
// ────────────────────────────────────────────────────────────────────────────
// Nadie recalculaba la ampacidad, pero CUATRO sitios la ROTULABAN a mano como
// «IEEE 738»: dos pantallas y **dos informes**, uno de ellos el firmable. Desde
// que el número puede venir de la ficha del FABRICANTE, ese rótulo es una
// atribución falsa impresa sobre la firma de un ingeniero.
//
// Es el patrón que domina este proyecto —«arreglado donde se veía, vivo en la
// pieza hermana»— aplicado al TEXTO en vez de al cálculo.
// ════════════════════════════════════════════════════════════════════════════
describe('nadie atribuye a IEEE 738 un número que puede ser del fabricante', () => {
  const QUE_ROTULAN = [
    'web/src/componentes/Linea.tsx',
    'exportar/gerencial.js',
    'exportar/informe.js',
  ];

  for (const p of QUE_ROTULAN) {
    test(`${p.split('/').pop()} no pega «IEEE 738» a la cifra sin mirar su naturaleza`, () => {
      const t = leer(p);
      if (!/IEEE\s*(Std\s*)?738/.test(t)) return;   // no lo nombra: nada que vigilar
      // Si nombra la norma, tiene que distinguir las dos naturalezas: o llama al
      // dueño del rótulo, o ramifica por `naturaleza === 'declarada'`.
      assert.ok(/etiquetaDeAmpacidad\(/.test(t) || /naturaleza\s*===\s*'declarada'/.test(t),
        'nombra IEEE 738 junto a una ampacidad sin distinguir si la declaró el fabricante');
    });
  }

  test('⚠️ el informe FIRMABLE no afirma que la ampacidad esté verificada contra tabla', () => {
    // Lo estuvo la RESISTENCIA (0,1198 Ω/km del Darien, `tests/nucleo.test.js`).
    // La ampacidad nunca. Decirlo en un papel firmado es prestarle al número una
    // autoridad que no tiene.
    const t = leer('exportar/informe.js');
    assert.ok(!/amperaje es una REFERENCIA verificada contra tabla/.test(t),
      'el informe firmable vuelve a atribuirle a la ampacidad una verificación que no existe');
  });

  test('el dueño del rótulo distingue las dos naturalezas', async () => {
    const { etiquetaDeAmpacidad } = await import('../nucleo/termica.js');
    assert.match(etiquetaDeAmpacidad({ ampacidad_A: 700, naturaleza: 'declarada',
      fabricante: { fabricante: 'Quien sea' } }), /DECLARADA por Quien sea/);
    assert.match(etiquetaDeAmpacidad({ ampacidad_A: 718, naturaleza: 'derivada',
      condiciones: { todoAdoptado: true } }), /CALCULADA \(IEEE 738\)/);
    assert.match(etiquetaDeAmpacidad({ ampacidad_A: null }), /no evaluable/);
  });
});
