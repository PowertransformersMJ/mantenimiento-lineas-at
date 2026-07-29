// ============================================================================
// datos/demo.ts — LÍNEA DE DEMOSTRACIÓN, SINTÉTICA
// ----------------------------------------------------------------------------
// ⚠️ Estas coordenadas NO son de ninguna línea real. Están inventadas para que
// el caparazón público muestre el motor funcionando sin exponer infraestructura
// de cliente. Las líneas reales llegan por sincronización autenticada y NUNCA
// viajan dentro del paquete que se publica.
//
// Ver docs/30-LECCIONES.md · L-07 y docs/99-HISTORIAL-ADR.md · ADR-001.
// ============================================================================

export interface Apoyo {
  n: number;
  nombre: string;
  lat: number;
  lon: number;
  cota: number;
  funcionEstructural: string;
}

export interface Conductor {
  codigo: string;
  material: string;
  seccion: number;      // mm²
  diametro: number;     // m
  masaLineal: number;   // kg/m
  rts: number;          // kgf
  moduloElastico: number;  // kg/mm²
  dilatacion: number;      // 1/°C
}

export interface Hipotesis {
  eds: number;      // % de la RTS
  tEds: number;     // °C
  tMax: number;     // °C
  tMin: number;     // °C
  vViento: number;  // km/h
  tViento: number;  // °C
  cx: number;
  rho: number;      // kg/m³
}

/** Línea inventada de 12 apoyos con dos quiebres, para demostrar el cálculo. */
export const LINEA_DEMO: Apoyo[] = [
  { n: 1,  nombre: 'D-01', lat: 10.400000, lon: -75.400000, cota: 12, funcionEstructural: 'Terminal' },
  { n: 2,  nombre: 'D-02', lat: 10.400900, lon: -75.399100, cota: 14, funcionEstructural: 'Suspensión' },
  { n: 3,  nombre: 'D-03', lat: 10.401800, lon: -75.398200, cota: 18, funcionEstructural: 'Suspensión' },
  { n: 4,  nombre: 'D-04', lat: 10.402700, lon: -75.397300, cota: 24, funcionEstructural: 'Retención / anclaje' },
  { n: 5,  nombre: 'D-05', lat: 10.403100, lon: -75.395800, cota: 26, funcionEstructural: 'Suspensión' },
  { n: 6,  nombre: 'D-06', lat: 10.403500, lon: -75.394300, cota: 22, funcionEstructural: 'Suspensión' },
  { n: 7,  nombre: 'D-07', lat: 10.403900, lon: -75.392800, cota: 16, funcionEstructural: 'Suspensión angular' },
  { n: 8,  nombre: 'D-08', lat: 10.404200, lon: -75.391200, cota: 11, funcionEstructural: 'Suspensión' },
  { n: 9,  nombre: 'D-09', lat: 10.404500, lon: -75.389600, cota: 9,  funcionEstructural: 'Retención / anclaje' },
  { n: 10, nombre: 'D-10', lat: 10.403300, lon: -75.389000, cota: 15, funcionEstructural: 'Suspensión' },
  { n: 11, nombre: 'D-11', lat: 10.401200, lon: -75.388000, cota: 21, funcionEstructural: 'Suspensión' },
  { n: 12, nombre: 'D-12', lat: 10.399000, lon: -75.387000, cota: 19, funcionEstructural: 'Terminal' },
];

/** AAAC Darien — datos de catálogo, no de cliente. */
export const CONDUCTOR_DEMO: Conductor = {
  codigo: 'Darien',
  material: 'AAAC',
  seccion: 283.5,
  diametro: 0.02179,
  masaLineal: 0.776,
  rts: 8528,
  moduloElastico: 6300,
  dilatacion: 23.0e-6,
};

export const HIPOTESIS_DEMO: Hipotesis = {
  eds: 20, tEds: 28, tMax: 75, tMin: 22,
  vViento: 100, tViento: 28, cx: 1.0, rho: 1.20,
};
