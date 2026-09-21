// ============================================================================
// datos/cargabilidadRepo.ts — guardar y consultar el histórico de cargabilidad
// ----------------------------------------------------------------------------
// LA ÚNICA PIEZA DE ESTE MÓDULO QUE TOCA LA BASE (`99 §ADR-088`). Todo lo demás
// —leer el `.xlsx`, validar, empaquetar, resumir— es puro y no sabe que existe
// Firestore. Aquí solo se escribe lo que ya viene armado y se lee lo justo.
//
// ⚠️ LO QUE ESTE ARCHIVO NO PUEDE OLVIDAR
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
// 5. **LO QUE SE DEJA FUERA SE ESCRIBE TAMBIÉN.** Un día con alguna hora que no
//    es «Actual» se aparta ENTERO —decisión del Ingeniero, 2026-09-20— y su
//    motivo va en el rastro de la carga, no solo en la pantalla. El rastro es
//    INMUTABLE: lo que no se escriba al crearlo no se escribe nunca, y dentro de
//    seis meses una carga que calla lo apartado afirma que aquel día no vino.
//
// 6. **LO QUE YA ESTÁ IGUAL NO SE REESCRIBE.** Ocho meses de una línea entran en
//    DIECISIETE tandas de cien archivos, y volver a pasar una tanda ya cargada
//    no puede gastar la cuota en escribir lo mismo encima ni subirle la revisión
//    a ochocientos días que nadie corrigió. Se compara el CONTENIDO —nunca el
//    sello ni la partida de nacimiento— con el mismo criterio que el cargador de
//    consola (`herramientas/cargar-cargabilidad.mjs`), y hay una prueba de
//    paridad que se pone roja si los dos criterios se separan.
//
// ⚠️ Y lo que NO hace: no borra. Un histórico del que se puede quitar una hora
// incómoda no es un histórico. Las reglas de la base lo niegan además de esto.
// ============================================================================
import {
  CargaDeCargabilidad, type DiaApartado, DiaDeCargabilidad, type Estadistico, idDelDia, idDelResumen,
  ResumenDiarioCargabilidad, ROTULO_MOTIVO_APARTADO, VERSION_CONTRATO,
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

/**
 * UN DÍA QUE NO ENTRA, Y POR QUÉ (decisión del Ingeniero, 2026-09-20).
 *
 * ⚠️ **Un día con AL MENOS UNA hora cuyo sello no sea «Actual» se aparta
 * ENTERO.** No se recortan las horas malas ni se cargan «las buenas»: o entra
 * completo o no entra. Lo apartado se puede sumar después; **lo cargado no se
 * puede retirar** —`firestore.rules` niega el borrado de las tres colecciones a
 * propósito—, así que ante la duda se deja fuera.
 *
 * La FORMA es del molde (`contratos/src/cargabilidad.ts`) y se reexporta aquí
 * para que la pantalla no tenga que importarla de dos sitios: fecha, motivo de
 * un catálogo CERRADO —para poder CONTAR cuántos días se apartaron por sello—,
 * y el detalle de qué sello y en qué horas. Aquí no se inventa nada de eso.
 */
export type { DiaApartado };

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
    /**
     * LOS DÍAS QUE SE DEJARON FUERA, con su motivo.
     *
     * ⚠️ VA EN EL RASTRO, no solo en la pantalla. `cargabilidad_cargas` es
     * INMUTABLE (`update: if false` en las reglas): lo que no se escriba al
     * crearla no se escribe nunca. Una carga que calla lo apartado afirma,
     * dentro de seis meses, que aquel día **no vino** — cuando lo que pasó es
     * que se dejó fuera a propósito y se puede sumar cuando él lo decida.
     *
     * Es el campo `apartados` del molde. Si el molde no lo conservara, el
     * guardado SE PARA: ver la comprobación dentro de `guardarCarga`.
     */
    apartados?: DiaApartado[];
  };
}

/**
 * EL ACUSE DE UNA TANDA — con todo lo que hace falta para sumarlo con los demás.
 *
 * ⚠️ POR QUÉ TRAE MÁS DE LO QUE PARECE. La pantalla admite **100 archivos por
 * carga** —es el tope del rastro de procedencia, `CargaDeCargabilidad.archivos`,
 * y no un capricho—, así que ocho meses de una línea entran en DIECISIETE
 * tandas. Si cada tanda devolviera solo «se guardaron N días», la pantalla
 * tendría que recalcular el total por su cuenta; y un total recalculado por
 * quien no escribió acaba discrepando de la base sin que nadie lo note. Aquí va
 * contado lo que de verdad pasó, y `acumularAcuses` lo suma.
 */
export interface Acuse {
  cargaId: string;
  /** Días que traía ESTA tanda. No todos acaban en una escritura (ver abajo). */
  dias: number;
  resumenes: number;
  /**
   * Cuántos de esos días YA estaban guardados, decían **otra cosa** y se han
   * reescrito con lo que traen estos archivos.
   *
   * ⚠️ Antes contaba «los que ya existían», dijeran lo mismo o no. Con la carga
   * por tandas eso se vuelve una mentira cómoda: volver a pasar la misma carpeta
   * contestaría «ochocientos días reemplazados» sin haber cambiado una cifra.
   */
  reemplazados: number;
  /** Escrituras de verdad contra la base, el rastro de la carga incluido. */
  escrituras: number;
  /** Lo que se escribió, por colección. */
  escritos: { dias: number; resumenes: number };
  /** Lo que YA estaba y decía exactamente lo mismo: no se reescribe. */
  repetidos: { dias: number; resumenes: number };
  /**
   * De los repetidos, cuántos se habían escrito con OTRA versión del motor.
   * Mismas cifras, otro sello: no se reescriben, se dicen. Ponerle el sello de
   * hoy a una cifra que produjo otro motor sería inventar la trazabilidad.
   */
  otroMotor: number;
  /** Los días que se dejaron fuera, tal y como quedaron escritos en el rastro. */
  apartados: DiaApartado[];
}

/**
 * LO QUE NO SE COMPARA AL DECIDIR SI UN DÍA «YA ESTÁ IGUAL».
 *
 * ⚠️ Es la MISMA lista que `herramientas/cargar-cargabilidad.mjs`, y no una
 * copia libre: hay una prueba de paridad que compara las dos y se pone roja si
 * se separan. Dos criterios para decidir si un día cambió son dos históricos.
 *
 * `cargaId`, `creadoEn` y `revision` cambian en CADA pasada sin que cambie una
 * sola medida: compararlos haría que nada fuera nunca idéntico y la pantalla
 * reescribiría el histórico entero cada vez que se guarda.
 *
 * ⚠️ Y `versionMotor` queda fuera A PROPÓSITO: es el sello de con qué se produjo
 * la cifra (`CLAUDE.md §3.1`), pero **no es la cifra**. Un día cuyos valores son
 * los mismos no se ha «corregido» porque el núcleo haya pasado de 0.21.0 a
 * 0.21.1; reescribir ochocientos días por un cambio de versión sería gastar la
 * cuota del plan gratuito en no cambiar nada. La diferencia se DICE en el acuse
 * (`otroMotor`), que es donde sirve.
 */
export const NO_SE_COMPARAN = Object.freeze([
  'id', 'orgId', 'creadoEn', 'creadoPor', 'actualizadoEn', 'actualizadoPor',
  'revision', 'revisionBase', 'cargaId', 'versionMotor',
]);

/** Ordena las claves de un objeto y las de los suyos. Las listas NO se tocan. */
function ordenarHondo(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(ordenarHondo);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, ordenarHondo(x)]));
  }
  return v;
}

/**
 * ¿ESTE DOCUMENTO DICE LO MISMO QUE EL QUE YA ESTÁ GUARDADO?
 *
 * Compara el CONTENIDO, no la metadata (ver `NO_SE_COMPARAN`). Se serializa con
 * las claves ordenadas porque la base devuelve los campos en su orden, no en el
 * que se escribieron, y dos objetos iguales con las claves al revés se leerían
 * como distintos — y entonces cada tanda reescribiría todo lo anterior.
 */
export function mismoContenido(
  nuevo: Record<string, unknown>, previo: Record<string, unknown>,
): boolean {
  const limpio = (o: Record<string, unknown>) => JSON.stringify(ordenarHondo(
    Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => !NO_SE_COMPARAN.includes(k))),
  ));
  return limpio(nuevo) === limpio(previo);
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

  const apartados = carga.apartados ?? [];

  const cargaId = crypto.randomUUID();
  const docCarga = CargaDeCargabilidad.parse({
    id: cargaId, orgId: sesion.orgId, creadoEn: ahora, creadoPor: sesion.uid, revision: 0,
    ...carga,
    cargadoEn: ahora, cargadoPor: sesion.uid,
    estado: 'guardada',
    ...SELLO,
  }) as unknown as Record<string, unknown>;

  // ⚠️ ¿SOBREVIVIÓ LO APARTADO AL MOLDE? Se cuenta lo que entró contra lo que
  // salió, y si no coincide NO SE GUARDA NADA.
  //
  // El molde es un `z.object` sin `passthrough`: **un campo que él no conozca se
  // cae sin error y sin aviso**. Aquí ese silencio sería el peor de los posibles
  // —el rastro es INMUTABLE, así que no hay segunda oportunidad de escribirlo— y
  // dejaría una carga que afirma que entró todo. Es la misma cuenta de entrada
  // contra salida que salvó el guardado de días (`feedback: guardado parcial
  // silencioso`): escribir menos de lo que se enseñó no da error en ninguna capa.
  //
  // Se comprueba ANTES del `setDoc` a propósito: parar aquí no deja rastro a
  // medias, y el Ingeniero puede volver a guardar cuando el molde lo admita.
  const apartadosEscritos = (docCarga.apartados as DiaApartado[] | undefined) ?? [];
  if (apartadosEscritos.length !== apartados.length) {
    throw new Error(
      `Se iban a dejar fuera ${apartados.length} día(s) y el rastro de la carga solo conserva `
      + `${apartadosEscritos.length}: el molde de los datos no está conservando el campo «apartados» `
      + '(«contratos/src/cargabilidad.ts»). No se guarda nada: el rastro de una carga no se puede '
      + 'corregir después —las reglas lo niegan—, y uno que calla lo apartado dice que entró todo.',
    );
  }
  await setDoc(doc(db, CARGAS, cargaId), docCarga);

  // QUÉ DÍAS DE ÉSTOS YA ESTABAN. Se leen ANTES de escribir por dos razones, y
  // la segunda costó una tarde:
  //
  //   1. el Ingeniero pidió poder distinguir lo NUEVO de lo REEMPLAZADO —y, con
  //      la carga por tandas, también lo que ya estaba y decía LO MISMO, que no
  //      se vuelve a escribir;
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
  const repetidos = { dias: 0, resumenes: 0 };
  /** Los días que ya estaban guardados y decían OTRA cosa: ésos sí se pisan. */
  const distintos: string[] = [];
  let otroMotor = 0;

  /**
   * ⚠️ LO QUE YA ESTÁ IGUAL NO SE MANDA. Con la carga por tandas, volver a pasar
   * una carpeta ya cargada escribiría ochocientos documentos idénticos encima:
   * gastaría la cuota del plan gratuito, subiría la revisión de días que nadie
   * corrigió y borraría de su historia la fecha en que de verdad se cargaron.
   * Se cuenta y se dice (`repetidos`), que es lo que hace falta saber.
   */
  const encolar = (
    col: string, id: string, documento: Record<string, unknown>, cual: 'dias' | 'resumenes',
  ) => {
    const previo = previos.get(`${col}/${id}`);
    if (previo) {
      if (mismoContenido(documento, previo)) {
        repetidos[cual] += 1;
        if (previo.versionMotor !== SELLO.versionMotor) otroMotor += 1;
        return;
      }
      if (col === DIAS) distintos.push(id);
    }
    paraEscribir.push([col, id, documento]);
  };

  dias.forEach((d, i) => {
    encolar(DIAS, ids[i], DiaDeCargabilidad.parse({
      id: ids[i], orgId: sesion.orgId, ...partida(DIAS, ids[i]),
      ...d, cargaId, versionMotor: SELLO.versionMotor,
    }) as unknown as Record<string, unknown>, 'dias');
  });
  resumenes.forEach((r, i) => {
    const id = idsResumen[i];
    encolar(RESUMENES, id, ResumenDiarioCargabilidad.parse({
      id, orgId: sesion.orgId, ...partida(RESUMENES, id), ...r,
      versionMotor: SELLO.versionMotor,
    }) as unknown as Record<string, unknown>, 'resumenes');
  });

  // Se cuenta ANTES de escribir: después es imposible distinguir lo nuevo de lo
  // reemplazado, y el Ingeniero pidió expresamente poder diferenciarlos.
  const reemplazados = distintos.length;
  const escritos = {
    dias: paraEscribir.filter(([col]) => col === DIAS).length,
    resumenes: paraEscribir.filter(([col]) => col === RESUMENES).length,
  };

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
    escritos, repetidos, otroMotor, apartados: apartadosEscritos,
  };
}

/** El acuse de TODAS las tandas de una carga larga, ya sumado. */
export interface AcuseAcumulado {
  /** Cuántas tandas se guardaron (cada una es una carga con su rastro). */
  tandas: number;
  /** El id de cada carga, en el orden en que se guardaron. */
  cargas: string[];
  /** Días y resúmenes que se ENTREGARON entre todas las tandas. */
  dias: number;
  resumenes: number;
  /** Lo que de verdad se escribió. */
  escritos: { dias: number; resumenes: number };
  /** Lo que ya estaba y decía lo mismo. */
  repetidos: { dias: number; resumenes: number };
  reemplazados: number;
  escrituras: number;
  otroMotor: number;
  /**
   * Los días apartados: lo que NO entró y se puede sumar después. Sin repetir
   * —mismo día y mismo motivo es el mismo hecho— y de la fecha más vieja a la
   * más nueva.
   */
  apartados: DiaApartado[];
  /**
   * Cuántos DÍAS se apartaron por cada motivo, ya rotulado.
   *
   * ⚠️ Es para lo que el catálogo de motivos es CERRADO: «8 por sello y 1 fuera
   * del periodo» se cuenta; una frase escrita a mano, no. Se cuenta aquí y no
   * en la pantalla para que la cuenta y la lista no puedan discrepar.
   */
  apartadosPorMotivo: { motivo: string; rotulo: string; dias: number }[];
  /**
   * La frase para la pantalla, ya escrita.
   *
   * Va aquí y no en la pantalla por lo mismo que el aviso del recorte: el único
   * sitio que SABE qué se escribió y qué se dejó fuera es el que lo hizo. Una
   * pantalla que redacta el acuse por su cuenta acaba diciendo lo que ya no es
   * verdad — y aquí lo que se afirma es sobre un histórico que no se puede
   * retirar.
   */
  frase: string;
}

/**
 * SUMAR LOS ACUSES DE UNA CARGA LARGA — sin que la pantalla recalcule nada.
 *
 * ⚠️ POR QUÉ ES UNA PIEZA APARTE Y PURA. Ocho meses de una línea son unos 812
 * archivos y entran en **diecisiete tandas** de cien; el Ingeniero no quiere
 * diecisiete acuses sueltos, quiere saber **qué quedó guardado, qué ya estaba y
 * qué se dejó fuera**. Sumarlo es lo único que puede salir mal aquí, así que se
 * prueba sin base de datos.
 *
 * Los días apartados NO se suman: se unen sin repetir. La lista de lo apartado
 * es la misma para todas las tandas de una carpeta, y sumarla diría «136 días
 * apartados» donde hay ocho.
 */
export function acumularAcuses(acuses: Acuse[]): AcuseAcumulado {
  const vacio: AcuseAcumulado = {
    tandas: 0, cargas: [], dias: 0, resumenes: 0,
    escritos: { dias: 0, resumenes: 0 }, repetidos: { dias: 0, resumenes: 0 },
    reemplazados: 0, escrituras: 0, otroMotor: 0, apartados: [], apartadosPorMotivo: [], frase: '',
  };
  const vistos = new Set<string>();
  const total = (acuses ?? []).reduce((t, a) => {
    for (const x of a.apartados ?? []) {
      // El mismo día apartado por el mismo motivo es el MISMO hecho, aunque
      // venga repetido en cada tanda de la carpeta.
      const clave = `${x.fecha}|${x.motivo}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      t.apartados.push(x);
    }
    return {
      ...t,
      tandas: t.tandas + 1,
      cargas: [...t.cargas, a.cargaId],
      dias: t.dias + a.dias,
      resumenes: t.resumenes + a.resumenes,
      escritos: {
        dias: t.escritos.dias + a.escritos.dias,
        resumenes: t.escritos.resumenes + a.escritos.resumenes,
      },
      repetidos: {
        dias: t.repetidos.dias + a.repetidos.dias,
        resumenes: t.repetidos.resumenes + a.repetidos.resumenes,
      },
      reemplazados: t.reemplazados + a.reemplazados,
      escrituras: t.escrituras + a.escrituras,
      otroMotor: t.otroMotor + a.otroMotor,
      apartados: t.apartados,
    };
  }, vacio);

  total.apartados.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  const fechasApartadas = new Set(total.apartados.map((x) => x.fecha));

  // ⚠️ SE CUENTAN DÍAS, NO ANOTACIONES: un día que trajera dos motivos se cuenta
  // UNA vez, por el primero. Si no, la suma de los motivos daría más días
  // apartados que días hay, y la frase se contradiría a sí misma.
  const porMotivo = new Map<string, number>();
  const contados = new Set<string>();
  for (const x of total.apartados) {
    if (contados.has(x.fecha)) continue;
    contados.add(x.fecha);
    porMotivo.set(x.motivo, (porMotivo.get(x.motivo) ?? 0) + 1);
  }
  total.apartadosPorMotivo = [...porMotivo].map(([motivo, dias]) => ({
    motivo,
    rotulo: ROTULO_MOTIVO_APARTADO[motivo as keyof typeof ROTULO_MOTIVO_APARTADO] ?? motivo,
    dias,
  }));

  total.frase = total.tandas === 0
    ? 'No se guardó ninguna tanda.'
    : `${conMiles(total.tandas)} tanda(s): ${conMiles(total.escritos.dias)} día(s) y `
      + `${conMiles(total.escritos.resumenes)} resumen(es) escritos`
      + (total.repetidos.dias
        ? ` · ${conMiles(total.repetidos.dias)} día(s) ya estaban igual y no se reescribieron`
        : '')
      + (total.reemplazados
        ? ` · ⚠️ ${conMiles(total.reemplazados)} día(s) ya estaban y decían otra cosa: se reemplazaron`
        : '')
      + (fechasApartadas.size
        ? ` · ${conMiles(fechasApartadas.size)} día(s) apartados SIN CARGAR `
          + `(${total.apartadosPorMotivo.map((m) => `${conMiles(m.dias)} porque ${m.rotulo}`).join('; ')}). `
          + 'Lo apartado se puede sumar después; lo cargado no se puede retirar.'
        : '.');

  return total;
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
