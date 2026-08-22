// ============================================================================
// vistas/radiacion.ts — el recurso solar del corredor, mes a mes
// ----------------------------------------------------------------------------
// POR QUÉ ESTÁ CAPA EXISTE, Y POR QUÉ NO ES DECORACIÓN. La radiación solar es
// una ENTRADA del cálculo térmico de esta misma aplicación: la ampacidad
// (IEEE 738) se calcula con **1.000 W/m² ADOPTADOS** —el valor clásico de
// mediodía despejado— sin una sola fuente local detrás. Esta capa pone, por
// primera vez, una cifra del sitio al lado de esa suposición.
//
// ⚠️⚠️ Y AQUÍ ESTÁ LA TRAMPA QUE HAY QUE DECIR EN VOZ ALTA: lo que se mapea es
// ENERGÍA DIARIA (kWh/m² al día) y lo que come IEEE 738 es una IRRADIANCIA
// INSTANTÁNEA (W/m² al mediodía). **No se convierte una en otra con una regla de
// tres.** Pasar de la energía del día al pico de mediodía exige la serie horaria
// y el estado del cielo; dividir por las horas de sol da un número creíble y
// falso. Este mapa informa; la hipótesis la cambia el Ingeniero, con su fuente.
//
// LO QUE SÍ SE PUEDE LEER AQUÍ: cuánto recurso solar tiene el corredor, cómo
// cambia entre el mes más soleado y el más flojo —en este recorte la diferencia
// entre marzo y noviembre pasa del 30 %— y si hay gradiente dentro de la zona.
//
// ⚠️ Y DOS COSAS SOBRE CÓMO SE MIRA, que son CORRECCIONES: las dos se pagaron
// caras en la capa hermana de temperatura y nunca llegaron aquí, así que el
// Ingeniero encendía la capa y no podía apreciarla.
//
//   1. **LA ESCALA DE COLOR SE AJUSTA AL RECORTE** (`99 §ADR-041`, `30 · L-61`).
//      La rampa fija y ancha (3,0 - 7,5 kWh/m² al día) dejaba la media del año
//      —la capa que se abre por defecto— ocupando el 11 % de la escala: el mapa
//      salía de un color. El argumento de «no amplificar ruido» confundía el
//      error ABSOLUTO del modelo, común a todas las celdas, con el RELATIVO
//      entre vecinas, que es lo que se dibuja. El precio se paga PUBLICANDO la
//      escala: el rojo no es sol extremo, son tantos kWh más que el azul.
//   2. **EL ENCUADRE MANDA MÁS QUE LA RAMPA** (`99 §ADR-042`). El mapa arranca
//      ceñido a la LÍNEA —tres kilómetros— y a esa escala el recurso solar es el
//      mismo en todas las celdas: la capa se ve perfecta y parece rota. El
//      gradiente vive a escala del RECORTE, y hay que poder llegar de un clic.
//
// PURO: sin DOM y sin red. Las mecánicas de la rejilla viven en `rejilla.ts`.
// ============================================================================
import {
  capaElegida as capaElegidaDeRejilla, capasOrdenadas as capasOrdenadasDeRejilla,
  avisoDeMuestreo as avisoDeMuestreoDeRejilla,
  type CapaTemporal, type FichaTemporal,
} from './rejilla.ts';

/**
 * Una capa temporal del atlas: un mes, o la media del año.
 *
 * Es la misma forma que usa cualquier rejilla mensual, así que su dueño es
 * `rejilla.ts`: el nombre de aquí se conserva para no renombrar nada.
 */
export type CapaRadiacion = CapaTemporal;

export interface FichaRadiacion extends FichaTemporal {
  no_es_irradiancia_instantanea?: boolean;
  /** Bandera del generador: la rampa es de ESTE recorte, no una escala universal. */
  rampa_ajustada_al_recorte?: boolean;
  /** Cuánto cambia la media anual de punta a punta del recorte. Medido. */
  amplitud_espacial?: number;
}

/** El orden en que se leen: los doce meses y, al final, la media del año. */
export function capasOrdenadas(ficha: FichaRadiacion): CapaRadiacion[] {
  return capasOrdenadasDeRejilla(ficha);
}

/** La capa que toca pintar: la pedida, y si no está, la media del año. */
export function capaElegida(ficha: FichaRadiacion, clave: string | null): CapaRadiacion | null {
  return capaElegidaDeRejilla(ficha, clave);
}

/**
 * Cuánto separa al mes más soleado del más flojo, en tanto por ciento.
 *
 * Es la cifra que convierte esta capa en algo accionable: un recurso que cambia
 * un tercio entre meses no se resume con una media anual, y una media anual es
 * justo lo que suele citarse.
 */
export function oscilacionAnual(ficha: FichaRadiacion): { alto: CapaRadiacion; bajo: CapaRadiacion; pct: number } | null {
  const meses = capasOrdenadas(ficha).filter((c) => c.clave !== 'anual');
  if (meses.length < 2) return null;
  const alto = meses.reduce((a, b) => (b.resumen.p50 > a.resumen.p50 ? b : a));
  const bajo = meses.reduce((a, b) => (b.resumen.p50 < a.resumen.p50 ? b : a));
  if (bajo.resumen.p50 <= 0) return null;
  return { alto, bajo, pct: ((alto.resumen.p50 - bajo.resumen.p50) / bajo.resumen.p50) * 100 };
}

/**
 * QUÉ SIGNIFICA EL COLOR, que aquí tampoco es lo de siempre.
 *
 * La escala NO es universal: se ajusta al recorte para que el gradiente se vea
 * (`99 §ADR-041`). Ese ajuste es lo que hace útil el mapa —con una escala que va
 * del trópico nublado al desierto de altura, un corredor costero sale de un solo
 * color— y a la vez lo que puede engañar: el rojo del extremo no dice «aquí pega
 * un sol brutal», dice «dos kilovatios hora más que el azul del otro extremo».
 *
 * ⚠️ Va SIEMPRE, no solo cuando el recorte es plano. Un mapa con gradiente
 * bonito y sin su escala escrita es más peligroso que uno liso: el liso no
 * afirma nada, y éste afirma con color.
 */
export function avisoDeEscala(
  ficha: FichaRadiacion,
  /**
   * La capa que se está mirando. Su amplitud es la ÚNICA honesta para esta
   * frase: `amplitud_espacial` es la de la MEDIA ANUAL, y anunciarla como «la de
   * un mes» sería falso para los doce —van de 0,36 a 0,87 kWh/m² en este
   * recorte—. Es el mismo fallo que ya se cazó en la capa de temperatura.
   */
  capa?: CapaRadiacion | null,
): string | null {
  const rampa = ficha.rampa ?? [];
  if (rampa.length < 2) return null;
  const lo = rampa[0].c;
  const hi = rampa[rampa.length - 1].c;
  const u = ficha.unidad ?? 'kWh/m² al día';
  const esp = capa ? capa.resumen.max - capa.resumen.min : null;
  const espacio = esp !== null
    ? ` En ${capa!.rotulo.toLowerCase()}, del punto más flojo al más soleado del recorte hay `
      + `${esp.toFixed(2)} ${u}.`
    : '';
  return `El color está ajustado a este recorte —de ${lo.toFixed(2)} a ${hi.toFixed(2)} ${u}—, no a `
    + `una escala universal: el rojo NO significa sol extremo, significa unos ${(hi - lo).toFixed(2)} `
    + `${u} más que el azul.${espacio} El gradiente que se ve es real; la escala, propia de este mapa.`;
}

/**
 * POR QUÉ EL MAPA SE VE DE UN COLOR CUANDO ESTÁ ENCUADRADO EN LA LÍNEA.
 *
 * No es un fallo y hay que decirlo, porque un mapa liso sin explicación se lee
 * como avería — y el reflejo siguiente es estirar la rampa hasta que «se vea
 * algo», que es como se fabrica un gradiente que no existe. Ninguna línea de
 * este sistema es tan larga como para que el recurso solar cambie a lo suyo: el
 * gradiente vive a escala del recorte, y por eso existe «Ver todo el recorte».
 */
export const NOTA_ENCUADRE =
  'Encuadrado en la línea el color es casi uniforme y no es un fallo: a lo largo de unos pocos '
  + 'kilómetros el sol es el mismo. El gradiente se ve al abarcar el recorte entero.';

/**
 * La frase que impide el mal uso. NO es un aviso genérico: nombra la magnitud
 * que sí entra en el cálculo y por qué ésta no la sustituye.
 */
export const NOTA_AMPACIDAD =
  'La ampacidad de esta línea se calcula con 1.000 W/m² ADOPTADOS (pestaña Térmica), que es una '
  + 'irradiancia INSTANTÁNEA de mediodía despejado. Lo de este mapa es ENERGÍA DIARIA: son '
  + 'magnitudes distintas y no se convierte una en otra con una regla de tres. Sirve para ver el '
  + 'recurso del corredor, no para cambiar la hipótesis.';

/** Lo que hay que advertir del muestreo, cuando toque. */
export function avisoDeMuestreo(ficha: FichaRadiacion): string | null {
  return avisoDeMuestreoDeRejilla(
    ficha, 'el recurso solar varía suave y el gradiente se dibuja igual');
}
