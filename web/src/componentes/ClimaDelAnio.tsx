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
  comoLlovio, cuadroDe, diasDelMesSobre, enTramos, horasSobre, isoDe, perfilEnCelda,
  resumenDelDia, type FichaAtlas, type PerfilDelDia,
} from '../vistas/atlasCaribe';
import {
  diasDelMesConRegimen, extremos, sumarDias, tramoDe,
  type AlcanceDelAtlas, type Regimen,
} from '../vistas/lineaDeTiempo';
import { celdaDe, colorDeValor, valorDeByte } from '../vistas/rejilla';
import { ATLAS, ATLAS_EN_ORDEN, type ClaveAtlas } from './AtlasCaribe';
import { eltiempoEnCastellano, TOPES_AVISO, type DiaPronostico } from '../vistas/pronostico';
import { ATRIBUCION_PRONOSTICO } from '../datos/pronostico';
import { nf } from '../vistas/formato';

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

/**
 * Qué número decide en cada atlas, de quién es y sobre qué se mide (`§ADR-059`).
 *
 * ⚠️ NINGUNO SE INVENTA AQUÍ. Los de sol y temperatura los trae la propia ficha
 * del archivo (`hipotesisMarcadaEnRampa`); los de viento y lluvia son los MISMOS
 * que ya usa el pronóstico (`TOPES_AVISO`). Si mañana el Ingeniero cambia el tope
 * de viento, cambia en los dos sitios a la vez o en ninguno (`34 · L-65`).
 *
 * ⚠️ Y `mide` no es un detalle: en el viento decide el PICO —lo que baja a un
 * liniero de la estructura es la racha, no la media del día— y en la lluvia
 * decide el TOTAL, porque lo que impide llegar al apoyo es el agua acumulada.
 * Confundirlos daría un día de 24 horas a 1 mm por «seco» teniendo 24 mm encima.
 */
function topeDe(cual: ClaveAtlas, ficha: FichaAtlas):
  { valor: number; mide: 'max' | 'total'; de: string } | null {
  if (cual === 'viento') {
    return { valor: TOPES_AVISO.vientoTrabajo_kmh, mide: 'max',
      de: 'Tope de trabajo en altura · criterio adoptado, sin norma citada. El mismo del pronóstico.' };
  }
  if (cual === 'lluvia') {
    return { valor: TOPES_AVISO.lluviaDia_mm, mide: 'total',
      de: 'Tope de acceso · criterio adoptado, sin norma citada. El mismo del pronóstico.' };
  }
  if (ficha.hipotesisMarcadaEnRampa === undefined) return null;
  return { valor: ficha.hipotesisMarcadaEnRampa, mide: 'max',
    de: `Contra ${ficha.etiquetaHipotesis ?? 'la hipótesis declarada'}. Un día medido NO valida `
      + 'ni desmiente una hipótesis: la acerca.' };
}

/** Cómo se rotula cada régimen en la cinta. Corto, porque el panel tiene 240 px. */
const CINTA: Record<Regimen, { rotulo: string; clase: string }> = {
  medido_horas: { rotulo: 'MEDIDO', clase: 'r-medido' },
  medido_solo_total: { rotulo: 'MEDIDO · sin horas', clase: 'r-medido' },
  sin_publicar: { rotulo: 'SIN PUBLICAR', clase: 'r-hueco' },
  pronostico: { rotulo: 'PRONÓSTICO', clase: 'r-modelo' },
  fuera: { rotulo: 'SIN DATO', clase: 'r-hueco' },
};

export function ClimaDelAnio({ lon, lat, alDibujarCelda, hoy, dias = [] }: {
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
        <p className="mapa-capas-n aviso">
          <b>Una sola celda cubre toda la línea.</b> El atlas mide en cuadros de 1° (unos 111 km) y este
          corredor entra entero en uno: por eso se dibuja ESA celda y se da SU número, en vez de pintar
          un degradado que fingiría que un extremo tuvo otro tiempo que el otro.
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

/**
 * EL DÍA ENTERO EN LA CELDA DE LA LÍNEA, y qué se hace con él (`§ADR-059`).
 *
 * POR QUÉ EXISTE. Antes esta capa daba UN número —el de la hora del deslizador—
 * y para saber cómo había sido el día había que mover el deslizador veinticuatro
 * veces y apuntar a mano. Eso no es información para decidir un mantenimiento:
 * es materia prima. Lo que hace falta saber es **cuánto llegó a hacer, a qué
 * hora, y si eso cruza el número con el que trabajamos**.
 *
 * ⚠️ LOS TOPES NO SE INVENTAN AQUÍ, y es lo que impide que esta pantalla se
 * convierta en una opinión: la hipótesis de sol y temperatura la trae la propia
 * ficha del atlas (`hipotesisMarcadaEnRampa`, con su etiqueta), y los topes de
 * trabajo de viento y lluvia son los MISMOS que ya usa el pronóstico
 * (`TOPES_AVISO`). Un solo dueño por criterio: si mañana el Ingeniero cambia el
 * tope de viento, cambia en los dos sitios a la vez o en ninguno (`34 · L-65`).
 *
 * ⚠️ LA ALTURA DE LAS BARRAS ES LA FORMA DEL DÍA, NO EL VALOR ABSOLUTO. Va del
 * mínimo al máximo de ESE día, así que un día plano y templado y un día plano y
 * abrasador dibujan lo mismo. El valor absoluto lo da el COLOR, que usa la misma
 * rampa que el mapa — y los dos extremos van escritos con su número al lado.
 * Escalar desde cero aplastaría contra el suelo toda variación de temperatura,
 * que es justo lo que se quiere ver.
 */
function ElDiaEntero({ perfil, ficha, cual, hora, delMes, mesNombre }: {
  perfil: PerfilDelDia;
  ficha: FichaAtlas;
  cual: ClaveAtlas;
  hora: number;
  delMes: { dias: number[]; medidos: number; sinDato: number;
    tope: { valor: number; mide: 'max' | 'total'; de: string } } | null;
  mesNombre: string;
}) {
  if (perfil.max === null || perfil.min === null) {
    return <p className="mapa-capas-n aviso">De este día no se midió ni una hora en esta celda.</p>;
  }
  const { min, max } = perfil;
  const recorrido = max - min;
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

  // ── Qué tope rige, y de quién es ──────────────────────────────────────────
  const acumulable = cual === 'lluvia' || cual === 'sol';
  const tope = topeDe(cual, ficha);
  const medido = tope?.mide === 'total' ? perfil.total : perfil.max;
  const cruzado = tope !== null && medido !== null && medido > tope.valor;
  const encima = tope && tope.mide === 'max' ? horasSobre(perfil, tope.valor) : [];
  // Cómo llovió, en palabras: la escala de intensidad de la OMM.
  const grados = cual === 'lluvia' ? comoLlovio(perfil) : [];

  return (
    <div className="dia-entero">
      <p className="mapa-capas-t">El día entero, en esta celda</p>
      <p className="mapa-capas-n">
        {acumulable ? 'Pico de ' : 'Máxima '}
        <b>{nf(max, 1)} {ficha.unidad}{acumulable ? '/h' : ''}</b> a las {hh(perfil.horaMax!)}
        {!acumulable && recorrido > 0
          && <> · mínima <b>{nf(min, 1)}</b> a las {hh(perfil.horaMin!)}</>}
        {acumulable && perfil.total !== null && (
          cual === 'sol'
            ? <> · energía del día <b>{nf(perfil.total / 1000, 2)} kWh/m²</b></>
            : <> · total <b>{nf(perfil.total, 1)} mm</b></>
        )}
      </p>

      {/* Las 24 horas de un vistazo. `title` en cada barra: el número exacto
          está a un puntero de distancia sin ocupar sitio en el panel. */}
      <div className="dia-barras" role="img"
        aria-label={`Las 24 horas del día en esta celda. Máxima ${nf(max, 1)} ${ficha.unidad} a las ${hh(perfil.horaMax!)}.`}>
        {perfil.horas.map((v, h) => {
          if (v === null) {
            return <span key={h} className="dia-barra sin-dato" title={`${hh(h)} — sin medida`} />;
          }
          const alto = recorrido > 0 ? 12 + ((v - min) / recorrido) * 88 : 60;
          const [r, g, b] = colorDeValor(v, ficha.rampa);
          return (
            <span key={h}
              className={'dia-barra' + (h === hora ? ' ahora' : '')}
              title={`${hh(h)} — ${nf(v, 1)} ${ficha.unidad}`}
              style={{ height: `${alto}%`, background: `rgb(${r},${g},${b})` }} />
          );
        })}
      </div>
      <p className="dia-eje fine"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></p>

      {/* ── CÓMO LLOVIÓ, HORA A HORA Y EN PALABRAS ─────────────────────────
          «0,4 mm» no dice si se podía trabajar; «llovizna de 08:00 a 11:59» sí.
          Los cortes son los de la OMM, no de esta casa, y por eso se citan. */}
      {cual === 'lluvia' && (
        grados.length ? (
          <ul className="dia-grados">
            {grados.map((g) => (
              <li key={g.grado.clave} className={'g-' + g.grado.clave}>
                <b>{g.grado.nombre}</b> {enTramos(g.horas)} — {g.grado.paraLaLinea}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mapa-capas-n">Ni una hora con lluvia apreciable en esta celda.</p>
        )
      )}

      {tope && medido !== null && (
        <>
          <p className={'mapa-capas-n' + (cruzado ? ' aviso' : '')}>
            <b>
              {tope.mide === 'total'
                ? `${nf(medido, 1)} ${ficha.unidad} en el día, ${cruzado ? 'POR ENCIMA' : 'por debajo'} `
                  + `de los ${nf(tope.valor, 0)} ${ficha.unidad} del tope.`
                : encima.length
                  ? `Pasó de ${nf(tope.valor, 0)} ${ficha.unidad} ${enTramos(encima)} — `
                    + `${encima.length} h en total.`
                  : `No superó los ${nf(tope.valor, 0)} ${ficha.unidad} en ninguna hora.`}
            </b>
          </p>
          <p className="fine">{tope.de}</p>
        </>
      )}

      {/* ── EL MES, que es la escala en la que se planifica ────────────────── */}
      {delMes && delMes.medidos > 0 && (
        <p className="mapa-capas-n">
          En {mesNombre}: <b>{delMes.dias.length}</b> de {delMes.medidos} días medidos cruzaron ese
          tope{delMes.dias.length ? <> (los días {delMes.dias.join(', ')})</> : null}.
          {delMes.sinDato > 0 && (
            <> Del resto del mes ({delMes.sinDato} {delMes.sinDato === 1 ? 'día' : 'días'})
              todavía no hay medida.</>
          )}
        </p>
      )}
      {perfil.nSinDato > 0 && (
        <p className="fine">
          {perfil.nSinDato} de las 24 horas no traen medida: no cuentan ni como superadas ni como
          no superadas.
        </p>
      )}
    </div>
  );
}
