// ============================================================================
// componentes/ClimaDelAnio.tsx — el tiempo de esta línea, en UN solo eje
// ----------------------------------------------------------------------------
// QUÉ ES. Un único selector de fecha para el clima de la línea: desde el 1 de
// enero hasta donde llegue el pronóstico. Se elige un día y la pantalla enseña
// lo que hubo o lo que se espera, **diciendo siempre de dónde sale**.
//
// POR QUÉ CAMBIÓ (`99 §ADR-058`). Nació como «el clima del año» (`§ADR-056`),
// una capa aparte de la del pronóstico. Funcionaba, pero obligaba al Ingeniero a
// saber de antemano qué casilla encender según hacia dónde quisiera mirar — y
// ésa es una pregunta de fontanería, no de mantenimiento. Él lo pidió otra vez
// con otras palabras («poder escoger los días, desde inicio de año hasta la
// fecha»), que es exactamente la señal de que el mando estaba partido.
//
// ⚠️ LO ÚNICO QUE ESTA PANTALLA NO PUEDE HACER: **borrar la diferencia entre lo
// que se MIDIÓ y lo que un modelo CREE**. Bajo un mismo selector los dos números
// se parecen y valen cosas distintas. Por eso la CINTA DE PROCEDENCIA no es
// decoración ni se puede quitar «para ganar sitio»: es la pieza que sostiene la
// doctrina de la casa —el veredicto sale del valor contra la norma, y un número
// sin procedencia es una opinión con uniforme—. Quién decide qué es cada día lo
// resuelve `vistas/lineaDeTiempo.ts`, que está probado aparte.
//
// ⚠️ POR QUÉ ESTO NO PINTA UN CAMPO DE COLORES, Y SIGUE SIENDO LA DECISIÓN
// CENTRAL. El atlas mide en celdas de 1° (unos 111 km) y el corredor de LN-627
// entra entero en una: pintar la rejilla daría un rectángulo plano de lado a
// lado —la capa que no se puede APRECIAR que cerró `§ADR-046`— y un degradado
// sugeriría que un extremo de la línea tuvo otro tiempo que el otro, cosa que
// nadie midió. Se dibuja LA celda y se publica SU número.
//
// ⚠️ PESA POCO. No trae el mapa base regional (`caribe.pmtiles`, 5 MiB): el mapa
// base es el de la línea, que ya está. Solo baja la ficha del atlas (~14 KB) y
// el PNG del mes que se mire (~18 KB), y solo al encender la capa.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  celdasDelRecorrido, cuadroDe, diasDelMesSobre, isoDe, perfilEnCelda, resumenDelDia,
  type FichaAtlas,
} from '../vistas/atlasCaribe';
import {
  diasDelMesConRegimen, extremos, sumarDias, tramoDe, type AlcanceDelAtlas,
} from '../vistas/lineaDeTiempo';
import { celdaDe, colorDeValor, valorDeByte } from '../vistas/rejilla';
// ⚠️ Del CATÁLOGO, no del componente del atlas (`§ADR-068`): este panel es
// perezoso y aquél también, y tirar de él arrastraba una pantalla entera.
import { ATLAS, ATLAS_EN_ORDEN, type ClaveAtlas } from '../vistas/atlasCatalogo';
import { eltiempoEnCastellano, type DiaPronostico } from '../vistas/pronostico';
import { ATRIBUCION_PRONOSTICO } from '../datos/pronostico';
import { nf } from '../vistas/formato';
import { CINTA, ElDiaEntero, topeDe } from './PanelDelClima';

const MESES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Los bytes de un PNG, leídos por el lienzo. Mismo lector que el atlas. */
async function leerPng(url: string): Promise<Uint8Array> {
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
  for (let i = 0; i < px.length; i++) px[i] = rgba[i * 4];
  return px;
}

/** Lo que este panel le entrega al mapa para que dibuje la celda. */
export interface CeldaDelAnio {
  /** Los cuatro vértices de la celda de 1° que contiene a la línea. */
  limites: [number, number, number, number];
  /** `rgb(r,g,b)` del valor de esa celda en el instante elegido, o `null` si no se midió. */
  color: string | null;
}


export function ClimaDelAnio({ lon, lat, alDibujarCelda, puntos = [], hoy, dias = [] }: {
  /** Un punto de la línea. Con él se resuelve QUÉ celda del atlas le toca. */
  lon: number;
  lat: number;
  /**
   * Le dice al mapa qué celda dibujar y de qué color. `null` la borra.
   *
   * El panel no toca el mapa: se lo describe. Así esta pieza se puede probar sin
   * MapLibre y el mapa sigue siendo el único dueño de lo que pinta.
   */
  alDibujarCelda: (celda: CeldaDelAnio | null) => void;
  /**
   * TODAS las coordenadas de la línea, de punta a punta (`§ADR-064`).
   *
   * No es lo mismo que `lon`/`lat`: aquéllas son el punto por el que se
   * PREGUNTA; éstas sirven para COMPROBAR que el recorrido entero cabe en la
   * celda que se responde, en vez de darlo por hecho.
   */
  puntos?: readonly { lat: number; lon: number }[];
  /** El día de hoy en el reloj del activo. Llega de fuera: aquí no se lee el reloj. */
  hoy: string;
  /** Los días que el pronóstico trajo de verdad. Vacío si aún no ha llegado. */
  dias?: readonly DiaPronostico[];
}) {
  const [cual, setCual] = useState<ClaveAtlas>('temperatura');
  const [ficha, setFicha] = useState<FichaAtlas | null>(null);
  const [bytes, setBytes] = useState<{ mes: string; px: Uint8Array } | null>(null);
  const [fecha, setFecha] = useState<string>(hoy);
  const [hora, setHora] = useState(12);
  const [fallo, setFallo] = useState<string | null>(null);
  const montado = useRef(true);

  useEffect(() => () => { montado.current = false; }, []);

  // ── La ficha del atlas elegido ────────────────────────────────────────────
  useEffect(() => {
    let cancelado = false;
    setFicha(null); setBytes(null); setFallo(null);
    void (async () => {
      try {
        const r = await fetch(ATLAS[cual].ficha);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const f = await r.json() as FichaAtlas;
        if (cancelado || !montado.current) return;
        setFicha(f);
      } catch (e) {
        if (!cancelado && montado.current) setFallo((e as Error).message);
      }
    })();
    return () => { cancelado = true; };
  }, [cual]);

  const alcance: AlcanceDelAtlas | null = useMemo(() => (ficha ? {
    primerDia: isoDe(ficha.anio, '01', 1),
    ultimoDiaConHoras: ficha.ultimoDiaConHoras,
    ultimoDiaConTotal: ficha.ultimoDiaConTotal,
  } : null), [ficha]);

  const isosPronostico = useMemo(() => dias.map((d) => d.dia), [dias]);
  const limites = useMemo(
    () => extremos(alcance, hoy, isosPronostico), [alcance, hoy, isosPronostico]);
  const tramo = useMemo(
    () => tramoDe(fecha, alcance, hoy, isosPronostico), [fecha, alcance, hoy, isosPronostico]);

  const [anio, mes, dia] = useMemo(() => fecha.split('-').map(Number), [fecha]);
  const mesClave = useMemo(() => String(mes).padStart(2, '0'), [mes]);

  /**
   * El PNG del mes de la fecha elegida, si ese mes tiene reparto por horas.
   *
   * ⚠️ SE COMPRUEBA EL AÑO, y no es paranoia: los meses del archivo se llaman
   * `01`…`12` sin año, así que una fecha de OTRO año encontraría el PNG del mes
   * homónimo y enseñaría enero de este año creyendo leer enero del pasado. Hoy
   * el eje no deja llegar ahí —`tramoDe` lo declara «fuera» y el selector tiene
   * tope—, pero un archivo con dos años dentro convertiría ese detalle en un
   * número falso y creíble, que es la peor clase (`32 · L-69`).
   */
  const pngDelMes = useMemo(
    () => (ficha && anio === ficha.anio
      ? ficha.meses.find((m) => m.clave === mesClave) ?? null
      : null), [ficha, anio, mesClave]);

  // ── El mes elegido ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ficha || !pngDelMes) { setBytes(null); return; }
    let cancelado = false;
    void (async () => {
      try {
        const px = await leerPng(`/mapas/${pngDelMes.archivo}`);
        if (cancelado || !montado.current) return;
        // Etiquetados con su mes: entre que se elige uno y llega su PNG, los
        // bytes en memoria son los del anterior. Es el fallo del «mes rancio»
        // que ya costó una auditoría adversarial en el atlas (`99 §ADR-045`).
        setBytes({ mes: pngDelMes.clave, px });
      } catch (e) {
        if (!cancelado && montado.current) setFallo((e as Error).message);
      }
    })();
    return () => { cancelado = true; };
  }, [ficha, pngDelMes]);

  // ── El valor EN LA CELDA DE LA LÍNEA ──────────────────────────────────────
  const lectura = useMemo(() => {
    if (tramo.regimen !== 'medido_horas') return null;
    if (!ficha || !pngDelMes || !bytes || bytes.mes !== mesClave) return null;
    const cuadro = cuadroDe(bytes.px, ficha, pngDelMes, dia, hora);
    if (!cuadro) return null;
    const celda = celdaDe(lon, lat, ficha);
    if (!celda) return null;
    const byte = cuadro[celda.iy * ficha.ancho + celda.ix];
    return { valor: valorDeByte(byte, ficha.codificacion), celda };
  }, [tramo.regimen, ficha, pngDelMes, bytes, mesClave, dia, hora, lon, lat]);

  /**
   * EL DÍA ENTERO en la celda de la línea. Mismas guardas que la lectura de
   * arriba: si los bytes en memoria no son los del mes que se está mirando, no
   * se enseña un perfil del mes anterior con la fecha de éste.
   */
  const perfil = useMemo(() => {
    if (tramo.regimen !== 'medido_horas') return null;
    if (!ficha || !pngDelMes || !bytes || bytes.mes !== mesClave) return null;
    const celda = celdaDe(lon, lat, ficha);
    if (!celda) return null;
    return perfilEnCelda(bytes.px, ficha, pngDelMes, dia, celda.ix, celda.iy);
  }, [tramo.regimen, ficha, pngDelMes, bytes, mesClave, dia, lon, lat]);

  /**
   * EL MES ENTERO, para planificar: cuántos días cruzaron el tope y cuáles.
   *
   * Sale del MISMO PNG que ya está en memoria — recorrer los 31 días no cuesta
   * ni una descarga más—, y contesta la pregunta que un día suelto no contesta:
   * «¿cuántas jornadas de éstas se pierden en un mes como éste?».
   */
  const delMes = useMemo(() => {
    if (!ficha || !pngDelMes || !bytes || bytes.mes !== mesClave) return null;
    const celda = celdaDe(lon, lat, ficha);
    const tope = topeDe(cual, ficha);
    if (!celda || !tope) return null;
    const r = diasDelMesSobre(bytes.px, ficha, pngDelMes, celda.ix, celda.iy, tope.valor, tope.mide);
    return { ...r, tope };
  }, [ficha, pngDelMes, bytes, mesClave, cual, lon, lat]);

  /** El recorrido completo contra la rejilla de este atlas (`§ADR-064`). */
  const recorrido = useMemo(
    () => (ficha && puntos.length ? celdasDelRecorrido(puntos, ficha, celdaDe) : null),
    [ficha, puntos]);

  // ── Se lo describe al mapa ────────────────────────────────────────────────
  useEffect(() => {
    if (!ficha || !lectura) { alDibujarCelda(null); return; }
    const [oeste, sur] = ficha.bbox;
    const { ix, iy } = lectura.celda;
    // La fila 0 es el NORTE, como en una imagen: por eso el alto se resta.
    const x0 = oeste + ix, y1 = sur + ficha.alto - iy;
    const rgb = lectura.valor === null ? null : colorDeValor(lectura.valor, ficha.rampa);
    alDibujarCelda({
      limites: [x0, y1 - 1, x0 + 1, y1],
      color: rgb ? `rgb(${rgb.join(',')})` : null,
    });
  }, [ficha, lectura, alDibujarCelda]);

  // Al desmontar, la celda se borra: una capa apagada no deja rastro pintado.
  useEffect(() => () => alDibujarCelda(null), [alDibujarCelda]);

  const resumen = ficha ? resumenDelDia(ficha, fecha) : null;
  const delPronostico = useMemo(
    () => dias.find((d) => d.dia === fecha) ?? null, [dias, fecha]);

  /** Mueve la fecha sin salirse de los extremos que el eje puede ofrecer. */
  const mover = useCallback((n: number) => setFecha((f) => {
    const siguiente = sumarDias(f, n);
    if (siguiente < limites.primera || siguiente > limites.ultima) return f;
    return siguiente;
  }), [limites]);

  const cuadricula = useMemo(
    () => diasDelMesConRegimen(anio, mes, alcance, hoy, isosPronostico),
    [anio, mes, alcance, hoy, isosPronostico]);

  /** «19 de agosto». Corto, para que quepa dentro de un botón del panel. */
  const enPalabras = (iso: string) => new Date(`${iso}T12:00:00Z`)
    .toLocaleDateString('es-CO', { day: 'numeric', month: 'long', timeZone: 'UTC' });

  const enLetra = useMemo(() => {
    // ⚠️ Se capitaliza AQUÍ y no con `text-transform: capitalize`: esa regla del
    // CSS toca todas las palabras y escribe «Sábado, 22 De Agosto», que en
    // castellano está mal dos veces. Solo la primera letra de la frase.
    const t = new Date(`${fecha}T12:00:00Z`).toLocaleDateString('es-CO',
      { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }, [fecha]);

  if (fallo) {
    return <p className="mapa-capas-n alerta">No se pudo abrir el histórico: {fallo}. El mapa sigue igual.</p>;
  }
  if (!ficha) return <p className="mapa-capas-n">Bajando el histórico…</p>;

  const cinta = CINTA[tramo.regimen];

  return (
    <div className="clima-anio">
      <p className="mapa-capas-t">Qué se mira</p>
      <div className="acciones">
        {ATLAS_EN_ORDEN.map((c) => (
          <button key={c} type="button"
            className={'boton chico' + (c === cual ? ' activo' : '')}
            aria-pressed={c === cual}
            onClick={() => c !== cual && setCual(c)}>
            {ATLAS[c].rotulo}
          </button>
        ))}
      </div>

      {/* ── EL EJE: una sola fecha, del histórico al pronóstico ────────────── */}
      <p className="mapa-capas-t">Fecha</p>
      <div className="eje-fecha">
        <button type="button" className="boton chico" aria-label="Día anterior"
          disabled={fecha <= limites.primera} onClick={() => mover(-1)}>‹</button>
        <input type="date" value={fecha} min={limites.primera} max={limites.ultima}
          aria-label="Fecha que se mira"
          onChange={(e) => { if (e.target.value) setFecha(e.target.value); }} />
        <button type="button" className="boton chico" aria-label="Día siguiente"
          disabled={fecha >= limites.ultima} onClick={() => mover(1)}>›</button>
      </div>
      <p className="mapa-capas-n eje-dia">{enLetra}</p>

      {/* ⚠️ LA CINTA DE PROCEDENCIA. No es decoración: es lo que impide que un
          número medido y uno pronosticado se lean como la misma cosa. */}
      <p className={'eje-cinta ' + cinta.clase}>
        <b>{cinta.rotulo}</b> · {tramo.porque}
      </p>

      {/* ⚠️ EL PUENTE AL DATO MEDIDO (`§ADR-062`), y no es un adorno de
          usabilidad: sin él, todo el desglose del día —las 24 horas, el
          veredicto contra el tope, el mes y la escala— era INVISIBLE para quien
          abriera la capa, porque la capa abre en HOY y hoy es pronóstico. El
          Ingeniero lo dijo con todas las letras: «no me sale en producción». Lo
          que no se encuentra no existe, por muy construido que esté. */}
      {tramo.regimen !== 'medido_horas' && ficha.ultimoDiaConHoras && (
        <p className="mapa-capas-n eje-puente">
          <button type="button" className="boton chico"
            onClick={() => setFecha(ficha.ultimoDiaConHoras)}>
            Ver el último día MEDIDO ({enPalabras(ficha.ultimoDiaConHoras)}) →
          </button>
          <span className="fine">
            {' '}El día hora a hora, el veredicto contra su tope, el mes y la escala completa solo
            existen donde hubo medida.
          </span>
        </p>
      )}

      <div className="sol-dias" aria-label={`Días de ${MESES[mes]}`}>
        {cuadricula.map((d) => (
          <button key={d.dia} type="button"
            className={'sol-dia' + (d.iso === fecha ? ' activo' : '') + ' g-' + d.regimen}
            title={`${d.dia} de ${MESES[mes]} — ${CINTA[d.regimen].rotulo}`}
            onClick={() => setFecha(d.iso)}>{d.dia}</button>
        ))}
      </div>

      {/* ── LO MEDIDO ─────────────────────────────────────────────────────── */}
      {tramo.regimen === 'medido_horas' && (
        <>
          <p className="mapa-capas-t">Hora</p>
          <input type="range" min={0} max={23} value={hora}
            aria-label="Hora del día"
            onChange={(e) => setHora(+e.target.value)} />
          <p className="mapa-capas-n"><b>{String(hora).padStart(2, '0')}:00</b> · hora de Colombia</p>
          <p className="mapa-capas-n">
            En la celda de esta línea:{' '}
            {lectura?.valor == null
              ? <b>no se midió</b>
              : <b>{nf(lectura.valor, 1)} {ficha.unidad}</b>}
          </p>
          {perfil && <ElDiaEntero perfil={perfil} ficha={ficha} cual={cual} hora={hora}
            delMes={delMes} mesNombre={MESES[mes]} />}
        </>
      )}

      {/* ── LO QUE EL MODELO ESPERA ───────────────────────────────────────── */}
      {tramo.regimen === 'pronostico' && (
        delPronostico ? (
          <p className="mapa-capas-n">
            {delPronostico.tempMin_C !== null && delPronostico.tempMax_C !== null && (
              <><b>{nf(delPronostico.tempMin_C, 0)}–{nf(delPronostico.tempMax_C, 0)} °C</b> · </>
            )}
            {eltiempoEnCastellano(delPronostico.simbolo)}
            {delPronostico.vientoMax_kmh !== null
              && <> · viento máx. <b>{nf(delPronostico.vientoMax_kmh, 0)} km/h</b></>}
            {delPronostico.lluvia_mm !== null
              && <> · <b>{nf(delPronostico.lluvia_mm, 1)} mm</b> de lluvia</>}
          </p>
        ) : (
          <p className="mapa-capas-n">El pronóstico de ese día aún no ha llegado.</p>
        )
      )}

      {/* Un día sin nada no se rellena: se dice. El `porque` ya va en la cinta. */}

      {/* ⚠️ ESTE NÚMERO ES DE LA REGIÓN, NO DE LA CELDA, y hay que decirlo con
          todas las letras. Puesto sin esa aclaración al lado del de la celda se
          leía como si fueran lo mismo: el 19 de agosto la celda marcaba 32,5 °C
          a mediodía y debajo ponía «Máxima del día: 29,79 °C» —una máxima menor
          que un valor del propio día—, y eso no confunde: destruye la confianza
          en toda la capa. Va al final, aparte, y rotulado (§ADR-059). */}
      {resumen !== null && tramo.procedencia === 'medido' && (
        <p className="mapa-capas-n fine">
          Para comparar, en toda la REGIÓN (mediana de las celdas, no la de esta línea) —{' '}
          {ficha.resumenDiarioEtiqueta.toLowerCase()}: <b>{nf(resumen, 2)}</b>{' '}
          {ficha.resumenDiarioUnidad}
        </p>
      )}

      {/* ⚠️ EL AVISO QUE NO PUEDE FALTAR. Sin él, el rectángulo de color se lee
          como si el atlas distinguiera un extremo de la línea del otro. */}
      {tramo.procedencia === 'medido' && (
        recorrido && recorrido.celdas.length > 1 ? (
          // ⚠️ EL CASO QUE ANTES NO SE VEÍA. Si el recorrido cruza un borde, el
          // número de arriba es el de UNA celda y los extremos pueden tener otro.
          // Callarlo sería exactamente el fallo que esta comprobación vino a
          // cerrar: una afirmación cómoda dada por buena sin mirar.
          <p className="mapa-capas-n aviso">
            <b>⚠️ Esta línea NO cabe en una sola celda: cruza {recorrido.celdas.length}.</b> El número
            de arriba es el de la celda del punto de referencia; los extremos de la línea caen en
            celdas distintas y pueden tener otro valor. Comprobado sobre las {recorrido.puntos}{' '}
            coordenadas del recorrido.
          </p>
        ) : (
          <p className="mapa-capas-n aviso">
            <b>Una sola celda cubre toda la línea</b>
            {recorrido
              ? <> — comprobado punto por punto: las <b>{recorrido.puntos}</b> coordenadas del
                recorrido, de punta a punta, caen en la misma</>
              : null}. El atlas mide en cuadros de 1° (unos 111 km): por eso se dibuja ESA celda y se
            da SU número, en vez de pintar un degradado que fingiría que un extremo tuvo otro tiempo
            que el otro.
          </p>
        )
      )}
      {recorrido && recorrido.fuera > 0 && (
        <p className="mapa-capas-n aviso">
          <b>{recorrido.fuera} de las {recorrido.puntos} coordenadas caen FUERA del encuadre de este
          atlas.</b> De esos tramos no consta nada aquí.
        </p>
      )}
      {/* El aviso del ATLAS explica qué es su número: fuera de un día medido
          no describe nada de lo que hay en pantalla, y estorba. */}
      {tramo.procedencia === 'medido' && <p className="fine">{ficha.aviso}</p>}
      {tramo.regimen === 'pronostico' && (
        <p className="fine">
          {ATRIBUCION_PRONOSTICO}. <b>No es una medida</b>: es lo que el modelo espera, y no entra
          en ningún cálculo de la línea.
        </p>
      )}
      {/* La procedencia del histórico va SIEMPRE, incluso en un día sin
          publicar: es justo lo que explica por qué ese día está vacío. */}
      <p className="fine">
        Medido: {ficha.fuente} · hasta <b>{ficha.ultimoDiaConHoras}</b> por horas
        {ficha.ultimoDiaConTotal && <> y <b>{ficha.ultimoDiaConTotal}</b> por día</>}. {ficha.atribucion}
      </p>
    </div>
  );
}

