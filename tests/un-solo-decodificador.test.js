// ============================================================================
// tests/un-solo-decodificador.test.js — un formato, UN decodificador
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE (`99 §ADR-142`). El byte de un atlas se convierte en número en
// `vistas/rejilla.ts → valorDeByte`, que sabe de las DOS codificaciones: la
// lineal y la `exacta-y-log` que usan los rayos.
//
// En `vistas/atlasCaribe.ts` había una SEGUNDA copia de la fórmula, escrita a
// mano y solo lineal. El resultado no fue teórico: el panel del atlas de rayos
// llevaba meses imprimiendo el máximo equivocado en 553 de 755 horas, con un
// peor caso de **230 rayos escritos donde el mapa pintaba 5.350** — y la propia
// ficha imprimía 5.350 tres líneas más arriba, en la misma pantalla.
//
// La lección, que vale más que el arreglo: **dos decodificadores para un formato
// son un decodificador y una mentira esperando**. El segundo no se entera el día
// que el formato crece, y nadie lo nota porque sigue dando un número creíble.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));

/** El dueño de la conversión. Es el ÚNICO que puede escribir la fórmula. */
const DUENO = 'web/src/vistas/rejilla.ts';

function* fuentes(dir) {
  let entradas;
  try { entradas = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entradas) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* fuentes(p);
    else if (/\.(ts|tsx)$/.test(e.name) && statSync(p).size < 2_000_000) yield p;
  }
}

describe('un formato de atlas, un solo decodificador', () => {

  test('nadie reescribe la fórmula del byte fuera de su dueño', () => {
    // La firma del delito: multiplicar por `paso` y sumar `offset` a mano.
    const FORMULA = /\*\s*(?:cod(?:ificacion)?\.)?paso\s*\+\s*(?:cod(?:ificacion)?\.)?offset/;
    const culpables = [];
    for (const ruta of fuentes(join(RAIZ, 'web/src'))) {
      const rel = relative(RAIZ, ruta);
      if (rel === DUENO) continue;                    // el dueño SÍ la escribe
      // ⚠️ SE MIRA EL CÓDIGO, NO LOS COMENTARIOS. Esta prueba se cazó a sí misma
      // la primera vez que corrió: el comentario que EXPLICA el fallo cita la
      // fórmula, y sin esto habría que escribir el porqué a medias para que el
      // guardián callara. Un guardián que obliga a explicar peor no sirve.
      // Los comentarios se sustituyen por saltos de línea para no descuadrar
      // los números de línea que se reportan.
      const texto = readFileSync(ruta, 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/\/\/[^\n]*/g, '');
      texto.split('\n').forEach((linea, i) => {
        if (FORMULA.test(linea)) culpables.push(`${rel}:${i + 1}`);
      });
    }
    assert.deepEqual(culpables, [],
      'hay una segunda copia de la fórmula del byte. Ignorará la curva «exacta-y-log» '
      + `y dará números creíbles y falsos. Use \`valorDeByte\` de ${DUENO}.\n`
      + culpables.join('\n'));
  });

  test('el decodificador sabe de las DOS codificaciones, no solo de la lineal', async () => {
    const { valorDeByte } = await import('../web/src/vistas/rejilla.ts');
    // Lineal: el byte 0 está RESERVADO y el 1 es el primer valor útil.
    const lineal = { offset: 0, paso: 0.25, sin_dato: 0 };
    assert.equal(valorDeByte(0, lineal), null, 'el byte reservado no es un valor');
    assert.equal(valorDeByte(1, lineal), 0, 'el byte 1 es CERO, no un escalón');
    assert.equal(valorDeByte(2, lineal), 0.25);
    // Curva: exacta abajo, logarítmica arriba. Es la de los rayos.
    const curva = { offset: 0, paso: 1, sin_dato: 0, curva: 'exacta-y-log', exactoHasta: 50, razon: 1.0263 };
    assert.equal(valorDeByte(11, curva), 10, 'por debajo del umbral la curva es exacta');
    const alto = valorDeByte(231, curva);
    assert.ok(alto > 4000 && alto < 7000,
      `un byte alto de la curva tiene que dar miles, y dio ${alto}: `
      + 'con la fórmula lineal daría 230, que es el error que esta prueba existe para cazar');
  });
});
