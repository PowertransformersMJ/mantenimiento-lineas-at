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

// La mediana de los vanos tiene UN dueño: `nucleo/estadisticas.js`. La regla del
// «vano con pinta de torre sin levantar» (abajo) la necesita, y la pide en vez de
// recalcularla aquí: dos medianas con dos criterios de desempate es exactamente
// el fallo que este proyecto persigue.
import { estadisticasVanos } from './estadisticas.js';

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

// ════════════════════════════════════════════════════════════════════════════
// CUÁNTO SE FÍA UNO DE LO QUE TRAJO EL GPS DE MANO
// ----------------------------------------------------------------------------
// Las tres funciones de abajo contestan tres preguntas que se hace cualquiera que
// mire un levantamiento hecho con un GPS de mano y SIN torres registradas:
//
//   1. el quiebre que enseña la pantalla, ¿de cuánto puede estar errado?
//   2. ¿hay algún vano tan corto que ni siquiera se sepa hacia dónde va?
//   3. ¿hay algún vano tan largo que huela a torre que la cuadrilla no levantó?
//
// POR QUÉ VIVEN AQUÍ Y NO EN LA PANTALLA. Son criterios de ingeniería, no pintura:
// deciden si una cifra se publica con reservas o no se publica. Si cada pantalla
// se los recalculara por su cuenta, el mismo levantamiento saldría con un margen
// en la ficha y con otro en el informe —los dos documentados como el correcto—,
// que es la avería que ya costó cara con la deflexión (`99 §ADR-013`). Un solo
// dueño, aquí, y puro: entran números, salen números.
// ════════════════════════════════════════════════════════════════════════════

const GRADOS = 180 / Math.PI;

/** `x` si es un número de verdad; `null` si es NaN, Infinity, texto o falta. */
const finito = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/**
 * ① MARGEN DE LA DIRECCIÓN DE UN VANO — cuánto puede moverse el azimut de un vano
 * si cada uno de sus dos extremos puede estar corrido hasta `precision_m` metros.
 *
 * FÓRMULA DECLARADA:   margen = atan( 2·p / d )   , en grados
 *
 *   `d` = longitud del vano (m) · `p` = precisión del punto (m, el ± del GPS)
 *
 * DE DÓNDE SALE. El azimut se mueve todo lo que puede cuando los dos extremos se
 * corren DE TRAVÉS al vano, `p` cada uno y en sentidos contrarios: el vano gira
 * sobre una base `d` con un corrimiento lateral total de `2p`, y ese giro es
 * atan(2p/d). Se suman los dos porque el error de un punto no compensa el del
 * otro: son independientes, y el peor caso es el que hay que declarar.
 *
 * SU LÍMITE:  **hace falta d > 2·p**. Si el vano no es más largo que los dos
 * círculos de error juntos, los círculos se tocan y la dirección NO SE PUEDE
 * SABER: el punto de llegada podría estar a cualquier lado del de salida, así que
 * cualquier azimut es posible. Eso NO se devuelve como «un margen muy grande»
 * —sería mentir con un número—: se devuelve como desconocido (`determinado:
 * false`, `margen_grados: null`) y quien lo pinte tiene que decirlo con palabras.
 *
 * ⚠️ LO QUE LA FÓRMULA NO CUBRE, DECLARADO PARA QUE NADIE LO DESCUBRA TARDE.
 * atan(2p/d) es el peor caso del corrimiento DE TRAVÉS. El peor caso absoluto
 * —dejando que cada punto se corra en CUALQUIER dirección dentro de su círculo—
 * es la tangente interior a los dos círculos, asin(2p/d), que es algo mayor:
 * con 2p/d = 0,1 la diferencia es 0,03°; con 2p/d = 1/3 ya es 1,0°; y pegada al
 * límite se dispara (en d = 2p esta fórmula daría 45° cuando la verdad es que la
 * dirección es desconocida). Por eso el límite de arriba NO es un adorno: es lo
 * que impide que la fórmula siga contestando donde ya no vale. Se conserva atan
 * porque es la fórmula de la maqueta que el Ingeniero aprobó; cambiarla a asin
 * movería los márgenes que él ya vio (hacia arriba, nunca hacia abajo) y es
 * decisión suya, no del código.
 *
 * @param {number} longitudVano_m  `d`, metros. Tiene que ser > 0.
 * @param {number} precision_m     `p`, metros, el ± declarado del levantamiento.
 * @returns {{determinado: boolean, margen_grados: number|null, motivo: string|null}}
 */
export function margenDeAzimut(longitudVano_m, precision_m) {
  const d = finito(longitudVano_m);
  const p = finito(precision_m);

  // Las cifras salen SIN formatear y los motivos van SIN cifras dentro: el núcleo
  // no sabe de comas decimales ni de es-CO. La frase de pantalla se compone arriba
  // con `longitudVano_m` y `precision_m`, que se devuelven tal cual para eso.
  if (d === null || p === null || d < 0 || p < 0) {
    return {
      determinado: false,
      margen_grados: null,
      longitudVano_m: d,
      precision_m: p,
      motivo: 'Para saber el margen de la dirección hacen falta la longitud del vano y la '
        + 'precisión del levantamiento, las dos en metros y ninguna negativa.',
    };
  }

  if (d <= 2 * p) {
    return {
      determinado: false,
      margen_grados: null,
      longitudVano_m: d,
      precision_m: p,
      motivo: 'La dirección de ese vano no se puede saber: es más corto que los dos círculos de '
        + 'error juntos (dos veces la precisión del levantamiento), así que el punto de llegada '
        + 'podría estar a cualquier lado del de salida. No es que el margen sea grande: es que no '
        + 'hay dirección que declarar.',
    };
  }

  return {
    determinado: true,
    margen_grados: Math.atan((2 * p) / d) * GRADOS,
    longitudVano_m: d,
    precision_m: p,
    motivo: null,
  };
}

/**
 * ② MARGEN DEL QUIEBRE — cuánto puede moverse la deflexión de un punto si cada
 * punto del levantamiento puede estar corrido hasta `precision_m` metros.
 *
 * FÓRMULA DECLARADA:  margen = margenDeAzimut(vano que entra) + margenDeAzimut(vano que sale)
 *
 * El quiebre es la diferencia entre dos azimuts, y cada azimut trae su propio
 * margen: se SUMAN los dos vanos que llegan al punto, porque el peor caso es que
 * los dos se equivoquen en sentidos contrarios. El resultado se lee como un ±
 * alrededor del ángulo: un quiebre de 0,1° con margen 17,2° significa que el
 * ángulo real está entre 0° y 17,3° — o sea, que de ese punto no se sabe si gira.
 *
 * SU LÍMITE: si CUALQUIERA de los dos vanos es demasiado corto para saber su
 * dirección (regla ①), el quiebre **no es fiable y punto**: no se devuelve un
 * margen, se devuelve cuál de los dos vanos lo estropeó, para que la pantalla
 * pueda nombrarlo. Un quiebre de 93° construido sobre un vano cuya dirección se
 * desconoce no es «93° ± mucho»: es un ángulo que no significa nada.
 *
 * Los extremos de la línea no tienen quiebre (igual que `deflexion()`), así que
 * quien recorra la línea no debe llamar aquí con el primer ni el último punto.
 *
 * @param {number} vanoQueEntra_m   vano anterior al punto, metros
 * @param {number} vanoQueSale_m    vano siguiente al punto, metros
 * @param {number} precision_m      `p`, metros
 * @returns {{determinado: boolean, margen_grados: number|null,
 *            vanoIndeterminado: 'entra'|'sale'|'ambos'|null, motivo: string|null}}
 */
export function margenDeDeflexion(vanoQueEntra_m, vanoQueSale_m, precision_m) {
  const entra = margenDeAzimut(vanoQueEntra_m, precision_m);
  const sale = margenDeAzimut(vanoQueSale_m, precision_m);

  if (!entra.determinado || !sale.determinado) {
    const cual = !entra.determinado && !sale.determinado ? 'ambos'
      : !entra.determinado ? 'entra' : 'sale';
    return {
      determinado: false,
      margen_grados: null,
      vanoIndeterminado: cual,
      motivo: (entra.determinado ? sale.motivo : entra.motivo)
        + ' El quiebre de ese punto se apoya en esa dirección, así que tampoco es fiable.',
    };
  }

  return {
    determinado: true,
    margen_grados: entra.margen_grados + sale.margen_grados,
    vanoIndeterminado: null,
    motivo: null,
  };
}

/**
 * ③ UMBRAL DEL «VANO CON PINTA DE TORRE SIN LEVANTAR» — cuántas veces la mediana
 * de los vanos tiene que medir un vano para que valga la pena ir a mirarlo.
 *
 * CRITERIO ADOPTADO (sin norma citada), y por qué **no** es 2,0: un vano que
 * esconde UNA torre no levantada es la suma de los dos vanos reales que la
 * rodean; si los dos fueran medianos daría 2,0 justo, pero los vanos de verdad no
 * son todos iguales y el par escondido puede ser corto. Contrastado contra un
 * levantamiento completo de 27 vanos: los dos vanos que saltan una placa —los dos
 * huecos ciertos— dan **1,49** y **1,87** veces la mediana, y el vano más largo de
 * los que NO saltan ninguna placa se queda en **1,34**. El umbral se pone en
 * **1,40**, dentro de ese hueco: por debajo empezaría a señalar vanos que solo son
 * largos, y en 2,0 se le habría escapado el hueco de 1,49.
 *
 * QUÉ ES Y QUÉ NO ES. Es una señal para ir a mirar, NUNCA un veredicto: no dice
 * que falte una torre, dice que ese vano no se parece a los demás. La prueba dura
 * de que falta una torre es otra y vive en otro sitio (la numeración de placas que
 * salta un número); las dos juntas es lo que hace fuerte el aviso, pero esta
 * función sola no sabe nada de placas y no debe pretenderlo.
 */
export const UMBRAL_TORRE_SIN_LEVANTAR_VECES_LA_MEDIANA = 1.4;

/**
 * Compara cada vano del levantamiento con la MEDIANA de sus vanos y señala los que
 * pasan del umbral declarado arriba.
 *
 * Se usa la mediana, no el promedio: un solo vano largo arrastra el promedio hacia
 * arriba y se tapa a sí mismo. La mediana no se entera de los extremos, que es
 * justo lo que aquí hace falta.
 *
 * Los vanos que no son números positivos no cuentan para la mediana y salen con
 * `longitud_m: null`, pero CONSERVAN SU SITIO en `vanos`: el índice que devuelve
 * esta función es el mismo índice del vano en la lista que entró, para que la
 * pantalla pueda decir «vano nº 8» sin recontar.
 *
 * @param {number[]} vanos_m  longitudes de vano en metros, en el orden de la línea
 * @param {{umbral?: number}} [opciones]  umbral en veces la mediana; por defecto el declarado
 * @returns {{mediana_m: number|null, umbral: number, umbral_m: number|null,
 *            vanos: Array<{indice: number, longitud_m: number|null,
 *                          vecesLaMediana: number|null, sospechoso: boolean}>,
 *            sospechosos: Array<object>}}
 */
export function vanosConPintaDeTorreSinLevantar(vanos_m, opciones = {}) {
  // Un umbral que no sea un número positivo no es un umbral: se usa el declarado.
  const pedido = finito(opciones?.umbral);
  const umbral = pedido !== null && pedido > 0 ? pedido : UMBRAL_TORRE_SIN_LEVANTAR_VECES_LA_MEDIANA;
  const lista = Array.isArray(vanos_m) ? vanos_m : [];
  const estadistica = estadisticasVanos(lista.map((x) => finito(x)));
  const mediana = estadistica?.mediana ?? null;

  const vanos = lista.map((x, indice) => {
    const d = finito(x);
    const usable = d !== null && d > 0 && mediana !== null && mediana > 0;
    const veces = usable ? d / mediana : null;
    return {
      indice,
      longitud_m: d !== null && d > 0 ? d : null,
      vecesLaMediana: veces,
      sospechoso: veces !== null && veces >= umbral,
    };
  });

  return {
    mediana_m: mediana,
    umbral,
    umbral_m: mediana === null ? null : mediana * umbral,
    vanos,
    sospechosos: vanos.filter((v) => v.sospechoso),
  };
}

export { WGS84 };
