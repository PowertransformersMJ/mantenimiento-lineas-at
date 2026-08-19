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
// ⚠️ El comentario de arriba decía que este contrato NO se puede importar desde
// Node. Ya no es cierto: con Node 22 se importa un `.ts` directamente, y así
// esta prueba deja de comprobar solo el TEXTO de la regla para comprobar que
// Zod la EJECUTA — que era la limitación declarada. Se importa aquí, junto a la
// comprobación por texto, porque las dos siguen haciendo falta: una vigila que
// la regla no cambie, la otra que haga lo que dice.
import { Evidencia } from '../contratos/src/eventos.ts';
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

// ── El campo que el molde descartaba en silencio ────────────────────────────
//
// `lineaId` se escribía y el molde NO lo declaraba, así que lo tiraba. No molestó
// mientras la única vía de subida fue el guion de consola, que no pasa por el
// molde. En cuanto la aplicación empezó a subir apareció el daño: la galería
// busca por `lineaId`, de modo que las fotos del camino nuevo habrían entrado
// INVISIBLES — y una evidencia no se puede borrar.
test('una evidencia dice de qué línea es, y ese campo sobrevive al molde', () => {
  const doc = {
    id: '11111111-1111-4111-8111-111111111111',
    orgId: 'transpower',
    creadoEn: '2026-01-01T00:00:00.000Z',
    creadoPor: 'uid-de-prueba',
    revision: 0,
    tipo: 'evidencia',
    lineaId: '22222222-2222-4222-8222-222222222222',
    apoyoId: '33333333-3333-4333-8333-333333333333',
    rutaObjeto: 'LX-001/pruebas/aabbccddeeff-a.jpg',
    sha256: 'a'.repeat(64),
    bytes: 1234,
    mime: 'image/jpeg',
    subida: 'completa',
  };
  const r = Evidencia.safeParse(doc);
  assert.equal(r.success, true, 'el molde rechaza una evidencia bien formada');
  assert.equal(r.data.lineaId, doc.lineaId,
    'el molde volvió a descartar `lineaId`: las fotos entrarían invisibles y no se pueden borrar');

  // Y sin él no valida: una foto que no dice de qué línea es no la encuentra nadie.
  const { lineaId, ...huerfana } = doc;
  assert.equal(Evidencia.safeParse(huerfana).success, false);
});
