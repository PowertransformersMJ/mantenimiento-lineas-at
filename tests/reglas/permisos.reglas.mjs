// ============================================================================
// tests/reglas/permisos.reglas.mjs — LAS REGLAS, EJECUTADAS DE VERDAD
// ----------------------------------------------------------------------------
// `tests/usuarios-catalogo.test.js` lee `firestore.rules` como TEXTO: comprueba
// que dice lo que debe decir. Esto es lo otro, y no se sustituyen: aquí las
// reglas se CORREN contra el emulador de Firestore con tokens de verdad, y se
// mira qué pasa. Una regla puede estar escrita perfecta y denegar igualmente
// —un campo que no existe, un `in` sobre algo que no es lista— sin que ninguna
// lectura de texto lo note.
//
// NO ENTRA EN `npm test` A PROPÓSITO: no se llama `*.test.js` porque necesita
// un emulador escuchando, y una suite que solo pasa en algunas máquinas se
// convierte en una suite que nadie mira. Se corre aparte:
//
//     npm run test:reglas
//
// que levanta el emulador, corre esto y lo apaga (`firebase emulators:exec`).
//
// ⚠️ Datos SINTÉTICOS. Este repositorio es público (`L-23`): ni una coordenada,
// ni un nombre, ni un identificador reales.
// ============================================================================
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp,
} from 'firebase/firestore';

import { reclamosDe } from '../../contratos/src/usuarios.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const ORG = 'org-de-prueba';
const OTRA_ORG = 'org-ajena';
const LN = 'linea-0000-0000-0001';   // la línea de la que todos hablan
const OTRA_LN = 'linea-0000-0000-0002';

let entorno;

// ── Los tokens ──────────────────────────────────────────────────────────────
// Se construyen con `reclamosDe()` del catálogo, NO a mano: si mañana cambia
// qué trae un editor, estas pruebas cambian con él en vez de quedarse mintiendo.
const claims = (rol, lineas) => reclamosDe({ orgId: ORG, rol, lineas });

/** La sesión de alguien, con los reclamos que le tocan. */
const como = (uid, token) => entorno.authenticatedContext(uid, token).firestore();

before(async () => {
  entorno = await initializeTestEnvironment({
    projectId: 'demo-lineas-at',
    firestore: {
      rules: readFileSync(join(RAIZ, 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

after(async () => { await entorno?.cleanup(); });

beforeEach(async () => {
  await entorno.clearFirestore();
  // La siembra salta las reglas a propósito: es lo que haría el servidor con su
  // cuenta de servicio. Lo que se prueba es lo que pasa DESPUÉS, desde el
  // navegador de cada persona.
  await entorno.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const base = { orgId: ORG, creadoEn: '2026-01-01T00:00:00.000Z', creadoPor: 'servidor', revision: 0 };

    await setDoc(doc(db, 'lineas', LN), { ...base, id: LN, tipo: 'linea', nombre: 'Línea de prueba' });
    await setDoc(doc(db, 'lineas', OTRA_LN), { ...base, id: OTRA_LN, tipo: 'linea', nombre: 'Otra' });

    await setDoc(doc(db, 'apoyos', 'apoyo-1'), {
      ...base, id: 'apoyo-1', tipo: 'apoyo', lineaId: LN, orden: 1, revision: 3,
    });
    await setDoc(doc(db, 'apoyos', 'apoyo-otra-linea'), {
      ...base, id: 'apoyo-otra-linea', tipo: 'apoyo', lineaId: OTRA_LN, orden: 1, revision: 0,
    });

    // Un apoyo SIN `lineaId`. No debería existir —el molde lo exige y las 30
    // estructuras de producción lo traen—, pero es exactamente la forma de dato
    // que deja inservible una regla nueva, así que se mide en vez de suponerse.
    await setDoc(doc(db, 'apoyos', 'apoyo-sin-linea'), {
      ...base, id: 'apoyo-sin-linea', tipo: 'apoyo', orden: 1,
    });

    await setDoc(doc(db, 'evidencias', 'evidencia-1'), {
      ...base, id: 'evidencia-1', tipo: 'evidencia', lineaId: LN, subida: 'pendiente',
    });

    await setDoc(doc(db, 'auditoria_accesos', 'entrada-1'), {
      orgId: ORG, accion: 'alta', actorUid: 'servidor', en: '2026-01-01T00:00:00.000Z',
    });

    await setDoc(doc(db, 'usuarios', 'otra-persona'), {
      orgId: ORG, correo: 'otra@ejemplo.invalid', nombre: 'Otra', rol: 'cuadrilla', activo: true,
    });

    // Cargabilidad: uno emparejado con su línea y otro sin emparejar, que es el
    // caso normal recién cargado desde SCADA.
    await setDoc(doc(db, 'cargabilidad_dias', 'dia-1'), {
      ...base, id: 'dia-1', linea: 'LÍNEA DE PRUEBA', lineaId: LN, fecha: '2026-01-01', horas: {}, cargaId: 'c1',
    });
    await setDoc(doc(db, 'cargabilidad_dias', 'dia-sin-emparejar'), {
      ...base, id: 'dia-sin-emparejar', linea: 'OTRA COSA', fecha: '2026-01-02', horas: {}, cargaId: 'c1',
    });

    await setDoc(doc(db, 'llamadas_ia', 'llamada-1'), { id: 'llamada-1', orgId: ORG, uid: 'x', rol: 'admin' });
    await setDoc(doc(db, 'llamadas_ia', 'llamada-ajena'), { id: 'llamada-ajena', orgId: OTRA_ORG, uid: 'y', rol: 'admin' });
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('EL RECLAMO AUSENTE ES MÍNIMO PRIVILEGIO, NO UNA PROMOCIÓN', () => {
  test('un token con `rol: admin` pero SIN `f` no lee absolutamente nada', async () => {
    // ⚠️ ÉSTE ES EL TOKEN QUE HAY VIVO HOY: la herramienta retirada escribe
    // `orgId` y `rol`, y todavía no escribe `f` ni `l`. Es la prueba de que
    // publicar estas reglas antes de migrar el escritor de reclamos deja al
    // Ingeniero fuera de su propia herramienta — y de que lo hace CERRANDO, que
    // es el lado correcto del fallo.
    const db = como('admin-viejo', { orgId: ORG, rol: 'admin' });
    await assertFails(getDoc(doc(db, 'lineas', LN)));
    await assertFails(getDoc(doc(db, 'apoyos', 'apoyo-1')));
    await assertFails(getDoc(doc(db, 'evidencias', 'evidencia-1')));
    await assertFails(getDoc(doc(db, 'cargabilidad_dias', 'dia-1')));
  });

  test('ni escribe', async () => {
    const db = como('admin-viejo', { orgId: ORG, rol: 'admin' });
    await assertFails(updateDoc(doc(db, 'apoyos', 'apoyo-1'), { revision: 4, alturaTotal_m: 30 }));
  });

  test('un token sin ningún reclamo tampoco', async () => {
    const db = como('desconocido', {});
    await assertFails(getDoc(doc(db, 'lineas', LN)));
    await assertFails(getDoc(doc(db, 'apoyos', 'apoyo-1')));
  });

  test('y sin sesión, nada', async () => {
    const db = entorno.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'lineas', LN)));
  });

  test('un token con `f` pero SIN `l` no alcanza ninguna línea', async () => {
    // `alcanza()` exige la clave igual que `tiene()`: media migración es una
    // migración que abre.
    const { l, ...sinAlcance } = claims('admin');
    const db = como('sin-alcance', sinAlcance);
    await assertFails(getDoc(doc(db, 'apoyos', 'apoyo-1')));
    await assertFails(getDoc(doc(db, 'lineas', LN)));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('EL ALCANCE: sobre qué líneas actúa cada quien', () => {
  test('un editor con alcance TOTAL lee y edita el apoyo', async () => {
    const db = como('editor-total', claims('editor'));
    await assertSucceeds(getDoc(doc(db, 'apoyos', 'apoyo-1')));
    await assertSucceeds(updateDoc(doc(db, 'apoyos', 'apoyo-1'), { revision: 4, alturaTotal_m: 30 }));
  });

  test('un editor de OTRA línea no lee ni edita el apoyo de ésta', async () => {
    const db = como('editor-acotado', claims('editor', [OTRA_LN]));
    await assertFails(getDoc(doc(db, 'apoyos', 'apoyo-1')));
    await assertFails(updateDoc(doc(db, 'apoyos', 'apoyo-1'), { revision: 4, alturaTotal_m: 30 }));
  });

  test('pero sí el de la suya', async () => {
    const db = como('editor-acotado', claims('editor', [OTRA_LN]));
    await assertSucceeds(getDoc(doc(db, 'apoyos', 'apoyo-otra-linea')));
    await assertSucceeds(updateDoc(doc(db, 'apoyos', 'apoyo-otra-linea'), { revision: 1, alturaTotal_m: 30 }));
  });

  test('y no puede sacar un apoyo de su alcance mudándolo a otra línea', async () => {
    const db = como('editor-acotado', claims('editor', [OTRA_LN]));
    await assertFails(updateDoc(doc(db, 'apoyos', 'apoyo-otra-linea'), { revision: 1, lineaId: LN }));
  });

  test('la línea misma: el acotado ve la suya y no la ajena', async () => {
    const db = como('editor-acotado', claims('editor', [OTRA_LN]));
    await assertSucceeds(getDoc(doc(db, 'lineas', OTRA_LN)));
    await assertFails(getDoc(doc(db, 'lineas', LN)));
  });

  // ⚠️ LO QUE EL ALCANCE LE HACE A UNA CONSULTA DE LISTA. Esto no es un fallo
  // de las reglas: es cómo Firestore evalúa un `getDocs`. Se prueba para que
  // quede MEDIDO y nadie lo descubra el día que asigne el primer alcance
  // acotado y la pantalla se quede en blanco sin decir por qué.
  test('LISTA · con alcance TOTAL, la consulta de líneas sin filtro pasa', async () => {
    const db = como('editor-total', claims('editor'));
    await assertSucceeds(getDocs(query(collection(db, 'lineas'), where('orgId', '==', ORG))));
  });

  test('LISTA · con alcance ACOTADO, esa misma consulta se DENIEGA ENTERA', async () => {
    // La consulta no puede probar que solo devolverá líneas del alcance, así
    // que Firestore la niega entera — aunque una de las dos sí fuera legible.
    // Mientras la pantalla de líneas no filtre, un alcance acotado la apaga.
    const db = como('editor-acotado', claims('editor', [OTRA_LN]));
    await assertFails(getDocs(query(collection(db, 'lineas'), where('orgId', '==', ORG))));
  });

  test('LISTA · la de apoyos SÍ pasa, porque ya trae su `where(lineaId)`', async () => {
    // Es la consulta que la aplicación hace hoy (`cargarLinea`), y por eso el
    // alcance no la rompe.
    const db = como('editor-acotado', claims('editor', [OTRA_LN]));
    await assertSucceeds(getDocs(query(
      collection(db, 'apoyos'), where('orgId', '==', ORG), where('lineaId', '==', OTRA_LN),
    )));
    await assertFails(getDocs(query(
      collection(db, 'apoyos'), where('orgId', '==', ORG), where('lineaId', '==', LN),
    )));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('LAS FUNCIONES: cada quien lo suyo', () => {
  test('la cuadrilla sube evidencia', async () => {
    const db = como('cuadrilla-1', claims('cuadrilla'));
    await assertSucceeds(setDoc(doc(db, 'evidencias', 'evidencia-nueva'), {
      id: 'evidencia-nueva', tipo: 'evidencia', orgId: ORG, lineaId: LN,
      creadoEn: '2026-02-01T00:00:00.000Z', creadoPor: 'cuadrilla-1', revision: 0, subida: 'pendiente',
    }));
  });

  test('pero NO edita la ficha de un apoyo', async () => {
    const db = como('cuadrilla-1', claims('cuadrilla'));
    await assertFails(updateDoc(doc(db, 'apoyos', 'apoyo-1'), { revision: 4, alturaTotal_m: 30 }));
  });

  test('ni crea una línea', async () => {
    const db = como('cuadrilla-1', claims('cuadrilla'));
    await assertFails(setDoc(doc(db, 'lineas', 'linea-nueva'), {
      id: 'linea-nueva', tipo: 'linea', orgId: ORG, nombre: 'X',
      creadoEn: '2026-02-01T00:00:00.000Z', creadoPor: 'cuadrilla-1', revision: 0,
    }));
  });

  test('CREAR un apoyo es `cargar.puntos`: el editor ya no puede, el admin sí', async () => {
    const apoyoNuevo = (uid) => ({
      id: 'apoyo-nuevo', tipo: 'apoyo', orgId: ORG, lineaId: LN, orden: 9,
      creadoEn: '2026-02-01T00:00:00.000Z', creadoPor: uid, revision: 0,
    });
    await assertFails(setDoc(
      doc(como('editor-total', claims('editor')), 'apoyos', 'apoyo-nuevo'), apoyoNuevo('editor-total'),
    ));
    await assertSucceeds(setDoc(
      doc(como('admin-1', claims('admin')), 'apoyos', 'apoyo-nuevo'), apoyoNuevo('admin-1'),
    ));
  });

  test('el auditor lo lee todo y no escribe nada', async () => {
    const db = como('auditor-1', claims('auditor'));
    await assertSucceeds(getDoc(doc(db, 'lineas', LN)));
    await assertSucceeds(getDoc(doc(db, 'apoyos', 'apoyo-1')));
    await assertSucceeds(getDoc(doc(db, 'evidencias', 'evidencia-1')));
    await assertFails(updateDoc(doc(db, 'apoyos', 'apoyo-1'), { revision: 4, alturaTotal_m: 30 }));
    await assertFails(updateDoc(doc(db, 'evidencias', 'evidencia-1'), { subida: 'lista' }));
  });

  test('la bitácora de la IA la lee el auditor, y solo dentro de su organización', async () => {
    const db = como('auditor-1', claims('auditor'));
    await assertSucceeds(getDoc(doc(db, 'llamadas_ia', 'llamada-1')));
    await assertFails(getDoc(doc(db, 'llamadas_ia', 'llamada-ajena')));
    await assertFails(setDoc(doc(db, 'llamadas_ia', 'llamada-1'), { orgId: ORG }));
  });

  test('el editor NO lee la bitácora de la IA: no trae `ia.leer`', async () => {
    await assertFails(getDoc(doc(como('editor-total', claims('editor')), 'llamadas_ia', 'llamada-1')));
  });

  test('la cargabilidad: la escribe el admin, la lee el editor, NO la lee la cuadrilla', async () => {
    // El único cierre real de esta migración, y está declarado: el catálogo no
    // le da `cargabilidad.ver` a la cuadrilla.
    await assertSucceeds(getDoc(doc(como('editor-total', claims('editor')), 'cargabilidad_dias', 'dia-1')));
    await assertFails(getDoc(doc(como('cuadrilla-1', claims('cuadrilla')), 'cargabilidad_dias', 'dia-1')));
    await assertFails(updateDoc(
      doc(como('editor-total', claims('editor')), 'cargabilidad_dias', 'dia-1'), { fecha: '2026-01-03' },
    ));
    await assertSucceeds(updateDoc(
      doc(como('admin-1', claims('admin')), 'cargabilidad_dias', 'dia-1'), { fecha: '2026-01-03' },
    ));
  });

  test('un día SIN emparejar sigue siendo legible: `lineaId` es opcional ahí', async () => {
    // Si esto se rompiera, el tablero de cargabilidad se apagaría entero — la
    // mayoría de los días vienen de SCADA sin identificador de línea.
    await assertSucceeds(getDoc(doc(como('admin-1', claims('admin')), 'cargabilidad_dias', 'dia-sin-emparejar')));
    await assertSucceeds(getDoc(doc(como('editor-total', claims('editor')), 'cargabilidad_dias', 'dia-sin-emparejar')));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('EL PERFIL Y LA BITÁCORA DE ACCESOS', () => {
  test('nadie escribe el perfil de OTRA persona — ni el administrador', async () => {
    for (const [uid, token] of [['admin-1', claims('admin')], ['editor-total', claims('editor')]]) {
      const db = como(uid, token);
      await assertFails(updateDoc(doc(db, 'usuarios', 'otra-persona'), { rol: 'admin' }));
      await assertFails(setDoc(doc(db, 'usuarios', 'otra-persona'), { ultimoAcceso: serverTimestamp() }));
    }
  });

  test('cada quien deja su recibo, con la hora del SERVIDOR', async () => {
    const db = como('yo-mismo', claims('cuadrilla'));
    await assertSucceeds(setDoc(doc(db, 'usuarios', 'yo-mismo'), { contrasenaCambiadaEn: serverTimestamp() }));
  });

  test('y no puede fecharlo hacia atrás para tapar una orden nueva', async () => {
    const db = como('yo-mismo', claims('cuadrilla'));
    await assertFails(setDoc(doc(db, 'usuarios', 'yo-mismo'), {
      contrasenaCambiadaEn: new Date('2020-01-01T00:00:00.000Z'),
    }));
  });

  test('ni ascenderse escribiendo `rol` en su propio espejo', async () => {
    const db = como('yo-mismo', claims('cuadrilla'));
    await assertFails(setDoc(doc(db, 'usuarios', 'yo-mismo'), {
      contrasenaCambiadaEn: serverTimestamp(), rol: 'admin',
    }));
  });

  test('EL RECIBO VIEJO NO ESTORBA AL NUEVO: `ultimoAcceso` sobre un perfil ya escrito', async () => {
    // La trampa de escribir el sello mirando todo el documento en vez de solo
    // lo que cambia: el `contrasenaCambiadaEn` del mes pasado jamás va a ser
    // igual a `request.time`, y habría bloqueado todos los accesos siguientes.
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'usuarios', 'yo-mismo'), {
        orgId: ORG, correo: 'yo@ejemplo.invalid', nombre: 'Yo', rol: 'cuadrilla', activo: true,
        contrasenaCambiadaEn: new Date('2026-01-01T00:00:00.000Z'),
      });
    });
    const db = como('yo-mismo', claims('cuadrilla'));
    await assertSucceeds(updateDoc(doc(db, 'usuarios', 'yo-mismo'), { ultimoAcceso: serverTimestamp() }));
  });

  // ── LAS LÁPIDAS (`99 §ADR-100`) ──────────────────────────────────────────
  // Al BORRAR una cuenta de Auth en la limpieza inicial, este documento NO se
  // borra: el trabajador lo deja con `activo:false`, `borradoEn` y `borradoPor`,
  // con su `orgId` y su `correo`. Es lo único que impide que años de `creadoPor`
  // se conviertan en códigos sin dueño. Lo que se mide aquí es que el navegador
  // no pueda ni fabricarla ni destruirla.
  test('⚠️ el navegador NO escribe `borradoEn` ni `borradoPor` en su propio perfil', async () => {
    // Si pudiera, cualquiera fingiría que su cuenta ya está borrada —o firmaría
    // el borrado con el nombre de otro— sin que nada quedara en la bitácora.
    const db = como('yo-mismo', claims('cuadrilla'));
    await assertFails(setDoc(doc(db, 'usuarios', 'yo-mismo'), {
      contrasenaCambiadaEn: serverTimestamp(), borradoEn: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(db, 'usuarios', 'yo-mismo'), {
      contrasenaCambiadaEn: serverTimestamp(), borradoPor: 'otro',
    }));
    await assertFails(setDoc(doc(db, 'usuarios', 'yo-mismo'), {
      contrasenaCambiadaEn: serverTimestamp(), activo: false,
    }));
  });

  test('⚠️ ni la BORRA: el rastro es lo único que le devuelve el nombre a un `creadoPor`', async () => {
    const { deleteDoc } = await import('firebase/firestore');
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'usuarios', 'uid-borrado'), {
        orgId: ORG, correo: 'quien.fue@ejemplo.invalid', nombre: 'Quien Fue', rol: 'cuadrilla',
        activo: false, borradoEn: '2026-09-06T03:00:00.000Z', borradoPor: 'uid-prop',
      });
    });
    // Ni el propio interesado (si aún tuviera sesión viva) ni quien administra.
    await assertFails(deleteDoc(doc(como('uid-borrado', claims('cuadrilla')), 'usuarios', 'uid-borrado')));
    await assertFails(deleteDoc(doc(como('admin-1', claims('admin')), 'usuarios', 'uid-borrado')));
    // Y tampoco se puede resucitar desde el navegador.
    await assertFails(updateDoc(doc(como('admin-1', claims('admin')), 'usuarios', 'uid-borrado'), { activo: true }));
  });

  test('la lápida SÍ se sigue leyendo y sale en la lista de personas: por eso existe', async () => {
    // El comité midió que borrar el espejo dejaba `creadoPor` sin nombre para
    // siempre. La lápida lleva `orgId`, así que la consulta de la pantalla
    // —`where('orgId','==',…)`— la devuelve como una cuenta más, apagada.
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'usuarios', 'uid-borrado'), {
        orgId: ORG, correo: 'quien.fue@ejemplo.invalid', nombre: 'Quien Fue', rol: 'cuadrilla',
        activo: false, borradoEn: '2026-09-06T03:00:00.000Z', borradoPor: 'uid-prop',
      });
    });
    const db = como('admin-1', claims('admin'));
    await assertSucceeds(getDoc(doc(db, 'usuarios', 'uid-borrado')));
    const lista = await getDocs(query(collection(db, 'usuarios'), where('orgId', '==', ORG)));
    assert.ok(lista.docs.some((d) => d.id === 'uid-borrado'),
      'la lápida no aparece en la lista: la pantalla de personas perdería el nombre de quien fue');
  });

  test('el propio perfil se lee siempre; el ajeno solo con `usuarios.gestionar`', async () => {
    await assertSucceeds(getDoc(doc(como('otra-persona', claims('cuadrilla')), 'usuarios', 'otra-persona')));
    await assertFails(getDoc(doc(como('cuadrilla-1', claims('cuadrilla')), 'usuarios', 'otra-persona')));
    await assertSucceeds(getDoc(doc(como('admin-1', claims('admin')), 'usuarios', 'otra-persona')));
  });

  test('LISTA · la pantalla de personas consulta por organización y pasa', async () => {
    const db = como('admin-1', claims('admin'));
    await assertSucceeds(getDocs(query(collection(db, 'usuarios'), where('orgId', '==', ORG))));
    // Y sin ese `where` no pasa: es la trampa que el comentario de la regla avisa.
    await assertFails(getDocs(query(collection(db, 'usuarios'))));
  });

  test('la bitácora de accesos: el auditor la lee y NO la escribe', async () => {
    const db = como('auditor-1', claims('auditor'));
    await assertSucceeds(getDoc(doc(db, 'auditoria_accesos', 'entrada-1')));
    await assertFails(setDoc(doc(db, 'auditoria_accesos', 'entrada-2'), {
      orgId: ORG, accion: 'alta', actorUid: 'auditor-1', en: '2026-02-01T00:00:00.000Z',
    }));
    await assertFails(updateDoc(doc(db, 'auditoria_accesos', 'entrada-1'), { accion: 'restituido' }));
  });

  test('y el ADMINISTRADOR tampoco la escribe: un registro que el auditado firma no es auditoría', async () => {
    const db = como('admin-1', claims('admin'));
    await assertSucceeds(getDoc(doc(db, 'auditoria_accesos', 'entrada-1')));
    await assertFails(setDoc(doc(db, 'auditoria_accesos', 'entrada-3'), {
      orgId: ORG, accion: 'alta', actorUid: 'admin-1', en: '2026-02-01T00:00:00.000Z',
    }));
  });

  test('la cuadrilla no ve la bitácora de accesos: no trae `usuarios.auditoria`', async () => {
    await assertFails(getDoc(doc(como('cuadrilla-1', claims('cuadrilla')), 'auditoria_accesos', 'entrada-1')));
  });

  test('LISTA · la consulta EXACTA que hace la pantalla de bitácora pasa', async () => {
    // No una consulta parecida: la de `firestore.ts`, con su `where(orgId)`, su
    // `orderBy('en','desc')` y su `limit`. Una regla de lectura puede estar
    // perfecta documento a documento y tumbar la consulta entera; comprobarlo
    // con un `getDoc` y dar la pantalla por buena es el error clásico.
    const { orderBy, limit } = await import('firebase/firestore');
    const db = como('auditor-1', claims('auditor'));
    await assertSucceeds(getDocs(query(
      collection(db, 'auditoria_accesos'),
      where('orgId', '==', ORG), orderBy('en', 'desc'), limit(200),
    )));
    // Y sin el `where`, no: es lo que obliga a que la pantalla filtre.
    await assertFails(getDocs(query(
      collection(db, 'auditoria_accesos'), orderBy('en', 'desc'), limit(200),
    )));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('LO QUE YA PROTEGÍA Y NO SE PODÍA PERDER AL MIGRAR', () => {
  test('el cerrojo de revisión sigue puesto: sin revisión+1 no se guarda', async () => {
    const db = como('editor-total', claims('editor'));
    await assertFails(updateDoc(doc(db, 'apoyos', 'apoyo-1'), { revision: 3, alturaTotal_m: 30 }));
    await assertFails(updateDoc(doc(db, 'apoyos', 'apoyo-1'), { alturaTotal_m: 30 }));
    await assertSucceeds(updateDoc(doc(db, 'apoyos', 'apoyo-1'), { revision: 4, alturaTotal_m: 30 }));
  });

  test('los campos reservados no se tocan', async () => {
    const db = como('editor-total', claims('editor'));
    await assertFails(updateDoc(doc(db, 'apoyos', 'apoyo-1'), { revision: 4, orgId: OTRA_ORG }));
    await assertFails(updateDoc(doc(db, 'apoyos', 'apoyo-1'), { revision: 4, creadoPor: 'otro' }));
  });

  test('nada nace en otra organización ni suplantando autor', async () => {
    const db = como('admin-1', claims('admin'));
    const base = { id: 'apoyo-x', tipo: 'apoyo', lineaId: LN, orden: 9, creadoEn: '2026-02-01T00:00:00.000Z', revision: 0 };
    await assertFails(setDoc(doc(db, 'apoyos', 'apoyo-x'), { ...base, orgId: OTRA_ORG, creadoPor: 'admin-1' }));
    await assertFails(setDoc(doc(db, 'apoyos', 'apoyo-x'), { ...base, orgId: ORG, creadoPor: 'otro' }));
  });

  test('nadie de OTRA organización lee nada, por muchos reclamos que traiga', async () => {
    const db = como('ajeno', reclamosDe({ orgId: OTRA_ORG, rol: 'admin' }));
    await assertFails(getDoc(doc(db, 'lineas', LN)));
    await assertFails(getDoc(doc(db, 'apoyos', 'apoyo-1')));
    await assertFails(getDoc(doc(db, 'evidencias', 'evidencia-1')));
    await assertFails(getDoc(doc(db, 'auditoria_accesos', 'entrada-1')));
  });

  test('nada se borra desde el cliente, y una colección no declarada está cerrada', async () => {
    const db = como('admin-1', claims('admin'));
    const { deleteDoc } = await import('firebase/firestore');
    await assertFails(deleteDoc(doc(db, 'apoyos', 'apoyo-1')));
    await assertFails(getDoc(doc(db, 'coleccion_que_nadie_penso', 'x')));
    await assertFails(setDoc(doc(db, 'coleccion_que_nadie_penso', 'x'), { orgId: ORG }));
  });

  test('las fotos: solo avanza el estado y el pie, nunca el hash ni la ruta', async () => {
    const db = como('cuadrilla-1', claims('cuadrilla'));
    await assertSucceeds(updateDoc(doc(db, 'evidencias', 'evidencia-1'), { subida: 'lista', revision: 1 }));
    await assertFails(updateDoc(doc(db, 'evidencias', 'evidencia-1'), { rutaObjeto: 'otra/ruta.jpg' }));
  });

  test('⚠️ MEDIDO · un apoyo SIN `lineaId`: con alcance TOTAL se sigue leyendo', async () => {
    // Esto se midió porque era el riesgo grande de meter el tercer eje: donde
    // el molde EXIGE `lineaId`, la regla lo pide sin red de seguridad, y un
    // documento viejo al que le faltara el campo podría volverse invisible con
    // un «insufficient permissions» que no explica nada.
    //
    // LA MEDIDA DICE QUE NO PASA, y por una razón concreta: `alcanza()` es un
    // `||` y su lado izquierdo —`'*' in l`— es cierto sin mirar el documento,
    // así que Firestore corta ahí y nunca llega a evaluar el campo ausente.
    // Todo el mundo tiene hoy `l: ['*']`, así que el campo ausente no rompe a
    // nadie mientras no se asigne el primer alcance acotado.
    const db = como('admin-1', claims('admin'));
    await assertSucceeds(getDoc(doc(db, 'apoyos', 'apoyo-sin-linea')));
    await assertSucceeds(updateDoc(doc(db, 'apoyos', 'apoyo-sin-linea'), { revision: 1, alturaTotal_m: 30 }));
  });

  test('⚠️ MEDIDO · pero con alcance ACOTADO ese mismo apoyo se vuelve invisible', async () => {
    // Aquí no hay atajo que valga: el `||` sí tiene que mirar el documento, el
    // campo no está, la expresión falla y Firestore deniega. Es el precio real
    // del tercer eje, y es el lado correcto del fallo —cierra, no abre—, pero
    // hay que saberlo ANTES de asignarle un alcance acotado a alguien.
    const db = como('editor-acotado', claims('editor', [OTRA_LN]));
    await assertFails(getDoc(doc(db, 'apoyos', 'apoyo-sin-linea')));
  });

  test('en cambio donde el molde lo declara OPCIONAL, su ausencia no cierra nada', async () => {
    // `hipotesis` y `cargabilidad_*` usan `alcanzaSiDeclara()` justo por esto.
    const db = como('admin-1', claims('admin'));
    await assertSucceeds(getDoc(doc(db, 'cargabilidad_dias', 'dia-sin-emparejar')));
  });

  test('hallazgos y cálculos: nadie los escribe desde el navegador', async () => {
    const db = como('admin-1', claims('admin'));
    await assertFails(setDoc(doc(db, 'hallazgos', 'h1'), {
      orgId: ORG, lineaId: LN, creadoPor: 'admin-1', creadoEn: '2026-02-01T00:00:00.000Z',
    }));
    await assertFails(setDoc(doc(db, 'calculos', 'c1'), {
      orgId: ORG, lineaId: LN, creadoPor: 'admin-1', creadoEn: '2026-02-01T00:00:00.000Z',
    }));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LOS DOS CERROJOS DE `config/` (`99 §ADR-100`): ni un admin los escribe ni los
// borra desde el navegador. En Firestore dos `match` que se solapan se combinan
// con O y `write` incluye `delete`: sin la exclusión en la regla genérica, un
// admin podría borrar `config/arranque` y rearmar el arranque de un solo uso.
// ════════════════════════════════════════════════════════════════════════════
describe('los cerrojos de config/ solo los escribe el servidor', () => {
  beforeEach(async () => {
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'config', 'arranque'), { orgId: ORG, propietarioUid: 'uid-prop', en: '2026-09-06T03:00:00.000Z' });
      await setDoc(doc(db, 'config', 'limpieza'), { orgId: ORG, hecho: true });
      await setDoc(doc(db, 'config', 'operativa'), { orgId: ORG, creadoPor: 'servidor', creadoEn: '2026-01-01T00:00:00.000Z', valor: 1 });
    });
  });

  test('⚠️ un admin NO escribe ni borra config/arranque ni config/limpieza', async () => {
    const db = como('uid-admin', claims('admin', ['*']));
    const { deleteDoc } = await import('firebase/firestore');
    await assertFails(setDoc(doc(db, 'config', 'arranque'), { orgId: ORG, propietarioUid: 'uid-admin' }));
    await assertFails(updateDoc(doc(db, 'config', 'arranque'), { propietarioUid: 'uid-admin' }));
    await assertFails(deleteDoc(doc(db, 'config', 'arranque')));
    await assertFails(setDoc(doc(db, 'config', 'limpieza'), { hecho: false }));
    await assertFails(deleteDoc(doc(db, 'config', 'limpieza')));
  });

  test('…pero SÍ sigue escribiendo el resto de la configuración', async () => {
    const db = como('uid-admin', claims('admin', ['*']));
    await assertSucceeds(updateDoc(doc(db, 'config', 'operativa'), { valor: 2 }));
  });

  test('un admin puede LEER los cerrojos (para el runbook); un editor, no', async () => {
    await assertSucceeds(getDoc(doc(como('uid-admin', claims('admin', ['*'])), 'config', 'arranque')));
    await assertFails(getDoc(doc(como('uid-editor', claims('editor', ['*'])), 'config', 'arranque')));
  });

  test('el PROPIETARIO también los lee: es el techo, no un rol de adorno', async () => {
    // Si el dueño del sistema no pudiera leer el cerrojo de su propio arranque,
    // el runbook del paso 6 se quedaría a ciegas justo cuando importa.
    await assertSucceeds(getDoc(doc(como('uid-prop', claims('propietario', ['*'])), 'config', 'arranque')));
    await assertSucceeds(getDoc(doc(como('uid-prop', claims('propietario', ['*'])), 'config', 'limpieza')));
  });

  test('⚠️ DECISIÓN · el AUDITOR no los lee, y la cuadrilla tampoco', async () => {
    // Mínimo privilegio, decidido aquí y escrito en `puedeLeerCerrojo()`: lo que
    // el auditor necesita saber —que hubo un `bootstrap`, que hubo una
    // `limpieza`, quién y cuándo— está en `auditoria_accesos`, que sí lee con
    // `ua` (lo comprueba la prueba de más abajo). El cerrojo es una pieza del
    // runbook de quien administra; darle además el documento sería un permiso
    // que no le hace falta para hacer su trabajo.
    //
    // ⚠️ MEDIDO, y hay que decirlo: hoy al auditor lo para ya `tiene('ce')`
    // —`config.editar` NO es delegable, así que solo la traen propietario y
    // admin—, no el `esAdmin()` de `puedeLeerCerrojo()`. Se comprobó quitando
    // `esAdmin()` a mano: esta prueba seguía pasando. O sea que ESTO mide el
    // resultado, no la cláusula. Quien vigila la cláusula es la prueba estática
    // «quien lee un cerrojo es un ADMINISTRADOR» de `usuarios-catalogo.test.js`,
    // que sí falla al quitarla. Las dos hacen falta: el día que `ce` se volviera
    // delegable, esta de aquí sería la única que notaría la puerta abierta.
    for (const rol of ['auditor', 'cuadrilla']) {
      await assertFails(getDoc(doc(como(`uid-${rol}`, claims(rol, ['*'])), 'config', 'arranque')));
      await assertFails(getDoc(doc(como(`uid-${rol}`, claims(rol, ['*'])), 'config', 'limpieza')));
    }
  });

  test('y un admin de OTRA organización no los lee: el cerrojo lleva `orgId`', async () => {
    const db = como('ajeno', reclamosDe({ orgId: OTRA_ORG, rol: 'admin' }));
    await assertFails(getDoc(doc(db, 'config', 'arranque')));
    await assertFails(getDoc(doc(db, 'config', 'limpieza')));
  });

  test('⚠️ tampoco los CREA quien los borró primero: no hay rearme por la puerta de atrás', async () => {
    // El daño concreto: `config/arranque` es el cerrojo de un solo uso del
    // `/bootstrap`. Quien consiga borrarlo o reescribirlo se corona propietario
    // en la siguiente llamada. Por eso se prueba también con el documento
    // AUSENTE, que es el estado en el que un `create` sí tendría sentido.
    const { deleteDoc } = await import('firebase/firestore');
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), 'config', 'arranque'));
    });
    const db = como('uid-admin', claims('admin', ['*']));
    await assertFails(setDoc(doc(db, 'config', 'arranque'), { orgId: ORG, propietarioUid: 'uid-admin' }));
  });

  test('un token sin f no lee ni escribe nada de config, tampoco los cerrojos', async () => {
    const db = como('uid-viejo', { orgId: ORG, rol: 'admin' });
    await assertFails(getDoc(doc(db, 'config', 'operativa')));
    await assertFails(getDoc(doc(db, 'config', 'arranque')));
    await assertFails(updateDoc(doc(db, 'config', 'operativa'), { valor: 3 }));
  });
});
