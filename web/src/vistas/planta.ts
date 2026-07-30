// ============================================================================
// vistas/planta.ts — geometría de la vista en planta
// ----------------------------------------------------------------------------
// Devuelve DATOS, no marcado. React se encarga de pintarlos.
// Así la geometría se puede probar sin navegador, y cambiar de framework no
// obliga a reescribir el cálculo de posiciones.
//
// No calcula ingeniería: eso se lo pide al núcleo. Y no inventa: sin apoyos,
// devuelve null.
// ============================================================================
import { vincenty, deflexion } from '@lineas/nucleo/geodesia';
import { FUNCIONES_ANCLA, type Apoyo } from '@lineas/contratos';

interface PuntoGeo { lat: number; lon: number }
const aGeo = (a: Apoyo): PuntoGeo => ({ lat: a.coordenada.lat, lon: a.coordenada.lon });

export interface PuntoPlanta {
  apoyo: Apoyo;
  x: number;
  y: number;
  deflexion: number | null;
  esAncla: boolean;
}

/**
 * Proyecta a un plano local en metros con origen en el centroide. A la escala de
 * una línea la deformación es despreciable y evita arrastrar una librería de
 * proyecciones entera.
 */
export function proyectar(apoyos: Apoyo[]): PuntoPlanta[] {
  if (!apoyos.length) return [];
  const geo = apoyos.map(aGeo);
  const lat0 = geo.reduce((s, p) => s + p.lat, 0) / geo.length;
  const lon0 = geo.reduce((s, p) => s + p.lon, 0) / geo.length;
  const mLat = 111132.92 - 559.82 * Math.cos((2 * lat0 * Math.PI) / 180);
  const mLon = 111412.84 * Math.cos((lat0 * Math.PI) / 180);

  return apoyos.map((apoyo, i) => ({
    apoyo,
    x: (apoyo.coordenada.lon - lon0) * mLon,
    y: (apoyo.coordenada.lat - lat0) * mLat,
    deflexion: deflexion(geo, i),
    esAncla: FUNCIONES_ANCLA.includes(apoyo.funcionEstructural),
  }));
}

export function vanos(apoyos: Apoyo[]): number[] {
  const g = apoyos.map(aGeo);
  return g.slice(1).map((p, i) => vincenty(g[i].lat, g[i].lon, p.lat, p.lon).d);
}

export interface Marca {
  id: string; x: number; y: number; r: number;
  clase: string; forma: 'punto' | 'cuadro'; titulo: string;
}
export interface Etiqueta { id: string; x: number; y: number; texto: string }
export interface GeometriaSvg {
  ancho: number; alto: number; traza: string;
  marcas: Marca[]; etiquetas: Etiqueta[];
}

const nombreDe = (a: Apoyo) => a.nombreNormalizado ?? a.nombreCampo;

/**
 * Posiciones ya resueltas para pintar. null si no hay línea que dibujar.
 *
 * El lienzo se ADAPTA a la forma de la línea, no al revés. LN-627 corre 2,9 km
 * de norte a sur en poco más de 1 km de ancho: encajarla en un lienzo apaisado
 * la deja diminuta y arrinconada. Una línea alta pide un dibujo alto.
 */
export function geometriaSvg(apoyos: Apoyo[], ancho = 640): GeometriaSvg | null {
  const pts = proyectar(apoyos);
  if (pts.length < 2) return null;

  const margen = 46;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const spanX = Math.max(...xs) - Math.min(...xs) || 1;
  const spanY = Math.max(...ys) - Math.min(...ys) || 1;

  // Alto proporcional a la forma real del trazado, con topes para que ni una
  // línea casi recta quede como una raya ni una muy larga ocupe media pantalla.
  const util = ancho - 2 * margen;
  const alto = Math.round(
    Math.min(900, Math.max(300, (spanY / spanX) * util + 2 * margen)),
  );
  const escala = Math.min(util / spanX, (alto - 2 * margen) / spanY);

  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const px = (x: number) => +(ancho / 2 + (x - cx) * escala).toFixed(1);
  const py = (y: number) => +(alto / 2 - (y - cy) * escala).toFixed(1);   // norte arriba

  return {
    ancho, alto,
    traza: pts.map((p) => `${px(p.x)},${py(p.y)}`).join(' '),
    marcas: pts.map((p) => {
      const def = p.deflexion === null ? '' : ` · deflexión ${p.deflexion.toFixed(1)}°`;
      const esTerminal = p.apoyo.funcionEstructural === 'Terminal';
      return {
        id: p.apoyo.id,
        x: px(p.x), y: py(p.y),
        r: p.esAncla ? 5.5 : 3,
        clase: esTerminal ? 'ap-terminal' : p.esAncla ? 'ap-ancla' : 'ap-susp',
        forma: esTerminal ? 'cuadro' : 'punto',
        titulo: `${nombreDe(p.apoyo)} · ${p.apoyo.funcionEstructural}${def}`,
      } satisfies Marca;
    }),
    etiquetas: pts.filter((p) => p.esAncla).map((p) => ({
      id: p.apoyo.id,
      x: px(p.x) + 9,
      y: py(p.y) + 4,
      texto: nombreDe(p.apoyo),
    })),
  };
}
