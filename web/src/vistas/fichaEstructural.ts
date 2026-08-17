// ============================================================================
// vistas/fichaEstructural.ts — la ficha de un apoyo: qué se pide, qué se
// rechaza y qué veredictos se mueven al guardarla
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. Los apoyos de la línea tienen CERO veredictos —ni de lado ni a
// lo largo— y no es un fallo del cálculo: el motor sabe dictaminar desde hace
// meses y lo que falta es POR DÓNDE METER EL DATO (`docs/05`, TODO-57). Este
// módulo es la mitad pensante de esa entrada: dice qué seis campos hacen falta,
// qué desbloquea cada uno, cuándo la geometría declarada no puede dar veredicto,
// y qué cambia en el TRAMO ENTERO si se guarda.
//
// PURO: sin React, sin DOM, sin red y sin base de datos. Se prueba con
// `node --test` y mundo sintético. La pantalla (`FichaEditor.tsx`) pinta lo que
// esto devuelve; el guardado (`datos/firestore.ts`) rechaza con lo que esto
// dice. Ninguno de los dos vuelve a escribir estas reglas.
//
// AQUÍ NO SE EVALÚA NADA. El veredicto lo dictan `nucleo/cargas.js` y
// `nucleo/longitudinal.js` a través de `cargasParaPantalla` y
// `longitudinalParaPantalla`; este archivo llama, compara y traduce. Copiar aquí
// una fórmula del núcleo sería el fallo que este proyecto ya tiene documentado:
// dos dueños de la misma regla que empiezan iguales y terminan distintos.
//
// ⚠️ Solo se importa de otras vistas puras y de `@lineas/nucleo/*` (JavaScript).
// NADA de `./planta` ni de `./tramos` en tiempo de ejecución, y de
// `@lineas/contratos` SOLO TIPOS (se borran al compilar): su paquete apunta a
// TypeScript sin compilar, que el bundler resuelve y `node --test` no. Una vista
// que no se puede probar sin navegador acaba sin pruebas.
// ============================================================================
// ⚠️ Los relativos llevan `.ts` A PROPÓSITO: `node --test` corre estas vistas
// SIN compilar y no resuelve extensiones, así que un import sin `.ts` deja el
// módulo sin pruebas (el `tsconfig` de la web ya lo permite, y Vite lo acepta).
import { cargasParaPantalla } from './cargasDatos.ts';
import type { CargasEnPantalla, TramoParaCargas } from './cargasDatos.ts';
import { longitudinalParaPantalla } from './longitudinalDatos.ts';
import type { LongitudinalEnPantalla } from './longitudinalDatos.ts';
import type { Apoyo, Conductor, FichaEstructural, Hipotesis, SelloDeDato } from '@lineas/contratos';

// ════════════════════════════════════════════════════════════════════════════
// 1 · QUÉ SE PIDE, Y POR QUÉ SE PIDE
// ════════════════════════════════════════════════════════════════════════════

/** De dónde llega el dato de verdad. Gobierna cómo se agrupa el formulario. */
export type BloqueDeFicha = 'se_mide_en_sitio' | 'lo_dice_el_papel' | 'se_cuenta_mirando';

export interface CampoDeFicha {
  clave: 'alturaLibre_m' | 'alturaAplicacion_m' | 'cargaRotura_kgf'
    | 'capacidadLongitudinal' | 'nFasesAmarradas' | 'tipoApoyo';
  /** Como lo ve el Ingeniero. Nunca el nombre del campo. */
  etiqueta: string;
  /** Unidad, o `null` si no la tiene (un tipo de apoyo no se mide en metros). */
  unidad: string | null;
  /** Qué es, en una línea. */
  queEs: string;
  /**
   * QUÉ DESBLOQUEA. Es la única razón por la que este campo está en la lista:
   * los seis entran porque sin ellos un apoyo no puede tener veredicto — leído
   * en el motor, no supuesto.
   */
  queDesbloquea: string;
  bloque: BloqueDeFicha;
  /**
   * Si el dato es propiedad del MODELO del apoyo (y por tanto se puede aplicar a
   * un lote que comparte documento) o del EJEMPLAR plantado en ese terreno.
   *
   * ⚠️ El corte NO es por comodidad. El propio contrato dice por qué:
   * el empotramiento depende del terreno y no se ve desde un escritorio, y «un
   * terminal amarra todas las fases; un apoyo de paso puede amarrar ninguna».
   * Copiar por lote un dato del ejemplar es la forma más rápida que existe de
   * llenar el sistema de números que PARECEN medidos.
   */
  porLote: boolean;
}

/**
 * LOS SEIS CAMPOS DE ESTA OLA. Ni uno más.
 *
 * Cinco desbloquean veredicto por sí solos y el sexto —`tipoApoyo`— entra porque
 * es la clave por la que se agrupa un lote: una carga de rotura aplicada a un
 * lote sin saber de qué está hecho el apoyo no tiene criterio defendible
 * (concreto y torreta no comparten ensayo).
 *
 * QUEDAN FUERA, con motivo: `altura_m` (no desbloquea nada y es justo el campo
 * que se confunde con la altura libre — se sigue MOSTRANDO, en gris),
 * `cotaSujecion_m` (alimenta el vano peso, que es deuda declarada sin
 * contrastar), `anioInstalacion` y `codigoInventario` (administrativos),
 * `aislamiento` y `puestaTierra` (dan veredicto de otra familia: ola 2),
 * `condicion` (es un hecho fechado de una inspección, no una propiedad que se
 * sobrescribe) y `funcionEstructural` (corta tramos: merece su propia ola con su
 * propio antes/después).
 */
export const CAMPOS_DE_FICHA: readonly CampoDeFicha[] = Object.freeze([
  {
    clave: 'alturaLibre_m',
    etiqueta: 'Altura libre sobre el terreno',
    unidad: 'm',
    queEs: 'La parte del apoyo que sobresale del empotramiento. No es la altura total del poste, '
      + 'y no se saca de ella: el empotramiento depende del terreno.',
    queDesbloquea: 'Sin ella, este apoyo no puede tener veredicto de carga de lado.',
    bloque: 'se_mide_en_sitio',
    porLote: false,
  },
  {
    clave: 'alturaAplicacion_m',
    etiqueta: 'Altura del amarre del conductor',
    unidad: 'm',
    queEs: 'A qué altura sobre el terreno amarra el conductor. Lo que rompe un apoyo es el '
      + 'momento, no la fuerza.',
    queDesbloquea: 'Este dato desbloquea los DOS veredictos: el de lado y el de a lo largo.',
    bloque: 'se_mide_en_sitio',
    porLote: false,
  },
  {
    clave: 'cargaRotura_kgf',
    etiqueta: 'Carga de rotura en la punta',
    unidad: 'kgf',
    queEs: 'El ensayo del fabricante, empujando de lado y en la punta.',
    queDesbloquea: 'Desbloquea el veredicto de carga de lado. No se estima nunca.',
    bloque: 'lo_dice_el_papel',
    porLote: true,
  },
  {
    clave: 'capacidadLongitudinal',
    etiqueta: 'Capacidad a lo largo de la línea',
    unidad: 'kgf',
    queEs: 'Cuánto aguanta el apoyo en el eje de la línea, qué ES ese número (rotura, admisible '
      + 'o de diseño), a qué altura vale y de dónde sale.',
    queDesbloquea: 'Los cuatro juntos o ninguno: entre carga de rotura y carga admisible hay el '
      + 'doble de margen, y sin decir cuál es no hay veredicto.',
    bloque: 'lo_dice_el_papel',
    porLote: true,
  },
  {
    clave: 'nFasesAmarradas',
    etiqueta: 'Conductores que amarran aquí',
    unidad: null,
    queEs: 'Las fases y, si lo lleva, el cable de guarda.',
    queDesbloquea: 'Sin este número no hay carga total, y sin total no hay contra qué comparar '
      + 'la capacidad.',
    bloque: 'se_cuenta_mirando',
    porLote: false,
  },
  {
    clave: 'tipoApoyo',
    etiqueta: 'Tipo de apoyo',
    unidad: null,
    queEs: 'De qué está hecho: concreto, metálico, madera, torre, torreta.',
    queDesbloquea: 'No da veredicto por sí solo: es la clave por la que se agrupa un lote, y sin '
      + 'él una carga de rotura aplicada a varios apoyos no tiene criterio defendible.',
    bloque: 'lo_dice_el_papel',
    porLote: true,
  },
]);

/** Los tres bloques del formulario, con la pregunta que sella cada uno de un gesto. */
export const BLOQUES_DE_FICHA: readonly { bloque: BloqueDeFicha; titulo: string; pregunta: string }[] = Object.freeze([
  { bloque: 'se_mide_en_sitio', titulo: 'Lo que se mide en el sitio', pregunta: 'Todo esto, ¿de dónde salió?' },
  { bloque: 'lo_dice_el_papel', titulo: 'Lo que dice la placa o el plano', pregunta: 'Todo esto, ¿de dónde salió?' },
  { bloque: 'se_cuenta_mirando', titulo: 'Lo que se cuenta mirando el apoyo', pregunta: 'Esto, ¿de dónde salió?' },
]);

/**
 * LOS CUATRO ORÍGENES QUE SE PUEDEN ELEGIR AL ESCRIBIR. Nada preseleccionado: el
 * selector arranca VACÍO, porque un valor por defecto en un campo de origen es
 * una firma que nadie puso.
 *
 * `confirmado_humano` NO está, y no es un olvido: confirmar no es un origen, es
 * un ACTO POSTERIOR sobre un dato que ya está. Va como segundo gesto en la
 * ficha, y `FichaEstructural` rechaza el parche que lo traiga.
 */
export const ORIGENES_DE_FICHA: readonly { valor: string; etiqueta: string; aviso: string | null }[] = Object.freeze([
  { valor: 'levantamiento_campo', etiqueta: 'Lo medí en el sitio', aviso: null },
  { valor: 'catalogo_fabricante', etiqueta: 'Lo dice la placa del apoyo', aviso: null },
  { valor: 'documento_proyecto', etiqueta: 'Lo dice un plano o un acta de montaje', aviso: null },
  {
    valor: 'supuesto',
    etiqueta: 'Lo estimé a ojo',
    aviso: 'Queda marcado como supuesto. El veredicto saldrá igual, y saldrá diciendo que se '
      + 'calculó sobre un supuesto.',
  },
]);

/**
 * El origen, dicho como lo diría el Ingeniero. Un solo dueño para la pantalla y
 * para el acuse de guardado: si el acuse dijera `catalogo_fabricante` y la
 * pantalla «lo dice la placa», parecerían dos cosas distintas.
 */
export function etiquetaDeOrigen(valor: string | null | undefined): string {
  const x = ORIGENES_DE_FICHA.find((o) => o.valor === valor);
  if (x) return x.etiqueta;
  if (valor === 'confirmado_humano') return 'Confirmado personalmente';
  return valor ?? 'origen no declarado';
}

/** Los tres campos que SÍ se pueden aplicar a un lote: son del modelo, no del ejemplar. */
export const CAMPOS_POR_LOTE: readonly string[] = Object.freeze(
  CAMPOS_DE_FICHA.filter((c) => c.porLote).map((c) => c.clave),
);

/**
 * La frase que va, en gris permanente, debajo de cualquier lote. No es
 * decoración: es la salvaguarda que impide que el lote se convierta en la
 * herramienta que llena la base de datos que parecen medidos.
 */
export const POR_QUE_NO_TODO_VA_POR_LOTE =
  'La altura libre, la altura del amarre y los conductores que amarran NO se aplican por lote: '
  + 'dependen del terreno y de qué hace ese apoyo en la línea. Se ponen uno a uno.';

// ════════════════════════════════════════════════════════════════════════════
// 2 · LA GEOMETRÍA QUE NO PUEDE DAR VEREDICTO
// ════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ ESTE ES EL ÚNICO DUEÑO DE LA REGLA DE GEOMETRÍA EN LA MITAD DE PANTALLA.
 *
 * `nucleo/longitudinal.js` devuelve `null` EN SILENCIO en estos tres casos, y
 * `nucleo/cargas.js` hace lo propio con el primero. Sin este aviso el Ingeniero
 * podría declarar cuatro números impecables, no ver ningún veredicto y concluir
 * que la herramienta está rota — cuando lo que pasa es que la geometría que
 * declaró no existe.
 *
 * La regla vive AQUÍ y en el núcleo, y punto: `tests/ficha-estructural.test.js`
 * comprueba que las dos dicen lo mismo, llamando al núcleo de verdad. Si alguna
 * vez divergen, la pantalla diría que el dato vale y el motor seguiría sin dar
 * veredicto — y eso parece una avería de la aplicación.
 *
 * NO se comprueba en el molde del contrato a propósito: un parche que solo trae
 * el amarre no puede juzgar su geometría sin ver el apoyo que ya está guardado.
 * Aquí se le pasa el apoyo COMPLETO —el de la base con el parche encima—, que es
 * exactamente lo que verá el núcleo.
 */
export interface AvisoDeGeometria {
  /** El campo que el Ingeniero tendría que mover para arreglarlo. */
  clave: string;
  mensaje: string;
}

const num = (x: unknown): number | null =>
  (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null);

const m = (x: number): string => x.toFixed(2).replace('.', ',');

export function revisarGeometria(a: Partial<Apoyo> | null | undefined): AvisoDeGeometria[] {
  const avisos: AvisoDeGeometria[] = [];
  const hLibre = num(a?.alturaLibre_m);
  const hApl = num(a?.alturaAplicacion_m);
  const hRef = num(a?.capacidadLongitudinal?.alturaReferencia_m);

  // 1 · nada se cuelga por encima de la punta (`nucleo/cargas.js:314` y
  //     `nucleo/longitudinal.js:661`: amarre por encima de la punta → null).
  if (hLibre !== null && hApl !== null && hApl > hLibre) {
    avisos.push({
      clave: 'alturaAplicacion_m',
      mensaje: `Con estos números no va a salir veredicto: el amarre (${m(hApl)} m) queda por `
        + `encima de la punta del apoyo (${m(hLibre)} m). Con esa geometría el cálculo del momento `
        + 'no significa nada.',
    });
  }

  // 2 · la capacidad tampoco puede estar referida por encima de la punta
  //     (`nucleo/longitudinal.js:662`).
  if (hLibre !== null && hRef !== null && hRef > hLibre) {
    avisos.push({
      clave: 'capacidadLongitudinal',
      mensaje: `Con estos números no va a salir veredicto: la capacidad está referida a `
        + `${m(hRef)} m, por encima de la punta del apoyo (${m(hLibre)} m).`,
    });
  }

  // 3 · el amarre no puede quedar por encima de la altura a la que vale la
  //     capacidad: darle número exigiría extrapolar la capacidad HACIA ARRIBA, y
  //     el núcleo se niega — con razón (`nucleo/longitudinal.js:665`).
  if (hRef !== null && hApl !== null && hApl > hRef) {
    avisos.push({
      clave: 'capacidadLongitudinal',
      mensaje: `Con estos números no va a salir veredicto: el amarre (${m(hApl)} m) queda por `
        + `encima de la altura a la que vale la capacidad (${m(hRef)} m). Subir la capacidad hasta `
        + 'el amarre sería inventarse resistencia que nadie ensayó.',
    });
  }

  return avisos;
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · APLICAR LA FICHA A UN APOYO (sin escribir nada)
// ════════════════════════════════════════════════════════════════════════════

/**
 * El apoyo con la ficha encima. Puro: devuelve una copia y no toca el original.
 *
 * Los sellos se FUNDEN con los que el apoyo ya tenía, campo a campo: guardar la
 * altura libre no puede borrar el sello de la carga de rotura que alguien
 * declaró el mes pasado.
 *
 * ⚠️ Un campo ausente en la ficha se queda como estaba. NADA se rellena por
 * defecto y NINGÚN cero se inventa: un campo vacío es «no declarado», y un cero
 * se leería como una medida.
 */
export function aplicarFicha(apoyo: Apoyo, ficha: FichaEstructural): Apoyo {
  const { procedencias, ...valores } = (ficha ?? {}) as Record<string, unknown>;
  const limpios: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(valores)) {
    if (v !== undefined) limpios[k] = v;
  }
  const sellos = {
    ...(apoyo?.procedencias ?? {}),
    ...((procedencias ?? {}) as Record<string, SelloDeDato>),
  };
  const fundido = { ...apoyo, ...limpios } as Apoyo;
  if (Object.keys(sellos).length) (fundido as { procedencias?: unknown }).procedencias = sellos;
  return fundido;
}

/** Los sellos que quedan `supuesto`. Se enseñan junto al dato Y junto al veredicto. */
export function datosSupuestos(apoyo: Apoyo | null | undefined): { clave: string; etiqueta: string; fuente: string | null }[] {
  const sellos = (apoyo?.procedencias ?? {}) as Record<string, SelloDeDato | undefined>;
  return CAMPOS_DE_FICHA
    .filter((c) => sellos[c.clave]?.procedencia === 'supuesto')
    .map((c) => ({ clave: c.clave, etiqueta: c.etiqueta, fuente: sellos[c.clave]?.fuente ?? null }));
}

/**
 * La frase que acompaña a un veredicto calculado sobre datos supuestos.
 *
 * El veredicto NO se altera por esto: el núcleo dictamina sobre el número y la
 * pantalla dice de dónde salió el número. Dos dueños distintos, ninguna
 * contradicción — y ninguna copia de la lógica del núcleo.
 */
export function avisoDeSupuestos(apoyo: Apoyo | null | undefined): string | null {
  const xs = datosSupuestos(apoyo);
  if (!xs.length) return null;
  return `Veredicto calculado sobre ${xs.length === 1 ? 'un dato supuesto' : 'datos supuestos'}: `
    + `${xs.map((x) => x.etiqueta.toLowerCase()).join(', ')}. Nadie lo verificó.`;
}

// ════════════════════════════════════════════════════════════════════════════
// 4 · LO QUE VA A CAMBIAR — el antes/después, sobre el TRAMO ENTERO
// ════════════════════════════════════════════════════════════════════════════

/** Lo que hace falta para poder recalcular la línea sin tocar la base. */
export interface ContextoDeLinea {
  apoyos: Apoyo[];
  /** Los tramos de tensión ya calculados (`calcularTramos`), forma APLANADA. */
  tramos: TramoParaCargas[];
  /**
   * LOS MISMOS TRAMOS EN SU FORMA RICA — `tramosDeTension(...)` con el `estados`
   * de `estadosDelTramo`. Son DOS entradas y no una por una razón del núcleo, no
   * por comodidad: el eje longitudinal RESTA el tiro de dos tramos contiguos, y
   * para poder restarlos hay que comprobar que vienen de la misma temperatura y
   * la misma carga unitaria — datos que la forma aplanada no trae. El núcleo la
   * rechaza a propósito.
   *
   * ⚠️ Pasar aquí los tramos aplanados NO da error: deja el eje longitudinal sin
   * un solo tiro, y entonces el panel enseñaría «no se mueve nada» sobre el eje
   * que esta ola existe para desbloquear. Se declaró aparte para que el fallo no
   * quepa. Quien llama los arma igual que `ejesLinea.ts`, que ya es su dueño.
   */
  tramosRicos: unknown[];
  conductor: Conductor;
  hipotesis: Hipotesis;
  circuitos?: number | null;
}

export type Veredicto = 'cumple' | 'revisar' | 'sin_veredicto';

export interface VeredictoDeEje {
  antes: Veredicto;
  despues: Veredicto;
  utilizacionAntes_pct: number | null;
  utilizacionDespues_pct: number | null;
  cambia: boolean;
}

export interface FilaDeCambio {
  apoyo: string;
  /** `true` si es uno de los apoyos que se están editando. */
  editado: boolean;
  transversal: VeredictoDeEje;
  longitudinal: VeredictoDeEje;
  /** `true` si MUEVE de estado en cualquiera de los dos ejes. */
  cambia: boolean;
  /** Lo que le sigue faltando DESPUÉS de guardar, con las palabras del núcleo. */
  faltaTodavia: string[];
}

export interface PanelDeCambio {
  /** Una fila por apoyo del tramo (o tramos) afectado. */
  filas: FilaDeCambio[];
  /** Los tramos que se recalcularon, y los apoyos que contienen. */
  alcance: { tramos_n: number[]; apoyos: string[]; editados: string[] };
  resumen: {
    sinVeredictoAntes: number;
    gananVeredicto: number;
    /**
     * Los que TENÍAN veredicto y dejan de tenerlo. Casi siempre será cero, y por
     * eso mismo se cuenta: cambiar el tipo de la capacidad o corregir una altura
     * puede dejar sin dictamen a un apoyo que ayer lo tenía, y esa es
     * exactamente la clase de pérdida que nadie mira si no se le pone número.
     */
    pierdenVeredicto: number;
    pasanARevisar: number;
    sinVeredictoDespues: number;
    /** Los del tramo que NO se mueven. Comprobado, no supuesto. */
    sinMover: string[];
  };
  /** Prosa lista para imprimir, en el orden en que se lee. */
  frases: string[];
  /** La geometría declarada que impide el veredicto, si la hay. */
  avisosGeometria: { apoyo: string; avisos: AvisoDeGeometria[] }[];
}

/** Solo las estructuras entran al cálculo — el mismo filtro que usa el núcleo. */
const esEstructura = (a: Apoyo): boolean => ((a?.tipoPunto ?? 'Estructura') === 'Estructura');

const veredictoTransversal = (f: { estadoUtilizacion: string } | undefined): Veredicto =>
  (f?.estadoUtilizacion === 'cumple' || f?.estadoUtilizacion === 'revisar' ? f.estadoUtilizacion : 'sin_veredicto');

const veredictoLongitudinal = (f: { estadoUtilizacion: string | null } | undefined): Veredicto =>
  (f?.estadoUtilizacion === 'cumple' || f?.estadoUtilizacion === 'revisar' ? f.estadoUtilizacion : 'sin_veredicto');

const eje = (
  antes: Veredicto, despues: Veredicto,
  uAntes: number | null, uDespues: number | null,
): VeredictoDeEje => ({
  antes, despues,
  utilizacionAntes_pct: uAntes, utilizacionDespues_pct: uDespues,
  cambia: antes !== despues,
});

/**
 * QUÉ VEREDICTOS SE MUEVEN SI SE GUARDA ESTO — sobre el TRAMO ENTERO, no sobre
 * el apoyo editado.
 *
 * POR QUÉ EL TRAMO Y NO EL APOYO (ADR-002): editar un apoyo invalida y recalcula
 * todo su tramo de tensión. En ESTA ola los seis campos son propiedades del
 * apoyo y ninguno mueve el número de sus vecinos — y el panel lo DICE con todas
 * las letras en vez de callarse, porque un panel callado se lee como «no lo
 * miré». El día que `funcionEstructural` sea editable —que sí corta tramos— la
 * máquina ya está montada.
 *
 * Los `tramos` se reusan tal cual para el antes y el después, y eso es correcto
 * y comprobable: los seis campos de esta ficha no entran en ninguna cuenta de
 * tramos (que salen de coordenadas, deflexiones y función estructural). Si algún
 * día entrara uno, habría que recalcular los tramos también — y por eso queda
 * escrito aquí y no en la cabeza de nadie.
 */
export function loQueVaACambiar(
  contexto: ContextoDeLinea,
  parches: { apoyoId: string; ficha: FichaEstructural }[],
): PanelDeCambio {
  const porId = new Map((parches ?? []).map((p) => [p.apoyoId, p.ficha]));
  const antesApoyos = contexto.apoyos ?? [];
  const despuesApoyos = antesApoyos.map((a) => {
    const f = porId.get(a.id);
    return f ? aplicarFicha(a, f) : a;
  });

  const tAntes = cargasParaPantalla(antesApoyos, contexto.tramos, contexto.conductor, contexto.hipotesis, contexto.circuitos);
  const tDespues = cargasParaPantalla(despuesApoyos, contexto.tramos, contexto.conductor, contexto.hipotesis, contexto.circuitos);
  const lAntes = longitudinalParaPantalla(antesApoyos, contexto.tramosRicos ?? [], contexto.conductor);
  const lDespues = longitudinalParaPantalla(despuesApoyos, contexto.tramosRicos ?? [], contexto.conductor);

  // Las filas del núcleo van EN EL ORDEN de las estructuras y sin los empalmes.
  // Aquí se alinean por índice contra esa misma lista, y NO por nombre: en esta
  // línea conviven «E022», «EMP TUB» y «EMPT», y un nombre puede repetirse.
  // `tests/ficha-estructural.test.js` fija esa alineación con una línea que
  // lleva un empalme dentro: si el núcleo cambiara de filtro, la prueba cae.
  const estructuras = antesApoyos.filter(esEstructura);
  const editados = new Set((parches ?? []).map((p) => p.apoyoId));

  const tramosTocados = new Set<number>();
  estructuras.forEach((a, i) => {
    if (editados.has(a.id)) for (const n of tAntes.filas[i]?.tramos_n ?? []) tramosTocados.add(n);
  });

  const filas: FilaDeCambio[] = [];
  const avisosGeometria: { apoyo: string; avisos: AvisoDeGeometria[] }[] = [];

  estructuras.forEach((a, i) => {
    const fa = tAntes.filas[i];
    const fd = tDespues.filas[i];
    const la = lAntes.filas[i];
    const ld = lDespues.filas[i];
    if (!fa || !fd) return;
    const enElTramo = (fa.tramos_n ?? []).some((n) => tramosTocados.has(n));
    if (!enElTramo && !editados.has(a.id)) return;

    const transversal = eje(
      veredictoTransversal(fa), veredictoTransversal(fd),
      fa.utilizacion_pct, fd.utilizacion_pct,
    );
    const longitudinal = eje(
      veredictoLongitudinal(la), veredictoLongitudinal(ld),
      la?.utilizacion_pct ?? null, ld?.utilizacion_pct ?? null,
    );

    filas.push({
      apoyo: fd.apoyo,
      editado: editados.has(a.id),
      transversal,
      longitudinal,
      cambia: transversal.cambia || longitudinal.cambia,
      // Con las palabras del núcleo, que ya las escribe. No se redactan aquí.
      faltaTodavia: fd.faltaParaVeredicto ?? [],
    });

    if (editados.has(a.id)) {
      const g = revisarGeometria(despuesApoyos.find((x) => x.id === a.id));
      if (g.length) avisosGeometria.push({ apoyo: fd.apoyo, avisos: g });
    }
  });

  const conVeredicto = (f: FilaDeCambio, cuando: 'antes' | 'despues'): boolean =>
    f.transversal[cuando] !== 'sin_veredicto' || f.longitudinal[cuando] !== 'sin_veredicto';

  const sinVeredictoAntes = filas.filter((f) => !conVeredicto(f, 'antes')).length;
  const gananVeredicto = filas.filter((f) => !conVeredicto(f, 'antes') && conVeredicto(f, 'despues')).length;
  const pierdenVeredicto = filas.filter((f) => conVeredicto(f, 'antes') && !conVeredicto(f, 'despues')).length;
  const pasanARevisar = filas.filter((f) =>
    (f.transversal.antes !== 'revisar' && f.transversal.despues === 'revisar')
    || (f.longitudinal.antes !== 'revisar' && f.longitudinal.despues === 'revisar')).length;
  const sinVeredictoDespues = filas.filter((f) => !conVeredicto(f, 'despues')).length;
  const sinMover = filas.filter((f) => !f.cambia).map((f) => f.apoyo);

  const frases: string[] = [];
  frases.push(gananVeredicto === 0
    ? `Ningún apoyo gana veredicto con esto. De ${filas.length} apoyos del tramo, ${sinVeredictoDespues} `
      + 'siguen sin veredicto.'
    : `De ${sinVeredictoAntes} ${sinVeredictoAntes === 1 ? 'apoyo' : 'apoyos'} sin veredicto pasan a `
      + `tener veredicto: ${gananVeredicto}.`);
  // La pérdida va ARRIBA, justo después de la ganancia y antes que nada más: un
  // apoyo que deja de tener veredicto es lo único de este panel que empeora, y
  // enterrarlo entre las buenas noticias sería la forma más barata de no verlo.
  if (pierdenVeredicto > 0) {
    frases.push(`${pierdenVeredicto} ${pierdenVeredicto === 1 ? 'apoyo DEJA' : 'apoyos DEJAN'} de tener `
      + 'veredicto con esto. Con los datos nuevos el motor ya no puede dictaminarlo: mírelo antes de '
      + 'guardar, porque el veredicto que hoy se ve desaparecería del informe.');
  }
  if (pasanARevisar > 0) {
    frases.push(`${pasanARevisar} ${pasanARevisar === 1 ? 'apoyo pasa' : 'apoyos pasan'} a REVISAR. `
      + 'Esto no es una avería nueva: es lo que ya pasaba y hasta hoy no se podía ver.');
  }
  const otros = sinMover.filter((n) => !filas.find((f) => f.apoyo === n)?.editado);
  if (otros.length) {
    frases.push(`El resto del tramo (${otros[0]}${otros.length > 1 ? ` a ${otros[otros.length - 1]}` : ''}) `
      + 'no se mueve: comprobado, no supuesto.');
  }
  if (sinVeredictoDespues > 0 && gananVeredicto > 0) {
    frases.push(`Después de guardar, ${sinVeredictoDespues} ${sinVeredictoDespues === 1 ? 'apoyo sigue' : 'apoyos siguen'} `
      + 'sin veredicto: abajo se dice qué le falta a cada uno.');
  }

  return {
    filas,
    alcance: {
      tramos_n: [...tramosTocados].sort((x, y) => x - y),
      apoyos: filas.map((f) => f.apoyo),
      editados: filas.filter((f) => f.editado).map((f) => f.apoyo),
    },
    resumen: { sinVeredictoAntes, gananVeredicto, pierdenVeredicto, pasanARevisar, sinVeredictoDespues, sinMover },
    frases,
    avisosGeometria,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 5 · EL BORRADOR: lo que él teclea, antes de que sea un dato
// ════════════════════════════════════════════════════════════════════════════
//
// POR QUÉ VIVE AQUÍ Y NO EN EL FORMULARIO. `FichaEditor.tsx` pinta y pregunta;
// no convierte, no decide y no juzga. Todo lo que hay entre «él escribió 12,5»
// y «esto se puede mandar a la base» está en estas cuatro funciones, que se
// prueban con `node --test` sin navegador.
//
// ⚠️ EL MOLDE SIGUE MANDANDO. `FichaEstructural` (contrato) es quien rechaza de
// verdad, del lado de la escritura. Lo de aquí existe para poder decirle QUÉ LE
// FALTA antes de pulsar, en vez de después — que es la diferencia entre una
// pantalla que acompaña y una que regaña. Una prueba ata las dos: lo que aquí
// sale sin faltas, el molde lo acepta; y cada falta que aquí se nombra, el molde
// también la rechaza.

/**
 * Lo que él tecleó, TAL CUAL, sin convertir.
 *
 * Las cadenas son a propósito: un campo de texto vacío es «no declarado», y un
 * `0` sería una medida. Convertir mientras teclea obligaría a decidir qué es
 * «12,» a mitad de palabra, y la respuesta honesta es «todavía nada».
 *
 * ARRANCA VACÍO, siempre, aunque el apoyo ya tenga valores guardados. No es un
 * descuido: el par valor+sello entra JUNTO, así que devolver los valores de la
 * base obligaría a volver a declarar el origen de todo lo que ya tiene origen —
 * o, peor, a resellar con la fecha de hoy un dato que alguien midió en marzo.
 * Lo que ya está se ENSEÑA al lado, con su sello, y no se toca si no se cambia.
 */
export interface BorradorDeFicha {
  valores: {
    alturaLibre_m: string;
    alturaAplicacion_m: string;
    cargaRotura_kgf: string;
    nFasesAmarradas: string;
    tipoApoyo: string;
    /** Los cuatro de la capacidad. Van juntos o no va ninguno. */
    capacidad_valor_kgf: string;
    capacidad_tipo: string;
    capacidad_alturaReferencia_m: string;
    capacidad_fuente: string;
  };
  /** De dónde salió cada campo. Vacío = sin declarar, y sin declarar no se guarda. */
  origenes: Record<string, string>;
  /**
   * La línea que otro pueda discutir dentro de tres años, por campo.
   *
   * `capacidadLongitudinal` NO está aquí: lleva su fuente DENTRO del propio
   * dato (`capacidad_fuente`) y es la que el informe imprime. Un hecho, un dueño.
   */
  fuentes: Record<string, string>;
}

export function borradorEnBlanco(): BorradorDeFicha {
  return {
    valores: {
      alturaLibre_m: '', alturaAplicacion_m: '', cargaRotura_kgf: '',
      nFasesAmarradas: '', tipoApoyo: '',
      capacidad_valor_kgf: '', capacidad_tipo: '',
      capacidad_alturaReferencia_m: '', capacidad_fuente: '',
    },
    origenes: {},
    fuentes: {},
  };
}

/**
 * Un número escrito por una persona EN COLOMBIA: el punto separa los miles y la
 * coma separa los decimales. `9.000` son nueve mil y `1.250,75` son mil
 * doscientos cincuenta con setenta y cinco.
 *
 * ⚠️ ESTO NO ES UN DETALLE DE FORMATO. La versión anterior hacía
 * `replace(',', '.')` y se lo pasaba a `Number`, con dos consecuencias que se
 * comprobaron ejecutándolas:
 *   · «9.000» entraba como **9**. Una carga de rotura de 9.000 kgf se guardaba
 *     como 9 kgf, sin una sola queja, y el apoyo salía «revisar» — un error de
 *     tecleo disfrazado de hallazgo estructural, dentro de un documento que las
 *     reglas prohíben borrar.
 *   · «1.250,75» daba NaN.
 * Y lo que lo hacía inevitable: la propia aplicación PINTA los números con punto
 * de miles («9.000»), así que copiarlo de la pantalla al campo era el camino
 * natural. Es el riesgo nº 1 declarado del proyecto: el motor no falla, certifica.
 *
 * La regla, escrita para que se pueda discutir: si hay coma, la coma manda y los
 * puntos son miles. Si no hay coma, un punto solo se lee como miles cuando lo
 * siguen EXACTAMENTE tres dígitos y hay algo delante — que es como se escriben
 * los miles y no como se escriben los decimales de una medida.
 *
 * Devuelve `undefined` si el campo está vacío —«no declarado», que es legítimo—
 * y `NaN` si hay algo escrito que no es un número, para que quien llame pueda
 * distinguir el silencio del error.
 */
export function numeroTecleado(txt: string | undefined | null): number | undefined {
  const s = String(txt ?? '').trim();
  if (!s) return undefined;
  let limpio: string;
  if (s.includes(',')) {
    limpio = s.replace(/\./g, '').replace(',', '.');       // 1.250,75 → 1250.75
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    limpio = s.replace(/\./g, '');                         // 9.000 → 9000
  } else {
    limpio = s;                                            // 9000 · 9.5 · 12
  }
  const n = Number(limpio);
  return Number.isFinite(n) ? n : Number.NaN;
}

/**
 * Cómo ENTENDIÓ el sistema lo que se tecleó, para devolvérselo escrito al lado
 * del campo. La regla de arriba es razonable y aun así puede equivocarse con una
 * entrada rara; esto hace que el error se vea EN EL ACTO en vez de descubrirse
 * en un informe. Es la misma doctrina de la casa: no esconder, enseñar.
 */
export function comoSeEntendio(txt: string | undefined | null, unidad: string): string | null {
  const n = numeroTecleado(txt);
  if (n === undefined) return null;
  if (Number.isNaN(n)) return 'eso no es un número';
  return `se entiende ${n.toLocaleString('es-CO', { maximumFractionDigits: 3 })} ${unidad}`;
}

const CAMPO_POR_CLAVE = new Map(CAMPOS_DE_FICHA.map((c) => [c.clave as string, c]));

/** Los tres valores que puede tener la capacidad, dichos como se leen. */
export const TIPOS_DE_CAPACIDAD: readonly { valor: string; etiqueta: string }[] = Object.freeze([
  { valor: 'rotura', etiqueta: 'Carga de rotura — la de falla (se le aplica el coeficiente 2)' },
  { valor: 'admisible', etiqueta: 'Carga admisible — ya lleva su factor de seguridad dentro' },
  { valor: 'diseno', etiqueta: 'Carga de diseño — con la que el proyecto dimensionó el apoyo' },
]);

export interface ResultadoDelBorrador {
  /** Lo que se mandaría a guardar, o `null` si todavía no se puede mandar nada. */
  ficha: FichaEstructural | null;
  /** Los campos que él declaró, por su etiqueta. Para el acuse y el panel. */
  campos: string[];
  /**
   * Lo que impide guardar, en su idioma y nombrando el campo. Un botón apagado
   * sin motivo es lo más caro que hay en una pantalla que se usa cada tres meses.
   */
  faltan: string[];
  /**
   * Lo que NO se va a guardar y NO impide guardar: un origen declarado sobre un
   * campo que se quedó sin valor.
   *
   * ⚠️ Esto NO es una falta, y la diferencia importa. El selector de cabecera
   * sella los tres campos de su bloque de un gesto —que es lo que hace usable el
   * formulario—, y casi nunca se rellenan los tres. Tratarlo como falta dejaría
   * el botón apagado exigiéndole un dato que no tiene, que es la forma más
   * rápida de que cierre la pantalla y vuelva a la libreta.
   *
   * Pero tampoco se calla: un sello que no viaja se DICE, para que nadie crea
   * que guardó un campo que no guardó.
   */
  noViajan: string[];
}

/**
 * DE LO QUE ÉL TECLEÓ A LO QUE SE PUEDE GUARDAR.
 *
 * Las cuatro reglas son las del molde, dichas antes de pulsar:
 *   1. Un valor sin origen no entra, y un origen sin valor tampoco.
 *   2. La fuente es obligatoria; la capacidad la lleva dentro y no se duplica.
 *   3. La capacidad son cuatro datos o ninguno: sin `tipo` no hay umbral (entre
 *      50 % y 100 % hay un factor 2) y sin altura de referencia no hay veredicto.
 *   4. Nada por defecto y ningún cero de relleno: lo que no se escribió, no viaja.
 *
 * ⚠️ `declaradoEn` y `declaradoPor` NO se ponen aquí: los sella la sesión en
 * `datos/firestore.ts`. La firma y la hora no se las cree nadie a la pantalla.
 */
export function fichaDelBorrador(b: BorradorDeFicha): ResultadoDelBorrador {
  const faltan: string[] = [];
  const noViajan: string[] = [];
  const campos: string[] = [];
  const valores: Record<string, unknown> = {};
  const procedencias: Record<string, { procedencia: string; fuente?: string }> = {};

  const origenDe = (clave: string) => String(b.origenes?.[clave] ?? '').trim();
  const fuenteDe = (clave: string) => String(b.fuentes?.[clave] ?? '').trim();
  const nombre = (clave: string) => CAMPO_POR_CLAVE.get(clave)?.etiqueta.toLowerCase() ?? clave;

  /** El par valor+sello de UN campo, con las mismas negativas del molde. */
  const sellar = (clave: string, valor: unknown, hayValor: boolean) => {
    const origen = origenDe(clave);
    if (!hayValor && !origen) return;                       // ni tocado: no es una falta
    if (hayValor && !origen) {
      faltan.push(`de «${nombre(clave)}» falta decir de dónde salió`);
      return;
    }
    if (!hayValor && origen) {
      // Sellado por el bloque y sin valor: NO se manda (el molde lo rechazaría,
      // con razón: un origen que no sella ningún número no dice nada) y NO
      // bloquea. Se dice, y ya.
      noViajan.push(`«${nombre(clave)}»: declaró el origen y no el valor, así que no se guarda`);
      return;
    }
    // La capacidad lleva su fuente dentro del dato; los demás, en el sello.
    if (clave === 'capacidadLongitudinal') {
      procedencias[clave] = { procedencia: origen };
    } else {
      const fuente = fuenteDe(clave);
      if (!fuente) {
        faltan.push(`de «${nombre(clave)}» falta decir en una línea de dónde salió, para que otro `
          + 'pueda discutirlo dentro de tres años');
        return;
      }
      procedencias[clave] = { procedencia: origen, fuente };
    }
    valores[clave] = valor;
    campos.push(CAMPO_POR_CLAVE.get(clave)?.etiqueta ?? clave);
  };

  // ── Los cuatro numéricos sueltos ──────────────────────────────────────────
  for (const clave of ['alturaLibre_m', 'alturaAplicacion_m', 'cargaRotura_kgf', 'nFasesAmarradas'] as const) {
    const n = numeroTecleado(b.valores?.[clave]);
    if (n !== undefined && Number.isNaN(n)) {
      faltan.push(`«${nombre(clave)}»: lo escrito no es un número`);
      continue;
    }
    if (n !== undefined && n <= 0) {
      faltan.push(`«${nombre(clave)}» no puede ser cero ni negativo: un cero se lee como una medida`);
      continue;
    }
    if (clave === 'nFasesAmarradas' && n !== undefined && !Number.isInteger(n)) {
      faltan.push('«conductores que amarran aquí» se cuenta en conductores enteros');
      continue;
    }
    sellar(clave, n, n !== undefined);
  }

  // ── El tipo de apoyo ──────────────────────────────────────────────────────
  const tipo = String(b.valores?.tipoApoyo ?? '').trim();
  sellar('tipoApoyo', tipo, tipo !== '');

  // ── La capacidad: los cuatro juntos o ninguno ─────────────────────────────
  const capValor = numeroTecleado(b.valores?.capacidad_valor_kgf);
  const capAltura = numeroTecleado(b.valores?.capacidad_alturaReferencia_m);
  const capTipo = String(b.valores?.capacidad_tipo ?? '').trim();
  const capFuente = String(b.valores?.capacidad_fuente ?? '').trim();
  // Si lo ÚNICO que hay es el origen —porque el sello de cabecera lo puso al
  // sellar el bloque— la capacidad no se ha tocado: no se manda y no bloquea.
  const escribioAlgoDeLaCapacidad = capValor !== undefined || capAltura !== undefined
    || capTipo !== '' || capFuente !== '';
  if (!escribioAlgoDeLaCapacidad && origenDe('capacidadLongitudinal') !== '') {
    noViajan.push('«capacidad a lo largo de la línea»: declaró el origen y no el dato, así que no se guarda');
  }

  if (escribioAlgoDeLaCapacidad) {
    const rotos: string[] = [];
    if (capValor === undefined || Number.isNaN(capValor) || capValor <= 0) rotos.push('cuánto aguanta, en kgf');
    if (!capTipo) rotos.push('qué ES ese número (rotura, admisible o de diseño): entre el primero y los otros dos hay el doble de margen');
    if (capAltura === undefined || Number.isNaN(capAltura) || capAltura <= 0) rotos.push('a qué altura vale esa capacidad, en metros');
    if (!capFuente) rotos.push('de dónde sale, en una línea');
    if (rotos.length) {
      faltan.push(`de «capacidad a lo largo de la línea» falta: ${rotos.join(' · ')}`);
    } else {
      sellar('capacidadLongitudinal', {
        valor_kgf: capValor, tipo: capTipo,
        alturaReferencia_m: capAltura, fuente: capFuente,
      }, true);
    }
  }

  if (!campos.length && !faltan.length) {
    faltan.push('no ha declarado ningún dato todavía');
  }

  const ficha = (campos.length && !faltan.length)
    ? ({ ...valores, procedencias } as unknown as FichaEstructural)
    : null;
  return { ficha, campos, faltan, noViajan };
}

/**
 * EL APOYO CON EL BORRADOR ENCIMA, para poder juzgar la geometría MIENTRAS
 * teclea.
 *
 * Se funde con lo que el apoyo ya tiene a propósito: declarar hoy el amarre a
 * 12,5 m sobre un apoyo cuya punta ya consta a 11 m es exactamente el caso que
 * el núcleo resuelve devolviendo `null` EN SILENCIO, y que hay que cazar antes
 * de guardar. Un valor a medio teclear no se juzga: se ignora.
 */
export function apoyoConBorrador(apoyo: Apoyo, b: BorradorDeFicha): Partial<Apoyo> {
  const n = (x: string | undefined) => {
    const v = numeroTecleado(x);
    return (v === undefined || Number.isNaN(v) || v <= 0) ? undefined : v;
  };
  const capAltura = n(b.valores?.capacidad_alturaReferencia_m);
  const cap = capAltura !== undefined
    ? { ...(apoyo?.capacidadLongitudinal ?? {}), alturaReferencia_m: capAltura }
    : apoyo?.capacidadLongitudinal;
  return {
    ...apoyo,
    alturaLibre_m: n(b.valores?.alturaLibre_m) ?? apoyo?.alturaLibre_m,
    alturaAplicacion_m: n(b.valores?.alturaAplicacion_m) ?? apoyo?.alturaAplicacion_m,
    capacidadLongitudinal: cap,
  } as Partial<Apoyo>;
}

/** Lo que el borrador toca y la geometría no admite. Un solo dueño: `revisarGeometria`. */
export function geometriaDelBorrador(apoyo: Apoyo, b: BorradorDeFicha): AvisoDeGeometria[] {
  return revisarGeometria(apoyoConBorrador(apoyo, b));
}

// ════════════════════════════════════════════════════════════════════════════
// 6 · CÓMO ESTÁ ESTE APOYO HOY (antes de tocar nada)
// ════════════════════════════════════════════════════════════════════════════

export interface EstadoDeApoyo {
  apoyo: string;
  transversal: Veredicto;
  longitudinal: Veredicto;
  utilizacionTransversal_pct: number | null;
  utilizacionLongitudinal_pct: number | null;
  /** `true` si tiene veredicto en AL MENOS uno de los dos ejes. */
  tieneVeredicto: boolean;
  /** Lo que le falta, con las palabras del núcleo. No se redactan aquí. */
  faltaTodavia: string[];
}

/**
 * EL ESTADO DE UN APOYO HOY, para poder decir «le faltan 4 datos» antes de que
 * abra el formulario.
 *
 * Va aparte de `loQueVaACambiar` por una razón concreta: aquél solo devuelve
 * filas de los tramos TOCADOS por un parche, y sin parche no hay tramo tocado
 * ni fila. Preguntarle con un parche vacío para sacarle una fila sería un truco
 * que el día que cambie el filtro deja la pantalla muda sin un solo error.
 */
export function estadoDelApoyo(contexto: ContextoDeLinea, apoyoId: string): EstadoDeApoyo | null {
  const apoyos = contexto?.apoyos ?? [];
  const estructuras = apoyos.filter(esEstructura);
  const i = estructuras.findIndex((a) => a.id === apoyoId);
  if (i < 0) return null;

  const t = cargasParaPantalla(apoyos, contexto.tramos, contexto.conductor, contexto.hipotesis, contexto.circuitos);
  const l = longitudinalParaPantalla(apoyos, contexto.tramosRicos ?? [], contexto.conductor);
  const ft = t.filas[i];
  const fl = l.filas[i];
  if (!ft) return null;

  const transversal = veredictoTransversal(ft);
  const longitudinal = veredictoLongitudinal(fl);
  return {
    apoyo: ft.apoyo,
    transversal,
    longitudinal,
    utilizacionTransversal_pct: ft.utilizacion_pct,
    utilizacionLongitudinal_pct: fl?.utilizacion_pct ?? null,
    tieneVeredicto: transversal !== 'sin_veredicto' || longitudinal !== 'sin_veredicto',
    faltaTodavia: ft.faltaParaVeredicto ?? [],
  };
}

/** Tipos que la pantalla necesita nombrar sin volver a importarlos del núcleo. */
export type { CargasEnPantalla, LongitudinalEnPantalla };
