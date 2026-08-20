// ============================================================================
// vistas/fichaLote.ts — EL DATO DE CATÁLOGO APLICADO A VARIOS APOYOS
// ----------------------------------------------------------------------------
// QUÉ ES. La mitad pura de la pantalla del lote. La ESCRITURA ya existía desde
// `ADR-030` con todas sus salvaguardas (`datos/firestore.ts`,
// `guardarFichaApoyoEnLote`); lo que no existía era por dónde pedirlo, y por eso
// el lote se declaraba en pantalla como ausencia en vez de fingirse. Esto es esa
// mitad: quién puede recibir el dato, quién queda fuera y por qué, dicho ANTES
// de mandar nada.
//
// POR QUÉ EXISTE ESTE ARCHIVO Y NO VIVE EN EL .TSX. La misma razón que
// `fichaEstructural.ts`: React pinta y pregunta. Si la pantalla decidiera por su
// cuenta quién es elegible, tendríamos dos jueces del mismo hecho —ella y la
// escritura— y el día que discreparan el botón se encendería sobre un apoyo que
// la base va a rechazar, o se apagaría sobre uno perfectamente escribible. Aquí
// se ESPEJA la regla de la escritura, y `tests/ficha-lote.test.js` comprueba que
// las dos dicen lo mismo leyendo el fuente de la escritura.
//
// LAS CUATRO REGLAS ESPEJADAS, en el mismo orden en que la escritura las aplica:
//
//   1. SOLO LOS TRES CAMPOS DEL MODELO —carga de rotura, capacidad a lo largo y
//      tipo de apoyo—. Los otros tres dependen del terreno y de qué hace ese
//      apoyo en la línea: no van por lote NUNCA, y aquí tampoco hay puerta
//      trasera. Si el borrador trae uno, esto lo NOMBRA y no deja seguir.
//   2. SOLO ESTRUCTURAS. Un empalme no sostiene el conductor y no tiene
//      veredicto que desbloquear.
//   3. SOLO RELLENA HUECOS, y el hueco se mide contra LOS CAMPOS QUE SE VAN A
//      ESCRIBIR, no contra los tres siempre: quien ya declara el tipo de apoyo
//      puede recibir perfectamente una carga de rotura. Un apoyo que ya declara
//      alguno de los que viajan queda fuera y se DICE cuál — así es como se
//      pierde un dato medido debajo de uno de catálogo, y no se pierde.
//   4. EL CERROJO POR DOCUMENTO. Cada apoyo viaja con la revisión que la
//      pantalla leyó; la escritura es ATÓMICA y si a uno lo tocó otra persona no
//      entra ninguno.
// ============================================================================
import type { Apoyo } from '@lineas/contratos';
import { nombreVisible } from './planta.ts';
import {
  CAMPOS_DE_FICHA, CAMPOS_POR_LOTE, fichaDelBorrador,
  type BorradorDeFicha, type CampoDeFicha, type ResultadoDelBorrador,
} from './fichaEstructural.ts';

/**
 * Los tres campos que el lote ofrece, en el orden del formulario de la ficha.
 *
 * Se derivan de `CAMPOS_DE_FICHA` y NO se vuelven a listar a mano: una segunda
 * lista sería una segunda verdad, y el día que un campo cambiara de bando
 * (`porLote`) la pantalla seguiría ofreciendo el de ayer.
 */
export const CAMPOS_DEL_LOTE: readonly CampoDeFicha[] = Object.freeze(
  CAMPOS_DE_FICHA.filter((c) => c.porLote),
);

/** Los que NO van por lote, para poder nombrarlos cuando alguien lo intente. */
export const CAMPOS_QUE_NO_VAN_POR_LOTE: readonly CampoDeFicha[] = Object.freeze(
  CAMPOS_DE_FICHA.filter((c) => !c.porLote),
);

// ════════════════════════════════════════════════════════════════════════════
// 1 · LO QUE SE VA A ESCRIBIR
// ════════════════════════════════════════════════════════════════════════════

export interface ResultadoDelLote extends ResultadoDelBorrador {
  /**
   * Los campos de EJEMPLAR que el borrador trae y el lote no puede aplicar.
   *
   * No es un aviso decorativo: mientras haya uno, no se puede mandar nada. La
   * escritura lo rechazaría igual —y ahí está la salvaguarda de verdad—, pero
   * enterarse después de marcar veinte apoyos y rellenar el formulario es la
   * forma más rápida de que nadie vuelva a usar la pantalla.
   */
  deEjemplar: string[];
}

/**
 * DEL BORRADOR A LO QUE EL LOTE PUEDE MANDAR.
 *
 * Reusa `fichaDelBorrador` entero —las conversiones, las cuatro reglas del molde
 * y los mensajes son los mismos que en la ficha de un apoyo— y le añade el ÚNICO
 * corte propio del lote: que no viaje ningún campo del ejemplar.
 */
export function fichaDeLote(b: BorradorDeFicha): ResultadoDelLote {
  const r = fichaDelBorrador(b);
  if (!r.ficha) return { ...r, deEjemplar: [] };

  const ficha = r.ficha as unknown as Record<string, unknown>;
  const deEjemplar = CAMPOS_QUE_NO_VAN_POR_LOTE
    .filter((c) => ficha[c.clave] !== undefined)
    .map((c) => c.etiqueta.toLowerCase());

  // Con un campo de ejemplar dentro NO se manda nada: se devuelve `ficha: null`
  // y el motivo entra en `faltan`, que es lo que la pantalla ya sabe pintar.
  if (deEjemplar.length) {
    return {
      ficha: null,
      campos: r.campos,
      noViajan: r.noViajan,
      deEjemplar,
      faltan: [
        ...r.faltan,
        `no se puede aplicar a varios apoyos: ${deEjemplar.join(', ')}. `
        + `Depende${deEjemplar.length === 1 ? '' : 'n'} del terreno y de qué hace cada apoyo en la `
        + 'línea, así que se pone uno a uno',
      ],
    };
  }
  return { ...r, deEjemplar: [] };
}

/**
 * QUÉ CAMPOS VIAJAN de verdad en esta ficha.
 *
 * Espejo exacto de la línea de la escritura que decide contra qué se mide el
 * hueco: `CAMPOS_POR_LOTE.filter((k) => validada[k] !== undefined)`. Si aquí se
 * midiera contra los tres siempre, un apoyo que ya declara el tipo quedaría
 * fuera de un lote que solo trae la carga de rotura — y la pantalla estaría
 * negando algo que la base sí escribe.
 */
export function clavesDeLaFicha(ficha: unknown): string[] {
  const f = (ficha ?? {}) as Record<string, unknown>;
  return CAMPOS_POR_LOTE.filter((k) => f[k] !== undefined);
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · A QUIÉN SE LE PUEDE APLICAR
// ════════════════════════════════════════════════════════════════════════════

export interface CandidatoDeLote {
  id: string;
  nombre: string;
  /** La revisión que la pantalla leyó. Viaja con el lote: es el cerrojo. */
  revision: number;
  /** `true` si con ESTA ficha el apoyo puede recibir el dato. */
  elegible: boolean;
  /** Los campos que viajan y este apoyo YA declara, por su etiqueta. */
  yaDeclara: string[];
  /** Por qué no puede recibirlo, en su idioma. `null` si sí puede. */
  motivo: string | null;
}

const esEstructura = (a: Apoyo): boolean => ((a?.tipoPunto ?? 'Estructura') === 'Estructura');

/**
 * TODOS los puntos de la línea, cada uno con su veredicto de elegibilidad para
 * ESTA ficha.
 *
 * Devuelve también los NO elegibles a propósito: una lista que solo enseña a los
 * que pueden recibir el dato esconde justo la información que hace falta para
 * confiar en el resultado —por qué E07 no está—, y quien no la ve supone que se
 * perdió. Que un apoyo quede fuera es información, no ruido.
 *
 * ⚠️ El orden es el de la línea (`orden`), no el de la base: la lista se lee
 * caminando la línea, y un lote se decide por tramos.
 */
export function candidatosDeLote(apoyos: Apoyo[], claves: string[]): CandidatoDeLote[] {
  const etiqueta = (k: string) => CAMPOS_DE_FICHA.find((c) => c.clave === k)?.etiqueta ?? k;
  return [...(apoyos ?? [])]
    .sort((x, y) => (x.orden ?? 0) - (y.orden ?? 0))
    .map((a) => {
      const base = { id: a.id, nombre: nombreVisible(a), revision: a.revision ?? 0 };

      if (!esEstructura(a)) {
        return {
          ...base,
          elegible: false,
          yaDeclara: [],
          motivo: 'no es una estructura: un empalme no sostiene el conductor y no tiene veredicto '
            + 'que desbloquear',
        };
      }

      const registro = a as unknown as Record<string, unknown>;
      const yaDeclara = (claves ?? [])
        .filter((k) => registro[k] !== undefined && registro[k] !== null)
        .map(etiqueta);

      if (yaDeclara.length) {
        return {
          ...base,
          elegible: false,
          yaDeclara,
          motivo: `ya declara ${yaDeclara.join(' y ').toLowerCase()}: el lote solo rellena huecos, `
            + 'para cambiar un dato que ya está se hace uno a uno y mirándolo',
        };
      }

      // Sin ficha todavía no hay nada contra qué medir el hueco: el apoyo es
      // elegible «en principio», y la pantalla lo dice así en vez de prometer.
      return { ...base, elegible: true, yaDeclara: [], motivo: null };
    });
}

export interface ResumenDeLote {
  /** Los marcados que SÍ van a recibir el dato. */
  recibiran: CandidatoDeLote[];
  /** Los marcados que la escritura dejaría fuera, con su motivo. */
  quedanFuera: CandidatoDeLote[];
  /** Los elegibles que él NO ha marcado. Se cuentan: un olvido es caro. */
  sinMarcar: CandidatoDeLote[];
}

/**
 * QUÉ VA A PASAR CON LO MARCADO, antes de pulsar.
 *
 * La escritura es ATÓMICA y solo rellena huecos: si se manda un apoyo que ya
 * declara el dato, no falla —se salta y lo nombra en el acuse—, pero enterarse
 * después es peor que saberlo antes. Aquí se separan los tres montones para que
 * el botón pueda decir exactamente a cuántos escribe.
 */
export function resumenDeLote(
  candidatos: CandidatoDeLote[],
  marcados: ReadonlySet<string> | string[],
): ResumenDeLote {
  const set = marcados instanceof Set ? marcados : new Set(marcados ?? []);
  const recibiran: CandidatoDeLote[] = [];
  const quedanFuera: CandidatoDeLote[] = [];
  const sinMarcar: CandidatoDeLote[] = [];

  for (const c of candidatos ?? []) {
    if (!set.has(c.id)) {
      if (c.elegible) sinMarcar.push(c);
      continue;
    }
    if (c.elegible) recibiran.push(c);
    else quedanFuera.push(c);
  }
  return { recibiran, quedanFuera, sinMarcar };
}

/**
 * El mapa `apoyo → revisión` que viaja con el lote.
 *
 * Se arma desde los MISMOS candidatos que se enseñaron, no volviendo a leer los
 * apoyos: lo que viaja tiene que ser la revisión que él vio en pantalla. Si
 * mientras tanto otra persona guardó, la escritura lo caza y no entra nadie —
 * que es exactamente lo que se quiere.
 */
export function revisionesDe(candidatos: CandidatoDeLote[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const c of candidatos ?? []) r[c.id] = c.revision;
  return r;
}
