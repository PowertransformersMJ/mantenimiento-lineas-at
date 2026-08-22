// ============================================================================
// vistas/atlasCaribe.ts — un atlas del Caribe, cuadro a cuadro
// ----------------------------------------------------------------------------
// QUÉ HACE: coge el mes empaquetado que trae `<atlas>-AAAA-MM.png` —24 horas de
// ancho, un día por fila— y saca de él el cuadro de 6x6 celdas de UNA hora de UN
// día. Nada más. Puro: sin DOM y sin red.
//
// SIRVE PARA LOS DOS ATLAS —el solar y el de temperatura— porque el empaquetado
// es el mismo: lo construye un solo motor (`herramientas/atlas-caribe.mjs`). Lo
// que cambia entre uno y otro viaja DENTRO de la ficha (unidad, rampa, aviso,
// qué resume cada día), nunca en este código: un `if (capa === 'sol')` aquí sería
// el principio de dos lectores, y con ellos dos formas de recortar un cuadro.
//
// POR QUÉ UN MÓDULO Y NO UN TROZO DE LA PANTALLA: el corte del cuadro es una
// cuenta con cuatro índices y es exactamente donde se cuelan los fallos que no
// dan error — enseñar el día de al lado, o la hora de al lado, con un mapa que
// parece perfecto. Aquí tiene prueba.
//
// ⚠️ EL AÑO NO TIENE DOS PARTES, TIENE TRES, y las tres se declaran:
//   · hasta `ultimoDiaConHoras`  → hay reparto por horas. El mapa se mueve.
//   · hasta `ultimoDiaConTotal`  → SOLO el resumen del día. El mapa NO se pinta.
//   · después                    → no hay ni total.
// Las fechas viven en la FICHA, jamás en este código: escritas aquí, la frontera
// mentiría en silencio en la siguiente reconstrucción y los colores seguirían
// saliendo bonitos (`31 · L-64`).
// ============================================================================
import type { CodificacionRejilla } from './rejilla.ts';

export interface MesAtlas {
  /** '01'..'12' */
  clave: string;
  archivo: string;
  dias: number;
  horasConDato: number;
  bytes: number;
}

export interface FichaAtlas {
  /** `sol-caribe` | `temp-caribe`. Se usa para rotular, nunca para decidir. */
  capa: string;
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
  meses: MesAtlas[];
  ultimoDiaConHoras: string;
  ultimoDiaConTotal: string | null;
  construido: string;
  /**
   * EL RESUMEN DE CADA DÍA, con nombre genérico a propósito: en el atlas solar es
   * la energía (kWh/m²) y en el de temperatura la máxima (°C). Cómo se llama y en
   * qué unidad va lo dice la ficha, así que la pantalla lo imprime sin saber cuál
   * de los dos atlas está abierto.
   */
  resumenDiario: { d: string; v: number }[];
  resumenDiarioEtiqueta: string;
  resumenDiarioUnidad: string;
  resumenDiarioAviso: string;
  rampa: { c: number; rgb: number[] }[];
  hipotesisMarcadaEnRampa?: number;
  /** Qué es esa marca, en palabras del proyecto. Sin esto la rampa tendría una raya sin dueño. */
  etiquetaHipotesis?: string;
  /** Los extremos REALES de lo publicado: la pantalla no promete escala que el dato no llena. */
  medido?: { min: number; max: number };
  aviso: string;
  fuente: string;
  atribucion: string;
  unidad: string;
  remuestreo_pantalla?: string;
}

/** En qué banda de 2026 cae un día. `sin_dato` es un estado legítimo, no un fallo. */
export type BandaDelDia = 'horas' | 'solo_total' | 'sin_dato';

export function bandaDelDia(ficha: FichaAtlas, iso: string): BandaDelDia {
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
  px: Uint8Array, ficha: FichaAtlas, mes: MesAtlas, dia: number, hora: number,
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
 * LA HORA PUNTA DE ESE DÍA: aquella cuya mediana es la más alta. Sirve para abrir
 * la pantalla donde se ve algo en vez de a medianoche — que en el atlas solar es
 * un mapa negro y se lee como una avería (la piedra con la que ya tropezó la capa
 * mensual), y en el de temperatura es la hora más fresca, que es justo la que NO
 * decide nada: la ampacidad la manda la hora más caliente.
 */
export function horaPunta(
  px: Uint8Array, ficha: FichaAtlas, mes: MesAtlas, dia: number,
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

/** El resumen del día, si consta. `null` no es 0: es que no hay medida. */
export function resumenDelDia(ficha: FichaAtlas, iso: string): number | null {
  return ficha.resumenDiario.find((e) => e.d === iso)?.v ?? null;
}

/** Un mes que la pantalla puede ofrecer, tenga o no reparto por horas. */
export interface MesOfrecido {
  clave: string;
  /** Los días del mes. Siempre, aunque no haya PNG. */
  dias: number;
  /** El mes empaquetado, si existe. `null` = ese mes solo tiene total del día. */
  png: MesAtlas | null;
}

/**
 * LOS MESES QUE SE PUEDEN ELEGIR — y no son solo los que tienen PNG.
 *
 * ⚠️ ESTO ES UN ARREGLO. La primera versión listaba únicamente los meses con
 * reparto por horas, así que junio, julio y medio agosto quedaban INALCANZABLES:
 * descargados, pesados, publicados en la ficha… y sin forma de seleccionarlos.
 * La pantalla presumía de tres bandas y solo dejaba ver dos, y la leyenda decía
 * «dato hasta el 16 de agosto por día» hablando de días que nadie podía abrir.
 *
 * Se unen las dos fuentes: los meses con PNG y los meses que aparecen en el
 * resumen diario. Lo detectó la revisión adversarial.
 */
export function mesesOfrecidos(ficha: FichaAtlas): MesOfrecido[] {
  const claves = new Set<string>(ficha.meses.map((m) => m.clave));
  for (const e of ficha.resumenDiario) claves.add(e.d.slice(5, 7));

  return [...claves].sort().map((clave) => {
    const png = ficha.meses.find((m) => m.clave === clave) ?? null;
    return { clave, png, dias: png ? png.dias : diasDelMes(ficha.anio, +clave) };
  });
}

/** Los días de un mes. Sin `Date`: bisiesto explícito, y sin husos. */
export function diasDelMes(anio: number, mes: number): number {
  const largos = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (mes === 2 && ((anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0)) return 29;
  return largos[mes - 1] ?? 30;
}
