// ============================================================================
// tests/cantidades.test.js — pruebas de la memoria de cantidades geométrica
// ----------------------------------------------------------------------------
// Aquí no se comprueba «que el código haga lo que hace». Se comprueba la REGLA
// DE ORO del módulo: alguien compra con este listado, así que
//
//   · el conductor tiene que salir MAYOR que la suma de vanos (cuelga),
//   · un empalme NUNCA puede contarse como apoyo,
//   · y lo que no se levantó en campo tiene que aparecer en `avisos` y NO
//     como una cantidad con pinta de dato.
//
// Los valores esperados salen de identidades verificables a mano (catenaria
// L = 2C·senh(a/2C), proporcionalidad de los multiplicadores) y del contrato
// leído como texto — nunca de la salida del propio módulo.
//
// ⚠️ Todos los datos son SINTÉTICOS. Ninguna coordenada, nombre de estructura
// ni geometría de línea real vive en este repositorio.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { cantidadesGeometricas } from '../nucleo/cantidades.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const cerca = (real, esperado, tol, msg) =>
  assert.ok(Math.abs(real - esperado) <= tol,
    `${msg}: ${real} vs ${esperado} esperado (tolerancia ${tol})`);

// ── Ayudas de lectura del resultado ─────────────────────────────────────────
const continua = (r, texto) => r.continuas.find((x) => x.concepto.includes(texto));
const discreta = (r, texto) => r.discretas.find((x) => x.concepto.includes(texto));
const aviso    = (r, texto) => r.avisos.find((x) => x.concepto.includes(texto));

/** Línea sintética de 4 estructuras y 3 vanos, sin nada real detrás. */
const APOYOS_4 = [
  { tipoPunto: 'Estructura', funcionEstructural: 'Terminal' },
  { tipoPunto: 'Estructura', funcionEstructural: 'Suspensión' },
  { tipoPunto: 'Estructura', funcionEstructural: 'Ángulo' },
  { tipoPunto: 'Estructura', funcionEstructural: 'Terminal' },
];

// ════════════════════════════════════════════════════════════════════════════
describe('conductor — nunca puede salir más corto que la línea', () => {

  test('con catenaria real, el conductor SUPERA la suma de vanos', () => {
    // Identidad de la catenaria: L = 2·C·senh(a/2C), con C = H/w.
    // Con C = 2000 m y a = 300 m → L = 4000·senh(0,075) = 300,2813292 m.
    // Se comprueba primero la constante a mano, para que la prueba no dependa
    // de ninguna función del proyecto.
    const C = 2000, a = 300;
    const L = 2 * C * Math.sinh(a / (2 * C));
    cerca(L, 300.2813292, 1e-6, 'longitud de catenaria calculada a mano');

    const r = cantidadesGeometricas({
      vanos_m: [
        { vano_m: a, longitudConductor_m: L },
        { vano_m: a, longitudConductor_m: L },
        { vano_m: a, longitudConductor_m: L },
      ],
      apoyos: APOYOS_4,
      conductor: { codigo: 'SINTETICO-1', conductoresPorCircuito: 3 },
      circuitos: 2,
      factorReserva_pct: 5,
    });

    const eje = continua(r, 'Longitud de línea');
    const cond = continua(r, 'Conductor de fase');
    assert.ok(eje && cond, 'deben salir el eje y el conductor');

    assert.equal(eje.cantidad, 900, 'el eje es la suma de vanos rectos');
    // 3 vanos × 300,2813292 × 3 conductores × 2 circuitos × 1,05
    cerca(cond.cantidad, 3 * L * 3 * 2 * 1.05, 1e-9, 'conductor de fase');

    assert.ok(cond.cantidad > eje.cantidad,
      'LA PRUEBA QUE IMPORTA: el conductor cuelga, jamás mide lo que el eje');
  });

  test('un solo circuito y un solo conductor tampoco caben en la suma de vanos', () => {
    const r = cantidadesGeometricas({
      vanos_m: [200, 250, 300],
      apoyos: APOYOS_4,
      conductor: { conductoresPorCircuito: 1 },
      circuitos: 1,
      factorFlecha_pct: 3,      // sobrelongitud DECLARADA
      factorReserva_pct: 0,
    });
    const cond = continua(r, 'Conductor de fase');
    cerca(cond.cantidad, 750 * 1.03, 1e-9, '750 m de eje + 3 % de flecha');
    assert.ok(cond.cantidad > 750, 'con flecha declarada sigue superando el eje');
  });

  test('con flecha 0 % la cantidad coincide EXACTAMENTE con el eje (caso límite)', () => {
    // Un conductor sin flecha no existe, pero es el único punto donde el
    // resultado es verificable con una suma mental: 100+200+300 = 600.
    const r = cantidadesGeometricas({
      vanos_m: [100, 200, 300],
      apoyos: APOYOS_4,
      conductor: { conductoresPorCircuito: 1 },
      circuitos: 1,
      factorFlecha_pct: 0,
      factorReserva_pct: 0,
    });
    assert.equal(continua(r, 'Conductor de fase').cantidad, 600);
  });

  test('los multiplicadores son proporcionales: doblar circuitos dobla el cable', () => {
    const base = {
      vanos_m: [180, 220],
      apoyos: APOYOS_4.slice(0, 3),
      conductor: { conductoresPorCircuito: 3 },
      factorFlecha_pct: 2,
      factorReserva_pct: 4,
    };
    const uno = continua(cantidadesGeometricas({ ...base, circuitos: 1 }), 'Conductor de fase');
    const dos = continua(cantidadesGeometricas({ ...base, circuitos: 2 }), 'Conductor de fase');
    cerca(dos.cantidad, 2 * uno.cantidad, 1e-9, 'doble circuito = doble conductor');

    const haz = continua(cantidadesGeometricas({
      ...base, circuitos: 1, conductor: { fases: 3, subconductoresPorFase: 2 },
    }), 'Conductor de fase');
    cerca(haz.cantidad, 2 * uno.cantidad, 1e-9, 'haz doble = doble conductor');
  });

  test('la reserva declarada se aplica sobre la longitud, no sobre el eje', () => {
    const base = {
      vanos_m: [400, 400],
      apoyos: APOYOS_4.slice(0, 3),
      conductor: { conductoresPorCircuito: 1 },
      circuitos: 1,
      factorFlecha_pct: 10,
    };
    const sin = continua(cantidadesGeometricas(base), 'Conductor de fase');
    const con = continua(cantidadesGeometricas({ ...base, factorReserva_pct: 10 }), 'Conductor de fase');
    cerca(sin.cantidad, 880, 1e-9, '800 m + 10 % de flecha');
    cerca(con.cantidad, 968, 1e-9, '880 m + 10 % de reserva');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('un empalme NO es un apoyo', () => {

  const CON_EMPALMES = [
    { tipoPunto: 'Estructura', funcionEstructural: 'Terminal' },
    { tipoPunto: 'Empalme',    funcionEstructural: 'Suspensión' },  // ⚠️ trae función y da igual
    { tipoPunto: 'Estructura', funcionEstructural: 'Suspensión' },
    { tipoPunto: 'Empalme' },
    { tipoPunto: 'Estructura', funcionEstructural: 'Terminal' },
    { tipoPunto: 'Punto de referencia' },
  ];

  const r = cantidadesGeometricas({
    vanos_m: [300, 300],
    apoyos: CON_EMPALMES,
    conductor: { conductoresPorCircuito: 3 },
    circuitos: 1,
    factorFlecha_pct: 2,
    factorReserva_pct: 3,
  });

  test('se cuentan 3 estructuras, no 6 puntos', () => {
    const apoyos = r.discretas.filter((d) => d.concepto.startsWith('Apoyos —'));
    const total = apoyos.reduce((s, d) => s + d.cantidad, 0);
    assert.equal(total, 3, 'los empalmes y la referencia NO son estructuras');
    assert.equal(discreta(r, 'función Terminal').cantidad, 2);
    assert.equal(discreta(r, 'función Suspensión').cantidad, 1,
      'la suspensión del empalme no debe sumarse: su tipoPunto manda sobre su función');
  });

  test('los empalmes salen aparte y ROTULADOS en el propio concepto', () => {
    const e = discreta(r, 'Empalmes');
    assert.equal(e.cantidad, 2);
    assert.match(e.concepto, /NO son apoyos/,
      'el rótulo viaja con el dato: en la hoja impresa no se ven los comentarios del código');
    assert.ok(!e.concepto.startsWith('Apoyos —'), 'no puede colarse en el renglón de apoyos');
  });

  test('los puntos de referencia no son material: no se cuantifican, se declaran', () => {
    assert.equal(discreta(r, 'referencia'), undefined, 'no es una cantidad');
    assert.ok(aviso(r, 'Puntos de referencia'), 'pero sí se dice que se excluyeron');
  });

  test('no se publica un «total de apoyos» que se pueda sumar dos veces', () => {
    // Un renglón «Apoyos (total)» junto a los renglones por función haría que
    // quien suma la columna pida el doble de estructuras.
    const totales = r.discretas.filter((d) => /total/i.test(d.concepto));
    assert.equal(totales.length, 0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('lo que no se levantó en campo va a avisos, NUNCA a cantidades', () => {

  const r = cantidadesGeometricas({
    vanos_m: [250, 250, 250],
    apoyos: APOYOS_4,
    conductor: { conductoresPorCircuito: 3 },
    circuitos: 1,
    factorFlecha_pct: 2,
    factorReserva_pct: 3,
  });

  for (const concepto of ['Crucetas', 'Retenidas', 'Herrajes', 'Aisladores', 'Puestas a tierra']) {
    test(`${concepto}: aviso «requiere captura en campo» y cero cantidad`, () => {
      const a = aviso(r, concepto);
      assert.ok(a, `${concepto} debe declararse`);
      assert.match(a.motivo, /requiere captura en campo/,
        'el motivo tiene que decir qué hacer, no solo que falta');
      assert.equal(continua(r, concepto), undefined);
      assert.equal(discreta(r, concepto), undefined);
    });
  }

  test('ninguna cantidad menciona material de escritorio', () => {
    const todas = [...r.continuas, ...r.discretas].map((x) => x.concepto).join(' | ');
    assert.doesNotMatch(todas, /cruceta|retenida|herraje|aislador|puesta a tierra/i,
      'si un día aparece aquí, es que alguien empezó a estimar herrajes por fórmula');
  });

  test('el cable de guarda no se inventa aunque la geometría lo permitiría', () => {
    assert.ok(aviso(r, 'Cable de guarda'), 'sin declarar, se declara la falta');
    assert.equal(continua(r, 'guarda'), undefined, 'y no se cuantifica');
  });

  test('declarar los cables de guarda no basta: hace falta SU flecha', () => {
    const sinFlecha = cantidadesGeometricas({
      vanos_m: [250, 250, 250], apoyos: APOYOS_4,
      conductor: { conductoresPorCircuito: 3 }, circuitos: 1,
      factorFlecha_pct: 2, guarda: { cables: 1 },
    });
    assert.equal(continua(sinFlecha, 'guarda'), undefined,
      'el de guarda va más tenso: no puede heredar la flecha de la fase');
    assert.match(aviso(sinFlecha, 'Cable de guarda').motivo, /flecha propia/);

    const conFlecha = cantidadesGeometricas({
      vanos_m: [250, 250, 250], apoyos: APOYOS_4,
      conductor: { conductoresPorCircuito: 3 }, circuitos: 1,
      factorFlecha_pct: 2, factorReserva_pct: 0,
      guarda: { cables: 2, factorFlecha_pct: 1 },
    });
    cerca(continua(conFlecha, 'Cable de guarda').cantidad, 750 * 1.01 * 2, 1e-9,
      '750 m de eje × 1,01 × 2 cables');
  });

  test('declarar «cero cables de guarda» es una respuesta, no una falta', () => {
    const r0 = cantidadesGeometricas({
      vanos_m: [250], apoyos: APOYOS_4.slice(0, 2),
      conductor: { conductoresPorCircuito: 3 }, circuitos: 1,
      factorFlecha_pct: 2, guarda: { cables: 0 },
    });
    assert.equal(aviso(r0, 'Cable de guarda'), undefined);
    assert.equal(continua(r0, 'guarda'), undefined);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('sin dato no hay renglón — el módulo se calla, no rellena', () => {

  const geometria = { vanos_m: [300, 300, 300], apoyos: APOYOS_4, factorFlecha_pct: 2 };

  test('sin fases ni conductores por circuito no hay conductor', () => {
    const r = cantidadesGeometricas({ ...geometria, conductor: {}, circuitos: 1 });
    assert.equal(continua(r, 'Conductor de fase'), undefined);
    assert.ok(aviso(r, 'Conductores por circuito'));
  });

  test('declarar fases sin decir si hay haz tampoco alcanza', () => {
    const r = cantidadesGeometricas({ ...geometria, conductor: { fases: 3 }, circuitos: 1 });
    assert.equal(continua(r, 'Conductor de fase'), undefined,
      'un haz doble duplicaría la compra: no se asume conductor simple');
    assert.match(aviso(r, 'Subconductores por fase').motivo, /haz/);
  });

  test('sin circuitos declarados NO se aplica el defecto del contrato', () => {
    const r = cantidadesGeometricas({ ...geometria, conductor: { conductoresPorCircuito: 3 } });
    assert.equal(continua(r, 'Conductor de fase'), undefined);
    assert.ok(aviso(r, 'Circuitos'));
  });

  test('vanos rectos sin flecha declarada: se dice cuántos faltan, no se suma', () => {
    const r = cantidadesGeometricas({
      vanos_m: [300, 300, 300], apoyos: APOYOS_4,
      conductor: { conductoresPorCircuito: 3 }, circuitos: 1,
    });
    assert.equal(continua(r, 'Conductor de fase'), undefined,
      'sumar vanos rectos compraría de menos: es el error caro');
    assert.match(aviso(r, 'Conductor de fase').motivo, /3 de 3 vano/);
    assert.equal(continua(r, 'Longitud de línea').cantidad, 900,
      'el eje sí es un dato real y se publica');
  });

  test('si falta la flecha en UN vano, no se publica un total con pinta de completo', () => {
    const r = cantidadesGeometricas({
      vanos_m: [{ vano_m: 300, longitudConductor_m: 301 }, 300],
      apoyos: APOYOS_4.slice(0, 3),
      conductor: { conductoresPorCircuito: 3 }, circuitos: 1,
    });
    assert.equal(continua(r, 'Conductor de fase'), undefined, 'todo o nada');
    assert.match(aviso(r, 'Conductor de fase').motivo, /1 de 2 vano/);
  });

  test('una longitud MENOR que su vano es dato corrupto: se descarta y se dice', () => {
    // La cuerda es la distancia más corta entre dos puntos. Aceptarlo haría
    // comprar de menos con cara de precisión.
    const r = cantidadesGeometricas({
      vanos_m: [{ vano_m: 300, longitudConductor_m: 299.5 }, { vano_m: 300, longitudConductor_m: 300.3 }],
      apoyos: APOYOS_4.slice(0, 3),
      conductor: { conductoresPorCircuito: 1 }, circuitos: 1, factorReserva_pct: 0,
    });
    assert.ok(aviso(r, 'longitud imposible'));
    assert.equal(continua(r, 'Longitud de línea').cantidad, 300, 'solo queda el vano sano');
    cerca(continua(r, 'Conductor de fase').cantidad, 300.3, 1e-9, 'y su longitud real');
  });

  test('vanos basura no se cuelan en la suma', () => {
    const r = cantidadesGeometricas({
      vanos_m: [300, 0, -50, null, 'doscientos', 200],
      apoyos: APOYOS_4.slice(0, 3),
      conductor: { conductoresPorCircuito: 1 }, circuitos: 1,
      factorFlecha_pct: 0, factorReserva_pct: 0,
    });
    assert.equal(continua(r, 'Longitud de línea').cantidad, 500);
    assert.match(aviso(r, 'Vanos ilegibles').motivo, /4 vano/);
  });

  test('sin reserva declarada SÍ hay número, pero se avisa que es neto', () => {
    const r = cantidadesGeometricas({
      vanos_m: [100, 100], apoyos: APOYOS_4.slice(0, 3),
      conductor: { conductoresPorCircuito: 1 }, circuitos: 1, factorFlecha_pct: 0,
    });
    assert.equal(continua(r, 'Conductor de fase').cantidad, 200,
      'la longitud neta es un dato real: eso no se oculta');
    assert.match(aviso(r, 'Reserva de tendido').motivo, /NETA/);
  });

  test('sin entrada, sin geometría y sin inventos', () => {
    for (const nada of [undefined, null, 'x', 42]) {
      const r = cantidadesGeometricas(nada);
      assert.deepEqual(r.continuas, []);
      assert.deepEqual(r.discretas, []);
      assert.equal(r.avisos.length, 1, 'un solo aviso: no hay entrada');
    }
    const vacio = cantidadesGeometricas({});
    assert.deepEqual(vacio.continuas, []);
    assert.deepEqual(vacio.discretas, []);
    assert.ok(aviso(vacio, 'Longitud de línea'), 'sin vanos, se declara');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el conteo de apoyos no acepta texto libre', () => {

  test('una función fuera del catálogo no se cuenta: se declara', () => {
    const r = cantidadesGeometricas({
      vanos_m: [100, 100],
      apoyos: [
        { funcionEstructural: 'Terminal' },
        { funcionEstructural: 'Retención' },        // ⚠️ no es «Retención / anclaje»
        { funcionEstructural: 'poste terminal viejo' },
      ],
      conductor: { conductoresPorCircuito: 3 }, circuitos: 1, factorFlecha_pct: 2,
    });
    assert.equal(discreta(r, 'función Terminal').cantidad, 1);
    assert.equal(r.discretas.filter((d) => d.concepto.startsWith('Apoyos —')).length, 1);
    const fuera = r.avisos.filter((a) => a.concepto.includes('fuera de catálogo'));
    assert.equal(fuera.length, 2, 'cada texto libre se declara por separado');
    assert.match(fuera.map((f) => f.motivo).join(' '), /Retención/);
  });

  test('un apoyo sin función no se reparte «al más común»', () => {
    const r = cantidadesGeometricas({
      vanos_m: [100],
      apoyos: [{ funcionEstructural: 'Terminal' }, {}, null],
      conductor: { conductoresPorCircuito: 3 }, circuitos: 1, factorFlecha_pct: 2,
    });
    assert.equal(discreta(r, 'función Terminal').cantidad, 1);
    assert.match(aviso(r, 'sin función estructural').motivo, /2 apoyo/);
  });

  test('una función SUPUESTA baja la procedencia de todo su renglón', () => {
    const r = cantidadesGeometricas({
      vanos_m: [100, 100],
      apoyos: [
        { funcionEstructural: 'Suspensión', funcionProcedencia: 'levantamiento_campo' },
        { funcionEstructural: 'Suspensión', funcionProcedencia: 'supuesto' },
        { funcionEstructural: 'Terminal',   funcionProcedencia: 'confirmado_humano' },
      ],
      conductor: { conductoresPorCircuito: 3 }, circuitos: 1, factorFlecha_pct: 2,
    });
    assert.equal(discreta(r, 'función Suspensión').procedencia, 'supuesto',
      'una sola supuesta contamina el renglón: quien compra debe verlo');
    assert.equal(discreta(r, 'función Terminal').procedencia, 'levantamiento_campo');
  });

  test('si estructuras y vanos no cuadran, se avisa antes de que alguien firme', () => {
    const desajustado = cantidadesGeometricas({
      vanos_m: [100, 100, 100, 100],          // 4 vanos para 4 estructuras
      apoyos: APOYOS_4,
      conductor: { conductoresPorCircuito: 3 }, circuitos: 1, factorFlecha_pct: 2,
    });
    assert.match(aviso(desajustado, 'Coherencia').motivo, /deberían ser 3/);

    const cuadrado = cantidadesGeometricas({
      vanos_m: [100, 100, 100], apoyos: APOYOS_4,
      conductor: { conductoresPorCircuito: 3 }, circuitos: 1, factorFlecha_pct: 2,
    });
    assert.equal(aviso(cuadrado, 'Coherencia'), undefined);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('pruebas de oro contra el contrato y contra la pureza del núcleo', () => {

  /** Lee un `z.enum([...])` del contrato como TEXTO (el núcleo no lo importa). */
  const enumDelContrato = (archivo, nombre) => {
    const fuente = readFileSync(join(AQUI, '..', 'contratos', 'src', archivo), 'utf-8');
    const bloque = new RegExp(`${nombre}[^=]*=\\s*z\\.enum\\(\\[([\\s\\S]*?)\\]\\)`).exec(fuente);
    assert.ok(bloque, `no se encontró ${nombre} en contratos/src/${archivo}`);
    return [...bloque[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  };

  test('las SEIS funciones del contrato se clasifican; ninguna cae en «fuera de catálogo»', () => {
    // Si mañana el contrato añade una función y este módulo no se entera, sus
    // apoyos desaparecerían del BOM sin que nadie lo note. Esta prueba lo caza.
    const funciones = enumDelContrato('activos.ts', 'FuncionEstructural');
    assert.ok(funciones.length >= 6, 'el catálogo del contrato no puede encogerse en silencio');

    const r = cantidadesGeometricas({
      vanos_m: funciones.slice(1).map(() => 100),
      apoyos: funciones.map((f) => ({ funcionEstructural: f })),
      conductor: { conductoresPorCircuito: 3 }, circuitos: 1, factorFlecha_pct: 2,
    });

    for (const f of funciones) {
      const d = discreta(r, `función ${f}`);
      assert.ok(d, `la función «${f}» del contrato no produjo renglón`);
      assert.equal(d.cantidad, 1);
    }
    assert.equal(r.avisos.filter((a) => a.concepto.includes('fuera de catálogo')).length, 0);
    assert.equal(aviso(r, 'sin función estructural'), undefined);
  });

  test('toda procedencia emitida existe en el enum Procedencia del contrato', () => {
    const validas = enumDelContrato('comunes.ts', 'Procedencia');
    const r = cantidadesGeometricas({
      vanos_m: [{ vano_m: 300, longitudConductor_m: 300.3 }, 300],
      apoyos: [
        { funcionEstructural: 'Terminal' },
        { funcionEstructural: 'Suspensión', funcionProcedencia: 'supuesto' },
        { funcionEstructural: 'Terminal' },
        { tipoPunto: 'Empalme' },
      ],
      conductor: { conductoresPorCircuito: 3 }, circuitos: 2,
      factorFlecha_pct: 1, factorReserva_pct: 3,
      guarda: { cables: 1, factorFlecha_pct: 0.5 },
    });
    for (const fila of [...r.continuas, ...r.discretas]) {
      assert.ok(validas.includes(fila.procedencia),
        `«${fila.procedencia}» en «${fila.concepto}» no está en el contrato`);
    }
  });

  test('un solo vano estimado marca TODO el renglón como supuesto', () => {
    const exacto = cantidadesGeometricas({
      vanos_m: [{ vano_m: 300, longitudConductor_m: 300.3 }],
      apoyos: APOYOS_4.slice(0, 2),
      conductor: { conductoresPorCircuito: 3 }, circuitos: 1, factorReserva_pct: 0,
    });
    assert.equal(continua(exacto, 'Conductor de fase').procedencia, 'deducido_geometria');

    const mezclado = cantidadesGeometricas({
      vanos_m: [{ vano_m: 300, longitudConductor_m: 300.3 }, 300],
      apoyos: APOYOS_4.slice(0, 3),
      conductor: { conductoresPorCircuito: 3 }, circuitos: 1,
      factorFlecha_pct: 1, factorReserva_pct: 0,
    });
    assert.equal(continua(mezclado, 'Conductor de fase').procedencia, 'supuesto',
      'quien compra tiene que ver que ese total no está medido entero');
  });

  test('cada fila trae su forma completa: sin campos vacíos que el informe no pueda imprimir', () => {
    const r = cantidadesGeometricas({
      vanos_m: [{ vano_m: 300, longitudConductor_m: 300.3 }],
      apoyos: APOYOS_4.slice(0, 2),
      conductor: { codigo: 'SINTETICO-1', conductoresPorCircuito: 3 },
      circuitos: 1, factorReserva_pct: 5,
      guarda: { cables: 1, factorFlecha_pct: 0.5 },
    });
    for (const f of r.continuas) {
      assert.deepEqual(Object.keys(f).sort(),
        ['base', 'cantidad', 'concepto', 'procedencia', 'unidad']);
      assert.ok(Number.isFinite(f.cantidad) && f.cantidad > 0, `cantidad de ${f.concepto}`);
      assert.equal(f.unidad, 'm');
      assert.ok(f.base.length > 10, 'la base tiene que poder recalcularse a mano');
    }
    for (const d of r.discretas) {
      assert.deepEqual(Object.keys(d).sort(), ['cantidad', 'concepto', 'procedencia', 'unidad']);
      assert.ok(Number.isInteger(d.cantidad) && d.cantidad > 0, 'no hay medio apoyo');
      assert.equal(d.unidad, 'un');
    }
    for (const a of r.avisos) {
      assert.deepEqual(Object.keys(a).sort(), ['concepto', 'motivo']);
      assert.ok(a.motivo.length > 20, 'un aviso sin motivo no sirve para actuar');
    }
  });

  test('es PURA: no toca la entrada y repetirla da lo mismo', () => {
    const entrada = Object.freeze({
      vanos_m: Object.freeze([Object.freeze({ vano_m: 300, longitudConductor_m: 300.3 }), 250]),
      apoyos: Object.freeze([Object.freeze({ funcionEstructural: 'Terminal' })]),
      conductor: Object.freeze({ conductoresPorCircuito: 3 }),
      circuitos: 1, factorFlecha_pct: 2, factorReserva_pct: 3,
    });
    // Los módulos ES corren en modo estricto: si el código mutara algo congelado,
    // esto lanzaría en vez de fallar en silencio meses después.
    const a = cantidadesGeometricas(entrada);
    const b = cantidadesGeometricas(entrada);
    assert.deepEqual(a, b);
    assert.equal(entrada.vanos_m.length, 2);
  });
});
