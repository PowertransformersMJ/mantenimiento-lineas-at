// ============================================================================
// tests/cargas-vista.test.js — pruebas de la carga sobre las estructuras (vista)
// ----------------------------------------------------------------------------
// Ningún valor esperado sale de ejecutar el módulo y copiar lo que dio: eso
// congela el error en verde. Salen de tres sitios independientes:
//
//   (a) TRIGONOMETRÍA EXACTA. El factor del quiebre es 2·sen(α/2), así que a 60°
//       vale 2·sen(30°) = 1 EXACTO y a 120° vale 2·sen(60°) = √3. Son cifras que
//       se comprueban en una servilleta, no en el código.
//   (b) IDENTIDADES que el resultado tiene que cumplir sí o sí: la carga del
//       quiebre es factor × tiro × nº de conductores; el vano viento es la
//       semisuma de los dos vanos adyacentes; la utilización es el cociente de
//       momentos. Se comprueban contra las propias salidas de la fila, así que
//       no dependen de ninguna constante geodésica.
//   (c) CASOS DEGENERADOS con respuesta obvia: sin viento la carga de viento es
//       CERO —no ausente—; en línea recta el quiebre no carga nada; un apoyo
//       extremo no tiene deflexión y por tanto no tiene fila calculada.
//
// La regla que más se vigila aquí no es un número, es una NEGATIVA: cuando falta
// un dato, el módulo tiene que devolver hueco y explicarlo. Un apoyo que
// "cumple" contra una carga de rotura supuesta es un informe firmado sobre una
// suposición, y es el único error de este sistema que no se ve venir.
//
// ⚠️ Todos los datos son SINTÉTICOS: este repositorio es público. Conductor
// inventado, estructuras con letras, coordenadas sobre el meridiano de Greenwich
// en el ecuador. Ni un dato de la línea del cliente entra aquí (L-23).
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { cargasParaPantalla, agruparNotas } from '../web/src/vistas/cargasDatos.ts';
import { vincenty } from '../nucleo/geodesia.js';

const cerca = (real, esperado, tol, msg) =>
  assert.ok(Number.isFinite(real) && Math.abs(real - esperado) <= tol,
    `${msg}: ${real} vs ${esperado} esperado (tolerancia ${tol})`);

/**
 * Tolerancia de máquina, con la misma convención que `tests/cargas.test.js`.
 * NO se compara con `===`: 60° no tiene representación exacta en radianes
 * binarios, así que 2·sen(30°) sale 0,9999999999999999 y no 1. Es ruido del
 * último bit, no un error del cálculo.
 */
const EPS = 1e-12;

// ── Datos sintéticos ────────────────────────────────────────────────────────

/** Conductor de laboratorio: cifras redondas, ningún catálogo real. */
const CONDUCTOR = Object.freeze({
  codigo: 'SINTETICO-25',
  material: 'ACSR',
  seccion_mm2: 300,
  diametro_m: 0.025,
  masaLineal_kg_m: 1,
  rts_kgf: 10000,
  moduloElastico_kg_mm2: 7000,
  dilatacion_1_C: 1.9e-5,
  tempMaxOperacion_C: 75,
  procedencia: 'supuesto',
});

const HIPOTESIS = Object.freeze({
  nombre: 'sintética',
  eds_pct: 20, tempEds_C: 25, tempMax_C: 75, tempMin_C: 10,
  vientoMax_kmh: 36, tempViento_C: 25,     // 36 km/h = 10 m/s exactos
  cx: 1.0, densidadAire_kg_m3: 1.2,
  procedencia: 'supuesto', congelada: false,
});

/** La misma hipótesis sin viento. Cero DECLARADO, que no es lo mismo que ausente. */
const SIN_VIENTO = Object.freeze({ ...HIPOTESIS, vientoMax_kmh: 0 });

/**
 * Un tramo con los cuatro estados. El tiro con viento (1000) es el que se compone
 * con el quiebre; el de mínima temperatura (1200) es el pico de la envolvente.
 * Números redondos a propósito: 1000 × 3 conductores da 3000 sin decimales.
 */
const tramo = (nVanos, hViento = 1000) => ({
  n: 1, nVanos, hEds: 800, hTMax: 700, hViento, hTMin: 1200, pico: 1200,
});

/**
 * Estructuras sobre el meridiano, separadas 0,001° de latitud. Van en línea
 * recta a propósito: la deflexión se DECLARA en cada una, que es lo que hace el
 * núcleo cuando existe, y así el ángulo del ensayo es exacto en vez de depender
 * de la geodesia. Lo que sí sale de las coordenadas son los vanos.
 */
const apoyo = (i, extra = {}) => ({
  id: `ap-${i}`,
  tipo: 'apoyo',
  lineaId: 'linea-sintetica',
  orden: i,
  tipoPunto: 'Estructura',
  nombreCampo: `S${i}`,
  nombreNormalizado: `S${i}`,
  coordenada: { lat: 0.001 * i, lon: 0 },
  funcionEstructural: 'Suspensión',
  funcionProcedencia: 'supuesto',
  condicion: 'Sin evaluar',
  activo: true,
  ...extra,
});

/** Cinco estructuras: dos extremos y tres intermedias con quiebre declarado. */
const LINEA = Object.freeze([
  apoyo(0),
  apoyo(1, { deflexion_grados: 0 }),      // recta: el quiebre no carga nada
  apoyo(2, { deflexion_grados: 60 }),     // factor exactamente 1
  apoyo(3, { deflexion_grados: 120 }),    // factor exactamente √3
  apoyo(4),
]);

const correr = (apoyos = LINEA, h = HIPOTESIS, tramos = [tramo(apoyos.filter((a) => (a.tipoPunto ?? 'Estructura') === 'Estructura').length - 1)], circuitos = 1) =>
  cargasParaPantalla(apoyos, tramos, CONDUCTOR, h, circuitos);

const porNombre = (r, nombre) => r.filas.find((x) => x.apoyo === nombre);

// ════════════════════════════════════════════════════════════════════════════

describe('el factor del quiebre: trigonometría, no aproximación', () => {
  test('a 60° la resultante vale el tiro: la cuerda de un arco de 60° es el radio', () => {
    const f = porNombre(correr(), 'S2');
    cerca(f.factorAngulo, 1, EPS, 'factor a 60°');
    // El indicador `amplifica` NO se comprueba justo en 60°: ahí el resultado lo
    // decide el último bit de `Math.sin`, que no está garantizado igual en todos
    // los motores. El cruce se comprueba a los lados (0° y 120°), que es donde
    // el criterio significa algo.
  });

  test('a 120° el factor es √3 y sí amplifica', () => {
    const f = porNombre(correr(), 'S3');
    assert.ok(Math.abs(f.factorAngulo - Math.sqrt(3)) < 1e-12,
      `esperaba √3 = ${Math.sqrt(3)}, dio ${f.factorAngulo}`);
    assert.equal(f.amplifica, true);
  });

  test('en línea recta el quiebre no carga nada', () => {
    const f = porNombre(correr(), 'S1');
    assert.equal(f.factorAngulo, 0);
    assert.equal(f.ftAngulo_kgf, 0);       // cero calculado, no hueco
    assert.equal(f.amplifica, false);
  });

  test('la carga del quiebre es factor × tiro × nº de conductores', () => {
    const r = correr();
    for (const f of r.filas) {
      if (f.ftAngulo_kgf === null) continue;
      assert.ok(Math.abs(f.ftAngulo_kgf - f.factorAngulo * f.tiro_kgf * f.nConductores) < 1e-9,
        `${f.apoyo}: la identidad de composición no se cumple`);
    }
  });

  test('con un circuito son 3 conductores, y a 60° eso son 3000 kgf redondos', () => {
    // 1 (factor) × 1000 kgf (tiro con viento) × 3 conductores = 3000, exacto.
    const f = porNombre(correr(LINEA, SIN_VIENTO), 'S2');
    assert.equal(f.nConductores, 3);
    cerca(f.ftAngulo_kgf, 3000, 1e-9, 'ftAngulo a 60° con 3 conductores');
    assert.equal(f.ftViento_kgf, 0);       // sin viento: CERO, no ausente
    cerca(f.ftTotal_kgf, 3000, 1e-9, 'ftTotal sin viento');
  });
});

describe('el viento sobre el apoyo', () => {
  test('el vano viento es la semisuma de los dos vanos adyacentes', () => {
    // Los vanos se recalculan aquí con el mismo Vincenty del núcleo, no se
    // copian de la salida. Ojo: NO se supone que midan lo mismo aunque los
    // puntos estén a igual Δlat — sobre un elipsoide el arco de meridiano crece
    // con la latitud, así que suponer vanos iguales habría sido una suposición
    // falsa disfrazada de identidad geométrica.
    const P = LINEA.map((a) => a.coordenada);
    const L = P.slice(1).map((p, i) => vincenty(P[i].lat, P[i].lon, p.lat, p.lon).d);

    const r = correr();
    for (const f of r.filas.filter((x) => !x.esExtremo)) {
      const i = f.n - 1;                       // `n` numera entre estructuras, 1..N
      cerca(f.vanoViento_m, (L[i - 1] + L[i]) / 2, 1e-9, `${f.apoyo}: vano viento`);
    }
  });

  test('el empuje del viento es proporcional al vano viento, con el mismo coeficiente', () => {
    // Mismo conductor, misma hipótesis y mismos conductores en todos los apoyos:
    // ftViento / vanoViento tiene que ser una constante de la línea. Comprobarlo
    // así no depende de cuánto mida cada vano.
    const interiores = correr().filas.filter((f) => !f.esExtremo && f.ftViento_kgf !== null);
    assert.ok(interiores.length >= 2, 'hacen falta al menos dos apoyos interiores');
    const k = interiores[0].ftViento_kgf / interiores[0].vanoViento_m;
    assert.ok(k > 0, 'con 36 km/h declarados el empuje no puede ser cero');
    for (const f of interiores) {
      cerca(f.ftViento_kgf / f.vanoViento_m, k, 1e-12, `${f.apoyo}: empuje por metro`);
    }
  });

  test('sin viento declarado el empuje es CERO, no un hueco', () => {
    const r = correr(LINEA, SIN_VIENTO);
    for (const f of r.filas.filter((x) => !x.esExtremo)) {
      assert.equal(f.ftViento_kgf, 0);
      assert.notEqual(f.ftTotal_kgf, null, 'con viento cero el total sigue siendo calculable');
    }
  });

  test('el total es la suma de las dos componentes (hipótesis adoptada: alineadas)', () => {
    for (const f of correr().filas) {
      if (f.ftTotal_kgf === null) continue;
      assert.ok(Math.abs(f.ftTotal_kgf - (f.ftAngulo_kgf + f.ftViento_kgf)) < 1e-9,
        `${f.apoyo}: el total no es la suma de sus componentes`);
    }
  });
});

describe('lo que NO se puede calcular se declara — nunca se rellena', () => {
  test('los apoyos extremos no tienen fila calculada, y dicen por qué', () => {
    const r = correr();
    const primero = r.filas[0], ultimo = r.filas[r.filas.length - 1];
    for (const f of [primero, ultimo]) {
      assert.equal(f.esExtremo, true);
      assert.equal(f.ftTotal_kgf, null);
      assert.ok(f.noEvaluable, 'un extremo sin carga tiene que decir el motivo');
      assert.match(f.noEvaluable, /longitudinal/i,
        'el motivo tiene que nombrar el caso de carga que sí lo gobierna');
    }
  });

  test('sin capacidad declarada la utilización NO se estima', () => {
    const r = correr();
    for (const f of r.filas) {
      assert.equal(f.utilizacion_pct, null);
      assert.equal(f.estadoUtilizacion, 'no_evaluable');
    }
    assert.equal(r.conUtilizacion, 0);
    assert.equal(r.aRevisar, 0);
  });

  test('el hueco de capacidad sale como aviso accionable, con los tres campos', () => {
    const a = correr().avisos.find((x) => /capacidad declarada/i.test(x.concepto));
    assert.ok(a, 'tiene que avisar de los apoyos con carga pero sin capacidad');
    assert.equal(a.severidad, 'aviso');
    assert.match(a.motivo, /rotura/i);
    assert.match(a.motivo, /altura libre/i);
    assert.match(a.motivo, /sujeción/i);
  });

  test('la fila de un apoyo sin capacidad explica qué le falta', () => {
    const f = porNombre(correr(), 'S2');
    assert.ok(f.notas.some((n) => /Sin utilización/.test(n)),
      'la fila tiene que traer escrito el motivo de que no haya utilización');
  });
});

describe('utilización: cociente de MOMENTOS, no de fuerzas', () => {
  /** La misma línea, pero con el apoyo del quiebre de 60° ya inventariado. */
  const conCapacidad = (extra) => [
    apoyo(0),
    apoyo(1, { deflexion_grados: 0 }),
    apoyo(2, { deflexion_grados: 60, ...extra }),
    apoyo(3, { deflexion_grados: 120 }),
    apoyo(4),
  ];

  test('con el conductor amarrado en la punta: 3000 de 12000 son el 25 %', () => {
    // Sin viento, ftTotal = 3000 kgf. Con rotura 12000 y las dos alturas iguales
    // el brazo se cancela: 3000 / 12000 = 25 % exacto.
    const r = correr(conCapacidad({ cargaRotura_kgf: 12000, alturaLibre_m: 12, alturaAplicacion_m: 12 }),
      SIN_VIENTO);
    const f = porNombre(r, 'S2');
    cerca(f.utilizacion_pct, 25, 1e-9, 'utilización con brazo unitario');
    assert.equal(f.estadoUtilizacion, 'cumple');
    // Margen: el 50 % adoptado de 12000 son 6000; ya hay 3000 colgados.
    cerca(f.margen_kgf, 3000, 1e-9, 'margen restante');
  });

  test('amarrado a media altura, el mismo kgf hace la mitad de daño', () => {
    const r = correr(conCapacidad({ cargaRotura_kgf: 12000, alturaLibre_m: 12, alturaAplicacion_m: 6 }),
      SIN_VIENTO);
    // (3000 × 6) / (12000 × 12) = 12,5 %: la mitad del caso anterior, porque el
    // brazo es la mitad. Lo que rompe el poste es el momento, no la fuerza.
    cerca(porNombre(r, 'S2').utilizacion_pct, 12.5, 1e-9, 'utilización a media altura');
  });

  test('pasarse del umbral adoptado sale como ATENCIÓN, con el criterio escrito', () => {
    // Rotura 5000: 3000 / 5000 = 60 %, por encima del 50 % adoptado.
    const r = correr(conCapacidad({ cargaRotura_kgf: 5000, alturaLibre_m: 12, alturaAplicacion_m: 12 }),
      SIN_VIENTO);
    const f = porNombre(r, 'S2');
    cerca(f.utilizacion_pct, 60, 1e-9, 'utilización por encima del umbral');
    assert.equal(f.estadoUtilizacion, 'revisar');
    assert.ok(f.margen_kgf < 0, 'pasado el umbral, el margen tiene que ser negativo');
    assert.equal(r.aRevisar, 1);

    const a = r.avisos.find((x) => /carga de rotura declarada/i.test(x.concepto));
    assert.ok(a, 'un apoyo pasado de umbral tiene que salir en los avisos');
    assert.equal(a.severidad, 'atencion');
    assert.match(a.motivo, /CRITERIO ADOPTADO/,
      'el veredicto no puede aparecer sin decir contra qué criterio se emitió');
  });

  test('geometría imposible (sujeción por encima de la punta) no da número', () => {
    const r = correr(conCapacidad({ cargaRotura_kgf: 12000, alturaLibre_m: 8, alturaAplicacion_m: 12 }),
      SIN_VIENTO);
    const f = porNombre(r, 'S2');
    assert.equal(f.utilizacion_pct, null);
    assert.equal(f.estadoUtilizacion, 'no_evaluable');
    assert.ok(f.notas.some((n) => /por encima de la punta/i.test(n)),
      'con datos contradictorios hay que decir CUÁL es la contradicción');
  });
});

describe('los empalmes no son apoyos', () => {
  const CON_EMPALME = [
    apoyo(0),
    apoyo(1, { deflexion_grados: 0 }),
    { ...apoyo(15, { tipoPunto: 'Empalme' }), coordenada: { lat: 0.0015, lon: 0 }, nombreCampo: 'EMP', nombreNormalizado: 'EMP' },
    apoyo(2, { deflexion_grados: 60 }),
    apoyo(3, { deflexion_grados: 120 }),
    apoyo(4),
  ];

  test('un empalme a mitad de vano no recibe fila', () => {
    const r = correr(CON_EMPALME);
    assert.equal(r.filas.length, 5, 'cinco estructuras, cinco filas');
    assert.equal(r.total, 5);
    assert.ok(!r.filas.some((f) => f.apoyo === 'EMP'), 'el empalme no puede tener fila');
  });

  test('y NO parte el vano: el vano viento no cambia por su culpa', () => {
    const sin = correr();
    const con = correr(CON_EMPALME);
    // Mismo trazado, mismas estructuras: contar el empalme habría partido el vano
    // en dos y dejado el empuje del viento a la mitad justo donde el vano es largo.
    for (const f of con.filas) {
      const par = porNombre(sin, f.apoyo);
      assert.ok(Math.abs((f.vanoViento_m ?? 0) - (par.vanoViento_m ?? 0)) < 1e-9,
        `${f.apoyo}: el empalme alteró el vano viento`);
    }
  });
});

describe('hallazgos, huecos y límites: qué se le cuenta al que firma', () => {
  test('la amplificación del quiebre sale como ATENCIÓN y nombra al peor apoyo', () => {
    const r = correr();
    const a = r.avisos.find((x) => /MÁS carga que la propia tensión/i.test(x.concepto));
    assert.ok(a, 'un apoyo que recibe más que la tensión es el hallazgo principal');
    assert.equal(a.severidad, 'atencion');
    assert.match(a.motivo, /S3/, 'tiene que nombrar el apoyo peor');
    assert.match(a.motivo, /permanente/i, 'y decir que no depende del viento');
    assert.equal(r.cuantosAmplifican, 1);
    assert.equal(r.peorFactor.apoyo, 'S3');
    assert.equal(r.peorFactor.deflexion_grados, 120);
  });

  test('el peor apoyo por carga total es el de mayor ftTotal', () => {
    const r = correr();
    const max = Math.max(...r.filas.filter((f) => f.ftTotal_kgf !== null).map((f) => f.ftTotal_kgf));
    assert.equal(r.peorCarga.ftTotal_kgf, max);
    assert.equal(r.peorCarga.apoyo, 'S3');
  });

  test('se declara SIEMPRE que la vertical y la longitudinal quedan fuera', () => {
    const a = correr().avisos.find((x) => /Solo carga TRANSVERSAL/i.test(x.concepto));
    assert.ok(a, 'el alcance del cálculo no se deja implícito');
    assert.equal(a.severidad, 'info');
  });

  test('se declara que la suma de quiebre y viento es hipótesis adoptada', () => {
    const a = correr().avisos.find((x) => /hipótesis ADOPTADA/i.test(x.concepto));
    assert.ok(a);
    assert.match(a.motivo, /sin norma citada/i);
  });

  test('con los conductores deducidos de circuitos, se avisa de los cables de guarda', () => {
    const a = correr().avisos.find((x) => /guarda/i.test(x.concepto));
    assert.ok(a, 'contar 3 fases y olvidar la guarda deja la carga corta');
    assert.equal(a.severidad, 'aviso');
  });

  test('los avisos salen ordenados de más grave a menos', () => {
    const orden = { atencion: 0, aviso: 1, info: 2 };
    const s = correr().avisos.map((a) => orden[a.severidad]);
    assert.deepEqual(s, [...s].sort((x, y) => x - y));
  });

  test('sin estructuras no explota: devuelve vacío y lo explica', () => {
    const r = cargasParaPantalla([], [], CONDUCTOR, HIPOTESIS, 1);
    assert.deepEqual(r.filas, []);
    assert.equal(r.peorCarga, null);
    assert.equal(r.peorFactor, null);
    assert.equal(r.avisos.length, 1);
    assert.equal(r.avisos[0].severidad, 'info');
  });

  test('el umbral y su criterio vienen del núcleo, no escritos aquí', () => {
    const r = correr();
    assert.equal(r.umbralUtilizacion_pct, 50);
    assert.match(r.criterioUtilizacion, /CRITERIO ADOPTADO/);
    assert.match(r.criterioUtilizacion, /NUNCA se estima/);
  });
});

describe('agrupar las observaciones: una vez cada una, no una por apoyo', () => {
  test('el mismo párrafo en varias filas sale UNA vez, con todos sus apoyos', () => {
    const r = correr();
    const notas = agruparNotas(r.filas);
    const textos = notas.map((n) => n.texto);
    assert.equal(new Set(textos).size, textos.length, 'no puede haber dos grupos con el mismo texto');

    // La nota de los conductores la escribe el núcleo en TODAS las filas: tiene
    // que salir una sola vez y nombrar a las cinco estructuras.
    const g = notas.find((n) => /guarda/.test(n.texto));
    assert.ok(g, 'la nota de los cables de guarda tiene que estar');
    assert.equal(g.apoyos.length, r.filas.length);
  });

  test('lo específico de un apoyo va ANTES que lo común a todos', () => {
    const notas = agruparNotas(correr().filas);
    const cuentas = notas.filter((n) => !n.esNoEvaluable).map((n) => n.apoyos.length);
    assert.deepEqual(cuentas, [...cuentas].sort((a, b) => a - b),
      'dentro de cada clase, de menos apoyos a más');
    // Y los motivos de «no evaluable» van los primeros de todos.
    const i = notas.findIndex((n) => !n.esNoEvaluable);
    assert.ok(notas.slice(0, i).every((n) => n.esNoEvaluable));
  });

  test('el motivo de no evaluable no se mezcla con los supuestos', () => {
    const notas = agruparNotas(correr().filas);
    const extremos = notas.find((n) => n.esNoEvaluable && /longitudinal/i.test(n.texto));
    assert.ok(extremos, 'los dos extremos comparten motivo: un solo grupo');
    assert.equal(extremos.apoyos.length, 2);
    assert.deepEqual(extremos.apoyos, ['S0', 'S4']);
  });

  test('la nota del quiebre solo aparece en el apoyo que amplifica', () => {
    const g = agruparNotas(correr().filas).find((n) => /multiplica la tensión/i.test(n.texto));
    assert.ok(g, 'el apoyo que amplifica tiene que traer su nota propia');
    assert.deepEqual(g.apoyos, ['S3']);
  });

  test('sin filas no devuelve nada', () => {
    assert.deepEqual(agruparNotas([]), []);
  });
});

describe('la función es PURA', () => {
  test('no toca lo que le entra', () => {
    const apoyos = LINEA.map((a) => ({ ...a }));
    const antes = JSON.stringify(apoyos);
    const tramos = [tramo(4)];
    const antesTramos = JSON.stringify(tramos);
    cargasParaPantalla(apoyos, tramos, CONDUCTOR, HIPOTESIS, 1);
    assert.equal(JSON.stringify(apoyos), antes, 'mutó los apoyos');
    assert.equal(JSON.stringify(tramos), antesTramos, 'mutó los tramos');
  });

  test('dos llamadas con lo mismo dan lo mismo', () => {
    assert.deepEqual(correr(), correr());
  });
});

describe('sin cálculo mecánico no se inventa carga', () => {
  test('si el reparto de tramos no cuadra con las estructuras, no hay tiro', () => {
    // Un tramo que dice tener 9 vanos cuando la línea tiene 4: repartir a ciegas
    // le atribuiría a una estructura el tiro de otro tramo — un número creíble,
    // con unidades correctas, y equivocado.
    const r = correr(LINEA, HIPOTESIS, [tramo(9)]);
    for (const f of r.filas) {
      assert.equal(f.tiro_kgf, null);
      assert.equal(f.ftAngulo_kgf, null);
      assert.equal(f.ftTotal_kgf, null);
      assert.ok(f.noEvaluable, 'sin tiro hay que decir por qué no hay carga');
    }
    const a = r.avisos.find((x) => /sin carga calculable/i.test(x.concepto));
    assert.ok(a, 'que no se pueda calcular nada tiene que salir en los avisos');
  });

  test('sin tramos tampoco: el quiebre se conoce, la carga no', () => {
    const r = correr(LINEA, HIPOTESIS, []);
    const f = porNombre(r, 'S3');
    assert.ok(Math.abs(f.factorAngulo - Math.sqrt(3)) < 1e-12,
      'el factor del quiebre es geometría: se sabe aunque no haya cálculo mecánico');
    assert.equal(f.ftAngulo_kgf, null, 'pero sin tiro no hay kgf que publicar');
    assert.equal(r.peorFactor.apoyo, 'S3', 'y el hallazgo del quiebre sigue en pie');
  });
});
