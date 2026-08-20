// ============================================================================
// vistas/rejilla.ts — una rejilla de VALORES sobre el mapa, no una imagen
// ----------------------------------------------------------------------------
// QUÉ RESUELVE. Una capa de datos sobre el mapa puede guardarse de dos formas:
// como imagen ya pintada o como los VALORES. Pintada solo sirve para mirarla —
// no se le puede preguntar «¿cuánto hay AQUÍ?», no se puede cambiar la escala ni
// la fecha sin reconstruirla, y al acercarse se ve a cuadros porque lo que se
// amplía son cuadraditos de color. Aquí viaja el valor: un byte por celda, y el
// color lo pone el navegador.
//
// Es AGNÓSTICO del dominio a propósito: no sabe si mide grados o kilovatios
// hora. La codificación (qué vale cada byte), la rampa y el recorte los declara
// la ficha del archivo, no este código — así una capa nueva no obliga a tocarlo.
//
// ⚠️ EL BYTE RESERVADO NO ES CERO. Es «aquí no se midió», y confundirlos pinta
// el extremo frío de la rampa justo donde falta el dato.
//
// PURO: sin DOM y sin red. La pantalla le pasa los bytes ya decodificados.
// ============================================================================

/** Medio mundo en Web Mercator, en metros. La rejilla vive en esta proyección. */
const E = 20037508.342789244;

export interface CodificacionRejilla {
  /** El valor que representa el byte 1, en la unidad que declare la ficha. */
  offset: number;
  /** Cuánto sube el valor por cada paso de byte. */
  paso: number;
  /** El byte reservado para «aquí no se midió». */
  sin_dato: number;
}

export interface FichaRejilla {
  titulo?: string;
  /** `[lonMin, latMin, lonMax, latMax]`, el mismo recorte que el mapa base. */
  bbox: [number, number, number, number];
  ancho: number;
  alto: number;
  resolucion_m: number;
  resolucion_nativa_m?: number;
  codificacion: CodificacionRejilla;
  rampa: { c: number; rgb: number[] }[];
  fuente?: string;
  licencia?: string;
  atribucion?: string;
}

// ════════════════════════════════════════════════════════════════════════════
// 1 · DEL BYTE AL VALOR
// ════════════════════════════════════════════════════════════════════════════

/**
 * El valor que guarda un byte, o `null` si ahí no se midió.
 *
 * ⚠️ El byte reservado NO es «cero»: es «no hay dato». Confundirlos pinta el
 * extremo de la rampa justo donde falta la medida.
 */
export function valorDeByte(v: number, cod: CodificacionRejilla): number | null {
  if (!Number.isFinite(v) || v === cod.sin_dato) return null;
  return (v - 1) * cod.paso + cod.offset;
}

/**
 * El color de una temperatura, interpolando la rampa declarada.
 *
 * La rampa viene en la ficha y NO se calcula aquí: es la misma con la que se
 * construyó el archivo, con cortes fijos en la unidad del dato. Si la pantalla se
 * inventara la suya, dos capas se pintarían con escalas distintas y compararlas engañaría.
 */
export function colorDeValor(c: number, rampa: { c: number; rgb: number[] }[]): [number, number, number] {
  if (!rampa.length) return [0, 0, 0];
  if (c <= rampa[0].c) return rampa[0].rgb as [number, number, number];
  const ultimo = rampa[rampa.length - 1];
  if (c >= ultimo.c) return ultimo.rgb as [number, number, number];
  for (let i = 1; i < rampa.length; i++) {
    if (c > rampa[i].c) continue;
    const a = rampa[i - 1], b = rampa[i];
    const t = (c - a.c) / (b.c - a.c);
    return [0, 1, 2].map((k) => Math.round(a.rgb[k] + t * (b.rgb[k] - a.rgb[k]))) as [number, number, number];
  }
  return ultimo.rgb as [number, number, number];
}

/**
 * La rejilla de bytes, pintada en RGBA con la rampa de la ficha.
 *
 * Se resuelve con una tabla de 256 entradas y no color a color: son un millón y
 * medio de celdas, y calcular la interpolación en cada una tarda lo que se nota.
 * Sin dato = transparente del todo.
 */
export function pintarRejilla(
  bytes: Uint8Array | Uint8ClampedArray,
  ficha: FichaRejilla,
): Uint8ClampedArray {
  const tabla = new Uint8ClampedArray(256 * 4);
  for (let v = 0; v < 256; v++) {
    const c = valorDeByte(v, ficha.codificacion);
    if (c === null) continue;                       // queda en 0,0,0,0: transparente
    const [r, g, b] = colorDeValor(c, ficha.rampa);
    tabla[v * 4] = r; tabla[v * 4 + 1] = g; tabla[v * 4 + 2] = b; tabla[v * 4 + 3] = 255;
  }
  const salida = new Uint8ClampedArray(bytes.length * 4);
  for (let i = 0; i < bytes.length; i++) {
    const j = bytes[i] * 4;
    salida[i * 4] = tabla[j];
    salida[i * 4 + 1] = tabla[j + 1];
    salida[i * 4 + 2] = tabla[j + 2];
    salida[i * 4 + 3] = tabla[j + 3];
  }
  return salida;
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · QUÉ TEMPERATURA HAY EN ESTE PUNTO
// ════════════════════════════════════════════════════════════════════════════

const mercatorX = (lon: number) => (E * lon) / 180;
const mercatorY = (lat: number) =>
  (E * (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180))) / 180;

/**
 * La celda de la rejilla que cae bajo una coordenada, o `null` si está fuera.
 *
 * ⚠️ LA CUENTA SE HACE EN WEB MERCATOR, no en grados. La rejilla se construyó
 * así —celdas de igual tamaño en mercator— y hacerla en latitud/longitud
 * desplazaría el punto varios cientos de metros hacia el norte a esta latitud:
 * el clic diría la temperatura del barrio de al lado.
 */
export function celdaDe(lon: number, lat: number, ficha: FichaRejilla): { ix: number; iy: number } | null {
  const [lonMin, latMin, lonMax, latMax] = ficha.bbox;
  const x0 = mercatorX(lonMin), x1 = mercatorX(lonMax);
  const y0 = mercatorY(latMin), y1 = mercatorY(latMax);
  const x = mercatorX(lon), y = mercatorY(lat);
  if (x < x0 || x > x1 || y < y0 || y > y1) return null;
  const ix = Math.min(ficha.ancho - 1, Math.floor(((x - x0) / (x1 - x0)) * ficha.ancho));
  const iy = Math.min(ficha.alto - 1, Math.floor(((y1 - y) / (y1 - y0)) * ficha.alto));
  return { ix, iy };
}

/** El valor medido en un punto, o `null` si está fuera del recorte o sin dato. */
export function valorEnPunto(
  bytes: Uint8Array | Uint8ClampedArray,
  ficha: FichaRejilla,
  lon: number,
  lat: number,
): number | null {
  const celda = celdaDe(lon, lat, ficha);
  if (!celda) return null;
  return valorDeByte(bytes[celda.iy * ficha.ancho + celda.ix], ficha.codificacion);
}

/**
 * Las cuatro esquinas del recorte en el orden que pide una fuente de imagen de
 * MapLibre: noroeste, noreste, sureste, suroeste.
 */
export function esquinas(ficha: FichaRejilla): [number, number][] {
  const [lonMin, latMin, lonMax, latMax] = ficha.bbox;
  return [[lonMin, latMax], [lonMax, latMax], [lonMax, latMin], [lonMin, latMin]];
}
