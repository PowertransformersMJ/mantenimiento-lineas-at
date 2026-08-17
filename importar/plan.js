// ============================================================================
// importar/plan.js — el ANTES y el DESPUÉS, con el mismo motor de siempre
// ----------------------------------------------------------------------------
// QUÉ HACE: es la única función que la pantalla llama. Recibe los apoyos que ya
// están en la base y lo que el Ingeniero decidió de cada punto nuevo, y
// devuelve tres cosas:
//
//   · qué documentos se van a crear, cuáles quedan fuera y por qué;
//   · cómo están hoy las cifras de la línea;
//   · cómo quedarían si pulsa el botón.
//
// AQUÍ NO SE CALCULA NADA NUEVO. Ni una fórmula, ni un promedio propio, ni un
// recuento paralelo. Las tres funciones que producen esas cifras son las mismas
// que pintan las demás pestañas —la derivación del levantamiento, la
// estadística de vanos y la calidad del levantamiento— y se corren DOS VECES:
// una con lo que hay y otra con lo que habría. Ese es el punto entero del
// archivo. Si la pantalla de carga tuviera su propia aritmética, el día que las
// dos difirieran nadie sabría cuál mirar, y la discusión pasaría de ser sobre
// el cálculo a ser sobre quién programó qué.
//
// POR QUÉ ESTO EXISTE Y NO SE PULSA EL BOTÓN A CIEGAS: cargar un punto no se
// puede deshacer. Un apoyo no se borra ni se corrige desde la aplicación —está
// diseñado así para que nadie borre historia—, así que la única defensa posible
// es ver el resultado ANTES. Un punto mal situado no da error: inventa un vano,
// mueve el promedio y envenena el cálculo mecánico, callado.
//
// PURO: sin DOM, sin red, sin módulos nativos.
// ============================================================================
import { derivarLevantamiento } from '@lineas/exportar/levantamiento';
import { calidadLevantamiento } from '@lineas/exportar/calidad';
import { estadisticasVanos } from '@lineas/nucleo/estadisticas';
import { construirPuntoNuevo } from './punto.js';

/**
 * @typedef {Object} RetratoDeLinea  las cifras de la línea en un momento dado
 * @property {number} puntos
 * @property {number} estructuras
 * @property {number} empalmes
 * @property {number} longitud_m
 * @property {{n: number, reparto: number[], detalle: object[]}} tramos
 * @property {{n: number, nombres: string[]}} anclas
 * @property {ReturnType<typeof estadisticasVanos>} vanos  null si todavía no hay ningún vano
 * @property {object[]} calidad   los hallazgos de calidad, tal cual los produce el motor
 */

/**
 * Las cifras de una lista de apoyos. Todo sale de los tres módulos que ya
 * existen; lo único que se hace aquí es CONTAR lo que ellos devuelven.
 *
 * @param {object[]} apoyos
 * @returns {RetratoDeLinea}
 */
export function retratoDeLinea(apoyos) {
  const lev = derivarLevantamiento([...(apoyos ?? [])]);
  const estructuras = lev.puntos.filter((p) => p.tipo === 'Estructura');
  const anclas = lev.puntos.filter((p) => p.esAncla);

  return {
    puntos: lev.puntos.length,
    estructuras: lev.nEstructuras,
    empalmes: lev.nEmpalmes,
    longitud_m: lev.longitud_m,
    tramos: {
      n: lev.tramos.length,
      reparto: lev.tramos.map((t) => t.nVanos),
      detalle: lev.tramos.map((t) => ({
        n: t.n, desde: t.desde, hasta: t.hasta, nVanos: t.nVanos, longitud_m: t.longitud_m,
      })),
    },
    anclas: { n: anclas.length, nombres: anclas.map((p) => p.nombre) },
    // Los vanos REALES, de estructura a estructura: los mismos que ve la
    // pestaña de distribución. Un empalme no es un apoyo y no abre vano.
    vanos: estadisticasVanos(estructuras.slice(1).map((p) => p.vanoAnterior_m)),
    calidad: calidadLevantamiento(lev),
  };
}

/**
 * @typedef {Object} PlanDeCarga
 * @property {object[]} documentos  lo que se va a escribir, y nada más
 * @property {object[]} ignorados   lo que el Ingeniero dejó fuera, con su motivo
 * @property {object[]} bloqueados  lo que HOY no se puede cargar, con el porqué escrito
 * @property {RetratoDeLinea} antes
 * @property {RetratoDeLinea} despues
 */

/**
 * El plan completo de una carga.
 *
 * @param {object[]} apoyosYaCargados  los apoyos tal como están en la base
 * @param {import('./punto.js').DecisionDeCarga[]} decisiones  en el ORDEN del recorrido
 * @param {object} opciones  `codigoLinea`, `creadoPor` y `registro` son OBLIGATORIOS
 * @returns {PlanDeCarga}
 */
export function planDeCarga(apoyosYaCargados, decisiones = [], opciones = {}) {
  const base = [...(apoyosYaCargados ?? [])];

  // Un solo instante para toda la carga: los puntos de una misma jornada se
  // crearon a la vez, y que difieran en milisegundos convertiría un hecho en
  // dos. Si quien llama declara el suyo, manda el suyo.
  //
  // ⚠️ EL SELLO SE PONE AQUÍ Y SE PASA YA HECHO. `construirPuntoNuevo` tiene su
  // propio defecto para quien construye UN punto suelto, y ese defecto sella POR
  // DOCUMENTO: si de aquí saliera un `ahora` sin valor, cada punto se fecharía
  // por su cuenta y todos coincidirían solo si se construyen dentro del mismo
  // milisegundo. Es decir, el invariante lo garantizaría la velocidad de la
  // máquina y no el código — y eso no es garantía, es suerte.
  //
  // Y por eso `??=` en vez de `{ ahora: <defecto>, ...opciones }`: con el defecto
  // ANTES del spread, quien pase `ahora: undefined` —que en JavaScript significa
  // «no lo declaro»— PISA el defecto y lo deja sin valor. Declarar la clave vacía
  // es no declararla, y aquí se trata como tal. Con `null` es peor todavía: el
  // defecto del constructor tampoco cubre un nulo, así que se escribía un
  // `creadoEn` nulo que solo paraba el molde, ya en la frontera.
  const opc = { ...opciones };
  opc.ahora ??= new Date().toISOString();

  const documentos = [];
  const ignorados = [];
  const bloqueados = [];

  // Se acumula: el segundo punto que caiga en el mismo hueco tiene que ver al
  // primero para colocarse DETRÁS de él. Sin acumular, los dos pedirían el
  // mismo orden y uno se dibujaría al revés del recorrido, sin un solo aviso.
  const acumulado = [...base];

  for (const decision of decisiones ?? []) {
    let resultado;
    try {
      resultado = construirPuntoNuevo(acumulado, decision, opc);
    } catch (err) {
      // Lo que no se puede cargar hoy NO tumba la pantalla ni se pierde: se
      // declara con el motivo entero, que está escrito para leerse. La carga de
      // los demás puntos sigue: negarle los dos buenos por culpa del tercero
      // sería castigarle por haber traído más información.
      bloqueados.push({
        nombreCanonico: decision?.nombreCanonico ?? null,
        nombreCampo: decision?.nombreCampo ?? null,
        motivo: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    if (resultado.documento) {
      documentos.push(resultado.documento);
      acumulado.push(resultado.documento);
    } else {
      ignorados.push(resultado.ignorado);
    }
  }

  return {
    documentos,
    ignorados,
    bloqueados,
    antes: retratoDeLinea(base),
    despues: retratoDeLinea(acumulado),
  };
}
