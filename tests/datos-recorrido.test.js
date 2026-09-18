// ============================================================================
// tests/datos-recorrido.test.js — la línea que TODAVÍA NO CALCULA, y la línea
// cuyas torres viven en un tramo compartido
// ----------------------------------------------------------------------------
// QUÉ SE VIGILA AQUÍ, y por qué cada cosa es una forma real de hacer daño:
//
//   1. LA LÍNEA INCOMPLETA ABRE. Hasta 0.15.0, una línea sin conductor devolvía
//      `{ fase: 'error' }` y una con menos de dos puntos `{ fase: 'vacio' }`:
//      las dos SUSTITUYEN la pantalla entera, así que dar de alta una línea a
//      medias se llevaba por delante el parque y con él el acceso a la línea
//      que sí funciona. Ahora abre en «recorrido» y DICE qué le falta.
//
//   2. NADA SE TOMA DE OTRA LÍNEA. Ni conductor, ni hipótesis, ni torres
//      (orden del Ingeniero, 2026-09-17). La fase «recorrido» ni siquiera tiene
//      campo donde colarlos.
//
//   3. LA LÍNEA COMPLETA NO CAMBIA DE CAMINO. Una línea sin tramos compartidos
//      hace EXACTAMENTE la misma consulta de siempre y devuelve exactamente los
//      mismos puntos, en el mismo orden. Se cuenta, no se supone.
//
//   4. DOS SERIES NO SE MEZCLAN A CIEGAS. `orden` es lo que ORDENA los vanos;
//      juntar dos numeraciones que se pisan daría vanos entre puntos que no son
//      vecinos, y con los vanos mal salen mal la flecha, el gálibo y la
//      cantidad de conductor. Cuando chocan no se elige: se enseña lo propio y
//      se dice qué quedó fuera.
//
//   5. «NO HAY» Y «NO SE PUDO LEER» SON COSAS DISTINTAS (`32 · L-44`). Que una
//      cuenta no alcance el tramo no puede convertirse en «esta línea no tiene
//      torres»: la línea abre y el hueco queda declarado con su motivo.
//
//   6. EL ORDEN DEL PARQUE LO DECIDE EL NAVEGADOR. Nunca un `orderBy` en la
//      consulta: pediría un índice compuesto que **el emulador no exige**
//      (`35 · L-85`) —verde aquí, parque vacío en producción— y además dejaría
//      fuera las líneas sin ese campo en vez de ponerlas al final.
//
// POR QUÉ LA MITAD SE PRUEBA COMO TEXTO. `web/src/datos/firestore.ts` arrastra
// el SDK de Firebase y no se puede importar desde `node --test`. Por eso todo
// lo que DECIDE (qué series hay, qué se junta, qué falta, en qué orden) vive en
// `web/src/datos/repositorio.ts`, que no importa nada en tiempo de ejecución y
// se prueba de verdad; lo que queda en `firestore.ts` es pedir, y de eso se
// comprueba la FORMA de la consulta leyendo el archivo, como ya hacen
// `cerrojo-revision` y `cargabilidad-historico`.
//
// ⚠️ MUNDO SINTÉTICO: una subestación inventada, líneas `LX-1`/`LX-2` y un
// tramo `TR-9`. Ni una coordenada, ni un nombre, ni un código reales — y las
// coordenadas van al ecuador y al meridiano de Greenwich (`33 · L-23`).
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  apoyosDeLasSeries,
  avisosDeDatos,
  faltasDeLinea,
  faltasYHuecosDeLinea,
  juntarSeries,
  ordenarLevantamientos,
  ordenarParque,
  recorteDeSerie,
  repositorioSinSesion,
  seriesAvaladas,
  seriesDeLinea,
  vecinasDeLinea,
} from '../web/src/datos/repositorio.ts';
import { Apoyo, Linea } from '../contratos/src/activos.ts';
import { Levantamiento } from '../contratos/src/levantamiento.ts';
// El MISMO intérprete del libro que usa la aplicación (`registroCodigos.ts`).
// No se relee el JSON a mano: si mañana cambia qué es una fila válida, cambia
// en un solo sitio y esta prueba se entera.
import { codigosDelLibro, idDelLibro } from '../importar/identidad.js';
import { leerCodigos } from '../herramientas/identidad.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => readFileSync(join(RAIZ, p), 'utf-8');
const FIRESTORE = leer('web/src/datos/firestore.ts');
const ENLACE = leer('web/src/datos/enlace.ts');
const REPOSITORIO = leer('web/src/datos/repositorio.ts');
const REGISTRO_CODIGOS = leer('web/src/datos/registroCodigos.ts');
const CARGABILIDAD_REPO = leer('web/src/datos/cargabilidadRepo.ts');
const APP = leer('web/src/App.tsx');

/**
 * El cuerpo de UN método del repositorio, recortado hasta el siguiente —sea el
 * `async` de al lado o el comentario que lo presenta—. Sin este corte, una
 * comprobación de «aquí no hay `orderBy`» se leería el método siguiente y
 * pasaría o fallaría por lo que hace otro: verde que engaña.
 */
function metodo(nombre) {
  const i = FIRESTORE.indexOf(`async ${nombre}(`);
  assert.ok(i > 0, `no existe el método ${nombre} en el repositorio de Firestore`);
  const siguiente = ['\n  async ', '\n  /**']
    .map((marca) => FIRESTORE.indexOf(marca, i + 10))
    .filter((x) => x !== -1);
  return FIRESTORE.slice(i, siguiente.length ? Math.min(...siguiente) : undefined);
}

/**
 * El mismo cuerpo SIN comentarios. Hace falta para las comprobaciones de «aquí
 * no se llama a X»: los comentarios de este repositorio explican justamente lo
 * que NO se hace y por qué, así que buscar la palabra a secas encontraría la
 * explicación y daría por roto lo que está bien.
 */
const sinComentarios = (txt) => txt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// ── El mundo sintético ──────────────────────────────────────────────────────

const ORG = 'org-de-prueba';
const QUIEN = 'uid-de-prueba';
const AYER = '2026-09-15T14:00:00.000Z';
const HOY = '2026-09-17T14:00:00.000Z';

/** Identificadores inventados con forma de UUID: el molde exige UUID. */
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

const ID_LX1 = uuid(1);
const ID_LX2 = uuid(2);
const ID_TR9 = uuid(9);

/**
 * Un conductor INVENTADO que cumple el molde. Sus cifras no se usan en ninguna
 * comprobación: aquí solo importa si el campo está o no está.
 */
const CONDUCTOR = {
  codigo: 'Inventado',
  material: 'ACSR',
  seccion_mm2: 100,
  diametro_m: 0.0125,
  masaLineal_kg_m: 0.4,
  rts_kgf: 3000,
  moduloElastico_kg_mm2: 6000,
  moduloEs: 'no_declarado',
  dilatacion_1_C: 0.000019,
  tempMaxOperacion_C: 75,
  procedencia: 'supuesto',
};

/** Una línea del molde, validada. Lo que no se diga, no está. */
function linea({ id = ID_LX1, codigo = 'LX-1', creadoEn = AYER, tramos, conductor, hipotesisId } = {}) {
  return Linea.parse({
    id,
    orgId: ORG,
    creadoEn,
    creadoPor: QUIEN,
    revision: 0,
    tipo: 'linea',
    codigo,
    nombre: `Línea inventada ${codigo}`,
    tensionNominal_kV: 110,
    circuitos: 1,
    ...(conductor ? { conductor: CONDUCTOR } : {}),
    ...(hipotesisId ? { hipotesisId } : {}),
    ...(tramos ? { tramosCompartidos: tramos } : {}),
  });
}

/** Una declaración de tramo compartido, abierta salvo que se cierre. */
function declaracion({ id = ID_TR9, codigo = 'TR-9', desde, hasta, cierre } = {}) {
  return {
    id,
    codigo,
    ...(desde ? { desdeApoyoId: desde } : {}),
    ...(hasta ? { hastaApoyoId: hasta } : {}),
    procedencia: 'documento_proyecto',
    fuente: 'plano inventado de la prueba',
    declaradoEn: AYER,
    declaradoPor: QUIEN,
    ...(cierre ? { cierre } : {}),
  };
}

/** Un punto del molde, validado. Ecuador y Greenwich. */
function apoyo(serieId, orden, nombre) {
  return Apoyo.parse({
    id: uuid(1000 + orden + (serieId === ID_TR9 ? 100 : 0)),
    orgId: ORG,
    creadoEn: AYER,
    creadoPor: QUIEN,
    revision: 0,
    tipo: 'apoyo',
    lineaId: serieId,
    orden,
    tipoPunto: 'Estructura',
    nombreCampo: nombre,
    coordenada: { lat: 0, lon: orden * 0.001, sistemaReferencia: 'WGS84' },
    funcionEstructural: 'Suspensión',
    funcionProcedencia: 'levantamiento_campo',
  });
}

/** Un levantamiento del molde, validado. */
function levantamiento({ serieId = ID_TR9, codigoSerie = 'TR-9', fecha, cargadoEn = HOY, huella = 'a'.repeat(64) } = {}) {
  return Levantamiento.parse({
    id: uuid(7000 + Number(String(fecha).replace(/\D/g, '').slice(-4))),
    orgId: ORG,
    creadoEn: cargadoEn,
    creadoPor: QUIEN,
    revision: 0,
    tipo: 'levantamiento',
    serieId,
    codigoSerie,
    fecha,
    archivo: { nombre: 'recorrido-inventado.gpx', huella },
    cargadoEn,
    cargadoPor: QUIEN,
    puntos: [{ nombreCampo: 'P1', lat: 0, lon: 0.001 }],
  });
}

/**
 * EL LIBRO DE CÓDIGOS DEL MUNDO INVENTADO: código de serie → id emitido.
 *
 * Tiene la misma forma que el que `registroCodigos.ts` construye del libro de
 * verdad (un `Map`), y por eso la comprobación se puede probar aquí sin
 * archivo, sin base y sin un solo código real.
 */
const LIBRO = new Map([['LX-1', ID_LX1], ['LX-2', ID_LX2], ['TR-9', ID_TR9]]);

/**
 * Un lector de mentira que CUENTA las consultas. Es la pieza que convierte
 * «hace las mismas consultas que hoy» en un número comprobable en vez de una
 * afirmación de un comentario.
 */
function lector(porSerie) {
  const consultas = [];
  return {
    consultas,
    pedir: async (serie) => {
      consultas.push(serie.id);
      const r = porSerie[serie.id];
      if (r instanceof Error) throw r;
      return r ?? [];
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
describe('qué le falta a la línea para poder calcular', () => {
  test('una línea completa no tiene ninguna falta: sigue por el camino de hoy', () => {
    assert.deepEqual(faltasDeLinea({ conductor: CONDUCTOR, hipotesis: { id: 'h' }, apoyos: 26 }), []);
  });

  test('recién dada de alta: faltan las tres, y siempre en el mismo orden', () => {
    assert.deepEqual(
      faltasDeLinea({ conductor: undefined, hipotesis: null, apoyos: 0 }),
      ['conductor', 'hipotesis', 'torres'],
      'el orden es fijo para que dos capturas del mismo día se puedan comparar',
    );
  });

  test('con conductor pero sin hipótesis ni torres, solo faltan esas dos', () => {
    assert.deepEqual(faltasDeLinea({ conductor: CONDUCTOR, hipotesis: null, apoyos: 0 }), ['hipotesis', 'torres']);
  });

  test('UN solo punto sigue siendo «faltan torres»: con uno no hay ni un vano', () => {
    assert.deepEqual(faltasDeLinea({ conductor: CONDUCTOR, hipotesis: { id: 'h' }, apoyos: 1 }), ['torres']);
    assert.deepEqual(faltasDeLinea({ conductor: CONDUCTOR, hipotesis: { id: 'h' }, apoyos: 2 }), [],
      'con dos ya hay un vano: es el mismo umbral de siempre, solo que ahora se NOMBRA');
  });

  test('la fase «recorrido» NO tiene dónde meter el conductor ni la hipótesis de otra línea', () => {
    const i = REPOSITORIO.indexOf("| { fase: 'recorrido';");
    assert.ok(i > 0, 'la fase «recorrido» tiene que existir en el molde de la capa de datos');
    const declaracionDeFase = REPOSITORIO.slice(i, REPOSITORIO.indexOf("| { fase: 'listo';", i));
    assert.ok(!/\bconductor\s*:/.test(declaracionDeFase),
      'si la fase tuviera campo «conductor», alguien acabaría rellenándolo con el de otra línea');
    assert.ok(!/\bhipotesis\s*:/.test(declaracionDeFase),
      'lo mismo con las hipótesis: no hay campo, así que no hay dónde copiarlas');
    assert.match(declaracionDeFase, /faltan: FaltaDeLinea\[\]/,
      'lo que sí trae es la lista de lo que le falta');
  });

  test('el lector devuelve «recorrido» —no «vacío» ni «error»— cuando falta algo', () => {
    const cuerpo = metodo('cargarLinea');
    assert.match(cuerpo, /if \(!revisado\.puedeCalcular\) \{[\s\S]*fase: 'recorrido'/,
      'con faltas —o con algo declarado que no se pudo leer—, la línea abre en «recorrido»');
    assert.ok(!/apoyos\.length < 2\) return \{ fase: 'vacio' \}/.test(cuerpo),
      'menos de dos puntos ya NO manda la línea a «vacío»: eso se llevaba el parque por delante');
    assert.ok(!/no tiene conductor declarado[\s\S]*fase: 'error'/.test(cuerpo),
      'la falta de conductor ya no es un error de pantalla');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('lectura por series — una torre, dos líneas', () => {
  test('una línea SIN tramos: UNA serie, UNA consulta, los mismos puntos de hoy', async () => {
    const l = linea({ conductor: true, hipotesisId: uuid(500) });
    const series = seriesDeLinea(l);
    assert.equal(series.length, 1, 'sin tramos declarados no hay más serie que la propia línea');
    assert.deepEqual(series[0], { tipo: 'linea', id: ID_LX1, codigo: 'LX-1' });

    const propios = [apoyo(ID_LX1, 1, 'A'), apoyo(ID_LX1, 2, 'B'), apoyo(ID_LX1, 3, 'C')];
    const { consultas, pedir } = lector({ [ID_LX1]: propios });
    const r = await apoyosDeLasSeries(series, pedir);

    assert.equal(consultas.length, 1, 'ni una consulta más que ayer: es lo que protege a la línea que ya funciona');
    assert.deepEqual(consultas, [ID_LX1]);
    assert.deepEqual(r.apoyos, propios, 'y los mismos puntos, en el mismo orden');
    assert.deepEqual(r.avisos, []);
    assert.equal(r.noSePudoLeer, undefined);
  });

  test('con un tramo compartido: DOS consultas y los puntos juntados por orden', async () => {
    const l = linea({ tramos: [declaracion()] });
    const series = seriesDeLinea(l);
    assert.deepEqual(series.map((s) => s.tipo), ['linea', 'tramo'], 'la propia va siempre la primera');
    assert.equal(series[1].codigo, 'TR-9');

    const propios = [apoyo(ID_LX1, 40, 'PROPIO-40'), apoyo(ID_LX1, 41, 'PROPIO-41')];
    const delTramo = [apoyo(ID_TR9, 7, 'T-07'), apoyo(ID_TR9, 8, 'T-08'), apoyo(ID_TR9, 9, 'T-09')];
    const { consultas, pedir } = lector({ [ID_LX1]: propios, [ID_TR9]: delTramo });
    const r = await apoyosDeLasSeries(series, pedir);

    assert.deepEqual(consultas, [ID_LX1, ID_TR9], 'una consulta por serie, ni una más');
    assert.deepEqual(r.apoyos.map((a) => a.orden), [7, 8, 9, 40, 41],
      'se juntan por `orden`, que es lo que ordena los vanos');
    assert.deepEqual(r.avisos, []);
  });

  test('una línea SIN torres propias abre con las del tramo y nada más', async () => {
    const l = linea({ tramos: [declaracion()] });
    const delTramo = [apoyo(ID_TR9, 7, 'T-07'), apoyo(ID_TR9, 8, 'T-08')];
    const { consultas, pedir } = lector({ [ID_LX1]: [], [ID_TR9]: delTramo });
    const r = await apoyosDeLasSeries(seriesDeLinea(l), pedir);
    assert.equal(consultas.length, 2, 'la serie propia se pregunta igual: que hoy esté vacía no se supone');
    assert.deepEqual(r.apoyos, delTramo);
  });

  test('un tramo CERRADO no se consulta y no trae ni una torre', async () => {
    for (const tipo of ['fin', 'correccion']) {
      const cerrado = declaracion({
        cierre: { tipo, en: HOY, por: QUIEN, motivo: 'motivo inventado de la prueba' },
      });
      const series = seriesDeLinea(linea({ tramos: [cerrado] }));
      assert.equal(series.length, 1, `un cierre «${tipo}» saca al tramo de la lectura de hoy`);

      const { consultas } = lector({});
      assert.ok(!consultas.includes(ID_TR9));
    }
  });

  test('la declaración cerrada NO se borra: la historia sigue en el documento', () => {
    const cerrado = declaracion({ cierre: { tipo: 'fin', en: HOY, por: QUIEN, motivo: 'se seccionó' } });
    const l = linea({ tramos: [cerrado] });
    assert.equal(l.tramosCompartidos.length, 1,
      'el informe firmado el año pasado llevaba esas torres dentro: borrar la entrada lo haría indefendible');
    assert.equal(seriesDeLinea(l).length, 1, 'pero ya no trae torres a la pantalla de hoy');
  });

  test('cerrada + abierta del mismo tramo: se lee la abierta, una sola vez', () => {
    const l = linea({
      tramos: [
        declaracion({ cierre: { tipo: 'correccion', en: AYER, por: QUIEN, motivo: 'estaba mal acotado' } }),
        declaracion({ desde: uuid(1107) }),
      ],
    });
    const series = seriesDeLinea(l);
    assert.equal(series.length, 2, 'la forma correcta de corregir es cerrar y abrir otra, no duplicar');
    assert.equal(series[1].desdeApoyoId, uuid(1107));
  });

  test('desde/hasta recorta el tramo, y nada más', () => {
    const delTramo = [7, 8, 9, 10, 11].map((n) => apoyo(ID_TR9, n, `T-${n}`));
    const serie = seriesDeLinea(linea({
      tramos: [declaracion({ desde: delTramo[1].id, hasta: delTramo[3].id })],
    }))[1];
    const r = recorteDeSerie(delTramo, serie);
    assert.deepEqual(r.apoyos.map((a) => a.orden), [8, 9, 10], 'los extremos entran; lo de fuera, no');
    assert.equal(r.aviso, undefined);
  });

  test('sin desde ni hasta se recorre el tramo entero', () => {
    const delTramo = [7, 8, 9].map((n) => apoyo(ID_TR9, n, `T-${n}`));
    const serie = seriesDeLinea(linea({ tramos: [declaracion()] }))[1];
    assert.deepEqual(recorteDeSerie(delTramo, serie).apoyos, delTramo);
  });

  test('un extremo que NO está en el tramo: cero torres y se dice por qué', () => {
    const delTramo = [7, 8, 9].map((n) => apoyo(ID_TR9, n, `T-${n}`));
    const serie = seriesDeLinea(linea({ tramos: [declaracion({ desde: uuid(4242) })] }))[1];
    const r = recorteDeSerie(delTramo, serie);
    assert.deepEqual(r.apoyos, [], 'no se devuelve el tramo entero «por si acaso»');
    assert.match(r.aviso, /TR-9/);
    assert.match(r.aviso, /no pasa|no está registrado/,
      'la frase tiene que decir qué pasó, no solo que algo falló');
  });

  test('acotado al revés: tampoco se adivina el sentido', () => {
    const delTramo = [7, 8, 9].map((n) => apoyo(ID_TR9, n, `T-${n}`));
    const serie = seriesDeLinea(linea({
      tramos: [declaracion({ desde: delTramo[2].id, hasta: delTramo[0].id })],
    }))[1];
    const r = recorteDeSerie(delTramo, serie);
    assert.deepEqual(r.apoyos, []);
    assert.match(r.aviso, /al revés|sentido/);
  });

  test('dos series con la numeración pisada NO se mezclan: se enseña lo propio y se dice', async () => {
    const l = linea({ tramos: [declaracion()] });
    // Las dos numeradas 1..3: juntarlas daría vanos entre puntos que no son vecinos.
    const propios = [1, 2, 3].map((n) => apoyo(ID_LX1, n, `P-${n}`));
    const delTramo = [1, 2, 3].map((n) => apoyo(ID_TR9, n, `T-${n}`));
    const { pedir } = lector({ [ID_LX1]: propios, [ID_TR9]: delTramo });
    const r = await apoyosDeLasSeries(seriesDeLinea(l), pedir);

    assert.deepEqual(r.apoyos, propios, 'se queda lo que se veía ayer: los puntos propios de la línea');
    assert.equal(r.avisos.length, 1);
    assert.match(r.avisos[0], /LX-1 y TR-9/);
    assert.match(r.avisos[0], /vanos que no existen/,
      'el aviso tiene que decir el daño, no solo que no se pudo');
  });

  test('si falla la consulta del TRAMO, la línea abre igual y el hueco queda declarado', async () => {
    const l = linea({ tramos: [declaracion()] });
    const propios = [apoyo(ID_LX1, 1, 'A'), apoyo(ID_LX1, 2, 'B')];
    const { pedir } = lector({
      [ID_LX1]: propios,
      [ID_TR9]: new Error('Missing or insufficient permissions'),
    });
    const r = await apoyosDeLasSeries(seriesDeLinea(l), pedir);

    assert.deepEqual(r.apoyos, propios, 'la línea no se queda sin pantalla por un tramo que no se pudo leer');
    assert.match(r.noSePudoLeer, /TR-9/);
    assert.match(r.noSePudoLeer, /Missing or insufficient permissions/,
      'el motivo no se traga: «no hay torres» y «no se pudieron mirar» son cosas distintas');
  });

  test('si falla la consulta PROPIA, falla la línea entera — exactamente como hoy', async () => {
    const l = linea();
    const { pedir } = lector({ [ID_LX1]: new Error('se cayó la red') });
    await assert.rejects(
      () => apoyosDeLasSeries(seriesDeLinea(l), pedir),
      /se cayó la red/,
      'para las líneas de hoy no cambia nada: un fallo leyendo sus puntos sigue siendo un error',
    );
  });

  test('un tramo declarado con el id de la propia línea no se consulta dos veces', async () => {
    const l = linea({ tramos: [declaracion({ id: ID_LX1, codigo: 'TR-9' })] });
    const { consultas, pedir } = lector({ [ID_LX1]: [apoyo(ID_LX1, 1, 'A')] });
    await apoyosDeLasSeries(seriesDeLinea(l), pedir);
    assert.deepEqual(consultas, [ID_LX1], 'leerla dos veces duplicaría cada punto en pantalla');
  });

  test('el mismo punto no sale dos veces aunque venga de dos lecturas', () => {
    const repetido = apoyo(ID_TR9, 7, 'T-07');
    const r = juntarSeries([
      { serie: { tipo: 'linea', id: ID_LX1, codigo: 'LX-1' }, apoyos: [apoyo(ID_LX1, 40, 'P-40')] },
      { serie: { tipo: 'tramo', id: ID_TR9, codigo: 'TR-9' }, apoyos: [repetido, repetido] },
    ]);
    assert.equal(r.apoyos.filter((a) => a.id === repetido.id).length, 1);
  });

  test('juntar no altera el orden dentro de una misma serie con `orden` repetido', () => {
    const a = apoyo(ID_TR9, 7, 'T-07a');
    const b = { ...apoyo(ID_TR9, 8, 'T-07b'), orden: 7 };
    const r = juntarSeries([{ serie: { tipo: 'tramo', id: ID_TR9, codigo: 'TR-9' }, apoyos: [a, b] }]);
    assert.deepEqual(r.apoyos.map((x) => x.nombreCampo), ['T-07a', 'T-07b'],
      'una ordenación inestable movería puntos de sitio entre dos repintados');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL LIBRO DE CÓDIGOS AMARRA EL RÓTULO CON EL IDENTIFICADOR
// ----------------------------------------------------------------------------
// Una declaración de tramo lleva dos campos independientes: el `codigo` que se
// ENSEÑA y el `id` con el que se PIDEN las torres. El molde no puede cruzarlos
// —no puede importar el libro—, así que sin esta comprobación una línea podía
// declarar `{ codigo: 'TR-618', id: <el id de otra línea> }` y traerse las
// torres de esa otra línea rotuladas como del tramo, en silencio, dentro de su
// cálculo y de su informe. Al revés —un id con un dígito cambiado— traía cero
// torres, también en silencio.
// ════════════════════════════════════════════════════════════════════════════
describe('el código y el id de un tramo tienen que cuadrar en el libro', () => {
  /** El mismo id del tramo con el ÚLTIMO dígito cambiado. */
  const ID_TR9_TORCIDO = `${ID_TR9.slice(0, -1)}1`;

  test('CASO BUENO: el par que el libro dice se lee y se junta', async () => {
    const l = linea({ tramos: [declaracion()] });
    const propios = [apoyo(ID_LX1, 40, 'P-40')];
    const delTramo = [apoyo(ID_TR9, 7, 'T-07'), apoyo(ID_TR9, 8, 'T-08')];
    const { consultas, pedir } = lector({ [ID_LX1]: propios, [ID_TR9]: delTramo });
    const r = await apoyosDeLasSeries(seriesDeLinea(l), pedir, LIBRO);

    assert.deepEqual(consultas, [ID_LX1, ID_TR9], 'el tramo que cuadra se pide igual que siempre');
    assert.deepEqual(r.apoyos.map((a) => a.orden), [7, 8, 40]);
    assert.deepEqual(r.avisos, [], 'y no se avisa de nada: no hay nada que avisar');
  });

  test('EL ID DE OTRA LÍNEA bajo el código del tramo: ni se pide, y se dice por qué', async () => {
    // Esto es el daño concreto: TR-9 con el identificador de LX-2 se traería
    // las torres de LX-2 rotuladas «del tramo compartido».
    const l = linea({ tramos: [declaracion({ id: ID_LX2, codigo: 'TR-9' })] });
    const propios = [apoyo(ID_LX1, 40, 'P-40'), apoyo(ID_LX1, 41, 'P-41')];
    const { consultas, pedir } = lector({ [ID_LX1]: propios, [ID_LX2]: [apoyo(ID_LX2, 1, 'AJENA')] });
    const r = await apoyosDeLasSeries(seriesDeLinea(l), pedir, LIBRO);

    assert.deepEqual(consultas, [ID_LX1],
      'la serie que no cuadra NO se consulta: se ahorra la lectura y no entra ni una torre ajena');
    assert.deepEqual(r.apoyos, propios, 'la línea abre con lo suyo, como ayer');
    assert.equal(r.avisos.length, 1);
    assert.match(r.avisos[0], /TR-9/);
    assert.match(r.avisos[0], /torres de otra serie/,
      'el aviso tiene que decir el daño que se evitó, no solo que algo no cuadró');
    assert.equal(r.noSePudoLeer, undefined,
      'no es un fallo de lectura: es una declaración que no cuadra, y son cosas distintas');
  });

  test('UN DÍGITO CAMBIADO en el id del tramo: tampoco se pide, y tampoco en silencio', async () => {
    const l = linea({ tramos: [declaracion({ id: ID_TR9_TORCIDO, codigo: 'TR-9' })] });
    const { consultas, pedir } = lector({ [ID_LX1]: [apoyo(ID_LX1, 1, 'A'), apoyo(ID_LX1, 2, 'B')] });
    const r = await apoyosDeLasSeries(seriesDeLinea(l), pedir, LIBRO);

    assert.deepEqual(consultas, [ID_LX1]);
    assert.equal(r.avisos.length, 1);
    assert.match(r.avisos[0], /TR-9/);
    assert.match(r.avisos[0], new RegExp(ID_TR9),
      'se dice cuál es el identificador BUENO, que es lo que hace falta para corregir la declaración');
    assert.match(r.avisos[0], new RegExp(ID_TR9_TORCIDO), 'y cuál es el declarado');
  });

  test('un código que NO está anotado en el libro se rechaza igual', () => {
    const series = seriesDeLinea(linea({ tramos: [declaracion({ id: ID_TR9, codigo: 'TR-77' })] }));
    const r = seriesAvaladas(series, LIBRO);
    assert.deepEqual(r.series.map((s) => s.codigo), ['LX-1'], 'solo queda la propia');
    assert.match(r.avisos[0], /no está en el libro/,
      'el libro se despliega con el repositorio: lo que no está anotado es que nadie lo emitió');
  });

  test('la serie PROPIA nunca se deja fuera, aunque el libro discrepe: se avisa y se sigue', async () => {
    // Su id no sale de una declaración: es el documento que se acaba de abrir.
    // Dejarla fuera convertiría un rótulo mal anotado en una línea sin torres.
    const l = linea({ id: ID_LX2, codigo: 'LX-1' });          // el libro dice que LX-1 es ID_LX1
    const propios = [apoyo(ID_LX2, 1, 'A'), apoyo(ID_LX2, 2, 'B')];
    const { consultas, pedir } = lector({ [ID_LX2]: propios });
    const r = await apoyosDeLasSeries(seriesDeLinea(l), pedir, LIBRO);

    assert.deepEqual(consultas, [ID_LX2], 'se pide igual: son sus torres');
    assert.deepEqual(r.apoyos, propios);
    assert.equal(r.avisos.length, 1);
    assert.match(r.avisos[0], /no concuerdan|conviene revisarlo/,
      'pero el desacuerdo entre el rótulo y el identificador se dice');
  });

  test('SIN libro no se comprueba nada: los llamadores que no lo tienen siguen igual', async () => {
    const l = linea({ tramos: [declaracion({ id: ID_LX2, codigo: 'TR-9' })] });
    const { consultas, pedir } = lector({ [ID_LX1]: [], [ID_LX2]: [apoyo(ID_LX2, 1, 'X')] });
    const r = await apoyosDeLasSeries(seriesDeLinea(l), pedir);
    assert.deepEqual(consultas, [ID_LX1, ID_LX2], 'es el comportamiento de ayer, intacto');
    assert.deepEqual(seriesAvaladas(seriesDeLinea(l), undefined).avisos, []);
    assert.equal(r.apoyos.length, 1);
  });

  test('EL LIBRO DE VERDAD: el par de TR-618 se acepta y el de otra línea se rechaza', () => {
    // Se construye con el MISMO intérprete que usa `registroCodigos.ts`, y con
    // el libro real del repositorio: lo que se prueba aquí es el archivo que se
    // va a desplegar, no una copia de mentira.
    const crudo = leerCodigos();
    const real = new Map(codigosDelLibro(crudo).map((c) => [c, idDelLibro(crudo, c)]));
    assert.ok(real.has('TR-618'), 'el tramo compartido 618 está anotado en el libro');
    assert.ok(real.has('LN-627') && real.has('LN-617') && real.has('LN-628'));

    const bueno = [{ tipo: 'tramo', id: real.get('TR-618'), codigo: 'TR-618' }];
    assert.deepEqual(seriesAvaladas(bueno, real).series, bueno, 'el par anotado pasa');

    const suplantado = [{ tipo: 'tramo', id: real.get('LN-628'), codigo: 'TR-618' }];
    const r = seriesAvaladas(suplantado, real);
    assert.deepEqual(r.series, [], 'con el id de LN-628 bajo el rótulo del tramo no se lee nada');
    assert.match(r.avisos[0], /TR-618/);
  });

  test('el lector le PASA el libro: si no, la comprobación no existiría en producción', () => {
    const cuerpo = metodo('cargarLinea');
    assert.match(cuerpo, /apoyosDeLasSeries\(series, pedirApoyos, LIBRO_DE_CODIGOS\)/,
      'la comprobación es pura y está probada, pero solo sirve si el lector le entrega el libro');
    assert.match(FIRESTORE, /import \{ LIBRO_DE_CODIGOS \} from '\.\/registroCodigos'/);
  });

  test('el libro se LEE de `herramientas/`, y lo interpreta quien ya sabía', () => {
    assert.match(REGISTRO_CODIGOS, /from '\.\.\/\.\.\/\.\.\/herramientas\/codigos-emitidos\.json'/,
      'el libro no se mueve de sitio: hay pruebas que fijan esa ruta porque de esos ids cuelga todo');
    assert.match(REGISTRO_CODIGOS, /from '@lineas\/importar\/identidad'/,
      'qué es una fila válida se decide en UN sitio: un segundo intérprete es una segunda verdad');
    assert.match(REGISTRO_CODIGOS, /new Map<string, string>\(\)/,
      'un `Map` y no un objeto: preguntar por un código llamado «constructor» devolvería una función');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el tramo que no trajo ni una torre lo DICE', () => {
  test('la consulta fue bien y vino vacía: eso no es «no se pudo leer», y se distingue', async () => {
    const l = linea({ tramos: [declaracion()] });
    const propios = [apoyo(ID_LX1, 1, 'A'), apoyo(ID_LX1, 2, 'B')];
    const { consultas, pedir } = lector({ [ID_LX1]: propios, [ID_TR9]: [] });
    const r = await apoyosDeLasSeries(seriesDeLinea(l), pedir, LIBRO);

    assert.deepEqual(consultas, [ID_LX1, ID_TR9], 'se preguntó de verdad');
    assert.deepEqual(r.apoyos, propios);
    assert.equal(r.avisos.length, 1, 'hasta hoy esto era indistinguible de no haber preguntado');
    assert.match(r.avisos[0], /TR-9/);
    assert.match(r.avisos[0], /ninguna torre registrada/);
    assert.match(r.avisos[0], /no es que no se hayan podido leer/,
      'la frase tiene que separar el estado del tramo de un fallo de lectura');
    assert.equal(r.noSePudoLeer, undefined);
  });

  test('un tramo que NO se pudo leer sigue yendo por el otro camino', async () => {
    const l = linea({ tramos: [declaracion()] });
    const { pedir } = lector({
      [ID_LX1]: [apoyo(ID_LX1, 1, 'A'), apoyo(ID_LX1, 2, 'B')],
      [ID_TR9]: new Error('Missing or insufficient permissions'),
    });
    const r = await apoyosDeLasSeries(seriesDeLinea(l), pedir, LIBRO);
    assert.deepEqual(r.avisos, [], 'un fallo de lectura no se enseña como «este tramo está vacío»');
    assert.match(r.noSePudoLeer, /Missing or insufficient permissions/);
  });

  test('no se avisa dos veces: si el recorte ya explicó el cero, con eso basta', async () => {
    const l = linea({ tramos: [declaracion({ desde: uuid(4242) })] });   // extremo que no está
    const { pedir } = lector({ [ID_LX1]: [], [ID_TR9]: [apoyo(ID_TR9, 7, 'T-07')] });
    const r = await apoyosDeLasSeries(seriesDeLinea(l), pedir, LIBRO);
    assert.equal(r.avisos.length, 1, 'dos frases para el mismo cero se leen como dos problemas');
    assert.match(r.avisos[0], /no está registrado/);
  });

  test('de la línea PROPIA no se avisa: para eso está `faltan: [torres]`', async () => {
    const l = linea();
    const { pedir } = lector({ [ID_LX1]: [] });
    const r = await apoyosDeLasSeries(seriesDeLinea(l), pedir, LIBRO);
    assert.deepEqual(r.avisos, [], 'una línea recién dada de alta no tiene por qué enseñar un aviso');
    assert.deepEqual(faltasDeLinea({ conductor: null, hipotesis: null, apoyos: r.apoyos.length }),
      ['conductor', 'hipotesis', 'torres']);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// «FALTA DECLARAR» NO ES «NO SE PUDO LEER»
// ----------------------------------------------------------------------------
// Un fallo leyendo las hipótesis llegaba a `faltan: ['hipotesis']`, que la
// pantalla enumera como «falta declarar las hipótesis». Es afirmar algo falso
// sobre la línea: las declara, y lo que falló fue la red, el permiso o el
// molde. Es `32 · L-44` otra vez — un tercer estado aplanado en dos.
// ════════════════════════════════════════════════════════════════════════════
describe('lo que falta declarar y lo que no se pudo leer van separados', () => {
  const CON_TODO = { conductor: CONDUCTOR, hipotesisDeclarada: true, hipotesis: { id: 'h' }, apoyos: 26 };

  test('línea completa: no falta nada, no hay hueco y calcula como siempre', () => {
    const r = faltasYHuecosDeLinea(CON_TODO);
    assert.deepEqual(r.faltan, []);
    assert.deepEqual(r.noSePudoLeer, {});
    assert.equal(r.puedeCalcular, true);
  });

  test('sin `hipotesisId`: eso SÍ es una falta, y no hay motivo que dar', () => {
    const r = faltasYHuecosDeLinea({ ...CON_TODO, hipotesisDeclarada: false, hipotesis: null });
    assert.deepEqual(r.faltan, ['hipotesis'], 'nadie las ha entregado todavía: se enumera como falta');
    assert.deepEqual(r.noSePudoLeer, {});
    assert.equal(r.puedeCalcular, false);
  });

  test('DECLARADAS y no leídas: NO es una falta, es un hueco con su motivo', () => {
    const r = faltasYHuecosDeLinea({
      ...CON_TODO,
      hipotesis: null,
      falloHipotesis: 'Missing or insufficient permissions',
    });
    assert.deepEqual(r.faltan, [],
      'la pantalla habría dicho «falta declarar las hipótesis» de una línea que las declara');
    assert.equal(r.noSePudoLeer.hipotesis, 'Missing or insufficient permissions',
      'el motivo no se traga: es lo único que dice si se reintenta o si se llama al administrador');
    assert.equal(r.puedeCalcular, false,
      'y aun así NO puede calcular: con las hipótesis sin leer no hay con qué');
  });

  test('sin motivo tampoco se inventa un silencio: el hueco se declara igual', () => {
    const r = faltasYHuecosDeLinea({ ...CON_TODO, hipotesis: null });
    assert.deepEqual(r.faltan, []);
    assert.match(r.noSePudoLeer.hipotesis, /no se pudieron leer/);
    assert.equal(r.puedeCalcular, false);
  });

  test('el conductor y las torres se siguen contando igual, y en el mismo orden', () => {
    const r = faltasYHuecosDeLinea({ conductor: null, hipotesisDeclarada: false, apoyos: 1 });
    assert.deepEqual(r.faltan, ['conductor', 'hipotesis', 'torres'],
      'el orden es fijo para que dos capturas del mismo día se puedan comparar');
  });

  test('`faltasDeLinea` sigue existiendo y sin cambiar: nadie se queda sin su respuesta', () => {
    assert.deepEqual(faltasDeLinea({ conductor: CONDUCTOR, hipotesis: null, apoyos: 26 }), ['hipotesis'],
      'responde a «¿qué no está?» con lo que tiene en la mano; quien necesite separar el motivo usa la otra');
  });

  test('el lector le pasa lo que dice el DOCUMENTO, no solo lo leído', () => {
    const cuerpo = metodo('cargarLinea');
    assert.match(cuerpo, /hipotesisDeclarada: Boolean\(linea\.hipotesisId\)/,
      'sin esto, una lectura fallida es indistinguible de «esta línea no declara hipótesis»');
    assert.match(cuerpo, /falloHipotesis,/, 'y el motivo viaja con ella');
    assert.match(cuerpo, /\.\.\.revisado\.noSePudoLeer,/,
      'el hueco de la hipótesis sale de la revisión, no del fallo a pelo');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('los avisos, listos para que la pantalla solo tenga que pintarlos', () => {
  const base = {
    fase: 'recorrido',
    linea: linea(),
    apoyos: [],
    evidencias: [],
    investigaciones: [],
    faltan: ['torres'],
    levantamientos: [],
  };

  test('junta los de series y los de lectura, y dice de qué clase es cada uno', () => {
    const r = avisosDeDatos({
      ...base,
      avisosDeSeries: ['no se juntó el tramo TR-9'],
      noSePudoLeer: { torres: 'Missing or insufficient permissions', hipotesis: 'no cumplen el molde' },
    });
    assert.deepEqual(r.map((a) => a.clase), ['serie', 'lectura', 'lectura']);
    assert.equal(r[0].texto, 'no se juntó el tramo TR-9');
    assert.match(r[1].texto, /No se pudieron leer las torres: Missing or insufficient permissions/);
    assert.equal(r[2].de, 'las hipótesis de cálculo');
  });

  test('el orden es FIJO, venga como venga el estado', () => {
    const alReves = avisosDeDatos({
      ...base,
      noSePudoLeer: { investigaciones: 'a', evidencias: 'b', levantamientos: 'c', hipotesis: 'd', torres: 'e' },
    });
    assert.deepEqual(alReves.map((a) => a.de), [
      'las torres', 'las hipótesis de cálculo', 'los recorridos levantados',
      'las fichas de fotos', 'los expedientes de falla',
    ], 'un aviso que cambia de sitio entre dos repintados se lee como un aviso nuevo');
  });

  test('sin nada que advertir, no se inventa ningún aviso', () => {
    assert.deepEqual(avisosDeDatos(base), []);
    assert.deepEqual(avisosDeDatos({ fase: 'cargando' }), []);
    assert.deepEqual(avisosDeDatos({ fase: 'error', mensaje: 'x' }), []);
  });

  test('también sirve para una línea COMPLETA: es donde el silencio sale más caro', () => {
    const r = avisosDeDatos({
      fase: 'listo',
      linea: linea({ conductor: true }),
      apoyos: [],
      conductor: CONDUCTOR,
      hipotesis: { id: 'h' },
      investigaciones: [],
      evidencias: [],
      noSePudoLeer: { torres: 'el tramo no está en su alcance' },
    });
    assert.equal(r.length, 1);
    assert.match(r[0].texto, /No se pudieron leer las torres/,
      'una línea completa que calcula con la mitad de sus torres y no lo dice es el fallo más caro que hay');
  });

  test('está escrito que esto TODAVÍA no lo pinta nadie, y por qué se deja hecho', () => {
    const i = REPOSITORIO.indexOf('export function avisosDeDatos');
    const doc = REPOSITORIO.slice(Math.max(0, i - 2200), i);
    assert.match(doc, /no los lee nadie/,
      'el hueco se declara en vez de descubrirse el día que una línea calcule con la mitad de sus torres');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el parque, ordenado por fecha de alta', () => {
  const vieja = linea({ id: ID_LX1, codigo: 'LX-1', creadoEn: '2026-07-30T10:00:00.000Z' });
  const nueva = linea({ id: ID_LX2, codigo: 'LX-2', creadoEn: '2026-09-17T10:00:00.000Z' });

  test('la más antigua primero: sin enlace se abre la línea de siempre', () => {
    assert.deepEqual(ordenarParque([nueva, vieja]).map((l) => l.codigo), ['LX-1', 'LX-2']);
  });

  test('el orden NO es alfabético: LX-2 puede ser más vieja que LX-1', () => {
    const lx1Nueva = linea({ id: ID_LX1, codigo: 'LX-1', creadoEn: '2026-09-17T10:00:00.000Z' });
    const lx2Vieja = linea({ id: ID_LX2, codigo: 'LX-2', creadoEn: '2026-07-30T10:00:00.000Z' });
    assert.deepEqual(ordenarParque([lx1Nueva, lx2Vieja]).map((l) => l.codigo), ['LX-2', 'LX-1'],
      'ordenar por código habría puesto delante a la que se dio de alta después');
  });

  test('se comparan INSTANTES, no texto: el desplazamiento horario cuenta', () => {
    const conOffset = linea({ id: ID_LX1, codigo: 'LX-1', creadoEn: '2026-07-30T09:00:00.000-05:00' });  // 14:00 Z
    const enZeta = linea({ id: ID_LX2, codigo: 'LX-2', creadoEn: '2026-07-30T12:00:00.000Z' });
    assert.deepEqual(ordenarParque([conOffset, enZeta]).map((l) => l.codigo), ['LX-2', 'LX-1'],
      'alfabéticamente «09:00-05:00» va antes que «12:00Z», y en el reloj es tres horas después');
  });

  test('la que no traiga fecha legible va AL FINAL, no desaparece', () => {
    const sinFecha = { ...vieja, creadoEn: 'esto no es una fecha' };
    const r = ordenarParque([sinFecha, nueva]);
    assert.deepEqual(r.map((l) => l.codigo), ['LX-2', 'LX-1'],
      'con un `orderBy` en la consulta, Firestore la habría excluido del resultado');
  });

  test('dos sin fecha no rompen el orden: se desempata por código', () => {
    const a = { ...vieja, codigo: 'LX-1', creadoEn: 'nada' };
    const b = { ...nueva, codigo: 'LX-2', creadoEn: 'nada' };
    assert.deepEqual(ordenarParque([b, a]).map((l) => l.codigo), ['LX-1', 'LX-2'],
      'restar dos infinitos da NaN, y un comparador que devuelve NaN ordena distinto en cada navegador');
  });

  test('no muta la lista que recibe', () => {
    const entrada = [nueva, vieja];
    ordenarParque(entrada);
    assert.deepEqual(entrada.map((l) => l.codigo), ['LX-2', 'LX-1']);
  });

  test('el lector ordena en el NAVEGADOR y la consulta de líneas sigue sin `orderBy`', () => {
    const cuerpo = metodo('listarLineas');
    assert.match(cuerpo, /return ordenarParque\(/, 'el orden se aplica aquí, sobre lo ya leído');
    assert.ok(!/orderBy\(/.test(sinComentarios(cuerpo)),
      'un orderBy aquí pediría un índice que el emulador no exige: verde en pruebas, parque vacío en producción');
  });

  // ── UN SOLO ORDEN PARA EL MISMO PARQUE ────────────────────────────────────
  // El desplegable de Cargabilidad reordenaba por TEXTO lo que `listarLineas`
  // ya había ordenado por INSTANTE, y deshacía el orden bueno: la columna del
  // parque y ese desplegable enseñaban el mismo parque en distinto orden, que
  // se lee como dos parques distintos.
  test('el desplegable de Cargabilidad reusa `ordenarParque` y no inventa el suyo', () => {
    const i = CARGABILIDAD_REPO.indexOf('export async function lineasDelParque');
    assert.ok(i > 0);
    const cuerpo = CARGABILIDAD_REPO.slice(i, i + 400);
    assert.match(cuerpo, /return ordenarParque\(lineas\)/,
      'el criterio del orden del parque tiene UN dueño, y es `ordenarParque`');
    assert.ok(!/localeCompare/.test(sinComentarios(cuerpo)),
      'ordenar `creadoEn` como texto ignora el desplazamiento horario: «09:00-05:00» es POSTERIOR a «12:00Z»');
    assert.match(CARGABILIDAD_REPO, /import \{ ordenarParque \} from '\.\/repositorio'/);
  });

  test('el caso del propio repositorio: los dos órdenes daban listas distintas', () => {
    // Las mismas dos fechas que ya estaban escritas arriba en esta prueba.
    const conOffset = linea({ id: ID_LX1, codigo: 'LX-1', creadoEn: '2026-07-30T09:00:00.000-05:00' });
    const enZeta = linea({ id: ID_LX2, codigo: 'LX-2', creadoEn: '2026-07-30T12:00:00.000Z' });
    const porTexto = [conOffset, enZeta].slice()
      .sort((a, b) => String(a.creadoEn).localeCompare(String(b.creadoEn)) || a.codigo.localeCompare(b.codigo));
    assert.deepEqual(porTexto.map((l) => l.codigo), ['LX-1', 'LX-2'], 'lo que hacía el desplegable');
    assert.deepEqual(ordenarParque([conOffset, enZeta]).map((l) => l.codigo), ['LX-2', 'LX-1'],
      'y lo que hace el parque: por eso no puede haber dos criterios');
  });

  test('aplicarlo dos veces no mueve nada: reusarlo sobre lo ya ordenado es seguro', () => {
    const revuelto = [nueva, vieja, { ...vieja, id: ID_LX2, codigo: 'LX-3', creadoEn: 'nada' }];
    const unaVez = ordenarParque(revuelto);
    assert.deepEqual(ordenarParque(unaVez).map((l) => l.codigo), unaVez.map((l) => l.codigo));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('los recorridos levantados', () => {
  test('el más reciente primero, por el día que se RECORRIÓ y no por el que se cargó', () => {
    const agosto = levantamiento({ fecha: '2026-08-09', cargadoEn: '2026-09-17T10:00:00.000Z' });
    const julio = levantamiento({ fecha: '2026-07-01', cargadoEn: '2026-07-01T10:00:00.000Z' });
    assert.deepEqual(
      ordenarLevantamientos([julio, agosto]).map((l) => l.fecha),
      ['2026-08-09', '2026-07-01'],
      'el recorrido del 09-08 subido en septiembre sigue siendo del 09-08',
    );
  });

  test('dos jornadas del mismo día se desempatan por la carga, la última arriba', () => {
    const primera = levantamiento({ fecha: '2026-08-09', cargadoEn: '2026-09-17T08:00:00.000Z', huella: 'b'.repeat(64) });
    const segunda = levantamiento({ fecha: '2026-08-09', cargadoEn: '2026-09-17T18:00:00.000Z', huella: 'c'.repeat(64) });
    assert.deepEqual(
      ordenarLevantamientos([primera, segunda]).map((l) => l.cargadoEn),
      [segunda.cargadoEn, primera.cargadoEn],
    );
  });

  test('sin sesión no se inventa ninguno', async () => {
    assert.deepEqual(await repositorioSinSesion.listarLevantamientos([ID_TR9]), []);
  });

  test('la consulta filtra organización Y serie, y NO lleva orden: es el índice que existe', () => {
    const cuerpo = metodo('listarLevantamientos');
    assert.match(cuerpo, /collection\(db, 'levantamientos'\)/);
    assert.match(cuerpo, /where\('orgId', '==', orgId\)/,
      'en Firestore las reglas NO son filtros: sin declarar la organización se niega la consulta entera');
    assert.match(cuerpo, /where\('serieId', '==', serieId\)/);
    assert.ok(!/orderBy\(/.test(sinComentarios(cuerpo)),
      'el índice declarado es (orgId, serieId): un orderBy aquí sirve en el emulador y falla en producción');
    assert.match(cuerpo, /return ordenarLevantamientos\(/, 'el orden se pone en el cliente');
  });

  test('el índice de la consulta está declarado en el repositorio', () => {
    const indices = JSON.parse(leer('firestore.indexes.json'));
    const hay = indices.indexes.some((x) => x.collectionGroup === 'levantamientos'
      && x.fields.length === 2
      && x.fields[0].fieldPath === 'orgId'
      && x.fields[1].fieldPath === 'serieId');
    assert.ok(hay, 'toda consulta que filtra por dos campos se declara en el mismo cambio (`35 · L-85`)');
  });

  test('se leen SOLO cuando la línea no calcula: la línea completa no paga una lectura de más', () => {
    const cuerpo = metodo('cargarLinea');
    const desdeLaRama = cuerpo.indexOf('if (!revisado.puedeCalcular)');
    assert.ok(desdeLaRama > 0);
    assert.ok(cuerpo.indexOf('listarLevantamientos(') > desdeLaRama,
      'pedirlos siempre añadiría una lectura facturada a cada apertura de una línea que ya funciona');
  });

  test('lo que se devuelve pasa por el molde, y el molde prohíbe interpretar', () => {
    const crudo = levantamiento({ fecha: '2026-08-09' });
    assert.ok(Levantamiento.safeParse(crudo).success, 'el levantamiento de la prueba es un documento real');
    const conFuncion = { ...crudo, puntos: [{ ...crudo.puntos[0], funcionEstructural: 'Retención' }] };
    assert.equal(Levantamiento.safeParse(conFuncion).success, false,
      'la función estructural nace al REGISTRAR la torre, no al levantarla');
    assert.match(FIRESTORE, /validar<Levantamiento>\(Levantamiento, d\.data\(\)\)/,
      'y el lector lo hace cumplir: lo que no cumpla el molde no entra');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('las líneas vecinas de un tramo compartido', () => {
  const lx1 = linea({ id: ID_LX1, codigo: 'LX-1', tramos: [declaracion()] });
  const lx2 = linea({ id: ID_LX2, codigo: 'LX-2', tramos: [declaracion()] });

  test('cada una ve a la otra, y ninguna se ve a sí misma', () => {
    const v = vecinasDeLinea(lx1, [lx1, lx2]);
    assert.equal(v.length, 1);
    assert.equal(v[0].linea.codigo, 'LX-2');
    assert.equal(v[0].tramoCodigo, 'TR-9');
    assert.equal(v[0].tramoId, ID_TR9);
  });

  test('una línea sin tramos no tiene vecinas', () => {
    assert.deepEqual(vecinasDeLinea(linea(), [lx1, lx2]), []);
  });

  test('la vecina con la declaración CERRADA ya no cuenta', () => {
    const lx2Cerrada = linea({
      id: ID_LX2,
      codigo: 'LX-2',
      tramos: [declaracion({ cierre: { tipo: 'fin', en: HOY, por: QUIEN, motivo: 'se seccionó' } })],
    });
    assert.deepEqual(vecinasDeLinea(lx1, [lx1, lx2Cerrada]), []);
  });

  test('sin parque en memoria no se inventa ninguna vecina', () => {
    assert.deepEqual(vecinasDeLinea(lx1, undefined), []);
    assert.deepEqual(vecinasDeLinea(lx1, []), []);
  });

  test('salen de la lista que ya está en memoria: el puente no consulta la base', () => {
    assert.match(ENLACE, /conocidas \? \{ vecinas: vecinasDeLinea\(e\.linea, conocidas\) \} : \{\}/,
      'las vecinas se calculan donde está el parque, no volviendo a leer la base — y sin parque el '
      + 'campo NO se pone: una lista vacía se leería como «no comparte con ninguna»');
    assert.ok(!/getDocs|collection\(/.test(sinComentarios(ENLACE)),
      'el puente sigue sin hablar con la base por su cuenta (ADR-005)');
  });

  test('queda escrito que una vecina fuera del parque NO se ve, y cuál es la defensa', () => {
    const i = REPOSITORIO.indexOf('export function vecinasDeLinea');
    const doc = REPOSITORIO.slice(Math.max(0, i - 1400), i);
    assert.match(doc, /circuitosTendidos/,
      'la defensa contra la carga a la mitad es el dato físico de la torre, no esta lista');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('guardianes del lector y del puente', () => {
  test('la consulta de apoyos conserva su forma exacta, con su orden por `orden`', () => {
    const i = FIRESTORE.indexOf('const pedirApoyos =');
    assert.ok(i > 0, 'la consulta de apoyos vive en un solo sitio');
    const cuerpo = FIRESTORE.slice(i, FIRESTORE.indexOf('const leido = await apoyosDeLasSeries', i));
    assert.match(cuerpo, /collection\(db, 'apoyos'\)/);
    assert.match(cuerpo, /where\('orgId', '==', orgId\)/);
    assert.match(cuerpo, /where\('lineaId', '==', serie\.id\)/,
      '`lineaId` se lee «id de la serie»: el campo NO se renombra, cambia cómo se lee');
    assert.match(cuerpo, /orderBy\('orden', 'asc'\)/,
      'ordenar por nombre daría vanos equivocados: en una línea real conviven «E022» y «EMPT»');
  });

  test('el alcance del TRAMO se comprueba antes de pedirlo, y se dice en castellano', () => {
    const cuerpo = metodo('cargarLinea');
    assert.match(cuerpo, /serie\.tipo === 'tramo' && !alcanza\(\{ claims \}, serie\.id\)/,
      'el alcance de la línea ya se comprobó arriba, pero el tramo es OTRO id');
    assert.match(cuerpo, /no está entre lo que su cuenta tiene asignado/,
      'sin esto llega «Missing or insufficient permissions» en inglés, y después de pagar la lectura');
  });

  test('las evidencias se piden por SERIE: si no, la torre compartida no enseñaría ni una foto', () => {
    const i = FIRESTORE.indexOf("collection(db, 'evidencias')");
    const alrededor = FIRESTORE.slice(i - 400, i + 300);
    assert.match(alrededor, /for \(const serie of series\)/);
    assert.match(alrededor, /where\('lineaId', '==', serie\.id\)/);
  });

  test('los expedientes siguen pidiéndose por LÍNEA, y está dicho por qué', () => {
    const i = FIRESTORE.indexOf("collection(db, 'investigaciones')");
    const alrededor = FIRESTORE.slice(i - 700, i + 300);
    assert.match(alrededor, /where\('lineaId', '==', lineaId\)/);
    assert.match(alrededor, /solo lo ve la línea que lo registró/,
      'la consecuencia se declara en vez de descubrirse el día que falte un expediente');
  });

  test('el puente trata «recorrido» en TODO lo que toca apoyos', () => {
    for (const [donde, patron] of [
      ['cargar puntos nuevos', /fase === 'listo' \|\| e\.fase === 'recorrido' \? e\.apoyos\.map/],
      ['refrescar la línea', /if \(e\.fase === 'listo' \|\| e\.fase === 'recorrido'\) await this\.abrir/],
      ['declarar el cable de guarda', /if \(e\.fase === 'listo' \|\| e\.fase === 'recorrido'\) \{/],
      ['conservar el parque al abrir', /previo\.fase === 'listo' \|\| previo\.fase === 'recorrido'/],
    ]) {
      assert.match(ENLACE, patron, `el puente se olvidó de la fase «recorrido» al ${donde}`);
    }
  });

  test('cargar puntos en una línea sin torres cuenta los que ya están', () => {
    // Es el caso normal de una línea recién dada de alta, y el daño de
    // olvidarlo no se deshace: un apoyo no se puede borrar.
    const i = ENLACE.indexOf('const yaCargados =');
    assert.match(ENLACE.slice(i - 700, i + 200), /un apoyo no se puede borrar/);
  });

  test('el molde de la capa de datos no importa nada en tiempo de ejecución', () => {
    const importaciones = REPOSITORIO.match(/^import .*$/gm) ?? [];
    assert.ok(importaciones.length > 0);
    for (const linea_ of importaciones) {
      assert.match(linea_, /^import type /,
        'si este archivo importa código, deja de poder probarse desde `node --test` y estas pruebas '
        + 'se convierten en lectura de texto');
    }
  });

  // CERRADA. Lo que decía el `todo` que estuvo aquí, y que conviene no perder:
  // `npx tsc --noEmit` pasaba LIMPIO con la fase nueva sin tratar, porque
  // `function Contenido()` no declaraba tipo de retorno —TypeScript infería
  // `... | undefined` y el `switch` sin caso por defecto no obligaba a nada, al
  // contrario de lo que decía su propio comentario—. Con la fase sin tratar,
  // una línea en «recorrido» devolvía `undefined` y React pintaba una pantalla
  // EN BLANCO: ni datos, ni error, ni parque.
  //
  // Ya está tratada, y el olvido ya no puede repetirse: `Contenido()` declara
  // `: ReactElement`, así que salirse por el final es error de compilación.
  // Quien vigila eso —y que NINGUNA fase del molde se quede sin `case`, leyendo
  // las fases del propio molde en vez de una lista a mano— es
  // `tests/app-recorrido.test.js`.
  test('la pantalla trata la fase «recorrido»', () => {
    // `ok` y no `match`: un `match` fallido imprime el archivo entero en la
    // salida de las pruebas.
    assert.ok(APP.includes("case 'recorrido':"),
      "el `switch` de App.tsx no trata la fase «recorrido»: la línea sin torres pinta una pantalla en blanco");
  });
});
