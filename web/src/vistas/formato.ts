// ============================================================================
// vistas/formato.ts — formateo de números y coordenadas para pantalla
// ----------------------------------------------------------------------------
// Solo PRESENTACIÓN. Aquí no se calcula nada: se visten números que ya vienen
// calculados. La conversión a grados-minutos-segundos es aritmética de formato,
// no ingeniería — por eso vive aquí y no en el núcleo.
// ============================================================================

export const nf = (v: number, d = 0): string =>
  v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });

// La conversión a GMS vive en el paquete puro de exportadores (@lineas/exportar,
// hermano de nucleo/ según ADR-005) porque también la usan los archivos GPX/KML/CSV
// y las pruebas de Node. Se re-exporta aquí para que las pantallas sigan
// importando de un solo sitio.
export { aGMS } from '@lineas/exportar/gms';
