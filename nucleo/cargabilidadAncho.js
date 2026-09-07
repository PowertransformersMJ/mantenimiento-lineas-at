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

/**
 * UN SELLO DE TIEMPO EN TEXTO: «1/01/26 0:00», «01/01/2026 00:00:00», «2026-01-01 05:00».
 *
 * ⚠️ POR QUÉ HACE FALTA (`99 §ADR-105`). El serial numérico es cosa de Excel.
 * Cuando el mismo histórico sale en CSV —y sale, es lo que exporta el sistema de
 * supervisión— la primera fila trae FECHAS ESCRITAS. Sin esto, el eje de tiempo
 * no se encuentra, y sin eje no hay ni una sola señal: el archivo real no
 * entraba por la puerta aunque el resto del módulo lo entendiera entero.
 */
const RE_SELLO_TEXTO = /^\s*(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*(?:[ap]\.?\s?m\.?)?\s*$/i;

/** Las tres cifras de la fecha, sin decidir todavía cuál es el día. */
function trozosDeSelloTexto(v) {
  if (typeof v === 'number') return null;
  const m = RE_SELLO_TEXTO.exec(String(v ?? ''));
  if (!m) return null;
  const [, a, b, c, hh, mm] = m;
  const hora = hh == null ? 0 : Number(hh);
  if (!Number.isFinite(hora) || hora > 23) return null;
  // ⚠️ `añoDelante` mira las CIFRAS ESCRITAS, no el valor. Lo cazó su propia
  // prueba: «31/02/26» no es una fecha por ningún lado, pero leído como año
  // corto daba 2031-02-26 y colaba. Un año que va delante se escribe entero.
  return {
    a: Number(a), b: Number(b), c: Number(c), hora, minuto: mm == null ? 0 : Number(mm),
    añoDelante: a.length === 4,
  };
}

/**
 * ¿DÍA/MES O MES/DÍA? Se decide con la EVIDENCIA del propio archivo.
 *
 * `3/01/26` es ambiguo y `13/01/26` no lo es. Así que se mira el conjunto: si
 * alguna primera cifra pasa de 12, el día va delante; si alguna segunda pasa de
 * 12, delante va el mes. Cuando NADA lo desempata se toma el orden de aquí
 * —día primero, que es como se escribe en Colombia— y se dice que es una
 * suposición, en vez de presentarla como un hecho: un archivo de un solo día
 * nunca trae la prueba, y con `1/01/26` las dos lecturas caen en la misma fecha.
 *
 * Un año delante (`2026-01-01`) no es ambiguo y manda sobre todo lo demás.
 */
export function ordenDeFecha(valores) {
  const trozos = (valores ?? []).map(trozosDeSelloTexto).filter(Boolean);
  if (!trozos.length) return { orden: 'dmy', seguro: false, porQue: 'no hay fechas escritas que mirar' };
  if (trozos.some((t) => t.añoDelante)) {
    return { orden: 'ymd', seguro: true, porQue: 'el año va delante, escrito con sus cuatro cifras' };
  }
  if (trozos.some((t) => t.a > 12)) {
    return { orden: 'dmy', seguro: true, porQue: 'una fecha trae un día mayor que 12 en la primera posición' };
  }
  if (trozos.some((t) => t.b > 12)) {
    return { orden: 'mdy', seguro: true, porQue: 'una fecha trae un día mayor que 12 en la segunda posición' };
  }
  return {
    orden: 'dmy',
    seguro: false,
    porQue: 'ninguna fecha del archivo lo desempata: se lee día/mes, que es como se escribe aquí',
  };
}

/** El sello escrito → `{fecha, hora}`, con el orden ya decidido. */
export function instanteDeTexto(v, orden = 'dmy') {
  const t = trozosDeSelloTexto(v);
  if (!t) return null;
  let dia; let mes; let anio;
  if (orden === 'ymd') {
    if (!t.añoDelante) return null;   // «31/02/26» no es el año 2031
    anio = t.a; mes = t.b; dia = t.c;
  }
  else if (orden === 'mdy') { mes = t.a; dia = t.b; anio = t.c; }
  else { dia = t.a; mes = t.b; anio = t.c; }
  // Dos cifras: el sistema exporta el año corto. 70-99 es el siglo XX; el resto,
  // el XXI. Es la misma ventana que usan las hojas de cálculo.
  if (anio < 100) anio += anio >= 70 ? 1900 : 2000;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const fecha = `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  // Se comprueba que la fecha EXISTA: «31/02» pasaría los rangos y no es un día.
  const d = new Date(`${fecha}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.getUTCDate() !== dia || d.getUTCMonth() + 1 !== mes) return null;
  return { fecha, hora: Math.min(23, t.hora) };
}

export function pareceSelloDeTiempo(v) {
  if (v instanceof Date) return !Number.isNaN(v.getTime());
  if (typeof v !== 'number' && trozosDeSelloTexto(v)) return instanteDeTexto(v, 'dmy') !== null
    || instanteDeTexto(v, 'mdy') !== null || instanteDeTexto(v, 'ymd') !== null;
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= SERIAL_MINIMO && n <= SERIAL_MAXIMO;
}

/**
 * EL SELLO, sea serial o escrito → `{fecha, hora}`.
 *
 * Es el único sitio donde se elige camino: todo lo demás del módulo trabaja ya
 * con instantes, así que añadir un formato no vuelve a tocar nada.
 */
export function instanteDeSello(v, orden = 'dmy') {
  if (typeof v !== 'number' && trozosDeSelloTexto(v)) return instanteDeTexto(v, orden);
  return instanteDeSerial(v);
}

/** Un número con el que ORDENAR sellos de cualquier forma, para ver si crecen. */
function ordinalDeSello(v, orden = 'dmy') {
  const i = instanteDeSello(v, orden);
  if (!i) return null;
  return Date.parse(`${i.fecha}T00:00:00Z`) / 3600000 + i.hora;
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

    // ⚠️ EL ORDEN DE LA FECHA SE DECIDE POR FILA, no por archivo: es esta fila la
    // que trae los sellos, y su propia evidencia es la que manda.
    const cual = ordenDeFecha(columnas.map((c) => celdas[c]));
    const valores = columnas.map((c) => ordinalDeSello(celdas[c], cual.orden));
    if (valores.some((v) => v == null)) return;
    const crece = valores.every((v, i) => i === 0 || v > valores[i - 1]);
    if (!crece) return;

    if (!mejor || columnas.length > mejor.columnas.length) {
      mejor = {
        fila,
        columnas,
        instantes: columnas.map((c) => instanteDeSello(celdas[c], cual.orden)),
        /** Dónde empiezan los datos: todo lo de antes es etiqueta de la señal. */
        primeraColumna: columnas[0],
        /** Cómo se leyó la fecha y si el archivo lo demostraba. Se ENSEÑA. */
        ordenDeFecha: cual,
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

/**
 * VARIOS ARCHIVOS, UNA SOLA CARGA (`99 §ADR-105`).
 *
 * ⚠️ POR QUÉ HACE FALTA, y no es comodidad. El sistema de supervisión exporta
 * **una magnitud por archivo**: la tensión RS en uno, la ST en otro, la TR en un
 * tercero. Cargarlos de uno en uno NO los suma: los tres son `tension_kV` del
 * mismo día y la misma línea, así que el segundo pisa al primero y el tercero a
 * los dos. Quien quiera «la tensión más alta de las tres fases» —que es el
 * criterio de ingeniería que ya sabe aplicar `combinar`— necesita que las tres
 * señales estén EN LA MISMA lectura. De ahí esto.
 *
 * QUÉ EXIGE, y por qué es estricto: que todos los archivos tengan eje de tiempo
 * y que sus instantes sean **exactamente los mismos**. Alinear dos rejillas de
 * tiempo distintas es interpolar, y una tensión interpolada es una medida que
 * nadie tomó. Si no cuadran se dice cuál y en qué instante, y no se une nada.
 *
 * La matriz que sale está NORMALIZADA: fila 0 el eje, y una fila por señal con
 * la etiqueta en una sola celda —la misma que `leerSenales` habría compuesto—,
 * así que río abajo no cambia nada.
 *
 * @param {{nombre?: string, matriz: any[][]}[]} entradas
 * @returns {{matriz: any[][], porQue: string, deCada: {nombre: string, senales: number}[]}}
 */
export function unirAnchas(entradas) {
  const lista = (entradas ?? []).filter((e) => e && Array.isArray(e.matriz));
  if (!lista.length) throw new Error('no se recibió ningún archivo que unir');

  const leidas = lista.map((e, i) => {
    const nombre = e.nombre ?? `archivo ${i + 1}`;
    const eje = encontrarEjeDeTiempo(e.matriz);
    if (!eje) throw new Error(`«${nombre}» no trae una fila de sellos de tiempo: no se puede unir con los demás`);
    return { nombre, matriz: e.matriz, eje, senales: leerSenales(e.matriz, eje) };
  });

  const [base, ...resto] = leidas;
  const clave = (inst) => (inst ? `${inst.fecha} ${inst.hora}` : '—');
  const esperado = base.eje.instantes.map(clave);
  for (const otra of resto) {
    const suyo = otra.eje.instantes.map(clave);
    if (suyo.length !== esperado.length) {
      throw new Error(`«${otra.nombre}» trae ${suyo.length} instantes y «${base.nombre}» ${esperado.length}: `
        + 'no son el mismo periodo y no se unen');
    }
    const i = suyo.findIndex((v, k) => v !== esperado[k]);
    if (i >= 0) {
      throw new Error(`«${otra.nombre}» y «${base.nombre}» no coinciden en el instante ${i + 1}: `
        + `${suyo[i]} frente a ${esperado[i]}. Alinear dos rejillas distintas sería interpolar`);
    }
  }

  const filaEje = ['', ...base.eje.columnas.map((c) => base.matriz[base.eje.fila][c])];
  const matriz = [filaEje];
  for (const { senales } of leidas) {
    for (const s of senales) matriz.push([s.etiqueta, ...s.valores]);
  }
  const deCada = leidas.map(({ nombre, senales }) => ({ nombre, senales: senales.length }));
  return {
    matriz,
    deCada,
    porQue: leidas.length === 1
      ? `${base.senales.length} señal(es) de «${base.nombre}»`
      : `${matriz.length - 1} señales de ${leidas.length} archivos, sobre los mismos `
        + `${esperado.length} instantes`,
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
