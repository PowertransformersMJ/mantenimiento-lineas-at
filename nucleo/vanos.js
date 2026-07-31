// ============================================================================
// nucleo/vanos.js — el detalle vano a vano y el control catenaria vs parábola
// ----------------------------------------------------------------------------
// Funciones PURAS: no importan DOM, ni red, ni contratos. Entran números, salen
// números. Lo único que usan es nucleo/mecanica.js, que también es puro.
//
// POR QUÉ EXISTE ESTE ARCHIVO
//
// 1) La tabla de tramos dice cuánto tira el conductor en cada TRAMO de tensión,
//    y lo calcula con el VIR: un vano ficticio equivalente a todo el tramo. Pero
//    sobre el terreno no cuelga el VIR: cuelga CADA VANO, uno por uno. El que
//    roza un árbol o una carretera es un vano concreto, casi nunca el promedio.
//    Este archivo baja del tramo al vano.
//
// 2) Un revisor externo pregunta SIEMPRE lo mismo: «usted simplificó la
//    catenaria por una parábola — demuéstreme que en ESTA línea eso es
//    admisible». `controlParabola` contesta con los números de esta línea, no
//    con una cita de un libro: da las dos flechas, el error entre ellas y el
//    veredicto contra un criterio DECLARADO. Si un día la línea tiene vanos
//    largos y la simplificación deja de valer, el control lo dice solo.
//
// Convenio de unidades (el mismo de mecanica.js, no se cambia):
//   H tiro horizontal kgf · w masa lineal kg/m · a vano m · C = H/w  m
//
// Ver docs/40-DOMINIO-LINEAS-AT.md §3.1.
// ============================================================================

import { flechaCatenaria, flechaParabola, longitudCatenaria } from './mecanica.js';

// ── Criterios ADOPTADOS en este proyecto (no son cifras de norma) ────────────
//
// Se declaran aquí, con nombre y valor a la vista, para que el revisor pueda
// DISCUTIRLOS en vez de tener que descubrirlos leyendo el código. Ninguno de
// los tres sale de una norma citable todavía; ver docs/40 §8 (deuda declarada).

/**
 * Banda dentro de la cual un vano individual se parece lo bastante al VIR como
 * para que el tiro común del tramo lo represente.
 *
 * Fuera de esta banda el cálculo NO deja de valer, pero deja de ser cómodo: el
 * tramo se tensa con un único tiro horizontal, y esa hipótesis se sostiene
 * mientras las cadenas de suspensión puedan bascular y los vanos sean
 * comparables. Con un vano al doble del VIR, la flecha real de ESE vano se
 * separa de la calculada — y se separa por el lado malo: sale MENOR de la que
 * es, justo en el vano largo, que es el que decide la distancia al terreno.
 * Síntoma en campo: el gálibo medido con cinta no coincide con el del informe,
 * y siempre en el vano más largo del tramo.
 */
const REL_VIR_MIN = 0.7;
const REL_VIR_MAX = 1.3;

/**
 * Error máximo admitido a la aproximación parabólica de la flecha, en %.
 *
 * 0,5 % sobre una flecha de 6 m son 3 cm. Es un orden de magnitud menos que la
 * incertidumbre con la que hoy se conoce la cota del terreno en esta línea
 * (cotas de GPS de mano, precisión declarada en metros — docs/40 §8): discutir
 * 3 cm cuando el terreno se conoce con metros de error sería falsa precisión.
 * Si algún día la altimetría llega por topografía o LiDAR, este número se
 * aprieta; por eso vive aquí y no enterrado en una condición.
 */
const ERROR_MAX_PCT = 0.5;

/**
 * @typedef {Object} FilaVano
 * @property {number}      n                    número del vano DENTRO del tramo (1..N)
 * @property {number}      a_m                  longitud del vano, en metros
 * @property {number|null} relVir               a / VIR del tramo — null si el tramo no trae VIR
 * @property {number|null} flechaEds_m          flecha por catenaria en el estado EDS
 * @property {number|null} flechaTMax_m         flecha por catenaria a temperatura máxima
 * @property {number|null} flechaTMin_m         flecha por catenaria a temperatura mínima
 * @property {number|null} longitudConductor_m  arco de conductor en el vano, estado más desfavorable
 * @property {number|null} parametroC_m         C = H/w del estado más desfavorable
 * @property {boolean|null} fueraDeRango        true/false, o null si no hubo VIR contra qué comparar
 */

/**
 * Detalle vano a vano de un tramo de tensión.
 *
 * @param tramo     el que devuelve `tramosDeTension`: { vanos:number[], vir:number, … }
 * @param conductor { w, … } — solo se usa `w` (kg/m), como respaldo si un estado no trae el suyo
 * @param estados   el objeto que devuelve `estadosDelTramo`: { eds, tMax, viento, tMin }
 * @returns {FilaVano[]} una fila por vano, en el orden de la línea
 */
export function detalleVanos(tramo, conductor, estados) {
  const listaVanos = tramo?.vanos ?? [];
  // Un VIR de 0 o ausente no es "VIR = 0": es que no se pudo calcular. Se
  // declara null y el control de rango no se ejecuta, en vez de dividir entre
  // cero y sacar Infinity, que aguas abajo se pinta como un vano monstruoso.
  const vir = Number.isFinite(tramo?.vir) && tramo.vir > 0 ? tramo.vir : null;
  const wConductor = conductor?.w;
  const peor = estadoMasDesfavorable(estados, wConductor);

  return listaVanos.map((valor, i) => {
    const a_m = valor;
    const a = Number.isFinite(valor) && valor > 0 ? valor : null;
    const relVir = a !== null && vir !== null ? a / vir : null;

    return {
      // OJO: `n` numera DENTRO del tramo. Un tramo no sabe cuántos vanos hubo
      // antes que él, y no debe saberlo (seguiría siendo correcto aunque se
      // recalculara solo). Quien arme la tabla de toda la línea tiene que
      // renumerar o mostrar a qué tramo pertenece cada fila; si no, el informe
      // sale con tres "vano 1" y nadie sabe de cuál se está hablando.
      n: i + 1,
      a_m,
      relVir,
      flechaEds_m: flechaEnEstado(estados?.eds, a, wConductor),
      flechaTMax_m: flechaEnEstado(estados?.tMax, a, wConductor),
      flechaTMin_m: flechaEnEstado(estados?.tMin, a, wConductor),
      longitudConductor_m:
        a !== null && peor ? longitudCatenaria(peor.w, a, peor.H) : null,
      parametroC_m: peor ? peor.C_m : null,
      // Sin relVir no hay medida, y sin medida no hay veredicto: `false` diría
      // "está dentro de rango", que es una afirmación que aquí nadie puede
      // hacer. null = no evaluable. Es falsy, así que quien pinte un aviso con
      // `if (fila.fueraDeRango)` sigue funcionando y simplemente no marca nada.
      fueraDeRango: relVir === null ? null : relVir < REL_VIR_MIN || relVir > REL_VIR_MAX,
    };
  });
}

/**
 * Control catenaria vs parábola para un vano y un parámetro C dados.
 *
 * Es el argumento que se le entrega a un revisor externo: aquí están las dos
 * flechas, aquí está la diferencia, y aquí está el criterio con el que se juzga.
 *
 * EL SIGNO DEL ERROR IMPORTA y por eso se devuelve con signo: la parábola queda
 * SIEMPRE por debajo de la catenaria, o sea SUBESTIMA la flecha. El error va del
 * lado inseguro para la distancia al terreno — cree que el conductor cuelga
 * menos de lo que cuelga. Que sea pequeño es lo que lo hace tolerable; que sea
 * negativo es lo que obliga a vigilarlo.
 *
 * El error se mide contra la CATENARIA, que es el valor exacto: el error de una
 * aproximación se divide entre lo aproximado, no entre la aproximación misma.
 *
 * Criterio: |error| < 0,5 % (ver ERROR_MAX_PCT arriba, con su justificación).
 * En la práctica ese umbral se cruza cerca de a ≈ C/2, muy lejos de los vanos
 * de una línea de este tipo — que es justo lo que hay que demostrar.
 *
 * @param a_m vano, en metros
 * @param C_m parámetro de la catenaria C = H/w, en metros
 * @returns {{flechaCatenaria_m:number|null, flechaParabola_m:number|null,
 *            error_pct:number|null, aceptable:boolean|null}}
 */
export function controlParabola(a_m, C_m) {
  const noEvaluable = {
    flechaCatenaria_m: null, flechaParabola_m: null, error_pct: null, aceptable: null,
  };
  if (!Number.isFinite(a_m) || a_m <= 0) return noEvaluable;
  if (!Number.isFinite(C_m) || C_m <= 0) return noEvaluable;

  // Las funciones de mecanica.js piden (w, a, H) y aquí solo se tiene C. No es
  // un truco: la flecha depende de H y w SOLO a través de su cociente, así que
  // con w = 1 kg/m el tiro H toma numéricamente el valor de C y las fórmulas
  // quedan idénticas. Se hace así, y no reescribiendo cosh() aquí, porque una
  // fórmula copiada en dos archivos es una fórmula que algún día se corrige en
  // uno solo — y el informe empieza a dar dos flechas distintas para el mismo
  // vano según qué tabla lo pinte.
  const flechaCatenaria_m = flechaCatenaria(1, a_m, C_m);
  const flechaParabola_m = flechaParabola(1, a_m, C_m);
  const error_pct = ((flechaParabola_m - flechaCatenaria_m) / flechaCatenaria_m) * 100;

  return {
    flechaCatenaria_m,
    flechaParabola_m,
    error_pct,
    aceptable: Math.abs(error_pct) < ERROR_MAX_PCT,
  };
}

/**
 * Cuánto conductor se descuelga en total y cuánto excede a la línea recta.
 *
 * `factorCatenaria_pct` es lo que el conductor mide DE MÁS respecto a la suma de
 * los vanos: es la curva que hay que pagar y tender, y es también un control de
 * cordura — un conductor colgado no puede medir menos que la recta que une sus
 * apoyos, así que un porcentaje negativo o cero delata un dato malo, no una
 * línea muy tensa.
 *
 * @param {FilaVano[]} filas  las que devuelve `detalleVanos`
 * @returns {{longitudTotal_m:number|null, factorCatenaria_pct:number|null}}
 */
export function resumenConductor(filas) {
  let longitudTotal_m = 0;
  let sumaVanos_m = 0;
  let n = 0;

  for (const f of filas ?? []) {
    // Solo entran las filas donde SE CONOCEN LAS DOS COSAS. Si una fila trae
    // vano pero no longitud (le faltó el estado, p. ej.), sumar su vano al
    // denominador y no su arco al numerador hunde el porcentaje y hasta lo pone
    // negativo: parecería que el conductor mide menos que la línea recta. Se
    // prefiere un porcentaje calculado sobre menos vanos —y verdadero— antes
    // que uno calculado sobre todos y falso.
    if (!Number.isFinite(f?.longitudConductor_m)) continue;
    if (!Number.isFinite(f?.a_m) || f.a_m <= 0) continue;
    longitudTotal_m += f.longitudConductor_m;
    sumaVanos_m += f.a_m;
    n++;
  }

  if (!n) return { longitudTotal_m: null, factorCatenaria_pct: null };
  return {
    longitudTotal_m,
    factorCatenaria_pct: ((longitudTotal_m - sumaVanos_m) / sumaVanos_m) * 100,
  };
}

// ── Ayudas internas (no se exportan: son detalle de este archivo) ────────────

/**
 * Flecha por catenaria de un vano en un estado concreto.
 * Devuelve null —no 0— si falta cualquier ingrediente: un 0 se leería como
 * "conductor tenso y horizontal", que es una afirmación, no una ausencia.
 */
function flechaEnEstado(estado, a, wRespaldo) {
  if (a === null) return null;
  const H = estado?.H;
  // Cada estado trae su propia w (la de viento incluye la carga transversal);
  // si no la trae, se usa la del conductor desnudo.
  const w = Number.isFinite(estado?.w) ? estado.w : wRespaldo;
  if (!Number.isFinite(H) || H <= 0) return null;
  if (!Number.isFinite(w) || w <= 0) return null;
  return flechaCatenaria(w, a, H);
}

/**
 * El estado con el MENOR parámetro C = H/w de todos los que se evalúan.
 *
 * Menor C es el caso más desfavorable en las tres cosas que importan aquí: más
 * flecha, más arco de conductor y mayor separación entre catenaria y parábola
 * (el error crece con a/C). Por eso `parametroC_m` y `longitudConductor_m` se
 * dan en ese estado y no en el de cada día: si la simplificación parabólica
 * aguanta con el peor C, aguanta con todos; y para pedir cable, quedarse corto
 * es el error caro — sobrar es un retazo.
 *
 * Recorre TODOS los estados que traiga el objeto, no una lista fija de cuatro:
 * el día que se añada un quinto estado (hielo, por ejemplo) entra solo al
 * control, sin que haya que acordarse de tocar este archivo.
 */
function estadoMasDesfavorable(estados, wRespaldo) {
  let peor = null;
  for (const e of Object.values(estados ?? {})) {
    const H = e?.H;
    const w = Number.isFinite(e?.w) ? e.w : wRespaldo;
    if (!Number.isFinite(H) || H <= 0) continue;
    if (!Number.isFinite(w) || w <= 0) continue;
    const C_m = H / w;
    if (peor === null || C_m < peor.C_m) peor = { C_m, w, H };
  }
  return peor;
}
