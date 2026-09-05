// ============================================================================
// componentes/Fundamentos.tsx — la pestaña que enseña la ingeniería
// ----------------------------------------------------------------------------
// Réplica de la pestaña Fundamentos del original con una diferencia de fondo:
// los "valores vivos" no salen de variables del render — los produce el MISMO
// núcleo verificado que usan Mecánico y los exportes, y cada uno declara su
// procedencia. El contenido doctrinal (sin datos de cliente) vive en
// contenido/fundamentos.ts y viaja en el paquete público.
//
// Las fórmulas van en MathML nativo (lo renderizan todos los navegadores
// modernos, sin librerías). Los textos con <b>/<i>/<sub> son contenido
// estático propio: renderizarlos como HTML es seguro aquí.
// ============================================================================
import { useMemo, type ReactNode } from 'react';
import type { Apoyo, Conductor, Hipotesis } from '@lineas/contratos';
import { tramosDeTension, estadosDelTramo, flechaCatenaria, tiroMaximoAdmisible, topeDeTiro }
  from '@lineas/nucleo/mecanica';
import { vanoViento } from '@lineas/nucleo/geodesia';
import { ampacidadDeLinea } from '@lineas/nucleo/termica';
import { derivarLevantamiento } from '@lineas/exportar/levantamiento';
import { TARJETAS, MARCO_NORMATIVO, INTRO_FUNDAMENTOS } from '../contenido/fundamentos';
import { conductorParaNucleo, paramsParaNucleo, calcularTramos } from '../vistas/tramos';
import { selloDeOrigen } from '../vistas/fichaEstructural';
import { diagrama, type IdDiagrama, type DatosDiagrama } from '../vistas/diagramas';
import { vanos, soloEstructuras, nombreVisible } from '../vistas/planta';
import { nf } from '../vistas/formato';
import { Sello } from './Sello';

const html = (s: string) => <span dangerouslySetInnerHTML={{ __html: s }} />;

interface Ctx {
  filas: ReturnType<typeof calcularTramos>;
  lev: ReturnType<typeof derivarLevantamiento>;
  /** Lo que hace que las figuras sean de ESTA línea y no de un libro. */
  datosDiagrama: DatosDiagrama;
  /** Estados mecánicos del tramo que contiene el vano MÁXIMO (gobierna la flecha). */
  gob: { estados: ReturnType<typeof estadosDelTramo>; vanoMax: number; nombre: string } | null;
  vientoPorApoyo: { nombre: string; m: number }[];
  c: Conductor;
  h: Hipotesis;
}

/** El valor que toma cada concepto HOY en esta línea, con su procedencia. */
function valorVivo(id: string, x: Ctx): ReactNode {
  const { gob, c, h } = x;
  switch (id) {
    case 'cat': {
      if (!gob) return null;
      const C = gob.estados.eds.H / c.masaLineal_kg_m;
      return <>En el tramo del vano mayor ({gob.nombre}): H<sub>EDS</sub> = {nf(gob.estados.eds.H)} kgf
        y w = {c.masaLineal_kg_m.toFixed(3)} kg/m → <b>C = {nf(C)} m</b>{C > 1800 ? ' — por encima de la bandera de vibración' : ''}.</>;
    }
    case 'flecha': {
      if (!gob) return null;
      const fMax = flechaCatenaria(c.masaLineal_kg_m, gob.vanoMax, gob.estados.tMax.H);
      const fMin = flechaCatenaria(c.masaLineal_kg_m, gob.vanoMax, gob.estados.tMin.H);
      return <>Vano mayor de {nf(gob.vanoMax, 1)} m: flecha <b>{fMax.toFixed(2)} m a {h.tempMax_C} °C</b> y {fMin.toFixed(2)} m
        a {h.tempMin_C} °C. La diferencia es el recorrido vertical del conductor a lo largo del año —
        <b> sin fluencia</b>: la deuda declarada de docs/40 §8 sigue abierta.</>;
    }
    case 'vir':
      return <>{x.filas.map((f) => (
        <span key={f.n} className="fund-vir">
          Tramo {f.n} · {f.desde.replace('LN-627 ', '')} → {f.hasta.replace('LN-627 ', '')}: {f.nVanos} vano(s), VIR = {nf(f.vir, 1)} m
        </span>
      ))}</>;
    case 'tens': {
      if (!gob) return null;
      const eds = gob.estados.eds.H, vto = gob.estados.viento.H;
      // ⚠️ EL TOPE SE PIDE, NO SE ESCRIBE. Este texto decía «50 %» a mano mientras
      // la FIGURA de esta misma tarjeta ya dibujaba el tope declarado en la
      // hipótesis: el día que se declarara uno propio, el dibujo y el texto de la
      // misma tarjeta habrían dicho cosas distintas (`99 §ADR-051`).
      const tope = topeDeTiro(h);
      return <>RTS = <b>{nf(c.rts_kgf)} kgf</b> ({selloDeOrigen(c.procedencia)}) ·
        EDS = {nf(eds)} kgf ({(eds / c.rts_kgf * 100).toFixed(1)} %) · con viento {nf(vto)} kgf ({(vto / c.rts_kgf * 100).toFixed(1)} %) ·
        tope adoptado ({tope.pct} %{tope.procedencia === 'criterio_clasico'
          ? ' — criterio clásico, pendiente de cierre normativo'
          : ' — declarado en la hipótesis'}) = {nf(tiroMaximoAdmisible(c.rts_kgf, h))} kgf.</>;
    }
    case 'cambio': {
      if (!gob) return null;
      const e = gob.estados;
      return <>Partiendo del EDS ({nf(e.eds.H)} kgf a {h.tempEds_C} °C) resulta <b>{nf(e.tMax.H)} kgf a {h.tempMax_C} °C</b>,{' '}
        {nf(e.tMin.H)} kgf a {h.tempMin_C} °C y {nf(e.viento.H)} kgf con viento de {h.vientoMax_kmh} km/h.</>;
    }
    case 'defl': {
      const conAngulo = x.lev.puntos.filter((p) => p.deflexion_grados != null && p.deflexion_grados > 10);
      if (!conAngulo.length) return <>Sin apoyos con deflexión superior a 10°.</>;
      return <>{conAngulo.map((p) => (
        <span key={p.n} className="fund-vir">
          {p.nombre.replace('LN-627 ', '')}: α = {p.deflexion_grados!.toFixed(2)}° → factor 2·sen(α/2) = {(2 * Math.sin((p.deflexion_grados! * Math.PI) / 360)).toFixed(3)}
        </span>
      ))}</>;
    }
    case 'vanos':
      return <>
        Vano viento por apoyo: {x.vientoPorApoyo.map((v) => `${v.nombre.replace('LN-627 ', '')} ${nf(v.m, 1)} m`).join(' · ')}.
        <br /><b>El vano peso no se puede calcular con este levantamiento:</b> requiere el perfil del
        terreno, y la altimetría GPS (±8 m) no tiene la precisión necesaria. No se inventa.
      </>;
    case 'amp': {
      // ⚠️ AL DUEÑO ÚNICO, y ESTA tarjeta cambia SOLO el ambiente a propósito:
      // su trabajo es demostrar que la ampacidad no es una constante del
      // conductor. Por eso publica una cifra distinta de la de Térmica para
      // «40 °C» — allí el escenario El Niño baja ADEMÁS el viento, y el viento
      // pesa más que el ambiente. Las dos declaran el suyo; lo que faltaba era
      // decir cuál es la diferencia entre las dos (`99 §ADR-093`).
      const ref = ampacidadDeLinea({ conductor: c, hipotesis: h });
      const calor = ampacidadDeLinea({ conductor: c, hipotesis: h, pedida: { ambiente_C: 40 } });
      // ⚠️ ESTA TARJETA DEMUESTRA FÍSICA, ASÍ QUE USA EL NÚMERO CALCULADO —
      // nunca el de registro (`99 §ADR-098`). Si la línea declara la ficha del
      // fabricante, `ampacidad_A` vale lo mismo a 32 °C que a 40 °C (es una
      // constante impresa), y la demostración diría dos veces la misma cifra:
      // justo lo contrario de lo que esta tarjeta existe para enseñar.
      const calculada = (r: typeof ref) =>
        r.naturaleza === 'declarada' ? r.contraste?.enElSitio_A ?? null : r.ampacidad_A;
      const aqui = calculada(ref);
      const a40 = calculada(calor);
      if (aqui == null || a40 == null) {
        return <>{ref.naturaleza === 'declarada'
          ? <>La ampacidad de registro son <b>{nf(ref.ampacidad_A ?? 0)} A</b>, declarados por{' '}
            {ref.fabricante?.fabricante}. No se puede enseñar cuánto pesa el ambiente porque{' '}
            {ref.contraste?.motivo ?? 'falta la geometría del conductor'}.</>
          : ref.motivo}</>;
      }
      return <>{ref.naturaleza === 'declarada' && <>La capacidad de registro son{' '}
        <b>{nf(ref.ampacidad_A ?? 0)} A</b>, los que declara {ref.fabricante?.fabricante} en su
        ficha. Lo que sigue <b>no la reemplaza</b>: enseña cuánto se mueve este mismo conductor con
        el clima, que es lo que la ficha no puede decir.{' '}</>}
        A {ref.condiciones.valores.ambiente_C} °C ambiente y {nf(ref.temperatura.valor_C ?? 0)} °C
        en el conductor: <b>{nf(aqui)} A</b>. Subiendo <b>solo el ambiente</b> a 40 °C baja a{' '}
        {nf(a40)} A — IEEE Std 738, {ref.condiciones.rotulo}.{' '}
        <span className="fine">En la pestaña Térmica verá una cifra menor para 40 °C: aquel
        escenario baja también el viento, que pesa más que el ambiente. Con este mismo conductor,
        el aire quieto deja la capacidad en{' '}
        {ref.sensibilidadViento.length ? nf(ref.sensibilidadViento[0].ampacidad_A) : '—'} A.</span></>;
    }
    case 'terr': {
      if (!gob) return null;
      const fMax = flechaCatenaria(c.masaLineal_kg_m, gob.vanoMax, gob.estados.tMax.H);
      const despejes = h.despejeMinimo_m ? Object.entries(h.despejeMinimo_m) : [];
      return <>Flecha máxima calculada: <b>{fMax.toFixed(2)} m</b> en el vano de {nf(gob.vanoMax, 1)} m.
        <b> La verificación no puede completarse</b> mientras no se declare la altura de sujeción de
        cada apoyo — no se inventa. Mínimos exigidos ({h.normaReferencia ?? 'norma por declarar'}):{' '}
        {despejes.map(([k, v]) => `${k.replaceAll('_', ' ')} ${v} m`).join(' · ')}.</>;
    }
    default:
      return null;
  }
}

export function Fundamentos({ apoyos, conductor, hipotesis }:
  { apoyos: Apoyo[]; conductor: Conductor; hipotesis: Hipotesis }) {

  const ctx = useMemo<Ctx>(() => {
    const E = soloEstructuras(apoyos);
    const L = vanos(apoyos);
    const filas = calcularTramos(apoyos, conductor, hipotesis);
    const lev = derivarLevantamiento(apoyos);

    let gob: Ctx['gob'] = null;
    if (E.length >= 2) {
      const tramos = tramosDeTension(
        E.map((a) => ({ funcionEstructural: a.funcionEstructural, nombre: nombreVisible(a) })), L);
      const iGob = tramos.reduce((im, t, i, arr) =>
        Math.max(...t.vanos) > Math.max(...arr[im].vanos) ? i : im, 0);
      const t = tramos[iGob];
      gob = {
        estados: estadosDelTramo(t, conductorParaNucleo(conductor), paramsParaNucleo(hipotesis)),
        vanoMax: Math.max(...t.vanos),
        nombre: `${t.desde.nombre.replace('LN-627 ', '')} → ${t.hasta.nombre.replace('LN-627 ', '')}`,
      };
    }

    const vientoPorApoyo = E.map((a, i) => ({
      nombre: nombreVisible(a),
      m: vanoViento(i > 0 ? L[i - 1] : null, i < L.length ? L[i] : null),
    })).filter((_, i) => i > 0 && i < E.length - 1);

    // Datos reales para las figuras. Lo que no se pueda calcular se deja fuera:
    // el diagrama cae al caso genérico en vez de dibujar una cifra inventada.
    const mayorDeflexion = lev.puntos.reduce<number | undefined>(
      (m, p) => (p.deflexion_grados != null && (m == null || p.deflexion_grados > m) ? p.deflexion_grados : m),
      undefined);
    const datosDiagrama: DatosDiagrama = {
      vano_m: gob?.vanoMax,
      flechaMax_m: gob ? flechaCatenaria(conductor.masaLineal_kg_m, gob.vanoMax, gob.estados.tMax.H) : undefined,
      flechaMin_m: gob ? flechaCatenaria(conductor.masaLineal_kg_m, gob.vanoMax, gob.estados.tMin.H) : undefined,
      pctEds: gob ? (gob.estados.eds.H / conductor.rts_kgf) * 100 : undefined,
      pctViento: gob ? (gob.estados.viento.H / conductor.rts_kgf) * 100 : undefined,
      // El MISMO dueño que el texto de la tarjeta y que la pestaña Umbrales.
      pctTope: topeDeTiro(hipotesis).pct,
      deflexion_grados: mayorDeflexion,
      vanos_m: filas[0]?.nVanos ? L.slice(0, 4) : undefined,
      tMax_C: hipotesis.tempMax_C,
      tMin_C: hipotesis.tempMin_C,
    };

    return { filas, lev, gob, vientoPorApoyo, datosDiagrama, c: conductor, h: hipotesis };
  }, [apoyos, conductor, hipotesis]);

  return (
    <>
      <section className="panel">
        <h2>Fundamentos del cálculo</h2>
        <p className="fine">{INTRO_FUNDAMENTOS}</p>
        <nav className="chips" aria-label="Índice de conceptos">
          {TARJETAS.map((t) => (
            <a key={t.id} className="chip" href={`#fund-${t.id}`}>{t.titulo}</a>
          ))}
          <a className="chip" href="#fund-normas">Marco normativo</a>
        </nav>
      </section>

      {TARJETAS.map((t) => (
        <section key={t.id} className="panel fund-tarjeta" id={`fund-${t.id}`}>
          <h2>{t.titulo}</h2>
          <p>{html(t.concepto)}</p>
          {/* La FIGURA va entre el concepto y la fórmula: es el orden de lectura del
              módulo original, y es lo que hacía entendible cada concepto en campo.
              Cinco de las nueve se dibujan con los datos REALES de esta línea. */}
          <div className="fund-figura-caja"
               dangerouslySetInnerHTML={{ __html: diagrama(t.id as IdDiagrama, ctx.datosDiagrama) }} />
          <div className="fund-formula" dangerouslySetInnerHTML={{ __html: t.formulaMathML }} />
          <div className="ficha-grilla">
            <div className="ficha-bloque">
              <h3>Cómo se calcula</h3>
              <p className="fund-texto">{html(t.comoSeCalcula)}</p>
            </div>
            <div className="ficha-bloque">
              <h3>Qué vigilar</h3>
              <p className="fund-texto">{html(t.queVigilar)}</p>
            </div>
          </div>
          <p className="fund-vivo"><b>En esta línea, hoy:</b> {valorVivo(t.id, ctx) ?? 'sin datos suficientes.'}</p>
          <Sello hipotesis={hipotesis} conductor={conductor} />
        </section>
      ))}

      <section className="panel" id="fund-normas">
        <h2>Marco normativo de referencia</h2>
        <p className="fine">
          Las hipótesis de cálculo sembradas declaran: <b>{hipotesis.normaReferencia ?? 'sin norma declarada'}</b>.
          Cada cifra de este sistema debe poder señalar la suya.
        </p>
        <div className="tabla-caja">
          <table className="tabla">
            <caption>Normas de referencia del expediente de la línea</caption>
            <thead><tr><th>Norma</th><th>Qué rige aquí</th></tr></thead>
            <tbody>
              {MARCO_NORMATIVO.map((n) => (
                <tr key={n.norma}>
                  <td className="fund-norma">{n.norma}</td>
                  <td>{n.queRige}{n.nota && <p className="advertencia">{n.nota}</p>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
