// ============================================================================
// vistas/gms.js — grados decimales → grados, minutos y segundos
// ----------------------------------------------------------------------------
// Es JavaScript puro (no TypeScript) a propósito: lo consumen tanto las
// pantallas (via vistas/formato.ts) como los exportadores puros de
// web/src/exportar/, y las pruebas de Node lo importan directamente sin
// necesitar un compilador. Aritmética de formato, no ingeniería.
// ============================================================================

/**
 * Grados decimales → grados, minutos y segundos, como los mostraba el módulo
 * de campo original: `10° 21' 04.21" N` · `75° 29' 32.82" W`.
 *
 * @param {number} valor grados decimales, con signo
 * @param {'lat'|'lon'} eje decide el hemisferio (N/S o E/W)
 * @returns {string}
 */
export function aGMS(valor, eje) {
  const hemisferio = eje === 'lat' ? (valor >= 0 ? 'N' : 'S') : (valor >= 0 ? 'E' : 'W');
  const abs = Math.abs(valor);
  const grados = Math.floor(abs);
  const minTotal = (abs - grados) * 60;
  const minutos = Math.floor(minTotal);
  const segundos = (minTotal - minutos) * 60;
  const ss = segundos.toFixed(2).padStart(5, '0');
  return `${grados}° ${String(minutos).padStart(2, '0')}' ${ss}" ${hemisferio}`;
}
