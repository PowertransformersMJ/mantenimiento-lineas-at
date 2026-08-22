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
// ⚠️ La lista de orígenes NO vive aquí. Vivió, con cinco entradas de las que dos
// (`medido`, `calculado`) no existen en el contrato y cuatro de las reales
// faltaban: este sello imprimía `documento_proyecto` en crudo al pie de una
// tabla firmable. El dueño único es `vistas/fichaEstructural.ts` (`34 · L-65`).
import { selloDeOrigen } from '../vistas/fichaEstructural';

/**
 * @param origen  de dónde salen los datos de ENTRADA (no el cálculo).
 *                Ej.: «levantamiento GPS de mano, ±8 m».
 */
export function Sello({ hipotesis, conductor, origen }:
  { hipotesis?: Hipotesis; conductor?: Conductor; origen?: string }) {

  const partes = [`Motor @lineas/nucleo v${nucleoPkg.version}`];
  if (hipotesis) partes.push(`hipótesis «${hipotesis.nombre}» (${selloDeOrigen(hipotesis.procedencia)})`);
  if (conductor) partes.push(`conductor: ${selloDeOrigen(conductor.procedencia)}`);
  if (origen) partes.push(origen);

  return <span className="sello-calculo">{partes.join(' · ')}</span>;
}
