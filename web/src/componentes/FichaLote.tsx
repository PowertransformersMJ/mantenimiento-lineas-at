// ============================================================================
// componentes/FichaLote.tsx — el mismo dato de catálogo, en VARIOS apoyos
// ----------------------------------------------------------------------------
// QUÉ ES. La pantalla que faltaba. La ESCRITURA existe desde `ADR-030` con todas
// sus salvaguardas y nunca se pudo pedir: el formulario de la ficha declaraba la
// ausencia —«el lote no entra en esta ola»— en vez de fingirla con un botón que
// no escribiría nada. Esto es esa puerta.
//
// POR QUÉ IMPORTA. Los 24 apoyos de la línea comparten modelo: la carga de
// rotura y la capacidad salen de UN catálogo y ese catálogo es EL MISMO papel
// para todos. Meterlas a mano son 24 formularios; por lote es uno. Es la pieza
// que más tiempo ahorra y la única capaz de hacer daño irreversible, y por eso
// las cuatro salvaguardas van por delante y se ven ANTES de pulsar.
//
// AQUÍ NO HAY NI UNA FÓRMULA, igual que en `FichaEditor.tsx`. Quién puede
// recibir el dato lo dice `vistas/fichaLote.ts`; qué veredictos se moverían lo
// dice `loQueVaACambiar` con el mismo motor de las demás pestañas; y la
// salvaguarda de verdad vive en la escritura, no en esta pantalla — una guarda
// que solo vive en el formulario dura hasta el siguiente formulario.
//
// LAS CUATRO DECISIONES DE ESTA PANTALLA, Y POR QUÉ:
//
// 1. PRIMERO QUÉ, DESPUÉS A QUIÉN. La lista de apoyos no se puede pintar antes
//    de saber qué campos viajan: quien ya declara el tipo de apoyo puede recibir
//    perfectamente una carga de rotura, y decidir la elegibilidad contra los
//    tres campos siempre dejaría fuera a medio parque sin motivo.
// 2. LOS QUE QUEDAN FUERA SE ENSEÑAN, con su motivo. Una lista que solo muestra
//    a los que reciben esconde justo lo que hace falta para confiar en ella.
// 3. EL ANTES/DESPUÉS ES EL MISMO DE LA FICHA, sobre el tramo entero y con los
//    que PIERDEN veredicto contados aparte. Un lote mueve muchos apoyos a la
//    vez: es cuando más falta hace mirarlo antes.
// 4. LA FRASE DE POR QUÉ NO TODO VA POR LOTE ES PERMANENTE, no un aviso que se
//    cierra. Es la salvaguarda que impide que esta pantalla se convierta en la
//    herramienta que llena la base de datos que PARECEN medidos.
// ============================================================================
import { useMemo, useState } from 'react';
import type { Apoyo } from '@lineas/contratos';
import { TipoApoyo } from '@lineas/contratos';
import { almacen } from '../datos/enlace';
import type { AcuseDeLote } from '../datos/repositorio';
import { nf } from '../vistas/formato';
import { puede, type SesionDePantalla } from '../datos/permisos';
import {
  BLOQUES_DE_FICHA, ORIGENES_DE_FICHA, POR_QUE_NO_TODO_VA_POR_LOTE, TIPOS_DE_CAPACIDAD,
  borradorEnBlanco, loQueVaACambiar,
  type BorradorDeFicha, type CampoDeFicha, type ContextoDeLinea, type PanelDeCambio,
} from '../vistas/fichaEstructural';
import {
  CAMPOS_DEL_LOTE, candidatosDeLote, clavesDeLaFicha, fichaDeLote, resumenDeLote, revisionesDe,
  type CandidatoDeLote,
} from '../vistas/fichaLote';

/** Un veredicto, dicho como se lee. Nunca la clave de la máquina. */
const VEREDICTO: Record<string, string> = {
  cumple: 'cumple',
  revisar: 'REVISAR',
  sin_veredicto: 'sin veredicto',
};

const pct = (x: number | null): string => (x === null ? '—' : `${nf(x, 1)} %`);

/**
 * UN campo del lote, con su unidad, lo que desbloquea y su origen.
 *
 * ⚠️ Vive FUERA del componente a propósito, por lo mismo que su gemelo de la
 * ficha: un componente declarado dentro de otro es una función nueva en cada
 * repintado, React monta otro en su sitio y el formulario pierde el foco EN CADA
 * TECLA.
 *
 * A diferencia del de la ficha, aquí NO se enseña «hoy dice»: no hay un apoyo,
 * hay muchos. Lo que cada uno declara hoy se dice en la lista de abajo, apoyo por
 * apoyo, que es donde se puede leer sin mentir.
 */
function CampoDeLote({
  campo, borrador, escribir, ponerOrigen, ponerFuente,
}: {
  campo: CampoDeFicha;
  borrador: BorradorDeFicha;
  escribir: (clave: keyof BorradorDeFicha['valores'], v: string) => void;
  ponerOrigen: (clave: string, v: string) => void;
  ponerFuente: (clave: string, v: string) => void;
}) {
  const origen = borrador.origenes[campo.clave] ?? '';
  const aviso = ORIGENES_DE_FICHA.find((o) => o.valor === origen)?.aviso ?? null;

  return (
    <div className="ficha-campo">
      <p className="ficha-campo-t">
        {campo.etiqueta}{campo.unidad ? ` (${campo.unidad})` : ''}
      </p>
      <p className="cargar-consecuencia">{campo.queEs}</p>
      <p className="ficha-desbloquea">{campo.queDesbloquea}</p>

      {campo.clave === 'tipoApoyo' && (
        <label className="cargar-pregunta">
          <span className="cargar-rotulo">De qué están hechos</span>
          <select className="rca-select" value={borrador.valores.tipoApoyo}
            onChange={(e) => escribir('tipoApoyo', e.target.value)}>
            <option value="">— sin declarar —</option>
            {TipoApoyo.options.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      )}

      {campo.clave === 'cargaRotura_kgf' && (
        <label className="cargar-pregunta">
          <span className="cargar-rotulo">Carga de rotura en la punta — en kgf</span>
          <input type="text" inputMode="decimal" className="rca-select"
            value={borrador.valores.cargaRotura_kgf}
            placeholder="p. ej.: 3600"
            onChange={(e) => escribir('cargaRotura_kgf', e.target.value)} />
        </label>
      )}

      {campo.clave === 'capacidadLongitudinal' && (
        <>
          <label className="cargar-pregunta">
            <span className="cargar-rotulo">Cuánto aguantan a lo largo de la línea (kgf)</span>
            <input type="text" inputMode="decimal" className="rca-select"
              value={borrador.valores.capacidad_valor_kgf}
              placeholder="p. ej.: 3600"
              onChange={(e) => escribir('capacidad_valor_kgf', e.target.value)} />
          </label>
          <label className="cargar-pregunta">
            <span className="cargar-rotulo">¿Qué es ese número?</span>
            <select className="rca-select" value={borrador.valores.capacidad_tipo}
              onChange={(e) => escribir('capacidad_tipo', e.target.value)}>
              <option value="">— sin declarar —</option>
              {TIPOS_DE_CAPACIDAD.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
            </select>
          </label>
          <p className="cargar-consecuencia">
            Entre la carga de rotura y las otras dos hay el doble de margen. Si no lo declara, no hay
            veredicto: el sistema no elige el más parecido.
          </p>
          <label className="cargar-pregunta">
            <span className="cargar-rotulo">¿A qué altura vale esa capacidad? (m)</span>
            <input type="text" inputMode="decimal" className="rca-select"
              value={borrador.valores.capacidad_alturaReferencia_m}
              placeholder="p. ej.: 11"
              onChange={(e) => escribir('capacidad_alturaReferencia_m', e.target.value)} />
          </label>
          <label className="cargar-pregunta">
            <span className="cargar-rotulo">¿De dónde sale? (una línea)</span>
            <input type="text" className="rca-select"
              value={borrador.valores.capacidad_fuente}
              placeholder="p. ej.: catálogo del fabricante, poste 14 m clase 350, hoja 2"
              onChange={(e) => escribir('capacidad_fuente', e.target.value)} />
          </label>
        </>
      )}

      {/* El origen de ESTE campo. Sin nada preseleccionado: un valor por defecto
          en un campo de origen es una firma que nadie puso. */}
      <label className="cargar-pregunta">
        <span className="cargar-rotulo">Este dato, ¿de dónde salió?</span>
        <select className="rca-select" value={origen}
          onChange={(e) => ponerOrigen(campo.clave, e.target.value)}>
          <option value="">— elija uno —</option>
          {ORIGENES_DE_FICHA.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
        </select>
      </label>
      {aviso && <p className="cargar-cambio">{aviso}</p>}

      {campo.clave !== 'capacidadLongitudinal' && (
        <label className="cargar-pregunta">
          <span className="cargar-rotulo">
            Dígalo en una línea, para que otro pueda discutirlo dentro de tres años
          </span>
          <input type="text" className="rca-select"
            value={borrador.fuentes[campo.clave] ?? ''}
            placeholder="p. ej.: catálogo del fabricante, poste 14 m clase 350, hoja 2"
            onChange={(e) => ponerFuente(campo.clave, e.target.value)} />
        </label>
      )}
    </div>
  );
}

/** Un punto de la línea, con su casilla y —si no puede recibir— su motivo. */
function ItemDeLote({ c, marcado, alternar }: {
  c: CandidatoDeLote;
  marcado: boolean;
  alternar: (id: string) => void;
}) {
  return (
    <label className={c.elegible ? 'lote-item' : 'lote-item lote-item-fuera'}>
      <input type="checkbox" checked={marcado} disabled={!c.elegible}
        onChange={() => alternar(c.id)} />
      <span className="lote-nombre">{c.nombre}</span>
      {c.motivo && <span className="lote-motivo">{c.motivo}</span>}
    </label>
  );
}

export function FichaLote({ apoyos, contexto, sesion, alCerrar }: {
  apoyos: Apoyo[];
  /** La línea entera, en la forma que el núcleo pide. La arma `vistas/ejesLinea.ts`. */
  contexto: ContextoDeLinea;
  sesion: SesionDePantalla;
  alCerrar: () => void;
}) {
  const [borrador, setBorrador] = useState<BorradorDeFicha>(borradorEnBlanco);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [enCurso, setEnCurso] = useState(false);
  const [acuse, setAcuse] = useState<AcuseDeLote | null>(null);
  /**
   * El panel CONGELADO en el instante de escribir. Sobrevive a que el borrador
   * se vacíe: sin esto, el acuse diría «escrito» sin poder decir qué se movió.
   */
  const [panelGuardado, setPanelGuardado] = useState<PanelDeCambio | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  /**
   * APLICAR UN DATO A VARIOS APOYOS ES ACTO DE ADMINISTRACIÓN, no de edición: el
   * daño de un lote no es el de una ficha. Es la misma guarda que la escritura,
   * dicha aquí para que nadie rellene el formulario y se entere al final.
   */
  const puedeLote = puede(sesion, 'ficha.lote');

  // Todo lo que sigue lo calculan los módulos puros. Aquí no se convierte, no se
  // compara y no se dictamina nada.
  const { ficha, campos, faltan, noViajan, deEjemplar } = useMemo(() => fichaDeLote(borrador), [borrador]);
  const claves = useMemo(() => clavesDeLaFicha(ficha), [ficha]);
  const candidatos = useMemo(() => candidatosDeLote(apoyos, claves), [apoyos, claves]);
  const { recibiran, quedanFuera, sinMarcar } = useMemo(
    () => resumenDeLote(candidatos, marcados), [candidatos, marcados]);
  const panel = useMemo(
    () => (ficha && recibiran.length
      ? loQueVaACambiar(contexto, recibiran.map((c) => ({ apoyoId: c.id, ficha })))
      : null),
    [contexto, recibiran, ficha]);

  const escribir = (clave: keyof BorradorDeFicha['valores'], v: string) =>
    setBorrador((b) => ({ ...b, valores: { ...b.valores, [clave]: v } }));
  const ponerOrigen = (clave: string, v: string) =>
    setBorrador((b) => ({ ...b, origenes: { ...b.origenes, [clave]: v } }));
  const ponerFuente = (clave: string, v: string) =>
    setBorrador((b) => ({ ...b, fuentes: { ...b.fuentes, [clave]: v } }));

  const alternar = (id: string) =>
    setMarcados((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));

  /**
   * El sello de cabecera: sella de un gesto los campos del bloque QUE TODAVÍA NO
   * TIENEN ORIGEN. Nunca los que él ya decidió uno a uno — un gesto de comodidad
   * no puede deshacer una decisión explícita, y pisar un sello es poner la firma
   * de alguien sobre lo que no firmó (`99 §ADR-027`).
   */
  const sellarBloque = (bloque: string, v: string) =>
    setBorrador((b) => {
      const origenes = { ...b.origenes };
      for (const c of CAMPOS_DEL_LOTE) {
        if (c.bloque !== bloque) continue;
        if (origenes[c.clave]) continue;
        origenes[c.clave] = v;
      }
      return { ...b, origenes };
    });

  const impedimentos = useMemo(() => {
    const xs: string[] = [];
    if (!puedeLote) {
      xs.push(`su sesión entró con el permiso «${sesion.rol}», y aplicar un dato a varios apoyos de `
        + 'golpe es acto de administración');
    }
    for (const f of faltan) xs.push(f);
    if (ficha && !recibiran.length) {
      xs.push('no hay ningún apoyo marcado que pueda recibir este dato');
    }
    return xs;
  }, [puedeLote, sesion.rol, faltan, ficha, recibiran.length]);

  const puedeEscribir = puedeLote && !impedimentos.length && ficha !== null && !enCurso;

  async function escribirLote() {
    if (!ficha) return;
    setEnCurso(true);
    setFallo(null);
    try {
      const r = await almacen.guardarFichaEnLote(
        recibiran.map((c) => c.id),
        ficha as unknown as Record<string, unknown>,
        revisionesDe(recibiran),
      );
      setAcuse(r);
      setPanelGuardado(panel);
      setBorrador(borradorEnBlanco());
      setMarcados([]);
    } catch (e) {
      // El motivo ENTERO, tal como llegó. Un conflicto de revisión NOMBRA al
      // apoyo que otra persona tocó, y resumirlo quitaría justo la instrucción
      // de qué hacer. Lo tecleado y lo marcado siguen en pantalla.
      setFallo(e instanceof Error ? e.message : 'no se pudo escribir el lote');
    } finally {
      setEnCurso(false);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="ficha-editor">
      <div className="ficha-editor-cab">
        <h3>Aplicar un dato de catálogo a varios apoyos</h3>
        <button type="button" className="boton chico" onClick={alCerrar}>Cerrar</button>
      </div>

      <p className="cargar-quien">
        Entra como <b>{sesion.correo ?? 'una cuenta sin correo declarado'}</b> · organización{' '}
        <b>{sesion.orgId || 'sin declarar'}</b> · permiso <b>{sesion.rol || 'sin declarar'}</b>.
      </p>
      {!puedeLote && (
        <p className="alerta">
          Aplicar un dato a varios apoyos de golpe es acto de <b>administración</b>: el daño de un
          lote no es el de una ficha. Esta sesión no lo tiene, así que puede mirar el formulario y ver
          qué se pediría; el botón del final no se encenderá y no se mandará nada a la base. Los
          apoyos se pueden completar <b>uno a uno</b> con permiso de edición.
        </p>
      )}

      <p className="advertencia">
        <b>{POR_QUE_NO_TODO_VA_POR_LOTE}</b>
      </p>

      <p className="fine">
        El lote <b>solo rellena huecos</b>: un apoyo que ya declara el dato queda fuera y se dice
        cuál, para que un valor medido no desaparezca debajo de uno de catálogo. Y entra <b>entero o
        no entra</b>: si a uno de los marcados lo tocó otra persona mientras usted escribía, no se
        escribe ninguno y el aviso lo nombra.
      </p>

      {/* ── 1 · QUÉ se va a aplicar ──────────────────────────────────────────
          Va PRIMERO a propósito: la lista de abajo no se puede decidir sin
          saber qué campos viajan. */}
      <h3 className="ficha-editor-t">Qué dato se aplica</h3>
      {BLOQUES_DE_FICHA.filter((bl) => CAMPOS_DEL_LOTE.some((c) => c.bloque === bl.bloque)).map((bl) => (
        <div key={bl.bloque} className="ficha-bloque-editor">
          <p className="ficha-bloque-t">{bl.titulo}</p>
          <label className="cargar-pregunta">
            <span className="cargar-rotulo">{bl.pregunta}</span>
            <select className="rca-select" value=""
              onChange={(e) => { if (e.target.value) sellarBloque(bl.bloque, e.target.value); }}>
              <option value="">— sellar todo este bloque de una vez —</option>
              {ORIGENES_DE_FICHA.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
            </select>
          </label>
          <p className="cargar-consecuencia">
            Esto solo rellena el origen de los campos de abajo; cada uno se puede cambiar suelto.
          </p>
          {CAMPOS_DEL_LOTE.filter((c) => c.bloque === bl.bloque).map((c) => (
            <CampoDeLote key={c.clave} campo={c} borrador={borrador}
              escribir={escribir} ponerOrigen={ponerOrigen} ponerFuente={ponerFuente} />
          ))}
        </div>
      ))}

      {deEjemplar.length > 0 && (
        <p className="alerta">
          <b>Esto no se puede aplicar a varios apoyos:</b> {deEjemplar.join(', ')}. Depende
          {deEjemplar.length === 1 ? '' : 'n'} del terreno y de qué hace cada apoyo en la línea — el
          empotramiento no se ve desde un escritorio, y un terminal amarra todas las fases mientras
          un apoyo de paso puede no amarrar ninguna. Se pone uno a uno, en la ficha del apoyo.
        </p>
      )}

      {/* ── 2 · A QUIÉN ──────────────────────────────────────────────────── */}
      <h3 className="ficha-editor-t">A qué apoyos</h3>
      {!ficha && (
        <p className="cargar-hueco">
          Todavía no se puede decir quién puede recibirlo: primero el dato, porque quien ya declara
          el tipo de apoyo sí puede recibir una carga de rotura. La lista se ordena sola en cuanto
          arriba haya un dato completo con su origen.
        </p>
      )}
      {ficha && (
        <>
          <div className="lote-acciones">
            <button type="button" className="boton chico"
              onClick={() => setMarcados(candidatos.filter((c) => c.elegible).map((c) => c.id))}>
              Marcar los {candidatos.filter((c) => c.elegible).length} que pueden recibirlo
            </button>
            <button type="button" className="boton chico" onClick={() => setMarcados([])}>
              Quitar todas las marcas
            </button>
          </div>
          <div className="lote-lista">
            {candidatos.map((c) => (
              <ItemDeLote key={c.id} c={c} marcado={marcados.includes(c.id)} alternar={alternar} />
            ))}
          </div>
          {sinMarcar.length > 0 && (
            <p className="cargar-hueco">
              Quedan <b>{nf(sinMarcar.length)}</b> apoyo{sinMarcar.length === 1 ? '' : 's'} sin marcar
              que sí podrían recibirlo: {sinMarcar.map((c) => c.nombre).join(' · ')}.
            </p>
          )}
          {quedanFuera.length > 0 && (
            <div className="aviso">
              <b>Marcados que NO van a recibir el dato:</b>
              <ul className="cargar-lista">
                {quedanFuera.map((c) => <li key={c.id}><b>{c.nombre}</b> — {c.motivo}</li>)}
              </ul>
            </div>
          )}
        </>
      )}

      {/* ── 3 · LO QUE VA A CAMBIAR ──────────────────────────────────────── */}
      {panel && !acuse && (
        <>
          <h3 className="ficha-editor-t">Lo que va a cambiar</h3>
          <p className="fine">
            Estas cifras salen del <b>mismo motor</b> que pinta las demás pestañas, corrido dos veces:
            una con la línea como está y otra con el lote aplicado. Se calcula sobre el <b>tramo
            entero</b>, no sobre los apoyos marcados solos.
          </p>
          {panel.frases.map((f) => (
            <p key={f} className={f.includes('REVISAR') || f.includes('DEJA') ? 'aviso' : 'ok'}>{f}</p>
          ))}
          <div className="tabla-caja">
            <table className="tabla">
              <caption>
                Apoyo por apoyo del tramo. Se destaca lo que MUEVE de estado; lo que no se mueve
                también está, porque que algo siga igual es información.
              </caption>
              <thead>
                <tr>
                  <th>Apoyo</th>
                  <th>De lado — hoy</th>
                  <th>De lado — quedaría</th>
                  <th>A lo largo — hoy</th>
                  <th>A lo largo — quedaría</th>
                </tr>
              </thead>
              <tbody>
                {/* La clave lleva el ÍNDICE y no solo el nombre: un nombre puede
                    repetirse, y dos filas con la misma clave se funden en una. */}
                {panel.filas.map((f, i) => (
                  <tr key={`${f.apoyo}-${i}`}>
                    <td><b>{f.apoyo}</b>{f.editado ? ' — recibe el lote' : ''}</td>
                    <td>{VEREDICTO[f.transversal.antes]} · {pct(f.transversal.utilizacionAntes_pct)}</td>
                    <td className={f.transversal.cambia ? 'destaca' : undefined}>
                      {VEREDICTO[f.transversal.despues]} · {pct(f.transversal.utilizacionDespues_pct)}
                    </td>
                    <td>{VEREDICTO[f.longitudinal.antes]} · {pct(f.longitudinal.utilizacionAntes_pct)}</td>
                    <td className={f.longitudinal.cambia ? 'destaca' : undefined}>
                      {VEREDICTO[f.longitudinal.despues]} · {pct(f.longitudinal.utilizacionDespues_pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {panel.filas.filter((f) => f.faltaTodavia.length).map((f, i) => (
            <p key={`${f.apoyo}-${i}`} className="cargar-hueco">
              <b>{f.apoyo}</b> seguiría sin veredicto de lado: le falta {f.faltaTodavia.join(' · ')}.
            </p>
          ))}
        </>
      )}

      {/* ── 4 · EL BOTÓN ─────────────────────────────────────────────────── */}
      {!acuse && (
        <>
          {noViajan.map((x) => <p key={x} className="cargar-hueco">{x}</p>)}
          {impedimentos.length > 0 && (
            <div className="aviso">
              <b>El botón está apagado porque falta esto:</b>
              <ul className="cargar-lista">
                {impedimentos.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </div>
          )}
          <div className="rca-guardar">
            <button type="button" className="boton" disabled={!puedeEscribir}
              onClick={() => void escribirLote()}>
              {enCurso
                ? 'Escribiendo…'
                : `Escribir ${campos.length === 1 ? 'el dato' : `los ${nf(campos.length)} datos`} en `
                  + `${nf(recibiran.length)} apoyo${recibiran.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </>
      )}

      {/* ── 5 · EL ACUSE ─────────────────────────────────────────────────── */}
      <div aria-live="polite">
        {fallo && <p className="alerta">{fallo}</p>}

        {acuse && (
          <>
            <h3 className="ficha-editor-t">Lo que pasó</h3>
            {acuse.escritos.length > 0
              ? (
                <>
                  <p className="ok">
                    <b>Escrito.</b> {nf(acuse.escritos.length)} apoyo
                    {acuse.escritos.length === 1 ? '' : 's'},{' '}
                    {acuse.campos.length === 1 ? 'un dato' : `${nf(acuse.campos.length)} datos`} cada
                    uno, todos con su origen declarado.
                  </p>
                  <ul className="cargar-lista">
                    {acuse.campos.map((c) => (
                      <li key={c.etiqueta}>
                        {/* El acuse ya trae el origen en las palabras del
                            Ingeniero: lo tradujo la escritura con
                            `etiquetaDeOrigen`, que es su único dueño. */}
                        <b>{c.etiqueta}</b> — {c.origen.toLowerCase()}
                        {c.fuente ? `: ${c.fuente}` : ''}
                      </li>
                    ))}
                  </ul>
                  <ul className="cargar-lista">
                    {acuse.escritos.map((e) => (
                      <li key={e.apoyo}><b>{e.apoyo}</b> — revisión {nf(e.revision)}</li>
                    ))}
                  </ul>
                </>
              )
              : (
                <p className="aviso">
                  <b>No se escribió en ningún apoyo.</b> Todos los marcados ya declaraban el dato, así
                  que el lote no pisó nada — que es exactamente lo que tiene que pasar.
                </p>
              )}

            {acuse.yaLoTenian.length > 0 && (
              <div className="aviso">
                <b>Quedaron fuera porque ya lo declaraban</b> (no se pisó ningún valor):
                <ul className="cargar-lista">
                  {acuse.yaLoTenian.map((x) => (
                    <li key={x.apoyo}><b>{x.apoyo}</b> — ya tenía {x.campos.join(' · ').toLowerCase()}</li>
                  ))}
                </ul>
              </div>
            )}

            {panelGuardado && (panelGuardado.resumen.gananVeredicto > 0
              || panelGuardado.resumen.pierdenVeredicto > 0
              || panelGuardado.filas.some((f) => f.cambia)
              ? (
                <>
                  {panelGuardado.frases.map((f) => (
                    <p key={f} className={f.includes('REVISAR') || f.includes('DEJA') ? 'aviso' : 'ok'}>{f}</p>
                  ))}
                  <ul className="cargar-lista">
                    {panelGuardado.filas.filter((f) => f.cambia).map((f, i) => (
                      <li key={`${f.apoyo}-${i}`}>
                        <b>{f.apoyo}</b>: de lado {VEREDICTO[f.transversal.antes]} →{' '}
                        {VEREDICTO[f.transversal.despues]} · a lo largo{' '}
                        {VEREDICTO[f.longitudinal.antes]} → {VEREDICTO[f.longitudinal.despues]}.
                      </li>
                    ))}
                  </ul>
                </>
              )
              : (
                <p className="aviso">
                  <b>Ningún veredicto se movió con esto.</b> Los datos quedaron guardados y cuentan: a
                  estos apoyos les sigue faltando algo para poder dictaminarlos, y arriba se dice qué.
                </p>
              ))}

            <p className="fine">
              Las demás pestañas siguen enseñando la línea tal como estaba antes de escribir: se
              refrescan cuando usted lo pida, para no borrar este acuse antes de que lo lea.
            </p>
            <div className="rca-guardar">
              <button type="button" className="boton" onClick={() => { void almacen.refrescarLinea(); }}>
                Ver la línea recalculada
              </button>
            </div>
            {/* NO se ofrece «escribir otro lote» sin releer, y es deliberado: lo
                que hay en esta pantalla es la línea de ANTES. Un segundo lote
                desde aquí viajaría con revisiones viejas y chocaría con el
                cerrojo, que respondería «otra persona guardó cambios» cuando esa
                otra persona fue él mismo hace diez segundos. */}
            <p className="fine">
              Para aplicar otro dato, pulse arriba: la línea se vuelve a leer de la base y esta
              pantalla se abre con lo que acaba de escribir dentro.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
