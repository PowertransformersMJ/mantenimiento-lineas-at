// ============================================================================
// tests/usuarios-catalogo.test.js — QUE LAS TRES CAPAS DIGAN LO MISMO
// ----------------------------------------------------------------------------
// El permiso se define UNA vez, en `contratos/src/usuarios.ts`, y lo consumen
// tres capas que no se pueden contradecir: las reglas de Firestore (la
// frontera), el escritor de reclamos y la pantalla (que solo DIBUJA). Cuando
// divergen no falla nada: aparece un botón que la base rechaza, o —peor— un eje
// de permiso que nadie hace cumplir y que quien administra se cree.
//
// Esta prueba es ESTÁTICA: lee `firestore.rules` como texto y `web/src` como
// texto. No necesita emulador, no necesita red, y corre en la suite normal. Las
// pruebas de COMPORTAMIENTO de las reglas —quién puede escribir qué de verdad—
// viven en `tests/reglas/` y necesitan el emulador (`npm run test:reglas`).
//
// LO QUE VIGILA, y por qué cada cosa:
//   i.   ningún `tiene('xx')` inventa un código que el catálogo no tiene;
//   ii.  ninguna función NO DELEGABLE se queda sin quien la haga cumplir;
//   iii. ninguna regla compara `rol` con un rol que no existe;
//   iv.  `propietario` no aparece en ninguna escritura del cliente sobre el
//        perfil — la cuenta de rescate no se acuña desde el navegador;
//   v.   la bitácora de accesos no la escribe nadie más que el servidor;
//   vi.  NO SE VUELVE A ABRIR NADA: cada regla deja hacer, como mucho, lo mismo
//        que dejaba la jerarquía por rol que había hasta el 2026-09-05;
//   vii. la pantalla no compara roles a mano.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ROLES, FUNCIONES, CODIGOS_FUNCION, FUNCION_POR_CORTO, FUNCIONES_POR_ROL,
  CAMPOS_PROPIOS_DEL_PERFIL,
} from '../contratos/src/usuarios.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGLAS = readFileSync(join(RAIZ, 'firestore.rules'), 'utf8');

// ── Un lector mínimo del archivo de reglas ──────────────────────────────────
// No es un analizador de verdad y no pretende serlo: solo tiene que aislar el
// cuerpo de un `match` y las condiciones de sus `allow`. Se hace con conteo de
// llaves porque los bloques anidan, y con una expresión regular sobre `allow …:
// if … ;` porque una condición de Firestore nunca lleva punto y coma dentro.

/** El cuerpo de `match /<coleccion>/{…} { … }`, con las llaves balanceadas. */
function bloqueDe(coleccion) {
  const inicio = REGLAS.indexOf(`match /${coleccion}/{`);
  assert.notEqual(inicio, -1, `no existe ninguna regla para la colección «${coleccion}»`);
  let i = REGLAS.indexOf('{', REGLAS.indexOf('}', inicio)); // la llave del cuerpo, tras el comodín
  let profundidad = 0;
  for (let j = i; j < REGLAS.length; j++) {
    if (REGLAS[j] === '{') profundidad++;
    else if (REGLAS[j] === '}' && --profundidad === 0) return REGLAS.slice(i + 1, j);
  }
  throw new Error(`el bloque de «${coleccion}» no cierra`);
}

/** Los `allow` de un bloque: `[{ operaciones: ['read'], condicion: '…' }]`. */
function permisosDe(bloque) {
  return [...bloque.matchAll(/allow\s+([a-z,\s]+?):\s*if\s+([\s\S]*?);/g)].map((m) => ({
    operaciones: m[1].split(',').map((s) => s.trim()).filter(Boolean),
    condicion: m[2].replace(/\/\/[^\n]*/g, ' ').replace(/\s+/g, ' ').trim(),
  }));
}

/**
 * Los códigos cortos que exige una condición: `tiene('ae')` → `['ae']`.
 * `puedeVer('lv')` cuenta igual: es `tiene('lv')` más la comprobación de
 * organización, y las lecturas se escriben así para no repetirla quince veces.
 */
const cortosDe = (condicion) =>
  [...condicion.matchAll(/(?:tiene|puedeVer)\(\s*'([^']*)'\s*\)/g)].map((m) => m[1]);

/** Qué roles traen de serie esta función, por su código corto. */
const rolesDe = (corto) =>
  ROLES.filter((r) => FUNCIONES_POR_ROL[r].some((f) => FUNCIONES[f].corto === corto));

/** Sin `propietario`: es un rol NUEVO (`§ADR-100`), no existía en la jerarquía vieja. */
const sinPropietario = (roles) => roles.filter((r) => r !== 'propietario').sort();
const iguales = (a, b) => sinPropietario(a).join(',') === sinPropietario(b).join(',');

// ════════════════════════════════════════════════════════════════════════════
describe('i · las reglas no inventan códigos de función', () => {
  test('cada `tiene(...)` usa un código corto que existe en el catálogo', () => {
    const usados = [...new Set(cortosDe(REGLAS))];
    assert.ok(usados.length > 0, 'no hay ni un solo `tiene(...)`: las reglas no migraron');
    for (const c of usados) {
      assert.ok(FUNCION_POR_CORTO[c],
        `firestore.rules exige «${c}», que no está en FUNCIONES. Un código que el escritor de `
        + 'reclamos nunca va a poner es una puerta que no se abre nunca, y nadie sabrá por qué.');
    }
  });

  test('y el código es el CORTO, no el largo: en el token caben 1.000 bytes', () => {
    for (const f of CODIGOS_FUNCION) {
      for (const helper of ['tiene', 'puedeVer']) {
        assert.ok(!REGLAS.includes(`${helper}('${f}')`),
          `firestore.rules exige «${f}» (el nombre largo). En el reclamo «f» viajan los cortos.`);
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('ii · ninguna función existe de adorno', () => {
  /**
   * LA ÚNICA QUE NADIE PUEDE HACER CUMPLIR EN LA FRONTERA, y está medido:
   *
   * `ficha.lote` («aplicar un dato a varios apoyos de una vez») llega a
   * Firestore como N escrituras independientes sobre `apoyos`, una por
   * documento. Una regla ve UNA escritura cada vez y no tiene forma de saber si
   * venía sola o dentro de un lote de treinta: `writeBatch` no deja rastro en
   * `request`. Escribir `tiene('ae') || tiene('fl')` en `apoyos/update` no
   * cambiaría absolutamente nada —todo el que trae 'fl' trae ya 'ae'— y sería
   * justo la mentira que el catálogo describe: un campo que aparenta control y
   * no lo tiene.
   *
   * Así que se hace cumplir donde SÍ se puede —en `guardarFichaApoyoEnLote`,
   * que ya lo comprueba antes de tocar nada— y aquí queda DECLARADO en vez de
   * disimulado. Si algún día hay servidor, se muda allí.
   */
  const NO_EXIGIBLES_EN_LA_FRONTERA = ['ficha.lote'];

  test('la lista de excepciones no crece sin que alguien lo decida', () => {
    assert.equal(NO_EXIGIBLES_EN_LA_FRONTERA.length, 1,
      'creció la lista de funciones que ninguna regla hace cumplir. Cada una nueva es una promesa '
      + 'que el sistema no cumple: o se hace cumplir, o se borra del catálogo, o se argumenta aquí.');
    for (const f of NO_EXIGIBLES_EN_LA_FRONTERA) {
      assert.ok(CODIGOS_FUNCION.includes(f), `«${f}» ni siquiera es una función del catálogo`);
    }
  });

  test('toda función NO DELEGABLE la hace cumplir alguna regla', () => {
    // Las delegables se pueden quitar y poner por persona, y algunas viven solo
    // en la pantalla (`informes.generar` no escribe en la base). Las NO
    // delegables son las que separan a un administrador de todo lo demás: si
    // una de ésas no aparece en ninguna regla, el sistema promete un control
    // que no ejerce.
    const usados = new Set(cortosDe(REGLAS));
    for (const f of CODIGOS_FUNCION.filter((x) => !FUNCIONES[x].delegable)) {
      if (NO_EXIGIBLES_EN_LA_FRONTERA.includes(f)) continue;
      assert.ok(usados.has(FUNCIONES[f].corto),
        `«${f}» (${FUNCIONES[f].corto}) no aparece en ninguna regla: es decorativa. `
        + 'Una función no delegable que nadie hace cumplir es la ilusión de control que costó '
        + 'los tres sistemas del §ADR-100.');
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('iii · el rol, cuando se compara, se compara con uno que existe', () => {
  test('ninguna regla compara `rol` con una cadena fuera de ROLES', () => {
    const comparados = [
      ...REGLAS.matchAll(/rol\(\)\s*(?:==|!=)\s*'([^']*)'/g),
      ...REGLAS.matchAll(/request\.auth\.token\.rol\s*(?:==|!=)\s*'([^']*)'/g),
    ].map((m) => m[1]);
    for (const r of comparados) {
      assert.ok(ROLES.includes(r),
        `firestore.rules compara el rol con «${r}», que no está en ROLES. Un rol mal escrito no `
        + 'da error: deniega en silencio, y la persona ve una herramienta rota sin motivo.');
    }
  });

  test('y `esAdmin()` incluye a `propietario`: es el techo, no un rol de adorno', () => {
    // El fallo del archivo anterior: `esAdmin()` era `rol() == 'admin'` a secas.
    // El día que naciera la cuenta de rescate del dueño se habría quedado por
    // DEBAJO de un administrador cualquiera.
    const helper = REGLAS.match(/function esAdmin\(\)\s*\{([\s\S]*?)\}/);
    assert.ok(helper, 'desapareció `esAdmin()`');
    assert.match(helper[1], /'propietario'/, '`esAdmin()` se olvidó del propietario');
    assert.match(helper[1], /'admin'/, '`esAdmin()` se olvidó del admin');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('iv · el perfil: el navegador no se asciende a sí mismo', () => {
  const escrituras = permisosDe(bloqueDe('usuarios'))
    .filter((p) => p.operaciones.some((o) => ['create', 'update', 'write', 'delete'].includes(o)));

  test('`propietario` no aparece en NINGUNA escritura del cliente sobre el perfil', () => {
    assert.ok(escrituras.length > 0, 'el perfil se quedó sin reglas de escritura');
    for (const e of escrituras) {
      assert.ok(!e.condicion.includes('propietario'),
        `la escritura «${e.operaciones.join(',')}» del perfil menciona a propietario. La cuenta de `
        + 'rescate nace en la consola de Firebase y lo reconoce /bootstrap con la llave maestra, jamás desde '
        + 'el navegador.');
    }
  });

  test('cada quien escribe SOLO su propio documento', () => {
    for (const e of escrituras.filter((x) => !/^\s*false\s*$/.test(x.condicion))) {
      assert.match(e.condicion, /request\.auth\.uid == uid/,
        `la escritura «${e.operaciones.join(',')}» del perfil no ata el documento al uid de quien escribe`);
    }
  });

  test('y solo los campos que el catálogo declara suyos — ni uno más', () => {
    // Es la parte que impide lo importante: sin la lista blanca, el navegador
    // escribe `rol: 'admin'` en su propio espejo. El token no cambiaría, pero
    // una pantalla que se fiara del espejo lo dibujaría todo abierto.
    const listas = [...bloqueDe('usuarios').matchAll(/hasOnly\(\s*\[([^\]]*)\]\s*\)/g)]
      .map((m) => m[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean).sort());
    assert.ok(listas.length > 0, 'el perfil se quedó sin lista blanca de campos');
    for (const l of listas) {
      assert.deepEqual(l, [...CAMPOS_PROPIOS_DEL_PERFIL].sort(),
        'la lista blanca de la regla no es la misma que CAMPOS_PROPIOS_DEL_PERFIL del catálogo');
    }
  });

  test('la fecha la pone el servidor, no el navegador', () => {
    assert.match(bloqueDe('usuarios') + REGLAS.match(/function selloDelServidor[\s\S]*?\n    \}/)[0],
      /request\.time/,
      'sin `== request.time` se puede fechar un recibo hacia atrás y tapar una orden nueva');
  });

  test('nadie borra un perfil desde el cliente', () => {
    assert.match(bloqueDe('usuarios'), /allow delete:\s*if false\s*;/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('v · la bitácora de accesos solo la escribe el servidor', () => {
  test('`auditoria_accesos` no acepta ninguna escritura del cliente', () => {
    assert.match(bloqueDe('auditoria_accesos'), /allow write:\s*if false\s*;/,
      'un registro que el auditado puede firmar con el nombre de otro no es un registro de auditoría');
  });

  test('y la lee quien tiene `usuarios.auditoria`, dentro de su organización', () => {
    const lectura = permisosDe(bloqueDe('auditoria_accesos')).find((p) => p.operaciones.includes('read'));
    assert.ok(lectura, 'la bitácora no se puede leer: entonces no sirve de nada');
    assert.deepEqual(cortosDe(lectura.condicion), [FUNCIONES['usuarios.auditoria'].corto]);
  });

  test('la bitácora de la IA tampoco se escribe, y ahora exige organización', () => {
    // Era la segunda regla de lectura sin `orgId` (la otra, `config`, ya se
    // cerró): un auditor de otra organización la habría leído entera.
    assert.match(bloqueDe('llamadas_ia'), /allow write:\s*if false\s*;/);
    const lectura = permisosDe(bloqueDe('llamadas_ia')).find((p) => p.operaciones.includes('read'));
    assert.deepEqual(cortosDe(lectura.condicion), [FUNCIONES['ia.leer'].corto]);
    assert.match(lectura.condicion, /puedeVer/, 'la lectura de la bitácora no comprueba la organización');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('vi · LA PARIDAD: migrar a funciones no abre ni una puerta', () => {
  /**
   * Lo que dejaba hacer CADA regla antes del 2026-09-05, por rol. Sale de leer
   * los cuatro helpers viejos, que eran jerárquicos por inclusión:
   *
   *   autenticado() → todos · esEditor() → admin+editor
   *   esCuadrilla() → admin+editor+cuadrilla · esAuditor() → admin+auditor
   *   esAdmin()     → admin
   */
  const TODOS = ['admin', 'editor', 'cuadrilla', 'auditor'];
  const EDITOR = ['admin', 'editor'];
  const CUADRILLA = ['admin', 'editor', 'cuadrilla'];
  const AUDITOR = ['admin', 'auditor'];
  const ADMIN = ['admin'];

  const ANTES = {
    lineas: { read: TODOS, create: EDITOR, update: EDITOR },
    apoyos: { read: TODOS, create: EDITOR, update: EDITOR },
    hipotesis: { read: TODOS, create: EDITOR, update: EDITOR },
    inspecciones: { read: TODOS, create: CUADRILLA, update: CUADRILLA },
    evidencias: { read: TODOS, create: CUADRILLA, update: CUADRILLA },
    investigaciones: { read: TODOS, create: EDITOR, update: EDITOR },
    analisis: { read: TODOS, create: EDITOR, update: EDITOR },
    acciones_capa: { read: TODOS, create: EDITOR, update: EDITOR },
    sondeos_clima: { read: TODOS, create: EDITOR },
    hallazgos: { read: TODOS },
    calculos: { read: TODOS },
    solicitudes_ia: { read: TODOS, create: CUADRILLA },
    sugerencias: { read: TODOS, update: CUADRILLA },
    llamadas_ia: { read: AUDITOR },
    config: { read: TODOS, write: ADMIN },
    cargabilidad_dias: { read: TODOS, create: ADMIN, update: ADMIN },
    cargabilidad_resumenes: { read: TODOS, create: ADMIN, update: ADMIN },
    cargabilidad_cargas: { read: TODOS, create: ADMIN },
  };

  /**
   * LAS DOS ÚNICAS DIFERENCIAS, las dos CIERRAN y las dos están argumentadas en
   * el propio `firestore.rules`. Si aparece una tercera, esta prueba la caza.
   */
  const CIERRES_DECLARADOS = {
    'apoyos.create': 'crear un apoyo pasa a ser `cargar.puntos`, que solo trae el administrador. '
      + 'La regla vieja era MÁS FLOJA que la pantalla, que ya exigía admin para cargar el trazado.',
    'cargabilidad_dias.read': 'el catálogo no le da `cargabilidad.ver` a la cuadrilla.',
    'cargabilidad_resumenes.read': 'idem.',
    'cargabilidad_cargas.read': 'idem.',
  };

  for (const [coleccion, esperado] of Object.entries(ANTES)) {
    for (const [operacion, rolesAntes] of Object.entries(esperado)) {
      test(`${coleccion} · ${operacion}`, () => {
        const permiso = permisosDe(bloqueDe(coleccion))
          .find((p) => p.operaciones.includes(operacion));
        assert.ok(permiso, `«${coleccion}» perdió su regla de ${operacion}`);

        const cortos = cortosDe(permiso.condicion);
        assert.ok(cortos.length >= 1, `«${coleccion}.${operacion}» no exige ninguna función`);

        // Una regla puede nombrar VARIAS funciones. Si las une con «||» (dos
        // ramas, como `config`: los cerrojos para `ce`, el resto para `lv`), pasa
        // quien tenga CUALQUIERA → unión de roles. Si las une con «&&», pasa
        // quien tenga TODAS → intersección. Lo que no se admite es no saberlo.
        const conjuntos = cortos.map(rolesDe);
        const union = /\|\|/.test(permiso.condicion);
        const rolesAhora = conjuntos.reduce((acc, r) =>
          (union ? [...new Set([...acc, ...r])] : acc.filter((x) => r.includes(x))));

        // EL CERROJO DURO: nunca, bajo ningún concepto, más roles que antes.
        for (const r of sinPropietario(rolesAhora)) {
          assert.ok(rolesAntes.includes(r),
            `«${coleccion}.${operacion}» ABRE la puerta a «${r}», que antes no podía. `
            + 'Migrar a funciones no puede dar permisos nuevos a nadie.');
        }

        const clave = `${coleccion}.${operacion}`;
        if (iguales(rolesAhora, rolesAntes)) return;
        assert.ok(CIERRES_DECLARADOS[clave],
          `«${clave}» cambió de {${rolesAntes.join(',')}} a {${sinPropietario(rolesAhora).join(',')}} `
          + 'sin estar declarado. Un cierre no anunciado es una pantalla que deja de funcionar y '
          + 'nadie sabe por qué.');
      });
    }
  }

  test('el `propietario` hereda todo: no hay regla que lo deje fuera', () => {
    for (const c of new Set(cortosDe(REGLAS))) {
      assert.ok(rolesDe(c).includes('propietario'),
        `la función «${FUNCION_POR_CORTO[c]}» no la trae el propietario, y alguna regla la exige: `
        + 'el dueño del sistema se quedaría fuera de su propia herramienta.');
    }
  });

  test('los cerrojos que ya existían siguen ahí', () => {
    // Lo que esta migración NO podía romper, y es fácil romper al reescribir.
    assert.match(REGLAS, /function altaCoherente\(\)/);
    assert.match(REGLAS, /function noTocaReservados\(\)/);
    assert.match(bloqueDe('apoyos'), /revision == resource\.data\.get\('revision', 0\) \+ 1/,
      'se perdió el cerrojo de revisión optimista de los apoyos');
    assert.match(bloqueDe('analisis'), /revision == resource\.data\.get\('revision', 0\) \+ 1/,
      'se perdió el cerrojo de revisión optimista de los análisis');
    assert.match(REGLAS, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/,
      'se perdió el cierre final: una colección nueva quedaría abierta');
  });

  test('un reclamo ausente no abre nada: `tiene` y `alcanza` exigen la clave', () => {
    // El corazón del mínimo privilegio. Sin esto, un token con `rol: admin` y
    // sin `f` pasaría por «no hay nada que comprobar».
    const t = REGLAS.match(/function tiene\(corto\)\s*\{([\s\S]*?)\n    \}/);
    assert.ok(t, 'desapareció `tiene()`');
    assert.match(t[1], /'f' in request\.auth\.token/, '`tiene()` no comprueba que el reclamo exista');
    assert.ok(!/\.get\(/.test(t[1]), '`tiene()` usa .get() sobre el token: deniega en silencio');

    const a = REGLAS.match(/function alcanza\(lineaId\)\s*\{([\s\S]*?)\n    \}/);
    assert.ok(a, 'desapareció `alcanza()`');
    assert.match(a[1], /'l' in request\.auth\.token/, '`alcanza()` no comprueba que el reclamo exista');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('vii · la pantalla no decide el permiso a mano', () => {
  /**
   * Un componente que escribe `sesion.rol === 'admin'` es un catálogo paralelo:
   * el día que se delegue una función a un editor, el botón seguirá escondido y
   * nadie sabrá dónde está escrito. Lo que debe usar es `puede()` /
   * `permisosDe()` de `contratos/src/usuarios.ts`.
   *
   * SE TOLERA en dos sitios, y solo en dos:
   *   · `web/src/datos/` — la capa que habla con Firestore comprueba el permiso
   *     antes de mandar, para dar un mensaje humano en vez de un
   *     «permission-denied». Ahí el rol es un dato de diagnóstico.
   *   · los textos que MUESTRAN el rol (`{sesion.rol}`), que no son una
   *     decisión: no comparan nada, y esta prueba solo busca comparaciones.
   */
  const RUTA = join(RAIZ, 'web', 'src');
  const TOLERADO = ['datos/'];

  /**
   * DEUDA EN MIGRACIÓN — **vacía, y así se queda**.
   *
   * El 2026-09-05, cuando empezó esta migración, ocho componentes comparaban el
   * rol a mano (`Cargabilidad`, `Cargar`, `DetalleGps`, `FichaEditor`,
   * `FichaLote`, `Fichas`, `Fotos`, `Linea`) y `web/src/datos/firestore.ts`
   * tenía cinco cortes más. El frente de pantalla los pasó todos a `puede()` /
   * `permisosDe()` ese mismo día, así que no queda nada que tolerar.
   *
   * Se deja el mecanismo, no la lista: si alguna vez hay que volver a meter un
   * archivo aquí, que sea un acto deliberado y visible en el diff, con su fecha
   * y su motivo — no una excepción que se cuela.
   */
  const EN_MIGRACION = [];

  const R = '(propietario|admin|editor|cuadrilla|auditor)';
  /**
   * Lo que se busca es el rol DE LA SESIÓN usado como decisión: `sesion.rol ===
   * 'admin'`, o un `rol` suelto sacado de las credenciales.
   *
   * NO se busca el rol de OTRA PERSONA. `p.rol === 'propietario'` en la
   * pantalla de personas no decide lo que puede hacer quien mira: dice que a
   * ese registro no se le toca el rol, que es una regla del propio catálogo
   * (`ROLES_ASIGNABLES` deja fuera al propietario a propósito). Meterlo en el
   * mismo saco obligaría a inventar una función para algo que el catálogo
   * modela como identidad, no como permiso.
   */
  const SESION = String.raw`(?:sesion|sesión|claims|reclamos|credenciales)\??\s*\.\s*rol`;
  const SUELTO = String.raw`(?<![.\w$])rol`;
  const PATRONES = [
    new RegExp(String.raw`${SESION}\s*(===|!==|==|!=)\s*['"]${R}['"]`),
    new RegExp(String.raw`${SUELTO}\s*(===|!==|==|!=)\s*['"]${R}['"]`),
    new RegExp(String.raw`['"]${R}['"]\s*(===|!==|==|!=)\s*(?:${SESION}|${SUELTO})`),
    new RegExp(String.raw`\[[^\]\n]*['"]${R}['"][^\]\n]*\]\s*\.\s*includes\s*\(\s*(?:${SESION}|${SUELTO})\s*\)`),
  ];

  const archivos = [];
  (function recorrer(d) {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) recorrer(p);
      else if (/\.(ts|tsx)$/.test(p)) archivos.push(p);
    }
  })(RUTA);

  test('ningún componente nuevo compara el rol a mano', () => {
    const culpables = [];
    for (const p of archivos) {
      const rel = relative(RUTA, p).split('\\').join('/');
      if (TOLERADO.some((t) => rel.startsWith(t)) || EN_MIGRACION.includes(rel)) continue;
      readFileSync(p, 'utf8').split('\n').forEach((linea, i) => {
        const codigo = linea.trim();
        // Los comentarios hablan del permiso constantemente; no deciden nada.
        if (codigo.startsWith('//') || codigo.startsWith('*') || codigo.startsWith('/*')) return;
        if (PATRONES.some((x) => x.test(codigo))) culpables.push(`${rel}:${i + 1}  ${codigo}`);
      });
    }
    assert.deepEqual(culpables, [],
      'estos sitios deciden el permiso comparando el rol a mano. Use `puede(claims, "…")` o '
      + '`permisosDe(claims)` de `contratos/src/usuarios.ts`:\n  ' + culpables.join('\n  '));
  });

  test('la deuda declarada existe de verdad (no se quedó una ruta muerta)', () => {
    // Una excepción que apunta a un archivo borrado tapa un fallo futuro: el
    // día que alguien cree `componentes/Fichas.tsx` otra vez, entra exento.
    for (const rel of EN_MIGRACION) {
      assert.ok(archivos.some((p) => relative(RUTA, p).split('\\').join('/') === rel),
        `«${rel}» está declarado en migración pero ya no existe: quítelo de la lista`);
    }
  });
});
