// ============================================================================
// tests/sembrar-ficha-de-linea.test.js — el sembrador no le presta a una línea
// los datos de otra, y ya no toca permisos ni el interruptor de la IA
// ----------------------------------------------------------------------------
// EL DAÑO QUE EVITA, en concreto. Hasta el 2026-09-16 `herramientas/sembrar.mjs`
// llevaba escritos a mano la tensión (66 kV), un circuito, el conductor Darien y
// las hipótesis de LN-627. Sembrar cualquier otra línea le habría puesto todo
// eso sin decir nada: la ampacidad, la cargabilidad y el veredicto mecánico de
// la línea nueva saldrían de los datos de otra, presentados como suyos. Ahora
// cada línea trae su FICHA en la bóveda y, si falta algo, no se siembra.
//
// Y dos cosas que el sembrador hacía y no le tocaban:
//   · `--admin` reescribía los permisos de una cuenta con `{orgId, rol:'admin'}`
//     sin funciones ni alcance: al propietario lo dejaba sin leer ni escribir.
//     Desde `99 §ADR-100` solo el trabajador de `usuarios/` escribe permisos.
//   · `config/ia` se ponía `enabled:false` en CADA corrida: resembrar apagaba la
//     IA sin que nadie lo decidiera.
//
// EL MUNDO ES SINTÉTICO: línea «LX-1», conductor y cifras inventados. La ficha
// real de LN-627 solo se lee de la bóveda, y esas pruebas se saltan donde la
// bóveda no está (en CI, que es lo esperado).
//
// El sembrador no se puede importar —aborta sin credencial—, así que lo que es
// del script se vigila POR TEXTO, con el mismo patrón que
// tests/identidad-apoyos.test.js: el fallo consiste en volver a escribir la
// línea prohibida.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { construirLinea, faltasDeLaFichaDeLinea, FICHA_DE_LINEA } from '../herramientas/construir-apoyos.mjs';
import { idDeSemilla } from '../herramientas/identidad.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const AHORA = '2026-09-16T00:00:00.000Z';

/** Una ficha completa de una línea que no existe. Cifras inventadas. */
const fichaSintetica = () => ({
  _nota: 'nota para quien lee: no viaja a la base',
  codigo: 'LX-1',
  linea: {
    nombre: 'Línea LX-1',
    tensionNominal_kV: 34.5,
    circuitos: 2,
    activa: true,
    conductor: {
      codigo: 'Inventado', material: 'Otro', calibre: '1 MCM', formacion: '7',
      seccion_mm2: 100, diametro_m: 0.01, masaLineal_kg_m: 0.3, rts_kgf: 3000,
      moduloElastico_kg_mm2: 7000, moduloEs: 'final', dilatacion_1_C: 1e-5,
      tempMaxOperacion_C: 75, procedencia: 'catalogo_fabricante',
      fuente: 'ficha inventada para la prueba, rev. 0',
    },
  },
  hipotesis: {
    nombre: 'Hipótesis inventada',
    eds_pct: 18, tempEds_C: 25, tempMax_C: 70, tempMin_C: 10,
    vientoMax_kmh: 0, tempViento_C: 20, cx: 1.1, densidadAire_kg_m3: 1.1,
    despejeMinimo_m: { categoria_inventada: 6 },
    normaReferencia: 'norma inventada, tabla 0',
    procedencia: 'documento_proyecto',
    congelada: true,
  },
});

const construir = (ficha = fichaSintetica(), codigo = 'LX-1') =>
  construirLinea(codigo, ficha, { ahora: AHORA });

// ════════════════════════════════════════════════════════════════════════════
describe('LA FICHA MANDA — cada cifra de la línea sale de SU ficha', () => {

  test('la línea lleva lo que dice su ficha, no los 66 kV ni el Darien de LN-627', () => {
    const { linea } = construir();
    assert.equal(linea.tipo, 'linea');
    assert.equal(linea.codigo, 'LX-1');
    assert.equal(linea.nombre, 'Línea LX-1');
    assert.equal(linea.tensionNominal_kV, 34.5);
    assert.equal(linea.circuitos, 2);
    assert.equal(linea.conductor.codigo, 'Inventado');
    assert.equal(linea.conductor.procedencia, 'catalogo_fabricante');
  });

  test('la hipótesis lleva lo que dice su ficha y cuelga de SU línea', () => {
    const { linea, hipotesis } = construir();
    assert.equal(hipotesis.tipo, 'hipotesis');
    assert.equal(hipotesis.lineaId, linea.id);
    assert.equal(linea.hipotesisId, hipotesis.id);
    assert.equal(hipotesis.vientoMax_kmh, 0, 'un cero declarado es un dato, no una ausencia');
    assert.equal(hipotesis.congelada, true);
    assert.deepEqual(hipotesis.despejeMinimo_m, { categoria_inventada: 6 });
  });

  test('los ids salen de la línea, con las mismas semillas de siempre', () => {
    const { linea, hipotesis } = construir();
    assert.equal(linea.id, idDeSemilla('LX-1', 'linea'));
    assert.equal(hipotesis.id, idDeSemilla('LX-1', 'hipotesis-modulo-campo'));
  });

  test('el orden de las claves es el que tenía el sembrador (LN-627 sale byte a byte igual)', () => {
    const { linea, hipotesis } = construir();
    assert.deepEqual(Object.keys(linea), ['id', 'orgId', 'creadoEn', 'creadoPor', 'revision',
      'tipo', 'codigo', 'nombre', 'tensionNominal_kV', 'circuitos', 'activa', 'hipotesisId', 'conductor']);
    assert.deepEqual(Object.keys(hipotesis).slice(0, 8),
      ['id', 'orgId', 'creadoEn', 'creadoPor', 'revision', 'tipo', 'nombre', 'lineaId']);
    assert.equal(linea.revision, 0);
    assert.equal(linea.creadoPor, 'sembrador');
    assert.equal(linea.creadoEn, AHORA);
  });

  test('las notas «_» de la ficha no viajan a la base', () => {
    const ficha = fichaSintetica();
    ficha.linea._nota = 'x';
    ficha.linea.conductor._nota = 'x';
    ficha.hipotesis._nota = 'x';
    const { linea, hipotesis } = construir(ficha);
    for (const doc of [linea, linea.conductor, hipotesis]) {
      assert.deepEqual(Object.keys(doc).filter((k) => k.startsWith('_')), []);
    }
  });

  test('lo que la ficha declare además de lo obligatorio se escribe tal cual', () => {
    const ficha = fichaSintetica();
    ficha.linea.tensionMaxima_kV = 36;
    ficha.hipotesis.tiroAdmisible_pct = 25;
    const { linea, hipotesis } = construir(ficha);
    assert.equal(linea.tensionMaxima_kV, 36);
    assert.equal(hipotesis.tiroAdmisible_pct, 25);
  });

  test('dos líneas con fichas distintas no comparten ninguna cifra ni ningún id', () => {
    const otra = fichaSintetica();
    otra.codigo = 'LX-2';
    otra.linea.tensionNominal_kV = 110;
    const a = construir();
    const b = construir(otra, 'LX-2');
    assert.notEqual(a.linea.id, b.linea.id);
    assert.notEqual(a.hipotesis.id, b.hipotesis.id);
    assert.notEqual(a.linea.tensionNominal_kV, b.linea.tensionNominal_kV);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('SIN FICHA COMPLETA NO SE SIEMBRA — y se dice QUÉ falta', () => {

  test('la ficha sintética completa no tiene faltas', () => {
    assert.deepEqual(faltasDeLaFichaDeLinea('LX-1', fichaSintetica()), []);
  });

  test('NADA POR DEFECTO: quitar cualquier campo obligatorio aborta y lo nombra', () => {
    const secciones = {
      linea: (f) => f.linea,
      conductor: (f) => f.linea.conductor,
      hipotesis: (f) => f.hipotesis,
    };
    let revisados = 0;
    for (const [seccion, obtener] of Object.entries(secciones)) {
      for (const campo of Object.keys(FICHA_DE_LINEA[seccion])) {
        const ficha = fichaSintetica();
        delete obtener(ficha)[campo];
        assert.throws(() => construir(ficha), new RegExp(`${campo}[^\\n]*falta`),
          `sin «${seccion}.${campo}» se sembró igual: ese valor lo habría puesto alguien que no es la ficha`);
        revisados++;
      }
    }
    // El pulso del propio barrido: si la tabla se vaciara, esto pasaría sin mirar nada.
    assert.ok(revisados >= 25, `solo se revisaron ${revisados} campos`);
  });

  test('ni siquiera los que el molde de los datos rellenaría solo (cx, densidad, moduloEs, circuitos, activa)', () => {
    for (const [ruta, borrar] of [
      ['hipotesis.cx', (f) => delete f.hipotesis.cx],
      ['hipotesis.densidadAire_kg_m3', (f) => delete f.hipotesis.densidadAire_kg_m3],
      ['linea.conductor.moduloEs', (f) => delete f.linea.conductor.moduloEs],
      ['linea.circuitos', (f) => delete f.linea.circuitos],
      ['linea.activa', (f) => delete f.linea.activa],
    ]) {
      const ficha = fichaSintetica();
      borrar(ficha);
      assert.ok(faltasDeLaFichaDeLinea('LX-1', ficha).some((f) => f.startsWith(ruta)), `no se exigió ${ruta}`);
    }
  });

  test('dice TODO lo que falta de una vez, no a golpe de corrida', () => {
    const ficha = fichaSintetica();
    delete ficha.linea.conductor.fuente;
    delete ficha.hipotesis.cx;
    ficha.linea.circuitos = 2.5;
    const faltas = faltasDeLaFichaDeLinea('LX-1', ficha);
    assert.equal(faltas.length, 3, faltas.join(' | '));
  });

  test('una ficha COPIADA de otra línea sin editar no entra', () => {
    // El riesgo exacto: copiar la ficha de LN-627 para una línea nueva y
    // olvidarse de cambiarla. El código de la ficha tiene que ser el que se siembra.
    assert.throws(() => construirLinea('LX-9', fichaSintetica(), { ahora: AHORA }), /codigo: la ficha dice «LX-1»/);
    const sinCodigo = fichaSintetica();
    delete sinCodigo.codigo;
    assert.ok(faltasDeLaFichaDeLinea('LX-1', sinCodigo).some((f) => f.startsWith('codigo')));
  });

  test('la ficha no puede declarar la identidad: la pone el sembrador', () => {
    for (const [seccion, campo] of [['linea', 'id'], ['linea', 'hipotesisId'], ['linea', 'revision'],
      ['linea', 'codigo'], ['hipotesis', 'lineaId'], ['hipotesis', 'id'], ['hipotesis', 'creadoPor']]) {
      const ficha = fichaSintetica();
      ficha[seccion][campo] = 'intruso';
      assert.throws(() => construir(ficha), new RegExp(`${seccion}\\.${campo}: no se declara`),
        `la ficha pudo declarar ${seccion}.${campo}`);
    }
  });

  test('tipos equivocados no pasan por buenos', () => {
    for (const [borrar, patron] of [
      [(f) => { f.linea.tensionNominal_kV = '66'; }, /tensionNominal_kV/],
      [(f) => { f.linea.tensionNominal_kV = 0; }, /tensionNominal_kV/],
      [(f) => { f.linea.circuitos = 0; }, /circuitos/],
      [(f) => { f.linea.activa = 'sí'; }, /activa/],
      [(f) => { f.linea.conductor.rts_kgf = NaN; }, /rts_kgf/],
      [(f) => { f.hipotesis.vientoMax_kmh = -1; }, /vientoMax_kmh/],
      [(f) => { f.hipotesis.nombre = '   '; }, /hipotesis\.nombre/],
      [(f) => { f.linea.conductor = null; }, /linea\.conductor: falta la sección/],
      [(f) => { delete f.hipotesis; }, /hipotesis: falta la sección/],
    ]) {
      const ficha = fichaSintetica();
      borrar(ficha);
      assert.throws(() => construir(ficha), patron);
    }
    assert.deepEqual(faltasDeLaFichaDeLinea('LX-1', null), ['la ficha no es un objeto JSON']);
  });

  test('un despeje sin la norma que lo fija no entra', () => {
    const ficha = fichaSintetica();
    delete ficha.hipotesis.normaReferencia;
    assert.throws(() => construir(ficha), /normaReferencia/);
    const mal = fichaSintetica();
    mal.hipotesis.despejeMinimo_m = { categoria: -2 };
    assert.throws(() => construir(mal), /despejeMinimo_m/);
    // Sin despeje declarado no se exige norma: no se escribe nada que no esté.
    const sinDespeje = fichaSintetica();
    delete sinDespeje.hipotesis.despejeMinimo_m;
    delete sinDespeje.hipotesis.normaReferencia;
    assert.deepEqual(faltasDeLaFichaDeLinea('LX-1', sinDespeje), []);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA FICHA REAL DE LN-627 — solo donde está la bóveda
// ════════════════════════════════════════════════════════════════════════════
const F_FICHA_627 = join(AQUI, '..', '..', 'brain-private', 'mantenimiento-lineas-at', 'fixtures', 'LN-627-linea.json');
const SIN_BOVEDA = !existsSync(F_FICHA_627) &&
  'ficha de línea en la bóveda privada, no disponible aquí (esperado en CI)';

describe('la ficha de LN-627 en la bóveda', () => {

  test('está completa y construye la línea y la hipótesis de siempre', { skip: SIN_BOVEDA }, () => {
    const ficha = JSON.parse(readFileSync(F_FICHA_627, 'utf-8'));
    assert.deepEqual(faltasDeLaFichaDeLinea('LN-627', ficha), []);
    const { linea, hipotesis } = construirLinea('LN-627', ficha, { ahora: AHORA });
    // Los ids que ya están en producción; los imprime el ensayo en seco.
    assert.equal(linea.id, 'f50d70ec-ad33-8af9-8aeb-742e49ed2fab');
    assert.equal(hipotesis.id, 'f64a28ab-1b3a-b1f0-48f7-3b4491148b2c');
  });

  test('⚠️ el conductor sigue sin insignia de fabricante mientras su fuente diga PENDIENTE', { skip: SIN_BOVEDA }, () => {
    // Es la guardia de `99 §ADR-099` que vivía sobre el texto del sembrador,
    // mudada a donde viven ahora las cifras. Decía `catalogo_fabricante` con una
    // `fuente` que confesaba estar PENDIENTE de confirmar: las dos no pueden ser
    // ciertas, y la etiqueta era la que mentía.
    const { conductor } = JSON.parse(readFileSync(F_FICHA_627, 'utf-8')).linea;
    if (/PENDIENTE/i.test(conductor.fuente)) {
      assert.equal(conductor.procedencia, 'supuesto',
        'la suposición volvió a ponerse la insignia del fabricante');
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('GUARDIÁN POR TEXTO — lo que el sembrador ya no hace', () => {
  const fuente = readFileSync(join(AQUI, '..', 'herramientas', 'sembrar.mjs'), 'utf-8');
  // Se ignoran los comentarios: la cabecera EXPLICA lo que se retiró citándolo,
  // y contarlo no es hacerlo.
  const codigo = fuente
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

  test('el guardián está leyendo el sembrador de verdad', () => {
    assert.ok(codigo.length > 5000, 'el barrido no encuentra el código del sembrador');
    assert.match(codigo, /construirLinea\(/, 'el sembrador ya no construye la línea desde su ficha');
  });

  test('no escribe permisos: ni setCustomUserClaims ni el SDK de cuentas', () => {
    assert.doesNotMatch(codigo, /setCustomUserClaims|customAttributes/,
      'el sembrador vuelve a escribir permisos: solo el trabajador de usuarios/ puede (§ADR-100)');
    assert.doesNotMatch(codigo, /firebase-admin\/auth/,
      'el sembrador vuelve a importar el SDK de cuentas');
  });

  test('--admin no se ignora en silencio: si se pasa, se para', () => {
    assert.match(codigo, /if \(bandera\('admin'\)\)\s*\{[\s\S]{0,800}?process\.exit\(1\)/,
      'quien pase --admin por costumbre creería que la cuenta quedó con permisos');
  });

  test('--linea es obligatorio: no hay línea por defecto', () => {
    assert.match(codigo, /arg\(\s*'linea'\s*,\s*null\s*\)/);
    assert.doesNotMatch(codigo, /arg\(\s*['"`]linea['"`]\s*,\s*['"`]/,
      'volvió una línea por defecto: con dos líneas en el parque se sembraría en la que no era');
  });

  test('ninguna cifra de línea escrita a mano: salen de la ficha', () => {
    for (const [patron, que] of [
      [/tensionNominal_kV\s*:\s*\d/, 'la tensión'],
      [/circuitos\s*:\s*\d/, 'los circuitos'],
      [/codigo\s*:\s*['"`]Darien/, 'el conductor'],
      [/rts_kgf\s*:\s*\d/, 'la rotura del conductor'],
      [/eds_pct\s*:\s*\d/, 'la hipótesis'],
      [/vientoMax_kmh\s*:\s*\d/, 'el viento'],
      [/despejeMinimo_m\s*:\s*\{/, 'el despeje'],
    ]) {
      assert.doesNotMatch(codigo, patron, `volvió ${que} escrita a mano en el sembrador: se prestaría a cualquier línea`);
    }
  });

  test('config/ia solo se CREA: jamás se reescribe', () => {
    assert.doesNotMatch(codigo, /\.set\(\s*db\.collection\(\s*['"`]config['"`]\s*\)\.doc\(\s*['"`]ia['"`]\s*\)/,
      'volvió a reescribirse config/ia: resembrar apagaría la IA sin que nadie lo decida');
    const nombres = [...codigo.matchAll(/const\s+(\w+)\s*=\s*db\.collection\(\s*['"`]config['"`]\s*\)\.doc\(\s*['"`]ia['"`]\s*\)/g)].map((m) => m[1]);
    assert.ok(nombres.length >= 1, 'no se encuentra dónde se toca config/ia');
    for (const n of nombres) {
      assert.doesNotMatch(codigo, new RegExp(`\\.(set|update)\\(\\s*${n}\\b`), `config/ia (${n}) se reescribe`);
      assert.match(codigo, new RegExp(`\\.create\\(\\s*${n}\\b`), `config/ia (${n}) no se crea con create`);
    }
  });
});
