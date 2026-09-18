// ============================================================================
// tests/contrato-levantamiento.test.js — el molde 0.16.0: una torre en dos
// líneas, y el GPS guardado SIN interpretar
// ----------------------------------------------------------------------------
// QUÉ SE PRUEBA. Lo que el contrato ganó en 0.16.0 y, sobre todo, lo que NO
// puede pasar con ello:
//
//   · `Linea.tramosCompartidos` — que una línea RECORRE un tramo compartido.
//     Una declaración no se borra: se CIERRA con fecha y motivo. Y no puede
//     haber dos abiertas del mismo tramo, porque serían dos verdades sobre el
//     mismo trozo y alguien tendría que elegir en silencio.
//   · `Linea.recorridoCompleto` — si lo levantado es la línea entera.
//   · `Apoyo.circuitosTendidos` — cuántos circuitos cuelgan de la torre.
//   · `Levantamiento` — el recorrido del GPS tal cual, con archivo y huella, y
//     **sin una sola interpretación dentro**.
//
// POR QUÉ ESTA PRUEBA IMPORTA MÁS QUE UN COMENTARIO. Las dos formas de fallar
// aquí son mudas:
//
//   1. `web/src/datos/firestore.ts` valida con `safeParse` y **descarta en
//      silencio** lo que no pasa (`32 · L-67`). Estrechar este molde por
//      descuido no da error: hace desaparecer de la pantalla una línea entera,
//      con sus torres.
//   2. Un objeto de Zod que no es `strict` **borra en silencio lo que no
//      conoce**. Si un día un levantamiento colara una función estructural, no
//      habría aviso: habría un dato de ingeniería inventado por un GPS dentro de
//      un documento que respalda un papel firmado. Por eso los campos de
//      interpretación se prohíben con nombre y apellido, y esta prueba lo vigila.
//
// ⚠️ MUNDO SINTÉTICO: línea «LX-1», tramo «TR-9», organización «/SubA» y
// coordenadas inventadas. Los documentos reales de LN-627 solo se leen de la
// bóveda privada, y esas comprobaciones se SALTAN donde la bóveda no está (en
// CI, que es lo esperado): sirven para demostrar que lo ya escrito sigue
// validando, no para meter un byte de cliente en un repositorio público.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Apoyo, Linea, TramoCompartidoEnLinea } from '../contratos/src/activos.ts';
import { VERSION_CONTRATO } from '../contratos/src/comunes.ts';
import { COLECCIONES } from '../contratos/src/index.ts';
import {
  CAMPOS_DE_INTERPRETACION, FechaDeCampo, Levantamiento, PuntoLevantado,
  camposDeInterpretacion, esDiaDelCalendario,
} from '../contratos/src/levantamiento.ts';
import { construirApoyos, construirLinea } from '../herramientas/construir-apoyos.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const leer = (r) => JSON.parse(readFileSync(r, 'utf-8'));

// ── El mundo sintético ──────────────────────────────────────────────────────
const ORG = '/SubA';
const AHORA = '2026-09-17T12:00:00.000Z';
const QUIEN = 'uid-de-prueba';
// UUID v4 inventados. Se escriben a mano para que la prueba no dependa de nada.
const ID_LINEA = '11111111-1111-4111-8111-111111111111';
const ID_TRAMO = '22222222-2222-4222-8222-222222222222';
const ID_OTRO_TRAMO = '33333333-3333-4333-8333-333333333333';
const ID_APOYO = '44444444-4444-4444-8444-444444444444';
const ID_DESDE = '55555555-5555-4555-8555-555555555555';
const ID_HASTA = '66666666-6666-4666-8666-666666666666';
const HUELLA = 'a'.repeat(64);

/** Una línea mínima: exactamente lo que había que poder escribir en 0.15.0. */
const lineaSintetica = (extra = {}) => ({
  id: ID_LINEA,
  orgId: ORG,
  creadoEn: AHORA,
  creadoPor: QUIEN,
  revision: 0,
  tipo: 'linea',
  codigo: 'LX-1',
  nombre: 'Línea LX-1',
  tensionNominal_kV: 34.5,
  circuitos: 2,
  activa: true,
  ...extra,
});

/** Una declaración de tramo compartido, abierta. */
const tramo = (extra = {}) => ({
  id: ID_TRAMO,
  codigo: 'TR-9',
  procedencia: 'documento_proyecto',
  fuente: 'plano inventado para la prueba, rev. 0',
  declaradoEn: AHORA,
  declaradoPor: QUIEN,
  ...extra,
});

/** Un apoyo mínimo, como los que ya están escritos. */
const apoyoSintetico = (extra = {}) => ({
  id: ID_APOYO,
  orgId: ORG,
  creadoEn: AHORA,
  creadoPor: QUIEN,
  revision: 0,
  tipo: 'apoyo',
  lineaId: ID_TRAMO,
  orden: 0,
  tipoPunto: 'Estructura',
  nombreCampo: 'TR-9 A01',
  coordenada: { lat: 1, lon: -70, sistemaReferencia: 'WGS84' },
  funcionEstructural: 'Terminal',
  funcionProcedencia: 'confirmado_humano',
  condicion: 'Sin evaluar',
  activo: true,
  ...extra,
});

const punto = (i = 1, extra = {}) => ({
  nombreCampo: `9 A${String(i).padStart(2, '0')}`,
  lat: 1 + i / 10000,
  lon: -70 - i / 10000,
  ele: 10 + i,
  instante: AHORA,
  ...extra,
});

/** Un levantamiento completo: el GPS tal cual, sin una sola interpretación. */
const levantamientoSintetico = (extra = {}) => ({
  id: '77777777-7777-4777-8777-777777777777',
  orgId: ORG,
  creadoEn: AHORA,
  creadoPor: QUIEN,
  revision: 0,
  tipo: 'levantamiento',
  serieId: ID_TRAMO,
  codigoSerie: 'TR-9',
  fecha: '2026-09-10',
  aparato: 'GPS de mano',
  archivo: { nombre: 'recorrido-inventado.gpx', huella: HUELLA },
  cargadoEn: AHORA,
  cargadoPor: QUIEN,
  puntos: [punto(1), punto(2), punto(3)],
  nota: 'levantado el 10-09-2026 · sin registrar como torres',
  ...extra,
});

const vale = (esquema, doc) => esquema.safeParse(doc).success;
const falla = (esquema, doc) => {
  const r = esquema.safeParse(doc);
  assert.equal(r.success, false, 'esto tenía que ser rechazado y pasó');
  return r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' | ');
};

// ════════════════════════════════════════════════════════════════════════════
describe('0.16.0 — la versión, y el aviso que la acompaña', () => {

  test('`VERSION_CONTRATO` dice 0.16.0 — es lo que pinta el pie de la aplicación', () => {
    assert.equal(VERSION_CONTRATO, '0.16.0');
  });

  test('`contratos/package.json` la espeja: se suben juntas o el pie miente', () => {
    const paquete = leer(join(AQUI, '..', 'contratos', 'package.json'));
    assert.equal(paquete.version, VERSION_CONTRATO);
  });

  test('el renglón de cambios existe y NO se olvidó el aviso de dirección única', () => {
    // El aviso es lo único que evita el fallo mudo de 0.5.0/0.6.0/0.9.0: un
    // navegador con el bundle anterior QUITA el campo nuevo al validar, sin
    // error. Si alguien añade una versión sin este aviso, esto se pone rojo.
    const fuente = readFileSync(join(AQUI, '..', 'contratos', 'src', 'comunes.ts'), 'utf-8');
    const i = fuente.indexOf('0.16.0 — MENOR');
    assert.ok(i > 0, 'la versión 0.16.0 subió sin dejar su renglón de cambios');
    const renglon = fuente.slice(i, fuente.indexOf('export const VERSION_CONTRATO', i));
    assert.match(renglon, /DIRECCIÓN ÚNICA/i,
      '0.16.0 no declara que es de una sola dirección: es justo el fallo que no da error');
    assert.match(renglon, /ANTES de la primera alta/,
      'falta decir qué hay que hacer ANTES: desplegar y recargar los equipos');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('lo aditivo de verdad — lo que ya está escrito sigue valiendo', () => {

  test('una línea SIN ninguno de los campos nuevos vale igual que ayer', () => {
    assert.ok(vale(Linea, lineaSintetica()));
  });

  test('un apoyo SIN `circuitosTendidos` vale: ausente es NO CONSTA, nunca «uno»', () => {
    const r = Apoyo.safeParse(apoyoSintetico());
    assert.equal(r.success, true);
    assert.equal(r.data.circuitosTendidos, undefined);
  });

  test('`recorridoCompleto` ausente NO se rellena solo — no consta es un estado', () => {
    const r = Linea.safeParse(lineaSintetica());
    assert.equal(r.data.recorridoCompleto, undefined);
    assert.equal(Linea.safeParse(lineaSintetica({ recorridoCompleto: false })).data.recorridoCompleto, false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LOS DOCUMENTOS REALES. No se copian aquí: se leen de la bóveda y, si no está,
// la comprobación se salta. Lo que demuestran es que 0.16.0 no dejó fuera nada
// de lo que hay escrito en producción.
// ════════════════════════════════════════════════════════════════════════════
const BOVEDA = join(AQUI, '..', '..', 'brain-private', 'mantenimiento-lineas-at', 'fixtures');
const F_FICHA = join(BOVEDA, 'LN-627-linea.json');
const F_GEOMETRIA = join(BOVEDA, 'LN-627-geometria.json');
const SIN_BOVEDA = !(existsSync(F_FICHA) && existsSync(F_GEOMETRIA)) &&
  'fixtures en la bóveda privada, no disponibles aquí (esperado en CI)';

describe('la línea que YA está en producción valida contra el molde nuevo', () => {

  test('su ficha de línea y su hipótesis siguen validando', { skip: SIN_BOVEDA }, () => {
    const { linea, hipotesis } = construirLinea('LN-627', leer(F_FICHA), { org: ORG, ahora: AHORA });
    const r = Linea.safeParse(linea);
    assert.equal(r.success, true, `la línea de producción dejó de validar: ${JSON.stringify(r.error?.issues)}`);
    assert.equal(r.data.tramosCompartidos, undefined, 'no comparte tramo: el campo tiene que quedar ausente');
    assert.ok(hipotesis, 'la ficha tiene que seguir produciendo su hipótesis');
  });

  test('sus apoyos siguen validando, uno a uno', { skip: SIN_BOVEDA }, () => {
    const { apoyos } = construirApoyos('LN-627', leer(F_GEOMETRIA), [], { org: ORG, ahora: AHORA });
    assert.ok(apoyos.length > 0, 'el levantamiento de la bóveda no produjo ni un apoyo');
    const malos = apoyos
      .map((a) => [a.nombreCampo, Apoyo.safeParse(a)])
      .filter(([, r]) => !r.success);
    assert.equal(malos.length, 0,
      `${malos.length} apoyos de producción dejaron de validar — desaparecerían de la pantalla sin un solo error`);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('tramos compartidos — una torre, dos líneas', () => {

  test('una línea que declara que recorre TR-9 entero vale', () => {
    const r = Linea.safeParse(lineaSintetica({ tramosCompartidos: [tramo()] }));
    assert.equal(r.success, true);
    assert.equal(r.data.tramosCompartidos[0].codigo, 'TR-9');
    assert.equal(r.data.tramosCompartidos[0].desdeApoyoId, undefined,
      'sin desde/hasta significa el tramo ENTERO: no se rellena con nada');
  });

  test('acotado con desde/hasta también vale — el día que una línea entre a mitad', () => {
    assert.ok(vale(Linea, lineaSintetica({
      tramosCompartidos: [tramo({ desdeApoyoId: ID_DESDE, hastaApoyoId: ID_HASTA })],
    })));
  });

  test('una entrada CERRADA vale: la declaración no se borra, se cierra', () => {
    for (const tipo of ['fin', 'correccion']) {
      assert.ok(vale(Linea, lineaSintetica({
        tramosCompartidos: [tramo({
          cierre: { tipo, en: AHORA, por: QUIEN, motivo: 'motivo inventado para la prueba' },
        })],
      })), `el cierre de tipo «${tipo}» tendría que valer`);
    }
  });

  test('un cierre SIN motivo no vale: un hecho fechado sin por qué no se defiende', () => {
    const msg = falla(TramoCompartidoEnLinea, tramo({ cierre: { tipo: 'fin', en: AHORA, por: QUIEN } }));
    assert.match(msg, /motivo/);
  });

  test('un cierre con un tipo inventado no vale — la lista es cerrada a propósito', () => {
    assert.ok(!vale(TramoCompartidoEnLinea, tramo({
      cierre: { tipo: 'anulado', en: AHORA, por: QUIEN, motivo: 'x' },
    })));
  });

  test('DOS entradas abiertas del mismo tramo NO valen: serían dos verdades', () => {
    const msg = falla(Linea, lineaSintetica({ tramosCompartidos: [tramo(), tramo()] }));
    assert.match(msg, /TR-9 está declarado dos veces sin cerrar/);
  });

  test('cerrada + nueva SÍ vale: es la forma correcta de corregir', () => {
    assert.ok(vale(Linea, lineaSintetica({
      tramosCompartidos: [
        tramo({ cierre: { tipo: 'correccion', en: AHORA, por: QUIEN, motivo: 'se acotó el recorrido' } }),
        tramo({ desdeApoyoId: ID_DESDE }),
      ],
    })));
  });

  test('dos tramos DISTINTOS abiertos valen: una línea puede compartir dos trozos', () => {
    assert.ok(vale(Linea, lineaSintetica({
      tramosCompartidos: [tramo(), tramo({ id: ID_OTRO_TRAMO, codigo: 'TR-10' })],
    })));
  });

  test('el código lleva prefijo TR- y va en ASCII', () => {
    assert.ok(vale(TramoCompartidoEnLinea, tramo({ codigo: 'TR-9' })));
    for (const malo of ['9', 'LN-9', 'tr-9', 'TR 9', 'TR-Ñ9', 'TR-', 'TR-9 bis']) {
      assert.ok(!vale(TramoCompartidoEnLinea, tramo({ codigo: malo })),
        `«${malo}» no puede pasar por código de tramo compartido`);
    }
  });

  test('una clave mal escrita se RECHAZA, no se guarda a medias', () => {
    // `desdeApoyold` con ele minúscula: guardado en silencio dejaría fuera medio
    // tramo del informe y nadie lo vería.
    const msg = falla(TramoCompartidoEnLinea, { ...tramo(), desdeApoyold: ID_DESDE });
    assert.match(msg, /desdeApoyold/);
  });

  test('sin `declaradoEn` / `declaradoPor` no vale: es un hecho fechado y con autor', () => {
    const { declaradoEn, ...sinFecha } = tramo();
    assert.ok(!vale(TramoCompartidoEnLinea, sinFecha));
    const { declaradoPor, ...sinAutor } = tramo();
    assert.ok(!vale(TramoCompartidoEnLinea, sinAutor));
  });

  test('más de 20 tramos compartidos no valen: eso es una carga mal hecha', () => {
    const muchos = Array.from({ length: 21 }, (_, i) => tramo({
      id: `${String(i + 1).padStart(8, '0')}-1111-4111-8111-111111111111`,
      codigo: `TR-${i + 1}`,
    }));
    assert.ok(!vale(Linea, lineaSintetica({ tramosCompartidos: muchos })));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('circuitosTendidos — lo que cuelga de la torre, no de la línea', () => {

  test('vale con su número y su sello', () => {
    const r = Apoyo.safeParse(apoyoSintetico({
      circuitosTendidos: {
        n: 2, procedencia: 'levantamiento_campo',
        fuente: 'recorrido inventado del 10-09', declaradoEn: AHORA, declaradoPor: QUIEN,
      },
    }));
    assert.equal(r.success, true);
    assert.equal(r.data.circuitosTendidos.n, 2);
  });

  test('la fuente puede faltar en lectura; la fecha y el autor NO', () => {
    assert.ok(vale(Apoyo, apoyoSintetico({
      circuitosTendidos: { n: 1, procedencia: 'documento_proyecto', declaradoEn: AHORA, declaradoPor: QUIEN },
    })));
    assert.ok(!vale(Apoyo, apoyoSintetico({
      circuitosTendidos: { n: 1, procedencia: 'documento_proyecto', declaradoPor: QUIEN },
    })));
  });

  test('cero, negativo o con decimales no es un dato: es un error de captura', () => {
    for (const n of [0, -1, 1.5]) {
      assert.ok(!vale(Apoyo, apoyoSintetico({
        circuitosTendidos: { n, procedencia: 'documento_proyecto', declaradoEn: AHORA, declaradoPor: QUIEN },
      })), `n = ${n} no puede pasar`);
    }
  });

  test('una clave de más se rechaza', () => {
    assert.ok(!vale(Apoyo, apoyoSintetico({
      circuitosTendidos: {
        n: 2, procedencia: 'documento_proyecto', declaradoEn: AHORA, declaradoPor: QUIEN,
        circuitos: 2,
      },
    })));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('levantamiento — el GPS tal cual, y NADA interpretado', () => {

  test('un levantamiento completo vale', () => {
    const r = Levantamiento.safeParse(levantamientoSintetico());
    assert.equal(r.success, true, JSON.stringify(r.error?.issues));
    assert.equal(r.data.puntos.length, 3);
  });

  test('sin archivo, sin huella o con una huella que no es SHA-256, no vale', () => {
    const { archivo, ...sinArchivo } = levantamientoSintetico();
    assert.ok(!vale(Levantamiento, sinArchivo));
    assert.ok(!vale(Levantamiento, levantamientoSintetico({ archivo: { nombre: 'x.gpx' } })));
    assert.ok(!vale(Levantamiento, levantamientoSintetico({ archivo: { nombre: 'x.gpx', huella: 'ABC' } })));
    assert.ok(!vale(Levantamiento, levantamientoSintetico({
      archivo: { nombre: 'x.gpx', huella: HUELLA.toUpperCase() },
    })), 'la huella va en minúsculas: dos grafías del mismo archivo no son el mismo archivo');
  });

  test('la fecha del levantamiento es un DÍA, no un instante', () => {
    assert.ok(vale(Levantamiento, levantamientoSintetico({ fecha: '2026-09-10' })));
    assert.ok(!vale(Levantamiento, levantamientoSintetico({ fecha: AHORA })));
    assert.ok(!vale(Levantamiento, levantamientoSintetico({ fecha: '10-09-2026' })));
  });

  // ──────────────────────────────────────────────────────────────────────────
  // LA FECHA QUE NO EXISTE. Antes solo se miraba la FORMA, con un comentario que
  // decía «que el día exista lo mira quien lo use» — y no lo miraba nadie. Lo que
  // costaba: esa fecha entra en el identificador permanente del recorrido
  // (`herramientas/identidad.mjs §semillaDeLevantamiento`), el documento no se
  // puede borrar, su fecha no se puede reescribir —la regla solo deja mover la
  // nota— y la lista se ordena por TEXTO. Un «9999-…» se quedaría para siempre
  // arriba como el recorrido más reciente, y no habría forma de corregirlo.
  // ──────────────────────────────────────────────────────────────────────────
  test('EL 31 DE FEBRERO NO ES UNA FECHA: los tres casos que pasaban, ahora no', () => {
    for (const imposible of ['2026-02-31', '2026-13-01', '0000-99-99']) {
      assert.ok(!vale(Levantamiento, levantamientoSintetico({ fecha: imposible })),
        `«${imposible}» se coló como día de jornada y quedaría en un id que no se puede borrar`);
      assert.ok(!vale(FechaDeCampo, imposible));
    }
    const msg = falla(Levantamiento, levantamientoSintetico({ fecha: '2026-02-31' }));
    assert.match(msg, /no existe en el calendario/,
      'el rechazo tiene que leerse en castellano: quien lo lee no programa');
  });

  test('y ninguna otra fecha imposible — mes 00, día 00, día 32, 31 de un mes de 30', () => {
    for (const imposible of [
      '2026-00-10', '2026-09-00', '2026-01-32', '2026-04-31', '2026-06-31',
      '2026-09-31', '2026-11-31', '2026-02-30',
    ]) {
      assert.ok(!vale(FechaDeCampo, imposible), `«${imposible}» no es un día del calendario`);
    }
  });

  test('los días REALES siguen valiendo, bisiestos incluidos — no se apretó de más', () => {
    // El riesgo del arreglo es el contrario: rechazar una jornada buena y dejar al
    // Ingeniero sin poder cargar lo que recorrió.
    for (const real of [
      '2026-09-10', '2026-01-31', '2026-02-28', '2024-02-29', '2000-02-29',
      '2026-04-30', '2026-12-31', '0001-01-01',
    ]) {
      assert.ok(vale(FechaDeCampo, real), `«${real}» es un día real y tiene que pasar`);
    }
    // Los siglos: 2100 y 1900 NO son bisiestos; 2000 sí. Es la regla del 400, y se
    // cuenta a mano porque `new Date` convierte los años de dos cifras en 19xx.
    assert.ok(!vale(FechaDeCampo, '2100-02-29'));
    assert.ok(!vale(FechaDeCampo, '1900-02-29'));
    assert.ok(vale(FechaDeCampo, '2000-02-29'));
    assert.ok(esDiaDelCalendario('0000-02-29'),
      'el año 0 SÍ es bisiesto (0 % 400 === 0); con `new Date` saldría 1900 y diría que no');
    assert.ok(!esDiaDelCalendario('2026-2-9'), 'la forma sigue mandando: sin cero delante no vale');
    for (const noEsTexto of [undefined, null, 20260910, {}, []]) {
      assert.ok(!esDiaDelCalendario(noEsTexto), `«${String(noEsTexto)}» no es una fecha`);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // LA NOTA DE UN PUNTO. La pantalla del alta promete anotar punto por punto —«la
  // R es anotación suya; la placa dice E16»— y el molde solo tenía la nota del
  // documento entero, que con 28 puntos obliga a adivinar de cuál habla.
  // ──────────────────────────────────────────────────────────────────────────
  test('un punto puede llevar SU nota, y el documento sigue llevando la suya', () => {
    const r = Levantamiento.safeParse(levantamientoSintetico({
      puntos: [punto(1, { nota: 'la R es anotacion mia; la placa dice A16' }), punto(2)],
    }));
    assert.equal(r.success, true, JSON.stringify(r.error?.issues));
    assert.equal(r.data.puntos[0].nota, 'la R es anotacion mia; la placa dice A16');
    assert.equal(r.data.puntos[1].nota, undefined, 'sin nota es sin nota: no se rellena con vacío');
  });

  test('la nota del punto es ADITIVA: un punto sin ella vale exactamente como ayer', () => {
    const r = PuntoLevantado.safeParse(punto(1));
    assert.equal(r.success, true);
    assert.equal(r.data.nota, undefined);
  });

  test('es una anotación de campo, no un informe: 200 caracteres y texto', () => {
    assert.ok(vale(PuntoLevantado, punto(1, { nota: 'x'.repeat(200) })));
    assert.ok(!vale(PuntoLevantado, punto(1, { nota: 'x'.repeat(201) })),
      '500 puntos con nota larga acercarían el documento al tope de 1 MiB de Firestore');
    assert.ok(!vale(PuntoLevantado, punto(1, { nota: 42 })));
    assert.ok(!vale(PuntoLevantado, punto(1, { nota: { texto: 'algo' } })));
  });

  test('LA NOTA NO ES UNA RENDIJA: las seis prohibiciones siguen en pie con nota puesta', () => {
    // El peligro real de abrir un campo de texto en este documento: que se use para
    // colar al lado lo que el molde prohíbe. Se comprueba con la nota puesta, que
    // es como llegaría.
    for (const campo of CAMPOS_DE_INTERPRETACION) {
      const valor = campo === 'orden' || campo === 'deflexion_grados' ? 1 : 'lo que sea';
      assert.ok(!vale(PuntoLevantado, punto(1, { nota: 'anotacion de campo', [campo]: valor })),
        `«${campo}» se coló acompañado de una nota`);
    }
  });

  test('UN PUNTO SIN lat o sin lon NO vale — es lo único que hace punto a un punto', () => {
    const { lat, ...sinLat } = punto(1);
    const msgLat = falla(Levantamiento, levantamientoSintetico({ puntos: [sinLat, punto(2)] }));
    assert.match(msgLat, /puntos\.0\.lat/);

    const { lon, ...sinLon } = punto(1);
    const msgLon = falla(Levantamiento, levantamientoSintetico({ puntos: [sinLon] }));
    assert.match(msgLon, /puntos\.0\.lon/);

    // Y fuera del mundo tampoco: una latitud de 91 grados no existe.
    assert.ok(!vale(PuntoLevantado, punto(1, { lat: 91 })));
    assert.ok(!vale(PuntoLevantado, punto(1, { lon: -181 })));
  });

  test('500 puntos valen; 501 no — un recorrido más largo son VARIAS jornadas', () => {
    const quinientos = Array.from({ length: 500 }, (_, i) => punto(i + 1));
    assert.ok(vale(Levantamiento, levantamientoSintetico({ puntos: quinientos })));
    assert.ok(!vale(Levantamiento, levantamientoSintetico({ puntos: [...quinientos, punto(501)] })));
  });

  test('cero puntos no es un levantamiento', () => {
    assert.ok(!vale(Levantamiento, levantamientoSintetico({ puntos: [] })));
  });

  test('UN PUNTO QUE TRAE FUNCIÓN ESTRUCTURAL NO VALE, y lo dice en castellano', () => {
    const msg = falla(Levantamiento, levantamientoSintetico({
      puntos: [punto(1, { funcionEstructural: 'Retención / anclaje' })],
    }));
    assert.match(msg, /puntos\.0\.funcionEstructural/);
    assert.match(msg, /sin interpretar/);
    assert.match(msg, /REGISTRAR la torre/);
  });

  test('tampoco el orden, ni el nombre canónico, ni el tipo de punto', () => {
    for (const campo of CAMPOS_DE_INTERPRETACION) {
      const valor = campo === 'orden' || campo === 'deflexion_grados' ? 1 : 'lo que sea';
      assert.ok(!vale(PuntoLevantado, punto(1, { [campo]: valor })),
        `«${campo}» es interpretación: no puede viajar dentro de un levantamiento`);
      assert.ok(!vale(Levantamiento, levantamientoSintetico({ [campo]: valor })),
        `«${campo}» tampoco puede colarse en la cabecera del levantamiento`);
    }
  });

  test('una clave desconocida en el punto se rechaza, no se guarda a medias', () => {
    assert.ok(!vale(PuntoLevantado, punto(1, { nombrecampo: 'minúscula' })));
  });

  test('`camposDeInterpretacion` nombra en castellano lo que sobra, para avisar ANTES', () => {
    const lista = camposDeInterpretacion({ lat: 1, lon: -70, funcionEstructural: 'Terminal', orden: 3 });
    assert.equal(lista.length, 2);
    assert.match(lista.join(' · '), /función estructural/);
    assert.match(lista.join(' · '), /posición del punto/);
    assert.deepEqual(camposDeInterpretacion(punto(1)), [],
      'un punto limpio no puede dar falsos positivos');
    assert.deepEqual(camposDeInterpretacion(null), []);
  });

  test('el aviso y el molde cortan por el MISMO sitio, y `null` es donde no lo hacían', () => {
    // El caso concreto: un lector de GPX que ponga `orden: null` en los puntos sin
    // numerar. Con el corte anterior (`!= null`) el aviso decía «nada que avisar» y
    // el guardado se caía después, con un mensaje que el aviso nunca predijo.
    assert.deepEqual(camposDeInterpretacion({ orden: null }).length, 1,
      '`null` es un valor, y el molde lo rechaza: el aviso tiene que decirlo antes');
    assert.equal(vale(PuntoLevantado, punto(1, { orden: null })), false);

    // Y al revés: ausente es ausente. `z.never().optional()` acepta `undefined`, así
    // que avisar de él sería un falso positivo que enseña un error donde no lo hay.
    assert.deepEqual(camposDeInterpretacion({ orden: undefined }), []);
    assert.equal(vale(PuntoLevantado, punto(1, { orden: undefined })), true);

    // La comprobación entera, campo por campo: lo que avisa es lo que rechaza.
    for (const campo of CAMPOS_DE_INTERPRETACION) {
      for (const valor of [null, 1, 'texto', false]) {
        assert.equal(
          camposDeInterpretacion({ [campo]: valor }).length === 1,
          !vale(PuntoLevantado, punto(1, { [campo]: valor })),
          `«${campo}» con «${String(valor)}»: el aviso y el molde discrepan`,
        );
      }
    }
  });

  test('el código de la serie va en ASCII: viaja en nombres de archivo', () => {
    assert.ok(vale(Levantamiento, levantamientoSintetico({ codigoSerie: 'LX-1' })));
    assert.ok(!vale(Levantamiento, levantamientoSintetico({ codigoSerie: 'TR 9' })));
    assert.ok(!vale(Levantamiento, levantamientoSintetico({ codigoSerie: 'TR-9 · compartido' })));
  });

  test('el documento NO es `strict`: un campo futuro no lo hace desaparecer entero', () => {
    // Al revés que el punto, y a propósito: lo que se LEE no puede evaporarse en
    // silencio contra los bundles ya desplegados (`32 · L-67`). Lo que había que
    // impedir —la interpretación— está impedido con nombre y apellido.
    const r = Levantamiento.safeParse(levantamientoSintetico({ campoDelFuturo: 'algo' }));
    assert.equal(r.success, true);
    assert.equal(r.data.campoDelFuturo, undefined);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL CATÁLOGO DE COLECCIONES CONTRA LAS REGLAS DE LA BASE
// ----------------------------------------------------------------------------
// QUÉ PASÓ, que es la razón de que esta prueba exista. `levantamientos` tenía su
// molde, su regla en `firestore.rules` y su índice, y NO estaba en `COLECCIONES`
// (`contratos/src/index.ts`). Nadie se enteró porque nada cruzaba las dos listas:
// el catálogo es prosa que ningún código ejecuta, así que un hueco ahí no se cae
// por ningún sitio — se descubre el día que alguien lo lee para decidir algo.
//
// SE CRUZA EN LAS DOS DIRECCIONES porque los dos huecos duelen, y de forma
// distinta:
//
//   · Con regla y sin fila: una puerta abierta que el catálogo no conoce. Quien
//     lea `COLECCIONES` para saber qué guarda el sistema —o quién puede
//     escribirlo— se llevará una respuesta incompleta y la creerá completa.
//   · Con fila y sin regla: una promesa de un sitio donde no se puede escribir
//     nada. `match /{document=**}` cierra todo lo no declarado, así que la
//     aplicación fallaría con «permission denied» en una colección que el
//     contrato dice que existe.
//
// Este archivo NO es el dueño de las reglas; es el dueño del molde. La prueba
// vive aquí porque `levantamientos` es la colección que faltaba y este es su
// archivo. `tests/reglas/permisos.reglas.mjs` tiene sus propias listas y cubre
// otra cosa: que el espectador no escriba en ninguna. Son guardianes distintos.
// ════════════════════════════════════════════════════════════════════════════
describe('COLECCIONES — el catálogo y las reglas dicen lo mismo, en las dos direcciones', () => {

  const REGLAS = readFileSync(join(AQUI, '..', 'firestore.rules'), 'utf-8');

  /**
   * Las colecciones que gobierna `firestore.rules`.
   *
   * El patrón coge `match /<nombre>/` sin exigir que lo siguiente sea `{`, así que
   * también cuenta las declaradas con un documento fijo —`match /config/arranque`—
   * y no solo `match /config/{docId}`. `databases` es el envoltorio
   * `match /databases/{database}/documents`, no una colección: se descuenta a
   * mano y se dice, para que nadie lo confunda con una exclusión de conveniencia.
   * `match /{document=**}` no entra: empieza por `{`, no por un nombre.
   */
  const enReglas = [...new Set([...REGLAS.matchAll(/^\s*match \/([a-z_]+)\//gm)].map((m) => m[1]))]
    .filter((c) => c !== 'databases')
    .sort();

  const enCatalogo = Object.keys(COLECCIONES).sort();

  test('el patrón lee de verdad las reglas — si esto falla, lo demás pasa en falso', () => {
    // Un guardián que compara dos listas vacías está siempre verde. Se fija el
    // suelo y se comprueban tres nombres con los ojos.
    assert.ok(enReglas.length >= 20, `se leyeron ${enReglas.length} colecciones: revisar el patrón`);
    for (const esperada of ['lineas', 'apoyos', 'levantamientos', 'config']) {
      assert.ok(enReglas.includes(esperada), `el patrón no vio «${esperada}» en firestore.rules`);
    }
  });

  test('TODA colección con regla está declarada en el catálogo', () => {
    const sinDeclarar = enReglas.filter((c) => !enCatalogo.includes(c));
    assert.deepEqual(sinDeclarar, [],
      `estas colecciones tienen regla en la base y NO están en COLECCIONES: ${sinDeclarar.join(', ')}. ` +
      'Es una puerta que el catálogo no conoce: quien lo lea para saber quién puede escribir qué, se llevará una respuesta incompleta.');
  });

  test('y TODA fila del catálogo tiene su regla', () => {
    const sinRegla = enCatalogo.filter((c) => !enReglas.includes(c));
    assert.deepEqual(sinRegla, [],
      `estas filas del catálogo no tienen regla en firestore.rules: ${sinRegla.join(', ')}. ` +
      '`match /{document=**}` cierra todo lo no declarado, así que escribir ahí fallaría con «permission denied».');
  });

  test('`levantamientos` está, y con el permiso que la regla hace cumplir', () => {
    // El hueco concreto que originó esta prueba, fijado con nombre y apellido para
    // que quitarlo tenga que ser una decisión y no un descuido.
    assert.equal(COLECCIONES.levantamientos.escribeCliente, 'campos_limitados',
      'lo crea quien carga puntos, pero después solo se puede mover la nota: ni un punto se reescribe');
  });

  test('cada fila declara su `escribeCliente`, y de un vocabulario cerrado', () => {
    // Un valor inventado no rompe nada hoy —nadie ejecuta este catálogo— y por eso
    // mismo se vigila: sería una promesa de seguridad que nadie contrasta.
    const VOCABULARIO = [
      'rol_editor', 'rol_cuadrilla', 'solo_admin', 'campos_limitados',
      'solo_decision', 'solo_servidor', 'nadie',
    ];
    for (const [nombre, fila] of Object.entries(COLECCIONES)) {
      assert.ok(VOCABULARIO.includes(fila.escribeCliente),
        `«${nombre}» declara «${fila.escribeCliente}», que no está en el vocabulario del catálogo`);
    }
  });
});
