// ============================================================================
// componentes/Sello.tsx — el sello de trazabilidad de un resultado calculado
// ----------------------------------------------------------------------------
// La frase que gobierna el producto —«el trabajo del sistema es hacer barato
// comprobar que el ingeniero tiene razón»— exige que CADA número que se muestre
// pueda decir con qué se produjo. Este sello lo dice, y va en TODA vista con
// resultados calculados, no solo en una.
//
// Regla del proyecto §3.1: todo resultado guardado (o mostrado) lleva con qué
// versión del motor y con qué hipótesis se produjo.
// ============================================================================
import nucleoPkg from '@lineas/nucleo/package.json';
import type { Conductor, Hipotesis } from '@lineas/contratos';

const ETIQUETA_PROCEDENCIA: Record<string, string> = {
  catalogo_fabricante: 'catálogo — pendiente ficha del proveedor',
  confirmado_humano: 'confirmado por el Ingeniero',
  supuesto: 'supuesto, sin validar',
  medido: 'medido en campo',
  calculado: 'calculado por el sistema',
};

const etiqueta = (p?: string) => (p ? ETIQUETA_PROCEDENCIA[p] ?? p : null);

/**
 * @param origen  de dónde salen los datos de ENTRADA (no el cálculo).
 *                Ej.: «levantamiento GPS de mano, ±8 m».
 */
export function Sello({ hipotesis, conductor, origen }:
  { hipotesis?: Hipotesis; conductor?: Conductor; origen?: string }) {

  const partes = [`Motor @lineas/nucleo v${nucleoPkg.version}`];
  if (hipotesis) partes.push(`hipótesis «${hipotesis.nombre}» (${etiqueta(hipotesis.procedencia) ?? hipotesis.procedencia})`);
  if (conductor) partes.push(`conductor: ${etiqueta(conductor.procedencia) ?? conductor.procedencia}`);
  if (origen) partes.push(origen);

  return <span className="sello-calculo">{partes.join(' · ')}</span>;
}
