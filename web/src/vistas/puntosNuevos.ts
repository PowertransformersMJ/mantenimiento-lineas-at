// ============================================================================
// vistas/puntosNuevos.ts — lo que la pantalla de carga necesita SABER
// ----------------------------------------------------------------------------
// Devuelve DATOS, no marcado, igual que el resto de `vistas/`. Existe por la
// regla dura de esta entrega: **dentro del `.tsx` no hay ni una fórmula**. La
// pantalla pregunta y pinta; la geodesia se la pide al núcleo desde aquí, que
// es código sin React y por tanto comprobable.
//
// LAS DOS COSAS QUE ESTE ARCHIVO NO HACE, Y NO POR OLVIDO:
//
// 1. NO PROPONE EN QUÉ VANO CAE EL PUNTO. Se enseñan las distancias crudas del
//    punto del GPS a cada vecino, en el orden del recorrido de la línea y
//    **nunca ordenadas por cercanía**: ordenar por distancia es un dictamen
//    disfrazado de lista, y el primero de una lista se lee como el bueno. El
//    aparato declara ±8 m; a esa escala la distancia sola no decide de qué lado
//    del vano cae un punto. Lo elige el Ingeniero.
//
// 2. NO RECALCULA LAS CIFRAS DE LA LÍNEA. El antes y el después salen del mismo
//    motor que pinta las demás pestañas, corrido dos veces por
//    `@lineas/importar/plan`. Aquí solo se VISTEN esas cifras para una tabla.
//    Si esta pantalla tuviera su propia aritmética, el día que discrepara de
//    Resumen nadie sabría cuál mirar.
// ============================================================================
import { vincenty } from '@lineas/nucleo/geodesia';
import { FUNCIONES_ANCLA } from '@lineas/contratos';
import type { Apoyo } from '@lineas/contratos';
// El lector del libro de decisiones firmadas. Es PURO —ni DOM ni `node:`— y por
// eso puede vivir en el mismo paquete que lee el GPX: lo que sale de él no es
// una deducción, es lo que el Ingeniero escribió con su fecha.
import {
  decisionVigente, decisionesVigentes, enCastellano, loQueSeRecuerda, pendientesDe,
} from '@lineas/importar/decisiones';
// Los hermanos se importan CON extensión, como hace `estadoLinea.ts`: sin ella
// este archivo solo lo sabe resolver el empaquetador, y entonces deja de poder
// probarse con `node --test`. Un módulo que no se puede probar sin navegador
// acaba sin pruebas, y éste decide qué se le enseña al Ingeniero antes de un
// acto que no se puede deshacer.
import { nombreVisible } from './planta.ts';
import { nf } from './formato.ts';

/** Valor con que la pantalla dice «va al final de la línea». No es un nombre. */
export const AL_FINAL = '__al_final__';

/** Precisión declarada de un GPS de mano, en metros. La declara `@lineas/importar`. */
export const PRECISION_DECLARADA_M = 8;

export interface OpcionPosicion {
  /** El nombre del punto que lo precede, o `AL_FINAL`. */
  valor: string;
  /** «detrás de LN-627 E03», o «al final de la línea». */
  rotulo: string;
  /** Distancia del punto del GPS al vecino de atrás. Cruda, sin interpretar. */
  distanciaAtras_m: number | null;
  /** Distancia al vecino de delante; `null` cuando no hay ninguno detrás. */
  distanciaAdelante_m: number | null;
}

/** La secuencia real de la línea. Se respeta tal cual: aquí no se reordena nada. */
const enSecuencia = (apoyos: Apoyo[]): Apoyo[] =>
  [...apoyos].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

const distancia = (a: Apoyo, lat: number, lon: number): number | null => {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const c = a.coordenada;
  if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lon)) return null;
  return vincenty(c.lat, c.lon, lat, lon).d as number;
};

/**
 * Dónde puede ir un punto nuevo, con la distancia cruda a cada vecino.
 *
 * La lista sale en el orden del recorrido de la línea y termina con «al final».
 * El hueco de **antes del primer punto** no se ofrece: no existe camino hoy
 * para colocarlo ahí sin mover todo lo que ya está cargado, y ofrecerlo para
 * después negarlo sería peor que no ofrecerlo. Quien lo intente recibe el
 * motivo entero desde `@lineas/importar`.
 */
export function posicionesPosibles(apoyos: Apoyo[], lat: number, lon: number): OpcionPosicion[] {
  const secuencia = enSecuencia(apoyos);
  if (!secuencia.length) return [];

  const opciones: OpcionPosicion[] = [];
  for (let i = 0; i < secuencia.length - 1; i++) {
    const a = secuencia[i];
    // Un punto SIN nombre canónico no se puede ofrecer como vecino: la
    // colocación se resuelve por ese nombre, así que la opción existiría en la
    // lista y no encajaría con nada. Se omite en vez de ofrecerla y negarla
    // después — hoy los 26 puntos cargados lo tienen, y el día que entre uno sin
    // él esta lista se acorta sola en vez de mentir.
    if (!a.nombreNormalizado) continue;
    opciones.push({
      valor: a.nombreNormalizado,
      rotulo: `detrás de ${nombreVisible(a)}`,
      distanciaAtras_m: distancia(a, lat, lon),
      distanciaAdelante_m: distancia(secuencia[i + 1], lat, lon),
    });
  }

  const ultimo = secuencia[secuencia.length - 1];
  opciones.push({
    valor: AL_FINAL,
    rotulo: `al final de la línea, después de ${nombreVisible(ultimo)}`,
    distanciaAtras_m: distancia(ultimo, lat, lon),
    distanciaAdelante_m: null,
  });
  return opciones;
}

/**
 * «el punto» · «los 2 puntos». Existe porque el botón que dispara el único acto
 * irreversible del sistema no puede leerse como un formulario: «cargar los 1
 * punto(s)» hace dudar de si el programa sabe cuántos va a escribir, y la duda
 * llega justo en el segundo en que hay que decidir.
 */
export const contarPuntos = (n: number): string =>
  (n === 1 ? 'el punto' : `los ${nf(n)} puntos`);

/** Cómo se lee una distancia cruda, con su incertidumbre pegada. */
export const textoDistancia = (m: number | null): string =>
  (m === null ? 'sin medir' : `${nf(m, 1)} m`);

/** El rótulo legible de un sitio elegido, o el hueco declarado. */
export const rotuloDelSitio = (opciones: OpcionPosicion[], valor: string): string =>
  opciones.find((o) => o.valor === valor)?.rotulo ?? 'sin sitio declarado';

// ── Cómo se lee lo que el aparato trajo (y lo que no trajo) ─────────────────

/**
 * La cota, o la declaración de que no la hay.
 *
 * NUNCA un cero. Un cero se leería como nivel del mar y acabaría en un cálculo
 * de gálibo; la ausencia se dice con palabras.
 */
export const textoCota = (ele?: number): string =>
  (ele === undefined ? 'sin cota: el GPS no la grabó' : `${nf(ele, 1)} m`);

/** La hora de la toma en castellano, o la declaración de que el aparato no la grabó. */
export function textoHora(utc?: string): string {
  if (!utc) return 'sin hora: el GPS no la grabó';
  const d = new Date(utc);
  // Un instante ilegible se enseña TAL CUAL vino del archivo. Inventarle una
  // fecha o esconderlo sería peor: es el único rastro de cuándo se levantó.
  if (Number.isNaN(d.getTime())) return utc;
  return d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Qué consecuencia tiene el papel estructural que se declare, derivada del
 * MOLDE de los datos y no de una lista escrita a mano aquí.
 *
 * Es la diferencia entera entre una ayuda y una mentira: el día que el molde
 * mueva una función de un grupo al otro, esta frase se mueve con ella.
 */
export const consecuenciaDeFuncion = (f: string): string =>
  (FUNCIONES_ANCLA.includes(f)
    ? 'ancla el conductor: aquí se CORTA el tramo de tensión, y cada tramo se calcula aparte'
    : 'no ancla el conductor: el tramo de tensión sigue de largo a través de este punto');

/** Qué consecuencia tiene declarar una cosa u otra. Sale del molde, punto por punto. */
export const CONSECUENCIA_TIPO: Record<string, string> = {
  'Estructura': 'sostiene el conductor: abre vano y entra en el cálculo mecánico',
  'Empalme': 'une el conductor y no sostiene nada: no cuenta como vano, así que no mueve el promedio ni el cálculo mecánico',
  'Punto de referencia': 'es una marca del levantamiento: no sostiene nada y no abre vano',
};

// ── La ficha de un punto: lo que el aparato trajo + lo que él contesta ──────

/**
 * Un punto del archivo del GPS con las cinco respuestas del Ingeniero pegadas.
 *
 * Todas las respuestas arrancan VACÍAS a propósito, incluida la aprobación. Un
 * campo prerrellenado sobre un acto que no se puede deshacer es un ancla: quien
 * ve una opción ya puesta la confirma, no la decide. Aquí no se propone nada.
 */
export interface FichaDeCarga {
  /** Identifica la ficha dentro de la pantalla. No viaja a ningún sitio. */
  clave: string;
  /** El archivo del que salió, para poder decir de cuál vino cada punto. */
  archivo: string;
  /** Como quedó grabado en el aparato, tal cual. */
  nombreCampo: string;
  lat: number;
  lon: number;
  /** Solo si el aparato la grabó. Si no, la clave no existe: nunca un cero. */
  ele?: number;
  utc?: string;
  // ── Las cinco preguntas ──────────────────────────────────────────────────
  nombreCanonico: string;
  tipoPunto: string;
  sitio: string;
  funcionEstructural: string;
  funcionConfirmada: boolean;
  aprobado: boolean;
  /** Por qué lo dejó pendiente, en sus palabras. */
  motivoPendiente: string;
  /** Por qué decidió así. No cabe en el molde de los datos: solo vive en el acta. */
  porQue: string;
}

/** Una ficha recién leída del archivo, sin ninguna respuesta puesta. */
export function fichaEnBlanco(
  archivo: string,
  clave: string,
  w: { nombreCampo?: string; lat: number; lon: number; ele?: number; utc?: string },
): FichaDeCarga {
  const f: FichaDeCarga = {
    clave, archivo,
    nombreCampo: w.nombreCampo ?? '',
    lat: w.lat, lon: w.lon,
    nombreCanonico: '', tipoPunto: '', sitio: '', funcionEstructural: '',
    funcionConfirmada: false, aprobado: false, motivoPendiente: '', porQue: '',
  };
  // Lo que el aparato no grabó NO se crea como clave. Ver la regla de
  // `@lineas/importar/gpx`: una ausencia no es un cero.
  if (w.ele !== undefined) f.ele = w.ele;
  if (w.utc !== undefined) f.utc = w.utc;
  return f;
}

/**
 * Qué preguntas quedan sin contestar en una ficha APROBADA.
 *
 * Es lo que apaga el botón, y por eso devuelve el texto de la pregunta y no un
 * nombre de campo: «falta contestar “dónde va”» se entiende; «falta `sitio`»
 * manda a buscar a alguien que sepa de programación.
 *
 * Una ficha que NO está aprobada no tiene faltas: dejarla pendiente es una
 * respuesta completa, no un formulario a medias.
 */
export function faltantesDe(f: FichaDeCarga): string[] {
  if (!f.aprobado) return [];
  const faltan: string[] = [];
  if (!f.nombreCanonico) faltan.push('cuál de sus puntos aprobados es');
  if (!f.tipoPunto) faltan.push('qué es');
  if (!f.sitio) faltan.push('dónde va');
  if (!f.funcionEstructural) faltan.push('qué papel estructural cumple');
  return faltan;
}

/**
 * Los nombres que esta ficha puede elegir: los que están anotados en el libro y
 * todavía no están cargados, MENOS los que ya eligió otra ficha de la pantalla.
 *
 * Sin este descuento, dos puntos del mismo archivo podrían apuntar al mismo
 * nombre y el segundo pisaría al primero. `@lineas/importar` lo detendría, pero
 * lo detendría al final; aquí no llega ni a poder elegirse.
 */
export function nombresParaLaFicha(
  disponibles: string[], fichas: FichaDeCarga[], clave: string,
): string[] {
  const tomados = new Set(
    fichas.filter((o) => o.clave !== clave && o.nombreCanonico).map((o) => o.nombreCanonico));
  return disponibles.filter((n) => !tomados.has(n));
}

/**
 * Lo que `@lineas/importar` espera de cada punto.
 *
 * Se declara con nombres y tipos, y no como un saco de claves sueltas, para que
 * el compilador cace aquí —y no en producción— el día que el paquete pida un
 * campo más. Un documento al que le falta un campo no se escribe mal: se
 * descarta en silencio o se escribe incompleto, y en apoyos no hay deshacer.
 */
export interface DecisionDeCarga {
  nombreCanonico: string;
  nombreCampo: string;
  estado: string;
  tipoPunto: string;
  funcionEstructural: string;
  funcionConfirmada: boolean;
  lat: number;
  lon: number;
  ele?: number;
  utc?: string;
  motivoPendiente?: string;
  insertarAlFinal?: boolean;
  insertarDespuesDe?: string;
}

/**
 * La ficha, traducida a lo que `@lineas/importar` espera.
 *
 * Aquí no se decide nada: se cambia de vocabulario. La pantalla habla de
 * «sitio» porque es lo que el Ingeniero elige; el paquete habla de «después de»
 * o «al final» porque es lo que necesita para colocarlo sin mover a nadie.
 */
export function decisionDeLaFicha(f: FichaDeCarga): DecisionDeCarga {
  const d: DecisionDeCarga = {
    nombreCanonico: f.nombreCanonico,
    nombreCampo: f.nombreCampo,
    estado: f.aprobado ? 'aprobado' : 'pendiente',
    tipoPunto: f.tipoPunto,
    funcionEstructural: f.funcionEstructural,
    funcionConfirmada: f.funcionConfirmada,
    lat: f.lat,
    lon: f.lon,
  };
  if (f.ele !== undefined) d.ele = f.ele;
  if (f.utc !== undefined) d.utc = f.utc;
  if (f.motivoPendiente.trim()) d.motivoPendiente = f.motivoPendiente.trim();
  if (f.sitio === AL_FINAL) d.insertarAlFinal = true;
  else if (f.sitio) d.insertarDespuesDe = f.sitio;
  return d;
}

// ════════════════════════════════════════════════════════════════════════════
// LO QUE ÉL YA DECIDIÓ — memoria, jamás propuesta
// ----------------------------------------------------------------------------
// LA DISTINCIÓN QUE GOBIERNA TODO ESTE BLOQUE, y que no se puede perder de vista
// al tocarlo:
//
//     PROPONER = el sistema deduce algo y lo deja marcado.        PROHIBIDO.
//     RECORDAR = el Ingeniero ya lo decidió, con fecha y con firma,
//                y esto se lo devuelve para que lo RATIFIQUE o lo cambie.
//
// El veto de ADR-028 sigue ENTERO en pie: aquí no se propone el papel
// estructural, ni el nombre canónico, ni en qué vano cae un punto. Todo lo que
// sale de estas funciones lo escribió él en `herramientas/decisiones-firmadas.json`
// con su fecha, y viaja SIEMPRE pegado a esa fecha. Un valor sin sello no se
// devuelve: se queda fuera.
//
// LAS DOS PREGUNTAS QUE NO SE RECUERDAN NUNCA, y no por olvido:
//
//   1. CUÁL DE SUS PUNTOS ES ÉSTE. Es la que abre la puerta a las otras cuatro.
//      Si se dedujera, las demás se rellenarían solas a partir de una deducción
//      del sistema vestida con la fecha de él. El recuerdo se dispara con SU
//      acto de nombrar, y no antes.
//   2. LA APROBACIÓN. Aprobar es el ACTO irreversible; el recuerdo es memoria de
//      una intención. Que el 16 de agosto lo aprobara no lo aprueba hoy. La
//      casilla empieza vacía SIEMPRE, y la pantalla dice por qué.
// ════════════════════════════════════════════════════════════════════════════

/** Los cuatro campos de la ficha que un recuerdo puede rellenar. Ni uno más. */
export type CampoRecordado = 'tipoPunto' | 'sitio' | 'funcionEstructural' | 'funcionConfirmada';

/** Cómo se llama cada uno en la pantalla — nunca el nombre del campo. */
export const ROTULO_RECORDADO: Record<CampoRecordado, string> = {
  tipoPunto: 'qué es',
  sitio: 'dónde va',
  funcionEstructural: 'qué papel estructural cumple',
  funcionConfirmada: 'si firma usted ese papel estructural',
};

/**
 * Un valor recordado con la fecha que lo respalda, **inseparables**.
 *
 * El valor y su sello viajan en el mismo objeto a propósito: así la pantalla no
 * tiene forma de pintar uno sin el otro, porque nunca recibe uno sin el otro.
 */
export interface SelloDeCampo {
  /** El valor tal como entra en la ficha. */
  valor: string | boolean;
  /** Ese mismo valor, dicho para leerlo. */
  comoSeLee: string;
  decididoPor: string;
  decididoEn: string;
  /** «decidido por usted el 16 de agosto de 2026». */
  sello: string;
}

export type ProcedenciaDeFicha = Partial<Record<CampoRecordado, SelloDeCampo>>;

/** Lo que el libro decidió y esta pantalla NO puso, con el motivo escrito. */
export interface NoSePudoRecordar {
  rotulo: string;
  porQue: string;
}

export interface RecuerdoAplicado {
  ficha: FichaDeCarga;
  procedencia: ProcedenciaDeFicha;
  noSePudoPoner: NoSePudoRecordar[];
}

/** La forma de una fila del libro, con lo poco que esta vista necesita de ella. */
interface FilaFirmada {
  sobre: string;
  decididoPor: string;
  decididoEn: string;
  estado?: string;
  tipoPunto?: string;
  funcionEstructural?: string;
  funcionConfirmada?: boolean;
  funcionConfirmadaEn?: string;
  porQue?: string;
}

/** Cómo se lee un sitio guardado, sin depender de que la línea esté cargada. */
const comoSeLeeUnSitio = (valor: string): string => {
  if (valor === AL_FINAL) return 'al final de la línea';
  return valor ? `detrás de ${valor}` : 'sin sitio declarado';
};

/** Cómo se lee la firma del papel estructural, que es un hecho aparte del papel. */
const comoSeLeeLaFirma = (v: boolean): string =>
  (v ? 'lo confirma usted' : 'usted no firmó este papel');

/** El valor actual de un campo de la ficha, dicho para leerlo. */
function comoSeLeeElCampo(f: FichaDeCarga, campo: CampoRecordado): string {
  if (campo === 'funcionConfirmada') return comoSeLeeLaFirma(f.funcionConfirmada);
  if (campo === 'sitio') return comoSeLeeUnSitio(f.sitio);
  const v = campo === 'tipoPunto' ? f.tipoPunto : f.funcionEstructural;
  return v || 'sin contestar';
}

/** ¿Está este campo como lo dejó el recuerdo? Es lo único que da derecho a sello. */
const estaComoLoDejoElRecuerdo = (f: FichaDeCarga, s: SelloDeCampo, campo: CampoRecordado): boolean =>
  (campo === 'funcionConfirmada' ? f.funcionConfirmada === s.valor : f[campo] === s.valor);

/**
 * Los sellos que HOY se pueden pintar: solo los de campos que siguen tal como
 * él los decidió.
 *
 * Es el único camino por el que la pantalla obtiene un sello, y por construcción
 * cada sello trae su fecha dentro. Un campo que él cambió deja de tener sello y
 * pasa a tener aviso de cambio: son dos cosas distintas y se ven distintas.
 */
export function sellosVivos(f: FichaDeCarga, p: ProcedenciaDeFicha): ProcedenciaDeFicha {
  const vivos: ProcedenciaDeFicha = {};
  for (const [campo, sello] of Object.entries(p) as [CampoRecordado, SelloDeCampo][]) {
    if (estaComoLoDejoElRecuerdo(f, sello, campo)) vivos[campo] = sello;
  }
  return vivos;
}

/** La fecha en que él decidió lo que hoy se le está recordando, en castellano. */
export function fechaDelRecuerdo(p: ProcedenciaDeFicha): string {
  const fechas = Object.values(p).map((s) => s.decididoEn).sort();
  return fechas.length ? enCastellano(fechas[0]) : '';
}

/**
 * Pone en la ficha lo que él decidió en su día, campo por campo y con la fecha
 * que respalda cada uno.
 *
 * LAS DOS COSAS QUE NO TOCA, Y NO POR OLVIDO: `nombreCanonico`, porque lo elige
 * él y es lo que dispara el recuerdo —devolverlo sería que el recuerdo se
 * auto-alimentara—, y `aprobado`, porque aprobar es el acto irreversible.
 *
 * NO PISA UNA RESPUESTA DE HOY. Si él ya contestó ese campo en esta pantalla,
 * manda lo de hoy y el recuerdo se queda fuera, dicho con su motivo. Y un sitio
 * que hoy no existe en la lista tampoco se pone: rellenar un desplegable con una
 * opción que no está lo deja en blanco sin decir por qué.
 *
 * @param sitios las posiciones que la pantalla ofrece de verdad; vacío = no comprobar
 */
export function recordarEnLaFicha(
  ficha: FichaDeCarga, decision: unknown, sitios: OpcionPosicion[] = [],
): RecuerdoAplicado {
  const nada: RecuerdoAplicado = { ficha, procedencia: {}, noSePudoPoner: [] };
  if (!decision) return nada;

  const recordado = loQueSeRecuerda(decision) as {
    valores: Record<string, unknown>;
    procedencia: Record<string, { decididoPor: string; decididoEn: string; sello: string }>;
  };
  const { valores, procedencia } = recordado;
  if (!valores || !Object.keys(valores).length) return nada;

  // Del vocabulario del libro al de la pantalla. El libro habla de «después de»
  // o «al final» porque es lo que el paquete necesita para colocar sin mover a
  // nadie; la pantalla habla de «sitio» porque es lo que él elige.
  const candidatos: { campo: CampoRecordado; valor: string | boolean; comoSeLee: string; clave: string }[] = [];
  if (typeof valores.tipoPunto === 'string') {
    candidatos.push({ campo: 'tipoPunto', valor: valores.tipoPunto, comoSeLee: valores.tipoPunto, clave: 'tipoPunto' });
  }
  if (valores.insertarAlFinal === true) {
    candidatos.push({ campo: 'sitio', valor: AL_FINAL, comoSeLee: comoSeLeeUnSitio(AL_FINAL), clave: 'insertarAlFinal' });
  } else if (typeof valores.insertarDespuesDe === 'string') {
    const v = valores.insertarDespuesDe;
    candidatos.push({ campo: 'sitio', valor: v, comoSeLee: comoSeLeeUnSitio(v), clave: 'insertarDespuesDe' });
  }
  if (typeof valores.funcionEstructural === 'string') {
    candidatos.push({
      campo: 'funcionEstructural', valor: valores.funcionEstructural,
      comoSeLee: valores.funcionEstructural, clave: 'funcionEstructural',
    });
  }
  if (typeof valores.funcionConfirmada === 'boolean') {
    candidatos.push({
      campo: 'funcionConfirmada', valor: valores.funcionConfirmada,
      comoSeLee: comoSeLeeLaFirma(valores.funcionConfirmada), clave: 'funcionConfirmada',
    });
  }

  const puesta: FichaDeCarga = { ...ficha };
  const sellos: ProcedenciaDeFicha = {};
  const noSePudoPoner: NoSePudoRecordar[] = [];

  for (const c of candidatos) {
    const origen = procedencia?.[c.clave];
    // Sin quién y sin cuándo no hay memoria, hay opinión. Se descarta entero.
    if (!origen?.decididoPor || !origen?.decididoEn) continue;

    if (c.campo === 'sitio' && sitios.length && !sitios.some((s) => s.valor === c.valor)) {
      noSePudoPoner.push({
        rotulo: ROTULO_RECORDADO.sitio,
        porQue: `Usted decidió que iba ${c.comoSeLee}, y hoy ese sitio no está entre los que esta `
          + 'pantalla puede ofrecer. No se pone nada: elíjalo usted mirando las distancias de abajo.',
      });
      continue;
    }

    const enBlanco = c.campo === 'funcionConfirmada'
      ? puesta.funcionConfirmada === false
      : puesta[c.campo] === '';
    const yaIgual = c.campo === 'funcionConfirmada'
      ? puesta.funcionConfirmada === c.valor
      : puesta[c.campo] === c.valor;

    if (!enBlanco && !yaIgual) {
      noSePudoPoner.push({
        rotulo: ROTULO_RECORDADO[c.campo],
        porQue: `Usted ya contestó esto hoy en esta pantalla, así que manda su respuesta de hoy: `
          + `el recuerdo no la pisa. Lo que decidió el ${enCastellano(origen.decididoEn)} fue `
          + `«${c.comoSeLee}».`,
      });
      continue;
    }

    if (enBlanco) {
      if (c.campo === 'funcionConfirmada') puesta.funcionConfirmada = c.valor === true;
      else if (c.campo === 'tipoPunto') puesta.tipoPunto = String(c.valor);
      else if (c.campo === 'sitio') puesta.sitio = String(c.valor);
      else puesta.funcionEstructural = String(c.valor);
    }
    sellos[c.campo] = {
      valor: c.valor,
      comoSeLee: c.comoSeLee,
      decididoPor: origen.decididoPor,
      decididoEn: origen.decididoEn,
      sello: origen.sello,
    };
  }

  return { ficha: puesta, procedencia: sellos, noSePudoPoner };
}

/**
 * Vacía UN campo recordado — lo que hace el botón «Cambiar».
 *
 * El sello NO se borra: se conserva para poder decirle, cuando conteste otra
 * cosa, que lo que decidió aquel día sigue siendo un hecho. Borrarlo aquí haría
 * imposible el aviso de cambio de opinión, que es justo lo que él pidió ver.
 */
export function vaciarLoRecordado(f: FichaDeCarga, campo: CampoRecordado): FichaDeCarga {
  if (campo === 'funcionConfirmada') return { ...f, funcionConfirmada: false };
  if (campo === 'tipoPunto') return { ...f, tipoPunto: '' };
  if (campo === 'sitio') return { ...f, sitio: '' };
  return { ...f, funcionEstructural: '' };
}

/**
 * Retira de la ficha lo que puso un recuerdo anterior, y SOLO eso.
 *
 * Se usa cuando él cambia de nombre en la pregunta 1: lo que estaba puesto por
 * el nombre viejo deja de valer, pero lo que contestó él con sus manos se queda.
 * Distinguir las dos cosas es la diferencia entre ayudarle y borrarle trabajo.
 */
export function olvidarElRecuerdo(f: FichaDeCarga, p: ProcedenciaDeFicha): FichaDeCarga {
  let salida = f;
  for (const [campo, sello] of Object.entries(p) as [CampoRecordado, SelloDeCampo][]) {
    if (estaComoLoDejoElRecuerdo(salida, sello, campo)) salida = vaciarLoRecordado(salida, campo);
  }
  return salida;
}

export interface CambioSobreLoFirmado {
  campo: CampoRecordado;
  rotulo: string;
  /** Lo que decidió aquel día. */
  decidido: string;
  /** Lo que deja hoy. */
  hoy: string;
  decididoEn: string;
  /** La frase entera, para pintarla tal cual. */
  aviso: string;
}

/**
 * En qué se ha apartado hoy de lo que firmó en su día.
 *
 * No es un reproche ni un bloqueo: manda lo que él deje hoy. Es que las dos
 * cosas son hechos —aquel día decidió una y hoy carga otra— y el acta tiene que
 * llevar las dos. Un cambio silencioso convertiría el libro de decisiones en un
 * papel que dice algo distinto de lo que se cargó.
 */
export function cambiosSobreLoRecordado(
  f: FichaDeCarga, p: ProcedenciaDeFicha,
): CambioSobreLoFirmado[] {
  const cambios: CambioSobreLoFirmado[] = [];
  for (const [campo, sello] of Object.entries(p) as [CampoRecordado, SelloDeCampo][]) {
    if (estaComoLoDejoElRecuerdo(f, sello, campo)) continue;
    const hoy = comoSeLeeElCampo(f, campo);
    const cuando = enCastellano(sello.decididoEn);
    const vacio = campo === 'funcionConfirmada' ? false : f[campo] === '';
    const aviso = vacio
      ? `Ha retirado «${sello.comoSeLee}», que es lo que usted decidió el ${cuando}. Eso no se `
        + `borra: sigue escrito que ese día decidió ${sello.comoSeLee}. Conteste usted qué carga hoy.`
      : `Ha cambiado «${sello.comoSeLee}» por «${hoy}». Lo que usted decidió el ${cuando} NO se `
        + `borra: queda escrito que ese día decidió ${sello.comoSeLee} y que hoy carga ${hoy}. `
        + 'Las dos cosas son hechos, y el acta lleva las dos.';
    cambios.push({ campo, rotulo: ROTULO_RECORDADO[campo], decidido: sello.comoSeLee, hoy, decididoEn: sello.decididoEn, aviso });
  }
  return cambios;
}

/**
 * Lo que dice la pantalla debajo de la casilla de aprobación. SIEMPRE, haya
 * recuerdo o no.
 *
 * Que él aprobara un punto en su día NO lo aprueba hoy, y la casilla empieza
 * vacía aunque el libro diga «aprobado». Es la única de las cinco preguntas
 * cuyo efecto no se puede deshacer, y por eso es la única que no se hereda.
 */
export function avisoDeLaAprobacion(decision: unknown): string {
  const d = decision as FilaFirmada | undefined;
  const cola = 'esta casilla empieza vacía siempre, porque al marcarla se escribe algo que no se '
    + 'puede deshacer.';
  if (d?.estado === 'aprobado' && d?.decididoEn) {
    return `Aprobar es el acto, no el recuerdo. Que el ${enCastellano(d.decididoEn)} usted lo `
      + `aprobara no lo aprueba hoy: ${cola}`;
  }
  return `Aprobar es el acto, no el recuerdo. Aquí no se hereda ninguna aprobación: ${cola}`;
}

// ── El bloque de cabecera: lo ya decidido y lo dejado pendiente ─────────────

export interface LoYaDecidido {
  sobre: string;
  decididoEn: string;
  /** La fila entera, escrita para leerla de un vistazo. */
  texto: string;
}

/**
 * Lo que él decidió sobre esta línea y todavía no está cargado.
 *
 * SE FILTRA POR LOS NOMBRES QUE SIGUEN DISPONIBLES, y eso no es cosmética: en
 * cuanto un punto está cargado, la verdad es la base. **CARGADO manda sobre
 * FIRMADO.** La fila del libro se queda como historia de lo que decidió ANTES de
 * cargar, pero deja de mandar, y por eso deja de enseñarse aquí.
 */
export function loQueYaDecidio(
  registro: Record<string, unknown>, codigoLinea: string, disponibles: string[],
): LoYaDecidido[] {
  const filas = decisionesVigentes(registro, codigoLinea) as FilaFirmada[];
  return filas
    .filter((d) => disponibles.includes(d.sobre))
    .map((d) => {
      const comoLoDecidio = d.estado === 'aprobado' ? 'usted lo aprobó' : 'usted lo decidió';
      const partes = [`${d.sobre} — ${comoLoDecidio} el ${enCastellano(d.decididoEn)}.`];
      if (d.tipoPunto) partes.push(`Qué es: ${d.tipoPunto}.`);
      const sitio = sitioDeLaFila(d);
      if (sitio) partes.push(`Dónde va: ${sitio}.`);
      if (d.funcionEstructural) {
        partes.push(d.funcionConfirmada && d.funcionConfirmadaEn
          ? `Papel estructural: ${d.funcionEstructural}, confirmado por usted el ${enCastellano(d.funcionConfirmadaEn)}.`
          : `Papel estructural: ${d.funcionEstructural} — este NO lo firmó usted, así que quedará como SUPUESTO.`);
      }
      return { sobre: d.sobre, decididoEn: d.decididoEn, texto: partes.join(' ') };
    });
}

/** El sitio de una fila del libro, en castellano. Sin geometría: lo dijo él. */
function sitioDeLaFila(d: FilaFirmada): string {
  const sitio = (d as { sitio?: { insertarAlFinal?: boolean; insertarDespuesDe?: string } }).sitio;
  if (sitio?.insertarAlFinal === true) return comoSeLeeUnSitio(AL_FINAL);
  if (sitio?.insertarDespuesDe) return comoSeLeeUnSitio(sitio.insertarDespuesDe);
  return '';
}

export interface LoDejadoPendiente {
  sobre: string;
  texto: string;
}

/**
 * Lo que él dejó PENDIENTE de verificar en campo.
 *
 * Se enseña desde que abre la pantalla, sin casilla y sin botón, y **no se
 * cuenta en ningún sitio donde se cuenten puntos por cargar**. Pendiente no es
 * descartado: un punto que desaparece de la pantalla sin una línea que lo nombre
 * se lee como perdido.
 */
export function loQueDejoPendiente(
  registro: Record<string, unknown>, codigoLinea: string,
): LoDejadoPendiente[] {
  const filas = pendientesDe(registro, codigoLinea) as FilaFirmada[];
  return filas.map((d) => ({
    sobre: d.sobre,
    texto: `Pendiente por decisión suya: ${d.sobre}. El ${enCastellano(d.decididoEn)} usted lo dejó `
      + 'pendiente de verificar en campo antes de darlo por bueno. Pendiente no es descartado: no se '
      + 'ha perdido.',
  }));
}

/**
 * La línea del acuse que cierra el círculo: de lo que él decidió en su día, qué
 * entró hoy y qué sigue sin cargar porque él lo dejó pendiente.
 *
 * Devuelve `null` cuando no entró nada de lo decidido: una frase que dice «hoy
 * entró: nada» ocupa el sitio de la que sí informa.
 */
export function loDecididoQueEntro(
  yaDecidido: LoYaDecidido[], escritos: string[], pendientes: LoDejadoPendiente[],
): string | null {
  const entraron = yaDecidido.filter((d) => escritos.includes(d.sobre));
  if (!entraron.length) return null;
  const fechas = [...new Set(entraron.map((d) => d.decididoEn))].sort().map(enCastellano);
  const cabeza = `De lo que usted decidió el ${fechas.join(' y el ')}, hoy entró: `
    + `${entraron.map((d) => d.sobre).join(' · ')}.`;
  return pendientes.length
    ? `${cabeza} Sigue sin cargar, porque usted lo dejó pendiente: `
      + `${pendientes.map((p) => p.sobre).join(' · ')}.`
    : cabeza;
}

/** La decisión que manda hoy sobre un nombre, o `undefined`. Reexportada tal cual. */
export const decisionFirmadaDe = (
  registro: Record<string, unknown>, codigoLinea: string, nombreCanonico: string,
): unknown => decisionVigente(registro, codigoLinea, nombreCanonico);

// ── El antes y el después ───────────────────────────────────────────────────

/** La forma mínima del retrato que devuelve `@lineas/importar/plan`. */
export interface RetratoDeLinea {
  puntos: number;
  estructuras: number;
  empalmes: number;
  longitud_m: number;
  tramos: { n: number; reparto: number[] };
  anclas: { n: number; nombres: string[] };
  vanos: { n: number; promedio: number; minimo: number; maximo: number } | null;
  calidad: { severidad?: string }[];
}

export interface FilaCifra {
  rotulo: string;
  antes: string;
  despues: string;
  /** Si no se mueve, se pinta apagada: lo que NO cambia también es información. */
  cambia: boolean;
  /** Por qué esta cifra importa, en una línea. */
  porQue?: string;
}

const texto = (v: string | number | null | undefined): string =>
  (v === null || v === undefined ? '—' : String(v));

/**
 * Las cifras de la línea antes y después, listas para una tabla.
 *
 * Se declara TODO, también lo que no se mueve. Una tabla que solo enseña lo que
 * cambia deja al Ingeniero sin saber si el vano máximo se quedó donde estaba o
 * si nadie lo miró — y ésa es justo la diferencia entre comprobar y confiar.
 */
export function cifrasDeLaCarga(antes: RetratoDeLinea, despues: RetratoDeLinea): FilaCifra[] {
  const fila = (rotulo: string, a: string, d: string, porQue?: string): FilaCifra =>
    ({ rotulo, antes: a, despues: d, cambia: a !== d, porQue });

  const vanos = (r: RetratoDeLinea) => r.vanos;

  return [
    fila('Puntos de la línea', nf(antes.puntos), nf(despues.puntos)),
    fila('Estructuras (las que sostienen)', nf(antes.estructuras), nf(despues.estructuras),
      'son las únicas que abren vano y entran al cálculo mecánico'),
    fila('Empalmes (no son apoyos)', nf(antes.empalmes), nf(despues.empalmes),
      'no cuentan como vano: no mueven el promedio ni el cálculo mecánico'),
    fila('Longitud de la línea', `${nf(antes.longitud_m, 2)} m`, `${nf(despues.longitud_m, 2)} m`),
    fila('Tramos de tensión', nf(antes.tramos.n), nf(despues.tramos.n),
      'cada tramo se calcula con su propio vano ideal de regulación'),
    fila('Reparto de vanos por tramo',
      `[${antes.tramos.reparto.join(', ')}]`, `[${despues.tramos.reparto.join(', ')}]`),
    fila('Puntos que anclan el conductor', nf(antes.anclas.n), nf(despues.anclas.n),
      'de aquí sale dónde se corta cada tramo'),
    fila('Vanos entre estructuras',
      texto(vanos(antes) && nf(vanos(antes)!.n)), texto(vanos(despues) && nf(vanos(despues)!.n))),
    fila('Vano promedio',
      texto(vanos(antes) && `${nf(vanos(antes)!.promedio, 2)} m`),
      texto(vanos(despues) && `${nf(vanos(despues)!.promedio, 2)} m`)),
    fila('Vano más largo',
      texto(vanos(antes) && `${nf(vanos(antes)!.maximo, 2)} m`),
      texto(vanos(despues) && `${nf(vanos(despues)!.maximo, 2)} m`),
      'es el que gobierna la flecha del tramo'),
    fila('Vano más corto',
      texto(vanos(antes) && `${nf(vanos(antes)!.minimo, 2)} m`),
      texto(vanos(despues) && `${nf(vanos(despues)!.minimo, 2)} m`)),
    fila('Observaciones de calidad del levantamiento',
      nf(antes.calidad.length), nf(despues.calidad.length),
      'si aparece una nueva, es que el punto entró donde no encaja'),
  ];
}

// ── El acta ─────────────────────────────────────────────────────────────────

/** Lo que la aplicación sabe de una carga ya ejecutada. */
export interface ResultadoDeCarga {
  escritos: string[];
  yaEstaban: string[];
  rechazados: { nombre: string; motivo: string }[];
}

/** Un punto que se quedó fuera, se llame como se llame el motivo. */
export interface FueraDeLaCarga {
  nombreCanonico?: string | null;
  nombreCampo?: string | null;
  motivo?: string;
}

/** Lo que `@lineas/exportar/acta` necesita para escribir el papel. */
export interface ActaDeCarga {
  linea: { codigo: string; nombre?: string; tensionNominal_kV?: number };
  quien: { correo: string | null; organizacion: string; rol: string };
  cuando: string;
  archivos: { nombre: string; creator: string | null; puntos: number }[];
  cargados: Record<string, unknown>[];
  ignorados: FueraDeLaCarga[];
  bloqueados: FueraDeLaCarga[];
  yaEstaban: string[];
  rechazados: { nombre: string; motivo: string }[];
  cifras: FilaCifra[];
}

/**
 * Arma la entrada del acta a partir de lo que de verdad pasó.
 *
 * Se hace AQUÍ y no dentro de la pantalla por la misma razón que todo lo demás
 * de este archivo: es la única forma de que el papel que queda de un acto
 * irreversible se pueda comprobar sin abrir un navegador.
 *
 * REGLA: solo entra en «lo que se cargó» lo que la base confirmó escrito. Un
 * acta que liste lo que se INTENTÓ cargar sería un papel que dice que un punto
 * existe cuando no existe — y es el papel el que se archiva.
 */
export function actaDeLaCarga(entrada: {
  linea: { codigo: string; nombre?: string; tensionNominal_kV?: number };
  quien: { correo: string | null; organizacion: string; rol: string };
  cuando: string;
  archivos: { nombre: string; creator: string | null; puntos: number }[];
  fichas: FichaDeCarga[];
  ignorados: FueraDeLaCarga[];
  bloqueados: FueraDeLaCarga[];
  resultado: ResultadoDeCarga;
  cifras: FilaCifra[];
  /**
   * Lo que él había firmado en su día sobre cada ficha, por su clave.
   *
   * Va al acta porque el acta es el ÚNICO papel que puede llevar las dos cosas:
   * lo que decidió aquel día y lo que cargó hoy. El molde de los datos guarda
   * solo lo segundo, y un cambio de opinión sin rastro convierte el libro de
   * decisiones en un papel que dice algo distinto de lo que se cargó.
   */
  sellos?: Record<string, ProcedenciaDeFicha>;
}): ActaDeCarga {
  const escritos = new Set(entrada.resultado.escritos);
  const cargados = entrada.fichas
    .filter((f) => escritos.has(f.nombreCanonico))
    .map((f) => {
      const p: Record<string, unknown> = {
        nombre: f.nombreCanonico,
        nombreCampo: f.nombreCampo || null,
        tipoPunto: f.tipoPunto,
        funcionEstructural: f.funcionEstructural,
        funcionConfirmada: f.funcionConfirmada,
        donde: f.sitio === AL_FINAL ? 'al final de la línea' : `detrás de ${f.sitio}`,
        lat: f.lat,
        lon: f.lon,
        porQue: f.porQue.trim(),
      };
      // Otra vez: lo que el aparato no grabó no se convierte en cero. El acta
      // dirá «el GPS no la grabó», que es el hecho.
      if (f.ele !== undefined) p.cotaTerreno_m = f.ele;
      if (f.utc !== undefined) p.tomadaEn = f.utc;

      // Lo que él había firmado en su día sobre este mismo punto: lo que hoy
      // ratificó tal cual, y aquello en lo que se apartó. Las dos cosas son
      // hechos y las dos van al papel.
      const firmado = entrada.sellos?.[f.clave];
      if (firmado) {
        const ratificado = Object.entries(sellosVivos(f, firmado))
          .map(([campo, s]) => `${ROTULO_RECORDADO[campo as CampoRecordado]}: ${s.comoSeLee} — ${s.sello}`);
        const cambios = cambiosSobreLoRecordado(f, firmado).map((c) => c.aviso);
        if (ratificado.length) p.ratificoDeLoFirmado = ratificado;
        if (cambios.length) p.cambioSobreLoFirmado = cambios;
      }
      return p;
    });

  return {
    linea: entrada.linea,
    quien: entrada.quien,
    cuando: entrada.cuando,
    archivos: entrada.archivos,
    cargados,
    ignorados: entrada.ignorados,
    bloqueados: entrada.bloqueados,
    yaEstaban: entrada.resultado.yaEstaban,
    rechazados: entrada.resultado.rechazados,
    cifras: entrada.cifras,
  };
}
