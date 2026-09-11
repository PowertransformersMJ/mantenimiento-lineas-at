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

// ── EL EJE DEL CALENDARIO (`99 §ADR-131`) ───────────────────────────────────
//
// ⚠️ Orden del Ingeniero (2026-09-11), con su captura de enero: «necesito que
// el rango en el eje x se aprecie cada día uno a uno». El eje colocaba las
// horas por su PUESTO en la lista, y un día sin dato no dejaba hueco: la línea
// unía el 2 con el 13 como si fueran días seguidos y el eje saltaba del 01/01 al
// 14/01. Aquí el eje es el calendario: cada día, una casilla del mismo ancho, y
// lo que no se midió queda en blanco.

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Los días del calendario de `desde` a `hasta`, los dos incluidos. Con fechas que
 * no son «AAAA-MM-DD», o al revés, devuelve `[]`. `tope` frena un eje absurdo
 * —un rango desde el año 2000 serían 9.700 casillas— y, si se pasa, se queda con
 * los días MÁS RECIENTES: quedarse con los más viejos dejaba fuera justo el dato
 * nuevo, y la gráfica volvía en silencio a pegar los días (lo cazó la revisión).
 */
export function diasDelCalendario(desde: string, hasta: string, tope = 400): string[] {
  if (!FECHA_ISO.test(desde) || !FECHA_ISO.test(hasta) || desde > hasta) return [];
  const utc = (f: string) => { const [a, m, d] = f.split('-').map(Number); return Date.UTC(a, m - 1, d); };
  const fin = utc(hasta);
  const out: string[] = [];
  for (let t = Math.max(utc(desde), fin - (tope - 1) * 86400000); t <= fin; t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * ¿SE PUEDE LEER EN EL CALENDARIO? Varios días —con uno solo manda el reloj,
 * `diaEnElReloj`, salvo con `unDiaVale`: en un periodo consultado más largo, un
 * estadístico que guarda un solo día va sobre el calendario del periodo, con los
 * demás en blanco—, cada fecha «AAAA-MM-DD», cada hora 0..23 y cada instante una
 * sola vez: dos líneas a la misma hora se apilarían en la misma x. Devuelve las
 * horas en orden de fecha y hora, sin tocar lo recibido; o `null`, y se queda la
 * colocación de siempre.
 */
export function horasEnElCalendario<T extends { fecha?: unknown; hora?: unknown }>(
  puntos: T[], unDiaVale = false,
): T[] | null {
  if (!puntos.length) return null;
  const claves: string[] = [];
  for (const p of puntos) {
    const f = String(p.fecha ?? '');
    const h = p.hora == null || p.hora === '' ? NaN : Number(p.hora);
    if (!FECHA_ISO.test(f) || !Number.isInteger(h) || h < 0 || h > 23) return null;
    claves.push(`${f} ${String(h).padStart(2, '0')}`);
  }
  if (new Set(claves).size !== puntos.length) return null;
  if (!unDiaVale && new Set(claves.map((c) => c.slice(0, 10))).size < 2) return null;
  return puntos.map((p, i) => ({ p, c: claves[i] }))
    .sort((a, b) => a.c.localeCompare(b.c)).map(({ p }) => p);
}

/** Borde izquierdo del día `dia` en un eje de `nDias` casillas. Admite fracciones. */
export function xDeDia(dia: number, nDias: number, l: Lienzo = LIENZO): number {
  const util = l.ancho - l.margen.i - l.margen.d;
  return l.margen.i + (nDias > 0 ? (dia / nDias) * util : 0);
}

/**
 * x de una hora dentro de su día del calendario. La hora cae en el CENTRO de su
 * veinticuatroava parte: la 00 no se pega a la raya del día anterior ni la 23 a
 * la del siguiente.
 */
export function xDeInstante(dia: number, hora: number, nDias: number, l: Lienzo = LIENZO): number {
  return xDeDia(dia + (hora + 0.5) / 24, nDias, l);
}

/**
 * Los tramos de días SEGUIDOS del calendario que no están en `con`, como pares
 * de índices: `[[2, 11], [29, 30]]`. Es lo que se pinta en blanco rayado y se
 * dice debajo de la gráfica.
 */
export function tramosSinDato(dias: string[], con: Set<string>): [number, number][] {
  const out: [number, number][] = [];
  let ini = -1;
  dias.forEach((f, i) => {
    if (!con.has(f)) { if (ini < 0) ini = i; } else if (ini >= 0) { out.push([ini, i - 1]); ini = -1; }
  });
  if (ini >= 0) out.push([ini, dias.length - 1]);
  return out;
}

/** La letra de los números del eje de días, FIJA: encogerla a la casilla los volvía ilegibles. */
export const LETRA_DEL_DIA = 9;

/**
 * Lo que ocupa un «30» a esa letra, más un respiro. MEDIDO por la revisión en
 * Chrome con la letra de la aplicación: 1,31 veces la letra. La primera versión
 * suponía 9 unidades y, con 61 a 78 días en el eje —justo «histórico completo»—,
 * los números se montaban: se leía «10111213141516».
 */
const ANCHO_DE_UN_DIA = 1.31 * LETRA_DEL_DIA + 2;

/**
 * CÓMO SE ROTULAN LOS DÍAS (`99 §ADR-131`): TODOS, uno a uno, mientras quepan
 * en una fila —así lo pidió él—; si no caben, TODOS igual pero en DOS filas
 * alternas —el par arriba, el impar abajo—, que dobla el sitio de cada número; y
 * solo si ni así, uno de cada `k`, con el 1 de cada mes siempre puesto.
 */
export function rotulosDeDias(dias: string[], l: Lienzo = LIENZO): { dia: number; fila: 0 | 1 }[] {
  const n = dias.length;
  if (!n) return [];
  const casilla = (l.ancho - l.margen.i - l.margen.d) / n;
  if (casilla >= ANCHO_DE_UN_DIA) return dias.map((_, i) => ({ dia: i, fila: 0 as const }));
  if (2 * casilla >= ANCHO_DE_UN_DIA) return dias.map((_, i) => ({ dia: i, fila: (i % 2) as 0 | 1 }));
  const k = Math.ceil(ANCHO_DE_UN_DIA / casilla);
  const out: { dia: number; fila: 0 | 1 }[] = [];
  dias.forEach((f, i) => {
    const primero = f.slice(8) === '01';
    const previo = out.length ? out[out.length - 1].dia : -Infinity;
    if ((i - previo) * casilla >= ANCHO_DE_UN_DIA && (i % k === 0 || primero)) out.push({ dia: i, fila: 0 });
    // El 1 del mes manda: si no cabe junto al anterior, lo SUSTITUYE.
    else if (primero && out.length) out[out.length - 1] = { dia: i, fila: 0 };
  });
  return out;
}

/** Cuántas filas de números lleva el eje: dos cuando se alternan. */
export function filasDeRotulos(dias: string[], l: Lienzo = LIENZO): 1 | 2 {
  return rotulosDeDias(dias, l).some((r) => r.fila === 1) ? 2 : 1;
}

/** Los días que llevan número, en cualquiera de las dos filas. */
export function diasRotulados(dias: string[], l: Lienzo = LIENZO): number[] {
  return rotulosDeDias(dias, l).map((r) => r.dia);
}

export const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * El rótulo del mes, donde empieza cada uno —y en el primer día del eje—, SOLO si
 * cabe en su tramo: un mes que asoma dos días al principio se montaba sobre el
 * siguiente («junjul»). Con poco sitio, sin año; sin sitio, no va.
 */
export function rotulosDeMes(dias: string[], l: Lienzo = LIENZO): { dia: number; texto: string }[] {
  const n = dias.length;
  if (!n) return [];
  const casilla = (l.ancho - l.margen.i - l.margen.d) / n;
  const inicios = dias.map((_, i) => i).filter((i) => i === 0 || dias[i].slice(8) === '01');
  return inicios.map((i, k) => {
    const ancho = ((k + 1 < inicios.length ? inicios[k + 1] : n) - i) * casilla;
    const mes = MESES_CORTOS[Number(dias[i].slice(5, 7)) - 1] ?? '';
    return { dia: i, texto: ancho >= 52 ? `${mes} ${dias[i].slice(0, 4)}` : ancho >= 20 ? mes : '' };
  }).filter((r) => r.texto);
}

const DIAS_DE_LA_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** «2026-01-27» → «martes». */
export function diaDeLaSemana(f: string): string {
  if (!FECHA_ISO.test(f)) return '';
  const [a, m, d] = f.split('-').map(Number);
  return DIAS_DE_LA_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
}

/** «2026-01-27» → «27/01». */
export const fechaCorta = (f: string): string => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

/** «2026-01-27» → «27/01/2026». */
export const fechaLarga = (f: string): string => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;

// ── LAS OTRAS TRES GRÁFICAS, SOBRE EL MISMO CALENDARIO (`99 §ADR-131`) ───────
//
// ⚠️ La auditoría del eje encontró la misma raíz en tres gráficas más: la
// tendencia diaria del histórico, la de un archivo recién cargado y el mapa de
// calor «Por fecha» colocaban por PUESTO y pegaban los días que faltan. Hoy no
// se dibujan con el dato del Ingeniero —su SCADA no trae porcentaje—, pero el
// día que lo traiga mentirían igual que mentía su enero: el 2 pegado al 13.

/**
 * LOS DÍAS DEL EJE DE UNA GRÁFICA: del primero con dato al último, o hasta
 * `hasta` si llega más lejos —el final del periodo consultado, que la pantalla ya
 * recorta a hoy—. Lo que falte dentro, o al final, es una casilla más, en blanco.
 *
 * ⚠️ No empieza antes del primer día con dato: «histórico completo» se pide desde
 * el año 2000, y eso no son veintiséis años de casillas vacías (el mismo criterio
 * que el eje de las gráficas por fase). Si no cabe en `tope`, se quedan los `tope`
 * días MÁS RECIENTES y `recortado` lo dice: la gráfica tiene que avisarlo.
 */
export function calendarioDeFechas(
  fechas: Iterable<unknown>, hasta?: string | null, tope = 400,
): { dias: string[]; recortado: boolean } {
  const validas = [...fechas].map((f) => String(f ?? '')).filter((f) => FECHA_ISO.test(f)).sort();
  if (!validas.length) return { dias: [], recortado: false };
  const ini = validas[0];
  let fin = validas[validas.length - 1];
  if (hasta && FECHA_ISO.test(hasta) && hasta > fin) fin = hasta;
  const [a, m, d] = fin.split('-').map(Number);
  const cabe = Math.max(1, Math.floor(tope));
  const primeroQueCabe = new Date(Date.UTC(a, m - 1, d) - (cabe - 1) * 86400000).toISOString().slice(0, 10);
  const desde = ini < primeroQueCabe ? primeroQueCabe : ini;
  return { dias: diasDelCalendario(desde, fin, cabe), recortado: desde > ini };
}

/**
 * UN PUNTO POR DÍA DEL CALENDARIO: el de esa fecha, o `null` si ese día no hay.
 * Es lo que hace que `tramosDeLinea` y `areasDeBanda` corten SOLAS en el día que
 * falta: antes recibían solo los días con dato y el hueco no existía.
 *
 * Si una fecha sale dos veces se queda la de mayor `peso` —el peor del día, que es
 * lo que se mira—; sin `peso`, la primera. Lo que no cae en `dias` no se coloca.
 */
export function serieEnElCalendario<T extends { fecha?: unknown }>(
  serie: T[], dias: string[], peso: (p: T) => number | null | undefined = () => null,
): (T | null)[] {
  const pos = new Map(dias.map((f, i) => [f, i]));
  const out: (T | null)[] = dias.map(() => null);
  for (const p of serie) {
    const i = pos.get(String(p.fecha ?? ''));
    if (i == null) continue;
    const previo = out[i];
    if (previo == null || (peso(p) ?? -Infinity) > (peso(previo) ?? -Infinity)) out[i] = p;
  }
  return out;
}

/**
 * De dónde a dónde va, en x, el tramo de días `a..b` de una serie DIARIA colocada
 * con `x(i, n)`: media separación a cada lado de sus puntos, sin salirse del área.
 * Es la franja que se raya en blanco donde no hubo medida, y su borde izquierdo es
 * la frontera del día.
 */
export function franjaDeDias(a: number, b: number, n: number, l: Lienzo = LIENZO): [number, number] {
  const util = l.ancho - l.margen.i - l.margen.d;
  const medio = n > 1 ? util / (n - 1) / 2 : util / 2;
  return [Math.max(l.margen.i, x(a, n, l) - medio), Math.min(l.ancho - l.margen.d, x(b, n, l) + medio)];
}

/** Un punto ya colocado de una traza del calendario. */
export interface PuntoColocado { x: number; y: number; fecha: string; hora: number | null; pct: number }

/**
 * LAS TRAZAS DE UNA SERIE HORARIA SOBRE EL CALENDARIO (`99 §ADR-131`): cada
 * lectura en SU instante —su día del eje y su hora dentro de él, `xDeInstante`—,
 * no en su puesto en la lista. Devuelve los tramos SEGUIDOS: se corta donde falta
 * una hora, donde falta un día y donde la lectura no trae porcentaje —un hueco
 * nunca es un cero—. Un tramo de un solo punto se devuelve igual: la pantalla lo
 * pinta como punto, o desaparecería.
 *
 * Se llama UNA VEZ POR LÍNEA: dos líneas en una sola traza se intercalaban y la
 * recta iba de la una a la otra en el mismo instante.
 *
 * Una lectura sin hora es del DÍA entero: va al centro de su casilla y solo sigue
 * el tramo con la del día siguiente, también sin hora. Una hora fuera de 0..23 no
 * se coloca. Dos lecturas en el mismo instante se quedan en la mayor: el pico, no
 * la media. Lo que no cae en `dias` no se coloca.
 */
export function trazosEnElCalendario(
  puntos: { fecha?: unknown; hora?: unknown; pct?: number | null }[],
  dias: string[], techo: number, l: Lienzo = LIENZO,
): PuntoColocado[][] {
  const pos = new Map(dias.map((f, i) => [f, i]));
  const n = dias.length;
  const porInstante = new Map<string, { d: number; h: number | null; abs: number; fecha: string; pct: number | null }>();
  for (const p of puntos) {
    const fecha = String(p.fecha ?? '');
    const d = pos.get(fecha);
    if (d == null) continue;
    const sinHora = p.hora == null || p.hora === '';
    const h = sinHora ? null : Number(p.hora);
    if (h != null && (!Number.isInteger(h) || h < 0 || h > 23)) continue;
    const pct = typeof p.pct === 'number' && Number.isFinite(p.pct) ? p.pct : null;
    const clave = `${d}|${h ?? 'dia'}`;
    const previo = porInstante.get(clave);
    if (!previo || (pct != null && (previo.pct == null || pct > previo.pct))) {
      porInstante.set(clave, { d, h, abs: d * 24 + (h ?? 11.5), fecha, pct });
    }
  }
  const orden = [...porInstante.values()].sort((a, b) => a.abs - b.abs);
  const tramos: PuntoColocado[][] = [];
  let tramo: PuntoColocado[] = [];
  let previo: (typeof orden)[number] | null = null;
  for (const q of orden) {
    const seguido = previo != null && ((previo.h != null && q.h != null && q.abs - previo.abs === 1)
      || (previo.h == null && q.h == null && q.abs - previo.abs === 24));
    if (q.pct == null || !seguido) { if (tramo.length) tramos.push(tramo); tramo = []; }
    if (q.pct != null) {
      tramo.push({
        x: q.h == null ? xDeDia(q.d + 0.5, n, l) : xDeInstante(q.d, q.h, n, l),
        y: y(q.pct, techo, l), fecha: q.fecha, hora: q.h, pct: q.pct,
      });
    }
    previo = q;
  }
  if (tramo.length) tramos.push(tramo);
  return tramos;
}

/**
 * EL MAPA DE CALOR «POR FECHA», UNA COLUMNA POR DÍA DEL CALENDARIO (`99 §ADR-131`).
 * `mapaDeCalor` del motor pone una columna por fecha PRESENTE: un día sin medida
 * no dejaba columna y el 2 quedaba pegado al 13. Aquí cada día es su columna y la
 * del día que falta sale vacía —`null`, que se pinta en blanco: no es un cero—.
 *
 * @returns las filas recolocadas, o `null` si alguna columna del motor no cae en
 *   `dias` (una fecha que no es «AAAA-MM-DD», o un calendario recortado): entonces
 *   se queda la colocación del motor, que al menos no pierde ninguna.
 */
export function celdasPorDia<C>(
  columnas: readonly unknown[], celdas: readonly (readonly (C | null)[])[], dias: string[],
): (C | null)[][] | null {
  const enDias = new Set(dias);
  if (!dias.length || !columnas.every((c) => enDias.has(String(c)))) return null;
  const pos = new Map(columnas.map((c, j) => [String(c), j]));
  return celdas.map((fila) => dias.map((f) => {
    const j = pos.get(f);
    return j == null ? null : (fila[j] ?? null);
  }));
}

/**
 * Los tramos sin dato, dichos para ir debajo de una gráfica: «03/01–12/01 · 30/01».
 * Lo que no se midió se DICE, no solo se raya (`99 §ADR-131`).
 */
export function tramosDichos(dias: string[], tramos: [number, number][]): string {
  return tramos.filter(([a, b]) => dias[a] != null && dias[b] != null)
    .map(([a, b]) => (a === b ? fechaCorta(dias[a]) : `${fechaCorta(dias[a])}–${fechaCorta(dias[b])}`))
    .join(' · ');
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
