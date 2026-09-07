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
  CODIGOS_FUNCION, DURACION_SESION_MIN, FUNCIONES, FUNCIONES_DELEGABLES, FUNCIONES_POR_ROL,
  ROLES, ROLES_ASIGNABLES, funcionesEfectivas,
  TODAS_LAS_LINEAS,
} from '../contratos/src/usuarios.ts';
import { PAGINA_DE_AUDITORIA, repositorioSinSesion } from '../web/src/datos/repositorio.ts';
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
    // ⚠️ CAMBIÓ EL QUÉ, y por un fallo medido (2026-09-06). Recorría solo
    // `FUNCIONES_DELEGABLES`, y con eso una función no delegable NO se podía
    // QUITAR desde la pantalla — aunque el catálogo siempre lo permitió
    // (`funcionesEfectivas` borra cualquier quitada). Ahora recorre el catálogo
    // entero y son las OPCIONES las que se separan: «añadir» solo en las
    // delegables, «quitar» en todas las que el rol traiga.
    assert.match(usuarios, /CODIGOS_FUNCION\.map/,
      'el repartidor de funciones tiene que recorrer el catálogo entero');
    assert.match(usuarios, /\{delegable && <option value="extra">añadir<\/option>\}/,
      'añadir una función NO delegable es un botón que el trabajador tira con 400');
    assert.match(usuarios, /\{deSerie\.has\(f\) && <option value="quitada">quitar<\/option>\}/,
      'quitar tiene que ofrecerse en todas las que el rol traiga: recortar no da poder');
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


// ════════════════════════════════════════════════════════════════════════════
// LA BITÁCORA SE PAGINA (`99 §ADR-100`)
// ----------------------------------------------------------------------------
// Antes se pedían 200 anotaciones de golpe y punto. La bitácora crece para
// siempre —cada acceso y cada cambio de permiso deja una línea—, así que abrir
// la pantalla de personas era una descarga que crecía sola y que en Firestore se
// paga documento a documento, mire alguien o no.
//
// Lo que estas pruebas vigilan no es el número: es que el TESTIGO de la página
// siguiente salga de lo LEÍDO y no de lo filtrado. Los filtros de acción y de
// persona se aplican en el cliente; si el testigo saliera de la lista ya
// filtrada, cada «Ver más» se saltaría en silencio todas las anotaciones que el
// filtro descartó — una bitácora con huecos que nadie ve, que es exactamente lo
// que una bitácora existe para que no pase.
// ════════════════════════════════════════════════════════════════════════════
describe('la bitácora de accesos se lee por páginas, sin huecos', () => {
  const firestore = readFileSync(join(RAIZ, 'web/src/datos/firestore.ts'), 'utf-8');
  const usuarios = readFileSync(join(RAIZ, 'web/src/componentes/Usuarios.tsx'), 'utf-8');
  const consulta = firestore.slice(
    firestore.indexOf('async listarAuditoria'),
    firestore.indexOf('async dejarReciboContrasena'),
  );

  test('el tamaño de página es UNO solo: el que consulta y el que se anuncia', () => {
    // La pantalla dice en voz alta «se trae de 50 en 50». Si ese número viviera
    // tecleado en el componente y el otro en la consulta, el aviso sería mentira
    // en cuanto uno de los dos cambiara.
    assert.equal(PAGINA_DE_AUDITORIA, 50);
    assert.match(consulta, /filtro\.tope \?\? PAGINA_DE_AUDITORIA/,
      'la consulta tiene que usar la constante del molde, no un número suelto');
    assert.match(usuarios, /\{PAGINA_DE_AUDITORIA\} en \{PAGINA_DE_AUDITORIA\}/,
      'la pantalla tiene que anunciar el MISMO número que consulta');
  });

  test('la página siguiente se pide con `startAfter`, no releyendo desde el principio', () => {
    assert.match(consulta, /startAfter/,
      'sin cursor, «ver más» tendría que releer todo lo anterior: se paga dos veces lo mismo');
    assert.match(consulta, /limit\(cuantas\)/);
    assert.match(consulta, /orderBy\('en', 'desc'\)/,
      'sin orden estable el cursor no significa nada');
    assert.match(consulta, /where\('orgId', '==', orgId\)/,
      'en Firestore las reglas NO son filtros: sin declarar el orgId la consulta ENTERA se niega');
  });

  test('⚠️ el testigo sale de lo LEÍDO, nunca de lo filtrado', () => {
    // El orden de las líneas es la prueba: el cursor se calcula ANTES de que se
    // apliquen los filtros de acción y de persona.
    const iCursor = consulta.indexOf('const cursor =');
    const iFiltro = consulta.indexOf('filtro.accion || x.accion');
    assert.ok(iCursor > 0 && iFiltro > 0, 'no se encontraron el cursor y los filtros');
    assert.ok(iCursor < iFiltro,
      'el cursor se calcula después de filtrar: cada «Ver más» se saltaría lo que el filtro '
      + 'descartó y la bitácora tendría huecos invisibles');
    assert.match(consulta, /s\.docs\.length === cuantas/,
      'que quede más o no se decide con lo LEÍDO (una página corta es el final), no con lo filtrado');
  });

  test('sin sesión la bitácora falla CERRADA, con la forma de página completa', async () => {
    // Se ejecuta de verdad: una forma distinta aquí reventaría la pantalla al
    // leer `p.filas` de algo que no lo tiene.
    const p = await repositorioSinSesion.listarAuditoria();
    assert.deepEqual(p, { filas: [], cursor: null });
  });

  test('la pantalla ofrece «Ver más» mientras haya testigo, y AÑADE en vez de sustituir', () => {
    assert.match(usuarios, /Ver más/, 'sin botón, el resto de la bitácora es invisible');
    assert.match(usuarios, /setFilas\(\(xs\) => \[\.\.\.\(xs \?\? \[\]\), \.\.\.p\.filas\]\)/,
      'la página nueva se AÑADE: sustituir obligaría a empezar de cero para releer lo anterior');
    assert.match(usuarios, /desde: cursor/, 'el testigo tiene que volver al repositorio tal cual');
    // Cambiar el filtro empieza una lectura nueva: seguir con el testigo viejo
    // mezclaría dos consultas distintas.
    const efecto = usuarios.slice(usuarios.indexOf('// La primera página'), usuarios.indexOf('const verMas'));
    assert.match(efecto, /setCursor\(null\)/, 'al cambiar de filtro hay que soltar el testigo viejo');
  });

  test('con cero filas y testigo vivo NO se afirma que no hay nada', () => {
    // «Ninguna de las traídas cumple el filtro» y «no hay ninguna» son cosas
    // distintas, y confundirlas es la misma familia de fallo que el espejo
    // ilegible pintado como espejo sano (`32 · L-44`).
    assert.match(usuarios, /Quedan más atrás: pulse «Ver más»/);
    assert.match(usuarios, /se leyó la bitácora entera/);
  });

  test('el índice compuesto que esta consulta necesita EXISTE, y el que no, no se inventa', () => {
    const idx = JSON.parse(readFileSync(join(RAIZ, 'firestore.indexes.json'), 'utf-8'));
    const auditoria = idx.indexes.find((x) => x.collectionGroup === 'auditoria_accesos');
    assert.ok(auditoria, 'sin él la pantalla se queda en blanco con «the query requires an index»');
    assert.deepEqual(auditoria.fields.map((f) => `${f.fieldPath}:${f.order}`),
      ['orgId:ASCENDING', 'en:DESCENDING']);

    // ⚠️ MEDIDO, NO SUPUESTO. El índice `usuarios (orgId, correo)` NO está, y no
    // es un olvido: la lista de personas la sirve el TRABAJADOR, y de la
    // colección `usuarios` esta aplicación solo lee documentos sueltos por uid.
    // Un índice que nadie usa cuesta escrituras en cada alta y hace creer que
    // hay una consulta que no existe. Si algún día aparece esa consulta, esta
    // prueba se pone roja y obliga a añadir el índice.
    const firestoreLimpio = sinComentarios(firestore);
    assert.ok(!/collection\((?:await )?baseDatos\(\), 'usuarios'\)/.test(firestoreLimpio),
      'apareció una consulta de colección sobre `usuarios`: ahora SÍ hace falta su índice compuesto');
    assert.ok(!idx.indexes.some((x) => x.collectionGroup === 'usuarios'),
      'hay un índice de `usuarios` que ninguna consulta usa');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('la pantalla de personas dice lo que las cosas SIGNIFICAN', () => {
  const usuarios = readFileSync(join(RAIZ, 'web/src/componentes/Usuarios.tsx'), 'utf-8');

  test('los chips de funciones enseñan la descripción del CATÁLOGO, no una tecleada', () => {
    // `usuarios.gestionar` no le dice nada a nadie; la frase del catálogo sí. Y
    // tiene que salir del catálogo: teclearla sería la segunda copia, y el día
    // que una función cambie de alcance la pantalla mentiría.
    assert.match(usuarios, /FUNCIONES\[f\]\?\.que/,
      'la descripción tiene que leerse de FUNCIONES[f].que');
    assert.match(usuarios, /title=\{`\$\{queHace\(f\)\}/,
      'cada chip tiene que llevar encima lo que esa función abre');
    // Ninguna de las frases del catálogo está copiada a mano en la pantalla.
    const copiadas = Object.values(FUNCIONES)
      .map((x) => x.que)
      .filter((q) => usuarios.includes(q));
    assert.deepEqual(copiadas, [],
      'hay descripciones de función tecleadas en la pantalla: son la segunda copia del catálogo');
  });

  test('el repartidor de funciones dice qué abre cada una', () => {
    const repartidor = usuarios.slice(
      usuarios.indexOf('function AjustesDeFunciones'), usuarios.indexOf('// ── El repartidor de alcance'));
    assert.match(repartidor, /queHace\(f\)/,
      'quien reparte permisos no tiene por qué saberse de memoria qué abre `hipotesis.editar`');
  });

  test('«Reemitir enlace» es el PRIMER botón de la fila', () => {
    // Es el gesto que desatasca a quien se quedó fuera de su propia herramienta:
    // el enlace caduca y se gasta al primer uso. Enterrado entre «Editar» y
    // «Reconciliar» costaba una llamada de teléfono.
    // Sin comentarios: el aviso que explica POR QUÉ va primero nombra a los
    // demás botones, y buscarlos en el texto crudo daría el orden del comentario
    // en vez del orden real de la fila.
    const codigo = sinComentarios(usuarios);
    const fila = codigo.slice(
      codigo.indexOf('<div className="usr-fila-acciones">'),
      codigo.indexOf('Reconciliar'));
    const orden = ['Reemitir enlace', 'Editar', 'Deshabilitar', 'Reponer contraseña']
      .map((rotulo) => ({ rotulo, donde: fila.indexOf(`'${rotulo}'`) }))
      .filter((x) => x.donde >= 0)
      .sort((a, b) => a.donde - b.donde);
    assert.ok(orden.length >= 3, 'no se reconocieron los botones de la fila');
    assert.equal(orden[0].rotulo, 'Reemitir enlace',
      `el primer botón de la fila es «${orden[0].rotulo}»: reemitir el enlace tiene que ir primero`);
    assert.ok(!/>\s*Emitir enlace/.test(usuarios),
      'quedó el rótulo viejo «Emitir enlace»: la fila REEMITE, la primera emisión va en el alta');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('la limpieza inicial: irreversible, ensayada y sin guardar el secreto', () => {
  const usuarios = readFileSync(join(RAIZ, 'web/src/componentes/Usuarios.tsx'), 'utf-8');
  const limpieza = usuarios.slice(usuarios.indexOf('function LimpiezaInicial'));
  const remoto = readFileSync(join(RAIZ, 'web/src/datos/usuariosRemoto.ts'), 'utf-8');

  test('la sección no se monta sin propietario, y la identidad sale del catálogo', () => {
    assert.match(usuarios, /permisosDe\(quien\?\.claims\)\.esPropietario && gestiona/,
      'las dos condiciones, y en el mismo sitio que monta la operación irreversible');
    // El guardián de «cero comparaciones de rol a mano» ya vigila el resto del
    // archivo; aquí se comprueba que esta sección concreta tampoco lo haga.
    const limpio = sinComentarios(limpieza);
    for (const r of ROLES) {
      assert.ok(!new RegExp(`['"\`]${r}['"\`]`).test(limpio),
        `la limpieza compara con la palabra «${r}» en vez de preguntar por la identidad`);
    }
  });

  test('primero se ENSAYA: sin lista delante no hay botón de borrar', () => {
    assert.match(limpieza, /ensayarLimpieza\(\)/);
    assert.match(limpieza, /Ensayar \(no borra nada\)/);
    assert.match(limpieza, /\{ensayo && \(/,
      'la tabla y los campos de confirmación solo existen DESPUÉS del ensayo');
    assert.match(remoto, /'\/limpieza-inicial\?simular=1'/);
  });

  test('el POST manda EXACTAMENTE lo que devolvió el ensayo', () => {
    // Si el padrón cambió entre el ensayo y el borrado, el trabajador rechaza:
    // por eso viajan el total y los uids del ensayo, no los que la pantalla
    // recomponga por su cuenta.
    assert.match(limpieza, /ejecutarLimpieza\(secreto, \{ total: actual\.total, uids: actual\.uids, orgId: actual\.orgId \}\)/,
      'lo que se manda tiene que ser el cuerpo del ensayo, sin recomponer nada');
    assert.match(remoto, /confirmacion: 'BORRAR'/);
    assert.match(limpieza, /confirmacion !== 'BORRAR'/,
      'hay que teclear BORRAR: un clic no puede bastar para lo irreversible');
  });

  test('el secreto viaja en cabecera y NO toca ningún almacén del navegador', () => {
    assert.match(remoto, /'X-Limpieza-Token': secreto/);
    for (const prohibido of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie']) {
      assert.ok(!limpieza.includes(prohibido), `el secreto de limpieza puede acabar en ${prohibido}`);
    }
    assert.match(limpieza, /type="password"/,
      'el secreto no se teclea a la vista de quien pase por detrás');
    // Se repite mientras el trabajador conteste que quedan cuentas (202).
    assert.match(limpieza, /if \(r\.terminado\) break;/,
      'sin reanudar, a partir de ~12 cuentas la limpieza moría a mitad (límite del plan gratuito)');
  });

  test('el texto avisa de lo que es: definitivo, con lápida, y revocación inmediata', () => {
    assert.match(limpieza, /<b>Definitivo\.<\/b>/);
    assert.match(limpieza, /lápida/);
    assert.match(limpieza, /REVOCADOS_ANTES_DE/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('cambiar la propia contraseña: en el navegador, con la actual delante', () => {
  const contrasena = readFileSync(join(RAIZ, 'web/src/componentes/Contrasena.tsx'), 'utf-8');

  test('reutiliza el formulario que ya existía en vez de duplicarlo', () => {
    // Una segunda pantalla de cambio de contraseña es una segunda regla de
    // validación esperando a divergir de la del catálogo.
    assert.match(contrasena, /export function CambiarMiContrasena/);
    assert.match(contrasena, /<Contrasena correo=\{correo\} obligatoria=\{false\} \/>/,
      'el autoservicio tiene que montar el MISMO formulario, no una copia');
  });

  test('el botón se ofrece a quien entra con CONTRASEÑA, y el proveedor sale del catálogo', () => {
    const app = readFileSync(join(RAIZ, 'web/src/App.tsx'), 'utf-8');
    assert.match(app, /PROVEEDOR_CONTRASENA/,
      'la palabra «password» no se teclea: el proveedor tiene su constante en `contratos/acceso.ts`');
    assert.match(app, /proveedor !== null && proveedor !== PROVEEDOR_CONTRASENA/,
      'solo se esconde cuando se SABE que entró de otra forma');
    // ⚠️ Con el proveedor ilegible el botón SE SIGUE ENSEÑANDO. Esconderlo por un
    // token que tardó dejaría a la persona sin poder cambiar su contraseña y no
    // cerraría ninguna puerta: el formulario exige la actual de todas formas.
    // Es `35 · L-11`: una capa de comodidad no tiene veto sobre una esencial.
    assert.ok(!/proveedor === PROVEEDOR_CONTRASENA && <CambiarMiContrasena/.test(app),
      'con esa forma, un token ilegible escondería el autoservicio sin ganar nada');
  });

  test('pide la actual y la nueva dos veces, y valida con la regla del catálogo', () => {
    assert.match(contrasena, /reauthenticateWithCredential/,
      'sin reautenticar, un portátil abierto una hora cambia la contraseña de su dueño');
    assert.match(contrasena, /defectosDeContrasena\(/,
      'sin esto se usaría el mínimo de Firebase (6) y se DEBILITARÍA la contraseña');
    assert.equal((contrasena.match(/autoComplete="new-password"/g) ?? []).length >= 2, true,
      'la nueva se teclea dos veces');
    assert.match(contrasena, /autoComplete="current-password"/,
      'la actual es un campo aparte: es la que prueba que es usted');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('los mensajes de acceso no enumeran cuentas (`99 §ADR-100`)', () => {
  const firebase = readFileSync(join(RAIZ, 'web/src/datos/firebase.ts'), 'utf-8');
  const motivo = firebase.slice(
    firebase.indexOf('export function motivoDeFallo'), firebase.indexOf('FRASE_RECUPERACION'));

  test('«no existe» y «contraseña mala» siguen dando la MISMA frase', () => {
    // Firebase los unifica a propósito. Deshacer esa unificación por ser más
    // amable convierte el formulario en un buscador de correos dados de alta.
    assert.match(motivo, /auth\/invalid-credential' \|\| c === 'auth\/wrong-password' \|\| c === 'auth\/user-not-found'/);
    assert.equal((motivo.match(/Correo o contraseña incorrectos\./g) ?? []).length, 1,
      'hay más de una frase para el mismo caso: alguna distingue lo que no se debe distinguir');
    assert.ok(!/esa cuenta no existe|no hay ninguna cuenta/i.test(motivo));
  });

  test('los dos códigos del corte de acceso tienen su frase', () => {
    // Una pestaña abierta desde antes del despliegue conserva el botón viejo; y
    // el registro está cerrado en la consola, así que un alta por la API muere.
    assert.match(motivo, /auth\/operation-not-allowed/);
    assert.match(motivo, /El ingreso con Google ya no existe/);
    assert.match(motivo, /auth\/admin-restricted-operation/);
    assert.match(motivo, /El registro de cuentas está cerrado/);
  });

  test('«olvidé mi contraseña» tiene UNA sola frase, y está cableada a la pantalla', () => {
    assert.match(firebase, /export const FRASE_RECUPERACION = /);
    const app = readFileSync(join(RAIZ, 'web/src/App.tsx'), 'utf-8');
    assert.match(app, /pedirEnlaceDeRecuperacion/);
    assert.match(app, /onRecuperar=\{recuperar\}/,
      'la función existe pero la pantalla de acceso no la recibe');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('«Inicializar sistema»: se decide por la SESIÓN, antes de leer una línea', () => {
  const app = readFileSync(join(RAIZ, 'web/src/App.tsx'), 'utf-8');
  const ini = readFileSync(join(RAIZ, 'web/src/componentes/Inicializar.tsx'), 'utf-8');

  test('un token sin reclamos cae en la pantalla de arranque, no en la de ERROR de línea', () => {
    // Lo midió el comité: hoy esa persona veía un «Reintentar» que no lleva a
    // ninguna parte, porque el fallo no está en la línea sino en su token.
    assert.match(app, /sesion\.fase === 'autenticado' && sesion\.claims === null/);
    assert.ok(app.indexOf('<Inicializar />') < app.indexOf('switch (d.fase)'),
      'la decisión tiene que tomarse ANTES de mirar el estado de los datos');
  });

  test('tras arrancar se relee el token dos veces, y si sigue vacío se ofrece SALIR', () => {
    assert.match(ini, /for \(let intento = 0; intento < 2; intento \+= 1\)/,
      'el token sigue viejo hasta que se renueve: hay que forzar la relectura');
    assert.match(ini, /recargarSesion\(\)/);
    assert.match(ini, /Salga y vuelva a entrar/);
    // Al propietario NUNCA se le manda a pedir acceso: es él.
    const caminoDeArranque = ini.slice(ini.indexOf('{sinPermisoTrasArrancar'), ini.indexOf('<div className="rca-guardar">'));
    assert.ok(!/pídaselo a quien lo\s+administra/i.test(caminoDeArranque));
  });

  test('el 409 NO es un fallo seco: también relee el token (arranque ya hecho)', () => {
    assert.match(ini, /e\.estado === 409/,
      'sin esto, repetir el arranque desde una pestaña vieja parecería un error y no una reparación');
  });

  test('los reclamos escritos se ENSEÑAN antes de dar el paso por bueno', () => {
    for (const campo of ['resultado.reclamos.rol', 'resultado.reclamos.orgId',
      'resultado.reclamos.f.join', 'resultado.reclamos.l.join']) {
      assert.ok(ini.includes(campo), `no se enseña ${campo}: hay que poder verlos antes de seguir`);
    }
  });

  test('⚠️ arrancar NO recarga la sesión sola: el panel de reclamos se desharía solo', () => {
    // `recargarSesion()` mete los reclamos nuevos en el estado, y en ese mismo
    // instante `App.tsx` deja de pintar esta pantalla —su condición es
    // `claims === null`—. Encadenarlo al arranque hacía que el rol, la
    // organización, las funciones y el alcance parpadearan y desaparecieran
    // antes de que nadie los leyera; el runbook (paso 6) los pide a la vista.
    // Sobre el CÓDIGO: el aviso que explica por qué no se recarga aquí nombra a
    // `recargarSesion`, y buscarlo en el texto crudo cazaría el comentario.
    const codigo = sinComentarios(ini);
    const arrancar = codigo.slice(codigo.indexOf('const arrancar = async'), codigo.indexOf('const continuar = async'));
    assert.ok(arrancar.length > 0, 'el arranque y el continuar tienen que ser dos gestos');
    assert.ok(!/recargarSesion/.test(arrancar),
      'el arranque recarga la sesión y se lleva por delante el panel que hay que leer');
    const continuar = codigo.slice(codigo.indexOf('const continuar = async'), codigo.indexOf('const hayQueContinuar'));
    assert.match(continuar, /recargarSesion\(\)/, 'seguir es lo que pide el token nuevo');
    assert.match(ini, /Continuar/, 'sin botón, del panel de reclamos no se sale');
    assert.match(ini, /hayQueContinuar = resultado !== null \|\| fallo\?\.estado === 409/,
      'el 409 (cerrojo ya echado, reclamos re-estampados) también tiene que poder continuar');
  });

  test('el otro camino: sistema ya arrancado y esta cuenta sin permisos', () => {
    assert.match(ini, /estadoDelSistema\(\)/);
    assert.match(ini, /estado\?\.arrancado === true/);
    assert.match(ini, /pídaselo a quien lo\s+administra/i);
  });

  test('tras una negativa se vuelve a preguntar el estado: lo que se creía quedó viejo', () => {
    // Un 409 dice que el cerrojo ya está echado; un 403, que esta cuenta no es
    // la configurada. Sin releer, la pantalla seguiría ofreciendo «Inicializar»
    // y ocultando la única frase que aquí sirve.
    const codigo = sinComentarios(ini);
    const arrancar = codigo.slice(codigo.indexOf('const arrancar = async'), codigo.indexOf('const continuar = async'));
    assert.match(arrancar, /estadoDelSistema\(\)\.then\(setEstado\)/,
      'tras el fallo hay que releer el estado del sistema');
    assert.ok(arrancar.indexOf('estadoDelSistema') > arrancar.indexOf('catch'),
      'la relectura va en el camino del fallo, no antes de intentarlo');
  });
});

// ============================================================================
// LA PUERTA NO ES UN TABLERO — `App.tsx`
// ----------------------------------------------------------------------------
// Lo vio el Ingeniero el 2026-09-06: en la pantalla de ACCESO, sin haber
// entrado nadie, se pintaban «Análisis de causa raíz», «Atlas del Caribe» y el
// sello «Fase 0 · fundación». Colgaban de la cabecera sin condición ninguna.
// Y no era solo ruido: el botón del atlas llevaba a una pantalla que exige
// sesión, o sea que devolvía al mismo sitio del que salía.
//
// Estas pruebas son de FUENTE, no de navegador (esta suite no tiene DOM), y
// cazan justo la recaída: que alguien vuelva a colgar un mando de la cabecera
// sin llave, o que el segmento de causa raíz pierda la guarda de sesión que su
// pieza hermana —el atlas— sí tenía.
// ============================================================================
describe('la cabecera no enseña instrumento a quien no ha entrado', () => {
  const app = readFileSync(join(RAIZ, 'web/src/App.tsx'), 'utf8');
  const codigo = sinComentarios(app);
  const cabecera = codigo.slice(codigo.indexOf('function Cabecera()'), codigo.indexOf('function Pie()'));

  test('causa raíz, atlas y el sello de fase van detrás de `lineas.ver`', () => {
    assert.ok(cabecera.length > 0, 'sin cabecera que mirar, esta prueba no vigila nada');
    for (const mando of ['abrirRca()', "abrirAtlas('sol')", 'Fase 0']) {
      const i = cabecera.indexOf(mando);
      assert.ok(i > 0, `el mando «${mando}» ya no está en la cabecera: revisar esta prueba`);
      const guarda = cabecera.lastIndexOf("puede(quien, 'lineas.ver')", i);
      assert.ok(guarda > 0 && guarda < i,
        `«${mando}» se pinta sin pedir \`lineas.ver\`: vuelve a salir en la pantalla de acceso`);
    }
  });

  test('la llave elegida la tienen los cinco roles: no esconde nada a quien entró', () => {
    for (const rol of ROLES) {
      assert.ok(FUNCIONES_POR_ROL[rol].includes('lineas.ver'),
        `el rol ${rol} no trae \`lineas.ver\` y la cabecera se le quedaría muda`);
    }
  });

  test('el segmento de causa raíz exige sesión, igual que el atlas', () => {
    const contenido = codigo.slice(codigo.indexOf('function Contenido()'), codigo.indexOf('export function App()'));
    const rca = contenido.slice(contenido.indexOf("rca.fase !== 'cerrado'"));
    const linea = rca.slice(0, rca.indexOf('<Rca />'));
    assert.match(linea, /d\.fase !== 'sin_sesion'/,
      'pegar `#/rca` sin sesión abriría una pantalla real de la aplicación');
    assert.match(linea, /d\.fase !== 'cambiar_contrasena'/,
      'con la contraseña por cambiar, el muro dejaría de ser un muro');
  });
});

// ============================================================================
// AL ESPECTADOR NO SE LE OFRECE LO QUE EL SERVIDOR LE VA A NEGAR
// ----------------------------------------------------------------------------
// Lo midió la verificación por capas del 2026-09-06: el rol de solo lectura no
// puede escribir NADA —eso está probado en el emulador—, pero la pantalla le
// ofrecía el expediente de causa raíz ENTERO, con sus editores y su «Guardar»,
// y el servidor le respondía que no al pulsar. Un sistema que ofrece lo que
// niega parece roto aunque esté perfecto.
//
// Lo que estas pruebas NO defienden: la frontera. Ésa son las reglas, y tiene
// su propio barrido en el emulador. Esto es la mitad visible, y se dice.
// ============================================================================
describe('el expediente de causa raíz: se LEE entero, se edita solo con permiso', () => {
  const rca = readFileSync(join(RAIZ, 'web/src/componentes/Rca.tsx'), 'utf-8');
  const editores = readFileSync(join(RAIZ, 'web/src/componentes/RcaEditores.tsx'), 'utf-8');
  const falla = readFileSync(join(RAIZ, 'web/src/componentes/Falla.tsx'), 'utf-8');

  test('el «Guardar» compartido de los editores exige `expedientes.editar`', () => {
    assert.match(editores, /usePuedeEditarExpediente/,
      'sin la comprobación, los cuatro editores vuelven a ofrecer Guardar a quien solo lee');
    const guardar = editores.slice(editores.indexOf('function Guardar('), editores.indexOf('// ── LOS PORQUÉS'));
    assert.match(guardar, /if \(!usePuedeEditarExpediente\(\)\)/,
      'el Guardar tiene que decidirse ANTES de pintar el botón');
    assert.match(guardar, /Solo lectura/, 'se dice por qué no hay botón, no se deja el hueco mudo');
  });

  test('los mandos que CREAN o QUITAN van detrás de la misma llave', () => {
    for (const mando of ['+ Nueva cadena', '+ Nueva hipótesis', '+ Otra causa', 'Congelar este sondeo']) {
      const i = editores.indexOf(mando);
      assert.ok(i > 0, `el mando «${mando}» ya no está: revisar esta prueba`);
      const guarda = editores.lastIndexOf('editable', i);
      assert.ok(guarda > 0 && i - guarda < 900, `«${mando}» se ofrece sin comprobar el permiso`);
    }
  });

  test('declarar la causa raíz y guardar los descartes exigen permiso', () => {
    for (const mando of ['void declarar()', 'void guardar()']) {
      const i = rca.indexOf(mando);
      assert.ok(i > 0, `«${mando}» ya no está en Rca.tsx`);
      const guarda = rca.lastIndexOf('editable', i);
      assert.ok(guarda > 0 && i - guarda < 700, `«${mando}» se ofrece sin comprobar el permiso`);
    }
    assert.match(rca, /const editable = puede\(useQuien\(\), 'expedientes\.editar'\)/);
  });

  test('«Abrir análisis» CREA un expediente: pide `expedientes.editar`', () => {
    const i = falla.indexOf('crearRcaDesdeEvento');
    assert.ok(i > 0);
    const guarda = falla.lastIndexOf("puede(quien, 'expedientes.editar')", i);
    assert.ok(guarda > 0 && i - guarda < 500, 'se ofrecía a cualquiera y el servidor lo negaba al pulsar');
  });

  test('lo que se LEE no se esconde: el expediente sigue pintándose entero', () => {
    // La regla de la casa es no introducir regresiones de visibilidad. El aviso
    // de solo lectura va ANTES de los editores, y los editores se siguen
    // montando: lo que desaparece son los mandos, no el contenido.
    const abierto = rca.slice(rca.indexOf('function Abierto('), rca.indexOf('function TablaDescartes('));
    assert.match(abierto, /!editable && \(\s*<p className="aviso"/, 'falta el aviso de solo lectura');
    for (const ed of ['<EditorPorques', '<EditorArbol', '<EditorHipotesis', '<EditorAusencias', '<EditorAcciones']) {
      assert.ok(abierto.includes(ed), `${ed} dejó de pintarse: eso es esconder contenido, no quitar un mando`);
    }
  });

  test('`informes.generar` deja de ser decorativa: alguien la exige', () => {
    // El catálogo prohíbe declarar lo que nadie hace cumplir (`99 §ADR-100`), y
    // esta función no la exigía NADIE: ni una regla, ni un trabajador, ni la
    // pantalla. Ahora la pide el botón del informe.
    const i = rca.indexOf('generarInforme(a, acciones, sondeos)');
    assert.ok(i > 0);
    const guarda = rca.lastIndexOf("puede(quien, 'informes.generar')", i);
    assert.ok(guarda > 0 && i - guarda < 700, 'el informe se ofrece sin exigir `informes.generar`');
  });

  test('la rebanada de sesión se arma en UN sitio, no copiada en cada componente', () => {
    const permisos = readFileSync(join(RAIZ, 'web/src/datos/permisos.ts'), 'utf-8');
    assert.match(permisos, /export function quienDe\(/, 'sin dueño único vuelve la copia divergente');
    for (const f of ['web/src/App.tsx', 'web/src/componentes/Linea.tsx']) {
      const src = readFileSync(join(RAIZ, f), 'utf-8');
      assert.ok(!/sesion\.fase === 'autenticado'\s*\n\s*\?\s*\{ correo: sesion\.correo/.test(src),
        `${f} volvió a construir la rebanada a mano en vez de usar useQuien()`);
    }
  });
});

// ============================================================================
// QUITAR NO ES DELEGAR — el espectador sin bitácoras internas
// ----------------------------------------------------------------------------
// Salió creando la primera cuenta de solo lectura (2026-09-06). El Ingeniero
// pidió un espectador SIN las dos bitácoras internas (`ia.leer` y
// `usuarios.auditoria`), que el rol `auditor` trae y que NO son delegables.
//
// El catálogo siempre lo permitió: `funcionesEfectivas` borra CUALQUIER quitada,
// delegable o no. Pero la pantalla solo recorría las delegables, así que esa
// cuenta no se podía crear; y el trabajador, al derivar el perfil desde los
// reclamos, filtraba `funcionesQuitadas` por `delegable`, de modo que una
// retirada no delegable DESAPARECÍA al reconciliar: el token seguía sin darla y
// el espejo decía que sí. La siguiente edición se la habría devuelto en silencio.
// ============================================================================
describe('quitar una función NO delegable: el catálogo, el trabajador y la pantalla dicen lo mismo', () => {
  test('el catálogo borra cualquier quitada, sea delegable o no', () => {
    const noDelegables = CODIGOS_FUNCION.filter((f) => !FUNCIONES[f].delegable);
    assert.ok(noDelegables.length > 0, 'sin funciones no delegables esta prueba no vigila nada');
    for (const rol of ROLES_ASIGNABLES.filter((r) => r !== 'admin')) {
      for (const f of FUNCIONES_POR_ROL[rol].filter((x) => !FUNCIONES[x].delegable)) {
        assert.ok(!funcionesEfectivas(rol, [], [f]).includes(f),
          `el catálogo no supo quitarle «${f}» a ${rol}`);
      }
    }
  });

  test('el espectador que pidió el Ingeniero se puede expresar: auditor sin las dos bitácoras', () => {
    const efectivas = funcionesEfectivas('auditor', [], ['ia.leer', 'usuarios.auditoria']);
    assert.deepEqual(efectivas, ['lineas.ver', 'evidencias.ver', 'cargabilidad.ver', 'informes.generar']);
    for (const f of efectivas) {
      assert.match(f, /\.ver$|^informes\.generar$/, `«${f}» no es de solo lectura`);
    }
  });

  test('añadir una NO delegable se sigue ignorando: recortar no es lo mismo que regalar', () => {
    const conRegalo = funcionesEfectivas('auditor', ['usuarios.gestionar'], []);
    assert.ok(!conRegalo.includes('usuarios.gestionar'),
      'el catálogo dejó colar una función no delegable como extra');
  });

  test('el trabajador deriva `funcionesQuitadas` SIN filtrar por delegable', () => {
    const worker = readFileSync(join(RAIZ, 'usuarios/src/index.js'), 'utf-8');
    const i = worker.indexOf('function perfilDesdeReclamos');
    assert.ok(i > 0);
    const cuerpo = worker.slice(i, i + 1400);
    assert.match(cuerpo, /funcionesQuitadas: base\.filter\(\(f\) => !efectivas\.includes\(f\)\),/,
      'volvió el filtro `delegable` en las quitadas: una retirada no delegable se pierde al reconciliar');
    assert.match(cuerpo, /funcionesExtra: efectivas\.filter\(\(f\) => !base\.includes\(f\) && FUNCIONES\[f\]\.delegable\),/,
      'las EXTRA sí se filtran por delegable: ahí sí se regalaría poder');
  });

  test('la pantalla manda las quitadas del catálogo entero y las extra solo delegables', () => {
    const usuarios = readFileSync(join(RAIZ, 'web/src/componentes/Usuarios.tsx'), 'utf-8');
    assert.match(usuarios, /funcionesQuitadas: CODIGOS_FUNCION\.filter\(\(f\) => ajustes\[f\] === 'quitada'\)/);
    assert.match(usuarios, /funcionesExtra: CODIGOS_FUNCION\.filter\(\(f\) => FUNCIONES\[f\]\.delegable && ajustes\[f\] === 'extra'\)/);
  });
});
