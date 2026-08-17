// ============================================================================
// importar/gpx.js — leer el archivo que salió del GPS, sin fingir un navegador
// ----------------------------------------------------------------------------
// QUÉ HACE: convierte el TEXTO de un archivo GPX en la lista de puntos que el
// aparato grabó, más una lista de AVISOS con lo que el archivo NO trae.
//
// POR QUÉ NO SE USA EL LECTOR DE XML DEL NAVEGADOR. El navegador trae uno
// incorporado y sería menos código, pero solo existe DENTRO de él: un archivo que lo
// use no se puede probar con `node --test` sin montar un navegador de mentira,
// y un módulo que no se puede probar sin navegador acaba sin pruebas. Es la
// misma razón por la que la descarga de archivos vive aislada en la web. Aquí
// se lee el texto tal cual, y las pruebas leen exactamente lo mismo que leerá
// la pantalla del Ingeniero.
//
// LA REGLA QUE GOBIERNA ESTE ARCHIVO: **lo que no está, NO se rellena.** Un
// aparato que no grabó la altura no grabó un cero: grabó nada. Un cero se
// parece demasiado a «nivel del mar» y acabaría en un cálculo. Cuando falta un
// dato, la clave sencillamente no existe y el hueco se DECLARA en `avisos`,
// para que el Ingeniero lo vea antes de decidir, no después de cargar.
//
// ALCANCE DELIBERADO: solo se leen los `wpt` (los puntos marcados a mano, que
// es lo que la cuadrilla levanta). La traza `trk` del recorrido se ignora: son
// miles de posiciones automáticas del aparato, ninguna de las cuales es un
// apoyo, y colarlas aquí convertiría una carga de dos puntos en una de miles.
//
// PURO: sin DOM, sin red, sin módulos nativos.
// ============================================================================

/** Las cinco entidades del XML, más la forma numérica que algunos aparatos escriben. */
const desescapar = (s) => String(s)
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  // El ampersand va el ÚLTIMO: si se sustituyera antes, un «&amp;lt;» del
  // archivo original saldría como «<» y se llevaría por delante el texto.
  .replace(/&amp;/g, '&');

/** Un `wpt`, abierto con contenido o cerrado sobre sí mismo. */
const RE_WPT = /<wpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/wpt\s*>)/g;

/** El valor de un atributo del `wpt`, en cualquier orden y con comillas de las dos clases. */
const atributo = (crudo, nombre) => {
  const m = new RegExp(`\\b${nombre}\\s*=\\s*["']([^"']*)["']`).exec(crudo ?? '');
  return m ? m[1] : null;
};

/** El texto de un hijo directo del `wpt` (`ele`, `time`, `name`…). */
const hijo = (crudo, nombre) => {
  const m = new RegExp(`<${nombre}\\b[^>]*>([\\s\\S]*?)</${nombre}\\s*>`).exec(crudo ?? '');
  return m ? desescapar(m[1]).trim() : null;
};

/** Un número solo cuenta si es un número de verdad. Un texto vacío no es un cero. */
const numero = (t) => {
  if (t === null || t === undefined || String(t).trim() === '') return undefined;
  const n = Number(String(t).trim());
  return Number.isFinite(n) ? n : undefined;
};

/**
 * @typedef {Object} WaypointLeido
 * @property {string} nombreCampo   el `name` tal cual lo grabó el aparato
 * @property {number} lat
 * @property {number} lon
 * @property {number} [ele]         SOLO si el archivo la traía
 * @property {string} [utc]         SOLO si el archivo la traía
 * @property {string} [descripcion]
 * @property {string} [simbolo]
 * @property {string} [tipo]
 */

/**
 * @typedef {Object} AvisoDeLectura
 * @property {'sin_waypoints'|'sin_cota'|'sin_hora'|'sin_nombre'|'coordenada_invalida'|'nombres_repetidos'} tipo
 * @property {string} mensaje   en castellano, listo para enseñar
 * @property {number} [n]       cuántos puntos afecta
 * @property {number} [total]   sobre cuántos
 * @property {string[]} [puntos] cuáles
 */

/**
 * Lee un archivo GPX.
 *
 * @param {string} texto  el contenido del archivo, tal cual
 * @returns {{creator: string|null, waypoints: WaypointLeido[], avisos: AvisoDeLectura[]}}
 */
export function leerGpx(texto) {
  const crudo = typeof texto === 'string' ? texto : '';
  /** @type {AvisoDeLectura[]} */
  const avisos = [];

  if (!/<gpx\b/.test(crudo)) {
    avisos.push({
      tipo: 'sin_waypoints',
      mensaje: 'Este archivo no parece un GPX: no se encontró la etiqueta que lo abre. Compruebe que es el archivo que descargó del GPS.',
    });
    return { creator: null, waypoints: [], avisos };
  }

  const cabecera = /<gpx\b([^>]*)>/.exec(crudo)?.[1] ?? '';
  const creator = atributo(cabecera, 'creator');

  /** @type {WaypointLeido[]} */
  const waypoints = [];
  const invalidos = [];

  for (const m of crudo.matchAll(RE_WPT)) {
    const atributos = m[1] ?? '';
    const cuerpo = m[2] ?? '';
    const lat = numero(atributo(atributos, 'lat'));
    const lon = numero(atributo(atributos, 'lon'));

    if (lat === undefined || lon === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      // No se descarta en silencio: un punto que el aparato grabó y la pantalla
      // no enseña es un punto perdido, y nadie lo echaría de menos.
      invalidos.push(hijo(cuerpo, 'name') ?? '(sin nombre)');
      continue;
    }

    const punto = { nombreCampo: hijo(cuerpo, 'name') ?? '', lat, lon };
    // Las claves de lo que falta NO se crean. Ver la regla de la cabecera.
    const ele = numero(hijo(cuerpo, 'ele'));
    if (ele !== undefined) punto.ele = ele;
    const utc = hijo(cuerpo, 'time');
    if (utc) punto.utc = utc;
    const desc = hijo(cuerpo, 'desc');
    if (desc) punto.descripcion = desc;
    const sym = hijo(cuerpo, 'sym');
    if (sym) punto.simbolo = sym;
    const tipo = hijo(cuerpo, 'type');
    if (tipo) punto.tipo = tipo;

    waypoints.push(punto);
  }

  const total = waypoints.length;

  if (!total) {
    avisos.push({
      tipo: 'sin_waypoints',
      mensaje: 'El archivo no trae ni un punto marcado. Es un GPX válido, pero solo con la traza del recorrido: los apoyos se marcan a mano en el aparato.',
    });
  }

  if (invalidos.length) {
    avisos.push({
      tipo: 'coordenada_invalida',
      mensaje: `${invalidos.length} punto(s) del archivo no traen una coordenada utilizable y quedan fuera: ${invalidos.join(', ')}.`,
      n: invalidos.length,
      puntos: invalidos,
    });
  }

  const sinCota = waypoints.filter((p) => p.ele === undefined).map((p) => p.nombreCampo || '(sin nombre)');
  if (sinCota.length) {
    avisos.push({
      tipo: 'sin_cota',
      mensaje: `${sinCota.length} de ${total} sin cota: el GPS no la grabó. No se rellena con cero — un cero se leería como nivel del mar y acabaría en un cálculo.`,
      n: sinCota.length,
      total,
      puntos: sinCota,
    });
  }

  const sinHora = waypoints.filter((p) => p.utc === undefined).map((p) => p.nombreCampo || '(sin nombre)');
  if (sinHora.length) {
    avisos.push({
      tipo: 'sin_hora',
      mensaje: `${sinHora.length} de ${total} sin hora de captura: el GPS no la grabó. El punto se puede cargar igual; lo que se pierde es saber en qué jornada se levantó.`,
      n: sinHora.length,
      total,
      puntos: sinHora,
    });
  }

  const sinNombre = waypoints.filter((p) => !p.nombreCampo).length;
  if (sinNombre) {
    avisos.push({
      tipo: 'sin_nombre',
      mensaje: `${sinNombre} de ${total} sin nombre en el aparato. Se pueden cargar igual —el nombre que manda es el canónico—, pero se pierde la trazabilidad con el levantamiento.`,
      n: sinNombre,
      total,
    });
  }

  const cuenta = new Map();
  for (const p of waypoints) if (p.nombreCampo) cuenta.set(p.nombreCampo, (cuenta.get(p.nombreCampo) ?? 0) + 1);
  const repetidos = [...cuenta].filter(([, n]) => n > 1).map(([n]) => n);
  if (repetidos.length) {
    avisos.push({
      tipo: 'nombres_repetidos',
      mensaje: `El aparato grabó el mismo nombre en más de un punto: ${repetidos.join(', ')}. Hay que mirar cuál es cuál antes de cargarlos.`,
      n: repetidos.length,
      puntos: repetidos,
    });
  }

  return { creator, waypoints, avisos };
}
