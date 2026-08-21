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
import { esquinas, pintarRejilla, valorEnPunto } from '../vistas/rejilla';
import {
  avisoDeMuestreo, capaElegida, capasOrdenadas, oscilacionAnual, NOTA_AMPACIDAD,
  type CapaRadiacion, type FichaRadiacion,
} from '../vistas/radiacion';
import {
  avisoDeEscala, avisoDeMuestreo as avisoDeMuestreoTemp, capaElegida as capaElegidaTemp,
  capasOrdenadas as capasOrdenadasTemp, contraLaEds, oscilacionEstacional, NOTA_HIPOTESIS,
  type FichaTemperatura,
} from '../vistas/temperatura';
import {
  avisosDelPronostico, contraLaHipotesis, ejeDeLaLinea, eltiempoEnCastellano,
  vientoSobreLaLinea, ZONA,
  type PronosticoEnPantalla,
} from '../vistas/pronostico';
import { ATRIBUCION_PRONOSTICO, celdaDeConsulta, pedirPronostico, SinPronostico } from '../datos/pronostico';
import { anotar, registrarMapa, retirarMapa } from './sondaMapa';

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
 * LAS CAPAS DE MEDIDA no viajan como teselas pintadas: viajan como REJILLA DE
 * VALORES y el color lo pone el navegador (`vistas/rejilla.ts`). Por eso no están
 * en la lista de arriba — no se sirven por el protocolo de teselas: se leen, se
 * pintan y se colocan por sus cuatro esquinas.
 *
 * ⚠️ SOLO UNA ENCENDIDA A LA VEZ, y no es una limitación técnica: son dos rampas
 * de color sobre el mismo territorio. Superpuestas, el color de arriba tapa al de
 * abajo y lo que se lee no es ninguna de las dos — un degradado que no mide nada.
 * El clic tampoco podría decir a cuál de las dos contesta.
 */
export const MEDIDAS = {
  radiacion: {
    rotulo: 'Radiación solar',
    ficha: '/mapas/cartagena-radiacion.json',
    opacidad: 0.68,
    bajando: 'Bajando el recurso de ese mes…',
    fallo: 'No se pudo cargar el recurso solar. El mapa sigue igual.',
  },
  temperatura: {
    rotulo: 'Temperatura ambiente',
    ficha: '/mapas/cartagena-temperatura.json',
    // Algo más translúcida que el sol: la temperatura se mira SOBRE el terreno
    // —dónde está el mar, dónde la ciudad— y a 0,68 el fondo desaparecía.
    opacidad: 0.6,
    bajando: 'Bajando la temperatura de ese mes…',
    fallo: 'No se pudo cargar la temperatura ambiente. El mapa sigue igual.',
  },
} as const;

export type NombreMedida = keyof typeof MEDIDAS;

export const FICHA_RADIACION = MEDIDAS.radiacion.ficha;
export const ATRIBUCION_RADIACION =
  'Global Solar Atlas 2.0 — Solargis para el Banco Mundial / ESMAP (CC BY 4.0)';
export const OPACIDAD_RADIACION = MEDIDAS.radiacion.opacidad;

/** El id de la capa en MapLibre. Uno solo: solo hay una medida encendida. */
const ID_MEDIDA = 'capa-medida';

export type NombreCapa = keyof typeof CAPAS_RASTER;

/**
 * El primer rótulo del mapa base, que es el techo de las capas de imagen.
 *
 * Se busca en el estilo VIVO y no en una lista escrita a mano: el mapa base son
 * 71 capas de `@protomaps/basemaps` y sus nombres cambian con la versión. Si un
 * día no hubiera ninguno, devuelve `undefined` y quien llama decide — nunca se
 * inventa un ancla, que dejaría la capa en un sitio arbitrario.
 */
function primerRotulo(m: maplibregl.Map): string | undefined {
  for (const l of m.getStyle().layers) {
    if ((l as { source?: string }).source === 'protomaps' && esRotulo(l.id)) return l.id;
  }
  return undefined;
}

/** La ficha de la medida que esté encendida. Las dos comparten la mecánica. */
export type FichaMedida = FichaRadiacion | FichaTemperatura;

/** Lo que la ficha de una capa trae. Todo opcional: si falta, no se pinta. */
export interface FichaCapa {
  /** A cuántos metros por píxel se PUBLICAN las teselas (≠ lo que mide el dato). */
  metros_por_pixel_publicados?: number;
  /** Qué se hizo al remuestrear, en palabras. Lo escribe el generador. */
  remuestreo?: string;
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

export default function Mapa({ apoyos, respaldo, eventos, alVerEvento, hipotesis, panelALado, pantalla = 'sin-declarar' }:
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
    hipotesis?: Hipotesis;
    /**
     * El panel de capas AL LADO del mapa en vez de flotando encima.
     *
     * Encima está bien cuando el mapa es una tarjeta del resumen: ocupa poco y
     * se aparta con la vista. Deja de estarlo cuando el mapa ES la pantalla —el
     * panel crece con la leyenda de la capa encendida y acaba tapando justo el
     * trazado que se quiere recorrer—. La disposición la decide quien monta el
     * mapa, no el mapa: es la misma pieza en los dos sitios.
     */
    panelALado?: boolean;
    /**
     * EN QUÉ PANTALLA VIVE ESTA INSTANCIA. No pinta nada: es lo único que le
     * permite a la sonda decir CUÁL de los dos mapas está midiendo.
     *
     * ⚠️ Este componente se monta DOS veces —Resumen y Detalle GPS— y la sonda
     * anterior era una sola variable global que se pisaban entre sí: podía
     * estar midiendo una instancia ya desmontada y contestar «no cargó» de un
     * mapa que en realidad estaba muerto (`10 §ABIERTO`). Se declara aquí, en
     * el sitio de montaje, en vez de adivinarse de otra prop: adivinarlo es
     * exactamente el error que se está corrigiendo.
     */
    pantalla?: string }) {
  const caja = useRef<HTMLDivElement>(null);
  const mapa = useRef<maplibregl.Map | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'fallo'>('cargando');
  /** Qué mapa de fondo se ve. El térmico NO es fondo: va ENCIMA, y por eso es aparte. */
  const [base, setBase] = useState<'callejero' | 'satelital'>('callejero');
  /** Qué capa de MEDIDA está encendida. Una o ninguna: dos rampas se tapan. */
  const [medida, setMedida] = useState<NombreMedida | null>(null);
  /** La ficha de la medida encendida: recorte, codificación, rampa y sus meses. */
  const [fichaMedida, setFichaMedida] = useState<FichaMedida | null>(null);
  /** Qué mes se está mirando. Vacío = la media del año. */
  const [mesRadiacion, setMesRadiacion] = useState<string | null>(null);
  /** La rejilla del día elegido, en bytes. De aquí salen los grados de un clic. */
  const rejilla = useRef<Uint8Array | null>(null);
  /** El lienzo donde se pinta la rejilla. Es el MISMO siempre: la fuente lo lee en vivo. */
  const pincel = useRef<HTMLCanvasElement | null>(null);
  const [rejillaLista, setRejillaLista] = useState<string | null>(null);
  const [valorClic, setValorClic] = useState<{ c: number | null; lon: number; lat: number } | null>(null);
  const [fichas, setFichas] = useState<Partial<Record<NombreCapa, FichaCapa>>>({});
  const [bajando, setBajando] = useState<NombreCapa | null>(null);
  /** Si se está bajando la rejilla de un mes. Es otra cosa que bajar teselas. */
  const [bajandoRadiacion, setBajandoRadiacion] = useState(false);
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
  /**
   * El número que ESTA instancia tiene en la sonda (`sondaMapa.ts`). Referencia
   * y no estado: la escribe el efecto que crea el mapa y la leen los efectos de
   * las capas para anotar en el MISMO diario; volver a pintar por esto no tendría
   * ningún sentido. `0` = todavía sin alta.
   */
  const sonda = useRef(0);
  /**
   * EL MAPA VIVO, EN EL ESTADO Y NO EN UNA REFERENCIA.
   *
   * ⚠️ Las dos cosas no son intercambiables, y confundirlas dejó el interruptor
   * de las capas muerto: una referencia NO dispara efectos. Cuando el mapa se
   * rehace —basta que `apoyos` cambie de identidad— hay un instante en que la
   * referencia es null y otro en que apunta a un mapa ya retirado. Un efecto de
   * capa que caiga en cualquiera de los dos sale por su guarda y **no vuelve**,
   * porque ninguna de sus dependencias cambió: se pulsa el interruptor y no pasa
   * nada, ni capa ni error ni una petición de red.
   *
   * Con el mapa en el ESTADO, cambiar de mapa ES un cambio de dependencia y
   * todas las capas se vuelven a aplicar solas sobre el mapa nuevo (`32 · L-58`).
   * La referencia se queda para lo que sirve una referencia: limpiar al salir.
   */
  const [mapaVivo, setMapaVivo] = useState<maplibregl.Map | null>(null);
  /**
   * Si el mapa ya disparó su `load`. Es la ÚNICA señal fiable de que se le pueden
   * añadir fuentes y capas.
   *
   * ⚠️ NO SIRVE `isStyleLoaded()`, y creerlo costó tres despliegues. Esa función
   * no contesta «¿está el estilo listo?» sino «¿está TODO cargado?»: devuelve
   * `false` mientras a cualquier fuente le falte una tesela. Con un archivo de
   * teselas grande —o con una capa de imagen que se apagó y dejó teselas a
   * medias— puede quedarse en `false` para siempre, y un efecto que espere a que
   * se ponga en `true` no se ejecuta JAMÁS: se pulsa el interruptor y no pasa
   * nada, sin capa, sin error y sin una sola petición de red.
   */
  const [mapaCargado, setMapaCargado] = useState(false);

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
      // ⚠️ ENTRE LA GUARDA DE ENTRADA Y ESTA LÍNEA HAY UN `await`, y ahí cabe otro
      // efecto: la guarda mira `mapa.current`, que todavía es null mientras se
      // descargan las teselas. Si el de antes dejó un mapa a medio crear, aquí se
      // retira ANTES de poner el nuevo — dos instancias sobre el mismo contenedor
      // dejan una pintando y otra recibiendo las capas, que es la peor avería
      // posible: el interruptor se marca, no da error y no pasa nada.
      if (mapa.current) mapa.current.remove();
      creado = crearMapa(caja.current, apoyos, meta, eventos ?? [], alVerEvento);
      mapa.current = creado;
      // EL MAPA, ALCANZABLE DESDE LA CONSOLA — y el MISMO objeto que reciben las
      // capas, no otro. Se da de alta en la sonda CON SU PANTALLA (`sondaMapa.ts`),
      // que es una entrada por instancia y se da de baja al desmontar. La variable
      // global de antes se pisaba entre las dos pantallas y podía contestar por un
      // mapa ya retirado: media sesión de diagnóstico falso salió de ahí.
      sonda.current = registrarMapa(pantalla, creado, caja.current);
      // La señal para las capas: hay un mapa nuevo, vuelvan a aplicarse.
      setMapaVivo(creado);

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
          anotar(sonda.current, 'el vigilante de 15 s visibles se disparó: se cae al esquema SVG');
          setEstado('fallo');
        }
      }, 1000);
      // ⚠️ SE ESPERA A `style.load`, NO SOLO A `load`, Y ESTA ES LA TERCERA VEZ QUE
      // ESTE PROYECTO TROPIEZA CON LA MISMA PIEDRA (`32 · L-55`, `L-58`).
      //
      // `load` no significa «el estilo está listo»: significa «el estilo Y las
      // primeras teselas están listos». Si a una sola fuente le falta una tesela,
      // `load` NO dispara — y no dispara NUNCA, sin un error, sin un aviso. Eso es
      // lo que pasaba: medido en producción, el mapa estaba en pantalla pintando
      // el callejero con `loaded() === false` y sin estilo accesible, así que
      // `setMapaCargado(true)` no llegaba, el efecto de las capas salía por la
      // puerta de atrás en su primera línea y la foto satelital no se añadía
      // jamás. El interruptor se marcaba y no pasaba nada.
      //
      // `style.load` dispara en cuanto el estilo está montado, que es lo único
      // que `addSource` necesita de verdad. Se dejan los dos: el primero que
      // llegue enciende la señal, y `once` garantiza que solo cuenta una vez.
      const listo = (ev?: unknown) => {
        clearInterval(reloj);
        document.removeEventListener('visibilitychange', alCambiar);
        anotar(sonda.current, `estilo montado por «${(ev as { type?: string })?.type ?? '?'}» — a partir de aquí addSource es seguro`);
        // La señal que esperan las capas: a partir de aquí `addSource` es seguro.
        if (!cancelado) setMapaCargado(true);
      };
      creado.once('style.load', listo);
      creado.once('load', listo);
    })();

    return () => {
      // Se retira LO QUE HAYA: `creado` sigue null si el efecto se limpia mientras
      // aún se descargaban las teselas, y entonces el mapa a quitar es el de la
      // referencia.
      cancelado = true;
      // La BAJA en la sonda va ANTES del `remove()`: después, el mapa ya no
      // contesta ni a `getStyle()`, y una baja que revienta deja la entrada viva
      // — que es justo la mentira que esta sonda existe para no contar.
      if (sonda.current) { retirarMapa(sonda.current); sonda.current = 0; }
      (creado ?? mapa.current)?.remove();
      mapa.current = null;
      setMapaVivo(null); setMapaCargado(false);
    };
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
    const m = mapaVivo;
    if (!m || !mapaCargado) return;
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
          anotar(sonda.current, `«${nombre}» ya estaba puesta: se vuelve a hacer visible`);
          continue;
        }
        anotar(sonda.current, `«${nombre}» ENCENDIDA: se va a bajar el archivo`);
        const capa = CAPAS_RASTER[nombre];
        setBajando(nombre);
        setFalloCapa(null);
        try {
          const meta = await prepararTeselas(capa.archivo);
          anotar(sonda.current, `archivo «${capa.archivo}» listo · z${meta.zMin}-${meta.zMax} · limites ${meta.limites.map((v) => v.toFixed(3)).join(',')}`);
          const ficha = await fetch(capa.ficha).then((r) => (r.ok ? r.json() : null)).catch(() => null);
          if (cancelado) return;
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
          // ⚠️ EL ANCLA VA DEBAJO DEL PRIMER RÓTULO, no debajo de `tramos`, y esto
          // es un arreglo: `tramos` se añade DESPUÉS del estilo base, así que
          // anclar ahí dejaba la foto por encima de las doce capas de rótulo del
          // callejero. El componente prometía vista híbrida —foto abajo, nombres
          // arriba— y hacía lo contrario: una foto aérea sin un solo nombre, en
          // la que no se sabe dónde está uno. Se calcula del estilo REAL, no de
          // una lista escrita a mano, porque el mapa base puede cambiar de capas.
          // Orden que queda, de abajo arriba: callejero · foto · medida · rótulos
          // · trazado y apoyos. El térmico encima de la foto porque es una
          // LECTURA sobre el terreno; el trazado encima de todo porque es el asunto.
          const debajoDe = m.getLayer(ID_MEDIDA) ? ID_MEDIDA
            : (primerRotulo(m) ?? (m.getLayer('tramos') ? 'tramos' : undefined));
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
          anotar(sonda.current, `capa «${idCapa}» puesta debajo de «${debajoDe ?? '(nada: va arriba del todo)'}» · orden ${m.getStyle().layers.findIndex((l) => l.id === idCapa)} de ${m.getStyle().layers.length}`);
        } catch (e) {
          if (cancelado) return;
          console.warn('[mapa] capa', nombre, e);
          anotar(sonda.current, `FALLO al poner «${nombre}»: ${(e as Error)?.message ?? String(e)}`);
          setFalloCapa(`No se pudo descargar la capa «${capa.rotulo}». El mapa sigue igual.`);
          if (nombre === 'satelital') setBase('callejero'); else setMedida(null);
        } finally {
          if (!cancelado) setBajando(null);
        }
      }

      // ⚠️ EL CALLEJERO SE QUEDA ENCENDIDO DEBAJO DE LA FOTO, y esto también es
      // un arreglo. Antes se apagaba entero salvo rótulos, con tres efectos que
      // se leían como averías: (1) fuera del recorte de la foto —31,8 × 42 km—
      // no quedaba NADA, solo nombres flotando en gris; (2) ese gris es la capa
      // `background` de protomaps, que el bucle no apagaba por no tener fuente,
      // así que un mapa roto y uno sano se veían idénticos; y (3) el borde de la
      // foto mostraba su halo contra el vacío.
      //
      // La foto es OPACA, así que donde hay imagen no se ve el callejero de
      // debajo; donde se acaba, el mapa degrada a callejero en vez de a vacío.
      // Se pinta una fuente más siempre: es el precio, y es el correcto — un
      // mapa que se queda en blanco al salir del recorte no es más barato, es
      // peor.
      for (const l of m.getStyle().layers) {
        if ((l as { source?: string }).source !== 'protomaps') continue;
        m.setLayoutProperty(l.id, 'visibility', 'visible');
      }
      m.triggerRepaint();
    };

    void aplicar();
    return () => { cancelado = true; };
  }, [base, medida, mapaVivo, mapaCargado]);

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
    const m = mapaVivo;
    if (!m || !mapaCargado) return;
    if (!medida) {
      if (m.getLayer(ID_MEDIDA)) m.setLayoutProperty(ID_MEDIDA, 'visibility', 'none');
      return;
    }
    const cfg = MEDIDAS[medida];
    let cancelado = false;

    const pintar = async () => {
      try {
        // La ficha es de UNA medida: si se cambió de capa, la que hay en memoria
        // es la de la otra y hay que volver a pedirla. Reusarla pintaría la rampa
        // del sol sobre los grados del aire, sin un solo error.
        let ficha = fichaMedida?.capa === medida ? fichaMedida : null;
        if (!ficha) {
          const r = await fetch(cfg.ficha);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          ficha = await r.json() as FichaMedida;
          if (cancelado) return;
          setFichaMedida(ficha);
        }
        const capa = capaElegida(ficha as FichaRadiacion, mesRadiacion);
        if (!capa) throw new Error('la ficha no trae ni una capa');
        if (!mesRadiacion) setMesRadiacion(capa.clave);

        // ⚠️ La marca lleva QUÉ MEDIDA además del mes. Con solo el mes, pasar de
        // radiación a temperatura en el mismo mes se saltaría el repintado —la
        // clave no habría cambiado— y se quedaría en pantalla la capa anterior
        // con la leyenda de la nueva.
        const marca = `${medida}:${capa.clave}`;
        if (rejillaLista !== marca) {
          setBajandoRadiacion(true);
          const bytes = await leerRejilla(`/mapas/${capa.archivo}`, ficha);
          if (cancelado) return;
          rejilla.current = bytes;
          // ⚠️ EL LIENZO SE ENTREGA TAL CUAL, no como PNG. Codificar un millón y
          // medio de píxeles a PNG y pasarlo en base64 tardaba SEGUNDOS en los que
          // no pasaba nada visible — y un botón que tarda cinco segundos sin decir
          // nada se lee como un botón roto. MapLibre lee el lienzo directamente.
          const lienzo = pincel.current ?? document.createElement('canvas');
          pincel.current = lienzo;
          lienzo.width = ficha.ancho;
          lienzo.height = ficha.alto;
          const ctx = lienzo.getContext('2d')!;
          const lienzoDatos = ctx.createImageData(ficha.ancho, ficha.alto);
          lienzoDatos.data.set(pintarRejilla(bytes, ficha));
          ctx.putImageData(lienzoDatos, 0, 0);
          if (cancelado) return;

          const coords = esquinas(ficha) as [[number, number], [number, number], [number, number], [number, number]];
          const fuente = m.getSource(ID_MEDIDA) as maplibregl.CanvasSource | undefined;
          if (fuente) {
            // El lienzo es el MISMO objeto: basta con avisar de que cambió.
            fuente.setCoordinates(coords);
            (fuente as unknown as { play?: () => void; pause?: () => void }).play?.();
            (fuente as unknown as { play?: () => void; pause?: () => void }).pause?.();
            m.setPaintProperty(ID_MEDIDA, 'raster-opacity', cfg.opacidad);
          } else {
            // ⚠️ Una fuente de lienzo NO admite atribución en MapLibre, así que
            // el deber de la licencia lo cumple la leyenda, que la imprime al pie
            // y solo mientras la capa está puesta.
            m.addSource(ID_MEDIDA, {
              type: 'canvas', canvas: lienzo, coordinates: coords, animate: false,
            });
            m.addLayer({
              id: ID_MEDIDA, type: 'raster', source: ID_MEDIDA,
              // `linear` explícito: al acercarse la medida se INTERPOLA en vez de
              // romperse en cuadros. No inventa detalle —la celda sigue siendo de
              // 2 km— pero deja de parecer un fallo de la imagen.
              paint: { 'raster-opacity': cfg.opacidad, 'raster-resampling': 'linear' },
              // Debajo de los rótulos igual que la foto: si se anclara en
              // `tramos`, el resultado dependería del ORDEN de los clics —
              // encender la medida después de la foto la ponía encima de los
              // nombres otra vez.
            }, primerRotulo(m) ?? (m.getLayer('tramos') ? 'tramos' : undefined));
          }
          setRejillaLista(marca);
          setBajandoRadiacion(false);
        }
        m.setLayoutProperty(ID_MEDIDA, 'visibility', 'visible');
        m.triggerRepaint();
      } catch (e) {
        if (cancelado) return;
        console.warn('[mapa] medida', medida, e);
        setFalloCapa(cfg.fallo);
        setMedida(null);
        setBajandoRadiacion(false);
      }
    };

    void pintar();
    return () => { cancelado = true; };
  }, [medida, mesRadiacion, fichaMedida, rejillaLista, mapaVivo, mapaCargado]);

  /**
   * El clic que dice cuántos grados hace AHÍ.
   *
   * Solo cuando la capa está encendida, y solo si el clic no cayó sobre un apoyo
   * o un tramo: ésos ya tienen su ficha y quitársela sería cambiar un gesto que
   * él ya usa.
   */
  useEffect(() => {
    const m = mapaVivo;
    if (!m || !medida || !fichaMedida) return;
    const alPulsar = (ev: maplibregl.MapMouseEvent) => {
      const encima = m.queryRenderedFeatures(ev.point, { layers: ['apoyos', 'tramos'] });
      if (encima.length) return;
      const bytes = rejilla.current;
      if (!bytes) return;
      setValorClic({
        c: valorEnPunto(bytes, fichaMedida, ev.lngLat.lng, ev.lngLat.lat),
        lon: ev.lngLat.lng, lat: ev.lngLat.lat,
      });
    };
    m.on('click', alPulsar);
    return () => { m.off('click', alPulsar); };
  }, [medida, fichaMedida, mapaVivo]);

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
    const m = mapaVivo;
    flecha.current?.remove();
    flecha.current = null;
    if (!m || !pronostico || !tiempo || !geometria) return;

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
  }, [pronostico, tiempo, geometria, mapaVivo]);

  if (estado === 'fallo' && respaldo) return <>{respaldo}</>;

  return (
    <div className={panelALado ? 'mapa-real mapa-real--lado' : 'mapa-real'}>
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
            {/* Se dicen los DOS números, y en este orden. Publicar solo el de la
                tesela vendería un detalle que no existe; publicar solo el del
                sensor haría parecer un fallo que la imagen se vea más fina que
                10 m. La medida manda: al acercarse no aparece nada nuevo. */}
            La medida es de <b>{fichas.satelital.resolucion_m} m por píxel</b>
            {fichas.satelital.metros_por_pixel_publicados
              && fichas.satelital.metros_por_pixel_publicados < (fichas.satelital.resolucion_m ?? 0)
              ? <> y se publica remuestreada a {String(fichas.satelital.metros_por_pixel_publicados)
                .replace('.', ',')} m para que el borde no se escalone</>
              : null}: al acercarse <b>no hay más detalle</b>, solo se amplía. Es la mejor
            resolución de imagen abierta que permite uso comercial y redistribución —
            las de 3 m o menos que cubren esta zona son de licencia gubernamental o no comercial.
          </p>
        )}

        <p className="mapa-capas-t">Encima</p>
        {/* Las dos medidas son EXCLUYENTES: encender una apaga la otra. No es un
            capricho de interfaz —son dos rampas de color sobre el mismo
            territorio, y superpuestas no se lee ninguna—. Se usan casillas y no
            un desplegable para que se vea de un vistazo qué hay disponible. */}
        {(Object.keys(MEDIDAS) as NombreMedida[]).map((k) => (
          <label key={k}>
            <input type="checkbox" checked={medida === k}
              onChange={(e) => {
                setMedida(e.target.checked ? k : null);
                setValorClic(null);
                setMesRadiacion(null);
              }} /> {MEDIDAS[k].rotulo}
            {medida === k && bajandoRadiacion && <span className="mapa-capas-f">midiendo…</span>}
          </label>
        ))}

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
        {medida === 'radiacion' && fichaMedida?.capa === 'radiacion' && (
          <LeyendaRadiacion ficha={fichaMedida as FichaRadiacion} mes={mesRadiacion} alElegirMes={(c) => {
            setMesRadiacion(c); setValorClic(null);
          }} valor={valorClic} cargando={bajandoRadiacion} />
        )}
        {medida === 'temperatura' && fichaMedida?.capa === 'temperatura' && (
          <LeyendaTemperatura ficha={fichaMedida as FichaTemperatura} mes={mesRadiacion} alElegirMes={(c) => {
            setMesRadiacion(c); setValorClic(null);
          }} valor={valorClic} cargando={bajandoRadiacion}
            edsHipotesis_C={hipotesis?.tempEds_C}
            alEncuadrar={mapaVivo && fichaMedida?.bbox
              ? () => {
                const [x0, y0, x1, y1] = (fichaMedida as FichaTemperatura).bbox;
                mapaVivo.fitBounds([[x0, y0], [x1, y1]], { padding: 24, duration: 700 });
              }
              : undefined} />
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
 * La leyenda del recurso solar: la escala, el MES que se mira, lo que se leyó al
 * pulsar el mapa y —lo más importante— para qué NO sirve.
 *
 * La frase de la ampacidad no es un descargo genérico: nombra la magnitud que sí
 * entra en el cálculo de esta aplicación (1.000 W/m² adoptados) y dice por qué
 * este mapa no la sustituye. Sin ella, poner una cifra de sol al lado de una
 * línea invita exactamente a la conversión que no se puede hacer.
 */
function LeyendaRadiacion({ ficha, mes, alElegirMes, valor, cargando }: {
  ficha: FichaRadiacion;
  mes: string | null;
  alElegirMes: (clave: string) => void;
  valor: { c: number | null; lon: number; lat: number } | null;
  cargando: boolean;
}) {
  const capas = capasOrdenadas(ficha);
  const actual: CapaRadiacion | null = capaElegida(ficha, mes);
  const rampa = ficha.rampa ?? [];
  if (!rampa.length || !actual) return null;
  const min = rampa[0].c;
  const max = rampa[rampa.length - 1].c;
  const gradiente = rampa
    .map((p) => `rgb(${p.rgb.join(',')}) ${(((p.c - min) / (max - min)) * 100).toFixed(1)}%`)
    .join(', ');
  const osc = oscilacionAnual(ficha);
  const muestreo = avisoDeMuestreo(ficha);
  const u = ficha.unidad ?? 'kWh/m² al día';

  return (
    <div className="mapa-leyenda">
      <label className="mapa-tiempo-dia">
        <span>Mes</span>
        <select value={actual.clave} onChange={(e) => alElegirMes(e.target.value)}>
          {capas.map((c) => (
            <option key={c.clave} value={c.clave}>
              {c.rotulo} · mediana {c.resumen.p50.toFixed(2)}
            </option>
          ))}
        </select>
      </label>
      {cargando && <p className="mapa-capas-n">Bajando el recurso de ese mes…</p>}

      <div className="mapa-leyenda-barra" style={{ background: `linear-gradient(90deg, ${gradiente})` }} />
      <div className="mapa-leyenda-esc">
        <span>{min} {u}</span><span>{max}</span>
      </div>

      <p className="mapa-capas-n">
        {actual.rotulo}: mediana <b>{actual.resumen.p50.toFixed(2)} {u}</b> · de{' '}
        {actual.resumen.min.toFixed(2)} a {actual.resumen.max.toFixed(2)} dentro del recorte.
      </p>

      {/* Lo que devuelve el clic. Es la razón de guardar la MEDIDA y no una imagen. */}
      <p className="mapa-capas-n mapa-tiempo-clic">
        {valor === null
          ? 'Pulse el mapa para leer el recurso de un punto.'
          : valor.c === null
            ? 'Ahí no hay muestra: fuera del recorte.'
            : <><b>{valor.c.toFixed(2)} {u}</b> en el punto que pulsó.</>}
      </p>

      {osc && (
        <p className="mapa-capas-n">
          Entre el mes más soleado (<b>{osc.alto.rotulo.toLowerCase()}</b>) y el más flojo
          (<b>{osc.bajo.rotulo.toLowerCase()}</b>) hay un <b>{osc.pct.toFixed(0)} %</b> de
          diferencia: una media anual sola se lleva por delante esa variación.
        </p>
      )}

      <p className="mapa-capas-n aviso">{NOTA_AMPACIDAD}</p>
      {muestreo && <p className="mapa-capas-n">{muestreo}</p>}
      <p className="mapa-capas-n">
        {ficha.magnitud ?? 'GHI'} · {ficha.periodo ?? 'promedio de largo plazo'} ·{' '}
        {ATRIBUCION_RADIACION}
      </p>
    </div>
  );
}

/**
 * La temperatura del AIRE, dicha para quien va a firmar un cálculo.
 *
 * TRES COSAS QUE NO PUEDEN FALTAR, y ninguna es adorno:
 *
 *   1. **Que es una MEDIA, no un extremo.** Es el mal uso probable: leer los
 *      27 °C como «la mínima del sitio» dejaría corto el tiro en frío y un apoyo
 *      terminal parecería sano sin serlo. La frase va en aviso, no en gris.
 *   2. **Por qué el mapa se ve casi de un color.** Un mapa liso sin explicación
 *      se lee como avería, y el reflejo siguiente es estirar la rampa hasta que
 *      «se vea algo» — que es como se fabrica un gradiente que no existe.
 *   3. **La comparación con la temperatura que el cálculo da por buena.** Es el
 *      único motivo por el que esta capa vale más que una curiosidad: pone una
 *      cifra del sitio al lado de una suposición que nadie había contrastado.
 */
function LeyendaTemperatura({ ficha, mes, alElegirMes, valor, cargando, edsHipotesis_C, alEncuadrar }: {
  ficha: FichaTemperatura;
  mes: string | null;
  alElegirMes: (clave: string) => void;
  valor: { c: number | null; lon: number; lat: number } | null;
  cargando: boolean;
  edsHipotesis_C?: number | null;
  /** Lleva el mapa al recorte entero de la capa. Ver más abajo por qué existe. */
  alEncuadrar?: () => void;
}) {
  const capas = capasOrdenadasTemp(ficha);
  const actual = capaElegidaTemp(ficha, mes);
  const rampa = ficha.rampa ?? [];
  if (!rampa.length || !actual) return null;
  const min = rampa[0].c;
  const max = rampa[rampa.length - 1].c;
  const gradiente = rampa
    .map((p) => `rgb(${p.rgb.join(',')}) ${(((p.c - min) / (max - min)) * 100).toFixed(1)}%`)
    .join(', ');
  const osc = oscilacionEstacional(ficha);
  const muestreo = avisoDeMuestreoTemp(ficha);
  const escala = avisoDeEscala(ficha, actual);
  const anual = capas.find((c) => c.clave === 'anual') ?? null;
  const contra = contraLaEds(anual?.resumen.p50 ?? null, edsHipotesis_C);
  const u = ficha.unidad ?? '°C';

  return (
    <div className="mapa-leyenda">
      <label className="mapa-tiempo-dia">
        <span>Mes</span>
        <select value={actual.clave} onChange={(e) => alElegirMes(e.target.value)}>
          {capas.map((c) => (
            <option key={c.clave} value={c.clave}>
              {c.rotulo} · mediana {c.resumen.p50.toFixed(1)} {u}
            </option>
          ))}
        </select>
      </label>
      {cargando && <p className="mapa-capas-n">Bajando la temperatura de ese mes…</p>}

      {/* ⚠️ ESTE BOTÓN NO ES UN ATAJO DE COMODIDAD: es la diferencia entre ver la
          capa y creer que no funciona. El mapa arranca encuadrado en la LÍNEA, y
          a lo largo de unos pocos kilómetros la temperatura del aire cambia una
          décima de grado: a esa escala la capa se ve de un color aunque esté
          perfecta —y ninguna línea de este sistema es tan larga como para que
          eso cambie—. El gradiente
          vive a escala del RECORTE, entre el mar y el interior. Sin una forma de
          llegar ahí de un clic, lo que el usuario concluye es que la capa está
          rota — y tendría motivos. */}
      {alEncuadrar && (
        <button type="button" className="boton chico" onClick={alEncuadrar}>
          Ver todo el recorte
        </button>
      )}
      <p className="mapa-capas-n">
        {/* Sin cifras de una línea concreta: este componente sirve a cualquiera,
            y «3 km» era el largo de LN-627 quemado en el código. */}
        Encuadrado en la línea el color es casi uniforme y no es un fallo: a lo largo de unos pocos
        kilómetros el aire no cambia. El gradiente se ve al abarcar el recorte entero.
      </p>

      <div className="mapa-leyenda-barra" style={{ background: `linear-gradient(90deg, ${gradiente})` }} />
      <div className="mapa-leyenda-esc">
        <span>{min} {u}</span><span>{max}</span>
      </div>

      <p className="mapa-capas-n">
        {actual.rotulo}: mediana <b>{actual.resumen.p50.toFixed(1)} {u}</b> · de{' '}
        {actual.resumen.min.toFixed(1)} a {actual.resumen.max.toFixed(1)} dentro del recorte.
      </p>

      {/* Lo que devuelve el clic. Es la razón de guardar la MEDIDA y no una imagen. */}
      <p className="mapa-capas-n mapa-tiempo-clic">
        {valor === null
          ? 'Pulse el mapa para leer la temperatura de un punto.'
          : valor.c === null
            ? 'Ahí no hay muestra: fuera del recorte.'
            : <><b>{valor.c.toFixed(1)} {u}</b> en el punto que pulsó.</>}
      </p>

      {osc && (
        <p className="mapa-capas-n">
          Entre el mes más cálido (<b>{osc.alto.rotulo.toLowerCase()}</b>) y el más fresco
          (<b>{osc.bajo.rotulo.toLowerCase()}</b>) hay <b>{osc.grados.toFixed(1)} °C</b>.
        </p>
      )}

      {escala && <p className="mapa-capas-n">{escala}</p>}
      {contra && <p className="mapa-capas-n">{contra.frase}</p>}

      <p className="mapa-capas-n aviso">{NOTA_HIPOTESIS}</p>
      {muestreo && <p className="mapa-capas-n">{muestreo}</p>}
      <p className="mapa-capas-n">
        {ficha.magnitud ?? 'TEMP'} · {ficha.periodo ?? 'promedio de largo plazo'} ·{' '}
        {ATRIBUCION_RADIACION}
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
 * La rejilla de un día, leída del PNG a bytes crudos.
 *
 * El archivo es una imagen en gris donde cada píxel ES el valor codificado, no
 * un color: se dibuja en un lienzo y se recoge un solo canal. Se comprueba que
 * el tamaño sea el que declara la ficha — un PNG que no cuadra con la ficha
 * desplazaría todas las lecturas y nadie lo notaría, porque los colores seguirían
 * saliendo bonitos.
 */
async function leerRejilla(url: string, ficha: FichaRadiacion): Promise<Uint8Array> {
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

    // Los errores del mapa (tesela, glifo, sprite) NO revientan la página: se
    // registran para poder diagnosticarlos. El diario que SÍ se puede consultar
    // después lo lleva la sonda (`sondaMapa.ts`), que además los cuenta por
    // fuente; aquí solo queda el eco inmediato en consola.
    //
    // ⚠️ Aquí vivía un SEGUNDO global (`window.__mapa`), con la misma avería que
    // el primero: dos pantallas, una variable, la pisaba la última y nadie la
    // borraba. Dos sondas globales para lo mismo no es redundancia, es tener dos
    // sitios donde equivocarse. La sonda es una y va por instancia.
    m.on('error', (e) => console.warn('[mapa]', (e as { error?: Error }).error?.message ?? e));

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
