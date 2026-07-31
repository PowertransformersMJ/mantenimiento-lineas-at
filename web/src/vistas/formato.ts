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
 * Grados decimales → grados, minutos y segundos, como los mostraba el módulo
 * de campo original: `10° 21' 04.21" N` · `75° 29' 32.82" W`.
 */
export function aGMS(valor: number, eje: 'lat' | 'lon'): string {
  const hemisferio = eje === 'lat' ? (valor >= 0 ? 'N' : 'S') : (valor >= 0 ? 'E' : 'W');
  const abs = Math.abs(valor);
  const grados = Math.floor(abs);
  const minTotal = (abs - grados) * 60;
  const minutos = Math.floor(minTotal);
  const segundos = (minTotal - minutos) * 60;
  const ss = segundos.toFixed(2).padStart(5, '0');
  return `${grados}° ${String(minutos).padStart(2, '0')}' ${ss}" ${hemisferio}`;
}
