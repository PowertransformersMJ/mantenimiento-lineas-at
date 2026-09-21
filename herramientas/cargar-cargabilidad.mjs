#!/usr/bin/env node
// ============================================================================
// herramientas/cargar-cargabilidad.mjs — meter en la base los días ya procesados
// ----------------------------------------------------------------------------
// QUÉ RESUELVE. Los pasos 0·1·2 (`normalizar-xls` → la bahía → `juntar-por-dia`)
// dejan una carpeta con UN archivo por día y estadístico. Hasta hoy esa carpeta
// se subía A MANO desde la pantalla, en lotes de cien archivos: LN-627 costó
// **trece pasadas** (`99 §ADR-128`). Con dos líneas nuevas —LN-617 y LN-628, más
// de 1.600 archivos entre las dos— eso son veinte pasadas de ratón sin más
// criterio que no equivocarse. Esto hace exactamente lo mismo, de una vez, y
// **deja escrito el cuadre**.
//
// ⚠️ HACE LO MISMO QUE LA PANTALLA, NO ALGO PARECIDO. Cada pieza se pide
// prestada al mismo sitio del que tira `web/src/componentes/Cargabilidad.tsx`:
//
//   · `unirPorDia` / `registrosDeVariosDias`  — leer las matrices anchas y juntar
//     las fases (`nucleo/cargabilidadAncho.js`);
//   · `empaquetarPorDia` / `resumirDia`       — armar el día y su resumen
//     (`nucleo/cargabilidad.js`);
//   · `repartirEnLotes` / `ARCHIVOS_POR_CARGA` / `motivoDelApartado` — en cuántas
//     tandas se parte y cómo se dice por qué se apartó un día
//     (`nucleo/cargaPorLotes.js`);
//   · `idDelDia` / `idDelResumen` y los moldes — la identidad y la forma
//     (`contratos/src/cargabilidad.ts`);
//   · `sellos-de-calidad.mjs`                 — qué horas NO son medida.
//
// Aquí no se calcula NADA. Si esto y la pantalla discrepan alguna vez, es un
// error de esta herramienta, no una segunda verdad.
//
// ⚠️ LA REGLA QUE MANDA SOBRE LOS DÍAS (decisión del Ingeniero, 2026-09-20):
// **un día con AL MENOS UNA hora cuyo sello no sea «Actual» se aparta ENTERO**,
// hasta que él decida qué hacer con él. No se recorta el día ni se cargan «las
// horas buenas»: o entra completo o no entra. Lo apartado se puede sumar
// después; **lo cargado NO se puede retirar** — `firestore.rules` niega el
// borrado de las tres colecciones a propósito («un histórico del que se puede
// quitar una hora incómoda no es un histórico»). Ante la duda, se deja fuera.
//
// ⚠️ Y UN DÍA SIN NINGÚN SELLO **NO** ES UN DÍA APARTADO. Ninguna de sus horas
// trae un sello distinto de «Actual» porque no trae sello ninguno, así que la
// regla de arriba no lo toca — pero tampoco es un día dado por bueno. Se carga
// y se NOMBRA, uno a uno, para que el Ingeniero sepa qué entró sin respaldo.
//
// ⚠️ LO APARTADO SE ESCRIBE EN EL RASTRO DE CADA CARGA, y solo lo apartado POR
// UNA REGLA (`CargaDeCargabilidad.apartados`, molde 0.18.0). Va la MISMA lista
// en todas las cargas de la pasada —lo apartado es de la carpeta, no de la
// tanda— y NO va lo que queda fuera de «--desde/--hasta»: acotar el periodo es
// lo que se pidió cargar hoy, y es la forma de reanudar una pasada que se cortó;
// anotar como «no entró» un día que la pasada anterior ya cargó sería una
// mentira imposible de corregir, porque esa colección no se actualiza. El porqué
// entero, en `apartadosParaElRastro`, que es donde se decide.
//
// ⚠️ NO BORRA, NO CORRIGE Y NO ELIGE. Escribe lo que el motor produce, valida
// cada documento contra su molde ANTES de mandar nada, y si algo no cuadra sale
// con error sin escribir. Un día que ya está guardado y es idéntico no se
// reescribe; si es distinto, se DICE y no se pisa sin `--reemplazar`.
//
// ⚠️ EL GUIÓN ES LO DE ABAJO; LO DE ARRIBA SE PUEDE PROBAR SIN BASE. Las piezas
// que de verdad se pueden equivocar —comparar contra lo guardado, validar contra
// el molde, cuadrar lo leído con lo escrito— son funciones PURAS y exportadas, y
// su prueba (`tests/cargar-cargabilidad.test.js`) las llama sin red y sin llave.
// El guión solo corre cuando este archivo se ejecuta a mano.
//
//   node herramientas/cargar-cargabilidad.mjs --linea LN-617 \
//     --origen <carpeta del paso 2> --sellos <carpeta del paso 1> --seco
//
//   GOOGLE_APPLICATION_CREDENTIALS=~/Downloads/LA-LLAVE.json \
//     node herramientas/cargar-cargabilidad.mjs --linea LN-617 \
//       --origen <carpeta del paso 2> --sellos <carpeta del paso 1>
//
// Salida: 0 = todo cuadra · 1 = algo no cuadra (no se escribió, o se escribió y
// la relectura no coincide) · 2 = uso incorrecto.
// ============================================================================
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { celdasDeCsv, separadorDe } from '../importar/csv.js';
import { huellaDeArchivo } from '../importar/identidad.js';
import { empaquetarPorDia, ESTADISTICOS, resumirDia } from '../nucleo/cargabilidad.js';
import {
  esArchivoDeCalidad, estadisticoDeNombre, estadisticoPorFilaCorregido,
  registrosDeVariosDias, revisarFasesPorDia, unirPorDia,
} from '../nucleo/cargabilidadAncho.js';
import {
  ARCHIVOS_POR_CARGA, CAUSA_DEL_APARTADO, motivoDelApartado, repartirEnLotes,
} from '../nucleo/cargaPorLotes.js';
import {
  CargaDeCargabilidad, COLECCIONES_CARGABILIDAD, DiaDeCargabilidad, DIAS_APARTADOS_POR_CARGA,
  idDelDia, idDelResumen, ResumenDiarioCargabilidad, ROTULO_MOTIVO_APARTADO,
} from '../contratos/src/cargabilidad.ts';
import { VERSION_CONTRATO } from '../contratos/src/index.ts';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..');
export const VERSION_MOTOR = JSON.parse(readFileSync(join(RAIZ, 'nucleo', 'package.json'), 'utf8')).version;

/**
 * EL TOPE DE ARCHIVOS Y EL REPARTO EN TANDAS **NO VIVEN AQUÍ**: son del núcleo
 * (`nucleo/cargaPorLotes.js`), que es de donde tira también la pantalla. Esto
 * solo los reexporta con el mismo nombre de siempre, para que quien ya los
 * importaba de aquí —las pruebas— los siga encontrando (`CLAUDE.md §3.1`: nada
 * exportado se renombra sin migración).
 *
 * ⚠️ HASTA HOY HABÍA DOS COPIAS —una aquí y otra en el núcleo— y una prueba de
 * paridad que las comparaba caso por caso. Una prueba de paridad es un cable
 * trampa: avisa DESPUÉS de que alguien cambie una de las dos, y mientras tanto
 * dos criterios para partir la misma carpeta son dos históricos distintos. Ahora
 * hay una sola versión, y el cable trampa compara la única que queda consigo
 * misma: sobra, y por eso sobra.
 *
 * Lo que dicen allí, y sigue mandando: el tope es 100 porque
 * `CargaDeCargabilidad.archivos` declara `.max(100)` —ese documento es el RASTRO
 * de procedencia y una lista que se corta no responde «¿de qué archivo salió
 * este número?»—, y **un día NUNCA se parte entre dos tandas**: sus archivos —los
 * estadísticos del día— viajan juntos porque juntos se unen (`unirAnchas` exige
 * el mismo eje de tiempo) y juntos se leen.
 */
export { ARCHIVOS_POR_CARGA, repartirEnLotes };

/**
 * Firestore admite 500 escrituras por lote. Se parte en trozos y no se manda uno
 * gigante: un lote que se pasa falla ENTERO. Es el mismo número que usa
 * `web/src/datos/cargabilidadRepo.ts`, y por el mismo motivo.
 */
const ESCRITURAS_POR_LOTE = 400;

/** Cuántos documentos se piden de una vez al releer. `getAll` no admite miles. */
const LECTURAS_POR_TANDA = 300;

/**
 * LO QUE NO SE COMPARA AL DECIDIR SI UN DÍA «YA ESTÁ IGUAL».
 *
 * ⚠️ `cargaId`, `creadoEn`, `revision` y compañía cambian en CADA pasada sin que
 * cambie una sola medida: compararlos haría que nada fuera nunca idéntico y la
 * herramienta reescribiría el histórico entero cada vez que se corre.
 *
 * ⚠️ Y `versionMotor` queda fuera A PROPÓSITO, con su razón escrita: es el sello
 * de con qué se produjo la cifra (`CLAUDE.md §3.1`), pero **no es la cifra**. Un
 * día cuyos valores son los mismos no se ha «corregido» porque el núcleo haya
 * pasado de 0.21.0 a 0.21.1; reescribir 800 días por un cambio de versión sería
 * gastar la cuota del plan gratuito en no cambiar nada. La diferencia de motor
 * se DICE en el informe, que es donde sirve.
 */
export const NO_SE_COMPARAN = Object.freeze([
  'id', 'orgId', 'creadoEn', 'creadoPor', 'actualizadoEn', 'actualizadoPor',
  'revision', 'revisionBase', 'cargaId', 'versionMotor',
]);

const IDS_ESTADISTICO = ESTADISTICOS.map((e) => e.id);

// ════════════════════════════════════════════════════════════════════════════
// LAS PIEZAS PURAS — se prueban sin base, sin red y sin llave
// ════════════════════════════════════════════════════════════════════════════

/**
 * ¿ESTE DOCUMENTO DICE LO MISMO QUE EL QUE YA ESTÁ GUARDADO?
 *
 * Compara el CONTENIDO, no la metadata (ver `NO_SE_COMPARAN`). Se serializa con
 * las claves ordenadas porque Firestore devuelve los campos en su orden, no en
 * el que se escribieron, y dos objetos iguales con las claves al revés se
 * leerían como distintos — y esta herramienta reescribiría el histórico entero.
 */
export function mismoContenido(nuevo, previo) {
  const limpio = (o) => JSON.stringify(ordenarHondo(
    Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => !NO_SE_COMPARAN.includes(k))),
  ));
  return limpio(nuevo) === limpio(previo);
}

/** Ordena las claves de un objeto y las de los suyos. Las listas NO se tocan. */
function ordenarHondo(v) {
  if (Array.isArray(v)) return v.map(ordenarHondo);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))
      .map(([k, x]) => [k, ordenarHondo(x)]));
  }
  return v;
}

/**
 * LOS DÍAS QUE NO ENTRARON, EN LA FORMA DEL RASTRO (`CargaDeCargabilidad.apartados`).
 *
 * ⚠️ NO BASTA CON DECIRLO EN LA CONSOLA. `cargabilidad_cargas` es INMUTABLE
 * —`update: if false` en las reglas—: lo que no se escriba al CREAR la carga no
 * se escribe nunca. Una carga que calla lo apartado afirma, dentro de seis
 * meses, que aquel día **no vino** — cuando lo que pasó es que se dejó fuera a
 * propósito y se puede sumar el día que el Ingeniero lo decida.
 *
 * ⚠️ AQUÍ SOLO ENTRA LO APARTADO **POR UNA REGLA**, es decir lo que se decidió
 * mirando este origen: `sello_no_actual` (alguna hora del día no se midió),
 * `fuera_del_periodo` (el Ingeniero acotó qué quería cargar) y `sin_lecturas`
 * (el día no dejó ni una lectura con número).
 *
 * ⚠️ **LO QUE NO ENTRA NUNCA son los días de `--ya-cargado-hasta`**, y ahí está
 * todo el asunto. Reanudar una pasada cortada NO es acotar el periodo: son dos
 * preguntas distintas y por eso tienen dos opciones distintas. Mientras las dos
 * cupieron en «--desde», reanudar dejaba escrito —en un rastro que no se edita
 * ni se borra— que días YA CARGADOS «quedaron fuera del periodo»; medido en la
 * pantalla, con el mismo defecto: 110 días de LN-617. De un día ya escrito esta
 * carga no dice nada: lo que haya que decir lo dijo la carga que lo escribió.
 *
 * ⚠️ Y UN DÍA SIN NINGÚN SELLO NO VA EN ESTA LISTA: entra en la carga, así que
 * decir que no entró sería la mentira contraria. Se NOMBRA aparte, en el aviso.
 *
 * ⚠️ De las señales sale CUÁNTAS, nunca cuáles: su etiqueta es la ruta del SCADA
 * del cliente (subestación, nivel de tensión, bahía) y esto acaba en una base
 * que se lee desde la pantalla y en informes que se pegan donde sea.
 *
 * @param {{
 *   porSello?: {fecha: string, sellos?: {sello: string, horas: number}[],
 *               senales?: number, horas?: number[], porQue?: string}[],
 *   fueraDelPeriodo?: string[],
 *   periodo?: {desde?: string|null, hasta?: string|null},
 *   sinLecturas?: string[],
 * }} entrada
 * @returns {{fecha: string, motivo: string}[]}  en la forma de `DiaApartado`
 */
export function apartadosParaElRastro({
  porSello = [], fueraDelPeriodo = [], periodo = {}, sinLecturas = [],
} = {}) {
  const puestos = new Set();
  const salida = [];
  for (const d of porSello ?? []) {
    if (!d?.fecha || puestos.has(d.fecha)) continue;
    puestos.add(d.fecha);
    salida.push({
      fecha: d.fecha,
      motivo: 'sello_no_actual',
      // El molde admite doce sellos y veinticuatro horas; la frase ENTERA se
      // guarda igual en `detalle`, que es lo que se lee. Estos dos campos son
      // para CONTAR («¿cuántos días de agosto por “Not Renewed”?»).
      sellos: (d.sellos ?? []).map((s) => String(s.sello)).slice(0, 12),
      horas: (d.horas ?? []).map((h) => String(h).padStart(2, '0')).slice(0, 24),
      senalesAfectadas: Number(d.senales) > 0 ? Number(d.senales) : undefined,
      detalle: String(d.porQue ?? motivoDelApartado(d)).slice(0, 300),
    });
  }
  for (const f of fueraDelPeriodo ?? []) {
    if (!f || puestos.has(f)) continue;
    puestos.add(f);
    // El mismo texto que la pantalla, palabra por palabra: lo redacta el núcleo.
    salida.push({
      fecha: f,
      motivo: 'fuera_del_periodo',
      detalle: motivoDelApartado({ causa: CAUSA_DEL_APARTADO.PERIODO, periodo }).slice(0, 300),
    });
  }
  for (const f of sinLecturas ?? []) {
    // Un día no puede estar dos veces con dos motivos: el primero que lo explica
    // se queda. Los apartados por sello ni siquiera llegan a leerse, así que no
    // pueden aparecer también como «sin lecturas».
    if (!f || puestos.has(f)) continue;
    puestos.add(f);
    salida.push({ fecha: f, motivo: 'sin_lecturas', detalle: ROTULO_MOTIVO_APARTADO.sin_lecturas });
  }
  return salida.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/**
 * LA PARTIDA DE NACIMIENTO de un documento: la suya si ya existía, ésta si nace.
 *
 * ⚠️ Una reescritura NO puede reescribir `creadoEn`, `creadoPor` ni `orgId`
 * (`99 §ADR-111`): son campos RESERVADOS y `firestore.rules` deniega cualquier
 * escritura que los cambie. Con la llave de administrador las reglas no se
 * aplican —y por eso hay que respetarlas AQUÍ a mano—: un documento cuyo autor y
 * fecha de alta se pueden pisar no sirve para responder «¿de dónde salió esto?».
 */
export function partidaDeNacimiento(previo, { ahora, uid }) {
  return previo
    ? {
      creadoEn: previo.creadoEn, creadoPor: previo.creadoPor,
      revision: (Number(previo.revision) || 0) + 1,
      actualizadoEn: ahora, actualizadoPor: uid,
    }
    : { creadoEn: ahora, creadoPor: uid, revision: 0 };
}

/**
 * LOS DOCUMENTOS DE UN LOTE, armados EXACTAMENTE como los arma la pantalla.
 *
 * @param lote  lo que salió del motor: `dias`, `resumenes`, `archivos`, `huella`…
 * @param ctx   `{ org, uid, ahora, linea, totalLotes, apartados, previos, nuevoId }`
 */
export function armarDocumentos(lote, ctx) {
  const {
    org, uid, ahora, linea, totalLotes, apartados = [],
    previos = new Map(), nuevoId = () => crypto.randomUUID(),
  } = ctx;
  const cargaId = nuevoId();
  const dias = lote.dias.map((d) => {
    const id = idDelDia(org, String(d.linea), d.circuito, String(d.fecha), d.estadistico);
    const previo = previos.get(`${COLECCIONES_CARGABILIDAD.dias}/${id}`);
    return {
      coleccion: COLECCIONES_CARGABILIDAD.dias,
      id,
      doc: {
        id, orgId: org, ...partidaDeNacimiento(previo, { ahora, uid }),
        ...d, cargaId, versionMotor: VERSION_MOTOR,
      },
    };
  });
  const resumenes = lote.resumenes.map((r) => {
    const id = idDelResumen(org, String(r.linea), String(r.fecha), r.estadistico);
    const previo = previos.get(`${COLECCIONES_CARGABILIDAD.resumenes}/${id}`);
    return {
      coleccion: COLECCIONES_CARGABILIDAD.resumenes,
      id,
      doc: {
        id, orgId: org, ...partidaDeNacimiento(previo, { ahora, uid }),
        ...r, versionMotor: VERSION_MOTOR,
      },
    };
  });
  const carga = {
    coleccion: COLECCIONES_CARGABILIDAD.cargas,
    id: cargaId,
    doc: {
      id: cargaId, orgId: org, creadoEn: ahora, creadoPor: uid, revision: 0,
      // ⚠️ El rótulo es CORTO a propósito: con cien nombres pegados se pasa de
      // los 260 caracteres y el guardado muere entero. Los nombres van en
      // `archivos`, que es donde vive el rastro (`99 §ADR-113`).
      nombreArchivo: `${linea} · lote ${lote.indice}/${totalLotes} · ${lote.archivos.length} archivos de SCADA`,
      archivos: lote.archivos,
      huella: lote.huella,
      // Cuándo y quién. El molde los exige aparte de la partida de nacimiento:
      // esta colección es INMUTABLE (`update: if false` en las reglas), así que
      // esto se escribe al crearla o no se escribe nunca.
      cargadoEn: ahora,
      cargadoPor: uid,
      filasDelArchivo: lote.filas,
      registrosGuardados: lote.registros.length,
      filasConError: 0,
      // La lectura ancha no mapea columnas: la matriz trae magnitudes, no una
      // cabecera con nombres de campo. La pantalla escribe `{}` por lo mismo.
      mapeo: {},
      lineas: [linea],
      estadisticos: lote.presentes,
      desde: lote.fechas[0], hasta: lote.fechas[lote.fechas.length - 1],
      /**
       * LOS DÍAS QUE NO ENTRARON — **LA MISMA LISTA EN TODAS LAS CARGAS DE LA
       * PASADA**, y es una decisión, no un descuido al copiar.
       *
       * Lo apartado es de la CARPETA, no de la tanda: se decide una vez, antes
       * de partir en tandas de cien archivos. Va repetido en todas porque:
       *
       *   · el rastro es INMUTABLE y la pasada se puede cortar —o saltarse una
       *     tanda entera, porque lo ya guardado e idéntico no se reescribe y esa
       *     carga entonces no se escribe—. Si la lista viviera solo «en la
       *     primera», el porqué del hueco desaparecería para siempre el día que
       *     esa primera no llegue a existir;
       *   · así CADA carga responde sola «¿por qué falta el 26-01?», sin tener
       *     que buscar a sus hermanas y adivinar cuál de las ocho la llevaba;
       *   · y repetirla no infla ninguna cuenta: contar días apartados ya exige
       *     quitar repetidos por fecha —dos pasadas sobre la misma carpeta los
       *     vuelven a declarar—, así que se cuentan FECHAS distintas, no se
       *     suman listas. Es lo mismo que hace la pantalla, que manda la misma
       *     lista en cada tanda y las une sin repetir.
       *
       * ⚠️ Vacía NO es lo mismo que ausente: vacía dice «esta pasada miró y no
       * apartó ningún día por una regla»; ausente —las cargas de antes de 0.18.0—
       * dice «esta carga no lo declaró», y esas no se pueden completar.
       */
      apartados,
      estado: 'guardada',
      versionMotor: VERSION_MOTOR, versionContrato: VERSION_CONTRATO,
    },
  };
  return { carga, dias, resumenes };
}

/**
 * ¿CABE ESTO EN SU MOLDE? Devuelve lo validado y la lista de lo que NO pasa.
 *
 * ⚠️ El molde es un `z.object` sin `passthrough`: un campo que el motor produzca
 * y el molde no conozca se guardaría VACÍO, sin error y sin aviso. Por eso lo
 * que se escribe es la SALIDA de `parse`, no lo que entró.
 */
export function validarDocumentos(piezas) {
  const malos = [];
  const salida = { carga: null, dias: [], resumenes: [] };
  const uno = (molde, x, que) => {
    const r = molde.safeParse(x.doc);
    if (r.success) return { ...x, doc: r.data };
    malos.push(`${que} · ${r.error.issues.slice(0, 4)
      .map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`).join(' · ')}`);
    return null;
  };
  const c = uno(CargaDeCargabilidad, piezas.carga, `la carga «${piezas.carga.doc.nombreArchivo}»`);
  if (c) salida.carga = c;
  for (const x of piezas.dias) {
    const v = uno(DiaDeCargabilidad, x, `el día «${x.id}»`);
    if (v) salida.dias.push(v);
  }
  for (const x of piezas.resumenes) {
    const v = uno(ResumenDiarioCargabilidad, x, `el resumen «${x.id}»`);
    if (v) salida.resumenes.push(v);
  }
  return { malos, salida };
}

/**
 * QUÉ SE ESCRIBE Y QUÉ NO — la regla de idempotencia, entera y sin base.
 *
 * · lo que no existe, nace;
 * · lo que existe y dice LO MISMO no se reescribe (y si se escribió con otro
 *   motor, se dice: mismas cifras, otro sello);
 * · lo que existe y dice OTRA COSA no se pisa. Corregir el histórico es una
 *   decisión del Ingeniero, no un efecto de volver a correr esto.
 *
 * @param {{coleccion: string, id: string, doc: object}[]} documentos
 * @param {Map<string, object>} previos  clave `coleccion/id` → lo guardado
 */
export function decidirEscritura(documentos, previos = new Map(), { versionMotor = VERSION_MOTOR } = {}) {
  const nuevos = []; const identicos = []; const distintos = []; const otroMotor = [];
  for (const x of documentos ?? []) {
    const previo = previos.get(`${x.coleccion}/${x.id}`);
    if (!previo) { nuevos.push(x); continue; }
    if (mismoContenido(x.doc, previo)) {
      identicos.push(x);
      if (previo.versionMotor !== versionMotor) {
        otroMotor.push({ id: x.id, coleccion: x.coleccion, versionMotor: previo.versionMotor ?? null });
      }
      continue;
    }
    distintos.push({ ...x, previo });
  }
  return { nuevos, identicos, distintos, otroMotor };
}

/**
 * EL CUADRE — lo leído contra lo que sale, y si no suma no se escribe.
 *
 * ⚠️ EXISTE POR UNA LECCIÓN CARA: escribir menos de lo que se enseñó **no da
 * error en ninguna capa**. El lote se confirma, la pantalla dice «listo» y
 * faltan ochenta días. La única defensa es contar la entrada contra la salida.
 *
 * Devuelve la lista de desajustes; vacía significa que cuadra.
 */
export function cuadre({ archivos, explicados, documentos, resumenes, lecturas, horas }) {
  const desajustes = [];
  if (documentos !== resumenes) {
    desajustes.push(`${documentos} documento(s) de día y ${resumenes} resumen(es): tiene que haber uno de cada`);
  }
  if (horas !== lecturas) {
    desajustes.push(`${lecturas} lectura(s) leídas y ${horas} hora(s) dentro de los documentos: `
      + 'alguna se perdió al empaquetar');
  }
  if (explicados !== archivos) {
    desajustes.push(`${archivos} archivo(s) de medidas y solo ${explicados} explicados: `
      + 'hay archivos que no se escriben, no se apartan y no se dicen');
  }
  return desajustes;
}

// ════════════════════════════════════════════════════════════════════════════
// EL GUIÓN — de aquí abajo solo corre cuando este archivo se ejecuta a mano
// ════════════════════════════════════════════════════════════════════════════
const USO = `uso: node herramientas/cargar-cargabilidad.mjs --linea LN-617 --origen <carpeta del paso 2>
              [--sellos <carpeta del paso 1>] [--seco] [--json <ruta fuera del repo>]
              [--reemplazar] [--desde AAAA-MM-DD] [--hasta AAAA-MM-DD]
              [--ya-cargado-hasta AAAA-MM-DD]
              [--org transpower] [--uid <quien>] [--criterio-fase maxima|promedio]`;

const CON_VALOR = new Set([
  '--linea', '--origen', '--sellos', '--json', '--desde', '--hasta', '--ya-cargado-hasta',
  '--org', '--uid', '--criterio-fase',
]);
const SIN_VALOR = new Set(['--seco', '--reemplazar']);

/** Los argumentos, o el primer motivo por el que no se entienden. */
export function leerArgumentos(argv) {
  const opciones = { sellos: [] };
  for (let i = 0; i < (argv ?? []).length; i += 1) {
    const a = argv[i];
    if (SIN_VALOR.has(a)) { opciones[a.slice(2)] = true; continue; }
    if (!CON_VALOR.has(a)) return { error: `opción desconocida «${a}»` };
    const v = argv[i + 1];
    if (v == null || v.startsWith('--')) return { error: `«${a}» necesita un valor detrás` };
    if (a === '--sellos') opciones.sellos.push(v);
    else if (a === '--criterio-fase') opciones.criterioFase = v;
    else if (a === '--ya-cargado-hasta') opciones.yaCargadoHasta = v;
    else opciones[a.slice(2)] = v;
    i += 1;
  }
  return { opciones };
}

const n = (x) => Number(x).toLocaleString('es-CO');
const esDiaIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ''));

/**
 * LA RUTA REAL, con los enlaces resueltos. El disco de la Mac no distingue
 * mayúsculas, y «/users/…/MANTENIMIENTO-…» apunta al mismo repositorio saltándose
 * el freno. Misma regla —y a propósito, el mismo código— que `sellos-de-calidad`.
 */
const rutaReal = (p) => {
  let r = resolve(p); const cola = [];
  while (!existsSync(r)) { cola.unshift(basename(r)); r = dirname(r); }
  return join(realpathSync(r), ...cola);
};

async function principal(argv) {
  const avisos = [];
  const aviso = (t) => { avisos.push(t); console.log(`   ⚠️ ${t}`); };
  /** Se para y se dice por qué. Nunca a medias: o entra todo o no entra nada. */
  const alto = (...lineas) => {
    console.log(`\n❌ ${lineas[0]}`);
    for (const l of lineas.slice(1).filter(Boolean)) console.log(`   ${l}`);
    console.log('\n   No se ha escrito nada.');
    process.exit(1);
  };
  const mal = (t) => { console.error(`❌ ${t}\n${USO}`); process.exit(2); };

  // ── 1 · Argumentos ────────────────────────────────────────────────────────
  const { opciones, error } = leerArgumentos(argv);
  if (error) mal(`${error}.`);

  const LINEA = String(opciones.linea ?? '').trim();
  const ORIGEN = opciones.origen;
  const SECO = opciones.seco === true;
  const REEMPLAZAR = opciones.reemplazar === true;
  const ORG = String(opciones.org ?? 'transpower').trim();
  /**
   * QUIÉN CARGA. No hay persona detrás de una llave de administrador, y poner el
   * correo del Ingeniero sería firmar por él una escritura que hizo un guión. Se
   * firma con el nombre de la herramienta, que es la verdad; `--uid` lo cambia.
   */
  const UID = String(opciones.uid ?? 'herramienta:cargar-cargabilidad').trim();
  const CRITERIO_FASE = String(opciones.criterioFase ?? 'maxima').trim();
  const DESDE = opciones.desde ?? null;
  const HASTA = opciones.hasta ?? null;
  /**
   * ⚠️ REANUDAR NO ES ACOTAR EL PERIODO. `--desde/--hasta` dice QUÉ SE QUIERE
   * CARGAR —un juicio sobre el dato, y por eso se escribe en el rastro—;
   * `--ya-cargado-hasta` dice QUÉ YA ESTÁ ESCRITO —un hecho del histórico, del
   * que esta carga no dice nada—. La misma separación que la pantalla, con el
   * mismo módulo detrás (`nucleo/cargaPorLotes.js`), para que no puedan
   * discrepar. Antes las dos cosas cabían en «--desde», y eso dejaba escrito en
   * un rastro inmutable que días ya cargados «no entraron».
   */
  const YA_CARGADO_HASTA = opciones.yaCargadoHasta ?? null;

  if (!LINEA) mal('falta «--linea».');
  if (!ORIGEN) mal('falta «--origen».');
  for (const c of [ORIGEN, ...opciones.sellos]) {
    if (!existsSync(c) || !statSync(c).isDirectory()) mal(`«${c}» no es una carpeta.`);
  }
  if (!['maxima', 'promedio'].includes(CRITERIO_FASE)) {
    mal('«--criterio-fase» solo admite «maxima» (la fase más cargada) o «promedio».');
  }
  for (const [rot, v] of [['--desde', DESDE], ['--hasta', HASTA], ['--ya-cargado-hasta', YA_CARGADO_HASTA]]) {
    if (v != null && !esDiaIso(v)) mal(`«${rot}» va como AAAA-MM-DD.`);
  }
  if (DESDE && HASTA && DESDE > HASTA) mal('«--desde» es posterior a «--hasta».');
  if (YA_CARGADO_HASTA && HASTA && YA_CARGADO_HASTA >= HASTA) {
    mal('«--ya-cargado-hasta» alcanza o pasa a «--hasta»: no quedaría ningún día por cargar.');
  }

  const REPO = rutaReal(RAIZ).toLowerCase();
  const RUTA_JSON = opciones.json ?? null;
  if (RUTA_JSON) {
    // ⚠️ Este repositorio es PÚBLICO (`CLAUDE.md §3.1`) y el informe lleva las
    // rutas de la exportación del cliente y el día a día de una línea viva.
    if ((rutaReal(RUTA_JSON).toLowerCase() + sep).startsWith(REPO + sep)) {
      mal(`«${RUTA_JSON}» cae dentro del repositorio, que es público. Escriba el informe fuera `
        + '(la bóveda o la carpeta de los datos).');
    }
    if (existsSync(RUTA_JSON)) mal(`«${RUTA_JSON}» ya existe. No se sobrescribe: use otra ruta.`);
  }

  // ⚠️ EN SECO NO SE PIDE LA LLAVE NI SE MIRA, y `firebase-admin` no se llega a
  // importar: se carga con `await import` dentro del camino de escritura. Una
  // herramienta que exige la llave para enseñar lo que haría es una herramienta
  // que no se puede ensayar — y esto se ensaya antes de tocar un histórico que
  // no se puede borrar.
  const CLAVE = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!SECO && !CLAVE) {
    console.error(`
❌ Falta la credencial de administrador.

   Sin «--seco» esto ESCRIBE en la base de producción, y el histórico de
   cargabilidad no se puede borrar. Hace falta la llave de cuenta de servicio:

      GOOGLE_APPLICATION_CREDENTIALS=~/Downloads/LA-LLAVE.json \\
        node herramientas/cargar-cargabilidad.mjs --linea ${LINEA} --origen ${ORIGEN}

   ⚠️ Esa llave abre el proyecto entero: no se commitea y no se comparte.

   Para ver qué haría sin tocar nada, y sin llave:  --seco
`);
    process.exit(2);
  }
  if (!SECO && !existsSync(CLAVE)) mal(`«${CLAVE}» (GOOGLE_APPLICATION_CREDENTIALS) no existe.`);

  // ── 2 · Leer el origen, como lo leería la pantalla ────────────────────────
  console.log('CARGAR CARGABILIDAD — los días ya procesados, a la base');
  console.log(`   línea: ${LINEA} · organización: ${ORG} · criterio de fase: ${CRITERIO_FASE}`);
  console.log(`   origen: ${ORIGEN}`);
  console.log(`   modo: ${SECO ? '🌵 SECO — no toca la red ni pide credencial' : '✍️  ESCRIBE en la base'}`);

  const archivosCsv = (raiz) => {
    const out = [];
    for (const x of readdirSync(raiz).filter((y) => !y.startsWith('.')).sort()) {
      const p = join(raiz, x);
      if (statSync(p).isDirectory()) out.push(...archivosCsv(p));
      else if (/\.csv$/i.test(x)) out.push(p);
    }
    return out;
  };

  const rutas = archivosCsv(ORIGEN);
  if (!rutas.length) alto(`«${ORIGEN}» no trae ningún .csv.`);

  const entradas = [];
  const deCalidadEnOrigen = [];
  const sinEstadistico = [];
  /** ruta relativa → `{ filas, estadistico }` */
  const porArchivo = new Map();
  let filasLeidas = 0;

  for (const p of rutas) {
    const nombre = basename(p);
    const ruta = relative(ORIGEN, p);
    // El paso 2 ya aparta los `_quality`; si alguno se coló, no es una medida.
    if (esArchivoDeCalidad(nombre)) { deCalidadEnOrigen.push(ruta); continue; }

    const texto = readFileSync(p, 'utf8').replace(/^﻿/, '');
    const matriz = celdasDeCsv(texto, { separador: separadorDe(texto) });
    const filas = Math.max(0, texto.split(/\r?\n/).filter((l) => l.trim() !== '').length - 1);
    filasLeidas += filas;

    // ⚠️ SIN ESTADÍSTICO NO SE CARGA, y saltárselo es lo más caro de todo
    // (`99 §ADR-112`). Una señal sin estadístico entra en TODOS los que se leen,
    // así que llegaría a la base con la identidad del máximo, del mínimo y del
    // instantáneo a la vez — y escribir el promedio con la identidad del máximo
    // lo PISA con una escritura que las reglas consideran legítima. No se
    // recupera de ninguna parte.
    const est = estadisticoDeNombre(nombre).id;
    if (!est) { sinEstadistico.push(ruta); continue; }

    porArchivo.set(ruta, { filas, estadistico: est });
    entradas.push({ nombre: ruta, matriz });
  }

  console.log(`\n${n(rutas.length)} archivo(s) .csv en el origen · ${n(filasLeidas)} fila(s) de señal leídas`);
  if (deCalidadEnOrigen.length) {
    aviso(`${deCalidadEnOrigen.length} archivo(s) de SELLO en el origen: no son medidas y no se cargan `
      + `(${deCalidadEnOrigen.slice(0, 3).join(', ')}${deCalidadEnOrigen.length > 3 ? '…' : ''}).`);
  }
  if (sinEstadistico.length) {
    alto(`${sinEstadistico.length} archivo(s) no dicen en su nombre qué estadístico traen.`,
      'Una señal sin estadístico entra en TODOS los que se leen y acaba escrita con la identidad',
      'de otro — y el histórico no se puede borrar. Renómbrelos o apártelos y vuelva a correr:',
      ...sinEstadistico.slice(0, 10).map((x) => `· «${x}»`),
      sinEstadistico.length > 10 ? `… (+${sinEstadistico.length - 10})` : '');
  }
  if (!entradas.length) alto('no quedó ningún archivo de medidas que cargar.');

  // ⚠️ EL DÍA SALE DEL DATO, no del nombre: 46 de 902 archivos de la exportación
  // real traen el nombre equivocado (`99 §ADR-117/119`). Y el orden de la fecha
  // se mira en la carga ENTERA, antes de agrupar: si un archivo demuestra mes/día
  // y otro se leería día/mes, `unirPorDia` se NIEGA — un día fechado al revés
  // entra en el histórico con la identidad de otro (`99 §ADR-127`).
  let union;
  try {
    union = unirPorDia(entradas);
  } catch (e) {
    alto('no se pudieron unir los archivos por día.', String(e?.message ?? e));
  }
  const porDia = union.porDia.filter((d) => d.fecha);
  const sinFecha = union.porDia.filter((d) => !d.fecha);
  if (sinFecha.length) {
    alto(`${sinFecha.length} grupo(s) de archivos no declaran fecha ni en el dato ni en el nombre.`,
      'Sin fecha no hay identidad de día: no se carga nada.');
  }
  console.log(`   fecha: ${union.ordenDeFecha?.porQue ?? 'sin archivos con eje reconocible'}`);
  console.log(`${n(porDia.length)} día(s) distintos, según lo que declara el DATO`
    + ` (${porDia[0]?.fecha} → ${porDia[porDia.length - 1]?.fecha})`);

  // ⚠️ ¿ALGÚN DÍA TRAE MÁS SEÑALES DE LAS QUE CABEN EN UNA MAGNITUD? Tres son
  // las tres fases; una cuarta es otra bahía o el mismo dato bajado dos veces, y
  // combinarla no da error: da un número que no midió nadie. La pantalla, ante
  // esto, deja TODAS las señales en «no usar» y le pide que elija. Aquí no hay
  // quien elija: se para y se nombra.
  const revision = revisarFasesPorDia(porDia.map((d) => ({
    fecha: d.fecha, matriz: d.union.matriz, estadisticoPorFila: d.union.estadisticoPorFila,
  })));
  if (revision.ambiguo) {
    alto(`${revision.excesos.length} día(s) traen más señales de las que caben en una magnitud.`,
      'Combinarlas daría un número que no midió nadie. Revise esos días en el paso 2:',
      ...revision.excesos.slice(0, 10).map((x) => `· ${x.porQue}`),
      revision.excesos.length > 10 ? `… (+${revision.excesos.length - 10})` : '');
  }

  // ── 3 · Los sellos: qué días se apartan ENTEROS ───────────────────────────
  //
  // ⚠️ LA LECTURA DE SELLOS NO SE REIMPLEMENTA: se le pide a la herramienta que
  // ya existe, `herramientas/sellos-de-calidad.mjs`, corriéndola tal cual y
  // leyendo su informe `--json`. Dos lectores de sello serían dos criterios de
  // «esta hora se midió», y el día que discreparan uno de los dos estaría
  // cargando dato inventado.
  //
  // ⚠️ Su `--json` no se escribe en el repositorio —lleva las etiquetas reales de
  // la bahía— así que va a un temporal del sistema que se borra al terminar.
  console.log('\nSELLOS DE CALIDAD — se le pregunta a «sellos-de-calidad.mjs», no se reimplementa');
  const tmp = mkdtempSync(join(tmpdir(), 'cargabilidad-sellos-'));
  const salidaSellos = join(tmp, 'sellos.json');
  const corrida = spawnSync(process.execPath, [
    join(AQUI, 'sellos-de-calidad.mjs'), ORIGEN,
    ...opciones.sellos.flatMap((s) => ['--sellos', s]), '--json', salidaSellos,
  ], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 });
  let informeSellos = null;
  try { informeSellos = JSON.parse(readFileSync(salidaSellos, 'utf8')); } catch { /* se dice abajo */ }
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* era un temporal */ }

  if (!informeSellos) {
    alto('la lectura de sellos no devolvió informe.', 'Esto es lo que dijo:',
      ...`${corrida.stdout ?? ''}${corrida.stderr ?? ''}`.split('\n').slice(0, 20).map((l) => `│ ${l}`));
  }
  const res = informeSellos.resumen;
  console.log(`   ${n(res.archivosLeidos)} archivo(s) leídos: ${n(res.deValores)} de valores `
    + `y ${n(res.deSello)} de sello`);
  console.log(`   ${n(res.diasConValores)} día(s) con valores · ${n(res.diasConSello)} con sello`
    + ` · hora·señal: ${n(res.horaSenal.actual)} «Actual», ${n(res.horaSenal.noActual)} no «Actual»`);

  if (!res.diasConSello) {
    alto('NINGÚN archivo de sello: ninguna hora se puede dar por medida.',
      'El paso 2 aparta los `_quality`, así que hay que pasar la carpeta del paso 1 (la de la bahía):',
      '   --sellos <carpeta del paso 1>');
  }
  // El informe de sellos sale con 1 cuando está INCOMPLETO —archivos apartados,
  // choques entre dos lecturas de la misma hora, fechas mezcladas—. Un informe
  // incompleto no sirve para decidir qué día se aparta: se para.
  if (corrida.status !== 0 || res.apartados || res.choques) {
    alto('el informe de sellos está incompleto: no se puede decidir qué días se apartan.',
      `apartados: ${res.apartados} · choques: ${res.choques} · salida: ${corrida.status}`,
      'Corra «sellos-de-calidad.mjs» a solas para ver el detalle y arréglelo antes de cargar.');
  }

  /**
   * LOS DÍAS APARTADOS, con su motivo — y el motivo NO lleva la etiqueta.
   *
   * ⚠️ La etiqueta de la señal es la ruta del SCADA del cliente (subestación,
   * nivel de tensión, bahía). El informe de sellos la trae, y está bien que la
   * traiga porque vive fuera del repositorio; pero el motivo que ESTA
   * herramienta imprime y escribe se queda en el sello y las horas, que es lo
   * que hace falta para decidir. Así su salida se puede pegar donde sea sin
   * sacar un nombre de cliente.
   */
  const apartados = new Map();
  for (const b of informeSellos.bloques ?? []) {
    for (const x of b.porDiaYSenal ?? []) {
      if (!apartados.has(x.fecha)) apartados.set(x.fecha, { sellos: new Map(), senales: new Set(), horas: new Set() });
      const a = apartados.get(x.fecha);
      a.sellos.set(x.sello, (a.sellos.get(x.sello) ?? 0) + (x.horas?.length ?? 0));
      a.senales.add(x.etiqueta);
      for (const h of x.horas ?? []) a.horas.add(h);
    }
  }
  /**
   * LO QUE SE SABE DE UN DÍA APARTADO, ordenado y sin nombres de cliente: es la
   * forma que piden tanto la frase como el rastro que se guarda.
   */
  const detalleDe = (f) => {
    const a = apartados.get(f);
    return {
      fecha: f,
      sellos: [...a.sellos].map(([sello, horas]) => ({ sello, horas }))
        .sort((x, y) => y.horas - x.horas || x.sello.localeCompare(y.sello)),
      senales: a.senales.size,
      horas: [...a.horas].sort((x, y) => x - y),
    };
  };
  /**
   * LA FRASE LA COMPONE EL NÚCLEO (`motivoDelApartado`), no esta herramienta:
   * es la que la pantalla enseña y la que se guarda en `detalle`, y dos redactores
   * darían dos explicaciones del mismo hueco.
   */
  const motivoDe = (f) => motivoDelApartado(detalleDe(f));

  const diasApartados = [...apartados.keys()].sort();
  console.log(`\n${diasApartados.length} DÍA(S) APARTADOS — el día entero, no las horas malas:`);
  for (const f of diasApartados) console.log(`   ${f} · ${motivoDe(f)}`);
  if (!diasApartados.length) console.log('   (ninguno: todas las horas con sello dicen «Actual»)');

  const diasSinSello = [...new Set(res.diasSinSello ?? [])].sort();
  if (diasSinSello.length) {
    aviso(`${diasSinSello.length} día(s) se cargan SIN NINGÚN SELLO que los respalde —no son días `
      + 'apartados, porque ninguna de sus horas trae un sello distinto de «Actual», pero tampoco '
      + `están dados por buenos: ${diasSinSello.join(', ')}`);
  }
  if (res.senalDiasSinSello?.length) {
    aviso(`${res.senalDiasSinSello.length} señal·día traen valores sin sello dentro de días que SÍ tienen `
      + 'sello de otras señales. Esas horas se cargan como medida sin respaldo propio.');
  }

  // ── 4 · Qué días entran ───────────────────────────────────────────────────
  const fueraDelPeriodo = porDia.map((d) => d.fecha)
    .filter((f) => (DESDE && f < DESDE) || (HASTA && f > HASTA));
  if (fueraDelPeriodo.length) {
    aviso(`${fueraDelPeriodo.length} día(s) quedan fuera del periodo pedido (${DESDE ?? '—'} → ${HASTA ?? '—'}) `
      + `y NO se cargan: ${fueraDelPeriodo.slice(0, 8).join(', ')}${fueraDelPeriodo.length > 8 ? '…' : ''}`);
  }
  const fuera = new Set(fueraDelPeriodo);

  // ⚠️ LOS DÍAS QUE YA ESTABAN ESCRITOS van en su PROPIO conjunto, no en
  // `fuera`: de ellos esta carga no dice nada, ni en la consola ni en el rastro.
  // Un día que ya cargó la pasada anterior no «quedó fuera del periodo» —el
  // periodo lo incluía y sí entró—, y escribirlo así sería una mentira para
  // siempre en el único papel que existe para auditar.
  const yaEscritos = new Set(YA_CARGADO_HASTA
    ? porDia.map((d) => d.fecha).filter((f) => f <= YA_CARGADO_HASTA && !fuera.has(f))
    : []);
  if (yaEscritos.size) {
    aviso(`${yaEscritos.size} día(s) ya estaban escritos (hasta el ${YA_CARGADO_HASTA}) y se saltan. `
      + 'No se apartan y no van al rastro: no les falta nada.');
  }

  // ⚠️ Un día del origen que cae fuera del grueso del periodo suele ser una
  // exportación traspapelada. No se decide por él —lo que entra es decisión
  // suya—, pero se NOMBRA: cargarlo tampoco se puede deshacer.
  const anios = [...new Set(porDia.map((d) => d.fecha.slice(0, 4)))].sort();
  if (anios.length > 1) {
    aviso(`el origen trae días de ${anios.length} años distintos (${anios.join(', ')}). Si alguno es una `
      + 'exportación traspapelada, acote con «--desde»/«--hasta» ANTES de cargar: lo cargado no se retira.');
  }

  // ── 5 · Armar los lotes, como los armaría la pantalla ─────────────────────
  const diasQueEntran = porDia.filter((d) => !apartados.has(d.fecha)
    && !fuera.has(d.fecha) && !yaEscritos.has(d.fecha));
  const lotes = repartirEnLotes(
    diasQueEntran.map((d) => ({ dia: d, archivos: d.union.deCada.length })),
    { tope: ARCHIVOS_POR_CARGA },
  );

  const ahora = new Date().toISOString();
  const armados = lotes.map((lote, i) => {
    const dias = lote.elementos.map((x) => x.dia);
    const deLaCarga = dias.map((d) => ({
      fecha: d.fecha,
      matriz: d.union.matriz,
      estadisticoPorFila: estadisticoPorFilaCorregido(d.union.senales, {}),
    }));
    const presentes = [...new Set(dias.flatMap((d) => d.union.estadisticos))].filter(Boolean)
      .sort((a, b) => IDS_ESTADISTICO.indexOf(a) - IDS_ESTADISTICO.indexOf(b));

    // ⚠️ SE LEEN TODOS LOS ESTADÍSTICOS, cada uno en SU lectura y en SU
    // documento. Mezclarlos en una sola lectura no da error: da un número que
    // nadie midió (`99 §ADR-112`). Es literalmente lo que hace `guardar()` en la
    // pantalla: mirar es una cosa y guardar es otra.
    const registros = presentes.flatMap((est) => registrosDeVariosDias(deLaCarga, {
      linea: LINEA, circuito: null, asignadoPorEtiqueta: {}, criterioFase: CRITERIO_FASE, estadistico: est,
    }).registros);

    const empaquetado = empaquetarPorDia(registros);
    const archivos = dias.flatMap((d) => d.union.deCada.map((x) => x.nombre));
    const fechas = [...new Set(empaquetado.dias.map((d) => d.fecha))].sort();
    return {
      indice: i + 1,
      dias: empaquetado.dias,
      resumenes: empaquetado.dias.map((d) => resumirDia(d)),
      sinHora: empaquetado.sinHora,
      registros, archivos, presentes, fechas,
      filas: archivos.reduce((k, a) => k + (porArchivo.get(a)?.filas ?? 0), 0),
    };
  });

  const conSinHora = armados.filter((a) => a.sinHora.length);
  if (conSinHora.length) {
    alto(`${conSinHora.reduce((k, a) => k + a.sinHora.length, 0)} lectura(s) se quedaron SIN HORA.`,
      'Un dato diario metido en la hora 0 sería una medida inventada a medianoche. No se carga nada.');
  }

  const totalDias = armados.reduce((k, a) => k + a.dias.length, 0);
  const totalResumenes = armados.reduce((k, a) => k + a.resumenes.length, 0);
  const totalRegistros = armados.reduce((k, a) => k + a.registros.length, 0);
  const totalHoras = armados.reduce(
    (k, a) => k + a.dias.reduce((h, d) => h + Object.keys(d.horas).length, 0), 0);

  // ── 6 · El cuadre de lectura: lo leído contra lo que sale ─────────────────
  const escritoPorPar = new Set(armados.flatMap((a) => a.dias.map((d) => `${d.fecha}|${d.estadistico ?? '—'}`)));
  const diaDelArchivo = new Map();
  for (const d of porDia) for (const c of d.union.deCada) diaDelArchivo.set(c.nombre, d.fecha);

  const cuentaArchivos = { escritos: 0, apartados: 0, fuera: 0, yaEscritos: 0, sinRegistros: [] };
  for (const [ruta, x] of porArchivo) {
    const f = diaDelArchivo.get(ruta) ?? null;
    if (f == null) { cuentaArchivos.sinRegistros.push(`${ruta} · no quedó dentro de ningún día`); continue; }
    if (apartados.has(f)) { cuentaArchivos.apartados += 1; continue; }
    if (fuera.has(f)) { cuentaArchivos.fuera += 1; continue; }
    // Ya escrito por otra pasada: explicado, pero no es ni apartado ni fuera.
    if (yaEscritos.has(f)) { cuentaArchivos.yaEscritos += 1; continue; }
    if (escritoPorPar.has(`${f}|${x.estadistico}`)) { cuentaArchivos.escritos += 1; continue; }
    cuentaArchivos.sinRegistros.push(`${ruta} · ${f} · ${x.estadistico}: no produjo ninguna lectura con número`);
  }
  const explicados = cuentaArchivos.escritos + cuentaArchivos.apartados + cuentaArchivos.fuera
    + cuentaArchivos.yaEscritos + cuentaArchivos.sinRegistros.length;
  const desajustes = cuadre({
    archivos: porArchivo.size, explicados,
    documentos: totalDias, resumenes: totalResumenes,
    lecturas: totalRegistros, horas: totalHoras,
  });

  const fechasEscritas = new Set(armados.flatMap((a) => a.dias.map((d) => d.fecha)));
  const entranSinDocumento = diasQueEntran.map((d) => d.fecha).filter((f) => !fechasEscritas.has(f));

  // ⚠️ LO QUE VA EN EL RASTRO DE CADA CARGA, y se escribe una sola vez en la
  // vida: los días apartados POR UNA REGLA. Los de «--ya-cargado-hasta» NO van —
  // ver `apartadosParaElRastro`— porque ya los escribió otra pasada.
  // ⚠️ Y de un día que YA ESCRIBIÓ otra pasada no se repite el veredicto, aunque
  // sea cierto: su carga ya lo dijo, con su detalle. Es además lo que hace la
  // pantalla, y las dos tienen que escribir lo MISMO o vuelven a ser dos verdades.
  const apartadosDelRastro = apartadosParaElRastro({
    porSello: diasApartados.filter((f) => !yaEscritos.has(f))
      .map((f) => ({ ...detalleDe(f), porQue: motivoDe(f) })),
    fueraDelPeriodo,
    periodo: { desde: DESDE, hasta: HASTA },
    sinLecturas: entranSinDocumento,
  });
  if (apartadosDelRastro.length > DIAS_APARTADOS_POR_CARGA) {
    alto(`${apartadosDelRastro.length} día(s) apartados no caben en el rastro de una carga `
      + `(el molde admite ${DIAS_APARTADOS_POR_CARGA}, los días de un año).`,
      'La lista NO se recorta: recortada dejaría huecos sin explicar, y en silencio, en el único',
      'papel que existe para auditar. Parta la carga por periodo con «--desde»/«--hasta».');
  }

  // ── 7 · La tabla ──────────────────────────────────────────────────────────
  const porEstadistico = new Map();
  for (const a of armados) {
    for (const d of a.dias) {
      const e = d.estadistico ?? '—';
      if (!porEstadistico.has(e)) porEstadistico.set(e, { dias: 0, horas: 0 });
      porEstadistico.get(e).dias += 1;
      porEstadistico.get(e).horas += Object.keys(d.horas).length;
    }
  }
  const apartadosPorEstadistico = new Map();
  for (const d of porDia.filter((x) => apartados.has(x.fecha))) {
    for (const e of d.union.estadisticos.filter(Boolean)) {
      apartadosPorEstadistico.set(e, (apartadosPorEstadistico.get(e) ?? 0) + 1);
    }
  }

  console.log('\nPOR ESTADÍSTICO — qué se escribiría');
  console.log('   estadístico    días que entran   días apartados   documentos   resúmenes     horas');
  const fila = (rot, dias, ap, horas) => console.log(`   ${rot.padEnd(14)} ${String(dias).padStart(15)} `
    + `${String(ap).padStart(16)} ${String(dias).padStart(12)} ${String(dias).padStart(11)} ${String(horas).padStart(9)}`);
  for (const e of IDS_ESTADISTICO) {
    const x = porEstadistico.get(e); const ap = apartadosPorEstadistico.get(e) ?? 0;
    if (!x && !ap) continue;
    fila(e, x?.dias ?? 0, ap, x?.horas ?? 0);
  }
  fila('TOTAL', totalDias, [...apartadosPorEstadistico.values()].reduce((a, b) => a + b, 0), totalHoras);

  console.log(`\n${lotes.length} LOTE(S) de ${ARCHIVOS_POR_CARGA} archivos como mucho `
    + '(es el tope del rastro de procedencia, `CargaDeCargabilidad.archivos`)');
  for (const a of armados) {
    console.log(`   lote ${String(a.indice).padStart(2)}/${lotes.length}: `
      + `${String(a.archivos.length).padStart(3)} archivo(s) · ${String(a.dias.length).padStart(3)} documento(s) `
      + `+ ${String(a.resumenes.length).padStart(3)} resumen(es) · ${a.fechas[0]} → ${a.fechas[a.fechas.length - 1]}`
      + ` · ${a.presentes.join(', ')}`);
  }

  console.log('\nLO LEÍDO CONTRA LO QUE SALE');
  console.log(`   archivos: ${n(porArchivo.size)} = ${n(cuentaArchivos.escritos)} que se escriben`
    + ` + ${n(cuentaArchivos.apartados)} de días apartados`
    + ` + ${n(cuentaArchivos.fuera)} fuera del periodo`
    + ` + ${n(cuentaArchivos.sinRegistros.length)} sin lecturas con número`);
  console.log(`   días:     ${n(porDia.length)} = ${n(fechasEscritas.size)} que se escriben`
    + ` + ${n(diasApartados.length)} apartados + ${n(fuera.size)} fuera del periodo`
    + `${entranSinDocumento.length ? ` + ${entranSinDocumento.length} sin documento` : ''}`);
  console.log(`   lecturas: ${n(totalRegistros)} = ${n(totalHoras)} horas dentro de ${n(totalDias)} documento(s)`);
  for (const x of cuentaArchivos.sinRegistros.slice(0, 10)) console.log(`   · sin lecturas: ${x}`);
  if (cuentaArchivos.sinRegistros.length > 10) {
    console.log(`   … (+${cuentaArchivos.sinRegistros.length - 10})`);
  }
  if (entranSinDocumento.length) {
    aviso(`${entranSinDocumento.length} día(s) entran y no producen documento: `
      + `${entranSinDocumento.slice(0, 8).join(', ')}${entranSinDocumento.length > 8 ? '…' : ''}`);
  }

  console.log('\nEL RASTRO DE CADA CARGA — lo que queda escrito para siempre sobre lo que NO entró');
  const conMotivo = (m) => apartadosDelRastro.filter((a) => a.motivo === m).length;
  console.log(`   ${apartadosDelRastro.length} día(s) apartados por una regla`
    + `: ${conMotivo('sello_no_actual')} por sello`
    + ` + ${conMotivo('fuera_del_periodo')} fuera del periodo`
    + ` + ${conMotivo('sin_lecturas')} sin lecturas con número`
    + ' · la MISMA lista en las ' + `${lotes.length} carga(s), porque lo apartado es de la carpeta`);
  // ⚠️ Lo ya escrito por otra pasada NO va al rastro, y se dice para que no
  // quepa duda: de esos días esta carga calla, que es lo único cierto que puede
  // decir de ellos. Lo demás —lo apartado por una regla— sí queda escrito.
  if (yaEscritos.size) {
    console.log(`   los ${n(yaEscritos.size)} día(s) de «--ya-cargado-hasta» NO van al rastro: ya los `
      + 'escribió otra pasada, así que de ellos esta carga no dice nada. Lo que haya que decir');
    console.log('   lo dijo la carga que los escribió. Quedan dichos aquí y en el informe «--json».');
  }
  if (desajustes.length) alto('EL RECUENTO NO CUADRA. No se carga nada:', ...desajustes.map((d) => `· ${d}`));

  // La huella cubre TODO lo que entró en el lote, en el orden en que entró: la
  // de un archivo suelto sería una procedencia que miente por omisión.
  for (const a of armados) {
    a.huella = await huellaDeArchivo(
      new Uint8Array(Buffer.concat(a.archivos.map((r) => readFileSync(join(ORIGEN, r))))));
  }

  // ── 8 · El informe ────────────────────────────────────────────────────────
  const base = {
    herramienta: 'cargar-cargabilidad',
    formato: 1,
    linea: LINEA, orgId: ORG, criterioFase: CRITERIO_FASE, seco: SECO, reemplazar: REEMPLAZAR,
    origen: ORIGEN, carpetasDeSellos: opciones.sellos,
    versionMotor: VERSION_MOTOR, versionContrato: VERSION_CONTRATO,
    periodo: { desde: DESDE, hasta: HASTA },
    leido: { archivos: porArchivo.size, filas: filasLeidas, dias: porDia.length, ordenDeFecha: union.ordenDeFecha ?? null },
    apartados: diasApartados.map((f) => ({ fecha: f, porQue: motivoDe(f) })),
    /** Lo que se escribe en el rastro de CADA carga, tal cual va a la base. */
    apartadosDelRastro,
    /** Días que entran y no dejan documento: van al rastro como `sin_lecturas`. */
    sinLecturas: entranSinDocumento,
    diasSinSello,
    fueraDelPeriodo,
    porEstadistico: Object.fromEntries([...porEstadistico].map(([e, x]) => [e, {
      ...x, apartados: apartadosPorEstadistico.get(e) ?? 0,
    }])),
    lotes: armados.map((a) => ({
      lote: a.indice, archivos: a.archivos.length, documentos: a.dias.length, resumenes: a.resumenes.length,
      desde: a.fechas[0], hasta: a.fechas[a.fechas.length - 1], estadisticos: a.presentes, huella: a.huella,
      dias: a.dias.map((d) => ({
        fecha: d.fecha, estadistico: d.estadistico, horas: Object.keys(d.horas).length,
        id: idDelDia(ORG, String(d.linea), d.circuito, String(d.fecha), d.estadistico),
      })),
    })),
    cuadre: { archivos: cuentaArchivos, dias: fechasEscritas.size, lecturas: totalRegistros, horas: totalHoras },
    avisos,
  };
  const informe = (extra = {}) => {
    if (!RUTA_JSON) return;
    mkdirSync(dirname(RUTA_JSON), { recursive: true });
    writeFileSync(RUTA_JSON, `${JSON.stringify({ ...base, ...extra }, null, 2)}\n`, { flag: 'wx' });
    console.log(`\nInforme escrito en «${RUTA_JSON}».`);
  };

  const ctx = {
    org: ORG, uid: UID, ahora, linea: LINEA, totalLotes: lotes.length, apartados: apartadosDelRastro,
  };
  const contarMolde = () => console.log(`\nMOLDE: ${n(totalDias + totalResumenes + lotes.length)} documento(s) `
    + `validados contra «contratos/src/cargabilidad.ts» ${VERSION_CONTRATO}`);

  // ── 9 · Modo seco: se enseña todo y no se toca nada ───────────────────────
  if (SECO) {
    // Sin base no hay partida de nacimiento que respetar: se valida con la de un
    // documento que nace hoy, que es la más exigente de las dos (`revision: 0`).
    const malos = armados.flatMap((a) => validarDocumentos(armarDocumentos(a, ctx)).malos);
    contarMolde();
    if (malos.length) {
      informe({ moldeRechaza: malos });
      alto(`${malos.length} documento(s) NO pasan su molde. No se cargaría nada:`,
        ...malos.slice(0, 10).map((m) => `· ${m}`),
        malos.length > 10 ? `… (+${malos.length - 10})` : '');
    }
    console.log('   ✅ todos pasan');
    console.log('\n🌵 MODO SECO: no se ha tocado la red, no se ha pedido credencial y no se ha escrito nada.');
    console.log('   Lo que YA esté guardado en la base no se puede saber sin conectarse: la comparación');
    console.log('   con lo escrito y la regla de «no pisar lo distinto» se hacen en la pasada de verdad.');
    informe();
    return 0;
  }

  // ── 10 · Escribir ─────────────────────────────────────────────────────────
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  initializeApp({ credential: cert(JSON.parse(readFileSync(CLAVE, 'utf-8'))) });
  const db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });

  /** Lee muchos documentos sin pedirlos de uno en uno. */
  const traer = async (refs) => {
    const out = new Map();
    for (let i = 0; i < refs.length; i += LECTURAS_POR_TANDA) {
      const tanda = refs.slice(i, i + LECTURAS_POR_TANDA);
      const leidos = await db.getAll(...tanda.map((r) => r.ref));
      leidos.forEach((d, k) => { if (d.exists) out.set(tanda[k].clave, d.data()); });
    }
    return out;
  };

  // ⚠️ LA ÚLTIMA PUERTA: la línea tiene que existir en el parque. La pantalla lo
  // comprueba y aquí con más motivo —no hay lista de la que elegir, el código
  // llega escrito en la orden—. Un código que no existe deja días escritos que
  // NINGUNA pantalla abre, y que no se pueden borrar.
  const parque = await db.collection('lineas').where('orgId', '==', ORG).limit(200).get();
  const codigos = parque.docs.map((d) => String(d.data()?.codigo ?? '')).filter(Boolean);
  const canonico = codigos.find((c) => c.trim().toLowerCase() === LINEA.toLowerCase());
  if (!canonico) {
    alto(`«${LINEA}» no es una línea del parque de «${ORG}».`,
      `El parque tiene: ${codigos.join(', ') || '(ninguna)'}`,
      'Dese antes de alta la línea: el histórico no se puede borrar, y guardarlo con un código que',
      'no existe deja días que ninguna pantalla abre.');
  }
  if (canonico !== LINEA) {
    // ⚠️ El `id` del día colapsa mayúsculas y espacios, pero el campo `linea` se
    // guarda TAL CUAL y las consultas son literales: dos grafías escriben el
    // mismo documento y luego una consulta no encuentra lo que la otra dejó.
    alto(`«${LINEA}» se escribe «${canonico}» en el parque.`,
      'Dos grafías escriben el mismo documento y luego una consulta por la otra no lo encuentra:',
      'el histórico se parte en dos sin un solo error por ningún lado. Use la grafía del parque.');
  }

  const refs = [
    ...armados.flatMap((a) => a.dias.map((d) => idDelDia(ORG, String(d.linea), d.circuito, String(d.fecha), d.estadistico))
      .map((id) => ({ clave: `${COLECCIONES_CARGABILIDAD.dias}/${id}`, ref: db.collection(COLECCIONES_CARGABILIDAD.dias).doc(id) }))),
    ...armados.flatMap((a) => a.resumenes.map((r) => idDelResumen(ORG, String(r.linea), String(r.fecha), r.estadistico))
      .map((id) => ({ clave: `${COLECCIONES_CARGABILIDAD.resumenes}/${id}`, ref: db.collection(COLECCIONES_CARGABILIDAD.resumenes).doc(id) }))),
  ];
  console.log(`\nLEYENDO lo que ya hay: ${n(refs.length)} documento(s)…`);
  const previos = await traer(refs);
  console.log(`   ${n(previos.size)} ya estaban guardados · ${n(refs.length - previos.size)} nacen ahora`);

  // ⚠️ SE VALIDA TODO, DE TODOS LOS LOTES, ANTES DE ESCRIBIR EL PRIMERO. La
  // regla mínima es «si uno no pasa, no se manda ninguno de ESE lote»; aquí se
  // aplica más fuerte a propósito: si un documento de cualquier lote no pasa, no
  // se manda NINGUNO. Escribir ocho lotes y morir en el noveno deja un histórico
  // a medias que no se puede retirar, y habría que adivinar dónde se cortó.
  const validados = [];
  const malos = [];
  for (const a of armados) {
    const { malos: m, salida } = validarDocumentos(armarDocumentos(a, { ...ctx, previos }));
    malos.push(...m);
    validados.push(salida);
  }
  contarMolde();
  if (malos.length) {
    informe({ moldeRechaza: malos });
    alto(`${malos.length} documento(s) NO pasan su molde. No se ha mandado NINGUNO —ni de su lote`,
      'ni de los demás: un histórico escrito a medias no se puede retirar. Lo que falla:',
      ...malos.slice(0, 10).map((m) => `· ${m}`),
      malos.length > 10 ? `… (+${malos.length - 10})` : '');
  }
  console.log('   ✅ todos pasan');

  // ── 11 · Idempotencia ─────────────────────────────────────────────────────
  const decision = decidirEscritura(validados.flatMap((v) => [...v.dias, ...v.resumenes]), previos);
  console.log(`\nIDEMPOTENCIA: ${n(decision.nuevos.length)} nace(n) · ${n(decision.identicos.length)} ya `
    + `está(n) igual y NO se reescribe(n) · ${n(decision.distintos.length)} está(n) guardado(s) y DISTINTO(S)`);
  if (decision.otroMotor.length) {
    console.log(`   ${n(decision.otroMotor.length)} de los idénticos se escribieron con otro motor `
      + `(hoy ${VERSION_MOTOR}). Mismas cifras, otro sello: no se reescriben, se dicen.`);
  }
  if (decision.distintos.length && !REEMPLAZAR) {
    for (const x of decision.distintos.slice(0, 15)) console.log(`   · ${x.coleccion}/${x.id}`);
    if (decision.distintos.length > 15) console.log(`   … (+${decision.distintos.length - 15})`);
    informe({ distintos: decision.distintos.map((x) => `${x.coleccion}/${x.id}`) });
    alto(`${decision.distintos.length} documento(s) ya guardados dicen otra cosa que estos archivos.`,
      'No se pisan: corregir el histórico es una decisión suya, no un efecto de volver a correr esto.',
      'Si de verdad quiere que lo de hoy reemplace lo guardado, vuelva a correr con «--reemplazar».');
  }

  const aEscribir = new Set([
    ...decision.nuevos,
    ...(REEMPLAZAR ? decision.distintos.map((d) => ({ coleccion: d.coleccion, id: d.id, doc: d.doc })) : []),
  ].map((x) => `${x.coleccion}/${x.id}`));

  if (!aEscribir.size) {
    console.log('\n✅ No hay nada que escribir: todo lo que traen estos archivos ya está guardado e igual.');
    informe({ escrito: { dias: 0, resumenes: 0, cargas: 0, yaEstaban: decision.identicos.length } });
    return 0;
  }

  // ⚠️ El rastro (`cargas`) se escribe PRIMERO y a propósito, igual que en la
  // pantalla: si algo falla a mitad, queda constancia de que se intentó y con qué
  // archivos; al revés habría días guardados sin poder decir de dónde salieron —
  // y ésa es justo la pregunta que este módulo existe para poder responder.
  const conEscritura = validados
    .map((v) => ({ v, suyos: [...v.dias, ...v.resumenes].filter((x) => aEscribir.has(`${x.coleccion}/${x.id}`)) }))
    .filter((x) => x.suyos.length);
  console.log(`\nESCRIBIENDO ${n(aEscribir.size)} documento(s) + ${n(conEscritura.length)} rastro(s) de carga…`);
  const escritos = [];
  for (const { v, suyos } of conEscritura) {
    await db.collection(v.carga.coleccion).doc(v.carga.id).set(v.carga.doc);
    for (let i = 0; i < suyos.length; i += ESCRITURAS_POR_LOTE) {
      const tanda = suyos.slice(i, i + ESCRITURAS_POR_LOTE);
      const lote = db.batch();
      for (const x of tanda) lote.set(db.collection(x.coleccion).doc(x.id), x.doc);
      await lote.commit();
      escritos.push(...tanda);
    }
    console.log(`   ${v.carga.doc.nombreArchivo}: ${n(suyos.length)} documento(s)`);
  }

  // ── 12 · Releer y comparar ────────────────────────────────────────────────
  //
  // ⚠️ ESTO NO ES CELO. Un guardado parcial no da error en ninguna capa: el lote
  // se confirma, la pantalla dice «listo» y faltan ochenta días. La única forma
  // de saber que está es volver a leerlo.
  console.log(`\nRELEYENDO lo escrito: ${n(escritos.length)} documento(s)…`);
  const releidos = await traer(escritos.map((x) => ({
    clave: `${x.coleccion}/${x.id}`, ref: db.collection(x.coleccion).doc(x.id),
  })));

  const faltan = []; const discrepan = [];
  for (const x of escritos) {
    const leido = releidos.get(`${x.coleccion}/${x.id}`);
    if (!leido) faltan.push(`${x.coleccion}/${x.id}`);
    else if (!mismoContenido(x.doc, leido)) discrepan.push(`${x.coleccion}/${x.id}`);
  }

  const escritoDias = escritos.filter((x) => x.coleccion === COLECCIONES_CARGABILIDAD.dias).length;
  const escritoResumenes = escritos.filter((x) => x.coleccion === COLECCIONES_CARGABILIDAD.resumenes).length;
  console.log(`   ${n(releidos.size)} de ${n(escritos.length)} están en la base`
    + ` · ${n(discrepan.length)} no dicen lo que se mandó`);

  informe({
    escrito: {
      dias: escritoDias, resumenes: escritoResumenes, cargas: conEscritura.length,
      yaEstaban: decision.identicos.length, reemplazados: REEMPLAZAR ? decision.distintos.length : 0,
    },
    relectura: { leidos: releidos.size, faltan, discrepan },
  });

  if (faltan.length || discrepan.length) {
    console.log('\n❌ LA RELECTURA NO CUADRA.');
    for (const f of faltan.slice(0, 10)) console.log(`   falta:     ${f}`);
    for (const d of discrepan.slice(0, 10)) console.log(`   discrepa:  ${d}`);
    console.log('   Vuelva a correr la herramienta: lo que ya esté bien no se reescribe.');
    return 1;
  }

  console.log(`\n✅ CUADRA: ${n(escritoDias)} día(s) y ${n(escritoResumenes)} resumen(es) escritos y releídos `
    + `iguales · ${n(decision.identicos.length)} ya estaban igual · ${n(diasApartados.length)} día(s) apartados `
    + 'sin cargar.');
  console.log(`   ${n(apartadosDelRastro.length)} día(s) quedan explicados dentro de cada rastro de carga: `
    + 'por qué no entraron se puede responder desde la base, sin volver a los CSV.');
  console.log('   Lo apartado se puede sumar después; lo cargado no se puede retirar.');
  return 0;
}

// ⚠️ SOLO CORRE SI SE EJECUTA A MANO. Al importarlo —la prueba lo hace, para
// llamar a las piezas puras sin red ni llave— no se lee ninguna carpeta, no se
// mira `process.argv` y no se sale con ningún código.
const ESTE = fileURLToPath(import.meta.url);
if (process.argv[1] && rutaReal(process.argv[1]) === rutaReal(ESTE)) {
  process.exit(await principal(process.argv.slice(2)));
}
