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
import { ATLAS, ATLAS_EN_ORDEN, type ClaveAtlas } from '../vistas/atlasCatalogo';
import { soloEstructuras } from '../vistas/planta';
import type { Apoyo } from '../../../contratos/src/activos';
import { ElDiaEntero, topeDe } from './PanelDelClima';
import {
  celdasDelRecorrido, diaEnPalabras, diasDelMesSobre, dibujoDelRecorrido, frescuraDelAtlas,
  perfilEnCelda,
} from '../vistas/atlasCaribe';
import { bordeDeCelda, celdaDe } from '../vistas/rejilla';
import { PanelPronostico } from './PanelDelClima';
import { celdaDeConsulta, pedirPronostico, SinPronostico } from '../datos/pronostico';
import { ejeDeLaLinea, type PronosticoEnPantalla } from '../vistas/pronostico';
import { anotar, registrarMapa, retirarMapa } from './sondaMapa';

const DEPARTAMENTOS = '/mapas/caribe-departamentos.json';
const BASE = 'caribe.pmtiles';

/** Cuál de los atlas. Es lo ÚNICO que esta pantalla necesita saber. */
/**
 * QUÉ ATLAS EXISTEN — **ya no se define aquí** (`§ADR-068`). Vive en
 * `vistas/atlasCatalogo.ts`, que es dato y no pantalla: colgarlo de este
 * componente obligaba al panel del mapa de línea a importar de aquí, y un trozo
 * perezoso tirando de otro es un ciclo esperando a que alguien importe de vuelta.
 */
export { ATLAS, ATLAS_EN_ORDEN } from '../vistas/atlasCatalogo';
export type { ClaveAtlas } from '../vistas/atlasCatalogo';

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

export function AtlasCaribe({ atlas, embebido = false, marca, alCambiarAtlas, linea }: {
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
  /**
   * Cambiar de atlas SIN salir de la pantalla. Si no se pasa, no se ofrece el
   * selector — que es lo correcto donde no hay a dónde ir.
   *
   * Existe porque con cinco atlas la cabecera se llenaba de botones y obligaba
   * a salir y volver a entrar para comparar el sol de un día con su viento. Lo
   * que se compara se pone al lado, no a dos clics.
   */
  alCambiarAtlas?: (cual: ClaveAtlas) => void;
  /**
   * LA LÍNEA CARGADA, si la hay (`§ADR-069`).
   *
   * Desde que el clima vive AQUÍ y no en Detalle GPS, esta pantalla necesita el
   * recorrido: para dibujarlo sobre la región, para comprobar cuántas celdas
   * toca —punto por punto, `§ADR-064`— y para pedir el pronóstico de su punto.
   *
   * ⚠️ OPCIONAL A PROPÓSITO: el atlas se abre con `#/sol` sin línea cargada y
   * tiene que seguir sirviendo como atlas de la región. Sin línea, el panel
   * enseña lo mismo salvo lo que exige un sitio concreto.
   */
  linea?: { codigo: string; apoyos: Apoyo[] };
}) {
  const def = ATLAS[atlas];
  /**
   * El recorrido, ya filtrado por el ÚNICO dueño de «qué puntos son la línea»
   * (`§ADR-067`): fuera empalmes y puntos de referencia.
   */
  const recorrido = useMemo(() => {
    if (!linea?.apoyos?.length) return null;
    const E = soloEstructuras(linea.apoyos);
    if (!E.length) return null;
    const puntos = E.map((a) => ({ lat: a.coordenada.lat, lon: a.coordenada.lon }));
    return {
      codigo: linea.codigo,
      puntos,
      // El punto por el que se PREGUNTA (pronóstico, celda). Las coordenadas
      // enteras van aparte, para comprobar y no suponer.
      lat: puntos.reduce((t, p) => t + p.lat, 0) / puntos.length,
      lon: puntos.reduce((t, p) => t + p.lon, 0) / puntos.length,
      /** La dirección media de la línea: de ella sale el viento DE LADO. */
      eje: ejeDeLaLinea(puntos.map((p, i, a) => (i === 0 ? null : (() => {
        const d = Math.atan2(p.lon - a[i - 1].lon, p.lat - a[i - 1].lat) * 180 / Math.PI;
        return (d + 360) % 360;
      })()))),
    };
  }, [linea]);
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
  const nSonda = useRef<number | null>(null);
  const [clic, setClic] = useState<{ v: number | null; lon: number; lat: number } | null>(null);

  useEffect(() => () => { montado.current = false; }, []);

  /**
   * EL PRONÓSTICO DE LA LÍNEA (`§ADR-069`), migrado desde Detalle GPS.
   *
   * ⚠️ NO HAY «PRONÓSTICO DE 7 DEPARTAMENTOS»: se pide para el punto de consulta
   * de la línea —redondeado a una celda, `datos/pronostico.ts`— y por eso solo
   * existe cuando hay línea cargada. Fabricar un campo regional a partir de un
   * punto sería justo lo que `§ADR-046` prohíbe.
   *
   * Se pide UNA vez, al llegar, y no al pintar: una consulta a un tercero es un
   * acto deliberado (`32 · L-57`).
   */
  const [tiempo, setTiempo] = useState<PronosticoEnPantalla | null>(null);
  const [falloTiempo, setFalloTiempo] = useState<string | null>(null);
  const yaPedido = useRef(false);

  useEffect(() => {
    // ⚠️ EMBEBIDO NO PIDE PRONÓSTICO (`§ADR-078`). Cuando este atlas se abre
    // DENTRO de Detalle GPS, el pronóstico se queda fuera: es una de las piezas
    // que el Ingeniero mandó sacar de esa pestaña por su nombre (`§ADR-069`).
    // Y no se pide y luego se esconde: una consulta a un tercero es un acto
    // deliberado (`32 · L-57`), no algo que se dispara para no enseñarlo.
    if (!recorrido || embebido || yaPedido.current) return;
    yaPedido.current = true;
    void pedirPronostico(recorrido.lat, recorrido.lon)
      .then((t) => { if (montado.current) setTiempo(t); })
      .catch((e) => {
        if (!montado.current) return;
        setFalloTiempo(e instanceof SinPronostico ? e.message
          : 'No se pudo consultar el pronóstico. El atlas sigue funcionando sin él.');
      });
  }, [recorrido, embebido]);



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
        const ultimoMes = f.meses[f.meses.length - 1]?.clave ?? null;
        setMesClave(ultimoMes);
        // ⚠️ Y EN EL ÚLTIMO DÍA MEDIDO, no en el 1 (`§ADR-079`). Con los cinco
        // atlas de medias daba igual —el día 1 del último mes siempre tiene
        // dato—, pero el de RAYOS se ACUMULA y empieza por el día de hoy: abrir
        // en el 1 enseñaba un mapa vacío y un «de este día no consta nada» sobre
        // una capa que sí tiene dato dos días después. Es el mismo invariante de
        // `§ADR-078`: el atlas abre donde HAY dato.
        if (ultimoMes && f.ultimoDiaConHoras?.slice(5, 7) === ultimoMes) {
          setDia(+f.ultimoDiaConHoras.slice(8, 10));
        }
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

  /**
   * DE QUÉ CELDA SE HABLA (`§ADR-069`, decisión del Ingeniero 2026-08-22).
   *
   * Manda **el clic**. Si no hubo clic y el recorrido de la línea cae en UNA
   * sola celda —comprobado punto por punto, `§ADR-064`—, manda ésa. Si el
   * recorrido cruza varias y no hubo clic, NO manda ninguna: elegir una sería
   * reintroducir por la puerta de atrás el promedio que `§ADR-064` cerró.
   */
  const delRecorrido = useMemo(() => {
    if (!ficha || !recorrido) return null;
    return celdasDelRecorrido(recorrido.puntos, ficha, celdaDe);
  }, [ficha, recorrido]);

  const celdaEnFoco = useMemo(() => {
    if (!ficha) return null;
    if (clic) return { celda: celdaDe(clic.lon, clic.lat, ficha), porQue: 'la celda que pulsó' };
    if (delRecorrido?.celdas.length === 1) {
      return { celda: delRecorrido.celdas[0], porQue: `la celda de ${recorrido?.codigo ?? 'la línea'}` };
    }
    return null;
  }, [ficha, clic, delRecorrido, recorrido]);

  /** El día entero EN esa celda, y el mes. Sale del PNG que ya está en memoria. */
  const delDia = useMemo(() => {
    if (!ficha || !mes?.png || !bytes || bytes.mes !== mes.clave || !celdaEnFoco?.celda) return null;
    const c = celdaEnFoco.celda;
    const perfil = perfilEnCelda(bytes.px, ficha, mes.png, dia, c.ix, c.iy);
    if (!perfil) return null;
    const tope = topeDe(atlas, ficha);
    const mesEntero = tope
      ? { ...diasDelMesSobre(bytes.px, ficha, mes.png, c.ix, c.iy, tope.valor, tope.mide), tope }
      : null;
    return { perfil, delMes: mesEntero };
  }, [ficha, mes, bytes, dia, celdaEnFoco, atlas]);

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

        // ⚠️ LA SONDA Y EL OÍDO DE ERRORES (`§ADR-071`). Este mapa se quedaba
        // GRIS —cero fuentes, cero capas, `isStyleLoaded()` en falso— y **sin un
        // solo error en consola**: exactamente el fallo mudo que el comentario
        // de `datos/teselas.ts` dice haber cerrado una vez. Sin sonda no se
        // puede saber si el mapa está vivo, muerto o a medio construir, que es
        // la lección `32 · L-55/L-58` — y este mapa nunca la tuvo.
        nSonda.current = registrarMapa('atlas-' + atlas, m, caja.current);
        m.on('error', (ev) => {
          const msg = (ev as { error?: Error }).error?.message ?? 'error sin mensaje';
          if (nSonda.current !== null) anotar(nSonda.current, 'error: ' + msg);
          // Un fallo del mapa base NO puede quedarse mudo: se dice en pantalla.
          if (!cancelado) setFallo((f) => f ?? `El mapa base no pudo cargarse: ${msg}`);
        });
      } catch (e) {
        if (!cancelado) setFallo((e as Error).message);
      }
    })();
    return () => {
      cancelado = true;
      if (nSonda.current !== null) { retirarMapa(nSonda.current); nSonda.current = null; }
      mapa.current?.remove(); mapa.current = null; setListoMapa(false);
    };
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

  /**
   * SI LA HORA ELEGIDA NO SE MIDIÓ ESE DÍA, SE VA A LA HORA PUNTA (`§ADR-079`).
   *
   * Con las cinco capas de medias esto no hacía falta: todas las horas de un día
   * publicado tienen dato, así que mantener la hora al cambiar de día es una
   * ventaja —permite comparar el mediodía de un día con el del siguiente— y se
   * conserva. Pero el atlas de RAYOS se acumula hora a hora: la mayoría de las
   * horas de un día recién empezado no existen todavía, y al pulsar otro día el
   * mapa se quedaba EN BLANCO con el deslizador en una hora sin medida. Se lee
   * como una avería y no lo es.
   *
   * La regla es la mínima que arregla eso sin tocar lo otro: **solo** se mueve
   * la hora cuando la elegida no trae nada ese día.
   */
  useEffect(() => {
    if (!ficha || !mes?.png || !bytes || bytes.mes !== mes.clave) return;
    const c = cuadroDe(bytes.px, ficha, mes.png, dia, hora);
    const vacio = !c || c.every((b) => b === ficha.codificacion.sin_dato);
    if (vacio) setHora(horaPunta(bytes.px, ficha, mes.png, dia));
    // `hora` fuera a propósito: esto reacciona al DÍA, no a que él mueva la hora.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dia, ficha, mes, bytes]);

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

  // ── EL RECORRIDO, DIBUJADO (`§ADR-074`) ───────────────────────────────────
  //
  // La otra mitad del nexo que `§ADR-073` dejó a medias: el panel DECÍA «la celda
  // de LN-627» y el mapa no lo enseñaba. Tres piezas —las celdas que toca, la
  // traza y el rótulo—, cada una en `vistas/atlasCaribe.ts` y aquí solo colgadas
  // del mapa. La geometría no se calcula en este archivo a propósito: es donde
  // se cuelan los desfases que nadie ve (`§ADR-074` lo vigila de ida y vuelta).
  //
  // ⚠️ SIN RELLENO. El color de esa celda YA es el dato medido; repintarlo, aunque
  // fuera translúcido, pondría dos verdades sobre el mismo cuadro.
  //
  // ⚠️ ENCIMA DE LA REJILLA. Sin `beforeId`, estas capas se añaden al final y por
  // tanto sobre el ráster: debajo, el 0,72 de opacidad del cuadro se las comería.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listoMapa || !ficha) return;

    const PIEZAS = ['recorrido-celdas', 'recorrido-traza', 'recorrido-rotulo'] as const;
    const CAPAS = ['recorrido-celdas-camisa', 'recorrido-celdas', 'recorrido-traza-camisa',
      'recorrido-traza', 'recorrido-rotulo'] as const;

    const dib = recorrido && delRecorrido
      ? dibujoDelRecorrido(recorrido.puntos, delRecorrido.celdas, ficha, bordeDeCelda, recorrido.codigo)
      : null;

    // Sin línea cargada no hay nada que dibujar, y lo que hubiera se retira: el
    // atlas de la región tiene que seguir siendo un atlas de la región.
    if (!dib) {
      for (const c of CAPAS) if (m.getLayer(c)) m.removeLayer(c);
      for (const f of PIEZAS) if (m.getSource(f)) m.removeSource(f);
      return;
    }

    const datos = { 'recorrido-celdas': dib.celdas, 'recorrido-traza': dib.traza,
      'recorrido-rotulo': dib.rotulo } as const;
    for (const f of PIEZAS) {
      const fuente = m.getSource(f) as maplibregl.GeoJSONSource | undefined;
      if (fuente) fuente.setData(datos[f] as unknown as GeoJSON.FeatureCollection);
      else m.addSource(f, { type: 'geojson', data: datos[f] as unknown as GeoJSON.FeatureCollection });
    }

    if (!m.getLayer('recorrido-celdas')) {
      // La CAMISA blanca no es adorno: la escala va del azul oscuro al rojo, y
      // un trazo de tinta sobre el extremo frío de la rampa desaparece. Debajo
      // del trazo, no encima, para que el borde siga siendo el borde.
      m.addLayer({
        id: 'recorrido-celdas-camisa', type: 'line', source: 'recorrido-celdas',
        paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.7 },
      });
      m.addLayer({
        id: 'recorrido-celdas', type: 'line', source: 'recorrido-celdas',
        paint: {
          'line-color': '#2c2a24', 'line-width': 2.2,
          // A rayas, y no por gusto: los límites departamentales ya son líneas
          // continuas del mismo color. Iguales, se leerían como una frontera más.
          'line-dasharray': [2, 1.4],
        },
      });
      m.addLayer({
        id: 'recorrido-traza-camisa', type: 'line', source: 'recorrido-traza',
        paint: { 'line-color': '#2c2a24', 'line-width': 5, 'line-opacity': 0.9 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      m.addLayer({
        id: 'recorrido-traza', type: 'line', source: 'recorrido-traza',
        paint: { 'line-color': '#ffffff', 'line-width': 2.2 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      m.addLayer({
        id: 'recorrido-rotulo', type: 'symbol', source: 'recorrido-rotulo',
        layout: {
          'text-field': ['get', 'nombre'], 'text-font': ['Noto Sans Medium'],
          'text-size': 12, 'text-offset': [0, 1.2], 'text-anchor': 'top',
          // El rótulo NO se esconde si choca con otro: es el sujeto de la
          // pantalla. Que lo tape un nombre de departamento sería perderlo.
          'text-allow-overlap': true, 'text-ignore-placement': true,
        },
        paint: { 'text-color': '#2c2a24', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
      });
      if (nSonda.current !== null) {
        anotar(nSonda.current, `trazado: ${dib.celdas.features.length} celda(s), `
          + `${dib.traza.features.length} traza(s), ${recorrido?.codigo ?? '—'}`);
      }
    }
    m.triggerRepaint();
  }, [listoMapa, ficha, recorrido, delRecorrido]);

  /**
   * DE CUÁNDO ES ESTO (`§ADR-075`). Se calcula con el reloj del que mira, y por
   * eso se pide UNA vez al montar y no en cada pintada: recalcularlo dentro del
   * render dispararía un repintado por cada tecla y, peor, haría que dos partes
   * de la misma pantalla pudieran hablar de momentos distintos.
   */
  const ahora = useRef(new Date());
  const frescura = useMemo(
    () => (ficha ? frescuraDelAtlas(ficha, ahora.current) : null), [ficha]);

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
      {/* EL SELECTOR DE ATLAS. Va ARRIBA del todo y no dentro del panel de
          controles: cambiar de atlas no es filtrar un mes, es cambiar de qué
          habla la pantalla entera. Mezclarlo con el mes y el día invitaría a
          leerlo como un filtro más y a perder de vista qué se está mirando. */}
      {alCambiarAtlas && (
        <div className="acciones" role="group" aria-label="Qué atlas se mira">
          {ATLAS_EN_ORDEN.map((c) => (
            <button key={c} type="button"
              className={'boton chico' + (c === atlas ? ' activo' : '')}
              aria-pressed={c === atlas}
              onClick={() => c !== atlas && alCambiarAtlas(c)}>
              {ATLAS[c].rotulo}
            </button>
          ))}
        </div>
      )}
      {/* ⚠️ DOS FECHAS, Y NO SON LA MISMA (`§ADR-075`). Lo pidió el Ingeniero:
          «que se pueda apreciar la fecha de última actualización y hora». Se
          publican las dos —cuándo se le preguntó a la fuente y hasta cuándo
          llega su dato— porque enseñar solo la primera es lo que engaña: el
          atlas solar se reconstruye hoy y trae dato de mayo. Y se dice DE QUIÉN
          es el retraso, que es lo que convierte dos fechas en una decisión. */}
      {frescura && (
        <p className={'atlas-frescura r-' + (frescura.porQue === 'al-dia' ? 'medido'
          : frescura.porQue === 'fuente-atrasada' ? 'modelo' : 'hueco')}>
          🕘 <b>Actualizado</b> el {diaEnPalabras(frescura.construidoDia)} a las{' '}
          <b>{frescura.construidoHora}</b> (hora de Colombia)
          {frescura.diasDelArchivo > 0 && <> · hace {frescura.diasDelArchivo}{' '}
            {frescura.diasDelArchivo === 1 ? 'día' : 'días'}</>}.
          {' '}Trae <b>dato medido hasta el {diaEnPalabras(frescura.medidoHasta, false)}</b>
          {' '}({frescura.diasDelDato} {frescura.diasDelDato === 1 ? 'día' : 'días'} atrás).
          {frescura.porQue === 'fuente-atrasada' && (
            <> ⚠️ <b>El retraso es de la FUENTE, no del archivo</b>: se le preguntó hace{' '}
              {frescura.diasDelArchivo} {frescura.diasDelArchivo === 1 ? 'día' : 'días'} y no
              tenía más. Reconstruirlo otra vez no adelantaría un solo día.</>
          )}
          {frescura.porQue === 'archivo-viejo' && (
            <> ⚠️ <b>Hace {frescura.diasDelArchivo} días que no se reconstruye.</b> El vigía
              mira cada 4 horas y PROPONE; si nadie aprueba, esto se queda quieto.</>
          )}
        </p>
      )}
      <p className="saludo">
        {def.entradilla} <b>hora a hora</b> sobre {ficha?.departamentos.join(', ')}.
        Cada cuadro es una celda de <b>1°</b> (unos 111 km) medida por satélite: se pinta a cuadros
        porque <b>a cuadros es como está medida</b>.
        {marca && <> El punto marcado es <b>{marca.nombre}</b>: dónde cae esta línea dentro del atlas.</>}
        {/* ⚠️ EL DIBUJO SE ANUNCIA Y SE ACOTA (`§ADR-074`). Un trazo de tres
            píxeles sobre un mapa de siete departamentos se lee como un punto —y
            quien no sepa que ES la línea lo tomará por una marca cualquiera. Se
            dice qué es, cuántas coordenadas lo forman y por qué se ve pequeño:
            el recorrido mide kilómetros y el mapa, cientos. */}
        {recorrido && delRecorrido && (
          <> El <b>trazado de {recorrido.codigo}</b> va dibujado encima, con sus{' '}
            <b>{delRecorrido.puntos} coordenadas</b>, y{' '}
            {delRecorrido.celdas.length === 1
              ? <>la celda que le toca va <b>rodeada a rayas</b></>
              : <>van rodeadas a rayas las <b>{delRecorrido.celdas.length} celdas</b> que cruza</>}.
            A este encuadre se ve como un punto: la línea mide kilómetros y el mapa, cientos.</>
        )}
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

              {/* ── EL DÍA ENTERO, LA ESCALA Y EL MES (`§ADR-069`) ───────────
                  Migrado desde el mapa de la línea por orden del Ingeniero: el
                  clima deja de vivir en Detalle GPS y vive aquí. Habla de UNA
                  celda —la que se pulse, o la de la línea si su recorrido cabe
                  en una sola— y NUNCA del resumen de las 36, que va al final y
                  rotulado como REGIÓN (`§ADR-059`). */}
              {/* ⚠️ EL «POR QUÉ NO HAY HORAS» VA AQUÍ, pegado al deslizador, y no
                  al final (`§ADR-078`). Estaba después del pronóstico y de la
                  escala —más de mil caracteres más abajo—, así que al elegir un
                  día sin reparto horario el hora a hora DESAPARECÍA y la razón
                  no se veía: se lee como una avería. La explicación tiene que
                  estar donde se nota la falta, no donde cabe. */}
              {banda === 'solo_total' && (
                <p className="advertencia">
                  <b>De este día no hay reparto por horas.</b> Al construir este archivo
                  ({ficha.construido.slice(0, 10)}) la fuente llegaba al{' '}
                  <b>{ficha.ultimoDiaConHoras}</b> — unos <b>{diasEntre(ficha.ultimoDiaConHoras, ficha.construido.slice(0, 10))} días</b> de retraso. Solo consta el resumen del día, y ese resumen{' '}
                  <b>no se reparte</b> entre horas: sería inventar una curva que nadie midió.
                  {' '}<b>Para verlo hora a hora, elija un día hasta el {ficha.ultimoDiaConHoras}.</b>
                </p>
              )}
              {banda === 'sin_dato' && (
                <p className="advertencia">
                  <b>De este día no consta nada todavía</b>, ni siquiera el total.
                  {' '}<b>El último día medido hora a hora es el {ficha.ultimoDiaConHoras}.</b>
                </p>
              )}
              {delDia && celdaEnFoco && (
                <>
                  <p className="mapa-capas-n eje-cinta r-medido">
                    <b>ESTA CELDA</b> · {celdaEnFoco.porQue}.
                  </p>
                  {/* ⚠️ EL NEXO CON LA LÍNEA (`§ADR-073`). El Ingeniero lo pidió
                      así: «que los detalles se puedan apreciar al momento de
                      seleccionar la línea y no escoger celdas». Al abrir, el foco
                      YA es la línea; este botón solo hace falta para VOLVER a
                      ella después de haber mirado otra celda — y aparece solo en
                      ese caso, porque un botón que no hace nada estorba. */}
                  {clic && recorrido && (
                    <p className="mapa-capas-n">
                      <button type="button" className="boton chico"
                        onClick={() => setClic(null)}>
                        ← Volver a {recorrido.codigo}
                      </button>
                    </p>
                  )}
                  {/* ⚠️ EL VALOR DE **ESTA HORA**, y no es un adorno: es lo que
                      convierte el deslizador en un instrumento. Sin él se mueve
                      la hora, el mapa se repinta y el panel no dice cuánto marca
                      la celda — que es justo lo que se estaba mirando. Se perdió
                      al migrar (`§ADR-069`) y el Ingeniero lo echó en falta con
                      estas palabras: «se podía apreciar por día el hora a hora
                      del comportamiento de cada parámetro». */}
                  <p className="mapa-capas-n">
                    A las <b>{String(hora).padStart(2, '0')}:00</b>:{' '}
                    {delDia.perfil.horas[hora] === null || delDia.perfil.horas[hora] === undefined
                      ? <b>no se midió esta hora</b>
                      // Un conteo no lleva decimales: «1.042,0 rayos» no existe.
                      : <b>{nf(delDia.perfil.horas[hora]!, atlas === 'rayos' ? 0 : 1)} {ficha.unidad}</b>}
                  </p>
                  <ElDiaEntero perfil={delDia.perfil} ficha={ficha} cual={atlas} hora={hora}
                    delMes={delDia.delMes} mesNombre={MESES[+mes.clave]} />
                </>
              )}
              {tiempo && recorrido && (
                <PanelPronostico p={tiempo} eje={recorrido.eje}
                  celda={celdaDeConsulta(recorrido.lat, recorrido.lon)}
                  vientoHipotesis_kmh={undefined} />
              )}
              {falloTiempo && <p className="mapa-capas-n alerta">{falloTiempo}</p>}
              {!celdaEnFoco && banda === 'horas' && (
                <p className="mapa-capas-n aviso">
                  {delRecorrido && delRecorrido.celdas.length > 1 ? (
                    <><b>El recorrido de {recorrido?.codigo} cruza {delRecorrido.celdas.length} celdas</b>
                      {' '}—comprobado sobre sus {delRecorrido.puntos} coordenadas—, así que ninguna
                      lo representa entero. <b>Pulse la celda que le interese</b> para ver su día
                      hora a hora, su escala y su mes.</>
                  ) : (
                    <><b>Pulse una celda del mapa</b> para ver su día entero: las 24 horas, la escala
                      en palabras y cuántos días del mes cruzaron el tope.</>
                  )}
                </p>
              )}

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
