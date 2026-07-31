// ============================================================================
// componentes/Linea.tsx — las pantallas de una línea, con pestañas
// ----------------------------------------------------------------------------
// Réplica de la organización del módulo de campo original: pestañas arriba,
// RESUMEN con el mapa a la izquierda y las tarjetas a la derecha, MECÁNICO con
// la tabla de tramos. Las pestañas aún no construidas están deshabilitadas y lo
// dicen — no fingen contenido.
//
// Aquí NO hay ni una fórmula. Todo el cálculo se le pide a @lineas/nucleo.
// ============================================================================
import { Component, Suspense, lazy, useMemo, useState, type ReactNode } from 'react';
import type { Apoyo, Conductor, Hipotesis, Linea as TLinea } from '@lineas/contratos';
import { vincenty, vanoIdealRegulacion } from '@lineas/nucleo/geodesia';
import { ampacidad, temperaturaLimite } from '@lineas/nucleo/termica';
import { estadisticasVanos } from '@lineas/nucleo/estadisticas';
import { proyectar, vanos, geometriaSvg, soloEstructuras } from '../vistas/planta';
import { calcularTramos } from '../vistas/tramos';
import { conReintentos } from '../datos/cargar';
import { Distribucion } from './Distribucion';
import { Distancias } from './Distancias';
import { Fichas } from './Fichas';
import { Exportar } from './Exportar';

const nf = (v: number, d = 0) =>
  v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });

// El mapa pesa (MapLibre ≈ 230 kB comprimido) y es OPCIONAL: va en su propio
// trozo, con reintentos, y si aun así falla se cae al esquema SVG.
const Mapa = lazy(() => conReintentos(() => import('./Mapa')));

function Kpi({ valor, etiqueta, sub, tono }: { valor: string; etiqueta: string; sub?: string; tono?: string }) {
  return (
    <div className="kpi">
      <div className={'kpi-v' + (tono ? ' ' + tono : '')}>{valor}</div>
      <div className="kpi-l">{etiqueta}</div>
      {sub && <div className="kpi-s">{sub}</div>}
    </div>
  );
}

// ── Esquema SVG: es el respaldo del mapa y la vista imprimible ──────────────

function PlantaSvg({ apoyos, nota }: { apoyos: Apoyo[]; nota?: string }) {
  const g = useMemo(() => geometriaSvg(apoyos), [apoyos]);
  if (!g) return null;
  return (
    <div className="mapa">
      {nota && <p className="fine">{nota}</p>}
      <svg viewBox={`0 0 ${g.ancho} ${g.alto}`} role="img" aria-label="Esquema en planta de la línea, norte arriba">
        <polyline points={g.traza} className="traza" />
        {g.marcas.map((m) => (
          m.forma === 'cuadro'
            ? <rect key={m.id} x={m.x - 4} y={m.y - 4} width="8" height="8" className="ap-terminal"><title>{m.titulo}</title></rect>
            : <circle key={m.id} cx={m.x} cy={m.y} r={m.r} className={m.clase}><title>{m.titulo}</title></circle>
        ))}
        {g.etiquetas.map((e) => <text key={e.id} x={e.x} y={e.y} className="ap-lbl">{e.texto}</text>)}
        <g className="norte">
          <line x1={g.ancho - 30} y1={42} x2={g.ancho - 30} y2={20} />
          <text x={g.ancho - 26} y={26}>N</text>
        </g>
      </svg>
    </div>
  );
}

/** Si el trozo del mapa no llega (señal mala, bloqueo), el esquema SVG responde. */
class RespaldoMapa extends Component<{ apoyos: Apoyo[]; children: ReactNode }, { fallo: boolean }> {
  state = { fallo: false };
  static getDerivedStateFromError() { return { fallo: true }; }
  render() {
    if (this.state.fallo) {
      return <PlantaSvg apoyos={this.props.apoyos}
        nota="El mapa no se pudo descargar; se muestra el esquema geométrico (funciona sin conexión)." />;
    }
    return this.props.children;
  }
}

// ── Pestañas, como el módulo original ───────────────────────────────────────

const PESTANAS = [
  { id: 'resumen', rotulo: 'Resumen', lista: true },
  { id: 'distancias', rotulo: 'Distancias', lista: true },
  { id: 'fichas', rotulo: 'Fichas', lista: true },
  { id: 'falla', rotulo: 'Falla', lista: false, roja: true },
  { id: 'fundamentos', rotulo: 'Fundamentos', lista: false },
  { id: 'mecanico', rotulo: 'Mecánico', lista: true },
  { id: 'cantidades', rotulo: 'Cantidades', lista: false },
  { id: 'exportar', rotulo: 'Exportar', lista: true },
] as const;

type IdPestana = (typeof PESTANAS)[number]['id'];

// ── Pestaña RESUMEN: mapa + tarjetas como la pantalla del módulo original ───

function Resumen({ apoyos }: { apoyos: Apoyo[] }) {
  const r = useMemo(() => {
    const E = soloEstructuras(apoyos);
    const L = vanos(apoyos);
    const e = estadisticasVanos(L);
    const directa = E.length >= 2
      ? vincenty(E[0].coordenada.lat, E[0].coordenada.lon,
                 E[E.length - 1].coordenada.lat, E[E.length - 1].coordenada.lon).d
      : 0;
    return { E, L, e, directa, empalmes: apoyos.length - E.length };
  }, [apoyos]);

  if (!r.e) return null;

  return (
    <>
      <div className="resumen-grilla">
        <div className="resumen-mapa">
          <RespaldoMapa apoyos={apoyos}>
            <Suspense fallback={<PlantaSvg apoyos={apoyos} nota="Descargando el mapa…" />}>
              <Mapa apoyos={apoyos} respaldo={<PlantaSvg apoyos={apoyos} nota="El mapa no se pudo descargar; se muestra el esquema geométrico (funciona sin conexión)." />} />
            </Suspense>
          </RespaldoMapa>
          <p className="leyenda">
            <span className="li ancla" /> anclaje
            <span className="li susp2" /> suspensión
            <span className="li term2" /> terminal
            <span className="li emp" /> empalme (no es apoyo)
            <span className="fine">— clic en un punto para ver su función y deflexión</span>
          </p>
        </div>

        <aside className="resumen-panel">
          <div className="kpis dos">
            <Kpi valor={`${nf(r.e.suma)} m`} etiqueta="long. de la línea" />
            <Kpi valor={`${nf(r.directa)} m`} etiqueta="dist. directa extremos" />
            <Kpi valor={nf(r.E.length)} etiqueta="estructuras"
                 sub={r.empalmes ? `+ ${r.empalmes} empalmes, que no son apoyos` : undefined} />
            <Kpi valor={nf(r.e.n)} etiqueta="vanos entre apoyos" />
            <Kpi valor={`${nf(r.e.promedio, 1)} m`} etiqueta="vano promedio" />
            <Kpi valor={`${nf(r.e.minimo, 1)} / ${nf(r.e.maximo, 1)}`} etiqueta="vano mín / máx (m)" />
          </div>
        </aside>
      </div>

      <Distribucion apoyos={apoyos} />
    </>
  );
}

// ── Pestaña MECÁNICO: indicadores del conductor + tabla de tramos ───────────

function Mecanico({ apoyos, conductor, hipotesis }:
  { apoyos: Apoyo[]; conductor: Conductor; hipotesis: Hipotesis }) {

  const filas = useMemo(() => calcularTramos(apoyos, conductor, hipotesis), [apoyos, conductor, hipotesis]);
  const r = useMemo(() => {
    const L = vanos(apoyos);
    return {
      vir: vanoIdealRegulacion(L) ?? 0,
      anclas: proyectar(apoyos).filter((p) => p.esAncla).length,
      amp: ampacidad(
        { material: conductor.material, seccion: conductor.seccion_mm2, diametro: conductor.diametro_m },
        temperaturaLimite(conductor.material), 32,
        { v: 0.61, eps: 0.5, abso: 0.5, qs: 1000, he: 10 },
      ),
    };
  }, [apoyos, conductor]);

  if (!filas.length) return null;
  const excedidos = filas.filter((f) => f.excede);

  return (
    <>
      <section className="panel">
        <h2>Conductor y regulación</h2>
        <div className="kpis">
          <Kpi valor={`${conductor.material} ${conductor.codigo}`} etiqueta="conductor" sub={conductor.calibre} />
          <Kpi valor={`${nf(conductor.rts_kgf)} kgf`} etiqueta="carga de rotura (RTS)" />
          <Kpi valor={`${nf(r.vir, 1)} m`} etiqueta="VIR de la línea" sub="pero se calcula por tramo" />
          <Kpi valor={nf(filas.length)} etiqueta="tramos de tensión" sub={`${r.anclas} anclajes`} />
          <Kpi valor={`${nf(r.amp)} A`} etiqueta="ampacidad IEEE 738" sub={`${temperaturaLimite(conductor.material)} °C · 32 °C amb.`} />
        </div>
      </section>

      <section className="panel">
        <h2>Cálculo mecánico por tramo</h2>
        {/* La tabla NO se virtualiza mientras quepa entera: el informe se genera
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
          climáticas y la distancia mínima al terreno están pendientes de cerrarse contra norma y
          contra la ficha del proveedor real del conductor.
        </p>
      </section>
    </>
  );
}

// ── Vista principal ─────────────────────────────────────────────────────────

export function VistaLinea({ linea, apoyos, conductor, hipotesis }:
  { linea: TLinea; apoyos: Apoyo[]; conductor: Conductor; hipotesis: Hipotesis }) {

  const [activa, setActiva] = useState<IdPestana>('resumen');

  return (
    <>
      <div className="linea-cab">
        <h2 className="linea-titulo">{linea.codigo} — {nf(linea.tensionNominal_kV)} kV</h2>
        <nav className="pestanas" aria-label="Secciones de la línea">
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              className={'pestana' + (activa === p.id ? ' activa' : '') + ('roja' in p && p.roja ? ' roja' : '')}
              disabled={!p.lista}
              title={p.lista ? undefined : 'En construcción'}
              onClick={() => p.lista && setActiva(p.id)}
            >
              {p.rotulo}
            </button>
          ))}
        </nav>
      </div>

      {activa === 'resumen' && <Resumen apoyos={apoyos} />}
      {activa === 'distancias' && <Distancias apoyos={apoyos} />}
      {activa === 'fichas' && <Fichas apoyos={apoyos} />}
      {activa === 'mecanico' && <Mecanico apoyos={apoyos} conductor={conductor} hipotesis={hipotesis} />}
      {activa === 'exportar' && <Exportar linea={linea} apoyos={apoyos} hipotesis={hipotesis} />}
    </>
  );
}
