// ============================================================================
// importar/levantamientoDesdeGpx.js — del waypoint del aparato al punto que el
// molde admite, diciendo en voz alta TODO lo que se quedó fuera
// ----------------------------------------------------------------------------
// QUÉ HACE. `importar/gpx.js` lee el archivo y devuelve el waypoint tal como lo
// escribió el aparato: `nombreCampo, lat, lon, ele, utc, descripcion, simbolo,
// tipo`. El molde `PuntoLevantado` (`contratos/src/levantamiento.ts`) admite
// exactamente cinco claves —`nombreCampo, lat, lon, ele, instante`— y es
// `strict`: **cualquier otra cosa lo hace fallar entero**. Entre los dos falta
// un traductor, y esto es el traductor.
//
// POR QUÉ HACE FALTA, medido y no supuesto: el GPX real del recorrido trae los
// 28 puntos con `<sym>` y con `<time>`, así que el waypoint tal cual se estrella
// contra el molde con «Unrecognized key(s): 'utc', 'simbolo'». Sin esta pieza,
// la pantalla del alta no puede guardar ni un punto.
//
// ── LAS DOS REGLAS QUE GOBIERNAN ESTE ARCHIVO ──────────────────────────────
//
//   1. **Nada se tira en silencio.** Lo que no cabe en el molde se devuelve
//      aparte, con su nombre en castellano y en qué puntos venía, para que la
//      pantalla lo pueda DECIR antes de guardar. Descartar callando es el fallo
//      más caro de este repositorio (`32 · L-67`): el dato desaparece y nadie
//      lo echa de menos hasta que hace falta para firmar algo.
//   2. **Nada se inventa.** No se rellena una hora que el aparato no grabó, no
//      se arregla un nombre, no se deduce nada. Lo que no está, no está — y se
//      declara (la misma regla de `importar/gpx.js`).
//
// ── POR QUÉ EL SÍMBOLO SE DESCARTA ─────────────────────────────────────────
// `<sym>` es el ICONO con que el aparato pinta el punto en su pantallita —una
// bandera, una chincheta—. Lo elige quien configura el GPS y cambia de modelo a
// modelo: **no es un dato de la línea**, no dice qué es esa estructura ni qué
// función cumple. Guardarlo sería meter en un documento que respalda un papel
// firmado una preferencia de pantalla de un aparato de mano.
//
// ── POR QUÉ ESTO NO DECIDE NADA DE INGENIERÍA ──────────────────────────────
// `<type>` también se descarta, y ese es el descarte importante: se PARECE a la
// función estructural (suspensión, retención) y no lo es. El molde prohíbe esos
// campos con nombre y apellido justamente porque un GPS no sabe qué es una
// retención; lo declara quien firma, al REGISTRAR la torre, y no antes.
//
// ── QUIÉN MANDA SOBRE LO QUE PASA Y LO QUE NO ──────────────────────────────
// El molde, no este archivo. Cada punto traducido se valida con el propio
// `PuntoLevantado` antes de darlo por bueno: así no hay una segunda lista de
// reglas (largo del nombre, rango de la coordenada) que algún día diga otra cosa
// que la primera (`33 · L-19`). Lo que el molde rechaza sale APARTADO, con el
// motivo en castellano, nunca borrado.
//
// PURO: sin DOM, sin red, sin `node:`. Se prueba con `node --test`.
// ============================================================================

import { Instante, Levantamiento, PuntoLevantado } from '@lineas/contratos';

import { leerGpx } from './gpx.js';

/**
 * LA TRADUCCIÓN, entera y en un solo sitio: clave del waypoint → clave del molde.
 *
 * Lo que no aparece en esta tabla NO viaja. Es a propósito una lista blanca y no
 * una lista negra: el día que `leerGpx` aprenda a sacar una clave nueva del
 * archivo, esa clave se quedará fuera y se DIRÁ, en vez de colarse y tumbar el
 * molde estricto con un mensaje que el Ingeniero no puede leer.
 */
export const DEL_GPX_AL_MOLDE = Object.freeze({
  nombreCampo: 'nombreCampo',
  lat: 'lat',
  lon: 'lon',
  ele: 'ele',
  utc: 'instante',
});

/** Cómo se llama en castellano lo que se queda fuera, y por qué se queda fuera. */
export const ETIQUETA_DESCARTE = Object.freeze({
  simbolo:
    'el icono con que el aparato pinta el punto en su pantalla (bandera, chincheta…). ' +
    'Es una preferencia del GPS, no un dato de la línea.',
  descripcion:
    'la descripción que venía escrita en el punto. El levantamiento no tiene nota POR PUNTO, ' +
    'solo una nota del documento: si ahí dice algo que importa, hay que escribirlo en esa nota.',
  tipo:
    'la categoría que el aparato le puso al punto. Se parece a la función estructural y NO lo es: ' +
    'la función la declara quien firma, al registrar la torre.',
});

/** Cuántos puntos admite un levantamiento. Se lee del molde, no se copia. */
export const TOPE_PUNTOS = Levantamiento.shape?.puntos?._def?.maxLength?.value ?? 500;

/** Para nombrar un punto en un aviso sin dejar un hueco raro en la frase. */
const rotulo = (p, i) => (p?.nombreCampo ? p.nombreCampo : `(punto ${i + 1}, sin nombre)`);

/**
 * POR QUÉ EL MOLDE NO ADMITE ESTE PUNTO, dicho para quien no programa.
 *
 * Zod contesta en inglés y con jerga; quien lee esto es el Ingeniero. Se traduce
 * el primer problema, que es el que hay que arreglar en el aparato o a mano.
 */
const porQueNoEntra = (error) => {
  const fallo = error?.issues?.[0];
  const campo = fallo?.path?.[0];

  if (campo === 'nombreCampo') {
    if (fallo?.code === 'too_small') {
      return {
        motivo: 'sin_nombre',
        mensaje: 'el aparato no le puso nombre a este punto, y el levantamiento guarda el nombre ' +
          'que el GPS grabó: sin él no hay con qué reconocerlo en el archivo original.',
      };
    }
    if (fallo?.code === 'too_big') {
      return {
        motivo: 'nombre_larguisimo',
        mensaje: 'el nombre que grabó el aparato pasa de 120 caracteres. Se corta a mano quien lo ' +
          'cargue —aquí no se recorta solo, porque el nombre es la trazabilidad con el archivo—.',
      };
    }
  }

  if (campo === 'lat' || campo === 'lon') {
    return {
      motivo: 'coordenada_fuera_de_rango',
      mensaje: 'la coordenada que trae este punto no cae en el planeta (latitud ±90, longitud ±180).',
    };
  }

  if (campo === 'ele') {
    return {
      motivo: 'cota_ilegible',
      mensaje: 'la cota de este punto no es un número que se pueda guardar.',
    };
  }

  return {
    motivo: 'no_entra_en_el_molde',
    mensaje: `este punto no pasa la comprobación del molde${campo ? ` (campo «${campo}»)` : ''}. ` +
      'Se aparta entero antes que guardarlo a medias.',
  };
};

/**
 * @typedef {Object} DescarteDeCampo
 * @property {string} campo      la clave del waypoint que no viaja
 * @property {string} etiqueta   qué es, en castellano
 * @property {number} n          en cuántos puntos venía
 * @property {string[]} puntos   en cuáles (por el nombre del aparato)
 */

/**
 * @typedef {Object} PuntoApartado
 * @property {number} n            posición en el archivo, 1..N
 * @property {string} nombreCampo  el nombre que traía, o cadena vacía
 * @property {string} motivo       clave corta, para la pantalla
 * @property {string} mensaje      en castellano, listo para enseñar
 */

/**
 * Traduce los waypoints de `leerGpx` a puntos del levantamiento.
 *
 * Devuelve CUATRO cosas y las cuatro hacen falta:
 *   · `puntos`     — los que el molde admite, en el orden del archivo.
 *   · `descartes`  — qué claves del aparato se quedaron fuera y en qué puntos.
 *   · `apartados`  — los puntos que el molde no admite, con el motivo. No se
 *                    pierden: se devuelven para que la pantalla los enseñe.
 *   · `avisos`     — las frases ya listas, con la MISMA forma que las de
 *                    `leerGpx`, para que la pantalla junte las dos listas y no
 *                    tenga que saber cuál vino de dónde.
 *
 * @param {Array<Record<string, unknown>>} waypoints
 * @returns {{puntos: Array<Record<string, unknown>>, descartes: DescarteDeCampo[], apartados: PuntoApartado[], avisos: Array<Record<string, unknown>>}}
 */
export function puntosDesdeWaypoints(waypoints) {
  const lista = Array.isArray(waypoints) ? waypoints : [];

  const puntos = [];
  /** @type {PuntoApartado[]} */
  const apartados = [];
  /** @type {Array<Record<string, unknown>>} */
  const avisos = [];
  /** Clave descartada → en qué puntos venía. Un Map conserva el orden de aparición. */
  const descartados = new Map();
  /** Los que traían hora pero ilegible: se guardan sin ella y se dice. */
  const horaIlegible = [];

  lista.forEach((waypoint, i) => {
    const origen = waypoint && typeof waypoint === 'object' ? waypoint : {};
    const nombre = rotulo(origen, i);
    const punto = {};

    for (const [clave, valor] of Object.entries(origen)) {
      if (valor === undefined || valor === null) continue;

      const destino = DEL_GPX_AL_MOLDE[clave];
      if (!destino) {
        // Nada se tira callando: se apunta en qué punto venía.
        if (!descartados.has(clave)) descartados.set(clave, []);
        descartados.get(clave).push(nombre);
        continue;
      }

      // La hora es la única que se comprueba aparte: el molde la quiere como
      // instante con zona horaria, y hay aparatos que escriben otra cosa. Una
      // hora ilegible no vale para tumbar el punto entero —el punto sigue
      // siendo bueno—, pero tampoco se arregla a ojo: se deja fuera y se dice.
      if (destino === 'instante' && !Instante.safeParse(valor).success) {
        horaIlegible.push(nombre);
        continue;
      }

      punto[destino] = valor;
    }

    // Manda el molde, no este archivo: así no hay dos listas de reglas.
    const veredicto = PuntoLevantado.safeParse(punto);
    if (veredicto.success) {
      puntos.push(veredicto.data);
      return;
    }

    const { motivo, mensaje } = porQueNoEntra(veredicto.error);
    apartados.push({ n: i + 1, nombreCampo: String(origen.nombreCampo ?? ''), motivo, mensaje });
  });

  /** @type {DescarteDeCampo[]} */
  const descartes = [...descartados].map(([campo, puntosDelCampo]) => ({
    campo,
    etiqueta: ETIQUETA_DESCARTE[campo] ?? `el campo «${campo}» del archivo, que el levantamiento no guarda`,
    n: puntosDelCampo.length,
    puntos: puntosDelCampo,
  }));

  for (const d of descartes) {
    avisos.push({
      tipo: 'campo_descartado',
      campo: d.campo,
      mensaje: `${d.n} de ${lista.length} punto(s) traían ${d.etiqueta} No se guarda.`,
      n: d.n,
      total: lista.length,
      puntos: d.puntos,
    });
  }

  if (horaIlegible.length) {
    avisos.push({
      tipo: 'hora_ilegible',
      mensaje: `${horaIlegible.length} punto(s) traen una hora que no se puede leer como fecha con zona ` +
        'horaria. El punto se guarda igual; lo que se pierde es saber en qué momento se tomó: ' +
        `${horaIlegible.join(', ')}.`,
      n: horaIlegible.length,
      total: lista.length,
      puntos: horaIlegible,
    });
  }

  if (apartados.length) {
    avisos.push({
      tipo: 'punto_apartado',
      mensaje: `${apartados.length} de ${lista.length} punto(s) no se pueden guardar tal como vienen: ` +
        `${apartados.map((a) => `${a.nombreCampo || `(punto ${a.n})`} — ${a.mensaje}`).join(' ')}`,
      n: apartados.length,
      total: lista.length,
      puntos: apartados.map((a) => a.nombreCampo || `(punto ${a.n})`),
    });
  }

  if (lista.length && !puntos.length) {
    avisos.push({
      tipo: 'sin_puntos_utiles',
      mensaje: 'El archivo traía puntos, pero ninguno se puede guardar. Revise los motivos de arriba ' +
        'antes de volver a exportar desde el aparato.',
      n: 0,
      total: lista.length,
    });
  }

  if (puntos.length > TOPE_PUNTOS) {
    // No se recorta: un recorte silencioso es media jornada de campo perdida.
    avisos.push({
      tipo: 'demasiados_puntos',
      mensaje: `El archivo trae ${puntos.length} puntos y un levantamiento guarda como mucho ${TOPE_PUNTOS}. ` +
        'Un recorrido así son VARIAS jornadas: se cargan por día, cada una con su fecha y su archivo.',
      n: puntos.length,
      total: TOPE_PUNTOS,
    });
  }

  return { puntos, descartes, apartados, avisos };
}

/**
 * El camino entero, que es el que usará la pantalla: TEXTO del archivo → puntos.
 *
 * Los avisos vienen ya juntos y en orden: primero lo que el LECTOR encontró
 * (sin cota, sin hora, nombres repetidos…) y después lo que el TRADUCTOR dejó
 * fuera. Son dos listas del mismo tipo a propósito, para que la pantalla las
 * pinte igual sin saber de dónde salió cada una.
 *
 * ⚠️ Los nombres repetidos NO se tocan. El lector ya avisa de ellos y aquí se
 * conservan tal cual: renombrar un punto para que «no choque» sería acuñar una
 * identidad que nadie ha decidido, que es justo lo que el molde prohíbe.
 *
 * @param {string} texto  el contenido del GPX, tal cual
 */
export function puntosDesdeGpx(texto) {
  const leido = leerGpx(texto);
  const traducido = puntosDesdeWaypoints(leido.waypoints);

  return {
    creator: leido.creator,
    puntos: traducido.puntos,
    descartes: traducido.descartes,
    apartados: traducido.apartados,
    avisos: [...leido.avisos, ...traducido.avisos],
  };
}
