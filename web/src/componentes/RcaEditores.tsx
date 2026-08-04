// ============================================================================
// componentes/RcaEditores.tsx — donde el método se rellena
// ----------------------------------------------------------------------------
// Cada editor guarda su parte COMPLETA, nunca un trozo: las cadenas, el árbol y
// las hipótesis son listas con sentido propio, y guardarlas a pedazos abriría un
// estado a medias entre dos escrituras.
//
// LA REGLA QUE COMPARTEN TODOS: el juicio lo hace `nucleo/rca.js` y se enseña
// MIENTRAS SE ESCRIBE, no al guardar. Un aviso que aparece al final llega tarde
// —la afirmación ya está redactada y cuesta más deshacerla que corregirla.
//
// Y ninguno propone contenido. No hay borradores automáticos, ni sugerencias de
// causa, ni plantillas rellenas: un borrador es un ancla, y lo que se firmaría
// sería del modelo con retoques.
// ============================================================================
import { useState } from 'react';
import { fuerzaCadena, diagnosticoCadena, validarArbol, resumenBarreras, revisarHipotesis } from '@lineas/nucleo/rca';
import type { AnalisisCausa, Evidencia } from '@lineas/contratos';
import { almacen } from '../datos/enlace';

export const ESPINAS_UI: [string, string][] = [
  ['conductor', 'Conductor'],
  ['conexiones_empalmes', 'Conexiones y empalmes'],
  ['aislamiento_herrajes', 'Aislamiento y herrajes'],
  ['estructura_cimentacion', 'Estructura y cimentación'],
  ['tierra_apantallamiento', 'Puesta a tierra y apantallamiento'],
  ['ambiente_clima', 'Ambiente y clima'],
  ['vegetacion_servidumbre', 'Vegetación y servidumbre'],
  ['diseno_hipotesis', 'Diseño e hipótesis de cálculo'],
  ['montaje_tendido', 'Montaje y tendido'],
  ['operacion_maniobra', 'Operación y maniobra'],
  ['inspeccion_mantenimiento', 'Inspección y mantenimiento'],
];

const NIVELES_UI: [string, string][] = [
  ['efecto', '1 · efecto — lo que se ve'],
  ['modo_falla', '2 · modo de falla — qué pieza y cómo'],
  ['mecanismo_fisico', '3 · mecanismo físico — por qué falla así'],
  ['condicion', '4 · condición — por qué existía AQUÍ'],
  ['regla', '5 · regla — qué lo consintió'],
];

const BARRERAS_UI: [string, string][] = [
  ['apantallamiento', 'Apantallamiento (hilo de guarda)'],
  ['puesta_a_tierra', 'Puesta a tierra'],
  ['aislamiento', 'Aislamiento'],
  ['distancia_seguridad', 'Distancia de seguridad'],
  ['poda_servidumbre', 'Poda de servidumbre'],
  ['inspeccion_visual', 'Inspección visual'],
  ['termografia', 'Termografía'],
  ['proteccion_electrica', 'Protección eléctrica'],
  ['recierre', 'Recierre'],
  ['mantenimiento_preventivo', 'Mantenimiento preventivo'],
  ['control_calidad_montaje', 'Control de calidad del montaje'],
  ['especificacion_diseno', 'Especificación de diseño'],
  ['gestion_repuestos', 'Gestión de repuestos'],
];

const uuid = () => crypto.randomUUID();

/** Casilla de evidencia, reutilizada por los tres editores. */
function Evidencias({ todas, puestas, alternar }:
  { todas: Evidencia[]; puestas: string[]; alternar: (id: string) => void }) {
  if (!todas.length) return null;
  return (
    <div className="rca-evidencias">
      <span className="rca-ev-rotulo">Evidencia que lo sostiene</span>
      {todas.map((ev) => (
        <label key={ev.id} className="rca-ev">
          <input type="checkbox" checked={puestas.includes(ev.id)} onChange={() => alternar(ev.id)} />
          <span>{ev.pie ?? ev.componenteEsperado ?? ev.rutaObjeto.split('/').pop()}</span>
        </label>
      ))}
    </div>
  );
}

function Guardar({ onGuardar, aviso }: { onGuardar: () => Promise<void>; aviso?: string | null }) {
  const [g, setG] = useState(false);
  return (
    <div className="rca-guardar">
      <button type="button" className="boton chico" disabled={g || Boolean(aviso)}
        onClick={async () => { setG(true); try { await onGuardar(); } finally { setG(false); } }}>
        {g ? 'Guardando…' : 'Guardar'}
      </button>
      {aviso && <span className="fine">{aviso}</span>}
    </div>
  );
}

// ── LOS PORQUÉS ─────────────────────────────────────────────────────────────

export function EditorPorques({ a, evidencias }: { a: AnalisisCausa; evidencias: Evidencia[] }) {
  const [cadenas, setCadenas] = useState<any[]>(() => JSON.parse(JSON.stringify(a.cadenas)));

  const nueva = () => setCadenas((c) => [...c, {
    id: uuid(), espina: 'conductor',
    eslabones: [{ nivel: 'efecto', enunciado: '', evidenciaIds: [] }],
  }]);
  const cambiar = (i: number, campo: string, v: unknown) =>
    setCadenas((c) => c.map((x, k) => (k === i ? { ...x, [campo]: v } : x)));
  const cambiarEslabon = (i: number, j: number, campo: string, v: unknown) =>
    setCadenas((c) => c.map((x, k) => (k !== i ? x : {
      ...x, eslabones: x.eslabones.map((e: any, m: number) => (m === j ? { ...e, [campo]: v } : e)),
    })));

  const vacios = cadenas.flatMap((c) => c.eslabones).filter((e: any) => !e.enunciado.trim()).length;

  return (
    <section className="panel">
      <h2>Los porqués</h2>
      <p className="fine">
        Cada eslabón declara <b>en qué nivel está</b>. Una cadena que se detiene en el mecanismo
        físico describe física, no gestión — y sobre la física no se puede actuar. Si falta el dato
        para seguir, se declara el corte en vez de inventar el último eslabón.
      </p>

      {cadenas.map((c, i) => {
        const f = fuerzaCadena(c);
        return (
          <div key={c.id} className="rca-cadena">
            <div className="rca-cadena-cab">
              <select className="rca-select rca-select-corto" value={c.espina}
                onChange={(e) => cambiar(i, 'espina', e.target.value)}>
                {ESPINAS_UI.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
              <span className={f.esAccionable ? 'pill ok' : 'pill av'}>
                {f.esAccionable ? 'llega a causa accionable' : 'no llega a causa raíz'}
              </span>
              <button type="button" className="rca-quitar"
                onClick={() => setCadenas((x) => x.filter((_, k) => k !== i))}>quitar cadena</button>
            </div>

            {c.eslabones.map((e: any, j: number) => (
              <div key={j} className="rca-eslabon-ed">
                <select className="rca-select rca-select-corto" value={e.nivel}
                  onChange={(ev) => cambiarEslabon(i, j, 'nivel', ev.target.value)}>
                  {NIVELES_UI.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
                <textarea className="rca-motivo" rows={2} value={e.enunciado}
                  placeholder="Por qué ocurrió lo anterior"
                  onChange={(ev) => cambiarEslabon(i, j, 'enunciado', ev.target.value)} />
                <input className="rca-motivo" value={e.cortadaPorFaltaDeDato ?? ''}
                  placeholder="Si aquí se corta por falta de dato, dilo (y quién lo tiene)"
                  onChange={(ev) => cambiarEslabon(i, j, 'cortadaPorFaltaDeDato', ev.target.value || undefined)} />
                <Evidencias todas={evidencias} puestas={e.evidenciaIds ?? []}
                  alternar={(id) => cambiarEslabon(i, j, 'evidenciaIds',
                    (e.evidenciaIds ?? []).includes(id)
                      ? e.evidenciaIds.filter((z: string) => z !== id)
                      : [...(e.evidenciaIds ?? []), id])} />
                {c.eslabones.length > 1 && (
                  <button type="button" className="rca-quitar"
                    onClick={() => cambiar(i, 'eslabones', c.eslabones.filter((_: any, m: number) => m !== j))}>
                    quitar este porqué
                  </button>
                )}
              </div>
            ))}

            <button type="button" className="boton chico"
              onClick={() => cambiar(i, 'eslabones', [...c.eslabones, { nivel: 'condicion', enunciado: '', evidenciaIds: [] }])}>
              + otro porqué
            </button>
            <p className="fine">{diagnosticoCadena(c)}</p>
          </div>
        );
      })}

      <div className="rca-guardar">
        <button type="button" className="boton chico" onClick={nueva}>+ Nueva cadena</button>
      </div>
      <Guardar aviso={vacios ? `${vacios} eslabón(es) sin redactar.` : null}
        onGuardar={() => almacen.guardarParte({ cadenas })} />
    </section>
  );
}

// ── EL ÁRBOL Y LAS BARRERAS ─────────────────────────────────────────────────

export function EditorArbol({ a, evidencias }: { a: AnalisisCausa; evidencias: Evidencia[] }) {
  const [nodos, setNodos] = useState<any[]>(() => JSON.parse(JSON.stringify(a.arbol)));
  const val = validarArbol(nodos);
  const bar = resumenBarreras(nodos);

  const nuevo = () => setNodos((n) => [...n, {
    id: uuid(), enunciado: '', padreId: n.length ? n[0].id : null,
    ...(n.length ? { tipoArista: 'necesaria' } : {}),
    nivel: n.length ? 'condicion' : 'efecto', evidenciaIds: [],
  }]);
  const cambiar = (i: number, campo: string, v: unknown) =>
    setNodos((n) => n.map((x, k) => (k === i ? { ...x, [campo]: v } : x)));

  const vacios = nodos.filter((n) => !n.enunciado.trim()).length;

  return (
    <section className="panel">
      <h2>Árbol de causas y barreras</h2>
      <p className="fine">
        La pregunta que suele valer más que la causa: <b>¿qué defensa debió detener esto y por qué
        no lo hizo?</b> Un evento que atraviesa varias barreras no tiene una causa raíz — tiene
        varios fallos de defensa, y arreglar solo la causa deja los demás abiertos.
      </p>
      {bar.aviso && <p className="alerta">{bar.aviso}</p>}
      {val.problemas.map((p: string) => <p key={p} className="rca-defecto">⚠ {p}</p>)}

      {nodos.map((n, i) => (
        <div key={n.id} className="rca-cadena">
          <div className="rca-cadena-cab">
            <select className="rca-select rca-select-corto" value={n.nivel}
              onChange={(e) => cambiar(i, 'nivel', e.target.value)}>
              {NIVELES_UI.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
            <select className="rca-select rca-select-corto" value={n.padreId ?? ''}
              onChange={(e) => cambiar(i, 'padreId', e.target.value || null)}>
              <option value="">— es el efecto observado (raíz) —</option>
              {nodos.filter((o) => o.id !== n.id).map((o) => (
                <option key={o.id} value={o.id}>cuelga de: {o.enunciado.slice(0, 40) || '(sin redactar)'}</option>
              ))}
            </select>
            {n.padreId && (
              <select className="rca-select rca-select-corto" value={n.tipoArista ?? ''}
                onChange={(e) => cambiar(i, 'tipoArista', e.target.value)}>
                <option value="">— tipo de causa —</option>
                <option value="necesaria">necesaria (sin ella no ocurre)</option>
                <option value="suficiente">suficiente (por sí sola basta)</option>
                <option value="contribuye">contribuye (agrava)</option>
              </select>
            )}
            <button type="button" className="rca-quitar"
              onClick={() => setNodos((x) => x.filter((_, k) => k !== i))}>quitar</button>
          </div>

          <textarea className="rca-motivo" rows={2} value={n.enunciado} placeholder="Qué ocurrió"
            onChange={(e) => cambiar(i, 'enunciado', e.target.value)} />

          <div className="rca-barrera">
            <span className="rca-ev-rotulo">¿Qué defensa debió detenerlo aquí?</span>
            <select className="rca-select rca-select-corto" value={n.barrera?.cual ?? ''}
              onChange={(e) => cambiar(i, 'barrera', e.target.value
                ? { cual: e.target.value, estado: n.barrera?.estado ?? 'no_evaluable', detalle: n.barrera?.detalle ?? '' }
                : undefined)}>
              <option value="">— ninguna analizada —</option>
              {BARRERAS_UI.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
            {n.barrera && (
              <>
                <select className="rca-select rca-select-corto" value={n.barrera.estado}
                  onChange={(e) => cambiar(i, 'barrera', { ...n.barrera, estado: e.target.value })}>
                  <option value="ausente">ausente — nunca existió</option>
                  <option value="inefectiva">inefectiva — existía y no funcionó</option>
                  <option value="no_aplicada">no aplicada — existía y no se aplicó</option>
                  <option value="funciono">funcionó — limitó el daño</option>
                  <option value="no_evaluable">no evaluable — no consta</option>
                </select>
                <textarea className="rca-motivo" rows={2} value={n.barrera.detalle}
                  placeholder="Qué le pasó a esa defensa"
                  onChange={(e) => cambiar(i, 'barrera', { ...n.barrera, detalle: e.target.value })} />
              </>
            )}
          </div>

          <Evidencias todas={evidencias} puestas={n.evidenciaIds ?? []}
            alternar={(id) => cambiar(i, 'evidenciaIds',
              (n.evidenciaIds ?? []).includes(id)
                ? n.evidenciaIds.filter((z: string) => z !== id)
                : [...(n.evidenciaIds ?? []), id])} />
        </div>
      ))}

      <div className="rca-guardar">
        <button type="button" className="boton chico" onClick={nuevo}>
          {nodos.length ? '+ Otra causa' : '+ Empezar por el efecto observado'}
        </button>
      </div>
      <Guardar aviso={vacios ? `${vacios} nodo(s) sin redactar.` : null}
        onGuardar={() => almacen.guardarParte({ arbol: nodos })} />
    </section>
  );
}

// ── HIPÓTESIS ───────────────────────────────────────────────────────────────

export function EditorHipotesis({ a, evidencias }: { a: AnalisisCausa; evidencias: Evidencia[] }) {
  const [hs, setHs] = useState<any[]>(() => JSON.parse(JSON.stringify(a.hipotesis)));
  const revisadas = revisarHipotesis(hs);

  const nueva = () => setHs((h) => [...h, {
    id: uuid(), enunciado: '', espina: 'conductor', verosimilitud: 'baja',
    sustento: '', queLaRefutaria: '', evidenciaIds: [], sustentoSoloClimatico: false,
  }]);
  const cambiar = (i: number, campo: string, v: unknown) =>
    setHs((h) => h.map((x, k) => (k === i ? { ...x, [campo]: v } : x)));

  const incompletas = hs.filter((h) => !h.enunciado.trim() || !h.sustento.trim() || !h.queLaRefutaria.trim()).length;

  return (
    <section className="panel">
      <h2>Hipótesis</h2>
      <p className="fine">
        No se ordenan por fuerza: ordenar es dictaminar. Cada una declara <b>qué evidencia la
        refutaría</b> — una hipótesis que nada puede tumbar no es una hipótesis, es una creencia.
      </p>

      {hs.map((h, i) => {
        const r = revisadas[i];
        return (
          <div key={h.id} className="rca-cadena">
            <div className="rca-cadena-cab">
              <select className="rca-select rca-select-corto" value={h.espina}
                onChange={(e) => cambiar(i, 'espina', e.target.value)}>
                {ESPINAS_UI.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
              <select className="rca-select rca-select-corto" value={h.verosimilitud}
                onChange={(e) => cambiar(i, 'verosimilitud', e.target.value)}>
                <option value="descartada">descartada</option>
                <option value="baja">baja</option>
                <option value="media">media</option>
                <option value="alta">alta</option>
                <option value="confirmada">confirmada</option>
              </select>
              {r?.topadaPorClima && <span className="pill av">topada en baja</span>}
              <button type="button" className="rca-quitar"
                onClick={() => setHs((x) => x.filter((_, k) => k !== i))}>quitar</button>
            </div>

            <textarea className="rca-motivo" rows={2} value={h.enunciado} placeholder="Qué se propone que pasó"
              onChange={(e) => cambiar(i, 'enunciado', e.target.value)} />
            <textarea className="rca-motivo" rows={2} value={h.sustento} placeholder="En qué se apoya"
              onChange={(e) => cambiar(i, 'sustento', e.target.value)} />
            <textarea className="rca-motivo" rows={2} value={h.queLaRefutaria}
              placeholder="QUÉ EVIDENCIA LA TUMBARÍA — obligatorio"
              onChange={(e) => cambiar(i, 'queLaRefutaria', e.target.value)} />

            <label className="rca-ev">
              <input type="checkbox" checked={h.sustentoSoloClimatico}
                onChange={(e) => cambiar(i, 'sustentoSoloClimatico', e.target.checked)} />
              <span>Su único sustento es el clima. <i>Márcalo si es así: el motor la topará en «baja»,
                porque que hubiera ese tiempo no prueba que causara la falla.</i></span>
            </label>

            <Evidencias todas={evidencias} puestas={h.evidenciaIds ?? []}
              alternar={(id) => cambiar(i, 'evidenciaIds',
                (h.evidenciaIds ?? []).includes(id)
                  ? h.evidenciaIds.filter((z: string) => z !== id)
                  : [...(h.evidenciaIds ?? []), id])} />

            {r?.defectos.map((d: string) => <div key={d} className="rca-defecto">⚠ {d}</div>)}
          </div>
        );
      })}

      <div className="rca-guardar">
        <button type="button" className="boton chico" onClick={nueva}>+ Nueva hipótesis</button>
      </div>
      <Guardar aviso={incompletas ? `${incompletas} hipótesis sin enunciado, sustento o refutación.` : null}
        onGuardar={() => almacen.guardarParte({ hipotesis: hs })} />
    </section>
  );
}

// ── LO QUE FALTA POR VERIFICAR ──────────────────────────────────────────────

export function EditorAusencias({ a }: { a: AnalisisCausa }) {
  const [xs, setXs] = useState<any[]>(() => JSON.parse(JSON.stringify(a.ausencias)));
  const cambiar = (i: number, campo: string, v: unknown) =>
    setXs((h) => h.map((x, k) => (k === i ? { ...x, [campo]: v } : x)));
  const incompletas = xs.filter((x) => !x.que.trim() || !x.porQue.trim()).length;

  return (
    <section className="panel">
      <h2>Lo que este análisis NO puede afirmar hoy</h2>
      <p className="fine">
        Es la parte más honesta del expediente y la que un informe convincente omite. Va impresa:
        un análisis que no declara sus límites parece más fuerte y es más frágil.
      </p>

      {xs.map((x, i) => (
        <div key={i} className="rca-cadena">
          <div className="rca-cadena-cab">
            <select className="rca-select rca-select-corto" value={x.estado}
              onChange={(e) => cambiar(i, 'estado', e.target.value)}>
              <option value="pendiente">pendiente</option>
              <option value="solicitado">solicitado</option>
              <option value="recibido">recibido</option>
              <option value="no_disponible">no disponible</option>
            </select>
            <button type="button" className="rca-quitar"
              onClick={() => setXs((z) => z.filter((_, k) => k !== i))}>quitar</button>
          </div>
          <input className="rca-motivo" value={x.que} placeholder="Qué no se puede afirmar"
            onChange={(e) => cambiar(i, 'que', e.target.value)} />
          <textarea className="rca-motivo" rows={2} value={x.porQue} placeholder="Por qué no se puede"
            onChange={(e) => cambiar(i, 'porQue', e.target.value)} />
          <input className="rca-motivo" value={x.quienLoTiene ?? ''} placeholder="Quién tiene ese dato"
            onChange={(e) => cambiar(i, 'quienLoTiene', e.target.value || undefined)} />
        </div>
      ))}

      <div className="rca-guardar">
        <button type="button" className="boton chico"
          onClick={() => setXs((h) => [...h, { que: '', porQue: '', estado: 'pendiente' }])}>
          + Declarar algo que falta
        </button>
      </div>
      <Guardar aviso={incompletas ? `${incompletas} sin qué o sin por qué.` : null}
        onGuardar={() => almacen.guardarParte({ ausencias: xs })} />
    </section>
  );
}

// ── EL CLIMA DEL EVENTO ─────────────────────────────────────────────────────

/**
 * Sondeo meteorológico de IDEAM.
 *
 * PIDE LA COORDENADA Y LA HORA A MANO, y no es una carencia: un análisis puede
 * abarcar varias líneas y varios apoyos, así que NO existe «la» coordenada del
 * análisis. Elegir una por él sería inventarse cuál de los tres apoyos manda.
 *
 * Y se consulta cuando el ingeniero lo pide, nunca al pintar: una consulta a un
 * tercero es un acto deliberado que produce un hecho fechado, no un efecto
 * secundario de mirar una pantalla.
 */
export function ClimaEvento() {
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [cuando, setCuando] = useState('');
  const [r, setR] = useState<any>(null);
  const [cargando, setCargando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  const consultar = async () => {
    setFallo(null); setCargando(true); setR(null);
    try {
      const { sondearClima } = await import('../datos/clima');
      setR(await sondearClima(Number(lat), Number(lon), new Date(cuando).toISOString()));
    } catch (e) {
      setFallo(e instanceof Error ? e.message : 'no se pudo consultar');
    } finally { setCargando(false); }
  };

  const listo = lat && lon && cuando && isFinite(Number(lat)) && isFinite(Number(lon));

  return (
    <section className="panel">
      <h2>Clima del evento · IDEAM</h2>
      <p className="fine">
        Se pide la coordenada y la hora a mano a propósito: un análisis puede abarcar varias líneas
        y varios apoyos, así que no existe «la» coordenada del análisis — elegir una sería
        inventarse cuál manda. La estación se busca por celda de rejilla, no con la coordenada
        exacta: el registro de consultas de un tercero no tiene por qué saber dónde está la torre.
      </p>

      <div className="calc-fila">
        <label className="calc-campo"><span>Latitud</span>
          <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="10.42" /></label>
        <label className="calc-campo"><span>Longitud</span>
          <input value={lon} onChange={(e) => setLon(e.target.value)} placeholder="-75.54" /></label>
        <label className="calc-campo"><span>Cuándo ocurrió</span>
          <input type="datetime-local" value={cuando} onChange={(e) => setCuando(e.target.value)} /></label>
        <button type="button" className="boton chico" disabled={!listo || cargando} onClick={() => void consultar()}>
          {cargando ? 'Consultando…' : 'Consultar'}
        </button>
      </div>

      {fallo && <p className="alerta">{fallo}</p>}

      {r && (
        <>
          {/* La nota va ARRIBA del dato, no debajo: los límites se leen antes
              que la cifra, o la cifra ya formó la conclusión. */}
          <p className="aviso">{r.nota}</p>

          {r.series.length > 0 && (
            <div className="tabla-caja">
              <table className="tabla">
                <thead><tr><th>Variable</th><th className="num">Máximo</th><th className="num">Acumulado</th><th className="num">Lecturas</th></tr></thead>
                <tbody>
                  {r.series.map((s: any) => (
                    <tr key={s.variable}>
                      <td className="destaca">{s.variable.replace('_', ' ')}</td>
                      <td className="num">{s.max === null ? '—' : `${s.max} ${s.unidad}`}</td>
                      <td className="num">{s.acumulado === null ? '—' : `${s.acumulado} ${s.unidad}`}</td>
                      <td className="num">{s.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="fine">
            Esto es CONTEXTO, no causa. Si vas a apoyar una hipótesis solo en estos números,
            márcala como «sustento solo climático» arriba: el motor la topará en «baja», y con
            razón — que hubiera este tiempo no prueba que causara la falla.
          </p>
        </>
      )}
    </section>
  );
}
