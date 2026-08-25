// ============================================================================
// vistas/atlasCatalogo.ts — QUÉ ATLAS EXISTEN. Un solo sitio, y solo uno.
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE ESTE ARCHIVO (`99 §ADR-068`). La lista de atlas vivía **dos
// veces**: el tipo `ClaveAtlas` y el catálogo en `componentes/AtlasCaribe.tsx`, y
// otro `ClaveAtlas` con sus direcciones en `datos/ruta.ts`. Añadir el quinto
// obligó a tocar los dos, y **si se hubiera tocado uno solo, `#/nubes` habría
// abierto otro atlas sin dar un solo error** — lo cazó el compilador de milagro,
// porque los dos tipos se cruzaban en una prop.
//
// Es la familia de `30 · M-01` y `34 · L-65`: un dato que hay que mantener
// sincronizado a mano es un dato que se desincroniza. Aquí el sexto atlas es
// **una entrada en UNA tabla**, y todo lo demás —pantalla, rutas, vigía— sale de
// ella o falla al compilar.
//
// ⚠️ VIVE EN `vistas/` Y NO EN `componentes/` a propósito: es dato, no pantalla.
// Colgarlo de un componente obligaba al panel del mapa de línea a importar del
// componente del atlas —un trozo perezoso tirando de otro trozo perezoso— y
// bastaba una importación de vuelta para cerrar un ciclo.
// ============================================================================

/** Los atlas que existen. Añadir uno empieza aquí y el compilador hace el resto. */
export type ClaveAtlas = 'sol' | 'temperatura' | 'viento' | 'lluvia' | 'nubes' | 'rayos'
  | 'solVivo' | 'nubesVivo';

export interface FichaDeAtlas {
  /** De dónde se baja su ficha JSON. */
  ficha: string;
  /** El id de su capa en MapLibre. */
  idCapa: string;
  titulo: string;
  entradilla: string;
  /** Lo que se lee en el botón. Corto: el panel mide 280 px. */
  rotulo: string;
  /** La dirección que lo abre a pantalla completa. */
  hash: string;
}

/**
 * EL CATÁLOGO. Aquí solo va lo que la ficha del archivo no puede traer: dónde
 * está esa ficha y cómo se llama en pantalla. Unidad, rampa, avisos y qué resume
 * el día los dice el propio archivo, para que añadir uno no sea una pantalla
 * nueva.
 */
export const ATLAS: Record<ClaveAtlas, FichaDeAtlas> = {
  sol: {
    ficha: '/mapas/sol-caribe.json',
    idCapa: 'capa-sol',
    titulo: 'Atlas solar del Caribe',
    entradilla: 'Irradiancia solar',
    rotulo: 'Sol',
    hash: '#/sol',
  },
  temperatura: {
    ficha: '/mapas/temp-caribe.json',
    idCapa: 'capa-temp',
    titulo: 'Atlas de temperatura del Caribe',
    entradilla: 'Temperatura del aire a 2 m',
    rotulo: 'Temperatura',
    hash: '#/temperatura',
  },
  viento: {
    ficha: '/mapas/viento-caribe.json',
    idCapa: 'capa-viento',
    titulo: 'Atlas de viento del Caribe',
    entradilla: 'Viento a 10 m',
    rotulo: 'Viento',
    hash: '#/viento',
  },
  lluvia: {
    ficha: '/mapas/lluvia-caribe.json',
    idCapa: 'capa-lluvia',
    titulo: 'Atlas de lluvia del Caribe',
    entradilla: 'Lluvia caída',
    rotulo: 'Lluvia',
    hash: '#/lluvia',
  },
  nubes: {
    ficha: '/mapas/nubes-caribe.json',
    idCapa: 'capa-nubes',
    titulo: 'Atlas de nubosidad del Caribe',
    entradilla: 'Cielo cubierto',
    rotulo: 'Nubes',
    hash: '#/nubes',
  },
  /**
   * ⚠️ EL SEXTO NO VIENE DE NASA POWER (`99 §ADR-079`). Los cinco de arriba son
   * medias horarias de POWER; éste es un CONTEO de rayos del satélite GOES, y se
   * ACUMULA en vez de reconstruirse. Para la pantalla eso da igual —lee la ficha
   * y no sabe de dónde salió— y ésa es justo la prueba de que el motor está bien
   * partido: añadir un atlas de otra fuente sigue siendo UNA entrada aquí.
   */
  rayos: {
    ficha: '/mapas/rayos-caribe.json',
    idCapa: 'capa-rayos',
    titulo: 'Atlas de descargas atmosféricas del Caribe',
    entradilla: 'Rayos contados por satélite',
    rotulo: 'Rayos',
    hash: '#/rayos',
  },
  /**
   * ⚠️ LAS DOS «AHORA» SON CAPAS HERMANAS DE `sol` Y `nubes`, NO SUS SUSTITUTAS
   * (`99 §ADR-081`). Miden lo mismo desde otro sitio: las de arriba vienen de
   * NASA POWER y traen el año entero con **87 días** de retraso; éstas vienen
   * del sensor del GOES-19 y van a **quince minutos**, pero empiezan el día que
   * se encienden. Comparten escala de color a propósito, para poder mirarlas
   * seguidas; lo que las separa lo dice la cinta de la fuente y su aviso.
   */
  solVivo: {
    ficha: '/mapas/sol-vivo-caribe.json',
    idCapa: 'capa-sol-vivo',
    titulo: 'Radiación solar del Caribe · casi en vivo',
    entradilla: 'Radiación solar medida por el sensor del GOES',
    rotulo: 'Sol ahora',
    hash: '#/sol-ahora',
  },
  nubesVivo: {
    ficha: '/mapas/nubes-vivo-caribe.json',
    idCapa: 'capa-nubes-vivo',
    titulo: 'Nubosidad del Caribe · casi en vivo',
    entradilla: 'Cielo cubierto visto por el sensor del GOES',
    rotulo: 'Nubes ahora',
    hash: '#/nubes-ahora',
  },
};

/** El orden en que se ofrecen. No es alfabético: es el orden en que nacieron. */
export const ATLAS_EN_ORDEN: ClaveAtlas[] = [
  // Primero los cinco del año (POWER), luego los que van casi en vivo. El orden
  // no es alfabético ni caprichoso: es el de «lo que ya pasó» → «lo que pasa».
  'sol', 'temperatura', 'viento', 'lluvia', 'nubes', 'rayos', 'solVivo', 'nubesVivo',
];

/**
 * La dirección de cada atlas, DERIVADA del catálogo.
 *
 * Antes era una segunda tabla escrita a mano, con su comentario advirtiendo de
 * que «con dos listas, un día `#/temperatura` abriría el solar». Tenía razón: se
 * derivan las dos direcciones de la misma fuente y el aviso deja de hacer falta.
 */
export const HASH_ATLAS: Record<ClaveAtlas, string> = Object.fromEntries(
  ATLAS_EN_ORDEN.map((c) => [c, ATLAS[c].hash]),
) as Record<ClaveAtlas, string>;
