// ============================================================================
// nucleo/clima.js — el clima de un evento, y sobre todo lo que NO dice
// ----------------------------------------------------------------------------
// QUÉ ES: la aritmética de un sondeo meteorológico alrededor de una falla —
// dónde está la estación más cercana, qué ventana de tiempo pedir, y qué se
// puede afirmar con lo que llega.
//
// POR QUÉ EL ARCHIVO EXISTE, Y NO ES UN DETALLE: el clima es la correlación más
// tentadora de este dominio. Que hubiera viento fuerte la noche de la falla NO
// prueba que el viento la causara — en el Caribe hay viento fuerte muchas
// noches y las líneas no se caen. Este módulo produce el CONTEXTO y redacta sus
// propios límites, para que la pantalla no tenga que acordarse de hacerlo.
//
// LOS TRES LÍMITES, VERIFICADOS CON FUENTE EL 2026-08-04:
//
//   1. DESFASE. El último dato publicado por IDEAM iba once días por detrás.
//      Un evento reciente NO tiene clima todavía. No se estima: se dice.
//   2. SIN RAYOS. IDEAM no publica descargas atmosféricas en abierto. Existe un
//      conjunto de rayos por circuito en datos.gov.co (`kscf-fk2u`) pero es de
//      OTRO operador: cubre el eje cafetero, tiene cero registros en el Caribe y
//      termina en 2024. En una línea tropical el rayo es la causa nº1, así que
//      este hueco se declara SIEMPRE — no poder descartarlo es un resultado del
//      análisis, no un fallo que disimular.
//   3. ES UNA ESTACIÓN, NO EL VANO. Una tormenta local puede no aparecer. La
//      distancia a la estación va pegada al valor, nunca al pie.
//
// Módulo PURO: sin DOM, sin red. Quien consulta es la capa de datos.
// ============================================================================
import { vincenty } from './geodesia.js';

/** Los conjuntos de datos.gov.co, verificados uno a uno el 2026-08-04. */
export const CONJUNTOS = Object.freeze({
  temperatura:      { id: 'sbwg-7ju4', unidad: '°C',   rotulo: 'Temperatura del aire' },
  precipitacion:    { id: 's54a-sgyg', unidad: 'mm',   rotulo: 'Precipitación' },
  viento_velocidad: { id: 'sgfv-3yp8', unidad: 'm/s',  rotulo: 'Velocidad del viento' },
  viento_direccion: { id: 'kiw7-v9ta', unidad: '°',    rotulo: 'Dirección del viento' },
  presion:          { id: '62tk-nxj5', unidad: 'hPa',  rotulo: 'Presión atmosférica' },
});

/**
 * La caja de búsqueda de estaciones, ALINEADA A UNA REJILLA de 0,5°.
 *
 * No se manda la coordenada del apoyo: se manda la celda que la contiene. El
 * repositorio es público y la infraestructura es de un cliente; pedirle a un
 * tercero «dame lo más cercano a estas coordenadas exactas» es publicar la
 * posición del activo en el registro de consultas de ese tercero. La celda basta
 * para encontrar estaciones y no dice dónde está la torre.
 */
export function cajaConsulta(lat, lon, paso = 0.5) {
  const piso = (v) => Math.floor(v / paso) * paso;
  return {
    latMin: +(piso(lat) - paso).toFixed(4),
    latMax: +(piso(lat) + 2 * paso).toFixed(4),
    lonMin: +(piso(lon) - paso).toFixed(4),
    lonMax: +(piso(lon) + 2 * paso).toFixed(4),
  };
}

/**
 * La estación más cercana de las que hayan venido, con su distancia REAL.
 *
 * La distancia no es un adorno: una estación a 40 km no dice lo mismo que una a
 * 3, y el que lee el informe tiene que verlo junto al número, no en una nota.
 */
export function elegirEstacion(estaciones, lat, lon) {
  let mejor = null;
  for (const e of estaciones) {
    const la = Number(e.latitud), lo = Number(e.longitud);
    if (!isFinite(la) || !isFinite(lo)) continue;
    const d = vincenty(lat, lon, la, lo).d / 1000;
    if (!mejor || d < mejor.distancia_km) {
      mejor = {
        codigo: String(e.codigoestacion), nombre: String(e.nombreestacion ?? '').trim(),
        municipio: e.municipio, departamento: e.departamento,
        lat: la, lon: lo, distancia_km: +d.toFixed(1),
      };
    }
  }
  return mejor;
}

/**
 * La ventana alrededor del evento, con criterio de ingeniería y no de comodidad.
 *
 * No es lo mismo el viento en el instante del disparo que la lluvia acumulada de
 * los días previos: una tormenta de la víspera puede haber saturado un terreno
 * que cede al día siguiente. Por eso la ventana es asimétrica — mira más hacia
 * atrás que hacia delante.
 */
export function ventana(ocurrioEn, horasAntes = 72, horasDespues = 6) {
  const t = new Date(ocurrioEn).getTime();
  return {
    desde: new Date(t - horasAntes * 3600e3).toISOString(),
    hasta: new Date(t + horasDespues * 3600e3).toISOString(),
  };
}

/**
 * ¿Hay dato para este evento, o el evento es más nuevo que lo publicado?
 *
 * El desfase se MIDE en cada sondeo preguntándole a IDEAM su último registro;
 * no se codifica un número que envejece.
 */
export function cobertura(ocurrioEn, ultimoDatoDisponible) {
  if (!ultimoDatoDisponible) return { fueraDeVentana: true, diasDeDesfase: null };
  const evento = new Date(ocurrioEn).getTime();
  const ultimo = new Date(ultimoDatoDisponible).getTime();
  return {
    fueraDeVentana: evento > ultimo,
    diasDeDesfase: Math.max(0, Math.round((Date.now() - ultimo) / 86400e3)),
  };
}

/**
 * El texto que se pinta junto al clima. Lo redacta el núcleo y no la pantalla,
 * porque es parte del resultado: un dato meteorológico sin sus límites al lado
 * invita exactamente a la conclusión que este sistema quiere impedir.
 */
export function redactarNota({ estacion, cobertura: c, ocurrioEn, ultimoDatoDisponible }) {
  const partes = [];

  if (c.fueraDeVentana) {
    partes.push(
      `El evento (${String(ocurrioEn).slice(0, 10)}) es POSTERIOR al último dato que IDEAM tiene `
      + `publicado (${ultimoDatoDisponible ? String(ultimoDatoDisponible).slice(0, 10) : 'desconocido'}). `
      + 'Todavía no hay clima que traer: no es un fallo de la consulta, es el desfase de la fuente'
      + (c.diasDeDesfase !== null ? `, hoy de unos ${c.diasDeDesfase} días.` : '.'),
    );
  }

  if (estacion) {
    partes.push(
      `Estación ${estacion.nombre} a ${estacion.distancia_km} km del punto. Son observaciones DE `
      + 'ESA ESTACIÓN, no del vano: una tormenta local puede no aparecer aquí.',
    );
  } else {
    partes.push('No se encontró ninguna estación con datos en el entorno del evento.');
  }

  // Se declara SIEMPRE, haya o no clima. Que no se pueda descartar un rayo es
  // un resultado del análisis, y una fila vacía se leería como «descartado».
  partes.push(
    'DESCARGAS ATMOSFÉRICAS: no hay dato. IDEAM no las publica en abierto, y el único conjunto de '
    + 'rayos disponible en datos.gov.co es de otro operador —cubre el eje cafetero, no tiene ni un '
    + 'registro en el Caribe y termina en 2024—. Este sistema NO puede afirmar ni descartar que un '
    + 'rayo interviniera.',
  );

  partes.push(
    'La hora de IDEAM viene sin zona horaria; se interpreta como hora de Colombia (UTC-5). Esa '
    + 'interpretación es NUESTRA, no del dato.',
  );

  return partes.join(' ');
}

/**
 * Resumen de una serie para la pantalla. Sin medias caprichosas: el máximo y el
 * acumulado son las dos cifras que un ingeniero usa para una falla.
 */
export function resumirSerie(variable, valores) {
  if (!valores.length) return { variable, n: 0, max: null, acumulado: null, enElEvento: null };
  const vs = valores.map((v) => v.v).filter((v) => isFinite(v));
  return {
    variable,
    n: vs.length,
    max: vs.length ? +Math.max(...vs).toFixed(2) : null,
    // El acumulado solo tiene sentido en lluvia; en las demás no se calcula
    // para no ofrecer un número que nadie debería usar.
    acumulado: variable === 'precipitacion' ? +vs.reduce((a, b) => a + b, 0).toFixed(1) : null,
  };
}
