// ============================================================================
// tests/normalizar-xls.test.js — el PASO 0 del SCADA, con prueba
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE (`99 §ADR-128`). El paso 0 se hizo «a mano» en enero y de
// catorce `.xls` se convirtieron dos. Esta herramienta devuelve a un CSV de
// LibreOffice la FORMA del SCADA sin tocar un dígito, y lo que esta suite
// defiende es justo eso: la forma cambia, el número no; y un eje que no se
// entiende NO se escribe, porque fecharía mal un día entero en silencio.
//
// ⚠️ Etiquetas INVENTADAS y archivos en una carpeta temporal: aquí no queda
// ningún CSV y ninguna subestación real (`33 · L-07`).
// ============================================================================
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { celdasDeCsv } from '../importar/csv.js';
import { encontrarEjeDeTiempo } from '../nucleo/cargabilidadAncho.js';

const HERRAMIENTA = join(dirname(fileURLToPath(import.meta.url)), '..', 'herramientas', 'normalizar-xls.mjs');
const temporales = [];
after(() => { for (const d of temporales) rmSync(d, { recursive: true, force: true }); });

/** Un CSV como lo deja LibreOffice: eje con año de cuatro cifras y segundos, decimal con coma entre comillas. */
const ejeLO = (dd, mm) => ['', ...Array.from({ length: 24 }, (_, h) => `${dd}/${mm}/2026 ${String(h).padStart(2, '0')}:00:00`)].join(',');

function correr(texto) {
  const d = mkdtempSync(join(tmpdir(), 'xls-')); temporales.push(d);
  const ent = join(d, 'lo.csv'); const sal = join(d, 'scada.csv');
  writeFileSync(ent, texto);
  const r = spawnSync(process.execPath, [HERRAMIENTA, ent, sal], { encoding: 'utf8' });
  return { codigo: r.status, texto: r.stdout + r.stderr, sal, salida: existsSync(sal) ? readFileSync(sal, 'utf8') : null };
}

describe('LA FORMA CAMBIA, EL NÚMERO NO', () => {
  test('el eje sale como el del SCADA y el núcleo lo fecha el 2 de enero, no el 1 de febrero', () => {
    const { salida, codigo } = correr(`${ejeLO('02', '01')}\n/SubX /BAHIA-9/P /Momento,${Array(24).fill('"-18,43494862"').join(',')}\n`);
    assert.equal(codigo, 0);
    const eje = salida.split('\r\n')[0];
    assert.ok(eje.startsWith(',2/01/26 0:00,2/01/26 1:00,'), eje.slice(0, 40));
    const leido = encontrarEjeDeTiempo(celdasDeCsv(eje));
    assert.equal(leido.instantes[0].fecha, '2026-01-02');
    assert.equal(leido.instantes[23].hora, 23);
  });

  test('el decimal con coma entre comillas sale con punto y sin comillas, con TODOS sus dígitos', () => {
    const { salida } = correr(`${ejeLO('02', '01')}\n/SubX /BAHIA-9/P /Momento,"-18,43494862",-2,"0,30000001",${Array(21).fill('1').join(',')}\n`);
    const fila = salida.split('\r\n')[1].split(',');
    assert.deepEqual(fila.slice(1, 4), ['-18.43494862', '-2', '0.30000001']);
  });

  test('«null» y las celdas vacías se quedan como vinieron: un hueco no es un cero', () => {
    const { salida, texto } = correr(`${ejeLO('05', '01')}\n/SubX /OTRA/P /Momento,null,,${Array(22).fill('3').join(',')}\n`);
    const fila = salida.split('\r\n')[1].split(',');
    assert.equal(fila[1], 'null');
    assert.equal(fila[2], '');
    assert.match(texto, /1 celda\(s\) de valor que no son número/);
  });

  test('una etiqueta con una coma dentro vuelve entrecomillada: no corre las columnas', () => {
    const { salida } = correr(`${ejeLO('02', '01')}\n"/SubX, sur /BAHIA-9/Q /Momento",${Array(24).fill('"1,5"').join(',')}\n`);
    const celdas = celdasDeCsv(salida)[1];
    assert.equal(celdas.length, 25);
    assert.equal(celdas[0], '/SubX, sur /BAHIA-9/Q /Momento');
  });

  test('fin de línea CRLF, como el CSV aceptado del 07-09', () => {
    const { salida } = correr(`${ejeLO('02', '01')}\n/SubX /BAHIA-9/P /Momento,${Array(24).fill('1').join(',')}\n`);
    assert.ok(salida.includes('\r\n'));
    assert.ok(!/[^\r]\n/.test(salida));
  });
});

describe('LO QUE NO SE ENTIENDE NO SE ESCRIBE', () => {
  test('un eje con otra forma: no se escribe nada y sale con error', () => {
    const malo = ['', ...Array.from({ length: 24 }, (_, h) => `2026-01-02 ${h}:00`)].join(',');
    const { codigo, salida, texto } = correr(`${malo}\n/SubX /BAHIA-9/P /Momento,${Array(24).fill('1').join(',')}\n`);
    assert.equal(codigo, 1);
    assert.equal(salida, null);
    assert.match(texto, /NO SE ESCRIBE NADA/);
  });

  test('no pisa un CSV que ya existe: el original manda', () => {
    const d = mkdtempSync(join(tmpdir(), 'xls-')); temporales.push(d);
    const ent = join(d, 'lo.csv'); const sal = join(d, 'scada.csv');
    writeFileSync(ent, `${ejeLO('02', '01')}\n`); writeFileSync(sal, 'aceptado\n');
    const r = spawnSync(process.execPath, [HERRAMIENTA, ent, sal], { encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.equal(readFileSync(sal, 'utf8'), 'aceptado\n');
  });
});
