// ============================================================================
// tests/ruta.test.js — que un enlace lleve a donde dice
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. Hasta hoy la dirección solo sabía de línea y pestaña. Del
// análisis de causa raíz no guardaba nada, con tres consecuencias que sufre un
// EQUIPO y no una persona sola:
//
//   · No había enlace que pegar en un correo. Compartir un expediente exigía
//     explicar de palabra cómo llegar, en una herramienta cuyo oficio declarado
//     es hacer BARATO comprobar al ingeniero que firma.
//   · Recargar dentro de un expediente devolvía a la línea.
//   · El botón Atrás, agotados sus pasos, sacaba de la aplicación.
//
// Y un cuarto, peor: la dirección SÍ llevaba el código de línea y al abrirla se
// descartaba — siempre se cargaba la primera del parque. Con dos líneas, dos
// ingenieros pueden discutir cifras creyendo que miran la misma.
//
// Esta prueba importa la función REAL. Copiar aquí la expresión regular habría
// sido el pecado de `33 · L-19`: la misma regla en dos sitios acaba divergiendo.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { leerRuta, HASH_ATLAS } from '../web/src/datos/ruta.ts';

describe('la gramática de direcciones', () => {
  test('#/rca es el índice de análisis', () => {
    assert.deepEqual(leerRuta('#/rca'), { tipo: 'rca', codigo: undefined });
  });

  test('#/rca/<código> nombra UN expediente, y por su código', () => {
    // Por el código y no por el identificador interno: un enlace que se pega en
    // un chat tiene que decir de qué expediente habla.
    assert.deepEqual(leerRuta('#/rca/RCA-2026-08-04-0227'),
      { tipo: 'rca', codigo: 'RCA-2026-08-04-0227' });
  });

  test('la línea con su pestaña sigue funcionando igual que antes', () => {
    assert.deepEqual(leerRuta('#/LN-627/resumen'),
      { tipo: 'linea', codigo: 'LN-627', pestana: 'resumen' });
  });

  test('una línea sin pestaña es válida: la pestaña la elige la pantalla', () => {
    assert.deepEqual(leerRuta('#/LN-627'), { tipo: 'linea', codigo: 'LN-627', pestana: undefined });
  });

  test('un código con caracteres escapados se devuelve legible', () => {
    assert.equal(leerRuta('#/rca/RCA%2D2026').codigo, 'RCA-2026');
    assert.equal(leerRuta('#/LN%20627/resumen').codigo, 'LN 627');
  });

  test('lo que no es una dirección devuelve null, no algo inventado', () => {
    // Devolver una ruta por defecto llevaría a abrir «algo» ante una dirección
    // rota, que es justo lo que no debe pasar en un expediente que se firma.
    for (const h of ['', '#', '#/', '#/a/b/c', 'basura']) {
      assert.equal(leerRuta(h), null, `«${h}» no es una dirección válida`);
    }
  });

  test('«rca» como código de línea no se confunde con el segmento', () => {
    // Un caso de borde real: si alguien llama «rca» a una línea, la gramática
    // la leería como el segmento. Queda DECLARADO aquí para que se sepa.
    assert.equal(leerRuta('#/rca/resumen').tipo, 'rca',
      'con la gramática actual, una línea llamada «rca» sería inalcanzable por enlace');
  });

  test('`#/sol` abre el atlas solar, y solo sin segundo tramo', () => {
    // El atlas no es de ninguna línea: no lleva código detrás. Si alguien pega
    // `#/sol/loquesea`, NO puede abrirlo — una dirección inventada no debe
    // abrir una pantalla real; cae al caso de línea, donde «sol» no existe.
    assert.deepEqual(leerRuta('#/sol'), { tipo: 'atlas', cual: 'sol' });
    assert.deepEqual(leerRuta('#/sol/'), { tipo: 'atlas', cual: 'sol' });
    assert.deepEqual(leerRuta('#/sol/marzo'), { tipo: 'linea', codigo: 'sol', pestana: 'marzo' });
  });

  test('`#/temperatura` abre SU atlas, no el del sol', () => {
    // Los dos atlas comparten pantalla y comparten estado. El día que la tabla
    // de direcciones y la de aperturas se separen, `#/temperatura` abriría el
    // solar y nadie vería un error: los colores seguirían saliendo bonitos.
    assert.deepEqual(leerRuta('#/temperatura'), { tipo: 'atlas', cual: 'temperatura' });
    assert.deepEqual(leerRuta('#/temperatura/'), { tipo: 'atlas', cual: 'temperatura' });
    assert.notDeepEqual(leerRuta('#/temperatura'), leerRuta('#/sol'));
    assert.deepEqual(leerRuta('#/temperatura/mayo'),
      { tipo: 'linea', codigo: 'temperatura', pestana: 'mayo' });
  });

  test('cada atlas y su dirección salen de la MISMA tabla', () => {
    // Sin esto, añadir el tercer atlas es añadirlo en dos sitios — y el segundo
    // se olvida el día que se tenga prisa.
    for (const [cual, hash] of Object.entries(HASH_ATLAS)) {
      assert.deepEqual(leerRuta(hash), { tipo: 'atlas', cual },
        `${hash} tiene que abrir el atlas «${cual}»`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// UN SOLO CATÁLOGO DE ATLAS (§ADR-068)
// ----------------------------------------------------------------------------
// `ClaveAtlas` y la lista de atlas vivían DOS veces: en el componente de la
// pantalla y aquí, con sus direcciones. Añadir el quinto obligó a tocar las dos,
// y tocar una sola habría dejado `#/nubes` abriendo otro atlas SIN dar un error
// — lo cazó el compilador de milagro, porque los dos tipos se cruzaban en una
// prop. Es la familia de `30 · M-01`: lo que hay que sincronizar a mano, se
// desincroniza.
// ════════════════════════════════════════════════════════════════════════════
describe('el catálogo de atlas tiene un solo dueño', () => {

  test('nadie más define ClaveAtlas ni la lista', async () => {
    const RAIZ = fileURLToPath(new URL('../web/src', import.meta.url));
    const { readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const fuentes = (d) => readdirSync(d).flatMap((f) => {
      const p = join(d, f);
      return statSync(p).isDirectory() ? fuentes(p) : (/\.tsx?$/.test(f) ? [p] : []);
    });
    const dueños = fuentes(RAIZ).filter((f) => {
      const s = readFileSync(f, 'utf-8');
      return /^export type ClaveAtlas =/m.test(s) || /^export const ATLAS_EN_ORDEN/m.test(s);
    }).map((f) => f.replace(RAIZ + '/', ''));
    assert.deepEqual(dueños, ['vistas/atlasCatalogo.ts'],
      'volvió a haber más de una lista de atlas: se desincronizarán');
  });

  test('cada atlas del catálogo tiene su ficha publicada, y su dirección es única', async () => {
    const { ATLAS, ATLAS_EN_ORDEN, HASH_ATLAS } = await import('../web/src/vistas/atlasCatalogo.ts');
    const { existsSync } = await import('node:fs');
    const publico = fileURLToPath(new URL('../web/public', import.meta.url));
    const faltan = [], hashes = new Set();
    for (const c of ATLAS_EN_ORDEN) {
      if (!existsSync(publico + ATLAS[c].ficha)) faltan.push(ATLAS[c].ficha);
      assert.ok(!hashes.has(ATLAS[c].hash), `dos atlas comparten la dirección ${ATLAS[c].hash}`);
      hashes.add(ATLAS[c].hash);
      assert.equal(HASH_ATLAS[c], ATLAS[c].hash, 'la tabla de direcciones dejó de derivarse');
    }
    assert.deepEqual(faltan, [], 'atlas del catálogo sin ficha publicada');
    assert.equal(ATLAS_EN_ORDEN.length, Object.keys(ATLAS).length,
      'el orden de la pantalla se olvidó de un atlas del catálogo');
  });
});
