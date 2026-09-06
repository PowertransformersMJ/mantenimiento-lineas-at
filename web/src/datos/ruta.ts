
import { HASH_ATLAS, type ClaveAtlas } from '../vistas/atlasCatalogo.ts';
export { HASH_ATLAS };
export type { ClaveAtlas };// ============================================================================
// datos/ruta.ts — la gramática de direcciones, sola y sin dependencias
// ----------------------------------------------------------------------------
// Vive aparte de `enlace.ts` para poder PROBARSE. `enlace.ts` arrastra el SDK de
// Firebase, así que una prueba que lo importara se traería 725 kB y una sesión
// que no existe. Copiar la expresión regular dentro de la prueba habría sido el
// pecado que este proyecto ya tiene documentado (`33 · L-19`): la misma regla en
// dos sitios diverge, y el día que lo haga nadie se entera.
//
// Aquí hay una regla y un dueño. La prueba importa ESTA función.
// ============================================================================
/**
 * LA GRAMÁTICA DE DIRECCIONES, y por qué existe.
 *
 * Hasta hoy la dirección solo sabía de línea y pestaña, y del análisis de causa
 * raíz no guardaba nada. Consecuencias que sufre un EQUIPO, no una persona:
 * no había enlace que pegar en un correo —había que explicar de palabra cómo
 * llegar—; recargar dentro de un expediente devolvía a la línea; y el botón
 * Atrás, agotados sus pasos, sacaba de la aplicación con el trabajo dentro.
 *
 * Peor todavía: la dirección SÍ llevaba el código de línea, pero al abrirla se
 * descartaba y siempre se cargaba la primera del parque. Con dos líneas, dos
 * ingenieros pueden discutir cifras creyendo que miran la misma.
 *
 *   #/sol            → el atlas solar del Caribe (no depende de ninguna línea)
 *   #/temperatura    → el atlas de temperatura del aire
 *   #/viento         → el atlas de viento
 *   #/lluvia         → el atlas de lluvia
 *   #/rca            → el índice de análisis
 *   #/rca/<codigo>   → un análisis concreto
 *   #/personas       → administrar personas (de ORGANIZACIÓN, no de línea)
 *   #/<linea>/<pest> → una línea en una pestaña (ya existía y no se toca)
 */
/** Los atlas regionales. La clave es la del componente, no un texto suelto. */
/**
 * QUÉ ATLAS EXISTEN Y QUÉ DIRECCIÓN LOS ABRE — **no se define aquí** (`§ADR-068`).
 *
 * Vivía en este archivo una segunda copia del tipo y una segunda tabla de
 * direcciones, con su propio aviso de que «con dos listas, un día
 * `#/temperatura` abriría el solar». El aviso era correcto y por eso ya no hay
 * dos listas: las dos salen de `vistas/atlasCatalogo.ts`.
 */

const POR_HASH: Record<string, ClaveAtlas> = Object.fromEntries(
  Object.entries(HASH_ATLAS).map(([clave, hash]) => [hash.replace('#/', ''), clave as ClaveAtlas]),
);

export type Ruta =
  | { tipo: 'atlas'; cual: ClaveAtlas }
  | { tipo: 'rca'; codigo?: string }
  /**
   * Personas. Sin segundo tramo: no cuelga de ninguna línea, y por eso se
   * escribe igual que un atlas. Si alguien pega `#/personas/algo` cae al caso de
   * línea y el código «personas» no existirá — una dirección inventada no debe
   * abrir una pantalla real.
   */
  | { tipo: 'personas' }
  | { tipo: 'linea'; codigo: string; pestana?: string }
  | null;

export function leerRuta(hash = location.hash): Ruta {
  const m = /^#\/([^/]+)(?:\/([^/]+))?\/?$/.exec(hash);
  if (!m) return null;
  const [, a, b] = m;
  // Un atlas no lleva segundo tramo: no es de ninguna línea. Si alguien pega
  // `#/sol/algo`, cae al caso de línea y el código «sol» no existirá — que es lo
  // correcto: una dirección inventada no debe abrir una pantalla real.
  if (!b && POR_HASH[a]) return { tipo: 'atlas', cual: POR_HASH[a] };
  if (!b && a === 'personas') return { tipo: 'personas' };
  if (a === 'rca') return { tipo: 'rca', codigo: b ? decodeURIComponent(b) : undefined };
  return { tipo: 'linea', codigo: decodeURIComponent(a), pestana: b };
}
