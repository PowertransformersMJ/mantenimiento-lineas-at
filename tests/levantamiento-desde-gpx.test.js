// ============================================================================
// tests/levantamiento-desde-gpx.test.js — el traductor entre el aparato y el molde
// ----------------------------------------------------------------------------
// QUÉ SE DEFIENDE AQUÍ. `importar/gpx.js` devuelve el waypoint tal como lo
// escribió el GPS (`nombreCampo, lat, lon, ele, utc, descripcion, simbolo,
// tipo`) y `PuntoLevantado` admite exactamente cinco claves y es `strict`: el
// waypoint tal cual se estrella contra el molde. Entre los dos hay un traductor
// —`importar/levantamientoDesdeGpx.js`— y esto comprueba las dos cosas que
// tiene que hacer bien:
//
//   1. **Que lo que pasa, pase.** Un punto traducido entra en el molde. No se
//      prueba contra una copia de las reglas: se prueba contra el molde de
//      verdad, que es quien manda el día que cambie.
//   2. **Que lo que NO pasa, se DIGA.** El símbolo, la descripción y la
//      categoría del aparato se quedan fuera, y el traductor devuelve cuáles y
//      en qué puntos venían. Descartar callando es el fallo más caro de este
//      repositorio (`32 · L-67`): el dato desaparece y nadie lo echa de menos
//      hasta que hace falta para firmar.
//
// LO QUE NO SE PRUEBA AQUÍ a propósito: leer el archivo (eso es
// `importar-gpx.test.js`) y el molde en sí (eso es `contrato-levantamiento.test.js`).
//
// ⚠️ CERO DATOS DE CLIENTE. Los GPX de este archivo se escriben a mano, cortos y
// sintéticos: línea «LX-1», coordenadas inventadas, horas inventadas. El GPX
// real solo se LEE de la bóveda privada —nunca se copia aquí— y esa parte se
// SALTA donde la bóveda no está (en CI, que es lo esperado).
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { leerGpx } from '../importar/gpx.js';
import {
  DEL_GPX_AL_MOLDE, ETIQUETA_DESCARTE, TOPE_PUNTOS,
  puntosDesdeGpx, puntosDesdeWaypoints,
} from '../importar/levantamientoDesdeGpx.js';
import { CAMPOS_DE_INTERPRETACION, Levantamiento, PuntoLevantado } from '../contratos/src/levantamiento.ts';

const AQUI = dirname(fileURLToPath(import.meta.url));

// ── El mundo sintético ──────────────────────────────────────────────────────
// Un GPX se escribe a mano porque lo que se prueba es la FORMA del archivo que
// manda un aparato, no unos datos. Las coordenadas están inventadas.

/** Un `wpt` a medida: se pone solo lo que el caso necesita, como hace un GPS. */
const wpt = ({ lat, lon, nombre, ele, time, sym, desc, type }) => [
  `  <wpt lat="${lat}" lon="${lon}">`,
  ele !== undefined ? `    <ele>${ele}</ele>` : null,
  time !== undefined ? `    <time>${time}</time>` : null,
  nombre !== undefined ? `    <name>${nombre}</name>` : null,
  desc !== undefined ? `    <desc>${desc}</desc>` : null,
  sym !== undefined ? `    <sym>${sym}</sym>` : null,
  type !== undefined ? `    <type>${type}</type>` : null,
  '  </wpt>',
].filter((l) => l !== null).join('\n');

const gpx = (cuerpo) => [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<gpx version="1.1" creator="Aparato de prueba">',
  '  <metadata><name>Recorrido sintético</name></metadata>',
  cuerpo,
  '</gpx>',
].join('\n');

/**
 * EL ARCHIVO QUE CUBRE TODOS LOS CASOS DE UNA VEZ, que es como llegan de verdad:
 * un aparato no manda un archivo con un solo defecto.
 *
 *   1 · completo — nombre, cota, hora y símbolo
 *   2 · SIN COTA — el aparato no la grabó
 *   3 · SIN HORA — el aparato no la grabó
 *   4 · solo símbolo, más descripción y categoría del aparato
 *   5 · NOMBRE REPETIDO del 1
 */
const ARCHIVO = gpx([
  wpt({ lat: 5.0012, lon: -70.1234, nombre: 'LX-1 T01', ele: 41.7, time: '2026-03-04T10:15:00Z', sym: 'Flag, Blue' }),
  wpt({ lat: 5.0023, lon: -70.1239, nombre: 'LX-1 T02', time: '2026-03-04T10:58:31Z', sym: 'Flag, Blue' }),
  wpt({ lat: 5.0034, lon: -70.1243, nombre: 'LX-1 T03', ele: 34.25, sym: 'Flag, Blue' }),
  wpt({
    lat: 5.0045, lon: -70.1247, nombre: 'LX-1 T04', sym: 'Pin, Red',
    desc: 'la R la anoté yo; la placa dice T04', type: 'Waypoint',
  }),
  wpt({ lat: 5.0056, lon: -70.1251, nombre: 'LX-1 T01', ele: 30, time: '2026-03-04T11:40:02Z', sym: 'Flag, Blue' }),
].join('\n'));

// ════════════════════════════════════════════════════════════════════════════
describe('LA TABLA DE TRADUCCIÓN — que no se desfase con el molde', () => {

  test('todo lo que traduce cae en una clave que el molde admite', () => {
    const delMolde = Object.keys(PuntoLevantado.shape);
    for (const destino of Object.values(DEL_GPX_AL_MOLDE)) {
      assert.ok(delMolde.includes(destino), `«${destino}» ya no existe en el molde: la traducción quedó colgada`);
    }
  });

  test('y ninguna cae en un campo de INTERPRETACIÓN', () => {
    // El molde los prohíbe con nombre y apellido. Si el traductor llenara uno,
    // un GPS estaría fabricando el dato más caro de la línea.
    for (const destino of Object.values(DEL_GPX_AL_MOLDE)) {
      assert.equal(CAMPOS_DE_INTERPRETACION.includes(destino), false,
        `el traductor no puede escribir «${destino}»: eso lo declara quien firma`);
    }
  });

  test('toda clave que el lector sabe sacar del archivo está o traducida o etiquetada', () => {
    // El guardián de verdad: el día que `gpx.js` aprenda a leer una etiqueta
    // nueva, o se traduce o se le pone nombre en castellano. Lo que no puede
    // pasar es que aparezca y nadie sepa decir qué era.
    const conTodo = leerGpx(ARCHIVO).waypoints[3];
    for (const clave of Object.keys(conTodo)) {
      const sabida = clave in DEL_GPX_AL_MOLDE || clave in ETIQUETA_DESCARTE;
      assert.ok(sabida, `«${clave}» sale del archivo y nadie sabe qué hacer con ella`);
    }
  });

  test('el tope de puntos se lee del molde, no se copia', () => {
    const punto = { nombreCampo: 'LX-1 T01', lat: 5.0012, lon: -70.1234 };
    const base = {
      id: '11111111-1111-4111-8111-111111111111', orgId: '/SubA',
      creadoEn: '2026-09-17T12:00:00.000Z', creadoPor: 'uid-de-prueba', revision: 0,
      tipo: 'levantamiento', serieId: '22222222-2222-4222-8222-222222222222', codigoSerie: 'LX-1',
      fecha: '2026-03-04', archivo: { nombre: 'r.gpx', huella: 'a'.repeat(64) },
      cargadoEn: '2026-09-17T12:00:00.000Z', cargadoPor: 'uid-de-prueba',
    };
    assert.equal(Levantamiento.safeParse({ ...base, puntos: Array(TOPE_PUNTOS).fill(punto) }).success, true);
    assert.equal(Levantamiento.safeParse({ ...base, puntos: Array(TOPE_PUNTOS + 1).fill(punto) }).success, false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('EL WAYPOINT ENTRA EN EL MOLDE — que era justo lo que no pasaba', () => {

  const r = puntosDesdeGpx(ARCHIVO);

  test('el waypoint TAL CUAL lo rechaza el molde: por eso existe el traductor', () => {
    const crudo = leerGpx(ARCHIVO).waypoints[0];
    const veredicto = PuntoLevantado.safeParse(crudo);
    assert.equal(veredicto.success, false, 'si esto pasa, el traductor sobra');
    const claves = veredicto.error.issues.flatMap((i) => i.keys ?? []);
    assert.ok(claves.includes('utc'), 'el molde no conoce «utc»');
    assert.ok(claves.includes('simbolo'), 'el molde no conoce «simbolo»');
  });

  test('traducidos, los cinco puntos pasan el molde uno a uno', () => {
    assert.equal(r.puntos.length, 5);
    for (const p of r.puntos) assert.equal(PuntoLevantado.safeParse(p).success, true);
  });

  test('«utc» se llama «instante», y es el mismo valor', () => {
    assert.equal(r.puntos[0].instante, '2026-03-04T10:15:00Z');
    assert.equal('utc' in r.puntos[0], false);
  });

  test('la cota se llama igual y vale lo mismo: no se toca', () => {
    assert.equal(r.puntos[0].ele, 41.7);
    assert.equal(r.puntos[2].ele, 34.25);
  });

  test('la coordenada y el nombre de campo vuelven byte a byte', () => {
    assert.equal(r.puntos[0].lat, 5.0012);
    assert.equal(r.puntos[0].lon, -70.1234);
    assert.equal(r.puntos[0].nombreCampo, 'LX-1 T01');
  });

  test('el orden del archivo se respeta: es el orden en que se recorrió', () => {
    assert.deepEqual(r.puntos.map((p) => p.nombreCampo),
      ['LX-1 T01', 'LX-1 T02', 'LX-1 T03', 'LX-1 T04', 'LX-1 T01']);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('LO QUE NO ESTÁ NO SE RELLENA — y lo que falta se declara', () => {

  const r = puntosDesdeGpx(ARCHIVO);

  test('sin cota: la clave no existe, y no aparece un cero', () => {
    // Un cero se leería como nivel del mar y acabaría en un cálculo de gálibo.
    assert.equal('ele' in r.puntos[1], false);
    assert.equal(r.puntos[1].nombreCampo, 'LX-1 T02');
  });

  test('sin hora: la clave no existe, y no aparece la hora de la carga', () => {
    assert.equal('instante' in r.puntos[2], false);
    assert.equal(r.puntos[2].nombreCampo, 'LX-1 T03');
  });

  test('los huecos los sigue diciendo el lector, con la cuenta exacta', () => {
    const cota = r.avisos.find((a) => a.tipo === 'sin_cota');
    assert.match(cota.mensaje, /2 de 5 sin cota/);
    assert.deepEqual(cota.puntos, ['LX-1 T02', 'LX-1 T04']);
    const hora = r.avisos.find((a) => a.tipo === 'sin_hora');
    assert.match(hora.mensaje, /2 de 5 sin hora/);
    assert.deepEqual(hora.puntos, ['LX-1 T03', 'LX-1 T04']);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('LO QUE SE DESCARTA SE DICE — nunca se tira en silencio', () => {

  const r = puntosDesdeGpx(ARCHIVO);
  const de = (campo) => r.descartes.find((d) => d.campo === campo);

  test('el símbolo no viaja: es el icono del aparato, no un dato de la línea', () => {
    assert.equal(de('simbolo').n, 5, 'los cinco puntos traían símbolo');
    assert.match(de('simbolo').etiqueta, /icono/);
    for (const p of r.puntos) assert.equal('simbolo' in p, false);
  });

  test('…y el aviso dice en CUÁNTOS puntos venía y en cuáles', () => {
    const aviso = r.avisos.find((a) => a.tipo === 'campo_descartado' && a.campo === 'simbolo');
    assert.match(aviso.mensaje, /5 de 5 punto\(s\)/);
    assert.match(aviso.mensaje, /No se guarda\./);
    assert.equal(aviso.n, 5);
    assert.equal(aviso.total, 5);
  });

  test('la descripción tampoco viaja, y el aviso dice a dónde va esa anotación', () => {
    assert.equal(de('descripcion').n, 1);
    assert.deepEqual(de('descripcion').puntos, ['LX-1 T04']);
    // El molde no tiene nota POR PUNTO, solo del documento. Que la pantalla lo
    // diga es la diferencia entre perder la anotación y copiarla a la nota.
    assert.match(de('descripcion').etiqueta, /nota POR PUNTO/);
  });

  test('la categoría del aparato tampoco: se PARECE a la función estructural', () => {
    assert.equal(de('tipo').n, 1);
    assert.match(de('tipo').etiqueta, /función la declara quien firma/);
    for (const p of r.puntos) assert.equal('tipo' in p, false);
  });

  test('un aviso por campo descartado, ni uno de más', () => {
    const descartados = r.avisos.filter((a) => a.tipo === 'campo_descartado').map((a) => a.campo);
    assert.deepEqual([...descartados].sort(), ['descripcion', 'simbolo', 'tipo']);
  });

  test('sin nada que descartar, no se inventa ningún aviso', () => {
    const limpio = puntosDesdeGpx(gpx(wpt({
      lat: 5.0012, lon: -70.1234, nombre: 'LX-1 T01', ele: 41.7, time: '2026-03-04T10:15:00Z',
    })));
    assert.equal(limpio.puntos.length, 1);
    assert.deepEqual(limpio.descartes, []);
    assert.deepEqual(limpio.apartados, []);
    assert.deepEqual(limpio.avisos, []);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('EL NOMBRE REPETIDO NO SE ARREGLA — se avisa y se deja como está', () => {

  const r = puntosDesdeGpx(ARCHIVO);

  test('los dos puntos con el mismo nombre siguen ahí, los dos', () => {
    const repetidos = r.puntos.filter((p) => p.nombreCampo === 'LX-1 T01');
    assert.equal(repetidos.length, 2, 'ninguno se descarta por llamarse igual que otro');
    assert.notEqual(repetidos[0].lat, repetidos[1].lat, 'y son puntos distintos del terreno');
  });

  test('nadie los renombra: renombrar sería acuñar una identidad que nadie decidió', () => {
    assert.equal(r.puntos[0].nombreCampo, r.puntos[4].nombreCampo);
  });

  test('el aviso del lector llega hasta la pantalla junto con los del traductor', () => {
    const aviso = r.avisos.find((a) => a.tipo === 'nombres_repetidos');
    assert.deepEqual(aviso.puntos, ['LX-1 T01']);
    // Las dos listas viajan juntas y en orden: primero lo del lector, después
    // lo del traductor, para que la pantalla las pinte igual.
    const tipos = r.avisos.map((a) => a.tipo);
    assert.ok(tipos.indexOf('nombres_repetidos') < tipos.indexOf('campo_descartado'));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('UN ARCHIVO SIN WAYPOINTS — no revienta y explica por qué está vacío', () => {

  const vacio = puntosDesdeGpx(gpx('  <trk><trkseg><trkpt lat="5.0012" lon="-70.1234"/></trkseg></trk>'));

  test('no hay puntos, y no hay una lista a medias', () => {
    assert.deepEqual(vacio.puntos, []);
    assert.deepEqual(vacio.descartes, []);
    assert.deepEqual(vacio.apartados, []);
  });

  test('y se dice por qué: la traza del recorrido no son apoyos', () => {
    const aviso = vacio.avisos.find((a) => a.tipo === 'sin_waypoints');
    assert.match(aviso.mensaje, /ni un punto marcado/);
  });

  test('un archivo que ni siquiera es un GPX se rechaza sin fingir que lo entiende', () => {
    const nada = puntosDesdeGpx('esto es un CSV, no un GPX');
    assert.deepEqual(nada.puntos, []);
    assert.match(nada.avisos[0].mensaje, /no parece un GPX/);
  });

  test('y una lista vacía a la traducción directa tampoco inventa avisos', () => {
    assert.deepEqual(puntosDesdeWaypoints([]), { puntos: [], descartes: [], apartados: [], avisos: [] });
    assert.deepEqual(puntosDesdeWaypoints(undefined).puntos, []);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('LO QUE EL MOLDE NO ADMITE SE APARTA, NO SE PIERDE', () => {

  test('un punto sin nombre se aparta, con el motivo en castellano', () => {
    // El aparato puede grabar un punto sin `name`. El molde exige nombre de
    // campo porque ES la trazabilidad con el archivo original.
    const r = puntosDesdeGpx(gpx([
      wpt({ lat: 5.0012, lon: -70.1234, nombre: 'LX-1 T01', ele: 41.7, time: '2026-03-04T10:15:00Z' }),
      wpt({ lat: 5.0023, lon: -70.1239, ele: 40 }),
    ].join('\n')));

    assert.equal(r.puntos.length, 1, 'el bueno pasa');
    assert.equal(r.apartados.length, 1, 'el otro no se pierde: se aparta');
    assert.equal(r.apartados[0].n, 2, 'y se dice en qué posición del archivo venía');
    assert.equal(r.apartados[0].motivo, 'sin_nombre');
    assert.match(r.apartados[0].mensaje, /no le puso nombre/);
    assert.ok(r.avisos.some((a) => a.tipo === 'punto_apartado'));
  });

  test('un nombre larguísimo se aparta: aquí no se recorta solo', () => {
    const r = puntosDesdeGpx(gpx(wpt({ lat: 5.0012, lon: -70.1234, nombre: 'T'.repeat(121) })));
    assert.equal(r.puntos.length, 0);
    assert.equal(r.apartados[0].motivo, 'nombre_larguisimo');
    assert.ok(r.avisos.some((a) => a.tipo === 'sin_puntos_utiles'),
      'y si NINGUNO se puede guardar, se dice con todas las letras');
  });

  test('una hora ilegible no tumba el punto: se guarda sin ella y se avisa', () => {
    // Hay aparatos que escriben la hora sin zona horaria. Eso no vale como
    // instante, pero el punto sigue siendo bueno: perderlo sería peor.
    const r = puntosDesdeGpx(gpx(wpt({
      lat: 5.0012, lon: -70.1234, nombre: 'LX-1 T01', ele: 41.7, time: '2026-03-04 10:15:00',
    })));
    assert.equal(r.puntos.length, 1);
    assert.equal('instante' in r.puntos[0], false, 'no se inventa una zona horaria');
    assert.equal(r.puntos[0].ele, 41.7, 'y el resto del punto llega entero');
    const aviso = r.avisos.find((a) => a.tipo === 'hora_ilegible');
    assert.match(aviso.mensaje, /LX-1 T01/);
  });

  test('una hora con desfase horario SÍ vale: es un instante como otro', () => {
    const r = puntosDesdeGpx(gpx(wpt({
      lat: 5.0012, lon: -70.1234, nombre: 'LX-1 T01', time: '2026-03-04T05:15:00-05:00',
    })));
    assert.equal(r.puntos[0].instante, '2026-03-04T05:15:00-05:00');
    assert.equal(r.avisos.filter((a) => a.tipo === 'hora_ilegible').length, 0);
  });

  test('una coordenada ilegible ya la aparta el lector, y se sigue diciendo', () => {
    const r = puntosDesdeGpx(gpx(wpt({ lat: 'norte', lon: -70.1234, nombre: 'LX-1 T09' })));
    assert.equal(r.puntos.length, 0);
    assert.match(r.avisos.find((a) => a.tipo === 'coordenada_invalida').mensaje, /LX-1 T09/);
  });

  test('más puntos que el tope: se avisa, y NO se recorta a escondidas', () => {
    const muchos = Array.from({ length: TOPE_PUNTOS + 1 }, (_, i) => ({
      nombreCampo: `LX-1 T${i}`, lat: 5.0012, lon: -70.1234,
    }));
    const r = puntosDesdeWaypoints(muchos);
    assert.equal(r.puntos.length, TOPE_PUNTOS + 1, 'están todos: recortar es perder media jornada');
    const aviso = r.avisos.find((a) => a.tipo === 'demasiados_puntos');
    assert.match(aviso.mensaje, /VARIAS jornadas/);
    assert.equal(aviso.total, TOPE_PUNTOS);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL ARCHIVO DE VERDAD. Solo se LEE de la bóveda: ni un byte se copia aquí.
// Donde la bóveda no está (CI), estas pruebas se SALTAN — es lo esperado.
// ════════════════════════════════════════════════════════════════════════════
const BOVEDA_GPX = join(AQUI, '..', '..', 'brain-private', 'mantenimiento-lineas-at',
  'fixtures', 'gpx', 'LN-617-LN-628', 'Waypoints_09-AUG-26.gpx');
const SIN_BOVEDA = !existsSync(BOVEDA_GPX) && 'sin bóveda privada: se salta (es lo esperado en CI)';

describe('EL RECORRIDO REAL — se traduce ENTERO y pasa el molde', () => {

  test('todos sus waypoints se traducen: ninguno se queda por el camino', { skip: SIN_BOVEDA }, () => {
    const leido = leerGpx(readFileSync(BOVEDA_GPX, 'utf-8'));
    const r = puntosDesdeGpx(readFileSync(BOVEDA_GPX, 'utf-8'));

    assert.ok(leido.waypoints.length > 0, 'el archivo trae puntos marcados');
    assert.equal(r.puntos.length, leido.waypoints.length, 'se traduce ENTERO, no a medias');
    assert.deepEqual(r.apartados, [], 'ni uno solo se aparta');
  });

  test('y cada punto pasa el molde, uno a uno', { skip: SIN_BOVEDA }, () => {
    const r = puntosDesdeGpx(readFileSync(BOVEDA_GPX, 'utf-8'));
    for (const p of r.puntos) {
      const veredicto = PuntoLevantado.safeParse(p);
      assert.equal(veredicto.success, true,
        veredicto.success ? '' : `un punto del recorrido real no entra: ${veredicto.error.issues[0]?.message}`);
    }
  });

  test('el símbolo que traen todos se descarta y se DICE', { skip: SIN_BOVEDA }, () => {
    const r = puntosDesdeGpx(readFileSync(BOVEDA_GPX, 'utf-8'));
    const simbolo = r.descartes.find((d) => d.campo === 'simbolo');
    assert.ok(simbolo, 'el archivo real trae `sym` en sus puntos');
    assert.equal(simbolo.n, r.puntos.length, 'en todos');
    assert.ok(r.avisos.some((a) => a.tipo === 'campo_descartado' && a.campo === 'simbolo'));
  });

  test('y el documento entero validaría con esos puntos dentro', { skip: SIN_BOVEDA }, () => {
    // Es la comprobación que importa de verdad: no basta con que el punto pase,
    // tiene que pasar el levantamiento COMPLETO que se va a guardar.
    const r = puntosDesdeGpx(readFileSync(BOVEDA_GPX, 'utf-8'));
    const documento = {
      id: '11111111-1111-4111-8111-111111111111', orgId: '/SubA',
      creadoEn: '2026-09-17T12:00:00.000Z', creadoPor: 'uid-de-prueba', revision: 0,
      tipo: 'levantamiento',
      serieId: '22222222-2222-4222-8222-222222222222', codigoSerie: 'TR-9',
      fecha: '2026-03-04',
      archivo: { nombre: 'recorrido.gpx', huella: 'a'.repeat(64) },
      cargadoEn: '2026-09-17T12:00:00.000Z', cargadoPor: 'uid-de-prueba',
      puntos: r.puntos,
    };
    const veredicto = Levantamiento.safeParse(documento);
    assert.equal(veredicto.success, true,
      veredicto.success ? '' : veredicto.error.issues[0]?.message);
  });
});
