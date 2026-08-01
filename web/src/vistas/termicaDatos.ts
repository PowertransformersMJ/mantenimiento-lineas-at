// ============================================================================
// vistas/termicaDatos.ts — el tablero térmico: cuánta corriente aguanta la
//                          línea en cada clima, y cuánta pierde cuando aprieta
// ----------------------------------------------------------------------------
// Función PURA de presentación. Entran el conductor, la hipótesis y los
// escenarios; salen filas listas para pintar. Aquí NO hay ni una fórmula de
// ingeniería: el balance térmico entero lo resuelve @lineas/nucleo/termica
// (IEEE Std 738). Esa frontera es la que permite auditar la ingeniería sin
// leer código de interfaz.
//
// POR QUÉ EXISTE
//
// Hoy la pantalla muestra UN número de ampacidad. Un número solo no se puede
// auditar ni discutir, porque la ampacidad NO es una propiedad del conductor:
// es el resultado de un balance con el clima. El mismo cable, el mismo día,
// con sol y sin viento, transporta bastante menos. Quien despacha carga
// mirando el número de placa está despachando contra un clima que hoy no
// existe — y el conductor no avisa: se estira, la flecha crece y el gálibo se
// pierde antes de que salte nada.
//
// La tabla convierte ese número único en una FRANJA con sus condiciones a la
// vista, y con ella el mensaje que gobierna la pestaña: con El Niño el ambiente
// sube y la ampacidad baja JUSTO cuando la demanda sube. Ese es el momento en
// que una línea que siempre bastó deja de bastar.
//
// LO QUE NO SE INVENTA
//
// Sin diámetro y sección del conductor no hay balance térmico; sin la tensión
// de la LÍNEA no hay MVA. En los dos casos la celda sale `null` y el motivo
// entra en `avisos`. Un hueco se ve; un número de relleno se firma.
//
// Ver docs/40-DOMINIO-LINEAS-AT.md §4.
// ============================================================================
import { derrateo, resistenciaDC, temperaturaLimite, MATERIALES }
  from '@lineas/nucleo/termica';

// ── Tipos de entrada ────────────────────────────────────────────────────────
//
// Todos los campos van OPCIONALES a propósito: el caso «falta el dato» no es
// una excepción de este módulo, es su trabajo principal. Un `Conductor` o una
// `Hipotesis` completos del contrato encajan aquí sin conversión.

export interface ConductorTermico {
  codigo?: string;
  /** Clave del catálogo de `nucleo/termica.js` (ACSR, AAAC, ACAR, ACSS / ACCC, Otro). */
  material?: string;
  seccion_mm2?: number;
  /** ⚠️ En METROS: es lo que pide el núcleo. Un diámetro en mm da una ampacidad absurda. */
  diametro_m?: number;
  /** Temperatura máxima de operación de la FICHA. Si no viene, manda el límite del material. */
  tempMaxOperacion_C?: number;
}

export interface HipotesisTermica {
  nombre?: string;
  /**
   * Temperatura del conductor con la que se calculó la FLECHA en la tabla
   * mecánica. No entra en el balance térmico; sirve para delatar una
   * incoherencia cara: pedirle a la línea una corriente que la calienta más de
   * lo que supuso el cálculo de flechas.
   */
  tempMax_C?: number;
  /** Por si algún día la hipótesis la trae; hoy la tensión vive en `Linea`. */
  tensionNominal_kV?: number;
}

/**
 * Un escenario es una fotografía del clima. Se declaran fuera del cálculo para
 * que se puedan DISCUTIR: cambiarlos es cambiar la tabla entera, y eso tiene
 * que costar una línea de datos, no una lectura de código.
 */
export interface EscenarioClima {
  /** Identificador estable para el código; la `etiqueta` es lo que lee la gente. */
  clave?: string;
  etiqueta: string;
  ta_C: number;
  viento_m_s: number;
  sol_W_m2: number;
  /** Escenario contra el que se mide el derrateo. Solo uno manda. */
  referencia?: boolean;
  nota?: string;
}

export interface OpcionesTablero {
  /** Escenarios a evaluar. Si no llega ninguno, se usan los ADOPTADOS de abajo. */
  lista?: readonly EscenarioClima[];
  /**
   * Tensión de la línea, en kV. **Se lee, nunca se fija.** Este módulo tiene que
   * servir igual a una línea de 34,5 kV que a una de 220 kV: una tensión
   * incrustada en el código convierte el MVA de todas las demás líneas en un
   * número silenciosamente falso. Vive en `Linea.tensionNominal_kV` (el contrato
   * NO la pone en `Hipotesis`), así que la vista la pasa explícita.
   */
  tensionNominal_kV?: number | null;
  /** Altitud sobre el nivel del mar, m. Aire más ralo evacúa menos calor. */
  altitud_m?: number;
  /** Emisividad y absortividad de la superficie: 0,23 conductor nuevo … 0,91 envejecido. */
  emisividad?: number;
  absortividad?: number;
  /** Fuerza la temperatura del conductor. Si no, sale de la ficha o del material. */
  temperaturaConductor_C?: number;
}

/**
 * El tercer parámetro admite las dos formas porque las dos son naturales:
 * una LISTA de escenarios (el caso corriente) o el objeto de opciones completo.
 * Pasar un arreglo y que el módulo lo ignorara en silencio sería justo el tipo
 * de trampa que este proyecto no se permite.
 */
export type EntradaEscenarios = readonly EscenarioClima[] | OpcionesTablero;

// ── Tipos de salida ─────────────────────────────────────────────────────────

export interface FilaEscenario {
  clave?: string;
  etiqueta: string;
  ta_C: number;
  viento_m_s: number;
  sol_W_m2: number;
  /** Amperios. `null` = no evaluable con los datos de hoy (ver `avisos`). */
  ampacidad_A: number | null;
  /** Potencia trifásica aparente, MVA: √3 · U · I / 1000. `null` sin tensión de línea. */
  mva: number | null;
  /**
   * Capacidad PERDIDA frente al escenario de referencia, en %.
   * Positivo = pierde capacidad · negativo = tiene más que en la referencia
   * (una noche fresca y sin sol enfría mejor) · 0 = es la referencia.
   */
  derrateo_pct: number | null;
  esReferencia: boolean;
  nota?: string;
}

export interface FilaResistencia {
  T_C: number;
  /** Ω por kilómetro, en corriente CONTINUA. `null` si falta la sección. */
  ohm_km: number | null;
  /** true si esa temperatura es el límite continuo del material del conductor. */
  esLimite: boolean;
  nota?: string;
}

export interface Aviso {
  severidad: 'atencion' | 'aviso' | 'info';
  texto: string;
}

export interface Referencia {
  etiqueta: string;
  ta_C: number;
  viento_m_s: number;
  sol_W_m2: number;
  /** Temperatura del conductor con la que se calculó TODA la tabla. */
  tc_C: number | null;
  tcOrigen: string;
  tension_kV: number | null;
  altitud_m: number;
  emisividad: number;
  absortividad: number;
}

export interface TableroTermico {
  escenarios: FilaEscenario[];
  resistencia: FilaResistencia[];
  referencia: Referencia;
  avisos: Aviso[];
}

// ── Criterios ADOPTADOS en este proyecto (no son cifras de norma) ───────────
//
// Se declaran aquí, con nombre y valor a la vista, para que el revisor pueda
// discutirlos en vez de descubrirlos leyendo el código. Ninguno sale de una
// norma citable: son el clima con el que este proyecto decide medir la línea.
// El día que se declare un clima de proyecto con fuente, se cambian aquí y las
// cuatro filas se recalculan solas.
//
// El viento de 0,61 m/s es el mismo que ya usa el resto de la aplicación: es la
// condición baja habitual del cálculo de ampacidad (2 pies/s). No es «el viento
// que hace»: es el viento que se supone para no acreditarle al conductor una
// refrigeración que puede no estar.

export const ESCENARIOS_ADOPTADOS: readonly EscenarioClima[] = Object.freeze([
  Object.freeze({
    clave: 'noche', etiqueta: 'Noche fresca', ta_C: 24, viento_m_s: 0.61, sol_W_m2: 0,
    nota: 'Sin sol y con el ambiente abajo: es la mejor hora del conductor. Sirve de techo, no de criterio de despacho.',
  }),
  Object.freeze({
    clave: 'tipico', etiqueta: 'Día típico', ta_C: 32, viento_m_s: 0.61, sol_W_m2: 1000,
    referencia: true,
    nota: 'Escenario de REFERENCIA: contra este se mide todo lo que la línea pierde en los demás.',
  }),
  Object.freeze({
    clave: 'caluroso', etiqueta: 'Día caluroso', ta_C: 38, viento_m_s: 0.61, sol_W_m2: 1000,
    nota: 'Seis grados más de ambiente. Ni un día raro: es una tarde de verano cualquiera.',
  }),
  Object.freeze({
    clave: 'nino', etiqueta: 'El Niño, viento en calma', ta_C: 40, viento_m_s: 0.2, sol_W_m2: 1000,
    nota: 'Ambiente arriba Y aire quieto a la vez. Coincide con los meses de mayor demanda: la capacidad cae justo cuando hace falta.',
  }),
]);

/** Temperaturas de la tabla de resistencia. 20 °C es la única comparable con el catálogo. */
const TEMPERATURAS_RESISTENCIA: readonly number[] = Object.freeze([20, 50, 75, 90]);

const NOTA_RESISTENCIA: Readonly<Record<number, string>> = Object.freeze({
  20: 'Temperatura de catálogo. Es la única fila que se puede confrontar con la ficha del fabricante.',
  50: 'Conductor cargado en un día corriente.',
  75: 'Límite continuo del ACSR: por encima, el aluminio se recuece y no vuelve.',
  90: 'Límite continuo de las aleaciones (AAAC / ACAR). Para un ACSR ya es zona de daño permanente.',
});

// Valores por defecto del ambiente. Emisividad y absortividad 0,5 son el punto
// medio del rango que documenta el núcleo (0,23 nuevo … 0,91 envejecido): un
// conductor con años encima absorbe más sol y también radia mejor, y por eso el
// medio no es una cobardía sino la hipótesis honesta mientras nadie mida.
const EMISIVIDAD_POR_DEFECTO = 0.5;
const ABSORTIVIDAD_POR_DEFECTO = 0.5;
// Altitud 0 = nivel del mar. No se inventa la cota de la línea: al nivel del mar
// el aire es el más denso posible, o sea el caso que MÁS ampacidad da. Si la
// línea sube, la vista debe pasar su altitud o la tabla queda optimista.
const ALTITUD_POR_DEFECTO_M = 0;

// ── Ayudas internas ─────────────────────────────────────────────────────────

const numero = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

// Formateo propio y mínimo, solo para el texto de los avisos. NO se reutiliza
// `nf` de ./formato porque ese módulo arrastra @lineas/exportar, y este tablero
// tiene que poder ejecutarse y probarse pelado, sin más dependencia que el
// núcleo (misma razón que en vistas/diagramas.ts).
const f = (v: number, d = 0): string =>
  v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });

const CATALOGO_MATERIALES: readonly string[] = Object.keys(MATERIALES);

/**
 * Tablero térmico completo de una línea.
 *
 * @param conductor   material, sección y diámetro; y la temperatura de la ficha si la hay
 * @param hipotesis   solo para cruzar la térmica con la mecánica (ver `tempMax_C`)
 * @param escenarios  lista de escenarios, u objeto de opciones (ver `EntradaEscenarios`)
 */
export function tableroTermico(
  conductor: ConductorTermico = {},
  hipotesis: HipotesisTermica = {},
  escenarios: EntradaEscenarios = {},
): TableroTermico {
  const op: OpcionesTablero = Array.isArray(escenarios)
    ? { lista: escenarios as readonly EscenarioClima[] }
    : ((escenarios ?? {}) as OpcionesTablero);

  const avisos: Aviso[] = [];
  const anota = (severidad: Aviso['severidad'], texto: string) => avisos.push({ severidad, texto });

  // ── 1 · Escenarios y cuál manda como referencia ───────────────────────────
  const lista: readonly EscenarioClima[] =
    op.lista && op.lista.length ? op.lista : ESCENARIOS_ADOPTADOS;

  const marcados = lista.filter((e) => e?.referencia);
  const ref = marcados[0] ?? lista[0];
  // La referencia se fija por POSICIÓN, no por identidad del objeto: si la vista
  // repite el mismo escenario congelado en dos filas (pasa al comparar listas),
  // comparar con `===` marcaría las dos como referencia y la tabla mostraría dos
  // ceros de derrateo — o sea, dos tablas distintas superpuestas sin decirlo.
  const iRef = lista.indexOf(ref);
  if (!marcados.length) {
    anota('info', `Ningún escenario viene marcado como referencia: se toma el primero de la lista, «${ref.etiqueta}». `
      + 'El derrateo de toda la tabla se mide contra él, así que conviene declararlo a propósito.');
  } else if (marcados.length > 1) {
    anota('aviso', `Hay ${marcados.length} escenarios marcados como referencia. Manda el primero («${ref.etiqueta}») `
      + 'y los demás se comparan contra él: dos referencias son dos tablas distintas superpuestas.');
  }

  // ── 2 · Conductor: qué se puede calcular y qué no ─────────────────────────
  const material = typeof conductor?.material === 'string' && conductor.material
    ? conductor.material : null;
  const seccion_mm2 = numero(conductor?.seccion_mm2);
  const diametro_m = numero(conductor?.diametro_m);

  // La resistencia solo necesita sección y material; la ampacidad necesita
  // ADEMÁS el diámetro (es la superficie por la que el conductor evacúa calor).
  // Se separan porque media tabla puede ser válida aunque la otra media no lo
  // sea, y decir «no evaluable» de más también es perder información.
  const hayResistencia = seccion_mm2 !== null && seccion_mm2 > 0;
  const hayAmpacidad = hayResistencia && diametro_m !== null && diametro_m > 0;

  if (!hayResistencia) {
    anota('atencion', 'Falta la sección del conductor: sin ella no hay resistencia y, por tanto, tampoco '
      + 'balance térmico. La tabla queda en «no evaluable» a propósito — un número de relleno aquí sale '
      + 'de esta pantalla convertido en capacidad de transporte, y alguien despacha con él.');
  } else if (!hayAmpacidad) {
    anota('atencion', 'Falta el diámetro del conductor (en METROS): es la superficie por la que evacúa calor, '
      + 'y sin ella no hay ampacidad posible. La resistencia sí se calcula; la columna de amperios no.');
  }

  if (material === null) {
    anota('aviso', 'El conductor no declara material: se calcula con las propiedades genéricas de «Otro» '
      + `(${f(numero(temperaturaLimite('Otro')) ?? 0)} °C de límite). La resistencia y la ampacidad quedan aproximadas; `
      + 'confírmese el material contra la ficha del proveedor.');
  } else if (!CATALOGO_MATERIALES.includes(material)) {
    anota('aviso', `El material «${material}» no está en el catálogo del núcleo (${CATALOGO_MATERIALES.join(', ')}): `
      + 'se calcula con las propiedades de «Otro». Un material mal escrito no rompe nada — cambia los números en '
      + 'silencio, que es peor.');
  }

  const materialCalculo = material ?? 'Otro';
  const condResistencia = { material: materialCalculo, seccion: seccion_mm2 ?? 0 };
  const condAmpacidad = { ...condResistencia, diametro: diametro_m ?? 0 };

  // ── 3 · Temperatura del conductor: el techo con el que se calcula todo ────
  const tcPedida = numero(op.temperaturaConductor_C);
  const tcFicha = numero(conductor?.tempMaxOperacion_C);
  const limiteMaterial = numero(temperaturaLimite(materialCalculo));
  const tc_C = tcPedida ?? tcFicha ?? limiteMaterial;
  const tcOrigen = tcPedida !== null ? 'temperatura pedida por la vista'
    : tcFicha !== null ? 'declarada en la ficha del conductor'
      : `límite continuo del material ${materialCalculo}`;

  if (tcFicha !== null && limiteMaterial !== null && tcFicha > limiteMaterial) {
    anota('atencion', `La ficha declara ${f(tcFicha)} °C de operación, por encima del límite continuo del `
      + `${materialCalculo} (${f(limiteMaterial)} °C). Toda esta tabla describe entonces un conductor que se está `
      + 'RECOCIENDO: pierde resistencia mecánica de forma permanente, y esa pérdida no se ve hasta que el vano '
      + 'cede o la flecha ya no vuelve a su sitio.');
  }

  const tempMecanica = numero(hipotesis?.tempMax_C);
  if (tc_C !== null && tempMecanica !== null && tc_C > tempMecanica) {
    anota('aviso', `La ampacidad se calcula con el conductor a ${f(tc_C)} °C, pero la flecha del cálculo mecánico se `
      + `calculó a ${f(tempMecanica)} °C. Si la línea llega de verdad a esa corriente, cuelga MÁS de lo que dice la `
      + 'tabla de tramos, y el gálibo verificado en el informe deja de ser el gálibo real. O se limita la corriente, '
      + 'o se recalcula la mecánica a la temperatura de la térmica.');
  }

  // ── 4 · Ambiente y tensión ────────────────────────────────────────────────
  const eps = numero(op.emisividad) ?? EMISIVIDAD_POR_DEFECTO;
  const abso = numero(op.absortividad) ?? ABSORTIVIDAD_POR_DEFECTO;
  const he = numero(op.altitud_m) ?? ALTITUD_POR_DEFECTO_M;

  const tensionDeclarada = numero(op.tensionNominal_kV) ?? numero(hipotesis?.tensionNominal_kV);
  const tension_kV = tensionDeclarada !== null && tensionDeclarada > 0 ? tensionDeclarada : null;

  if (tensionDeclarada !== null && tensionDeclarada <= 0) {
    anota('atencion', `La tensión de la línea llega como ${f(tensionDeclarada, 1)} kV, que no es una tensión: `
      + 'el MVA queda sin calcular. Un cero aquí multiplicaría toda la potencia por cero y la tabla diría, muy '
      + 'convencida, que la línea no transporta nada.');
  } else if (tension_kV === null) {
    anota('aviso', 'No llega la tensión de la línea (`Linea.tensionNominal_kV`): la columna de MVA queda vacía. '
      + 'Los amperios siguen siendo válidos — lo que no se puede es traducirlos a potencia sin saber a qué tensión '
      + 'trabaja la línea. No se supone ninguna.');
  }

  // ── 5 · Las filas ─────────────────────────────────────────────────────────
  const condicion = (e: EscenarioClima) => ({
    Ta: e.ta_C, v: e.viento_m_s, qs: e.sol_W_m2, eps, abso, he,
  });

  const filas: FilaEscenario[] = lista.map((e, i) => {
    const esReferencia = i === iRef;
    const base: FilaEscenario = {
      clave: e?.clave,
      etiqueta: e?.etiqueta ?? '(escenario sin etiqueta)',
      ta_C: e?.ta_C, viento_m_s: e?.viento_m_s, sol_W_m2: e?.sol_W_m2,
      ampacidad_A: null, mva: null, derrateo_pct: null,
      esReferencia, nota: e?.nota,
    };

    const climaOk = numero(e?.ta_C) !== null && numero(e?.viento_m_s) !== null
      && numero(e?.sol_W_m2) !== null;
    if (!climaOk) {
      anota('atencion', `El escenario «${base.etiqueta}» trae algún dato de clima que no es un número: `
        + 'queda sin evaluar en vez de calcularse con ceros.');
      return base;
    }
    if (!hayAmpacidad || tc_C === null) return base;

    // La ampacidad de la fila es la que el propio `derrateo` acaba de usar, no
    // una segunda llamada a `ampacidad`. Calcularla dos veces por caminos
    // distintos es la forma más barata de que un día la columna de amperios y
    // la de derrateo dejen de cuadrar entre sí — y de que nadie sepa cuál de
    // las dos está mal.
    const d = derrateo(condAmpacidad, tc_C, condicion(e), condicion(ref));
    const ampacidad_A = numero(d?.real);
    const ampacidadRef = numero(d?.referencia);

    return {
      ...base,
      ampacidad_A,
      // √3 · U(kV) · I(A) / 1000 = MVA trifásicos. La división entre 1000 es el
      // paso de kV·A a MVA, no un factor de seguridad.
      mva: ampacidad_A !== null && tension_kV !== null
        ? (Math.sqrt(3) * tension_kV * ampacidad_A) / 1000
        : null,
      // Si la referencia da 0 A no hay contra qué medir: el cociente sería una
      // división por cero disfrazada de «pierde el 100 %».
      derrateo_pct: ampacidad_A !== null && ampacidadRef !== null && ampacidadRef > 0
        ? (1 - ampacidad_A / ampacidadRef) * 100
        : null,
    };
  });

  // ── 6 · Resistencia en c.c. ───────────────────────────────────────────────
  const resistencia: FilaResistencia[] = TEMPERATURAS_RESISTENCIA.map((T) => ({
    T_C: T,
    // resistenciaDC devuelve Ω/m: los Ω/km son lo que usa cualquier cálculo de
    // pérdidas y lo que publica el catálogo, y mezclarlos es un factor 1 000.
    ohm_km: hayResistencia ? (numero(resistenciaDC(condResistencia, T)) ?? 0) * 1000 : null,
    esLimite: limiteMaterial !== null && T === limiteMaterial,
    nota: NOTA_RESISTENCIA[T],
  }));

  // ── 7 · El mensaje que la tabla tiene que dejar dicho ─────────────────────
  //
  // No se escribe a mano: se calcula. Si mañana cambian los escenarios o el
  // conductor, la frase cambia sola con ellos — o desaparece, si deja de ser
  // verdad. Una advertencia redactada a mano sobrevive a los datos que la
  // justificaban, y esa es la forma más común de mentir sin querer.
  let peor: FilaEscenario | null = null;
  for (const fila of filas) {
    if (fila.derrateo_pct === null) continue;
    if (peor === null || fila.derrateo_pct > (peor.derrateo_pct ?? -Infinity)) peor = fila;
  }
  const filaRef = filas.find((x) => x.esReferencia) ?? null;

  if (peor && peor.derrateo_pct !== null && peor.derrateo_pct > 0 && filaRef?.ampacidad_A != null) {
    const perdidaMva = peor.mva !== null && filaRef.mva !== null
      ? ` — ${f(filaRef.mva - peor.mva, 1)} MVA menos` : '';
    anota('atencion', `Peor escenario de la tabla, «${peor.etiqueta}» (${f(peor.ta_C)} °C, viento ${f(peor.viento_m_s, 2)} m/s): `
      + `la línea baja de ${f(filaRef.ampacidad_A)} A a ${f(peor.ampacidad_A ?? 0)} A, un ${f(peor.derrateo_pct, 1)} % `
      + `menos que en «${filaRef.etiqueta}»${perdidaMva}. El ambiente sube y la capacidad baja justo cuando la demanda `
      + 'sube: es el momento en que una línea que siempre bastó deja de bastar.');
  }

  for (const fila of filas) {
    if (fila.ampacidad_A !== null && fila.ampacidad_A <= 0) {
      anota('atencion', `En «${fila.etiqueta}» la ampacidad sale 0 A: con el ambiente a ${f(fila.ta_C)} °C y el `
        + `conductor limitado a ${f(tc_C ?? 0)} °C no queda margen térmico ni para la corriente de vacío. No es un `
        + 'fallo del cálculo: es que ese escenario está fuera del rango en que la línea puede operar a esa temperatura.');
    }
  }

  if (peor && numero(peor.viento_m_s) !== null && peor.viento_m_s < 0.3) {
    anota('info', `El peor escenario supone viento casi en calma (${f(peor.viento_m_s, 2)} m/s). Ahí la refrigeración `
      + 'depende de la convección natural y la capacidad se vuelve muy sensible: unas décimas de m/s mueven la cifra '
      + 'más que varios grados de ambiente. Por eso el escenario en calma se muestra aparte y no se promedia con los otros.');
  }

  // ── 8 · Deudas declaradas del método (no son fallos: son límites sabidos) ─
  if (hayAmpacidad) {
    anota('aviso', 'El núcleo resuelve el balance con la resistencia en corriente CONTINUA. A 60 Hz la resistencia real '
      + 'es algo mayor (efecto pelicular, y en ACSR el aporte del núcleo de acero), así que esta ampacidad sale por el '
      + 'lado OPTIMISTA. Cuánto, depende del calibre y aquí no se pone sin fuente: es deuda declarada, no un olvido.');
  }
  anota('info', 'Los escenarios de clima son ADOPTADOS por este proyecto, no cifras de norma. Están declarados en '
    + '`ESCENARIOS_ADOPTADOS` para poder discutirlos: se cambian ahí y la tabla entera se recalcula. El día que exista '
    + 'un clima de proyecto con fuente y fecha, entra por el mismo sitio.');

  const ORDEN: Record<Aviso['severidad'], number> = { atencion: 0, aviso: 1, info: 2 };
  avisos.sort((a, b) => ORDEN[a.severidad] - ORDEN[b.severidad]);

  return {
    escenarios: filas,
    resistencia,
    referencia: {
      etiqueta: ref?.etiqueta ?? '(sin escenario)',
      ta_C: ref?.ta_C, viento_m_s: ref?.viento_m_s, sol_W_m2: ref?.sol_W_m2,
      tc_C, tcOrigen, tension_kV, altitud_m: he, emisividad: eps, absortividad: abso,
    },
    avisos,
  };
}

