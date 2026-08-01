// ============================================================================
// nucleo/longitudinal.js — la carga sobre el EJE DE LA LÍNEA
// ----------------------------------------------------------------------------
// Cierra la deuda que `cargas.js` declara en su propia cabecera: allí se dice,
// con esas palabras, que NO evalúa la carga longitudinal (terminales, rotura de
// conductor, desequilibrio de tiros entre tramos contiguos). Esto es eso.
//
// LOS TRES NÚMEROS QUE HAY QUE VER, Y POR QUÉ NINGUNO ES OBVIO
//
// 1) En un anclaje el desequilibrio es la DIFERENCIA de los dos tiros, no su
//    suma: (H_adelante − H_atrás)·cos(α/2). Con tiros iguales vale CERO EXACTO.
//    Sumarlos daría un orden de magnitud de más.
//
// 2) **EL SENTIDO SE INVIERTE ENTRE ESTADOS.** Verificado con el motor real
//    sobre una topología como la de esta línea: la misma frontera da +894 kgf a
//    máxima temperatura y −444 kgf a mínima. Publicar |ΔH| —el reflejo natural—
//    borra justo el dato que decide si hace falta retenida a UN lado o a los
//    DOS. Por eso la envolvente es POR SENTIDO y el signo no se pierde nunca.
//
// 3) **El peor desequilibrio NO ocurre en el estado de mayor tiro.** Verificado:
//    el mayor |ΔH| sale a T MÁXIMA mientras el mayor tiro está a T MÍNIMA. Es
//    exactamente lo que hace `cargas.js` (toma `maximo`) y aquí sería un error:
//    a T máxima los tramos cortos se derrumban y los largos aguantan, y esa
//    horquilla es la que carga el apoyo.
//
// LA INCOMODIDAD QUE NO SE ESCONDE
//
// Todo el desequilibrio PERMANENTE nace de suponer que los dos tramos se
// tensaron al MISMO %RTS a la MISMA temperatura, porque `Hipotesis.eds_pct` es
// único por línea. Consecuencia verificada: ΔH en el estado EDS es CERO EXACTO
// en todas las fronteras — un cero del MODELO, no una medición. Y una diferencia
// de tendido de obra del 1 % de RTS produce por sí sola una fuerza del orden de
// varios ΔH calculados. Por eso cada fila lleva `sensibilidadTendido_kgf` AL
// LADO del número y `sentidoResoluble` dice si el sentido aguanta esa
// incertidumbre. No se borra el número: se declara lo que vale.
//
// LO QUE ESTE ARCHIVO **NO** HACE — y se dice, no se deja implícito
// · **No dimensiona apoyos ni retenidas.** La fórmula de la retenida es de una
//   línea y la tentación enorme; sin ángulo de tiro, punto de anclaje, tipo de
//   ancla y terreno, eso no es un cálculo: es una recomendación disfrazada.
// · **No suma el caso PERMANENTE con el ACCIDENTAL.** Son hipótesis de carga
//   distintas con topes distintos. Van en campos separados de la misma fila.
// · **No compone lo longitudinal con lo transversal.** Y menos entre estados
//   distintos: el tiro máximo es a T mín, que no tiene viento.
// · **No resuelve la rotura en un apoyo de SUSPENSIÓN.** Depende de la cadena y
//   de la rigidez de los apoyos vecinos, que este sistema no tiene. Se declara
//   no evaluable en vez de estamparle a todos «el 0,5 típico».
// · **No emite veredicto** mientras nadie declare una capacidad LONGITUDINAL del
//   apoyo. `cargaRotura_kgf` no sirve: es ensayo transversal en punta.
//
// PURO: solo importa otros archivos de nucleo/. Convenio de unidades:
//   H y FL kgf · momento kgf·m · α grados · temperatura °C · w kg/m
//
// Ver docs/40-DOMINIO-LINEAS-AT.md §8 (deuda declarada) y `nucleo/cargas.js`.
// ============================================================================

import { deflexion } from './geodesia.js';

const GRADOS_A_RAD = Math.PI / 180;

// ── Criterios ADOPTADOS en este proyecto (no son cifras de norma) ────────────

/**
 * De dónde sale el desequilibrio permanente, dicho entero. Va en cada fila que
 * publique uno: el revisor tiene que poder discutir la hipótesis sin deducirla
 * del código.
 */
export const HIPOTESIS_DESEQUILIBRIO =
  'ADOPTADA (sin norma citada): los dos tramos se suponen tendidos al MISMO porcentaje de la ' +
  'carga de rotura y a la MISMA temperatura, porque la hipótesis de la línea declara un solo ' +
  '`eds_pct`. El desequilibrio que sale es, por tanto, el que produce la GEOMETRÍA (vanos y vano ' +
  'ideal de regulación distintos a cada lado), no el que dejó el tendido real de obra.';

/**
 * El caso accidental. `kRes = 1` es la cota superior del residuo ESTÁTICO: se
 * supone que tras la rotura el conductor del otro lado conserva toda su tensión.
 */
export const HIPOTESIS_ROTURA =
  'ADOPTADA (sin norma citada): rotura de UN conductor de fase en uno de los dos vanos ' +
  'contiguos, con el apoyo amarrado a los dos lados. La fracción residual `kRes` es la parte de ' +
  'la tensión que el lado sano conserva; por defecto 1,0, que es la COTA SUPERIOR del residuo ' +
  'estático. NO modela el efecto dinámico de la liberación súbita, ni la rotura simultánea de ' +
  'varios conductores: un solo conductor roto es la hipótesis MÍNIMA, no una envolvente.';

/** Por qué el caso accidental no lleva semáforo. */
export const SIN_CRITERIO_ACCIDENTAL =
  'El caso accidental NO emite veredicto: este proyecto no ha adoptado ningún criterio de ' +
  'aceptación para la rotura de conductor, y las normas que lo tratan aplican factores de carga ' +
  'propios que no se pueden inventar aquí. Se publica la fuerza; el criterio lo pone quien firma.';

/** Por qué la carga de rotura del contrato no vale para este eje. */
export const CRITERIO_CAPACIDAD_LONGITUDINAL =
  'La utilización longitudinal exige una capacidad DECLARADA para el eje de la línea, con su ' +
  'tipo y la altura a la que está referida. `cargaRotura_kgf` NO sirve: es la carga de ensayo ' +
  'TRANSVERSAL aplicada en la punta, y su validez en el eje longitudinal depende de la sección ' +
  'del apoyo y de si hay retenida — ninguna de las dos está declarada. Sin ese dato la fila queda ' +
  'no evaluable, que es un hecho sobre el inventario y no un fallo del cálculo.';

/** El cero de un apoyo de suspensión: de dónde sale y qué deja fuera. */
export const CERO_DEL_MODELO =
  'Cero DEL MODELO, no medido: dentro de un tramo de tensión la tensión es común por definición, ' +
  'así que a los dos lados de un apoyo de suspensión el tiro es el mismo y su diferencia es cero ' +
  'exacto. No cubre el tendido real, ni el rozamiento de la grapa, ni la rotura de conductor.';

/**
 * Fracción de la tensión EDS por debajo de la cual el H de un tramo deja de ser
 * fiable para restarlo.
 *
 * VERIFICADO con el motor real: un tramo de vano ideal muy corto cae al 12 % de
 * su propio EDS a máxima temperatura y produce, en su frontera, el MAYOR
 * desequilibrio de toda la línea. Numéricamente es el mismo fallo que un hueco
 * convertido en cero — pero entra por un número CALCULADO, así que pasa la
 * guardia de los `null` sin que nada avise.
 */
export const PISO_VALIDEZ_PCT_EDS = 25;

/**
 * Desajuste de tendido con el que se mide la sensibilidad del resultado, en
 * porcentaje de la carga de rotura. ADOPTADO: es el orden de una diferencia de
 * obra corriente entre dos tramos tendidos el mismo día.
 */
export const DESAJUSTE_TENDIDO_PCT_RTS = 1;

/**
 * Umbral PROPIO de utilización longitudinal, con su propio texto, aunque hoy
 * valga lo mismo que el de `cargas.js`. Son dos decisiones distintas y una de
 * ellas no se ha tomado: aquel 50 se adoptó contra una rotura ensayada en el eje
 * TRANSVERSAL. Solo se aplica a capacidades declaradas de tipo 'rotura'.
 */
export const UMBRAL_UTILIZACION_LONGITUDINAL_PCT = 50;

export const CRITERIO_UTILIZACION_LONGITUDINAL =
  `CRITERIO ADOPTADO (sin norma citada): la carga longitudinal permanente no debe superar el ` +
  `${UMBRAL_UTILIZACION_LONGITUDINAL_PCT} % de la capacidad longitudinal declarada del apoyo, ` +
  `referida a la altura a la que esa capacidad fue declarada. Solo se aplica a capacidades de ` +
  `tipo «rotura»: aplicarlo a una capacidad ya ADMISIBLE la partiría por la mitad dos veces.`;

/**
 * Juego CERRADO de claves de estado, congelado — misma doctrina que
 * `FUNCIONES_ANCLA` de mecanica.js. Las formas de entrada nombran los estados de
 * maneras distintas; se NORMALIZAN a estas cuatro claves ANTES de emparejar.
 */
export const CLAVES_ESTADO = Object.freeze(['eds', 'tMax', 'viento', 'tMin']);

// ── Utilidades mínimas (mismas que cargas.js, a propósito) ──────────────────

const numero = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const positivo = (x) => { const v = numero(x); return v !== null && v > 0 ? v : null; };
const enteroPositivo = (x) => (Number.isInteger(x) && x > 0 ? x : null);
const f = (x, d = 1) => (numero(x) === null ? '—' : x.toFixed(d));

/** Solo las estructuras sostienen el conductor (docs/40 §10). */
const esEstructura = (a) => (a?.tipoPunto ?? 'Estructura') === 'Estructura';
const nombreDe = (a, i) =>
  a?.nombre ?? a?.nombreNormalizado ?? a?.nombreCampo ?? `apoyo #${i + 1}`;

/**
 * Funciones que ANCLAN el conductor: a los dos lados la tensión es
 * independiente, y por eso puede haber desequilibrio. Lista CERRADA, nunca una
 * coincidencia de texto (`30 · L-19`).
 */
const ANCLAN = Object.freeze(['Terminal', 'Retención / anclaje', 'Ángulo']);
const ancla = (fn) => ANCLAN.includes(fn);

// ════════════════════════════════════════════════════════════════════════════
// 1 · LOS DOS FACTORES GEOMÉTRICOS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Proyección sobre el eje de la línea: `cos(α/2)`.
 *
 * Vale 1 en recta (α = 0) y 0 cuando la línea se dobla del todo (α = 180). Es
 * el compañero de `cargas.factorTransversal` = 2·sen(α/2): el mismo ángulo, los
 * dos ejes.
 *
 * ⚠️ α es la DEFLEXIÓN (0° = recta), no el ángulo interior. Confundirlos aquí no
 * exagera el resultado: lo ANULA justo donde la carga longitudinal es máxima —la
 * recta y los terminales—, y una tabla llena de ceros plausibles no dispara
 * ninguna alarma. Se alimenta de `geodesia.deflexion()`, que ya devuelve [0,180].
 *
 * @param {number} deflexion_grados en [0,180]
 * @returns {number|null} null si falta o está fuera de rango
 */
export function factorLongitudinal(deflexion_grados) {
  const a = numero(deflexion_grados);
  if (a === null || a < 0 || a > 180) return null;
  return Math.cos((a * GRADOS_A_RAD) / 2);
}

/**
 * Compañero del anterior para el caso ACCIDENTAL: `sen(α/2)`.
 *
 * NO se usa en el caso permanente: allí la carga transversal tiene un solo
 * dueño, que es `cargas.js`. Existe porque al romperse un conductor queda UNA
 * fuerza que no está alineada con nada, y publicar solo su proyección
 * longitudinal entrega la mitad pequeña: con α ≈ 119° son 0,505·F longitudinal
 * frente a 0,863·F transversal.
 */
export function factorTransversalPostRotura(deflexion_grados) {
  const a = numero(deflexion_grados);
  if (a === null || a < 0 || a > 180) return null;
  return Math.sin((a * GRADOS_A_RAD) / 2);
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · NORMALIZAR LOS ESTADOS DE UN TRAMO
// ════════════════════════════════════════════════════════════════════════════

/**
 * Normaliza un tramo a `{eds|tMax|viento|tMin → {clave, nombre, H, w, t}}`.
 *
 * Acepta DOS formas, y solo dos:
 *   · `tramo.estados` de `estadosDelTramo()`  → `{nombre, H, w, t}`
 *   · `tramo.estados[]` del contrato          → `{nombre, tiro_kgf,
 *      cargaUnitaria_kg_m, temperatura_C}`
 *
 * **RECHAZA la forma aplanada de la vista** (`hEds`/`hTMax`/`hViento`/`hTMin`),
 * que es la que sí acepta `cargas.js`. No es una inconsistencia: aquella solo
 * necesita un tiro por apoyo, y ésta tiene que RESTAR el tiro de dos tramos
 * distintos. Restar sin poder comprobar que los dos vienen de la misma
 * temperatura y la misma carga unitaria produce un desequilibrio que puede ser
 * varias veces el real, con unidades correctas y aspecto impecable.
 *
 * ⚠️ Y por el mismo motivo el emparejamiento NO se hace por NOMBRE: los cuatro
 * nombres son literales fijos de `estadosDelTramo` y salen idénticos con
 * cualquier hipótesis y cualquier conductor, así que comparar nombres no
 * comprueba absolutamente nada.
 *
 * @returns {{estados: Object|null, motivo: string|null}}
 */
export function normalizarEstados(tramo) {
  const e = tramo?.estados;
  if (e === null || e === undefined) {
    return { estados: null, motivo: 'el tramo no trae sus estados calculados (`estados`)' };
  }

  // Forma del contrato: lista de estados con sus tres magnitudes.
  if (Array.isArray(e)) {
    const out = {};
    for (const s of e) {
      const clave = claveDeEstado(s?.clave ?? s?.nombre);
      if (!clave) continue;
      out[clave] = {
        clave,
        nombre: s?.nombre ?? clave,
        H: positivo(s?.tiro_kgf ?? s?.H),
        w: positivo(s?.cargaUnitaria_kg_m ?? s?.w),
        t: numero(s?.temperatura_C ?? s?.t),
      };
    }
    return Object.keys(out).length
      ? { estados: out, motivo: null }
      : { estados: null, motivo: 'los estados del tramo no se pudieron identificar' };
  }

  if (typeof e !== 'object') {
    return { estados: null, motivo: 'los estados del tramo llegan en una forma no reconocida' };
  }

  // Forma rica de `estadosDelTramo()`. Se exige que traiga temperatura Y carga
  // unitaria: sin ellas no se puede comprobar que los dos lados son comparables,
  // y este módulo no resta a ciegas.
  const out = {};
  for (const [k, s] of Object.entries(e)) {
    const clave = claveDeEstado(k);
    if (!clave) continue;
    out[clave] = {
      clave,
      nombre: s?.nombre ?? k,
      H: positivo(s?.H ?? s?.tiro_kgf),
      w: positivo(s?.w ?? s?.cargaUnitaria_kg_m),
      t: numero(s?.t ?? s?.temperatura_C),
    };
  }
  if (!Object.keys(out).length) {
    return {
      estados: null,
      motivo: 'los estados del tramo llegan aplanados (solo tiros, sin temperatura ni carga '
        + 'unitaria): con esa forma no se puede comprobar que los dos lados sean comparables, y '
        + 'restar sin comprobarlo produce un desequilibrio que puede ser varias veces el real',
    };
  }
  return { estados: out, motivo: null };
}

/** Traduce la clave o el nombre de un estado a una de las cuatro canónicas. */
function claveDeEstado(x) {
  if (typeof x !== 'string') return null;
  const s = x.toLowerCase();
  if (CLAVES_ESTADO.includes(x)) return x;
  if (s.includes('eds') || s.includes('cada día') || s.includes('cada dia')) return 'eds';
  if (s.includes('viento')) return 'viento';
  if (s.includes('máxima') || s.includes('maxima') || s === 'tmax') return 'tMax';
  if (s.includes('mínima') || s.includes('minima') || s === 'tmin') return 'tMin';
  return null;
}

/** ¿Los dos estados hablan de la misma hipótesis? Se compara la TERNA, no el nombre. */
function comparables(a, b, tol = 1e-6) {
  if (!a || !b) return false;
  if (a.t === null || b.t === null || a.w === null || b.w === null) return false;
  return Math.abs(a.t - b.t) <= tol && Math.abs(a.w - b.w) <= tol;
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · LOS TRES CASOS DE CARGA
// ════════════════════════════════════════════════════════════════════════════

/**
 * Caso TERMINAL, permanente: `FL = ±H` por conductor.
 *
 * Vive en su PROPIA función y NO se resuelve pasando un 0 a
 * `desequilibrioLongitudinal`: un tramo que no se pudo calcular también valdría
 * 0 y se leería como terminal, devolviendo la carga máxima posible del apoyo
 * como si fuera un hecho.
 *
 * `lado` NO se supone. Sin él devuelve `null` con el motivo escrito: un positivo
 * por defecto invertiría el signo en el último apoyo de la línea —justo el que
 * soporta el mayor número de la tabla— y la retenida se leería del lado
 * equivocado.
 *
 * @param {{tiro_kgf:number, estadoTiro?:string, lado:'atras'|'adelante',
 *          nFasesAmarradas?:number}} entrada
 */
export function terminalLongitudinal(entrada) {
  const faltan = [];
  const H = positivo(entrada?.tiro_kgf);
  if (H === null) faltan.push('tiro_kgf — tiro horizontal del único tramo contiguo');

  const lado = entrada?.lado;
  if (lado !== 'atras' && lado !== 'adelante') {
    faltan.push('lado — de qué lado está el único vano («atras» o «adelante»); no se supone: '
      + 'un positivo por defecto invertiría el signo en el último apoyo de la línea');
  }

  const n = enteroPositivo(entrada?.nFasesAmarradas);
  const flPorConductor_kgf = H !== null && (lado === 'atras' || lado === 'adelante')
    ? (lado === 'adelante' ? H : -H)
    : null;

  return {
    caso: 'terminal',
    flPorConductor_kgf,
    fl_kgf: flPorConductor_kgf !== null && n !== null ? flPorConductor_kgf * n : null,
    flMagnitud_kgf: flPorConductor_kgf === null ? null : Math.abs(flPorConductor_kgf),
    sentido: flPorConductor_kgf === null ? null : (flPorConductor_kgf > 0 ? 'adelante' : 'atras'),
    estadoTiro: entrada?.estadoTiro ?? null,
    componentes: {
      factorLongitudinal: 1,   // un terminal tira a lo largo del único vano
      tiroAtras_kgf: lado === 'atras' ? H : null,
      tiroAdelante_kgf: lado === 'adelante' ? H : null,
      nFasesAmarradas: n,
      hipotesis: 'Terminal: el conductor tira a un solo lado, así que la carga longitudinal es el '
        + 'tiro entero — es el caso más severo del eje y no depende de ninguna diferencia.',
      faltan,
    },
  };
}

/**
 * Caso DESEQUILIBRIO en un anclaje, permanente:
 *
 *     FL = (H_adelante − H_atrás) · cos(α/2)      [kgf por conductor, CON SIGNO]
 *
 * Sale de la descomposición exacta del equilibrio: con los dos tiros sobre sus
 * respectivas direcciones, la resultante proyectada sobre la bisectriz vale
 * `(H₂−H₁)·cos(α/2)` y sobre la perpendicular `(H₁+H₂)·sen(α/2)` — que con
 * H₁ = H₂ se reduce EXACTAMENTE a `2H·sen(α/2)`, el factor de `cargas.js`. Que
 * las dos mitades coincidan ahí es el control de que hablan de lo mismo.
 *
 * ⚠️ NUNCA se pasa un `null` como 0. Un lado ausente deja la fila no evaluable:
 * un hueco convertido en cero produce el desequilibrio MÁXIMO posible (= H del
 * otro lado) y encima se lee igual que un terminal legítimo.
 *
 * @param {{tiroAtras_kgf:number, tiroAdelante_kgf:number, deflexion_grados:number,
 *          estadoTiro?:string, nFasesAmarradas?:number}} entrada
 */
export function desequilibrioLongitudinal(entrada) {
  const faltan = [];

  const h1 = positivo(entrada?.tiroAtras_kgf);
  if (h1 === null) faltan.push('tiroAtras_kgf — tiro del tramo que LLEGA al apoyo');
  const h2 = positivo(entrada?.tiroAdelante_kgf);
  if (h2 === null) faltan.push('tiroAdelante_kgf — tiro del tramo que SALE del apoyo');

  const factor = factorLongitudinal(entrada?.deflexion_grados);
  if (factor === null) faltan.push('deflexion_grados — ángulo de quiebre en [0,180]');

  const n = enteroPositivo(entrada?.nFasesAmarradas);

  const flPorConductor_kgf = h1 !== null && h2 !== null && factor !== null
    ? (h2 - h1) * factor
    : null;

  return {
    caso: 'desequilibrio',
    flPorConductor_kgf,
    fl_kgf: flPorConductor_kgf !== null && n !== null ? flPorConductor_kgf * n : null,
    flMagnitud_kgf: flPorConductor_kgf === null ? null : Math.abs(flPorConductor_kgf),
    // El cero exacto NO es «hacia adelante»: es nulo, y se dice así.
    sentido: flPorConductor_kgf === null ? null
      : flPorConductor_kgf > 0 ? 'adelante'
      : flPorConductor_kgf < 0 ? 'atras' : 'nulo',
    estadoTiro: entrada?.estadoTiro ?? null,
    componentes: {
      factorLongitudinal: factor,
      tiroAtras_kgf: h1,
      tiroAdelante_kgf: h2,
      nFasesAmarradas: n,
      hipotesis: HIPOTESIS_DESEQUILIBRIO,
      faltan,
    },
  };
}

/**
 * Caso ROTURA de un conductor en un ANCLAJE, accidental.
 *
 * Al romperse el conductor de un lado queda una sola fuerza `kRes·H` sobre la
 * dirección del vano sano. Se publican su MAGNITUD y sus DOS componentes,
 * porque publicar solo la longitudinal entrega la mitad pequeña: con α ≈ 119°
 * son 0,505·F longitudinal frente a 0,863·F transversal.
 *
 * NO se compara ni se suma con el caso permanente: son hipótesis distintas.
 *
 * @param {{tiroSano_kgf:number, deflexion_grados:number, ladoRoto:'atras'|'adelante',
 *          kRes?:number, estadoTiro?:string}} entrada
 */
export function roturaEnAnclaje(entrada) {
  const faltan = [];
  const H = positivo(entrada?.tiroSano_kgf);
  if (H === null) faltan.push('tiroSano_kgf — tiro del conductor que NO se rompió');

  const cosMitad = factorLongitudinal(entrada?.deflexion_grados);
  const senMitad = factorTransversalPostRotura(entrada?.deflexion_grados);
  if (cosMitad === null) faltan.push('deflexion_grados — ángulo de quiebre en [0,180]');

  const ladoRoto = entrada?.ladoRoto;
  if (ladoRoto !== 'atras' && ladoRoto !== 'adelante') {
    faltan.push('ladoRoto — en qué vano se supone la rotura');
  }

  // kRes por defecto 1: la COTA SUPERIOR del residuo estático. Se acepta menor
  // si alguien lo declara, pero NUNCA se estima uno «típico».
  const kRes = positivo(entrada?.kRes) ?? 1;
  if (kRes > 1) faltan.push('kRes — la fracción residual no puede pasar de 1 (sería amplificación dinámica, no modelada)');

  const valido = H !== null && cosMitad !== null && kRes <= 1
    && (ladoRoto === 'atras' || ladoRoto === 'adelante');
  const F = valido ? kRes * H : null;

  return {
    caso: 'rotura',
    fuerza_kgf: F,
    // Signo: la fuerza tira hacia el lado que SIGUE amarrado.
    componenteLongitudinal_kgf: F === null ? null
      : (ladoRoto === 'atras' ? 1 : -1) * F * cosMitad,
    componenteTransversal_kgf: F === null || senMitad === null ? null : F * senMitad,
    estadoTiro: entrada?.estadoTiro ?? null,
    componentes: {
      kRes,
      ladoRoto: ladoRoto === 'atras' || ladoRoto === 'adelante' ? ladoRoto : null,
      factorLongitudinal: cosMitad,
      factorTransversal: senMitad,
      hipotesis: HIPOTESIS_ROTURA,
      sinCriterio: SIN_CRITERIO_ACCIDENTAL,
      faltan,
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 4 · UTILIZACIÓN LONGITUDINAL (solo con capacidad DECLARADA)
// ════════════════════════════════════════════════════════════════════════════

/**
 * ¿Cuánta capacidad longitudinal del apoyo consume la carga PERMANENTE?
 *
 * Devuelve `null` en cuanto falte cualquier pieza, y en particular si la
 * capacidad no declara su TIPO: aplicar el 50 % a una capacidad que ya es
 * admisible la parte por la mitad una segunda vez y saca del papel un apoyo que
 * cumple. Solo se evalúa contra capacidades de tipo `'rotura'`.
 *
 * @param {{fl_kgf:number, capacidad:{valor_kgf:number, tipo:string,
 *          alturaReferencia_m?:number}, alturaAplicacion_m?:number}} entrada
 */
export function utilizacionLongitudinal(entrada) {
  const F = entrada?.fl_kgf;
  const cap = entrada?.capacidad;
  const valor = positivo(cap?.valor_kgf);
  if (numero(F) === null || valor === null) return null;
  if (cap?.tipo !== 'rotura') return null;

  const hRef = positivo(cap?.alturaReferencia_m);
  const hApl = positivo(entrada?.alturaAplicacion_m);
  // Con las dos alturas se comparan MOMENTOS; sin ellas no se compara nada, y
  // NO se supone que la carga actúe a la altura de referencia.
  if (hRef === null || hApl === null) return null;
  if (hApl > hRef) return null;

  const utilizacion_pct = ((Math.abs(F) * hApl) / (valor * hRef)) * 100;
  const admisible_kgf = ((UMBRAL_UTILIZACION_LONGITUDINAL_PCT / 100) * valor * hRef) / hApl;

  return {
    utilizacion_pct,
    margen_kgf: admisible_kgf - Math.abs(F),
    estado: utilizacion_pct <= UMBRAL_UTILIZACION_LONGITUDINAL_PCT ? 'cumple' : 'revisar',
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 5 · LA LÍNEA ENTERA, APOYO POR APOYO
// ════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} FilaLongitudinal
 * @property {number}  n              posición ENTRE ESTRUCTURAS, 1..N
 * @property {string}  apoyo
 * @property {string|null} funcionEstructural
 * @property {'terminal'|'desequilibrio'|'suspension'|'no_evaluable'} caso
 * @property {string|null} apoyoAtras     nombre del vecino, para que el signo sea accionable
 * @property {string|null} apoyoAdelante
 * @property {number|null} deflexion_grados
 * @property {number|null} factorLongitudinal
 * @property {Object|null} permanente     envolvente POR SENTIDO del caso permanente
 * @property {Object|null} accidental     rotura, por lado, sin veredicto
 * @property {number|null} sensibilidadTendido_kgf
 * @property {boolean|null} sentidoResoluble   ¿el sentido DOMINANTE supera el ruido de obra?
 * @property {boolean|null} inversionResoluble ¿lo superan LOS DOS sentidos? Solo entonces se
 *   puede afirmar que el apoyo tira de verdad hacia ambos lados.
 * @property {Object|null} utilizacion
 * @property {string[]} notas
 * @property {string|null} noEvaluable
 */

/**
 * Carga longitudinal de TODA la línea, una fila por estructura.
 *
 * El emparejamiento tramo↔apoyo se hace por IDENTIDAD (el nombre que el propio
 * `tramosDeTension` puso en `desde`/`hasta`), NUNCA por conteo posicional.
 * Invertir cuál tramo es «atrás» y cuál «adelante» es el único error que ninguna
 * comprobación de conteo detecta: no altera ninguna magnitud, la tabla se ve
 * idéntica, y voltea todos los signos de la línea.
 *
 * @param apoyos    en orden. Solo estructuras entran (los empalmes se filtran).
 * @param tramos    los de `tramosDeTension`, CON sus `estados` de
 *                  `estadosDelTramo` — la forma aplanada de la vista se rechaza.
 * @param opciones  `{rts_kgf, nFasesAmarradas, kRes}`. Todo opcional: sin ellas
 *                  el módulo publica lo que sí sabe y declara lo que no.
 * @returns {FilaLongitudinal[]}
 */
export function longitudinalDeLaLinea(apoyos, tramos, opciones = {}) {
  const E = (Array.isArray(apoyos) ? apoyos : []).filter(esEstructura);
  if (!E.length) return [];

  const lista = Array.isArray(tramos) ? tramos : [];
  const nombres = E.map((a, i) => nombreDe(a, i));
  const rts = positivo(opciones?.rts_kgf);
  const nFases = enteroPositivo(opciones?.nFasesAmarradas);

  // La sensibilidad al tendido es una propiedad de la LÍNEA, no del apoyo: es lo
  // que pesaría una diferencia de obra del 1 % de RTS entre dos tramos.
  const sensibilidad = rts === null ? null : (DESAJUSTE_TENDIDO_PCT_RTS / 100) * rts;

  // Índice tramo → estados normalizados, con la identidad de sus extremos.
  const porNombre = new Map();
  lista.forEach((t, k) => {
    const de = t?.desde?.nombre ?? t?.desde;
    const a = t?.hasta?.nombre ?? t?.hasta;
    const { estados, motivo } = normalizarEstados(t);
    porNombre.set(k, { n: k + 1, desde: de ?? null, hasta: a ?? null, estados, motivo });
  });
  const tramoQueLlega = (nombre) => [...porNombre.values()].find((t) => t.hasta === nombre) ?? null;
  const tramoQueSale = (nombre) => [...porNombre.values()].find((t) => t.desde === nombre) ?? null;

  return E.map((a, i) => {
    const nombre = nombres[i];
    const notas = [];
    const motivos = [];
    const fn = a?.funcionEstructural ?? null;
    const esExtremoArray = i === 0 || i === E.length - 1;

    const atras = tramoQueLlega(nombre);
    const adelante = tramoQueSale(nombre);

    // ── Deflexión: la declarada manda; si no, la geometría ──────────────────
    let deflexion_grados = numero(a?.deflexion_grados);
    if (deflexion_grados === null && !esExtremoArray) {
      const geo = E.map((x) => ({
        lat: numero(x?.coordenada?.lat ?? x?.lat),
        lon: numero(x?.coordenada?.lon ?? x?.lon),
      }));
      if ([i - 1, i, i + 1].every((k) => geo[k]?.lat !== null && geo[k]?.lon !== null)) {
        deflexion_grados = numero(deflexion(geo, i));
      }
    }

    const base = {
      n: i + 1,
      apoyo: nombre,
      funcionEstructural: fn,
      apoyoAtras: i > 0 ? nombres[i - 1] : null,
      apoyoAdelante: i < E.length - 1 ? nombres[i + 1] : null,
      deflexion_grados,
      factorLongitudinal: factorLongitudinal(deflexion_grados),
      permanente: null,
      accidental: null,
      sensibilidadTendido_kgf: sensibilidad,
      sentidoResoluble: null,
      inversionResoluble: null,
      utilizacion: null,
      notas,
      noEvaluable: null,
    };

    // ── C9 · precedencia 0: sin función declarada no se decide nada ─────────
    if (!fn) {
      return { ...base, caso: 'no_evaluable',
        noEvaluable: 'el apoyo no declara `funcionEstructural`. Sin ella no se sabe si el '
          + 'conductor ANCLA aquí (y puede haber desequilibrio) o solo pasa colgado (y no lo hay). '
          + 'No se deduce del ángulo en este módulo: eso decidiría a la vez dónde hay carga y '
          + 'cuánta.' };
    }

    // ── C6 · suspensión: cero DEL MODELO, con fila propia ──────────────────
    if (!ancla(fn)) {
      return {
        ...base,
        caso: 'suspension',
        permanente: {
          flPorConductor_kgf: 0, fl_kgf: nFases === null ? null : 0,
          flAdelanteMax_kgf: null, flAtrasMax_kgf: null, sentido: 'nulo',
        },
        notas: [CERO_DEL_MODELO],
      };
    }

    // ── C1 · terminal declarado Y extremo del array ─────────────────────────
    if (fn === 'Terminal') {
      if (!esExtremoArray) {
        return { ...base, caso: 'no_evaluable',
          noEvaluable: 'declarado «Terminal» en mitad de la línea. Este módulo solo ve la cadena '
            + 'de apoyos que recibe: si de aquí sale un ramal o una bajante, su tiro no lo ve '
            + 'nadie, y publicar el de un solo lado sería afirmar que el otro no existe.' };
      }
      const unico = atras ?? adelante;
      if (!unico || !unico.estados) {
        return { ...base, caso: 'no_evaluable',
          noEvaluable: unico?.motivo ?? 'no llegó el cálculo del único tramo contiguo' };
      }
      const lado = atras ? 'atras' : 'adelante';
      const env = envolventePorSentido(CLAVES_ESTADO.map((k) => {
        const s = unico.estados[k];
        return s?.H === null || s?.H === undefined ? null
          : terminalLongitudinal({ tiro_kgf: s.H, estadoTiro: s.nombre, lado, nFasesAmarradas: nFases });
      }).filter(Boolean));

      notas.push('Un terminal soporta el tiro ENTERO del conductor sobre el eje de la línea: es el '
        + 'caso más severo del eje y no depende de ninguna diferencia entre tramos.');
      notas.push('NO se verifica contra lo que haya más allá del último apoyo: si la bajante o el '
        + 'puente al pórtico está tenso, esto no es un terminal sino un anclaje con dos tiros, y el '
        + 'sistema no ve ese lado.');
      if (nFases === null) {
        motivos.push('no se declaró cuántas fases amarran en el apoyo (`nFasesAmarradas`): el '
          + 'número por conductor sí sale; el total, no. No se hereda el conteo de la carga '
          + 'transversal, que cuenta 3·circuitos con el cable de guarda declaradamente fuera');
      }
      return { ...base, caso: 'terminal', permanente: env,
        // El sentido de un terminal no lo discute el tendido: hay un solo lado,
        // y el tiro entero está órdenes de magnitud por encima del ruido de obra.
        sentidoResoluble: env.flAdelanteMax_kgf !== null || env.flAtrasMax_kgf !== null,
        inversionResoluble: false,
        noEvaluable: motivos.length ? motivos.join(' · ') : null };
    }

    // ── C2 · anclaje intermedio: desequilibrio ──────────────────────────────
    if (!atras || !adelante) {
      return { ...base, caso: 'no_evaluable',
        noEvaluable: 'anclaje sin los DOS tramos identificados a sus lados. No se toma el que '
          + 'falta como cero: un hueco convertido en cero produce el desequilibrio máximo posible '
          + 'y se lee igual que un terminal legítimo.' };
    }
    if (!atras.estados || !adelante.estados) {
      return { ...base, caso: 'no_evaluable',
        noEvaluable: atras.motivo ?? adelante.motivo ?? 'los tramos contiguos no traen sus estados' };
    }

    const porEstado = [];
    for (const k of CLAVES_ESTADO) {
      const s1 = atras.estados[k];
      const s2 = adelante.estados[k];
      if (!s1 || !s2 || s1.H === null || s2.H === null) continue;
      if (!comparables(s1, s2)) {
        notas.push(`El estado «${s1.nombre}» no se resta: los dos lados no traen la misma `
          + 'temperatura y la misma carga unitaria, así que no son comparables. Restarlos daría un '
          + 'desequilibrio que puede ser varias veces el real, con unidades correctas.');
        continue;
      }
      porEstado.push(desequilibrioLongitudinal({
        tiroAtras_kgf: s1.H, tiroAdelante_kgf: s2.H,
        deflexion_grados, estadoTiro: s1.nombre, nFasesAmarradas: nFases,
      }));

      // Piso de validez: un lado cuya tensión MODELADA se derrumbó no sirve para
      // restar, aunque el número salga limpio.
      const eds1 = atras.estados.eds?.H;
      const eds2 = adelante.estados.eds?.H;
      for (const [s, eds, cual] of [[s1, eds1, 'el que llega'], [s2, eds2, 'el que sale']]) {
        if (!positivo(eds)) continue;
        const pct = (s.H / eds) * 100;
        if (pct < PISO_VALIDEZ_PCT_EDS) {
          notas.push(`En «${s.nombre}» el tramo ${cual} baja a ${f(pct)} % de su propio EDS. Por `
            + `debajo del ${PISO_VALIDEZ_PCT_EDS} % adoptado, el modelo de cambio de estado y el `
            + 'supuesto de tensión común dejan de ser fiables: el desequilibrio de ese estado lo '
            + 'domina un tramo prácticamente flojo EN EL MODELO, no en el terreno.');
        }
      }
    }

    if (!porEstado.length) {
      return { ...base, caso: 'no_evaluable',
        noEvaluable: 'ningún estado se pudo comparar entre los dos tramos contiguos' };
    }

    const env = envolventePorSentido(porEstado);
    const cero = porEstado.find((r) => r.flPorConductor_kgf === 0);
    if (cero) {
      notas.push(`El desequilibrio en «${cero.estadoTiro}» vale CERO EXACTO. No es una medición: `
        + 'es el cero del modelo, que tensa todos los tramos al mismo porcentaje de rotura a la '
        + 'misma temperatura.');
    }

    // ¿El sentido aguanta la incertidumbre del tendido real?
    //
    // ⚠️ Se mide POR SENTIDO, no sobre el mayor de los dos. Cazado verificando la
    // línea real en producción: un anclaje daba +173 kgf hacia adelante y −27
    // hacia atrás con un ruido de tendido de 85 kgf. Mirando solo el mayor, la
    // pantalla afirmaba «tira hacia los dos lados» — y ese segundo sentido es
    // indistinguible de una diferencia de tendido de obra. La afirmación que
    // decide si hace falta retención a los DOS lados exige que los DOS sentidos
    // superen el ruido, no solo el dominante.
    const magAdelante = env.flAdelanteMax_kgf === null ? null : Math.abs(env.flAdelanteMax_kgf);
    const magAtras = env.flAtrasMax_kgf === null ? null : Math.abs(env.flAtrasMax_kgf);
    const mayor = Math.max(magAdelante ?? 0, magAtras ?? 0);

    const sentidoResoluble = sensibilidad === null ? null : mayor > sensibilidad;
    // Solo se afirma la inversión si los DOS sentidos existen Y los dos pesan.
    const inversionResoluble = magAdelante === null || magAtras === null ? false
      : sensibilidad === null ? null
      : magAdelante > sensibilidad && magAtras > sensibilidad;

    if (sentidoResoluble === false) {
      notas.push(`El mayor desequilibrio calculado (${f(mayor)} kgf) queda por DEBAJO de lo que `
        + `pesaría una diferencia de tendido de obra del ${DESAJUSTE_TENDIDO_PCT_RTS} % de la `
        + `carga de rotura (${f(sensibilidad)} kgf). El número sale, pero el SENTIDO no es `
        + 'concluyente: en el terreno podría apuntar al otro lado.');
    }
    if (inversionResoluble === true) {
      notas.push('El sentido SE INVIERTE entre estados, y los DOS sentidos pesan más que el ruido '
        + 'del tendido: este apoyo tira de verdad hacia los dos lados según la temperatura. '
        + 'Publicar solo la magnitud lo habría escondido, y es lo que decide si hace falta '
        + 'retención a un lado o a los dos.');
    } else if (magAdelante !== null && magAtras !== null && inversionResoluble === false) {
      const menor = Math.min(magAdelante, magAtras);
      notas.push(`El cálculo da los dos sentidos, pero el menor (${f(menor)} kgf) NO supera lo que `
        + `pesaría una diferencia de tendido de obra (${f(sensibilidad)} kgf): ese segundo sentido `
        + 'es indistinguible del ruido de obra y NO se afirma. Manda el sentido dominante.');
    }

    // ── C4 · rotura, en el mismo apoyo, en estructura APARTE ────────────────
    const estadoPico = CLAVES_ESTADO
      .map((k) => atras.estados[k])
      .filter((s) => s && s.H !== null)
      .reduce((m, s) => (m === null || s.H > m.H ? s : m), null);
    const accidental = estadoPico ? {
      atras: roturaEnAnclaje({ tiroSano_kgf: adelante.estados[estadoPico.clave]?.H,
        deflexion_grados, ladoRoto: 'atras', kRes: opciones?.kRes, estadoTiro: estadoPico.nombre }),
      adelante: roturaEnAnclaje({ tiroSano_kgf: estadoPico.H,
        deflexion_grados, ladoRoto: 'adelante', kRes: opciones?.kRes, estadoTiro: estadoPico.nombre }),
    } : null;

    if (nFases === null) {
      motivos.push('no se declaró cuántas fases amarran en el apoyo (`nFasesAmarradas`): el número '
        + 'por conductor sí sale; el total, no');
    }

    return {
      ...base,
      caso: 'desequilibrio',
      permanente: env,
      accidental,
      sentidoResoluble,
      inversionResoluble,
      notas,
      noEvaluable: motivos.length ? motivos.join(' · ') : null,
    };
  });
}

/**
 * Envolvente POR SENTIDO, nunca por magnitud.
 *
 * `flAdelanteMax_kgf` es null si NINGÚN estado empuja hacia adelante — y no 0.
 * Un 0 con el nombre de un estado adosado sería un dato fabricado justo en una
 * tabla donde el resto de los ceros son ceros DECLARADOS del modelo. La pregunta
 * que este número existe para contestar —¿retenida a un lado o a los dos?—
 * necesita distinguir «nunca tira hacia atrás» de «tira 0 kgf hacia atrás».
 */
function envolventePorSentido(resultados) {
  const R = resultados.filter((r) => r && r.flPorConductor_kgf !== null);
  const adelante = R.filter((r) => r.flPorConductor_kgf > 0);
  const atras = R.filter((r) => r.flPorConductor_kgf < 0);

  const mayor = (xs) => (xs.length
    ? xs.reduce((m, r) => (Math.abs(r.flPorConductor_kgf) > Math.abs(m.flPorConductor_kgf) ? r : m))
    : null);
  const a = mayor(adelante);
  const b = mayor(atras);

  return {
    flAdelanteMax_kgf: a ? a.flPorConductor_kgf : null,
    estadoAdelante: a ? a.estadoTiro : null,
    flAtrasMax_kgf: b ? b.flPorConductor_kgf : null,
    estadoAtras: b ? b.estadoTiro : null,
    flTotalAdelante_kgf: a ? a.fl_kgf : null,
    flTotalAtras_kgf: b ? b.fl_kgf : null,
    porEstado: R.map((r) => ({
      estadoTiro: r.estadoTiro,
      flPorConductor_kgf: r.flPorConductor_kgf,
      sentido: r.sentido,
    })),
  };
}
