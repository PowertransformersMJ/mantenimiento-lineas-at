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

// ════════════════════════════════════════════════════════════════════════════
// LAS SERIES: el código no se teclea, se ELIGE del libro
// ────────────────────────────────────────────────────────────────────────────
// Una serie es lo que lleva torres colgando: una LÍNEA (`LN-`) o un TRAMO
// COMPARTIDO (`TR-`), que es el trozo por el que pasan dos líneas en la misma
// torre y donde cada torre se registra UNA sola vez.
//
// LO QUE ESTA PANTALLA HACE Y LO QUE NO. El identificador de una serie se BUSCA
// en `herramientas/codigos-emitidos.json`, igual que el de un punto se busca en
// el libro de nombres. No es celo: el documento de una línea no se puede borrar
// (`firestore.rules`), así que «LN-628» con un cero de más derivaría una línea
// nueva, permanente y sin marcha atrás. Con una lista cerrada no hay nada que
// teclear mal.
//
// Las funciones que DERIVAN (`semillaDeSerie`, `idDeSerie`) están aquí por un
// solo motivo declarado: ser la gemela exacta de `herramientas/identidad.mjs`,
// para que la prueba de oro pueda exigir que las dos den lo mismo. El alta usa
// `idDelLibro`.
// ════════════════════════════════════════════════════════════════════════════

/** El prefijo obligatorio de cada clase de serie. No hay serie sin prefijo. */
export const PREFIJO_DE_TIPO = { linea: 'LN-', tramo: 'TR-' };

/** La semilla de cada clase de serie. `linea` es la que ya emitió la línea de hoy. */
export const SEMILLA_DE_TIPO = { linea: 'linea', tramo: 'tramo' };

/**
 * Qué clase de serie es un código, a partir de su PREFIJO. Lanza si no lo trae:
 * adivinar aquí es escribir el documento de una línea con identidad de otra cosa.
 */
export function tipoDeSerie(codigo) {
  for (const [tipo, prefijo] of Object.entries(PREFIJO_DE_TIPO)) {
    if (typeof codigo === 'string' && codigo.startsWith(prefijo)) return tipo;
  }
  throw new Error(
    `«${codigo}» no es un código de serie: tiene que empezar por «LN-» (línea) o por «TR-» (tramo compartido). ` +
    'El prefijo es lo que dice si lo que se va a escribir es una línea o un tramo.',
  );
}

/** La semilla que le toca a un código de serie. Sale del prefijo, no de un campo. */
export const semillaDeSerie = (codigo) => SEMILLA_DE_TIPO[tipoDeSerie(codigo)];

/**
 * El id de una serie, DERIVADO. Gemela exacta de la de Node; la pantalla no la
 * usa para dar de alta nada — para eso está `idDelLibro`.
 */
export const idDeSerie = async (codigo, org = ORG_POR_DEFECTO) =>
  idEstable(org, codigo, semillaDeSerie(codigo));

/**
 * Los códigos de serie anotados en el libro, en el orden en que se escribieron.
 * Es lo único que alimenta la lista del alta: así no hay forma de teclear un
 * código que no exista.
 *
 * @param {object} libro   `herramientas/codigos-emitidos.json`, tal cual
 * @returns {string[]}
 */
export function codigosDelLibro(libro) {
  if (!libro || typeof libro !== 'object') return [];
  return Object.keys(libro).filter((c) => !esNota(c));
}

/**
 * La fila completa de un código, o `undefined` si nunca se anotó.
 *
 * @returns {{tipo: string, semilla: string, id: string, emitidoEn?: string, origen?: string}|undefined}
 */
export function filaDelLibro(libro, codigo) {
  if (!libro || typeof libro !== 'object') return undefined;
  if (typeof codigo !== 'string' || esNota(codigo)) return undefined;
  // `hasOwnProperty` y no `libro[codigo]`: un código como 'constructor' o
  // 'toString' devolvería una función heredada y pasaría por fila válida.
  return Object.prototype.hasOwnProperty.call(libro, codigo) ? libro[codigo] : undefined;
}

/**
 * El id permanente de una serie, tal como se emitió. **Si el código no está
 * anotado, LANZA** — igual que con un punto, esta pantalla no estrena identidad.
 */
export function idDelLibro(libro, codigo) {
  if (!libro || typeof libro !== 'object') {
    throw new Error(
      'No se recibió el libro de códigos. Sin él no se puede resolver la identidad de ninguna línea ni de ningún tramo, ' +
      'y esta pantalla no tiene permitido calcular una: se pasa el libro o no se da de alta nada.',
    );
  }
  const fila = filaDelLibro(libro, codigo);
  if (!fila) {
    throw new Error(
      `«${codigo}» no está en el libro de códigos de serie. Antes de darlo de alta hay que anotarlo en el repositorio. ` +
      'No se puede estrenar un código desde la aplicación: una línea creada con el código mal escrito no se puede borrar.',
    );
  }
  if (typeof fila.id !== 'string' || !FORMA_DEL_ID.test(fila.id)) {
    throw new Error(
      `La fila de «${codigo}» en el libro de códigos no trae un id con forma de identificador (trae «${fila.id ?? '—'}»). ` +
      'El libro está corrupto y no se da de alta nada: un documento sin id no se escribe mal, se escribe en otro sitio.',
    );
  }
  return fila.id;
}

// ────────────────────────────────────────────────────────────────────────────
// LA SEGUNDA PUERTA DECLARADA: el id de un LEVANTAMIENTO
// ────────────────────────────────────────────────────────────────────────────
// Un levantamiento es lo que trajo el GPS, guardado TAL CUAL: la fecha, el
// nombre de campo, la posición, la cota y la hora de cada punto, quién lo trajo
// y con qué archivo. **No crea torres.** Una torre nace cuando el Ingeniero
// declara su FUNCIÓN, y esa decisión no la toma un aparato.
//
// POR QUÉ DERIVARLO AQUÍ NO ROMPE EL VETO DE ADR-028, que es el mismo
// argumento que ya valió para una evidencia (ADR-031): el veto protege la
// identidad de un PUNTO —activo permanente, nombre elegido por una persona, del
// que cuelgan fotos y expediente para siempre—. Un levantamiento es un ARCHIVO
// leído un día concreto: su identidad sale de la huella del binario y de la
// fecha que grabó el aparato, hechos medibles sobre los que nadie puede
// discrepar. No hay nada que anotar en un libro ni nada que firmar.
//
// Y ES OBLIGATORIO derivarlo: el archivo del GPS se lee en el computador del
// Ingeniero y no sube a ningún sitio. Si el id no saliera de la huella, leer dos
// veces el mismo GPX escribiría DOS recorridos del mismo día, y no hay forma de
// borrar el sobrante.
// ────────────────────────────────────────────────────────────────────────────

/** Fecha de jornada, `AAAA-MM-DD`. */
const FORMA_DE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** La huella de un archivo: sha256 en minúsculas, los 64 caracteres. */
const FORMA_DE_HUELLA = /^[0-9a-f]{64}$/;

/** Cuántos días tiene cada mes. Bisiesto: divisible por 4, salvo siglo no divisible por 400. */
const DIAS_DE_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const esBisiesto = (anio) => (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;

/**
 * ¿Ese día EXISTE en el calendario? Gemela exacta de la de consola
 * (`herramientas/identidad.mjs`) y de la del molde (`contratos/src/levantamiento.ts`).
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
 * Las dos piezas se validan antes de mezclarlas. Sin esto, un `undefined` que
 * se colara daría el hash de la cadena «undefined»: un id con forma perfecta,
 * repetible, y apuntando al documento equivocado.
 *
 * ⚠️ La fecha sale de la hora que grabó el propio aparato, NUNCA de una casilla
 * escrita a mano: si se teclea, corregir un dedazo mueve el identificador y deja
 * el recorrido anterior colgado.
 *
 * Y se exige que el DÍA EXISTA, no solo que tenga la forma: `2026-02-31`,
 * `2026-13-01` y `0000-99-99` pasaban el filtro y acuñaban un identificador
 * permanente con una fecha imposible dentro — el documento no se puede borrar ni
 * se le puede reescribir la fecha.
 */
export function semillaDeLevantamiento(fecha, huella) {
  if (typeof fecha !== 'string' || !FORMA_DE_FECHA.test(fecha)) {
    throw new Error(
      `La fecha del levantamiento tiene que venir como AAAA-MM-DD y llegó «${fecha ?? '—'}». ` +
      'Sale de la hora que grabó el propio aparato, no de una casilla escrita a mano.',
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
 * guardado del mismo archivo —que mueve `cargadoEn` y los puntos— se cae, y se
 * cae con «Missing or insufficient permissions»: «no tienes permiso» donde la
 * verdad es «esto ya estaba cargado» (`35 · L-24`, `99 §ADR-108`).
 *
 * ESTA es la pantalla que tiene que taparlo, y aquí está dicho porque este es el
 * archivo que ella importa: antes de guardar, un `getDoc` de este mismo id; si el
 * documento existe, se dice «este recorrido ya estaba cargado» y NO se reintenta
 * el guardado. El reintento no puede salir bien: la regla está bien puesta.
 */
export const idDeLevantamiento = async (codigoSerie, fecha, huella, org = ORG_POR_DEFECTO) =>
  idEstable(org, codigoSerie, semillaDeLevantamiento(fecha, huella));
