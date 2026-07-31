// ============================================================================
// componentes/Distancias.tsx — calculadora de distancias y matriz directa
// ----------------------------------------------------------------------------
// Réplica de la pestaña "Distancias" del módulo de campo original: dos
// selectores con inversión, resultados (directa, por la línea, azimut y rumbo)
// y la matriz completa de distancias directas entre estructuras.
//
// Toda la geodesia se le pide a @lineas/nucleo. Aquí no hay una sola fórmula.
// ============================================================================
import { useMemo, useState } from 'react';
import type { Apoyo } from '@lineas/contratos';
import { vincenty, rumbo } from '@lineas/nucleo/geodesia';
import { soloEstructuras, nombreVisible, vanos } from '../vistas/planta';
import { nf } from '../vistas/formato';

export function Distancias({ apoyos }: { apoyos: Apoyo[] }) {
  const datos = useMemo(() => {
    const E = soloEstructuras([...apoyos].sort((x, y) => x.orden - y.orden));
    const L = vanos(apoyos);
    // Progresiva acumulada por estructura: distancia recorrida POR la línea.
    const prog: number[] = [0];
    for (let i = 0; i < L.length; i++) prog.push(prog[i] + L[i]);
    // Matriz completa de distancias directas. 24×24 = 276 pares únicos:
    // se calcula una vez y se refleja (la distancia es simétrica, probado).
    const n = E.length;
    const M: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    let max = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = vincenty(E[i].coordenada.lat, E[i].coordenada.lon,
                           E[j].coordenada.lat, E[j].coordenada.lon).d;
        M[i][j] = d; M[j][i] = d;
        if (d > max) max = d;
      }
    }
    return { E, prog, M, max };
  }, [apoyos]);

  const { E, prog, M, max } = datos;
  const [ia, setIa] = useState(0);
  const [ib, setIb] = useState(E.length - 1);

  if (E.length < 2) return null;

  const r = vincenty(E[ia].coordenada.lat, E[ia].coordenada.lon,
                     E[ib].coordenada.lat, E[ib].coordenada.lon);
  const porLinea = Math.abs(prog[ib] - prog[ia]);
  const rodeo = r.d > 0 ? porLinea / r.d : 1;

  // Tono de la celda: más oscuro cuanto más lejos. Solo presentación.
  const tono = (d: number) => d === 0 ? undefined
    : { background: `rgba(240,165,0,${0.06 + 0.30 * (d / max)})` };

  return (
    <>
      <section className="panel">
        <h2>Calculadora de distancias</h2>
        <div className="calc-fila">
          <label className="calc-campo">
            <span>Desde</span>
            <select value={ia} onChange={(e) => setIa(+e.target.value)}>
              {E.map((a, i) => <option key={a.id} value={i}>{nombreVisible(a)}</option>)}
            </select>
          </label>
          <button className="boton chico" title="Invertir extremos"
            onClick={() => { setIa(ib); setIb(ia); }}>⇅ Invertir</button>
          <label className="calc-campo">
            <span>Hasta</span>
            <select value={ib} onChange={(e) => setIb(+e.target.value)}>
              {E.map((a, i) => <option key={a.id} value={i}>{nombreVisible(a)}</option>)}
            </select>
          </label>
        </div>

        <div className="kpis">
          <div className="kpi"><div className="kpi-v">{nf(r.d, 1)} m</div><div className="kpi-l">distancia directa</div></div>
          <div className="kpi"><div className="kpi-v">{nf(porLinea, 1)} m</div><div className="kpi-l">recorrido por la línea</div>
            <div className="kpi-s">{ia === ib ? '—' : `rodeo ×${nf(rodeo, 2)}`}</div></div>
          <div className="kpi"><div className="kpi-v">{ia === ib ? '—' : `${nf(r.az, 1)}°`}</div><div className="kpi-l">azimut</div>
            <div className="kpi-s">{ia === ib ? '' : `rumbo ${rumbo(r.az)}`}</div></div>
          <div className="kpi"><div className="kpi-v">{nf(Math.abs((E[ib].coordenada.cotaTerreno_m ?? 0) - (E[ia].coordenada.cotaTerreno_m ?? 0)), 1)} m</div>
            <div className="kpi-l">desnivel GPS</div>
            <div className="kpi-s">± {nf(E[ia].coordenada.precision_m ?? 0)} m de precisión — no firmable</div></div>
        </div>
        <p className="fine">
          El recorrido por la línea suma los vanos entre las dos estructuras. El desnivel sale de la
          cota del GPS de mano: sirve para orientarse, no para verificar despejes (docs/40 §8).
        </p>
      </section>

      <section className="panel">
        <h2>Matriz de distancias directas (m)</h2>
        <div className="matriz-caja">
          <table className="matriz">
            <thead>
              <tr>
                <th className="pegado"> </th>
                {E.map((a) => <th key={a.id}>{nombreVisible(a).replace('LN-627 ', '')}</th>)}
              </tr>
            </thead>
            <tbody>
              {E.map((a, i) => (
                <tr key={a.id}>
                  <th className="pegado">{nombreVisible(a).replace('LN-627 ', '')}</th>
                  {E.map((b, j) => (
                    <td key={b.id}
                        className={(i === ia && j === ib) || (i === ib && j === ia) ? 'celda-sel' : undefined}
                        style={tono(M[i][j])}
                        title={`${nombreVisible(a)} → ${nombreVisible(b)}: ${nf(M[i][j], 1)} m`}
                        onClick={() => { if (i !== j) { setIa(i); setIb(j); } }}>
                      {i === j ? '—' : nf(M[i][j])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fine">
          Distancias geodésicas directas (Vincenty sobre WGS84), en metros. Clic en una celda para
          llevarla a la calculadora. Solo estructuras: los empalmes no son apoyos.
        </p>
      </section>
    </>
  );
}
