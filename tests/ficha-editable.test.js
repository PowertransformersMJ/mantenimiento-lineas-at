// ============================================================================
// tests/ficha-editable.test.js — la ficha se puede ESCRIBIR desde la pantalla
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. `tests/ficha-estructural.test.js` vigila el dato: qué entra,
// qué se rechaza y qué veredictos se mueven. Esto vigila la otra mitad — que ese
// dato SE PUEDA METER, y que al meterlo no se pierda nada de lo que ya se veía.
//
// Lo que se defiende aquí, y son cosas que ya han fallado en este proyecto:
//
//   1. LO QUE LA PANTALLA DICE QUE FALTA Y LO QUE EL MOLDE RECHAZA SON LO MISMO.
//      Si divergen aparece el peor de los dos mundos: o el botón se enciende y
//      la base niega en inglés, o el botón se queda apagado sobre una ficha
//      perfectamente guardable y él concluye que la herramienta está rota.
//   2. NI UNA FÓRMULA EN EL .TSX. React pinta y pregunta; el número lo dicta el
//      núcleo. Dos dueños de la misma cuenta empiezan iguales y acaban
//      distintos, y uno de los dos acaba en un informe firmado.
//   3. NO SE PIERDE NI UNA FILA de las que la ficha ya enseñaba. Es la regla de
//      no-regresión de visibilidad: lo que antes se veía tiene que seguir
//      viéndose, y montar un editor encima es justo cuando se pierde.
//   4. SOLO ESCRIBE QUIEN TIENE PERMISO, y si no lo tiene se DICE — no se
//      esconde la ficha ni se ofrece un botón que la base va a negar.
//   5. GUARDAR NO RECARGA LA LÍNEA. Recargar destruiría el acuse en el instante
//      en que se genera; la lección ya está escrita en `refrescarLinea`.
//
// ⚠️ Mundo SINTÉTICO, como el de su archivo hermano: este repositorio es
// público. Apoyos con letras, coordenadas sobre el ecuador y el meridiano de
// Greenwich, capacidades de laboratorio. Ni un dato de la línea del cliente.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  CAMPOS_DE_FICHA, ORIGENES_DE_FICHA, TIPOS_DE_CAPACIDAD,
  borradorEnBlanco, fichaDelBorrador, geometriaDelBorrador, apoyoConBorrador,
  estadoDelApoyo, loQueVaACambiar,
} from '../web/src/vistas/fichaEstructural.ts';
import { FichaEstructural, TipoCapacidadLongitudinal } from '@lineas/contratos';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => readFileSync(join(RAIZ, p), 'utf-8');

// ── Mundo sintético ─────────────────────────────────────────────────────────

const CUANDO = '2026-08-17T09:00:00.000Z';
const QUIEN = 'uid-sintetico';

const CONDUCTOR = Object.freeze({
  codigo: 'SINTETICO-25', material: 'ACSR', seccion_mm2: 300,
  diametro_m: 0.025, masaLineal_kg_m: 1, rts_kgf: 10000,
  moduloElastico_kg_mm2: 7000, moduloEs: 'no_declarado',
  dilatacion_1_C: 1.9e-5, tempMaxOperacion_C: 75, procedencia: 'supuesto',
});

const HIPOTESIS = Object.freeze({
  nombre: 'sintética', eds_pct: 20, tempEds_C: 25, tempMax_C: 75, tempMin_C: 10,
  vientoMax_kmh: 36, tempViento_C: 25,
  cx: 1.0, densidadAire_kg_m3: 1.2, procedencia: 'supuesto', congelada: false,
});

const P = [
  { lat: 0, lon: 0 },
  { lat: 0.001, lon: 0 },
  { lat: 0.002, lon: 0.0005 },
];

const apoyo = (i, nombre, funcionEstructural, extra = {}) => ({
  id: `ap-${i}`, tipo: 'apoyo', lineaId: 'linea-sintetica', orgId: 'org-sintetica',
  creadoEn: CUANDO, creadoPor: QUIEN, revision: 0,
  orden: i, tipoPunto: 'Estructura',
  nombreCampo: nombre, nombreNormalizado: nombre, coordenada: P[i],
  funcionEstructural, funcionProcedencia: 'supuesto',
  condicion: 'Sin evaluar', activo: true,
  ...extra,
});

const LINEA = [
  apoyo(0, 'A', 'Terminal'),
  apoyo(1, 'B', 'Suspensión'),
  apoyo(2, 'C', 'Terminal'),
];

const TRAMOS = [{ n: 1, nVanos: 2, hEds: 800, hTMax: 700, hViento: 1000, hTMin: 1200, pico: 1200 }];
const estado = (nombre, H, t) => ({ nombre, H, t, w: 1 });
const RICOS = [{
  desde: { nombre: 'A' }, hasta: { nombre: 'C' },
  estados: {
    eds: estado('EDS / cada día', 800, 25),
    tMax: estado('Máxima temperatura', 700, 75),
    viento: estado('Máximo viento', 1000, 25),
    tMin: estado('Mínima temperatura', 1200, 10),
  },
}];

const CONTEXTO = Object.freeze({
  apoyos: LINEA, tramos: TRAMOS, tramosRicos: RICOS,
  conductor: CONDUCTOR, hipotesis: HIPOTESIS, circuitos: 1,
});

/** Un borrador con lo que él habría tecleado. Nada se rellena solo. */
function tecleado({ valores = {}, origenes = {}, fuentes = {} } = {}) {
  const b = borradorEnBlanco();
  return {
    valores: { ...b.valores, ...valores },
    origenes: { ...origenes },
    fuentes: { ...fuentes },
  };
}

/**
 * Lo que `datos/firestore.ts` hace justo antes de validar: la firma y la hora
 * las pone la SESIÓN, nunca la pantalla. Se replica aquí para poder comprobar
 * que lo que sale del borrador pasa el molde de verdad.
 */
function sellarComoLaSesion(ficha) {
  const { procedencias, ...valores } = ficha;
  const sellos = {};
  for (const [k, s] of Object.entries(procedencias ?? {})) {
    sellos[k] = { ...s, declaradoEn: CUANDO, declaradoPor: QUIEN };
  }
  return { ...valores, procedencias: sellos };
}

// ════════════════════════════════════════════════════════════════════════════
// 1 · EL BORRADOR: nada por defecto, ningún cero de relleno
// ════════════════════════════════════════════════════════════════════════════

describe('el formulario arranca vacío y no rellena nada', () => {
  test('ningún valor y ningún origen vienen puestos', () => {
    const b = borradorEnBlanco();
    for (const [clave, v] of Object.entries(b.valores)) {
      assert.equal(v, '', `«${clave}» viene con algo puesto: un campo prerrellenado se confirma en `
        + 'vez de decidirse');
    }
    assert.deepEqual(b.origenes, {},
      'un valor por defecto en un campo de ORIGEN es una firma que nadie puso');
    assert.deepEqual(b.fuentes, {});
  });

  test('un borrador vacío no produce ficha, y lo dice', () => {
    const r = fichaDelBorrador(borradorEnBlanco());
    assert.equal(r.ficha, null);
    assert.match(r.faltan.join(' '), /no ha declarado ningún dato/);
  });

  test('«confirmado» NO se puede elegir: no es un origen, es un acto posterior', () => {
    assert.ok(!ORIGENES_DE_FICHA.some((o) => o.valor === 'confirmado_humano'),
      'poner la firma del Ingeniero sobre lo que no firmó es peor que no tener el dato');
    // Y si alguien lo colara igual, el molde lo rechaza: es la defensa real.
    const r = fichaDelBorrador(tecleado({
      valores: { alturaLibre_m: '12' },
      origenes: { alturaLibre_m: 'confirmado_humano' },
      fuentes: { alturaLibre_m: 'lo verifiqué' },
    }));
    assert.ok(r.ficha, 'la pantalla no es la frontera: construye el parche');
    const v = FichaEstructural.safeParse(sellarComoLaSesion(r.ficha));
    assert.equal(v.success, false, 'el molde es quien tiene que negarse');
    assert.match(JSON.stringify(v.error.issues), /acto posterior/);
  });

  test('el que estima a ojo lo ve escrito antes de elegirlo', () => {
    const supuesto = ORIGENES_DE_FICHA.find((o) => o.valor === 'supuesto');
    assert.ok(supuesto, 'estimar a ojo tiene que ser una opción declarable, no un hueco');
    assert.match(supuesto.aviso ?? '', /supuesto/,
      'si elegir «a ojo» no avisa de que queda marcado, la marca aparece por sorpresa en el informe');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2 · LO QUE LA PANTALLA DICE QUE FALTA ES LO QUE EL MOLDE RECHAZA
// ════════════════════════════════════════════════════════════════════════════

describe('la pantalla y el molde dicen lo mismo', () => {
  const buena = () => tecleado({
    valores: { alturaLibre_m: '12,5' },
    origenes: { alturaLibre_m: 'levantamiento_campo' },
    fuentes: { alturaLibre_m: 'medido con cinta el 12-08' },
  });

  test('lo que sale SIN faltas, el molde lo acepta', () => {
    const r = fichaDelBorrador(buena());
    assert.deepEqual(r.faltan, []);
    assert.equal(r.ficha.alturaLibre_m, 12.5, 'la coma decimal es como se escribe un número aquí');
    const v = FichaEstructural.safeParse(sellarComoLaSesion(r.ficha));
    assert.equal(v.success, true, v.success ? '' : JSON.stringify(v.error?.issues));
  });

  test('un valor SIN origen: la pantalla lo nombra y el molde lo rechaza', () => {
    const r = fichaDelBorrador(tecleado({ valores: { alturaLibre_m: '12,5' } }));
    assert.equal(r.ficha, null, 'sin origen no se manda nada a la base');
    assert.match(r.faltan.join(' '), /de dónde salió/);
    // Y si se colara: el molde también.
    const v = FichaEstructural.safeParse(sellarComoLaSesion({ alturaLibre_m: 12.5, procedencias: {} }));
    assert.equal(v.success, false);
  });

  test('un origen SIN valor no viaja — y NO apaga el botón', () => {
    // EL CASO DE TODOS LOS DÍAS: sella el bloque de un gesto (que es lo que hace
    // usable el formulario) y solo rellena uno de sus tres campos. Si los otros
    // dos apagaran el botón, la pantalla le exigiría un dato que no tiene — y la
    // forma más rápida de que vuelva a la libreta.
    const r = fichaDelBorrador(tecleado({
      valores: { cargaRotura_kgf: '4000' },
      origenes: { cargaRotura_kgf: 'catalogo_fabricante', tipoApoyo: 'catalogo_fabricante' },
      fuentes: { cargaRotura_kgf: 'placa del apoyo, foto del 12-08' },
    }));
    assert.deepEqual(r.faltan, [], 'un sello sin valor no puede bloquear el guardado');
    assert.ok(r.ficha, 'lo que sí está completo tiene que poder guardarse');
    assert.equal(r.ficha.tipoApoyo, undefined);
    assert.ok(!('tipoApoyo' in r.ficha.procedencias),
      'un origen que no sella ningún número no dice nada: el molde lo rechazaría');
    // Y no se calla: se dice que ese sello no viaja.
    assert.match(r.noViajan.join(' '), /tipo de apoyo/);
    const v = FichaEstructural.safeParse(sellarComoLaSesion(r.ficha));
    assert.equal(v.success, true, v.success ? '' : JSON.stringify(v.error?.issues));
  });

  test('sellar el bloque entero sin escribir nada no produce ficha ni falsas faltas', () => {
    const r = fichaDelBorrador(tecleado({
      origenes: {
        cargaRotura_kgf: 'documento_proyecto',
        capacidadLongitudinal: 'documento_proyecto',
        tipoApoyo: 'documento_proyecto',
      },
    }));
    assert.equal(r.ficha, null);
    assert.equal(r.noViajan.length, 3, 'los tres sellos huérfanos se nombran uno a uno');
    assert.match(r.faltan.join(' '), /no ha declarado ningún dato/,
      'y el motivo de que el botón siga apagado es ése, no una lista de reproches');
  });

  test('sin FUENTE no se guarda: dentro de tres años nadie podrá discutirlo', () => {
    const r = fichaDelBorrador(tecleado({
      valores: { alturaLibre_m: '12,5' },
      origenes: { alturaLibre_m: 'levantamiento_campo' },
    }));
    assert.equal(r.ficha, null);
    assert.match(r.faltan.join(' '), /en una línea de dónde salió/);
  });

  test('un campo VACÍO no entra como cero, y un cero tecleado no es un dato', () => {
    const vacio = fichaDelBorrador(buena());
    assert.equal(vacio.ficha.cargaRotura_kgf, undefined,
      'un campo en blanco es «no declarado»; un cero se leería como una medida');
    assert.ok(!('cargaRotura_kgf' in vacio.ficha.procedencias),
      'y tampoco se le inventa un sello');

    const cero = fichaDelBorrador(tecleado({
      valores: { cargaRotura_kgf: '0' },
      origenes: { cargaRotura_kgf: 'catalogo_fabricante' },
      fuentes: { cargaRotura_kgf: 'placa' },
    }));
    assert.equal(cero.ficha, null);
    assert.match(cero.faltan.join(' '), /cero/);
  });

  test('lo que no es un número se dice con esas palabras, no se convierte en cero', () => {
    const r = fichaDelBorrador(tecleado({
      valores: { alturaLibre_m: 'doce y medio' },
      origenes: { alturaLibre_m: 'levantamiento_campo' },
      fuentes: { alturaLibre_m: 'medido' },
    }));
    assert.equal(r.ficha, null);
    assert.match(r.faltan.join(' '), /no es un número/);
  });

  test('los conductores que amarran se cuentan enteros', () => {
    const r = fichaDelBorrador(tecleado({
      valores: { nFasesAmarradas: '3,5' },
      origenes: { nFasesAmarradas: 'levantamiento_campo' },
      fuentes: { nFasesAmarradas: 'contados desde el suelo' },
    }));
    assert.equal(r.ficha, null);
    assert.match(r.faltan.join(' '), /enteros/);
  });
});

describe('la capacidad a lo largo de la línea: los cuatro juntos o ninguno', () => {
  const cuatro = {
    capacidad_valor_kgf: '3600', capacidad_tipo: 'rotura',
    capacidad_alturaReferencia_m: '11', capacidad_fuente: 'catálogo del fabricante, hoja 2',
  };

  test('los cuatro completos entran, y el molde los acepta', () => {
    const r = fichaDelBorrador(tecleado({
      valores: cuatro,
      origenes: { capacidadLongitudinal: 'catalogo_fabricante' },
    }));
    assert.deepEqual(r.faltan, []);
    assert.deepEqual(r.ficha.capacidadLongitudinal, {
      valor_kgf: 3600, tipo: 'rotura', alturaReferencia_m: 11,
      fuente: 'catálogo del fabricante, hoja 2',
    });
    const v = FichaEstructural.safeParse(sellarComoLaSesion(r.ficha));
    assert.equal(v.success, true, v.success ? '' : JSON.stringify(v.error?.issues));
  });

  test('sin TIPO no hay veredicto, y se dice por qué: entre 50 % y 100 % hay un factor 2', () => {
    const r = fichaDelBorrador(tecleado({
      valores: { ...cuatro, capacidad_tipo: '' },
      origenes: { capacidadLongitudinal: 'catalogo_fabricante' },
    }));
    assert.equal(r.ficha, null);
    assert.match(r.faltan.join(' '), /doble de margen/);
  });

  test('sin ALTURA de referencia tampoco entra: el núcleo devolvería null en silencio', () => {
    const r = fichaDelBorrador(tecleado({
      valores: { ...cuatro, capacidad_alturaReferencia_m: '' },
      origenes: { capacidadLongitudinal: 'catalogo_fabricante' },
    }));
    assert.equal(r.ficha, null);
    assert.match(r.faltan.join(' '), /a qué altura vale/);
  });

  test('la FUENTE de la capacidad no se guarda dos veces: va dentro del dato', () => {
    const r = fichaDelBorrador(tecleado({
      valores: cuatro,
      origenes: { capacidadLongitudinal: 'catalogo_fabricante' },
      // Aunque alguien la escribiera también en el sello, no viaja ahí.
      fuentes: { capacidadLongitudinal: 'otra frase distinta' },
    }));
    assert.equal(r.ficha.procedencias.capacidadLongitudinal.fuente, undefined,
      'dos fuentes del mismo hecho pueden decir cosas distintas, y entonces nadie sabe cuál se firmó');
    const v = FichaEstructural.safeParse(sellarComoLaSesion(r.ficha));
    assert.equal(v.success, true, v.success ? '' : JSON.stringify(v.error?.issues));
  });

  test('los tres tipos que se ofrecen son EXACTAMENTE los del contrato', () => {
    assert.deepEqual(
      TIPOS_DE_CAPACIDAD.map((t) => t.valor),
      [...TipoCapacidadLongitudinal.options],
      'ofrecer un tipo que el contrato no admite deja el apoyo sin veredicto sin decir por qué');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3 · LA GEOMETRÍA, MIENTRAS TECLEA Y SOBRE EL APOYO COMPLETO
// ════════════════════════════════════════════════════════════════════════════

describe('la geometría imposible se caza antes de guardar', () => {
  test('el amarre por encima de la punta se avisa aunque la punta venga de la BASE', () => {
    // El caso real: él escribe solo el amarre, y la punta ya estaba guardada.
    // Un aviso que solo mirase el borrador no vería nada.
    const a = apoyo(1, 'B', 'Suspensión', { alturaLibre_m: 11 });
    const avisos = geometriaDelBorrador(a, tecleado({ valores: { alturaAplicacion_m: '12,5' } }));
    assert.equal(avisos.length, 1);
    assert.match(avisos[0].mensaje, /por encima de la punta/);
    assert.equal(avisos[0].clave, 'alturaAplicacion_m',
      'el aviso tiene que señalar el campo que él tendría que mover');
  });

  test('el borrador MANDA sobre lo guardado: corregir la punta quita el aviso', () => {
    const a = apoyo(1, 'B', 'Suspensión', { alturaLibre_m: 11, alturaAplicacion_m: 12.5 });
    assert.deepEqual(geometriaDelBorrador(a, tecleado({ valores: { alturaLibre_m: '14' } })), [],
      'si al declarar la punta a 14 m siguiera avisando, él no sabría cómo salir del bucle');
  });

  test('un número a medio teclear no se juzga', () => {
    const a = apoyo(1, 'B', 'Suspensión', { alturaLibre_m: 11 });
    assert.deepEqual(geometriaDelBorrador(a, tecleado({ valores: { alturaAplicacion_m: '1' } })), [],
      'regañar mientras escribe el primer dígito hace que deje de escribir');
    assert.deepEqual(geometriaDelBorrador(a, tecleado({ valores: { alturaAplicacion_m: 'a' } })), [],
      'lo que no es un número lo dice el otro aviso, no éste');
  });

  test('el apoyo con el borrador encima no toca el apoyo original', () => {
    const a = apoyo(1, 'B', 'Suspensión', { alturaLibre_m: 11 });
    apoyoConBorrador(a, tecleado({ valores: { alturaLibre_m: '14' } }));
    assert.equal(a.alturaLibre_m, 11, 'la función es pura: si mutara, el antes/después mentiría');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4 · QUÉ LE FALTA A ESTE APOYO, ANTES DE ABRIR EL FORMULARIO
// ════════════════════════════════════════════════════════════════════════════

describe('el estado de un apoyo se puede decir sin tocar nada', () => {
  test('un apoyo sin datos no tiene veredicto y se nombra lo que le falta', () => {
    const e = estadoDelApoyo(CONTEXTO, 'ap-1');
    assert.equal(e.apoyo, 'B');
    assert.equal(e.tieneVeredicto, false);
    assert.ok(e.faltaTodavia.length > 0,
      'un apoyo sin veredicto y sin decir qué le falta es un callejón sin salida');
  });

  test('las palabras son las del NÚCLEO, no otras inventadas por la pantalla', () => {
    // La misma lista que la pestaña Cargas enseña en su fila. Si aquí se
    // redactara aparte, las dos pantallas pedirían cosas distintas del mismo
    // apoyo y ninguna de las dos sería la verdad.
    const e = estadoDelApoyo(CONTEXTO, 'ap-1');
    const panel = loQueVaACambiar(CONTEXTO, [{ apoyoId: 'ap-1', ficha: {} }]);
    assert.deepEqual(e.faltaTodavia, panel.filas.find((f) => f.apoyo === 'B').faltaTodavia);
  });

  test('un apoyo que no existe devuelve null, no un estado inventado', () => {
    assert.equal(estadoDelApoyo(CONTEXTO, 'no-existe'), null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5 · APARECER Y DESAPARECER UN VEREDICTO SE CUENTAN LOS DOS
// ════════════════════════════════════════════════════════════════════════════

describe('el panel cuenta también lo que se pierde', () => {
  const completo = {
    alturaLibre_m: 12, alturaAplicacion_m: 11, cargaRotura_kgf: 4000, nFasesAmarradas: 3,
  };

  test('un apoyo que gana veredicto se cuenta y se dice', () => {
    const panel = loQueVaACambiar(CONTEXTO, [{
      apoyoId: 'ap-1',
      ficha: {
        ...completo,
        procedencias: {
          alturaLibre_m: { procedencia: 'levantamiento_campo', fuente: 'medido', declaradoEn: CUANDO, declaradoPor: QUIEN },
        },
      },
    }]);
    assert.ok(panel.resumen.gananVeredicto >= 1, 'ése es el objeto entero de esta ola');
    assert.equal(panel.resumen.pierdenVeredicto, 0);
  });

  test('un apoyo que DEJA de tener veredicto se cuenta, y la frase lo dice', () => {
    // EL CASO REAL, y es alcanzable desde el formulario: B ya dictamina, y él
    // corrige la altura libre a 10 m — por debajo del amarre que ya estaba
    // declarado a 11 m. El motor deja de poder dictaminarlo. Sin este contador,
    // el panel enseñaría un cambio que solo QUITA, y sin una sola cifra que lo
    // nombre.
    const ctx = { ...CONTEXTO, apoyos: LINEA.map((a) => (a.id === 'ap-1' ? { ...a, ...completo } : a)) };
    assert.equal(estadoDelApoyo(ctx, 'ap-1').tieneVeredicto, true,
      'el punto de partida tiene que tener veredicto, o la prueba no prueba nada');

    const panel = loQueVaACambiar(ctx, [{
      apoyoId: 'ap-1',
      ficha: {
        alturaLibre_m: 10,
        procedencias: {
          alturaLibre_m: { procedencia: 'levantamiento_campo', fuente: 'medido de nuevo', declaradoEn: CUANDO, declaradoPor: QUIEN },
        },
      },
    }]);
    assert.equal(panel.resumen.pierdenVeredicto, 1);
    assert.equal(panel.filas.find((f) => f.apoyo === 'B').transversal.despues, 'sin_veredicto');
    assert.match(panel.frases.join(' '), /DEJA de tener/,
      'una pérdida sin frase que la nombre se lee como que no pasó nada');

    // Y el MISMO caso trae su aviso de geometría, que es lo que impide guardarlo:
    // el panel enseña la consecuencia y el aviso enseña la causa.
    assert.equal(panel.avisosGeometria.length, 1);
    assert.match(panel.avisosGeometria[0].avisos[0].mensaje, /por encima de la punta/);
  });

  test('la cifra de los que pierden veredicto existe siempre, aunque sea cero', () => {
    const panel = loQueVaACambiar(CONTEXTO, [{ apoyoId: 'ap-1', ficha: {} }]);
    assert.equal(typeof panel.resumen.pierdenVeredicto, 'number',
      'lo que no tiene número no se mira, y perder un veredicto es lo único que empeora aquí');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6 · LA PANTALLA: sin fórmulas, sin regresiones y sin escribir sin permiso
// ════════════════════════════════════════════════════════════════════════════

const editor = leer('web/src/componentes/FichaEditor.tsx');
const fichas = leer('web/src/componentes/Fichas.tsx');
const linea = leer('web/src/componentes/Linea.tsx');
const enlace = leer('web/src/datos/enlace.ts');

describe('ni una fórmula en la pantalla', () => {
  test('el formulario NO importa del núcleo: el veredicto no se calcula aquí', () => {
    assert.ok(!/@lineas\/nucleo/.test(editor),
      'si la pantalla llamara al motor por su cuenta, habría dos entradas del mismo cálculo');
    assert.ok(!/Math\./.test(editor),
      'cualquier aritmética en el .tsx es una segunda fuente del número que se firma');
  });

  test('lo pide todo al módulo puro, que es su dueño', () => {
    for (const fn of ['fichaDelBorrador', 'geometriaDelBorrador', 'loQueVaACambiar']) {
      assert.ok(editor.includes(fn), `el formulario no usa ${fn}: algo está calculando por su cuenta`);
    }
  });

  test('los seis campos y su prosa salen del catálogo, no escritos a mano', () => {
    assert.ok(editor.includes('CAMPOS_DE_FICHA') && editor.includes('BLOQUES_DE_FICHA'),
      'una lista de campos copiada en el .tsx se desincroniza del contrato en el primer cambio');
    assert.equal(CAMPOS_DE_FICHA.length, 6, 'entran seis campos, ni uno más');
    for (const c of CAMPOS_DE_FICHA) {
      assert.ok(c.queDesbloquea && c.queDesbloquea.length > 10,
        `«${c.clave}» no dice qué desbloquea: sin eso es un campo más que rellenar`);
    }
  });

  test('ningún color escrito a mano en las pantallas de la ficha', () => {
    // La hoja de estilos ya tiene su guardia (`estilo-tokens.test.js`); ésta es
    // la del otro lado: un color en el .tsx se salta el tablero entero.
    for (const [nombre, txt] of [['FichaEditor.tsx', editor], ['Fichas.tsx', fichas]]) {
      const fugas = [...txt.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)].map((m) => m[0]);
      assert.deepEqual(fugas, [], `colores a mano en ${nombre}: ${fugas.join(', ')}`);
    }
  });
});

describe('no se pierde ni una fila de lo que ya se veía', () => {
  test('la ficha de solo lectura conserva sus 38 rótulos', () => {
    // La regla de no-regresión de visibilidad, ejecutada: montar un editor
    // encima de una ficha es exactamente cuando se pierden filas «por sitio».
    const antes = [
      'Nombre canónico', 'Como quedó en el GPS', 'Posición en la línea', 'Tramo de tensión',
      'Función — procedencia', 'Latitud', 'Longitud', 'Cota del terreno (GPS)',
      'Sistema · método', 'Precisión declarada', 'Deflexión', 'Vano anterior', 'Vano siguiente',
      'Vano viento', 'Condición', 'Tipo de apoyo', 'Altura', 'Cota de sujeción',
      'Carga de rotura', 'Altura libre sobre el terreno', 'Altura del punto de sujeción',
      'Año de instalación', 'Código de inventario', 'En servicio', 'Modelo de aislador',
      'Unidades por cadena', 'Fuga por unidad', 'Nivel de contaminación', 'Puesta a tierra',
      'Varillas', 'Resistencia', 'Medida el', 'Identidad (UUID)', 'Revisión', 'Cargado el',
      'Cargado por', 'Última modificación', 'Modificado por',
    ];
    const faltan = antes.filter((r) => !fichas.includes(`<dt>${r}</dt>`));
    assert.deepEqual(faltan, [], `rótulos que la ficha ya enseñaba y han desaparecido: ${faltan.join(', ')}`);
  });

  test('y gana los dos que el contrato admitía y ninguna pantalla enseñaba', () => {
    for (const r of ['Capacidad a lo largo de la línea', 'Conductores que amarran aquí']) {
      assert.ok(fichas.includes(`<dt>${r}</dt>`),
        `${r} se puede guardar y no se ve: un dato invisible es un dato que nadie puede discutir`);
    }
  });

  test('el semáforo de criterios y la galería siguen montados', () => {
    assert.match(fichas, /<FichaCriterios/, 'el semáforo del apoyo no puede desaparecer bajo el editor');
    assert.match(fichas, /<Galeria/, 'las fotos del punto tampoco');
  });

  test('un dato SUPUESTO se marca junto al dato Y junto al veredicto', () => {
    assert.ok(fichas.includes('ficha-supuesto'),
      'sin marca junto al dato, una estimación a ojo se lee como una medida');
    assert.ok(fichas.includes('avisoDeSupuestos'),
      'sin marca junto al veredicto, el dictamen sale limpio sobre un dato que nadie verificó');
  });
});

describe('solo escribe quien tiene permiso, y si no lo tiene se dice', () => {
  test('la ficha se VE sin sesión: leer nunca se bloquea', () => {
    assert.match(fichas, /sesion\?:/,
      'la sesión tiene que ser opcional en Fichas: leer la ficha no exige permiso de escritura');
  });

  test('el botón solo aparece con permiso de edición, y si no, se explica', () => {
    // ⚠️ CAMBIÓ EL CÓMO, NO EL QUÉ (`99 §ADR-100`): se pregunta por la FUNCIÓN
    // del catálogo en vez de comparar el rol. Es la misma que miran las reglas
    // para un apoyo, así que el botón sigue prometiendo exactamente lo que la
    // base va a permitir — que es lo que esta prueba defiende.
    assert.match(fichas, /puede\(sesion, 'apoyos\.editar'\)/,
      'el permiso que se comprueba tiene que ser el mismo que permiten las reglas para un apoyo');
    assert.match(fichas, /se puede ver, pero no escribir/,
      'esconder el botón sin decir por qué se lee como una avería de la aplicación');
  });

  test('el formulario vuelve a comprobarlo antes de encender su propio botón', () => {
    assert.match(editor, /puede\(sesion, 'apoyos\.editar'\)/,
      'dos guardas del mismo hecho: la primera puede quedarse vieja si el permiso cambia');
    assert.match(editor, /disabled=\{!puedeGuardar\}/);
  });

  test('la sesión llega a Fichas desde la vista de línea, como ya llegaba a Cargar', () => {
    assert.match(linea, /<Fichas[\s\S]{0,400}sesion=\{/,
      'sin la sesión, Fichas no puede saber si esta persona puede escribir');
  });
});

describe('guardar no destruye el acuse', () => {
  test('el puente escribe y NO recarga la línea', () => {
    const cuerpo = enlace.slice(enlace.indexOf('async guardarFicha('), enlace.indexOf('async refrescarLinea'));
    assert.ok(cuerpo.includes('guardarFichaApoyo'), 'tiene que delegar en el repositorio');
    assert.ok(!/this\.abrir\(/.test(cuerpo),
      'recargar aquí pondría la app en fase «cargando» y destruiría el acuse en el instante en que se genera');
  });

  test('la línea se relee cuando él lo pide, con un botón que lo dice', () => {
    assert.match(editor, /refrescarLinea/);
    assert.match(editor, /Ver la línea recalculada/);
  });

  test('un fallo al guardar NO borra lo tecleado', () => {
    // Lo mismo que ya se aprendió en el RCA: si un fallo desmontara el
    // formulario, se llevaría por delante todo lo que acaba de escribir.
    const bloque = editor.slice(editor.indexOf('catch (e)'), editor.indexOf('finally'));
    assert.ok(!/setBorrador/.test(bloque),
      'el borrador no se puede vaciar en el camino del fallo: es media mañana de trabajo');
    assert.match(editor, /setFallo\(e instanceof Error \? e\.message/,
      'el motivo entero, tal como llegó: un conflicto de revisión trae la instrucción de qué hacer');
  });
});
