// ============================================================================
// vistas/tramos.ts — tabla de tramos de tensión y sus cuatro estados
// ----------------------------------------------------------------------------
// Presenta. El cálculo entero vive en @lineas/nucleo: aquí no hay ni una
// fórmula. Esa frontera es lo que permite auditar la ingeniería sin leer código
// de interfaz.
// ============================================================================
import { tramosDeTension, estadosDelTramo, flechaCatenaria, tiroMaximoAdmisible }
  from '@lineas/nucleo/mecanica';
import type { Apoyo, Conductor, Hipotesis } from '@lineas/contratos';
import { vanos, soloEstructuras, nombreVisible } from './planta';

const nf = (v: number, d = 0) =>
  v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });

export interface FilaTramo {
  n: number;
  desde: string;
  hasta: string;
  nVanos: number;
  vanoMax: number;
  vir: number;
  hEds: number;
  hTMax: number;
  hViento: number;
  hTMin: number;
  pico: number;
  pctRts: number;
  flechaMax: number;
  excede: boolean;
}

// El núcleo trabaja con nombres neutros: estas dos traducciones del contrato
// hacia él tienen UN solo dueño (también las usa Fundamentos).
export const conductorParaNucleo = (c: Conductor) => ({
  w: c.masaLineal_kg_m, rts: c.rts_kgf, S: c.seccion_mm2,
  E: c.moduloElastico_kg_mm2, alfa: c.dilatacion_1_C, diametro: c.diametro_m,
});
export const paramsParaNucleo = (h: Hipotesis) => ({
  eds: h.eds_pct, tEds: h.tempEds_C, tMax: h.tempMax_C, tMin: h.tempMin_C,
  vViento: h.vientoMax_kmh, tViento: h.tempViento_C, cx: h.cx, rho: h.densidadAire_kg_m3,
});

export function calcularTramos(todos: Apoyo[], c: Conductor, h: Hipotesis): FilaTramo[] {
  // Solo estructuras: un empalme no sostiene el conductor y contarlo partiría
  // un vano real en dos falsos (ver `soloEstructuras`).
  const apoyos = soloEstructuras(todos);
  if (apoyos.length < 2) return [];
  const L = vanos(apoyos);

  const paraNucleo = apoyos.map((a) => ({
    funcionEstructural: a.funcionEstructural,
    nombre: nombreVisible(a),
  }));
  const conductor = conductorParaNucleo(c);
  const params = paramsParaNucleo(h);
  const admisible = tiroMaximoAdmisible(c.rts_kgf);

  return tramosDeTension(paraNucleo, L).map((t: any, i: number) => {
    const e = estadosDelTramo(t, conductor, params);
    const vanoMax = Math.max(...t.vanos);
    const pico = Math.max(e.eds.H, e.tMax.H, e.viento.H, e.tMin.H);
    return {
      n: i + 1,
      desde: t.desde.nombre,
      hasta: t.hasta.nombre,
      nVanos: t.vanos.length,
      vanoMax,
      vir: t.vir,
      hEds: e.eds.H,
      hTMax: e.tMax.H,
      hViento: e.viento.H,
      hTMin: e.tMin.H,
      pico,
      pctRts: (pico / c.rts_kgf) * 100,
      flechaMax: flechaCatenaria(c.masaLineal_kg_m, vanoMax, e.tMax.H),
      excede: pico > admisible,
    };
  });
}

export function dibujarTramos(filas: FilaTramo[], c: Conductor, h: Hipotesis): string {
  if (!filas.length) return '';
  const admisible = tiroMaximoAdmisible(c.rts_kgf);

  const cuerpo = filas.map((f) => `
    <tr${f.excede ? ' class="excede"' : ''}>
      <td class="num">${f.n}</td>
      <td>${f.desde} → ${f.hasta}</td>
      <td class="num">${f.nVanos}</td>
      <td class="num">${nf(f.vanoMax, 1)}</td>
      <td class="num">${nf(f.vir, 1)}</td>
      <td class="num">${nf(f.hEds)}</td>
      <td class="num">${nf(f.hTMax)}</td>
      <td class="num">${nf(f.hViento)}</td>
      <td class="num">${nf(f.hTMin)}</td>
      <td class="num destaca">${nf(f.pctRts, 1)} %</td>
      <td class="num">${nf(f.flechaMax, 2)}</td>
    </tr>`).join('');

  const excedidos = filas.filter((f) => f.excede);
  const veredicto = excedidos.length
    ? `<p class="alerta"><b>Atención:</b> ${excedidos.length} tramo(s) superan el umbral adoptado
       (${nf(admisible)} kgf): ${excedidos.map((f) => f.n).join(', ')}.</p>`
    : `<p class="ok">Ningún tramo supera el umbral adoptado de ${nf(admisible)} kgf.
       El máximo es ${nf(Math.max(...filas.map((f) => f.pctRts)), 1)} %.</p>`;

  return `
    <table class="tabla">
      <caption>Estados mecánicos por tramo de tensión · conductor ${c.material} ${c.codigo} ·
        RTS ${nf(c.rts_kgf)} kgf · EDS ${h.eds_pct} % a ${h.tempEds_C} °C</caption>
      <thead>
        <tr>
          <th>#</th><th>Tramo</th><th>Vanos</th><th>Vano máx (m)</th><th>VIR (m)</th>
          <th>EDS</th><th>${h.tempMax_C} °C</th><th>Viento</th><th>${h.tempMin_C} °C</th>
          <th>% RTS</th><th>Flecha (m)</th>
        </tr>
      </thead>
      <tbody>${cuerpo}</tbody>
    </table>
    ${veredicto}
    <p class="fine">Tiros en kgf. La flecha es la del vano más largo del tramo, por catenaria exacta,
    con el tiro del estado de ${h.tempMax_C} °C. El vano ideal de regulación (VIR) es √(Σa³/Σa) del
    tramo: por eso cada tramo se calcula con el suyo y nunca con uno único para toda la línea.</p>
    <p class="fine"><b>Este cálculo no es un dictamen firmable.</b> El umbral, las hipótesis
    climáticas y la distancia al terreno están pendientes de cerrarse contra norma y contra la ficha
    del proveedor. Ver el historial de decisiones del proyecto.</p>`;
}
