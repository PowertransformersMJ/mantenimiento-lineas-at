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
