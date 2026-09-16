// ============================================================================
// construir-apoyos.mjs — del fixture del levantamiento a los documentos
// ----------------------------------------------------------------------------
// Módulo PURO: no importa firebase-admin, no toca la red, no lee credenciales.
// Es la lógica que antes vivía dentro de `sembrar.mjs` y que por eso era
// IMPOSIBLE de probar: aquel script aborta nada más cargarse si no encuentra
// GOOGLE_APPLICATION_CREDENTIALS, así que ninguna prueba podía ni importarlo.
// Aquí entra el fixture y salen los documentos; escribir en la base es otra
// cosa y vive en otro sitio.
//
// LAS TRES DECISIONES QUE ESTE ARCHIVO HACE EXPLÍCITAS
//
// 1. IDENTIDAD POR NOMBRE CANÓNICO (ver `identidad.mjs`). El id no depende de
//    dónde caiga el punto en la lista.
//
// 2. ORDEN POR BISECCIÓN. Un punto que se intercala recibe el orden que hay
//    ENTRE sus vecinos —(2+3)/2 = 2,5— en vez de correr a todos los que van
//    detrás. Correrlos obligaría a reescribir 26 documentos de producción para
//    registrar un hecho que no cambió, y —lo grave— movería 64 de las 99 fotos
//    de apoyo, porque `subir-evidencias.mjs` resuelve la foto por `orden`. Y
//    como la ficha de evidencia se escribe con `merge`, el re-run PISARÍA la
//    asignación correcta sin dejar rastro. La bisección no renumera nada.
//    (En IEEE-754, (2+3)/2 = 2,5 es exacto, y quedan ~50 subdivisiones
//    sucesivas antes de agotar la mantisa: sobra para varias vidas de línea.)
//
// 3. NADA POR DEFECTO EN NINGÚN PUNTO. La función estructural no se adivina:
//    si no viene declarada, la construcción FALLA. El defecto silencioso
//    anterior era 'Suspensión', y sembrar un pórtico de subestación como
//    suspensión cambia el corte de tramos de tensión y con él el cálculo
//    mecánico — un número que se firma, cambiado sin que nadie lo pida.
//    Hasta el 2026-09-16 el levantamiento BASE todavía caía a 'Suspensión':
//    medido ese día, ninguno de los 26 puntos de LN-627 lo usaba, así que
//    quitarlo no cambia nada de lo sembrado y cierra la puerta a una línea
//    nueva que llegue de un GPS pelado.
//
// 4. LA LÍNEA TAMPOCO SE PRESTA. Tensión, circuitos, conductor e hipótesis
//    salen de la FICHA DE LÍNEA de la bóveda (`<CODIGO>-linea.json`), no de
//    valores escritos a mano en el sembrador. Ver `construirLinea`.
// ============================================================================
import { CANONICOS, ORG_POR_DEFECTO, idDePunto, idDeSemilla, leerRegistro, verificarRegistro } from './identidad.mjs';

/**
 * LO QUE UN DOCUMENTO YA ESCRITO NO DEJA QUE NADIE LE PISE.
 *
 * `revision` es el CERROJO con el que la aplicación impide que dos personas se
 * pisen al guardar: la pantalla trae la revisión que leyó y la base la compara
 * antes de escribir. El sembrador la ponía a 0 en cada pasada, así que sembrar
 * sobre un apoyo que alguien ya había editado dejaba el siguiente guardado
 * fallando con «otra persona guardó cambios» **sin que hubiera ninguna otra
 * persona** — y un cerrojo que da alarmas falsas se acaba desactivando. Peor
 * todavía: una revisión que va HACIA ATRÁS deja de detectar el choque de verdad.
 *
 * `creadoEn` y `creadoPor` son la partida de nacimiento del documento. Volver a
 * sellarlas con la fecha de hoy y con «sembrador» borra que ese apoyo lo creó
 * una persona en julio. En este sistema una corrección es un HECHO FECHADO,
 * nunca una sobrescritura (`CLAUDE.md §3.1`).
 *
 * @see `99 §ADR-033`
 */
export const CAMPOS_QUE_NO_SE_RESIEMBRAN = Object.freeze(['revision', 'creadoEn', 'creadoPor']);

/**
 * El documento tal como hay que escribirlo cuando YA existe uno en la base.
 *
 * Se quitan los campos de historia y se estampa quién lo tocó y cuándo — que es
 * lo que de verdad hizo el sembrador. Si el documento NO existe, va entero: ahí
 * `revision: 0` y la partida de nacimiento son correctas y hacen falta.
 *
 * PURA a propósito: decide qué se escribe sin saber hablar con Firestore, y por
 * eso se puede probar sin llave de administrador — que es justo lo que hasta hoy
 * hacía imposible probar esta regla.
 *
 * @param {Object} doc     el documento que produjo el sembrador
 * @param {boolean} existe si la base ya tiene uno con ese id
 * @param {{ahora:string, quien?:string}} opciones
 */
export function documentoParaResembrar(doc, existe, { ahora, quien = 'sembrador' } = {}) {
  if (!existe) return doc;
  const salida = {};
  for (const [k, v] of Object.entries(doc ?? {})) {
    if (!CAMPOS_QUE_NO_SE_RESIEMBRAN.includes(k)) salida[k] = v;
  }
  return { ...salida, actualizadoEn: ahora, actualizadoPor: quien };
}

/**
 * Funciones estructurales admitidas. Es una lista blanca a propósito: un valor
 * que no esté aquí es un error del fixture, no un caso a interpretar.
 */
export const FUNCIONES = {
  'Terminal': 'Terminal',
  'Retención / anclaje': 'Retención / anclaje',
  'Ángulo': 'Ángulo',
  'Suspensión angular': 'Suspensión angular',
  'Suspensión': 'Suspensión',
};

/**
 * De qué ROL del fixture sale qué tipo de punto.
 *
 * Antes esto se adivinaba con /EMP/i sobre el nombre del GPS. Funcionaba de
 * casualidad: el código del pórtico NO contiene la subcadena "EMP" y por eso
 * no se clasificó como empalme. Con otro código de subestación un pórtico
 * entraría como empalme y desaparecería del cálculo de vanos, en silencio. El
 * regex se conserva SOLO como respaldo para el fixture de julio, que es un
 * archivo congelado y no tiene campo `rol`.
 */
const TIPO_POR_ROL = {
  'empalme': 'Empalme',
  'portico_subestacion': 'Estructura',
  'estructura': 'Estructura',
};

/** Un nombre canónico es la CLAVE del id: solo ASCII imprimible (una tilde en NFC vs NFD cambia el sha256). */
const ASCII_IMPRIMIBLE = /^[\x20-\x7E]+$/;

const documentoBase = (id, org, ahora, creadoPor, extra = {}) => ({
  id, orgId: org, creadoEn: ahora, creadoPor, revision: 0, ...extra,
});

/**
 * Construye los documentos de apoyo de una línea.
 *
 * @param {string} codigoLinea       p.ej. 'LN-627'
 * @param {object[]} puntosJulio     el levantamiento CONGELADO (fixture de julio)
 * @param {object[]} puntosAmpliacion  puntos añadidos después, con `estado`
 * @returns {{apoyos, ignorados, semillasNuevas, ordenesNoEnteros, colisiones}}
 */
export function construirApoyos(codigoLinea, puntosJulio, puntosAmpliacion = [], opciones = {}) {
  const {
    org = ORG_POR_DEFECTO,
    ahora = new Date().toISOString(),
    creadoPor = 'sembrador',
    registro = leerRegistro(),
    canonicos = CANONICOS[codigoLinea],
    lineaId = idDeSemilla(codigoLinea, 'linea', org),
  } = opciones;

  if (!Array.isArray(canonicos) || !canonicos.length) {
    throw new Error(`No hay nombres canónicos para ${codigoLinea}. La identidad sale del nombre, así que sin lista no se siembra nada.`);
  }
  if (canonicos.length !== puntosJulio.length) {
    throw new Error(
      `El levantamiento base trae ${puntosJulio.length} puntos y la lista canónica tiene ${canonicos.length}. ` +
      'No se resuelve por posición «lo que se pueda»: un punto sin nombre canónico no tiene identidad.'
    );
  }

  // ── Nada por defecto: ver la decisión 3 de la cabecera ───────────────────
  // Se revisan TODOS antes de construir nada y se nombran todos los que fallan,
  // no solo el primero: quien prepara el levantamiento tiene que poder
  // completarlo de una vez, no a golpe de corrida.
  const sinFuncion = puntosJulio
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !FUNCIONES[p.funcionEstructural]);
  if (sinFuncion.length) {
    const lista = sinFuncion
      .map(({ p, i }) => `   · ${canonicos[i]} (en el GPS «${p.name ?? '—'}») — trae «${p.funcionEstructural ?? '—'}»`)
      .join('\n');
    throw new Error(
      `${sinFuncion.length} punto(s) del levantamiento base de ${codigoLinea} no declaran una funcionEstructural válida:\n${lista}\n` +
      `   Admitidas: ${Object.keys(FUNCIONES).join(' · ')}.\n` +
      '   No se asume «Suspensión»: la función decide el corte de tramos de tensión y con él el cálculo mecánico, ' +
      'y los apoyos no se pueden borrar una vez escritos.'
    );
  }

  // ── El levantamiento base ────────────────────────────────────────────────
  // El `orden` de estos 26 sale del índice y así se queda: son los que ya están
  // escritos en producción con orden 0…25, y reescribirlos no registraría
  // ningún hecho nuevo. El ID, en cambio, ya NO sale del índice: sale del
  // nombre canónico (que para estos 26 devuelve la semilla legada `apoyo-<i>`
  // porque el registro la ancla, byte a byte).
  const apoyos = puntosJulio.map((p, i) => {
    const nombreCanonico = canonicos[i];
    return documentoBase(idDePunto(codigoLinea, nombreCanonico, org, registro), org, ahora, creadoPor, {
      tipo: 'apoyo',
      lineaId,
      orden: i,
      // ⚠️ NO todo punto levantado es un apoyo. Un empalme puede estar a mitad
      // de vano y no sostiene nada; contarlo parte un vano real en dos falsos.
      // En esta línea eso escondía un vano de 247,8 m detrás de dos de 84 y 164.
      tipoPunto: TIPO_POR_ROL[p.rol] ?? (/EMP/i.test(String(p.name)) ? 'Empalme' : 'Estructura'),
      // El nombre de campo se conserva TAL CUAL quedó en el GPS: es la
      // trazabilidad con el levantamiento, con sus errores incluidos.
      nombreCampo: String(p.name),
      nombreNormalizado: nombreCanonico,
      coordenada: {
        lat: p.lat, lon: p.lon, sistemaReferencia: 'WGS84',
        cotaTerreno_m: p.ele, metodo: 'gps_mano',
        // La auditoría fue tajante: el error vertical de un GPS de mano es del
        // mismo orden que el gálibo a demostrar. Se declara para que nadie firme
        // sobre él.
        precision_m: 8,
        tomadaEn: p.utc,
      },
      // Ya no hay `?? 'Suspensión'`: arriba se aborta si falta (decisión 3).
      funcionEstructural: FUNCIONES[p.funcionEstructural],
      funcionProcedencia: 'confirmado_humano',
      deflexion_grados: p.deflexion ?? null,
      condicion: 'Sin evaluar',
      activo: true,
    });
  });

  // ── Los puntos añadidos después ──────────────────────────────────────────
  const ignorados = [];
  for (const p of puntosAmpliacion) {
    const etiqueta = p.nombreCanonico ?? p.name ?? '(sin nombre)';

    // Lo que el Ingeniero no ha aprobado NO se carga — y tampoco se borra del
    // fixture ni se silencia: se devuelve para que el sembrador lo imprima.
    if (p.estado !== 'aprobado') {
      ignorados.push({ nombreCanonico: p.nombreCanonico ?? null, nombreCampo: p.name ?? null, estado: p.estado ?? '(sin declarar)', motivo: p.motivoPendiente ?? 'no está aprobado en el fixture' });
      continue;
    }
    if (!p.nombreCanonico || !ASCII_IMPRIMIBLE.test(p.nombreCanonico)) {
      throw new Error(`El punto «${etiqueta}» no trae un nombreCanonico en ASCII imprimible. Ese nombre ES la semilla del id: una tilde cambiaría el id según cómo se escriba.`);
    }
    if (apoyos.some((a) => a.nombreNormalizado === p.nombreCanonico)) {
      throw new Error(`«${p.nombreCanonico}» ya está en el levantamiento. Un nombre canónico repetido serían dos documentos peleándose por el mismo id.`);
    }
    // Nada por defecto: ver la decisión 3 de la cabecera.
    if (!p.funcionEstructural || !FUNCIONES[p.funcionEstructural]) {
      throw new Error(
        `El punto nuevo «${p.nombreCanonico}» no declara funcionEstructural válida (trae «${p.funcionEstructural ?? '—'}»). ` +
        'No se asume ninguna: la función decide el corte de tramos de tensión y con él el cálculo mecánico.'
      );
    }
    if (!p.rol || !TIPO_POR_ROL[p.rol]) {
      throw new Error(`El punto nuevo «${p.nombreCanonico}» no declara un rol conocido (trae «${p.rol ?? '—'}»). De ahí sale si es Estructura o Empalme, y eso decide si entra al cálculo de vanos.`);
    }

    apoyos.push(documentoBase(idDePunto(codigoLinea, p.nombreCanonico, org, registro), org, ahora, creadoPor, {
      tipo: 'apoyo',
      lineaId,
      orden: ordenDe(apoyos, p),
      tipoPunto: TIPO_POR_ROL[p.rol],
      nombreCampo: String(p.name),
      nombreNormalizado: p.nombreCanonico,
      coordenada: {
        lat: p.lat, lon: p.lon, sistemaReferencia: 'WGS84',
        cotaTerreno_m: p.ele ?? null, metodo: 'gps_mano',
        precision_m: 8,
        tomadaEn: p.utc,
      },
      funcionEstructural: FUNCIONES[p.funcionEstructural],
      // ⚠️ POR DEFECTO, «supuesto» — nunca «confirmado_humano».
      //
      // Que un punto traiga función declarada en el fixture NO significa que el
      // Ingeniero la haya firmado: la escribió quien preparó el levantamiento.
      // Con el defecto anterior, el pórtico se sembraba como
      // `confirmado_humano` y la ficha decía «Terminal · confirmada por el
      // Ingeniero» sobre una tipificación que él no ha confirmado — y la memoria
      // de cantidades contaba esa ancla como verificada en campo. Poner la firma
      // de alguien sobre lo que no firmó es peor que no tener el dato, y
      // `firestore.rules` prohíbe borrar apoyos: una vez escrito, se queda.
      // Para declarar que SÍ lo confirmó, el fixture lo dice explícitamente.
      funcionProcedencia: p.funcionProcedencia ?? 'supuesto',
      deflexion_grados: p.deflexion ?? null,
      condicion: 'Sin evaluar',
      activo: true,
    }));
    apoyos.sort((a, b) => a.orden - b.orden);
  }

  const { nuevas: semillasNuevas, colisiones } = verificarRegistro(
    codigoLinea, apoyos.map((a) => a.nombreNormalizado), { org, registro },
  );

  return {
    apoyos,
    ignorados,
    semillasNuevas,
    colisiones,
    // Con qué documentos el contrato tiene que admitir `orden` no entero. Lo usa
    // el sembrador para negarse a escribir antes de que la web esté desplegada.
    ordenesNoEnteros: apoyos.filter((a) => !Number.isInteger(a.orden)).map((a) => ({ nombreCanonico: a.nombreNormalizado, orden: a.orden })),
  };
}

/**
 * Dónde entra un punto nuevo en la secuencia, SIN mover a nadie.
 *
 * · intercalado  → (orden del anterior + orden del siguiente) / 2
 * · al final     → último + 1
 *
 * La posición en la secuencia no es cosmética: `exportar/levantamiento.js` y la
 * ficha de la aplicación deducen de ella en qué VANO cae un empalme, y la traza
 * GPX/KML se dibuja en ese orden. Meter el empalme al final daría `enVano: null`
 * y un salto hacia atrás en el dibujo.
 */
function ordenDe(apoyos, p) {
  if (p.insertarAlFinal) {
    return Math.max(...apoyos.map((a) => a.orden)) + 1;
  }
  // ── ANTES DEL PRIMERO ─────────────────────────────────────────────────────
  //
  // Hasta §ADR-054 esto abortaba: bisecar por delante daba −1 y el contrato
  // exigía `nonnegative`. Se aflojó esa restricción (contrato 0.9.0) porque la
  // única alternativa era correr los 26 documentos de producción para registrar
  // un hecho que no cambió en ninguno de ellos.
  //
  // Es el simétrico exacto de `insertarAlFinal`, y por eso se escribe igual. El
  // pórtico del extremo de ORIGEN entra con `mínimo − 1` y los demás se quedan
  // donde están.
  //
  // ⚠️ `insertarAntesDe` solo vale para el PRIMERO. Para intercalar dentro del
  // recorrido se declara DETRÁS del vecino anterior: es la misma posición dicha
  // una sola vez, y ofrecer las dos formas es ofrecer dos sitios donde
  // equivocarse.
  if (p.insertarAlPrincipio || p.insertarAntesDe) {
    const enOrden = [...apoyos].sort((a, b) => a.orden - b.orden);
    const primero = enOrden[0];
    if (p.insertarAntesDe && p.insertarAntesDe !== primero?.nombreNormalizado) {
      throw new Error(
        `«${p.nombreCanonico}» pide ir antes de «${p.insertarAntesDe}», que no es el primero del levantamiento. ` +
        'Para intercalar dentro del recorrido se declara DETRÁS de su vecino anterior.'
      );
    }
    return Math.min(...apoyos.map((a) => a.orden)) - 1;
  }
  if (!p.insertarDespuesDe) {
    throw new Error(`El punto nuevo «${p.nombreCanonico}» no dice dónde va: falta insertarDespuesDe o insertarAlFinal. Sin posición no hay vano, y sin vano el punto no significa nada.`);
  }
  const anterior = apoyos.find((a) => a.nombreNormalizado === p.insertarDespuesDe);
  if (!anterior) {
    throw new Error(`«${p.nombreCanonico}» dice ir después de «${p.insertarDespuesDe}», que no está en el levantamiento.`);
  }

  // Si en este mismo hueco YA se intercaló otro punto, el nuevo va DETRÁS de él,
  // no delante. Bisecar siempre contra el vecino inmediato repartía hacia atrás:
  // dos empalmes declarados A y B en el vano E03→E04 salían «E03 · B · A · E04»,
  // es decir, el recorrido al revés y sin un solo aviso. El orden en que el
  // levantamiento los declara ES el orden de recorrido — que es lo único que el
  // Ingeniero declaró correcto de la fuente original.
  const enOrden = [...apoyos].sort((a, b) => a.orden - b.orden);
  let i = enOrden.indexOf(anterior) + 1;
  while (i < enOrden.length && !Number.isInteger(enOrden[i].orden)) i++;
  const previo = enOrden[i - 1];               // el ancla, o el último intercalado tras ella
  const siguiente = enOrden[i];
  return siguiente ? (previo.orden + siguiente.orden) / 2 : previo.orden + 1;
}

/**
 * El expediente de la falla, atado al apoyo POR NOMBRE CANÓNICO.
 *
 * Antes se resolvía con `apoyos[f.estructuraOrden]`: por POSICIÓN. Hoy apunta
 * al índice 1, que es E02, y el empalme nuevo no lo mueve — pero solo por
 * casualidad, porque entra en la posición 3. El día que se cargue el pórtico
 * del extremo de origen (va ANTES de E01) toda la serie se correría y el
 * expediente saltaría de E02 a E01 sin un solo error visible.
 *
 * `estructuraOrden` se conserva en el fixture y aquí se usa como CONTROL
 * CRUZADO contra la lista de JULIO: es la forma de demostrar que la migración
 * no cambió el destino. Si nombre y posición discrepan, no se siembra nada.
 */
export function construirInvestigacion(falla, apoyos, apoyosJulio = apoyos, opciones = {}) {
  const {
    codigoLinea = 'LN-627',
    org = ORG_POR_DEFECTO,
    ahora = new Date().toISOString(),
    creadoPor = 'sembrador',
    lineaId = idDeSemilla(codigoLinea, 'linea', org),
  } = opciones;

  if (!falla.apoyoCanonico) {
    throw new Error('El expediente de falla no declara apoyoCanonico. Atarlo por posición es justo lo que se acaba de quitar: no se siembra a ciegas.');
  }
  const apoyo = apoyos.find((a) => a.nombreNormalizado === falla.apoyoCanonico);
  if (!apoyo) {
    throw new Error(`La falla apunta a «${falla.apoyoCanonico}», que no está en el levantamiento.`);
  }
  if (Number.isInteger(falla.estructuraOrden) && apoyosJulio[falla.estructuraOrden]?.id !== apoyo.id) {
    throw new Error(
      `El expediente apunta a dos apoyos distintos: por nombre a «${falla.apoyoCanonico}» (${apoyo.id}) y ` +
      `por la posición histórica ${falla.estructuraOrden} a «${apoyosJulio[falla.estructuraOrden]?.nombreNormalizado ?? '—'}». No se siembra nada.`
    );
  }

  return documentoBase(idDeSemilla(codigoLinea, 'investigacion-falla', org), org, ahora, creadoPor, {
    tipo: 'investigacion',
    lineaId,
    // Por id INMUTABLE del apoyo, nunca por número de estructura: renumerar la
    // línea no puede mover el evento a otro apoyo.
    apoyoId: apoyo.id,
    ocurrioEn: falla.ocurrioEn,
    fechaTexto: falla.fechaTexto,
    placa: falla.placa,
    componenteAfectado: falla.componenteAfectado,
    cronologia: falla.cronologia,
    observaciones: falla.observaciones,
    hipotesis: falla.hipotesis,
    verificacionesPendientes: (falla.verificacionesPendientes ?? []).map((v) => ({ ...v, estado: v.estado ?? 'pendiente' })),
    cerrada: false,
  });
}

// ════════════════════════════════════════════════════════════════════════════
// LA FICHA DE LÍNEA — lo que es de CADA línea y no del sembrador
// ────────────────────────────────────────────────────────────────────────────
// Hasta el 2026-09-16 el sembrador llevaba escritos a mano la tensión (66 kV),
// un circuito, el conductor Darien y las hipótesis de LN-627. Sembrar otra
// línea le habría puesto todo eso en silencio: la ampacidad, la cargabilidad y
// el veredicto mecánico saldrían de los datos de OTRA línea, presentados como
// suyos. Ahora cada línea trae su ficha en la bóveda (`<CODIGO>-linea.json`)
// y, si falta algo, no se siembra y se dice QUÉ falta. No hay valores por
// defecto, tampoco los que el molde de los datos pondría solo (`cx`,
// `densidadAire_kg_m3`, `moduloEs`, `circuitos`, `activa`): aquí se declaran.
// ════════════════════════════════════════════════════════════════════════════

const esTexto = (v) => typeof v === 'string' && v.trim().length > 0;
const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);
const esPositivo = (v) => esNumero(v) && v > 0;
const esNoNegativo = (v) => esNumero(v) && v >= 0;
const esEnteroPositivo = (v) => Number.isInteger(v) && v > 0;
const esSiNo = (v) => typeof v === 'boolean';

/**
 * Lo que la ficha de una línea TIENE que declarar, con qué forma. El molde de
 * los datos (`contratos/src/activos.ts`) sigue siendo el juez final; esto es
 * el mínimo sin el cual la línea no abre o abre con un número que no es suyo.
 */
export const FICHA_DE_LINEA = Object.freeze({
  linea: Object.freeze({
    nombre: [esTexto, 'texto'],
    tensionNominal_kV: [esPositivo, 'número > 0'],
    circuitos: [esEnteroPositivo, 'entero > 0'],
    activa: [esSiNo, 'true o false'],
  }),
  conductor: Object.freeze({
    codigo: [esTexto, 'texto'],
    material: [esTexto, 'texto'],
    seccion_mm2: [esPositivo, 'número > 0'],
    diametro_m: [esPositivo, 'número > 0'],
    masaLineal_kg_m: [esPositivo, 'número > 0'],
    rts_kgf: [esPositivo, 'número > 0'],
    moduloElastico_kg_mm2: [esPositivo, 'número > 0'],
    moduloEs: [esTexto, 'inicial · final · no_declarado'],
    dilatacion_1_C: [esPositivo, 'número > 0'],
    tempMaxOperacion_C: [esPositivo, 'número > 0'],
    procedencia: [esTexto, 'texto'],
    // Una cifra de conductor sin su fuente es una opinión: se exige aunque el
    // molde la deje opcional.
    fuente: [esTexto, 'texto'],
  }),
  hipotesis: Object.freeze({
    nombre: [esTexto, 'texto'],
    eds_pct: [esPositivo, 'número > 0'],
    tempEds_C: [esNumero, 'número'],
    tempMax_C: [esNumero, 'número'],
    tempMin_C: [esNumero, 'número'],
    vientoMax_kmh: [esNoNegativo, 'número ≥ 0'],
    tempViento_C: [esNumero, 'número'],
    cx: [esPositivo, 'número > 0'],
    densidadAire_kg_m3: [esPositivo, 'número > 0'],
    procedencia: [esTexto, 'texto'],
    congelada: [esSiNo, 'true o false'],
  }),
});

/**
 * Claves que la ficha NO puede declarar: son la identidad y la partida de
 * nacimiento del documento, y las pone el sembrador. Una ficha copiada de otra
 * línea que trajera su `id` o su `lineaId` escribiría sobre la línea vecina.
 */
const IDENTIDAD_LINEA = ['id', 'orgId', 'tipo', 'codigo', 'hipotesisId', 'creadoEn', 'creadoPor', 'revision'];
const IDENTIDAD_HIPOTESIS = ['id', 'orgId', 'tipo', 'lineaId', 'creadoEn', 'creadoPor', 'revision'];

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** Las claves que empiezan por «_» son notas para quien lee la ficha: no viajan a la base. */
const sinNotas = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')));

/**
 * Todo lo que le falta o le sobra a una ficha de línea, dicho de una vez.
 * Lista vacía = se puede sembrar. PURA: no lee archivos.
 *
 * @param {string} codigoLinea  el de `--linea`
 * @param {object} ficha        el JSON de `<CODIGO>-linea.json`
 * @returns {string[]}
 */
export function faltasDeLaFichaDeLinea(codigoLinea, ficha) {
  if (!esObjeto(ficha)) return ['la ficha no es un objeto JSON'];
  const faltas = [];

  // Protege de copiar la ficha de una línea para otra sin editarla: la
  // tensión y el conductor serían los de la vecina, y nada más lo delataría.
  if (ficha.codigo !== codigoLinea) {
    faltas.push(`codigo: la ficha dice «${ficha.codigo ?? '—'}» y se está sembrando ${codigoLinea}`);
  }

  const revisar = (seccion, obj, prohibidas = []) => {
    if (!esObjeto(obj)) { faltas.push(`${seccion}: falta la sección entera`); return; }
    for (const [campo, [valido, forma]] of Object.entries(FICHA_DE_LINEA[seccion.split('.').pop()])) {
      if (obj[campo] === undefined || obj[campo] === null) faltas.push(`${seccion}.${campo} (${forma}): falta`);
      else if (!valido(obj[campo])) faltas.push(`${seccion}.${campo} (${forma}): trae «${JSON.stringify(obj[campo])}»`);
    }
    for (const campo of prohibidas) {
      if (campo in obj) faltas.push(`${seccion}.${campo}: no se declara en la ficha, lo pone el sembrador`);
    }
  };
  revisar('linea', ficha.linea, IDENTIDAD_LINEA);
  if (esObjeto(ficha.linea)) revisar('linea.conductor', ficha.linea.conductor);
  revisar('hipotesis', ficha.hipotesis, IDENTIDAD_HIPOTESIS);

  // La insignia del fabricante solo la lleva lo que viene de su ficha (`§ADR-099`):
  // un conductor cuya propia fuente dice PENDIENTE o «módulo de campo» es un
  // supuesto, y las dos cosas no pueden ser ciertas a la vez.
  const c = esObjeto(ficha.linea) ? ficha.linea.conductor : null;
  if (esObjeto(c) && c.procedencia === 'catalogo_fabricante' &&
      /pendiente|m[oó]dulo de campo/i.test(String(c.fuente ?? ''))) {
    faltas.push('linea.conductor.procedencia: dice catálogo del fabricante y su fuente dice que está PENDIENTE: es un supuesto');
  }

  // Un despeje sin la norma que lo fija es una cifra sin respaldo.
  const h = ficha.hipotesis;
  if (esObjeto(h) && h.despejeMinimo_m !== undefined) {
    if (!esObjeto(h.despejeMinimo_m) || !Object.values(h.despejeMinimo_m).every(esPositivo)) {
      faltas.push('hipotesis.despejeMinimo_m: tiene que ser { categoría: metros > 0 }');
    }
    if (!esTexto(h.normaReferencia)) {
      faltas.push('hipotesis.normaReferencia (texto): falta, y hay despejeMinimo_m que la necesita');
    }
  }
  return faltas;
}

/**
 * Los documentos `lineas/{id}` e `hipotesis/{id}` de una línea, desde su ficha.
 *
 * El orden de las claves es el mismo que tenían cuando el sembrador los
 * escribía a mano, para que LN-627 salga idéntica byte a byte. Lo que la ficha
 * traiga además de lo obligatorio (p. ej. `tensionMaxima_kV`) se escribe
 * detrás, tal cual.
 *
 * @throws si la ficha tiene cualquier falta: no se siembra «lo que se pueda».
 */
export function construirLinea(codigoLinea, ficha, opciones = {}) {
  const {
    org = ORG_POR_DEFECTO,
    ahora = new Date().toISOString(),
    creadoPor = 'sembrador',
    lineaId = idDeSemilla(codigoLinea, 'linea', org),
    hipotesisId = idDeSemilla(codigoLinea, 'hipotesis-modulo-campo', org),
  } = opciones;

  const faltas = faltasDeLaFichaDeLinea(codigoLinea, ficha);
  if (faltas.length) {
    throw new Error(
      `La ficha de línea de ${codigoLinea} no está completa — no se siembra nada:\n` +
      faltas.map((f) => `   · ${f}`).join('\n') +
      '\n   No hay valores por defecto: cada cifra de la línea se declara en su ficha.'
    );
  }

  const { nombre, tensionNominal_kV, circuitos, activa, conductor, ...otrosDeLinea } = sinNotas(ficha.linea);
  const { nombre: nombreHipotesis, ...restoHipotesis } = sinNotas(ficha.hipotesis);

  return {
    linea: documentoBase(lineaId, org, ahora, creadoPor, {
      tipo: 'linea',
      codigo: codigoLinea,
      nombre,
      tensionNominal_kV,
      circuitos,
      activa,
      hipotesisId,
      conductor: sinNotas(conductor),
      ...otrosDeLinea,
    }),
    hipotesis: documentoBase(hipotesisId, org, ahora, creadoPor, {
      tipo: 'hipotesis',
      nombre: nombreHipotesis,
      lineaId,
      ...restoHipotesis,
    }),
  };
}
