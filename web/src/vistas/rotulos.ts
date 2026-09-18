// ============================================================================
// vistas/rotulos.ts — cómo se NOMBRA en pantalla lo que ya tiene código
// ----------------------------------------------------------------------------
// DUEÑO ÚNICO de dos traducciones que estaban repartidas por los componentes, o
// a punto de estarlo:
//
//   ① EL PREFIJO DE LA SERIE EN EL NOMBRE DE UN PUNTO. Ocho sitios de cuatro
//     pantallas escribían `.replace('LN-627 ', '')` — el código de una línea
//     concreta, a mano, dentro del componente. Funcionaba porque hasta hoy solo
//     había una línea. Con LN-617 y LN-628 dentro, esos ocho sitios habrían
//     seguido recortando «LN-627 » y habrían dejado los nombres de las otras dos
//     enteros: la tabla de distancias de LN-617 mostraría «TR-618 E07» en cada
//     cabecera de una columna de 40 px. Y al revés es peor: el día que alguien
//     renombre LN-627, ocho pantallas se quedan con el recorte viejo.
//
//   ② EL RÓTULO DE UN TRAMO COMPARTIDO. «TR-618» es el código; lo que se lee en
//     pantalla es «tramo compartido 618» (`contratos/src/activos.ts §Codigo-
//     TramoCompartido`). Se traduce AQUÍ y en ningún otro sitio: repartido por
//     los componentes, el día que la frase cambie habrá pantallas que digan una
//     cosa y pantallas que digan otra sobre la misma línea.
//
// NO CALCULA NADA y no sabe de React: son funciones de texto, y por eso se
// pueden probar con `node --test` sin montar una pantalla.
// ============================================================================

/**
 * EL NOMBRE DE UN PUNTO, SIN EL PREFIJO DE SU SERIE.
 *
 * `sinPrefijoDeSerie('LN-627 E06', ['LN-627'])` → `'E06'`, que es exactamente lo
 * que devolvía el `.replace('LN-627 ', '')` que sustituye: LN-627 se ve igual
 * que antes, letra por letra.
 *
 * ⚠️ SE LE PASAN LOS CÓDIGOS, NO SE ADIVINAN. La tentación era recortar con una
 * expresión regular tipo `^[A-Z]{2}-\d+ ` y ahorrarse el parámetro, y sería un
 * error: el molde NO exige ninguna forma al código de una línea
 * (`contratos/src/activos.ts:395` es un `string` a secas), así que una línea
 * llamada «Sur 2» se quedaría sin recortar y otra llamada «AB-12 Norte» perdería
 * un trozo del nombre de verdad. Aquí solo se recorta lo que consta que es el
 * código de una de las series que la pantalla está leyendo.
 *
 * ⚠️ LOS PUNTOS DE UN TRAMO COMPARTIDO NO LLEVAN EL CÓDIGO DE LA LÍNEA. Se
 * llaman «TR-618 E07», no «LN-617 E07»: pertenecen al tramo, que es de las dos
 * líneas. Por eso el parámetro es una LISTA —la línea y sus tramos abiertos, que
 * es justo lo que devuelve `seriesDeLinea`— y no un código suelto.
 *
 * El corte exige el espacio que separa: sin él, un punto llamado «LN-6270» de
 * otra serie perdería la cabeza y pasaría a llamarse «0».
 */
export function sinPrefijoDeSerie(nombre: string, codigos: readonly string[] = []): string {
  for (const codigo of codigos) {
    if (!codigo) continue;
    const prefijo = `${codigo} `;
    if (nombre.startsWith(prefijo)) return nombre.slice(prefijo.length);
  }
  return nombre;
}

/**
 * Los dos extremos de un tramo, cada uno sin el prefijo de su serie.
 *
 * Existe porque el par se escribe SIEMPRE junto —«E06 → E09»— y hacerlo en dos
 * llamadas separadas en cada pantalla es como se acaba recortando uno y el otro
 * no (que es como se leía la leyenda de tramos antes de esta tanda).
 */
export function extremosSinPrefijo(
  desde: string, hasta: string, codigos: readonly string[] = [],
): [string, string] {
  return [sinPrefijoDeSerie(desde, codigos), sinPrefijoDeSerie(hasta, codigos)];
}

/**
 * EL RÓTULO DE UN TRAMO COMPARTIDO: `TR-618` → «tramo compartido 618».
 *
 * La palabra «tramo» a secas está PROHIBIDA en esta frase y no es un capricho de
 * estilo: en este proyecto «tramo» ya significa TRAMO DE TENSIÓN —el trozo de
 * línea entre dos anclajes, que es de lo que habla la pestaña Mecánico— y dos
 * significados con el mismo nombre vuelven ambigua la frase «recalcular el
 * tramo». Por eso el molde llamó al campo `tramosCompartidos` y no `tramos`.
 *
 * Si el código no tiene la forma esperada se enseña ENTERO detrás de la frase,
 * nunca recortado a medias: un rótulo a medias es peor que uno largo.
 */
export function rotuloDeTramo(codigo: string): string {
  const resto = /^TR-(.+)$/.exec(codigo ?? '')?.[1];
  return `tramo compartido ${resto ?? codigo ?? ''}`.trimEnd();
}
