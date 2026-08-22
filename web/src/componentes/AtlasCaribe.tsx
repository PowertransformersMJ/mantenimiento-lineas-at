// ============================================================================
// componentes/AtlasCaribe.tsx — LOS atlas del Caribe colombiano
// ----------------------------------------------------------------------------
// UNA pantalla para DOS atlas —el solar y el de temperatura del aire— porque los
// dos son el mismo producto con otro parámetro: mismo recuadro, mismos siete
// departamentos, mismo empaquetado y mismo mapa base. Lo que cambia viaja en la
// FICHA que construye `herramientas/atlas-caribe.mjs` (unidad, rampa, aviso, qué
// resume cada día); aquí solo se elige cuál se abre. Duplicar el componente
// habría dejado dos sitios donde arreglar el fallo del mes rancio que ya costó
// una auditoría adversarial encontrar (`99 §ADR-045`).
//
// POR QUÉ ES UNA PANTALLA Y NO UNA PESTAÑA. Las 14 pestañas son funciones de UNA
// línea y todas mueren sin apoyos. Esto no depende de ninguna: trae otro mapa
// base (`caribe.pmtiles`, 6°x6° frente a 0,29°x0,38°), otro recuadro y otro eje
// de tiempo.
//
// ⚠️ Y AHORA TAMBIÉN SE ABRE DENTRO DE «DETALLE GPS» (`embebido`), que es lo que
// pidió el Ingeniero. El motivo por el que no estaba ahí sigue siendo cierto —un
// segundo .pmtiles de 5 MiB en la pestaña a la que se llega desde el teléfono, en
// campo— y por eso NO se monta solo: hasta que no se despliega, esta pantalla no
// existe y no descarga ni un byte (`99 §ADR-053`).
//
// POR QUÉ NO REUSA `Mapa.tsx`. Aquel exige `apoyos.length >= 2` para siquiera
// crear el mapa, y todo lo que dibuja —trazado, tramos de tensión, apoyos,
// fichas al pulsar— es de una línea que aquí no existe. Hacerle un modo
// «regional» habría metido una bandera a lo largo de 1.400 líneas. Lo que SÍ se
// reusa es donde está la lógica de verdad: `vistas/rejilla.ts` —el byte, la
// rampa, el color, la celda de un punto— y `prepararTeselas`.
//
// ⚠️ LA MALLA ESTÁ EN GRADOS Y EL LIENZO SE COLOCA EN MERCATOR. Medido: el
// desvío máximo es de 1,53 km sobre celdas de ~110 km, o sea el 1,4 %. Es
// despreciable para VER el recurso, y se escribe en vez de callarse: cerca del
// borde de una celda, el valor que devuelve un clic puede ser el del vecino.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { layers, namedFlavor } from '@protomaps/basemaps';
import { esquinas, pintarRejilla, valorEnPunto } from '../vistas/rejilla';
import {
  bandaDelDia, cuadroDe, resumenDelDia, horaPunta, isoDe, mesesOfrecidos,
  resumenDelCuadro, type FichaAtlas, type MesOfrecido,
} from '../vistas/atlasCaribe';
import { prepararTeselas } from '../datos/teselas';
import { nf } from '../vistas/formato';
import { almacen } from '../datos/enlace';

const DEPARTAMENTOS = '/mapas/caribe-departamentos.json';
const BASE = 'caribe.pmtiles';

/** Cuál de los dos atlas. Es lo ÚNICO que esta pantalla necesita saber. */
export type ClaveAtlas = 'sol' | 'temperatura';

/**
 * LOS DOS PRODUCTOS. Aquí solo va lo que la ficha no puede traer: dónde está esa
 * ficha y cómo se llama la pantalla. Todo lo demás —unidad, rampa, avisos, qué
 * resume el día— lo dice el archivo, para que añadir un tercer atlas mañana sea
 * un perfil en el generador y una línea aquí, no una pantalla nueva.
 */
export const ATLAS: Record<ClaveAtlas, {
  ficha: string; idCapa: string; titulo: string; entradilla: string;
}> = {
  sol: {
    ficha: '/mapas/sol-caribe.json',
    idCapa: 'capa-sol',
    titulo: 'Atlas solar del Caribe',
    entradilla: 'Irradiancia solar',
  },
  temperatura: {
    ficha: '/mapas/temp-caribe.json',
    idCapa: 'capa-temp',
    titulo: 'Atlas de temperatura del Caribe',
    entradilla: 'Temperatura del aire a 2 m',
  },
};

/**
 * EL VACÍO DE FUERA DEL RECORTE SE PINTA COMO PAPEL, NO COMO MAPA ROTO.
 *
 * `caribe.pmtiles` cubre exactamente los 6°x6° del atlas (-77,7 … -71,13) y el
 * lienzo es más ancho que alto: al encuadrar el recorte entero sobran franjas a
 * los lados donde no hay ni una tesela. Con el gris del mapa base se leen como
 * cartografía que no cargó —y el reflejo siguiente es buscar una avería que no
 * existe—; con el color del papel del sitio se leen como lo que son: fuera del
 * atlas. Dentro del recorte no cambia nada: la tierra y el mar tapan el fondo.
 */
const FUERA_DEL_RECORTE = '#f5f1e8';

/** Días entre dos fechas ISO, sin husos: se restan los días julianos. */
function diasEntre(a: string, b: string): number {
  const dj = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000;
  return Math.max(0, Math.round(dj(b) - dj(a)));
}

const MESES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Los bytes de un PNG, leídos por el lienzo. El navegador ya sabe descomprimirlo. */
async function leerPng(url: string): Promise<{ px: Uint8Array; ancho: number; alto: number }> {
  const img = new Image();
  img.decoding = 'async';
  await new Promise<void>((ok, mal) => {
    img.onload = () => ok();
    img.onerror = () => mal(new Error(`no se pudo leer ${url}`));
    img.src = url;
  });
  const l = document.createElement('canvas');
  l.width = img.naturalWidth; l.height = img.naturalHeight;
  const ctx = l.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const rgba = ctx.getImageData(0, 0, l.width, l.height).data;
  const px = new Uint8Array(l.width * l.height);
  // Gris: R = G = B. Se lee el canal rojo, igual que la capa de temperatura.
  for (let i = 0; i < px.length; i++) px[i] = rgba[i * 4];
  return { px, ancho: l.width, alto: l.height };
}

export function AtlasCaribe({ atlas, embebido = false, marca }: {
  atlas: ClaveAtlas;
  /**
   * Dentro de otra pestaña, no como pantalla completa. Cambia dos cosas y solo
   * dos: no se ofrece «Volver» —no se vino de ninguna parte— y el título baja de
   * rango, porque la pestaña ya tiene el suyo.
   */
  embebido?: boolean;
  /**
   * DÓNDE CAE LA LÍNEA que se está mirando, para poder verla dentro del atlas.
   * Se pasa desde la pantalla que tiene los apoyos; el atlas por su cuenta no
   * sabe de ninguna línea y sigue funcionando sin esto.
   *
   * ⚠️ Esto es dato de CLIENTE y por eso llega como argumento en tiempo de
   * ejecución, desde la base. Ni una coordenada de estas entra en el repositorio,
   * que es público (`33 · L-23`).
   */
  marca?: { lon: number; lat: number; nombre: string } | null;
}) {
  const def = ATLAS[atlas];
  const caja = useRef<HTMLDivElement>(null);
  const mapa = useRef<maplibregl.Map | null>(null);
  const pincel = useRef<HTMLCanvasElement | null>(null);
  /**
   * ⚠️ LOS BYTES DEL MES VAN EN EL ESTADO, NO EN UNA REFERENCIA, y esto es un
   * ARREGLO: con una referencia, cambiar de mes recalculaba el cuadro con los
   * bytes VIEJOS —el PNG nuevo aún no había llegado— y, si el mes nuevo tenía
   * los mismos días o menos, el recorte pasaba la guarda de longitud y devolvía
   * un cuadro del mes ANTERIOR. Peor: lo único que forzaba el recálculo después
   * era `setDia`/`setHora`, y si los dos coincidían con lo que ya había, React
   * no repintaba y el mapa se quedaba ahí.
   *
   * Medido sobre los archivos reales: la hora con más sol del día 1 es la 11 en
   * enero, marzo y mayo. Se abre en mayo a las 11, se pasa a marzo, los dos
   * `set` son inútiles y queda MAYO PINTADO CON LA ETIQUETA DE MARZO — colores
   * de un mes y números de otro en la misma pantalla. Lo cazó la revisión
   * adversarial; ningún guardián lo veía porque vive en el estado de React y no
   * en el módulo puro.
   */
  const [bytes, setBytes] = useState<{ mes: string; px: Uint8Array } | null>(null);
  const montado = useRef(true);

  const [ficha, setFicha] = useState<FichaAtlas | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [mesClave, setMesClave] = useState<string | null>(null);
  const [dia, setDia] = useState(1);
  const [hora, setHora] = useState(12);
  const [listoMapa, setListoMapa] = useState(false);
  const [clic, setClic] = useState<{ v: number | null; lon: number; lat: number } | null>(null);

  useEffect(() => () => { montado.current = false; }, []);

  // ── La ficha ──────────────────────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(def.ficha);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const f = await r.json() as FichaAtlas;
        if (!montado.current) return;
        setFicha(f);
        // Se abre en el ÚLTIMO mes con horas, no en enero: lo que interesa de un
        // atlas del año en curso es lo más reciente que existe.
        setMesClave(f.meses[f.meses.length - 1]?.clave ?? null);
      } catch (e) {
        if (montado.current) setFallo((e as Error).message);
      }
    })();
    // La ficha se vuelve a pedir si cambia el atlas: es otro archivo.
  }, [def.ficha]);

  /** Todos los meses con algo que enseñar, tengan horas o solo resumen del día. */
  const ofrecidos = useMemo(() => (ficha ? mesesOfrecidos(ficha) : []), [ficha]);
  const mes: MesOfrecido | null = useMemo(
    () => ofrecidos.find((m) => m.clave === mesClave) ?? null, [ofrecidos, mesClave]);

  // ── El mapa, una sola vez ─────────────────────────────────────────────────
  useEffect(() => {
    if (!caja.current || mapa.current || !ficha) return;
    let cancelado = false;
    void (async () => {
      try {
        const meta = await prepararTeselas(BASE);
        if (cancelado || !caja.current) return;

        // El fondo del mapa base, repintado (ver `FUERA_DEL_RECORTE`). Se toca la
        // capa por su TIPO y no solo por su nombre: si un día el mapa base deja de
        // traer un fondo, esto no hace nada en vez de romper el estilo entero.
        const capasBase = layers('protomaps', namedFlavor('light'), { lang: 'es' });
        for (const capa of capasBase) {
          if (capa.type === 'background') {
            capa.paint = { ...capa.paint, 'background-color': FUERA_DEL_RECORTE };
          }
        }
        const m = new maplibregl.Map({
          container: caja.current,
          style: {
            version: 8,
            glyphs: `${location.origin}/basemaps-assets/fonts/{fontstack}/{range}.pbf`,
            sprite: `${location.origin}/basemaps-assets/sprites/v4/light`,
            sources: {
              protomaps: {
                type: 'vector',
                tiles: [`pmtiles://${BASE}/{z}/{x}/{y}`],
                minzoom: meta.zMin, maxzoom: meta.zMax, bounds: meta.limites,
                attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
              },
            },
            layers: capasBase,
          },
          attributionControl: { compact: false },
          bounds: ficha.bbox as [number, number, number, number],
          fitBoundsOptions: { padding: 12 },
          // El techo lo pone EL DATO, no el mapa: con celdas de 111 km, pasar de
          // aquí es enseñar un detalle que la medida no tiene.
          maxZoom: 9.5,
        });
        mapa.current = m;
        m.on('error', (e) => console.warn(`[atlas ${atlas}]`, (e as { error?: Error }).error?.message ?? e));
        m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
        m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

        m.once('style.load', () => {
          if (cancelado) return;
          void (async () => {
            // Los siete departamentos: el mapa base trae las LÍNEAS divisorias
            // pero no los NOMBRES, así que sin esto habría fronteras mudas.
            try {
              const dep = await (await fetch(DEPARTAMENTOS)).json();
              // Estaba al revés y añadía capas a un mapa YA RETIRADO cuando el
              // efecto se cancelaba; lo tapaba el `catch` de abajo.
              if (!cancelado && !m.getSource('departamentos')) {
                m.addSource('departamentos', { type: 'geojson', data: dep });
                m.addLayer({
                  id: 'dep-borde', type: 'line', source: 'departamentos',
                  paint: { 'line-color': '#2c2a24', 'line-width': 1.4, 'line-opacity': 0.55 },
                });
                m.addSource('dep-rotulos', {
                  type: 'geojson',
                  data: {
                    type: 'FeatureCollection',
                    features: (dep.features as { properties: { nombre: string; rotulo: [number, number] } }[])
                      .map((f) => ({
                        type: 'Feature' as const, properties: { nombre: f.properties.nombre },
                        geometry: { type: 'Point' as const, coordinates: f.properties.rotulo },
                      })),
                  },
                });
                m.addLayer({
                  id: 'dep-nombres', type: 'symbol', source: 'dep-rotulos',
                  layout: {
                    'text-field': ['get', 'nombre'], 'text-font': ['Noto Sans Medium'],
                    'text-size': 13, 'text-transform': 'uppercase', 'text-letter-spacing': 0.08,
                  },
                  paint: {
                    'text-color': '#2c2a24', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6,
                  },
                });
              }
            } catch { /* los nombres son opcionales: sin ellos el mapa sigue */ }
            if (!cancelado) setListoMapa(true);
          })();
        });
        m.once('load', () => { if (!cancelado) setListoMapa(true); });
      } catch (e) {
        if (!cancelado) setFallo((e as Error).message);
      }
    })();
    return () => { cancelado = true; mapa.current?.remove(); mapa.current = null; setListoMapa(false); };
  }, [ficha]);

  // ── El mes: se baja entero y se queda en memoria ──────────────────────────
  useEffect(() => {
    if (!ficha || !mes) return;
    // Un mes sin PNG no tiene nada que bajar: solo consta su total del día.
    if (!mes.png) { setBytes(null); return; }
    let cancelado = false;
    const png = mes.png;
    void (async () => {
      try {
        const { px } = await leerPng(`/mapas/${png.archivo}`);
        if (cancelado) return;
        // Los bytes van ETIQUETADOS con su mes: así el cuadro no puede salir de
        // un PNG que ya no es el que se está mirando.
        setBytes({ mes: mes.clave, px });
        // Se entra por la HORA PUNTA del día: en el sol, abrir a medianoche
        // pinta un mapa negro que se lee como una avería; en la temperatura, la
        // madrugada es la hora que NO decide nada — la ampacidad la manda la más
        // caliente, y es la que tiene que estar delante al abrir.
        const d = Math.min(dia, mes.dias);
        setDia(d);
        setHora(horaPunta(px, ficha, png, d));
      } catch (e) {
        if (!cancelado) setFallo((e as Error).message);
      }
    })();
    return () => { cancelado = true; };
    // `dia` fuera a propósito: cambiar de día no vuelve a bajar el mes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ficha, mes]);

  // ── Pintar el cuadro ──────────────────────────────────────────────────────
  const cuadro = useMemo(() => {
    // La comparación de mes no es redundante con la dependencia: entre que se
    // elige un mes y llega su PNG hay un intervalo en el que `bytes` es del
    // anterior, y ahí es donde se pintaba el mes rancio.
    if (!ficha || !mes?.png || !bytes || bytes.mes !== mes.clave) return null;
    return cuadroDe(bytes.px, ficha, mes.png, dia, hora);
  }, [ficha, mes, dia, hora, bytes]);

  useEffect(() => {
    const m = mapa.current;
    if (!m || !listoMapa || !ficha) return;
    if (!cuadro) {
      if (m.getLayer(def.idCapa)) m.setLayoutProperty(def.idCapa, 'visibility', 'none');
      return;
    }
    const l = pincel.current ?? document.createElement('canvas');
    pincel.current = l;
    l.width = ficha.ancho; l.height = ficha.alto;
    const ctx = l.getContext('2d')!;
    const datos = ctx.createImageData(ficha.ancho, ficha.alto);
    datos.data.set(pintarRejilla(cuadro, ficha));
    ctx.putImageData(datos, 0, 0);

    const coords = esquinas(ficha) as [[number, number], [number, number], [number, number], [number, number]];
    const fuente = m.getSource(def.idCapa) as maplibregl.CanvasSource | undefined;
    if (fuente) {
      (fuente as unknown as { play?: () => void; pause?: () => void }).play?.();
      (fuente as unknown as { play?: () => void; pause?: () => void }).pause?.();
      m.setLayoutProperty(def.idCapa, 'visibility', 'visible');
    } else {
      m.addSource(def.idCapa, { type: 'canvas', canvas: l, coordinates: coords, animate: false });
      m.addLayer({
        id: def.idCapa, type: 'raster', source: def.idCapa,
        paint: {
          'raster-opacity': 0.72,
          // ⚠️ `nearest` Y NO `linear`, y no es un detalle: con celdas de 110 km
          // interpolar dibujaría un degradado suave que NADIE midió. Se ven 36
          // cuadros toscos porque a cuadros es como está medido.
          'raster-resampling': 'nearest',
        },
      }, m.getLayer('dep-borde') ? 'dep-borde' : undefined);
    }
    m.triggerRepaint();
  }, [cuadro, listoMapa, ficha]);

  // ── El clic: cuánto hay AHÍ ───────────────────────────────────────────────
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listoMapa || !ficha) return;
    const alPulsar = (ev: maplibregl.MapMouseEvent) => {
      const c = bytes && mes?.png && bytes.mes === mes.clave
        ? cuadroDe(bytes.px, ficha, mes.png, dia, hora) : null;
      if (!c) { setClic(null); return; }
      setClic({ v: valorEnPunto(c, ficha, ev.lngLat.lng, ev.lngLat.lat), lon: ev.lngLat.lng, lat: ev.lngLat.lat });
    };
    m.on('click', alPulsar);
    return () => { m.off('click', alPulsar); };
  }, [listoMapa, ficha, mes, dia, hora, bytes]);

  // ── DÓNDE CAE LA LÍNEA ────────────────────────────────────────────────────
  //
  // Un punto y su nombre, encima de todo. Existe porque un atlas de 6°x6° con
  // celdas de 111 km no dice por sí solo qué le toca a la línea que se está
  // mirando: sin la marca hay que buscar a ojo el trozo de costa y confiar en el
  // dedo. Va como capa propia y no como `Marker` del DOM para que se recorte con
  // el mapa igual que el resto y no quede flotando fuera del recuadro.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listoMapa) return;
    if (!marca) {
      if (m.getLayer('marca-linea')) { m.removeLayer('marca-linea'); m.removeLayer('marca-rotulo'); m.removeSource('marca'); }
      return;
    }
    const datos = {
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const, properties: { nombre: marca.nombre },
        geometry: { type: 'Point' as const, coordinates: [marca.lon, marca.lat] },
      }],
    };
    const fuente = m.getSource('marca') as maplibregl.GeoJSONSource | undefined;
    if (fuente) { fuente.setData(datos); return; }
    m.addSource('marca', { type: 'geojson', data: datos });
    m.addLayer({
      id: 'marca-linea', type: 'circle', source: 'marca',
      paint: {
        'circle-radius': 6, 'circle-color': '#ffffff',
        'circle-stroke-color': '#2c2a24', 'circle-stroke-width': 2.5,
      },
    });
    m.addLayer({
      id: 'marca-rotulo', type: 'symbol', source: 'marca',
      layout: {
        'text-field': ['get', 'nombre'], 'text-font': ['Noto Sans Medium'],
        'text-size': 12, 'text-offset': [0, 1.2], 'text-anchor': 'top',
      },
      paint: { 'text-color': '#2c2a24', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
    });
  }, [listoMapa, marca]);

  const iso = ficha && mesClave ? isoDe(ficha.anio, mesClave, dia) : null;
  const banda = ficha && iso ? bandaDelDia(ficha, iso) : null;
  const resumen = cuadro && ficha ? resumenDelCuadro(cuadro, ficha.codificacion) : null;
  const resumenDia = ficha && iso ? resumenDelDia(ficha, iso) : null;

  const cambiarMes = useCallback((c: string) => { setMesClave(c); setClic(null); }, []);

  if (fallo) {
    return (
      <section className="panel">
        <h2>{def.titulo}</h2>
        <p className="advertencia">No se pudo abrir el atlas: {fallo}. La aplicación sigue igual.</p>
        {!embebido && (
          <button type="button" className="boton" onClick={() => almacen.cerrarAtlas()}>Volver</button>
        )}
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="sol-cabecera">
        {embebido
          ? <h3>{def.titulo} — {ficha?.anio ?? ''}</h3>
          : <h2>{def.titulo} — {ficha?.anio ?? ''}</h2>}
        {!embebido && (
          <button type="button" className="boton chico" onClick={() => almacen.cerrarAtlas()}>Volver</button>
        )}
      </div>
      <p className="saludo">
        {def.entradilla} <b>hora a hora</b> sobre {ficha?.departamentos.join(', ')}.
        Cada cuadro es una celda de <b>1°</b> (unos 111 km) medida por satélite: se pinta a cuadros
        porque <b>a cuadros es como está medida</b>.
        {marca && <> El punto marcado es <b>{marca.nombre}</b>: dónde cae esta línea dentro del atlas.</>}
      </p>

      <div className="mapa-real mapa-real--lado">
        <div ref={caja} className="mapa-lienzo" />
        <div className="mapa-capas" role="group" aria-label={`Controles del ${def.titulo}`}>
          {ficha && mes && (
            <>
              <p className="mapa-capas-t">Mes</p>
              <select value={mesClave ?? ''} onChange={(e) => cambiarMes(e.target.value)}
                aria-label={`Mes de ${ficha.anio}`}>
                {ofrecidos.map((m) => (
                  <option key={m.clave} value={m.clave}>
                    {MESES[+m.clave]}{m.png ? '' : ' · solo total del día'}
                  </option>
                ))}
              </select>

              <p className="mapa-capas-t">Día</p>
              <div className="sol-dias">
                {Array.from({ length: mes.dias }, (_, i) => i + 1).map((d) => {
                  const b = bandaDelDia(ficha, isoDe(ficha.anio, mes.clave, d));
                  return (
                    <button key={d} type="button"
                      className={'sol-dia' + (d === dia ? ' activo' : '') + ' b-' + b}
                      title={`${d} de ${MESES[+mes.clave]} — ${b === 'horas' ? 'con reparto por horas'
                        : b === 'solo_total' ? 'solo total del día' : 'sin dato'}`}
                      onClick={() => { setDia(d); setClic(null); }}>{d}</button>
                  );
                })}
              </div>

              <p className="mapa-capas-t">Hora</p>
              <input type="range" min={0} max={23} value={hora} disabled={banda !== 'horas'}
                aria-label="Hora del día"
                onChange={(e) => { setHora(+e.target.value); setClic(null); }} />
              <p className="mapa-capas-n">
                <b>{String(hora).padStart(2, '0')}:00</b> · hora de Colombia
              </p>

              {banda === 'horas' && resumen && (
                <>
                  <div className="sol-rampa" style={{
                    background: `linear-gradient(90deg, ${ficha.rampa
                      .map((p) => `rgb(${p.rgb.join(',')}) ${((p.c - ficha.rampa[0].c)
                        / (ficha.rampa[ficha.rampa.length - 1].c - ficha.rampa[0].c) * 100).toFixed(1)}%`)
                      .join(', ')})`,
                  }} />
                  <p className="fine">
                    {nf(ficha.rampa[0].c)} … {nf(ficha.rampa[ficha.rampa.length - 1].c)} {ficha.unidad}
                    {ficha.hipotesisMarcadaEnRampa != null && (
                      <> · la marca de <b>{nf(ficha.hipotesisMarcadaEnRampa)}</b> es{' '}
                        {ficha.etiquetaHipotesis ?? 'la hipótesis adoptada'}</>
                    )}
                    {ficha.medido && (
                      <> · medido en {ficha.anio}: de <b>{nf(ficha.medido.min, 1)}</b> a{' '}
                        <b>{nf(ficha.medido.max, 1)} {ficha.unidad}</b></>
                    )}
                  </p>
                  <p className="mapa-capas-n">
                    {/* ⚠️ NADA de `?? 0`: un hueco impreso como «0» es el byte 0
                        leído como byte 1, que es el invariante que más muerde aquí. */}
                    En esta hora: {resumen.mediana === null
                      ? <b>no se midió en ninguna celda</b>
                      : <>mediana <b>{nf(resumen.mediana, 1)} {ficha.unidad}</b> · de{' '}
                        {nf(resumen.min ?? 0, 1)} a <b>{nf(resumen.max ?? 0, 1)}</b></>}.
                    {resumen.max !== null && ficha.hipotesisMarcadaEnRampa != null
                      && resumen.max > ficha.hipotesisMarcadaEnRampa && (
                      <> ⚠️ Hay celdas <b>por encima</b> de{' '}
                        {nf(ficha.hipotesisMarcadaEnRampa)} {ficha.unidad}, que es{' '}
                        {ficha.etiquetaHipotesis ?? 'la hipótesis adoptada'}.</>
                    )}
                  </p>
                </>
              )}

              {banda === 'solo_total' && (
                <p className="advertencia">
                  <b>De este día no hay reparto por horas.</b> Al construir este archivo
                  ({ficha.construido.slice(0, 10)}) la fuente llegaba al{' '}
                  <b>{ficha.ultimoDiaConHoras}</b> — unos <b>{diasEntre(ficha.ultimoDiaConHoras, ficha.construido.slice(0, 10))} días</b> de retraso. Solo consta el resumen del día, y ese resumen{' '}
                  <b>no se reparte</b> entre horas: sería inventar una curva que nadie midió.
                </p>
              )}
              {banda === 'sin_dato' && (
                <p className="advertencia">
                  <b>De este día no consta nada todavía</b>, ni siquiera el total.
                </p>
              )}

              {resumenDia !== null && (
                <p className="mapa-capas-n">
                  {ficha.resumenDiarioEtiqueta}: <b>{nf(resumenDia, 2)}</b>{' '}
                  <span className="fine">{ficha.resumenDiarioUnidad}</span>.
                  {' '}{ficha.resumenDiarioAviso}
                </p>
              )}

              {clic && (
                <p className="mapa-capas-n">
                  Donde pulsó: {clic.v === null ? <b>no se midió</b> : <><b>{nf(clic.v, 1)} {ficha.unidad}</b></>}
                  {' '}· celda de 1°, así que cerca del borde puede ser la vecina (desvío medido: 1,5 km de 110).
                </p>
              )}

              <p className="fine">{ficha.aviso}</p>
              <p className="fine">
                Límites departamentales: geoBoundaries (ODbL), derivados de OpenStreetMap.{' '}
                {ficha.fuente} · dato hasta <b>{ficha.ultimoDiaConHoras}</b> por horas
                {ficha.ultimoDiaConTotal && <> y <b>{ficha.ultimoDiaConTotal}</b> por día</>}.
                {' '}{ficha.atribucion}
              </p>
            </>
          )}
          {!ficha && <p className="fine">Bajando el atlas…</p>}
        </div>
      </div>
    </section>
  );
}
