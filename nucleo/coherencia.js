// ============================================================================
// nucleo/coherencia.js — los criterios de coherencia que se perdieron al migrar
// ----------------------------------------------------------------------------
// El módulo de campo original no solo calculaba: además CONTRASTABA lo que el
// ingeniero había DECLARADO contra lo que la geometría y las medidas DICEN. Ese
// contraste no llegó al sistema nuevo, y es justo la parte que ahorra viajes:
// un apoyo mal clasificado no se ve en ninguna pantalla — se ve el día que falla.
//
// Aquí viven los tres contrastes:
//   1. función estructural declarada  vs  deflexión medida
//   2. aislamiento instalado          vs  contaminación del sitio
//   3. puesta a tierra                vs  el umbral de diseño
//
// Funciones PURAS: sin DOM, sin red, sin contratos. Entran datos, salen avisos.
//
// ⚠️ NADA de aquí es un dictamen; son AVISOS: dicen dónde mirar. El veredicto
// sale del valor contra la norma y lo firma el Ingeniero (CLAUDE.md §4). Por eso
// cada aviso viaja con su `criterio` escrito al lado: quien lo lea sabe contra
// qué se comparó sin tener que abrir el código.
//
// ⚠️ NO se inventa. Si falta un dato, la función lo DECLARA —`null`, o un aviso
// «no evaluable»— en vez de rellenarlo con un supuesto. Un hueco visible se
// corrige en campo; un hueco tapado con un valor por defecto se firma.
// ============================================================================

/**
 * @typedef {Object} Aviso
 * @property {string} apoyo       nombre visible del apoyo (para pantalla e informe)
 * @property {'critica'|'advertencia'|'info'} severidad
 * @property {string} mensaje     qué pasa y qué consecuencia tiene, en castellano
 * @property {string} criterio    contra qué se comparó, declarado sin ambigüedad
 * @property {string} clase       etiqueta estable para agrupar/filtrar sin leer prosa
 */

// Campo ADITIVO: el contrato del aviso son los cuatro primeros. `clase` se añade
// para que la interfaz filtre por identificador y no por subcadenas del mensaje
// (un mensaje se reescribe cualquier día; un filtro roto por eso no se nota).

/** Orden de presentación: primero lo que puede tumbar la línea. */
const ORDEN_SEVERIDAD = { critica: 0, advertencia: 1, info: 2 };
const porSeveridad = (a, b) => ORDEN_SEVERIDAD[a.severidad] - ORDEN_SEVERIDAD[b.severidad];

/**
 * Nombre visible. `nombre` es lo que trae este módulo; los otros dos son la
 * pareja canónico/campo del resto del sistema. Si no hay ninguno, se numera —
 * un aviso sin apoyo identificable es un aviso inútil.
 */
const nombreDe = (a, i) =>
  a?.nombre ?? a?.nombreNormalizado ?? a?.nombreCampo ?? `apoyo #${i + 1}`;

/**
 * ⚠️ El mismo filtro que gobierna todo el cálculo (contratos/activos.ts,
 * docs/40 §10): un EMPALME no es un apoyo. No tiene función estructural que
 * contrastar ni puesta a tierra que medir. Si no se filtra, cada empalme de la
 * línea genera un «sin medir» falso y el listado de avisos deja de leerse.
 *
 * Cuando el campo no viene, se asume `Estructura` — que es el defecto del
 * contrato, y evita que un consumidor que solo pasa {nombre, ...} pierda avisos.
 */
const soloEstructuras = (apoyos) =>
  (Array.isArray(apoyos) ? apoyos : []).filter(
    (a) => (a?.tipoPunto ?? 'Estructura') === 'Estructura',
  );

// ════════════════════════════════════════════════════════════════════════════
// 1 · FUNCIÓN ESTRUCTURAL DECLARADA  vs  DEFLEXIÓN MEDIDA
// ════════════════════════════════════════════════════════════════════════════

/**
 * CRITERIO DE DISEÑO — **no es una norma citada**.
 *
 * Es el criterio del módulo de campo original, conservado tal cual (docs/40
 * §8.2): <3° suspensión · <15° suspensión angular · <30° ángulo · ≥30°
 * retención. Con él se dedujeron las funciones de las 26 estructuras de la
 * línea piloto, y reprodujo el análisis de falla que ya existía.
 *
 * Se declara aquí, en un solo sitio y con nombre, para que nadie lo confunda
 * con un requisito normativo ni lo cambie por descuido: mover estos números
 * mueve dónde se corta cada tramo de tensión, y con ello TODO el cálculo
 * mecánico de la línea.
 *
 * La frontera es INCLUSIVA HACIA ARRIBA: exactamente 3,0° ya pide suspensión
 * angular. Es la lectura literal de «<3° suspensión».
 */
const BANDAS_DEFLEXION = Object.freeze([
  { hasta: 3,        exige: 0, minima: 'Suspensión',          rango: 'por debajo de 3°',  loQuePide: 'basta una Suspensión' },
  { hasta: 15,       exige: 1, minima: 'Suspensión angular',  rango: 'entre 3° y 15°',    loQuePide: 'conviene una Suspensión angular' },
  { hasta: 30,       exige: 2, minima: 'Ángulo',              rango: 'entre 15° y 30°',   loQuePide: 'debería ser Ángulo o Retención / anclaje' },
  { hasta: Infinity, exige: 3, minima: 'Retención / anclaje', rango: 'por encima de 30°', loQuePide: 'la Retención / anclaje es obligada' },
]);

const CRITERIO_DEFLEXION =
  'CRITERIO DE DISEÑO (sin norma citada), heredado del módulo de campo original ' +
  'y registrado en docs/40 §8.2: <3° suspensión · <15° suspensión angular · ' +
  '<30° ángulo · ≥30° retención.';

/**
 * Cuánta deflexión aguanta cada función, ordenadas de menor a mayor capacidad.
 *
 * `Terminal` y `Derivación` anclan igual que una retención, pero su razón de
 * ser es TOPOLÓGICA (fin de línea, salida de una derivación), no geométrica:
 * un terminal a 0° de deflexión es lo normal, no un sobrecosto. Por eso están
 * en la lista de justificadas y jamás se reportan como sobredimensionadas.
 *
 * ⚠️ Los nombres deben coincidir con `FuncionEstructural` de contratos/. El
 * núcleo no importa el contrato (sería dejar de ser puro), así que la
 * coincidencia la vigila la prueba de oro, no la memoria — igual que
 * `FUNCIONES_ANCLA` en mecanica.js.
 */
const CAPACIDAD_ANGULAR = Object.freeze({
  'Suspensión': 0,
  'Suspensión angular': 1,
  'Ángulo': 2,
  'Retención / anclaje': 3,
  'Terminal': 3,
  'Derivación': 3,
});

/** Funciones cuya presencia la explica la topología, no el ángulo. */
const JUSTIFICADAS_POR_TOPOLOGIA = Object.freeze(['Terminal', 'Derivación']);

/**
 * A partir de este nivel la función ANCLA el conductor y por tanto CORTA el
 * tramo de tensión (la misma frontera que `FUNCIONES_ANCLA` en mecanica.js).
 *
 * Es el umbral que decide qué se reporta como sobrecosto, y la razón es que el
 * criterio no es exacto: dice «por debajo de UNOS 3°» y «entre 15° y 30°
 * ángulo O retención». Comparar escalón a escalón contra un criterio aproximado
 * produce avisos que nadie puede accionar — una suspensión angular donde
 * bastaba una suspensión no cuesta prácticamente nada ni corta ningún tramo.
 *
 * Lo que sí es accionable, y lo único que se reporta, es un ANCLAJE que la
 * geometría no pide: ahí hay dinero (herrajes, cadena doble, montaje) y hay un
 * corte de tramo de más, que obliga a una regulación adicional en obra.
 */
const NIVEL_ANCLA = 2;

/** Nivel de la retención: el techo del criterio, y lo único válido sobre 30°. */
const NIVEL_RETENCION = 3;

const bandaDe = (grados) => BANDAS_DEFLEXION.find((b) => grados < b.hasta);

/**
 * Contrasta lo declarado contra lo medido, EN AMBOS SENTIDOS.
 *
 * Hacia abajo (función más floja de lo que pide el ángulo) es riesgo: la cadena
 * de suspensión se descuelga hacia el interior del ángulo por la componente
 * transversal permanente, y —peor— el tramo de tensión NO se corta donde el
 * cálculo cree que se corta, así que el VIR, las flechas y los tiros de ese
 * tramo entero salen de un vano equivalente equivocado.
 *
 * Hacia arriba (se ancla donde la geometría no lo pide) NO es riesgo: es dinero.
 * Herrajes, cadenas dobles y montaje más caro, y un corte de tramo de más que
 * obliga a una regulación adicional en obra. Se reporta como `info` porque un
 * sobrecosto sin riesgo no debe competir en pantalla con un apoyo que se puede
 * caer. Solo se reporta el ANCLAJE sobrante, no cada escalón sobrante: ver
 * `NIVEL_ANCLA` para el porqué.
 *
 * @param {Array<{nombre?: string, funcionEstructural?: string,
 *                deflexion_grados?: number|null, tipoPunto?: string}>} apoyos
 *        en ORDEN de línea (el orden importa: los extremos se tratan aparte)
 * @returns {Aviso[]} ordenados de mayor a menor severidad; vacío si todo cuadra
 */
export function coherenciaFuncionDeflexion(apoyos) {
  const E = soloEstructuras(apoyos);
  /** @type {Aviso[]} */
  const avisos = [];

  E.forEach((a, i) => {
    const apoyo = nombreDe(a, i);
    const esExtremo = i === 0 || i === E.length - 1;
    const d = a?.deflexion_grados;

    // ── Sin deflexión: no se evalúa, no se supone ────────────────────────────
    // En el primer y el último apoyo la deflexión es null POR DEFINICIÓN (no hay
    // vano entrante o saliente; geodesia.deflexion() devuelve null ahí). Avisar
    // en los extremos sería ruido garantizado en toda línea, así que se callan.
    //
    // Consecuencia asumida: si a esta función se le pasa un TRAMO en vez de la
    // línea completa, sus dos apoyos de borde también quedan mudos. Se prefiere
    // el silencio a la falsa alarma: un aviso que sale siempre se aprende a
    // ignorar, y entonces deja de servir el día que importa.
    if (d == null || !Number.isFinite(d)) {
      if (!esExtremo) {
        avisos.push({
          apoyo,
          severidad: 'info',
          mensaje: `${apoyo} no tiene deflexión calculada: su función declarada no se puede contrastar. Falta la coordenada del apoyo anterior o del siguiente.`,
          criterio: CRITERIO_DEFLEXION,
          clase: 'deflexion_no_evaluable',
        });
      }
      return;
    }

    // Una deflexión fuera de [0,180] no existe: el ángulo entre dos rumbos no
    // puede pasar de 180°. Si llega, el dato está corrupto — y contrastar la
    // función contra un número imposible daría un veredicto imposible.
    if (d < 0 || d > 180) {
      avisos.push({
        apoyo,
        severidad: 'advertencia',
        mensaje: `${apoyo} trae una deflexión de ${d}°, imposible: el giro entre dos rumbos vive en [0°, 180°]. Hasta corregir el dato, la coherencia de su función no se puede juzgar.`,
        criterio: CRITERIO_DEFLEXION,
        clase: 'deflexion_no_evaluable',
      });
      return;
    }

    // ── Sin función declarada: tampoco se evalúa ─────────────────────────────
    const funcion = a?.funcionEstructural;
    const capacidad = CAPACIDAD_ANGULAR[funcion];
    if (capacidad === undefined) {
      avisos.push({
        apoyo,
        severidad: 'info',
        mensaje: funcion
          ? `${apoyo} declara la función «${funcion}», que no está en el catálogo del sistema: no se puede contrastar con sus ${d.toFixed(1)}° de deflexión.`
          : `${apoyo} no tiene función estructural declarada, y mide ${d.toFixed(1)}° de deflexión. Sin ese campo no hay tramos de tensión ni cálculo mecánico.`,
        criterio: CRITERIO_DEFLEXION,
        clase: 'funcion_no_declarada',
      });
      return;
    }

    const banda = bandaDe(d);

    // ── Hacia abajo: la función no da para el ángulo que hay ─────────────────
    if (capacidad < banda.exige) {
      const deficit = banda.exige - capacidad;
      // Por encima de 30° la retención es obligada por el criterio: quedarse
      // corto ahí es crítico aunque falte un solo escalón. Fuera de esa banda,
      // un escalón se advierte y dos o más son críticos.
      const severidad =
        banda.exige === NIVEL_RETENCION || deficit >= 2 ? 'critica' : 'advertencia';
      avisos.push({
        apoyo,
        severidad,
        mensaje:
          `${apoyo} está declarado «${funcion}» y mide ${d.toFixed(1)}° de deflexión: ${banda.rango}, ${banda.loQuePide}. ` +
          'Dos consecuencias: la cadena trabaja con carga transversal permanente hacia el interior del ángulo, y el tramo de tensión no se corta donde el cálculo supone — el VIR, las flechas y los tiros de ese tramo salen de un vano equivalente que no es el real.',
        criterio: CRITERIO_DEFLEXION,
        clase: 'funcion_insuficiente',
      });
      return;
    }

    // ── Hacia arriba: la línea ancla donde la geometría no lo pide ───────────
    // Nótese que entre 15° y 30° una retención NO se reporta: el criterio dice
    // literalmente «ángulo o retención», así que ahí la retención es una de las
    // dos respuestas correctas, no un exceso.
    const anclaSinNecesidad = capacidad >= NIVEL_ANCLA && banda.exige < NIVEL_ANCLA;
    if (anclaSinNecesidad && !JUSTIFICADAS_POR_TOPOLOGIA.includes(funcion)) {
      avisos.push({
        apoyo,
        severidad: 'info',
        mensaje:
          `${apoyo} está declarado «${funcion}» y solo mide ${d.toFixed(1)}° de deflexión: ${banda.rango}, ${banda.loQuePide}. ` +
          'No es un riesgo, es un sobrecosto: herrajes y cadenas más caros, montaje más lento y un corte de tramo de tensión de más, con la regulación adicional que eso obliga en obra. Verificar si responde a algo que la geometría no ve (un cruce, una transposición, una derivación futura).',
        criterio: CRITERIO_DEFLEXION,
        clase: 'funcion_sobredimensionada',
      });
    }
  });

  return avisos.sort(porSeveridad);
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · AISLAMIENTO INSTALADO  vs  CONTAMINACIÓN DEL SITIO
// ════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️⚠️ TABLA DE NORMA — **VERIFICAR CONTRA EL TEXTO DE LA IEC ANTES DE FIRMAR**.
 *
 * Fuente: IEC TS 60815 (guía para la selección de aisladores bajo condiciones de
 * contaminación), distancia de fuga específica unificada de referencia (RUSCD)
 * por clase de severidad del sitio, en mm/kV **referidos a la tensión FASE-TIERRA**.
 *
 * Estos cinco números están transcritos, NO verificados contra el documento
 * oficial en este repositorio: la norma es de pago y no hay copia auditable
 * aquí. Mientras esa verificación no exista, el resultado de este módulo es un
 * INDICADOR para decidir dónde mirar, nunca la evidencia que respalda una firma
 * (CLAUDE.md §3.2: las cifras de norma no se citan de memoria).
 *
 * La correspondencia clase IEC ↔ nivel declarado en el sistema:
 *   a) Very light → 'Muy ligero'   d) Heavy      → 'Fuerte'
 *   b) Light      → 'Ligero'       e) Very heavy → 'Muy fuerte'
 *   c) Medium     → 'Medio'
 */
const RUSCD_FASE_TIERRA_MM_KV = Object.freeze({
  'Muy ligero': 22.0,
  'Ligero': 27.8,
  'Medio': 34.7,
  'Fuerte': 43.3,
  'Muy fuerte': 53.7,
});

const RAIZ3 = Math.sqrt(3);

/**
 * ⚠️ LA TRAMPA DE ESTE CÁLCULO: la base de tensión.
 *
 * La RUSCD de la IEC va referida a la tensión FASE-TIERRA (Um/√3). La fuga
 * específica que usa la práctica de línea —y la que pide este módulo— se
 * calcula sobre Um, que es una tensión FASE-FASE (66 kV, 115 kV, 230 kV son
 * fase-fase). Comparar una contra otra sin convertir mete un factor √3 = 1,73.
 *
 * SÍNTOMA cuando se olvida: **todas** las cadenas de la línea salen reprobadas
 * a la vez, y por un margen sospechosamente parecido (~42 % de déficit). Cuando
 * el 100 % de un parque incumple de golpe, el error casi siempre está en la
 * base de comparación, no en el parque.
 *
 * Por eso la tabla exigida se DERIVA dividiendo entre √3 en vez de escribirse a
 * mano: la conversión queda a la vista y no se puede perder en una copia.
 */
const EXIGIDO_FASE_FASE_MM_KV = Object.freeze(
  Object.fromEntries(
    Object.entries(RUSCD_FASE_TIERRA_MM_KV).map(([nivel, ruscd]) => [nivel, ruscd / RAIZ3]),
  ),
);

const CRITERIO_FUGA =
  'IEC TS 60815 — distancia de fuga específica de referencia por nivel de ' +
  'contaminación, convertida a base FASE-FASE (÷√3) para compararla con Um. ' +
  'VALORES TRANSCRITOS, NO VERIFICADOS CONTRA EL TEXTO DE LA NORMA: ' +
  'comprobar antes de firmar.';

const positivo = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0;

/**
 * Fuga específica de una cadena de aisladores y si alcanza para el sitio.
 *
 * fuga total (mm) = unidades × fuga por unidad
 * fuga específica (mm/kV) = fuga total / Um
 *
 * En la costa Caribe la salinidad empuja el nivel de contaminación hacia arriba,
 * y una cadena dimensionada para zona limpia no falla por rotura: falla por
 * CONTORNEO en la primera brisa con niebla salina. Es una falla que no deja
 * rastro visible en la inspección diurna, y por eso el contraste tiene que ser
 * automático.
 *
 * @param {{unidades?: number, fugaPorUnidad_mm?: number,
 *          tensionMaxima_kV?: number, nivelContaminacion?: string}} entrada
 *        (en el contrato estos datos viven en `apoyo.aislamiento`:
 *         `unidadesPorCadena` → `unidades`, y `tensionMaxima_kV` es de la línea)
 * @returns {null | {fugaTotal_mm: number, especifica_mm_kV: number,
 *                   exigido_mm_kV: number, cumple: boolean}}
 *          **null si falta cualquier dato**: sin las cuatro entradas no hay
 *          resultado que dar, y un cero o un valor por defecto aquí se
 *          convertiría en un «cumple» inventado.
 */
export function fugaEspecifica(entrada) {
  const { unidades, fugaPorUnidad_mm, tensionMaxima_kV, nivelContaminacion } = entrada ?? {};

  if (!positivo(unidades) || !positivo(fugaPorUnidad_mm) || !positivo(tensionMaxima_kV)) return null;

  // Un nivel fuera de la tabla no se aproxima al más parecido: se declara que no
  // se puede evaluar. Aproximar «Medio-alto» a «Medio» es exactamente la clase
  // de suposición silenciosa que después nadie encuentra.
  const exigido_mm_kV = EXIGIDO_FASE_FASE_MM_KV[nivelContaminacion];
  if (exigido_mm_kV === undefined) return null;

  const fugaTotal_mm = unidades * fugaPorUnidad_mm;
  const especifica_mm_kV = fugaTotal_mm / tensionMaxima_kV;

  return {
    fugaTotal_mm,
    especifica_mm_kV,
    exigido_mm_kV,
    // El empate cuenta como cumple, pero cumplir por décimas no es cumplir con
    // margen: el envejecimiento del vidrio y el depósito salino solo restan.
    cumple: especifica_mm_kV >= exigido_mm_kV,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · PUESTA A TIERRA  vs  UMBRAL DE DISEÑO
// ════════════════════════════════════════════════════════════════════════════

/**
 * La resistencia de puesta a tierra del apoyo es lo que decide si una descarga
 * atmosférica se drena al terreno o eleva el potencial de la estructura hasta
 * cebar el arco DESDE la torre HACIA el conductor (flameo inverso). Una línea
 * con salidas repetidas en época de rayos y sin explicación mecánica casi
 * siempre tiene aquí su causa.
 *
 * El umbral por defecto (10 Ω) es un CRITERIO DE DISEÑO habitual, **no una
 * cifra de norma verificada en este repositorio**: por eso es un parámetro y no
 * una constante escondida. El valor real lo fija la hipótesis del proyecto.
 *
 * Un apoyo SIN MEDICIÓN no es un apoyo que cumple: es un apoyo del que no se
 * sabe nada. Se reporta, porque el hueco de evidencia es el hallazgo.
 *
 * @param {Array<{nombre?: string, tipoPunto?: string,
 *                puestaTierra?: {resistencia_ohm?: number},
 *                resistencia_ohm?: number}>} apoyos
 * @param {number} [umbral_ohm=10]
 * @returns {Aviso[]} ordenados de mayor a menor severidad
 */
export function avisoPuestaTierra(apoyos, umbral_ohm = 10) {
  const E = soloEstructuras(apoyos);
  const criterio =
    `CRITERIO DE DISEÑO (sin norma citada): resistencia de puesta a tierra ≤ ${umbral_ohm} Ω. ` +
    'Umbral configurable — el valor firme lo fija la hipótesis del proyecto.';

  /** @type {Aviso[]} */
  const avisos = [];

  E.forEach((a, i) => {
    const apoyo = nombreDe(a, i);
    // Se acepta la forma anidada del contrato (`puestaTierra.resistencia_ohm`) y
    // la plana que usan los exportes y las vistas. Leer solo una de las dos
    // produce el peor fallo posible aquí: silencio — la línea entera aparecería
    // como «sin medir» aunque estuviera medida punto por punto.
    const r = a?.puestaTierra?.resistencia_ohm ?? a?.resistencia_ohm;

    if (typeof r !== 'number' || !Number.isFinite(r)) {
      avisos.push({
        apoyo,
        severidad: 'advertencia',
        mensaje: `${apoyo} no tiene medición de resistencia de puesta a tierra. No es que cumpla: es que no se sabe. Sin ese valor no se puede sustentar el comportamiento de la línea ante descargas atmosféricas.`,
        criterio,
        clase: 'sin_medir',
      });
      return;
    }

    // El empate (r === umbral) se considera cumplimiento: el criterio se escribe
    // «≤ umbral». Si algún día se quiere margen, se sube el umbral — no se
    // cambia la comparación en silencio.
    if (r > umbral_ohm) {
      avisos.push({
        apoyo,
        severidad: 'critica',
        mensaje: `${apoyo} mide ${r} Ω de puesta a tierra, por encima del umbral de ${umbral_ohm} Ω (${(r / umbral_ohm).toFixed(1)}× el criterio). Ante una descarga, el potencial de la estructura sube lo suficiente para cebar el arco desde la torre hacia el conductor: es salida de línea, no daño visible.`,
        criterio,
        clase: 'excede',
      });
    }
  });

  return avisos.sort(porSeveridad);
}
