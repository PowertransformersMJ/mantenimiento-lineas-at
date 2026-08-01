// ============================================================================
// componentes/Cargas.tsx — ¿y el apoyo aguanta?
// ----------------------------------------------------------------------------
// Las pestañas Mecánico y Viento hablan del CABLE: cuánto tira, cuánto lo
// empuja el aire. Ésta habla de la ESTRUCTURA, que es de lo que responde el que
// firma un mantenimiento: cuánta carga transversal recibe cada apoyo y cuánta le
// queda antes de tocar su capacidad declarada.
//
// El número que cambia la conversación es el FACTOR DEL QUIEBRE. Un apoyo en
// una línea recta recibe cero carga de ángulo; uno con 120° de deflexión recibe
// 1,73 veces la tensión del conductor, y la recibe siempre, sople o no el
// viento. Un apoyo así dimensionado «por el tiro» está dimensionado por poco más
// de la mitad. Ese dato existía dentro de una fórmula y no salía por ninguna
// pantalla — hasta aquí.
//
// Aquí NO hay ni una fórmula. Todo se lo pide a `vistas/cargasDatos.ts`, que a
// su vez se lo pide a @lineas/nucleo/cargas. Este archivo decide qué se enseña,
// en qué orden y con qué palabras.
//
// Y las palabras importan: «utilización 62 %» no le dice nada a quien dirige;
// «a este apoyo le quedan 900 kilos antes del umbral que adoptamos» sí.
// ============================================================================
import { useMemo } from 'react';
import type { Apoyo, Conductor, Hipotesis, Linea } from '@lineas/contratos';
import { calcularTramos } from '../vistas/tramos';
import { cargasParaPantalla, agruparNotas } from '../vistas/cargasDatos';
import { nf } from '../vistas/formato';
import { Sello } from './Sello';

/** Un número que puede no existir. El hueco se pinta como hueco, nunca como 0. */
const val = (v: number | null, dec = 0, unidad = ''): string =>
  v === null ? '—' : `${nf(v, dec)}${unidad ? ' ' + unidad : ''}`;

const ROTULO = { cumple: 'cumple', revisar: 'revisar', no_evaluable: 'no evaluable' } as const;

function Tarjeta({ valor, etiqueta, explica, tono }:
  { valor: string; etiqueta: string; explica: string; tono?: string }) {
  return (
    <div className="kpi">
      <div className={'kpi-v' + (tono ? ' ' + tono : '')}>{valor}</div>
      <div className="kpi-l">{etiqueta}</div>
      <div className="kpi-s">{explica}</div>
    </div>
  );
}

export function Cargas({ linea, apoyos, conductor, hipotesis }:
  { linea: Linea; apoyos: Apoyo[]; conductor: Conductor; hipotesis: Hipotesis }) {

  const r = useMemo(
    // Los tramos NO se recalculan aquí: se piden a la misma función que alimenta
    // Mecánico y Viento. Si cada pestaña calculara su propio tiro, bastaría un
    // cambio en una para que la app se contradijera a sí misma ante el cliente.
    () => cargasParaPantalla(
      apoyos, calcularTramos(apoyos, conductor, hipotesis), conductor, hipotesis, linea.circuitos,
    ),
    [apoyos, conductor, hipotesis, linea.circuitos],
  );

  if (!r.filas.length) {
    return (
      <section className="panel">
        <h2>Carga sobre las estructuras</h2>
        <p className="fine">
          No hay estructuras que evaluar. Los empalmes no cuentan: no sostienen el conductor.
        </p>
      </section>
    );
  }

  // Agrupadas por texto: una observación repetida en las 24 filas no informa,
  // tapa a las tres que dicen algo distinto.
  const notas = agruparNotas(r.filas);
  const nCond = r.filas.find((f) => f.nConductores !== null)?.nConductores ?? null;

  /** «LN-627 E02 y LN-627 E06» si son pocos; «22 apoyos» si son multitud. */
  const aQuienes = (apoyos: string[]): string =>
    apoyos.length > 4 ? `${nf(apoyos.length)} apoyos`
      : apoyos.length === 1 ? apoyos[0]
      : `${apoyos.slice(0, -1).join(', ')} y ${apoyos[apoyos.length - 1]}`;

  return (
    <>
      <section className="panel">
        <h2>¿Cuánta carga recibe cada estructura?</h2>
        <p className="fine">
          El conductor no solo tira: en cada quiebre deja sobre el apoyo una resultante que vale{' '}
          <b>2 · tiro · sen(ángulo/2)</b> por conductor. A 60° esa resultante <b>iguala</b> la
          tensión; por encima, la <b>supera</b>. Es carga <b>permanente</b>: existe con viento y sin
          él. A eso se le suma el empuje del viento sobre el medio vano de cada lado.
        </p>
        <Sello hipotesis={hipotesis} conductor={conductor} />

        <div className="kpis">
          <Tarjeta
            valor={r.peorFactor ? `${nf(r.peorFactor.factorAngulo, 3)} ×` : '—'}
            etiqueta="mayor amplificación del quiebre"
            tono={r.peorFactor && r.peorFactor.factorAngulo > 1 ? 'rojo' : undefined}
            explica={r.peorFactor
              ? `${r.peorFactor.apoyo}, con ${nf(r.peorFactor.deflexion_grados, 1)}° de deflexión`
              : 'ninguna estructura tiene el ángulo definido'} />
          <Tarjeta
            valor={nf(r.cuantosAmplifican)}
            etiqueta="apoyos que reciben MÁS que la tensión"
            tono={r.cuantosAmplifican ? 'rojo' : undefined}
            explica="por encima de 60° de quiebre la estructura recibe más carga que el propio tiro" />
          <Tarjeta
            valor={r.peorCarga ? `${nf(r.peorCarga.ftTotal_kgf)} kgf` : '—'}
            etiqueta="mayor carga transversal"
            explica={r.peorCarga ? `en ${r.peorCarga.apoyo}, sumando quiebre y viento` : 'sin carga calculable'} />
          <Tarjeta
            valor={`${nf(r.conCarga)} / ${nf(r.total)}`}
            etiqueta="estructuras con carga calculada"
            explica="las demás dicen en su fila qué dato les falta" />
          <Tarjeta
            valor={r.conUtilizacion ? `${nf(r.conUtilizacion)} / ${nf(r.total)}` : 'ninguna'}
            etiqueta="apoyos con capacidad declarada"
            tono={r.conUtilizacion ? undefined : 'gris'}
            explica="sin carga de rotura y alturas no se dictamina: se declara no evaluable" />
        </div>
      </section>

      <section className="panel">
        <h2>Apoyo por apoyo</h2>
        <div className="tabla-caja">
          <table className="tabla">
            <caption>
              Carga <b>transversal</b> sobre cada estructura.
              {nCond !== null && <> Se cuentan <b>{nf(nCond)} conductores</b> por apoyo.</>}{' '}
              El tiro es el del estado con viento cuando existe; si no, el mayor de los cuatro, y la
              fila lo dice. Los empalmes no aparecen: no sostienen el conductor.
              <Sello hipotesis={hipotesis} conductor={conductor} />
            </caption>
            <thead>
              <tr>
                <th>#</th><th>Apoyo</th><th>Función</th>
                <th>Deflexión</th><th>Factor</th>
                <th>Vano viento (m)</th><th>Tiro (kgf)</th>
                <th>Quiebre (kgf)</th><th>Viento (kgf)</th><th>Total (kgf)</th>
                <th>Utilización</th><th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {r.filas.map((f) => (
                <tr key={f.n} className={f.estadoUtilizacion === 'revisar' ? 'excede' : undefined}>
                  <td className="num">{f.n}</td>
                  <td><b>{f.apoyo}</b></td>
                  <td>{f.funcionEstructural ?? '—'}</td>
                  <td className="num">{val(f.deflexion_grados, 1, '°')}</td>
                  <td className={'num' + (f.amplifica ? ' destaca' : '')}>
                    {f.factorAngulo === null ? '—' : `${nf(f.factorAngulo, 3)} ×`}
                  </td>
                  <td className="num">{val(f.vanoViento_m, 1)}</td>
                  <td className="num">{val(f.tiro_kgf)}</td>
                  <td className="num">{val(f.ftAngulo_kgf)}</td>
                  <td className="num">{val(f.ftViento_kgf)}</td>
                  <td className="num destaca">{val(f.ftTotal_kgf)}</td>
                  <td className="num">
                    {f.utilizacion_pct === null ? '—' : `${nf(f.utilizacion_pct, 1)} %`}
                  </td>
                  <td>
                    <span className={`sello ${f.estadoUtilizacion === 'cumple' ? 'verde'
                      : f.estadoUtilizacion === 'revisar' ? 'ambar' : 'gris'}`}>
                      {ROTULO[f.estadoUtilizacion]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="fine">
          <b>Factor</b> es cuántas veces la tensión del conductor recibe la estructura por el solo
          hecho de que la línea gire ahí. <b>Utilización</b> compara <b>momentos</b>, no fuerzas: la
          carga por la altura a la que actúa, contra la rotura declarada por la altura a la que se
          ensayó. Un mismo kgf amarrado más abajo hace menos daño.
        </p>

        {r.conUtilizacion === 0 && (
          <p className="advertencia">
            <b>Ninguna estructura tiene capacidad declarada todavía.</b> La tabla dice cuánto se les
            está pidiendo; no puede decir cuánto aguantan. Falta inventario —carga de rotura, altura
            libre y altura del punto de sujeción—, no falta desarrollo: los tres campos ya existen en
            el contrato. Hasta entonces el estado es «no evaluable», que es un hecho sobre los datos
            y no un fallo de la aplicación.
          </p>
        )}
      </section>

      {notas.length > 0 && (
        <section className="panel">
          <h2>Lo que falta o se supuso, y en qué apoyos</h2>
          <p className="fine">
            Escrito por el cálculo, no redactado a mano: si el dato se captura, la observación
            desaparece sola. Lo que le pasa a un apoyo solo va primero; lo que les pasa a todos es
            el contexto de la línea y va al final.
          </p>
          <ul className="calidad-lista">
            {notas.map((n) => (
              <li key={`${n.esNoEvaluable}-${n.texto}`}
                  className={`calidad-item ${n.esNoEvaluable ? 'aviso' : 'info'}`}>
                <b>{aQuienes(n.apoyos)}.</b>{' '}
                {n.esNoEvaluable && <b>Sin carga calculada: </b>}
                {n.texto}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2>Lo que este cálculo NO dice</h2>
        <p className="fine">
          Una carga transversal holgada no es un apoyo verificado. Esto es lo que queda fuera, y por
          qué — declarado, no escondido.
        </p>
        <ul className="calidad-lista">
          {r.avisos.map((a) => (
            <li key={a.concepto} className={`calidad-item ${a.severidad}`}>
              <b>{a.concepto}.</b> {a.motivo}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
