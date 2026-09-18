// ============================================================================
// datos/registroCodigos.ts — el libro de CÓDIGOS DE SERIE, LEÍDO, nunca movido
// ----------------------------------------------------------------------------
// QUÉ ES. `herramientas/codigos-emitidos.json` dice qué códigos de serie
// existen —una LÍNEA (`LN-…`) o un TRAMO COMPARTIDO (`TR-…`)— y qué
// identificador permanente tiene cada uno. **Se queda ahí**, igual que el libro
// de nombres: este archivo es la única línea de código que lo trae a la
// aplicación. Es el gemelo de `registroSemillas.ts`, y por las mismas razones
// (ruta fija bajo `herramientas/`, vigilada por una prueba; nada de dato de
// cliente dentro: un código, un tipo, un hash y una fecha).
//
// PARA QUÉ LO NECESITA LA CAPA DE DATOS, que es lo nuevo. Una línea declara los
// tramos que recorre con DOS campos: el `codigo` que se enseña («TR-618») y el
// `id` con el que se piden sus torres. El molde no puede cruzarlos —no puede
// importar este libro— así que hasta hoy una línea podía declarar
// `{ codigo: 'TR-618', id: <el id de OTRA línea> }` y traerse las torres de esa
// otra línea rotuladas como del tramo, **sin un solo aviso**. Al revés —un id
// con un dígito cambiado— traía CERO torres, también en silencio.
//
// Con el libro en la mano el par se comprueba: si el código no está anotado, o
// está anotado con OTRO id, esa serie **no se junta** y se dice por qué
// (`repositorio.ts §seriesAvaladas`). El libro es quien manda porque es lo
// único que se despliega con el repositorio y no se puede editar desde la
// aplicación.
//
// ⚠️ ESTO NO ES UNA FUENTE DE VERDAD PARALELA. La aplicación **lee** el libro y
// no puede escribir en él. Quien lo INTERPRETA sigue siendo `@lineas/importar`
// —aquí no se filtra a mano ni se vuelve a definir qué es una fila válida—:
// esto solo lo pone en la forma que la capa pura sabe consultar (un mapa
// código → id), para que `repositorio.ts` siga sin importar nada en tiempo de
// ejecución y se pueda seguir probando con `node --test`.
// ============================================================================
import { codigosDelLibro, idDelLibro } from '@lineas/importar/identidad';
import libro from '../../../herramientas/codigos-emitidos.json';
import type { LibroDeCodigos } from './repositorio';

/**
 * El libro completo, tal cual está en el repositorio. Dato opaco, por lo mismo
 * que `REGISTRO_NOMBRES`: quien lo interpreta es `@lineas/importar`.
 */
export const LIBRO_DE_CODIGOS_CRUDO: Record<string, unknown> = libro;

/**
 * Los códigos cuya fila está ANOTADA PERO ROTA —sin id, o con un id que no
 * tiene forma de identificador—. Se listan aparte a propósito: para la lectura
 * cuentan como «no está en el libro» (una serie así no se junta), pero «nunca
 * se anotó» y «se anotó mal» son cosas distintas y la pantalla tiene que poder
 * decir cuál de las dos pasó. Hoy está vacío y una prueba de CI lo vigila
 * (`tests/codigos-emitidos.test.js`).
 */
export const CODIGOS_ILEGIBLES: string[] = [];

/**
 * EL PAR CÓDIGO ↔ ID, ya resuelto: «TR-618» → el identificador con el que se
 * piden sus torres.
 *
 * Se construye UNA vez al cargar el módulo. Un `Map` y no un objeto a propósito:
 * en un objeto, preguntar por un código llamado `constructor` o `toString`
 * devolvería una función heredada y pasaría por identificador válido.
 */
export const LIBRO_DE_CODIGOS: LibroDeCodigos = (() => {
  const mapa = new Map<string, string>();
  for (const codigo of codigosDelLibro(libro)) {
    try {
      mapa.set(codigo, idDelLibro(libro, codigo));
    } catch {
      // Una fila rota NO tumba la aplicación y NO entra al mapa: la serie que
      // la cite se quedará fuera con un aviso visible, que es ruidoso a
      // propósito. Lo que no puede pasar es que entre a medias.
      CODIGOS_ILEGIBLES.push(codigo);
    }
  }
  return mapa;
})();
