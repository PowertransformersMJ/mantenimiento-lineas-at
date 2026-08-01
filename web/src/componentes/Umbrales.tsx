// ============================================================================
// componentes/Umbrales.tsx — la tabla de criterios con semáforo
// ----------------------------------------------------------------------------
// Es la pieza que hace que el sistema DIGA LO MISMO que el módulo de campo del
// que salió: cada indicador con su valor, su umbral, su estado y —sobre todo—
// SU FUENTE. Un semáforo sin fuente es una opinión con colores.
//
// Tres estados y ninguno se llama "incumple": el sistema señala, dictamina
// quien firma. `no_evaluable` no es un hueco de la aplicación, es un hecho
// sobre los datos — y se muestra con la misma dignidad que los demás.
//
// Aquí no hay ni una fórmula: todo lo calcula nucleo/umbrales.js.
// ============================================================================
import { useMemo } from 'react';
import type { Apoyo, Conductor, Hipotesis } from '@lineas/contratos';
import { evaluarUmbrales } from '@lineas/nucleo/umbrales';
import { tramosDeTension, estadosDelTramo } from '@lineas/nucleo/mecanica';
import { estadisticasVanos } from '@lineas/nucleo/estadisticas';
import { conductorParaNucleo, paramsParaNucleo } from '../vistas/tramos';
import { vanos, soloEstructuras, nombreVisible } from '../vistas/planta';
import { nf, textoNucleo } from '../vistas/formato';
import { Sello } from './Sello';

interface Indicador {
  id: string; etiqueta: string;
  valor: number | null; unidad: string;
  umbral: number | number[] | null; comparador: string;
  estado: 'cumple' | 'revisar' | 'no_evaluable';
  criterio: string; fuente: string;
}

const ROTULO: Record<string, string> = {
  cumple: 'cumple',
  revisar: 'revisar',
  no_evaluable: 'no evaluable',
};

const umbralTexto = (u: Indicador['umbral'], comp: string): string => {
  if (u == null) return '—';
  if (Array.isArray(u)) return `${nf(u[0], 1)} – ${nf(u[1], 1)}`;
  return `${comp === '<=' ? '≤ ' : comp === '>=' ? '≥ ' : ''}${nf(u, 1)}`;
};

export function Umbrales({ apoyos, conductor, hipotesis }:
  { apoyos: Apoyo[]; conductor: Conductor; hipotesis: Hipotesis }) {

  const indicadores = useMemo<Indicador[]>(() => {
    const E = soloEstructuras(apoyos);
    if (E.length < 2) return [];
    const L = vanos(apoyos);
    const c = conductorParaNucleo(conductor);
    const p = paramsParaNucleo(hipotesis);

    // Cada tramo con sus estados, que es lo que el evaluador necesita.
    const tramos = tramosDeTension(
      E.map((a) => ({ funcionEstructural: a.funcionEstructural, nombre: nombreVisible(a) })), L,
    ).map((t: { vanos: number[]; vir: number }) => ({
      ...t, estados: estadosDelTramo(t, c, p),
    }));

    return evaluarUmbrales({
      tramos, conductor: c, hipotesis, estadisticas: estadisticasVanos(L) ?? undefined, apoyos,
    }) as Indicador[];
  }, [apoyos, conductor, hipotesis]);

  if (!indicadores.length) return null;

  const cuenta = (e: Indicador['estado']) => indicadores.filter((i) => i.estado === e).length;

  return (
    <section className="panel">
      <h2>Umbrales y criterios de evaluación</h2>
      <p className="fine">
        <b>{nf(cuenta('cumple'))}</b> cumplen · <b>{nf(cuenta('revisar'))}</b> a revisar ·{' '}
        <b>{nf(cuenta('no_evaluable'))}</b> no evaluables con los datos de hoy. Cada criterio
        declara su fuente: lo que no viene de una norma se dice con esas palabras.
      </p>
      <Sello hipotesis={hipotesis} conductor={conductor} />

      <div className="tabla-caja">
        <table className="tabla">
          <caption>
            Estado de la línea frente a los criterios adoptados. «No evaluable» no es un fallo de la
            aplicación: es un hecho sobre los datos disponibles.
          </caption>
          <thead>
            <tr>
              <th>Indicador</th><th>Valor</th><th>Umbral</th>
              <th>Estado</th><th>Criterio y fuente</th>
            </tr>
          </thead>
          <tbody>
            {indicadores.map((i) => (
              <tr key={i.id} className={i.estado === 'revisar' ? 'excede' : undefined}>
                <td><b>{i.etiqueta}</b></td>
                <td className="num">
                  {i.valor == null ? '—' : `${nf(i.valor, 1)}${i.unidad ? ' ' + i.unidad : ''}`}
                </td>
                <td className="num">{umbralTexto(i.umbral, i.comparador)}</td>
                <td>
                  <span className={`sello ${i.estado === 'cumple' ? 'verde'
                    : i.estado === 'revisar' ? 'ambar' : 'gris'}`}>
                    {ROTULO[i.estado]}
                  </span>
                </td>
                <td className="umbral-criterio">
                  {/* El núcleo escribe con punto decimal por determinismo; en
                      es-CO el punto es separador de MILES. Se corrige al pintar. */}
                  {textoNucleo(i.criterio)}
                  <span className="umbral-fuente">{i.fuente}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
