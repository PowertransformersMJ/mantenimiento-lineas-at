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
//   · UN APOYO SIN VEREDICTO EN LOS DOS EJES SE DIBUJA HUECO, con contorno
//     punteado. En LN-627 salen los 24: el horizonte es una fila de fantasmas, y
//     ésa es la foto honesta del estado del proyecto.
//
// LOS DOS CARRILES DE ABAJO, Y POR QUÉ EXISTEN (`TODO-53`). La torre tiene DOS
// aspectos y solo dos: rellena cuando las dos preguntas están respondidas, hueca
// cuando falta alguna. Está PROHIBIDO un tercer aspecto —media torre, relleno
// parcial, opacidad intermedia—: se leería como «medio sano», y no existe medio
// sano. Un apoyo con veredicto transversal y sin longitudinal no está a medio
// dictaminar; está dictaminado en una pregunta y sin responder en la otra.
//
// Pero CUÁL de las dos falta sí importa, y antes se perdía. Por eso los dos
// carriles bajo el suelo: una marca por apoyo, alineada con su torre, maciza si
// hay veredicto en ese eje y punteada si falta. Monocromos y sin semáforo: no
// dicen si cumple, dicen si se sabe.
//
// DE DÓNDE SALE CADA COSA — y de dónde NO:
//   · La cobertura la calcula `vistas/coberturaEjes.ts`, su dueño único. **Este
//     componente ya NO cruza nada**: antes hacía `conTrans && conLong` por su
//     cuenta y por eso no distinguía a qué eje le faltaba el dato.
//   · El veredicto se lee de `utilizacion_pct !== null`, o sea de lo que el
//     NÚCLEO concluyó. **Está prohibido mirar `apoyo.cargaRotura_kgf`**: que un
//     apoyo declare su carga de rotura no significa que se le pueda dictaminar,
//     puede faltarle otra cosa, y quien lo sabe es el motor.
//   · Los vanos y su número CORRIDO salen de `vanosDeLinea`, el mismo dueño que
//     alimenta la tabla «Vano a vano»: el vano 14 del dibujo es el vano 14 de la
//     tabla, siempre.
//   · Los textos los redacta `coberturaEjes.ts`, no este archivo: son parte del
//     resultado, y un dibujo de huecos sin la frase que explica de qué son
//     huecos se lee como un fallo del programa.
//
// LO QUE NO ES: el relieve es PLANO y lo dice en pantalla. Las cotas del
// levantamiento son de GPS de mano con ±8 m declarados, y el propio sistema se
// niega a dictaminar con ellas; dibujar un perfil con eso sería inventar una
// montaña. El orden y las distancias sí son reales.
// ============================================================================
import { useMemo } from 'react';
import { nf } from '../vistas/formato';
import type { EjesDeLinea } from '../vistas/ejesLinea';
import { coberturaDeEjes } from '../vistas/ejesLinea';
import { lecturaDeCobertura, resumenAccesible, tituloDeApoyo, tituloDeCarril } from '../vistas/coberturaEjes.ts';
import type { VanosDeLinea } from '../vistas/vanosLinea';

const W = 1200;
const M_IZQ = 26;
const M_DER = 26;
// El suelo y todo lo que hay encima conservan su geometría EXACTA: los carriles
// se añaden debajo, alargando el lienzo. Así el dibujo de siempre no se mueve un
// píxel y no hay regresión que discutir.
const SUELO = 138;
const SUELO_ALTO = 28;
const CARRIL_T = 186;   // marcas del eje transversal
const CARRIL_L = 208;   // marcas del eje longitudinal
const H = 220;

interface Torre {
  x: number; nombre: string; dosEjes: boolean;
  transversal: boolean; longitudinal: boolean;
  titulo: string; extremo: boolean;
  amplifica: boolean; factor: number | null;
}

export function Horizonte({ ejes, vanos, total }:
  { ejes: EjesDeLinea; vanos: VanosDeLinea | null; total: number }) {

  const dibujo = useMemo(() => {
    const filas = ejes.transversal.filas;
    if (filas.length < 2) return null;

    const cob = coberturaDeEjes(ejes);
    const porApoyo = new Map(cob.filas.map((f) => [f.apoyo, f]));

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

    const torres: Torre[] = filas.map((f, i) => {
      const c = porApoyo.get(f.apoyo)!;
      return {
        x: M_IZQ + (acumulado[i] / totalX) * util,
        nombre: f.apoyo,
        dosEjes: c.dosEjes,
        transversal: c.transversal,
        longitudinal: c.longitudinal,
        titulo: tituloDeApoyo(c, {
          terminal: f.esExtremo,
          factorTexto: f.amplifica === true && f.factorAngulo !== null ? nf(f.factorAngulo, 3) : undefined,
        }),
        extremo: f.esExtremo,
        amplifica: f.amplifica === true,
        factor: f.factorAngulo,
      };
    });

    const tramos = torres.slice(0, -1).map((t, i) => ({
      x1: t.x, x2: torres[i + 1].x,
      n: vanos?.filas[i]?.n ?? i + 1,
      fuera: vanos?.filas[i]?.fueraDeRango === true,
      largo: vanos?.filas[i]?.a_m ?? null,
    }));

    return { torres, tramos, hayDistancias, cob };
  }, [ejes, vanos]);

  if (!dibujo) return null;
  const { torres, tramos, hayDistancias, cob } = dibujo;

  const alto = torres.length > 60 ? 22 : torres.length > 36 ? 27 : 33;
  const anchoBase = Math.max(5, alto * 0.30);
  const cima = SUELO - alto;
  const fueraN = tramos.filter((t) => t.fuera).length;
  const huecas = cob.dibujados - cob.ambos;

  const marca = (t: Torre, y: number, hay: boolean, eje: 'transversal' | 'longitudinal') => (
    <rect
      key={`${eje}-${t.nombre}`}
      className={hay ? 'hz-marca hz-marca-si' : 'hz-marca hz-marca-no'}
      x={(t.x - 3).toFixed(1)} y={y - 3} width="6" height="6" rx="1"
    >
      <title>{tituloDeCarril(t.nombre, eje, hay)}</title>
    </rect>
  );

  return (
    <figure className="horizonte">
      <svg
        viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={resumenAccesible(cob, { vanosFuera: fueraN, totalLinea: total })}
        preserveAspectRatio="xMidYMid meet"
      >
        <rect className="hz-suelo" x="0" y={SUELO + 2} width={W} height={SUELO_ALTO} />

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
                {`Vano ${t.n}${t.largo !== null ? ` · ${nf(t.largo, 1)} m` : ''}`}
                {t.fuera ? ' · FUERA de la banda 0,7–1,3 del vano ideal' : ''}
              </title>
            </path>
          );
        })}

        {/* los apoyos — DOS aspectos y solo dos */}
        {torres.map((t) => {
          const w = anchoBase, wt = w * 0.34;
          const cuerpo = `M${(t.x - w / 2).toFixed(1)},${SUELO} L${(t.x - wt / 2).toFixed(1)},${cima} `
            + `L${(t.x + wt / 2).toFixed(1)},${cima} L${(t.x + w / 2).toFixed(1)},${SUELO} Z`;
          return (
            <g key={t.nombre} className={t.dosEjes ? 'hz-torre hz-dictaminada' : 'hz-torre hz-hueca'}>
              <path d={cuerpo} />
              <line x1={t.x - w * 0.9} y1={cima + alto * 0.14} x2={t.x + w * 0.9} y2={cima + alto * 0.14} />
              <line x1={t.x - w * 0.62} y1={cima + alto * 0.36} x2={t.x + w * 0.62} y2={cima + alto * 0.36} />
              <title>{t.titulo}</title>
            </g>
          );
        })}

        {/* los que amplifican llevan su marca en el cielo */}
        {torres.filter((t) => t.amplifica && t.factor !== null && t.factor > 1.4).map((t) => (
          <g key={`a${t.nombre}`} className="hz-amplifica">
            <line x1={t.x} y1={cima - 5} x2={t.x} y2={cima - 17} />
            <text x={t.x} y={cima - 21} textAnchor="middle">{`×${nf(t.factor!, 2)}`}</text>
          </g>
        ))}

        {/* carril del eje TRANSVERSAL */}
        <text className="hz-carril-rot" x={M_IZQ} y={CARRIL_T - 9}>transversal (de lado)</text>
        {torres.map((t) => marca(t, CARRIL_T, t.transversal, 'transversal'))}

        {/* carril del eje LONGITUDINAL — si no es calculable NO se pinta con
            ceros: un carril lleno de marcas vacías se leería como «se comprobó
            y no cumple ninguno», que es una afirmación que nadie ha hecho. */}
        <text className="hz-carril-rot" x={M_IZQ} y={CARRIL_L - 9}>
          {cob.longitudinalCalculable
            ? 'longitudinal (a lo largo)'
            : 'longitudinal (a lo largo): no calculable en esta línea — hacen falta dos estructuras que comparar'}
        </text>
        {cob.longitudinalCalculable && torres.map((t) => marca(t, CARRIL_L, t.longitudinal, 'longitudinal'))}
      </svg>

      <figcaption className="hz-pie">
        <span className="hz-leyenda"><i className="hz-sw hz-sw-llena" />{cob.ambos} dictaminados · los dos ejes</span>
        <span className="hz-leyenda"><i className="hz-sw hz-sw-hueca" />{huecas} huecos · les falta un eje o los dos</span>
        <span className="hz-leyenda">transversal: {cob.conTransversal} de {cob.dibujados}</span>
        <span className="hz-leyenda">
          {cob.longitudinalCalculable
            ? `longitudinal: ${cob.conLongitudinal} de ${cob.dibujados}`
            : 'longitudinal: no calculable'}
        </span>
        <span className="hz-leyenda"><i className="hz-sw hz-sw-fuera" />{fueraN} vanos fuera de banda</span>
        <span className="hz-nota">
          {hayDistancias
            ? 'distancias reales · relieve plano: la cota es GPS de mano (±8 m) y no se dibuja'
            : 'reparto uniforme: no hay vanos medidos · relieve plano'}
        </span>
      </figcaption>
      <p className="hz-lectura">{lecturaDeCobertura(cob, { totalLinea: total })}</p>
    </figure>
  );
}
