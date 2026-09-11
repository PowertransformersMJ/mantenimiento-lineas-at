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

/**
 * COORDENADA X DE UNA HORA DEL DÍA, de 0 a 23 (`99 §ADR-130`).
 *
 * ⚠️ Con UN solo día el eje es el RELOJ, no la lista. Colocada por su posición,
 * a un día sin la hora 7 se le corrían las de la tarde una casilla a la
 * izquierda, y el rótulo de debajo decía otra hora que la del dato. Con un día
 * completo, las dos maneras dan la misma x.
 */
export function xDeHora(hora: number, l: Lienzo = LIENZO): number {
  const util = l.ancho - l.margen.i - l.margen.d;
  return l.margen.i + (Math.max(0, Math.min(23, hora)) / 23) * util;
}

/**
 * Las 24 horas del eje de un día, UNA A UNA (`99 §ADR-130`). Orden del
 * Ingeniero (2026-09-11): «que se vea hora a hora, es decir, 00, 01, 02, 03…
 * hasta completar las 24 horas». Antes salían solo 00, 03, 06…
 */
export const HORAS_DEL_DIA: readonly number[] = Array.from({ length: 24 }, (_, h) => h);

/** 7 → «07». Sin la «h»: así lo escribió él, y el subtítulo ya dice «una cada hora». */
export function rotuloDeHora(h: number): string {
  return String(h).padStart(2, '0');
}

/**
 * ¿SE PUEDE LEER EN EL RELOJ? Y, SI SÍ, EN ORDEN DE HORA (`99 §ADR-130`).
 *
 * Solo si es UN día y cada hora 0..23 sale una sola vez: dos líneas a la misma
 * hora se apilarían en la misma x. Una hora nula, vacía o fuera de 0..23 lo
 * impide —una vacía NO es la 00—.
 *
 * ⚠️ Devuelve el día ORDENADO por hora, sin tocar lo que recibe. Una tabla que
 * llegaba de la 23 a la 0 partía la línea en 24 puntos sueltos: el corte por
 * «hora que no llegó» mira la hora anterior, y eso solo tiene sentido en orden.
 *
 * @returns el día ordenado, o `null` si se queda la colocación de siempre.
 */
export function diaEnElReloj<T extends { fecha?: unknown; hora?: unknown }>(puntos: T[]): T[] | null {
  if (!puntos.length) return null;
  const fecha = String(puntos[0].fecha);
  const horas = puntos.map((p) => (p.hora == null || p.hora === '' ? NaN : Number(p.hora)));
  if (!puntos.every((p) => String(p.fecha) === fecha)) return null;
  if (!horas.every((h) => Number.isInteger(h) && h >= 0 && h <= 23)) return null;
  if (new Set(horas).size !== puntos.length) return null;
  return puntos.map((p, i) => ({ p, h: horas[i] })).sort((a, b) => a.h - b.h).map(({ p }) => p);
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

/**
 * LA FRANJA ENTRE EL MÍNIMO Y EL MÁXIMO DEL DÍA.
 *
 * ⚠️ Solo tiene sentido sobre la serie DIARIA del histórico, donde cada punto ya
 * es un día resumido: la franja es el recorrido que hizo la línea ese día, y sin
 * ella un punto al 60 % parece lo mismo tanto si el día fue plano como si osciló
 * entre 20 y 104. Es justo la diferencia que hay que ver.
 *
 * Devuelve un polígono por TRAMO CONTIGUO, por la misma razón que
 * `tramosDeLinea`: un día sin medir corta la franja en vez de rellenar el hueco
 * con una superficie que nadie midió.
 */
export function areasDeBanda(
  serie: { alto: number | null; bajo: number | null }[], techo: number, l: Lienzo = LIENZO,
): string[] {
  const areas: string[] = [];
  let corrido: number[] = [];
  const cerrar = () => {
    if (corrido.length > 1) {
      const arriba = corrido.map((i) => `${x(i, serie.length, l).toFixed(1)},${y(serie[i].alto!, techo, l).toFixed(1)}`);
      const abajo = [...corrido].reverse()
        .map((i) => `${x(i, serie.length, l).toFixed(1)},${y(serie[i].bajo!, techo, l).toFixed(1)}`);
      areas.push([...arriba, ...abajo].join(' '));
    }
    corrido = [];
  };
  serie.forEach((p, i) => {
    if (p.alto == null || p.bajo == null) { cerrar(); return; }
    corrido.push(i);
  });
  cerrar();
  return areas;
}

/** Las marcas del eje Y: de 0 al techo, cada 20, y siempre con el techo puesto. */
export function marcasY(techo: number): number[] {
  const marcas: number[] = [];
  for (let v = 0; v <= techo; v += 20) marcas.push(v);
  if (marcas[marcas.length - 1] !== techo) marcas.push(techo);
  return marcas;
}

/**
 * LAS MARCAS DEL EJE Y DE UNA MAGNITUD LIBRE (`99 §ADR-124`).
 *
 * `marcasY` sirve al eje del PORCENTAJE, que va de 0 a un techo conocido. Una
 * magnitud de operación no tiene techo: la tensión se mueve entre 68 y 70 kV y
 * la potencia activa entre −44 y −7 MW. Aquí se reparten `n` marcas por el
 * recorrido real.
 *
 * ⚠️ Y SI EL CERO ESTÁ DENTRO DEL RECORRIDO, SE MARCA. En una magnitud con
 * signo el cero no es una cifra más: es **dónde se invierte el sentido del
 * flujo**. Una potencia que cruza el cero cambia de importar a exportar, y una
 * gráfica que no lo señala esconde el único punto que hay que mirar. Cuando el
 * cero no cae dentro —la corriente va de 69 a 368 A— no se fuerza: el eje no
 * empieza en cero a propósito, y eso ya se avisa debajo de cada figura.
 *
 * @returns `{ v, cero }` por marca, para poder pintar la del cero distinta.
 */
export function marcasDeRango(lo: number, hi: number, n = 4): { v: number; cero: boolean }[] {
  if (!(hi > lo)) return [{ v: lo, cero: lo === 0 }];
  const out: { v: number; cero: boolean }[] = [];
  for (let k = 0; k < n; k += 1) out.push({ v: lo + ((hi - lo) * k) / (n - 1), cero: false });
  if (lo < 0 && hi > 0) {
    // El cero sustituye a la marca más cercana en vez de sumarse: dos etiquetas
    // pegadas se leen encima, y de las dos la que importa es el cero.
    let j = 0;
    for (let k = 1; k < out.length; k += 1) if (Math.abs(out[k].v) < Math.abs(out[j].v)) j = k;
    out[j] = { v: 0, cero: true };
  }
  return out;
}

/** Cuántas etiquetas caben en el eje X sin que se pisen. Devuelve los índices. */
export function marcasX(n: number, maximo = 8): number[] {
  if (n <= maximo) return Array.from({ length: n }, (_, i) => i);
  const paso = Math.ceil(n / maximo);
  const out: number[] = [];
  for (let i = 0; i < n; i += paso) out.push(i);
  // ⚠️ EL ÚLTIMO INSTANTE SE ENSEÑA SIEMPRE, pero sin pisar al anterior. Con 24
  // horas el paso es 3 y las marcas acaban en 21; añadir el 23 ponía dos
  // etiquetas a dos posiciones de distancia y se leían encima («21h23h»). Si el
  // hueco que queda es menor que un paso entero, el último SUSTITUYE al penúltimo
  // vez de sumarse: la marca del final importa más que la regularidad.
  const ultimo = n - 1;
  if (out[out.length - 1] !== ultimo) {
    if (ultimo - out[out.length - 1] < paso) out[out.length - 1] = ultimo;
    else out.push(ultimo);
  }
  return out;
}

/**
 * LAS MARCAS DEL EJE DEL TIEMPO, PUESTAS DONDE SIGNIFICAN ALGO (`99 §ADR-123`).
 *
 * ⚠️ `marcasX` reparte marcas cada N puntos: con 192 instantes salían en el 0,
 * el 27, el 54… y cada etiqueta llevaba fecha Y hora —«13/01 00h»— apretadas.
 * El Ingeniero lo dijo: quiere ver **horas o días**, y la fecha en otro sitio.
 *
 * Aquí las marcas caen donde **empieza cada día**, que es la frontera que un
 * ojo busca en una serie horaria: se ve dónde acaba un día y empieza el
 * siguiente sin contar puntos. Si hay más días que marcas caben, se toman uno
 * de cada `k` días — nunca a mitad de un día, que es una marca que no separa nada.
 *
 * Con UN solo día se vuelve a repartir por horas, que es la única frontera que
 * queda dentro de una jornada.
 *
 * @returns `{ idx, modo }` — `modo` dice qué rotular: la hora o el día.
 */
export function marcasDeTiempo(
  puntos: { fecha: string; hora: number | null }[], maximo = 8,
): { idx: number[]; modo: 'hora' | 'dia' } {
  const n = puntos.length;
  if (!n) return { idx: [], modo: 'hora' };
  const dias = [...new Set(puntos.map((p) => p.fecha))];
  if (dias.length <= 1) return { idx: marcasX(n, maximo), modo: 'hora' };

  // El primer índice de cada día: ahí es donde el eje cambia de jornada.
  const inicios: number[] = [];
  let previa = '';
  puntos.forEach((p, i) => { if (p.fecha !== previa) { inicios.push(i); previa = p.fecha; } });
  const salto = Math.ceil(inicios.length / maximo);
  return { idx: inicios.filter((_, k) => k % salto === 0), modo: 'dia' };
}

/** «2026-04-01» + 13 → «13h» o → «01/04», según lo que el eje esté rotulando. */
export function marcaDeTiempo(p: { fecha: string; hora: number | null }, modo: 'hora' | 'dia'): string {
  if (modo === 'dia') { const [, m, d] = p.fecha.split('-'); return `${d}/${m}`; }
  return p.hora == null ? '' : `${String(p.hora).padStart(2, '0')}h`;
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
export function aCsv(
  cabeceras: string[], filas: (string | number | null)[][],
  procedencia: readonly string[] = [],
): string {
  const celda = (v: string | number | null): string => {
    if (v == null) return '';
    if (typeof v === 'number') return String(v).replace('.', ',');
    return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  // ⚠️ EL ARCHIVO SALE DICIENDO DE DÓNDE VIENE. Salía mudo: una hoja con
  // amperios y porcentajes, sin línea, sin fecha de carga y sin la versión del
  // motor. A los tres días nadie sabe qué es, y a los seis meses alguien la cita
  // en un correo como si fuera un dictamen (`99 §ADR-093`).
  //
  // Los renglones van entrecomillados y con `#` delante para que Excel los trate
  // como texto. El `sep=;` va PRIMERO: Excel solo lo obedece en el renglón 1.
  const cabecera = procedencia.length
    ? ['sep=;', ...procedencia.map((t) => `"# ${t.replace(/"/g, '""')}"`)]
    : [];
  return '﻿' + [
    ...cabecera, cabeceras.join(';'), ...filas.map((f) => f.map(celda).join(';')),
  ].join('\r\n');
}

export interface ErrorDeFila { nFila: number | null; campo: string; valor: unknown; porQue: string }

/** El informe de errores de una carga, para poder abrirlo y corregir el origen. */
export function csvDeErrores(errores: ErrorDeFila[]): string {
  return aCsv(
    ['Fila del archivo', 'Campo', 'Valor leído', 'Por qué no se pudo usar'],
    errores.map((e) => [e.nFila, e.campo, e.valor == null ? '' : String(e.valor), e.porQue]),
  );
}
