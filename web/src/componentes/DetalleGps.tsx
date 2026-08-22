// ============================================================================
// componentes/DetalleGps.tsx — el recorrido de la línea, a pantalla completa
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE, en palabras del Ingeniero: *«el fondo está en la mitad […]
// quizás podemos crear debajo de resumen un apartado que se llame detalle GPS de
// la línea y ahí se pueda apreciar mejor y más grande el mapa con los filtros de
// fondo a un lado que no impidan apreciar todo el recorrido de la línea»*.
//
// EL PROBLEMA ERA REAL Y ERA DE DISPOSICIÓN, no de mapa. En el Resumen el mapa
// es una tarjeta entre otras y comparte el ancho con el panel de cifras; encima
// lleva su selector de capas flotando, que creció al ganar la leyenda de la capa
// encendida —selector de mes, barra de color, avisos— hasta tapar justo el
// trazado. Dos capas de información peleando por el mismo sitio.
//
// AQUÍ EL MAPA ES LA PANTALLA: ancho completo, más alto, y los controles A UN
// LADO con su propio desplazamiento. No es un mapa distinto — es EL MISMO
// componente con la disposición cambiada por una prop. Un segundo mapa habría
// sido un segundo sitio donde arreglar cada fallo.
//
// Y LO QUE ACOMPAÑA AL MAPA ES EL DATO GPS, que es lo que da nombre a la
// pestaña: de dónde salió cada punto, con qué precisión y en qué sistema. La
// tabla no es relleno; es lo que permite discutir una coordenada sin abrir la
// ficha de cada apoyo, y lo que recuerda —en cada fila— que ±8 m no sirve para
// verificar un despeje.
// ============================================================================
import { Suspense, lazy, useMemo, useState } from 'react';
import type { Apoyo, Hipotesis, Investigacion } from '@lineas/contratos';
import { conReintentos } from '../datos/cargar';
import { PlantaSvg, RespaldoMapa } from './Linea';
import { soloEstructuras, nombreVisible, resumenDelLevantamiento } from '../vistas/planta';
import { aGMS, nf } from '../vistas/formato';
import { cableDeGuarda, type EstadoGuarda } from '../vistas/cableGuarda';
import { almacen } from '../datos/enlace';
import type { ClaveAtlas } from '../datos/ruta';

// ⚠️ `conReintentos`, y no un `import()` pelado. `datos/cargar.ts` es «la ÚNICA
// frontera de carga diferida del sistema» y lo es por un fallo que ya ocurrió en
// producción: el trozo tardó unos segundos en estar disponible, el navegador
// falló una vez y la página se quedó en blanco PARA SIEMPRE. Una segunda
// frontera sin reintentos habría reabierto exactamente ese agujero, y aquí duele
// más: a esta pestaña se llega por enlace directo desde el teléfono, en campo.
const Mapa = lazy(() => conReintentos(() => import('./Mapa')));

/**
 * LOS ATLAS DEL CARIBE, aquí dentro y PEREZOSOS.
 *
 * El Ingeniero pidió «que el atlas solar se aprecie desde Detalle GPS». La razón
 * por la que no estaba —un segundo `.pmtiles` de 5 MiB en la pestaña a la que se
 * llega desde el teléfono, en campo (`99 §ADR-045`)— sigue siendo cierta, así que
 * no se monta solo: mientras no se despliega, este trozo NO se descarga y esta
 * pestaña pesa exactamente lo que pesaba. Al abrirlo se trae el mapa regional, la
 * ficha y el mes; se cierra y se queda en memoria para la segunda vez.
 */
const AtlasCaribe = lazy(() => conReintentos(() => import('./AtlasCaribe'))
  .then((m) => ({ default: m.AtlasCaribe })));

/** Un punto del levantamiento, con lo que el GPS dejó dicho de él. */
interface FilaGps {
  id: string;
  nombre: string;
  esEstructura: boolean;
  lat: number;
  lon: number;
  cota_m: number | null;
  precision_m: number | null;
  metodo: string;
  sistema: string;
}

export function DetalleGps({ apoyos, investigaciones, alVerEvento, hipotesis, sesion }: {
  apoyos: Apoyo[];
  investigaciones?: Investigacion[];
  alVerEvento?: (id: string) => void;
  hipotesis?: Hipotesis;
  /**
   * Con qué permiso se entró. Solo decide si se ENSEÑA el declarador del cable
   * de guarda: la frontera de verdad son las reglas de la base, que rechazan la
   * escritura de quien no puede aunque el control estuviera en pantalla
   * (`ADR-024`). Esconderlo es cortesía, no seguridad.
   */
  sesion?: { rol: string };
}) {
  const filas = useMemo<FilaGps[]>(() => [...apoyos]
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .map((a) => {
      const c = a.coordenada;
      return {
        id: a.id,
        nombre: nombreVisible(a),
        esEstructura: (a.tipoPunto ?? 'Estructura') === 'Estructura',
        lat: c.lat,
        lon: c.lon,
        cota_m: c.cotaTerreno_m ?? null,
        precision_m: c.precision_m ?? null,
        metodo: c.metodo === 'gps_mano' ? 'GPS de mano' : (c.metodo ?? '—'),
        sistema: c.sistemaReferencia ?? '—',
      };
    }), [apoyos]);

  const estructuras = useMemo(() => soloEstructuras(apoyos).length, [apoyos]);
  // Quién es dueño de este hecho: `vistas/planta.ts`. Aquí no se agrega nada —
  // tomar el sistema y el método de la PRIMERA fila mentiría el día que el
  // levantamiento sea mixto, y la peor precisión no es un `reduce` de pantalla.
  const lev = useMemo(() => resumenDelLevantamiento(apoyos), [apoyos]);

  return (
    <>
      <section className="panel">
        <h2>Detalle GPS de la línea</h2>
        <p className="saludo">
          El recorrido completo, a pantalla entera. Los filtros de fondo y las capas van
          <b> a un lado</b>, para que no tapen el trazado. Clic en un punto: su ficha; clic en el
          trazado: su tramo de tensión.
        </p>

        {/* Las mismas TRES redes que el Resumen, y por los mismos motivos: el
            error boundary impide que un fallo del mapa se lleve por delante la
            aplicación entera, y el `respaldo` degrada al esquema geométrico —que
            funciona sin conexión— en vez de dejar una caja vacía con un panel de
            capas que parece sano y no hace nada. Un hueco disfrazado de pantalla
            buena es justo lo que este producto no puede permitirse. */}
        <RespaldoMapa apoyos={apoyos}>
          <Suspense fallback={<PlantaSvg apoyos={apoyos} nota="Descargando el mapa…" />}>
            <Mapa apoyos={apoyos} eventos={investigaciones} alVerEvento={alVerEvento}
              hipotesis={hipotesis} panelALado pantalla="detalle-gps"
              respaldo={<PlantaSvg apoyos={apoyos} nota="El mapa no se pudo descargar; se muestra el esquema geométrico (funciona sin conexión). Las coordenadas de abajo siguen completas." />} />
          </Suspense>
        </RespaldoMapa>

        <p className="leyenda">
          <span className="li ancla" /> anclaje
          <span className="li susp2" /> suspensión
          <span className="li term2" /> terminal
          <span className="li emp" /> empalme (no es apoyo)
        </p>
      </section>

      <AtlasDelCaribe apoyos={apoyos} />

      {(sesion?.rol === 'admin' || sesion?.rol === 'editor') && (
        <DeclararCableGuarda apoyos={apoyos} />
      )}

      <section className="panel">
        <h2>Coordenadas levantadas</h2>
        <p className="fine">
          {nf(estructuras)} estructuras y {nf(filas.length - estructuras)} empalmes ·
          sistema <b>{lev.sistemas.join(' / ') || '—'}</b> · {lev.metodos.join(' / ') || '—'}
          {lev.peorPrecision_m !== null && (
            <> · precisión declarada más floja: <b>± {nf(lev.peorPrecision_m)} m</b></>
          )}.
        </p>
        <p className="advertencia">
          <b>Esta precisión no sirve para verificar despejes.</b> Un GPS de mano sitúa el apoyo en el
          plano con el error que él mismo declara; la cota que entrega arrastra ese mismo error y por
          eso el relieve no se dibuja ni entra en el vano peso. Sirve para saber dónde
          está el apoyo y para llegar hasta él, no para dictaminar una distancia vertical.
        </p>

        <div className="tabla-caja">
          <table className="tabla">
            <caption>
              Un punto por fila, en el orden del recorrido. Los empalmes se listan igual: tienen su
              propio punto levantado aunque no sean apoyos.
            </caption>
            <thead>
              <tr>
                <th>Punto</th>
                <th>Latitud</th>
                <th>Longitud</th>
                <th className="num">Decimal</th>
                <th className="num">Cota (m)</th>
                <th className="num">Precisión</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td>
                    <b>{f.nombre}</b>
                    {!f.esEstructura && <span className="fine"> · empalme</span>}
                  </td>
                  <td className="mono">{aGMS(f.lat, 'lat')}</td>
                  <td className="mono">{aGMS(f.lon, 'lon')}</td>
                  <td className="mono num">{f.lat.toFixed(6)}, {f.lon.toFixed(6)}</td>
                  <td className="num">{f.cota_m === null ? '—' : nf(f.cota_m, 1)}</td>
                  <td className="num">{f.precision_m === null ? '—' : `± ${nf(f.precision_m)} m`}</td>
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
 * DECLARAR EL CABLE DE GUARDA, VANO A VANO.
 *
 * Vive AQUÍ y no en Fichas a propósito: la ficha son los seis datos que dan
 * VEREDICTO a un apoyo, y esto no da ninguno — es el estado de la protección de
 * la línea, y se declara mirando el recorrido, que es justo lo que esta pantalla
 * enseña. El mapa de arriba pinta lo que aquí se marca.
 *
 * ⚠️ TRES ESTADOS, y «no consta» es uno de ellos, no la ausencia de los otros
 * dos. Se puede volver a «no consta» a propósito: una marca equivocada tiene que
 * poder deshacerse sin dejar afirmado lo contrario de lo que se quiso decir.
 *
 * ⚠️ SE DECLARA POR VANO, y el vano es entre ESTRUCTURAS. Los empalmes no salen
 * en esta lista: no sostienen conductor, y ofrecerlos invitaría a partir un vano
 * real en dos falsos (`40 §10`).
 */
function DeclararCableGuarda({ apoyos }: { apoyos: Apoyo[] }) {
  const guarda = useMemo(() => cableDeGuarda(apoyos), [apoyos]);
  const porId = useMemo(() => new Map(apoyos.map((a) => [a.id, a])), [apoyos]);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [ultimo, setUltimo] = useState<string | null>(null);

  if (!guarda.vanos.length) return null;

  const declarar = async (desdeId: string, estado: EstadoGuarda) => {
    const apoyo = porId.get(desdeId);
    if (!apoyo) return;
    setGuardando(desdeId); setFallo(null); setUltimo(null);
    try {
      const acuse = await almacen.declararCableGuarda(
        desdeId,
        estado === 'sin_dato' ? null : estado,
        (apoyo as { revision?: number }).revision ?? 0,
      );
      setUltimo(
        acuse.valor === null
          ? `El vano que sale de ${acuse.apoyo} vuelve a «no consta».`
          : `El vano que sale de ${acuse.apoyo} queda declarado ${acuse.valor === 'ausente' ? 'SIN' : 'CON'} cable de guarda.`,
      );
    } catch (e) {
      setFallo((e as Error)?.message ?? 'No se pudo guardar. No se ha escrito nada.');
    } finally {
      setGuardando(null);
    }
  };

  return (
    <section className="panel">
      <h2>Cable de guarda, vano a vano</h2>
      <p className="saludo">
        Lo que se marque aquí es lo que el mapa de arriba pinta en <b>rojo cortado</b>. Es
        <b> inventario de la protección</b> de la línea: <b>no entra en ningún cálculo</b> y no
        cambia el veredicto de ningún apoyo.
      </p>
      <p className="advertencia">
        <b>«No consta» no es «lo lleva».</b> Un vano sin declarar significa que nadie lo ha
        comprobado, y por eso no se pinta: dar por sana una parte de la línea que nadie ha mirado es
        peor que dejarla en blanco.
        {guarda.nSinDato > 0 && <> Hoy quedan <b>{guarda.nSinDato} de {guarda.vanos.length}</b> sin comprobar.</>}
      </p>
      {fallo && <p className="mapa-capas-n alerta">{fallo}</p>}
      {ultimo && <p className="fine" aria-live="polite">{ultimo}</p>}
      <div className="tabla-caja">
        <table className="tabla">
          <caption>
            Un vano por fila, entre estructuras. Los empalmes no salen: no sostienen el conductor.
          </caption>
          <thead>
            <tr><th>Vano</th><th className="num">Metros</th><th>Cable de guarda</th></tr>
          </thead>
          <tbody>
            {guarda.vanos.map((v) => (
              <tr key={v.desdeId}>
                <td><b>{v.desde}</b> → {v.hasta}</td>
                <td className="num">{nf(v.metros, 1)}</td>
                <td>
                  <select
                    aria-label={`Cable de guarda del vano ${v.desde} a ${v.hasta}`}
                    value={v.estado}
                    disabled={guardando !== null}
                    onChange={(e) => void declarar(v.desdeId, e.target.value as EstadoGuarda)}
                  >
                    <option value="sin_dato">— no consta —</option>
                    <option value="presente">Lo lleva</option>
                    <option value="ausente">NO lo lleva</option>
                  </select>
                  {guardando === v.desdeId && <span className="fine"> guardando…</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * EL ATLAS DEL CARIBE, DESDE AQUÍ — con la línea marcada dentro.
 *
 * Qué añade sobre abrirlo desde la cabecera: el atlas por su cuenta enseña
 * 6°x6° de Caribe y celdas de 111 km, y encontrar a ojo qué le toca a ESTA línea
 * obliga a buscar el trozo de costa y confiar en el dedo. Aquí se le pasa el
 * centro del recorrido, y el atlas pinta un punto con el nombre de la línea.
 *
 * ⚠️ EL CENTRO SE CALCULA EN TIEMPO DE EJECUCIÓN, con lo que vino de la base.
 * Ni una coordenada real entra en el repositorio, que es público (`33 · L-23`).
 *
 * ⚠️ CERO BYTES HASTA QUE SE PULSA. Ni el mapa regional de 5 MiB ni las fichas
 * ni los meses: mientras el desplegable esté cerrado, esta pestaña pesa lo mismo
 * que antes. Es la condición que hacía falta para traerlo aquí sin castigar a
 * quien la abre desde el teléfono, en campo.
 */
function AtlasDelCaribe({ apoyos }: { apoyos: Apoyo[] }) {
  const [abierto, setAbierto] = useState<ClaveAtlas | null>(null);

  // El centro del recorrido: la media de las coordenadas de las ESTRUCTURAS. No
  // es el centroide exacto de la línea y no hace falta que lo sea — sobre celdas
  // de 111 km, cualquier punto del recorrido cae en la misma celda o en la
  // vecina, y el punto está para situar, no para medir.
  const marca = useMemo(() => {
    const puntos = soloEstructuras(apoyos).map((a) => a.coordenada).filter(Boolean);
    if (!puntos.length) return null;
    const lon = puntos.reduce((s, c) => s + c.lon, 0) / puntos.length;
    const lat = puntos.reduce((s, c) => s + c.lat, 0) / puntos.length;
    return { lon, lat, nombre: nombreVisible(apoyos[0]).split(' ')[0] || 'esta línea' };
  }, [apoyos]);

  return (
    <section className="panel">
      <h2>El clima de la región, sobre el mapa</h2>
      <p className="saludo">
        Los dos atlas del Caribe —<b>sol</b> y <b>temperatura del aire</b>— hora a hora, sobre los
        siete departamentos. Son de la REGIÓN, no de esta línea: se abren aquí con{' '}
        <b>el punto de la línea marcado</b> para poder leer qué le toca a ella.
      </p>
      <p className="fine">
        No se descarga nada hasta que abra uno: el mapa regional pesa 5 MiB y esta pestaña se
        abre también desde el teléfono, en campo.
      </p>

      <div className="acciones">
        {(['sol', 'temperatura'] as ClaveAtlas[]).map((c) => (
          <button key={c} type="button"
            className={'boton chico' + (abierto === c ? ' activo' : '')}
            aria-pressed={abierto === c}
            onClick={() => setAbierto(abierto === c ? null : c)}>
            {abierto === c ? 'Cerrar ' : 'Ver '}
            {c === 'sol' ? 'atlas solar' : 'atlas de temperatura'}
          </button>
        ))}
      </div>

      {abierto && (
        <Suspense fallback={<p className="fine">Bajando el atlas…</p>}>
          <AtlasCaribe atlas={abierto} embebido marca={marca} />
        </Suspense>
      )}
    </section>
  );
}
