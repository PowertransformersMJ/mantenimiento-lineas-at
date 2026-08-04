// ============================================================================
// vistas/longitudinalDatos.ts — la carga sobre el EJE de la línea, para pantalla
// ----------------------------------------------------------------------------
// Compañera de `cargasDatos.ts`. Aquélla contesta «cuánto empuja de LADO al
// apoyo»; ésta, «cuánto tira a lo LARGO». Son dos ejes y no se suman.
//
// PURO: sin React, sin DOM, sin red, y sin una sola fórmula propia — todo se le
// pide a `@lineas/nucleo/longitudinal`. Solo importa del núcleo y tipos del
// contrato (que se borran al compilar), para poder probarse con `node --test`
// sin navegador.
//
// ⚠️ Recibe los tramos YA CALCULADOS con sus estados ricos (los que produce
// `estadosDelTramo`), no la forma aplanada de la vista de tramos. El núcleo la
// rechaza a propósito: para RESTAR el tiro de dos tramos hay que poder comprobar
// que vienen de la misma temperatura y la misma carga unitaria, y la forma
// aplanada no las trae. Quien llame arma los tramos ricos (lo hace el
// componente, que sí puede importar de ./planta y ./tramos).
// ============================================================================
import {
  longitudinalDeLaLinea, DESAJUSTE_TENDIDO_PCT_RTS, PISO_VALIDEZ_PCT_EDS,
  HIPOTESIS_DESEQUILIBRIO, SIN_CRITERIO_ACCIDENTAL, CRITERIO_CAPACIDAD_LONGITUDINAL,
  CRITERIO_UTILIZACION_LONGITUDINAL,
} from '@lineas/nucleo/longitudinal';
import type { Apoyo, Conductor } from '@lineas/contratos';
import type { AvisoCarga } from './cargasDatos';

/** Una fila de la tabla: un apoyo. Todo puede ser null: null = no evaluable. */
export interface FilaLongitudinal {
  n: number;
  apoyo: string;
  funcionEstructural: string | null;
  caso: 'terminal' | 'desequilibrio' | 'suspension' | 'no_evaluable';
  apoyoAtras: string | null;
  apoyoAdelante: string | null;
  deflexion_grados: number | null;
  factorLongitudinal: number | null;
  /** Envolvente POR SENTIDO. `null` en un sentido = ningún estado tira hacia ahí. */
  flAdelanteMax_kgf: number | null;
  estadoAdelante: string | null;
  flAtrasMax_kgf: number | null;
  estadoAtras: string | null;
  /** Lo que pesaría una diferencia de tendido de obra del 1 % de la rotura. */
  sensibilidadTendido_kgf: number | null;
  /** false = el número sale, pero el SENTIDO no aguanta esa incertidumbre. */
  sentidoResoluble: boolean | null;
  /** true = los DOS sentidos superan el ruido de obra: la inversión es afirmable. */
  inversionResoluble: boolean | null;
  /** Rotura de conductor: fuerza y sus dos componentes, por lado roto. */
  roturaAtras_kgf: number | null;
  roturaAdelante_kgf: number | null;
  /**
   * El veredicto de ESTE eje, o su ausencia. Cuatro campos y no uno, porque un
   * porcentaje solo no es firmable:
   *
   * · `utilizacion_pct` — cuánta capacidad longitudinal consume la carga
   *   PERMANENTE del apoyo, comparando MOMENTOS (fuerza × altura), no fuerzas.
   * · `estadoUtilizacion` — `null` es «no evaluable», y es lo que sale HOY en
   *   toda la línea: ningún apoyo del inventario declara su capacidad para este
   *   eje. Es un hueco del INVENTARIO, no un fallo del cálculo, y su motivo
   *   viaja en `notas` con las palabras del propio núcleo.
   * · `umbralAplicado_pct` — contra qué porcentaje se comparó. No es fijo:
   *   depende del TIPO de capacidad declarada (una carga de rotura lleva su
   *   coeficiente de seguridad; una capacidad ya admisible o de diseño ya lo
   *   trae dentro y volver a partirla sacaría «revisar» sobre apoyos sanos).
   * · `criterioUtilizacion` — el texto que declara contra QUÉ se comparó: tipo,
   *   valor, altura de referencia, fuente y umbral. Lo escribe el núcleo; aquí
   *   NO se reescribe. Un número sin origen no se puede discutir sin abrir el
   *   código, y quien firma tiene que poder discutirlo.
   */
  utilizacion_pct: number | null;
  estadoUtilizacion: 'cumple' | 'revisar' | null;
  umbralAplicado_pct: number | null;
  criterioUtilizacion: string | null;
  /**
   * ⚠️ Si el APOYO trae capacidad declarada. Es un hecho DISTINTO de «lleva
   * veredicto», y confundirlos hace que la pantalla y el informe afirmen que el
   * inventario no tiene el dato cuando sí lo tiene — mandando a corregir el
   * sitio equivocado (§ADR-017).
   */
  capacidadDeclarada: boolean;
  /** Cuánta carga admite todavía el umbral aplicado. Simétrico con el eje transversal. */
  margen_kgf: number | null;
  /**
   * El NUMERADOR del porcentaje: la carga TOTAL sobre el apoyo. Las columnas
   * «adelante» y «atrás» son por CONDUCTOR, así que sin este número la
   * utilización no se puede reproducir con una calculadora.
   */
  flTotalPeor_kgf: number | null;
  notas: string[];
  noEvaluable: string | null;
}

export interface LongitudinalEnPantalla {
  filas: FilaLongitudinal[];
  /** El apoyo con mayor carga longitudinal permanente, en valor absoluto. */
  peor: { apoyo: string; fl_kgf: number; sentido: 'adelante' | 'atras' } | null;
  /** Cuántos apoyos tiran hacia los DOS lados según el estado climático. */
  cuantosInvierten: number;
  /** Cuántos tienen número pero con el sentido no concluyente. */
  cuantosSentidoDudoso: number;
  conCarga: number;
  /**
   * Cuántos apoyos tienen VEREDICTO en este eje. Hoy vale cero en toda línea
   * real, y por eso existe: la pantalla y el informe tienen que poder decir «de
   * 24, ninguno» sin que nadie lo escriba a mano — y tienen que dejar de
   * decirlo solos el día que el inventario traiga la capacidad.
   */
  conVeredicto: number;
  /** Cuántos APOYOS declaran capacidad longitudinal. NO es lo mismo que llevar veredicto. */
  conCapacidadDeclarada: number;
  /** De los que tienen veredicto, cuántos piden revisión. */
  aRevisar: number;
  total: number;
  avisos: AvisoCarga[];
}

const RANGO: Record<AvisoCarga['severidad'], number> = { atencion: 0, aviso: 1, info: 2 };
const f = (x: number | null, d = 0): string => (x === null ? '—' : x.toFixed(d));
const listar = (xs: string[], tope = 3): string =>
  xs.length <= tope ? xs.join(', ') : `${xs.slice(0, tope).join(', ')} y ${xs.length - tope} más`;

/**
 * Carga longitudinal de toda la línea, lista para pintar.
 *
 * @param apoyos       los del contrato, EN ORDEN (los empalmes los filtra el núcleo).
 * @param tramosRicos  `tramosDeTension(...)` con su `estados` de `estadosDelTramo`.
 * @param conductor    solo para la carga de rotura, con la que se mide la
 *                     sensibilidad al tendido. Sin ella, esa columna queda vacía.
 */
export function longitudinalParaPantalla(
  apoyos: Apoyo[],
  tramosRicos: unknown[],
  c?: Conductor,
): LongitudinalEnPantalla {
  const crudas = longitudinalDeLaLinea(apoyos, tramosRicos, {
    rts_kgf: c?.rts_kgf,
    // `nFasesAmarradas` NO se hereda del conteo de la carga transversal: aquél
    // cuenta 3·circuitos con el cable de guarda declaradamente fuera, y en el eje
    // longitudinal el guarda —que va más alto— manda el momento. Sin dato
    // declarado sale el número POR CONDUCTOR, que es el primario.
  }) as CrudaLongitudinal[];

  const filas: FilaLongitudinal[] = crudas.map((r) => ({
    n: r.n,
    apoyo: r.apoyo,
    funcionEstructural: r.funcionEstructural,
    caso: r.caso,
    apoyoAtras: r.apoyoAtras,
    apoyoAdelante: r.apoyoAdelante,
    deflexion_grados: r.deflexion_grados,
    factorLongitudinal: r.factorLongitudinal,
    flAdelanteMax_kgf: r.permanente?.flAdelanteMax_kgf ?? null,
    estadoAdelante: r.permanente?.estadoAdelante ?? null,
    flAtrasMax_kgf: r.permanente?.flAtrasMax_kgf ?? null,
    estadoAtras: r.permanente?.estadoAtras ?? null,
    sensibilidadTendido_kgf: r.sensibilidadTendido_kgf,
    sentidoResoluble: r.sentidoResoluble,
    inversionResoluble: r.inversionResoluble,
    roturaAtras_kgf: r.accidental?.atras?.fuerza_kgf ?? null,
    roturaAdelante_kgf: r.accidental?.adelante?.fuerza_kgf ?? null,
    // El veredicto NO se calcula aquí ni se completa con valores por defecto:
    // se echa lo que el núcleo publicó, y cuando no publicó nada la celda queda
    // vacía. Rellenar un umbral «por si acaso» sería inventar contra qué se
    // comparó una cifra que nadie comparó.
    capacidadDeclarada: r.capacidadDeclarada === true,
    margen_kgf: r.utilizacion?.margen_kgf ?? null,
    flTotalPeor_kgf: r.flTotalPeor_kgf ?? null,
    utilizacion_pct: r.utilizacion?.utilizacion_pct ?? null,
    estadoUtilizacion: (r.utilizacion?.estado as 'cumple' | 'revisar' | undefined) ?? null,
    umbralAplicado_pct: r.utilizacion?.umbralAplicado_pct ?? null,
    criterioUtilizacion: r.utilizacion?.criterio ?? null,
    notas: r.notas ?? [],
    noEvaluable: r.noEvaluable,
  }));

  return { filas, ...resumir(filas), avisos: redactarAvisos(filas).sort(
    (a, b) => RANGO[a.severidad] - RANGO[b.severidad]) };
}

/** El mayor en valor absoluto de los dos sentidos de una fila. */
const mayorDeLaFila = (r: FilaLongitudinal): number | null => {
  const xs = [r.flAdelanteMax_kgf, r.flAtrasMax_kgf].filter((x): x is number => x !== null);
  return xs.length ? xs.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m)) : null;
};

function resumir(filas: FilaLongitudinal[]) {
  // Las suspensiones NO cuentan como «con carga»: su cero es del modelo, y
  // contarlas inflaría el denominador de una tabla que habla de anclajes.
  const conCargaFilas = filas.filter((r) => r.caso !== 'suspension' && mayorDeLaFila(r) !== null);
  const peorFila = conCargaFilas.length
    ? conCargaFilas.reduce((m, r) =>
      (Math.abs(mayorDeLaFila(r)!) > Math.abs(mayorDeLaFila(m)!) ? r : m))
    : null;
  const v = peorFila ? mayorDeLaFila(peorFila)! : null;

  return {
    peor: peorFila && v !== null
      ? { apoyo: peorFila.apoyo, fl_kgf: v, sentido: (v > 0 ? 'adelante' : 'atras') as 'adelante' | 'atras' }
      : null,
    // Solo las AFIRMABLES: un segundo sentido por debajo del ruido de obra no es
    // una inversión, es una diferencia de tendido que el modelo no puede ver.
    cuantosInvierten: filas.filter((r) => r.inversionResoluble === true).length,
    cuantosSentidoDudoso: filas.filter((r) => r.sentidoResoluble === false).length,
    conCarga: conCargaFilas.length,
    conVeredicto: filas.filter((r) => r.utilizacion_pct !== null).length,
    conCapacidadDeclarada: filas.filter((r) => r.capacidadDeclarada).length,
    aRevisar: filas.filter((r) => r.estadoUtilizacion === 'revisar').length,
    total: filas.length,
  };
}

function redactarAvisos(filas: FilaLongitudinal[]): AvisoCarga[] {
  const avisos: AvisoCarga[] = [];

  if (!filas.length) {
    avisos.push({
      severidad: 'info',
      concepto: 'Sin estructuras que evaluar en el eje longitudinal',
      motivo: 'Hace falta al menos una estructura con su función declarada.',
    });
    return avisos;
  }

  // ── HALLAZGOS de esta línea ──────────────────────────────────────────────

  const terminales = filas.filter((r) => r.caso === 'terminal');
  if (terminales.length) {
    const mayor = terminales.reduce((m, r) =>
      (Math.abs(mayorDeLaFila(r) ?? 0) > Math.abs(mayorDeLaFila(m) ?? 0) ? r : m));
    const v = mayorDeLaFila(mayor);
    avisos.push({
      severidad: 'atencion',
      concepto: `Los ${terminales.length} apoyos terminales soportan el tiro ENTERO del conductor`,
      motivo: `${listar(terminales.map((r) => r.apoyo))}. En un terminal no hay nada al otro lado `
        + `que compense: la carga longitudinal es el tiro completo${v !== null ? `, hasta ${f(Math.abs(v))} kgf por conductor` : ''}. `
        + 'Es el caso más severo de este eje y no depende de ninguna diferencia entre tramos — por '
        + 'eso un terminal lleva retención y un apoyo de línea no.',
    });
  }

  const invierten = filas.filter((r) => r.inversionResoluble === true);
  if (invierten.length) {
    avisos.push({
      severidad: 'atencion',
      concepto: `${invierten.length} apoyo(s) tiran hacia LOS DOS LADOS según la temperatura`,
      motivo: `${listar(invierten.map((r) => r.apoyo))}. El sentido del desequilibrio se invierte `
        + 'entre estados: a máxima temperatura el conductor tira hacia un lado y a mínima hacia el '
        + 'otro. Es exactamente lo que decide si un apoyo necesita retención a un lado o a los dos, '
        + 'y una tabla que publicara solo la magnitud lo habría escondido.',
    });
  }

  // El veredicto, cuando lo hay, manda sobre todo lo demás de esta pantalla: es
  // la única línea que dice que a un apoyo se le está pidiendo más de lo que el
  // proyecto adoptó como tope. Va con los hallazgos, no con los límites.
  const aRevisar = filas.filter((r) => r.estadoUtilizacion === 'revisar');
  if (aRevisar.length) {
    avisos.push({
      severidad: 'atencion',
      concepto: `${aRevisar.length} apoyo(s) superan el tope adoptado en el eje longitudinal`,
      motivo: `${listar(aRevisar.map((r) =>
        `${r.apoyo} (${f(r.utilizacion_pct, 1)} % de un tope del ${f(r.umbralAplicado_pct)} %)`))}. `
        + CRITERIO_UTILIZACION_LONGITUDINAL,
    });
  }

  // ── LÍMITES Y HUECOS ─────────────────────────────────────────────────────

  const dudoso = filas.filter((r) => r.sentidoResoluble === false);
  if (dudoso.length) {
    avisos.push({
      severidad: 'aviso',
      concepto: `En ${dudoso.length} apoyo(s) el número sale, pero el SENTIDO no es concluyente`,
      motivo: `${listar(dudoso.map((r) => r.apoyo))}. Su desequilibrio calculado queda por debajo `
        + `de lo que pesaría una diferencia de tendido de obra del ${DESAJUSTE_TENDIDO_PCT_RTS} % `
        + 'de la carga de rotura. En el terreno podría apuntar al lado contrario. Se publica el '
        + 'valor y se declara la duda, en vez de borrar el número o de afirmar el sentido.',
    });
  }

  const noEval = filas.filter((r) => r.noEvaluable);
  if (noEval.length) {
    avisos.push({
      severidad: 'aviso',
      concepto: `${noEval.length} fila(s) sin número, con su motivo escrito`,
      motivo: `${listar(noEval.map((r) => r.apoyo))}. El motivo va en cada fila. En particular, `
        + 'ningún total por apoyo se publica mientras no se declare cuántas fases amarran: el '
        + 'conteo NO se hereda de la carga transversal, que cuenta 3 por circuito con el cable de '
        + 'guarda declaradamente fuera — y en este eje el guarda va más alto y manda el momento.',
    });
  }

  const piso = filas.filter((r) => r.notas.some((n) => n.includes('de su propio EDS')));
  if (piso.length) {
    avisos.push({
      severidad: 'aviso',
      concepto: `${piso.length} apoyo(s) con un lado que se derrumba EN EL MODELO`,
      motivo: `${listar(piso.map((r) => r.apoyo))}. Uno de sus tramos baja del `
        + `${PISO_VALIDEZ_PCT_EDS} % de su propia tensión de cada día en alguno de los estados. `
        + 'Ahí el desequilibrio lo domina un tramo prácticamente flojo en el modelo, no en el '
        + 'terreno: el número es aritméticamente correcto y físicamente poco significativo. Es el '
        + 'hueco que NO se ve, porque entra por un valor calculado y no por un dato ausente.',
    });
  }

  // ── EL VEREDICTO DE ESTE EJE: lo que hay y lo que falta para que lo haya ──
  //
  // Este aviso era FIJO: afirmaba sin condición que no hay utilización
  // longitudinal. Hoy es verdad —ningún apoyo del inventario declara su
  // capacidad para este eje—, pero el día que uno la declare la frase pasaría a
  // contradecir a la tabla que está justo encima. Es exactamente el fallo que
  // §ADR-014 tuvo que arreglar en cinco sitios: frases que envejecen mal por
  // construcción. Derivado de las filas, deja de ser falso solo.
  const sinVeredicto = filas.filter((r) => r.utilizacion_pct === null);
  const conVeredicto = filas.length - sinVeredicto.length;

  if (sinVeredicto.length === filas.length) {
    avisos.push({
      severidad: 'info',
      concepto: 'No hay utilización longitudinal: falta una capacidad declarada para este eje',
      motivo: CRITERIO_CAPACIDAD_LONGITUDINAL,
    });
  } else if (sinVeredicto.length) {
    avisos.push({
      severidad: 'aviso',
      concepto: `${sinVeredicto.length} de ${filas.length} apoyos siguen sin veredicto en este eje`,
      motivo: `${listar(sinVeredicto.map((r) => r.apoyo))}. ${CRITERIO_CAPACIDAD_LONGITUDINAL}`,
    });
  }
  if (conVeredicto) {
    avisos.push({
      severidad: 'info',
      concepto: `${conVeredicto} apoyo(s) con veredicto: contra qué se comparó su carga`,
      motivo: CRITERIO_UTILIZACION_LONGITUDINAL,
    });
  }

  // ── LÍMITES DEL MÉTODO: van siempre ──────────────────────────────────────

  avisos.push({
    severidad: 'info',
    concepto: 'El desequilibrio permanente sale de suponer que todos los tramos se tensaron igual',
    motivo: HIPOTESIS_DESEQUILIBRIO,
  });
  avisos.push({
    severidad: 'info',
    concepto: 'La rotura de conductor se publica SIN veredicto',
    motivo: SIN_CRITERIO_ACCIDENTAL,
  });
  avisos.push({
    severidad: 'info',
    concepto: 'La rotura en un apoyo de SUSPENSIÓN no se evalúa',
    motivo: 'Depende de la longitud de la cadena de aisladores y de la rigidez de los apoyos '
      + 'vecinos, que este sistema no captura. Estamparle a todos «el 0,5 típico» convertiría filas '
      + 'honestamente vacías en números que nadie puede defender.',
  });
  avisos.push({
    severidad: 'info',
    concepto: 'Este eje NO se suma al transversal, ni el caso permanente al accidental',
    motivo: 'Son ejes distintos y son hipótesis de carga distintas, con topes distintos. Un total '
      + 'que los mezclara sería sumar peras con manzanas dos veces. Cada uno va en su columna.',
  });

  return avisos;
}

// ── La forma de lo que devuelve el núcleo ───────────────────────────────────
interface CrudaLongitudinal {
  n: number;
  apoyo: string;
  funcionEstructural: string | null;
  caso: 'terminal' | 'desequilibrio' | 'suspension' | 'no_evaluable';
  apoyoAtras: string | null;
  apoyoAdelante: string | null;
  deflexion_grados: number | null;
  factorLongitudinal: number | null;
  permanente: {
    flAdelanteMax_kgf?: number | null; estadoAdelante?: string | null;
    flAtrasMax_kgf?: number | null; estadoAtras?: string | null;
  } | null;
  accidental: { atras?: { fuerza_kgf: number | null }; adelante?: { fuerza_kgf: number | null } } | null;
  /** Si el APOYO trae capacidad declarada — distinto de llevar veredicto (§ADR-017). */
  capacidadDeclarada?: boolean;
  /** El numerador del porcentaje: la carga TOTAL sobre el apoyo, no la de un conductor. */
  flTotalPeor_kgf?: number | null;
  /**
   * El veredicto del eje, o `null` cuando el núcleo se negó a emitirlo — que es
   * lo normal hoy. Los campos van opcionales a propósito: esta interfaz es un
   * espejo escrito a mano de lo que devuelve un módulo JS, y una forma rígida
   * convertiría en error de compilación lo que sería, como mucho, una celda
   * vacía. El motivo de la negativa NO viaja aquí: viaja en `notas`, que es
   * donde ya lo lee la pantalla, el informe y el CSV.
   */
  utilizacion: {
    utilizacion_pct?: number | null;
    margen_kgf?: number | null;
    estado?: string | null;
    umbralAplicado_pct?: number | null;
    criterio?: string | null;
  } | null;
  sensibilidadTendido_kgf: number | null;
  sentidoResoluble: boolean | null;
  inversionResoluble: boolean | null;
  notas: string[];
  noEvaluable: string | null;
}
