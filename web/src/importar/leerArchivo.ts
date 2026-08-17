// ============================================================================
// importar/leerArchivo.ts — la ÚNICA pieza de la carga que toca el navegador
// ----------------------------------------------------------------------------
// Espejo exacto de `web/src/exportar/descargar.js`, en la dirección contraria:
// allí un texto puro se vuelve archivo; aquí un archivo se vuelve texto puro.
// Todo lo que pasa después —leer el GPX, resolver la identidad, colocar el
// punto, calcular el antes y el después— vive en `@lineas/importar`, se prueba
// en Node y no sabe que existe un navegador.
//
// Está aislado por la misma razón que su hermano: `File` y `FileReader` solo
// existen dentro del navegador, y un módulo que los use no se puede probar sin
// montar un navegador de mentira. Aquí la parte imposible de probar son estas
// pocas líneas, y ninguna de ellas decide nada.
//
// EL ARCHIVO NO SUBE A NINGÚN SITIO. Se lee en el computador del Ingeniero y el
// texto no sale de la pestaña: lo que viaja a la base son los documentos que él
// aprueba, uno por uno, nunca el archivo.
// ============================================================================

/** Lo que hace falta saber de un archivo aportado. `File` del navegador cumple. */
export interface ArchivoAportado {
  name: string;
  text(): Promise<string>;
}

/** Un archivo leído: su nombre, su contenido y —si falló— por qué. */
export interface ArchivoLeido {
  nombre: string;
  texto: string | null;
  fallo?: string;
}

/**
 * Lee los archivos aportados a texto.
 *
 * Nunca lanza: un archivo ilegible entre cuatro no puede tumbar la pantalla ni
 * hacer desaparecer a los otros tres. El fallo VIAJA con su archivo para que se
 * pueda decir cuál falló y no un genérico «no se pudo leer».
 */
export async function leerArchivos(archivos: ArchivoAportado[]): Promise<ArchivoLeido[]> {
  const salida: ArchivoLeido[] = [];
  for (const a of archivos) {
    try {
      salida.push({ nombre: a.name, texto: await a.text() });
    } catch (e) {
      salida.push({
        nombre: a.name,
        texto: null,
        fallo: e instanceof Error ? e.message : 'no se pudo leer el archivo',
      });
    }
  }
  return salida;
}
