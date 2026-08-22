// ============================================================================
// tests/ficha-estructural.test.js — la ficha de un apoyo: lo que entra, lo que
// se rechaza y qué veredictos se mueven
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. Los apoyos de la línea tienen CERO veredictos —ni de lado ni a
// lo largo— y no es un fallo del cálculo: el motor sabe dictaminar desde hace
// meses y lo que falta es POR DÓNDE METER EL DATO. Esta es la mitad pensante de
// esa entrada, y lo que se vigila aquí no es un número bonito: son las cinco
// NEGATIVAS que hacen que el dato entrado se pueda defender el día de la firma.
//
//   1. Un campo VACÍO no entra como cero. Un vacío es «no declarado»; un cero se
//      lee como una medida, y en una carga de rotura es un apoyo sin ninguna
//      resistencia.
//   2. Ningún dato entra sin decir DE DÓNDE SALIÓ, y el origen por defecto no
//      existe — mucho menos `confirmado_humano`, que es poner la firma del
//      Ingeniero sobre lo que no firmó.
//   3. Una GEOMETRÍA IMPOSIBLE se rechaza con el motivo en castellano, y la
//      regla dice exactamente lo mismo que el núcleo. Si divergieran, la
//      pantalla diría que el dato vale, el motor seguiría sin dar veredicto, y
//      parecería una avería de la aplicación.
//   4. Guardar un apoyo recalcula SU TRAMO ENTERO, no solo ese apoyo (ADR-002),
//      y lo que NO se mueve se dice con todas las letras: un panel callado se
//      lee como «no lo miré».
//   5. El cerrojo de revisión lo vigila `tests/cerrojo-revision.test.js`, que es
//      su dueño. Aquí no se duplica.
//
// ⚠️ Todo el mundo de este archivo es SINTÉTICO: este repositorio es público.
// Conductor inventado, apoyos con letras, coordenadas sobre el meridiano de
// Greenwich en el ecuador, capacidades de laboratorio. Ni un dato de la línea
// del cliente entra aquí (L-23). Sembrar una capacidad real en un fixture
// publicaría un «cumple» sobre un número que nadie firmó.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CAMPOS_DE_FICHA, CAMPOS_POR_LOTE, ORIGENES_DE_FICHA, BLOQUES_DE_FICHA,
  revisarGeometria, aplicarFicha, loQueVaACambiar, datosSupuestos, avisoDeSupuestos,
  etiquetaDeOrigen,
  selloDeOrigen,
  numeroTecleado,
  comoSeEntendio,
} from '../web/src/vistas/fichaEstructural.ts';
import { FichaEstructural, CAMPOS_CON_SELLO, Procedencia } from '@lineas/contratos';
import { utilizacionApoyo } from '../nucleo/cargas.js';
import { utilizacionLongitudinal } from '../nucleo/longitudinal.js';

// ── Mundo sintético ─────────────────────────────────────────────────────────

const CUANDO = '2026-08-17T09:00:00.000Z';
const QUIEN = 'uid-sintetico';

/** Un sello completo. `fuente` se omite donde el molde la prohíbe (capacidad). */
const sello = (procedencia, fuente) => (fuente === undefined
  ? { procedencia, declaradoEn: CUANDO, declaradoPor: QUIEN }
  : { procedencia, fuente, declaradoEn: CUANDO, declaradoPor: QUIEN });

const CONDUCTOR = Object.freeze({
  codigo: 'SINTETICO-25', material: 'ACSR', seccion_mm2: 300,
  diametro_m: 0.025, masaLineal_kg_m: 1, rts_kgf: 10000,
  moduloElastico_kg_mm2: 7000, moduloEs: 'no_declarado',
  dilatacion_1_C: 1.9e-5, tempMaxOperacion_C: 75, procedencia: 'supuesto',
});

const HIPOTESIS = Object.freeze({
  nombre: 'sintética', eds_pct: 20, tempEds_C: 25, tempMax_C: 75, tempMin_C: 10,
  vientoMax_kmh: 36, tempViento_C: 25,      // 36 km/h = 10 m/s exactos
  cx: 1.0, densidadAire_kg_m3: 1.2, procedencia: 'supuesto', congelada: false,
});

/**
 * Seis puntos sobre el ecuador y el meridiano de Greenwich, uno de ellos
 * EMPALME. El empalme no es decoración: las filas del núcleo salen en el orden
 * de las ESTRUCTURAS y sin él, y la mitad pensante las alinea por índice contra
 * esa misma lista. Con un empalme dentro, un desalineamiento de uno movería el
 * veredicto de un apoyo a la fila de su vecino — un número creíble y
 * equivocado, que es la peor clase de error.
 */
const P = Object.freeze([
  { lat: 0,       lon: 0 },        // A · terminal
  { lat: 0.0005,  lon: 0 },        // EMP · empalme, a mitad de vano
  { lat: 0.001,   lon: 0 },        // B · suspensión
  { lat: 0.002,   lon: 0.0005 },   // C · retención (corta el tramo)
  { lat: 0.003,   lon: 0.0005 },   // D · suspensión
  { lat: 0.004,   lon: 0.0015 },   // E · terminal
]);

const apoyo = (i, nombre, funcionEstructural, extra = {}) => ({
  id: `ap-${i}`, tipo: 'apoyo', lineaId: 'linea-sintetica', orgId: 'org-sintetica',
  creadoEn: CUANDO, creadoPor: QUIEN, revision: 0,
  orden: i, tipoPunto: 'Estructura',
  nombreCampo: nombre, nombreNormalizado: nombre, coordenada: P[i],
  funcionEstructural, funcionProcedencia: 'supuesto',
  condicion: 'Sin evaluar', activo: true,
  ...extra,
});

/** Cinco estructuras y un empalme. La retención de C parte la línea en 2 tramos. */
const LINEA = Object.freeze([
  apoyo(0, 'A', 'Terminal'),
  apoyo(1, 'EMP', 'Suspensión', { tipoPunto: 'Empalme' }),
  apoyo(2, 'B', 'Suspensión'),
  apoyo(3, 'C', 'Retención / anclaje'),
  apoyo(4, 'D', 'Suspensión'),
  apoyo(5, 'E', 'Terminal'),
]);

/**
 * Los tramos APLANADOS, como los produce `calcularTramos`: dos vanos cada uno
 * (A→C y C→E). El empalme NO parte vano, que es el convenio del sistema.
 */
const TRAMOS = Object.freeze([
  { n: 1, nVanos: 2, hEds: 800, hTMax: 700, hViento: 1000, hTMin: 1200, pico: 1200 },
  { n: 2, nVanos: 2, hEds: 900, hTMax: 780, hViento: 1010, hTMin: 1210, pico: 1210 },
]);

/**
 * LOS MISMOS TRAMOS EN FORMA RICA, que es la única que el eje longitudinal
 * admite: para RESTAR el tiro de dos tramos contiguos hay que poder comprobar
 * que vienen de la misma temperatura y la misma carga unitaria.
 */
const estado = (nombre, H, t) => ({ nombre, H, t, w: 1 });
const rico = (desde, hasta, tiros) => ({
  desde: { nombre: desde }, hasta: { nombre: hasta },
  estados: {
    eds: estado('EDS / cada día', tiros.eds, 25),
    tMax: estado('Máxima temperatura', tiros.tMax, 75),
    viento: estado('Máximo viento', tiros.viento, 25),
    tMin: estado('Mínima temperatura', tiros.tMin, 10),
  },
});
const RICOS = Object.freeze([
  rico('A', 'C', { eds: 800, tMax: 700, viento: 1000, tMin: 1200 }),
  rico('C', 'E', { eds: 900, tMax: 780, viento: 1010, tMin: 1210 }),
]);

const CONTEXTO = Object.freeze({
  apoyos: LINEA, tramos: TRAMOS, tramosRicos: RICOS,
  conductor: CONDUCTOR, hipotesis: HIPOTESIS, circuitos: 1,
});

const de = (panel, nombre) => panel.filas.find((f) => f.apoyo === nombre);

// ════════════════════════════════════════════════════════════════════════════
// 1 · EL MOLDE: nada entra sin decir de dónde salió, y un vacío no es un cero
// ════════════════════════════════════════════════════════════════════════════

describe('el molde de la ficha: valor y sello, juntos o ninguno', () => {
  const fichaBuena = () => ({
    alturaLibre_m: 12,
    procedencias: { alturaLibre_m: sello('levantamiento_campo', 'medido con cinta el 12-08') },
  });

  test('una ficha completa entra', () => {
    const r = FichaEstructural.safeParse(fichaBuena());
    assert.equal(r.success, true, r.success ? '' : JSON.stringify(r.error.issues));
  });

  test('UN CAMPO VACÍO NO SE GUARDA COMO CERO', () => {
    // Es la negativa madre de esta ola. Un cero en la carga de rotura es un
    // apoyo sin ninguna resistencia, y el veredicto que sale de ahí es el que
    // se firma. El molde no lo interpreta: lo rechaza.
    for (const clave of ['alturaLibre_m', 'alturaAplicacion_m', 'cargaRotura_kgf', 'nFasesAmarradas']) {
      const r = FichaEstructural.safeParse({
        [clave]: 0,
        procedencias: { [clave]: sello('levantamiento_campo', 'una línea') },
      });
      assert.equal(r.success, false, `${clave}: un cero entró como si fuera una medida`);
    }
    // Y un cero DENTRO de la capacidad tampoco: ni el valor ni la altura.
    assert.equal(FichaEstructural.safeParse({
      capacidadLongitudinal: { valor_kgf: 0, tipo: 'rotura', alturaReferencia_m: 12, fuente: 'hoja sintética' },
      procedencias: { capacidadLongitudinal: sello('documento_proyecto') },
    }).success, false, 'una capacidad de 0 kgf no es «sin capacidad»: es un error de captura');
  });

  test('un valor NEGATIVO se rechaza: no hay apoyos de altura negativa', () => {
    const r = FichaEstructural.safeParse({
      alturaLibre_m: -12,
      procedencias: { alturaLibre_m: sello('levantamiento_campo', 'una línea') },
    });
    assert.equal(r.success, false);
  });

  test('una ficha sin ningún dato no se guarda, y lo dice', () => {
    const r = FichaEstructural.safeParse({ procedencias: {} });
    assert.equal(r.success, false);
    assert.match(r.error.issues.map((i) => i.message).join(' '), /ningún dato que guardar/);
  });

  test('un valor SIN sello no entra, y el motivo se lee en castellano', () => {
    const r = FichaEstructural.safeParse({ alturaLibre_m: 12 });
    assert.equal(r.success, false);
    const m = r.error.issues.map((i) => i.message).join(' ');
    assert.match(m, /de dónde salió la altura libre sobre el terreno/,
      'el mensaje lo lee el Ingeniero, que no programa: nada de nombres de campo');
    assert.doesNotMatch(m, /alturaLibre_m/, 'un nombre de campo en el aviso no le dice nada a nadie');
  });

  test('un sello SIN valor tampoco: un origen que no sella nada no dice nada', () => {
    const r = FichaEstructural.safeParse({
      cargaRotura_kgf: 3000,
      procedencias: {
        cargaRotura_kgf: sello('catalogo_fabricante', 'placa'),
        alturaLibre_m: sello('levantamiento_campo', 'cinta'),
      },
    });
    assert.equal(r.success, false);
    assert.match(r.error.issues.map((i) => i.message).join(' '), /pero no su valor/);
  });

  test('la PROCEDENCIA POR DEFECTO no existe, y nunca es «confirmado_humano»', () => {
    // Dos capas, y las dos hacen falta:
    //   · el formulario no ofrece «confirmado» — no es un origen, es un acto
    //     posterior sobre un dato que ya está;
    //   · y el molde lo rechaza, porque una pantalla nueva lo volvería a ofrecer.
    assert.equal(ORIGENES_DE_FICHA.some((o) => o.valor === 'confirmado_humano'), false,
      'confirmar no es de dónde salió el dato: es poner la firma encima');
    assert.equal(ORIGENES_DE_FICHA.length, 4, 'cuatro orígenes, ni uno preseleccionado');

    for (const clave of CAMPOS_CON_SELLO) {
      const valor = clave === 'capacidadLongitudinal'
        ? { valor_kgf: 4000, tipo: 'rotura', alturaReferencia_m: 12, fuente: 'hoja sintética' }
        : clave === 'tipoApoyo' ? 'Poste de concreto' : 12;
      const r = FichaEstructural.safeParse({
        [clave]: valor,
        procedencias: {
          [clave]: clave === 'capacidadLongitudinal'
            ? sello('confirmado_humano')
            : sello('confirmado_humano', 'lo he verificado'),
        },
      });
      assert.equal(r.success, false, `${clave}: «confirmado» entró como origen`);
      assert.match(r.error.issues.map((i) => i.message).join(' '), /acto posterior/);
    }
  });

  test('los cuatro orígenes que sí se ofrecen existen en el catálogo del contrato', () => {
    // Si la pantalla ofreciera un valor que el contrato no admite, el dato se
    // rechazaría al guardar y el Ingeniero no sabría por qué.
    for (const o of ORIGENES_DE_FICHA) {
      assert.equal(Procedencia.safeParse(o.valor).success, true,
        `«${o.valor}» no está en el catálogo de procedencias del contrato`);
    }
  });

  test('la FUENTE es obligatoria al escribir', () => {
    const r = FichaEstructural.safeParse({
      alturaLibre_m: 12,
      procedencias: { alturaLibre_m: sello('levantamiento_campo') },
    });
    assert.equal(r.success, false);
    assert.match(r.error.issues.map((i) => i.message).join(' '), /dentro de tres años/);
  });

  test('la capacidad lleva su fuente DENTRO, y no se guarda dos veces', () => {
    const dentro = { valor_kgf: 4000, tipo: 'rotura', alturaReferencia_m: 12, fuente: 'memoria sintética' };
    assert.equal(FichaEstructural.safeParse({
      capacidadLongitudinal: dentro,
      procedencias: { capacidadLongitudinal: sello('documento_proyecto') },
    }).success, true, 'con la fuente dentro y sin duplicar, entra');

    const dos = FichaEstructural.safeParse({
      capacidadLongitudinal: dentro,
      procedencias: { capacidadLongitudinal: sello('documento_proyecto', 'otra cosa') },
    });
    assert.equal(dos.success, false, 'dos fuentes pueden decir cosas distintas: entonces nadie sabe cuál se firmó');

    // Y sin fuente dentro tampoco entra: el núcleo la imprime en el veredicto.
    assert.equal(FichaEstructural.safeParse({
      capacidadLongitudinal: { valor_kgf: 4000, tipo: 'rotura', alturaReferencia_m: 12 },
      procedencias: { capacidadLongitudinal: sello('documento_proyecto') },
    }).success, false);
  });

  test('sin `tipo` la capacidad no entra: entre 50 % y 100 % hay un factor 2', () => {
    assert.equal(FichaEstructural.safeParse({
      capacidadLongitudinal: { valor_kgf: 4000, alturaReferencia_m: 12, fuente: 'memoria sintética' },
      procedencias: { capacidadLongitudinal: sello('documento_proyecto') },
    }).success, false);
    // Y un tipo inventado tampoco: el sistema no adivina el más parecido.
    assert.equal(FichaEstructural.safeParse({
      capacidadLongitudinal: { valor_kgf: 4000, tipo: 'ultima', alturaReferencia_m: 12, fuente: 'memoria sintética' },
      procedencias: { capacidadLongitudinal: sello('documento_proyecto') },
    }).success, false);
  });

  test('el molde es STRICT: lo que no está en la lista se rechaza, no se escribe', () => {
    // En un apoyo esto importa el doble: un apoyo NO se borra. Una clave mal
    // escrita se quedaría dentro del documento para siempre.
    for (const extra of [{ alturaLibre: 12 }, { condicion: 'Mala' }, { funcionEstructural: 'Terminal' }]) {
      const r = FichaEstructural.safeParse({ ...fichaBuena(), ...extra });
      assert.equal(r.success, false, `${Object.keys(extra)[0]} se coló en la ficha`);
    }
  });

  test('los campos RESERVADOS no caben en un parche de ficha', () => {
    // `firestore.rules` congela orgId, creadoPor y creadoEn, y la revisión la
    // pone el cerrojo. Que la base lo niegue no basta: la denegación llega en
    // inglés y sin causa.
    for (const reservado of ['id', 'orgId', 'creadoPor', 'creadoEn', 'revision', 'lineaId']) {
      const r = FichaEstructural.safeParse({ ...fichaBuena(), [reservado]: 'x' });
      assert.equal(r.success, false, `${reservado} entró en un parche de ficha`);
    }
  });

  test('un sello con claves de más se rechaza: no es un diccionario abierto', () => {
    const r = FichaEstructural.safeParse({
      alturaLibre_m: 12,
      procedencias: { alturaLibreM: sello('levantamiento_campo', 'cinta') },
    });
    assert.equal(r.success, false, 'una clave mal escrita sellaría un campo que no existe');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2 · LOS SEIS CAMPOS, Y EL CORTE DEL LOTE
// ════════════════════════════════════════════════════════════════════════════

describe('los seis campos de esta ola', () => {
  test('son exactamente los seis que el contrato sella, y en el mismo orden', () => {
    // Dos listas que empiezan iguales y terminan distintas es cómo un campo se
    // queda sin sello sin que nadie lo vea.
    assert.deepEqual(CAMPOS_DE_FICHA.map((c) => c.clave), [...CAMPOS_CON_SELLO]);
  });

  test('cada campo dice QUÉ DESBLOQUEA, en castellano y con su unidad', () => {
    for (const c of CAMPOS_DE_FICHA) {
      assert.ok(c.etiqueta.length > 3, `${c.clave} sin etiqueta legible`);
      assert.ok(c.queDesbloquea.length > 20, `${c.clave} no dice qué desbloquea`);
      assert.ok(c.queEs.length > 20, `${c.clave} no dice qué es`);
      assert.ok(BLOQUES_DE_FICHA.some((b) => b.bloque === c.bloque), `${c.clave} en un bloque que no existe`);
      assert.doesNotMatch(c.etiqueta, /_m$|_kgf$/, 'la etiqueta no puede ser el nombre del campo');
    }
    // Las tres alturas y la carga llevan unidad; el tipo y el conteo no la tienen.
    assert.equal(CAMPOS_DE_FICHA.find((c) => c.clave === 'alturaLibre_m').unidad, 'm');
    assert.equal(CAMPOS_DE_FICHA.find((c) => c.clave === 'cargaRotura_kgf').unidad, 'kgf');
    assert.equal(CAMPOS_DE_FICHA.find((c) => c.clave === 'nFasesAmarradas').unidad, null);
  });

  test('EL LOTE SOLO ADMITE LO QUE ES DEL MODELO, jamás lo del ejemplar', () => {
    // El corte no es por comodidad: el empotramiento depende del terreno y no se
    // ve desde un escritorio, y un terminal amarra todas las fases mientras un
    // apoyo de paso puede no amarrar ninguna. Copiarlos por lote es la forma más
    // rápida que existe de llenar el sistema de números que PARECEN medidos.
    assert.deepEqual([...CAMPOS_POR_LOTE],
      ['cargaRotura_kgf', 'capacidadLongitudinal', 'tipoApoyo']);
    for (const clave of ['alturaLibre_m', 'alturaAplicacion_m', 'nFasesAmarradas']) {
      assert.equal(CAMPOS_POR_LOTE.includes(clave), false,
        `${clave} se puede aplicar por lote: es el error que el contrato prohíbe por escrito`);
    }
  });

  test('el origen se dice igual en la pantalla y en el acuse', () => {
    // Si el acuse dijera `catalogo_fabricante` y la pantalla «lo dice la placa»,
    // parecerían dos cosas distintas.
    assert.equal(etiquetaDeOrigen('catalogo_fabricante'), 'Lo dice la placa del apoyo');
    assert.equal(etiquetaDeOrigen('documento_proyecto'), 'Lo dice un plano o un acta de montaje');
    assert.equal(etiquetaDeOrigen('supuesto'), 'Lo estimé a ojo');
    assert.equal(etiquetaDeOrigen(undefined), 'origen no declarado', 'un hueco se declara, no se inventa');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3 · LA GEOMETRÍA IMPOSIBLE, ATADA AL NÚCLEO
//
// El núcleo devuelve `null` EN SILENCIO en los tres casos. Sin este aviso, el
// Ingeniero declararía cuatro números impecables, no vería ningún veredicto y
// concluiría que la herramienta está rota. Cada prueba comprueba LAS DOS
// MITADES: que el aviso salga y que el núcleo, con esos mismos números, no dé
// resultado. Si algún día divergen, esta prueba cae — que es su único trabajo.
// ════════════════════════════════════════════════════════════════════════════

describe('la geometría que no puede dar veredicto dice lo mismo que el núcleo', () => {
  const CAP = (alturaReferencia_m) => ({
    valor_kgf: 4000, tipo: 'rotura', alturaReferencia_m, fuente: 'hoja sintética',
  });

  test('el amarre por encima de la punta: aviso aquí, `null` en los DOS ejes', () => {
    const a = { alturaLibre_m: 11, alturaAplicacion_m: 12.5 };
    const avisos = revisarGeometria(a);
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].clave, 'alturaAplicacion_m', 'se nombra el campo que hay que mover');
    assert.match(avisos[0].mensaje, /no va a salir veredicto/);
    assert.match(avisos[0].mensaje, /12,50 m/, 'las cifras van con coma, como las lee el Ingeniero');

    assert.equal(utilizacionApoyo({
      ftTotal_kgf: 500, cargaRotura_kgf: 3000, ...a,
    }), null, 'el eje transversal no da número con esa geometría');
    assert.equal(utilizacionLongitudinal({
      fl_kgf: 1000, capacidad: CAP(11), alturaAplicacion_m: 12.5, alturaLibre_m: 11,
    }), null, 'el eje longitudinal tampoco');
  });

  test('la capacidad referida por encima de la punta: aviso aquí, `null` en el núcleo', () => {
    const avisos = revisarGeometria({
      alturaLibre_m: 11, alturaAplicacion_m: 10, capacidadLongitudinal: CAP(12),
    });
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].clave, 'capacidadLongitudinal');
    assert.equal(utilizacionLongitudinal({
      fl_kgf: 1000, capacidad: CAP(12), alturaAplicacion_m: 10, alturaLibre_m: 11,
    }), null);
  });

  test('el amarre por encima de donde vale la capacidad: aviso aquí, `null` en el núcleo', () => {
    // Darle número exigiría extrapolar la capacidad HACIA ARRIBA — inventarse
    // resistencia que nadie ensayó.
    const avisos = revisarGeometria({
      alturaLibre_m: 14, alturaAplicacion_m: 12, capacidadLongitudinal: CAP(11),
    });
    assert.equal(avisos.length, 1);
    assert.match(avisos[0].mensaje, /inventarse resistencia que nadie ensayó/);
    assert.equal(utilizacionLongitudinal({
      fl_kgf: 1000, capacidad: CAP(11), alturaAplicacion_m: 12, alturaLibre_m: 14,
    }), null);
  });

  test('con la geometría bien NO hay aviso, y el núcleo SÍ da número', () => {
    // La otra mitad, y hace falta: un aviso que salta siempre no avisa de nada.
    const a = { alturaLibre_m: 14, alturaAplicacion_m: 12, capacidadLongitudinal: CAP(13) };
    assert.deepEqual(revisarGeometria(a), []);
    assert.notEqual(utilizacionApoyo({
      ftTotal_kgf: 500, cargaRotura_kgf: 3000, alturaLibre_m: 14, alturaAplicacion_m: 12,
    }), null);
    assert.notEqual(utilizacionLongitudinal({
      fl_kgf: 1000, capacidad: CAP(13), alturaAplicacion_m: 12, alturaLibre_m: 14,
    }), null);
  });

  test('el caso límite —amarre justo en la punta— es válido, y lo es en las dos mitades', () => {
    // El criterio es SUPERAR, no alcanzar. Si aquí se escribiera `>=` y en el
    // núcleo `>`, la pantalla rechazaría un apoyo que el motor sí dictamina.
    const a = { alturaLibre_m: 12, alturaAplicacion_m: 12 };
    assert.deepEqual(revisarGeometria(a), []);
    assert.notEqual(utilizacionApoyo({ ftTotal_kgf: 500, cargaRotura_kgf: 3000, ...a }), null);
  });

  test('sin datos no se inventa un aviso: un hueco no es una contradicción', () => {
    assert.deepEqual(revisarGeometria(null), []);
    assert.deepEqual(revisarGeometria({}), []);
    assert.deepEqual(revisarGeometria({ alturaAplicacion_m: 12 }), [],
      'sin saber dónde está la punta, no se puede decir que el amarre esté por encima');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4 · APLICAR LA FICHA: nada por defecto, ningún cero de relleno
// ════════════════════════════════════════════════════════════════════════════

describe('aplicar la ficha sobre un apoyo', () => {
  const base = apoyo(2, 'B', 'Suspensión', {
    cargaRotura_kgf: 3000,
    procedencias: { cargaRotura_kgf: sello('catalogo_fabricante', 'placa del 12-08') },
  });

  test('un campo AUSENTE se queda como estaba: no se rellena ni se pone a cero', () => {
    const r = aplicarFicha(base, {
      alturaLibre_m: 12,
      procedencias: { alturaLibre_m: sello('levantamiento_campo', 'cinta') },
    });
    assert.equal(r.alturaLibre_m, 12);
    assert.equal(r.cargaRotura_kgf, 3000, 'lo que ya estaba no se toca');
    assert.equal('alturaAplicacion_m' in r, false, 'un campo no declarado NO nace con un cero');
    assert.equal(r.nFasesAmarradas, undefined);
  });

  test('los SELLOS se funden campo a campo: guardar uno no borra el de otro', () => {
    // `updateDoc` sustituye el campo que recibe. Sin esta fusión, guardar hoy la
    // altura libre dejaría la carga de rotura sin origen dentro de un documento
    // que respalda un papel firmado, y sin un solo error por el camino.
    const r = aplicarFicha(base, {
      alturaLibre_m: 12,
      procedencias: { alturaLibre_m: sello('levantamiento_campo', 'cinta') },
    });
    assert.equal(r.procedencias.cargaRotura_kgf.procedencia, 'catalogo_fabricante');
    assert.equal(r.procedencias.alturaLibre_m.procedencia, 'levantamiento_campo');
  });

  test('es PURA: no toca el apoyo que le entra', () => {
    const copia = JSON.parse(JSON.stringify(base));
    aplicarFicha(base, { alturaLibre_m: 12, procedencias: { alturaLibre_m: sello('levantamiento_campo', 'cinta') } });
    assert.deepEqual(JSON.parse(JSON.stringify(base)), copia);
  });

  test('un dato SUPUESTO queda marcado, y el aviso lo nombra', () => {
    // El veredicto NO se altera por esto: el núcleo dictamina sobre el número y
    // la pantalla dice de dónde salió el número. Lo que no puede pasar es que un
    // «cumple» calculado sobre una estimación a ojo llegue limpio a un papel.
    const r = aplicarFicha(base, {
      alturaLibre_m: 12,
      procedencias: { alturaLibre_m: sello('supuesto', 'estimado desde el suelo') },
    });
    const xs = datosSupuestos(r);
    assert.equal(xs.length, 1);
    assert.equal(xs[0].clave, 'alturaLibre_m');
    assert.match(avisoDeSupuestos(r), /un dato supuesto/);
    assert.match(avisoDeSupuestos(r), /altura libre sobre el terreno/);
    assert.equal(avisoDeSupuestos(base), null, 'sin supuestos no se inventa una advertencia');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5 · LO QUE VA A CAMBIAR: EL TRAMO ENTERO, ANTES DE ESCRIBIR NADA
// ════════════════════════════════════════════════════════════════════════════

describe('guardar un apoyo recalcula SU TRAMO ENTERO', () => {
  const fichaDeB = {
    cargaRotura_kgf: 3000, alturaLibre_m: 12, alturaAplicacion_m: 10,
    procedencias: {
      cargaRotura_kgf: sello('catalogo_fabricante', 'placa de B, foto del 12-08'),
      alturaLibre_m: sello('levantamiento_campo', 'medida con cinta'),
      alturaAplicacion_m: sello('levantamiento_campo', 'medida con cinta'),
    },
  };

  test('el panel abarca TODO el tramo del apoyo editado, no solo ese apoyo', () => {
    // ADR-002: editar un apoyo invalida y recalcula todo su tramo de tensión. Si
    // el panel solo mirase el apoyo, las validaciones de coherencia darían
    // falsos positivos y nadie lo sabría hasta el informe.
    const panel = loQueVaACambiar(CONTEXTO, [{ apoyoId: 'ap-2', ficha: fichaDeB }]);
    assert.deepEqual(panel.alcance.tramos_n, [1]);
    assert.deepEqual(panel.alcance.apoyos, ['A', 'B', 'C'],
      'A y C cuelgan del mismo tramo 1 y entran aunque no se toquen');
    assert.deepEqual(panel.alcance.editados, ['B']);
    // Y el OTRO tramo no entra: recalcular la línea entera enseñaría veinte
    // filas quietas y taparía las que sí se mueven.
    assert.equal(de(panel, 'D'), undefined);
    assert.equal(de(panel, 'E'), undefined);
  });

  test('el apoyo editado GANA veredicto, y la cifra de cabecera lo cuenta', () => {
    const panel = loQueVaACambiar(CONTEXTO, [{ apoyoId: 'ap-2', ficha: fichaDeB }]);
    const b = de(panel, 'B');
    assert.equal(b.transversal.antes, 'sin_veredicto');
    assert.equal(b.transversal.despues, 'cumple');
    assert.equal(b.cambia, true);
    assert.equal(panel.resumen.gananVeredicto, 1);
    assert.equal(panel.resumen.sinVeredictoAntes, 3);
    assert.match(panel.frases[0], /pasan a tener veredicto: 1/);
  });

  test('la utilización que sale es la del núcleo, no una copia de la fórmula', () => {
    // Se comprueba contra la IDENTIDAD (momento contra momento), que se rehace
    // en una servilleta: util = F·h_amarre / (rotura·h_libre) · 100. El único
    // ingrediente que no se escribe a mano es la carga total, que la produce el
    // núcleo a partir de la geometría — y es justo lo que no se duplica aquí.
    const panel = loQueVaACambiar(CONTEXTO, [{ apoyoId: 'ap-2', ficha: fichaDeB }]);
    const u = de(panel, 'B').transversal.utilizacionDespues_pct;
    assert.ok(u > 0 && u < 50, 'con 3000 kgf de rotura el apoyo cumple con holgura');
    const conElDoble = loQueVaACambiar(CONTEXTO, [{
      apoyoId: 'ap-2', ficha: { ...fichaDeB, cargaRotura_kgf: 6000 },
    }]);
    assert.ok(Math.abs(de(conElDoble, 'B').transversal.utilizacionDespues_pct * 2 - u) < 1e-9,
      'el doble de rotura tiene que dar la mitad de utilización, exactamente');
  });

  test('LO QUE NO SE MUEVE SE DICE con todas las letras', () => {
    // Un panel que se queda callado sobre el resto del tramo se lee como «no lo
    // miré». En esta ola ninguno de los seis campos mueve el número de un
    // vecino, y eso es un hecho comprobado, no un supuesto.
    const panel = loQueVaACambiar(CONTEXTO, [{ apoyoId: 'ap-2', ficha: fichaDeB }]);
    assert.deepEqual(panel.resumen.sinMover, ['A', 'C']);
    assert.equal(de(panel, 'A').cambia, false);
    assert.equal(de(panel, 'C').cambia, false);
    assert.ok(panel.frases.some((f) => /no se mueve: comprobado, no supuesto/.test(f)));
  });

  test('lo que SIGUE faltando se dice con las palabras del núcleo', () => {
    const panel = loQueVaACambiar(CONTEXTO, [{ apoyoId: 'ap-2', ficha: fichaDeB }]);
    assert.deepEqual(de(panel, 'B').faltaTodavia, [], 'a B ya no le falta nada en el eje de lado');
    assert.deepEqual(de(panel, 'C').faltaTodavia, [
      'carga de rotura del apoyo',
      'altura libre sobre el terreno',
      'altura del punto de sujeción',
    ]);
    assert.equal(panel.resumen.sinVeredictoDespues, 2);
    assert.ok(panel.frases.some((f) => /siguen sin veredicto/.test(f)));
  });

  test('sin ficha no cambia nada, y el panel lo dice sin adornos', () => {
    const panel = loQueVaACambiar(CONTEXTO, [{ apoyoId: 'ap-2', ficha: {} }]);
    assert.equal(panel.resumen.gananVeredicto, 0);
    assert.match(panel.frases[0], /Ningún apoyo gana veredicto/);
  });

  test('un veredicto de REVISAR sale AQUÍ, con la frase que explica que no es una avería nueva', () => {
    // Descubrirlo en un informe es exactamente lo que este panel existe para
    // impedir. Y si aparece sin la frase, el efecto es que se deja de meter
    // datos, que es lo contrario de lo que busca esta ola.
    const panel = loQueVaACambiar(CONTEXTO, [{
      apoyoId: 'ap-2',
      ficha: { ...fichaDeB, cargaRotura_kgf: 1000 },   // apoyo escaso a propósito
    }]);
    assert.equal(de(panel, 'B').transversal.despues, 'revisar');
    assert.equal(panel.resumen.pasanARevisar, 1);
    assert.ok(panel.frases.some((f) => /no es una avería nueva/.test(f)),
      'sin esta frase, «revisar» se lee como una avería que apareció al meter el dato');
  });

  test('la geometría imposible viaja en el panel, ANTES de guardar', () => {
    const panel = loQueVaACambiar(CONTEXTO, [{
      apoyoId: 'ap-2',
      ficha: { ...fichaDeB, alturaAplicacion_m: 13 },   // el amarre, por encima de la punta
    }]);
    assert.equal(panel.avisosGeometria.length, 1);
    assert.equal(panel.avisosGeometria[0].apoyo, 'B');
    assert.match(panel.avisosGeometria[0].avisos[0].mensaje, /por encima de la punta/);
    assert.equal(de(panel, 'B').transversal.despues, 'sin_veredicto',
      'y el núcleo, coherente, sigue sin dar veredicto');
  });
});

describe('el eje longitudinal en el panel', () => {
  /**
   * Ficha completa de un TERMINAL. Las cifras están escogidas para que la
   * utilización se compruebe A MANO y no ejecutando el módulo:
   *   carga total = tiro máximo del tramo 1 (1200 kgf, el de mínima temperatura)
   *                 × 3 conductores            = 3600 kgf
   *   utilización = (3600 · 11) / (4000 · 12)  = 82,5 %
   * y como la capacidad es de ROTURA, el umbral es el 50 %: sale REVISAR.
   */
  const fichaDeA = {
    capacidadLongitudinal: {
      valor_kgf: 4000, tipo: 'rotura', alturaReferencia_m: 12,
      fuente: 'memoria de cálculo sintética, hoja 2',
    },
    nFasesAmarradas: 3,
    alturaLibre_m: 13,
    alturaAplicacion_m: 11,
    procedencias: {
      capacidadLongitudinal: sello('documento_proyecto'),
      nFasesAmarradas: sello('levantamiento_campo', 'contadas en el apoyo'),
      alturaLibre_m: sello('levantamiento_campo', 'medida con cinta'),
      alturaAplicacion_m: sello('levantamiento_campo', 'medida con cinta'),
    },
  };

  test('la ficha del terminal valida contra el molde', () => {
    const r = FichaEstructural.safeParse(fichaDeA);
    assert.equal(r.success, true, r.success ? '' : JSON.stringify(r.error.issues));
  });

  test('el terminal gana veredicto longitudinal, y el porcentaje se rehace a mano', () => {
    const panel = loQueVaACambiar(CONTEXTO, [{ apoyoId: 'ap-0', ficha: fichaDeA }]);
    const a = de(panel, 'A');
    assert.equal(a.longitudinal.antes, 'sin_veredicto');
    assert.equal(a.longitudinal.despues, 'revisar');
    assert.ok(Math.abs(a.longitudinal.utilizacionDespues_pct - 82.5) < 1e-9,
      '(3600 kgf · 11 m) / (4000 kgf · 12 m) = 82,5 %');
    assert.ok(panel.frases.some((f) => /no es una avería nueva/.test(f)));
  });

  test('LOS TRAMOS RICOS NO SON OPCIONALES: sin ellos el eje se queda mudo', () => {
    // El núcleo rechaza la forma aplanada a propósito —para restar el tiro de
    // dos tramos hay que poder comprobar que son comparables—, y no da error:
    // deja el eje sin un solo tiro. Pasar aquí los tramos aplanados enseñaría
    // «no se mueve nada» sobre el eje que esta ola existe para desbloquear.
    const panel = loQueVaACambiar({ ...CONTEXTO, tramosRicos: TRAMOS },
      [{ apoyoId: 'ap-0', ficha: fichaDeA }]);
    assert.equal(de(panel, 'A').longitudinal.despues, 'sin_veredicto');
  });

  test('EL EMPALME NO CORRE LAS FILAS: cada veredicto cae en su apoyo', () => {
    // Las filas del núcleo van en el orden de las ESTRUCTURAS y sin empalmes, y
    // aquí se alinean por índice contra esa misma lista —no por nombre, que en
    // esta línea puede repetirse—. Un desfase de uno pondría el veredicto de A
    // en la fila de B.
    const panel = loQueVaACambiar(CONTEXTO, [{ apoyoId: 'ap-0', ficha: fichaDeA }]);
    assert.equal(de(panel, 'EMP'), undefined, 'un empalme no sostiene nada: no tiene fila');
    assert.equal(de(panel, 'A').editado, true);
    assert.equal(de(panel, 'B').editado, false);
    assert.equal(de(panel, 'B').longitudinal.despues, 'sin_veredicto',
      'el veredicto del terminal no puede aparecer en la fila de su vecino');
  });

  test('la capacidad NO se deduce de la carga de rotura, ni con las alturas puestas', () => {
    // Es ensayo TRANSVERSAL en la punta: su validez a lo largo de la línea
    // depende de la sección del apoyo y de si hay retenida, y ninguna de las dos
    // está declarada. El contrato lo prohíbe por escrito y aquí se comprueba.
    const panel = loQueVaACambiar(CONTEXTO, [{
      apoyoId: 'ap-0',
      ficha: {
        cargaRotura_kgf: 4000, alturaLibre_m: 13, alturaAplicacion_m: 11, nFasesAmarradas: 3,
        procedencias: {
          cargaRotura_kgf: sello('catalogo_fabricante', 'placa'),
          alturaLibre_m: sello('levantamiento_campo', 'cinta'),
          alturaAplicacion_m: sello('levantamiento_campo', 'cinta'),
          nFasesAmarradas: sello('levantamiento_campo', 'contadas'),
        },
      },
    }]);
    assert.equal(de(panel, 'A').longitudinal.despues, 'sin_veredicto');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL PUNTO DE LOS MILES — el defecto que ninguna de las 1.379 pruebas cazaba
// ----------------------------------------------------------------------------
// En Colombia el punto separa los MILES: «9.000» son nueve mil. La versión
// anterior hacía `replace(',', '.')` y se lo daba a `Number`, así que «9.000»
// entraba como **9** y «1.250,75» como NaN. Y lo que lo volvía inevitable: la
// propia aplicación PINTA los números con punto de miles, de modo que copiarlo
// de la pantalla al campo era el camino natural.
//
// El daño no es de formato. Una carga de rotura de 9.000 kgf guardada como 9 kgf
// da un veredicto «revisar» sobre un apoyo sano, dentro de un documento que las
// reglas prohíben borrar — y sin un solo error por el camino. Es el riesgo nº 1
// declarado del proyecto: el motor no falla, CERTIFICA.
// ════════════════════════════════════════════════════════════════════════════
describe('un número tecleado por una persona en Colombia', () => {

  test('el PUNTO separa los miles: 9.000 son nueve mil, no nueve', () => {
    assert.equal(numeroTecleado('9.000'), 9000);
    assert.equal(numeroTecleado('1.250.000'), 1250000);
  });

  test('la COMA separa los decimales, y convive con los miles', () => {
    assert.equal(numeroTecleado('1.250,75'), 1250.75);
    assert.equal(numeroTecleado('9,5'), 9.5);
    assert.equal(numeroTecleado('12,5'), 12.5);
  });

  test('lo escrito sin separadores sigue valiendo, que es como lo teclea media gente', () => {
    assert.equal(numeroTecleado('9000'), 9000);
    assert.equal(numeroTecleado('12'), 12);
    assert.equal(numeroTecleado('9.5'), 9.5);   // un punto sin tres dígitos detrás NO es miles
  });

  test('vacío es «no declarado» y una palabra es un error: no son lo mismo', () => {
    assert.equal(numeroTecleado(''), undefined);
    assert.equal(numeroTecleado(null), undefined);
    assert.ok(Number.isNaN(numeroTecleado('nueve mil')));
  });

  test('EL DAÑO QUE EVITA: 9.000 kgf no puede entrar como 9 kgf', () => {
    // Si esta prueba se pone roja, un apoyo sano saldrá «revisar» en un informe
    // firmado, y el número que lo causó nadie lo verá.
    const rotura = numeroTecleado('9.000');
    assert.ok(rotura !== undefined && rotura >= 1000,
      `una carga de rotura tecleada como «9.000» se entendió como ${rotura} kgf`);
  });

  test('y el sistema DEVUELVE lo que entendió, para que el error se vea en el acto', () => {
    // La regla de arriba es razonable y aun así puede fallar con una entrada
    // rara. Esto hace que se vea al teclear, no dentro de un informe.
    assert.match(comoSeEntendio('9.000', 'kgf'), /9\.000 kgf/);
    assert.match(comoSeEntendio('nueve mil', 'kgf'), /no es un número/);
    assert.equal(comoSeEntendio('', 'kgf'), null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// NINGÚN ORIGEN SE IMPRIME EN CRUDO — cazado por la auditoría del 2026-08-21
// ----------------------------------------------------------------------------
// El criterio del dueño único estaba escrito («si el acuse dijera
// `catalogo_fabricante` y la pantalla "lo dice la placa", parecerían dos cosas
// distintas») y se cumplía en la ficha… mientras `Sello.tsx` mantenía su propia
// lista con CINCO entradas, dos inexistentes en el contrato (`medido`,
// `calculado`) y sin cuatro de las siete reales. Para ésas imprimía el
// identificador crudo —`documento_proyecto`— al pie de una tabla firmable, que
// es justo donde un producto de trazabilidad no puede hablar en jerga.
//
// Esta prueba recorre los SIETE valores del contrato: el día que entre el
// octavo, se pone roja antes de que llegue a una pantalla (`34 · L-65`).
// ════════════════════════════════════════════════════════════════════════════
describe('el vocabulario del origen es de UN dueño y cubre el contrato entero', () => {
  const VALORES = Procedencia.options;

  test('son siete, y si el contrato crece esta prueba lo dice', () => {
    assert.equal(VALORES.length, 7, 'entró un origen nuevo: hay que traducirlo en los DOS registros');
  });

  for (const v of VALORES) {
    test(`«${v}» tiene traducción en los dos registros, y ninguna es el identificador`, () => {
      for (const [registro, fn] of [['ficha', etiquetaDeOrigen], ['sello', selloDeOrigen]]) {
        const dicho = fn(v);
        assert.notEqual(dicho, v,
          `el registro «${registro}» devuelve el identificador crudo para «${v}»: eso acaba `
          + 'impreso en una pantalla o en un sello firmable');
        assert.ok(dicho.length > 3);
      }
    });
  }

  test('un hueco se declara, no se inventa', () => {
    assert.equal(selloDeOrigen(undefined), 'origen no declarado');
    assert.equal(selloDeOrigen(null), 'origen no declarado');
  });

  test('ninguna pantalla se guarda su propia lista de orígenes', () => {
    // El guardián que faltaba: el criterio vivía en un comentario y el olvido
    // volvió igual. Se comprueba en el texto porque el fallo es de ESTRUCTURA,
    // no de valor — una lista local pasa todas las pruebas de valor.
    for (const f of ['Sello.tsx', 'Fundamentos.tsx', 'Fichas.tsx']) {
      const txt = readFileSync(new URL(`../web/src/componentes/${f}`, import.meta.url), 'utf-8');
      assert.ok(!/catalogo_fabricante\s*:/.test(txt),
        `${f} vuelve a tener su propia tabla de orígenes: el dueño es vistas/fichaEstructural.ts`);
      // Ojo: comparar la procedencia para DECIDIR algo («¿es supuesto?») es
      // legítimo. Lo que no lo es es TRADUCIRLA: un ternario que devuelve texto.
      // Se compara contra los SIETE valores del molde, no contra cualquier
      // cadena: `tope.procedencia === 'criterio_clasico'` es la procedencia del
      // TOPE DE TIRO, otra cosa, y traducirla ahí es correcto.
      const origenes = VALORES.join('|');
      assert.ok(!new RegExp(`procedencia === '(${origenes})'\\s*\\?\\s*'`).test(txt),
        `${f} traduce un origen del dato con un ternario suelto: deja los otros seis en crudo`);
    }
  });
});
