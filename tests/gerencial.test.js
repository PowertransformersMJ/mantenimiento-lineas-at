// ============================================================================
// tests/gerencial.test.js — el informe de gerencia, y lo que tiene PROHIBIDO
// ----------------------------------------------------------------------------
// UN INFORME GERENCIAL ES EL SITIO MÁS FÁCIL PARA MENTIR SIN QUERER. El que lo
// lee no va a abrir el cálculo: va a leer un titular y decidir. Por eso estas
// pruebas no vigilan que «salga bien» — vigilan que NO PUEDA decir cuatro cosas
// concretas que no sabe:
//
//   · que la línea es segura        (el despeje al terreno no es evaluable hoy)
//   · que ningún apoyo está sobrecargado (se sabe lo que se PIDE, no lo que aguanta)
//   · un número de riesgo residual  (no hay probabilidad ni consecuencia con qué calcularlo)
//   · un precio o un plazo          (no hay tarifas ni rendimientos en este sistema)
//
// Y una más, de método: la lista de límites tiene que ser LA MISMA que la del
// informe técnico. Dos papeles de la misma línea diciendo cosas distintas
// convierten la discusión en «cuál de los dos vale», y ésa no la gana nadie.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gerencialHtml } from '../exportar/gerencial.js';
import { limitacionesDeclaradas, TITULO_LIMITACIONES } from '../exportar/informe.js';

/** Una línea sintética con el estado REAL de hoy: nadie declaró capacidad. */
const BASE = {
  linea: { codigo: 'LN-999', nombre: 'Línea sintética', tensionNominal_kV: 66 },
  conductor: { nombre: 'AAAC', procedencia: 'declarado' },
  hipotesis: { congelada: false, vViento: 90 },
  lev: { nEstructuras: 24, nEmpalmes: 2, longitud_m: 2929 },
  meta: { generadoEn: '2026-08-05 10:00', versionNucleo: '1.0.0' },
  indicadores: [
    { id: 'tiro_maximo_pct_rts', etiqueta: 'Tiro máximo', valor: 40, unidad: '%', estado: 'cumple', criterio: 'x' },
    { id: 'tiro_sin_carga_externa_retie', etiqueta: 'Tiro RETIE', valor: null, estado: 'no_evaluable', criterio: 'Elección de criterio PENDIENTE del Ingeniero' },
    { id: 'despeje_minimo', etiqueta: 'Despeje mínimo al terreno', valor: null, estado: 'no_evaluable', criterio: 'falta la cota del punto de sujeción y el perfil del terreno' },
    { id: 'puesta_tierra', etiqueta: 'Puesta a tierra', valor: 18.5, unidad: 'Ω', estado: 'revisar', criterio: 'Medidos 3 de 24 apoyos' },
  ],
  cargas: [
    { apoyo: 'E01', esExtremo: true, utilizacion_pct: null, estadoUtilizacion: 'no_evaluable', amplifica: false },
    { apoyo: 'E06', esExtremo: false, utilizacion_pct: null, estadoUtilizacion: 'no_evaluable', amplifica: true, factorAngulo: 1.716 },
    { apoyo: 'E12', esExtremo: false, utilizacion_pct: null, estadoUtilizacion: 'no_evaluable', amplifica: false },
  ],
  investigaciones: [],
  cantidades: { continuas: [{ concepto: 'Conductor', cantidad: 8787, unidad: 'm', base: '3 fases × 2.929 m' }], discretas: [], avisos: [] },
  coherencia: [],
  calidad: [],
  inspecciones: [],
  umbralUtilizacion_pct: 50,
};

const html = (extra = {}) => gerencialHtml({ ...BASE, ...extra });

describe('lo que este informe tiene PROHIBIDO decir', () => {
  test('NO afirma que la línea sea segura', () => {
    const h = html();
    assert.doesNotMatch(h, /la línea (es|está) segura/i);
    assert.match(h, /No dice que la línea sea segura/);
    assert.match(h, /el punto crítico casi nunca está bajo un apoyo/);
  });

  test('NO afirma que ningún apoyo esté sobrecargado, ni lo contrario', () => {
    const h = html();
    assert.match(h, /No dice que ningún apoyo esté sobrecargado/);
    assert.match(h, /sabe cuánta carga se le PIDE a cada estructura; no cuánta AGUANTA/);
  });

  test('NO pone un NÚMERO de riesgo residual: entrega una lista', () => {
    // «Riesgo residual: medio» es una etiqueta inventada con aspecto de
    // medición, y en un papel de gerencia eso se cita después como si fuera dato.
    const h = html();
    assert.doesNotMatch(h, /riesgo\s+(residual\s*)?[:=]\s*(alto|medio|bajo)/i);
    assert.doesNotMatch(h, /nivel de riesgo/i);
    assert.match(h, /Es una lista, no un número/);
  });

  test('NO pone precio ni plazo a ninguna recomendación', () => {
    const h = html();
    assert.doesNotMatch(h, /\$\s?\d/, 'apareció una cifra de dinero');
    // La celda se busca por CONTENIDO, no por igualdad exacta: «Costo estimado»
    // pasaba tranquilamente por el filtro anterior, que exigía la palabra sola.
    assert.doesNotMatch(h, /<th>[^<]*(costo|precio|plazo|valor estimado|presupuesto)[^<]*<\/th>/i,
      'apareció una columna de costo, precio o plazo — y este sistema no tiene tarifas');
    assert.match(h, /No hay columna de costo ni de plazo/);
  });

  test('el estado «no evaluable» NO se presenta como si estuviera bien', () => {
    const h = html();
    assert.match(h, /no es que estén bien, es que no se pueden mirar/);
  });
});

describe('el titular es lo que NO se puede sostener, no lo que sí', () => {
  test('la primera cifra de la primera página son los renglones abiertos', () => {
    const h = html();
    const limites = limitacionesDeclaradas(BASE);
    assert.ok(limites.length > 0, 'el fixture tiene que producir límites para que la prueba valga');
    assert.match(h, new RegExp(`${limites.length} cosas? que este informe todavía no puede sostener`));
    // Y va ANTES de la tabla de estado: si se lee una línea, que sea ésa.
    assert.ok(h.indexOf('no puede sostener') < h.indexOf('Indicadores que cumplen'));
  });

  test('con cero apoyos dictaminados lo dice con esa palabra, no con un 0 %', () => {
    const h = html();
    assert.match(h, /<b>ninguno<\/b>: se sabe cuánta carga reciben, no cuánta aguantan/);
  });
});

describe('un solo dueño de la verdad: el gerencial no reescribe al técnico', () => {
  test('la lista de límites es LA MISMA función que usa el informe técnico', () => {
    const h = html();
    for (const l of limitacionesDeclaradas(BASE)) {
      assert.ok(h.includes(l.titulo), `el gerencial se saltó un límite del técnico: «${l.titulo}»`);
    }
  });

  test('el título de la sección final es el canónico, no uno escrito a mano', () => {
    assert.match(html(), new RegExp(TITULO_LIMITACIONES));
  });
});

describe('las secciones que dependen de una decisión humana lo declaran', () => {
  test('el ORDEN de la cola de atención se declara criterio de gerencia', () => {
    const h = html();
    assert.match(h, /decisión de gerencia, no un resultado de cálculo/);
  });

  test('la elección del tope de tiro aparece como decisión pendiente SUYA', () => {
    const h = html();
    assert.match(h, /Qué tope de tiro rige/);
    assert.match(h, /Dan veredictos distintos sobre la misma línea/);
  });

  test('la hipótesis sin congelar sale como decisión, no como defecto técnico', () => {
    assert.match(html(), /Congelar la hipótesis de cálculo/);
  });

  test('LA ÚNICA sección que no se deriva sola lo dice en el propio papel', () => {
    const h = html();
    assert.match(h, /única sección de este informe que no se calcula sola/);
    assert.match(h, /la única\s+que envejece/);
  });

  test('sin recomendaciones declaradas, el espacio queda VACÍO a propósito', () => {
    // Rellenarlo con texto genérico sería fingir un criterio que nadie tuvo.
    assert.match(html(), /rellenarlo con texto genérico sería fingir un criterio/);
  });

  test('cada recomendación dice de qué fila nació; si no, «juicio del ingeniero»', () => {
    const h = html({ meta: { ...BASE.meta, recomendaciones: [
      { horizonte: 'semana', que: 'Medir puesta a tierra en los 21 apoyos que faltan', origenFila: 'indicador puesta_tierra' },
      { horizonte: 'anio', que: 'Levantar la ficha estructural del parque', porQuien: 'M. Jiménez' },
    ] } });
    assert.match(h, /indicador puesta_tierra/);
    assert.match(h, /<b>juicio del ingeniero<\/b> · M\. Jiménez/);
  });
});

describe('la cobertura no se redondea: el hueco se declara', () => {
  test('el cruce inspección↔estructuras NO existe, y se dice en vez de dar un %', () => {
    const h = html();
    assert.match(h, /Cobertura de inspección: no se puede calcular todavía/);
    assert.match(h, /en vez de publicar un porcentaje que\s+nadie ha calculado/);
  });

  test('se dice sobre cuántas estructuras habla de verdad', () => {
    const h = html();
    assert.match(h, /3 de 24/, 'no declaró que solo 3 de las 24 estructuras tienen carga calculada');
  });
});

describe('el documento se sostiene solo', () => {
  test('autocontenido: sin JavaScript y sin recursos externos', () => {
    const h = html();
    assert.doesNotMatch(h, /<script/i);
    assert.doesNotMatch(h, /https?:\/\//);
  });

  test('el índice se arma del cuerpo y no puede desincronizarse', () => {
    const h = html();
    for (const t of ['Control documental', 'Cola de atención', TITULO_LIMITACIONES]) {
      assert.ok((h.match(new RegExp(t, 'g')) ?? []).length >= 2, `«${t}» debe estar en índice y cuerpo`);
    }
  });

  test('remite al informe técnico para el detalle del cálculo', () => {
    assert.match(html(), /El detalle del cálculo está en el informe técnico/);
  });
});

describe('el estado cero: un levantamiento a medias no puede tumbar el documento', () => {
  test('un `lev` SIN `puntos` genera el informe igual', () => {
    // Cazado en ejecución, no leyendo: el informe técnico normaliza el
    // levantamiento con `levSeguro()` antes de tocarlo y el gerencial no lo
    // hacía, así que `calidadLevantamiento()` moría dentro de `lev.puntos.length`
    // y el usuario veía una pantalla en blanco en vez de un documento que dice
    // qué falta. Las 20 pruebas de arriba NO lo cazaron porque su caso traía
    // `puntos: []` — un fixture más completo que la realidad no prueba el borde.
    const h = gerencialHtml({
      linea: { codigo: 'LN-627' },
      lev: { nEstructuras: 24, nEmpalmes: 2, longitud_m: 2929 },   // sin `puntos`
      indicadores: [], cargas: [], investigaciones: [], cantidades: {}, meta: {},
    });
    assert.ok(h.length > 1000, 'el documento tiene que salir igual');
    assert.equal((h.match(/<section/g) ?? []).length, 10, 'con sus diez secciones');
  });

  test('sin NADA más que el código de la línea, tampoco explota', () => {
    const h = gerencialHtml({ linea: { codigo: 'LN-627' } });
    assert.match(h, /LN-627/);
    assert.match(h, new RegExp(TITULO_LIMITACIONES), 'la sección de límites va SIEMPRE');
  });
});
