#!/usr/bin/env node
// ============================================================================
// libro-acumulado.mjs — el LIBRO que comparten las capas que se acumulan. PURO.
// ----------------------------------------------------------------------------
// Hay dos clases de atlas en esta casa y no se parecen en nada por dentro:
//
//   · LOS DE NASA POWER se RECONSTRUYEN enteros en cada pasada, porque su fuente
//     entrega un año en 36 llamadas.
//   · LOS DE SATÉLITE se ACUMULAN, porque su año son cientos de miles de
//     archivos y medio terabyte: cada pasada baja lo que falta y lo suma a un
//     libro, y de ese libro salen los PNG.
//
// Este archivo es la mecánica del segundo caso, y vive aparte desde que hubo DOS
// capas así —rayos (`§ADR-079`) y las de ABI (`§ADR-081`)—. Tenerla copiada
// habría sido un segundo sitio donde arreglar cada fallo, y el que se olvida
// siempre es el segundo (`34 · L-65`).
//
// El libro es un JSON: `{ "AAAAMMDDHH": { "fx,fy": valor } }`, con la hora YA en
// el reloj de Colombia y solo las celdas con algo que decir.
// ============================================================================
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/** Colombia no cambia la hora: −5 fijo. Por eso basta restar, sin husos ni tablas. */
export const HORAS_UTC_A_COLOMBIA = -5;

/**
 * La clave `AAAAMMDDHH` en el reloj de Colombia de un instante UTC.
 *
 * ⚠️ AQUÍ ESTÁ LA TRAMPA DE TODA CAPA DE SATÉLITE. Los archivos van en UTC y la
 * pantalla rotula «hora de Colombia»: las 23:00 UTC son las **18:00** del mismo
 * día aquí, y las 03:00 UTC son las **22:00 del día ANTERIOR**. Guardar el dato
 * con la hora UTC y rotularlo como local corre la tormenta cinco horas — y una
 * tormenta corrida cinco horas no cuadra con ninguna falla (`32 · L-70`).
 */
export function claveColombia(instanteUtc) {
  const d = new Date(instanteUtc.getTime() + HORAS_UTC_A_COLOMBIA * 3600000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}`;
}

export function leerLibro(ruta) {
  if (!existsSync(ruta)) return { horas: {} };
  return JSON.parse(readFileSync(ruta, 'utf-8'));
}

/**
 * ⚠️ SE ESCRIBE ORDENADO Y CON UNA HORA POR LÍNEA. No es estética: este archivo
 * crece en cada pasada y va al repositorio; con las claves desordenadas, cada
 * commit tocaría el archivo entero y el historial dejaría de decir qué cambió.
 */
export function escribirLibro(ruta, libro, sobre) {
  const claves = Object.keys(libro.horas).sort();
  const cuerpo = claves.map((k) => `  "${k}": ${JSON.stringify(libro.horas[k])}`).join(',\n');
  writeFileSync(ruta, `{\n "sobre": ${JSON.stringify(sobre)},\n "horas": {\n${cuerpo}\n }\n}\n`);
}

/**
 * El libro, con la forma que pide el motor: `Map("fx,fy" → {clave: valor})`.
 *
 * ⚠️ LAS CELDAS SIN VALOR DE UNA HORA MEDIDA VALEN `relleno` —normalmente 0—, NO
 * «sin dato», y esa diferencia es todo el sentido de una capa que se acumula:
 * «esa hora se miró y no había nada» no es lo mismo que «esa hora no se ha
 * bajado». Por eso el libro guarda qué horas se midieron, aunque salieran a cero.
 *
 * `relleno = null` es para las capas donde una celda sin valor NO es un cero
 * —la radiación, por ejemplo: si el satélite no la midió ahí, no es «cero
 * vatios»—; entonces esa celda queda como hueco.
 */
export function celdasDelLibro(libro, { ancho, alto, relleno = 0 }) {
  const celdas = new Map();
  for (let fy = 0; fy < alto; fy++) {
    for (let fx = 0; fx < ancho; fx++) celdas.set(`${fx},${fy}`, {});
  }
  for (const [clave, valores] of Object.entries(libro.horas)) {
    for (let fy = 0; fy < alto; fy++) {
      for (let fx = 0; fx < ancho; fx++) {
        const v = valores[`${fx},${fy}`];
        if (v === undefined && relleno === null) continue;      // hueco declarado
        celdas.get(`${fx},${fy}`)[clave] = v ?? relleno;
      }
    }
  }
  return celdas;
}

/**
 * El resumen de cada día. `como` decide qué significa «el día»:
 *   · `suma`    — para conteos (rayos): cuántos hubo en la región.
 *   · `maxima`  — para picos (radiación): cuánto llegó a marcar.
 *   · `media`   — para fracciones (nubes): cómo estuvo el día de media.
 */
export function diarioDelLibro(libro, como = 'suma') {
  const porDia = new Map();
  for (const [clave, valores] of Object.entries(libro.horas)) {
    const d = `${clave.slice(0, 4)}-${clave.slice(4, 6)}-${clave.slice(6, 8)}`;
    const vs = Object.values(valores).filter((v) => Number.isFinite(v));
    if (!vs.length) continue;
    if (!porDia.has(d)) porDia.set(d, []);
    porDia.get(d).push(...vs);
  }
  return [...porDia.entries()].sort().map(([d, vs]) => {
    const v = como === 'suma' ? vs.reduce((a, b) => a + b, 0)
      : como === 'maxima' ? Math.max(...vs)
        : vs.reduce((a, b) => a + b, 0) / vs.length;
    return { d, v: +v.toFixed(2) };
  });
}
