// ============================================================================
// nucleo/cargabilidadAncho.js — leer la exportación de SCADA tal como sale
// ----------------------------------------------------------------------------
// QUÉ ES (`99 §ADR-088`). Un histórico de SCADA no viene como una tabla: viene
// **TRANSPUESTO**. El tiempo va en COLUMNAS y cada magnitud en su propia FILA.
// Así salió el primer archivo real del Ingeniero, «Cargas 22 Jul LN-627.xlsx»:
//
//   fila 1     vacía
//   fila 2     46225 · 46225,0417 · 46225,0833 …   ← los sellos de tiempo
//   fila 3     /Membri1 /66kV · /PROELECT/I R · /MvMoment · 271 · 263 · 259 …
//   fila 4     …/I S… · 268 · 260 · 257 …
//   fila 5     …/I T… · 269 · 260 · 257 …
//
// Comprobado: el serial 46225 es el 2026-07-22 —cuadra con el nombre del
// archivo— y las fracciones son las horas 0 a 23 exactas. Las tres filas son las
// corrientes de las fases R, S y T.
//
// ⚠️ POR QUÉ NO SE ARREGLA CON UNA CABECERA MEJOR. Aquí **no hay cabecera que
// encontrar**. Buscarla mejor no sirve de nada: hay que reconocer la FORMA. Y
// hacerle reescribir la exportación a una plantilla sería trabajo suyo para
// ahorrarme trabajo a mí — el archivo le va a seguir llegando así.
//
// ⚠️ LO QUE ESTE MÓDULO **NO** DECIDE, y son las tres cosas que importan:
//   · **De qué línea es.** El archivo no la nombra: dice la subestación y la
//     bahía. Lo propone la pantalla y lo confirma el Ingeniero.
//   · **Qué señal es qué magnitud.** Se propone leyendo la etiqueta, y se puede
//     corregir. Una señal mal asignada no da error: da una gráfica falsa.
//   · **Cómo se junta lo trifásico.** Tres fases dan tres valores por hora; con
//     cuál se queda la línea es criterio de ingeniería, no del código.
//
// Funciones puras. Entra una matriz de celdas, salen registros.
// ============================================================================

/**
 * ¿Esta celda es un sello de tiempo de Excel?
 *
 * El rango es deliberadamente ancho pero no infinito: de 1954 a 2064. Un serial
 * de Excel no distingue por sí solo de una lectura cualquiera —473 podría ser un
 * amperaje o un día de 1901—, así que lo que decide no es una celda suelta sino
 * que haya VARIAS, en fila, y CRECIENDO. Una fila de amperajes no crece sola.
 */
export const SERIAL_MINIMO = 20000;   // 1954-10-03
export const SERIAL_MAXIMO = 60000;   // 2064-04-23

export function pareceSelloDeTiempo(v) {
  if (v instanceof Date) return !Number.isNaN(v.getTime());
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= SERIAL_MINIMO && n <= SERIAL_MAXIMO;
}

/** El serial de Excel → `{fecha, hora}` de Colombia. Ver `aFecha` del hermano. */
export function instanteDeSerial(v) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const dias = Math.floor(n);
  const resto = n - dias;
  const ms = dias * 86400000 + Date.UTC(1899, 11, 30);
  const fecha = new Date(ms).toISOString().slice(0, 10);
  // Se redondea al minuto antes de sacar la hora: el serial trae 0,041666666664
  // y no 0,0416666666667, y truncar sin más deja las 00:59 en vez de la 01:00.
  const minutos = Math.round(resto * 24 * 60);
  return { fecha, hora: Math.min(23, Math.floor(minutos / 60)) };
}

/**
 * EL EJE DE TIEMPO: qué fila lo lleva y en qué columnas.
 *
 * Gana la fila con MÁS sellos consecutivos y crecientes. «Creciente» es lo que
 * separa un eje de tiempo de una fila de números cualquiera: una hoja de
 * amperajes tiene valores en ese rango solo por casualidad, y no ordenados.
 */
export function encontrarEjeDeTiempo(matriz, { minimo = 3, mirar = 30 } = {}) {
  let mejor = null;
  (matriz ?? []).slice(0, mirar).forEach((celdas, fila) => {
    const columnas = [];
    (celdas ?? []).forEach((v, c) => { if (pareceSelloDeTiempo(v)) columnas.push(c); });
    if (columnas.length < minimo) return;

    const valores = columnas.map((c) => Number(celdas[c]));
    const crece = valores.every((v, i) => i === 0 || v > valores[i - 1]);
    if (!crece) return;

    if (!mejor || columnas.length > mejor.columnas.length) {
      mejor = {
        fila,
        columnas,
        instantes: columnas.map((c) => instanteDeSerial(celdas[c])),
        /** Dónde empiezan los datos: todo lo de antes es etiqueta de la señal. */
        primeraColumna: columnas[0],
      };
    }
  });
  return mejor;
}

/**
 * LAS SEÑALES: una por fila, con su etiqueta y sus valores alineados al eje.
 *
 * La etiqueta es TODO lo que hay antes de la primera columna de datos, unido con
 * « · ». No se corta ni se interpreta: `/Membri1 /66kV`, `/PROELECT/I R` y
 * `/MvMoment` son tres celdas y las tres dicen algo — la subestación con su
 * tensión, la bahía con la señal, y qué tipo de valor es.
 */
export function leerSenales(matriz, eje) {
  if (!eje) return [];
  const out = [];
  (matriz ?? []).forEach((celdas, fila) => {
    if (fila <= eje.fila) return;
    const etiqueta = (celdas ?? []).slice(0, eje.primeraColumna)
      .map((v) => (v == null ? '' : String(v).trim()))
      .filter((t) => t !== '').join(' · ');
    const valores = eje.columnas.map((c) => {
      const v = celdas?.[c];
      if (v == null || v === '') return null;
      const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    });
    // Una fila sin un solo número no es una señal: es una separación o una nota.
    if (!valores.some((v) => v != null)) return;
    out.push({ fila, etiqueta: etiqueta || `(fila ${fila + 1})`, valores });
  });
  return out;
}

/**
 * QUÉ MAGNITUD ES UNA SEÑAL, propuesto a partir de su etiqueta.
 *
 * ⚠️ Es una PROPUESTA, no un veredicto: la pantalla la enseña y se puede
 * corregir. Devuelve `null` cuando no lo sabe, en vez de arriesgar — una señal
 * asignada mal no da error, da una gráfica falsa con cara de buena.
 *
 * Las marcas salen del vocabulario de SCADA que se ha visto: `I R` es la
 * corriente de la fase R, `MvMoment` es un valor momentáneo (no una energía
 * acumulada), y la tensión suele venir como `U` o `kV`.
 */
export function campoDeSenal(etiqueta) {
  const t = String(etiqueta ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const fase = (t.match(/\bI\s*([RST])\b/) ?? t.match(/\/I\s*([RST])\b/) ?? [])[1] ?? null;

  if (/\bI\s*[RST]\b|\/I\s*[RST]\b|CORRIENTE|AMPER/.test(t)) {
    return { campo: 'corriente_A', fase, porQue: fase ? `corriente de la fase ${fase}` : 'corriente' };
  }
  if (/\bMVAR\b|REACTIV|\bQ\b/.test(t)) return { campo: 'potenciaReactiva_MVAr', fase: null, porQue: 'potencia reactiva' };
  if (/\bMW\b|ACTIV|\bP\b(?!ROELECT)/.test(t)) return { campo: 'potenciaActiva_MW', fase: null, porQue: 'potencia activa' };
  if (/\bKV\b|TENSION|VOLTAJ|\bU\b/.test(t)) return { campo: 'tension_kV', fase: null, porQue: 'tensión' };
  if (/CARGABIL|%|CARGA\b/.test(t)) return { campo: 'cargabilidad_pct', fase: null, porQue: 'cargabilidad' };
  return null;
}

/** Cómo se resume lo trifásico en un solo número por hora. */
export const CRITERIOS_DE_FASE = [
  {
    id: 'maxima',
    rotulo: 'La fase más cargada',
    porQue: 'Es lo conservador y lo habitual: el conductor que primero llega a su límite decide, '
      + 'y promediar las tres esconde justo la que está peor.',
  },
  {
    id: 'promedio',
    rotulo: 'El promedio de las tres',
    porQue: 'Describe la carga media del circuito, pero suaviza un desequilibrio entre fases: '
      + 'una fase al límite y dos flojas dan un promedio tranquilo.',
  },
];

/**
 * Lo que hay que decirle a la lectura ancha, y que el archivo NO trae.
 *
 * @typedef {Object} OpcionesAncho
 * @property {string} [linea]         de qué línea es. Lo dice el Ingeniero.
 * @property {string|null} [circuito]
 * @property {Record<number, string|null>} [asignado]  fila de la señal → campo
 * @property {string} [criterioFase]  `maxima` (por defecto) o `promedio`
 */

/**
 * LA MATRIZ ANCHA → REGISTROS, los mismos que come el resto del módulo.
 *
 * @param matriz            las celdas tal cual salieron del `.xlsx`
 * @param opciones.linea    de qué línea es. **Lo dice el Ingeniero**: el archivo
 *                          nombra la subestación y la bahía, no la línea.
 * @param opciones.asignado `{ [fila de la señal]: campo }` — lo que se propuso o
 *                          lo que él corrigió. Una señal sin campo se ignora.
 * @param opciones.criterioFase  `maxima` (por defecto) o `promedio`.
 *
 * @param {any[][]} matriz
 * @param {OpcionesAncho} [opciones]
 * @returns {{registros: Record<string, any>[],
 *            eje: {fila:number, columnas:number[],
 *                  instantes:({fecha:string,hora:number}|null)[], primeraColumna:number}|null,
 *            senales: {fila:number, etiqueta:string, valores:(number|null)[],
 *                      propuesta:{campo:string,fase:string|null,porQue:string}|null,
 *                      campo:string|null, fase:string|null}[],
 *            porQue: string}}
 */
export function registrosDesdeAncho(matriz, opciones = {}) {
  const { linea, circuito = null, asignado = {}, criterioFase = 'maxima' } = opciones;
  const eje = encontrarEjeDeTiempo(matriz);
  if (!eje) {
    return { registros: [], eje: null, senales: [], porQue: 'no se encontró una fila de sellos de tiempo' };
  }
  const senales = leerSenales(matriz, eje).map((s) => {
    const propuesta = campoDeSenal(s.etiqueta);
    const campo = asignado[s.fila] !== undefined ? asignado[s.fila] : (propuesta?.campo ?? null);
    return { ...s, propuesta, campo, fase: propuesta?.fase ?? null };
  });

  // Por cada instante, se junta lo que aporte cada señal. Las de la misma
  // magnitud y distinta fase se combinan con el criterio; las demás se ponen
  // tal cual, porque no hay nada que combinar.
  const registros = eje.instantes.map((inst, i) => {
    if (!inst) return null;
    const reg = {
      linea, circuito, fecha: inst.fecha, hora: inst.hora,
      subestacionOrigen: null, subestacionDestino: null,
      cargabilidad_pct: null, corriente_A: null, potenciaActiva_MW: null,
      potenciaReactiva_MVAr: null, tension_kV: null, capacidadNominal_A: null,
      estado: null, observaciones: null, naturaleza: null,
    };
    const porCampo = new Map();
    for (const s of senales) {
      if (!s.campo) continue;
      const v = s.valores[i];
      if (v == null) continue;
      if (!porCampo.has(s.campo)) porCampo.set(s.campo, []);
      porCampo.get(s.campo).push(v);
    }
    for (const [campo, valores] of porCampo) {
      reg[campo] = valores.length === 1 ? valores[0] : combinar(valores, criterioFase);
    }
    if (reg.cargabilidad_pct != null) reg.naturaleza = 'declarada';
    return reg;
  }).filter(Boolean)
    // ⚠️ Un instante sin NINGUNA medida no es un registro: es una hora que no se
    // exportó. Guardarlo con todo a `null` llenaría el histórico de horas vacías
    // que luego habría que distinguir de las que sí se midieron y dieron cero.
    .filter((r) => ['cargabilidad_pct', 'corriente_A', 'potenciaActiva_MW',
      'potenciaReactiva_MVAr', 'tension_kV'].some((c) => r[c] != null));

  return {
    registros,
    eje,
    senales,
    porQue: `eje de tiempo en la fila ${eje.fila + 1}, ${eje.columnas.length} instantes; `
      + `${senales.length} señal(es) debajo`,
  };
}

function combinar(valores, criterio) {
  if (criterio === 'promedio') {
    return Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 100) / 100;
  }
  return Math.max(...valores);
}

/**
 * ¿ESTE ARCHIVO ES ANCHO O ES UNA TABLA NORMAL?
 *
 * Decide con lo que de verdad distingue: una tabla tiene una CABECERA con
 * nombres de campo reconocibles; una exportación de SCADA tiene una fila de
 * sellos de tiempo crecientes. Si aparecen las dos cosas —raro, pero posible—
 * manda la cabecera, porque una tabla con una columna de fechas es más común que
 * una matriz con nombres de campo.
 */
export function pareceAncho(matriz, cabeceraEncontrada) {
  const eje = encontrarEjeDeTiempo(matriz);
  if (!eje) return { ancho: false, porQue: 'no hay una fila de sellos de tiempo' };
  if (cabeceraEncontrada?.fila != null && cabeceraEncontrada.requeridos > 0) {
    return { ancho: false, porQue: 'hay una cabecera con campos reconocidos: se lee como tabla' };
  }
  return {
    ancho: true,
    eje,
    porQue: `la fila ${eje.fila + 1} trae ${eje.columnas.length} sellos de tiempo crecientes: `
      + 'es una exportación transpuesta, no una tabla',
  };
}

/**
 * LAS HORAS QUE VIENEN EN CERO AL FINAL — un aviso, nunca una decisión.
 *
 * ⚠️ EN EL ARCHIVO REAL DEL INGENIERO las horas 22 y 23 vienen en **0 A** en las
 * tres fases. Eso puede ser dos cosas radicalmente distintas:
 *
 *   · **No se midieron todavía** — el archivo se exportó antes de acabar el día,
 *     y esos ceros son el relleno del sistema. Entonces el día tiene 22 horas.
 *   · **La línea estuvo FUERA DE SERVICIO** — y entonces son un hecho grave, y
 *     el más importante del día.
 *
 * **El código no puede saber cuál es, y por eso no elige.** Los deja como
 * están —un 0 medido es un dato— y AVISA, para que lo diga quien sabe. Tratarlos
 * como huecos borraría una salida de servicio; tratarlos como medidas sin
 * avisar hundiría el promedio del día con horas que nadie midió.
 */
/**
 * @param {{campo?: string|null, valores:(number|null)[]}[]} senales
 * @param {{instantes:({fecha:string,hora:number}|null)[]}|null} eje
 * @returns {{horas:number, desde:string|null, aviso:string}|null}
 */
export function cerosAlFinal(senales, eje) {
  if (!senales?.length || !eje) return null;
  let cola = 0;
  for (let i = eje.instantes.length - 1; i >= 0; i--) {
    const valores = senales.filter((s) => s.campo).map((s) => s.valores[i]);
    if (!valores.length || !valores.every((v) => v === 0)) break;
    cola += 1;
  }
  if (!cola) return null;
  const desde = eje.instantes[eje.instantes.length - cola];
  return {
    horas: cola,
    desde: desde ? `${String(desde.hora).padStart(2, '0')}:00` : null,
    aviso: `Las últimas ${cola} hora(s) vienen en CERO en todas las señales`
      + (desde ? `, desde las ${String(desde.hora).padStart(2, '0')}:00` : '')
      + '. Un cero medido y una hora sin medir son cosas distintas, y esto no lo puede '
      + 'decidir el sistema: si la línea estuvo fuera, es el dato más importante del día; '
      + 'si el archivo se exportó antes de acabar el día, ese día tiene menos horas.',
  };
}
