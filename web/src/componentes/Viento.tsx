// ============================================================================
// componentes/Viento.tsx — qué le hace el viento a esta línea
// ----------------------------------------------------------------------------
// Aquí NO hay ni una fórmula. Todo se lo pide a `vistas/vientoDatos.ts`, que a
// su vez se lo pide a @lineas/nucleo. Este archivo solo decide qué se enseña,
// en qué orden y con qué palabras.
//
// Y las palabras importan tanto como los números: el viento es la magnitud que
// peor se comunica de un cálculo mecánico. «Presión dinámica 434 Pa» no le dice
// nada a quien dirige; «el viento empuja el cable de lado con 0,4 kilos por
// cada metro, y eso lo inclina 22°» sí. Cada tarjeta lleva su frase llana
// debajo, porque un tablero que hay que traducir no se usa.
//
// La sección de avisos no es un apéndice: es la que impide que alguien lea el
// ángulo de balanceo como si fuera una verificación de distancias. No lo es, y
// lo dice con esas palabras.
// ============================================================================
import { useMemo } from 'react';
import type { Apoyo, Conductor, Hipotesis } from '@lineas/contratos';
import { calcularTramos } from '../vistas/tramos';
import { caracterizacionViento } from '../vistas/vientoDatos';
import { nf } from '../vistas/formato';
import { Sello } from './Sello';

/** Un número que puede no existir. El hueco se pinta como hueco, nunca como 0. */
const val = (v: number | null, dec: number, unidad = ''): string =>
  v === null ? '—' : `${nf(v, dec)}${unidad ? ' ' + unidad : ''}`;

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

export function Viento({ apoyos, conductor, hipotesis }:
  { apoyos: Apoyo[]; conductor: Conductor; hipotesis: Hipotesis }) {

  const v = useMemo(
    // Los tramos NO se recalculan aquí: se piden a la misma función que alimenta
    // la pestaña Mecánico. Si cada pestaña calculara su propio tiro de viento,
    // bastaría un cambio en una para que la app se contradijera a sí misma
    // delante del cliente.
    () => caracterizacionViento(conductor, hipotesis, calcularTramos(apoyos, conductor, hipotesis)),
    [apoyos, conductor, hipotesis],
  );

  // Lo que la hipótesis DECLARÓ, tal cual, sin suplir lo que falte: si el cx no
  // viene, aquí se lee «no declarado» y el aviso de abajo explica con qué se
  // calculó entonces. Rellenar el hueco con el valor por defecto sería esconder
  // exactamente el dato que el revisor tiene que poder discutir.
  const cxTexto = typeof hipotesis?.cx === 'number' ? nf(hipotesis.cx, 2) : 'no declarado';
  const rhoTexto = typeof hipotesis?.densidadAire_kg_m3 === 'number'
    ? `${nf(hipotesis.densidadAire_kg_m3, 3)} kg/m³` : 'no declarada';
  const vTexto = typeof hipotesis?.vientoMax_kmh === 'number'
    ? `${nf(hipotesis.vientoMax_kmh, 0)} km/h` : 'no declarada';
  // La temperatura del estado de viento se trata igual que las otras tres: si no
  // viene, se dice. Antes caía a «0 °C» por defecto, que es peor que un hueco —
  // el encabezado afirmaba una hipótesis de viento a cero grados que nadie tomó,
  // y en la costa Caribe esa cifra sola delata el informe como no revisado.
  const tVientoTexto = typeof hipotesis?.tempViento_C === 'number'
    ? `${nf(hipotesis.tempViento_C, 0)} °C` : 'temperatura no declarada';

  return (
    <>
      <section className="panel">
        <h2>El viento sobre el conductor</h2>
        <p className="fine">
          Hipótesis de viento: <b>{vTexto}</b> a <b>{tVientoTexto}</b> ·
          coeficiente de arrastre <b>{cxTexto}</b> · densidad del aire <b>{rhoTexto}</b>.
          Estas tres cifras son una <b>decisión de ingeniería</b>, no un dato del terreno:
          cambiarlas cambia todos los números de abajo.
        </p>
        <Sello hipotesis={hipotesis} conductor={conductor} />

        <div className="kpis">
          <Tarjeta
            valor={val(v.presion_Pa, 0, 'Pa')}
            etiqueta="presión del viento"
            explica="lo que empuja el aire sobre cada metro cuadrado de cara expuesta" />
          <Tarjeta
            valor={val(v.cargaViento_kg_m, 3, 'kg/m')}
            etiqueta="empuje sobre el cable"
            explica="los kilos con que el viento empuja de lado cada metro de conductor" />
          <Tarjeta
            valor={val(v.pesoPropio_kg_m, 3, 'kg/m')}
            etiqueta="peso propio"
            explica="lo que pesa un metro de conductor: el rival del empuje" />
          <Tarjeta
            valor={val(v.resultante_kg_m, 3, 'kg/m')}
            etiqueta="carga resultante"
            explica="peso y empuje sumados como flechas: la carga real que cuelga y tensa" />
          <Tarjeta
            valor={val(v.anguloBalanceo_grados, 1, '°')}
            etiqueta="ángulo de balanceo"
            tono={v.anguloBalanceo_grados !== null && v.anguloBalanceo_grados >= 30 ? 'rojo' : undefined}
            explica="cuánto se va el cable de lado: es lo que acerca el conductor a la estructura y a las otras fases" />
          <Tarjeta
            valor={val(v.relacionVientoPeso, 2, '×')}
            etiqueta="empuje / peso"
            explica="cuántas veces el viento puede más que el peso; es la tangente del ángulo" />
        </div>

        <p className="fine">
          El conductor deja de colgar recto hacia abajo y pasa a colgar en un plano inclinado ese
          ángulo. Por eso el estado de viento <b>no</b> es el que decide la distancia al terreno
          —de eso se ocupa el de máxima temperatura— sino el <b>tiro</b> sobre las estructuras y el
          <b> desplazamiento lateral</b> del cable.
        </p>
      </section>

      <section className="panel">
        <h2>Tiro y flecha con viento, tramo a tramo</h2>
        {v.porTramo.length === 0 ? (
          <p className="fine">
            No hay tramos de tensión que mostrar: hacen falta al menos dos estructuras.
          </p>
        ) : (
          <div className="tabla-caja">
            <table className="tabla">
              <caption>
                Estado de máximo viento por tramo. El tiro es el horizontal del tramo; la flecha es
                la del vano más largo, medida en el plano inclinado en que cuelga el conductor.
              </caption>
              <thead>
                <tr>
                  <th>#</th><th>Tramo</th>
                  <th>Tiro con viento (kgf)</th>
                  <th>% de la rotura</th>
                  <th>Flecha con viento (m)</th>
                </tr>
              </thead>
              <tbody>
                {v.porTramo.map((f) => (
                  <tr key={f.n}>
                    <td className="num">{f.n}</td>
                    <td>{f.desde} → {f.hasta}</td>
                    <td className="num">{val(f.tiroViento_kgf, 0)}</td>
                    <td className="num destaca">{val(f.pctRts, 1)}{f.pctRts === null ? '' : ' %'}</td>
                    <td className="num">{val(f.flechaViento_m, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="fine">
          El «% de la rotura» de esta tabla es el del <b>estado de viento</b> únicamente. No tiene
          por qué coincidir con el de la pestaña Mecánico, que muestra el del estado más exigente
          de los cuatro —muchas veces el de mínima temperatura—.
        </p>
      </section>

      <section className="panel">
        <h2>Lo que este cálculo NO dice</h2>
        <p className="fine">
          Un ángulo de balanceo no es una verificación de distancias. Esto es lo que queda fuera,
          y por qué — declarado, no escondido.
        </p>
        <ul className="calidad-lista">
          {v.avisos.map((a) => (
            <li key={a.concepto} className={`calidad-item ${a.severidad}`}>
              <b>{a.concepto}.</b> {a.motivo}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
