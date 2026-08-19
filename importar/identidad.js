// ============================================================================
// importar/identidad.js — la identidad se BUSCA en el libro; aquí no se acuña
// ----------------------------------------------------------------------------
// LA REGLA, en una frase:
//
//     Un punto solo se puede cargar desde la aplicación si su nombre canónico
//     YA está anotado en el registro del repositorio. La pantalla lee ese
//     libro; jamás estrena una identidad.
//
// POR QUÉ NO HAY NI UNA LÍNEA DE CRIPTOGRAFÍA AQUÍ. El id de un punto es el
// único enlace entre un apoyo y sus fotos y entre un apoyo y el expediente de
// su falla. La fórmula que lo produce vive en UN solo sitio —
// `herramientas/identidad.mjs`, que sí puede usar los módulos nativos de la
// máquina del Ingeniero— y ya emitió los ids que están escritos en producción,
// anotados uno a uno en `herramientas/semillas-emitidas.json`.
//
// Recalcular ese hash aquí sería una SEGUNDA fórmula: dos copias que solo
// coinciden mientras nadie toque ninguna, y cuyo desacuerdo no rompe nada
// visible — deja las fotos huérfanas y el expediente apuntando al vacío, en
// silencio, que es el peor fallo que hay. Con una búsqueda no puede existir la
// discrepancia: si el nombre está, el id es EL que ya está escrito; si no está,
// esto se niega a inventarlo.
//
// LO QUE ESTO LE CUESTA AL INGENIERO, dicho sin adornos: estrenar un nombre
// nuevo exige anotarlo antes en el repositorio. No se le puede ahorrar sin
// devolverle a la pantalla el poder de acuñar identidad permanente.
//
// PURO: sin DOM, sin red, sin módulos nativos. Corre igual en las pruebas y en
// el navegador.
// ============================================================================

/** La organización por defecto. Hay una sola hoy; la columna existe desde el día 1. */
export const ORG_POR_DEFECTO = 'transpower';

/**
 * Forma que tiene un id ya emitido. No se comprueba por gusto: una fila del
 * registro sin `id` devolvería `undefined`, y un documento con id indefinido
 * no se escribe mal — se escribe en OTRO sitio, o revienta el lote entero.
 */
const FORMA_DEL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * El registro tiene notas al principio (`_nota`, `_porQue…`) que explican por
 * qué vive en el repositorio público. Son documentación, no nombres.
 */
const esNota = (clave) => clave.startsWith('_');

const paginaDeLinea = (registro, codigoLinea) => {
  const pagina = registro?.[codigoLinea];
  return pagina && typeof pagina === 'object' ? pagina : null;
};

/**
 * Los nombres canónicos anotados para una línea, en el orden en que se
 * emitieron —que es el orden del recorrido, y por eso no se reordena.
 *
 * @param {object} registro       el libro completo, tal cual está en el repositorio
 * @param {string} codigoLinea    p. ej. 'LN-627'
 * @returns {string[]}
 */
export function nombresDelRegistro(registro, codigoLinea) {
  const pagina = paginaDeLinea(registro, codigoLinea);
  return pagina ? Object.keys(pagina).filter((n) => !esNota(n)) : [];
}

/**
 * La fila completa de un nombre, o `undefined` si nunca se anotó.
 *
 * @param {string} codigoLinea
 * @param {string} nombreCanonico
 * @param {object} registro
 * @returns {{semilla: string, id: string, emitidoEn?: string, origen?: string}|undefined}
 */
export function filaDelRegistro(codigoLinea, nombreCanonico, registro) {
  const pagina = paginaDeLinea(registro, codigoLinea);
  if (!pagina || typeof nombreCanonico !== 'string' || esNota(nombreCanonico)) return undefined;
  // `hasOwnProperty` y no `pagina[nombre]`: un nombre como 'constructor' o
  // 'toString' devolvería una función heredada y pasaría por fila válida.
  return Object.prototype.hasOwnProperty.call(pagina, nombreCanonico) ? pagina[nombreCanonico] : undefined;
}

/**
 * El id permanente de un punto, tal como se emitió. **Si el nombre no está
 * anotado, LANZA** — no hay camino por el que este archivo devuelva un id que
 * no estuviera ya escrito.
 *
 * @param {string} codigoLinea
 * @param {string} nombreCanonico
 * @param {object} registro
 * @returns {string}
 */
export function idDelRegistro(codigoLinea, nombreCanonico, registro) {
  if (!registro || typeof registro !== 'object') {
    throw new Error(
      'No se recibió el registro de nombres. Sin el libro no se puede resolver ninguna identidad, ' +
      'y esta pantalla no tiene permitido calcular una: se pasa el registro o no se carga nada.'
    );
  }
  const fila = filaDelRegistro(codigoLinea, nombreCanonico, registro);
  if (!fila) {
    throw new Error(
      `«${nombreCanonico}» no está en el registro de nombres de ${codigoLinea}. ` +
      'Antes de cargarlo hay que anotarlo en el libro de nombres, en el repositorio. ' +
      'No se puede estrenar identidad desde la aplicación: el id de un punto sostiene sus fotos y su expediente para siempre.'
    );
  }
  if (typeof fila.id !== 'string' || !FORMA_DEL_ID.test(fila.id)) {
    throw new Error(
      `La fila de «${nombreCanonico}» en el registro de ${codigoLinea} no trae un id con forma de identificador (trae «${fila.id ?? '—'}»). ` +
      'El registro está corrupto y no se carga nada: un documento sin id no se escribe mal, se escribe en otro sitio.'
    );
  }
  return fila.id;
}

/** Un nombre puede llegar como texto o como el documento del apoyo ya cargado. */
const nombreDe = (x) => (typeof x === 'string' ? x : (x?.nombreNormalizado ?? x?.nombreCampo ?? null));

/**
 * Qué nombres de esta línea están anotados y TODAVÍA NO están cargados. Es lo
 * único que alimenta el desplegable de la pantalla: así no hay forma de teclear
 * un nombre que no exista ni de cargar dos veces el mismo punto.
 *
 * @param {object} registro
 * @param {string} codigoLinea
 * @param {(string|{nombreNormalizado?: string, nombreCampo?: string})[]} yaCargados
 *   los apoyos que ya están en la base (o sus nombres)
 * @returns {string[]}
 */
export function nombresDisponibles(registro, codigoLinea, yaCargados = []) {
  const puestos = new Set((yaCargados ?? []).map(nombreDe).filter(Boolean));
  return nombresDelRegistro(registro, codigoLinea).filter((n) => !puestos.has(n));
}

// ════════════════════════════════════════════════════════════════════════════
// LA EXCEPCIÓN DECLARADA EN VOZ ALTA: el id de una EVIDENCIA
// ────────────────────────────────────────────────────────────────────────────
// Todo lo de arriba dice que aquí no se acuña identidad. Esto es lo único que sí
// la deriva, y se separa con una raya para que nadie lo confunda con lo otro.
//
// POR QUÉ NO ROMPE EL VETO DE ADR-028. El veto protege la identidad de un PUNTO:
// un apoyo es un activo permanente, su id sostiene sus fotos y su expediente
// para siempre, y un nombre nuevo es una decisión del Ingeniero. Una evidencia
// no es nada de eso: es un ARCHIVO. Su identidad no la elige nadie — sale de la
// huella del propio archivo, que es un hecho medible del binario. No hay dos
// personas que puedan discrepar sobre el sha256 de una foto, y por eso no hay
// nada que anotar en un libro ni nada que firmar.
//
// Y hay una razón operativa que lo hace obligatorio: si el id no saliera de la
// huella, subir dos veces la misma foto crearía DOS fichas de la misma imagen, y
// `firestore.rules` prohíbe borrar evidencias. La derivación es justo lo que
// hace que repetir una subida cortada sea seguro.
//
// EL PELIGRO REAL, y cómo se cierra. El peligro no es acuñar: es que existan DOS
// fórmulas. `herramientas/identidad.mjs` la calcula con `node:crypto` (síncrona,
// solo Node); ésta con `crypto.subtle` (asíncrona, idéntica en Node 22 y en el
// navegador). Dos implementaciones que divergen no rompen nada visible: dejan
// fotos huérfanas en silencio. Por eso `tests/identidad-apoyos.test.js` exige
// que las dos den EXACTAMENTE lo mismo, y con vectores fijos escritos a mano
// para que tampoco puedan derivar juntas.
// ════════════════════════════════════════════════════════════════════════════

/**
 * El sha256 de un texto, en hexadecimal. `crypto.subtle` existe igual en Node 22
 * y en el navegador — pero SOLO en contexto seguro (HTTPS o `localhost`). Abrir
 * la aplicación por la IP de la red local lo deja sin definir, y entonces esto
 * lanza con esas palabras en vez de fallar a medias.
 */
async function sha256Hex(texto) {
  if (typeof crypto === 'undefined' || !crypto?.subtle) {
    throw new Error(
      'Este navegador no ofrece el motor de huellas digitales. Suele pasar al abrir la aplicación ' +
      'por la dirección de red del computador en vez de por su dirección segura (https) o por «localhost». ' +
      'Sin huella no se puede saber qué fotos ya están cargadas, y sin eso no se sube nada.',
    );
  }
  const datos = new TextEncoder().encode(texto);
  const resumen = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** La huella de un binario, en hexadecimal. La misma que guarda la ficha. */
export async function huellaDeArchivo(bytes) {
  if (typeof crypto === 'undefined' || !crypto?.subtle) {
    throw new Error(
      'Este navegador no ofrece el motor de huellas digitales (hace falta abrir la aplicación por ' +
      'https o por «localhost»). Sin huella no hay forma de saber qué fotos ya están cargadas.',
    );
  }
  const resumen = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * La FORMA del id: recortar el sha256 a 32 hex y darle forma de identificador.
 * No se toca ni un byte — reproduce exactamente los ids que ya están escritos en
 * producción.
 */
const conFormaDeId = (hex) =>
  hex.slice(0, 32).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');

/**
 * El id estable de cualquier semilla NO posicional. Gemelo exacto de
 * `idEstable` de `herramientas/identidad.mjs`, en asíncrono.
 */
export const idEstable = async (org, codigoLinea, semilla) =>
  conFormaDeId(await sha256Hex(`${org}|${codigoLinea}|${semilla}`));

/**
 * El id de la ficha de una foto, a partir de la HUELLA del archivo.
 *
 * La semilla es `evidencia-<sha256>`, exactamente la que usó
 * `herramientas/subir-evidencias.mjs` para las 99 fichas que ya están escritas.
 * Volver a subir la misma foto cae en el MISMO documento: se pisa a sí misma, no
 * se duplica.
 */
export const idDeEvidencia = async (codigoLinea, sha256, org = ORG_POR_DEFECTO) =>
  idEstable(org, codigoLinea, `evidencia-${sha256}`);

/** El id de la línea. Misma semilla que el sembrador; se deriva, no se inventa. */
export const idDeLinea = async (codigoLinea, org = ORG_POR_DEFECTO) =>
  idEstable(org, codigoLinea, 'linea');
