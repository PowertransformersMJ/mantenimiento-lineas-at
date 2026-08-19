// ============================================================================
// vistas/pronostico.ts — el tiempo que VIENE, leído para una línea
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE, Y QUÉ NO ES. Un pronóstico no es una medición ni una
// evidencia: es un modelo diciendo qué cree que va a pasar. En este sistema eso
// tiene una consecuencia dura — **no se guarda nunca**. Lo que se guarda son
// HECHOS FECHADOS (`datos/clima.ts` los llama sondeos y las reglas los hacen
// inmutables); un pronóstico archivado se leería mañana como si alguien hubiera
// medido algo, y no midió nadie. Se pide, se mira y se olvida.
//
// PARA QUÉ SIRVE DE VERDAD EN UNA LÍNEA: para decidir la semana. El viento es
// carga sobre las estructuras y es seguridad de la cuadrilla; la lluvia y la
// tormenta deciden si se sube o no se sube. La temperatura del aire —ésta SÍ es
// la del aire, a diferencia de la capa térmica— es la que gobierna la flecha.
//
// ⚠️ LO QUE ESTE MÓDULO NO HACE, Y NO ES POR FALTA DE TIEMPO:
//
//   · NO dictamina. Ningún número de aquí entra en un cálculo de la línea. Un
//     pronóstico tiene incertidumbre de horas y de kilómetros; una flecha se
//     calcula con una hipótesis declarada y congelada, no con el tiempo que va a
//     hacer el jueves.
//   · NO valida la hipótesis de viento. La hipótesis es un EXTREMO DE DISEÑO
//     (un viento con periodo de retorno); el pronóstico es el tiempo de esta
//     semana. Que el jueves sople menos no dice absolutamente nada sobre si el
//     extremo adoptado es correcto — y creerlo sería el error caro.
//   · NO es un mapa. El modelo trae celdas de kilómetros: sobre 3 km de línea
//     el valor es UNO. Por eso se pinta como un dato del sitio con su flecha de
//     viento, y no como un campo de colores que fingiría un detalle inexistente.
//
// PURO: sin red, sin DOM, sin base. La consulta vive en `datos/pronostico.ts`.
// ============================================================================

/** Lo que la fuente entrega por instante, ya en unidades de la casa. */
export interface InstantePronostico {
  /** ISO, en UTC, tal como lo publica la fuente. */
  cuando: string;
  /** Del AIRE. No confundir con la capa térmica, que es del suelo. */
  temperatura_C: number | null;
  viento_kmh: number | null;
  /** De DÓNDE viene el viento, en grados desde el norte. Convención meteorológica. */
  vientoDesde_deg: number | null;
  humedad_pct: number | null;
  nubes_pct: number | null;
  /** Lluvia acumulada en la hora siguiente, cuando la fuente la publica. */
  lluvia_mm: number | null;
  /** El código de símbolo de la fuente (`rain`, `fair_day`…). Se traduce, no se pinta. */
  simbolo: string | null;
}

export interface DiaPronostico {
  /** `AAAA-MM-DD` en hora de Colombia: el día en que se sale a trabajar. */
  dia: string;
  tempMin_C: number | null;
  tempMax_C: number | null;
  vientoMax_kmh: number | null;
  lluvia_mm: number | null;
  simbolo: string | null;
}

export interface PronosticoEnPantalla {
  /** Cuándo emitió el modelo esta corrida. No es «ahora»: puede tener horas. */
  emitido: string | null;
  instantes: InstantePronostico[];
  proximasHoras: InstantePronostico[];
  dias: DiaPronostico[];
}

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** m/s → km/h. La fuente publica en m/s y un 9,4 leído como km/h es un tercio del viento real. */
export const aKmh = (ms: number | null): number | null => (ms === null ? null : ms * 3.6);

// ════════════════════════════════════════════════════════════════════════════
// 1 · DÓNDE SE PREGUNTA — y por qué no en la línea
// ════════════════════════════════════════════════════════════════════════════

/**
 * El punto que se le pasa al servicio del tiempo, redondeado a una rejilla.
 *
 * MISMA DOCTRINA QUE `nucleo/clima.js · cajaConsulta`, y por la misma razón
 * escrita allí: **el registro de consultas de un tercero no tiene por qué saber
 * dónde está una torre de un cliente**. Se pregunta por una celda, no por un
 * apoyo.
 *
 * Y no cuesta precisión: el modelo global que responde trae celdas de unos 9 km,
 * así que redondear a 0,1° (~11 km) devuelve la MISMA celda. Se pierde el
 * secreto de nada y se gana no publicar por dónde pasa la línea.
 */
export function puntoDeConsulta(lat: number, lon: number, paso = 0.1): { lat: number; lon: number } {
  const redondear = (v: number) => +(Math.round(v / paso) * paso).toFixed(4);
  return { lat: redondear(lat), lon: redondear(lon) };
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · EL EJE DE LA LÍNEA, Y QUÉ PARTE DEL VIENTO LA EMPUJA DE LADO
// ════════════════════════════════════════════════════════════════════════════

/**
 * La dirección MEDIA de la línea, en grados desde el norte y en [0, 180).
 *
 * ⚠️ SE PROMEDIA CON EL ÁNGULO DOBLADO, y no es un adorno matemático: una línea
 * es un EJE, no una flecha. Un vano que va al norte (0°) y otro que va al sur
 * (180°) describen la misma dirección, y promediarlos a pelo da 90° — justo la
 * perpendicular, o sea el peor resultado posible. Doblando el ángulo antes de
 * promediar, esos dos vanos dan 0°, que es la respuesta correcta.
 *
 * @param azimuts los azimuts de los vanos, en grados. Los huecos se ignoran.
 * @returns el eje en [0, 180), o `null` si no llegó ningún azimut
 */
export function ejeDeLaLinea(azimuts: (number | null | undefined)[]): number | null {
  const buenos = azimuts.filter((a): a is number => typeof a === 'number' && Number.isFinite(a));
  if (!buenos.length) return null;
  let x = 0, y = 0;
  for (const a of buenos) {
    const doble = (2 * a * Math.PI) / 180;
    x += Math.cos(doble);
    y += Math.sin(doble);
  }
  if (Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12) return null;   // vanos que se anulan
  const medio = (Math.atan2(y, x) * 180) / Math.PI / 2;
  const eje = ((medio % 180) + 180) % 180;
  // Un eje de 179,999999° ES el eje de 0° —son la misma recta—, pero escrito así
  // se lee como si la línea corriera al sur. Se pega al 0 el ruido del último bit.
  return eje > 180 - 1e-9 || eje < 1e-9 ? 0 : eje;
}

export interface VientoSobreLaLinea {
  /** La parte del viento que empuja la línea DE LADO. Es la que carga los apoyos. */
  transversal_kmh: number;
  /** La parte que sopla a lo LARGO de la línea. No la carga de lado. */
  longitudinal_kmh: number;
  /** Ángulo entre el viento y el eje de la línea, en [0, 90]. 90° = todo de lado. */
  angulo_deg: number;
}

/**
 * Cuánto del viento previsto empuja la línea de lado.
 *
 * Lo que carga una estructura no es el viento: es su COMPONENTE PERPENDICULAR al
 * conductor. Un viento de 40 km/h soplando en la dirección de la línea no le
 * pone casi nada encima; el mismo viento a 90° se lo pone entero. Publicar solo
 * la velocidad obliga a hacer esa cuenta de cabeza, y a mediodía en el campo esa
 * cuenta no se hace.
 *
 * ⚠️ Da igual si el ángulo se toma «de donde viene» o «hacia donde va»: el
 * componente perpendicular usa |sen(Δ)| y el seno de un ángulo y el de su
 * opuesto valen lo mismo en valor absoluto. Lo que NO da igual es dibujar la
 * flecha, y de eso se ocupa la pantalla.
 */
export function vientoSobreLaLinea(
  viento_kmh: number | null,
  vientoDesde_deg: number | null,
  ejeAzimut_deg: number | null,
): VientoSobreLaLinea | null {
  if (viento_kmh === null || vientoDesde_deg === null || ejeAzimut_deg === null) return null;
  const delta = (((vientoDesde_deg - ejeAzimut_deg) % 180) + 180) % 180;
  const rad = (delta * Math.PI) / 180;
  const transversal = Math.abs(viento_kmh * Math.sin(rad));
  const longitudinal = Math.abs(viento_kmh * Math.cos(rad));
  return {
    transversal_kmh: transversal,
    longitudinal_kmh: longitudinal,
    angulo_deg: delta > 90 ? 180 - delta : delta,
  };
}

/**
 * El pronóstico frente a la hipótesis de cálculo, dicho sin que se pueda leer al
 * revés.
 *
 * ES LA FRASE MÁS PELIGROSA DE ESTA CAPA. Poner los dos números juntos invita a
 * concluir «sopla mucho menos de lo que calculamos, vamos sobrados», y eso es
 * falso: la hipótesis es un EXTREMO DE DISEÑO —un viento con periodo de
 * retorno— y el pronóstico es el tiempo de nueve días. Que esta semana sople
 * poco no dice nada sobre si el extremo adoptado es el correcto. La comparación
 * sirve para lo contrario: para ver si el tiempo que VIENE se acerca a lo que se
 * supuso, que es cuando hay que mirar la línea.
 */
export function contraLaHipotesis(
  transversal_kmh: number | null,
  hipotesisViento_kmh: number | null | undefined,
): { pct: number; frase: string } | null {
  const h = typeof hipotesisViento_kmh === 'number' && hipotesisViento_kmh > 0 ? hipotesisViento_kmh : null;
  if (transversal_kmh === null || h === null) return null;
  const pct = (transversal_kmh / h) * 100;
  return {
    pct,
    frase: `El viento de lado previsto es el ${pct.toFixed(0)} % del que se usó para calcular `
      + `(${h.toFixed(0)} km/h). No lo valida ni lo desmiente: la hipótesis es un extremo de `
      + 'diseño, no el tiempo de esta semana.',
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · LEER LO QUE LA FUENTE ENTREGA
// ════════════════════════════════════════════════════════════════════════════

/** Zona horaria del activo. Sin ella, «el jueves» sería el jueves de Oslo. */
export const ZONA = 'America/Bogota';

const diaLocal = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // `en-CA` da `AAAA-MM-DD`, que ordena solo y no depende del idioma del equipo.
  return d.toLocaleDateString('en-CA', { timeZone: ZONA });
};

/**
 * Del JSON de la fuente a lo que la pantalla pinta.
 *
 * NO RELLENA NADA. Un campo que no venga se queda en `null` y se dibuja como
 * hueco: un cero en la lluvia es una promesa de que no va a llover, y este
 * módulo no promete nada que la fuente no haya dicho.
 */
export function leerPronostico(bruto: unknown): PronosticoEnPantalla {
  const raiz = (bruto ?? {}) as {
    properties?: {
      meta?: { updated_at?: string };
      timeseries?: {
        time?: string;
        data?: {
          instant?: { details?: Record<string, unknown> };
          next_1_hours?: { summary?: { symbol_code?: string }; details?: Record<string, unknown> };
          next_6_hours?: { summary?: { symbol_code?: string }; details?: Record<string, unknown> };
        };
      }[];
    };
  };
  const serie = raiz.properties?.timeseries ?? [];

  const instantes: InstantePronostico[] = serie
    .filter((p) => typeof p?.time === 'string')
    .map((p) => {
      const d = p.data?.instant?.details ?? {};
      const siguiente = p.data?.next_1_hours ?? p.data?.next_6_hours;
      return {
        cuando: p.time as string,
        temperatura_C: num(d.air_temperature),
        viento_kmh: aKmh(num(d.wind_speed)),
        vientoDesde_deg: num(d.wind_from_direction),
        humedad_pct: num(d.relative_humidity),
        nubes_pct: num(d.cloud_area_fraction),
        lluvia_mm: num(siguiente?.details?.precipitation_amount),
        simbolo: typeof siguiente?.summary?.symbol_code === 'string' ? siguiente.summary.symbol_code : null,
      };
    });

  // Los días, para decidir la semana. El máximo de viento manda sobre el
  // promedio: lo que impide subir a una estructura es la racha del día, no la
  // media de veinticuatro horas.
  const porDia = new Map<string, InstantePronostico[]>();
  for (const i of instantes) {
    const d = diaLocal(i.cuando);
    if (!d) continue;
    (porDia.get(d) ?? porDia.set(d, []).get(d)!).push(i);
  }
  const maximo = (xs: (number | null)[]): number | null => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? Math.max(...v) : null;
  };
  const minimo = (xs: (number | null)[]): number | null => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? Math.min(...v) : null;
  };
  const suma = (xs: (number | null)[]): number | null => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
  };

  const dias: DiaPronostico[] = [...porDia.entries()].map(([dia, xs]) => ({
    dia,
    tempMin_C: minimo(xs.map((x) => x.temperatura_C)),
    tempMax_C: maximo(xs.map((x) => x.temperatura_C)),
    vientoMax_kmh: maximo(xs.map((x) => x.viento_kmh)),
    lluvia_mm: suma(xs.map((x) => x.lluvia_mm)),
    // El símbolo del mediodía representa el día mejor que el de las tres de la
    // madrugada, que sería «despejado» en cualquier tormenta de tarde.
    simbolo: (xs.find((x) => new Date(x.cuando).getUTCHours() === 17) ?? xs[0])?.simbolo ?? null,
  })).sort((a, b) => a.dia.localeCompare(b.dia));

  return {
    emitido: raiz.properties?.meta?.updated_at ?? null,
    instantes,
    proximasHoras: instantes.slice(0, 12),
    dias,
  };
}

/**
 * El código de símbolo de la fuente, en castellano.
 *
 * Se traduce por FAMILIA y no símbolo a símbolo: la fuente publica más de cien
 * variantes (día/noche/polar × intensidad) y una tabla de cien filas envejece
 * mal. Lo que no encaje sale con su código crudo, que es feo pero honesto.
 */
export function eltiempoEnCastellano(simbolo: string | null): string {
  const s = String(simbolo ?? '').toLowerCase();
  if (!s) return 'sin dato';
  if (s.includes('thunder')) return 'tormenta eléctrica';
  if (s.includes('sleet')) return 'aguanieve';
  if (s.includes('snow')) return 'nieve';
  if (s.includes('heavyrain')) return 'lluvia fuerte';
  if (s.includes('lightrain')) return 'llovizna';
  if (s.includes('rain')) return 'lluvia';
  if (s.includes('fog')) return 'niebla';
  if (s.includes('cloudy')) return 'nublado';
  if (s.includes('partlycloudy')) return 'parcialmente nublado';
  if (s.includes('fair')) return 'poco nuboso';
  if (s.includes('clearsky')) return 'despejado';
  return s;
}

/**
 * Los avisos que cambian una jornada, derivados del propio pronóstico.
 *
 * ⚠️ LOS TOPES SON CRITERIO ADOPTADO Y SE DICE. No hay norma citada detrás: son
 * los umbrales con los que este proyecto pinta un aviso, y el Ingeniero decide
 * si le sirven. Un umbral sin fuente presentado como norma es una opinión con
 * uniforme.
 */
export const TOPES_AVISO = Object.freeze({
  vientoTrabajo_kmh: 40,   // por encima, trabajar en altura deja de ser razonable
  lluviaDia_mm: 20,        // por encima, el acceso a los apoyos suele ser el problema
});

export function avisosDelPronostico(p: PronosticoEnPantalla, eje: number | null): string[] {
  const avisos: string[] = [];

  const conViento = p.dias.filter((d) => (d.vientoMax_kmh ?? 0) > TOPES_AVISO.vientoTrabajo_kmh);
  if (conViento.length) {
    avisos.push(`Viento por encima de ${TOPES_AVISO.vientoTrabajo_kmh} km/h en `
      + `${conViento.length} de los ${p.dias.length} días previstos `
      + `(${conViento.map((d) => d.dia.slice(5)).join(', ')}). Criterio adoptado, sin norma citada.`);
  }

  const tormenta = p.dias.filter((d) => String(d.simbolo ?? '').includes('thunder'));
  if (tormenta.length) {
    avisos.push(`Tormenta eléctrica prevista el ${tormenta.map((d) => d.dia.slice(5)).join(', ')}. `
      + 'Ni cuadrilla en altura ni maniobra programada.');
  }

  const lluvia = p.dias.filter((d) => (d.lluvia_mm ?? 0) > TOPES_AVISO.lluviaDia_mm);
  if (lluvia.length) {
    avisos.push(`Más de ${TOPES_AVISO.lluviaDia_mm} mm de lluvia el `
      + `${lluvia.map((d) => d.dia.slice(5)).join(', ')}: el problema suele ser llegar, no trabajar.`);
  }

  if (eje === null) {
    avisos.push('No se pudo resolver la dirección de la línea, así que el viento se publica '
      + 'entero: cuánto empuja de lado no se puede decir sin saber hacia dónde va la línea.');
  }
  return avisos;
}
