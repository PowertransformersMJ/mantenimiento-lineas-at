// ============================================================================
// tests/evidencias-por-nombre.test.js — la foto se cuelga del NOMBRE, no del sitio
// ----------------------------------------------------------------------------
// LA REGLA QUE DEFIENDE ESTE ARCHIVO, en una frase:
//
//     La foto se cuelga del apoyo cuyo `nombreNormalizado` es exactamente el
//     nombre canónico que su CARPETA declara en el mapa. Nunca por posición.
//
// POR QUÉ IMPORTA TANTO. El enlace entre un apoyo y sus fotos es un solo campo
// (`Evidencia.apoyoId`) y `firestore.rules` PROHÍBE borrar una evidencia: sólo
// deja corregir el pie y el estado de subida, nunca de qué apoyo cuelga. Una
// foto mal asignada no se puede deshacer. Lo único barato que hay antes del
// error es esto: una prueba y una tabla enseñada antes de escribir nada.
//
// LOS CUATRO FALLOS QUE ESTAS PRUEBAS CIERRAN, y los cuatro se verificaron
// CORRIENDO el intento anterior contra los datos reales, no leyéndolo:
//
//   1. EL ESLABÓN SUELTO. `resolverCarpetas` estaba escrito y probado y no lo
//      llamaba NADIE: el guion leía del índice un campo `nombreCanonico` que el
//      índice no tiene. Salida real: 205 paradas idénticas, siempre.
//   2. EL GUARDIÁN QUE SALTABA CON LA CORRIDA BUENA. El control
//      anti-transposición miraba el orden en que APARECÍAN LOS ARCHIVOS. Las
//      fotos de un registro van ordenadas por nombre de archivo en una carpeta
//      plana; eso no es un recorrido. Salida real: 1 falso positivo sobre 28.
//   3. EL ARGUMENTO MAL ESCRITO QUE APAGABA LA ASIGNACIÓN EN SILENCIO.
//   4. REVISAR EXIGÍA LA LLAVE MAESTRA.
//
// MUNDO SINTÉTICO, Y NO ES UN CAPRICHO. Aquí no hay ni un nombre de carpeta
// real, ni un nombre de archivo real, ni una coordenada, ni el nombre de
// ninguna instalación. La línea «LX-000», sus torres y sus carpetas están
// inventadas para esta prueba. El motivo es doble: este repositorio es PÚBLICO,
// y en los nombres de archivo del registro real va la hora de captura
// (`33 · L-50`). Además así la prueba corre en CI, que es exactamente donde la
// bóveda no está montada.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  MIME, FORMA_DE_CLAVE, claveDeObjeto, clasificarArchivos, describirProblema,
  prepararReparto, repartirEvidencias, resolverCarpetas,
} from '@lineas/importar/evidencias';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const fuente = (r) => readFileSync(join(RAIZ, r), 'utf-8');

// ── El mundo inventado ──────────────────────────────────────────────────────
//
// Una línea de seis puntos con un empalme INTERCALADO, que es lo que rompe
// cualquier aritmética de posiciones: los `orden` son 0, 1, 2, 2.5, 3, 4.
const APOYOS = [
  { id: 'aaaaaaaa-0000-4000-8000-000000000001', nombreNormalizado: 'LX-000 T01', nombreCampo: 'T1', orden: 0, tipoPunto: 'Estructura' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000002', nombreNormalizado: 'LX-000 T02', nombreCampo: 'T2', orden: 1, tipoPunto: 'Estructura' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000003', nombreNormalizado: 'LX-000 T03', nombreCampo: 'T3', orden: 2, tipoPunto: 'Estructura' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000004', nombreNormalizado: 'LX-000 EMP T03-T04', nombreCampo: 'EMPX', orden: 2.5, tipoPunto: 'Empalme' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000005', nombreNormalizado: 'LX-000 T04', nombreCampo: 'T4', orden: 3, tipoPunto: 'Estructura' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000006', nombreNormalizado: 'LX-000 PORTICO FIN', nombreCampo: 'PF', orden: 4, tipoPunto: 'Estructura' },
];

/** El mapa, EN ORDEN DE RECORRIDO — que es lo único contra lo que se comprueba. */
const MAPA = {
  _nota: 'inventado para esta prueba',
  linea: 'LX-000',
  carpetas: [
    { carpeta: 'C1', nombreCanonico: 'LX-000 T01', yaCargado: true },
    { carpeta: 'C2', nombreCanonico: 'LX-000 T02', yaCargado: true },
    { carpeta: 'C3', nombreCanonico: 'LX-000 T03' },
    { carpeta: 'CEMP', nombreCanonico: 'LX-000 EMP T03-T04' },
    { carpeta: 'C4', nombreCanonico: 'LX-000 T04' },
    { carpeta: 'CFIN', nombreCanonico: 'LX-000 PORTICO FIN' },
  ],
};

const h = (n) => String(n).padStart(2, '0').repeat(32).slice(0, 64);

/**
 * El índice del registro, tal como lo deja el extractor de la bóveda: CARPETA y
 * archivo. ⚠️ NO trae `nombreCanonico` — ése es exactamente el campo que el
 * intento anterior leía y que no existe.
 *
 * Y los archivos van MEZCLADOS, ordenados por nombre como en una carpeta plana:
 * el orden en que aparecen NO es el del recorrido. Es la trampa del fallo nº 2.
 */
const INDICE = [
  { archivo: 'z-01.jpg', carpeta: 'CFIN', sha256: h(1), bytes: 100 },
  { archivo: 'z-02.jpg', carpeta: 'C1', sha256: h(2), bytes: 100 },
  { archivo: 'z-03.jpg', carpeta: 'C3', sha256: h(3), bytes: 100 },
  { archivo: 'z-04.jpg', carpeta: 'C2', sha256: h(4), bytes: 100 },
  { archivo: 'z-05.jpg', carpeta: 'CEMP', sha256: h(5), bytes: 100 },
  { archivo: 'z-06.jpg', carpeta: 'C4', sha256: h(6), bytes: 100 },
  { archivo: 'z-07.jpg', carpeta: 'C1', sha256: h(7), bytes: 100 },
];

const preparar = (extra = {}) => prepararReparto({
  mapa: MAPA, entradas: INDICE, apoyos: APOYOS,
  codigoLinea: 'LX-000', origen: 'registro-inventado', ...extra,
});

// ════════════════════════════════════════════════════════════════════════════
describe('LA CADENA COMPLETA — archivo → carpeta → nombre canónico → apoyo', () => {
  test('de punta a punta, sin una sola parada', () => {
    const r = preparar();
    assert.deepEqual(r.problemas.map(describirProblema), [],
      'la corrida buena no puede producir ni una parada');
    assert.equal(r.asignaciones.length, 7);
    assert.equal(r.resumen.puntos, 6);
  });

  test('EL ESLABÓN QUE FALTABA: el índice NO trae el nombre del punto, y la cadena lo resuelve igual', () => {
    // Éste es el fallo nº 1, escrito como prueba. Si alguien vuelve a leer el
    // canónico del índice, esto se pone rojo con siete `foto-sin-canonico`.
    for (const fila of INDICE) {
      assert.equal('nombreCanonico' in fila, false,
        'el índice de la bóveda declara la CARPETA, nunca el punto: si alguien mete ahí el canónico, la cadena se está saltando el mapa');
    }
    const r = preparar();
    assert.equal(r.problemas.filter((p) => p.clase === 'foto-sin-canonico').length, 0);
    const dosDeC1 = r.asignaciones.filter((a) => a.carpeta === 'C1');
    assert.equal(dosDeC1.length, 2);
    for (const a of dosDeC1) assert.equal(a.nombreCanonico, 'LX-000 T01');
  });

  test('se copia el `id` del apoyo que YA está en la base — no se recalcula ninguno', () => {
    const r = preparar();
    for (const a of r.asignaciones) {
      const apoyo = APOYOS.find((x) => x.nombreNormalizado === a.nombreCanonico);
      assert.equal(a.apoyoId, apoyo.id, 'el id sale del documento leído, tal cual');
    }
  });

  test('un empalme queda MARCADO como lo que es: no es un apoyo', () => {
    const r = preparar();
    const emp = r.asignaciones.find((a) => a.carpeta === 'CEMP');
    assert.equal(emp.esEmpalme, true);
    assert.equal(r.resumen.enEmpalmes, 1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('EL CONTROL ANTI-TRANSPOSICIÓN — mira el mapa, no el orden de los archivos', () => {
  test('LA CORRIDA BUENA NO SALTA, aunque los archivos lleguen desordenados', () => {
    // Éste es el fallo nº 2. Los archivos del índice están en orden de NOMBRE
    // (CFIN primero, C1 después…), que es lo que pasa en una carpeta plana. El
    // guardián anterior daba aquí un falso positivo; éste tiene que callar.
    const r = preparar();
    assert.equal(r.problemas.filter((p) => p.clase === 'secuencia-rota').length, 0,
      'un guardián que grita con la corrida buena se acaba apagando, y entonces no guarda nada');
  });

  test('DOS FILAS CRUZADAS EN EL MAPA sí saltan — que es lo único que el nombre no delata', () => {
    // El mapa casa, los apoyos existen, no hay ningún error de nombre: sólo la
    // SECUENCIA delata que alguien intercambió dos filas.
    const cruzado = { ...MAPA, carpetas: MAPA.carpetas.map((f) => ({ ...f })) };
    const a = cruzado.carpetas[2].nombreCanonico;   // T03
    cruzado.carpetas[2].nombreCanonico = cruzado.carpetas[4].nombreCanonico;  // T04
    cruzado.carpetas[4].nombreCanonico = a;

    const r = preparar({ mapa: cruzado });
    const rotas = r.problemas.filter((p) => p.clase === 'secuencia-rota');
    assert.ok(rotas.length >= 1, 'dos filas cruzadas tienen que delatarse por la secuencia');
    assert.match(describirProblema(rotas[0]), /cruzadas/);
  });

  test('SIN ORDEN DECLARADO se PARA — un control no se apaga por un argumento olvidado', () => {
    // La lección del `--origen` mal escrito, aplicada al emparejador: falla
    // cerrado. Antes, olvidar un argumento desactivaba la comprobación entera
    // sin un solo aviso.
    const r = repartirEvidencias(
      [{ archivo: 'a.jpg', carpeta: 'C1', nombreCanonico: 'LX-000 T01' }],
      APOYOS, {},
    );
    assert.ok(r.problemas.some((p) => p.clase === 'orden-no-declarado'));
    assert.match(describirProblema({ clase: 'orden-no-declarado' }), /no se sube nada/i);
  });

  test('la tabla sale en el ORDEN DEL MAPA, no en el de los archivos', () => {
    const r = preparar();
    assert.deepEqual(r.grupos.map((g) => g.carpeta), ['C1', 'C2', 'C3', 'CEMP', 'C4', 'CFIN']);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('LAS PARADAS — se dice y no se adivina', () => {
  test('una carpeta que el mapa no nombra PARA la subida entera', () => {
    const r = preparar({ entradas: [...INDICE, { archivo: 'z-08.jpg', carpeta: 'CX', sha256: h(8), bytes: 9 }] });
    const p = r.problemas.find((x) => x.clase === 'carpeta-no-declarada');
    assert.ok(p, 'una carpeta sin destino declarado no se adivina');
    assert.match(describirProblema(p), /desfase anterior/);
  });

  test('un punto que no está en la base PARA la subida: una foto colgada de la nada no la ve nadie', () => {
    const sinT04 = APOYOS.filter((a) => a.nombreNormalizado !== 'LX-000 T04');
    const r = preparar({ apoyos: sinT04 });
    assert.ok(r.problemas.some((p) => p.clase === 'canonico-sin-apoyo'));
  });

  test('dos carpetas apuntando al mismo punto se pelearían por la misma ficha', () => {
    const doble = { ...MAPA, carpetas: [...MAPA.carpetas, { carpeta: 'C9', nombreCanonico: 'LX-000 T01' }] };
    const r = prepararReparto({
      mapa: doble, apoyos: APOYOS, codigoLinea: 'LX-000', origen: 'x',
      entradas: [...INDICE, { archivo: 'z-09.jpg', carpeta: 'C9', sha256: h(9), bytes: 9 }],
    });
    assert.ok(r.problemas.some((p) => p.clase === 'canonico-repetido'));
  });

  test('un formato desconocido PARA — no desaparece en silencio', () => {
    // Era el fallo más caro que quedaba abierto: un `.filter()` hacía desaparecer
    // sin un solo aviso todo lo que no reconocía. Con un registro hecho con
    // teléfono, eso es casi todo el lote.
    const { aceptados, desconocidos } = clasificarArchivos(['a.jpg', 'b.HEIC', 'c.mov', 'indice.json']);
    assert.deepEqual(aceptados.map((a) => a.archivo), ['a.jpg']);
    assert.deepEqual(desconocidos, ['b.HEIC', 'c.mov']);
    const r = preparar({ entradas: [...INDICE, { archivo: 'z-10.HEIC', carpeta: 'C1', sha256: h(10), bytes: 9 }] });
    assert.ok(r.problemas.some((p) => p.clase === 'extension-desconocida'));
  });

  test('HEIC no está en la lista blanca, y no es un olvido', () => {
    assert.equal(MIME['.heic'], undefined,
      'ni el molde de los datos lo admite ni Chrome en Windows lo dibuja: una ficha válida apuntando a algo que no se puede pintar');
  });

  test('un archivo sin carpeta se acusa POR SU NOMBRE', () => {
    const r = preparar({ entradas: [...INDICE, { archivo: 'z-11.jpg', sha256: h(11), bytes: 9 }] });
    const p = r.problemas.find((x) => x.clase === 'archivo-sin-carpeta');
    assert.ok(p);
    assert.match(describirProblema(p), /z-11\.jpg/);
  });

  test('todo problema se dice en el idioma del Ingeniero: sin jerga y sin identificadores', () => {
    const clases = ['extension-desconocida', 'archivo-sin-carpeta', 'carpeta-no-declarada',
      'carpeta-declarada-dos-veces', 'fila-sin-carpeta', 'fila-sin-canonico', 'canonico-repetido',
      'canonico-sin-apoyo', 'foto-sin-canonico', 'apoyo-repetido', 'apoyo-sin-nombre',
      'base-sin-apoyos', 'orden-no-declarado', 'secuencia-rota'];
    for (const clase of clases) {
      const texto = describirProblema({
        clase, carpetas: ['A', 'B'], archivo: 'x.jpg', carpeta: 'C', nombreCanonico: 'N',
        anterior: 'N1', ordenAnterior: 2, siguiente: 'N2', ordenSiguiente: 1,
      });
      assert.doesNotMatch(texto, /no clasificado/, `«${clase}» no tiene frase propia`);
      assert.doesNotMatch(texto, /undefined|\[object/, `«${clase}» enseña un hueco de la máquina`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('LO QUE YA ESTÁ — se pregunta por la HUELLA, nunca por una casilla', () => {
  test('la huella contra la base decide qué entra, y el mapa NO', () => {
    // `yaCargado` del mapa es una anotación humana: sirve para pintar, no para
    // decidir. Un `true` equivocado no puede impedir una subida legítima.
    const r = preparar({ huellasEnLaBase: [h(2), h(7)] });
    assert.equal(r.resumen.yaEstan, 2);
    assert.equal(r.resumen.nuevas, 5);
    const c1 = r.grupos.find((g) => g.carpeta === 'C1');
    assert.equal(c1.yaEstan, 2, 'C1 va marcada `yaCargado: true` en el mapa Y sus dos huellas están: coinciden');
    const c2 = r.grupos.find((g) => g.carpeta === 'C2');
    assert.equal(c2.nuevas, 1, 'C2 va marcada `yaCargado: true` en el mapa y su huella NO está: manda la huella');
  });

  test('sin huellas conocidas, todo entra como nuevo — no se supone que ya está', () => {
    const r = preparar();
    assert.equal(r.resumen.yaEstan, 0);
    assert.equal(r.resumen.nuevas, 7);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('LA CLAVE DEL OBJETO — la misma forma que el portero exige', () => {
  test('lleva la huella delante: el mismo archivo cae siempre en la misma clave', () => {
    const c = claveDeObjeto('LX-000', 'registro-inventado', h(3), 'z-03.jpg');
    assert.equal(c, `LX-000/registro-inventado/${h(3).slice(0, 12)}-z-03.jpg`);
    assert.equal(claveDeObjeto('LX-000', 'registro-inventado', h(3), 'z-03.jpg'), c, 'es una función pura del archivo');
  });

  test('la forma que se genera es EXACTAMENTE la que el portero acepta', () => {
    // Si estas dos divergen, el portero rechaza todo lo que la aplicación manda
    // y nadie sabría por qué. Se comprueban juntas a propósito.
    for (const e of INDICE) {
      const c = claveDeObjeto('LX-000', 'registro-inventado', e.sha256, e.archivo);
      assert.match(c, FORMA_DE_CLAVE, `la clave de ${e.archivo} no casa con la forma que exige el portero`);
    }
  });

  test('la forma NO admite rutas libres ni salidas del prefijo', () => {
    for (const mala of [
      '../secreto.jpg', 'LX-000/x/abc-foto.jpg', 'LX-000/x/aaaaaaaaaaaa-foto.heic',
      'LX-000/../x/aaaaaaaaaaaa-foto.jpg', '/LX-000/x/aaaaaaaaaaaa-foto.jpg',
      'LX-000/x/aaaaaaaaaaaa-sub/foto.jpg',
    ]) {
      assert.doesNotMatch(mala, FORMA_DE_CLAVE, `«${mala}» no debería pasar la forma de clave`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('resolverCarpetas — el mapa, revisado antes de tocar un archivo', () => {
  test('devuelve las filas EN EL ORDEN DEL MAPA', () => {
    const { filas, problemas } = resolverCarpetas(MAPA, ['CFIN', 'C1', 'C3']);
    assert.deepEqual(filas.map((f) => f.carpeta), ['C1', 'C3', 'CFIN']);
    assert.deepEqual(problemas, []);
  });

  test('acepta el mapa como objeto con notas o como lista suelta', () => {
    assert.equal(resolverCarpetas(MAPA.carpetas, ['C1']).filas.length, 1);
    assert.equal(resolverCarpetas(MAPA, ['C1']).filas.length, 1);
  });

  test('una carpeta declarada dos veces se caza en el mapa, no en el disco', () => {
    const doble = { carpetas: [...MAPA.carpetas, { carpeta: 'C1', nombreCanonico: 'LX-000 T02' }] };
    const { problemas } = resolverCarpetas(doble, ['C1']);
    assert.ok(problemas.some((p) => p.clase === 'carpeta-declarada-dos-veces'));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('GUARDIÁN POR TEXTO — que la asignación no se vuelva a apagar sola', () => {
  const codigo = fuente('herramientas/subir-evidencias.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

  test('EXIGE_APOYO ya no depende de cómo se escriba --origen', () => {
    // El fallo nº 3: `const EXIGE_APOYO = ORIGEN === 'estructuras'`. Con
    // `--origen registro-2026-08` valía `false` y las 205 fotos subían SIN apoyo,
    // sin un solo aviso. Ahora se exige siempre y sólo lo apaga `--sin-apoyo`.
    assert.doesNotMatch(codigo, /EXIGE_APOYO\s*=\s*ORIGEN/,
      'volvió el defecto que se apaga solo cuando alguien escribe otro nombre de carpeta');
    assert.match(codigo, /EXIGE_APOYO\s*=\s*!bandera\('sin-apoyo'\)/,
      'la asignación se exige SIEMPRE; apagarla tiene que costar una bandera explícita');
  });

  test('el guion DELEGA la cadena entera en el módulo compartido', () => {
    assert.match(codigo, /prepararReparto/,
      'el eslabón suelto es cero solución: la cadena se llama de una vez');
    assert.match(codigo, /from\s+'@lineas\/importar\/evidencias'/,
      'o importa el emparejador compartido, o lo está reinventando aquí dentro');
  });

  test('no vuelve a colgar una foto de una POSICIÓN', () => {
    assert.doesNotMatch(codigo, /porOrden/, 'volvió el índice de apoyos por posición');
    assert.doesNotMatch(codigo, /\borden\s*-\s*1\b/, 'volvió la resta «posición − 1»');
    assert.doesNotMatch(codigo, /estructuraPunto/, 'ese número ES una posición');
  });

  test('REVISAR ya no exige la llave maestra', () => {
    // El fallo nº 4: en `--seco` abortaba sin `GOOGLE_APPLICATION_CREDENTIALS`.
    // El paso «que lo revise una persona antes» era justo el que pedía la llave
    // que este proyecto quiere dejar de usar.
    assert.doesNotMatch(codigo, /Añada GOOGLE_APPLICATION_CREDENTIALS, también en modo seco/,
      'revisar el reparto no puede depender de la llave maestra');
    assert.match(codigo, /seLeyoLaBase/,
      'sin credencial se enseña lo que se puede y se DICE qué no se pudo comprobar');
  });

  test('el emparejador es PURO: ni un `node:` en el módulo que el navegador importa', () => {
    const puro = fuente('importar/evidencias.js');
    assert.doesNotMatch(puro, /from\s+'node:/, 'la pantalla no puede importar módulos nativos');
    assert.doesNotMatch(puro, /require\(/, 'nada de CommonJS: el navegador no lo entiende');
  });

  test('el módulo público no lleva ni un byte de cliente', () => {
    // `33 · L-50`, pagada DOS veces esta semana. El emparejador vive en el
    // repositorio PÚBLICO: no puede nombrar una línea real, ni una instalación,
    // ni un cliente. El mapa que sí los lleva vive en la bóveda y se le PASA
    // como argumento.
    //
    // Los patrones se arman por trozos a propósito: escribir el nombre real
    // dentro de la prueba que prohíbe el nombre real es meterlo en el
    // repositorio por la puerta de atrás.
    const texto = fuente('importar/evidencias.js');
    const linea = new RegExp(['LN', '627'].join('-'));
    const cliente = new RegExp(['AFI' + 'NIA', 'E' + 'PM', 'Membri' + 'llal'].join('|'), 'i');
    assert.doesNotMatch(texto, linea, 'el emparejador nombra una línea real');
    assert.doesNotMatch(texto, cliente, 'el emparejador nombra una instalación o un cliente');
  });
});
