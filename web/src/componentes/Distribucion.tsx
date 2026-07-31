// ============================================================================
// componentes/Distribucion.tsx — "Distribución de vanos", como en el módulo
// de campo original: seis tarjetas, las notas, y el gráfico de barras con la
// línea vertical blanca marcando el promedio.
// ----------------------------------------------------------------------------
// Aquí no hay ni una fórmula: los números vienen de @lineas/nucleo/estadisticas,
// que está probado contra el panel original dígito a dígito.
// ============================================================================
import { useMemo } from 'react';
import type { Apoyo } from '@lineas/contratos';
import { estadisticasVanos } from '@lineas/nucleo/estadisticas';
import { vanos, soloEstructuras, nombreVisible } from '../vistas/planta';
import { Sello } from './Sello';

const nf = (v: number, d = 2) =>
  v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });

export function Distribucion({ apoyos }: { apoyos: Apoyo[] }) {
  const datos = useMemo(() => {
    const estructuras = soloEstructuras(apoyos);
    const excluidos = apoyos.length - estructuras.length;
    const L = vanos(apoyos);
    const e = estadisticasVanos(L);
    if (!e) return null;
    return { estructuras, excluidos, L, e };
  }, [apoyos]);

  if (!datos) return null;
  const { estructuras, excluidos, L, e } = datos;

  const desde = (i: number) => nombreVisible(estructuras[i]);
  const hasta = (i: number) => nombreVisible(estructuras[i + 1]);
  const posPromedio = (e.promedio / e.maximo) * 100;

  return (
    <section className="panel">
      <h2>Distribución de vanos</h2>
      <Sello origen="estadística de muestra (n−1) sobre los vanos reales entre estructuras" />

      <div className="dist-kpis">
        <div className="kpi"><div className="kpi-v rojo">{nf(e.maximo)}</div><div className="kpi-l">vano máximo (m)</div></div>
        <div className="kpi"><div className="kpi-v">{nf(e.promedio)}</div><div className="kpi-l">vano promedio (m)</div></div>
        <div className="kpi"><div className="kpi-v azul">{nf(e.minimo)}</div><div className="kpi-l">vano mínimo (m)</div></div>
        <div className="kpi"><div className="kpi-v neutro">{nf(e.mediana)}</div><div className="kpi-l">mediana (m)</div></div>
        <div className="kpi"><div className="kpi-v neutro">{nf(e.desviacionEstandar)}</div><div className="kpi-l">desv. estándar (m)</div></div>
        <div className="kpi"><div className="kpi-v neutro">{nf(e.coeficienteVariacion_pct, 1)} %</div><div className="kpi-l">coef. variación</div></div>
      </div>

      <p className="dist-nota">
        Calculado sobre <b>{estructuras.length} estructuras</b> ({e.n} vanos)
        {excluidos > 0 && <>; se {excluidos === 1 ? 'excluyó' : 'excluyeron'} <b>{excluidos} punto{excluidos === 1 ? '' : 's'}</b> marcado{excluidos === 1 ? '' : 's'} como empalme o referencia, que no son apoyos</>}.
      </p>
      <p className="dist-nota">
        Máximo entre <b className="rojo">{desde(e.indiceMaximo)} → {hasta(e.indiceMaximo)}</b> ·
        mínimo entre <b className="azul">{desde(e.indiceMinimo)} → {hasta(e.indiceMinimo)}</b>.
        Relación máx/mín = {nf(e.relacionMaxMin, 1)}×. La línea vertical blanca marca el promedio.
      </p>

      <div className="dist-barras" role="img"
        aria-label={`Longitud de cada uno de los ${e.n} vanos; promedio ${nf(e.promedio)} metros`}>
        {L.map((v, i) => (
          <div className="barra-fila" key={estructuras[i].id}>
            <span className="barra-nombre">{desde(i)} →</span>
            <span className="barra-pista">
              <span className="barra-valor" style={{ width: `${(v / e.maximo) * 100}%` }} />
              <span className="barra-promedio" style={{ left: `${posPromedio}%` }} />
            </span>
            <span className="barra-cifra">{nf(v, 1)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
