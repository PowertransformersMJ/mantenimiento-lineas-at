// ============================================================================
// datos/registroSemillas.ts — el libro de nombres, LEÍDO, nunca movido
// ----------------------------------------------------------------------------
// QUÉ ES. El registro de nombres canónicos que ya tienen identidad emitida vive
// en `herramientas/semillas-emitidas.json` y **se queda ahí**. Este archivo es
// la única línea de código que lo trae a la aplicación.
//
// POR QUÉ NO SE MUEVE A `importar/`, que sería lo cómodo: porque hay una prueba
// que exige que su ruta siga estando bajo `herramientas/`
// (`tests/identidad-apoyos.test.js`), y esa prueba existe para que el archivo
// que fija los identificadores de producción no se pueda arrastrar de sitio
// sin que nadie se entere. Mover el libro para ahorrar tres puntos suspensivos
// en un `import` sería cambiar una garantía por comodidad.
//
// POR QUÉ VIAJA DENTRO DEL PAQUETE PÚBLICO, y por qué eso no es una fuga: el
// propio archivo lo explica en su primera clave. No hay dato de cliente: son
// nombres canónicos —que ya estaban publicados en el sembrador— y sus
// identificadores. Ni una coordenada, ni una hora de captura, ni el nombre de
// una subestación.
//
// ⚠️ ESTO NO ES UNA FUENTE DE VERDAD PARALELA. La aplicación **lee** el libro y
// no puede escribir en él. Estrenar un nombre nuevo sigue siendo un cambio en
// el repositorio, a propósito: quien pueda estrenar nombres puede estrenar
// identidades permanentes, y de una identidad cuelgan las fotos y el expediente
// de un punto para siempre.
// ============================================================================
import registro from '../../../herramientas/semillas-emitidas.json';

/**
 * El libro completo, tal cual está en el repositorio.
 *
 * Se expone como dato opaco porque quien lo interpreta es `@lineas/importar`:
 * aquí no se busca, no se filtra y no se reordena. Un intermediario que
 * «arregla» el libro por el camino es exactamente el sitio donde aparecería la
 * segunda versión de la verdad.
 */
export const REGISTRO_NOMBRES: Record<string, unknown> = registro;
