// ============================================================================
// componentes/Mapa.tsx — el mapa real de la línea, sobre cartografía
// ----------------------------------------------------------------------------
// MapLibre + PMTiles AUTOHOSPEDADO. El recorte es un área metropolitana
// completa a propósito: un mapa base de "Cartagena y alrededores" no delata el
// corredor de ninguna línea. Fuentes y sprites también viajan con el sitio: el
// mapa no le pide nada a ningún servidor de terceros (ADR-001; la política de
// tile.openstreetmap.org prohíbe usarla en producción, docs/30 · L-03/L-10).
//
// REGLA ADR-005 para librerías imperativas: el mapa se crea UNA vez dentro de
// useEffect y React no vuelve a tocarlo. Nada de re-render sobre el lienzo.
//
// Este componente es OPCIONAL por diseño: si su descarga o sus datos fallan,
// la vista cae al esquema SVG. Una capa opcional jamás veta a una esencial
// (docs/30 · L-11).
// ============================================================================
import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { FileSource, PMTiles, Protocol } from 'pmtiles';
// ⚠️ EL WORKER VA COMO ASSET PROPIO, no como blob autogenerado. En producción,
// el worker por defecto de MapLibre nació muerto: existía como objeto, recibía
// tareas y jamás respondió una (7 pendientes, 0 respuestas, sin error alguno).
// Resultado: mapa gris eterno. Con el paquete de worker que MapLibre publica,
// servido desde nuestros propios assets, el hilo arranca de verdad.
// `?worker&url`: Vite lo compila como entrada de worker EMPAQUETANDO sus
// dependencias (importa ./maplibre-gl-shared.mjs; con `?url` a secas viajaría
// cojo y moriría igual de mudo).
import urlWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { layers, namedFlavor } from '@protomaps/basemaps';
import { FUNCIONES_ANCLA, type Apoyo, type Investigacion } from '@lineas/contratos';
import { derivarLevantamiento } from '@lineas/exportar/levantamiento';
import { COLORES_TRAMO_CSS } from '../vistas/tramoColores';

// ⚠️ Cloudflare Pages NO honra las peticiones de rango en estos archivos
// (verificado: pide 1 KB y responde 200 con los 4,5 MB) — y el lector de
// PMTiles vive de los rangos. La salida es MEJOR que el parche: el recorte pesa
// 4,3 MB, así que se descarga ENTERO una vez, el navegador lo cachea inmutable,
// y las teselas se sirven desde memoria. Es además el mismo patrón que
// necesitará el modo campo sin señal (F4): archivo completo en el dispositivo.
maplibregl.setWorkerUrl(urlWorker);

let protocolo: Protocol | null = null;
let archivo: Promise<{ p: PMTiles; limites: [number, number, number, number]; zMin: number; zMax: number }> | null = null;

function prepararTeselas(): Promise<{ p: PMTiles; limites: [number, number, number, number]; zMin: number; zMax: number }> {
  if (!protocolo) {
    protocolo = new Protocol();
    maplibregl.addProtocol('pmtiles', protocolo.tile);
  }
  if (archivo) return archivo;

  archivo = (async () => {
    const esperas = [0, 500, 1500, 3500];
    let ultimo: unknown;
    for (const ms of esperas) {
      if (ms) await new Promise((r) => setTimeout(r, ms));
      try {
        const r = await fetch('/mapas/cartagena.pmtiles');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const blob = await r.blob();
        const p = new PMTiles(new FileSource(new File([blob], 'cartagena.pmtiles')));
        protocolo!.add(p);          // queda registrado como pmtiles://cartagena.pmtiles
        // Los metadatos se leen DIRECTO del archivo y se declaran explícitos en
        // la fuente. Así no dependemos de la petición de metadatos vía
        // protocolo, que es justo donde el estilo se quedaba mudo sin error.
        const h = await p.getHeader();
        return {
          p,
          limites: [h.minLon, h.minLat, h.maxLon, h.maxLat] as [number, number, number, number],
          zMin: h.minZoom,
          zMax: h.maxZoom,
        };
      } catch (e) { ultimo = e; }
    }
    throw ultimo instanceof Error ? ultimo : new Error('no se pudo descargar la cartografía');
  })();

  // Un fallo no queda cacheado: reabrir la pestaña debe poder reintentar.
  archivo.catch(() => { archivo = null; });
  return archivo;
}

const COLORES: Record<string, string> = {
  ancla: '#f0a500',
  suspension: '#5b8dd9',
  terminal: '#e05252',
  empalme: '#8b98a5',
};

// La lista de funciones que anclan tiene UN dueño (el contrato). La regex que
// vivía aquí era una tercera definición de "anclaje" esperando a divergir.
function claseDe(a: Apoyo): keyof typeof COLORES {
  if (a.tipoPunto === 'Empalme') return 'empalme';
  if (a.funcionEstructural === 'Terminal') return 'terminal';
  if (FUNCIONES_ANCLA.includes(a.funcionEstructural)) return 'ancla';
  return 'suspension';
}

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * La ficha del popup, con los MISMOS campos que mostraba el módulo original al
 * hacer clic en un punto: GMS, decimal, cota con su advertencia, hora local,
 * vano anterior, azimut y progresiva. El gesto más repetido en campo no puede
 * devolver menos que el CSV.
 */
function fichaPopup(p: ReturnType<typeof derivarLevantamiento>['puntos'][number], nTotal: number, nEstructuras: number): string {
  const filas: string[] = [];
  const esE = p.tipo === 'Estructura';
  filas.push(`<b>${escHtml(p.nombre)}</b> — punto ${p.n}/${nTotal}${esE && p.indiceEstructura != null ? ` · estructura ${p.indiceEstructura} de ${nEstructuras}` : ''}`);
  if (esE && p.funcionEstructural) {
    filas.push(`${escHtml(p.funcionEstructural)}${p.esAncla ? ' — corta tramo de tensión' : ''}${p.deflexion_grados != null ? ` · deflexión ${p.deflexion_grados.toFixed(2)}°` : ''}`);
  }
  if (!esE) filas.push(`<b>${escHtml(p.tipo)} — no es apoyo</b>${p.enVano ? ` · dentro del vano ${escHtml(p.enVano)}` : ''}`);
  filas.push(`Lat ${p.latGMS} · ${p.lat.toFixed(6)}`);
  filas.push(`Lon ${p.lonGMS} · ${p.lon.toFixed(6)}`);
  if (p.cota_m != null) filas.push(`Cota GPS ${p.cota_m.toFixed(2)} m (referencial${p.precision_m != null ? ` ±${p.precision_m} m` : ''})`);
  if (p.local) filas.push(`Hora local ${p.local}`);
  if (p.vanoAnterior_m != null) filas.push(`Vano anterior ${p.vanoAnterior_m.toFixed(2)} m desde ${escHtml(p.vanoDesde ?? '')} · Az ${p.azimut_deg!.toFixed(2)}°`);
  if (p.progresiva_m != null) filas.push(`Progresiva ${p.progresiva_m.toFixed(2)} m`);
  if (p.nombre !== p.nombreCampo) filas.push(`<i>Nombre GPX original: ${escHtml(p.nombreCampo)}</i>`);
  return `<div class="pop-ficha">${filas.join('<br>')}</div>`;
}

export default function Mapa({ apoyos, respaldo, eventos, alVerEvento }:
  { apoyos: Apoyo[]; respaldo?: ReactNode;
    /** Expedientes de falla a señalar sobre el mapa. Vacío = línea sin eventos. */
    eventos?: Investigacion[];
    /** Qué hacer al pulsar el marcador (abrir la pestaña Falla). */
    alVerEvento?: (id: string) => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const mapa = useRef<maplibregl.Map | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'fallo'>('cargando');

  useEffect(() => {
    if (!caja.current || mapa.current || apoyos.length < 2) return;
    let cancelado = false;
    let creado: maplibregl.Map | null = null;

    void (async () => {
      let meta;
      try {
        meta = await prepararTeselas();
      } catch {
        if (!cancelado) setEstado('fallo');
        return;
      }
      if (cancelado || !caja.current) return;
      setEstado('listo');
      creado = crearMapa(caja.current, apoyos, meta, eventos ?? [], alVerEvento);
      mapa.current = creado;

      // Vigilante: si en 15 s VISIBLES el mapa no terminó de cargar, algo se
      // quedó mudo y se cae al esquema. El matiz de "visibles" no es adorno:
      // Chrome CONGELA el reloj de animación en pestañas ocultas, MapLibre
      // pinta con ese reloj, y su evento de carga solo dispara tras el primer
      // fotograma. Un vigilante ingenuo condenaría al SVG a cualquier usuario
      // que abra la página en una pestaña de fondo y cambie a ella después.
      let acumulado = 0;
      let desde = document.visibilityState === 'visible' ? Date.now() : 0;
      const LIMITE = 15000;
      const alCambiar = () => {
        if (document.visibilityState === 'visible') { desde = Date.now(); }
        else if (desde) { acumulado += Date.now() - desde; desde = 0; }
      };
      document.addEventListener('visibilitychange', alCambiar);
      const reloj = setInterval(() => {
        const visible = acumulado + (desde ? Date.now() - desde : 0);
        if (visible < LIMITE) return;
        clearInterval(reloj);
        document.removeEventListener('visibilitychange', alCambiar);
        if (!cancelado && creado && !creado.loaded()) {
          console.warn('[mapa] el mapa no cargó tras 15 s visibles; se pasa al esquema SVG');
          setEstado('fallo');
        }
      }, 1000);
      creado.once('load', () => {
        clearInterval(reloj);
        document.removeEventListener('visibilitychange', alCambiar);
      });
    })();

    return () => { cancelado = true; creado?.remove(); mapa.current = null; };
    // `apoyos` llega estable tras la carga; el mapa no se reconstruye por render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apoyos]);

  if (estado === 'fallo' && respaldo) return <>{respaldo}</>;

  return (
    <div className="mapa-real">
      {estado === 'cargando' && <div className="mapa-velo">Descargando cartografía… (una sola vez)</div>}
      <div ref={caja} className="mapa-lienzo" />
      <div className="mapa-capas" role="note">
        <label><input type="radio" name="capa" checked readOnly /> Callejero (OSM)</label>
        <label className="capa-off" title="La capa satelital exige verificar la licencia del proveedor antes de usarla en un entregable (docs/30 · L-03).">
          <input type="radio" name="capa" disabled /> Satelital — licencia por verificar
        </label>
      </div>
    </div>
  );
}

function crearMapa(
  contenedor: HTMLDivElement,
  apoyos: Apoyo[],
  meta: { limites: [number, number, number, number]; zMin: number; zMax: number },
  eventos: Investigacion[],
  alVerEvento?: (id: string) => void,
): maplibregl.Map {
    const origen = location.origin;
    // Centro inicial en la propia línea: aunque algo más fallara, la cámara
    // nunca arranca viendo el planeta entero.
    const lons0 = apoyos.map((a) => a.coordenada.lon);
    const lats0 = apoyos.map((a) => a.coordenada.lat);
    const centro: [number, number] = [
      (Math.min(...lons0) + Math.max(...lons0)) / 2,
      (Math.min(...lats0) + Math.max(...lats0)) / 2,
    ];
    const m = new maplibregl.Map({
      container: contenedor,
      style: {
        version: 8,
        // Autohospedado TODO: teselas, glifos y sprites viajan con el sitio.
        glyphs: `${origen}/basemaps-assets/fonts/{fontstack}/{range}.pbf`,
        sprite: `${origen}/basemaps-assets/sprites/v4/light`,
        sources: {
          protomaps: {
            type: 'vector',
            // Plantilla de teselas EXPLÍCITA + metadatos del propio archivo:
            // el protocolo solo sirve teselas, nunca metadatos.
            tiles: ['pmtiles://cartagena.pmtiles/{z}/{x}/{y}'],
            minzoom: meta.zMin,
            maxzoom: meta.zMax,
            bounds: meta.limites,
            attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
          },
        },
        layers: layers('protomaps', namedFlavor('light'), { lang: 'es' }),
      },
      attributionControl: { compact: false },
      center: centro,
      zoom: 12.5,
    });

    // Los errores del mapa (tesela, glifo, sprite) NO revientan la página:
    // se registran para poder diagnosticarlos. Y la instancia queda accesible
    // en desarrollo para sondearla desde la consola.
    m.on('error', (e) => console.warn('[mapa]', (e as { error?: Error }).error?.message ?? e));
    (window as unknown as { __mapa?: maplibregl.Map }).__mapa = m;

    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    // ── Datos de la línea ───────────────────────────────────────────────────
    // La MISMA derivación que alimenta los exportes y las demás pestañas
    // (ADR-006): el popup del mapa no puede contradecir al CSV. El trazado pasa
    // por TODOS los puntos en orden; el cálculo usa solo estructuras (40 §10).
    const ordenados = [...apoyos].sort((a, b) => a.orden - b.orden);
    const lev = derivarLevantamiento(ordenados);

    const trazado: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: ordenados.map((a) => [a.coordenada.lon, a.coordenada.lat]),
      },
    };

    // Un rasgo de línea por TRAMO DE TENSIÓN, con su color — el mismo corte
    // que muestran Mecánico, Fichas y el KML.
    const tramos: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: lev.tramos.map((t, i) => ({
        type: 'Feature',
        properties: {
          color: COLORES_TRAMO_CSS[i % COLORES_TRAMO_CSS.length],
          ficha: `<div class="pop-ficha"><b>Tramo ${t.n}</b> · ${escHtml(t.desde)} → ${escHtml(t.hasta)}<br>` +
                 `${t.nVanos} vano(s) reales · ${t.longitud_m.toFixed(1)} m</div>`,
        },
        geometry: {
          type: 'LineString',
          coordinates: t.puntos.map((p) => [p.lon, p.lat]),
        },
      })),
    };

    const puntos: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      // `ordenados` y `lev.puntos` comparten orden (ambos por `orden`).
      features: ordenados.map((a, i) => ({
        type: 'Feature',
        properties: {
          nombre: lev.puntos[i].nombre,
          clase: claseDe(a),
          ficha: fichaPopup(lev.puntos[i], lev.puntos.length, lev.nEstructuras),
          esEmpalme: a.tipoPunto === 'Empalme' ? 1 : 0,
        },
        geometry: { type: 'Point', coordinates: [a.coordenada.lon, a.coordenada.lat] },
      })),
    };

    m.on('load', () => {
      m.addSource('trazado', { type: 'geojson', data: trazado });
      m.addSource('tramos', { type: 'geojson', data: tramos });
      m.addSource('puntos', { type: 'geojson', data: puntos });

      m.addLayer({
        id: 'linea-halo',
        type: 'line',
        source: 'trazado',
        paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.7 },
      });
      // El trazado completo queda debajo como respaldo fino; encima, cada tramo
      // de tensión con su color (clic → nombre, vanos y longitud del tramo).
      m.addLayer({
        id: 'linea',
        type: 'line',
        source: 'trazado',
        paint: { 'line-color': '#d97706', 'line-width': 1 },
      });
      m.addLayer({
        id: 'tramos',
        type: 'line',
        source: 'tramos',
        paint: { 'line-color': ['get', 'color'], 'line-width': 3.5, 'line-opacity': 0.95 },
      });

      m.addLayer({
        id: 'apoyos',
        type: 'circle',
        source: 'puntos',
        paint: {
          'circle-radius': ['case', ['==', ['get', 'esEmpalme'], 1], 4, 6],
          'circle-color': ['match', ['get', 'clase'],
            'ancla', COLORES.ancla,
            'terminal', COLORES.terminal,
            'empalme', COLORES.empalme,
            COLORES.suspension],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      });

      m.addLayer({
        id: 'nombres',
        type: 'symbol',
        source: 'puntos',
        layout: {
          'text-field': ['get', 'nombre'],
          'text-font': ['Noto Sans Medium'],
          'text-size': 11.5,
          'text-offset': [0.9, 0],
          'text-anchor': 'left',
          // Con 26 rótulos, MapLibre oculta solo los que chocan y los va
          // mostrando al acercarse. Es el comportamiento correcto, no un bug.
          'text-optional': true,
        },
        paint: {
          'text-color': '#1a2530',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.6,
        },
      });

      m.on('click', 'apoyos', (ev: maplibregl.MapLayerMouseEvent) => {
        const f = ev.features?.[0];
        if (!f) return;
        new maplibregl.Popup({ offset: 10, closeButton: false, maxWidth: '340px' })
          .setLngLat(ev.lngLat)
          .setHTML((f.properties as Record<string, string>).ficha)
          .addTo(m);
      });
      // El clic en un tramo solo responde si no cayó sobre un punto.
      m.on('click', 'tramos', (ev: maplibregl.MapLayerMouseEvent) => {
        const sobrePunto = m.queryRenderedFeatures(ev.point, { layers: ['apoyos'] }).length > 0;
        const f = ev.features?.[0];
        if (!f || sobrePunto) return;
        new maplibregl.Popup({ offset: 10, closeButton: false })
          .setLngLat(ev.lngLat)
          .setHTML((f.properties as Record<string, string>).ficha)
          .addTo(m);
      });
      for (const capa of ['apoyos', 'tramos']) {
        m.on('mouseenter', capa, () => { m.getCanvas().style.cursor = 'pointer'; });
        m.on('mouseleave', capa, () => { m.getCanvas().style.cursor = ''; });
      }

      // ── EVENTOS DE FALLA ───────────────────────────────────────────────
      // Van como marcador HTML (no como capa) para que puedan latir y estar
      // SIEMPRE por encima de todo: el punto donde se abrió la línea no puede
      // quedar tapado por una etiqueta ni confundirse con un apoyo más.
      for (const ev of eventos) {
        const apoyo = ordenados.find((a) => a.id === ev.apoyoId);
        if (!apoyo) continue;
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'marca-falla';
        el.innerHTML = '<span class="marca-falla-halo"></span><span class="marca-falla-cuerpo">⚠</span>';
        el.setAttribute('aria-label',
          `Evento de falla en ${lev.puntos.find((p) => p.n === ordenados.indexOf(apoyo) + 1)?.nombre ?? 'la línea'}. Abrir el expediente.`);
        el.title = `Punto de falla · ${ev.fechaTexto ?? ''}`;
        el.addEventListener('click', (e) => { e.stopPropagation(); alVerEvento?.(ev.id); });

        new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([apoyo.coordenada.lon, apoyo.coordenada.lat])
          .setPopup(new maplibregl.Popup({ offset: 22, closeButton: false, maxWidth: '320px' })
            .setHTML(
              '<div class="pop-ficha pop-falla">' +
              `<b>⚠ Punto de falla</b><br>${escHtml(lev.puntos.find((p) => p.n === ordenados.indexOf(apoyo) + 1)?.nombre ?? '')}` +
              (ev.fechaTexto ? `<br>${escHtml(ev.fechaTexto)}` : '') +
              `<br>${escHtml(ev.componenteAfectado)}` +
              '<br><i>Pulse el marcador para abrir el expediente.</i></div>'))
          .addTo(m);
      }

      // Encuadre a la línea completa, con aire.
      const lons = ordenados.map((a) => a.coordenada.lon);
      const lats = ordenados.map((a) => a.coordenada.lat);
      m.fitBounds(
        [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
        { padding: 60, duration: 0 },
      );
    });

    return m;
}
