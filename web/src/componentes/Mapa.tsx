// ============================================================================
// componentes/Mapa.tsx — el mapa real de la línea, sobre cartografía
// ----------------------------------------------------------------------------
// MapLibre + PMTiles AUTOHOSPEDADO. El recorte es un área metropolitana
// completa a propósito: un mapa base de "Cartagena y alrededores" no delata el
// corredor de ninguna línea. Fuentes y sprites también viajan con el sitio: el
// mapa no le pide nada a ningún servidor de terceros (ADR-001; la política de
// tile.openstreetmap.org prohíbe usarla en producción, docs/31 · L-03/L-10).
//
// REGLA ADR-005 para librerías imperativas: el mapa se crea UNA vez dentro de
// useEffect y React no vuelve a tocarlo. Nada de re-render sobre el lienzo.
//
// Este componente es OPCIONAL por diseño: si su descarga o sus datos fallan,
// la vista cae al esquema SVG. Una capa opcional jamás veta a una esencial
// (docs/31 · L-11).
// ============================================================================
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { FUNCIONES_ANCLA, type Apoyo, type Hipotesis, type Investigacion } from '@lineas/contratos';
import { derivarLevantamiento } from '@lineas/exportar/levantamiento';
import { COLORES_TRAMO_CSS } from '../vistas/tramoColores';
import {
  avisoDeCobertura, esquinas, fechasOrdenadas, gradosEnPunto, pintarRejilla, rotuloDeFecha,
  type FechaTermica, type FichaTermica,
} from '../vistas/termico';
import {
  avisosDelPronostico, contraLaHipotesis, ejeDeLaLinea, eltiempoEnCastellano,
  vientoSobreLaLinea, ZONA,
  type PronosticoEnPantalla,
} from '../vistas/pronostico';
import { ATRIBUCION_PRONOSTICO, celdaDeConsulta, pedirPronostico, SinPronostico } from '../datos/pronostico';

// ⚠️ Cloudflare Pages NO honra las peticiones de rango en estos archivos
// (verificado: pide 1 KB y responde 200 con los 4,5 MB) — y el lector de
// PMTiles vive de los rangos. La salida es MEJOR que el parche: el recorte pesa
// 4,3 MB, así que se descarga ENTERO una vez, el navegador lo cachea inmutable,
// y las teselas se sirven desde memoria. Es además el mismo patrón que
// necesitará el modo campo sin señal (F4): archivo completo en el dispositivo.
maplibregl.setWorkerUrl(urlWorker);

interface MetaTeselas {
  p: PMTiles;
  limites: [number, number, number, number];
  zMin: number;
  zMax: number;
}

let protocolo: Protocol | null = null;
/**
 * Un archivo por capa, cacheado por nombre. Las capas nuevas (satelital,
 * térmico) NO se descargan al abrir el mapa: solo cuando él las pide. El mapa
 * base pesa 4,3 MB y la imagen satelital otro tanto largo — cargarlas siempre
 * castigaría con megabytes a quien nunca las va a mirar, y este sistema tiene
 * que poder abrirse desde el campo.
 */
const archivos = new Map<string, Promise<MetaTeselas>>();

function prepararTeselas(nombre = 'cartagena.pmtiles'): Promise<MetaTeselas> {
  if (!protocolo) {
    protocolo = new Protocol();
    maplibregl.addProtocol('pmtiles', protocolo.tile);
  }
  const yaVa = archivos.get(nombre);
  if (yaVa) return yaVa;

  const archivo = (async () => {
    const esperas = [0, 500, 1500, 3500];
    let ultimo: unknown;
    for (const ms of esperas) {
      if (ms) await new Promise((r) => setTimeout(r, ms));
      try {
        const r = await fetch('/mapas/' + nombre);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const blob = await r.blob();
        const p = new PMTiles(new FileSource(new File([blob], nombre)));
        protocolo!.add(p);          // queda registrado como pmtiles://<nombre>
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
  archivo.catch(() => { archivos.delete(nombre); });
  archivos.set(nombre, archivo);
  return archivo;
}

// ── Las capas de imagen: qué son, de dónde salen y a quién se le debe ───────
//
// Las dos son datos ABIERTOS y viajan con el sitio, igual que el mapa base: no
// hay servidor de terceros en tiempo de ejecución, no hay cuota, no hay clave y
// no hay nada que facture (ADR-001). Lo que hay es un DEBER DE ATRIBUCIÓN, y
// MapLibre lo pinta solo a partir de estos textos mientras la capa esté puesta.
//
// ⚠️ El fichero `.json` hermano trae la fecha de la toma y, en el térmico, la
// escala en grados. Una imagen sin fecha en una herramienta de mantenimiento se
// lee como «así está hoy», y eso es exactamente lo que no puede pasar.
export const CAPAS_RASTER = {
  satelital: {
    archivo: 'cartagena-satelital.pmtiles',
    ficha: '/mapas/cartagena-satelital.json',
    rotulo: 'Satelital (Sentinel-2)',
    atribucion: 'Contains modified Copernicus Sentinel data',
    opacidad: 1,
  },
} as const;

/**
 * La capa térmica ya NO viaja como teselas pintadas: viaja como REJILLA DE
 * VALORES y el color lo pone el navegador (`vistas/termico.ts`). Por eso no está
 * en la lista de arriba — no se sirve por el protocolo de teselas, se lee, se
 * pinta y se coloca por sus cuatro esquinas.
 */
export const FICHA_TERMICA = '/mapas/cartagena-termico.json';
export const ATRIBUCION_TERMICA = 'USGS Landsat Collection 2 Level-2 (dominio público)';
export const OPACIDAD_TERMICA = 0.72;

export type NombreCapa = keyof typeof CAPAS_RASTER;

/** Lo que la ficha de una capa trae. Todo opcional: si falta, no se pinta. */
export interface FichaCapa {
  titulo?: string;
  fecha?: string;
  escena?: string;
  nubes_pct?: number;
  resolucion_m?: number;
  resolucion_nativa_m?: number;
  atribucion?: string;
  rampa?: { c: number; rgb: number[] }[];
  resumen_c?: { min_c: number; max_c: number; p05_c: number; p50_c: number; p95_c: number; cobertura_pct: number };
  es_superficie_no_aire?: boolean;
}

/**
 * Los rótulos del mapa base — nombres de calles, barrios y escudos de vía.
 *
 * Se quedan ENCENDIDOS sobre la imagen satelital, y no es un capricho: sobre una
 * foto aérea sin un solo nombre nadie sabe dónde está mirando, y el gesto que
 * sigue es apagar la capa. Es la vista «híbrida» de toda la vida.
 */
const esRotulo = (id: string) => /label|shield/.test(id) || id.startsWith('places');

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

export default function Mapa({ apoyos, respaldo, eventos, alVerEvento, hipotesis }:
  { apoyos: Apoyo[]; respaldo?: ReactNode;
    /** Expedientes de falla a señalar sobre el mapa. Vacío = línea sin eventos. */
    eventos?: Investigacion[];
    /** Qué hacer al pulsar el marcador (abrir la pestaña Falla). */
    alVerEvento?: (id: string) => void;
    /**
     * La hipótesis de cálculo, SOLO para poder decir qué parte de su viento
     * representa el que se pronostica. No entra en ningún cálculo: el pronóstico
     * no valida una hipótesis (ver `vistas/pronostico.ts`).
     */
    hipotesis?: Hipotesis }) {
  const caja = useRef<HTMLDivElement>(null);
  const mapa = useRef<maplibregl.Map | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'fallo'>('cargando');
  /** Qué mapa de fondo se ve. El térmico NO es fondo: va ENCIMA, y por eso es aparte. */
  const [base, setBase] = useState<'callejero' | 'satelital'>('callejero');
  const [termico, setTermico] = useState(false);
  /** La ficha del térmico: recorte, codificación, rampa y las fechas disponibles. */
  const [fichaTermica, setFichaTermica] = useState<FichaTermica | null>(null);
  /** Qué día se está mirando. Vacío = la más reciente. */
  const [diaTermico, setDiaTermico] = useState<string | null>(null);
  /** La rejilla del día elegido, en bytes. De aquí salen los grados de un clic. */
  const rejilla = useRef<Uint8Array | null>(null);
  const [rejillaLista, setRejillaLista] = useState<string | null>(null);
  const [gradosClic, setGradosClic] = useState<{ c: number | null; lon: number; lat: number } | null>(null);
  const [fichas, setFichas] = useState<Partial<Record<NombreCapa, FichaCapa>>>({});
  const [bajando, setBajando] = useState<NombreCapa | null>(null);
  /** Si se está bajando la rejilla de un día. Es otra cosa que bajar teselas. */
  const [bajandoTermico, setBajandoTermico] = useState(false);
  const [falloCapa, setFalloCapa] = useState<string | null>(null);
  /**
   * El pronóstico NO es una capa de imagen: es un dato del sitio que se pinta
   * encima. Por eso va con su propio estado y no en `CAPAS_RASTER`.
   */
  const [pronostico, setPronostico] = useState(false);
  const [tiempo, setTiempo] = useState<PronosticoEnPantalla | null>(null);
  const [pidiendoTiempo, setPidiendoTiempo] = useState(false);
  const [falloTiempo, setFalloTiempo] = useState<string | null>(null);
  const flecha = useRef<maplibregl.Marker | null>(null);
  /** Si ya se pidió el pronóstico en esta pantalla. Referencia y no estado: ver el efecto. */
  const yaPedido = useRef(false);
  /** Si el componente sigue montado. Lo único que decide si se puede pintar la respuesta. */
  const montado = useRef(true);

  useEffect(() => () => { montado.current = false; }, []);

  /**
   * El punto de referencia de la línea y su EJE.
   *
   * El punto es el centro de las estructuras, y NO sale de aquí tal cual: antes
   * de preguntarle el tiempo a nadie se redondea a una celda (ver
   * `datos/pronostico.ts`). El eje es la dirección media, y de él sale la única
   * cifra de viento que significa algo para un apoyo: cuánta parte empuja de lado.
   */
  const geometria = useMemo(() => {
    const E = apoyos.filter((a) => (a.tipoPunto ?? 'Estructura') !== 'Empalme');
    if (!E.length) return null;
    const lat = E.reduce((s2, a) => s2 + a.coordenada.lat, 0) / E.length;
    const lon = E.reduce((s2, a) => s2 + a.coordenada.lon, 0) / E.length;
    const lev = derivarLevantamiento(apoyos);
    return { lat, lon, eje: ejeDeLaLinea(lev.puntos.map((p) => p.azimut_deg)) };
  }, [apoyos]);

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

  /**
   * Encender una capa de imagen: se descarga su archivo la PRIMERA vez que él la
   * pide, y a partir de ahí queda en memoria. Ninguna de las dos viaja en la
   * carga inicial del mapa.
   *
   * Si la descarga falla, la capa no se enciende y se dice por qué — pero el
   * mapa sigue exactamente como estaba: una capa opcional jamás veta a una
   * esencial (`31 · L-11`).
   */
  useEffect(() => {
    const m = mapa.current;
    if (!m || estado !== 'listo') return;
    let cancelado = false;

    const aplicar = async () => {
      for (const nombre of ['satelital'] as NombreCapa[]) {
        const encendida = base === 'satelital';
        const idCapa = `raster-${nombre}`;
        if (!encendida) {
          if (m.getLayer(idCapa)) m.setLayoutProperty(idCapa, 'visibility', 'none');
          continue;
        }
        if (m.getLayer(idCapa)) {
          m.setLayoutProperty(idCapa, 'visibility', 'visible');
          m.triggerRepaint();
          continue;
        }
        const capa = CAPAS_RASTER[nombre];
        setBajando(nombre);
        setFalloCapa(null);
        try {
          const meta = await prepararTeselas(capa.archivo);
          const ficha = await fetch(capa.ficha).then((r) => (r.ok ? r.json() : null)).catch(() => null);
          if (cancelado || !mapa.current) return;
          if (ficha) setFichas((f) => ({ ...f, [nombre]: ficha as FichaCapa }));
          if (!m.getSource(idCapa)) {
            m.addSource(idCapa, {
              type: 'raster',
              tiles: [`pmtiles://${capa.archivo}/{z}/{x}/{y}`],
              tileSize: 256,
              minzoom: meta.zMin,
              maxzoom: meta.zMax,
              bounds: meta.limites,
              // El deber de atribución de las dos fuentes lo pinta MapLibre solo,
              // y solo mientras la capa esté puesta. La fecha de la toma va
              // dentro: una imagen sin fecha se lee como «así está hoy».
              attribution: `${capa.atribucion}${(ficha as FichaCapa | null)?.fecha
                ? ` · ${(ficha as FichaCapa).fecha!.slice(0, 10)}` : ''}`,
            });
          }
          // Debajo de la línea SIEMPRE: los apoyos y los tramos son el asunto,
          // la imagen es el fondo. Y el térmico por encima del satelital, que
          // para eso es una lectura sobre el terreno.
          // Debajo del térmico si está puesto —el térmico es una LECTURA sobre el
          // terreno— y siempre debajo de la línea, que es el asunto.
          const debajoDe = m.getLayer('capa-termica') ? 'capa-termica'
            : (m.getLayer('tramos') ? 'tramos' : undefined);
          m.addLayer({
            id: idCapa,
            type: 'raster',
            source: idCapa,
            paint: {
              'raster-opacity': capa.opacidad,
              // Explícito: al pasarse del zoom del satélite la imagen se
              // INTERPOLA en vez de romperse en cuadros. No añade detalle —no lo
              // hay— pero deja de parecer un fallo de la imagen.
              'raster-resampling': 'linear',
            },
          }, debajoDe);
          // ⚠️ ESTE REPINTADO NO ES COSMÉTICO: sin él la capa no carga NUNCA.
          // Una fuente raster añadida con el mapa quieto se queda esperando el
          // siguiente fotograma para terminar de darse de alta (`loadTileJson`
          // espera un `requestAnimationFrame`), y si nadie pide un fotograma ese
          // momento no llega: cero peticiones de tesela, cero errores, y una capa
          // que se declara «cargada» sin una sola imagen dentro. Se cazó en
          // producción — verde en pruebas, blanco en pantalla (`32 · L-55`).
          m.triggerRepaint();
        } catch (e) {
          if (cancelado) return;
          console.warn('[mapa] capa', nombre, e);
          setFalloCapa(`No se pudo descargar la capa «${capa.rotulo}». El mapa sigue igual.`);
          if (nombre === 'satelital') setBase('callejero'); else setTermico(false);
        } finally {
          if (!cancelado) setBajando(null);
        }
      }

      // El callejero se apaga bajo la imagen satelital, PERO los rótulos se
      // quedan: una foto aérea sin un solo nombre no dice dónde está uno.
      for (const l of m.getStyle().layers) {
        if ((l as { source?: string }).source !== 'protomaps') continue;
        m.setLayoutProperty(l.id, 'visibility',
          base === 'callejero' || esRotulo(l.id) ? 'visible' : 'none');
      }
      m.triggerRepaint();
    };

    // La espera al estilo tiene un solo dueño: `alEstarElEstilo`. Sin ella este
    // efecto revienta con un `TypeError` invisible y las capas no se encienden.
    const dejarDeEsperar = alEstarElEstilo(m, () => { if (!cancelado) void aplicar(); });
    return () => { cancelado = true; dejarDeEsperar(); };
  }, [base, termico, estado]);

  /**
   * La capa térmica: ficha, rejilla del día y pintura.
   *
   * Tres pasos que no se pueden saltar y por eso van juntos: se lee la ficha
   * (una vez), se baja la rejilla del día elegido, y se pinta con la rampa de la
   * PROPIA ficha. El resultado se coloca por sus cuatro esquinas: la rejilla se
   * construyó en Web Mercator justo para que encaje sin reproyectar nada.
   *
   * ⚠️ Se pinta a un lienzo y se entrega como imagen. La alternativa —teselas de
   * color— es lo que había antes, y era lo que impedía elegir el día, preguntar
   * los grados de un punto y ver la imagen suavizada al acercarse.
   */
  useEffect(() => {
    const m = mapa.current;
    if (!m || estado !== 'listo') return;
    if (!termico) {
      if (m.getLayer('capa-termica')) m.setLayoutProperty('capa-termica', 'visibility', 'none');
      return;
    }
    let cancelado = false;

    const pintar = async () => {
      try {
        let ficha = fichaTermica;
        if (!ficha) {
          const r = await fetch(FICHA_TERMICA);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          ficha = await r.json() as FichaTermica;
          if (cancelado) return;
          setFichaTermica(ficha);
        }
        const dias = fechasOrdenadas(ficha);
        if (!dias.length) throw new Error('la ficha no trae ni una fecha');
        const dia = dias.find((d) => d.fecha === diaTermico) ?? dias[0];
        if (!diaTermico) setDiaTermico(dia.fecha);

        if (rejillaLista !== dia.fecha) {
          setBajandoTermico(true);
          const bytes = await leerRejilla(`/mapas/${dia.archivo}`, ficha);
          if (cancelado) return;
          rejilla.current = bytes;
          const lienzo = document.createElement('canvas');
          lienzo.width = ficha.ancho;
          lienzo.height = ficha.alto;
          const ctx = lienzo.getContext('2d')!;
          const lienzoDatos = ctx.createImageData(ficha.ancho, ficha.alto);
          lienzoDatos.data.set(pintarRejilla(bytes, ficha));
          ctx.putImageData(lienzoDatos, 0, 0);
          const url = lienzo.toDataURL('image/png');
          if (cancelado) return;

          const coords = esquinas(ficha) as [[number, number], [number, number], [number, number], [number, number]];
          const fuente = m.getSource('capa-termica') as maplibregl.ImageSource | undefined;
          if (fuente) {
            fuente.updateImage({ url, coordinates: coords });
          } else {
            // ⚠️ Una fuente de imagen NO admite atribución en MapLibre, así que
            // el deber de la licencia lo cumple la leyenda, que la imprime al pie
            // y solo mientras la capa está puesta.
            m.addSource('capa-termica', { type: 'image', url, coordinates: coords });
            m.addLayer({
              id: 'capa-termica', type: 'raster', source: 'capa-termica',
              // `linear` explícito: al acercarse la medida se INTERPOLA en vez de
              // romperse en cuadros. No inventa detalle —la celda sigue siendo de
              // 30 m— pero deja de parecer un fallo de la imagen.
              paint: { 'raster-opacity': OPACIDAD_TERMICA, 'raster-resampling': 'linear' },
            }, m.getLayer('tramos') ? 'tramos' : undefined);
          }
          setRejillaLista(dia.fecha);
          setBajandoTermico(false);
        }
        m.setLayoutProperty('capa-termica', 'visibility', 'visible');
        m.triggerRepaint();
      } catch (e) {
        if (cancelado) return;
        console.warn('[mapa] térmico', e);
        setFalloCapa('No se pudo cargar la temperatura del suelo. El mapa sigue igual.');
        setTermico(false);
        setBajandoTermico(false);
      }
    };

    const dejarDeEsperar = alEstarElEstilo(m, () => { if (!cancelado) void pintar(); });
    return () => { cancelado = true; dejarDeEsperar(); };
  }, [termico, diaTermico, estado, fichaTermica, rejillaLista]);

  /**
   * El clic que dice cuántos grados hace AHÍ.
   *
   * Solo cuando la capa está encendida, y solo si el clic no cayó sobre un apoyo
   * o un tramo: ésos ya tienen su ficha y quitársela sería cambiar un gesto que
   * él ya usa.
   */
  useEffect(() => {
    const m = mapa.current;
    if (!m || estado !== 'listo' || !termico || !fichaTermica) return;
    const alPulsar = (ev: maplibregl.MapMouseEvent) => {
      const encima = m.queryRenderedFeatures(ev.point, { layers: ['apoyos', 'tramos'] });
      if (encima.length) return;
      const bytes = rejilla.current;
      if (!bytes) return;
      setGradosClic({
        c: gradosEnPunto(bytes, fichaTermica, ev.lngLat.lng, ev.lngLat.lat),
        lon: ev.lngLat.lng, lat: ev.lngLat.lat,
      });
    };
    m.on('click', alPulsar);
    return () => { m.off('click', alPulsar); };
  }, [termico, fichaTermica, estado]);

  /**
   * El pronóstico: se pide cuando ÉL lo enciende, nunca al pintar.
   *
   * Misma regla que `datos/clima.ts`: una consulta a un tercero es un acto
   * deliberado, no un efecto de que alguien mire una pantalla. Y si falla, se
   * dice y el mapa se queda como estaba — una capa opcional jamás veta a una
   * esencial (`31 · L-11`).
   */
  useEffect(() => {
    if (!pronostico || !geometria || yaPedido.current) return;
    // ⚠️ EL FRENO ES UNA REFERENCIA, NO EL ESTADO, y la lista de dependencias es
    // corta a propósito. Con `pidiendoTiempo` dentro de las dependencias, el
    // propio `setPidiendoTiempo(true)` volvía a disparar el efecto, y la LIMPIEZA
    // del pase anterior marcaba la petición como cancelada: la consulta salía,
    // el servicio respondía 200… y la pantalla se quedaba en «consultando…» para
    // siempre. Cazado en producción (`32 · L-57`).
    yaPedido.current = true;
    setPidiendoTiempo(true);
    setFalloTiempo(null);
    void pedirPronostico(geometria.lat, geometria.lon)
      .then((p) => { if (montado.current) setTiempo(p); })
      .catch((e) => {
        // Un fallo NO deja el freno puesto: volver a encender la capa reintenta.
        yaPedido.current = false;
        if (!montado.current) return;
        setFalloTiempo(e instanceof SinPronostico ? e.message
          : 'No se pudo traer el pronóstico. El resto del mapa sigue igual.');
        setPronostico(false);
      })
      .finally(() => { if (montado.current) setPidiendoTiempo(false); });
  }, [pronostico, geometria]);

  /**
   * La flecha del viento sobre el mapa.
   *
   * Apunta HACIA DONDE VA el viento, que es lo que se espera al mirar un mapa; el
   * rótulo dice de dónde viene, que es como lo nombra la meteorología. Las dos
   * cosas a la vez, porque cada gremio lee una.
   */
  useEffect(() => {
    const m = mapa.current;
    flecha.current?.remove();
    flecha.current = null;
    if (!m || estado !== 'listo' || !pronostico || !tiempo || !geometria) return;

    const ahora = tiempo.instantes[0];
    if (!ahora || ahora.vientoDesde_deg === null) return;
    const hacia = (ahora.vientoDesde_deg + 180) % 360;

    const el = document.createElement('div');
    el.className = 'mapa-viento';
    el.title = `Viento del ${Math.round(ahora.vientoDesde_deg)}°`
      + (ahora.viento_kmh !== null ? ` a ${ahora.viento_kmh.toFixed(0)} km/h` : '');
    el.innerHTML = `<span class="mapa-viento-f" style="transform: rotate(${hacia}deg)">↑</span>`
      + `<span class="mapa-viento-v">${ahora.viento_kmh !== null ? `${ahora.viento_kmh.toFixed(0)} km/h` : '—'}</span>`;
    flecha.current = new maplibregl.Marker({ element: el })
      .setLngLat([geometria.lon, geometria.lat]).addTo(m);

    return () => { flecha.current?.remove(); flecha.current = null; };
  }, [pronostico, tiempo, geometria, estado]);

  if (estado === 'fallo' && respaldo) return <>{respaldo}</>;

  return (
    <div className="mapa-real">
      {estado === 'cargando' && <div className="mapa-velo">Descargando cartografía… (una sola vez)</div>}
      <div ref={caja} className="mapa-lienzo" />
      <div className="mapa-capas" role="group" aria-label="Capas del mapa">
        <p className="mapa-capas-t">Fondo</p>
        <label>
          <input type="radio" name="capa" checked={base === 'callejero'}
            onChange={() => setBase('callejero')} /> Callejero (OSM)
        </label>
        <label>
          <input type="radio" name="capa" checked={base === 'satelital'}
            onChange={() => setBase('satelital')} /> Satelital
          {fichas.satelital?.fecha && (
            <span className="mapa-capas-f">{fechaCorta(fichas.satelital.fecha)}</span>
          )}
        </label>
        {base === 'satelital' && fichas.satelital && (
          <p className="mapa-capas-n">
            {fichas.satelital.resolucion_m} m por píxel: al acercarse <b>no hay más detalle</b>,
            solo se amplía. Es la mejor resolución de imagen abierta que permite uso comercial.
          </p>
        )}

        <p className="mapa-capas-t">Encima</p>
        <label>
          <input type="checkbox" checked={termico}
            onChange={(e) => { setTermico(e.target.checked); setGradosClic(null); }} /> Temperatura
          del suelo
        </label>

        <label>
          <input type="checkbox" checked={pronostico}
            onChange={(e) => setPronostico(e.target.checked)} /> Pronóstico del tiempo
          {pidiendoTiempo && <span className="mapa-capas-f">consultando…</span>}
        </label>

        {bajando && (
          <p className="mapa-capas-n" aria-live="polite">
            Descargando {CAPAS_RASTER[bajando].rotulo.toLowerCase()}… (una sola vez)
          </p>
        )}
        {falloCapa && <p className="mapa-capas-n alerta">{falloCapa}</p>}
        {falloTiempo && <p className="mapa-capas-n alerta">{falloTiempo}</p>}
        {termico && fichaTermica && (
          <LeyendaTermica ficha={fichaTermica} dia={diaTermico} alElegirDia={(f) => {
            setDiaTermico(f); setGradosClic(null);
          }} grados={gradosClic} cargando={bajandoTermico} />
        )}
        {pronostico && tiempo && (
          <PanelPronostico p={tiempo} eje={geometria?.eje ?? null}
            celda={geometria ? celdaDeConsulta(geometria.lat, geometria.lon) : null}
            vientoHipotesis_kmh={hipotesis?.vientoMax_kmh} />
        )}
      </div>
    </div>
  );
}

/** La fecha de una toma, corta y en local. Sin hora no se sabe si es mediodía. */
function fechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Bogota',
  });
}

/**
 * La leyenda del térmico: la escala, el DÍA que se mira y lo que se leyó al
 * pulsar el mapa.
 *
 * Sin ella el mapa es una mancha de colores, y una mancha de colores sobre una
 * línea de alta tensión invita a conclusiones que el dato no sostiene. Dice las
 * cuatro cosas que evitan el malentendido: que es del SUELO y no del aire, que
 * es UN instante y no un promedio, cuánto del recorte se midió de verdad, y con
 * qué escala está pintada.
 */
function LeyendaTermica({ ficha, dia, alElegirDia, grados, cargando }: {
  ficha: FichaTermica;
  dia: string | null;
  alElegirDia: (fecha: string) => void;
  grados: { c: number | null; lon: number; lat: number } | null;
  cargando: boolean;
}) {
  const dias = fechasOrdenadas(ficha);
  const actual: FechaTermica | undefined = dias.find((d) => d.fecha === dia) ?? dias[0];
  const rampa = ficha.rampa ?? [];
  if (!rampa.length || !actual) return null;
  const min = rampa[0].c;
  const max = rampa[rampa.length - 1].c;
  const gradiente = rampa
    .map((p) => `rgb(${p.rgb.join(',')}) ${(((p.c - min) / (max - min)) * 100).toFixed(1)}%`)
    .join(', ');
  const r = actual.resumen_c;
  const aviso = avisoDeCobertura(actual);

  return (
    <div className="mapa-leyenda">
      <label className="mapa-tiempo-dia">
        <span>Día medido</span>
        <select value={actual.fecha} onChange={(e) => alElegirDia(e.target.value)}>
          {dias.map((d) => (
            <option key={d.fecha} value={d.fecha}>
              {rotuloDeFecha(d.fecha)} · {d.cobertura_pct.toFixed(0)} % medido
            </option>
          ))}
        </select>
      </label>
      {cargando && <p className="mapa-capas-n">Bajando la medida de ese día…</p>}

      <div className="mapa-leyenda-barra" style={{ background: `linear-gradient(90deg, ${gradiente})` }} />
      <div className="mapa-leyenda-esc">
        <span>{min} °C</span><span>{Math.round((min + max) / 2)} °C</span><span>{max} °C</span>
      </div>

      <p className="mapa-capas-n">
        Ese día: mediana <b>{r.p50_c.toFixed(0)} °C</b> · el 90 % entre {r.p05_c.toFixed(0)} y{' '}
        {r.p95_c.toFixed(0)} °C · máximo {r.max_c.toFixed(0)} °C.
      </p>

      {/* Lo que devuelve el clic. Es la razón de guardar la MEDIDA y no una imagen. */}
      <p className="mapa-capas-n mapa-tiempo-clic">
        {grados === null
          ? 'Pulse el mapa para leer los grados de un punto.'
          : grados.c === null
            ? 'Ahí no se midió: nube, sombra o fuera del recorte.'
            : <><b>{grados.c.toFixed(1)} °C</b> en el punto que pulsó.</>}
      </p>

      {aviso && <p className="mapa-capas-n aviso">{aviso}</p>}
      <p className="mapa-capas-n">
        <b>Es la temperatura de la SUPERFICIE</b> —suelo, techos, asfalto— medida desde el
        satélite en <b>un instante</b>, no la del aire y no un promedio. Al mediodía el asfalto
        puede estar 15-20 °C por encima del aire. <b>No alimenta ningún cálculo</b> de la línea:
        la ecuación de cambio de estado va con temperatura del aire.
      </p>
      <p className="mapa-capas-n">
        Celda de {ficha.resolucion_m} m
        {ficha.resolucion_nativa_m && <> (el sensor mide a {ficha.resolucion_nativa_m} m: al
          acercarse no hay más detalle, solo se amplía)</>}
        {' · '}{ATRIBUCION_TERMICA}
      </p>
    </div>
  );
}

/**
 * El pronóstico, dicho para quien programa una cuadrilla.
 *
 * TRES COSAS QUE NO PUEDEN FALTAR, y ninguna es adorno:
 *
 *   1. **De qué parte del viento hablamos.** Lo que carga un apoyo es la
 *      componente de LADO, no la velocidad. Publicar solo la velocidad obliga a
 *      hacer la descomposición de cabeza.
 *   2. **Que esto no valida la hipótesis.** Poner los dos números juntos invita
 *      a leer «sopla menos de lo calculado, vamos sobrados», y eso es falso: la
 *      hipótesis es un extremo de diseño, no el tiempo de esta semana.
 *   3. **Dónde y cuándo se preguntó.** Un pronóstico sin hora de emisión ni
 *      punto de consulta es un número sin dueño; y la celda —redondeada a
 *      propósito— explica por qué no dice «en el apoyo E12».
 */
function PanelPronostico({ p, eje, celda, vientoHipotesis_kmh }: {
  p: PronosticoEnPantalla;
  eje: number | null;
  celda: { lat: number; lon: number } | null;
  vientoHipotesis_kmh?: number | null;
}) {
  const ahora = p.instantes[0];
  const lado = ahora ? vientoSobreLaLinea(ahora.viento_kmh, ahora.vientoDesde_deg, eje) : null;
  const contra = contraLaHipotesis(lado?.transversal_kmh ?? null, vientoHipotesis_kmh);
  const avisos = avisosDelPronostico(p, eje);
  const n = (x: number | null | undefined, d = 0) =>
    (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(d) : '—');
  const dia = (iso: string) => new Date(`${iso}T12:00:00Z`)
    .toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short', timeZone: ZONA });

  return (
    <div className="mapa-leyenda mapa-tiempo">
      {ahora && (
        <p className="mapa-tiempo-ahora">
          <b>{n(ahora.temperatura_C, 0)} °C</b> · {eltiempoEnCastellano(ahora.simbolo)} ·{' '}
          viento <b>{n(ahora.viento_kmh, 0)} km/h</b>
          {ahora.vientoDesde_deg !== null && <> del {n(ahora.vientoDesde_deg, 0)}°</>}
        </p>
      )}
      {lado && (
        <p className="mapa-capas-n">
          <b>De lado sobre la línea: {n(lado.transversal_kmh, 0)} km/h</b> (el viento entra a{' '}
          {n(lado.angulo_deg, 0)}° del eje, que corre a {n(eje, 0)}°). Es la parte que carga los
          apoyos; el resto sopla a lo largo y no los empuja de lado.
        </p>
      )}
      {contra && <p className="mapa-capas-n">{contra.frase}</p>}

      <table className="mapa-tiempo-dias">
        <thead>
          <tr><th>Día</th><th>°C</th><th>Viento máx.</th><th>Lluvia</th><th>Cielo</th></tr>
        </thead>
        <tbody>
          {p.dias.slice(0, 5).map((d) => (
            <tr key={d.dia}>
              <td>{dia(d.dia)}</td>
              <td>{n(d.tempMin_C, 0)}–{n(d.tempMax_C, 0)}</td>
              <td>{n(d.vientoMax_kmh, 0)} km/h</td>
              <td>{n(d.lluvia_mm, 1)} mm</td>
              <td>{eltiempoEnCastellano(d.simbolo)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {avisos.map((a) => <p key={a} className="mapa-capas-n aviso">{a}</p>)}

      <p className="mapa-capas-n">
        <b>Esto no entra en ningún cálculo de la línea.</b> Sirve para decidir la semana —cuadrilla,
        maniobra, acceso—, no para dictaminar: una flecha se calcula con una hipótesis declarada,
        no con el tiempo que va a hacer.
      </p>
      <p className="mapa-capas-n">
        {ATRIBUCION_PRONOSTICO}
        {p.emitido && <> · corrida del modelo: {new Date(p.emitido).toLocaleString('es-CO',
          { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: ZONA })}</>}
        {celda && <> · se preguntó por la celda {celda.lat.toFixed(1)}, {celda.lon.toFixed(1)} —
          redondeada a propósito: quien sirve el tiempo no tiene por qué saber dónde está la línea</>}
      </p>
    </div>
  );
}

/**
 * Hacer algo CUANDO el estilo del mapa esté armado, no antes.
 *
 * ⚠️ ESTO NO ES UNA COMODIDAD: es la diferencia entre que una capa se encienda y
 * que no. El mapa se declara «listo» ANTES de que MapLibre termine de montar el
 * estilo, y en esa ventana `getStyle()` devuelve `undefined` y `addSource()`
 * lanza «Style is not done loading». Las dos capas nuevas cayeron ahí, una tras
 * otra, así que la espera tiene un solo dueño y las dos lo usan (`32 · L-55`).
 *
 * @returns cómo cancelar la espera, para la limpieza del efecto
 */
function alEstarElEstilo(m: maplibregl.Map, hacer: () => void): () => void {
  if (m.isStyleLoaded()) { hacer(); return () => {}; }
  const alCambiar = () => {
    if (!m.isStyleLoaded()) return;
    m.off('styledata', alCambiar);
    hacer();
  };
  m.on('styledata', alCambiar);
  return () => m.off('styledata', alCambiar);
}

/**
 * La rejilla de un día, leída del PNG a bytes crudos.
 *
 * El archivo es una imagen en gris donde cada píxel ES el valor codificado, no
 * un color: se dibuja en un lienzo y se recoge un solo canal. Se comprueba que
 * el tamaño sea el que declara la ficha — un PNG que no cuadra con la ficha
 * desplazaría todas las lecturas y nadie lo notaría, porque los colores seguirían
 * saliendo bonitos.
 */
async function leerRejilla(url: string, ficha: FichaTermica): Promise<Uint8Array> {
  const img = new Image();
  img.decoding = 'async';
  await new Promise<void>((listo, falla) => {
    img.onload = () => listo();
    img.onerror = () => falla(new Error(`no se pudo leer la rejilla ${url}`));
    img.src = url;
  });
  if (img.naturalWidth !== ficha.ancho || img.naturalHeight !== ficha.alto) {
    throw new Error(`la rejilla mide ${img.naturalWidth}×${img.naturalHeight} y la ficha dice `
      + `${ficha.ancho}×${ficha.alto}: las lecturas saldrían desplazadas`);
  }
  const lienzo = document.createElement('canvas');
  lienzo.width = ficha.ancho;
  lienzo.height = ficha.alto;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const rgba = ctx.getImageData(0, 0, ficha.ancho, ficha.alto).data;
  const bytes = new Uint8Array(ficha.ancho * ficha.alto);
  for (let i = 0; i < bytes.length; i++) bytes[i] = rgba[i * 4];   // gris: R = G = B = valor
  return bytes;
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
