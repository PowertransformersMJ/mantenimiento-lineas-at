// ============================================================================
// vistas/planta.ts — vista en planta de la línea, en SVG
// ----------------------------------------------------------------------------
// Dibuja. No calcula: la geometría se la pide al núcleo. Si algún día hay que
// cambiar de librería de mapas, esto se tira y el cálculo no se entera.
// ============================================================================
import { vincenty, deflexion } from '@lineas/nucleo/geodesia';
import type { Apoyo } from '../datos/demo';

const ANCLA = /retenci|terminal|ángulo|angulo|derivaci/i;

export interface PuntoPlanta {
  apoyo: Apoyo;
  x: number;
  y: number;
  deflexion: number | null;
  esAncla: boolean;
}

/**
 * Proyecta las coordenadas geográficas a un plano local en metros, con origen
 * en el centroide. A la escala de una línea (pocos kilómetros) la deformación
 * es despreciable y evita arrastrar una librería de proyecciones.
 */
export function proyectar(apoyos: Apoyo[]): PuntoPlanta[] {
  const lat0 = apoyos.reduce((s, p) => s + p.lat, 0) / apoyos.length;
  const lon0 = apoyos.reduce((s, p) => s + p.lon, 0) / apoyos.length;
  const mLat = 111132.92 - 559.82 * Math.cos((2 * lat0 * Math.PI) / 180);
  const mLon = 111412.84 * Math.cos((lat0 * Math.PI) / 180);

  return apoyos.map((apoyo, i) => ({
    apoyo,
    x: (apoyo.lon - lon0) * mLon,
    y: (apoyo.lat - lat0) * mLat,
    deflexion: deflexion(apoyos, i),
    esAncla: ANCLA.test(apoyo.funcionEstructural),
  }));
}

export function vanos(apoyos: Apoyo[]): number[] {
  return apoyos.slice(1).map((p, i) => vincenty(apoyos[i].lat, apoyos[i].lon, p.lat, p.lon).d);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/** Devuelve el SVG de la vista en planta. Norte arriba. */
export function dibujarPlanta(apoyos: Apoyo[], ancho = 640, alto = 420): string {
  const pts = proyectar(apoyos);
  const margen = 46;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const spanX = Math.max(...xs) - Math.min(...xs) || 1;
  const spanY = Math.max(...ys) - Math.min(...ys) || 1;
  const escala = Math.min((ancho - 2 * margen) / spanX, (alto - 2 * margen) / spanY);

  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const px = (x: number) => ancho / 2 + (x - cx) * escala;
  const py = (y: number) => alto / 2 - (y - cy) * escala;   // norte arriba

  const traza = pts.map((p) => `${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ');

  const marcas = pts.map((p) => {
    const X = px(p.x).toFixed(1), Y = py(p.y).toFixed(1);
    if (/terminal/i.test(p.apoyo.funcionEstructural)) {
      return `<rect x="${(+X - 4).toFixed(1)}" y="${(+Y - 4).toFixed(1)}" width="8" height="8"
        class="ap-terminal"><title>${esc(p.apoyo.nombre)} · terminal</title></rect>`;
    }
    const cls = p.esAncla ? 'ap-ancla' : 'ap-susp';
    const r = p.esAncla ? 5.5 : 3;
    const def = p.deflexion === null ? '' : ` · deflexión ${p.deflexion.toFixed(1)}°`;
    return `<circle cx="${X}" cy="${Y}" r="${r}" class="${cls}"><title>${esc(p.apoyo.nombre)} · ${esc(p.apoyo.funcionEstructural)}${def}</title></circle>`;
  }).join('');

  const etiquetas = pts
    .filter((p) => p.esAncla)
    .map((p) => `<text x="${(px(p.x) + 9).toFixed(1)}" y="${(py(p.y) + 4).toFixed(1)}" class="ap-lbl">${esc(p.apoyo.nombre)}</text>`)
    .join('');

  return `<svg viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Vista en planta de la línea, norte arriba">
    <polyline points="${traza}" class="traza"/>
    ${marcas}${etiquetas}
    <g class="norte"><line x1="${ancho - 30}" y1="42" x2="${ancho - 30}" y2="20"/><text x="${ancho - 26}" y="26">N</text></g>
  </svg>`;
}
