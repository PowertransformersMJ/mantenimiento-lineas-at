// ============================================================================
// componentes/AltaDeLinea.tsx — dar de alta una línea y guardar lo que trajo el
// GPS, SIN convertirlo en torres (maqueta M1, aprobada el 17-09-2026)
// ----------------------------------------------------------------------------
// QUÉ ESCRIBE ESTA PANTALLA, y no escribe nada más: **un documento de línea** y,
// si se aporta el archivo del GPS, **un documento de levantamiento**. Ni una
// torre, ni un conductor, ni una hipótesis. Esa es la orden del Ingeniero del
// 16-09-2026: las líneas entran hoy al parque; las torres se registran cuando él
// declare la función de cada una, y el conductor y las hipótesis los entrega
// después. **No se copia nada de otra línea, ni siquiera para que las pestañas
// «se vean bien».**
//
// ── LAS CINCO REGLAS QUE GOBIERNAN ESTE ARCHIVO ────────────────────────────
//
//   1. **Nada se escribe hasta que él pulsa.** Elegir el archivo, leerlo, ver
//      los vanos y la tabla entera no manda ni un byte a la base. El archivo se
//      lee en su computador y no sube a ningún sitio: lo que viaja son los
//      documentos que él aprueba.
//   2. **El código NO se teclea: se elige de la lista del libro**
//      (`herramientas/codigos-emitidos.json`). De ese código nace el
//      identificador permanente de la línea, y una línea no se borra: «LN-628»
//      con un cero de más sería una línea nueva en el parque para siempre.
//   3. **Antes de escribir, se pregunta si ya está.** Lo hacen las dos
//      escrituras del repositorio con un `getDoc` sobre el MISMO identificador,
//      y hace falta: las reglas dejan ACTUALIZAR una línea (o sea, pisarla) y
//      **deniegan** reescribir un levantamiento con un mensaje ilegible —
//      «Missing or insufficient permissions» donde la verdad es «este recorrido
//      ya estaba cargado» (`35 · L-24`).
//   4. **El acuse CUENTA, no afirma.** Después de escribir se vuelve a leer de
//      la base, documento a documento y punto a punto, y se enseña lo escrito
//      contra lo esperado. Escribir menos de lo enseñado no da error en ninguna
//      capa (`35 · L-79`); el único que puede cazarlo es el conteo.
//   5. **Nada viene elegido.** Ni el código, ni el origen de la tensión, ni el
//      tramo. Sobre algo que no se puede deshacer, una casilla ya marcada se
//      confirma en vez de decidirse.
//
// ── LO QUE ESTA PANTALLA NO HACE, A PROPÓSITO ──────────────────────────────
// No estrena identidad, no deduce la función de ninguna estructura y no le pone
// nombre de sistema a ningún punto del GPS. El molde del levantamiento prohíbe
// esos seis campos con nombre y apellido (`contratos/src/levantamiento.ts`), y
// aquí ni siquiera se enseñan: los nombres de las futuras torres se emiten en el
// libro del repositorio el día que él declare qué es cada una, no antes.
//
// ── DÓNDE VIVE CADA PIEZA ──────────────────────────────────────────────────
// Lo que DECIDE es puro y está arriba del archivo, fuera del componente, para
// que se pueda probar con `node --test` sin montar un navegador
// (`tests/alta-de-linea.test.js`): qué códigos se pueden ofrecer, cómo se lee el
// recorrido y qué documentos se arman. Lo de abajo solo pinta y pregunta.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import type { Levantamiento as TLevantamiento, Linea as TLinea } from '@lineas/contratos';
import { Levantamiento, Linea, Procedencia } from '@lineas/contratos';
import {
  codigosDelLibro, filaDelLibro, huellaDeArchivo, idDeLevantamiento, idDelLibro, tipoDeSerie,
} from '@lineas/importar/identidad';
import { puntosDesdeGpx } from '@lineas/importar/levantamientoDesdeGpx';
import { PRECISION_GPS_MANO_M } from '@lineas/importar/punto';
import { estadisticasVanos } from '@lineas/nucleo/estadisticas';
import {
  deflexion, margenDeAzimut, margenDeDeflexion, vanosConPintaDeTorreSinLevantar, vincenty,
} from '@lineas/nucleo/geodesia';
import { horaLocalBogota } from '@lineas/exportar/levantamiento';
import { almacen } from '../datos/enlace';
import { puede, type SesionDePantalla } from '../datos/permisos';
import { LIBRO_DE_CODIGOS_CRUDO } from '../datos/registroCodigos';
import { repositorio } from '../datos/repositorio';
import type { AcuseDeLevantamiento, AcuseDeLineaNueva } from '../datos/repositorio';
import { comoSeEntendio, numeroTecleado, selloDeOrigen } from '../vistas/fichaEstructural';
import { nf } from '../vistas/formato';

// ════════════════════════════════════════════════════════════════════════════
// 1 · QUÉ CÓDIGOS SE PUEDEN OFRECER — el libro manda, la pantalla solo elige
// ════════════════════════════════════════════════════════════════════════════

/** Una fila del libro ya resuelta, lista para un desplegable. */
export interface CodigoOfrecible {
  codigo: string;
  /** El identificador permanente, tal y como se emitió. Nunca se recalcula aquí. */
  id: string;
  /** `true` = esa línea ya está en el parque, así que no se ofrece para alta. */
  yaEstaEnElParque: boolean;
}

/**
 * LO QUE EL LIBRO PERMITE ELEGIR HOY, separado por clase de serie.
 *
 * ⚠️ NO REINTERPRETA EL LIBRO. Quién es una fila válida y qué identificador
 * tiene lo dicen `codigosDelLibro`, `filaDelLibro` e `idDelLibro`
 * (`@lineas/importar/identidad`), que ya son los dueños de esa lectura. Aquí
 * solo se reparte en dos listas y se cruza con el parque.
 *
 * LA CLASE DE SERIE SE SACA DEL PREFIJO, no del campo `tipo` de la fila, y
 * además se comprueba que los dos digan lo mismo. Son dos fuentes de la misma
 * verdad y **tienen que coincidir**: una fila que se declare «tramo» con un
 * código `LN-` está rota, y ofrecerla como una cosa o como la otra escribiría un
 * documento permanente en el sitio equivocado. Una fila así no se ofrece y se
 * dice por qué, que es ruidoso a propósito.
 */
export function codigosDisponibles(
  libro: unknown,
  parque: { codigo?: string }[] | undefined,
): { lineas: CodigoOfrecible[]; tramos: CodigoOfrecible[]; ilegibles: { codigo: string; motivo: string }[] } {
  const enElParque = new Set((parque ?? []).map((l) => String(l?.codigo ?? '')));
  const lineas: CodigoOfrecible[] = [];
  const tramos: CodigoOfrecible[] = [];
  const ilegibles: { codigo: string; motivo: string }[] = [];

  for (const codigo of codigosDelLibro(libro as object) as string[]) {
    let id: string;
    let clase: string;
    try {
      id = idDelLibro(libro, codigo) as string;
      clase = tipoDeSerie(codigo) as string;
    } catch (e) {
      ilegibles.push({ codigo, motivo: e instanceof Error ? e.message : 'fila ilegible' });
      continue;
    }

    const fila = filaDelLibro(libro as object, codigo) as { tipo?: string } | undefined;
    if (fila?.tipo && fila.tipo !== clase) {
      ilegibles.push({
        codigo,
        motivo: `el libro dice que «${codigo}» es de clase «${fila.tipo}» y su prefijo dice que es `
          + `«${clase}». No se ofrece: darlo de alta escribiría un documento permanente en el sitio `
          + 'equivocado. Hay que arreglar la fila en el repositorio.',
      });
      continue;
    }

    const fila2: CodigoOfrecible = { codigo, id, yaEstaEnElParque: enElParque.has(codigo) };
    if (clase === 'tramo') tramos.push(fila2);
    else lineas.push(fila2);
  }

  return { lineas, tramos, ilegibles };
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · LO QUE SE PUEDE LEER DEL RECORRIDO, y con cuánto margen
// ════════════════════════════════════════════════════════════════════════════

/** Un punto del levantamiento, en lo mínimo que hace falta para medirlo. */
export interface PuntoDeLectura { lat: number; lon: number }

/** Lo que se sabe de cada punto del recorrido. Nada de esto se GUARDA. */
export interface FilaDeRecorrido {
  /** Posición en el archivo, empezando en 0. */
  i: number;
  /** El vano que llega a este punto desde el anterior. `null` en el primero. */
  vanoEntra_m: number | null;
  /** El vano que sale hacia el siguiente. `null` en el último. */
  vanoSale_m: number | null;
  /** El quiebre medido sobre las coordenadas. `null` en los dos extremos. */
  quiebre_grados: number | null;
  /** Hasta cuánto puede moverse ese quiebre. `determinado:false` = no se sabe. */
  margen: ReturnType<typeof margenDeDeflexion> | null;
  /** Si la DIRECCIÓN del vano que entra se puede saber con esta precisión. */
  direccionEntra: ReturnType<typeof margenDeAzimut> | null;
  /** El vano que entra mide bastante más que la mediana: puede faltar una torre. */
  sospechoso: boolean;
  /** Cuántas veces la mediana mide el vano que entra. */
  vecesLaMediana: number | null;
}

/**
 * LO QUE EL RECORRIDO DICE DE SÍ MISMO, antes de guardarlo.
 *
 * Todas las cifras salen del núcleo, que es su dueño: los vanos de `vincenty`,
 * el quiebre de `deflexion`, los márgenes de `margenDeAzimut` /
 * `margenDeDeflexion` y los vanos con pinta de torre sin levantar de
 * `vanosConPintaDeTorreSinLevantar`. Aquí no se calcula ingeniería; aquí se pide
 * y se ordena para que la pantalla lo pueda enseñar (`99 §ADR-013`: la deflexión
 * tiene un solo dueño).
 *
 * ⚠️ ESTO NO SE ESCRIBE EN NINGÚN SITIO. El levantamiento guarda el punto tal
 * como lo grabó el aparato y nada más; el vano, el quiebre y el margen se
 * vuelven a calcular cada vez que hagan falta. Guardarlos sería congelar una
 * interpretación dentro de un documento que respalda un papel firmado.
 *
 * @param puntos       los puntos, en el orden del archivo
 * @param precision_m  el ± del levantamiento, en metros
 */
export function lecturaDelRecorrido(puntos: PuntoDeLectura[], precision_m: number): {
  vanos_m: number[];
  filas: FilaDeRecorrido[];
  mediana_m: number | null;
  umbral: number;
  longitudLevantada_m: number | null;
  enRecta_m: number | null;
  minimo_m: number | null;
  indiceMinimo: number | null;
  maximo_m: number | null;
  indiceMaximo: number | null;
  sospechosos: number[];
  indeterminados: number[];
} {
  const geo = (puntos ?? []).map((p) => ({ lat: p.lat, lon: p.lon }));
  const vanos_m = geo.slice(1).map((p, i) => vincenty(geo[i].lat, geo[i].lon, p.lat, p.lon).d as number);

  const pinta = vanosConPintaDeTorreSinLevantar(vanos_m);
  const estadistica = estadisticasVanos(vanos_m) as
    { suma: number; minimo: number; maximo: number } | null;

  const filas: FilaDeRecorrido[] = geo.map((_, i) => {
    const vanoEntra_m = i > 0 ? vanos_m[i - 1] : null;
    const vanoSale_m = i < vanos_m.length ? vanos_m[i] : null;
    const esInterior = i > 0 && i < geo.length - 1;
    return {
      i,
      vanoEntra_m,
      vanoSale_m,
      quiebre_grados: esInterior ? (deflexion(geo, i) as number | null) : null,
      // En un punto interior los dos vanos existen por construcción; el molde de
      // tipos no puede saberlo y por eso se afirma aquí, dentro del `esInterior`.
      margen: esInterior
        ? margenDeDeflexion(vanoEntra_m as number, vanoSale_m as number, precision_m)
        : null,
      direccionEntra: vanoEntra_m === null ? null : margenDeAzimut(vanoEntra_m, precision_m),
      sospechoso: i > 0 ? Boolean(pinta.vanos[i - 1]?.sospechoso) : false,
      vecesLaMediana: i > 0 ? (pinta.vanos[i - 1]?.vecesLaMediana ?? null) : null,
    };
  });

  // El ÍNDICE del vano más corto y el del más largo se buscan en la lista que
  // entró, no se leen de la estadística: `estadisticasVanos` descarta los vanos
  // que no son positivos antes de contar, así que sus índices son los de la
  // lista ya filtrada y señalarían al vano equivocado en cuanto un punto
  // estuviera repetido.
  const indiceDe = (v: number | null) => (v === null ? null : (vanos_m.indexOf(v) >= 0 ? vanos_m.indexOf(v) : null));

  return {
    vanos_m,
    filas,
    mediana_m: pinta.mediana_m ?? null,
    umbral: pinta.umbral,
    longitudLevantada_m: estadistica ? estadistica.suma : null,
    enRecta_m: geo.length > 1
      ? (vincenty(geo[0].lat, geo[0].lon, geo[geo.length - 1].lat, geo[geo.length - 1].lon).d as number)
      : null,
    minimo_m: estadistica ? estadistica.minimo : null,
    indiceMinimo: estadistica ? indiceDe(estadistica.minimo) : null,
    maximo_m: estadistica ? estadistica.maximo : null,
    indiceMaximo: estadistica ? indiceDe(estadistica.maximo) : null,
    sospechosos: filas.filter((f) => f.sospechoso).map((f) => f.i),
    indeterminados: filas.filter((f) => f.direccionEntra && !f.direccionEntra.determinado).map((f) => f.i),
  };
}

/**
 * LAS PLACAS QUE LA NUMERACIÓN SALTA, leídas de los nombres del aparato.
 *
 * Es LECTURA, no deducción: si la cuadrilla grabó «618 E23» y después «618 E25»,
 * el 24 no está en el archivo y eso es un hecho del archivo, no una opinión. Se
 * enseña junto al vano largo que lo acompaña: las dos señales juntas son lo que
 * hace fuerte el aviso (`nucleo/geodesia.js §UMBRAL_TORRE_SIN_LEVANTAR…`).
 *
 * ⚠️ LO QUE ESTA FUNCIÓN NO DICE, Y ES LA MITAD IMPORTANTE. No dice cuántas
 * placas hay ANTES de la primera levantada ni DESPUÉS de la última. Que la
 * primera se llame «E07» no significa que existan E01 a E06: significa que el
 * recorrido empieza ahí. Suponer que la numeración arranca en 1 sería inventar
 * seis torres, así que se devuelve el extremo (`desde`) y se dice en pantalla
 * que fuera de lo levantado no se sabe nada.
 *
 * Tampoco se guarda en ninguna parte: es una ayuda para mirar el archivo antes
 * de darlo por bueno.
 */
export function placasQueFaltan(nombres: (string | null | undefined)[]): {
  desde: number | null;
  hasta: number | null;
  huecos: number[];
  repetidas: number[];
  sinNumero: string[];
} {
  const numeros: number[] = [];
  const sinNumero: string[] = [];

  for (const crudo of nombres ?? []) {
    const nombre = String(crudo ?? '').trim();
    // Los dígitos finales PRECEDIDOS DE UNA LETRA: «618 E07» → 7. Se exige la
    // letra a propósito — sin ella, un nombre que fuera solo el rótulo del tramo
    // («618») se leería como la placa número 618 y descuadraría la cuenta entera.
    const m = /([A-Za-zÁÉÍÓÚÑáéíóúñ])0*(\d+)\s*$/.exec(nombre);
    if (!m) { sinNumero.push(nombre); continue; }
    numeros.push(Number(m[2]));
  }

  if (!numeros.length) return { desde: null, hasta: null, huecos: [], repetidas: [], sinNumero };

  const vistos = new Set<number>();
  const repetidas: number[] = [];
  for (const n of numeros) {
    if (vistos.has(n) && !repetidas.includes(n)) repetidas.push(n);
    vistos.add(n);
  }

  const desde = Math.min(...numeros);
  const hasta = Math.max(...numeros);
  const huecos: number[] = [];
  for (let n = desde + 1; n < hasta; n += 1) if (!vistos.has(n)) huecos.push(n);

  return { desde, hasta, huecos, repetidas, sinNumero };
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · LOS DOCUMENTOS QUE SE VAN A ESCRIBIR — armados aquí, enseñados antes
// ════════════════════════════════════════════════════════════════════════════

/** Un punto listo para guardar: lo que el aparato grabó, más la nota de campo. */
export interface PuntoParaGuardar {
  nombreCampo: string;
  lat: number;
  lon: number;
  ele?: number;
  instante?: string;
  /** Lo que él anotó de ESE punto. Después del alta ya no se puede escribir. */
  nota?: string;
}

/** Todo lo que el Ingeniero ha decidido en la pantalla, ya resuelto. */
export interface PlanDeAlta {
  linea: {
    codigo: string;
    id: string;
    nombre: string;
    tensionNominal_kV: number;
    /** De dónde sale esa tensión, y la línea que otro pueda ir a comprobar. */
    origenTension: string;
    fuenteTension: string;
    circuitos: number;
    /** El tramo compartido que recorre, con el origen de esa declaración. */
    tramo: { id: string; codigo: string; procedencia: string; fuente: string } | null;
    /** `true`/`false` declarado, o `null` = no consta (el campo no se escribe). */
    recorridoCompleto: boolean | null;
  };
  /** Lo leído del GPS, o `null` si en este alta no se guarda ningún recorrido. */
  levantamiento: {
    id: string;
    serieId: string;
    codigoSerie: string;
    fecha: string;
    aparato: string | null;
    archivo: { nombre: string; huella: string };
    puntos: PuntoParaGuardar[];
    nota: string;
  } | null;
  /** Quién firma y cuándo. Sale de la SESIÓN, nunca de una casilla. */
  quien: { uid: string; orgId: string; ahora: string };
}

/**
 * ARMA LOS DOCUMENTOS, exactamente los que se van a escribir.
 *
 * Es PURA y no valida nada contra el molde: quien valida es la capa de datos,
 * justo antes de mandar, y el molde es el único dueño de esa decisión (dos
 * listas de reglas acaban diciendo cosas distintas, `33 · L-19`). Lo que esta
 * función garantiza es lo otro: que lo que se ENSEÑA en la pantalla y lo que se
 * MANDA sean el mismo objeto, no dos construcciones parecidas.
 *
 * ⚠️ NINGUNA CLAVE CON VALOR `undefined`. El SDK de la base lanza si encuentra
 * una dentro de lo que se manda, y en una escritura eso es la diferencia entre
 * guardar la jornada y perderla. Lo que no hay, no se pone.
 *
 * ⚠️ `orgId`, `creadoPor` y las firmas de los tramos se vuelven a sellar en la
 * capa de datos con la sesión abierta, y es a propósito: aquí se arman para que
 * él VEA lo que se va a escribir; allí se sellan para que la base no tenga que
 * creerse a una pantalla. Los dos valores coinciden porque los dos salen de la
 * misma sesión.
 */
export function documentosDelAlta(plan: PlanDeAlta): {
  linea: Record<string, unknown>;
  levantamiento: Record<string, unknown> | null;
} {
  const { linea: L, levantamiento: R, quien } = plan;

  const linea: Record<string, unknown> = {
    id: L.id,
    orgId: quien.orgId,
    creadoEn: quien.ahora,
    creadoPor: quien.uid,
    revision: 0,
    tipo: 'linea',
    codigo: L.codigo,
    nombre: L.nombre,
    tensionNominal_kV: L.tensionNominal_kV,
    circuitos: L.circuitos,
    activa: true,
  };

  // DE DÓNDE SALE LA TENSIÓN, guardada con el número (contrato 0.17.0). Hasta el
  // 20-09 esta pantalla la pedía y la tiraba: el Ingeniero la escribía, pulsaba,
  // y el dato se quedaba aquí. Un número sin procedencia es una opinión.
  if (L.origenTension && L.fuenteTension) {
    linea.procedenciaTension = {
      procedencia: L.origenTension,
      fuente: L.fuenteTension,
      declaradoEn: quien.ahora,
      declaradoPor: quien.uid,
    };
  }

  if (L.tramo) {
    // UNA sola entrada, y abierta: la línea recorre el tramo ENTERO. No se
    // acotan `desdeApoyoId` ni `hastaApoyoId` porque acotar exige los
    // identificadores de dos TORRES, y todavía no hay ninguna registrada.
    // Inventarlos sería escribir para siempre un recorte que nadie decidió.
    linea.tramosCompartidos = [{
      id: L.tramo.id,
      codigo: L.tramo.codigo,
      procedencia: L.tramo.procedencia,
      fuente: L.tramo.fuente,
      declaradoEn: quien.ahora,
      declaradoPor: quien.uid,
    }];
  }

  // Tres estados, y el tercero se escribe NO PONIENDO el campo: ausente
  // significa «no consta», que no es lo mismo que «no» (`contratos/src/activos.ts`).
  if (L.recorridoCompleto === true || L.recorridoCompleto === false) {
    linea.recorridoCompleto = L.recorridoCompleto;
  }

  if (!R) return { linea, levantamiento: null };

  const levantamiento: Record<string, unknown> = {
    id: R.id,
    orgId: quien.orgId,
    creadoEn: quien.ahora,
    creadoPor: quien.uid,
    revision: 0,
    tipo: 'levantamiento',
    serieId: R.serieId,
    codigoSerie: R.codigoSerie,
    fecha: R.fecha,
    archivo: { nombre: R.archivo.nombre, huella: R.archivo.huella },
    cargadoEn: quien.ahora,
    cargadoPor: quien.uid,
    puntos: R.puntos.map((p) => {
      const punto: Record<string, unknown> = { nombreCampo: p.nombreCampo, lat: p.lat, lon: p.lon };
      if (typeof p.ele === 'number') punto.ele = p.ele;
      if (p.instante) punto.instante = p.instante;
      const nota = String(p.nota ?? '').trim();
      if (nota) punto.nota = nota;
      return punto;
    }),
  };
  if (R.aparato) levantamiento.aparato = R.aparato;
  const nota = String(R.nota ?? '').trim();
  if (nota) levantamiento.nota = nota;

  return { linea, levantamiento };
}

// ════════════════════════════════════════════════════════════════════════════
// 4 · LA PANTALLA
// ════════════════════════════════════════════════════════════════════════════

/**
 * Los orígenes que se pueden declarar al ESCRIBIR un dato nuevo: los siete del
 * contrato menos `confirmado_humano`, que no es un origen sino un acto posterior
 * sobre un dato que ya está (`contratos/src/comunes.ts`). Las etiquetas salen de
 * `selloDeOrigen`, que es su dueño: una segunda lista aquí acabaría diciendo
 * otra cosa que el sello que se imprime al pie de las tablas (`34 · L-65`).
 */
const ORIGENES_DECLARABLES: readonly string[] = Object.freeze(
  (Procedencia.options as string[]).filter((o) => o !== 'confirmado_humano'),
);

/** «TR-618» se dice «tramo compartido 618». Decisión del Ingeniero, 16-09-2026. */
const comoSeDice = (codigo: string): string =>
  (codigo.startsWith('TR-') ? `tramo compartido ${codigo.slice(3)}` : codigo);

/** Un metro con una cifra decimal y coma, que es como se leen aquí. */
const metros = (v: number | null | undefined): string => (typeof v === 'number' ? `${nf(v, 1)} m` : '—');

/** Un ángulo con una cifra decimal. */
const grados = (v: number | null | undefined): string => (typeof v === 'number' ? `${nf(v, 1)}°` : '—');

/** La hora del reloj de Colombia, sin la fecha. Vacío si el punto no traía hora. */
function horaDelPunto(instante: string | undefined): string {
  const local = horaLocalBogota(instante ?? null) as string | null;
  return local ? local.slice(11) : '';
}

/** El día de Colombia de un instante, `AAAA-MM-DD`. Vacío si no se puede leer. */
function diaDelPunto(instante: string | undefined): string {
  const local = horaLocalBogota(instante ?? null) as string | null;
  return local ? local.slice(0, 10) : '';
}

/** Lo que un archivo aportado dejó en pantalla. Nada de esto está en la base. */
interface RecorridoEnPantalla {
  archivo: { nombre: string; huella: string };
  aparato: string | null;
  puntos: PuntoParaGuardar[];
  /** Lo que el lector y el traductor dejaron fuera, ya dicho en castellano. */
  avisos: { tipo: string; mensaje: string }[];
  /** El día de la jornada, leído de la hora que grabó el aparato. */
  fecha: string | null;
  /** Por qué no se pudo saber el día, si no se pudo. */
  porQueSinFecha: string | null;
  /** Los días distintos que aparecen en el archivo, para poder avisar. */
  dias: string[];
}

/** El acuse completo de un alta, tal y como se enseña. */
interface AcuseDelAlta {
  linea: AcuseDeLineaNueva | null;
  levantamiento: AcuseDeLevantamiento | null;
  /** Cuántos documentos se esperaba escribir. */
  esperados: number;
  /** El motivo por el que algo no llegó a escribirse, si lo hubo. */
  fallo: string | null;
}

/**
 * DAR DE ALTA UNA LÍNEA.
 *
 * Ocupa el sitio de las pestañas y deja la columna del parque donde está: lo que
 * se da de alta es una línea NUEVA, no una pestaña de la que esté abierta.
 *
 * @param sesion  quién entró y con qué permiso. Se enseña ANTES de nada.
 * @param parque  las líneas que ya están, si quien llama las tiene a mano. La
 *   pantalla las vuelve a pedir al abrirse de todas formas: decidir qué códigos
 *   se ofrecen con una lista vieja es ofrecer un alta que ya se hizo.
 */
export function AltaDeLinea({ sesion, parque }: {
  sesion: SesionDePantalla;
  parque?: TLinea[];
}) {
  const [lineasDelParque, setLineasDelParque] = useState<TLinea[]>(parque ?? []);
  const [parqueLeido, setParqueLeido] = useState<'pidiendo' | 'listo' | 'fallo'>('pidiendo');

  // Lo que se elige en «1 · La línea». Nada viene puesto.
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [tension, setTension] = useState('');
  const [origenTension, setOrigenTension] = useState('');
  const [fuenteTension, setFuenteTension] = useState('');
  const [circuitos, setCircuitos] = useState('');
  const [codigoTramo, setCodigoTramo] = useState('');
  const [origenTramo, setOrigenTramo] = useState('');
  const [fuenteTramo, setFuenteTramo] = useState('');
  const [completo, setCompleto] = useState('');

  // Lo que se lee del GPS. No sube a ningún sitio.
  const [recorrido, setRecorrido] = useState<RecorridoEnPantalla | null>(null);
  const [leyendoArchivo, setLeyendoArchivo] = useState(false);
  const [falloArchivo, setFalloArchivo] = useState<string | null>(null);
  const [notasDePunto, setNotasDePunto] = useState<Record<number, string>>({});
  const [notaDeJornada, setNotaDeJornada] = useState('');
  const [idLevantamiento, setIdLevantamiento] = useState<string | null>(null);

  // Lo que ya hay guardado de la serie elegida, para poder decir el «hoy».
  const [yaGuardados, setYaGuardados] = useState<TLevantamiento[] | null>(null);
  const [falloYaGuardados, setFalloYaGuardados] = useState<string | null>(null);

  const [confirmando, setConfirmando] = useState(false);
  const [escribiendo, setEscribiendo] = useState(false);
  const [acuse, setAcuse] = useState<AcuseDelAlta | null>(null);

  const puedeLineas = puede(sesion, 'lineas.editar');
  const puedePuntos = puede(sesion, 'cargar.puntos');

  // ── El parque, releído al abrir ──────────────────────────────────────────
  // Decidir qué códigos se ofrecen con una lista vieja es ofrecer un alta que
  // ya se hizo. Un fallo aquí NO apaga el botón: quien de verdad impide un alta
  // repetida es el `getDoc` de la capa de datos, que mira el documento; esto
  // solo evita que se llegue hasta ahí para nada.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const lista = await almacen.lineasDeLaOrganizacion();
        if (!vivo) return;
        setLineasDelParque(lista);
        setParqueLeido('listo');
      } catch {
        if (vivo) setParqueLeido('fallo');
      }
    })();
    return () => { vivo = false; };
  }, []);

  const libro = useMemo(
    () => codigosDisponibles(LIBRO_DE_CODIGOS_CRUDO, lineasDelParque),
    [lineasDelParque],
  );

  // Todas las series anotadas: el mismo archivo podría estar guardado bajo
  // cualquiera de ellas, y hay que decirlo antes de escribir otra copia.
  const idsDelLibro = useMemo(
    () => [...libro.lineas, ...libro.tramos].map((c) => c.id),
    [libro]);

  const elegida = libro.lineas.find((l) => l.codigo === codigo) ?? null;
  const tramo = libro.tramos.find((t) => t.codigo === codigoTramo) ?? null;

  // La serie a la que se anota el recorrido: el tramo si lo recorre, y si no la
  // propia línea. No hay tercera opción — un recorrido sin serie no lo puede
  // leer nadie después y no se puede borrar (`firestore.rules`).
  const serie = tramo ?? elegida;

  // ── Lo que ya hay guardado de esa serie ──────────────────────────────────
  useEffect(() => {
    if (!serie) { setYaGuardados(null); setFalloYaGuardados(null); return; }
    let vivo = true;
    setYaGuardados(null);
    setFalloYaGuardados(null);
    void (async () => {
      try {
        // ⚠️ SE MIRAN TODAS LAS SERIES DEL LIBRO, no solo la elegida: el mismo
        // archivo guardado bajo la línea y bajo su tramo son DOS documentos con
        // los mismos 28 puntos, y ninguno se puede borrar (revisión 17-09).
        const todas = [...new Set([serie.id, ...idsDelLibro])];
        const lista = await repositorio.listarLevantamientos(todas);
        if (vivo) setYaGuardados(lista);
      } catch (e) {
        if (vivo) {
          setFalloYaGuardados(e instanceof Error ? e.message : 'no se pudo comprobar');
        }
      }
    })();
    return () => { vivo = false; };
  }, [serie?.id, idsDelLibro]);

  // ── El identificador del recorrido, derivado de la fecha y de la huella ──
  // Se deriva aquí y no al pulsar para poder ENSEÑARLO antes: es lo que hace que
  // cargar dos veces el mismo archivo caiga sobre el mismo documento en vez de
  // escribir dos recorridos del mismo día que nadie puede borrar.
  useEffect(() => {
    if (!recorrido?.fecha || !serie) { setIdLevantamiento(null); return; }
    let vivo = true;
    void (async () => {
      try {
        // ⚠️ SIN pasar organización: el identificador se emite en el MISMO
        // espacio en el que el libro emitió el de cada serie (la organización
        // por defecto de `@lineas/importar/identidad`). Mezclar los dos espacios
        // dejaría el recorrido en un sitio que no le corresponde a su serie.
        const id = await idDeLevantamiento(serie.codigo, recorrido.fecha, recorrido.archivo.huella);
        if (vivo) setIdLevantamiento(id as string);
      } catch {
        if (vivo) setIdLevantamiento(null);
      }
    })();
    return () => { vivo = false; };
  }, [recorrido?.fecha, recorrido?.archivo.huella, serie?.codigo]);

  // ── Leer el archivo del GPS, en su computador ────────────────────────────
  async function aportar(archivos: FileList | null) {
    const archivo = archivos?.[0];
    if (!archivo) return;
    setFalloArchivo(null);
    setLeyendoArchivo(true);
    setAcuse(null);
    setConfirmando(false);
    try {
      // Se leen los BYTES una sola vez: de ahí salen el texto que se interpreta
      // y la huella que identifica el archivo. Leerlo dos veces abriría la
      // puerta a que la huella fuera de una cosa y los puntos de otra.
      const bytes = await archivo.arrayBuffer();
      const texto = new TextDecoder('utf-8').decode(bytes);
      const huella = await huellaDeArchivo(bytes) as string;
      // El traductor es JavaScript con sus tipos en comentarios, así que devuelve
      // los puntos como objetos sueltos: quien garantiza su forma es el molde
      // `PuntoLevantado`, contra el que ese mismo traductor ya los validó uno a
      // uno antes de devolverlos (`importar/levantamientoDesdeGpx.js`).
      const leido = puntosDesdeGpx(texto) as unknown as {
        creator: string | null;
        puntos: PuntoParaGuardar[];
        avisos: { tipo: string; mensaje: string }[];
      };

      // EL DÍA DE LA JORNADA SALE DE LA HORA QUE GRABÓ EL APARATO, en el reloj
      // de Colombia: una jornada que acaba a las siete de la tarde de aquí ya es
      // el día siguiente en hora universal, y esa fecha entra en un
      // identificador permanente que no se puede corregir.
      //
      // Se toma el PRIMER punto que traiga hora, no el primero a secas: que al
      // waypoint de cabeza le falte el `<time>` no impide saber qué día se
      // recorrió — impedirlo sería bloquear el alta por un hueco que el resto
      // del archivo ya rellena.
      const dias = [...new Set(leido.puntos.map((p) => diaDelPunto(p.instante)).filter(Boolean))];
      const fecha = dias[0] ?? null;

      setRecorrido({
        archivo: { nombre: archivo.name, huella },
        aparato: leido.creator,
        puntos: leido.puntos,
        avisos: leido.avisos,
        fecha,
        porQueSinFecha: fecha
          ? null
          : 'Este archivo no trae la hora de sus puntos, y el día de la jornada sale de la hora que '
            + 'grabó el propio aparato — nunca de una casilla escrita a mano: si se teclea, corregir un '
            + 'dedazo movería el identificador del recorrido y dejaría colgado el anterior, que no se '
            + 'puede borrar. Vuelva a exportar desde el GPS con la hora incluida.',
        dias,
      });
      setNotasDePunto({});
    } catch (e) {
      setRecorrido(null);
      setFalloArchivo(e instanceof Error ? e.message : 'no se pudo leer el archivo');
    } finally {
      setLeyendoArchivo(false);
    }
  }

  const lectura = useMemo(
    () => (recorrido ? lecturaDelRecorrido(recorrido.puntos, PRECISION_GPS_MANO_M) : null),
    [recorrido],
  );
  const placas = useMemo(
    () => (recorrido ? placasQueFaltan(recorrido.puntos.map((p) => p.nombreCampo)) : null),
    [recorrido],
  );

  const tensionLeida = numeroTecleado(tension);
  const nombreLimpio = nombre.trim();
  const fuenteTensionLimpia = fuenteTension.trim();
  const fuenteTramoLimpia = fuenteTramo.trim();

  // ── Lo que falta para poder pulsar ───────────────────────────────────────
  const faltas: string[] = [];
  if (!puedeLineas) faltas.push('su sesión no puede crear ni editar líneas, y el alta escribe una línea.');
  if (recorrido && !puedePuntos) {
    faltas.push('su sesión no puede cargar el trazado, y guardar el recorrido del GPS necesita ese permiso.');
  }
  if (!elegida) faltas.push('elegir el código de la línea en la lista.');
  if (!nombreLimpio) faltas.push('escribir el nombre de la línea.');
  if (tensionLeida === undefined) faltas.push('declarar la tensión nominal.');
  else if (Number.isNaN(tensionLeida) || tensionLeida <= 0) faltas.push('la tensión nominal tiene que ser un número mayor que cero.');
  if (!origenTension) faltas.push('decir de dónde sale esa tensión.');
  if (!fuenteTensionLimpia) faltas.push('escribir la fuente de la tensión: la línea que otro pueda ir a comprobar.');
  if (!circuitos) faltas.push('decir cuántos circuitos tiene esta línea.');
  if (codigoTramo && !origenTramo) faltas.push('decir de dónde sale que esta línea recorre ese tramo compartido.');
  if (codigoTramo && !fuenteTramoLimpia) faltas.push('escribir la fuente de esa declaración del tramo.');
  if (recorrido && !recorrido.fecha) faltas.push('el archivo del GPS no trae la hora de sus puntos y sin ella no se puede fechar la jornada.');
  if (recorrido && recorrido.fecha && !idLevantamiento) faltas.push('todavía se está resolviendo el identificador del recorrido.');
  if (recorrido && !recorrido.puntos.length) faltas.push('el archivo del GPS no dejó ningún punto que se pueda guardar.');

  const plan: PlanDeAlta | null = (!faltas.length && elegida && tensionLeida !== undefined && !Number.isNaN(tensionLeida))
    ? {
      linea: {
        codigo: elegida.codigo,
        id: elegida.id,
        nombre: nombreLimpio,
        tensionNominal_kV: tensionLeida,
        origenTension,
        fuenteTension: fuenteTensionLimpia,
        circuitos: Number(circuitos),
        tramo: tramo
          ? { id: tramo.id, codigo: tramo.codigo, procedencia: origenTramo, fuente: fuenteTramoLimpia }
          : null,
        recorridoCompleto: completo === 'si' ? true : completo === 'no' ? false : null,
      },
      levantamiento: (recorrido && recorrido.fecha && idLevantamiento && serie)
        ? {
          id: idLevantamiento,
          serieId: serie.id,
          codigoSerie: serie.codigo,
          fecha: recorrido.fecha,
          aparato: recorrido.aparato,
          archivo: recorrido.archivo,
          puntos: recorrido.puntos.map((p, i) => ({ ...p, nota: notasDePunto[i] })),
          nota: notaDeJornada,
        }
        : null,
      quien: { uid: sesion.uid, orgId: sesion.orgId, ahora: new Date().toISOString() },
    }
    : null;

  const documentos = plan ? documentosDelAlta(plan) : null;
  // ⚠️ SE VALIDA ANTES DE ESCRIBIR NADA. Si el levantamiento no pasa su molde
  // (más de 500 puntos, un nombre larguísimo, una fecha imposible), enterarse
  // DESPUÉS de escribir la línea deja el alta a medias y el consejo «vuelva a
  // entrar con el mismo archivo» no puede funcionar nunca (revisión 17-09).
  const rechazo: string | null = (() => {
    if (!documentos) return null;
    const l = Linea.safeParse(documentos.linea);
    if (!l.success) return `la línea: ${l.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(' · ')}`;
    if (documentos.levantamiento) {
      const r = Levantamiento.safeParse(documentos.levantamiento);
      if (!r.success) return `el recorrido: ${r.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(' · ')}`;
    }
    return null;
  })();
  // ⚠️ EL «ANTES» NO PUEDE PROMETER LO QUE NO SE VA A ESCRIBIR. El recorrido con
  // el mismo archivo y la misma jornada cae en el MISMO id, y reescribirlo está
  // denegado: si ya está guardado, no se escribe y no se cuenta (revisión 17-09).
  const recorridoYaGuardado = Boolean(
    idLevantamiento && (yaGuardados ?? []).some((l) => l.id === idLevantamiento));
  const cuantosDocumentos = documentos
    ? (documentos.levantamiento && !recorridoYaGuardado ? 2 : 1) : 0;

  // ── Escribir. Solo aquí, y solo tras confirmar ───────────────────────────
  async function darDeAlta() {
    if (!plan) return;
    setEscribiendo(true);
    // El plan se rearma con la hora del momento de escribir, no con la de
    // cuando se pintó la pantalla: entre las dos puede haber pasado media hora.
    const ahora = new Date().toISOString();
    const docs = documentosDelAlta({ ...plan, quien: { ...plan.quien, ahora } });
    let deLinea: AcuseDeLineaNueva | null = null;
    let deRecorrido: AcuseDeLevantamiento | null = null;
    let fallo: string | null = null;

    try {
      // LA LÍNEA PRIMERO, y el orden importa. Si fallara el recorrido, queda una
      // línea en el parque sin él y se puede volver a entrar al alta con el
      // mismo archivo: la línea dirá «ya estaba» y solo se escribirá el
      // recorrido. Al revés quedaría un recorrido a nombre de una serie que
      // todavía no tiene línea, y eso no se puede deshacer ni reintentar.
      deLinea = await repositorio.crearLinea(docs.linea);
      if (docs.levantamiento) {
        deRecorrido = await repositorio.guardarLevantamiento(docs.levantamiento);
      }
    } catch (e) {
      fallo = e instanceof Error ? e.message : 'no se pudo completar el alta';
    }

    setAcuse({ linea: deLinea, levantamiento: deRecorrido, esperados: cuantosDocumentos, fallo });
    setConfirmando(false);
    setEscribiendo(false);

    // El parque se relee para que «dar de alta otra línea» no vuelva a ofrecer
    // la que se acaba de escribir. Si falla, no pasa nada grave: la comprobación
    // que de verdad protege es el `getDoc` de la capa de datos.
    try {
      setLineasDelParque(await almacen.lineasDeLaOrganizacion());
    } catch { /* el acuse ya está puesto; releer el parque es una comodidad */ }
  }

  /** Volver al parque con la línea recién dada de alta abierta. */
  async function verEnElParque(lineaId: string) {
    try {
      const lista = await almacen.lineasDeLaOrganizacion();
      almacen.cerrarAlta();
      await almacen.abrir(lineaId, lista);
    } catch {
      // Si no se puede releer el parque, al menos se sale del alta: el acuse ya
      // dijo lo que quedó escrito y quedarse encerrado aquí sería peor.
      almacen.cerrarAlta();
    }
  }

  /** Empezar otra línea sin repetir el recorrido que ya quedó guardado. */
  function otraLinea() {
    setCodigo(''); setNombre(''); setTension(''); setOrigenTension(''); setFuenteTension('');
    setCircuitos(''); setCompleto('');
    setRecorrido(null); setNotasDePunto({}); setNotaDeJornada(''); setIdLevantamiento(null);
    setAcuse(null); setConfirmando(false);
    // El tramo y su declaración se conservan: la segunda línea del mismo tramo
    // lo recorre igual, y volver a elegirlo a mano es una ocasión de elegir otro.
  }

  // ── LA CUENTA DEL ACUSE, y las tres cifras son distintas ────────────────
  // `intentados` es lo que el plan decía; `yaEstaban` lo que resultó estar ya
  // escrito y NO se volvió a escribir —que no es un fallo—; y `escritos` lo que
  // de verdad entró. Sumar los tres en un solo número diría «2 de 2» cuando uno
  // de los dos ni se tocó, y ahí se pierde justo lo que hay que ver.
  const yaEstaban = (acuse?.linea?.yaEstaba ? 1 : 0) + (acuse?.levantamiento?.yaEstaba ? 1 : 0);
  const escritos = (acuse?.linea && !acuse.linea.yaEstaba ? 1 : 0)
    + (acuse?.levantamiento && !acuse.levantamiento.yaEstaba ? 1 : 0);
  const porEscribir = (acuse?.esperados ?? 0) - yaEstaban;
  const puntosCuadran = !acuse?.levantamiento || acuse.levantamiento.yaEstaba
    || acuse.levantamiento.puntosReleidos === acuse.levantamiento.puntosEnviados;
  const acuseCuadra = Boolean(acuse) && !acuse?.fallo && escritos === porEscribir && puntosCuadran;

  return (
    <section className="panel">
      <h2>Alta de línea</h2>

      {/* ── ① Quién entra y con qué permiso ────────────────────────────── */}
      <p className="cargar-quien">
        Entra como <b>{sesion.correo ?? 'su cuenta'}</b> · organización <b>{sesion.orgId || 'sin declarar'}</b> ·
        permiso <b>{sesion.rol || 'sin declarar'}</b>. Hace falta: <b>crear y editar líneas y su
        conductor</b> y, para guardar el recorrido del GPS, <b>cargar el trazado (GPS/KML) que crea
        puntos</b>. Se dice aquí, antes de nada: si el permiso no fuera el correcto, más vale saberlo
        ahora y no con el formulario entero relleno.
      </p>

      <p className="advertencia">
        <b>Esto no se puede deshacer.</b> Una línea dada de alta no se borra, y un recorrido guardado
        tampoco. Por eso el código se elige de una lista y no se teclea, y por eso no viene nada
        marcado.
      </p>

      {parqueLeido === 'fallo' && (
        <p className="aviso">
          <b>No se pudo volver a leer el parque.</b> La lista de códigos se arma con lo último que la
          aplicación tenía en memoria, así que puede ofrecer una línea que otra persona acabe de dar
          de alta. Antes de escribir se comprueba en la base documento a documento, así que no se
          pisaría nada — pero el alta se quedaría a medias y habría que volver a entrar.
        </p>
      )}

      {libro.ilegibles.length > 0 && (
        <div className="alerta">
          <b>Hay filas del libro de códigos que no se pueden ofrecer:</b>
          <ul className="cargar-lista">
            {libro.ilegibles.map((x) => <li key={x.codigo}><b>{x.codigo}:</b> {x.motivo}</li>)}
          </ul>
        </div>
      )}

      {/* ── ② La línea ──────────────────────────────────────────────────── */}
      <h2 className="exportar-titulo">1 · La línea — se escribe 1 documento</h2>

      <div className="calc-fila">
        <label className="calc-campo">
          Código de la línea
          <select value={codigo} onChange={(e) => { setCodigo(e.target.value); setAcuse(null); }}>
            <option value="">— elija uno —</option>
            {libro.lineas.filter((l) => !l.yaEstaEnElParque).map((l) => (
              <option key={l.codigo} value={l.codigo}>{l.codigo}</option>
            ))}
          </select>
        </label>
        <label className="calc-campo">
          Nombre
          <input
            type="text"
            value={nombre}
            placeholder="lo escribe usted"
            onChange={(e) => setNombre(e.target.value)}
          />
        </label>
      </div>
      <p className="fine">
        Sale de la lista de códigos del repositorio, no se teclea. De este código nace el
        identificador permanente de la línea y no se corrige después.
        {libro.lineas.some((l) => l.yaEstaEnElParque) && (
          <> No aparecen {libro.lineas.filter((l) => l.yaEstaEnElParque).map((l) => l.codigo).join(', ')}:
            ya están en el parque.</>
        )}
        {elegida && <> El identificador de <b>{elegida.codigo}</b> es <span className="mono">{elegida.id}</span>.</>}
        {' '}El <b>nombre</b> lo escribe usted: no se deduce del código.
      </p>

      <div className="calc-fila">
        <label className="calc-campo">
          Tensión nominal (kV)
          <input
            type="text"
            inputMode="decimal"
            value={tension}
            onChange={(e) => setTension(e.target.value)}
          />
        </label>
        <label className="calc-campo">
          De dónde sale
          <select value={origenTension} onChange={(e) => setOrigenTension(e.target.value)}>
            <option value="">— elija uno —</option>
            {ORIGENES_DECLARABLES.map((o) => (
              <option key={o} value={o}>{selloDeOrigen(o)}</option>
            ))}
          </select>
        </label>
        <label className="calc-campo">
          Fuente
          <input
            type="text"
            value={fuenteTension}
            placeholder="qué papel o qué pantalla lo dice"
            onChange={(e) => setFuenteTension(e.target.value)}
          />
        </label>
      </div>
      {comoSeEntendio(tension, 'kV') && <p className="fine">{comoSeEntendio(tension, 'kV')}</p>}
      <p className="fine">
        <b>De dónde sale la tensión se guarda CON el número</b> (contrato 0.17.0), con su fuente, la
        fecha y quién la declaró. Hasta el 20-09 esta pantalla la pedía y no la guardaba: el molde no
        tenía esa casilla. Un número sin procedencia es una opinión, y éste es el denominador de todo
        lo eléctrico.
      </p>
      <p className="fine">
        La tensión declarada es la <b>nominal</b>: la que sirve para comparar con lo que el SCADA
        mide. No se toma de ninguna otra línea.
      </p>

      <div className="calc-fila">
        <label className="calc-campo">
          Circuitos de esta línea
          <select value={circuitos} onChange={(e) => setCircuitos(e.target.value)}>
            <option value="">— elija uno —</option>
            <option value="1">1 circuito</option>
            <option value="2">2 circuitos</option>
          </select>
        </label>
        <label className="calc-campo">
          Tramo compartido que recorre
          <select
            value={codigoTramo}
            onChange={(e) => { setCodigoTramo(e.target.value); setAcuse(null); }}
          >
            <option value="">— ninguno —</option>
            {libro.tramos.map((t) => (
              <option key={t.codigo} value={t.codigo}>{comoSeDice(t.codigo)}</option>
            ))}
          </select>
        </label>
        <label className="calc-campo">
          ¿Recorrido completo?
          <select value={completo} onChange={(e) => setCompleto(e.target.value)}>
            <option value="">— sin declarar (no consta) —</option>
            <option value="si">Sí: se recorrió de punta a punta</option>
            <option value="no">No: solo se conoce una parte</option>
          </select>
        </label>
      </div>
      <p className="fine">
        <b>Circuitos de la línea</b> no es lo mismo que circuitos tendidos en la torre: dos líneas
        de un circuito cada una que compartan torre dan una torre de dos circuitos, y eso se declara
        al registrar la torre, no aquí.
        {' '}<b>El tramo compartido</b> es el trozo por el que dos líneas pasan en la MISMA torre: esa
        torre se registra una sola vez, a nombre del tramo, y cada línea declara que lo recorre.
        {' '}<b>El recorrido</b> se declara en tres estados: sí, no, y <i>sin declarar</i> — que se
        escribe no poniendo el campo y significa «no consta», no «no». Con «no», toda longitud de
        esta línea es una cota inferior y las pantallas tienen que decirlo.
      </p>

      {tramo && (
        <>
          <div className="calc-fila">
            <label className="calc-campo">
              De dónde sale que {elegida?.codigo ?? 'esta línea'} recorre el {comoSeDice(tramo.codigo)}
              <select value={origenTramo} onChange={(e) => setOrigenTramo(e.target.value)}>
                <option value="">— elija uno —</option>
                {ORIGENES_DECLARABLES.map((o) => (
                  <option key={o} value={o}>{selloDeOrigen(o)}</option>
                ))}
              </select>
            </label>
            <label className="calc-campo">
              Fuente de esa declaración
              <input
                type="text"
maxLength={500}
                value={fuenteTramo}
                placeholder="el plano, el acta o el recorrido que lo respalda"
                onChange={(e) => setFuenteTramo(e.target.value)}
              />
            </label>
          </div>
          <p className="fine">
            Esta declaración decide qué torres entran en el informe de {elegida?.codigo ?? 'la línea'},
            así que lleva su origen y su fuente como cualquier otro dato que se firme. Se declara el
            tramo <b>entero</b>: acotarlo de una torre a otra exige los identificadores de dos torres
            registradas, y todavía no hay ninguna.
          </p>
        </>
      )}

      <p className="cargar-pendiente">
        <b>Conductor: pendiente</b> — lo entrega usted después. No se usa el de otra línea.
        {' '}<b>Hipótesis de cálculo: pendiente</b> — las entrega usted después. Aquí no se piden y
        aquí no se inventan: sin ellas la línea entra al parque y cada pestaña dirá qué le falta.
      </p>

      {/* ── ③ El levantamiento ──────────────────────────────────────────── */}
      <h2 className="exportar-titulo">
        2 · El recorrido del GPS, tal cual {recorrido ? '— se escribe 1 documento' : ''}
      </h2>

      {!serie && (
        <p className="aviso">
          Elija antes el código de la línea (y el tramo compartido, si lo recorre): el recorrido se
          guarda <b>a nombre de una serie</b>, y sin saber cuál no se puede ni fechar ni identificar.
        </p>
      )}

      {serie && (
        <>
          <p className="fine">
            El recorrido se guardaría a nombre de <b>{comoSeDice(serie.codigo)}</b>
            {tramo ? ' — el tramo, no la línea: la misma torre sirve a las dos líneas que lo recorren y el recorrido se guarda una sola vez.' : ' — la propia línea, porque no declara ningún tramo compartido.'}
          </p>
          {yaGuardados !== null && yaGuardados.length > 0 && (
            <p className="aviso">
              <b>Ya hay {yaGuardados.length} recorrido(s) guardado(s) de {comoSeDice(serie.codigo)}:</b>{' '}
              {yaGuardados.map((l) => `${l.fecha} (${l.puntos.length} puntos)`).join(' · ')}. Si el
              suyo es uno de ésos, no hace falta volver a aportarlo: aquí no se repite.
            </p>
          )}
          {(() => {
            // El mismo archivo, la misma jornada, otra serie: dos documentos con
            // los mismos puntos, y ninguno se borra. Se avisa ANTES.
            const gemelo = (yaGuardados ?? []).find(
              (l) => l.archivo?.huella === recorrido?.archivo.huella && l.serieId !== serie.id);
            return gemelo ? (
              <p className="advertencia">
                <b>Este mismo archivo ya está guardado</b> a nombre de{' '}
                {comoSeDice(gemelo.codigoSerie)} (jornada {gemelo.fecha}, {gemelo.puntos.length} puntos).
                Guardarlo otra vez a nombre de {comoSeDice(serie.codigo)} deja dos recorridos con los
                mismos puntos, y ninguno se puede borrar. Si es el mismo levantamiento, no hace falta.
              </p>
            ) : null;
          })()}
          {falloYaGuardados && (
            <p className="aviso">
              <b>No se pudo comprobar qué recorridos hay ya guardados</b> de {comoSeDice(serie.codigo)}:{' '}
              {falloYaGuardados}. No es «no hay ninguno»: es que no se pudo mirar. Antes de escribir
              se comprueba otra vez, documento a documento.
            </p>
          )}

          <div className="calc-fila">
            <label className="calc-campo">
              Archivo descargado del aparato (.gpx)
              <input
                type="file"
                accept=".gpx,application/gpx+xml"
                className="cargar-archivo"
                onChange={(e) => { void aportar(e.target.files); e.target.value = ''; }}
              />
            </label>
            {recorrido && (
              <button type="button" className="boton chico" onClick={() => { setRecorrido(null); setNotasDePunto({}); setIdLevantamiento(null); }}>
                Quitar este archivo
              </button>
            )}
          </div>
          <p className="fine">
            <b>El archivo no sube a ningún sitio:</b> se lee aquí, en su computador. A la base viajan
            los puntos que usted apruebe, nunca el archivo. Lo que se guarda es lo que grabó el
            aparato —nombre de campo, posición, cota y hora— y <b>no crea ninguna torre</b>.
          </p>
          {leyendoArchivo && <p className="fine">Leyendo el archivo…</p>}
          {falloArchivo && <p className="alerta"><b>No se pudo leer el archivo:</b> {falloArchivo}</p>}
        </>
      )}

      {recorrido && lectura && (
        <>
          <p className="cargar-rotulo">
            <b>{recorrido.archivo.nombre}</b>
            {recorrido.aparato ? ` · ${recorrido.aparato}` : ' · el archivo no declara con qué aparato se escribió'}
            {recorrido.fecha && <> · levantado el {recorrido.fecha} · <b>sin registrar como torres</b></>}
            {' '}· ±{nf(PRECISION_GPS_MANO_M)} m (el archivo no trae la precisión: es la que el
            sistema da a todo GPS de mano) · huella <span className="mono">{recorrido.archivo.huella.slice(0, 16)}…</span>
          </p>

          {recorrido.porQueSinFecha && <p className="alerta">{recorrido.porQueSinFecha}</p>}

          {recorrido.dias.length > 1 && (
            <p className="aviso">
              <b>Este archivo tiene puntos de {recorrido.dias.length} días distintos</b>{' '}
              ({recorrido.dias.join(', ')}). Un levantamiento es <b>una</b> jornada: se guardaría
              entero con la fecha del primer punto ({recorrido.fecha}), y eso deja escrito un día que
              no es el de todos. Lo correcto es exportar del aparato una jornada por archivo.
            </p>
          )}

          {recorrido.avisos.length > 0 && (
            <div className="aviso">
              <b>Lo que el archivo traía y no se guarda, dicho antes de guardar:</b>
              <ul className="cargar-lista">
                {recorrido.avisos.map((v, i) => <li key={`${v.tipo}-${i}`}>{v.mensaje}</li>)}
              </ul>
            </div>
          )}

          <div className="kpis">
            <div className="kpi">
              <div className="kpi-v">{nf(recorrido.puntos.length)}</div>
              <div className="kpi-l">puntos del archivo</div>
              <div className="kpi-s">
                {recorrido.puntos[0]?.nombreCampo} → {recorrido.puntos[recorrido.puntos.length - 1]?.nombreCampo}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-v">{metros(lectura.longitudLevantada_m)}</div>
              <div className="kpi-l">levantados · {nf(lectura.vanos_m.length)} vanos</div>
              <div className="kpi-s">{metros(lectura.enRecta_m)} en recta, de punta a punta</div>
            </div>
            <div className="kpi">
              <div className="kpi-v">{metros(lectura.mediana_m)}</div>
              <div className="kpi-l">vano mediano</div>
              <div className="kpi-s">
                mín {metros(lectura.minimo_m)} · máx {metros(lectura.maximo_m)}
              </div>
            </div>
            <div className="kpi">
              <div className={placas && placas.huecos.length ? 'kpi-v' : 'kpi-v gris'}>
                {placas ? nf(placas.huecos.length) : '—'}
              </div>
              <div className="kpi-l">placas saltadas dentro del recorrido</div>
              <div className="kpi-s">
                {placas && placas.huecos.length
                  ? `la numeración salta ${placas.huecos.join(', ')}`
                  : 'la numeración no salta ningún número entre el primero y el último'}
              </div>
            </div>
          </div>

          <p className="fine">
            <b>Fuera de lo levantado no se sabe nada.</b> Que el primer punto se llame{' '}
            «{recorrido.puntos[0]?.nombreCampo}» no dice que existan placas antes, ni cuántas: dice
            dónde empieza el recorrido. El sistema no las cuenta porque no puede saberlo, y suponer
            que la numeración arranca en 1 sería inventar torres.
            {placas?.repetidas.length ? ` Hay números repetidos en el archivo: ${placas.repetidas.join(', ')}.` : ''}
            {placas?.sinNumero.length ? ` Y ${placas.sinNumero.length} punto(s) sin número de placa legible en su nombre.` : ''}
          </p>

          {lectura.sospechosos.length > 0 && (
            <p className="aviso">
              <b>{lectura.sospechosos.length} vano(s) con pinta de torre sin levantar</b> (miden{' '}
              {nf(lectura.umbral, 2)} veces la mediana o más):{' '}
              {lectura.sospechosos.map((i) => {
                const f = lectura.filas[i];
                return `${recorrido.puntos[i - 1]?.nombreCampo} → ${recorrido.puntos[i]?.nombreCampo}: `
                  + `${metros(f.vanoEntra_m)}, ${nf(f.vecesLaMediana ?? 0, 2)} veces la mediana`;
              }).join(' · ')}. <b>Se guardan como vienen:</b> el levantamiento no se corrige — es la
              prueba de lo que la cuadrilla recorrió aquel día.
            </p>
          )}

          {lectura.indeterminados.length > 0 && (
            <p className="aviso">
              <b>Vano(s) tan cortos que su dirección no se puede saber</b> con ±{nf(PRECISION_GPS_MANO_M)} m
              por punto:{' '}
              {lectura.indeterminados.map((i) => (
                `${recorrido.puntos[i - 1]?.nombreCampo} → ${recorrido.puntos[i]?.nombreCampo} (${metros(lectura.filas[i].vanoEntra_m)})`
              )).join(' · ')}. No es que el margen sea grande: es que no hay dirección que declarar,
              y el quiebre que se apoya en ella tampoco es fiable.
            </p>
          )}

          <EsquemaDelRecorrido puntos={recorrido.puntos} sospechosos={lectura.sospechosos} />

          {/* ── La nota por punto: aquí o nunca ──────────────────────── */}
          <p className="advertencia">
            <b>La nota de cada punto se escribe AHORA o no se escribe nunca.</b> Las reglas de la base
            congelan los puntos de un recorrido guardado: después solo se puede editar la nota del
            documento entero, que no puede decir de cuál de los {nf(recorrido.puntos.length)} puntos
            habla. Si la «R» de un nombre es anotación suya, o la placa dice otra cosa que el GPS,
            escríbalo aquí.
          </p>

          <div className="tabla-caja tabla-scroll">
            <table className="tabla">
              <caption>
                Los {nf(recorrido.puntos.length)} puntos tal como los grabó el aparato. El vano, el
                quiebre y su margen se calculan al vuelo y <b>no se guardan</b>: lo que se guarda es
                el punto.
              </caption>
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Nombre en el GPS</th>
                  <th>Hora</th>
                  <th className="num">Cota</th>
                  <th className="num">Vano desde el anterior</th>
                  <th>Quiebre</th>
                  <th>Su nota de este punto</th>
                </tr>
              </thead>
              <tbody>
                {recorrido.puntos.map((p, i) => {
                  const f = lectura.filas[i];
                  return (
                    <tr key={`${p.nombreCampo}-${i}`}>
                      <td className="num">{i + 1}</td>
                      <td><b>{p.nombreCampo}</b></td>
                      <td>{horaDelPunto(p.instante) || <span className="sin-dato">sin hora</span>}</td>
                      <td className="num">{typeof p.ele === 'number' ? metros(p.ele) : <span className="sin-dato">—</span>}</td>
                      <td className={f.sospechoso ? 'num destaca' : 'num'}>
                        {i === 0 ? 'extremo' : metros(f.vanoEntra_m)}
                        {f.sospechoso && <span className="cargar-consecuencia">¿torre sin levantar?</span>}
                        {f.direccionEntra && !f.direccionEntra.determinado && (
                          <span className="cargar-hueco">muy corto: la dirección de este vano no se puede saber</span>
                        )}
                      </td>
                      <td>
                        {i === 0 || i === recorrido.puntos.length - 1
                          ? 'extremo'
                          : (
                            <>
                              {grados(f.quiebre_grados)}
                              {f.margen?.determinado
                                ? <span className="cargar-consecuencia">± {grados(f.margen.margen_grados)}</span>
                                : <span className="cargar-hueco">no fiable: el margen no se puede saber</span>}
                            </>
                          )}
                      </td>
                      <td>
                        <input
                          type="text"
                          maxLength={200}
                          value={notasDePunto[i] ?? ''}
                          placeholder="opcional"
                          onChange={(e) => setNotasDePunto((n) => ({ ...n, [i]: e.target.value }))}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <label className="calc-campo">
            Nota de la jornada entera (opcional)
            <input
              type="text"
              maxLength={1000}
              value={notaDeJornada}
              placeholder="«se recorrió con lluvia», «faltan las placas anteriores a la primera»…"
              onChange={(e) => setNotaDeJornada(e.target.value)}
            />
          </label>
          <p className="fine">
            Esta nota habla de <b>toda</b> la jornada. Lo que sea de un punto concreto va en su fila,
            arriba. La nota del documento sí se puede corregir después; las de los puntos no.
          </p>
        </>
      )}

      {/* ── ④ Las torres: apagado ───────────────────────────────────────── */}
      <h2 className="exportar-titulo">3 · Las torres — apagado</h2>
      <p className="cargar-pendiente">
        <b>Pendiente: declarar la función de cada torre.</b> Usted decidió dar de alta sin torres, así
        que este bloque no escribe nada y no hay nada que rellenar aquí.
        {recorrido && <> Los {nf(recorrido.puntos.length)} puntos del recorrido quedan guardados tal
          cual, rotulados «sin registrar como torres».</>}
      </p>
      <p className="fine">
        Una torre nace cuando usted declara qué papel estructural cumple, y esa decisión no la toma
        un aparato: el molde del recorrido prohíbe con nombre y apellido la función estructural, el
        orden y el nombre canónico. Sus nombres de sistema se emiten en el libro del repositorio ese
        mismo día — hoy no existen, y por eso aquí no se enseña ninguno. Cuando los declare, se abre
        sin repetir el alta de la línea.
      </p>

      {/* ── ⑤ Cómo quedaría ─────────────────────────────────────────────── */}
      {documentos && elegida && (
        <>
          <h2 className="exportar-titulo">4 · Cómo quedaría</h2>
          <p className="fine">
            Se declara también lo que <b>no</b> se mueve: que algo siga igual es información, no un
            hueco.
          </p>
          <div className="tabla-caja">
            <table className="tabla">
              <caption>Antes y después de pulsar, con {cuantosDocumentos} documento(s) que entrarían.</caption>
              <thead>
                <tr>
                  <th>Cifra</th>
                  <th className="num">Hoy</th>
                  <th className="num">Quedaría</th>
                  <th>¿Se mueve?</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Líneas en el parque</td>
                  <td className="num">{nf(lineasDelParque.length)}</td>
                  <td className="num destaca">{nf(lineasDelParque.length + 1)}</td>
                  <td>sí</td>
                </tr>
                <tr>
                  <td>
                    Línea {elegida.codigo}
                    <span className="cargar-consecuencia">sin conductor y sin hipótesis: entra al parque y dice qué le falta</span>
                  </td>
                  <td className="num">no existe</td>
                  <td className="num destaca">1 documento</td>
                  <td>sí</td>
                </tr>
                <tr>
                  <td>
                    Recorridos guardados de {serie ? comoSeDice(serie.codigo) : 'la serie'}
                    <span className="cargar-consecuencia">
                      {documentos.levantamiento
                        ? 'se comprueba antes de escribir: si ese mismo archivo ya estaba cargado, no se vuelve a escribir y el acuse lo dirá'
                        : 'en este alta no se aporta ningún archivo'}
                    </span>
                  </td>
                  <td className="num">
                    {yaGuardados === null ? <span className="sin-dato">sin comprobar</span> : nf(yaGuardados.length)}
                  </td>
                  <td className={documentos.levantamiento && !recorridoYaGuardado ? 'num destaca' : 'num'}>
                    {documentos.levantamiento && !recorridoYaGuardado
                      ? `${nf((yaGuardados?.length ?? 0) + 1)} · ${nf(recorrido?.puntos.length ?? 0)} puntos`
                      : 'lo mismo'}
                  </td>
                  <td>{documentos.levantamiento && !recorridoYaGuardado ? 'sí'
                    : recorridoYaGuardado ? 'ya estaba: no se vuelve a escribir' : 'no se mueve'}</td>
                </tr>
                <tr>
                  <td>
                    Torres registradas de {serie ? comoSeDice(serie.codigo) : 'la serie'}
                    <span className="cargar-consecuencia">esperan a que usted declare la función de cada una</span>
                  </td>
                  <td className="num">0</td>
                  <td className="num">0</td>
                  <td>no se mueve</td>
                </tr>
                <tr>
                  <td>Documentos de las demás líneas tocados</td>
                  <td className="num">—</td>
                  <td className="num">0</td>
                  <td>no se mueve</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── ⑥ Dar de alta ───────────────────────────────────────────────── */}
      {!acuse && (
        <>
          <h2 className="exportar-titulo">5 · Dar de alta</h2>
          {faltas.length > 0 && (
            <div className="aviso">
              <b>El botón está apagado porque falta esto:</b>
              <ul className="cargar-lista">
                {faltas.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </div>
          )}

          {rechazo && (
            <p className="advertencia">
              <b>El botón está apagado: lo que se iba a escribir no pasa su propio molde</b> —{' '}
              {rechazo}. Se comprueba ANTES de escribir nada, para no dejar la línea creada y el
              recorrido fuera.
            </p>
          )}

          {!confirmando && (
            <button
              type="button"
              className="boton"
              disabled={!plan || Boolean(rechazo)}
              onClick={() => setConfirmando(true)}
            >
              {plan
                ? `Dar de alta ${plan.linea.codigo}${plan.levantamiento ? ' y guardar el recorrido' : ''}`
                : 'Dar de alta'}
            </button>
          )}

          {confirmando && plan && documentos && (
            <div className="cargar-confirmar">
              <p className="cargar-confirmar-t">Antes de escribir, léalo una vez más</p>
              <p>
                Se van a escribir <b>{cuantosDocumentos} documento(s)</b>: la línea{' '}
                <b>{plan.linea.codigo}</b> («{plan.linea.nombre}», {nf(plan.linea.tensionNominal_kV, 1)} kV,{' '}
                {plan.linea.circuitos} circuito(s)
                {plan.linea.tramo ? `, que recorre el ${comoSeDice(plan.linea.tramo.codigo)}` : ', sin tramo compartido'})
                {plan.levantamiento && (
                  <> y el recorrido del <b>{plan.levantamiento.fecha}</b> a nombre de{' '}
                    <b>{comoSeDice(plan.levantamiento.codigoSerie)}</b>, con{' '}
                    <b>{nf(plan.levantamiento.puntos.length)} puntos</b></>
                )}.
                {' '}<b>No se crea ninguna torre</b> y no se toca ningún documento de otra línea.
              </p>
              <p>
                <b>Esto no se puede deshacer.</b> Si el código estuviera mal, la línea quedaría en el
                parque para siempre; si el archivo fuera otro, el recorrido también.
              </p>
              <div className="rca-guardar">
                <button type="button" className="boton" disabled={escribiendo} onClick={() => void darDeAlta()}>
                  {escribiendo ? 'Escribiendo…' : `Sí, dar de alta ${plan.linea.codigo}`}
                </button>
                <button type="button" className="boton chico" disabled={escribiendo} onClick={() => setConfirmando(false)}>
                  No, volver a revisar
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── ⑦ El acuse, contado ─────────────────────────────────────────── */}
      <div aria-live="polite">
        {acuse && (
          <>
            <h2 className="exportar-titulo">Lo que pasó</h2>

            <p className={acuseCuadra ? 'ok' : 'alerta'}>
              {escritos === 0 && porEscribir === 0
                ? <><b>No había nada que escribir: los {nf(yaEstaban)} documento(s) ya estaban.</b> El
                  parque quedó exactamente como estaba.</>
                : <><b>Se escribieron {nf(escritos)} de {nf(porEscribir)} documento(s)</b>
                  {yaEstaban > 0 && <> ({nf(yaEstaban)} ya estaba(n) y no se volvió a escribir)</>}
                  , leídos de nuevo de la base uno a uno</>}:{' '}
              {acuse.linea && (
                <>
                  {acuse.linea.yaEstaba
                    ? <><b>{acuse.linea.codigo}</b> ya estaba en el parque y NO se volvió a escribir</>
                    : <><b>{acuse.linea.codigo}</b> (línea){acuse.linea.releida
                      ? ` — la base devuelve «${acuse.linea.releida.nombre}», ${nf(acuse.linea.releida.tensionNominal_kV, 1)} kV, `
                        + `${acuse.linea.releida.circuitos} circuito(s), ${acuse.linea.releida.tramosCompartidos} tramo(s) compartido(s) declarado(s)`
                      : ' — no se pudo volver a leer para comprobarla'}</>}
                </>
              )}
              {acuse.linea && acuse.levantamiento && ' · '}
              {acuse.levantamiento && (
                <>
                  {acuse.levantamiento.yaEstaba
                    ? <>el recorrido del <b>{acuse.levantamiento.fecha}</b> ya estaba cargado y NO se volvió a escribir</>
                    : <>recorrido del <b>{acuse.levantamiento.fecha}</b> con{' '}
                      <b>{acuse.levantamiento.puntosReleidos === null
                        ? 'no se pudo contar'
                        : `${nf(acuse.levantamiento.puntosReleidos)} de ${nf(acuse.levantamiento.puntosEnviados)}`} puntos</b></>}
                </>
              )}
              {!acuse.linea && !acuse.levantamiento
                ? <b>no llegó a escribirse ningún documento y el parque quedó como estaba.</b>
                : escritos > 0 ? '. Quedó escrito a su nombre.' : '.'}
            </p>

            {!puntosCuadran && acuse.levantamiento && !acuse.levantamiento.yaEstaba && (
              <p className="alerta">
                <b>El conteo NO cuadra.</b> Se mandaron {nf(acuse.levantamiento.puntosEnviados)} puntos
                y la base devuelve{' '}
                {acuse.levantamiento.puntosReleidos === null
                  ? 'un documento que no se pudo leer'
                  : `${nf(acuse.levantamiento.puntosReleidos)}`}. No se dice «hecho» con un conteo que no
                cuadra: revise el recorrido en la línea antes de seguir, y no vuelva a pulsar — el
                recorrido guardado no se puede reescribir.
              </p>
            )}

            {acuse.fallo && (
              <div className="alerta">
                <b>No se pudo completar el alta:</b> {acuse.fallo}
                {acuse.linea && !acuse.levantamiento && (
                  <p>
                    <b>La línea SÍ quedó dada de alta.</b> Vuelva a entrar al alta y aporte el mismo
                    archivo del GPS: la línea dirá «ya estaba» y solo se escribirá el recorrido.
                  </p>
                )}
              </div>
            )}

            {acuse.linea?.yaEstaba && (
              <p className="aviso">
                <b>{acuse.linea.codigo} ya existía y no se volvió a escribir.</b> Volver a escribirla
                habría pisado la que ya está, con su conductor, sus hipótesis y sus tramos declarados —
                las reglas de la base permiten actualizar una línea, así que aquí no hay red que lo
                impida salvo esta comprobación.
              </p>
            )}

            {acuse.levantamiento?.yaEstaba && (
              <p className="aviso">
                <b>Ese mismo archivo ya estaba cargado</b> para {comoSeDice(acuse.levantamiento.codigoSerie)}{' '}
                el {acuse.levantamiento.fecha}: no se volvió a escribir. El identificador sale de la
                fecha y de la huella del archivo, así que leerlo dos veces cae sobre el mismo
                documento — y reescribirlo está denegado.
              </p>
            )}

            <div className="rca-guardar">
              {acuse.linea && (
                <button type="button" className="boton" onClick={() => void verEnElParque(acuse.linea!.id)}>
                  Ver {acuse.linea.codigo} en el parque
                </button>
              )}
              <button type="button" className="boton chico" onClick={otraLinea}>
                Dar de alta otra línea
              </button>
            </div>
            <p className="fine">
              <b>Cada línea se da de alta por separado</b>, con su propio acuse. El recorrido de un
              tramo compartido se guarda <b>una</b> vez: en la segunda línea que lo recorra no se
              repite — se declara el tramo y ya lo lee por ahí.
            </p>
          </>
        )}
      </div>

      <p className="advertencia">
        <b>Lo que esta pantalla no puede hacer, a propósito:</b> no estrena códigos —solo da de alta
        los que ya están anotados en el libro del repositorio—, no deduce la función de ninguna
        estructura, no le pone nombre de sistema a ningún punto del GPS y no copia nada de otra
        línea. El día que un código nuevo haga falta, se anota primero en el repositorio; es el único
        sitio donde este recorte cuesta algo, y se prefiere a que una pantalla pueda estrenar
        identidades permanentes.
      </p>
    </section>
  );
}

// ── El esquema del recorrido, para reconocer el archivo ─────────────────────

/**
 * UN CROQUIS EN PLANTA DEL ARCHIVO, norte arriba y con la misma escala en los
 * dos ejes. Sirve para UNA cosa: ver que es el archivo correcto antes de
 * guardarlo, que es lo último que se puede comprobar sin poder deshacer.
 *
 * ⚠️ NO ES EL ESQUEMA DE LA LÍNEA. El dueño de ése es `vistas/planta.ts`, y
 * trabaja sobre TORRES REGISTRADAS: filtra por tipo de punto, marca las anclas
 * por su función estructural y etiqueta con el nombre del sistema. Aquí no hay
 * nada de eso —estos puntos no son torres y no tienen función— así que pasarlos
 * por ahí obligaría a fabricar apoyos falsos, que es justo lo que este alta
 * existe para no hacer. La proyección es la misma que usa aquél (plano local en
 * metros con origen en el centroide); lo que cambia es que aquí no se interpreta
 * ni un punto.
 */
function EsquemaDelRecorrido({ puntos, sospechosos }: {
  puntos: PuntoParaGuardar[];
  sospechosos: number[];
}) {
  const g = useMemo(() => {
    if (puntos.length < 2) return null;
    const lat0 = puntos.reduce((s, p) => s + p.lat, 0) / puntos.length;
    const lon0 = puntos.reduce((s, p) => s + p.lon, 0) / puntos.length;
    const mLat = 111132.92 - 559.82 * Math.cos((2 * lat0 * Math.PI) / 180);
    const mLon = 111412.84 * Math.cos((lat0 * Math.PI) / 180);
    const xy = puntos.map((p) => ({ x: (p.lon - lon0) * mLon, y: (p.lat - lat0) * mLat }));

    const minX = Math.min(...xy.map((p) => p.x));
    const maxX = Math.max(...xy.map((p) => p.x));
    const minY = Math.min(...xy.map((p) => p.y));
    const maxY = Math.max(...xy.map((p) => p.y));
    const anchoReal = Math.max(maxX - minX, 1);
    const altoReal = Math.max(maxY - minY, 1);

    // El lienzo se adapta a la forma del recorrido: una línea alta pide un
    // dibujo alto. Misma escala en los dos ejes o el croquis mentiría.
    const ancho = 640;
    const margen = 26;
    const escala = (ancho - 2 * margen) / anchoReal;
    const alto = Math.max(200, Math.min(900, altoReal * escala + 2 * margen));
    const escalaFinal = Math.min(escala, (alto - 2 * margen) / altoReal);

    const enLienzo = xy.map((p) => ({
      x: margen + (p.x - minX) * escalaFinal + ((ancho - 2 * margen) - anchoReal * escalaFinal) / 2,
      // La latitud crece hacia el norte y el lienzo hacia abajo: se invierte.
      y: alto - margen - (p.y - minY) * escalaFinal - ((alto - 2 * margen) - altoReal * escalaFinal) / 2,
    }));

    return { ancho, alto, puntos: enLienzo, traza: enLienzo.map((p) => `${p.x},${p.y}`).join(' ') };
  }, [puntos]);

  if (!g) return null;
  const sospechoso = new Set(sospechosos);

  return (
    <div className="mapa">
      <svg viewBox={`0 0 ${g.ancho} ${g.alto}`} role="img" aria-label="Croquis en planta del recorrido levantado, norte arriba">
        <polyline points={g.traza} className="traza" />
        {g.puntos.map((p, i) => (
          i > 0 && sospechoso.has(i) ? (
            <line
              key={`v-${i}`}
              x1={g.puntos[i - 1].x} y1={g.puntos[i - 1].y} x2={p.x} y2={p.y}
              // El color sale del tablero de la hoja, no de un valor escrito a
              // mano: así sigue al tema como todo lo demás.
              style={{ stroke: 'var(--acc)', strokeWidth: 3, strokeDasharray: '5 4', fill: 'none' }}
            >
              <title>{`${puntos[i - 1].nombreCampo} → ${puntos[i].nombreCampo}: vano con pinta de torre sin levantar`}</title>
            </line>
          ) : null
        ))}
        {g.puntos.map((p, i) => (
          <circle key={`p-${i}`} cx={p.x} cy={p.y} r={2.6} className="ap-susp">
            <title>{puntos[i].nombreCampo}</title>
          </circle>
        ))}
        <g className="norte">
          <line x1={g.ancho - 30} y1={42} x2={g.ancho - 30} y2={20} />
          <text x={g.ancho - 26} y={26}>N</text>
        </g>
      </svg>
      <p className="leyenda">
        <span className="li susp" /> punto del recorrido — sin función, no es torre registrada
        {/* Un vano es un trazo, no un punto: se estira la misma pieza de la
            leyenda, igual que hace la hoja con los tramos. */}
        <span className="li" style={{ width: 18, height: 3, borderRadius: 2, background: 'var(--acc)' }} />
        {' '}vano con pinta de torre sin levantar
      </p>
      <p className="fine">
        Croquis del archivo, norte arriba y con la misma escala en los dos ejes. Sirve para ver que es
        el archivo correcto antes de guardarlo; no es el esquema de la línea, porque todavía no hay
        ninguna torre registrada.
      </p>
    </div>
  );
}
