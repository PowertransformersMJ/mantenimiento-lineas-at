import {
  CAMPOS, CAMPOS_GUARDADOS, ESTADISTICOS, FASES_DE, IDS_ESTADISTICO, completarAparente,
} from './cargabilidad.js';

// ============================================================================
// nucleo/cargabilidadAncho.js — leer la exportación de SCADA tal como sale
// ----------------------------------------------------------------------------
// QUÉ ES (`99 §ADR-088`). Un histórico de SCADA no viene como una tabla: viene
// **TRANSPUESTO**. El tiempo va en COLUMNAS y cada magnitud en su propia FILA.
// Así salió el primer archivo real del Ingeniero, «Cargas 22 Jul LN-627.xlsx»:
//
//   fila 1     vacía
//   fila 2     46225 · 46225,0417 · 46225,0833 …   ← los sellos de tiempo
//   fila 3     /SubA /66kV · /PROELECT/I R · /MvMoment · 271 · 263 · 259 …
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
  // `escritas` dice cuántas fechas ESCRITAS se miraron (`99 §ADR-127`). Sin
  // ellas —un serial de Excel— no hay orden que decidir, y `ordenDeLaCarga` no
  // puede contar ese archivo como «sin prueba»: no es ambiguo, es otra cosa.
  const escritas = trozos.length;
  if (!trozos.length) return { orden: 'dmy', seguro: false, escritas, porQue: 'no hay fechas escritas que mirar' };
  if (trozos.some((t) => t.añoDelante)) {
    return { orden: 'ymd', seguro: true, escritas, porQue: 'el año va delante, escrito con sus cuatro cifras' };
  }
  if (trozos.some((t) => t.a > 12)) {
    return { orden: 'dmy', seguro: true, escritas, porQue: 'una fecha trae un día mayor que 12 en la primera posición' };
  }
  if (trozos.some((t) => t.b > 12)) {
    return { orden: 'mdy', seguro: true, escritas, porQue: 'una fecha trae un día mayor que 12 en la segunda posición' };
  }
  return {
    orden: 'dmy',
    seguro: false,
    escritas,
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
 *
 * (El tipo de retorno va DECLARADO desde el `§ADR-127`: `mejor` se asigna dentro
 * de un `forEach` y, sin esto, TypeScript lo daba por `null` siempre.)
 *
 * @returns {{fila: number, columnas: number[],
 *            instantes: ({fecha: string, hora: number}|null)[], primeraColumna: number,
 *            ordenDeFecha: {orden: string, seguro: boolean, escritas: number, porQue: string}}|null}
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
 * « · ». No se corta ni se interpreta: `/SubA /66kV`, `/PROELECT/I R` y
 * `/MvMoment` son tres celdas y las tres dicen algo — la subestación con su
 * tensión, la bahía con la señal, y qué tipo de valor es.
 */
export function leerSenales(matriz, eje, { estadistico = null } = {}) {
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
    // ⚠️ El estadístico va en su PROPIA clave, jamás concatenado a la etiqueta:
    // `campoDeSenal` lee la etiqueta con expresiones regulares y una palabra de
    // más puede voltear la magnitud propuesta sin que nadie lo vea.
    out.push({ fila, etiqueta: etiqueta || `(fila ${fila + 1})`, valores, estadistico });
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
  const faseDe = (letra) => (t.match(new RegExp(`\\b${letra}\\s*(RS|ST|TR|R|S|T)\\b`))
    ?? t.match(new RegExp(`\\/${letra}\\s*(RS|ST|TR|R|S|T)\\b`)) ?? [])[1] ?? null;

  if (/\bI\s*[RST]\b|\/I\s*[RST]\b|CORRIENTE|AMPER/.test(t)) {
    const fase = faseDe('I');
    return { campo: 'corriente_A', fase, porQue: fase ? `corriente de la fase ${fase}` : 'corriente' };
  }
  if (/\bMVAR\b|REACTIV|\bQ\b/.test(t)) {
    const fase = faseDe('Q');
    return { campo: 'potenciaReactiva_MVAr', fase, porQue: fase ? `potencia reactiva de la fase ${fase}` : 'potencia reactiva' };
  }
  // ⚠️ La aparente va ANTES que la activa: `\bS\b` como potencia aparente y
  // `\bP\b` como activa conviven, pero «MVA» es inequívoco y «MW» también, así
  // que se prueban los rótulos duros primero y la letra suelta al final.
  // La `S` suelta es ambigua —es también una letra de fase— así que solo se
  // acepta con la barra delante, que es como este SCADA rotula la magnitud
  // (`/I R`, `/U RS`, `/S T`). Sin barra se devuelve null y se asigna a mano:
  // arriesgar aquí no da error, da una gráfica falsa.
  if (/\bMVA\b|APARENT|\/S\s*[RST]\b/.test(t)) {
    const fase = faseDe('S');
    return { campo: 'potenciaAparente_MVA', fase, porQue: fase ? `potencia aparente de la fase ${fase}` : 'potencia aparente' };
  }
  if (/\bMW\b|ACTIV|\bP\b(?!ROELECT)/.test(t)) {
    const fase = faseDe('P');
    return { campo: 'potenciaActiva_MW', fase, porQue: fase ? `potencia activa de la fase ${fase}` : 'potencia activa' };
  }
  if (/\bKV\b|TENSION|VOLTAJ|\bU\b/.test(t)) {
    // ⚠️ AQUÍ SE DECIDE UN FACTOR DE 1,73. `U RS` es entre fases; `U R` es de
    // fase a tierra. Se lee la etiqueta y se DICE cuál se entendió, en vez de
    // meter las dos en el mismo campo y que alguien las compare entre sí.
    const fase = faseDe('U') ?? faseDe('V');
    const entreFases = fase === 'RS' || fase === 'ST' || fase === 'TR';
    return {
      campo: 'tension_kV',
      fase,
      porQue: fase
        ? (entreFases ? `tensión entre las fases ${fase}` : `tensión de la fase ${fase} a tierra`)
        : 'tensión',
    };
  }
  if (/CARGABIL|%|CARGA\b/.test(t)) return { campo: 'cargabilidad_pct', fase: null, porQue: 'cargabilidad' };
  return null;
}

/**
 * EL CAMPO POR FASE que corresponde a una magnitud y una letra.
 *
 * Sale del catálogo (`nucleo/cargabilidad.js`), no de una convención escrita
 * aquí: si mañana se añade una fase, aparece sola y no hay dos verdades sobre
 * cómo se llama un campo.
 */
export function campoDeFase(campo, fase) {
  if (!fase) return null;
  return (FASES_DE[campo] ?? []).find((x) => x.fase === fase)?.campo ?? null;
}

/** Cómo se resume lo trifásico en un solo número por hora. */
/**
 * QUÉ ESTADÍSTICO TRAE UN ARCHIVO, leído de SU NOMBRE (`99 §ADR-112`).
 *
 * ⚠️ DEL NOMBRE, porque no está en ningún otro sitio. La etiqueta de la señal es
 * IDÉNTICA en los tres archivos —`/SubA /66kV /PROELECT/I R /MvMoment`—, así
 * que dentro del dato no hay nada que los distinga. Lo único que los separa es
 * cómo se llama el archivo: `..._max...`, `..._Average...`, `..._Current...`.
 *
 * ⚠️ Y SE DEVUELVE `null` ANTES QUE ADIVINAR, en los dos casos que importan:
 * cuando no hay marca y cuando hay MÁS DE UNA. Un archivo mal nombrado que se
 * lea como el estadístico equivocado se guarda con la identidad de otro y lo
 * PISA — y el histórico no tiene borrado, así que eso no se deshace. Aquí
 * `null` significa «pregúntale al Ingeniero», nunca «será el máximo».
 *
 * Las marcas van ANCLADAS entre separadores, así que «Maximiliano» no es un
 * máximo — un `includes('max')` sí lo cazaría. Aun así esto es una **PROPUESTA,
 * no un veredicto**, igual que `campoDeSenal`: una línea que se llamara
 * `LN-MAX-627` daría un falso positivo, y por eso la pantalla ENSEÑA lo que se
 * entendió de cada archivo y deja corregirlo antes de guardar.
 *
 * @param {string} nombre nombre del archivo, con o sin extensión
 * @returns {{id: string|null, marca: string|null, porQue: string}}
 */
export function estadisticoDeNombre(nombre) {
  const base = String(nombre ?? '').replace(/\.[a-z0-9]+$/i, '');
  const MARCAS = [
    { id: 'maximo', re: /(^|[_\-. ])(max|maximo|maximos)([_\-. ]|$)/i },
    { id: 'minimo', re: /(^|[_\-. ])(min|minimo|minimos)([_\-. ]|$)/i },
    { id: 'promedio', re: /(^|[_\-. ])(average|avg|promedio|prom)([_\-. ]|$)/i },
    // ⚠️ «Current» aquí es INSTANTÁNEO, no «corriente». Es el vocabulario de
    // este SCADA, y por eso la magnitud NUNCA se deduce del nombre del archivo
    // sino de la etiqueta de la señal: son dos preguntas distintas.
    { id: 'instantaneo', re: /(^|[_\-. ])(current|instantaneo|instant|inst)([_\-. ]|$)/i },
  ];
  const casan = MARCAS.filter((m) => m.re.test(base));
  if (!casan.length) {
    return { id: null, marca: null, porQue: 'el nombre no dice qué estadístico trae' };
  }
  if (casan.length > 1) {
    return {
      id: null,
      marca: null,
      porQue: `el nombre dice ${casan.map((m) => m.id).join(' y ')} a la vez: no se elige por usted`,
    };
  }
  const [{ id }] = casan;
  return { id, marca: base.match(MARCAS.find((m) => m.id === id).re)[2], porQue: `el nombre trae «${base.match(MARCAS.find((m) => m.id === id).re)[2]}»` };
}

/**
 * ¿ES UN ARCHIVO DE CALIDAD, y no de medida? (`99 §ADR-117`)
 *
 * ⚠️ La exportación trae, junto a cada magnitud, un archivo `_quality` cuyas
 * celdas no son números sino sellos: `Actual` cuando la hora se midió de verdad.
 * NO es un estadístico —no hay «la calidad de la hora» que dibujar— y tratarlo
 * como si lo fuera bloqueaba la carga entera: el nombre no dice ningún
 * estadístico, y sin estadístico el guardado se niega, que es lo correcto para
 * una medida y absurdo para un sello.
 *
 * Se reconoce, se aparta de las señales y **se lee**: si alguna hora no dice
 * `Actual`, esa hora no es una medida y hay que decirlo. Tirarlo sin mirarlo
 * sería quedarse justo con el dato que no se puede defender.
 */
/**
 * DE QUÉ DÍA ES UN ARCHIVO, leído de su nombre (`99 §ADR-117`).
 *
 * ⚠️ POR QUÉ HACE FALTA. `unirAnchas` exige que todos los archivos compartan
 * EXACTAMENTE los mismos instantes —alinear dos rejillas distintas es
 * interpolar—, así que dos días no se pueden unir. Pero el Ingeniero exporta un
 * mes entero de golpe: treinta carpetas, mil archivos. Obligarle a soltarlos día
 * a día sería trasladarle a él una limitación nuestra.
 *
 * Se agrupan por su fecha ANTES de unir, y cada grupo se une con los suyos. La
 * exigencia de la rejilla no se relaja: se aplica dentro de cada día, que es
 * donde tiene sentido.
 *
 * `20260115` en el nombre → `2026-01-15`. Sin fecha reconocible devuelve `null`,
 * y esos archivos se tratan como UN grupo aparte en vez de repartirse a ciegas.
 */
export function fechaDeNombre(nombre) {
  const m = String(nombre ?? '').match(/(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * VARIAS FECHAS EN UNA SOLA CARGA. Agrupa por día y une cada grupo por su lado.
 *
 * @param {{nombre?: string, matriz: any[][], estadistico?: string|null}[]} entradas
 * @returns {{porDia: {fecha: string|null,
 *            union: {matriz: any[][], estadisticoPorFila: Record<number, string|null>,
 *                    estadisticos: string[], sinDeclarar: string[], porQue: string,
 *                    calidad: {archivos:number, horas:number, buenas:number, dudosas:any[]},
 *                    senales: {fila:number, etiqueta:string, estadistico:string|null, nombre:string}[],
 *                    deCada: {nombre:string, senales:number, estadistico:string|null,
 *                             porQueEstadistico:string}[]}}[],
 *            fechas: string[], ordenDeFecha: OrdenDeLaCarga}}
 */
export function unirPorDia(entradas) {
  const grupos = new Map();
  const ordenes = [];
  for (const e of (entradas ?? []).filter((x) => x && Array.isArray(x.matriz))) {
    // ⚠️ MANDA LA FECHA QUE DECLARA EL DATO, no la del nombre (`99 §ADR-117`).
    //
    // Medido sobre la exportación real de enero: **46 archivos de 902 tienen el
    // nombre equivocado**. Una carpeta entera llamada «30Enero» resultó traer el
    // **29 de julio**, y un archivo llamado `..._20260601` traía el 31 de mayo.
    // Agrupar por el nombre habría metido julio dentro de enero sin que nada
    // chillara — y el histórico no se puede borrar.
    //
    // La fila de sellos de tiempo es lo único que el propio dato afirma sobre
    // cuándo se midió. El nombre queda de respaldo para el archivo que no traiga
    // eje reconocible, que de todas formas no se puede unir con nadie.
    const eje = encontrarEjeDeTiempo(e.matriz);
    if (eje) ordenes.push({ nombre: e.nombre ?? '(sin nombre)', orden: eje.ordenDeFecha });
    const f = eje?.instantes?.find(Boolean)?.fecha ?? fechaDeNombre(e.nombre ?? '');
    if (!grupos.has(f)) grupos.set(f, []);
    grupos.get(f).push(e);
  }
  // ⚠️ EL ORDEN DE LA FECHA SE MIRA EN LA CARGA ENTERA, ANTES DE AGRUPAR (`99 §ADR-127`).
  //
  // `encontrarEjeDeTiempo` decide archivo por archivo, y en un mes exportado
  // mes/día eso falla justo donde no se ve: del 1 al 12 ningún archivo trae la
  // prueba y se leen día/mes —el 1/05/26 sería el 1 de MAYO—, mientras el
  // 1/13/26 de la misma carga demuestra lo contrario. Cada archivo, solo, está
  // bien leído; juntos, doce días caen en otro mes. El paso 2 ya se negaba y la
  // pantalla lo aceptaba: ahora las dos preguntan a la misma función.
  const laFecha = ordenDeLaCarga(ordenes);
  if (laFecha.mezcla) {
    throw new Error(`${laFecha.porQue}. No se carga nada: un día fechado al revés entra en el `
      + 'histórico con la identidad de otro, y el histórico no se borra');
  }
  const porDia = [...grupos.entries()]
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([fecha, suyos]) => ({ fecha, union: unirAnchas(suyos) }));
  return { porDia, fechas: porDia.map((d) => d.fecha).filter(Boolean), ordenDeFecha: laFecha };
}

export function esArchivoDeCalidad(nombre) {
  return /(^|[_\-. ])(quality|calidad)([_\-. ]|$)/i.test(String(nombre ?? '').replace(/\.[a-z0-9]+$/i, ''));
}

/** El sello que declara que una hora se midió de verdad. Lo demás se señala. */
export const CALIDAD_BUENA = 'Actual';

/**
 * QUÉ DICE UN ARCHIVO DE CALIDAD. Devuelve las horas que NO son medida.
 *
 * @param {any[][]} matriz
 * @returns {{horas: number, buenas: number, dudosas: {senal: string, sello: string}[]}}
 */
export function leerCalidad(matriz) {
  const eje = encontrarEjeDeTiempo(matriz, { minimo: 2 });
  const out = { horas: 0, buenas: 0, dudosas: [] };
  if (!eje) return out;
  for (const celdas of (matriz ?? []).slice(eje.fila + 1)) {
    const etiqueta = (celdas ?? []).slice(0, eje.primeraColumna)
      .map((v) => (v == null ? '' : String(v).trim())).filter(Boolean).join(' · ');
    for (const c of eje.columnas) {
      const v = celdas?.[c];
      if (v == null || String(v).trim() === '') continue;
      out.horas += 1;
      if (String(v).trim() === CALIDAD_BUENA) out.buenas += 1;
      else out.dudosas.push({ senal: etiqueta, sello: String(v).trim() });
    }
  }
  return out;
}

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
 * @property {Record<number, string|null>} [asignado]  fila de la señal → campo.
 *                    Solo vale dentro de UNA matriz; con varios días, la de abajo.
 * @property {Record<string, string|null>|null} [asignadoPorEtiqueta]  etiqueta de
 *                    la señal → campo (`99 §ADR-127`). La etiqueta es la identidad
 *                    de la señal en todos los días; el número de fila, no.
 * @property {string} [criterioFase]  `maxima` (por defecto) o `promedio` — cómo se
 *                    resumen las TRES FASES de un instante. **No confundir con el
 *                    estadístico**: aquél comparte la palabra «promedio» y no es lo mismo.
 * @property {string|null} [estadistico]  cuál de los tres se lee: `maximo`,
 *                    `promedio` o `instantaneo`. Sin él, y si la carga trae más
 *                    de uno, NO se lee nada: mezclarlos fabricaría un número.
 * @property {Record<number, string|null>|null} [estadisticoPorFila]  lo que
 *                    devuelve `unirAnchas`: de qué archivo salió cada fila.
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
 *                      campo:string|null, fase:string|null, estadistico:string|null}[],
 *            estadisticos?: string[],
 *            porQue: string}}
 */
export function registrosDesdeAncho(matriz, opciones = {}) {
  const {
    linea, circuito = null, asignado = {}, criterioFase = 'maxima',
    // ⚠️ `estadistico` FILTRA: «de todas estas señales quiero solo las del
    // máximo». `estadisticoPorFila` es lo que devuelve `unirAnchas`. Ninguno de
    // los dos tiene valor por defecto, y eso es el punto (`99 §ADR-112`).
    estadistico = null, estadisticoPorFila = null,
    // ⚠️ LA ASIGNACIÓN POR ETIQUETA (`99 §ADR-127`). `asignado` va por NÚMERO DE
    // FILA, y eso solo vale dentro de UNA matriz: cada día de un mes trae sus
    // señales en otro orden, así que la fila 3 del día 1 es la corriente S y la
    // del día 5 puede ser la T. Qué magnitud es una señal es cosa de la SEÑAL, y
    // la señal se reconoce por su etiqueta. Si las dos llegan, manda la de fila.
    asignadoPorEtiqueta = null,
  } = opciones;
  const eje = encontrarEjeDeTiempo(matriz);
  if (!eje) {
    return { registros: [], eje: null, senales: [], porQue: 'no se encontró una fila de sellos de tiempo' };
  }
  const todas = leerSenales(matriz, eje).map((s) => {
    const propuesta = campoDeSenal(s.etiqueta);
    // `hasOwn` y no `in`: una etiqueta como «constructor» no puede leer el prototipo.
    const porEtiqueta = asignadoPorEtiqueta && Object.hasOwn(asignadoPorEtiqueta, s.etiqueta)
      ? asignadoPorEtiqueta[s.etiqueta] : undefined;
    const campo = asignado[s.fila] !== undefined ? asignado[s.fila]
      : porEtiqueta !== undefined ? porEtiqueta : (propuesta?.campo ?? null);
    const suEst = estadisticoPorFila?.[s.fila] ?? s.estadistico ?? null;
    return { ...s, propuesta, campo, fase: propuesta?.fase ?? null, estadistico: suEst };
  });

  // ⚠️ SE FILTRA POR ESTADÍSTICO, Y SI NO, SE PARA (`99 §ADR-112`). Sin esto,
  // las tres corrientes de la fase R —244 A del máximo, 233 del promedio y 236
  // del instantáneo— caen en el mismo cubo y `combinar()` devuelve UNA. Con
  // criterio «la más alta» las otras dos desaparecen sin dejar rastro; con
  // «promedio» sale un número que no midió nadie. Callar aquí es fabricar dato.
  const senales = estadistico
    ? todas.filter((s) => s.estadistico === estadistico || s.estadistico == null)
    : todas;
  const presentes = [...new Set(senales.filter((s) => s.campo).map((s) => s.estadistico ?? '—'))];
  if (!estadistico && presentes.length > 1) {
    return {
      registros: [], eje, senales: todas, estadisticos: presentes,
      porQue: `esta carga trae ${presentes.length} estadísticos a la vez (${presentes.join(', ')}) `
        + 'y no se pueden mezclar en la misma lectura: elija cuál se guarda',
    };
  }

  // Por cada instante, se junta lo que aporte cada señal. Las de la misma
  // magnitud y distinta fase se combinan con el criterio; las demás se ponen
  // tal cual, porque no hay nada que combinar.
  const registros = eje.instantes.map((inst, i) => {
    if (!inst) return null;
    const reg = {
      linea, circuito, fecha: inst.fecha, hora: inst.hora,
      subestacionOrigen: null, subestacionDestino: null,
      // Del catálogo: así una magnitud nueva aparece sola y no hay una lista
      // más que mantener a mano.
      ...Object.fromEntries(CAMPOS_GUARDADOS.map((c) => [c, null])),
      naturaleza: null, criterioFase: null,
      // Después del spread a propósito: si algún día el estadístico entrara en
      // el catálogo, el spread lo pisaría a `null` y esto lo sobrevive.
      estadistico: estadistico ?? presentes.find((p) => p !== '—') ?? null,
    };
    const porCampo = new Map();
    for (const s of senales) {
      if (!s.campo) continue;
      const v = s.valores[i];
      if (v == null) continue;
      if (!porCampo.has(s.campo)) porCampo.set(s.campo, []);
      porCampo.get(s.campo).push(v);
      // ⚠️ LA FASE SE GUARDA, no solo se usa para combinar (`99 §ADR-106`).
      // Antes se detectaba aquí mismo y se tiraba: el registro solo tenía el
      // agregado, así que el desbalance entre fases —que la pantalla lleva
      // pidiendo desde hace tiempo— no se podía calcular nunca.
      const suyo = campoDeFase(s.campo, s.fase);
      if (suyo) reg[suyo] = v;
    }
    for (const [campo, valores] of porCampo) {
      reg[campo] = valores.length === 1 ? valores[0] : combinar(valores, criterioFase);
    }
    // Con qué criterio se resumieron las fases. Un agregado que no dice cómo se
    // hizo es un número sin procedencia, y aquí eso no se guarda.
    if ([...porCampo.values()].some((v) => v.length > 1)) reg.criterioFase = criterioFase;
    if (reg.cargabilidad_pct != null) reg.naturaleza = 'declarada';
    return completarAparente(reg);
  }).filter(Boolean)
    // ⚠️ Un instante sin NINGUNA medida no es un registro: es una hora que no se
    // exportó. Guardarlo con todo a `null` llenaría el histórico de horas vacías
    // que luego habría que distinguir de las que sí se midieron y dieron cero.
    .filter((r) => CAMPOS_GUARDADOS.some((c) => typeof r[c] === 'number' && r[c] != null));

  return {
    registros,
    eje,
    senales: todas,
    estadisticos: presentes,
    porQue: `eje de tiempo en la fila ${eje.fila + 1}, ${eje.columnas.length} instantes; `
      + `${senales.length} señal(es) debajo`
      + (estadistico ? ` · estadístico: ${estadistico}` : ''),
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
 * @param {{nombre?: string, matriz: any[][], estadistico?: string|null}[]} entradas
 * @returns {{matriz: any[][], porQue: string,
 *            deCada: {nombre: string, senales: number, estadistico: string|null, porQueEstadistico: string}[],
 *            senales: {fila: number, etiqueta: string, estadistico: string|null, nombre: string}[],
 *            estadisticoPorFila: Record<number, string|null>,
 *            estadisticos: string[], sinDeclarar: string[]}}
 */
export function unirAnchas(entradas) {
  const todas = (entradas ?? []).filter((e) => e && Array.isArray(e.matriz));
  // Los de calidad no son señales: se apartan ANTES de unir, se leen aparte y
  // no cuentan como «archivo sin estadístico» (`99 §ADR-117`).
  const deCalidad = todas.filter((e) => esArchivoDeCalidad(e.nombre ?? ''));
  const lista = todas.filter((e) => !esArchivoDeCalidad(e.nombre ?? ''));
  if (!lista.length) throw new Error('no se recibió ningún archivo de medidas que unir');
  const calidad = deCalidad.reduce((acc, e) => {
    const r = leerCalidad(e.matriz);
    acc.archivos += 1; acc.horas += r.horas; acc.buenas += r.buenas;
    for (const d of r.dudosas) acc.dudosas.push({ ...d, nombre: e.nombre });
    return acc;
  }, { archivos: 0, horas: 0, buenas: 0, dudosas: [] });

  const leidas = lista.map((e, i) => {
    const nombre = e.nombre ?? `archivo ${i + 1}`;
    const eje = encontrarEjeDeTiempo(e.matriz);
    if (!eje) throw new Error(`«${nombre}» no trae una fila de sellos de tiempo: no se puede unir con los demás`);
    // ⚠️ EL NOMBRE DEL ARCHIVO SOLO EXISTE AQUÍ (`99 §ADR-112`). Diez líneas más
    // abajo las señales se funden en una matriz y el origen se pierde: con tres
    // estadísticos las etiquetas quedan idénticas y ya no hay de dónde sacarlo.
    const declarado = e.estadistico !== undefined ? e.estadistico : estadisticoDeNombre(nombre).id;
    return {
      nombre, matriz: e.matriz, eje, estadistico: declarado ?? null,
      porQueEstadistico: estadisticoDeNombre(nombre).porQue,
      senales: leerSenales(e.matriz, eje, { estadistico: declarado ?? null }),
    };
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

  // ⚠️ LA MATRIZ NO CAMBIA DE FORMA, y es deliberado. Meter el estadístico como
  // una columna más correría `primeraColumna` de `encontrarEjeDeTiempo`, y a
  // partir de ahí TODAS las etiquetas saldrían compuestas y `pareceAncho`
  // empezaría a ver otra cosa. La anotación viaja aparte, por número de fila.
  const filaEje = ['', ...base.eje.columnas.map((c) => base.matriz[base.eje.fila][c])];
  const matriz = [filaEje];
  const anotadas = [];
  for (const { nombre, estadistico, senales } of leidas) {
    for (const s of senales) {
      anotadas.push({ fila: matriz.length, etiqueta: s.etiqueta, estadistico, nombre });
      matriz.push([s.etiqueta, ...s.valores]);
    }
  }
  const deCada = leidas.map(({ nombre, senales, estadistico, porQueEstadistico }) => ({
    nombre, senales: senales.length, estadistico, porQueEstadistico,
  }));
  return {
    matriz,
    deCada,
    /** Por número de fila de la matriz emitida: de qué archivo y estadístico salió. */
    senales: anotadas,
    estadisticoPorFila: Object.fromEntries(anotadas.map((a) => [a.fila, a.estadistico])),
    /** Los estadísticos presentes, sin repetir. Más de uno = hay que elegir. */
    estadisticos: [...new Set(anotadas.map((a) => a.estadistico).filter(Boolean))],
    /** Archivos cuyo nombre no dice qué estadístico traen. Se PREGUNTA, no se supone. */
    sinDeclarar: leidas.filter((l) => !l.estadistico).map((l) => l.nombre),
    /** Lo que dicen los archivos `_quality`: cuántas horas son medida de verdad. */
    calidad,
    porQue: leidas.length === 1
      ? `${base.senales.length} señal(es) de «${base.nombre}»`
      : `${matriz.length - 1} señales de ${leidas.length} archivos, sobre los mismos `
        + `${esperado.length} instantes`,
  };
}

// ============================================================================
// UNA CARGA DE VARIOS DÍAS SE LEE ENTERA (`99 §ADR-127`)
// ----------------------------------------------------------------------------
// La revisión del `§ADR-126` dejó tres fallos en la pantalla con la misma forma:
// una decisión tomada mirando SOLO el primer día —o SOLO un archivo— y aplicada
// después a todos. Las cuatro funciones de abajo son esas decisiones, tomadas
// sobre la carga entera y en el núcleo, donde tienen prueba de oro.
// ============================================================================

/**
 * Cómo se leyó la fecha de una CARGA entera.
 * @typedef {Object} OrdenDeLaCarga
 * @property {boolean} aplica      `false` si ningún archivo trae fechas ESCRITAS
 *                                 (serial de Excel): no hay orden que decidir
 * @property {boolean} mezcla      `true` = la carga NO se puede leer
 * @property {string} orden        `dmy`, `mdy` o `ymd`: el que manda si no hay mezcla
 * @property {boolean} seguro      algún archivo lo DEMUESTRA; si no, es suposición
 * @property {string[]} demostrados  los órdenes demostrados, sin repetir
 * @property {{nombre: string, orden: string}[]} conPrueba
 * @property {string[]} sinPrueba  los archivos que no traen prueba
 * @property {string} porQue
 */

const ROTULO_ORDEN = { dmy: 'día/mes', mdy: 'mes/día', ymd: 'año-mes-día' };

/**
 * ¿DÍA/MES O MES/DÍA, PARA LA CARGA ENTERA?
 *
 * `ordenDeFecha` mira UN archivo, y el archivo de un día del 1 al 12 nunca trae
 * la prueba. Pero una carga es UNA exportación: lo que demuestra un archivo vale
 * para sus hermanos. La regla es la del paso 2 (`§ADR-126`), que vivía escrita
 * en la herramienta y la pantalla no tenía:
 *   · dos archivos que demuestran órdenes DISTINTOS → no se lee nada;
 *   · uno demuestra un orden que no es día/mes y otros no traen prueba → no se
 *     lee nada: ésos se leerían día/mes por defecto y quedarían al revés;
 *   · todo lo demostrado es día/mes → los que no traen prueba se leen igual;
 *   · nada lo demuestra → día/mes, y se DICE que es una suposición.
 *
 * ⚠️ En el caso mezclado NO se elige el orden por él, aunque la evidencia apunte
 * a uno: esa negativa es la señal de que la exportación cambió de formato
 * (`§ADR-126`, supuestos), y leer un mes entero en otro orden es una decisión
 * suya. Un archivo sin fechas escritas —el serial de Excel— no es ambiguo y no
 * cuenta.
 *
 * @param {{nombre: string, orden: {orden: string, seguro: boolean, escritas?: number}}[]} archivos
 * @returns {OrdenDeLaCarga}
 */
export function ordenDeLaCarga(archivos) {
  const conFecha = (archivos ?? []).filter((a) => a?.orden && (a.orden.escritas ?? 1) > 0);
  const conPrueba = conFecha.filter((a) => a.orden.seguro)
    .map((a) => ({ nombre: a.nombre, orden: a.orden.orden }));
  const sinPrueba = conFecha.filter((a) => !a.orden.seguro).map((a) => a.nombre);
  const demostrados = [...new Set(conPrueba.map((a) => a.orden))];
  const dicho = (o) => ROTULO_ORDEN[o] ?? o;
  const quien = (o) => conPrueba.find((a) => a.orden === o)?.nombre;
  const base = { aplica: conFecha.length > 0, demostrados, conPrueba, sinPrueba };
  const [unico] = demostrados;

  if (demostrados.length > 1) {
    return { ...base, mezcla: true, orden: unico, seguro: false,
      porQue: `unos archivos demuestran ${dicho(demostrados[0])} y otros ${dicho(demostrados[1])} `
        + `(«${quien(demostrados[0])}» y «${quien(demostrados[1])}»): la misma carga no se lee de dos maneras` };
  }
  if (unico && unico !== 'dmy' && sinPrueba.length) {
    const muestra = sinPrueba.slice(0, 3).map((n) => `«${n}»`).join(', ') + (sinPrueba.length > 3 ? '…' : '');
    return { ...base, mezcla: true, orden: unico, seguro: false,
      porQue: `«${quien(unico)}» demuestra ${dicho(unico)}, y ${sinPrueba.length} archivo(s) no traen prueba `
        + `(${muestra}): leídos día/mes, como se leen por defecto, quedarían fechados al revés`
        + (unico === 'mdy' ? ' —el 1/05 sería el 1 de mayo, no el 5 de enero—' : '') };
  }
  if (!conFecha.length) {
    return { ...base, mezcla: false, orden: 'dmy', seguro: false,
      porQue: 'las fechas no vienen escritas (serial de Excel): no hay orden que decidir' };
  }
  if (unico) {
    return { ...base, mezcla: false, orden: unico, seguro: true,
      porQue: `${conPrueba.length} archivo(s) demuestran ${dicho(unico)}`
        + (sinPrueba.length ? `; los ${sinPrueba.length} sin prueba se leen igual: son la misma exportación` : '') };
  }
  return { ...base, mezcla: false, orden: 'dmy', seguro: false,
    porQue: 'ningún archivo lo desempata —ninguno trae un día mayor que 12—: se lee día/mes, que es como '
      + 'se escribe aquí. Es una suposición, no un hecho' };
}

/**
 * Cuántas señales de la MISMA magnitud y el MISMO estadístico caben en un día:
 * las tres fases. Una cuarta —o una fase que aparece dos veces— es otra bahía o
 * el mismo dato bajado dos veces, y combinarlo no da error: da un número que no
 * midió nadie (`99 §ADR-105/117/127`).
 */
export const FASES_POR_MAGNITUD = 3;

/**
 * ¿ALGÚN DÍA TRAE MÁS SEÑALES DE LAS QUE CABEN EN UNA MAGNITUD?
 *
 * ⚠️ EN TODOS LOS DÍAS, no en el primero. La pantalla lo contaba sobre el día
 * más antiguo de la carga, así que un «(1)» del día 14 —una cuarta corriente—
 * pasaba sin que nadie lo mirara, y `combinar()` lo juntaba con las otras tres.
 *
 * Se cuenta por día, magnitud y estadístico —el máximo y el promedio de la fase
 * R son dos señales legítimas— y se señala en dos casos:
 *   · más de `tope` señales: más que las tres fases;
 *   · la MISMA fase dos veces, aunque sean tres o menos: febrero trae días a los
 *     que les falta una fase, y uno de ésos con un «(1)» pasaría el tope con dos
 *     erres dentro.
 *
 * Devuelve además TODAS las etiquetas de la carga, para que quien siembre «no
 * usar» siembre también las que el primer día no trae.
 *
 * @param {{fecha?: string|null, matriz: any[][], estadisticoPorFila?: Record<number, string|null>|null}[]} dias
 * @param {{tope?: number}} [opciones]
 * @returns {{ambiguo: boolean,
 *            excesos: {fecha: string|null, campo: string, estadistico: string|null,
 *                      senales: number, fase: string|null, porQue: string}[],
 *            etiquetas: string[]}}
 */
export function revisarFasesPorDia(dias, { tope = FASES_POR_MAGNITUD } = {}) {
  const excesos = [];
  const etiquetas = new Set();
  for (const d of (dias ?? []).filter((x) => x && Array.isArray(x.matriz))) {
    const eje = encontrarEjeDeTiempo(d.matriz);
    if (!eje) continue;
    const cubos = new Map();
    for (const s of leerSenales(d.matriz, eje)) {
      etiquetas.add(s.etiqueta);
      const propuesta = campoDeSenal(s.etiqueta);
      if (!propuesta) continue;
      const estadistico = d.estadisticoPorFila?.[s.fila] ?? null;
      const k = `${propuesta.campo}|${estadistico ?? '—'}`;
      if (!cubos.has(k)) cubos.set(k, { campo: propuesta.campo, estadistico, fases: [] });
      cubos.get(k).fases.push(propuesta.fase);
    }
    for (const c of cubos.values()) {
      const conFase = c.fases.filter(Boolean);
      const fase = conFase.find((f, i) => conFase.indexOf(f) !== i) ?? null;
      if (c.fases.length <= tope && !fase) continue;
      const que = `${CAMPOS[c.campo]?.rotulo ?? c.campo}`
        + (c.estadistico ? ` del ${ESTADISTICOS.find((e) => e.id === c.estadistico)?.rotulo ?? c.estadistico}` : '');
      const cuando = d.fecha ?? 'el archivo';
      excesos.push({
        fecha: d.fecha ?? null, campo: c.campo, estadistico: c.estadistico, senales: c.fases.length, fase,
        porQue: c.fases.length > tope
          ? `${cuando} · ${que}: ${c.fases.length} señales, más que las ${tope} fases`
          : `${cuando} · ${que}: la fase ${fase} viene ${conFase.filter((f) => f === fase).length} veces`,
      });
    }
  }
  return { ambiguo: excesos.length > 0, excesos, etiquetas: [...etiquetas] };
}

/**
 * DE QUÉ ESTADÍSTICO ES CADA FILA, con lo que el Ingeniero haya corregido.
 *
 * ⚠️ POR ARCHIVO, y en TODOS los días. La corrección se hace sobre un archivo
 * cuyo nombre no lo dice —o lo dice mal—, y la pantalla la aplicaba traduciendo
 * «estadístico DETECTADO → corregido» y SOLO en el primer día: dos archivos sin
 * marca corregidos distinto caían en el mismo, y en los demás días seguían sin
 * estadístico, que es entrar en TODOS los que se guardan.
 *
 * Una corrección vacía («no lo dice») deja la fila sin estadístico, igual que la
 * cuenta la pantalla: lo que se enseña y lo que se lee no pueden discrepar.
 *
 * @param {{fila: number, nombre: string, estadistico: string|null}[]|null} senales  las de `unirAnchas`
 * @param {Record<string, string>} [corregido]  nombre del archivo → estadístico
 * @returns {Record<number, string|null>}
 */
export function estadisticoPorFilaCorregido(senales, corregido = {}) {
  return Object.fromEntries((senales ?? []).map((a) => [a.fila,
    corregido && Object.hasOwn(corregido, a.nombre) ? (corregido[a.nombre] || null) : (a.estadistico ?? null)]));
}

/**
 * VARIOS DÍAS, UNA SOLA LECTURA.
 *
 * Cada día se lee con `registrosDesdeAncho` —su matriz, su eje— y con las MISMAS
 * decisiones: línea, criterio, estadístico y asignación. La asignación va POR
 * ETIQUETA: la de fila solo vale dentro de una matriz, así que aquí se NIEGA en
 * vez de aplicarse, callada, a la señal equivocada de otro día.
 *
 * Devuelve lo del primer día —su eje y sus señales, que es lo que ya miraban los
 * avisos— más `registros` de TODOS y `senalesDeLaCarga`: cada señal una vez por
 * estadístico, venga del día que venga, con los días en que aparece. Ésa es la
 * lista para asignar: una señal que el primer día no trae también se tiene que
 * poder ver y quitar.
 *
 * @param {{fecha?: string|null, matriz: any[][], estadisticoPorFila?: Record<number, string|null>|null}[]} dias
 * @param {OpcionesAncho} [opciones]
 */
export function registrosDeVariosDias(dias, opciones = {}) {
  const { asignado, ...resto } = opciones;
  if (asignado && Object.keys(asignado).length) {
    throw new Error('la asignación por número de fila no vale entre días —cada día trae sus señales en '
      + 'otro orden—: se pasa por etiqueta, en `asignadoPorEtiqueta`');
  }
  const lista = (dias ?? []).filter((d) => d && Array.isArray(d.matriz));
  const leidos = lista.map((d) => registrosDesdeAncho(d.matriz, {
    ...resto, estadisticoPorFila: d.estadisticoPorFila ?? null,
  }));
  /** @type {Map<string, ReturnType<typeof registrosDesdeAncho>['senales'][number] & {fechas: (string|null)[]}>} */
  const vistas = new Map();
  leidos.forEach((r, i) => {
    const fecha = lista[i].fecha ?? null;
    for (const s of r.senales) {
      const k = `${s.estadistico ?? '—'} ${s.etiqueta}`;
      if (!vistas.has(k)) vistas.set(k, { ...s, fechas: [] });
      const suyas = vistas.get(k).fechas;
      if (suyas[suyas.length - 1] !== fecha) suyas.push(fecha);
    }
  });
  const primero = leidos[0] ?? registrosDesdeAncho([], {});
  return {
    ...primero,
    registros: leidos.flatMap((r) => r.registros),
    estadisticos: [...new Set(leidos.flatMap((r) => r.estadisticos ?? []))],
    senalesDeLaCarga: [...vistas.values()],
    porQue: leidos.length > 1 ? `${leidos.length} días; el primero: ${primero.porQue}` : primero.porQue,
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
