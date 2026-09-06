// ============================================================================
// tests/retiro-de-google.test.js — lo viejo se BORRA, no se apila
// ----------------------------------------------------------------------------
// ORDEN DEL INGENIERO (2026-09-05): «prohibido el ingreso con Google, solo
// ingreso con usuarios creados … todo lo viejo se borra». Y la lección que la
// skill anti-código-muerto pone nombre: Knight Capital — un deploy actualizó 7
// de 8 servidores y el octavo, con código viejo, quebró la empresa en 45 min.
//
// QUÉ VIGILA. Que el grafo de referencias a lo retirado esté a CERO en el
// código (los comentarios que cuentan la historia se permiten), que los
// mensajes nuevos existan, que «olvidé mi contraseña» responda lo mismo exista o
// no el correo, y que las piezas nuevas del arranque estén cableadas.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const RAIZ = fileURLToPath(new URL('../', import.meta.url));
const leer = (p) => readFileSync(join(RAIZ, p), 'utf-8');
/** El código SIN comentarios: la historia se puede contar, el código no puede seguir vivo. */
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function archivosDe(dir, exts, acumulado = []) {
  for (const n of readdirSync(join(RAIZ, dir))) {
    const rel = join(dir, n);
    if (statSync(join(RAIZ, rel)).isDirectory()) archivosDe(rel, exts, acumulado);
    else if (exts.some((e) => n.endsWith(e))) acumulado.push(rel);
  }
  return acumulado;
}

describe('Google fuera del todo', () => {
  const LO_VIEJO = [
    'GoogleAuthProvider', 'signInWithPopup', 'signInWithRedirect', 'getRedirectResult',
    'browserPopupRedirectResolver', 'entrarConGoogle', 'recogerRedireccion', 'onEntrarConGoogle',
    'Entrar con Google',
  ];

  test('⚠️ ninguna referencia viva en web/src: el grafo está a cero', () => {
    const restos = [];
    for (const f of archivosDe('web/src', ['.ts', '.tsx'])) {
      const codigo = sinComentarios(leer(f));
      for (const v of LO_VIEJO) if (codigo.includes(v)) restos.push(`${f}: ${v}`);
    }
    assert.deepEqual(restos, [], 'quedó código de Google vivo (el octavo servidor)');
  });

  test('la pantalla de acceso ya no ofrece el botón, y ofrece recuperar la contraseña', () => {
    const t = leer('web/src/componentes/Estado.tsx');
    assert.ok(!/onEntrarConGoogle/.test(t));
    assert.match(t, /onRecuperar/);
    assert.match(t, /¿Olvidó su contraseña\?/);
  });

  test('el mensaje para la pestaña vieja existe: un proveedor apagado no se lee como avería', () => {
    const t = leer('web/src/datos/firebase.ts');
    assert.match(t, /auth\/operation-not-allowed/);
    assert.match(t, /El ingreso con Google ya no existe/);
    assert.match(t, /auth\/admin-restricted-operation/);
  });
});

describe('recuperar la contraseña no enumera cuentas', () => {
  test('la frase es UNA, y se devuelve tanto si Firebase acepta como si falla', () => {
    const t = leer('web/src/datos/firebase.ts');
    const fn = t.slice(t.indexOf('export async function pedirEnlaceDeRecuperacion'));
    const cuerpo = fn.slice(0, fn.indexOf('\n}') + 2);
    assert.match(cuerpo, /sendPasswordResetEmail/);
    assert.match(cuerpo, /return FRASE_RECUPERACION;/);
    // Ningún `throw` ni ningún segundo `return` distinto dentro de la función.
    assert.ok(!/throw/.test(cuerpo), 'lanza: distinguiría éxito de fallo');
    assert.equal((cuerpo.match(/return /g) ?? []).length, 1, 'más de un retorno: dos respuestas posibles');
  });
});

describe('/mi-contrasena ya no existe en ninguna capa', () => {
  test('ni la pantalla ni el cliente remoto lo llaman; el componente se borró', () => {
    assert.ok(!existsSync(join(RAIZ, 'web/src/componentes/MiContrasena.tsx')), 'MiContrasena.tsx sigue ahí');
    for (const f of archivosDe('web/src', ['.ts', '.tsx'])) {
      const codigo = sinComentarios(leer(f));
      // La RUTA lleva barra: `className="mi-contrasena"` es una clase de estilo
      // que sigue viva y no tiene nada que ver. Y `\b` para no confundir
      // `CambiarMiContrasena` (lo nuevo) con `MiContrasena` (lo viejo).
      assert.ok(!/\/mi-contrasena|\bponermeContrasena\b|\bMiContrasena\b/.test(codigo), `${f} todavía habla de /mi-contrasena`);
    }
    assert.ok(!/\/mi-contrasena|'mi-contrasena'/.test(sinComentarios(leer('usuarios/src/index.js'))), 'el trabajador aún atiende /mi-contrasena');
  });

  test('cambiar la propia contraseña vive en el navegador, con la actual delante', () => {
    const t = leer('web/src/componentes/Contrasena.tsx');
    assert.match(t, /export function CambiarMiContrasena/);
    assert.match(t, /reauthenticateWithCredential/);
    assert.match(leer('web/src/App.tsx'), /CambiarMiContrasena/);
  });
});

describe('el arranque está cableado de punta a punta', () => {
  test('la pantalla «Inicializar» existe, se decide por la SESIÓN y se monta antes del switch', () => {
    const app = leer('web/src/App.tsx');
    assert.match(app, /import \{ Inicializar \}/);
    const i = app.indexOf('<Inicializar />');
    const s = app.indexOf('switch (d.fase)');
    assert.ok(i > 0 && i < s, 'Inicializar tiene que ir ANTES del switch de datos');
    assert.match(app, /sesion\.claims === null/);
    const ini = leer('web/src/componentes/Inicializar.tsx');
    assert.match(ini, /arrancarSistema\(\)/);
    assert.match(ini, /recargarSesion\(\)/);
    assert.match(ini, /Salga y vuelva a entrar/);
    // Sobre el CÓDIGO, no sobre los comentarios: el aviso que explica la regla la
    // cita con esas mismas palabras, y mirar el texto crudo cazaba el aviso en
    // vez del fallo. Lo que no puede haber es esa frase PINTADA en el camino del
    // arranque — quien mira esta pantalla es el administrador.
    const codigo = sinComentarios(ini);
    assert.ok(!/pida acceso al administrador/i.test(codigo.slice(0, codigo.indexOf('arrancado ?'))),
      'al propietario nunca se le manda a pedir acceso');
  });

  test('el cliente remoto tiene estado, bootstrap y limpieza, y el Worker atiende esas rutas', () => {
    const c = leer('web/src/datos/usuariosRemoto.ts');
    for (const r of ['/estado`', "'/bootstrap'", "'/limpieza-inicial?simular=1'", "'/limpieza-inicial'"]) {
      assert.ok(c.includes(r), `el cliente no llama a ${r}`);
    }
    const w = sinComentarios(leer('usuarios/src/index.js'));
    for (const r of ["'estado'", "'bootstrap'", "'limpieza-inicial'"]) assert.ok(w.includes(r), `el Worker no atiende ${r}`);
    assert.match(c, /X-Limpieza-Token/);
  });

  test('la limpieza en pantalla exige propietario Y `usuarios.gestionar`, por identidad del catálogo', () => {
    const u = leer('web/src/componentes/Usuarios.tsx');
    // Las DOS condiciones, y escritas juntas: la de gestionar ya la garantiza la
    // salida temprana de la pantalla, pero atar una operación IRREVERSIBLE a una
    // guarda que vive a doscientas líneas es cómo se pierde una barrera el día
    // que alguien mueve el bloque.
    assert.match(u, /permisosDe\(quien\?\.claims\)\.esPropietario && gestiona\s*\n?\s*&& <LimpiezaInicial/,
      'la limpieza tiene que exigir propietario Y usuarios.gestionar en el mismo sitio');
    assert.ok(!/rol === 'propietario'/.test(sinComentarios(u)), 'comparación de cadenas prohibida');
    // El secreto no toca ningún almacén del navegador.
    const limpieza = u.slice(u.indexOf('function LimpiezaInicial'));
    assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(limpieza));
  });

  test('el enlace de un solo uso avisa de su caducidad y de lo que significa', () => {
    const u = leer('web/src/componentes/Usuarios.tsx');
    assert.match(u, /Quien vea este enlace entra en esa cuenta/);
    assert.match(u, /Expire after/);
    // La hora exacta se ENSEÑA si el trabajador la manda, y si no se dice el
    // defecto DICIENDO que es el defecto. Nunca se calcula «ahora + 1 h»: el
    // plazo se sube a mano en la consola y el navegador no puede saberlo.
    assert.match(u, /caducidad\s*\n?\s*\? <>Caduca a las <b>\{fecha\(caducidad\)\}<\/b>/,
      'con caducidad del trabajador hay que enseñar la hora exacta');
    assert.match(u, /1 hora por defecto/,
      'sin caducidad del trabajador hay que decir el plazo POR DEFECTO, y que es un defecto');
    const codigo = sinComentarios(u);
    assert.ok(!/3600|60 \* 60|3_600_000/.test(codigo),
      'la caducidad no se calcula en el navegador: sería un dato inventado presentado como medido');
  });
});

describe('índices y dirección del trabajador', () => {
  test('la bitácora de accesos tiene su índice compuesto (orgId, en desc)', () => {
    const d = JSON.parse(leer('firestore.indexes.json'));
    const i = d.indexes.find((x) => x.collectionGroup === 'auditoria_accesos');
    assert.ok(i, 'sin índice la pantalla de bitácora se queda en blanco con «requires an index»');
    assert.deepEqual(i.fields.map((f) => `${f.fieldPath}:${f.order}`), ['orgId:ASCENDING', 'en:DESCENDING']);
  });

  test('VITE_USUARIOS_URL está puesta y coincide con connect-src', () => {
    const env = leer('web/.env.production');
    const m = /^VITE_USUARIOS_URL=(\S+)$/m.exec(env);
    assert.ok(m, 'la dirección del trabajador sigue comentada');
    assert.ok(leer('web/public/_headers').includes(m[1]), 'la CSP no deja hablar con el trabajador');
  });
});
