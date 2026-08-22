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
  const admisible = tiroMaximoAdmisible(c.rts_kgf, h);

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

// ⚠️ AQUÍ VIVÍA UNA SEGUNDA TABLA DE TRAMOS COMPLETA (`dibujarTramos`), con su
// PROPIO tope de tiro y sus propios textos de veredicto, y no la llamaba nadie:
// buscada en todo el proyecto aparecía UNA sola vez, en su propia definición.
// Se retira el 22-08 (`99 §ADR-051`). Mientras estuvo ahí, quien fuera a
// corregir un texto podía corregirlo en la copia equivocada, ver la prueba en
// verde y creer que quedó hecho (`30 · L-28`).
