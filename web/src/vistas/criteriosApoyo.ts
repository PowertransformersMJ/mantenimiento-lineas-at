// ============================================================================
// vistas/criteriosApoyo.ts — qué dice el sistema de UN apoyo, criterio a criterio
// ----------------------------------------------------------------------------
// QUÉ ES: la ficha de un punto mostraba hasta hoy un INVENTARIO —qué hay— y ni
// una sola evaluación. Un ingeniero abre una ficha para preguntar otra cosa: si
// lo que hay CUADRA. Este archivo baja a la escala de un apoyo los contrastes
// que el núcleo ya sabe hacer sobre la línea entera.
//
// AQUÍ NO SE EVALÚA NADA. Ni una banda de ángulos, ni una tabla de fuga, ni un
// umbral de tierra: todo eso vive en nucleo/coherencia.js y tiene UN dueño. Este
// archivo llama, traduce la respuesta a las tres palabras de la interfaz y —
// cuando no hay respuesta— escribe QUÉ falta para que la haya. El día que la
// ficha diga una cosa y la pestaña Umbrales diga otra sobre el mismo apoyo, el
// fallo no será de pantalla: será que alguien evaluó dos veces.
//
// TRES VEREDICTOS, LOS MISMOS DE nucleo/umbrales.js, y ninguno es «incumple»:
//   'cumple'       — el contraste se pudo hacer y no encontró discrepancia.
//   'revisar'      — hay algo que mirar. NO dice incumple: eso lo dictamina
//                    quien firma, con el expediente delante (CLAUDE.md §4).
//   'no_evaluable' — no hay veredicto posible, y se dice por qué. Es un HECHO
//                    sobre los datos, no un hueco de la aplicación.
//
// LOS CINCO CRITERIOS SALEN SIEMPRE, EN EL MISMO ORDEN, pase lo que pase con los
// datos — incluso sin datos. Una fila que desaparece cuando falta el dato se lee
// como «eso ya no aplica», y entonces el hueco deja de contarse. El hueco tiene
// que verse (misma regla que la tabla de umbrales).
//
// PURO: sin React, sin DOM, sin red. Se prueba con `node --test` sin navegador.
// ⚠️ Y por eso de @lineas/contratos solo se importa el TIPO: importar un VALOR
// de ese paquete (como hace planta.ts con FUNCIONES_ANCLA) arrastra su código
// TypeScript sin compilar, que el bundler resuelve pero `node --test` no —
// síntoma: ERR_MODULE_NOT_FOUND sobre `contratos/src/comunes.js` al correr las
// pruebas. Es la razón por la que el nombre visible se resuelve aquí abajo en
// vez de reusar `nombreVisible` de ./planta.
// ============================================================================
import type { Apoyo } from '@lineas/contratos';
import {
  coherenciaFuncionDeflexion,
  fugaEspecifica,
  avisoPuestaTierra,
} from '@lineas/nucleo/coherencia';
import { vanoViento } from '@lineas/nucleo/geodesia';

export type Veredicto = 'cumple' | 'revisar' | 'no_evaluable';

/**
 * @property id        identificador ESTABLE de la fila. Es con lo que la
 *                     interfaz y, mañana, el informe la referencian: no se
 *                     renombra (cambios aditivos, CLAUDE.md §3.1).
 * @property valor     lo medido, YA formateado y con su unidad, o '—'. Va como
 *                     texto y no como número porque las cinco filas hablan de
 *                     cosas distintas (grados, mm/kV, ohmios, metros): un campo
 *                     numérico obligaría a arrastrar otro con la unidad, y el
 *                     componente que lo pinta no debe tener que decidir nada.
 * @property detalle   qué pasa y qué consecuencia tiene, en castellano.
 * @property criterio  contra qué se comparó, declarado sin ambigüedad — o, si no
 *                     hay veredicto, por qué no lo hay.
 */
export interface Criterio {
  id: string;
  etiqueta: string;
  valor: string;
  veredicto: Veredicto;
  detalle: string;
  criterio: string;
}

/**
 * Lo que la ficha SABE del apoyo y el apoyo no lleva encima: la geometría se
 * deriva de las coordenadas de sus vecinos, y la tensión máxima es de la línea.
 *
 * ⚠️ `deflexion_grados` MANDA sobre el campo homónimo del apoyo, y no se usa el
 * del apoyo ni como respaldo. El campo guardado existe para AUDITAR lo que se
 * calculó aquel día (contratos/activos.ts), no para pintar hoy: si se usara de
 * respaldo, una coordenada corregida esta mañana seguiría mostrando el ángulo
 * viejo, con veredicto y todo, y nadie tendría forma de notarlo.
 */
export interface ContextoApoyo {
  deflexion_grados: number | null;
  tensionMaxima_kV?: number | null;
  vanoAnterior_m?: number | null;
  vanoSiguiente_m?: number | null;
}

// ── Forma de lo que devuelve el núcleo ──────────────────────────────────────
// Los módulos del núcleo son JavaScript con JSDoc; se declaran aquí sus formas
// para que TypeScript no las dé por `any` y una falta de ortografía en `clase`
// pase inadvertida hasta producción.
interface AvisoNucleo {
  apoyo: string;
  severidad: string;
  mensaje: string;
  criterio: string;
  clase: string;
}
interface ResultadoFuga {
  fugaTotal_mm: number;
  especifica_mm_kV: number;
  exigido_mm_kV: number;
  cumple: boolean;
}

// ── Utilidades de presentación (no calculan: visten) ────────────────────────

const SIN_VALOR = '—';

const num = (x: unknown): number | null =>
  typeof x === 'number' && Number.isFinite(x) ? x : null;

/** Un valor que además tiene que ser positivo: un vano de 0 m no es un vano. */
const pos = (x: unknown): number | null => {
  const n = num(x);
  return n !== null && n > 0 ? n : null;
};

/**
 * Formato con coma decimal SIN pasar por `toLocaleString`: ese depende del ICU
 * del entorno, y haría que la misma entrada produjera un texto en la Mac del
 * Ingeniero y otro en el CI. Un veredicto no puede depender de eso.
 */
const fmt = (v: number, d = 1): string => v.toFixed(d).replace('.', ',');
const conUnidad = (v: number, unidad: string, d = 1): string => `${fmt(v, d)} ${unidad}`;
const grados = (v: number): string => `${fmt(v, 1)}°`;

/** Enumera lo que falta en castellano: «a, b y c». */
const enumerar = (xs: string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`;

/** El mismo nombre que muestra el resto de la interfaz (ver ⚠️ de la cabecera). */
const nombreVisible = (a: Partial<Apoyo>): string =>
  a.nombreNormalizado ?? a.nombreCampo ?? 'este punto';

// ── Criterios declarados ────────────────────────────────────────────────────
// Se escriben una vez, con nombre, para que el revisor los DISCUTA en vez de
// tener que descubrirlos leyendo código.

/**
 * Ojo a lo que este texto NO hace: repetir los ángulos de corte (3°/15°/30°).
 * Esas fronteras deciden dónde se parte cada tramo de tensión y por tanto TODO
 * el cálculo mecánico; copiarlas aquí crearía un segundo dueño, y el día que se
 * ajusten en el núcleo la ficha seguiría enseñando los viejos con cara de
 * autoridad. Cuando hay discrepancia, el criterio que se muestra es el que
 * escribe el propio núcleo en su aviso, con sus números.
 */
const CRITERIO_FUNCION =
  'CRITERIO DE DISEÑO (sin norma citada), heredado del módulo de campo original y ' +
  'registrado en docs/40 §8.2: la función estructural mínima exigible la fija la banda ' +
  'de deflexión. Las fronteras viven en nucleo/coherencia.js y solo allí.';

const CRITERIO_FUGA =
  'IEC TS 60815 — distancia de fuga específica de referencia según el nivel de ' +
  'contaminación del sitio, sobre base FASE-FASE para poder compararla con Um. ' +
  'VALORES TRANSCRITOS, NO VERIFICADOS CONTRA EL TEXTO DE LA NORMA: comprobar antes de firmar.';

/**
 * El umbral se pasa EXPLÍCITO al núcleo en vez de dejarle su valor por defecto.
 * Motivo: cuando el apoyo cumple, el núcleo no devuelve nada y el texto del
 * criterio lo escribe esta vista; si cada uno llevara su propia cifra, un apoyo
 * a 10 Ω y otro a 12 Ω acabarían citando umbrales distintos en la misma pantalla.
 *
 * PENDIENTE declarado: un tope de diseño es una decisión de ingeniería fechada y
 * su sitio es la hipótesis (que se versiona y se congela al firmar), no una
 * constante de programa. Mientras la hipótesis no lo traiga, manda este 10 Ω.
 */
const UMBRAL_TIERRA_OHM = 10;

const CRITERIO_TIERRA =
  `CRITERIO DE DISEÑO (sin norma citada): resistencia de puesta a tierra ≤ ${UMBRAL_TIERRA_OHM} Ω. ` +
  'Umbral configurable — el valor firme lo fija la hipótesis del proyecto.';

const CRITERIO_VANO_VIENTO =
  'Sin umbral, a propósito: el vano viento (semisuma de los vanos adyacentes) es una ' +
  'ENTRADA del cálculo de carga transversal, no un criterio de aceptación. Se muestra ' +
  'porque explica por qué dos apoyos vecinos reciben cargas de viento distintas.';

const CRITERIO_VANO_PESO =
  'No hay criterio que aplicar mientras no exista el dato: el vano peso exige la cota del ' +
  'PUNTO DE SUJECIÓN del conductor en tres apoyos consecutivos, y la altimetría de este ' +
  'levantamiento es GPS de mano (± 8 m). Ver docs/40 §8.';

/**
 * Clases de aviso del núcleo que NO son un veredicto: son la declaración de que
 * no se pudo juzgar. Se mapean por CLASE y no por severidad a propósito — una
 * deflexión de 200° llega como «advertencia» y aun así no es un veredicto sobre
 * el apoyo, sino una denuncia del dato.
 */
const CLASES_SIN_VEREDICTO = new Set(['deflexion_no_evaluable', 'funcion_no_declarada']);

/**
 * Bordes sintéticos para poder preguntarle al núcleo por UN apoyo.
 *
 * `coherenciaFuncionDeflexion` razona sobre la LÍNEA: recorre el arreglo en
 * orden y CALLA en el primer y el último apoyo, porque allí la deflexión es null
 * por definición y avisar produciría ruido garantizado en toda línea. Aquí solo
 * hay un apoyo y su contexto, así que se le pone un borde a cada lado y queda en
 * el interior, que es donde el criterio sí se aplica.
 *
 * Los bordes son Terminal con deflexión nula: por construcción no generan ni un
 * aviso. Aun así los avisos se filtran por nombre — si mañana el núcleo cambiara
 * de criterio sobre los extremos, la ficha de un apoyo no debe llegar a mostrar
 * el hallazgo de su vecino. Los nombres llevan comillas angulares porque ningún
 * GPS graba eso: no pueden colisionar con un nombre real.
 */
const BORDE_ANTERIOR = '«borde anterior»';
const BORDE_SIGUIENTE = '«borde siguiente»';
const borde = (nombre: string) => ({
  nombre,
  funcionEstructural: 'Terminal',
  deflexion_grados: null,
  tipoPunto: 'Estructura',
});

// ════════════════════════════════════════════════════════════════════════════
// LA FUNCIÓN PÚBLICA
// ════════════════════════════════════════════════════════════════════════════

/**
 * Los criterios evaluables de un apoyo, para su ficha.
 *
 * Acepta `null` en ambos argumentos a propósito: una ficha a medio cargar debe
 * enseñar cinco «no evaluable» con su motivo, no tumbar la pestaña entera.
 */
export function criteriosDeApoyo(
  apoyo: Apoyo | null | undefined,
  contexto: ContextoApoyo | null | undefined,
): Criterio[] {
  const a = (apoyo ?? {}) as Partial<Apoyo>;
  const c: ContextoApoyo = contexto ?? { deflexion_grados: null };
  const nombre = nombreVisible(a);

  // ⚠️ EL MISMO FILTRO QUE GOBIERNA TODO EL CÁLCULO: un empalme no es un apoyo.
  // No sostiene el conductor, no tiene función estructural que contrastar ni
  // puesta a tierra que medir. Si esto faltara, el criterio de tierra saldría
  // «cumple» en cada empalme de la línea — porque el núcleo, que también los
  // filtra, devuelve lista vacía, y una lista vacía leída sin cuidado se lee
  // como conformidad. Es el peor error posible aquí: un verde inventado.
  const tipo = a.tipoPunto ?? 'Estructura';
  if (tipo !== 'Estructura') return noAplicaPorTipo(tipo);

  return [
    criterioFuncion(a, c, nombre),
    criterioFuga(a, c),
    criterioTierra(a, nombre),
    criterioVanoViento(c),
    criterioVanoPeso(),
  ];
}

// ════════════════════════════════════════════════════════════════════════════
// 1 · FUNCIÓN ESTRUCTURAL DECLARADA vs DEFLEXIÓN MEDIDA
// ════════════════════════════════════════════════════════════════════════════

function criterioFuncion(a: Partial<Apoyo>, c: ContextoApoyo, nombre: string): Criterio {
  const id = 'funcion_vs_deflexion';
  const etiqueta = 'Función estructural frente a la deflexión';
  const funcion = a.funcionEstructural;
  const d = num(c.deflexion_grados);

  // Sin deflexión hay TRES historias distintas, y confundirlas cuesta caro
  // porque cada una manda a una persona a un sitio diferente:
  //   · un vano a cada lado → falta la coordenada de un vecino: es un hueco de
  //     datos, y se arregla en el gabinete;
  //   · exactamente un vano → el punto es extremo de línea: no hay giro que
  //     medir y NADIE tiene que ir a corregir nada;
  //   · ningún vano → no se sabe ni dónde está el punto en la línea.
  //
  // ⚠️ La tercera es la que obliga a escribir esto así. Deducir «es extremo» de
  // que falte UN vano es correcto; deducirlo de que falten LOS DOS es inventar:
  // un apoyo de mitad de línea al que la ficha aún no le pasó la geometría
  // aparecería declarado terminal, con su explicación y todo. Una afirmación
  // falsa y tranquilizadora es peor que un hueco, que es la regla de la casa.
  if (d === null) {
    const lados = (pos(c.vanoAnterior_m) === null ? 0 : 1) + (pos(c.vanoSiguiente_m) === null ? 0 : 1);
    const detalle =
      lados === 2
        ? `${nombre} no tiene deflexión calculada aunque se conocen sus dos vanos: falta la coordenada del apoyo anterior o del siguiente. Sin ese ángulo, su función declarada no se puede contrastar con nada.`
        : lados === 1
          ? `${nombre} es extremo de la línea: solo tiene conductor a un lado, así que no hay giro que medir y su función no se contrasta contra ningún ángulo. En un terminal o una derivación la función la explica la topología, no la geometría.`
          : `De ${nombre} no se conoce ni la deflexión ni ninguno de sus dos vanos, así que no se puede afirmar siquiera si es extremo de línea o punto intermedio. Sin geometría alrededor no hay nada contra qué contrastar su función.`;
    return { id, etiqueta, valor: SIN_VALOR, veredicto: 'no_evaluable', criterio: CRITERIO_FUNCION, detalle };
  }

  const avisos = (coherenciaFuncionDeflexion([
    borde(BORDE_ANTERIOR),
    { nombre, funcionEstructural: funcion, deflexion_grados: d, tipoPunto: 'Estructura' },
    borde(BORDE_SIGUIENTE),
  ]) as AvisoNucleo[]).filter((v) => v.apoyo === nombre);

  const valor = funcion ? `${grados(d)} · «${funcion}»` : grados(d);
  const v = avisos[0];

  if (!v) {
    return {
      id, etiqueta, valor, veredicto: 'cumple', criterio: CRITERIO_FUNCION,
      detalle: `La función declarada «${funcion}» es la que el criterio pide para ${grados(d)} de deflexión. Ojo con lo que esto NO dice: es una afirmación sobre el ÁNGULO, no sobre el estado del apoyo, su cimentación ni sus herrajes.`,
    };
  }

  return {
    id, etiqueta, valor,
    veredicto: CLASES_SIN_VEREDICTO.has(v.clase) ? 'no_evaluable' : 'revisar',
    // El criterio que se muestra es el del propio núcleo: trae los ángulos de
    // corte con los que se juzgó, que es justo lo que esta vista no copia.
    criterio: v.criterio,
    detalle: v.mensaje,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · DISTANCIA DE FUGA ESPECÍFICA (mm/kV)
// ════════════════════════════════════════════════════════════════════════════

function criterioFuga(a: Partial<Apoyo>, c: ContextoApoyo): Criterio {
  const id = 'fuga_especifica';
  const etiqueta = 'Distancia de fuga específica de la cadena';
  const ais = a.aislamiento;
  const unidades = pos(ais?.unidadesPorCadena);
  const fugaUnidad = pos(ais?.fugaPorUnidad_mm);
  const nivel = ais?.nivelContaminacion ?? null;
  const um = pos(c.tensionMaxima_kV);

  // Hoy esto sale «no evaluable» en casi toda la línea, y es lo esperado: el
  // inventario del aislamiento se captura en campo (F4). Se dice QUÉ falta, uno
  // por uno, porque «no evaluable» sin motivo es indistinguible de un error.
  if (unidades === null || fugaUnidad === null || nivel === null || um === null) {
    const faltan: string[] = [];
    if (unidades === null) faltan.push('las unidades por cadena');
    if (fugaUnidad === null) faltan.push('la fuga por unidad del aislador (mm)');
    if (nivel === null) faltan.push('el nivel de contaminación del sitio');
    if (um === null) faltan.push('la tensión máxima de operación de la línea (kV)');
    return {
      id, etiqueta, valor: SIN_VALOR, veredicto: 'no_evaluable', criterio: CRITERIO_FUGA,
      detalle: `Falta ${enumerar(faltan)}. Con un dato menos no hay resultado: rellenarlo con un valor típico convertiría este renglón en un «cumple» inventado, y en la costa una cadena corta no falla por rotura sino por contorneo con niebla salina — sin rastro visible en la inspección diurna.`,
    };
  }

  const r = fugaEspecifica({
    unidades, fugaPorUnidad_mm: fugaUnidad, tensionMaxima_kV: um, nivelContaminacion: nivel,
  }) as ResultadoFuga | null;

  // El núcleo devuelve null también cuando el nivel declarado no está en su
  // tabla: no aproxima «Medio-alto» a «Medio», y esta vista tampoco.
  if (!r) {
    return {
      id, etiqueta, valor: SIN_VALOR, veredicto: 'no_evaluable', criterio: CRITERIO_FUGA,
      detalle: `El nivel de contaminación declarado («${nivel}») no está en la tabla del núcleo, y no se aproxima al más parecido: aproximarlo sería una suposición silenciosa que después nadie encuentra.`,
    };
  }

  // DOS decimales, y no uno, en todo lo que sea mm/kV. Con una sola décima, una
  // cadena que se queda a 0,02 mm/kV del criterio se imprime «12,7 · exigido
  // 12,7» y al lado el sello «revisar»: el renglón se contradice a sí mismo a la
  // vista y quien lo lee concluye que el que falla es el programa.
  const MM_KV = 2;
  const deficit_mm_kV = r.exigido_mm_kV - r.especifica_mm_kV;

  return {
    id, etiqueta,
    valor: `${conUnidad(r.especifica_mm_kV, 'mm/kV', MM_KV)} · exigido ${conUnidad(r.exigido_mm_kV, 'mm/kV', MM_KV)}`,
    veredicto: r.cumple ? 'cumple' : 'revisar',
    criterio: CRITERIO_FUGA,
    detalle: r.cumple
      ? `${unidades} unidades × ${fmt(fugaUnidad, 0)} mm = ${conUnidad(r.fugaTotal_mm, 'mm', 0)} de fuga sobre ${conUnidad(um, 'kV')}. Alcanza para un sitio de contaminación «${nivel}», pero cumplir por décimas no es cumplir con margen: el envejecimiento del vidrio y el depósito salino solo restan.`
      // El déficit se redondearía a «faltan 0,00 mm/kV» justo en el filo, que es
      // el peor texto posible: un incumplimiento que se lee como error de
      // programa se descarta, y ese es precisamente el caso que más margen
      // pierde con el tiempo. Ahí se dice con palabras, no con un cero.
      : `${unidades} unidades × ${fmt(fugaUnidad, 0)} mm dan ${conUnidad(r.especifica_mm_kV, 'mm/kV', MM_KV)} y un sitio «${nivel}» pide ${conUnidad(r.exigido_mm_kV, 'mm/kV', MM_KV)}: ${
          deficit_mm_kV < 0.005
            ? 'queda por debajo del criterio por un margen inapreciable — está en el filo, y el filo solo se mueve hacia abajo con el tiempo'
            : `faltan ${conUnidad(deficit_mm_kV, 'mm/kV', MM_KV)}`
        }. Es la cadena la que decide si la línea aguanta una brisa con niebla salina; el contorneo no deja marca que se vea de día.`,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · RESISTENCIA DE PUESTA A TIERRA
// ════════════════════════════════════════════════════════════════════════════

function criterioTierra(a: Partial<Apoyo>, nombre: string): Criterio {
  const id = 'puesta_tierra';
  const etiqueta = 'Resistencia de puesta a tierra';
  const r = num(a.puestaTierra?.resistencia_ohm);

  const avisos = avisoPuestaTierra(
    [{ nombre, tipoPunto: 'Estructura', puestaTierra: { resistencia_ohm: r ?? undefined } }],
    UMBRAL_TIERRA_OHM,
  ) as AvisoNucleo[];
  const v = avisos[0];

  // ⚠️ Lista vacía = medido y dentro del umbral, PERO solo porque arriba se
  // garantizó que esto es una estructura: el núcleo filtra empalmes y a un
  // empalme también le devolvería lista vacía. Leer eso como «cumple» sería
  // certificar una puesta a tierra que no existe.
  if (!v) {
    return {
      id, etiqueta, valor: conUnidad(r ?? 0, 'Ω'), veredicto: 'cumple', criterio: CRITERIO_TIERRA,
      detalle: `Medida y dentro del criterio adoptado (≤ ${UMBRAL_TIERRA_OHM} Ω). Es el valor que decide si una descarga se drena al terreno o eleva el potencial de la estructura hasta cebar el arco hacia el conductor.`,
    };
  }

  return {
    id, etiqueta,
    valor: r === null ? SIN_VALOR : conUnidad(r, 'Ω'),
    // «sin medir» no es un veredicto: es la ausencia de uno. Un apoyo sin
    // medición NO es un apoyo que cumple — es un apoyo del que no se sabe nada.
    veredicto: v.clase === 'sin_medir' ? 'no_evaluable' : 'revisar',
    criterio: v.criterio,
    detalle: v.mensaje,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 4 · VANO VIENTO (informativo: no hay umbral que aplicar)
// ════════════════════════════════════════════════════════════════════════════

function criterioVanoViento(c: ContextoApoyo): Criterio {
  const id = 'vano_viento';
  const etiqueta = 'Vano viento del apoyo';
  const va = pos(c.vanoAnterior_m);
  const vs = pos(c.vanoSiguiente_m);

  if (va === null && vs === null) {
    return {
      id, etiqueta, valor: SIN_VALOR, veredicto: 'no_evaluable', criterio: CRITERIO_VANO_VIENTO,
      detalle: 'No se conoce ninguno de los dos vanos adyacentes: sin ellos no hay semisuma que calcular.',
    };
  }

  const v = vanoViento(va, vs) as number;
  const soloUnLado = va === null || vs === null;

  return {
    id, etiqueta, valor: conUnidad(v, 'm'),
    // Hay número y aun así no hay veredicto, y no es una contradicción: lo que
    // no es evaluable es el CRITERIO, porque no existe umbral contra el cual
    // juzgarlo. Misma convención que la tabla de umbrales con comparador
    // 'ninguno'. Pintarlo verde afirmaría un cumplimiento que nadie ha definido.
    veredicto: 'no_evaluable',
    criterio: CRITERIO_VANO_VIENTO,
    detalle: soloUnLado
      ? `Semisuma de los vanos adyacentes. En un extremo de línea solo hay conductor a un lado, así que el vano viento es la mitad del único vano contiguo: ${conUnidad(v, 'm')}. La carga longitudinal de ese apoyo, en cambio, es la mayor de la línea — pero eso no lo mide este renglón.`
      : `Semisuma de los vanos adyacentes: la superficie de conductor cuyo viento carga sobre este apoyo. Dos apoyos vecinos con vanos muy distintos reciben cargas transversales muy distintas, y esto es lo que lo explica.`,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 5 · VANO PESO — 'no evaluable' SIEMPRE, y por una razón física
// ════════════════════════════════════════════════════════════════════════════

/**
 * Este renglón no depende de los datos del apoyo: sale «no evaluable» aunque
 * lleguen todos. No es un pendiente de programación — la fórmula ya existe en
 * nucleo/mecanica.js (`vanoPeso`) y funciona. Lo que no existe es el DATO con la
 * precisión que el resultado exige, y ninguna cantidad de código lo fabrica.
 *
 * Por eso ni siquiera se llama a `vanoPeso`: llamarla con cotas de GPS
 * devolvería un número, y un número devuelto es un número que alguien firma.
 */
function criterioVanoPeso(): Criterio {
  return {
    id: 'vano_peso',
    etiqueta: 'Vano peso del apoyo',
    valor: SIN_VALOR,
    veredicto: 'no_evaluable',
    criterio: CRITERIO_VANO_PESO,
    detalle:
      'No se calcula, y no por falta de programa: el vano peso es el vano viento corregido por ' +
      '(H/w)·(h₁/a₁ − h₂/a₂), donde h son diferencias entre cotas del PUNTO DE SUJECIÓN del ' +
      'conductor, no del terreno. La altimetría de este levantamiento es GPS de mano (± 8 m) y ' +
      'la cota del punto de sujeción no se levantó. Para dar el orden del error: con un parámetro ' +
      'C = H/w del orden de 1 800 m y vanos de 300 m, equivocar 8 m UNA cota mueve el vano peso ' +
      'unos 48 m — y puede cambiarle el signo a la corrección, que es lo grave: convertiría un ' +
      'apoyo normal en uno con arrancamiento, o escondería uno que sí lo tiene. Se destraba con ' +
      'topografía o LiDAR sobre el punto de sujeción, no con más código.',
  };
}

// ════════════════════════════════════════════════════════════════════════════
// PUNTOS QUE NO SON APOYOS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Un empalme o un punto de referencia conserva sus cinco renglones —la lista no
 * cambia de forma según el punto— pero ninguno tiene veredicto, y el motivo es
 * el mismo: ese punto no sostiene el conductor.
 */
function noAplicaPorTipo(tipo: string): Criterio[] {
  const porQue = `Este punto está declarado «${tipo}»: no sostiene el conductor.`;
  const filas: Array<[string, string, string, string]> = [
    ['funcion_vs_deflexion', 'Función estructural frente a la deflexión',
      'no tiene función estructural que contrastar, y su posición puede estar a mitad de vano.', CRITERIO_FUNCION],
    ['fuga_especifica', 'Distancia de fuga específica de la cadena',
      'no lleva cadena de aisladores.', CRITERIO_FUGA],
    ['puesta_tierra', 'Resistencia de puesta a tierra',
      'no tiene puesta a tierra que medir. Que no aparezca ningún aviso NO significa que cumpla.', CRITERIO_TIERRA],
    ['vano_viento', 'Vano viento del apoyo',
      'no recibe carga de viento del conductor: no interrumpe el vano.', CRITERIO_VANO_VIENTO],
    ['vano_peso', 'Vano peso del apoyo',
      'no soporta peso de conductor.', CRITERIO_VANO_PESO],
  ];
  return filas.map(([id, etiqueta, cola, criterio]) => ({
    id, etiqueta, valor: SIN_VALOR, veredicto: 'no_evaluable' as const,
    detalle: `${porQue} Por eso ${cola}`,
    criterio,
  }));
}
