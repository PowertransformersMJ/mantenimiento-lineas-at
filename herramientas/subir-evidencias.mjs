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
import { idDeSemilla } from './identidad.mjs';
import {
  MIME, NOMBRES_INDICE as NOMBRES_DE_INDICE, clasificarArchivos, describirProblema,
  claveDeObjeto, prepararReparto,
} from '@lineas/importar/evidencias';

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
 * ⚠️ SE EXIGE APOYO SIEMPRE. Solo lo apaga una bandera explícita, `--sin-apoyo`.
 *
 * EL FALLO QUE ESTO CIERRA, y era el más barato de cometer de todos. Antes esto
 * decía `const EXIGE_APOYO = ORIGEN === 'estructuras'`. Con la carpeta de hoy
 * —que se llama `registro-2026-08`— la comparación da `false`, así que las 205
 * fotos habrían subido SIN apoyo, sin una sola línea de aviso: ni un error, ni
 * una advertencia, ni una tabla. Escribir mal un argumento apagaba en silencio
 * la única comprobación que impide que una foto cuelgue del sitio equivocado.
 *
 * Una salvaguarda que se desactiva sola cuando el usuario se equivoca de nombre
 * falla ABIERTO, que es justo lo contrario de lo que hace falta aquí: las
 * reglas de la base prohíben borrar una evidencia. Ahora hay que PEDIR que se
 * apague, y quien la pide sabe lo que está pidiendo.
 *
 * Y el índice NO es opcional: es la única fuente de la CARPETA de cada archivo,
 * que es el primer eslabón de la cadena hasta el nombre canónico.
 */
const EXIGE_APOYO = !bandera('sin-apoyo');
if (EXIGE_APOYO && !RUTA_INDICE) {
  console.error(`❌ El origen «${ORIGEN}» asigna cada foto a un apoyo y no hay índice en la bóveda.`);
  console.error(`   Se buscó: ${NOMBRES_INDICE.map((n) => join(DIR, n)).join('\n             ')}`);
  console.error('   Sin índice no se puede saber a qué punto pertenece cada archivo. No se sube nada.');
  process.exit(1);
}

/**
 * El mapa de carpetas de la bóveda: de qué carpeta es qué punto, escrito a mano
 * por el Ingeniero y EN ORDEN DE RECORRIDO — ese orden es lo que comprueba el
 * control anti-transposición.
 *
 * NO es opcional cuando se asigna apoyo: es el segundo eslabón de la cadena
 * (carpeta → nombre canónico) y sin él no hay asignación posible.
 *
 * NUNCA se copia al repositorio: una de esas carpetas lleva el nombre de una
 * instalación del cliente (`33 · L-50`). Es el MISMO archivo que lee la pestaña
 * «Fotos» de la aplicación — un documento, dos lectores.
 */
const RUTA_MAPA = join(DIR, '..', `mapa-carpetas-${CODIGO_LINEA}.json`);
const MAPA = existsSync(RUTA_MAPA) ? JSON.parse(readFileSync(RUTA_MAPA, 'utf-8')) : null;
if (EXIGE_APOYO && !MAPA) {
  console.error(`\n❌ No está el mapa de carpetas en la bóveda:\n   ${RUTA_MAPA}`);
  console.error('   Ahí es donde usted declara qué carpeta es qué punto. Sin ese papel no hay');
  console.error('   forma de saber de qué apoyo es cada foto, y adivinarlo es justo lo que este');
  console.error('   sistema no va a hacer. (Para subir sin asignar apoyo: --sin-apoyo)\n');
  process.exit(1);
}

// ── Qué archivos se saben servir, y los que NO se paran ─────────────────────
//
// ANTES esto era un `.filter()`: lo que no reconocía, desaparecía sin un solo
// aviso. Con un registro hecho con iPhone —donde casi todo es HEIC— eso
// significaba subir un puñado de fotos, imprimir un «listo» en verde, y que el
// resto no existiera para nadie. El silencio era el fallo, no el formato.
const { aceptados, desconocidos } = clasificarArchivos(readdirSync(DIR).sort(), { ignorar: NOMBRES_DE_INDICE });

if (desconocidos.length) {
  console.error(`\n❌ ${desconocidos.length} archivo(s) en un formato que este sistema no sabe mostrar. NO se sube ninguno:`);
  for (const d of desconocidos.slice(0, 10)) console.error(`   · ${describirProblema({ clase: 'extension-desconocida', archivo: d })}`);
  if (desconocidos.length > 10) console.error(`   · … y ${desconocidos.length - 10} más`);
  console.error('\n   Los formatos admitidos son: ' + Object.keys(MIME).join(', ') + '\n');
  process.exit(1);
}

const archivos = aceptados.map((a) => a.archivo);

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

/**
 * El id de la línea, del expediente y de cada ficha de evidencia.
 *
 * La fórmula estaba COPIADA aquí, byte a byte igual que en `sembrar.mjs`. Dos
 * copias de la misma fórmula pueden divergir sin que nadie lo note, y divergir
 * aquí significa que este script escribiría fichas colgando de un `lineaId` que
 * el sembrador no reconoce: las fotos existirían y la pantalla no las vería.
 * Ahora hay UN solo sitio donde vive (herramientas/identidad.mjs) y una prueba
 * que se pone roja si vuelve a copiarse.
 *
 * Las semillas de este archivo NO son posicionales y nunca lo fueron ('linea',
 * 'investigacion-falla', 'evidencia-<huella del archivo>'), así que se pasan tal
 * cual por `idDeSemilla`. Los IDS DE APOYO no se calculan aquí: se leen del
 * documento que ya está en la base.
 */
const idEstable = (semilla) => idDeSemilla(CODIGO_LINEA, semilla, ORG);

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
  const clave = claveDeObjeto(CODIGO_LINEA, ORIGEN, sha256, archivo);
  return {
    archivo, ruta, sha256, clave,
    bytes: bytes.length,
    mime: MIME[extname(archivo).toLowerCase()],
    pie: pieDe(archivo),
    // ⚠️ DE DÓNDE SALIÓ, no a dónde va. El índice de la bóveda declara la
    // CARPETA; el nombre canónico lo pone el MAPA, y el apoyo lo pone la base.
    // El intento anterior leía aquí un `nombreCanonico` que el índice NO TIENE
    // —sus claves son carpeta, archivo, origen, tomadaEn, sha256, bytes— así que
    // devolvía indefinido para las 205 fotos y el guion abortaba siempre, en la
    // primera corrida, con 205 paradas idénticas.
    carpeta: entradaDe(archivo)?.carpeta,
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
// LA REGLA, desde ADR-029: la foto declara el NOMBRE del punto y ese nombre se
// busca en el campo `nombreNormalizado` del documento que ya está en la base.
// Nunca por posición.
//
// LO QUE HABÍA ANTES, y por qué se quitó. La foto declaraba su número de PUNTO
// del levantamiento y se restaba uno para buscarlo en el índice de posiciones.
// Daba el resultado correcto —los empalmes ocupan puesto en la serie y la resta
// lo compensaba— pero por casualidad, no por diseño: en cuanto entra un punto
// por delante, la serie entera se corre y todas las fotos ya colgadas cambian
// de apoyo. Y como la ficha se escribe con `merge`, una nueva corrida pisaría
// la asignación buena sin dejar rastro. Es la misma mina que ADR-027 desactivó
// para la identidad de los apoyos; esto la desactiva para las fotos.
//
// La asignación se IMPRIME antes de tocar nada: es la única oportunidad barata
// de que el Ingeniero la revise con sus ojos, y las reglas prohíben borrar una
// evidencia mal colgada. El sistema no certifica; certifica quien firma.
if (EXIGE_APOYO) {
  // ⚠️ REVISAR NO PUEDE EXIGIR LA LLAVE MAESTRA.
  //
  // Antes esto abortaba en modo `--seco` si no había credencial. O sea que el
  // paso «que lo revise una persona ANTES de escribir nada» era justo el que
  // pedía la llave que este proyecto quiere dejar de usar. Ahora en seco se
  // enseña todo lo que se puede saber sin la base —la cadena carpeta → punto,
  // que es donde se cometen los errores caros— y se DICE, con esas palabras,
  // qué parte no se pudo comprobar. Un hueco declarado vale; un hueco disfrazado
  // de comprobación, no.
  let apoyos = [];
  let seLeyoLaBase = false;
  if (clave) {
    initializeApp({ credential: cert(JSON.parse(readFileSync(clave, 'utf-8'))) });
    db = getFirestore();
    db.settings({ ignoreUndefinedProperties: true });
    const snap = await db.collection('apoyos')
      .where('orgId', '==', ORG).where('lineaId', '==', idEstable('linea')).get();
    // ⚠️ Se LEE el documento y se usa SU id; no se re-deriva con la fórmula del
    // sembrador. Copiar la fórmula haría que el día que el sembrador cambie de
    // semilla las fotos apunten a documentos inexistentes, sin un solo error.
    apoyos = snap.docs.map((d) => d.data());
    seLeyoLaBase = true;
  }

  // LA CADENA ENTERA, de una sola llamada: archivo → carpeta → nombre canónico
  // → apoyo. Es la MISMA función que usa la pestaña «Fotos» de la aplicación.
  const { asignaciones, grupos, problemas, filas, resumen } = prepararReparto({
    mapa: MAPA,
    entradas: lote,
    apoyos,
    codigoLinea: CODIGO_LINEA,
    origen: ORIGEN,
  });

  // En seco sin credencial no hay apoyos que casar: las paradas que hablan de la
  // BASE no son verdad todavía y decirlas sería mentir en la dirección cara.
  const deLaBase = new Set(['base-sin-apoyos', 'canonico-sin-apoyo', 'apoyo-repetido', 'apoyo-sin-nombre']);
  const reales = seLeyoLaBase ? problemas : problemas.filter((p) => !deLaBase.has(p.clase));

  // TODO o NADA. La mitad de las fotos bien colgadas y la otra mitad en el limbo
  // es peor que ninguna: deja el expediente en un estado que nadie audita.
  if (reales.length) {
    console.error(`\n❌ ${reales.length} problema(s) de asignación. NO se sube ni un archivo:\n`);
    for (const p of reales.slice(0, 12)) console.error(`   · ${describirProblema(p)}`);
    if (reales.length > 12) console.error(`   · … y ${reales.length - 12} más`);
    console.error('');
    process.exit(1);
  }

  if (seLeyoLaBase) {
    // Se sustituye el lote por las asignaciones: llevan lo mismo más el apoyo.
    lote.length = 0;
    lote.push(...asignaciones);
  }

  console.log('\n🎯 ASIGNACIÓN — revísela ANTES de que se suba nada\n');
  console.log(`   ${'de dónde salió'.padEnd(28)} ${'punto'.padEnd(22)} ${'nombre en el GPS'.padEnd(18)} fotos`);
  console.log(`   ${'─'.repeat(88)}`);
  if (seLeyoLaBase) {
    for (const g of grupos) {
      const marcas = g.esEmpalme ? '⚠️ EMPALME (no es un apoyo)' : '';
      console.log(`   ${String(g.carpeta ?? '—').padEnd(28)} ${String(g.nombreCanonico).padEnd(22)} ${String(g.apoyoCampo).padEnd(18)} ${String(g.fotos).padStart(4)}  ${marcas}`);
    }
    console.log(`   ${'─'.repeat(88)}`);
    console.log(`   ${resumen.fotos} fotos en ${resumen.puntos} punto(s)`);
    console.log(`   ${resumen.enEmpalmes} de ellas en EMPALMES, que en este sistema NO son apoyos`);
    console.log('   (colgarlas de la estructura vecina «para no perderlas» sería inventar procedencia)\n');
  } else {
    const cuenta = new Map();
    for (const x of lote) cuenta.set(x.carpeta, (cuenta.get(x.carpeta) ?? 0) + 1);
    for (const f of filas) {
      console.log(`   ${String(f.carpeta).padEnd(28)} ${String(f.nombreCanonico).padEnd(22)} ${'(sin leer la base)'.padEnd(18)} ${String(cuenta.get(f.carpeta) ?? 0).padStart(4)}`);
    }
    console.log(`   ${'─'.repeat(88)}`);
    console.log('   ⚠️ NO SE LEYÓ LA BASE: no hay credencial. Lo que sí está comprobado es la cadena');
    console.log('      carpeta → punto y que dos filas del mapa no estén cruzadas. Lo que NO está');
    console.log('      comprobado es que esos puntos existan en la base ni de qué apoyo cuelgan.\n');
  }
}

if (SECO) {
  console.log('\n🌵 Modo seco: no se subió ni se escribió nada.');
  console.log('   Si esta tabla es la que usted esperaba, repita la orden sin --seco.\n');
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
