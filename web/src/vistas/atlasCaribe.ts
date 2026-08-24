// ============================================================================
// vistas/atlasCaribe.ts — un atlas del Caribe, cuadro a cuadro
// ----------------------------------------------------------------------------
// QUÉ HACE: coge el mes empaquetado que trae `<atlas>-AAAA-MM.png` —24 horas de
// ancho, un día por fila— y saca de él el cuadro de 6x6 celdas de UNA hora de UN
// día. Nada más. Puro: sin DOM y sin red.
//
// SIRVE PARA LOS DOS ATLAS —el solar y el de temperatura— porque el empaquetado
// es el mismo: lo construye un solo motor (`herramientas/atlas-caribe.mjs`). Lo
// que cambia entre uno y otro viaja DENTRO de la ficha (unidad, rampa, aviso,
// qué resume cada día), nunca en este código: un `if (capa === 'sol')` aquí sería
// el principio de dos lectores, y con ellos dos formas de recortar un cuadro.
//
// POR QUÉ UN MÓDULO Y NO UN TROZO DE LA PANTALLA: el corte del cuadro es una
// cuenta con cuatro índices y es exactamente donde se cuelan los fallos que no
// dan error — enseñar el día de al lado, o la hora de al lado, con un mapa que
// parece perfecto. Aquí tiene prueba.
//
// ⚠️ EL AÑO NO TIENE DOS PARTES, TIENE TRES, y las tres se declaran:
//   · hasta `ultimoDiaConHoras`  → hay reparto por horas. El mapa se mueve.
//   · hasta `ultimoDiaConTotal`  → SOLO el resumen del día. El mapa NO se pinta.
//   · después                    → no hay ni total.
// Las fechas viven en la FICHA, jamás en este código: escritas aquí, la frontera
// mentiría en silencio en la siguiente reconstrucción y los colores seguirían
// saliendo bonitos (`31 · L-64`).
// ============================================================================
import { valorDeByte, type CodificacionRejilla } from './rejilla.ts';

export interface MesAtlas {
  /** '01'..'12' */
  clave: string;
  archivo: string;
  dias: number;
  horasConDato: number;
  bytes: number;
}

export interface FichaAtlas {
  /** `sol-caribe` | `temp-caribe`. Se usa para rotular, nunca para decidir. */
  capa: string;
  titulo: string;
  departamentos: string[];
  bbox: [number, number, number, number];
  /** Celdas del cuadro: 6 x 6. NO son los píxeles del archivo. */
  ancho: number;
  alto: number;
  /**
   * Iguales a propósito: el píxel ES la celda medida de 1°. Los declara la ficha
   * porque `rejilla.ts` los exige — y aquí sirven para que la pantalla NO avise
   * de un remuestreo que no existe.
   */
  resolucion_m: number;
  resolucion_nativa_m: number;
  codificacion: CodificacionRejilla;
  cuadros: { horas: number; porFila: number; celdaAncho: number; celdaAlto: number };
  anio: number;
  meses: MesAtlas[];
  ultimoDiaConHoras: string;
  ultimoDiaConTotal: string | null;
  construido: string;
  /**
   * EL RESUMEN DE CADA DÍA, con nombre genérico a propósito: en el atlas solar es
   * la energía (kWh/m²) y en el de temperatura la máxima (°C). Cómo se llama y en
   * qué unidad va lo dice la ficha, así que la pantalla lo imprime sin saber cuál
   * de los dos atlas está abierto.
   */
  resumenDiario: { d: string; v: number }[];
  resumenDiarioEtiqueta: string;
  resumenDiarioUnidad: string;
  resumenDiarioAviso: string;
  rampa: { c: number; rgb: number[] }[];
  hipotesisMarcadaEnRampa?: number;
  /** Qué es esa marca, en palabras del proyecto. Sin esto la rampa tendría una raya sin dueño. */
  etiquetaHipotesis?: string;
  /** Los extremos REALES de lo publicado: la pantalla no promete escala que el dato no llena. */
  medido?: { min: number; max: number };
  aviso: string;
  fuente: string;
  atribucion: string;
  unidad: string;
  remuestreo_pantalla?: string;
}

/** En qué banda de 2026 cae un día. `sin_dato` es un estado legítimo, no un fallo. */
export type BandaDelDia = 'horas' | 'solo_total' | 'sin_dato';

export function bandaDelDia(ficha: FichaAtlas, iso: string): BandaDelDia {
  if (iso <= ficha.ultimoDiaConHoras) return 'horas';
  if (ficha.ultimoDiaConTotal && iso <= ficha.ultimoDiaConTotal) return 'solo_total';
  return 'sin_dato';
}

/** El día, en ISO, a partir del mes y el número de día. Sin `Date`: sin husos. */
export const isoDe = (anio: number, mes: string, dia: number): string =>
  `${anio}-${mes}-${String(dia).padStart(2, '0')}`;

/**
 * EL CUADRO DE UNA HORA DE UN DÍA, recortado del mes.
 *
 * `px` son los bytes del PNG entero, en orden de lectura (fila a fila). El mes
 * mide `24*ancho` de ancho y `dias*alto` de alto; el cuadro (día, hora) empieza
 * en la columna `hora*ancho` y la fila `(día-1)*alto`.
 *
 * Devuelve `null` en vez de un cuadro vacío cuando los índices se salen: un
 * cuadro de ceros se pintaría como «no se midió» en todas las celdas y se leería
 * igual que una noche legítima.
 */
export function cuadroDe(
  px: Uint8Array, ficha: FichaAtlas, mes: MesAtlas, dia: number, hora: number,
): Uint8Array | null {
  const { ancho, alto } = ficha;
  const horas = ficha.cuadros?.horas ?? 24;
  if (!Number.isInteger(dia) || dia < 1 || dia > mes.dias) return null;
  if (!Number.isInteger(hora) || hora < 0 || hora >= horas) return null;
  const anchoPx = horas * ancho;
  const necesarios = anchoPx * mes.dias * alto;
  if (px.length < necesarios) return null;   // el archivo no es el que dice la ficha

  const fuera = new Uint8Array(ancho * alto);
  for (let fy = 0; fy < alto; fy++) {
    const origen = ((dia - 1) * alto + fy) * anchoPx + hora * ancho;
    fuera.set(px.subarray(origen, origen + ancho), fy * ancho);
  }
  return fuera;
}

/** Lo que hay que decir de un cuadro. `null` donde no se midió, nunca 0. */
export function resumenDelCuadro(cuadro: Uint8Array, cod: CodificacionRejilla): {
  min: number | null; max: number | null; mediana: number | null; nSinDato: number;
} {
  const vs: number[] = [];
  let nSinDato = 0;
  for (const b of cuadro) {
    if (b === cod.sin_dato) { nSinDato++; continue; }
    vs.push((b - 1) * cod.paso + cod.offset);
  }
  if (!vs.length) return { min: null, max: null, mediana: null, nSinDato };
  vs.sort((a, b) => a - b);
  return {
    min: vs[0], max: vs[vs.length - 1],
    mediana: vs[Math.floor(vs.length / 2)],
    nSinDato,
  };
}

/**
 * LA HORA PUNTA DE ESE DÍA: aquella cuya mediana es la más alta. Sirve para abrir
 * la pantalla donde se ve algo en vez de a medianoche — que en el atlas solar es
 * un mapa negro y se lee como una avería (la piedra con la que ya tropezó la capa
 * mensual), y en el de temperatura es la hora más fresca, que es justo la que NO
 * decide nada: la ampacidad la manda la hora más caliente.
 */
export function horaPunta(
  px: Uint8Array, ficha: FichaAtlas, mes: MesAtlas, dia: number,
): number {
  let mejor = 12, valor = -1;
  for (let h = 0; h < (ficha.cuadros?.horas ?? 24); h++) {
    const c = cuadroDe(px, ficha, mes, dia, h);
    if (!c) continue;
    const r = resumenDelCuadro(c, ficha.codificacion);
    if (r.mediana !== null && r.mediana > valor) { valor = r.mediana; mejor = h; }
  }
  return mejor;
}

/** El resumen del día, si consta. `null` no es 0: es que no hay medida. */
export function resumenDelDia(ficha: FichaAtlas, iso: string): number | null {
  return ficha.resumenDiario.find((e) => e.d === iso)?.v ?? null;
}

/** Un mes que la pantalla puede ofrecer, tenga o no reparto por horas. */
export interface MesOfrecido {
  clave: string;
  /** Los días del mes. Siempre, aunque no haya PNG. */
  dias: number;
  /** El mes empaquetado, si existe. `null` = ese mes solo tiene total del día. */
  png: MesAtlas | null;
}

/**
 * LOS MESES QUE SE PUEDEN ELEGIR — y no son solo los que tienen PNG.
 *
 * ⚠️ ESTO ES UN ARREGLO. La primera versión listaba únicamente los meses con
 * reparto por horas, así que junio, julio y medio agosto quedaban INALCANZABLES:
 * descargados, pesados, publicados en la ficha… y sin forma de seleccionarlos.
 * La pantalla presumía de tres bandas y solo dejaba ver dos, y la leyenda decía
 * «dato hasta el 16 de agosto por día» hablando de días que nadie podía abrir.
 *
 * Se unen las dos fuentes: los meses con PNG y los meses que aparecen en el
 * resumen diario. Lo detectó la revisión adversarial.
 */
export function mesesOfrecidos(ficha: FichaAtlas): MesOfrecido[] {
  const claves = new Set<string>(ficha.meses.map((m) => m.clave));
  for (const e of ficha.resumenDiario) claves.add(e.d.slice(5, 7));

  return [...claves].sort().map((clave) => {
    const png = ficha.meses.find((m) => m.clave === clave) ?? null;
    return { clave, png, dias: png ? png.dias : diasDelMes(ficha.anio, +clave) };
  });
}

/** Los días de un mes. Sin `Date`: bisiesto explícito, y sin husos. */
export function diasDelMes(anio: number, mes: number): number {
  const largos = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (mes === 2 && ((anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0)) return 29;
  return largos[mes - 1] ?? 30;
}

// ════════════════════════════════════════════════════════════════════════════
// EL DÍA ENTERO EN LA CELDA DE LA LÍNEA (§ADR-059)
// ----------------------------------------------------------------------------
// POR QUÉ HACÍA FALTA. La pantalla daba UN número —el de la hora que tocara el
// deslizador— y, al lado, un resumen del día que era de la REGIÓN entera. Los
// dos juntos se leían como si hablaran de lo mismo, y no: el 19 de agosto la
// celda marcaba 32,5 °C a mediodía y debajo ponía «máxima del día: 29,79 °C».
// Una máxima menor que un valor del propio día parece un error de cálculo, y
// quien lo lee deja de fiarse de toda la capa — con razón.
//
// Y para decidir un mantenimiento, un número suelto no sirve: hay que saber
// **cuánto llegó a hacer y a qué hora**. Eso obligaba a mover el deslizador
// veinticuatro veces y a apuntar a mano.
//
// ⚠️ NO SE DESCARGA NADA NUEVO. Las veinticuatro horas de cada día ya están
// dentro del PNG del mes que la capa se baja igualmente: esto solo las LEE. Se
// va directo al byte en vez de construir el cuadro entero hora por hora, que
// sería veinticuatro copias de la rejilla para quedarse con un píxel de cada.
// ════════════════════════════════════════════════════════════════════════════

/** El día entero, hora a hora, en UNA celda. */
export interface PerfilDelDia {
  /** Las 24 horas locales, con `null` donde no se midió. */
  horas: (number | null)[];
  min: number | null;
  max: number | null;
  /** A qué hora se dio el máximo. `null` si no hubo ni una hora con dato. */
  horaMax: number | null;
  horaMin: number | null;
  /** La suma del día. Solo significa algo en lo que se ACUMULA (lluvia, sol). */
  total: number | null;
  media: number | null;
  /** Cuántas de las 24 horas no traen medida. Se dice, no se disimula. */
  nSinDato: number;
}

/**
 * El día entero en la celda que le toca a la línea.
 *
 * @returns `null` si el archivo no cuadra con su ficha — el mismo criterio de
 *          `cuadroDe`: un PNG que no es el que la ficha declara desplazaría
 *          TODAS las lecturas y seguiría dando números de aspecto correcto.
 */
export function perfilEnCelda(
  px: Uint8Array, ficha: FichaAtlas, mes: MesAtlas, dia: number, ix: number, iy: number,
): PerfilDelDia | null {
  const { ancho, alto, codificacion } = ficha;
  const horas = ficha.cuadros?.horas ?? 24;
  if (!Number.isInteger(dia) || dia < 1 || dia > mes.dias) return null;
  if (!Number.isInteger(ix) || ix < 0 || ix >= ancho) return null;
  if (!Number.isInteger(iy) || iy < 0 || iy >= alto) return null;
  const anchoPx = horas * ancho;
  if (px.length < anchoPx * mes.dias * alto) return null;

  const fila = ((dia - 1) * alto + iy) * anchoPx;
  const vs: (number | null)[] = [];
  for (let h = 0; h < horas; h++) vs.push(valorDeByte(px[fila + h * ancho + ix], codificacion));

  const conDato = vs.filter((v): v is number => v !== null);
  if (!conDato.length) {
    return { horas: vs, min: null, max: null, horaMax: null, horaMin: null,
      total: null, media: null, nSinDato: vs.length };
  }
  const max = Math.max(...conDato), min = Math.min(...conDato);
  const total = conDato.reduce((a, b) => a + b, 0);
  return {
    horas: vs,
    min, max,
    // `indexOf` sobre el array COMPLETO, no sobre el filtrado: si se buscara en
    // `conDato` la hora saldría corrida por cada hueco que hubiera antes.
    horaMax: vs.indexOf(max),
    horaMin: vs.indexOf(min),
    total,
    media: total / conDato.length,
    nSinDato: vs.length - conDato.length,
  };
}

/**
 * Las horas del día en que se pasó de un tope.
 *
 * Sirve para lo único que importa al planificar: no «sopló mucho», sino
 * «de 11 a 15 no se podía subir». Un hueco NO cuenta como superado ni como no
 * superado: no se sabe, y por eso `nSinDato` viaja aparte en el perfil.
 */
export function horasSobre(perfil: PerfilDelDia, tope: number): number[] {
  const out: number[] = [];
  perfil.horas.forEach((v, h) => { if (v !== null && v > tope) out.push(h); });
  return out;
}

/**
 * Tramos seguidos de horas, dichos como los diría una persona: «de 11 a 15».
 *
 * Devolver «11, 12, 13, 14, 15» obliga a leer una lista y reconstruir el tramo
 * mentalmente; eso en el campo no se hace.
 */
export function enTramos(horas: number[]): string {
  if (!horas.length) return '';
  const tramos: [number, number][] = [];
  let ini = horas[0], prev = horas[0];
  for (const h of horas.slice(1)) {
    if (h === prev + 1) { prev = h; continue; }
    tramos.push([ini, prev]); ini = h; prev = h;
  }
  tramos.push([ini, prev]);
  const dosDig = (h: number) => String(h).padStart(2, '0');
  const dichos = tramos
    .map(([a, b]) => (a === b ? `a las ${dosDig(a)}:00` : `de ${dosDig(a)}:00 a ${dosDig(b)}:59`));
  // Coma entre todos y «y» solo antes del último: con cuatro o cinco tramos
  // —lo normal en un día de nubosidad— la cadena de «y» se vuelve ilegible.
  if (dichos.length <= 2) return dichos.join(' y ');
  return `${dichos.slice(0, -1).join(', ')} y ${dichos[dichos.length - 1]}`;
}

// ════════════════════════════════════════════════════════════════════════════
// CÓMO LLOVIÓ, EN PALABRAS (§ADR-059)
// ----------------------------------------------------------------------------
// «0,4 mm» no le dice a nadie si se podía trabajar. «Llovizna de 08:00 a 11:59»
// sí. La escala son los grados de intensidad horaria que usan los servicios
// meteorológicos (OMM, y AEMET con estos mismos cortes): débil hasta 2 mm/h,
// moderada hasta 15, fuerte hasta 30, muy fuerte hasta 60 y torrencial por
// encima. NO es un criterio inventado en esta casa, y por eso se puede citar.
//
// ⚠️ LO QUE ESTA ESCALA **NO** PUEDE DECIR, y hay que decirlo en la pantalla:
//
//   · **Si estaba NUBLADO.** La nubosidad es otro parámetro (`CLOUD_AMT`) y no
//     está en este archivo. Deducirla de los milímetros sería inventarla: un día
//     encapotado sin una gota mide exactamente lo mismo que uno despejado.
//   · **Si hubo TORMENTA ELÉCTRICA.** No hay parámetro de rayos ni de convección
//     en esta fuente, y ninguna cantidad de lluvia implica aparato eléctrico. El
//     único sitio del sistema donde consta una tormenta es el PRONÓSTICO, que sí
//     trae el símbolo de la suya (`vistas/pronostico.ts`).
//
// ⚠️ Y UNA ADVERTENCIA QUE VIAJA CON CADA GRADO: el dato es la media de la hora
// sobre una celda de 111 km. Un aguacero de veinte minutos sobre un apoyo se
// reparte en esa hora y en esos 111 km, y sale MÁS FLOJO de lo que fue. La
// escala clasifica lo que el archivo mide, no lo que cayó sobre la torre.
// ════════════════════════════════════════════════════════════════════════════

export interface GradoDeLluvia {
  clave: 'seca' | 'llovizna' | 'moderada' | 'fuerte' | 'muy_fuerte' | 'torrencial';
  nombre: string;
  /** Desde (incluido) en mm en una hora. */
  desde: number;
  /** Qué significa para una cuadrilla. Criterio del proyecto, no de la OMM. */
  paraLaLinea: string;
}

/** De más flojo a más fuerte. El orden ES la función: se busca el último que se cumple. */
export const ESCALA_LLUVIA: readonly GradoDeLluvia[] = Object.freeze([
  { clave: 'seca', nombre: 'sin lluvia', desde: 0,
    paraLaLinea: 'nada que impida trabajar por agua.' },
  { clave: 'llovizna', nombre: 'llovizna', desde: 0.1,
    paraLaLinea: 'moja, pero rara vez decide la jornada.' },
  { clave: 'moderada', nombre: 'lluvia moderada', desde: 2,
    paraLaLinea: 'el terreno empieza a ser el problema, no el trabajo.' },
  { clave: 'fuerte', nombre: 'lluvia fuerte', desde: 15,
    paraLaLinea: 'acceso comprometido y visibilidad mala.' },
  { clave: 'muy_fuerte', nombre: 'lluvia muy fuerte', desde: 30,
    paraLaLinea: 'no es jornada de campo.' },
  { clave: 'torrencial', nombre: 'lluvia torrencial', desde: 60,
    paraLaLinea: 'no es jornada de campo, y el acceso puede estar cortado.' },
]);

/**
 * En qué grado cae una hora. `null` si esa hora no se midió — que NO es «seca».
 *
 * Un hueco convertido en «sin lluvia» sería exactamente el error de `32 · L-44`:
 * «no se sabe» pintado igual que «se miró y estaba bien».
 */
export function intensidadDeLluvia(mm_h: number | null): GradoDeLluvia | null {
  if (mm_h === null || !Number.isFinite(mm_h)) return null;
  let grado = ESCALA_LLUVIA[0];
  for (const g of ESCALA_LLUVIA) if (mm_h >= g.desde) grado = g;
  return grado;
}

/**
 * Cómo llovió a lo largo del día, agrupado por grado y en orden de intensidad.
 *
 * Las horas SECAS no se devuelven: ocupan casi todo el día y enterrarían lo que
 * importa. Las horas sin medir tampoco — van aparte, en `nSinDato` del perfil.
 */
export function comoLlovio(perfil: PerfilDelDia): { grado: GradoDeLluvia; horas: number[] }[] {
  const porClave = new Map<string, { grado: GradoDeLluvia; horas: number[] }>();
  perfil.horas.forEach((v, h) => {
    const g = intensidadDeLluvia(v);
    if (!g || g.clave === 'seca') return;
    const y = porClave.get(g.clave) ?? { grado: g, horas: [] };
    y.horas.push(h);
    porClave.set(g.clave, y);
  });
  const orden = ESCALA_LLUVIA.map((g) => g.clave);
  return [...porClave.values()].sort(
    (a, b) => orden.indexOf(b.grado.clave) - orden.indexOf(a.grado.clave));
}

/**
 * El MES entero en la celda, día a día — para planificar, no para un día suelto.
 *
 * Es lo que contesta «¿cuántos días de éstos se pierden?»: cuántos días del mes
 * cruzaron un tope y cuáles. Sale del MISMO PNG que ya está en memoria: recorrer
 * los 31 días no cuesta ni una descarga más.
 */
export function diasDelMesSobre(
  px: Uint8Array, ficha: FichaAtlas, mes: MesAtlas, ix: number, iy: number,
  tope: number, medir: 'max' | 'total' = 'max',
): { dias: number[]; medidos: number; sinDato: number } {
  const dias: number[] = [];
  let medidos = 0, sinDato = 0;
  for (let d = 1; d <= mes.dias; d++) {
    const p = perfilEnCelda(px, ficha, mes, d, ix, iy);
    const v = p ? (medir === 'total' ? p.total : p.max) : null;
    if (v === null) { sinDato++; continue; }
    medidos++;
    if (v > tope) dias.push(d);
  }
  return { dias, medidos, sinDato };
}

// ════════════════════════════════════════════════════════════════════════════
// CÓMO ESTUVO EL CIELO, EN PALABRAS (§ADR-060)
// ----------------------------------------------------------------------------
// «47 %» no le dice a nadie cómo estuvo el día. «Parcialmente nublado» sí. Los
// cortes son los de la escala de OCTAS de la OMM —el cielo se parte en ocho
// octavos y cada tramo tiene su nombre desde hace más de un siglo—, traducidos a
// porcentaje: 1 octa = 12,5 %. NO es un criterio inventado en esta casa.
//
// ⚠️ ESTO NO ES UN PRONÓSTICO NI UNA TORMENTA. Un cielo cubierto no implica que
// lloviera —eso lo dice el atlas de lluvia— y **ningún grado de nubosidad
// implica aparato eléctrico**: la tormenta no se mide con nubes, y esta fuente
// no publica rayos de ninguna forma. Hay prueba que impide que esa palabra entre
// aquí.
//
// ⚠️ Y ES LA MEDIA DE UNA CELDA DE 111 KM. Dice cómo estuvo la región a esa
// hora, no si sobre un apoyo concreto había una nube.
// ════════════════════════════════════════════════════════════════════════════

export interface GradoDeCielo {
  clave: 'despejado' | 'poco_nuboso' | 'parcial' | 'nuboso' | 'cubierto';
  nombre: string;
  /** Desde (incluido), en % de cielo cubierto. */
  desde: number;
  /** Qué significa para una cuadrilla. Criterio del proyecto, no de la OMM. */
  paraLaLinea: string;
}

/** De cielo abierto a cielo cerrado. El orden ES la función. */
export const ESCALA_CIELO: readonly GradoDeCielo[] = Object.freeze([
  { clave: 'despejado', nombre: 'despejado', desde: 0,
    paraLaLinea: 'sol a plomo: el conductor en su hora más caliente y la cuadrilla sin sombra.' },
  { clave: 'poco_nuboso', nombre: 'poco nuboso', desde: 12.5,
    paraLaLinea: 'prácticamente sol pleno.' },
  { clave: 'parcial', nombre: 'parcialmente nublado', desde: 37.5,
    paraLaLinea: 'claros y nubes: la radiación va a rachas.' },
  { clave: 'nuboso', nombre: 'nuboso', desde: 62.5,
    paraLaLinea: 'poca radiación directa; en temporada, suele venir con agua.' },
  { clave: 'cubierto', nombre: 'cubierto', desde: 87.5,
    paraLaLinea: 'cielo cerrado. Mírese la lluvia de la misma hora antes de programar.' },
]);

/** En qué grado cae una hora. `null` si no se midió — que NO es «despejado». */
export function estadoDelCielo(pct: number | null): GradoDeCielo | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  let grado = ESCALA_CIELO[0];
  for (const g of ESCALA_CIELO) if (pct >= g.desde) grado = g;
  return grado;
}

/**
 * Cómo estuvo el cielo a lo largo del día, agrupado por grado.
 *
 * A diferencia de la lluvia, aquí NO se esconde ningún grado: «despejado» es
 * información —sol a plomo sobre la cuadrilla—, no ausencia de información.
 */
export function comoEstuvoElCielo(
  perfil: PerfilDelDia,
): { grado: GradoDeCielo; horas: number[] }[] {
  const porClave = new Map<string, { grado: GradoDeCielo; horas: number[] }>();
  perfil.horas.forEach((v, h) => {
    const g = estadoDelCielo(v);
    if (!g) return;
    const y = porClave.get(g.clave) ?? { grado: g, horas: [] };
    y.horas.push(h);
    porClave.set(g.clave, y);
  });
  // Del cielo más cerrado al más abierto: lo que cambia una jornada va primero.
  const orden = ESCALA_CIELO.map((g) => g.clave);
  return [...porClave.values()].sort(
    (a, b) => orden.indexOf(b.grado.clave) - orden.indexOf(a.grado.clave));
}

// ════════════════════════════════════════════════════════════════════════════
// EL RECORRIDO ENTERO CONTRA LA REJILLA (§ADR-064)
// ----------------------------------------------------------------------------
// POR QUÉ. La pantalla venía afirmando «una sola celda cubre toda la línea» —y
// era verdad para LN-627— pero **nadie lo había comprobado**: el panel resolvía
// la celda con UN punto, el promedio de todas las coordenadas, y la frase era
// una convicción de diseño, no un hecho medido. En una línea más larga, o en una
// que pase cerca de un borde de celda, esa frase se convierte en mentira sin que
// nada avise: el promedio caería en una celda y los extremos en otra.
//
// El Ingeniero lo pidió con todas las letras: «ten en cuenta cada coordenada a
// lo largo de la línea desde el principio hasta el fin». Esto es eso — y de paso
// convierte una afirmación en una comprobación, que es el trabajo de esta casa.
// ════════════════════════════════════════════════════════════════════════════

/** Qué encuentra el recorrido completo cuando se le pregunta a una rejilla. */
export interface CeldasDelRecorrido {
  /** Cuántas coordenadas se comprobaron. */
  puntos: number;
  /** Celdas distintas que toca el recorrido, en el orden en que aparecen. */
  celdas: { ix: number; iy: number }[];
  /** Puntos que caen FUERA del encuadre de esa rejilla. No se disimulan. */
  fuera: number;
}

/**
 * Contra qué celdas cae el recorrido completo de una línea.
 *
 * @param puntos  TODAS las coordenadas, de punta a punta. No el promedio.
 * @param celdaDe la función que resuelve la celda, inyectada para que este
 *                módulo siga sin depender de `rejilla.ts` en tiempo de ejecución.
 */
export function celdasDelRecorrido(
  puntos: readonly { lat: number; lon: number }[],
  ficha: FichaAtlas,
  celdaDe: (lon: number, lat: number, f: FichaAtlas) => { ix: number; iy: number } | null,
): CeldasDelRecorrido {
  const vistas = new Map<string, { ix: number; iy: number }>();
  let fuera = 0;
  for (const p of puntos) {
    const c = celdaDe(p.lon, p.lat, ficha);
    if (!c) { fuera++; continue; }
    const k = `${c.ix},${c.iy}`;
    if (!vistas.has(k)) vistas.set(k, c);
  }
  return { puntos: puntos.length, celdas: [...vistas.values()], fuera };
}

// ════════════════════════════════════════════════════════════════════════════
// EL RECORRIDO, DIBUJADO SOBRE EL ATLAS (§ADR-074)
// ----------------------------------------------------------------------------
// La otra mitad del nexo. `§ADR-073` dejó el atlas DICIENDO de qué celda habla
// —«la celda de LN-627»—, y eso se lee; lo que no se veía era DÓNDE. Sobre 6°x6°
// de Caribe y celdas de 111 km, «por la costa de Bolívar» es un gesto con el
// dedo: hay que buscar el trozo de mapa y confiar en él.
//
// TRES CAPAS, y cada una responde a una pregunta distinta:
//   · las CELDAS del recorrido → «¿cuál de estos cuadros me toca?»
//   · la TRAZA                 → «¿por dónde va la línea dentro de ese cuadro?»
//   · el RÓTULO                → «¿cuál de las líneas es?», anclado al PRIMER
//     punto (el extremo de origen), que es un sitio del recorrido y no un
//     promedio: el centroide no está en la línea y ya se coló una vez.
//
// ⚠️ LAS CELDAS VAN CON BORDE Y SIN RELLENO, y es una regla, no una preferencia
// de estilo: el relleno de esa celda YA lo pinta `pintarRejilla` con el valor
// medido. Volver a rellenarla —aunque fuese translúcido— pondría DOS verdades
// sobre el mismo cuadro y el color que se lee dejaría de ser el de la escala
// publicada. El borde no toca el dato: solo lo rodea.
//
// ⚠️ Y LA TRAZA ES DIMINUTA A PROPÓSITO. LN-627 mide 3 km sobre un mapa de 670:
// al encuadre de entrada son dos píxeles. No se agranda ni se le pinta un halo
// que la haga parecer una línea de 50 km — se dibuja lo que mide y se rodea su
// celda, que es lo que sí se ve. Inflarla sería enseñar una longitud falsa.
// ════════════════════════════════════════════════════════════════════════════

/** Lo mínimo de GeoJSON que necesita este módulo. Sin dependencia de tipos. */
interface ColeccionGeo<G> {
  type: 'FeatureCollection';
  features: { type: 'Feature'; properties: { nombre: string }; geometry: G }[];
}
type PoligonoGeo = { type: 'Polygon'; coordinates: [number, number][][] };
type LineaGeo = { type: 'LineString'; coordinates: [number, number][] };
type PuntoGeo = { type: 'Point'; coordinates: [number, number] };

/** Las tres capas, ya listas para el mapa. Cada una puede ir vacía. */
export interface DibujoDelRecorrido {
  celdas: ColeccionGeo<PoligonoGeo>;
  traza: ColeccionGeo<LineaGeo>;
  rotulo: ColeccionGeo<PuntoGeo>;
}

/**
 * EL DIBUJO DEL RECORRIDO SOBRE EL ATLAS — puro, sin mapa y sin DOM.
 *
 * @param puntos  TODAS las coordenadas de la línea, en orden.
 * @param celdas  las celdas que toca, ya resueltas por `celdasDelRecorrido`.
 * @param bordeDe el recuadro de una celda, inyectado igual que `celdaDe`: este
 *                módulo sigue sin depender de `rejilla.ts` en ejecución.
 * @param nombre  qué línea es. Va al rótulo y a cada pieza, para que un clic o
 *                una inspección puedan decir de quién es lo que se ve.
 *
 * Con MENOS DE DOS puntos no se emite traza: una `LineString` de un punto es
 * GeoJSON inválido y MapLibre la descarta **sin decir nada** — quedaría un mapa
 * con rótulo y sin línea, que se lee como un fallo de dibujo y no lo es.
 */
export function dibujoDelRecorrido(
  puntos: readonly { lat: number; lon: number }[],
  celdas: readonly { ix: number; iy: number }[],
  ficha: FichaAtlas,
  bordeDe: (ix: number, iy: number, f: FichaAtlas) => [number, number, number, number] | null,
  nombre: string,
): DibujoDelRecorrido {
  const coords = puntos.map((p) => [p.lon, p.lat] as [number, number]);

  const anillos: ColeccionGeo<PoligonoGeo>['features'] = [];
  for (const c of celdas) {
    const b = bordeDe(c.ix, c.iy, ficha);
    if (!b) continue;                       // celda inexistente: no se inventa
    const [loMin, laMin, loMax, laMax] = b;
    anillos.push({
      type: 'Feature', properties: { nombre },
      geometry: {
        type: 'Polygon',
        // Anillo CERRADO: el primer punto se repite al final, como manda GeoJSON.
        coordinates: [[[loMin, laMin], [loMax, laMin], [loMax, laMax], [loMin, laMax], [loMin, laMin]]],
      },
    });
  }

  return {
    celdas: { type: 'FeatureCollection', features: anillos },
    traza: {
      type: 'FeatureCollection',
      features: coords.length >= 2
        ? [{ type: 'Feature', properties: { nombre }, geometry: { type: 'LineString', coordinates: coords } }]
        : [],
    },
    rotulo: {
      type: 'FeatureCollection',
      features: coords.length
        ? [{ type: 'Feature', properties: { nombre }, geometry: { type: 'Point', coordinates: coords[0] } }]
        : [],
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// ¿DE CUÁNDO ES LO QUE ESTOY MIRANDO? (§ADR-075)
// ----------------------------------------------------------------------------
// Lo pidió el Ingeniero: «me gustaría que se pueda apreciar la fecha de última
// actualización y hora». Y detrás de esa frase hay DOS fechas que no son la
// misma, y confundirlas es la trampa entera de esta pantalla:
//
//   · CUÁNDO SE CONSTRUYÓ EL ARCHIVO — cuándo se le preguntó a la fuente.
//   · HASTA CUÁNDO LLEGA EL DATO      — el último día MEDIDO que trae dentro.
//
// Enseñar solo la primera es lo cómodo y es lo que engaña: un archivo
// reconstruido hace diez minutos puede traer dato de hace tres meses —así está
// hoy el atlas solar, que su fuente publica con 87 días de retraso— y en
// pantalla se leería «actualizado hoy» sobre un mapa de mayo.
//
// Por eso esto devuelve las dos, la distancia de cada una y, sobre todo, DE
// QUIÉN es el retraso: si el archivo es viejo, es nuestro y se arregla
// reconstruyendo; si el archivo es nuevo y el dato es viejo, es de la fuente y
// no hay nada que reconstruir. Un aviso que no dice de quién es la culpa manda
// a buscar la avería al sitio equivocado.
// ════════════════════════════════════════════════════════════════════════════

/** Zona del activo. La misma que el pronóstico: sin ella «las 22:00» es de Oslo. */
export const ZONA_ATLAS = 'America/Bogota';

/** Cuántos días enteros hay entre dos días ISO. Sin husos: se restan julianos. */
const diasEntreIso = (a: string, b: string): number => {
  const j = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000;
  return Math.round(j(b) - j(a));
};

export interface FrescuraDelAtlas {
  /** El día del reloj de Colombia en que se construyó, `AAAA-MM-DD`. */
  construidoDia: string;
  /** Su hora, `HH:MM`, también en el reloj de Colombia. */
  construidoHora: string;
  /** Días desde que se construyó el archivo. */
  diasDelArchivo: number;
  /** El último día MEDIDO por horas que trae dentro. */
  medidoHasta: string;
  /** Días entre ese último día medido y hoy. */
  diasDelDato: number;
  /**
   * DE QUIÉN es el retraso — lo único que convierte dos fechas en una decisión:
   * · `al-dia`            — nada que hacer.
   * · `archivo-viejo`     — hace mucho que no se le pregunta a la fuente. NUESTRO.
   * · `fuente-atrasada`   — se preguntó hace nada y la fuente no tiene más. SUYO.
   */
  porQue: 'al-dia' | 'archivo-viejo' | 'fuente-atrasada';
}

/**
 * @param ahora se INYECTA para que esto sea puro y se pueda probar. Con `new
 *              Date()` por dentro, la prueba envejecería sola y un día se
 *              pondría roja sin que nadie tocara nada.
 */
export function frescuraDelAtlas(
  ficha: FichaAtlas, ahora: Date, zona = ZONA_ATLAS,
): FrescuraDelAtlas | null {
  const t = Date.parse(ficha.construido);
  if (Number.isNaN(t)) return null;                 // ficha sin sello: no se inventa
  const d = new Date(t);
  // `en-CA` da `AAAA-MM-DD`, que ordena solo y no depende del idioma del equipo.
  const construidoDia = d.toLocaleDateString('en-CA', { timeZone: zona });
  const construidoHora = d.toLocaleTimeString('es-CO', {
    timeZone: zona, hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const hoy = ahora.toLocaleDateString('en-CA', { timeZone: zona });
  const diasDelArchivo = Math.max(0, diasEntreIso(construidoDia, hoy));
  const medidoHasta = ficha.ultimoDiaConHoras;
  const diasDelDato = Math.max(0, diasEntreIso(medidoHasta, hoy));

  // ⚠️ EL ORDEN DE ESTAS DOS PREGUNTAS ES EL FONDO DEL ASUNTO, y al revés acusa
  // al inocente. Primero se mira el HUECO QUE YA TENÍA EL ARCHIVO CUANDO SE
  // HIZO: si al construirlo la fuente ya iba muy por detrás, ese retraso es
  // suyo y seguirá ahí por muchas veces que se reconstruya — es el caso del sol
  // y las nubes, con ~87 días. Preguntando antes por la edad del archivo, el
  // atlas solar diría «hace 12 días que no se reconstruye» a los doce días de
  // una fuente que no se mueve en tres meses: una acusación falsa que manda a
  // reconstruir algo que no puede mejorar.
  const huecoAlConstruir = diasEntreIso(medidoHasta, construidoDia);
  // El umbral del archivo es la CADENCIA del vigía con holgura: mira cada 4 h,
  // así que a los 10 días sin reconstruir, o el vigía no corre o nadie aprueba
  // lo que propone — las dos cosas son nuestras y se arreglan aquí.
  const porQue = huecoAlConstruir > 15 ? 'fuente-atrasada'
    : diasDelArchivo > 10 ? 'archivo-viejo'
      : 'al-dia';
  return { construidoDia, construidoHora, diasDelArchivo, medidoHasta, diasDelDato, porQue };
}

/** «19 de agosto de 2026», a partir de un día ISO. Sin `Date`: sin husos. */
export function diaEnPalabras(iso: string, conAnio = true): string {
  const M = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const mes = M[+iso.slice(5, 7)];
  if (!mes) return iso;
  const dia = +iso.slice(8, 10);
  return `${dia} de ${mes}${conAnio ? ' de ' + iso.slice(0, 4) : ''}`;
}
