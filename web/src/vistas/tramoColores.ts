// ============================================================================
// vistas/tramoColores.ts — la paleta de tramos de tensión, en UN solo sitio
// ----------------------------------------------------------------------------
// Los mismos cuatro matices que el KML exporta en aabbggrr (ADR-006), aquí en
// hex CSS para el mapa y la leyenda. Si un día cambia la paleta, cambia aquí y
// en exportar/kml.js — y en ningún otro lugar.
// ============================================================================
export const COLORES_TRAMO_CSS = ['#d63b3b', '#4bb0f5', '#5bc46f', '#d67a1f'] as const;

/**
 * EL TRAMO SIN CABLE DE GUARDA. Vive aquí, con la paleta de tramos, porque su
 * requisito es RELATIVO a ella: tiene que verse encima de cualquiera de los
 * cuatro colores de arriba. Si un día cambia la paleta, este color se revisa en
 * la misma pantalla.
 *
 * ⚠️ NINGUNO de los cuatro de arriba, y no es una preferencia. El primer intento
 * usó `#dc2626` sobre un trazado cuyo primer tramo es `#d63b3b`: los dos rojos
 * son el mismo a simple vista y la marca de daño desaparecía justo encima de ese
 * tramo. Hay guardián (`tests/cable-de-guarda.test.js`).
 *
 * La FUNDA blanca va debajo del discontinuo: es lo que lo separa del callejero,
 * de la foto satelital y de cualquier color de tramo. Sin ella no se ve.
 */
export const COLOR_SIN_GUARDA = '#7f1d1d';
export const COLOR_SIN_GUARDA_FUNDA = '#ffffff';
