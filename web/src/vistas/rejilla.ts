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
  /**
   * CÓMO SE REPARTEN LOS 254 ESCALONES. Ausente = `lineal`, que es como están
   * las cinco capas de medias (sol, temperatura, viento, lluvia, nubes) y como
   * seguirá estando todo lo que mida una magnitud continua en un rango estrecho.
   *
   * ⚠️ `exacta-y-log` existe por el atlas de RAYOS (`99 §ADR-079`), y no es un
   * capricho: un CONTEO no es una media. Medido el 2026-08-24 sobre una hora de
   * tormenta real, una celda tuvo **2.656 rayos** y otras tuvieron **1**. Con un
   * byte lineal solo caben 254 escalones, así que había que elegir entre:
   *   · paso 1  → el rayo suelto se ve, pero la tormenta se recorta en 254; o
   *   · paso 12 → cabe la tormenta, y **1 rayo se publica como 0**.
   * Las dos mienten, y la segunda miente justo donde una línea se cae: un solo
   * rayo basta para sacarla. Por eso los primeros escalones son EXACTOS —el
   * byte ES el conteo— y a partir de ahí suben en proporción.
   */
  curva?: 'lineal' | 'exacta-y-log';
  /** Hasta qué valor el byte es el conteo exacto (solo en `exacta-y-log`). */
  exactoHasta?: number;
  /** Cuánto multiplica cada escalón por encima de ahí (solo en `exacta-y-log`). */
  razon?: number;
}

export interface FichaRejilla {
  /** De qué capa es esta ficha. Lo escribe el generador y lo mira el mapa. */
  capa?: string;
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
  if (cod.curva === 'exacta-y-log') {
    const exacto = cod.exactoHasta ?? 0, razon = cod.razon ?? 1;
    const n = v - 1;                       // escalón: 0 es el primer valor útil
    return n <= exacto ? n : Math.round(exacto * razon ** (n - exacto));
  }
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

/** Y de vuelta a grados. Los dos inversos viven pegados a su directo a propósito:
 *  separados, el día que uno cambie el otro se queda mintiendo en silencio. */
const lonDeMercator = (x: number) => (x * 180) / E;
const latDeMercator = (y: number) =>
  (Math.atan(Math.exp((y * Math.PI) / E)) * 360) / Math.PI - 90;

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

/**
 * EL RECUADRO DE UNA CELDA, en grados — el INVERSO EXACTO de `celdaDe`.
 *
 * PARA QUÉ. Para poder DIBUJAR una celda, y no solo nombrarla: el atlas dice
 * «esta celda es la de la línea» y hasta ahora eso era una frase en un panel;
 * con esto se puede rodear en el mapa la celda de la que se está hablando.
 *
 * ⚠️ VA POR EL MISMO CAMINO QUE `celdaDe`, y esto no es adorno: las celdas son
 * iguales en MERCATOR, no en grados, así que sus bordes NO están repartidos a
 * intervalos regulares de latitud. Deshacer la cuenta en grados dibujaría un
 * recuadro desplazado respecto a la celda que el clic devuelve —el borde caería
 * dentro del color vecino— y sería un desfase creíble, del que nadie sospecha.
 * La prueba que lo vigila es de IDA Y VUELTA: el centro de este recuadro tiene
 * que devolver la misma celda por `celdaDe`, para las 36 del atlas.
 *
 * Devuelve `null` si la celda no existe en esa rejilla, en vez de un recuadro
 * recortado: un rectángulo pintado donde no hay celda es una medida inventada.
 */
export function bordeDeCelda(
  ix: number, iy: number, ficha: FichaRejilla,
): [number, number, number, number] | null {
  if (!Number.isInteger(ix) || !Number.isInteger(iy)) return null;
  if (ix < 0 || ix >= ficha.ancho || iy < 0 || iy >= ficha.alto) return null;
  const [lonMin, latMin, lonMax, latMax] = ficha.bbox;
  const x0 = mercatorX(lonMin), x1 = mercatorX(lonMax);
  const y0 = mercatorY(latMin), y1 = mercatorY(latMax);
  // Los bordes de la columna `ix` y de la fila `iy`, en mercator.
  const xIzq = x0 + ((x1 - x0) * ix) / ficha.ancho;
  const xDer = x0 + ((x1 - x0) * (ix + 1)) / ficha.ancho;
  const yArr = y1 - ((y1 - y0) * iy) / ficha.alto;          // `iy` crece hacia el SUR
  const yAba = y1 - ((y1 - y0) * (iy + 1)) / ficha.alto;
  return [lonDeMercator(xIzq), latDeMercator(yAba), lonDeMercator(xDer), latDeMercator(yArr)];
}

// ════════════════════════════════════════════════════════════════════════════
// 5 · CAPAS TEMPORALES — lo que comparten TODAS las rejillas mes a mes
// ════════════════════════════════════════════════════════════════════════════
//
// POR QUÉ VIVEN AQUÍ Y NO EN CADA CAPA. `ADR-036` dejó este archivo agnóstico a
// propósito: no sabe si mide grados o kilovatios hora, y esa fue la razón de que
// una capa nueva no obligue a tocar la mecánica. Ordenar doce meses y elegir cuál
// se pinta es mecánica, no dominio: el recurso solar y la temperatura del aire lo
// hacen EXACTAMENTE igual, y tenerlo dos veces sería tener dos ordenaciones que
// el día que discrepen enseñarían meses distintos en la misma pantalla.
//
// Lo que NO sube aquí es el dominio: qué significa la magnitud, qué NO se puede
// deducir de ella y contra qué hipótesis se compara. Eso es de cada capa.

/** Una capa temporal de una rejilla: un mes, o la media del año. */
export interface CapaTemporal {
  /** `01`…`12` o `anual`. Estable para el código; el rótulo es lo que se lee. */
  clave: string;
  rotulo: string;
  archivo: string;
  /** Qué parte de la malla respondió al muestrear. */
  cobertura_pct: number;
  resumen: { min: number; p50: number; max: number };
  peso_kib?: number;
}

/** Una rejilla que además tiene serie temporal. */
export interface FichaTemporal extends FichaRejilla {
  magnitud?: string;
  unidad?: string;
  periodo?: string;
  capas: CapaTemporal[];
}

/** El orden en que se leen: los doce meses y, al final, la media del año. */
export function capasOrdenadas<T extends CapaTemporal>(ficha: { capas?: T[] }): T[] {
  const xs = [...(ficha.capas ?? [])];
  return xs.sort((a, b) => {
    if (a.clave === 'anual') return 1;
    if (b.clave === 'anual') return -1;
    return a.clave.localeCompare(b.clave);
  });
}

/** La capa que toca pintar: la pedida, y si no está, la media del año. */
export function capaElegida<T extends CapaTemporal>(ficha: { capas?: T[] }, clave: string | null): T | null {
  const xs = capasOrdenadas(ficha);
  if (!xs.length) return null;
  return xs.find((c) => c.clave === clave) ?? xs.find((c) => c.clave === 'anual') ?? xs[0];
}

/**
 * Lo que hay que advertir cuando se muestrea MÁS GRUESO que el dato original.
 *
 * `porQue` lo pone cada capa porque el motivo es suyo —el recurso solar varía
 * suave, la temperatura del aire aún más— y un texto genérico no diría nada.
 */
export function avisoDeMuestreo(ficha: FichaRejilla, porQue: string): string | null {
  const nativa = ficha.resolucion_nativa_m;
  if (!nativa || !ficha.resolucion_m || ficha.resolucion_m <= nativa) return null;
  return `Muestreado cada ${(ficha.resolucion_m / 1000).toFixed(1)} km sobre un dato de `
    + `${(nativa / 1000).toFixed(1)} km: ${porQue}, pero lo que se ve es una muestra, no el original.`;
}
