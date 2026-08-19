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

import { resolverDeflexion } from './geodesia.js';

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

/**
 * Encabeza TODOS los motivos de este eje. Una sola forma de decirlo: el revisor
 * tiene que poder encontrar los huecos de un vistazo, en la pantalla y en el
 * papel, sin que cada rama los llame de una manera.
 */
const PREFIJO_SIN_VEREDICTO = 'Sin veredicto en el eje longitudinal: ';

/**
 * El hueco que hoy tiene el 100 % de los apoyos: nadie declaró la capacidad.
 *
 * Vive aquí, con un solo dueño, para que la pantalla, el informe firmable y el
 * CSV digan LA MISMA frase del mismo apoyo. Tres copias de una frase que
 * envejece son tres páginas que acaban contradiciéndose (ADR-014).
 */
const HUECO_CAPACIDAD_AUSENTE =
  'nadie ha declarado la capacidad del apoyo para este eje (`capacidadLongitudinal`). No se ' +
  'deduce de la carga de rotura del inventario, que es ensayo TRANSVERSAL en punta y cuya ' +
  'validez a lo largo de la línea depende de la sección del apoyo y de si hay retenida — ' +
  'ninguna de las dos está declarada. Es un hueco del INVENTARIO, no un fallo del cálculo: el ' +
  'día que la ficha del apoyo traiga la capacidad y cuántas fases amarran, el veredicto sale ' +
  'solo. Los dos campos existen en el contrato y el motor los lee del apoyo.';

export const SIN_CAPACIDAD_LONGITUDINAL = PREFIJO_SIN_VEREDICTO + HUECO_CAPACIDAD_AUSENTE;

/**
 * El OTRO hueco que hoy tienen todos los apoyos, y que llega antes que el de la
 * capacidad: sin saber cuántas fases amarran no hay carga TOTAL que comparar.
 *
 * Es una deuda de contrato distinta y declarada (`nFasesAmarradas` no existe por
 * apoyo), no parte del veredicto: se nombra aparte para que no se confunda con
 * la capacidad ni se «arregle» heredando el conteo del eje transversal.
 */
const HUECO_CONTEO_FASES =
  'hay carga longitudinal por conductor, pero no el TOTAL sobre el apoyo — nadie declaró ' +
  'cuántas fases amarran aquí (`nFasesAmarradas`). La capacidad del apoyo se consume con la ' +
  'suma de todos los conductores, no con uno solo: comparar el valor por conductor dividiría la ' +
  'carga entre 3 o 4 y sacaría un «cumple» falso. El conteo NO se hereda de la carga ' +
  'transversal, que cuenta 3 por circuito con el cable de guarda declaradamente fuera — y en ' +
  'este eje el guarda va más alto y manda el momento.';

/**
 * Por qué un apoyo de suspensión no recibe «cumple al 0 %», que sería el
 * veredicto más peligroso que este sistema podría emitir: certificaría, con un
 * número impecable, los apoyos sobre los que este módulo declara no saber nada.
 */
export const SIN_VEREDICTO_SUSPENSION =
  'Sin veredicto en el eje longitudinal: en un apoyo de suspensión la carga longitudinal ' +
  'permanente es CERO DEL MODELO, no medido — dentro de un tramo de tensión la tensión es común ' +
  'a los dos lados. Ese cero no cubre el tendido real, ni el rozamiento de la grapa, ni la ' +
  'rotura de conductor, que es justamente lo que carga longitudinalmente a un apoyo de ' +
  'suspensión y que este sistema no resuelve. Un «cumple» al 0 % certificaría un apoyo sobre el ' +
  'que este módulo declara no saber nada.';

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
 * Umbral PROPIO de utilización longitudinal para capacidades de tipo 'rotura',
 * con su propio texto, aunque hoy valga lo mismo que el de `cargas.js`. Son dos
 * decisiones distintas: aquel 50 se adoptó contra una rotura ensayada en el eje
 * TRANSVERSAL, y reutilizar su nombre haría pasar por herencia lo que es una
 * decisión nueva de este eje.
 *
 * El 50 % NO es un porcentaje genérico: es el coeficiente de seguridad 2 sobre
 * una carga de FALLA. Por eso solo se aplica cuando la capacidad declara ser de
 * rotura (ver `UMBRAL_UTILIZACION_LONGITUDINAL_DECLARADA_PCT`).
 */
export const UMBRAL_UTILIZACION_LONGITUDINAL_PCT = 50;

/**
 * Umbral de las capacidades que YA son de trabajo: 'admisible' y 'diseno'.
 *
 * El 100 % no es laxitud: es la lectura correcta del número que entregaron. Esos
 * valores ya llevan su factor de seguridad DENTRO —el de la ficha del fabricante
 * o el de la norma con la que se dimensionó el proyecto—, y partirlos otra vez
 * por la mitad aplicaría dos veces el mismo margen y sacaría «revisar» sobre
 * apoyos sanos.
 *
 * Dos umbrales, dos constantes, dos textos. Cuál se aplicó viaja en cada
 * resultado (`umbralAplicado_pct`): no se deduce ni se supone.
 */
export const UMBRAL_UTILIZACION_LONGITUDINAL_DECLARADA_PCT = 100;

export const CRITERIO_UTILIZACION_LONGITUDINAL =
  `CRITERIO ADOPTADO (sin norma citada): la carga longitudinal PERMANENTE se compara, por ` +
  `MOMENTO en el empotramiento, contra la capacidad longitudinal declarada del apoyo y referida ` +
  `a la altura a la que esa capacidad fue declarada. El porcentaje que no debe superarse depende ` +
  `de QUÉ ES el número declarado: ${UMBRAL_UTILIZACION_LONGITUDINAL_PCT} % si la capacidad es de ` +
  `tipo «rotura» —es carga de FALLA, y ese porcentaje es el coeficiente de seguridad 2 sobre ` +
  `ella—, y ${UMBRAL_UTILIZACION_LONGITUDINAL_DECLARADA_PCT} % si es «admisible» o «diseno», ` +
  `porque esos valores ya llevan su factor de seguridad DENTRO y volver a castigarlos aplicaría ` +
  `dos veces el mismo margen. Sin tipo declarado NO hay veredicto: elegir mal entre los dos ` +
  `umbrales es un factor 2 sobre el resultado de un apoyo. El caso ACCIDENTAL (rotura de ` +
  `conductor) nunca entra en esta comparación.`;

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
 * coincidencia de texto (`33 · L-19`).
 *
 * ⚠️ TIENE QUE COINCIDIR CON `FUNCIONES_ANCLA` de `mecanica.js` (y con la del
 * contrato). Nació sin 'Derivación' y el fallo era grave y silencioso: un apoyo
 * de derivación caía en la rama de suspensión, publicaba CERO carga longitudinal
 * —cuando en realidad recibía cientos de kgf— y encima adjuntaba la nota «dentro
 * de un tramo la tensión es común», que es FALSA ahí: `mecanica.js` corta el
 * tramo en una derivación. Ese cero llegaba al CSV y al informe firmable.
 *
 * La lista no se puede importar de `mecanica.js` sin acoplar dos módulos que hoy
 * son independientes, así que la coincidencia **la vigila una prueba** que lee
 * el otro archivo y compara (mismo patrón que ya protege la de `mecanica.js`).
 * Eso es lo que faltaba: la lista estaba mal desde el primer commit y las 555
 * pruebas pasaban en verde.
 */
const ANCLAN = Object.freeze(['Terminal', 'Retención / anclaje', 'Ángulo', 'Derivación']);
const ancla = (fn) => ANCLAN.includes(fn);

/**
 * Qué puede SER una capacidad longitudinal declarada. Lista CERRADA, nunca una
 * coincidencia de texto (`33 · L-19`).
 *
 * De esto —y solo de esto— depende contra qué porcentaje se compara, así que
 * confundir 'rotura' con 'admisible' es un factor 2 sobre el veredicto de un
 * apoyo. Un tipo que no esté en la lista ('ultima', 'nominal', 'ROTURA' en
 * mayúsculas, un typo) NO se aproxima al más parecido: deja la fila sin
 * veredicto y con el motivo escrito.
 *
 * Sin eñe a propósito en 'diseno': es una CLAVE, y una clave no lleva acentos ni
 * caracteres que cada exportador escriba de una manera.
 *
 * ⚠️ ESTA LISTA ESTÁ DUPLICADA en `contratos/src/activos.ts`
 * (`TipoCapacidadLongitudinal`), porque el núcleo no importa nada — ni siquiera
 * el contrato. Nace CON su guardián: una prueba lee el otro archivo como TEXTO y
 * compara, igual que la que ya protege a `ANCLAN`. La única lista duplicada del
 * sistema que nació SIN guardián fue precisamente `ANCLAN`, divergió, y publicó
 * un cero falso en un informe firmable durante semanas con la suite en verde
 * (ADR-013).
 */
const TIPOS_CAPACIDAD_LONGITUDINAL = Object.freeze(['rotura', 'admisible', 'diseno']);

/** Qué umbral gobierna cada tipo. Un tipo sin umbral no existe: devuelve null. */
const UMBRAL_POR_TIPO_CAPACIDAD = Object.freeze({
  rotura: UMBRAL_UTILIZACION_LONGITUDINAL_PCT,
  admisible: UMBRAL_UTILIZACION_LONGITUDINAL_DECLARADA_PCT,
  diseno: UMBRAL_UTILIZACION_LONGITUDINAL_DECLARADA_PCT,
});

/**
 * Umbral aplicable a una capacidad, o `null` si el tipo falta o no es uno de los
 * tres. El `null` es una negativa deliberada, no un descuido: sin saber qué es
 * el número declarado no hay contra qué compararlo.
 */
const umbralDeCapacidad = (tipo) =>
  (typeof tipo === 'string' && TIPOS_CAPACIDAD_LONGITUDINAL.includes(tipo)
    ? UMBRAL_POR_TIPO_CAPACIDAD[tipo] ?? null
    : null);

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
 *     utilizacion_pct = (|FL_total| · h_aplicación) / (capacidad · h_referencia) · 100
 *
 * Se comparan MOMENTOS, no fuerzas: lo que rompe un apoyo no es la fuerza sino
 * el momento en el empotramiento, así que comparar kgf contra kgf solo valdría
 * si las dos actuaran a la misma altura — y no se supone que lo hagan.
 *
 * **EL UMBRAL LO GOBIERNA EL TIPO DE LA CAPACIDAD, y por eso sin tipo no hay
 * veredicto:** el 50 % no es un porcentaje genérico, es el coeficiente de
 * seguridad 2 sobre una carga de FALLA. Aplicarlo a una capacidad que ya es
 * admisible o de diseño la parte por la mitad una segunda vez y saca del papel
 * un apoyo que cumple; no aplicarlo a una de rotura firma un apoyo al borde de
 * la falla. Entre los dos umbrales hay un factor 2 sobre el veredicto.
 *
 * `fl_kgf` es el TOTAL sobre el apoyo (todos los conductores), nunca el valor
 * por conductor: la capacidad se consume con la suma, y comparar el valor por
 * conductor dividiría la carga entre 3 o 4 y sacaría un «cumple» falso.
 *
 * Devuelve `null` —sin excepción y sin aproximar— en cuanto falte o se
 * contradiga cualquier pieza. El motivo publicable de cada `null` lo redacta
 * `avisoDeUtilizacionLongitudinal`, que acompaña a la fila: un null mudo no es
 * un resultado, es un hueco sin dueño.
 *
 * ⚠️ NO lee `cargaRotura_kgf` en ningún punto: es ensayo TRANSVERSAL en punta.
 * ⚠️ NO acepta una capacidad de LÍNEA: va por apoyo, o no va.
 *
 * @param {{fl_kgf:number,
 *          capacidad:{valor_kgf:number, tipo:string, alturaReferencia_m?:number, fuente?:string},
 *          alturaAplicacion_m?:number, alturaLibre_m?:number,
 *          nFasesAmarradas?:number, conteoFasesDeLinea?:boolean}} entrada
 * @returns {{utilizacion_pct:number, margen_kgf:number, estado:'cumple'|'revisar',
 *           umbralAplicado_pct:number, criterio:string}|null}
 */
export function utilizacionLongitudinal(entrada) {
  const F = numero(entrada?.fl_kgf);
  const cap = entrada?.capacidad;
  // Un cero o un negativo NO es «sin capacidad»: es un error de captura, y se
  // trata como hueco para que nadie lea un apoyo sin ninguna resistencia.
  const valor = positivo(cap?.valor_kgf);
  const umbral = umbralDeCapacidad(cap?.tipo);
  if (F === null || valor === null || umbral === null) return null;

  const hRef = positivo(cap?.alturaReferencia_m);
  const hApl = positivo(entrada?.alturaAplicacion_m);
  // Con las dos alturas se comparan MOMENTOS; sin ellas no se compara nada, y
  // NO se supone que la carga actúe a la altura de referencia.
  if (hRef === null || hApl === null) return null;

  // La punta del apoyo, cuando está declarada, es la que caza las dos
  // contradicciones que ninguna otra guardia ve. Es opcional a propósito: sin
  // ella no se inventa una punta, solo se dejan de hacer estos dos chequeos.
  const hLibre = positivo(entrada?.alturaLibre_m);
  if (hLibre !== null && hApl > hLibre) return null;  // amarre por encima de la punta
  if (hLibre !== null && hRef > hLibre) return null;  // capacidad referida por encima de la punta
  // Dar el número exigiría extrapolar la capacidad HACIA ARRIBA, que es
  // exactamente el reescalado que esta comprobación se niega a hacer.
  if (hApl > hRef) return null;

  const utilizacion_pct = ((Math.abs(F) * hApl) / (valor * hRef)) * 100;
  // Carga total que todavía admite el umbral APLICADO, referida a la altura
  // donde la carga actúa. Se calcula con el mismo umbral que decide el estado:
  // con dos umbrales distintos, la misma fila publicaría «cumple» y un margen
  // negativo, y esa contradicción se discute en vez de discutirse el cálculo.
  const admisible_kgf = ((umbral / 100) * valor * hRef) / hApl;

  return {
    utilizacion_pct,
    margen_kgf: admisible_kgf - Math.abs(F),
    estado: utilizacion_pct <= umbral ? 'cumple' : 'revisar',
    umbralAplicado_pct: umbral,
    criterio: criterioDeEsteVeredicto({
      cap, umbral, hRef, hApl, hLibre,
      nFases: enteroPositivo(entrada?.nFasesAmarradas),
      conteoDeLinea: entrada?.conteoFasesDeLinea === true,
    }),
  };
}

/**
 * El texto que declara contra QUÉ se comparó esta fila en concreto.
 *
 * No es decoración: va al informe firmable. Quien revisa tiene que poder
 * discutir el número —qué capacidad, de qué tipo, a qué altura, de dónde salió y
 * contra qué porcentaje— sin abrir el código. Y tiene que ver los supuestos que
 * el porcentaje arrastra, porque un porcentaje que no los declara aparenta más
 * precisión de la que tiene.
 */
function criterioDeEsteVeredicto(d) {
  const porQueElUmbral = d.umbral === UMBRAL_UTILIZACION_LONGITUDINAL_PCT
    ? 'es carga de FALLA, y ese porcentaje es el coeficiente de seguridad 2 adoptado sobre ella'
    : 'ese valor ya lleva su factor de seguridad DENTRO, así que se compara contra el 100 %: no '
      + 'es laxitud, es la lectura correcta del número declarado — volver a castigarlo aplicaría '
      + 'dos veces el mismo margen';

  const partes = [
    'CRITERIO ADOPTADO (sin norma citada): se comparó la carga longitudinal PERMANENTE del apoyo '
    + '(la peor de la envolvente, por MOMENTO en el empotramiento) contra su capacidad '
    + `longitudinal DECLARADA: ${f(d.cap?.valor_kgf, 0)} kgf de tipo «${d.cap?.tipo}», referida a `
    + `${f(d.hRef, 2)} m sobre el terreno`
    + (typeof d.cap?.fuente === 'string' && d.cap.fuente.trim()
      ? `, según «${d.cap.fuente.trim()}»`
      : '. La capacidad NO declara su fuente: el número se publica, pero quien revise no puede '
        + 'rastrear de dónde salió')
    + '.',
    `Umbral aplicado: ${d.umbral} % — ${porQueElUmbral}.`,
    `La carga se supone actuando a ${f(d.hApl, 2)} m (\`alturaAplicacion_m\`)`
    + (d.hLibre === null
      ? ', y la punta del apoyo no está declarada, así que no se pudo comprobar que ninguna de '
        + 'las dos alturas quede por debajo de ella.'
      : `, con la punta del apoyo a ${f(d.hLibre, 2)} m.`),
    'NO interviene `cargaRotura_kgf`: es ensayo TRANSVERSAL en punta y su validez en este eje '
    + 'depende de la sección del apoyo y de si hay retenida, que el sistema no conoce.',
    d.nFases === 1
      ? 'El total lo forma UN solo conductor, así que el momento no arrastra ningún supuesto '
        + 'sobre alturas de amarre distintas.'
      : 'SUPUESTO HEREDADO: el momento supone que los conductores amarran TODOS A LA MISMA '
        + 'ALTURA, porque el sistema no tiene la altura por conductor. Con dos niveles de cruceta '
        + 'y el cable de guarda más arriba, la suma de momentos reales no es la del total a una '
        + 'sola altura.',
  ];

  if (d.nFases !== null) {
    partes.push(`El total se formó con ${d.nFases} conductor(es) amarrado(s)`
      + (d.conteoDeLinea
        ? ', y ese conteo se tomó de la LÍNEA, no del apoyo: si algún apoyo amarra un número '
          + 'distinto, su total está mal en la misma proporción.'
        : '.'));
  }

  partes.push('El caso ACCIDENTAL (rotura de conductor) NO entra en esta comparación: es otra '
    + 'hipótesis de carga y este proyecto no ha adoptado criterio de aceptación para ella.');

  return partes.join(' ');
}

/**
 * POR QUÉ esta fila no tiene veredicto en el eje longitudinal.
 *
 * Mismo papel que `avisoDeCapacidad` en `cargas.js`: cada hueco de este eje es
 * una decisión de ingeniería, y su motivo se publica. No basta con un `null`
 * mudo — el Ingeniero necesita saber CUÁL de los huecos tiene, porque cada uno
 * se corrige en un sitio distinto: «nadie declaró la capacidad» se arregla en el
 * inventario, «falta el tipo» en la ficha, y «la carga actúa por encima de la
 * punta» es un dato contradictorio del levantamiento.
 *
 * El orden de los chequeos es EL MISMO que el de `utilizacionLongitudinal`: si
 * divergen, la fila publicaría un motivo que no es el que dejó el número en
 * null.
 *
 * @returns {string|null} el motivo publicable, o null si no hacía falta ninguno
 */
function avisoDeUtilizacionLongitudinal(fila, a) {
  // 1) No hay carga que comparar. El motivo NO se reescribe con otras palabras:
  //    su dueño es el guardián que dejó la fila sin número. Dos frases distintas
  //    para el mismo hecho es como dos páginas del mismo informe se contradicen.
  if (fila.caso === 'no_evaluable') {
    return `${PREFIJO_SIN_VEREDICTO}primero falta la carga longitudinal (ver el motivo de esta `
      + 'fila).';
  }
  if (fila.caso === 'suspension') return SIN_VEREDICTO_SUSPENSION;

  // 1b) DERIVACIÓN: la cifra que sale es el desequilibrio entre los dos tramos
  //     de la línea principal, pero lo que de verdad carga este apoyo a lo largo
  //     de la línea es el TIRO DEL RAMAL que sale de él — y ese tercer tiro el
  //     sistema no lo ve. Se publica la parte que sí se calcula y se niega el
  //     dictamen, con el motivo escrito: un «cumple» aquí afirmaría que el apoyo
  //     aguanta una carga que nadie ha mirado entera (§ADR-017).
  if (a?.funcionEstructural === 'Derivación') {
    return `${PREFIJO_SIN_VEREDICTO}es un apoyo de DERIVACIÓN y el sistema no ve el tiro del `
      + 'ramal que sale de él, que es justamente lo que más lo carga en este eje. La cifra '
      + 'publicada es solo el desequilibrio entre los dos tramos de la línea principal: '
      + 'dictaminar sobre ella sería afirmar que el apoyo aguanta una carga que no se ha mirado '
      + 'entera. Se cierra el día que el modelo capture el ramal como un tramo más.';
  }

  const capacidad = huecoDeCapacidadLongitudinal(a);

  // 2) Hay número POR CONDUCTOR, pero no el total sobre el apoyo. Es el hueco
  //    que llega primero, y hoy lo tienen TODOS los apoyos.
  //
  //    ⚠️ Se nombra también el hueco de capacidad si además falta. Publicar solo
  //    el primero escondería el hallazgo de fondo —que NADIE ha declarado una
  //    capacidad longitudinal— detrás de una deuda de contrato distinta, y
  //    mandaría a corregir el inventario dos veces: se declara el conteo, se
  //    vuelve a mirar, y el veredicto sigue sin salir por otra razón.
  if (peorTotalPermanente(fila.permanente) === null) {
    return PREFIJO_SIN_VEREDICTO + HUECO_CONTEO_FASES
      + (capacidad
        ? ` Y NO ES EL ÚNICO HUECO: aunque se declarara el conteo, este apoyo seguiría sin `
          + `veredicto porque ${capacidad}`
        : '');
  }

  return capacidad === null ? null : PREFIJO_SIN_VEREDICTO + capacidad;
}

/**
 * DE LOS DATOS QUE ENTRARON EN EL VEREDICTO DE ESTE EJE, CUÁLES NADIE VERIFICÓ.
 *
 * Gemela de `supuestosDelVeredicto` en `cargas.js` y con la misma doctrina, pero
 * con OTRA lista de campos, porque este eje come otros datos: aquí no entra
 * `cargaRotura_kgf` —es ensayo transversal en punta— y sí entran la capacidad
 * longitudinal y cuántas fases amarran. Marcar en un eje un campo que solo comió
 * el otro sería una alarma falsa, y una alarma que salta cuando no debe se acaba
 * ignorando.
 *
 * `alturaLibre_m` ENTRA aunque solo sirva de guardia: es la que caza el amarre
 * por encima de la punta, así que una punta estimada a ojo puede dejar pasar un
 * veredicto que la punta real habría anulado.
 *
 * `nFasesAmarradas` entra SOLO si el número salió del apoyo. Cuando se heredó de
 * la línea, el sello del apoyo no gobierna ese número y el criterio ya declara de
 * dónde vino (`conteoFasesDeLinea`).
 *
 * @param {Object} a               el apoyo, con sus sellos en `procedencias`
 * @param {boolean} conteoDelApoyo si el conteo de fases salió de este apoyo
 * @returns {{campo:string, etiqueta:string, fuente:string|null}[]}
 */
function supuestosDelVeredictoLongitudinal(a, conteoDelApoyo) {
  const sellos = a?.procedencias ?? {};
  const entraron = [
    { campo: 'capacidadLongitudinal', etiqueta: 'capacidad longitudinal declarada',
      presente: a?.capacidadLongitudinal !== null && a?.capacidadLongitudinal !== undefined },
    { campo: 'alturaAplicacion_m', etiqueta: 'altura del punto de sujeción',
      presente: positivo(a?.alturaAplicacion_m) !== null },
    { campo: 'alturaLibre_m', etiqueta: 'altura libre sobre el terreno',
      presente: positivo(a?.alturaLibre_m) !== null },
    { campo: 'nFasesAmarradas', etiqueta: 'cuántas fases amarran aquí',
      presente: conteoDelApoyo === true },
  ];
  return entraron
    .filter((c) => c.presente)
    .filter((c) => sellos?.[c.campo]?.procedencia === 'supuesto')
    .map((c) => ({
      campo: c.campo,
      etiqueta: c.etiqueta,
      fuente: typeof sellos[c.campo]?.fuente === 'string' ? sellos[c.campo].fuente : null,
    }));
}

/**
 * Qué le falta —o qué se contradice— a la capacidad declarada de ESTE apoyo, en
 * las palabras del núcleo y sin el encabezado, para que se pueda encadenar.
 *
 * Cada hueco se nombra distinto a propósito: se corrigen en sitios distintos y
 * por personas distintas. «Nadie la declaró» es el inventario; «le falta el
 * tipo» es la ficha del fabricante; «el amarre queda por encima de la punta» es
 * un dato contradictorio del levantamiento.
 *
 * El orden es EL MISMO que el de `utilizacionLongitudinal`: si divergen, la fila
 * publicaría un motivo que no es el que dejó el número en null.
 *
 * @returns {string|null} el motivo, o null si a la capacidad no le falta nada
 */
function huecoDeCapacidadLongitudinal(a) {
  const cap = a?.capacidadLongitudinal;
  if (cap === null || cap === undefined) return HUECO_CAPACIDAD_AUSENTE;

  if (positivo(cap.valor_kgf) === null) {
    return 'la capacidad longitudinal está declarada en cero, en negativo o sin un número — y eso '
      + 'no es un dato, es un error de captura. Un cero se leería como un apoyo sin ninguna '
      + 'resistencia y sacaría «revisar» sobre cualquier carga, por pequeña que fuera. Hay que '
      + 'corregirlo en el inventario.';
  }
  if (cap.tipo === null || cap.tipo === undefined || cap.tipo === '') {
    return 'la capacidad no dice QUÉ es — si es carga de rotura, admisible o de diseño. El '
      + `${UMBRAL_UTILIZACION_LONGITUDINAL_PCT} % no es un porcentaje genérico: es un coeficiente `
      + 'de seguridad 2 sobre la ROTURA. Aplicarlo a una capacidad que ya es admisible la parte '
      + 'por la mitad una segunda vez y saca del papel un apoyo que cumple. Sin el tipo no hay '
      + 'contra qué comparar.';
  }
  if (umbralDeCapacidad(cap.tipo) === null) {
    return `el tipo de capacidad declarado («${cap.tipo}») no es ninguno de los tres que el `
      + `sistema sabe interpretar (${TIPOS_CAPACIDAD_LONGITUDINAL.join(', ')}). No se adivina el `
      + `más parecido: elegir mal entre el ${UMBRAL_UTILIZACION_LONGITUDINAL_PCT} % y el `
      + `${UMBRAL_UTILIZACION_LONGITUDINAL_DECLARADA_PCT} % es un factor 2 sobre el veredicto de `
      + 'un apoyo.';
  }

  // Las alturas: sin ellas no se comparan momentos, y no se supone ninguna.
  const hRef = positivo(cap.alturaReferencia_m);
  if (hRef === null) {
    return 'la capacidad está declarada sin la altura a la que vale (`alturaReferencia_m`), y no '
      + 'se supone que sea la punta. Ese convenio existe para la carga de rotura del contrato, '
      + 'que está definida como ensayo EN LA PUNTA; una capacidad longitudinal se declara '
      + 'referida a una altura concreta —normalmente el nivel de la cruceta—, y reescalarla en '
      + 'silencio devolvería un porcentaje impecable y falso, con veredicto encima.';
  }
  const hApl = positivo(a?.alturaAplicacion_m);
  if (hApl === null) {
    return 'falta la altura a la que el conductor amarra (`alturaAplicacion_m`). Lo que rompe un '
      + 'apoyo no es la fuerza sino el MOMENTO en el empotramiento, así que comparar kgf contra '
      + 'kgf solo vale si las dos fuerzas actúan a la misma altura. No se supone que la carga '
      + 'actúe justo en la altura de referencia de la capacidad: sería regalar o castigar brazo '
      + 'sin que nada avise. Es un hueco de CAPTURA, no de desarrollo.';
  }

  // Las tres alturas tienen que ser coherentes entre sí.
  const hLibre = positivo(a?.alturaLibre_m);
  if (hLibre !== null && hApl > hLibre) {
    // Misma frase y misma doctrina que `cargas.js · avisoDeCapacidad`, para que
    // el sistema diga lo MISMO del mismo apoyo en los dos ejes.
    return `el punto de sujeción (${f(hApl, 2)} m) queda por encima de la punta del apoyo `
      + `(${f(hLibre, 2)} m). Con esa geometría el cálculo del momento no significa nada; hay que `
      + 'corregir el dato del inventario.';
  }
  if (hLibre !== null && hRef > hLibre) {
    return `la capacidad dice estar referida a ${f(hRef, 2)} m, por encima de la punta del apoyo `
      + `(${f(hLibre, 2)} m). Uno de los dos datos del inventario está mal, y el sistema no elige `
      + 'cuál: la contradicción produciría un porcentaje bajo —favorable— sobre una geometría que '
      + 'no existe.';
  }
  if (hApl > hRef) {
    return `la carga actúa a ${f(hApl, 2)} m, por encima de los ${f(hRef, 2)} m a los que la `
      + 'capacidad fue declarada. Dar el número exigiría extrapolar la capacidad hacia arriba, '
      + 'que es exactamente el reescalado que esta comprobación se niega a hacer. Si la capacidad '
      + 'de verdad vale a esa altura, hay que declararla ahí.';
  }

  return null;
}

/**
 * El peor FL TOTAL de la envolvente permanente, en valor absoluto.
 *
 * ⚠️ TOTAL, nunca por conductor: `flAdelanteMax_kgf`/`flAtrasMax_kgf` son por
 * conductor, y usarlos aquí dividiría la carga entre n y sacaría un «cumple»
 * falso justo en los apoyos que soportan el tiro entero. `null` cuando ningún
 * sentido trajo total —que es el estado de HOY, porque nadie declara cuántas
 * fases amarran.
 */
function peorTotalPermanente(permanente) {
  const xs = [permanente?.flTotalAdelante_kgf, permanente?.flTotalAtras_kgf]
    .map((x) => numero(x))
    .filter((x) => x !== null)
    .map((x) => Math.abs(x));
  return xs.length ? Math.max(...xs) : null;
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
 * @property {ReturnType<typeof utilizacionLongitudinal>} utilizacion  veredicto del eje
 *   longitudinal, SOLO sobre el caso permanente y SOLO contra una capacidad declarada en el
 *   apoyo. Es `null` mientras nadie declare esa capacidad — que hoy es SIEMPRE, en el 100 % del
 *   inventario. Cuando es `null`, el motivo va escrito en `notas`: no hay huecos mudos en este
 *   eje. El caso accidental NUNCA alimenta este campo.
 * @property {{campo:string, etiqueta:string, fuente:string|null}[]} supuestosDelVeredicto
 *   de los datos de ESTE eje que sí entraron, los que nadie verificó (sello `supuesto`).
 *   Lista vacía = nada supuesto. Va en toda fila, tenga veredicto o no.
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
 *
 * ⚠️ `opciones` NO admite capacidad longitudinal, ni con nota ni sin ella. Es
 * propiedad del APOYO (`Apoyo.capacidadLongitudinal`) y se lee solo de ahí: si
 * alguien la pasa aquí, se ignora en silencio y las filas siguen diciendo que
 * falta la capacidad del apoyo. Un veredicto heredado de otro apoyo es peor que
 * no tener veredicto en una línea donde conviven concreto, metálico, madera,
 * torre y torreta.
 *
 * @returns {FilaLongitudinal[]}
 */
export function longitudinalDeLaLinea(apoyos, tramos, opciones = {}) {
  const E = (Array.isArray(apoyos) ? apoyos : []).filter(esEstructura);
  if (!E.length) return [];

  const lista = Array.isArray(tramos) ? tramos : [];
  const nombres = E.map((a, i) => nombreDe(a, i));
  // Se arma UNA vez para toda la línea: la deflexión de cada apoyo se resuelve
  // sobre esta misma geometría, igual que en cargas.js.
  const geoLinea = E.map((x) => ({
    lat: numero(x?.coordenada?.lat ?? x?.lat),
    lon: numero(x?.coordenada?.lon ?? x?.lon),
  }));
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
  // ⚠️ La llave es un NOMBRE, y `find()` devuelve el primero que encaje. Si dos
  // apoyos se llaman igual —cosa que pasa: `exportar/calidad.js` ya tiene un
  // chequeo dedicado a la numeración duplicada— el emparejamiento cogería el
  // tramo de OTRO apoyo y publicaría magnitud y LADO equivocados, sin una sola
  // nota. Es exactamente el error que la cabecera de este archivo declara como
  // el único que ninguna comprobación de conteo detecta.
  //
  // Por eso se CUENTA en vez de tomar el primero: con más de uno, la fila queda
  // no evaluable con el motivo escrito. La solución de fondo es emparejar por el
  // UUID inmutable que el proyecto declara como identidad (CLAUDE.md §3.1) en
  // vez de por «E07», pero eso exige que los tramos lo transporten; hasta
  // entonces, negarse es mejor que acertar por casualidad.
  const buscar = (campo, nombre) => {
    const hallados = [...porNombre.values()].filter((t) => t[campo] === nombre);
    return { tramo: hallados.length === 1 ? hallados[0] : null, cuantos: hallados.length };
  };
  const tramoQueLlega = (nombre) => buscar('hasta', nombre);
  const tramoQueSale = (nombre) => buscar('desde', nombre);

  /**
   * Entrada de la utilización para un apoyo concreto. La capacidad y las dos
   * alturas se leen SIEMPRE del apoyo, nunca de `opciones`: un veredicto que
   * pudiera entrar por parámetro de línea sería un veredicto heredado.
   */
  const veredictoDe = (a, permanente, n, conteoDeLinea) => {
    // ⛔ DERIVACIÓN: NO se dictamina. La fila se calcula como el desequilibrio
    // entre los dos tramos de la línea principal, pero lo que de verdad carga
    // longitudinalmente a un apoyo de derivación es el TIRO DEL RAMAL que sale
    // de él — y ese tercer tiro el sistema no lo ve. Publicar la cifra es
    // legítimo (es la parte que sí se calcula); publicar un «cumple» verde
    // sobre ella sería afirmar que el apoyo aguanta una carga que no se ha
    // mirado entera. La rama del Terminal ya declara este punto ciego con estas
    // mismas palabras; aquí faltaba que la advertencia llegara al VEREDICTO
    // (§ADR-017). Misma doctrina que la suspensión: antes sin dictamen que con
    // uno indefendible.
    if (a?.funcionEstructural === 'Derivación') return null;
    // APOYO PRIMERO, LÍNEA DESPUÉS — el mismo patrón que `cargas.js` con
    // `nConductores`, y por la misma razón: un terminal amarra todas las fases y
    // un apoyo de paso puede no amarrar ninguna, así que un conteo de línea es
    // una suposición sobre cada estructura. Cuando el número sale de la línea,
    // el criterio lo DICE (`conteoFasesDeLinea`) en vez de esconderlo.
    //
    // ⚠️ Esto no estaba, y sin ello todo este eje era código muerto EN EL
    // PRODUCTO: el contrato no tenía `nFasesAmarradas` y la vista no lo pasaba,
    // así que el total era null siempre y la utilización también — por muy bien
    // declarada que estuviera la capacidad. Cazado por los tres auditores de
    // §ADR-017 y reproducido ejecutando el camino real de la aplicación.
    return utilizacionLongitudinal({
      // TOTAL sobre el apoyo, no por conductor.
      fl_kgf: peorTotalPermanente(permanente),
      capacidad: a?.capacidadLongitudinal,
      alturaAplicacion_m: a?.alturaAplicacion_m,
      alturaLibre_m: a?.alturaLibre_m,
      nFasesAmarradas: n,
      conteoFasesDeLinea: conteoDeLinea,
    });
  };

  const filaDe = (a, i) => {
    // ⚠️ El conteo se resuelve AQUÍ, por apoyo, y se usa en todo el cálculo de
    // esta fila. Resolverlo más abajo —al emitir el veredicto— no habría
    // servido: los totales ya vienen multiplicados desde las funciones por
    // estado, así que el conteo tiene que entrar ANTES, no después.
    const nDelApoyo = enteroPositivo(a?.nFasesAmarradas);
    const nAmarradas = nDelApoyo ?? nFases;
    const conteoDeLinea = nDelApoyo === null && nFases !== null;
    const nombre = nombres[i];
    const notas = [];
    const motivos = [];
    const fn = a?.funcionEstructural ?? null;
    const esExtremoArray = i === 0 || i === E.length - 1;

    const bAtras = tramoQueLlega(nombre);
    const bAdelante = tramoQueSale(nombre);
    const atras = bAtras.tramo;
    const adelante = bAdelante.tramo;
    const nombreAmbiguo = bAtras.cuantos > 1 || bAdelante.cuantos > 1;

    // ── Deflexión: manda la GEOMETRÍA; la política vive en geodesia.js ──────
    // Un solo dueño para todo el sistema (`resolverDeflexion`). Aquí no se
    // elige: se usa lo que devuelve y se publica su nota. Importa más de lo que
    // parece en este eje: con el ángulo se calcula el cos(α/2) que proyecta el
    // desequilibrio sobre la línea, así que un ángulo viejo mueve la cifra
    // entera sin que nada avise (auditoría de la ola 4, §ADR-013).
    const defl = resolverDeflexion(geoLinea, i, a?.deflexion_grados);
    const deflexion_grados = defl.valor;
    if (defl.nota) notas.push(defl.nota);

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
      // Presentes en TODA fila, también en las que no llevan veredicto: los
      // consumidores tienen que poder contar cuántos apoyos DECLARAN capacidad
      // sin deducirlo del número de veredictos, que es otro hecho distinto.
      flTotalPeor_kgf: null,
      nFasesAmarradas: nAmarradas,
      capacidadDeclarada: a?.capacidadLongitudinal != null,
      // De lo que SÍ entró en este eje, qué nadie verificó. Va en `base` —y no
      // solo en las filas con veredicto— porque es un hecho del inventario del
      // apoyo: quien cuente «cuántos veredictos se apoyan en un supuesto» tiene
      // que poder contar también los apoyos que aún no lo tienen.
      supuestosDelVeredicto: supuestosDelVeredictoLongitudinal(a, nDelApoyo !== null),
      notas,
      noEvaluable: null,
    };

    // ── C9 · precedencia 0: un nombre que identifica a más de uno no identifica ──
    if (nombreAmbiguo) {
      return { ...base, caso: 'no_evaluable',
        noEvaluable: `hay más de un tramo que dice llegar o salir de «${nombre}»: el nombre no `
          + 'identifica a un solo apoyo. Emparejar con el primero que encaja publicaría el tiro de '
          + 'OTRO apoyo con su lado invertido, y ninguna comprobación de conteo lo detectaría. '
          + 'Corrija la numeración duplicada del levantamiento.' };
    }

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
          flPorConductor_kgf: 0, fl_kgf: nAmarradas === null ? null : 0,
          flAdelanteMax_kgf: null, flAtrasMax_kgf: null, sentido: 'nulo',
        },
        // Negativa DELIBERADA, no un olvido: aunque el apoyo trajera capacidad
        // declarada, un «cumple al 0 %» aquí certificaría con un número
        // impecable el apoyo del que este módulo declara no saber nada. El
        // motivo se publica en `notas` (SIN_VEREDICTO_SUSPENSION).
        utilizacion: null,
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
      // Un terminal con vano a los DOS lados no es un terminal: el sistema no ve
      // qué hay más allá y publicar el tiro de uno descartando el otro en
      // silencio afirma que el segundo no existe.
      if (atras && adelante) {
        return { ...base, caso: 'no_evaluable',
          noEvaluable: 'declarado «Terminal» pero con tramo a los DOS lados. Si de verdad ancla a '
            + 'ambos, no es un terminal sino un anclaje; y si uno de los dos es una bajante o un '
            + 'puente, el sistema no lo ve. Publicar el tiro de un solo lado afirmaría que el otro '
            + 'no existe.' };
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
          : terminalLongitudinal({ tiro_kgf: s.H, estadoTiro: s.nombre, lado, nFasesAmarradas: nAmarradas });
      }).filter(Boolean));

      // ⚠️ Si el único tramo contiguo no trajo tiro en NINGÚN estado, aquí no hay
      // número: la fila entera es no evaluable. Antes se seguía adelante y se
      // publicaba `sentidoResoluble: false`, y ese `false` significa OTRA COSA en
      // el resto de la tabla —«el número salió pero pesa menos que el ruido de
      // obra»—, de modo que los tres consumidores lo leían al revés: la pantalla
      // lo contaba en el KPI «sentido dudoso», el informe imprimía «el número
      // sale pero el SENTIDO no es concluyente» y el CSV escribía
      // `Sentido_resoluble = no`, todo sobre un apoyo del que no se calculó nada.
      // En esta columna `false` es una afirmación; la ausencia de dato es `null`.
      if (env.flAdelanteMax_kgf === null && env.flAtrasMax_kgf === null) {
        return { ...base, caso: 'no_evaluable',
          noEvaluable: unico.motivo ?? 'el único tramo contiguo no trajo tiro horizontal en ninguno '
            + 'de los cuatro estados: sin tiro no hay carga longitudinal que publicar' };
      }

      notas.push('Un terminal soporta el tiro ENTERO del conductor sobre el eje de la línea: es el '
        + 'caso más severo del eje y no depende de ninguna diferencia entre tramos.');
      notas.push('NO se verifica contra lo que haya más allá del último apoyo: si la bajante o el '
        + 'puente al pórtico está tenso, esto no es un terminal sino un anclaje con dos tiros, y el '
        + 'sistema no ve ese lado.');
      if (nAmarradas === null) {
        motivos.push('no se declaró cuántas fases amarran en el apoyo (`nFasesAmarradas`): el '
          + 'número por conductor sí sale; el total, no. No se hereda el conteo de la carga '
          + 'transversal, que cuenta 3·circuitos con el cable de guarda declaradamente fuera');
      }
      return { ...base, caso: 'terminal', permanente: env,
        // El sentido de un terminal no lo discute el tendido: hay un solo lado,
        // y el tiro entero está órdenes de magnitud por encima del ruido de obra.
        // Llegados aquí hay número por construcción (el guardián de arriba), así
        // que esto es `true` de verdad y nunca un `false` que signifique «falta».
        sentidoResoluble: true,
        inversionResoluble: false,
        // Es el caso más severo del eje: si algún apoyo va a salir en rojo, es
        // éste. Se evalúa sobre el FL TOTAL de la envolvente permanente.
        utilizacion: veredictoDe(a, env, nAmarradas, conteoDeLinea),
        // El NUMERADOR del porcentaje, publicado al lado del porcentaje.
        // Las columnas «adelante» y «atrás» son POR CONDUCTOR, y la
        // utilización se calcula sobre el TOTAL: sin este número, quien
        // revise con una calculadora obtiene un tercio de lo impreso y
        // concluye que el cálculo está mal (§ADR-017, mismo fallo que
        // §ADR-013 tuvo que arreglar en el eje transversal).
        flTotalPeor_kgf: peorTotalPermanente(env),
        nFasesAmarradas: nAmarradas,
        capacidadDeclarada: a?.capacidadLongitudinal != null,
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
        deflexion_grados, estadoTiro: s1.nombre, nFasesAmarradas: nAmarradas,
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

    // ⚠️ El guardián de arriba mira `porEstado.length`, que cuenta INTENTOS, no
    // resultados: con el ángulo sin resolver los cuatro estados devuelven
    // `flPorConductor_kgf: null` y el array sigue teniendo cuatro entradas. Sin
    // esta segunda puerta, `Math.max(null ?? 0, null ?? 0)` convertía el hueco en
    // 0 y la fila llegaba a publicar, EN PROSA y en el informe firmable, «el
    // mayor desequilibrio calculado (0,0 kgf) queda por debajo del ruido de
    // tendido». No se calculó ningún desequilibrio: se comparó un hueco.
    if (env.flAdelanteMax_kgf === null && env.flAtrasMax_kgf === null) {
      return { ...base, caso: 'no_evaluable',
        noEvaluable: deflexion_grados === null
          ? 'no se pudo resolver el ángulo de quiebre: sin él no hay proyección sobre el eje de la '
            + 'línea, y ninguno de los cuatro estados produjo un número'
          : 'ninguno de los cuatro estados produjo un desequilibrio calculable' };
    }

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
    //
    // ⚠️ EL PICO SE BUSCA POR LADO. Al romperse el conductor de ATRÁS, el que
    // queda sano es el de ADELANTE: hay que tomar la envolvente del tramo de
    // adelante, no la del roto. La primera versión elegía el estado pico mirando
    // SOLO `atras.estados` y luego pedía al otro tramo su tiro EN ESA MISMA
    // CLAVE. Verificado ejecutando: con atrás picando a mínima temperatura y
    // adelante a viento, publicaba 1.290 kgf donde la envolvente real del tramo
    // sano son 1.900 — un 32 % por debajo, POR EL LADO INSEGURO, y con la
    // etiqueta del estado del otro tramo. Las pruebas no lo veían porque su
    // fixture hacía picar los dos tramos en el mismo estado.
    const picoDe = (tr) => CLAVES_ESTADO
      .map((k) => tr.estados[k])
      .filter((s) => s && s.H !== null)
      .reduce((m, s) => (m === null || s.H > m.H ? s : m), null);

    const picoAtras = picoDe(atras);
    const picoAdelante = picoDe(adelante);
    const accidental = (picoAtras || picoAdelante) ? {
      // Se rompe ATRÁS → sobrevive el de ADELANTE, con SU pico y SU estado.
      atras: picoAdelante ? roturaEnAnclaje({ tiroSano_kgf: picoAdelante.H,
        deflexion_grados, ladoRoto: 'atras', kRes: opciones?.kRes,
        estadoTiro: picoAdelante.nombre }) : null,
      // Se rompe ADELANTE → sobrevive el de ATRÁS.
      adelante: picoAtras ? roturaEnAnclaje({ tiroSano_kgf: picoAtras.H,
        deflexion_grados, ladoRoto: 'adelante', kRes: opciones?.kRes,
        estadoTiro: picoAtras.nombre }) : null,
    } : null;

    if (nAmarradas === null) {
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
      // SOLO la envolvente PERMANENTE. El accidental (`accidental`) mantiene su
      // veredicto en null y nunca se suma ni se compara con este umbral: son
      // hipótesis de carga distintas y este proyecto no ha adoptado criterio de
      // aceptación para la rotura de conductor.
      utilizacion: veredictoDe(a, env, nAmarradas, conteoDeLinea),
      // El NUMERADOR del porcentaje, al lado del porcentaje: las columnas
      // «adelante» y «atrás» son POR CONDUCTOR y la utilización se calcula
      // sobre el TOTAL (§ADR-017).
      flTotalPeor_kgf: peorTotalPermanente(env),
      nFasesAmarradas: nAmarradas,
      capacidadDeclarada: a?.capacidadLongitudinal != null,
      notas,
      noEvaluable: motivos.length ? motivos.join(' · ') : null,
    };
  };

  // Ninguna fila sale sin decir si tiene veredicto y, si no lo tiene, POR QUÉ.
  // Aquí es donde este eje deja de ser código muerto: la función existía desde
  // ADR-012, probada y sin que nadie la llamara (`30 · L-28`).
  return E.map((a, i) => {
    const fila = filaDe(a, i);
    if (fila.utilizacion === null) {
      const aviso = avisoDeUtilizacionLongitudinal(fila, a);
      if (aviso) fila.notas.push(aviso);
    }
    return fila;
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
