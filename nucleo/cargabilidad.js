// ============================================================================
// nucleo/cargabilidad.js — la cargabilidad ELÉCTRICA de una línea, en crudo
// ----------------------------------------------------------------------------
// QUÉ ES. Cuánta corriente circula por una línea frente a la que puede llevar.
// Es un dato de OPERACIÓN —viene de SCADA, de un informe, de un Excel— y no se
// deduce de la geometría ni del conductor. Este módulo lo lee, lo valida, lo
// resume y lo analiza. Nada más: aquí no hay pantalla, ni red, ni base.
//
// ⚠️ LAS DOS TRAMPAS DE ESTE DOMINIO, Y CÓMO SE CIERRAN AQUÍ
//
// 1. **HAY DOS CARGABILIDADES Y NO SON LA MISMA.** El archivo trae un «%» que
//    alguien ya calculó, casi siempre contra la capacidad NOMINAL (de placa).
//    Este sistema, además, calcula la ampacidad real por IEEE 738 con el clima
//    del día (`nucleo/termica.js`), y esa capacidad **se mueve**: un día en
//    calma le quita al conductor cerca de un tercio. El mismo amperaje puede ser
//    «71 % de placa» y «100 % de hoy».
//
//    Por eso aquí el porcentaje del archivo se guarda **declarado por la
//    fuente** (`naturaleza: 'declarada'`) y NUNCA se sobrescribe con uno
//    recalculado. Cuando se conoce la ampacidad se ofrece el CONTRASTE, con las
//    dos cifras a la vista y dicho cuál es cuál. Es la misma regla que ya rige
//    los atlas desde `99 §ADR-086/087`: **una magnitud sin su naturaleza
//    declarada es una magnitud que miente**, y no hay valor por defecto.
//
// 2. **UN HUECO NO ES UN CERO.** Una hora sin lectura vale `null` y se cuenta
//    aparte. Un `?? 0` metería «0 % de carga» —que en una línea de transmisión
//    es un hecho grave: la línea está fuera— entre las medidas buenas, y bajaría
//    los promedios sin que nadie lo note. Es la misma lección del byte 0 de las
//    rejillas del mapa (`99 §ADR-046`).
//
// FUNCIONES PURAS. Entran filas, salen números. Sin DOM, sin `fetch`, sin
// Firestore y sin `node:` — igual que el resto de `nucleo/` (`CLAUDE.md §3.1`).
// Quien lea el Excel, quien guarde y quien pinte son otros; si esto tuviera su
// propia aritmética, el día que discrepe de la pantalla nadie sabría cuál mirar.
// ============================================================================

/** Redondeo estable a `n` decimales, sin arrastrar el error binario. */
const r = (v, n = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** n) / 10 ** n);

// ════════════════════════════════════════════════════════════════════════════
// 1 · LOS CAMPOS QUE ESTE SISTEMA ENTIENDE
// ════════════════════════════════════════════════════════════════════════════

/**
 * EL CATÁLOGO DE CAMPOS — un solo sitio, y solo uno.
 *
 * `requerido` significa que sin él la fila NO ES UN REGISTRO: no se puede fechar
 * ni atribuir a una línea, así que no se guarda. Todo lo demás es opcional y su
 * ausencia se declara, nunca se rellena.
 *
 * ⚠️ `cargabilidad_pct` NO es requerido a propósito. Un archivo que traiga
 * corriente y capacidad, sin el porcentaje ya hecho, es un archivo VÁLIDO — y de
 * hecho es el mejor de los dos, porque deja el cálculo de este lado, donde se
 * sabe con qué capacidad se hizo.
 *
 * @type {Record<string, {rotulo: string, tipo: string, unidad?: string, requerido: boolean}>}
 */
export const CAMPOS = {
  fecha: { rotulo: 'Fecha', tipo: 'fecha', requerido: true },
  hora: { rotulo: 'Hora', tipo: 'hora', requerido: false },
  linea: { rotulo: 'Línea', tipo: 'texto', requerido: true },
  circuito: { rotulo: 'Circuito', tipo: 'texto', requerido: false },
  subestacionOrigen: { rotulo: 'Subestación origen', tipo: 'texto', requerido: false },
  subestacionDestino: { rotulo: 'Subestación destino', tipo: 'texto', requerido: false },
  cargabilidad_pct: { rotulo: 'Cargabilidad', tipo: 'numero', unidad: '%', requerido: false },
  corriente_A: { rotulo: 'Corriente', tipo: 'numero', unidad: 'A', requerido: false },
  potenciaActiva_MW: { rotulo: 'Potencia activa', tipo: 'numero', unidad: 'MW', requerido: false },
  potenciaReactiva_MVAr: { rotulo: 'Potencia reactiva', tipo: 'numero', unidad: 'MVAr', requerido: false },
  tension_kV: { rotulo: 'Tensión', tipo: 'numero', unidad: 'kV', requerido: false },
  capacidadNominal_A: { rotulo: 'Capacidad nominal', tipo: 'numero', unidad: 'A', requerido: false },
  estado: { rotulo: 'Estado', tipo: 'texto', requerido: false },
  observaciones: { rotulo: 'Observaciones', tipo: 'texto', requerido: false },
};

export const CAMPOS_REQUERIDOS = Object.keys(CAMPOS).filter((k) => CAMPOS[k].requerido);

/**
 * CÓMO SE LLAMA CADA CAMPO EN LOS ARCHIVOS DE VERDAD.
 *
 * No es una lista de cortesía: es lo que evita que el usuario tenga que mapear a
 * mano trece columnas cada vez. Se compara sin tildes, sin mayúsculas y sin
 * signos, así que «% Carga», «%CARGA» y «porcentaje de carga» caen en el mismo
 * sitio. Lo que NO se hace es adivinar por parecido libre: si una cabecera no
 * está aquí, se pregunta — mapear mal una columna es peor que no mapearla,
 * porque el error sale con cara de dato bueno.
 */
export const SINONIMOS = {
  fecha: ['fecha', 'fecha lectura', 'fecha de lectura', 'fecha registro', 'dia', 'date'],
  hora: ['hora', 'hora registro', 'hora lectura', 'hora de registro', 'time', 'periodo'],
  linea: ['linea', 'nombre linea', 'nombre de linea', 'circuito linea', 'elemento', 'line'],
  circuito: ['circuito', 'ckto', 'ckt', 'numero de circuito'],
  subestacionOrigen: ['subestacion origen', 'se origen', 'origen', 'subestacion inicial', 'from'],
  subestacionDestino: ['subestacion destino', 'se destino', 'destino', 'subestacion final', 'to'],
  cargabilidad_pct: ['cargabilidad', 'cargabilidad porcentual', 'carga', 'porcentaje de carga',
    'porcentaje carga', 'cargabilidad %', '% carga', '% cargabilidad', 'loading', 'utilizacion'],
  corriente_A: ['corriente', 'corriente a', 'amperios', 'amperaje', 'i', 'current'],
  potenciaActiva_MW: ['potencia activa', 'potencia', 'mw', 'p', 'active power'],
  potenciaReactiva_MVAr: ['potencia reactiva', 'mvar', 'q', 'reactive power'],
  tension_kV: ['tension', 'voltaje', 'kv', 'v', 'voltage'],
  capacidadNominal_A: ['capacidad nominal', 'capacidad', 'capacidad nominal de la linea',
    'ampacidad nominal', 'corriente nominal', 'limite', 'capacidad a'],
  estado: ['estado', 'condicion', 'condicion operativa', 'estado operativo', 'status'],
  observaciones: ['observaciones', 'observacion', 'nota', 'notas', 'comentario', 'comentarios'],
};

/** Sin tildes, sin signos, sin dobles espacios y en minúsculas. */
export function normalizarCabecera(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * QUÉ COLUMNA DEL ARCHIVO ES QUÉ CAMPO — propuesta, no veredicto.
 *
 * Devuelve el mapeo que se ha podido deducir, las cabeceras que no se
 * reconocieron y los campos requeridos que faltan. **La aplicación tiene que
 * enseñarlo y dejar corregirlo antes de guardar nada**: una columna mapeada mal
 * no da error, da un número equivocado con cara de bueno.
 *
 * ⚠️ Una cabecera solo se asigna a UN campo, y el primer campo que la reclama se
 * la queda por orden del catálogo. Sin eso, «corriente nominal» caería a la vez
 * en `corriente_A` y en `capacidadNominal_A`, y la línea saldría al 100 % fijo.
 *
 * @param {string[]} cabeceras
 * @returns {{mapeo: Record<string, string>, sinReconocer: string[],
 *            faltanRequeridos: string[], completo: boolean}}
 */
export function detectarMapeo(cabeceras) {
  const vistas = (cabeceras ?? []).map((c) => ({ original: c, norma: normalizarCabecera(c) }));
  const mapeo = {};
  const usadas = new Set();

  for (const campo of Object.keys(CAMPOS)) {
    const alias = SINONIMOS[campo] ?? [];
    // Primero la coincidencia EXACTA; solo si no la hay, la que empieza igual.
    // Buscar por «contiene» a la primera casaba «corriente» dentro de
    // «corriente nominal» y se llevaba la capacidad por delante.
    let hallada = vistas.find((v) => !usadas.has(v.original) && alias.includes(v.norma));
    if (!hallada) {
      hallada = vistas.find((v) => !usadas.has(v.original)
        && alias.some((a) => v.norma === a || v.norma.startsWith(`${a} `)));
    }
    if (hallada) { mapeo[campo] = hallada.original; usadas.add(hallada.original); }
  }

  const faltanRequeridos = CAMPOS_REQUERIDOS.filter((c) => !mapeo[c]);
  return {
    mapeo,
    sinReconocer: vistas.filter((v) => !usadas.has(v.original)).map((v) => v.original),
    faltanRequeridos,
    /** ¿Se puede procesar ya, o hay que pedirle al usuario que mapee a mano? */
    completo: faltanRequeridos.length === 0,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · DE LA CELDA AL VALOR — donde se pierden los datos sin avisar
// ════════════════════════════════════════════════════════════════════════════

/**
 * Un número de una celda, con las dos costumbres colombianas: coma decimal y
 * punto de miles. Devuelve `null` si no hay número — jamás `0`.
 *
 * ⚠️ `'1.234,5'` son mil doscientos treinta y cuatro con cinco, y `'1.234'`
 * puede ser mil doscientos treinta y cuatro **o** uno con doscientos treinta y
 * cuatro. Se resuelve por la regla del separador: si hay coma, el punto es de
 * miles; si solo hay punto y deja exactamente tres cifras detrás **y hay más de
 * un punto o el número empieza por más de tres cifras**, es de miles. Ante la
 * duda irresoluble se respeta el punto como decimal, que es lo que hace una hoja
 * de cálculo al exportar.
 */
export function aNumero(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/\s|%/g, '');
  if (!s) return null;
  const negativo = /^\(.*\)$/.test(s);          // (1.234) = negativo, contable
  if (negativo) s = s.slice(1, -1);
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

/**
 * Una fecha de una celda → `AAAA-MM-DD`, o `null`.
 *
 * Admite `Date`, el serial de Excel, ISO y `dd/mm/aaaa`. ⚠️ **`dd/mm` y no
 * `mm/dd`**: es un archivo colombiano, y leer 03/04 como 4 de marzo mueve un mes
 * entero de datos sin dar un solo error. Si el día es > 12 la ambigüedad se
 * resuelve sola; si no, manda la convención local.
 */
export function aFecha(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Serial de Excel: días desde el 1899-12-30 (el 30 y no el 31: Excel cree
    // que 1900 fue bisiesto y ese error está en el formato desde 1985).
    const ms = Math.round(v) * 86400000 + Date.UTC(1899, 11, 30);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    const d = +m[1]; const mes = +m[2];
    let anio = +m[3];
    if (anio < 100) anio += anio < 70 ? 2000 : 1900;
    if (d < 1 || d > 31 || mes < 1 || mes > 12) return null;
    return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

/**
 * Una hora de una celda → entero 0-23, o `null`.
 *
 * Admite `13`, `13:00`, `13:45:00` y la fracción de día de Excel (0,5 = 12:00).
 * Se queda con la HORA y descarta los minutos a propósito: el análisis de este
 * módulo es horario, y guardar 13:45 como si fuera una hora distinta de 13:00
 * partiría la serie en huecos falsos.
 */
export function aHora(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v >= 0 && v < 1) return Math.floor(v * 24);         // fracción de día
    if (v >= 0 && v <= 23 && Number.isInteger(v)) return v;
    return null;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})(?::(\d{1,2}))?/);
  if (!m) return null;
  const h = +m[1];
  return h >= 0 && h <= 23 ? h : null;
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · LA FILA → EL REGISTRO, con sus errores dichos
// ════════════════════════════════════════════════════════════════════════════

/**
 * EL PORCENTAJE, LEÍDO SIN INVENTAR ESCALA.
 *
 * Un archivo puede traer `85`, `85 %` u `0,85`. Convertir «todo lo menor que 1»
 * a porcentaje sería cómodo y **falso**: una línea al 0,8 % existe (línea casi
 * descargada) y quedaría convertida en 80 %. Así que la escala se DECIDE por
 * columna, mirando el lote entero, no fila por fila — y si el lote es ambiguo se
 * declara ambiguo y se pregunta.
 */
export function escalaDelPorcentaje(valores) {
  const xs = valores.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!xs.length) return { escala: null, porQue: 'no hay ni un porcentaje legible' };
  const max = Math.max(...xs);
  if (max > 1.5) return { escala: 1, porQue: `hay valores hasta ${r(max, 1)}: ya viene en %` };
  if (xs.every((v) => v >= 0 && v <= 1)) {
    return {
      escala: 100,
      porQue: `ningún valor pasa de 1 (máximo ${r(max, 3)}): viene en fracción y se multiplica por 100`,
    };
  }
  return { escala: null, porQue: 'la columna mezcla valores por encima y por debajo de 1' };
}

/**
 * Una fila del archivo → un registro tipado, o la lista de por qué no.
 *
 * `escalaPct` la decide `escalaDelPorcentaje` sobre el LOTE y se pasa aquí:
 * dejar que cada fila adivine su escala haría que dos filas del mismo archivo se
 * leyeran con reglas distintas.
 */
export function normalizarFila(fila, mapeo, { escalaPct = 1, nFila = null } = {}) {
  const errores = [];
  const leer = (campo) => (mapeo[campo] ? fila[mapeo[campo]] : undefined);

  const fecha = aFecha(leer('fecha'));
  if (!fecha) errores.push({ campo: 'fecha', valor: leer('fecha'), porQue: 'no es una fecha legible' });

  const linea = String(leer('linea') ?? '').trim();
  if (!linea) errores.push({ campo: 'linea', valor: leer('linea'), porQue: 'la línea viene vacía' });

  const hora = aHora(leer('hora'));
  if (mapeo.hora && leer('hora') != null && leer('hora') !== '' && hora === null) {
    errores.push({ campo: 'hora', valor: leer('hora'), porQue: 'no es una hora entre 0 y 23' });
  }

  const pctCrudo = aNumero(leer('cargabilidad_pct'));
  const cargabilidad_pct = pctCrudo == null ? null : r(pctCrudo * escalaPct, 2);
  if (cargabilidad_pct != null && (cargabilidad_pct < 0 || cargabilidad_pct > 400)) {
    // 400 % no es un tope de norma: es el filtro de lo IMPOSIBLE. Por encima de
    // ahí no hay una línea sobrecargada, hay una celda mal leída — y colarla
    // dispara la escala de todas las gráficas y esconde el resto.
    errores.push({
      campo: 'cargabilidad_pct', valor: pctCrudo,
      porQue: `${r(cargabilidad_pct, 1)} % está fuera de lo físicamente creíble (0-400 %)`,
    });
  }

  if (errores.length) return { registro: null, errores: errores.map((e) => ({ ...e, nFila })) };

  return {
    registro: {
      fecha,
      hora,
      linea,
      circuito: String(leer('circuito') ?? '').trim() || null,
      subestacionOrigen: String(leer('subestacionOrigen') ?? '').trim() || null,
      subestacionDestino: String(leer('subestacionDestino') ?? '').trim() || null,
      cargabilidad_pct,
      corriente_A: aNumero(leer('corriente_A')),
      potenciaActiva_MW: aNumero(leer('potenciaActiva_MW')),
      potenciaReactiva_MVAr: aNumero(leer('potenciaReactiva_MVAr')),
      tension_kV: aNumero(leer('tension_kV')),
      capacidadNominal_A: aNumero(leer('capacidadNominal_A')),
      estado: String(leer('estado') ?? '').trim() || null,
      observaciones: String(leer('observaciones') ?? '').trim() || null,
      /**
       * ⚠️ DE DÓNDE SALE EL PORCENTAJE. `declarada` = lo trajo el archivo;
       * `derivada` = lo calculamos aquí de corriente y capacidad NOMINAL del
       * propio archivo. Nunca se mezcla con la ampacidad IEEE 738 del sistema:
       * ésa es otra capacidad y se contrasta aparte (`contrasteConLaAmpacidad`).
       */
      naturaleza: cargabilidad_pct != null ? 'declarada' : null,
    },
    errores: [],
  };
}

/**
 * El lote entero: registros buenos, filas malas y de qué murió cada una.
 * Devuelve TAMBIÉN las filas con error para poder descargarlas — un archivo que
 * dice «317 registros con error» y no dice cuáles obliga a revisarlo a ojo.
 *
 * @param {Record<string, unknown>[]} filas
 * @param {Record<string, string>} mapeo
 * @returns {{registros: Record<string, any>[],
 *            errores: {nFila: number|null, campo: string, valor: unknown, porQue: string}[],
 *            escalaPct: {escala: number|null, porQue: string, ambigua: boolean},
 *            resumen: {filas: number, correctos: number, conError: number, camposPorLlenar: string[]}}}
 */
export function procesarLote(filas, mapeo) {
  const columnaPct = mapeo.cargabilidad_pct;
  const { escala, porQue } = columnaPct
    ? escalaDelPorcentaje(filas.map((f) => aNumero(f[columnaPct])))
    : { escala: 1, porQue: 'el archivo no trae porcentaje: se derivará si hay corriente y capacidad' };

  const registros = [];
  const errores = [];
  filas.forEach((fila, i) => {
    const res = normalizarFila(fila, mapeo, { escalaPct: escala ?? 1, nFila: i + 2 });  // +2: cabecera y base 1
    if (res.registro) registros.push(derivarPorcentaje(res.registro));
    else errores.push(...res.errores);
  });

  return {
    registros,
    errores,
    escalaPct: { escala, porQue, ambigua: escala == null },
    resumen: {
      filas: filas.length,
      correctos: registros.length,
      conError: filas.length - registros.length,
      camposPorLlenar: camposAusentes(registros),
    },
  };
}

/**
 * Si el archivo no trajo el porcentaje pero sí corriente y capacidad NOMINAL, se
 * calcula — y se marca `derivada`, para que en pantalla no se confunda con el
 * que venía hecho. No se toca el que ya venía: dos dueños del mismo número es lo
 * que este proyecto lleva evitando desde `99 §ADR-052`.
 */
export function derivarPorcentaje(reg) {
  if (reg.cargabilidad_pct != null) return reg;
  if (reg.corriente_A == null || !reg.capacidadNominal_A) return reg;
  return {
    ...reg,
    cargabilidad_pct: r((reg.corriente_A / reg.capacidadNominal_A) * 100, 2),
    naturaleza: 'derivada',
  };
}

/**
 * Qué campos opcionales no trajo NI UNA fila. Se dice, no se rellena.
 * @param {Record<string, any>[]} registros
 * @returns {string[]}
 */
export function camposAusentes(registros) {
  if (!registros.length) return Object.keys(CAMPOS);
  return Object.keys(CAMPOS).filter((c) => registros.every((reg) => reg[c] == null));
}

// ════════════════════════════════════════════════════════════════════════════
// 4 · IDENTIDAD Y DUPLICADOS
// ════════════════════════════════════════════════════════════════════════════

/**
 * QUIÉN ES UN REGISTRO. Línea + circuito + fecha + hora.
 *
 * ⚠️ La identidad NO incluye el valor: si se vuelve a cargar el mismo archivo
 * corregido, el registro es EL MISMO instante y lo que cambia es su medida. Si
 * el valor entrara en la clave, una corrección crearía un registro nuevo y la
 * hora tendría dos verdades. Qué hacer ante un choque —conservar o reemplazar—
 * es decisión de quien guarda, no de esta función.
 */
export function claveDeRegistro(reg) {
  const hora = reg.hora == null ? 'D' : String(reg.hora).padStart(2, '0');
  return [reg.linea, reg.circuito ?? '-', reg.fecha, hora].join('|');
}

/**
 * Lo que YA estaba y lo que es NUEVO, contra un conjunto de claves conocidas.
 * `repetidosEnElLote` son los que el propio archivo trae dos veces: eso no es un
 * duplicado contra el histórico, es un archivo con un problema, y se dice aparte.
 */
export function separarNuevos(registros, clavesConocidas = new Set()) {
  const nuevos = []; const yaEstaban = []; const repetidosEnElLote = [];
  const vistas = new Set();
  for (const reg of registros) {
    const k = claveDeRegistro(reg);
    if (vistas.has(k)) { repetidosEnElLote.push(reg); continue; }
    vistas.add(k);
    (clavesConocidas.has(k) ? yaEstaban : nuevos).push(reg);
  }
  return { nuevos, yaEstaban, repetidosEnElLote };
}

// ════════════════════════════════════════════════════════════════════════════
// 5 · LAS BANDAS — y por qué el color no decide nada
// ════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ ESTAS BANDAS SON DE LECTURA, NO UN DICTAMEN. El 80/90/100 es la convención
 * de operación que pidió el Ingeniero para leer el mapa de un vistazo; **no sale
 * de una norma citada** y por eso ninguna pieza de este sistema convierte un
 * color en un veredicto firmable. El veredicto de una línea sale de comparar la
 * corriente con la ampacidad del día (`nucleo/umbrales.js` §8), y ése sí declara
 * su fuente (IEEE 738).
 */
export const BANDAS = [
  { clave: 'normal', desde: 0, hasta: 80, rotulo: 'Operación normal' },
  { clave: 'elevada', desde: 80, hasta: 90, rotulo: 'Cargabilidad elevada' },
  { clave: 'atencion', desde: 90, hasta: 100, rotulo: 'Condición de atención' },
  { clave: 'sobrecarga', desde: 100, hasta: Infinity, rotulo: 'Sobrecarga' },
];

/**
 * @param {number|null|undefined} pct
 * @returns {{clave: string, desde: number, hasta: number, rotulo: string}|null}
 */
export function bandaDe(pct) {
  if (pct == null || !Number.isFinite(pct)) return null;
  return BANDAS.find((b) => pct >= b.desde && pct < b.hasta) ?? BANDAS[BANDAS.length - 1];
}

// ════════════════════════════════════════════════════════════════════════════
// 6 · EL RESUMEN QUE VE EL INGENIERO
// ════════════════════════════════════════════════════════════════════════════

const conPct = (rs) => rs.filter((x) => x.cargabilidad_pct != null);

/**
 * Los indicadores del tablero. Todo `null` cuando no hay con qué: un panel que
 * enseña «0 %» sobre cero registros afirma algo que nadie midió.
 */
export function resumen(registros) {
  const rs = registros ?? [];
  const buenos = conPct(rs);
  const lineas = [...new Set(rs.map((x) => x.linea))];

  if (!buenos.length) {
    return {
      registros: rs.length, lineas: lineas.length, conMedida: 0,
      disponibilidad_pct: rs.length ? 0 : null,
      maxima: null, minima: null, promedio: null,
      lineaMasCargada: null, horaPico: null, eventosSobrecarga: 0, porBanda: bandasVacias(),
    };
  }

  const pcts = buenos.map((x) => x.cargabilidad_pct);
  const max = buenos.reduce((a, b) => (b.cargabilidad_pct > a.cargabilidad_pct ? b : a));
  const min = buenos.reduce((a, b) => (b.cargabilidad_pct < a.cargabilidad_pct ? b : a));

  // La hora pico se decide por el PROMEDIO de esa hora, no por el máximo
  // absoluto: un pico aislado a las 3 a.m. no hace de las 3 la hora de mayor
  // demanda, y decirlo mandaría a mirar donde no es.
  const porHora = new Map();
  for (const x of buenos) {
    if (x.hora == null) continue;
    if (!porHora.has(x.hora)) porHora.set(x.hora, []);
    porHora.get(x.hora).push(x.cargabilidad_pct);
  }
  let horaPico = null;
  for (const [h, xs] of porHora) {
    const media = xs.reduce((a, b) => a + b, 0) / xs.length;
    if (!horaPico || media > horaPico.promedio_pct) {
      horaPico = { hora: h, promedio_pct: r(media), n: xs.length };
    }
  }

  const porLineaProm = new Map();
  for (const x of buenos) {
    if (!porLineaProm.has(x.linea)) porLineaProm.set(x.linea, []);
    porLineaProm.get(x.linea).push(x.cargabilidad_pct);
  }
  let masCargada = null;
  for (const [linea, xs] of porLineaProm) {
    const pico = Math.max(...xs);
    if (!masCargada || pico > masCargada.maxima_pct) {
      masCargada = { linea, maxima_pct: r(pico), promedio_pct: r(xs.reduce((a, b) => a + b, 0) / xs.length) };
    }
  }

  return {
    registros: rs.length,
    lineas: lineas.length,
    conMedida: buenos.length,
    /** Qué parte de lo cargado trae medida. El resto son huecos, y se dicen. */
    disponibilidad_pct: r((buenos.length / rs.length) * 100, 1),
    maxima: { pct: r(max.cargabilidad_pct), linea: max.linea, fecha: max.fecha, hora: max.hora },
    minima: { pct: r(min.cargabilidad_pct), linea: min.linea, fecha: min.fecha, hora: min.hora },
    promedio: r(pcts.reduce((a, b) => a + b, 0) / pcts.length),
    lineaMasCargada: masCargada,
    horaPico,
    eventosSobrecarga: buenos.filter((x) => x.cargabilidad_pct >= 100).length,
    porBanda: contarBandas(buenos),
  };
}

function bandasVacias() {
  return Object.fromEntries(BANDAS.map((b) => [b.clave, 0]));
}

export function contarBandas(registros) {
  const out = bandasVacias();
  for (const x of conPct(registros)) out[bandaDe(x.cargabilidad_pct).clave] += 1;
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// 7 · LAS VISTAS QUE PIDEN LAS GRÁFICAS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Barras y ranking: una fila por línea, con las cuatro medidas que se piden.
 * @param {Record<string, any>[]} registros
 * @returns {{linea: string, n: number, promedio: number|null, maximo: number|null,
 *            minimo: number|null, ultimo: number|null,
 *            ultimoInstante: {fecha: string, hora: number|null}, sobrecargas: number}[]}
 */
export function porLinea(registros) {
  const mapa = new Map();
  for (const x of conPct(registros)) {
    if (!mapa.has(x.linea)) mapa.set(x.linea, []);
    mapa.get(x.linea).push(x);
  }
  return [...mapa.entries()].map(([linea, xs]) => {
    const pcts = xs.map((v) => v.cargabilidad_pct);
    const ultimo = [...xs].sort(comparaInstante).at(-1);
    return {
      linea,
      n: xs.length,
      promedio: r(pcts.reduce((a, b) => a + b, 0) / pcts.length),
      maximo: r(Math.max(...pcts)),
      minimo: r(Math.min(...pcts)),
      ultimo: r(ultimo.cargabilidad_pct),
      ultimoInstante: { fecha: ultimo.fecha, hora: ultimo.hora },
      sobrecargas: pcts.filter((p) => p >= 100).length,
    };
  }).sort((a, b) => b.promedio - a.promedio);
}

const comparaInstante = (a, b) =>
  (a.fecha === b.fecha ? (a.hora ?? -1) - (b.hora ?? -1) : (a.fecha < b.fecha ? -1 : 1));

/**
 * La serie de una línea, ordenada en el tiempo. Es lo que pinta la tendencia.
 * @param {Record<string, any>[]} registros
 * @param {string|null} [linea] `null` = todas, una detrás de otra.
 * @returns {{fecha: string, hora: number|null, pct: number, linea: string}[]}
 */
export function serieTemporal(registros, linea = null) {
  return conPct(registros)
    .filter((x) => linea == null || x.linea === linea)
    .sort(comparaInstante)
    .map((x) => ({ fecha: x.fecha, hora: x.hora, pct: x.cargabilidad_pct, linea: x.linea }));
}

/**
 * Mapa de calor: filas = líneas, columnas = horas (o fechas).
 * La celda sin medida vale `null` y **no se pinta**, que no es lo mismo que
 * pintarla del color del cero.
 *
 * @param {Record<string, any>[]} registros
 * @param {'hora'|'fecha'} [eje]
 * @returns {{eje: string, lineas: string[], columnas: (string|number)[],
 *            celdas: ({pct: number|null, n: number, banda: string}|null)[][]}}
 */
export function mapaDeCalor(registros, eje = 'hora') {
  const lineas = [...new Set(conPct(registros).map((x) => x.linea))].sort();
  const columnas = eje === 'hora'
    ? Array.from({ length: 24 }, (_, i) => i)
    : [...new Set(conPct(registros).map((x) => x.fecha))].sort();

  const acumulado = new Map();
  for (const x of conPct(registros)) {
    const col = eje === 'hora' ? x.hora : x.fecha;
    if (col == null) continue;
    const k = `${x.linea}|${col}`;
    if (!acumulado.has(k)) acumulado.set(k, []);
    acumulado.get(k).push(x.cargabilidad_pct);
  }

  return {
    eje,
    lineas,
    columnas,
    celdas: lineas.map((l) => columnas.map((c) => {
      const xs = acumulado.get(`${l}|${c}`);
      if (!xs) return null;
      // El MÁXIMO y no el promedio: en un mapa de calor de cargabilidad lo que
      // interesa es si esa hora tocó una banda alta, no si de media estuvo bien.
      const pico = Math.max(...xs);
      return { pct: r(pico), n: xs.length, banda: bandaDe(pico).clave };
    })),
  };
}

/**
 * Histograma por anchos fijos. El último tramo recoge todo lo que se pase.
 * @param {Record<string, any>[]} registros
 * @returns {{desde: number, hasta: number, n: number, banda: string}[]}
 */
export function histograma(registros, ancho = 10) {
  const xs = conPct(registros).map((x) => x.cargabilidad_pct);
  if (!xs.length) return [];
  const tope = Math.max(100, Math.ceil(Math.max(...xs) / ancho) * ancho);
  const tramos = [];
  for (let d = 0; d < tope; d += ancho) {
    tramos.push({ desde: d, hasta: d + ancho, n: 0, banda: bandaDe(d).clave });
  }
  for (const v of xs) {
    const i = Math.min(Math.floor(v / ancho), tramos.length - 1);
    tramos[i].n += 1;
  }
  return tramos;
}

// ════════════════════════════════════════════════════════════════════════════
// 8 · TENDENCIA, PROMEDIO MÓVIL Y ATÍPICOS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Hacia dónde va la serie: pendiente por mínimos cuadrados y variación entre el
 * primer y el último tercio.
 *
 * ⚠️ **Una tendencia con pocos puntos no es una tendencia**, y decirlo es la
 * mitad del valor de esta función: por debajo de `minimo` devuelve `null` y la
 * pantalla tiene que callar en vez de dibujar una flecha que no significa nada.
 */
export function tendencia(serie, { minimo = 6 } = {}) {
  const ys = (serie ?? []).map((p) => p.pct).filter((v) => v != null);
  if (ys.length < minimo) {
    return { suficiente: false, n: ys.length, minimo, porQue: `hacen falta al menos ${minimo} puntos` };
  }
  const n = ys.length;
  const sx = (n - 1) * n / 2;
  const sxx = (n - 1) * n * (2 * n - 1) / 6;
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxy = ys.reduce((a, b, i) => a + i * b, 0);
  const pendiente = (n * sxy - sx * sy) / (n * sxx - sx * sx);

  const tercio = Math.max(1, Math.floor(n / 3));
  const media = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const ini = media(ys.slice(0, tercio));
  const fin = media(ys.slice(-tercio));

  return {
    suficiente: true,
    n,
    pendiente_pct_por_paso: r(pendiente, 4),
    inicio_pct: r(ini),
    fin_pct: r(fin),
    variacion_pct: ini === 0 ? null : r(((fin - ini) / ini) * 100, 1),
    // El umbral evita llamar «tendencia» al ruido de una décima por paso.
    sentido: Math.abs(pendiente) < 0.01 ? 'estable' : (pendiente > 0 ? 'sube' : 'baja'),
  };
}

/** Promedio móvil centrado. Los extremos salen `null`: no se inventa ventana. */
export function promedioMovil(serie, ventana = 5) {
  const xs = serie ?? [];
  if (ventana < 2 || xs.length < ventana) return xs.map((p) => ({ ...p, media: null }));
  const lado = Math.floor(ventana / 2);
  return xs.map((p, i) => {
    if (i < lado || i >= xs.length - lado) return { ...p, media: null };
    const trozo = xs.slice(i - lado, i + lado + 1).map((q) => q.pct);
    if (trozo.some((v) => v == null)) return { ...p, media: null };
    return { ...p, media: r(trozo.reduce((a, b) => a + b, 0) / trozo.length) };
  });
}

/**
 * Valores atípicos por rango intercuartílico (Tukey, k = 1,5).
 *
 * ⚠️ **Atípico no es erróneo.** Una sobrecarga real es atípica y es justo lo que
 * hay que mirar. Esta función SEÑALA, no descarta: quien la use tiene prohibido
 * filtrar el dato, solo marcarlo.
 *
 * @param {Record<string, any>[]} registros
 * @returns {{suficiente: boolean, n: number, q1?: number|null, q3?: number|null,
 *            iqr?: number|null, limiteBajo?: number|null, limiteAlto?: number|null,
 *            marcados: {linea: string, fecha: string, hora: number|null,
 *                       pct: number|null, lado: string}[]}}
 */
export function atipicos(registros, { k = 1.5 } = {}) {
  const xs = conPct(registros);
  if (xs.length < 4) return { suficiente: false, n: xs.length, marcados: [] };
  const ordenados = xs.map((v) => v.cargabilidad_pct).sort((a, b) => a - b);
  const q = (p) => {
    const pos = (ordenados.length - 1) * p;
    const bajo = Math.floor(pos); const alto = Math.ceil(pos);
    return ordenados[bajo] + (ordenados[alto] - ordenados[bajo]) * (pos - bajo);
  };
  const q1 = q(0.25); const q3 = q(0.75); const iqr = q3 - q1;
  const abajo = q1 - k * iqr; const arriba = q3 + k * iqr;
  return {
    suficiente: true,
    n: xs.length,
    q1: r(q1), q3: r(q3), iqr: r(iqr), limiteBajo: r(abajo), limiteAlto: r(arriba),
    marcados: xs.filter((v) => v.cargabilidad_pct < abajo || v.cargabilidad_pct > arriba)
      .map((v) => ({
        linea: v.linea, fecha: v.fecha, hora: v.hora, pct: r(v.cargabilidad_pct),
        lado: v.cargabilidad_pct > arriba ? 'alto' : 'bajo',
      })),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 9 · EL CONTRASTE QUE ESTE SISTEMA SÍ PUEDE APORTAR
// ════════════════════════════════════════════════════════════════════════════

/**
 * EL % DEL ARCHIVO FRENTE AL % CONTRA LA AMPACIDAD REAL DEL DÍA.
 *
 * Es la única cifra que este módulo aporta y que el Excel no traía: el archivo
 * compara contra una capacidad NOMINAL fija; `nucleo/termica.js` calcula la que
 * el conductor tiene **con el clima de ese momento** (IEEE 738). Un día en calma
 * y a 40 °C la capacidad real cae cerca de un tercio, y el mismo amperaje que
 * figura al 71 % está en realidad al 100 %.
 *
 * ⚠️ NO DICTAMINA Y NO CORRIGE NADA. Devuelve las dos cifras y su diferencia,
 * con el nombre de cada una. Sustituir el porcentaje del archivo por el nuestro
 * sería poner un segundo dueño sobre el mismo número — justo lo que `§ADR-052`
 * cerró. Y si falta la ampacidad, se dice: no se supone.
 */
export function contrasteConLaAmpacidad(registro, ampacidadDelDia_A) {
  const declarado = registro?.cargabilidad_pct ?? null;
  const corriente = registro?.corriente_A ?? null;
  const amp = Number.isFinite(ampacidadDelDia_A) && ampacidadDelDia_A > 0 ? ampacidadDelDia_A : null;

  if (corriente == null) {
    return { comparable: false, porQue: 'el registro no trae corriente: sin amperios no hay con qué comparar' };
  }
  if (amp == null) {
    return {
      comparable: false,
      porQue: 'no llega la ampacidad calculada del día (IEEE 738). Se calcula en `nucleo/termica.js` '
        + 'y depende del ambiente, el viento y el sol: elegir con qué condiciones es una decisión de '
        + 'ingeniería, no un valor por defecto',
    };
  }

  const contraAmpacidad_pct = r((corriente / amp) * 100);
  return {
    comparable: true,
    declarado_pct: declarado,
    naturalezaDeclarada: registro.naturaleza,
    contraAmpacidad_pct,
    ampacidad_A: r(amp, 0),
    corriente_A: r(corriente, 0),
    diferencia_pct: declarado == null ? null : r(contraAmpacidad_pct - declarado, 1),
    banda: bandaDe(contraAmpacidad_pct).clave,
    aviso: declarado != null && contraAmpacidad_pct - declarado >= 10
      ? 'La capacidad REAL del día es menor que la nominal con la que se calculó el archivo: la línea '
        + 'está más cargada de lo que dice el informe.'
      : null,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 10 · EMPAQUETAR PARA GUARDAR — donde se decide si esto cuesta dinero
// ════════════════════════════════════════════════════════════════════════════
//
// ⚠️ UN DOCUMENTO POR LÍNEA Y DÍA, con las 24 horas dentro. No uno por lectura.
//
// No es una preferencia de modelado: es aritmética de factura. Un año horario
// son 8.760 lecturas POR LÍNEA. Guardadas una a una, «histórico completo» de
// diez líneas pediría 87.600 documentos de un solo clic —más de lo que el plan
// gratuito da en un día entero—, y el módulo dejaría de funcionar justo cuando
// empezara a servir. Empaquetadas por día son 3.650; y el tablero, que lee el
// resumen diario, unas diez. Es `CLAUDE.md §3.1` aplicado al diseño.
//
// Aquí solo se ARMA la forma. Quién la escribe, con qué permisos y en qué
// colección es cosa de la capa de datos: este módulo no sabe que existe una base.

/** `07` a partir de 7. La hora es CLAVE de un mapa, así que va como texto. */
const claveHora = (h) => String(h).padStart(2, '0');

/**
 * Los registros sueltos → un documento por línea, circuito y día.
 *
 * ⚠️ **Una hora sin medida NO aparece en el mapa.** No se escribe `null` ni `0`:
 * se omite. Así el documento nunca afirma una lectura que nadie tomó, y quien
 * pinta recorre de 0 a 23 sabiendo que lo que falta es un hueco.
 *
 * ⚠️ **Los registros SIN hora no se pueden empaquetar** y se devuelven aparte.
 * Un dato diario metido en la hora 0 sería una medida inventada a medianoche —y
 * es justo la fila que Excel deja sin hora cuando omite la celda. Se dicen, no
 * se colocan.
 */
export function empaquetarPorDia(registros) {
  const dias = new Map();
  const sinHora = [];

  for (const reg of registros ?? []) {
    if (reg.hora == null) { sinHora.push(reg); continue; }
    const k = [reg.linea, reg.circuito ?? '-', reg.fecha].join('|');
    if (!dias.has(k)) {
      dias.set(k, {
        linea: reg.linea,
        circuito: reg.circuito ?? null,
        subestacionOrigen: reg.subestacionOrigen ?? null,
        subestacionDestino: reg.subestacionDestino ?? null,
        fecha: reg.fecha,
        horas: {},
      });
    }
    const dia = dias.get(k);
    // Las subestaciones se rellenan con la primera hora que las traiga: el
    // archivo suele ponerlas solo en la primera fila de cada bloque.
    dia.subestacionOrigen ??= reg.subestacionOrigen ?? null;
    dia.subestacionDestino ??= reg.subestacionDestino ?? null;

    const hora = {};
    for (const campo of ['cargabilidad_pct', 'corriente_A', 'potenciaActiva_MW',
      'potenciaReactiva_MVAr', 'tension_kV', 'capacidadNominal_A', 'estado', 'observaciones']) {
      if (reg[campo] != null) hora[campo] = reg[campo];
    }
    // La naturaleza viaja SIEMPRE con el porcentaje, y solo con él: sin ella el
    // molde se niega a guardar, porque no se sabría contra qué se calculó.
    if (hora.cargabilidad_pct != null) hora.naturaleza = reg.naturaleza ?? 'declarada';
    // Una hora vacía tampoco se escribe: sería un hueco disfrazado de lectura.
    if (Object.keys(hora).length) dia.horas[claveHora(reg.hora)] = hora;
  }

  return {
    dias: [...dias.values()].filter((d) => Object.keys(d.horas).length),
    sinHora,
  };
}

/** El camino de vuelta: un documento de día → sus registros sueltos. */
export function desempaquetarDia(dia) {
  return Object.entries(dia?.horas ?? {})
    .map(([h, v]) => ({
      linea: dia.linea,
      circuito: dia.circuito ?? null,
      subestacionOrigen: dia.subestacionOrigen ?? null,
      subestacionDestino: dia.subestacionDestino ?? null,
      fecha: dia.fecha,
      hora: Number(h),
      cargabilidad_pct: v.cargabilidad_pct ?? null,
      corriente_A: v.corriente_A ?? null,
      potenciaActiva_MW: v.potenciaActiva_MW ?? null,
      potenciaReactiva_MVAr: v.potenciaReactiva_MVAr ?? null,
      tension_kV: v.tension_kV ?? null,
      capacidadNominal_A: v.capacidadNominal_A ?? null,
      estado: v.estado ?? null,
      observaciones: v.observaciones ?? null,
      naturaleza: v.naturaleza ?? null,
    }))
    .sort((a, b) => a.hora - b.hora);
}

/**
 * EL RESUMEN DE UN DÍA — lo que lee el tablero sin abrir las 24 horas.
 *
 * Es DERIVADO: se puede reconstruir entero desde el día, y si algún día
 * discrepara del día que resume, **manda el día**. Se guarda solo porque leerlo
 * es la diferencia entre 365 documentos y 8.760.
 */
export function resumirDia(dia) {
  const horas = Object.entries(dia?.horas ?? {})
    .filter(([, v]) => v.cargabilidad_pct != null);
  const base = {
    linea: dia?.linea ?? null,
    fecha: dia?.fecha ?? null,
    horasConMedida: horas.length,
    porBanda: bandasVacias(),
    porNaturaleza: { declarada: 0, derivada: 0, sinDeclarar: 0 },
  };
  if (!horas.length) return base;

  const pcts = horas.map(([, v]) => v.cargabilidad_pct);
  const alta = horas.reduce((a, b) => (b[1].cargabilidad_pct > a[1].cargabilidad_pct ? b : a));
  for (const [, v] of horas) {
    base.porBanda[bandaDe(v.cargabilidad_pct).clave] += 1;
    // ⚠️ LA NATURALEZA SOBREVIVE AL RESUMEN. No lo hacía, y era el único sitio
    // del módulo donde se perdía: el motor la lleva hora a hora con cuidado
    // (`empaquetarPorDia`), y aquí se disolvía en una media única. Un día que
    // mezcla horas MEDIDAS con horas que calculamos nosotros se guardaba
    // indistinguible, y eso no se puede reconstruir después: el documento ya
    // no lo tiene. Se cuenta cuántas de cada, que es lo que permite decir «este
    // promedio sale de 18 horas medidas y 6 derivadas» (`99 §ADR-091`).
    const n = v.naturaleza;
    if (n === 'declarada' || n === 'derivada') base.porNaturaleza[n] += 1;
    else base.porNaturaleza.sinDeclarar += 1;
  }

  return {
    ...base,
    maxima_pct: r(Math.max(...pcts)),
    minima_pct: r(Math.min(...pcts)),
    promedio_pct: r(pcts.reduce((a, b) => a + b, 0) / pcts.length),
    horaMaxima: alta[0],
  };
}

/**
 * CUÁNTO COSTARÍA LEER UN PERIODO — para poder decirlo ANTES de pedirlo.
 *
 * ⚠️ Existe porque una pantalla que ofrece «histórico completo» sin decir lo que
 * cuesta es una pantalla que un día tumba el servicio sin avisar. Devuelve
 * cuántos documentos hay que leer de cada forma, y la pantalla puede advertir.
 */
export function costeDeLectura({ lineas = 1, dias = 1, conDetalle = false } = {}) {
  const n = Math.max(0, Math.round(lineas)) * Math.max(0, Math.round(dias));
  return {
    documentos: n,
    // El resumen basta para el tablero y las tendencias; el detalle solo hace
    // falta cuando se abre un día concreto o se pide la gráfica hora a hora.
    porQue: conDetalle
      ? 'se leen los días completos: hace falta el detalle hora a hora'
      : 'se leen solo los resúmenes diarios, que es lo que pinta el tablero',
    /** Lo que habría costado guardando una lectura por documento. */
    siFueraPorLectura: n * 24,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 13 · ENCONTRAR LA CABECERA — porque casi nunca es la primera fila
// ════════════════════════════════════════════════════════════════════════════
//
// ⚠️ POR QUÉ EXISTE (2026-08-29). El lector daba por hecho que la fila 1 era la
// cabecera. Con un archivo REAL del Ingeniero salió **una sola columna, sin
// nombre, y ningún campo reconocido**: su hoja empieza con un título, o con
// filas en blanco, o con las dos cosas — que es como sale cualquier informe de
// operación. Suponer la fila 1 no es un atajo: es la diferencia entre que el
// módulo funcione solo y que le pida mapear trece columnas a mano.
//
// Lo que se hace: se MIRAN las primeras filas y gana la que más campos
// reconoce. No la primera, no la más llena: la más RECONOCIBLE — porque el
// título de un informe también está lleno y no es una cabecera.

/** Cuántas filas del principio se miran buscando la cabecera. */
export const FILAS_QUE_SE_MIRAN = 25;

/**
 * Puntúa una fila como candidata a cabecera.
 *
 * Los campos REQUERIDOS pesan doble a propósito: una fila que trae «Fecha» y
 * «Línea» es la cabecera aunque no reconozca nada más. Y una fila con un título
 * largo en la celda A tiene una celda llena y cero campos reconocidos — por eso
 * «llena» casi no puntúa: el título de un informe también está lleno.
 */
export function puntuarCabecera(celdas) {
  const textos = (celdas ?? []).map((c) => (c == null ? '' : String(c).trim()));
  const llenas = textos.filter((t) => t !== '').length;
  if (!llenas) return { llenas: 0, reconocidas: 0, requeridos: 0, puntos: 0 };

  const { mapeo } = detectarMapeo(textos.filter((t) => t !== ''));
  const reconocidas = Object.keys(mapeo).length;
  const requeridos = CAMPOS_REQUERIDOS.filter((c) => mapeo[c]).length;

  return {
    llenas,
    reconocidas,
    requeridos,
    puntos: reconocidas * 10 + requeridos * 20 + Math.min(llenas, 20),
  };
}

/**
 * QUÉ FILA ES LA CABECERA. Devuelve su índice y POR QUÉ se eligió.
 *
 * ⚠️ Si ninguna fila reconoce un solo campo devuelve `fila: null` y las
 * candidatas, en vez de inventarse una. Mapear a ciegas la primera llenaría la
 * pantalla de números equivocados; enseñarle las filas crudas al Ingeniero y que
 * la señale él es lo honesto — y además es lo que resuelve el caso.
 */
export function encontrarCabecera(matriz, { mirar = FILAS_QUE_SE_MIRAN } = {}) {
  const filas = (matriz ?? []).slice(0, mirar);
  let mejor = null;
  filas.forEach((celdas, i) => {
    const p = puntuarCabecera(celdas);
    if (!p.reconocidas) return;
    // Gana la PRIMERA de las mejores: si una tabla repite su cabecera más
    // abajo, la buena es la de arriba.
    if (!mejor || p.puntos > mejor.puntos) mejor = { fila: i, ...p };
  });

  if (!mejor) {
    return {
      fila: null,
      porQue: 'ninguna de las primeras filas parece una cabecera: no se reconoció ni un campo',
      candidatas: filas.map((c, i) => ({ fila: i, ...puntuarCabecera(c) }))
        .filter((c) => c.llenas > 0).slice(0, 8),
    };
  }
  return {
    ...mejor,
    porQue: mejor.fila === 0
      ? `la primera fila trae ${mejor.reconocidas} campo(s) reconocido(s)`
      : `la cabecera está en la fila ${mejor.fila + 1}: las ${mejor.fila} de arriba no reconocen `
        + 'ningún campo (título o filas en blanco)',
  };
}

/**
 * QUÉ HOJA ES LA BUENA. La que más campos reconoce — no la primera ni la mayor.
 *
 * Un libro de operación suele traer una portada, una hoja de notas y la tabla.
 * Abrir por la primera enseña la portada; abrir por la que más filas tiene puede
 * enseñar un registro que no es éste.
 *
 * @param {{nombre?: string, matriz?: any[][]}[]} hojas
 * @returns {{indice: number, nombre: string, cabecera: any, puntos: number}|null}
 */
export function elegirHoja(hojas) {
  /** @type {{indice: number, nombre: string, cabecera: any, puntos: number}|null} */
  let mejor = null;
  (hojas ?? []).forEach((hoja, i) => {
    const cab = encontrarCabecera(hoja.matriz ?? []);
    const puntos = cab.fila == null ? -1 : cab.puntos;
    if (!mejor || puntos > mejor.puntos) {
      mejor = { indice: i, nombre: hoja.nombre, cabecera: cab, puntos };
    }
  });
  return mejor;
}

// ════════════════════════════════════════════════════════════════════════════
// EL HISTÓRICO GUARDADO — leer RESÚMENES DIARIOS, que no son registros horarios
// ────────────────────────────────────────────────────────────────────────────
// ⚠️ POR QUÉ ESTO EXISTE APARTE. `resumen`, `porLinea` y `serieTemporal` toman
// registros HORARIOS: una fila = un instante. El histórico guardado no tiene
// eso — guarda un resumen por línea y día (`resumirDia`), justamente para que
// mirar un año no cueste 87.600 lecturas (`99 §ADR-088`). Reusar las de arriba
// obligaría a abrir los días completos, que es exactamente lo que el diseño
// evita. Así que el histórico tiene sus propias funciones, y por eso la unidad
// aquí es el DÍA y nunca la hora.
//
// ⚠️ Y LA TRAMPA DE PROMEDIAR PROMEDIOS. Un día con 3 horas medidas y otro con
// 24 no pesan igual. El promedio del periodo se pondera por `horasConMedida`, o
// una jornada con tres lecturas altas movería la media del mes entero.
// ════════════════════════════════════════════════════════════════════════════

/** Los resúmenes que traen medida, ordenados por fecha. El resto no se pinta. */
function conMedida(resumenes) {
  return (resumenes ?? [])
    .filter((s) => s && s.maxima_pct != null)
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
}

/** Promedio ponderado por horas medidas. `null` si no hay ninguna. */
function promedioPonderado(filas) {
  let suma = 0; let horas = 0;
  for (const s of filas) {
    const h = Number(s.horasConMedida) || 0;
    if (s.promedio_pct == null || h <= 0) continue;
    suma += s.promedio_pct * h; horas += h;
  }
  return horas > 0 ? r(suma / horas) : null;
}

/**
 * LA SERIE DIARIA, un punto por día.
 *
 * Con `linea` se toma esa; sin ella se funden todas por fecha y el punto del día
 * es **el peor de las líneas**, no su promedio: en operación lo que importa del
 * día es cuánto llegó a cargar la más cargada, y promediarla con una descargada
 * escondería justo el día que hay que mirar.
 *
 * @param {Record<string, any>[]} resumenes
 * @param {string|null} [linea]
 * @returns {{fecha: string, linea: string, maxima_pct: number|null,
 *            promedio_pct: number|null, minima_pct: number|null,
 *            horasConMedida: number, lineas: number}[]}
 */
export function serieDiaria(resumenes, linea = null) {
  const filas = conMedida(resumenes).filter((s) => !linea || String(s.linea) === String(linea));
  if (linea) {
    return filas.map((s) => ({
      fecha: String(s.fecha), linea: String(s.linea),
      maxima_pct: r(s.maxima_pct), promedio_pct: r(s.promedio_pct), minima_pct: r(s.minima_pct),
      horasConMedida: Number(s.horasConMedida) || 0, lineas: 1,
    }));
  }
  const porDia = new Map();
  for (const s of filas) {
    const k = String(s.fecha);
    if (!porDia.has(k)) porDia.set(k, []);
    porDia.get(k).push(s);
  }
  return [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([fecha, dia]) => {
    const peor = dia.reduce((a, b) => (b.maxima_pct > a.maxima_pct ? b : a));
    const minimos = dia.filter((s) => s.minima_pct != null).map((s) => s.minima_pct);
    return {
      fecha, linea: String(peor.linea),
      maxima_pct: r(peor.maxima_pct),
      promedio_pct: promedioPonderado(dia),
      minima_pct: minimos.length ? r(Math.min(...minimos)) : null,
      horasConMedida: dia.reduce((a, s) => a + (Number(s.horasConMedida) || 0), 0),
      lineas: dia.length,
    };
  });
}

/**
 * EL TABLERO DEL HISTÓRICO. Las cifras que se leen de un vistazo sobre un
 * periodo ya guardado, sin abrir un solo día completo.
 *
 * @param {Record<string, any>[]} resumenes
 * @returns {{dias: number, diasConMedida: number, lineas: number,
 *            desde: string|null, hasta: string|null,
 *            pico: {pct: number|null, fecha: string, linea: string}|null,
 *            valle: {pct: number|null, fecha: string, linea: string}|null,
 *            promedio: number|null,
 *            lineaMasCargada: {linea: string, maximo: number|null}|null,
 *            diasConSobrecarga: number, horasDeSobrecarga: number,
 *            horasConMedida: number, cobertura_pct: number|null,
 *            porBanda: Record<string, number>,
 *            porNaturaleza: {declarada: number, derivada: number, sinDeclarar: number},
 *            diasSinSello: number}}
 */
export function resumenDelHistorico(resumenes) {
  const todas = (resumenes ?? []).filter(Boolean);
  const filas = conMedida(todas);
  const base = {
    dias: todas.length, diasConMedida: filas.length,
    lineas: new Set(todas.map((s) => String(s.linea))).size,
    desde: null, hasta: null,
    pico: null, valle: null, promedio: null,
    lineaMasCargada: null,
    diasConSobrecarga: 0, horasDeSobrecarga: 0,
    horasConMedida: 0, cobertura_pct: null,
    porBanda: bandasVacias(),
    porNaturaleza: { declarada: 0, derivada: 0, sinDeclarar: 0 },
    diasSinSello: 0,
  };
  if (!todas.length) return base;

  const fechas = todas.map((s) => String(s.fecha)).sort();
  base.desde = fechas[0]; base.hasta = fechas[fechas.length - 1];

  for (const s of todas) {
    base.horasConMedida += Number(s.horasConMedida) || 0;
    const b = s.porBanda ?? {};
    for (const k of Object.keys(base.porBanda)) base.porBanda[k] += Number(b[k]) || 0;
    if ((Number(b.sobrecarga) || 0) > 0) base.diasConSobrecarga += 1;
    base.horasDeSobrecarga += Number(b.sobrecarga) || 0;
    // Un día guardado ANTES del sello no trae naturaleza ni versión de motor, y
    // eso no se rellena: se cuenta y se dice. Reescribir el pasado sería
    // inventarlo (`99 §ADR-091`).
    const nat = s.porNaturaleza;
    if (!nat || !s.versionMotor) base.diasSinSello += 1;
    if (nat) for (const k of Object.keys(base.porNaturaleza)) {
      base.porNaturaleza[k] += Number(nat[k]) || 0;
    }
  }
  // ⚠️ La cobertura se mide contra los días QUE HAY, no contra el calendario
  // pedido: un periodo de 30 días con 3 guardados es 3 días al 100 %, no 10 %.
  // Decir lo contrario haría parecer roto un histórico que solo está empezando.
  base.cobertura_pct = todas.length ? r((base.horasConMedida / (todas.length * 24)) * 100) : null;

  if (!filas.length) return base;
  const alto = filas.reduce((a, b) => (b.maxima_pct > a.maxima_pct ? b : a));
  base.pico = { pct: r(alto.maxima_pct), fecha: String(alto.fecha), linea: String(alto.linea) };
  const conMin = filas.filter((s) => s.minima_pct != null);
  if (conMin.length) {
    const bajo = conMin.reduce((a, b) => (b.minima_pct < a.minima_pct ? b : a));
    base.valle = { pct: r(bajo.minima_pct), fecha: String(bajo.fecha), linea: String(bajo.linea) };
  }
  base.promedio = promedioPonderado(filas);
  const ranking = porLineaDesdeResumenes(todas);
  base.lineaMasCargada = ranking.length ? ranking[0] : null;
  return base;
}

/**
 * EL RANKING POR LÍNEA sobre resúmenes diarios. Ordenado por pico descendente:
 * la primera fila es la línea que más llegó a cargar en todo el periodo.
 *
 * @param {Record<string, any>[]} resumenes
 * @returns {{linea: string, dias: number, diasConMedida: number,
 *            maximo: number|null, promedio: number|null, minimo: number|null,
 *            horasDeSobrecarga: number, horasConMedida: number}[]}
 */
export function porLineaDesdeResumenes(resumenes) {
  const porNombre = new Map();
  for (const s of (resumenes ?? []).filter(Boolean)) {
    const k = String(s.linea);
    if (!porNombre.has(k)) porNombre.set(k, []);
    porNombre.get(k).push(s);
  }
  return [...porNombre.entries()].map(([linea, filas]) => {
    const medidos = filas.filter((s) => s.maxima_pct != null);
    const minimos = filas.filter((s) => s.minima_pct != null).map((s) => s.minima_pct);
    return {
      linea,
      dias: filas.length,
      diasConMedida: medidos.length,
      maximo: medidos.length ? r(Math.max(...medidos.map((s) => s.maxima_pct))) : null,
      promedio: promedioPonderado(filas),
      minimo: minimos.length ? r(Math.min(...minimos)) : null,
      horasDeSobrecarga: filas.reduce((a, s) => a + (Number(s.porBanda?.sobrecarga) || 0), 0),
      horasConMedida: filas.reduce((a, s) => a + (Number(s.horasConMedida) || 0), 0),
    };
  }).sort((a, b) => (b.maximo ?? -1) - (a.maximo ?? -1));
}
