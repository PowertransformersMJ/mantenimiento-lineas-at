// ============================================================================
// importar/decisiones.js — RECORDAR lo que él decidió, jamás PROPONER nada
// ----------------------------------------------------------------------------
// LA DISTINCIÓN QUE GOBIERNA ESTE ARCHIVO ENTERO, y que no se puede perder de
// vista al tocarlo:
//
//     PROPONER = el sistema deduce algo y lo deja marcado.        PROHIBIDO.
//     RECORDAR = el Ingeniero ya lo decidió, con fecha y con firma,
//                y esto se lo devuelve para que lo RATIFIQUE o lo cambie.
//
// El veto de ADR-028 sigue en pie: el sistema NO propone el papel estructural,
// ni el nombre canónico, ni en qué vano cae un punto. Nada de lo que sale de
// aquí es una deducción; todo lo que sale de aquí lo escribió él en un archivo
// con su fecha, y viaja SIEMPRE pegado a esa fecha. Si de un dato no se puede
// decir quién lo decidió y cuándo, este archivo no lo devuelve.
//
// ── DE DÓNDE SALE EL RECUERDO ───────────────────────────────────────────────
// De `herramientas/decisiones-firmadas.json`, que es un extracto redactado del
// fixture de la bóveda (lo produce `herramientas/publicar-decisiones.mjs` con
// lista blanca de campos). La aplicación solo LEE: un libro que la pantalla
// pudiera escribir es un libro donde la pantalla puede FABRICAR un recuerdo, y
// entonces «decidido por usted el 16 de agosto» deja de ser verificable y pasa a
// ser una afirmación del sistema sobre sí mismo. Un archivo del repositorio solo
// cambia con un commit, con autor y con diff.
//
// ── ESTE LIBRO NO DA IDENTIDAD ──────────────────────────────────────────────
// La identidad la da SOLO `identidad.js` sobre `semillas-emitidas.json`. Que un
// nombre esté aquí no lo hace cargable. Por eso el pendiente puede nombrarse sin
// riesgo: no tiene semilla emitida, y el desplegable sale del otro libro.
//
// ── CÓMO SE LEE, Y POR QUÉ NO COMO EL OTRO LIBRO ────────────────────────────
// Se toman las claves CON NOMBRE (`decisiones`, `pendientes`) y NUNCA se recorre
// `Object.keys` de la página de la línea. El libro de identidad sí la recorre
// —allí cada clave ES un nombre de punto—, y copiar aquel patrón aquí haría que
// una clave suelta del archivo apareciera como un punto del Ingeniero.
//
// PURO: sin DOM, sin red, sin módulos nativos, sin criptografía. Corre igual en
// `node --test` y en el navegador.
// ============================================================================

/**
 * La ÚNICA evidencia que este archivo admite para emparejar un punto del GPX
 * con una decisión: que el Ingeniero haya elegido el nombre.
 *
 * No es una constante decorativa. Es la lista completa, y tiene un solo
 * elemento a propósito.
 */
export const EVIDENCIA_ADMITIDA = 'lo eligió el Ingeniero';

/**
 * Lo que este archivo NO usa jamás para emparejar, con el motivo escrito. Está
 * aquí para que el próximo que lo toque tenga que borrar una frase explícita
 * antes de añadir una deducción, en vez de simplemente añadirla.
 */
export const EVIDENCIAS_NO_ADMITIDAS = Object.freeze({
  nombreDeCampo: 'El nombre que grabó el GPS es dato del levantamiento y no está en ningún libro '
    + 'público, así que no se puede emparejar por él; y además tiene errores confirmados por el '
    + 'propio Ingeniero (un apoyo quedó grabado con el nombre de otro).',
  cercania: 'El aparato declara ±8 m. A esa escala la distancia sola no decide de qué lado de un '
    + 'vano cae un punto, y ordenar por cercanía sería un dictamen disfrazado de lista (ADR-028).',
  orden: 'El orden en que el GPS grabó los puntos es el orden en que anduvo la cuadrilla, no el '
    + 'orden de la línea.',
});

// ── Lectura del libro ───────────────────────────────────────────────────────

const paginaDeLinea = (registro, codigoLinea) => {
  const pagina = registro?.[codigoLinea];
  return pagina && typeof pagina === 'object' && !Array.isArray(pagina) ? pagina : null;
};

/** Las filas de una clave con nombre. Nunca `Object.keys`: ver la cabecera. */
function filasDe(registro, codigoLinea, clave) {
  const pagina = paginaDeLinea(registro, codigoLinea);
  const filas = pagina?.[clave];
  return Array.isArray(filas) ? filas.filter((f) => f && typeof f === 'object') : [];
}

/**
 * ¿Está sellada esta fila? Sellada = se sabe QUIÉN la decidió y CUÁNDO.
 *
 * Una fila sin sello no se usa a medias: no se usa. Enseñar su valor sin poder
 * decir de dónde sale lo convertiría en una opinión del sistema con aspecto de
 * recuerdo, que es exactamente lo que este archivo existe para impedir.
 */
export const estaSellada = (fila) =>
  typeof fila?.decididoPor === 'string' && fila.decididoPor.trim() !== ''
  && typeof fila?.decididoEn === 'string' && fila.decididoEn.trim() !== ''
  && typeof fila?.sobre === 'string' && fila.sobre.trim() !== '';

/**
 * Las filas del libro que NO se pueden usar, para que la pantalla pueda decirlo
 * en vez de callarlo. Un recuerdo que desaparece sin explicación se lee como un
 * fallo del programa.
 */
export const filasSinSello = (registro, codigoLinea) =>
  filasDe(registro, codigoLinea, 'decisiones').filter((f) => !estaSellada(f));

/**
 * TODAS las decisiones fechadas sobre un nombre, en el orden del archivo.
 *
 * Se devuelven todas —no solo la última— porque las anteriores son HECHOS, no
 * borradores: el 16 de agosto decidió una cosa, y eso pasó.
 *
 * @param {object} registro
 * @param {string} codigoLinea    p. ej. 'LN-627'
 * @param {string} nombreCanonico
 * @returns {object[]}
 */
export function historialDe(registro, codigoLinea, nombreCanonico) {
  if (typeof nombreCanonico !== 'string' || !nombreCanonico) return [];
  return filasDe(registro, codigoLinea, 'decisiones')
    .filter((f) => estaSellada(f) && f.sobre === nombreCanonico);
}

/**
 * La decisión que MANDA hoy sobre un nombre: la ÚLTIMA fechada.
 *
 * Empate de fechas → gana la última escrita, porque el libro se apenda y el
 * orden del archivo es el orden en que se añadieron. Comparar `decididoEn` como
 * texto es correcto y no accidental: son fechas AAAA-MM-DD, donde el orden
 * alfabético y el cronológico son el mismo.
 *
 * @returns {object|undefined} `undefined` si nunca decidió nada sobre ese nombre
 */
export function decisionVigente(registro, codigoLinea, nombreCanonico) {
  let vigente;
  for (const fila of historialDe(registro, codigoLinea, nombreCanonico)) {
    if (!vigente || fila.decididoEn >= vigente.decididoEn) vigente = fila;
  }
  return vigente;
}

/**
 * Las decisiones vigentes de una línea, una por nombre, en el orden en que ese
 * nombre aparece por primera vez en el archivo —que es el orden del recorrido—.
 */
export function decisionesVigentes(registro, codigoLinea) {
  const nombres = [];
  for (const fila of filasDe(registro, codigoLinea, 'decisiones')) {
    if (estaSellada(fila) && !nombres.includes(fila.sobre)) nombres.push(fila.sobre);
  }
  return nombres.map((n) => decisionVigente(registro, codigoLinea, n)).filter(Boolean);
}

/**
 * Lo que él dejó PENDIENTE. Lista aparte de las decisiones a propósito: el
 * código que rellena fichas solo mira `decisiones`, así que un pendiente no
 * puede rellenar nada ni por accidente ni por un `filter` mal escrito.
 *
 * Pendiente NO es descartado: se devuelve para que la pantalla lo enseñe y él
 * vea que no se ha perdido.
 */
export const pendientesDe = (registro, codigoLinea) =>
  filasDe(registro, codigoLinea, 'pendientes').filter(estaSellada);

/** ¿Este nombre está entre los que él dejó pendientes de verificar en campo? */
export const estaPendiente = (registro, codigoLinea, nombreCanonico) =>
  pendientesDe(registro, codigoLinea).some((f) => f.sobre === nombreCanonico);

// ── Cómo se lee una fecha en voz alta ───────────────────────────────────────

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * '2026-08-16' → «16 de agosto de 2026».
 *
 * A mano y sin `Intl` a propósito: el nombre del mes acaba dentro de una frase
 * que él va a leer antes de un acto que no se puede deshacer, y no puede
 * depender de qué idiomas trajo instalados el navegador de turno. Una fecha que
 * no se entiende se devuelve TAL CUAL: inventarle una sería peor.
 */
export function enCastellano(fechaISO) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fechaISO ?? ''));
  if (!m) return String(fechaISO ?? '');
  const mes = MESES[Number(m[2]) - 1];
  return mes ? `${Number(m[3])} de ${mes} de ${m[1]}` : String(fechaISO);
}

/** «decidido por usted el 16 de agosto de 2026» — el sello que acompaña a TODO valor. */
export function selloDe(fila) {
  if (!estaSellada(fila)) return null;
  const base = `decidido por usted el ${enCastellano(fila.decididoEn)}`;
  return fila.funcionConfirmadaEn
    ? `${base}; confirmado por usted el ${enCastellano(fila.funcionConfirmadaEn)}`
    : base;
}

// ── EL EMPAREJAMIENTO ───────────────────────────────────────────────────────
//
// Aquí está el punto delicado de todo el eslabón, así que se dice sin rodeos:
//
//     EL SISTEMA NO EMPAREJA NADA. El emparejamiento lo hace el Ingeniero, en
//     el momento en que dice cuál de sus puntos es este waypoint. Esta función
//     no adivina esa correspondencia: la LEE de lo que él ya contestó, y para
//     cada waypoint declara por qué quedó emparejado o por qué no.
//
// Por eso la pregunta «¿cuál de sus puntos es este?» NUNCA se recuerda. Es la
// única de las cinco que abre la puerta a todas las demás, y si se dedujera,
// las otras cuatro se rellenarían solas a partir de una deducción del sistema
// vestida con la fecha de él. El recuerdo se dispara con SU acto de nombrar.

/** Los motivos por los que un punto del archivo se queda SIN recuerdo. */
export const SIN_EMPAREJAR = Object.freeze({
  SIN_NOMBRAR: 'sin_nombrar',
  SIN_DECISION: 'sin_decision',
  PENDIENTE: 'pendiente',
  NOMBRE_REPETIDO: 'nombre_repetido',
});

/**
 * @typedef {Object} PuntoDelArchivo  un waypoint del GPX, con lo que él haya contestado
 * @property {string} [clave]          cómo lo identifica la pantalla; no viaja a la base
 * @property {string} [nombreCampo]    como quedó grabado en el aparato
 * @property {string} [nombreCanonico] el nombre que ÉL eligió, o vacío si aún no eligió
 */

/**
 * @typedef {Object} Emparejado
 * @property {string|null} clave
 * @property {string|null} nombreCampo
 * @property {string} nombreCanonico
 * @property {object} decision   la fila vigente del libro, tal cual
 * @property {string} sello      «decidido por usted el …»
 * @property {string} evidencia  siempre EVIDENCIA_ADMITIDA
 * @property {string} porQue     por qué este punto quedó emparejado con esta decisión
 */

/**
 * Empareja los puntos de un archivo del GPS con las decisiones ya firmadas.
 *
 * @param {object} registro    el libro de decisiones, tal cual está en el repositorio
 * @param {string} codigoLinea
 * @param {PuntoDelArchivo[]} puntos
 * @returns {{emparejados: Emparejado[], sinEmparejar: object[], decisionesSinPunto: object[]}}
 *   · `emparejados`        lo que se puede recordar, y por qué
 *   · `sinEmparejar`       lo que NO se empareja, cada uno con su motivo escrito
 *   · `decisionesSinPunto` lo que él decidió y no viene en el archivo de hoy
 */
export function emparejarConDecisiones(registro, codigoLinea, puntos = []) {
  const lista = Array.isArray(puntos) ? puntos : [];

  // Cuántas veces se ha elegido cada nombre en esta pantalla. Si él ha puesto el
  // mismo nombre en dos puntos del archivo, la correspondencia deja de ser
  // cierta para los DOS: no se empareja ninguno y se dice por qué. Un empate no
  // se resuelve eligiendo el primero — eso sería el sistema decidiendo.
  const veces = new Map();
  for (const p of lista) {
    const n = typeof p?.nombreCanonico === 'string' ? p.nombreCanonico.trim() : '';
    if (n) veces.set(n, (veces.get(n) ?? 0) + 1);
  }

  const emparejados = [];
  const sinEmparejar = [];

  for (const p of lista) {
    const clave = p?.clave ?? null;
    const nombreCampo = p?.nombreCampo ?? null;
    const elegido = typeof p?.nombreCanonico === 'string' ? p.nombreCanonico.trim() : '';
    const comun = { clave, nombreCampo, nombreCanonico: elegido || null };

    if (!elegido) {
      sinEmparejar.push({
        ...comun,
        motivo: SIN_EMPAREJAR.SIN_NOMBRAR,
        porQue: 'Todavía no ha dicho cuál de sus puntos es éste, y el sistema no lo averigua solo. '
          + `${EVIDENCIAS_NO_ADMITIDAS.nombreDeCampo} ${EVIDENCIAS_NO_ADMITIDAS.cercania} `
          + 'Mientras no lo diga usted, aquí no se recuerda nada.',
      });
      continue;
    }

    if (veces.get(elegido) > 1) {
      sinEmparejar.push({
        ...comun,
        motivo: SIN_EMPAREJAR.NOMBRE_REPETIDO,
        porQue: `«${elegido}» está elegido en más de un punto de este archivo, así que no se sabe a `
          + 'cuál de ellos corresponde lo que usted decidió. No se recuerda en ninguno: elegir uno '
          + 'sería el sistema decidiendo por usted. Deje ese nombre en un solo punto.',
      });
      continue;
    }

    // El pendiente se comprueba ANTES que la decisión: es una cinta más, porque
    // un pendiente no tiene semilla emitida y por tanto no puede llegar hasta
    // aquí por el desplegable. Si llega, es que algo se torció, y entonces lo
    // que NO puede pasar es que se rellene una ficha con ello.
    if (estaPendiente(registro, codigoLinea, elegido)) {
      sinEmparejar.push({
        ...comun,
        motivo: SIN_EMPAREJAR.PENDIENTE,
        porQue: `«${elegido}» es un punto que usted dejó PENDIENTE de verificar en campo. `
          + 'No se rellena nada con él: pendiente no es descartado, pero tampoco es decidido.',
      });
      continue;
    }

    const decision = decisionVigente(registro, codigoLinea, elegido);
    if (!decision) {
      sinEmparejar.push({
        ...comun,
        motivo: SIN_EMPAREJAR.SIN_DECISION,
        porQue: `Usted eligió «${elegido}» para este punto, y en el libro no hay ninguna decisión `
          + 'suya sobre ese nombre. No se rellena nada: esta pantalla solo recuerda lo que usted '
          + 'decidió, con su fecha. Conteste las preguntas como cualquier punto nuevo.',
      });
      continue;
    }

    emparejados.push({
      clave,
      nombreCampo,
      nombreCanonico: elegido,
      decision,
      sello: selloDe(decision),
      evidencia: EVIDENCIA_ADMITIDA,
      porQue: `Usted eligió «${elegido}» para este punto del archivo, y bajo ese nombre usted `
        + `decidió el ${enCastellano(decision.decididoEn)}. El emparejamiento lo hace su elección, `
        + 'no el sistema: aquí no se ha deducido nada.',
    });
  }

  // Lo que él decidió y hoy no viene en el archivo. No es un error —puede haber
  // traído solo un GPX de los dos— pero tiene que decirse: una decisión que
  // desaparece de la pantalla sin una línea que la nombre se lee como perdida.
  const elegidos = new Set(emparejados.map((e) => e.nombreCanonico));
  const decisionesSinPunto = decisionesVigentes(registro, codigoLinea)
    .filter((d) => !elegidos.has(d.sobre));

  return { emparejados, sinEmparejar, decisionesSinPunto };
}

/**
 * Lo que una decisión recordada rellenaría, en el vocabulario que ya habla
 * `importar/punto.js` — y NADA más.
 *
 * Las dos cosas que NO salen de aquí, y no por olvido:
 *
 *   · `nombreCanonico`, porque lo elige él y es lo que dispara el recuerdo.
 *     Devolverlo aquí sería que el recuerdo se auto-alimentara.
 *   · `aprobado` / `estado`, porque aprobar es el ACTO irreversible y el
 *     recuerdo es memoria de una intención. Que el 16 de agosto lo aprobara no
 *     lo aprueba hoy.
 *
 * Cada campo viaja con la fecha que lo respalda: en `valores` va el qué, en
 * `procedencia` va de dónde sale. La pantalla no tiene forma de pintar uno sin
 * el otro porque nunca recibe uno sin el otro.
 *
 * @param {object} decision  una fila vigente del libro
 * @returns {{valores: object, procedencia: object}}
 */
export function loQueSeRecuerda(decision) {
  if (!estaSellada(decision)) return { valores: {}, procedencia: {} };

  const sello = selloDe(decision);
  const valores = {};
  const procedencia = {};
  const anotar = (campo, valor, textoDelSello = sello) => {
    if (valor === undefined) return;
    valores[campo] = valor;
    procedencia[campo] = {
      decididoPor: decision.decididoPor,
      decididoEn: decision.decididoEn,
      sello: textoDelSello,
    };
  };

  anotar('tipoPunto', decision.tipoPunto);
  if (decision.sitio?.insertarAlFinal === true) anotar('insertarAlFinal', true);
  else if (decision.sitio?.insertarDespuesDe) anotar('insertarDespuesDe', decision.sitio.insertarDespuesDe);
  anotar('funcionEstructural', decision.funcionEstructural);

  // La firma del papel estructural es un hecho DISTINTO del papel. Se recuerda
  // igual cuando es `false`: que él no la firmara también lo decidió él, y la
  // pantalla tiene que poder decir «quedará como SUPUESTO» con esas palabras.
  if (typeof decision.funcionConfirmada === 'boolean') {
    anotar('funcionConfirmada', decision.funcionConfirmada,
      decision.funcionConfirmada
        ? sello
        : `${sello}. Usted no firmó este papel estructural: quedará como SUPUESTO`);
  }

  return { valores, procedencia };
}
