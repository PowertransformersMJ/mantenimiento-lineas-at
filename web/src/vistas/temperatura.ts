// ============================================================================
// vistas/temperatura.ts — la temperatura AMBIENTE del corredor, mes a mes
// ----------------------------------------------------------------------------
// POR QUÉ ESTA CAPA Y POR QUÉ NO ES LA QUE SE RETIRÓ. `ADR-036` publicó la
// temperatura de la SUPERFICIE —lo que miden los tejados y el asfalto vistos
// desde arriba— y `ADR-037` la quitó por una razón de fondo: no entra en ninguna
// ecuación de este sistema. La del AIRE sí entra, y por dos puertas:
//
//   · La **ampacidad** (IEEE 738) se calcula con la temperatura ambiente: es,
//     junto al viento y al sol, lo que decide cuánta corriente aguanta el
//     conductor sin pasarse de su temperatura máxima.
//   · Las **cuatro temperaturas de la hipótesis** —EDS, máxima, mínima y la del
//     estado de viento— son hoy valores ADOPTADOS, sin una sola fuente local
//     detrás (`TODO-71`). Esta capa pone por primera vez una cifra del sitio al
//     lado de esas suposiciones.
//
// ⚠️⚠️ LAS DOS TRAMPAS, y hay que decirlas en voz alta porque las dos llevan a
// firmar un número que no se sostiene:
//
//   1. **ES UNA MEDIA DE LARGO PLAZO, NO UN EXTREMO.** El tiro máximo se juega
//      con la MÍNIMA histórica y la ampacidad de diseño con un percentil ALTO.
//      Una media no es ni lo uno ni lo otro. Leer los 27 °C de media como «la
//      mínima del sitio» dejaría el tiro en frío corto y un apoyo terminal
//      parecería sano sin serlo. Cerrar `TODO-71` exige una SERIE, con sus
//      percentiles; esto es el marco, no el cierre.
//   2. **LA ESCALA DE COLOR NO ES UNIVERSAL: SE AJUSTA AL RECORTE.** Y esto es
//      una CORRECCIÓN de lo que este mismo archivo defendía antes (`99 §ADR-041`).
//      La primera versión usaba una rampa fija y ancha «para no amplificar
//      ruido», y sobre un corredor costero eso dejaba el mapa de un solo color:
//      inútil. El argumento confundía el error ABSOLUTO del modelo (±1 °C, que
//      corre igual para todas las celdas y NO inventa gradientes) con el
//      RELATIVO entre celdas vecinas, que es mucho menor. El gradiente es señal.
//      El precio se paga publicando la escala: el rojo no es calor extremo, son
//      unos tres grados más que el azul. Un mapa que afirma con color y no dice
//      su escala es más peligroso que uno liso.
//
// PURO: sin DOM y sin red. Las mecánicas de la rejilla viven en `rejilla.ts`.
// ============================================================================
import {
  capaElegida as capaElegidaDeRejilla, capasOrdenadas as capasOrdenadasDeRejilla,
  avisoDeMuestreo as avisoDeMuestreoDeRejilla,
  type CapaTemporal, type FichaTemporal,
} from './rejilla.ts';

/** Una capa temporal de la rejilla térmica: un mes, o la media del año. */
export type CapaTemperatura = CapaTemporal;

export interface FichaTemperatura extends FichaTemporal {
  /** Cuánto cambia la media anual de punta a punta del recorte, en °C. Medido. */
  amplitud_espacial_c?: number;
  /** Cuánto separa al mes más cálido del más fresco, en °C. Medido. */
  oscilacion_estacional_c?: number;
  /** Bandera del generador: lo publicado es una media, jamás un extremo. */
  es_media_no_extremo?: boolean;
}

/** El orden en que se leen: los doce meses y, al final, la media del año. */
export function capasOrdenadas(ficha: FichaTemperatura): CapaTemperatura[] {
  return capasOrdenadasDeRejilla(ficha);
}

/** La capa que toca pintar: la pedida, y si no está, la media del año. */
export function capaElegida(ficha: FichaTemperatura, clave: string | null): CapaTemperatura | null {
  return capaElegidaDeRejilla(ficha, clave);
}

/**
 * Cuánto separa al mes más cálido del más fresco, EN GRADOS.
 *
 * En grados y no en tanto por ciento, a diferencia del recurso solar: un 8 % de
 * 27 °C no significa nada —la escala Celsius no tiene cero físico—, y quien lea
 * un porcentaje sobre una temperatura acabará multiplicándolo por algo.
 */
export function oscilacionEstacional(
  ficha: FichaTemperatura,
): { alto: CapaTemperatura; bajo: CapaTemperatura; grados: number } | null {
  const meses = capasOrdenadas(ficha).filter((c) => c.clave !== 'anual');
  if (meses.length < 2) return null;
  const alto = meses.reduce((a, b) => (b.resumen.p50 > a.resumen.p50 ? b : a));
  const bajo = meses.reduce((a, b) => (b.resumen.p50 < a.resumen.p50 ? b : a));
  return { alto, bajo, grados: alto.resumen.p50 - bajo.resumen.p50 };
}

/**
 * QUÉ SIGNIFICA EL COLOR, que aquí no es lo de siempre.
 *
 * La escala NO es universal: se ajusta al recorte para que el gradiente se vea.
 * Ese ajuste es lo que hace útil el mapa —con una escala climática ancha, un
 * corredor costero sale de un solo color— y a la vez lo que puede engañar: el
 * rojo del extremo no dice «calor extremo», dice «tres grados más que el azul
 * del otro extremo». Sin esta frase, la lectura natural es la equivocada.
 *
 * ⚠️ Va SIEMPRE, no solo cuando el recorte es plano. Un mapa con gradiente
 * bonito y sin su escala escrita es más peligroso que uno liso: el liso no
 * afirma nada, y éste afirma con color.
 */
export function avisoDeEscala(
  ficha: FichaTemperatura,
  /**
   * La capa que se está mirando. Su amplitud es la ÚNICA honesta para esta
   * frase: `amplitud_espacial_c` es la de la MEDIA ANUAL, y anunciarla como «la
   * de un mes» era falso para once de los doce — van de 0,8 a 1,7 °C en este
   * recorte. Una leyenda que existe para ser exacta no puede redondear a otra
   * magnitud.
   */
  capa?: CapaTemperatura | null,
): string | null {
  const rampa = ficha.rampa ?? [];
  if (rampa.length < 2) return null;
  const lo = rampa[0].c;
  const hi = rampa[rampa.length - 1].c;
  const esp = capa ? capa.resumen.max - capa.resumen.min : null;
  const espacio = esp !== null
    ? ` En ${capa!.rotulo.toLowerCase()}, del punto más fresco al más cálido del recorte hay `
      + `${esp.toFixed(1)} °C.`
    : '';
  return `El color está ajustado a este recorte —de ${lo.toFixed(1)} a ${hi.toFixed(1)} °C—, no a una `
    + `escala climática: el rojo NO significa calor extremo, significa unos ${(hi - lo).toFixed(1)} °C `
    + `más que el azul.${espacio} El gradiente que se ve es real; la escala, propia de este mapa.`;
}

/**
 * La frase que impide el mal uso. Nombra las hipótesis concretas que NO cierra.
 */
export const NOTA_HIPOTESIS =
  'Esto es una MEDIA de largo plazo, no un extremo. No cierra la temperatura mínima con la que se '
  + 'calcula el tiro máximo en frío, ni la ambiente de diseño de la ampacidad: las dos son '
  + 'percentiles de una SERIE, y una media no lo es. Sirve para saber en qué marco térmico vive la '
  + 'línea y para discutir con fundamento las temperaturas adoptadas (pestaña Térmica).';

/** Lo que hay que advertir del muestreo, cuando toque. */
export function avisoDeMuestreo(ficha: FichaTemperatura): string | null {
  return avisoDeMuestreoDeRejilla(
    ficha, 'la temperatura ambiente varía aún más suave que el recurso solar');
}

/**
 * La media del sitio FRENTE a la temperatura que el cálculo da por buena.
 *
 * NO dictamina, y el matiz es el mismo que en el pronóstico: comparar no es
 * validar. Una media por encima de la EDS adoptada no dice que la hipótesis esté
 * mal —el EDS es una condición de referencia, no el clima—, pero sí dice que la
 * suposición merece una mirada, y con qué diferencia.
 */
export function contraLaEds(
  mediaAnual_c: number | null,
  hipotesisEds_c: number | null | undefined,
): { delta: number; frase: string } | null {
  const h = typeof hipotesisEds_c === 'number' ? hipotesisEds_c : null;
  if (mediaAnual_c === null || h === null) return null;
  const delta = mediaAnual_c - h;
  if (Math.abs(delta) < 0.5) {
    return {
      delta,
      frase: `La media del sitio (${mediaAnual_c.toFixed(1)} °C) y la temperatura con la que se `
        + `calcula el estado de cada día (${h.toFixed(0)} °C) coinciden en la práctica.`,
    };
  }
  return {
    delta,
    frase: `La media del sitio es ${mediaAnual_c.toFixed(1)} °C y el cálculo usa ${h.toFixed(0)} °C `
      + `para el estado de cada día: ${Math.abs(delta).toFixed(1)} °C `
      + `${delta > 0 ? 'por encima' : 'por debajo'}. No lo valida ni lo desmiente —el EDS es una `
      + 'condición de referencia, no el clima del sitio—, pero es una diferencia que merece '
      + 'mirarse antes de firmar.',
  };
}
