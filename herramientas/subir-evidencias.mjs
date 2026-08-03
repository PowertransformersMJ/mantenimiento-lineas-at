#!/usr/bin/env node
// ============================================================================
// subir-evidencias.mjs — sube las fotos de la bóveda al almacenamiento y crea
// su ficha en la base
// ----------------------------------------------------------------------------
// LAS FOTOS NUNCA ENTRAN AL REPOSITORIO NI A LA BASE. El binario vive en
// almacenamiento de objetos (R2) y en Firestore queda solo su FICHA
// (`Evidencia`): ruta, huella, tamaño, pie y de qué cuelga. Meter una imagen en
// base64 dentro de un documento revienta el límite de 1 MiB y la memoria del
// móvil al parsear (ADR-002).
//
// USO
//   1. Habilitar R2 una vez, desde el panel de Cloudflare (exige aceptar
//      términos y registrar tarjeta: eso lo hace el Ingeniero, no este script).
//   2. Crear el depósito:  npx wrangler r2 bucket create lineas-at-evidencias
//   3. GOOGLE_APPLICATION_CREDENTIALS=/ruta/clave.json \
//        node herramientas/subir-evidencias.mjs --linea LN-627 --origen falla
//
//   --seco   enseña lo que haría sin subir ni escribir nada.
//
// Es IDEMPOTENTE: la clave del objeto y el id de la ficha se derivan de la
// HUELLA del archivo, así que volver a correrlo no duplica nada. Si una foto
// cambia, cambia su huella y entra como evidencia nueva — que es lo correcto:
// una evidencia no se edita, se añade (los eventos son inmutables).
// ============================================================================
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const ORG = 'transpower';
const AHORA = new Date().toISOString();
const DEPOSITO = 'lineas-at-evidencias';

const arg = (n, def) => {
  const i = process.argv.indexOf('--' + n);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def;
};
const bandera = (n) => process.argv.includes('--' + n);

const CODIGO_LINEA = arg('linea', 'LN-627');
const ORIGEN = arg('origen', 'falla');        // subcarpeta dentro de fotos/
const SECO = bandera('seco');

// ── De dónde salen las fotos: la bóveda, nunca el repositorio ───────────────
const DIR = join(RAIZ, '..', 'brain-private', 'mantenimiento-lineas-at', 'fotos', ORIGEN);
if (!existsSync(DIR)) {
  console.error(`❌ No está la carpeta de fotos en la bóveda:\n   ${DIR}`);
  process.exit(1);
}

/**
 * El índice que dejó el extractor. Las DOS carpetas lo traen, pero con nombre
 * distinto: `falla/` lo llama `pies.json` y `estructuras/` lo llama
 * `indice.json`. Este script solo buscaba el primero, así que con las fotos de
 * estructura `pieDe()` devolvía `undefined` para las 99 y los pies se perdían
 * sin un solo aviso (§ADR-013, plan de TODO-43). Se aceptan los dos nombres.
 */
const NOMBRES_INDICE = ['indice.json', 'pies.json'];
const RUTA_INDICE = NOMBRES_INDICE.map((n) => join(DIR, n)).find((r) => existsSync(r)) ?? null;
const INDICE = RUTA_INDICE ? JSON.parse(readFileSync(RUTA_INDICE, 'utf-8')) : [];
const entradaDe = (archivo) => INDICE.find((p) => p.archivo === archivo);
const pieDe = (archivo) => entradaDe(archivo)?.pie ?? undefined;

/**
 * ⚠️ Cuando el origen exige asignar cada foto a un apoyo, el índice NO es
 * opcional: es la única fuente del número de punto. Sin él no se sube nada —
 * mal asignadas son peores que ausentes, porque una foto colgada del apoyo
 * equivocado se lee como evidencia de algo que no ocurrió ahí.
 */
const EXIGE_APOYO = ORIGEN === 'estructuras';
if (EXIGE_APOYO && !RUTA_INDICE) {
  console.error(`❌ El origen «${ORIGEN}» asigna cada foto a un apoyo y no hay índice en la bóveda.`);
  console.error(`   Se buscó: ${NOMBRES_INDICE.map((n) => join(DIR, n)).join('\n             ')}`);
  console.error('   Sin índice no se puede saber a qué punto pertenece cada archivo. No se sube nada.');
  process.exit(1);
}

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf' };

const archivos = readdirSync(DIR)
  .filter((f) => MIME[extname(f).toLowerCase()])
  .sort();

if (!archivos.length) {
  console.error(`❌ No hay imágenes en ${DIR}`);
  process.exit(1);
}

// ── Credenciales de la base ────────────────────────────────────────────────
const clave = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!clave && !SECO) {
  console.error(`
❌ Falta la credencial de administrador para escribir las fichas.

   GOOGLE_APPLICATION_CREDENTIALS=~/Downloads/EL-ARCHIVO.json \\
     node herramientas/subir-evidencias.mjs --linea ${CODIGO_LINEA} --origen ${ORIGEN}

   (Para ver qué haría sin tocar nada: añada --seco)
`);
  process.exit(1);
}

const idEstable = (semilla) =>
  createHash('sha256').update(`${ORG}|${CODIGO_LINEA}|${semilla}`).digest('hex').slice(0, 32)
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');

/**
 * La conexión a la base. Se abre ANTES de subir cuando hay que resolver apoyos
 * —para poder abortar sin haber gastado un byte de R2— y si no, justo antes de
 * escribir las fichas. Una sola vez: `initializeApp` no es idempotente.
 */
let db = null;

// ── Preparar el lote ───────────────────────────────────────────────────────
const lote = archivos.map((archivo) => {
  const ruta = join(DIR, archivo);
  const bytes = readFileSync(ruta);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  // La clave lleva la huella: dos ficheros distintos nunca se pisan, y el mismo
  // fichero subido dos veces cae en la misma clave. Idempotencia gratis.
  const clave = `${CODIGO_LINEA}/${ORIGEN}/${sha256.slice(0, 12)}-${archivo}`;
  return {
    archivo, ruta, sha256, clave,
    bytes: bytes.length,
    mime: MIME[extname(archivo).toLowerCase()],
    pie: pieDe(archivo),
  };
});

const total = lote.reduce((s, x) => s + x.bytes, 0);
console.log(`\n📷 ${lote.length} archivo(s) · ${(total / 1048576).toFixed(1)} MB · depósito "${DEPOSITO}"\n`);
for (const x of lote) {
  console.log(`   ${x.archivo}  ${(x.bytes / 1024).toFixed(0)} KB  →  ${x.clave}`);
  if (x.pie) console.log(`      pie: ${x.pie.slice(0, 90)}${x.pie.length > 90 ? '…' : ''}`);
}

// ── A QUÉ APOYO va cada foto, y que lo vea una persona ─────────────────────
//
// LA TRAMPA, y por qué esta tabla existe. El número del archivo (`eNN`) NO es
// el número de estructura: es el número de PUNTO del levantamiento, y ahí
// dentro van también los empalmes. En LN-627 hay empalmes en los puntos 6 y 8,
// así que a partir de ahí todo se corre dos posiciones:
//
//     e06 → EMPALME E05-E06   ·   e07 → estructura E06   ·   e09 → E07 …
//
// Leer «e07 = E07» desplazaría 9 de los 14 grupos —54 de las 99 fotos— a un
// apoyo equivocado. Sería creíble y estaría mal, y nadie lo notaría hasta que
// alguien fuera al sitio. Por eso la asignación se IMPRIME antes de tocar nada:
// es la única oportunidad barata de que el Ingeniero la revise con sus ojos.
// El sistema no certifica; certifica quien firma.
if (EXIGE_APOYO) {
  if (!clave) {
    console.error('\n❌ Para asignar cada foto a su apoyo hay que LEER la base (no se recalculan ids).');
    console.error('   Añada GOOGLE_APPLICATION_CREDENTIALS, también en modo seco.\n');
    process.exit(1);
  }
  initializeApp({ credential: cert(JSON.parse(readFileSync(clave, 'utf-8'))) });
  db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });

  const snap = await db.collection('apoyos')
    .where('orgId', '==', ORG).where('lineaId', '==', idEstable('linea')).get();
  // ⚠️ Se LEE el documento y se usa SU id; no se re-deriva con la fórmula del
  // sembrador. Copiar la fórmula haría que el día que el sembrador cambie de
  // semilla las fotos apunten a documentos inexistentes, sin un solo error.
  const porOrden = new Map(snap.docs.map((d) => [d.data().orden, d.data()]));
  if (!porOrden.size) {
    console.error('\n❌ No hay apoyos de esta línea en la base. Corra antes el sembrador.\n');
    process.exit(1);
  }

  const sinResolver = [];
  for (const x of lote) {
    const n = entradaDe(x.archivo)?.estructuraPunto;
    const apoyo = Number.isInteger(n) ? porOrden.get(n - 1) : undefined;
    if (!apoyo) { sinResolver.push(`${x.archivo} (punto ${n ?? '—'})`); continue; }
    x.punto = n;
    x.apoyoId = apoyo.id;
    x.apoyoNombre = apoyo.nombreNormalizado ?? apoyo.nombreCampo;
    x.apoyoCampo = apoyo.nombreCampo;
    x.esEmpalme = (apoyo.tipoPunto ?? 'Estructura') === 'Empalme';
  }

  // TODO o NADA. La mitad de las fotos bien colgadas y la otra mitad en el limbo
  // es peor que ninguna: deja el expediente en un estado que nadie audita.
  if (sinResolver.length) {
    console.error(`\n❌ ${sinResolver.length} archivo(s) no resuelven apoyo. NO se sube ninguno:`);
    for (const s of sinResolver.slice(0, 10)) console.error(`   · ${s}`);
    process.exit(1);
  }

  const grupos = new Map();
  for (const x of lote) {
    const g = grupos.get(x.punto) ?? { ...x, n: 0 };
    grupos.set(x.punto, { ...g, n: g.n + 1 });
  }
  console.log('\n🎯 ASIGNACIÓN — revísela ANTES de que se suba nada\n');
  console.log(`   ${'archivos'.padEnd(10)} ${'punto'.padStart(5)}  ${'nombre en el GPS'.padEnd(18)} ${'a qué apoyo va'.padEnd(22)} fotos`);
  console.log(`   ${'─'.repeat(76)}`);
  for (const [n, g] of [...grupos.entries()].sort((a, b) => a[0] - b[0])) {
    const marca = g.esEmpalme ? '  ⚠️ EMPALME (no es un apoyo)' : '';
    console.log(`   e${String(n).padStart(2, '0')}-*${' '.repeat(5)} ${String(n).padStart(5)}  ${String(g.apoyoCampo).padEnd(18)} ${String(g.apoyoNombre).padEnd(22)} ${String(g.n).padStart(4)}${marca}`);
  }
  const enEmpalmes = lote.filter((x) => x.esEmpalme).length;
  console.log(`   ${'─'.repeat(76)}`);
  console.log(`   ${lote.length} fotos · ${enEmpalmes} de ellas en EMPALMES, que en este sistema NO son apoyos`);
  console.log('   (colgarlas de la estructura vecina «para no perderlas» sería inventar procedencia)\n');
}

if (SECO) {
  console.log('\n🌵 Modo seco: no se subió ni se escribió nada.\n');
  process.exit(0);
}

// El contrato admite desde ADR-015 que una evidencia cuelgue de un APOYO. Antes
// no, y escribir estas fichas sin ese cambio habría sido el peor fallo posible:
// la aplicación las leería, `safeParse` fallaría por el `refine` y el filtro las
// descartaría EN SILENCIO — 99 objetos facturando en R2, 99 fichas en la base y
// cero fotos en pantalla, sin un solo error donde mirar.

// ── Subir a R2 ─────────────────────────────────────────────────────────────
// Vía wrangler, que ya está autenticado en esta Mac. Si R2 no está habilitado,
// falla aquí con un mensaje claro y NO se escribe ninguna ficha: una ficha que
// apunta a un objeto inexistente es peor que no tener ficha.
console.log('\n⬆️  Subiendo…');

/**
 * La bandera que dice «al depósito de VERDAD, no al simulado del disco».
 *
 * Cambió de nombre entre versiones de wrangler y no da un error legible: la 4
 * exige `--remote` (por defecto escribe en un simulacro local), y la 3 no
 * conoce esa bandera y aborta con «Unknown argument: remote» — escribiendo cero
 * bytes. Se resuelve preguntándole a wrangler qué versión es, en vez de fijar
 * una: este script tiene que seguir funcionando el día que la Mac actualice.
 */
const banderaRemota = (() => {
  try {
    const v = execFileSync('npx', ['wrangler', '--version'], { cwd: RAIZ, stdio: 'pipe' })
      .toString().match(/(\d+)\.\d+\.\d+/);
    return v && Number(v[1]) >= 4 ? ['--remote'] : [];
  } catch {
    return [];   // sin versión legible, la forma antigua: en la 3 remoto es el defecto
  }
})();

for (const x of lote) {
  try {
    execFileSync('npx', [
      'wrangler', 'r2', 'object', 'put', `${DEPOSITO}/${x.clave}`,
      '--file', x.ruta, '--content-type', x.mime, ...banderaRemota,
    ], { cwd: RAIZ, stdio: 'pipe' });
    console.log(`   ✅ ${x.archivo}`);
  } catch (e) {
    const salida = (e.stderr?.toString() || e.stdout?.toString() || e.message);
    console.error(`\n❌ Falló la subida de ${x.archivo}.`);
    if (/enable R2|10042/i.test(salida)) {
      console.error(`
   R2 todavía no está habilitado en la cuenta. Se habilita UNA vez desde el
   panel de Cloudflare (Storage & databases → R2 → Overview) completando el
   alta: exige aceptar los términos y registrar una tarjeta. Ese paso lo hace
   el Ingeniero; este script no toca datos de pago.

   Después:  npx wrangler r2 bucket create ${DEPOSITO}
`);
    } else {
      console.error(salida.split('\n').slice(0, 6).join('\n'));
    }
    console.error('   No se escribió ninguna ficha en la base.\n');
    process.exit(1);
  }
}

// ── Escribir las fichas ────────────────────────────────────────────────────
if (!db) {
  initializeApp({ credential: cert(JSON.parse(readFileSync(clave, 'utf-8'))) });
  db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });
}

// De qué cuelga cada evidencia. Para el origen "falla", del expediente.
const lineaId = idEstable('linea');
const investigacionId = ORIGEN === 'falla' ? idEstable('investigacion-falla') : undefined;

if (investigacionId) {
  const inv = await db.collection('investigaciones').doc(investigacionId).get();
  if (!inv.exists) {
    console.error(`\n❌ No existe el expediente ${investigacionId} en la base.`);
    console.error('   Corra antes:  node herramientas/sembrar.mjs --linea ' + CODIGO_LINEA + '\n');
    process.exit(1);
  }
}

const escritura = db.batch();
for (const x of lote) {
  const id = idEstable('evidencia-' + x.sha256);
  escritura.set(db.collection('evidencias').doc(id), {
    id, orgId: ORG, creadoEn: AHORA, creadoPor: 'subidor', revision: 0,
    tipo: 'evidencia',
    investigacionId,
    // De qué APOYO es la foto, cuando el origen lo asigna. El campo ya existía
    // en el contrato; lo que faltaba era llenarlo.
    apoyoId: x.apoyoId,
    lineaId,
    rutaObjeto: x.clave,
    sha256: x.sha256,
    bytes: x.bytes,
    mime: x.mime,
    pie: x.pie,
    subida: 'completa',
  }, { merge: true });
}
await escritura.commit();

console.log(`\n✅ ${lote.length} ficha(s) de evidencia escritas en la base.`);
console.log(`   depósito : ${DEPOSITO}`);
console.log(`   cuelgan de: ${investigacionId ? 'investigación ' + investigacionId : 'la línea'}`);
console.log(`   se sirven por: el portero de ${DEPOSITO} (ADR-010), que verifica la sesión`);
console.log(`\n   Comprobación: abra la ficha del punto en la aplicación. Si las fotos no`);
console.log(`   aparecen, lo primero que hay que mirar es si el paquete publicado lleva la`);
console.log(`   versión del contrato que admite estas fichas — se descartan en silencio.\n`);
