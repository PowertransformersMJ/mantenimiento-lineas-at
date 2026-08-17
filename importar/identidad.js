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
