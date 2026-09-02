// ============================================================================
// exportar/gerencial.js — el informe para quien decide, no para quien calcula
// ----------------------------------------------------------------------------
// QUÉ ES, Y POR QUÉ NO ES «EL INFORME TÉCNICO RESUMIDO». Son dos documentos con
// dos preguntas distintas. El técnico contesta *cómo se calculó*. Éste contesta
// las cinco que se hacen en una reunión:
//
//   ¿Puedo firmar esto hoy? · ¿Qué mando a hacer el lunes? · ¿Qué queda abierto
//   aunque lo haga todo? · ¿Qué está esperando una firma MÍA? · ¿Dónde va a
//   apuntar la primera pregunta del interventor?
//
// LA REGLA QUE GOBIERNA EL ARCHIVO ENTERO: **aquí no se calcula NADA nuevo.**
// Cada cifra sale de una función que ya existe y ya está probada — `umbrales`,
// `cargas`, `cantidades`, `coherencia`, `calidad`, `limitacionesDeclaradas`. Lo
// único que hace este módulo es ORDENAR y TRADUCIR.
//
// No es pereza: es que el día que el informe técnico y el gerencial digan cosas
// distintas de la misma línea, la discusión deja de ser sobre el cálculo y pasa
// a ser sobre cuál de los dos papeles vale. Y esa discusión no la gana nadie.
// Por eso la sección de límites usa `limitacionesDeclaradas()` y el título
// canónico `TITULO_LIMITACIONES`, los mismos que el técnico.
//
// LO QUE ESTE DOCUMENTO TIENE PROHIBIDO, y está probado:
//   · **Un número de riesgo.** No hay probabilidad de falla, ni consecuencia en
//     pesos, ni histórico con qué calibrarlos. «Riesgo residual: medio» sería
//     una etiqueta inventada con apariencia de medición — más peligrosa que no
//     poner nada. Se entrega la lista de lo que queda abierto, que sí es cierta.
//   · **Precio o plazo.** No hay tarifas, ni rendimientos de cuadrilla, ni
//     catálogo. Una cifra ahí sería inventada.
//   · **Decir que la línea es segura.** El indicador que lo decidiría —el
//     despeje mínimo al terreno— sale «no evaluable» por todos los caminos hoy.
//     Un verde de gerencia sin ese dato afirma lo que nunca se midió.
//   · **Texto escrito por un modelo de lenguaje** (`99 §ADR-004`).
// ============================================================================
import {
  ESTILO, esc, escRico, n, parrafo, nota, tabla, lista, objeto,
  limitacionesDeclaradas, TITULO_LIMITACIONES, levSeguro,
} from './informe.js';
import { calidadLevantamiento } from './calidad.js';
import { UMBRAL_UTILIZACION_PCT } from '@lineas/nucleo/cargas';

const SIN_DATO = '—';

const cab = (t) => t.map((x) => `<th>${esc(x)}</th>`).join('');
const fila = (c) => `<tr>${c.map((x) => `<td>${x}</td>`).join('')}</tr>`;
const cuenta = (x) => (x === 0 ? 'ninguno' : String(x));

/** Los tres estados, con el vocabulario del sistema: ninguno se llama «incumple». */
const ESTADO = { cumple: 'cumple', revisar: 'pide revisión', no_evaluable: 'no evaluable' };

// ── 1 · UNA PÁGINA ──────────────────────────────────────────────────────────

/**
 * Si solo se lee una hoja antes de una reunión, ésta.
 *
 * EL TITULAR NO ES CUÁNTO CUMPLE: es cuántas cosas este informe todavía no
 * puede sostener. Un documento que abre celebrando lo que sí sabe y esconde al
 * final lo que no, se lee como una conclusión — y no lo es.
 */
function seccionUnaPagina({ indicadores, cargas, investigaciones, limites, lev }) {
  const porEstado = (e) => indicadores.filter((i) => i?.estado === e).length;
  const conVeredicto = cargas.filter((c) => c?.utilizacion_pct !== null && c?.utilizacion_pct !== undefined).length;
  const aRevisar = cargas.filter((c) => c?.estadoUtilizacion === 'revisar').length;
  const abiertos = investigaciones.filter((i) => i?.cerrada !== true).length;

  const pendientes = investigaciones.flatMap((i) => lista(i?.verificacionesPendientes))
    .filter((v) => objeto(v).estado !== 'recibido').length;

  return parrafo(
    `<b class="titular">${n(limites.length)} ${limites.length === 1 ? 'cosa que este informe todavía no puede sostener' : 'cosas que este informe todavía no puede sostener'}.</b> `
    + 'Es el titular a propósito: lo que un informe no puede afirmar decide si se puede firmar, y '
    + 'esconderlo al final lo convierte en una conclusión que nadie sacó.',
  )
  + tabla({
    leyenda: 'En qué estado está la línea, y en qué estado está este expediente',
    cabecera: cab(['Qué', 'Cuánto', 'Qué significa']),
    filas: [
      fila([`<b>Indicadores que cumplen</b>`, `${n(porEstado('cumple'))} de ${n(indicadores.length)}`,
        'el valor medido está dentro del umbral adoptado']),
      fila([`<b>Indicadores que piden revisión</b>`, `${cuenta(porEstado('revisar'))}`,
        'el sistema señala; el dictamen es de quien firma']),
      fila([`<b>Indicadores no evaluables</b>`, `${cuenta(porEstado('no_evaluable'))}`,
        '<b>falta el dato</b>: no es que estén bien, es que no se pueden mirar']),
      fila([`<b>Apoyos con veredicto de capacidad</b>`, `${n(conVeredicto)} de ${n(cargas.length)}`,
        conVeredicto === 0
          ? '<b>ninguno</b>: se sabe cuánta carga reciben, no cuánta aguantan'
          : `${cuenta(aRevisar)} de ellos piden revisión`]),
      fila([`<b>Expedientes de falla abiertos</b>`, `${cuenta(abiertos)}`,
        abiertos ? 'hay gente y equipo en campo' : 'ninguno sin cerrar']),
      fila([`<b>Verificaciones pendientes</b>`, `${cuenta(pendientes)}`,
        'datos pedidos y todavía no recibidos']),
      fila([`<b>Longitud de la línea</b>`,
        Number.isFinite(lev.longitud_m) ? `${n(lev.longitud_m)} m` : SIN_DATO,
        `${n(lev.nEstructuras)} estructuras · ${n(lev.nEmpalmes)} empalmes`]),
    ],
  })
  + nota('<b>¿Se puede firmar hoy?</b> Esa pregunta la contesta la sección de control documental, '
    + 'renglón por renglón. Este sistema no la contesta por usted: certifica el ingeniero que firma.');
}

// ── 2 · CONTROL DOCUMENTAL ──────────────────────────────────────────────────

/**
 * Qué falta EXACTAMENTE para poder firmar y entregar.
 *
 * Es el control documental de siempre, pero DERIVADO: el día que llegue el dato
 * la fila se pone en verde sola y nadie tiene que acordarse de editarla. Un
 * control documental que se edita a mano miente en cuanto alguien se distrae.
 */
function seccionControl(limites) {
  if (!limites.length) {
    return parrafo('<b>No hay ningún renglón abierto en el control documental.</b> '
      + 'Todo lo que este sistema sabe comprobar, está comprobado.');
  }

  // Se agrupa por ORIGEN, que es justo la columna del control documental y, de
  // paso, el destinatario del encargo.
  const grupos = new Map();
  for (const l of limites) {
    const k = objeto(l).origen || 'sin clasificar';
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(l);
  }

  return parrafo(
    'Cada renglón es algo que hoy impide sostener una afirmación. La columna <b>de dónde viene</b> '
    + 'dice a quién hay que pedírselo. <b>Ninguno se escribe a mano</b>: se derivan del estado real '
    + 'del expediente, así que el día que llegue el dato la fila desaparece sola.',
  )
  + tabla({
    leyenda: `Renglones abiertos: ${n(limites.length)}`,
    cabecera: cab(['De dónde viene', 'Qué falta', 'Por qué importa']),
    filas: [...grupos.entries()].flatMap(([origen, xs]) =>
      xs.map((l, i) => fila([
        i === 0 ? `<b>${esc(origen)}</b>` : '',
        escRico(objeto(l).titulo ?? SIN_DATO),
        escRico(objeto(l).detalle ?? ''),
      ]))),
  });
}

// ── 3 · COBERTURA ───────────────────────────────────────────────────────────

/**
 * Sobre cuántas estructuras se está hablando REALMENTE.
 *
 * Un verde sobre 3 de 40 apoyos no es un verde de línea, y ésa es la trampa más
 * común de un informe de activos: la cifra buena se calcula sobre lo medido y se
 * presenta como si fuera sobre el total.
 *
 * ⚠️ HUECO DECLARADO, no rellenado: el cruce entre `apoyosCubiertos` de cada
 * inspección y las estructuras del levantamiento **no existe como función**. El
 * espacio para esa fila está, y dice que falta — en vez de dar un porcentaje
 * redondo que nadie calculó.
 */
function seccionCobertura({ lev, cargas, indicadores, inspecciones }) {
  const conVeredicto = cargas.filter((c) => c?.utilizacion_pct !== null && c?.utilizacion_pct !== undefined).length;
  const tierra = indicadores.find((i) => String(i?.id ?? '').includes('tierra'));

  // ⚠️ LA FILA QUE IMPIDE LEER UN VERDE COMO UN VERDE. Un veredicto calculado
  // sobre una altura estimada a ojo se imprime igual que uno medido con cinta, y
  // esta es la única página que va a leer quien decide. Se cuenta sobre los que
  // SÍ tienen veredicto: un apoyo sin dictamen no engaña a nadie.
  const sobreSupuesto = cargas.filter(
    (c) => (c?.utilizacion_pct !== null && c?.utilizacion_pct !== undefined)
      && lista(c?.supuestosDelVeredicto).length);

  const filas = [
    fila(['<b>Estructuras del levantamiento</b>', `${n(lev.nEstructuras)}`,
      'el universo del que habla este informe']),
    fila(['<b>Con carga transversal calculada</b>', `${n(cargas.length)} de ${n(lev.nEstructuras)}`,
      'se sabe cuánto se les pide']),
    fila(['<b>Con veredicto de capacidad</b>', `${n(conVeredicto)} de ${n(cargas.length)}`,
      conVeredicto === 0
        ? '<b>ninguno</b>: nadie declaró carga de rotura, altura libre y punto de sujeción'
        : 'se sabe además cuánto aguantan']),
    fila(['<b>De esos veredictos, sobre dato SUPUESTO</b>',
      `${n(sobreSupuesto.length)} de ${n(conVeredicto)}`,
      sobreSupuesto.length === 0
        ? (conVeredicto === 0
          ? 'no hay veredictos todavía, así que tampoco los hay apoyados en supuestos'
          : 'ninguno: todos los datos que entraron declaran un origen verificable')
        : `<b>alguien los estimó a ojo</b> (${esc(sobreSupuesto.map((c) => String(c?.apoyo ?? '')).join(', '))}). `
          + 'El veredicto no cambia por eso, pero el número lo puso una persona, no una medición']),
  ];

  if (tierra) {
    filas.push(fila(['<b>Puesta a tierra</b>', Number.isFinite(tierra.valor) ? `${n(tierra.valor, 2)} ${esc(tierra.unidad ?? '')}` : SIN_DATO,
      escRico(String(tierra.criterio ?? '').slice(0, 160))]));
  }

  return parrafo(
    'Cuando este informe dice «la línea», conviene saber de cuántos apoyos lo dice y de cuántos no '
    + 'dice absolutamente nada.',
  )
  + tabla({ leyenda: 'Cobertura real', cabecera: cab(['Concepto', 'Cobertura', 'Qué significa']), filas })
  + nota(
    '<b>Cobertura de inspección: no se puede calcular todavía.</b> Cruzar los apoyos que alcanzó '
    + `cada inspección (${n(inspecciones.length)} registrada(s)) contra las estructuras del `
    + 'levantamiento no está construido. Se declara el hueco en vez de publicar un porcentaje que '
    + 'nadie ha calculado.',
  );
}

// ── 4 · COLA DE ATENCIÓN ────────────────────────────────────────────────────

/**
 * Por dónde empezar el lunes.
 *
 * ⚠️ EL ORDEN ES CRITERIO ADOPTADO, sin norma citada detrás, y la sección lo
 * dice con esas palabras. Ordenar riesgos es una decisión de gerencia, no un
 * resultado de cálculo — y una lista ordenada sin decirlo se lee como si el
 * cálculo hubiera decidido la prioridad.
 */
function seccionCola({ indicadores, cargas, coherencia, calidad }) {
  const filas = [];

  for (const c of cargas.filter((x) => x?.estadoUtilizacion === 'revisar')) {
    filas.push(fila([`<b>${esc(c.apoyo)}</b>`, 'apoyo por encima del umbral adoptado',
      Number.isFinite(c.margen_kgf)
        ? `margen ${n(c.margen_kgf)} kgf — en negativo, lo que sobra`
        : SIN_DATO]));
  }
  for (const c of cargas.filter((x) => x?.amplifica === true)) {
    filas.push(fila([`<b>${esc(c.apoyo)}</b>`,
      'el quiebre le deja MÁS carga que la propia tensión del conductor',
      Number.isFinite(c.factorAngulo) ? `×${n(c.factorAngulo, 3)} · es carga permanente, con viento o sin él` : SIN_DATO]));
  }
  for (const i of indicadores.filter((x) => x?.estado === 'revisar')) {
    filas.push(fila([`<b>${escRico(String(i.etiqueta ?? i.id ?? ''))}</b>`, 'indicador que pide revisión',
      escRico(String(i.criterio ?? '').slice(0, 160))]));
  }
  for (const h of coherencia.filter((x) => x?.severidad === 'advertencia')) {
    filas.push(fila([`<b>${escRico(String(h.apoyo ?? ''))}</b>`, 'incoherencia entre función y geometría',
      escRico(String(h.mensaje ?? '').slice(0, 200))]));
  }
  for (const h of calidad.filter((x) => x?.severidad === 'atencion')) {
    filas.push(fila([`<b>${escRico(String(h.titulo ?? ''))}</b>`, 'hallazgo del levantamiento',
      escRico(String(h.detalle ?? '').slice(0, 200))]));
  }

  if (!filas.length) {
    return parrafo('<b>No hay nada señalado para atender.</b> Ojo: con apoyos sin veredicto de '
      + 'capacidad, eso significa que no hay hallazgos <i>de lo que se pudo mirar</i> — no que la '
      + 'línea esté verificada.');
  }

  return parrafo(
    'Todo lo que está señalado hoy, en un solo sitio. <b>El orden en que se atienda es una decisión '
    + 'de gerencia, no un resultado de cálculo</b>: no hay norma que diga qué va primero, y este '
    + 'sistema no la inventa.',
  )
  + tabla({
    leyenda: `Señalado: ${n(filas.length)}`,
    cabecera: cab(['Dónde', 'Qué pasa', 'El número accionable']),
    filas,
  });
}

// ── 5 · RIESGO RESIDUAL ─────────────────────────────────────────────────────

/**
 * Lo que sigue abierto aunque se haga todo lo anterior.
 *
 * ES UNA LISTA, NO UN NÚMERO. En el repositorio no hay probabilidad de falla ni
 * consecuencia en pesos con qué multiplicar. «Riesgo residual: medio» sería una
 * etiqueta inventada con aspecto de medición, y eso es peor que no poner nada.
 */
function seccionResidual({ cargas, indicadores, investigaciones }) {
  const filas = [];

  const sinVeredicto = cargas.filter((c) => c?.utilizacion_pct === null || c?.utilizacion_pct === undefined);
  if (sinVeredicto.length) {
    filas.push(fila([`<b>${n(sinVeredicto.length)} apoyo(s) sin veredicto de capacidad</b>`,
      'Se sabe cuánta carga reciben; no cuánta aguantan. Ninguna intervención de campo lo cierra: '
      + 'lo cierra el INVENTARIO.']));
  }
  // Un veredicto sobre un dato que nadie verificó no es un hueco —hay cifra— y
  // por eso no aparece arriba; pero sigue abierto hasta que alguien mida, y en
  // este papel es donde quien decide lo tiene que ver.
  const sobreSupuesto = cargas.filter(
    (c) => (c?.utilizacion_pct !== null && c?.utilizacion_pct !== undefined)
      && lista(c?.supuestosDelVeredicto).length);
  if (sobreSupuesto.length) {
    filas.push(fila([`<b>${n(sobreSupuesto.length)} veredicto(s) calculados sobre datos SUPUESTOS</b>`,
      `Hay cifra y hay dictamen (${esc(sobreSupuesto.map((c) => String(c?.apoyo ?? '')).join(', '))}), `
      + 'pero uno de los datos que entró lo estimó una persona a ojo: no lo midió nadie. '
      + 'Se cierra midiendo en campo y volviendo a declarar el dato con su origen.']));
  }

  const extremos = cargas.filter((c) => c?.esExtremo === true);
  if (extremos.length) {
    filas.push(fila([`<b>${n(extremos.length)} apoyo(s) terminales fuera del eje transversal</b>`,
      'Su caso de carga dominante es el longitudinal, que se evalúa en su propia tabla.']));
  }
  for (const i of indicadores.filter((x) => x?.estado === 'no_evaluable')) {
    filas.push(fila([`<b>${escRico(String(i.etiqueta ?? i.id ?? ''))}: no evaluable</b>`,
      escRico(String(i.criterio ?? '').slice(0, 300))]));
  }
  const pend = investigaciones.flatMap((i) => lista(i?.verificacionesPendientes))
    .filter((v) => objeto(v).estado !== 'recibido');
  for (const v of pend) {
    filas.push(fila([`<b>Verificación pendiente</b>`, escRico(String(objeto(v).que ?? objeto(v).descripcion ?? ''))]));
  }

  const cabeza = parrafo(
    'Lo que queda abierto aunque se ejecute la lista completa. <b>Es una lista, no un número.</b> '
    + 'Este sistema no tiene probabilidad de falla, ni consecuencia en pesos, ni histórico con qué '
    + 'calibrarlos. Poner una etiqueta de nivel aquí sería inventar una medición — y una etiqueta '
    + 'inventada se cita después como si fuera dato.',
  );

  return filas.length
    ? cabeza + tabla({ leyenda: `Abierto: ${n(filas.length)}`, cabecera: cab(['Qué queda sin cerrar', 'Por qué']), filas })
    : cabeza + parrafo('No queda nada abierto de lo que este sistema sabe comprobar.');
}

// ── 6 · LAS DECISIONES QUE LE TOCAN A USTED ─────────────────────────────────

/**
 * La sección más corta y la que más mueve el proyecto: lo que está detenido
 * esperando una firma, no un cálculo ni un viaje a campo.
 */
function seccionDecisiones({ indicadores, hipotesis, cargas, umbralUtilizacion }) {
  const filas = [];

  // ⚠️ `.find()` a secas cogía el PRIMER indicador con «tiro» en el id — que en
  // una línea normal es el que cumple— y la decisión pendiente desaparecía del
  // informe sin que nada avisara. Se busca el que está SIN EVALUAR, que es el
  // que señala que falta una decisión.
  const tiro = indicadores.find((i) => String(i?.id ?? '').includes('tiro') && i?.estado === 'no_evaluable');
  if (tiro) {
    filas.push(fila(['<b>Qué tope de tiro rige</b>',
      'Conviven el 50 % clásico (costumbre heredada, sin norma citada) y el 25 % del RETIE sin carga '
      + 'externa. <b>Dan veredictos distintos sobre la misma línea.</b> El sistema calcula con uno y '
      + 'se niega a elegir.']));
  }
  if (objeto(hipotesis).congelada !== true) {
    filas.push(fila(['<b>Congelar la hipótesis de cálculo</b>',
      'Mientras no esté congelada, las cifras impresas pueden dejar de corresponder sin que nada avise.']));
  }
  // ⚠️ `despejeMinimo_m` es una TABLA por categoría de terreno —vía, cultivo,
  // zona habitada—, no un número suelto: un valor único para toda la línea no es
  // defendible y por eso el molde lo define como registro. Preguntar
  // `Number.isFinite()` por una tabla da SIEMPRE falso, así que esta decisión
  // aparecía como pendiente incluso con los cinco mínimos ya declarados y las
  // demás pantallas usándolos. Un pendiente que nunca se tacha enseña a ignorar
  // la lista entera, que es la sección más corta y la que más mueve el proyecto.
  // Se comprueba lo mismo que la pestaña Fundamentos: que la tabla tenga alguna
  // entrada (§ADR-052).
  const despejes = objeto(objeto(hipotesis).despejeMinimo_m);
  if (!Object.keys(despejes).length) {
    filas.push(fila(['<b>Declarar el despeje mínimo por categoría de terreno</b>',
      'Sin él, la verificación de seguridad al terreno queda bloqueada por completo.']));
  }
  filas.push(fila([`<b>El umbral de utilización adoptado (${n(umbralUtilizacion)} %)</b>`,
    'Es un criterio de este proyecto, no una norma citada. Cambiarlo cambia qué apoyos salen '
    + 'señalados en toda la línea.']));

  const deducidos = cargas.filter((c) => String(c?.funcionProcedencia ?? '').startsWith('deducido'));
  if (deducidos.length) {
    filas.push(fila([`<b>Confirmar la función de ${n(deducidos.length)} apoyo(s)</b>`,
      'Se dedujo de la geometría, no consta declarada. Es una propuesta pendiente de confirmación.']));
  }

  return parrafo('Esto no espera un cálculo ni un viaje a campo: espera una decisión suya.')
    + tabla({ leyenda: 'Detenido esperando una firma', cabecera: cab(['Decisión', 'Qué cambia']), filas });
}

// ── 7 · QUÉ HAY QUE IR A BUSCAR ─────────────────────────────────────────────

/**
 * Los encargos, agrupados por destinatario.
 *
 * SIN COLUMNA DE COSTO NI DE PLAZO. No hay tarifas, ni rendimientos de
 * cuadrilla, ni catálogo de precios. Una cifra ahí sería inventada, y en un
 * papel de gerencia una cifra inventada se convierte en compromiso.
 */
function seccionBuscar(limites) {
  const grupos = new Map();
  for (const l of limites) {
    const k = objeto(l).origen || 'sin clasificar';
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(objeto(l).titulo ?? '');
  }
  if (!grupos.size) return parrafo('No hay nada pendiente de conseguir.');

  return parrafo(
    'Cada grupo es un encargo distinto, y casi siempre a un destinatario distinto. '
    + '<b>No hay columna de costo ni de plazo</b>: este sistema no tiene tarifas ni rendimientos de '
    + 'cuadrilla, y una cifra ahí sería inventada — que en un papel de gerencia acaba convertida en '
    + 'compromiso.',
  )
  + tabla({
    leyenda: 'Encargos',
    cabecera: cab(['A quién / de dónde', 'Qué se pide', 'Qué desbloquea']),
    filas: [...grupos.entries()].map(([origen, xs]) => fila([
      `<b>${esc(origen)}</b>`,
      escRico(xs.join(' · ')),
      `${n(xs.length)} afirmación(es) que hoy no se pueden sostener`,
    ])),
  });
}

// ── 8 · LO QUE YA SE PUEDE COTIZAR ──────────────────────────────────────────

function seccionCotizable(cantidades) {
  const cont = lista(cantidades.continuas);
  const disc = lista(cantidades.discretas);
  const avisos = lista(cantidades.avisos);

  if (!cont.length && !disc.length) {
    return parrafo('No hay cantidades geométricas calculadas para esta línea.');
  }

  return parrafo(
    'Lo que ya está medido y se puede mover sin esperar ningún dato más. '
    + '<b>Son cantidades GEOMÉTRICAS, no una orden de compra</b>: no llevan desperdicio, ni reserva, '
    + 'ni precio.',
  )
  + (cont.length ? tabla({
    leyenda: 'Cantidades continuas',
    cabecera: cab(['Concepto', 'Cantidad', 'De dónde sale']),
    filas: cont.map((x) => fila([
      escRico(String(x.concepto ?? '')),
      Number.isFinite(x.cantidad) ? `${n(x.cantidad, 1)} ${esc(x.unidad ?? '')}` : SIN_DATO,
      escRico(String(x.base ?? x.procedencia ?? '')),
    ])),
  }) : '')
  + (disc.length ? tabla({
    leyenda: 'Cantidades discretas',
    cabecera: cab(['Concepto', 'Cantidad']),
    filas: disc.map((x) => fila([escRico(String(x.concepto ?? '')), `${n(x.cantidad)}`])),
  }) : '')
  + (avisos.length
    ? nota(`<b>No se pudo cuantificar:</b> ${escRico(avisos.map((a) => String(a.motivo ?? a)).join(' · '))}`)
    : '');
}

// ── 9 · RECOMENDACIONES POR HORIZONTE ───────────────────────────────────────

/**
 * ⚠️ LA ÚNICA SECCIÓN QUE NO SE DERIVA SOLA, y por tanto la única que ENVEJECE.
 *
 * Está escrito en el propio papel, porque un lector tiene derecho a saber qué
 * parte del documento se recalcula y qué parte es de una fecha concreta.
 *
 * Lo que la hace defendible: cada recomendación declara **de qué fila nació**.
 * Las que no nacen de una fila se rotulan «juicio del ingeniero», con nombre.
 * Un modelo de lenguaje tiene PROHIBIDO escribir aquí (`99 §ADR-004`).
 */
function seccionHorizontes(recomendaciones) {
  const porHorizonte = { semana: [], trimestre: [], anio: [] };
  for (const r of recomendaciones) {
    const h = objeto(r).horizonte;
    if (porHorizonte[h]) porHorizonte[h].push(objeto(r));
  }

  const cabeza = parrafo(
    '<b>Ésta es la única sección de este informe que no se calcula sola</b>, y por tanto la única '
    + 'que envejece: todo lo demás se vuelve a derivar cada vez que se genera el papel. Cada '
    + 'recomendación dice de qué fila nació; las que no nacen de una fila van rotuladas como juicio '
    + 'del ingeniero, con su nombre.',
  );

  if (!recomendaciones.length) {
    return cabeza + parrafo('<b>No se declaró ninguna recomendación al generar este informe.</b> '
      + 'El espacio queda vacío a propósito: rellenarlo con texto genérico sería fingir un criterio.');
  }

  const bloque = (clave, titulo) => (porHorizonte[clave].length
    ? tabla({
      leyenda: titulo,
      cabecera: cab(['Recomendación', 'De qué fila nació']),
      filas: porHorizonte[clave].map((r) => fila([
        escRico(String(r.que ?? '')),
        r.origenFila ? escRico(String(r.origenFila)) : '<b>juicio del ingeniero</b>'
          + (r.porQuien ? ` · ${esc(r.porQuien)}` : ''),
      ])),
    })
    : '');

  return cabeza
    + bloque('semana', 'Esta semana')
    + bloque('trimestre', 'Este trimestre')
    + bloque('anio', 'Este año');
}

// ── 10 · LO QUE ESTE INFORME NO DEMUESTRA ───────────────────────────────────

/**
 * MISMO DUEÑO DEL DATO QUE EL INFORME TÉCNICO, a propósito.
 *
 * Si el gerencial escribiera su propia lista de límites, algún día los dos
 * papeles dirían cosas distintas de la misma línea — y la discusión dejaría de
 * ser sobre el cálculo para pasar a ser sobre cuál de los dos vale.
 */
function seccionNoDemuestra(limites) {
  const fijas = [
    ['No dice que la línea sea segura',
      'El indicador que lo decidiría —el despeje mínimo de la flecha al terreno— sale no evaluable '
      + 'por todos los caminos hoy: faltan la cota del punto de sujeción, la distancia exigida por '
      + 'categoría de terreno y el perfil del terreno bajo cada vano, que ningún levantamiento de '
      + 'apoyos contiene porque el punto crítico casi nunca está bajo un apoyo.'],
    ['No dice que ningún apoyo esté sobrecargado',
      'El sistema sabe cuánta carga se le PIDE a cada estructura; no cuánta AGUANTA. No se estima: '
      + 'un apoyo que «cumple» contra una capacidad supuesta es exactamente el error que este '
      + 'sistema existe para no cometer.'],
    ['No cuantifica el riesgo residual',
      'No hay probabilidad de falla, ni consecuencia en pesos, ni horas de indisponibilidad, ni '
      + 'histórico con qué calibrarlas. Lo que sí hay es la lista completa y fechada de lo abierto.'],
    ['No le pone precio ni plazo a nada',
      'No existen tarifas, rendimientos de cuadrilla ni catálogo de precios en este sistema.'],
  ];

  return parrafo(
    'Aquí va a apuntar la primera pregunta del interventor, y está contestada por escrito antes de '
    + 'que la haga. <b>Esta lista es la misma que la del informe técnico</b>, derivada del mismo '
    + 'sitio: dos papeles de la misma línea no pueden decir cosas distintas.',
  )
  + tabla({
    leyenda: 'Lo que este informe NO demuestra',
    cabecera: cab(['No afirma', 'Por qué']),
    filas: fijas.map(([t, d]) => fila([`<b>${esc(t)}</b>`, escRico(d)])),
  })
  + (limites.length
    ? tabla({
      leyenda: `Y además, hoy: ${n(limites.length)} renglón(es) abiertos`,
      cabecera: cab(['Qué falta', 'De dónde viene']),
      filas: limites.map((l) => fila([escRico(objeto(l).titulo ?? ''), esc(objeto(l).origen ?? '')])),
    })
    : parrafo('Y hoy no hay ningún renglón abierto más allá de lo anterior.'));
}

// ── EL DOCUMENTO ────────────────────────────────────────────────────────────

/**
 * @param {Object} entrada  la MISMA que recibe `informeHtml`, más
 *   `meta.recomendaciones`: `[{horizonte:'semana'|'trimestre'|'anio', que, origenFila?, porQuien?}]`
 */
export function gerencialHtml(entrada) {
  const e = objeto(entrada);
  const linea = objeto(e.linea);
  const meta = objeto(e.meta);
  // El MISMO normalizador que el informe técnico, no otro: `calidadLevantamiento`
  // muere dentro de `lev.puntos.length` si le llega un levantamiento a medias, y
  // dos guardas distintas del mismo dato es como dos papeles de la misma línea
  // empiezan a discrepar. Se comprobó en ejecución: sin esto, un `lev` sin
  // `puntos` tumbaba el documento entero.
  const lev = levSeguro(e.lev);
  const indicadores = lista(e.indicadores);
  const cargas = lista(e.cargas);
  const investigaciones = lista(e.investigaciones);
  const cantidades = objeto(e.cantidades);
  const inspecciones = lista(e.inspecciones);
  const hipotesis = objeto(e.hipotesis);

  // Se DERIVAN aquí, igual que en el informe técnico, en vez de exigírselos a
  // quien llama: la pantalla no tiene por qué saber de qué función sale cada
  // cosa, y si lo tuviera que saber, un día se le olvidaría uno y la sección
  // saldría vacía sin que nada avisara.
  const calidad = lista(e.calidad ?? calidadLevantamiento(lev));
  const coherencia = lista(e.coherencia);
  const umbralUtilizacion = Number.isFinite(e.umbralUtilizacion_pct)
    ? e.umbralUtilizacion_pct : UMBRAL_UTILIZACION_PCT;

  // UN SOLO DUEÑO de la lista de límites: la misma función que usa el técnico.
  const limites = lista(limitacionesDeclaradas(e));

  const cuerpo = [
    { titulo: 'En qué estado está la línea, y este expediente', html: seccionUnaPagina({ indicadores, cargas, investigaciones, limites, lev }) },
    { titulo: 'Control documental: qué falta para poder firmar', html: seccionControl(limites) },
    { titulo: 'Cobertura: de cuántas estructuras habla esto', html: seccionCobertura({ lev, cargas, indicadores, inspecciones }) },
    { titulo: 'Cola de atención: por dónde empezar', html: seccionCola({ indicadores, cargas, coherencia, calidad }) },
    { titulo: 'Lo que sigue abierto aunque se haga todo', html: seccionResidual({ cargas, indicadores, investigaciones }) },
    { titulo: 'Las decisiones que le tocan a usted', html: seccionDecisiones({ indicadores, hipotesis, cargas, umbralUtilizacion }) },
    { titulo: 'Qué hay que ir a buscar', html: seccionBuscar(limites) },
    { titulo: 'Lo que ya se puede cotizar hoy', html: seccionCotizable(cantidades) },
    { titulo: 'Recomendaciones: esta semana · este trimestre · este año', html: seccionHorizontes(lista(meta.recomendaciones)) },
    { titulo: TITULO_LIMITACIONES, html: seccionNoDemuestra(limites), clase: 'limites' },
  ];

  const indice = cuerpo.map((s) => s.titulo);
  const secciones = cuerpo.map((s, i) =>
    `<section${s.clase ? ` class="${s.clase}"` : ''}>
  <h2>${i + 1}. ${esc(s.titulo)}</h2>
  ${s.html}
</section>`).join('\n');

  const titulo = `Informe gerencial · ${linea.codigo ?? 'línea sin identificar'}`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<style>${ESTILO}</style>
</head>
<body>
<main class="hoja">
<header class="portada">
  <p class="sello">INFORME GERENCIAL</p>
  <h1>${esc(linea.codigo ?? 'Línea sin identificar')}${linea.tensionNominal_kV != null ? ` · ${n(linea.tensionNominal_kV)} kV` : ''}</h1>
  <p class="sub">${esc(linea.nombre ?? '')}</p>
  ${meta.generadoEn ? `<p class="nota">Generado el ${esc(meta.generadoEn)}. Las cifras se derivan cada vez que se genera; solo las recomendaciones llevan fecha.</p>` : ''}
  <ol class="indice">${indice.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
</header>
${secciones}
<p class="pie">${esc(linea.codigo ?? 'Línea sin identificar')} · informe gerencial generado por la
plataforma de mantenimiento de líneas AT. Este documento no certifica nada por sí mismo: certifica
el ingeniero que lo firma. El detalle del cálculo está en el informe técnico de la misma línea.<br>
Motor de cálculo @lineas/nucleo: ${meta.versionNucleo ?? meta.versionMotor
  ? `v${esc(meta.versionNucleo ?? meta.versionMotor)}`
  : '<b>versión NO declarada</b> — este informe no es reproducible'}.</p>
</main>
</body>
</html>`;
}
