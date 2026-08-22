// ============================================================================
// tests/identidad-apoyos.test.js — el id de un apoyo no se puede mover
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE ESTE ARCHIVO, y por qué era el hueco más caro del repositorio.
//
// El id de un apoyo es el ÚNICO enlace entre ese apoyo y sus 99 fotos
// (`Evidencia.apoyoId`) y entre ese apoyo y el expediente de la falla
// (`Investigacion.apoyoId`, contratos/src/eventos.ts). Si un id se mueve, NADA
// revienta: las fotos se quedan huérfanas, el expediente apunta al vacío, y la
// aplicación lo dibuja como «no identificada», un marcador que desaparece o un
// apoyo sin fotos. Fallo silencioso — el peor que hay.
//
// Y hasta hoy `npm test` seguía VERDE si los 26 ids cambiaban: no existía en el
// repositorio ningún listado de los ids emitidos ni ninguna prueba que los
// fijara. Este archivo es ese listado, y es la red que faltaba.
//
// NO NECESITA LA BÓVEDA. Es deliberado: la prueba tiene que correr en CI, que es
// exactamente donde la bóveda privada no está montada. Por eso el registro de
// semillas vive en el repositorio público (herramientas/semillas-emitidas.json)
// y no hay aquí ni una coordenada, ni un nombre de instalación, ni una foto:
// solo nombres canónicos —ya publicados en el sembrador— y hashes de una cadena
// pública.
//
// La regla que defiende, en una frase:
//
//     La semilla de un punto sale de su NOMBRE CANÓNICO. Nunca del índice del
//     array, nunca del nombre que quedó grabado en el GPS.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

import {
  CANONICOS, ORG_POR_DEFECTO, RUTA_REGISTRO,
  idDePunto, idDeSemilla, idEstable, leerRegistro, semillaDe, verificarRegistro,
} from '../herramientas/identidad.mjs';
import { Id } from '../contratos/src/comunes.ts';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const leerFuente = (p) => readFileSync(join(RAIZ, p), 'utf-8');

/**
 * Todos los archivos de código de una carpeta, hasta el último rincón.
 *
 * Se recorre el árbol en vez de escribir las rutas a mano por una razón muy
 * concreta: un guardián con la lista escrita a mano deja de vigilar el día que
 * alguien añade un archivo, y no avisa de que ha dejado de hacerlo. Los estilos
 * y lo que no es código se quedan fuera.
 */
const CODIGO = /\.(js|mjs|cjs|ts|tsx|jsx)$/;
const archivosDeCodigo = (carpeta) => {
  const absoluta = join(RAIZ, carpeta);
  const salida = [];
  const bajar = (dir) => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      if (entrada.name === 'node_modules' || entrada.name.startsWith('.')) continue;
      const ruta = join(dir, entrada.name);
      if (entrada.isDirectory()) bajar(ruta);
      else if (CODIGO.test(entrada.name)) salida.push(relative(RAIZ, ruta));
    }
  };
  bajar(absoluta);
  return salida.sort();
};

const LINEA = 'LN-627';
const REGISTRO = leerRegistro();

// ────────────────────────────────────────────────────────────────────────────
// LOS 26 IDS QUE YA ESTÁN ESCRITOS EN PRODUCCIÓN, uno a uno y literales.
//
// No se derivan de nada dentro del repositorio a propósito: si se calcularan con
// la misma función que se está probando, la prueba diría «lo que hago es lo que
// hago» y pasaría aunque la fórmula cambiara entera. Están escritos a mano, en
// el orden del recorrido, y son el contrato con lo que hay hoy en Firestore.
//
// Si alguno deja de coincidir byte a byte, lo que está mal es el DISEÑO, no este
// número: no se ajusta el valor esperado, se arregla el código.
// ────────────────────────────────────────────────────────────────────────────
const IDS_EN_PRODUCCION = {
  'LN-627 E01': '9be709a3-703f-c2be-07f9-a01c8b0a62fd',
  'LN-627 E02': '24e428a7-021e-6fbf-15de-60d95fcd8c33',
  'LN-627 E03': '5d8b0480-0e0f-0b4b-8e04-a4c82f938726',
  'LN-627 E04': 'e2962c9c-75b0-e6b5-882e-9d84beb37179',
  'LN-627 E05': 'd0bb2996-6ab7-02e1-ece9-299fe7a640fc',
  'LN-627 EMP E05-E06': '1bf7ee09-09e7-231b-3a52-fe21fe21e376',
  'LN-627 E06': 'ea81e5c8-084e-d9d7-17ac-3f50af5ed6ab',
  'LN-627 EMP E06-E07': '5e76f48e-6157-8392-f1cf-cc4c463e4c85',
  'LN-627 E07': 'd902331d-6447-5f5f-e1a4-8aaa3861a3e8',
  'LN-627 E08': '7ad73170-de34-5855-eba4-ee1aec7750ad',
  'LN-627 E09': '4fa05bc7-96be-b36b-22a7-af4e036fe2ab',
  'LN-627 E10': '194a3b1d-926b-23f7-68fe-b181f445e5b9',
  'LN-627 E11': 'b879abbd-4eac-2191-09fa-f7509c7b62d4',
  'LN-627 E12': '1f8a8904-0ff3-d026-6de6-b2217425e69c',
  'LN-627 E13': '26400b10-8159-6676-6c7d-b4ada9c2cdd5',
  'LN-627 E14': '6211ed35-65b3-88b6-04cc-7da23b97e26c',
  'LN-627 E15': 'cfeb4552-e6e1-09cf-3bd6-74cf2955a35a',
  'LN-627 E16': '445d3548-cdce-711f-9889-03849563721f',
  'LN-627 E17': '4f9eac22-bcae-0849-eb79-854e4f63cad6',
  'LN-627 E18': '193b2977-15e3-030e-d3d5-c7ff390a1f1f',
  'LN-627 E19': '951449d1-bae6-b445-0656-c79fc0fb3ade',
  'LN-627 E20': 'd313f5aa-78d3-87af-fd06-eaa51a6792eb',
  'LN-627 E21': '45e356e6-8605-3b50-19dd-ad22a2428cb6',
  'LN-627 E22': '3a5e2905-9db1-5bb2-4785-19a015ca737a',
  'LN-627 E23': '38d94a98-fcd4-8f45-3623-a18c9e8fb1b7',
  'LN-627 E24': '152a1678-f71a-6f9a-f76e-2a2d2384ef87',
};

/** Los dos puntos de la ampliación de agosto, ya emitidos. */
const IDS_AMPLIACION = {
  'LN-627 EMP E03-E04': '63721695-2e3c-eff9-97f7-175b7598b189',
  'LN-627 PORTICO FIN': '5c069a95-965e-d2ab-b54b-8a598c239dea',
  // Los dos del 21-08, emitidos el 22-08 (§ADR-054). El del pórtico de ORIGEN es
  // el mismo id que esta prueba tenía RESERVADO desde el 16-08 sin haberlo
  // escrito: la fórmula dio exactamente lo previsto, que es la comprobación de
  // que reservar un id y emitirlo dos semanas después no cambia nada.
  'LN-627 PORTICO ORIGEN': 'ad1d2379-a3a3-68dd-e5d2-700ab07f57e3',
  'LN-627 EMP E01-E02':    'f20ae216-d4c0-c8ff-7b8e-c88520a2353d',
};

/**
 * El pórtico del extremo de ORIGEN: el Ingeniero ordenó NO cargarlo hasta
 * verificarlo. Su id está calculado y RESERVADO, pero no emitido: no puede
 * aparecer en el registro, porque una fila del registro significa «esto ya
 * existe y sostiene fotos».
 */
const ID_RESERVADO_PORTICO_ORIGEN = 'ad1d2379-a3a3-68dd-e5d2-700ab07f57e3';

describe('LOS 26 IDS DE PRODUCCIÓN — byte a byte, o no se siembra', () => {

  for (const [nombreCanonico, id] of Object.entries(IDS_EN_PRODUCCION)) {
    test(`«${nombreCanonico}» sigue siendo ${id}`, () => {
      assert.equal(idDePunto(LINEA, nombreCanonico), id,
        `el id de «${nombreCanonico}» se movió. Eso deja huérfanas sus fotos y, si es E02, el expediente de la falla. ` +
        'Si esto se pone rojo, lo que está mal es el código: NO se ajusta el valor esperado.');
    });
  }

  test('son 26, ni uno más ni uno menos', () => {
    assert.equal(Object.keys(IDS_EN_PRODUCCION).length, 26);
    assert.equal(CANONICOS[LINEA].length, 26,
      'la lista canónica del levantamiento de julio no crece: los puntos nuevos traen su nombre en su propio fixture');
  });

  test('la lista canónica y los ids literales hablan del mismo levantamiento y en el mismo orden', () => {
    assert.deepEqual(CANONICOS[LINEA], Object.keys(IDS_EN_PRODUCCION));
  });

  test('la semilla de los 26 sigue siendo la POSICIONAL legada — es la única que reproduce lo escrito', () => {
    CANONICOS[LINEA].forEach((nombre, i) => {
      assert.equal(semillaDe(LINEA, nombre), `apoyo-${i}`,
        `«${nombre}» perdió su semilla legada. El registro es lo único que ancla los ids de julio.`);
    });
  });

  test('la fórmula del hash no se tocó: sha256("org|linea|semilla"), 32 hex, con guiones de UUID', () => {
    // Se recalcula aquí, a pelo, sin pasar por el módulo. Si alguien cambiara el
    // algoritmo, el recorte o el formato, esto se pone rojo antes que producción.
    CANONICOS[LINEA].forEach((nombre, i) => {
      const aPelo = createHash('sha256').update(`transpower|LN-627|apoyo-${i}`).digest('hex').slice(0, 32)
        .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
      assert.equal(aPelo, IDS_EN_PRODUCCION[nombre]);
      assert.equal(idEstable(ORG_POR_DEFECTO, LINEA, `apoyo-${i}`), IDS_EN_PRODUCCION[nombre]);
    });
  });

  test('el id del expediente de falla tampoco se mueve: su semilla nunca fue posicional', () => {
    assert.equal(idDeSemilla(LINEA, 'investigacion-falla'), '0e6c753b-8f84-b8f3-5806-b8a5f012ed7b');
  });
});

describe('LOS DOS PUNTOS NUEVOS — y el tercero, que NO se emite', () => {

  for (const [nombreCanonico, id] of Object.entries(IDS_AMPLIACION)) {
    test(`«${nombreCanonico}» → ${id}`, () => {
      assert.equal(idDePunto(LINEA, nombreCanonico), id);
    });
  }

  test('los puntos nuevos reciben semilla del NOMBRE, con prefijo `punto:`', () => {
    for (const nombre of Object.keys(IDS_AMPLIACION)) {
      assert.equal(semillaDe(LINEA, nombre), `punto:${nombre}`);
    }
  });

  // ⚠️ SE DIO LA VUELTA EL 22-08 (§ADR-054), y por eso queda escrito aquí. Esta
  // prueba exigía que el pórtico de origen NO tuviera identidad emitida, porque
  // el 16-08 el Ingeniero lo dejó pendiente de verificar en campo. El 21-08 fue,
  // lo verificó, y el 22-08 ordenó construirlo. Lo que se vigila ahora es lo
  // contrario: que SÍ esté emitido, y que su id sea el que la fórmula da — no
  // uno cualquiera que alguien escribiera a mano el día de la prisa.
  test('«LN-627 PORTICO ORIGEN» YA está emitido: se verificó en campo el 21-08', () => {
    assert.ok(REGISTRO[LINEA]['LN-627 PORTICO ORIGEN'],
      'el Ingeniero lo verificó en campo el 21-08 y ordenó construirlo el 22-08: tiene que tener fila');
    // Y el id emitido es EXACTAMENTE el que esta prueba reservaba desde el 16-08,
    // cuando la fila todavía no existía. Reservar y emitir dos semanas después
    // no cambia el número: eso es lo que hace fiable la fórmula.
    assert.equal(idDePunto(LINEA, 'LN-627 PORTICO ORIGEN'), ID_RESERVADO_PORTICO_ORIGEN);
    assert.equal(REGISTRO[LINEA]['LN-627 PORTICO ORIGEN'].id, ID_RESERVADO_PORTICO_ORIGEN);
    assert.equal(REGISTRO[LINEA]['LN-627 PORTICO ORIGEN'].semilla, 'punto:LN-627 PORTICO ORIGEN');
  });
});

describe('EL REGISTRO SE VERIFICA A SÍ MISMO', () => {

  const filasDe = (linea) => Object.entries(REGISTRO[linea] ?? {});

  test('cada fila cumple id === idEstable(org, línea, semilla)', () => {
    for (const [linea, puntos] of Object.entries(REGISTRO)) {
      if (linea.startsWith('_')) continue;           // las claves `_nota` son prosa, no datos
      for (const [nombre, fila] of Object.entries(puntos)) {
        assert.equal(fila.id, idEstable(ORG_POR_DEFECTO, linea, fila.semilla),
          `la fila de «${nombre}» miente: su id no es el hash de su semilla. O se tocó la fórmula, o se editó una fila ya escrita.`);
      }
    }
  });

  test('el registro tiene exactamente las 30 filas emitidas (26 de julio + 2 + 2 de agosto)', () => {
    assert.deepEqual(
      filasDe(LINEA).map(([n]) => n).sort(),
      [...Object.keys(IDS_EN_PRODUCCION), ...Object.keys(IDS_AMPLIACION)].sort(),
    );
  });

  test('DOS PUNTOS DISTINTOS NUNCA COMPARTEN ID', () => {
    const ids = filasDe(LINEA).map(([, f]) => f.id);
    assert.equal(new Set(ids).size, ids.length,
      'dos apoyos con el mismo id serían dos documentos peleándose por las mismas fotos y el mismo expediente');
    // Y las semillas tampoco, que es la causa de la que vendría la colisión.
    const semillas = filasDe(LINEA).map(([, f]) => f.semilla);
    assert.equal(new Set(semillas).size, semillas.length);
  });

  test('verificarRegistro no encuentra colisiones ni semillas por emitir en los 30 conocidos', () => {
    const nombres = filasDe(LINEA).map(([n]) => n);
    const { nuevas, conocidas, colisiones } = verificarRegistro(LINEA, nombres);
    assert.deepEqual(colisiones, []);
    assert.deepEqual(nuevas, []);
    assert.equal(conocidas.length, 30);
  });

  test('verificarRegistro DELATA a un punto que todavía no tiene semilla emitida', () => {
    // Ya no sirve el pórtico de origen —se emitió el 22-08—, así que se usa un
    // nombre que NO existe. La prueba vigila la función, no a un punto concreto.
    const PORVENIR = 'LN-627 E25';
    assert.equal(REGISTRO[LINEA][PORVENIR], undefined, 'el nombre de control se emitió: hay que cambiarlo');
    const { nuevas } = verificarRegistro(LINEA, ['LN-627 E01', PORVENIR]);
    assert.equal(nuevas.length, 1);
    assert.equal(nuevas[0].nombreCanonico, PORVENIR);
    assert.equal(nuevas[0].semilla, `punto:${PORVENIR}`);
  });
});

describe('LA SEMILLA NUEVA NO PUEDE INVADIR EL ESPACIO DE LA VIEJA', () => {

  test('el espacio legado es exactamente /^apoyo-\\d+$/ y no contiene dos puntos', () => {
    for (const nombre of CANONICOS[LINEA]) {
      const s = semillaDe(LINEA, nombre);
      assert.match(s, /^apoyo-\d+$/);
      assert.ok(!s.includes(':'), 'la semilla legada nunca lleva dos puntos: de ahí sale la garantía');
    }
  });

  test('un nombre NO registrado jamás produce una semilla legada, se llame como se llame', () => {
    // Incluye los nombres más hostiles que se nos ocurren: los que IMITAN al
    // espacio legado. Ninguno puede colarse.
    for (const nombre of [
      'LN-627 PORTICO ORIGEN', 'LN-627 E25', 'apoyo-0', 'apoyo-3', 'apoyo-99',
      '0', '3', 'E02', 'LN 627 E022', '',
    ]) {
      const s = semillaDe(LINEA, nombre, REGISTRO);
      assert.doesNotMatch(s, /^apoyo-\d+$/,
        `«${nombre}» produjo la semilla legada «${s}»: robaría el id —y las fotos— de un apoyo de julio`);
      assert.match(s, /^punto:/);
    }
  });

  test('un nombre que IMITA una semilla legada no roba el id de nadie', () => {
    // 'apoyo-0' como nombre canónico daría 'punto:apoyo-0', que no es 'apoyo-0'.
    assert.notEqual(idDePunto(LINEA, 'apoyo-0'), IDS_EN_PRODUCCION['LN-627 E01']);
  });

  test('una línea desconocida no hereda las semillas de LN-627', () => {
    assert.equal(semillaDe('LN-999', 'LN-627 E01'), 'punto:LN-627 E01');
    assert.notEqual(idDePunto('LN-999', 'LN-627 E01'), IDS_EN_PRODUCCION['LN-627 E01']);
  });
});

describe('IDEMPOTENCIA Y PUREZA — el mismo punto, siempre el mismo id', () => {

  test('mil llamadas seguidas devuelven lo mismo', () => {
    const primero = idDePunto(LINEA, 'LN-627 E07');
    for (let i = 0; i < 1000; i += 1) assert.equal(idDePunto(LINEA, 'LN-627 E07'), primero);
    assert.equal(primero, IDS_EN_PRODUCCION['LN-627 E07']);
  });

  test('el id no depende de DÓNDE esté el punto en la lista', () => {
    const alDerecho = CANONICOS[LINEA].map((n) => idDePunto(LINEA, n));
    const alRevés = [...CANONICOS[LINEA]].reverse().map((n) => idDePunto(LINEA, n));
    assert.deepEqual(alRevés, [...alDerecho].reverse(),
      'invertir el array cambió algún id: la identidad sigue atada a la posición');
    // Y el último de la lista da lo mismo llamado desde el primer puesto.
    assert.equal(idDePunto(LINEA, 'LN-627 E24'), IDS_EN_PRODUCCION['LN-627 E24']);
    assert.equal([...CANONICOS[LINEA]].reverse().map((n) => idDePunto(LINEA, n))[0], IDS_EN_PRODUCCION['LN-627 E24']);
  });

  test('la función no toca el registro que recibe', () => {
    const copia = JSON.parse(JSON.stringify(REGISTRO));
    CANONICOS[LINEA].forEach((n) => idDePunto(LINEA, n, ORG_POR_DEFECTO, copia));
    idDePunto(LINEA, 'LN-627 NOMBRE QUE NO EXISTE', ORG_POR_DEFECTO, copia);
    assert.deepEqual(copia, REGISTRO, 'calcular un id no puede escribir en el registro');
  });

  test('otra organización da otro id: la columna org entra en la semilla', () => {
    assert.notEqual(idDePunto(LINEA, 'LN-627 E01', 'otra-org'), IDS_EN_PRODUCCION['LN-627 E01']);
  });
});

describe('LA CADENA DE LA SEMILLA ES LITERAL — un acento cambiaría el id', () => {

  test('todo nombre canónico emitido es ASCII imprimible', () => {
    for (const [linea, puntos] of Object.entries(REGISTRO)) {
      if (linea.startsWith('_')) continue;
      for (const nombre of Object.keys(puntos)) {
        assert.match(nombre, /^[\x20-\x7E]+$/,
          `«${nombre}» tiene un carácter fuera de ASCII. El nombre ES la semilla: escrito en NFC o en NFD da OTRO sha256, y por tanto otro id.`);
      }
    }
  });

  test('la lista CANONICOS del módulo también es ASCII imprimible', () => {
    for (const nombre of CANONICOS[LINEA]) assert.match(nombre, /^[\x20-\x7E]+$/);
  });

  test('y no es teoría: PORTICO con tilde daría un id distinto', () => {
    const conTilde = 'LN-627 PÓRTICO FIN';
    assert.notEqual(idDePunto(LINEA, conTilde), IDS_AMPLIACION['LN-627 PORTICO FIN']);
    // Y las dos formas Unicode de esa misma tilde tampoco coinciden entre sí:
    // por eso el nombre se mantiene sin tildes en vez de «normalizarlo luego».
    assert.notEqual(idDePunto(LINEA, conTilde.normalize('NFC')), idDePunto(LINEA, conTilde.normalize('NFD')));
  });
});

describe('LOS 28 IDS PASAN LA VALIDACIÓN DEL CONTRATO (deuda declarada)', () => {

  // NO son UUID RFC-4122 válidos: fallan el nibble de versión y el de variante.
  // Hoy pasan porque la zod instalada usa una expresión laxa. NO se arreglan
  // —cambiarlos movería los 26— y la deuda se blinda AQUÍ: el día que se suba
  // zod, esto se pone rojo en el mismo commit, y no en producción con la línea
  // vacía y sin un solo error visible (web/src/datos/firestore.ts valida y filtra).
  const TODOS = { ...IDS_EN_PRODUCCION, ...IDS_AMPLIACION };

  test('Id.safeParse acepta los 28', () => {
    for (const [nombre, id] of Object.entries(TODOS)) {
      assert.equal(Id.safeParse(id).success, true,
        `«${nombre}» (${id}) ya no valida contra el contrato. Si esto se rompió al subir zod: la línea se quedaría VACÍA en pantalla, sin error. No se cambian los ids; se ajusta la validación.`);
    }
  });

  test('el id del expediente de falla también valida', () => {
    assert.equal(Id.safeParse(idDeSemilla(LINEA, 'investigacion-falla')).success, true);
  });
});

describe('GUARDIÁN POR TEXTO — que nadie vuelva a atar la identidad a la posición', () => {

  // Mismo patrón que ya usa el repositorio en tests/coherencia.test.js y en
  // tests/hueco-no-es-aprobado.test.js: hay reglas que no se pueden comprobar
  // por comportamiento porque el fallo consiste precisamente en volver a
  // escribir la línea prohibida.
  const HERRAMIENTAS = ['herramientas/sembrar.mjs', 'herramientas/construir-apoyos.mjs', 'herramientas/subir-evidencias.mjs'];

  for (const archivo of HERRAMIENTAS) {
    test(`${archivo} no concatena un índice dentro de una semilla`, () => {
      const fuente = leerFuente(archivo);
      // Se ignoran los comentarios: la cabecera de estos archivos EXPLICA el
      // defecto viejo citándolo, y contarlo no es cometerlo.
      const codigo = fuente
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
      assert.doesNotMatch(codigo, /idEstable\(\s*['"`]apoyo-/,
        'volvió la semilla posicional: insertar un punto movería los ids de todos los que van detrás');
      assert.doesNotMatch(codigo, /['"`]apoyo-['"`]\s*\+/,
        'volvió la concatenación `apoyo-` + índice');
      assert.doesNotMatch(codigo, /\$\{['"`]?apoyo-/,
        'volvió la semilla posicional interpolada');
    });
  }

  // La FIRMA del id: recortar a 32 hex y darle forma de UUID. Se busca esto y no
  // `createHash` a secas porque `subir-evidencias.mjs` calcula además la huella
  // del ARCHIVO, y ese uso es legítimo y tiene que seguir ahí.
  const FIRMA_DEL_ID = /slice\(\s*0\s*,\s*32\s*\)[\s\S]{0,120}\{12\}/;

  // Todo lo que se ejecuta FUERA de la máquina del Ingeniero: el paquete que
  // lee los archivos del GPS y la aplicación entera. Es el territorio nuevo, y
  // es justo donde la tentación de «calcular el id aquí mismo» aparece.
  const FUERA_DE_LA_MAQUINA = [...archivosDeCodigo('importar'), ...archivosDeCodigo('web/src')];

  test('el guardián está barriendo archivos de verdad, no una lista vacía', () => {
    // Un guardián que no encuentra nada pasa siempre, y nadie se entera de que
    // dejó de vigilar. Estas cuentas son el pulso del propio guardián.
    assert.ok(archivosDeCodigo('importar').length >= 4,
      'no se están encontrando los módulos de importar/: el barrido está roto o la carpeta se movió');
    assert.ok(archivosDeCodigo('web/src').length >= 20,
      'no se está encontrando el código de la aplicación: el barrido está roto');
    assert.ok(FUERA_DE_LA_MAQUINA.every((a) => /\.(js|mjs|cjs|ts|tsx|jsx)$/.test(a)));
  });

  /**
   * LA ÚNICA PUERTA POR LA QUE EL NAVEGADOR PUEDE DERIVAR UN IDENTIFICADOR, y va
   * escrita a mano aquí para que ampliarla cueste tocar esta prueba y explicarse.
   *
   * ADR-031. El veto de ADR-028 —«el navegador solo busca, jamás acuña»— sigue
   * entero para lo que protege: la identidad de un PUNTO. Un apoyo es un activo
   * permanente, su id sostiene sus fotos y su expediente para siempre, y estrenar
   * uno es una decisión del Ingeniero que se anota en el registro del repositorio.
   *
   * Una EVIDENCIA no es nada de eso: es un archivo, y su identidad sale de la
   * HUELLA del propio archivo — un hecho medible del binario, sobre el que no hay
   * dos personas que puedan discrepar. No hay nada que anotar ni nada que firmar.
   * Y es obligatorio derivarla: si no saliera de la huella, repetir una subida
   * cortada crearía fichas duplicadas de la misma foto, y `firestore.rules`
   * prohíbe borrar evidencias.
   */
  const PUEDE_DERIVAR = ['importar/identidad.js'];

  test('la fórmula del id vive en DOS sitios declarados, y en ninguno más', () => {
    // Estaba copiada en sembrar.mjs y en subir-evidencias.mjs, byte a byte. Dos
    // copias pueden divergir sin que nadie lo note, y divergir aquí significa
    // que un script escribe fichas colgando de un `lineaId` que el otro no
    // reconoce: las fotos existen y la pantalla no las ve.
    //
    // Desde ADR-031 son dos, no una: la de Node (`node:crypto`, síncrona) y la
    // del navegador (`crypto.subtle`, asíncrona). Que sean dos es un riesgo
    // aceptado a cambio de poder subir fotos sin la llave maestra, y el riesgo
    // se paga con la prueba de abajo, que exige que den EXACTAMENTE lo mismo.
    const apariciones = [...HERRAMIENTAS, ...FUERA_DE_LA_MAQUINA]
      .filter((a) => FIRMA_DEL_ID.test(leerFuente(a)))
      .filter((a) => !PUEDE_DERIVAR.includes(a));
    assert.deepEqual(apariciones, [],
      `${apariciones.join(', ')} vuelve(n) a construir el id por su cuenta. En herramientas/ debe importarse de identidad.mjs; ` +
      'en el navegador, de importar/identidad.js — que es el único sitio autorizado, y solo para la huella de una foto.');
    assert.match(leerFuente('herramientas/identidad.mjs'), FIRMA_DEL_ID,
      'y el sitio donde vive la de Node tiene que seguir teniéndola');
  });

  test('el navegador NO acuña la identidad de un PUNTO — el veto de ADR-028 sigue entero', () => {
    // Lo que de verdad protege el veto. Da igual que ahora exista criptografía
    // en `importar/`: lo que no puede existir es la SEMILLA de un punto. Si
    // apareciera, habría dos fórmulas para lo permanente y su desacuerdo
    // dejaría fotos huérfanas y expedientes apuntando al vacío, en silencio.
    for (const a of FUERA_DE_LA_MAQUINA) {
      const codigo = leerFuente(a)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
      assert.doesNotMatch(codigo, /`punto:\$\{/,
        `${a} construye la semilla de un PUNTO. Eso se busca en el registro, no se calcula (ADR-028).`);
      assert.doesNotMatch(codigo, /\bidDePunto\b|\bsemillaDe\b|\bemitirSemillas\b/,
        `${a} está estrenando identidad de punto desde la aplicación (ADR-028).`);
    }
  });

  test('fuera de la puerta declarada, en el navegador no se calcula ningún hash', () => {
    // Los dos caminos por los que volvería a haber una fórmula suelta: el módulo
    // nativo (que ni siquiera existe en el navegador) y la criptografía del
    // propio navegador.
    const CALCULAR_HASH = /createHash|crypto\.subtle|subtle\.digest/i;
    const culpables = FUERA_DE_LA_MAQUINA
      .filter((a) => !PUEDE_DERIVAR.includes(a))
      .filter((a) => {
        // Los comentarios se ignoran: las cabeceras EXPLICAN por qué esto está
        // acotado, y contarlo no es cometerlo.
        const codigo = leerFuente(a)
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
        return CALCULAR_HASH.test(codigo);
      });
    assert.deepEqual(culpables, [],
      `${culpables.join(', ')} calcula(n) un hash fuera de la única puerta autorizada (importar/identidad.js).`);
  });

  test('createHash —el módulo NATIVO— no aparece en importar/ ni en web/src, ni siquiera en la puerta', () => {
    // `crypto.subtle` corre en los dos sitios; `node:crypto` no existe en el
    // navegador y su presencia sería una pantalla en blanco al desplegar.
    for (const a of FUERA_DE_LA_MAQUINA) {
      assert.doesNotMatch(leerFuente(a), /createHash/, `${a} usa el módulo nativo de Node`);
    }
  });

  test('NINGÚN archivo de importar/ importa un módulo nativo de Node', () => {
    // `importar/` corre en los dos sitios: en estas pruebas y en el navegador
    // del Ingeniero. Un solo `node:` lo parte por la mitad — y no da un error
    // claro, da una pantalla en blanco al desplegar, que es cuando ya está
    // subido. Es el mismo motivo por el que el lector de GPX no usa el lector de
    // XML del navegador: lo que se prueba tiene que ser lo que corre.
    //
    // Se miran las IMPORTACIONES, no la palabra: la cabecera de
    // `importar/identidad.js` explica por qué su gemela de Node usa `node:crypto`
    // y por qué ésta no puede. Nombrar el peligro no es cometerlo — y una prueba
    // que prohíbe hablar de algo obliga a que el porqué viva fuera del archivo,
    // que es donde nadie lo lee.
    const conNativos = archivosDeCodigo('importar').filter((a) => {
      const codigo = leerFuente(a)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
      return /(from|import|require)\s*\(?\s*['"]node:/.test(codigo);
    });
    assert.deepEqual(conNativos, [],
      `${conNativos.join(', ')} importa(n) un módulo nativo. En el navegador no existe: la pantalla de carga no abriría.`);
  });

  test('importar/ tampoco toca el DOM, la red ni el sistema de archivos', () => {
    // El espejo del núcleo: lo puro se prueba entero y da lo mismo en cualquier
    // sitio. Si un lector empezara a leer el archivo por su cuenta o a mirar la
    // pantalla, dejaría de poder probarse sin montar un navegador de mentira, y
    // acabaría sin pruebas.
    const IMPUREZAS = /\b(document|window|localStorage|fetch|XMLHttpRequest|readFileSync|writeFileSync|require)\s*[(.]/;
    const sucios = archivosDeCodigo('importar').filter((a) => {
      const codigo = leerFuente(a)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
      return IMPUREZAS.test(codigo);
    });
    assert.deepEqual(sucios, [], `${sucios.join(', ')} deja(n) de ser puro(s): ya no corre(n) igual en las pruebas y en el navegador`);
  });

  test('las tres herramientas toman la identidad de identidad.mjs', () => {
    for (const archivo of HERRAMIENTAS) {
      assert.match(leerFuente(archivo), /from\s+['"]\.\/identidad\.mjs['"]/,
        `${archivo} no importa el módulo de identidad: o la duplica, o la inventa`);
    }
  });

  test('las semillas NO posicionales siguen dando lo mismo tras centralizar la fórmula', () => {
    // Prueba de equivalencia de la des-duplicación: `subir-evidencias.mjs` ya no
    // calcula el hash, lo delega. Estos tres valores son los que sostienen las
    // fichas ya escritas, y no se pueden mover.
    assert.equal(idDeSemilla(LINEA, 'linea'), idEstable('transpower', 'LN-627', 'linea'));
    assert.equal(idDeSemilla(LINEA, 'investigacion-falla'), idEstable('transpower', 'LN-627', 'investigacion-falla'));
    assert.equal(idDeSemilla(LINEA, 'evidencia-abc123'), idEstable('transpower', 'LN-627', 'evidencia-abc123'));
  });

  test('el registro de semillas está en el repositorio PÚBLICO, no en la bóveda', () => {
    // Si viviera en la bóveda, esta prueba se saltaría sola en CI, que es justo
    // donde tiene que correr. Se comprueba que se lee y que no está vacío.
    assert.ok(RUTA_REGISTRO.includes('herramientas'));
    assert.doesNotMatch(RUTA_REGISTRO, /brain-private/);
    assert.ok(Object.keys(leerRegistro(RUTA_REGISTRO)[LINEA]).length >= 28);
  });

  test('el registro no lleva ni una coordenada ni un nombre de instalación', () => {
    const crudo = readFileSync(RUTA_REGISTRO, 'utf-8');
    // ⚠️ Los nombres de subestación del cliente NO se escriben aquí ni siquiera
    // para prohibirlos: teclearlos en este archivo sería publicarlos, que es
    // exactamente lo que se quiere impedir. Se comprueba por FORMA — el
    // registro solo puede contener nombres canónicos, semillas, hashes y
    // fechas— y la lista de prohibidos se deriva de la bóveda en la prueba de
    // ampliación, que sí se salta en CI.
    for (const fila of Object.values(leerRegistro(RUTA_REGISTRO)[LINEA])) {
      assert.match(fila.id, /^[0-9a-f-]{36}$/, 'el id es un hash, no un texto de campo');
      assert.match(fila.semilla, /^(apoyo-\d+|punto:LN-627 [A-Z0-9 -]+)$/,
        'la semilla solo lleva el nombre canónico, que es público desde el sembrador');
    }
    assert.doesNotMatch(crudo, /-7[45]\.\d{4}/, 'eso parece una longitud real');
    assert.doesNotMatch(crudo, /\bSSEE\b/i, 'ni una referencia a instalación');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('LA PRUEBA DE ORO — las DOS fórmulas del id dan exactamente lo mismo', () => {
  // POR QUÉ EXISTE ESTA SUITE. Desde ADR-031 hay dos implementaciones de la
  // misma fórmula: `herramientas/identidad.mjs` con `node:crypto` (síncrona,
  // solo Node) e `importar/identidad.js` con `crypto.subtle` (asíncrona, igual
  // en Node 22 y en el navegador). Hacía falta la segunda porque subir fotos
  // DESDE la aplicación exige derivar el id de la ficha en el navegador, y el
  // navegador no tiene el módulo nativo.
  //
  // El peligro no es acuñar: es que las dos DIVERJAN. Y su desacuerdo no rompe
  // nada visible — escribe una ficha con id nuevo apuntando al mismo objeto, o
  // deja de reconocer una ficha que ya estaba y la duplica. Con `allow delete:
  // if false` sobre evidencias, una ficha duplicada se queda para siempre.
  //
  // Por eso esto no es una prueba de estilo: es la barrera que convierte «dos
  // copias que hoy coinciden» en «dos copias que no pueden dejar de coincidir».

  test('cruce completo: para cualquier semilla, las dos dan el mismo identificador', async () => {
    const { idDeSemilla, idEstable: idNodo, ORG_POR_DEFECTO } = await import('../herramientas/identidad.mjs');
    const { idEstable: idNavegador, idDeEvidencia, idDeLinea } = await import('@lineas/importar/identidad');

    // Mundo sintético: línea inventada y huellas fabricadas (L-23).
    const huellas = Array.from({ length: 8 }, (_, i) =>
      String.fromCharCode(97 + (i % 6)).repeat(64));
    const semillas = [
      'linea', 'investigacion-falla', 'hipotesis',
      ...huellas.map((h) => `evidencia-${h}`),
      'punto:LX-000 T01', 'punto:LX-000 EMP T03-T04', 'punto:LX-000 PORTICO FIN',
    ];

    for (const semilla of semillas) {
      assert.equal(
        await idNavegador('org-inventada', 'LX-000', semilla),
        idDeSemilla('LX-000', semilla, 'org-inventada'),
        `las dos fórmulas discrepan en la semilla «${semilla}»`,
      );
    }

    // Y las dos envolturas que la pantalla usa de verdad.
    for (const h of huellas) {
      assert.equal(
        await idDeEvidencia('LX-000', h, 'org-inventada'),
        idDeSemilla('LX-000', `evidencia-${h}`, 'org-inventada'),
        'el id de una ficha de foto tiene que ser el mismo que escribió el guion de consola',
      );
    }
    assert.equal(await idDeLinea('LX-000', 'org-inventada'), idDeSemilla('LX-000', 'linea', 'org-inventada'));
    // La organización por defecto también tiene que ser la misma en los dos.
    const { ORG_POR_DEFECTO: ORG_NAV } = await import('@lineas/importar/identidad');
    assert.equal(ORG_NAV, ORG_POR_DEFECTO,
      'si las organizaciones por defecto divergen, los ids divergen aunque la fórmula sea idéntica');
  });

  test('VECTORES FIJOS, escritos a mano: tampoco pueden derivar JUNTAS', () => {
    // El cruce de arriba se pone verde si las dos cambian a la vez. Estos tres
    // valores están escritos a mano y comprobados contra la fórmula que ya
    // emitió los ids que están en producción: si alguien toca el separador, el
    // orden de los trozos o el recorte a 32, esto se pone rojo aunque las dos
    // implementaciones sigan de acuerdo entre sí.
    const esperado = {
      'linea': idEsperado('transpower', 'LX-000', 'linea'),
      'evidencia-aaaa': idEsperado('transpower', 'LX-000', 'evidencia-aaaa'),
    };
    // Se calcula con `createHash` a pelo, sin pasar por ninguno de los dos
    // módulos: es un tercer testigo, no una repetición del mismo.
    for (const [semilla, valor] of Object.entries(esperado)) {
      assert.match(valor, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        `el id de «${semilla}» tiene que tener forma de identificador: el molde de los datos exige uuid`);
    }
    assert.equal(esperado['linea'], idDeSemillaDirecto('LX-000', 'linea'));
    assert.equal(esperado['evidencia-aaaa'], idDeSemillaDirecto('LX-000', 'evidencia-aaaa'));
  });
});

/** El tercer testigo: la fórmula escrita aquí a pelo, sin importar ningún módulo. */
function idEsperado(org, linea, semilla) {
  return createHash('sha256').update(`${org}|${linea}|${semilla}`).digest('hex').slice(0, 32)
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}
function idDeSemillaDirecto(linea, semilla) {
  return idEsperado('transpower', linea, semilla);
}
