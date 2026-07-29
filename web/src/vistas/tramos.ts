// ============================================================================
// vistas/tramos.ts — tabla de tramos de tensión y sus cuatro estados
// ----------------------------------------------------------------------------
// Presenta. El cálculo entero vive en @lineas/nucleo: aquí no hay ni una
// fórmula. Esa frontera es lo que permite auditar la ingeniería sin leer
// código de interfaz.
// ============================================================================
import { tramosDeTension, estadosDelTramo, flechaCatenaria, tiroMaximoAdmisible }
  from '@lineas/nucleo/mecanica';
import type { Apoyo, Conductor, Hipotesis } from '../datos/demo';
import { vanos } from './planta';

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

export function calcularTramos(apoyos: Apoyo[], c: Conductor, h: Hipotesis): FilaTramo[] {
  const L = vanos(apoyos);
  const conductor = {
    w: c.masaLineal, rts: c.rts, S: c.seccion,
    E: c.moduloElastico, alfa: c.dilatacion, diametro: c.diametro,
  };
  const admisible = tiroMaximoAdmisible(c.rts);

  return tramosDeTension(apoyos, L).map((t: any, i: number) => {
    const e = estadosDelTramo(t, conductor, h);
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
      pctRts: (pico / c.rts) * 100,
      flechaMax: flechaCatenaria(c.masaLineal, vanoMax, e.tMax.H),
      excede: pico > admisible,
    };
  });
}

export function dibujarTramos(filas: FilaTramo[], c: Conductor, h: Hipotesis): string {
  const admisible = tiroMaximoAdmisible(c.rts);
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
    ? `<p class="alerta"><b>Atención:</b> ${excedidos.length} tramo(s) superan el 50 % de la carga de
       rotura (${nf(admisible)} kgf): ${excedidos.map((f) => f.n).join(', ')}.</p>`
    : `<p class="ok"><b>Ningún tramo supera</b> el 50 % de la carga de rotura (${nf(admisible)} kgf).
       El máximo es ${nf(Math.max(...filas.map((f) => f.pctRts)), 1)} %.</p>`;

  return `
    <table class="tabla">
      <caption>Estados mecánicos por tramo de tensión · conductor ${c.material} ${c.codigo} ·
        RTS ${nf(c.rts)} kgf · EDS ${h.eds} % a ${h.tEds} °C</caption>
      <thead>
        <tr>
          <th>#</th><th>Tramo</th><th>Vanos</th><th>Vano máx (m)</th><th>VIR (m)</th>
          <th>EDS</th><th>${h.tMax} °C</th><th>Viento</th><th>${h.tMin} °C</th>
          <th>% RTS</th><th>Flecha (m)</th>
        </tr>
      </thead>
      <tbody>${cuerpo}</tbody>
    </table>
    ${veredicto}
    <p class="fine">Tiros en kgf. La flecha es la del vano más largo del tramo, por catenaria exacta,
    con el tiro del estado de ${h.tMax} °C. El vano ideal de regulación (VIR) es √(Σa³/Σa) del tramo:
    por eso cada tramo se calcula con el suyo y nunca con uno único para toda la línea.</p>`;
}
