// ============================================================================
// nucleo/umbrales.js — la tabla de umbrales con semáforo
// ----------------------------------------------------------------------------
// QUÉ ES: la única lista de "esto está dentro / esto hay que mirarlo" de todo el
// sistema. La pestaña, el informe y el exporte leen de AQUÍ; ninguno vuelve a
// escribir su propio `if (x > 50)`. Ese es el motivo de existir del archivo: que
// el sistema diga LO MISMO en los tres sitios. Un tablero que marca verde y un
// informe que marca rojo con el mismo dato no es un bug de interfaz: es la
// pérdida de la confianza en el sistema entero.
//
// QUÉ REGLA LO GOBIERNA (CLAUDE.md §4): el veredicto sale del VALOR contra la
// NORMA, y la norma se declara con nombre y apellido en cada fila. Un número sin
// fórmula o norma detrás es una opinión, no un dictamen.
//
// TRES ESTADOS, Y NINGUNO ES UNA APROBACIÓN:
//   'cumple'       — el valor está dentro del umbral declarado en esta fila.
//   'revisar'      — está fuera. NO dice "incumple": eso lo dictamina quien
//                    firma, con el expediente completo delante. A propósito no
//                    existe un estado 'incumple' en este módulo.
//   'no_evaluable' — falta el dato. Se dice cuál falta, en `criterio`. Jamás se
//                    rellena con un supuesto para que la fila "se vea completa".
//
// LA TABLA SIEMPRE DEVUELVE LAS MISMAS FILAS, EN EL MISMO ORDEN, pase lo que
// pase con los datos — incluso sin datos. Trampa que evita: una fila que
// desaparece cuando falta el dato se lee como "eso ya no aplica", y el informe
// sale sin el hueco a la vista. El hueco tiene que verse.
//
// AQUÍ NO SE CALCULA MECÁNICA. Los tiros llegan ya calculados (mecanica.js). Si
// este archivo los recalculara habría DOS dueños del mismo número, y el día que
// difieran en el tercer decimal nadie sabría cuál mandó en el informe firmado.
//
// ⚠️ El umbral del indicador 1 NO se toma de `tiroMaximoAdmisible()` de
// mecanica.js, que hoy fija 0,5·RTS en código. Un tope de diseño es una decisión
// de INGENIERÍA fechada, no una constante de programa: viaja en la hipótesis,
// que se versiona y se congela cuando se firma. Mientras la vista siga leyendo
// aquel 0,5 y esta tabla lea la hipótesis, los dos pueden discrepar — eso lo
// cierra la integración (ver el pendiente del módulo).
//
// PURO: no importa nada. Ni DOM, ni red, ni contratos, ni los otros archivos del
// núcleo. Entran objetos planos con números, sale una lista de filas.
// Los textos se arman con `toFixed`, nunca con `toLocaleString`: el formateo por
// configuración regional depende del ICU del entorno y haría que la misma
// entrada produjera criterios distintos en la Mac y en el CI.
// ============================================================================

/**
 * @typedef {'cumple'|'revisar'|'no_evaluable'} EstadoIndicador
 *
 * @typedef {Object} Indicador
 * @property {string} id          identificador estable; es la llave con la que
 *                                la interfaz y el exporte referencian la fila.
 *                                NO se renombra (cambios aditivos, CLAUDE.md §3.1).
 * @property {string} etiqueta    cómo se llama la fila para el ingeniero.
 * @property {number|null} valor  lo medido. `null` cuando no es evaluable.
 * @property {string} unidad      unidad del valor; cadena vacía si es adimensional.
 * @property {number|number[]|null} umbral  número, o `[min, max]` si el
 *                                comparador es 'entre'. `null` si no hay umbral.
 * @property {'<='|'>='|'entre'|'ninguno'} comparador  cómo se lee el umbral.
 * @property {EstadoIndicador} estado  el semáforo.
 * @property {string} criterio    POR QUÉ ese umbral y, si no es evaluable, QUÉ
 *                                dato falta exactamente para que lo sea.
 * @property {string} fuente      de dónde sale el número: norma citada, o la
 *                                confesión de que no hay norma detrás.
 */

// ── Fuentes declaradas ──────────────────────────────────────────────────────
// Se escriben una sola vez para que la tabla no acabe con tres formas distintas
// de escribir "RETIE". `diseno` es deliberadamente incómoda de leer: cuando una
// fila la lleva, el ingeniero debe saber de un vistazo que ahí NO hay norma que
// respalde el umbral, solo práctica de diseño.
const FUENTES = Object.freeze({
  retie:   'RETIE',
  iec:     'IEC 60826',
  ieee738: 'IEEE 738',
  diseno:  'criterio de diseño (sin norma)',
});

// ── Utilidades mínimas ──────────────────────────────────────────────────────

/** Un número de verdad, o `null`. `NaN`, `''`, `null` y `undefined` son lo mismo aquí: falta el dato. */
const numero = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

const lista = (x) => (Array.isArray(x) ? x : []);

/**
 * Solo las estructuras sostienen el conductor. Un empalme puede estar a mitad
 * de vano y un punto de referencia es una marca del levantamiento: contarlos
 * aquí falsearía tanto el conteo de puestas a tierra como el de alturas de
 * sujeción que faltan. Sin `tipoPunto` declarado se asume estructura, que es lo
 * que asume el resto del sistema.
 */
const esEstructura = (a) => (a?.tipoPunto ?? 'Estructura') === 'Estructura';

/** Formato estable e independiente del entorno (ver cabecera). */
const f = (x, d = 1) => (numero(x) == null ? '—' : x.toFixed(d));

const veredicto = (valor, umbral, comparador) => {
  if (comparador === '<=') return valor <= umbral ? 'cumple' : 'revisar';
  if (comparador === '>=') return valor >= umbral ? 'cumple' : 'revisar';
  if (comparador === 'entre') return valor >= umbral[0] && valor <= umbral[1] ? 'cumple' : 'revisar';
  return 'no_evaluable';
};

/** Arma la fila. El orden de las claves es el del typedef, para que el exporte sea estable. */
// ⚠️ ESTA LISTA ES EL CONTRATO DE LA FILA, y por eso se copia campo a campo en
// vez de dejar pasar el objeto entero: lo que no está aquí NO existe para quien
// consume la tabla. Justo por eso hay que añadir el campo nuevo también aquí —
// `procedenciaUmbral` se puso en `base` en §ADR-013 «como CAMPO y no solo dentro
// de la prosa» y esta lista se lo comía en silencio, así que el informe firmable
// —que lo lee en `exportar/informe.js` para decir si el tope lo declaró el
// Ingeniero o lo adoptó el sistema— recibía `undefined` SIEMPRE y llamaba
// «adoptado por defecto» a un tope declarado. Las pruebas del informe no lo
// veían porque construían el indicador a mano, con el campo ya puesto: un
// fixture que miente (`30 · L-33`). Lo caza `tests/umbral-tierra.test.js`
// recorriendo la tabla REAL (§ADR-052).
const fila = ({ id, etiqueta, valor, unidad, umbral, comparador, estado, criterio, fuente,
                procedenciaUmbral }) =>
  ({ id, etiqueta, valor, unidad, umbral, comparador, estado, criterio, fuente,
     ...(procedenciaUmbral === undefined ? {} : { procedenciaUmbral }) });

/**
 * La fila cuando falta el dato. Conserva umbral y comparador a propósito: el
 * ingeniero tiene que ver contra QUÉ se habría comparado, aunque no se pudiera.
 */
const sinDato = (base, motivo) =>
  fila({ ...base, valor: null, estado: 'no_evaluable', criterio: motivo });

/**
 * Nombre legible del tramo para los textos. Acepta las dos formas en que llega:
 * la del núcleo (`desde`/`hasta` son apoyos con nombre) y la de una vista que ya
 * los aplanó a texto. Si no hay ninguna, el ordinal — nunca un nombre inventado.
 */
function nombreTramo(tramo, i) {
  if (typeof tramo?.nombre === 'string' && tramo.nombre) return tramo.nombre;
  const de = tramo?.desde?.nombre ?? (typeof tramo?.desde === 'string' ? tramo.desde : null);
  const a  = tramo?.hasta?.nombre ?? (typeof tramo?.hasta === 'string' ? tramo.hasta : null);
  return de && a ? `${de} → ${a}` : `tramo ${i + 1}`;
}

/**
 * Tiros de un tramo, normalizados a kgf.
 *
 * Acepta tres formas porque tres son las que existen hoy en el sistema y no se
 * quiere obligar a nadie a traducir antes de llamar:
 *   · `tramo.estados`      tal cual lo devuelve `estadosDelTramo()` — {eds:{H},…}
 *   · `tramo.tiros_kgf`    los mismos cuatro estados ya aplanados a número
 *   · `tramo.tiroPico_kgf` solo el pico, cuando alguien ya resumió
 *
 * ⚠️ La tercera forma tiene una consecuencia real: un pico resumido NO dice si
 * incluía el viento, así que con ella el criterio RETIE «sin carga externa» se
 * queda sin poder evaluarse. Se declara, no se supone.
 */
function tirosDelTramo(tramo) {
  const e = tramo?.estados;
  const t = tramo?.tiros_kgf;
  const leer = (k) => numero(e?.[k]?.H) ?? numero(t?.[k]);

  const eds = leer('eds'), tMax = leer('tMax'), viento = leer('viento'), tMin = leer('tMin');
  const sinCargaExterna = [eds, tMax, tMin].filter((x) => x != null);
  const todos = [eds, tMax, tMin, viento].filter((x) => x != null);

  return {
    eds,
    detallado: todos.length > 0,
    pico: todos.length ? Math.max(...todos) : numero(tramo?.tiroPico_kgf),
    picoSinCargaExterna: sinCargaExterna.length ? Math.max(...sinCargaExterna) : null,
  };
}

/** El mayor de una lista, con el índice de dónde salió (para poder nombrar el tramo). */
function mayorCon(valores) {
  let mejor = null, indice = -1;
  valores.forEach((v, i) => { if (v != null && (mejor == null || v > mejor)) { mejor = v; indice = i; } });
  return { valor: mejor, indice };
}

// ════════════════════════════════════════════════════════════════════════════
// La tabla
// ════════════════════════════════════════════════════════════════════════════

/**
 * Evalúa los ocho indicadores de la línea y devuelve SIEMPRE nueve filas: el
 * primero emite dos, porque hay dos criterios vivos para el tiro máximo y el
 * sistema no elige entre ellos (ver `tiro_sin_carga_externa_retie`).
 *
 * @param {Object} [entrada]
 * @param {Array}  [entrada.tramos]       tramos de tensión, con sus estados mecánicos.
 * @param {Object} [entrada.conductor]    {rts_kgf, masaLineal_kg_m, ampacidad_A?}.
 *                                        Se aceptan también los nombres neutros
 *                                        del núcleo (`rts`, `w`), que es como los
 *                                        recibe `estadosDelTramo()`.
 * @param {Object} [entrada.hipotesis]    hipótesis de cálculo de la línea.
 * @param {Object} [entrada.estadisticas] salida de `estadisticasVanos()`, o null.
 * @param {Array}  [entrada.apoyos]       apoyos de la línea (objetos planos).
 * @returns {Indicador[]} nueve filas, en orden estable.
 */
export function evaluarUmbrales(entrada) {
  const e = entrada ?? {};
  const tramos = lista(e.tramos);
  const conductor = e.conductor ?? {};
  const hipotesis = e.hipotesis ?? {};
  const estadisticas = e.estadisticas ?? null;
  const apoyos = lista(e.apoyos).filter(esEstructura);

  const rts_kgf = numero(conductor.rts_kgf) ?? numero(conductor.rts);
  const w_kg_m  = numero(conductor.masaLineal_kg_m) ?? numero(conductor.w);
  const tiros = tramos.map(tirosDelTramo);

  return [
    indicadorTiroAdoptado(tramos, tiros, rts_kgf, hipotesis),
    indicadorTiroRetie(tramos, tiros, rts_kgf, hipotesis),
    indicadorEds(hipotesis),
    indicadorVanoVir(tramos),
    indicadorCatenaria(tramos, tiros, rts_kgf, w_kg_m, hipotesis),
    indicadorCoeficienteVariacion(estadisticas),
    indicadorDespeje(apoyos, hipotesis),
    indicadorPuestaTierra(apoyos, hipotesis),
    indicadorAmpacidad(conductor, hipotesis),
  ];
}

// ── 1a · Tiro máximo frente al tope ADOPTADO ────────────────────────────────
//
// El tope no es una constante del programa: es una decisión del ingeniero, y por
// eso viaja en la hipótesis, que se versiona y se congela al firmar. Si la
// hipótesis no lo declara se usa 50 % con procedencia 'criterio_clasico' — el
// valor de toda la vida, escrito como lo que es: una costumbre heredada, no una
// norma citada. Que la fila diga de dónde salió el 50 es justo lo que permite
// discutirlo.
function indicadorTiroAdoptado(tramos, tiros, rts_kgf, hipotesis) {
  const declarado = numero(hipotesis.tiroAdmisible_pct);
  const umbral = declarado ?? 50;
  const procedencia = declarado != null ? 'hipotesis_declarada' : 'criterio_clasico';
  const respaldo = declarado != null
    ? `Umbral del ${f(umbral)} % tomado de la hipótesis de la línea (procedencia: ${procedencia}).`
    : `Umbral del 50 % adoptado por defecto (procedencia: criterio_clasico): la hipótesis no declara `
      + `\`tiroAdmisible_pct\`. Es la práctica clásica, no una norma citada.`;
  // Este párrafo va en la fila SIEMPRE, cumpla o no: la elección de criterio es
  // una decisión abierta y el informe no puede ocultarla detrás de un verde.
  const convivencia = ' Convive con el criterio RETIE del 25 % sin carga externa (fila siguiente):'
    + ' cuál de los dos rige NO lo decide el sistema, lo decide el Ingeniero.';

  const base = {
    id: 'tiro_maximo_pct_rts',
    etiqueta: 'Tiro máximo (peor estado) frente al tope adoptado',
    unidad: '% RTS',
    umbral,
    // ADITIVO (§ADR-013, hallazgo 9): de dónde salió el umbral, como CAMPO y no
    // solo dentro de la prosa de `criterio`. El informe firmable atribuía el
    // tope «a la hipótesis» cuando la hipótesis no lo declaraba, y quien quiera
    // repetir esa frase correctamente no debería tener que leerse un párrafo
    // con una expresión regular. Un dato que otro módulo necesita es un campo.
    procedenciaUmbral: procedencia,
    comparador: '<=',
    fuente: declarado != null
      ? (hipotesis.normaReferencia || 'hipótesis de cálculo de la línea')
      : FUENTES.diseno,
  };

  if (rts_kgf == null) return sinDato(base, `${respaldo} No se declara la carga de rotura (RTS) del conductor: sin ella el tiro no se puede expresar en % de RTS.${convivencia}`);
  const { valor: pico, indice } = mayorCon(tiros.map((t) => t.pico));
  if (pico == null) return sinDato(base, `${respaldo} Ningún tramo trae sus tiros calculados (faltan \`estados\`, \`tiros_kgf\` o \`tiroPico_kgf\`).${convivencia}`);

  const pct = (pico / rts_kgf) * 100;
  return fila({
    ...base,
    valor: pct,
    estado: veredicto(pct, umbral, '<='),
    criterio: `${respaldo} El valor es el tiro más alto de los cuatro estados evaluados `
      + `(${f(pico, 0)} kgf en ${nombreTramo(tramos[indice], indice)}) sobre una RTS de ${f(rts_kgf, 0)} kgf.${convivencia}`,
  });
}

// ── 1b · El OTRO criterio: RETIE, 25 % sin carga externa ────────────────────
//
// Existe como fila propia y no como nota al pie porque los dos criterios dan
// veredictos distintos sobre la misma línea, y esconder el más exigente detrás
// de un verde es exactamente cómo se firma algo que luego no se sostiene.
//
// Sale 'no_evaluable' mientras la hipótesis no declare cuál manda
// (`hipotesis.criterioTiroQueRige`). No es que falte el número: es que falta la
// DECISIÓN, y este módulo no la toma por nadie.
function indicadorTiroRetie(tramos, tiros, rts_kgf, hipotesis) {
  const rige = hipotesis.criterioTiroQueRige;   // 'adoptado' | 'retie_25' | undefined
  const base = {
    id: 'tiro_sin_carga_externa_retie',
    etiqueta: 'Tiro sin carga externa frente al 25 % de RTS (criterio RETIE)',
    unidad: '% RTS',
    umbral: 25,
    comparador: '<=',
    fuente: FUENTES.retie,
  };
  const pendiente = 'Elección de criterio PENDIENTE del Ingeniero: la hipótesis no declara '
    + '`criterioTiroQueRige` ("adoptado" o "retie_25"). El sistema muestra los dos y no elige.';

  if (rige !== 'retie_25' && rige !== 'adoptado') return sinDato(base, pendiente);
  if (rts_kgf == null) return sinDato(base, 'No se declara la carga de rotura (RTS) del conductor.');

  const { valor: pico, indice } = mayorCon(tiros.map((t) => t.picoSinCargaExterna));
  if (pico == null) {
    // Trampa real: si solo llegó `tiroPico_kgf`, ese pico puede venir del estado
    // de viento. Compararlo contra un criterio que dice "sin carga externa" daría
    // un rojo falso. Antes de mentir, se declara que no se puede evaluar.
    return sinDato(base, 'No llegan los estados por separado (eds / tMax / tMin): con un pico ya '
      + 'resumido no se sabe si incluía viento, y este criterio exige el tiro SIN carga externa.');
  }

  const pct = (pico / rts_kgf) * 100;
  const quienRige = rige === 'retie_25'
    ? 'La hipótesis declara que el criterio que RIGE es este (retie_25).'
    : 'La hipótesis declara que el criterio que rige es el tope adoptado (fila anterior); esta fila queda como contraste.';
  return fila({
    ...base,
    valor: pct,
    estado: veredicto(pct, 25, '<='),
    criterio: `${quienRige} El valor es el mayor tiro de los estados SIN carga externa `
      + `(${f(pico, 0)} kgf en ${nombreTramo(tramos[indice], indice)}); el estado de viento queda fuera a propósito. `
      + 'El artículo y la tabla del RETIE aplicables NO están verificados con fuente en este repositorio: confirmarlos antes de firmar.',
  });
}

// ── 2 · EDS en la banda de fatiga ───────────────────────────────────────────
//
// Un EDS alto ahorra altura de apoyo y arruina el conductor por vibración
// eólica: la factura llega años después, en roturas de hilos en las grapas. La
// banda 18-22 % es práctica de diseño para líneas sin amortiguadores; con
// amortiguadores instalados y verificados el criterio cambia, y por eso la fila
// declara que no hay norma detrás.
function indicadorEds(hipotesis) {
  const base = {
    id: 'eds_fatiga_pct_rts',
    etiqueta: 'EDS dentro de la banda de fatiga',
    unidad: '% RTS',
    umbral: [18, 22],
    comparador: 'entre',
    fuente: FUENTES.diseno,
  };
  const eds = numero(hipotesis.eds_pct);
  if (eds == null) return sinDato(base, 'La hipótesis no declara `eds_pct` (tensión de cada día).');

  const nota = 'Banda 18-22 % de RTS: por debajo, la flecha y la altura de apoyo se disparan; '
    + 'por encima, la vibración eólica acorta la vida del conductor en las grapas. '
    + 'Criterio práctico de diseño, sin norma citada: con amortiguadores verificados el límite superior puede subir.';
  return fila({
    ...base,
    valor: eds,
    estado: veredicto(eds, [18, 22], 'entre'),
    criterio: nota,
  });
}

// ── 3 · Relación vano / VIR por tramo ───────────────────────────────────────
//
// El VIR es un vano EQUIVALENTE: supone que todos los vanos del tramo se
// regulan juntos y que la tensión es común. Esa suposición se sostiene mientras
// los vanos se parezcan entre sí. Fuera de 0,7-1,3 deja de valer, y el síntoma
// es feo: el sistema calcula un tiro único para el tramo que ni el vano corto ni
// el largo tienen de verdad — la flecha del vano largo sale corta y el gálibo
// que se "demuestra" no existe en campo. El remedio es subdividir el tramo.
//
// Una sola fila para toda la línea, no una por tramo: la tabla del semáforo
// tiene filas fijas (ver cabecera). El valor es la relación MÁS alejada de 1 y
// el criterio enumera dónde están las demás.
function indicadorVanoVir(tramos) {
  const base = {
    id: 'relacion_vano_vir',
    etiqueta: 'Relación vano / VIR en cada tramo',
    unidad: '',
    umbral: [0.7, 1.3],
    comparador: 'entre',
    fuente: FUENTES.diseno,
  };

  let peor = null;          // { razon, tramo, vano_m }
  let fuera = [];
  let evaluados = 0;

  tramos.forEach((t, i) => {
    const vir_m = numero(t?.vir);
    const vanos = lista(t?.vanos).map(numero).filter((v) => v != null && v > 0);
    if (vir_m == null || vir_m <= 0 || !vanos.length) return;
    evaluados++;
    for (const vano_m of vanos) {
      const razon = vano_m / vir_m;
      // "Más alejada de 1" en escala logarítmica: 0,5 y 2,0 se desvían igual.
      // Con la distancia lineal, un vano corto (razón 0,14) parecería menos
      // grave que uno el doble de largo, y es al revés.
      if (peor == null || Math.abs(Math.log(razon)) > Math.abs(Math.log(peor.razon))) {
        peor = { razon, tramo: nombreTramo(t, i), vano_m };
      }
      if (razon < 0.7 || razon > 1.3) fuera.push(`${f(vano_m)} m en ${nombreTramo(t, i)} (${f(razon, 2)})`);
    }
  });

  if (!evaluados) return sinDato(base, 'No hay tramos con VIR y vanos declarados.');

  const detalle = fuera.length
    ? `Fuera de banda: ${fuera.join('; ')}. La hipótesis del VIR (tensión común en todo el tramo) `
      + 'deja de valer: ese tramo debería subdividirse en el anclaje intermedio antes de usar su flecha para gálibo.'
    : `Los ${evaluados} tramo(s) tienen vanos homogéneos frente a su VIR: la tensión común del tramo es defendible.`;

  return fila({
    ...base,
    valor: peor.razon,
    estado: veredicto(peor.razon, [0.7, 1.3], 'entre'),
    criterio: `Relación más alejada de 1: vano de ${f(peor.vano_m)} m en ${peor.tramo}. ${detalle}`,
  });
}

// ── 4 · Parámetro de catenaria frente a la bandera de vibración ─────────────
//
// C = H/w tiene unidades de longitud y resume "qué tan tenso está el cable".
// Por encima de ~1.800 m el conductor está lo bastante tenso como para que la
// vibración eólica sea el modo de falla dominante en las grapas.
//
// ⚠️ ES UNA BANDERA PRÁCTICA, NO UNA NORMA. Se rotula así en la fuente de la
// fila para que nadie la cite en un informe como si fuera un artículo. Se evalúa
// en el estado EDS —el de cada día— porque la fatiga se acumula en el día a día,
// no en el pico de viento.
function indicadorCatenaria(tramos, tiros, rts_kgf, w_kg_m, hipotesis) {
  const base = {
    id: 'parametro_catenaria_vibracion',
    etiqueta: 'Parámetro de catenaria C = H/w en EDS (bandera de vibración)',
    unidad: 'm',
    umbral: 1800,
    comparador: '<=',
    fuente: FUENTES.diseno,
  };
  if (w_kg_m == null || w_kg_m <= 0) return sinDato(base, 'No se declara la masa lineal del conductor (kg/m).');

  // Preferencia: el H de EDS que ya calculó el motor. Si no llega, se usa la
  // definición del propio EDS (H = eds% · RTS), que es de donde el motor lo
  // saca; no es un segundo cálculo, es la misma definición.
  const { valor: hDeTramos, indice } = mayorCon(tiros.map((t) => t.eds));
  const eds_pct = numero(hipotesis.eds_pct);
  const H_kgf = hDeTramos ?? (eds_pct != null && rts_kgf != null ? (eds_pct / 100) * rts_kgf : null);
  if (H_kgf == null) {
    return sinDato(base, 'No hay tiro de EDS: ni los tramos lo traen calculado, ni la hipótesis '
      + 'declara `eds_pct` junto con la RTS del conductor.');
  }

  const C_m = H_kgf / w_kg_m;
  const origen = hDeTramos != null
    ? `tiro de EDS del motor (${f(H_kgf, 0)} kgf, ${nombreTramo(tramos[indice], indice)})`
    : `tiro de EDS derivado de la hipótesis (${f(eds_pct)} % de ${f(rts_kgf, 0)} kgf = ${f(H_kgf, 0)} kgf)`;

  return fila({
    ...base,
    valor: C_m,
    estado: veredicto(C_m, 1800, '<='),
    criterio: `C = H/w con ${origen} y w = ${w_kg_m} kg/m. Bandera práctica en 1.800 m: por encima, `
      + 'el conductor va lo bastante tenso como para que la vibración eólica gobierne la vida útil en las grapas. '
      + 'CRITERIO PRÁCTICO SIN NORMA CITADA — no se puede invocar en un informe como exigencia normativa.',
  });
}

// ── 5 · Homogeneidad del vaneo ──────────────────────────────────────────────
//
// El coeficiente de variación mide si la línea está vaneada de forma pareja.
// Por encima del 30 % conviven vanos muy distintos en el mismo tramo, que es la
// causa raíz del indicador 3 y de que una regulación única deje unos vanos
// flojos y otros tensos.
function indicadorCoeficienteVariacion(estadisticas) {
  const base = {
    id: 'coeficiente_variacion_vano',
    etiqueta: 'Coeficiente de variación del vaneo',
    unidad: '%',
    umbral: 30,
    comparador: '<=',
    fuente: FUENTES.diseno,
  };
  const cv = numero(estadisticas?.coeficienteVariacion_pct);
  if (cv == null) return sinDato(base, 'No hay estadística de vanos (hace falta al menos un vano válido).');

  return fila({
    ...base,
    valor: cv,
    estado: veredicto(cv, 30, '<='),
    criterio: `Desviación estándar de los vanos sobre su promedio, con n = ${estadisticas?.n ?? '—'} vanos. `
      + 'Umbral del 30 % como criterio de homogeneidad, sin norma detrás: por encima, la línea mezcla '
      + 'vanos muy distintos y una tensión de regulación única deja unos flojos y otros tensos.',
  });
}

// ── 6 · Despeje mínimo al terreno ───────────────────────────────────────────
//
// Es el indicador que de verdad decide si una línea es segura, y hoy NO se puede
// calcular. Sale 'no_evaluable' siempre, y con el motivo exacto de qué falta —
// que es distinto según el caso. Preferir un verde optimista aquí es la forma
// más directa de que el sistema certifique algo que no midió.
//
// Lo que falta, en orden: (1) la cota del PUNTO DE SUJECIÓN de cada apoyo — la
// del terreno no sirve, el conductor no cuelga del suelo; (2) la distancia
// mínima exigida por categoría de terreno, que en Colombia fija el RETIE; y
// (3) el perfil del terreno BAJO el vano, que ningún levantamiento de apoyos
// contiene: el punto crítico casi nunca está bajo un apoyo.
function indicadorDespeje(apoyos, hipotesis) {
  const base = {
    id: 'despeje_minimo_terreno',
    etiqueta: 'Despeje mínimo de la flecha al terreno',
    unidad: 'm',
    umbral: null,
    comparador: 'ninguno',
    fuente: FUENTES.retie,
  };
  const exigido = hipotesis.despejeMinimo_m;
  const hayExigencia = exigido != null && typeof exigido === 'object' && Object.keys(exigido).length > 0;

  const conSujecion = apoyos.filter((a) => numero(a?.cotaSujecion_m) != null).length;
  const faltan = apoyos.length - conSujecion;

  if (!apoyos.length) return sinDato(base, 'No hay estructuras cargadas: sin apoyos no hay despeje que verificar.');
  if (faltan > 0) {
    return sinDato(base, `Faltan ${faltan} de ${apoyos.length} alturas de sujeción del conductor `
      + '(`cotaSujecion_m`). La cota del terreno NO sirve: el conductor no cuelga del suelo, y usarla '
      + 'daría un despeje mayor que el real justo donde importa.');
  }
  if (!hayExigencia) {
    return sinDato(base, 'Hay alturas de sujeción, pero la hipótesis no declara `despejeMinimo_m` por '
      + 'categoría de terreno. Un valor único para toda la línea no es defendible: la exigencia cambia '
      + 'si abajo hay cultivo, vía o zona habitada.');
  }
  return sinDato(base, 'Hay alturas de sujeción y exigencia declarada, pero falta el PERFIL DEL TERRENO '
    + 'bajo cada vano. El punto crítico casi nunca está bajo un apoyo, sino a mitad de vano y sobre un '
    + 'accidente que el levantamiento de apoyos no ve. Sin ese perfil, cualquier despeje que publicara '
    + 'este módulo sería un supuesto disfrazado de medición.');
}

// ── 7 · Resistencia de puesta a tierra ──────────────────────────────────────
//
// Sin medición no hay indicador: una puesta a tierra "que debería estar bien" no
// existe. Si solo una parte de los apoyos está medida se evalúa lo medido y se
// declara la cobertura — un verde sobre 3 de 40 apoyos no es un verde de línea.
function indicadorPuestaTierra(apoyos, hipotesis) {
  // Mismo criterio que `umbralPuestaTierra()` de coherencia.js, que es el dueño
  // único del número para las pantallas. Aquí se repite en vez de importarse
  // porque este módulo es PURO a propósito (ver cabecera), y lo que garantiza
  // que los dos no se separen no es la buena voluntad: es el guardián de
  // `tests/umbral-tierra.test.js`, que declara un tope propio y exige que motor,
  // tabla y ficha den el MISMO número. Cero y negativos caen al criterio: un
  // tope de 0 Ω publicaría «∞× el criterio» en la ficha del apoyo.
  const declarado = numero(hipotesis.resistenciaTierraMax_ohm);
  const valido = declarado != null && declarado > 0 ? declarado : null;
  const umbral = valido ?? 10;
  const procedencia = valido != null ? 'hipotesis_declarada' : 'criterio_diseno';
  const base = {
    id: 'resistencia_puesta_tierra',
    etiqueta: 'Resistencia de puesta a tierra (peor apoyo medido)',
    unidad: 'Ω',
    umbral,
    // ADITIVO, igual que en la fila del tiro (§ADR-013): de dónde salió el
    // umbral, como CAMPO y no solo dentro de la prosa del criterio. Quien quiera
    // repetir la frase correctamente no debería tener que leerse un párrafo con
    // una expresión regular.
    procedenciaUmbral: procedencia,
    comparador: '<=',
    // La FUENTE dice de dónde viene el criterio, y hasta hoy decía «RETIE» en la
    // misma celda en la que el texto avisa de que el artículo del RETIE no está
    // verificado aquí. Lo que se firma no puede decir las dos cosas: sin tope
    // declarado la fuente es lo que es —un criterio de diseño sin norma—, y con
    // tope declarado es la norma que el Ingeniero haya puesto en su hipótesis.
    fuente: valido != null
      ? (hipotesis.normaReferencia || 'hipótesis de cálculo de la línea')
      : FUENTES.diseno,
  };

  const medidas = apoyos
    .map((a) => ({ a, r: numero(a?.puestaTierra?.resistencia_ohm) }))
    .filter((m) => m.r != null);

  if (!medidas.length) {
    return sinDato(base, 'Ningún apoyo tiene medición de resistencia de puesta a tierra '
      + '(`puestaTierra.resistencia_ohm`). Sin medición no hay indicador: una puesta a tierra que "debería" '
      + 'estar bien no es un dato.');
  }

  const peor = medidas.reduce((p, m) => (m.r > p.r ? m : p));
  const nombre = peor.a?.nombreNormalizado ?? peor.a?.nombreCampo ?? peor.a?.nombre ?? 'apoyo sin nombre';
  const cobertura = `Medidos ${medidas.length} de ${apoyos.length} apoyos`;
  const excedidos = medidas.filter((m) => m.r > umbral).length;

  return fila({
    ...base,
    valor: peor.r,
    estado: veredicto(peor.r, umbral, '<='),
    criterio: `${cobertura}${medidas.length < apoyos.length ? ' — el resto no está medido, así que este '
      + 'resultado NO es un veredicto de la línea completa' : ''}. Peor caso: ${f(peor.r, 2)} Ω en ${nombre}`
      + `${excedidos ? `; ${excedidos} apoyo(s) por encima del umbral` : ''}. `
      + `Umbral de ${f(umbral, 0)} Ω ${valido != null
        ? `tomado de la hipótesis de la línea (procedencia: ${procedencia})`
        : `adoptado por defecto (procedencia: ${procedencia}): la hipótesis no declara `
          + '`resistenciaTierraMax_ohm`'}. El artículo y la tabla del RETIE aplicables `
      + 'NO están verificados con fuente en este repositorio. Confirmar antes de firmar.',
  });
}

// ── 8 · Ampacidad frente a la corriente de operación ────────────────────────
//
// La ampacidad se calcula en nucleo/termica.js (IEEE 738) y depende de las
// condiciones ambientales: aquí solo se COMPARA, para que ese número tenga un
// único dueño. Sin corriente declarada no hay indicador — y esa corriente es un
// dato de operación que el sistema no puede deducir de la geometría.
function indicadorAmpacidad(conductor, hipotesis) {
  // SOLO del conductor, a propósito. Hasta §ADR-052 había un `?? hipotesis.ampacidad_A`
  // detrás: una rama MUERTA —el molde no admite ese campo, así que la base lo
  // descartaba en silencio— y, si hubiera vivido, un SEGUNDO dueño de un número
  // que tiene uno solo (`nucleo/termica.js`, IEEE 738). Una ampacidad declarada
  // a mano en la hipótesis competiría con la calculada con el ambiente real, y
  // la de placa siempre gana por optimista.
  const ampacidad_A = numero(conductor.ampacidad_A);
  const base = {
    id: 'ampacidad_vs_corriente',
    etiqueta: 'Corriente de operación frente a la ampacidad',
    unidad: 'A',
    umbral: ampacidad_A,
    comparador: '<=',
    fuente: FUENTES.ieee738,
  };

  const corriente_A = numero(hipotesis.corrienteOperacion_A);
  if (corriente_A == null) {
    return sinDato(base, 'No se declara la corriente de operación (`hipotesis.corrienteOperacion_A`). '
      + 'Es un dato de operación de la línea: no se deduce de la geometría ni del conductor.');
  }
  if (ampacidad_A == null) {
    return sinDato(base, 'No llega la ampacidad calculada (`conductor.ampacidad_A`). Se calcula en el '
      + 'módulo térmico (IEEE 738) con las condiciones ambientales de la hipótesis; este módulo no la recalcula '
      + 'para que ese número tenga un solo dueño.');
  }

  const uso_pct = (corriente_A / ampacidad_A) * 100;
  return fila({
    ...base,
    valor: corriente_A,
    estado: veredicto(corriente_A, ampacidad_A, '<='),
    criterio: `Uso del ${f(uso_pct)} % de la ampacidad (${f(corriente_A, 0)} A de ${f(ampacidad_A, 0)} A). `
      + 'La ampacidad depende de viento, sol y temperatura ambiente: la de placa engaña, y un día en calma '
      + 'le quita al conductor cerca de un tercio de su capacidad. Verificar con qué condiciones se calculó.',
  });
}
