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
  CargaDeCargabilidad, DiaDeCargabilidad, idDelDia, idDelResumen,
  ResumenDiarioCargabilidad, VERSION_CONTRATO,
} from '@lineas/contratos';
import nucleoPkg from '@lineas/nucleo/package.json';
import { cargarFirebase } from './cargar';

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

  // Cuántos días de éstos YA estaban. Se cuenta ANTES de escribir, porque
  // después es imposible distinguir lo nuevo de lo reemplazado — y el Ingeniero
  // pidió expresamente poder diferenciarlos.
  const ids = dias.map((d) => idDelDia(sesion.orgId, String(d.linea), d.circuito as string, String(d.fecha)));
  const existian = await Promise.all(ids.map(async (id) => (await getDoc(doc(db, DIAS, id))).exists()));
  const reemplazados = existian.filter(Boolean).length;

  const paraEscribir: [string, string, Record<string, unknown>][] = [];
  dias.forEach((d, i) => {
    paraEscribir.push([DIAS, ids[i], DiaDeCargabilidad.parse({
      id: ids[i], orgId: sesion.orgId, creadoEn: ahora, creadoPor: sesion.uid, revision: 0,
      ...d, cargaId, versionMotor: SELLO.versionMotor,
    }) as unknown as Record<string, unknown>]);
  });
  for (const r of resumenes) {
    const id = idDelResumen(sesion.orgId, String(r.linea), String(r.fecha));
    paraEscribir.push([RESUMENES, id, ResumenDiarioCargabilidad.parse({
      id, orgId: sesion.orgId, creadoEn: ahora, creadoPor: sesion.uid, revision: 0, ...r,
      versionMotor: SELLO.versionMotor,
    }) as unknown as Record<string, unknown>]);
  }

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
export async function resumenesEntre(
  { desde, hasta, lineas = [] }: { desde: string; hasta: string; lineas?: string[] },
  sesion: Sesion,
  { tope = 1200 } = {},
): Promise<{ resumenes: Record<string, unknown>[]; recortado: boolean; tope: number }> {
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

  const q = query(collection(db, RESUMENES), ...partes, orderBy('fecha'), limit(tope + 1));
  const instantanea = await getDocs(q);
  let filas = instantanea.docs.map((d) => d.data() as Record<string, unknown>);
  if (lineas.length > 1) filas = filas.filter((f) => lineas.includes(String(f.linea)));

  return { resumenes: filas.slice(0, tope), recortado: filas.length > tope, tope };
}

/**
 * UN DÍA COMPLETO, hora a hora. Se pide de uno en uno a propósito: es la
 * consulta cara, y la que solo hace falta cuando alguien mira un día concreto.
 */
export async function diaCompleto(
  { linea, circuito = null, fecha }: { linea: string; circuito?: string | null; fecha: string },
  sesion: Sesion,
): Promise<Record<string, unknown> | null> {
  const { baseDatos } = await cargarFirebase();
  const { doc, getDoc } = await firestore();
  const db = await baseDatos();
  const d = await getDoc(doc(db, DIAS, idDelDia(sesion.orgId, linea, circuito, fecha)));
  return d.exists() ? (d.data() as Record<string, unknown>) : null;
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

/** La versión del molde con la que se escribió. Va al pie, como el resto. */
export const VERSION_DEL_MOLDE = VERSION_CONTRATO;
