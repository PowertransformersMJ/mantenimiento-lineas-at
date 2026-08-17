// ============================================================================
// publicar-decisiones.mjs — de la bóveda al libro público, por LISTA BLANCA
// ----------------------------------------------------------------------------
// QUÉ HACE: lee el fixture de la bóveda donde el Ingeniero AUTORA sus puntos y
// escribe un EXTRACTO REDACTADO en `herramientas/decisiones-firmadas.json`, que
// sí vive en el repositorio público y sí puede leer el navegador.
//
// UNA SOLA DIRECCIÓN: bóveda → extracto → navegador. La bóveda sigue siendo el
// único sitio donde una decisión se escribe por primera vez, y `sembrar.mjs` y
// `construir-apoyos.mjs` la siguen leyendo de allí tal cual. Este archivo no
// devuelve nada hacia la bóveda y la aplicación no escribe en el extracto: sin
// ciclo, no puede haber dos autorías del mismo hecho.
//
// ── POR QUÉ LISTA BLANCA Y NO LISTA NEGRA ───────────────────────────────────
// Con lista negra —«no publiques lat, lon, utc…»— el día que el fixture gane un
// campo `coordenadaCorregida` se publica solo, y nadie se entera hasta que ya
// está en la historia de git, que es permanente (`33 · L-07`). Aquí un campo
// que no esté en CAMPOS_DEL_PUNTO **no existe** para el resto del archivo: el
// punto se reduce a esos campos ANTES de mirarlo. Publicar algo nuevo exige que
// alguien lo añada a esa lista a propósito.
//
// ── LA SEGUNDA GUARDIA: LA PROSA NO SE DERIVA, SE ESCRIBE ───────────────────
// Los `_porQue…` del fixture llevan nombres de subestación, distancias y
// azimuts: copiarlos sería la fuga. Y resumirlos automáticamente sería peor,
// porque el resumen lo firmaría el sistema. Por eso la prosa pública vive en
// REDACCION, escrita a mano y revisada contra la bóveda, y el generador SE
// NIEGA a publicar una fila que no la tenga. Un punto nuevo aprobado en la
// bóveda no llega al repositorio hasta que una persona escriba su porqué.
//
// ── LA TERCERA GUARDIA: MEMORIA, NUNCA DICTAMEN ─────────────────────────────
// Solo se leen campos que ÉL autoró. Una fila sin `decididoPor` y `decididoEn`
// no se emite: se aborta la corrida entera. Es lo que impide que el día de
// mañana alguien meta aquí algo que dedujo el sistema y la pantalla lo enseñe
// con fecha y con su firma — un dictamen sellado, que es peor que el que se
// vetó en ADR-028 porque parece firmado.
//
// ── LA CUARTA GUARDIA: SE APENDA, NO SE PISA ────────────────────────────────
// Lo ya publicado se conserva VERBATIM. Una decisión nueva se añade detrás; una
// fila con el mismo nombre y la misma fecha pero con otro contenido aborta la
// corrida, porque eso no es una decisión nueva: es una sobrescritura.
//
// USO (herramienta LOCAL del Ingeniero, como el sembrador — nunca corre en CI):
//
//     node herramientas/publicar-decisiones.mjs --linea LN-627 [--seco]
//
// ============================================================================
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { leerRegistro, RUTA_REGISTRO } from './identidad.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

/** Dónde vive el extracto público. Hermano del libro de identidad, a propósito. */
export const RUTA_DECISIONES = join(AQUI, 'decisiones-firmadas.json');

/** La bóveda privada. NUNCA se copia al repositorio: se lee y se redacta. */
const BOVEDA = join(RAIZ, '..', 'brain-private', 'mantenimiento-lineas-at', 'fixtures');

// ── LISTA BLANCA ────────────────────────────────────────────────────────────

/**
 * Los ÚNICOS campos de un punto del fixture que este archivo llega a ver.
 *
 * Todos son cosas que decidió él, no cosas que se midieron. Lo medido —dónde
 * está, cuándo se capturó, a qué distancia del vecino— se queda en la bóveda:
 * la pantalla lo recalcula sola desde el GPX que él aporta y desde la base.
 */
export const CAMPOS_DEL_PUNTO = Object.freeze([
  'nombreCanonico',        // ya público en el libro de identidad
  'estado',                // la decisión misma: aprobado / pendiente_verificacion
  'rol',                   // se traduce al vocabulario del molde (tipoPunto)
  'funcionEstructural',    // el papel que él declaró
  'funcionProcedencia',    // si lo firmó él o quedó supuesto
  'funcionConfirmadaEn',   // fecha de FIRMA, no de captura
  'insertarDespuesDe',     // dónde dijo él que va
  'insertarAlFinal',       // ídem
  'aprobadoPor',           // se comprueba que existe; NO se copia (ver DECIDIDO_POR)
  'aprobadoEn',            // fecha de DECISIÓN
]);

/**
 * El rol del fixture, traducido al vocabulario del molde de los datos.
 *
 * ⚠️ La misma tabla vive en `construir-apoyos.mjs` (TIPO_POR_ROL), que es quien
 * siembra de verdad. Está duplicada porque aquel archivo no la exporta y no se
 * va a tocar por esto; la prueba de la bóveda ata las dos corriendo el sembrador
 * sobre el mismo fixture y comparando punto por punto.
 */
const TIPO_POR_ROL = Object.freeze({
  'empalme': 'Empalme',
  'portico_subestacion': 'Estructura',
  'estructura': 'Estructura',
});

/**
 * Quién decidió, tal como sale publicado: el ROL, nunca la persona.
 *
 * Verificado el 2026-08-17: `git log --format='%an <%ae>'` de este repositorio
 * devuelve un solo autor, y no es su nombre personal. Su nombre completo está en
 * la bóveda y ahí se queda; este archivo no va a ser el primero en publicarlo.
 * La pantalla dice «decidido por usted», que es lo único que hace falta.
 */
const DECIDIDO_POR = 'el Ingeniero';

// ── LA PROSA PÚBLICA ────────────────────────────────────────────────────────

/**
 * El «por qué» de cada fila, ESCRITO PARA EL REPOSITORIO PÚBLICO — no derivado
 * del fixture. Cada texto se revisó contra la bóveda: ni un nombre de
 * instalación, ni una distancia, ni un azimut, ni una hora de captura.
 *
 * Si un punto aprobado no está aquí, la corrida ABORTA. Es deliberado: una fila
 * sin porqué sería una decisión sin explicación en el único sitio donde el
 * Ingeniero la va a releer dentro de seis meses.
 */
const REDACCION = Object.freeze({
  'LN-627 EMP E03-E04': {
    porQue: 'Empalme nuevo, dentro del vano E03 → E04. Se declara Suspensión igual que los dos '
      + 'empalmes de julio: da lo mismo para el cálculo, porque un empalme no es apoyo y no abre '
      + 'vano, pero se declara en vez de dejarse al defecto.',
  },
  'LN-627 PORTICO FIN': {
    porQue: 'Es el pórtico de subestación del extremo final: ancla el conductor por definición, y '
      + 'por eso aquí se corta el último tramo de tensión. El 17 de agosto de 2026 usted declaró '
      + 'que ese pórtico es el final de la línea, así que el papel entra CONFIRMADO por usted y no '
      + 'supuesto.',
  },
  'LN-627 PORTICO ORIGEN': {
    porQue: 'Usted quiere verificarlo en campo antes de darlo por bueno. Pendiente no es descartado.',
    porQueNoSeOfrece: 'No tiene nombre emitido en el libro de identidad, así que esta pantalla no '
      + 'puede darle identidad; y va ANTES del primer punto cargado, que es un camino que todavía '
      + 'no existe.',
  },
});

// ── LAS NOTAS DEL ARCHIVO PÚBLICO ───────────────────────────────────────────
// Se escriben aquí, en su idioma, y NO se copian del fixture: los `_nota` de la
// bóveda nombran rutas privadas y archivos que él no tiene por qué conocer.

const NOTAS = Object.freeze({
  _queEsEsto: 'Libro de DECISIONES YA TOMADAS por el Ingeniero sobre puntos de una línea que '
    + 'todavía NO están cargados. Es MEMORIA, no criterio. Aquí no entra ni una línea que el '
    + 'sistema haya deducido: cada fila la decidió él, con fecha. La pantalla «Cargar» lo lee para '
    + 'no volver a preguntarle lo que ya contestó, y enseña SIEMPRE de dónde sale cada cosa. Si de '
    + 'un dato no se puede decir quién lo decidió y cuándo, no se enseña.',
  _deDondeSale: 'Extracto REDACTADO del fixture de la bóveda donde el Ingeniero autora cada punto. '
    + 'Lo produce herramientas/publicar-decisiones.mjs con LISTA BLANCA de campos: un campo nuevo '
    + 'en la bóveda NO aparece aquí hasta que alguien lo añada a esa lista a propósito. La bóveda '
    + 'sigue siendo el único sitio donde la decisión se escribe por primera vez, y el sembrador la '
    + 'sigue leyendo de allí.',
  _queNOentraAqui: 'Ni una coordenada, ni una cota, ni una hora de captura, ni el nombre de campo '
    + 'del GPS, ni el nombre de ninguna subestación, ni una distancia medida, ni un azimut, ni las '
    + 'cifras de la línea antes y después. Las cifras las calcula la pantalla con el motor de '
    + 'siempre (importar/plan.js), corrido dos veces. Un segundo sitio con los mismos números es el '
    + 'sitio donde algún día discrepan. Este archivo no contiene NI UN SOLO NÚMERO en JSON, y hay '
    + 'una prueba que lo exige.',
  _estoNoDaIdentidad: 'Que un nombre esté aquí NO le da identidad. La identidad la da SOLO '
    + 'herramientas/semillas-emitidas.json. Un nombre decidido pero sin semilla emitida no se puede '
    + 'cargar desde la aplicación, y así debe ser: quien pueda estrenar nombres puede estrenar '
    + 'identidades permanentes.',
  _cuandoDejaDeMandar: 'En cuanto el punto está cargado, la verdad es la base. CARGADO manda sobre '
    + 'FIRMADO. Esta fila queda como historia de lo que él decidió ANTES de cargar, y la pantalla '
    + 'solo la consulta mientras el nombre siga disponible.',
  _seApendaNoSePisa: 'Cambiar de opinión NO reescribe ninguna fila. Se APENDA otra, con su fecha. '
    + 'Vale la ÚLTIMA fechada sobre ese nombre; las anteriores se quedan porque son hechos, no '
    + 'borradores. Es la misma regla que gobierna el libro de identidad y el fixture de la bóveda.',
  _comoSeLee: 'El lector toma las claves con nombre —«decisiones» y «pendientes»— y NUNCA recorre '
    + 'las claves de la página de la línea. El libro de identidad sí las recorre, y por eso allí una '
    + 'clave suelta se leería como un nombre de punto.',
});

// ── FORMAS QUE NO PUEDEN SALIR ──────────────────────────────────────────────

/**
 * Comprobación por FORMA, la última de las cuatro. Es una lista negra, y las
 * listas negras se quedan cortas: la defensa de verdad es la lista blanca de
 * arriba. Esto solo caza el descuido.
 */
/**
 * Lo que NUNCA puede salir en lo publicado.
 *
 * Las FORMAS (una coordenada, una hora) se reconocen por su pinta y viven aquí:
 * describirlas no publica nada.
 *
 * Los NOMBRES PROPIOS (subestaciones, cliente, códigos del GPS) viven en la
 * BÓVEDA, no aquí. Un guardián que deletrea lo que prohíbe **publica justo lo
 * que venía a impedir**: el 2026-08-17 esta lista llevaba escritos los nombres
 * de las dos subestaciones, en el repositorio PÚBLICO, tres líneas por encima
 * de la prueba que los prohibía. Es `33 · L-50` por segunda vez.
 */
const FORMAS_PROHIBIDAS = Object.freeze([
  [/\d+[.,]\d{4,}/, 'un número con cuatro o más decimales: eso tiene forma de coordenada, de distancia medida o de azimut'],
  [/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, 'una fecha CON HORA: las horas de captura no salen de la bóveda'],
]);

/**
 * Los nombres prohibidos, leídos de la bóveda. Este guion SIEMPRE corre en la
 * máquina del Ingeniero —es donde está la bóveda y donde se genera lo que se
 * publica—, así que aquí la comprobación es fuerte: si la lista no aparece, se
 * ABORTA en vez de publicar a ciegas.
 */
function nombresProhibidos() {
  const ruta = join(RAIZ, '..', 'brain-private', 'mantenimiento-lineas-at', 'fixtures', 'nombres-prohibidos.json');
  if (!existsSync(ruta)) {
    console.error(`\n❌ No está la lista de nombres prohibidos en la bóveda:\n   ${ruta}\n`
      + '   Sin ella no se publica nada: publicar sin saber qué está prohibido es\n'
      + '   exactamente el accidente que esta lista existe para impedir.\n');
    process.exit(1);
  }
  return leerJson(ruta).prohibidos.map((p) => [new RegExp(p.patron, 'i'), p.que]);
}

// ── Utilidades ──────────────────────────────────────────────────────────────

const leerJson = (ruta) => JSON.parse(readFileSync(ruta, 'utf-8'));

/** Todas las hojas de un objeto, para poder buscarlas después en lo emitido. */
function hojas(valor, salida = []) {
  if (valor === null || valor === undefined) return salida;
  if (Array.isArray(valor)) { for (const v of valor) hojas(v, salida); return salida; }
  if (typeof valor === 'object') { for (const v of Object.values(valor)) hojas(v, salida); return salida; }
  salida.push(String(valor));
  return salida;
}

/** El punto del fixture, reducido a la lista blanca ANTES de que nadie lo mire. */
const soloLoPermitido = (punto) => Object.fromEntries(
  CAMPOS_DEL_PUNTO.filter((k) => punto?.[k] !== undefined).map((k) => [k, punto[k]]),
);

/**
 * De dónde vino este levantamiento, copiado BYTE A BYTE del libro de identidad
 * —no del fixture—, para que no entre ni un byte nuevo al repositorio público.
 * Es la primera mitad del campo `origen` de la fila ya emitida.
 */
function origenPublicado(registro, codigoLinea, nombreCanonico) {
  const origen = registro?.[codigoLinea]?.[nombreCanonico]?.origen;
  return typeof origen === 'string' ? origen.split(' · ')[0] : undefined;
}

/**
 * Las ACTAS del fixture: los bloques que llevan firma y fecha. Se detectan por
 * su forma —traen `decididoPor` y `decididoEn`— y no por su nombre, porque el
 * fixture APENDA un bloque nuevo cada vez que él decide, y clavar el nombre
 * «aprobacion_2026_08_16» dejaría el generador ciego a la siguiente.
 */
const actasDelFixture = (fixture) => Object.entries(fixture)
  .filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v)
    && typeof v.decididoPor === 'string' && typeof v.decididoEn === 'string')
  .map(([clave, v]) => ({ clave, ...v }));

/** ¿Menciona esta acta el nombre canónico de este punto? */
function actaMenciona(acta, nombreCanonico) {
  return hojas(acta).includes(nombreCanonico);
}

/**
 * Cuándo lo decidió. Primero lo que el propio punto declara (`aprobadoEn`); si
 * no lo trae —el caso de un pendiente—, la fecha del acta que lo menciona, y de
 * las que lo mencionen, la ÚLTIMA. Si no hay ninguna, no se inventa: se aborta.
 */
function fechaDeLaDecision(punto, actas, nombreCanonico) {
  if (typeof punto.aprobadoEn === 'string' && punto.aprobadoEn) return punto.aprobadoEn;
  const candidatas = actas.filter((a) => actaMenciona(a, nombreCanonico));
  return candidatas.length ? candidatas[candidatas.length - 1].decididoEn : undefined;
}

/** ¿Consta un autor humano de esta decisión? El VALOR no se copia: solo su existencia. */
function hayAutor(punto, actas, nombreCanonico) {
  if (typeof punto.aprobadoPor === 'string' && punto.aprobadoPor.trim()) return true;
  return actas.some((a) => actaMenciona(a, nombreCanonico) && a.decididoPor.trim());
}

// ── La construcción de una fila ─────────────────────────────────────────────

/**
 * Una fila del libro público, a partir de UN punto del fixture.
 *
 * @param {object} puntoCrudo   tal cual está en la bóveda (se reduce aquí dentro)
 * @param {object} contexto     `{ actas, registro, codigoLinea }`
 * @returns {{fila: object, pendiente: boolean}}
 */
export function filaDesdeElFixture(puntoCrudo, { actas = [], registro = {}, codigoLinea } = {}) {
  const p = soloLoPermitido(puntoCrudo);
  const sobre = p.nombreCanonico;

  if (typeof sobre !== 'string' || !sobre.trim()) {
    throw new Error('Un punto del fixture no trae nombreCanonico. Sin nombre no hay decisión que recordar, porque el recuerdo se busca por ese nombre.');
  }
  const prosa = REDACCION[sobre];
  if (!prosa?.porQue) {
    throw new Error(
      `«${sobre}» no tiene redacción pública escrita en publicar-decisiones.mjs (REDACCION). ` +
      'No se publica: los «_porQué» de la bóveda llevan nombres de instalación y distancias, y un ' +
      'resumen automático lo firmaría el sistema en vez de él. Escríbala a mano y vuelva a correr.'
    );
  }

  const decididoEn = fechaDeLaDecision(p, actas, sobre);
  if (!decididoEn || !hayAutor(p, actas, sobre)) {
    throw new Error(
      `«${sobre}» no consta decidido por una persona con fecha (falta ${!decididoEn ? 'la fecha' : 'el autor'}). ` +
      'No se publica. Una fila sin firma y sin fecha se enseñaría en pantalla como recuerdo suyo, y sería ' +
      'un dictamen del sistema con sello: exactamente lo que ADR-028 vetó, pero pareciendo firmado.'
    );
  }

  // ── El pendiente: superficie mínima y sin nada que rellenar una ficha ─────
  if (p.estado !== 'aprobado') {
    return {
      pendiente: true,
      fila: {
        sobre,
        decididoPor: DECIDIDO_POR,
        decididoEn,
        estado: p.estado ?? '(sin declarar)',
        porQue: prosa.porQue,
        // Se declara aquí, y no se deduce en la pantalla, para que la razón por
        // la que no se puede cargar viaje escrita junto al hecho.
        seOfreceEnLaPantalla: false,
        porQueNoSeOfrece: prosa.porQueNoSeOfrece
          ?? 'Todavía no se puede ofrecer desde esta pantalla.',
      },
    };
  }

  // ── Lo aprobado ──────────────────────────────────────────────────────────
  const tipoPunto = TIPO_POR_ROL[p.rol];
  if (!tipoPunto) {
    throw new Error(`«${sobre}» no declara un rol conocido (trae «${p.rol ?? '—'}»). De ahí sale si es Estructura o Empalme, y eso decide si entra al cálculo de vanos.`);
  }
  if (typeof p.funcionEstructural !== 'string' || !p.funcionEstructural) {
    throw new Error(`«${sobre}» no declara papel estructural. No se asume ninguno: de eso sale dónde se corta el tramo de tensión.`);
  }

  // `sitio` habla el mismo idioma que `importar/punto.js` (insertarDespuesDe /
  // insertarAlFinal) para que la traducción a la ficha sea COPIA, no lectura.
  const sitio = {};
  if (p.insertarAlFinal === true) sitio.insertarAlFinal = true;
  else if (typeof p.insertarDespuesDe === 'string' && p.insertarDespuesDe) sitio.insertarDespuesDe = p.insertarDespuesDe;
  else {
    throw new Error(`«${sobre}» está aprobado pero no dice dónde va. Sin sitio no hay vano, y sin vano el punto no significa nada.`);
  }

  const confirmada = p.funcionProcedencia === 'confirmado_humano';
  const fila = {
    sobre,
    decididoPor: DECIDIDO_POR,
    decididoEn,
    estado: 'aprobado',
    tipoPunto,
    sitio,
    funcionEstructural: p.funcionEstructural,
    // Va SEPARADO del papel a propósito: son dos hechos distintos —qué papel
    // cumple, y si él lo firmó—. Fusionarlos produce «Terminal, confirmada por
    // el Ingeniero» sobre algo que no firmó (importar/punto.js).
    funcionConfirmada: confirmada,
  };
  const origen = origenPublicado(registro, codigoLinea, sobre);
  if (origen) fila.origenDelLevantamiento = origen;
  if (confirmada && typeof p.funcionConfirmadaEn === 'string') fila.funcionConfirmadaEn = p.funcionConfirmadaEn;
  fila.porQue = prosa.porQue;

  // El orden de las claves se fija a mano para que el archivo se lea en el
  // orden en que él contesta las preguntas, no en el orden en que se calculan.
  const ordenadas = ['sobre', 'decididoPor', 'decididoEn', 'origenDelLevantamiento', 'estado',
    'tipoPunto', 'sitio', 'funcionEstructural', 'funcionConfirmada', 'funcionConfirmadaEn', 'porQue'];
  return {
    pendiente: false,
    fila: Object.fromEntries(ordenadas.filter((k) => fila[k] !== undefined).map((k) => [k, fila[k]])),
  };
}

// ── El libro entero ─────────────────────────────────────────────────────────

/** ¿Son la misma fila? Mismo nombre y misma fecha = el mismo hecho. */
const mismaFila = (a, b) => a.sobre === b.sobre && a.decididoEn === b.decididoEn;

/**
 * Añade las filas nuevas detrás de las que ya estaban, sin tocar ninguna.
 *
 * Si una fila ya publicada tiene el mismo nombre y la misma fecha pero otro
 * contenido, se ABORTA: eso no es una decisión nueva, es una sobrescritura de un
 * hecho fechado, y este libro no las admite (ver `_seApendaNoSePisa`).
 */
export function apendar(yaPublicadas = [], nuevas = []) {
  const salida = [...yaPublicadas];
  for (const nueva of nuevas) {
    const previa = salida.find((f) => mismaFila(f, nueva));
    if (!previa) { salida.push(nueva); continue; }
    if (JSON.stringify(previa) !== JSON.stringify(nueva)) {
      throw new Error(
        `«${nueva.sobre}» ya está publicado con fecha ${nueva.decididoEn}, y la bóveda dice ahora otra cosa ` +
        'con esa MISMA fecha. Eso es reescribir un hecho fechado, no decidir de nuevo. ' +
        'Si cambió de opinión, la decisión nueva lleva su propia fecha en la bóveda y entra como fila aparte.'
      );
    }
  }
  return salida;
}

/**
 * El libro público completo, listo para escribir.
 *
 * @param {object} fixture       el de la bóveda, tal cual
 * @param {object} opciones      `{ codigoLinea, registro, yaPublicado }`
 * @returns {object}
 */
export function construirLibro(fixture, { codigoLinea, registro = {}, yaPublicado = {} } = {}) {
  const actas = actasDelFixture(fixture);
  const decisiones = [];
  const pendientes = [];

  for (const punto of fixture?.puntos ?? []) {
    const { fila, pendiente } = filaDesdeElFixture(punto, { actas, registro, codigoLinea });
    (pendiente ? pendientes : decisiones).push(fila);
  }

  const paginaPrevia = yaPublicado?.[codigoLinea] ?? {};
  const libro = {
    ...NOTAS,
    // Las páginas de otras líneas se conservan intactas: este generador solo
    // sabe de la línea que se le pidió, y borrar lo que no entiende sería el
    // camino más corto a perder decisiones de otra línea sin enterarse.
    ...Object.fromEntries(Object.entries(yaPublicado).filter(([k]) => !k.startsWith('_') && k !== codigoLinea)),
    [codigoLinea]: {
      decisiones: apendar(paginaPrevia.decisiones ?? [], decisiones),
      pendientes: apendar(paginaPrevia.pendientes ?? [], pendientes),
    },
  };
  return libro;
}

// ── Las guardias sobre lo ya construido ─────────────────────────────────────

/**
 * Lo que NUNCA puede salir, comprobado sobre el texto final y contra la bóveda
 * de verdad —que es algo que la prueba del repositorio NO puede hacer, porque en
 * CI la bóveda no está montada—.
 *
 * @returns {string[]} los motivos por los que no se puede escribir. Vacío = limpio.
 */
export function motivosParaNoPublicar(libro, fixture) {
  const motivos = [];
  const texto = JSON.stringify(libro, null, 2);

  // 1. Ni un número en JSON. El libro solo contiene decisiones y prosa; toda
  //    cifra de la línea la calcula `importar/plan.js`. Un número aquí sería una
  //    segunda aritmética, o una medida.
  const numeros = [];
  JSON.parse(texto, function reconocer(clave, valor) {
    if (typeof valor === 'number') numeros.push(`${clave}: ${valor}`);
    return valor;
  });
  if (numeros.length) motivos.push(`el libro trae números en JSON (${numeros.join(', ')}), y no puede traer ninguno`);

  // 2. Formas y NOMBRES prohibidos sobre el texto entero. Los nombres se leen de
  //    la bóveda, no de aquí: ver el comentario de FORMAS_PROHIBIDAS.
  for (const [forma, queEs] of [...FORMAS_PROHIBIDAS, ...nombresProhibidos()]) {
    const m = forma.exec(texto);
    // El motivo NO repite lo encontrado: sería escribir en la consola —y en
    // cualquier registro que la recoja— justo el nombre que se está impidiendo
    // publicar. Se dice QUÉ es y dónde mirar.
    if (m) motivos.push(`aparece ${queEs} (posición ${m.index} del libro)`);
  }

  // 3. Contra la BÓVEDA: ninguna hoja sensible del fixture puede aparecer en lo
  //    emitido. Esto es lo que ninguna prueba del repositorio puede comprobar.
  const sensibles = new Set();
  const anota = (v) => { if (typeof v === 'string' && v.trim().length >= 3) sensibles.add(v.trim()); };
  anota(fixture?.identificadoPorElIngeniero);
  anota(fixture?.levantamiento?.equipo);
  anota(fixture?.levantamiento?.origen);
  anota(fixture?.levantamiento?.fecha);
  for (const acta of actasDelFixture(fixture)) anota(acta.decididoPor);
  for (const p of fixture?.puntos ?? []) {
    anota(p?.name); anota(p?.subestacion); anota(p?.aprobadoPor); anota(p?.utc);
    // La prosa privada del punto: todo lo que empieza por guion bajo.
    for (const [k, v] of Object.entries(p ?? {})) if (k.startsWith('_')) anota(v);
  }
  // Un literal de la bóveda que YA está, byte por byte, en el libro de identidad
  // público no es una fuga nueva: ya estaba publicado. Es el caso de «627 EMP»,
  // que es un trozo del nombre canónico «LN-627 EMP E03-E04». Los códigos de
  // waypoint que NO son trozo de ningún nombre canónico —los de las dos
  // subestaciones— siguen cayendo aquí, que es para lo que existe esto.
  const yaPublico = existsSync(RUTA_REGISTRO) ? readFileSync(RUTA_REGISTRO, 'utf-8') : '';
  for (const literal of sensibles) {
    if (!texto.includes(literal)) continue;
    if (yaPublico.includes(literal)) continue;
    motivos.push(`aparece un literal de la bóveda: «${literal.slice(0, 60)}…»`);
  }

  return motivos;
}

// ── El programa ─────────────────────────────────────────────────────────────

function principal(argv) {
  const arg = (nombre, defecto) => {
    const i = argv.indexOf(nombre);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : defecto;
  };
  const seco = argv.includes('--seco');
  const codigoLinea = arg('--linea', 'LN-627');
  const rutaFixture = arg('--fixture', join(BOVEDA, `${codigoLinea}-geometria-ampliacion-2026-08.json`));
  const rutaSalida = arg('--salida', RUTA_DECISIONES);

  if (!existsSync(rutaFixture)) {
    console.error(`❌ No está el fixture de ${codigoLinea} en la bóveda:\n   ${rutaFixture}\n`
      + '   Este generador es una herramienta LOCAL: la bóveda no está montada en CI, y no debe estarlo.');
    process.exit(1);
  }

  const fixture = leerJson(rutaFixture);
  const registro = leerRegistro(RUTA_REGISTRO);
  const yaPublicado = existsSync(rutaSalida) ? leerJson(rutaSalida) : {};

  const libro = construirLibro(fixture, { codigoLinea, registro, yaPublicado });
  const motivos = motivosParaNoPublicar(libro, fixture);
  if (motivos.length) {
    console.error('❌ NO se escribe nada. El extracto no está limpio:');
    for (const m of motivos) console.error(`   · ${m}`);
    process.exit(1);
  }

  const pagina = libro[codigoLinea];
  console.log(`📖 ${codigoLinea}: ${pagina.decisiones.length} decisión(es) y ${pagina.pendientes.length} pendiente(s).`);
  for (const f of pagina.decisiones) console.log(`   ✅ ${f.sobre} — decidido el ${f.decididoEn}`);
  for (const f of pagina.pendientes) console.log(`   ⏸  ${f.sobre} — ${f.estado} el ${f.decididoEn}`);

  // Que cada decisión tenga nombre emitido no es cosa de este archivo, pero se
  // avisa aquí porque es donde se puede hacer algo al respecto: una decisión sin
  // semilla no se podrá cargar desde la pantalla, y conviene saberlo antes.
  for (const f of pagina.decisiones) {
    if (!registro?.[codigoLinea]?.[f.sobre]) {
      console.log(`   ⚠️  «${f.sobre}» no tiene nombre emitido en el libro de identidad: se recordará, pero no se podrá cargar.`);
    }
  }

  if (seco) { console.log('\n(--seco: no se escribió nada)'); return; }
  writeFileSync(rutaSalida, `${JSON.stringify(libro, null, 2)}\n`, 'utf-8');
  console.log(`\n💾 Escrito: ${rutaSalida}`);
}

// Solo corre como programa; importarlo desde una prueba no escribe nada.
if (process.argv[1] && process.argv[1].endsWith('publicar-decisiones.mjs')) principal(process.argv.slice(2));
