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
 * @param {{pedida_C?: number|null, conductor?: Record<string, any>|null}} [e]
 * @returns {TemperaturaDelConductor}
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
 * @typedef {object} CondicionesDeAmpacidad
 * @property {{ambiente_C: number, viento_m_s: number, sol_W_m2: number,
 *             emisividad: number, absortividad: number, altitud_m: number}} valores
 * @property {{v: number, eps: number, abso: number, qs: number, he: number}} paraElNucleo
 * @property {string[]} declaradas
 * @property {string[]} adoptadas
 * @property {boolean} todoAdoptado
 * @property {boolean} ratificada
 * @property {string|null} ratificadaPor
 * @property {string|null} ratificadaEn
 * @property {string|null} fuente
 * @property {Record<string, string>} procedencias
 * @property {string} rotulo
 * @property {string|null} aviso
 */

/**
 * @typedef {object} TemperaturaDelConductor
 * @property {number|null} valor_C
 * @property {'pedida'|'ficha'|'material'|'generico'} origen
 * @property {string} rotulo
 * @property {string} [aviso]
 */

/**
 * LAS SEIS CONDICIONES RESUELTAS, diciendo cuál es de quién.
 *
 * @param {{pedida?: Record<string, any>|null, hipotesis?: Record<string, any>|null}} [e]
 * @returns {CondicionesDeAmpacidad}
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
 * LAS SEIS CONDICIONES QUE LA FICHA DEL FABRICANTE DECLARA — y las que no.
 *
 * ⚠️ NO SUPONE NADA. Un campo que la ficha no imprime sale como `null` y se
 * cuenta en `faltan`. La tentación de rellenar con «lo típico» es exactamente
 * lo que convierte un dato trazable en una hipótesis disfrazada de dato.
 *
 * @param {Record<string, any>|null} ficha
 * @returns {{valores: Record<string, number|null>, faltan: string[], completa: boolean}}
 */
export function condicionesDeLaFicha(ficha) {
  const valores = {};
  const faltan = [];
  for (const c of CAMPOS_CONDICION) {
    const v = ficha && Number.isFinite(ficha[c]) ? ficha[c] : null;
    valores[c] = v;
    if (v == null) faltan.push(c);
  }
  return { valores, faltan, completa: faltan.length === 0 };
}

/**
 * EL RÓTULO DE LA AMPACIDAD — dueño único, y por una razón cara.
 *
 * ⚠️ CUATRO SITIOS escribían «IEEE 738» pegado al número: dos pantallas y **dos
 * informes firmables**. Desde `99 §ADR-098` ese número puede venir de la ficha
 * del FABRICANTE, y entonces llamarlo «IEEE 738» es una mentira impresa sobre
 * un papel que firma un ingeniero. Cualquier sitio que rotule una ampacidad
 * llama aquí; hay una prueba que lo vigila.
 *
 * @param {Record<string, any>|null} amp  lo que devuelve `ampacidadDeLinea`
 * @returns {string}
 */
export function etiquetaDeAmpacidad(amp) {
  if (!amp || amp.ampacidad_A == null) return 'capacidad en corriente: no evaluable';
  if (amp.naturaleza === 'declarada') {
    const quien = amp.fabricante && amp.fabricante.fabricante ? amp.fabricante.fabricante : 'el fabricante';
    return `ampacidad DECLARADA por ${quien}`;
  }
  return 'ampacidad CALCULADA (IEEE 738)'
    + (amp.condiciones && amp.condiciones.todoAdoptado ? ' · condiciones adoptadas' : '');
}

/**
 * LOS CUATRO VIENTOS. Se calcula AQUÍ y solo aquí, para que nadie vuelva a
 * rehacer una ampacidad con condiciones propias. Vale para las dos naturalezas:
 * cuando la cifra de registro es la del fabricante, esto sigue diciendo cuánto
 * pesa el viento sobre ESE conductor — que es la lectura operativa.
 *
 * @returns {{viento_m_s: number, ampacidad_A: number}[]}
 */
export function sensibilidadDeViento({ conductor, tempConductor_C, condiciones }) {
  if (!conductor || !Number.isFinite(conductor.seccion_mm2) || !Number.isFinite(conductor.diametro_m)
    || !Number.isFinite(tempConductor_C)) return [];
  const paraNucleo = {
    material: conductor.material, seccion: conductor.seccion_mm2, diametro: conductor.diametro_m,
  };
  return VIENTOS_DE_SENSIBILIDAD.map((v) => ({
    viento_m_s: v,
    ampacidad_A: ampacidad(paraNucleo, tempConductor_C, condiciones.valores.ambiente_C,
      { ...condiciones.paraElNucleo, v }),
  }));
}

/**
 * EL CONTRASTE: lo que dice la ficha contra lo que da el clima del sitio.
 *
 * ⚠️ POR QUÉ EXISTE. Desde el 2026-09-05 la ampacidad de registro es la del
 * FABRICANTE (orden del Ingeniero). Eso resuelve la trazabilidad y NO resuelve
 * la física: la ficha se calculó con SUS condiciones, y la línea opera con las
 * del sitio. Si el sitio es más duro que la ficha, la cifra de registro promete
 * más de lo que el cable puede dar ese día — y no avisarlo sería peor que no
 * tener la cifra.
 *
 * Este contraste NO cambia el veredicto: lo acompaña. Quien decide si se
 * derratea es el ingeniero, no el código.
 *
 * @returns {ContrasteDeFabricante}
 */
export function contrasteDeFabricante({
  conductor = null, ficha = null, condicionesDelSitio = null, tempConductor_C = null } = {}) {
  if (!ficha) return { motivo: 'la línea no declara ampacidad de fabricante', comparable: false };
  if (!conductor || !Number.isFinite(conductor.seccion_mm2) || !Number.isFinite(conductor.diametro_m)) {
    return { motivo: 'el conductor no declara sección o diámetro: no se puede recalcular', comparable: false };
  }

  const deLaFicha = condicionesDeLaFicha(ficha);
  const paraNucleo = {
    material: conductor.material, seccion: conductor.seccion_mm2, diametro: conductor.diametro_m,
  };
  const Tc = Number.isFinite(tempConductor_C) ? tempConductor_C : ficha.tempConductor_C;

  // ── Lo que da el SITIO con la temperatura de conductor de la ficha ────────
  const enElSitio = condicionesDelSitio
    ? ampacidad(paraNucleo, Tc, condicionesDelSitio.valores.ambiente_C, condicionesDelSitio.paraElNucleo)
    : null;

  // ── Lo que da la propia FICHA recalculada, si declaró sus condiciones ─────
  // Sirve para una pregunta muy concreta: ¿reproduce el número del catálogo?
  // Si no reproduce, el fabricante usó otro método u otras hipótesis, y eso se
  // DICE en vez de tomarlo por un error de nadie.
  const reproducida = deLaFicha.completa
    ? ampacidad(paraNucleo, Tc, deLaFicha.valores.ambiente_C, {
        v: deLaFicha.valores.viento_m_s, eps: deLaFicha.valores.emisividad,
        abso: deLaFicha.valores.absortividad, qs: deLaFicha.valores.sol_W_m2,
        he: deLaFicha.valores.altitud_m,
      })
    : null;

  const declarada_A = ficha.corriente_A;
  const delta_A = enElSitio == null ? null : enElSitio - declarada_A;
  const delta_pct = delta_A == null ? null : (delta_A / declarada_A) * 100;

  return {
    comparable: enElSitio != null,
    motivo: enElSitio == null ? 'no hay condiciones de sitio con las que contrastar' : null,
    declarada_A,
    enElSitio_A: enElSitio,
    delta_A,
    delta_pct,
    /** ⚠️ NEGATIVO = el sitio da MENOS de lo que promete la ficha. */
    elSitioEsMasDuro: delta_A == null ? null : delta_A < 0,
    reproducida_A: reproducida,
    /** Cuánto se aleja el recálculo del número impreso, en %. Null si no se pudo. */
    desviacionDeLaFicha_pct: reproducida == null ? null
      : ((reproducida - declarada_A) / declarada_A) * 100,
    condicionesDeLaFicha: deLaFicha,
    tempConductor_C: Tc,
  };
}

/**
 * LA AMPACIDAD DE UNA LÍNEA, con sus condiciones pegadas — o `null` con motivo.
 *
 * ⚠️ NUNCA devuelve un número suelto. Un amperaje sin las condiciones con que se
 * calculó no significa nada: el mismo conductor da 522 o 965 A según el aire.
 *
 * ⚠️ DOS NATURALEZAS, Y SIEMPRE SE DICE CUÁL (`99 §ADR-098`):
 *   · `declarada` — la línea trae `conductor.ampacidadDeFabricante`. Esa cifra
 *     ES la de registro (orden del Ingeniero, 2026-09-05) y el IEEE 738 baja a
 *     `contraste`.
 *   · `derivada`  — no hay ficha: la calculamos, y se rotula CALCULADA.
 *   · `null`      — no evaluable. **No hay valor por defecto**: un `?? 'derivada'`
 *     convertiría «no se sabe» en una afirmación.
 *
 * ⚠️ Recibe el `Conductor` DEL CONTRATO (`seccion_mm2`, `diametro_m` en metros,
 * `tempMaxOperacion_C`). `ampacidad()` y `derrateo()` siguen recibiendo la forma
 * corta del núcleo (`seccion`, `diametro`): aquí se traduce, y por eso esta
 * función es el único sitio donde conviven las dos formas.
 *
 * @param {{conductor?: Record<string, any>|null, hipotesis?: Record<string, any>|null,
 *           pedida?: Record<string, any>|null, temperaturaConductor_C?: number|null}} [e]
 * ⚠️ DOS NÚMEROS, Y NO SON EL MISMO: `ampacidad_A` es el valor de REGISTRO
 * (el del fabricante cuando lo hay) y **`vigente_A` es el DENOMINADOR del
 * veredicto** — el menor entre la ficha y lo que el clima del día permite.
 * La vigente **nunca sube** por encima de la declarada: el fabricante pone el
 * techo y el día solo puede bajarlo.
 *
 * @returns {{ampacidad_A: number|null, vigente_A: number|null, vigenteRotulo: string,
 *            naturaleza: 'declarada'|'derivada'|null,
 *            motivo: string|null, fabricante: Record<string, any>|null,
 *            contraste: Record<string, any>|null,
 *            condiciones: CondicionesDeAmpacidad, temperatura: Record<string, any>,
 *            condicionesDeLaFicha?: Record<string, any>,
 *            rotulo: string, avisos: string[],
 *            sensibilidadViento: {viento_m_s: number, ampacidad_A: number}[]}}
 */
export function ampacidadDeLinea({
  conductor = null, hipotesis = null, pedida = null, temperaturaConductor_C = null } = {}) {
  const condiciones = condicionesDeAmpacidad({ pedida, hipotesis });
  const temperatura = temperaturaDelConductor({ pedida_C: temperaturaConductor_C, conductor });
  const avisos = [];
  if (condiciones.aviso) avisos.push(condiciones.aviso);
  if (temperatura.aviso) avisos.push(temperatura.aviso);

  // ══════════════════════════════════════════════════════════════════════════
  // LA FICHA DEL FABRICANTE MANDA — orden del Ingeniero, 2026-09-05
  // ──────────────────────────────────────────────────────────────────────────
  // «la ampacidad debe ser lo que dice el fabricante conforme a sus
  // especificaciones técnicas». Cuando la línea declara ese bloque, ESE es el
  // número de registro y el IEEE 738 baja a CONTRASTE.
  //
  // ⚠️ Y ojo al orden: esta rama va ANTES de exigir sección y diámetro. La
  // cifra del fabricante no necesita la geometría —ya la tuvo en cuenta él—,
  // así que una línea con la ficha declarada y el conductor a medio describir
  // SIGUE teniendo ampacidad. Es una ventaja real de esta orden.
  // ══════════════════════════════════════════════════════════════════════════
  const ficha = conductor && conductor.ampacidadDeFabricante ? conductor.ampacidadDeFabricante : null;
  if (ficha) {
    const avisosFicha = [];
    const deLaFicha = condicionesDeLaFicha(ficha);
    if (!deLaFicha.completa) {
      avisosFicha.push(`La ficha del fabricante NO declara ${deLaFicha.faltan.join(', ')}. `
        + 'El número se publica igual —es el suyo— pero sin sus condiciones no se puede saber si el '
        + 'clima del sitio lo honra. Pídalas a quien emitió la ficha.');
    }
    // El desajuste que sobre-califica una línea sin que nadie lo note.
    const maxDelConductor = Number.isFinite(conductor.tempMaxOperacion_C)
      ? conductor.tempMaxOperacion_C : null;
    if (maxDelConductor != null && ficha.tempConductor_C > maxDelConductor) {
      avisosFicha.push(`⚠️ La ficha da esa corriente con el conductor a ${ficha.tempConductor_C} °C, `
        + `pero la línea declara un máximo de ${maxDelConductor} °C. Usar esta cifra publica `
        + 'capacidad de MÁS. Pida al fabricante la fila de su temperatura, o rectifique el máximo.');
    }
    if (ficha.metodo === 'no_declarado') {
      avisosFicha.push('La ficha no dice con qué método se calculó esa tabla (IEEE 738, CIGRÉ 601…). '
        + 'No la invalida; sí impide explicar una diferencia con nuestro cálculo.');
    }

    const contraste = contrasteDeFabricante({
      conductor, ficha, condicionesDelSitio: condiciones, tempConductor_C: ficha.tempConductor_C,
    });
    if (contraste.elSitioEsMasDuro === true) {
      avisosFicha.push(`Con las condiciones del sitio (${condiciones.rotulo}) este conductor da `
        + `${Math.round(contraste.enElSitio_A)} A, un ${Math.abs(contraste.delta_pct).toFixed(1)} % `
        + 'MENOS que la ficha. La cifra de registro promete más de lo que el cable entrega ese día: '
        + 'la decisión de derratear es del ingeniero, no del sistema.');
    }

    // ══════════════════════════════════════════════════════════════════════
    // LA VIGENTE: el TECHO lo pone el fabricante, el SUELO lo pone el día
    // ──────────────────────────────────────────────────────────────────────
    // ⚠️ La cifra del fabricante es el valor de REGISTRO y no se toca nunca.
    // Pero el veredicto diario no puede dividir entre un número que la física
    // del día no honra: FERC Orden 881 §35 lo llama, con esas palabras,
    // «riesgo de sobrecarga inadvertida».
    //
    // Y la regla que hace que la orden del Ingeniero mande DE VERDAD: la
    // vigente **nunca sube por encima de la declarada**. Una noche fresca con
    // brisa no autoriza a pasarse del catálogo — el fabricante puso el techo.
    // Así que es un MÍNIMO, y solo puede bajar.
    //
    // Sin contraste posible (ficha sin condiciones, conductor sin geometría) la
    // vigente ES la declarada, y el motivo lo dice.
    // ══════════════════════════════════════════════════════════════════════
    const vigente_A = contraste.comparable
      ? Math.min(ficha.corriente_A, contraste.enElSitio_A)
      : ficha.corriente_A;
    const laLimitaElDia = contraste.comparable && contraste.enElSitio_A < ficha.corriente_A;

    return {
      ampacidad_A: ficha.corriente_A,
      /**
       * ⚠️ EL DENOMINADOR DEL VEREDICTO. Distinto de `ampacidad_A` —que es el
       * valor de REGISTRO— cuando el clima del día da menos que la ficha.
       */
      vigente_A,
      vigenteRotulo: laLimitaElDia
        ? `${Math.round(vigente_A)} A — la limita el clima del sitio, no la ficha `
          + `(${Math.round(ficha.corriente_A)} A)`
        : contraste.comparable
          ? `${Math.round(vigente_A)} A — la ficha del fabricante manda: el sitio da más`
          : `${Math.round(vigente_A)} A — la ficha, sin contrastar (${contraste.motivo})`,
      naturaleza: 'declarada',
      motivo: null,
      fabricante: {
        ...ficha,
        rotulo: `${ficha.fabricante} · ${ficha.documento}`
          + (ficha.ubicacionEnDocumento ? ` · ${ficha.ubicacionEnDocumento}` : ''),
      },
      condiciones: { ...condiciones, sonDelSitio: true },
      condicionesDeLaFicha: deLaFicha,
      temperatura: {
        valor_C: ficha.tempConductor_C,
        rotulo: `${ficha.tempConductor_C} °C`,
        de: 'ficha del fabricante',
        aviso: null,
      },
      rotulo: `${Math.round(ficha.corriente_A)} A · DECLARADA por ${ficha.fabricante} `
        + `(${ficha.documento}) · conductor a ${ficha.tempConductor_C} °C`,
      avisos: [...avisosFicha, ...avisos],
      contraste,
      sensibilidadViento: contraste.comparable ? sensibilidadDeViento({
        conductor, tempConductor_C: ficha.tempConductor_C, condiciones,
      }) : [],
    };
  }

  const falta = !conductor ? 'no hay conductor declarado en la línea'
    : temperatura.valor_C == null ? 'el conductor no declara material ni temperatura máxima'
    : !Number.isFinite(conductor.seccion_mm2) ? 'el conductor no declara sección'
    : !Number.isFinite(conductor.diametro_m) ? 'el conductor no declara diámetro'
    : null;

  if (falta) {
    return {
      ampacidad_A: null, vigente_A: null, vigenteRotulo: `no evaluable: ${falta}`,
      naturaleza: null, motivo: falta, condiciones, temperatura,
      fabricante: null, contraste: null,
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
    /** Sin ficha, registro y vigente son el mismo número: lo calculamos hoy. */
    vigente_A: A,
    vigenteRotulo: `${Math.round(A)} A — calculada para las condiciones de hoy`,
    /**
     * ⚠️ DERIVADA: la calculamos nosotros porque la línea NO declara la ficha
     * del fabricante. Desde `99 §ADR-098` esto es el camino SECUNDARIO, y se
     * dice en cada número que se publica.
     */
    naturaleza: 'derivada',
    motivo: null,
    fabricante: null,
    contraste: null,
    condiciones,
    temperatura,
    rotulo: `${Math.round(A)} A · CALCULADA (IEEE 738) · conductor a ${temperatura.rotulo} · ${condiciones.rotulo}`,
    avisos,
    sensibilidadViento: sensibilidadDeViento({
      conductor, tempConductor_C: temperatura.valor_C, condiciones,
    }),
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
