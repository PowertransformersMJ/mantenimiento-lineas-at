// ============================================================================
// nucleo/cantidades.js — la parte GEOMÉTRICA de la memoria de cantidades (BOM)
// ----------------------------------------------------------------------------
// Función PURA: sin DOM, sin red, sin estado. Entran números, salen números.
//
// POR QUÉ EXISTE
// Alguien COMPRA con este listado. Un BOM inventado es peor que no tener BOM:
// si el número sale de un supuesto silencioso, el error se descubre con el
// carrete ya en la vía, con la cuadrilla parada y el conductor comprado corto.
// Por eso aquí solo se cuantifica lo que se deduce de la GEOMETRÍA levantada;
// todo lo demás sale por `avisos` diciendo qué falta y por qué.
//
// LA REGLA QUE GOBIERNA ESTE ARCHIVO
// Si un renglón no se puede calcular con los datos que llegaron, NO se rellena
// con un valor plausible: se omite del listado y se declara en `avisos`. Una
// casilla vacía se ve; un número inventado no.
//
// LO QUE ESTE MÓDULO **NO** HACE
// · No calcula la catenaria: eso es de `mecanica.js`. Aquí se CONSUME la
//   longitud ya calculada. Así el núcleo no se enreda consigo mismo y el
//   integrador decide si usa catenaria exacta o parábola.
// · No redondea al alza ni agrega desperdicio no declarado. Redondear un
//   carrete es una decisión de COMPRA, no de geometría: se hace después, con
//   nombre y firma.
// · No estima nada que dependa de mirar el apoyo (crucetas, retenidas,
//   herrajes, aisladores, puesta a tierra). Eso se captura en campo.
//
// Ver docs/40-DOMINIO-LINEAS-AT.md (geometría de la línea) y contratos/src.
// ============================================================================

// ── Catálogos espejo del contrato ───────────────────────────────────────────

/**
 * Las seis funciones estructurales del contrato, EN ORDEN de catálogo.
 *
 * ⚠️ Esta lista debe ser IDÉNTICA al enum `FuncionEstructural` de
 * `contratos/src/activos.ts`. El núcleo no importa el contrato (para seguir
 * puro y portable), así que la coincidencia NO se confía a la memoria: la
 * vigila una prueba de oro que lee el contrato como texto y se pone roja si
 * divergen. Si aquí faltara una función, sus apoyos caerían en «función fuera
 * de catálogo» y el comprador vería un renglón de menos sin saber por qué.
 */
const FUNCIONES_ESTRUCTURALES = Object.freeze([
  'Suspensión',
  'Suspensión angular',
  'Ángulo',
  'Retención / anclaje',
  'Terminal',
  'Derivación',
]);

/**
 * Procedencias válidas — espejo del enum `Procedencia` de
 * `contratos/src/comunes.ts`. En un BOM la procedencia no es adorno: distingue
 * el renglón que se puede firmar del que solo se puede cotizar. También la
 * vigila una prueba de oro.
 */
const CAMPO = 'levantamiento_campo';
const GEOMETRIA = 'deducido_geometria';
const SUPUESTO = 'supuesto';

/**
 * Lo que NO se estima nunca desde un escritorio, con el motivo real de por qué.
 * Cada uno depende de mirar el apoyo: sin ese vistazo, cualquier número es una
 * adivinanza con apariencia de dato.
 */
const REQUIERE_CAMPO = Object.freeze([
  ['Crucetas',
   'depende del tipo de apoyo, la altura y la disposición de fases de CADA estructura, que no se deduce de las coordenadas'],
  ['Retenidas y anclas',
   'dependen del terreno y del esfuerzo real en cada apoyo de ángulo o retención; dos apoyos con la misma deflexión pueden llevar retenidas distintas'],
  ['Herrajes y grapas',
   'el conjunto varía por tipo de cadena, de apoyo y de conductor; contar «uno por fase» esconde los dobles, los antivibratorios y los de anclaje'],
  ['Aisladores / cadenas',
   'el número de unidades por cadena lo fija el nivel de contaminación y la tensión, y se verifica cadena por cadena en la inspección'],
  ['Puestas a tierra',
   'número de varillas y longitud de bajante se miden en sitio; la resistencia medida decide si hay que agregar'],
]);

// ── Utilidades de presentación del cálculo ──────────────────────────────────

/**
 * Formato español, DETERMINISTA (no usa `toLocaleString`, que depende del ICU
 * de cada máquina y haría que el mismo cálculo se lea distinto en el portátil
 * del ingeniero y en el servidor).
 */
function fmt(x, dec = 2) {
  const s = Math.abs(x).toFixed(dec);
  const [ent, frac] = s.split('.');
  const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (x < 0 ? '-' : '') + miles + (frac ? ',' + frac : '');
}

const esNumero = (x) => typeof x === 'number' && Number.isFinite(x);
const esEnteroPositivo = (x) => Number.isInteger(x) && x > 0;

// ── Normalización de los vanos ──────────────────────────────────────────────

/**
 * Un elemento de `vanos_m` puede llegar de dos formas:
 *
 *   1. `250.4`                                   → solo el vano horizontal
 *   2. `{ vano_m: 250.4, longitudConductor_m: 250.9 }` → vano + longitud REAL
 *      del conductor en ese vano, ya calculada con `mecanica.longitudCatenaria`
 *
 * La forma 2 es la buena: el conductor no va recto, va colgado, y la diferencia
 * es real —el metro que falta se paga en el empalme que no estaba previsto—.
 * La forma 1 solo sirve si el llamador DECLARA un `factorFlecha_pct`; sin él,
 * ese vano no aporta longitud y el conductor entero se queda sin cuantificar.
 */
function normalizarVanos(vanos_m, factorFlecha_pct) {
  const usaFactor = esNumero(factorFlecha_pct) && factorFlecha_pct >= 0;
  const factor = usaFactor ? 1 + factorFlecha_pct / 100 : null;

  const validos = [];
  let descartados = 0;   // basura: negativos, cero, texto, null
  let sinLongitud = 0;   // vano bueno, pero nadie dijo cuánto cuelga
  let incoherentes = 0;  // longitud MENOR que el vano: físicamente imposible
  let porCatenaria = 0;
  let porFactor = 0;

  for (const bruto of vanos_m ?? []) {
    const esObjeto = bruto !== null && typeof bruto === 'object';
    const vano = esObjeto ? bruto.vano_m : bruto;

    if (!esNumero(vano) || vano <= 0) { descartados++; continue; }

    const declarada = esObjeto ? bruto.longitudConductor_m : undefined;

    if (esNumero(declarada)) {
      // La cuerda es la distancia más corta entre dos puntos: una longitud de
      // conductor menor que su vano es un dato corrupto, no un conductor tenso.
      // Aceptarlo haría comprar de menos, que es justo el error caro.
      if (declarada < vano) { incoherentes++; continue; }
      validos.push({ vano_m: vano, longitud_m: declarada, exacta: true });
      porCatenaria++;
      continue;
    }

    if (factor !== null) {
      validos.push({ vano_m: vano, longitud_m: vano * factor, exacta: false });
      porFactor++;
      continue;
    }

    validos.push({ vano_m: vano, longitud_m: null, exacta: false });
    sinLongitud++;
  }

  return { validos, descartados, sinLongitud, incoherentes, porCatenaria, porFactor };
}

// ── Conteo de apoyos ────────────────────────────────────────────────────────

/**
 * Cuenta los puntos por lo que SON, no por lo que parecen.
 *
 * ⚠️ El filtro que decide todo: un empalme puede estar a mitad de vano y no
 * sostiene nada; un punto de referencia es una marca del levantamiento. Meterlos
 * en el conteo de apoyos hace comprar estructuras que nadie va a plantar.
 */
function contarPuntos(apoyos) {
  const porFuncion = new Map();      // función → { n, supuesta }
  let empalmes = 0;
  let referencias = 0;
  let sinFuncion = 0;
  const fueraDeCatalogo = new Map(); // texto recibido → veces

  for (const a of apoyos ?? []) {
    if (a === null || typeof a !== 'object') { sinFuncion++; continue; }

    // El contrato da `Estructura` por defecto: un punto sin tipo se levantó
    // como estructura mientras nadie diga lo contrario.
    const tipo = a.tipoPunto ?? 'Estructura';
    if (tipo === 'Empalme') { empalmes++; continue; }
    if (tipo === 'Punto de referencia') { referencias++; continue; }

    const f = a.funcionEstructural;
    if (typeof f !== 'string' || f === '') { sinFuncion++; continue; }
    if (!FUNCIONES_ESTRUCTURALES.includes(f)) {
      fueraDeCatalogo.set(f, (fueraDeCatalogo.get(f) ?? 0) + 1);
      continue;
    }

    const acc = porFuncion.get(f) ?? { n: 0, supuesta: false };
    acc.n++;
    // Una sola función supuesta ensucia el renglón entero: se cuenta igual,
    // pero el que compra ve que ese grupo no está confirmado por nadie.
    if (a.funcionProcedencia === SUPUESTO) acc.supuesta = true;
    porFuncion.set(f, acc);
  }

  return { porFuncion, empalmes, referencias, sinFuncion, fueraDeCatalogo };
}

// ── Función pública ─────────────────────────────────────────────────────────

/**
 * Memoria de cantidades geométrica de una línea.
 *
 * @param {Object}   entrada
 * @param {Array<number|{vano_m:number, longitudConductor_m?:number}>} entrada.vanos_m
 *        Vanos entre ESTRUCTURAS, en metros y en orden. Ver `normalizarVanos`.
 * @param {Array<{tipoPunto?:string, funcionEstructural?:string, funcionProcedencia?:string}>} entrada.apoyos
 * @param {Object}   entrada.conductor
 * @param {number}  [entrada.conductor.conductoresPorCircuito] forma directa y preferida
 * @param {number}  [entrada.conductor.fases]                  alternativa: fases…
 * @param {number}  [entrada.conductor.subconductoresPorFase]  …y tamaño del haz
 * @param {string}  [entrada.conductor.codigo] p. ej. "Darien" — solo para rotular
 * @param {number}   entrada.circuitos            circuitos que van por los apoyos
 * @param {number}  [entrada.factorFlecha_pct]    sobrelongitud por flecha, si no
 *                                                llega la catenaria vano a vano
 * @param {number}  [entrada.factorReserva_pct]   reserva de tendido DECLARADA
 * @param {Object}  [entrada.guarda]              cable de guarda, si lo hay
 * @param {number}  [entrada.guarda.cables]       n.º de hilos de guarda (0 = no lleva)
 * @param {number}  [entrada.guarda.factorFlecha_pct] su PROPIA flecha, no la de la fase
 *
 * @returns {{
 *   continuas: {concepto:string, cantidad:number, unidad:string, base:string, procedencia:string}[],
 *   discretas: {concepto:string, cantidad:number, unidad:string, procedencia:string}[],
 *   avisos:    {concepto:string, motivo:string}[],
 * }}
 */
export function cantidadesGeometricas(entrada) {
  const continuas = [];
  const discretas = [];
  const avisos = [];
  const avisar = (concepto, motivo) => avisos.push({ concepto, motivo });

  if (entrada === null || typeof entrada !== 'object') {
    avisar('Memoria de cantidades',
      'no llegó ninguna entrada: sin geometría no hay nada que cuantificar.');
    return { continuas, discretas, avisos };
  }

  const {
    vanos_m, apoyos, conductor, circuitos,
    factorFlecha_pct, factorReserva_pct, guarda,
  } = entrada;

  const V = normalizarVanos(vanos_m, factorFlecha_pct);
  const P = contarPuntos(apoyos);

  // ══ 1 · Cantidades continuas (lo que se mide en metros) ═══════════════════

  const nVanos = V.validos.length;
  const ejeTotal_m = V.validos.reduce((s, v) => s + v.vano_m, 0);

  if (V.descartados) {
    avisar('Vanos ilegibles',
      `${V.descartados} vano(s) llegaron vacíos, negativos o no numéricos y quedaron FUERA de todo el cálculo. ` +
      'La longitud total que se lee abajo es más corta que la línea real en esa misma medida.');
  }
  if (V.incoherentes) {
    avisar('Vanos con longitud imposible',
      `${V.incoherentes} vano(s) traían una longitud de conductor MENOR que el propio vano. ` +
      'El conductor cuelga: nunca puede medir menos que la recta entre apoyos. Se descartaron por dato corrupto, no se "corrigieron".');
  }

  if (nVanos > 0) {
    // Se publica el eje para que cualquiera pueda cruzarlo con el plano — y
    // se rotula bien fuerte que NO es el conductor a comprar, porque un eje
    // sumado por error en la orden de compra deja la línea sin cable.
    continuas.push({
      concepto: 'Longitud de línea (eje horizontal) — NO es el conductor a comprar',
      cantidad: ejeTotal_m,
      unidad: 'm',
      base: `suma de ${nVanos} vano(s) entre estructuras, sin flecha, sin circuitos y sin reserva`,
      procedencia: GEOMETRIA,
    });
  } else {
    avisar('Longitud de línea',
      'no llegó ningún vano válido: sin vanos no hay geometría de la que deducir cantidad alguna.');
  }

  // ── Conductores por circuito: el multiplicador que nadie debe adivinar ────
  let porCircuito = null;
  let baseCircuito = '';
  const c = conductor && typeof conductor === 'object' ? conductor : {};

  if (esEnteroPositivo(c.conductoresPorCircuito)) {
    porCircuito = c.conductoresPorCircuito;
    baseCircuito = `${porCircuito} conductor(es)/circuito (declarado)`;
  } else if (esEnteroPositivo(c.fases)) {
    if (esEnteroPositivo(c.subconductoresPorFase)) {
      porCircuito = c.fases * c.subconductoresPorFase;
      baseCircuito = `${c.fases} fase(s) × ${c.subconductoresPorFase} subconductor(es)/fase = ${porCircuito}`;
    } else {
      // Asumir «haz simple» sería acertar casi siempre y fallar catastrófico
      // el día que no: un haz doble DUPLICA el conductor a comprar. No se asume.
      avisar('Subconductores por fase',
        `se declararon ${c.fases} fase(s) pero no si cada una es conductor simple o en haz. ` +
        'Un haz doble duplica el cable a comprar y un triple lo triplica: no se supone, se declara.');
    }
  } else {
    avisar('Conductores por circuito',
      'no se declaró el número de fases ni los conductores por circuito. Es el multiplicador de TODA la cantidad de conductor: sin él no se cuantifica.');
  }

  // ── Circuitos ────────────────────────────────────────────────────────────
  let nCircuitos = null;
  if (esEnteroPositivo(circuitos)) {
    nCircuitos = circuitos;
  } else {
    // El contrato tiene `circuitos: 1` por defecto, pero un defecto sirve para
    // dibujar, no para comprar: si la línea era doble circuito, el silencio se
    // paga a mitad del cable.
    avisar('Circuitos',
      'no se declaró cuántos circuitos van por los apoyos. Aquí no se aplica el valor por defecto del contrato: en una línea de doble circuito ese defecto compraría la mitad del conductor.');
  }

  // ── Reserva de tendido ───────────────────────────────────────────────────
  let reserva = 1;
  let baseReserva = 'sin reserva (cantidad NETA)';
  if (esNumero(factorReserva_pct) && factorReserva_pct >= 0) {
    reserva = 1 + factorReserva_pct / 100;
    baseReserva = `× ${fmt(reserva, 3)} (reserva declarada ${fmt(factorReserva_pct, 1)} %)`;
  } else {
    // Aquí sí se entrega número: la longitud NETA es un dato real. Lo que falta
    // —el desperdicio— se declara para que nadie compre exactamente lo justo.
    avisar('Reserva de tendido',
      'no se declaró porcentaje de reserva. La cantidad de conductor es NETA: no incluye colas de tendido, empalmes, flechado ni desperdicio de carrete.');
  }

  // ── Conductor de fase ────────────────────────────────────────────────────
  if (V.sinLongitud > 0) {
    // Todo o nada: publicar solo los vanos con longitud daría un total que se
    // ve completo y compra corto. El faltante se dice con su número.
    avisar('Conductor de fase',
      `${V.sinLongitud} de ${nVanos} vano(s) no traen longitud real de conductor y no se declaró \`factorFlecha_pct\`. ` +
      'Sumar los vanos rectos daría MENOS conductor del que hace falta, así que no se publica cantidad: se declara el faltante.');
  } else if (nVanos > 0 && porCircuito !== null && nCircuitos !== null) {
    const longitudTendido_m = V.validos.reduce((s, v) => s + v.longitud_m, 0);
    const exacta = V.porFactor === 0;
    const origen = exacta
      ? `Σ longitud de catenaria de ${nVanos} vano(s)`
      : `${V.porCatenaria} vano(s) por catenaria + ${V.porFactor} por factor de flecha declarado (${fmt(factorFlecha_pct ?? 0, 2)} %)`;

    continuas.push({
      concepto: `Conductor de fase${c.codigo ? ` (${c.codigo})` : ''}`,
      cantidad: longitudTendido_m * porCircuito * nCircuitos * reserva,
      unidad: 'm',
      base: `${origen} = ${fmt(longitudTendido_m)} m ` +
            `(eje ${fmt(ejeTotal_m)} m) × ${baseCircuito} × ${nCircuitos} circuito(s) ${baseReserva}`,
      // Un solo vano estimado por factor de flecha baja TODO el renglón a
      // «supuesto»: el comprador tiene que saber que ese total no es medido.
      procedencia: exacta ? GEOMETRIA : SUPUESTO,
    });
  }

  // ── Cable de guarda ──────────────────────────────────────────────────────
  const g = guarda && typeof guarda === 'object' ? guarda : null;
  if (!g || !Number.isInteger(g.cables) || g.cables < 0) {
    avisar('Cable de guarda',
      'no se declaró si la línea lleva cable(s) de guarda ni cuántos. No se deduce de la geometría: hay líneas de la misma tensión con dos, con uno y sin ninguno.');
  } else if (g.cables > 0) {
    if (esNumero(g.factorFlecha_pct) && g.factorFlecha_pct >= 0 && nVanos > 0) {
      const fg = 1 + g.factorFlecha_pct / 100;
      continuas.push({
        concepto: 'Cable de guarda',
        cantidad: ejeTotal_m * fg * g.cables * reserva,
        unidad: 'm',
        base: `eje ${fmt(ejeTotal_m)} m × ${fmt(fg, 4)} (flecha propia ${fmt(g.factorFlecha_pct, 2)} %) × ${g.cables} cable(s) ${baseReserva}`,
        procedencia: SUPUESTO,
      });
    } else {
      // Reusar la flecha de la fase sería cómodo y falso: el cable de guarda va
      // más tenso, cuelga menos y su longitud real es OTRA.
      avisar('Cable de guarda',
        `se declararon ${g.cables} cable(s) de guarda pero no su flecha propia. El de guarda va más tenso que la fase: tomar prestada la sobrelongitud del conductor daría un número que no es de esta línea.`);
    }
  }

  // ══ 2 · Cantidades discretas (lo que se cuenta de a uno) ══════════════════

  // En orden de catálogo, y solo lo que existe: un renglón en cero es ruido en
  // una orden de compra. Tampoco se publica un «total de apoyos»: sumado junto
  // a los renglones por función, duplicaría el pedido de estructuras.
  for (const f of FUNCIONES_ESTRUCTURALES) {
    const acc = P.porFuncion.get(f);
    if (!acc) continue;
    discretas.push({
      concepto: `Apoyos — función ${f}`,
      cantidad: acc.n,
      unidad: 'un',
      procedencia: acc.supuesta ? SUPUESTO : CAMPO,
    });
  }

  if (P.empalmes > 0) {
    // Va rotulado en el propio concepto porque el rótulo viaja con el dato:
    // en la hoja impresa nadie ve el comentario de este archivo.
    discretas.push({
      concepto: 'Empalmes de conductor — NO son apoyos, no sostienen conductor',
      cantidad: P.empalmes,
      unidad: 'un',
      procedencia: CAMPO,
    });
  }

  if (P.referencias > 0) {
    avisar('Puntos de referencia',
      `${P.referencias} punto(s) de referencia quedaron fuera del listado: son marcas del levantamiento, no material ni estructura. Se dice para que el conteo cuadre con el archivo del GPS.`);
  }
  if (P.sinFuncion > 0) {
    avisar('Apoyos sin función estructural',
      `${P.sinFuncion} apoyo(s) no declaran función. No se reparten «al más común»: la función decide el tipo de estructura, la cadena y el herraje, es decir el precio.`);
  }
  for (const [texto, veces] of P.fueraDeCatalogo) {
    avisar('Función estructural fuera de catálogo',
      `${veces} apoyo(s) traen «${texto}», que no está en el catálogo del contrato. Quedan sin contar: un texto libre no se puede comprar.`);
  }

  // ── Coherencia entre estructuras y vanos ─────────────────────────────────
  const estructuras = [...P.porFuncion.values()].reduce((s, x) => s + x.n, 0);
  if (estructuras > 0 && nVanos > 0 && nVanos !== estructuras - 1) {
    avisar('Coherencia estructuras / vanos',
      `hay ${estructuras} estructura(s) contadas y ${nVanos} vano(s) válidos; en una línea abierta deberían ser ${estructuras - 1}. ` +
      'O falta un punto en el levantamiento o sobra uno en el conteo: hasta aclararlo, ninguna cantidad de arriba es firmable.');
  }

  // ══ 3 · Lo que no se estima desde el escritorio ═══════════════════════════
  for (const [concepto, porque] of REQUIERE_CAMPO) {
    avisar(concepto, `requiere captura en campo: ${porque}.`);
  }

  return { continuas, discretas, avisos };
}
