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
import { fileURLToPath } from 'node:url';

/** El texto de un archivo del repo. Lo piden los guardianes de color del §10. */
const leer = (p) => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf-8');

import {
  aFecha, aHora, aNumero, atipicos, bandaDe, camposAusentes, claveDeRegistro,
  contrasteConLaAmpacidad, derivarPorcentaje, detectarMapeo, escalaDelPorcentaje,
  histograma, mapaDeCalor, normalizarCabecera, normalizarFila, porLinea, procesarLote,
  promedioMovil, resumen, separarNuevos, serieTemporal, tendencia,
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
