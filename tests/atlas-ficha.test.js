// ============================================================================
// tests/atlas-ficha.test.js — los atlas publicados y la pantalla que los lee
// hablan el MISMO idioma
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. Los atlas del Caribe son archivos que viajan con el sitio y una
// pantalla que los abre. Entre los dos hay una frontera, y esa frontera ya
// demostró en este proyecto que se rompe EN SILENCIO: nada avisa cuando el dato
// deja de traer lo que el lector busca — la pantalla enseña un hueco, o peor, un
// número de otra cosa (`30 · L-68`, `99 §ADR-052`).
//
// Al construir el atlas de temperatura, el resumen de cada día dejó de llamarse
// `energiaDiaria` —que en un mapa de grados es un nombre falso— y pasó a
// `resumenDiario`. Si el archivo solar publicado se hubiera quedado con el
// nombre viejo, la pestaña habría abierto un atlas mudo: mapa bien pintado y
// «energía del día» vacía para siempre. Este guardián recorre los archivos
// REALES, no una copia hecha a mano.
//
// ⚠️ Comprueba FORMA y COHERENCIA, no la verdad del dato: que NASA haya medido
// bien no lo puede decir una prueba. Lo que sí puede decir es que lo publicado
// encaja con su propia declaración — que el PNG mide lo que la ficha promete, y
// que la codificación representa lo que la ficha dice haber medido.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { mesesOfrecidos, bandaDelDia, resumenDelDia } from '../web/src/vistas/atlasCaribe.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAPAS = join(RAIZ, 'web/public/mapas');

/** Los productos publicados. Añadir uno es una fila aquí. */
const ATLAS = ['sol-caribe', 'temp-caribe', 'viento-caribe', 'lluvia-caribe', 'nubes-caribe'];

const ficha = (prefijo) => JSON.parse(readFileSync(join(MAPAS, `${prefijo}.json`), 'utf-8'));

describe('los atlas están publicados y son legibles', () => {
  for (const prefijo of ATLAS) {
    test(`${prefijo}: la ficha existe y trae lo que la pantalla pide`, () => {
      assert.ok(existsSync(join(MAPAS, `${prefijo}.json`)), `falta ${prefijo}.json`);
      const f = ficha(prefijo);
      // Los campos que la pantalla LEE. Uno que falte no da error en el
      // navegador: pinta un hueco y sigue como si nada.
      for (const campo of ['capa', 'titulo', 'departamentos', 'bbox', 'ancho', 'alto',
        'unidad', 'codificacion', 'cuadros', 'anio', 'meses', 'ultimoDiaConHoras',
        'construido', 'resumenDiario', 'resumenDiarioEtiqueta', 'resumenDiarioUnidad',
        'resumenDiarioAviso', 'rampa', 'aviso', 'fuente', 'atribucion']) {
        assert.ok(f[campo] !== undefined, `${prefijo}.json no trae \`${campo}\``);
      }
      assert.match(f.atribucion, /NASA/, 'la ficha perdió la atribución de NASA');
      assert.equal(f.departamentos.length, 7, 'son los SIETE departamentos del Caribe');
    });

    test(`${prefijo}: el PNG de cada mes mide lo que la ficha promete`, () => {
      const f = ficha(prefijo);
      const anchoEsperado = f.cuadros.horas * f.ancho;
      for (const m of f.meses) {
        const ruta = join(MAPAS, m.archivo);
        assert.ok(existsSync(ruta), `falta ${m.archivo}`);
        // Las dimensiones van en el IHDR del PNG: bytes 16-23. Leerlas es más
        // barato que decodificar, y es justo lo que la pantalla necesita que
        // cuadre — si no cuadra, `cuadroDe` devuelve `null` y el mapa se queda
        // en blanco sin una sola línea en la consola.
        const buf = readFileSync(ruta);
        const ancho = buf.readUInt32BE(16), alto = buf.readUInt32BE(20);
        assert.equal(ancho, anchoEsperado,
          `${m.archivo} mide ${ancho} de ancho y la ficha promete ${anchoEsperado}`);
        assert.equal(alto, m.dias * f.alto,
          `${m.archivo} mide ${alto} de alto y la ficha promete ${m.dias * f.alto}`);
        assert.equal(statSync(ruta).size, m.bytes, `${m.archivo} no pesa lo que dice la ficha`);
      }
    });

    test(`${prefijo}: la codificación representa lo que se midió`, () => {
      const f = ficha(prefijo);
      if (!f.medido) return;   // fichas anteriores al campo: no se inventa nada
      const tope = (255 - 1) * f.codificacion.paso + f.codificacion.offset;
      assert.ok(f.medido.min >= f.codificacion.offset,
        `el mínimo medido (${f.medido.min}) cae por debajo de lo representable`);
      assert.ok(f.medido.max <= tope,
        `el máximo medido (${f.medido.max}) se sale por arriba: se publicaría aplanado`);
      // Y la RAMPA tiene que cubrir lo medido, o el extremo sale del color del
      // borde y se lee como un recorte del dato.
      assert.ok(f.rampa[0].c <= f.medido.min,
        `la rampa empieza en ${f.rampa[0].c} y se midió ${f.medido.min}`);
      assert.ok(f.rampa[f.rampa.length - 1].c >= f.medido.max,
        `la rampa acaba en ${f.rampa[f.rampa.length - 1].c} y se midió ${f.medido.max}`);
    });

    test(`${prefijo}: todo mes ofrecido se puede abrir, y las tres bandas cuadran`, () => {
      const f = ficha(prefijo);
      const ofrecidos = mesesOfrecidos(f);
      assert.ok(ofrecidos.length > 0, 'no se ofrece ni un mes');
      // El fallo que cazó la revisión adversarial: meses descargados, pesados y
      // publicados… e inalcanzables desde la pantalla.
      for (const m of f.meses) {
        assert.ok(ofrecidos.some((o) => o.clave === m.clave),
          `el mes ${m.clave} tiene PNG y la pantalla no lo ofrece`);
      }
      // El último día con horas tiene que caer en la banda de horas, y el
      // siguiente NO. Es la frontera que la pantalla dibuja.
      assert.equal(bandaDelDia(f, f.ultimoDiaConHoras), 'horas');
      const dia = new Date(f.ultimoDiaConHoras + 'T00:00:00Z');
      dia.setUTCDate(dia.getUTCDate() + 1);
      assert.notEqual(bandaDelDia(f, dia.toISOString().slice(0, 10)), 'horas',
        'el día siguiente al último con horas sigue diciendo que tiene horas');
    });

    test(`${prefijo}: el resumen del día se lee por su fecha`, () => {
      const f = ficha(prefijo);
      const primero = f.resumenDiario[0];
      assert.ok(primero, 'la ficha no trae ni un día resumido');
      assert.equal(resumenDelDia(f, primero.d), primero.v);
      // ⚠️ Un día que no consta es `null`, NUNCA 0: un cero se pintaría como una
      // medida real —cero energía, cero grados— y las dos serían mentira.
      assert.equal(resumenDelDia(f, '1999-01-01'), null);
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
describe('los atlas son gemelos, no primos', () => {
  test('mismo recuadro, misma malla y los mismos siete departamentos', () => {
    const [primero, ...resto] = ATLAS.map(ficha);
    for (const f of resto) {
      assert.deepEqual(f.bbox, primero.bbox, `${f.capa} no cubre el mismo recuadro`);
      assert.equal(f.ancho, primero.ancho, `${f.capa}: otra malla`);
      assert.equal(f.alto, primero.alto, `${f.capa}: otra malla`);
      assert.deepEqual(f.departamentos, primero.departamentos, `${f.capa}: otros departamentos`);
      assert.deepEqual(f.cuadros, primero.cuadros, `${f.capa}: otro empaquetado`);
    }
  });

  test('cada uno mide lo SUYO: ni la capa ni la unidad se repiten', () => {
    const fichas = ATLAS.map(ficha);
    const capas = fichas.map((f) => f.capa);
    assert.equal(new Set(capas).size, capas.length, 'dos atlas comparten nombre de capa');
    const unidades = fichas.map((f) => f.unidad);
    assert.equal(new Set(unidades).size, unidades.length,
      'dos atlas publican la misma unidad: o uno está copiado del otro, o falta convertir');
  });

  test('la marca de hipótesis está donde tiene sentido, y NO donde engañaría', () => {
    const por = Object.fromEntries(ATLAS.map((p) => [p, ficha(p)]));
    // Donde el mapa SÍ puede acercar la conversación, se marca:
    assert.equal(por['sol-caribe'].hipotesisMarcadaEnRampa, 1000,
      'el sol marca los 1.000 W/m² adoptados de la ampacidad');
    assert.equal(por['temp-caribe'].hipotesisMarcadaEnRampa, 32,
      'la temperatura marca el escenario de REFERENCIA de la pestaña Térmica');
    // ⚠️ Y donde NO, no se marca. El viento de la hipótesis son 100 km/h con
    // periodo de retorno de decenas de años; un año de medias horarias ni lo
    // confirma ni lo desmiente, y marcarlo invitaría a la comparación falsa que
    // `99 §ADR-035` ya prohibió para el pronóstico.
    assert.equal(por['viento-caribe'].hipotesisMarcadaEnRampa, undefined,
      'el viento NO puede marcar los 100 km/h: son un extremo de diseño, no un día');
    assert.match(por['viento-caribe'].aviso, /NO VALIDA NI DESMIENTE/,
      'y el aviso tiene que decirlo con esas palabras');
    assert.equal(por['lluvia-caribe'].hipotesisMarcadaEnRampa, undefined);
  });

  test('la lluvia horaria está en milímetros de esa hora, no en la tasa de la fuente', () => {
    // ⚠️ EL FACTOR DE 24. NASA publica el paso horario de `PRECTOTCORR` como una
    // TASA en mm/día. Sin convertir, una hora se leería 24 veces más lluviosa de
    // lo que fue. El máximo publicado tiene que ser compatible con milímetros de
    // una hora — con la tasa cruda, el máximo del año rondaría los 1.000.
    const f = ficha('lluvia-caribe');
    assert.equal(f.unidad, 'mm');
    assert.ok(f.medido.max < 100,
      `el máximo publicado (${f.medido?.max}) parece la tasa mm/día sin dividir entre 24`);
  });
});
