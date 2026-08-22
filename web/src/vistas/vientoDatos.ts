// ============================================================================
// vistas/vientoDatos.ts — la caracterización del viento, en números
// ----------------------------------------------------------------------------
// El viento YA estaba en el cálculo: es uno de los cuatro estados de cada tramo
// desde el primer día. Lo que no estaba por ningún lado era su caracterización.
// El informe mostraba el tiro del estado de viento sin decir nunca con cuánta
// presión, con cuánta carga por metro de cable, ni cuánto se va el conductor de
// lado. Quien revisa no puede discutir lo que no ve: si el revisor cree que la
// hipótesis de viento es alta, hoy no tiene dónde señalarlo.
//
// PURO: entran datos, salen números. Sin React, sin DOM, sin red — se puede
// probar sin navegador. Y sin una sola fórmula propia: la presión, la carga, la
// composición vectorial y la flecha se le piden a `@lineas/nucleo/mecanica`,
// que es el único dueño de la física. Si mañana cambia el coeficiente de
// arrastre por defecto o la forma de la presión dinámica, cambia allí y esta
// vista lo hereda. No hay una segunda copia de la fórmula que alguien corrija
// en un sitio y olvide en el otro — que es como un informe acaba dando dos
// cargas de viento distintas para el mismo conductor según qué tabla lo pinte.
//
// LO QUE ESTE MÓDULO NO HACE, y conviene decirlo alto: **no verifica ninguna
// distancia**. El ángulo de balanceo dice CUÁNTO se inclina el conductor; si al
// inclinarse conserva o no el aislamiento a la estructura y a las otras fases
// lo decide la geometría de la cruceta y de la cadena, que este sistema todavía
// no captura. Sale declarado en `avisos` como NO EVALUABLE, con su motivo. Un
// número de distancia mínima inventado aquí sería el peor error posible:
// alguien firma con él.
//
// Convenio de unidades (el de mecanica.js, no se cambia):
//   presión Pa · carga y peso kg/m · tiro kgf · vano y flecha m · ángulo grados
//
// Ver docs/40-DOMINIO-LINEAS-AT.md §3 (viento) y §8 (deuda declarada).
// ============================================================================
import {
  presionDinamica, cargaViento, cargaResultante, flechaCatenaria, tiroMaximoAdmisible, topeDeTiro,
} from '@lineas/nucleo/mecanica';
import type { Conductor, Hipotesis } from '@lineas/contratos';
import type { FilaTramo } from './tramos';

/**
 * Lo que este módulo necesita saber de un tramo, y nada más.
 *
 * Se declara como un recorte de `FilaTramo` —la fila que ya produce
 * `calcularTramos`— y no como una interfaz suelta escrita a mano: así, el día
 * que alguien renombre `hViento` allí, ESTE archivo deja de compilar y el error
 * se ve. Con una interfaz copiada, en cambio, el renombrado pasaría callado y
 * la columna de tiro con viento se quedaría vacía sin que nadie se entere.
 *
 * `vanoMax` es el vano MÁS LARGO del tramo: es el que gobierna la flecha, y en
 * un informe de viento interesa el peor vano, no el promedio.
 */
export type TramoParaViento = Pick<FilaTramo, 'n' | 'desde' | 'hasta' | 'vanoMax' | 'hViento'>;

/** Una fila de la tabla por tramo. Todo puede ser null: null = no evaluable. */
export interface FilaVientoTramo {
  n: number;
  desde: string;
  hasta: string;
  /** Tiro horizontal en el estado de máximo viento, en kgf. */
  tiroViento_kgf: number | null;
  /**
   * Ese tiro como % de la carga de rotura del conductor.
   *
   * ⚠️ NO es el mismo «% RTS» de la pestaña Mecánico: aquel es el del estado
   * PICO (que muchas veces es el de mínima temperatura, no el de viento). Dos
   * números distintos bajo el mismo rótulo es como se pierde una discusión
   * técnica; por eso la columna se rotula «con viento» y no «% RTS» a secas.
   */
  pctRts: number | null;
  /** Flecha del vano más largo del tramo en el estado de viento, en metros. */
  flechaViento_m: number | null;
}

/**
 * Un límite del cálculo, dicho con su consecuencia.
 *
 * `severidad` calca la de `exportar/calidad.js` para que la pantalla pueda
 * pintarlos con las clases que ya existen (.atencion / .aviso / .info) y para
 * que un hallazgo real —un tramo que se pasa del tiro admisible soplando el
 * viento— no se confunda con una limitación declarada del modelo.
 */
export interface AvisoViento {
  severidad: 'atencion' | 'aviso' | 'info';
  concepto: string;
  motivo: string;
}

export interface CaracterizacionViento {
  /** Presión dinámica del viento sobre una superficie, en Pa. */
  presion_Pa: number | null;
  /** Empuje horizontal sobre cada metro de conductor, en kg/m. */
  cargaViento_kg_m: number | null;
  /** Lo que pesa un metro de conductor, en kg/m. Es dato, no cálculo. */
  pesoPropio_kg_m: number | null;
  /** Peso y viento compuestos vectorialmente, en kg/m. */
  resultante_kg_m: number | null;
  /** Inclinación del plano en que cuelga el conductor, en grados. */
  anguloBalanceo_grados: number | null;
  /** Cuántas veces el empuje supera al peso. Es la tangente del ángulo. */
  relacionVientoPeso: number | null;
  porTramo: FilaVientoTramo[];
  avisos: AvisoViento[];
}

/** Un dato solo es dato si es un número finito y positivo. Lo demás es ausencia. */
const positivo = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

/**
 * Igual, pero el CERO sí es un valor válido: una hipótesis puede declarar
 * viento nulo (un cálculo de solo temperatura, por ejemplo). Cero declarado y
 * dato ausente son cosas distintas y no se pueden mezclar: el primero da
 * resultados legítimos que valen cero; el segundo no da resultado ninguno.
 */
const noNegativo = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

const RANGO: Record<AvisoViento['severidad'], number> = { atencion: 0, aviso: 1, info: 2 };

/**
 * Caracterización completa del viento para una línea y una hipótesis.
 *
 * @param conductor  el del contrato — se usan diámetro, masa lineal y RTS
 * @param hipotesis  la del contrato — velocidad, cx y densidad del aire
 * @param tramos     las filas que ya produjo `calcularTramos` (Mecánico). NO se
 *                   recalculan aquí: el tiro de viento de un tramo tiene un
 *                   solo dueño, y recalcularlo por segunda vez en otro archivo
 *                   es la forma más barata de que dos pestañas de la misma app
 *                   muestren dos tiros distintos para el mismo tramo.
 */
export function caracterizacionViento(
  conductor?: Conductor | null,
  hipotesis?: Hipotesis | null,
  tramos?: TramoParaViento[] | null,
): CaracterizacionViento {
  const avisos: AvisoViento[] = [];

  const v_kmh = noNegativo(hipotesis?.vientoMax_kmh);
  const diametro_m = positivo(conductor?.diametro_m);
  const peso_kg_m = positivo(conductor?.masaLineal_kg_m);
  const rts_kgf = positivo(conductor?.rts_kgf);
  const cx = positivo(hipotesis?.cx);
  const rho = positivo(hipotesis?.densidadAire_kg_m3);

  // ── Las magnitudes del viento ──────────────────────────────────────────────
  //
  // `cx ?? undefined` no es un adorno: pasar `undefined` es lo que ACTIVA el
  // valor por defecto de mecanica.js, mientras que pasar `null` lo desactivaría
  // y la carga saldría NaN — y un NaN se pinta como un hueco silencioso, no
  // como un error. Cuando ese defecto entra, más abajo se declara: nadie debe
  // enterarse de que se usó un cx supuesto leyendo el código fuente.
  const presion_Pa = v_kmh === null ? null : presionDinamica(v_kmh, rho ?? undefined);
  const cargaViento_kg_m = v_kmh === null || diametro_m === null
    ? null
    : cargaViento(diametro_m, v_kmh, { cx: cx ?? undefined, rho: rho ?? undefined });

  // Sin carga de viento la resultante NO es el peso propio: es desconocida. Un
  // conductor no deja de tener viento encima porque falte el diámetro en la
  // ficha. Devolver el peso aquí sería afirmar «no sopla», que es justo lo que
  // no se sabe.
  const resultante_kg_m = cargaViento_kg_m === null || peso_kg_m === null
    ? null
    : cargaResultante(peso_kg_m, cargaViento_kg_m);

  /**
   * Ángulo de balanceo = atan(carga de viento / peso propio).
   *
   * Es la inclinación del plano en el que cuelga el conductor, y es la magnitud
   * que decide la separación entre fases y la distancia al apoyo: un conductor
   * que se va 30° de lado busca la estructura y busca a su vecino.
   *
   * ⚠️ TRAMPA CONOCIDA, declarada abajo en avisos: este ángulo supone que el
   * vano peso es igual al vano viento (terreno plano) y desprecia el peso y el
   * empuje sobre la cadena de aisladores. El ángulo REAL de una cadena de
   * suspensión es atan(empuje·vano viento / peso·vano peso). En una vaguada el
   * vano peso baja, el denominador se encoge y el ángulo real sale MAYOR que
   * éste — y una vaguada es justo donde la geometría ya viene apretada. O sea
   * que el error va del lado inseguro. Se publica igual porque es la
   * caracterización del CONDUCTOR (correcta como tal), pero no se disfraza de
   * verificación de balanceo de cadena, que es otra cosa y necesita cotas.
   */
  const anguloBalanceo_grados = cargaViento_kg_m === null || peso_kg_m === null
    ? null
    : (Math.atan2(cargaViento_kg_m, peso_kg_m) * 180) / Math.PI;

  const relacionVientoPeso = cargaViento_kg_m === null || peso_kg_m === null
    ? null
    : cargaViento_kg_m / peso_kg_m;

  // ── La tabla por tramo ─────────────────────────────────────────────────────
  const filas: FilaVientoTramo[] = (tramos ?? []).map((t) => {
    const tiroViento_kgf = positivo(t?.hViento);
    const vanoMax_m = positivo(t?.vanoMax);
    return {
      n: t?.n,
      desde: t?.desde,
      hasta: t?.hasta,
      tiroViento_kgf,
      pctRts: tiroViento_kgf === null || rts_kgf === null
        ? null
        : (tiroViento_kgf / rts_kgf) * 100,
      // La flecha del estado de viento se calcula con la carga RESULTANTE, no
      // con el peso propio: el conductor cuelga en el plano inclinado, y usar
      // solo el peso daría una flecha menor de la que hay. Se mide EN ESE PLANO
      // inclinado; su proyección vertical es menor (flecha·cos ángulo). Por eso
      // el estado de viento no es el que gobierna la distancia al terreno —de
      // eso se ocupa el de máxima temperatura—: gobierna el tiro y el desplazamiento
      // lateral.
      flechaViento_m: tiroViento_kgf === null || vanoMax_m === null || resultante_kg_m === null
        ? null
        : flechaCatenaria(resultante_kg_m, vanoMax_m, tiroViento_kgf),
    };
  });

  // ── Lo que hay que decir junto a los números ───────────────────────────────

  if (v_kmh === null) {
    avisos.push({
      severidad: 'atencion',
      concepto: 'Velocidad de viento no declarada en la hipótesis',
      motivo: 'Sin velocidad no hay presión, ni carga, ni ángulo: la pestaña entera queda sin '
        + 'evaluar. No se asume ninguna velocidad por defecto — la velocidad de diseño es una '
        + 'decisión de ingeniería, no un valor de fábrica.',
    });
  } else if (v_kmh === 0) {
    avisos.push({
      severidad: 'aviso',
      concepto: 'La hipótesis declara viento cero',
      motivo: 'Todos los valores de esta pestaña salen en cero porque así está declarada la '
        + 'hipótesis, no porque en la zona no sople viento. Un cálculo mecánico sin estado de '
        + 'viento no es defendible para una línea de la costa Caribe.',
    });
  }

  if (diametro_m === null) {
    avisos.push({
      severidad: 'atencion',
      concepto: 'Diámetro del conductor ausente',
      motivo: 'El viento empuja sobre la CARA del cable: sin diámetro no hay superficie expuesta '
        + 'y la carga, la resultante y el ángulo de balanceo quedan sin evaluar.',
    });
  }

  if (peso_kg_m === null) {
    avisos.push({
      severidad: 'atencion',
      concepto: 'Masa lineal del conductor ausente',
      motivo: 'El ángulo de balanceo es la competencia entre empuje y peso. Sin el peso no hay '
        + 'con qué componer: ni resultante, ni ángulo, ni relación viento/peso.',
    });
  }

  if (rts_kgf === null && filas.length) {
    avisos.push({
      severidad: 'aviso',
      concepto: 'Carga de rotura (RTS) ausente',
      motivo: 'Los tiros con viento se muestran en kgf, pero no se pueden poner en porcentaje de '
        + 'la rotura: falta contra qué compararlos.',
    });
  }

  if (cx === null && v_kmh !== null && diametro_m !== null) {
    avisos.push({
      severidad: 'aviso',
      concepto: 'Coeficiente de arrastre (cx) no declarado en la hipótesis',
      motivo: 'Se calculó con el valor por defecto de @lineas/nucleo. La carga de viento es '
        + 'DIRECTAMENTE proporcional a cx: si el valor correcto para este conductor fuera un 20 % '
        + 'mayor, todos los tiros y flechas de viento de esta pantalla se quedan un 20 % cortos.',
    });
  }

  if (rho === null && v_kmh !== null) {
    avisos.push({
      severidad: 'aviso',
      concepto: 'Densidad del aire no declarada en la hipótesis',
      motivo: 'Se calculó con el valor por defecto de @lineas/nucleo. La presión es directamente '
        + 'proporcional a la densidad, y la densidad real depende de la altitud y de la '
        + 'temperatura del sitio: aire caliente a nivel del mar no pesa lo mismo que el estándar.',
    });
  }

  // Esta declaración va SIEMPRE, haya o no datos: es el límite del módulo, no
  // un problema de esta línea en particular.
  avisos.push({
    severidad: 'info',
    concepto: 'Distancia mínima entre fases y a la estructura: NO se evalúa aquí',
    motivo: 'El ángulo de balanceo dice cuánto se inclina el conductor; para decir si al '
      + 'inclinarse conserva el aislamiento harían falta la longitud de la cadena, la separación '
      + 'entre fases y la distancia del conductor al fuste — geometría de cruceta que el sistema '
      + 'todavía no captura. Se declara no evaluable en vez de publicar un despeje supuesto.',
  });

  if (anguloBalanceo_grados !== null) {
    avisos.push({
      severidad: 'info',
      concepto: 'El ángulo publicado es el del conductor, no el de la cadena de suspensión',
      motivo: 'Supone vano peso igual a vano viento (terreno plano) y desprecia el peso y el '
        + 'empuje sobre la propia cadena. En una vaguada el vano peso baja y el ángulo real sale '
        + 'MAYOR que éste, o sea que la simplificación se equivoca del lado inseguro justo donde '
        + 'la geometría viene más apretada.',
    });
    avisos.push({
      severidad: 'info',
      concepto: 'Carga estática: sin factor de ráfaga ni factor de vano',
      motivo: 'Se aplica la presión de la velocidad declarada, sin corrección por turbulencia ni '
        + 'por la longitud del vano. Es una simplificación ADOPTADA en este proyecto, no un '
        + 'criterio de norma; queda pendiente de contrastar antes de emitir un cálculo firmable.',
    });
  }

  // ── Hallazgo real, no limitación: tramos que el viento solo ya se pasa ─────
  //
  // Va como `atencion` porque no habla del modelo, habla de la línea. El umbral
  // es el mismo que usa la pestaña Mecánico (`tiroMaximoAdmisible`), pedido al
  // núcleo y no escrito aquí: si un día se discute y se cambia, se cambia en un
  // solo sitio y las dos pantallas dicen lo mismo el mismo día.
  if (rts_kgf !== null) {
    const tope = topeDeTiro(hipotesis ?? undefined);
    const admisible = tiroMaximoAdmisible(rts_kgf, hipotesis ?? undefined);
    const excedidos = filas.filter((f) => f.tiroViento_kgf !== null && f.tiroViento_kgf > admisible);
    if (excedidos.length) {
      avisos.push({
        severidad: 'atencion',
        concepto: `El estado de viento por sí solo supera el tiro admisible en ${excedidos.length} tramo(s)`,
        motivo: `Tramos ${excedidos.map((f) => f.n).join(', ')}: el tiro con viento pasa del `
          + `umbral adoptado (${tope.pct} % de la carga de rotura`
          + `${tope.procedencia === 'criterio_clasico' ? ', criterio clásico' : ', declarado en la hipótesis'}). `
          + 'Con la hipótesis declarada, el viento no es el caso cómodo de esta línea: hay que '
          + 'revisarlo antes de firmar.',
      });
    }
  }

  if (!filas.length) {
    avisos.push({
      severidad: 'info',
      concepto: 'Sin tramos de tensión que caracterizar',
      motivo: 'Las magnitudes del viento sobre el conductor sí se muestran, pero la tabla por '
        + 'tramo necesita al menos dos estructuras y un tramo calculado.',
    });
  }

  return {
    presion_Pa,
    cargaViento_kg_m,
    pesoPropio_kg_m: peso_kg_m,
    resultante_kg_m,
    anguloBalanceo_grados,
    relacionVientoPeso,
    porTramo: filas,
    // Lo grave primero. `sort` de JS es estable desde ES2019, así que dentro de
    // cada severidad se conserva el orden en que se descubrieron los avisos —
    // que es el orden en que se leen bien: primero el dato que falta, después
    // la limitación del modelo.
    avisos: avisos.sort((a, b) => RANGO[a.severidad] - RANGO[b.severidad]),
  };
}
