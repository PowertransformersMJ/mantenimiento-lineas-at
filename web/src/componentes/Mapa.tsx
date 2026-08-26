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
import { layers, namedFlavor } from '@protomaps/basemaps';
import { prepararTeselas } from '../datos/teselas';
import { FUNCIONES_ANCLA, type Apoyo, type Investigacion } from '@lineas/contratos';
import { derivarLevantamiento } from '@lineas/exportar/levantamiento';
import { COLORES_TRAMO_CSS, COLOR_SIN_GUARDA, COLOR_SIN_GUARDA_FUNDA } from '../vistas/tramoColores';
import { cableDeGuarda } from '../vistas/cableGuarda';
import { nf } from '../vistas/formato';

/**
 * PEREZOSO de verdad: mientras la capa esté apagada, este trozo no se descarga.
 * Va por `conReintentos` como el resto de fronteras diferidas del sistema — un
 * fallo de red puntual dejaría la casilla encendida y el panel en blanco para
 * siempre (`datos/cargar.ts` es la única frontera, y esta la respeta).
 */
import { anotar, registrarMapa, retirarMapa } from './sondaMapa';

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
 * ⚠️ LAS DOS CAPAS FINAS DEL CORREDOR YA NO VIVEN AQUÍ (`99 §ADR-087`).
 *
 * «Radiación solar» y «Temperatura ambiente» —celdas de 2 km del Global Solar
 * Atlas— se MUDARON a la pantalla del ATLAS, con su interruptor, sus dos
 * leyendas, su clic y su techo de zoom: `componentes/CapasDelCorredor.tsx`.
 * Es la última pieza de clima que quedaba en Detalle GPS, y la orden del
 * Ingeniero (22-08) era que el clima viviera en el atlas y esta pestaña se
 * quedara con EL RECORRIDO.
 *
 * No se borró nada: se movió, y llegó completo antes de quitarlo de aquí —
 * incluida la hipótesis de cálculo, sin la cual la leyenda térmica pierde la
 * única línea por la que vale la pena mirarla.
 */

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

export default function Mapa({ apoyos, respaldo, eventos, alVerEvento, panelALado, pantalla = 'sin-declarar' }:
  { apoyos: Apoyo[]; respaldo?: ReactNode;
    /** Expedientes de falla a señalar sobre el mapa. Vacío = línea sin eventos. */
    eventos?: Investigacion[];
    /** Qué hacer al pulsar el marcador (abrir la pestaña Falla). */
    alVerEvento?: (id: string) => void;
    /**
     * ⚠️ AQUÍ IBA `hipotesis`, y se fue con las capas del corredor
     * (`99 §ADR-087`). Era lo que permitía comparar la media térmica del sitio
     * con la EDS adoptada; esa leyenda vive ahora en el atlas, así que la
     * hipótesis viaja allí. Un mapa de recorrido no necesita saber con qué
     * temperatura se calcula el tiro.
     */
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
  const [fichas, setFichas] = useState<Partial<Record<NombreCapa, FichaCapa>>>({});
  const [bajando, setBajando] = useState<NombreCapa | null>(null);
  const [falloCapa, setFalloCapa] = useState<string | null>(null);
  /**
   * El pronóstico NO es una capa de imagen: es un dato del sitio que se pinta
   * encima. Por eso va con su propio estado y no en `CAPAS_RASTER`.
   */
  /**
   * El clima del AÑO (los cinco atlas del Caribe), consultado desde este mapa.
   *
   * Es una capa PEREZOSA de verdad: mientras esté apagada no se descarga ni la
   * ficha ni un solo PNG, y el trozo de código que la pinta tampoco. Encendida
   * cuesta ~32 KB — NO trae el mapa base regional de 5 MiB, porque el mapa base
   * aquí es el de la línea, que ya está (`99 §ADR-056`).
   */
  /** Si ya se pidió el pronóstico en esta pantalla. Referencia y no estado: ver el efecto. */
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
  /**
   * Los tramos sin cable de guarda, para la LEYENDA. El mapa lo vuelve a
   * derivar por su cuenta al crearse porque `crearMapa` está fuera de React y no
   * puede leer este valor; los dos llaman a la MISMA función pura, así que no
   * hay dos verdades — solo dos lectores del mismo dueño (`vistas/cableGuarda`).
   */
  const guarda = useMemo(() => cableDeGuarda(apoyos), [apoyos]);

  // ⚠️ `geometria` (centroide + eje de la línea) se retiró con `§ADR-069`: solo
  // servía al clima, y el clima vive ahora en la pantalla del atlas, que lo
  // deriva por su cuenta del recorrido que recibe.

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
          // Orden que queda, de abajo arriba: callejero · foto · rótulos ·
          // trazado y apoyos. El trazado encima de todo porque es el asunto.
          // (Antes se colaba la capa de medida entre la foto y los rótulos; se
          // fue al atlas con `§ADR-087` y con ella el escalón de este cálculo.)
          const debajoDe = primerRotulo(m) ?? (m.getLayer('tramos') ? 'tramos' : undefined);
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
          if (nombre === 'satelital') setBase('callejero');
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
  }, [base, mapaVivo, mapaCargado]);

  // ⚠️ AQUÍ VIVÍAN el efecto que pintaba la rejilla del corredor y el clic que
  // leía su valor. Se fueron con la capa a `CapasDelCorredor` (`99 §ADR-087`).

  // ⚠️ El efecto que pintaba la celda del clima sobre este mapa se retiró con
  // `§ADR-069`: el clima vive en la pantalla del atlas, que pinta su propia
  // rejilla. Aquí no queda rastro.

  // ⚠️ Aquí se pedía el pronóstico. Se fue con el clima a la pantalla del
  // atlas (`§ADR-069`): un mapa de línea no consulta a terceros.

  // ⚠️ La flecha del viento se fue con el clima al atlas (`§ADR-069`).

  // ⚠️ «Ver todo el recorte» se fue con las capas del corredor (`§ADR-087`).
  // Allí ya no basta: el atlas abre sobre siete departamentos, así que ahora son
  // DOS encuadres —el recorte y la región— y viven en `CapasDelCorredor`.

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

        {/* ⚠️ AQUÍ ESTABAN «Radiación solar» y «Temperatura ambiente»
            (`§ADR-087`). Se fueron enteras a la pantalla del ATLAS: capa,
            leyendas, clic y encuadre. Esta pestaña se queda con EL RECORRIDO,
            que es la orden. No se borró nada: llegó completo antes de quitarlo. */}

        {/* ⚠️ EL CLIMA YA NO VIVE AQUÍ (`§ADR-069`). Estaba «El tiempo de esta
            línea» —el eje de fecha, el día entero, las escalas y el pronóstico—
            y el Ingeniero pidió que dejara de aparecer en Detalle GPS y viviera
            en la pantalla del ATLAS, que es la suya: ahí se ven los 7
            departamentos y se puede pulsar la celda que se quiera. Esta pestaña
            se queda con lo que es: EL RECORRIDO a pantalla entera.
            No se borró nada: se movió, y llegó completo antes de quitarlo. */}
        {bajando && (
          <p className="mapa-capas-n" aria-live="polite">
            Descargando {CAPAS_RASTER[bajando].rotulo.toLowerCase()}… (una sola vez)
          </p>
        )}
        {falloCapa && <p className="mapa-capas-n alerta">{falloCapa}</p>}
        {/* ⚠️ SOLO SI HAY DATO. Sin declaraciones no se pinta ni se dice nada:
            «nadie lo ha comprobado» no es «la línea lleva guarda», y una leyenda
            vacía que dijera «0 m sin guarda» sería exactamente esa mentira. */}
        {guarda.tramos.length > 0 && (
          <>
            <p className="mapa-capas-t">Sin cable de guarda</p>
            {guarda.tramos.map((t) => {
              const [d, h] = extremosCortos(t.desde, t.hasta);
              return (
                <p key={t.desdeId} className="mapa-guarda">
                  <span className="li sin-guarda"
                    style={{ borderTopColor: COLOR_SIN_GUARDA, outlineColor: COLOR_SIN_GUARDA_FUNDA }} />
                  <b>{d} → {h}</b> · {nf(t.metros)} m
                  {t.vanos.length > 1 && <> · {t.vanos.length} vanos</>}
                </p>
              );
            })}
            <p className="mapa-capas-n">
              {nf(guarda.metros.sinGuarda)} m
              {guarda.pctSinGuarda != null && <> — <b>{nf(guarda.pctSinGuarda, 1)} %</b> de la línea</>}.
              {' '}Es <b>daño de operación</b>, no diseño, y <b>no entra en ningún cálculo</b>.
              {/* ⚠️ EL CASO «TODO DECLARADO» SE DICE, no se calla. Si aquí solo
                  desapareciera el aviso, «línea entera comprobada» y «nadie ha
                  mirado el resto» se verían IGUAL: las dos sin frase. Y son la
                  diferencia entre un porcentaje que dictamina la línea y uno que
                  solo describe lo poco que hay declarado. */}
              {guarda.nSinDato > 0 ? (
                <> Quedan <b>{guarda.nSinDato} vano(s) sin comprobar</b>: de ésos no consta nada,
                  ni que lleven guarda ni que no.</>
              ) : (
                <> El resto de la línea está declarado <b>CON</b> guarda: los {guarda.vanos.length} vanos
                  tienen respuesta, así que ese porcentaje es de la línea entera.</>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Los dos extremos de un tramo, sin el prefijo que comparten.
 *
 * «LN-627 E06 → LN-627 E09» dice dos veces el nombre de la línea en un panel de
 * 240 px, y se parte en dos renglones. Se recorta el prefijo COMÚN y se corta en
 * el último espacio, no en cualquier letra: sin eso, «E06» y «E09» compartirían
 * también el «E0» y quedarían en «6» y «9».
 *
 * Se calcula, no se escribe a mano: el código de la línea no está en este
 * componente, y dejarlo escrito lo rompería en la siguiente línea que se cargue.
 */
function extremosCortos(a: string, b: string): [string, string] {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const corte = a.slice(0, i).lastIndexOf(' ') + 1;
  return corte > 0 ? [a.slice(corte), b.slice(corte)] : [a, b];
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

// ⚠️ LAS DOS LEYENDAS Y EL LECTOR DE REJILLAS SE MUDARON (`99 §ADR-087`) a
// `componentes/CapasDelCorredor.tsx`, junto con la capa que explicaban. Una
// leyenda sin su capa no es código muerto simpático: es una pieza que el día que
// alguien la reutilice pintará la escala de un mapa que no está puesto.

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

    // ── TRAMOS SIN CABLE DE GUARDA ──────────────────────────────────────────
    //
    // No es una capa opcional ni un adorno: es el estado real de la protección
    // de la línea, y el Ingeniero lo declaró como DAÑO ACUMULADO por fallas de
    // operación, no como diseño (`99 §ADR-044`). Va SIEMPRE que haya dato, y
    // cuando no lo hay no se pinta nada — porque «nadie lo ha declarado» no es
    // «lo lleva» (`vistas/cableGuarda.ts`).
    //
    // La geometría sigue el RECORRIDO real entre las dos estructuras del tramo,
    // empalmes incluidos, igual que hace `tramos`: una recta entre extremos
    // cruzaría por fuera del trazado en cuanto haya un quiebre en medio — y en
    // esta línea E06 quiebra 118°.
    const guarda = cableDeGuarda(apoyos);
    const indiceDe = new Map(ordenados.map((a, i) => [a.id, i]));
    const sinGuarda: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: guarda.tramos.map((t) => {
        const i0 = indiceDe.get(t.desdeId) ?? 0;
        const i1 = indiceDe.get(t.hastaId) ?? ordenados.length - 1;
        const recorrido = ordenados.slice(Math.min(i0, i1), Math.max(i0, i1) + 1);
        return {
          type: 'Feature' as const,
          properties: {
            ficha: `<div class="pop-ficha"><b>Sin cable de guarda</b> · ${escHtml(t.desde)} → ${escHtml(t.hasta)}<br>`
              + `${t.vanos.length} vano(s) · ${t.metros.toFixed(1)} m<br>`
              + '<i>Daño de operación declarado, no diseño. No entra en ningún cálculo.</i></div>',
          },
          geometry: {
            type: 'LineString' as const,
            coordinates: recorrido.map((a) => [a.coordenada.lon, a.coordenada.lat]),
          },
        };
      }),
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
      if (sinGuarda.features.length) m.addSource('sin-guarda', { type: 'geojson', data: sinGuarda });

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

      // ⚠️ ENCIMA de `tramos` y DEBAJO de `apoyos`. Encima de los tramos porque
      // si quedara debajo lo taparía justo el color del tramo de tensión, que es
      // opaco al 95 %; debajo de los apoyos porque el apoyo y su nombre son lo
      // que permite decir DÓNDE está el daño, y taparlos con la marca sería
      // cambiar un dato por una alarma.
      if (sinGuarda.features.length) {
        // ⚠️ FUNDA BLANCA DEBAJO, Y NO ES COSMÉTICA. El primer intento pintaba
        // la marca en rojo (#dc2626) directamente encima del trazado, y sobre el
        // PRIMER color de tramo de tensión (#d63b3b) resultaba invisible: los dos
        // rojos son el mismo a simple vista. Se vio en el banco de pruebas. Una
        // marca de daño que desaparece sobre un tramo concreto es peor que no
        // pintarla: da por sano justo un trozo de línea que está señalado.
        //
        // La funda blanca separa la marca de CUALQUIER color de debajo —los
        // cuatro de tramo, el callejero y la foto satelital— y encima va un
        // discontinuo rojo OSCURO, que no lo usa ninguna otra capa. Y el
        // discontinuo tampoco es estética: un cable que falta se lee como línea
        // cortada; los tramos de tensión van todos continuos.
        m.addLayer({
          id: 'sin-guarda-halo',
          type: 'line',
          source: 'sin-guarda',
          paint: { 'line-color': COLOR_SIN_GUARDA_FUNDA, 'line-width': 11, 'line-opacity': 0.95 },
        });
        m.addLayer({
          id: 'sin-guarda',
          type: 'line',
          source: 'sin-guarda',
          paint: {
            'line-color': COLOR_SIN_GUARDA,
            'line-width': 4.5,
            'line-dasharray': [1.8, 1.4],
          },
        });
        m.on('click', 'sin-guarda', (ev: maplibregl.MapLayerMouseEvent) => {
          const f = ev.features?.[0];
          if (!f) return;
          new maplibregl.Popup({ offset: 10, closeButton: false, maxWidth: '340px' })
            .setLngLat(ev.lngLat)
            .setHTML(String(f.properties?.ficha ?? ''))
            .addTo(m);
        });
        m.on('mouseenter', 'sin-guarda', () => { m.getCanvas().style.cursor = 'pointer'; });
        m.on('mouseleave', 'sin-guarda', () => { m.getCanvas().style.cursor = ''; });
      }

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
