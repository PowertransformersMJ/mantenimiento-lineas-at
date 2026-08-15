// ============================================================================
// tests/cerrojo-revision.test.js — que dos ingenieros no se borren en silencio
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. Es el defecto que solo aparece cuando la herramienta deja de
// usarla una persona sola, que es justo lo que se pidió: el Ingeniero Y SU
// EQUIPO.
//
// Cada parte del análisis se guarda ENTERA, no como delta. Sin cerrojo, quien
// guarde el árbol a las 10:00 sustituye completo el que un compañero guardó a
// las 09:40 — y los dos ven que se guardó bien. Nadie se entera de nada. Es
// razonamiento perdido que ni siquiera se sabe que se perdió, dentro de un
// expediente que se firma.
//
// El número de revisión YA EXISTÍA en cada documento. Se incrementaba a ciegas
// y nadie lo comprobaba: era un contador, no un cerrojo.
//
// LAS DOS CAPAS, y las dos hacen falta:
//   · La REGLA de la base exige revisión nueva == vieja + 1. Es el cerrojo de
//     verdad: entre leer y escribir hay una ventana, y un cerrojo que el cliente
//     puede saltarse no es un cerrojo.
//   · El CLIENTE relee antes de escribir, para que el caso normal dé un mensaje
//     que se entienda en vez de una denegación opaca de la base.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const reglas = readFileSync(join(RAIZ, 'firestore.rules'), 'utf-8');
const firestore = readFileSync(join(RAIZ, 'web/src/datos/firestore.ts'), 'utf-8');

/** El bloque `match /analisis/{...}` de las reglas. */
function bloqueAnalisis() {
  const i = reglas.indexOf('match /analisis/');
  assert.notEqual(i, -1, 'no existe el bloque de reglas de `analisis`');
  const j = reglas.indexOf('match /', i + 10);
  return reglas.slice(i, j === -1 ? undefined : j);
}

describe('la REGLA de la base es el cerrojo', () => {
  test('actualizar exige que la revisión avance exactamente uno', () => {
    const b = bloqueAnalisis();
    assert.match(b, /request\.resource\.data\.revision\s*==\s*resource\.data\.get\('revision',\s*0\)\s*\+\s*1/,
      'sin esto la última escritura gana en silencio: el trabajo del compañero desaparece '
      + 'y los dos ven «guardado»');
  });

  test('tolera un documento antiguo sin el campo, en vez de dejarlo inservible', () => {
    // Una regla nueva que asuma que el campo existe convierte en no editable
    // cualquier expediente creado antes. `get('revision', 0)` lo evita.
    assert.match(bloqueAnalisis(), /get\('revision',\s*0\)/,
      'usa get() con valor por defecto: una regla no puede romper lo ya creado');
  });

  test('el cerrojo NO sustituye a las defensas que ya había', () => {
    // Añadir una condición no puede quitar otra. Un análisis cerrado sigue sin
    // poder tocarse, y los campos de identidad siguen protegidos.
    const b = bloqueAnalisis();
    assert.match(b, /resource\.data\.cerrado == false/,
      'un análisis cerrado respalda un informe entregado: no se toca');
    assert.match(b, /noTocaReservados\(\)/,
      'los campos de identidad y propiedad siguen protegidos');
    assert.match(b, /esEditor\(\)/, 'sigue haciendo falta ser editor');
  });
});

describe('el CLIENTE explica el conflicto en vez de dar un error opaco', () => {
  test('relee la revisión antes de escribir', () => {
    const i = firestore.indexOf('async guardarParte(analisisId');
    const j = firestore.indexOf('await updateDoc(ref', i);
    assert.ok(i !== -1 && j !== -1, 'no se encuentra la escritura de la parte');
    const antes = firestore.slice(i, j);
    assert.match(antes, /getDoc\(ref\)/,
      'sin releer, el cliente no puede distinguir un conflicto de cualquier otro fallo');
    assert.match(antes, /revisionEnLaBase !== revision/,
      'hay que COMPARAR la revisión, no solo leerla');
  });

  test('el mensaje dice qué pasó, que no se escribió nada y qué hacer', () => {
    // Un mensaje que solo dice «error» hace que el ingeniero vuelva a pulsar
    // Guardar, que es exactamente lo que no debe hacer.
    assert.match(firestore, /Otra persona guardó cambios en este análisis/,
      'el mensaje debe nombrar la causa real');
    assert.match(firestore, /No se ha escrito nada para no borrar su trabajo/,
      'debe decir que NO se escribió: si no, se asume lo peor');
    assert.match(firestore, /Copia lo que hayas escrito/,
      'debe decir qué hacer, porque recargar borra lo que hay en pantalla');
  });

  test('el conflicto se LANZA, no se traga', () => {
    const i = firestore.indexOf('revisionEnLaBase !== revision');
    const bloque = firestore.slice(i, i + 420);
    assert.match(bloque, /throw new Error/,
      'tragarse el conflicto sería peor que el defecto original: el ingeniero creería que guardó');
    // Y que no se escriba de todos modos: el `throw` va ANTES del updateDoc.
    assert.ok(firestore.indexOf('throw new Error', i) < firestore.indexOf('await updateDoc(ref', i),
      'el aviso tiene que impedir la escritura, no acompañarla');
  });
});
