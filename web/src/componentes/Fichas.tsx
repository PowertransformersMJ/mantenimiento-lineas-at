// ============================================================================
// componentes/Fichas.tsx — la ficha de cada punto de la línea
// ----------------------------------------------------------------------------
// Réplica de la pestaña "Fichas" del módulo original, con una diferencia
// honesta: muestra SOLO lo que existe de verdad (inventario, geometría derivada
// y procedencia de cada dato). La ficha completa de ~48 campos llega con la
// captura de campo (F4) — aquí no se finge nada (regla: no fabricar datos).
// ============================================================================
import { useMemo, useState, type ReactNode } from 'react';
import { FUNCIONES_ANCLA, type Apoyo, type Conductor, type Evidencia, type Hipotesis } from '@lineas/contratos';
import { vincenty, deflexion, vanoViento } from '@lineas/nucleo/geodesia';
import { tramosDeTension } from '@lineas/nucleo/mecanica';
import { soloEstructuras, nombreVisible, vanos } from '../vistas/planta';
import { nf, aGMS } from '../vistas/formato';
import { contextoDeLinea } from '../vistas/ejesLinea';
import { avisoDeSupuestos, estadoDelApoyo, etiquetaDeOrigen, selloDeOrigen } from '../vistas/fichaEstructural';
import { FichaCriterios } from './FichaCriterios';
import { FichaEditor } from './FichaEditor';
import { FichaLote } from './FichaLote';
import { Galeria } from './Galeria';

/**
 * Un instante ISO, en fecha legible. Se corta a la fecha a propósito: en
 * mantenimiento la hora exacta de una medición rara vez importa, y el día sí.
 */
const fecha = (iso: string | undefined | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('es-CO');
};

// Un hecho, un dueño: la lista de funciones que anclan vive en el contrato.
const esAnclaF = (f: string) => FUNCIONES_ANCLA.includes(f);

/** Un dato del inventario: su valor real, o el hueco DECLARADO (no se finge). */
function Dato({ v, unidad }: { v: string | number | null | undefined; unidad?: string }): ReactNode {
  if (v == null || v === '') return <span className="pendiente-f4">pendiente — se captura en campo (F4)</span>;
  return <>{typeof v === 'number' ? nf(v, unidad === 'm' ? 1 : 0) : v}{unidad ? ` ${unidad}` : ''}</>;
}

/**
 * DE DÓNDE SALIÓ ESTE NÚMERO, pegado al número.
 *
 * Lo `supuesto` se marca distinto y con todas las letras, no en gris pequeño: un
 * dato estimado a ojo que llega a un papel firmado sin la marca convierte una
 * estimación en un dictamen, y ése es el peor resultado posible de esta ola. La
 * lista de qué está supuesto la da `vistas/fichaEstructural.ts`; aquí solo se
 * pinta.
 */
function Sello({ apoyo, clave }: { apoyo: Apoyo; clave: string }): ReactNode {
  const s = (apoyo.procedencias ?? {})[clave as keyof NonNullable<Apoyo['procedencias']>];
  if (!s) return null;
  const supuesto = s.procedencia === 'supuesto';
  return (
    <span className={supuesto ? 'ficha-supuesto' : 'ficha-origen'}>
      {supuesto ? 'SUPUESTO — nadie lo verificó' : etiquetaDeOrigen(s.procedencia)}
      {s.fuente ? `: ${s.fuente}` : ''}
    </span>
  );
}

interface FichaPunto {
  apoyo: Apoyo;
  esEstructura: boolean;
  indiceEstructura: number | null;   // posición entre estructuras (si lo es)
  deflexion: number | null;
  vanoAnterior: { hacia: string; m: number } | null;
  vanoSiguiente: { hacia: string; m: number } | null;
  vanoViento: number | null;
  tramo: string | null;
  enVano: string | null;             // para empalmes: dentro de qué vano viven
}

export function Fichas({ apoyos, linea, conductor, hipotesis, evidencias = [], sesion }:
  { apoyos: Apoyo[];
    linea?: { tensionMaxima_kV?: number; tensionNominal_kV?: number; circuitos?: number };
    /**
     * El conductor y la hipótesis NO son decoración de esta pestaña: son lo que
     * el motor necesita para poder decir qué veredictos se moverían si se
     * completa la ficha. Sin ellos, el antes/después no se podría calcular y
     * habría que enseñar el formulario a ciegas.
     */
    conductor: Conductor; hipotesis: Hipotesis;
    evidencias?: Evidencia[];
    /**
     * Quién entró y con qué permiso. Es opcional porque la ficha se LEE sin
     * saberlo; lo que exige saberlo es escribir. Si no consta, el formulario no
     * se ofrece y se dice por qué — nunca se ofrece un botón que la base va a
     * negar.
     */
    sesion?: { correo: string | null; rol: string; orgId: string; uid: string } }) {
  const fichas = useMemo<FichaPunto[]>(() => {
    const orden = [...apoyos].sort((x, y) => x.orden - y.orden);
    const E = soloEstructuras(orden);
    const geo = E.map((a) => ({ lat: a.coordenada.lat, lon: a.coordenada.lon }));
    const L = vanos(orden);

    // A qué tramo de tensión pertenece cada estructura.
    const paraNucleo = E.map((a) => ({ funcionEstructural: a.funcionEstructural, nombre: nombreVisible(a) }));
    const tramos = tramosDeTension(paraNucleo, L);
    const tramoDe = (idx: number): string | null => {
      let ini = 0;
      for (let t = 0; t < tramos.length; t++) {
        const fin = ini + tramos[t].vanos.length;
        if (idx >= ini && idx <= fin) return `${t + 1} · ${tramos[t].desde.nombre} → ${tramos[t].hasta.nombre}`;
        ini = fin;
      }
      return null;
    };

    return orden.map((a) => {
      const esE = (a.tipoPunto ?? 'Estructura') === 'Estructura';
      if (!esE) {
        // Empalme: vive DENTRO de un vano entre dos estructuras.
        const antes = [...orden].filter((x) => x.orden < a.orden && (x.tipoPunto ?? 'Estructura') === 'Estructura').pop();
        const despues = orden.find((x) => x.orden > a.orden && (x.tipoPunto ?? 'Estructura') === 'Estructura');
        return {
          apoyo: a, esEstructura: false, indiceEstructura: null, deflexion: null,
          vanoAnterior: null, vanoSiguiente: null, vanoViento: null, tramo: null,
          enVano: antes && despues ? `${nombreVisible(antes)} → ${nombreVisible(despues)}` : null,
        };
      }
      const i = E.findIndex((x) => x.id === a.id);
      const vAnt = i > 0 ? vincenty(geo[i - 1].lat, geo[i - 1].lon, geo[i].lat, geo[i].lon).d : null;
      const vSig = i < E.length - 1 ? vincenty(geo[i].lat, geo[i].lon, geo[i + 1].lat, geo[i + 1].lon).d : null;
      return {
        apoyo: a,
        esEstructura: true,
        indiceEstructura: i,
        deflexion: deflexion(geo, i),
        vanoAnterior: vAnt !== null ? { hacia: nombreVisible(E[i - 1]), m: vAnt } : null,
        vanoSiguiente: vSig !== null ? { hacia: nombreVisible(E[i + 1]), m: vSig } : null,
        vanoViento: vanoViento(vAnt, vSig),
        tramo: tramoDe(i),
        enVano: null,
      };
    });
  }, [apoyos]);

  const [sel, setSel] = useState(0);
  /**
   * Si el formulario de la ficha está abierto. Se cierra al cambiar de punto a
   * propósito: un formulario a medio escribir que sigue abierto al saltar a otro
   * apoyo es la forma más fácil de guardar la altura de E07 dentro de E08.
   */
  const [editando, setEditando] = useState(false);
  /**
   * Si el panel del LOTE está abierto. Es independiente del formulario de un
   * apoyo y no se cierra al cambiar de chip: marcar veinte apoyos y perderlo por
   * pulsar un chip sería la forma más rápida de que nadie lo volviera a usar.
   */
  const [lote, setLote] = useState(false);
  const apoyoId = fichas[sel]?.apoyo.id;

  /**
   * La línea entera en la forma que el núcleo pide, para el antes/después.
   *
   * La arma `vistas/ejesLinea.ts`, que es su dueño único: son DOS formas de
   * tramo —la aplanada y la rica— y pasarle la aplanada al eje longitudinal no
   * da error, deja el eje mudo. Aquí no se vuelve a montar ninguna.
   */
  const contexto = useMemo(
    () => contextoDeLinea(apoyos, conductor, hipotesis, linea?.circuitos),
    [apoyos, conductor, hipotesis, linea?.circuitos]);

  /** Cómo está HOY este apoyo: si tiene veredicto y, si no, qué le falta. */
  const estado = useMemo(
    () => (apoyoId ? estadoDelApoyo(contexto, apoyoId) : null),
    [contexto, apoyoId]);

  /**
   * Las fotos de este punto, y solo de este punto.
   *
   * ⚠️ `useMemo`, NO un `.filter()` en línea. `Galeria` descarga los binarios en
   * un `useEffect` que depende de la IDENTIDAD del array que recibe, y un filtro
   * en línea crea un array nuevo en CADA render. Con la selección del chip como
   * estado, eso significa volver a descargar todas las fotos del apoyo en cada
   * clic: E02 tiene 20, y en 3G rural eso es la pestaña inutilizable justo
   * cuando la cuadrilla la necesita (plan de TODO-43, riesgo verificado).
   *
   * El filtro va EN MEMORIA y no como un tercer `where` en la consulta: combinar
   * filtros de igualdad en Firestore puede exigir un índice compuesto, y un
   * índice que falta no da un error claro — deja la consulta colgada. Con 99
   * documentos no compensa el riesgo.
   */
  const fotosDelPunto = useMemo(
    () => evidencias.filter((e) => e.apoyoId === apoyoId),
    [evidencias, apoyoId],
  );

  const f = fichas[sel];
  if (!f) return null;
  const a = f.apoyo;
  const c = a.coordenada;

  /**
   * Si esta sesión puede ESCRIBIR en la ficha.
   *
   * ⚠️ Esto es HIGIENE, no la frontera de seguridad: quien quisiera podría
   * llamar a la base igual, y quien decide de verdad son las reglas de
   * Firestore. Existe para que nadie rellene un formulario de seis campos y se
   * entere al final de que la base lo niega.
   */
  const puedeEditar = sesion?.rol === 'admin' || sesion?.rol === 'editor';

  /**
   * Aplicar un dato a VARIOS apoyos exige ADMINISTRACIÓN, no edición: la
   * escritura lo comprueba de verdad y aquí se comprueba igual, para no ofrecer
   * un botón que la base va a negar después de marcar veinte apoyos.
   */
  const puedeLote = sesion?.rol === 'admin';

  const claseChip = (x: FichaPunto) =>
    !x.esEstructura ? 'chip emp'
      : x.apoyo.funcionEstructural === 'Terminal' ? 'chip term'
      : esAnclaF(x.apoyo.funcionEstructural) ? 'chip ancla'
      : 'chip';

  return (
    <>
      <section className="panel">
        <h2>Fichas por punto</h2>
        <div className="chips">
          {fichas.map((x, i) => (
            <button key={x.apoyo.id}
              className={claseChip(x) + (i === sel ? ' activo' : '')}
              onClick={() => { setSel(i); setEditando(false); }}>
              {nombreVisible(x.apoyo).replace('LN-627 ', '')}
            </button>
          ))}
        </div>

        {/* ── EL LOTE ────────────────────────────────────────────────────────
            Va AQUÍ, en la cabecera de la pestaña y no dentro de la ficha de un
            apoyo: lo que se aplica a varios no pertenece a ninguno. Solo se
            ofrece con permiso de ADMINISTRACIÓN —el daño de un lote no es el de
            una ficha— y cuando no se tiene, se dice por qué en vez de esconder
            el botón: un botón que desaparece se lee como una avería. */}
        {!lote && puedeLote && (
          <button type="button" className="boton" onClick={() => setLote(true)}>
            Aplicar un dato de catálogo a varios apoyos
          </button>
        )}
        {!lote && !puedeLote && puedeEditar && (
          <p className="fine">
            <b>Aplicar el mismo dato a varios apoyos es acto de administración</b> y esta sesión
            entró con el permiso «{sesion?.rol}». Los apoyos se completan uno a uno desde su ficha,
            que sí está disponible con su permiso.
          </p>
        )}
        {lote && sesion && (
          <FichaLote apoyos={apoyos} contexto={contexto} sesion={sesion}
            alCerrar={() => setLote(false)} />
        )}
      </section>

      <section className="panel">
        <div className="ficha-cab">
          <h2>{nombreVisible(a)}</h2>
          <span className={'sello ' + (f.esEstructura ? (esAnclaF(a.funcionEstructural) ? 'ambar' : 'azul') : 'gris')}>
            {f.esEstructura ? a.funcionEstructural : 'Empalme — no es apoyo'}
          </span>
        </div>

        <div className="ficha-grilla">
          <div className="ficha-bloque">
            <h3>Identidad</h3>
            <dl>
              <dt>Nombre canónico</dt><dd>{nombreVisible(a)}</dd>
              <dt>Como quedó en el GPS</dt><dd className="mono">{a.nombreCampo}</dd>
              <dt>Posición en la línea</dt>
              <dd>{f.esEstructura ? `estructura ${(f.indiceEstructura ?? 0) + 1} de ${fichas.filter((x) => x.esEstructura).length}` : `dentro del vano ${f.enVano ?? '—'}`}</dd>
              {f.tramo && <><dt>Tramo de tensión</dt><dd>{f.tramo}</dd></>}
              <dt>Función — procedencia</dt>
              <dd>{f.esEstructura
                ? `${a.funcionEstructural} · ${selloDeOrigen(a.funcionProcedencia)}`
                : 'no aplica: el empalme no sostiene el conductor'}</dd>
            </dl>
          </div>

          <div className="ficha-bloque">
            <h3>Ubicación</h3>
            <dl>
              <dt>Latitud</dt><dd className="mono">{aGMS(c.lat, 'lat')} · {c.lat.toFixed(6)}</dd>
              <dt>Longitud</dt><dd className="mono">{aGMS(c.lon, 'lon')} · {c.lon.toFixed(6)}</dd>
              <dt>Cota del terreno (GPS)</dt><dd>{c.cotaTerreno_m != null ? `${nf(c.cotaTerreno_m, 1)} m` : 'sin dato'}</dd>
              <dt>Sistema · método</dt><dd>{c.sistemaReferencia} · {c.metodo === 'gps_mano' ? 'GPS de mano' : c.metodo ?? '—'}</dd>
              <dt>Precisión declarada</dt>
              <dd>± {c.precision_m != null ? nf(c.precision_m) : '?'} m — <b>no sirve para verificar despejes</b> (docs/40 §8)</dd>
            </dl>
          </div>

          {f.esEstructura && (
            <div className="ficha-bloque">
              <h3>Geometría derivada</h3>
              <dl>
                <dt>Deflexión</dt>
                <dd>{f.deflexion === null ? 'terminal — no aplica' : `${f.deflexion.toFixed(2)}°`}</dd>
                <dt>Vano anterior</dt>
                <dd>{f.vanoAnterior ? `${nf(f.vanoAnterior.m, 1)} m desde ${f.vanoAnterior.hacia}` : '— (arranque de la línea)'}</dd>
                <dt>Vano siguiente</dt>
                <dd>{f.vanoSiguiente ? `${nf(f.vanoSiguiente.m, 1)} m hasta ${f.vanoSiguiente.hacia}` : '— (final de la línea)'}</dd>
                <dt>Vano viento</dt>
                <dd>{f.vanoViento != null ? `${nf(f.vanoViento, 1)} m` : '—'}</dd>
                <dt>Condición</dt><dd>{a.condicion}</dd>
              </dl>
            </div>
          )}

          {f.esEstructura && (
            <div className="ficha-bloque">
              <h3>Inventario del apoyo</h3>
              <dl>
                <dt>Tipo de apoyo</dt><dd><Dato v={a.tipoApoyo} /><Sello apoyo={a} clave="tipoApoyo" /></dd>
                <dt>Altura</dt><dd><Dato v={a.altura_m} unidad="m" /></dd>
                <dt>Cota de sujeción</dt><dd><Dato v={a.cotaSujecion_m} unidad="m" /></dd>
                <dt>Carga de rotura</dt><dd><Dato v={a.cargaRotura_kgf} unidad="kgf" /><Sello apoyo={a} clave="cargaRotura_kgf" /></dd>
                {/* Las dos alturas que la pestaña Cargas reclama en cada fila: sin
                    ellas la utilización del apoyo queda no evaluable para siempre.
                    Aquí el hueco se ve y se cuenta, que es el paso previo a llenarlo. */}
                <dt>Altura libre sobre el terreno</dt><dd><Dato v={a.alturaLibre_m} unidad="m" /><Sello apoyo={a} clave="alturaLibre_m" /></dd>
                <dt>Altura del punto de sujeción</dt><dd><Dato v={a.alturaAplicacion_m} unidad="m" /><Sello apoyo={a} clave="alturaAplicacion_m" /></dd>
                {/* Los dos que hasta hoy no se veían en ninguna pantalla, aunque el
                    contrato los admitía y el motor los usa: sin ellos el eje
                    longitudinal no dictamina, y un dato guardado que no se ve es un
                    dato que nadie puede discutir. */}
                <dt>Capacidad a lo largo de la línea</dt>
                <dd>
                  {a.capacidadLongitudinal
                    ? <>{nf(a.capacidadLongitudinal.valor_kgf)} kgf · {a.capacidadLongitudinal.tipo} ·
                        vale a {nf(a.capacidadLongitudinal.alturaReferencia_m, 2)} m</>
                    : <Dato v={null} />}
                  <Sello apoyo={a} clave="capacidadLongitudinal" />
                </dd>
                <dt>Conductores que amarran aquí</dt><dd><Dato v={a.nFasesAmarradas} /><Sello apoyo={a} clave="nFasesAmarradas" /></dd>
                <dt>Año de instalación</dt><dd><Dato v={a.anioInstalacion} /></dd>
                <dt>Código de inventario</dt><dd><Dato v={a.codigoInventario} /></dd>
                <dt>En servicio</dt><dd>{a.activo === false ? 'NO — retirado' : 'sí'}</dd>
              </dl>
              {a.alturaLibre_m != null && a.alturaAplicacion_m != null
                && a.alturaAplicacion_m > a.alturaLibre_m && (
                <p className="alerta">
                  <b>Geometría imposible:</b> el punto de sujeción ({nf(a.alturaAplicacion_m, 2)} m)
                  queda por encima de la punta del apoyo ({nf(a.alturaLibre_m, 2)} m). El contrato no
                  lo impide —la regla vive en su comentario, no en el esquema—, así que el dato entra
                  y el cálculo de momentos que salga de él no significaría nada. Hay que corregirlo
                  en el inventario.
                </p>
              )}

              {/* ── LA PUERTA DE ENTRADA DEL DATO (TODO-57) ──────────────────
                  Va AQUÍ, pegada a los huecos que llena, y no en una pestaña
                  aparte: el sitio donde se ve que falta un dato es el sitio
                  donde hay que poder ponerlo. Nada de lo de arriba desaparece
                  ni se mueve — el formulario se AÑADE debajo. */}
              {estado && !estado.tieneVeredicto && (
                <p className="ficha-falta">
                  <b>Este apoyo no tiene veredicto todavía.</b>{' '}
                  {estado.faltaTodavia.length > 0
                    ? <>Le falta{estado.faltaTodavia.length === 1 ? '' : 'n'}: {estado.faltaTodavia.join(' · ')}.</>
                    : 'El motor no puede dictaminarlo con lo que hay declarado.'}
                </p>
              )}
              {estado?.tieneVeredicto && (
                <p className="fine">
                  Este apoyo <b>sí</b> tiene veredicto: de lado {estado.transversal.replace('_', ' ')} ·
                  a lo largo {estado.longitudinal.replace('_', ' ')}. Los detalles, en la pestaña Cargas.
                </p>
              )}

              {!editando && puedeEditar && (
                <button type="button" className="boton" onClick={() => setEditando(true)}>
                  Completar la ficha de este apoyo
                </button>
              )}
              {!editando && !puedeEditar && (
                <p className="fine">
                  <b>Esta ficha se puede ver, pero no escribir desde esta sesión.</b>{' '}
                  {sesion
                    ? `Entró con el permiso «${sesion.rol}», y completar la ficha de un apoyo exige permiso de edición.`
                    : 'Todavía no consta con qué permiso entró, así que no se ofrece un botón que la base podría negar.'}
                </p>
              )}
            </div>
          )}

          {f.esEstructura && (
            <div className="ficha-bloque">
              <h3>Aislamiento y puesta a tierra</h3>
              <dl>
                <dt>Modelo de aislador</dt><dd><Dato v={a.aislamiento?.modelo} /></dd>
                <dt>Unidades por cadena</dt><dd><Dato v={a.aislamiento?.unidadesPorCadena} /></dd>
                <dt>Fuga por unidad</dt><dd><Dato v={a.aislamiento?.fugaPorUnidad_mm} unidad="mm" /></dd>
                <dt>Nivel de contaminación</dt><dd><Dato v={a.aislamiento?.nivelContaminacion} /></dd>
                <dt>Puesta a tierra</dt><dd><Dato v={a.puestaTierra?.tipo} /></dd>
                <dt>Varillas</dt><dd><Dato v={a.puestaTierra?.numeroVarillas} /></dd>
                <dt>Resistencia</dt><dd><Dato v={a.puestaTierra?.resistencia_ohm} unidad="Ω" /></dd>
                {/* Una resistencia SIN fecha no es un dato: 8 Ω medidos en la seca y
                    8 Ω medidos en plena lluvia dicen cosas opuestas sobre el terreno. */}
                <dt>Medida el</dt><dd><Dato v={fecha(a.puestaTierra?.medidaEn)} /></dd>
              </dl>
              {a.puestaTierra?.resistencia_ohm != null && !a.puestaTierra?.medidaEn && (
                <p className="fine">
                  <b>La resistencia no trae fecha de medición.</b> Ocho ohmios medidos en época seca
                  y ocho medidos en plena lluvia dicen cosas opuestas sobre la puesta a tierra: sin
                  la fecha, el número no se puede defender ante el cliente.
                </p>
              )}
            </div>
          )}
          <div className="ficha-bloque">
            <h3>Trazabilidad del dato</h3>
            <dl>
              {/* La identidad NO es el número «E07»: es un UUID inmutable (ADR-001).
                  Renumerar o corregir una coordenada son hechos fechados, no
                  sobrescrituras — y esto es lo único que permite demostrarlo. */}
              <dt>Identidad (UUID)</dt><dd className="mono">{a.id ?? '—'}</dd>
              <dt>Revisión</dt><dd><Dato v={a.revision} /></dd>
              <dt>Cargado el</dt><dd><Dato v={fecha(a.creadoEn)} /></dd>
              <dt>Cargado por</dt><dd><Dato v={a.creadoPor} /></dd>
              <dt>Última modificación</dt><dd><Dato v={fecha(a.actualizadoEn)} /></dd>
              <dt>Modificado por</dt><dd><Dato v={a.actualizadoPor} /></dd>
            </dl>
            <p className="fine">
              Cuando un número se discute, la conversación empieza por <b>a quién preguntarle</b> y
              por <b>de cuándo es el dato</b>. Un apoyo con muchas revisiones es una señal barata de
              que ahí ha habido discusión.
            </p>
          </div>
        </div>

        {/* El formulario. ADITIVO: se monta DEBAJO de la ficha completa, que no
            pierde ni una fila. Con `key` por apoyo, para que cambiar de punto no
            deje dentro lo tecleado del anterior. */}
        {f.esEstructura && editando && puedeEditar && sesion && (
          <FichaEditor key={a.id} apoyo={a} contexto={contexto} sesion={sesion}
            alCerrar={() => setEditando(false)} />
        )}

        {/* Un veredicto calculado sobre un dato estimado a ojo sigue siendo el
            veredicto del motor —aquí no se altera nada—, pero quien lo lea tiene
            que saberlo. Va pegado al semáforo, que es donde se decide. */}
        {f.esEstructura && avisoDeSupuestos(a) && (
          <p className="aviso"><b>{avisoDeSupuestos(a)}</b></p>
        )}

        {/* El semáforo del apoyo: qué de lo que hay CUADRA. Estaba construido y
            probado desde la ola anterior y no lo montaba ninguna pantalla. */}
        {f.esEstructura && (
          <FichaCriterios apoyo={a} contexto={{
            deflexion_grados: f.deflexion ?? null,
            vanoAnterior_m: f.vanoAnterior?.m ?? null,
            vanoSiguiente_m: f.vanoSiguiente?.m ?? null,
            // La fuga del aislamiento se juzga contra la tensión MÁXIMA de
            // operación, no la nominal. Si la línea no la declara, el criterio
            // sale «no evaluable» — no se sustituye por la nominal, que daría un
            // veredicto más benévolo que el real.
            tensionMaxima_kV: linea?.tensionMaxima_kV ?? null,
          }} />
        )}

        {/* Las fotos de ESTE punto. Va fuera del `f.esEstructura` a propósito:
            5 de las 99 fotos de LN-627 son de los dos empalmes, y condicionar la
            galería a que el punto sea estructura las dejaría invisibles para
            siempre — subidas, pagadas y sin poder verse. Un empalme tiene su
            propio UUID y su propia ficha; sus fotos son suyas. */}
        <Galeria evidencias={fotosDelPunto} rotulos={{
          titulo: 'Fotografías de este punto',
          deQue: `de ${nombreVisible(a)}`,
          alt: `Fotografía de ${nombreVisible(a)}`,
          vacio: `No hay fotografías cargadas de ${nombreVisible(a)}. Las imágenes de campo se suben aparte`,
        }} />

        <p className="advertencia">
          <b>Esta ficha muestra lo levantado, lo derivado de la geometría, y los huecos del
          inventario DECLARADOS como tales.</b> Los campos «pendiente — F4» existen en el contrato
          desde el día uno y se llenan en la captura de campo — aquí no se inventa ninguno, pero el
          hueco es visible y contable.
        </p>
      </section>
    </>
  );
}
