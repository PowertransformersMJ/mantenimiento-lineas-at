// ============================================================================
// exportar/bom.js — la memoria de cantidades, con su hueco a la vista
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE
// Alguien COMPRA con este archivo. El error caro no es el renglón que falta —ese
// se nota— sino el renglón que aparece completo y no lo está: el carrete llega a
// la vía, la cuadrilla está parada y el conductor se compró corto. Por eso este
// exporte tiene TRES secciones y la tercera no es opcional.
//
// LA SECCIÓN QUE NO SE PUEDE QUITAR
// «NO CUANTIFICABLE» lleva, con su motivo, todo lo que `cantidadesGeometricas`
// se negó a estimar: crucetas, retenidas, herrajes, aisladores, puestas a
// tierra, y cualquier dato que no llegó (los circuitos, el haz, la reserva de
// tendido). Un BOM sin ese bloque parece una orden de compra completa y no lo
// es. La casilla vacía se ve; el supuesto silencioso, no.
//
// DOS DIALECTOS, las mismas reglas que exportar/csv.js y exportar/mecanica.js:
//   · 'excel' → BOM + `sep=;` + CRLF + COMA decimal + procedencia arriba (con #).
//   · 'datos' → separador coma, PUNTO decimal, sin BOM, sin `sep=;`, sin
//               renglones de procedencia.
// En es-CO el decimal es la coma: un CSV con punto entra a Excel como TEXTO, se
// ve bien y no suma. Un total de conductor que sale en cero porque la columna
// era texto es un error que se descubre tarde y en la vía.
//
// ⚠️ Igual que el CSV de cálculo: TRES SECCIONES en un archivo significa que ni
// el dialecto 'datos' es una tabla única. `pandas.read_csv()` directo fallará;
// hay que cortar por los renglones que empiezan por `==`.
//
// LO QUE ESTE ARCHIVO **NO** HACE
// · No calcula ni redondea. Redondear a carrete es una decisión de COMPRA, con
//   nombre y firma, no una decisión del exportador.
// · No agrega desperdicio ni reserva que nadie declaró. Si no vino, sale en la
//   sección de avisos diciendo que la cantidad es NETA.
//
// JavaScript puro: sin DOM, sin red. Devuelve el texto del archivo.
// ============================================================================
import { dialectoCsv } from './mecanica.js';
import { bloqueProcedencia } from './procedencia.js';
import { VERSION_EXPORTADOR } from './version.js';

// ── Rótulos de sección ──────────────────────────────────────────────────────
export const SECCIONES_BOM = Object.freeze({
  continuas:       '== CONTINUAS (se miden en metros) ==',
  conteos:         '== CONTEOS (se cuentan de a uno) ==',
  noCuantificable: '== NO CUANTIFICABLE — LO QUE FALTA Y POR QUÉ ==',
});

/**
 * `Base_de_calculo` es la columna que hace defendible el renglón: dice de dónde
 * sale la cifra (Σ catenaria de N vanos × conductores/circuito × circuitos ×
 * reserva). Sin ella el comprador tiene un número; con ella tiene un número que
 * puede discutir. Nunca se recorta para que la hoja se vea ordenada.
 */
export const COLUMNAS_CONTINUAS = [
  'Linea', 'Concepto', 'Cantidad', 'Unidad', 'Base_de_calculo', 'Procedencia',
];

export const COLUMNAS_CONTEOS = [
  'Linea', 'Concepto', 'Cantidad', 'Unidad', 'Procedencia',
];

export const COLUMNAS_NO_CUANTIFICABLE = [
  'Linea', 'Concepto', 'Motivo',
];

// ── Procedencia ─────────────────────────────────────────────────────────────

/**
 * El bloque de procedencia, o la confesión de que no se pudo armar.
 * Mismo criterio que en exportar/mecanica.js: si no llegó la derivación del
 * levantamiento no se fabrica una —escribir «+ 0 empalmes» porque nadie los
 * contó es inventar justo en la línea que sirve para defender el archivo—.
 */
function renglonesProcedencia(linea, lev, opciones) {
  if (lev && Number.isFinite(lev.longitud_m) && Number.isFinite(lev.nEstructuras)) {
    return bloqueProcedencia(linea, lev, opciones);
  }

  const r = [];
  const cab = [`Línea ${linea?.codigo ?? '(sin código)'}`];
  if (linea?.nombre && linea.nombre !== linea.codigo) cab.push(linea.nombre);
  if (linea?.tensionNominal_kV != null) cab.push(`${linea.tensionNominal_kV} kV`);
  if (linea?.propietario) cab.push(linea.propietario);
  r.push(cab.join(' · '));
  r.push('Procedencia del levantamiento: NO EVALUABLE — este exporte no recibió la derivación'
    + ' (`derivarLevantamiento`), así que no puede declarar cuántas estructuras ni cuántos metros'
    + ' de línea respaldan las cantidades de abajo. Cotícese con ellas; no se firme una compra sin'
    + ' cruzarlas contra el levantamiento.');
  const gen = [`Exportador @lineas/exportar v${VERSION_EXPORTADOR}`,
    'generado desde los datos del sistema, no desde la pantalla (ADR-005/006)'];
  if (opciones?.generadoEn) gen.unshift(`Generado ${opciones.generadoEn}`);
  if (opciones?.generadoPor) gen.push(`por ${opciones.generadoPor}`);
  r.push(gen.join(' · '));
  return r;
}

// ── Función pública ─────────────────────────────────────────────────────────

/**
 * CSV de la memoria de cantidades geométrica.
 *
 * @param {Object} entrada
 * @param {{codigo?:string, nombre?:string, tensionNominal_kV?:number, propietario?:string}} [entrada.linea]
 * @param {{continuas?:Array<{concepto:string, cantidad:number, unidad:string, base:string, procedencia:string}>,
 *          discretas?:Array<{concepto:string, cantidad:number, unidad:string, procedencia:string}>,
 *          avisos?:Array<{concepto:string, motivo:string}>}} [entrada.cantidades]
 *        Salida de `cantidadesGeometricas` (nucleo/cantidades.js), tal cual.
 * @param {ReturnType<import('./levantamiento.js').derivarLevantamiento>} [entrada.levantamiento]
 *        Opcional; si llega, la procedencia es la misma que la del GPX/KML/CSV.
 * @param {{dialecto?:'excel'|'datos', generadoEn?:string, generadoPor?:string,
 *          hipotesisNombre?:string, levantamiento?:*}} [opciones]
 * @returns {string} el texto del archivo
 */
export function csvCantidades(entrada, opciones = {}) {
  const e = entrada ?? {};
  const { excel, q, num, ent, fila } = dialectoCsv(opciones);

  const linea = e.linea ?? {};
  const c = e.cantidades ?? {};
  const continuas = Array.isArray(c.continuas) ? c.continuas : [];
  const discretas = Array.isArray(c.discretas) ? c.discretas : [];
  const avisos = Array.isArray(c.avisos) ? c.avisos : [];
  const lev = e.levantamiento ?? opciones.levantamiento ?? null;

  const codLinea = linea.codigo ?? '';

  const r = [];

  if (excel) {
    r.push('sep=;');
    for (const l of renglonesProcedencia(linea, lev, opciones)) r.push(q('# ' + l));
    r.push(q('# Cantidades GEOMÉTRICAS: solo lo que se deduce del levantamiento. Lea la sección'
      + ' «NO CUANTIFICABLE» ANTES de cotizar — es la que dice qué NO está aquí y por qué.'));
    // El renglón en blanco lo pone `abrirSeccion`; duplicarlo deja dos filas
    // vacías seguidas en la hoja (mismo criterio que exportar/mecanica.js).
  }

  const abrirSeccion = (titulo, columnas) => {
    if (r.length) r.push('');
    r.push(q(titulo));
    r.push(fila(columnas));
  };

  // ══ 1 · CONTINUAS ════════════════════════════════════════════════════════
  abrirSeccion(SECCIONES_BOM.continuas, COLUMNAS_CONTINUAS);
  if (!continuas.length) {
    r.push(q('(sin renglones) — no se pudo cuantificar ni un metro. El motivo exacto está abajo,'
      + ' en «NO CUANTIFICABLE»: normalmente faltan los vanos, los circuitos o los conductores'
      + ' por circuito.'));
  } else {
    for (const x of continuas) {
      r.push(fila([
        q(codLinea), q(x?.concepto ?? ''),
        // Dos decimales en metros: el milímetro en una orden de conductor es
        // falsa precisión, y quitar los decimales redondearía sin decirlo.
        num(x?.cantidad, 2), q(x?.unidad ?? ''),
        q(x?.base ?? ''), q(x?.procedencia ?? ''),
      ]));
    }
  }

  // ══ 2 · CONTEOS ══════════════════════════════════════════════════════════
  abrirSeccion(SECCIONES_BOM.conteos, COLUMNAS_CONTEOS);
  if (!discretas.length) {
    r.push(q('(sin renglones) — no se contó ninguna estructura. O no llegaron apoyos, o ninguno'
      + ' declara su función estructural: la función decide el tipo de estructura, la cadena y el'
      + ' herraje, es decir el precio, y no se reparte «al más común».'));
  } else {
    for (const x of discretas) {
      // Enteros: se cuentan de a uno. Un «12,00» en la columna de apoyos hace
      // dudar de si el sistema está estimando algo, y aquí no estima nada.
      r.push(fila([
        q(codLinea), q(x?.concepto ?? ''),
        ent(x?.cantidad), q(x?.unidad ?? ''), q(x?.procedencia ?? ''),
      ]));
    }
  }

  // ══ 3 · NO CUANTIFICABLE — obligatoria ═══════════════════════════════════
  // Va SIEMPRE, aunque venga vacía, y va de última porque es la que se lee al
  // final: lo último que se ve antes de mandar la orden es lo que NO está.
  abrirSeccion(SECCIONES_BOM.noCuantificable, COLUMNAS_NO_CUANTIFICABLE);
  if (!avisos.length) {
    r.push(q('(sin renglones) — no llegó ningún aviso, y eso es SOSPECHOSO:'
      + ' `cantidadesGeometricas` declara siempre, como mínimo, lo que solo se captura en campo'
      + ' (crucetas, retenidas, herrajes, aisladores, puestas a tierra). Si este bloque está'
      + ' vacío, lo que falta no es material: es la salida del cálculo.'));
  } else {
    for (const a of avisos) {
      r.push(fila([q(codLinea), q(a?.concepto ?? ''), q(a?.motivo ?? '')]));
    }
  }

  return (excel ? '﻿' : '') + r.join('\r\n');
}
