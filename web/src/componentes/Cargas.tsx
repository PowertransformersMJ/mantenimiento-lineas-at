// ============================================================================
// componentes/Cargas.tsx — ¿y el apoyo aguanta?
// ----------------------------------------------------------------------------
// Las pestañas Mecánico y Viento hablan del CABLE: cuánto tira, cuánto lo
// empuja el aire. Ésta habla de la ESTRUCTURA, que es de lo que responde el que
// firma un mantenimiento: cuánta carga recibe cada apoyo y cuánta le queda antes
// de tocar su capacidad declarada.
//
// DOS EJES, DOS TABLAS, Y NUNCA UNA SUMA. Arriba la carga TRANSVERSAL (quiebre +
// viento: empuja de lado). Abajo la LONGITUDINAL (a lo largo de la línea: es el
// eje del que cuelga la retención). Son cargas sobre ejes distintos: sumarlas
// sería sumar peras con manzanas, y por eso ni una cifra de esta pantalla
// combina las dos.
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
import { longitudinalParaPantalla } from '../vistas/longitudinalDatos';
import { tramosDeTension, estadosDelTramo } from '@lineas/nucleo/mecanica';
import { vanos, soloEstructuras, nombreVisible } from '../vistas/planta';
import { conductorParaNucleo, paramsParaNucleo } from '../vistas/tramos';
import { nf, textoNucleo } from '../vistas/formato';
import { Sello } from './Sello';

/** Un número que puede no existir. El hueco se pinta como hueco, nunca como 0. */
const val = (v: number | null, dec = 0, unidad = ''): string =>
  v === null ? '—' : `${nf(v, dec)}${unidad ? ' ' + unidad : ''}`;

const ROTULO = { cumple: 'cumple', revisar: 'revisar', no_evaluable: 'no evaluable' } as const;

/** Cómo se nombra cada caso longitudinal en la tabla, sin jerga. */
const CASO = {
  terminal: 'terminal — tiro entero',
  desequilibrio: 'anclaje — diferencia',
  suspension: 'suspensión — cero del modelo',
  no_evaluable: 'no evaluable',
} as const;

/**
 * Qué se puede AFIRMAR sobre el sentido de la carga longitudinal de un apoyo.
 *
 * ⚠️ La celda tiene que consultar `inversionResoluble`, que existe exactamente
 * para esto. Antes solo miraba que las dos columnas trajeran número y escribía
 * «los dos» — justo cuando el núcleo se niega a afirmarlo. Reproducido en el
 * motor: un anclaje con +70,4 kgf adelante, −122,6 atrás y un ruido de tendido
 * de 85,3 da `sentidoResoluble: true` pero `inversionResoluble: false`, y el
 * núcleo escribe una nota diciendo que ese segundo sentido NO se afirma. La
 * celda lo afirmaba igual, contradiciendo a la tarjeta «apoyos que tiran hacia
 * LOS DOS lados» de esta misma pantalla y al informe firmable. Y esa afirmación
 * es la que decide si hace falta retenida a un lado o a los dos (§ADR-013,
 * hallazgo 10). Es la regresión que el propio núcleo dice haber cazado en
 * producción: se arregló el cálculo y el KPI, y quedó la celda vieja.
 */
function selloSentido(f: {
  caso: string;
  sentidoResoluble: boolean | null;
  inversionResoluble: boolean | null;
  flAdelanteMax_kgf: number | null;
  flAtrasMax_kgf: number | null;
}) {
  if (f.caso === 'suspension') return <span className="sello gris">nulo</span>;
  if (f.caso === 'no_evaluable') return <span className="sello gris">sin número</span>;

  // El número no pesa más que una diferencia de tendido de obra: hay cifra, no
  // hay sentido. Se dice antes que nada, porque invalida todo lo demás.
  if (f.sentidoResoluble === false) return <span className="sello ambar">no concluyente</span>;
  // Nadie declaró la carga de rotura: sin ella no se sabe cuánto pesa el ruido
  // de obra, así que no se puede afirmar NI negar el sentido.
  if (f.sentidoResoluble === null) return <span className="sello gris">sin medir el ruido</span>;

  if (f.inversionResoluble === true) return <span className="sello ambar">los dos</span>;

  // Los dos sentidos salieron del cálculo, pero el menor es indistinguible del
  // ruido de obra: manda el dominante y el segundo NO se afirma.
  if (f.inversionResoluble === false && f.flAdelanteMax_kgf !== null && f.flAtrasMax_kgf !== null) {
    const dominante = Math.abs(f.flAdelanteMax_kgf) >= Math.abs(f.flAtrasMax_kgf) ? 'adelante' : 'atrás';
    return <span className="sello verde">dominante hacia {dominante}</span>;
  }
  if (f.inversionResoluble === null) return <span className="sello gris">sin medir el ruido</span>;

  return <span className="sello verde">definido</span>;
}

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

  // El eje longitudinal necesita los tramos con sus estados RICOS (temperatura y
  // carga unitaria incluidas): el núcleo rechaza la forma aplanada porque para
  // RESTAR el tiro de dos tramos hay que poder comprobar que son comparables.
  const lg = useMemo(() => {
    const E = soloEstructuras(apoyos);
    if (E.length < 2) return null;
    const L = vanos(apoyos);
    const c = conductorParaNucleo(conductor);
    const p = paramsParaNucleo(hipotesis);
    const ricos = tramosDeTension(
      E.map((a) => ({ funcionEstructural: a.funcionEstructural, nombre: nombreVisible(a) })), L,
    ).map((t: { vanos: number[] }) => ({ ...t, estados: estadosDelTramo(t, c, p) }));
    return longitudinalParaPantalla(apoyos, ricos, conductor);
  }, [apoyos, conductor, hipotesis]);

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
  // Las del OTRO eje, que hasta §ADR-013 no se pintaban en ninguna parte de la
  // pantalla: el núcleo las escribía y solo las veía quien abriera el CSV.
  const notasLong = lg ? agruparNotas(lg.filas) : [];
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
                {textoNucleo(n.texto)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {lg && lg.filas.length > 0 && (
        <>
          <section className="panel">
            <h2>El otro eje: cuánto tira a lo LARGO de la línea</h2>
            <p className="fine">
              Todo lo de arriba es carga <b>transversal</b>: empuja al apoyo de lado. Falta el eje
              del que cuelga la retención — <b>a lo largo</b> de la línea. En un apoyo de suspensión
              vale cero porque la tensión es la misma a los dos lados; en un <b>anclaje</b> es la{' '}
              <b>diferencia</b> de los dos tiros, y en un <b>terminal</b> es el tiro entero, porque
              no hay nada al otro lado que lo compense.
            </p>

            <div className="kpis">
              <Tarjeta
                valor={lg.peor ? `${nf(Math.abs(lg.peor.fl_kgf))} kgf` : '—'}
                etiqueta="mayor carga longitudinal"
                tono={lg.peor ? 'rojo' : undefined}
                explica={lg.peor
                  ? `en ${lg.peor.apoyo}, hacia ${lg.peor.sentido === 'adelante' ? 'adelante' : 'atrás'}, por conductor`
                  : 'ningún apoyo con carga longitudinal calculable'} />
              <Tarjeta
                valor={nf(lg.cuantosInvierten)}
                etiqueta="apoyos que tiran hacia LOS DOS lados"
                tono={lg.cuantosInvierten ? 'rojo' : undefined}
                explica="el sentido se invierte con la temperatura: decide si hace falta retención a un lado o a dos" />
              <Tarjeta
                valor={lg.filas[0]?.sensibilidadTendido_kgf !== null && lg.filas[0]?.sensibilidadTendido_kgf !== undefined
                  ? `${nf(lg.filas[0].sensibilidadTendido_kgf)} kgf` : '—'}
                etiqueta="lo que pesa el tendido de obra"
                explica="una diferencia de tendido del 1 % de la rotura; por debajo de eso, el sentido no es concluyente" />
              <Tarjeta
                valor={nf(lg.cuantosSentidoDudoso)}
                etiqueta="apoyos con sentido NO concluyente"
                explica="el número sale, pero en el terreno podría apuntar al otro lado" />
            </div>
          </section>

          <section className="panel">
            <h2>Eje longitudinal, apoyo por apoyo</h2>
            <div className="tabla-caja">
              <table className="tabla">
                <caption>
                  Carga <b>longitudinal</b> por conductor, con SIGNO: «adelante» es hacia el apoyo
                  siguiente. Los dos sentidos van en columnas separadas a propósito — un apoyo puede
                  tirar hacia los dos según el estado, y publicar solo la magnitud lo escondería.
                  La rotura es <b>caso accidental</b> y NO se suma al permanente.
                  <Sello hipotesis={hipotesis} conductor={conductor} />
                </caption>
                <thead>
                  <tr>
                    <th>#</th><th>Apoyo</th><th>Caso</th>
                    <th>Deflexión</th><th>cos(α/2)</th>
                    <th>Hacia adelante (kgf)</th><th>Hacia atrás (kgf)</th>
                    <th>Sentido</th><th>Rotura, lado atrás (kgf)</th><th>Rotura, lado adelante (kgf)</th>
                  </tr>
                </thead>
                <tbody>
                  {lg.filas.map((f) => (
                    <tr key={f.n} className={f.caso === 'terminal' ? 'excede' : undefined}>
                      <td className="num">{f.n}</td>
                      <td><b>{f.apoyo}</b></td>
                      <td>{CASO[f.caso]}</td>
                      <td className="num">{val(f.deflexion_grados, 1, '°')}</td>
                      <td className="num">
                        {f.factorLongitudinal === null ? '—' : nf(f.factorLongitudinal, 3)}
                      </td>
                      <td className="num destaca">{val(f.flAdelanteMax_kgf)}</td>
                      <td className="num destaca">{val(f.flAtrasMax_kgf)}</td>
                      <td>{selloSentido(f)}</td>
                      <td className="num">{val(f.roturaAtras_kgf)}</td>
                      <td className="num">{val(f.roturaAdelante_kgf)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="fine">
              <b>cos(α/2)</b> es cuánto de la diferencia de tiros llega al eje de la línea: vale 1 en
              recta y se anula cuando la línea se dobla del todo. Es el compañero del factor del
              quiebre de la tabla de arriba — <b>el mismo ángulo, los dos ejes</b>. Ninguna de las
              dos cifras se suma con la otra.
            </p>
            <p className="advertencia">
              <b>El mayor desequilibrio NO está en el estado de mayor tiro.</b> Comprobado con el
              motor: el tiro máximo ocurre a mínima temperatura, pero la mayor diferencia entre
              tramos ocurre a <b>máxima</b>, cuando los tramos cortos se aflojan y los largos
              aguantan. Por eso esta tabla recorre los cuatro estados y no solo el peor tiro.
            </p>
          </section>

          {notasLong.length > 0 && (
            <section className="panel">
              <h2>Lo que falta o se supuso en el eje longitudinal, y en qué apoyos</h2>
              <p className="fine">
                Lo escribe el propio cálculo, fila por fila. Aquí vive el aviso que más pesa y que
                antes solo llegaba al CSV: cuando uno de los dos tramos contiguos cae por debajo
                del 25 % de su propio EDS, el desequilibrio lo domina un tramo que está flojo
                <b> en el modelo</b>, no en el terreno — la cifra sale limpia y no se sostiene sola.
              </p>
              <ul className="calidad-lista">
                {notasLong.map((nota) => (
                  <li key={`${nota.esNoEvaluable}-${nota.texto}`}
                      className={`calidad-item ${nota.esNoEvaluable ? 'aviso' : 'info'}`}>
                    <b>{aQuienes(nota.apoyos)}.</b>{' '}
                    {nota.esNoEvaluable && <b>Sin carga calculada: </b>}
                    {textoNucleo(nota.texto)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="panel">
            <h2>Lo que el eje longitudinal NO dice</h2>
            <ul className="calidad-lista">
              {lg.avisos.map((a) => (
                <li key={a.concepto} className={`calidad-item ${a.severidad}`}>
                  <b>{textoNucleo(a.concepto)}.</b> {textoNucleo(a.motivo)}
                </li>
              ))}
            </ul>
          </section>
        </>
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
              <b>{textoNucleo(a.concepto)}.</b> {textoNucleo(a.motivo)}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
