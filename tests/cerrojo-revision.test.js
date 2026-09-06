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

// El catálogo, para no volver a escribir a mano un código de función: si mañana
// cambia el corto de `apoyos.editar`, esta prueba cambia con él.
import { FUNCIONES } from '../contratos/src/usuarios.ts';

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

/** El bloque `match /apoyos/{...}` de las reglas. */
function bloqueApoyos() {
  const i = reglas.indexOf('match /apoyos/');
  assert.notEqual(i, -1, 'no existe el bloque de reglas de `apoyos`');
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
    // Decía `esEditor()`. El 2026-09-05 las reglas dejaron de decidir por
    // jerarquía de rol y pasaron a las FUNCIONES del catálogo
    // (`contratos/src/usuarios.ts`): un expediente lo trabaja quien trae
    // `expedientes.editar`, que traen exactamente los mismos roles que antes
    // pasaban por `esEditor()`. Lo que se vigila no cambió —sigue sin poder
    // tocarlo cualquiera—, cambió con qué palabra se dice.
    assert.match(b, new RegExp(`tiene\\('${FUNCIONES['expedientes.editar'].corto}'\\)`),
      'sigue haciendo falta permiso de edición de expedientes');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL MISMO CERROJO EN `apoyos`, Y AHÍ PESA MÁS
//
// Un análisis se puede volver a razonar. Un apoyo NO SE BORRA —`allow delete: if
// false`— así que lo que se pise se pisa para siempre, dentro del documento del
// que sale el veredicto que alguien firma. Hasta que la ficha estructural se
// pudo escribir desde la pantalla esto no hacía daño: nadie actualizaba apoyos.
// Desde que se puede, la regla tiene que exigir lo mismo que ya exige `analisis`.
// ════════════════════════════════════════════════════════════════════════════
describe('el cerrojo también cierra los APOYOS', () => {
  test('actualizar un apoyo exige que la revisión avance exactamente uno', () => {
    assert.match(bloqueApoyos(),
      /request\.resource\.data\.revision\s*==\s*resource\.data\.get\('revision',\s*0\)\s*\+\s*1/,
      'sin esto, quien complete la ficha a las 10:00 pisa la que un compañero completó a las '
      + '09:40 — y un apoyo no se borra: lo pisado se pisa para siempre');
  });

  test('tolera los apoyos ya creados que no traen el campo', () => {
    // Los 26 apoyos que ya están en producción podrían no tener `revision`. Una
    // regla nueva que la dé por hecha los convertiría en no editables, que es
    // justo lo contrario de lo que esta ola viene a resolver.
    assert.match(bloqueApoyos(), /get\('revision',\s*0\)/,
      'usa get() con valor por defecto: una regla no puede romper lo ya creado');
  });

  test('el cerrojo NO sustituye a las defensas que ya tenía el apoyo', () => {
    const b = bloqueApoyos();
    assert.match(b, /noTocaReservados\(\)/, 'orgId, creadoPor y creadoEn siguen congelados');
    // Igual que arriba: `esEditor()` → `tiene('ae')` (`apoyos.editar`), la misma
    // gente con otro nombre. Editar la ficha y CREAR el punto se separaron en
    // dos funciones distintas ese mismo día, y esta prueba mira la de editar.
    assert.match(b, new RegExp(`tiene\\('${FUNCIONES['apoyos.editar'].corto}'\\)`),
      'sigue haciendo falta permiso para editar la ficha de un apoyo');
    assert.match(b, /deMiOrg\(resource\.data\)/, 'sigue sin poder tocarse un apoyo de otra organización');
    assert.match(b, /allow delete:\s*if false/, 'un apoyo no se borra, y eso no cambia');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA ESCRITURA DE LA FICHA: el orden de las comprobaciones ES la salvaguarda
//
// Estas pruebas leen `firestore.ts` como TEXTO, igual que las de abajo, y por el
// mismo motivo: ese archivo habla con el SDK de Firebase y no se puede ejecutar
// sin navegador. Lo que se vigila no es un valor de retorno, es que ninguna
// comprobación se caiga del camino — porque en apoyos no hay deshacer.
// ════════════════════════════════════════════════════════════════════════════
describe('guardar la ficha de un apoyo comprueba TODO antes de mandar', () => {
  const cuerpo = (nombre) => {
    const i = firestore.indexOf(`async ${nombre}(`);
    assert.notEqual(i, -1, `no se encuentra ${nombre}`);
    const j = firestore.indexOf('\n  async ', i + 10);
    return firestore.slice(i, j === -1 ? undefined : j);
  };

  test('el PERMISO se comprueba antes de mandar nada', () => {
    // Una denegación de la base llega en inglés, sin causa y con el dato ya
    // tecleado. Preguntar aquí la convierte en una frase que se entiende.
    // ⚠️ CAMBIÓ EL CÓMO, NO EL QUÉ (`99 §ADR-100`): antes se comparaba el rol,
    // ahora se pregunta por la función `apoyos.editar` — la misma que miran las
    // reglas. Quién puede escribir una ficha no ha cambiado.
    const b = cuerpo('guardarFichaApoyo');
    assert.match(b, /puede\(\{ claims \}, 'apoyos\.editar'\)/, 'una ficha la escribe quien puede editar apoyos');
    assert.match(b, /No se ha mandado nada a la base/);
    assert.ok(b.indexOf('throw new Error') < b.indexOf('FichaEstructural.safeParse'),
      'el permiso se mira ANTES de nada');
  });

  test('la firma y la hora las pone la SESIÓN, no lo que venga de fuera', () => {
    // La procedencia y la fuente son lo que el Ingeniero declara. Quién responde
    // de ese número el día de la firma, no: eso no puede salir de un campo que
    // un cliente modificado rellena a su gusto.
    assert.match(firestore, /declaradoEn: ahora, declaradoPor: uid/,
      'el sello se cierra con la sesión abierta, pase lo que pase venga de fuera');
    assert.match(cuerpo('guardarFichaApoyo'), /sellarFicha\(ficha \?\? \{\}, u\.uid, ahora\)/);
  });

  test('se valida contra el molde ANTES de escribir', () => {
    // Las reglas NO miran el contenido de un apoyo: este `safeParse` es la única
    // defensa que tiene la forma del dato.
    const b = cuerpo('guardarFichaApoyo');
    assert.match(b, /FichaEstructural\.safeParse/);
    assert.ok(b.indexOf('FichaEstructural.safeParse') < b.indexOf('await updateDoc(ref'),
      'validar después de escribir no valida nada');
  });

  test('relee la revisión del apoyo antes de escribir, y compara', () => {
    const b = cuerpo('guardarFichaApoyo');
    assert.match(b, /getDoc\(ref\)/,
      'sin releer, el cliente no puede distinguir un conflicto de cualquier otro fallo');
    assert.match(b, /revisionEnLaBase !== revision/, 'hay que COMPARAR la revisión, no solo leerla');
    assert.ok(b.indexOf('revisionEnLaBase !== revision') < b.indexOf('await updateDoc(ref'),
      'el aviso tiene que impedir la escritura, no acompañarla');
    assert.match(b, /revision: revision \+ 1/, 'la revisión avanza exactamente uno');
  });

  test('el mensaje del conflicto trae sus tres partes', () => {
    // La frase la arma `conflicto(donde)`, que es su único dueño: la escritura
    // de la ficha y la del lote dicen exactamente lo mismo, y una no puede
    // quedarse a medias mientras la otra se corrige.
    assert.match(cuerpo('guardarFichaApoyo'), /throw new Error\(conflicto\('este apoyo'\)\)/,
      'el conflicto nombra QUÉ se estaba editando');
    const i = firestore.indexOf('function conflicto(');
    assert.notEqual(i, -1, 'no existe el dueño de la frase del conflicto');
    const frase = firestore.slice(i, i + 400);
    assert.match(frase, /Otra persona guardó cambios en/, 'nombra la causa real');
    assert.match(frase, /No se ha escrito nada para no borrar su trabajo/,
      'debe decir que NO se escribió: si no, se asume lo peor');
    assert.match(frase, /Copia lo que hayas escrito/,
      'debe decir qué hacer, porque recargar borra lo que hay en pantalla');
  });

  test('la GEOMETRÍA IMPOSIBLE se rechaza, y la regla no se reescribe aquí', () => {
    // El núcleo devuelve `null` en silencio con el amarre por encima de la
    // punta: se guardarían números impecables, no saldría veredicto y parecería
    // una avería. La regla tiene UN dueño —el módulo puro— y aquí solo se
    // consulta, sobre el apoyo COMPLETO (el de la base con el parche encima).
    const b = cuerpo('guardarFichaApoyo');
    assert.match(b, /revisarGeometria\(aplicarFicha\(/);
    assert.match(b, /if \(avisos\.length\) throw new Error\(avisos\[0\]\.mensaje\)/,
      'el motivo que se le enseña es el del módulo puro, en castellano');
    assert.ok(b.indexOf('revisarGeometria') < b.indexOf('await updateDoc(ref'));
    assert.doesNotMatch(b, /alturaAplicacion_m >|hApl >/,
      'una tercera copia de la regla acabaría diciendo algo distinto que el núcleo');
  });

  test('los SELLOS viajan en ruta punteada: guardar uno no borra los demás', () => {
    // `updateDoc` SUSTITUYE el campo que recibe. Mandar `procedencias` entero
    // dejaría sin origen el dato que alguien selló el mes pasado, dentro de un
    // documento que respalda un papel firmado y sin un solo error por el camino.
    assert.match(firestore, /salida\[`procedencias\.\$\{campo\}`\] = sello/);
    assert.match(cuerpo('guardarFichaApoyo'), /parcheDeFicha\(validada\)/);
  });
});

describe('el LOTE es la pieza que más ahorra y la única que hace daño irreversible', () => {
  const lote = (() => {
    const i = firestore.indexOf('async guardarFichaApoyoEnLote(');
    assert.notEqual(i, -1, 'no se encuentra la escritura por lote');
    const j = firestore.indexOf('\n  async ', i + 10);
    return firestore.slice(i, j === -1 ? undefined : j);
  })();

  test('exige la función del LOTE, que no es delegable: el daño de un lote no es el mismo', () => {
    // ⚠️ CAMBIÓ EL CÓMO, NO EL QUÉ (`99 §ADR-100`). `ficha.lote` está declarada
    // NO DELEGABLE en el catálogo, así que sigue siendo cosa de administración:
    // un admin no se la puede regalar a un editor por la puerta de atrás.
    assert.match(lote, /puede\(\{ claims \}, 'ficha\.lote'\)/);
    assert.match(lote, /No se ha mandado nada a la\s+base/);
  });

  test('SOLO admite los campos del MODELO, y lo comprueba en la escritura', () => {
    // Una salvaguarda que vive solo en el formulario dura hasta el siguiente
    // formulario. El empotramiento depende del terreno y un terminal amarra
    // todas las fases mientras un apoyo de paso puede no amarrar ninguna:
    // copiarlos por lote es el error que el contrato prohíbe por escrito.
    assert.match(lote, /CAMPOS_DE_FICHA[\s\S]*?filter\(\(c\) => !c\.porLote/);
    assert.match(lote, /No se puede aplicar a varios apoyos/);
    assert.ok(lote.indexOf('No se puede aplicar a varios apoyos') < lote.indexOf('writeBatch(db)'),
      'se rechaza antes de armar el lote, no después');
  });

  test('SOLO RELLENA HUECOS: jamás pisa un valor ya declarado', () => {
    // Así es como se pierde un dato medido debajo de uno de catálogo. Para
    // cambiar un valor que ya está: uno a uno, mirándolo.
    assert.match(lote, /yaLoTenian\.push/);
    assert.match(lote, /datos\[k\] !== undefined && datos\[k\] !== null/);
  });

  test('es ATÓMICO y NOMBRA al apoyo que otra persona tocó', () => {
    // Si no se nombra, hay que descubrirlos de uno en uno probando.
    assert.match(lote, /writeBatch\(db\)/);
    assert.match(lote, /desfasados\.push/);
    assert.ok(lote.indexOf('desfasados.length') < lote.indexOf('writeBatch(db)'),
      'si a uno solo lo tocó otra persona, no entra ninguno');
    assert.match(lote, /Desmárquelo y vuelva a intentarlo/);
    assert.match(lote, /revision: p\.revision \+ 1/, 'cada documento avanza su propia revisión');
  });

  test('un EMPALME no entra en un lote de apoyos', () => {
    // Un empalme no sostiene el conductor y no tiene veredicto que desbloquear:
    // sellarle una carga de rotura sería inventarle un apoyo.
    assert.match(lote, /tipoPunto \?\? 'Estructura'\) !== 'Estructura'/);
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
