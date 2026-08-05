#!/usr/bin/env node
// ============================================================================
// usuarios.mjs — la ÚNICA vía de alta de personas en el sistema
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. Hasta hoy la única forma de entrar era «Entrar con Google», y
// eso es una vía de alta PÚBLICA: cualquiera con una cuenta de Google podía
// crear una identidad en el proyecto. El 31-07-2026 pasó de verdad: una cuenta
// de Google ajena al proyecto se dio de alta sin que nadie la invitara — y
// aunque no pudo leer NADA (sus reclamos eran `null`, y las reglas exigen
// `orgId`), una herramienta corporativa no debe permitir que eso ocurra.
//
// ⚠️ La identidad concreta NO se escribe aquí. Este repositorio es PÚBLICO y esa
// dirección es el dato personal de una persona real que no pidió aparecer en él,
// ligada además al relato de un incidente. Vive en `NOTAS-OPERATIVAS.md` de la
// bóveda privada, que es el nodo dueño de usuarios y roles.
//
// LO QUE NO SE PUDO HACER, Y POR QUÉ. La forma canónica de impedirlo es una
// «blocking function» (`beforeUserCreated`). Verificado con fuente el
// 2026-08-04: exige Identity Platform, se despliega como Cloud Function o Cloud
// Run, y «to deploy functions, your project must be on the Blaze pricing plan».
// Blaze factura y no apaga — justo lo que la regla de oro del proyecto rechaza,
// y lo que el ADR-001 ya descartó. Así que la defensa NO es impedir el alta:
// es (a) quitar el proveedor que la permitía, (b) que la cuenta sin reclamos
// sea inerte —ya lo es— y (c) `auditar`, aquí abajo, que la detecta y la apaga.
//
// SOBRE LA CONTRASEÑA. El Ingeniero decidió asignarla él (2026-08-04). Se
// respeta, y se rodea de cuidados para que esa decisión cueste lo menos posible:
//   · NUNCA se pasa como argumento: acabaría en el historial del intérprete de
//     comandos y sería visible en la lista de procesos de la máquina.
//   · Se teclea SIN ECO y se confirma dos veces.
//   · No se escribe en ningún fichero ni se imprime jamás.
//   · La cuenta nace con `passwordProvisional: true`.
//
// ⚠️ Y AQUÍ HAY UNA PROMESA QUE HOY NO SE CUMPLE — verificado el 2026-08-04.
// Este comentario decía que «la aplicación obliga a cambiarla en el primer
// acceso». Es FALSO: ningún archivo de `web/src` lee `passwordProvisional`, y no
// existe ningún flujo de cambio de contraseña en la aplicación (no hay
// `updatePassword` ni `sendPasswordResetEmail` en ninguna parte).
//
// La consecuencia práctica, que hay que tener delante antes de dar de alta a
// alguien: la contraseña que se teclea aquí es la de esa persona, PERMANENTE, y
// esa persona NO puede cambiarla — solo el administrador, con esta herramienta.
// Sirve para probar; no sirve para gente real. Lo cierra `TODO-50` fase 3.
//
// Se deja escrito y no se borra la marca `passwordProvisional`: el reclamo ya
// viaja en el token y la pantalla que falta lo encontrará puesto. Lo que no se
// puede es seguir afirmando que algo protege cuando no protege nada.
//
// USO
//   GOOGLE_APPLICATION_CREDENTIALS=/ruta/clave.json node herramientas/usuarios.mjs <orden>
//
//   alta      --correo a@b.com --rol cuadrilla [--nombre "Nombre"]
//   rol       --correo a@b.com --rol editor
//   baja      --correo a@b.com
//   restituir --correo a@b.com
//   auditar
// ============================================================================
import { readFileSync } from 'node:fs';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const ORG = 'transpower';   // una sola organización hoy; la columna existe desde el día 1

// Los mismos cuatro que ya hacen cumplir `firestore.rules`. La lista es CERRADA
// a propósito: un rol mal escrito no debe producir una cuenta con reclamos
// raros, que es la peor combinación posible — existe y no sirve, y nadie
// entiende por qué.
const ROLES = Object.freeze({
  admin:     'todo, incluida la configuración operativa y la bitácora de IA',
  editor:    'crea y edita líneas, apoyos, hipótesis y expedientes',
  cuadrilla: 'inspecciones y evidencias; NO toca activos ni expedientes',
  auditor:   'lectura completa + la bitácora de IA; no escribe nada',
});

const MIN_CONTRASENA = 12;

// ── Argumentos ──────────────────────────────────────────────────────────────
const ORDEN = process.argv[2];
const arg = (n, def = null) => {
  const i = process.argv.indexOf('--' + n);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

// ── Credenciales ────────────────────────────────────────────────────────────
const claveEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
initializeApp(
  claveEnv
    ? { credential: cert(JSON.parse(readFileSync(claveEnv, 'utf8'))) }
    : { credential: applicationDefault() },
);
const auth = getAuth();

// ── Lectura de contraseña sin eco ───────────────────────────────────────────
/**
 * Pide una contraseña por teclado sin mostrarla. Exige terminal de verdad: si
 * la entrada viene de una tubería, se rechaza — porque una contraseña que llega
 * por tubería viene de algún sitio donde quedó escrita, que es justo lo que se
 * está evitando.
 */
function leerOculto(mensaje) {
  return new Promise((resolver, rechazar) => {
    if (!process.stdin.isTTY) {
      return rechazar(new Error(
        'La contraseña se teclea; no se acepta por tubería ni por argumento.\n' +
        'Si llega por ahí, es que quedó escrita en algún sitio.'));
    }
    process.stdout.write(mensaje);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    let valor = '';
    const alTecla = (t) => {
      for (const c of t) {
        if (c === '\r' || c === '\n') {          // fin
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', alTecla);
          process.stdout.write('\n');
          return resolver(valor);
        }
        if (c === '\u0003') {                  // Ctrl-C: se abandona sin crear nada
          process.stdin.setRawMode(false);
          process.stdout.write('\n');
          process.exit(130);
        }
        // Borrar: retroceso (\u007f) y retroceso clásico (\b).
        if (c === '\u007f' || c === '\b') { valor = valor.slice(0, -1); continue; }
        // En modo crudo no hay eco: se acumula en silencio y NO se pinta ni un
        // asterisco — un contador de asteriscos ya filtra la longitud a quien mire.
        if (c >= ' ') valor += c;
      }
    };
    process.stdin.on('data', alTecla);
  });
}

/**
 * Lo que se rechaza NO es un capricho: son las tres formas en que una
 * contraseña provisional se filtra de verdad — corta, adivinable, o igual al
 * correo de la persona.
 */
function revisarContrasena(c, correo) {
  const fallos = [];
  if (c.length < MIN_CONTRASENA) fallos.push(`tiene ${c.length} caracteres y el mínimo es ${MIN_CONTRASENA}`);
  if (!/[a-zá-ú]/i.test(c) || !/\d/.test(c)) fallos.push('debe mezclar letras y números');
  const usuario = correo.split('@')[0].toLowerCase();
  if (usuario.length > 2 && c.toLowerCase().includes(usuario)) fallos.push('contiene el propio correo');
  if (/^(.)\1+$/.test(c)) fallos.push('es un solo carácter repetido');
  return fallos;
}

const salir = (mensaje) => { console.error('\n❌ ' + mensaje + '\n'); process.exit(1); };

const exigirRol = (rol) => {
  if (!rol || !(rol in ROLES)) {
    salir(`Rol no válido: ${rol ?? '(ninguno)'}\n\nVálidos:\n` +
      Object.entries(ROLES).map(([r, d]) => `   ${r.padEnd(10)} ${d}`).join('\n'));
  }
};

// ── Órdenes ─────────────────────────────────────────────────────────────────

async function alta() {
  const correo = arg('correo');
  const rol = arg('rol');
  const nombre = arg('nombre') ?? undefined;
  if (!correo) salir('Falta --correo');
  exigirRol(rol);

  // Que no exista ya. Crear encima de una cuenta viva sería pisar a alguien.
  try {
    const ya = await auth.getUserByEmail(correo);
    salir(`Esa cuenta ya existe (uid ${ya.uid}).\n` +
      `Para cambiarle el rol:  node herramientas/usuarios.mjs rol --correo ${correo} --rol <rol>`);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
  }

  console.log(`\n  Alta de ${correo} como ${rol.toUpperCase()}`);
  console.log(`  ${ROLES[rol]}\n`);

  const c1 = await leerOculto('  Contraseña provisional: ');
  const fallos = revisarContrasena(c1, correo);
  if (fallos.length) salir('Contraseña rechazada: ' + fallos.join(' · '));
  const c2 = await leerOculto('  Repítela:               ');
  if (c1 !== c2) salir('Las dos no coinciden. No se creó nada.');

  const u = await auth.createUser({
    email: correo, password: c1, displayName: nombre,
    emailVerified: false, disabled: false,
  });

  // Los reclamos van en el TOKEN, no en un documento consultable: así las reglas
  // deciden sin leer la base, y el cliente no puede alterarlos.
  await auth.setCustomUserClaims(u.uid, {
    orgId: ORG,
    rol,
    // La aplicación exige cambiarla antes de enseñar nada. Sin esto, la
    // contraseña que se acaba de teclear viviría indefinidamente.
    passwordProvisional: true,
  });

  console.log(`\n✅ Creada · uid ${u.uid}`);
  console.log('   Entrégale la contraseña por un canal que puedas cerrar después.');
  console.log('   La aplicación le obligará a cambiarla en el primer acceso.\n');
}

/**
 * Pone o repone la contraseña de una cuenta que YA existe.
 *
 * Es la orden que hace falta cuando alguien entró por Google y hay que pasarlo a
 * correo/contraseña: `alta` se niega —y debe negarse— porque crear encima de una
 * cuenta viva sería pisar a alguien. Aquí el uid NO cambia, así que la persona
 * conserva sus reclamos, su historial y todo lo que haya creado.
 *
 * También sirve para reponer la contraseña de quien la olvidó, sin borrar nada.
 */
async function contrasena() {
  const correo = arg('correo');
  if (!correo) salir('Falta --correo');
  const u = await auth.getUserByEmail(correo);
  const previos = u.customClaims ?? {};

  console.log(`\n  Contraseña para ${correo}`);
  console.log(`  uid ${u.uid} · rol ${previos.rol ?? '(sin rol)'} · ${previos.orgId ?? 'SIN ORGANIZACIÓN'}`);
  console.log('  El uid no cambia: conserva reclamos e historial.\n');

  const c1 = await leerOculto('  Contraseña: ');
  const fallos = revisarContrasena(c1, correo);
  if (fallos.length) salir('Contraseña rechazada: ' + fallos.join(' · '));
  const c2 = await leerOculto('  Repítela:   ');
  if (c1 !== c2) salir('Las dos no coinciden. No se cambió nada.');

  await auth.updateUser(u.uid, { password: c1 });
  // Se marca provisional salvo que se pida lo contrario: quien no teclea su
  // propia contraseña debe cambiarla al entrar. El administrador poniéndose la
  // suya es el único caso en que eso sobra, y por eso existe --definitiva.
  const definitiva = process.argv.includes('--definitiva');
  await auth.setCustomUserClaims(u.uid, { ...previos, passwordProvisional: !definitiva });
  await auth.revokeRefreshTokens(u.uid);

  console.log(`\n✅ Contraseña establecida${definitiva ? '' : ' · marcada PROVISIONAL: la app exigirá cambiarla'}`);
  console.log('   Sesiones revocadas: las que estuvieran abiertas ya no valen.\n');
}

async function rol() {
  const correo = arg('correo');
  const nuevo = arg('rol');
  if (!correo) salir('Falta --correo');
  exigirRol(nuevo);

  const u = await auth.getUserByEmail(correo);
  const previos = u.customClaims ?? {};
  await auth.setCustomUserClaims(u.uid, { ...previos, orgId: previos.orgId ?? ORG, rol: nuevo });

  // SIN ESTO el rol viejo sigue vivo hasta una hora: `setCustomUserClaims` no
  // invalida los tokens ya emitidos. Es el fallo más común de los sistemas con
  // reclamos, y aquí el rol decide quién puede escribir sobre un activo.
  await auth.revokeRefreshTokens(u.uid);

  console.log(`\n✅ ${correo}: ${previos.rol ?? '(sin rol)'} → ${nuevo}`);
  console.log('   Sesiones revocadas: el cambio es inmediato, no en una hora.\n');
}

async function baja() {
  const correo = arg('correo');
  if (!correo) salir('Falta --correo');
  const u = await auth.getUserByEmail(correo);

  // Se DESHABILITA, no se borra. Borrar es permanente y no hace falta para
  // dejar a alguien fuera; además, el rastro de quién tuvo acceso y cuándo es
  // parte de lo que hace auditable este sistema.
  await auth.updateUser(u.uid, { disabled: true });
  await auth.revokeRefreshTokens(u.uid);

  console.log(`\n⛔ ${correo} deshabilitada y sesiones revocadas.`);
  console.log(`   Se revierte con:  node herramientas/usuarios.mjs restituir --correo ${correo}\n`);
}

async function restituir() {
  const correo = arg('correo');
  if (!correo) salir('Falta --correo');
  const u = await auth.getUserByEmail(correo);
  await auth.updateUser(u.uid, { disabled: false });
  console.log(`\n✅ ${correo} restituida.`);
  if (!u.customClaims?.orgId) {
    console.log('   ⚠️ No tiene organización: podrá entrar y no verá nada.');
    console.log(`      Asígnale rol:  node herramientas/usuarios.mjs rol --correo ${correo} --rol <rol>\n`);
  } else { console.log(''); }
}

/**
 * LA AUDITORÍA — el sustituto sin coste de la función de bloqueo.
 *
 * No puede impedir un alta, pero la ENCUENTRA. Una cuenta sin `orgId` es, o
 * bien alguien que entró por su cuenta, o bien un aprovisionamiento a medias:
 * las dos cosas hay que verlas. Pensada para correrse a mano o desde una tarea
 * programada en la máquina del administrador.
 */
async function auditar() {
  const todas = [];
  let pagina;
  do {
    const r = await auth.listUsers(1000, pagina);
    todas.push(...r.users);
    pagina = r.pageToken;
  } while (pagina);

  const intrusas = todas.filter((u) => !u.disabled && !u.customClaims?.orgId);
  const activas = todas.filter((u) => !u.disabled && u.customClaims?.orgId);

  console.log(`\n  ${todas.length} cuenta(s) · ${activas.length} aprovisionada(s) · ${todas.length - activas.length - intrusas.length} deshabilitada(s)\n`);
  for (const u of todas) {
    const c = u.customClaims ?? {};
    const marca = u.disabled ? '⛔' : c.orgId ? '✅' : '⚠️ ';
    const prov = c.passwordProvisional ? ' · contraseña PROVISIONAL sin cambiar' : '';
    console.log(`  ${marca} ${(u.email ?? u.uid).padEnd(34)} ${(c.rol ?? '—').padEnd(10)} ${c.orgId ?? 'SIN ORGANIZACIÓN'}${prov}`);
  }

  if (intrusas.length) {
    console.log(`\n⚠️  ${intrusas.length} cuenta(s) ACTIVA(S) SIN APROVISIONAR. No pueden leer nada`);
    console.log('   —las reglas exigen `orgId`— pero no deberían existir. Para cerrarlas:');
    for (const u of intrusas) console.log(`     node herramientas/usuarios.mjs baja --correo ${u.email}`);
    console.log('');
    process.exitCode = 1;   // sirve para que una tarea programada avise
  } else {
    console.log('\n✅ Ninguna cuenta activa sin aprovisionar.\n');
  }
}

// ── Reparto ─────────────────────────────────────────────────────────────────
const ORDENES = { alta, contrasena, rol, baja, restituir, auditar };

if (!ORDEN || !(ORDEN in ORDENES)) {
  console.log(`
  usuarios.mjs — aprovisionamiento de personas

  GOOGLE_APPLICATION_CREDENTIALS=/ruta/clave.json node herramientas/usuarios.mjs <orden>

    alta       --correo a@b.com --rol <rol> [--nombre "Nombre"]
    contrasena --correo a@b.com [--definitiva]   (cuenta que YA existe)
    rol        --correo a@b.com --rol <rol>
    baja      --correo a@b.com
    restituir --correo a@b.com
    auditar

  Roles:
${Object.entries(ROLES).map(([r, d]) => `    ${r.padEnd(10)} ${d}`).join('\n')}
`);
  process.exit(ORDEN ? 1 : 0);
}

try {
  await ORDENES[ORDEN]();
} catch (e) {
  salir(e.code === 'auth/user-not-found' ? 'No existe esa cuenta.' : (e.message ?? String(e)));
}
