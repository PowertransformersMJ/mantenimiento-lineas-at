// ============================================================================
// exportar/levantamiento.js — la ÚNICA derivación de la que beben los exportes
// ----------------------------------------------------------------------------
// Convierte los apoyos guardados en la base en "puntos de exportación" con toda
// la geometría ya resuelta (GMS, vanos, azimuts, progresivas, tramos). GPX, KML
// y CSV formatean ESTO y nada más: así los tres archivos no pueden contradecirse
// entre sí ni contradecir a las pantallas (ADR-005: el archivo sale de los
// datos, jamás de la pantalla).
//
// Es JavaScript puro: sin React, sin DOM, sin red. Las pruebas de Node lo
// importan tal cual.
//
// ⚠️ La corrección de dominio que NO se puede perder (docs/40 §10): un empalme
// NO es un apoyo. El módulo original llamaba "vano anterior" a la distancia
// entre puntos consecutivos del GPS, empalmes incluidos — y eso partía un vano
// real de 247,8 m en dos falsos de 84 y 164 m. Aquí conviven los dos hechos,
// cada uno con su nombre honesto:
//   · `distPuntoAnterior_m` — lo que midió el GPS entre puntos consecutivos
//     (el número del módulo original, conservado por trazabilidad), y
//   · `vanoAnterior_m` — el vano REAL, de estructura a estructura, que es el
//     que usa el cálculo mecánico y el que ven las demás pestañas.
// ============================================================================
import { vincenty, deflexion } from '@lineas/nucleo/geodesia';
import { tramosDeTension, esAncla } from '@lineas/nucleo/mecanica';
import { aGMS } from './gms.js';

/** @typedef {import('@lineas/contratos').Apoyo} Apoyo */

/**
 * @typedef {Object} PuntoExportacion
 * @property {number} n                 posición 1..N entre TODOS los puntos
 * @property {'Estructura'|'Empalme'|'Punto de referencia'} tipo
 * @property {string} nombre            canónico si existe, si no el de campo
 * @property {string} nombreCampo       tal cual quedó grabado en el GPS
 * @property {number} lat
 * @property {number} lon
 * @property {string} latGMS
 * @property {string} lonGMS
 * @property {number|null} cota_m       cota GPS del terreno (referencial)
 * @property {string|null} utc          instante de toma, ISO UTC
 * @property {string|null} local        hora local (America/Bogota) "AAAA-MM-DD HH:MM:SS"
 * @property {number|null} distPuntoAnterior_m  distancia GPS al punto anterior, sea lo que sea
 * @property {number|null} vanoAnterior_m       vano REAL desde la estructura anterior (solo estructuras)
 * @property {string|null} vanoDesde            nombre de esa estructura anterior
 * @property {number|null} azimut_deg           azimut de llegada del vano real
 * @property {number|null} progresiva_m         acumulado de vanos reales hasta aquí (solo estructuras)
 * @property {number|null} indiceEstructura     1..nE si es estructura
 * @property {string|null} enVano               para empalmes: "A → B", el vano real donde viven
 * @property {string|null} funcionEstructural   Terminal / Retención / Suspensión… (solo estructuras)
 * @property {string|null} funcionProcedencia   de dónde salió esa clasificación
 * @property {boolean} esAncla                  true si la función corta el tramo de tensión
 * @property {number|null} deflexion_grados     RECALCULADA sobre las estructuras (no la almacenada)
 * @property {number|null} precision_m          precisión declarada del levantamiento
 * @property {string|null} metodo               gps_mano / gnss_diferencial / …
 * @property {string} sistemaReferencia         WGS84 / MAGNA-SIRGAS
 */

/**
 * @typedef {Object} TramoExportacion
 * @property {number} n            1..nTramos
 * @property {string} desde
 * @property {string} hasta
 * @property {number} longitud_m   suma de los vanos reales del tramo
 * @property {number} nVanos
 * @property {PuntoExportacion[]} puntos  todos los puntos del recorrido dentro del
 *   tramo, empalmes incluidos (la traza dibujada pasa por donde pasó la cuadrilla)
 */

const nombreVisible = (a) => a.nombreNormalizado ?? a.nombreCampo;

/**
 * Instante UTC → hora local de Colombia con el mismo formato que usaba el
 * módulo original: "2026-07-25 09:19:21". El truco del locale sueco es que
 * produce exactamente AAAA-MM-DD HH:MM:SS.
 *
 * @param {string|null|undefined} utcIso
 * @returns {string|null}
 */
export function horaLocalBogota(utcIso) {
  if (!utcIso) return null;
  const f = new Date(utcIso);
  if (Number.isNaN(f.getTime())) return null;
  return f.toLocaleString('sv-SE', { timeZone: 'America/Bogota' });
}

/**
 * Deriva los puntos de exportación y los tramos de tensión desde los apoyos
 * guardados. No inventa: lo que no está en la base sale como null.
 *
 * @param {Apoyo[]} apoyos
 * @returns {{ puntos: PuntoExportacion[], tramos: TramoExportacion[],
 *             nEstructuras: number, nEmpalmes: number, longitud_m: number }}
 */
export function derivarLevantamiento(apoyos) {
  const orden = [...apoyos].sort((a, b) => a.orden - b.orden);
  const esE = (a) => (a.tipoPunto ?? 'Estructura') === 'Estructura';
  const E = orden.filter(esE);

  // Vanos REALES: de estructura a estructura, como en el resto del sistema.
  const vanosE = E.slice(1).map((a, i) =>
    vincenty(E[i].coordenada.lat, E[i].coordenada.lon, a.coordenada.lat, a.coordenada.lon));
  const progresivas = vanosE.reduce((acc, v) => {
    acc.push(acc[acc.length - 1] + v.d);
    return acc;
  }, [0]);

  // Geometría de las estructuras, para recalcular la deflexión REAL (sobre
  // estructuras, nunca sobre la serie con empalmes: partiría los ángulos).
  const geoE = E.map((a) => ({ lat: a.coordenada.lat, lon: a.coordenada.lon }));

  /** @type {PuntoExportacion[]} */
  const puntos = orden.map((a, i) => {
    const c = a.coordenada;
    const iE = esE(a) ? E.findIndex((x) => x.id === a.id) : -1;

    // Distancia GPS al punto anterior, del tipo que sea (el dato del original).
    const prev = i > 0 ? orden[i - 1].coordenada : null;
    const distPrev = prev ? vincenty(prev.lat, prev.lon, c.lat, c.lon).d : null;

    // Para un empalme: dentro de qué vano real vive.
    let enVano = null;
    if (iE < 0) {
      const antes = orden.slice(0, i).reverse().find(esE);
      const despues = orden.slice(i + 1).find(esE);
      enVano = antes && despues ? `${nombreVisible(antes)} → ${nombreVisible(despues)}` : null;
    }

    return {
      n: i + 1,
      tipo: a.tipoPunto ?? 'Estructura',
      nombre: nombreVisible(a),
      nombreCampo: a.nombreCampo,
      lat: c.lat,
      lon: c.lon,
      latGMS: aGMS(c.lat, 'lat'),
      lonGMS: aGMS(c.lon, 'lon'),
      cota_m: c.cotaTerreno_m ?? null,
      utc: c.tomadaEn ?? null,
      local: horaLocalBogota(c.tomadaEn ?? null),
      distPuntoAnterior_m: distPrev,
      vanoAnterior_m: iE > 0 ? vanosE[iE - 1].d : null,
      vanoDesde: iE > 0 ? nombreVisible(E[iE - 1]) : null,
      azimut_deg: iE > 0 ? vanosE[iE - 1].az : null,
      progresiva_m: iE >= 0 ? progresivas[iE] : null,
      indiceEstructura: iE >= 0 ? iE + 1 : null,
      enVano,
      funcionEstructural: iE >= 0 ? (a.funcionEstructural ?? null) : null,
      funcionProcedencia: iE >= 0 ? (a.funcionProcedencia ?? null) : null,
      esAncla: iE >= 0 && a.funcionEstructural != null && esAncla(a),
      deflexion_grados: iE >= 0 ? deflexion(geoE, iE) : null,
      precision_m: c.precision_m ?? null,
      metodo: c.metodo ?? null,
      sistemaReferencia: c.sistemaReferencia ?? 'WGS84',
    };
  });

  // Tramos de tensión (el mismo corte que usan Mecánico y Fichas), con la traza
  // completa del recorrido: entre las dos estructuras de borde entran también
  // los empalmes que el GPS levantó en medio.
  const paraNucleo = E.map((a) => ({ funcionEstructural: a.funcionEstructural, nombre: nombreVisible(a) }));
  const cortes = tramosDeTension(paraNucleo, vanosE.map((v) => v.d));

  let iniE = 0;
  /** @type {TramoExportacion[]} */
  const tramos = cortes.map((t, k) => {
    const finE = iniE + t.vanos.length;
    const posIni = orden.findIndex((a) => a.id === E[iniE].id);
    const posFin = orden.findIndex((a) => a.id === E[finE].id);
    const tramo = {
      n: k + 1,
      desde: t.desde.nombre,
      hasta: t.hasta.nombre,
      longitud_m: t.vanos.reduce((s, v) => s + v, 0),
      nVanos: t.vanos.length,
      puntos: puntos.slice(posIni, posFin + 1),
    };
    iniE = finE;
    return tramo;
  });

  return {
    puntos,
    tramos,
    nEstructuras: E.length,
    nEmpalmes: orden.length - E.length,
    longitud_m: progresivas[progresivas.length - 1] ?? 0,
  };
}
