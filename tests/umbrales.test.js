// ============================================================================
// tests/umbrales.test.js — pruebas de la tabla de umbrales con semáforo
// ----------------------------------------------------------------------------
// Lo que estas pruebas protegen NO es una fórmula: es un ACUERDO. La tabla debe
// devolver siempre las mismas filas, con los mismos identificadores, y debe
// decir "no lo sé" cuando no lo sabe. Si alguien la "mejora" rellenando huecos
// con supuestos, estas pruebas se ponen rojas — y eso es lo que se quiere.
//
// Los valores esperados salen de aritmética verificable a mano (3.200/8.000 =
// 40 %, 1.600/0,8 = 2.000 m) o de identidades del propio dominio, nunca de
// ejecutar el módulo y copiar lo que salió.
//
// Datos SINTÉTICOS a propósito: conductor de 8.000 kgf y 0,8 kg/m, apoyos "A-1",
// "A-2". Ninguna coordenada, nombre de estructura ni cifra de una línea real.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { evaluarUmbrales } from '../nucleo/umbrales.js';

const cerca = (real, esperado, tol, msg) =>
  assert.ok(Math.abs(real - esperado) <= tol,
    `${msg}: ${real} vs ${esperado} esperado (tolerancia ${tol})`);

const buscar = (tabla, id) => {
  const i = tabla.find((x) => x.id === id);
  assert.ok(i, `la tabla no trae el indicador "${id}"`);
  return i;
};

// ── Datos sintéticos ────────────────────────────────────────────────────────
// Números redondos para que todo porcentaje se pueda comprobar de cabeza.
const CONDUCTOR = { rts_kgf: 8000, masaLineal_kg_m: 0.8 };

/** Un tramo con sus cuatro estados, tal como los devuelve el motor mecánico. */
const tramoConEstados = ({ eds = 1600, tMax = 1400, viento = 3200, tMin = 1900 } = {}) => ({
  desde: { nombre: 'A-1' },
  hasta: { nombre: 'A-5' },
  vanos: [200, 200, 200, 200],
  vir: 200,
  estados: {
    eds:    { nombre: 'EDS / cada día',     H: eds },
    tMax:   { nombre: 'Máxima temperatura', H: tMax },
    viento: { nombre: 'Máximo viento',      H: viento },
    tMin:   { nombre: 'Mínima temperatura', H: tMin },
  },
});

const HIPOTESIS = { eds_pct: 20, tempEds_C: 28 };

const LINEA_COMPLETA = {
  tramos: [tramoConEstados()],
  conductor: CONDUCTOR,
  hipotesis: HIPOTESIS,
  estadisticas: { n: 4, coeficienteVariacion_pct: 12 },
  apoyos: [],
};

// ════════════════════════════════════════════════════════════════════════════
describe('umbrales — la forma de la tabla es un contrato', () => {

  const ID_ESPERADOS = [
    'tiro_maximo_pct_rts',
    'tiro_sin_carga_externa_retie',
    'eds_fatiga_pct_rts',
    'relacion_vano_vir',
    'parametro_catenaria_vibracion',
    'coeficiente_variacion_vano',
    'despeje_minimo_terreno',
    'resistencia_puesta_tierra',
    'ampacidad_vs_corriente',
  ];

  test('sin datos NINGUNA fila desaparece: nueve filas, todas no_evaluable', () => {
    // Una fila que se esconde cuando falta el dato se lee como "esto ya no
    // aplica". El hueco tiene que verse en el informe.
    const t = evaluarUmbrales();
    assert.equal(t.length, 9, 'ocho indicadores; el primero emite dos criterios');
    assert.deepEqual(t.map((i) => i.id), ID_ESPERADOS, 'ids y orden estables');
    for (const i of t) {
      assert.equal(i.estado, 'no_evaluable', `${i.id} debería declararse no evaluable`);
      assert.ok(i.criterio.length > 20, `${i.id} debe decir QUÉ falta, no quedarse mudo`);
    }
  });

  test('una entrada vacía o basura no revienta la tabla', () => {
    for (const entrada of [undefined, null, {}, { tramos: null, apoyos: 'no soy un array' }]) {
      const t = evaluarUmbrales(entrada);
      assert.equal(t.length, 9);
      assert.deepEqual(t.map((i) => i.id), ID_ESPERADOS);
    }
  });

  test('cada fila lleva exactamente los nueve campos del contrato', () => {
    const campos = ['id', 'etiqueta', 'valor', 'unidad', 'umbral', 'comparador', 'estado', 'criterio', 'fuente'];
    for (const i of evaluarUmbrales(LINEA_COMPLETA)) {
      assert.deepEqual(Object.keys(i).sort(), [...campos].sort(), `campos de ${i.id}`);
      assert.ok(['cumple', 'revisar', 'no_evaluable'].includes(i.estado), `estado válido en ${i.id}`);
      assert.ok(['<=', '>=', 'entre', 'ninguno'].includes(i.comparador), `comparador válido en ${i.id}`);
      assert.equal(typeof i.criterio, 'string');
      assert.ok(i.fuente.length > 0, `${i.id} sin fuente declarada`);
    }
  });

  test('el valor es número si se evaluó, y null si no — nunca un 0 de relleno', () => {
    const entradas = [undefined, LINEA_COMPLETA, { conductor: CONDUCTOR }, { hipotesis: HIPOTESIS }];
    for (const e of entradas) {
      for (const i of evaluarUmbrales(e)) {
        if (i.estado === 'no_evaluable') assert.equal(i.valor, null, `${i.id} no evaluable con valor`);
        else assert.ok(Number.isFinite(i.valor), `${i.id} evaluado sin número`);
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('umbrales — indicador 1: los DOS criterios del tiro máximo, siempre', () => {

  test('el indicador 1 emite SIEMPRE sus dos filas, pase lo que pase', () => {
    const escenarios = [
      undefined,
      {},
      LINEA_COMPLETA,
      { tramos: [tramoConEstados()] },                       // sin conductor
      { conductor: CONDUCTOR },                              // sin tramos
      { ...LINEA_COMPLETA, hipotesis: { ...HIPOTESIS, criterioTiroQueRige: 'retie_25' } },
    ];
    for (const e of escenarios) {
      const t = evaluarUmbrales(e);
      assert.equal(t.filter((i) => i.id === 'tiro_maximo_pct_rts').length, 1, 'tope adoptado');
      assert.equal(t.filter((i) => i.id === 'tiro_sin_carga_externa_retie').length, 1, 'criterio RETIE');
      assert.equal(buscar(t, 'tiro_sin_carga_externa_retie').umbral, 25, 'el 25 % del RETIE se muestra siempre');
      assert.equal(buscar(t, 'tiro_sin_carga_externa_retie').fuente, 'RETIE');
    }
  });

  test('sin tope declarado: 50 % con procedencia criterio_clasico', () => {
    const i = buscar(evaluarUmbrales(LINEA_COMPLETA), 'tiro_maximo_pct_rts');
    assert.equal(i.umbral, 50);
    assert.match(i.criterio, /criterio_clasico/, 'debe confesar de dónde sale el 50');
    assert.equal(i.fuente, 'criterio de diseño (sin norma)');
    // 3.200 kgf de pico sobre 8.000 kgf de RTS = 40 %, a mano.
    cerca(i.valor, 40, 1e-9, 'porcentaje de RTS');
    assert.equal(i.estado, 'cumple', '40 % ≤ 50 %');
  });

  test('el tope de la hipótesis MANDA sobre el 50 % heredado', () => {
    const e = { ...LINEA_COMPLETA, hipotesis: { ...HIPOTESIS, tiroAdmisible_pct: 30 } };
    const i = buscar(evaluarUmbrales(e), 'tiro_maximo_pct_rts');
    assert.equal(i.umbral, 30);
    cerca(i.valor, 40, 1e-9, 'el valor no cambia: cambia el umbral');
    assert.equal(i.estado, 'revisar', '40 % supera el 30 % adoptado');
    assert.doesNotMatch(i.criterio, /criterio_clasico/, 'ya no es el valor por defecto');
  });

  test('el pico es el PEOR de los cuatro estados, no el de viento por costumbre', () => {
    // Aquí el estado más exigente es la mínima temperatura, no el viento.
    const e = { ...LINEA_COMPLETA, tramos: [tramoConEstados({ viento: 2400, tMin: 4000 })] };
    const i = buscar(evaluarUmbrales(e), 'tiro_maximo_pct_rts');
    cerca(i.valor, 50, 1e-9, '4.000/8.000 = 50 %');
    assert.equal(i.estado, 'cumple', 'justo en el límite: 50 ≤ 50');
  });

  test('el RETIE queda no_evaluable mientras nadie declare qué criterio manda', () => {
    const i = buscar(evaluarUmbrales(LINEA_COMPLETA), 'tiro_sin_carga_externa_retie');
    assert.equal(i.estado, 'no_evaluable');
    assert.match(i.criterio, /PENDIENTE/, 'la decisión es del Ingeniero, no del sistema');
    assert.match(i.criterio, /criterioTiroQueRige/, 'debe decir qué campo falta');
  });

  test('declarado el criterio, el RETIE se evalúa SIN el estado de viento', () => {
    const e = { ...LINEA_COMPLETA, hipotesis: { ...HIPOTESIS, criterioTiroQueRige: 'retie_25' } };
    const i = buscar(evaluarUmbrales(e), 'tiro_sin_carga_externa_retie');
    // Estados sin carga externa: 1.600 / 1.400 / 1.900 → peor 1.900.
    // 1.900/8.000 = 23,75 %. El pico real de la línea (3.200, con viento) no entra.
    cerca(i.valor, 23.75, 1e-9, 'peor estado sin viento');
    assert.equal(i.estado, 'cumple', '23,75 % ≤ 25 %');
  });

  test('el mismo tramo puede cumplir el tope adoptado y NO el criterio RETIE', () => {
    // Este es el motivo entero de mostrar las dos filas: dan veredictos distintos.
    const e = {
      ...LINEA_COMPLETA,
      tramos: [tramoConEstados({ tMin: 2400 })],   // 2.400/8.000 = 30 % sin viento
      hipotesis: { ...HIPOTESIS, criterioTiroQueRige: 'retie_25' },
    };
    const t = evaluarUmbrales(e);
    assert.equal(buscar(t, 'tiro_maximo_pct_rts').estado, 'cumple', '40 % ≤ 50 % adoptado');
    const retie = buscar(t, 'tiro_sin_carga_externa_retie');
    cerca(retie.valor, 30, 1e-9, '2.400/8.000');
    assert.equal(retie.estado, 'revisar', '30 % > 25 % del RETIE');
  });

  test('con un pico ya resumido, el criterio RETIE se declara no evaluable', () => {
    // Trampa real: un `tiroPico_kgf` no dice si incluía viento. Compararlo contra
    // un criterio "sin carga externa" daría un rojo (o un verde) falso.
    const e = {
      tramos: [{ nombre: 'T-1', vanos: [200], vir: 200, tiroPico_kgf: 3200 }],
      conductor: CONDUCTOR,
      hipotesis: { ...HIPOTESIS, criterioTiroQueRige: 'retie_25' },
    };
    const t = evaluarUmbrales(e);
    cerca(buscar(t, 'tiro_maximo_pct_rts').valor, 40, 1e-9, 'el tope adoptado sí se evalúa');
    const retie = buscar(t, 'tiro_sin_carga_externa_retie');
    assert.equal(retie.estado, 'no_evaluable');
    assert.match(retie.criterio, /viento/i, 'debe explicar por qué no se puede');
  });

  test('sin RTS no hay porcentaje que calcular', () => {
    const i = buscar(evaluarUmbrales({ tramos: [tramoConEstados()] }), 'tiro_maximo_pct_rts');
    assert.equal(i.estado, 'no_evaluable');
    assert.match(i.criterio, /RTS/, 'debe nombrar el dato que falta');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('umbrales — indicador 2: EDS en la banda de fatiga 18-22 %', () => {

  const conEds = (eds_pct) => buscar(evaluarUmbrales({ ...LINEA_COMPLETA, hipotesis: { eds_pct } }), 'eds_fatiga_pct_rts');

  test('20 % está dentro de la banda', () => {
    const i = conEds(20);
    assert.equal(i.valor, 20);
    assert.deepEqual(i.umbral, [18, 22]);
    assert.equal(i.comparador, 'entre');
    assert.equal(i.estado, 'cumple');
  });

  test('los extremos 18 y 22 CUMPLEN (banda cerrada)', () => {
    assert.equal(conEds(18).estado, 'cumple');
    assert.equal(conEds(22).estado, 'cumple');
  });

  test('fuera de la banda por arriba y por abajo se manda a revisar', () => {
    assert.equal(conEds(25).estado, 'revisar', 'fatiga por vibración');
    assert.equal(conEds(15).estado, 'revisar', 'flecha y altura de apoyo');
  });

  test('sin eds_pct no se supone el clásico 20 %', () => {
    const i = buscar(evaluarUmbrales({ conductor: CONDUCTOR }), 'eds_fatiga_pct_rts');
    assert.equal(i.estado, 'no_evaluable');
    assert.equal(i.valor, null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('umbrales — indicador 3: relación vano / VIR', () => {

  test('con vanos iguales la relación es exactamente 1', () => {
    const i = buscar(evaluarUmbrales(LINEA_COMPLETA), 'relacion_vano_vir');
    cerca(i.valor, 1, 1e-12, 'vanos de 200 m con VIR de 200 m');
    assert.equal(i.estado, 'cumple');
  });

  test('un tramo con un vano corto y otro larguísimo invalida la hipótesis del VIR', () => {
    // VIR = √(Σa³/Σa) con [50, 50, 400]:
    //   Σa³ = 125.000 + 125.000 + 64.000.000 = 64.250.000
    //   Σa  = 500  →  VIR = √128.500 ≈ 358,47 m
    // Relaciones: 50/358,47 = 0,1395 (fuera) y 400/358,47 = 1,116 (dentro).
    const vir = Math.sqrt(128500);
    const e = { tramos: [{ nombre: 'T-1', vanos: [50, 50, 400], vir }] };
    const i = buscar(evaluarUmbrales(e), 'relacion_vano_vir');
    cerca(i.valor, 50 / Math.sqrt(128500), 1e-12, 'la relación más alejada de 1');
    assert.equal(i.estado, 'revisar');
    assert.match(i.criterio, /subdividirse/, 'debe decir qué hacer, no solo que está mal');
  });

  test('se queda con la relación MÁS alejada de 1, en escala logarítmica', () => {
    // 0,5 y 2,0 se desvían lo mismo; 0,25 se desvía más que 2,0 aunque en
    // distancia lineal a 1 parezca lo contrario (0,75 vs 1,00).
    const e = { tramos: [{ nombre: 'T-1', vanos: [25, 200], vir: 100 }] };
    const i = buscar(evaluarUmbrales(e), 'relacion_vano_vir');
    cerca(i.valor, 0.25, 1e-12, 'el vano corto es el que más se desvía');
  });

  test('sin VIR o sin vanos no se inventa la relación', () => {
    assert.equal(buscar(evaluarUmbrales({ tramos: [{ vanos: [100, 200] }] }), 'relacion_vano_vir').estado, 'no_evaluable');
    assert.equal(buscar(evaluarUmbrales({ tramos: [{ vir: 150 }] }), 'relacion_vano_vir').estado, 'no_evaluable');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('umbrales — indicador 4: parámetro de catenaria C = H/w', () => {

  test('C = 1.600/0,8 = 2.000 m supera la bandera de 1.800 m', () => {
    const i = buscar(evaluarUmbrales(LINEA_COMPLETA), 'parametro_catenaria_vibracion');
    cerca(i.valor, 2000, 1e-9, 'H de EDS sobre masa lineal');
    assert.equal(i.umbral, 1800);
    assert.equal(i.estado, 'revisar');
  });

  test('un conductor más flojo baja de la bandera', () => {
    // H = 1.400 kgf sobre 0,8 kg/m = 1.750 m.
    const e = { ...LINEA_COMPLETA, tramos: [tramoConEstados({ eds: 1400 })] };
    const i = buscar(evaluarUmbrales(e), 'parametro_catenaria_vibracion');
    cerca(i.valor, 1750, 1e-9, 'C con menos tiro');
    assert.equal(i.estado, 'cumple');
  });

  test('se rotula como criterio práctico, sin norma detrás', () => {
    const i = buscar(evaluarUmbrales(LINEA_COMPLETA), 'parametro_catenaria_vibracion');
    assert.equal(i.fuente, 'criterio de diseño (sin norma)');
    assert.match(i.criterio, /SIN NORMA CITADA/);
  });

  test('sin estados, el H de EDS se deriva de la hipótesis y da lo MISMO', () => {
    // Identidad del dominio: H_EDS = eds% · RTS. 20 % de 8.000 = 1.600 kgf,
    // el mismo número que traía el tramo. Los dos caminos deben coincidir.
    const conTramos = buscar(evaluarUmbrales(LINEA_COMPLETA), 'parametro_catenaria_vibracion');
    const sinTramos = buscar(evaluarUmbrales({ conductor: CONDUCTOR, hipotesis: HIPOTESIS }), 'parametro_catenaria_vibracion');
    cerca(sinTramos.valor, conTramos.valor, 1e-9, 'mismo C por los dos caminos');
    cerca(sinTramos.valor, 2000, 1e-9, 'verificable a mano');
  });

  test('sin masa lineal del conductor no hay parámetro', () => {
    const e = { ...LINEA_COMPLETA, conductor: { rts_kgf: 8000 } };
    assert.equal(buscar(evaluarUmbrales(e), 'parametro_catenaria_vibracion').estado, 'no_evaluable');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('umbrales — indicador 5: homogeneidad del vaneo', () => {

  test('12 % de coeficiente de variación es una línea pareja', () => {
    const i = buscar(evaluarUmbrales(LINEA_COMPLETA), 'coeficiente_variacion_vano');
    assert.equal(i.valor, 12);
    assert.equal(i.umbral, 30);
    assert.equal(i.estado, 'cumple');
  });

  test('45 % manda a revisar', () => {
    const e = { ...LINEA_COMPLETA, estadisticas: { n: 9, coeficienteVariacion_pct: 45 } };
    assert.equal(buscar(evaluarUmbrales(e), 'coeficiente_variacion_vano').estado, 'revisar');
  });

  test('sin estadística no hay indicador', () => {
    const e = { ...LINEA_COMPLETA, estadisticas: null };
    const i = buscar(evaluarUmbrales(e), 'coeficiente_variacion_vano');
    assert.equal(i.estado, 'no_evaluable');
    assert.equal(i.valor, null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('umbrales — indicador 6: despeje al terreno, honesto por diseño', () => {

  const APOYO = (n, extra = {}) => ({ nombreCampo: `A-${n}`, tipoPunto: 'Estructura', ...extra });

  test('sin altura de sujeción: no_evaluable y dice cuántas faltan', () => {
    const e = { ...LINEA_COMPLETA, apoyos: [APOYO(1, { cotaSujecion_m: 40 }), APOYO(2)] };
    const i = buscar(evaluarUmbrales(e), 'despeje_minimo_terreno');
    assert.equal(i.estado, 'no_evaluable');
    assert.equal(i.valor, null);
    assert.match(i.criterio, /Faltan 1 de 2/, 'debe contar lo que falta');
  });

  test('la cota del terreno NO sustituye a la del punto de sujeción', () => {
    const e = { ...LINEA_COMPLETA, apoyos: [APOYO(1, { coordenada: { cotaTerreno_m: 12 } })] };
    const i = buscar(evaluarUmbrales(e), 'despeje_minimo_terreno');
    assert.equal(i.estado, 'no_evaluable', 'tener cota de terreno no habilita el cálculo');
  });

  test('con alturas pero sin exigencia declarada, sigue sin evaluarse', () => {
    const e = { ...LINEA_COMPLETA, apoyos: [APOYO(1, { cotaSujecion_m: 40 }), APOYO(2, { cotaSujecion_m: 41 })] };
    const i = buscar(evaluarUmbrales(e), 'despeje_minimo_terreno');
    assert.equal(i.estado, 'no_evaluable');
    assert.match(i.criterio, /despejeMinimo_m/, 'debe pedir la exigencia por categoría de terreno');
  });

  test('con alturas y exigencia, TODAVÍA falta el perfil del terreno bajo el vano', () => {
    // El punto crítico casi nunca está bajo un apoyo. Este indicador solo podrá
    // ponerse verde cuando exista perfil: hasta entonces, decirlo.
    const e = {
      ...LINEA_COMPLETA,
      apoyos: [APOYO(1, { cotaSujecion_m: 40 }), APOYO(2, { cotaSujecion_m: 41 })],
      hipotesis: { ...HIPOTESIS, despejeMinimo_m: { 'zona rural': 6.1 } },
    };
    const i = buscar(evaluarUmbrales(e), 'despeje_minimo_terreno');
    assert.equal(i.estado, 'no_evaluable');
    assert.match(i.criterio, /PERFIL DEL TERRENO/);
  });

  test('los empalmes no cuentan como estructuras que deban traer altura', () => {
    // Un empalme puede estar a mitad de vano: no sostiene el conductor. Si
    // contara, la fila pediría eternamente una altura que nadie va a medir.
    const e = {
      ...LINEA_COMPLETA,
      apoyos: [
        APOYO(1, { cotaSujecion_m: 40 }),
        APOYO(2, { cotaSujecion_m: 41 }),
        { nombreCampo: 'EMP-1', tipoPunto: 'Empalme' },
      ],
      hipotesis: { ...HIPOTESIS, despejeMinimo_m: { 'zona rural': 6.1 } },
    };
    const i = buscar(evaluarUmbrales(e), 'despeje_minimo_terreno');
    assert.match(i.criterio, /PERFIL DEL TERRENO/, 'el empalme no debe contarse como altura faltante');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('umbrales — indicador 7: resistencia de puesta a tierra', () => {

  const conPat = (...ohms) => ({
    ...LINEA_COMPLETA,
    apoyos: ohms.map((r, k) => ({
      nombreCampo: `A-${k + 1}`,
      puestaTierra: r == null ? undefined : { resistencia_ohm: r },
    })),
  });

  test('sin ninguna medición no hay indicador', () => {
    const i = buscar(evaluarUmbrales(conPat(null, null)), 'resistencia_puesta_tierra');
    assert.equal(i.estado, 'no_evaluable');
    assert.equal(i.valor, null);
    assert.match(i.criterio, /medición/);
  });

  test('se queda con el PEOR apoyo medido', () => {
    const i = buscar(evaluarUmbrales(conPat(4, 8, 6)), 'resistencia_puesta_tierra');
    assert.equal(i.valor, 8, 'el peor de los tres');
    assert.equal(i.umbral, 10);
    assert.equal(i.estado, 'cumple');
  });

  test('un apoyo por encima de 10 Ω manda toda la línea a revisar', () => {
    const i = buscar(evaluarUmbrales(conPat(4, 25)), 'resistencia_puesta_tierra');
    assert.equal(i.valor, 25);
    assert.equal(i.estado, 'revisar');
  });

  test('si solo una parte está medida, el verde NO se presenta como veredicto de línea', () => {
    const i = buscar(evaluarUmbrales(conPat(4, null, null)), 'resistencia_puesta_tierra');
    assert.equal(i.estado, 'cumple');
    assert.match(i.criterio, /Medidos 1 de 3/);
    assert.match(i.criterio, /NO es un veredicto de la línea completa/);
  });

  test('el umbral de la hipótesis manda sobre el valor por defecto', () => {
    const e = { ...conPat(15), hipotesis: { ...HIPOTESIS, resistenciaTierraMax_ohm: 20 } };
    const i = buscar(evaluarUmbrales(e), 'resistencia_puesta_tierra');
    assert.equal(i.umbral, 20);
    assert.equal(i.estado, 'cumple', '15 Ω ≤ 20 Ω declarados');
  });

  test('declara que el artículo del RETIE no está verificado en el repositorio', () => {
    const i = buscar(evaluarUmbrales(conPat(4)), 'resistencia_puesta_tierra');
    assert.equal(i.fuente, 'RETIE');
    assert.match(i.criterio, /NO están verificados/, 'las cifras de norma no se citan de memoria');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('umbrales — indicador 8: ampacidad frente a la corriente', () => {

  test('sin corriente declarada no hay indicador', () => {
    const e = { ...LINEA_COMPLETA, conductor: { ...CONDUCTOR, ampacidad_A: 718 } };
    const i = buscar(evaluarUmbrales(e), 'ampacidad_vs_corriente');
    assert.equal(i.estado, 'no_evaluable');
    assert.match(i.criterio, /corrienteOperacion_A/);
  });

  test('sin ampacidad calculada tampoco: este módulo no la recalcula', () => {
    const e = { ...LINEA_COMPLETA, hipotesis: { ...HIPOTESIS, corrienteOperacion_A: 400 } };
    const i = buscar(evaluarUmbrales(e), 'ampacidad_vs_corriente');
    assert.equal(i.estado, 'no_evaluable');
    assert.match(i.criterio, /IEEE 738/);
  });

  test('400 A sobre 800 A de ampacidad: cumple, con el uso al 50 %', () => {
    const e = {
      ...LINEA_COMPLETA,
      conductor: { ...CONDUCTOR, ampacidad_A: 800 },
      hipotesis: { ...HIPOTESIS, corrienteOperacion_A: 400 },
    };
    const i = buscar(evaluarUmbrales(e), 'ampacidad_vs_corriente');
    assert.equal(i.valor, 400);
    assert.equal(i.umbral, 800);
    assert.equal(i.unidad, 'A');
    assert.equal(i.estado, 'cumple');
    assert.match(i.criterio, /50,0 %|50.0 %/, '400 de 800 es la mitad');
  });

  test('pasarse de la ampacidad manda a revisar', () => {
    const e = {
      ...LINEA_COMPLETA,
      conductor: { ...CONDUCTOR, ampacidad_A: 700 },
      hipotesis: { ...HIPOTESIS, corrienteOperacion_A: 850 },
    };
    const i = buscar(evaluarUmbrales(e), 'ampacidad_vs_corriente');
    assert.equal(i.estado, 'revisar');
    assert.equal(i.fuente, 'IEEE 738');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('umbrales — la tabla completa cuenta una historia coherente', () => {

  test('una línea con datos completos reparte cumple / revisar / no_evaluable', () => {
    const e = {
      tramos: [tramoConEstados()],
      conductor: { ...CONDUCTOR, ampacidad_A: 800 },
      hipotesis: { ...HIPOTESIS, corrienteOperacion_A: 400, criterioTiroQueRige: 'adoptado' },
      estadisticas: { n: 4, coeficienteVariacion_pct: 12 },
      apoyos: [{ nombreCampo: 'A-1', puestaTierra: { resistencia_ohm: 6 } }],
    };
    const t = evaluarUmbrales(e);
    const por = (id) => buscar(t, id).estado;

    assert.equal(por('tiro_maximo_pct_rts'), 'cumple');
    assert.equal(por('tiro_sin_carga_externa_retie'), 'cumple');
    assert.equal(por('eds_fatiga_pct_rts'), 'cumple');
    assert.equal(por('relacion_vano_vir'), 'cumple');
    assert.equal(por('parametro_catenaria_vibracion'), 'revisar', 'C = 2.000 m > 1.800 m');
    assert.equal(por('coeficiente_variacion_vano'), 'cumple');
    assert.equal(por('despeje_minimo_terreno'), 'no_evaluable', 'sin perfil de terreno, jamás verde');
    assert.equal(por('resistencia_puesta_tierra'), 'cumple');
    assert.equal(por('ampacidad_vs_corriente'), 'cumple');
  });

  test('la función es pura: llamarla dos veces da lo mismo y no toca la entrada', () => {
    const e = JSON.parse(JSON.stringify(LINEA_COMPLETA));
    const copia = JSON.parse(JSON.stringify(e));
    const a = evaluarUmbrales(e);
    const b = evaluarUmbrales(e);
    assert.deepEqual(a, b, 'dos llamadas, el mismo resultado');
    assert.deepEqual(e, copia, 'la entrada no se muta');
  });
});
