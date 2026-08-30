// ============================================================================
// vistas/cargabilidadVista.ts — lo que la pantalla de cargabilidad necesita SABER
// ----------------------------------------------------------------------------
// Aquí no hay React y no hay aritmética de ingeniería. Lo primero, porque esto
// se prueba en Node; lo segundo, porque los números los da `nucleo/cargabilidad`
// y **un segundo dueño del mismo número es el día que la pantalla y el informe
// discrepan** (`CLAUDE.md §3.1`).
//
// Lo que sí vive aquí: la geometría de las gráficas —que es dibujo, no cálculo—,
// el orden y la paginación de la tabla, y el texto separado por comas que se
// descarga. Todo determinista y sin estado.
//
// ⚠️ LAS GRÁFICAS SE DIBUJAN A MANO, EN SVG, y no con una librería. Es la misma
// decisión que el lector de `.xlsx`: en un repo público, una dependencia es una
// licencia que revisar y un peso que baja el Ingeniero cada vez. Una polilínea y
// unos rectángulos no valen eso.
// ============================================================================
import { bandaDe } from '@lineas/nucleo/cargabilidad';

/** Un punto de la serie, tal y como lo entrega `serieTemporal`. */
export interface PuntoSerie {
  fecha: string;
  hora: number | null;
  pct: number;
  linea: string;
}

/**
 * EL COLOR DE CADA BANDA — y son DOS familias, no una.
 *
 * ⚠️ ESTO LO CAZÓ UNA FOTO, no una prueba. Al principio había un solo mapa, el
 * de RELLENO, y se usó también para el texto de los indicadores y para las
 * líneas de referencia de la gráfica. El resultado: «103,2 %» impreso en
 * `#fceceb` sobre panel claro — la cifra más importante de la pantalla, ilegible;
 * y las rayas del 80/90/100, invisibles. Los tokens `--t-*` de esta hoja son
 * FONDOS de tarjeta (`#fdf3df`, `#fceceb`…), no colores de tinta.
 *
 * Así que hay dos mapas y cada uno dice para qué sirve:
 *   · `RELLENO_BANDA` → superficies grandes: celda del mapa de calor, columna
 *     del histograma, cuadrito de la leyenda.
 *   · `TINTA_BANDA` → todo lo que es TRAZO o TEXTO: cifras, líneas de
 *     referencia, barras finas.
 *
 * Los dos salen del tablero de color de `estilo.css`; aquí no se escribe un
 * literal, que además lo prohíbe una prueba. Y el rojo NO es un veredicto: es
 * una banda de lectura (`nucleo/cargabilidad.js §5`).
 */
export const RELLENO_BANDA: Record<string, string> = {
  normal: 'var(--t-verde)',
  elevada: 'var(--t-ambar)',
  atencion: 'var(--t-ambar-fuerte)',
  sobrecarga: 'var(--t-rojo)',
};

export const TINTA_BANDA: Record<string, string> = {
  normal: 'var(--tx-ok)',
  elevada: 'var(--tx-aviso)',
  atencion: 'var(--acc)',
  sobrecarga: 'var(--tx-alerta)',
};

/** El gris de «aquí no se midió». No es una banda: es la ausencia de banda. */
export const COLOR_SIN_DATO = 'var(--bd)';

/** Para superficies. */
export const rellenoDe = (pct: number | null): string => {
  const b = bandaDe(pct);
  return b ? RELLENO_BANDA[b.clave] : COLOR_SIN_DATO;
};

/** Para tinta: cifras, trazos y barras finas. Es el que se usa al escribir. */
export const tintaDe = (pct: number | null): string => {
  const b = bandaDe(pct);
  return b ? TINTA_BANDA[b.clave] : 'var(--tx3)';
};

/** Las tres referencias que él pidió sobre la gráfica de tendencia. */
export const REFERENCIAS = [80, 90, 100];

// ── Geometría ───────────────────────────────────────────────────────────────

export interface Lienzo { ancho: number; alto: number; margen: { i: number; d: number; s: number; b: number } }

export const LIENZO: Lienzo = { ancho: 760, alto: 260, margen: { i: 44, d: 12, s: 12, b: 34 } };

/**
 * El techo del eje Y.
 *
 * ⚠️ **Nunca por debajo de 100.** Un eje que se ajusta al máximo de los datos
 * haría que una línea al 45 % llenara la gráfica y se leyera como una línea
 * cargada: la escala tiene que decir siempre dónde está el 100 %. Y si hay
 * sobrecarga, se sube hasta ella con holgura para que se vea POR ENCIMA de la
 * referencia, no pegada al borde.
 */
export function techoY(valores: number[]): number {
  const max = valores.length ? Math.max(...valores) : 0;
  if (max <= 100) return 100;
  return Math.ceil((max * 1.05) / 10) * 10;
}

/** Coordenada X de un punto por su posición en la serie. */
export function x(i: number, n: number, l: Lienzo = LIENZO): number {
  const util = l.ancho - l.margen.i - l.margen.d;
  return l.margen.i + (n <= 1 ? util / 2 : (i / (n - 1)) * util);
}

/** Coordenada Y de un porcentaje. Crece hacia arriba, que es como se lee. */
export function y(pct: number, techo: number, l: Lienzo = LIENZO): number {
  const util = l.alto - l.margen.s - l.margen.b;
  const acotado = Math.max(0, Math.min(pct, techo));
  return l.margen.s + util - (acotado / techo) * util;
}

/**
 * Los puntos de una polilínea SVG.
 *
 * ⚠️ Devuelve TRAMOS, no una cadena única: un hueco parte la línea en dos. Unir
 * los dos lados de una hora sin medir dibujaría una recta que nadie midió — y en
 * una gráfica de cargabilidad esa recta puede cruzar el 100 % y sugerir una
 * sobrecarga que no existió.
 */
export function tramosDeLinea(
  serie: (PuntoSerie | { pct: number | null })[], techo: number, l: Lienzo = LIENZO,
): string[] {
  const tramos: string[] = [];
  let actual: string[] = [];
  serie.forEach((p, i) => {
    if (p.pct == null) { if (actual.length > 1) tramos.push(actual.join(' ')); actual = []; return; }
    actual.push(`${x(i, serie.length, l).toFixed(1)},${y(p.pct, techo, l).toFixed(1)}`);
  });
  if (actual.length > 1) tramos.push(actual.join(' '));
  return tramos;
}

/** Las marcas del eje Y: de 0 al techo, cada 20, y siempre con el techo puesto. */
export function marcasY(techo: number): number[] {
  const marcas: number[] = [];
  for (let v = 0; v <= techo; v += 20) marcas.push(v);
  if (marcas[marcas.length - 1] !== techo) marcas.push(techo);
  return marcas;
}

/** Cuántas etiquetas caben en el eje X sin que se pisen. Devuelve los índices. */
export function marcasX(n: number, maximo = 8): number[] {
  if (n <= maximo) return Array.from({ length: n }, (_, i) => i);
  const paso = Math.ceil(n / maximo);
  const out: number[] = [];
  for (let i = 0; i < n; i += paso) out.push(i);
  if (out[out.length - 1] !== n - 1) out.push(n - 1);
  return out;
}

/** «2026-04-01» + 13 → «01/04 13h». Corto, porque va debajo de una gráfica. */
export function etiquetaInstante(p: { fecha: string; hora: number | null }): string {
  const [, m, d] = p.fecha.split('-');
  return p.hora == null ? `${d}/${m}` : `${d}/${m} ${String(p.hora).padStart(2, '0')}h`;
}

// ── La tabla ────────────────────────────────────────────────────────────────

export type Direccion = 'asc' | 'desc';

/**
 * Ordena por una columna sin mutar lo que le pasan.
 *
 * ⚠️ Los huecos van SIEMPRE al final, suba o baje el orden. Si viajaran con el
 * orden, ordenar por cargabilidad ascendente pondría arriba las horas que nadie
 * midió — y la primera fila de la tabla diría, en la práctica, «lo más
 * descargado» señalando a un vacío.
 */
export function ordenarPor<T extends Record<string, unknown>>(
  filas: T[], campo: keyof T, dir: Direccion = 'asc',
): T[] {
  const signo = dir === 'asc' ? 1 : -1;
  return [...filas].sort((a, b) => {
    const va = a[campo]; const vb = b[campo];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * signo;
    return String(va).localeCompare(String(vb), 'es') * signo;
  });
}

export function paginar<T>(filas: T[], pagina: number, porPagina: number) {
  const total = Math.max(1, Math.ceil(filas.length / porPagina));
  const p = Math.min(Math.max(1, pagina), total);
  return { pagina: p, paginas: total, filas: filas.slice((p - 1) * porPagina, p * porPagina) };
}

/** Búsqueda libre sobre los campos de texto. Sin tildes y sin mayúsculas. */
export function filtrarPorTexto<T extends Record<string, unknown>>(filas: T[], texto: string): T[] {
  const q = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (!q) return filas;
  return filas.filter((f) => Object.values(f).some((v) => v != null
    && String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(q)));
}

// ── Lo que se descarga ──────────────────────────────────────────────────────

/**
 * Texto separado por comas, con la costumbre local.
 *
 * ⚠️ **Separador `;` y coma decimal.** Un CSV con punto decimal y coma
 * separadora se abre en un Excel en español con TODO en una sola columna, y el
 * primero que lo vea creerá que la descarga está rota. El BOM del principio es
 * lo que hace que Excel respete las tildes.
 */
export function aCsv(cabeceras: string[], filas: (string | number | null)[][]): string {
  const celda = (v: string | number | null): string => {
    if (v == null) return '';
    if (typeof v === 'number') return String(v).replace('.', ',');
    return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  return '﻿' + [cabeceras.join(';'), ...filas.map((f) => f.map(celda).join(';'))].join('\r\n');
}

export interface ErrorDeFila { nFila: number | null; campo: string; valor: unknown; porQue: string }

/** El informe de errores de una carga, para poder abrirlo y corregir el origen. */
export function csvDeErrores(errores: ErrorDeFila[]): string {
  return aCsv(
    ['Fila del archivo', 'Campo', 'Valor leído', 'Por qué no se pudo usar'],
    errores.map((e) => [e.nFila, e.campo, e.valor == null ? '' : String(e.valor), e.porQue]),
  );
}
