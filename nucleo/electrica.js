// ============================================================================
// nucleo/electrica.js — las variables OPERATIVAS de una línea, derivadas
// ----------------------------------------------------------------------------
// Funciones PURAS. Sin DOM, sin red, sin base. Ver `docs/40 §4`.
//
// QUÉ HACE ESTE FICHERO Y POR QUÉ ESTÁ APARTE. `cargabilidad.js` sabe LEER un
// archivo de operación y `termica.js` sabe cuánta corriente AGUANTA el conductor.
// Lo que faltaba es la aritmética de en medio: qué transporta esa corriente, qué
// desequilibrio hay entre fases, qué se pierde por el camino y cómo se comporta
// en el tiempo. Son derivaciones de un punto de operación, no de un archivo ni
// de un conductor, y por eso tienen dueño propio (`99 §ADR-094`).
//
// ⚠️ LA REGLA QUE GOBIERNA TODO EL FICHERO — orden del Ingeniero, 2026-09-01:
// **«no suponer nada, no colocar información basura».**
//
// De ahí salen tres disciplinas que no se negocian:
//
//   1. **NINGUNA función inventa un ingrediente que falta.** Ni un factor de
//      potencia típico, ni una tensión por defecto, ni un cero que se lea como
//      medida. Cuando falta algo se devuelve `null` CON MOTIVO en texto, igual
//      que hacen `contrasteConLaAmpacidad` y `ampacidadDeLinea`.
//   2. **TODO valor derivado declara de qué salió.** Un MVA calculado con la
//      tensión NOMINAL no es el mismo hecho que uno calculado con la tensión
//      MEDIDA, y el que lo lea tiene derecho a saber cuál está mirando.
//   3. **Lo que no se puede saber, se dice que no se puede.** El caso duro es la
//      corriente residual: con las tres MAGNITUDES no se calcula: hacen falta
//      los ángulos. Aquí se rechaza en vez de publicar una suma que se leería
//      como un residual y mandaría a buscar una falla a tierra que no existe.
// ============================================================================

/** Redondeo estable. `null` para lo que no es número, nunca 0. */
const r = (v, n = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** n) / 10 ** n);

const RAIZ3 = Math.sqrt(3);

/** Los números finitos de una lista, con su nombre. El resto se descarta. */
function medidas(fases) {
  return Object.entries(fases ?? {})
    .filter(([, v]) => Number.isFinite(v))
    .map(([nombre, valor]) => ({ nombre, valor }));
}

// ════════════════════════════════════════════════════════════════════════════
// 1 · LAS TRES FASES: DESBALANCE Y RESIDUAL
// ════════════════════════════════════════════════════════════════════════════

/**
 * EL DESBALANCE ENTRE FASES.
 *
 * ⚠️ POR QUÉ IMPORTA, y no es un dato de adorno. El veredicto térmico lo decide
 * **la fase más cargada**, porque el conductor que primero llega a su límite es
 * el que descuelga y el que fija el gálibo. Promediar las tres esconde justo la
 * que está peor: una fase al límite y dos flojas dan un promedio tranquilo.
 * Este número es lo que permite decir CUÁNTO esconde ese promedio.
 *
 * ⚠️ Y un desbalance que CRECE con el tiempo no suele ser carga: suele ser una
 * conexión que se degrada o un reparto que se torció. Por eso se devuelve
 * también el promedio y la peor fase, para poder seguirlo.
 *
 * Definición (la de NEMA, la habitual en operación): la mayor desviación
 * respecto al promedio, dividida por el promedio.
 *
 * @param {Record<string, number|null|undefined>} fases  p. ej. `{R: 480, S: 495, T: 502}`
 * @returns {{desbalance_pct: number|null, promedio_A: number|null, maxima_A: number|null,
 *            minima_A: number|null, faseMaxima: string|null, faseMinima: string|null,
 *            n: number, motivo: string|null}}
 */
export function desbalanceDeFases(fases) {
  const m = medidas(fases);
  const base = {
    desbalance_pct: null, promedio_A: null, maxima_A: null, minima_A: null,
    faseMaxima: null, faseMinima: null, n: m.length, motivo: null,
  };
  if (m.length < 2) {
    return { ...base, motivo: m.length === 1
      ? 'solo llega una fase: el desbalance necesita al menos dos'
      : 'no llega ninguna corriente por fase' };
  }
  const suma = m.reduce((a, x) => a + x.valor, 0);
  const promedio = suma / m.length;
  if (promedio <= 0) {
    return { ...base, motivo: 'el promedio de las fases es cero: no hay desbalance que medir' };
  }
  const alta = m.reduce((a, b) => (b.valor > a.valor ? b : a));
  const baja = m.reduce((a, b) => (b.valor < a.valor ? b : a));
  const desviacion = Math.max(alta.valor - promedio, promedio - baja.valor);

  return {
    desbalance_pct: r((desviacion / promedio) * 100),
    promedio_A: r(promedio, 1),
    maxima_A: r(alta.valor, 1),
    minima_A: r(baja.valor, 1),
    faseMaxima: alta.nombre,
    faseMinima: baja.nombre,
    n: m.length,
    // Con dos fases el número sale, pero describe otra cosa: se dice.
    motivo: m.length < 3 ? `calculado con ${m.length} fases de 3: es parcial` : null,
  };
}

/**
 * LA CORRIENTE RESIDUAL — y por qué casi siempre se NIEGA a calcularla.
 *
 * ⚠️ ESTA FUNCIÓN EXISTE SOBRE TODO PARA DECIR QUE NO. La residual es la suma
 * **fasorial** de las tres corrientes, y con solo las magnitudes no se puede
 * obtener: hacen falta los ángulos. Sumar los módulos daría un número enorme y
 * sin sentido; restarlos daría otro. Cualquiera de los dos se leería como «hay
 * corriente a tierra» y mandaría una cuadrilla a buscar una falla que no existe.
 *
 * Es exactamente el tipo de basura que el Ingeniero prohibió: un número con cara
 * de medida que nadie midió. Así que sin ángulos se devuelve `null` con su
 * motivo, y punto.
 *
 * @param {Record<string, number>} magnitudes  las tres corrientes, en A
 * @param {Record<string, number>|null} [angulos]  los tres ángulos, en grados
 * @returns {{residual_A: number|null, comparable: boolean, porQue: string|null}}
 */
export function residualDeFases(magnitudes, angulos = null) {
  const m = medidas(magnitudes);
  if (m.length < 3) {
    return { residual_A: null, comparable: false,
      porQue: `llegan ${m.length} fases de 3: la residual necesita las tres` };
  }
  const a = medidas(angulos);
  if (a.length < 3) {
    return {
      residual_A: null, comparable: false,
      porQue: 'la residual es la suma FASORIAL de las tres corrientes y el archivo solo trae '
        + 'las magnitudes. Sin los ángulos no se puede calcular, y sumar los módulos daría un '
        + 'número que se leería como corriente a tierra sin serlo. Pídale al SCADA el ángulo de '
        + 'cada fase, o la corriente de neutro medida',
    };
  }
  let re = 0; let im = 0;
  for (const { nombre, valor } of m) {
    const g = (angulos[nombre] ?? 0) * Math.PI / 180;
    re += valor * Math.cos(g);
    im += valor * Math.sin(g);
  }
  return { residual_A: r(Math.hypot(re, im), 1), comparable: true, porQue: null };
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · QUÉ TRANSPORTA: ACTIVA, REACTIVA, APARENTE Y FACTOR DE POTENCIA
// ════════════════════════════════════════════════════════════════════════════

/**
 * LAS POTENCIAS DE UN INSTANTE, cada una diciendo de dónde salió.
 *
 * ⚠️ EL HALLAZGO QUE ESTA FUNCIÓN EXISTE PARA DAR. La potencia reactiva no
 * transporta energía, pero **ocupa conductor**: consume amperios, calienta y le
 * come margen a la línea. `corrienteReactiva_A` es cuántos de los amperios que
 * circulan no están haciendo trabajo — y es la única palanca que devuelve
 * capacidad **sin tocar un solo conductor**.
 *
 * ⚠️ LA TENSIÓN: si el archivo trae la medida se usa ésa; si no, se puede usar
 * la NOMINAL, pero entonces `tensionUsada.de` dice `'nominal'` y quien lo lea
 * sabe que el MVA es una estimación de placa, no una medida. **Nunca se inventa
 * una tensión**: sin ninguna de las dos, no hay potencias.
 *
 * @param {{tension_kV?: number|null, tensionNominal_kV?: number|null,
 *          corriente_A?: number|null, potenciaActiva_MW?: number|null,
 *          potenciaReactiva_MVAr?: number|null}} e
 * @returns {{aparente_MVA: number|null, activa_MW: number|null, reactiva_MVAr: number|null,
 *            factorDePotencia: number|null, naturaleza: 'inductiva'|'capacitiva'|'unitaria'|null,
 *            corrienteReactiva_A: number|null, corrienteReactiva_pct: number|null,
 *            tensionUsada: {kV: number|null, de: 'medida'|'nominal'|null},
 *            motivo: string|null}}
 */
export function potenciasDelInstante({
  tension_kV = null, tensionNominal_kV = null, corriente_A = null,
  potenciaActiva_MW = null, potenciaReactiva_MVAr = null } = {}) {

  const medida = Number.isFinite(tension_kV) && tension_kV > 0;
  const nominal = Number.isFinite(tensionNominal_kV) && tensionNominal_kV > 0;
  const V = medida ? tension_kV : nominal ? tensionNominal_kV : null;
  const deV = medida ? 'medida' : nominal ? 'nominal' : null;

  const base = {
    aparente_MVA: null, activa_MW: null, reactiva_MVAr: null,
    factorDePotencia: null, naturaleza: null,
    corrienteReactiva_A: null, corrienteReactiva_pct: null,
    tensionUsada: { kV: r(V, 2), de: deV }, motivo: null,
  };

  const P = Number.isFinite(potenciaActiva_MW) ? potenciaActiva_MW : null;
  const Q = Number.isFinite(potenciaReactiva_MVAr) ? potenciaReactiva_MVAr : null;
  const I = Number.isFinite(corriente_A) && corriente_A >= 0 ? corriente_A : null;

  // La aparente sale por dos caminos, y se prefiere el que use MENOS supuestos:
  // si vienen P y Q, S sale de ellas y no hace falta tensión ninguna.
  let S = null; let deS = null;
  if (P != null && Q != null) { S = Math.hypot(P, Q); deS = 'de P y Q medidas'; }
  else if (V != null && I != null) { S = RAIZ3 * V * I / 1000; deS = `de √3·V·I con tensión ${deV}`; }

  if (S == null) {
    return { ...base, motivo: 'faltan datos: hacen falta P y Q, o bien corriente y una tensión '
      + '(medida o nominal declarada en la línea)' };
  }

  const fp = P != null && S > 0 ? Math.min(1, Math.abs(P) / S) : null;
  // La naturaleza sale del SIGNO de Q, no de su tamaño. Sin Q no se declara:
  // suponer «inductiva porque casi siempre lo es» es exactamente lo prohibido.
  const naturaleza = Q == null ? null : Q > 0 ? 'inductiva' : Q < 0 ? 'capacitiva' : 'unitaria';

  // Cuántos amperios se van en reactiva. Necesita Q y una tensión.
  const Iq = Q != null && V != null ? Math.abs(Q) * 1000 / (RAIZ3 * V) : null;

  return {
    ...base,
    aparente_MVA: r(S, 2),
    activa_MW: r(P, 2),
    reactiva_MVAr: r(Q, 2),
    factorDePotencia: r(fp, 3),
    naturaleza,
    corrienteReactiva_A: r(Iq, 1),
    corrienteReactiva_pct: Iq != null && I != null && I > 0 ? r((Iq / I) * 100, 1) : null,
    motivo: null,
    origenAparente: deS,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · LO QUE CUESTA TRANSPORTAR: PÉRDIDAS POR EFECTO JOULE
// ════════════════════════════════════════════════════════════════════════════

/**
 * LAS PÉRDIDAS 3·I²R DEL TRAMO.
 *
 * ⚠️ LA TEMPERATURA NO SE SUPONE. La resistencia del conductor sube con la
 * temperatura, así que la misma corriente pierde más en un conductor caliente.
 * Quien llame declara a qué temperatura quiere el cálculo y la función lo
 * devuelve **pegado al número**: publicar «282 kW» sin decir a qué temperatura
 * es publicar un número que no se puede comprobar.
 *
 * ⚠️ Y lo que hace accionable esta cifra: **las pérdidas van con el CUADRADO de
 * la corriente**. Si una parte de esa corriente es reactiva —que no hace
 * trabajo— esa parte también se está pagando en kilovatios perdidos.
 *
 * @param {{conductor?: {material?: string, seccion_mm2?: number}|null, corriente_A?: number|null,
 *          longitud_m?: number|null, temperaturaConductor_C?: number|null,
 *          resistenciaDC?: (c: any, T: number) => number}} e
 *   `resistenciaDC` se INYECTA para que este módulo no dependa de `termica.js`:
 *   son dos dueños distintos y encadenarlos ataría el cálculo eléctrico al térmico.
 * @returns {{perdidas_kW: number|null, resistencia_ohm_km: number|null,
 *            resistenciaTramo_ohm: number|null, temperatura_C: number|null,
 *            longitud_m: number|null, motivo: string|null}}
 */
export function perdidasJoule({
  conductor = null, corriente_A = null, longitud_m = null,
  temperaturaConductor_C = null, resistenciaDC = null } = {}) {

  const base = { perdidas_kW: null, resistencia_ohm_km: null, resistenciaTramo_ohm: null,
    temperatura_C: r(temperaturaConductor_C, 1), longitud_m: r(longitud_m, 1), motivo: null };

  const falta = typeof resistenciaDC !== 'function' ? 'no se recibió cómo calcular la resistencia'
    : !conductor ? 'no hay conductor declarado en la línea'
    : !Number.isFinite(conductor.seccion_mm2) ? 'el conductor no declara sección'
    : !Number.isFinite(corriente_A) ? 'no hay corriente en este registro'
    : !Number.isFinite(longitud_m) || longitud_m <= 0 ? 'no se conoce la longitud de la línea'
    : !Number.isFinite(temperaturaConductor_C)
      ? 'no se declaró a qué temperatura del conductor calcular: sin ella la resistencia no se '
        + 'puede fijar, y suponerla cambiaría el resultado hasta un 19 %'
    : null;
  if (falta) return { ...base, motivo: falta };

  const Rm = resistenciaDC(
    { material: conductor.material, seccion: conductor.seccion_mm2 }, temperaturaConductor_C);
  if (!Number.isFinite(Rm) || Rm <= 0) {
    return { ...base, motivo: 'la resistencia no salió: revise el material del conductor' };
  }
  const Rt = Rm * longitud_m;
  return {
    ...base,
    perdidas_kW: r(3 * corriente_A * corriente_A * Rt / 1000, 1),
    resistencia_ohm_km: r(Rm * 1000, 4),
    resistenciaTramo_ohm: r(Rt, 4),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 4 · LA TENSIÓN
// ════════════════════════════════════════════════════════════════════════════

/**
 * DESVIACIÓN DE LA TENSIÓN respecto a la nominal declarada.
 *
 * ⚠️ **NO dictamina.** Devuelve la desviación y nada más: decir si está «dentro
 * de banda» exigiría una banda, y la banda es un criterio que declara el
 * ingeniero. Este proyecto no cita normas de memoria (`30 · L-09`), así que la
 * pantalla enseña la desviación y deja el veredicto sin emitir hasta que haya
 * una banda declarada.
 *
 * ⚠️ Y la razón por la que esto vive en el módulo de cargabilidad: **con la
 * misma potencia, si la tensión baja la corriente sube** — y es la corriente la
 * que calienta. Un hueco de tensión no relaja el veredicto térmico: lo empeora.
 *
 * @returns {{desviacion_pct: number|null, medida_kV: number|null, nominal_kV: number|null,
 *            efectoEnLaCorriente_pct: number|null, motivo: string|null}}
 */
export function desviacionDeTension(medida_kV, nominal_kV) {
  if (!Number.isFinite(medida_kV)) {
    return { desviacion_pct: null, medida_kV: null, nominal_kV: r(nominal_kV, 2),
      efectoEnLaCorriente_pct: null, motivo: 'no hay tensión medida en este registro' };
  }
  if (!Number.isFinite(nominal_kV) || nominal_kV <= 0) {
    return { desviacion_pct: null, medida_kV: r(medida_kV, 2), nominal_kV: null,
      efectoEnLaCorriente_pct: null, motivo: 'la línea no declara tensión nominal' };
  }
  const d = ((medida_kV - nominal_kV) / nominal_kV) * 100;
  return {
    desviacion_pct: r(d),
    medida_kV: r(medida_kV, 2),
    nominal_kV: r(nominal_kV, 2),
    // Para la misma potencia, I es inversamente proporcional a V.
    efectoEnLaCorriente_pct: r((nominal_kV / medida_kV - 1) * 100),
    motivo: null,
  };
}

/** El desbalance entre tensiones de fase. Misma definición que el de corriente. */
export function desbalanceDeTensiones(fases) {
  const d = desbalanceDeFases(fases);
  return { ...d, promedio_kV: d.promedio_A, maxima_kV: d.maxima_A, minima_kV: d.minima_A };
}

// ════════════════════════════════════════════════════════════════════════════
// 5 · CÓMO SE COMPORTA EN EL TIEMPO
// ════════════════════════════════════════════════════════════════════════════

/**
 * FACTOR DE CARGA, HORAS SOBRE UMBRAL Y RAMPA.
 *
 * ⚠️ POR QUÉ NO BASTA EL PICO. Un pico de un minuto y uno de seis horas piden
 * decisiones distintas: el conductor tiene inercia térmica y responde a lo
 * segundo. El factor de carga (promedio ÷ pico) dice si la línea va plana o a
 * picos, y las horas sobre umbral son el riesgo real — no el instante.
 *
 * ⚠️ **Con pocos puntos no se calcula**, igual que hace `tendencia`. Un factor
 * de carga sacado de dos lecturas es una opinión con dos decimales.
 *
 * @param {{corriente_A?: number|null, cargabilidad_pct?: number|null,
 *          fecha?: string, hora?: number|null}[]} registros
 * @param {{minimo?: number}} [opciones]
 * @returns {{factorDeCarga: number|null, pico_A: number|null, promedio_A: number|null,
 *            horasPorBanda: Record<string, number>, rampaMaxima_A_h: number|null,
 *            n: number, suficiente: boolean, porQue: string|null}}
 */
export function comportamientoEnElTiempo(registros, { minimo = 6 } = {}) {
  const conA = (registros ?? []).filter((x) => Number.isFinite(x?.corriente_A));
  const base = {
    factorDeCarga: null, pico_A: null, promedio_A: null,
    horasPorBanda: { normal: 0, elevada: 0, atencion: 0, sobrecarga: 0 },
    rampaMaxima_A_h: null, n: conA.length, suficiente: false, porQue: null,
  };

  // Las horas por banda se cuentan SIEMPRE que haya porcentaje: no dependen de
  // que haya suficientes puntos para una tendencia.
  for (const x of registros ?? []) {
    const p = x?.cargabilidad_pct;
    if (!Number.isFinite(p)) continue;
    base.horasPorBanda[p < 80 ? 'normal' : p < 90 ? 'elevada' : p < 100 ? 'atencion' : 'sobrecarga'] += 1;
  }

  if (conA.length < minimo) {
    return { ...base, porQue: `hay ${conA.length} lecturas con corriente y hacen falta ${minimo}` };
  }

  const valores = conA.map((x) => x.corriente_A);
  const pico = Math.max(...valores);
  const promedio = valores.reduce((a, b) => a + b, 0) / valores.length;

  // La rampa solo entre lecturas CONSECUTIVAS del mismo día y con hora: saltar
  // un hueco de seis horas y llamarlo rampa sería inventarse una pendiente.
  let rampa = null;
  const ordenados = [...conA]
    .filter((x) => Number.isFinite(x.hora))
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || a.hora - b.hora);
  for (let i = 1; i < ordenados.length; i += 1) {
    const a = ordenados[i - 1]; const b = ordenados[i];
    if (a.fecha !== b.fecha || b.hora - a.hora !== 1) continue;
    const d = Math.abs(b.corriente_A - a.corriente_A);
    if (rampa == null || d > rampa) rampa = d;
  }

  return {
    ...base,
    factorDeCarga: pico > 0 ? r(promedio / pico, 3) : null,
    pico_A: r(pico, 1),
    promedio_A: r(promedio, 1),
    rampaMaxima_A_h: r(rampa, 1),
    suficiente: true,
    porQue: rampa == null ? 'no hay dos horas consecutivas del mismo día: la rampa no se calcula' : null,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 6 · QUÉ TRAE EL ARCHIVO — la pieza que impide suponer
// ════════════════════════════════════════════════════════════════════════════

/** Las variables operativas que este sistema sabe leer, y para qué sirve cada una. */
export const VARIABLES = Object.freeze([
  { campo: 'corriente_A', rotulo: 'Corriente', unidad: 'A', desbloquea: 'el veredicto térmico' },
  { campo: 'tension_kV', rotulo: 'Tensión', unidad: 'kV', desbloquea: 'la desviación de tensión y unos MVA medidos' },
  { campo: 'potenciaActiva_MW', rotulo: 'Potencia activa', unidad: 'MW', desbloquea: 'el factor de potencia' },
  { campo: 'potenciaReactiva_MVAr', rotulo: 'Potencia reactiva', unidad: 'MVAr', desbloquea: 'la corriente que se gasta en reactiva' },
  { campo: 'capacidadNominal_A', unidad: 'A', rotulo: 'Capacidad nominal', desbloquea: 'el porcentaje del archivo' },
  { campo: 'cargabilidad_pct', rotulo: 'Cargabilidad', unidad: '%', desbloquea: 'las bandas de lectura' },
]);

/**
 * QUÉ VARIABLES TRAE **ESTA** CARGA, Y CUÁLES NO — Y POR QUÉ NO.
 *
 * ⚠️ ES LA PIEZA MÁS IMPORTANTE DEL FICHERO, y nace de un error mío que el
 * Ingeniero cazó: afirmé que su archivo «no trae la columna de tensión» **sin
 * haberlo comprobado nunca**. Su archivo no está en el repositorio —es dato de
 * cliente y no puede estarlo—, así que nadie sabía qué columnas traía.
 *
 * Por eso **ninguna pantalla puede llevar cableado que una variable falta**: se
 * deriva de aquí, de la carga que se acaba de leer.
 *
 * Y distingue TRES ausencias, porque son tres acciones distintas para él:
 *   · `sin_columna`   — el archivo no la exporta → hay que pedírsela al SCADA.
 *   · `columna_vacia` — la columna viene y no trae valores → el dato existe pero
 *                        no se está registrando.
 *   · `no_reconocida` — hay una cabecera que nadie supo mapear → **es fallo
 *                        nuestro**, y se devuelve el nombre literal para poder
 *                        añadirlo a los sinónimos.
 *
 * @param {Record<string, any>[]} registros  ya normalizados
 * @param {Record<string, string>} [mapeo]   campo → cabecera del archivo
 * @param {string[]} [sinReconocer]          cabeceras que no se supieron mapear
 * @returns {{variable: string, rotulo: string, unidad: string, hay: boolean,
 *            con: number, de: number, porQue: string|null, estado: string,
 *            desbloquea: string}[]}
 */
export function disponibilidadDeVariables(registros, mapeo = {}, sinReconocer = []) {
  const filas = registros ?? [];
  return VARIABLES.map((v) => {
    const con = filas.filter((x) => Number.isFinite(x?.[v.campo])).length;
    const mapeada = Boolean(mapeo?.[v.campo]);
    let estado; let porQue = null;

    if (con > 0) {
      estado = 'hay';
    } else if (mapeada) {
      estado = 'columna_vacia';
      porQue = `la columna «${mapeo[v.campo]}» se mapeó pero ninguna fila trae valor: el dato `
        + 'existe en la exportación y no se está registrando';
    } else {
      estado = 'sin_columna';
      porQue = sinReconocer.length
        ? `este archivo no trae ninguna columna reconocible de ${v.rotulo.toLowerCase()}. Sin `
          + `reconocer quedaron: ${sinReconocer.join(', ')} — si alguna de ésas es la buena, es `
          + 'un fallo nuestro de sinónimos y se puede arreglar'
        : `este archivo no trae columna de ${v.rotulo.toLowerCase()}: hay que pedírsela a quien `
          + 'exporta del SCADA';
    }
    return {
      variable: v.campo, rotulo: v.rotulo, unidad: v.unidad,
      hay: con > 0, con, de: filas.length, estado, porQue, desbloquea: v.desbloquea,
    };
  });
}
