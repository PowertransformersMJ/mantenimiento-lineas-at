// ============================================================================
// tests/linea-de-tiempo.test.js — un solo eje para el clima de la línea
// ----------------------------------------------------------------------------
// LO QUE SE VIGILA AQUÍ ES UNA SOLA COSA, Y ES DE DOCTRINA: juntar bajo un mismo
// selector lo que se MIDIÓ y lo que un modelo CREE es cómodo, y por eso mismo
// peligroso. Los dos números se parecen en pantalla y valen cosas distintas.
//
//   1. ENTRE UN HECHO Y UN MODELO, GANA EL HECHO. Si un día lo cubren los dos,
//      manda la medida.
//   2. NINGÚN DÍA SIN PROCEDENCIA. No existe un régimen mudo: todos dicen de
//      dónde salen y por qué.
//   3. UN HUECO SE VE. Un día sin dato se pinta como hueco, jamás se rellena con
//      el pronóstico ni desaparece del calendario (`32 · L-44`).
//   4. EL EXTREMO DERECHO NO SE INVENTA. Sale de los días que el pronóstico
//      trajo, no de un «hoy + 9» supuesto.
//
// Fechas sintéticas, sin relación con ninguna línea real (`33 · L-23`).
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  tramoDe, extremos, diasDelMesConRegimen, mesesDelEje, sumarDias, diaDe,
} from '../web/src/vistas/lineaDeTiempo.ts';

/** Un atlas que llega al 19 por horas y al 19 por día. El caso real de agosto. */
const ATLAS = {
  primerDia: '2026-01-01',
  ultimoDiaConHoras: '2026-08-19',
  ultimoDiaConTotal: '2026-08-19',
};
const HOY = '2026-08-22';
const PRONOSTICO = ['2026-08-22', '2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26'];

// ════════════════════════════════════════════════════════════════════════════
describe('de dónde sale cada día', () => {

  test('un día del pasado con detalle horario es MEDIDO', () => {
    const t = tramoDe('2026-03-14', ATLAS, HOY, PRONOSTICO);
    assert.equal(t.regimen, 'medido_horas');
    assert.equal(t.procedencia, 'medido');
  });

  test('un día con medida pero sin repartir por horas se distingue del anterior', () => {
    // El caso real del atlas solar: el total del día llega mucho más lejos que
    // el detalle hora a hora. Aplanar los dos en «medido» a secas dejaría mover
    // el deslizador de la hora sobre un día que no tiene horas.
    const solar = { ...ATLAS, ultimoDiaConHoras: '2026-05-30', ultimoDiaConTotal: '2026-08-18' };
    assert.equal(tramoDe('2026-07-04', solar, HOY, PRONOSTICO).regimen, 'medido_solo_total');
    assert.equal(tramoDe('2026-05-30', solar, HOY, PRONOSTICO).regimen, 'medido_horas');
  });

  test('un día futuro dentro del horizonte es PRONÓSTICO', () => {
    const t = tramoDe('2026-08-25', ATLAS, HOY, PRONOSTICO);
    assert.equal(t.regimen, 'pronostico');
    assert.equal(t.procedencia, 'pronóstico');
  });

  test('ENTRE UN HECHO Y UN MODELO, GANA EL HECHO', () => {
    // El pronóstico arrastra en su serie días que el histórico YA publicó. Si
    // ganara el modelo, la pantalla enseñaría lo que alguien cree que pasó
    // teniendo al lado lo que se midió.
    const solapado = ['2026-08-19', ...PRONOSTICO];
    const t = tramoDe('2026-08-19', ATLAS, HOY, solapado);
    assert.equal(t.regimen, 'medido_horas');
    assert.equal(t.procedencia, 'medido');
  });

  test('los días entre el último medido y hoy NO se rellenan con el pronóstico', () => {
    // 20 y 21 de agosto: ya pasaron, NASA aún no los publicó y el pronóstico no
    // los lleva. Es un hueco, y como hueco tiene que salir.
    for (const d of ['2026-08-20', '2026-08-21']) {
      const t = tramoDe(d, ATLAS, HOY, PRONOSTICO);
      assert.equal(t.regimen, 'sin_publicar', `${d} debería ser un hueco declarado`);
      assert.equal(t.procedencia, 'sin dato');
      assert.match(t.porque, /retraso|publicado/, 'el hueco tiene que explicarse');
    }
  });

  test('más allá del pronóstico y antes del atlas: fuera, y dicho', () => {
    assert.equal(tramoDe('2026-12-25', ATLAS, HOY, PRONOSTICO).regimen, 'fuera');
    assert.equal(tramoDe('2025-11-30', ATLAS, HOY, PRONOSTICO).regimen, 'fuera');
    assert.match(tramoDe('2025-11-30', ATLAS, HOY, PRONOSTICO).porque, /empieza el 2026-01-01/);
  });

  test('sin atlas todavía, el pronóstico sigue contestando', () => {
    // La ficha del atlas puede tardar en bajar. Que falte no puede dejar muda a
    // la otra mitad del eje: una capa opcional no veta a una esencial (`31 · L-11`).
    assert.equal(tramoDe('2026-08-25', null, HOY, PRONOSTICO).regimen, 'pronostico');
    assert.equal(tramoDe('2026-03-14', null, HOY, PRONOSTICO).regimen, 'fuera');
  });

  test('NINGÚN día se queda mudo: todos dicen de dónde salen y por qué', () => {
    const dias = ['2025-06-01', '2026-01-01', '2026-05-30', '2026-08-19', '2026-08-20',
      '2026-08-22', '2026-08-26', '2027-01-01'];
    for (const d of dias) {
      const t = tramoDe(d, ATLAS, HOY, PRONOSTICO);
      assert.ok(t.procedencia.length > 0, `${d} sin procedencia`);
      assert.ok(t.porque.length > 20, `${d} sin explicación de por qué`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('los extremos del eje', () => {

  test('el extremo derecho sale del pronóstico REAL, no de un «hoy + 9» supuesto', () => {
    const e = extremos(ATLAS, HOY, PRONOSTICO);
    assert.equal(e.ultima, '2026-08-26', 'ofreció un día que la fuente no trajo');
    assert.equal(e.primera, '2026-01-01');
  });

  test('sin pronóstico, el eje no promete futuro', () => {
    assert.equal(extremos(ATLAS, HOY, []).ultima, HOY);
  });

  test('sin atlas, el eje no promete pasado', () => {
    assert.equal(extremos(null, HOY, PRONOSTICO).primera, HOY);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('la cuadrícula del mes', () => {

  test('el mes sale ENTERO aunque parte no tenga dato', () => {
    const d = diasDelMesConRegimen(2026, 8, ATLAS, HOY, PRONOSTICO);
    assert.equal(d.length, 31, 'un día que desaparece del calendario miente por omisión');
    assert.equal(d[18].regimen, 'medido_horas');   // 19 de agosto
    assert.equal(d[19].regimen, 'sin_publicar');   // 20
    assert.equal(d[24].regimen, 'pronostico');     // 25
    assert.equal(d[30].regimen, 'fuera');          // 31
  });

  test('febrero bisiesto se cuenta bien', () => {
    assert.equal(diasDelMesConRegimen(2024, 2, ATLAS, HOY).length, 29);
    assert.equal(diasDelMesConRegimen(2026, 2, ATLAS, HOY).length, 28);
  });

  test('los meses del eje van del primero al último, cruzando el año', () => {
    const m = mesesDelEje('2026-11-15', '2027-02-03');
    assert.deepEqual(m.map((x) => x.clave), ['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  test('un eje de un solo mes da un solo mes', () => {
    assert.equal(mesesDelEje('2026-08-01', '2026-08-31').length, 1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('la aritmética de fechas no se va por el huso horario', () => {

  test('sumar días cruza mes y año sin desviarse', () => {
    assert.equal(sumarDias('2026-08-31', 1), '2026-09-01');
    assert.equal(sumarDias('2026-12-31', 1), '2027-01-01');
    assert.equal(sumarDias('2026-03-01', -1), '2026-02-28');
    assert.equal(sumarDias('2024-03-01', -1), '2024-02-29');
    assert.equal(sumarDias('2026-08-22', 0), '2026-08-22');
  });

  test('el día de hoy se lee en el reloj del activo, no en el de la máquina', () => {
    // 2026-08-23 a las 02:00 UTC es todavía el 22 en Colombia. Leerlo en UTC
    // adelantaría el eje un día entero y marcaría como «futuro» un día que aquí
    // no ha terminado (`32 · L-70`).
    assert.equal(diaDe(new Date('2026-08-23T02:00:00Z')), '2026-08-22');
    assert.equal(diaDe(new Date('2026-08-23T06:00:00Z')), '2026-08-23');
  });
});
