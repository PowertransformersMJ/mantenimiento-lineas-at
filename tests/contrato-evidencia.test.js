// ============================================================================
// tests/contrato-evidencia.test.js — de qué puede colgar una fotografía
// ----------------------------------------------------------------------------
// QUÉ SE PRUEBA: el `refine` de `Evidencia` en `contratos/src/eventos.ts`, que
// decide qué se considera evidencia válida en TODO el sistema.
//
// POR QUÉ ES UNA PRUEBA Y NO UN COMENTARIO. Esta regla no falla ruidosamente:
// falla en SILENCIO. `web/src/datos/firestore.ts` valida con `safeParse` y
// descarta lo que no pasa sin avisar en pantalla — es lo correcto (una ficha
// corrupta no debe tumbar la línea entera), pero significa que estrechar este
// `refine` por descuido haría desaparecer fotografías ya subidas y pagadas sin
// un solo error donde mirar. Con las 99 fotos de estructura de LN-627 dentro,
// serían 99 objetos facturando en R2 y una galería vacía (ADR-015).
//
// ⚠️ CÓMO SE PRUEBA, Y QUÉ NO DEMUESTRA. Se lee el ARCHIVO y se comprueba el
// predicado, igual que `tests/nucleo.test.js:322` hace con `FUNCIONES_ANCLA`.
// No se importa el módulo porque no se puede: el contrato es TypeScript y usa
// la convención de importar `./comunes.js` apuntando a `comunes.ts`, que Node
// no resuelve (comprobado: `ERR_MODULE_NOT_FOUND`). Consecuencia declarada:
// esto prueba que la REGLA no cambió, no que Zod la ejecute bien. Lo segundo se
// verificó a mano contra producción el 2026-08-03, con las 99 fotos ya subidas
// apareciendo en la ficha de su apoyo.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FUENTE = readFileSync(join(AQUI, '..', 'contratos', 'src', 'eventos.ts'), 'utf-8');

/** El bloque `.refine(...)` que cierra el esquema de Evidencia. */
const refineDeEvidencia = () => {
  const i = FUENTE.indexOf('export const Evidencia');
  assert.notEqual(i, -1, 'no se encontró el esquema Evidencia');
  const j = FUENTE.indexOf('.refine(', i);
  assert.notEqual(j, -1, 'Evidencia perdió su `refine`: cualquier foto huérfana pasaría');
  return FUENTE.slice(j, FUENTE.indexOf(');', j) + 2);
};

describe('contrato · una fotografía siempre declara de QUÉ es', () => {

  test('el refine sigue ahí: sin él, un archivo suelto sería evidencia', () => {
    const r = refineDeEvidencia();
    assert.match(r, /una foto sin dueño no prueba nada/);
  });

  test('acepta los TRES dueños, y ninguno es obligatorio por separado', () => {
    // `apoyoId` entró en ADR-015: las 99 fotos de estructura de LN-627 no vienen
    // de una falla ni de una campaña de inspección, sino del recorrido de
    // levantamiento. Exigirles una inspección obligaba a inventar quién iba en
    // la cuadrilla y qué apoyos cubrió — datos que no existen en ninguna parte.
    const r = refineDeEvidencia();
    for (const campo of ['inspeccionId', 'investigacionId', 'apoyoId']) {
      assert.match(r, new RegExp(`Boolean\\(e\\.${campo}\\)`),
        `${campo} dejó de valer como dueño de una evidencia`);
    }
    assert.ok(!/&&/.test(r.split('{ message')[0]),
      'el predicado tiene que ser un O entre los tres, no un Y: exigir dos a la vez '
      + 'haría desaparecer en silencio las fotos que solo declaran uno');
  });

  test('el mensaje del rechazo NOMBRA los tres dueños posibles', () => {
    // Quien lo lea en una consola a las once de la noche tiene que saber qué
    // falta sin abrir el contrato.
    const mensaje = /message:\s*'([^']+)'/.exec(refineDeEvidencia())?.[1] ?? '';
    for (const palabra of [/inspecci/i, /investigaci/i, /apoyo/i]) {
      assert.match(mensaje, palabra, `el mensaje no menciona ${palabra}`);
    }
  });

  test('lo que NO se relajó: la ruta, la huella y el tamaño siguen siendo obligatorios', () => {
    // Ampliar de quién cuelga una evidencia no puede convertirse, de rebote, en
    // admitir fichas sin con qué comprobar el binario que describen.
    const i = FUENTE.indexOf('export const Evidencia');
    const cuerpo = FUENTE.slice(i, FUENTE.indexOf('.refine(', i));
    assert.match(cuerpo, /rutaObjeto:\s*z\.string\(\)\.min\(1\)/);
    assert.match(cuerpo, /sha256:\s*z\.string\(\)\.regex\(\/\^\[a-f0-9\]\{64\}\$\//);
    assert.match(cuerpo, /bytes:\s*z\.number\(\)\.int\(\)\.positive\(\)/);
    // Y los tres dueños siguen siendo OPCIONALES por separado: hacer obligatorio
    // cualquiera de ellos rompería a los otros dos casos.
    for (const campo of ['inspeccionId', 'investigacionId', 'apoyoId']) {
      assert.match(cuerpo, new RegExp(`${campo}:\\s*Id\\.optional\\(\\)`));
    }
  });
});
