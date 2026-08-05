// ============================================================================
// nucleo/cargas.js — la carga que cada ESTRUCTURA tiene que aguantar
// ----------------------------------------------------------------------------
// Funciones PURAS: sin DOM, sin red, sin contratos. Lo único que importan son
// otros archivos de nucleo/ (geodesia y mecanica), que también son puros.
//
// POR QUÉ EXISTE ESTE ARCHIVO
//
// El sistema ya sabía cuánto TIRA el conductor (mecanica.js) y cuánto cuelga en
// cada vano (vanos.js). Faltaba entera la pregunta que hace el que firma:
// **¿y el apoyo aguanta?** Esa no se contesta con el tiro, se contesta con la
// RESULTANTE que el tiro deja sobre la estructura — que en un quiebre puede ser
// MAYOR que el propio tiro.
//
// EL NÚMERO QUE HAY QUE VER
//
// La resultante del quiebre vale  Ft = 2·H·sen(α/2)  por conductor. Ese factor
// 2·sen(α/2) vale 0 a 0°, exactamente 1 a 60° y √3 = 1,732 a 120°. En esta línea
// hay un apoyo con α = 118°: su factor es **1,714**. Esa estructura recibe un
// 71 % MÁS de carga transversal que la tensión con la que está tendido el
// conductor, y la recibe siempre, haya o no haya viento. Un apoyo así,
// dimensionado «por el tiro», está dimensionado por poco más de la mitad.
// Por eso el factor sale a la vista con nombre propio (`componentes.factorAngulo`)
// y con una nota escrita en cuanto pasa de 1: es el dato que cambia la
// conversación, y estaba escondido dentro de una fórmula.
//
// LO QUE ESTE ARCHIVO **NO** HACE — y se dice, no se deja implícito
// · **No dimensiona el apoyo.** Compara una carga contra una capacidad DECLARADA.
//   Si nadie declaró la capacidad, no la estima: devuelve `null` (ver abajo).
// · **No calcula la carga VERTICAL.** Esa es el vano peso, y ya vive en
//   mecanica.js. Duplicarla aquí crearía dos dueños del mismo número.
// · **No calcula la carga LONGITUDINAL** (terminales, rotura de conductor,
//   desequilibrio de tiros entre tramos contiguos). Es otro caso de carga, sobre
//   otro eje, y sumarlo a estos kgf sería sumar peras con manzanas.
// · **No decide si el apoyo cumple una norma.** Emite 'cumple' / 'revisar'
//   contra un umbral ADOPTADO y declarado, igual que umbrales.js. Quien dictamina
//   es el ingeniero que firma (CLAUDE.md §4).
//
// Convenio de unidades (el mismo de mecanica.js, no se cambia):
//   H tiro horizontal kgf · w carga lineal kg/m · a vano m · α deflexión grados
//
// Ver docs/40-DOMINIO-LINEAS-AT.md §3.3 (carga de viento) y §3.4 (admisibles).
// ============================================================================

import { vanoViento, vincenty, resolverDeflexion } from './geodesia.js';
import { cargaViento, presionDinamica } from './mecanica.js';

const GRADOS_A_RAD = Math.PI / 180;

// ── Criterios ADOPTADOS en este proyecto (no son cifras de norma) ────────────

/**
 * Hipótesis de composición de las dos cargas transversales.
 *
 * El quiebre empuja SIEMPRE sobre la bisectriz del ángulo. El viento empuja
 * hacia donde sopla, que es un dato que nadie tiene: la dirección del viento de
 * diseño no se conoce, se supone. Las dos lecturas extremas son:
 *
 *   · viento ALINEADO con la bisectriz  → las cargas se SUMAN     (Ft + Fv)
 *   · viento PERPENDICULAR a ella       → se componen en cuadratura (√(Ft²+Fv²))
 *
 * Se ADOPTA la primera —la suma— porque es la envolvente superior y porque el
 * viento gira: a lo largo de la vida de la línea llegará el día en que sople
 * justo en la dirección mala. La segunda se devuelve también, en
 * `componentes.ftTotalPerpendicular_kgf`, para que el revisor vea la horquilla
 * completa y pueda discutir la hipótesis en vez de tener que deducirla del
 * código.
 *
 * ⚠️ Es criterio ADOPTADO, sin norma citada detrás. Si el proyecto adopta un
 * día una norma de hipótesis de carga, este texto y esta elección se cambian
 * AQUÍ, en un solo sitio, y se mueven las tres salidas a la vez.
 */
const HIPOTESIS_COMPOSICION =
  'ADOPTADA (sin norma citada): el viento se supone alineado con la bisectriz del ' +
  'quiebre, de modo que su carga SE SUMA a la del ángulo. Es la envolvente superior; ' +
  'la lectura en cuadratura (viento perpendicular) va en ftTotalPerpendicular_kgf.';

/**
 * Porcentaje de la carga de rotura del apoyo a partir del cual la fila se marca
 * 'revisar'.
 *
 * 50 % equivale a un coeficiente de seguridad 2 sobre la carga de ROTURA
 * declarada. Es la práctica corriente en postes, pero **aquí no se cita ninguna
 * norma**: es un criterio adoptado y por eso vive como constante con nombre, a
 * la vista y discutible. Cambiarlo cambia qué apoyos salen en rojo en toda la
 * línea, así que no se toca sin dejar constancia (docs/99, formato ADR).
 */
export const UMBRAL_UTILIZACION_PCT = 50;

/** El texto que acompaña al umbral allí donde se muestre. Un solo dueño. */
export const CRITERIO_UTILIZACION =
  `CRITERIO ADOPTADO (sin norma citada): la carga transversal no debe superar el ` +
  `${UMBRAL_UTILIZACION_PCT} % de la carga de ROTURA declarada del apoyo, referida ` +
  `a la altura a la que la rotura fue ensayada (coeficiente de seguridad 2). ` +
  `La rotura NUNCA se estima: si no viene declarada, la fila queda no evaluable.`;

// ── Utilidades mínimas ──────────────────────────────────────────────────────

/** Un número de verdad, o `null`. NaN, '', null y undefined son lo mismo: falta el dato. */
const numero = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const positivo = (x) => { const v = numero(x); return v !== null && v > 0 ? v : null; };
const noNegativo = (x) => { const v = numero(x); return v !== null && v >= 0 ? v : null; };
const enteroPositivo = (x) => (Number.isInteger(x) && x > 0 ? x : null);

/** Formato estable: `toFixed`, nunca `toLocaleString` (dependería del ICU de la máquina). */
const f = (x, d = 1) => (numero(x) === null ? '—' : x.toFixed(d));

/**
 * Solo las estructuras sostienen el conductor — el mismo filtro que gobierna
 * todo el cálculo (docs/40 §10). Un empalme puede colgar a mitad de vano: darle
 * fila aquí inventaría un apoyo que no existe y partiría el vano real en dos.
 * Sin `tipoPunto` declarado se asume estructura, que es lo que asume el resto
 * del sistema.
 */
const esEstructura = (a) => (a?.tipoPunto ?? 'Estructura') === 'Estructura';

/** Nombre visible. Sin ninguno, el ordinal — una fila sin apoyo identificable no sirve. */
const nombreDe = (a, i) =>
  a?.nombre ?? a?.nombreNormalizado ?? a?.nombreCampo ?? `apoyo #${i + 1}`;

// ════════════════════════════════════════════════════════════════════════════
// 1 · EL FACTOR DEL QUIEBRE
// ════════════════════════════════════════════════════════════════════════════

/**
 * Factor de amplificación del quiebre: cuántas veces la tensión del conductor
 * recibe la estructura por cada conductor.
 *
 *     factor = 2 · sen(α/2)      con α = DEFLEXIÓN (cambio de dirección)
 *
 * Sale de restar los dos tirones: el vano de atrás tira del apoyo hacia atrás y
 * el de adelante hacia adelante; si la línea es recta se cancelan, y si gira
 * queda |H·(û₂ − û₁)| = 2·H·sen(α/2), sobre la bisectriz.
 *
 * ⚠️ α es la DEFLEXIÓN (0° = línea recta), no el ángulo interior entre
 * conductores (que sería 180° − α). Confundirlos invierte el resultado: daría
 * carga máxima en la recta y nula en el quiebre. Por eso esta función se
 * alimenta de `geodesia.deflexion()`, que ya devuelve la deflexión en [0,180].
 *
 * Se exporta para que la interfaz no vuelva a escribir el seno por su cuenta:
 * una fórmula copiada en dos sitios es una fórmula que algún día se corrige en
 * uno solo, y entonces la pantalla y el informe dicen cosas distintas.
 *
 * @param {number} deflexion_grados en [0,180]
 * @returns {number|null} null si el ángulo falta o está fuera de rango
 */
export function factorTransversal(deflexion_grados) {
  const a = numero(deflexion_grados);
  // Fuera de [0,180] no hay ángulo que valga: `deflexion()` nunca devuelve otra
  // cosa, así que un valor fuera de rango es dato corrupto, no un giro grande.
  if (a === null || a < 0 || a > 180) return null;
  return 2 * Math.sin((a * GRADOS_A_RAD) / 2);
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · CARGA TRANSVERSAL SOBRE UN APOYO
// ════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} EntradaCargaTransversal
 * @property {number} deflexion_grados   ángulo de quiebre en el apoyo, [0,180]
 * @property {number} tiro_kgf           tiro horizontal H del conductor, kgf
 * @property {number} nConductores       cuántos conductores carga el apoyo (fases + guarda)
 * @property {number} vanoViento_m       semisuma de los vanos adyacentes, m
 * @property {number} cargaViento_kg_m   carga de viento por metro de conductor, kg/m
 *
 * @typedef {Object} ResultadoCargaTransversal
 * @property {number|null} ftAngulo_kgf  resultante del quiebre, todos los conductores
 * @property {number|null} ftViento_kgf  empuje del viento, todos los conductores
 * @property {number|null} ftTotal_kgf   composición de las dos, con la hipótesis adoptada
 * @property {Object}      componentes   el desglose y lo que faltó, para el informe
 */

/**
 * Carga transversal sobre un apoyo: la del quiebre, la del viento, y la suma.
 *
 * **Quiebre:** `ftAngulo = 2·H·sen(α/2)·n`. Existe hasta sin viento y no se va
 * nunca: es carga permanente.
 *
 * **Viento:** `ftViento = w_viento · vano_viento · n`. El vano viento es la
 * semisuma de los vanos adyacentes porque cada vano reparte su empuje entre sus
 * dos apoyos. En un apoyo con quiebre los dos semivanos no están alineados, así
 * que sus empujes no son colineales y su suma vectorial es algo menor que este
 * producto: la simplificación es exacta en la recta y **cota superior** en el
 * quiebre — se equivoca del lado seguro, que es el único lado admisible aquí.
 *
 * **Suma:** ver `HIPOTESIS_COMPOSICION` arriba. Es ADOPTADA, no de norma, y se
 * devuelven las dos lecturas para que se pueda discutir.
 *
 * NO INVENTA. Si falta un ingrediente, la salida que dependía de él es `null` y
 * el motivo queda escrito en `componentes.faltan`. En particular `ftTotal_kgf`
 * es `null` cuando falta cualquiera de las dos componentes: devolver solo la que
 * se pudo calcular sería afirmar que la otra vale cero, y un cero en una memoria
 * de cálculo se firma igual que un número bueno.
 *
 * @param {EntradaCargaTransversal} entrada
 * @returns {ResultadoCargaTransversal}
 */
export function cargaTransversalApoyo(entrada) {
  const faltan = [];

  const n = enteroPositivo(entrada?.nConductores);
  if (n === null) {
    faltan.push('nConductores — cuántos conductores carga el apoyo (fases y cables de guarda); no se supone, multiplica TODA la carga');
  }

  const H = positivo(entrada?.tiro_kgf);
  if (H === null) faltan.push('tiro_kgf — tiro horizontal del conductor en el estado evaluado');

  const factorAngulo = factorTransversal(entrada?.deflexion_grados);
  if (factorAngulo === null) {
    faltan.push('deflexion_grados — ángulo de quiebre en [0,180]; los apoyos extremos no lo tienen definido');
  }

  // El vano viento puede ser 0 solo si los dos vanos lo son, cosa que no pasa;
  // se acepta ≥ 0 para no rechazar un apoyo extremo con un único vano corto.
  const vv = noNegativo(entrada?.vanoViento_m);
  if (vv === null) faltan.push('vanoViento_m — semisuma de los vanos adyacentes');

  // La carga de viento SÍ puede ser 0 legítimamente: es lo que vale con una
  // hipótesis climática sin viento. Cero declarado no es lo mismo que ausencia.
  const w = noNegativo(entrada?.cargaViento_kg_m);
  if (w === null) faltan.push('cargaViento_kg_m — empuje del viento por metro de conductor');

  const ftAngulo_kgf = factorAngulo !== null && H !== null && n !== null
    ? factorAngulo * H * n
    : null;

  const ftViento_kgf = w !== null && vv !== null && n !== null ? w * vv * n : null;

  const hayAmbas = ftAngulo_kgf !== null && ftViento_kgf !== null;
  const ftTotalAlineado_kgf = hayAmbas ? ftAngulo_kgf + ftViento_kgf : null;
  const ftTotalPerpendicular_kgf = hayAmbas ? Math.hypot(ftAngulo_kgf, ftViento_kgf) : null;

  return {
    ftAngulo_kgf,
    ftViento_kgf,
    ftTotal_kgf: ftTotalAlineado_kgf,
    componentes: {
      factorAngulo,
      // El dato que hace evidente el caso de los 118°: `true` significa que la
      // estructura recibe MÁS carga que la tensión del conductor. Ocurre con
      // toda deflexión por encima de 60°, y no depende del viento.
      amplificaTension: factorAngulo === null ? null : factorAngulo > 1,
      nConductores: n,
      tiro_kgf: H,
      vanoViento_m: vv,
      cargaViento_kg_m: w,
      hipotesisComposicion: HIPOTESIS_COMPOSICION,
      ftTotalAlineado_kgf,
      ftTotalPerpendicular_kgf,
      faltan,
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · UTILIZACIÓN DEL APOYO
// ════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {'cumple'|'revisar'|'no_evaluable'} EstadoUtilizacion
 *
 * Es el mismo vocabulario de umbrales.js, a propósito: el sistema tiene que
 * decir lo mismo en la pantalla, el informe y el exporte. `utilizacionApoyo`
 * solo emite 'cumple' y 'revisar' — cuando no hay con qué evaluar devuelve
 * `null` entero, y es la fila de `cargasDeLaLinea` la que se marca
 * 'no_evaluable' con el motivo escrito.
 */

/**
 * ¿Cuánta capacidad del apoyo se está consumiendo?
 *
 * La carga de rotura de un poste se ensaya como una fuerza horizontal aplicada
 * en la punta. Lo que rompe el poste no es la fuerza sino el MOMENTO en el
 * empotramiento, así que comparar kgf contra kgf solo vale si las dos fuerzas
 * actúan a la misma altura. Aquí se comparan momentos:
 *
 *     utilización = (F · h_aplicación) / (P_rotura · h_libre) · 100
 *
 * `h_libre` es la altura del poste sobre el terreno (la del ensayo) y
 * `h_aplicación` la altura real del punto de sujeción del conductor. Con el
 * conductor amarrado más abajo de la punta, el mismo kgf hace menos daño; usar
 * la fuerza a secas castigaría al apoyo sin motivo, o —al revés— lo salvaría
 * indebidamente si algo colgara por encima.
 *
 * **DEVUELVE `null` SI FALTA CUALQUIERA DE LOS CUATRO DATOS.** No se estima la
 * carga de rotura de un poste: depende del material, de la clase y del año de
 * fabricación, y suponerla sería fabricar la conclusión del informe. Tampoco se
 * deduce la altura libre de la altura total del poste, porque el empotramiento
 * no se ve desde un escritorio. Un hueco visible se llena en campo; un hueco
 * tapado con un supuesto se firma.
 *
 * También devuelve `null` con geometría contradictoria (punto de aplicación por
 * encima de la punta): un número calculado sobre datos imposibles se lee igual
 * de bien que uno bueno, y es exactamente lo que no puede pasar aquí.
 *
 * `margen_kgf` es lo que **todavía se puede colgar de ese apoyo, a esa altura**,
 * antes de tocar el umbral adoptado. Negativo = ya se pasó. Por construcción
 * `margen_kgf >= 0` ⟺ `estado === 'cumple'`.
 *
 * @param {{ftTotal_kgf:number, cargaRotura_kgf:number, alturaLibre_m:number, alturaAplicacion_m:number}} entrada
 * @returns {{utilizacion_pct:number, margen_kgf:number, estado:EstadoUtilizacion}|null}
 */
export function utilizacionApoyo(entrada) {
  // La carga puede ser 0 (línea recta, sin viento): eso es un dato, no una
  // ausencia. La rotura y las dos alturas tienen que ser positivas de verdad.
  const F = noNegativo(entrada?.ftTotal_kgf);
  const rotura = positivo(entrada?.cargaRotura_kgf);
  const hLibre = positivo(entrada?.alturaLibre_m);
  const hAplic = positivo(entrada?.alturaAplicacion_m);

  if (F === null || rotura === null || hLibre === null || hAplic === null) return null;
  if (hAplic > hLibre) return null; // nada se cuelga por encima de la punta

  const utilizacion_pct = ((F * hAplic) / (rotura * hLibre)) * 100;

  // Carga máxima que admite el umbral adoptado, referida al punto donde la carga
  // realmente actúa. Es el número accionable: se compara con lo que hay colgado.
  const admisible_kgf = ((UMBRAL_UTILIZACION_PCT / 100) * rotura * hLibre) / hAplic;

  return {
    utilizacion_pct,
    margen_kgf: admisible_kgf - F,
    estado: utilizacion_pct <= UMBRAL_UTILIZACION_PCT ? 'cumple' : 'revisar',
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 4 · LA LÍNEA ENTERA, APOYO POR APOYO
// ════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} FilaCarga
 * @property {number}  n                     posición ENTRE LAS ESTRUCTURAS, 1..N
 * @property {string}  apoyo                 nombre visible
 * @property {string|null} funcionEstructural
 * @property {boolean} esExtremo             primero o último: sin deflexión definida
 * @property {number[]} tramos_n             tramo(s) de tensión de los que cuelga
 * @property {number|null} deflexion_grados
 * @property {number|null} factorAngulo      2·sen(α/2) — el multiplicador del tiro
 * @property {number|null} nConductores
 * @property {number|null} vanoViento_m
 * @property {number|null} presionViento_Pa  presión dinámica de la hipótesis
 * @property {number|null} cargaViento_kg_m
 * @property {number|null} tiro_kgf          tiro con el que se compone (estado con viento)
 * @property {string|null} estadoTiro        de qué estado salió ese tiro
 * @property {number|null} tiroMaximo_kgf    el mayor tiro de todos los estados
 * @property {string|null} estadoTiroMaximo
 * @property {number|null} ftAngulo_kgf
 * @property {number|null} ftViento_kgf
 * @property {number|null} ftTotal_kgf
 * @property {number|null} ftAnguloTiroMaximo_kgf  quiebre solo, con el tiro máximo (sin viento)
 * @property {boolean} capacidadDeclarada    el apoyo declara una carga de rotura positiva.
 *                                           ⚠️ NO implica que tenga veredicto: puede faltarle la
 *                                           altura libre. Deducir uno del otro ya metió una frase
 *                                           falsa en el informe firmado.
 * @property {string[]} faltaParaVeredicto   qué le falta para poder ser dictaminado, nombrado
 *
 * `componentes` se describe entero y no como `Object` a secas: TypeScript lee
 * este JSDoc desde las vistas (web/ compila con `allowJs`), y un `Object` sin
 * forma obliga a cada pantalla a redeclararla por su cuenta — que es como una
 * columna se queda vacía en producción tras renombrar un campo aquí, sin que
 * nada avise al compilar.
 * @property {{
 *   factorAngulo: number|null,
 *   amplificaTension: boolean|null,
 *   nConductores: number|null,
 *   tiro_kgf: number|null,
 *   vanoViento_m: number|null,
 *   cargaViento_kg_m: number|null,
 *   hipotesisComposicion: string,
 *   ftTotalAlineado_kgf: number|null,
 *   ftTotalPerpendicular_kgf: number|null,
 *   faltan: string[],
 * }} componentes
 * @property {ReturnType<typeof utilizacionApoyo>} utilizacion  null si no hay capacidad declarada
 * @property {string[]} notas                supuestos y avisos, escritos
 * @property {string|null} noEvaluable       motivo, cuando no se pudo calcular la carga
 */

/**
 * Carga transversal de TODA la línea, una fila por estructura.
 *
 * Reúne lo que ya calculan otros módulos y no recalcula ninguno de ellos:
 * `geodesia.vanoViento` para el reparto de vanos, `geodesia.resolverDeflexion`
 * para el ángulo de quiebre, `mecanica.presionDinamica` y `mecanica.cargaViento`
 * para el empuje. El tiro llega YA CALCULADO en los tramos: si este archivo lo
 * recalculara habría dos dueños del mismo número y el día que difieran en el
 * tercer decimal nadie sabrá cuál mandó en el informe firmado.
 *
 * ⚠️ `n` numera entre ESTRUCTURAS, no entre puntos del levantamiento: los
 * empalmes no tienen fila. Quien cruce esta tabla con el exporte de puntos tiene
 * que cruzar por nombre, no por número, o acabará atribuyéndole a un apoyo la
 * carga de otro.
 *
 * @param apoyos    en orden. De cada uno se usa lo que traiga: coordenadas para
 *                  calcular la deflexión (manda la geodésica; el
 *                  `deflexion_grados` guardado solo si no hay coordenadas, y
 *                  entonces se declara), `vanoAnterior_m` o coordenadas,
 *                  y —si existen— `cargaRotura_kgf`, `alturaLibre_m`,
 *                  `alturaAplicacion_m`, `nConductores`.
 * @param tramos    los de `tramosDeTension`, con sus estados de `estadosDelTramo`
 *                  (o ya aplanados: `tiros_kgf`, o los de la vista con `hViento`).
 * @param conductor { diametro } en METROS (o `diametro_m`, como en el contrato).
 * @param hipotesis { vViento, cx, rho } (o `vientoMax_kmh`, `densidadAire_kg_m3`).
 *                  También puede traer `nConductores` o `circuitos`.
 * @returns {FilaCarga[]}
 */
export function cargasDeLaLinea(apoyos, tramos, conductor, hipotesis) {
  const E = (Array.isArray(apoyos) ? apoyos : []).filter(esEstructura);
  if (!E.length) return [];

  const geo = E.map((a) => ({
    lat: numero(a?.coordenada?.lat ?? a?.lat),
    lon: numero(a?.coordenada?.lon ?? a?.lon),
  }));
  const vanos = vanosEntreEstructuras(E, geo);
  const viento = vientoDeLaHipotesis(conductor, hipotesis);
  const tirosPorApoyo = repartirTirosPorApoyo(E, tramos);
  const nLinea = conductoresDeLaLinea(hipotesis, conductor);

  return E.map((a, i) => {
    const notas = [];
    const motivos = [];
    const esExtremo = i === 0 || i === E.length - 1;

    // ── Deflexión: manda la GEOMETRÍA, y la política vive en un solo sitio ───
    // `resolverDeflexion` (geodesia.js) es el único dueño de esta decisión. Aquí
    // no se elige nada: se usa lo que devuelve y se publica su nota. Antes este
    // archivo prefería la declarada y el resto del sistema prefería la
    // geodésica, así que el mismo apoyo salía con un ángulo en la ficha y con
    // otro en esta tabla — y con ese segundo se calculaban el factor 2·sen(α/2),
    // la carga de quiebre y la utilización (auditoría de la ola 4, §ADR-013).
    const defl = resolverDeflexion(geo, i, a?.deflexion_grados);
    const deflexion_grados = defl.valor;
    if (defl.nota) notas.push(defl.nota);
    if (deflexion_grados === null) {
      motivos.push(esExtremo
        ? 'apoyo extremo: la deflexión no está definida en el primer ni en el último apoyo. Un extremo trabaja a carga LONGITUDINAL (H por conductor, tirando en la dirección de la línea), que es otro caso de carga y este módulo no lo evalúa'
        : 'sin deflexión declarada ni coordenadas de los tres apoyos para calcularla');
    }

    // ── Vano viento ─────────────────────────────────────────────────────────
    // Trampa: `geodesia.vanoViento` trata el null como 0, y eso es correcto SOLO
    // en un extremo (donde de verdad no hay vano al otro lado). Si el vano
    // existe pero se desconoce su longitud, dejarlo en 0 recortaría a la mitad
    // el empuje del viento sin que nadie lo note. Ahí se declara no evaluable.
    const vAnt = i > 0 ? vanos[i - 1] : null;
    const vSig = i < E.length - 1 ? vanos[i] : null;
    const faltaVanoConocido = (i > 0 && vAnt === null) || (i < E.length - 1 && vSig === null);
    const vanoViento_m = faltaVanoConocido ? null : vanoViento(vAnt, vSig);
    if (faltaVanoConocido) {
      motivos.push('falta la longitud de alguno de los vanos adyacentes (no viene `vanoAnterior_m` ni hay coordenadas): sin ella el vano viento saldría a la mitad y el empuje del viento quedaría subestimado');
    }

    // ── Tiro: el del estado en que el viento SÍ sopla ────────────────────────
    const tiros = tirosPorApoyo[i];
    if (tiros?.mixto) {
      notas.push(`Este apoyo ancla dos tramos con tiros distintos (${f(tiros.tiros[0], 0)} y ${f(tiros.tiros[1], 0)} kgf). La fórmula 2·H·sen(α/2) supone el MISMO tiro a los dos lados: se usó el mayor, así que el valor es una envolvente. El desequilibrio longitudinal entre los dos tramos es un caso de carga aparte, no evaluado aquí.`);
    }
    if (tiros?.conViento == null && tiros?.maximo != null) {
      notas.push(`No se recibió el tiro del estado de máximo viento; se compone con el de «${tiros.estadoMaximo}», que no coexiste con el viento. El total es una envolvente, no un estado real.`);
    }
    const tiro_kgf = tiros?.conViento ?? tiros?.maximo ?? null;
    const estadoTiro = tiros?.conViento != null ? tiros.estadoConViento : (tiros?.estadoMaximo ?? null);
    if (tiro_kgf === null) {
      motivos.push('no llegó el cálculo mecánico del tramo (tiro horizontal): sin tiro no hay carga de ángulo que calcular');
    }

    // ── Conductores ─────────────────────────────────────────────────────────
    const nConductores = enteroPositivo(a?.nConductores) ?? nLinea.valor;
    if (nConductores === null) motivos.push(nLinea.motivo);
    else if (enteroPositivo(a?.nConductores) === null && nLinea.nota) notas.push(nLinea.nota);

    if (viento.motivo) motivos.push(viento.motivo);

    // ── Composición ─────────────────────────────────────────────────────────
    const r = cargaTransversalApoyo({
      deflexion_grados,
      tiro_kgf,
      nConductores,
      vanoViento_m,
      cargaViento_kg_m: viento.carga_kg_m,
    });

    // El quiebre SOLO, con el tiro más alto de todos los estados (casi siempre
    // el de mínima temperatura, en el que no hay viento). Es la otra punta de la
    // envolvente: carga permanente máxima, sin ayuda ni estorbo del viento.
    const ftAnguloTiroMaximo_kgf = cargaTransversalApoyo({
      deflexion_grados,
      tiro_kgf: tiros?.maximo ?? null,
      nConductores,
      vanoViento_m: 0,
      cargaViento_kg_m: 0,
    }).ftAngulo_kgf;

    const factorAngulo = r.componentes.factorAngulo;
    if (factorAngulo !== null && factorAngulo > 1) {
      notas.push(`El quiebre de ${f(deflexion_grados)}° multiplica la tensión por ${f(factorAngulo, 3)}: la estructura recibe un ${f((factorAngulo - 1) * 100, 0)} % MÁS de carga transversal que la propia tensión del conductor, con viento o sin él.`);
    }

    // ── Capacidad declarada ─────────────────────────────────────────────────
    const utilizacion = utilizacionApoyo({
      ftTotal_kgf: r.ftTotal_kgf,
      cargaRotura_kgf: a?.cargaRotura_kgf,
      alturaLibre_m: a?.alturaLibre_m,
      alturaAplicacion_m: a?.alturaAplicacion_m,
    });
    if (utilizacion === null) notas.push(avisoDeCapacidad(a, r.ftTotal_kgf));

    return {
      n: i + 1,
      apoyo: nombreDe(a, i),
      funcionEstructural: a?.funcionEstructural ?? null,
      esExtremo,
      tramos_n: tiros?.tramos_n ?? [],
      deflexion_grados,
      factorAngulo,
      nConductores,
      vanoViento_m,
      presionViento_Pa: viento.presion_Pa,
      cargaViento_kg_m: viento.carga_kg_m,
      tiro_kgf,
      estadoTiro,
      tiroMaximo_kgf: tiros?.maximo ?? null,
      estadoTiroMaximo: tiros?.estadoMaximo ?? null,
      ftAngulo_kgf: r.ftAngulo_kgf,
      ftViento_kgf: r.ftViento_kgf,
      ftTotal_kgf: r.ftTotal_kgf,
      ftAnguloTiroMaximo_kgf,
      componentes: r.componentes,
      utilizacion,
      // ── Los DOS hechos, publicados por separado ──────────────────────────
      // «declara su carga de rotura» y «tiene veredicto» NO son lo mismo, y
      // confundirlos ya produjo una frase falsa en el informe. Aquí van
      // sueltos para que nadie tenga que deducir uno del otro.
      capacidadDeclarada: positivo(a?.cargaRotura_kgf) !== null,
      faltaParaVeredicto: faltaParaVeredicto(a),
      notas,
      // Prosa, para que el informe pueda imprimir el hueco tal cual. La versión
      // corta y filtrable de lo mismo está en `componentes.faltan`.
      noEvaluable: motivos.length ? motivos.join(' · ') : null,
    };
  });
}

// ── Ayudas internas (no se exportan: son detalle de este archivo) ────────────

const hayCoordenada = (geo) => (k) => geo[k]?.lat !== null && geo[k]?.lon !== null;

/**
 * Longitudes de los vanos entre estructuras consecutivas. `vanos[i]` va de la
 * estructura i a la i+1.
 *
 * Prioriza `vanoAnterior_m` —que ya viene del mismo Vincenty, calculado una sola
 * vez río arriba— y solo recurre a las coordenadas cuando no está. Si no hay ni
 * lo uno ni lo otro, el vano queda `null` y se propaga como hueco, nunca como 0.
 *
 * ⚠️ CONVENIO DEL SISTEMA, no capricho de este archivo: `vanoAnterior_m` mide de
 * ESTRUCTURA A ESTRUCTURA, y un empalme intercalado NO parte el vano (así lo
 * deriva `exportar/levantamiento.js`, y así lo espera la deflexión). Si alguien
 * alimentara este módulo con distancias punto a punto de la serie completa, en
 * cada vano con empalme entraría solo el primer trozo: el empuje del viento
 * saldría corto justo donde el vano es largo, y nada avisaría.
 */
function vanosEntreEstructuras(E, geo) {
  const vanos = [];
  for (let i = 1; i < E.length; i++) {
    const declarado = positivo(E[i]?.vanoAnterior_m);
    if (declarado !== null) { vanos.push(declarado); continue; }
    const p = geo[i - 1], q = geo[i];
    vanos.push(hayCoordenada(geo)(i - 1) && hayCoordenada(geo)(i)
      ? vincenty(p.lat, p.lon, q.lat, q.lon).d
      : null);
  }
  return vanos;
}

/**
 * Carga de viento por metro de conductor, con la presión dinámica a la vista.
 *
 * La presión se devuelve aparte (`presion_Pa`) porque es lo que hace auditable
 * la memoria de cálculo: con la velocidad y la densidad de la hipótesis, un
 * revisor rehace ½·ρ·v² con una calculadora y comprueba el resto.
 */
function vientoDeLaHipotesis(conductor, hipotesis) {
  const d = positivo(conductor?.diametro ?? conductor?.diametro_m);
  const v = noNegativo(hipotesis?.vViento ?? hipotesis?.vientoMax_kmh);
  const cx = positivo(hipotesis?.cx) ?? 1.0;
  const rho = positivo(hipotesis?.rho ?? hipotesis?.densidadAire_kg_m3) ?? 1.2;

  if (d === null || v === null) {
    return {
      presion_Pa: v === null ? null : presionDinamica(v, rho),
      carga_kg_m: null,
      motivo: d === null
        ? 'el conductor no declara diámetro (en metros): sin él no hay área expuesta y no se puede calcular el empuje del viento'
        : 'la hipótesis no declara velocidad de viento de diseño: el empuje no se supone, se declara',
    };
  }
  return {
    presion_Pa: presionDinamica(v, rho),
    carga_kg_m: cargaViento(d, v, { cx, rho }),
    motivo: null,
  };
}

/**
 * Cuántos conductores carga cada apoyo.
 *
 * Si viene declarado, se usa. Si solo hay `circuitos`, se toman 3 por circuito
 * —que es la definición de un circuito trifásico, no una suposición— pero se
 * DECLARA que los cables de guarda no están contados: cada guarda añade su
 * propio empuje de viento y su propia componente de quiebre, y olvidarlos deja
 * la carga corta justo en los apoyos más cargados.
 */
function conductoresDeLaLinea(hipotesis, conductor) {
  const declarado = enteroPositivo(hipotesis?.nConductores ?? conductor?.nConductores);
  if (declarado !== null) return { valor: declarado, nota: null, motivo: null };

  const circuitos = enteroPositivo(hipotesis?.circuitos);
  if (circuitos !== null) {
    return {
      valor: 3 * circuitos,
      nota: `Se cuentan ${3 * circuitos} conductores (3 fases × ${circuitos} circuito(s)). Los cables de guarda NO están contados: cada uno suma su propio empuje de viento y su propia componente de quiebre. Declarar \`nConductores\` para incluirlos.`,
      motivo: null,
    };
  }
  return {
    valor: null,
    nota: null,
    motivo: 'no se declaró `nConductores` ni `circuitos`: el número de conductores multiplica toda la carga y no se adivina',
  };
}

/**
 * Reparte los tiros de cada tramo entre los apoyos que ese tramo sostiene.
 *
 * ⚠️ Si el reparto no cuadra exactamente con las estructuras recibidas, NO se
 * reparte nada. Un desfase de un apoyo le atribuiría a una estructura el tiro
 * de otro tramo: un número creíble, con unidades correctas, y equivocado — la
 * peor clase de error, porque no se ve.
 */
function repartirTirosPorApoyo(E, tramos) {
  const vacio = E.map(() => null);
  const lista = Array.isArray(tramos) ? tramos : [];
  if (!lista.length) return vacio;

  const cuentas = lista.map((t) => t?.vanos?.length ?? t?.nVanos);
  if (!cuentas.every((c) => Number.isInteger(c) && c > 0)) return vacio;
  if (cuentas.reduce((s, c) => s + c, 0) !== E.length - 1) return vacio;

  const porApoyo = E.map(() => ({ tramos_n: [], tiros: [], estados: [] }));
  let ini = 0;
  lista.forEach((t, k) => {
    const fin = ini + cuentas[k];
    const e = tirosDelTramo(t);
    for (let j = ini; j <= fin; j++) {
      porApoyo[j].tramos_n.push(k + 1);
      porApoyo[j].tiros.push(e.maximo);
      porApoyo[j].estados.push(e);
    }
    ini = fin;
  });

  return porApoyo.map((p) => {
    const conViento = maxNoNulo(p.estados.map((e) => e.conViento));
    const maximo = maxNoNulo(p.tiros);
    const validos = p.tiros.filter((x) => x !== null);
    return {
      tramos_n: p.tramos_n,
      conViento,
      estadoConViento: p.estados.find((e) => e.conViento !== null)?.estadoConViento ?? null,
      maximo,
      estadoMaximo: p.estados.find((e) => e.maximo === maximo)?.estadoMaximo ?? null,
      // Dos tramos que tiran distinto del mismo apoyo: la fórmula del quiebre
      // supone tiros iguales, así que el resultado deja de ser exacto.
      mixto: validos.length > 1 && Math.abs(validos[0] - validos[1]) > 1e-6,
      tiros: validos,
    };
  });
}

/**
 * Tiros de un tramo, normalizados. Se aceptan las tres formas que ya existen en
 * el sistema para no obligar a nadie a traducir antes de llamar (la misma
 * cortesía que hace umbrales.js):
 *   · `tramo.estados`    tal cual lo devuelve `estadosDelTramo()` — {viento:{H,nombre},…}
 *   · `tramo.tiros_kgf`  los mismos estados ya aplanados a número
 *   · `tramo.hViento` / `tramo.pico`  la forma que arma la vista de tramos
 */
function tirosDelTramo(t) {
  let conViento = null, estadoConViento = null;
  let maximo = null, estadoMaximo = null;

  const anota = (H, nombre) => {
    const v = positivo(H);
    if (v === null) return;
    if (maximo === null || v > maximo) { maximo = v; estadoMaximo = nombre; }
  };

  if (t?.estados && typeof t.estados === 'object') {
    for (const [clave, e] of Object.entries(t.estados)) {
      const nombre = e?.nombre ?? clave;
      anota(e?.H, nombre);
      if (clave === 'viento') { conViento = positivo(e?.H); estadoConViento = nombre; }
    }
  } else if (t?.tiros_kgf && typeof t.tiros_kgf === 'object') {
    for (const [clave, H] of Object.entries(t.tiros_kgf)) {
      anota(H, clave);
      if (clave === 'viento') { conViento = positivo(H); estadoConViento = clave; }
    }
  } else {
    anota(t?.hEds, 'EDS / cada día');
    anota(t?.hTMax, 'Máxima temperatura');
    anota(t?.hViento, 'Máximo viento');
    anota(t?.hTMin, 'Mínima temperatura');
    anota(t?.pico ?? t?.tiroPico_kgf, 'pico declarado');
    conViento = positivo(t?.hViento);
    if (conViento !== null) estadoConViento = 'Máximo viento';
  }

  return { conViento, estadoConViento, maximo, estadoMaximo };
}

const maxNoNulo = (xs) => {
  const v = xs.filter((x) => x !== null && x !== undefined);
  return v.length ? Math.max(...v) : null;
};

/**
 * Qué le falta a este apoyo para poder ser dictaminado, en forma de LISTA — no
 * de frase.
 *
 * POR QUÉ EXISTE SEPARADO DE LA PROSA, y no es un capricho: el informe imprimía
 * «Ningún apoyo declara su capacidad» cuando NINGUNA FILA TENÍA VEREDICTO. Son
 * dos cosas distintas. Un apoyo puede declarar su carga de rotura y seguir sin
 * veredicto porque le falta la altura libre — y entonces esa frase es falsa en
 * un papel firmado. Como el único sitio donde se sabía qué faltaba era una
 * cadena de texto, el informe no tenía más remedio que deducirlo mal.
 *
 * Ahora el hecho se publica contable: quien quiera decir «X de Y declaran su
 * carga de rotura» puede contarlo, en vez de inferirlo de otra cosa.
 */
function faltaParaVeredicto(a) {
  const faltantes = [];
  if (positivo(a?.cargaRotura_kgf) === null) faltantes.push('carga de rotura del apoyo');
  if (positivo(a?.alturaLibre_m) === null) faltantes.push('altura libre sobre el terreno');
  if (positivo(a?.alturaAplicacion_m) === null) faltantes.push('altura del punto de sujeción');
  return faltantes;
}

/**
 * Por qué esta fila no tiene utilización. Se distingue el caso «no hay carga que
 * comparar» del caso «no hay capacidad declarada»: el primero se arregla con
 * datos de cálculo, el segundo solo con el inventario del apoyo.
 */
function avisoDeCapacidad(a, ftTotal_kgf) {
  if (ftTotal_kgf === null) {
    return 'Sin utilización: primero falta la carga total (ver el motivo de no evaluable).';
  }
  const faltantes = faltaParaVeredicto(a);

  // No falta nada y aun así no hubo resultado: los datos se contradicen entre
  // sí. Se dice cuál es la contradicción, porque se corrige en el inventario.
  if (!faltantes.length) {
    return `Sin utilización: el punto de sujeción (${f(a?.alturaAplicacion_m, 2)} m) queda por encima de la punta del apoyo (${f(a?.alturaLibre_m, 2)} m). Con esa geometría el cálculo del momento no significa nada; hay que corregir el dato.`;
  }

  const extra = positivo(a?.altura_m) !== null && positivo(a?.alturaLibre_m) === null
    ? ' Hay `altura_m` (longitud total del poste), pero la altura LIBRE depende del empotramiento, que no se ve desde un escritorio: no se deduce.'
    : '';

  return `Sin utilización: falta ${faltantes.join(', ')}. No se estima —un apoyo que “cumple” contra una capacidad supuesta es un informe firmado sobre una suposición.${extra}`;
}
