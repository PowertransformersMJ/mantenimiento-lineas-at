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
import { Suspense, lazy, useMemo } from 'react';
import type { Apoyo, Hipotesis, Investigacion } from '@lineas/contratos';
import { conReintentos } from '../datos/cargar';
import { PlantaSvg, RespaldoMapa } from './Linea';
import { soloEstructuras, nombreVisible, resumenDelLevantamiento } from '../vistas/planta';
import { aGMS, nf } from '../vistas/formato';

// ⚠️ `conReintentos`, y no un `import()` pelado. `datos/cargar.ts` es «la ÚNICA
// frontera de carga diferida del sistema» y lo es por un fallo que ya ocurrió en
// producción: el trozo tardó unos segundos en estar disponible, el navegador
// falló una vez y la página se quedó en blanco PARA SIEMPRE. Una segunda
// frontera sin reintentos habría reabierto exactamente ese agujero, y aquí duele
// más: a esta pestaña se llega por enlace directo desde el teléfono, en campo.
const Mapa = lazy(() => conReintentos(() => import('./Mapa')));

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

export function DetalleGps({ apoyos, investigaciones, alVerEvento, hipotesis }: {
  apoyos: Apoyo[];
  investigaciones?: Investigacion[];
  alVerEvento?: (id: string) => void;
  hipotesis?: Hipotesis;
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
              hipotesis={hipotesis} panelALado
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
