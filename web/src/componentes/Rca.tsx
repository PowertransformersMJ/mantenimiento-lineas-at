// ============================================================================
// componentes/Rca.tsx — el segmento de análisis de causa raíz
// ----------------------------------------------------------------------------
// Vive FUERA de la vista de una línea, y no es un capricho de navegación: un
// análisis puede abarcar varias líneas, o ninguna todavía. Dentro de una línea,
// el patrón más caro de un parque —el mismo componente fallando en apoyos de
// líneas distintas— sería invisible por construcción.
//
// LO QUE ESTA PANTALLA HACE DISTINTO, y es todo el punto:
//
//   · El objeto central NO es la causa: es la TABLA DE DESCARTES. Las once
//     familias de causas se pintan siempre, todas, en el mismo orden, aunque
//     nadie las haya mirado. Una espina que desaparece al faltar el dato se lee
//     como «eso ya no aplica».
//   · Hay un bloque fijo con LO QUE ESTE ANÁLISIS NO PUEDE AFIRMAR. Un informe
//     que omite sus límites parece más fuerte y es más frágil.
//   · **NO HAY BOTÓN DE CERRAR** mientras falte alguna condición. En su sitio va
//     la lista de lo que falta. Un botón deshabilitado invita a buscar cómo
//     habilitarlo; una lista de lo que falta invita a ir a buscarlo.
//   · No hay ranking de hipótesis, ni causa sugerida, ni porcentaje de avance.
//     Ordenar es dictaminar, y un análisis «al 92 %» empuja a cerrar.
//
// Todo el juicio lo hace `nucleo/rca.js`, que es puro y está probado. Aquí se
// pinta; no se decide.
// ============================================================================
import { useState } from 'react';
import {
  evaluarEspinas, revisarHipotesis, condicionesCausaRaiz,
  resumenBarreras, auditarRespaldo, fuerzaCadena, diagnosticoCadena,
} from '@lineas/nucleo/rca';
import type { AnalisisCausa, Evidencia } from '@lineas/contratos';
import { almacen, useRca } from '../datos/enlace';
import { nf } from '../vistas/formato';

/** Cómo se lee cada espina en pantalla. El código interno no se le enseña a nadie. */
const ROTULO_ESPINA: Record<string, string> = {
  conductor: 'Conductor',
  conexiones_empalmes: 'Conexiones y empalmes',
  aislamiento_herrajes: 'Aislamiento y herrajes',
  estructura_cimentacion: 'Estructura y cimentación',
  tierra_apantallamiento: 'Puesta a tierra y apantallamiento',
  ambiente_clima: 'Ambiente y clima',
  vegetacion_servidumbre: 'Vegetación y servidumbre',
  diseno_hipotesis: 'Diseño e hipótesis de cálculo',
  montaje_tendido: 'Montaje y tendido',
  operacion_maniobra: 'Operación y maniobra',
  inspeccion_mantenimiento: 'Inspección y mantenimiento',
};

const ROTULO_NIVEL: Record<string, string> = {
  efecto: 'efecto',
  modo_falla: 'modo de falla',
  mecanismo_fisico: 'mecanismo físico',
  condicion: 'condición',
  regla: 'regla',
};

// ── El índice del segmento ──────────────────────────────────────────────────

function Indice({ analisis }: { analisis: AnalisisCausa[] }) {
  if (!analisis.length) {
    return (
      <section className="panel vacio">
        <div className="vacio-t">Todavía no hay ningún análisis de causa raíz</div>
        <p className="vacio-c">
          Este segmento vive <b>fuera</b> de las líneas a propósito: un análisis puede abarcar
          varias, o ninguna todavía. La causa raíz más cara de un parque es la que se repite — el
          mismo componente fallando en apoyos de líneas distintas es <b>una</b> causa raíz y
          <b> varios</b> eventos, y desde dentro de una línea ese patrón no se ve.
        </p>
        <p className="fine">
          El primero se abre desde un evento de falla. Esa conexión es lo siguiente que se
          construye; hasta entonces la lista está vacía, y estar vacía es su estado correcto —
          no se rellena con ejemplos.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Análisis de causa raíz · {nf(analisis.length)}</h2>
      <div className="tabla-caja">
        <table className="tabla">
          <thead>
            <tr><th>Código</th><th>Título</th><th>Estado</th><th>Alcance</th><th className="num">Abierto</th></tr>
          </thead>
          <tbody>
            {analisis.map((a) => {
              const n = a.alcance.lineaIds.length + a.alcance.apoyoIds.length + a.alcance.investigacionIds.length;
              return (
                <tr key={a.id} onClick={() => void almacen.verAnalisis(a.id)} style={{ cursor: 'pointer' }}>
                  <td className="destaca">{a.codigo}</td>
                  <td>{a.titulo}</td>
                  <td>{a.estado === 'cerrado'
                    ? <span className="pill ok">cerrado</span>
                    : a.estado === 'sin_conclusion'
                      ? <span className="pill av">sin conclusión</span>
                      : <span className="pill inf">{a.estado}</span>}</td>
                  <td>{n ? `${n} elemento(s)` : <span className="h-pill">sin activo identificado</span>}</td>
                  <td className="num">{a.abiertoEn?.slice(0, 10)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Un análisis abierto ─────────────────────────────────────────────────────

function Abierto({ a, evidencias }: { a: AnalisisCausa; evidencias: Evidencia[] }) {
  const hipotesis = revisarHipotesis(a.hipotesis);
  const cond = condicionesCausaRaiz(a);
  const barreras = resumenBarreras(a.arbol);
  const respaldo = auditarRespaldo(a);
  const faltan = cond.condiciones.filter((c) => !c.cumple);

  return (
    <>
      <div className="rca-cab">
        <button type="button" className="boton chico" onClick={() => almacen.volverAlIndice()}>← Todos los análisis</button>
        <h2 className="linea-titulo">{a.codigo} — {a.titulo}</h2>
      </div>

      <TablaDescartes a={a} evidencias={evidencias} />

      {/* LAS CADENAS */}
      {a.cadenas.length > 0 && (
        <section className="panel">
          <h2>Los porqués</h2>
          {a.cadenas.map((c) => {
            const f = fuerzaCadena(c);
            return (
              <div key={c.id} className="rca-cadena">
                <div className="rca-cadena-cab">
                  {ROTULO_ESPINA[c.espina] ?? c.espina}
                  <span className={f.esAccionable ? 'pill ok' : 'pill av'}>
                    {f.esAccionable ? 'accionable' : 'no llega a causa raíz'}
                  </span>
                </div>
                <ol className="rca-eslabones">
                  {c.eslabones.map((x, i) => (
                    <li key={i}>
                      <span className="rca-nivel">{ROTULO_NIVEL[x.nivel] ?? x.nivel}</span>
                      {x.enunciado}
                      {(x.evidenciaIds ?? []).length === 0 && !x.cortadaPorFaltaDeDato
                        && <span className="h-pill grave">sin evidencia</span>}
                      {x.cortadaPorFaltaDeDato && <i className="fine"> · cortada: {x.cortadaPorFaltaDeDato}</i>}
                    </li>
                  ))}
                </ol>
                <p className="fine">{diagnosticoCadena(c)}</p>
              </div>
            );
          })}
        </section>
      )}

      {/* HIPÓTESIS — con lo que las refutaría, que es lo que las hace hipótesis */}
      {hipotesis.length > 0 && (
        <section className="panel">
          <h2>Hipótesis</h2>
          <p className="fine">
            No van ordenadas por fuerza: ordenar es dictaminar. Cada una declara qué evidencia la
            <b> refutaría</b> — una hipótesis que nada puede tumbar no es una hipótesis.
          </p>
          <div className="tabla-caja">
            <table className="tabla">
              <thead><tr><th>Enunciado</th><th>Familia</th><th>Verosimilitud</th><th>Qué la refutaría</th></tr></thead>
              <tbody>
                {hipotesis.map((h) => (
                  <tr key={h.id}>
                    <td>{h.enunciado}</td>
                    <td>{ROTULO_ESPINA[h.espina] ?? h.espina}</td>
                    <td>
                      <span className={h.verosimilitudEfectiva === 'descartada' ? 'pill ok' : 'pill av'}>
                        {h.verosimilitudEfectiva}
                      </span>
                      {h.topadaPorClima && <div className="rca-defecto">⚠ topada: sustento solo climático</div>}
                      {h.defectos.map((d: string) => <div key={d} className="rca-defecto">⚠ {d}</div>)}
                    </td>
                    <td>{h.queLaRefutaria || <span className="h-pill grave">no lo declara</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* BARRERAS — la pregunta que suele valer más que la causa */}
      {barreras.analizadas > 0 && (
        <section className="panel">
          <h2>Qué defensa debió detenerlo</h2>
          {barreras.aviso && <p className="alerta">{barreras.aviso}</p>}
          <ul className="calidad-lista">
            {barreras.cuales.map((b, i: number) => (
              <li key={i} className="calidad-item atencion"><b>{b.cual}</b> — {b.estado}. {b.detalle}</li>
            ))}
          </ul>
        </section>
      )}

      {/* LO QUE NO SE PUEDE AFIRMAR — bloque fijo */}
      <section className="panel">
        <h2>Lo que este análisis NO puede afirmar hoy</h2>
        {a.ausencias.length === 0 && a.limitaciones.length === 0 ? (
          <p className="fine">Nada declarado todavía. Un análisis sin límites declarados suele
            significar que aún no se han buscado.</p>
        ) : (
          <ul className="calidad-lista">
            {a.ausencias.map((x, i) => (
              <li key={`a${i}`} className="calidad-item aviso">
                <b>{x.que}</b> — {x.porQue}
                {x.quienLoTiene && <> · lo tiene: {x.quienLoTiene}</>}
                {' '}<span className="h-pill">{x.estado}</span>
              </li>
            ))}
            {a.limitaciones.map((x, i) => (
              <li key={`l${i}`} className="calidad-item info">{x}</li>
            ))}
          </ul>
        )}
        {respaldo.aviso && <p className="alerta">{respaldo.aviso}</p>}
        <p className="fine">
          {nf(respaldo.sinRespaldo)} de {nf(respaldo.totalAfirmaciones)} afirmaciones no tienen
          evidencia enlazada.
        </p>
      </section>

      {/* EL CIERRE — sin botón mientras falte algo */}
      <section className="panel">
        <h2>Causa raíz</h2>
        {a.causaRaiz ? (
          <>
            <p className="ok"><b>{a.causaRaiz.enunciado}</b></p>
            <p className="fine">Declarada por una persona el {a.causaRaiz.declaradaEn?.slice(0, 10)}.</p>
            {a.causaRaiz.condicionesNoCumplidas.length > 0 && (
              <p className="alerta">
                Se declaró con {a.causaRaiz.condicionesNoCumplidas.length} condición(es) sin cumplir.
                Queda constancia: {a.causaRaiz.condicionesNoCumplidas.join(' · ')}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="fine">
              Todavía no hay causa raíz declarada, y durante días ése es el estado normal. El
              sistema <b>no la propone</b>: calcula qué condiciones se cumplen y quién firma decide.
            </p>
            <ul className="calidad-lista">
              {cond.condiciones.map((c) => (
                <li key={c.clave} className={c.cumple ? 'calidad-item info' : 'calidad-item atencion'}>
                  {c.cumple ? '✓ ' : '✗ '}{c.texto}
                  {c.detalle && <><br /><i className="fine">{c.detalle}</i></>}
                </li>
              ))}
            </ul>
            {/* Aquí NO hay botón de cerrar. En su sitio, lo que falta. */}
            <p className="fine">
              {faltan.length === 0
                ? 'Se cumplen las seis condiciones. Declarar la causa raíz sigue siendo un acto de quien firma.'
                : `Faltan ${faltan.length} de ${cond.total} condiciones para poder declarar una causa raíz.`}
            </p>
          </>
        )}
      </section>
    </>
  );
}


/**
 * LA TABLA DE DESCARTES, EDITABLE.
 *
 * Es el corazón del método y por eso se rellena aquí, no en un formulario
 * aparte: el defecto aparece EN EL MOMENTO en que se comete. Si alguien marca
 * «descartada» sin evidencia, la fila lo dice en el acto — no al guardar, ni en
 * un resumen al final que nadie lee.
 *
 * Las once salen siempre, incluso las que nadie ha tocado.
 */
function TablaDescartes({ a, evidencias }: { a: AnalisisCausa; evidencias: Evidencia[] }) {
  const [borrador, setBorrador] = useState(() => {
    // Se indexa por TEXTO a propósito: mientras se edita, «estado» puede estar
    // vacío —«sin mirar»—, que no es un valor del contrato. Solo lo que tiene
    // estado se manda a validar.
    const m = new Map<string, (typeof a.espinas)[number]>(a.espinas.map((e) => [e.espina, e]));
    return evaluarEspinas(a.espinas).map((e) => ({
      espina: e.espina,
      estado: m.get(e.espina)?.estado ?? '',
      motivo: m.get(e.espina)?.motivo ?? '',
      datoQueFalta: m.get(e.espina)?.datoQueFalta ?? '',
      evidenciaIds: m.get(e.espina)?.evidenciaIds ?? [],
    }));
  });
  const [guardando, setGuardando] = useState(false);

  const tocar = (espina: string, campo: string, valor: string) =>
    setBorrador((b) => b.map((x) => (x.espina === espina ? { ...x, [campo]: valor } : x)));

  /** Enlazar y desenlazar es simétrico: una evidencia mal puesta se quita igual de fácil. */
  const alternarEvidencia = (espina: string, evId: string) =>
    setBorrador((b) => b.map((x) => (x.espina !== espina ? x : {
      ...x,
      evidenciaIds: x.evidenciaIds.includes(evId)
        ? x.evidenciaIds.filter((i) => i !== evId)
        : [...x.evidenciaIds, evId],
    })));

  // El juicio lo hace el motor, en vivo. La pantalla no decide nada.
  const conEstado = borrador.filter((x) => x.estado);
  const juicio = new Map<string, { defectos: string[] }>(
    evaluarEspinas(conEstado.map((x) => ({ ...x, datoQueFalta: x.datoQueFalta || undefined })))
      .map((e: { espina: string; defectos: string[] }) => [e.espina, e]),
  );

  const guardar = async () => {
    setGuardando(true);
    try {
      await almacen.guardarEspinas(conEstado.map((x) => ({
        espina: x.espina, estado: x.estado, motivo: x.motivo,
        evidenciaIds: x.evidenciaIds,
        ...(x.datoQueFalta ? { datoQueFalta: x.datoQueFalta } : {}),
      })));
    } finally { setGuardando(false); }
  };

  const sinMotivo = conEstado.filter((x) => !x.motivo.trim()).length;

  return (
    <section className="panel">
      <h2>Las once familias de causas</h2>
      <p className="fine">
        Se recorren <b>todas</b>, siempre. Descartar o sostener una familia exige evidencia
        enlazada; decir «no evaluable» exige nombrar el dato que falta. No existe el estado
        «no aplica»: es el atajo que vacía un Ishikawa sin descartar nada.
      </p>
      {evidencias.length === 0 && (
        <p className="aviso">
          <b>Este análisis no tiene ninguna evidencia disponible</b> para enlazar. Mientras siga
          así, marcar «descartada» o «sostenida» dejará el aviso de «sin evidencia enlazada» — y
          ese aviso es correcto: la afirmación no está respaldada.
        </p>
      )}

      <div className="tabla-caja">
        <table className="tabla">
          <thead>
            <tr><th style={{ width: '20%' }}>Familia</th><th style={{ width: '15%' }}>Estado</th><th>Motivo — obligatorio</th></tr>
          </thead>
          <tbody>
            {borrador.map((x) => {
              const j = juicio.get(x.espina);
              return (
                <tr key={x.espina}>
                  <td className="destaca">{ROTULO_ESPINA[x.espina] ?? x.espina}</td>
                  <td>
                    <select className="rca-select" value={x.estado}
                      onChange={(e) => tocar(x.espina, 'estado', e.target.value)}>
                      <option value="">— sin mirar —</option>
                      <option value="abierta">abierta</option>
                      <option value="sostenida">sostenida</option>
                      <option value="descartada">descartada</option>
                      <option value="no_evaluable">no evaluable</option>
                    </select>
                  </td>
                  <td>
                    <textarea className="rca-motivo" rows={2} value={x.motivo}
                      placeholder={x.estado ? 'Por qué está en ese estado' : ''}
                      disabled={!x.estado}
                      onChange={(e) => tocar(x.espina, 'motivo', e.target.value)} />
                    {x.estado === 'no_evaluable' && (
                      <input className="rca-motivo" value={x.datoQueFalta}
                        placeholder="Qué dato falta, y quién lo tiene"
                        onChange={(e) => tocar(x.espina, 'datoQueFalta', e.target.value)} />
                    )}
                    {x.estado && evidencias.length > 0 && (
                      <div className="rca-evidencias">
                        <span className="rca-ev-rotulo">Evidencia que lo sostiene</span>
                        {evidencias.map((ev) => (
                          <label key={ev.id} className="rca-ev">
                            <input type="checkbox" checked={x.evidenciaIds.includes(ev.id)}
                              onChange={() => alternarEvidencia(x.espina, ev.id)} />
                            <span>{ev.pie ?? ev.componenteEsperado ?? ev.rutaObjeto.split('/').pop()}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {j?.defectos.map((d: string) => <div key={d} className="rca-defecto">⚠ {d}</div>)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rca-guardar">
        <button type="button" className="boton chico" onClick={() => void guardar()}
          disabled={guardando || sinMotivo > 0}>
          {guardando ? 'Guardando…' : `Guardar ${conEstado.length} de 11`}
        </button>
        {sinMotivo > 0 && (
          <span className="fine">
            {sinMotivo} familia(s) con estado y sin motivo. Un estado que no se puede auditar no vale.
          </span>
        )}
      </div>
    </section>
  );
}

// ── El segmento ─────────────────────────────────────────────────────────────

export function Rca() {
  const r = useRca();
  if (r.fase === 'cerrado') return null;

  return (
    <div className="rca">
      <div className="rca-barra">
        <span className="col-rotulo">Análisis de causa raíz</span>
        <button type="button" className="boton chico" onClick={() => almacen.cerrarRca()}>
          Volver al parque
        </button>
      </div>
      {r.fase === 'cargando' && <section className="panel vacio"><div className="vacio-t">Cargando…</div></section>}
      {r.fase === 'error' && <section className="panel vacio"><div className="vacio-t">No se pudo leer</div><p className="vacio-c">{r.mensaje}</p></section>}
      {r.fase === 'indice' && <Indice analisis={r.analisis} />}
      {r.fase === 'abierto' && <Abierto a={r.analisis} evidencias={r.evidencias} />}
    </div>
  );
}
