// ============================================================================
// levantamiento.ts — EL RECORRIDO TAL CUAL LO TRAJO EL GPS, sin interpretar
// ----------------------------------------------------------------------------
// QUÉ GUARDA. Lo que salió del aparato en una jornada de campo: el archivo con
// su huella, quién lo cargó, cuándo, y los puntos con el nombre que el GPS
// grabó. Nada más. **Un levantamiento NO es una lista de torres**: es la prueba
// fechada de que alguien recorrió ese trazado un día y apuntó unos puntos.
//
// POR QUÉ EXISTE (orden del Ingeniero, 2026-09-17). Las dos líneas nuevas del
// parque entran **SIN APOYOS**. Lo levantado se guarda tal cual y se rotula
// «levantado el DD-MM-AAAA · sin registrar como torres»; las torres nacerán de
// aquí el día que él declare la función de cada una — no antes, y no solas.
//
// ── LA FRONTERA, QUE ES LA RAZÓN DE SER DE ESTE MOLDE ──────────────────────
// Entre «lo que se levantó» y «las torres de la línea» hay tres decisiones de
// ingeniería que este documento NO puede tomar, y por eso las PROHÍBE:
//
//   · **La función estructural.** Decide dónde se corta el tramo de tensión y
//     con ello gobierna TODO el cálculo mecánico (`activos.ts §FuncionEstructural`).
//     Un GPS no sabe si un punto es suspensión o retención: eso lo declara quien
//     firma. Deducirla aquí sería fabricar el dato más caro de la línea.
//   · **El orden.** Es lo que ORDENA los vanos. Un punto de más —un empalme a
//     mitad de vano— parte un vano real en dos falsos y cambia la flecha
//     (`docs/40 §10`).
//   · **El nombre canónico.** ES la identidad: el id de un apoyo sale de
//     `sha256(org|código|semilla)` y un apoyo **no se puede borrar**
//     (`firestore.rules`: `allow delete: if false`). Emitir aquí un nombre
//     canónico acuñaría para siempre identidades que todavía nadie ha decidido.
//
// Por eso el punto es `strict` —una clave que no esté en la lista se RECHAZA— y
// además los campos de interpretación se declaran EXPLÍCITAMENTE prohibidos: un
// rechazo que se explica en castellano vale más que uno que dice «unrecognized
// key», porque quien lo lee es el Ingeniero, que no programa.
//
// ⚠️ ESTE DOCUMENTO NO SE CALCULA. Ni vanos, ni deflexiones, ni veredictos.
// Quien quiera números que registre las torres primero; mientras tanto la
// pantalla DICE lo que falta, que es lo honesto (`99 §ADR-029/032`).
// ============================================================================
import { z } from 'zod';
import { Base, Id, Instante, Uid } from './comunes.ts';

// ── El día en que se recorrió ───────────────────────────────────────────────

/** Cuántos días tiene cada mes. Año bisiesto: divisible por 4, salvo siglo no divisible por 400. */
const DIAS_DE_MES = Object.freeze([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
const esBisiesto = (anio: number) => (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;

/**
 * ¿Ese día EXISTE en el calendario?
 *
 * Se cuenta a mano y NO con `new Date(...)` a propósito: `Date` no rechaza nada
 * —«2026-02-31» se convierte calladamente en el 3 de marzo— y además reinterpreta
 * los años de dos cifras (el año 0 se le vuelve 1900, que no es bisiesto cuando el
 * 0 sí lo es). Una aritmética de cuatro líneas no tiene ninguna de las dos
 * sorpresas, y este es un dato que entra en un identificador PERMANENTE.
 *
 * Se exporta para que la pantalla del alta pueda avisar ANTES de intentar guardar,
 * sin copiarse la cuenta. Una cuenta copiada es una segunda cuenta que algún día
 * dice otra cosa.
 */
export function esDiaDelCalendario(fecha: unknown): boolean {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const anio = Number(fecha.slice(0, 4));
  const mes = Number(fecha.slice(5, 7));
  const dia = Number(fecha.slice(8, 10));
  if (mes < 1 || mes > 12 || dia < 1) return false;
  const tope = mes === 2 && esBisiesto(anio) ? 29 : DIAS_DE_MES[mes - 1];
  return dia <= tope;
}

/**
 * `AAAA-MM-DD`. Es el día de la JORNADA DE CAMPO, no el de la carga: el recorrido
 * del 09-08 subido en septiembre sigue siendo del 09-08, y es esa fecha la que se
 * enseña en pantalla y la que envejece el dato.
 *
 * Se valida la FORMA **y que el día exista de verdad**. Antes solo se miraba la
 * forma, con el comentario «que el día exista lo mira quien lo use» — y no lo
 * miraba nadie: `2026-02-31`, `2026-13-01` y `0000-99-99` pasaban enteros. Lo que
 * costaba es que la fecha entra en el id permanente del levantamiento
 * (`herramientas/identidad.mjs §semillaDeLevantamiento`), `firestore.rules` no deja
 * borrar un levantamiento ni reescribir su fecha, y la lista se ordena por TEXTO:
 * un `9999-…` se quedaría para siempre arriba como «el más reciente» y no habría
 * forma de corregirlo, solo de poner otro encima.
 *
 * Es la misma forma que `DiaIso` de `cargabilidad.ts` y **no se importa de allí a
 * propósito**: un levantamiento no depende del módulo de cargabilidad, y colgar el
 * molde de campo de un módulo eléctrico ataría dos cosas que no tienen nada que
 * ver. Una fecha ISO es un formato, no un catálogo de dominio — los catálogos
 * duplicados sí llevan guardián (`33 · L-19`), los formatos no.
 */
export const FechaDeCampo = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'la fecha va como AAAA-MM-DD')
  .refine(esDiaDelCalendario, 'esa fecha no existe en el calendario: el día de la jornada tiene que ser un día real');

// ── Lo que este molde NO admite, dicho con todas las letras ─────────────────

/**
 * LOS CAMPOS DE INTERPRETACIÓN. Ninguno puede viajar dentro de un levantamiento:
 * todos nacen al REGISTRAR la torre, que es un acto posterior y con autor.
 *
 * Viven en una lista exportada —y no escondidos dentro del esquema— para que la
 * pantalla del alta pueda avisar ANTES de intentar guardar, sin copiarse la lista.
 * Una lista copiada es una segunda lista que algún día dice otra cosa.
 */
export const CAMPOS_DE_INTERPRETACION: readonly string[] = Object.freeze([
  'funcionEstructural', 'funcionProcedencia', 'tipoPunto', 'orden',
  'nombreNormalizado', 'deflexion_grados',
]);

/** Cómo se llama cada uno en castellano. Quien lee el rechazo no programa. */
export const ETIQUETA_CAMPO_INTERPRETADO: Readonly<Record<string, string>> = Object.freeze({
  funcionEstructural: 'la función estructural (suspensión, retención…)',
  funcionProcedencia: 'de dónde salió la función estructural',
  tipoPunto: 'si el punto es estructura, empalme o referencia',
  orden: 'la posición del punto en la línea',
  nombreNormalizado: 'el nombre canónico de la torre',
  deflexion_grados: 'la deflexión',
});

/**
 * Declara un campo como PROHIBIDO en vez de dejarlo fuera y callar.
 *
 * `z.never().optional()` acepta que el campo no esté y rechaza cualquier valor,
 * con un mensaje que se puede enseñar tal cual. Es a propósito más ruidoso que
 * omitirlo: un objeto de Zod que no es `strict` BORRA en silencio lo que no
 * conoce, y el silencio es justo el fallo que más caro ha salido en este
 * repositorio (`32 · L-67` — `validar()` descarta sin avisar).
 */
const prohibido = (campo: string) => z.never({
  invalid_type_error:
    `un levantamiento guarda lo que trajo el GPS, sin interpretar: ${ETIQUETA_CAMPO_INTERPRETADO[campo]} ` +
    'se declara al REGISTRAR la torre, no aquí',
}).optional();

/** Las seis prohibiciones, listas para inyectar en los dos esquemas. */
const PROHIBICIONES = Object.fromEntries(
  CAMPOS_DE_INTERPRETACION.map((c) => [c, prohibido(c)]),
) as Record<string, z.ZodOptional<z.ZodNever>>;

/**
 * Qué campos de interpretación trae un objeto cualquiera, en castellano.
 *
 * La pantalla lo usa para explicar por qué no va a guardar algo ANTES de
 * mandarlo; el molde lo hace cumplir de todas formas. Las dos cosas hacen falta:
 * una avisa, la otra impide.
 *
 * ⚠️ El corte es `!== undefined` y NO `!= null`, que es lo que había. La
 * diferencia es exactamente `null`, y no es teórica: un lector de GPX que ponga
 * `orden: null` en los puntos sin numerar dejaba a la pantalla diciendo «nada que
 * avisar» y al guardado cayéndose después, con un mensaje que el aviso nunca
 * predijo. `z.never().optional()` acepta que el campo NO esté (`undefined`) y
 * rechaza cualquier valor, `null` incluido — así que el aviso y el molde ahora
 * cortan por el mismo sitio.
 */
export function camposDeInterpretacion(objeto: unknown): string[] {
  if (!objeto || typeof objeto !== 'object') return [];
  return CAMPOS_DE_INTERPRETACION
    .filter((c) => (objeto as Record<string, unknown>)[c] !== undefined)
    .map((c) => ETIQUETA_CAMPO_INTERPRETADO[c] ?? c);
}

// ── Un punto del recorrido ──────────────────────────────────────────────────

/**
 * UN PUNTO TAL COMO SALIÓ DEL APARATO.
 *
 * `nombreCampo` se conserva sin «arreglarlo»: en el levantamiento de referencia
 * conviven grafías irregulares del mismo sitio, y esa irregularidad ES la
 * trazabilidad con el archivo original. Normalizar aquí borraría la prueba.
 *
 * `ele` es la cota que dio el aparato, no una cota de terreno verificada: un GPS
 * de mano tiene error vertical de 5 a 10 m, del mismo orden que el gálibo que hay
 * que demostrar. Se guarda como dato crudo y nadie firma nada con ella.
 *
 * `instante` es la hora del punto en el archivo. Es lo que permite reconstruir el
 * recorrido y detectar un punto tomado tres horas después que sus vecinos.
 *
 * ⚠️ `strict`: cualquier clave que no esté aquí se RECHAZA. Es un documento que
 * respalda lo que después será un papel firmado, y un campo colado —con el
 * nombre mal escrito o con una interpretación dentro— se quedaría para siempre.
 */
export const PuntoLevantado = z.object({
  /** Como quedó grabado en el GPS. Se conserva tal cual. */
  nombreCampo: z.string().min(1).max(120),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  /** Cota que dio el aparato, en metros. Dato crudo: no es cota verificada. */
  ele: z.number().optional(),
  /** Hora del punto en el archivo. */
  instante: Instante.optional(),
  /**
   * LO QUE LA PERSONA ANOTÓ DE ESE PUNTO. Texto corto y suyo: «la R es anotación
   * mía», «la placa dice E16», «este waypoint lo tomé desde la carretera».
   *
   * POR QUÉ CABE AQUÍ, si el documento ya tiene su propia `nota`. Porque una nota
   * de documento no puede decir de QUÉ punto habla: con 28 puntos, «la R es
   * anotación suya» escrito arriba obliga a adivinar a cuál se refiere, y en seis
   * años nadie lo sabrá. Es la misma razón por la que el `nombreCampo` se conserva
   * tal cual: lo que respalda un papel firmado se guarda pegado a su punto.
   *
   * ⚠️ NO ES UNA RENDIJA PARA INTERPRETAR. Es texto libre que nadie calcula, y las
   * seis prohibiciones de arriba siguen en pie: la función estructural, el orden,
   * el nombre canónico, el tipo de punto, la procedencia y la deflexión NO se
   * declaran aquí ni escritas en castellano dentro de esta nota. Lo que se escriba
   * aquí es un recuerdo del recorrido, no un dato del que salga un número.
   *
   * 200 caracteres a propósito: una quinta parte de la nota del documento. Es una
   * anotación de campo, no un informe — y 500 puntos con nota larga acercarían el
   * documento al tope de 1 MiB de Firestore, que es justo lo que el tope de puntos
   * evita.
   */
  nota: z.string().max(200).optional(),
  ...PROHIBICIONES,
}).strict();

// ── El documento ────────────────────────────────────────────────────────────

/**
 * EL LEVANTAMIENTO: una jornada de campo, un archivo, unos puntos.
 *
 * ── A QUÉ SE ANOTA ────────────────────────────────────────────────────────
 * `serieId` es la SERIE a la que pertenece lo levantado: una línea (`LN-617`) o
 * un tramo compartido (`TR-618`). Es el mismo espacio de identidad que usa
 * `apoyo.lineaId`, para que el día que las torres se registren caigan donde
 * corresponde sin mover nada. `codigoSerie` es el rótulo legible que se enseña;
 * el dueño del código sigue siendo el libro de códigos, aquí solo se copia para
 * poder leer el documento sin cruzarlo con nada.
 *
 * ── POR QUÉ LA HUELLA DEL ARCHIVO ES OBLIGATORIA ──────────────────────────
 * Sin ella, cargar dos veces el mismo GPX da dos levantamientos distintos y
 * nadie puede decir cuál sobra; y dentro de un año no hay forma de demostrar que
 * los puntos guardados son los del archivo que se enseñó. Es la misma razón por
 * la que `CargaDeCargabilidad` la guarda: este producto entero se sostiene sobre
 * poder responder «¿de dónde salió este número?».
 *
 * ── EL TOPE DE 500 PUNTOS ─────────────────────────────────────────────────
 * Un documento de Firestore no pasa de 1 MiB y aquí no hay excusa para
 * acercarse: 500 puntos son unos 60 KB. Una jornada de campo no da para más, y
 * un recorrido más largo son VARIAS jornadas — que es exactamente como se debe
 * guardar, cada una con su fecha y su archivo, y no todo aplastado en un
 * documento que ya nadie sabe de qué día es.
 *
 * ⚠️ NO es `strict` a propósito, al revés que el punto. Un documento que se LEE
 * y que un día gane un campo desaparecería entero de la pantalla, en silencio,
 * contra los bundles ya desplegados. Lo que había que impedir —la
 * interpretación— está impedido con nombre y apellido arriba.
 */
export const Levantamiento = Base.extend({
  tipo: z.literal('levantamiento'),

  /** La línea o el tramo compartido al que se anota lo levantado. */
  serieId: Id,
  /** `LN-617`, `TR-618`… El rótulo legible de esa serie. */
  codigoSerie: z.string().min(1).max(24).regex(/^[A-Za-z0-9._-]+$/,
    'el código de la serie va en ASCII y sin espacios: viaja en nombres de archivo y en claves de exportación'),

  /** El día de la JORNADA DE CAMPO. No el de la carga. */
  fecha: FechaDeCampo,
  /** Con qué se levantó, si consta. Texto libre corto: «GPS de mano», un modelo. */
  aparato: z.string().min(1).max(120).optional(),

  /** De qué archivo salió todo. */
  archivo: z.object({
    nombre: z.string().min(1).max(260),
    /** SHA-256 del contenido. Dos archivos con el mismo contenido son el mismo. */
    huella: z.string().regex(/^[0-9a-f]{64}$/, 'la huella es el SHA-256 del archivo, en minúsculas'),
  }).strict(),

  cargadoEn: Instante,
  cargadoPor: Uid,

  /** Los puntos, en el orden en que venían en el archivo. */
  puntos: z.array(PuntoLevantado).min(1).max(500),

  /**
   * Lo que quien cargó quiera dejar dicho DE LA JORNADA ENTERA: «faltan E01-E06»,
   * «se recorrió con lluvia». No es un dato de cálculo.
   *
   * Lo que se anota de UN punto concreto va en la nota de ese punto
   * (`PuntoLevantado.nota`), no aquí: una nota de documento no puede decir de cuál
   * de los 28 puntos habla.
   */
  nota: z.string().max(1000).optional(),

  // Las mismas seis prohibiciones, también arriba: que nadie resuma el
  // levantamiento entero con una función estructural «de la línea».
  ...PROHIBICIONES,
});

export type FechaDeCampo = z.infer<typeof FechaDeCampo>;
export type PuntoLevantado = z.infer<typeof PuntoLevantado>;
export type Levantamiento = z.infer<typeof Levantamiento>;
