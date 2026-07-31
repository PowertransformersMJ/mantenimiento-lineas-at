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
import { tramosDeTension, estadosDelTramo, flechaCatenaria, tiroMaximoAdmisible }
  from '@lineas/nucleo/mecanica';
import { vanoViento } from '@lineas/nucleo/geodesia';
import { ampacidad, temperaturaLimite } from '@lineas/nucleo/termica';
import { derivarLevantamiento } from '@lineas/exportar/levantamiento';
import { TARJETAS, MARCO_NORMATIVO, INTRO_FUNDAMENTOS } from '../contenido/fundamentos';
import { conductorParaNucleo, paramsParaNucleo, calcularTramos } from '../vistas/tramos';
import { vanos, soloEstructuras, nombreVisible } from '../vistas/planta';
import { nf } from '../vistas/formato';

const html = (s: string) => <span dangerouslySetInnerHTML={{ __html: s }} />;

interface Ctx {
  filas: ReturnType<typeof calcularTramos>;
  lev: ReturnType<typeof derivarLevantamiento>;
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
      return <>RTS = <b>{nf(c.rts_kgf)} kgf</b> ({c.procedencia === 'catalogo_fabricante' ? 'catálogo, pendiente ficha del proveedor' : c.procedencia}) ·
        EDS = {nf(eds)} kgf ({(eds / c.rts_kgf * 100).toFixed(1)} %) · con viento {nf(vto)} kgf ({(vto / c.rts_kgf * 100).toFixed(1)} %) ·
        tope adoptado (50 % — pendiente de cierre normativo) = {nf(tiroMaximoAdmisible(c.rts_kgf))} kgf.</>;
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
      const tc = c.tempMaxOperacion_C ?? temperaturaLimite(c.material);
      const cond = { material: c.material, seccion: c.seccion_mm2, diametro: c.diametro_m };
      const amb = { v: 0.61, eps: 0.5, abso: 0.5, qs: 1000, he: 10 };
      const i32 = ampacidad(cond, tc, 32, amb);
      const i40 = ampacidad(cond, tc, 40, amb);
      return <>A 32 °C ambiente y {tc} °C en el conductor ({c.tempMaxOperacion_C != null ? 'declarada del conductor' : 'límite típico del material'}):
        <b> {nf(i32)} A</b>. A 40 °C ambiente baja a {nf(i40)} A — IEEE Std 738, viento 0,61 m/s, sol 1 000 W/m².</>;
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

    return { filas, lev, gob, vientoPorApoyo, c: conductor, h: hipotesis };
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
