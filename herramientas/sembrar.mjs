#!/usr/bin/env node
// ============================================================================
// sembrar.mjs — carga en Firestore los datos REALES de una línea
// ----------------------------------------------------------------------------
// Los datos salen del levantamiento real, que vive en la BÓVEDA PRIVADA
// (`../brain-private/…/fixtures/`) y NUNCA en este repositorio, que es público.
// Este script es el puente: lee de la bóveda y escribe en la base, que sí está
// detrás de autenticación.
//
// QUÉ HACE ESTE ARCHIVO Y QUÉ NO. Aquí solo queda la parte que NECESITA
// credenciales: leer los fixtures, hablar con Firestore y avisar por pantalla.
// La lógica de convertir el levantamiento en documentos vive en
// `construir-apoyos.mjs` y la identidad en `identidad.mjs`, los dos PUROS y sin
// firebase-admin, para que se puedan probar sin llave de administrador. Antes
// era imposible: este script aborta nada más cargarse si no hay credencial.
//
// USO
//   1. Descargar una clave de cuenta de servicio del proyecto y guardarla FUERA
//      del repo (o dentro: el .gitignore ya bloquea serviceAccount*.json).
//   2. GOOGLE_APPLICATION_CREDENTIALS=/ruta/clave.json \
//        node herramientas/sembrar.mjs --linea LN-627 --admin correo@ejemplo.com
//
//   --seco                      enseña todo lo que haría sin escribir nada.
//   --emitir-semillas           autoriza dar de alta ids NUEVOS en el registro.
//   --contrato-050-desplegado   confirma que la web ya valida `orden` no entero.
//
// Es IDEMPOTENTE: se puede correr las veces que haga falta.
// ============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { CANONICOS, ORG_POR_DEFECTO, RUTA_REGISTRO, emitirSemillas, idDeSemilla } from './identidad.mjs';
import { construirApoyos, construirInvestigacion } from './construir-apoyos.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const ORG = ORG_POR_DEFECTO;        // una sola organización hoy; la columna existe desde el día 1
const AHORA = new Date().toISOString();

// ── Argumentos ──────────────────────────────────────────────────────────────
const arg = (n, def) => {
  const i = process.argv.indexOf('--' + n);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def;
};
const bandera = (n) => process.argv.includes('--' + n);

const CODIGO_LINEA = arg('linea', 'LN-627');
const CORREO_ADMIN = arg('admin', null);
const SECO = bandera('seco');
const EMITIR_SEMILLAS = bandera('emitir-semillas');
const CONTRATO_050_DESPLEGADO = bandera('contrato-050-desplegado');

// ── Credenciales ────────────────────────────────────────────────────────────
const claveEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!claveEnv && !SECO) {
  console.error(`
❌ Falta la credencial de administrador.

   Este script escribe en la base de producción, así que necesita una clave de
   cuenta de servicio. Se descarga una sola vez:

   1. Abrir  https://console.firebase.google.com/project/mantenimiento-lineas-at/settings/serviceaccounts/adminsdk
   2. Botón "Generar nueva clave privada" → descarga un archivo .json
   3. Correr:

      GOOGLE_APPLICATION_CREDENTIALS=~/Downloads/EL-ARCHIVO.json \\
        node herramientas/sembrar.mjs --linea ${CODIGO_LINEA} --admin TU-CORREO

   ⚠️ Ese archivo es una llave maestra del proyecto: no se commitea (el
      .gitignore ya lo bloquea) y no se comparte por correo ni por chat.

   (Para ver qué haría sin tocar nada:  --seco)
`);
  process.exit(1);
}

// ── Origen de los datos: la bóveda privada ──────────────────────────────────
const BOVEDA = join(RAIZ, '..', 'brain-private', 'mantenimiento-lineas-at', 'fixtures');
const FIXTURE = join(BOVEDA, `${CODIGO_LINEA}-geometria.json`);
if (!existsSync(FIXTURE)) {
  console.error(`❌ No está el levantamiento de ${CODIGO_LINEA} en la bóveda:\n   ${FIXTURE}`);
  process.exit(1);
}
const levantamiento = JSON.parse(readFileSync(FIXTURE, 'utf-8'));

/**
 * AMPLIACIONES. Un levantamiento no se corrige sobrescribiéndolo: se AMPLÍA con
 * un archivo fechado aparte. El de julio queda congelado —es la línea base de
 * las pruebas de no regresión contra el módulo de campo original— y los puntos
 * nuevos viven en su propio archivo, con su fecha y su estado de aprobación.
 * Si no hay ampliación, se siembra la línea igual: no es un error.
 */
const FIXTURE_AMPLIACION = join(BOVEDA, `${CODIGO_LINEA}-geometria-ampliacion-2026-08.json`);
const ampliacion = existsSync(FIXTURE_AMPLIACION)
  ? JSON.parse(readFileSync(FIXTURE_AMPLIACION, 'utf-8'))
  : { puntos: [] };

// ── Documentos ──────────────────────────────────────────────────────────────
const lineaId = idDeSemilla(CODIGO_LINEA, 'linea', ORG);
const hipotesisId = idDeSemilla(CODIGO_LINEA, 'hipotesis-modulo-campo', ORG);

const base = (id, extra = {}) => ({
  id, orgId: ORG, creadoEn: AHORA, creadoPor: 'sembrador', revision: 0, ...extra,
});

const linea = base(lineaId, {
  tipo: 'linea',
  codigo: CODIGO_LINEA,
  nombre: `Línea ${CODIGO_LINEA}`,
  tensionNominal_kV: 66,
  circuitos: 1,
  activa: true,
  hipotesisId,
  conductor: {
    codigo: 'Darien', material: 'AAAC', calibre: '559,5 MCM', formacion: '19',
    seccion_mm2: 283.5, diametro_m: 0.02179, masaLineal_kg_m: 0.776, rts_kgf: 8528,
    moduloElastico_kg_mm2: 6300, moduloEs: 'no_declarado', dilatacion_1_C: 23.0e-6,
    tempMaxOperacion_C: 90,
    // ⚠️ Viene del catálogo embebido en el módulo de campo, NO de la ficha del
    // proveedor real. La auditoría encontró conflicto en el módulo elástico
    // (6.300 vs 7.000) y ese conflicto decide si un tramo cumple el RETIE.
    procedencia: 'catalogo_fabricante',
    fuente: 'catálogo del módulo de campo LN-627 v10 — PENDIENTE confirmar con el proveedor',
  },
});

const hipotesis = base(hipotesisId, {
  tipo: 'hipotesis',
  nombre: 'Hipótesis del módulo de campo (SIN VALIDAR)',
  lineaId,
  eds_pct: 20, tempEds_C: 28, tempMax_C: 75, tempMin_C: 22,
  vientoMax_kmh: 100, tempViento_C: 28, cx: 1.0, densidadAire_kg_m3: 1.2,
  // ⚠️ La auditoría normativa encontró que 7,0 m no corresponde a ninguna
  // categoría de 66 kV del RETIE. Se cargan los valores reales de la tabla.
  despejeMinimo_m: {
    'vias_zonas_peatonales': 5.8,
    'campo_abierto_con_control_de_copas': 5.8,
    'bosque_o_cultivo_sin_control': 8.3,
    'rio_navegable': 10.4,
    'campos_deportivos': 12.0,
  },
  normaReferencia: 'RETIE Libro 3, Tabla 3.10.2.a (Res. 40284 de 2026)',
  procedencia: 'supuesto',
  congelada: false,
});

// ── Los apoyos ──────────────────────────────────────────────────────────────
// El id y el nombre canónico salen del PUNTO, no de dónde caiga en la lista.
// Si algo aquí falla, falla ANTES de abrir la conexión con la base.
let construido;
try {
  construido = construirApoyos(CODIGO_LINEA, levantamiento, ampliacion.puntos ?? [], {
    org: ORG, ahora: AHORA, lineaId,
  });
} catch (e) {
  console.error(`\n❌ ${e.message}\n`);
  process.exit(1);
}
const { apoyos, ignorados, semillasNuevas, colisiones, ordenesNoEnteros } = construido;
// La lista de JULIO tal y como está sembrada hoy, en su orden original. Sirve
// de control cruzado del expediente de falla, y para eso tiene que ser la de
// julio y no la ampliada: lo que hay que demostrar es que la migración no
// cambió a qué apoyo apunta el expediente.
const apoyosJulio = (CANONICOS[CODIGO_LINEA] ?? []).map((n) => apoyos.find((a) => a.nombreNormalizado === n));

// ── Lo que NO se carga, dicho con todas las letras ──────────────────────────
//
// Un punto que el Ingeniero dejó pendiente no se carga en silencio ni se borra
// del fixture: se ignora Y SE DICE. Que quede escrito en la corrida es la única
// forma de que dentro de seis meses nadie crea que la línea está completa.
if (ignorados.length) {
  console.log(`\n⚠️  ${ignorados.length} punto(s) del levantamiento NO se cargan en esta corrida:\n`);
  for (const p of ignorados) {
    console.log(`   · ${p.nombreCanonico ?? p.nombreCampo ?? '(sin nombre)'}  —  estado «${p.estado}»`);
    console.log(`     ${p.motivo}`);
  }
  console.log('   Quedan PENDIENTES, no descartados: siguen en el fixture de la bóveda.\n');
}

// ── Los frenos, antes de tocar nada ────────────────────────────────────────
if (colisiones.length) {
  console.error('\n❌ Dos puntos distintos producen el MISMO id. Serían dos apoyos peleándose por las mismas fotos:');
  for (const [a, b] of colisiones) console.error(`   · «${a}» y «${b}»`);
  process.exit(1);
}

/**
 * SEMILLAS NUEVAS. Un id que no está en el registro es un id que nunca se ha
 * escrito. Se imprime, se para, y solo entra con --emitir-semillas: así ningún
 * documento nuevo llega a la base sin haber pasado antes por el archivo y por
 * los ojos del Ingeniero.
 */
if (semillasNuevas.length) {
  console.log(`\n🌱 SEMILLA NUEVA — ${semillasNuevas.length} punto(s) sin id emitido todavía:\n`);
  for (const s of semillasNuevas) {
    console.log(`   · ${s.nombreCanonico}`);
    console.log(`     semilla: ${s.semilla}`);
    console.log(`     id     : ${s.id}`);
  }
  if (!EMITIR_SEMILLAS) {
    console.error(`
❌ No se siembra nada. Un id nuevo es permanente: una vez escrito sostiene fotos
   y expedientes, y moverlo después los deja huérfanos sin un solo error visible.

   Si los ids de arriba son los correctos, autorícelo:
     node herramientas/sembrar.mjs --linea ${CODIGO_LINEA} --emitir-semillas
   Se anotarán en ${RUTA_REGISTRO}
`);
    process.exit(1);
  }
}

/**
 * ORDEN FRACCIONARIO. Un punto intercalado recibe el orden que hay entre sus
 * vecinos (2,5) en vez de correr a los 26 que ya están escritos. Eso exige que
 * el contrato admita `orden` no entero — `z.number()` en vez de
 * `z.number().int()` — y, sobre todo, que la web DESPLEGADA ya lo admita: un
 * bundle con el contrato viejo valida y FILTRA el punto EN SILENCIO, así que
 * desaparecería del mapa y de las fichas sin un solo error donde mirar.
 * Orden de operaciones obligatorio: desplegar la web con el contrato 0.5.0 y
 * SOLO DESPUÉS sembrar.
 */
if (ordenesNoEnteros.length && !CONTRATO_050_DESPLEGADO) {
  console.error(`
❌ ${ordenesNoEnteros.length} punto(s) llevan un \`orden\` no entero:
${ordenesNoEnteros.map((o) => `   · ${o.nombreCanonico} → orden ${o.orden}`).join('\n')}

   Eso es correcto y es lo que evita renumerar los 26 apoyos ya sembrados, pero
   la aplicación DESPLEGADA tiene que estar validando ya con el contrato 0.5.0.
   Con el contrato anterior, estos documentos se descartan en silencio: no dan
   error, simplemente no aparecen en el mapa ni en las fichas.

   1. Comprobar que producción sirve el bundle con "contrato v0.5.0" en el pie.
   2. Volver a correr añadiendo:  --contrato-050-desplegado
`);
  process.exit(1);
}

// ── Investigación de falla (opcional: solo si está en la bóveda) ────────────
//
// El expediente del evento es dato REAL de cliente: vive en la bóveda, nunca
// en el repositorio. Si el archivo no está, se siembra la línea igual y se
// avisa — no se inventa un evento.
const FIXTURE_FALLA = join(BOVEDA, `${CODIGO_LINEA}-falla.json`);
let investigacion = null;
if (existsSync(FIXTURE_FALLA)) {
  try {
    investigacion = construirInvestigacion(
      JSON.parse(readFileSync(FIXTURE_FALLA, 'utf-8')), apoyos, apoyosJulio,
      { codigoLinea: CODIGO_LINEA, org: ORG, ahora: AHORA, lineaId },
    );
  } catch (e) {
    console.error(`\n❌ ${e.message}\n`);
    process.exit(1);
  }
}

// ── Lo que se va a escribir, para que se pueda revisar antes ───────────────
const apoyoDeLaFalla = investigacion ? apoyos.find((a) => a.id === investigacion.apoyoId) : null;
console.log(`\n📋 ${CODIGO_LINEA} — lo que se va a escribir\n`);
console.log(`   línea      : ${lineaId}`);
console.log(`   apoyos     : ${apoyos.length} punto(s) · ${apoyos.filter((a) => a.tipoPunto !== 'Empalme').length} estructuras · ${apoyos.filter((a) => a.tipoPunto === 'Empalme').length} empalmes`);
console.log(`   anclajes   : ${apoyos.filter((a) => a.tipoPunto !== 'Empalme' && /Retención|Terminal|Ángulo/.test(a.funcionEstructural)).length}`);
console.log(`   hipótesis  : SIN VALIDAR (así queda marcada, a propósito)`);
console.log(investigacion
  ? `   falla      : ${investigacion.componenteAfectado} · ${investigacion.fechaTexto} · cuelga de «${apoyoDeLaFalla?.nombreNormalizado}» (${investigacion.apoyoId})`
  : `   falla      : sin expediente en la bóveda — no se inventa ninguno`);

// ── Escritura ───────────────────────────────────────────────────────────────
async function sembrar() {
  if (SECO) {
    console.log('\n🌵 Modo seco: no se escribió nada.');
    console.log('   Antes del primer sembrado real conviene comparar estos ids contra los');
    console.log('   documentos que ya existen en la base: un id que se mueve deja huérfanas');
    console.log('   las fotos y el expediente, y no da ningún error.\n');
    return;
  }

  initializeApp({ credential: existsSync(claveEnv) ? cert(JSON.parse(readFileSync(claveEnv, 'utf-8'))) : applicationDefault() });
  const db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });

  const lote = db.batch();
  lote.set(db.collection('lineas').doc(lineaId), linea, { merge: true });
  lote.set(db.collection('hipotesis').doc(hipotesisId), hipotesis, { merge: true });
  for (const a of apoyos) lote.set(db.collection('apoyos').doc(a.id), a, { merge: true });
  if (investigacion) lote.set(db.collection('investigaciones').doc(investigacion.id), investigacion, { merge: true });
  lote.set(db.collection('config').doc('ia'), {
    enabled: false, actualizadoEn: FieldValue.serverTimestamp(),
    nota: 'Apagado hasta que existan los papeles de tratamiento de datos con el cliente (ADR-004).',
  }, { merge: true });
  await lote.commit();

  // El registro se apunta DESPUÉS de que la escritura haya ido bien: un id
  // anotado como emitido que en realidad no llegó a la base sería peor que no
  // anotarlo, porque el siguiente que corra el script se lo creería.
  if (semillasNuevas.length && EMITIR_SEMILLAS) {
    const n = emitirSemillas(CODIGO_LINEA, semillasNuevas.map((s) => ({ ...s, origen: `sembrado ${AHORA.slice(0, 10)}` })));
    console.log(`\n🌱 ${n} semilla(s) anotadas en ${RUTA_REGISTRO}`);
    console.log('   A partir de ahora manda el registro: renombrar el punto ya no mueve su id.');
  }

  console.log(`\n✅ ${CODIGO_LINEA} cargada en Firestore`);

  if (CORREO_ADMIN) {
    const u = await getAuth().getUserByEmail(CORREO_ADMIN).catch(() => null);
    if (!u) {
      console.log(`\n⚠️  ${CORREO_ADMIN} todavía no ha entrado nunca. Que inicie sesión una vez y`);
      console.log(`   vuelva a correr este script para darle el rol.`);
      return;
    }
    await getAuth().setCustomUserClaims(u.uid, { orgId: ORG, rol: 'admin' });
    console.log(`\n✅ ${CORREO_ADMIN} es admin de "${ORG}".`);
    console.log(`   Debe cerrar sesión y volver a entrar para que el token traiga el rol.`);
  }
}

sembrar().catch((e) => { console.error('❌', e.message); process.exit(1); });
