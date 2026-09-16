// ============================================================================
// tests/sellos-de-calidad.test.js — las horas que NO son medida, con prueba
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE (`99 §ADR-128`). `herramientas/sellos-de-calidad.mjs` lee los
// sellos `_quality` del SCADA y dice qué horas no son «Actual», agrupadas en
// bloques, y si en esas horas los valores están congelados o son imposibles.
// Es SOLO LECTURA: informa, no aparta. Lo que se prueba aquí es lo que no puede
// fallar en silencio:
//   · un día SIN sello no se cuenta como «Actual»;
//   · un bloque que cruza la medianoche es UNO;
//   · el 20-04 de su bahía —doce horas con el mismo valor— sale como congelado;
//   · una cifra absurda en una hora mala se señala;
//   · las carpetas de datos quedan byte a byte como estaban.
//
// ⚠️ Etiquetas y nombres INVENTADOS: los reales traen subestaciones de cliente y
// este repositorio es público (`33 · L-07`). Los archivos se crean en una
// carpeta temporal y se borran al acabar: aquí no queda ningún CSV.
// ============================================================================
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERRAMIENTA = join(dirname(fileURLToPath(import.meta.url)), '..', 'herramientas', 'sellos-de-calidad.mjs');
const temporales = [];
after(() => { for (const d of temporales) rmSync(d, { recursive: true, force: true }); });

/** Una fila de eje con 24 horas del día escrito tal cual (`20/04/26`). */
const eje = (dia, sep = ',') => ['', ...Array.from({ length: 24 }, (_, h) => `${dia} ${h}:00`)].join(sep);
const etiqueta = (senal) => `/SubA /66kV    /BAHIA1/${senal}     /Momento`;
/** Una fila de señal con 24 celdas: `celdas(h)` da la de la hora h. */
const fila = (senal, celdas, sep = ',') => [etiqueta(senal), ...Array.from({ length: 24 }, (_, h) => celdas(h))].join(sep);
/** 24 sellos: `malo` en las horas de `horas`, «Actual» en el resto. */
const sellos = (horas, malo = 'Not Renewed') => (h) => (horas.includes(h) ? malo : 'Actual');
const rango = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** Escribe `{ 'carpeta/archivo.csv': [lineas] }` debajo de `base`. */
function montar(base, arbol) {
  mkdirSync(base, { recursive: true });
  for (const [ruta, lineas] of Object.entries(arbol)) {
    mkdirSync(dirname(join(base, ruta)), { recursive: true });
    writeFileSync(join(base, ruta), typeof lineas === 'string' ? lineas : lineas.join('\n') + '\n');
  }
}

/**
 * Monta dos árboles —la carpeta del paso 2 y, si se da, la de la bahía (paso 1)—,
 * corre la herramienta con `--json` y devuelve la consola, el código y el listado.
 * `antes` recibe las carpetas ya montadas, justo antes de correr.
 */
function correr(paso2, { bahia = null, extra = [], jsonPrevio = null, antes = null } = {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'sellos-'));
  temporales.push(raiz);
  const dias = join(raiz, 'dias'); montar(dias, paso2);
  const argv = [HERRAMIENTA, dias];
  let carpetaBahia = null;
  if (bahia) { carpetaBahia = join(raiz, 'bahia'); montar(carpetaBahia, bahia); argv.push('--sellos', carpetaBahia); }
  const json = join(raiz, 'salida', 'sellos.json');
  if (jsonPrevio != null) { mkdirSync(dirname(json), { recursive: true }); writeFileSync(json, jsonPrevio); }
  argv.push('--json', json, ...extra);
  const previo = antes ? antes({ dias, carpetaBahia }) : null;
  const r = spawnSync(process.execPath, argv, { encoding: 'utf8' });
  const listado = existsSync(json) && jsonPrevio == null ? JSON.parse(readFileSync(json, 'utf8')) : null;
  return { codigo: r.status, texto: r.stdout + r.stderr, listado, dias, carpetaBahia, json, previo };
}

/** Huella de una carpeta entera: cada ruta con la huella de su contenido. */
function huella(carpeta) {
  const out = {};
  const recorrer = (d, pre) => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) recorrer(p, `${pre}${n}/`);
      else out[`${pre}${n}`] = createHash('sha256').update(readFileSync(p)).digest('hex');
    }
  };
  recorrer(carpeta, '');
  return out;
}

// El caso que se encontró a mano en su bahía, con cifras inventadas de la misma forma:
// sello malo de 7 a 19 h, valor retenido de 7 a 18 h y la hora 19 ya distinta.
const DIA = '20/04/26';
const corrienteRetenida = (h) => (h < 7 ? 240 - h : h <= 18 ? 199 : 250 + h);
const tensionRetenida = (h) => (h < 7 ? 68 + h / 10 : h <= 18 ? 69.3 : 68.5);
const caso2004 = () => ({
  paso2: {
    'instantaneo-20260420.csv': [eje(DIA), fila('I R', corrienteRetenida), fila('U RS', tensionRetenida)],
    'promedio-20260420.csv': [eje(DIA), fila('I R', corrienteRetenida), fila('U RS', tensionRetenida)],
  },
  bahia: {
    'Abril/20Abril/ir_quality-20260420.csv': [eje(DIA), fila('I R', sellos(rango(7, 19)))],
    'Abril/20Abril/urs_quality-20260420.csv': [eje(DIA), fila('U RS', sellos(rango(7, 19)))],
    // La bahía también trae medidas: NO se leen, los valores salen del paso 2.
    'Abril/20Abril/ir_current-20260420.csv': [eje(DIA), fila('I R', () => 1)],
  },
});

describe('EL BLOQUE: horas seguidas que no son «Actual»', () => {
  test('el caso del 20-04: un bloque de 7 a 19 h, dos señales, «Not Renewed», valores congelados', () => {
    const { paso2, bahia } = caso2004();
    const { codigo, texto, listado } = correr(paso2, { bahia });
    assert.equal(codigo, 0, texto);
    assert.equal(listado.bloques.length, 1);
    const [b] = listado.bloques;
    assert.deepEqual(b.inicio, { fecha: '2026-04-20', hora: 7 });
    assert.deepEqual(b.fin, { fecha: '2026-04-20', hora: 19 });
    assert.equal(b.horas, 13);
    assert.deepEqual(b.senales, [etiqueta('I R'), etiqueta('U RS')].sort());
    assert.deepEqual(b.sellos, { 'Not Renewed': 26 });
    assert.deepEqual(b.porDiaYSenal.map((x) => [x.fecha, x.sello, x.horas.length]),
      [['2026-04-20', 'Not Renewed', 13], ['2026-04-20', 'Not Renewed', 13]]);
    assert.equal(b.valores.series, 4, 'dos estadísticos × dos señales');
    assert.equal(b.valores.congeladas, 4);
    const ir = b.valores.detalleSeries.find((s) => s.estadistico === 'instantaneo' && s.etiqueta === etiqueta('I R'));
    assert.equal(ir.valor, 199);
    assert.equal(ir.horasIguales, 12, 'de 7 a 18 h: la hora 19 ya cambió');
    assert.deepEqual([ir.desde.hora, ir.hasta.hora], [7, 18]);
    assert.equal(b.valores.fueraDeRango, 0);
    assert.match(texto, /1\) 2026-04-20 7 h → 2026-04-20 19 h · 13 h · 2 señal\(es\): I R, U RS/);
    assert.match(texto, /valores CONGELADOS: 4 de 4/);
    assert.match(texto, /2026-04-20 · I R · Not Renewed · 7-19 h/);
  });

  test('un bloque que cruza la medianoche es UNO, contado por día y señal', () => {
    const { listado } = correr({
      'maximo-20260301.csv': [eje('1/03/26'), fila('I R', (h) => 300 + h)],
      'maximo-20260302.csv': [eje('2/03/26'), fila('I R', (h) => 300 + h)],
    }, {
      bahia: {
        'a/ir_quality-20260301.csv': [eje('1/03/26'), fila('I R', sellos([22, 23], 'Invalid'))],
        'b/ir_quality-20260302.csv': [eje('2/03/26'), fila('I R', sellos([0, 1, 2], 'Invalid'))],
      },
    });
    assert.equal(listado.bloques.length, 1);
    const [b] = listado.bloques;
    assert.deepEqual([b.inicio, b.fin, b.horas], [{ fecha: '2026-03-01', hora: 22 }, { fecha: '2026-03-02', hora: 2 }, 5]);
    assert.deepEqual(b.porDiaYSenal.map((x) => [x.fecha, x.horas]), [['2026-03-01', [22, 23]], ['2026-03-02', [0, 1, 2]]]);
    assert.deepEqual(listado.resumen.diasAfectados, ['2026-03-01', '2026-03-02']);
  });

  test('horas separadas son bloques distintos, y cada sello se cuenta por su nombre', () => {
    const { listado } = correr({
      'promedio-20260105.csv': [eje('5/01/26'), fila('P', (h) => -20 - h / 10)],
    }, {
      bahia: { 'p_quality-20260105.csv': [eje('5/01/26'), fila('P', (h) => ([1, 2, 3].includes(h) ? 'Not Renewed' : h === 16 ? 'Invalid' : 'Actual'))] },
    });
    assert.equal(listado.bloques.length, 2);
    assert.deepEqual(listado.resumen.horasPorSello, { 'Not Renewed': 3, Invalid: 1 });
    assert.equal(listado.resumen.horaSenal.actual, 20);
    assert.equal(listado.resumen.horaSenal.noActual, 4);
  });
});

describe('UN DÍA SIN SELLO NO ES UN DÍA «Actual»', () => {
  test('solo la carpeta del paso 2 —que aparta los sellos—: nada se da por medida, y sale con 1', () => {
    const { paso2 } = caso2004();
    const { codigo, texto, listado } = correr(paso2);
    assert.equal(codigo, 1);
    assert.match(texto, /NINGÚN ARCHIVO DE SELLO/);
    assert.match(texto, /--sellos/);
    assert.equal(listado.resumen.horaSenal.actual, 0);
    assert.deepEqual(listado.resumen.diasSinSello, ['2026-04-20']);
    assert.equal(listado.resumen.horaSenal.conValorSinSello, 48);
    assert.equal(listado.bloques.length, 0);
  });

  test('un día con valores y sin archivo de sello se dice «sin sello»; una señal sin sello en un día con sello, también', () => {
    const { codigo, texto, listado } = correr({
      'maximo-20260210.csv': [eje('10/02/26'), fila('I R', () => 100), fila('I S', () => 101)],
      'maximo-20260211.csv': [eje('11/02/26'), fila('I R', () => 100)],
    }, {
      bahia: { 'ir_quality-20260210.csv': [eje('10/02/26'), fila('I R', () => 'Actual')] },
    });
    assert.equal(codigo, 0);
    assert.deepEqual(listado.resumen.diasSinSello, ['2026-02-11']);
    assert.deepEqual(listado.resumen.senalDiasSinSello, [{ fecha: '2026-02-10', etiqueta: etiqueta('I S') }]);
    assert.equal(listado.resumen.horaSenal.actual, 24, 'solo la I R del 10-02');
    assert.equal(listado.resumen.horaSenal.conValorSinSello, 48, 'la I S del 10 y la I R del 11');
    assert.match(texto, /1 día\(s\) SIN SELLO —no se dan por «Actual»—: 2026-02-11/);
  });

  test('un sello que venga en la carpeta principal también se lee, sin --sellos', () => {
    const { codigo, listado } = correr({
      'minimo-20260420.csv': [eje(DIA), fila('I R', corrienteRetenida)],
      'x/ir_quality-20260420.csv': [eje(DIA), fila('I R', sellos(rango(7, 19)))],
    });
    assert.equal(codigo, 0);
    assert.equal(listado.bloques.length, 1);
    assert.deepEqual(listado.resumen.diasSinSello, []);
  });
});

describe('LOS VALORES DEL BLOQUE: congelados o imposibles', () => {
  test('valores que cambian en las horas malas NO son congelados', () => {
    const { listado } = correr({
      'instantaneo-20260115.csv': [eje('15/01/26'), fila('I R', (h) => 200 + h)],
    }, { bahia: { 'ir_quality-20260115.csv': [eje('15/01/26'), fila('I R', sellos([11, 12, 13]))] } });
    const [b] = listado.bloques;
    assert.equal(b.valores.congeladas, 0);
    assert.equal(b.valores.juzgables, 1);
  });

  test('una cifra absurda en una hora mala se señala; la misma cifra en una hora «Actual», no', () => {
    const absurdo = (h) => (h === 17 || h === 5 ? -98765432 : -30 + h / 10);
    const { listado, texto } = correr({
      'minimo-20260311.csv': [eje('11/03/26'), fila('P', absurdo), fila('I T', (h) => (h === 17 ? -5 : 300))],
    }, {
      bahia: {
        'p_quality-20260311.csv': [eje('11/03/26'), fila('P', sellos([16, 17, 18], 'Invalid'))],
        'it_quality-20260311.csv': [eje('11/03/26'), fila('I T', sellos([17], 'Invalid'))],
      },
    });
    const [b] = listado.bloques;
    assert.equal(b.valores.fueraDeRango, 2, 'la P de las 17 h y la corriente negativa; la P de las 5 h es «Actual»');
    const p = b.valores.detalleFueraDeRango.find((x) => x.etiqueta === etiqueta('P'));
    assert.deepEqual([p.fecha, p.hora, p.estadistico, p.valor], ['2026-03-11', 17, 'minimo', -98765432]);
    assert.match(texto, /FUERA DE RANGO FÍSICO EVIDENTE: 2 valor\(es\)/);
    assert.equal(listado.umbrales.horasIgualesParaCongelado, 3);
  });

  test('la retención se cuenta DESDE la hora anterior: dos horas malas que repiten la última buena son tres iguales', () => {
    const { listado } = correr({
      'instantaneo-20260216.csv': [eje('16/02/26'), fila('Q', (h) => ([9, 10, 11].includes(h) ? -7 : -8 + h / 100))],
    }, { bahia: { 'q_quality-20260216.csv': [eje('16/02/26'), fila('Q', sellos([10, 11]))] } });
    const [s] = listado.bloques[0].valores.detalleSeries;
    assert.equal(s.horasIguales, 3);
    assert.equal(s.congelada, true);
    assert.deepEqual([s.desde.hora, s.hasta.hora], [9, 11], 'la 9 h es la última «Actual»');
  });

  test('un bloque de UNA hora no se juzga congelado: se dice si repite la hora anterior', () => {
    const { listado, texto } = correr({
      'promedio-20260728.csv': [eje('28/07/26'), fila('Q', (h) => (h === 11 ? -7 : h === 10 ? -7 : -8 + h / 100))],
    }, { bahia: { 'q_quality-20260728.csv': [eje('28/07/26'), fila('Q', sellos([11]))] } });
    const [b] = listado.bloques;
    assert.equal(b.valores.juzgables, 0);
    assert.equal(b.valores.congeladas, 0);
    assert.equal(b.valores.repitenLaAnterior, 1);
    assert.match(texto, /bloque CORTO para juzgar congelado/);
  });

  test('con «;» y coma decimal el valor se lee igual', () => {
    const coma = (h) => (h >= 7 && h <= 18 ? '69,3' : `68,${h % 10}`);
    const { listado } = correr({
      'maximo-20260420.csv': [eje(DIA, ';'), fila('U RS', coma, ';')],
    }, { bahia: { 'urs_quality-20260420.csv': [eje(DIA), fila('U RS', sellos(rango(7, 19)))] } });
    const [s] = listado.bloques[0].valores.detalleSeries;
    assert.equal(s.valor, 69.3);
    assert.equal(s.congelada, true);
  });
});

describe('SOLO LECTURA, Y LO QUE NO SE LEE SE DICE', () => {
  test('las carpetas de datos quedan byte a byte como estaban, sin un archivo de más', () => {
    const { paso2, bahia } = caso2004();
    const { codigo, dias, carpetaBahia, previo } = correr(paso2, {
      bahia, antes: (c) => ({ dias: huella(c.dias), bahia: huella(c.carpetaBahia) }),
    });
    assert.equal(codigo, 0);
    assert.equal(Object.keys(previo.dias).length, 2);
    assert.deepEqual(huella(dias), previo.dias);
    assert.deepEqual(huella(carpetaBahia), previo.bahia);
  });

  test('el listado no se escribe encima de otro: sale con 2 y no lo toca', () => {
    const { paso2, bahia } = caso2004();
    const { codigo, texto, json } = correr(paso2, { bahia, jsonPrevio: 'viejo\n' });
    assert.equal(codigo, 2);
    assert.match(texto, /ya existe/);
    assert.equal(readFileSync(json, 'utf8'), 'viejo\n');
  });

  test('el listado lleva etiquetas reales: dentro del repositorio público no se escribe', () => {
    const vacia = mkdtempSync(join(tmpdir(), 'sellos-vacia-')); temporales.push(vacia);
    const dentro = join(dirname(HERRAMIENTA), '..', 'sellos-prueba-no-debe-quedar.json');
    temporales.push(dentro);   // si el guardián fallara, la prueba no deja el archivo detrás
    const r = spawnSync(process.execPath, [HERRAMIENTA, vacia, '--json', dentro], { encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /dentro del repositorio/);
    assert.equal(existsSync(dentro), false);
  });

  test('las medidas de la carpeta de sellos no se leen: no hay choque con las del paso 2', () => {
    const { paso2, bahia } = caso2004();
    const { codigo, texto, listado } = correr(paso2, { bahia });
    assert.equal(codigo, 0);
    assert.equal(listado.resumen.choques, 0);
    assert.match(texto, /1 de medida en la carpeta de sellos, sin leer/);
  });

  test('dos sellos distintos para la misma hora: se enseñan los dos, cuenta como NO «Actual» y sale con 1', () => {
    const { codigo, listado, texto } = correr({
      'maximo-20260420.csv': [eje(DIA), fila('I R', corrienteRetenida)],
    }, {
      bahia: {
        'ir_quality-20260420.csv': [eje(DIA), fila('I R', () => 'Actual')],
        'ir_quality-20260420(1).csv': [eje(DIA), fila('I R', sellos([9]))],
      },
    });
    assert.equal(codigo, 1);
    assert.deepEqual(listado.resumen.horasPorSello, { 'Actual / Not Renewed': 1 });
    assert.equal(listado.resumen.choques, 1);
    assert.match(texto, /CHOQUE/);
  });

  test('un archivo sin estadístico en el nombre se aparta con su nombre y sale con 1', () => {
    const { paso2, bahia } = caso2004();
    const { codigo, texto } = correr({ ...paso2, 'sin-marca.csv': [eje(DIA), fila('I T', () => 5)] }, { bahia });
    assert.equal(codigo, 1);
    assert.match(texto, /«sin-marca\.csv» · el nombre no dice qué estadístico trae/);
  });

  test('si la carga mezcla día/mes con mes/día no se informa nada', () => {
    const { codigo, texto } = correr({
      'maximo-a.csv': [eje('1/13/26'), fila('I R', () => 1)],     // demuestra mes/día
      'maximo-b.csv': [eje('1/05/26'), fila('I R', () => 1)],     // sin prueba: se leería día/mes
    }, { bahia: { 'ir_quality-a.csv': [eje('1/13/26'), fila('I R', () => 'Actual')] } });
    assert.equal(codigo, 1);
    assert.match(texto, /NO SE INFORMA NADA/);
  });

  test('sin carpeta, o con una opción sin ruta, sale con 2', () => {
    assert.equal(spawnSync(process.execPath, [HERRAMIENTA], { encoding: 'utf8' }).status, 2);
    const { codigo } = correr({ 'maximo-20260420.csv': [eje(DIA), fila('I R', () => 1)] }, { extra: ['--sellos'] });
    assert.equal(codigo, 2);
  });
});
