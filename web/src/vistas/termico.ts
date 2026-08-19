// ============================================================================
// vistas/termico.ts — la temperatura del suelo como MEDIDA, no como imagen
// ----------------------------------------------------------------------------
// QUÉ CAMBIÓ Y POR QUÉ. La primera versión de esta capa guardaba teselas ya
// pintadas. Una imagen pintada solo sirve para mirarla: no se le puede preguntar
// «¿cuántos grados hay AQUÍ?», no se puede cambiar el día sin reconstruirlo todo,
// y al acercarse se ve a cuadros porque lo que se amplía son cuadraditos de
// color. Ahora lo que viaja es la REJILLA DE VALORES —un byte por celda de 30 m—
// y el color lo pone el navegador.
//
// De ahí salen las tres cosas que se pidieron: elegir el día, leer los grados de
// un punto con un clic, y que la imagen se interpole al acercarse en vez de
// romperse en bloques.
//
// ⚠️ SIGUE SIENDO LA TEMPERATURA DE LA SUPERFICIE, NO LA DEL AIRE, y sigue siendo
// UN INSTANTE (el paso del satélite, sobre las 10 de la mañana). No entra en
// ningún cálculo de la línea. Lo que cambió es cómo se guarda, no lo que mide.
//
// ⚠️ Y LO QUE NO SE MIDIÓ SE VE. Bajo una nube el sensor mide el techo de la
// nube —veinte grados más frío— así que esas celdas vienen marcadas SIN DATO y
// se pintan transparentes. Un mapa con agujeros es honesto; uno relleno de azul
// donde había nubes es una zona fresca inventada en mitad de la ciudad.
//
// PURO: sin DOM y sin red. La pantalla le pasa los bytes ya decodificados.
// ============================================================================

/** Medio mundo en Web Mercator, en metros. La rejilla vive en esta proyección. */
const E = 20037508.342789244;

export interface CodificacionTermica {
  /** Grados que representa el byte 1. */
  offset_c: number;
  /** Cuántos grados sube cada paso de byte. */
  paso_c: number;
  /** El byte reservado para «aquí no se midió». */
  sin_dato: number;
}

export interface FechaTermica {
  fecha: string;
  escena: string;
  plataforma?: string;
  nubes_pct?: number;
  /** Qué parte del recorte quedó MEDIDA tras quitar nubes y sombras. */
  cobertura_pct: number;
  resumen_c: { min_c: number; p05_c: number; p50_c: number; p95_c: number; max_c: number };
  archivo: string;
  peso_kib?: number;
}

export interface FichaTermica {
  titulo?: string;
  /** `[lonMin, latMin, lonMax, latMax]`, el mismo recorte que el mapa base. */
  bbox: [number, number, number, number];
  ancho: number;
  alto: number;
  resolucion_m: number;
  resolucion_nativa_m?: number;
  codificacion: CodificacionTermica;
  rampa: { c: number; rgb: number[] }[];
  fechas: FechaTermica[];
  fuente?: string;
  licencia?: string;
  atribucion?: string;
  mascara?: string;
  es_superficie_no_aire?: boolean;
}

// ════════════════════════════════════════════════════════════════════════════
// 1 · DEL BYTE A LOS GRADOS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Los grados que guarda un byte, o `null` si ahí no se midió.
 *
 * ⚠️ El byte reservado NO es «cero grados»: es «no hay dato». Confundirlos
 * pintaría de azul intenso todo lo que tapó una nube.
 */
export function gradosDeByte(v: number, cod: CodificacionTermica): number | null {
  if (!Number.isFinite(v) || v === cod.sin_dato) return null;
  return (v - 1) * cod.paso_c + cod.offset_c;
}

/**
 * El color de una temperatura, interpolando la rampa declarada.
 *
 * La rampa viene en la ficha y NO se calcula aquí: es la misma con la que se
 * construyó el archivo, con cortes fijos en grados. Si la pantalla se inventara
 * la suya, dos fechas se pintarían con escalas distintas y compararlas engañaría.
 */
export function colorDeGrados(c: number, rampa: { c: number; rgb: number[] }[]): [number, number, number] {
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
 * La rejilla de bytes, pintada en RGBA con la rampa.
 *
 * Se resuelve con una tabla de 256 entradas y no color a color: son un millón y
 * medio de celdas, y calcular la interpolación en cada una tarda lo que se nota.
 * Sin dato = transparente del todo.
 */
export function pintarRejilla(
  bytes: Uint8Array | Uint8ClampedArray,
  ficha: FichaTermica,
): Uint8ClampedArray {
  const tabla = new Uint8ClampedArray(256 * 4);
  for (let v = 0; v < 256; v++) {
    const c = gradosDeByte(v, ficha.codificacion);
    if (c === null) continue;                       // queda en 0,0,0,0: transparente
    const [r, g, b] = colorDeGrados(c, ficha.rampa);
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
export function celdaDe(lon: number, lat: number, ficha: FichaTermica): { ix: number; iy: number } | null {
  const [lonMin, latMin, lonMax, latMax] = ficha.bbox;
  const x0 = mercatorX(lonMin), x1 = mercatorX(lonMax);
  const y0 = mercatorY(latMin), y1 = mercatorY(latMax);
  const x = mercatorX(lon), y = mercatorY(lat);
  if (x < x0 || x > x1 || y < y0 || y > y1) return null;
  const ix = Math.min(ficha.ancho - 1, Math.floor(((x - x0) / (x1 - x0)) * ficha.ancho));
  const iy = Math.min(ficha.alto - 1, Math.floor(((y1 - y) / (y1 - y0)) * ficha.alto));
  return { ix, iy };
}

/** Los grados medidos en un punto, o `null` si está fuera del recorte o bajo nube. */
export function gradosEnPunto(
  bytes: Uint8Array | Uint8ClampedArray,
  ficha: FichaTermica,
  lon: number,
  lat: number,
): number | null {
  const celda = celdaDe(lon, lat, ficha);
  if (!celda) return null;
  return gradosDeByte(bytes[celda.iy * ficha.ancho + celda.ix], ficha.codificacion);
}

/**
 * Las cuatro esquinas del recorte en el orden que pide una fuente de imagen de
 * MapLibre: noroeste, noreste, sureste, suroeste.
 */
export function esquinas(ficha: FichaTermica): [number, number][] {
  const [lonMin, latMin, lonMax, latMax] = ficha.bbox;
  return [[lonMin, latMax], [lonMax, latMax], [lonMax, latMin], [lonMin, latMin]];
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · CÓMO SE CUENTA UNA FECHA
// ════════════════════════════════════════════════════════════════════════════

/** El día, como se lee en Colombia. La hora importa: es un instante, no un día. */
export function rotuloDeFecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Bogota',
  });
}

/**
 * Lo que hay que advertir de una fecha concreta.
 *
 * La cobertura es la cifra que decide si un mapa se puede mirar: con la mitad
 * del recorte tapado por nubes, la mediana que se publica es la mediana de LA
 * OTRA MITAD — y esa mitad no es un trozo cualquiera, es justo la que no tenía
 * nubes encima, que suele ser la más caliente.
 */
export function avisoDeCobertura(f: FechaTermica): string | null {
  if (f.cobertura_pct >= 90) return null;
  return `Solo se midió el ${f.cobertura_pct.toFixed(0)} % del recorte: el resto estaba bajo nube `
    + 'o fuera de la pasada, y sale en blanco. Las cifras de abajo son de lo medido, y lo medido '
    + 'es justo lo que NO tenía nube encima.';
}

/** Las fechas, de la más reciente a la más vieja. La lista llega ya ordenada; no se confía. */
export function fechasOrdenadas(ficha: FichaTermica): FechaTermica[] {
  return [...(ficha.fechas ?? [])].sort((a, b) => b.fecha.localeCompare(a.fecha));
}
