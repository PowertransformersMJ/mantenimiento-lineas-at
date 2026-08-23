// ============================================================================
// vistas/lineaDeTiempo.ts — un solo eje de tiempo para el clima de una línea
// ----------------------------------------------------------------------------
// QUÉ RESUELVE. Hasta ahora el clima de la línea vivía en DOS casillas que había
// que encender por separado: el pronóstico (adelante, unos días) y el atlas del
// año (atrás, desde enero). El Ingeniero tenía que saber de antemano cuál
// encender según hacia dónde quisiera mirar — y esa es una pregunta de
// fontanería, no de mantenimiento. Aquí se elige UNA FECHA y el sistema decide
// de dónde sale.
//
// ⚠️ LO QUE ESTE MÓDULO NO PUEDE HACER JAMÁS, Y ES LA RAZÓN DE QUE EXISTA:
// **borrar la diferencia entre lo que se MIDIÓ y lo que un modelo CREE**. Juntar
// las dos cosas bajo un mismo selector es cómodo y es exactamente por eso
// peligroso: un número medido y uno pronosticado se parecen en pantalla y valen
// cosas distintas. Por eso aquí no hay una función que devuelva «el valor del
// día»: hay una que devuelve **de qué régimen es ese día**, y la pantalla está
// obligada a decirlo. Un número sin su procedencia es una opinión con uniforme
// (`CLAUDE.md §4`).
//
// Y no cambia ninguna de las dos doctrinas de origen: el pronóstico se sigue sin
// guardar (`vistas/pronostico.ts`) y el atlas se sigue leyendo como medida con
// su celda de 111 km (`vistas/atlasCaribe.ts`). Esto es un MANDO común, no un
// almacén común.
//
// PURO: sin red, sin DOM, sin base.
// ============================================================================

/** De dónde sale lo que se enseña para una fecha. */
export type Regimen =
  /** Atlas, con reparto por horas: se puede mover la hora y sale un número. */
  | 'medido_horas'
  /** Atlas, pero de ese día solo hay el resumen: no hay reparto por horas. */
  | 'medido_solo_total'
  /** Ya pasó, y la fuente del histórico todavía no lo ha publicado. */
  | 'sin_publicar'
  /** Está por venir y cae dentro del horizonte del pronóstico. */
  | 'pronostico'
  /** Fuera de todo: antes del inicio del atlas o más allá del pronóstico. */
  | 'fuera';

export interface TramoDeTiempo {
  regimen: Regimen;
  /** Una palabra para la cinta de la pantalla. Nunca vacía. */
  procedencia: 'medido' | 'pronóstico' | 'sin dato';
  /** Por qué ese día sale de ahí, en castellano y sin jerga. */
  porque: string;
}

export interface AlcanceDelAtlas {
  /** Primer día que cubre el archivo, `AAAA-MM-DD`. */
  primerDia: string;
  /** Hasta aquí hay reparto por horas. */
  ultimoDiaConHoras: string;
  /** Hasta aquí hay al menos el resumen del día. `null` si no hay resumen. */
  ultimoDiaConTotal: string | null;
}

/**
 * El día de hoy en el reloj del activo, `AAAA-MM-DD`.
 *
 * Se pasa el instante desde fuera —nunca se lee el reloj aquí dentro— para que
 * esto siga siendo puro y para que una prueba pueda situarse en cualquier día
 * sin tocar el reloj de la máquina.
 */
export const diaDe = (instante: Date, zona = 'America/Bogota'): string =>
  instante.toLocaleDateString('en-CA', { timeZone: zona });

/** Suma días a una fecha `AAAA-MM-DD` sin pasar por husos horarios. */
export function sumarDias(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d));
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/**
 * De qué régimen es una fecha, y por qué.
 *
 * EL ORDEN DE LAS PREGUNTAS IMPORTA y se comprueba en las pruebas: primero lo
 * medido —que es un hecho— y solo después el pronóstico. Si un día cae en los
 * dos (porque la fuente del histórico ya lo publicó y el pronóstico todavía lo
 * lleva en su serie), **manda lo medido**: entre un hecho y un modelo, gana el
 * hecho, siempre.
 *
 * @param iso            la fecha elegida, `AAAA-MM-DD`
 * @param atlas          hasta dónde llega el histórico medido
 * @param hoy            el día de hoy en el reloj del activo
 * @param diasDePronostico las fechas que el pronóstico trae en su serie
 */
export function tramoDe(
  iso: string,
  atlas: AlcanceDelAtlas | null,
  hoy: string,
  diasDePronostico: readonly string[] = [],
): TramoDeTiempo {
  if (atlas && iso >= atlas.primerDia) {
    if (iso <= atlas.ultimoDiaConHoras) {
      return {
        regimen: 'medido_horas',
        procedencia: 'medido',
        porque: 'Es un día que ya pasó y la medida está publicada hora a hora.',
      };
    }
    if (atlas.ultimoDiaConTotal && iso <= atlas.ultimoDiaConTotal) {
      return {
        regimen: 'medido_solo_total',
        procedencia: 'medido',
        porque: `De este día hay medida, pero todavía sin repartir por horas: la fuente `
          + `publica el detalle horario más tarde que el total (llega al ${atlas.ultimoDiaConHoras}).`,
      };
    }
  }

  if (diasDePronostico.includes(iso)) {
    return {
      regimen: 'pronostico',
      procedencia: 'pronóstico',
      porque: iso <= hoy
        ? 'De hoy todavía no hay medida publicada: lo que se enseña es el modelo.'
        : 'Es un día que aún no ha llegado: no hay nada medido, solo lo que el modelo espera.',
    };
  }

  // Ya pasó, el atlas debería cubrirlo y no lo cubre: es latencia de la fuente.
  if (atlas && iso <= hoy && iso >= atlas.primerDia) {
    const ultimo = atlas.ultimoDiaConTotal ?? atlas.ultimoDiaConHoras;
    return {
      regimen: 'sin_publicar',
      procedencia: 'sin dato',
      porque: `Este día ya pasó, pero la fuente del histórico aún no lo ha publicado: va con `
        + `retraso y hoy llega al ${ultimo}. No se rellena con el pronóstico, que es otra cosa.`,
    };
  }

  return {
    regimen: 'fuera',
    procedencia: 'sin dato',
    porque: atlas && iso < atlas.primerDia
      ? `El histórico de esta pantalla empieza el ${atlas.primerDia}.`
      : 'Está más allá de donde llega el pronóstico.',
  };
}

/**
 * Los dos extremos que el selector de fecha puede ofrecer.
 *
 * NO SE INVENTA EL EXTREMO DE LA DERECHA: sale de los días que el pronóstico
 * trajo de verdad, no de un «hoy + 9» supuesto. El horizonte de la fuente cambia
 * de una corrida a otra, y ofrecer un día que luego sale vacío es prometer algo
 * que no se tiene.
 */
export function extremos(
  atlas: AlcanceDelAtlas | null,
  hoy: string,
  diasDePronostico: readonly string[] = [],
): { primera: string; ultima: string } {
  const derechas = [hoy, ...diasDePronostico];
  const izquierdas = [hoy, ...(atlas ? [atlas.primerDia] : [])];
  return {
    primera: izquierdas.reduce((a, b) => (b < a ? b : a)),
    ultima: derechas.reduce((a, b) => (b > a ? b : a)),
  };
}

/**
 * Los días de un mes, con el régimen de cada uno, para pintar la cuadrícula.
 *
 * Devuelve el mes COMPLETO aunque parte caiga fuera de alcance: un hueco que se
 * ve es información —«de aquí no consta nada»— y un día que desaparece del
 * calendario es una pantalla que miente por omisión (`32 · L-44`).
 */
export function diasDelMesConRegimen(
  anio: number,
  mes: number,
  atlas: AlcanceDelAtlas | null,
  hoy: string,
  diasDePronostico: readonly string[] = [],
): { dia: number; iso: string; regimen: Regimen }[] {
  const cuantos = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return Array.from({ length: cuantos }, (_, i) => {
    const dia = i + 1;
    const iso = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    return { dia, iso, regimen: tramoDe(iso, atlas, hoy, diasDePronostico).regimen };
  });
}

/** Los meses que el eje puede ofrecer, del primero al último con algo dentro. */
export function mesesDelEje(
  primera: string, ultima: string,
): { anio: number; mes: number; clave: string }[] {
  const out: { anio: number; mes: number; clave: string }[] = [];
  let [a, m] = [Number(primera.slice(0, 4)), Number(primera.slice(5, 7))];
  const [aF, mF] = [Number(ultima.slice(0, 4)), Number(ultima.slice(5, 7))];
  // Tope de seguridad: un eje no puede tener más de diez años de meses. Si la
  // cuenta se desmadra por una fecha corrupta, se corta en vez de colgar la
  // pestaña con un bucle infinito.
  for (let i = 0; i < 120 && (a < aF || (a === aF && m <= mF)); i++) {
    out.push({ anio: a, mes: m, clave: `${a}-${String(m).padStart(2, '0')}` });
    if (++m > 12) { m = 1; a++; }
  }
  return out;
}
