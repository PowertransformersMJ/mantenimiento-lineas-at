// ============================================================================
// componentes/Termica.tsx — el tablero térmico: la franja, no el número
// ----------------------------------------------------------------------------
// Hoy la aplicación muestra UN indicador de ampacidad, calculado a 32 °C de
// ambiente. Ese número no está mal: está SOLO. Y la ampacidad no es una
// propiedad del conductor —como sí lo son la sección o la carga de rotura—,
// sino el resultado de un balance con el clima. El mismo cable, la misma tarde,
// con el aire quieto, transporta bastante menos.
//
// Esta pestaña sustituye el número por la FRANJA con sus condiciones a la
// vista, y con ella deja dicho lo que un solo número no puede decir:
//
//   con El Niño el ambiente sube y la ampacidad BAJA justo cuando la demanda
//   SUBE — es el momento en que una línea que siempre bastó deja de bastar.
//
// AQUÍ NO SE CALCULA NADA. Ni una fórmula, ni un promedio, ni un redondeo con
// criterio. Todo sale de `vistas/termicaDatos.ts`, que a su vez solo ordena lo
// que resuelve `@lineas/nucleo/termica` (IEEE Std 738). Lo único que hace este
// archivo con los datos es ELEGIR cuál fila titular —la de mayor pérdida— igual
// que la tabla de tramos elige los tramos que exceden. Esa frontera es la que
// permite auditar la ingeniería sin leer una línea de interfaz.
//
// Las celdas vacías se pintan «—» a propósito y su motivo baja a los avisos.
// Un hueco se ve; un número de relleno se firma.
// ============================================================================
import { useMemo } from 'react';
import type { Conductor, Hipotesis, Linea as TLinea } from '@lineas/contratos';
import { tableroTermico } from '../vistas/termicaDatos';
import type { FilaEscenario, Aviso } from '../vistas/termicaDatos';
import { nf } from '../vistas/formato';
import { Sello } from './Sello';

const ROTULO_SEVERIDAD: Record<Aviso['severidad'], string> = {
  atencion: 'Atención',
  aviso: 'Aviso',
  info: 'Nota',
};

/** Una celda numérica que puede no existir. El guion es el dato, no un adorno. */
const celda = (v: number | null, d = 0, sufijo = '') =>
  v === null ? '—' : `${nf(v, d)}${sufijo}`;

export function Termica({ linea, conductor, hipotesis, altitud_m }: {
  linea: TLinea;
  conductor: Conductor;
  hipotesis: Hipotesis;
  /**
   * Cota de la línea, m s. n. m. Aire más ralo evacúa menos calor: a 1 000 m la
   * misma línea aguanta algo menos que al nivel del mar. Si no se declara, el
   * tablero calcula a nivel del mar — que es el caso MÁS favorable, y lo dice.
   */
  altitud_m?: number;
}) {

  // El conductor y la hipótesis del contrato entran tal cual: los nombres de
  // campo del tablero son los mismos a propósito, para que nadie tenga que
  // escribir aquí una traducción que un día se desincronice.
  // La tensión NO se fija: se lee de la línea. Una tensión incrustada en el
  // código convertiría el MVA de todas las demás líneas en un número falso que
  // nadie revisa porque «siempre estuvo ahí».
  const t = useMemo(
    () => tableroTermico(conductor, hipotesis, {
      tensionNominal_kV: linea?.tensionNominal_kV ?? null,
      altitud_m,
    }),
    [linea, conductor, hipotesis, altitud_m],
  );

  // Selección, no cálculo: la fila que más capacidad pierde y la de referencia.
  // Los números que se muestran son los que ya vienen calculados.
  const filaRef = t.escenarios.find((e) => e.esReferencia) ?? null;
  const peor = t.escenarios.reduce<FilaEscenario | null>((p, e) => (
    e.derrateo_pct === null ? p
      : p === null || e.derrateo_pct > (p.derrateo_pct ?? -Infinity) ? e : p
  ), null);

  const hayCaida = peor !== null && peor.derrateo_pct !== null && peor.derrateo_pct > 0
    && filaRef !== null && filaRef.ampacidad_A !== null && peor.ampacidad_A !== null;

  return (
    <>
      <section className="panel">
        <h2>Capacidad de transporte según el clima</h2>
        <p className="fine">
          La ampacidad <b>no es una propiedad del conductor</b>: es el resultado de un balance
          entre el calor que genera la corriente y el que el aire se lleva. Por eso no se publica
          un número, se publica la franja — cada fila con el clima que la produjo, para que se
          pueda discutir la hipótesis y no solo el resultado.
        </p>
        <Sello hipotesis={hipotesis} conductor={conductor} origen="balance térmico IEEE Std 738 en régimen permanente" />

        {hayCaida && peor && filaRef ? (
          <p className="alerta">
            <b>Del mejor al peor escenario la línea pierde {nf(peor.derrateo_pct ?? 0, 1)} % de su
            capacidad.</b> En «{filaRef.etiqueta}» transporta {nf(filaRef.ampacidad_A ?? 0)} A; en
            «{peor.etiqueta}» ({nf(peor.ta_C)} °C, viento {nf(peor.viento_m_s, 2)} m/s) baja a{' '}
            {nf(peor.ampacidad_A ?? 0)} A
            {filaRef.mva !== null && peor.mva !== null
              ? ` — ${nf(filaRef.mva - peor.mva, 1)} MVA menos` : ''}.
            {' '}Con El Niño el ambiente sube y la capacidad baja <b>justo cuando la demanda
            sube</b>: es el momento en que una línea que siempre bastó deja de bastar.
          </p>
        ) : (
          <p className="fine">
            No hay diferencia calculable entre escenarios con los datos de hoy. Antes de leer eso
            como buena noticia, revisa los avisos: casi siempre significa que falta un dato del
            conductor, no que el clima le dé igual a la línea.
          </p>
        )}

        <div className="tabla-caja">
          <table className="tabla">
            <caption>
              Ampacidad por escenario de clima, con el conductor a{' '}
              {t.referencia.tc_C === null ? '—' : `${nf(t.referencia.tc_C)} °C`}{' '}
              ({t.referencia.tcOrigen}). Los escenarios son <b>ADOPTADOS por este proyecto</b>,
              no cifras de norma: se declaran en el código para poder discutirlos. La fila
              destacada es la de referencia — el derrateo de todas las demás se mide contra ella.
            </caption>
            <thead>
              <tr>
                <th>Escenario</th>
                <th>Ambiente</th>
                <th>Viento</th>
                <th>Sol</th>
                <th>Ampacidad</th>
                <th>Potencia</th>
                <th>Pierde</th>
                <th>Qué es este escenario</th>
              </tr>
            </thead>
            <tbody>
              {t.escenarios.map((e, i) => (
                <tr key={e.clave ?? `${e.etiqueta}-${i}`} className={e.esReferencia ? 'destaca' : undefined}>
                  <td>
                    <b>{e.etiqueta}</b>
                    {e.esReferencia ? ' · referencia' : ''}
                  </td>
                  <td className="num">{celda(e.ta_C, 0, ' °C')}</td>
                  <td className="num">{celda(e.viento_m_s, 2, ' m/s')}</td>
                  <td className="num">{celda(e.sol_W_m2, 0, ' W/m²')}</td>
                  <td className="num destaca">{celda(e.ampacidad_A, 0, ' A')}</td>
                  <td className="num">{celda(e.mva, 1, ' MVA')}</td>
                  <td className="num">{celda(e.derrateo_pct, 1, ' %')}</td>
                  <td className="umbral-criterio">{e.nota ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="fine">
          La potencia es √3 · U · I con la tensión de <b>esta</b> línea
          ({t.referencia.tension_kV === null
            ? 'no declarada — por eso la columna va vacía'
            : `${nf(t.referencia.tension_kV, 1)} kV`}), nunca una tensión supuesta.
          Ambiente y sol son la hipótesis de clima; el viento, la refrigeración que se le acredita
          al conductor. Superficie: emisividad {nf(t.referencia.emisividad, 2)} y absortividad{' '}
          {nf(t.referencia.absortividad, 2)}; altitud {nf(t.referencia.altitud_m)} m.
        </p>
      </section>

      <section className="panel">
        <h2>Resistencia del conductor en corriente continua</h2>
        <p className="fine">
          Es la tabla que hace comprobable todo lo anterior: el balance térmico se resuelve con
          esta resistencia, y la fila de <b>20 °C</b> es la única que se puede confrontar contra la
          ficha del fabricante. Si esa cuadra, las demás cuadran — la variación con la temperatura
          es la del material, no una elección del sistema.
        </p>

        <div className="tabla-caja">
          <table className="tabla">
            <caption>
              Resistencia en c.c. por kilómetro. La fila destacada es el límite de operación
              continua del material del conductor: por encima el metal se recuece y no vuelve.
            </caption>
            <thead>
              <tr>
                <th>Temperatura</th>
                <th>Resistencia</th>
                <th>Qué representa esa temperatura</th>
              </tr>
            </thead>
            <tbody>
              {t.resistencia.map((r) => (
                <tr key={r.T_C} className={r.esLimite ? 'destaca' : undefined}>
                  <td className="num">{nf(r.T_C)} °C</td>
                  <td className="num destaca">{celda(r.ohm_km, 4, ' Ω/km')}</td>
                  <td className="umbral-criterio">
                    {r.nota ?? '—'}
                    {r.esLimite ? <span className="umbral-fuente">límite continuo de este conductor</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Lo que hay que saber antes de usar estos números</h2>
        <p className="fine">
          Estos avisos no son letra pequeña: son las condiciones bajo las que la tabla de arriba es
          cierta. Van ordenados de más grave a menos.
        </p>
        {t.avisos.length === 0 ? (
          <p className="ok">
            Sin salvedades: el tablero se calculó con todos los datos declarados.
          </p>
        ) : (
          <ul className="calidad-lista">
            {t.avisos.map((a, i) => (
              <li key={i} className={`calidad-item ${a.severidad}`}>
                <b>{ROTULO_SEVERIDAD[a.severidad]}.</b> {a.texto}
              </li>
            ))}
          </ul>
        )}
        <p className="fine">
          <b>Esto no es un dictamen firmable.</b> Es una capacidad calculada con hipótesis de clima
          adoptadas por el proyecto y con la resistencia en corriente continua. Quien firme el
          despacho decide qué escenario aplica y con qué margen.
        </p>
      </section>
    </>
  );
}
