// ============================================================================
// tests/cargabilidad-por-carpeta.test.js — soltar la carpeta entera, sin mentir
// ----------------------------------------------------------------------------
// QUÉ PRUEBA. `nucleo/cargaPorLotes.js` es quien decide, para la pantalla Y para
// la consola, **qué día entra en el histórico y cuál se queda fuera**. Y el
// histórico no se puede borrar: `firestore.rules` niega el borrado de las tres
// colecciones de cargabilidad a propósito. Todo lo que este módulo deje pasar se
// queda para siempre, así que lo que no puede fallar en silencio es:
//
//   · un día con UNA hora cuyo sello no sea «Actual» se aparta ENTERO —decisión
//     del Ingeniero, 2026-09-20— y se dice CUÁL sello y en qué horas;
//   · un día sin NINGÚN sello **entra** —ninguna de sus horas dice otra cosa—
//     pero se NOMBRA: no está dado por bueno;
//   · un día fuera del periodo no entra, y se dice;
//   · **un día no se parte entre dos tandas**, y ninguna tanda pasa de cien
//     archivos, que es el tope del rastro de procedencia;
//   · todo archivo queda explicado: o se escribe, o se aparta, o queda fuera.
//     Un archivo que no es ninguna de las tres cosas es un guardado parcial
//     silencioso, que es la avería más cara de este módulo;
//   · y **el reparto en tandas es EL MISMO** que el de la herramienta de
//     consola. Dos criterios para partir la misma carga son dos históricos.
//
// Además se comprueba que la PANTALLA esté enchufada a este módulo y no tenga su
// propia versión de las reglas: no se puede ejecutar un `.tsx` desde
// `node --test` sin montar un navegador, pero sí se puede leer, y es el mismo
// patrón que usa `carga-pantalla.test.js`.
//
// ⚠️ DATOS SINTÉTICOS. Las etiquetas reales del SCADA llevan la subestación y la
// bahía del cliente y este repositorio es PÚBLICO (`CLAUDE.md §3.1`): aquí todo
// es inventado —`/SubA`, `LX-1`— y una de las pruebas comprueba precisamente que
// esa etiqueta NO salga en lo que el módulo escribe.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  ARCHIVOS_POR_CARGA, motivoDelApartado, periodoDelGrueso, planDeLaCarga, repartirEnLotes,
  sellosPorDia,
} from '../nucleo/cargaPorLotes.js';
import {
  ARCHIVOS_POR_CARGA as TOPE_DE_LA_CONSOLA,
  repartirEnLotes as repartirEnLotesDeLaConsola,
} from '../herramientas/cargar-cargabilidad.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PANTALLA = readFileSync(join(RAIZ, 'web/src/componentes/Cargabilidad.tsx'), 'utf-8');

// ── El mundo inventado ──────────────────────────────────────────────────────

/** La etiqueta de una señal. Inventada, y se comprueba que no se filtre. */
const SENAL = '/SubA · 66kV · LX-1 · I R';

/**
 * Un archivo de sello de un día: la fila del eje y una fila por señal.
 * `malas` es `{hora: sello}` — lo que no esté ahí dice «Actual».
 */
const archivoDeSello = (fecha, malas = {}, etiqueta = SENAL) => {
  const [a, m, d] = fecha.split('-');
  const eje = ['', ...Array.from({ length: 24 }, (_, h) => `${d}/${m}/${a.slice(2)} ${h}:00`)];
  const fila = [etiqueta, ...Array.from({ length: 24 }, (_, h) => malas[h] ?? 'Actual')];
  return { nombre: `i_quality-${a}${m}${d}.csv`, matriz: [eje, fila] };
};

/** Días de medida seguidos, con cuatro archivos cada uno (los cuatro estadísticos). */
const diasSeguidos = (desde, cuantos, archivos = 4) => {
  const salida = [];
  const t = Date.parse(`${desde}T00:00:00Z`);
  for (let i = 0; i < cuantos; i += 1) {
    salida.push({ fecha: new Date(t + i * 86400000).toISOString().slice(0, 10), archivos });
  }
  return salida;
};

// ════════════════════════════════════════════════════════════════════════════
describe('el reparto en tandas es el MISMO que el de la consola', () => {

  test('el tope es el mismo número, y es el del rastro de procedencia', () => {
    assert.equal(ARCHIVOS_POR_CARGA, TOPE_DE_LA_CONSOLA);
    assert.equal(ARCHIVOS_POR_CARGA, 100,
      'el tope sale de `CargaDeCargabilidad.archivos`, que declara `.max(100)`');
  });

  test('las dos funciones reparten igual, caso por caso', () => {
    // Casos a propósito incómodos: días de un archivo, días que llenan la tanda
    // exacta, un día más gordo que el tope entero, y la lista vacía.
    const casos = [
      [],
      diasSeguidos('2026-01-01', 1),
      diasSeguidos('2026-01-01', 25),            // 100 justos: UNA tanda
      diasSeguidos('2026-01-01', 26),            // uno más: dos tandas
      diasSeguidos('2026-01-01', 209),           // el caso real de LN-617
      diasSeguidos('2026-01-01', 7, 1),
      [{ fecha: '2026-01-01', archivos: 140 }, ...diasSeguidos('2026-01-02', 3)],
      [...diasSeguidos('2026-01-01', 3), { fecha: '2026-01-04', archivos: 97 }],
    ];
    for (const caso of casos) {
      assert.deepEqual(repartirEnLotes(caso), repartirEnLotesDeLaConsola(caso),
        `el reparto de ${caso.length} día(s) no coincide con el de la consola: dos criterios `
        + 'para partir la misma carga son dos históricos');
    }
  });

  test('un día NUNCA se parte entre dos tandas', () => {
    const dias = diasSeguidos('2026-01-01', 209);
    const lotes = repartirEnLotes(dias);
    const vistos = lotes.flatMap((l) => l.elementos.map((e) => e.fecha));
    assert.equal(new Set(vistos).size, vistos.length,
      'una fecha aparece en dos tandas: sus estadísticos se separarían, y juntos se unen');
    assert.equal(vistos.length, dias.length, 'se perdió algún día por el camino');
  });

  test('ninguna tanda pasa del tope mientras ningún día lo pase por sí solo', () => {
    for (const l of repartirEnLotes(diasSeguidos('2026-01-01', 209))) {
      assert.ok(l.archivos <= ARCHIVOS_POR_CARGA, `una tanda lleva ${l.archivos} archivos`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('los sellos: qué día se aparta y por qué', () => {

  test('UNA hora que no dice «Actual» aparta el día ENTERO', () => {
    const s = sellosPorDia([
      archivoDeSello('2026-01-26', { 3: 'Not Renewed' }),
      archivoDeSello('2026-01-27'),
    ]);
    assert.deepEqual(s.apartados.map((a) => a.fecha), ['2026-01-26']);
    assert.deepEqual(s.conSello, ['2026-01-26', '2026-01-27']);
    const [uno] = s.apartados;
    assert.deepEqual(uno.horas, [3], 'se dice en qué hora, aunque el día se aparte entero');
    assert.deepEqual(uno.sellos, [{ sello: 'Not Renewed', horas: 1 }], 'se dice CUÁL sello');
    assert.equal(uno.senales, 1);
  });

  test('el motivo NO lleva la etiqueta de la señal: es la ruta del cliente', () => {
    const [uno] = sellosPorDia([archivoDeSello('2026-01-26', { 3: 'Invalid' })]).apartados;
    assert.ok(!uno.porQue.includes('SubA') && !uno.porQue.includes('66kV'),
      'el motivo se pega en correos e informes: no puede sacar un nombre de cliente');
    assert.match(uno.porQue, /1 señal\(es\) con sello «Invalid» ×1 en la\(s\) hora\(s\) 3 h/);
    assert.equal(uno.porQue, motivoDelApartado(uno), 'el texto lo escribe una sola función');
  });

  test('dos sellos distintos en el mismo día se cuentan los dos, el mayor primero', () => {
    const [uno] = sellosPorDia([
      archivoDeSello('2026-01-26', { 3: 'Invalid', 4: 'Not Renewed', 5: 'Not Renewed' }),
    ]).apartados;
    assert.deepEqual(uno.sellos, [{ sello: 'Not Renewed', horas: 2 }, { sello: 'Invalid', horas: 1 }]);
    assert.deepEqual(uno.horas, [3, 4, 5]);
  });

  test('las horas buenas y las malas se cuentan, y no se confunden', () => {
    const s = sellosPorDia([archivoDeSello('2026-01-26', { 3: 'Invalid' })]);
    assert.deepEqual(s.horas, { actual: 23, noActual: 1 });
    assert.equal(s.leidos, 1);
    assert.deepEqual(s.sinEje, []);
  });

  test('un archivo de sello sin eje de tiempo se DICE, no se ignora', () => {
    const s = sellosPorDia([{ nombre: 'roto.csv', matriz: [['una nota suelta']] }]);
    assert.deepEqual(s.sinEje, ['roto.csv']);
    assert.equal(s.leidos, 0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el plan: qué entra, qué se aparta y qué se dice', () => {

  /** Ocho meses de una línea, con un día marcado y otro sin sello ninguno. */
  const escenario = ({ periodo = {}, conSellos = true } = {}) => {
    const dias = diasSeguidos('2026-01-01', 20);
    const sellos = conSellos
      ? sellosPorDia([
        // El 1 y el 2 no traen archivo de sello: entran, pero se nombran.
        ...dias.slice(2).map((d) => archivoDeSello(d.fecha, d.fecha === '2026-01-05' ? { 7: 'Invalid' } : {})),
      ])
      : null;
    return planDeLaCarga({ dias, sellos, periodo });
  };

  test('el día marcado se aparta ENTERO y con su motivo', () => {
    const p = escenario();
    assert.deepEqual(p.apartados.map((d) => d.fecha), ['2026-01-05']);
    assert.equal(p.apartados[0].archivos, 4, 'se apartan sus cuatro archivos, no tres');
    assert.match(p.apartados[0].porQue, /«Invalid»/);
    assert.equal(p.dias.entran, 19);
  });

  test('un día SIN NINGÚN SELLO entra, pero se nombra', () => {
    const p = escenario();
    assert.deepEqual(p.sinSello, ['2026-01-01', '2026-01-02'],
      'ninguna de sus horas trae un sello distinto de «Actual» porque no traen sello: entran. '
      + 'Pero tampoco están dados por buenos, así que se nombran');
    assert.ok(p.entran.some((d) => d.fecha === '2026-01-01'));
  });

  test('sin NINGÚN sello no se puede empezar: no se sabe qué apartar', () => {
    const p = escenario({ conSellos: false });
    assert.equal(p.sePuedeEmpezar, false);
    const f = p.frenos.find((x) => x.clave === 'sin-sellos');
    assert.ok(f, 'sin sellos ninguna hora se puede dar por medida');
    assert.match(f.texto, /paso 1/, 'y se dice DÓNDE están: la carpeta de la bahía');
  });

  test('un día fuera del periodo no entra, y se dice', () => {
    const p = escenario({ periodo: { desde: '2026-01-03', hasta: '2026-01-10' } });
    assert.deepEqual(p.fuera.map((d) => d.fecha), [
      '2026-01-01', '2026-01-02',
      ...diasSeguidos('2026-01-11', 10).map((d) => d.fecha),
    ]);
    assert.match(p.fuera[0].porQue, /fuera del periodo pedido \(2026-01-03 → 2026-01-10\)/);
  });

  test('fuera del periodo MANDA sobre el sello: no se dice nada de su calidad', () => {
    // El 05 trae un sello malo Y queda fuera del periodo. Se cuenta como fuera:
    // de un día que nadie pidió cargar no se está afirmando que se midiera mal,
    // y contarlo como apartado inflaría la cuenta de días con problema de dato.
    const p = escenario({ periodo: { desde: '2026-01-10', hasta: '2026-01-20' } });
    assert.ok(p.fuera.some((d) => d.fecha === '2026-01-05'));
    assert.deepEqual(p.apartados, []);
  });

  test('TODO archivo queda explicado: escrito, apartado o fuera', () => {
    for (const periodo of [{}, { desde: '2026-01-03', hasta: '2026-01-10' }]) {
      const p = escenario({ periodo });
      assert.equal(p.archivos.explicados, p.archivos.total,
        'un archivo que no se escribe, no se aparta y no se dice es un guardado parcial silencioso');
      assert.equal(p.archivos.cuadra, true);
      assert.equal(p.dias.entran + p.dias.apartados + p.dias.fuera, p.dias.total);
    }
  });

  test('con años mezclados y sin periodo NO se empieza: lo cargado no se retira', () => {
    const dias = [{ fecha: '2025-06-22', archivos: 1 }, ...diasSeguidos('2026-01-01', 20)];
    const sellos = sellosPorDia(dias.map((d) => archivoDeSello(d.fecha)));
    const sinAcotar = planDeLaCarga({ dias, sellos });
    const f = sinAcotar.frenos.find((x) => x.clave === 'anios-mezclados');
    assert.ok(f, 'un día de otro año suele ser una exportación traspapelada');
    assert.match(f.texto, /2025: 1 archivo\(s\)/, 'se dice cuánto pesa cada año: medido, no supuesto');
    assert.equal(sinAcotar.sePuedeEmpezar, false);

    const acotado = planDeLaCarga({ dias, sellos, periodo: { desde: '2026-01-01', hasta: '2026-12-31' } });
    assert.equal(acotado.sePuedeEmpezar, true);
    assert.deepEqual(acotado.fuera.map((d) => d.fecha), ['2025-06-22']);
  });

  test('un día más gordo que el tope se DICE, no se parte a escondidas', () => {
    const dias = [{ fecha: '2026-01-01', archivos: 140 }];
    const sellos = sellosPorDia([archivoDeSello('2026-01-01')]);
    const p = planDeLaCarga({ dias, sellos });
    assert.equal(p.lotes.length, 1, 'un día no se parte, ni siquiera para caber');
    assert.ok(p.frenos.some((x) => x.clave === 'tanda-pasada'));
    assert.equal(p.sePuedeEmpezar, false);
  });

  test('los 209 días de una línea real caben en tandas de cien sin perder ninguno', () => {
    const dias = diasSeguidos('2026-01-01', 209);
    const sellos = sellosPorDia(dias.map((d) => archivoDeSello(d.fecha)));
    const p = planDeLaCarga({ dias, sellos });
    assert.equal(p.sePuedeEmpezar, true);
    assert.equal(p.dias.entran, 209);
    assert.equal(p.lotes.reduce((k, l) => k + l.dias.length, 0), 209);
    assert.equal(p.lotes.reduce((k, l) => k + l.archivos, 0), 209 * 4);
    for (const l of p.lotes) assert.ok(l.archivos <= ARCHIVOS_POR_CARGA);
    assert.deepEqual(p.lotes.map((l) => l.indice), p.lotes.map((_, i) => i + 1));
    assert.equal(p.lotes[0].desde, '2026-01-01');
    assert.equal(p.lotes[p.lotes.length - 1].hasta, dias[dias.length - 1].fecha);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el periodo que se propone se MIDE, no se supone', () => {

  test('con un solo año no hay nada que proponer', () => {
    assert.equal(periodoDelGrueso(diasSeguidos('2026-01-01', 10)), null);
  });

  test('propone el año con más archivos, y enseña la cuenta', () => {
    const dias = [{ fecha: '2025-06-22', archivos: 1 }, ...diasSeguidos('2026-01-01', 5)];
    const p = periodoDelGrueso(dias);
    assert.equal(p.anio, '2026');
    assert.equal(p.desde, '2026-01-01');
    assert.equal(p.hasta, '2026-01-05');
    assert.equal(p.archivos, 20);
    assert.equal(p.total, 21);
    assert.match(p.porQue, /el año con más archivos es 2026 \(20 de 21\)/,
      'la propuesta enseña de dónde sale: si no, es un supuesto disfrazado de dato');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('la PANTALLA está enchufada al módulo, y no tiene su propia versión', () => {

  test('pide las reglas al núcleo en vez de escribirlas', () => {
    assert.match(PANTALLA, /from '@lineas\/nucleo\/cargaPorLotes'/,
      'la pantalla tiene que preguntar quién entra y quién se aparta, no decidirlo');
    for (const pieza of ['planDeLaCarga', 'sellosPorDia', 'ARCHIVOS_POR_CARGA', 'periodoDelGrueso']) {
      assert.ok(PANTALLA.includes(pieza), `la pantalla no usa «${pieza}»`);
    }
    assert.ok(!/const\s+ARCHIVOS_POR_CARGA\s*=/.test(PANTALLA),
      'el tope no se vuelve a escribir en la pantalla: sale del módulo');
    assert.ok(!/['"`]Actual['"`]/.test(PANTALLA),
      'la pantalla no puede tener su propio criterio de «esta hora se midió»: ese sello es de '
      + '`cargabilidadAncho.js` y lo lee `cargaPorLotes.js`');
  });

  test('sabe pedir una CARPETA, no solo archivos sueltos', () => {
    assert.match(PANTALLA, /webkitdirectory/,
      'sin esto el navegador sigue pidiendo archivo a archivo, que es el problema que se resolvía');
  });

  test('no escribe hasta que el plan deja empezar', () => {
    assert.match(PANTALLA, /disabled=\{guardando \|\| !plan\.sePuedeEmpezar\}/,
      'con un freno sin resolver no puede haber botón: lo cargado no se retira');
    assert.match(PANTALLA, /plan\.frenos\.map/, 'los frenos se enseñan uno a uno, con su porqué');
  });

  test('escribe tanda a tanda y PARA a la primera que falla', () => {
    assert.match(PANTALLA, /setParadoEn\(\{ tanda: l\.indice/,
      'seguir tras un fallo dejaría un agujero en medio de un histórico que no se puede borrar');
    assert.match(PANTALLA, /Cómo seguir sin repetir lo ya escrito/,
      'pararse sin decir cómo continuar deja al Ingeniero adivinando dónde se cortó');
  });

  test('enseña el avance mientras escribe, y cuadra cada tanda antes de mandarla', () => {
    assert.match(PANTALLA, /tanda \{enMarcha\.tanda\} de \{enMarcha\.total\}/,
      'ocho tandas sin decir por cuál va son ocho minutos mirando una pantalla quieta');
    assert.match(PANTALLA, /deLaTanda\.length !== l\.dias\.length \|\| archivos\.length !== l\.archivos/,
      'escribir menos de lo que se enseñó no da error en ninguna capa: hay que contar la entrada '
      + 'contra la salida antes de mandar');
  });

  test('el acumulado lo suma quien escribió, no la pantalla', () => {
    assert.match(PANTALLA, /acumularAcuses\(tandasHechas\.map/,
      'un total recalculado por quien no escribió acaba discrepando de la base sin que nadie lo note');
  });

  test('lo apartado va al RASTRO de la carga, no solo a la pantalla', () => {
    assert.match(PANTALLA, /apartados: \[\.\.\.apartadosParaElRastro/,
      '`cargabilidad_cargas` es inmutable: lo que no se escriba al crearla no se escribe nunca, y '
      + 'una carga que calla lo apartado afirma mañana que aquel día no vino');
    assert.match(PANTALLA, /motivo: 'sin_lecturas'/,
      'un día que entró y no dejó documento tampoco se calla');
    assert.ok(!/senales: \[/.test(PANTALLA),
      'las señales se CUENTAN, no se nombran: su etiqueta es la ruta del SCADA del cliente');
  });
});
