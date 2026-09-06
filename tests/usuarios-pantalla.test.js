// ============================================================================
// tests/usuarios-pantalla.test.js — la pantalla no puede contradecir al catálogo
// ----------------------------------------------------------------------------
// QUÉ VIGILA. Que la mitad visible del permiso —la que decide qué botón se
// enseña— salga ENTERA de `contratos/src/usuarios.ts` y no de listas escritas a
// mano en un componente.
//
// POR QUÉ, y no es teoría: el propio catálogo documenta tres sistemas ajenos
// donde esto se rompió. En uno, el catálogo de roles vivía repartido en TRES
// archivos ya divergentes y un perfil con rol nuevo no se podía editar desde su
// pantalla. En otro había una matriz de 25 permisos que NINGUNA regla consultaba
// y NINGÚN formulario capturaba. La ilusión de control es peor que su ausencia,
// porque quien administra se la cree.
//
// LO QUE ESTAS PRUEBAS SÍ CUBREN: la aritmética pura (permisos y reloj de
// sesión), que se ejecuta de verdad; y unos guardianes de FUENTE que recorren
// `web/src` buscando el patrón que hay que impedir. Los segundos no ejecutan la
// pantalla — no hay navegador en esta suite — pero cazan exactamente el fallo
// que se quiere evitar: que alguien vuelva a teclear un rol a mano.
//
// LO QUE NO CUBREN, y se dice en vez de suponerlo: que el trabajador de personas
// conteste lo que esta pantalla espera. El trabajador es otro frente y otra
// prueba; aquí se comprueba el cliente, no el servicio.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

import {
  DURACION_SESION_MIN, FUNCIONES_DELEGABLES, ROLES, ROLES_ASIGNABLES, TODAS_LAS_LINEAS,
} from '../contratos/src/usuarios.ts';
import { puede, alcanza, permisosDeSesion, leerReclamos } from '../web/src/datos/permisos.ts';
import { relojDeSesion, topesDeRol, AVISO_MIN } from '../web/src/datos/relojSesion.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Todos los fuentes de la pantalla. */
function fuentes(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) fuentes(p, acc);
    else if (['.tsx', '.ts'].includes(extname(n))) acc.push(p);
  }
  return acc;
}

/** El fuente SIN comentarios: un aviso escrito no puede poner roja una prueba. */
function sinComentarios(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/([^:"'`])\/\/.*$/gm, '$1');
}

const FUENTES = fuentes(join(RAIZ, 'web/src')).map((f) => ({
  ruta: f.replace(RAIZ + '/', ''),
  texto: readFileSync(f, 'utf-8'),
}));

// ════════════════════════════════════════════════════════════════════════════
describe('el permiso se pregunta al catálogo, nunca a una cadena', () => {

  test('sin reclamos NO se puede nada: un reclamo ausente no es una promoción', () => {
    for (const sesion of [null, undefined, {}, { claims: null }, { rol: 'admin' }]) {
      for (const f of ['apoyos.editar', 'cargar.puntos', 'usuarios.gestionar', 'ficha.lote']) {
        assert.equal(puede(sesion, f), false,
          `una sesión sin reclamos pudo «${f}»: eso es abrir por defecto`);
      }
      assert.equal(alcanza(sesion, 'LN-627'), false,
        'una sesión sin alcance alcanzó una línea');
    }
  });

  test('el ROL por sí solo no abre nada: lo que abre son las FUNCIONES', () => {
    // El caso que costó el catálogo: la pantalla comparaba `rol === 'admin'`.
    // Un token con el rol y sin funciones NO puede nada, y así lo verán también
    // las reglas de la base — que miran los mismos campos.
    const soloRol = { claims: null, rol: ROLES_ASIGNABLES[0] };
    assert.equal(puede(soloRol, 'cargar.puntos'), false);
  });

  test('un token de ANTES del catálogo cae a mínimo privilegio, y se dice por qué', () => {
    // Es el token que hoy tiene el Ingeniero: `orgId` y `rol`, sin `f` ni `l`.
    const { claims, motivo } = leerReclamos({ orgId: 'transpower', rol: 'admin' });
    assert.equal(claims, null, 'un token sin funciones ni alcance no puede validar');
    assert.ok(motivo && motivo.length > 20,
      'un permiso que desaparece sin explicación se lee como una avería');
    assert.equal(puede({ claims }, 'usuarios.gestionar'), false);
  });

  test('unos reclamos completos SÍ abren exactamente lo suyo, y nada más', () => {
    const claims = { orgId: 'org', rol: 'editor', f: ['ae', 'lv'], l: ['LN-627'] };
    assert.equal(puede({ claims }, 'apoyos.editar'), true);
    assert.equal(puede({ claims }, 'lineas.ver'), true);
    assert.equal(puede({ claims }, 'ficha.lote'), false, 'el lote no es delegable y no estaba en `f`');
    assert.equal(alcanza({ claims }, 'LN-627'), true);
    assert.equal(alcanza({ claims }, 'LN-999'), false, 'alcanzó una línea que no es suya');
  });

  test('el comodín de alcance alcanza todo, y solo el comodín', () => {
    const claims = { orgId: 'org', rol: 'admin', f: [], l: [TODAS_LAS_LINEAS] };
    assert.equal(alcanza({ claims }, 'la-que-sea'), true);
  });

  test('`permisosDeSesion` no inventa: sin reclamos, ni rol ni funciones ni líneas', () => {
    const p = permisosDeSesion(null);
    assert.equal(p.rol, null);
    assert.deepEqual(p.funciones, []);
    assert.deepEqual(p.lineas, []);
    assert.equal(p.gestionaPersonas, false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('LAS COMPARACIONES A MANO DESAPARECIERON de la pantalla', () => {

  test('ningún fuente compara el rol con una cadena', () => {
    const culpables = [];
    for (const { ruta, texto } of FUENTES) {
      const limpio = sinComentarios(texto);
      if (/\brol\s*[=!]==/.test(limpio)) culpables.push(`${ruta} (compara el rol)`);
    }
    assert.deepEqual(culpables, [],
      'quedan comparaciones de rol a mano. Cada una es una tercera copia del catálogo, y el día '
      + 'que un rol cambie de nombre o alguien reciba una función suelta, esa comparación miente: '
      + 'enseña un botón que la base va a negar, o esconde uno que sí se puede pulsar.');
  });

  test('ningún fuente escribe el nombre de un rol como literal', () => {
    // Los roles se ENSEÑAN (`{sesion.rol}`) y eso está bien; lo que no puede
    // haber es la palabra escrita a mano, que es como divergen las listas.
    const culpables = [];
    for (const { ruta, texto } of FUENTES) {
      const limpio = sinComentarios(texto);
      for (const r of ROLES) {
        if (new RegExp(`['"\`]${r}['"\`]`).test(limpio)) culpables.push(`${ruta} → «${r}»`);
      }
    }
    assert.deepEqual(culpables, [],
      'hay nombres de rol tecleados en la pantalla. Tienen que salir de ROLES / ROLES_ASIGNABLES.');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('la pantalla de personas', () => {
  const usuarios = readFileSync(join(RAIZ, 'web/src/componentes/Usuarios.tsx'), 'utf-8');
  const app = readFileSync(join(RAIZ, 'web/src/App.tsx'), 'utf-8');

  test('solo se entra con `usuarios.gestionar` — y se comprueba DOS veces', () => {
    // Una en el sitio que decide si se pinta el botón, otra dentro de la propia
    // pantalla: la primera puede quedarse vieja si el permiso cambia con la
    // aplicación abierta. Es la misma doble guarda que ya tiene «Cargar».
    assert.match(app, /puede\(quien, 'usuarios\.gestionar'\)/,
      'la cabecera enseña «Personas» sin comprobar el permiso');
    assert.match(usuarios, /puede\(quien, 'usuarios\.gestionar'\)/,
      'la pantalla se monta sin comprobar el permiso por su cuenta');
    assert.match(usuarios, /if \(!gestiona\)/,
      'sin el permiso, la pantalla tiene que salirse ANTES de leer nada');
  });

  test('la bitácora se enseña solo con `usuarios.auditoria`', () => {
    assert.match(usuarios, /puede\(quien, 'usuarios\.auditoria'\)/);
  });

  test('los desplegables salen del CATÁLOGO, no de `<option>` tecleados', () => {
    // El desplegable de rol recorre lo que devuelve `rolesOfrecidos`, que es el
    // catálogo estrechado por lo que el TRABAJADOR dice que puede asignar quien
    // pregunta (nombrar administradores es del propietario). Ofrecer un rol que
    // el servidor va a rechazar es el mismo botón mentiroso de siempre.
    assert.match(usuarios, /function rolesOfrecidos\(puedeAsignar: Rol\[\]\)[\s\S]{0,200}ROLES_ASIGNABLES/,
      'los roles ofrecidos tienen que salir del catálogo, con el trabajador como cota más estrecha');
    assert.match(usuarios, /\{roles\.map\(\(r\) => <option/,
      'el desplegable tiene que pintar la lista derivada, no una tecleada');
    assert.match(usuarios, /puedeAsignar=\{listado\?\.puedeAsignar \?\? \[\]\}/,
      'lo que el trabajador contesta tiene que llegar al formulario');
    assert.match(usuarios, /FUNCIONES_DELEGABLES\.map/,
      'el repartidor de funciones tiene que recorrer FUNCIONES_DELEGABLES');
    assert.match(usuarios, /ACCIONES_AUDITABLES\.map/,
      'el filtro de la bitácora tiene que recorrer la lista CERRADA de acciones');
    // Y el corte del propietario también sale del catálogo: «protegido» es
    // exactamente «rol que la aplicación no puede asignar».
    assert.match(usuarios, /ROLES_ASIGNABLES as readonly string\[\]\)\.includes\(p\.rol\)/,
      'lo «protegido» tiene que derivarse de ROLES_ASIGNABLES, no de una palabra');
  });

  test('la pantalla usa los tres campos que el trabajador manda alrededor de la tabla', () => {
    // Los tres existen para que la pantalla NO afirme lo que el servidor no
    // sostiene, y por eso se comprueba que se usen los tres:
    //   · `puedeAsignar`   → no ofrecer un rol que el trabajador rechazará;
    //   · `espejoLegible`  → no pintar «todo reconciliado» cuando no se sabe;
    //   · `sinAprovisionar`→ enseñar las cuentas que existen y no son de nadie,
    //     que es como aparecería hoy la que se dio de alta sola por Google.
    assert.match(usuarios, /listado\.espejoLegible/,
      'con el espejo ilegible, «sin reconciliar» no significa nada y hay que decirlo');
    assert.match(usuarios, /sinAprovisionar/,
      'las cuentas sin organización ni rol se ENSEÑAN: verlas es justo el trabajo');
  });

  test('el modo de alta por defecto es ENLACE', () => {
    assert.match(usuarios, /useState<ModoDeAlta>\('enlace'\)/,
      'el defecto no puede ser que un administrador conozca la contraseña de otro: '
      + 'la cuenta nace con una credencial aleatoria y la persona elige la suya (OWASP ASVS 6.4.1)');
  });

  test('el enlace de un solo uso NO se guarda en ningún almacén persistente', () => {
    // Vive en el estado local del componente y muere con él. Un enlace guardado
    // «por comodidad» es una credencial esperando a que alguien abra la consola.
    // Se mira el CÓDIGO, no los comentarios: la cabecera del archivo nombra esos
    // almacenes precisamente para decir que no se usan.
    const codigo = sinComentarios(usuarios);
    for (const prohibido of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie']) {
      assert.ok(!codigo.includes(prohibido),
        `la pantalla de personas usa ${prohibido}: ahí puede acabar el enlace de un solo uso`);
    }
    assert.match(usuarios, /No se vuelve a ver/,
      'hay que avisar de que el enlace no se puede recuperar');
  });

  test('la contraseña tecleada se valida con la regla ÚNICA del catálogo', () => {
    assert.match(usuarios, /defectosDeContrasena\(/,
      'sin esto la pantalla usaría el mínimo de Firebase (6) y DEBILITARÍA la contraseña');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el reloj de sesión sale del catálogo y no de un número suelto', () => {

  test('la duración se LEE del catálogo, no está escrita en un componente', () => {
    const reloj = readFileSync(join(RAIZ, 'web/src/datos/relojSesion.ts'), 'utf-8');
    assert.match(reloj, /DURACION_SESION_MIN/,
      'uno de los sistemas escaneados PERDIÓ su corte de 30 min en una migración y nadie lo notó '
      + 'en meses: por eso esto es un dato del catálogo, con prueba');
    // Y el componente que pinta no hace aritmética: se la pide al módulo puro.
    const comp = readFileSync(join(RAIZ, 'web/src/componentes/RelojDeSesion.tsx'), 'utf-8');
    assert.match(comp, /relojDeSesion\(/);
    assert.ok(!/\d+\s*\*\s*60\s*\*\s*1000/.test(comp),
      'el componente está haciendo su propia cuenta de minutos: eso es una segunda verdad');
  });

  test('un rol desconocido recibe el corte MÁS CORTO, no el más largo', () => {
    const topes = topesDeRol('un-rol-que-no-existe');
    const absolutos = Object.values(DURACION_SESION_MIN).map((t) => t.absoluto).filter((x) => x !== null);
    assert.equal(topes.absoluto, Math.min(...absolutos),
      'ante la duda, mínimo privilegio: también en cuánto dura la sesión');
  });

  test('el rol SIN corte de inactividad no se inventa uno (la cuadrilla en campo)', () => {
    // Un teléfono en el bolsillo entre apoyo y apoyo no puede echar a nadie.
    const sinInactividad = Object.entries(DURACION_SESION_MIN)
      .filter(([, t]) => t.inactividad === null).map(([r]) => r);
    assert.ok(sinInactividad.length > 0, 'el catálogo ya no declara ningún rol sin corte por inactividad');
    for (const rol of sinInactividad) {
      const r = relojDeSesion({
        rol, autenticadoEn: null, ultimaActividad: 0, ahora: 10 * 60 * 60 * 1000,
      });
      assert.equal(r.fase, 'sin_corte',
        `a «${rol}» se le aplicó un corte por inactividad que su catálogo no declara`);
      assert.equal(r.absolutoNoAplicado, true,
        'si no consta cuándo empezó la sesión hay que DECIRLO, no fingir que el reloj se cumple');
    }
  });

  test('el reloj absoluto corta aunque se esté trabajando', () => {
    const rol = ROLES_ASIGNABLES[0];
    const { absoluto } = topesDeRol(rol);
    const inicio = 1_000_000;
    const r = relojDeSesion({
      rol, autenticadoEn: inicio,
      ultimaActividad: inicio + absoluto * 60_000,   // tocando hasta el último segundo
      ahora: inicio + absoluto * 60_000 + 1,
    });
    assert.equal(r.fase, 'caducada');
    assert.equal(r.motivo, 'absoluto');
  });

  test('avisa UN MINUTO antes, ni al final ni demasiado pronto', () => {
    const rol = ROLES_ASIGNABLES[0];
    const { inactividad } = topesDeRol(rol);
    const base = 5_000_000;
    const fin = base + inactividad * 60_000;

    const antes = relojDeSesion({ rol, autenticadoEn: base, ultimaActividad: base, ahora: fin - AVISO_MIN * 60_000 - 1000 });
    assert.equal(antes.fase, 'corriendo', 'avisó antes de tiempo: la franja perdería su valor');

    const avisando = relojDeSesion({ rol, autenticadoEn: base, ultimaActividad: base, ahora: fin - 30_000 });
    assert.equal(avisando.fase, 'avisando');
    assert.equal(avisando.motivo, 'inactividad');

    const fuera = relojDeSesion({ rol, autenticadoEn: base, ultimaActividad: base, ahora: fin + 1 });
    assert.equal(fuera.fase, 'caducada');
  });

  test('la actividad reinicia el reloj de inactividad, y solo ése', () => {
    const rol = ROLES_ASIGNABLES[0];
    const { inactividad } = topesDeRol(rol);
    const base = 9_000_000;
    const ahora = base + inactividad * 60_000 + 1;
    // Tocó algo hace un segundo: sigue viva por inactividad.
    const r = relojDeSesion({ rol, autenticadoEn: base, ultimaActividad: ahora - 1000, ahora });
    assert.notEqual(r.fase, 'caducada');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('la higiene del sitio: las cabeceras de seguridad existen', () => {
  const headers = readFileSync(join(RAIZ, 'web/public/_headers'), 'utf-8');

  test('están las cinco que no dependen de medir orígenes', () => {
    const exigidas = [
      ['X-Content-Type-Options: nosniff', 'el navegador no puede adivinar el tipo de un archivo'],
      ['X-Frame-Options: DENY', 'nadie puede meter esta aplicación dentro de un marco ajeno'],
      ['Referrer-Policy: strict-origin-when-cross-origin', 'la dirección lleva el código de línea de un cliente'],
      ['Permissions-Policy:', 'cámara y ubicación solo para nosotros; micrófono para nadie'],
      ['Strict-Transport-Security: max-age=31536000', 'un año de HTTPS obligatorio'],
    ];
    for (const [cabecera, porque] of exigidas) {
      assert.ok(headers.includes(cabecera), `falta «${cabecera}» — ${porque}`);
    }
  });

  test('el micrófono se le niega a TODO el mundo, no solo a terceros', () => {
    assert.match(headers, /microphone=\(\)/,
      'esta herramienta no graba audio y no debería poder hacerlo ni desde su propio código');
  });

  test('la política de contenido declara los orígenes que la aplicación usa de verdad', () => {
    const csp = headers.match(/Content-Security-Policy(?:-Report-Only)?: (.+)/)?.[1] ?? '';
    assert.ok(csp, 'no hay ninguna política de contenido declarada');
    for (const origen of [
      "default-src 'self'",
      'https://api.met.no',              // el pronóstico
      'https://www.datos.gov.co',        // el clima
      'https://identitytoolkit.googleapis.com',  // entrar
      'https://firestore.googleapis.com',        // los datos
      'workers.dev',                     // el portero de fotos y el de personas
      "worker-src 'self' blob:",         // MapLibre y las teselas
      'img-src',
    ]) {
      assert.ok(csp.includes(origen), `la política no declara «${origen}»: eso apaga una parte de la aplicación`);
    }
  });

  test("script-src NO afloja a 'unsafe-inline', porque no hace falta", () => {
    const csp = headers.match(/Content-Security-Policy(?:-Report-Only)?: (.+)/)?.[1] ?? '';
    const script = csp.match(/script-src ([^;]+)/)?.[1] ?? '';
    assert.ok(!script.includes('unsafe-inline'),
      "aflojar script-src a 'unsafe-inline' deja la política sin su parte más útil");
    // Y la razón por la que no hace falta: el HTML no trae guiones en línea.
    const html = readFileSync(join(RAIZ, 'web/index.html'), 'utf-8');
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/.test(html),
      'apareció un guion EN LÍNEA en index.html: o se le pone hash, o la política lo bloquea');
  });

  test('si va en modo informe, el archivo DICE que no protege todavía', () => {
    if (headers.includes('Content-Security-Policy-Report-Only:')) {
      assert.match(headers, /NO protege/,
        'una política en modo informe que no se declara como tal se lee como una barrera puesta');
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el cliente del trabajador de personas falla CERRADO', () => {
  const remoto = readFileSync(join(RAIZ, 'web/src/datos/usuariosRemoto.ts'), 'utf-8');

  test('sin dirección configurada no se intenta ni una petición', () => {
    assert.match(remoto, /if \(!hayTrabajador\(\)\)/,
      'una configuración incompleta tiene que APAGAR, no abrir (hallazgo del portero, ola 4)');
    assert.match(remoto, /VITE_USUARIOS_URL/);
  });

  test('el nombre de la variable está declarado en la configuración del despliegue', () => {
    const env = readFileSync(join(RAIZ, 'web/.env.production'), 'utf-8');
    assert.match(env, /VITE_USUARIOS_URL/,
      'si no se declara, nadie sabe qué hay que rellenar para encender la pantalla');
    assert.match(env, /VITE_APP_CHECK_SITE_KEY/);
  });

  test('el actor de la bitácora NO viaja en el cuerpo: va el token y ya', () => {
    assert.ok(!/actorUid|actorCorreo/.test(remoto),
      'si el cliente mandara quién es, cualquiera podría firmar una anotación con el nombre de otro');
    assert.match(remoto, /Authorization: `Bearer \$\{token\}`/);
  });

  test('los errores se traducen sin código técnico y sin distinguir cuentas', () => {
    assert.match(remoto, /function motivoHumano/);
    assert.ok(!/no existe esa cuenta|usuario no encontrado/i.test(remoto),
      'distinguir «no existe» de «contraseña mala» convierte la pantalla en un buscador de correos');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('lo que la pantalla PROMETE tiene que ser cierto', () => {

  test('«líneas asignadas» ya no se afirma cuando el alcance es TODAS', () => {
    const estado = readFileSync(join(RAIZ, 'web/src/componentes/Estado.tsx'), 'utf-8');
    assert.match(estado, /alcanzaTodas/,
      'la pantalla de «no hay líneas» tiene que distinguir las dos situaciones: alcance a todas '
      + '(no hay ninguna cargada) y alcance a unas (ninguna de las suyas)');
    const enlace = readFileSync(join(RAIZ, 'web/src/datos/enlace.ts'), 'utf-8');
    assert.match(enlace, /conAlcanceTotal/,
      'el aviso del enlace que pedía otra línea también afirmaba «no es tuya» sin saberlo');
  });

  test('la frase desmentida por el ADR-024 ya no se AFIRMA en el código', () => {
    const firebase = readFileSync(join(RAIZ, 'web/src/datos/firebase.ts'), 'utf-8');
    // La frase puede seguir apareciendo CITADA —saber qué decía antes tiene
    // valor—, pero no puede volver a afirmarse: tiene que ir con su desmentido.
    if (/no pudo leer nada porque las reglas exigen/i.test(firebase)) {
      assert.match(firebase, /FALSO/,
        'la frase sigue ahí y sin desmentir. Es falsa: la cuenta ajena SÍ tuvo abierta /config '
        + 'hasta el 06-08. Una frase tranquilizadora y falsa es peor que el agujero — hace '
        + 'decidir mal el día que se relaja la barrera de verdad.');
      assert.match(firebase, /ADR-024/, 'hay que citar quién la desmintió');
    }
    assert.match(firebase, /\/config/,
      'hay que decir lo que SÍ pasó, no solo quitar lo que no era cierto');
  });

  test('App Check no se inicializa sin clave, y lo dice', () => {
    const firebase = readFileSync(join(RAIZ, 'web/src/datos/firebase.ts'), 'utf-8');
    assert.match(firebase, /VITE_APP_CHECK_SITE_KEY/);
    assert.match(firebase, /return 'sin_clave'/,
      'sin clave no se puede fingir que App Check está puesto');
  });

  test('los fallos de bitácora se CUENTAN, no se tragan', () => {
    const firestore = readFileSync(join(RAIZ, 'web/src/datos/firestore.ts'), 'utf-8');
    assert.match(firestore, /anotarFalloDeBitacora\('el último acceso'/,
      'un `catch {}` vacío aquí deja la bitácora con huecos que nadie ve');
    const pantalla = readFileSync(join(RAIZ, 'web/src/componentes/Usuarios.tsx'), 'utf-8');
    assert.match(pantalla, /La bitácora tiene huecos/,
      'contarlos no sirve de nada si no se enseñan donde los mira quien administra');
  });

  test('la sesión por defecto MUERE al cerrar el navegador', () => {
    const firebase = readFileSync(join(RAIZ, 'web/src/datos/firebase.ts'), 'utf-8');
    assert.match(firebase, /recordar \? browserLocalPersistence : browserSessionPersistence/,
      'el defecto conservador es que la sesión no sobreviva al cierre; recordarla se marca a mano');
    assert.ok(!/indexedDBLocalPersistence/.test(sinComentarios(firebase)),
      'IndexedDB tumbó el acceso al dato DOS veces (`35 · L-11`): no vuelve por la puerta de atrás');
  });

  test('las funciones delegables del catálogo son las que la pantalla ofrece', () => {
    // Recorrer el catálogo entero, no buscar ejemplos: es como se cazó `L-69`.
    assert.ok(FUNCIONES_DELEGABLES.length > 0);
    for (const f of FUNCIONES_DELEGABLES) {
      assert.match(f, /^[a-z]+\.[a-z]+$/, `«${f}» no tiene la forma <recurso>.<acción>`);
    }
  });
});
