// ============================================================================
// componentes/Fichas.tsx — la ficha de cada punto de la línea
// ----------------------------------------------------------------------------
// Réplica de la pestaña "Fichas" del módulo original, con una diferencia
// honesta: muestra SOLO lo que existe de verdad (inventario, geometría derivada
// y procedencia de cada dato). La ficha completa de ~48 campos llega con la
// captura de campo (F4) — aquí no se finge nada (regla: no fabricar datos).
// ============================================================================
import { useMemo, useState } from 'react';
import type { Apoyo } from '@lineas/contratos';
import { vincenty, deflexion, vanoViento } from '@lineas/nucleo/geodesia';
import { tramosDeTension } from '@lineas/nucleo/mecanica';
import { soloEstructuras, nombreVisible, vanos } from '../vistas/planta';
import { nf, aGMS } from '../vistas/formato';

const ANCLA = /retenci|terminal|ángulo|angulo|derivaci/i;

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

export function Fichas({ apoyos }: { apoyos: Apoyo[] }) {
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
      : ANCLA.test(x.apoyo.funcionEstructural) ? 'chip ancla'
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
          <span className={'sello ' + (f.esEstructura ? (ANCLA.test(a.funcionEstructural) ? 'ambar' : 'azul') : 'gris')}>
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
        </div>

        <p className="advertencia">
          <b>Esta ficha muestra solo lo levantado y lo derivado de la geometría.</b> Los ~48 campos de
          la ficha completa (conductor por apoyo, aislamiento, puesta a tierra, crucetas, retenidas…)
          se capturan en campo en la fase F4 — aquí no se inventa ninguno.
        </p>
      </section>
    </>
  );
}
