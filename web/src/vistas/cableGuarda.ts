// ============================================================================
// vistas/cableGuarda.ts — dónde le falta a la línea el cable de guarda
// ----------------------------------------------------------------------------
// QUÉ ES ESTO Y QUÉ NO ES.
//
// El Ingeniero declaró (2026-08-21) que en LN-627 hay tramos sin cable de
// guarda, y que **no es diseño**: es daño acumulado por fallas a lo largo de la
// operación. Este módulo convierte esa declaración —guardada vano a vano en el
// apoyo de aguas arriba— en los TRAMOS que se pintan sobre el mapa, con sus
// metros y su porcentaje.
//
// ⚠️ NO ENTRA EN NINGÚN CÁLCULO. La carga transversal cuenta `3·circuitos` con
// el guarda declaradamente FUERA, y ningún veredicto de apoyo mira aquí. Esto
// es INVENTARIO: dice en qué parte de la línea falta la protección contra
// descargas. Quien lo consuma que no lo convierta en otra cosa sin decirlo.
//
// ⚠️ EL HUECO NO ES UN «SÍ». Un vano sin declarar sale `sin_dato`, nunca
// `presente`. Pintar de sano lo que nadie ha mirado es justo lo que este sistema
// no hace en ninguna otra parte (`ADR-029/032`): el porcentaje se dice SOBRE LA
// LÍNEA ENTERA y al lado va cuántos vanos siguen sin comprobar.
//
// ⚠️ VANOS ENTRE ESTRUCTURAS, no entre puntos. Un empalme no sostiene el
// conductor —en LN-627 hay uno dentro del vano E06→E07— y tomarlo como extremo
// partiría un vano real en dos falsos (`40 §10`). Las distancias las da
// `planta.vanos()`, que ya es el dueño único de ese cálculo: aquí no se
// recalcula ni una.
// ============================================================================
import type { Apoyo } from '@lineas/contratos';
import { nombreVisible, soloEstructuras, vanos } from './planta.ts';

/** Lo que consta de un vano. `sin_dato` = nadie lo ha declarado, NO «lo lleva». */
export type EstadoGuarda = 'presente' | 'ausente' | 'sin_dato';

export interface VanoConGuarda {
  /** El apoyo de aguas arriba: el dueño del dato de este vano. */
  desdeId: string;
  hastaId: string;
  desde: string;
  hasta: string;
  metros: number;
  estado: EstadoGuarda;
}

/** Uno o más vanos consecutivos declarados SIN guarda, ya unidos. */
export interface TramoSinGuarda {
  desde: string;
  hasta: string;
  desdeId: string;
  hastaId: string;
  vanos: VanoConGuarda[];
  metros: number;
}

export interface CableDeGuarda {
  /** Todos los vanos de la línea, en orden. Vacío si no hay dos estructuras. */
  vanos: VanoConGuarda[];
  /** Solo los tramos SIN guarda, ya agrupados. Es lo que se pinta. */
  tramos: TramoSinGuarda[];
  metros: { total: number; sinGuarda: number; conGuarda: number; sinDato: number };
  /** Sobre la línea ENTERA, no sobre lo declarado. `null` si la línea mide 0. */
  pctSinGuarda: number | null;
  /** Cuántos vanos siguen sin que nadie los declare. Se enseña SIEMPRE. */
  nSinDato: number;
  /** Si alguien ha declarado algo. Con `false`, la pantalla no afirma nada. */
  hayDato: boolean;
}

const VACIO: CableDeGuarda = {
  vanos: [], tramos: [],
  metros: { total: 0, sinGuarda: 0, conGuarda: 0, sinDato: 0 },
  pctSinGuarda: null, nSinDato: 0, hayDato: false,
};

/**
 * Lee la línea vano a vano y agrupa los que están declarados sin guarda.
 *
 * El estado de un vano lo pone SU APOYO DE AGUAS ARRIBA. El último apoyo no
 * tiene vano saliente: si trae el campo se ignora, porque no existe el vano al
 * que se referiría.
 */
export function cableDeGuarda(apoyos: Apoyo[]): CableDeGuarda {
  const E = soloEstructuras(apoyos);
  if (E.length < 2) return VACIO;

  const largos = vanos(apoyos);
  const lista: VanoConGuarda[] = E.slice(0, -1).map((a, i) => ({
    desdeId: a.id,
    hastaId: E[i + 1].id,
    desde: nombreVisible(a),
    hasta: nombreVisible(E[i + 1]),
    metros: largos[i] ?? 0,
    estado: a.cableGuardaVanoSaliente ?? 'sin_dato',
  }));

  // Vanos consecutivos sin guarda = UN tramo. Es lo que hace legible el mapa:
  // «E06 a E09» se entiende; tres vanos sueltos pintados por separado, no.
  const tramos: TramoSinGuarda[] = [];
  for (const v of lista) {
    if (v.estado !== 'ausente') continue;
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && ultimo.hastaId === v.desdeId) {
      ultimo.vanos.push(v);
      ultimo.hasta = v.hasta;
      ultimo.hastaId = v.hastaId;
      ultimo.metros += v.metros;
    } else {
      tramos.push({
        desde: v.desde, hasta: v.hasta,
        desdeId: v.desdeId, hastaId: v.hastaId,
        vanos: [v], metros: v.metros,
      });
    }
  }

  const suma = (e: EstadoGuarda) => lista
    .filter((v) => v.estado === e)
    .reduce((s, v) => s + v.metros, 0);
  const total = lista.reduce((s, v) => s + v.metros, 0);
  const sinGuarda = suma('ausente');

  return {
    vanos: lista,
    tramos,
    metros: { total, sinGuarda, conGuarda: suma('presente'), sinDato: suma('sin_dato') },
    pctSinGuarda: total > 0 ? (sinGuarda / total) * 100 : null,
    nSinDato: lista.filter((v) => v.estado === 'sin_dato').length,
    hayDato: lista.some((v) => v.estado !== 'sin_dato'),
  };
}
