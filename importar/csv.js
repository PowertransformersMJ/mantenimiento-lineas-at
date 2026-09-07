// ============================================================================
// importar/csv.js — leer un CSV tal como sale de SCADA, sin dependencias
// ----------------------------------------------------------------------------
// QUÉ ES Y POR QUÉ EXISTE (`99 §ADR-105`). El histórico de operación no siempre
// llega en `.xlsx`: el sistema de supervisión del Ingeniero exporta **CSV**, una
// fila por señal y una columna por hora. El módulo de cargabilidad ya sabía leer
// esa FORMA —`nucleo/cargabilidadAncho.js`— pero solo desde un libro de Excel,
// así que el archivo real no entraba por la puerta.
//
// La regla que decide esto es la misma que gobierna al hermano ancho: **hacerle
// reescribir la exportación a una plantilla sería trabajo suyo para ahorrarme
// trabajo a mí**, y el archivo le va a seguir llegando así.
//
// DEVUELVE LO MISMO QUE `leerXlsx`: `{ hojas: [{ nombre, matriz, cabeceras,
// filas, nFilas }] }`. Un CSV es UNA hoja. Así, todo lo que ya existía río abajo
// —elegir hoja, buscar cabecera, reconocer la forma ancha, mapear campos— no se
// entera de por dónde entró el archivo, que es justo lo que se quiere: un
// camino nuevo que se bifurque río abajo son dos caminos que se separan solos.
//
// FUNCIONES PURAS. Entra texto, salen celdas. Sin DOM, sin red, sin `node:`.
// ============================================================================

import { filasDesde } from './xlsx.js';

/**
 * QUÉ SEPARA LAS COLUMNAS — se MIDE, no se supone.
 *
 * Un CSV en español puede venir con `;` porque la coma es el decimal, y una
 * exportación de un sistema industrial puede venir con tabulador. Suponer la
 * coma deja una única columna gigante con todo dentro, y el archivo parece
 * corrupto sin estarlo.
 *
 * Se decide por la primera línea no vacía: gana el candidato que más veces
 * aparece, con un mínimo de una. Empate a cero → coma, que es el nombre del
 * formato.
 */
export function separadorDe(texto) {
  const primera = String(texto ?? '').split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  const cuenta = (s) => (primera.split(s).length - 1);
  const candidatos = [
    { sep: ',', n: cuenta(',') },
    { sep: ';', n: cuenta(';') },
    { sep: '\t', n: cuenta('\t') },
    { sep: '|', n: cuenta('|') },
  ].sort((a, b) => b.n - a.n);
  return candidatos[0].n > 0 ? candidatos[0].sep : ',';
}

/**
 * ¿ESTA CELDA ES UN NÚMERO? Y ojo con lo que NO lo es.
 *
 * `'1/01/26 0:00'` NO es un número, y `'00123'` de un identificador tampoco
 * debería perder sus ceros — pero eso último es una decisión que aquí no toca:
 * lo que se convierte es lo que se PARECE a una cantidad y nada más.
 *
 * ⚠️ El decimal puede ser coma. Se acepta `12,83` **solo cuando el separador de
 * columnas no es la coma**; si lo fuera, esa celda ya se habría partido en dos y
 * convertirla sería inventar un número que el archivo no traía.
 */
export function aNumero(celda, { decimalComa = false } = {}) {
  const t = String(celda ?? '').trim();
  if (t === '') return '';
  const limpio = decimalComa ? t.replace(/\./g, '').replace(',', '.') : t;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(limpio)) return celda;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : celda;
}

/**
 * TEXTO CSV → MATRIZ DE CELDAS, con comillas de verdad.
 *
 * Sigue RFC 4180 en lo que importa: un campo entre comillas puede contener el
 * separador, saltos de línea y comillas escapadas como `""`. No es celo: una
 * etiqueta de SCADA con una coma dentro correría todas las columnas de esa fila
 * una posición, y el resultado no sería un error sino una **gráfica falsa**, que
 * es peor.
 */
export function celdasDeCsv(texto, { separador } = {}) {
  const s = String(texto ?? '').replace(/^﻿/, '');   // marca de orden de bytes
  const sep = separador ?? separadorDe(s);
  const decimalComa = sep !== ',';

  const matriz = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;
  let huboComillas = false;

  const cerrarCampo = () => {
    // Un campo que venía entrecomillado se queda como TEXTO: si alguien puso
    // comillas fue por algo, y quitarle el tipo es reinterpretar su archivo.
    fila.push(huboComillas ? campo : aNumero(campo, { decimalComa }));
    campo = ''; huboComillas = false;
  };
  const cerrarFila = () => { cerrarCampo(); matriz.push(fila); fila = []; };

  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (entreComillas) {
      if (c === '"') {
        if (s[i + 1] === '"') { campo += '"'; i += 1; } else entreComillas = false;
      } else campo += c;
      continue;
    }
    if (c === '"' && campo === '') { entreComillas = true; huboComillas = true; continue; }
    if (c === sep) { cerrarCampo(); continue; }
    if (c === '\r') continue;                 // CRLF: el \n de detrás cierra la fila
    if (c === '\n') { cerrarFila(); continue; }
    campo += c;
  }
  // La última fila solo cuenta si tenía algo: un archivo que acaba en salto de
  // línea no trae una fila vacía al final, trae el final.
  if (campo !== '' || huboComillas || fila.length) cerrarFila();

  return matriz;
}

/**
 * LA PUERTA, con la misma forma que `leerXlsx`.
 *
 * @param {ArrayBuffer|Uint8Array|string} datos
 * @param {{filaCabecera?: number, separador?: string, nombre?: string}} [opciones]
 */
export async function leerCsv(datos, { filaCabecera = 0, separador, nombre = 'CSV' } = {}) {
  let texto;
  if (typeof datos === 'string') texto = datos;
  else {
    const bytes = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
    if (!bytes.length) throw new Error('el archivo está vacío');
    // ⚠️ Un `.xlsx` renombrado a `.csv` entra por aquí y sale como una fila de
    // basura binaria. Se dice por su nombre en vez de dejar que el usuario mire
    // una tabla ilegible preguntándose qué hizo mal.
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      throw new Error('esto es un .xlsx con el nombre cambiado, no un CSV: vuelva a ponerle la extensión .xlsx');
    }
    texto = new TextDecoder('utf-8').decode(bytes);
  }
  const matriz = celdasDeCsv(texto, { separador });
  if (!matriz.length) throw new Error('el archivo no trae ninguna fila');
  const { cabeceras, filas } = filasDesde(matriz, filaCabecera);
  return { hojas: [{ nombre, matriz, cabeceras, filas, nFilas: filas.length }] };
}
