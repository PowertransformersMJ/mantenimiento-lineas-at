// ============================================================================
// vistas/solCaribe.ts — el recurso solar del Caribe, cuadro a cuadro
// ----------------------------------------------------------------------------
// QUÉ HACE: coge el mes empaquetado que trae `sol-caribe-AAAA-MM.png` —24 horas
// de ancho, un día por fila— y saca de él el cuadro de 6x6 celdas de UNA hora de
// UN día. Nada más. Puro: sin DOM y sin red.
//
// POR QUÉ UN MÓDULO Y NO UN TROZO DE LA PANTALLA: el corte del cuadro es una
// cuenta con cuatro índices y es exactamente donde se cuelan los fallos que no
// dan error — enseñar el día de al lado, o la hora de al lado, con un mapa que
// parece perfecto. Aquí tiene prueba.
//
// ⚠️ 2026 NO TIENE DOS PARTES, TIENE TRES, y las tres se declaran:
//   · hasta `ultimoDiaConHoras`  → hay reparto por horas. El mapa se mueve.
//   · hasta `ultimoDiaConTotal`  → SOLO energía del día. El mapa NO se pinta.
//   · después                    → no hay ni total.
// Las fechas viven en la FICHA, jamás en este código: escritas aquí, la frontera
// mentiría en silencio en la siguiente reconstrucción y los colores seguirían
// saliendo bonitos (`31 · L-64`).
// ============================================================================
import type { CodificacionRejilla } from './rejilla.ts';

export interface MesSol {
  /** '01'..'12' */
  clave: string;
  archivo: string;
  dias: number;
  horasConDato: number;
  bytes: number;
}

export interface FichaSol {
  capa: 'sol-caribe';
  titulo: string;
  departamentos: string[];
  bbox: [number, number, number, number];
  /** Celdas del cuadro: 6 x 6. NO son los píxeles del archivo. */
  ancho: number;
  alto: number;
  /**
   * Iguales a propósito: el píxel ES la celda medida de 1°. Los declara la ficha
   * porque `rejilla.ts` los exige — y aquí sirven para que la pantalla NO avise
   * de un remuestreo que no existe.
   */
  resolucion_m: number;
  resolucion_nativa_m: number;
  codificacion: CodificacionRejilla;
  cuadros: { horas: number; porFila: number; celdaAncho: number; celdaAlto: number };
  anio: number;
  meses: MesSol[];
  ultimoDiaConHoras: string;
  ultimoDiaConTotal: string | null;
  construido: string;
  energiaDiaria: { d: string; kwh: number }[];
  rampa: { c: number; rgb: number[] }[];
  hipotesisMarcadaEnRampa?: number;
  aviso: string;
  fuente: string;
  atribucion: string;
  unidad: string;
  remuestreo_pantalla?: string;
}

/** En qué banda de 2026 cae un día. `sin_dato` es un estado legítimo, no un fallo. */
export type BandaDelDia = 'horas' | 'solo_total' | 'sin_dato';

export function bandaDelDia(ficha: FichaSol, iso: string): BandaDelDia {
  if (iso <= ficha.ultimoDiaConHoras) return 'horas';
  if (ficha.ultimoDiaConTotal && iso <= ficha.ultimoDiaConTotal) return 'solo_total';
  return 'sin_dato';
}

/** El día, en ISO, a partir del mes y el número de día. Sin `Date`: sin husos. */
export const isoDe = (anio: number, mes: string, dia: number): string =>
  `${anio}-${mes}-${String(dia).padStart(2, '0')}`;

/**
 * EL CUADRO DE UNA HORA DE UN DÍA, recortado del mes.
 *
 * `px` son los bytes del PNG entero, en orden de lectura (fila a fila). El mes
 * mide `24*ancho` de ancho y `dias*alto` de alto; el cuadro (día, hora) empieza
 * en la columna `hora*ancho` y la fila `(día-1)*alto`.
 *
 * Devuelve `null` en vez de un cuadro vacío cuando los índices se salen: un
 * cuadro de ceros se pintaría como «no se midió» en todas las celdas y se leería
 * igual que una noche legítima.
 */
export function cuadroDe(
  px: Uint8Array, ficha: FichaSol, mes: MesSol, dia: number, hora: number,
): Uint8Array | null {
  const { ancho, alto } = ficha;
  const horas = ficha.cuadros?.horas ?? 24;
  if (!Number.isInteger(dia) || dia < 1 || dia > mes.dias) return null;
  if (!Number.isInteger(hora) || hora < 0 || hora >= horas) return null;
  const anchoPx = horas * ancho;
  const necesarios = anchoPx * mes.dias * alto;
  if (px.length < necesarios) return null;   // el archivo no es el que dice la ficha

  const fuera = new Uint8Array(ancho * alto);
  for (let fy = 0; fy < alto; fy++) {
    const origen = ((dia - 1) * alto + fy) * anchoPx + hora * ancho;
    fuera.set(px.subarray(origen, origen + ancho), fy * ancho);
  }
  return fuera;
}

/** Lo que hay que decir de un cuadro. `null` donde no se midió, nunca 0. */
export function resumenDelCuadro(cuadro: Uint8Array, cod: CodificacionRejilla): {
  min: number | null; max: number | null; mediana: number | null; nSinDato: number;
} {
  const vs: number[] = [];
  let nSinDato = 0;
  for (const b of cuadro) {
    if (b === cod.sin_dato) { nSinDato++; continue; }
    vs.push((b - 1) * cod.paso + cod.offset);
  }
  if (!vs.length) return { min: null, max: null, mediana: null, nSinDato };
  vs.sort((a, b) => a - b);
  return {
    min: vs[0], max: vs[vs.length - 1],
    mediana: vs[Math.floor(vs.length / 2)],
    nSinDato,
  };
}

/**
 * La hora del día con más sol EN ESE CUADRO DE DÍAS — para abrir la pantalla
 * donde se ve algo en vez de a medianoche, que es un mapa negro y se lee como
 * una avería. Es exactamente la piedra con la que ya tropezó la capa mensual.
 */
export function horaMasSoleada(
  px: Uint8Array, ficha: FichaSol, mes: MesSol, dia: number,
): number {
  let mejor = 12, valor = -1;
  for (let h = 0; h < (ficha.cuadros?.horas ?? 24); h++) {
    const c = cuadroDe(px, ficha, mes, dia, h);
    if (!c) continue;
    const r = resumenDelCuadro(c, ficha.codificacion);
    if (r.mediana !== null && r.mediana > valor) { valor = r.mediana; mejor = h; }
  }
  return mejor;
}

/** La energía del día, si consta. `null` no es 0: es que no hay medida. */
export function energiaDelDia(ficha: FichaSol, iso: string): number | null {
  return ficha.energiaDiaria.find((e) => e.d === iso)?.kwh ?? null;
}
