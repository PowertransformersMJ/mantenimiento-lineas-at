// ============================================================================
// vistas/coberturaEjes.ts — qué se sabe de CADA apoyo, eje por eje
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE, Y QUÉ FALLO CIERRA. El horizonte pintaba una torre hueca si le
// faltaba el veredicto en CUALQUIERA de los dos ejes:
//
//     conVeredicto: conTrans.has(f.apoyo) && conLong.has(f.apoyo)
//
// Hoy da igual, porque en LN-627 van 0 de 24 en ambos. Pero el dato transversal
// (`cargaRotura_kgf`) y el longitudinal (`capacidadLongitudinal` +
// `nFasesAmarradas`) llegan por caminos distintos y NO van a llegar a la vez. El
// día que uno avance antes que el otro, el dibujo diría «sin veredicto» de un
// apoyo que sí está dictaminado en un eje. Eso es contar una cosa y decir que
// cuentas otra (`99 §ADR-017`), y en un dibujo que se enseña al cliente.
//
// Además el cruce estaba ESCRITO DOS VECES —aquí y en `estadoLinea.ts`—, que es
// justo lo que `vanosLinea.ts` existe para haber evitado. Ahora hay un dueño y
// los dos lo piden.
//
// LA REGLA QUE NO SE PUEDE RELAJAR: un apoyo con veredicto en UN eje NO está «a
// medio dictaminar». No existe medio dictamen. Son DOS PREGUNTAS DISTINTAS —
// cuánto aguanta de lado y cuánto a lo largo—, una respondida y la otra no. Por
// eso `dosEjes` es verdadero SOLO en `ambos`, y por eso el dibujo tiene dos
// aspectos de torre y no tres: cualquier relleno parcial se leería como «medio
// sano», que es una afirmación que nadie ha hecho.
//
// Y el veredicto se lee de `utilizacion_pct !== null` —lo que el NÚCLEO
// concluyó—, nunca de si los campos del inventario están presentes: que un apoyo
// declare su carga de rotura no significa que se le pueda dictaminar.
//
// Módulo PURO: no toca el DOM, ni la red, ni React.
// ============================================================================

/** Lo mínimo que se necesita de una fila de eje. Estructural a propósito. */
export interface FilaDeEje {
  apoyo: string;
  utilizacion_pct: number | null;
}

export type CoberturaApoyo = 'ambos' | 'solo_transversal' | 'solo_longitudinal' | 'ninguno';

export interface FilaCobertura {
  apoyo: string;
  transversal: boolean;
  longitudinal: boolean;
  estado: CoberturaApoyo;
  /** Verdadero SOLO en `ambos`. Es lo único que decide si la torre se rellena. */
  dosEjes: boolean;
}

export interface CoberturaDeEjes {
  filas: FilaCobertura[];
  ambos: number;
  soloTransversal: number;
  soloLongitudinal: number;
  ninguno: number;
  /**
   * ⚠️ Los dos conteos siguientes son SOBRE LOS APOYOS DIBUJADOS —los que
   * produjeron fila transversal—, porque es lo que necesitan los carriles del
   * horizonte: una marca por torre. NO son el censo de cada eje. Si alguna vez
   * hace falta «cuántos apoyos del eje longitudinal tienen veredicto», ésa es
   * otra pregunta y se cuenta sobre su propia lista; mezclarlas sería contar una
   * cosa y decir que cuentas otra.
   */
  conTransversal: number;
  conLongitudinal: number;
  /** Apoyos que el dibujo PUEDE pintar: los que produjeron fila transversal. */
  dibujados: number;
  /** `false` cuando la línea no tiene dos estructuras que comparar. */
  longitudinalCalculable: boolean;
}

const conVeredicto = (filas: readonly FilaDeEje[]): Set<string> =>
  new Set(filas.filter((f) => f.utilizacion_pct !== null).map((f) => f.apoyo));

const plural = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios);

/** «ninguno» y no «0»: un cero se lee como una medida; la palabra se lee como un hueco. */
const cuenta = (n: number): string => (n === 0 ? 'ninguno' : String(n));

/**
 * El estado de cada apoyo, apoyo por apoyo. El orden es el de la lista
 * transversal, que es la que gobierna el dibujo.
 */
export function coberturaPorApoyo(
  transversal: readonly FilaDeEje[],
  longitudinal: readonly FilaDeEje[] | null,
): FilaCobertura[] {
  const trans = conVeredicto(transversal);
  const long = conVeredicto(longitudinal ?? []);

  return transversal.map((f) => {
    const t = trans.has(f.apoyo);
    const l = long.has(f.apoyo);
    const estado: CoberturaApoyo = t && l ? 'ambos'
      : t ? 'solo_transversal'
        : l ? 'solo_longitudinal'
          : 'ninguno';
    return { apoyo: f.apoyo, transversal: t, longitudinal: l, estado, dosEjes: estado === 'ambos' };
  });
}

/**
 * El recuento completo.
 *
 * `ambos` es la INTERSECCIÓN real, apoyo por apoyo — nunca el menor de dos
 * conteos: cinco apoyos con veredicto transversal y cinco con longitudinal
 * pueden ser diez apoyos distintos y CERO dictaminados. Sobreestimar la
 * cobertura es exactamente el error que este producto existe para impedir.
 */
export function cobertura(
  transversal: readonly FilaDeEje[],
  longitudinal: readonly FilaDeEje[] | null,
): CoberturaDeEjes {
  const filas = coberturaPorApoyo(transversal, longitudinal);
  const cnt = (e: CoberturaApoyo) => filas.filter((f) => f.estado === e).length;

  return {
    filas,
    ambos: cnt('ambos'),
    soloTransversal: cnt('solo_transversal'),
    soloLongitudinal: cnt('solo_longitudinal'),
    ninguno: cnt('ninguno'),
    conTransversal: filas.filter((f) => f.transversal).length,
    conLongitudinal: filas.filter((f) => f.longitudinal).length,
    dibujados: filas.length,
    longitudinalCalculable: longitudinal !== null,
  };
}

/**
 * El párrafo que se lee bajo el dibujo. Lo redacta este módulo y no el
 * componente porque es parte del RESULTADO: un dibujo de huecos sin la frase que
 * explica de qué son huecos invita a leerlos como un fallo del programa.
 */
export function lecturaDeCobertura(c: CoberturaDeEjes, o: { totalLinea: number }): string {
  const n = c.dibujados;
  const partes: string[] = [];

  if (n === 0) {
    partes.push('No hay apoyos evaluables en esta línea.');
  } else if (c.ambos === n) {
    partes.push(
      `Los ${n} apoyos tienen veredicto en los dos ejes: ninguna torre queda hueca. `
      + 'Lo que dice cada veredicto —si cumple o si pide revisión— está en Cargas, apoyo por apoyo.',
    );
  } else if (c.ambos === 0 && c.conTransversal === 0 && c.conLongitudinal === 0) {
    partes.push(
      `Ninguno de los ${n} apoyos tiene veredicto: ni transversal ni longitudinal. Por eso los ${n} `
      + 'salen huecos y los dos carriles de comprobación están vacíos. No es un fallo del dibujo: es '
      + 'el estado del inventario. El motor ya sabe dictaminar; le falta el dato.',
    );
  } else if (c.ambos === 0) {
    // Un eje avanzó y el otro no. Es el caso que este módulo existe para no mentir.
    const cual = c.conTransversal > 0 ? 'transversal' : 'longitudinal';
    const otro = c.conTransversal > 0 ? 'longitudinal' : 'transversal';
    const cuantos = c.conTransversal > 0 ? c.conTransversal : c.conLongitudinal;
    partes.push(
      `${cuantos} de los ${n} apoyos ya tienen veredicto ${cual}; ${otro}, ninguno. Las torres siguen `
      + 'huecas porque el relleno significa las dos preguntas respondidas, y aquí falta una. Que un '
      + 'apoyo cumpla en un eje no dice nada del otro: son dos preguntas distintas.',
    );
  } else {
    const faltan = n - c.ambos;
    const detalle: string[] = [];
    if (c.soloTransversal) detalle.push(`${c.soloTransversal} solo transversal`);
    if (c.soloLongitudinal) detalle.push(`${c.soloLongitudinal} solo longitudinal`);
    if (c.ninguno) detalle.push(`${c.ninguno} en ninguno de los dos`);
    partes.push(
      `${c.ambos} de los ${n} apoyos tienen veredicto en los dos ejes. De los ${faltan} que faltan: `
      + `${detalle.join(', ')}. Un apoyo con un solo eje respondido no está a medio dictaminar: está `
      + 'dictaminado en una pregunta y sin responder en la otra.',
    );
  }

  // La guarda se declara SOLO cuando los dos censos difieren de verdad.
  if (o.totalLinea > n) {
    partes.push(
      `Se dibujan ${n} de los ${o.totalLinea} apoyos de la línea: el resto no produjo fila de cálculo.`,
    );
  }
  if (!c.longitudinalCalculable && n > 0) {
    partes.push('El eje longitudinal no es calculable aquí: hacen falta dos estructuras que comparar.');
  }

  return partes.join(' ');
}

/** El rótulo que sale al pasar el ratón por una torre. */
export function tituloDeApoyo(
  f: FilaCobertura,
  e: { terminal?: boolean; factor?: number | null; factorTexto?: string } = {},
): string {
  const partes = [f.apoyo];
  if (e.terminal) partes.push('terminal');

  switch (f.estado) {
    case 'ambos':
      partes.push('veredicto en los dos ejes: transversal y longitudinal');
      break;
    case 'solo_transversal':
      partes.push('veredicto TRANSVERSAL (de lado) · longitudinal: todavía sin veredicto — el porqué está en Cargas');
      break;
    case 'solo_longitudinal':
      partes.push('veredicto LONGITUDINAL (a lo largo) · transversal: todavía sin veredicto — el porqué está en Cargas');
      break;
    default:
      partes.push('SIN VEREDICTO en ninguno de los dos ejes: el motor no puede dictaminarlo con lo que declara el inventario');
  }

  if (e.factorTexto) partes.push(`amplifica ×${e.factorTexto}`);
  return partes.join(' · ');
}

/** El rótulo de una marca de carril. */
export function tituloDeCarril(apoyo: string, eje: 'transversal' | 'longitudinal', hay: boolean): string {
  const glosa = eje === 'transversal' ? 'de lado' : 'a lo largo';
  return `${apoyo} · ${eje} (${glosa}): ${hay ? 'con veredicto' : 'todavía sin veredicto'}`;
}

/**
 * El resumen para quien no ve el dibujo. Va en el `aria-label` del SVG y lleva
 * los mismos números que los rótulos del pie, en el mismo orden: si alguna vez
 * difieren, es que uno de los dos se calculó aparte.
 */
export function resumenAccesible(
  c: CoberturaDeEjes,
  v: { vanosFuera: number; totalLinea: number },
): string {
  const n = c.dibujados;
  const cabeza = `Perfil de la línea: ${n} ${plural(n, 'apoyo', 'apoyos')} en su orden y a su distancia real.`;

  const cuerpo = c.ambos === n && n > 0
    ? `Todos tienen veredicto en los dos ejes.`
    : c.conTransversal === 0 && c.conLongitudinal === 0
      ? `Ninguno tiene veredicto, ni transversal ni longitudinal: los ${n} se dibujan huecos y los dos `
        + 'carriles de comprobación están vacíos.'
      : `${cuenta(c.ambos)} con veredicto en los dos ejes; ${cuenta(c.conTransversal)} con transversal `
        + `y ${cuenta(c.conLongitudinal)} con longitudinal, de ${n}.`;

  return `${cabeza} ${cuerpo} ${v.vanosFuera} vanos fuera de la banda del vano ideal.`;
}
