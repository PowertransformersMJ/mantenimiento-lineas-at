// ============================================================================
// vistas/corredor.ts — LAS DOS CAPAS FINAS DEL CORREDOR. Un solo sitio.
// ----------------------------------------------------------------------------
// QUÉ SON. «Radiación solar» y «Temperatura ambiente» del Global Solar Atlas:
// celdas de 2 km sobre un recorte de unos 32 × 42 km alrededor del corredor.
// Nacieron pegadas al mapa de la LÍNEA y viven aquí desde `99 §ADR-087`, cuando
// el Ingeniero mandó que el clima dejara de vivir en Detalle GPS y viviera en la
// pantalla del ATLAS. No son otro atlas: son OTRO SUBSISTEMA sobre el mismo mapa.
//
// POR QUÉ NO SON UN ATLAS MÁS (y por qué no entran en `atlasCatalogo.ts`):
//
//   · El atlas del Caribe va por AÑO, con día y hora. Éstas van por MES y traen
//     además la media ANUAL. No hay día que elegir ni hora que deslizar.
//   · El atlas mide celdas de 1° (111 km) sobre siete departamentos. Éstas miden
//     2 km sobre un recorte que cabe en una celda del atlas.
//   · Y la de más peso: el atlas publica MEDICIONES fechadas o un PRONÓSTICO
//     fechado. Éstas son un PROMEDIO DE MUCHOS AÑOS: no tienen «cuándo».
//
// Meterlas en el catálogo de atlas habría obligado al motor del atlas a admitir
// una capa sin calendario, y a la cinta de frescura a decir «actualizado el …»
// de algo que no describe ningún día. Van aparte, y lo dicen.
//
// ⚠️ VIVE EN `vistas/` Y NO EN `componentes/`, por lo mismo que `atlasCatalogo`:
// es DATO, no pantalla. Así el componente del atlas puede leerlo sin que un
// trozo perezoso tire de otro trozo perezoso.
// ============================================================================

/** Las capas del corredor que existen. Añadir una empieza aquí. */
export type ClaveCorredor = 'radiacion' | 'temperatura';

/**
 * LA TERCERA NATURALEZA (`99 §ADR-086/087`).
 *
 * `§ADR-086` dejó dicho que **cada capa declara qué es** y que el motor se niega
 * a publicar una que no lo diga, con dos valores: `medida` y `pronostico`. Estas
 * dos no son ninguna de las dos cosas y por eso traen la tercera:
 *
 *   · `medida`     — alguien lo midió, y consta el día.
 *   · `pronostico` — un modelo cree que va a pasar, y consta el día.
 *   · `promedio`   — **el promedio de muchos años**. No hay día que citar.
 *
 * No es un matiz de vocabulario: la pantalla del atlas está construida entera
 * alrededor de «de cuándo es este dato» (`§ADR-075`). Una capa sin `naturaleza`
 * se lee como `medida` —hay una prueba que lo fija— y eso habría puesto un
 * promedio de treinta años al lado de un «medido hasta el 23 de agosto» con la
 * misma cara. Es el mismo fallo que `30 · L-68`: **la palabra «medida» no se le
 * aplica a lo que no se midió ese día.**
 */
export const NATURALEZA_CORREDOR = 'promedio' as const;

/**
 * LO QUE LA PANTALLA TIENE QUE DECIR SIEMPRE que una de estas capas esté puesta.
 * Un solo dueño: las dos leyendas lo imprimen y una prueba comprueba que está.
 */
export const AVISO_PROMEDIO =
  'No es el tiempo de hoy ni de ningún día: es el PROMEDIO de muchos años. '
  + 'No tiene fecha porque no describe una fecha, y por eso no valida ni desmiente '
  + 'ninguna medición del atlas — que sí va fechada.';

/**
 * POR QUÉ EL MAPA HACE LO QUE HACE AL ENCENDERLA, dicho en la pantalla.
 *
 * ⚠️ ESTA FRASE NO ES LA QUE HABÍA. En el mapa de la LÍNEA el aviso decía que
 * «encuadrado en la línea el color es casi uniforme»: allí el problema era estar
 * DEMASIADO CERCA. Aquí es justo el contrario —el atlas abre sobre siete
 * departamentos y el recorte del corredor mide 30 km—, así que copiar el texto
 * habría sido mudar el dibujo y dejar la explicación mintiendo. Es el mismo
 * cuidado de `30 · L-68`: una frase verdadera en su sitio puede ser falsa en el
 * de al lado.
 */
export const NOTA_ENCUADRE_ATLAS =
  'Al encenderla el mapa se va al recorte del corredor, que es donde se ve el gradiente: '
  + 'sobre los siete departamentos son unos 30 km y se leerían como un punto. Con «Ver toda la '
  + 'región» se vuelve atrás sin apagarla.';

/**
 * LO QUE LA FICHA DE UNA CAPA DEL CORREDOR TIENE QUE DECIR DE SÍ MISMA.
 *
 * ⚠️ `naturaleza` NO ES OPCIONAL Y NO TIENE VALOR POR DEFECTO, por lo mismo que
 * en el motor del atlas (`99 §ADR-086`): un `?? 'medida'` convertiría olvidarlo
 * en mentir. Aquí la mentira sería peor todavía —diría que un promedio de
 * treinta años se midió ayer—, así que la pantalla se NIEGA a pintar una capa
 * que no lo declare, en vez de suponerlo.
 */
export interface DeclaracionDeCorredor {
  naturaleza?: string;
}

/** ¿Puede pintarse? Solo si dice qué es, y si lo que dice es lo que es. */
export function declaraSuNaturaleza(ficha: DeclaracionDeCorredor | null | undefined): boolean {
  return ficha?.naturaleza === NATURALEZA_CORREDOR;
}

export const SIN_NATURALEZA =
  'Esta capa no declara qué es (una medición, un pronóstico o un promedio de muchos años), '
  + 'así que no se pinta. Enseñarla sin decirlo la pondría al lado de mediciones fechadas '
  + 'con la misma cara, y eso es peor que no enseñarla.';

export interface FichaDeCorredor {
  /** De dónde se baja su ficha JSON. */
  ficha: string;
  /** Lo que se lee en la casilla. */
  rotulo: string;
  /** Cuánto deja ver el terreno de debajo. Medido a ojo sobre el mapa real. */
  opacidad: number;
  /** Mientras baja. */
  bajando: string;
  /** Si no se pudo. El mapa se queda como estaba. */
  fallo: string;
}

/**
 * EL CATÁLOGO. Aquí solo va lo que la ficha del archivo no puede traer. Unidad,
 * rampa, meses, avisos y período los dice el propio archivo.
 *
 * ⚠️ SOLO UNA ENCENDIDA A LA VEZ, y no es una limitación técnica: son dos rampas
 * de color sobre el mismo territorio. Superpuestas, el color de arriba tapa al
 * de abajo y lo que se lee no es ninguna de las dos. El clic tampoco podría
 * decir a cuál de las dos contesta. (Venía así del mapa de la línea y se
 * conserva palabra por palabra: la razón no cambió al mudarse.)
 */
export const CORREDOR: Record<ClaveCorredor, FichaDeCorredor> = {
  radiacion: {
    ficha: '/mapas/cartagena-radiacion.json',
    rotulo: 'Radiación solar',
    opacidad: 0.68,
    bajando: 'Bajando el recurso de ese mes…',
    fallo: 'No se pudo cargar el recurso solar. El mapa sigue igual.',
  },
  temperatura: {
    ficha: '/mapas/cartagena-temperatura.json',
    rotulo: 'Temperatura ambiente',
    // Algo más translúcida que el sol: la temperatura se mira SOBRE el terreno
    // —dónde está el mar, dónde la ciudad— y a 0,68 el fondo desaparecía.
    opacidad: 0.6,
    bajando: 'Bajando la temperatura de ese mes…',
    fallo: 'No se pudo cargar la temperatura ambiente. El mapa sigue igual.',
  },
};

export const CORREDOR_EN_ORDEN: ClaveCorredor[] = ['radiacion', 'temperatura'];

/** El id de la capa en MapLibre. Uno solo: solo hay una encendida. */
export const ID_CAPA_CORREDOR = 'capa-corredor';

/**
 * EL TECHO DE ZOOM DEL ATLAS, y de dónde sale (`§ADR-055`). Con celdas de 111 km
 * pasar de aquí es enseñar un detalle que la medida no tiene.
 */
export const TECHO_DEL_ATLAS = 9.5;

/** El tamaño de celda que justifica ese techo. Los dos van juntos o ninguno vale. */
export const CELDA_DEL_ATLAS_M = 111_000;

/**
 * HASTA DÓNDE SE PUEDE ACERCAR CON UNA CAPA DEL CORREDOR PUESTA.
 *
 * ⚠️ ESTE NÚMERO NO SE ESCRIBE A MANO, y ésa es toda la gracia. El atlas ya
 * declaró su techo (9,5) para una celda de 111 km; el corredor mide 2 km, o sea
 * 55 veces más fino, que son 5,8 niveles de zoom más. Escribir «15,3» en una
 * constante habría sido justo lo que `30 · M-01` prohíbe: un número que hay que
 * mantener sincronizado a mano con otro que está en otro archivo.
 *
 * Pero el dato no manda solo: **el mapa base también tiene fondo**. El recorte
 * del Caribe se publica hasta el zoom que diga su propio `.pmtiles`, y estirarlo
 * mucho más allá no dibuja una calle de más — dibuja un croquis. Así que el
 * techo es el MENOR de los dos, y por eso la función pide los dos:
 *
 *   · lo que aguanta el DATO   → el atlas, más lo fino que sea esta capa
 *   · lo que aguanta el FONDO  → lo que publique el recorte, más un margen corto
 *
 * Medido hoy: dato 2 km → 15,3 · fondo `caribe.pmtiles` z10 → 12,5. Manda 12,5,
 * y a 12,5 el recorte del corredor llena la pantalla, que es lo que hacía falta.
 *
 * Y NUNCA devuelve menos que el techo del atlas: encender una capa fina no puede
 * ALEJAR el mapa.
 */
export function techoDelCorredor(resolucion_m: number, zMaxDelMapaBase: number): number {
  const delDato = Number.isFinite(resolucion_m) && resolucion_m > 0
    ? TECHO_DEL_ATLAS + Math.log2(CELDA_DEL_ATLAS_M / resolucion_m)
    : TECHO_DEL_ATLAS;
  const delFondo = Number.isFinite(zMaxDelMapaBase)
    ? zMaxDelMapaBase + MARGEN_SOBRE_EL_FONDO
    : delDato;
  return Math.max(TECHO_DEL_ATLAS, Math.min(delDato, delFondo));
}

/**
 * Cuánto se deja estirar el mapa base por encima de lo que publica.
 *
 * 2,5 niveles ≈ 5,7 aumentos. Por ahí el callejero todavía se lee como un
 * callejero; más allá empieza a parecer un dibujo hecho a mano, y un fondo que
 * parece roto hace dudar de la capa que va encima, que sí está bien.
 */
export const MARGEN_SOBRE_EL_FONDO = 2.5;
