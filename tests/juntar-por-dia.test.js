// ============================================================================
// tests/juntar-por-dia.test.js — el PASO 2 del SCADA, por fin con prueba
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE (`99 §ADR-126`). `herramientas/juntar-por-dia.mjs` convierte
// ~1.000 archivos de la bahía en uno por día y estadístico, y ESO es lo que se
// suelta en la pantalla y queda en el histórico, que no se borra. Vivió desde el
// 07-09 sin una sola prueba (`TODO-102`), y al llegar febrero se vio por qué
// hacía falta:
//   · leía la fecha con una regla PROPIA: `1/13/26` salía `20261301`;
//   · apilaba la MISMA señal dos veces cuando el Ingeniero la había bajado dos
//     veces —los archivos «(1)»—, y el día quedaba con una cuarta fase.
// Y una revisión adversaria de la primera versión del arreglo encontró seis
// maneras más de perder o duplicar un dato EN SILENCIO; cada una tiene aquí su
// caso, con el escenario con que se demostró.
//
// ⚠️ Etiquetas y nombres INVENTADOS: los reales traen subestaciones de cliente y
// este repositorio es público (`33 · L-07`). Los archivos se crean en una
// carpeta temporal y se borran al acabar: aquí no queda ningún CSV.
// ============================================================================
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERRAMIENTA = join(dirname(fileURLToPath(import.meta.url)), '..', 'herramientas', 'juntar-por-dia.mjs');
const temporales = [];
after(() => { for (const d of temporales) rmSync(d, { recursive: true, force: true }); });

/** Una fila de eje con 24 horas del día escrito tal cual (`2/02/26`, `2026-01-15`…). */
const eje = (dia, sep = ',') => ['', ...Array.from({ length: 24 }, (_, h) => `${dia} ${h}:00`)].join(sep);
/** Una señal con 24 valores que empiezan en `base`. */
const senal = (letra, base, sep = ',', decimal = (n) => String(n)) => [
  `/SubX /BAHIA-9/${letra} /Momento`, ...Array.from({ length: 24 }, (_, h) => decimal(base + h))].join(sep);

/** Monta `{ 'carpeta/archivo.csv': [lineas] }`, corre la herramienta y devuelve lo que dejó. */
function correr(arbol, { destinoPrevio = null } = {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'juntar-'));
  temporales.push(raiz);
  const origen = join(raiz, 'origen'); const destino = join(raiz, 'destino');
  for (const [ruta, lineas] of Object.entries(arbol)) {
    mkdirSync(dirname(join(origen, ruta)), { recursive: true });
    writeFileSync(join(origen, ruta), typeof lineas === 'string' ? lineas : lineas.join('\n') + '\n');
  }
  if (destinoPrevio) {
    mkdirSync(destino, { recursive: true });
    for (const [n, t] of Object.entries(destinoPrevio)) writeFileSync(join(destino, n), t);
  }
  const r = spawnSync(process.execPath, [HERRAMIENTA, origen, destino], { encoding: 'utf8' });
  const salida = existsSync(destino) ? Object.fromEntries(readdirSync(destino).sort()
    .map((n) => [n, readFileSync(join(destino, n), 'utf8').trim().split('\n')])) : {};
  return { codigo: r.status, texto: r.stdout + r.stderr, salida };
}

describe('EL DÍA LO DECLARA EL DATO, leído con la regla del lector', () => {
  test('manda el eje, no el nombre: un «(1)» con nombre del 03 que trae el 02 es del 02', () => {
    const { salida } = correr({ '02Feb/i_max-20260203(1).csv': [eje('2/02/26'), senal('I R', 100)] });
    assert.deepEqual(Object.keys(salida), ['maximo-20260202.csv']);
  });

  test('`1/13/26` es el 13 de enero — la regla vieja lo convertía en el mes 13', () => {
    const { salida } = correr({ 'd/i_max-x.csv': [eje('1/13/26'), senal('I R', 100)] });
    assert.deepEqual(Object.keys(salida), ['maximo-20260113.csv']);
  });

  test('un eje con el año delante no se descarta', () => {
    const { salida, codigo } = correr({ 'd/i_max-x.csv': [eje('2026-01-15'), senal('I R', 100)] });
    assert.equal(codigo, 0);
    assert.deepEqual(Object.keys(salida), ['maximo-20260115.csv']);
  });

  test('`5/02/26` —ambiguo— se lee día/mes, como lo lee la pantalla: 5 de febrero', () => {
    const { salida, codigo } = correr({
      'd/i_max-a.csv': [eje('5/02/26'), senal('I R', 100)],
      'd/i_max-b.csv': [eje('15/02/26'), senal('I R', 100)],     // demuestra día/mes: coherente
    });
    assert.equal(codigo, 0);
    assert.deepEqual(Object.keys(salida), ['maximo-20260205.csv', 'maximo-20260215.csv']);
  });

  test('si un archivo DEMUESTRA mes/día, los ambiguos del mes no se fechan día/mes a ciegas: no se escribe nada', () => {
    const { salida, codigo, texto } = correr({
      'd/i_max-a.csv': [eje('1/05/26'), senal('I R', 100)],      // 5 de enero en mes/día… o 1 de mayo
      'd/i_max-b.csv': [eje('1/13/26'), senal('I R', 100)],      // esto SÍ es mes/día
    });
    assert.equal(codigo, 1);
    assert.deepEqual(salida, {}, 'ni el seguro: el mes entero se revisa');
    assert.match(texto, /orden de la fecha no es el mismo/);
  });

  test('un eje que cubre DOS días se aparta con su nombre, y sale con error', () => {
    const dos = ['', ...['2/02/26', '3/02/26'].flatMap((d) => Array.from({ length: 24 }, (_, h) => `${d} ${h}:00`))].join(',');
    const { salida, codigo, texto } = correr({ 'd/ir_max-48h.csv': [dos, ['/SubX /BAHIA-9/I R /Momento', ...Array(48).fill(1)].join(',')] });
    assert.equal(codigo, 1);
    assert.deepEqual(salida, {});
    assert.match(texto, /«ir_max-48h\.csv» · su eje cubre 2 días/);
  });
});

describe('LA MISMA SEÑAL DOS VECES EN UN DÍA', () => {
  test('repetida IDÉNTICA: se escribe una sola vez, y se dice', () => {
    const { salida, texto, codigo } = correr({
      'd/ir_max-20260202.csv': [eje('2/02/26'), senal('I R', 100)],
      'd/ir_max-20260203(1).csv': [eje('2/02/26'), senal('I R', 100)],
      'd/is_max-20260202.csv': [eje('2/02/26'), senal('I S', 200)],
    });
    assert.equal(codigo, 0);
    assert.equal(salida['maximo-20260202.csv'].length, 3, 'el eje y DOS señales, no tres');
    assert.match(texto, /1 fila\(s\) repetidas IDÉNTICAS/);
    assert.match(texto, /ir_max-20260203\(1\)\.csv/);
  });

  test('misma señal con valores DISTINTOS: ese día no se escribe y sale con error', () => {
    const { salida, texto, codigo } = correr({
      'd/ir_max-a.csv': [eje('2/02/26'), senal('I R', 100)],
      'd/ir_max-b.csv': [eje('2/02/26'), senal('I R', 101)],
      'd/ir_min-a.csv': [eje('2/02/26'), senal('I R', 50)],
    });
    assert.equal(codigo, 1);
    assert.ok(!salida['maximo-20260202.csv'], 'no se elige una por él');
    assert.ok(salida['minimo-20260202.csv'], 'lo que no choca se escribe igual');
    assert.match(texto, /NO se escribieron/);
  });

  test('con «;» y coma decimal el choque también se ve: la etiqueta no se lleva un trozo del valor', () => {
    const coma = (n) => `${n},5`;
    const { salida, codigo } = correr({
      'd/ir_max-a.csv': [eje('2/02/26', ';'), senal('I R', 100, ';', coma)],
      'd/ir_max-b(1).csv': [eje('2/02/26', ';'), senal('I R', 200, ';', coma)],
      'd/is_max-a.csv': [eje('2/02/26', ';'), senal('I S', 300, ';', coma)],
    });
    assert.equal(codigo, 1, 'antes: código 0 y la fase R dos veces');
    assert.ok(!salida['maximo-20260202.csv']);
  });

  test('con «;» la repetida idéntica se escribe una vez', () => {
    const coma = (n) => `${n},5`;
    const { salida, codigo } = correr({
      'd/ir_max-a.csv': [eje('2/02/26', ';'), senal('I R', 100, ';', coma)],
      'd/ir_max-b(1).csv': [eje('2/02/26', ';'), senal('I R', 100, ';', coma)],
    });
    assert.equal(codigo, 0);
    assert.equal(salida['maximo-20260202.csv'].length, 2);
  });

  test('la misma fila SIN etiqueta en dos archivos es una repetida, no dos señales', () => {
    const fila = ['', ...Array.from({ length: 24 }, (_, h) => 100 + h)].join(',');
    const { salida, codigo } = correr({
      'd/x_max-a.csv': [eje('2/02/26'), fila],
      'd/x_max-b.csv': [eje('2/02/26'), fila],
    });
    assert.equal(codigo, 0);
    assert.equal(salida['maximo-20260202.csv'].length, 2);
  });
});

describe('LO QUE NO ENTRA SE DICE CON NOMBRE, SE CUENTA Y SALE CON ERROR', () => {
  test('eje distinto del de su grupo: se aparta con su nombre, sus filas cuentan y la salida es 1', () => {
    const { texto, codigo } = correr({
      'd/ir_max-a.csv': [eje('2/02/26'), senal('I R', 100)],
      'd/is_max-b.csv': [eje('2/02/26') + ',', senal('I S', 200)],   // una coma de más al final del eje
    });
    assert.equal(codigo, 1, 'antes: código 0 y la fase S perdida en silencio');
    assert.match(texto, /«is_max-b\.csv» · su eje de tiempo no es idéntico al de «ir_max-a\.csv»/);
    assert.match(texto, /2 fila\(s\) de señal leídas = 1 escritas .* \+ 1 de archivos apartados/);
  });

  test('una marca de orden de bytes no aparta a nadie: el lector también la quita', () => {
    const { salida, codigo } = correr({
      'd/ir_max-a.csv': '﻿' + [eje('2/02/26'), senal('I R', 100)].join('\n') + '\n',
      'd/is_max-b.csv': [eje('2/02/26'), senal('I S', 200)],
    });
    assert.equal(codigo, 0);
    assert.equal(salida['maximo-20260202.csv'].length, 3);
    assert.ok(!salida['maximo-20260202.csv'][0].startsWith('﻿'));
  });

  test('el sello de calidad se aparta SIN error: no es una medida', () => {
    const { salida, texto, codigo } = correr({
      'd/ir_quality-x.csv': [eje('2/02/26'), ['/SubX /BAHIA-9/I R /Momento', ...Array(24).fill('Actual')].join(',')],
      'd/ir_max-x.csv': [eje('2/02/26'), senal('I R', 100)],
    });
    assert.equal(codigo, 0);
    assert.deepEqual(Object.keys(salida), ['maximo-20260202.csv']);
    assert.match(texto, /1 sello\(s\) de calidad apartados/);
  });

  test('un destino con restos se niega: nada de la corrida anterior se carga como si fuera de ésta', () => {
    const { codigo, texto, salida } = correr(
      { 'd/ir_max-a.csv': [eje('2/02/26'), senal('I R', 100)] },
      { destinoPrevio: { 'maximo-20260202.csv': 'viejo\n' } },
    );
    assert.equal(codigo, 2);
    assert.match(texto, /ya tiene archivos \.csv/);
    assert.deepEqual(salida['maximo-20260202.csv'], ['viejo'], 'y no toca lo que había');
  });
});

// ── El nombre que promete una señal y trae otra ─────────────────────────────
// Medido en enero: un `IT_Current` con la fase S dentro y un `UST_Average` con la
// tensión TR. Se escribía por la etiqueta —bien— y la fila entraba como repetida
// idéntica de su hermana: el día se quedaba sin la fase T y nadie lo decía. El
// aviso NO cambia lo escrito ni el código de salida; por eso cada caso compara
// además contra el mismo origen con el nombre que DEBERÍA tener.
/** La línea del recuento, que tiene que salir igual con el aviso y sin él. */
const recuento = (texto) => texto.match(/\d+ fila\(s\) de señal leídas = .*/)?.[0];

describe('EL NOMBRE QUE PROMETE UNA SEÑAL Y TRAE OTRA SE NOMBRA, y lo escrito no cambia', () => {
  test('un «IT» que trae la fase S: se nombra, el día se queda sin la T, y la salida es la del nombre bueno', () => {
    const comun = {
      'd/IR_Current-a.csv': [eje('2/02/26'), senal('I R', 100)],
      'd/IS_Current-a.csv': [eje('2/02/26'), senal('I S', 200)],
    };
    const miente = correr({ ...comun, 'd/IT_Current-a.csv': [eje('2/02/26'), senal('I S', 200)] });
    const bueno = correr({ ...comun, 'd/IS_Current-a(1).csv': [eje('2/02/26'), senal('I S', 200)] });
    assert.equal(miente.codigo, 0, 'el código de salida no cambia: ninguna fila leída se pierde');
    assert.equal(miente.codigo, bueno.codigo);
    assert.deepEqual(miente.salida, bueno.salida, 'lo escrito, byte a byte, es lo mismo');
    assert.equal(recuento(miente.texto), recuento(bueno.texto));
    assert.match(miente.texto, /«d\/IT_Current-a\.csv» · el nombre dice corriente de la fase T; dentro trae corriente de la fase S/);
    assert.match(miente.texto, /RESUMEN: 1 archivo\(s\) traen otra señal que la de su nombre: «d\/IT_Current-a\.csv»; esos días se quedan sin: instantaneo-20260202 sin corriente de la fase T\./);
    assert.doesNotMatch(bueno.texto, /OTRA señal/, 'con el nombre bueno no hay aviso');
  });

  test('un «UST» que trae la tensión TR y nadie trae la ST: la fila entra como TR y se dice que falta la ST', () => {
    const { salida, texto, codigo } = correr({
      'd/ust_average-x.csv': [eje('2/02/26'), senal('U TR', 66)],
      'd/p_average-x.csv': [eje('2/02/26'), senal('P', 10)],
    });
    assert.equal(codigo, 0);
    assert.deepEqual(salida['promedio-20260202.csv'].slice(1).sort(), [senal('P', 10), senal('U TR', 66)].sort());
    assert.match(texto, /«d\/ust_average-x\.csv» · el nombre dice tensión entre las fases ST; dentro trae tensión entre las fases TR/);
    assert.match(texto, /esos días se quedan sin: promedio-20260202 sin tensión entre las fases ST/);
  });

  test('si otro archivo SÍ trae la señal del nombre, se nombra igual pero no se dice que falte', () => {
    const { texto, codigo } = correr({
      'd/it_max-a.csv': [eje('2/02/26'), senal('I S', 5)],
      'd/is_max-a.csv': [eje('2/02/26'), senal('I S', 5)],
      'd/it_max-b(1).csv': [eje('2/02/26'), senal('I T', 7)],
    });
    assert.equal(codigo, 0);
    assert.match(texto, /«d\/it_max-a\.csv» · el nombre dice corriente de la fase T; dentro trae corriente de la fase S/);
    assert.match(texto, /a ningún día le falta la señal del nombre; no les falta, la trae otro archivo: maximo-20260202 \(corriente de la fase T\)/);
    assert.doesNotMatch(texto, /«d\/it_max-b\(1\)\.csv» · el nombre dice/, 'el que casa no se acusa');
  });

  test('un archivo que trae SU señal y además otras no miente: trae de más, y no se acusa', () => {
    // Lo cazó la revisión del 16-09: un «IR» con las tres fases dentro salía acusado.
    const { texto, codigo } = correr({
      'd/IR_Current-a.csv': [eje('2/02/26'), senal('I R', 1), senal('I S', 2), senal('I T', 3)],
    });
    assert.equal(codigo, 0);
    assert.doesNotMatch(texto, /el nombre dice/, 'la fase R está dentro: el nombre no miente');
  });

  test('los nombres que casan no avisan: mayúsculas, P y Q sin fase, y «usr» con las letras al revés', () => {
    const { texto, codigo } = correr({
      'd/IR_max-x.csv': [eje('2/02/26'), senal('I R', 1)],
      'd/p_max-x.csv': [eje('2/02/26'), senal('P', 2)],
      'd/Q_max_x.csv': [eje('2/02/26'), senal('Q', 3)],
      'd/usr_max-x.csv': [eje('2/02/26'), senal('U RS', 4)],
      'd/UTR_max-x.csv': [eje('2/02/26'), senal('U TR', 5)],
    });
    assert.equal(codigo, 0);
    assert.doesNotMatch(texto, /OTRA señal/);
  });

  test('un nombre que no promete una señal conocida, o una etiqueta que el núcleo no entiende, no se acusa', () => {
    const { texto, codigo } = correr({
      'd/cargas_max-x.csv': [eje('2/02/26'), senal('I R', 1)],
      'd/it_max-x.csv': [eje('2/02/26'), ['', ...Array.from({ length: 24 }, (_, h) => 9 + h)].join(',')],
    });
    assert.equal(codigo, 0);
    assert.doesNotMatch(texto, /OTRA señal/, 'sin prueba no hay mentira: null antes que adivinar');
  });

  test('el que además se aparta se nombra igual, y el error de apartarlo sigue siendo el de siempre', () => {
    const { texto, codigo } = correr({
      'd/ir_min-a.csv': [eje('2/02/26'), senal('I R', 100)],
      'd/it_min-b.csv': [eje('2/02/26') + ',', senal('I S', 200)],   // una coma de más al final del eje
    });
    assert.equal(codigo, 1, 'lo apartado con filas sigue saliendo con error');
    assert.match(texto, /«it_min-b\.csv» · su eje de tiempo no es idéntico/);
    assert.match(texto, /«d\/it_min-b\.csv» · el nombre dice corriente de la fase T; dentro trae corriente de la fase S/);
    assert.match(texto, /«d\/it_min-b\.csv» está apartado \(ver arriba\)/);
  });

  test('si su día trae un choque, se nombra y se remite al choque, que sigue saliendo con error', () => {
    const { texto, codigo, salida } = correr({
      'd/is_max-a.csv': [eje('2/02/26'), senal('I S', 100)],
      'd/it_max-a.csv': [eje('2/02/26'), senal('I S', 101)],
    });
    assert.equal(codigo, 1);
    assert.deepEqual(salida, {});
    assert.match(texto, /«d\/it_max-a\.csv» · el nombre dice corriente de la fase T/);
    assert.match(texto, /maximo-20260202 no se escribe: trae un choque \(ver arriba\)/);
  });
});

describe('NI UN NÚMERO SE TOCA', () => {
  test('la fila sale byte a byte como entró', () => {
    const fila = senal('I T', 123.456);
    const { salida } = correr({ 'd/it_average-x.csv': [eje('2/02/26'), fila] });
    assert.equal(salida['promedio-20260202.csv'][1], fila);
  });

  test('el recuento suma lo repetido y lo apartado, no solo lo escrito', () => {
    const { texto } = correr({
      'd/ir_max-1.csv': [eje('3/02/26'), senal('I R', 1)],
      'd/ir_max-2.csv': [eje('3/02/26'), senal('I R', 1)],
      'd/is_max-1.csv': [eje('3/02/26'), senal('I S', 2)],
      'd/sin-estadistico.csv': [eje('3/02/26'), senal('I T', 3)],
    });
    assert.match(texto, /4 fila\(s\) de señal leídas = 2 escritas \+ 1 repetida\(s\) idéntica\(s\) \+ 0 de un día·estadístico con choque \+ 1 de archivos apartados/);
    assert.match(texto, /«sin-estadistico\.csv» · el nombre no dice qué estadístico trae/);
  });
});
