// ============================================================================
// componentes/Linea.tsx — las pantallas de una línea
// ----------------------------------------------------------------------------
// Aquí NO hay ni una fórmula. Todo el cálculo se le pide a `@lineas/nucleo`, que
// son funciones puras sin DOM ni red. Esa frontera es lo que permite auditar la
// ingeniería sin leer código de interfaz, y lo que hace que subir de versión
// React no pueda alterar un número en silencio.
// ============================================================================
import { useMemo } from 'react';
import type { Apoyo, Conductor, Hipotesis, Linea as TLinea } from '@lineas/contratos';
import { vanoIdealRegulacion } from '@lineas/nucleo/geodesia';
import { ampacidad, temperaturaLimite } from '@lineas/nucleo/termica';
import { proyectar, vanos, geometriaSvg } from '../vistas/planta';
import { calcularTramos } from '../vistas/tramos';

const nf = (v: number, d = 0) =>
  v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });

function Kpi({ valor, etiqueta, sub }: { valor: string; etiqueta: string; sub?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-v">{valor}</div>
      <div className="kpi-l">{etiqueta}</div>
      {sub && <div className="kpi-s">{sub}</div>}
    </div>
  );
}

function Planta({ apoyos }: { apoyos: Apoyo[] }) {
  const g = useMemo(() => geometriaSvg(apoyos), [apoyos]);
  if (!g) return null;

  return (
    <section className="panel">
      <h2>Vista en planta</h2>
      <div className="mapa">
        <svg viewBox={`0 0 ${g.ancho} ${g.alto}`} role="img" aria-label="Vista en planta de la línea, norte arriba">
          <polyline points={g.traza} className="traza" />
          {g.marcas.map((m) => (
            m.forma === 'cuadro'
              ? <rect key={m.id} x={m.x - 4} y={m.y - 4} width="8" height="8" className="ap-terminal"><title>{m.titulo}</title></rect>
              : <circle key={m.id} cx={m.x} cy={m.y} r={m.r} className={m.clase}><title>{m.titulo}</title></circle>
          ))}
          {g.etiquetas.map((e) => (
            <text key={e.id} x={e.x} y={e.y} className="ap-lbl">{e.texto}</text>
          ))}
          <g className="norte">
            <line x1={g.ancho - 30} y1={42} x2={g.ancho - 30} y2={20} />
            <text x={g.ancho - 26} y={26}>N</text>
          </g>
        </svg>
      </div>
      <p className="leyenda">
        <span className="li ancla" /> anclaje
        <span className="li susp" /> suspensión
        <span className="li term" /> terminal
        <span className="fine">— pase el cursor sobre un apoyo para ver su función y deflexión</span>
      </p>
    </section>
  );
}

function TablaTramos({ apoyos, conductor, hipotesis }: { apoyos: Apoyo[]; conductor: Conductor; hipotesis: Hipotesis }) {
  const filas = useMemo(() => calcularTramos(apoyos, conductor, hipotesis), [apoyos, conductor, hipotesis]);
  if (!filas.length) return null;

  const excedidos = filas.filter((f) => f.excede);

  return (
    <section className="panel">
      <h2>Cálculo mecánico por tramo</h2>
      {/* La tabla NO se virtualiza mientras quepa entera: un informe se genera
          desde los datos, nunca imprimiendo la pantalla (ADR-005). */}
      <div className="tabla-caja">
        <table className="tabla">
          <caption>
            Estados mecánicos por tramo · conductor {conductor.material} {conductor.codigo} ·
            RTS {nf(conductor.rts_kgf)} kgf · EDS {hipotesis.eds_pct} % a {hipotesis.tempEds_C} °C
          </caption>
          <thead>
            <tr>
              <th>#</th><th>Tramo</th><th>Vanos</th><th>Vano máx (m)</th><th>VIR (m)</th>
              <th>EDS</th><th>{hipotesis.tempMax_C} °C</th><th>Viento</th><th>{hipotesis.tempMin_C} °C</th>
              <th>% RTS</th><th>Flecha (m)</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.n} className={f.excede ? 'excede' : undefined}>
                <td className="num">{f.n}</td>
                <td>{f.desde} → {f.hasta}</td>
                <td className="num">{f.nVanos}</td>
                <td className="num">{nf(f.vanoMax, 1)}</td>
                <td className="num">{nf(f.vir, 1)}</td>
                <td className="num">{nf(f.hEds)}</td>
                <td className="num">{nf(f.hTMax)}</td>
                <td className="num">{nf(f.hViento)}</td>
                <td className="num">{nf(f.hTMin)}</td>
                <td className="num destaca">{nf(f.pctRts, 1)} %</td>
                <td className="num">{nf(f.flechaMax, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {excedidos.length ? (
        <p className="alerta"><b>Atención:</b> {excedidos.length} tramo(s) superan el umbral adoptado: {excedidos.map((f) => f.n).join(', ')}.</p>
      ) : (
        <p className="ok">Ningún tramo supera el umbral adoptado. El máximo es {nf(Math.max(...filas.map((f) => f.pctRts)), 1)} %.</p>
      )}

      <p className="fine">
        Tiros en kgf. La flecha es la del vano más largo del tramo, por catenaria exacta, con el tiro
        del estado de {hipotesis.tempMax_C} °C. El vano ideal de regulación es √(Σa³/Σa) del tramo:
        por eso cada tramo se calcula con el suyo y nunca con uno único para toda la línea.
      </p>
      <p className="advertencia">
        <b>Este cálculo no es un dictamen firmable.</b> El umbral de aceptación, las hipótesis
        climáticas y la distancia mínima al terreno están pendientes de cerrarse contra norma y contra
        la ficha del proveedor real del conductor.
      </p>
    </section>
  );
}

export function VistaLinea({ linea, apoyos, conductor, hipotesis }:
  { linea: TLinea; apoyos: Apoyo[]; conductor: Conductor; hipotesis: Hipotesis }) {

  const resumen = useMemo(() => {
    const L = vanos(apoyos);
    const longitud = L.reduce((s, v) => s + v, 0);
    return {
      L, longitud,
      vir: vanoIdealRegulacion(L) ?? 0,
      tramos: calcularTramos(apoyos, conductor, hipotesis).length,
      anclas: proyectar(apoyos).filter((p) => p.esAncla).length,
      amp: ampacidad(
        { material: conductor.material, seccion: conductor.seccion_mm2, diametro: conductor.diametro_m },
        temperaturaLimite(conductor.material), 32,
        { v: 0.61, eps: 0.5, abso: 0.5, qs: 1000, he: 10 },
      ),
    };
  }, [apoyos, conductor, hipotesis]);

  return (
    <>
      <section className="panel">
        <h2>{linea.codigo} · {linea.nombre} — {nf(linea.tensionNominal_kV)} kV</h2>
        <div className="kpis">
          <Kpi valor={nf(apoyos.length)} etiqueta="apoyos" />
          <Kpi valor={`${nf(resumen.longitud / 1000, 3)} km`} etiqueta="longitud" />
          <Kpi valor={nf(resumen.L.length)} etiqueta="vanos" sub={`medio ${nf(resumen.longitud / resumen.L.length, 1)} m`} />
          <Kpi valor={`${nf(resumen.vir, 1)} m`} etiqueta="VIR de la línea" sub="pero se calcula por tramo" />
          <Kpi valor={nf(resumen.tramos)} etiqueta="tramos de tensión" sub={`${resumen.anclas} anclajes`} />
          <Kpi valor={`${nf(resumen.amp)} A`} etiqueta="ampacidad IEEE 738" sub={`${temperaturaLimite(conductor.material)} °C · 32 °C amb.`} />
        </div>
      </section>

      <Planta apoyos={apoyos} />
      <TablaTramos apoyos={apoyos} conductor={conductor} hipotesis={hipotesis} />
    </>
  );
}
