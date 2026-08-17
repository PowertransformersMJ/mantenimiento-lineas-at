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
// 3. NADA POR DEFECTO EN UN PUNTO NUEVO. La función estructural no se adivina:
//    si no viene declarada, la construcción FALLA. El defecto silencioso
//    anterior era 'Suspensión', y sembrar un pórtico de subestación como
//    suspensión cambia el corte de tramos de tensión y con él el cálculo
//    mecánico — un número que se firma, cambiado sin que nadie lo pida.
// ============================================================================
import { CANONICOS, ORG_POR_DEFECTO, idDePunto, idDeSemilla, leerRegistro, verificarRegistro } from './identidad.mjs';

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
      funcionEstructural: FUNCIONES[p.funcionEstructural] ?? 'Suspensión',
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
  // Un punto que va ANTES del primero no tiene hoy por dónde entrar, y hay que
  // decirlo en vez de colocarlo en cualquier sitio. Bisecar por delante daría
  // orden −1 y el contrato exige `nonnegative` (contratos/src/activos.ts); la
  // alternativa —correr los 26 de producción— es justo lo que esta bisección
  // existe para evitar, porque movería 64 de las 99 fotos. Es el caso del
  // pórtico del extremo de origen: cuando se apruebe, se construye el camino.
  if (p.insertarAntesDe || p.insertarAlPrincipio) {
    throw new Error(
      `«${p.nombreCanonico}» quiere ir ANTES de «${p.insertarAntesDe ?? 'todo'}», y ese camino no existe todavía. ` +
      'No se coloca «donde quepa»: un punto mal situado inventa vanos y envenena el cálculo. ' +
      'Hay que construirlo a propósito (orden ≥ 0 obliga a renumerar, y renumerar mueve las fotos).'
    );
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
