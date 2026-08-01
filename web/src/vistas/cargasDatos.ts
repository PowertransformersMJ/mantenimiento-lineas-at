// ============================================================================
// vistas/cargasDatos.ts — la carga que aguanta cada ESTRUCTURA, para pantalla
// ----------------------------------------------------------------------------
// El sistema sabía decir cuánto TIRA el conductor (pestaña Mecánico) y cuánto lo
// empuja el viento (pestaña Viento). Las dos hablan del CABLE. La pregunta que
// hace el que firma es otra: **¿y el apoyo aguanta?** Esa se contesta con la
// resultante que el tiro deja sobre la estructura, que en un quiebre puede ser
// MAYOR que el propio tiro — y hasta hoy no salía por ninguna pantalla.
//
// PURO: entran datos, salen números. Sin React, sin DOM, sin red. Y sin una sola
// fórmula propia: todo se le pide a `@lineas/nucleo/cargas`, que es el único
// dueño de la física y ya está probado contra identidades geométricas. Aquí solo
// se traduce el contrato hacia el núcleo, se ordena lo que sale y se redacta lo
// que falta.
//
// LO QUE ESTE MÓDULO NO DICE, y hay que decirlo alto:
// · **No dimensiona ningún apoyo.** Compara una carga contra una capacidad
//   DECLARADA. Si nadie declaró la capacidad, la fila queda NO EVALUABLE — no se
//   estima, porque un apoyo que "cumple" contra una rotura supuesta es un
//   informe firmado sobre una suposición.
// · **Solo carga TRANSVERSAL.** La vertical (vano peso) y la longitudinal
//   (terminales, rotura de conductor, desequilibrio entre tramos) son otros ejes
//   y otros casos de carga. Sumarlas a estos kgf sería sumar peras con manzanas.
// · **Los apoyos extremos no tienen fila calculada:** su caso de carga dominante
//   es el longitudinal, que este módulo no evalúa. Aparecen, y dicen por qué.
//
// Convenio de unidades (el de mecanica.js, no se cambia):
//   tiro y carga kgf · vano m · ángulo grados · presión Pa
//
// Ver docs/40-DOMINIO-LINEAS-AT.md §3.3 (carga de viento) y §3.4 (admisibles).
// ============================================================================
// ⚠️ Solo se importa de `@lineas/nucleo/*` (JavaScript puro) y tipos del
// contrato, que se borran al compilar. NADA de `./planta` ni de `./tramos` en
// tiempo de ejecución: esos importan valores de `@lineas/contratos`, cuyo
// paquete apunta a TypeScript sin compilar — el bundler lo resuelve y
// `node --test` no (mismo motivo documentado en `criteriosApoyo.ts`). Una vista
// que no se puede probar sin navegador acaba sin pruebas.
import {
  cargasDeLaLinea, CRITERIO_UTILIZACION, UMBRAL_UTILIZACION_PCT,
} from '@lineas/nucleo/cargas';
import type { Apoyo, Conductor, Hipotesis } from '@lineas/contratos';
import type { FilaTramo } from './tramos';

/**
 * Lo que este módulo necesita de un tramo, y nada más.
 *
 * Se declara como recorte de `FilaTramo` —la fila que ya produce
 * `calcularTramos`— y no como interfaz suelta: así, el día que alguien renombre
 * `hViento` allí, ESTE archivo deja de compilar. Con una copia escrita a mano el
 * renombrado pasaría callado y la carga de viento sobre los apoyos se quedaría
 * en cero sin que nadie se entere, que es exactamente el error que no se ve.
 */
export type TramoParaCargas = Pick<FilaTramo, 'n' | 'nVanos' | 'hEds' | 'hTMax' | 'hViento' | 'hTMin' | 'pico'>;

/** Una fila de la tabla: un apoyo. Todo puede ser null: null = no evaluable. */
export interface FilaCargaApoyo {
  /** Posición ENTRE ESTRUCTURAS, 1..N. Los empalmes no cuentan (docs/40 §10). */
  n: number;
  apoyo: string;
  funcionEstructural: string | null;
  /** Primero o último de la línea: sin deflexión definida, carga longitudinal. */
  esExtremo: boolean;
  tramos_n: number[];
  deflexion_grados: number | null;
  /** 2·sen(α/2): cuántas veces la tensión del conductor recibe la estructura. */
  factorAngulo: number | null;
  /** `true` si el factor pasa de 1, o sea si el apoyo recibe MÁS que la tensión. */
  amplifica: boolean | null;
  nConductores: number | null;
  vanoViento_m: number | null;
  tiro_kgf: number | null;
  estadoTiro: string | null;
  /** Resultante del quiebre. Es carga permanente: existe con viento y sin él. */
  ftAngulo_kgf: number | null;
  ftViento_kgf: number | null;
  /** Las dos compuestas con la hipótesis adoptada (suma alineada). */
  ftTotal_kgf: number | null;
  utilizacion_pct: number | null;
  margen_kgf: number | null;
  estadoUtilizacion: 'cumple' | 'revisar' | 'no_evaluable';
  /** Supuestos y avisos de ESTA fila, ya redactados por el núcleo. */
  notas: string[];
  /** Motivo, cuando no se pudo calcular la carga. Prosa lista para imprimir. */
  noEvaluable: string | null;
}

/** Un límite o un hallazgo, dicho con su consecuencia. Calca `AvisoViento`. */
export interface AvisoCarga {
  severidad: 'atencion' | 'aviso' | 'info';
  concepto: string;
  motivo: string;
}

export interface CargasEnPantalla {
  filas: FilaCargaApoyo[];
  /** El apoyo con mayor carga transversal total. null si ninguno se pudo calcular. */
  peorCarga: { apoyo: string; ftTotal_kgf: number } | null;
  /** El apoyo con mayor amplificación del quiebre — el dato que cambia la conversación. */
  peorFactor: { apoyo: string; factorAngulo: number; deflexion_grados: number } | null;
  /** Cuántas estructuras reciben MÁS carga transversal que la propia tensión. */
  cuantosAmplifican: number;
  /** Cuántas filas tienen carga calculada, de cuántas estructuras hay. */
  conCarga: number;
  total: number;
  /** Cuántas tienen utilización evaluada, y cuántas de esas piden revisión. */
  conUtilizacion: number;
  aRevisar: number;
  /** El umbral adoptado y su texto, tal cual los declara el núcleo. Un solo dueño. */
  umbralUtilizacion_pct: number;
  criterioUtilizacion: string;
  avisos: AvisoCarga[];
}

const RANGO: Record<AvisoCarga['severidad'], number> = { atencion: 0, aviso: 1, info: 2 };

/** Formato estable para la prosa de los avisos: `toFixed`, nunca `toLocaleString`. */
const f = (x: number | null, d = 1): string => (x === null ? '—' : x.toFixed(d));

/** Lista legible sin pasarse de larga: los tres primeros y «y N más». */
const listar = (xs: string[], tope = 3): string =>
  xs.length <= tope ? xs.join(', ') : `${xs.slice(0, tope).join(', ')} y ${xs.length - tope} más`;

/**
 * Carga transversal de toda la línea, lista para pintar.
 *
 * @param todos     apoyos del contrato, EN ORDEN. Los empalmes se filtran aquí:
 *                  un empalme puede colgar a mitad de vano y darle fila
 *                  inventaría un apoyo que no existe (docs/40 §10).
 * @param tramos    los que ya produjo `calcularTramos` — NO se recalculan. Si
 *                  esta pantalla calculara su propio tiro, bastaría un cambio en
 *                  Mecánico para que la app se contradijera a sí misma delante
 *                  del cliente.
 * @param circuitos cuántos circuitos carga la línea (viene de `Linea`, no de la
 *                  hipótesis). De ahí sale el número de conductores; los cables
 *                  de guarda NO quedan contados y el núcleo lo declara.
 */
export function cargasParaPantalla(
  todos: Apoyo[],
  tramos: TramoParaCargas[],
  c: Conductor,
  h: Hipotesis,
  circuitos?: number | null,
): CargasEnPantalla {
  // Los apoyos del contrato van TAL CUAL, sin traducir: el núcleo ya filtra los
  // empalmes por `tipoPunto` con la misma regla que `planta.soloEstructuras`,
  // resuelve el nombre visible con la misma preferencia (canónico y si no el del
  // GPS) y deriva los vanos de las coordenadas con el mismo Vincenty. Traducir
  // aquí no añadiría nada y crearía un segundo dueño de tres reglas que ya
  // tienen uno — que es como una pantalla acaba partiendo un vano que otra no
  // parte, sin que nadie lo note.
  //
  // De la hipótesis y del conductor se pasa SOLO lo que este cálculo consume, no
  // la traducción entera de `tramos.ts`: el empuje del viento necesita diámetro,
  // velocidad, cx y densidad, y nada más. Al ir tipado contra `Conductor` e
  // `Hipotesis`, renombrar un campo del contrato rompe aquí al compilar.
  const crudas = cargasDeLaLinea(
    todos,
    tramos,
    { diametro: c.diametro_m },
    {
      vViento: h.vientoMax_kmh,
      cx: h.cx,
      rho: h.densidadAire_kg_m3,
      circuitos: circuitos ?? undefined,
    },
  ) as CrudaDelNucleo[];

  const filas: FilaCargaApoyo[] = crudas.map((r) => ({
    n: r.n,
    apoyo: r.apoyo,
    funcionEstructural: r.funcionEstructural,
    esExtremo: r.esExtremo,
    tramos_n: r.tramos_n,
    deflexion_grados: r.deflexion_grados,
    factorAngulo: r.factorAngulo,
    amplifica: r.componentes.amplificaTension,
    nConductores: r.nConductores,
    vanoViento_m: r.vanoViento_m,
    tiro_kgf: r.tiro_kgf,
    estadoTiro: r.estadoTiro,
    ftAngulo_kgf: r.ftAngulo_kgf,
    ftViento_kgf: r.ftViento_kgf,
    ftTotal_kgf: r.ftTotal_kgf,
    utilizacion_pct: r.utilizacion?.utilizacion_pct ?? null,
    margen_kgf: r.utilizacion?.margen_kgf ?? null,
    estadoUtilizacion: r.utilizacion?.estado ?? 'no_evaluable',
    notas: r.notas,
    noEvaluable: r.noEvaluable,
  }));

  return {
    filas,
    ...resumir(filas),
    umbralUtilizacion_pct: UMBRAL_UTILIZACION_PCT,
    criterioUtilizacion: CRITERIO_UTILIZACION,
    avisos: redactarAvisos(filas, crudas).sort((a, b) => RANGO[a.severidad] - RANGO[b.severidad]),
  };
}

// ── Resumen: los cuatro números de cabecera ─────────────────────────────────

function resumir(filas: FilaCargaApoyo[]) {
  const conCargaFilas = filas.filter((r) => r.ftTotal_kgf !== null);
  const peorCarga = conCargaFilas.length
    ? conCargaFilas.reduce((m, r) => (r.ftTotal_kgf! > m.ftTotal_kgf! ? r : m))
    : null;

  // El factor se busca sobre TODAS las filas con ángulo, no solo sobre las que
  // tienen carga total: un apoyo puede tener el quiebre perfectamente definido y
  // quedarse sin carga por falta de la hipótesis de viento. Su amplificación
  // sigue siendo cierta, y es el dato que hay que enseñar.
  const conFactor = filas.filter((r) => r.factorAngulo !== null && r.deflexion_grados !== null);
  const peorFactor = conFactor.length
    ? conFactor.reduce((m, r) => (r.factorAngulo! > m.factorAngulo! ? r : m))
    : null;

  return {
    peorCarga: peorCarga ? { apoyo: peorCarga.apoyo, ftTotal_kgf: peorCarga.ftTotal_kgf! } : null,
    peorFactor: peorFactor
      ? {
          apoyo: peorFactor.apoyo,
          factorAngulo: peorFactor.factorAngulo!,
          deflexion_grados: peorFactor.deflexion_grados!,
        }
      : null,
    cuantosAmplifican: filas.filter((r) => r.amplifica === true).length,
    conCarga: conCargaFilas.length,
    total: filas.length,
    conUtilizacion: filas.filter((r) => r.utilizacion_pct !== null).length,
    aRevisar: filas.filter((r) => r.estadoUtilizacion === 'revisar').length,
  };
}

// ── Avisos: primero los hallazgos de la línea, después los del modelo ───────

function redactarAvisos(filas: FilaCargaApoyo[], crudas: CrudaDelNucleo[]): AvisoCarga[] {
  const avisos: AvisoCarga[] = [];

  if (!filas.length) {
    avisos.push({
      severidad: 'info',
      concepto: 'Sin estructuras que evaluar',
      motivo: 'La carga sobre los apoyos necesita al menos una estructura en el levantamiento. '
        + 'Los empalmes no cuentan: no sostienen el conductor.',
    });
    return avisos;
  }

  // ── HALLAZGOS: hablan de esta línea, no del modelo ────────────────────────

  const amplifican = filas.filter((r) => r.amplifica === true);
  if (amplifican.length) {
    const peor = amplifican.reduce((m, r) => (r.factorAngulo! > m.factorAngulo! ? r : m));
    avisos.push({
      severidad: 'atencion',
      concepto: `${amplifican.length} estructura(s) reciben MÁS carga que la propia tensión del conductor`,
      motivo: `${listar(amplifican.map((r) => r.apoyo))}. El peor es ${peor.apoyo}, con `
        + `${f(peor.deflexion_grados)}° de quiebre: multiplica la tensión por ${f(peor.factorAngulo, 3)}, `
        + `o sea un ${f((peor.factorAngulo! - 1) * 100, 0)} % más de carga transversal. Y la recibe `
        + 'SIEMPRE, haya viento o no: es carga permanente. Un apoyo así, dimensionado «por el tiro», '
        + 'está dimensionado por poco más de la mitad de lo que aguanta de verdad.',
    });
  }

  const revisar = filas.filter((r) => r.estadoUtilizacion === 'revisar');
  if (revisar.length) {
    avisos.push({
      severidad: 'atencion',
      concepto: `${revisar.length} apoyo(s) pasan del ${UMBRAL_UTILIZACION_PCT} % de su carga de rotura declarada`,
      motivo: `${listar(revisar.map((r) => `${r.apoyo} (${f(r.utilizacion_pct)} %)`))}. `
        + CRITERIO_UTILIZACION,
    });
  }

  // ── HUECOS DE DATO: son accionables, se dice qué capturar ─────────────────

  const sinCapacidad = filas.filter((r) => r.ftTotal_kgf !== null && r.utilizacion_pct === null);
  if (sinCapacidad.length) {
    avisos.push({
      severidad: 'aviso',
      concepto: `${sinCapacidad.length} apoyo(s) con la carga calculada pero SIN capacidad declarada`,
      motivo: 'Se sabe cuánto se les está pidiendo; no se sabe cuánto aguantan, así que no se '
        + 'dictamina. Faltan datos de inventario: carga de rotura del apoyo, altura libre sobre '
        + 'el terreno y altura del punto de sujeción. Los tres tienen ya su campo en el contrato '
        + '(v0.2.0) — es captura, no desarrollo. Con ellos esta tabla pasa de «cuánto empuja» a '
        + '«cuánto le queda». El desglose de qué falta en cada apoyo va escrito en su propia fila.',
    });
  }

  const sinCarga = filas.filter((r) => r.ftTotal_kgf === null && !r.esExtremo);
  if (sinCarga.length) {
    avisos.push({
      severidad: 'aviso',
      concepto: `${sinCarga.length} estructura(s) intermedias sin carga calculable`,
      motivo: `${listar(sinCarga.map((r) => r.apoyo))}. El motivo está escrito en cada fila: `
        + 'sin el ingrediente que falta, el resultado sería un número inventado con unidades '
        + 'correctas, que es la peor clase de error porque no se ve.',
    });
  }

  // ── LÍMITES DEL MODELO: van siempre, haya o no datos ──────────────────────

  const extremos = filas.filter((r) => r.esExtremo);
  if (extremos.length) {
    avisos.push({
      severidad: 'info',
      concepto: `Los ${extremos.length} apoyos extremos NO se evalúan aquí`,
      motivo: `${extremos.map((r) => r.apoyo).join(' y ')}: un extremo no tiene deflexión definida y `
        + 'su caso de carga dominante es el LONGITUDINAL —el conductor tirando en la dirección de la '
        + 'línea, sin nadie que lo compense al otro lado—, que es otro eje y no se evalúa en esta '
        + 'pantalla. Que no tengan fila calculada no significa que estén holgados: significa que su '
        + 'verificación es otra.',
    });
  }

  avisos.push({
    severidad: 'info',
    concepto: 'Solo carga TRANSVERSAL: ni la vertical ni la longitudinal entran en estos kgf',
    motivo: 'La vertical es el vano peso (pendiente de la cota de sujeción, deuda declarada en '
      + 'docs/40 §8) y la longitudinal es el desequilibrio de tiros entre tramos contiguos y la '
      + 'rotura de conductor. Son otros ejes: sumarlas a estas cifras sería sumar peras con '
      + 'manzanas. Un apoyo con la transversal holgada puede estar comprometido en otro eje.',
  });

  const composicion = crudas.find((r) => r.componentes?.hipotesisComposicion)?.componentes.hipotesisComposicion;
  if (composicion) {
    avisos.push({
      severidad: 'info',
      concepto: 'La suma de quiebre y viento es una hipótesis ADOPTADA, no de norma',
      motivo: composicion,
    });
  }

  // Las notas que el núcleo escribió por fila y que valen para toda la línea —
  // el conteo de conductores es la principal: si salió de `circuitos`, los
  // cables de guarda no están contados y eso deja la carga corta justo en los
  // apoyos más cargados. Se sube a aviso de línea porque afecta a TODAS las filas.
  const notaGuarda = filas.find((r) => r.notas.some((n) => n.includes('guarda')))
    ?.notas.find((n) => n.includes('guarda'));
  if (notaGuarda) {
    avisos.push({
      severidad: 'aviso',
      concepto: 'Los cables de guarda no están contados en la carga',
      motivo: notaGuarda,
    });
  }

  return avisos;
}

// ── La forma de lo que devuelve el núcleo ───────────────────────────────────
//
// `nucleo/` es JavaScript con JSDoc, no TypeScript (ADR-005): al importarlo, el
// tipo llega como `any`. Se declara aquí lo que esta vista consume para que el
// resto del archivo esté tipado de verdad y un cambio de forma en el núcleo se
// vea al compilar, en vez de aparecer como una columna vacía en producción.
interface CrudaDelNucleo {
  n: number;
  apoyo: string;
  funcionEstructural: string | null;
  esExtremo: boolean;
  tramos_n: number[];
  deflexion_grados: number | null;
  factorAngulo: number | null;
  nConductores: number | null;
  vanoViento_m: number | null;
  tiro_kgf: number | null;
  estadoTiro: string | null;
  ftAngulo_kgf: number | null;
  ftViento_kgf: number | null;
  ftTotal_kgf: number | null;
  componentes: { amplificaTension: boolean | null; hipotesisComposicion: string };
  utilizacion: { utilizacion_pct: number; margen_kgf: number; estado: 'cumple' | 'revisar' } | null;
  notas: string[];
  noEvaluable: string | null;
}
