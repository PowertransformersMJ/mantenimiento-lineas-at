// ============================================================================
// componentes/CapasDelCorredor.tsx — las dos capas FINAS, sobre el mapa del atlas
// ----------------------------------------------------------------------------
// QUÉ ES (`99 §ADR-087`). El subsistema entero de «Radiación solar» y
// «Temperatura ambiente» del corredor: su interruptor, su rejilla, su clic, sus
// dos leyendas y el techo de zoom que necesitan. Vivía pegado al mapa de la
// LÍNEA (`componentes/Mapa.tsx`) y se mudó aquí por orden del Ingeniero: el
// clima vive en la pantalla del ATLAS y Detalle GPS se queda con el recorrido.
//
// ⚠️ SE MUDÓ, NO SE COPIÓ. En el mapa de la línea no queda ni el interruptor ni
// la leyenda ni el efecto: `«que aparezca en X» = MIGRAR, no duplicar`. Dos
// dueños del mismo dibujo es el patrón que más caro ha salido aquí
// (`30 · M-01`, `34 · L-65`).
//
// POR QUÉ ES UN COMPONENTE Y NO OTRO ATLAS. Razón entera en `vistas/corredor.ts`:
// van por MES y no por día y hora, miden 2 km y no 111 km, y son un PROMEDIO DE
// MUCHOS AÑOS y no una medición fechada. Es otro subsistema sobre el mismo mapa.
//
// CÓMO CONVIVE CON EL ATLAS DE LA REGIÓN, y no es cosmética:
//
//   1. **Se apaga el atlas mientras ésta está puesta.** Son dos rampas de color
//      sobre el mismo territorio; superpuestas no se lee ninguna de las dos y el
//      clic no sabría a cuál contesta. Lo decide el atlas, que es el dueño de su
//      capa: aquí solo se avisa de que hay una encendida.
//   2. **El mapa se va al recorte del corredor al encenderla.** No es comodidad:
//      a la escala de siete departamentos, 30 km se leen como un punto y la
//      conclusión sería que la capa no funciona (`99 §ADR-042`).
//   3. **Sube el techo de zoom mientras dura.** El atlas lo tiene en 9,5 porque
//      su celda mide 111 km; ésta mide 2 km. El número lo deriva
//      `techoDelCorredor` de los dos topes reales — el del dato y el del mapa
//      base—, nunca a mano.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import type * as maplibregl from 'maplibre-gl';
import { esquinas, pintarRejilla, valorEnPunto } from '../vistas/rejilla';
import {
  avisoDeEscala as avisoDeEscalaSol, avisoDeMuestreo, capaElegida, capasOrdenadas,
  oscilacionAnual, NOTA_AMPACIDAD,
  type CapaRadiacion, type FichaRadiacion,
} from '../vistas/radiacion';
import {
  avisoDeEscala, avisoDeMuestreo as avisoDeMuestreoTemp, capaElegida as capaElegidaTemp,
  capasOrdenadas as capasOrdenadasTemp, contraLaEds, oscilacionEstacional, NOTA_HIPOTESIS,
  type FichaTemperatura,
} from '../vistas/temperatura';
import {
  AVISO_PROMEDIO, CORREDOR, CORREDOR_EN_ORDEN, declaraSuNaturaleza, ID_CAPA_CORREDOR,
  NATURALEZA_CORREDOR, NOTA_ENCUADRE_ATLAS, SIN_NATURALEZA, TECHO_DEL_ATLAS, techoDelCorredor,
  type ClaveCorredor,
} from '../vistas/corredor';

/** La ficha de la capa que esté encendida. Las dos comparten la mecánica. */
export type FichaCorredor = (FichaRadiacion | FichaTemperatura) & { naturaleza?: string };

/**
 * La rejilla de un mes, leída del PNG a bytes crudos.
 *
 * El archivo es una imagen en gris donde cada píxel ES el valor codificado, no
 * un color: se dibuja en un lienzo y se recoge un solo canal. Se comprueba que
 * el tamaño sea el que declara la ficha — un PNG que no cuadra con la ficha
 * desplazaría todas las lecturas y nadie lo notaría, porque los colores seguirían
 * saliendo bonitos. (Vino tal cual desde el mapa de la línea: la guarda es la
 * razón de que esta función exista y no se reuse la del atlas, que no la tiene.)
 */
async function leerRejilla(url: string, ficha: FichaCorredor): Promise<Uint8Array> {
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

/**
 * LLEVAR EL MAPA AL RECORTE DE LA CAPA — **UN SOLO DUEÑO**.
 *
 * ⚠️ Existe como función y no en línea porque hay DOS sitios que lo piden: el
 * efecto que lo hace solo al encenderla, y el botón que lo repite después de
 * haber mirado otra cosa. Escrito dos veces, un día encuadran distinto — y ese
 * hueco ya se pagó una vez, cuando el botón vivía dentro de la leyenda de
 * temperatura y a la del sol nunca se le pasó. Hay una prueba que lo vigila.
 */
function irAlRecorte(m: maplibregl.Map, bbox: [number, number, number, number]) {
  const [x0, y0, x1, y1] = bbox;
  m.fitBounds([[x0, y0], [x1, y1]], { padding: 24, duration: 700 });
}

/** Y volver a los siete departamentos. Es la otra acción, no la misma con otro número. */
function irALaRegion(m: maplibregl.Map, bbox: [number, number, number, number]) {
  m.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 12, duration: 700 });
}

export function CapasDelCorredor({
  mapa, listo, zMaxDelFondo, volverA, puesta, alPoner, edsHipotesis_C, inicial = null,
}: {
  /** El mapa del atlas. Este componente NO crea mapas: se cuelga del que hay. */
  mapa: maplibregl.Map | null;
  /** Si el mapa ya cargó su estilo. Antes de eso no se le pueden añadir capas. */
  listo: boolean;
  /** Hasta dónde publica teselas el mapa base. Sale del `.pmtiles`, no de aquí. */
  zMaxDelFondo: number | null;
  /** El recuadro del atlas, para volver a la región al apagarla. */
  volverA: [number, number, number, number] | null;
  /**
   * Cuál está puesta. El estado vive ARRIBA, en el atlas, y no aquí: el atlas
   * necesita saberlo para apagar su propia capa y para que su clic se calle.
   * Un estado con dos copias es un estado que se desincroniza (`30 · M-01`).
   */
  puesta: ClaveCorredor | null;
  alPoner: (cual: ClaveCorredor | null) => void;
  /** La EDS de la hipótesis, para poder comparar. Sin ella no se compara nada. */
  edsHipotesis_C?: number | null;
  /** Con cuál abrir. Solo lo usa el banco de pruebas, para poder fotografiarla. */
  inicial?: ClaveCorredor | null;
}) {
  const [ficha, setFicha] = useState<FichaCorredor | null>(null);
  const [mes, setMes] = useState<string | null>(null);
  const [bajando, setBajando] = useState(false);
  const [rejillaLista, setRejillaLista] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [valorClic, setValorClic] = useState<{ c: number | null; lon: number; lat: number } | null>(null);
  const rejilla = useRef<Uint8Array | null>(null);
  const pincel = useRef<HTMLCanvasElement | null>(null);

  /**
   * ABRIR YA PUESTA, por la dirección. Solo el banco lo usa, y no es un lujo:
   * un Chrome sin cabeza abre una dirección pero no sabe pulsar una casilla, y
   * `§ADR-071` dejó escrito que **no se publica dibujo de mapa que no se pueda
   * mirar**. Sin esto, estas dos capas volverían a ser dibujo que nadie mira.
   */
  const yaArrancada = useRef(false);
  useEffect(() => {
    if (yaArrancada.current || !inicial) return;
    yaArrancada.current = true;
    alPoner(inicial);
  }, [inicial, alPoner]);

  // ── La capa: ficha, rejilla del mes y pintado ─────────────────────────────
  //
  // Tres pasos que no se pueden saltar y por eso van juntos: se lee la ficha
  // (una vez), se baja la rejilla del mes elegido, y se pinta con la rampa de la
  // PROPIA ficha. El resultado se coloca por sus cuatro esquinas: la rejilla se
  // construyó en Web Mercator justo para que encaje sin reproyectar nada.
  useEffect(() => {
    const m = mapa;
    if (!m || !listo) return;
    if (!puesta) {
      if (m.getLayer(ID_CAPA_CORREDOR)) m.setLayoutProperty(ID_CAPA_CORREDOR, 'visibility', 'none');
      return;
    }
    const cfg = CORREDOR[puesta];
    let cancelado = false;

    const pintar = async () => {
      try {
        // La ficha es de UNA capa: si se cambió, la que hay en memoria es la de
        // la otra y hay que volver a pedirla. Reusarla pintaría la rampa del sol
        // sobre los grados del aire, sin un solo error.
        let f = ficha?.capa === puesta ? ficha : null;
        if (!f) {
          const r = await fetch(cfg.ficha);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          f = await r.json() as FichaCorredor;
          if (cancelado) return;
          // ⚠️ SE COMPRUEBA ANTES DE PINTAR NADA (`§ADR-086/087`). Sin esto, una
          // ficha reconstruida sin la palabra se pintaría igual de bonita y se
          // leería como la medición de ayer.
          if (!declaraSuNaturaleza(f)) throw new Error(SIN_NATURALEZA);
          setFicha(f);
        }
        const capa = capaElegida(f as FichaRadiacion, mes);
        if (!capa) throw new Error('la ficha no trae ni una capa');
        if (!mes) setMes(capa.clave);

        // ⚠️ La marca lleva QUÉ CAPA además del mes. Con solo el mes, pasar de
        // radiación a temperatura en el mismo mes se saltaría el repintado —la
        // clave no habría cambiado— y se quedaría en pantalla la capa anterior
        // con la leyenda de la nueva.
        const marca = `${puesta}:${capa.clave}`;
        if (rejillaLista !== marca) {
          setBajando(true);
          const bytes = await leerRejilla(`/mapas/${capa.archivo}`, f);
          if (cancelado) return;
          rejilla.current = bytes;
          // ⚠️ EL LIENZO SE ENTREGA TAL CUAL, no como PNG. Codificar la rejilla a
          // PNG y pasarla en base64 tardaba SEGUNDOS en los que no pasaba nada
          // visible — y un botón que tarda cinco segundos sin decir nada se lee
          // como un botón roto. MapLibre lee el lienzo directamente.
          const lienzo = pincel.current ?? document.createElement('canvas');
          pincel.current = lienzo;
          lienzo.width = f.ancho;
          lienzo.height = f.alto;
          const ctx = lienzo.getContext('2d')!;
          const datos = ctx.createImageData(f.ancho, f.alto);
          datos.data.set(pintarRejilla(bytes, f));
          ctx.putImageData(datos, 0, 0);
          if (cancelado) return;

          const coords = esquinas(f) as [[number, number], [number, number], [number, number], [number, number]];
          const fuente = m.getSource(ID_CAPA_CORREDOR) as maplibregl.CanvasSource | undefined;
          if (fuente) {
            fuente.setCoordinates(coords);
            (fuente as unknown as { play?: () => void; pause?: () => void }).play?.();
            (fuente as unknown as { play?: () => void; pause?: () => void }).pause?.();
            m.setPaintProperty(ID_CAPA_CORREDOR, 'raster-opacity', cfg.opacidad);
          } else {
            // ⚠️ Una fuente de lienzo NO admite atribución en MapLibre, así que
            // el deber de la licencia lo cumple la leyenda, que la imprime al pie
            // y solo mientras la capa está puesta.
            m.addSource(ID_CAPA_CORREDOR, {
              type: 'canvas', canvas: lienzo, coordinates: coords, animate: false,
            });
            m.addLayer({
              id: ID_CAPA_CORREDOR, type: 'raster', source: ID_CAPA_CORREDOR,
              // `linear` explícito: al acercarse la medida se INTERPOLA en vez de
              // romperse en cuadros. No inventa detalle —la celda sigue siendo de
              // 2 km— pero deja de parecer un fallo de la imagen. (Justo al revés
              // que el atlas de la región, que va a `nearest` a propósito: allí
              // los cuadros SON la medida y suavizarlos sería dibujar un
              // degradado que nadie midió.)
              paint: { 'raster-opacity': cfg.opacidad, 'raster-resampling': 'linear' },
              // Debajo de las fronteras: los límites departamentales, sus nombres
              // y el trazado de la línea siguen encima. Si se anclara al final,
              // el resultado dependería del ORDEN de los clics.
            }, m.getLayer('dep-borde') ? 'dep-borde' : undefined);
          }
          setRejillaLista(marca);
          setBajando(false);
        }
        m.setLayoutProperty(ID_CAPA_CORREDOR, 'visibility', 'visible');
        m.triggerRepaint();
      } catch (e) {
        if (cancelado) return;
        console.warn('[corredor]', puesta, e);
        setFallo(cfg.fallo);
        alPoner(null);
        setBajando(false);
      }
    };

    void pintar();
    return () => { cancelado = true; };
    // `alPoner` fuera: es un `setState` del padre y su identidad no debe repintar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puesta, mes, ficha, rejillaLista, mapa, listo]);

  /**
   * EL TECHO DE ZOOM Y EL ENCUADRE, que van juntos porque contestan lo mismo:
   * a qué distancia se puede mirar esto sin mentir.
   *
   * ⚠️ AL ENCENDERLA, EL MAPA SE VA AL RECORTE. Sin esto la capa se enciende y
   * NO PASA NADA VISIBLE: 30 km sobre siete departamentos son cuatro píxeles, y
   * la conclusión —con motivo— es que está rota (`99 §ADR-042`). Al apagarla se
   * vuelve a la región y el techo baja otra vez al del atlas.
   */
  useEffect(() => {
    const m = mapa;
    if (!m || !listo) return;
    if (puesta && ficha?.bbox) {
      const techo = techoDelCorredor(ficha.resolucion_m ?? 0, zMaxDelFondo ?? Infinity);
      m.setMaxZoom(techo);
      irAlRecorte(m, ficha.bbox);
      return;
    }
    // Apagada: primero se vuelve a la región y DESPUÉS baja el techo. Al revés,
    // `setMaxZoom` daría un salto brusco antes de la animación.
    if (volverA) irALaRegion(m, volverA);
    m.setMaxZoom(TECHO_DEL_ATLAS);
    // `ficha` entra porque el recuadro sale de ella; `volverA` no cambia nunca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puesta, ficha, listo, mapa, zMaxDelFondo]);

  /**
   * El clic que dice cuánto marca ESE punto. Solo con la capa encendida — con
   * ella apagada contesta el atlas de la región, y contestar los dos a la vez
   * era exactamente lo que había que evitar.
   */
  useEffect(() => {
    const m = mapa;
    if (!m || !listo || !puesta || !ficha) return;
    const alPulsar = (ev: maplibregl.MapMouseEvent) => {
      const bytes = rejilla.current;
      if (!bytes) return;
      setValorClic({
        c: valorEnPunto(bytes, ficha, ev.lngLat.lng, ev.lngLat.lat),
        lon: ev.lngLat.lng, lat: ev.lngLat.lat,
      });
    };
    m.on('click', alPulsar);
    return () => { m.off('click', alPulsar); };
  }, [puesta, ficha, mapa, listo]);

  /** Volver a mirar toda la región sin apagar la capa. */
  const verLaRegion = useMemo(() => (mapa && volverA
    ? () => irALaRegion(mapa, volverA)
    : undefined), [mapa, volverA]);

  const verElRecorte = useMemo(() => (mapa && ficha?.bbox
    ? () => irAlRecorte(mapa, ficha.bbox)
    : undefined), [mapa, ficha]);

  return (
    <>
      <p className="mapa-capas-t">El corredor, fino</p>
      {/* ⚠️ LO PRIMERO ES QUÉ SON, y va antes de las casillas y no debajo. Estas
          dos capas se ofrecen en la misma pantalla que ocho mediciones fechadas
          y tres pronósticos fechados; sin esta frase, un promedio de treinta
          años se lee como «así está hoy». Es `30 · L-68` aplicado antes de que
          muerda, no después. */}
      <p className="mapa-capas-n aviso">
        Celdas de <b>2 km</b> sobre el corredor —el atlas de arriba mide 111 km—.{' '}
        <b>{AVISO_PROMEDIO}</b>
      </p>
      {/* Las dos son EXCLUYENTES: encender una apaga la otra. No es un capricho
          de interfaz —son dos rampas de color sobre el mismo territorio, y
          superpuestas no se lee ninguna—. Se usan casillas y no un desplegable
          para que se vea de un vistazo qué hay disponible. */}
      {CORREDOR_EN_ORDEN.map((k) => (
        <label key={k}>
          <input type="checkbox" checked={puesta === k}
            onChange={(e) => {
              alPoner(e.target.checked ? k : null);
              setValorClic(null);
              setMes(null);
              setFallo(null);
            }} /> {CORREDOR[k].rotulo}
          {puesta === k && bajando && <span className="mapa-capas-f">midiendo…</span>}
        </label>
      ))}
      {fallo && <p className="mapa-capas-n alerta">{fallo}</p>}

      {puesta === 'radiacion' && ficha?.capa === 'radiacion' && (
        <LeyendaRadiacion ficha={ficha as FichaRadiacion} mes={mes} alElegirMes={(c) => {
          setMes(c); setValorClic(null);
        }} valor={valorClic} cargando={bajando}
          alEncuadrar={verElRecorte} alVerLaRegion={verLaRegion} />
      )}
      {puesta === 'temperatura' && ficha?.capa === 'temperatura' && (
        <LeyendaTemperatura ficha={ficha as FichaTemperatura} mes={mes} alElegirMes={(c) => {
          setMes(c); setValorClic(null);
        }} valor={valorClic} cargando={bajando}
          edsHipotesis_C={edsHipotesis_C}
          alEncuadrar={verElRecorte} alVerLaRegion={verLaRegion} />
      )}
    </>
  );
}

/**
 * EL RECURSO SOLAR DEL CORREDOR, dicho para quien va a firmar un cálculo.
 *
 * La frase de la ampacidad no es un descargo genérico: nombra la magnitud que sí
 * entra en el cálculo de esta aplicación (1.000 W/m² adoptados) y dice por qué
 * este mapa no la sustituye. Sin ella, poner una cifra de sol al lado de una
 * línea invita exactamente a la conversión que no se puede hacer.
 */
function LeyendaRadiacion({ ficha, mes, alElegirMes, valor, cargando, alEncuadrar, alVerLaRegion }: {
  ficha: FichaRadiacion;
  mes: string | null;
  alElegirMes: (clave: string) => void;
  valor: { c: number | null; lon: number; lat: number } | null;
  cargando: boolean;
  /** Lleva el mapa al recorte entero. Sin esto la capa se ve de un color. */
  alEncuadrar?: () => void;
  /** Y devuelve a los siete departamentos sin tener que apagarla. */
  alVerLaRegion?: () => void;
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
  const escala = avisoDeEscalaSol(ficha, actual);
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

      <Encuadres alEncuadrar={alEncuadrar} alVerLaRegion={alVerLaRegion} />

      <div className="mapa-leyenda-barra" style={{ background: `linear-gradient(90deg, ${gradiente})` }} />
      <div className="mapa-leyenda-esc">
        <span>{min} {u}</span><span>{max}</span>
      </div>
      {escala && <p className="mapa-capas-n">{escala}</p>}

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
      <PieDeLaCapa ficha={ficha} />
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
 *      ⚠️ Y por eso la hipótesis VIAJÓ con la capa hasta el atlas: dejarla atrás
 *      habría sido migrar el dibujo y perder la razón de mirarlo.
 */
function LeyendaTemperatura({
  ficha, mes, alElegirMes, valor, cargando, edsHipotesis_C, alEncuadrar, alVerLaRegion,
}: {
  ficha: FichaTemperatura;
  mes: string | null;
  alElegirMes: (clave: string) => void;
  valor: { c: number | null; lon: number; lat: number } | null;
  cargando: boolean;
  edsHipotesis_C?: number | null;
  alEncuadrar?: () => void;
  alVerLaRegion?: () => void;
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

      <Encuadres alEncuadrar={alEncuadrar} alVerLaRegion={alVerLaRegion} />

      <div className="mapa-leyenda-barra" style={{ background: `linear-gradient(90deg, ${gradiente})` }} />
      <div className="mapa-leyenda-esc">
        <span>{min} {u}</span><span>{max}</span>
      </div>
      {escala && <p className="mapa-capas-n">{escala}</p>}

      <p className="mapa-capas-n">
        {actual.rotulo}: mediana <b>{actual.resumen.p50.toFixed(1)} {u}</b> · de{' '}
        {actual.resumen.min.toFixed(1)} a {actual.resumen.max.toFixed(1)} dentro del recorte.
      </p>

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

      {/* La comparación con lo que el cálculo da por bueno. No dictamina: pone
          las dos cifras juntas, que es lo que nadie había hecho. */}
      {contra && <p className="mapa-capas-n">{contra.frase}</p>}

      <p className="mapa-capas-n aviso">{NOTA_HIPOTESIS}</p>
      {muestreo && <p className="mapa-capas-n">{muestreo}</p>}
      <PieDeLaCapa ficha={ficha} />
    </div>
  );
}

/**
 * LOS DOS ENCUADRES, en un solo sitio y para las dos leyendas.
 *
 * Nació de un hueco real: el botón de «Ver todo el recorte» vivía dentro de la
 * leyenda de temperatura y a la del sol nunca se le pasó. Una acción con dos
 * dueños es una acción que un día hace dos cosas distintas (`30 · M-01`).
 */
function Encuadres({ alEncuadrar, alVerLaRegion }: {
  alEncuadrar?: () => void; alVerLaRegion?: () => void;
}) {
  if (!alEncuadrar && !alVerLaRegion) return null;
  return (
    <>
      <div className="acciones">
        {alEncuadrar && (
          <button type="button" className="boton chico" onClick={alEncuadrar}>
            Ver todo el recorte
          </button>
        )}
        {alVerLaRegion && (
          <button type="button" className="boton chico" onClick={alVerLaRegion}>
            Ver toda la región
          </button>
        )}
      </div>
      <p className="mapa-capas-n">{NOTA_ENCUADRE_ATLAS}</p>
    </>
  );
}

/**
 * EL PIE: de qué habla, de cuándo y de quién.
 *
 * ⚠️ EL «DE CUÁNDO» ES LA PARTE QUE NO PUEDE FALTAR y es distinta de la del
 * atlas: aquí no hay fecha que dar, y decirlo así —con el período que declara la
 * PROPIA ficha— es lo que evita que se lea como la medición de ayer.
 */
function PieDeLaCapa({ ficha }: { ficha: FichaCorredor }) {
  return (
    <p className="mapa-capas-n">
      {ficha.magnitud ?? ficha.titulo} · <b>{ficha.periodo ?? 'promedio de largo plazo'}</b>{' '}
      <span className="fine">(naturaleza: {NATURALEZA_CORREDOR})</span> ·{' '}
      celda de {ficha.resolucion_m ? `${(ficha.resolucion_m / 1000).toFixed(0)} km` : '2 km'} ·{' '}
      {ficha.atribucion}
    </p>
  );
}
