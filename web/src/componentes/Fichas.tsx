// ============================================================================
// componentes/Fichas.tsx — la ficha de cada punto de la línea
// ----------------------------------------------------------------------------
// Réplica de la pestaña "Fichas" del módulo original, con una diferencia
// honesta: muestra SOLO lo que existe de verdad (inventario, geometría derivada
// y procedencia de cada dato). La ficha completa de ~48 campos llega con la
// captura de campo (F4) — aquí no se finge nada (regla: no fabricar datos).
// ============================================================================
import { useMemo, useState, type ReactNode } from 'react';
import { FUNCIONES_ANCLA, type Apoyo } from '@lineas/contratos';
import { vincenty, deflexion, vanoViento } from '@lineas/nucleo/geodesia';
import { tramosDeTension } from '@lineas/nucleo/mecanica';
import { soloEstructuras, nombreVisible, vanos } from '../vistas/planta';
import { nf, aGMS } from '../vistas/formato';
import { FichaCriterios } from './FichaCriterios';

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

export function Fichas({ apoyos, linea }:
  { apoyos: Apoyo[]; linea?: { tensionMaxima_kV?: number; tensionNominal_kV?: number } }) {
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
  const f = fichas[sel];
  if (!f) return null;
  const a = f.apoyo;
  const c = a.coordenada;

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
              onClick={() => setSel(i)}>
              {nombreVisible(x.apoyo).replace('LN-627 ', '')}
            </button>
          ))}
        </div>
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
                ? `${a.funcionEstructural} · ${a.funcionProcedencia === 'confirmado_humano' ? 'confirmada por el Ingeniero' : a.funcionProcedencia}`
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
                <dt>Tipo de apoyo</dt><dd><Dato v={a.tipoApoyo} /></dd>
                <dt>Altura</dt><dd><Dato v={a.altura_m} unidad="m" /></dd>
                <dt>Cota de sujeción</dt><dd><Dato v={a.cotaSujecion_m} unidad="m" /></dd>
                <dt>Carga de rotura</dt><dd><Dato v={a.cargaRotura_kgf} unidad="kgf" /></dd>
                {/* Las dos alturas que la pestaña Cargas reclama en cada fila: sin
                    ellas la utilización del apoyo queda no evaluable para siempre.
                    Aquí el hueco se ve y se cuenta, que es el paso previo a llenarlo. */}
                <dt>Altura libre sobre el terreno</dt><dd><Dato v={a.alturaLibre_m} unidad="m" /></dd>
                <dt>Altura del punto de sujeción</dt><dd><Dato v={a.alturaAplicacion_m} unidad="m" /></dd>
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
