// ============================================================================
// tests/acceso.test.js — la puerta, y sobre todo que NO encierre a nadie
// ----------------------------------------------------------------------------
// Ésta es la única pantalla del sistema que se INTERPONE antes de entrar. Si se
// equivoca no muestra un dato raro: deja a una persona fuera de su herramienta.
//
// El caso que gobierna estas pruebas es real y es HOY: el Ingeniero es el único
// usuario, es admin, entra por Google y todavía no tiene contraseña. Cualquier
// camino por el que la pantalla se le dibuje es un fallo grave.
// ============================================================================
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  puertaDeAcceso, defectosDeContrasena, cambiarContrasena, motivoDelFallo, MIN_CONTRASENA,
} from '../contratos/src/acceso.ts';

const AYER = Date.parse('2026-08-05T10:00:00.000Z');
const HOY = Date.parse('2026-08-06T10:00:00.000Z');

describe('LA PUERTA NO PUEDE ENCERRAR A NADIE', () => {
  test('quien entra por GOOGLE pasa, pase lo que pase con los reclamos', () => {
    // El cerrojo fuerte, y el que protege al Ingeniero HOY: no lo aprovisiona
    // nadie, lo estampa Firebase. No depende de que una marca esté bien puesta.
    for (const claims of [
      null,
      {},
      { passwordProvisional: true },
      { passwordProvisional: true, contrasenaOrdenadaEn: HOY },
    ]) {
      assert.equal(puertaDeAcceso({ proveedor: 'google.com', claims, recibo: null }).fase, 'seguir',
        'se le exigió cambiar la contraseña a alguien que entró por Google y no tiene ninguna');
    }
  });

  test('sin la marca, se pasa: un reclamo ausente NO encierra a nadie', () => {
    assert.equal(puertaDeAcceso({ proveedor: 'password', claims: {}, recibo: null }).fase, 'seguir');
    assert.equal(puertaDeAcceso({ proveedor: 'password', claims: null, recibo: null }).fase, 'seguir');
    assert.equal(puertaDeAcceso({ proveedor: 'password', claims: { orgId: 'transpower', rol: 'admin' }, recibo: null }).fase, 'seguir');
  });

  test('la marca se lee ESTRICTA: nada de «verdadero-ish»', () => {
    // Un reclamo con basura no puede encerrar a nadie. `'false'`, `1` y `'si'`
    // son todos verdaderos en JavaScript si se leen con un `if` a secas.
    for (const v of ['true', 'false', 1, 0, 'si', {}, []]) {
      assert.equal(puertaDeAcceso({ proveedor: 'password', claims: { passwordProvisional: v }, recibo: null }).fase,
        'seguir', `un reclamo con el valor ${JSON.stringify(v)} encerró a alguien`);
    }
  });

  test('NUNCA LANZA: ante cualquier entrada rara, se sigue', () => {
    for (const e of [null, undefined, {}, { proveedor: 1, claims: 'x', recibo: 'y' }]) {
      assert.doesNotThrow(() => puertaDeAcceso(e));
      assert.equal(puertaDeAcceso(e).fase, 'seguir');
    }
  });
});

describe('cuándo SÍ se exige el cambio', () => {
  const conMarca = (extra = {}) => ({
    proveedor: 'password',
    claims: { orgId: 'transpower', rol: 'cuadrilla', passwordProvisional: true, ...extra },
  });

  test('entró con contraseña, tiene la marca y no ha dejado recibo', () => {
    assert.equal(puertaDeAcceso({ ...conMarca(), recibo: null }).fase, 'cambiar_contrasena');
  });

  test('con recibo POSTERIOR a la orden, ya no se le pide', () => {
    assert.equal(puertaDeAcceso({ ...conMarca({ contrasenaOrdenadaEn: AYER }), recibo: HOY }).fase, 'seguir');
  });

  test('EL CASO DE LA SEGUNDA CONTRASEÑA: una orden NUEVA vuelve a pedirla', () => {
    // `usuarios.mjs contrasena` puede reponer una provisional una segunda vez.
    // Con un recibo de sí/no, esa segunda no se exigiría cambiar NUNCA — el
    // recibo viejo la taparía. Por eso la orden lleva fecha.
    assert.equal(puertaDeAcceso({ ...conMarca({ contrasenaOrdenadaEn: HOY }), recibo: AYER }).fase,
      'cambiar_contrasena', 'una contraseña repuesta hoy quedó tapada por un recibo de ayer');
  });

  test('una orden SIN fecha se satisface con cualquier recibo (compatibilidad)', () => {
    // Las cuentas creadas antes del 06-08-2026 no llevan fecha en la orden. No
    // se rompe hacia atrás: se comportan como antes.
    assert.equal(puertaDeAcceso({ ...conMarca(), recibo: AYER }).fase, 'seguir');
  });

  test('la fecha de la orden se acepta en segundos, milisegundos o texto', () => {
    const enSegundos = Math.floor(HOY / 1000);
    assert.equal(puertaDeAcceso({ ...conMarca({ contrasenaOrdenadaEn: enSegundos }), recibo: AYER }).fase, 'cambiar_contrasena');
    assert.equal(puertaDeAcceso({ ...conMarca({ contrasenaOrdenadaEn: '2026-08-06T10:00:00.000Z' }), recibo: AYER }).fase, 'cambiar_contrasena');
  });
});

describe('la regla de la contraseña vive en UN sitio', () => {
  test('el mínimo es 12, no los 6 que acepta Firebase', () => {
    // Si la pantalla se apoyara en el mínimo de Firebase, el sistema gastaría una
    // pantalla OBLIGATORIA en DEBILITAR la contraseña: se entra con una de 12
    // puesta por el administrador y se sale con una de 6.
    assert.equal(MIN_CONTRASENA, 12);
    assert.ok(defectosDeContrasena('abc123', 'juan@x.com').length > 0, 'aceptó una de 6');
  });

  test('las tres formas reales de que se filtre', () => {
    assert.match(defectosDeContrasena('corta1', 'juan@x.com')[0], /mínimo son 12/);
    assert.match(defectosDeContrasena('sinnumerosaqui', 'juan@x.com')[0], /letras y números/);
    assert.match(defectosDeContrasena('juanjuanjuan1', 'juan@x.com').join(' '), /su propio correo/);
    assert.match(defectosDeContrasena('aaaaaaaaaaaaaa', 'x@y.com').join(' '), /un solo carácter repetido/);
  });

  test('una buena no tiene defectos', () => {
    assert.deepEqual(defectosDeContrasena('Tormenta7Caribe', 'juan@x.com'), []);
  });
});

describe('EL ORDEN DE LAS TRES OPERACIONES es el invariante', () => {
  const pasos = (falla) => {
    const hechos = [];
    return {
      hechos,
      reautenticar: async () => { hechos.push('reautenticar'); if (falla === 'reautenticar') throw { code: 'auth/wrong-password' }; },
      actualizar: async () => { hechos.push('actualizar'); if (falla === 'actualizar') throw { code: 'auth/weak-password' }; },
      dejarRecibo: async () => { hechos.push('recibo'); if (falla === 'recibo') throw new Error('permisos'); },
    };
  };

  test('el camino bueno hace las tres, EN ORDEN', () => {
    const p = pasos(null);
    return cambiarContrasena(p).then((r) => {
      assert.equal(r.fase, 'entrar');
      assert.deepEqual(p.hechos, ['reautenticar', 'actualizar', 'recibo']);
    });
  });

  test('se reautentica SIEMPRE, no solo cuando Firebase se queja', () => {
    // Es lo que rompe de raíz el bucle «vuelva a entrar» → entra → «vuelva a
    // entrar», y de paso cierra el agujero del portátil abierto.
    const p = pasos(null);
    return cambiarContrasena(p).then(() => assert.equal(p.hechos[0], 'reautenticar'));
  });

  test('si falla la reautenticación NO se toca la contraseña', () => {
    const p = pasos('reautenticar');
    return cambiarContrasena(p).then((r) => {
      assert.equal(r.fase, 'fallo');
      assert.equal(r.codigo, 'auth/wrong-password');
      assert.deepEqual(p.hechos, ['reautenticar'], 'se intentó cambiar la contraseña sin comprobar quién era');
    });
  });

  test('EL FALLO CON DAÑO DE VERDAD: el recibo NUNCA se escribe antes del cambio', () => {
    // Al revés se marcaría como hecho algo que no ocurrió: una contraseña
    // provisional viviendo indefinidamente mientras la auditoría dice que ya se
    // cambió. Por eso el orden vive aquí y no en un componente.
    const p = pasos('actualizar');
    return cambiarContrasena(p).then((r) => {
      assert.equal(r.fase, 'fallo');
      assert.ok(!p.hechos.includes('recibo'), 'se dejó recibo de un cambio que falló');
    });
  });

  test('si el recibo falla pero la contraseña SÍ cambió, se entra igual', () => {
    // Negarle la entrada por no poder escribir una fecha sería castigarla por un
    // fallo del sistema. La pantalla volverá la próxima vez: molesto, no
    // destructivo.
    const p = pasos('recibo');
    return cambiarContrasena(p).then((r) => {
      assert.equal(r.fase, 'entrar_sin_recibo');
      assert.deepEqual(p.hechos, ['reautenticar', 'actualizar', 'recibo']);
    });
  });

  test('cada fallo se explica sin jerga y sin código de error', () => {
    assert.match(motivoDelFallo('auth/wrong-password'), /contraseña actual no es correcta/);
    assert.match(motivoDelFallo('auth/network-request-failed'), /NO se cambió/);
    assert.match(motivoDelFallo('lo-que-sea'), /anterior sigue siendo válida/);
    for (const c of ['auth/wrong-password', 'auth/weak-password', 'desconocido']) {
      assert.doesNotMatch(motivoDelFallo(c), /auth\//, 'se le enseñó el código de error al usuario');
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA VÍA DE GOOGLE, RETIRADA (`TODO-50` fase 2b)
// ════════════════════════════════════════════════════════════════════════════
//
// POR QUÉ ESTO ES UN GUARDIÁN Y NO UN DETALLE. «Entrar con Google» era una vía
// de alta PÚBLICA: cualquiera con una cuenta de Google podía crearse una
// identidad en el proyecto, y el 31-07-2026 ocurrió de verdad — una cuenta ajena
// se dio de alta sin que nadie la invitara (`99 §ADR-019`). El Ingeniero pidió
// retirarla en cuanto tuvo contraseña propia.
//
// ⚠️ Y LO QUE ESTA PRUEBA **NO** DEMUESTRA, que es lo más importante: que la
// aplicación no ofrezca el botón NO cierra la puerta. El proveedor sigue
// habilitado en la consola de Firebase hasta que alguien lo apague ALLÍ, y
// mientras siga encendido la vía existe aunque no se vea. Es la misma doctrina
// que el resto del proyecto: la pantalla es HIGIENE, la frontera es la consola y
// las reglas. Esta prueba vigila la higiene; el cierre real se hace fuera.
describe('la aplicación no ofrece entrar con Google', () => {
  const fuente = (r) => readFileSync(new URL(r, import.meta.url), 'utf-8');
  const APP = fuente('../web/src/App.tsx');
  const PANTALLA = fuente('../web/src/componentes/Estado.tsx');

  test('la pantalla de acceso no pinta ningún botón de Google', () => {
    assert.ok(!/Entrar con Google/.test(PANTALLA),
      'volvió el botón: era una vía de alta pública, y por ahí entró una cuenta ajena');
    assert.ok(!/onEntrarConGoogle/.test(PANTALLA));
  });

  test('y la aplicación no tiene una función que lo intente', () => {
    assert.ok(!/entrarConGoogle\(\)/.test(APP),
      'la vía sigue cableada aunque no se vea: un botón que vuelva la reactiva entera');
  });

  test('el alta sigue siendo un acto administrativo, y se dice', () => {
    assert.match(PANTALLA, /No hay registro/,
      'sin esa frase, quien no pueda entrar no sabe que tiene que pedirlo');
  });
});
