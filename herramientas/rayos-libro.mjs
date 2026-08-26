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
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANCHO, ALTO } from './atlas-caribe.mjs';
import {
  celdasDelLibro as celdasGenerico, diarioDelLibro as diarioGenerico,
  escribirLibro as escribirGenerico, leerLibro as leerGenerico,
} from './libro-acumulado.mjs';

// ⚠️ LA MECÁNICA DEL LIBRO VIVE EN `libro-acumulado.mjs` desde que hay DOS capas
// que se acumulan (`§ADR-081`). Aquí queda lo que es DE LOS RAYOS: su perfil, su
// ruta y qué significa «el día» para un conteo.
export { claveColombia, HORAS_UTC_A_COLOMBIA } from './libro-acumulado.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
/** EL LIBRO DE RAYOS: lo único que se acumula. Los PNG salen de aquí, siempre. */
export const RUTA_LIBRO = join(AQUI, 'rayos-conteo.json');

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
  naturaleza: 'medida',
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

export const leerLibro = () => leerGenerico(RUTA_LIBRO);
export const escribirLibro = (libro) => escribirGenerico(RUTA_LIBRO, libro, SOBRE);

export const SOBRE = 'Rayos contados por el GLM del GOES-19 dentro de cada celda de 1° del atlas del '
  + 'Caribe, hora a hora EN EL RELOJ DE COLOMBIA. Clave: AAAAMMDDHH. Solo se guardan las celdas '
  + 'con al menos un rayo. Este libro se ACUMULA: nunca se reconstruye entero.';

// ════════════════════════════════════════════════════════════════════════════
// DEL LIBRO AL ATLAS
// ════════════════════════════════════════════════════════════════════════════

/**
 * El libro con la forma que pide el motor, y el resumen de cada día.
 *
 * La mecánica es la común (`libro-acumulado.mjs`); lo que es DE LOS RAYOS es
 * qué significa cada hueco y qué significa «el día»:
 *   · una celda sin rayos en una hora medida vale **0**, no «sin dato»: que no
 *     cayera ninguno es un dato, y de los importantes;
 *   · el día es la **SUMA** de la región, porque son un conteo.
 */
export const celdasDelLibro = (libro) => celdasGenerico(libro, { ancho: ANCHO, alto: ALTO, relleno: 0 });
export const diarioDelLibro = (libro) => diarioGenerico(libro, 'suma');
