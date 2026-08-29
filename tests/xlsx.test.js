// ============================================================================
// tests/xlsx.test.js — leer un .xlsx sin dependencias, y sin correr una columna
// ----------------------------------------------------------------------------
// QUÉ VIGILA. `importar/xlsx.js` sustituye a una librería de terceros, así que
// tiene que ganarse el puesto: si falla, falla en silencio y con números que
// parecen buenos. Las trampas del formato no son teóricas, son lo que Excel hace
// TODOS los días:
//
//   1. **Excel omite las celdas vacías.** Una fila con la columna B en blanco
//      escribe A y C seguidas. Un lector que vaya por orden corre la fila entera
//      un puesto a la izquierda — y no da un solo error.
//   2. **Los textos van en una tabla aparte.** Las celdas guardan un número que
//      indexa `sharedStrings`. Sin resolverlo, una hoja de texto sale de ceros.
//   3. **Las fechas son números.** 45383 no es una cantidad: es el 1 de abril de
//      2024 contado desde el 30-12-1899 (Excel cree que 1900 fue bisiesto).
//   4. **`#N/A` no es cero.** Una celda de error es un hueco.
//
// El fixture es SINTÉTICO y se rehace con `tests/fixtures/construir-sintetico.py`,
// que dice trampa por trampa qué provoca cada fila. Ni un dato de cliente: este
// repo es PÚBLICO.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { columnaDeRef, leerXlsx, letraDeColumna } from '../importar/xlsx.js';
import { detectarMapeo, procesarLote, resumen } from '../nucleo/cargabilidad.js';

const ARCHIVO = fileURLToPath(new URL('./fixtures/cargabilidad-sintetico.xlsx', import.meta.url));
const bytes = () => readFileSync(ARCHIVO);

// ════════════════════════════════════════════════════════════════════════════
// 1 · EL ZIP Y SUS PIEZAS
// ════════════════════════════════════════════════════════════════════════════
describe('un .xlsx es un ZIP, y se abre sin librería', () => {
  test('encuentra las hojas y las nombra como el usuario las ve', async () => {
    const { hojas } = await leerXlsx(bytes());
    assert.deepEqual(hojas.map((h) => h.nombre), ['Cargabilidad', 'Notas']);
  });

  test('lee también la pieza guardada SIN comprimir (método 0 del ZIP)', async () => {
    // Un lector que solo sepa inflar se la salta o revienta. Excel guarda así
    // lo que no comprime bien, y no avisa.
    const { hojas } = await leerXlsx(bytes());
    assert.equal(hojas[1].cabeceras[0], 'otra cosa');
  });

  test('un .xls del formato viejo se rechaza POR SU NOMBRE, con la salida', async () => {
    // Decir «archivo corrupto» mandaría a buscar un problema que no existe. El
    // usuario tiene que leer qué hacer: guardarlo como .xlsx, que es un clic.
    const viejo = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]);
    await assert.rejects(() => leerXlsx(viejo), /Excel 97-2003|Guardar como/);
  });

  test('lo que no es ni un ZIP se dice claro, no se intenta adivinar', async () => {
    await assert.rejects(() => leerXlsx(new Uint8Array([1, 2, 3, 4])), /no es un \.xlsx/);
    await assert.rejects(() => leerXlsx(new Uint8Array([])), /vacío/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2 · LA TRAMPA QUE JUSTIFICA ESTE ARCHIVO
// ════════════════════════════════════════════════════════════════════════════
describe('las celdas vacías que Excel NO escribe', () => {
  test('⚠️ una fila sin la columna B no corre las demás de sitio', async () => {
    // Es la fila 3 del fixture: falta «Hora». Si se leyera por orden, «LN-BBB»
    // aterrizaría en Hora, el 103,2 en Nombre línea y el estado en Cargabilidad.
    // Todo coherente, todo falso, y sin un error.
    const { hojas } = await leerXlsx(bytes());
    const sinHora = hojas[0].filas[1];
    assert.equal(sinHora['Nombre línea'], 'LN-BBB', 'la fila se corrió un puesto a la izquierda');
    assert.equal(sinHora.Hora, null, 'la hora ausente se rellenó con lo de al lado');
    assert.equal(sinHora['% Carga'], 103.2);
  });

  test('la posición sale de la referencia de la celda, no de su orden', () => {
    assert.equal(columnaDeRef('A1'), 0);
    assert.equal(columnaDeRef('B7'), 1);
    assert.equal(columnaDeRef('Z1'), 25);
    assert.equal(columnaDeRef('AA1'), 26);
    assert.equal(columnaDeRef('BC12'), 54);
    assert.equal(columnaDeRef('12'), null);
    for (let i = 0; i < 60; i++) assert.equal(columnaDeRef(`${letraDeColumna(i)}1`), i);
  });

  test('una fila entera en blanco no llega como fila de nulos', async () => {
    const { hojas } = await leerXlsx(bytes());
    assert.equal(hojas[0].filas.length, 3, 'la fila 5, vacía, se coló');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3 · LOS TIPOS DE CELDA
// ════════════════════════════════════════════════════════════════════════════
describe('cada tipo de celda llega como lo que es', () => {
  test('los textos se resuelven contra la tabla de cadenas compartidas', async () => {
    const { hojas } = await leerXlsx(bytes());
    assert.equal(hojas[0].filas[0]['Nombre línea'], 'LN-AAA', 'llegó el índice en vez del texto');
    assert.equal(hojas[0].cabeceras[2], 'Nombre línea', 'la tilde se perdió por el camino');
  });

  test('las entidades XML se desescapan: «&» no llega como «&amp;»', async () => {
    const { hojas } = await leerXlsx(bytes());
    assert.equal(hojas[0].filas[1].Estado, 'Alerta & revisión');
  });

  test('el texto en línea (sin tabla compartida) también se lee', async () => {
    const { hojas } = await leerXlsx(bytes());
    assert.equal(hojas[0].filas[0]['Subestación Origen'], 'SE Norte');
  });

  test('⚠️ una celda de error (#N/A) es un HUECO, no un cero', async () => {
    const { hojas } = await leerXlsx(bytes());
    assert.equal(hojas[0].filas[2]['% Carga'], null);
    assert.notEqual(hojas[0].filas[2]['% Carga'], 0,
      'un #N/A leído como 0 % diría que la línea estuvo fuera de servicio');
  });

  test('las fechas y horas llegan como los números que son, sin interpretar', async () => {
    // El lector NO convierte: quien sabe de qué día parte la cuenta es
    // `nucleo/cargabilidad.js`. Un lector que además interprete formatos es un
    // segundo dueño de la fecha.
    const { hojas } = await leerXlsx(bytes());
    assert.equal(hojas[0].filas[0].Fecha, 45383);
    assert.equal(hojas[0].filas[0].Hora, 0.5);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4 · LA CADENA COMPLETA — del archivo al tablero
// ════════════════════════════════════════════════════════════════════════════
describe('del .xlsx al tablero, sin tocar nada a mano', () => {
  test('las cabeceras reales se mapean solas, sin pedirle nada al usuario', async () => {
    const { hojas } = await leerXlsx(bytes());
    const det = detectarMapeo(hojas[0].cabeceras);
    assert.equal(det.completo, true, `faltaron: ${det.faltanRequeridos.join(', ')}`);
    assert.equal(det.mapeo.linea, 'Nombre línea');
    assert.equal(det.mapeo.cargabilidad_pct, '% Carga');
    assert.deepEqual(det.sinReconocer, [], 'quedaron columnas sin identificar');
  });

  test('el serial de Excel acaba siendo la fecha correcta, y la fracción una hora', async () => {
    const { hojas } = await leerXlsx(bytes());
    const { registros } = procesarLote(hojas[0].filas, detectarMapeo(hojas[0].cabeceras).mapeo);
    assert.equal(registros[0].fecha, '2024-04-01', 'el serial se contó desde el día equivocado');
    assert.equal(registros[0].hora, 12, '0,5 de día son las 12:00');
  });

  test('el tablero cuenta el hueco como falta de dato, no como cero', async () => {
    const { hojas } = await leerXlsx(bytes());
    const { registros } = procesarLote(hojas[0].filas, detectarMapeo(hojas[0].cabeceras).mapeo);
    const s = resumen(registros);
    assert.equal(s.registros, 3);
    assert.equal(s.conMedida, 2, 'el #N/A entró como medida');
    assert.equal(s.promedio, 91.85, 'el hueco se promedió como 0 y hundió la media');
    assert.equal(s.eventosSobrecarga, 1);
    assert.equal(s.disponibilidad_pct, 66.7);
  });
});
