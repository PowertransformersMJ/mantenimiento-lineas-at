// ============================================================================
// exportar/descargar.js — la ÚNICA pieza del exporte que toca el navegador
// ----------------------------------------------------------------------------
// Los generadores (gpx/kml/csv) son puros y devuelven texto; aquí ese texto se
// vuelve descarga. Mismo mecanismo que el módulo original: Blob → URL de
// objeto → <a download> → clic → revocar. Separado a propósito para que las
// pruebas de Node ejerciten los generadores sin fingir un DOM.
// ============================================================================

/** Sello de fecha local para el nombre del archivo: AAAAMMDD_HHMM. */
export function selloFecha(ahora = new Date()) {
  const z = (x) => String(x).padStart(2, '0');
  return `${ahora.getFullYear()}${z(ahora.getMonth() + 1)}${z(ahora.getDate())}_${z(ahora.getHours())}${z(ahora.getMinutes())}`;
}

/**
 * Dispara la descarga de un texto como archivo.
 * @param {string} nombre  nombre del archivo, con extensión
 * @param {string} mime    tipo MIME (sin charset; se añade utf-8)
 * @param {string} texto   contenido
 */
export function descargar(nombre, mime, texto) {
  const b = new Blob([texto], { type: `${mime};charset=utf-8` });
  const u = URL.createObjectURL(b);
  const a = document.createElement('a');
  a.href = u;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}
