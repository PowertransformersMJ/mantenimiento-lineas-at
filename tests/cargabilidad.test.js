// ============================================================================
// tests/cargabilidad.test.js — el motor de la cargabilidad ELÉCTRICA
// ----------------------------------------------------------------------------
// QUÉ VIGILA. Este módulo lee archivos de OPERACIÓN —lo que de verdad circuló
// por la línea— y de ahí salen indicadores que un ingeniero mira antes de
// decidir. Las formas de mentir aquí no son excepciones raras: son las tres
// costumbres de cualquier hoja de cálculo colombiana.
//
//   1. **La coma decimal.** `1.234,5` son mil doscientos treinta y cuatro con
//      cinco. Leído a la inglesa son 1,2345 — mil veces menos, sin un error.
//   2. **`dd/mm` contra `mm/dd`.** Leer 03/04 como 4 de marzo mueve un mes
//      entero de datos de sitio y todas las gráficas quedan coherentes y falsas.
//   3. **El hueco leído como cero.** Una hora sin lectura NO es «0 % de carga»:
//      el 0 % en una línea de transmisión significa que está fuera de servicio,
//      que es un hecho grave, y además hunde los promedios.
//
// Y la trampa de dominio, que es la que más caro sale: **hay DOS cargabilidades
// y no son la misma**. La del archivo va contra la capacidad NOMINAL; la de este
// sistema, contra la ampacidad IEEE 738 del día. Ninguna sustituye a la otra y
// nunca se mezclan (`99 §ADR-052`, y la misma doctrina de `naturaleza` que
// `§ADR-086/087` puso en los atlas).
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as nodeFs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** El texto de un archivo del repo. Lo piden los guardianes de color del §10. */
const leer = (p) => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf-8');

import {
  aFecha, aHora, aNumero, atipicos, bandaDe, camposAusentes, claveDeRegistro,
  contrasteConLaAmpacidad, derivarPorcentaje, detectarMapeo, escalaDelPorcentaje,
  costeDeLectura, desempaquetarDia, elegirHoja, empaquetarPorDia, encontrarCabecera,
  histograma, mapaDeCalor, puntuarCabecera,
  normalizarCabecera, normalizarFila, porLinea, procesarLote, promedioMovil, resumen,
  resumirDia, separarNuevos, serieTemporal, tendencia,
} from '../nucleo/cargabilidad.js';

/** Un registro de juguete. Solo lo que mira la pieza bajo prueba. */
const reg = (linea, fecha, hora, pct, extra = {}) =>
  ({ linea, circuito: null, fecha, hora, cargabilidad_pct: pct, corriente_A: null,
    capacidadNominal_A: null, naturaleza: pct == null ? null : 'declarada', ...extra });

// ════════════════════════════════════════════════════════════════════════════
// 1 · EL MAPEO DE COLUMNAS
// ════════════════════════════════════════════════════════════════════════════
describe('qué columna del Excel es qué campo', () => {
  test('reconoce los nombres reales, con tildes, mayúsculas y signos', () => {
    const { mapeo, completo, faltanRequeridos } = detectarMapeo([
      'Fecha lectura', 'Hora registro', 'Nombre línea', '% Carga', 'Subestación Origen',
    ]);
    assert.equal(completo, true, `faltaron requeridos: ${faltanRequeridos.join(', ')}`);
    assert.equal(mapeo.fecha, 'Fecha lectura');
    assert.equal(mapeo.hora, 'Hora registro');
    assert.equal(mapeo.linea, 'Nombre línea');
    assert.equal(mapeo.cargabilidad_pct, '% Carga');
    assert.equal(mapeo.subestacionOrigen, 'Subestación Origen');
  });

  test('⚠️ «Corriente nominal» NO se lleva la corriente de operación', () => {
    // La trampa que haría que toda línea saliera al 100 % fijo: si «corriente
    // nominal» casara con `corriente_A` por contener la palabra, la corriente y
    // su límite serían la misma columna y el cociente daría 1 siempre.
    const { mapeo } = detectarMapeo(['Fecha', 'Línea', 'Corriente', 'Corriente nominal']);
    assert.equal(mapeo.corriente_A, 'Corriente');
    assert.equal(mapeo.capacidadNominal_A, 'Corriente nominal');
    assert.notEqual(mapeo.corriente_A, mapeo.capacidadNominal_A);
  });

  test('una cabecera no se asigna a dos campos', () => {
    const { mapeo } = detectarMapeo(['Fecha', 'Línea', 'Potencia']);
    const usadas = Object.values(mapeo);
    assert.equal(new Set(usadas).size, usadas.length, 'una columna quedó mapeada dos veces');
  });

  test('sin fecha o sin línea NO se puede procesar, y se dice cuál falta', () => {
    const r1 = detectarMapeo(['Hora', '% Carga']);
    assert.equal(r1.completo, false);
    assert.deepEqual(r1.faltanRequeridos.sort(), ['fecha', 'linea']);
  });

  test('lo que no reconoce lo DEVUELVE, no lo tira en silencio', () => {
    // Sin esto, una columna con dato bueno y nombre raro desaparecería sin que
    // nadie pudiera mapearla a mano — y el usuario nunca sabría que existió.
    const { sinReconocer } = detectarMapeo(['Fecha', 'Línea', 'Índice de calidad XYZ']);
    assert.deepEqual(sinReconocer, ['Índice de calidad XYZ']);
  });

  test('normalizarCabecera quita tildes y signos sin comerse el %', () => {
    assert.equal(normalizarCabecera('  %  Cargabilidad '), '% cargabilidad');
    assert.equal(normalizarCabecera('Subestación Origen'), 'subestacion origen');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2 · DE LA CELDA AL VALOR — las tres costumbres de una hoja colombiana
// ════════════════════════════════════════════════════════════════════════════
describe('leer una celda sin perder el número por el camino', () => {
  test('coma decimal y punto de miles', () => {
    assert.equal(aNumero('1.234,5'), 1234.5);
    assert.equal(aNumero('85,7'), 85.7);
    assert.equal(aNumero('1.234.567'), 1234567);
    assert.equal(aNumero('85.7'), 85.7, 'un punto solo, con un decimal, es decimal');
    assert.equal(aNumero('87 %'), 87);
    assert.equal(aNumero('(12,5)'), -12.5, 'el paréntesis contable es un negativo');
  });

  test('⚠️ un hueco es null, JAMÁS cero', () => {
    for (const vacio of [null, undefined, '', '   ', 'n/d', '-']) {
      assert.equal(aNumero(vacio), null, `«${vacio}» se leyó como número`);
    }
    assert.notEqual(aNumero(''), 0);
  });

  test('la fecha se lee dd/mm, que es la del archivo', () => {
    assert.equal(aFecha('03/04/2026'), '2026-04-03', 'se leyó a la inglesa: mes por día');
    assert.equal(aFecha('2026-04-03'), '2026-04-03');
    assert.equal(aFecha('3/4/26'), '2026-04-03');
    assert.equal(aFecha(new Date(Date.UTC(2026, 3, 3))), '2026-04-03');
    assert.equal(aFecha('no es fecha'), null);
    assert.equal(aFecha('32/04/2026'), null, 'un día imposible no se acepta');
  });

  test('el serial de Excel cuenta desde el 30 de diciembre de 1899', () => {
    // El 31 daría todo un día corrido: Excel arrastra desde 1985 la creencia de
    // que 1900 fue bisiesto, y el formato la conserva.
    assert.equal(aFecha(45000), '2023-03-15');
  });

  test('la hora se queda con la HORA: 13:45 es la hora 13', () => {
    assert.equal(aHora('13:45:00'), 13);
    assert.equal(aHora('13'), 13);
    assert.equal(aHora(0.5), 12, 'la fracción de día de Excel');
    assert.equal(aHora(24), null);
    assert.equal(aHora('tarde'), null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3 · LA ESCALA DEL PORCENTAJE — decidida por columna, nunca por fila
// ════════════════════════════════════════════════════════════════════════════
describe('0,85 puede ser 85 % o puede ser 0,85 %', () => {
  test('si hay valores por encima de 1, ya viene en porcentaje', () => {
    assert.equal(escalaDelPorcentaje([12, 85.5, 103]).escala, 1);
  });

  test('si NINGUNO pasa de 1, viene en fracción', () => {
    assert.equal(escalaDelPorcentaje([0.12, 0.855, 0.4]).escala, 100);
  });

  test('⚠️ una columna mezclada es AMBIGUA y se declara, no se adivina', () => {
    // Adivinar aquí convertiría una línea al 0,8 % —descargada, que existe— en
    // una al 80 %. Se prefiere parar y preguntar.
    const res = escalaDelPorcentaje([0.8, 1.2]);
    assert.equal(res.escala, null);
    assert.match(res.porQue, /mezcla/);
  });

  test('la escala se aplica IGUAL a todas las filas del lote', () => {
    const filas = [
      { F: '01/04/2026', L: 'LN-1', P: '0,80' },
      { F: '01/04/2026', L: 'LN-1', P: '0,95' },
    ];
    const { registros, escalaPct } = procesarLote(filas, { fecha: 'F', linea: 'L', cargabilidad_pct: 'P' });
    assert.equal(escalaPct.escala, 100);
    assert.deepEqual(registros.map((x) => x.cargabilidad_pct), [80, 95]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4 · LA FILA → EL REGISTRO
// ════════════════════════════════════════════════════════════════════════════
describe('una fila se convierte en registro, o se dice por qué no', () => {
  const mapeo = { fecha: 'F', hora: 'H', linea: 'L', cargabilidad_pct: 'P', corriente_A: 'I',
    capacidadNominal_A: 'C' };

  test('sin fecha o sin línea no hay registro, y el error dice cuál y en qué fila', () => {
    const r1 = normalizarFila({ F: '', H: '10', L: 'LN-1', P: '80' }, mapeo, { nFila: 7 });
    assert.equal(r1.registro, null);
    assert.equal(r1.errores[0].campo, 'fecha');
    assert.equal(r1.errores[0].nFila, 7);
  });

  test('un porcentaje imposible se rechaza: es una celda mal leída, no una sobrecarga', () => {
    // 250 % lo aceptamos (una sobrecarga real y grave). 900 % no: por ahí no hay
    // línea, hay un error de lectura — y colarlo dispara la escala de todas las
    // gráficas y esconde el resto de los datos.
    assert.ok(normalizarFila({ F: '01/04/2026', L: 'LN-1', P: '250' }, mapeo).registro);
    const malo = normalizarFila({ F: '01/04/2026', L: 'LN-1', P: '900' }, mapeo);
    assert.equal(malo.registro, null);
    assert.match(malo.errores[0].porQue, /creíble/);
  });

  test('el porcentaje del archivo se marca DECLARADA', () => {
    const { registro } = normalizarFila({ F: '01/04/2026', L: 'LN-1', P: '80' }, mapeo);
    assert.equal(registro.naturaleza, 'declarada');
  });

  test('sin porcentaje pero con corriente y capacidad, se DERIVA y se marca como tal', () => {
    const base = normalizarFila({ F: '01/04/2026', L: 'LN-1', I: '400', C: '500' }, mapeo).registro;
    const der = derivarPorcentaje(base);
    assert.equal(der.cargabilidad_pct, 80);
    assert.equal(der.naturaleza, 'derivada');
  });

  test('⚠️ derivar NUNCA pisa un porcentaje que ya venía', () => {
    // Dos dueños del mismo número es lo que `§ADR-052` cerró. Si el archivo trae
    // el %, ése manda y el nuestro se ofrece aparte como contraste.
    const conPct = { ...reg('LN-1', '2026-04-01', 10, 71), corriente_A: 400, capacidadNominal_A: 500 };
    const der = derivarPorcentaje(conPct);
    assert.equal(der.cargabilidad_pct, 71);
    assert.equal(der.naturaleza, 'declarada');
  });

  test('el lote cuenta buenos y malos, y devuelve los malos para poder mirarlos', () => {
    const filas = [
      { F: '01/04/2026', L: 'LN-1', P: '80' },
      { F: 'basura', L: 'LN-1', P: '81' },
      { F: '01/04/2026', L: '', P: '82' },
    ];
    const res = procesarLote(filas, mapeo);
    assert.equal(res.resumen.correctos, 1);
    assert.equal(res.resumen.conError, 2);
    assert.equal(res.errores.length, 2);
    assert.ok(res.errores.every((e) => e.nFila && e.porQue), 'un error sin fila ni motivo no sirve');
  });

  test('los campos que no trajo NI UNA fila se declaran, no se rellenan', () => {
    const { registros } = procesarLote([{ F: '01/04/2026', L: 'LN-1', P: '80' }], mapeo);
    assert.ok(camposAusentes(registros).includes('tension_kV'));
    assert.ok(!camposAusentes(registros).includes('cargabilidad_pct'));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5 · IDENTIDAD Y DUPLICADOS
// ════════════════════════════════════════════════════════════════════════════
describe('cargar dos veces el mismo archivo no duplica el histórico', () => {
  test('⚠️ la identidad NO incluye el valor: una corrección es el MISMO instante', () => {
    const a = reg('LN-1', '2026-04-01', 10, 80);
    const b = reg('LN-1', '2026-04-01', 10, 84);
    assert.equal(claveDeRegistro(a), claveDeRegistro(b),
      'si el valor entrara en la clave, corregir un dato crearía un registro nuevo '
      + 'y esa hora tendría dos verdades');
  });

  test('línea, circuito, fecha y hora sí distinguen', () => {
    const base = reg('LN-1', '2026-04-01', 10, 80);
    assert.notEqual(claveDeRegistro(base), claveDeRegistro(reg('LN-2', '2026-04-01', 10, 80)));
    assert.notEqual(claveDeRegistro(base), claveDeRegistro(reg('LN-1', '2026-04-02', 10, 80)));
    assert.notEqual(claveDeRegistro(base), claveDeRegistro(reg('LN-1', '2026-04-01', 11, 80)));
    assert.notEqual(claveDeRegistro(base),
      claveDeRegistro({ ...reg('LN-1', '2026-04-01', 10, 80), circuito: '2' }));
  });

  test('separa lo nuevo de lo que ya estaba', () => {
    const yaEstaba = claveDeRegistro(reg('LN-1', '2026-04-01', 10, 80));
    const { nuevos, yaEstaban } = separarNuevos(
      [reg('LN-1', '2026-04-01', 10, 84), reg('LN-1', '2026-04-01', 11, 82)],
      new Set([yaEstaba]),
    );
    assert.equal(yaEstaban.length, 1);
    assert.equal(nuevos.length, 1);
    assert.equal(nuevos[0].hora, 11);
  });

  test('un archivo que se repite a sí mismo se dice APARTE', () => {
    // No es un duplicado contra el histórico: es un archivo con un problema, y
    // confundirlos haría creer que el histórico ya tenía datos que no tenía.
    const { nuevos, repetidosEnElLote } = separarNuevos(
      [reg('LN-1', '2026-04-01', 10, 80), reg('LN-1', '2026-04-01', 10, 80)], new Set());
    assert.equal(nuevos.length, 1);
    assert.equal(repetidosEnElLote.length, 1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6 · EL RESUMEN DEL TABLERO
// ════════════════════════════════════════════════════════════════════════════
describe('los indicadores no afirman lo que nadie midió', () => {
  test('sin registros, todo va en null — no en cero', () => {
    const s = resumen([]);
    assert.equal(s.maxima, null);
    assert.equal(s.promedio, null);
    assert.equal(s.disponibilidad_pct, null, '0 % de disponibilidad sobre cero datos es una afirmación');
  });

  test('los huecos NO entran en el promedio, y se cuentan como falta de dato', () => {
    const s = resumen([
      reg('LN-1', '2026-04-01', 10, 80),
      reg('LN-1', '2026-04-01', 11, null),
      reg('LN-1', '2026-04-01', 12, 100),
    ]);
    assert.equal(s.promedio, 90, 'el hueco se coló como 0 y hundió el promedio');
    assert.equal(s.conMedida, 2);
    assert.equal(s.registros, 3);
    assert.equal(s.disponibilidad_pct, 66.7);
  });

  test('la hora pico sale del PROMEDIO de esa hora, no de un pico suelto', () => {
    // Un máximo aislado a las 3 a.m. no hace de las 3 la hora de mayor demanda:
    // decirlo mandaría a mirar donde no es.
    const s = resumen([
      reg('LN-1', '2026-04-01', 3, 99), reg('LN-2', '2026-04-01', 3, 10),
      reg('LN-1', '2026-04-01', 19, 88), reg('LN-2', '2026-04-01', 19, 86),
    ]);
    assert.equal(s.horaPico.hora, 19);
  });

  test('cuenta los eventos de sobrecarga y reparte por banda', () => {
    const s = resumen([
      reg('LN-1', '2026-04-01', 1, 70), reg('LN-1', '2026-04-01', 2, 85),
      reg('LN-1', '2026-04-01', 3, 95), reg('LN-1', '2026-04-01', 4, 104),
    ]);
    assert.equal(s.eventosSobrecarga, 1);
    assert.deepEqual(s.porBanda, { normal: 1, elevada: 1, atencion: 1, sobrecarga: 1 });
  });

  test('las bandas son las que él pidió, y 100 ya es sobrecarga', () => {
    assert.equal(bandaDe(79.9).clave, 'normal');
    assert.equal(bandaDe(80).clave, 'elevada');
    assert.equal(bandaDe(90).clave, 'atencion');
    assert.equal(bandaDe(100).clave, 'sobrecarga');
    assert.equal(bandaDe(null), null, 'un hueco no tiene color');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 7 · LAS VISTAS DE LAS GRÁFICAS
// ════════════════════════════════════════════════════════════════════════════
describe('lo que comen las gráficas', () => {
  const datos = [
    reg('LN-1', '2026-04-01', 10, 60), reg('LN-1', '2026-04-01', 20, 100),
    reg('LN-2', '2026-04-01', 10, 90), reg('LN-2', '2026-04-02', 10, 92),
  ];

  test('por línea: promedio, máximo, mínimo y ÚLTIMO valor, ordenado de mayor a menor', () => {
    const filas = porLinea(datos);
    assert.equal(filas[0].linea, 'LN-2', 'el ranking no ordena por promedio');
    const ln1 = filas.find((f) => f.linea === 'LN-1');
    assert.deepEqual([ln1.promedio, ln1.maximo, ln1.minimo, ln1.ultimo], [80, 100, 60, 100]);
    const ln2 = filas.find((f) => f.linea === 'LN-2');
    assert.equal(ln2.ultimo, 92, 'el último es el más reciente en el TIEMPO, no el último de la lista');
  });

  test('la serie temporal sale ordenada', () => {
    const s = serieTemporal(datos, 'LN-2');
    assert.deepEqual(s.map((p) => p.fecha), ['2026-04-01', '2026-04-02']);
  });

  test('⚠️ el mapa de calor deja la celda sin dato en null, no del color del cero', () => {
    const m = mapaDeCalor(datos, 'hora');
    assert.equal(m.lineas.length, 2);
    assert.equal(m.columnas.length, 24);
    const filaLn1 = m.celdas[m.lineas.indexOf('LN-1')];
    assert.equal(filaLn1[0], null, 'la hora 0 no se midió y salió pintada');
    assert.equal(filaLn1[10].pct, 60);
    assert.equal(filaLn1[20].banda, 'sobrecarga');
  });

  test('el histograma llega al menos hasta 100 y recoge lo que se pase', () => {
    const h = histograma([...datos, reg('LN-3', '2026-04-01', 1, 130)], 10);
    assert.ok(h.at(-1).hasta >= 130);
    assert.equal(h.reduce((a, b) => a + b.n, 0), 5);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 8 · TENDENCIA Y ATÍPICOS
// ════════════════════════════════════════════════════════════════════════════
describe('tendencias que no se inventan', () => {
  const serieDe = (pcts) => pcts.map((p, i) => ({ fecha: '2026-04-01', hora: i, pct: p }));

  test('⚠️ con pocos puntos NO hay tendencia, y se dice', () => {
    const t = tendencia(serieDe([80, 82, 84]));
    assert.equal(t.suficiente, false);
    assert.match(t.porQue, /al menos/);
  });

  test('una serie que sube lo dice, con su pendiente y su variación', () => {
    const t = tendencia(serieDe([60, 62, 64, 66, 68, 70, 72, 74, 76]));
    assert.equal(t.suficiente, true);
    assert.equal(t.sentido, 'sube');
    assert.ok(t.pendiente_pct_por_paso > 0);
    assert.ok(t.variacion_pct > 0);
  });

  test('una serie plana es «estable», no una subida de ruido', () => {
    assert.equal(tendencia(serieDe([80, 80.01, 79.99, 80, 80.01, 79.99, 80])).sentido, 'estable');
  });

  test('el promedio móvil deja los extremos en null: no se inventa ventana', () => {
    const m = promedioMovil(serieDe([10, 20, 30, 40, 50]), 3);
    assert.equal(m[0].media, null);
    assert.equal(m[4].media, null);
    assert.equal(m[2].media, 30);
  });

  test('⚠️ los atípicos se MARCAN, y la función no los quita de ningún sitio', () => {
    const datos = [
      ...Array.from({ length: 12 }, (_, i) => reg('LN-1', '2026-04-01', i, 80 + (i % 3))),
      reg('LN-1', '2026-04-01', 22, 180),
    ];
    const a = atipicos(datos);
    assert.equal(a.suficiente, true);
    assert.equal(a.marcados.length, 1);
    assert.equal(a.marcados[0].pct, 180);
    assert.equal(a.marcados[0].lado, 'alto');
    assert.equal(datos.length, 13, 'la función tocó el arreglo que le pasaron');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 9 · EL CONTRASTE CON LA AMPACIDAD — la única cifra que el Excel no traía
// ════════════════════════════════════════════════════════════════════════════
describe('el % del archivo frente al % contra la ampacidad del día', () => {
  const conCorriente = { ...reg('LN-1', '2026-04-01', 14, 71), corriente_A: 512,
    capacidadNominal_A: 718 };

  test('sin ampacidad NO se compara, y se dice por qué', () => {
    const c = contrasteConLaAmpacidad(conCorriente, null);
    assert.equal(c.comparable, false);
    assert.match(c.porQue, /IEEE 738/);
    assert.match(c.porQue, /decisión de ingeniería/);
  });

  test('sin corriente tampoco: un porcentaje solo no se puede recalcular', () => {
    assert.equal(contrasteConLaAmpacidad(reg('LN-1', '2026-04-01', 14, 71), 512).comparable, false);
  });

  test('⚠️ la capacidad REAL del día puede dejar al 100 % lo que el informe da al 71 %', () => {
    // El caso medido de LN-627: 718 A en día típico, 512 A en El Niño con viento
    // en calma. Los mismos 512 A son el 71 % de la nominal y el 100 % de la de
    // ese día. Es la razón entera por la que este contraste existe.
    const c = contrasteConLaAmpacidad(conCorriente, 512);
    assert.equal(c.comparable, true);
    assert.equal(c.declarado_pct, 71);
    assert.equal(c.contraAmpacidad_pct, 100);
    assert.equal(c.diferencia_pct, 29);
    assert.equal(c.banda, 'sobrecarga');
    assert.match(c.aviso, /más cargada de lo que dice el informe/);
  });

  test('el contraste NO cambia el registro: informa, no corrige', () => {
    const antes = { ...conCorriente };
    contrasteConLaAmpacidad(conCorriente, 512);
    assert.deepEqual(conCorriente, antes, 'el contraste mutó el registro que le pasaron');
  });

  test('y dice de qué naturaleza era el porcentaje que compara', () => {
    const c = contrasteConLaAmpacidad(conCorriente, 700);
    assert.equal(c.naturalezaDeclarada, 'declarada');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 10 · EL COLOR — dos familias, y no se pueden intercambiar
// ════════════════════════════════════════════════════════════════════════════
//
// ⚠️ ESTE GUARDIÁN NACE DE UNA FOTO. La primera versión tenía UN solo mapa de
// color, el de relleno, y se usó también para la tinta: «103,2 %» —la cifra más
// importante de la pantalla— salió impresa en `#fceceb` sobre panel claro, y las
// rayas del 80/90/100 salieron invisibles. Compilaba, pasaba las 2.050 pruebas y
// el guardián de estilo decía que sí, porque las clases existían y los tokens
// también. Lo que ninguna prueba miraba era **para qué sirve cada token**.
describe('un token de FONDO no puede usarse como tinta', () => {
  test('el mapa de RELLENO usa tokens de superficie, y el de TINTA no', () => {
    const vista = leer('web/src/vistas/cargabilidadVista.ts');
    const trozo = (nombre) => {
      const i = vista.indexOf(`export const ${nombre}`);
      assert.ok(i > 0, `falta el mapa ${nombre}`);
      return vista.slice(i, vista.indexOf('};', i));
    };
    // `--t-*` son fondos de tarjeta (#fdf3df, #fceceb…). `--tx-*` y `--acc` son tinta.
    for (const token of trozo('RELLENO_BANDA').match(/var\(--[a-z0-9-]+\)/g) ?? []) {
      assert.match(token, /var\(--t-/, `${token} no es un token de superficie`);
    }
    for (const token of trozo('TINTA_BANDA').match(/var\(--[a-z0-9-]+\)/g) ?? []) {
      assert.ok(/var\(--(tx-|acc)/.test(token),
        `${token} es un FONDO usado como tinta: eso deja la cifra ilegible sobre el panel`);
    }
  });

  test('la pantalla no escribe texto ni traza con un token de relleno', () => {
    const pant = leer('web/src/componentes/Cargabilidad.tsx');
    for (const m of pant.matchAll(/(color|fill|stroke)=\{([^}]*)\}/g)) {
      assert.ok(!/RELLENO_BANDA|rellenoDe/.test(m[2]),
        `«${m[0]}» pinta tinta con un token de fondo`);
    }
    // Y al revés: una superficie grande con tinta encima quedaría de un color plano.
    for (const m of pant.matchAll(/background: ([A-Za-z_]+[^,}]*)/g)) {
      if (/TINTA_BANDA/.test(m[1])) {
        assert.match(m[0], /barra-|histo-|banda-chip|tintaDe\(v\)/,
          `«${m[0]}» rellena una superficie grande con tinta`);
      }
    }
  });
});

describe('la barra vive dentro de su pista', () => {
  test('⚠️ `.barra-valor` es absoluta: su padre TIENE que ser `.barra-pista`', () => {
    // Lo cazó una foto: se inventó un `.barra-canal` paralelo, `.barra-valor`
    // se salió de él —no era un padre posicionado— y la barra no se dibujó. Se
    // veía el canal vacío con el número al lado, y todo en verde.
    const pant = leer('web/src/componentes/Cargabilidad.tsx');
    for (const m of pant.matchAll(/<span className="([a-z-]*)"[^>]*>\s*<span className="barra-valor"/g)) {
      assert.equal(m[1], 'barra-pista',
        `«barra-valor» dentro de «${m[1]}»: si ese padre no es relativo, la barra no se pinta`);
    }
    assert.match(pant, /className="barra-pista"/, 'la barra dejó de usar la pista que ya existía');
    const css = leer('web/src/estilo.css');
    assert.match(css, /\.barra-pista \{[^}]*position: relative/,
      '`.barra-pista` dejó de ser el padre posicionado del que depende `.barra-valor`');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 11 · EMPAQUETAR PARA GUARDAR — la decisión que evita la factura
// ════════════════════════════════════════════════════════════════════════════
describe('un documento por línea y día, no uno por lectura', () => {
  const dia = (h, pct, extra = {}) =>
    ({ linea: 'LN-A', circuito: null, fecha: '2026-04-01', hora: h,
      cargabilidad_pct: pct, naturaleza: pct == null ? null : 'declarada', ...extra });

  test('las 24 horas caben en UN documento', () => {
    const { dias } = empaquetarPorDia([dia(10, 80), dia(11, 104), dia(12, 70)]);
    assert.equal(dias.length, 1, 'se hizo un documento por lectura: eso es lo que se evita');
    assert.deepEqual(Object.keys(dias[0].horas).sort(), ['10', '11', '12']);
  });

  test('⚠️ una hora SIN medida no se escribe: ni null, ni cero', () => {
    const { dias } = empaquetarPorDia([dia(10, 80), dia(11, null)]);
    assert.deepEqual(Object.keys(dias[0].horas), ['10'],
      'la hora vacía entró en el documento y afirma una lectura que nadie tomó');
  });

  test('⚠️ un registro SIN hora no se coloca en la 0: se devuelve aparte', () => {
    // Es justo la fila a la que Excel le omitió la celda. Meterla en la hora 0
    // sería inventar una medida a medianoche.
    const { dias, sinHora } = empaquetarPorDia([dia(null, 90), dia(10, 80)]);
    assert.equal(sinHora.length, 1);
    assert.deepEqual(Object.keys(dias[0].horas), ['10']);
  });

  test('la hora va como CLAVE de texto con dos cifras', () => {
    const { dias } = empaquetarPorDia([dia(7, 80)]);
    assert.ok('07' in dias[0].horas, `las claves salieron ${Object.keys(dias[0].horas)}`);
  });

  test('el porcentaje NUNCA viaja sin su naturaleza', () => {
    // El molde se niega a guardarlo, así que dejarlo salir de aquí sería mandar
    // a la base algo que va a rebotar — o peor, que valida por defecto.
    const { dias } = empaquetarPorDia([{ ...dia(10, 80), naturaleza: null }]);
    assert.equal(dias[0].horas['10'].naturaleza, 'declarada');
    const { dias: d2 } = empaquetarPorDia([dia(11, null, { corriente_A: 400 })]);
    assert.equal(d2[0].horas['11'].naturaleza, undefined,
      'se puso naturaleza a una hora sin porcentaje: no hay nada que calificar');
  });

  test('líneas, circuitos y días distintos NO se mezclan en el mismo documento', () => {
    const { dias } = empaquetarPorDia([
      dia(10, 80),
      { ...dia(10, 81), linea: 'LN-B' },
      { ...dia(10, 82), circuito: '2' },
      { ...dia(10, 83), fecha: '2026-04-02' },
    ]);
    assert.equal(dias.length, 4);
  });

  test('ida y vuelta: lo que se guarda se puede volver a leer igual', () => {
    const originales = [dia(10, 80, { corriente_A: 400 }), dia(11, 104)];
    const { dias } = empaquetarPorDia(originales);
    const vuelta = desempaquetarDia(dias[0]);
    assert.equal(vuelta.length, 2);
    assert.deepEqual(vuelta.map((v) => [v.hora, v.cargabilidad_pct]), [[10, 80], [11, 104]]);
    assert.equal(vuelta[0].corriente_A, 400);
    assert.equal(vuelta[1].corriente_A, null, 'lo que no se guardó vuelve como hueco, no como 0');
  });

  test('el resumen del día trae lo que el tablero necesita sin abrir las horas', () => {
    const { dias } = empaquetarPorDia([dia(10, 80), dia(11, 104), dia(12, null)]);
    const res = resumirDia(dias[0]);
    assert.equal(res.horasConMedida, 2);
    assert.equal(res.maxima_pct, 104);
    assert.equal(res.minima_pct, 80);
    assert.equal(res.promedio_pct, 92);
    assert.equal(res.horaMaxima, '11');
    assert.deepEqual(res.porBanda, { normal: 0, elevada: 1, atencion: 0, sobrecarga: 1 });
  });

  test('un día sin ninguna medida se resume sin inventar cifras', () => {
    const res = resumirDia({ linea: 'LN-A', fecha: '2026-04-01', horas: {} });
    assert.equal(res.horasConMedida, 0);
    assert.equal(res.maxima_pct, undefined, 'un día vacío no tiene máximo, y no es 0');
    assert.equal(res.promedio_pct, undefined);
  });

  test('⚠️ el coste de leer se puede decir ANTES de pedirlo', () => {
    // Una pantalla que ofrece «histórico completo» sin decir lo que cuesta es
    // una pantalla que un día tumba el servicio sin avisar.
    const c = costeDeLectura({ lineas: 10, dias: 365 });
    assert.equal(c.documentos, 3650);
    assert.equal(c.siFueraPorLectura, 87600,
      'la cifra que justifica el diseño entero dejó de calcularse');
    assert.ok(c.siFueraPorLectura / c.documentos === 24);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 12 · NI UN DATO INVENTADO — orden del Ingeniero (2026-08-29)
// ════════════════════════════════════════════════════════════════════════════
//
// «No coloques información basura en el módulo de cargabilidad, ahí solo se
// deben reflejar datos reales que yo te entregue.»
//
// No es una preferencia de estilo: en el proyecto hermano ya costó un ADR entero
// («veo información basura»: una pantalla enseñaba equipos inventados sin
// rotularlos). Un dato de ejemplo en un módulo que alimenta dictámenes no se
// distingue de un dato real cuando alguien lo mira con prisa — y el que mira con
// prisa es siempre el que decide.
describe('el módulo no enseña nada que el Ingeniero no haya entregado', () => {
  const FUENTES = [
    'web/src/componentes/Cargabilidad.tsx',
    'web/src/vistas/cargabilidadVista.ts',
    'nucleo/cargabilidad.js',
    'importar/xlsx.js',
  ];

  test('no hay líneas, subestaciones ni lecturas escritas en el código', () => {
    for (const f of FUENTES) {
      // Se mira el CÓDIGO, no los comentarios: un ejemplo explicando el porqué
      // es documentación; el mismo texto en un literal es un dato falso.
      const codigo = leer(f)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
      assert.ok(!/'LN-[A-Z0-9]/.test(codigo) && !/"LN-[A-Z0-9]/.test(codigo),
        `${f} tiene un nombre de línea escrito en el código`);
      assert.ok(!/\bSE [A-ZÁÉÍÓÚ]/.test(codigo), `${f} tiene una subestación escrita en el código`);
    }
  });

  test('no hay respaldo de «demostración» al que caer cuando falta el dato', () => {
    // Es la trampa exacta del proyecto hermano: un baseline local de tres
    // equipos que se enseña cuando no hay parque cargado. Aquí, sin archivo no
    // se enseña NADA — que es la única respuesta honesta.
    for (const f of FUENTES) {
      const codigo = leer(f);
      assert.ok(!/baseline|datos de ejemplo|demo[Dd]atos|FIXTURE|fixture/.test(codigo),
        `${f} tiene un respaldo de demostración`);
    }
  });

  test('la pantalla DICE que está vacía, en vez de callar', () => {
    const pant = leer('web/src/componentes/Cargabilidad.tsx');
    assert.match(pant, /Aquí no hay nada hasta que usted cargue su archivo/,
      'una pantalla muda invita a rellenarla con un ejemplo');
    assert.match(pant.replace(/\s+/g, ' '), /no trae datos de ejemplo ni de demostración/,
      'se cayó la promesa de que aquí no hay datos inventados');
  });

  test('el fixture sintético NO sale de `tests/`', () => {
    // Existe para probar el lector y jamás para enseñarse. Si un día apareciera
    // en `web/public/` viajaría al sitio publicado y podría cargarse por error.
    for (const ruta of ['web/public/cargabilidad-sintetico.xlsx',
      'web/src/cargabilidad-sintetico.xlsx', 'web/dist/cargabilidad-sintetico.xlsx']) {
      assert.ok(!nodeFs.existsSync(fileURLToPath(new URL('../' + ruta, import.meta.url))),
        `el fixture se coló en ${ruta}: desde ahí viaja al sitio publicado`);
    }
  });

  test('el entorno es DINÁMICO: nada del archivo se da por sabido', () => {
    // Las líneas, las columnas, las fechas y el número de registros salen SIEMPRE
    // de lo que se cargue. Lo único fijo son las bandas 80/90/100, que las pidió
    // él y viven en UN sitio declarado como convención de lectura, no como norma.
    const nucleo = leer('nucleo/cargabilidad.js');
    assert.match(nucleo, /BANDAS DE LECTURA|son de LECTURA, NO un dictamen|ESTAS BANDAS SON DE LECTURA/,
      'las bandas dejaron de declararse como convención y pasan por norma');
    const pant = leer('web/src/componentes/Cargabilidad.tsx');
    assert.match(pant, /\[\.\.\.new Set\(registros\.map\(/,
      'las líneas de la gráfica dejaron de salir del archivo cargado');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 13 · LA CABECERA CASI NUNCA ES LA PRIMERA FILA
// ════════════════════════════════════════════════════════════════════════════
//
// ⚠️ NACE DE UN ARCHIVO REAL. El lector daba por hecho que la fila 1 era la
// cabecera; con el primer `.xlsx` del Ingeniero el resultado fue **una sola
// columna, sin nombre, y ningún campo reconocido** — su hoja empieza por un
// título, como cualquier informe de operación. La pantalla le pedía mapear trece
// columnas a mano, que es justo lo que no puede pasar.
describe('la cabecera se BUSCA, no se supone', () => {
  const conTitulo = [
    ['CARGAS 22 JUL LN-627', null, null],
    [],
    ['Fecha', 'Hora', '% Carga'],
    ['22/07/2026', 10, 80],
  ];

  test('un título y una fila en blanco por delante no despistan', () => {
    const c = encontrarCabecera(conTitulo);
    assert.equal(c.fila, 2, 'se tomó el título por cabecera');
    assert.equal(c.reconocidas, 3);
    assert.match(c.porQue, /fila 3/);
  });

  test('⚠️ gana la más RECONOCIBLE, no la más llena', () => {
    // El título de un informe también está lleno. Si «llena» pesara, ganaría él.
    const c = encontrarCabecera([
      ['Informe', 'de', 'cargas', 'de', 'la', 'linea', 'en', 'julio'],
      ['Fecha', 'Línea'],
    ]);
    assert.equal(c.fila, 1, 'ganó la fila con más celdas en vez de la que reconoce campos');
  });

  test('si la cabecera se repite más abajo, manda la de arriba', () => {
    const c = encontrarCabecera([
      ['Fecha', 'Hora', 'Línea'], ['22/07/2026', 1, 'X'], ['Fecha', 'Hora', 'Línea'],
    ]);
    assert.equal(c.fila, 0);
  });

  test('⚠️ si NADA se reconoce, NO se inventa una cabecera: se devuelven candidatas', () => {
    // Mapear a ciegas la primera fila llenaría la pantalla de números
    // equivocados. Es mejor enseñar las filas crudas y que él señale.
    const c = encontrarCabecera([['a', 'b'], ['c', 'd']]);
    assert.equal(c.fila, null);
    assert.ok(c.candidatas.length >= 1, 'no se ofrece con qué decidir');
    assert.match(c.porQue, /no se reconoció ni un campo/);
  });

  test('la hoja se elige por lo que RECONOCE, no por la primera ni la mayor', () => {
    const mejor = elegirHoja([
      { nombre: 'Portada', matriz: [['Informe mensual'], ['Elaboró: —'], ['Fecha de emisión']] },
      { nombre: 'Datos', matriz: conTitulo },
    ]);
    assert.equal(mejor.nombre, 'Datos');
    assert.equal(mejor.cabecera.fila, 2);
  });

  test('una fila vacía no puntúa nada', () => {
    assert.deepEqual(puntuarCabecera([]), { llenas: 0, reconocidas: 0, requeridos: 0, puntos: 0 });
    assert.equal(puntuarCabecera([null, '', '   ']).puntos, 0);
  });

  test('la pantalla DICE qué fila usó y deja señalar otra', () => {
    const pant = leer('web/src/componentes/Cargabilidad.tsx');
    assert.match(pant, /encontrarCabecera\(hoja\.matriz\)/, 'la pantalla volvió a suponer la fila 1');
    assert.match(pant, /elegirHoja\(hojas\)/, 'la pantalla volvió a elegir hoja por tamaño');
    assert.match(pant, /Se está usando la <b>fila \{cargado\.filaCabecera \+ 1\}/,
      'no se dice de dónde salió la cabecera: si falla, nadie sabe por qué');
    assert.match(pant, /alUsarFila/, 'no hay forma de corregir la fila sin salir a tocar el Excel');
  });
});
