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
import { Sello } from './Sello';

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

  // ── El desnivel y su precisión, SIN rellenar huecos ───────────────────────
  // El desnivel solo existe si las DOS estructuras traen cota. Y la precisión
  // que se publica es la PEOR de las dos, porque el desnivel arrastra el error
  // de ambos extremos: publicar la del origen sería declarar una exactitud que
  // el otro extremo no sostiene (`99 §ADR-091`).
  const cotaA = E[ia].coordenada.cotaTerreno_m;
  const cotaB = E[ib].coordenada.cotaTerreno_m;
  const desnivel = cotaA == null || cotaB == null ? null : Math.abs(cotaB - cotaA);
  const sinCota = [
    cotaA == null ? nombreVisible(E[ia]) : null,
    cotaB == null ? nombreVisible(E[ib]) : null,
  ].filter(Boolean) as string[];
  const precisiones = [E[ia].coordenada.precision_m, E[ib].coordenada.precision_m];
  const peorPrecision = precisiones.some((v) => v == null)
    ? null : Math.max(...(precisiones as number[]));

  // Tono de la celda: más oscuro cuanto más lejos. Solo presentación.
  // El color sale del tablero (--calor-rgb), no de un ámbar escrito aquí: si
  // se escribe a mano, el día que cambie la paleta esta matriz se queda sola.
  const tono = (d: number) => d === 0 ? undefined
    : { background: `rgba(var(--calor-rgb), ${(0.06 + 0.30 * (d / max)).toFixed(3)})` };

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
          {/* ⚠️ NI UN `?? 0` AQUÍ. Los tenía los dos, y los dos mentían en el
              sentido tranquilizador: sin cota, ponía la estructura al nivel del
              mar y publicaba un desnivel que nadie midió; sin precisión,
              imprimía «± 0 m», que en topografía es la firma de un levantamiento
              exacto. Este pantallazo se pega en un correo para pedir una grúa
              (`99 §ADR-091`). El hueco se DICE, y la precisión que se publica es
              la PEOR de los dos extremos, porque el desnivel arrastra el error
              de ambos. */}
          <div className="kpi"><div className="kpi-v">{desnivel == null ? '—' : `${nf(desnivel, 1)} m`}</div>
            <div className="kpi-l">desnivel GPS</div>
            <div className="kpi-s">{desnivel == null
              ? `falta la cota de ${sinCota.join(' y ')}`
              : peorPrecision == null
                ? 'precisión no declarada — no firmable'
                : `± ${nf(peorPrecision)} m de precisión — no firmable`}</div></div>
        </div>
        <p className="fine">
          El recorrido por la línea suma los vanos entre las dos estructuras. El desnivel sale de la
          cota del GPS de mano: sirve para orientarse, no para verificar despejes (docs/40 §8).
        </p>
      </section>

      <section className="panel">
        <h2>Matriz de distancias directas (m)</h2>
        <Sello origen="geodesia Vincenty sobre WGS84 · levantamiento GPS de mano" />
        <div className="matriz-caja" tabIndex={0} role="region" aria-label="Matriz de distancias, desplazable">
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
