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
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp,
  writeBatch,
} from 'firebase/firestore';

import { reclamosDe } from '../../contratos/src/usuarios.ts';
// Los moldes, para que los documentos de prueba NO puedan divergir de la forma
// real: lo que aquí se escribe se valida antes contra el contrato (ver el bloque
// `§ADR-133`). Un fixture que la aplicación no podría leer deja la prueba verde
// midiendo algo que nunca va a pasar.
import { Linea, TramoCompartidoEnLinea } from '../../contratos/src/activos.ts';
import { Levantamiento, PuntoLevantado } from '../../contratos/src/levantamiento.ts';

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

// ============================================================================
// EL ESPECTADOR — el barrido, porque «no escribe nada» hay que PROBARLO ENTERO
// ----------------------------------------------------------------------------
// Ya existía «el auditor lo lee todo y no escribe nada», y probaba DOS
// escrituras: un apoyo y una evidencia. Para prometerle al Ingeniero que una
// persona «no puede modificar absolutamente nada», dos no bastan: basta con que
// una sola de las veintidós colecciones tenga una regla más floja para que la
// promesa sea falsa, y ninguna lectura de texto lo garantiza.
//
// Esto barre TODAS las colecciones que gobiernan las reglas, con el token de
// solo lectura, e intenta CREAR y BORRAR en cada una. Y se protege del olvido:
// la primera prueba compara la lista con `firestore.rules`, así que una
// colección nueva sin cubrir pone la prueba en rojo en vez de pasar en silencio.
// ============================================================================
describe('EL ESPECTADOR: un token de solo lectura no escribe en NINGUNA colección', () => {
  const COLECCIONES = [
    'lineas', 'apoyos', 'levantamientos', 'hipotesis', 'inspecciones', 'evidencias', 'investigaciones',
    'analisis', 'acciones_capa', 'sondeos_clima', 'hallazgos', 'calculos', 'solicitudes_ia',
    'sugerencias', 'llamadas_ia', 'config', 'usuarios', 'auditoria_accesos',
    'cargabilidad_dias', 'cargabilidad_resumenes', 'cargabilidad_cargas',
  ];

  test('el barrido cubre TODAS las colecciones de firestore.rules (si no, esta prueba se cae)', () => {
    const reglas = readFileSync(join(RAIZ, 'firestore.rules'), 'utf8');
    // `databases` es el envoltorio `match /databases/{database}/documents`, no una
    // colección: se descuenta a mano y se dice, para que nadie lo confunda con una
    // exclusión de conveniencia.
    const enReglas = [...new Set([...reglas.matchAll(/^\s*match \/([a-z_]+)\/\{/gm)].map((m) => m[1]))]
      .filter((c) => c !== 'databases');
    const sinCubrir = enReglas.filter((c) => !COLECCIONES.includes(c));
    assert.deepEqual(sinCubrir, [],
      `colecciones con reglas que este barrido NO prueba: ${sinCubrir.join(', ')}`);
    assert.ok(enReglas.length >= 20, 'se leyeron menos match de los que hay: revisar el patrón');
  });

  test('CREAR falla en todas, con alcance total y todo', async () => {
    const db = como('espectador-1', claims('auditor'));
    for (const c of COLECCIONES) {
      await assertFails(setDoc(doc(db, c, 'intento-del-espectador'), {
        orgId: ORG, lineaId: LN, id: 'intento-del-espectador', valor: 1,
      }));
    }
  });

  test('BORRAR falla en todas', async () => {
    const db = como('espectador-1', claims('auditor'));
    for (const c of COLECCIONES) await assertFails(deleteDoc(doc(db, c, 'intento-del-espectador')));
    // Y sobre lo que SÍ existe, que es donde de verdad dolería:
    await assertFails(deleteDoc(doc(db, 'lineas', LN)));
    await assertFails(deleteDoc(doc(db, 'apoyos', 'apoyo-1')));
    await assertFails(deleteDoc(doc(db, 'evidencias', 'evidencia-1')));
    await assertFails(deleteDoc(doc(db, 'auditoria_accesos', 'entrada-1')));
    await assertFails(deleteDoc(doc(db, 'cargabilidad_dias', 'dia-1')));
  });

  test('EDITAR lo que existe falla, incluida la ficha de otra persona', async () => {
    const db = como('espectador-1', claims('auditor'));
    await assertFails(updateDoc(doc(db, 'lineas', LN), { nombre: 'renombrada por el espectador' }));
    await assertFails(updateDoc(doc(db, 'apoyos', 'apoyo-1'), { alturaTotal_m: 99 }));
    await assertFails(updateDoc(doc(db, 'evidencias', 'evidencia-1'), { subida: 'lista' }));
    await assertFails(updateDoc(doc(db, 'cargabilidad_dias', 'dia-1'), { pico_A: 1 }));
    await assertFails(updateDoc(doc(db, 'usuarios', 'otra-persona'), { rol: 'admin' }));
    await assertFails(updateDoc(doc(db, 'auditoria_accesos', 'entrada-1'), { accion: 'borrada' }));
  });

  test('⚠️ LA ÚNICA EXCEPCIÓN, y se declara en vez de esconderse: el recibo de su propia entrada', async () => {
    // El espectador escribe UNA cosa en todo el sistema: la marca de hora de su
    // propio acceso, en su propia ficha. No es contenido — es lo que permite que
    // la bitácora diga quién entró y cuándo. Que sea la única se prueba aquí:
    // cualquier otro campo, en su propia ficha, se cae.
    const db = como('espectador-1', claims('auditor'));
    await assertSucceeds(setDoc(doc(db, 'usuarios', 'espectador-1'),
      { ultimoAcceso: serverTimestamp() }, { merge: true }));
    await assertFails(setDoc(doc(db, 'usuarios', 'espectador-1'),
      { rol: 'admin' }, { merge: true }));
    await assertFails(setDoc(doc(db, 'usuarios', 'espectador-1'),
      { lineas: ['*'] }, { merge: true }));
    await assertFails(setDoc(doc(db, 'usuarios', 'espectador-1'),
      { nombre: 'me cambio el nombre' }, { merge: true }));
    await assertFails(deleteDoc(doc(db, 'usuarios', 'espectador-1')));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL DOCUMENTO QUE NO EXISTE (`99 §ADR-108`)
// ----------------------------------------------------------------------------
// ⚠️ ESTO NO ES UN CASO DE BORDE: es el patrón normal de «¿esto ya estaba?»
// antes de crear, y estuvo apagando el guardado de PARÁMETROS ELÉCTRICOS entero
// sin que nada lo dijera. En un `get` por identificador de un documento que
// todavía no está, Firestore deja `resource` en **null**; leer `resource.data`
// ahí no da «falso», da un ERROR de evaluación que tumba la regla completa y
// devuelve `permission-denied`. O sea: el sistema contestaba «no tienes
// permiso» cuando la verdad era «no existe».
//
// Por qué las pruebas de antes no lo cazaron: TODAS leían documentos sembrados
// en `beforeEach`. La ausencia nunca se probó. Por eso este bloque lee a
// propósito identificadores que no existen, y por eso barre todas las
// colecciones en vez de arreglar solo la que dolió.
// ════════════════════════════════════════════════════════════════════════════
describe('LEER LO QUE NO EXISTE: «no hay nada» no puede contestarse «no puedes»', () => {
  const COLECCIONES = [
    'lineas', 'apoyos', 'levantamientos', 'hipotesis', 'inspecciones', 'evidencias', 'investigaciones',
    'analisis', 'acciones_capa', 'sondeos_clima', 'hallazgos', 'calculos', 'solicitudes_ia',
    'sugerencias', 'llamadas_ia', 'config', 'usuarios', 'auditoria_accesos',
    'cargabilidad_dias', 'cargabilidad_resumenes', 'cargabilidad_cargas',
  ];

  test('el propietario puede preguntar por un identificador inexistente en CUALQUIER colección', async () => {
    const db = como('propietario-1', claims('propietario'));
    for (const c of COLECCIONES) {
      await assertSucceeds(getDoc(doc(db, c, 'esto-no-existe-en-ninguna-parte')));
    }
  });

  test('y también los cerrojos de arranque, que se leen ANTES de que existan', async () => {
    // La pantalla de arranque pregunta por `config/arranque` justo cuando aún no
    // se ha arrancado nada: si eso denegara, el sistema no podría arrancar.
    const db = como('propietario-1', claims('propietario'));
    await assertSucceeds(getDoc(doc(db, 'config', 'arranque')));
    await assertSucceeds(getDoc(doc(db, 'config', 'limpieza')));
  });

  test('⚠️ permitir la ausencia NO abre lo que SÍ existe: la cuadrilla sigue fuera', async () => {
    // El arreglo toca la rama `resource == null`. Lo que existe se comprueba
    // igual que siempre, y esto lo fija: si alguien «simplificara» la regla
    // quitando la comprobación de organización, esta prueba se pone roja.
    const db = como('cuadrilla-1', claims('cuadrilla'));
    await assertFails(getDoc(doc(db, 'cargabilidad_dias', 'dia-1')));
    await assertSucceeds(getDoc(doc(db, 'apoyos', 'apoyo-1')));
    // Y un token SIN funciones no lee ni la ausencia: mínimo privilegio primero.
    const pelado = como('sin-nada', { orgId: ORG, rol: 'admin' });
    await assertFails(getDoc(doc(pelado, 'cargabilidad_dias', 'esto-no-existe')));
  });

  test('el de OTRA organización tampoco: ni lo que hay ni lo que no', async () => {
    const ajeno = como('ajeno-1', reclamosDe({ orgId: OTRA_ORG, rol: 'propietario' }));
    await assertFails(getDoc(doc(ajeno, 'cargabilidad_dias', 'dia-1')));
    // La ausencia sí se le contesta —no hay dato ajeno que enseñar, porque no
    // hay dato—, y es la contrapartida honesta de la decisión: lo que se
    // transmite es «aquí no hay nada», nunca el contenido de otra organización.
    await assertSucceeds(getDoc(doc(ajeno, 'cargabilidad_dias', 'esto-no-existe')));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GUARDAR UNA CARGA DE VERDAD, PASO POR PASO (`99 §ADR-108`)
// ----------------------------------------------------------------------------
// Reproduce `web/src/datos/cargabilidadRepo.guardarCarga` en el mismo orden que
// corre en el navegador: el rastro primero, después la pregunta de «¿ya
// estaba?» sobre cada día, y por último el lote. Se prueba SOBRE BASE VACÍA —
// que es la primera carga del Ingeniero, el caso que fallaba.
// ════════════════════════════════════════════════════════════════════════════
describe('GUARDAR UNA CARGA: el camino completo, sobre base vacía', () => {
  const UID = 'propietario-1';
  const base = (extra) => ({
    orgId: ORG, creadoEn: '2026-01-01T00:00:00.000Z', creadoPor: UID, revision: 0, ...extra,
  });

  test('el rastro, la comprobación y el lote — los tres pasos, seguidos', async () => {
    const db = como(UID, claims('propietario'));

    // 1 · el rastro se escribe PRIMERO, a propósito (ver el repositorio).
    await assertSucceeds(setDoc(doc(db, 'cargabilidad_cargas', 'carga-1'),
      base({ id: 'carga-1', lineas: ['LN-627'], estado: 'guardada' })));

    // 2 · ¿ya estaba este día? Sobre base vacía, NO. Aquí es donde moría.
    await assertSucceeds(getDoc(doc(db, 'cargabilidad_dias', `${ORG}__ln-627__-__2026-01-01`)));

    // 3 · el día y su resumen, en un lote como los escribe el repositorio.
    const lote = writeBatch(db);
    lote.set(doc(db, 'cargabilidad_dias', `${ORG}__ln-627__-__2026-01-01`),
      base({ id: 'x', linea: 'LN-627', fecha: '2026-01-01', horas: {}, cargaId: 'carga-1' }));
    lote.set(doc(db, 'cargabilidad_resumenes', `${ORG}__ln-627__2026-01-01`),
      base({ id: 'y', linea: 'LN-627', fecha: '2026-01-01' }));
    await assertSucceeds(lote.commit());
  });

  test('volver a cargar el mismo día lo REEMPLAZA, no lo duplica ni se cae', async () => {
    const db = como(UID, claims('propietario'));
    const id = `${ORG}__ln-627__-__2026-01-01`;
    await assertSucceeds(setDoc(doc(db, 'cargabilidad_dias', id),
      base({ id, linea: 'LN-627', fecha: '2026-01-01', horas: {}, cargaId: 'c1' })));
    await assertSucceeds(getDoc(doc(db, 'cargabilidad_dias', id)));   // ahora SÍ existe
    // La corrección conserva la partida de nacimiento y firma la ACTUALIZACIÓN.
    await assertSucceeds(setDoc(doc(db, 'cargabilidad_dias', id), base({
      id, linea: 'LN-627', fecha: '2026-01-01', horas: {}, cargaId: 'c2',
      revision: 1, actualizadoEn: '2026-01-02T10:00:00.000Z', actualizadoPor: UID,
    })));
  });

  test('⚠️ y la reescritura NO puede pisar `creadoEn` — el fallo que costó una tarde', async () => {
    // El repositorio estampaba `creadoEn: ahora` en CADA guardado, así que la
    // segunda carga del mismo día se denegaba siempre, con el mismo mensaje de
    // permisos que no dice nada (`99 §ADR-111`). La prueba anterior no lo cazaba
    // porque reescribía con la MISMA hora: sin un instante distinto, el `diff`
    // de la regla no ve nada que proteger. Aquí se reescribe con otra.
    const db = como(UID, claims('propietario'));
    const id = `${ORG}__ln-627__-__2026-01-02`;
    await assertSucceeds(setDoc(doc(db, 'cargabilidad_dias', id),
      base({ id, linea: 'LN-627', fecha: '2026-01-02', horas: {}, cargaId: 'c1' })));

    const conOtraFechaDeAlta = {
      ...base({ id, linea: 'LN-627', fecha: '2026-01-02', horas: {}, cargaId: 'c2' }),
      creadoEn: '2026-06-30T23:59:59.000Z',
    };
    await assertFails(setDoc(doc(db, 'cargabilidad_dias', id), conOtraFechaDeAlta));

    // Ni el autor: quien corrige un día no se convierte en quien lo trajo.
    await assertFails(setDoc(doc(db, 'cargabilidad_dias', id), {
      ...base({ id, linea: 'LN-627', fecha: '2026-01-02', horas: {}, cargaId: 'c3' }),
      creadoPor: 'otro-uid',
    }));
  });

  test('lo mismo en el RESUMEN: es el otro documento que se reescribe cada carga', async () => {
    const db = como(UID, claims('propietario'));
    const id = `${ORG}__ln-627__2026-01-03`;
    await assertSucceeds(setDoc(doc(db, 'cargabilidad_resumenes', id),
      base({ id, linea: 'LN-627', fecha: '2026-01-03' })));
    await assertFails(setDoc(doc(db, 'cargabilidad_resumenes', id), {
      ...base({ id, linea: 'LN-627', fecha: '2026-01-03' }),
      creadoEn: '2026-06-30T23:59:59.000Z',
    }));
    await assertSucceeds(setDoc(doc(db, 'cargabilidad_resumenes', id), base({
      id, linea: 'LN-627', fecha: '2026-01-03', horasConDato: 24,
      revision: 1, actualizadoEn: '2026-01-04T10:00:00.000Z', actualizadoPor: UID,
    })));
  });

  test('y el editor sigue sin poder guardar: esto lo escribe un administrador', async () => {
    const db = como('editor-total', claims('editor'));
    await assertFails(setDoc(doc(db, 'cargabilidad_cargas', 'carga-del-editor'),
      { orgId: ORG, creadoEn: '2026-01-01T00:00:00.000Z', creadoPor: 'editor-total', revision: 0, id: 'z' }));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// UNA TORRE, DOS LÍNEAS · Y EL LEVANTAMIENTO QUE TODAVÍA NO ES NINGUNA TORRE
// (`99 §ADR-133`)
// ----------------------------------------------------------------------------
// Dos cosas distintas, y se prueban juntas porque llegan juntas:
//
//   1. Una línea DECLARA qué tramo compartido recorre, y las torres de ese tramo
//      se registran UNA vez a nombre del tramo. Lo que se mide aquí es que eso
//      NO necesitó aflojar ni una regla: el identificador de la serie viaja por
//      el mismo campo y por la misma puerta que hoy.
//   2. Mientras nadie declare la función de cada punto, el recorrido del GPS se
//      guarda TAL CUAL en `levantamientos`, que sí es colección nueva. Un punto
//      de un levantamiento NO es una torre: no tiene función, no calcula nada y
//      va rotulado «sin registrar como torres».
//
// ⚠️ Códigos, identificadores y coordenadas INVENTADOS. El repositorio es
// público (`L-23`): aquí no entra ni un nombre de línea, de tramo o de
// subestación reales. En el libro de códigos del sistema estos serían «LX-1» y
// «TR-9».
// ════════════════════════════════════════════════════════════════════════════
// ── Los identificadores ─────────────────────────────────────────────────────
// SON UUID, como manda `contratos/src/comunes.ts §Id`, y no rótulos legibles: un
// documento cuyo `id` no es UUID lo DESCARTA EN SILENCIO la aplicación al leerlo
// (`web/src/datos/firestore.ts`), así que un fixture así deja la prueba en verde
// midiendo un alta que en la pantalla no existe.
//
// Inventados dígito a dígito y conformes a RFC-4122 —el `4` del tercer grupo es
// la versión y el `8` del cuarto la variante—: si mañana el molde aprieta la
// comprobación de UUID (hoy la de zod 3.22 es laxa), estos siguen valiendo.
const TRAMO = '00000009-0000-4000-8000-000000000009';    // «TR-9», el tramo que recorren dos líneas
const LINEA_A = '00000011-0000-4000-8000-000000000011';  // «LX-1», la que entra sin torres
const LEV = '00000101-0000-4000-8000-000000000101';
const LEV_DE_LINEA = '00000102-0000-4000-8000-000000000102';  // el de una línea, no el de un tramo
const LEV_AJENO = '00000103-0000-4000-8000-000000000103';     // el de la otra organización
const LEV_NUEVO = '00000104-0000-4000-8000-000000000104';     // el que se intenta crear
const LEV_DEL_ALTA = '00000105-0000-4000-8000-000000000105';  // el que entra en el lote del alta
const LEV_CON_NOTA_ROTA = '00000106-0000-4000-8000-000000000106';  // sembrado por el servidor con la nota de otro tipo

/**
 * Un punto del GPS, tal y como lo trae el archivo: sin función, no es torre.
 * Los valores son inventados (0,1° de latitud y longitud cae en medio del
 * Atlántico) y **la forma la impone el molde**: `PuntoLevantado.parse` corre
 * aquí mismo, así que un punto que la aplicación rechazaría no llega a escribirse.
 */
const punto = (n) => PuntoLevantado.parse({
  nombreCampo: `9 E0${n}`, lat: 0.1 + n / 1000, lon: 0.1 + n / 1000, ele: 10 + n,
  instante: `2026-02-09T${String(n % 24).padStart(2, '0')}:00:00.000Z`,
});

/**
 * LA DECLARACIÓN DE QUE UNA LÍNEA RECORRE EL TRAMO, con la forma real.
 *
 * `id` (no `tramoId`) es el UUID del tramo y `codigo` su rótulo: son los dos
 * campos que `TramoCompartidoEnLinea` exige, y el molde es `strict`, así que una
 * clave mal escrita revienta AQUÍ en vez de escribirse y desaparecer al leer.
 * `procedencia` sale de la lista cerrada de `comunes.ts §Procedencia`: un tramo
 * declarado desde un plano es `documento_proyecto`.
 */
const tramoDeclarado = (uid, en = '2026-02-01T00:00:00.000Z') => TramoCompartidoEnLinea.parse({
  id: TRAMO, codigo: 'TR-9',
  procedencia: 'documento_proyecto', fuente: 'plano inventado de prueba',
  declaradoEn: en, declaradoPor: uid,
});

/**
 * LA LÍNEA DEL ALTA, tal y como la escribe la pantalla: validada contra `Linea`
 * antes de salir de aquí.
 *
 * Que el documento pase las reglas no dice nada de si la aplicación puede
 * leerlo: las reglas de `lineas` no miran ni un campo del molde. Por eso el
 * `parse` — sin él, renombrar un campo del contrato dejaría esta prueba en verde
 * y la pantalla en blanco (`32 · L-67`: lo que no valida se descarta sin avisar).
 */
const lineaNueva = (uid, extra = {}) => Linea.parse({
  id: LINEA_A, tipo: 'linea', orgId: ORG,
  codigo: 'LX-1', nombre: 'Línea inventada de prueba',
  tensionNominal_kV: 66, circuitos: 1,
  creadoEn: '2026-02-01T00:00:00.000Z', creadoPor: uid, revision: 0,
  tramosCompartidos: [tramoDeclarado(uid)],
  ...extra,
});

describe('§ADR-133 · LA LÍNEA QUE DECLARA UN TRAMO Y ENTRA SIN TORRES', () => {
  test('crear la línea con `tramosCompartidos` NO necesita ninguna regla nueva', async () => {
    // La regla de `lineas` no mira ningún campo del documento salvo los
    // reservados, así que un campo nuevo del molde entra por la misma puerta.
    // Se prueba porque «no hace falta tocar nada» es exactamente la frase que
    // hay que MEDIR antes de decirla (§3.2).
    const db = como('editor-total', claims('editor'));
    await assertSucceeds(setDoc(doc(db, 'lineas', LINEA_A), lineaNueva('editor-total')));
    const leida = await getDoc(doc(db, 'lineas', LINEA_A));
    assert.equal(leida.data().tramosCompartidos.length, 1,
      'el campo del tramo no sobrevivió a la escritura: la línea se vería sin torres');
    assert.equal(leida.data().tramosCompartidos[0].id, TRAMO);
    // Y lo que quedó ESCRITO lo acepta el molde: es lo único que demuestra que la
    // pantalla podrá enseñarla. Pasar las reglas y ser ilegible son compatibles.
    assert.doesNotThrow(() => Linea.parse(leida.data()),
      'la línea se guardó, pero la aplicación la descartaría al leerla');
  });

  test('…y SIN conductor, SIN hipótesis y SIN un solo apoyo colgando', async () => {
    // El alta de hoy es así a propósito: él entrega conductor e hipótesis
    // después. Si la base exigiera algo de eso, la línea no podría nacer.
    const db = como('editor-total', claims('editor'));
    await assertSucceeds(setDoc(doc(db, 'lineas', LINEA_A), lineaNueva('editor-total')));
    // Y preguntar por sus apoyos contesta «no hay», que no es lo mismo que «no
    // puedes»: la pantalla tiene que poder decir qué le falta.
    const s = await getDocs(query(
      collection(db, 'apoyos'), where('orgId', '==', ORG), where('lineaId', '==', LINEA_A),
    ));
    assert.equal(s.size, 0, 'la línea recién creada no debería tener apoyos');
  });

  test('declarar el tramo DESPUÉS, sobre una línea que ya existía, tampoco', async () => {
    const db = como('editor-total', claims('editor'));
    await assertSucceeds(updateDoc(doc(db, 'lineas', LN), {
      tramosCompartidos: [tramoDeclarado('editor-total')],
      recorridoCompleto: false,
    }));
  });

  test('y lo de siempre sigue en pie: no la crea quien no edita líneas, y nadie la borra', async () => {
    await assertFails(setDoc(
      doc(como('cuadrilla-1', claims('cuadrilla')), 'lineas', LINEA_A), lineaNueva('cuadrilla-1'),
    ));
    await assertFails(deleteDoc(doc(como('admin-1', claims('admin')), 'lineas', LN)));
  });
});

describe('§ADR-133 · EL APOYO A NOMBRE DEL TRAMO: `lineaId` se lee «id de la serie»', () => {
  const apoyoDelTramo = (uid) => ({
    id: 'apoyo-del-tramo', tipo: 'apoyo', orgId: ORG, lineaId: TRAMO, orden: 7,
    creadoEn: '2026-02-01T00:00:00.000Z', creadoPor: uid, revision: 0,
  });

  test('crear un apoyo con `lineaId` = id del TRAMO pasa con el alcance de hoy', async () => {
    // `alcanza()` compara un identificador contra la lista del token sin
    // preguntar de qué es, y todo el mundo trae hoy `l: ['*']`.
    const db = como('admin-1', claims('admin'));
    await assertSucceeds(setDoc(doc(db, 'apoyos', 'apoyo-del-tramo'), apoyoDelTramo('admin-1')));
  });

  test('y se lista por el tramo con la consulta EXACTA de hoy', async () => {
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'apoyos', 'apoyo-del-tramo'), apoyoDelTramo('servidor'));
    });
    const { orderBy } = await import('firebase/firestore');
    const db = como('editor-total', claims('editor'));
    const s = await getDocs(query(
      collection(db, 'apoyos'),
      where('orgId', '==', ORG), where('lineaId', '==', TRAMO), orderBy('orden', 'asc'),
    ));
    assert.equal(s.size, 1, 'la torre del tramo no sale en la consulta por serie');
    // Misma FORMA que la consulta de una línea cualquiera: cambia el valor, no
    // la consulta. Por eso el índice `(orgId, lineaId, orden)` que ya existe la
    // cubre y no hizo falta declarar ninguno nuevo.
  });

  test('la ficha de esa torre se guarda UNA vez, con el mismo cerrojo de revisión', async () => {
    // Es el corazón de «una torre, dos líneas»: el MISMO documento desde las dos
    // líneas, y el cerrojo impidiendo que el guardado de una pise el de la otra.
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'apoyos', 'apoyo-del-tramo'), apoyoDelTramo('servidor'));
    });
    const db = como('editor-total', claims('editor'));
    await assertFails(updateDoc(doc(db, 'apoyos', 'apoyo-del-tramo'), { alturaTotal_m: 30 }));
    await assertSucceeds(updateDoc(doc(db, 'apoyos', 'apoyo-del-tramo'), {
      revision: 1, alturaTotal_m: 30, circuitosTendidos: 2,
    }));
  });

  test('⚠️ HUECO CONOCIDO · una cuenta con alcance ACOTADO a sus líneas NO ve el tramo', async () => {
    // Y hay que saberlo ANTES de acotarle el alcance a alguien: el tramo es una
    // serie propia, así que su identificador tiene que estar en la lista de esa
    // persona. No se tapa inventando una regla con «o»: se declara y se arregla
    // donde se decide el alcance, en Personas.
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'apoyos', 'apoyo-del-tramo'), apoyoDelTramo('servidor'));
    });
    const acotado = como('editor-acotado', claims('editor', [LN]));
    await assertFails(getDoc(doc(acotado, 'apoyos', 'apoyo-del-tramo')));
    await assertFails(getDocs(query(
      collection(acotado, 'apoyos'), where('orgId', '==', ORG), where('lineaId', '==', TRAMO),
    )));
    // Y con el identificador del tramo en su alcance, sí: el remedio existe y es
    // el mismo de siempre, sin tocar las reglas.
    const conTramo = como('editor-con-tramo', claims('editor', [LN, TRAMO]));
    await assertSucceeds(getDoc(doc(conTramo, 'apoyos', 'apoyo-del-tramo')));
    await assertSucceeds(getDocs(query(
      collection(conTramo, 'apoyos'), where('orgId', '==', ORG), where('lineaId', '==', TRAMO),
    )));
  });
});

describe('§ADR-133 · EL LEVANTAMIENTO: se guarda tal cual, y ningún punto se reescribe', () => {
  // La forma es la del molde (`contratos/src/levantamiento.ts`): la jornada, el
  // archivo con su huella, los puntos y la nota. Las reglas no validan el molde
  // —eso lo hace el contrato—, y por eso el documento pasa por `Levantamiento.parse`
  // ANTES de escribirse: si lo que se guarda aquí no es lo que la aplicación lee,
  // esta prueba mide un alta que en la pantalla no existe.
  const levantamiento = (uid, extra = {}) => Levantamiento.parse({
    id: LEV, tipo: 'levantamiento', orgId: ORG, serieId: TRAMO, codigoSerie: 'TR-9',
    fecha: '2026-02-09', aparato: 'GPS de mano',
    archivo: { nombre: 'recorrido-inventado.gpx', huella: 'a'.repeat(64) },
    cargadoEn: '2026-02-10T00:00:00.000Z', cargadoPor: uid,
    puntos: [punto(7), punto(8)],
    creadoEn: '2026-02-10T00:00:00.000Z', creadoPor: uid, revision: 0,
    ...extra,
  });

  beforeEach(async () => {
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'levantamientos', LEV), levantamiento('servidor'));
      // Uno de una LÍNEA (no de un tramo): la colección sirve para las dos cosas.
      // Se anota a `LINEA_A` —«LX-1»— y no a la línea de siempre porque `serieId`
      // es un UUID del molde y la de siempre es un rótulo: el alcance que se mide
      // abajo es el mismo, y el documento sí es legible.
      await setDoc(doc(db, 'levantamientos', LEV_DE_LINEA),
        levantamiento('servidor', { id: LEV_DE_LINEA, serieId: LINEA_A, codigoSerie: 'LX-1' }));
      // Y uno de otra organización, para el barrido de siempre.
      await setDoc(doc(db, 'levantamientos', LEV_AJENO),
        levantamiento('servidor', { id: LEV_AJENO, orgId: OTRA_ORG }));
    });
  });

  // ── CREAR ────────────────────────────────────────────────────────────────
  test('lo crea quien CARGA PUNTOS, y nadie más: es el mismo acto que crear apoyos', async () => {
    const nuevo = (uid) => levantamiento(uid, { id: LEV_NUEVO });
    await assertFails(setDoc(
      doc(como('editor-total', claims('editor')), 'levantamientos', LEV_NUEVO), nuevo('editor-total'),
    ));
    await assertFails(setDoc(
      doc(como('cuadrilla-1', claims('cuadrilla')), 'levantamientos', LEV_NUEVO), nuevo('cuadrilla-1'),
    ));
    await assertSucceeds(setDoc(
      doc(como('admin-1', claims('admin')), 'levantamientos', LEV_NUEVO), nuevo('admin-1'),
    ));
  });

  test('no nace en otra organización, ni suplantando autor, ni SIN serie', async () => {
    const db = como('admin-1', claims('admin'));
    await assertFails(setDoc(doc(db, 'levantamientos', LEV_NUEVO),
      levantamiento('admin-1', { id: LEV_NUEVO, orgId: OTRA_ORG })));
    await assertFails(setDoc(doc(db, 'levantamientos', LEV_NUEVO),
      levantamiento('otro-uid', { id: LEV_NUEVO })));
    // ⚠️ SIN `serieId` NO ENTRA, y esta línea se ganó midiendo: con el alcance
    // que trae hoy todo el mundo (`l: ['*']`), `alcanza()` corta por el lado
    // izquierdo del `||` y NUNCA mira el campo que falta, así que el documento
    // huérfano se creaba tan tranquilo. Por eso la regla lo exige aparte
    // (`levantamientoCoherente()`). Si alguien «simplifica» quitándolo, esta
    // prueba se pone roja.
    //
    // Los dos documentos rotos se construyen VÁLIDOS y se rompen después, a
    // propósito: el molde no los dejaría nacer así, y lo que se mide aquí es la
    // regla, no el molde.
    const { serieId, ...sinSerie } = levantamiento('admin-1', { id: LEV_NUEVO });
    await assertFails(setDoc(doc(db, 'levantamientos', LEV_NUEVO), sinSerie));
    await assertFails(setDoc(doc(db, 'levantamientos', LEV_NUEVO),
      { ...levantamiento('admin-1', { id: LEV_NUEVO }), serieId: '' }));
  });

  test('⚠️ NI CON LA NOTA O LA REVISIÓN DE OTRO TIPO: aquí no se borra, así que no se deja nacer', async () => {
    // POR QUÉ ESTO SE MIDE EN EL ALTA Y NO SOLO EN LA EDICIÓN. Un levantamiento
    // con la nota de otro tipo lo DESCARTA el lector de la aplicación entero,
    // con sus puntos dentro, y sin decir nada. No se puede borrar
    // (`delete: if false`) y se queda congelado: solo lo salva escribir encima
    // de la nota misma, y para eso hay que saber que ese recorrido está ahí —
    // que es justo lo que la pantalla no puede decir. Medido abajo, documento a
    // documento. Nace bien o no nace.
    //
    // Los documentos rotos se construyen VÁLIDOS y se rompen DESPUÉS del
    // `parse`, como los de arriba: el molde no los dejaría nacer así, y lo que
    // se mide aquí es la regla, no el molde.
    const db = como('admin-1', claims('admin'));
    const bueno = levantamiento('admin-1', { id: LEV_NUEVO });
    for (const notaMala of [7, true, ['una', 'lista'], { texto: 'un objeto' }]) {
      await assertFails(setDoc(doc(db, 'levantamientos', LEV_NUEVO), { ...bueno, nota: notaMala }));
    }
    for (const revisionMala of ['0', 1.5, null]) {
      await assertFails(setDoc(doc(db, 'levantamientos', LEV_NUEVO), { ...bueno, revision: revisionMala }));
    }
    // Y la nota de verdad —texto— entra sin estorbo: lo que se cierra es el
    // tipo, no el campo.
    await assertSucceeds(setDoc(doc(db, 'levantamientos', LEV_NUEVO),
      levantamiento('admin-1', { id: LEV_NUEVO, nota: 'faltan los puntos E01 a E06: se levantaron otro día' })));
  });

  test('EL ALTA COMPLETA, como la escribe la pantalla: la línea y el levantamiento en un lote', async () => {
    // El acuse de la maqueta dice «2 documentos». Si el lote cayera, caería
    // entero y sin decir cuál de los dos lo tumbó, así que se prueba junto.
    //
    // ⚠️ «COMO LA ESCRIBE LA PANTALLA» hay que MEDIRLO, y por eso los dos
    // documentos salen de los moldes (`Linea`, `Levantamiento`) y se vuelven a
    // leer al final. Escritos a mano pasaban las reglas igual —`lineas` no mira
    // ni un campo del molde— siendo documentos que la aplicación DESCARTA al
    // leerlos: el alta quedaba «probada» y la línea no aparecía en pantalla.
    const db = como('propietario-1', claims('propietario'));
    const lote = writeBatch(db);
    lote.set(doc(db, 'lineas', LINEA_A), lineaNueva('propietario-1', {
      creadoEn: '2026-02-10T00:00:00.000Z',
      tramosCompartidos: [tramoDeclarado('propietario-1', '2026-02-10T00:00:00.000Z')],
    }));
    lote.set(doc(db, 'levantamientos', LEV_DEL_ALTA),
      levantamiento('propietario-1', { id: LEV_DEL_ALTA }));
    await assertSucceeds(lote.commit());

    // Y los dos, leídos de vuelta, siguen siendo lo que el molde acepta: el alta
    // se ve en la pantalla, no solo en la base.
    const ojos = como('editor-total', claims('editor'));
    const lineaGuardada = await getDoc(doc(ojos, 'lineas', LINEA_A));
    const levGuardado = await getDoc(doc(ojos, 'levantamientos', LEV_DEL_ALTA));
    assert.doesNotThrow(() => Linea.parse(lineaGuardada.data()),
      'la línea del alta se guardó, pero la aplicación la descartaría al leerla');
    assert.doesNotThrow(() => Levantamiento.parse(levGuardado.data()),
      'el levantamiento del alta se guardó, pero la aplicación lo descartaría al leerlo');
  });

  test('la SEGUNDA línea del tramo no vuelve a escribir el levantamiento: ya estaba', async () => {
    // Y si alguien lo intentara, la regla no se lo impide por ser un `set` —lo
    // trata como edición—: lo que lo impide es la lista cerrada de abajo, que
    // deja fuera los puntos. Se mide, no se supone.
    const db = como('admin-1', claims('admin'));
    await assertFails(setDoc(doc(db, 'levantamientos', LEV),
      levantamiento('admin-1', { puntos: [punto(7), punto(8), punto(9)] })));
  });

  // ── LEER ─────────────────────────────────────────────────────────────────
  test('lo lee quien ve líneas: el editor, la cuadrilla y el auditor', async () => {
    for (const rol of ['editor', 'cuadrilla', 'auditor']) {
      await assertSucceeds(getDoc(doc(como(`uid-${rol}`, claims(rol)), 'levantamientos', LEV)));
    }
  });

  test('un token con `rol` pero sin `f` no lo lee, y el de otra organización tampoco', async () => {
    await assertFails(getDoc(doc(como('admin-viejo', { orgId: ORG, rol: 'admin' }), 'levantamientos', LEV)));
    const ajeno = como('ajeno', reclamosDe({ orgId: OTRA_ORG, rol: 'admin' }));
    await assertFails(getDoc(doc(ajeno, 'levantamientos', LEV)));
    // Ni al revés: el de aquí no lee el de la otra organización.
    await assertFails(getDoc(doc(como('admin-1', claims('admin')), 'levantamientos', LEV_AJENO)));
  });

  test('EL ALCANCE VA POR `serieId`: acotado al tramo sí, acotado a otra línea no', async () => {
    await assertFails(getDoc(doc(como('acotado-otra', claims('editor', [OTRA_LN])), 'levantamientos', LEV)));
    await assertSucceeds(getDoc(doc(como('acotado-tramo', claims('editor', [TRAMO])), 'levantamientos', LEV)));
    // El de una línea se alcanza por su línea, sin saber nada de tramos.
    await assertSucceeds(getDoc(doc(como('acotado-linea', claims('editor', [LINEA_A])), 'levantamientos', LEV_DE_LINEA)));
    await assertFails(getDoc(doc(como('acotado-otra', claims('editor', [OTRA_LN])), 'levantamientos', LEV_DE_LINEA)));
  });

  test('LISTA · la consulta por serie pasa; sin el `where(orgId)` se DENIEGA entera', async () => {
    // La forma exacta que hace la capa de datos: una consulta por serie, dos
    // igualdades.
    //
    // ⚠️ ESTO NO DICE NADA DEL ÍNDICE, y hay que repetirlo cada vez: **el
    // emulador sirve consultas sin índice y no se queja** (`35 · L-85`). Que esta
    // prueba pase en verde no promete que la consulta funcione en producción. Por
    // eso el índice `(orgId, serieId)` va declarado en `firestore.indexes.json`
    // —regla del proyecto: toda consulta que filtre por más de un campo se
    // declara en el mismo cambio— y lo vigila la prueba de abajo.
    const db = como('editor-total', claims('editor'));
    const s = await getDocs(query(
      collection(db, 'levantamientos'), where('orgId', '==', ORG), where('serieId', '==', TRAMO),
    ));
    assert.equal(s.size, 1, 'el levantamiento del tramo no sale en la consulta por serie');
    await assertFails(getDocs(query(
      collection(db, 'levantamientos'), where('serieId', '==', TRAMO),
    )));
    // Y con alcance acotado la consulta sigue pasando, porque el `where` prueba
    // por sí solo que todo lo devuelto está dentro del alcance.
    await assertSucceeds(getDocs(query(
      collection(como('acotado-tramo', claims('editor', [TRAMO])), 'levantamientos'),
      where('orgId', '==', ORG), where('serieId', '==', TRAMO),
    )));
  });

  // ── EDITAR: SOLO LA NOTA ─────────────────────────────────────────────────
  test('la NOTA se edita; se guarda quien la escribió y cuándo', async () => {
    const db = como('admin-1', claims('admin'));
    await assertSucceeds(updateDoc(doc(db, 'levantamientos', LEV), {
      nota: 'la «R» del nombre de campo es anotación de campo; la placa dice otra cosa',
      actualizadoEn: '2026-02-11T00:00:00.000Z', actualizadoPor: 'admin-1', revision: 1,
    }));
  });

  test('⚠️ LA LISTA CERRADA MIRA NOMBRES, NO CONTENIDO: la nota es TEXTO y la revisión un ENTERO', async () => {
    // El defecto que cierra: `hasOnly([...])` dice qué CLAVES se pueden tocar y
    // no sabe nada de lo que va dentro, así que `nota: {puntos: […]}` pasaba la
    // regla entera. El molde lo rechaza —pero el molde vive en el navegador, y
    // quien escriba con el SDK a pelo no pasa por él; las reglas son la última
    // línea. Y el daño aquí no se deshace: un documento que el lector descarta
    // no se puede borrar ni corregir.
    const db = como('admin-1', claims('admin'));
    for (const notaMala of [7, true, ['una', 'lista'], { texto: 'un objeto' }]) {
      await assertFails(updateDoc(doc(db, 'levantamientos', LEV), { nota: notaMala }));
    }
    for (const revisionMala of ['1', 1.5, null]) {
      await assertFails(updateDoc(doc(db, 'levantamientos', LEV), { nota: 'apunto yo', revision: revisionMala }));
    }
    // Y lo que SÍ es texto y SÍ es entero sigue entrando, sin nota previa y con
    // ella: la comprobación cierra el tipo, no el campo.
    await assertSucceeds(updateDoc(doc(db, 'levantamientos', LEV), { nota: 'apunto yo', revision: 1 }));
    await assertSucceeds(updateDoc(doc(db, 'levantamientos', LEV), { nota: 'y corrijo lo que apunté', revision: 2 }));
    // Una edición que NI TOCA la nota tampoco se estorba con la que ya está
    // guardada: se comprueba «si viene», no «tiene que venir».
    await assertSucceeds(updateDoc(doc(db, 'levantamientos', LEV), {
      actualizadoEn: '2026-02-12T00:00:00.000Z', actualizadoPor: 'admin-1',
    }));
  });

  test('⚠️ POR QUÉ LA COMPROBACIÓN TAMBIÉN ESTÁ EN EL ALTA: el que nace mal se queda invisible', async () => {
    // Se siembra desde el SERVIDOR —saltándose las reglas— un documento con la
    // nota de otro tipo, que es como habría quedado antes de cerrar el alta.
    // Esta prueba no pide que cambie nada: mide lo que cuesta no comprobarlo al
    // crear, y es lo que sostiene que la comprobación esté en las dos puertas.
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'levantamientos', LEV_CON_NOTA_ROTA), {
        ...levantamiento('servidor', { id: LEV_CON_NOTA_ROTA }), nota: { texto: 'un objeto' },
      });
    });
    const db = como('admin-1', claims('admin'));
    // 1 · La aplicación NO LO ENSEÑA: lo descarta al leerlo, con sus puntos
    // dentro y sin un solo error por el camino. Es lo que hace cara la avería —
    // nadie sabe que ese recorrido está ahí para ir a corregirlo.
    const leido = await getDoc(doc(db, 'levantamientos', LEV_CON_NOTA_ROTA));
    assert.equal(Levantamiento.safeParse(leido.data()).success, false,
      'si el molde lo aceptara, este documento no sería el daño que la regla evita');
    // 2 · No se borra: aquí no se borra nada, tampoco lo que nació roto.
    await assertFails(deleteDoc(doc(db, 'levantamientos', LEV_CON_NOTA_ROTA)));
    // 3 · Y ninguna edición que no TOQUE la nota pasa ya: la nota mala sigue
    // dentro del documento resultante y la regla la vuelve a ver. O sea que el
    // documento se queda además congelado.
    await assertFails(updateDoc(doc(db, 'levantamientos', LEV_CON_NOTA_ROTA), {
      actualizadoEn: '2026-02-12T00:00:00.000Z', actualizadoPor: 'admin-1',
    }));
    // 4 · LA ÚNICA SALIDA, y se deja MEDIDA para no prometer de más: escribir
    // encima de la nota con texto. La corrección existe —pero hay que saber que
    // ese documento existe, y el punto 1 dice que en la pantalla no aparece.
    await assertSucceeds(updateDoc(doc(db, 'levantamientos', LEV_CON_NOTA_ROTA), {
      nota: 'nota corregida a mano', actualizadoEn: '2026-02-12T00:00:00.000Z', actualizadoPor: 'admin-1',
    }));
    const arreglado = await getDoc(doc(db, 'levantamientos', LEV_CON_NOTA_ROTA));
    assert.ok(Levantamiento.safeParse(arreglado.data()).success,
      'una vez corregida la nota, el recorrido vuelve a ser legible para la aplicación');
  });

  test('⚠️ NINGÚN PUNTO SE REESCRIBE, y ése es el motivo de que esta colección exista', async () => {
    const db = como('admin-1', claims('admin'));
    await assertFails(updateDoc(doc(db, 'levantamientos', LEV), { puntos: [punto(7)] }));
    await assertFails(updateDoc(doc(db, 'levantamientos', LEV), { puntos: [punto(7), punto(99)] }));
    // Ni colándolo junto a una nota, que es como se colaría de verdad.
    await assertFails(updateDoc(doc(db, 'levantamientos', LEV), {
      nota: 'corrijo un punto de paso', puntos: [punto(7)],
    }));
    // Ni la fecha de campo, ni el archivo del que salió con su huella: es un
    // hecho fechado, y la huella es lo que permite volver a demostrar dentro de
    // un año que estos puntos son los del archivo que se enseñó.
    await assertFails(updateDoc(doc(db, 'levantamientos', LEV), { fecha: '2026-03-01' }));
    await assertFails(updateDoc(doc(db, 'levantamientos', LEV), {
      archivo: { nombre: 'otro.gpx', huella: 'b'.repeat(64) },
    }));
    await assertFails(updateDoc(doc(db, 'levantamientos', LEV), { codigoSerie: 'LX-1' }));
  });

  test('ni se muda de serie, ni se le cambia el dueño, ni la partida de nacimiento', async () => {
    const db = como('admin-1', claims('admin'));
    await assertFails(updateDoc(doc(db, 'levantamientos', LEV), { serieId: LN }));
    await assertFails(updateDoc(doc(db, 'levantamientos', LEV), { orgId: OTRA_ORG }));
    await assertFails(updateDoc(doc(db, 'levantamientos', LEV), { creadoPor: 'otro' }));
    await assertFails(updateDoc(doc(db, 'levantamientos', LEV), { creadoEn: '2020-01-01T00:00:00.000Z' }));
  });

  test('la nota la escribe quien carga puntos: el editor y la cuadrilla, no', async () => {
    for (const rol of ['editor', 'cuadrilla', 'auditor']) {
      await assertFails(updateDoc(
        doc(como(`uid-${rol}`, claims(rol)), 'levantamientos', LEV), { nota: 'apunto yo' },
      ));
    }
  });

  test('y con alcance acotado a otra línea no se edita aunque se traiga la función', async () => {
    const db = como('admin-acotado', claims('admin', [OTRA_LN]));
    await assertFails(updateDoc(doc(db, 'levantamientos', LEV), { nota: 'apunto yo' }));
    await assertSucceeds(updateDoc(
      doc(como('admin-con-tramo', claims('admin', [TRAMO])), 'levantamientos', LEV), { nota: 'apunto yo' },
    ));
  });

  // ── BORRAR ───────────────────────────────────────────────────────────────
  test('NO SE BORRA: ni el administrador, ni el propietario, ni quien lo creó', async () => {
    for (const rol of ['propietario', 'admin', 'editor', 'cuadrilla', 'auditor']) {
      await assertFails(deleteDoc(doc(como(`uid-${rol}`, claims(rol)), 'levantamientos', LEV)));
    }
  });

  // ── EL ÍNDICE, QUE EL EMULADOR NO PIDE ───────────────────────────────────
  test('⚠️ el índice de la consulta por serie está DECLARADO (`35 · L-85`)', () => {
    // Estática a propósito: lo de arriba corre contra el emulador, y el emulador
    // sirve la consulta sin índice y se queda tan tranquilo. En producción la
    // misma consulta contestaría `failed-precondition` y la pantalla diría «no
    // hay levantamiento» teniéndolo — que es exactamente lo que pasó el 07-09 con
    // el histórico de cargas. La única defensa barata es esta prueba.
    const indices = JSON.parse(readFileSync(join(RAIZ, 'firestore.indexes.json'), 'utf8')).indexes;
    const campos = (grupo) => indices
      .filter((i) => i.collectionGroup === grupo)
      .map((i) => i.fields.map((f) => f.fieldPath).join(','));
    assert.ok(campos('levantamientos').includes('orgId,serieId'),
      'falta el índice (orgId, serieId) de `levantamientos`: la lectura por serie moriría solo en producción');
    // Y el de los apoyos sigue siendo el de siempre: leer por TRAMO no estrenó
    // consulta, solo cambia el valor del campo.
    assert.ok(campos('apoyos').includes('orgId,lineaId,orden'),
      'desapareció el índice (orgId, lineaId, orden): la lectura por serie de apoyos se apaga en producción');
  });
});
