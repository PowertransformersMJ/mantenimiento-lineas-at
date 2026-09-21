// ============================================================================
// tests/sellos-una-sola-cuenta.test.js — la pantalla y la consola cuentan IGUAL,
// y reanudar no deja escrito que un día cargado «no entró»
// ----------------------------------------------------------------------------
// QUÉ SE PRUEBA, Y POR QUÉ ESTE ARCHIVO EXISTE. El 2026-09-20 se construyó la
// carga del SCADA por carpeta entera, y una revisión adversaria midió tres
// averías. Las tres comparten la misma raíz: **lo que se escribe aquí no se
// puede corregir.** `firestore.rules` niega `update` y `delete` en
// `cargabilidad_cargas` a propósito —un histórico del que se puede quitar una
// hora incómoda no es un histórico—, así que una cifra mal contada o un motivo
// mal puesto se quedan en el papel de auditoría para siempre.
//
//   ① **Reanudar mentía.** Si la tanda 4 de 8 fallaba, el consejo era volver a
//      soltar la carpeta con «Desde» movido. Medido sobre LN-617: las cuatro
//      tandas siguientes dejaban escrito que 110 días **ya cargados** quedaron
//      «fuera del periodo», y cinco días apartados por su sello perdían su
//      motivo real. Basta abrir el histórico para ver que esos días están.
//   ② **Dos cuentas del mismo sello.** La consola contaba cada hora·señal una
//      vez; la pantalla contaba CELDAS. Con 1.080 lecturas repetidas en el dato
//      real de LN-617, el mismo día salía «×9» en una y «×8» en la otra.
//   ③ **Dos frenos que solo tenía la consola**: la misma hora con dos sellos
//      distintos en dos archivos, y un archivo cuyo eje pone dos columnas en la
//      misma hora.
//
// LO QUE VIGILA ESTE ARCHIVO es que las tres sigan cerradas: que la CUENTA sea
// una sola y viva en el núcleo, que los frenos estén en las dos puertas, y que
// reanudar no escriba nada de los días que ya estaban escritos.
//
// ⚠️ MUNDO SINTÉTICO. Este repositorio es PÚBLICO (`CLAUDE.md §3.1`): las
// etiquetas de señal son inventadas —la ruta real del SCADA es subestación,
// nivel de tensión y bahía del cliente— y las fechas no son las de ninguna
// exportación suya.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  CAUSA_DEL_APARTADO, MOTIVO_EJE_NO_HORARIO, ejeConHorasRepetidas, indiceDeSellos,
  motivoDelApartado, planDeLaCarga, sellosPorDia,
} from '../nucleo/cargaPorLotes.js';
import { MOTIVOS_APARTADO } from '../contratos/src/cargabilidad.ts';

// ── El mundo sintético ──────────────────────────────────────────────────────
const SENAL = 'LX-1 · celda A · corriente';
const OTRA = 'LX-1 · celda A · tensión';

/**
 * Un archivo de sello como los que exporta el SCADA: la primera columna es la
 * etiqueta y cada columna siguiente es una hora, con su sello debajo.
 */
const archivoDeSello = (nombre, fecha, horas, filas) => ({
  nombre,
  matriz: [
    ['Etiqueta', ...horas.map((h) => `${fecha} ${String(h).padStart(2, '0')}:00`)],
    ...filas.map(({ etiqueta, sellos }) => [etiqueta, ...sellos]),
  ],
});

const TODO_BIEN = (h) => h.map(() => 'Actual');

describe('② LA CUENTA ES UNA SOLA: una exportación repetida no es una hora más', () => {
  test('el MISMO archivo dos veces da las mismas cifras que una sola vez', () => {
    const horas = [0, 1, 2, 3];
    const filas = [{ etiqueta: SENAL, sellos: ['Actual', 'Not Renewed', 'Actual', 'Actual'] }];
    const uno = archivoDeSello('calidad_quality.csv', '2026-03-04', horas, filas);
    // El mismo contenido exportado otra vez, con otro nombre. Es lo que pasó de
    // verdad: 1.080 lecturas repetidas en LN-617.
    const otraVez = archivoDeSello('calidad_quality (1).csv', '2026-03-04', horas, filas);

    const solo = sellosPorDia([uno]);
    const repetido = sellosPorDia([uno, otraVez]);

    assert.deepEqual(repetido.horas, solo.horas,
      'una exportación repetida no añade horas: la misma hora·señal se cuenta UNA vez');
    assert.equal(repetido.horas.noActual, 1);
    assert.equal(repetido.choques.length, 0, 'decir lo mismo dos veces no es un choque');
    assert.deepEqual(
      repetido.apartados.map((a) => a.porQue),
      solo.apartados.map((a) => a.porQue),
      'y el MOTIVO escrito es el mismo texto, cifra por cifra: se escribe en un rastro inmutable',
    );
    assert.match(repetido.apartados[0].porQue, /«Not Renewed» ×1/,
      'la hora mala se cuenta una vez, no dos');
  });

  test('dos señales distintas en la misma hora SÍ son dos horas·señal', () => {
    const horas = [0, 1];
    const res = sellosPorDia([archivoDeSello('q_quality.csv', '2026-03-04', horas, [
      { etiqueta: SENAL, sellos: ['Actual', 'Not Renewed'] },
      { etiqueta: OTRA, sellos: ['Actual', 'Not Renewed'] },
    ])]);
    assert.equal(res.horas.noActual, 2, 'la misma hora en dos señales son dos lecturas');
    assert.equal(res.apartados[0].senales, 2, 'y el día dice que son DOS señales las afectadas');
    assert.match(res.apartados[0].porQue, /2 señal\(es\)/);
  });

  test('quien cuenta es el núcleo, y distingue repetido de nuevo y de choque', () => {
    const i = indiceDeSellos();
    const base = { fecha: '2026-03-04', hora: 5, etiqueta: SENAL, archivo: 'a.csv' };
    assert.equal(i.anotar({ ...base, sello: 'Actual' }), 'nuevo');
    assert.equal(i.anotar({ ...base, sello: 'Actual', archivo: 'b.csv' }), 'repetido');
    assert.equal(i.anotar({ ...base, sello: 'Not Renewed', archivo: 'c.csv' }), 'choque');
    assert.equal(i.horas(), 1, 'sigue siendo UNA hora');
    assert.equal(i.choques.length, 1);
    assert.ok(!('etiqueta' in i.choques[0]),
      'el choque NO lleva la etiqueta: es la ruta del SCADA del cliente y el repo es público');
  });
});

describe('③ LOS DOS FRENOS, en las dos puertas', () => {
  /** Días y sellos mínimos para que el plan no frene por otra cosa. */
  const diasDe = (fechas) => fechas.map((fecha) => ({ fecha, archivos: 4 }));

  test('un choque de sellos PARA la carga: no se aparta nada y no se carga nada', () => {
    const horas = [0, 1];
    const sellos = sellosPorDia([
      archivoDeSello('a_quality.csv', '2026-03-04', horas, [{ etiqueta: SENAL, sellos: TODO_BIEN(horas) }]),
      archivoDeSello('b_quality.csv', '2026-03-04', horas, [{ etiqueta: SENAL, sellos: ['Actual', 'Invalid'] }]),
    ]);
    assert.equal(sellos.choques.length, 1);
    const plan = planDeLaCarga({ dias: diasDe(['2026-03-04']), sellos });
    assert.equal(plan.sePuedeEmpezar, false);
    assert.ok(plan.frenos.some((f) => f.clave === 'sellos-en-choque'),
      'la pantalla tiene el mismo freno que la consola');
  });

  // ⚠️ MEDIDO EL 2026-09-20, Y NO ES LO QUE PARECÍA. El freno «eje no horario»
  // **no puede dispararse hoy**, ni aquí ni en la consola, porque
  // `encontrarEjeDeTiempo` exige que las horas del eje CREZCAN una a una: un
  // archivo con dos columnas en la misma hora —media hora, o la misma hora
  // repetida— no llega a ser un eje y cae antes, en «no trae eje reconocible».
  // Lo que importa —que ese archivo NO se lea y que la carga NO empiece— se
  // cumple igual, por la otra puerta. Se prueban las dos: la que frena de verdad
  // y la que está ahí por si mañana se afloja la regla del eje.
  test('un archivo con dos columnas en la misma hora no se lee, y la carga NO empieza', () => {
    for (const [caso, fila] of Object.entries({
      'la misma hora repetida': ['04/03/2026 05:00', '04/03/2026 05:00', '04/03/2026 06:00'],
      'cada media hora': ['04/03/2026 05:00', '04/03/2026 05:30', '04/03/2026 06:00'],
    })) {
      const sellos = sellosPorDia([{
        nombre: 'roto_quality.csv',
        matriz: [['Etiqueta', ...fila], [SENAL, 'Actual', 'Not Renewed', 'Actual']],
      }]);
      assert.equal(sellos.leidos, 0, `${caso}: no se leyó, lo que trae NO está en esta lectura`);
      assert.deepEqual(sellos.sinEje, ['roto_quality.csv'], `${caso}: cae por «no trae eje»`);
      const plan = planDeLaCarga({ dias: diasDe(['2026-03-04']), sellos });
      assert.equal(plan.sePuedeEmpezar, false, `${caso}: y la carga no puede empezar`);
      assert.ok(plan.frenos.some((f) => f.clave === 'sello-ilegible'),
        `${caso}: el freno que SÍ dispara es el de sello ilegible`);
    }
  });

  test('la segunda puerta existe y dice lo mismo, por si mañana se afloja la del eje', () => {
    assert.equal(ejeConHorasRepetidas({ instantes: [{ fecha: '2026-03-04', hora: 5 }] }), false);
    assert.equal(ejeConHorasRepetidas({
      instantes: [{ fecha: '2026-03-04', hora: 5 }, { fecha: '2026-03-04', hora: 5 }],
    }), true);
    assert.equal(ejeConHorasRepetidas({
      instantes: [{ fecha: '2026-03-04', hora: 5 }, { fecha: '2026-03-05', hora: 5 }],
    }), false, 'la misma hora de días distintos no se repite');
    assert.match(MOTIVO_EJE_NO_HORARIO, /dos columnas caen en la misma hora/,
      'y el texto es UNO: lo usan la pantalla y la consola');
  });
});

describe('① REANUDAR NO ESCRIBE QUE UN DÍA CARGADO «NO ENTRÓ»', () => {
  // Ocho días, cuatro archivos cada uno. Uno tiene un sello malo.
  const FECHAS = ['2026-04-21', '2026-04-22', '2026-04-23', '2026-04-24',
    '2026-04-25', '2026-04-26', '2026-04-27', '2026-04-28'];
  const DIA_MALO = '2026-04-22';
  const dias = FECHAS.map((fecha) => ({ fecha, archivos: 4 }));
  const horas = [0, 1];
  const sellos = sellosPorDia(FECHAS.map((fecha) => archivoDeSello(
    `${fecha}_quality.csv`, fecha, horas,
    [{ etiqueta: SENAL, sellos: fecha === DIA_MALO ? ['Actual', 'Not Renewed'] : TODO_BIEN(horas) }],
  )));

  test('lo ya escrito se salta, y NO cuenta como apartado ni como fuera del periodo', () => {
    // Se cortó tras escribir hasta el 23. Se reanuda diciendo la VERDAD: «ya
    // está escrito hasta el 2026-04-23».
    const plan = planDeLaCarga({ dias, sellos, yaCargadoHasta: '2026-04-23' });

    assert.equal(plan.dias.otraCorrida, 3, 'los días 21, 22 y 23 ya estaban');
    assert.equal(plan.dias.fuera, 0, '⚠️ NINGUNO queda «fuera del periodo»: el periodo los incluía');
    assert.equal(plan.dias.apartados, 0, 'y el día malo del 22 tampoco se re-aparta: ya lo dijo su carga');
    assert.equal(plan.dias.entran, 5, 'entran del 24 al 28');
    assert.deepEqual(plan.entran.map((d) => d.fecha), FECHAS.slice(3));
  });

  test('la cuenta de archivos sigue cuadrando, con lo ya escrito explicado aparte', () => {
    const plan = planDeLaCarga({ dias, sellos, yaCargadoHasta: '2026-04-23' });
    assert.equal(plan.archivos.total, 32);
    assert.equal(plan.archivos.otraCorrida, 12);
    assert.equal(plan.archivos.entran, 20);
    assert.equal(plan.archivos.cuadra, true,
      'ningún archivo puede quedar sin explicar: el cuadre es la única defensa contra escribir de menos');
  });

  test('«ya escrito» y «fuera del periodo» son cosas distintas y se dicen distinto', () => {
    const yaEstaba = motivoDelApartado({ causa: CAUSA_DEL_APARTADO.OTRA_CORRIDA });
    const fuera = motivoDelApartado({
      causa: CAUSA_DEL_APARTADO.PERIODO, periodo: { desde: '2026-04-24', hasta: '2026-04-28' },
    });
    assert.notEqual(yaEstaba, fuera);
    assert.match(yaEstaba, /no se tocó en esta corrida/);
    assert.match(fuera, /fuera del periodo pedido/);
  });

  test('«ya cargado» NO es un motivo del molde, y no puede colarse en el rastro', () => {
    // Es la defensa de fondo: aunque alguien lo intentara, el molde no lo admite.
    assert.ok(!MOTIVOS_APARTADO.includes(CAUSA_DEL_APARTADO.OTRA_CORRIDA));
    assert.ok(!MOTIVOS_APARTADO.includes('otra_corrida'));
    assert.deepEqual([...MOTIVOS_APARTADO], ['sello_no_actual', 'fuera_del_periodo', 'sin_lecturas']);
  });

  test('acotar el periodo SÍ se escribe: dejar fuera 2025 es un juicio sobre el dato', () => {
    const conViejo = [{ fecha: '2025-12-30', archivos: 4 }, ...dias];
    const plan = planDeLaCarga({ dias: conViejo, sellos, periodo: { desde: '2026-01-01' } });
    assert.equal(plan.dias.fuera, 1);
    assert.equal(plan.fuera[0].fecha, '2025-12-30');
    assert.equal(plan.dias.otraCorrida, 0);
  });

  test('el periodo manda sobre lo ya escrito: lo que no se pidió no se da por cargado', () => {
    const conViejo = [{ fecha: '2025-12-30', archivos: 4 }, ...dias];
    const plan = planDeLaCarga({
      dias: conViejo, sellos, periodo: { desde: '2026-01-01' }, yaCargadoHasta: '2026-04-23',
    });
    assert.equal(plan.fuera[0].fecha, '2025-12-30', 'sigue siendo «fuera del periodo», no «ya escrito»');
    assert.equal(plan.dias.otraCorrida, 3);
    assert.equal(plan.archivos.cuadra, true);
  });

  test('si ya estaba todo escrito lo DICE como buena noticia, no como si se hubiera apartado', () => {
    const plan = planDeLaCarga({ dias, sellos, yaCargadoHasta: '2026-04-28' });
    assert.equal(plan.sePuedeEmpezar, false);
    const freno = plan.frenos.find((f) => f.clave === 'nada-entra');
    assert.match(freno.texto, /ya estaban escritos/);
    assert.match(freno.texto, /No falta nada por cargar/);
  });

  test('sin reanudación nada cambia: el día malo se aparta por su SELLO, con su motivo', () => {
    const plan = planDeLaCarga({ dias, sellos });
    assert.equal(plan.dias.otraCorrida, 0);
    assert.equal(plan.dias.apartados, 1);
    assert.equal(plan.apartados[0].fecha, DIA_MALO);
    assert.equal(plan.apartados[0].causa, CAUSA_DEL_APARTADO.SELLO);
    assert.match(plan.apartados[0].porQue, /«Not Renewed» ×1/,
      'el motivo real no se pierde: es lo que se escribe para siempre');
  });
});
