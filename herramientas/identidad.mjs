// ============================================================================
// identidad.mjs — de dónde sale el id de un punto de línea, y de dónde NO
// ----------------------------------------------------------------------------
// Módulo PURO: no importa firebase-admin, no toca la red y no necesita
// credenciales. Existe para que la identidad se pueda PROBAR sin llave de
// administrador — hoy era imposible, porque la fórmula vivía dentro de
// `sembrar.mjs`, que aborta nada más cargarse si no hay credencial.
//
// LA REGLA, en una frase:
//
//     La semilla de un punto sale de su NOMBRE CANÓNICO. Nunca del índice del
//     array, nunca del nombre que quedó grabado en el GPS.
//
// POR QUÉ IMPORTA. El id no es un detalle interno: es el ÚNICO enlace entre un
// apoyo y sus fotos (`Evidencia.apoyoId`) y entre un apoyo y el expediente de
// la falla (`Investigacion.apoyoId`). Si un id se mueve, nada revienta: las 99
// fotos se quedan huérfanas y el expediente apunta al vacío, y la aplicación lo
// muestra como «no identificada», un marcador que desaparece o un apoyo sin
// fotos. Un fallo silencioso, que es el peor que hay.
//
// Y los ids se movían con solo insertar un punto: la semilla era `apoyo-<i>`,
// donde `i` era la POSICIÓN en el array del levantamiento. Cargar el pórtico
// del extremo de origen —que va ANTES de E01— habría corrido los 26.
//
// EL NOMBRE DE CAMPO NO SIRVE COMO IDENTIDAD: tiene errores confirmados por el
// Ingeniero. El apoyo que la línea llama E07 quedó grabado como "E02", y donde
// la línea tiene su E02 el GPS guardó "LN 627 E022". Lo que SÍ es verdad es el
// nombre canónico (lo tipificó el Ingeniero) y el ORDEN del recorrido.
// ============================================================================
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
export const RUTA_REGISTRO = join(AQUI, 'semillas-emitidas.json');
/** El libro de CÓDIGOS DE SERIE (las líneas y los tramos). Ver el bloque del final. */
export const RUTA_CODIGOS = join(AQUI, 'codigos-emitidos.json');

/** La organización por defecto. Hay una sola hoy; la columna existe desde el día 1. */
export const ORG_POR_DEFECTO = 'transpower';

/**
 * La fórmula del id. NO SE TOCA NI UN BYTE: reproduce exactamente los 26 ids
 * que ya están escritos en producción. Es la misma que estaba copiada en
 * `sembrar.mjs` y en `subir-evidencias.mjs`; ahora vive en un solo sitio para
 * que no puedan divergir sin que nadie lo note.
 */
export const idEstable = (org, codigoLinea, semilla) =>
  createHash('sha256').update(`${org}|${codigoLinea}|${semilla}`).digest('hex').slice(0, 32)
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');

/**
 * El registro de semillas ya EMITIDAS. Se lee del disco en cada llamada a
 * propósito: el sembrador puede escribirlo a mitad de corrida (--emitir-semillas)
 * y quedarse con una copia vieja en memoria sería justo el fallo que se quiere
 * impedir.
 */
export const leerRegistro = (ruta = RUTA_REGISTRO) => JSON.parse(readFileSync(ruta, 'utf-8'));

/**
 * La semilla de un punto, a partir de su nombre canónico.
 *
 * Si el punto ya está en el registro, MANDA EL REGISTRO. Ese es el detalle que
 * hace seguro derivar del nombre: renombrar mañana «LN-627 PORTICO FIN» no
 * movería su id, porque el registro lo ancla. El nombre solo gobierna la
 * PRIMERA vez.
 *
 * Si no está, la semilla es `punto:<nombre canónico>`. El prefijo no es
 * decorativo: el espacio de semillas legadas es exactamente /^apoyo-\d+$/ y
 * jamás contiene dos puntos, así que un nombre canónico es SINTÁCTICAMENTE
 * incapaz de producir por accidente la semilla de otro apoyo.
 *
 * ⚠️ La semilla es la cadena EXACTA: una tilde escrita en NFC o en NFD da otro
 * sha256 y por tanto otro id. Por eso los nombres canónicos se mantienen en
 * ASCII imprimible ('PORTICO', sin tilde) y hay una prueba que lo exige.
 */
export const semillaDe = (codigoLinea, nombreCanonico, registro = leerRegistro()) =>
  registro?.[codigoLinea]?.[nombreCanonico]?.semilla ?? `punto:${nombreCanonico}`;

/** El id de un punto. Es una función del NOMBRE, no de dónde esté en la lista. */
export const idDePunto = (codigoLinea, nombreCanonico, org = ORG_POR_DEFECTO, registro = leerRegistro()) =>
  idEstable(org, codigoLinea, semillaDe(codigoLinea, nombreCanonico, registro));

/**
 * Semillas que NO son de punto (la línea, la hipótesis, el expediente, cada
 * evidencia). No son posicionales y nunca lo fueron: se dejan tal cual.
 */
export const idDeSemilla = (codigoLinea, semilla, org = ORG_POR_DEFECTO) =>
  idEstable(org, codigoLinea, semilla);

/**
 * Qué nombres canónicos de esta corrida NO están todavía en el registro.
 *
 * Se llama ANTES de escribir nada. Un id nuevo no puede aparecer en la base sin
 * haber pasado por este archivo y por los ojos del Ingeniero: el sembrador
 * imprime la lista y aborta salvo que se le pase --emitir-semillas.
 */
export function verificarRegistro(codigoLinea, nombresCanonicos, opciones = {}) {
  const { org = ORG_POR_DEFECTO, registro = leerRegistro() } = opciones;
  const conocidos = registro?.[codigoLinea] ?? {};
  const nuevas = [];
  const conocidas = [];
  for (const nombre of nombresCanonicos) {
    const fila = { nombreCanonico: nombre, semilla: semillaDe(codigoLinea, nombre, registro), id: idDePunto(codigoLinea, nombre, org, registro) };
    (Object.prototype.hasOwnProperty.call(conocidos, nombre) ? conocidas : nuevas).push(fila);
  }
  // Colisión: dos nombres distintos que produjeran el mismo id serían dos puntos
  // compartiendo fotos y expediente. No debería poder pasar; se comprueba igual.
  const vistos = new Map();
  const colisiones = [];
  for (const f of [...conocidas, ...nuevas]) {
    if (vistos.has(f.id)) colisiones.push([vistos.get(f.id), f.nombreCanonico]);
    else vistos.set(f.id, f.nombreCanonico);
  }
  return { nuevas, conocidas, colisiones };
}

/**
 * Añade filas al registro. APÉNDICE PURO: si el nombre ya estaba, se deja como
 * está y no se toca — una fila escrita sostiene fotos y expedientes que ya
 * existen, y reescribirla es exactamente el accidente que este archivo evita.
 * Devuelve cuántas filas entraron de verdad.
 */
export function emitirSemillas(codigoLinea, filas, opciones = {}) {
  const { ruta = RUTA_REGISTRO, emitidoEn = new Date().toISOString().slice(0, 10), origen = 'emitida por el sembrador' } = opciones;
  const registro = leerRegistro(ruta);
  registro[codigoLinea] ??= {};
  let escritas = 0;
  for (const f of filas) {
    if (Object.prototype.hasOwnProperty.call(registro[codigoLinea], f.nombreCanonico)) continue;
    registro[codigoLinea][f.nombreCanonico] = { semilla: f.semilla, id: f.id, emitidoEn, origen: f.origen ?? origen };
    escritas += 1;
  }
  if (escritas) writeFileSync(ruta, JSON.stringify(registro, null, 2) + '\n', 'utf-8');
  return escritas;
}

/**
 * Nombres CANÓNICOS de la línea, en orden de recorrido. Vienen del módulo de
 * campo original, que ya los tenía resueltos, y los tipificó el Ingeniero.
 *
 * Hacen falta porque el GPS grabó nombres irregulares: donde la línea tiene su
 * **E02**, el equipo guardó "LN 627 E022"; donde tiene su **E07**, guardó "E02";
 * y los dos empalmes quedaron como "627 EMP TUB" y "EMPT". El nombre de campo se
 * conserva por trazabilidad, pero lo que ve el ingeniero, lo que sale en un
 * informe y —desde ahora— lo que decide la IDENTIDAD, es el canónico.
 *
 * Esta lista es SOLO la del levantamiento de julio y no crece: los puntos que se
 * añadan después traen su nombre canónico declarado en su propio fixture.
 */
export const CANONICOS = {
  'LN-627': [
    'LN-627 E01', 'LN-627 E02', 'LN-627 E03', 'LN-627 E04', 'LN-627 E05',
    'LN-627 EMP E05-E06', 'LN-627 E06', 'LN-627 EMP E06-E07', 'LN-627 E07',
    'LN-627 E08', 'LN-627 E09', 'LN-627 E10', 'LN-627 E11', 'LN-627 E12',
    'LN-627 E13', 'LN-627 E14', 'LN-627 E15', 'LN-627 E16', 'LN-627 E17',
    'LN-627 E18', 'LN-627 E19', 'LN-627 E20', 'LN-627 E21', 'LN-627 E22',
    'LN-627 E23', 'LN-627 E24',
  ],
};

// ════════════════════════════════════════════════════════════════════════════
// LAS SERIES: una LÍNEA y un TRAMO COMPARTIDO se identifican igual
// ────────────────────────────────────────────────────────────────────────────
// QUÉ ES UNA SERIE. Lo que lleva torres colgando. Hoy hay dos clases:
//
//   · LÍNEA  (`LN-`) — el circuito completo, con su SCADA y su informe.
//   · TRAMO  (`TR-`) — el trozo por el que pasan DOS líneas en la misma torre.
//
// POR QUÉ EXISTE EL TRAMO, en una frase: una torre de doble circuito es UNA
// torre. Registrarla dos veces —una por línea— daría dos fichas del mismo
// hierro, dos inspecciones que se contradicen y dos veredictos distintos del
// mismo apoyo. Así que las torres del trozo compartido se registran UNA vez a
// nombre del TRAMO, y cada línea declara que lo recorre.
//
// LA DECISIÓN DE LA SEMILLA, escrita aquí porque un id no se puede cambiar
// después. El id de una línea se deriva hoy como `idEstable(org, código,
// 'linea')` — es lo que hace `herramientas/sembrar.mjs` y es lo que emitió el id
// de LN-627 que está en producción. Para el tramo se usa la MISMA fórmula y el
// MISMO sitio de la semilla, cambiando solo la palabra: `'tramo'`.
//
//   · Por qué NO hacía falta cambiarla: el código («TR-618») ya entra dentro del
//     hash, así que un tramo jamás podría chocar con una línea aunque los dos
//     usaran la semilla `'linea'`. No se elige por miedo a un choque.
//   · Por qué SÍ se cambia: para que la semilla diga en voz alta qué clase de
//     serie es. Una fila del libro que declare `tipo: "tramo"` con semilla
//     `linea` es una contradicción, y la prueba la caza. Con una sola palabra
//     para las dos clases, esa contradicción sería indetectable.
//   · Lo que cuesta: dos palabras en vez de una. Nada más — el prefijo del
//     código y la semilla salen los dos del mismo sitio, `tipoDeSerie`.
//
// ⚠️ Esto NO se puede tocar después. El día que se cambie la semilla del tramo,
// las 28 torres, sus fotos y sus fichas quedan colgando de un id que ya no
// existe, sin un solo error visible.
// ════════════════════════════════════════════════════════════════════════════

/** El prefijo obligatorio de cada clase de serie. No hay serie sin prefijo. */
export const PREFIJO_DE_TIPO = { linea: 'LN-', tramo: 'TR-' };

/** La semilla de cada clase de serie. `linea` es la que ya emitió LN-627. */
export const SEMILLA_DE_TIPO = { linea: 'linea', tramo: 'tramo' };

/**
 * Qué clase de serie es un código, a partir de su PREFIJO.
 *
 * Lanza si el código no empieza por un prefijo conocido. No devuelve un valor
 * por defecto a propósito: adivinar aquí significaría escribir el documento de
 * una línea con el identificador de otra cosa, y eso no se puede deshacer
 * (`firestore.rules` no deja borrar líneas).
 */
export function tipoDeSerie(codigo) {
  for (const [tipo, prefijo] of Object.entries(PREFIJO_DE_TIPO)) {
    if (typeof codigo === 'string' && codigo.startsWith(prefijo)) return tipo;
  }
  throw new Error(
    `«${codigo}» no es un código de serie: tiene que empezar por «LN-» (línea) o por «TR-» (tramo compartido). ` +
    'El prefijo no es decoración: es lo que dice si el documento que se va a escribir es una línea o un tramo.',
  );
}

/** La semilla que le toca a un código de serie. Sale del prefijo, no de un campo. */
export const semillaDeSerie = (codigo) => SEMILLA_DE_TIPO[tipoDeSerie(codigo)];

/**
 * El id permanente de una serie —línea o tramo— derivado de su código.
 *
 * ⚠️ Esto DERIVA. En la máquina del Ingeniero está bien: aquí se emite. Lo que
 * corre en el navegador tiene que BUSCAR el id en `codigos-emitidos.json`, no
 * recalcularlo: un código mal tecleado derivaría una serie nueva, permanente y
 * que no se puede borrar.
 */
export const idDeSerie = (codigo, org = ORG_POR_DEFECTO) =>
  idEstable(org, codigo, semillaDeSerie(codigo));

/** El libro de códigos de serie ya emitidos, leído del disco en cada llamada. */
export const leerCodigos = (ruta = RUTA_CODIGOS) => JSON.parse(readFileSync(ruta, 'utf-8'));

// ────────────────────────────────────────────────────────────────────────────
// EL LEVANTAMIENTO: lo que trajo el GPS, guardado tal cual, que NO es una torre
// ────────────────────────────────────────────────────────────────────────────
// QUÉ GUARDA. Lo que el aparato grabó: la fecha, el nombre de campo, la
// posición, la cota y la hora de cada punto, quién lo trajo y con qué archivo.
// Nada más. NO crea torres: una torre nace cuando el Ingeniero declara su
// FUNCIÓN (anclaje, suspensión, retención), y esa decisión no la toma un GPS.
//
// POR QUÉ SU ID SE DERIVA Y NO SE ANOTA EN UN LIBRO, que es lo que ADR-028
// exige para un PUNTO. Porque no es la misma clase de cosa. Un punto es un
// activo permanente: su nombre lo elige una persona y de su id cuelgan sus
// fotos y su expediente para siempre. Un levantamiento es un ARCHIVO leído un
// día concreto — un hecho medible, sobre el que no hay dos personas que puedan
// discrepar. Es exactamente el mismo argumento que ya dejó derivar el id de una
// EVIDENCIA (ADR-031), y por la misma razón operativa: si el id no saliera de
// la huella, leer dos veces el mismo GPX —porque se cortó la subida, o porque
// él quiso volver a mirarlo— escribiría DOS documentos del mismo recorrido, y
// no hay forma de borrar el sobrante.
//
// POR QUÉ LA FECHA VA DENTRO, si la huella ya distingue el archivo. Porque un
// levantamiento es un hecho FECHADO, no un archivo suelto: la semilla se lee y
// dice de qué jornada habla. Y hay una condición que la hace segura: la fecha
// tiene que salir del PROPIO ARCHIVO (la hora de captura que grabó el aparato),
// nunca de una casilla tecleada. Si se tecleara, corregir un dedazo movería el
// id y dejaría el recorrido anterior colgado.
// ────────────────────────────────────────────────────────────────────────────

/** Fecha de jornada, `AAAA-MM-DD`. Lo que se compara con los ojos y con un `sort`. */
const FORMA_DE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** La huella de un archivo: sha256 en minúsculas, los 64 caracteres. */
const FORMA_DE_HUELLA = /^[0-9a-f]{64}$/;

/** Cuántos días tiene cada mes. Bisiesto: divisible por 4, salvo siglo no divisible por 400. */
const DIAS_DE_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const esBisiesto = (anio) => (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;

/**
 * ¿Ese día EXISTE en el calendario? Gemela exacta de la del navegador
 * (`importar/identidad.js`) y de la del molde (`contratos/src/levantamiento.ts`).
 *
 * Se cuenta a mano y NO con `new Date(...)` a propósito: `Date` no rechaza nada
 * —«2026-02-31» se le vuelve calladamente el 3 de marzo— y además reinterpreta los
 * años de dos cifras (el año 0 se le convierte en 1900, que no es bisiesto cuando
 * el 0 sí lo es). Aquí no se puede fallar: esta fecha entra en un id PERMANENTE.
 */
export function esDiaDelCalendario(fecha) {
  if (typeof fecha !== 'string' || !FORMA_DE_FECHA.test(fecha)) return false;
  const anio = Number(fecha.slice(0, 4));
  const mes = Number(fecha.slice(5, 7));
  const dia = Number(fecha.slice(8, 10));
  if (mes < 1 || mes > 12 || dia < 1) return false;
  return dia <= (mes === 2 && esBisiesto(anio) ? 29 : DIAS_DE_MES[mes - 1]);
}

/**
 * La semilla de un levantamiento: `levantamiento-<AAAA-MM-DD>-<huella>`.
 *
 * Se valida la forma de las dos piezas antes de mezclarlas. Sin esto, un
 * `undefined` que se colara produciría el hash de la cadena «undefined»: un id
 * con forma perfecta, repetible, y apuntando al documento equivocado. El fallo
 * silencioso otra vez.
 *
 * Y de la fecha se exige además que el DÍA EXISTA, no solo que tenga la forma.
 * `2026-02-31`, `2026-13-01` y `0000-99-99` pasaban el filtro y acuñaban un
 * identificador permanente con una fecha imposible dentro: el documento no se
 * puede borrar, su fecha no se puede reescribir (`firestore.rules` solo deja mover
 * la nota) y la lista se ordena por TEXTO, así que un «9999-…» se quedaría para
 * siempre arriba como el recorrido más reciente.
 */
export function semillaDeLevantamiento(fecha, huella) {
  if (typeof fecha !== 'string' || !FORMA_DE_FECHA.test(fecha)) {
    throw new Error(
      `La fecha del levantamiento tiene que venir como AAAA-MM-DD y llegó «${fecha ?? '—'}». ` +
      'Sale de la hora que grabó el propio aparato, no de una casilla escrita a mano: si se teclea, corregir un dedazo mueve el identificador y deja el recorrido anterior colgado.',
    );
  }
  if (!esDiaDelCalendario(fecha)) {
    throw new Error(
      `«${fecha}» no es un día que exista en el calendario. ` +
      'La fecha de la jornada entra en el identificador del recorrido, y ese identificador no se puede cambiar ni borrar: un 31 de febrero se quedaría escrito para siempre.',
    );
  }
  if (typeof huella !== 'string' || !FORMA_DE_HUELLA.test(huella)) {
    throw new Error(
      `La huella del archivo del levantamiento tiene que ser un sha256 de 64 caracteres en minúsculas y llegó «${huella ?? '—'}». ` +
      'Sin huella no se puede saber si este archivo ya se leyó, y leerlo dos veces escribiría dos recorridos que no se pueden borrar.',
    );
  }
  return `levantamiento-${fecha}-${huella}`;
}

/**
 * El id del levantamiento de una serie. Leer dos veces el mismo archivo con la
 * misma fecha y la misma serie cae en el MISMO documento: **no se duplica**.
 *
 * ⚠️ PERO NO «SE PISA A SÍ MISMO» — eso es lo que decía aquí y era falso. La
 * regla DENIEGA reescribirlo: `firestore.rules §levantamientos` solo deja mover
 * `nota`, `actualizadoEn`, `actualizadoPor` y `revision`, así que un segundo
 * guardado del mismo archivo —que mueve `cargadoEn` y los puntos— se cae. Y se
 * cae con el peor mensaje que hay: «Missing or insufficient permissions», que
 * dice «no tienes permiso» cuando la verdad es «esto ya estaba cargado»
 * (`35 · L-24`, `99 §ADR-108`).
 *
 * El comportamiento es el correcto y no se toca: un recorrido es un hecho
 * fechado, no un borrador. Lo que le toca a la PANTALLA es comprobar ANTES, con
 * un `getDoc` de este mismo id, y decir «este recorrido ya estaba cargado» en vez
 * de intentar el guardado y traducir un error de permisos.
 */
export const idDeLevantamiento = (codigoSerie, fecha, huella, org = ORG_POR_DEFECTO) =>
  idEstable(org, codigoSerie, semillaDeLevantamiento(fecha, huella));
