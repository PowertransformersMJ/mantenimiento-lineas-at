// ============================================================================
// componentes/SolCaribe.tsx — el atlas solar del Caribe colombiano
// ----------------------------------------------------------------------------
// POR QUÉ ES UNA PANTALLA APARTE Y NO UNA PESTAÑA. Las 14 pestañas son funciones
// de UNA línea y todas mueren sin apoyos. Esto no depende de ninguna: trae otro
// mapa base (`caribe.pmtiles`, 6°x6° frente a 0,29°x0,38°), otro recuadro y otro
// eje de tiempo. Colgarlo de «Detalle GPS» le habría metido un segundo .pmtiles
// de 5 MiB a la pestaña a la que se llega desde el teléfono, en campo.
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
  bandaDelDia, cuadroDe, energiaDelDia, horaMasSoleada, isoDe, resumenDelCuadro,
  type FichaSol, type MesSol,
} from '../vistas/solCaribe';
import { prepararTeselas } from '../datos/teselas';
import { nf } from '../vistas/formato';
import { almacen } from '../datos/enlace';

const FICHA = '/mapas/sol-caribe.json';
const DEPARTAMENTOS = '/mapas/caribe-departamentos.json';
const BASE = 'caribe.pmtiles';
const ID_SOL = 'capa-sol';

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

export function SolCaribe() {
  const caja = useRef<HTMLDivElement>(null);
  const mapa = useRef<maplibregl.Map | null>(null);
  const pincel = useRef<HTMLCanvasElement | null>(null);
  const bytes = useRef<Uint8Array | null>(null);
  const montado = useRef(true);

  const [ficha, setFicha] = useState<FichaSol | null>(null);
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
        const r = await fetch(FICHA);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const f = await r.json() as FichaSol;
        if (!montado.current) return;
        setFicha(f);
        // Se abre en el ÚLTIMO mes con horas, no en enero: lo que interesa de un
        // atlas del año en curso es lo más reciente que existe.
        setMesClave(f.meses[f.meses.length - 1]?.clave ?? null);
      } catch (e) {
        if (montado.current) setFallo((e as Error).message);
      }
    })();
  }, []);

  const mes: MesSol | null = useMemo(
    () => ficha?.meses.find((m) => m.clave === mesClave) ?? null, [ficha, mesClave]);

  // ── El mapa, una sola vez ─────────────────────────────────────────────────
  useEffect(() => {
    if (!caja.current || mapa.current || !ficha) return;
    let cancelado = false;
    void (async () => {
      try {
        const meta = await prepararTeselas(BASE);
        if (cancelado || !caja.current) return;
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
            layers: layers('protomaps', namedFlavor('light'), { lang: 'es' }),
          },
          attributionControl: { compact: false },
          bounds: ficha.bbox as [number, number, number, number],
          fitBoundsOptions: { padding: 12 },
          // El techo lo pone EL DATO, no el mapa: con celdas de 111 km, pasar de
          // aquí es enseñar un detalle que la medida no tiene.
          maxZoom: 9.5,
        });
        mapa.current = m;
        m.on('error', (e) => console.warn('[sol]', (e as { error?: Error }).error?.message ?? e));
        m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
        m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

        m.once('style.load', () => {
          if (cancelado) return;
          void (async () => {
            // Los siete departamentos: el mapa base trae las LÍNEAS divisorias
            // pero no los NOMBRES, así que sin esto habría fronteras mudas.
            try {
              const dep = await (await fetch(DEPARTAMENTOS)).json();
              if (cancelado || !m.getSource('departamentos')) {
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
    let cancelado = false;
    void (async () => {
      try {
        const { px } = await leerPng(`/mapas/${mes.archivo}`);
        if (cancelado) return;
        bytes.current = px;
        // Se entra por la hora con MÁS SOL: abrir a medianoche pinta un mapa
        // negro y se lee como una avería, no como la noche.
        const d = Math.min(dia, mes.dias);
        setDia(d);
        setHora(horaMasSoleada(px, ficha, mes, d));
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
    if (!ficha || !mes || !bytes.current) return null;
    return cuadroDe(bytes.current, ficha, mes, dia, hora);
  }, [ficha, mes, dia, hora, listoMapa]);

  useEffect(() => {
    const m = mapa.current;
    if (!m || !listoMapa || !ficha) return;
    if (!cuadro) {
      if (m.getLayer(ID_SOL)) m.setLayoutProperty(ID_SOL, 'visibility', 'none');
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
    const fuente = m.getSource(ID_SOL) as maplibregl.CanvasSource | undefined;
    if (fuente) {
      (fuente as unknown as { play?: () => void; pause?: () => void }).play?.();
      (fuente as unknown as { play?: () => void; pause?: () => void }).pause?.();
      m.setLayoutProperty(ID_SOL, 'visibility', 'visible');
    } else {
      m.addSource(ID_SOL, { type: 'canvas', canvas: l, coordinates: coords, animate: false });
      m.addLayer({
        id: ID_SOL, type: 'raster', source: ID_SOL,
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
      const c = bytes.current && mes ? cuadroDe(bytes.current, ficha, mes, dia, hora) : null;
      if (!c) { setClic(null); return; }
      setClic({ v: valorEnPunto(c, ficha, ev.lngLat.lng, ev.lngLat.lat), lon: ev.lngLat.lng, lat: ev.lngLat.lat });
    };
    m.on('click', alPulsar);
    return () => { m.off('click', alPulsar); };
  }, [listoMapa, ficha, mes, dia, hora]);

  const iso = ficha && mesClave ? isoDe(ficha.anio, mesClave, dia) : null;
  const banda = ficha && iso ? bandaDelDia(ficha, iso) : null;
  const resumen = cuadro && ficha ? resumenDelCuadro(cuadro, ficha.codificacion) : null;
  const energia = ficha && iso ? energiaDelDia(ficha, iso) : null;

  const cambiarMes = useCallback((c: string) => { setMesClave(c); setClic(null); }, []);

  if (fallo) {
    return (
      <section className="panel">
        <h2>Atlas solar del Caribe</h2>
        <p className="advertencia">No se pudo abrir el atlas: {fallo}. La aplicación sigue igual.</p>
        <button type="button" className="boton" onClick={() => almacen.cerrarAtlasSolar()}>Volver</button>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="sol-cabecera">
        <h2>Atlas solar del Caribe — {ficha?.anio ?? ''}</h2>
        <button type="button" className="boton chico" onClick={() => almacen.cerrarAtlasSolar()}>Volver</button>
      </div>
      <p className="saludo">
        Irradiancia solar <b>hora a hora</b> sobre {ficha?.departamentos.join(', ')}.
        Cada cuadro es una celda de <b>1°</b> (unos 111 km) medida por satélite: se pinta a cuadros
        porque <b>a cuadros es como está medida</b>.
      </p>

      <div className="mapa-real mapa-real--lado">
        <div ref={caja} className="mapa-lienzo" />
        <div className="mapa-capas" role="group" aria-label="Controles del atlas solar">
          {ficha && mes && (
            <>
              <p className="mapa-capas-t">Mes</p>
              <select value={mesClave ?? ''} onChange={(e) => cambiarMes(e.target.value)}
                aria-label="Mes de 2026">
                {ficha.meses.map((m) => (
                  <option key={m.clave} value={m.clave}>{MESES[+m.clave]}</option>
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
                    {nf(ficha.rampa[0].c)} W/m² … {nf(ficha.rampa[ficha.rampa.length - 1].c)} W/m²
                    {ficha.hipotesisMarcadaEnRampa != null && (
                      <> · la marca de <b>{nf(ficha.hipotesisMarcadaEnRampa)}</b> es la hipótesis
                        adoptada de la ampacidad</>
                    )}
                  </p>
                  <p className="mapa-capas-n">
                    En esta hora: mediana <b>{nf(resumen.mediana ?? 0)} W/m²</b> · de {nf(resumen.min ?? 0)} a{' '}
                    <b>{nf(resumen.max ?? 0)}</b>.
                    {resumen.max !== null && ficha.hipotesisMarcadaEnRampa != null
                      && resumen.max > ficha.hipotesisMarcadaEnRampa && (
                      <> ⚠️ Hay celdas <b>por encima</b> de los {nf(ficha.hipotesisMarcadaEnRampa)} W/m² adoptados.</>
                    )}
                  </p>
                </>
              )}

              {banda === 'solo_total' && (
                <p className="advertencia">
                  <b>De este día no hay reparto por horas.</b> La fuente publica el horario con unos
                  83 días de retraso; al construir este archivo llegaba al{' '}
                  <b>{ficha.ultimoDiaConHoras}</b>. Solo consta el total del día, y ese total{' '}
                  <b>no se reparte</b> entre horas: sería inventar una curva que nadie midió.
                </p>
              )}
              {banda === 'sin_dato' && (
                <p className="advertencia">
                  <b>De este día no consta nada todavía</b>, ni siquiera el total.
                </p>
              )}

              {energia !== null && (
                <p className="mapa-capas-n">
                  Energía del día (mediana de la región): <b>{nf(energia, 2)} kWh/m²</b>.
                  {' '}Es <b>otra magnitud</b> que la del mapa y no se convierte en ella con una regla de tres.
                </p>
              )}

              {clic && (
                <p className="mapa-capas-n">
                  Donde pulsó: {clic.v === null ? <b>no se midió</b> : <><b>{nf(clic.v)} W/m²</b></>}
                  {' '}· celda de 1°, así que cerca del borde puede ser la vecina (desvío medido: 1,5 km de 110).
                </p>
              )}

              <p className="fine">{ficha.aviso}</p>
              <p className="fine">
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
