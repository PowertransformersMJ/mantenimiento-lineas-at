// ============================================================================
// nucleo/mecanica.js — cálculo mecánico del conductor
// ----------------------------------------------------------------------------
// Funciones PURAS. Catenaria, parábola, ecuación de cambio de estado, carga de
// viento y tramos de tensión.
//
// Convenio de unidades (el mismo del módulo de campo, no se cambia):
//   H  tiro horizontal        kgf
//   w  masa lineal            kg/m
//   a  vano                   m
//   S  sección                mm²
//   E  módulo elástico        kg/mm²
//   α  dilatación térmica     1/°C
//   t  temperatura            °C
//
// Ver docs/40-DOMINIO-LINEAS-AT.md §3.
// ============================================================================

const G = 9.80665; // m/s² — para pasar de newtons a kgf en la carga de viento

// ── Catenaria (exacta) ──────────────────────────────────────────────────────

/** Parámetro de la catenaria C = H/w, en metros. */
export const parametroCatenaria = (H, w) => H / w;

/** Flecha exacta (catenaria) en el centro del vano, en metros. */
export function flechaCatenaria(w, a, H) {
  const C = H / w;
  return C * (Math.cosh(a / (2 * C)) - 1);
}

/** Longitud exacta (catenaria) del conductor en el vano, en metros. */
export function longitudCatenaria(w, a, H) {
  const C = H / w;
  return 2 * C * Math.sinh(a / (2 * C));
}

// ── Parábola (aproximación de primer orden) ─────────────────────────────────
// A los vanos de esta línea la diferencia con la catenaria es del 0,04 %
// (verificado en el vano de 336,70 m). Se usa por velocidad; la catenaria
// queda para auditar o para vanos largos.

/** Flecha aproximada (parábola), en metros. */
export const flechaParabola = (w, a, H) => (w * a * a) / (8 * H);

/** Longitud aproximada (parábola), en metros. */
export const longitudParabola = (a, flecha) => a + (8 * flecha * flecha) / (3 * a);

// ── Viento ──────────────────────────────────────────────────────────────────

/** Presión dinámica del viento. v en km/h, ρ en kg/m³ → resultado en Pa. */
export function presionDinamica(vKmh, rho = 1.2) {
  const v = vKmh / 3.6;
  return 0.5 * rho * v * v;
}

/**
 * Carga transversal de viento sobre el conductor, en kg/m.
 * @param diametro diámetro del conductor en METROS
 */
export function cargaViento(diametro, vKmh, { cx = 1.0, rho = 1.2 } = {}) {
  return (presionDinamica(vKmh, rho) * cx * diametro) / G;
}

/** Composición vectorial del peso propio con la carga de viento, en kg/m. */
export const cargaResultante = (wPropio, wViento) => Math.hypot(wPropio, wViento);

// ── Vano peso ───────────────────────────────────────────────────────────────

/**
 * Vano peso: distancia horizontal entre los puntos MÁS BAJOS de las catenarias
 * de los dos vanos adyacentes. Define la carga VERTICAL que el apoyo soporta.
 *
 *     vano_peso = (a1 + a2)/2 + (H/w) · (h1/a1 − h2/a2)
 *
 * donde h1 = z_apoyo − z_anterior  y  h2 = z_siguiente − z_apoyo, medidos entre
 * los PUNTOS DE SUJECIÓN del conductor (no el terreno).
 *
 * En terreno plano se reduce al vano viento. En la cima de una loma crece; en
 * una vaguada se reduce y **puede volverse NEGATIVO**, que es la condición de
 * ARRANCAMIENTO: el conductor tira hacia ARRIBA del apoyo y hacen falta herrajes
 * antiarrancamiento. El módulo de campo original pedía este valor a mano y por
 * eso no podía detectar esa condición.
 *
 * @param zAnterior|zApoyo|zSiguiente cotas del punto de sujeción, en metros
 * @returns {{vanoPeso:number, arrancamiento:boolean, vanoViento:number}}
 */
export function vanoPeso({ a1, a2, zAnterior, zApoyo, zSiguiente, H, w }) {
  const vanoViento = ((a1 ?? 0) + (a2 ?? 0)) / 2;
  // En un extremo de línea solo hay un vano: no hay vano peso definido.
  if (!a1 || !a2) return { vanoPeso: null, arrancamiento: false, vanoViento };

  const h1 = zApoyo - zAnterior;
  const h2 = zSiguiente - zApoyo;
  const corr = (H / w) * (h1 / a1 - h2 / a2);
  const vp = vanoViento + corr;
  return { vanoPeso: vp, arrancamiento: vp < 0, vanoViento };
}

/**
 * Relación vano peso / vano viento. Es el indicador que se vigila: por debajo de
 * ~0,7 el apoyo está en una vaguada pronunciada y conviene revisar; por debajo
 * de 0 hay arrancamiento.
 */
export const relacionPesoViento = ({ vanoPeso: vp, vanoViento: vv }) =>
  vv > 0 && vp != null ? vp / vv : null;

// ── Ecuación de cambio de estado ────────────────────────────────────────────

/**
 * Dado un estado conocido (H1, w1, t1), predice el tiro horizontal en otro
 * estado (w2, t2). Forma parabólica:
 *
 *     H2² · (H2 + A) = B
 *     A = −H1 + α·E·S·(t2 − t1) + (w1²·a²·E·S) / (24·H1²)
 *     B = (w2²·a²·E·S) / 24
 *
 * Es una cúbica sin solución cerrada útil → se resuelve por BISECCIÓN, que
 * aquí es preferible a Newton-Raphson: no necesita derivada, no diverge, y el
 * coste es irrelevante (200 iteraciones sobre un polinomio).
 *
 * @param a vano de cálculo — debe ser el VIR DEL TRAMO, no el vano individual
 * @returns tiro horizontal H2 en kgf
 */
export function cambioEstado({ H1, w1, t1, w2, t2, a, S, E, alfa }) {
  const K = E * S;
  const A = -H1 + alfa * K * (t2 - t1) + (w1 * w1 * a * a * K) / (24 * H1 * H1);
  const B = (w2 * w2 * a * a * K) / 24;
  const f = (H) => H * H * (H + A) - B;

  // Acotar la raíz por arriba antes de bisecar.
  let lo = 1;
  let hi = Math.max(H1 * 8, 1000);
  for (let i = 0; f(hi) < 0 && i < 60; i++) hi *= 1.5;

  for (let k = 0; k < 200; k++) {
    const m = (lo + hi) / 2;
    if (f(m) < 0) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

// ── Tramos de tensión ───────────────────────────────────────────────────────

/**
 * Funciones estructurales que ANCLAN el conductor y por tanto cortan el tramo.
 *
 * Es una LISTA CERRADA, no una expresión regular. La regex que vivía aquí
 * («retenci|terminal|ángulo|…») aceptaba cualquier texto que contuviera esas
 * sílabas —incluida una función futura como «Suspensión angular reforzada»—
 * y decidía en silencio dónde se corta un tramo de tensión, que es lo que
 * gobierna TODO el cálculo mecánico.
 *
 * ⚠️ Esta lista debe ser IDÉNTICA a `FUNCIONES_ANCLA` de `contratos/`. El
 * núcleo no importa nada (ni siquiera el contrato) para seguir siendo puro y
 * portable, así que la coincidencia NO se confía a la memoria: la vigila una
 * prueba de oro que compara ambas listas y se pone roja si divergen.
 */
export const FUNCIONES_ANCLA = Object.freeze([
  'Ángulo', 'Retención / anclaje', 'Terminal', 'Derivación',
]);

/** ¿Este apoyo corta el tramo de tensión? */
export const esAncla = (apoyo) => FUNCIONES_ANCLA.includes(apoyo?.funcionEstructural ?? '');

/**
 * Parte la línea en tramos de tensión. Un tramo va de un anclaje al siguiente;
 * dentro de él la tensión mecánica es común, y su vano de cálculo es el VIR.
 *
 * @param apoyos  array en orden, cada uno con {funcionEstructural}
 * @param vanos   vanos[i] = distancia entre apoyos[i] y apoyos[i+1]
 * @returns [{desde, hasta, vanos, vir}]
 */
export function tramosDeTension(apoyos, vanos) {
  const tramos = [];
  let inicio = 0;

  for (let i = 1; i < apoyos.length; i++) {
    const ultimo = i === apoyos.length - 1;
    if (!esAncla(apoyos[i]) && !ultimo) continue;

    const delTramo = vanos.slice(inicio, i);
    if (delTramo.length) {
      const suma3 = delTramo.reduce((s, a) => s + a ** 3, 0);
      const suma1 = delTramo.reduce((s, a) => s + a, 0);
      tramos.push({
        desde: apoyos[inicio],
        hasta: apoyos[i],
        vanos: delTramo,
        vir: Math.sqrt(suma3 / suma1),
      });
    }
    inicio = i;
  }
  return tramos;
}

/**
 * Los cuatro estados que se evalúan SIEMPRE en un tramo. Cada uno vigila algo
 * distinto: EDS la fatiga, tMax la distancia al terreno, viento y tMin el tiro
 * máximo sobre estructuras.
 */
export function estadosDelTramo(tramo, conductor, params) {
  const { w, rts, S, E, alfa, diametro } = conductor;
  const { eds, tEds, tMax, tMin, vViento, tViento, cx, rho } = params;

  const H1 = (eds / 100) * rts;
  const a = tramo.vir;
  const wConViento = cargaResultante(w, cargaViento(diametro, vViento, { cx, rho }));
  const base = { w1: w, t1: tEds, a, S, E, alfa, H1 };

  return {
    eds:    { nombre: 'EDS / cada día',       H: H1, w, t: tEds },
    tMax:   { nombre: 'Máxima temperatura',   H: cambioEstado({ ...base, w2: w, t2: tMax }), w, t: tMax },
    viento: { nombre: 'Máximo viento',        H: cambioEstado({ ...base, w2: wConViento, t2: tViento }), w: wConViento, t: tViento },
    tMin:   { nombre: 'Mínima temperatura',   H: cambioEstado({ ...base, w2: w, t2: tMin }), w, t: tMin },
  };
}

/**
 * Tensión mecánica máxima admisible: 50 % de la carga de rotura.
 * Ningún estado debe superarla.
 */
export const tiroMaximoAdmisible = (rts) => 0.5 * rts;
