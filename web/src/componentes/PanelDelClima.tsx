// ============================================================================
// componentes/PanelDelClima.tsx — las piezas del clima, con UN solo dueño
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE (`99 §ADR-069`). Estas piezas nacieron dentro del panel del
// mapa de UNA línea. El Ingeniero pidió que el clima dejara de vivir en Detalle
// GPS y pasara a la pantalla del ATLAS —«que ya en el detalle GPS no aparezca la
// información sino en el atlas»—, y en cuanto dos pantallas quieren lo mismo hay
// exactamente dos caminos: copiarlo o extraerlo.
//
// Copiar es el fallo que más caro ha salido en esta casa (`34 · L-65`): hoy
// mismo se han cerrado tres divergencias nacidas así —el catálogo de atlas por
// duplicado, el filtro de «qué puntos son la línea», y cuatro renglones del mapa
// del código contradiciéndose sobre cuántos atlas hay—. Así que se extrae.
//
// ⚠️ ESTE ARCHIVO NO DESCARGA NADA Y NO TOCA EL MAPA. Recibe la ficha y los
// bytes ya bajados por quien sea su dueño, y describe lo que hay que pintar. Así
// las dos pantallas comparten el CRITERIO sin compartir el mapa, que es lo único
// que de verdad se parece entre ellas.
// ============================================================================
import {
  comoEstuvoElCielo, comoLlovio, enTramos, ESCALA_CIELO, ESCALA_LLUVIA, horasSobre,
  type FichaAtlas, type PerfilDelDia,
} from '../vistas/atlasCaribe';
import type { Regimen } from '../vistas/lineaDeTiempo';
import {
  avisosDelPronostico, contraLaHipotesis, eltiempoEnCastellano, TOPES_AVISO,
  vientoSobreLaLinea, ZONA,
  type PronosticoEnPantalla,
} from '../vistas/pronostico';
import { ATRIBUCION_PRONOSTICO } from '../datos/pronostico';
import { type ClaveAtlas } from '../vistas/atlasCatalogo';
import { colorDeValor } from '../vistas/rejilla';
import { nf } from '../vistas/formato';

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
export function topeDe(cual: ClaveAtlas, ficha: FichaAtlas):
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
export const CINTA: Record<Regimen, { rotulo: string; clase: string }> = {
  medido_horas: { rotulo: 'MEDIDO', clase: 'r-medido' },
  medido_solo_total: { rotulo: 'MEDIDO · sin horas', clase: 'r-medido' },
  sin_publicar: { rotulo: 'SIN PUBLICAR', clase: 'r-hueco' },
  pronostico: { rotulo: 'PRONÓSTICO', clase: 'r-modelo' },
  fuera: { rotulo: 'SIN DATO', clase: 'r-hueco' },
};

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
export function ElDiaEntero({ perfil, ficha, cual, hora, delMes, mesNombre }: {
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
  // En palabras: intensidad de lluvia (OMM) o estado del cielo (octas, OMM).
  const grados = cual === 'lluvia' ? comoLlovio(perfil)
    : cual === 'nubes' ? comoEstuvoElCielo(perfil)
      : [];

  return (
    <div className="dia-entero">
      <p className="mapa-capas-t">El día entero, en esta celda</p>
      <p className="mapa-capas-n">
        {cual === 'nubes' && perfil.media !== null ? (
          // En el cielo lo que describe el día es la MEDIA: el máximo lo alcanza
          // casi cualquier día del trópico a alguna hora, y no distingue nada.
          <>Cielo cubierto de media: <b>{nf(perfil.media, 0)} %</b> · máxima {nf(max, 0)} % a
            las {hh(perfil.horaMax!)}</>
        ) : (
          <>
            {acumulable ? 'Pico de ' : 'Máxima '}
            <b>{nf(max, 1)} {ficha.unidad}{acumulable ? '/h' : ''}</b> a las {hh(perfil.horaMax!)}
            {!acumulable && recorrido > 0
              && <> · mínima <b>{nf(min, 1)}</b> a las {hh(perfil.horaMin!)}</>}
          </>
        )}
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
      {(cual === 'lluvia' || cual === 'nubes') && (
        grados.length ? (
          <ul className="dia-grados">
            {grados.map((g) => (
              <li key={g.grado.clave} className={'g-' + g.grado.clave}>
                <b>{g.grado.nombre}</b> {enTramos(g.horas)} — {g.grado.paraLaLinea}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mapa-capas-n">
            {cual === 'lluvia'
              ? 'Ni una hora con lluvia apreciable en esta celda.'
              : 'De este día no se midió el cielo en ninguna hora.'}
          </p>
        )
      )}
      {cual === 'lluvia' && (
        <LaEscala grados={ESCALA_LLUVIA} unidad="milímetros caídos en una hora (mm/h)"
          ocurridos={new Set(grados.map((g) => g.grado.clave))}
          procedencia="Cortes de intensidad de la OMM —los mismos que publica AEMET—, no un criterio de esta casa." />
      )}
      {cual === 'nubes' && (
        <LaEscala grados={ESCALA_CIELO} unidad="porcentaje de cielo cubierto"
          ocurridos={new Set(grados.map((g) => g.grado.clave))}
          procedencia="Escala de OCTAS de la OMM: el cielo se parte en ocho octavos y 1 octa = 12,5 %." />
      )}
      {cual === 'nubes' && (
        <p className="fine">
          <b>La nubosidad no dice si hubo tormenta.</b> El aparato eléctrico no se mide con nubes
          y esta fuente no publica rayos de ninguna forma; el único sitio del sistema donde consta
          una tormenta es el pronóstico.
        </p>
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


/**
 * LA ESCALA, ENTERA Y EN LA PANTALLA (`§ADR-061`).
 *
 * POR QUÉ NO BASTA CON APLICARLA. Hasta ahora la pantalla decía «lluvia
 * moderada» y se quedaba tan ancha: quien lo lee tiene que creerse que alguien
 * eligió bien el corte, y no puede comprobar nada. Un criterio que solo conoce
 * quien lo programó no es un criterio — es una opinión con autoridad prestada.
 * Es la misma regla que gobierna el resto del sistema: **el veredicto sale del
 * valor contra la norma, y la norma se enseña** (`CLAUDE.md §4`).
 *
 * Y hay un motivo práctico además del de doctrina: el Ingeniero discute estos
 * números con un cliente. Poder decir «moderada empieza en 2 mm/h y lo dice la
 * OMM, no nosotros» vale más que la etiqueta.
 *
 * ⚠️ SE MARCA LO QUE PASÓ ESE DÍA, pero se enseñan TODOS los grados. Enseñar
 * solo los que ocurrieron dejaría la escala coja y haría creer que «torrencial»
 * no existe porque ese día no llovió así.
 */
export function LaEscala({ grados, ocurridos, unidad, procedencia }: {
  grados: readonly { clave: string; nombre: string; desde: number; paraLaLinea: string }[];
  /** Las claves que se dieron ese día, para resaltarlas. */
  ocurridos: Set<string>;
  unidad: string;
  procedencia: string;
}) {
  const rango = (i: number) => {
    const desde = grados[i].desde;
    const hasta = grados[i + 1]?.desde;
    if (i === 0) return `menos de ${nf(grados[1].desde, 1)}`;
    return hasta === undefined ? `${nf(desde, 1)} o más` : `${nf(desde, 1)} – ${nf(hasta, 1)}`;
  };
  return (
    <details className="escala">
      <summary>La escala completa, y de dónde sale</summary>
      <table className="escala-tabla">
        <tbody>
          {grados.map((g, i) => (
            <tr key={g.clave} className={(ocurridos.has(g.clave) ? 'hubo ' : '') + 'g-' + g.clave}>
              <th scope="row">{g.nombre}</th>
              <td className="escala-rango">{rango(i)}</td>
              <td>{g.paraLaLinea}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="fine">
        {procedencia} La unidad es {unidad}. <b>Los tramos en negrita son los que se dieron ese
        día en esta celda.</b>
      </p>
    </details>
  );
}


/**
 * El pronóstico, dicho para quien programa una cuadrilla.
 *
 * TRES COSAS QUE NO PUEDEN FALTAR, y ninguna es adorno:
 *
 *   1. **De qué parte del viento hablamos.** Lo que carga un apoyo es la
 *      componente de LADO, no la velocidad. Publicar solo la velocidad obliga a
 *      hacer la descomposición de cabeza.
 *   2. **Que esto no valida la hipótesis.** Poner los dos números juntos invita
 *      a leer «sopla menos de lo calculado, vamos sobrados», y eso es falso: la
 *      hipótesis es un extremo de diseño, no el tiempo de esta semana.
 *   3. **Dónde y cuándo se preguntó.** Un pronóstico sin hora de emisión ni
 *      punto de consulta es un número sin dueño; y la celda —redondeada a
 *      propósito— explica por qué no dice «en el apoyo E12».
 */
export function PanelPronostico({ p, eje, celda, vientoHipotesis_kmh }: {
  p: PronosticoEnPantalla;
  eje: number | null;
  celda: { lat: number; lon: number } | null;
  vientoHipotesis_kmh?: number | null;
}) {
  const ahora = p.instantes[0];
  const lado = ahora ? vientoSobreLaLinea(ahora.viento_kmh, ahora.vientoDesde_deg, eje) : null;
  const contra = contraLaHipotesis(lado?.transversal_kmh ?? null, vientoHipotesis_kmh);
  const avisos = avisosDelPronostico(p, eje);
  const n = (x: number | null | undefined, d = 0) =>
    (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(d) : '—');
  const dia = (iso: string) => new Date(`${iso}T12:00:00Z`)
    .toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short', timeZone: ZONA });

  return (
    <div className="mapa-leyenda mapa-tiempo">
      {ahora && (
        <p className="mapa-tiempo-ahora">
          <b>{n(ahora.temperatura_C, 0)} °C</b> · {eltiempoEnCastellano(ahora.simbolo)} ·{' '}
          viento <b>{n(ahora.viento_kmh, 0)} km/h</b>
          {ahora.vientoDesde_deg !== null && <> del {n(ahora.vientoDesde_deg, 0)}°</>}
        </p>
      )}
      {lado && (
        <p className="mapa-capas-n">
          <b>De lado sobre la línea: {n(lado.transversal_kmh, 0)} km/h</b> (el viento entra a{' '}
          {n(lado.angulo_deg, 0)}° del eje, que corre a {n(eje, 0)}°). Es la parte que carga los
          apoyos; el resto sopla a lo largo y no los empuja de lado.
        </p>
      )}
      {contra && <p className="mapa-capas-n">{contra.frase}</p>}

      <table className="mapa-tiempo-dias">
        <thead>
          <tr><th>Día</th><th>°C</th><th>Viento máx.</th><th>Lluvia</th><th>Cielo</th></tr>
        </thead>
        <tbody>
          {p.dias.slice(0, 5).map((d) => (
            <tr key={d.dia}>
              <td>{dia(d.dia)}</td>
              <td>{n(d.tempMin_C, 0)}–{n(d.tempMax_C, 0)}</td>
              <td>{n(d.vientoMax_kmh, 0)} km/h</td>
              <td>{n(d.lluvia_mm, 1)} mm</td>
              <td>{eltiempoEnCastellano(d.simbolo)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {avisos.map((a) => <p key={a} className="mapa-capas-n aviso">{a}</p>)}

      <p className="mapa-capas-n">
        <b>Esto no entra en ningún cálculo de la línea.</b> Sirve para decidir la semana —cuadrilla,
        maniobra, acceso—, no para dictaminar: una flecha se calcula con una hipótesis declarada,
        no con el tiempo que va a hacer.
      </p>
      <p className="mapa-capas-n">
        {ATRIBUCION_PRONOSTICO}
        {p.emitido && <> · corrida del modelo: {new Date(p.emitido).toLocaleString('es-CO',
          { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: ZONA })}</>}
        {celda && <> · se preguntó por la celda {celda.lat.toFixed(1)}, {celda.lon.toFixed(1)} —
          redondeada a propósito: quien sirve el tiempo no tiene por qué saber dónde está la línea</>}
      </p>
    </div>
  );
}

