#!/usr/bin/env node
// ============================================================================
// sembrar.mjs — carga en Firestore los datos REALES de una línea
// ----------------------------------------------------------------------------
// Los datos salen del levantamiento real, que vive en la BÓVEDA PRIVADA
// (`../brain-private/…/fixtures/`) y NUNCA en este repositorio, que es público.
// Este script es el puente: lee de la bóveda y escribe en la base, que sí está
// detrás de autenticación.
//
// USO
//   1. Descargar una clave de cuenta de servicio del proyecto y guardarla FUERA
//      del repo (o dentro: el .gitignore ya bloquea serviceAccount*.json).
//   2. GOOGLE_APPLICATION_CREDENTIALS=/ruta/clave.json \
//        node herramientas/sembrar.mjs --linea LN-627 --admin correo@ejemplo.com
//
// Es IDEMPOTENTE: se puede correr las veces que haga falta.
// ============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const ORG = 'transpower';           // una sola organización hoy; la columna existe desde el día 1
const AHORA = new Date().toISOString();

// ── Argumentos ──────────────────────────────────────────────────────────────
const arg = (n, def) => {
  const i = process.argv.indexOf('--' + n);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const CODIGO_LINEA = arg('linea', 'LN-627');
const CORREO_ADMIN = arg('admin', null);

// ── Credenciales ────────────────────────────────────────────────────────────
const claveEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!claveEnv) {
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
`);
  process.exit(1);
}

initializeApp({ credential: existsSync(claveEnv) ? cert(JSON.parse(readFileSync(claveEnv, 'utf-8'))) : applicationDefault() });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

// ── Origen de los datos: la bóveda privada ──────────────────────────────────
const FIXTURE = join(RAIZ, '..', 'brain-private', 'mantenimiento-lineas-at', 'fixtures', `${CODIGO_LINEA}-geometria.json`);
if (!existsSync(FIXTURE)) {
  console.error(`❌ No está el levantamiento de ${CODIGO_LINEA} en la bóveda:\n   ${FIXTURE}`);
  process.exit(1);
}
const levantamiento = JSON.parse(readFileSync(FIXTURE, 'utf-8'));

/** Identidad estable: el mismo apoyo del mismo levantamiento da siempre el mismo id. */
const idEstable = (semilla) =>
  createHash('sha256').update(`${ORG}|${CODIGO_LINEA}|${semilla}`).digest('hex').slice(0, 32)
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');

const base = (id, extra = {}) => ({
  id, orgId: ORG, creadoEn: AHORA, creadoPor: 'sembrador', revision: 0, ...extra,
});

// ── Documentos ──────────────────────────────────────────────────────────────
const lineaId = idEstable('linea');
const hipotesisId = idEstable('hipotesis-modulo-campo');

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

const FUNCIONES = {
  'Terminal': 'Terminal',
  'Retención / anclaje': 'Retención / anclaje',
  'Ángulo': 'Ángulo',
  'Suspensión angular': 'Suspensión angular',
  'Suspensión': 'Suspensión',
};

/**
 * Nombres CANÓNICOS de la línea, en orden de recorrido. Vienen del módulo de
 * campo original, que ya los tenía resueltos.
 *
 * Hacen falta porque el GPS grabó nombres irregulares: donde la línea tiene su
 * **E02**, el equipo guardó "LN 627 E022"; y los dos empalmes quedaron como
 * "627 EMP TUB" y "EMPT". El nombre de campo se conserva por trazabilidad, pero
 * lo que ve el ingeniero y lo que sale en un informe es el canónico.
 */
const CANONICOS = {
  'LN-627': [
    'LN-627 E01', 'LN-627 E02', 'LN-627 E03', 'LN-627 E04', 'LN-627 E05',
    'LN-627 EMP E05-E06', 'LN-627 E06', 'LN-627 EMP E06-E07', 'LN-627 E07',
    'LN-627 E08', 'LN-627 E09', 'LN-627 E10', 'LN-627 E11', 'LN-627 E12',
    'LN-627 E13', 'LN-627 E14', 'LN-627 E15', 'LN-627 E16', 'LN-627 E17',
    'LN-627 E18', 'LN-627 E19', 'LN-627 E20', 'LN-627 E21', 'LN-627 E22',
    'LN-627 E23', 'LN-627 E24',
  ],
};

const apoyos = levantamiento.map((p, i) => base(idEstable('apoyo-' + i), {
  tipo: 'apoyo',
  lineaId,
  orden: i,
  // ⚠️ NO todo punto levantado es un apoyo. Un empalme puede estar a mitad de
  // vano y no sostiene nada; contarlo parte un vano real en dos falsos. En esta
  // línea eso escondía un vano de 247,8 m detrás de dos de 84 y 164 m.
  tipoPunto: /EMP/i.test(String(p.name)) ? 'Empalme' : 'Estructura',
  // El nombre de campo se conserva TAL CUAL quedó en el GPS: es la trazabilidad
  // con el levantamiento. El canónico va aparte y es el que se muestra.
  nombreCampo: String(p.name),
  nombreNormalizado: (CANONICOS[CODIGO_LINEA] ?? [])[i],
  coordenada: {
    lat: p.lat, lon: p.lon, sistemaReferencia: 'WGS84',
    cotaTerreno_m: p.ele, metodo: 'gps_mano',
    // La auditoría fue tajante: el error vertical de un GPS de mano es del mismo
    // orden que el gálibo a demostrar. Se declara para que nadie firme sobre él.
    precision_m: 8,
    tomadaEn: p.utc,
  },
  funcionEstructural: FUNCIONES[p.funcionEstructural] ?? 'Suspensión',
  funcionProcedencia: 'confirmado_humano',
  deflexion_grados: p.deflexion ?? null,
  condicion: 'Sin evaluar',
  activo: true,
}));

// ── Escritura ───────────────────────────────────────────────────────────────
async function sembrar() {
  const lote = db.batch();
  lote.set(db.collection('lineas').doc(lineaId), linea, { merge: true });
  lote.set(db.collection('hipotesis').doc(hipotesisId), hipotesis, { merge: true });
  for (const a of apoyos) lote.set(db.collection('apoyos').doc(a.id), a, { merge: true });
  lote.set(db.collection('config').doc('ia'), {
    enabled: false, actualizadoEn: FieldValue.serverTimestamp(),
    nota: 'Apagado hasta que existan los papeles de tratamiento de datos con el cliente (ADR-004).',
  }, { merge: true });
  await lote.commit();

  console.log(`✅ ${CODIGO_LINEA} cargada en Firestore`);
  console.log(`   línea      : ${lineaId}`);
  console.log(`   apoyos     : ${apoyos.length}`);
  console.log(`   anclajes   : ${apoyos.filter((a) => /Retención|Terminal|Ángulo/.test(a.funcionEstructural)).length}`);
  console.log(`   hipótesis  : SIN VALIDAR (así queda marcada, a propósito)`);

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
