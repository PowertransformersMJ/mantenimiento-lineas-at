// ============================================================================
// tests/linea-recorrido.test.js — la línea que TODAVÍA NO CALCULA no miente
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. Desde el molde 0.16.0 una línea puede estar dada de alta sin
// torres registradas, sin conductor y sin hipótesis (orden del Ingeniero del
// 2026-09-17: el GPS deja un LEVANTAMIENTO, y las torres nacen el día que él
// declare la función de cada una). Hasta hoy eso no llegaba a la pantalla: el
// almacén devolvía `error` o `vacio`, las dos SUSTITUYEN la vista entera, y con
// ella se iba la columna del parque — o sea que dar de alta LN-617 dejaba sin
// acceso a LN-627.
//
// Lo que estas pruebas vigilan no es un número: son NEGATIVAS, que es lo que
// este proyecto ha aprendido a proteger.
//
//   ① Que no se enseñe como aprobado lo que es un HUECO (`32 · L-44`). Ni un
//     «0/0» en el parque, ni una banda en verde sobre una línea sin un solo
//     dato, ni «sin eventos registrados» cuando lo que pasó es que no se
//     pudieron leer.
//   ② Que una pestaña no se apague por un dato que NO usa. Térmica no mira una
//     sola torre —la ampacidad es del conductor con el clima— y es la primera
//     que abrirá cuando lleguen conductor e hipótesis: meterla en el saco de
//     «faltan las tres» la escondería sin motivo.
//   ③ Que NUNCA se use nada de otra línea. Es la orden más repetida del
//     Ingeniero en esta tanda, y aquí se comprueba sobre el texto que se ve.
//   ④ Que el código de una línea no vuelva a escribirse DENTRO de un
//     componente. Ocho sitios hacían `.replace('LN-627 ', '')`: con tres líneas
//     en el parque, esos ocho recortaban el prefijo de una y dejaban el nombre
//     entero de las otras dos.
//   ⑤ Que el aviso de «no se pudieron leer las torres» LLEGUE A LA PANTALLA. Es
//     el fallo más caro del proyecto: una línea que calcula con la mitad de sus
//     torres y no lo dice.
//
// Las coordenadas de los fixtures son INVENTADAS y están sobre un meridiano
// redondo: este repositorio es público y no entra un solo byte de cliente.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  FALTAS_EN_ORDEN, ROTULO_DE_FALTA, ordenarFaltas, motivoDeFaltas, titularDeFaltas,
  porQueNoCalcula, faltaEnElParque, requisitosDePestana, faltasDePestana,
  cartelDePestana, cartelDeLaLinea, bandaSinCalculo, motivoSinHorizonte,
  fechaDeCampoLarga, fechaDeCampoCorta, selloDelRecorrido, recorridoLevantado,
} from '../web/src/vistas/recorrido.ts';
import { sinPrefijoDeSerie, extremosSinPrefijo, rotuloDeTramo } from '../web/src/vistas/rotulos.ts';
// La geodesia se le pide al núcleo también AQUÍ: una prueba que calcula la
// distancia por su cuenta comprueba su propia aritmética, no la del sistema.
import { vincenty } from '../nucleo/geodesia.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENTES = join(RAIZ, 'web/src/componentes');
const LINEA = readFileSync(join(COMPONENTES, 'Linea.tsx'), 'utf-8');

// ════════════════════════════════════════════════════════════════════════════
describe('qué le falta a la línea, dicho en castellano', () => {
  test('el orden es FIJO, se pidan como se pidan', () => {
    // Para que dos capturas del mismo día se puedan comparar y para que una
    // falta no cambie de sitio entre dos repintados.
    assert.deepEqual(ordenarFaltas(['hipotesis', 'torres', 'conductor']),
      ['torres', 'conductor', 'hipotesis']);
    assert.deepEqual(ordenarFaltas(['hipotesis', 'hipotesis']), ['hipotesis'],
      'una falta repetida se enumeraría dos veces');
    assert.deepEqual([...FALTAS_EN_ORDEN], ['torres', 'conductor', 'hipotesis']);
  });

  test('«torres» a secas no se le enseña a nadie', () => {
    // El rótulo dice TORRES REGISTRADAS: la línea sí tiene torres en el campo,
    // lo que no tiene es torres dadas de alta con su función declarada.
    assert.equal(ROTULO_DE_FALTA.torres, 'torres registradas');
    assert.match(motivoDeFaltas(['torres']), /^faltan: torres registradas$/);
    assert.equal(motivoDeFaltas([]), '', 'sin faltas no se escribe «faltan:» nada');
  });

  test('el titular del cartel es la misma frase, no una segunda redacción', () => {
    for (const f of [['torres'], ['conductor', 'hipotesis'], [...FALTAS_EN_ORDEN]]) {
      assert.equal(titularDeFaltas(f), `${motivoDeFaltas(f).replace('f', 'F')}.`);
    }
  });

  test('la frase del cielo dice SIEMPRE que no se usa lo de otra línea', () => {
    // Es la orden del Ingeniero del 2026-09-17 y la parte que más importa de
    // esa frase: quien mira una pantalla vacía tiene que saber que está vacía
    // porque no hay dato, no porque el programa no lo encuentre.
    for (const f of [['torres'], ['conductor'], [...FALTAS_EN_ORDEN], []]) {
      assert.match(porQueNoCalcula('LN-000', f), /No se usa lo de otra línea\.$/);
    }
    assert.match(porQueNoCalcula('LN-000', [...FALTAS_EN_ORDEN]),
      /^LN-000 no tiene torres registradas, ni conductor, ni hipótesis:/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('la columna del parque no inventa un cero', () => {
  test('sin faltas no se escribe nada bajo la línea', () => {
    assert.equal(faltaEnElParque([]), '');
  });

  test('«sin conductor ni hipótesis» va junto, no en dos renglones', () => {
    assert.equal(faltaEnElParque(['conductor', 'hipotesis']), 'sin conductor ni hipótesis');
    assert.equal(faltaEnElParque(['conductor']), 'sin conductor');
    assert.equal(faltaEnElParque(['hipotesis']), 'sin hipótesis');
  });

  test('con las tres, el texto de la maqueta M4, letra por letra', () => {
    assert.equal(faltaEnElParque([...FALTAS_EN_ORDEN]),
      'sin torres registradas · sin conductor ni hipótesis');
  });

  test('EL CONTADOR NO SE PINTA SIN VEREDICTOS QUE CONTAR', () => {
    // La negativa que manda en esta columna. «0/0» no es un cero malo: es que
    // no hay nada que contar, y un cero en rojo se leería como veintiocho
    // torres suspendidas. El contador cuelga de que exista `estado`, y `estado`
    // solo existe cuando la línea calcula.
    assert.match(LINEA, /l\.id === linea\.id && estado && \(/,
      'el contador de veredictos volvió a pintarse sin comprobar que haya algo que contar');
    assert.match(LINEA, /const estado = useMemo\(\(\) => \{\s*\n\s*if \(!ejes \|\| !hipotesis\) return null;/,
      'el estado de la línea dejó de poder ser nulo: volvería el «0/0»');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('cada pestaña pide LO SUYO, no las tres cosas', () => {
  // La tabla de la maqueta M2, aprobada por el Ingeniero. Está escrita entera y
  // no por excepciones: una pestaña que se cuele sin requisitos abriría y
  // reventaría, y una a la que le sobre un requisito se apagaría sin motivo.
  const ESPERADO = {
    resumen: [], gps: [], distancias: [], falla: [], parametros: [], cargar: [],
    fichas: ['torres'], fotos: ['torres'],
    termica: ['conductor', 'hipotesis'],
    fundamentos: ['torres', 'conductor', 'hipotesis'],
    mecanico: ['torres', 'conductor', 'hipotesis'],
    viento: ['torres', 'conductor', 'hipotesis'],
    cargas: ['torres', 'conductor', 'hipotesis'],
    cantidades: ['torres', 'conductor', 'hipotesis'],
    exportar: ['torres', 'conductor', 'hipotesis'],
  };

  test('las quince pestañas piden exactamente lo que dice la maqueta', () => {
    for (const [id, necesita] of Object.entries(ESPERADO)) {
      assert.deepEqual([...requisitosDePestana(id)], necesita, `pestaña «${id}»`);
    }
  });

  test('las quince de la pantalla están en la tabla, ni una suelta', () => {
    // Si mañana se añade una pestaña y nadie declara qué necesita, abriría con
    // la línea vacía y fallaría dentro. Se lee la lista REAL del componente.
    const i = LINEA.indexOf('const PESTANAS = [');
    const bloque = LINEA.slice(i, LINEA.indexOf('\n] as const;', i));
    const ids = [...bloque.matchAll(/\{ id: '([a-z]+)'/g)].map((m) => m[1]);
    assert.equal(ids.length, 15, 'la fila de pestañas cambió de tamaño: revisar esta tabla');
    for (const id of ids) {
      assert.ok(id in ESPERADO, `la pestaña «${id}» no declara qué necesita para calcular`);
    }
  });

  test('TÉRMICA NO SE APAGA POR FALTA DE TORRES', () => {
    // La negativa de esta tanda. La ampacidad es del conductor con el clima: no
    // mira una sola torre. Apagarla por «faltan torres» escondería justo la
    // primera pestaña que abrirá cuando el Ingeniero entregue conductor e
    // hipótesis.
    assert.deepEqual(faltasDePestana('termica', ['torres']), [],
      'Térmica se apagó por un dato que no usa');
    assert.equal(cartelDePestana('termica', 'Térmica',
      { codigoLinea: 'LN-000', faltanEnLaLinea: ['torres'] }), null);
  });

  test('las tres que abren no piden nada, ni con la línea vacía', () => {
    // Falla, Parámetros eléctricos y Cargar: los expedientes cuelgan de la
    // línea, el histórico del SCADA se lee por su código y Cargar es la vía de
    // traer puntos. Con las tres faltas puestas, ninguna enseña cartel.
    for (const id of ['falla', 'parametros', 'cargar']) {
      assert.equal(cartelDePestana(id, id, {
        codigoLinea: 'LN-000', faltanEnLaLinea: [...FALTAS_EN_ORDEN],
      }), null, `la pestaña «${id}» dejó de abrir`);
    }
  });

  test('las que abren sobre el levantamiento tampoco piden nada', () => {
    for (const id of ['resumen', 'gps', 'distancias']) {
      assert.equal(cartelDePestana(id, id, {
        codigoLinea: 'LN-000', faltanEnLaLinea: [...FALTAS_EN_ORDEN],
      }), null, `la pestaña «${id}» dejó de abrir sobre el recorrido levantado`);
    }
  });

  test('una pestaña con todo lo suyo no enseña cartel', () => {
    assert.equal(cartelDePestana('mecanico', 'Mecánico',
      { codigoLinea: 'LN-000', faltanEnLaLinea: [] }), null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el cartel dice el motivo EXACTO y no usa nada de otra línea', () => {
  const ctx = {
    codigoLinea: 'LN-000',
    faltanEnLaLinea: [...FALTAS_EN_ORDEN],
    tramo: rotuloDeTramo('TR-000'),
    vecinas: ['LN-001'],
    fechaDelRecorrido: fechaDeCampoCorta('2026-08-09'),
  };

  test('el titular enumera SOLO lo que esa pestaña necesita', () => {
    assert.equal(cartelDePestana('fichas', 'Fichas', ctx).titular, 'Faltan: torres registradas.');
    assert.equal(cartelDePestana('termica', 'Térmica', ctx).titular,
      'Faltan: conductor, hipótesis.');
    assert.equal(cartelDePestana('mecanico', 'Mecánico', ctx).titular,
      'Faltan: torres registradas, conductor, hipótesis.');
  });

  test('Fichas y Fotos se titulan por lo que les pasa, no «no calcula»', () => {
    // Una ficha no «calcula»: es de una torre. Decir «Fichas no calcula» sería
    // describir mal lo que ocurre y mandar a buscar un conductor que ahí no
    // pinta nada.
    assert.match(cartelDePestana('fichas', 'Fichas', ctx).titulo,
      /^Fichas: LN-000 no tiene torres registradas$/);
    assert.match(cartelDePestana('fotos', 'Fotos', ctx).titulo,
      /^Fotos: LN-000 no tiene torres registradas$/);
    assert.match(cartelDePestana('mecanico', 'Mecánico', ctx).titulo,
      /^Mecánico no calcula en LN-000$/);
  });

  test('NINGÚN cartel ofrece el dato de otra línea', () => {
    for (const id of ['fichas', 'fundamentos', 'mecanico', 'termica', 'viento',
                      'cargas', 'cantidades', 'exportar', 'fotos']) {
      const c = cartelDePestana(id, id, ctx);
      const todo = [c.titulo, c.lead, c.pie ?? '', ...c.items.map((i) => `${i.que} ${i.porque}`)]
        .join(' ');
      // Lo que se vigila: que en todo cartel donde aparezca el conductor o la
      // hipótesis esté escrito que NO se toman de otra línea.
      if (c.items.some((i) => i.que === 'Conductor')) {
        assert.match(todo, /No se usa el de otra línea\./, `cartel «${id}»`);
      }
      if (c.items.some((i) => i.que === 'Hipótesis de cálculo')) {
        assert.match(todo, /No se usan las de otra línea\./, `cartel «${id}»`);
      }
    }
  });

  test('el renglón de las torres nombra el recorrido levantado, con su fecha', () => {
    const it = cartelDePestana('fichas', 'Fichas', ctx).items[0];
    assert.equal(it.que, 'Torres registradas');
    assert.match(it.porque, /se registran cuando usted declare la función de cada una\./);
    assert.match(it.porque, /El recorrido del 09-08 está levantado y guardado aparte/);
    assert.match(it.porque, /no se calcula con él/);
  });

  test('sin recorrido levantado NO se menciona ninguno', () => {
    // Prometer «el recorrido está guardado aparte» donde no hay recorrido es
    // mandar a buscar un archivo que no existe.
    const sin = cartelDePestana('fichas', 'Fichas', { ...ctx, fechaDelRecorrido: undefined });
    assert.ok(!/recorrido/i.test(sin.items[0].porque), sin.items[0].porque);
  });

  test('UNAS HIPÓTESIS QUE NO SE PUDIERON LEER NO SE PIDEN OTRA VEZ', () => {
    // `32 · L-44` en el sitio donde más caro sale: la línea SÍ las declara, y
    // decir «las entrega usted después» mandaría al Ingeniero a rehacer un
    // trabajo que ya hizo, sin que nadie mire por qué no llegan.
    const c = cartelDePestana('termica', 'Térmica',
      { ...ctx, hipotesisIlegibles: 'la cuenta no alcanza ese documento' });
    const hip = c.items.find((i) => i.que === 'Hipótesis de cálculo');
    assert.match(hip.porque, /la línea las declara y no se pudieron leer: la cuenta no alcanza/);
    assert.ok(!/las entrega usted después/.test(hip.porque),
      'se piden unas hipótesis que la línea ya entregó');
  });

  test('el pie de Cargas NO publica un número de circuitos', () => {
    // La maqueta dice «torre de 2 circuitos», y ese 2 sale de contar las líneas
    // vecinas DADAS DE ALTA. Una vecina que la sesión no alcance a ver haría
    // escribir «1 circuito» en una torre que lleva dos: la mitad de la carga, y
    // con veredicto encima. Quien sabe cuántos lleva es `Apoyo.circuitosTendidos`.
    const pie = cartelDePestana('cargas', 'Cargas', ctx).pie;
    assert.ok(!/\d+\s*circuito/i.test(pie), pie);
    assert.match(pie, /LN-001/, 'el pie tiene que nombrar a la otra línea del tramo');
  });

  test('sin tramo compartido no se promete nada de un tramo', () => {
    const solo = { codigoLinea: 'LN-000', faltanEnLaLinea: ['torres'] };
    const c = cartelDePestana('fichas', 'Fichas', solo);
    assert.equal(c.pie, undefined);
  });

  test('el cartel de la línea entera y el de una pestaña dicen lo mismo', () => {
    // Dos listas de lo que falta es como se acaba con dos versiones de la
    // verdad en la misma pantalla.
    const linea = cartelDeLaLinea(ctx);
    const mecanico = cartelDePestana('mecanico', 'Mecánico', ctx);
    assert.deepEqual(linea.items, mecanico.items);
    assert.equal(linea.titular, mecanico.titular);
    assert.equal(cartelDeLaLinea({ ...ctx, faltanEnLaLinea: [] }), null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('la franja del horizonte dice la razón VERDADERA', () => {
  test('sin torres, lo dice; con torres y sin conductor, dice otra cosa', () => {
    // El defecto que cierra: la franja tuvo «sin torres registradas» escrito
    // fijo. Una línea CON sus torres a la que solo le falte el conductor la
    // habría leído como que no tiene torres, y quien lo lea sale a registrar
    // unas torres que ya están.
    assert.equal(motivoSinHorizonte(['torres', 'conductor', 'hipotesis']),
      'sin torres registradas: no hay horizonte que dibujar');
    assert.equal(motivoSinHorizonte(['conductor', 'hipotesis']),
      'sin conductor ni hipótesis: no hay veredictos que dibujar');
    assert.ok(!/sin torres/.test(motivoSinHorizonte(['conductor'])),
      'con las torres puestas, la franja seguía diciendo que no las hay');
  });

  test('la pantalla le pasa las torres REALES, no un cero', () => {
    assert.match(LINEA, /torres=\{apoyos\.length\}/,
      'la franja volvió a contar cero torres sin mirar cuántas hay');
    assert.ok(!/0 torres dibujadas/.test(LINEA),
      'el pie de la franja volvió a llevar un cero escrito a mano');
    assert.ok(!/sub="0 torres registradas"/.test(LINEA),
      'un KPI volvió a afirmar que no hay torres sin contarlas');
  });

  test('el saludo del Resumen se deriva, no está escrito fijo', () => {
    assert.ok(!/Línea <b>sin torres registradas<\/b> · conductor <b>pendiente<\/b>/.test(LINEA),
      'el saludo del Resumen volvió a estar escrito fijo: miente en cuanto la línea '
      + 'tenga torres y le falte solo el conductor');
    assert.match(LINEA, /faltan\.includes\('torres'\)\s*\n?\s*\? 'sin torres registradas'/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('la banda de estado de una línea sin torres', () => {
  const base = { eventosAbiertos: 0, faltan: [...FALTAS_EN_ORDEN] };

  test('son CUATRO fichas y ninguna verde sobre un hueco', () => {
    const b = bandaSinCalculo(base);
    assert.equal(b.length, 4);
    const verdes = b.filter((f) => f.tono === 'bien').map((f) => f.t);
    assert.deepEqual(verdes, ['Eventos de falla'],
      'una ficha se pintó de verde sobre un dato que no existe');
  });

  test('«sin eventos registrados» solo si SE PUDO comprobar', () => {
    const ilegible = bandaSinCalculo({ ...base, eventosIlegibles: 'sin permiso' });
    const ev = ilegible[0];
    assert.equal(ev.v, 'no se pudieron leer');
    assert.notEqual(ev.tono, 'bien',
      'un fallo de lectura se pintó como el estado bueno de la línea');
  });

  test('la ficha del recorrido lleva el rótulo «sin registrar como torres»', () => {
    const con = bandaSinCalculo({ ...base, fechaDelRecorrido: '09-08' });
    assert.equal(con[1].v, 'levantado el 09-08 · sin registrar como torres');
    assert.equal(bandaSinCalculo(base)[1].v, 'sin recorrido levantado');
  });

  test('«e hipótesis», no «y hipótesis»', () => {
    // La y se vuelve e delante de i-. Lo escribe el módulo y no cada pantalla,
    // para que no haya dos versiones de la misma frase.
    assert.equal(bandaSinCalculo(base)[2].v, 'sin cálculo: faltan torres, conductor e hipótesis');
  });

  test('unas hipótesis declaradas y no leídas no se cuentan como no declaradas', () => {
    const b = bandaSinCalculo({ ...base, hipotesisIlegibles: 'no se pudo abrir' });
    assert.equal(b[3].v, 'declaradas, y no se pudieron leer');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('las fechas de campo no se desplazan de día', () => {
  test('AAAA-MM-DD se da la vuelta sin pasar por `new Date`', () => {
    // `new Date('2026-08-09')` se interpreta en UTC y al imprimirlo en hora de
    // Colombia sale el 08: un recorrido del 9 rotulado como del 8. Es un error
    // que no se ve hasta que alguien compara la pantalla con el GPX.
    assert.equal(fechaDeCampoLarga('2026-08-09'), '09-08-2026');
    assert.equal(fechaDeCampoCorta('2026-08-09'), '09-08');
    assert.equal(fechaDeCampoLarga('2026-01-01'), '01-01-2026');
  });

  test('una fecha con otra forma se enseña ENTERA, nunca a medias', () => {
    assert.equal(fechaDeCampoLarga('ayer'), 'ayer');
    assert.equal(fechaDeCampoCorta(''), '');
  });

  test('el sello dice las dos cosas: cuándo, y que no son torres', () => {
    assert.equal(selloDelRecorrido('2026-08-09'),
      'levantado el 09-08-2026 · sin registrar como torres');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el recorrido levantado sale del núcleo, y declara lo que no sabe', () => {
  // Coordenadas INVENTADAS sobre un meridiano redondo. A 4° de latitud, 0,001°
  // de longitud son unos 111 m. El recorrido se arma a propósito con:
  //   · dos vanos normales (~111 m y ~124 m),
  //   · uno de ~1,5 m, más corto que los dos círculos de error juntos (± 8 m),
  //   · uno de ~276 m, más de 1,4 veces la mediana,
  //   · un quiebre de verdad en P03, para que el recorrido no sea una recta,
  //   · un punto sin cota (P04), para que el desnivel tenga que quedar en nulo.
  const lev = {
    tipo: 'levantamiento',
    fecha: '2026-08-09',
    aparato: 'GPS de mano',
    codigoSerie: 'TR-000',
    puntos: [
      { nombreCampo: 'P01', lat: 40.000000, lon: -3.000000, ele: 10, instante: '2026-08-09T10:00:00-05:00' },
      { nombreCampo: 'P02', lat: 40.000000, lon: -3.001000, ele: 12, instante: '2026-08-09T10:02:00-05:00' },
      { nombreCampo: 'P03', lat: 40.000500, lon: -3.002000, ele: 11, instante: '2026-08-09T10:04:00-05:00' },
      { nombreCampo: 'P04', lat: 40.000510, lon: -3.002010, instante: '2026-08-09T10:05:00-05:00' },
      { nombreCampo: 'P05', lat: 40.000510, lon: -3.004500, ele: 9, instante: '2026-08-09T10:10:00-05:00' },
    ],
  };
  const r = recorridoLevantado(lev);

  test('hay un vano menos que puntos, y la suma es la longitud levantada', () => {
    assert.equal(r.puntos.length, 5);
    assert.equal(r.vanos.length, 4);
    const suma = r.vanos.reduce((s, v) => s + v.longitud_m, 0);
    assert.ok(Math.abs(suma - r.longitud_m) < 1e-9, 'la longitud levantada no es la suma de los vanos');
    assert.ok(r.longitud_m > r.directa_m, 'el recorrido no puede ser más corto que la línea recta');
  });

  test('la progresiva es acumulada y crece siempre', () => {
    let previa = 0;
    for (const v of r.vanos) {
      assert.ok(v.progresiva_m > previa, `la progresiva retrocedió en el vano ${v.n}`);
      previa = v.progresiva_m;
    }
    assert.ok(Math.abs(r.vanos.at(-1).progresiva_m - r.longitud_m) < 1e-9);
  });

  test('LOS EXTREMOS NO TIENEN QUIEBRE, y no se les inventa un cero', () => {
    // Un cero se leería como «aquí la línea va recta», que es una afirmación.
    // En el primer y el último punto no hay ángulo que medir.
    assert.equal(r.puntos[0].quiebre_grados, null);
    assert.equal(r.puntos.at(-1).quiebre_grados, null);
    for (const p of r.puntos.slice(1, -1)) {
      assert.equal(typeof p.quiebre_grados, 'number');
    }
  });

  test('UN VANO DEMASIADO CORTO NO PUBLICA UN MARGEN: dice que no se sabe', () => {
    // El fallo que esto evita es publicar «93,3° ± 60°» y que alguien declare
    // una retención: un ángulo construido sobre una dirección desconocida no
    // es un ángulo con mucho margen, es un número que no significa nada.
    const corto = r.vanos.find((v) => v.longitud_m < 16);
    assert.ok(corto, 'el fixture perdió el vano corto: revisar esta prueba');
    assert.equal(corto.direccionDeterminada, false);
    assert.equal(corto.margenDireccion_grados, null);

    // Y el quiebre que se apoya en él tampoco es fiable.
    const tocados = r.puntos.filter((p) => p.quiebre_grados != null && !p.margenDeterminado);
    assert.ok(tocados.length >= 1, 'un quiebre apoyado en un vano indeterminado se dio por bueno');
    for (const p of tocados) assert.equal(p.margen_grados, null);
  });

  test('el vano largo se señala como POSIBLE torre sin levantar, no como falta', () => {
    const largo = r.vanos.find((v) => v.sospechoso);
    assert.ok(largo, 'el vano de 1,4 veces la mediana dejó de señalarse');
    assert.ok(largo.vecesLaMediana >= 1.4);
    const h = r.hallazgos.find((x) => x.clase === 'torre_sin_levantar');
    assert.ok(h, 'el hallazgo no llegó a la pantalla');
    assert.match(h.detalle, /no se parece a los demás y hay que ir a mirarlo/,
      'el hallazgo se convirtió en un veredicto; es una señal para ir a mirar');
    assert.ok(!/falta una torre\b(?! *: *dice)/.test(h.detalle.replace('No dice que falte una torre', '')),
      'el hallazgo afirma que falta una torre, y eso no lo sabe');
  });

  test('el desnivel solo existe si los DOS extremos traen cota', () => {
    // Sin cota, poner cero situaría el punto al nivel del mar y publicaría un
    // desnivel que nadie midió (`99 §ADR-091`).
    const sinCota = r.vanos.filter((v) => v.desnivel_m == null);
    assert.equal(sinCota.length, 2, 'los dos vanos que tocan el punto sin cota tienen que quedar en nulo');
  });

  test('la precisión la declara el sistema, no el archivo', () => {
    // El GPX no trae precisión. Publicar «± 0 m» sería la firma de un
    // levantamiento exacto.
    assert.ok(r.precision_m > 0);
    assert.equal(recorridoLevantado(lev, 25).precision_m, 25);
  });

  test('EL ESQUEMA NO ESTIRA UN EJE MÁS QUE EL OTRO', () => {
    // Estirar un eje convierte una recta en una curva y un quiebre de 5° en uno
    // de 40°, que es justo lo que este esquema sirve para mirar. Se comprueba
    // con tres puntos en ángulo recto: la proporción de sus separaciones EN
    // PÍXELES tiene que ser la de sus separaciones EN METROS, que las mide el
    // núcleo y no esta prueba.
    const escuadra = recorridoLevantado({
      ...lev,
      puntos: [
        { nombreCampo: 'A', lat: 40.000000, lon: -3.000000 },
        { nombreCampo: 'B', lat: 40.000000, lon: -3.001000 },
        { nombreCampo: 'C', lat: 40.001000, lon: -3.000000 },
      ],
    });
    const [A, B, C] = escuadra.esquema.puntos;
    const alEste_m = vincenty(40, -3, 40, -3.001).d;
    const alNorte_m = vincenty(40, -3, 40.001, -3).d;
    const enPixeles = Math.abs(B.x - A.x) / Math.abs(C.y - A.y);
    const enMetros = alEste_m / alNorte_m;
    assert.ok(Math.abs(enPixeles - enMetros) < 0.02,
      `el dibujo deforma la geometría: ${enPixeles} contra ${enMetros}`);
  });

  test('norte arriba: el punto más al norte se dibuja más alto', () => {
    // Un esquema con el norte abajo no se lee mal: se lee AL REVÉS, y quien lo
    // compare con el mapa dará por buena una línea que va al otro lado.
    const g = r.esquema;
    assert.ok(g, 'el esquema no se dibujó');
    const norte = r.puntos.reduce((a, b) => (b.lat > a.lat ? b : a));
    const sur = r.puntos.reduce((a, b) => (b.lat < a.lat ? b : a));
    const y = (n) => g.puntos.find((p) => p.n === n).y;
    assert.ok(y(norte.n) < y(sur.n), 'el esquema salió con el norte abajo');
    assert.equal(g.traza.split(' ').length, g.puntos.length);
  });

  test('un levantamiento de un solo punto no se dibuja, y no revienta', () => {
    const uno = recorridoLevantado({ ...lev, puntos: [lev.puntos[0]] });
    assert.equal(uno.esquema, null);
    assert.equal(uno.vanos.length, 0);
    assert.equal(uno.longitud_m, 0);
    assert.equal(uno.directa_m, null);
    assert.equal(uno.estadisticas, null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('los rótulos se traducen en UN solo sitio', () => {
  test('LN-627 se recorta exactamente como antes', () => {
    // La promesa del Ingeniero: LN-627 tiene que verse EXACTAMENTE igual que
    // hoy. Lo que sustituye a `.replace('LN-627 ', '')` da lo mismo, letra por
    // letra, para los nombres de esa línea.
    for (const n of ['LN-627 E06', 'LN-627 E09', 'LN-627 EMP-1']) {
      assert.equal(sinPrefijoDeSerie(n, ['LN-627']), n.replace('LN-627 ', ''));
    }
  });

  test('los puntos de un tramo compartido también se recortan', () => {
    // Se llaman «TR-000 E07», no «LN-000 E07»: son del tramo, que es de las dos
    // líneas. Por eso se le pasa la LISTA de series y no un código suelto.
    assert.equal(sinPrefijoDeSerie('TR-000 E07', ['LN-000', 'TR-000']), 'E07');
    assert.deepEqual(extremosSinPrefijo('TR-000 E07', 'TR-000 E36', ['TR-000']), ['E07', 'E36']);
  });

  test('sin el espacio NO se recorta: un nombre no se decapita', () => {
    assert.equal(sinPrefijoDeSerie('LN-6270 E01', ['LN-627']), 'LN-6270 E01');
    assert.equal(sinPrefijoDeSerie('E01', ['LN-627']), 'E01');
    assert.equal(sinPrefijoDeSerie('LN-627 E06', []), 'LN-627 E06',
      'sin códigos no se adivina el prefijo');
  });

  test('«TR-618» se lee «tramo compartido 618», nunca «tramo» a secas', () => {
    // «Tramo» a secas ya significa TRAMO DE TENSIÓN en este proyecto, y dos
    // significados con el mismo nombre vuelven ambigua la frase «recalcular el
    // tramo».
    assert.equal(rotuloDeTramo('TR-000'), 'tramo compartido 000');
    assert.match(rotuloDeTramo('TR-000'), /^tramo compartido /);
  });

  test('un código con otra forma se enseña ENTERO detrás de la frase', () => {
    assert.equal(rotuloDeTramo('X9'), 'tramo compartido X9');
    assert.equal(rotuloDeTramo(''), 'tramo compartido');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('guardián: ningún código de línea escrito dentro de un componente', () => {
  /** El fuente sin comentarios: en un comentario, citar LN-627 es documentar. */
  const soloCodigo = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  test('ni un «LN-nnn» ni un «TR-nnn» fuera de los comentarios', () => {
    // Ocho sitios hacían `.replace('LN-627 ', '')`. Con tres líneas en el
    // parque, esos ocho recortaban el prefijo de UNA y dejaban entero el de las
    // otras dos — y el día que alguien renombre LN-627 se quedan con el recorte
    // viejo. El código de una línea es un DATO: vive en la base, no en el
    // programa.
    const culpables = [];
    for (const n of readdirSync(COMPONENTES)) {
      if (!n.endsWith('.tsx') && !n.endsWith('.ts')) continue;
      const codigo = soloCodigo(readFileSync(join(COMPONENTES, n), 'utf-8'));
      for (const m of codigo.matchAll(/\b(?:LN|TR)-\d[\w-]*/g)) {
        culpables.push(`${n}: «${m[0]}»`);
      }
    }
    assert.deepEqual(culpables, [],
      'un código de línea o de tramo escrito dentro de un componente. Tiene que salir del dato '
      + '(`linea.codigo`, `seriesDeLinea`), nunca del programa');
  });

  test('y nadie vuelve a recortar un prefijo a mano', () => {
    const culpables = [];
    for (const n of readdirSync(COMPONENTES)) {
      if (!n.endsWith('.tsx') && !n.endsWith('.ts')) continue;
      const codigo = soloCodigo(readFileSync(join(COMPONENTES, n), 'utf-8'));
      if (/\.replace\(\s*['"][A-Z]{2}-/.test(codigo)) culpables.push(n);
    }
    assert.deepEqual(culpables, [],
      'volvió un recorte de prefijo escrito a mano; el dueño único es `vistas/rotulos.ts`');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('guardián: la pantalla abre sin conductor y avisa de lo que no ve', () => {
  test('el conductor y las hipótesis son OPCIONALES en la vista de la línea', () => {
    // Si vuelven a ser obligatorios, dar de alta una línea nueva se lleva por
    // delante el parque entero y con él el acceso a las líneas que sí calculan.
    assert.match(LINEA, /conductor\?: Conductor \| null; hipotesis\?: Hipotesis \| null;/,
      'VistaLinea volvió a exigir conductor e hipótesis');
  });

  test('EL AVISO DE LO QUE NO SE PUDO LEER LLEGA A LA PANTALLA', () => {
    // El fallo más caro del proyecto: `repositorio.ts` ya sabía que una serie no
    // se pudo leer —`avisosDeSeries`, `noSePudoLeer.torres`— y NO LO PINTABA
    // NADIE. Una cuenta cuyo alcance no llegue al tramo compartido abre la
    // línea, calcula con la mitad de sus torres y firma un informe sin una sola
    // señal en pantalla.
    assert.match(LINEA, /import \{[^}]*avisosDeDatos/s,
      'la vista dejó de preguntar qué hay que advertir');
    assert.match(LINEA, /<AvisosDeDatos avisos=\{avisos\} \/>/,
      'los avisos se calculan y no se pintan: es como si no existieran');
    // Y va FUERA de las pestañas: no es un detalle de una pantalla, es una
    // advertencia sobre todo lo que se vea debajo.
    assert.ok(LINEA.indexOf('<AvisosDeDatos') < LINEA.indexOf('<div className="cuerpo">'),
      'el aviso se metió dentro de una pestaña: quien abra otra no lo verá');
  });

  test('el aviso distingue «no se pudo leer» de «no hay»', () => {
    assert.match(LINEA, /a\.clase === 'lectura' \? 'No se pudo leer\.' : 'No se juntó\.'/,
      'los dos casos se aplanaron en el mismo texto');
  });

  test('ninguna pestaña que CALCULA se monta si su cartel dice que no puede', () => {
    // El cartel manda: si se monta la pestaña además del cartel, queda media
    // pantalla calculada con huecos.
    for (const id of ['fichas', 'fundamentos', 'mecanico', 'termica', 'viento',
                      'cargas', 'cantidades', 'fotos']) {
      assert.ok(LINEA.includes(`{!cartel && activa === '${id}'`),
        `la pestaña «${id}» se monta aunque su cartel diga que le falta algo`);
    }
  });

  test('⚠️ EXPORTAR es la excepción: se monta SIEMPRE, porque es la del borrador', () => {
    // Lo cazó la revisión del 17-09: con `!cartel` delante, la pestaña que saca
    // el BORRADOR no firmable no se alcanzaba nunca — y es justo la que tiene
    // sentido en una línea sin torres ni conductor. El cartel sigue arriba
    // diciendo qué falta; debajo, Exportar con sus botones apagados (M2/M6).
    assert.match(LINEA, /\{activa === 'exportar' && \(/,
      'volvió el cartel delante de Exportar: el borrador deja de alcanzarse');
    assert.match(LINEA, /levantamientos=\{levantamientos \?\? \[\]\} vecinas=\{vecinasParaExportar\}/,
      'sin el recorrido y sin las vecinas el borrador sale sin lo único que puede contar');
  });
});
