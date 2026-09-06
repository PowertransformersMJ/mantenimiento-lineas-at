// ============================================================================
// componentes/FichaEditor.tsx — completar la ficha estructural de UN apoyo
// ----------------------------------------------------------------------------
// QUÉ ES. La entrada que faltaba. Los apoyos de esta línea tienen CERO
// veredictos —ni de lado ni a lo largo— y no porque el cálculo no sepa: el motor
// dictamina desde hace meses y lo que no existía era POR DÓNDE METER EL DATO
// (`docs/05`, TODO-57). Esto es esa puerta, y solo para los SEIS campos que
// desbloquean un veredicto.
//
// AQUÍ NO HAY NI UNA FÓRMULA, igual que en `Cargar.tsx` y por el mismo motivo.
// React pinta y pregunta. Quien convierte «12,5» en un número, quien dice qué
// falta, quien juzga la geometría y quien calcula el antes/después del tramo es
// `vistas/fichaEstructural.ts`, que es código puro y probado en Node; el
// veredicto en sí lo dictan `nucleo/cargas.js` y `nucleo/longitudinal.js`. Si
// esta pantalla tuviera su propia aritmética, el día que discrepara de Cargas
// nadie sabría cuál mirar — y una de las dos estaría en un informe firmado.
//
// LAS CINCO DECISIONES, Y POR QUÉ:
//
// 1. EL FORMULARIO ARRANCA VACÍO, incluidos los campos que el apoyo YA tiene.
//    El valor y su sello entran juntos: devolver lo guardado obligaría a volver
//    a declarar el origen de todo, o —peor— a resellar con la fecha de hoy un
//    dato que alguien midió en marzo. Lo que ya está se ENSEÑA al lado, con su
//    origen, y no se toca si no se cambia.
//
// 2. LA PROCEDENCIA SE DECLARA POR CAMPO Y SE CAPTURA POR BLOQUE. Preguntar una
//    sola vez por ficha sería mentir: la altura libre se mide en el sitio y la
//    carga de rotura se lee de una placa, y el día que se firme esas dos cosas
//    no valen lo mismo. El selector de cabecera sella su bloque de un gesto;
//    cada campo enseña su sello y se puede cambiar suelto.
//
// 3. «CONFIRMADO» NO ESTÁ EN LA LISTA, y no es un olvido. Confirmar no es un
//    origen: es un ACTO POSTERIOR sobre un dato que ya está. El molde del
//    contrato lo rechaza, y aquí ni se ofrece.
//
// 4. LA GEOMETRÍA SE AVISA MIENTRAS TECLEA. `nucleo/longitudinal.js` devuelve
//    `null` EN SILENCIO en tres casos; sin este aviso él declararía cuatro
//    números impecables, no vería ningún veredicto y concluiría que la
//    herramienta está rota.
//
// 5. EL ANTES/DESPUÉS SE ENSEÑA ANTES DE GUARDAR, sobre el TRAMO ENTERO
//    (ADR-002), y lo que NO se mueve se dice con todas las letras: un panel
//    callado se lee como «no lo miré».
//
// LO QUE ESTA PANTALLA NO PUEDE HACER, a propósito: aplicar un dato a varios
// apoyos (eso es el lote, con sus salvaguardas y permiso de administración) y
// confirmar un dato ya guardado — ese segundo gesto exige su propio molde,
// porque `FichaEstructural` rechaza `confirmado_humano` por diseño. Las dos
// ausencias se declaran en pantalla en vez de fingirse con un botón que no
// escribiría nada.
// ============================================================================
import { useMemo, useState } from 'react';
import type { Apoyo } from '@lineas/contratos';
import { TipoApoyo } from '@lineas/contratos';
import { almacen } from '../datos/enlace';
import type { AcuseDeFicha } from '../datos/repositorio';
import { nf } from '../vistas/formato';
import { puede, type SesionDePantalla } from '../datos/permisos';
import {
  BLOQUES_DE_FICHA, CAMPOS_DE_FICHA, ORIGENES_DE_FICHA, TIPOS_DE_CAPACIDAD,
  borradorEnBlanco, etiquetaDeOrigen, fichaDelBorrador, geometriaDelBorrador,
  loQueVaACambiar,
  type BorradorDeFicha, type CampoDeFicha, type ContextoDeLinea, type PanelDeCambio,
} from '../vistas/fichaEstructural';

/** Un veredicto, dicho como se lee. Nunca la clave de la máquina. */
const VEREDICTO: Record<string, string> = {
  cumple: 'cumple',
  revisar: 'REVISAR',
  sin_veredicto: 'sin veredicto',
};

const pct = (x: number | null): string => (x === null ? '—' : `${nf(x, 1)} %`);

/**
 * Lo que el apoyo YA declara de este campo, con su origen si lo tiene.
 *
 * Va pegado al control y no en una ayuda aparte: el valor y su procedencia son
 * una sola cosa. Si no hay dato, se dice que no lo hay — nunca un cero, nunca un
 * silencio.
 */
function valorDeHoy(apoyo: Apoyo, campo: CampoDeFicha): string | null {
  if (campo.clave === 'capacidadLongitudinal') {
    const cap = apoyo.capacidadLongitudinal;
    return cap ? `${nf(cap.valor_kgf)} kgf · ${cap.tipo} · vale a ${nf(cap.alturaReferencia_m, 2)} m` : null;
  }
  if (campo.clave === 'tipoApoyo') return apoyo.tipoApoyo ?? null;
  const v = apoyo[campo.clave];
  if (v == null) return null;
  return `${nf(v, campo.unidad === 'm' ? 2 : 0)}${campo.unidad ? ` ${campo.unidad}` : ''}`;
}

function LoQueHayHoy({ apoyo, campo }: { apoyo: Apoyo; campo: CampoDeFicha }) {
  const sello = (apoyo.procedencias ?? {})[campo.clave];
  const valor = valorDeHoy(apoyo, campo);

  if (valor === null) {
    return (
      <p className="cargar-hueco">
        Hoy este apoyo no lo declara. {campo.queDesbloquea}
      </p>
    );
  }
  return (
    <p className="ficha-hoy">
      <b>Hoy dice:</b> {valor}
      {sello
        ? <> — {etiquetaDeOrigen(sello.procedencia).toLowerCase()}{sello.fuente ? ` (${sello.fuente})` : ''}</>
        : <> — <span className="ficha-sin-origen">sin origen declarado</span></>}
      . Si escribe abajo, lo sustituye y queda el origen nuevo.
    </p>
  );
}

/**
 * UN campo, con su unidad, lo que desbloquea, lo que hay hoy y su origen.
 *
 * ⚠️ Vive FUERA de `FichaEditor` a propósito, aunque solo lo use él. Un
 * componente declarado dentro de otro es una función NUEVA en cada repintado, y
 * React lo trata como un componente distinto: desmonta el campo y monta otro en
 * su sitio. En un formulario eso significa perder el foco EN CADA TECLA — la
 * pantalla se vuelve inservible justo para quien la usa en el teléfono, en
 * campo, que es donde este dato se captura.
 */
function Campo({
  campo, apoyo, borrador, avisosGeometria, escribir, ponerOrigen, ponerFuente,
}: {
  campo: CampoDeFicha;
  apoyo: Apoyo;
  borrador: BorradorDeFicha;
  avisosGeometria: { clave: string; mensaje: string }[];
  escribir: (clave: keyof BorradorDeFicha['valores'], v: string) => void;
  ponerOrigen: (clave: string, v: string) => void;
  ponerFuente: (clave: string, v: string) => void;
}) {
  const origen = borrador.origenes[campo.clave] ?? '';
  const aviso = ORIGENES_DE_FICHA.find((o) => o.valor === origen)?.aviso ?? null;
  const geo = avisosGeometria.filter((g) => g.clave === campo.clave);
  /**
   * Los cuatro campos que son UN número y nada más. Se nombra en una variable
   * propia y no se comprueba dentro del JSX porque TypeScript pierde el
   * estrechamiento de `campo.clave` al entrar en el manejador del `onChange`:
   * ahí volvería a caber `capacidadLongitudinal`, que NO es una casilla del
   * borrador y se escribiría en una clave que nadie lee.
   */
  const claveNumero: 'alturaLibre_m' | 'alturaAplicacion_m' | 'cargaRotura_kgf' | 'nFasesAmarradas' | null =
    (campo.clave === 'capacidadLongitudinal' || campo.clave === 'tipoApoyo') ? null : campo.clave;

  return (
    <div className="ficha-campo">
      <p className="ficha-campo-t">
        {campo.etiqueta}{campo.unidad ? ` (${campo.unidad})` : ''}
      </p>
      <p className="cargar-consecuencia">{campo.queEs}</p>
      <p className="ficha-desbloquea">{campo.queDesbloquea}</p>
      <LoQueHayHoy apoyo={apoyo} campo={campo} />

      {campo.clave === 'tipoApoyo' && (
        <label className="cargar-pregunta">
          <span className="cargar-rotulo">De qué está hecho</span>
          <select className="rca-select" value={borrador.valores.tipoApoyo}
            onChange={(e) => escribir('tipoApoyo', e.target.value)}>
            <option value="">— sin declarar —</option>
            {TipoApoyo.options.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      )}

      {campo.clave === 'capacidadLongitudinal' && (
        <>
          <label className="cargar-pregunta">
            <span className="cargar-rotulo">Cuánto aguanta a lo largo de la línea (kgf)</span>
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
          <p className="cargar-consecuencia">
            Esta fuente es la que el informe imprime al lado del veredicto, así que no se pide dos
            veces: la capacidad la lleva dentro del propio dato.
          </p>
        </>
      )}

      {claveNumero !== null && (
        <label className="cargar-pregunta">
          <span className="cargar-rotulo">
            {campo.etiqueta}{campo.unidad ? ` — en ${campo.unidad}` : ''}
          </span>
          <input type="text" inputMode="decimal" className="rca-select"
            value={borrador.valores[claveNumero]}
            placeholder={campo.unidad === 'm' ? 'p. ej.: 11,5' : 'p. ej.: 3'}
            onChange={(e) => escribir(claveNumero, e.target.value)} />
        </label>
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
            placeholder="p. ej.: medido con cinta el 12-08 · placa del apoyo, foto del 12-08"
            onChange={(e) => ponerFuente(campo.clave, e.target.value)} />
        </label>
      )}

      {geo.map((g) => <p key={g.mensaje} className="alerta">{g.mensaje}</p>)}
    </div>
  );
}

export function FichaEditor({ apoyo, contexto, sesion, alCerrar }: {
  apoyo: Apoyo;
  /** La línea entera, en la forma que el núcleo pide. La arma `vistas/ejesLinea.ts`. */
  contexto: ContextoDeLinea;
  /** Quién entró y con qué permiso. Se enseña ANTES de nada. */
  sesion: SesionDePantalla;
  alCerrar: () => void;
}) {
  const [borrador, setBorrador] = useState<BorradorDeFicha>(borradorEnBlanco);
  const [enCurso, setEnCurso] = useState(false);
  const [acuse, setAcuse] = useState<AcuseDeFicha | null>(null);
  /**
   * El panel CONGELADO en el instante de guardar. Es lo que se escribió, con lo
   * que se calculó, y sobrevive a que el borrador se vacíe: sin esto, el acuse
   * diría «guardado» sin poder decir qué se movió.
   */
  const [panelGuardado, setPanelGuardado] = useState<PanelDeCambio | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  const puedeEditar = puede(sesion, 'apoyos.editar');

  // Todo lo que sigue lo calcula el módulo puro. Aquí no se convierte, no se
  // compara y no se dictamina nada.
  const { ficha, campos, faltan, noViajan } = useMemo(() => fichaDelBorrador(borrador), [borrador]);
  const avisosGeometria = useMemo(
    () => geometriaDelBorrador(apoyo, borrador), [apoyo, borrador]);
  const panel = useMemo(
    () => (ficha ? loQueVaACambiar(contexto, [{ apoyoId: apoyo.id, ficha }]) : null),
    [contexto, apoyo.id, ficha]);

  const escribir = (clave: keyof BorradorDeFicha['valores'], v: string) =>
    setBorrador((b) => ({ ...b, valores: { ...b.valores, [clave]: v } }));
  const ponerOrigen = (clave: string, v: string) =>
    setBorrador((b) => ({ ...b, origenes: { ...b.origenes, [clave]: v } }));
  const ponerFuente = (clave: string, v: string) =>
    setBorrador((b) => ({ ...b, fuentes: { ...b.fuentes, [clave]: v } }));

  /**
   * El sello de cabecera: sella de un gesto los campos de su bloque QUE TODAVÍA
   * NO TIENEN ORIGEN.
   *
   * ⚠️ Antes sellaba TODOS, incluidos los que él ya había marcado uno a uno. Si
   * había puesto la carga de rotura como «lo estimé a ojo» y después usaba la
   * cabecera para sellar el bloque como «lo dice la placa», el número estimado
   * quedaba guardado **con sello de placa de fabricante** — y la pantalla no
   * avisaba de que lo había pisado. Es poner la firma de alguien sobre lo que no
   * firmó, ejecutado por la propia pantalla (`99 §ADR-027`).
   *
   * Un gesto de comodidad no puede deshacer una decisión explícita. Para cambiar
   * un origen ya elegido hay que tocar ese campo, que es donde se ve lo que se
   * está cambiando.
   */
  const sellarBloque = (bloque: string, v: string) =>
    setBorrador((b) => {
      const origenes = { ...b.origenes };
      for (const c of CAMPOS_DE_FICHA) {
        if (c.bloque !== bloque) continue;
        if (origenes[c.clave]) continue;      // ya lo decidió él: no se pisa
        origenes[c.clave] = v;
      }
      return { ...b, origenes };
    });

  const impedimentos = useMemo(() => {
    const xs: string[] = [];
    if (!puedeEditar) {
      xs.push(`su sesión entró con el permiso «${sesion.rol}», y escribir en la ficha de un apoyo `
        + 'exige permiso de edición');
    }
    for (const f of faltan) xs.push(f);
    for (const g of avisosGeometria) xs.push(g.mensaje);
    return xs;
  }, [puedeEditar, sesion.rol, faltan, avisosGeometria]);

  const puedeGuardar = puedeEditar && !impedimentos.length && ficha !== null && !enCurso;

  async function guardar() {
    if (!ficha) return;
    setEnCurso(true);
    setFallo(null);
    try {
      const r = await almacen.guardarFicha(
        apoyo.id, ficha as unknown as Record<string, unknown>, apoyo.revision ?? 0);
      setAcuse(r);
      setPanelGuardado(panel);
      setBorrador(borradorEnBlanco());
    } catch (e) {
      // El motivo ENTERO, tal como llegó. Resumirlo en «no se pudo guardar»
      // quitaría justo la parte que dice qué hacer: un conflicto de revisión
      // trae sus tres partes —qué pasó, que no se escribió nada, y qué hacer—
      // y lo que él haya tecleado sigue en pantalla, sin perderse.
      setFallo(e instanceof Error ? e.message : 'no se pudo guardar la ficha');
    } finally {
      setEnCurso(false);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="ficha-editor">
      <div className="ficha-editor-cab">
        <h3>Completar la ficha de este apoyo</h3>
        <button type="button" className="boton chico" onClick={alCerrar}>Cerrar el formulario</button>
      </div>

      <p className="cargar-quien">
        Entra como <b>{sesion.correo ?? 'una cuenta sin correo declarado'}</b> · organización{' '}
        <b>{sesion.orgId || 'sin declarar'}</b> · permiso <b>{sesion.rol || 'sin declarar'}</b>.
      </p>
      {!puedeEditar && (
        <p className="alerta">
          Escribir en la ficha de un apoyo exige permiso de edición, y esta sesión no lo tiene. Puede
          mirar el formulario y ver qué se pediría; el botón del final no se encenderá y no se
          mandará nada a la base.
        </p>
      )}

      <p className="fine">
        Solo se guarda lo que usted escriba. Un campo que deje en blanco queda como estaba: aquí no
        se rellena nada por defecto y no se escribe ningún cero — un cero se leería como una medida.
      </p>

      {/* El campo que NO se toca, y por qué. Va arriba, junto a la altura libre
          que es con la que se confunde. */}
      <p className="ficha-gris">
        <b>Altura total del poste:</b>{' '}
        {apoyo.altura_m != null ? `${nf(apoyo.altura_m, 1)} m` : 'no declarada'} — de aquí <b>no</b> se
        deduce la altura libre: el empotramiento depende del terreno. Por eso no se puede tocar desde
        este formulario y no desbloquea ningún veredicto.
      </p>

      {BLOQUES_DE_FICHA.map((bl) => {
        const suyos = CAMPOS_DE_FICHA.filter((c) => c.bloque === bl.bloque);
        return (
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
              Esto solo rellena el origen de los campos de abajo; cada uno se puede cambiar suelto. La
              fuente se escribe campo a campo: no es la misma frase para una medida que para una placa.
            </p>
            {suyos.map((c) => (
              <Campo key={c.clave} campo={c} apoyo={apoyo} borrador={borrador}
                avisosGeometria={avisosGeometria}
                escribir={escribir} ponerOrigen={ponerOrigen} ponerFuente={ponerFuente} />
            ))}
          </div>
        );
      })}

      <p className="fine">
        <b>«Confirmo este dato» no está aquí todavía, y es a propósito.</b> Confirmar no es de dónde
        salió un número: es poner su firma encima de uno que ya está guardado, y por eso el molde de
        los datos lo rechaza como origen. Ese segundo gesto necesita su propio camino de escritura y
        aún no existe: mientras tanto, un dato que solo leyó de un plano no está confirmado —
        está documentado, y la ficha lo dice así.
      </p>

      {/* ── Lo que va a cambiar ────────────────────────────────────────────── */}
      {panel && !acuse && (
        <>
          <h3 className="ficha-editor-t">Lo que va a cambiar</h3>
          <p className="fine">
            Estas cifras salen del <b>mismo motor</b> que pinta las demás pestañas, corrido dos veces:
            una con la línea como está y otra con lo que usted acaba de escribir. Se calcula sobre el
            <b> tramo entero</b>, no sobre este apoyo solo.
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
                {/* La clave lleva el ÍNDICE y no solo el nombre: en esta línea
                    conviven nombres irregulares y un nombre puede repetirse. Dos
                    filas con la misma clave se funden en una sola, y desaparece
                    un apoyo del panel sin un solo error. */}
                {panel.filas.map((f, i) => (
                  <tr key={`${f.apoyo}-${i}`}>
                    <td><b>{f.apoyo}</b>{f.editado ? ' — el que está editando' : ''}</td>
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

      {/* ── El botón ───────────────────────────────────────────────────────── */}
      {!acuse && (
        <>
          {/* Lo que se queda fuera y NO impide guardar: casi siempre, campos que
              el sello de cabecera marcó y él no llegó a rellenar. Se dice para
              que nadie crea que guardó algo que no guardó. */}
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
            <button type="button" className="boton" disabled={!puedeGuardar} onClick={() => void guardar()}>
              {enCurso ? 'Escribiendo…' : `Guardar ${campos.length === 1 ? 'el dato' : `los ${campos.length} datos`} en la ficha`}
            </button>
          </div>
        </>
      )}

      {/* ── El acuse ───────────────────────────────────────────────────────── */}
      <div aria-live="polite">
        {fallo && <p className="alerta">{fallo}</p>}

        {acuse && (
          <>
            <h3 className="ficha-editor-t">Lo que pasó</h3>
            <p className="ok">
              <b>Guardado.</b> {acuse.apoyo}, revisión {nf(acuse.revision)}.{' '}
              {acuse.campos.length === 1 ? 'Un dato nuevo' : `${nf(acuse.campos.length)} datos nuevos`},
              todos con su origen declarado.
            </p>
            <ul className="cargar-lista">
              {acuse.campos.map((c) => (
                <li key={c.etiqueta}>
                  <b>{c.etiqueta}</b> — {c.origen.toLowerCase()}
                  {c.fuente ? `: ${c.fuente}` : ''}
                </li>
              ))}
            </ul>

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
                  <b>Ningún veredicto se movió con esto</b>, ni en este apoyo ni en el resto del
                  tramo. El dato quedó guardado y cuenta: a estos apoyos les sigue faltando algo para
                  poder dictaminarlos, y arriba se dice qué.
                </p>
              ))}

            <p className="fine">
              Las demás pestañas siguen enseñando la línea tal como estaba antes de guardar: se
              refrescan cuando usted lo pida, para no borrar este acuse antes de que lo lea.
            </p>
            <div className="rca-guardar">
              <button type="button" className="boton" onClick={() => { void almacen.refrescarLinea(); }}>
                Ver la línea recalculada
              </button>
            </div>
            {/* NO se ofrece «escribir otro dato» sin releer, y es deliberado: lo
                que hay en esta pantalla es la línea de ANTES de guardar. Un
                segundo guardado desde aquí compararía contra datos viejos y
                chocaría con el cerrojo de revisión, que respondería «otra
                persona guardó cambios» cuando esa otra persona fue él mismo
                hace diez segundos. */}
            <p className="fine">
              Para seguir completando este apoyo, pulse arriba: la línea se vuelve a leer de la base
              y la ficha se abre con lo que acaba de guardar dentro. Lo que hay ahora en pantalla es
              la línea de <b>antes</b> de guardar, y escribir sobre ella daría un aviso de conflicto
              con usted mismo.
            </p>
          </>
        )}
      </div>

      <p className="advertencia">
        <b>Lo que este formulario no hace, a propósito:</b> no aplica ningún dato a varios apoyos a la
        vez. La carga de rotura, la capacidad y el tipo de apoyo sí son del MODELO y podrán ir por
        lote cuando el lote exista, con permiso de administración y sin pisar nunca un valor ya
        declarado. La altura libre, la altura del amarre y los conductores que amarran <b>no van por
        lote nunca</b>: dependen del terreno y de qué hace ese apoyo en la línea.
      </p>
    </div>
  );
}
