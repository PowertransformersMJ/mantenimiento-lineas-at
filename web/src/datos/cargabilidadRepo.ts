// ============================================================================
// datos/cargabilidadRepo.ts — guardar y consultar el histórico de cargabilidad
// ----------------------------------------------------------------------------
// LA ÚNICA PIEZA DE ESTE MÓDULO QUE TOCA LA BASE (`99 §ADR-088`). Todo lo demás
// —leer el `.xlsx`, validar, empaquetar, resumir— es puro y no sabe que existe
// Firestore. Aquí solo se escribe lo que ya viene armado y se lee lo justo.
//
// ⚠️ LAS TRES COSAS QUE ESTE ARCHIVO NO PUEDE OLVIDAR
//
// 1. **UN DOCUMENTO POR LÍNEA Y DÍA.** Un año horario son 8.760 lecturas por
//    línea; una por documento haría que «histórico completo» de diez líneas
//    pidiera 87.600 lecturas de un clic — más de lo que el plan gratuito da en
//    un día. Empaquetado: 3.650. Y el tablero lee los RESÚMENES: unas diez.
//
// 2. **EL TABLERO NO ABRE LOS DÍAS.** Para pintar tendencias y comparar fechas
//    basta el resumen diario. Los días completos solo se traen cuando alguien
//    mira UN día hora a hora. Confundir las dos consultas es lo que convierte un
//    módulo gratis en uno que factura.
//
// 3. **VOLVER A CARGAR NO DUPLICA.** El id del día es determinista, así que la
//    segunda carga escribe ENCIMA. Es lo que el Ingeniero pidió y la razón de
//    que ese id no sea un UUID.
//
// 4. **TODO LO QUE SE ESCRIBE VA SELLADO.** Con qué motor y con qué molde. Se
//    añadió tarde (`99 §ADR-091`) y por eso hay días sin sello: se marcan al
//    leerlos, no se rellenan.
//
// ⚠️ Y lo que NO hace: no borra. Un histórico del que se puede quitar una hora
// incómoda no es un histórico. Las reglas de la base lo niegan además de esto.
// ============================================================================
import {
  CargaDeCargabilidad, DiaDeCargabilidad, type Estadistico, idDelDia, idDelResumen,
  ResumenDiarioCargabilidad, VERSION_CONTRATO,
} from '@lineas/contratos';
import nucleoPkg from '@lineas/nucleo/package.json';
import { cargarFirebase } from './cargar';
import { repositorioFirestore } from './firestore';
import { ordenarParque } from './repositorio';

/**
 * EL SELLO QUE SE ESTAMPA EN TODO LO QUE SE ESCRIBE.
 *
 * ⚠️ `CLAUDE.md §3.1`: todo resultado guardado lleva con qué versión del motor se
 * produjo. Esta colección fue la ÚNICA que escribió sin él, y el daño era
 * permanente y creciente: sin la versión, un día de julio y uno de septiembre no
 * se pueden comparar porque no se sabe si el cálculo cambió entre medias, y eso
 * no se reconstruye después (`99 §ADR-091`).
 *
 * No se rellena hacia atrás. Lo escrito antes no lo tiene, se marca «sin sello»
 * al leerlo y se deja en paz: inventar un sello es peor que no tenerlo.
 */
const SELLO = { versionMotor: nucleoPkg.version, versionContrato: VERSION_CONTRATO };

const firestore = () => import('firebase/firestore');

/** Nombres de las colecciones. El molde es el dueño; aquí solo se citan. */
const DIAS = 'cargabilidad_dias';
const RESUMENES = 'cargabilidad_resumenes';
const CARGAS = 'cargabilidad_cargas';

/**
 * Firestore acepta hasta 500 escrituras por lote. Se parte en trozos y no se
 * manda uno gigante: un lote que se pasa falla ENTERO, y con él la carga.
 */
const POR_LOTE = 400;

export interface Sesion { uid: string; orgId: string }

export interface LoQueSeGuarda {
  dias: Record<string, unknown>[];
  resumenes: Record<string, unknown>[];
  carga: {
    nombreArchivo: string; hoja?: string; huella?: string;
    filasDelArchivo: number; registrosGuardados: number; filasConError: number;
    mapeo: Record<string, string>; lineas: string[];
    /** Los archivos, uno a uno. El rastro de procedencia (`99 §ADR-113`). */
    archivos?: string[];
    /** Qué estadísticos traía. Se escribe al crear: la carga es inmutable. */
    estadisticos?: string[];
    desde?: string; hasta?: string;
  };
}

export interface Acuse {
  cargaId: string;
  dias: number;
  resumenes: number;
  /** Cuántos de esos días YA existían y se han reemplazado. */
  reemplazados: number;
  escrituras: number;
}

/**
 * LA HUELLA DEL ARCHIVO — para reconocer el MISMO archivo aunque lo renombren.
 *
 * ⚠️ **NO se calcula aquí.** Este proyecto tiene UNA sola puerta para las
 * huellas —`@lineas/importar/identidad`— y hay un guardián que lo hace cumplir:
 * de ahí sale la identidad permanente de las fotos (`ADR-028/031`), y una
 * segunda fórmula suelta sería una segunda forma de acuñar identidad, cuyo
 * desacuerdo dejaría material huérfano en silencio. Se reusa la que ya existe.
 *
 * No sirve para bloquear: un archivo repetido puede traer correcciones, y
 * negarse a leerlo sería peor. Sirve para poder DECIRLO: «este archivo ya se
 * cargó el martes». Quien decide es el Ingeniero.
 */
export async function huellaDe(datos: ArrayBuffer): Promise<string> {
  const { huellaDeArchivo } = await import('@lineas/importar/identidad');
  return huellaDeArchivo(new Uint8Array(datos));
}

/**
 * GUARDAR una carga entera: sus días, sus resúmenes y su rastro.
 *
 * ⚠️ El rastro (`cargas`) se escribe PRIMERO y a propósito. Si algo falla a
 * mitad, queda constancia de que se intentó y con qué archivo; al revés,
 * habría días guardados sin poder decir de dónde salieron — y ésa es justo la
 * pregunta que este módulo existe para poder responder.
 */
export async function guardarCarga(
  { dias, resumenes, carga }: LoQueSeGuarda, sesion: Sesion,
): Promise<Acuse> {
  const { baseDatos } = await cargarFirebase();
  const { doc, getDoc, setDoc, writeBatch } = await firestore();
  const db = await baseDatos();
  const ahora = new Date().toISOString();

  const cargaId = crypto.randomUUID();
  const docCarga = CargaDeCargabilidad.parse({
    id: cargaId, orgId: sesion.orgId, creadoEn: ahora, creadoPor: sesion.uid, revision: 0,
    ...carga,
    cargadoEn: ahora, cargadoPor: sesion.uid,
    estado: 'guardada',
    ...SELLO,
  });
  await setDoc(doc(db, CARGAS, cargaId), docCarga);

  // Cuántos días de éstos YA estaban. Se lee ANTES de escribir por dos razones,
  // y la segunda costó una tarde:
  //
  //   1. el Ingeniero pidió poder distinguir lo NUEVO de lo REEMPLAZADO;
  //   2. ⚠️ y porque **una reescritura no puede reescribir la partida de
  //      nacimiento del documento** (`99 §ADR-111`). `creadoEn`, `creadoPor` y
  //      `orgId` son campos RESERVADOS: `firestore.rules` deniega cualquier
  //      escritura que los cambie, y con razón —un documento cuyo autor y fecha
  //      de alta se pueden pisar no sirve para responder «¿de dónde salió
  //      esto?»—. Este repositorio los estampaba de nuevo en cada guardado, así
  //      que **la segunda carga del mismo día fallaba SIEMPRE**, con el mismo
  //      «Missing or insufficient permissions» que no dice nada. Justo lo que la
  //      pantalla promete que funciona: «volver a cargar el mismo día lo
  //      reemplaza».
  //
  // Lo que sí cambia en una reescritura es `actualizadoEn`/`actualizadoPor` y la
  // revisión, que es como se sabe que ese día se ha corregido.
  // ⚠️ SIN ESTADÍSTICO NO SE GUARDA, y este `throw` es la pieza más importante
  // del cambio (`99 §ADR-112`). Caer a «será el máximo» escribiría el promedio
  // con la identidad del máximo y lo PISARÍA: para las reglas es una corrección
  // legítima del mismo día, `delete` está prohibido a propósito y el archivo
  // original no se guarda. Ese número no se recupera de ninguna parte.
  const sinEst = [...dias, ...resumenes].filter((x) => !x.estadistico);
  if (sinEst.length) {
    throw new Error(
      `${sinEst.length} de estos registros no dicen qué estadístico traen (máximo, promedio o `
      + 'instantáneo). No se guardan: escribir uno con la identidad de otro lo reemplazaría, y el '
      + 'histórico no se puede deshacer. Declárelo en la pantalla y vuelva a guardar.',
    );
  }

  const est = (x: Record<string, unknown>) => x.estadistico as Estadistico;
  const ids = dias.map((d) => idDelDia(
    sesion.orgId, String(d.linea), d.circuito as string, String(d.fecha), est(d)));
  const idsResumen = resumenes.map(
    (r) => idDelResumen(sesion.orgId, String(r.linea), String(r.fecha), est(r)));

  const previos = new Map<string, Record<string, unknown>>();
  await Promise.all([
    ...ids.map(async (id) => {
      const d = await getDoc(doc(db, DIAS, id));
      if (d.exists()) previos.set(`${DIAS}/${id}`, d.data() as Record<string, unknown>);
    }),
    ...idsResumen.map(async (id) => {
      const d = await getDoc(doc(db, RESUMENES, id));
      if (d.exists()) previos.set(`${RESUMENES}/${id}`, d.data() as Record<string, unknown>);
    }),
  ]);
  const reemplazados = ids.filter((id) => previos.has(`${DIAS}/${id}`)).length;

  /** El origen del documento: el suyo si ya existía, éste si nace ahora. */
  const partida = (col: string, id: string) => {
    const p = previos.get(`${col}/${id}`);
    return p
      ? {
        creadoEn: p.creadoEn as string, creadoPor: p.creadoPor as string,
        revision: (Number(p.revision) || 0) + 1,
        actualizadoEn: ahora, actualizadoPor: sesion.uid,
      }
      : { creadoEn: ahora, creadoPor: sesion.uid, revision: 0 };
  };

  const paraEscribir: [string, string, Record<string, unknown>][] = [];
  dias.forEach((d, i) => {
    paraEscribir.push([DIAS, ids[i], DiaDeCargabilidad.parse({
      id: ids[i], orgId: sesion.orgId, ...partida(DIAS, ids[i]),
      ...d, cargaId, versionMotor: SELLO.versionMotor,
    }) as unknown as Record<string, unknown>]);
  });
  resumenes.forEach((r, i) => {
    const id = idsResumen[i];
    paraEscribir.push([RESUMENES, id, ResumenDiarioCargabilidad.parse({
      id, orgId: sesion.orgId, ...partida(RESUMENES, id), ...r,
      versionMotor: SELLO.versionMotor,
    }) as unknown as Record<string, unknown>]);
  });

  for (let i = 0; i < paraEscribir.length; i += POR_LOTE) {
    const lote = writeBatch(db);
    for (const [col, id, datos] of paraEscribir.slice(i, i + POR_LOTE)) {
      lote.set(doc(db, col, id), datos);
    }
    await lote.commit();
  }

  return {
    cargaId, dias: dias.length, resumenes: resumenes.length,
    reemplazados, escrituras: paraEscribir.length + 1,
  };
}

/**
 * LOS RESÚMENES DE UN PERIODO — lo que lee el tablero.
 *
 * ⚠️ `tope` no es una comodidad: es el freno. Sin él, «histórico completo»
 * sobre una base con años de datos se traería todo de un clic. La pantalla dice
 * cuántos días pidió y cuántos caben, para que nadie crea que vio el total.
 */
/**
 * ¿DE CUÁNDO ES EL DATO MÁS RECIENTE QUE HAY GUARDADO? (`99 §ADR-116`)
 *
 * ⚠️ POR QUÉ HACE FALTA, y no es comodidad. El histórico abría en «últimos 7
 * días». El primer dato real del Ingeniero es del **2026-01-01**, ocho meses
 * atrás: al abrir la pestaña, la pantalla le decía *«No existen registros de
 * cargabilidad para el periodo seleccionado»* **teniéndolos**. Tres días
 * seguidos buscando sus gráficas en una pantalla que le afirmaba que no había
 * nada. Una ventana por defecto que esconde el único dato que hay no es un
 * ajuste: es una pantalla que miente.
 *
 * Cuesta UNA lectura —un documento, el más nuevo— y solo se pide al abrir.
 */
export async function ultimoDiaGuardado(
  sesion: Sesion, { linea }: { linea?: string } = {},
): Promise<string | null> {
  const { baseDatos } = await cargarFirebase();
  const { collection, getDocs, limit, orderBy, query, where } = await firestore();
  const db = await baseDatos();
  const partes = [where('orgId', '==', sesion.orgId)];
  if (linea) partes.push(where('linea', '==', linea));
  const q = query(collection(db, RESUMENES), ...partes, orderBy('fecha', 'desc'), limit(1));
  const instantanea = await getDocs(q);
  const d = instantanea.docs[0]?.data() as Record<string, unknown> | undefined;
  return d ? String(d.fecha) : null;
}

/** Lo que devuelve una consulta de periodo: lo que se trajo Y lo que se dejó. */
export interface ResumenesDelPeriodo {
  /** Los resúmenes, de la fecha MÁS VIEJA a la más nueva (como siempre). */
  resumenes: Record<string, unknown>[];
  /** ¿Se quedó algo fuera por el tope? */
  recortado: boolean;
  /** Cuántos días caben de una vez. */
  tope: number;
  /** El periodo que se PIDIÓ, tal cual llegó. */
  pedido: { desde: string; hasta: string };
  /** El primer y el último día que de verdad se trajeron (`null` si no hubo ninguno). */
  desdeLeido: string | null;
  hastaLeido: string | null;
  /**
   * La frase para la pantalla cuando se recortó, ya escrita: qué se trajo, desde
   * cuándo y qué hacer para ver el resto. `null` si no se recortó nada.
   *
   * Va aquí y no en la pantalla porque el único sitio que SABE qué se dejó fuera
   * es el que hizo la consulta. Una pantalla que redacta ese aviso por su cuenta
   * acaba diciendo lo que ya no es verdad — que es exactamente lo que pasó con
   * el «se muestran los primeros» de antes de este cambio.
   */
  aviso: string | null;
}

/**
 * Miles con punto, como se escriben en Colombia: «1.200 días».
 *
 * A mano y no con `toLocaleString`: el formateo por configuración regional
 * depende del ICU de la máquina, y esta frase la lee el Ingeniero en pantalla —
 * es el mismo motivo por el que el núcleo tampoco lo usa (`vistas/formato.ts`).
 */
const conMiles = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/**
 * QUÉ SE QUEDA Y QUÉ SE DICE cuando la consulta pasa del tope.
 *
 * ⚠️ **SE QUEDA LO MÁS RECIENTE.** Hasta hoy se pedía `orderBy('fecha')` —de la
 * más vieja hacia adelante— y se cortaba con `slice(0, tope)`: al pasar de 1.200
 * resúmenes, la pantalla enseñaba **los días más ANTIGUOS** y escondía los
 * meses recientes, que son justo por los que se abre esta pestaña. Con tres
 * líneas cargadas el tope se alcanza ya; a LN-627 sola le llegaría en diciembre.
 * Es el mismo criterio que `diasCompletos`, que se quedaba con los últimos desde
 * el primer día (`99 §ADR-120`): lo que se mira es lo último que pasó.
 *
 * ⚠️ **Y EL TOPE SE MIDE SOBRE LO LEÍDO, no sobre lo que queda tras filtrar.**
 * Con varias líneas, el filtro por línea se aplica DESPUÉS de la lectura: si de
 * los 1.201 documentos leídos el filtro deja 900, se recortó igual —hay días
 * anteriores que nadie llegó a leer— y antes eso se contestaba «no se recortó
 * nada», porque la cuenta se hacía sobre las filas ya filtradas. Un recorte que
 * no se anuncia se lee como «esto es todo lo que hay».
 *
 * Es una función aparte y PURA a propósito: decidir qué se queda y qué se avisa
 * es lo único que se puede equivocar aquí, y así se prueba sin base de datos.
 *
 * @param leidas  lo que devolvió la consulta, de la MÁS NUEVA a la más vieja.
 */
export function recorteDeResumenes(
  leidas: Record<string, unknown>[],
  { tope, desde, hasta, lineas = [] }: {
    tope: number; desde: string; hasta: string; lineas?: string[];
  },
): ResumenesDelPeriodo {
  // Se pidieron `tope + 1`: si vino uno de más, hay más historia detrás.
  const recortado = leidas.length > tope;
  const dentro = leidas.slice(0, tope);
  const filtradas = lineas.length > 1
    ? dentro.filter((f) => lineas.includes(String(f.linea)))
    : dentro;

  // ⚠️ `reverse()`, NO `sort()`. La consulta descendente ordena por fecha y,
  // dentro de la misma fecha, por id de documento —también descendente—. Darle
  // la vuelta a la lista entera devuelve EXACTAMENTE el orden que traía la
  // consulta ascendente de siempre, empates incluidos; ordenar solo por `fecha`
  // dejaría los empates del mismo día al revés y movería lo que la pantalla
  // dibuja sin que nadie lo hubiera pedido.
  const resumenes = filtradas.slice().reverse();

  const desdeLeido = resumenes.length ? String(resumenes[0].fecha) : null;
  const hastaLeido = resumenes.length ? String(resumenes[resumenes.length - 1].fecha) : null;

  const aviso = !recortado ? null
    : `Se trajeron los ${conMiles(tope)} días más recientes del periodo pedido (${desde} → ${hasta})`
      + (desdeLeido ? `: lo que se ve empieza el ${desdeLeido}` : '')
      + '. Hay días anteriores guardados que NO están en esta pantalla. Acote el periodo '
      + 'o filtre por una línea para verlos.';

  return { resumenes, recortado, tope, pedido: { desde, hasta }, desdeLeido, hastaLeido, aviso };
}

export async function resumenesEntre(
  { desde, hasta, lineas = [] }: { desde: string; hasta: string; lineas?: string[] },
  sesion: Sesion,
  { tope = 1200 } = {},
): Promise<ResumenesDelPeriodo> {
  const { baseDatos } = await cargarFirebase();
  const { collection, getDocs, limit, orderBy, query, where } = await firestore();
  const db = await baseDatos();

  const partes = [
    where('orgId', '==', sesion.orgId),
    where('fecha', '>=', desde),
    where('fecha', '<=', hasta),
  ];
  // Una sola línea entra en la consulta; varias se filtran al llegar. Firestore
  // admite `in` hasta 30 valores, y encadenar rangos con `in` pide otro índice
  // por combinación: no vale la pena para lo que ahorra.
  if (lineas.length === 1) partes.splice(1, 0, where('linea', '==', lineas[0]));

  // ⚠️ DESCENDENTE, para que el tope se coma lo VIEJO y no lo reciente.
  //
  // No estrena índice: `firestore.indexes.json` ya declara
  // `(orgId, linea, fecha DESC)` y `(orgId, fecha DESC)` —los que pide
  // `ultimoDiaGuardado` desde `99 §ADR-116`—, que son exactamente los que sirven
  // esta consulta con el mismo rango sobre `fecha`. Es la comprobación que no se
  // puede dejar al emulador: sirve consultas sin índice y no se queja
  // (`35 · L-85`), así que un índice que falte no aparece hasta producción, y
  // cuando aparece lo hace como «no existen registros» teniéndolos.
  const q = query(collection(db, RESUMENES), ...partes, orderBy('fecha', 'desc'), limit(tope + 1));
  const instantanea = await getDocs(q);
  const leidas = instantanea.docs.map((d) => d.data() as Record<string, unknown>);

  return recorteDeResumenes(leidas, { tope, desde, hasta, lineas });
}

/**
 * UN DÍA COMPLETO, hora a hora. Se pide de uno en uno a propósito: es la
 * consulta cara, y la que solo hace falta cuando alguien mira un día concreto.
 */
export async function diaCompleto(
  { linea, circuito = null, fecha, estadistico = 'maximo' }: {
    linea: string; circuito?: string | null; fecha: string; estadistico?: Estadistico;
  },
  sesion: Sesion,
): Promise<Record<string, unknown> | null> {
  const { baseDatos } = await cargarFirebase();
  const { doc, getDoc } = await firestore();
  const db = await baseDatos();
  const d = await getDoc(doc(db, DIAS, idDelDia(sesion.orgId, linea, circuito, fecha, estadistico)));
  return d.exists() ? (d.data() as Record<string, unknown>) : null;
}

/**
 * LOS DÍAS COMPLETOS DE UN PERIODO, hora a hora (`99 §ADR-120`).
 *
 * ⚠️ POR QUÉ EXISTE. El histórico se construyó alrededor del RESUMEN diario —una
 * lectura por día en vez de 24— y eso sigue siendo lo correcto para el tablero.
 * Pero el Ingeniero no quiere auditar días de uno en uno: quiere **elegir una
 * franja de tiempo arriba y ver el comportamiento de cada variable en toda la
 * franja**. Eso exige las horas, y las horas están en `cargabilidad_dias`.
 *
 * ⚠️ CON TOPE, Y SE DICE. Un año son 365 lecturas y el plan es gratuito: se
 * traen como mucho `tope` días y la pantalla anuncia si se recortó. Un tope que
 * no se anuncia se lee como «esto es todo lo que hay», que es la mentira que
 * este módulo lleva evitando desde el principio.
 */
export async function diasCompletos(
  { linea, fechas, estadistico = 'maximo' }: {
    linea: string; fechas: string[]; estadistico?: Estadistico;
  },
  sesion: Sesion,
  { tope = 62 } = {},
): Promise<{ dias: Record<string, unknown>[]; recortado: boolean; tope: number }> {
  const { baseDatos } = await cargarFirebase();
  const { doc, getDoc } = await firestore();
  const db = await baseDatos();
  const pedidas = [...fechas].sort();
  const traer = pedidas.slice(-tope);            // los más recientes, que es lo que se mira
  const leidos = await Promise.all(traer.map(async (fecha) => {
    const d = await getDoc(doc(db, DIAS, idDelDia(sesion.orgId, linea, null, fecha, estadistico)));
    return d.exists() ? (d.data() as Record<string, unknown>) : null;
  }));
  return {
    dias: leidos.filter(Boolean) as Record<string, unknown>[],
    recortado: pedidas.length > traer.length,
    tope,
  };
}

/** Las últimas cargas, para poder responder «¿de dónde salió esto?». */
export async function ultimasCargas(sesion: Sesion, { cuantas = 20 } = {}) {
  const { baseDatos } = await cargarFirebase();
  const { collection, getDocs, limit, orderBy, query, where } = await firestore();
  const db = await baseDatos();
  const q = query(collection(db, CARGAS), where('orgId', '==', sesion.orgId),
    orderBy('cargadoEn', 'desc'), limit(cuantas));
  return (await getDocs(q)).docs.map((d) => d.data() as Record<string, unknown>);
}

// ════════════════════════════════════════════════════════════════════════════
// LAS LÍNEAS DEL PARQUE — para que «de qué línea es este archivo» se ELIJA
// ────────────────────────────────────────────────────────────────────────────
// ⚠️ POR QUÉ, y no es cosmética. Hoy la línea del archivo se escribe a mano en
// una casilla de texto libre, y esa casilla es **lo más caro de equivocar de
// toda la pantalla**: con un solo parque de una línea, un dedazo se notaba; con
// tres líneas, un dedazo en el código escribe un histórico entero a nombre
// de una línea que no existe, y **no hay forma de retirarlo** —`firestore.rules`
// niega el borrado a propósito («un histórico del que se puede quitar una hora
// incómoda no es un histórico»)—. Nadie lo ve nunca: ninguna pantalla abre esa
// línea, así que el dato no aparece «mal», aparece **ausente**.
//
// ⚠️ Y HAY UNA TRAMPA PEOR, que es la que obliga a normalizar contra el parque:
// el `id` del día colapsa mayúsculas, tildes y espacios (`clave()` en
// `contratos/src/cargabilidad.ts`), pero el campo `linea` GUARDA el texto tal
// como se escribió y las consultas (`where('linea','==',…)`) son literales. Así
// que «ln-627» y «LN-627» escriben ENCIMA del mismo documento —la segunda carga
// pisa a la primera— y luego una consulta por «LN-627» no encuentra lo que la
// otra dejó. Mismo documento, dos nombres, y el histórico partido en dos sin un
// solo error por ningún lado.
//
// Aquí se expone lo que la pantalla necesita para ofrecer una LISTA en vez de
// una casilla libre. La pantalla es de otra mano: esto no la cambia.
// ════════════════════════════════════════════════════════════════════════════

/** Una línea del parque, con lo justo para poder ofrecerla y guardarla bien. */
export interface LineaDelParque {
  /** El id de la línea. NO se guarda en el histórico; sirve para casar con la abierta. */
  id: string;
  /** El código: es lo que el histórico guarda en el campo `linea` («LN-627»). */
  codigo: string;
  /** El nombre largo, para poder enseñar «LN-627 · …» sin adivinarlo. */
  nombre: string;
}

/**
 * LAS LÍNEAS QUE ESTA CUENTA PUEDE VER, en el orden en que se dieron de alta.
 *
 * ⚠️ No abre una consulta nueva: reusa `listarLineas()` del repositorio, que es
 * quien ya hace cumplir el alcance del token y valida cada documento contra el
 * molde. Una segunda consulta a `lineas` desde aquí sería una segunda forma de
 * decidir qué líneas existen, y el día que las dos discreparan la pantalla
 * ofrecería para guardar una línea que ninguna otra pestaña abre.
 *
 * Se llama a la implementación de Firestore DIRECTAMENTE y no al singleton
 * `repositorio`, que arranca en «sin sesión» y devuelve `[]` hasta que alguien
 * llama a `usarRepositorio()`: una lista vacía por no estar conectado se leería
 * en pantalla como «su parque no tiene líneas», que es la clase de mentira
 * tranquila que este módulo lleva evitando desde el principio.
 *
 * ⚠️ Vacío significa **«esta cuenta no alcanza ninguna línea»**, nunca «falló la
 * lectura»: los fallos se LANZAN, para que la pantalla los pueda decir. Y el
 * orden es el de la **fecha de alta**, el mismo con el que el navegador del
 * parque enumera las líneas: dos listas de lo mismo en dos órdenes distintos se
 * leen como dos parques distintos.
 *
 * ⚠️ EL ORDEN SE REUSA, NO SE VUELVE A ESCRIBIR. Aquí había una segunda
 * ordenación —por TEXTO, con `localeCompare` de `creadoEn`— que deshacía la
 * buena: `Instante` admite desplazamiento horario, así que «…T09:00:00-05:00»
 * es TRES HORAS POSTERIOR a «…T12:00:00Z» aunque alfabéticamente vaya antes.
 * El desplegable de esta pantalla y la columna del parque enseñaban el mismo
 * parque en distinto orden, que es exactamente lo que el párrafo de arriba dice
 * que no puede pasar. `ordenarParque` es puro, está probado y compara
 * INSTANTES; se aplica sobre lo ya ordenado —es idempotente— para que quede
 * escrito de quién es el criterio y no dependa de que nadie lo quite de
 * `listarLineas`.
 */
export async function lineasDelParque(): Promise<LineaDelParque[]> {
  const lineas = await repositorioFirestore.listarLineas();
  return ordenarParque(lineas).map((l) => ({ id: l.id, codigo: l.codigo, nombre: l.nombre }));
}

/**
 * ¿ESTE CÓDIGO ES DE UNA LÍNEA DEL PARQUE? Devuelve el código **canónico** —el
 * que el parque tiene escrito— o `null` si no es ninguna.
 *
 * Se compara sin distinguir mayúsculas ni espacios de sobra por lo que dice el
 * cabecero: el `id` del día ya los colapsa, así que dos grafías escriben el
 * mismo documento y luego se consultan por separado. Lo que se guarde tiene que
 * ser la grafía del parque, siempre la misma.
 *
 * Es PURA: no lee la base. La lista se pide una vez con `lineasDelParque()` y se
 * comprueba contra ella tantas veces como haga falta, sin gastar lecturas.
 */
export function codigoEnElParque(escrito: string, lineas: LineaDelParque[]): string | null {
  const q = escrito.trim().toLowerCase();
  if (!q) return null;
  return lineas.find((l) => l.codigo.trim().toLowerCase() === q)?.codigo ?? null;
}

/** La versión del molde con la que se escribió. Va al pie, como el resto. */
export const VERSION_DEL_MOLDE = VERSION_CONTRATO;
