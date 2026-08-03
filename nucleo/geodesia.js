// ============================================================================
// nucleo/geodesia.js — geometría de la línea sobre el elipsoide
// ----------------------------------------------------------------------------
// Funciones PURAS: sin DOM, sin red, sin estado global. Entran números, salen
// números. Esto es lo que hace que el núcleo sobreviva a cualquier cambio de
// framework y que se pueda probar con `node --test`.
//
// Procedencia: portado del módulo de campo LN-627 v10, verificado contra los
// 25 vanos que ese archivo ya tenía calculados (desviación máx. 4,5e-6 m).
// Ver docs/40-DOMINIO-LINEAS-AT.md §2.
// ============================================================================

/** Parámetros del elipsoide WGS84 (el que entrega el GPS). */
const WGS84 = { a: 6378137.0, f: 1 / 298.257223563 };

const RAD = Math.PI / 180;

/**
 * Problema inverso de Vincenty: distancia geodésica y azimut inicial entre dos
 * puntos del elipsoide. Se usa en vez del haversine porque el haversine asume
 * esfera y en vanos de cientos de metros introduce error sistemático.
 *
 * @returns {{d: number, az: number}} d en metros, az en grados [0,360)
 */
export function vincenty(lat1, lon1, lat2, lon2) {
  const { a, f } = WGS84;
  const b = (1 - f) * a;

  if (Math.abs(lat1 - lat2) < 1e-12 && Math.abs(lon1 - lon2) < 1e-12) {
    return { d: 0, az: 0 };
  }

  const L = (lon2 - lon1) * RAD;
  const U1 = Math.atan((1 - f) * Math.tan(lat1 * RAD));
  const U2 = Math.atan((1 - f) * Math.tan(lat2 * RAD));
  const sU1 = Math.sin(U1), cU1 = Math.cos(U1);
  const sU2 = Math.sin(U2), cU2 = Math.cos(U2);

  let lambda = L, lambdaPrev, sinSigma, cosSigma, sigma, cos2Alpha = 0, cos2SigmaM = 0;
  let iter = 0;

  do {
    const sl = Math.sin(lambda), cl = Math.cos(lambda);
    sinSigma = Math.sqrt((cU2 * sl) ** 2 + (cU1 * sU2 - sU1 * cU2 * cl) ** 2);
    if (sinSigma === 0) return { d: 0, az: 0 };           // puntos coincidentes
    cosSigma = sU1 * sU2 + cU1 * cU2 * cl;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cU1 * cU2 * sl) / sinSigma;
    cos2Alpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cos2Alpha !== 0 ? cosSigma - (2 * sU1 * sU2) / cos2Alpha : 0;
    const C = (f / 16) * cos2Alpha * (4 + f * (4 - 3 * cos2Alpha));
    lambdaPrev = lambda;
    lambda = L + (1 - C) * f * sinAlpha *
      (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM ** 2)));
  } while (Math.abs(lambda - lambdaPrev) > 1e-12 && ++iter < 200);

  const u2 = (cos2Alpha * (a * a - b * b)) / (b * b);
  const A = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
  const B = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
  const deltaSigma = B * sinSigma * (cos2SigmaM + (B / 4) *
    (cosSigma * (-1 + 2 * cos2SigmaM ** 2) -
     (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma ** 2) * (-3 + 4 * cos2SigmaM ** 2)));

  const az = (Math.atan2(cU2 * Math.sin(lambda), cU1 * sU2 - sU1 * cU2 * Math.cos(lambda)) / RAD + 360) % 360;
  return { d: b * A * (sigma - deltaSigma), az };
}

const RUMBOS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];

/** Convierte un azimut en grados al rumbo de 16 direcciones. */
export function rumbo(azimut) {
  return RUMBOS[Math.round((((azimut % 360) + 360) % 360) / 22.5) % 16];
}

/**
 * Deflexión en un apoyo: cuánto gira la línea al pasar por él, en grados
 * [0,180]. Es lo que decide si un apoyo puede ser de suspensión o está
 * obligado a ser de retención. Los extremos de la línea no tienen deflexión.
 *
 * @returns {number|null} null en el primer y último apoyo
 */
export function deflexion(apoyos, i) {
  if (i <= 0 || i >= apoyos.length - 1) return null;
  const entra = vincenty(apoyos[i - 1].lat, apoyos[i - 1].lon, apoyos[i].lat, apoyos[i].lon).az;
  const sale  = vincenty(apoyos[i].lat, apoyos[i].lon, apoyos[i + 1].lat, apoyos[i + 1].lon).az;
  const d = Math.abs(sale - entra) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Diferencia a partir de la cual se avisa de que el ángulo GUARDADO en el apoyo
 * y el que sale de las coordenadas ya no dicen lo mismo. CRITERIO ADOPTADO (sin
 * norma citada): medio grado. A 118° de quiebre, medio grado mueve el factor
 * 2·sen(α/2) un 0,4 % — por debajo de eso la diferencia es redondeo y avisar
 * sería ruido; por encima, alguien corrigió una coordenada o tecleó otro ángulo,
 * y eso hay que verlo.
 */
export const TOLERANCIA_DEFLEXION_GRADOS = 0.5;

/**
 * LA DEFLEXIÓN TIENE UN SOLO DUEÑO: LA GEOMETRÍA. Esta función es ese dueño, y
 * es el ÚNICO sitio donde la política está escrita.
 *
 * Por qué manda la geodésica sobre el `deflexion_grados` guardado en el apoyo:
 * el campo guardado existe para AUDITAR lo que se calculó aquel día
 * (`contratos/activos.ts`), no para pintar hoy. Si se prefiriera, una coordenada
 * corregida esta mañana seguiría mostrando el ángulo viejo —con veredicto y
 * todo— y nadie tendría forma de notarlo. Es la misma regla que ya aplican
 * `exportar/levantamiento.js`, `web/src/vistas/criteriosApoyo.ts` y la ficha del
 * apoyo; antes `nucleo/cargas.js` y `nucleo/longitudinal.js` hacían lo contrario
 * y el mismo apoyo salía con un ángulo en la ficha y con otro en la tabla de
 * cargas, los dos documentados como el correcto (auditoría de la ola 4, §ADR-013).
 *
 * El valor guardado NO se tira: se usa cuando la geometría no puede resolverse
 * —faltan coordenadas de alguno de los tres apoyos— y entonces se DECLARA, con
 * su nota, que ese ángulo no se enteraría de una corrección de coordenadas.
 * Negarse del todo perdería filas que hoy sí se publican, y una fila que
 * desaparece no explica nada; una fila que se publica declarando de dónde salió
 * su ángulo, sí.
 *
 * @param geo        `[{lat, lon}]` de las ESTRUCTURAS en orden; `null` donde falte.
 * @param i          índice del apoyo dentro de `geo`.
 * @param declarada  el `deflexion_grados` que traiga el apoyo, si trae alguno.
 * @returns {{valor: number|null, procedencia: 'geodesica'|'declarada'|null, nota: string|null}}
 */
export function resolverDeflexion(geo, i, declarada) {
  const G = Array.isArray(geo) ? geo : [];
  const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  const dec = num(declarada);

  const hay = (k) => num(G[k]?.lat) !== null && num(G[k]?.lon) !== null;
  const geodesica = i > 0 && i < G.length - 1 && hay(i - 1) && hay(i) && hay(i + 1)
    ? num(deflexion(G, i))
    : null;

  if (geodesica !== null) {
    const discrepa = dec !== null && Math.abs(dec - geodesica) > TOLERANCIA_DEFLEXION_GRADOS;
    return {
      valor: geodesica,
      procedencia: 'geodesica',
      nota: discrepa
        ? `La deflexión guardada en el apoyo (${dec.toFixed(1)}°) NO coincide con la que sale de `
          + `las coordenadas (${geodesica.toFixed(1)}°). Manda la geodésica, que es la que se `
          + 'recalcula con cada corrección del levantamiento; el valor guardado se conserva para '
          + 'auditar qué se calculó aquel día. Si el bueno fuera el guardado, lo que hay que '
          + 'corregir son las coordenadas, no el ángulo.'
        : null,
    };
  }

  if (dec !== null) {
    return {
      valor: dec,
      procedencia: 'declarada',
      nota: 'La deflexión NO se pudo recalcular sobre las coordenadas (faltan las de alguno de los '
        + 'tres apoyos): se usa la declarada en el apoyo. Ese ángulo no se entera si mañana se '
        + 'corrige una coordenada, así que vale lo que valía el día que se guardó.',
    };
  }

  return { valor: null, procedencia: null, nota: null };
}

/**
 * Recorre la línea y devuelve, por apoyo, el vano anterior, el azimut de
 * llegada y la progresiva acumulada desde el origen. Todo en metros/grados.
 */
export function recorrer(apoyos) {
  let acumulado = 0;
  return apoyos.map((p, i) => {
    if (i === 0) return { ...p, vanoAnterior: null, azimut: null, progresiva: 0 };
    const { d, az } = vincenty(apoyos[i - 1].lat, apoyos[i - 1].lon, p.lat, p.lon);
    acumulado += d;
    return { ...p, vanoAnterior: d, azimut: az, progresiva: acumulado };
  });
}

/**
 * Vano viento: semisuma de los dos vanos adyacentes. Define la carga
 * TRANSVERSAL de viento que el apoyo recibe.
 */
export function vanoViento(vanoAnterior, vanoSiguiente) {
  const a = vanoAnterior ?? 0;
  const b = vanoSiguiente ?? 0;
  return (a + b) / 2;
}

/**
 * Vano ideal de regulación (VIR) de un tramo de tensión: el vano único
 * equivalente con el que se tensa TODO el tramo.  VIR = √(Σaᵢ³ / Σaᵢ)
 */
export function vanoIdealRegulacion(vanos) {
  const v = vanos.filter((x) => x > 0);
  if (!v.length) return null;
  const suma3 = v.reduce((s, a) => s + a ** 3, 0);
  const suma1 = v.reduce((s, a) => s + a, 0);
  return Math.sqrt(suma3 / suma1);
}

export { WGS84 };
