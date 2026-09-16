// ============================================================================
// tests/extraer-bahia.test.js — el PASO 1 del SCADA, con prueba
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. `herramientas/extraer-bahia.mjs` se queda con las señales de
// UNA bahía de la exportación de la red entera, y de lo que deja sale todo lo
// que se carga en el histórico, que no se borra. Vivió desde el 07-09 sin una
// sola prueba, y al preparar dos líneas nuevas (16-09) se midieron sobre la
// exportación real tres maneras de equivocarse EN SILENCIO:
//   · el patrón se probaba contra la fila ENTERA: uno corto se llevaba filas de
//     otras bahías solo porque un VALOR contenía esas cifras;
//   · un patrón sin el relleno de espacios de la etiqueta no elegía nada y la
//     herramienta terminaba «bien», con el destino vacío;
//   · nada impedía que el resultado mezclara dos bahías.
// Cada una tiene aquí su caso. Y un bloque final comprueba que lo que ya salía
// bien —la forma de los archivos— sale igual que con la versión anterior.
//
// ⚠️ Etiquetas y nombres INVENTADOS (/SubA, /SubB, BAHIA1): los reales traen
// subestaciones de cliente y este repositorio es público (`33 · L-07`). Los
// archivos se crean en una carpeta temporal y se borran al acabar.
// ============================================================================
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERRAMIENTA = join(dirname(fileURLToPath(import.meta.url)), '..', 'herramientas', 'extraer-bahia.mjs');
const temporales = [];
after(() => { for (const d of temporales) rmSync(d, { recursive: true, force: true }); });

/** Una fila de eje con 24 horas, como la exporta el SCADA: primera celda vacía. */
const eje = (sep = ',') => ['', ...Array.from({ length: 24 }, (_, h) => `2/02/26 ${h}:00`)].join(sep);
/** Una fila de señal: la etiqueta tal cual y 24 valores que empiezan en `base`. */
const fila = (etiqueta, base, sep = ',', decimal = (n) => String(n)) => [
  etiqueta, ...Array.from({ length: 24 }, (_, h) => decimal(base + h))].join(sep);

// Etiquetas con el relleno de espacios que trae la exportación real.
const A_IR = '/SubA  /66kV    /BAHIA1  /I R     /Momento';
const A_URS = '/SubA  /66kV    /BAHIA1  /U RS    /Momento';
const B_IR = '/SubB  /66kV    /BAHIA2  /I R     /Momento';

/**
 * Monta `{ 'carpeta/archivo.csv': [lineas] | 'texto' }` en un origen temporal,
 * corre la herramienta y devuelve el código, lo que dijo y lo que dejó.
 */
function correr(arbol, ...argumentos) {
  const raiz = mkdtempSync(join(tmpdir(), 'extraer-bahia-'));
  temporales.push(raiz);
  const origen = join(raiz, 'origen'); const destino = join(raiz, 'destino');
  mkdirSync(origen, { recursive: true });
  for (const [ruta, lineas] of Object.entries(arbol)) {
    mkdirSync(dirname(join(origen, ruta)), { recursive: true });
    writeFileSync(join(origen, ruta), typeof lineas === 'string' ? lineas : lineas.join('\n') + '\n');
  }
  const r = spawnSync(process.execPath, [HERRAMIENTA, origen, destino, ...argumentos], { encoding: 'utf8' });
  const salida = {}; const carpetas = [];
  (function recorrer(d) {
    if (!existsSync(d)) return;
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) { carpetas.push(relative(destino, p)); recorrer(p); }
      else salida[relative(destino, p)] = readFileSync(p, 'utf8');
    }
  })(destino);
  return { codigo: r.status, texto: r.stdout + r.stderr, salida, carpetas, origen };
}

describe('EL PATRÓN MIRA SOLO LA ETIQUETA, NUNCA LOS VALORES', () => {
  test('un patrón corto no se lleva la fila de otra bahía cuyos VALORES lo contienen', () => {
    const suya = fila('/SubA  /66kV    /BAHIA17 /I R     /Momento', 100);
    const ajena = fila(B_IR, 117);                       // 117, 118… y 217: contienen «17»
    const { codigo, salida, texto } = correr({ '02Feb/ir_max-x.csv': [eje(), suya, ajena] }, '17');
    assert.equal(codigo, 0, texto);
    assert.equal(salida['02Feb/ir_max-x.csv'], [eje(), suya].join('\n') + '\n',
      'antes: la fila de /SubB entraba también, y el resultado mezclaba dos bahías');
  });

  test('con «;» y coma decimal la etiqueta sigue siendo solo el primer campo', () => {
    const coma = (n) => `${n},17`;
    const suya = fila('/SubA  /66kV    /BAHIA17 /I R     /Momento', 100, ';', coma);
    const ajena = fila(B_IR, 300, ';', coma);            // «300,17»: el valor lleva «17»
    const { codigo, salida } = correr({ 'd/ir_max-x.csv': [eje(';'), suya, ajena] }, '17');
    assert.equal(codigo, 0);
    assert.equal(salida['d/ir_max-x.csv'], [eje(';'), suya].join('\n') + '\n');
  });

  test('una etiqueta entre comillas se lee entera: la coma de dentro no la corta', () => {
    const suya = `"/SubA /66kV /BAHIA1/I R, fase",${Array(24).fill(1).join(',')}`;
    const { codigo, salida } = correr({ 'd/ir_max-x.csv': [eje(), suya, fila(B_IR, 5)] }, 'I R, fase');
    assert.equal(codigo, 0);
    assert.equal(salida['d/ir_max-x.csv'], [eje(), suya].join('\n') + '\n');
  });

  test('un patrón que solo aparece en los valores no elige nada, y eso es un error', () => {
    const { codigo, salida } = correr({ 'd/ir_max-x.csv': [eje(), fila(A_IR, 117)] }, '118');
    assert.equal(codigo, 1, 'antes: elegía la fila por su valor 118');
    assert.deepEqual(salida, {});
  });
});

describe('CERO FILAS ES UN ERROR, NO UN MES VACÍO', () => {
  test('ninguna etiqueta coincide: sale con error, lo dice y no escribe nada', () => {
    const { codigo, texto, salida, carpetas } = correr({
      '01Feb/ir_max-a.csv': [eje(), fila(A_IR, 100)],
      '02Feb/ir_max-b.csv': [eje(), fila(A_IR, 200)],
    }, 'BAHIA9');
    assert.equal(codigo, 1, 'antes: código 0 y una carpeta de destino vacía');
    assert.match(texto, /no eligió NINGUNA fila/);
    assert.match(texto, /No se escribe nada/);
    assert.deepEqual(salida, {});
    assert.deepEqual(carpetas, [], 'ni las carpetas de los días');
  });

  test('un origen sin un solo CSV es un error, y la culpa NO es del patrón', () => {
    // Como mayo, que el portal no dejó bajar: solo trae avisos .txt.
    const { codigo, texto } = correr({ 'd/notas.txt': 'nada' }, 'BAHIA1');
    assert.equal(codigo, 1);
    assert.match(texto, /no hay NINGÚN archivo CSV/);
    assert.doesNotMatch(texto, /espacios/, 'sin CSV, hablar de los espacios del patrón despista');
  });
});

describe('UNA SOLA BAHÍA, COMPROBADA', () => {
  test('dos bahías: sale con error, nombra las dos y no escribe NADA, ni lo del primer día', () => {
    const { codigo, texto, salida, carpetas } = correr({
      '01Feb/ir_max-a.csv': [eje(), fila(A_IR, 100)],     // este día solo trae la buena
      '02Feb/ir_max-b.csv': [eje(), fila(B_IR, 200)],     // y aquí aparece la otra
    }, '/Sub. .*/66kV');
    assert.equal(codigo, 1);
    assert.match(texto, /eligió filas de 2 bahías distintas/);
    assert.match(texto, /\/SubA\/66kV\/BAHIA1/);
    assert.match(texto, /\/SubB\/66kV\/BAHIA2/);
    assert.deepEqual(salida, {}, 'ni un archivo a medias');
    assert.deepEqual(carpetas, []);
  });

  test('un nombre que es el principio de otro son DOS bahías: BAHIA1 no es BAHIA10', () => {
    const { codigo, texto, salida } = correr({
      'd/ir_max-a.csv': [eje(), fila('/SubA/66kV/BAHIA1/I R/Momento', 1), fila('/SubA/66kV/BAHIA10/I R/Momento', 2)],
    }, 'BAHIA1');
    assert.equal(codigo, 1);
    assert.match(texto, /2 bahías distintas/);
    assert.deepEqual(salida, {});
  });

  test('la misma bahía con señales distintas es UNA: se escribe y se listan sus etiquetas', () => {
    const { codigo, texto, salida } = correr({
      'd/ir_max-a.csv': [eje(), fila(A_IR, 100), fila(B_IR, 5)],
      'd/urs_max-a.csv': [eje(), fila(A_URS, 66)],
    }, 'BAHIA1');
    assert.equal(codigo, 0, texto);
    assert.deepEqual(Object.keys(salida).sort(), ['d/ir_max-a.csv', 'd/urs_max-a.csv']);
    assert.match(texto, /Etiquetas elegidas por «BAHIA1» \(2\)/);
    assert.ok(texto.includes(`«${A_IR}»`), 'la etiqueta tal cual, con sus espacios');
    assert.ok(texto.includes(`«${A_URS}»`));
    assert.match(texto, /Bahía: \/SubA\/66kV\/BAHIA1/);
  });

  test('otra bahía de la misma subestación y tensión también cuenta como otra: se rechaza', () => {
    const { codigo, salida } = correr({
      'd/ir_max-a.csv': [eje(), fila(A_IR, 1), fila('/SubA  /66kV    /BAHIA3  /I R     /Momento', 2)],
    }, '/SubA');
    assert.equal(codigo, 1);
    assert.deepEqual(salida, {});
  });
});

describe('ESPACIOS', () => {
  test('el relleno no parte una bahía en dos: con o sin espacios, recortados, es la misma', () => {
    const { codigo, texto, salida } = correr({
      'd/ir_max-a.csv': [eje(), fila(A_IR, 100)],
      'd/urs_max-a.csv': [eje(), fila('/SubA/66kV/BAHIA1/U RS/Momento', 66)],
    }, 'SubA.*BAHIA1');
    assert.equal(codigo, 0, texto);
    assert.equal(Object.keys(salida).length, 2);
    assert.match(texto, /Bahía: \/SubA\/66kV\/BAHIA1$/m);
  });

  test('ni la caja: el patrón no distingue mayúsculas y la bahía tampoco', () => {
    const { codigo, texto } = correr({
      'd/ir_max-a.csv': [eje(), fila('/SubA/66kV/Bahia1/I R/Momento', 1), fila('/SUBA/66KV/BAHIA1/I S/Momento', 2)],
    }, 'bahia1');
    assert.equal(codigo, 0, texto);
  });

  test('el patrón con el relleno exacto elige sus filas', () => {
    const { codigo, salida } = correr({ 'd/ir_max-a.csv': [eje(), fila(A_IR, 100), fila(B_IR, 5)] },
      '/SubA  /66kV    /BAHIA1');
    assert.equal(codigo, 0);
    assert.equal(salida['d/ir_max-a.csv'], [eje(), fila(A_IR, 100)].join('\n') + '\n');
  });

  test('el patrón SIN el relleno no elige nada: error, nada escrito y la pista de qué encontraría', () => {
    const { codigo, texto, salida } = correr({ 'd/ir_max-a.csv': [eje(), fila(A_IR, 100), fila(B_IR, 5)] },
      '/SubA /66kV /BAHIA1');
    assert.equal(codigo, 1, 'antes: código 0 y nada escrito, en silencio');
    assert.deepEqual(salida, {});
    assert.match(texto, /rellena cada tramo con espacios/);
    assert.match(texto, /Recortando esos espacios, el patrón sí encontraría 1 bahía\(s\):\s+\/SubA\/66kV\/BAHIA1/);
    assert.ok(!/BAHIA2/.test(texto), 'la pista no nombra bahías que no coinciden');
  });
});

describe('LO QUE YA SALÍA BIEN SALE IGUAL', () => {
  /** La selección de la versión anterior, copiada tal cual: la fila ENTERA contra el patrón. */
  function comoAntes(texto, re) {
    const lineas = texto.split(/\r?\n/);
    const iEje = lineas.findIndex((l) => l.trim() !== '');
    if (iEje < 0) return null;
    const suyas = lineas.slice(iEje + 1).filter((l) => re.test(l));
    return suyas.length ? [lineas[iEje], ...suyas].join('\n') + '\n' : null;
  }

  test('con un patrón que solo cabe en la etiqueta, cada archivo es byte a byte el de antes', () => {
    const calidad = [A_IR, ...Array(24).fill('Actual')].join(',');
    const arbol = {
      '01Feb/ir_max-20260201.csv': [eje(), fila(B_IR, 1), fila(A_IR, 100), fila(A_URS, 66)],
      '01Feb/ir_quality-20260201.csv': [eje(), fila(B_IR, 1), calidad],
      '01Feb/p_max-20260201(1).csv': `${eje()}\r\n${fila(A_IR, 7)}\r\n${fila(B_IR, 8)}\r\n`,   // CRLF
      '01Feb/sin-la-bahia.csv': [eje(), fila(B_IR, 3)],
      '01Feb/solo-eje.csv': [eje()],
      '01Feb/vacio.csv': '',
      '02Feb/q_max-20260202.csv': ['', eje(), fila(A_URS, 9), fila(B_IR, 9)],      // eje tras una línea en blanco
      '03Feb/sin-la-bahia.csv': [eje(), fila(B_IR, 4)],
    };
    const patron = '/SubA .*/BAHIA1';
    const { codigo, salida, carpetas, origen } = correr(arbol, patron);
    assert.equal(codigo, 0);

    const esperado = {};
    for (const ruta of Object.keys(arbol)) {
      const antes = comoAntes(readFileSync(join(origen, ruta), 'utf8'), new RegExp(patron, 'i'));
      if (antes !== null) esperado[ruta] = antes;
    }
    assert.deepEqual(salida, esperado);
    assert.deepEqual(Object.keys(salida).sort(), [
      '01Feb/ir_max-20260201.csv', '01Feb/ir_quality-20260201.csv', '01Feb/p_max-20260201(1).csv',
      '02Feb/q_max-20260202.csv',
    ], 'los archivos sin la bahía no se escriben');
    assert.deepEqual(carpetas, ['01Feb', '02Feb', '03Feb'], 'y el día sin la bahía deja su carpeta vacía, como antes');
  });

  test('sin subcarpetas, la carpeta misma es el día', () => {
    const { codigo, salida } = correr({ 'ir_max-a.csv': [eje(), fila(A_IR, 1)] }, 'BAHIA1');
    assert.equal(codigo, 0);
    assert.deepEqual(Object.keys(salida), ['origen/ir_max-a.csv']);
  });

  test('sin patrón no hay bahía por defecto, y un patrón roto se dice', () => {
    assert.equal(correr({ 'd/a.csv': [eje(), fila(A_IR, 1)] }).codigo, 2);
    const roto = correr({ 'd/a.csv': [eje(), fila(A_IR, 1)] }, 'BAHIA(1');
    assert.equal(roto.codigo, 2);
    assert.match(roto.texto, /no es una expresión regular válida/);
  });
});
