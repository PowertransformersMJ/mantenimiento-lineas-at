#!/usr/bin/env node
// ============================================================================
// rayos-libro.mjs — el LIBRO de rayos y lo que se deriva de él. PURO.
// ----------------------------------------------------------------------------
// Sin red, sin satélite y sin `h5wasm`: aquí solo vive lo que se puede probar
// sin bajar un byte. Es la misma partición que `identidad.mjs` frente a
// `sembrar.mjs` — y por la misma razón: si la cuenta que decide qué hora es y
// qué celda toca viviera dentro del bajador, probarla exigiría 180 descargas.
//
// Lo que hay aquí: el PERFIL del atlas (qué es y qué no), el libro (leer,
// escribir) y las dos derivaciones que alimentan al motor (`celdasDelLibro`,
// `diarioDelLibro`). El bajador vive en `rayos-caribe.mjs`.
// ============================================================================
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANCHO, ALTO } from './atlas-caribe.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
/** EL LIBRO DE RAYOS: lo único que se acumula. Los PNG salen de aquí, siempre. */
export const RUTA_LIBRO = join(AQUI, 'rayos-conteo.json');

/** Colombia no cambia la hora: −5 fijo. Por eso basta restar, sin husos ni tablas. */
export const HORAS_UTC_A_COLOMBIA = -5;

/**
 * La clave `AAAAMMDDHH` en el reloj de Colombia de un instante UTC.
 *
 * ⚠️ AQUÍ ESTÁ LA TRAMPA DE ESTE ATLAS. Los archivos del satélite van en UTC y
 * la pantalla rotula «hora de Colombia»: las 23:00 UTC son las **18:00** del
 * mismo día aquí, y las 03:00 UTC son las **22:00 del día ANTERIOR**. Guardar el
 * conteo con la hora UTC y rotularlo como local corre la tormenta cinco horas —
 * y una tormenta corrida cinco horas no cuadra con ninguna falla (`32 · L-70`).
 */
export function claveColombia(instanteUtc) {
  const d = new Date(instanteUtc.getTime() + HORAS_UTC_A_COLOMBIA * 3600000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}`;
}

// ════════════════════════════════════════════════════════════════════════════
// EL PERFIL — lo que este atlas ES, y sobre todo lo que NO es
// ════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ LA RAMPA DEL RAYO arranca en el papel y sube por saltos, no por partes
 * iguales: entre 1 rayo y 2.656 hay tres órdenes de magnitud y una escala
 * repartida por igual dejaría TODO el mapa del color del cero salvo la celda de
 * la tormenta. Los cortes están donde cambia el significado para una cuadrilla:
 * hay actividad · hay tormenta · hay tormenta severa.
 */
const RAMPA_RAYOS = [
  { c: 0, rgb: [245, 241, 232] },      // el papel del sitio: cero rayos no es un color
  { c: 1, rgb: [232, 226, 170] },
  { c: 5, rgb: [240, 205, 110] },
  { c: 20, rgb: [240, 160, 70] },
  { c: 50, rgb: [225, 110, 55] },
  { c: 150, rgb: [200, 55, 55] },
  { c: 500, rgb: [150, 30, 70] },
  { c: 1500, rgb: [95, 25, 95] },
  { c: 3000, rgb: [45, 20, 75] },
];

export const PERFIL_RAYOS = Object.freeze({
  capa: 'rayos-caribe',
  prefijo: 'rayos-caribe',
  titulo: 'Descargas atmosféricas del Caribe colombiano, hora a hora',
  // ⚠️ LA UNIDAD ES «rayos», NO «rayos/h». La pantalla ya añade el «/h» cuando
  // habla del PICO de una hora y lo quita cuando habla del TOTAL del día —igual
  // que con la lluvia (mm/h y mm)—. Declararla como «rayos/h» imprimía
  // «2,0 rayos/h/h», que además de feo es una unidad que no existe.
  unidad: 'rayos',
  /**
   * ⚠️ CONTEO, NO MEDIA — y por eso la codificación no es lineal. Ver el porqué
   * entero en `web/src/vistas/rejilla.ts`: los primeros 50 escalones son el
   * conteo EXACTO (un rayo suelto basta para sacar una línea, y tiene que
   * verse) y por encima cada escalón sube un 2,6 %, hasta **10.000 rayos/h**.
   *
   * ⚠️ EL TECHO SALIÓ DE MEDIR, Y A LA PRIMERA SE QUEDÓ CORTO. Se diseñó con la
   * hora de tormenta que se había medido —2.656 rayos en una celda— y la hora
   * siguiente del mismo día trajo **3.336**. Con el techo puesto en 3.016 el
   * motor se habría negado a publicar, que es lo correcto, pero el aviso llega
   * cuando ya hay tormenta. 10.000 deja margen de tres veces la mayor medida.
   */
  codificacion: { offset: 0, paso: 1, sin_dato: 0, curva: 'exacta-y-log', exactoHasta: 50, razon: 1.0263 },
  rampa: RAMPA_RAYOS,
  // No hay hipótesis de diseño que marcar en esta escala: la que usan las normas
  // es OTRA magnitud (ver el aviso), y marcar aquí un número de otra unidad es
  // exactamente lo que `§ADR-055` prohibió con el viento.
  hipotesisMarcadaEnRampa: undefined,
  etiquetaHipotesis: undefined,
  resumenDiarioEtiqueta: 'Rayos contados en la región',
  resumenDiarioUnidad: 'descargas en las 36 celdas',
  resumenDiarioAviso: 'Es la SUMA de las 36 celdas en el día, no el máximo de una: '
    + 'una tormenta grande sobre una sola celda y una tarde movida en toda la región '
    + 'pueden dar el mismo número.',
  aviso: 'ESTO NO ES LA DENSIDAD DE DESCARGAS A TIERRA (DDT) QUE PIDEN RETIE E IEEE 1243 '
    + 'para calcular salidas por descarga: el GLM es un sensor ÓPTICO que cuenta el destello '
    + 'de TODOS los rayos —nube-nube y nube-tierra— sin distinguirlos, y la DDT solo cuenta '
    + 'los que llegan al suelo, por km² y por año. Este mapa sirve para saber CUÁNDO y DÓNDE '
    + 'hubo tormenta sobre el corredor —correlacionar una falla, decidir una maniobra, '
    + 'programar una cuadrilla—, no para dimensionar apantallamiento ni puestas a tierra. '
    + 'Además, una celda de 1° son unos 12.300 km²: un rayo en la celda NO es un rayo en la línea.',
  fuente: 'GOES-19 GLM (Geostationary Lightning Mapper), producto L2 LCFA de NOAA.',
  atribucion: 'GOES-19 GLM L2 LCFA · NOAA/NESDIS, datos abiertos en AWS Open Data',
  licencia: 'Dominio público (NOAA). Se cita la fuente por cortesía, no por obligación.',
});

// ════════════════════════════════════════════════════════════════════════════
// EL LIBRO
// ════════════════════════════════════════════════════════════════════════════

export function leerLibro() {
  if (!existsSync(RUTA_LIBRO)) return { horas: {} };
  return JSON.parse(readFileSync(RUTA_LIBRO, 'utf-8'));
}

/**
 * ⚠️ SE ESCRIBE ORDENADO Y CON UNA HORA POR LÍNEA. No es estética: este archivo
 * crece en cada pasada y va al repositorio; con las claves desordenadas, cada
 * commit tocaría el archivo entero y el historial dejaría de decir qué cambió.
 */
export function escribirLibro(libro) {
  const claves = Object.keys(libro.horas).sort();
  const cuerpo = claves.map((k) => `  "${k}": ${JSON.stringify(libro.horas[k])}`).join(',\n');
  writeFileSync(RUTA_LIBRO, `{\n "sobre": ${JSON.stringify(libro.sobre ?? SOBRE)},\n "horas": {\n${cuerpo}\n }\n}\n`);
}

export const SOBRE = 'Rayos contados por el GLM del GOES-19 dentro de cada celda de 1° del atlas del '
  + 'Caribe, hora a hora EN EL RELOJ DE COLOMBIA. Clave: AAAAMMDDHH. Solo se guardan las celdas '
  + 'con al menos un rayo. Este libro se ACUMULA: nunca se reconstruye entero.';

// ════════════════════════════════════════════════════════════════════════════
// DEL LIBRO AL ATLAS
// ════════════════════════════════════════════════════════════════════════════

/**
 * El libro, con la forma que pide el motor: `Map("fx,fy" → {clave: valor})`.
 *
 * ⚠️ LAS CELDAS SIN RAYOS DE UNA HORA MEDIDA VALEN **0**, NO «SIN DATO», y esa
 * diferencia es todo el sentido de esta capa: «esa hora se miró y no cayó ni
 * uno» no es lo mismo que «esa hora no se ha bajado». Por eso el libro guarda
 * qué horas se midieron —aunque salieran a cero— y aquí se rellenan las 36.
 */
export function celdasDelLibro(libro) {
  const celdas = new Map();
  for (let fy = 0; fy < ALTO; fy++) {
    for (let fx = 0; fx < ANCHO; fx++) celdas.set(`${fx},${fy}`, {});
  }
  for (const [clave, conteo] of Object.entries(libro.horas)) {
    for (let fy = 0; fy < ALTO; fy++) {
      for (let fx = 0; fx < ANCHO; fx++) {
        celdas.get(`${fx},${fy}`)[clave] = conteo[`${fx},${fy}`] ?? 0;
      }
    }
  }
  return celdas;
}

/** El resumen de cada día: cuántos rayos se contaron en la región entera. */
export function diarioDelLibro(libro) {
  const porDia = new Map();
  for (const [clave, conteo] of Object.entries(libro.horas)) {
    const d = `${clave.slice(0, 4)}-${clave.slice(4, 6)}-${clave.slice(6, 8)}`;
    const suma = Object.values(conteo).reduce((s, v) => s + v, 0);
    porDia.set(d, (porDia.get(d) ?? 0) + suma);
  }
  return [...porDia.entries()].sort().map(([d, v]) => ({ d, v }));
}

