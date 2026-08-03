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

/** Pies de foto, si el extractor los dejó. Sin ellos se sube igual, sin pie. */
const PIES = existsSync(join(DIR, 'pies.json'))
  ? JSON.parse(readFileSync(join(DIR, 'pies.json'), 'utf-8'))
  : [];
const pieDe = (archivo) => PIES.find((p) => p.archivo === archivo)?.pie ?? undefined;

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

if (SECO) {
  console.log('\n🌵 Modo seco: no se subió ni se escribió nada.\n');
  process.exit(0);
}

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
initializeApp({ credential: cert(JSON.parse(readFileSync(clave, 'utf-8'))) });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

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
console.log(`\n⚠️  Falta decidir CÓMO se sirven: el depósito es privado y la web no`);
console.log(`   tiene servidor. Ver docs/99 · ADR pendiente sobre servido de evidencias.\n`);
