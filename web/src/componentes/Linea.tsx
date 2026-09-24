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
import type { Apoyo, Conductor, Evidencia, Funcion, Hipotesis, Investigacion, Levantamiento, Linea as TLinea } from '@lineas/contratos';
import { vincenty, vanoIdealRegulacion } from '@lineas/nucleo/geodesia';
import { ampacidadDeLinea, etiquetaDeAmpacidad } from '@lineas/nucleo/termica';
import { estadisticasVanos } from '@lineas/nucleo/estadisticas';
import { coherenciaFuncionDeflexion } from '@lineas/nucleo/coherencia';
import { derivarLevantamiento } from '@lineas/exportar/levantamiento';
import { calidadLevantamiento } from '@lineas/exportar/calidad';
import { proyectar, vanos, geometriaSvg, soloEstructuras } from '../vistas/planta';
import { COLORES_TRAMO_CSS } from '../vistas/tramoColores';
import { calcularTramos } from '../vistas/tramos';
import { aGMS, textoNucleo } from '../vistas/formato';
import { conReintentos } from '../datos/cargar';
import { almacen, useQuien } from '../datos/enlace';
import { puede } from '../datos/permisos';
import { avisosDeDatos, ordenarLevantamientos, seriesDeLinea } from '../datos/repositorio';
import type { AvisoDeDatos, EstadoDatos, FaltaDeLinea, LineaVecina } from '../datos/repositorio';
import { rotuloDeTramo, sinPrefijoDeSerie } from '../vistas/rotulos';
import {
  bandaSinCalculo, cartelDeLaLinea, cartelDePestana, faltaEnElParque, faltasDePestana,
  fechaDeCampoCorta, motivoDeFaltas, motivoSinHorizonte, porQueNoCalcula,
  recorridoLevantado,
} from '../vistas/recorrido';
import type { CartelSinCalculo, FichaDeBanda, RecorridoLevantado } from '../vistas/recorrido';
import { ejesDeLinea } from '../vistas/ejesLinea';
import type { EjesDeLinea } from '../vistas/ejesLinea';
import { estadoDeLinea } from '../vistas/estadoLinea';
import { vanosDeLinea } from '../vistas/vanosLinea';
import type { VanosDeLinea } from '../vistas/vanosLinea';
import { Horizonte as DibujoDelHorizonte } from './Horizonte';
import { Distribucion } from './Distribucion';
import { DetalleGps } from './DetalleGps';
import { Distancias } from './Distancias';
import { Fichas } from './Fichas';
import { Exportar } from './Exportar';
import { Cargar } from './Cargar';
import { Fotos } from './Fotos';
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
const Cargabilidad = lazy(() => conReintentos(() => import('./Cargabilidad')));

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

export function PlantaSvg({ apoyos, nota }: { apoyos: Apoyo[]; nota?: string }) {
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
export class RespaldoMapa extends Component<{ apoyos: Apoyo[]; children: ReactNode }, { fallo: boolean }> {
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
  // Va PEGADA al resumen y no al final: es el mismo mapa del resumen visto en
  // grande, y quien lo busca viene de haberlo visto pequeño ahí arriba.
  { id: 'gps', rotulo: 'Detalle GPS', lista: true },
  { id: 'distancias', rotulo: 'Distancias', lista: true },
  { id: 'fichas', rotulo: 'Fichas', lista: true },
  // ⚠️ SIN `roja` FIJO. Lo estuvo, y pintaba la pestaña en rojo tuviera eventos
  // o ninguno: alarma permanente que no mira el dato, mientras dentro decía
  // «esta línea no tiene ningún expediente». Una alarma que siempre suena deja
  // de ser una alarma. El rojo lo decide ahora el número de expedientes abiertos
  // (`99 §ADR-051`).
  { id: 'falla', rotulo: 'Falla', lista: true },
  { id: 'fundamentos', rotulo: 'Fundamentos', lista: true },
  { id: 'mecanico', rotulo: 'Mecánico', lista: true },
  { id: 'termica', rotulo: 'Térmica', lista: true },
  // Va PEGADA a Térmica y no al final: Térmica dice cuánta corriente PUEDE
  // llevar la línea (la ampacidad, que se mueve con el clima) y ésta dice cuánta
  // lleva DE VERDAD. Son las dos mitades de la misma pregunta, y separarlas
  // obligaría a recordar un número de una pestaña para leer otra.
  // ⚠️ NO se llama «Cargas»: aquélla es la carga ESTRUCTURAL sobre el apoyo, en
  // kgf, y es otro veredicto. Confundirlas es el enredo que costó `30 · M-02`.
  { id: 'parametros', rotulo: 'Parámetros eléctricos', lista: true },
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
  // no antes. Y el filtro es COSMÉTICO —esconder una pestaña no impide nada—;
  // quien decide de verdad son las reglas de la base. Existe para que quien no
  // pueda cargar no descubra que no puede después de media hora de trabajo.
  //
  // ⚠️ DECLARA LA FUNCIÓN QUE NECESITA, no un rol. Antes decía `soloAdmin`, y
  // con eso el único modo de dejar cargar a alguien era hacerlo administrador
  // de todo. Ahora pide exactamente lo que hace: `cargar.puntos`.
  { id: 'cargar', rotulo: 'Cargar', lista: true, exige: 'cargar.puntos' },
  // La segunda pestaña que ESCRIBE, y la segunda cuyo efecto no se deshace: las
  // reglas niegan borrar una evidencia. Va al lado de «Cargar» porque son el
  // mismo gesto —traer material de campo a la base— y separadas obligarían a
  // aprender dos sitios para lo mismo.
  //
  // ⚠️ NO es `soloAdmin`. Quien va a campo con el teléfono es la cuadrilla, y es
  // lo que `firestore.rules` permite para evidencias (`esCuadrilla()`). Poner
  // aquí el filtro de administración escondería la pestaña a justo quien tiene
  // que usarla. Quien no pueda subir la ve y la pantalla se lo dice.
  { id: 'fotos', rotulo: 'Fotos', lista: true },
] as const;

type IdPestana = (typeof PESTANAS)[number]['id'];

/** Qué función del catálogo exige una pestaña para siquiera enseñarse, si exige alguna. */
const exigeDe = (p: (typeof PESTANAS)[number]): Funcion | null =>
  'exige' in p ? (p.exige as Funcion) : null;

// ── Pestaña RESUMEN: mapa + tarjetas como la pantalla del módulo original ───

/**
 * La capa de GERENCIAMIENTO: cómo está la línea, en una línea por asunto y sin
 * jerga. Es lo primero que se ve, antes de cualquier tabla — quien dirige el
 * mantenimiento necesita saber a qué atender, no leer 23 vanos.
 *
 * Los tres semáforos salen de los datos, no de un texto: si mañana la línea
 * está sana, la banda lo dice sola.
 */
function BandaEstado({ eventos, calidad, filasMecanico, excedidos, hipotesis }: {
  eventos: number; calidad: { atencion: number; aviso: number };
  filasMecanico: number;
  /**
   * Cuántos tramos pasan del tope de tiro adoptado. Llega YA CONTADO desde el
   * mismo dueño que usa la pestaña Mecánico (`vistas/tramos.ts`), y no se
   * recalcula aquí: dos cuentas del mismo número es cómo se acaba con una
   * pantalla en verde y otra en rojo sobre la misma línea.
   *
   * ⚠️ Estuvo FIJADO A CERO en el código, con el tono escrito a mano como
   * «bien». O sea que lo primero que ve quien dirige el mantenimiento era un
   * punto verde que decía que el cálculo mecánico estaba bien **aunque hubiera
   * tramos por encima del umbral**, y para enterarse había que entrar a la
   * pestaña. Era la única de las cuatro fichas que no derivaba del dato, y
   * mentía hacia el lado peligroso (`99 §ADR-051`).
   */
  excedidos: number;
  hipotesis: Hipotesis;
}) {
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
      // «Sin tramos» tampoco es un aprobado: es que no se calculó nada. Un hueco
      // pintado de verde es el patrón que este proyecto tiene por lección
      // (`32 · L-44`), y estaba aquí mismo.
      v: !filasMecanico ? 'sin tramos calculados'
        : excedidos ? `${nf(filasMecanico)} tramos · ${nf(excedidos)} sobre el tope adoptado`
        : `${nf(filasMecanico)} tramos calculados`,
      tono: !filasMecanico || excedidos ? 'atender' : 'bien',
    },
    {
      t: 'Hipótesis de cálculo',
      v: hipotesis.congelada ? 'congeladas — informe firmado' : 'sin validar — pendientes de cierre',
      tono: hipotesis.congelada ? 'bien' : 'atender',
    },
  ];

  return <FichasDeBanda fichas={fichas} />;
}

/**
 * EL DIBUJO de la banda, separado de QUIÉN decide sus cuatro frases.
 *
 * Lo comparten la línea completa —cuyas fichas decide `BandaEstado`, aquí
 * arriba— y la línea que todavía no calcula, cuyas fichas decide
 * `vistas/recorrido.ts`. La banda es lo PRIMERO que se ve de una línea, y dos
 * dibujos distintos de la misma banda es como se acaba con una pantalla en la
 * que el punto de color significa una cosa y en otra, otra.
 */
function FichasDeBanda({ fichas }: { fichas: readonly { t: string; v: string; tono: string }[] }) {
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

function Resumen({ apoyos, investigaciones, alVerEvento, hipotesis, conductor, codigos }:
  { apoyos: Apoyo[]; investigaciones: Investigacion[]; alVerEvento: () => void;
    hipotesis: Hipotesis; conductor: Conductor;
    /**
     * Los códigos de las series que esta pantalla está leyendo (la línea y sus
     * tramos compartidos abiertos). Solo para RECORTAR el prefijo de los
     * nombres: aquí no se decide nada con ellos.
     */
    codigos: readonly string[] }) {
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

  // El MISMO dueño que la pestaña Mecánico, no una segunda cuenta: si un día se
  // discute el tope, las dos pantallas cambian el mismo día (`99 §ADR-051`).
  const excedidos = useMemo(
    () => calcularTramos(apoyos, conductor, hipotesis).filter((f) => f.excede).length,
    [apoyos, conductor, hipotesis]);

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
        excedidos={excedidos}
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
                pantalla="resumen"
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
                  T{t.n} · {sinPrefijoDeSerie(t.desde, codigos)} → {sinPrefijoDeSerie(t.hasta, codigos)} · {nf(t.longitud_m)} m
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
      // ⚠️ SIN `?? 0`. El núcleo devuelve nulo cuando NO hay vano ideal
      // calculable, y ese cero se leía como una medida: «0,0 m». La tabla
      // vano a vano de esta misma pestaña ya respeta los tres estados
      // (cumple / revisar / no evaluable); el titular no lo hacía (`§ADR-091`).
      vir: vanoIdealRegulacion(L),
      anclas: proyectar(apoyos).filter((p) => p.esAncla).length,
      // ⚠️ AL DUEÑO ÚNICO. Antes calculaba aquí, con condiciones escritas a mano
      // y **descartando la ficha del conductor**: usaba el límite del material.
      // Con LN-627 da el mismo número porque su ficha también dice 90 °C, pero
      // una ficha a 75 °C habría publicado 718 A donde solo caben 611 — 107 A de
      // más, siempre por el lado optimista (`99 §ADR-093`).
      amp: ampacidadDeLinea({ conductor, hipotesis }),
    };
  }, [apoyos, conductor, hipotesis]);

  if (!filas.length) return null;
  const excedidos = filas.filter((f) => f.excede);

  return (
    <>
      <section className="panel">
        <h2>Conductor y regulación</h2>
        <div className="kpis">
          <Kpi valor={`${conductor.material} ${conductor.codigo}`} etiqueta="conductor" sub={conductor.calibre} />
          <Kpi valor={`${nf(conductor.rts_kgf)} kgf`} etiqueta="carga de rotura (RTS)" />
          <Kpi valor={r.vir == null ? 'no evaluable' : `${nf(r.vir, 1)} m`}
            etiqueta="VIR de referencia"
            sub={r.vir == null ? 'sin datos suficientes' : 'el del cálculo va por tramo'} />
          <Kpi valor={nf(filas.length)} etiqueta="tramos de tensión" sub={`${r.anclas} anclajes`} />
          {/* El rótulo dice las SEIS condiciones, no dos, y confiesa que están
              adoptadas mientras el Ingeniero no las ratifique. Y desde
              `99 §ADR-098` dice también DE QUIÉN es el número: llamar «IEEE 738»
              a la cifra de una ficha de fabricante sería mentir. */}
          <Kpi valor={r.amp.ampacidad_A == null ? 'no evaluable' : `${nf(r.amp.ampacidad_A)} A`}
            etiqueta={etiquetaDeAmpacidad(r.amp)}
            sub={r.amp.ampacidad_A == null ? r.amp.motivo ?? undefined
              : `${r.amp.esDictamen === false ? '⚠️ NO ES DICTAMEN · ' : ''}`
                + `conductor a ${r.amp.temperatura.rotulo} · ${r.amp.condiciones.rotulo}`} />
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

// ── LA LÍNEA QUE TODAVÍA NO CALCULA ─────────────────────────────────────────
// Lo que decide QUÉ se dice vive en `vistas/recorrido.ts`, que es puro y se
// prueba con `node --test`. Lo de aquí abajo solo PINTA lo que aquél decidió.

/**
 * LO QUE NO SE PUDO LEER, DICHO EN LA PANTALLA.
 *
 * ⚠️ ES EL AVISO MÁS CARO DEL PROYECTO. `repositorio.ts` ya sabía que una serie
 * no se había podido leer —o que se había decidido no juntarla porque su código
 * y su identificador no cuadran en el libro— y lo dejaba escrito en
 * `avisosDeSeries` y `noSePudoLeer.torres`. **No lo leía nadie.** Una cuenta
 * cuyo alcance no llegue al tramo compartido abre la línea, la dibuja, calcula
 * sus tramos de tensión y firma un informe **con la mitad de sus torres**, sin
 * una sola señal en pantalla: un número de menos, en silencio, en un papel que
 * alguien firma.
 *
 * Va arriba del todo y fuera de las pestañas a propósito: no es un detalle de
 * una pantalla, es una advertencia sobre TODO lo que se vea debajo.
 */
function AvisosDeDatos({ avisos }: { avisos: readonly AvisoDeDatos[] }) {
  if (!avisos.length) return null;
  return (
    <section className="panel falla-alerta" role="status">
      <h2>Esta pantalla no está viendo todos los datos de la línea</h2>
      <ul className="calidad-lista">
        {avisos.map((a, i) => (
          <li key={i} className={`calidad-item ${a.clase === 'lectura' ? 'atencion' : 'aviso'}`}>
            <b>{a.clase === 'lectura' ? 'No se pudo leer.' : 'No se juntó.'}</b> {a.texto}
          </li>
        ))}
      </ul>
      <p className="fine">
        Mientras esto salga, lo que se enseñe abajo puede estar calculado con <b>menos torres de
        las que tiene la línea</b>. No es un aviso cosmético: revíselo antes de firmar nada.
      </p>
    </section>
  );
}

/** El cartel de una pestaña que no puede calcular, con el motivo exacto. */
function CartelNoCalcula({ cartel }: { cartel: CartelSinCalculo }) {
  return (
    <section className="panel vacio cartel-no-calcula">
      <div className="vacio-t">{cartel.titulo}</div>
      <p className="vacio-c"><b>{cartel.titular}</b> {cartel.lead}</p>
      <ul className="cargar-lista falta-lista">
        {cartel.items.map((it) => (
          <li key={it.que}><b>{it.que}</b> — {it.porque}</li>
        ))}
      </ul>
      {cartel.pie && <p className="fine">{cartel.pie}</p>}
    </section>
  );
}

/**
 * EL HORIZONTE CUANDO NO HAY TORRES: la franja se queda, y dice por qué.
 *
 * NO se dibujan los puntos levantados como torres huecas, y es la decisión
 * importante de este dibujo: una torre hueca significa «esta torre existe y no
 * tiene veredicto», y aquí no existe ninguna torre. Veintiocho fantasmas dirían
 * que hay veintiocho torres sin dictaminar cuando lo que hay son veintiocho
 * puntos de un GPS que todavía no son nada.
 */
function SinHorizonte({ puntos, torres, faltan }: {
  /** Puntos del recorrido levantado, que NO son torres y por eso no se dibujan. */
  puntos: number;
  /** Torres registradas que sí hay. Con conductor pendiente puede no ser cero. */
  torres: number;
  faltan: readonly FaltaDeLinea[];
}) {
  const motivo = motivoSinHorizonte(faltan);
  return (
    <figure className="horizonte" data-sin-torres={faltan.includes('torres')}>
      <svg viewBox="0 0 1200 96" role="img" aria-label={`Horizonte: ${motivo}`}
        preserveAspectRatio="xMidYMid meet">
        <rect className="hz-suelo" x="0" y="66" width="1200" height="18" />
        <text className="hz-sin" x="600" y="44" textAnchor="middle">{motivo}</text>
      </svg>
      <figcaption className="hz-pie">
        <span className="hz-leyenda">
          {nf(torres)} torres dibujadas
          {puntos ? ` · no se pintan ${nf(puntos)} huecos por los puntos levantados` : ''}
        </span>
        <span className="hz-nota">el recorrido levantado se ve en Resumen, Detalle GPS y Distancias</span>
      </figcaption>
    </figure>
  );
}

/**
 * EL HORIZONTE DE LA LÍNEA, sea el que sea: el dibujo de las torres cuando las
 * hay, y la franja que dice por qué no lo hay cuando no.
 *
 * Existe para que la pantalla no tenga que elegir: la decisión —«hay torres con
 * veredicto que dibujar»— se toma AQUÍ, en un sitio, y `VistaLinea` sigue
 * diciendo lo único que le toca decir, que es EN QUÉ PESTAÑAS se pinta.
 *
 * ⚠️ NO LO VUELVAS A METER EN LA PESTAÑA: el guardián
 * `tests/horizonte-cobertura.test.js` fija que la condición de arriba sea
 * «todas las pestañas menos Detalle GPS» y que el elemento vaya pegado a ella.
 * Deshacer esto en un ternario dentro del JSX pone esa prueba en rojo, y con
 * razón: fue así como el horizonte se ató una vez a una sola pestaña.
 */
function Horizonte({ ejes, vanos, total, puntosLevantados, torres, faltan }: {
  ejes: EjesDeLinea | null;
  vanos: VanosDeLinea | null;
  /** Cuántos apoyos hay que dictaminar. `null` = no hay torres que contar. */
  total: number | null;
  /** Puntos del recorrido levantado, que NO son torres y no se dibujan. */
  puntosLevantados: number;
  /** Torres registradas que sí hay, y qué le falta a la línea para calcular. */
  torres: number;
  faltan: readonly FaltaDeLinea[];
}) {
  if (!ejes || total == null) {
    return <SinHorizonte puntos={puntosLevantados} torres={torres} faltan={faltan} />;
  }
  return <DibujoDelHorizonte ejes={ejes} vanos={vanos} total={total} />;
}

/** El esquema del recorrido: un dibujo del trazado, nunca un mapa. */
export function EsquemaRecorrido({ r }: { r: RecorridoLevantado }) {
  const g = r.esquema;
  if (!g) return null;
  return (
    <div className="mapa">
      <svg viewBox={`0 0 ${g.ancho} ${g.alto}`} role="img"
        aria-label="Esquema del recorrido levantado, norte arriba">
        <polyline points={g.traza} className="traza lev-traza" />
        {g.puntos.map((p) => (
          <circle key={p.n} cx={p.x} cy={p.y} r={4} className="lev-punto">
            <title>{p.titulo}</title>
          </circle>
        ))}
        <g className="norte">
          <line x1={g.ancho - 30} y1={42} x2={g.ancho - 30} y2={20} />
          <text x={g.ancho - 26} y={26}>N</text>
        </g>
      </svg>
    </div>
  );
}

/** La ficha de procedencia del recorrido: de qué día, de qué aparato, cuántos puntos. */
export function SelloDelRecorrido({ r }: { r: RecorridoLevantado }) {
  const detalles = [
    r.aparato,
    r.primeraHora && r.ultimaHora ? `${r.primeraHora} → ${r.ultimaHora}` : null,
    `${nf(r.puntos.length)} puntos guardados tal cual: nombre de campo, posición y cota`,
  ].filter(Boolean);
  return (
    <p className="cargar-sello lev-sello">
      <b>{r.sello}</b>{detalles.length ? ` — ${detalles.join(' · ')}` : ''}
    </p>
  );
}

/** Los hallazgos del recorrido: señales para ir a mirar, nunca veredictos. */
function HallazgosDelRecorrido({ r }: { r: RecorridoLevantado }) {
  if (!r.hallazgos.length) return null;
  return (
    <ul className="calidad-lista">
      {r.hallazgos.map((h, i) => (
        <li key={i} className="calidad-item aviso">
          <b>{h.titulo}.</b> {textoNucleo(h.detalle)}
        </li>
      ))}
    </ul>
  );
}

/**
 * LOS QUIEBRES DEL RECORRIDO, CADA UNO CON SU MARGEN.
 *
 * El margen no es adorno: con ±8 m en cada punto, un quiebre de 10,3° puede
 * moverse ±24,9° — o sea que de ese punto **no se sabe si gira**. Enseñar el
 * ángulo sin el margen invita a declarar una retención donde puede no haber ni
 * quiebre. Y cuando el vano es tan corto que su dirección no se puede saber, no
 * se publica un margen enorme: se dice que no es fiable, con todas las letras.
 *
 * Los dos números salen de `nucleo/geodesia.js`. Aquí no se calcula ninguno.
 */
function QuiebresDelRecorrido({ r }: { r: RecorridoLevantado }) {
  const filas = r.puntos.filter((p) => p.quiebre_grados != null && p.quiebre_grados >= 10);
  if (!filas.length) return null;
  return (
    <section className="panel">
      <h2>Quiebres del recorrido levantado</h2>
      <p className="fine">
        Quiebres de 10° o más, medidos con el GPS de mano. «Margen»: lo que puede moverse el ángulo
        si cada punto se corre ± {nf(r.precision_m)} m de través al vano; se suman los dos vanos que
        llegan al punto. <b>No deciden la función de la torre: la declara usted.</b>
      </p>
      <Sello origen={`geodesia Vincenty sobre WGS84 · ${r.sello} · GPS de mano ± ${nf(r.precision_m)} m`} />
      <div className="tabla-caja">
        <table className="tabla">
          <thead>
            <tr><th>#</th><th>Nombre de campo</th><th>Quiebre</th><th>Margen</th><th>Lectura</th></tr>
          </thead>
          <tbody>
            {filas.map((p) => {
              const q = p.quiebre_grados as number;
              const m = p.margen_grados;
              const vano = p.vanoIndeterminado === 'entra' ? 'el vano que entra'
                : p.vanoIndeterminado === 'sale' ? 'el vano que sale' : 'los dos vanos';
              return (
                <tr key={p.n} className={p.margenDeterminado ? undefined : 'sin-comparar'}>
                  <td className="num">{p.n}</td>
                  <td>{p.nombreCampo}</td>
                  <td className="num destaca">{nf(q, 1)}°</td>
                  <td className="num">{m == null ? 'no se puede saber' : `± ${nf(m, 1)}°`}</td>
                  <td>{m == null
                    ? `no fiable: la dirección de ${vano} no se puede saber`
                    : m > q
                      ? 'puede no haber quiebre: el margen es mayor que el ángulo'
                      : `hay quiebre: con el margen, entre ${nf(q - m, 1)}° y ${nf(q + m, 1)}°`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Lo que le falta a la línea para calcular, enumerado con su porqué. */
function LoQueFalta({ cartel }: { cartel: CartelSinCalculo }) {
  return (
    <section className="panel">
      <h2>{cartel.titulo}</h2>
      <p className="vacio-c"><b>{cartel.titular}</b> {cartel.lead}</p>
      <ul className="cargar-lista falta-lista">
        {cartel.items.map((it) => (
          <li key={it.que}><b>{it.que}</b> — {it.porque}</li>
        ))}
      </ul>
    </section>
  );
}

/**
 * EL RESUMEN DE UNA LÍNEA SIN TORRES: el recorrido levantado, y nada más.
 *
 * Se ve, y **no se calcula con él**: cada cifra va rotulada «levantado el … ·
 * sin registrar como torres», y la longitud levantada lleva escrito que NO es la
 * longitud de la línea. Un recorrido que salta placas no cubre la línea entera,
 * y presentarlo como si la cubriera es la clase de error que no se descubre
 * hasta que alguien lo compara con el papel del cliente.
 */
function ResumenDelRecorrido({ r, cartel, banda, tramo, vecinas, torres, faltan }: {
  r: RecorridoLevantado | null;
  cartel: CartelSinCalculo;
  banda: readonly FichaDeBanda[];
  tramo?: string;
  vecinas: readonly string[];
  /** Torres registradas que sí hay: con el conductor pendiente puede no ser cero. */
  torres: number;
  faltan: readonly FaltaDeLinea[];
}) {
  return (
    <>
      <FichasDeBanda fichas={banda} />
      {/* ⚠️ EL SALUDO SE DERIVA, no se escribe. Estuvo fijo en «sin torres
          registradas · conductor pendiente», y esa frase es FALSA en cuanto la
          línea tenga torres y le falte solo el conductor: mandaría a registrar
          unas torres que ya están registradas. */}
      <p className="saludo">
        Línea <b>{faltan.includes('torres')
          ? 'sin torres registradas' : `${nf(torres)} torres registradas`}</b>
        {faltan.includes('conductor') ? <> · conductor <b>pendiente</b></> : null}.
        {r
          ? <> Abajo, el recorrido <b>{r.sello}</b>: se ve, pero no se calcula con él.</>
          : <> Todavía no hay ningún recorrido levantado que enseñar.</>}
      </p>

      {r && (
        <section className="panel">
          <h2>Recorrido levantado, sin registrar como torres</h2>
          <SelloDelRecorrido r={r} />
          {tramo && (
            <p className="saludo">
              <span className="pill inf">
                {tramo}{vecinas.length ? ` · también lo recorre ${vecinas.join(' y ')}` : ''}
              </span>
              {r.desde && r.hasta ? ` de ${r.desde} a ${r.hasta}.` : ''}
            </p>
          )}
          <p className="fine">
            Esquema del recorrido levantado, <b>no un mapa</b>: sin fondo, norte arriba y la misma
            escala en los dos sentidos. Pase el ratón por un punto para ver su nombre y su cota.
          </p>
          <EsquemaRecorrido r={r} />
          <div className="kpis">
            <Kpi valor={`${nf(r.longitud_m, 1)} m`} etiqueta="levantados"
              sub="no es la longitud de la línea" />
            <Kpi valor={r.directa_m == null ? '—' : `${nf(r.directa_m, 1)} m`}
              etiqueta="dist. directa entre extremos" />
            <Kpi valor={nf(r.puntos.length)} etiqueta="puntos levantados"
              sub={`${nf(torres)} torres registradas`} />
            <Kpi valor={nf(r.vanos.length)} etiqueta="vanos levantados" />
            <Kpi valor={r.estadisticas ? `${nf(r.estadisticas.promedio, 1)} m` : '—'}
              etiqueta="vano promedio"
              sub={r.estadisticas ? `mediana ${nf(r.estadisticas.mediana, 1)} m` : undefined} />
            <Kpi valor={r.estadisticas
              ? `${nf(r.estadisticas.minimo, 1)} / ${nf(r.estadisticas.maximo, 1)}` : '—'}
              etiqueta="vano mín / máx (m)" />
          </div>
          <HallazgosDelRecorrido r={r} />
        </section>
      )}

      {r && <QuiebresDelRecorrido r={r} />}
      <LoQueFalta cartel={cartel} />
    </>
  );
}

/**
 * EL DETALLE DEL RECORRIDO: los puntos tal cual, uno por fila.
 *
 * Es lo que la pestaña «Detalle GPS» puede enseñar mientras no haya torres: el
 * mapa de siempre dibuja apoyos, y aquí no hay ninguno. La precisión de la
 * columna NO sale del archivo —el GPX no la trae—: es la que el sistema declara
 * a todo GPS de mano, y por eso va dicha y no escondida.
 */
function DetalleDelRecorrido({ r, torres }: { r: RecorridoLevantado; torres: number }) {
  return (
    <>
      <section className="panel">
        <h2>Recorrido levantado, sin registrar como torres</h2>
        <SelloDelRecorrido r={r} />
        <p className="fine">
          Esquema, no mapa: el mapa de siempre dibuja torres registradas, y aquí lo que hay es el
          recorrido tal como lo trajo el GPS.
        </p>
        <EsquemaRecorrido r={r} />
        <p className="advertencia">
          <b>Esta precisión no sirve para verificar despejes.</b> Un GPS de mano sitúa el punto en el
          plano con el error que él mismo declara, y la cota arrastra ese mismo error. Sirve para
          saber dónde está y para llegar hasta él, no para dictaminar una distancia vertical.
        </p>
      </section>

      <section className="panel">
        <h2>Coordenadas levantadas</h2>
        <p className="fine">
          {nf(r.puntos.length)} puntos · {nf(torres)} torres registradas · sistema <b>WGS84</b> · GPS de mano ·
          precisión declarada por el sistema: <b>± {nf(r.precision_m)} m</b>. Un punto por fila, en
          el orden del archivo. {r.sello}.
        </p>
        <div className="tabla-caja">
          <table className="tabla">
            <thead>
              <tr>
                <th>#</th><th>Nombre de campo</th><th>Latitud</th><th>Longitud</th>
                <th>Decimal</th><th>Cota (m)</th><th>Precisión</th>
              </tr>
            </thead>
            <tbody>
              {r.puntos.map((p) => (
                <tr key={p.n}>
                  <td className="num">{p.n}</td>
                  <td>{p.nombreCampo}{p.nota ? ` · ${p.nota}` : ''}</td>
                  <td className="num">{aGMS(p.lat, 'lat')}</td>
                  <td className="num">{aGMS(p.lon, 'lon')}</td>
                  <td className="num">{p.lat.toFixed(6)}, {p.lon.toFixed(6)}</td>
                  <td className="num">{p.ele == null ? '—' : nf(p.ele, 1)}</td>
                  <td className="num">± {nf(r.precision_m)} m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/**
 * DISTANCIAS SOBRE EL RECORRIDO LEVANTADO.
 *
 * Es la gemela de `Distancias`, y va aparte en vez de reutilizarla porque el
 * SUJETO es otro: aquélla mide entre ESTRUCTURAS —apoyos registrados, con su
 * función declarada— y ésta entre PUNTOS de un GPS que todavía no son torres.
 * Fabricar apoyos falsos para poder reutilizar el componente dejaría la decisión
 * del Ingeniero —«las torres se registran cuando yo declare la función de cada
 * una»— a un `as` de distancia de colarse en el cálculo mecánico.
 */
function DistanciasDelRecorrido({ r }: { r: RecorridoLevantado }) {
  const M = useMemo(() => {
    const n = r.puntos.length;
    const m: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    let max = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = vincenty(r.puntos[i].lat, r.puntos[i].lon,
                           r.puntos[j].lat, r.puntos[j].lon).d;
        m[i][j] = d; m[j][i] = d;
        if (d > max) max = d;
      }
    }
    return { m, max };
  }, [r]);

  // Mismo criterio de color que la matriz de la línea: sale del tablero, no de
  // un ámbar escrito aquí.
  const tono = (d: number) => d === 0 || M.max === 0 ? undefined
    : { background: `rgba(var(--calor-rgb), ${(0.06 + 0.30 * (d / M.max)).toFixed(3)})` };

  return (
    <>
      <section className="panel">
        <h2>Vanos levantados</h2>
        <SelloDelRecorrido r={r} />
        <p className="fine">
          Los {nf(r.vanos.length)} vanos entre puntos consecutivos, en el orden del archivo.
          <b> Levantados, no registrados:</b> ninguna fila es todavía un vano de la línea.
          «± dirección» es lo que puede girar el vano si sus dos extremos se corren
          ± {nf(r.precision_m)} m de través, en sentidos opuestos.
        </p>
        <Sello origen={`geodesia Vincenty sobre WGS84 · ${r.sello} · GPS de mano ± ${nf(r.precision_m)} m`} />
        <div className="tabla-caja">
          <table className="tabla">
            <thead>
              <tr>
                <th>#</th><th>Vano</th><th>Vano (m)</th><th>Progresiva (m)</th>
                <th>Azimut</th><th>Rumbo</th><th>± dirección</th><th>Δ cota GPS (m)</th>
                <th>Minutos entre marcas</th>
              </tr>
            </thead>
            <tbody>
              {r.vanos.map((v) => (
                <tr key={v.n} className={v.sospechoso ? 'excede'
                  : v.direccionDeterminada ? undefined : 'sin-comparar'}>
                  <td className="num">{v.n}</td>
                  <td>{v.desde} → {v.hasta}</td>
                  <td className="num destaca">{nf(v.longitud_m, 1)}</td>
                  <td className="num">{nf(v.progresiva_m, 1)}</td>
                  <td className="num">{nf(v.azimut_grados, 1)}°</td>
                  <td className="num">{v.rumbo}</td>
                  <td className="num">{v.margenDireccion_grados == null
                    ? 'no se puede saber' : `± ${nf(v.margenDireccion_grados, 1)}°`}</td>
                  <td className="num">{v.desnivel_m == null ? '—' : nf(v.desnivel_m, 1)}</td>
                  <td className="num">{v.minutos == null ? '—' : nf(v.minutos, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fine">
          Suma: <b>{nf(r.longitud_m, 1)} m</b> en {nf(r.vanos.length)} vanos
          {r.estadisticas ? ` · promedio ${nf(r.estadisticas.promedio, 1)} m · mediana ${nf(r.estadisticas.mediana, 1)} m` : ''}.
          No es la longitud de la línea: es lo que se recorrió.
        </p>
        <HallazgosDelRecorrido r={r} />
      </section>

      <section className="panel">
        <h2>Matriz de distancias directas (m)</h2>
        <Sello origen={`geodesia Vincenty sobre WGS84 · ${r.sello}`} />
        <div className="matriz-caja" tabIndex={0} role="region"
          aria-label="Matriz de distancias entre puntos levantados, desplazable">
          <table className="matriz">
            <thead>
              <tr>
                <th className="pegado"> </th>
                {r.puntos.map((p) => <th key={p.n}>{p.nombreCampo}</th>)}
              </tr>
            </thead>
            <tbody>
              {r.puntos.map((a, i) => (
                <tr key={a.n}>
                  <th className="pegado">{a.nombreCampo}</th>
                  {r.puntos.map((b, j) => (
                    <td key={b.n} style={tono(M.m[i][j])}
                      title={`${a.nombreCampo} → ${b.nombreCampo}: ${nf(M.m[i][j], 1)} m`}>
                      {i === j ? '—' : nf(M.m[i][j])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fine">
          Distancias geodésicas directas (Vincenty sobre WGS84), en metros, entre los puntos
          levantados. Ninguno de ellos es todavía una torre.
        </p>
      </section>
    </>
  );
}

// ── Vista principal ─────────────────────────────────────────────────────────

export function VistaLinea({ linea, apoyos, conductor, hipotesis, investigaciones = [], evidencias = [], lineas, noSePudoLeer, avisoRuta, levantamientos, vecinas, avisosDeSeries }:
  { linea: TLinea; apoyos: Apoyo[];
    /**
     * EL CONDUCTOR Y LAS HIPÓTESIS SON OPCIONALES DESDE 0.16.0, y es el cambio
     * que sostiene toda esta pantalla.
     *
     * Hasta hoy eran obligatorios, así que una línea recién dada de alta —sin
     * torres, sin conductor y sin hipótesis, que es como el Ingeniero decidió
     * el 2026-09-17 que nacen— **no llegaba aquí**: el almacén devolvía `error`
     * o `vacio`, las dos SUSTITUYEN la pantalla entera, y con ella se iba la
     * columna del parque. O sea que dar de alta LN-617 dejaba sin acceso a
     * LN-627 salvo escribiendo la dirección a mano.
     *
     * Ausentes, la línea abre igual: se pinta el parque, se pintan las quince
     * pestañas, las que pueden abrir abren, y las que no lo dicen con su motivo
     * exacto. **Nunca se sustituyen por los de otra línea** — no hay ni un sitio
     * donde pudieran colarse, porque aquí llegan ausentes, no vacíos.
     */
    conductor?: Conductor | null; hipotesis?: Hipotesis | null;
    investigaciones?: Investigacion[]; evidencias?: Evidencia[];
    /** Qué NO se pudo leer, para no afirmar «no hay» cuando fue «no se pudo mirar». */
    noSePudoLeer?: { investigaciones?: string; evidencias?: string; torres?: string;
      levantamientos?: string; hipotesis?: string };
    /** Por qué se abrió esta línea y no la que pedía el enlace. */
    avisoRuta?: string; lineas?: TLinea[];
    /** Lo levantado en campo y todavía NO registrado como torres. */
    levantamientos?: Levantamiento[];
    /** Las otras líneas que declaran recorrer su mismo tramo compartido. */
    vecinas?: LineaVecina[];
    /** Series que se decidió NO juntar, y por qué. Se pintan arriba del todo. */
    avisosDeSeries?: string[] }) {

  /**
   * Cuántos expedientes de falla siguen ABIERTOS. Es lo que decide si la pestaña
   * «Falla» va en rojo — antes iba en rojo siempre, mirara o no el dato.
   */
  const eventosAbiertos = investigaciones.filter((i) => !i.cerrada).length;

  // Quién entró y con qué permiso. Solo lo consumen las pestañas que ESCRIBEN.
  // La rebanada la arma `useQuien()` en un solo sitio (`datos/permisos.ts`):
  // lleva `claims`, que es lo que decide; el `rol` va con ella para poder
  // ENSEÑARLO, nunca para compararlo.
  const quien = useQuien();

  /**
   * Las pestañas que esta sesión puede ver.
   *
   * ⚠️ Mientras la sesión se está comprobando, la de administración NO aparece:
   * el defecto contrario —enseñarla y quitarla al llegar la respuesta— haría que
   * la fila de pestañas saltara justo cuando él va a pulsar, y acabaría entrando
   * en otra pantalla sin saber por qué.
   */
  const visibles = useMemo(
    () => PESTANAS.filter((p) => {
      const exige = exigeDe(p);
      return exige === null || puede(quien, exige);
    }),
    [quien],
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
  // ⚠️ EL NOMBRE VIEJO SIGUE LLEVANDO AL SITIO. La pestaña «Cargabilidad» pasó
  // a llamarse «Parámetros eléctricos» el 2026-09-07 (`99 §ADR-106`), y con
  // ella su identificador en la dirección. Un enlace guardado con el nombre
  // viejo no puede caer en Resumen sin decir por qué: se redirige, que es lo
  // que se hace con una dirección que cambia de nombre y no de destino.
  const ALIAS_DE_PESTANA: Record<string, string> = { cargabilidad: 'parametros' };
  const leerHash = (): IdPestana | null => {
    const m = /^#\/[^/]*\/([a-z]+)$/.exec(location.hash);
    const id = m?.[1] ? (ALIAS_DE_PESTANA[m[1]] ?? m[1]) : undefined;
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

  // ── QUÉ TIENE Y QUÉ LE FALTA A ESTA LÍNEA ───────────────────────────────
  // Se deriva de lo que REALMENTE llegó, no de una bandera: el mismo umbral de
  // siempre (`repositorio.ts §faltasDeLinea`) —menos de dos puntos no es media
  // línea, es ningún vano— solo que ahora se NOMBRA en vez de tumbar la vista.
  //
  // ⚠️ LAS HIPÓTESIS DECLARADAS Y NO LEÍDAS CUENTAN COMO AUSENTES, y tienen que
  // contar: sin ellas no hay cálculo posible, se declaren o no. Lo que cambia es
  // lo que se DICE — el renglón del cartel explica que la línea sí las declara y
  // que lo que falló fue traerlas, y el aviso de arriba da el motivo. Decir «las
  // entrega usted después» de unas hipótesis ya entregadas mandaría al Ingeniero
  // a rehacer un trabajo hecho (`32 · L-44`).
  const faltan = useMemo<FaltaDeLinea[]>(() => {
    const f: FaltaDeLinea[] = [];
    if (apoyos.length < 2) f.push('torres');
    if (!conductor) f.push('conductor');
    if (!hipotesis) f.push('hipotesis');
    return f;
  }, [apoyos.length, conductor, hipotesis]);
  const calcula = faltan.length === 0;

  /** El recorrido levantado más reciente, si hay alguno. */
  const recorrido = useMemo<RecorridoLevantado | null>(() => {
    const lev = ordenarLevantamientos(levantamientos ?? [])[0];
    return lev ? recorridoLevantado(lev) : null;
  }, [levantamientos]);

  // Los códigos de las series que esta pantalla lee: la línea y sus tramos
  // compartidos abiertos. Solo para RECORTAR prefijos en los rótulos — el
  // código de una línea no vuelve a escribirse dentro de un componente.
  const series = useMemo(() => seriesDeLinea(linea), [linea]);
  const codigosDeSerie = useMemo(() => series.map((s) => s.codigo), [series]);
  const tramoAbierto = useMemo(() => {
    const t = series.find((s) => s.tipo === 'tramo');
    return t ? rotuloDeTramo(t.codigo) : undefined;
  }, [series]);
  // Para el borrador: la vecina con lo que le falta, que es lo que el papel
  // nombra («su veredicto depende también de ellas»).
  const vecinasParaExportar = useMemo(
    () => (vecinas ?? []).map((v) => ({
      codigo: v.linea.codigo,
      faltan: [...(v.linea.conductor ? [] : ['conductor']),
        ...(v.linea.hipotesisId ? [] : ['hipotesis'])],
    })), [vecinas]);

  const codigosVecinos = useMemo(
    () => (vecinas ?? []).map((v) => v.linea.codigo), [vecinas]);

  /**
   * TODO LO QUE HAY QUE ADVERTIR DEL DATO, en la lista y el orden que decidió su
   * dueño (`repositorio.ts §avisosDeDatos`). Se le pasa un estado recortado a lo
   * que esa función mira —y solo mira eso— porque aquí llegan las piezas
   * sueltas, ya desestructuradas por quien monta la pantalla.
   */
  const avisos = useMemo(
    () => avisosDeDatos({ fase: 'listo', avisosDeSeries, noSePudoLeer } as EstadoDatos),
    [avisosDeSeries, noSePudoLeer]);

  /** El cartel de la pestaña abierta, o nulo si esa pestaña sí puede abrir. */
  const contexto = useMemo(() => ({
    codigoLinea: linea.codigo,
    faltanEnLaLinea: faltan,
    tramo: tramoAbierto,
    vecinas: codigosVecinos,
    fechaDelRecorrido: recorrido ? fechaDeCampoCorta(recorrido.fecha) : undefined,
    hipotesisIlegibles: noSePudoLeer?.hipotesis,
  }), [linea.codigo, faltan, tramoAbierto, codigosVecinos, recorrido, noSePudoLeer?.hipotesis]);

  /** El cartel de la pestaña abierta. Nulo = esa pestaña sí puede abrir. */
  const cartel = useMemo(
    () => cartelDePestana(activa, PESTANAS.find((p) => p.id === activa)?.rotulo ?? activa, contexto),
    [activa, contexto]);
  /** El cartel de la línea entera, para cerrar el Resumen. */
  const cartelLinea = useMemo(() => cartelDeLaLinea(contexto), [contexto]);
  /** Las cuatro fichas de la banda cuando la línea todavía no calcula. */
  const banda = useMemo(() => bandaSinCalculo({
    eventosAbiertos,
    eventosIlegibles: noSePudoLeer?.investigaciones,
    faltan,
    fechaDelRecorrido: recorrido ? fechaDeCampoCorta(recorrido.fecha) : undefined,
    hipotesisIlegibles: noSePudoLeer?.hipotesis,
  }), [eventosAbiertos, noSePudoLeer?.investigaciones, noSePudoLeer?.hipotesis, faltan, recorrido]);

  // EL CIELO. Sale de los dos ejes REALES —los mismos que pinta la pestaña
  // Cargas, por el mismo dueño— y de los expedientes sin cerrar. Ni un texto
  // fijo, ni una bandera escrita a mano: si mañana el inventario trae las
  // fichas, el cielo amanece solo.
  //
  // ⚠️ SIN CONDUCTOR NI HIPÓTESIS NO SE CALCULA NADA, ni siquiera para
  // descartarlo: `ejesDeLinea` sobre cero apoyos devolvería un cielo «0/0», que
  // es justo el cero en rojo que el Ingeniero no quiere ver en una línea que
  // todavía no tiene nada que contar.
  const ejes = useMemo(
    () => (calcula && conductor && hipotesis
      ? ejesDeLinea(apoyos, conductor, hipotesis, linea.circuitos) : null),
    [calcula, apoyos, conductor, hipotesis, linea.circuitos]);
  const vanosLinea = useMemo(
    () => (calcula && conductor && hipotesis ? vanosDeLinea(apoyos, conductor, hipotesis) : null),
    [calcula, apoyos, conductor, hipotesis]);

  const estado = useMemo(() => {
    if (!ejes || !hipotesis) return null;
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

      {/* Antes que cualquier pestaña: lo que esta pantalla NO está viendo. */}
      <AvisosDeDatos avisos={avisos} />

      <div className="cuerpo">
        <nav className="col-parque" aria-label="Parque de líneas">
          <div className="col-rotulo">Parque · {parque.length}</div>
          <div className="parque-lista">
            {parque.map((l) => {
              // ── QUÉ SE LEE BAJO CADA LÍNEA DEL PARQUE ─────────────────────
              // El tramo compartido y la ausencia de conductor e hipótesis las
              // dice el DOCUMENTO de la línea, que el parque ya tiene: cuestan
              // cero lecturas y valen igual para la abierta y para las cerradas.
              //
              // ⚠️ «SIN TORRES REGISTRADAS» SOLO SE AFIRMA DE LA LÍNEA ABIERTA,
              // que es de la única de la que consta: sus torres ya se leyeron.
              // De una línea cerrada haría falta una lectura más —la maqueta M4
              // la deja marcada como «cómo se sabe», sin decidir—, y escribirlo
              // sin haber mirado sería afirmar lo que no se comprobó.
              const t = seriesDeLinea(l).find((s) => s.tipo === 'tramo');
              const suyas: FaltaDeLinea[] = l.id === linea.id ? faltan
                : [...(l.conductor ? [] : ['conductor' as FaltaDeLinea]),
                   ...(l.hipotesisId ? [] : ['hipotesis' as FaltaDeLinea])];
              const falta = faltaEnElParque(suyas);
              return (
              <button
                key={l.id}
                type="button"
                className="parque-linea"
                aria-current={l.id === linea.id}
                onClick={() => { if (l.id !== linea.id) void almacen.abrir(l.id); }}
              >
                <span className="parque-id">{l.codigo}</span>
                <span className="parque-sub">{nf(l.tensionNominal_kV)} kV</span>
                {t && <span className="parque-sub parque-tramo">{rotuloDeTramo(t.codigo)}</span>}
                {falta && <span className="parque-sub parque-falta">{falta}</span>}
                {/* SIN CONTADOR mientras no haya torres: «0/0» no es un cero
                    malo, es que no hay nada que contar, y el motivo de arriba ya
                    lo dice (orden del Ingeniero, maqueta M4). */}
                {l.id === linea.id && estado && (
                  <span className="parque-ver" data-cero={estado.dictaminados === 0}>
                    <b>{nf(estado.dictaminados)}/{nf(estado.total)}</b> con veredicto
                  </span>
                )}
              </button>
              );
            })}
          </div>
          {/* DAR DE ALTA OTRA LÍNEA. Solo se ofrece a quien puede hacerlo: crear
              la línea y cargar su trazado. Esconderlo a los demás es cosmético
              —quien decide son las reglas—, pero ofrecer un botón que va a ser
              denegado es peor que no ofrecerlo. */}
          {puede(quien, 'lineas.editar') && puede(quien, 'cargar.puntos') && (
            <button type="button" className="boton chico parque-alta"
              onClick={() => almacen.abrirAlta()}>
              + Alta de línea
            </button>
          )}
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
            {visibles.map((p) => {
              // LAS QUE NO PUEDEN CALCULAR **NO SE APAGAN**: se abren, y dentro
              // dicen qué falta. Una pestaña apagada obliga a adivinar por qué;
              // el motivo viaja además en el `title` para quien la sobrevuele.
              // Con la línea completa esto es `''` y el `title` sigue sin
              // existir: LN-627 se ve exactamente igual que antes.
              const suyas = faltasDePestana(p.id, faltan);
              const motivo = motivoDeFaltas(suyas);
              return (
              <button
                key={p.id}
                id={`pestana-${p.id}`}
                role="tab"
                aria-selected={activa === p.id}
                aria-controls="panel-linea"
                tabIndex={activa === p.id ? 0 : -1}
                className={'pestana' + (activa === p.id ? ' activa' : '')
                  + (p.id === 'falla' && eventosAbiertos ? ' roja' : '')}
                disabled={!p.lista}
                title={p.lista ? (motivo || undefined) : 'En construcción'}
                onClick={() => p.lista && irA(p.id)}
              >
                {p.rotulo}
              </button>
              );
            })}
          </div>
        </nav>

        <div className="col-contenido">
          {estado ? (
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
          ) : (
          /* EL CIELO DE UNA LÍNEA QUE TODAVÍA NO CALCULA. Ni «0/0» ni un cero en
             rojo: el medidor dice con palabras que no hay nada que contar. Un
             cero rojo se lee como «veintiocho torres suspendidas», y aquí no hay
             ni una torre. */
          <div className="cielo cielo-niebla" role="status">
            <div className="cielo-txt">
              <span className="cielo-rotulo">Sin cálculo</span>
              <span className="cielo-porque">{porQueNoCalcula(linea.codigo, faltan)}</span>
            </div>
            <span className="cielo-medidor">
              <b>{faltan.includes('torres') ? 'sin torres' : 'sin cálculo'}</b>
              <span>apoyos con veredicto · los dos ejes</span>
            </span>
          </div>
          )}

          {/* `dictaminados` ya no se pasa: el dibujo lo pide al dueño del cruce
              (`coberturaEjes.ts`), el mismo que alimenta este contador de
              arriba. Pasárselo por separado era la puerta a que el rótulo y el
              dibujo dijeran cifras distintas.

              ⚠️ EN «DETALLE GPS» NO SE PINTA, por orden del Ingeniero
              (`99 §ADR-063`). Esa pestaña es el recorrido a pantalla entera y el
              horizonte le robaba el primer golpe de vista sin añadirle nada: los
              mismos apoyos, dibujados dos veces y con dos criterios distintos
              —uno geográfico y otro por orden de vano—. Sigue intacto en el
              resto de pestañas, que es donde sí es lo primero que hay que ver. */}
          {activa !== 'gps' && (
            <Horizonte ejes={ejes} vanos={vanosLinea} total={estado?.total ?? null}
              puntosLevantados={recorrido?.puntos.length ?? 0}
              torres={apoyos.length} faltan={faltan} />
          )}

      <div id="panel-linea" role="tabpanel" aria-labelledby={`pestana-${activa}`}>
        {/* EL CARTEL MANDA. Si a esta pestaña le falta algo SUYO, lo dice con el
            motivo exacto y no se monta nada más: así no puede quedar media
            pantalla calculada con huecos. Y como el cartel se decide en
            `vistas/recorrido.ts`, cada `conductor &&` de abajo es solo lo que
            TypeScript necesita para creerse lo que aquél ya garantizó. */}
        {cartel && <CartelNoCalcula cartel={cartel} />}

        {!cartel && activa === 'resumen' && (conductor && hipotesis && calcula ? (
          <Resumen apoyos={apoyos} investigaciones={investigaciones}
            alVerEvento={() => irA('falla')}
            hipotesis={hipotesis} conductor={conductor} codigos={codigosDeSerie} />
        ) : cartelLinea && (
          <ResumenDelRecorrido r={recorrido} cartel={cartelLinea} banda={banda}
            tramo={tramoAbierto} vecinas={codigosVecinos}
            torres={apoyos.length} faltan={faltan} />
        ))}
        {/* ⚠️ UNA SOLA PANTALLA PARA LAS TRES LÍNEAS (`99 §ADR-139`, orden del
            Ingeniero del 22-09: «todo el esquema de LN-627 replicado en las
            líneas que van ingresando»).

            Antes esta guarda era `hipotesis && apoyos.length >= 2` y mandaba a
            OTRO componente —otro título, sin mapa, sin atlas, sin cable de
            guarda—. Dos cosas estaban mal en ella:

            ① `hipotesis` sobraba. `DetalleGps` la declara OPCIONAL y solo se la
               pasa al atlas para una leyenda. Exigirla aquí dejaba fuera la
               pantalla entera por un rótulo, y además `App.tsx` la fuerza a
               `null` en fase «recorrido»: con esa guarda, una línea SIN
               CONDUCTOR no vería nunca el mapa aunque tuviera sus 28 torres.
            ② `apoyos.length >= 2` daba por hecho que dibujar exige torres.
               Dibujar exige POSICIÓN, y un recorrido levantado la tiene.

            Ahora entra quien tenga dos puntos, vengan de donde vengan. Lo que
            de verdad falta —función, tramos, cable de guarda— lo dice la propia
            pantalla en el sitio del bloque, que es lo que él pidió. */}
        {!cartel && activa === 'gps' && (apoyos.length >= 2 || (recorrido?.puntos.length ?? 0) >= 2 ? (
          <DetalleGps apoyos={apoyos} recorrido={recorrido ?? undefined}
            investigaciones={investigaciones}
            alVerEvento={() => irA('falla')} hipotesis={hipotesis ?? undefined}
            codigoLinea={linea.codigo} codigos={codigosDeSerie}
            sesion={quien && { rol: quien.rol, claims: quien.claims }} />
        ) : recorrido ? <DetalleDelRecorrido r={recorrido} torres={apoyos.length} /> : (
          <section className="panel vacio">
            <div className="vacio-t">{linea.codigo} no tiene todavía recorrido que enseñar</div>
            <p className="vacio-c">
              Ni torres registradas ni ningún recorrido levantado con GPS. No es un hueco de la
              aplicación: es el estado de la línea.
            </p>
          </section>
        ))}
        {activa === 'falla' && <Falla investigaciones={investigaciones} apoyos={apoyos} evidencias={evidencias} noSePudoLeer={noSePudoLeer?.investigaciones} noSePudoLeerFotos={noSePudoLeer?.evidencias} />}
        {!cartel && activa === 'distancias' && (apoyos.length >= 2
          ? <Distancias apoyos={apoyos} codigos={codigosDeSerie} />
          : recorrido ? <DistanciasDelRecorrido r={recorrido} /> : (
          <section className="panel vacio">
            <div className="vacio-t">{linea.codigo} no tiene entre qué medir</div>
            <p className="vacio-c">
              Hacen falta al menos dos puntos: ni torres registradas ni recorrido levantado.
            </p>
          </section>
        ))}
        {/* La sesión viaja a Fichas por el mismo motivo por el que ya viajaba a
            Cargar: desde que esta pestaña ESCRIBE, saber con qué permiso se
            entró deja de ser un lujo — sin eso, quien no pueda escribir lo
            descubriría por una denegación de la base, en inglés y después de
            rellenar seis campos. Se pasa aunque la sesión aún no conste: Fichas
            SIEMPRE se puede leer, y es el botón lo que se guarda. */}
        {!cartel && activa === 'fichas' && conductor && hipotesis && (
          <Fichas apoyos={apoyos} linea={linea} conductor={conductor} hipotesis={hipotesis}
            evidencias={evidencias} noSePudoLeerFotos={noSePudoLeer?.evidencias}
            sesion={quien} codigos={codigosDeSerie} />
        )}
        {/* ⚠️ EL HUECO EN BLANCO QUE ESPERABA (`99 §ADR-139`). La tabla de
            requisitos pide solo TORRES para esta pestaña, y es deliberado: una
            ficha no «calcula», es de una torre, y nombrar ahí el conductor
            mandaría a buscar algo que no pinta nada (maqueta M2, aprobada).
            Pero el JSX de arriba sí exige `conductor && hipotesis`. Con las
            torres ya registradas y el conductor todavía pendiente —el estado
            siguiente de LN-617 y LN-628— no salía NI cartel NI contenido: un
            panel vacío, sin una palabra. Hoy no se ve porque no hay torres; se
            habría visto justo al avanzar.
            Se tapa aquí y no aflojando la tabla, para no contradecir lo que él
            aprobó y para que el motivo se lea donde ocurre. */}
        {!cartel && activa === 'fichas' && !(conductor && hipotesis) && (
          <section className="panel">
            <h2>Fichas</h2>
            <p className="aviso">
              <b>Las torres ya están registradas; falta con qué llenar su ficha.</b> La ficha de un
              apoyo lleva sus tiros y su flecha, y eso sale del <b>conductor</b> y de las{' '}
              <b>hipótesis</b> de la línea. Mientras no consten, no hay ficha que emitir — y no se
              toma el conductor de otra línea.
            </p>
            <p className="fine">
              Se llena sola, aquí mismo, en cuanto la línea tenga conductor e hipótesis declarados.
            </p>
          </section>
        )}
        {!cartel && activa === 'mecanico' && conductor && hipotesis && <Mecanico apoyos={apoyos} conductor={conductor} hipotesis={hipotesis} />}
        {!cartel && activa === 'fundamentos' && conductor && hipotesis && <Fundamentos apoyos={apoyos} conductor={conductor} hipotesis={hipotesis} codigos={codigosDeSerie} />}
        {!cartel && activa === 'termica' && conductor && hipotesis && <Termica linea={linea} conductor={conductor} hipotesis={hipotesis} />}
        {/* Perezosa a propósito: trae el lector de `.xlsx` y las gráficas, y
            quien no abra la pestaña no baja un byte de eso. */}
        {activa === 'parametros' && (
          <Suspense fallback={<p className="fine">Preparando el lector de archivos…</p>}>
            {/* ⚠️ El conductor y la hipótesis, como ya se le pasan a Térmica
                cinco líneas más arriba. Sin ellos la pantalla no puede calcular
                la ampacidad, y sin ampacidad no hay veredicto: solo el
                porcentaje que trae el archivo, contra la capacidad NOMINAL
                (`99 §ADR-093`). Esta pestaña ABRE IGUAL sin ellos —lee el
                histórico por el código de la línea— y ella misma dice lo que no
                puede dictaminar.
                ⚠️ LA LONGITUD, SOLO SI HAY LÍNEA QUE MEDIR. Sin torres,
                `derivarLevantamiento` daría cero metros y las pérdidas saldrían
                a cero: un número inventado por el lado tranquilizador. Nulo es
                «no consta», y la pantalla lo dice. */}
            <Cargabilidad lineaAbierta={linea.codigo}
              lineasDelParque={parque.map((l) => l.codigo)}
              conductor={conductor} hipotesis={hipotesis}
              tensionNominal_kV={linea.tensionNominal_kV}
              longitud_m={apoyos.length >= 2 ? derivarLevantamiento(apoyos).longitud_m : null}
              sesion={quien && { rol: quien.rol, orgId: quien.orgId, uid: quien.uid, claims: quien.claims }} />
          </Suspense>
        )}
        {!cartel && activa === 'viento' && conductor && hipotesis && <Viento apoyos={apoyos} conductor={conductor} hipotesis={hipotesis} />}
        {!cartel && activa === 'cargas' && conductor && hipotesis && <Cargas linea={linea} apoyos={apoyos} conductor={conductor} hipotesis={hipotesis} />}
        {!cartel && activa === 'cantidades' && conductor && hipotesis && <Cantidades linea={linea} apoyos={apoyos} conductor={conductor} hipotesis={hipotesis} />}
        {/* EXPORTAR SE MONTA SIEMPRE, también sin conductor ni torres: es la
            pestaña que saca el BORRADOR no firmable, y con el cartel delante no
            se alcanzaba nunca (revisión del 17-09). El cartel sigue arriba
            diciendo qué falta; debajo, la pestaña con sus botones apagados. */}
        {activa === 'exportar' && (
          <Exportar linea={linea} apoyos={apoyos} conductor={conductor ?? undefined}
            hipotesis={hipotesis ?? undefined} investigaciones={investigaciones}
            levantamientos={levantamientos ?? []} vecinas={vecinasParaExportar} />
        )}
        {/* La sesión se vuelve a comprobar aquí: `visibles` decide si la pestaña
            se enseña, y esto decide si el panel se pinta. Son dos guardas del
            mismo hecho a propósito — la primera puede quedarse vieja si el
            permiso cambia con la pantalla abierta. */}
        {activa === 'cargar' && quien && (
          <Cargar linea={linea} apoyos={apoyos} sesion={quien} />
        )}
        {/* La sesión se pasa AUNQUE aún no conste: esta pantalla siempre se
            puede mirar —el reparto se revisa sin escribir nada— y lo que se
            guarda es el botón. Lo mismo que ya se hace con Fichas. */}
        {!cartel && activa === 'fotos' && (
          <Fotos linea={linea} apoyos={apoyos} evidencias={evidencias}
            sesion={quien} />
        )}
      </div>
        </div>
      </div>
    </>
  );
}
