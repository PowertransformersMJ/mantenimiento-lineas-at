// ============================================================================
// resolver-evidencias.mjs — REENVÍO FINO. La implementación vive en otro sitio.
// ----------------------------------------------------------------------------
// Aquí no hay ni una línea de lógica, y es a propósito.
//
// El emparejador (de qué apoyo cuelga cada foto) tiene DOS lectores: este guion
// de consola y la pestaña «Fotos» de la aplicación. Si viviera aquí, dentro de
// `herramientas/`, el navegador no podría importarlo — y la pantalla acabaría
// con una segunda copia. Dos copias del mismo emparejador solo coinciden
// mientras nadie toque ninguna, y su desacuerdo NO rompe nada visible: deja
// fotos colgadas del apoyo vecino, creíbles y mal, hasta que alguien va al sitio.
//
// Por eso la implementación se mudó a `importar/evidencias.js`, que es código
// puro sin `node:` nada — igual que `importar/identidad.js`— y se publica como
// `@lineas/importar/evidencias`. UNA implementación, dos lectores.
//
// Este archivo se queda por compatibilidad: quien ya lo importaba sigue
// funcionando (§ADR-031, cambios aditivos).
// ============================================================================
export {
  MIME, NOMBRES_INDICE, TOPE_BYTES, FORMA_DE_CLAVE,
  extensionDe, claveDeObjeto, filasDelMapa,
  clasificarArchivos, resolverCarpetas, repartirEvidencias, prepararReparto,
  describirProblema,
} from '@lineas/importar/evidencias';
