// ============================================================================
// componentes/ClimaDelAnio.tsx — el clima del AÑO, dentro del mapa de la línea
// ----------------------------------------------------------------------------
// QUÉ ES: los cuatro atlas del Caribe —sol, temperatura, viento y lluvia—
// consultables desde el mapa de la propia línea, mes a mes, día a día y hora a
// hora. El Ingeniero lo pidió así: quería el clima del año donde mira la línea,
// no en otra pantalla (`99 §ADR-056`).
//
// ⚠️ POR QUÉ ESTO NO PINTA UN CAMPO DE COLORES, Y ES LA DECISIÓN CENTRAL.
//
// El atlas mide en celdas de 1° (unos 111 km). El corredor de LN-627 ocupa
// 0,29° x 0,38°, así que **UNA sola celda lo cubre entero**: pintar la rejilla
// sobre este mapa daría un rectángulo de color plano de lado a lado. Eso es
// exactamente la capa que no se puede APRECIAR que cerró `§ADR-046`, y peor —
// un degradado inventado sugeriría que un extremo de la línea tuvo otro tiempo
// que el otro, y no hay medida que lo sostenga.
//
// Se resuelve como YA lo resolvió el pronóstico en este mismo mapa
// (`§ADR-035`): **como un dato del SITIO, no como un campo**. Se dibuja la celda
// que le toca a la línea —con su color y su borde, para que se vea de qué trozo
// de mundo hablamos— y se publica EL NÚMERO de esa celda para el instante
// elegido. Un número con su unidad y su fecha vale más que un color que no
// distingue nada.
//
// ⚠️ PESA POCO, y por eso puede vivir aquí. NO trae el mapa base regional
// (`caribe.pmtiles`, 5 MiB): el mapa base es el de la línea, que ya está. Solo
// baja la ficha del atlas (~14 KB) y el PNG del mes que se mire (~18 KB), y solo
// cuando se enciende la capa.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  bandaDelDia, cuadroDe, isoDe, mesesOfrecidos, resumenDelDia,
  type FichaAtlas, type MesOfrecido,
} from '../vistas/atlasCaribe';
import { celdaDe, colorDeValor, valorDeByte } from '../vistas/rejilla';
import { ATLAS, ATLAS_EN_ORDEN, type ClaveAtlas } from './AtlasCaribe';
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

export function ClimaDelAnio({ lon, lat, alDibujarCelda }: {
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
}) {
  const [cual, setCual] = useState<ClaveAtlas>('temperatura');
  const [ficha, setFicha] = useState<FichaAtlas | null>(null);
  const [bytes, setBytes] = useState<{ mes: string; px: Uint8Array } | null>(null);
  const [mesClave, setMesClave] = useState<string | null>(null);
  const [dia, setDia] = useState(1);
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
        // Se abre en el último mes con horas: de un año en curso, lo que
        // interesa es lo más reciente que existe.
        setMesClave(f.meses[f.meses.length - 1]?.clave ?? null);
      } catch (e) {
        if (!cancelado && montado.current) setFallo((e as Error).message);
      }
    })();
    return () => { cancelado = true; };
  }, [cual]);

  const ofrecidos = useMemo(() => (ficha ? mesesOfrecidos(ficha) : []), [ficha]);
  const mes: MesOfrecido | null = useMemo(
    () => ofrecidos.find((m) => m.clave === mesClave) ?? null, [ofrecidos, mesClave]);

  // ── El mes elegido ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ficha || !mes?.png) { setBytes(null); return; }
    let cancelado = false;
    const png = mes.png;
    void (async () => {
      try {
        const px = await leerPng(`/mapas/${png.archivo}`);
        if (cancelado || !montado.current) return;
        // Etiquetados con su mes: entre que se elige uno y llega su PNG, los
        // bytes en memoria son los del anterior. Es el fallo del «mes rancio»
        // que ya costó una auditoría adversarial en el atlas (`99 §ADR-045`).
        setBytes({ mes: mes.clave, px });
        setDia((d) => Math.min(d, mes.dias));
      } catch (e) {
        if (!cancelado && montado.current) setFallo((e as Error).message);
      }
    })();
    return () => { cancelado = true; };
  }, [ficha, mes]);

  // ── El valor EN LA CELDA DE LA LÍNEA ──────────────────────────────────────
  const lectura = useMemo(() => {
    if (!ficha || !mes?.png || !bytes || bytes.mes !== mes.clave) return null;
    const cuadro = cuadroDe(bytes.px, ficha, mes.png, dia, hora);
    if (!cuadro) return null;
    const celda = celdaDe(lon, lat, ficha);
    if (!celda) return null;
    const byte = cuadro[celda.iy * ficha.ancho + celda.ix];
    return { valor: valorDeByte(byte, ficha.codificacion), celda };
  }, [ficha, mes, bytes, dia, hora, lon, lat]);

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

  const iso = ficha && mesClave ? isoDe(ficha.anio, mesClave, dia) : null;
  const banda = ficha && iso ? bandaDelDia(ficha, iso) : null;
  const resumen = ficha && iso ? resumenDelDia(ficha, iso) : null;
  const cambiarMes = useCallback((c: string) => setMesClave(c), []);

  if (fallo) {
    return <p className="mapa-capas-n alerta">No se pudo abrir el clima del año: {fallo}. El mapa sigue igual.</p>;
  }
  if (!ficha || !mes) return <p className="mapa-capas-n">Bajando el clima del año…</p>;

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

      <p className="mapa-capas-t">Mes</p>
      <select value={mesClave ?? ''} onChange={(e) => cambiarMes(e.target.value)}
        aria-label={`Mes de ${ficha.anio}`}>
        {ofrecidos.map((m) => (
          <option key={m.clave} value={m.clave}>
            {MESES[+m.clave]}{m.png ? '' : ' · solo resumen del día'}
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
                : b === 'solo_total' ? 'solo resumen del día' : 'sin dato'}`}
              onClick={() => setDia(d)}>{d}</button>
          );
        })}
      </div>

      <p className="mapa-capas-t">Hora</p>
      <input type="range" min={0} max={23} value={hora} disabled={banda !== 'horas'}
        aria-label="Hora del día"
        onChange={(e) => setHora(+e.target.value)} />
      <p className="mapa-capas-n"><b>{String(hora).padStart(2, '0')}:00</b> · hora de Colombia</p>

      {/* EL NÚMERO, que es lo que de verdad sirve aquí. */}
      {banda === 'horas' && (
        <p className="mapa-capas-n">
          En la celda de esta línea:{' '}
          {lectura?.valor == null
            ? <b>no se midió</b>
            : <b>{nf(lectura.valor, 1)} {ficha.unidad}</b>}
        </p>
      )}
      {banda === 'solo_total' && (
        <p className="mapa-capas-n aviso">
          <b>De este día no hay reparto por horas.</b> Al construir el archivo
          ({ficha.construido.slice(0, 10)}) la fuente llegaba al <b>{ficha.ultimoDiaConHoras}</b>.
        </p>
      )}
      {banda === 'sin_dato' && (
        <p className="mapa-capas-n aviso"><b>De este día no consta nada todavía.</b></p>
      )}
      {resumen !== null && (
        <p className="mapa-capas-n">
          {ficha.resumenDiarioEtiqueta}: <b>{nf(resumen, 2)}</b>{' '}
          <span className="fine">{ficha.resumenDiarioUnidad}</span>
        </p>
      )}

      {/* ⚠️ EL AVISO QUE NO PUEDE FALTAR. Sin él, el rectángulo de color se lee
          como si el atlas distinguiera un extremo de la línea del otro. */}
      <p className="mapa-capas-n aviso">
        <b>Una sola celda cubre toda la línea.</b> El atlas mide en cuadros de 1° (unos 111 km) y este
        corredor entra entero en uno: por eso se dibuja ESA celda y se da SU número, en vez de pintar
        un degradado que fingiría que un extremo tuvo otro tiempo que el otro.
      </p>
      <p className="fine">{ficha.aviso}</p>
      <p className="fine">
        {ficha.fuente} · dato hasta <b>{ficha.ultimoDiaConHoras}</b> por horas
        {ficha.ultimoDiaConTotal && <> y <b>{ficha.ultimoDiaConTotal}</b> por día</>}. {ficha.atribucion}
      </p>
    </div>
  );
}
