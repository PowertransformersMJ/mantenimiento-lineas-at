// ============================================================================
// nucleo/cargaPorLotes.js — qué día entra, cuál se aparta y en cuántas tandas
// ----------------------------------------------------------------------------
// QUÉ RESUELVE. Un histórico de ocho meses son ~800 archivos, y el rastro de
// procedencia de una carga —`CargaDeCargabilidad.archivos`— admite CIEN. Esa
// cuenta la hacían dos sitios por su cuenta: la consola
// (`herramientas/cargar-cargabilidad.mjs`) y, a mano, el Ingeniero, eligiendo
// archivos en la pantalla diecisiete veces seguidas. Aquí vive UNA sola versión
// de las tres reglas que deciden qué se escribe, para que la pantalla y la
// consola no puedan discrepar:
//
//   1. **un día con AL MENOS UNA hora cuyo sello no sea «Actual» se aparta
//      ENTERO** —decisión del Ingeniero, 2026-09-20— y se dice cuál y por qué;
//   2. **un día fuera del periodo pedido no entra**, y se dice;
//   3. **un día NUNCA se parte entre dos tandas**: sus archivos —los
//      estadísticos del día— viajan juntos, porque juntos se unen (`unirAnchas`
//      exige el mismo eje de tiempo) y juntos se leen;
//   4. **cada hora·señal se cuenta UNA sola vez**, la traigan uno o cinco
//      archivos — y quien la cuenta es `indiceDeSellos`, que vive aquí y lo usa
//      también `herramientas/sellos-de-calidad.mjs`.
//
// ⚠️ POR QUÉ LA CUENTA ES UNA SOLA Y VIVE AQUÍ. Hasta el 2026-09-20 la consola
// indexaba por hora·señal y esta pantalla contaba CELDAS. En el dato real de
// LN-617 hay 1.080 lecturas repetidas —el mismo `_quality` exportado dos veces—,
// así que el mismo día salía «×9» en la pantalla y «×8» en la consola, y 26
// horas contra 25. Ese texto NO es un rótulo: se escribe en
// `CargaDeCargabilidad.apartados`, que es un rastro INMUTABLE. Dos cuentas son
// dos verdades sobre algo que no se puede corregir después.
//
// ⚠️ POR QUÉ TODO SE APARTA Y NADA SE RECORTA. `firestore.rules` niega el
// borrado de las tres colecciones de cargabilidad a propósito («un histórico del
// que se puede quitar una hora incómoda no es un histórico»). Lo apartado se
// puede sumar después; **lo cargado no se puede retirar**. Ante la duda, fuera.
//
// ⚠️ UN DÍA SIN NINGÚN SELLO **NO** ES UN DÍA APARTADO. Ninguna de sus horas
// trae un sello distinto de «Actual» porque no trae sello ninguno, así que la
// regla 1 no lo toca — pero tampoco está dado por bueno. Entra y se NOMBRA.
//
// ⚠️ AQUÍ NO SE CALCULA NINGUNA MEDIDA y no se lee ningún archivo: entra lo que
// otro ya leyó y sale la decisión. El eje de tiempo, el sello bueno y el orden
// de la fecha se le piden a `cargabilidadAncho.js`, que es su dueño único: dos
// lectores de sello serían dos criterios de «esta hora se midió», y el día que
// discreparan uno de los dos estaría cargando dato inventado.
//
// ⚠️ NINGUNA SALIDA DE ESTE MÓDULO LLEVA LA ETIQUETA DE UNA SEÑAL. La etiqueta
// del SCADA es la ruta del cliente —subestación, nivel de tensión, bahía— y este
// repositorio es PÚBLICO (`CLAUDE.md §3.1`). De las señales solo sale CUÁNTAS,
// que es lo que hace falta para decidir; así el motivo de un día apartado se
// puede pegar donde sea sin sacar un nombre de cliente.
// ============================================================================
import { CALIDAD_BUENA, encontrarEjeDeTiempo, ordenDeLaCarga } from './cargabilidadAncho.js';

/**
 * CUÁNTOS ARCHIVOS CABEN EN UNA CARGA, y no es un gusto: `CargaDeCargabilidad`
 * declara `archivos: z.array(...).max(100)` porque ese documento es el RASTRO de
 * procedencia —«¿de qué archivo salió este número?»— y una lista que se corta no
 * responde esa pregunta. Es el mismo tope con el que el Ingeniero subió LN-627 a
 * mano, en trece pasadas (`99 §ADR-128`).
 */
export const ARCHIVOS_POR_CARGA = 100;

/**
 * LAS TANDAS: días seguidos hasta llenar `tope` archivos, sin partir ningún día.
 *
 * ⚠️ Un día que por sí solo pasa del tope va SOLO, entero: partirlo sería
 * separar los estadísticos de un mismo día, que es justo lo que `unirAnchas`
 * necesita juntos. Una tanda así se pasaría del tope y el molde lo diría; hoy no
 * puede ocurrir —un día trae cuatro archivos— y si algún día ocurriera, se vería
 * (`planDeLaCarga` lo pone como freno, no lo arregla por su cuenta).
 *
 * Es la MISMA función que `herramientas/cargar-cargabilidad.mjs` exporta con
 * este nombre, y `tests/cargabilidad-por-carpeta.test.js` compara las dos sobre
 * los mismos casos: el día que una cambie, la prueba se pone roja.
 *
 * @template {{archivos: number}} T
 * @param {T[]} elementos  un día cada uno, en el orden en que van
 * @param {{tope?: number}} [opciones]
 * @returns {{elementos: T[], archivos: number}[]}
 */
export function repartirEnLotes(elementos, { tope = ARCHIVOS_POR_CARGA } = {}) {
  const lotes = [];
  for (const e of elementos ?? []) {
    const ultimo = lotes[lotes.length - 1];
    if (!ultimo || ultimo.archivos + e.archivos > tope) lotes.push({ elementos: [e], archivos: e.archivos });
    else { ultimo.elementos.push(e); ultimo.archivos += e.archivos; }
  }
  return lotes;
}

/** La etiqueta de una fila, compuesta como la compone el lector (`leerSenales`). */
const etiquetaDe = (celdas, primeraColumna) => (celdas ?? []).slice(0, primeraColumna)
  .map((v) => (v == null ? '' : String(v).trim())).filter((t) => t !== '').join(' · ') || '(sin etiqueta)';

/**
 * POR QUÉ SE APARTA UN ARCHIVO DE SELLO SIN LEERLO. Un eje con dos columnas en
 * la misma hora no dice qué sello lleva esa hora: dice dos, y no hay forma de
 * saber cuál. El archivo entero queda fuera de la lectura y se NOMBRA.
 *
 * El texto es UNO —este— porque lo imprime `herramientas/sellos-de-calidad.mjs`
 * y lo repite el freno de `planDeLaCarga`: dos redacciones del mismo problema
 * son dos problemas distintos a ojos de quien lee.
 *
 * ⚠️ **HOY ESTA COMPROBACIÓN NO LLEGA A DISPARAR, y conviene decirlo en vez de
 * aparentar que protege** (medido el 2026-09-20, `tests/sellos-una-sola-cuenta`).
 * `encontrarEjeDeTiempo` exige que las horas del eje CREZCAN una a una, y su
 * resolución es la hora: un archivo con dos columnas en la misma hora —la misma
 * repetida, o una exportación cada media hora— no llega a tener eje y cae antes,
 * en `sinEje`, que frena igual (`sello-ilegible`). Se queda como segunda puerta
 * —cuesta nada— por si mañana se afloja la regla del eje; lo que no se puede es
 * contarla como la que para el archivo, porque no lo para.
 */
export const MOTIVO_EJE_NO_HORARIO = 'su eje no es horario: dos columnas caen en la misma hora';

/** ¿El eje de este archivo pone dos columnas en la misma hora? */
export function ejeConHorasRepetidas(eje) {
  const vistas = new Set();
  for (const i of eje?.instantes ?? []) {
    if (!i) continue;
    const clave = `${i.fecha}|${i.hora}`;
    if (vistas.has(clave)) return true;
    vistas.add(clave);
  }
  return false;
}

/**
 * EL VEREDICTO DE UNA HORA·SEÑAL a partir de los sellos que se le leyeron.
 *
 * ⚠️ Son VARIOS a propósito: dos archivos pueden traer la misma hora con sellos
 * distintos (un «choque»). Entonces se enseñan LOS DOS —`Actual / Not Renewed`—
 * y basta uno malo para que la hora no sea medida. Esconder el choque detrás de
 * uno de los dos sellos sería elegir por el Ingeniero cuál es el bueno.
 */
export function selloDeLaHoraSenal(sellos) {
  const lista = [...(sellos ?? [])].sort();
  return {
    sellos: lista,
    sello: lista.join(' / '),
    bueno: lista.length === 1 && lista[0] === CALIDAD_BUENA,
  };
}

/**
 * EL ÍNDICE DE SELLOS: **la** cuenta, la única, para la pantalla y la consola.
 *
 * Se anota hora·señal → los sellos que trajo. La misma hora·señal leída en dos
 * archivos NO se cuenta dos veces; si los dos archivos dicen lo mismo, es una
 * exportación repetida y no pasa nada, y si dicen cosas distintas es un CHOQUE y
 * se anota aparte (quien decide qué hacer con él es `planDeLaCarga`, con un
 * freno, igual que la consola se niega a cargar).
 *
 * ⚠️ `choques` NO lleva la etiqueta de la señal —es la ruta del SCADA del
 * cliente y este repositorio es PÚBLICO—: lleva el día, la hora y el archivo,
 * que es con lo que se va a buscar el archivo repetido.
 */
export function indiceDeSellos() {
  /** `fecha|hora` → { fecha, hora, senales: Map<etiqueta, Set<sello>> } */
  const porHora = new Map();
  const choques = [];

  /** @returns {'nuevo'|'repetido'|'choque'|'nada'} qué fue esta lectura */
  const anotar = ({ fecha, hora, etiqueta, sello, archivo = null } = {}) => {
    const texto = sello == null ? '' : String(sello).trim();
    if (fecha == null || hora == null || texto === '') return 'nada';
    const clave = `${fecha}|${hora}`;
    if (!porHora.has(clave)) porHora.set(clave, { fecha, hora, senales: new Map() });
    const { senales } = porHora.get(clave);
    if (!senales.has(etiqueta)) senales.set(etiqueta, new Set());
    const s = senales.get(etiqueta);
    const yaEstaba = s.has(texto);
    const choque = s.size > 0 && !yaEstaba;
    if (choque) choques.push({ fecha, hora, archivo });
    s.add(texto);
    return choque ? 'choque' : (yaEstaba ? 'repetido' : 'nuevo');
  };

  /** Una entrada por hora·señal, ya juzgada. En el orden en que se leyeron. */
  const horaSenal = () => {
    const out = [];
    for (const { fecha, hora, senales } of porHora.values()) {
      for (const [etiqueta, s] of senales) out.push({ fecha, hora, etiqueta, ...selloDeLaHoraSenal(s) });
    }
    return out;
  };

  return { anotar, horaSenal, choques, horas: () => porHora.size };
}

/** Suma una señal·día mala al día que le toca. `horas` son las horas de ESA señal. */
function anotarDiaApartado(malos, { fecha, sello, etiqueta, horas }) {
  if (!malos.has(fecha)) malos.set(fecha, { sellos: new Map(), horas: new Set(), senales: new Set() });
  const a = malos.get(fecha);
  a.sellos.set(sello, (a.sellos.get(sello) ?? 0) + (horas?.length ?? 0));
  a.senales.add(etiqueta);
  for (const h of horas ?? []) a.horas.add(h);
}

/** Cierra los días malos: la lista ordenada, contada y con su motivo escrito. */
function cerrarApartados(malos) {
  return [...malos.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fecha, a]) => {
      const x = {
        fecha,
        causa: CAUSA_DEL_APARTADO.SELLO,
        // Solo CUÁNTAS. La etiqueta es la ruta del cliente y no sale de aquí.
        senales: a.senales.size,
        sellos: [...a.sellos].map(([sello, horas]) => ({ sello, horas }))
          .sort((p, q) => q.horas - p.horas || p.sello.localeCompare(q.sello)),
        horas: [...a.horas].sort((p, q) => p - q),
      };
      return { ...x, porQue: motivoDelApartado(x) };
    });
}

/**
 * LOS MISMOS DÍAS APARTADOS, PERO LEÍDOS DEL INFORME DE LA CONSOLA.
 *
 * `herramientas/cargar-cargabilidad.mjs` no relee los sellos: le pregunta a
 * `herramientas/sellos-de-calidad.mjs` y trabaja sobre su `--json`. Esta función
 * convierte ese informe en la MISMA lista que devuelve `sellosPorDia`, con el
 * mismo texto y las mismas cifras, para que el camino de la consola y el de la
 * pantalla no puedan separarse. `tests/sellos-una-sola-cuenta.test.js` lo
 * comprueba sobre el mismo origen.
 *
 * ⚠️ El informe SÍ trae las etiquetas del cliente —vive fuera del repositorio—;
 * de aquí sale solo cuántas son.
 */
export function apartadosDelInforme(informe) {
  const malos = new Map();
  for (const b of informe?.bloques ?? []) {
    for (const x of b?.porDiaYSenal ?? []) {
      anotarDiaApartado(malos, { fecha: x.fecha, sello: x.sello, etiqueta: x.etiqueta, horas: x.horas ?? [] });
    }
  }
  return cerrarApartados(malos);
}

/**
 * QUÉ DICEN LOS SELLOS, día por día — y qué día queda apartado por ellos.
 *
 * Entra la matriz ya leída de cada archivo `_quality` (quien los reconoce es
 * `esArchivoDeCalidad`), sale qué días tienen sello, cuáles se apartan y por qué.
 *
 * ⚠️ EL DÍA SALE DEL DATO, no del nombre del archivo: cada columna vale por el
 * instante que declara su eje. Y el orden de la fecha se mira en la carga
 * ENTERA: si unos archivos demuestran mes/día y otros se leerían día/mes, no se
 * decide nada (`mezcla`), porque un día fechado al revés señalaría a otro día.
 *
 * ⚠️ LA CUENTA NO ES DE CELDAS, ES DE HORA·SEÑAL (`indiceDeSellos`). Un archivo
 * exportado dos veces trae la misma hora dos veces y no son dos horas: es la
 * misma. Y dos archivos que la fechan con sellos distintos son un CHOQUE, que se
 * dice y frena, no se promedia.
 *
 * @param {{nombre?: string, matriz: any[][]}[]} entradas  solo archivos de sello
 */
export function sellosPorDia(entradas) {
  const indice = indiceDeSellos();
  const sinEje = [];
  const ejeNoHorario = [];
  const ordenes = [];
  let leidos = 0;

  for (const e of (entradas ?? []).filter((x) => x && Array.isArray(x.matriz))) {
    const nombre = e.nombre ?? '(sin nombre)';
    // El mismo mínimo de columnas con que lo lee el núcleo (`leerCalidad`): un
    // archivo de sello no trae números, así que la fila del eje es más pobre.
    const eje = encontrarEjeDeTiempo(e.matriz, { minimo: 2 });
    if (!eje) { sinEje.push(nombre); continue; }
    // Mismo criterio que la consola: el archivo entero se aparta SIN LEER.
    if (ejeConHorasRepetidas(eje)) { ejeNoHorario.push(nombre); continue; }
    ordenes.push({ nombre, orden: eje.ordenDeFecha });
    leidos += 1;

    for (const celdas of e.matriz.slice(eje.fila + 1)) {
      const etiqueta = etiquetaDe(celdas, eje.primeraColumna);
      eje.columnas.forEach((c, k) => {
        const v = celdas?.[c];
        if (v == null || String(v).trim() === '') return;
        const instante = eje.instantes[k];
        if (!instante) return;
        indice.anotar({ ...instante, etiqueta, sello: String(v).trim(), archivo: nombre });
      });
    }
  }

  /** fecha → { sellos: Map<sello, horas>, horas: Set<hora>, senales: Set<etiqueta> } */
  const malos = new Map();
  const conSello = new Set();
  let buenas = 0;
  let noActual = 0;
  for (const h of indice.horaSenal()) {
    conSello.add(h.fecha);
    if (h.bueno) { buenas += 1; continue; }
    noActual += 1;
    anotarDiaApartado(malos, { fecha: h.fecha, sello: h.sello, etiqueta: h.etiqueta, horas: [h.hora] });
  }

  const orden = ordenDeLaCarga(ordenes);

  return {
    apartados: cerrarApartados(malos),
    conSello: [...conSello].sort(),
    leidos,
    sinEje,
    ejeNoHorario,
    choques: indice.choques,
    ordenDeFecha: orden,
    mezcla: orden.mezcla === true,
    horas: { actual: buenas, noActual },
  };
}

/**
 * LAS CAUSAS POR LAS QUE UN DÍA NO QUEDA ESCRITO. **No son la misma cosa** y no
 * se pueden confundir, porque el motivo se escribe en un rastro INMUTABLE:
 *
 *   · `SELLO`        — se leyó y alguna hora suya NO dice «Actual». Es un juicio
 *                      sobre el DATO de ese día.
 *   · `PERIODO`      — no se pidió. No se está diciendo nada de su calidad.
 *   · `SIN_LECTURAS` — entró en la tanda y no dejó ni una lectura que guardar.
 *   · `OTRA_CORRIDA` — **no se tocó en esta corrida**: ni se escribió ahora ni se
 *                      descartó. Es el día que ya cargó otra tanda, o el que
 *                      cargará la siguiente. Decir de él «queda fuera del
 *                      periodo» sería escribir, para siempre, que aquel día no
 *                      vino — cuando está en el histórico.
 *
 * ⚠️ `CargaDeCargabilidad.apartados` admite TRES motivos (`sello_no_actual`,
 * `fuera_del_periodo`, `sin_lecturas`) y `OTRA_CORRIDA` **no es uno de ellos a
 * propósito**: un día que ya cargó otra tanda NO se escribe en el rastro de
 * esta. Quien lo escribiera estaría afirmando, en un documento que no se puede
 * corregir, que aquel día no vino — cuando está en el histórico. Lo que esta
 * carga tiene que decir de él es NADA; ya lo dijo la que lo escribió.
 */
export const CAUSA_DEL_APARTADO = {
  SELLO: 'sello',
  PERIODO: 'periodo',
  SIN_LECTURAS: 'sin-lecturas',
  OTRA_CORRIDA: 'otra-corrida',
};

/**
 * POR QUÉ SE APARTA ESTE DÍA, dicho para el Ingeniero y sin nombres de cliente.
 *
 * Es el ÚNICO sitio donde se redacta un motivo: el mismo texto que acaba en el
 * informe de `herramientas/cargar-cargabilidad.mjs` y en el rastro que escribe
 * la pantalla, palabra por palabra y cifra por cifra
 * (`tests/sellos-una-sola-cuenta.test.js` lo comprueba sobre el mismo origen).
 *
 * Sin `causa` se entiende `SELLO`, que es de donde viene esta función.
 */
export function motivoDelApartado({ causa = CAUSA_DEL_APARTADO.SELLO, senales, sellos, horas, periodo } = {}) {
  if (causa === CAUSA_DEL_APARTADO.PERIODO) {
    return `queda fuera del periodo pedido (${periodo?.desde ?? '—'} → ${periodo?.hasta ?? '—'})`;
  }
  if (causa === CAUSA_DEL_APARTADO.OTRA_CORRIDA) {
    return 'no se tocó en esta corrida: ni se escribió ahora ni se descartó. Lo que diga de este día '
      + 'lo dice la carga que sí lo escribió';
  }
  if (causa === CAUSA_DEL_APARTADO.SIN_LECTURAS) {
    return 'entró en la tanda y no dejó ninguna lectura que guardar';
  }
  const conSello = (sellos ?? []).map((s) => `«${s.sello}» ×${s.horas}`).join(' · ');
  return `${senales} señal(es) con sello ${conSello} en la(s) hora(s) `
    + `${(horas ?? []).join(', ')} h`;
}

/** ¿Este día cae fuera de lo que se pidió? */
const fueraDelPeriodo = (fecha, { desde, hasta } = {}) => Boolean(
  (desde && fecha < desde) || (hasta && fecha > hasta),
);

/**
 * ⚠️ REANUDAR **NO** ES ACOTAR EL PERIODO, y confundirlos cuesta un rastro que
 * miente para siempre.
 *
 * Son dos preguntas distintas y el molde las distingue:
 *
 *   · `periodo` — «de todo lo que trae la carpeta, QUÉ QUIERO CARGAR». Es un
 *     juicio sobre el dato: dejar fuera el archivo de 2025 dice algo de 2025, y
 *     por eso se escribe (`fuera_del_periodo`).
 *   · `yaCargadoHasta` — «hasta qué día ESTO YA ESTÁ ESCRITO». No es un juicio:
 *     es un hecho del histórico. De esos días esta carga no dice nada, porque no
 *     los miró; lo que haya que decir lo dijo la carga que sí los escribió.
 *
 * Hasta el 2026-09-20 la pantalla reanudaba pidiéndole al Ingeniero que
 * reescribiera «Desde». El resultado, medido: parando en la tanda 4 de 8 de
 * LN-617, las cuatro tandas siguientes dejaban escrito que 110 días **ya
 * cargados** «quedaron fuera del periodo», y cinco días apartados por su sello
 * perdían su motivo real. `cargabilidad_cargas` no se edita ni se borra.
 */
const yaEstabaEscrito = (fecha, hasta) => Boolean(hasta && fecha <= hasta);

/**
 * EL PLAN ENTERO, ANTES DE ESCRIBIR NADA: qué entra, qué se aparta, qué queda
 * fuera del periodo, en cuántas tandas y qué impide empezar.
 *
 * ⚠️ `frenos` no es una lista de avisos: es lo que hace que el botón de empezar
 * no exista. Un aviso se lee por encima; un freno hay que resolverlo. Y ninguno
 * se resuelve solo: este módulo no elige periodo, no da un día por bueno y no
 * recorta una tanda que se pasa.
 *
 * @param {{
 *   dias: {fecha: string, archivos: number}[],
 *   sellos: ReturnType<typeof sellosPorDia> | null,
 *   periodo?: {desde?: string|null, hasta?: string|null},
 *   yaCargadoHasta?: string|null,
 *   tope?: number,
 * }} entrada
 */
export function planDeLaCarga({
  dias = [], sellos = null, periodo = {}, yaCargadoHasta = null, tope = ARCHIVOS_POR_CARGA,
} = {}) {
  const ordenados = [...dias].filter((d) => d && d.fecha)
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const apartadoPorSello = new Map((sellos?.apartados ?? []).map((a) => [a.fecha, a]));
  const conSello = new Set(sellos?.conSello ?? []);

  const entran = [];
  const apartados = [];
  const fuera = [];
  const otraCorrida = [];
  for (const d of ordenados) {
    const archivos = Number(d.archivos) || 0;
    // ⚠️ EL ORDEN IMPORTA, y cada escalón dice algo distinto:
    //   1. PERIODO — no se pidió. Es un juicio sobre el dato y SE ESCRIBE.
    //   2. OTRA CORRIDA — ya está escrito. No es un juicio: NO se escribe.
    //   3. SELLO — se miró y alguna hora no se midió.
    // Poner el sello antes del periodo inflaría la cuenta de apartados con días
    // que nadie quiso cargar; poner «otra corrida» antes del periodo escribiría
    // como ya cargado un día que ni siquiera se pidió.
    if (fueraDelPeriodo(d.fecha, periodo)) {
      fuera.push({ fecha: d.fecha, archivos,
        causa: CAUSA_DEL_APARTADO.PERIODO,
        porQue: motivoDelApartado({ causa: CAUSA_DEL_APARTADO.PERIODO, periodo }) });
      continue;
    }
    if (yaEstabaEscrito(d.fecha, yaCargadoHasta)) {
      otraCorrida.push({ fecha: d.fecha, archivos,
        causa: CAUSA_DEL_APARTADO.OTRA_CORRIDA,
        porQue: motivoDelApartado({ causa: CAUSA_DEL_APARTADO.OTRA_CORRIDA }) });
      continue;
    }
    const malo = apartadoPorSello.get(d.fecha);
    if (malo) {
      apartados.push({ fecha: d.fecha, archivos, causa: CAUSA_DEL_APARTADO.SELLO, porQue: malo.porQue });
      continue;
    }
    entran.push({ fecha: d.fecha, archivos, sinSello: !conSello.has(d.fecha) });
  }

  const lotes = repartirEnLotes(entran, { tope }).map((l, i) => ({
    indice: i + 1,
    dias: l.elementos,
    archivos: l.archivos,
    desde: l.elementos[0]?.fecha ?? null,
    hasta: l.elementos[l.elementos.length - 1]?.fecha ?? null,
  }));

  const suma = (xs) => xs.reduce((k, x) => k + (Number(x.archivos) || 0), 0);
  const archivos = {
    total: suma(ordenados),
    entran: suma(entran),
    apartados: suma(apartados),
    fuera: suma(fuera),
    otraCorrida: suma(otraCorrida),
  };
  archivos.explicados = archivos.entran + archivos.apartados + archivos.fuera + archivos.otraCorrida;
  archivos.cuadra = archivos.explicados === archivos.total;

  /** Los años que trae el origen, con lo que pesa cada uno. Medido, no supuesto. */
  const porAnio = new Map();
  for (const d of ordenados) {
    const a = String(d.fecha).slice(0, 4);
    if (!porAnio.has(a)) porAnio.set(a, { anio: a, dias: 0, archivos: 0 });
    porAnio.get(a).dias += 1;
    porAnio.get(a).archivos += Number(d.archivos) || 0;
  }
  const anios = [...porAnio.values()].sort((a, b) => a.anio.localeCompare(b.anio));

  const frenos = [];
  const freno = (clave, texto) => frenos.push({ clave, texto });

  if (!ordenados.length) {
    freno('sin-dias', 'No hay ningún día que cargar: la carpeta no trae archivos de medidas con fecha.');
  }
  // ⚠️ «No hay sellos» y «los sellos no se pudieron leer» son averías distintas
  // y se arreglan en sitios distintos: una es una carpeta que falta, la otra un
  // archivo roto. Decir «no hay ninguno» cuando sí los hay manda al Ingeniero a
  // buscar una carpeta que ya dio.
  if (sellos?.sinEje?.length && !sellos.leidos) {
    freno('sello-ilegible',
      `Los ${sellos.sinEje.length} archivo(s) de sello que se dieron NO traen un eje de tiempo `
      + 'reconocible, así que no se pudo leer ni uno: ninguna hora se puede dar por medida y no se '
      + 'puede decidir qué día se aparta.');
  } else if (!sellos || !sellos.leidos) {
    freno('sin-sellos',
      'No hay NINGÚN archivo de sello, así que ninguna hora se puede dar por medida y no se puede '
      + 'decidir qué día se aparta. El paso 2 aparta los «_quality», de modo que los sellos siguen '
      + 'en la carpeta del paso 1 (la de la bahía): añádala abajo.');
  } else if (sellos.mezcla) {
    freno('fecha-mezclada',
      `Los archivos de sello no se leen todos igual: ${sellos.ordenDeFecha?.porQue ?? 'la carga mezcla el orden de la fecha'}. `
      + 'Un día fechado al revés señalaría el día equivocado, así que no se aparta nada y no se carga nada.');
  } else if (sellos.sinEje.length) {
    freno('sello-ilegible',
      `${sellos.sinEje.length} archivo(s) de sello no traen un eje de tiempo reconocible, así que la `
      + 'lectura de sellos está incompleta y no se puede decidir qué días se apartan.');
  }
  // ⚠️ LOS DOS FRENOS QUE YA TENÍA LA CONSOLA, y que aquí faltaban
  // (`cargar-cargabilidad.mjs` se niega a cargar con cualquiera de los dos).
  // Van aparte y no en la cadena de arriba porque son averías DISTINTAS de las
  // de allí, y cada una se arregla en un sitio: una es un archivo que no se pudo
  // leer, la otra es la misma hora con dos respuestas.
  if (sellos?.ejeNoHorario?.length) {
    freno('sello-no-horario',
      `${sellos.ejeNoHorario.length} archivo(s) de sello se apartan sin leer: ${MOTIVO_EJE_NO_HORARIO}. `
      + 'Lo que traigan NO está en esta lectura, así que no se puede decidir qué días se apartan.');
  }
  if (sellos?.choques?.length) {
    freno('sellos-en-choque',
      `${sellos.choques.length} choque(s): la misma señal y la misma hora con dos lecturas distintas en `
      + 'archivos distintos. No se sabe cuál de las dos es el sello de esa hora, así que no se aparta '
      + 'nada y no se carga nada.');
  }
  if (anios.length > 1 && !periodo.desde && !periodo.hasta) {
    const detalle = anios.map((a) => `${a.anio}: ${a.archivos} archivo(s)`).join(' · ');
    freno('anios-mezclados',
      `El origen trae días de ${anios.length} años distintos (${detalle}). Acote el periodo antes de `
      + 'empezar: lo cargado no se retira.');
  }
  if (ordenados.length && !entran.length) {
    // ⚠️ Decir por qué NO entra nada, porque «ya estaba todo escrito» es una
    // buena noticia —la carga terminó— y «todos se apartaron» es una mala.
    // Un solo texto para los dos casos haría pensar que se perdió el histórico.
    freno('nada-entra', otraCorrida.length && !apartados.length && !fuera.length
      ? `Ningún día entra porque los ${otraCorrida.length} que trae la carpeta ya estaban escritos `
        + `hasta el ${yaCargadoHasta}. No falta nada por cargar.`
      : 'Ningún día entra: todos quedan apartados, fuera del periodo o ya escritos.');
  }
  const gordas = lotes.filter((l) => l.archivos > tope);
  if (gordas.length) {
    freno('tanda-pasada',
      `${gordas.length} tanda(s) se pasan de ${tope} archivos porque un solo día trae más `
      + '(un día no se parte). El rastro de procedencia no admite más de esos, así que esa carga '
      + 'la rechazaría el molde.');
  }
  if (!archivos.cuadra) {
    freno('no-cuadra',
      `${archivos.total} archivo(s) de medidas y solo ${archivos.explicados} explicados: hay archivos `
      + 'que no se escribirían, no se apartan y no se dicen.');
  }

  return {
    entran,
    apartados,
    fuera,
    /**
     * LOS DÍAS QUE YA ESTABAN ESCRITOS. Van aparte de `apartados` y de `fuera`
     * porque **no se escriben en el rastro**: de ellos esta carga no dice nada.
     * Se devuelven para que la pantalla los pueda ENSEÑAR —el Ingeniero tiene
     * que ver que la cuenta cuadra— sin que acaben en un documento inmutable.
     */
    otraCorrida,
    sinSello: entran.filter((d) => d.sinSello).map((d) => d.fecha),
    lotes,
    anios,
    archivos,
    dias: {
      total: ordenados.length,
      entran: entran.length,
      apartados: apartados.length,
      fuera: fuera.length,
      otraCorrida: otraCorrida.length,
    },
    frenos,
    sePuedeEmpezar: frenos.length === 0,
  };
}

/**
 * EL PERIODO QUE PROPONE EL PROPIO DATO — medido, nunca inventado.
 *
 * ⚠️ No elige por nadie: devuelve el año que MÁS archivos trae y sus extremos,
 * con la cuenta a la vista, para que el Ingeniero vea de dónde sale la propuesta
 * antes de aceptarla. Con un solo año devuelve `null`: no hay nada que acotar.
 */
export function periodoDelGrueso(dias = []) {
  const porAnio = new Map();
  for (const d of dias) {
    if (!d?.fecha) continue;
    const a = String(d.fecha).slice(0, 4);
    if (!porAnio.has(a)) porAnio.set(a, { anio: a, archivos: 0, fechas: [] });
    porAnio.get(a).archivos += Number(d.archivos) || 0;
    porAnio.get(a).fechas.push(String(d.fecha));
  }
  if (porAnio.size < 2) return null;
  const todos = [...porAnio.values()];
  const grueso = todos.reduce((a, b) => (b.archivos > a.archivos ? b : a));
  const fechas = [...grueso.fechas].sort();
  const total = todos.reduce((k, a) => k + a.archivos, 0);
  return {
    anio: grueso.anio,
    desde: fechas[0],
    hasta: fechas[fechas.length - 1],
    archivos: grueso.archivos,
    total,
    porQue: `el año con más archivos es ${grueso.anio} (${grueso.archivos} de ${total})`,
  };
}
