// ============================================================================
// componentes/EmblemaFuente.tsx — LA MARCA DE QUIEN PUBLICA EL DATO
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE (`99 §ADR-084`). Lo pidió el Ingeniero: «me gustaría que cada
// fuente en la página tenga su logo». `§ADR-082` ya agrupaba los ocho atlas por
// quien los publica, pero el grupo se distinguía SOLO por su rótulo en texto: dos
// líneas de tipografía idéntica, una encima de otra. Un ojo que barre el panel no
// separa dos rótulos; separa dos MARCAS.
//
// ⚠️ POR QUÉ NO SON LOS LOGOS OFICIALES, Y ESTO NO ES UN DESCUIDO.
// El escudo de NASA (la «albóndiga»), su logotipo (el «gusano») y su sello están
// EXPRESAMENTE excluidos de la política de uso libre de material de NASA: todo lo
// demás —fotos, datos, vídeo— se puede usar sin pedir permiso, y esas tres marcas
// no. El emblema de NOAA está igual de restringido. Y la razón de fondo pesa más
// que la formal: un sitio que muestra el escudo de una agencia junto a un
// veredicto de ingeniería está sugiriendo que la agencia respalda el veredicto, y
// NASA no respalda nada de lo que aquí se firma. Lo que se publica es DE DÓNDE
// VIENE EL DATO, no quién avala la conclusión.
//
// Así que la marca es NUESTRA y dice lo mismo sin tomar prestado nada:
//
//   · NASA POWER      → la retícula del atlas, del más frío al más caliente. Es
//                       literalmente cómo llega su dato: a celdas de 1°, el año
//                       entero. `§ADR-046`: «a cuadros es como está medida».
//   · GOES-19 · NOAA  → el satélite sobre el limbo de la Tierra, con su bajada.
//                       Es lo que lo separa del otro: mira desde arriba, ahora.
//
// El NOMBRE de la fuente sigue escrito al lado, con todas sus letras, y la ficha
// sigue publicando la cadena exacta del producto. El emblema acompaña al nombre;
// no lo sustituye. Nombrar a quien publica un dato para decir de dónde salió es
// justo lo que se espera de una atribución.
//
// SI ALGÚN DÍA HAY PERMISO ESCRITO de NASA o de NOAA, cambiar a su logo oficial
// es tocar ESTE archivo y ninguno más: la pantalla pide «el emblema de esta
// familia» y no sabe qué se dibuja dentro.
//
// ⚠️ VA EN `componentes/` Y NO EN `vistas/atlasCatalogo.ts` a propósito: el
// catálogo es DATO —qué atlas existen y de qué familia son— y esto es PANTALLA.
// Meter un dibujo en el catálogo obligaría a que un archivo de datos fuera .tsx.
// ============================================================================

import type { ReactElement } from 'react';
import type { FamiliaAtlas } from '../vistas/atlasCatalogo';

/**
 * El emblema de una familia de fuentes, en línea con su nombre.
 *
 * Es decorativo y por eso va oculto a los lectores de pantalla: el nombre de la
 * fuente está escrito justo al lado y anunciarlo dos veces solo estorba a quien
 * navega por voz.
 */
export function EmblemaFuente({ familia }: { familia: FamiliaAtlas }) {
  const Marca = MARCAS[familia];
  return (
    <svg className="emblema" viewBox="0 0 24 24" width="18" height="18"
      aria-hidden="true" focusable="false">
      <Marca />
    </svg>
  );
}

/**
 * QUÉ SE DIBUJA PARA CADA FAMILIA. Es una TABLA y no un `si … si no`, y la
 * diferencia no es de estilo.
 *
 * Con un ternario —`familia === 'power' ? … : …`— el día que entre una tercera
 * fuente, todo lo que no fuera POWER heredaría en silencio la marca del
 * satélite: dos proveedores distintos con el mismo emblema, y ni un error. Al
 * declararlo como `Record<FamiliaAtlas, …>`, **el compilador exige la marca de
 * cada familia**; olvidarla no compila. Es `30 · M-01` otra vez: lo que hay que
 * acordarse de sincronizar a mano, se desincroniza.
 */
const MARCAS: Record<FamiliaAtlas, () => ReactElement> = {
  power: MarcaPower,
  goes: MarcaGoes,
  pronostico: MarcaPronostico,
};

/**
 * NASA POWER — la retícula del atlas.
 *
 * Nueve celdas, del claro al lleno en diagonal: la misma rampa con la que se
 * pinta el mapa. Todas usan `currentColor` y se diferencian por opacidad, para
 * que el emblema herede el color del texto al que acompaña y no traiga una
 * paleta propia que se desincronice del tema (`30 · M-01`).
 */
function MarcaPower() {
  // Fila a fila, de arriba-izquierda (lo más frío) a abajo-derecha (lo más
  // caliente). Escrita como tabla y no como nueve etiquetas a mano: si mañana la
  // rampa cambia, cambia UN renglón.
  const RAMPA = [
    [0.22, 0.34, 0.50],
    [0.34, 0.58, 0.75],
    [0.50, 0.75, 1.00],
  ];
  return (
    <g fill="currentColor">
      {RAMPA.flatMap((fila, f) => fila.map((o, c) => (
        <rect key={`${f}-${c}`} x={2 + c * 7.3} y={2 + f * 7.3}
          width="6.4" height="6.4" rx="1.1" opacity={o} />
      )))}
    </g>
  );
}

/**
 * GOES-19 · NOAA — el satélite mirando la Tierra.
 *
 * ESTE DIBUJO SE MIDIÓ, no se acertó a la primera, y por eso se cuenta aquí.
 * La versión 1 tenía la bajada del dato como una LÍNEA a trazos y los paneles
 * pegados al cuerpo: fotografiada y ampliada a 18 px reales, se veía un bulto
 * naranja sobre una sonrisa azul — el trazo de 1,2 px había desaparecido y los
 * tres rectángulos se fundían en uno. Se compararon tres variantes en el mismo
 * banco y ganó ésta (`34 · L-72`: el lienzo se MIRA, no se supone).
 *
 * Lo que quedó, y por qué cada pieza: el CONO en vez del trazo, porque una
 * superficie sobrevive al tamaño pequeño; los PANELES separados por un hueco
 * visible, porque son el signo que dice «satélite» sin leer nada; y el limbo con
 * un arco muy abierto, porque con poco radio se leía una sonrisa en vez de un
 * horizonte. El limbo lleva su propia clase porque es lo único que NO es del
 * color del texto: la Tierra es azul en todo el sitio.
 */
/**
 * Pronóstico · MET Norway — la flecha del tiempo, hacia delante.
 *
 * Las otras dos marcas dicen QUIÉN publica; ésta tiene que decir algo distinto y
 * más importante: que esto **no lo ha medido nadie todavía**. Por eso no dibuja
 * un instrumento —ni retícula ni satélite— sino el paso del tiempo: tres barras
 * que van perdiendo tinta hacia la derecha, como pierde certeza un pronóstico
 * cuanto más lejos mira, y la punta que señala adelante.
 *
 * A la izquierda, a plena tinta, está el ahora; a la derecha, en un cuarto de
 * tinta, el día diez. Es la única de las tres marcas que se lee como una
 * dirección en vez de como un objeto, y esa diferencia es justo la que hay que
 * ver sin leer nada.
 */
function MarcaPronostico() {
  // De más tinta a menos: lo cercano se sabe mejor que lo lejano.
  const BARRAS = [
    { x: 1.6, alto: 13, o: 1 },
    { x: 7.2, alto: 10, o: 0.62 },
    { x: 12.8, alto: 7, o: 0.34 },
  ];
  return (
    <g fill="currentColor">
      {BARRAS.map((b) => (
        <rect key={b.x} x={b.x} y={17.4 - b.alto} width="4.2" height={b.alto} rx="1.1" opacity={b.o} />
      ))}
      {/* La punta: hacia DELANTE. Lo que separa esta familia de las otras dos. */}
      <path d="M17.6 6.4 L23 11.8 L17.6 17.2 Z" opacity="0.34" />
      {/* La línea del tiempo, que las apoya a todas. */}
      <rect x="1.2" y="19.4" width="21.6" height="2.2" rx="1.1" opacity="0.75" />
    </g>
  );
}

function MarcaGoes() {
  return (
    <g>
      {/* Lo que ve el sensor: un cono, no una línea. Una superficie sobrevive al
          tamaño pequeño; un trazo de 1,2 px reales se pierde. */}
      <path d="M12 8.6 L19 16.6 L5 16.6 Z" fill="currentColor" opacity="0.26" />
      {/* El limbo. Arco MUY abierto (radio 20 en un lienzo de 24) y no una
          semicircunferencia: con poco radio se leía una sonrisa, no un horizonte
          — y lo que hay ahí abajo es la Tierra vista desde 35.786 km. */}
      <path className="emblema-tierra" d="M1.4 21.8 A 20 20 0 0 1 22.6 21.8"
        fill="none" strokeWidth="2.9" strokeLinecap="round" />
      {/* Los dos paneles, separados del cuerpo por un hueco que SÍ se ve a 18 px:
          pegados, los tres rectángulos se fundían en un bulto. Más pálidos
          porque son ala, no carga útil. */}
      <rect x="0.6" y="3" width="5.2" height="4.2" rx="1" fill="currentColor" opacity="0.5" />
      <rect x="18.2" y="3" width="5.2" height="4.2" rx="1" fill="currentColor" opacity="0.5" />
      {/* El cuerpo, a plena tinta: es donde va el sensor. */}
      <rect x="8.6" y="1.8" width="6.8" height="6.8" rx="1.6" fill="currentColor" />
    </g>
  );
}
