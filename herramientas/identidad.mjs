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
