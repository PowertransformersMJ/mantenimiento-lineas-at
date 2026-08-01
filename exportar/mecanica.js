// ============================================================================
// exportar/mecanica.js — la verificación mecánica en UNA hoja
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE
// El ingeniero que revisa una línea no quiere cuatro archivos: quiere UNA hoja
// donde el tramo, el vano, el apoyo y el criterio se miren entre sí. La pregunta
// que siempre acaba haciéndose es «el tramo 4 va al 47 % de la RTS… ¿en cuál de
// sus vanos, y qué le llega al apoyo del final?», y para contestarla con
// archivos sueltos hay que cuadrarlos a mano, que es exactamente el momento en
// que se cuela el error. Por eso este exporte
// junta TRAMOS + VANOS + CARGAS (los dos ejes) + UMBRALES en un solo CSV.
//
// DOS DIALECTOS, igual que exportar/csv.js (y por el mismo hallazgo de la
// auditoría 2026-07-30):
//   · 'excel' → BOM + `sep=;` + CRLF + COMA decimal + procedencia arriba (con #).
//   · 'datos' → separador coma, PUNTO decimal, UTF-8 sin BOM, sin `sep=;`,
//               sin renglones de procedencia.
// `sep=;` solo redefine el separador de COLUMNAS; el decimal lo toma Excel de la
// configuración regional, y en es-CO es la COMA. Un CSV con punto decimal entra
// a Excel es-CO como TEXTO: se ve bien, no suma, y nadie se entera hasta que un
// total sale en cero.
//
// ⚠️ CONSECUENCIA DECLARADA, y hay que decirla fuerte: este archivo tiene CINCO
// SECCIONES, así que NI SIQUIERA el dialecto 'datos' es una tabla única.
// `pandas.read_csv()` a secas va a fallar sobre él — y es preferible que falle
// ruidosamente a que el ingeniero tenga que cuadrar tres archivos a mano para
// leer una sola verificación. Quien automatice: corte por los renglones de
// sección (empiezan por `==`) o pida el CSV plano de exportar/csv.js.
//
// LO QUE ESTE ARCHIVO **NO** HACE
// · No calcula NADA. Recibe las filas ya calculadas por el núcleo (tramos,
//   detalleVanos, evaluarUmbrales) y las escribe. Si aquí hubiera una fórmula,
//   la hoja y la pantalla podrían dar números distintos para el mismo vano.
// · No rellena huecos. Un valor que no llegó sale como celda VACÍA, y donde hay
//   un veredicto que no se puede emitir sale escrito «no evaluable». Una casilla
//   vacía se ve; un número inventado en una memoria de cálculo, no — y alguien
//   la firma.
// · No exporta la bandera `excede` de la tabla de tramos, a propósito: esa se
//   calcula hoy con `tiroMaximoAdmisible()` (0,5·RTS fijo en código) mientras la
//   sección UMBRALES lee el tope de la HIPÓTESIS. Con una hipótesis que declare
//   otro `tiroAdmisible_pct`, las dos columnas se contradirían dentro del mismo
//   archivo firmado. Se publica `Pct_RTS`, que es el dato, y el veredicto lo da
//   la sección de umbrales, que es la que sabe contra qué compara.
//
// JavaScript puro: sin DOM, sin red. Devuelve el texto del archivo.
// ============================================================================
import { bloqueProcedencia } from './procedencia.js';
import { VERSION_EXPORTADOR } from './version.js';

// ── Rótulos de sección ──────────────────────────────────────────────────────
// Se exportan como constantes para que la interfaz y las pruebas no tengan que
// repetir el texto a mano: el día que cambie una tilde, cambia en un solo sitio
// y nada se rompe en silencio.
export const SECCIONES_MECANICA = Object.freeze({
  tramos:   '== TRAMOS DE TENSIÓN ==',
  vanos:    '== VANOS ==',
  cargas:   '== CARGA SOBRE LAS ESTRUCTURAS ==',
  longitudinal: '== CARGA LONGITUDINAL (EJE DE LA LÍNEA) ==',
  umbrales: '== UMBRALES Y CRITERIOS ==',
});

/**
 * Las tres primeras columnas (`Linea`, `Conductor`, `Hipotesis`) se repiten en
 * cada renglón de tramo a propósito: el dialecto 'datos' NO lleva cabecera de
 * procedencia, y un tiro de 2 500 kgf sin decir con qué hipótesis se calculó no
 * es un dato, es un número suelto. Van solo en TRAMOS —que son pocas filas— y
 * no en VANOS, que heredan la identificación por su columna `Tramo`.
 */
export const COLUMNAS_TRAMOS = [
  'Linea', 'Conductor', 'Hipotesis',
  'Tramo', 'Desde', 'Hasta', 'N_vanos',
  'Vano_max_m', 'VIR_m',
  'H_EDS_kgf', 'H_Tmax_kgf', 'H_viento_kgf', 'H_Tmin_kgf',
  'Pct_RTS', 'Flecha_max_m',
];

export const COLUMNAS_VANOS = [
  'N', 'Tramo', 'Vano_m', 'Rel_VIR', 'Fuera_de_rango',
  'Flecha_EDS_m', 'Flecha_Tmax_m', 'Flecha_Tmin_m',
  'Longitud_conductor_m', 'Parametro_C_m',
];

/**
 * La carga que recibe cada ESTRUCTURA. Las tres secciones anteriores hablan del
 * conductor; ésta del apoyo, que es de lo que responde quien firma.
 *
 * `Factor_quiebre` va con TRES decimales y columna propia —y no escondido dentro
 * de la carga— porque es el número que cambia la conversación: por encima de 1
 * la estructura recibe MÁS carga transversal que la propia tensión del cable, y
 * la recibe siempre, haya viento o no. En una hoja se ordena por esa columna y
 * los apoyos comprometidos salen arriba solos.
 *
 * `Utilizacion_pct` y `Margen_kgf` salen VACÍOS mientras el apoyo no declare su
 * carga de rotura y sus dos alturas: `Estado_utilizacion` dice entonces
 * «no_evaluable», que es un hecho sobre los datos y no un fallo. `Motivo` lleva
 * escrito qué falta, para que la hoja sea a la vez el diagnóstico y la lista de
 * lo que hay que ir a capturar.
 */
export const COLUMNAS_CARGAS = [
  'N', 'Apoyo', 'Funcion_estructural', 'Es_extremo', 'Tramos',
  'Deflexion_grados', 'Factor_quiebre', 'Amplifica_tension',
  'N_conductores', 'Vano_viento_m',
  'Tiro_kgf', 'Estado_tiro',
  'Ft_angulo_kgf', 'Ft_viento_kgf', 'Ft_total_kgf',
  'Utilizacion_pct', 'Margen_kgf', 'Estado_utilizacion', 'Motivo',
];

/**
 * `Umbral_1` y `Umbral_2` son DOS columnas numéricas y no un texto «0,7 – 1,3»
 * porque en la hoja el ingeniero ordena y filtra por ese valor: un texto con
 * guion se ordena alfabéticamente y pone el 10 antes del 2. Cómo se leen lo
 * dice `Comparador`: con '<=' o '>=' el número está en `Umbral_1` y `Umbral_2`
 * va vacío; con 'entre' son el mínimo y el máximo, en ese orden.
 */
/**
 * El OTRO eje. Va en sección aparte y NO como columnas más de la tabla anterior:
 * son cargas sobre ejes distintos y ninguna hoja debe invitar a sumarlas.
 *
 * Los dos sentidos ocupan DOS columnas y no una con signo, porque un apoyo puede
 * tirar hacia los dos según la temperatura: una sola columna obligaría a elegir
 * cuál publicar, y esa elección es justo la que decide si hace falta retención a
 * un lado o a los dos. `Inversion_afirmable` dice si el segundo sentido pesa más
 * que el ruido de tendido de obra — si no, no se afirma.
 *
 * `Rotura_*` es el caso ACCIDENTAL, sin veredicto: este proyecto no ha adoptado
 * criterio de aceptación para él. No se suma con las columnas permanentes.
 */
export const COLUMNAS_LONGITUDINAL = [
  'N', 'Apoyo', 'Funcion_estructural', 'Caso',
  'Deflexion_grados', 'Factor_cos_mitad',
  'FL_adelante_kgf', 'Estado_adelante', 'FL_atras_kgf', 'Estado_atras',
  'Sensibilidad_tendido_kgf', 'Sentido_resoluble', 'Inversion_afirmable',
  'Rotura_lado_atras_kgf', 'Rotura_lado_adelante_kgf', 'Motivo',
];

export const COLUMNAS_UMBRALES = [
  'Id', 'Indicador', 'Valor', 'Unidad',
  'Umbral_1', 'Umbral_2', 'Comparador', 'Estado', 'Criterio', 'Fuente',
];

// ── El dialecto, en un solo sitio ───────────────────────────────────────────

/**
 * Herramientas de escritura del dialecto elegido. Se exporta porque
 * exportar/bom.js escribe con las MISMAS reglas y una regla copiada en dos
 * archivos es una regla que algún día se corrige en uno solo: el día que eso
 * pase, el CSV de cálculo saldría con coma decimal y el de cantidades con
 * punto, y solo uno de los dos sumaría en Excel.
 *
 * Vive aquí y no en un `exportar/dialecto.js` compartido (que sería su sitio
 * natural, con csv.js usándolo también) porque ese refactor toca archivos de
 * otros; queda anotado para la integración.
 *
 * @param {{dialecto?: 'excel'|'datos'}} [opciones]
 */
export function dialectoCsv(opciones = {}) {
  const excel = (opciones.dialecto ?? 'excel') === 'excel';
  const sep = excel ? ';' : ',';

  /** Texto: comillas dobladas (RFC 4180 en ambos dialectos). */
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;

  /**
   * Número con `d` decimales, o celda VACÍA si no hay número que escribir.
   * `null`, `undefined`, `NaN` e `Infinity` caen todos aquí: un «NaN» impreso en
   * una memoria de cálculo se lee como una cifra rara, y un «Infinity» se lee
   * como un tiro enorme. Ninguno de los dos es un dato; la celda vacía sí dice
   * la verdad, que es que ese valor no se pudo calcular.
   */
  const num = (v, d = 2) =>
    (Number.isFinite(v) ? (excel ? v.toFixed(d).replace('.', ',') : v.toFixed(d)) : '');

  /** Conteos: enteros sin decimales (un «3,00» en la columna de vanos chirría). */
  const ent = (v) => (Number.isFinite(v) ? String(Math.trunc(v)) : '');

  /**
   * Booleano de TRES estados. `null` no es `false`: decir «no» donde nadie pudo
   * medir es afirmar que se cumple. Se escribe «no evaluable», con esas palabras.
   */
  const siNo = (v) => (v === true ? 'si' : v === false ? 'no' : 'no evaluable');

  const fila = (celdas) => celdas.join(sep);

  return { excel, sep, q, num, ent, siNo, fila };
}

// ── Ayudas de rotulado (echan lo que llegó; nunca inventan un nombre) ───────

const nombreDe = (x) =>
  (typeof x === 'string' && x ? x
    : (typeof x?.nombre === 'string' && x.nombre ? x.nombre : null));

/**
 * Cómo se llama un tramo en la hoja. Acepta las formas en que llega hoy:
 * texto ya aplanado por la vista, el objeto del núcleo (`desde`/`hasta` son
 * apoyos) o el ordinal. Si no hay ninguna, celda vacía — antes eso que un
 * «tramo 1» que no corresponde a ningún tramo real.
 */
function rotuloTramo(x) {
  if (typeof x === 'string') return x;
  if (Number.isFinite(x)) return `tramo ${x}`;
  const de = nombreDe(x?.desde);
  const a = nombreDe(x?.hasta);
  if (de && a) return `${de} → ${a}`;
  if (Number.isFinite(x?.n)) return `tramo ${x.n}`;
  return '';
}

/** Código del conductor o de la hipótesis, tal como venga. Sin adivinar. */
const rotulo = (x) =>
  (typeof x === 'string' ? x : (x?.codigo ?? x?.nombre ?? ''));

/**
 * El bloque de procedencia, o la confesión de que no se pudo armar.
 *
 * `bloqueProcedencia` necesita la derivación del levantamiento (estructuras,
 * empalmes, sistema de referencia, precisión del GPS). Si el llamador no la
 * pasa, NO se fabrica una: poner «+ 0 empalmes» porque nadie los contó sería
 * inventar un dato en la línea que precisamente sirve para defender el archivo.
 * Se escribe qué falta y qué consecuencia tiene.
 */
function renglonesProcedencia(linea, lev, opciones) {
  if (lev && Number.isFinite(lev.longitud_m) && Number.isFinite(lev.nEstructuras)) {
    return bloqueProcedencia(linea, lev, opciones);
  }

  const r = [];
  const cab = [`Línea ${linea?.codigo ?? '(sin código)'}`];
  if (linea?.nombre && linea.nombre !== linea.codigo) cab.push(linea.nombre);
  if (linea?.tensionNominal_kV != null) cab.push(`${linea.tensionNominal_kV} kV`);
  if (linea?.propietario) cab.push(linea.propietario);
  r.push(cab.join(' · '));
  r.push('Procedencia del levantamiento: NO EVALUABLE — este exporte no recibió la derivación'
    + ' (`derivarLevantamiento`), así que no puede declarar sistema de referencia, método ni'
    + ' precisión del GPS. Las cifras de abajo son reproducibles por su hipótesis, no por su origen'
    + ' geodésico: no las use para justificar distancias de seguridad.');
  if (opciones?.hipotesisNombre) r.push(`Hipótesis de cálculo: ${opciones.hipotesisNombre}`);
  const gen = [`Exportador @lineas/exportar v${VERSION_EXPORTADOR}`,
    'generado desde los datos del sistema, no desde la pantalla (ADR-005/006)'];
  if (opciones?.generadoEn) gen.unshift(`Generado ${opciones.generadoEn}`);
  if (opciones?.generadoPor) gen.push(`por ${opciones.generadoPor}`);
  r.push(gen.join(' · '));
  return r;
}

// ── Función pública ─────────────────────────────────────────────────────────

/**
 * CSV de verificación mecánica: tramos, vanos y umbrales en un solo archivo.
 *
 * @param {Object} entrada
 * @param {{codigo?:string, nombre?:string, tensionNominal_kV?:number, propietario?:string}} [entrada.linea]
 * @param {{codigo?:string, nombre?:string}|string} [entrada.conductor] solo para rotular
 * @param {{nombre?:string}|string}                 [entrada.hipotesis] solo para rotular
 * @param {Array<{n?:number, desde?:*, hasta?:*, nVanos?:number, vanoMax?:number, vir?:number,
 *                hEds?:number, hTMax?:number, hViento?:number, hTMin?:number,
 *                pctRts?:number, flechaMax?:number}>} [entrada.tramos]
 *        Una fila por tramo de tensión (la que arma `calcularTramos`).
 * @param {Array<{n?:number, tramo?:*, a_m?:number, relVir?:number, fueraDeRango?:boolean|null,
 *                flechaEds_m?:number, flechaTMax_m?:number, flechaTMin_m?:number,
 *                longitudConductor_m?:number, parametroC_m?:number}>} [entrada.vanos]
 *        Filas de `detalleVanos` YA numeradas de forma corrida para toda la línea
 *        y con su tramo. `detalleVanos` numera dentro del tramo: si nadie
 *        renumera, el informe sale con tres «vano 1» y nadie sabe de cuál se
 *        habla (ver nucleo/vanos.js).
 * @param {Array<{id:string, etiqueta:string, valor:number|null, unidad:string,
 *                umbral:number|number[]|null, comparador:string, estado:string,
 *                criterio:string, fuente:string}>} [entrada.indicadores]
 *        Salida de `evaluarUmbrales`.
 * @param {ReturnType<import('./levantamiento.js').derivarLevantamiento>} [entrada.levantamiento]
 *        Opcional. Si llega, la procedencia es LA MISMA que la del GPX/KML/CSV:
 *        un archivo firmado no puede declarar dos orígenes distintos según qué
 *        botón se pulsó.
 * @param {{dialecto?:'excel'|'datos', generadoEn?:string, generadoPor?:string,
 *          hipotesisNombre?:string, levantamiento?:*}} [opciones]
 * @returns {string} el texto del archivo
 */
export function csvVerificacionMecanica(entrada, opciones = {}) {
  const e = entrada ?? {};
  const { excel, q, num, ent, siNo, fila } = dialectoCsv(opciones);

  const linea = e.linea ?? {};
  const tramos = Array.isArray(e.tramos) ? e.tramos : [];
  const vanos = Array.isArray(e.vanos) ? e.vanos : [];
  const cargas = Array.isArray(e.cargas) ? e.cargas : [];
  const longitudinal = Array.isArray(e.longitudinal) ? e.longitudinal : [];
  const indicadores = Array.isArray(e.indicadores) ? e.indicadores : [];
  const lev = e.levantamiento ?? opciones.levantamiento ?? null;

  const codLinea = linea.codigo ?? '';
  const codConductor = rotulo(e.conductor);
  // El nombre de la hipótesis puede llegar por el objeto o por la meta del
  // llamador (que es como lo pasa la pestaña Exportar). Se acepta cualquiera.
  const codHipotesis = rotulo(e.hipotesis) || (opciones.hipotesisNombre ?? '');

  const r = [];

  // ── Cabecera del dialecto Excel ───────────────────────────────────────────
  if (excel) {
    r.push('sep=;');
    for (const l of renglonesProcedencia(linea, lev, opciones)) r.push(q('# ' + l));
    r.push(q('# Cinco secciones en un archivo: TRAMOS, VANOS, CARGA TRANSVERSAL, CARGA'
      + ' LONGITUDINAL y UMBRALES. Los renglones que empiezan por «==» separan las secciones.'
      + ' Los dos ejes de carga NO se suman entre sí.'));
    // Aquí NO va un renglón en blanco: lo pone `abrirSeccion` al abrir la
    // primera sección. Ponerlo en los dos sitios deja dos filas vacías seguidas
    // en la hoja, y Excel las cuenta como parte del rango al seleccionar.
  }

  /** Cabecera de sección + su fila de columnas. Blanco antes, para que Excel las separe. */
  const abrirSeccion = (titulo, columnas) => {
    if (r.length) r.push('');
    r.push(q(titulo));
    r.push(fila(columnas));
  };

  /** Lo que se escribe cuando una sección se queda sin filas: el motivo, no el vacío. */
  const seccionVacia = (motivo) => r.push(q(motivo));

  // ══ 1 · TRAMOS DE TENSIÓN ════════════════════════════════════════════════
  abrirSeccion(SECCIONES_MECANICA.tramos, COLUMNAS_TRAMOS);
  if (!tramos.length) {
    seccionVacia('(sin filas) — no llegó ningún tramo de tensión. Sin tramos no hay verificación'
      + ' mecánica: revise que la línea tenga al menos dos estructuras y un ancla en cada extremo.');
  } else {
    tramos.forEach((t, i) => {
      r.push(fila([
        q(codLinea), q(codConductor), q(codHipotesis),
        // El ordinal del tramo lo manda el llamador si lo trae; si no, la
        // posición en la lista, que es el mismo orden de la línea.
        ent(Number.isFinite(t?.n) ? t.n : i + 1),
        q(nombreDe(t?.desde) ?? ''), q(nombreDe(t?.hasta) ?? ''),
        ent(t?.nVanos),
        num(t?.vanoMax, 2), num(t?.vir, 2),
        num(t?.hEds, 1), num(t?.hTMax, 1), num(t?.hViento, 1), num(t?.hTMin, 1),
        num(t?.pctRts, 2), num(t?.flechaMax, 3),
      ]));
    });
  }

  // ══ 2 · VANOS ════════════════════════════════════════════════════════════
  abrirSeccion(SECCIONES_MECANICA.vanos, COLUMNAS_VANOS);
  if (!vanos.length) {
    seccionVacia('(sin filas) — no llegó ningún vano. El tramo dice cuánto tira el conductor;'
      + ' el que roza un árbol o una carretera es un vano concreto, y sin esta sección no está.');
  } else {
    vanos.forEach((v, i) => {
      r.push(fila([
        ent(Number.isFinite(v?.n) ? v.n : i + 1),
        q(rotuloTramo(v?.tramo)),
        num(v?.a_m, 2), num(v?.relVir, 3),
        // `fueraDeRango` es null cuando el tramo no trajo VIR contra qué
        // comparar: ahí no hay veredicto, y decir «no» sería inventarlo.
        q(siNo(v?.fueraDeRango ?? null)),
        num(v?.flechaEds_m, 3), num(v?.flechaTMax_m, 3), num(v?.flechaTMin_m, 3),
        num(v?.longitudConductor_m, 3), num(v?.parametroC_m, 1),
      ]));
    });
  }

  // ══ 3 · CARGA SOBRE LAS ESTRUCTURAS ══════════════════════════════════════
  abrirSeccion(SECCIONES_MECANICA.cargas, COLUMNAS_CARGAS);
  if (!cargas.length) {
    seccionVacia('(sin filas) — no llegó la carga sobre los apoyos. Las secciones de arriba dicen'
      + ' cuánto TIRA el conductor; sin ésta el archivo no dice qué recibe la estructura, que es la'
      + ' pregunta de la que responde quien firma.');
  } else {
    cargas.forEach((c, i) => {
      r.push(fila([
        ent(Number.isFinite(c?.n) ? c.n : i + 1),
        q(c?.apoyo ?? ''), q(c?.funcionEstructural ?? ''),
        q(siNo(c?.esExtremo ?? null)),
        // Los tramos que cuelgan de este apoyo, separados por '+' y NO por el
        // separador de columnas: un '1;2' partiría la fila en Excel.
        q(Array.isArray(c?.tramos_n) ? c.tramos_n.join('+') : ''),
        num(c?.deflexion_grados, 2), num(c?.factorAngulo, 3),
        // Tres estados, igual que en la pantalla: sin ángulo no hay veredicto,
        // y escribir «no» donde nadie pudo medirlo afirma que el apoyo está
        // holgado — que es justo lo contrario de lo que se sabe.
        q(siNo(c?.amplifica ?? null)),
        ent(c?.nConductores), num(c?.vanoViento_m, 2),
        num(c?.tiro_kgf, 1), q(c?.estadoTiro ?? ''),
        num(c?.ftAngulo_kgf, 1), num(c?.ftViento_kgf, 1), num(c?.ftTotal_kgf, 1),
        num(c?.utilizacion_pct, 2), num(c?.margen_kgf, 1),
        // Valor CRUDO ('no_evaluable'), igual que en la sección de umbrales: es
        // la llave con la que se filtra la hoja.
        q(c?.estadoUtilizacion ?? 'no_evaluable'),
        // El motivo de no evaluable y los supuestos, en una sola celda: quien
        // lea la fila tiene que poder ver por qué falta el número sin salir de
        // ella. Se juntan con ' · ' porque el salto de línea rompe la celda.
        q([c?.noEvaluable, ...(Array.isArray(c?.notas) ? c.notas : [])]
          .filter(Boolean).join(' · ')),
      ]));
    });
  }

  // ══ 4 · CARGA LONGITUDINAL ═══════════════════════════════════════════════
  abrirSeccion(SECCIONES_MECANICA.longitudinal, COLUMNAS_LONGITUDINAL);
  if (!longitudinal.length) {
    seccionVacia('(sin filas) — no llegó la carga longitudinal. La sección anterior dice cuánto'
      + ' empuja el apoyo de LADO; sin ésta el archivo no dice cuánto tira a lo LARGO de la línea,'
      + ' que es el eje del que cuelga la retención y el que gobierna un terminal.');
  } else {
    longitudinal.forEach((c, i) => {
      r.push(fila([
        ent(Number.isFinite(c?.n) ? c.n : i + 1),
        q(c?.apoyo ?? ''), q(c?.funcionEstructural ?? ''), q(c?.caso ?? ''),
        num(c?.deflexion_grados, 2), num(c?.factorLongitudinal, 3),
        num(c?.flAdelanteMax_kgf, 1), q(c?.estadoAdelante ?? ''),
        num(c?.flAtrasMax_kgf, 1), q(c?.estadoAtras ?? ''),
        num(c?.sensibilidadTendido_kgf, 1),
        q(siNo(c?.sentidoResoluble ?? null)), q(siNo(c?.inversionResoluble ?? null)),
        num(c?.roturaAtras_kgf, 1), num(c?.roturaAdelante_kgf, 1),
        q([c?.noEvaluable, ...(Array.isArray(c?.notas) ? c.notas : [])].filter(Boolean).join(' · ')),
      ]));
    });
  }

  // ══ 5 · UMBRALES Y CRITERIOS ═════════════════════════════════════════════
  abrirSeccion(SECCIONES_MECANICA.umbrales, COLUMNAS_UMBRALES);
  if (!indicadores.length) {
    seccionVacia('(sin filas) — no llegó ningún indicador. Un exporte de verificación sin la tabla'
      + ' de criterios no demuestra nada: son las filas que dicen contra QUÉ se comparó cada cifra.');
  } else {
    for (const i of indicadores) {
      const u = i?.umbral;
      const enBanda = Array.isArray(u);
      r.push(fila([
        q(i?.id ?? ''), q(i?.etiqueta ?? ''),
        num(i?.valor, 3), q(i?.unidad ?? ''),
        num(enBanda ? u[0] : u, 3), num(enBanda ? u[1] : null, 3),
        q(i?.comparador ?? ''),
        // Se escribe el valor CRUDO ('no_evaluable', no «no evaluable»): es la
        // llave estable con la que se filtra la hoja y con la que la interfaz
        // referencia la fila. El rótulo bonito es cosa de la pantalla.
        q(i?.estado ?? ''),
        q(i?.criterio ?? ''), q(i?.fuente ?? ''),
      ]));
    }
  }

  return (excel ? '﻿' : '') + r.join('\r\n');
}
