// ============================================================================
// tests/rayos-caribe.test.js — el atlas de DESCARGAS ATMOSFÉRICAS
// ----------------------------------------------------------------------------
// El sexto atlas (`99 §ADR-079`), y el primero que no viene de NASA POWER: los
// rayos los cuenta el satélite GOES. Eso trae tres formas nuevas de mentir sin
// dar un error, y son las que se vigilan aquí:
//
//   1. LA TORMENTA CORRIDA CINCO HORAS. El satélite nombra sus archivos en UTC y
//      la pantalla rotula «hora de Colombia». Guardar el conteo con la hora UTC
//      pone la tormenta de las 18:00 a las 23:00 — y así no cuadra con ninguna
//      falla. Es `32 · L-70` otra vez, con otra fuente.
//   2. EL RAYO SUELTO PUBLICADO COMO CERO. Un conteo con tres órdenes de
//      magnitud no cabe en 254 escalones lineales: o se recorta la tormenta, o
//      **1 rayo se redondea a 0**. Un solo rayo saca una línea; publicar «no
//      hubo» es el peor error posible en esta capa.
//   3. «NO CAYÓ NINGUNO» CONFUNDIDO CON «NO SE HA BAJADO». Cero rayos en una
//      hora medida es un DATO; una hora que nadie bajó todavía es un hueco.
//      Pintarlos igual convierte un atlas que se llena solo en uno que miente.
//
// Puro: se prueba el LIBRO y la codificación, sin bajar un byte del satélite.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  PERFIL_RAYOS, celdasDelLibro, claveColombia, diarioDelLibro,
} from '../herramientas/rayos-libro.mjs';
import { valorDeByte } from '../web/src/vistas/rejilla.ts';

// ════════════════════════════════════════════════════════════════════════════
describe('la hora del satélite se guarda en el reloj de la cuadrilla', () => {

  test('EL FALLO Nº 1: las 23:00 UTC son las 18:00 de aquí, mismo día', () => {
    assert.equal(claveColombia(new Date('2026-08-23T23:00:00Z')), '2026082318');
  });

  test('y las 03:00 UTC son las 22:00 del día ANTERIOR', () => {
    // El caso que parte un día en dos y el que más se cuela: la tormenta de la
    // noche del 23 vive, en UTC, en la madrugada del 24.
    assert.equal(claveColombia(new Date('2026-08-24T03:00:00Z')), '2026082322');
  });

  test('el cambio de año también cruza hacia atrás', () => {
    assert.equal(claveColombia(new Date('2027-01-01T02:00:00Z')), '2026123121');
  });

  test('nunca se publica la hora cruda del satélite', () => {
    const BAJADOR = readFileSync(
      fileURLToPath(new URL('../herramientas/rayos-caribe.mjs', import.meta.url)), 'utf-8');
    assert.match(BAJADOR, /claveColombia\(inicio\)/,
      'el bajador dejó de pasar la hora del archivo al reloj de Colombia');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('un CONTEO no cabe en una escala lineal de un byte', () => {

  const cod = PERFIL_RAYOS.codificacion;
  /** El inverso que usa el motor al escribir. Se copia aquí para probar el par. */
  const aByte = (v) => {
    const n = v <= cod.exactoHasta ? Math.round(v)
      : cod.exactoHasta + Math.round(Math.log(v / cod.exactoHasta) / Math.log(cod.razon));
    return Math.min(255, Math.max(1, n + 1));
  };

  test('EL FALLO Nº 2: 1 rayo se publica como 1, no como 0', () => {
    // Con paso 12 —lo que haría falta para que la tormenta cupiera en una escala
    // lineal— este caso valdría 0. Un rayo basta para sacar la línea.
    for (const v of [1, 2, 3, 7, 20, 49, 50]) {
      assert.equal(valorDeByte(aByte(v), cod), v, `${v} rayo(s) no sobrevivió al viaje`);
    }
  });

  test('y la tormenta de verdad tampoco se recorta', () => {
    // Medido: 2.656 rayos en una celda… y a la hora siguiente 3.336. El techo se
    // puso en 10.000 justamente porque la primera medida se quedó corta.
    for (const v of [2656, 3336, 8000]) {
      const leido = valorDeByte(aByte(v), cod);
      assert.ok(Math.abs(leido - v) / v < 0.03, `${v} rayos se leyeron como ${leido}`);
    }
    assert.ok(valorDeByte(255, cod) > 9000, 'el tope representable bajó de 9.000 rayos/h');
  });

  test('por encima del tramo exacto el error es de proporción, no de orden', () => {
    for (const v of [100, 250, 500, 1200, 2500]) {
      const leido = valorDeByte(aByte(v), cod);
      assert.ok(Math.abs(leido - v) / v < 0.03, `${v} → ${leido}: más del 3 % de error`);
    }
  });

  test('el byte 0 sigue siendo SIN DATO, no cero rayos', () => {
    assert.equal(valorDeByte(0, cod), null);
    assert.equal(valorDeByte(1, cod), 0, 'el byte 1 tiene que ser «cero rayos», que es un dato');
  });

  test('las cinco capas de siempre siguen siendo LINEALES', () => {
    // La curva nueva es aditiva: sin `curva` declarada, se lee como toda la vida.
    const lineal = { offset: -10, paso: 0.3, sin_dato: 0 };
    assert.equal(valorDeByte(1, lineal), -10);
    assert.equal(valorDeByte(11, lineal), -7);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el libro se acumula, y distingue el cero del hueco', () => {

  const libro = {
    horas: {
      2026082316: { '1,3': 2656, '1,4': 12 },
      2026082317: { '1,3': 3 },
    },
  };

  test('EL FALLO Nº 3: en una hora medida, la celda sin rayos vale CERO', () => {
    const celdas = celdasDelLibro(libro);
    assert.equal(celdas.get('1,3')['2026082316'], 2656);
    assert.equal(celdas.get('0,0')['2026082316'], 0, 'una celda sin rayos de una hora medida es 0');
    assert.equal(celdas.get('0,0')['2026082399'], undefined, 'una hora que nadie bajó no existe');
  });

  test('están las 36 celdas, no solo las que tuvieron rayos', () => {
    const celdas = celdasDelLibro(libro);
    assert.equal(celdas.size, 36);
  });

  test('el resumen del día SUMA la región entera', () => {
    const d = diarioDelLibro(libro);
    assert.deepEqual(d, [{ d: '2026-08-23', v: 2656 + 12 + 3 }]);
  });

  test('sin libro no se inventa un día', () => {
    assert.deepEqual(diarioDelLibro({ horas: {} }), []);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('lo que esta capa NO es, dicho en la propia ficha', () => {

  test('el aviso separa el conteo del satélite de la DDT que piden las normas', () => {
    // Es la confusión que costaría cara: usar rayos ópticos totales —nube-nube
    // incluidos— para dimensionar apantallamiento o puestas a tierra.
    assert.match(PERFIL_RAYOS.aviso, /NO ES LA DENSIDAD DE DESCARGAS A TIERRA/);
    assert.match(PERFIL_RAYOS.aviso, /RETIE|IEEE 1243/);
    assert.match(PERFIL_RAYOS.aviso, /nube-nube/);
  });

  test('y avisa de que la celda es enorme comparada con la línea', () => {
    assert.match(PERFIL_RAYOS.aviso, /12\.300 km²/);
  });

  test('la atribución es de NOAA, no de NASA', () => {
    // El motor tenía la atribución de POWER clavada; con una fuente nueva, eso
    // sería atribuir a NASA un dato que no es suyo.
    assert.match(PERFIL_RAYOS.atribucion, /NOAA/);
    assert.ok(!/POWER/.test(PERFIL_RAYOS.atribucion));
  });

  test('no se marca ninguna hipótesis en la escala', () => {
    // No hay tope declarado por el Ingeniero para rayos. Inventar uno sería
    // publicar un criterio que nadie firmó (`§ADR-055`, el caso del viento).
    assert.equal(PERFIL_RAYOS.hipotesisMarcadaEnRampa, undefined);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el sexto atlas es UNA entrada en el catálogo', () => {

  const CAT = readFileSync(
    fileURLToPath(new URL('../web/src/vistas/atlasCatalogo.ts', import.meta.url)), 'utf-8');

  test('añadirlo no obligó a tocar la pantalla', () => {
    assert.match(CAT, /rayos: \{/);
    assert.match(CAT, /ClaveAtlas =[\s\S]{0,200}'rayos'/, 'rayos salió del tipo de claves');
    // Sin `[^\n]*`: el orden se escribió en varias líneas cuando entraron las
    // capas «ahora» (`§ADR-081`), y una prueba atada al formato es una prueba
    // que se rompe por un salto de línea.
    assert.match(CAT, /ATLAS_EN_ORDEN[\s\S]{0,300}'rayos'/, 'rayos salió del orden de la pantalla');
  });

  test('el bajador NO vive en los PERFILES de POWER', () => {
    // Meterlo ahí haría que `--capa rayos` intentara pedirle rayos a POWER, que
    // no los tiene. Su perfil vive con su bajador.
    const MOTOR = readFileSync(
      fileURLToPath(new URL('../herramientas/atlas-caribe.mjs', import.meta.url)), 'utf-8');
    assert.ok(!/rayos:/.test(MOTOR.slice(MOTOR.indexOf('export const PERFILES'))),
      'el perfil de rayos se coló en los perfiles de POWER');
  });

  test('y el motor publica los seis con el MISMO escritor de fichas', () => {
    const MOTOR = readFileSync(
      fileURLToPath(new URL('../herramientas/atlas-caribe.mjs', import.meta.url)), 'utf-8');
    assert.match(MOTOR, /export function publicarAtlas/,
      'volvió a haber un solo camino: si rayos escribe su ficha aparte, son dos escritores');
    const BAJADOR = readFileSync(
      fileURLToPath(new URL('../herramientas/rayos-caribe.mjs', import.meta.url)), 'utf-8');
    assert.match(BAJADOR, /publicarAtlas\(PERFIL_RAYOS/);
  });
});
