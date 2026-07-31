// ============================================================================
// exportar/calidad.js — calidad del levantamiento, CALCULADA, no redactada
// ----------------------------------------------------------------------------
// El módulo original cerraba su Resumen con cuatro observaciones ESCRITAS A
// MANO sobre la calidad del dato (numeración inconsistente, cotas no
// utilizables, quiebre fuerte, vano anómalo). Eso se desactualiza en cuanto
// cambia un punto. Aquí las observaciones se DERIVAN de los datos cada vez:
// si el dato se corrige, el hallazgo desaparece solo.
//
// No inventa umbrales de norma: los criterios son geométricos y declarados
// (>90° de quiebre, >2× / <0,2× el vano promedio, precisión GPS declarada).
//
// JavaScript puro: sin DOM. Consume la derivación de levantamiento.js.
// ============================================================================

/** @typedef {import('./levantamiento.js').PuntoExportacion} PuntoExportacion */

/**
 * @typedef {Object} HallazgoCalidad
 * @property {'atencion'|'aviso'|'info'} severidad
 * @property {string} titulo
 * @property {string} detalle
 */

/**
 * @param {ReturnType<import('./levantamiento.js').derivarLevantamiento>} lev
 * @returns {HallazgoCalidad[]} ordenados de mayor a menor severidad
 */
export function calidadLevantamiento(lev) {
  /** @type {HallazgoCalidad[]} */
  const h = [];
  const P = lev.puntos;
  if (!P.length) return h;
  const E = P.filter((p) => p.tipo === 'Estructura');

  // ── 1 · Serie de numeración canónica: duplicados y huecos ────────────────
  const numerados = [];
  for (const p of E) {
    const m = /(\d+)\s*$/.exec(p.nombre);
    if (m) numerados.push({ num: Number(m[1]), p });
  }
  const vistos = new Map();
  const duplicados = [];
  for (const { num, p } of numerados) {
    if (vistos.has(num)) duplicados.push(`${vistos.get(num).nombre} y ${p.nombre} (puntos ${vistos.get(num).n} y ${p.n})`);
    else vistos.set(num, p);
  }
  if (duplicados.length) {
    h.push({
      severidad: 'atencion',
      titulo: `Numeración duplicada en ${duplicados.length} caso(s)`,
      detalle: `Comparten número: ${duplicados.join('; ')}. Dos estructuras con el mismo número invalidan cualquier referencia cruzada con planos o reportes.`,
    });
  }
  if (numerados.length > 1) {
    const nums = [...vistos.keys()].sort((a, b) => a - b);
    const faltan = [];
    for (let n = nums[0]; n <= nums[nums.length - 1]; n++) if (!vistos.has(n)) faltan.push(n);
    if (faltan.length) {
      h.push({
        severidad: 'aviso',
        titulo: `Huecos en la serie de numeración: falta(n) ${faltan.join(', ')}`,
        detalle: 'La serie canónica salta números. Puede ser una estructura retirada o una no capturada en campo: hay que decidirlo, no asumirlo.',
      });
    }
  }

  // ── 2 · Quiebres fuertes: deflexión > 90° ────────────────────────────────
  const quiebres = E.filter((p) => p.deflexion_grados != null && p.deflexion_grados > 90);
  for (const p of quiebres) {
    h.push({
      severidad: 'aviso',
      titulo: `Quiebre de ${p.deflexion_grados.toFixed(1)}° en ${p.nombre}`,
      detalle: 'Una deflexión mayor de 90° es un giro brusco real o un punto mal tomado. Si es real, esa estructura trabaja a plena carga transversal y merece revisión prioritaria.',
    });
  }

  // ── 3 · Vanos anómalos frente al promedio ────────────────────────────────
  const vanos = E.filter((p) => p.vanoAnterior_m != null);
  if (vanos.length > 2) {
    const promedio = vanos.reduce((s, p) => s + p.vanoAnterior_m, 0) / vanos.length;
    for (const p of vanos) {
      const razon = p.vanoAnterior_m / promedio;
      if (razon > 2) {
        h.push({
          severidad: 'aviso',
          titulo: `Vano de ${p.vanoAnterior_m.toFixed(1)} m (${razon.toFixed(1)}× el promedio) llegando a ${p.nombre}`,
          detalle: `Muy por encima del promedio de ${promedio.toFixed(1)} m: puede ser un vano real largo (gobierna la flecha) o una estructura intermedia no capturada. Verificar en campo.`,
        });
      } else if (razon < 0.2) {
        h.push({
          severidad: 'info',
          titulo: `Vano de ${p.vanoAnterior_m.toFixed(1)} m (${(razon * 100).toFixed(0)} % del promedio) llegando a ${p.nombre}`,
          detalle: 'Un vano muy corto entre estructuras es atípico; suele delatar un cruce, una derivación o un punto doble.',
        });
      }
    }
  }

  // ── 4 · Altimetría: la precisión declarada decide qué se puede firmar ─────
  const precisiones = E.map((p) => p.precision_m).filter((x) => x != null);
  if (precisiones.length && Math.max(...precisiones) >= 5) {
    h.push({
      severidad: 'atencion',
      titulo: `Cotas GPS con precisión declarada de ±${Math.max(...precisiones)} m — NO usar para flecha ni distancias de seguridad`,
      detalle: 'El error vertical del GPS de mano es del mismo orden que el gálibo a demostrar. Las cotas sirven de referencia, no de evidencia (docs/40 §8).',
    });
  }

  // ── 5 · Completitud del dato ─────────────────────────────────────────────
  const sinHora = P.filter((p) => !p.local).length;
  const sinCota = P.filter((p) => p.cota_m == null).length;
  if (sinHora || sinCota) {
    h.push({
      severidad: 'info',
      titulo: `Datos incompletos: ${sinHora} punto(s) sin hora de toma · ${sinCota} sin cota`,
      detalle: 'No bloquea la geometría, pero resta trazabilidad al levantamiento.',
    });
  }

  // ── 6 · Trazabilidad del renombrado ──────────────────────────────────────
  const renombrados = P.filter((p) => p.nombre !== p.nombreCampo).length;
  if (renombrados) {
    h.push({
      severidad: 'info',
      titulo: `${renombrados} punto(s) con nombre canónico distinto al del GPS`,
      detalle: 'El nombre de campo se conserva tal cual quedó grabado; el canónico es el que sale en informes. La correspondencia viaja en cada exporte.',
    });
  }

  const orden = { atencion: 0, aviso: 1, info: 2 };
  return h.sort((a, b) => orden[a.severidad] - orden[b.severidad]);
}
