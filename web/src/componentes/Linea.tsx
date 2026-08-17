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
import { Component, Suspense, lazy, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Apoyo, Conductor, Evidencia, Hipotesis, Investigacion, Linea as TLinea } from '@lineas/contratos';
import { vincenty, vanoIdealRegulacion } from '@lineas/nucleo/geodesia';
import { ampacidad, temperaturaLimite } from '@lineas/nucleo/termica';
import { estadisticasVanos } from '@lineas/nucleo/estadisticas';
import { coherenciaFuncionDeflexion } from '@lineas/nucleo/coherencia';
import { derivarLevantamiento } from '@lineas/exportar/levantamiento';
import { calidadLevantamiento } from '@lineas/exportar/calidad';
import { proyectar, vanos, geometriaSvg, soloEstructuras } from '../vistas/planta';
import { COLORES_TRAMO_CSS } from '../vistas/tramoColores';
import { calcularTramos } from '../vistas/tramos';
import { textoNucleo } from '../vistas/formato';
import { conReintentos } from '../datos/cargar';
import { almacen, useSesion } from '../datos/enlace';
import { ejesDeLinea } from '../vistas/ejesLinea';
import { estadoDeLinea } from '../vistas/estadoLinea';
import { vanosDeLinea } from '../vistas/vanosLinea';
import { Horizonte } from './Horizonte';
import { Distribucion } from './Distribucion';
import { Distancias } from './Distancias';
import { Fichas } from './Fichas';
import { Exportar } from './Exportar';
import { Cargar } from './Cargar';
import { Fundamentos } from './Fundamentos';
import { Falla } from './Falla';
import { Umbrales } from './Umbrales';
import { Cantidades } from './Cantidades';
import { Termica } from './Termica';
import { Viento } from './Viento';
import { Cargas } from './Cargas';
import { Sello } from './Sello';

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
  { id: 'falla', rotulo: 'Falla', lista: true, roja: true },
  { id: 'fundamentos', rotulo: 'Fundamentos', lista: true },
  { id: 'mecanico', rotulo: 'Mecánico', lista: true },
  { id: 'termica', rotulo: 'Térmica', lista: true },
  { id: 'viento', rotulo: 'Viento', lista: true },
  // Va DESPUÉS de Viento a propósito: la carga sobre el apoyo se compone con el
  // empuje que la pestaña anterior acaba de caracterizar. Y va aparte de
  // Mecánico porque habla de otra cosa — aquélla del conductor, ésta de la
  // estructura, que es de lo que responde quien firma el mantenimiento.
  { id: 'cargas', rotulo: 'Cargas', lista: true },
  { id: 'cantidades', rotulo: 'Cantidades', lista: true },
  { id: 'exportar', rotulo: 'Exportar', lista: true },
  // La ÚNICA pestaña que escribe activos, y la única que se filtra por permiso.
  // Va la última a propósito: se llega a ella después de haber mirado la línea,
  // no antes. Y `soloAdmin` es COSMÉTICO —esconder una pestaña no impide nada—;
  // quien decide de verdad son las reglas de la base. Existe para que quien no
  // pueda cargar no descubra que no puede después de media hora de trabajo.
  { id: 'cargar', rotulo: 'Cargar', lista: true, soloAdmin: true },
] as const;

type IdPestana = (typeof PESTANAS)[number]['id'];

/** Si una pestaña exige permiso de administración para siquiera enseñarse. */
const soloAdmin = (p: (typeof PESTANAS)[number]): boolean => 'soloAdmin' in p && p.soloAdmin === true;

// ── Pestaña RESUMEN: mapa + tarjetas como la pantalla del módulo original ───

/**
 * La capa de GERENCIAMIENTO: cómo está la línea, en una línea por asunto y sin
 * jerga. Es lo primero que se ve, antes de cualquier tabla — quien dirige el
 * mantenimiento necesita saber a qué atender, no leer 23 vanos.
 *
 * Los tres semáforos salen de los datos, no de un texto: si mañana la línea
 * está sana, la banda lo dice sola.
 */
function BandaEstado({ eventos, calidad, filasMecanico, hipotesis }: {
  eventos: number; calidad: { atencion: number; aviso: number };
  filasMecanico: number; hipotesis: Hipotesis;
}) {
  const excedidos = 0;   // lo calcula Mecánico; aquí solo se informa el alcance
  const fichas = [
    {
      t: 'Eventos de falla',
      v: eventos ? `${nf(eventos)} expediente${eventos > 1 ? 's' : ''} abierto${eventos > 1 ? 's' : ''}` : 'sin eventos registrados',
      tono: eventos ? 'critico' : 'bien',
    },
    {
      t: 'Calidad del levantamiento',
      v: calidad.atencion ? `${nf(calidad.atencion)} punto(s) de atención`
        : calidad.aviso ? `${nf(calidad.aviso)} aviso(s) a revisar`
        : 'sin anomalías detectadas',
      tono: calidad.atencion ? 'critico' : calidad.aviso ? 'atender' : 'bien',
    },
    {
      t: 'Cálculo mecánico',
      v: filasMecanico ? `${nf(filasMecanico)} tramos calculados${excedidos ? ` · ${excedidos} excedidos` : ''}` : 'sin tramos',
      tono: 'bien',
    },
    {
      t: 'Hipótesis de cálculo',
      v: hipotesis.congelada ? 'congeladas — informe firmado' : 'sin validar — pendientes de cierre',
      tono: hipotesis.congelada ? 'bien' : 'atender',
    },
  ];

  return (
    <div className="banda-estado" role="group" aria-label="Estado de la línea">
      {fichas.map((f) => (
        <div key={f.t} className={`estado-ficha ${f.tono}`}>
          <span className="estado-punto" aria-hidden="true" />
          <span>
            <span className="estado-t">{f.t}</span>
            <span className="estado-v">{f.v}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function Resumen({ apoyos, investigaciones, alVerEvento, hipotesis, conductor }:
  { apoyos: Apoyo[]; investigaciones: Investigacion[]; alVerEvento: () => void;
    hipotesis: Hipotesis; conductor: Conductor }) {
  const r = useMemo(() => {
    const E = soloEstructuras(apoyos);
    const L = vanos(apoyos);
    const e = estadisticasVanos(L);
    const directa = E.length >= 2
      ? vincenty(E[0].coordenada.lat, E[0].coordenada.lon,
                 E[E.length - 1].coordenada.lat, E[E.length - 1].coordenada.lon).d
      : 0;
    const lev = derivarLevantamiento(apoyos);
    // Criterio recuperado del módulo original: la función DECLARADA de cada
    // apoyo tiene que concordar con la deflexión MEDIDA. Un desajuste en un
    // sentido es riesgo estructural; en el otro, sobrecosto.
    const coherencia = coherenciaFuncionDeflexion(
      lev.puntos.filter((p) => p.tipo === 'Estructura').map((p) => ({
        nombre: p.nombre,
        funcionEstructural: p.funcionEstructural ?? undefined,
        deflexion_grados: p.deflexion_grados,
      })),
    ) as { apoyo: string; severidad: 'critica' | 'advertencia' | 'info'; mensaje: string; criterio: string }[];

    return { E, L, e, directa, empalmes: apoyos.length - E.length,
             tramos: lev.tramos, calidad: calidadLevantamiento(lev), coherencia };
  }, [apoyos]);

  if (!r.e) return null;

  return (
    <>
      <BandaEstado
        eventos={investigaciones.filter((i) => !i.cerrada).length}
        calidad={{
          atencion: r.calidad.filter((c) => c.severidad === 'atencion').length,
          aviso: r.calidad.filter((c) => c.severidad === 'aviso').length,
        }}
        filasMecanico={r.tramos.length}
        hipotesis={hipotesis}
      />
      <p className="saludo">
        Línea <b>{nf(r.E.length)} estructuras</b> · {nf(r.e.suma)} m · conductor{' '}
        <b>{conductor.material} {conductor.codigo}</b>. Toque un punto del mapa para ver su ficha,
        o el trazado para ver su tramo de tensión.
      </p>

      <div className="resumen-grilla">
        <div className="resumen-mapa">
          <RespaldoMapa apoyos={apoyos}>
            <Suspense fallback={<PlantaSvg apoyos={apoyos} nota="Descargando el mapa…" />}>
              <Mapa apoyos={apoyos} eventos={investigaciones} alVerEvento={alVerEvento}
                respaldo={<PlantaSvg apoyos={apoyos} nota="El mapa no se pudo descargar; se muestra el esquema geométrico (funciona sin conexión)." />} />
            </Suspense>
          </RespaldoMapa>
          <p className="leyenda">
            <span className="li ancla" /> anclaje
            <span className="li susp2" /> suspensión
            <span className="li term2" /> terminal
            <span className="li emp" /> empalme (no es apoyo)
            <span className="fine">— clic en un punto: su ficha completa; clic en el trazado: su tramo</span>
          </p>
          {r.tramos.length > 0 && (
            <div className="tramos-leyenda">
              {r.tramos.map((t, i) => (
                <span key={t.n} className="tramo-item">
                  <span className="li" style={{ background: COLORES_TRAMO_CSS[i % COLORES_TRAMO_CSS.length] }} />
                  T{t.n} · {t.desde.replace('LN-627 ', '')} → {t.hasta.replace('LN-627 ', '')} · {nf(t.longitud_m)} m
                </span>
              ))}
            </div>
          )}
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

      {investigaciones.length > 0 && (
        <section className="panel falla-alerta">
          <h2>Evento de falla registrado en esta línea</h2>
          {investigaciones.map((ev) => {
            const i = apoyos.findIndex((a) => a.id === ev.apoyoId);
            const nombre = i >= 0
              ? (apoyos[i].nombreNormalizado ?? apoyos[i].nombreCampo)
              : 'estructura no identificada';
            return (
              <button key={ev.id} type="button" className="falla-tarjeta" onClick={alVerEvento}>
                <span className="falla-icono" aria-hidden="true">⚠</span>
                <span>
                  <b>{nombre}</b>{ev.placa ? ` · placa ${ev.placa}` : ''} — {ev.componenteAfectado}
                  <span className="falla-tarjeta-sub">
                    {ev.fechaTexto ?? new Date(ev.ocurrioEn).toLocaleDateString('es-CO')} ·{' '}
                    {nf(ev.hipotesis.length)} hipótesis ·{' '}
                    {nf(ev.verificacionesPendientes.filter((v) => v.estado === 'pendiente').length)} verificaciones pendientes
                    <span className="falla-tarjeta-ir"> — abrir el expediente →</span>
                  </span>
                </span>
              </button>
            );
          })}
        </section>
      )}

      {r.coherencia.length > 0 && (
        <section className="panel">
          <h2>Coherencia entre función declarada y deflexión medida</h2>
          <p className="fine">
            Criterio de diseño <b>sin norma citada</b>, recuperado del módulo de campo: hasta ~3°
            basta suspensión; de 3° a 15°, suspensión angular; por encima de 15° debería ser ángulo
            o retención; por encima de 30°, retención obligada. Un anclaje de más también se avisa:
            es sobrecosto.
          </p>
          <ul className="calidad-lista">
            {r.coherencia.map((c, i) => (
              <li key={i} className={`calidad-item ${c.severidad === 'critica' ? 'atencion'
                : c.severidad === 'advertencia' ? 'aviso' : 'info'}`}>
                <b>{c.apoyo}.</b> {textoNucleo(c.mensaje)}{' '}
                <span className="umbral-fuente">{textoNucleo(c.criterio)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2>Calidad del levantamiento</h2>
        <p className="fine">
          Observaciones <b>calculadas</b> de los datos — no redactadas a mano. Si el dato se
          corrige, el hallazgo desaparece solo.
        </p>
        {r.calidad.length === 0 ? (
          <p className="ok">Sin hallazgos: la serie está completa y sin anomalías geométricas.</p>
        ) : (
          <ul className="calidad-lista">
            {r.calidad.map((c, i) => (
              <li key={i} className={`calidad-item ${c.severidad}`}>
                {/* El TÍTULO también lleva cifras («Quiebre de 118.2°», «Vano de
                    256.9 m»): pasar solo el detalle deja el número mal escrito
                    justo en el renglón que se lee primero. */}
                <b>{textoNucleo(c.titulo)}.</b> {textoNucleo(c.detalle)}
              </li>
            ))}
          </ul>
        )}
      </section>

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
              <Sello hipotesis={hipotesis} conductor={conductor} />
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

      <DetalleVanos apoyos={apoyos} conductor={conductor} hipotesis={hipotesis} />
      <Umbrales apoyos={apoyos} conductor={conductor} hipotesis={hipotesis} />
    </>
  );
}

// ── Vano a vano: el detalle que pide un revisor externo ─────────────────────

function DetalleVanos({ apoyos, conductor, hipotesis }:
  { apoyos: Apoyo[]; conductor: Conductor; hipotesis: Hipotesis }) {

  // La numeración corrida vive en `vanosDeLinea`, su dueño único: el horizonte
  // dibuja EXACTAMENTE los mismos vanos con los mismos números. Si cada uno los
  // numerase por su cuenta, «el vano 14» de esta tabla y el del dibujo podrían
  // señalar tramos distintos de la línea.
  const r = useMemo(() => vanosDeLinea(apoyos, conductor, hipotesis), [apoyos, conductor, hipotesis]);

  if (!r || !r.filas.length) return null;

  // ⚠️ `fueraDeRango` tiene TRES estados, no dos. `nucleo/vanos.js` devuelve
  // `null` cuando no hubo VIR contra el que comparar, y contar solo los `true`
  // convierte ese hueco en un aprobado: el vano se pinta exactamente igual que
  // uno que SÍ se comprobó y salió dentro de banda. Es la misma falta que
  // TODO-53 cerró en el horizonte, en otro sujeto. El informe ya lo distinguía
  // —y hasta el CSV del mismo exporte escribe «no evaluable» en esa fila—, así
  // que la pantalla era el único sitio donde el hueco se disfrazaba de dato bueno.
  const fuera = r.filas.filter((f) => f.fueraDeRango === true);
  const sinComparar = r.filas.filter((f) => f.fueraDeRango !== true && f.fueraDeRango !== false);

  return (
    <section className="panel">
      <h2>Vano a vano</h2>
      <p className="fine">
        La tabla por tramo da el vano que gobierna; ésta da <b>cada vano</b>: su relación con el VIR
        del tramo, sus tres flechas y la longitud real de conductor que se lleva.
      </p>
      <Sello hipotesis={hipotesis} conductor={conductor} />

      <div className="tabla-caja">
        <table className="tabla">
          <caption>
            Detalle por vano. La longitud de conductor es por catenaria: siempre mayor que el vano.
          </caption>
          <thead>
            <tr>
              <th>#</th><th>Tramo</th><th>Vano (m)</th><th>a / VIR</th>
              <th>Flecha EDS</th><th>Flecha {hipotesis.tempMax_C} °C</th><th>Flecha {hipotesis.tempMin_C} °C</th>
              <th>Conductor (m)</th><th>C (m)</th>
            </tr>
          </thead>
          <tbody>
            {r.filas.map((f) => (
              <tr key={f.n} className={f.fueraDeRango === true ? 'excede'
                : f.fueraDeRango === false ? undefined : 'sin-comparar'}>
                <td className="num">{f.n}</td>
                <td className="num">{f.tramo}</td>
                <td className="num">{nf(f.a_m, 1)}</td>
                <td className="num destaca" title={f.fueraDeRango === null
                  ? 'Sin VIR del tramo contra el que comparar: este vano NO se pudo evaluar'
                  : undefined}>
                  {f.relVir == null ? 'no evaluable' : nf(f.relVir, 2)}
                </td>
                <td className="num">{nf(f.flechaEds_m, 2)}</td>
                <td className="num">{nf(f.flechaTMax_m, 2)}</td>
                <td className="num">{nf(f.flechaTMin_m, 2)}</td>
                <td className="num">{nf(f.longitudConductor_m, 2)}</td>
                <td className="num">{nf(f.parametroC_m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {fuera.length > 0 && (
        <p className="alerta">
          <b>{nf(fuera.length)} vano(s) fuera de la banda 0,7–1,3 respecto al VIR de su tramo:</b>{' '}
          {fuera.map((f) => `#${f.n}`).join(', ')}. Fuera de esa banda la hipótesis del vano ideal
          de regulación pierde validez y el tramo debería subdividirse.
        </p>
      )}

      {/* Un hueco NO es un aprobado. Antes, con vanos sin VIR contra el que
          comparar, esta pantalla cerraba con «todos dentro de la banda» — y esos
          vanos no se habían comprobado, ni bien ni mal. */}
      {sinComparar.length > 0 && (
        <p className="aviso">
          <b>{nf(sinComparar.length)} vano(s) NO se pudieron comparar</b> con el VIR de su tramo:{' '}
          {sinComparar.map((f) => `#${f.n}`).join(', ')}. No están dentro de la banda ni fuera:
          <b> no se han evaluado</b>. Suele ser un tramo sin VIR calculable, o dos estructuras
          capturadas sobre la misma coordenada.
        </p>
      )}

      {fuera.length === 0 && sinComparar.length === 0 && (
        <p className="ok">
          Los {nf(r.filas.length)} vanos se compararon con el VIR de su tramo y todos caen dentro de
          la banda 0,7–1,3.
        </p>
      )}

      {r.res.longitudTotal_m != null && (
        <p className="fine">
          Conductor por fase: <b>{nf(r.res.longitudTotal_m, 1)} m</b> — un{' '}
          <b>{nf(r.res.factorCatenaria_pct ?? 0, 2)} %</b> más que la suma de los vanos rectos. Esa
          diferencia es cable real que hay que comprar.
        </p>
      )}

      {r.ctrl && (
        <p className={r.ctrl.aceptable ? 'ok' : 'alerta'}>
          <b>Control catenaria contra parábola</b> en el vano más largo ({nf(r.peor.a_m, 1)} m,
          C = {nf(r.peor.parametroC_m)} m): catenaria {nf(r.ctrl.flechaCatenaria_m, 3)} m frente a
          parábola {nf(r.ctrl.flechaParabola_m, 3)} m — error {nf(r.ctrl.error_pct, 3)} %.{' '}
          {r.ctrl.aceptable
            ? 'Por debajo del 0,5 % adoptado: la simplificación parabólica es admisible en esta línea.'
            : 'Por encima del 0,5 % adoptado: aquí hay que usar catenaria exacta, no parábola.'}
        </p>
      )}
    </section>
  );
}

// ── Vista principal ─────────────────────────────────────────────────────────

export function VistaLinea({ linea, apoyos, conductor, hipotesis, investigaciones = [], evidencias = [], lineas, noSePudoLeer, avisoRuta }:
  { linea: TLinea; apoyos: Apoyo[]; conductor: Conductor; hipotesis: Hipotesis;
    investigaciones?: Investigacion[]; evidencias?: Evidencia[];
    /** Qué NO se pudo leer, para no afirmar «no hay» cuando fue «no se pudo mirar». */
    noSePudoLeer?: { investigaciones?: string; evidencias?: string };
    /** Por qué se abrió esta línea y no la que pedía el enlace. */
    avisoRuta?: string; lineas?: TLinea[] }) {

  // Quién entró y con qué permiso. Solo lo consume la pestaña que ESCRIBE.
  const sesion = useSesion();
  const esAdmin = sesion.fase === 'autenticado' && sesion.rol === 'admin';

  /**
   * Las pestañas que esta sesión puede ver.
   *
   * ⚠️ Mientras la sesión se está comprobando, la de administración NO aparece:
   * el defecto contrario —enseñarla y quitarla al llegar la respuesta— haría que
   * la fila de pestañas saltara justo cuando él va a pulsar, y acabaría entrando
   * en otra pantalla sin saber por qué.
   */
  const visibles = useMemo(
    () => PESTANAS.filter((p) => !soloAdmin(p) || esAdmin),
    [esAdmin],
  );

  // ── El estado VIVE EN LA DIRECCIÓN WEB ──────────────────────────────────
  // Era el bloqueante nº6 de la crítica: sin esto no se puede mandar «mira
  // LN-627 en Cargas» por chat, y en una herramienta cuyo oficio es hacer
  // BARATO comprobar al ingeniero, encarecer justo la comprobación es un
  // contrasentido. De paso, Atrás/Adelante dejan de mentir.
  //
  // Una dirección que pida una pestaña que esta sesión no puede ver cae en
  // Resumen: es lo mismo que ocurre con una línea que no es suya, y por el mismo
  // motivo — un enlace no otorga permisos.
  const leerHash = (): IdPestana | null => {
    const m = /^#\/[^/]*\/([a-z]+)$/.exec(location.hash);
    const id = m?.[1];
    return visibles.some((p) => p.id === id && p.lista) ? (id as IdPestana) : null;
  };
  const [activa, setActiva] = useState<IdPestana>(() => leerHash() ?? 'resumen');

  useEffect(() => {
    // Si la sesión resultó no ser de administración DESPUÉS de haber entrado por
    // enlace directo, se sale de la pestaña en vez de dejarla pintada sin estar
    // en la fila de arriba: una pantalla a la que no se puede volver es peor que
    // ninguna.
    if (!visibles.some((p) => p.id === activa)) setActiva('resumen');
  }, [visibles, activa]);

  const irA = (id: IdPestana) => {
    setActiva(id);
    const nuevo = `#/${encodeURIComponent(linea.codigo)}/${id}`;
    if (location.hash !== nuevo) history.pushState(null, '', nuevo);
  };

  useEffect(() => {
    // Atrás/Adelante DENTRO de la línea: solo la pestaña. El salto entre línea y
    // segmento de causa raíz lo lleva el oyente de `App`, que no se desmonta.
    const alVolver = () => setActiva(leerHash() ?? 'resumen');
    addEventListener('popstate', alVolver);
    return () => removeEventListener('popstate', alVolver);
  }, []);

  useEffect(() => {
    // Al abrir sin hash (o con otra línea), se escribe el actual SIN empujar
    // historia: entrar en la app no debe dejar un paso atrás fantasma.
    const esperado = `#/${encodeURIComponent(linea.codigo)}/${activa}`;
    if (location.hash !== esperado) history.replaceState(null, '', esperado);
  }, [linea.codigo, activa]);

  // Patrón ARIA de pestañas: flechas ←/→ recorren solo las pestañas LISTAS.
  const conFlechas = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const listas = visibles.filter((p) => p.lista);
    const i = listas.findIndex((p) => p.id === activa);
    const j = (i + (e.key === 'ArrowRight' ? 1 : listas.length - 1)) % listas.length;
    irA(listas[j].id);
    document.getElementById(`pestana-${listas[j].id}`)?.focus();
    e.preventDefault();
  };

  // El PARQUE: las líneas que el usuario tiene permiso de ver. Si la lista no
  // llegó, la única que consta es la que está abierta. No se inventa un parque.
  const parque = lineas?.length ? lineas : [linea];

  // EL CIELO. Sale de los dos ejes REALES —los mismos que pinta la pestaña
  // Cargas, por el mismo dueño— y de los expedientes sin cerrar. Ni un texto
  // fijo, ni una bandera escrita a mano: si mañana el inventario trae las
  // fichas, el cielo amanece solo.
  const ejes = useMemo(
    () => ejesDeLinea(apoyos, conductor, hipotesis, linea.circuitos),
    [apoyos, conductor, hipotesis, linea.circuitos]);
  const vanosLinea = useMemo(
    () => vanosDeLinea(apoyos, conductor, hipotesis), [apoyos, conductor, hipotesis]);

  const estado = useMemo(() => {
    return estadoDeLinea({
      transversal: { filas: ejes.transversal.filas, total: ejes.transversal.total, aRevisar: ejes.transversal.aRevisar },
      longitudinal: ejes.longitudinal
        ? { filas: ejes.longitudinal.filas, total: ejes.longitudinal.total, aRevisar: ejes.longitudinal.aRevisar }
        : { filas: [], total: 0, aRevisar: 0 },
      investigaciones,
      hipotesis,
    });
  }, [ejes, investigaciones, hipotesis]);

  return (
    <>
      <div className="linea-cab">
        <h2 className="linea-titulo">{linea.codigo} — {nf(linea.tensionNominal_kV)} kV</h2>
      </div>

      {/* Un enlace que abre otra línea EN SILENCIO es peor que uno roto: dos
          ingenieros pueden discutir cifras creyendo que miran la misma. */}
      {avisoRuta && <p className="alerta" role="status">{avisoRuta}</p>}

      <div className="cuerpo">
        <nav className="col-parque" aria-label="Parque de líneas">
          <div className="col-rotulo">Parque · {parque.length}</div>
          <div className="parque-lista">
            {parque.map((l) => (
              <button
                key={l.id}
                type="button"
                className="parque-linea"
                aria-current={l.id === linea.id}
                onClick={() => { if (l.id !== linea.id) void almacen.abrir(l.id); }}
              >
                <span className="parque-id">{l.codigo}</span>
                <span className="parque-sub">{nf(l.tensionNominal_kV)} kV</span>
                {l.id === linea.id && (
                  <span className="parque-ver" data-cero={estado.dictaminados === 0}>
                    <b>{nf(estado.dictaminados)}/{nf(estado.total)}</b> con veredicto
                  </span>
                )}
              </button>
            ))}
          </div>
          {parque.length === 1 && (
            <p className="parque-nota">
              Una sola línea consolidada. Esta columna crece sola cuando entren más:
              no se rellena con líneas de ejemplo.
            </p>
          )}
        </nav>

        <nav className="col-secciones" aria-label="Secciones">
          <div className="col-rotulo">Secciones</div>
          <div className="pestanas" role="tablist" aria-label="Secciones de la línea" onKeyDown={conFlechas}>
            {visibles.map((p) => (
              <button
                key={p.id}
                id={`pestana-${p.id}`}
                role="tab"
                aria-selected={activa === p.id}
                aria-controls="panel-linea"
                tabIndex={activa === p.id ? 0 : -1}
                className={'pestana' + (activa === p.id ? ' activa' : '') + ('roja' in p && p.roja ? ' roja' : '')}
                disabled={!p.lista}
                title={p.lista ? undefined : 'En construcción'}
                onClick={() => p.lista && irA(p.id)}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
        </nav>

        <div className="col-contenido">
          <div className={`cielo cielo-${estado.cielo}`} role="status">
            <div className="cielo-txt">
              <span className="cielo-rotulo">{estado.rotulo}</span>
              <span className="cielo-porque">{estado.porQue}</span>
            </div>
            <button
              type="button"
              className="cielo-medidor"
              data-cero={estado.dictaminados === 0}
              onClick={() => irA('cargas')}
              title="Ver los apoyos uno por uno, con lo que le falta a cada uno"
            >
              <b>{nf(estado.dictaminados)} / {nf(estado.total)}</b>
              <span>apoyos con veredicto · los dos ejes →</span>
            </button>
          </div>

          {/* `dictaminados` ya no se pasa: el dibujo lo pide al dueño del cruce
              (`coberturaEjes.ts`), el mismo que alimenta este contador de
              arriba. Pasárselo por separado era la puerta a que el rótulo y el
              dibujo dijeran cifras distintas. */}
          <Horizonte ejes={ejes} vanos={vanosLinea} total={estado.total} />

      <div id="panel-linea" role="tabpanel" aria-labelledby={`pestana-${activa}`}>
        {activa === 'resumen' && (
          <Resumen apoyos={apoyos} investigaciones={investigaciones}
            alVerEvento={() => irA('falla')}
            hipotesis={hipotesis} conductor={conductor} />
        )}
        {activa === 'falla' && <Falla investigaciones={investigaciones} apoyos={apoyos} evidencias={evidencias} noSePudoLeer={noSePudoLeer?.investigaciones} noSePudoLeerFotos={noSePudoLeer?.evidencias} />}
        {activa === 'distancias' && <Distancias apoyos={apoyos} />}
        {/* La sesión viaja a Fichas por el mismo motivo por el que ya viajaba a
            Cargar: desde que esta pestaña ESCRIBE, saber con qué permiso se
            entró deja de ser un lujo — sin eso, quien no pueda escribir lo
            descubriría por una denegación de la base, en inglés y después de
            rellenar seis campos. Se pasa aunque la sesión aún no conste: Fichas
            SIEMPRE se puede leer, y es el botón lo que se guarda. */}
        {activa === 'fichas' && (
          <Fichas apoyos={apoyos} linea={linea} conductor={conductor} hipotesis={hipotesis}
            evidencias={evidencias}
            sesion={sesion.fase === 'autenticado'
              ? { correo: sesion.correo, rol: sesion.rol, orgId: sesion.orgId, uid: sesion.uid }
              : undefined} />
        )}
        {activa === 'mecanico' && <Mecanico apoyos={apoyos} conductor={conductor} hipotesis={hipotesis} />}
        {activa === 'fundamentos' && <Fundamentos apoyos={apoyos} conductor={conductor} hipotesis={hipotesis} />}
        {activa === 'termica' && <Termica linea={linea} conductor={conductor} hipotesis={hipotesis} />}
        {activa === 'viento' && <Viento apoyos={apoyos} conductor={conductor} hipotesis={hipotesis} />}
        {activa === 'cargas' && <Cargas linea={linea} apoyos={apoyos} conductor={conductor} hipotesis={hipotesis} />}
        {activa === 'cantidades' && <Cantidades linea={linea} apoyos={apoyos} conductor={conductor} hipotesis={hipotesis} />}
        {activa === 'exportar' && <Exportar linea={linea} apoyos={apoyos} conductor={conductor} hipotesis={hipotesis} investigaciones={investigaciones} />}
        {/* La sesión se vuelve a comprobar aquí: `visibles` decide si la pestaña
            se enseña, y esto decide si el panel se pinta. Son dos guardas del
            mismo hecho a propósito — la primera puede quedarse vieja si el
            permiso cambia con la pantalla abierta. */}
        {activa === 'cargar' && sesion.fase === 'autenticado' && (
          <Cargar linea={linea} apoyos={apoyos}
            sesion={{ correo: sesion.correo, rol: sesion.rol, orgId: sesion.orgId, uid: sesion.uid }} />
        )}
      </div>
        </div>
      </div>
    </>
  );
}
