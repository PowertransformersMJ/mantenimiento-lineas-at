// ============================================================================
// componentes/Horizonte.tsx — la línea dibujada como lo que es: un paisaje
// ----------------------------------------------------------------------------
// LA TESIS. Una línea de alta tensión ES un objeto del paisaje. Este dibujo no
// decora: cada trazo carga un dato real.
//
//   · Los apoyos van en su ORDEN y a su DISTANCIA real (el eje horizontal es
//     la progresiva de la línea, no un reparto cómodo).
//   · El conductor cuelga entre ellos. Los vanos fuera de la banda 0,7-1,3 del
//     vano ideal de regulación se dibujan en terracota — en LN-627 son 14 de 23.
//   · UN APOYO SIN VEREDICTO SE DIBUJA HUECO, con contorno punteado. En LN-627
//     salen los 24: el horizonte es una fila de fantasmas, y ésa es la foto
//     honesta del estado del proyecto.
//
// DE DÓNDE SALE CADA COSA — y de dónde NO:
//   · El veredicto se lee de `utilizacion_pct !== null`, o sea de lo que el
//     NÚCLEO concluyó. **Está prohibido mirar `apoyo.cargaRotura_kgf`**: que un
//     apoyo declare su carga de rotura no significa que se le pueda dictaminar,
//     puede faltarle otra cosa, y quien lo sabe es el motor. Leer el campo sería
//     reimplementar el dictamen en la capa de pintura.
//   · Los vanos y su número CORRIDO salen de `vanosDeLinea`, el mismo dueño que
//     alimenta la tabla «Vano a vano»: el vano 14 del dibujo es el vano 14 de la
//     tabla, siempre.
//
// LO QUE NO ES: el relieve es PLANO y lo dice en pantalla. Las cotas del
// levantamiento son de GPS de mano con ±8 m declarados, y el propio sistema se
// niega a dictaminar con ellas; dibujar un perfil con eso sería inventar una
// montaña. El orden y las distancias sí son reales.
// ============================================================================
import { useMemo } from 'react';
import type { EjesDeLinea } from '../vistas/ejesLinea';
import type { VanosDeLinea } from '../vistas/vanosLinea';

const W = 1200;
const H = 168;
const M_IZQ = 26;
const M_DER = 26;
const SUELO = H - 30;

interface Torre {
  x: number; nombre: string; conVeredicto: boolean; amplifica: boolean;
  factor: number | null; extremo: boolean;
}

export function Horizonte({ ejes, vanos, dictaminados, total }:
  { ejes: EjesDeLinea; vanos: VanosDeLinea | null; dictaminados: number; total: number }) {

  const dibujo = useMemo(() => {
    const filas = ejes.transversal.filas;
    if (filas.length < 2) return null;

    // Veredicto = lo que el núcleo concluyó, en LOS DOS ejes. Nunca los campos.
    const conTrans = new Set(filas.filter((f) => f.utilizacion_pct !== null).map((f) => f.apoyo));
    const conLong = new Set(
      (ejes.longitudinal?.filas ?? []).filter((f) => f.utilizacion_pct !== null).map((f) => f.apoyo));

    // Eje horizontal = progresiva real. Sin vanos medidos, reparto uniforme y
    // se dice: es lo único honesto que se puede hacer con lo que hay.
    const largos = vanos?.filas.map((v) => v.a_m) ?? [];
    const hayDistancias = largos.length === filas.length - 1 && largos.every((a) => a > 0);
    const acumulado: number[] = [0];
    for (let i = 0; i < filas.length - 1; i++) {
      acumulado.push(acumulado[i] + (hayDistancias ? largos[i] : 1));
    }
    const totalX = acumulado[acumulado.length - 1] || 1;
    const util = W - M_IZQ - M_DER;

    const torres: Torre[] = filas.map((f, i) => ({
      x: M_IZQ + (acumulado[i] / totalX) * util,
      nombre: f.apoyo,
      conVeredicto: conTrans.has(f.apoyo) && conLong.has(f.apoyo),
      amplifica: f.amplifica === true,
      factor: f.factorAngulo,
      extremo: f.esExtremo,
    }));

    const tramos = torres.slice(0, -1).map((t, i) => ({
      x1: t.x, x2: torres[i + 1].x,
      n: vanos?.filas[i]?.n ?? i + 1,
      fuera: vanos?.filas[i]?.fueraDeRango === true,
      largo: vanos?.filas[i]?.a_m ?? null,
    }));

    return { torres, tramos, hayDistancias };
  }, [ejes, vanos]);

  if (!dibujo) return null;
  const { torres, tramos, hayDistancias } = dibujo;

  const alto = torres.length > 60 ? 22 : torres.length > 36 ? 27 : 33;
  const anchoBase = Math.max(5, alto * 0.30);
  const cima = SUELO - alto;
  const fueraN = tramos.filter((t) => t.fuera).length;
  const huecas = torres.filter((t) => !t.conVeredicto).length;

  const resumen = `Perfil de la línea: ${torres.length} apoyos en su orden y a su distancia real. `
    + `${huecas} sin veredicto se dibujan huecos. ${fueraN} vanos fuera de la banda del vano ideal.`;

  return (
    <figure className="horizonte">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={resumen} preserveAspectRatio="xMidYMid meet">
        <rect className="hz-suelo" x="0" y={SUELO + 2} width={W} height={H - SUELO - 2} />

        {/* el conductor, colgando vano a vano */}
        {tramos.map((t) => {
          const flecha = Math.min(20, (t.x2 - t.x1) * 0.22);
          return (
            <path
              key={`v${t.n}`}
              className={t.fuera ? 'hz-cable hz-fuera' : 'hz-cable'}
              d={`M${t.x1.toFixed(1)},${cima + 3} Q${((t.x1 + t.x2) / 2).toFixed(1)},${(cima + 3 + flecha).toFixed(1)} ${t.x2.toFixed(1)},${cima + 3}`}
            >
              <title>
                {`Vano ${t.n}${t.largo !== null ? ` · ${t.largo.toFixed(1)} m` : ''}`}
                {t.fuera ? ' · FUERA de la banda 0,7–1,3 del vano ideal' : ''}
              </title>
            </path>
          );
        })}

        {/* los apoyos */}
        {torres.map((t) => {
          const w = anchoBase, wt = w * 0.34;
          const cuerpo = `M${(t.x - w / 2).toFixed(1)},${SUELO} L${(t.x - wt / 2).toFixed(1)},${cima} `
            + `L${(t.x + wt / 2).toFixed(1)},${cima} L${(t.x + w / 2).toFixed(1)},${SUELO} Z`;
          const cls = t.conVeredicto ? 'hz-torre hz-dictaminada' : 'hz-torre hz-hueca';
          return (
            <g key={t.nombre} className={cls}>
              <path d={cuerpo} />
              <line x1={t.x - w * 0.9} y1={cima + alto * 0.14} x2={t.x + w * 0.9} y2={cima + alto * 0.14} />
              <line x1={t.x - w * 0.62} y1={cima + alto * 0.36} x2={t.x + w * 0.62} y2={cima + alto * 0.36} />
              <title>
                {`${t.nombre}${t.extremo ? ' · terminal' : ''}`}
                {t.conVeredicto
                  ? ' · con veredicto en los dos ejes'
                  : ' · SIN VEREDICTO: el motor no puede dictaminarlo con lo que declara el inventario'}
                {t.amplifica && t.factor !== null ? ` · amplifica ×${t.factor.toFixed(3)}` : ''}
              </title>
            </g>
          );
        })}

        {/* los que amplifican llevan su marca en el cielo */}
        {torres.filter((t) => t.amplifica && t.factor !== null && t.factor > 1.4).map((t) => (
          <g key={`a${t.nombre}`} className="hz-amplifica">
            <line x1={t.x} y1={cima - 5} x2={t.x} y2={cima - 17} />
            <text x={t.x} y={cima - 21} textAnchor="middle">{`×${t.factor!.toFixed(2)}`}</text>
          </g>
        ))}
      </svg>

      <figcaption className="hz-pie">
        <span className="hz-leyenda"><i className="hz-sw hz-sw-hueca" />{huecas} sin veredicto</span>
        <span className="hz-leyenda"><i className="hz-sw hz-sw-llena" />{torres.length - huecas} dictaminados</span>
        <span className="hz-leyenda"><i className="hz-sw hz-sw-fuera" />{fueraN} vanos fuera de banda</span>
        <span className="hz-nota">
          {hayDistancias
            ? 'distancias reales · relieve plano: la cota es GPS de mano (±8 m) y no se dibuja'
            : 'reparto uniforme: no hay vanos medidos · relieve plano'}
        </span>
      </figcaption>
      <p className="hz-lectura">
        {dictaminados === 0 && total > 0
          ? `Los ${total} apoyos salen huecos porque ninguno tiene veredicto en los dos ejes. No es un fallo del dibujo: es el estado del inventario.`
          : `${dictaminados} de ${total} apoyos dictaminados en los dos ejes.`}
      </p>
    </figure>
  );
}
