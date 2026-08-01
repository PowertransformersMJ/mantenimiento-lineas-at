// ============================================================================
// vistas/formato.ts — formateo de números y coordenadas para pantalla
// ----------------------------------------------------------------------------
// Solo PRESENTACIÓN. Aquí no se calcula nada: se visten números que ya vienen
// calculados. La conversión a grados-minutos-segundos es aritmética de formato,
// no ingeniería — por eso vive aquí y no en el núcleo.
// ============================================================================

export const nf = (v: number, d = 0): string =>
  v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * Pone coma decimal en la PROSA que escribe el núcleo.
 *
 * El núcleo arma sus textos con `toFixed` y nunca con `toLocaleString`, a
 * propósito: el formateo por configuración regional depende del ICU de la
 * máquina, y un veredicto no puede decir una cosa en la Mac del Ingeniero y otra
 * en el CI (`nucleo/umbrales.js`, `nucleo/cargas.js`). El precio es que sale
 * punto decimal, y en Colombia **el punto es el separador de miles**: «multiplica
 * la tensión por 1.726» se lee *mil setecientos veintiséis*. En la frase que más
 * pesa de un informe, eso no es un detalle tipográfico.
 *
 * Se corrige AQUÍ, al pintar, y no en el núcleo: el núcleo tiene que seguir
 * siendo determinista y sin idioma. La sustitución es segura porque solo toca un
 * punto que tiene dígito a los dos lados, y `toFixed` jamás emite separador de
 * miles — así que en un texto del núcleo ese punto es siempre decimal. Las
 * referencias tipo «docs/40 §8», «2·H·sen(α/2)» o `ftTotalPerpendicular_kgf` no
 * cumplen el patrón y quedan intactas.
 */
export const textoNucleo = (s: string): string => s.replace(/(\d)\.(\d)/g, '$1,$2');

// La conversión a GMS vive en el paquete puro de exportadores (@lineas/exportar,
// hermano de nucleo/ según ADR-005) porque también la usan los archivos GPX/KML/CSV
// y las pruebas de Node. Se re-exporta aquí para que las pantallas sigan
// importando de un solo sitio.
export { aGMS } from '@lineas/exportar/gms';
