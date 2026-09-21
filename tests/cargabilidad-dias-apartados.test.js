// ============================================================================
// tests/cargabilidad-dias-apartados.test.js — el molde 0.18.0: por qué FALTA un
// día del histórico
// ----------------------------------------------------------------------------
// QUÉ SE PRUEBA. `CargaDeCargabilidad` es el documento que deja constancia de
// una carga: de qué archivos salió cada número. Hasta 0.17.0 anotaba lo que SÍ
// entró y no tenía dónde decir lo que se quedó fuera — y lo que se queda fuera
// no es una anécdota: al preparar LN-617 y LN-628 se apartan 8 y 11 días por
// horas cuyo sello no es «Actual», más un archivo de 2025 que cae fuera del
// periodo. Sin el campo nuevo, dentro de seis meses «¿por qué falta el 26-01?»
// solo se responde volviendo a correr la lectura de sellos sobre unos CSV que
// viven en el disco del Ingeniero.
//
// LAS TRES COSAS QUE VIGILA, y las tres fallan MUDAS si nadie las mira:
//
//   1. **Lo aditivo de verdad.** Una carga escrita ayer, sin `apartados`, tiene
//      que seguir validando igual. `web/src/datos/firestore.ts` valida con
//      `safeParse` y descarta EN SILENCIO lo que no pasa (`32 · L-67`):
//      estrechar este molde por descuido no da error, hace desaparecer el
//      rastro de procedencia de una carga entera.
//   2. **Ausente ≠ vacío.** Una carga sin el campo no dice «no se apartó nada»:
//      dice que no lo declaró. La colección es INMUTABLE (`update: if false`),
//      así que esas cargas no se pueden completar nunca.
//   3. **Un motivo en blanco no es un motivo.** El catálogo es CERRADO como el
//      `MotivoRechazo` de `comunes.ts`, y un día apartado «por el sello» que no
//      dice CUÁL sello no deja revisar la decisión — que es justo para lo que se
//      escribe.
//
// ⚠️ MUNDO SINTÉTICO: línea «LX-1», organización «/SubA» y etiquetas de señal
// inventadas. Este repositorio es PÚBLICO (`CLAUDE.md §3.1`): la ruta del SCADA
// del cliente —subestación, nivel de tensión, bahía— no entra aquí ni de
// ejemplo.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { VERSION_CONTRATO } from '../contratos/src/comunes.ts';
import {
  CargaDeCargabilidad, DIAS_APARTADOS_POR_CARGA, DiaApartado, MOTIVOS_APARTADO,
  ROTULO_MOTIVO_APARTADO,
} from '../contratos/src/cargabilidad.ts';

const AQUI = dirname(fileURLToPath(import.meta.url));

// ── El mundo sintético ──────────────────────────────────────────────────────
const ORG = '/SubA';
const UID = 'uid-de-prueba';
const AHORA = '2026-09-20T12:00:00.000Z';
const ID_CARGA = '33333333-3333-4333-8333-333333333333';

/** Una carga como la que escribe hoy el cargador, SIN el campo nuevo. */
const cargaDeAyer = (extra = {}) => ({
  id: ID_CARGA, orgId: ORG, creadoEn: AHORA, creadoPor: UID, revision: 0,
  nombreArchivo: 'LX-1 · lote 1/17 · 96 archivos de SCADA',
  archivos: ['MAGNITUD_max-20260101.csv', 'MAGNITUD_prom-20260101.csv'],
  cargadoEn: AHORA, cargadoPor: UID,
  filasDelArchivo: 48, registrosGuardados: 48, filasConError: 0,
  mapeo: {}, lineas: ['LX-1'], estadisticos: ['maximo', 'promedio'],
  desde: '2026-01-01', hasta: '2026-01-31', estado: 'guardada',
  ...extra,
});

/** Un día apartado por su sello: el caso que de verdad ocurre. */
const porSello = (fecha = '2026-01-26', extra = {}) => ({
  fecha,
  motivo: 'sello_no_actual',
  sellos: ['Not Renewed'],
  horas: ['03', '04', '05'],
  senalesAfectadas: 3,
  senales: ['SEÑAL SINTÉTICA A', 'SEÑAL SINTÉTICA B', 'SEÑAL SINTÉTICA C'],
  detalle: '3 señal(es) con sello «Not Renewed» ×9 en la(s) hora(s) 3, 4, 5 h',
  ...extra,
});

const vale = (esquema, doc) => {
  const r = esquema.safeParse(doc);
  assert.equal(r.success, true, r.success ? '' : r.error.issues.map((i) => i.message).join(' | '));
  return r.data;
};
const falla = (esquema, doc) => {
  const r = esquema.safeParse(doc);
  assert.equal(r.success, false, 'esto tenía que ser rechazado y pasó');
  return r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' | ');
};

// ════════════════════════════════════════════════════════════════════════════
describe('0.18.0 — la versión, y el aviso que la acompaña', () => {

  test('`VERSION_CONTRATO` dice 0.18.0 — es lo que pinta el pie de la aplicación', () => {
    assert.equal(VERSION_CONTRATO, '0.18.0');
  });

  test('`contratos/package.json` la espeja: se suben juntas o el pie miente', () => {
    const paquete = JSON.parse(readFileSync(join(AQUI, '..', 'contratos', 'package.json'), 'utf-8'));
    assert.equal(paquete.version, VERSION_CONTRATO,
      'el paquete y el código declaran versiones distintas del molde: la que MANDA es '
      + 'VERSION_CONTRATO y el paquete la espeja, así que se suben en el MISMO cambio');
  });

  test('el renglón de cambios existe y NO se olvidó el aviso de dirección única', () => {
    // El aviso es lo único que evita el fallo mudo de 0.5.0/0.6.0/0.9.0: una
    // pantalla con el bundle anterior QUITA el campo nuevo al validar, sin
    // error. Aquí duele el doble, porque la colección no se actualiza: la carga
    // queda escrita PARA SIEMPRE sin su motivo.
    const fuente = readFileSync(join(AQUI, '..', 'contratos', 'src', 'comunes.ts'), 'utf-8');
    const i = fuente.indexOf('0.18.0 — MENOR');
    assert.ok(i > 0, 'la versión 0.18.0 subió sin dejar su renglón de cambios');
    // Se quitan los saltos y los « * » del comentario antes de buscar: una frase
    // puede partirse en dos renglones y seguir estando escrita.
    const renglon = fuente.slice(i, fuente.indexOf('export const VERSION_CONTRATO', i))
      .replace(/\n\s*\*\s?/g, ' ');
    assert.match(renglon, /DIRECCIÓN ÚNICA/i,
      '0.18.0 no declara que es de una sola dirección: es justo el fallo que no da error');
    assert.match(renglon, /ANTES de la primera carga/,
      'falta decir qué hay que hacer ANTES: desplegar y actualizar el cargador');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('lo aditivo de verdad — una carga de hoy sigue validando', () => {

  test('una carga SIN `apartados` vale exactamente igual que ayer', () => {
    const doc = vale(CargaDeCargabilidad, cargaDeAyer());
    assert.equal(doc.estado, 'guardada');
    assert.equal(doc.archivos.length, 2, 'el rastro de procedencia sigue intacto');
  });

  test('⚠️ ausente NO es «no se apartó nada»: es que esa carga no lo dijo', () => {
    const doc = vale(CargaDeCargabilidad, cargaDeAyer());
    assert.equal(doc.apartados, undefined,
      'si esto llegara como [] el molde estaría afirmando que no se apartó ningún día, '
      + 'y las cargas viejas no pueden decir eso: la colección es inmutable');
  });

  test('el campo nuevo no le quita nada a lo que ya se guardaba', () => {
    const doc = vale(CargaDeCargabilidad, cargaDeAyer({ apartados: [porSello()] }));
    assert.deepEqual(doc.estadisticos, ['maximo', 'promedio']);
    assert.equal(doc.desde, '2026-01-01');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el campo nuevo: por qué falta el 26-01', () => {

  test('un día apartado por su sello valida con todo lo que hace falta para revisarlo', () => {
    const doc = vale(CargaDeCargabilidad, cargaDeAyer({ apartados: [porSello()] }));
    const [d] = doc.apartados;
    assert.equal(d.fecha, '2026-01-26');
    assert.equal(d.motivo, 'sello_no_actual');
    assert.deepEqual(d.sellos, ['Not Renewed']);
    assert.deepEqual(d.horas, ['03', '04', '05']);
    assert.equal(d.senalesAfectadas, 3);
    assert.match(d.detalle, /Not Renewed/);
  });

  test('los tres motivos del catálogo valen, y se pueden contar por motivo', () => {
    const apartados = [
      porSello('2026-01-26'),
      { fecha: '2025-12-31', motivo: 'fuera_del_periodo', detalle: 'el periodo pedido empieza el 2026-01-01' },
      { fecha: '2026-02-09', motivo: 'sin_lecturas', detalle: 'ninguna celda del día traía número' },
    ];
    const doc = vale(CargaDeCargabilidad, cargaDeAyer({ apartados }));
    const cuenta = {};
    for (const d of doc.apartados) cuenta[d.motivo] = (cuenta[d.motivo] ?? 0) + 1;
    assert.deepEqual(cuenta, { sello_no_actual: 1, fuera_del_periodo: 1, sin_lecturas: 1 },
      'esto es lo que un catálogo cerrado compra: contar sin leer frases');
    assert.deepEqual([...MOTIVOS_APARTADO], ['sello_no_actual', 'fuera_del_periodo', 'sin_lecturas'],
      'si el catálogo cambia, esta prueba y el rótulo de pantalla se enteran');
  });

  test('el mínimo honesto —fecha y motivo— basta: lo demás es opcional', () => {
    vale(DiaApartado, { fecha: '2025-12-31', motivo: 'fuera_del_periodo' });
  });

  test('cada motivo del catálogo tiene su rótulo: la pantalla no inventa el suyo', () => {
    for (const m of MOTIVOS_APARTADO) {
      assert.equal(typeof ROTULO_MOTIVO_APARTADO[m], 'string', `«${m}» no tiene rótulo`);
      assert.ok(ROTULO_MOTIVO_APARTADO[m].length > 0);
    }
    assert.equal(Object.keys(ROTULO_MOTIVO_APARTADO).length, MOTIVOS_APARTADO.length,
      'sobra un rótulo de un motivo que el catálogo ya no tiene');
  });

  test('⚠️ un día SIN NINGÚN SELLO no cabe aquí: entra al histórico, no se aparta', () => {
    // Los días del 1 al 12 de enero y el 31-05 no traen archivo de calidad.
    // Ninguna de sus horas trae un sello distinto de «Actual», así que ENTRAN.
    // Si el catálogo tuviera un «sin_sello», alguien lo usaría y la base diría
    // que falta un día que sí está — la mentira contraria.
    assert.ok(!MOTIVOS_APARTADO.includes('sin_sello'));
    falla(DiaApartado, { fecha: '2026-01-05', motivo: 'sin_sello' });
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('lo que NO puede pasar', () => {

  test('un motivo VACÍO no es un motivo: no valida', () => {
    const porQue = falla(DiaApartado, { fecha: '2026-01-26', motivo: '' });
    assert.match(porQue, /motivo/);
  });

  test('un motivo inventado tampoco: el catálogo es CERRADO', () => {
    falla(DiaApartado, { fecha: '2026-01-26', motivo: 'no_me_gustaba' });
  });

  test('y sin motivo, menos: un hueco sin explicar es lo que se vino a arreglar', () => {
    falla(DiaApartado, { fecha: '2026-01-26' });
  });

  test('un `detalle` en blanco no vale: parece que alguien lo explicó y no', () => {
    falla(DiaApartado, porSello('2026-01-26', { detalle: '' }));
  });

  test('apartado por el sello SIN decir cuál sello: no se puede revisar, no valida', () => {
    const { sellos, ...sinSello } = porSello();
    const porQue = falla(DiaApartado, sinSello);
    assert.match(porQue, /CUÁL sello/);
    falla(DiaApartado, porSello('2026-01-26', { sellos: [] }));
  });

  test('los otros dos motivos NO exigen sello: no lo tienen', () => {
    vale(DiaApartado, { fecha: '2025-12-31', motivo: 'fuera_del_periodo' });
    vale(DiaApartado, { fecha: '2026-02-09', motivo: 'sin_lecturas' });
  });

  test('más señales nombradas que declaradas: una de las dos cifras miente', () => {
    const porQue = falla(DiaApartado, porSello('2026-01-26', { senalesAfectadas: 2 }));
    assert.match(porQue, /miente/);
  });

  test('una fecha que no es `AAAA-MM-DD` no entra', () => {
    falla(DiaApartado, { fecha: '26-01-2026', motivo: 'fuera_del_periodo' });
  });

  test('una hora fuera de `00`…`23` no entra: son las claves del día', () => {
    falla(DiaApartado, porSello('2026-01-26', { horas: ['24'] }));
    falla(DiaApartado, porSello('2026-01-26', { horas: ['3'] }));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el tope: rechaza, no recorta', () => {

  const unos = (cuantos) => Array.from({ length: cuantos }, (_, i) => ({
    // Fechas sintéticas distintas, que es lo único que la prueba necesita.
    fecha: `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
    motivo: 'sin_lecturas',
  }));

  test('un año entero de días apartados cabe: 366 valen', () => {
    assert.equal(DIAS_APARTADOS_POR_CARGA, 366, 'el tope es un año bisiesto de días');
    const doc = vale(CargaDeCargabilidad, cargaDeAyer({ apartados: unos(DIAS_APARTADOS_POR_CARGA) }));
    assert.equal(doc.apartados.length, DIAS_APARTADOS_POR_CARGA);
  });

  test('uno más NO se recorta en silencio: se rechaza, y el aviso dice qué hacer', () => {
    // Recortar sería lo peor de los dos mundos: el documento se guardaría y
    // seguiría sin explicar los huecos, igual que `archivos` pegados con « + »
    // dejaban de responder «¿de qué archivo salió este número?» (`99 §ADR-113`).
    const porQue = falla(CargaDeCargabilidad, cargaDeAyer({ apartados: unos(DIAS_APARTADOS_POR_CARGA + 1) }));
    assert.match(porQue, /no caben más de 366/);
    assert.match(porQue, /parta la carga por periodo/);
  });
});
