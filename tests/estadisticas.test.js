// ============================================================================
// tests/estadisticas.test.js — estadística de vanos
// ----------------------------------------------------------------------------
// Los valores esperados salen de: (a) aritmética verificable a mano, y (b) los
// números que el módulo de campo del Ingeniero YA muestra para LN-627 —
// contrastados dígito a dígito en docs/40 §10. La prueba contra la línea real
// usa el fixture de la bóveda privada y se salta sola en CI.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { estadisticasVanos } from '../nucleo/estadisticas.js';
import { vincenty } from '../nucleo/geodesia.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const cerca = (real, esperado, tol, msg) =>
  assert.ok(Math.abs(real - esperado) <= tol, `${msg}: ${real} vs ${esperado}`);

describe('estadísticas de vanos — aritmética verificable a mano', () => {

  test('caso mínimo conocido: [100, 200, 300]', () => {
    const e = estadisticasVanos([100, 200, 300]);
    assert.equal(e.n, 3);
    cerca(e.promedio, 200, 1e-12, 'promedio');
    cerca(e.mediana, 200, 1e-12, 'mediana');
    cerca(e.maximo, 300, 1e-12, 'máximo');
    cerca(e.minimo, 100, 1e-12, 'mínimo');
    // Muestra: √((100²+0²+100²)/2) = √10000 = 100
    cerca(e.desviacionEstandar, 100, 1e-9, 'desviación de muestra');
    cerca(e.coeficienteVariacion_pct, 50, 1e-9, 'coeficiente de variación');
    cerca(e.relacionMaxMin, 3, 1e-12, 'relación máx/mín');
  });

  test('la mediana con n par promedia los dos centrales', () => {
    cerca(estadisticasVanos([10, 20, 30, 40]).mediana, 25, 1e-12, 'mediana par');
  });

  test('los índices apuntan al vano correcto', () => {
    const e = estadisticasVanos([50, 300, 20, 100]);
    assert.equal(e.indiceMaximo, 1);
    assert.equal(e.indiceMinimo, 2);
  });

  test('un solo vano: sin dispersión, no revienta', () => {
    const e = estadisticasVanos([150]);
    assert.equal(e.desviacionEstandar, 0);
    assert.equal(e.coeficienteVariacion_pct, 0);
  });

  test('entradas basura se descartan; vacío devuelve null', () => {
    assert.equal(estadisticasVanos([]), null);
    assert.equal(estadisticasVanos([0, -5, NaN]), null);
    assert.equal(estadisticasVanos([0, 100, NaN]).n, 1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Contra los números que el módulo del Ingeniero YA muestra para LN-627.
// El fixture vive en la bóveda (coordenadas de cliente) y se salta en CI.
// ════════════════════════════════════════════════════════════════════════════
describe('no regresión — distribución de vanos de LN-627', () => {
  const fixture = join(AQUI, '..', '..', 'brain-private', 'mantenimiento-lineas-at',
                       'fixtures', 'LN-627-geometria.json');

  test('reproduce el panel del módulo de campo original', { skip: !existsSync(fixture) &&
      'fixture en la bóveda privada (esperado en CI)' }, () => {
    const puntos = JSON.parse(readFileSync(fixture, 'utf-8'));
    // Los empalmes NO son apoyos (docs/40 §10): fuera del cálculo.
    const E = puntos.filter((p) => !/EMP/i.test(String(p.name)));
    assert.equal(E.length, 24, '24 estructuras');

    const vanos = E.slice(1).map((p, i) => vincenty(E[i].lat, E[i].lon, p.lat, p.lon).d);
    const e = estadisticasVanos(vanos);

    // Los seis números del panel "Distribución de vanos" del HTML original:
    assert.equal(e.n, 23, '23 vanos');
    cerca(e.maximo, 336.70, 0.01, 'vano máximo');
    cerca(e.promedio, 127.35, 0.01, 'vano promedio');
    cerca(e.minimo, 13.35, 0.01, 'vano mínimo');
    cerca(e.mediana, 99.91, 0.01, 'mediana');
    cerca(e.desviacionEstandar, 78.74, 0.01, 'desviación estándar (muestra)');
    cerca(e.coeficienteVariacion_pct, 61.8, 0.05, 'coeficiente de variación');
    cerca(e.relacionMaxMin, 25.2, 0.05, 'relación máx/mín');

    // Y los pares extremos que el panel nombra:
    assert.equal(E[e.indiceMaximo].name, '627 E22', 'máximo sale de E22');
    assert.equal(E[e.indiceMinimo].name, '627 E20', 'mínimo sale de E20');

    // La distancia directa entre extremos (tarjeta "DIST. DIRECTA EXTREMOS"):
    const directa = vincenty(E[0].lat, E[0].lon, E[23].lat, E[23].lon).d;
    cerca(directa, 2479, 1, 'distancia directa E01→E24');
  });
});
