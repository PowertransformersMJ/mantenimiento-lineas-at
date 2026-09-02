// ============================================================================
// nucleo/termica.js — resistencia y ampacidad del conductor
// ----------------------------------------------------------------------------
// Funciones PURAS. Implementa IEEE Std 738 en régimen permanente.
// Ver docs/40-DOMINIO-LINEAS-AT.md §4.
// ============================================================================

const RHO_COBRE_20 = 1.7241e-8;  // Ω·m — resistividad del cobre patrón a 20 °C
const FACTOR_CABLEADO = 1.02;    // los hilos van helicoidales: recorren más que el cable

/**
 * Propiedades eléctricas por material: [conductividad relativa al cobre,
 * coeficiente térmico de resistencia β en 1/°C].
 */
export const MATERIALES = {
  ACSR:          { conductividad: 0.610, beta: 0.00403, tMaxContinua: 75 },
  AAAC:          { conductividad: 0.525, beta: 0.00347, tMaxContinua: 90 },
  ACAR:          { conductividad: 0.570, beta: 0.00380, tMaxContinua: 90 },
  'ACSS / ACCC': { conductividad: 0.610, beta: 0.00403, tMaxContinua: 200 },
  Otro:          { conductividad: 0.600, beta: 0.00390, tMaxContinua: 75 },
};

// ════════════════════════════════════════════════════════════════════════════
// EL DUEÑO ÚNICO DE LAS CONDICIONES
// ────────────────────────────────────────────────────────────────────────────
// ⚠️ POR QUÉ ESTO EXISTE. La FÓRMULA de la ampacidad ya tenía un solo dueño
// —`ampacidad()`, aquí abajo—. Lo que NO lo tenía eran las CONDICIONES: cada
// pantalla escribía a mano su ambiente, su viento y su sol, y la misma línea
// salía con tres números distintos bajo el mismo rótulo «IEEE 738».
//
// Y la diferencia no es cosmética. Con el mismo Darien AAAC a 90 °C:
//
//     calma      522 A          1,0 m/s    807 A
//     0,61 m/s   718 A          2,0 m/s    965 A
//
// El mismo cable, de 522 a 965 A. **Elegir la condición es elegir el veredicto.**
//
// Estas funciones NO eligen ningún clima. Hacen EXPLÍCITO lo que hoy se adopta
// en silencio: devuelven el número junto con sus seis condiciones y con cuáles
// fueron declaradas por el Ingeniero y cuáles adoptadas por el sistema. La regla
// de la casa no prohíbe adoptar — prohíbe adoptar sin decirlo (`99 §ADR-093`).
// ════════════════════════════════════════════════════════════════════════════

/**
 * LA CONDICIÓN DE REFERENCIA. Es la que dejó verificada el dominio contra tabla
 * de fabricante (`docs/40 §4.2`): con ella el Darien AAAC da 611/649/718/779 A a
 * 75/80/90/100 °C. No es «lo típico del Caribe»: es el patrón de medida.
 */
export const CONDICION_DE_REFERENCIA = Object.freeze({
  ambiente_C: 32, viento_m_s: 0.61, sol_W_m2: 1000,
  emisividad: 0.5, absortividad: 0.5, altitud_m: 10,
});

export const PROCEDENCIA_CONDICION_REFERENCIA =
  'condición de referencia del dominio (docs/40 §4.2), verificada contra tabla de fabricante';

export const AVISO_CONDICION_NO_RATIFICADA =
  'Condición ADOPTADA por el sistema, no declarada por el ingeniero. Para hacerla suya, '
  + 'declárela en `hipotesis.condicionTermica`; hasta entonces, este número es una referencia, '
  + 'no un dictamen firmado.';

/** Los vientos con los que se enseña la sensibilidad. Uno de ellos es la calma. */
export const VIENTOS_DE_SENSIBILIDAD = Object.freeze([0, 0.61, 1.0, 2.0]);

const CAMPOS_CONDICION = Object.freeze(
  ['ambiente_C', 'viento_m_s', 'sol_W_m2', 'emisividad', 'absortividad', 'altitud_m']);

/**
 * LA TEMPERATURA DEL CONDUCTOR, con una sola cascada y declarando de dónde sale.
 *
 * ⚠️ El orden importa y va del dato más específico al más genérico: lo que pida
 * quien llama → la FICHA del conductor → el límite del material. Saltarse la
 * ficha es el error caro: si una ficha declara 75 °C y se usa el 90 °C del
 * material, se publica capacidad de MÁS (718 A en vez de 611 A), siempre por el
 * lado optimista — y una capacidad inflada hace que una línea sobrecargada
 * parezca sana.
 *
 * @param {{pedida_C?: number|null, conductor?: {material?: string, tempMaxOperacion_C?: number}}} e
 * @returns {{valor_C: number|null, origen: 'pedida'|'ficha'|'material'|'generico',
 *            rotulo: string, aviso?: string}}
 */
export function temperaturaDelConductor({ pedida_C = null, conductor = null } = {}) {
  if (Number.isFinite(pedida_C)) {
    return { valor_C: pedida_C, origen: 'pedida', rotulo: `${pedida_C} °C (pedida)` };
  }
  const ficha = conductor?.tempMaxOperacion_C;
  if (Number.isFinite(ficha)) {
    return { valor_C: ficha, origen: 'ficha', rotulo: `${ficha} °C (declarada en la ficha del conductor)` };
  }
  // ⚠️ `temperaturaLimite` cae en el genérico «Otro» (75 °C) cuando no reconoce
  // el material, y eso NO se cambia: hay pantallas que dependen de ello y una de
  // ellas ya avisa. Lo que sí se hace aquí es **confesarlo**. Un conductor cuyo
  // material nadie declaró recibiría, si no, una temperatura de catálogo con
  // cara de dato bueno — y de ahí sale un amperaje que nadie puede defender.
  const conocido = Object.hasOwn(MATERIALES, conductor?.material ?? '');
  const lim = temperaturaLimite(conductor?.material);
  if (!conocido) {
    return {
      valor_C: lim, origen: 'generico',
      rotulo: `${lim} °C (material NO declarado: se usa el genérico «Otro»)`,
      aviso: 'El conductor no declara un material reconocido. La temperatura y la ampacidad salen '
        + 'del perfil genérico «Otro»: son una aproximación, no un dato del conductor.',
    };
  }
  return {
    valor_C: lim, origen: 'material',
    rotulo: `${lim} °C (límite típico del material ${conductor.material})`,
  };
}

/**
 * LAS SEIS CONDICIONES RESUELTAS, diciendo cuál es de quién.
 *
 * @param {{pedida?: object|null, hipotesis?: object|null}} e
 * @returns {{valores: Record<string, number>, paraElNucleo: object,
 *            declaradas: string[], adoptadas: string[], todoAdoptado: boolean,
 *            ratificada: boolean, ratificadaPor: string|null, ratificadaEn: string|null,
 *            fuente: string|null, procedencias: Record<string, string>,
 *            rotulo: string, aviso: string|null}}
 */
export function condicionesDeAmpacidad({ pedida = null, hipotesis = null } = {}) {
  const declarada = hipotesis?.condicionTermica ?? null;
  const valores = {}; const procedencias = {};
  const declaradas = []; const adoptadas = [];

  for (const k of CAMPOS_CONDICION) {
    if (Number.isFinite(pedida?.[k])) {
      valores[k] = pedida[k]; procedencias[k] = 'pedida por la vista'; declaradas.push(k);
    } else if (Number.isFinite(declarada?.[k])) {
      valores[k] = declarada[k]; procedencias[k] = 'declarada en la hipótesis'; declaradas.push(k);
    } else {
      valores[k] = CONDICION_DE_REFERENCIA[k];
      procedencias[k] = PROCEDENCIA_CONDICION_REFERENCIA; adoptadas.push(k);
    }
  }

  const ratificada = declarada?.ratificada === true;
  return {
    valores,
    // La forma que `ampacidad()` entiende. No se renombra nada de lo viejo.
    paraElNucleo: {
      v: valores.viento_m_s, eps: valores.emisividad, abso: valores.absortividad,
      qs: valores.sol_W_m2, he: valores.altitud_m,
    },
    declaradas, adoptadas, todoAdoptado: declaradas.length === 0,
    ratificada,
    ratificadaPor: declarada?.ratificadaPor ?? null,
    ratificadaEn: declarada?.ratificadaEn ?? null,
    fuente: declarada?.fuente ?? null,
    procedencias,
    rotulo: `${valores.ambiente_C} °C ambiente · viento ${valores.viento_m_s} m/s · sol `
      + `${valores.sol_W_m2} W/m² · ε ${valores.emisividad} · α ${valores.absortividad} · `
      + `${valores.altitud_m} msnm`,
    aviso: ratificada ? null : AVISO_CONDICION_NO_RATIFICADA,
  };
}

/**
 * LA AMPACIDAD DE UNA LÍNEA, con sus condiciones pegadas — o `null` con motivo.
 *
 * ⚠️ NUNCA devuelve un número suelto. Un amperaje sin las condiciones con que se
 * calculó no significa nada: el mismo conductor da 522 o 965 A según el aire.
 *
 * ⚠️ Recibe el `Conductor` DEL CONTRATO (`seccion_mm2`, `diametro_m` en metros,
 * `tempMaxOperacion_C`). `ampacidad()` y `derrateo()` siguen recibiendo la forma
 * corta del núcleo (`seccion`, `diametro`): aquí se traduce, y por eso esta
 * función es el único sitio donde conviven las dos formas.
 *
 * @returns {{ampacidad_A: number|null, motivo: string|null, condiciones: object,
 *            temperatura: object, rotulo: string, avisos: string[],
 *            sensibilidadViento: {viento_m_s: number, ampacidad_A: number}[]}}
 */
export function ampacidadDeLinea({
  conductor = null, hipotesis = null, pedida = null, temperaturaConductor_C = null } = {}) {
  const condiciones = condicionesDeAmpacidad({ pedida, hipotesis });
  const temperatura = temperaturaDelConductor({ pedida_C: temperaturaConductor_C, conductor });
  const avisos = [];
  if (condiciones.aviso) avisos.push(condiciones.aviso);
  if (temperatura.aviso) avisos.push(temperatura.aviso);

  const falta = !conductor ? 'no hay conductor declarado en la línea'
    : temperatura.valor_C == null ? 'el conductor no declara material ni temperatura máxima'
    : !Number.isFinite(conductor.seccion_mm2) ? 'el conductor no declara sección'
    : !Number.isFinite(conductor.diametro_m) ? 'el conductor no declara diámetro'
    : null;

  if (falta) {
    return {
      ampacidad_A: null, motivo: falta, condiciones, temperatura,
      rotulo: `no evaluable: ${falta}`, avisos, sensibilidadViento: [],
    };
  }

  const paraNucleo = {
    material: conductor.material, seccion: conductor.seccion_mm2, diametro: conductor.diametro_m,
  };
  const A = ampacidad(paraNucleo, temperatura.valor_C, condiciones.valores.ambiente_C,
    condiciones.paraElNucleo);

  return {
    ampacidad_A: A,
    motivo: null,
    condiciones,
    temperatura,
    rotulo: `${Math.round(A)} A · conductor a ${temperatura.rotulo} · ${condiciones.rotulo}`,
    avisos,
    // Se calcula AQUÍ y solo aquí: quien la necesite la recibe, para que nadie
    // vuelva a rehacer una ampacidad con condiciones propias.
    sensibilidadViento: VIENTOS_DE_SENSIBILIDAD.map((v) => ({
      viento_m_s: v,
      ampacidad_A: ampacidad(paraNucleo, temperatura.valor_C, condiciones.valores.ambiente_C,
        { ...condiciones.paraElNucleo, v }),
    })),
  };
}

/**
 * Resistencia en corriente continua a temperatura T.
 * @param seccion  mm²
 * @returns Ω/m  (multiplicar por 1000 para Ω/km)
 */
export function resistenciaDC({ material, seccion }, T) {
  const m = MATERIALES[material] ?? MATERIALES.Otro;
  const R20 = (RHO_COBRE_20 / m.conductividad / (seccion * 1e-6)) * FACTOR_CABLEADO;
  return R20 * (1 + m.beta * (T - 20));
}

/**
 * Ampacidad en régimen permanente — IEEE Std 738.
 *
 * Balance térmico: el calor generado por efecto Joule iguala lo evacuado por
 * convección y radiación, menos lo ganado del sol.
 *
 *     I = √( (qc + qr − qs) / R(Tc) )
 *
 * @param conductor {material, seccion (mm²), diametro (METROS)}
 * @param Tc  temperatura del conductor, °C
 * @param Ta  temperatura ambiente, °C
 * @param opciones.v      velocidad del viento perpendicular, m/s
 * @param opciones.eps    emisividad de la superficie (0,23 nuevo … 0,91 envejecido)
 * @param opciones.abso   absortividad solar (idem rango)
 * @param opciones.qs     radiación solar incidente, W/m²
 * @param opciones.he     altitud sobre el nivel del mar, m
 * @returns amperios (0 si el conductor no puede evacuar ni el aporte solar)
 */
export function ampacidad(conductor, Tc, Ta, { v = 0.61, eps = 0.5, abso = 0.5, qs = 1000, he = 0 } = {}) {
  const D = conductor.diametro;
  const Tf = (Tc + Ta) / 2;                       // temperatura de película
  const dT = Tc - Ta;

  // Propiedades del aire a Tf, corregidas por altitud
  const rho = (1.293 - 1.525e-4 * he + 6.379e-9 * he * he) / (1 + 0.00367 * Tf);
  const mu  = (1.458e-6 * (Tf + 273) ** 1.5) / (Tf + 383.4);
  const kf  = 2.424e-2 + 7.477e-5 * Tf - 4.407e-9 * Tf * Tf;
  const Re  = (D * rho * v) / mu;

  // Convección: se toma la MAYOR de las tres correlaciones (viento bajo,
  // viento alto, convección natural). Es lo que manda la norma.
  const qcVientoBajo = (1.01 + 1.35 * Re ** 0.52) * kf * dT;
  const qcVientoAlto = 0.754 * Re ** 0.60 * kf * dT;
  const qcNatural    = 3.645 * Math.sqrt(rho) * D ** 0.75 * Math.max(dT, 0) ** 1.25;
  const qc = Math.max(qcVientoBajo, qcVientoAlto, qcNatural);

  const qr = 17.8 * D * eps * (((Tc + 273) / 100) ** 4 - ((Ta + 273) / 100) ** 4);
  const qSolar = abso * qs * D;

  const neto = qc + qr - qSolar;
  if (neto <= 0) return 0;
  return Math.sqrt(neto / resistenciaDC(conductor, Tc));
}

/**
 * Temperatura límite de operación continua del material. Para el AAAC los
 * 90 °C vienen de la aleación 6201-T81: por encima pierde propiedades
 * mecánicas de forma PERMANENTE. No es conservadurismo de catálogo.
 */
export const temperaturaLimite = (material) =>
  (MATERIALES[material] ?? MATERIALES.Otro).tMaxContinua;

/**
 * Derrateo: cuánta capacidad se pierde respecto a una condición de referencia.
 * Útil para explicar por qué la ampacidad de placa engaña — un día en calma
 * le quita al conductor cerca de un tercio de su capacidad.
 */
export function derrateo(conductor, Tc, condicionReal, condicionReferencia) {
  const real = ampacidad(conductor, Tc, condicionReal.Ta, condicionReal);
  const ref  = ampacidad(conductor, Tc, condicionReferencia.Ta, condicionReferencia);
  return { real, referencia: ref, factor: ref > 0 ? real / ref : 0 };
}
