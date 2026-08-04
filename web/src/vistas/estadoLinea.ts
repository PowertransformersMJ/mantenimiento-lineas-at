// ============================================================================
// vistas/estadoLinea.ts — el CIELO de la línea, derivado del dato
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. La crítica de oficio de las cuatro maquetas de carcasa
// encontró el mismo fallo en las cuatro: ninguna impedía que una línea se
// mostrara «sana» con CERO apoyos dictaminados, y dos lo afirmaban activamente
// (en una, la palabra «firmable» era una cadena escrita a mano en los datos).
//
// Este módulo existe para que eso sea IMPOSIBLE aquí, y no por disciplina sino
// por construcción: `amanecer` —el único estado que dice «al día»— exige que
// TODOS los apoyos estén dictaminados. Si falta uno, no amanece. Hay una prueba
// que lo vigila, y si alguien relaja la condición se pone roja.
//
// LA COBERTURA SE CRUZA POR APOYO, NO SE COMPARAN DOS CONTEOS. Un apoyo está
// dictaminado cuando lo está en LOS DOS EJES, transversal y longitudinal. Si se
// tomara el menor de los dos conteos se estaría dando una COTA SUPERIOR: cinco
// apoyos con veredicto transversal y cinco con longitudinal pueden ser diez
// apoyos distintos y cero dictaminados. Sobreestimar la cobertura es
// exactamente el error que este producto existe para impedir.
//
// Y el veredicto se lee de `utilizacion_pct !== null`, que es lo que el NÚCLEO
// concluyó — no de si los campos del inventario están presentes. Que un apoyo
// declare su carga de rotura no significa que se le pueda dictaminar: puede
// faltarle otra cosa, y quien lo sabe es el motor.
//
// Módulo PURO: no toca el DOM, ni la red, ni React.
// ============================================================================

export type Cielo = 'amanecer' | 'atardecer' | 'tormenta' | 'niebla';

/** Lo mínimo que se necesita de una fila de eje. Estructural a propósito. */
export interface FilaDeEje {
  apoyo: string;
  utilizacion_pct: number | null;
}

export interface EntradaEstado {
  transversal: { filas: readonly FilaDeEje[]; total: number; aRevisar: number };
  longitudinal: { filas: readonly FilaDeEje[]; total: number; aRevisar: number };
  /** Expedientes de la línea. Solo cuentan los NO cerrados. */
  investigaciones: readonly { cerrada?: boolean }[];
  hipotesis: { congelada?: boolean };
}

export interface EstadoDeLinea {
  cielo: Cielo;
  /** Qué dice el cielo, en palabras, para quien no mira el color. */
  rotulo: string;
  /** La razón, derivada del dato. Nunca un texto fijo. */
  porQue: string;
  /** Apoyos con veredicto en LOS DOS EJES. */
  dictaminados: number;
  total: number;
  porEje: {
    transversal: { con: number; total: number };
    longitudinal: { con: number; total: number };
  };
  eventosAbiertos: number;
  aRevisar: number;
}

const conVeredicto = (filas: readonly FilaDeEje[]): Set<string> =>
  new Set(filas.filter((f) => f.utilizacion_pct !== null).map((f) => f.apoyo));

const plural = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios);

/**
 * El estado de una línea, con su cielo. El orden de las reglas es el orden de
 * la urgencia: primero lo que tiene gente en campo, después lo que no se puede
 * ni opinar, después lo que hay que mirar, y solo al final «al día».
 */
export function estadoDeLinea(e: EntradaEstado): EstadoDeLinea {
  const trans = conVeredicto(e.transversal.filas);
  const long = conVeredicto(e.longitudinal.filas);

  // La intersección REAL, apoyo por apoyo. No el menor de dos conteos.
  let dictaminados = 0;
  for (const a of trans) if (long.has(a)) dictaminados++;

  // El total honesto es el mayor de los dos censos: si un eje no produjo fila
  // para un apoyo, ese apoyo existe igual y sigue sin dictaminar.
  const total = Math.max(e.transversal.total, e.longitudinal.total);
  const sinDictaminar = Math.max(0, total - dictaminados);
  const eventosAbiertos = e.investigaciones.filter((i) => !i.cerrada).length;
  const aRevisar = e.transversal.aRevisar + e.longitudinal.aRevisar;
  const hipotesisFirme = e.hipotesis.congelada === true;

  const base = {
    dictaminados,
    total,
    porEje: {
      transversal: { con: trans.size, total: e.transversal.total },
      longitudinal: { con: long.size, total: e.longitudinal.total },
    },
    eventosAbiertos,
    aRevisar,
  };

  // 1 · TORMENTA — hay un expediente abierto: gente y equipo en campo AHORA.
  if (eventosAbiertos > 0) {
    return {
      ...base,
      cielo: 'tormenta',
      rotulo: 'Evento abierto en campo',
      porQue: `${eventosAbiertos} ${plural(eventosAbiertos, 'expediente sin cerrar', 'expedientes sin cerrar')}.`,
    };
  }

  // 2 · NIEBLA — ni un apoyo dictaminado: no hay con qué opinar de la línea.
  if (dictaminados === 0) {
    return {
      ...base,
      cielo: 'niebla',
      rotulo: 'Sin datos para dictaminar',
      porQue: total === 0
        ? 'No hay apoyos evaluables en esta línea.'
        : `Ninguno de los ${total} apoyos tiene veredicto en los dos ejes: falta la ficha de inventario.`,
    };
  }

  // 3 · ATARDECER — hay algo que mirar. Basta UNO sin dictaminar.
  if (sinDictaminar > 0 || aRevisar > 0 || !hipotesisFirme) {
    const motivos: string[] = [];
    if (sinDictaminar > 0) motivos.push(`${sinDictaminar} de ${total} ${plural(sinDictaminar, 'apoyo sigue', 'apoyos siguen')} sin veredicto`);
    if (aRevisar > 0) motivos.push(`${aRevisar} ${plural(aRevisar, 'pide', 'piden')} revisión`);
    if (!hipotesisFirme) motivos.push('la hipótesis de cálculo no está congelada');
    return {
      ...base,
      cielo: 'atardecer',
      rotulo: 'Con hallazgos',
      porQue: motivos.join(' · ') + '.',
    };
  }

  // 4 · AMANECER — y solo aquí. Exige cobertura COMPLETA en los dos ejes.
  return {
    ...base,
    cielo: 'amanecer',
    rotulo: 'Al día',
    porQue: `Los ${total} apoyos dictaminados en los dos ejes, nada pendiente de revisión.`,
  };
}
