// ============================================================================
// exportar/procedencia.js — el bloque que hace DEFENDIBLE cada archivo
// ----------------------------------------------------------------------------
// Regla del proyecto (§3.1): todo resultado guardado lleva con qué versión del
// motor y con qué hipótesis se produjo. Dos exportes de la misma línea en
// fechas distintas deben poder distinguirse y reproducirse. Este módulo
// produce ese bloque UNA vez y los tres formatos lo incluyen.
//
// No inventa: lo que no venga en los datos, no se escribe.
// ============================================================================
import { VERSION_EXPORTADOR } from './version.js';

/**
 * @param {{ codigo: string, nombre?: string, tensionNominal_kV?: number,
 *           propietario?: string, id?: string, revision?: number }} linea
 * @param {ReturnType<import('./levantamiento.js').derivarLevantamiento>} lev
 * @param {{ generadoEn?: string, generadoPor?: string, hipotesisNombre?: string }} [meta]
 *   `generadoEn` lo pasa la capa que llama (ISO con zona): los generadores son
 *   puros y no miran el reloj.
 * @returns {string[]} renglones del bloque de procedencia, listos para cada formato
 */
export function bloqueProcedencia(linea, lev, meta = {}) {
  const r = [];

  const cab = [`Línea ${linea.codigo}`];
  if (linea.nombre && linea.nombre !== linea.codigo) cab.push(linea.nombre);
  if (linea.tensionNominal_kV != null) cab.push(`${linea.tensionNominal_kV} kV`);
  if (linea.propietario) cab.push(linea.propietario);
  r.push(cab.join(' · '));

  r.push(
    `Levantamiento: ${lev.nEstructuras} estructuras + ${lev.nEmpalmes} empalmes` +
    ` · ${Math.max(0, lev.nEstructuras - 1)} vanos reales` +
    ` · ${lev.tramos.length} tramos de tensión` +
    ` · ${lev.longitud_m.toFixed(2)} m de línea`,
  );

  // Sistema de referencia, método y precisión: lo que decide si una cifra es
  // firmable. Se agregan los valores DISTINTOS presentes en los datos.
  const unicos = (xs) => [...new Set(xs.filter((x) => x != null))];
  const sistemas = unicos(lev.puntos.map((p) => p.sistemaReferencia));
  const metodos = unicos(lev.puntos.map((p) => p.metodo));
  const precisiones = unicos(lev.puntos.map((p) => p.precision_m));
  const partes = [];
  if (sistemas.length) partes.push(`sistema de referencia ${sistemas.join(' / ')}`);
  if (metodos.length) partes.push(`método ${metodos.join(' / ')}`);
  if (precisiones.length) {
    partes.push(`precisión declarada ±${Math.max(...precisiones)} m` +
      ' — cotas GPS referenciales, NO aptas para verificar distancias de seguridad');
  }
  if (partes.length) r.push(partes.join(' · ').replace(/^./, (c) => c.toUpperCase()));

  if (meta.hipotesisNombre) r.push(`Hipótesis de cálculo: ${meta.hipotesisNombre}`);

  const gen = [`Exportador @lineas/exportar v${VERSION_EXPORTADOR}`,
    'generado desde los datos del sistema, no desde la pantalla (ADR-005/006)'];
  if (meta.generadoEn) gen.unshift(`Generado ${meta.generadoEn}`);
  if (meta.generadoPor) gen.push(`por ${meta.generadoPor}`);
  r.push(gen.join(' · '));

  return r;
}
