// ============================================================================
// vistas/recorrido.ts — la línea que TODAVÍA NO PUEDE CALCULAR, preparada para
// pintarse: qué le falta, qué abre cada pestaña, y el recorrido levantado
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. Desde el molde 0.16.0 una línea puede estar dada de alta y no
// tener aún ni torres registradas, ni conductor, ni hipótesis (`repositorio.ts`
// §fase 'recorrido'). Eso NO es una avería —es la fase de arranque, y el orden
// del Ingeniero del 2026-09-17 dice que el conductor y las hipótesis llegan
// después—, así que la pantalla tiene que abrir igual y decir con su nombre lo
// que falta, pestaña por pestaña.
//
// TODO LO QUE DECIDE QUÉ SE LEE VIVE AQUÍ, y no repartido por `Linea.tsx`, por
// tres razones que este proyecto ya pagó:
//   · Una frase escrita en dos componentes es una frase que algún día dice dos
//     cosas distintas de la misma línea.
//   · Un componente `.tsx` NO se puede probar con `node --test` (el intérprete
//     de Node quita tipos, pero no entiende JSX). Un módulo puro sí, y lo que
//     aquí se decide —qué necesita cada pestaña, qué falta, qué se avisa— es
//     justo lo que no puede fallar en silencio.
//   · El fallo más caro posible de esta tanda es una línea que calcula con la
//     mitad de sus torres sin decirlo. Lo que evita eso es una regla, no un JSX.
//
// AQUÍ NO HAY NI UNA FÓRMULA DE INGENIERÍA. La geodesia entera —distancia,
// azimut, quiebre, margen del quiebre, vano con pinta de torre sin levantar— se
// le pide a `@lineas/nucleo/geodesia`, que es su dueño y está verificado contra
// las constantes WGS84 publicadas. Lo que se hace aquí es ORDENAR y ROTULAR.
// ============================================================================
import type { Levantamiento } from '@lineas/contratos';
import {
  vincenty, rumbo, deflexion,
  margenDeAzimut, margenDeDeflexion, vanosConPintaDeTorreSinLevantar,
} from '@lineas/nucleo/geodesia';
import { estadisticasVanos } from '@lineas/nucleo/estadisticas';
import { PRECISION_GPS_MANO_M } from '@lineas/importar/punto';
import type { FaltaDeLinea } from '../datos/repositorio';

// ── ① QUÉ LE FALTA A LA LÍNEA, DICHO EN CASTELLANO ──────────────────────────

/**
 * El orden en que se enumeran las faltas, SIEMPRE el mismo.
 *
 * Es el mismo criterio que usa `repositorio.ts` con `faltan`: para que dos
 * capturas de pantalla del mismo día se puedan comparar y para que una falta no
 * cambie de sitio entre dos repintados. De lo más gordo (no hay ni torres) a lo
 * más fino (falta un juego de hipótesis).
 */
export const FALTAS_EN_ORDEN: readonly FaltaDeLinea[] = Object.freeze(
  ['torres', 'conductor', 'hipotesis'] as FaltaDeLinea[],
);

/** Cómo se nombra cada falta en pantalla. «torres» a secas no dice nada. */
export const ROTULO_DE_FALTA: Readonly<Record<FaltaDeLinea, string>> = Object.freeze({
  torres: 'torres registradas',
  conductor: 'conductor',
  hipotesis: 'hipótesis',
});

/** Las faltas que se le pasen, ordenadas y sin repetidas. */
export function ordenarFaltas(faltan: readonly FaltaDeLinea[]): FaltaDeLinea[] {
  return FALTAS_EN_ORDEN.filter((f) => faltan.includes(f));
}

/**
 * El motivo que se escribe en la pestaña y en su `title`: «faltan: torres
 * registradas, conductor, hipótesis».
 *
 * En minúscula porque va DENTRO de la pestaña, pegado a su rótulo. La versión
 * con mayúscula, para el titular del cartel, es `titularDeFaltas`.
 */
export function motivoDeFaltas(faltan: readonly FaltaDeLinea[]): string {
  const lista = ordenarFaltas(faltan).map((f) => ROTULO_DE_FALTA[f]);
  return lista.length ? `faltan: ${lista.join(', ')}` : '';
}

/** El mismo motivo, como titular del cartel: «Faltan: torres registradas.» */
export function titularDeFaltas(faltan: readonly FaltaDeLinea[]): string {
  const m = motivoDeFaltas(faltan);
  return m ? `${m.charAt(0).toUpperCase()}${m.slice(1)}.` : '';
}

/**
 * La frase del cielo: «LN-617 no tiene torres registradas, ni conductor, ni
 * hipótesis: no hay apoyos que dictaminar. No se usa lo de otra línea.»
 *
 * La última frase NO es un adorno. El Ingeniero ordenó el 2026-09-17 que no se
 * copie nada de LN-627, y quien mira una pantalla vacía necesita saber que está
 * vacía **porque no hay dato**, no porque el programa no lo encuentre.
 */
export function porQueNoCalcula(codigoLinea: string, faltan: readonly FaltaDeLinea[]): string {
  const lista = ordenarFaltas(faltan).map((f) => ROTULO_DE_FALTA[f]);
  if (!lista.length) return `${codigoLinea} no puede calcular todavía. No se usa lo de otra línea.`;
  return `${codigoLinea} no tiene ${lista.join(', ni ')}: no hay apoyos que dictaminar. `
    + 'No se usa lo de otra línea.';
}

/**
 * EL RENGLÓN QUE VA BAJO UNA LÍNEA EN LA COLUMNA DEL PARQUE: «sin torres
 * registradas · sin conductor ni hipótesis».
 *
 * ⚠️ SOLO DICE LO QUE CONSTA, y eso hace que el renglón de la línea ABIERTA
 * pueda ser más largo que el de una cerrada. No es un descuido:
 *   · Que una línea no traiga conductor ni hipótesis lo dice su propio
 *     documento, que el parque ya tiene en la mano. Cuesta cero, y vale igual
 *     para la abierta y para las cerradas.
 *   · Que no tenga TORRES REGISTRADAS no lo dice su documento: hay que ir a
 *     mirar las torres de su serie, que es una lectura más por línea cada vez
 *     que se entra. De la línea abierta se sabe porque sus torres ya se
 *     leyeron; de las cerradas, no — y escribirlo igual sería afirmar sin haber
 *     comprobado, que es exactamente `32 · L-44`.
 *
 * La maqueta M4 deja esa lectura extra marcada como «cómo se sabe», o sea sin
 * decidir. Mientras no se decida, aquí no se afirma.
 */
export function faltaEnElParque(faltan: readonly FaltaDeLinea[]): string {
  const f = ordenarFaltas(faltan);
  const trozos: string[] = [];
  if (f.includes('torres')) trozos.push('sin torres registradas');
  if (f.includes('conductor') && f.includes('hipotesis')) trozos.push('sin conductor ni hipótesis');
  else if (f.includes('conductor')) trozos.push('sin conductor');
  else if (f.includes('hipotesis')) trozos.push('sin hipótesis');
  return trozos.join(' · ');
}

/**
 * POR QUÉ NO HAY HORIZONTE QUE DIBUJAR — y se dice la razón VERDADERA.
 *
 * ⚠️ NO SIEMPRE ES «SIN TORRES». Una línea puede tener sus torres registradas y
 * seguir sin poder dibujar el horizonte porque le falta el conductor: sin él no
 * hay veredictos, y el horizonte dibuja veredictos. Escribir «sin torres
 * registradas» en ese caso sería decir que la línea no tiene torres cuando las
 * tiene — y quien lo lea saldrá a registrar unas torres que ya están.
 */
export function motivoSinHorizonte(faltan: readonly FaltaDeLinea[]): string {
  if (!faltan.length) return 'no hay horizonte que dibujar';
  return faltan.includes('torres')
    ? 'sin torres registradas: no hay horizonte que dibujar'
    : `${faltaEnElParque(faltan)}: no hay veredictos que dibujar`;
}

// ── ② QUÉ NECESITA CADA PESTAÑA ─────────────────────────────────────────────

/**
 * LO QUE CADA PESTAÑA NECESITA PARA PODER CALCULAR, una por una.
 *
 * ⚠️ NO ES «las que necesitan todo» CONTRA «las que no». Cada pestaña pide lo
 * SUYO, y por eso están las quince escritas:
 *   · Térmica **no necesita torres**: la ampacidad es del conductor con el
 *     clima. Meterla en el saco de «faltan las tres» la apagaría por un dato que
 *     no usa, y es justo la primera que abrirá cuando lleguen conductor e
 *     hipótesis.
 *   · Fichas y Fotos solo necesitan TORRES: una ficha es de una torre y una foto
 *     se cuelga de una torre; el conductor no pinta nada ahí.
 *   · Falla, Parámetros eléctricos y Cargar no necesitan NADA de esto: los
 *     expedientes cuelgan de la línea, el histórico del SCADA se lee por el
 *     código de la línea y Cargar es justo la vía de traer puntos.
 *   · Resumen, Detalle GPS y Distancias tampoco: abren sobre el RECORRIDO
 *     LEVANTADO, que es un dato propio de la línea y no un cálculo.
 *
 * Una pestaña que no esté en esta tabla no exige nada: el defecto es abrir.
 */
const REQUISITOS: Readonly<Record<string, readonly FaltaDeLinea[]>> = Object.freeze({
  resumen: [],
  gps: [],
  distancias: [],
  fichas: ['torres'],
  falla: [],
  fundamentos: ['torres', 'conductor', 'hipotesis'],
  mecanico: ['torres', 'conductor', 'hipotesis'],
  termica: ['conductor', 'hipotesis'],
  parametros: [],
  viento: ['torres', 'conductor', 'hipotesis'],
  cargas: ['torres', 'conductor', 'hipotesis'],
  cantidades: ['torres', 'conductor', 'hipotesis'],
  exportar: ['torres', 'conductor', 'hipotesis'],
  cargar: [],
  fotos: ['torres'],
});

/** Qué necesita esa pestaña. Vacío = abre siempre. */
export function requisitosDePestana(id: string): readonly FaltaDeLinea[] {
  return REQUISITOS[id] ?? [];
}

/**
 * De lo que le falta a la línea, lo que le falta A ESA PESTAÑA.
 *
 * Es el cruce, y es lo que impide el defecto que más se repite en pantallas así:
 * apagar Térmica por «faltan torres» cuando Térmica no mira una sola torre.
 */
export function faltasDePestana(
  id: string, faltanEnLaLinea: readonly FaltaDeLinea[],
): FaltaDeLinea[] {
  const necesita = requisitosDePestana(id);
  return ordenarFaltas(faltanEnLaLinea.filter((f) => necesita.includes(f)));
}

// ── ③ EL CARTEL DE LA PESTAÑA QUE NO CALCULA ────────────────────────────────

/** Un renglón de la lista del cartel: qué falta y por qué no está todavía. */
export interface ItemDeFalta { que: string; porque: string }

/** El cartel entero, ya redactado. Quien lo pinta no decide ni una palabra. */
export interface CartelSinCalculo {
  titulo: string;
  /** El titular en negrita: «Faltan: torres registradas.» */
  titular: string;
  /** La frase que sigue al titular, propia de esa pestaña. */
  lead: string;
  items: ItemDeFalta[];
  /** Una aclaración final, solo cuando hay algo que aclarar. */
  pie?: string;
}

/** Lo que la pantalla sabe de la línea cuando arma un cartel. */
export interface ContextoSinCalculo {
  codigoLinea: string;
  faltanEnLaLinea: readonly FaltaDeLinea[];
  /** Rótulo YA traducido del tramo compartido, si la línea declara alguno. */
  tramo?: string;
  /** Códigos de las otras líneas que recorren ese tramo. */
  vecinas?: readonly string[];
  /** El día de la jornada de campo, formateado, si hay recorrido levantado. */
  fechaDelRecorrido?: string;
  /**
   * Por qué no se pudieron LEER las hipótesis que la línea sí declara.
   *
   * Cambia el renglón entero: «las entrega usted después» sería FALSO si la
   * línea ya las entregó y lo que falló fue traerlas. Es `32 · L-44` en el sitio
   * donde más barato es equivocarse y más caro darse cuenta.
   */
  hipotesisIlegibles?: string;
}

/** Cómo se enumeran «las otras»: «LN-628» · «LN-628 y LN-631». */
function yListado(codigos: readonly string[]): string {
  if (codigos.length <= 1) return codigos[0] ?? '';
  return `${codigos.slice(0, -1).join(', ')} y ${codigos[codigos.length - 1]}`;
}

function itemDeFalta(f: FaltaDeLinea, ctx: ContextoSinCalculo): ItemDeFalta {
  if (f === 'torres') {
    return {
      que: 'Torres registradas',
      porque: 'se registran cuando usted declare la función de cada una.'
        + (ctx.fechaDelRecorrido
          ? ` El recorrido del ${ctx.fechaDelRecorrido} está levantado y guardado aparte,`
            + ' sin registrar: no se calcula con él.'
          : ''),
    };
  }
  if (f === 'conductor') {
    return { que: 'Conductor', porque: 'lo entrega usted después. No se usa el de otra línea.' };
  }
  return {
    que: 'Hipótesis de cálculo',
    porque: ctx.hipotesisIlegibles
      // La línea SÍ las declara: no se pueden pedir otra vez, hay que mirar por
      // qué no llegan. Decir «las entrega usted después» mandaría al Ingeniero a
      // rehacer un trabajo que ya hizo.
      ? `la línea las declara y no se pudieron leer: ${ctx.hipotesisIlegibles}`
      : 'las entrega usted después. No se usan las de otra línea.',
  };
}

/** Las frases propias de cada pestaña. El resto del cartel se arma solo. */
const LEAD: Readonly<Record<string, string>> = Object.freeze({
  fichas: 'Una ficha es de una torre. Sin torres registradas no hay ficha que abrir.',
  fundamentos: 'Esta pestaña explica las cifras de la línea con sus propios datos, y '
    + '{linea} aún no los tiene. No se usan los de otra línea.',
  mecanico: 'No se usa lo de otra línea.',
  termica: 'Esta pestaña no necesita torres: la ampacidad es del conductor con el clima. '
    + 'No se usa lo de otra línea.',
  viento: 'No se usa lo de otra línea.',
  cargas: 'No se usa lo de otra línea.',
  cantidades: 'No se usa lo de otra línea.',
  exportar: 'Los cuatro archivos del levantamiento salen de las torres de la línea; los '
    + 'cuatro del cálculo necesitan además el conductor y las hipótesis. No se usa lo de otra línea.',
  fotos: 'Una foto se cuelga de una torre. Sin torres registradas no hay a qué colgarla.',
});

const PIE_FIJO: Readonly<Record<string, string>> = Object.freeze({
  mecanico: 'Con esos tres datos, aquí salen los tramos de tensión, el vano ideal de cada '
    + 'tramo, las flechas y el vano a vano. Sin ellos no se enseña ni una cifra.',
  termica: 'Es la primera pestaña de cálculo que se abrirá cuando usted entregue el conductor '
    + 'y las hipótesis.',
});

/**
 * EL CARTEL DE UNA PESTAÑA QUE NO PUEDE CALCULAR.
 *
 * Devuelve `null` cuando esa pestaña sí puede: quien lo llama no tiene que
 * volver a decidir nada, y así no puede salir un cartel sobre una pestaña que
 * funciona (que es como se pierde la confianza en un aviso).
 */
export function cartelDePestana(
  id: string, rotulo: string, ctx: ContextoSinCalculo,
): CartelSinCalculo | null {
  const faltan = faltasDePestana(id, ctx.faltanEnLaLinea);
  if (!faltan.length) return null;

  const soloTorres = faltan.length === 1 && faltan[0] === 'torres';
  const titulo = soloTorres && (id === 'fichas' || id === 'fotos')
    ? `${rotulo}: ${ctx.codigoLinea} no tiene torres registradas`
    : `${rotulo} no calcula en ${ctx.codigoLinea}`;

  const vecinas = ctx.vecinas ?? [];
  let pie = PIE_FIJO[id];
  if (ctx.tramo && vecinas.length) {
    const otras = yListado(vecinas);
    if (id === 'fichas') {
      pie = `Cuando se registren las torres del ${ctx.tramo}, la ficha de cada una será la `
        + `misma desde ${ctx.codigoLinea} y desde ${otras}.`;
    } else if (id === 'cargas') {
      // ⚠️ SIN EL NÚMERO DE CIRCUITOS. La maqueta dice «torre de 2 circuitos», y
      // ese 2 sale de contar las líneas vecinas que están dadas de alta — que es
      // exactamente la cuenta prohibida: una vecina que la sesión no alcance a
      // ver haría escribir «1 circuito» en una torre que lleva dos, o sea la
      // mitad de la carga y con veredicto encima. Quien sabe cuántos circuitos
      // lleva la torre es `Apoyo.circuitosTendidos`, y aquí no hay torres.
      pie = `Cuando haya torres del ${ctx.tramo} registradas, cada una saldrá sin veredicto `
        + `mientras falten los datos de ${ctx.codigoLinea} o de ${otras}.`;
    } else if (id === 'fotos') {
      pie = 'Y aunque las haya: en una línea con tramo compartido esta pestaña no sube nada '
        + 'hasta que se desplieguen las fotos por serie, para que la misma foto subida desde '
        + `${ctx.codigoLinea} y ${otras} no se duplique.`;
    }
  }

  return {
    titulo,
    titular: titularDeFaltas(faltan),
    lead: (LEAD[id] ?? 'No se usa lo de otra línea.').replace('{linea}', ctx.codigoLinea),
    items: faltan.map((f) => itemDeFalta(f, ctx)),
    ...(pie ? { pie } : {}),
  };
}

/**
 * EL CARTEL DE LA LÍNEA ENTERA — el que cierra el Resumen con «Lo que falta
 * para calcular».
 *
 * Es el mismo cuerpo que el de una pestaña, con las faltas de la LÍNEA en vez
 * de las de una pestaña concreta, para que las dos listas no puedan decir cosas
 * distintas. Devuelve `null` cuando no falta nada: el Resumen de una línea
 * completa no lleva este cartel.
 */
export function cartelDeLaLinea(ctx: ContextoSinCalculo): CartelSinCalculo | null {
  const faltan = ordenarFaltas(ctx.faltanEnLaLinea);
  if (!faltan.length) return null;
  const lista = faltan.map((f) => ROTULO_DE_FALTA[f]);
  return {
    titulo: 'Lo que falta para calcular',
    titular: titularDeFaltas(faltan),
    lead: `${ctx.codigoLinea} no tiene ${lista.join(', ni ')}: el Resumen no calcula. `
      + 'No se usa lo de otra línea.',
    items: faltan.map((f) => itemDeFalta(f, ctx)),
  };
}

// ── ④ LA BANDA DE ESTADO DE UNA LÍNEA SIN TORRES ────────────────────────────

export interface FichaDeBanda { t: string; v: string; tono: 'bien' | 'atender' | 'critico' }

/** Enumera faltas en prosa: «torres, conductor e hipótesis». */
function enProsa(faltan: readonly FaltaDeLinea[]): string {
  const lista = ordenarFaltas(faltan).map((f) => (f === 'torres' ? 'torres' : ROTULO_DE_FALTA[f]));
  if (lista.length <= 1) return lista[0] ?? '';
  const ultima = lista[lista.length - 1];
  // «e hipótesis», no «y hipótesis»: en castellano la y se vuelve e delante del
  // sonido i-, que se escribe «i-» o «hi-» («e hipótesis», «e Inglaterra»). La
  // excepción es «hie-», que suena ye («agua y hielo»), y por eso va excluida.
  // Lo escribe el módulo y no cada pantalla, para no tener dos versiones.
  const nexo = /^(?:[ií]|hi(?!e))/i.test(ultima) ? 'e' : 'y';
  return `${lista.slice(0, -1).join(', ')} ${nexo} ${ultima}`;
}

/**
 * LAS CUATRO FICHAS DE LA BANDA para una línea que todavía no calcula.
 *
 * ⚠️ NINGÚN TONO ESCRITO A MANO: los cuatro salen del dato, igual que en la
 * banda de una línea completa (`99 §ADR-051`). Una ficha verde sobre un hueco es
 * el patrón que este proyecto tiene por lección (`32 · L-44`), y aquí TODO son
 * huecos: la única que puede estar en verde es la de eventos, y solo cuando
 * consta que se pudieron leer.
 */
export function bandaSinCalculo(datos: {
  eventosAbiertos: number;
  /** Por qué no se pudieron leer los expedientes, si no se pudieron. */
  eventosIlegibles?: string;
  faltan: readonly FaltaDeLinea[];
  /** El día de la jornada, ya formateado corto («09-08»). */
  fechaDelRecorrido?: string;
  hipotesisIlegibles?: string;
}): FichaDeBanda[] {
  const faltan = ordenarFaltas(datos.faltan);
  return [
    {
      t: 'Eventos de falla',
      v: datos.eventosIlegibles
        ? 'no se pudieron leer'
        : datos.eventosAbiertos
          ? `${datos.eventosAbiertos} expediente${datos.eventosAbiertos > 1 ? 's' : ''} `
            + `abierto${datos.eventosAbiertos > 1 ? 's' : ''}`
          : 'sin eventos registrados',
      tono: datos.eventosIlegibles ? 'atender' : datos.eventosAbiertos ? 'critico' : 'bien',
    },
    {
      t: 'Recorrido',
      v: datos.fechaDelRecorrido
        ? `levantado el ${datos.fechaDelRecorrido} · sin registrar como torres`
        : 'sin recorrido levantado',
      tono: 'atender',
    },
    {
      t: 'Cálculo mecánico',
      v: faltan.length ? `sin cálculo: faltan ${enProsa(faltan)}` : 'sin cálculo',
      tono: 'atender',
    },
    {
      t: 'Hipótesis de cálculo',
      v: datos.hipotesisIlegibles
        ? 'declaradas, y no se pudieron leer'
        : faltan.includes('hipotesis')
          ? 'no declaradas — las entrega usted después'
          : 'declaradas',
      tono: faltan.includes('hipotesis') || datos.hipotesisIlegibles ? 'atender' : 'bien',
    },
  ];
}

// ── ⑤ EL RECORRIDO LEVANTADO ────────────────────────────────────────────────

/** `2026-08-09` → `09-08-2026`. Sin `new Date`: desplazaría el día un huso. */
export function fechaDeCampoLarga(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha ?? '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : (fecha ?? '');
}

/** `2026-08-09` → `09-08`. La misma fecha, para donde no cabe el año. */
export function fechaDeCampoCorta(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha ?? '');
  return m ? `${m[3]}-${m[2]}` : (fecha ?? '');
}

/** El rótulo que acompaña a TODA cifra del levantamiento. Nunca se omite. */
export function selloDelRecorrido(fecha: string): string {
  return `levantado el ${fechaDeCampoLarga(fecha)} · sin registrar como torres`;
}

export interface PuntoDelRecorrido {
  /** 1..N, en el orden del archivo. No es el número de una placa. */
  n: number;
  nombreCampo: string;
  lat: number;
  lon: number;
  ele: number | null;
  instante: string | null;
  nota: string | null;
  /** El quiebre medido. `null` en los dos extremos, que no lo tienen. */
  quiebre_grados: number | null;
  /** Cuánto puede moverse ese quiebre con la precisión declarada. */
  margen_grados: number | null;
  /** Falso cuando el margen NO se puede saber (un vano demasiado corto). */
  margenDeterminado: boolean;
  /** Cuál de los dos vanos estropeó el margen, si fue uno. */
  vanoIndeterminado: 'entra' | 'sale' | 'ambos' | null;
}

export interface VanoDelRecorrido {
  n: number;
  desde: string;
  hasta: string;
  longitud_m: number;
  /** Distancia acumulada desde el primer punto. */
  progresiva_m: number;
  azimut_grados: number;
  rumbo: string;
  /** Lo que puede girar el vano con la precisión declarada. */
  margenDireccion_grados: number | null;
  direccionDeterminada: boolean;
  /** Cuántas veces la mediana mide este vano. */
  vecesLaMediana: number | null;
  /** Pasa del umbral declarado por el núcleo: hay que ir a mirarlo. */
  sospechoso: boolean;
  /** Diferencia de cota del GPS. `null` si a alguno de los dos le falta. */
  desnivel_m: number | null;
  /** Minutos entre las dos marcas del aparato. `null` si falta alguna hora. */
  minutos: number | null;
}

export interface HallazgoDelRecorrido {
  clase: 'torre_sin_levantar' | 'vano_corto';
  titulo: string;
  detalle: string;
}

export interface EsquemaDelRecorrido {
  ancho: number;
  alto: number;
  traza: string;
  puntos: { n: number; x: number; y: number; titulo: string }[];
}

export interface RecorridoLevantado {
  fecha: string;
  /** «levantado el 09-08-2026 · sin registrar como torres». */
  sello: string;
  aparato: string | null;
  codigoSerie: string;
  nota: string | null;
  /** La precisión que el sistema declara a un GPS de mano. No sale del archivo. */
  precision_m: number;
  puntos: PuntoDelRecorrido[];
  vanos: VanoDelRecorrido[];
  /** Suma de los vanos levantados. NO es la longitud de la línea. */
  longitud_m: number;
  /** Distancia directa entre el primer y el último punto. */
  directa_m: number | null;
  estadisticas: { n: number; promedio: number; mediana: number; minimo: number; maximo: number } | null;
  hallazgos: HallazgoDelRecorrido[];
  esquema: EsquemaDelRecorrido | null;
  /** La primera y la última marca del aparato, si constan. */
  desde: string | null;
  hasta: string | null;
  primeraHora: string | null;
  ultimaHora: string | null;
}

/** La hora de un instante ISO, en local de Colombia. Sin fecha: no cabe. */
function horaDe(instante: string | null): string | null {
  if (!instante) return null;
  const d = new Date(instante);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('es-CO', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'America/Bogota',
  });
}

/** Una cifra con coma decimal, para meterla en una frase del módulo. */
const cifra = (v: number, d = 1): string => v.toFixed(d).replace('.', ',');

/**
 * EL RECORRIDO LEVANTADO, LISTO PARA PINTARSE.
 *
 * ⚠️ NINGUNO DE ESTOS PUNTOS ES UNA TORRE, y el tipo que devuelve no se parece a
 * `Apoyo` a propósito. El Ingeniero decidió el 2026-09-17 que lo que se guarda
 * del GPS es el LEVANTAMIENTO tal cual, y que las torres nacen el día que él
 * declare la función de cada una. Devolver aquí algo con forma de apoyo sería
 * poner esa decisión a un `as` de distancia: cualquier pantalla podría pasárselo
 * al cálculo mecánico y publicar tramos de tensión de una línea que todavía no
 * tiene ni una torre registrada.
 *
 * @param lev        el documento tal como se guardó
 * @param precision_m  la precisión declarada; por defecto la del GPS de mano
 */
export function recorridoLevantado(
  lev: Levantamiento, precision_m: number = PRECISION_GPS_MANO_M,
): RecorridoLevantado {
  const crudos = (lev?.puntos ?? []).filter(
    (p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon));
  const geo = crudos.map((p) => ({ lat: p.lat, lon: p.lon }));

  // Los vanos, el azimut y el quiebre: los tres al núcleo, ninguno aquí.
  const tramos = geo.slice(1).map((p, i) => vincenty(geo[i].lat, geo[i].lon, p.lat, p.lon));
  const longitudes = tramos.map((t) => t.d);
  const pinta = vanosConPintaDeTorreSinLevantar(longitudes);

  let acumulada = 0;
  const vanos: VanoDelRecorrido[] = tramos.map((t, i) => {
    acumulada += t.d;
    const margen = margenDeAzimut(t.d, precision_m);
    const a = crudos[i];
    const b = crudos[i + 1];
    const cotas = typeof a.ele === 'number' && typeof b.ele === 'number';
    const horas = a.instante && b.instante
      ? (Date.parse(b.instante) - Date.parse(a.instante)) / 60000 : null;
    return {
      n: i + 1,
      desde: a.nombreCampo,
      hasta: b.nombreCampo,
      longitud_m: t.d,
      progresiva_m: acumulada,
      azimut_grados: t.az,
      rumbo: rumbo(t.az),
      margenDireccion_grados: margen.margen_grados,
      direccionDeterminada: margen.determinado,
      vecesLaMediana: pinta.vanos[i]?.vecesLaMediana ?? null,
      sospechoso: pinta.vanos[i]?.sospechoso ?? false,
      desnivel_m: cotas ? (b.ele as number) - (a.ele as number) : null,
      minutos: horas != null && Number.isFinite(horas) ? horas : null,
    };
  });

  const puntos: PuntoDelRecorrido[] = crudos.map((p, i) => {
    const entra = i > 0 ? longitudes[i - 1] : null;
    const sale = i < longitudes.length ? longitudes[i] : null;
    const m = entra != null && sale != null
      ? margenDeDeflexion(entra, sale, precision_m)
      : null;
    return {
      n: i + 1,
      nombreCampo: p.nombreCampo,
      lat: p.lat,
      lon: p.lon,
      ele: typeof p.ele === 'number' ? p.ele : null,
      instante: p.instante ?? null,
      nota: p.nota ?? null,
      quiebre_grados: deflexion(geo, i),
      margen_grados: m?.margen_grados ?? null,
      margenDeterminado: m?.determinado ?? false,
      vanoIndeterminado: m?.vanoIndeterminado ?? null,
    };
  });

  const e = estadisticasVanos(longitudes) as
    { n: number; promedio: number; mediana: number; minimo: number; maximo: number } | null;

  const hallazgos: HallazgoDelRecorrido[] = [];
  for (const v of vanos) {
    if (v.sospechoso && pinta.mediana_m != null) {
      hallazgos.push({
        clase: 'torre_sin_levantar',
        titulo: 'Vano con pinta de torre sin levantar',
        detalle: `${v.desde} → ${v.hasta}: ${cifra(v.longitud_m)} m, `
          + `${cifra(v.vecesLaMediana ?? 0, 2)} veces la mediana (${cifra(pinta.mediana_m)} m). `
          + 'No dice que falte una torre: dice que ese vano no se parece a los demás y hay que ir a mirarlo.',
      });
    }
    if (!v.direccionDeterminada) {
      hallazgos.push({
        clase: 'vano_corto',
        titulo: 'Vano demasiado corto para saber su dirección',
        detalle: `${v.desde} → ${v.hasta}: con ± ${cifra(precision_m, 0)} m de precisión en cada `
          + `punto y ${cifra(v.longitud_m)} m entre ellos, la dirección de ese vano no se puede `
          + `saber, así que el quiebre de ${v.hasta} no es fiable.`,
      });
    }
  }

  const primero = crudos[0];
  const ultimo = crudos[crudos.length - 1];

  return {
    fecha: lev?.fecha ?? '',
    sello: selloDelRecorrido(lev?.fecha ?? ''),
    aparato: lev?.aparato ?? null,
    codigoSerie: lev?.codigoSerie ?? '',
    nota: lev?.nota ?? null,
    precision_m,
    puntos,
    vanos,
    longitud_m: longitudes.reduce((s, x) => s + x, 0),
    directa_m: crudos.length >= 2
      ? vincenty(primero.lat, primero.lon, ultimo.lat, ultimo.lon).d : null,
    estadisticas: e,
    hallazgos,
    esquema: esquemaDelRecorrido(puntos),
    desde: primero?.nombreCampo ?? null,
    hasta: ultimo?.nombreCampo ?? null,
    primeraHora: horaDe(primero?.instante ?? null),
    ultimaHora: horaDe(ultimo?.instante ?? null),
  };
}

/**
 * EL ESQUEMA DEL RECORRIDO: un dibujo, no un mapa.
 *
 * Misma proyección local que `vistas/planta.ts` —plano en metros con origen en
 * el centroide— y **la misma escala en los dos sentidos**: un dibujo que estira
 * un eje más que el otro convierte una línea recta en una curva y un quiebre de
 * 5° en uno de 40°, que es justo lo que este esquema sirve para mirar.
 *
 * El lienzo se adapta a la forma del recorrido, como el de la línea completa:
 * encajar a la fuerza un recorrido alto en un lienzo apaisado lo deja diminuto.
 */
export function esquemaDelRecorrido(
  puntos: readonly PuntoDelRecorrido[], ancho = 640, margen = 26,
): EsquemaDelRecorrido | null {
  if (puntos.length < 2) return null;
  const lat0 = puntos.reduce((s, p) => s + p.lat, 0) / puntos.length;
  const lon0 = puntos.reduce((s, p) => s + p.lon, 0) / puntos.length;
  const mLat = 111132.92 - 559.82 * Math.cos((2 * lat0 * Math.PI) / 180);
  const mLon = 111412.84 * Math.cos((lat0 * Math.PI) / 180);

  const planos = puntos.map((p) => ({
    p, x: (p.lon - lon0) * mLon, y: (p.lat - lat0) * mLat,
  }));
  const xs = planos.map((q) => q.x);
  const ys = planos.map((q) => q.y);
  const anchoM = Math.max(...xs) - Math.min(...xs);
  const altoM = Math.max(...ys) - Math.min(...ys);
  // Un recorrido de un solo punto repetido no tiene extensión: se dibuja en el
  // centro y no se divide por cero.
  const util = ancho - 2 * margen;
  const escala = anchoM > 0 || altoM > 0
    ? util / Math.max(anchoM, altoM, 1e-9)
    : 1;
  const alto = Math.round(altoM * escala) + 2 * margen;

  const x0 = Math.min(...xs);
  const y1 = Math.max(...ys);
  const marcas = planos.map(({ p, x, y }) => ({
    n: p.n,
    x: Math.round((x - x0) * escala + margen),
    // Norte arriba: la latitud crece hacia arriba y el lienzo hacia abajo.
    y: Math.round((y1 - y) * escala + margen),
    titulo: p.nombreCampo
      + (p.ele != null ? ` · cota ${cifra(p.ele)} m` : '')
      + (p.quiebre_grados != null ? ` · quiebre ${cifra(p.quiebre_grados)}°` : ''),
  }));

  return {
    ancho,
    alto: Math.max(alto, 2 * margen + 1),
    traza: marcas.map((m) => `${m.x},${m.y}`).join(' '),
    puntos: marcas,
  };
}
