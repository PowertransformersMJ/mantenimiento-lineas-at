// ============================================================================
// tests/trazado-en-el-atlas.test.js — el recorrido, DIBUJADO sobre el atlas
// ----------------------------------------------------------------------------
// `§ADR-073` dejó el atlas DICIENDO de qué celda habla —«la celda de LN-627»— y
// `§ADR-074` lo dibuja. Un dibujo de mapa tiene tres formas de mentir sin dar un
// solo error, y son las tres que se vigilan aquí:
//
//   1. EL RECUADRO DESPLAZADO. Las celdas son iguales en MERCATOR, no en grados.
//      Deshacer la cuenta en grados dibuja un borde que cae dentro del color de
//      la celda vecina — unos kilómetros, creíbles, y el clic seguiría dando
//      otro número que el que rodea el recuadro.
//   2. EL RELLENO QUE TAPA EL DATO. El color de esa celda YA es la medida. Un
//      relleno encima, aunque sea translúcido, pone dos verdades sobre el mismo
//      cuadro y la escala publicada deja de ser la que se lee.
//   3. LA LÍNEA DE UN SOLO PUNTO. GeoJSON la da por inválida y MapLibre la
//      descarta EN SILENCIO: quedaría el rótulo sin su línea, que se lee como un
//      fallo de dibujo y no lo es.
//
// Mundo sintético: la rejilla de 6x6 celdas de 1° del atlas, sin una sola
// coordenada real (`33 · L-23`).
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { bordeDeCelda, celdaDe } from '../web/src/vistas/rejilla.ts';
import { celdasDelRecorrido, dibujoDelRecorrido } from '../web/src/vistas/atlasCaribe.ts';

/** El recorte del atlas: 6°x6° sobre el Caribe, 36 celdas de 1°. */
const F = {
  bbox: [-77, 7, -71, 13],
  ancho: 6,
  alto: 6,
  resolucion_m: 111000,
  codificacion: { offset: 0, paso: 1, sin_dato: 0 },
  rampa: [{ c: 0, rgb: [0, 0, 255] }, { c: 40, rgb: [255, 0, 0] }],
};

// ════════════════════════════════════════════════════════════════════════════
describe('el recuadro de una celda es el inverso EXACTO de la celda de un punto', () => {

  test('IDA Y VUELTA en las 36 celdas: el centro del recuadro devuelve su celda', () => {
    // Ésta es la prueba que impide el fallo nº 1. Si el recuadro se dibujara con
    // la cuenta hecha en grados, el centro de una celda de arriba o de abajo
    // caería en la vecina y aquí saldría rojo — en la pantalla, en cambio, se
    // vería un rectángulo bonito y desplazado.
    const fallan = [];
    for (let iy = 0; iy < F.alto; iy++) {
      for (let ix = 0; ix < F.ancho; ix++) {
        const b = bordeDeCelda(ix, iy, F);
        assert.ok(b, `sin recuadro para ${ix},${iy}`);
        const c = celdaDe((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, F);
        if (!c || c.ix !== ix || c.iy !== iy) fallan.push(`${ix},${iy} → ${JSON.stringify(c)}`);
      }
    }
    assert.deepEqual(fallan, [], 'celdas cuyo recuadro no coincide con su celda');
  });

  test('las cuatro esquinas de dentro caen en la misma celda', () => {
    // El centro no basta: un recuadro más grande de la cuenta también lo pasaría.
    const b = bordeDeCelda(2, 3, F);
    const e = 1e-6;
    for (const [lon, lat] of [
      [b[0] + e, b[1] + e], [b[2] - e, b[1] + e], [b[2] - e, b[3] - e], [b[0] + e, b[3] - e],
    ]) {
      assert.deepEqual(celdaDe(lon, lat, F), { ix: 2, iy: 3 }, `la esquina ${lon},${lat} se salió`);
    }
  });

  test('las celdas encajan sin hueco ni solape', () => {
    // El borde derecho de una es el izquierdo de la siguiente, y el de abajo el
    // de arriba de la de debajo. Un hueco de un pelo se ve como una raya doble.
    for (let ix = 0; ix < F.ancho - 1; ix++) {
      assert.equal(bordeDeCelda(ix, 0, F)[2], bordeDeCelda(ix + 1, 0, F)[0]);
    }
    for (let iy = 0; iy < F.alto - 1; iy++) {
      assert.equal(bordeDeCelda(0, iy, F)[1], bordeDeCelda(0, iy + 1, F)[3]);
    }
  });

  test('LA TRAMPA: en grados el recuadro saldría desplazado, y creíble', () => {
    // Lo que habría pasado con la cuenta ingenua. No es un decimal: sobre este
    // recorte el desvío llega a **1,5 km** —el mismo que el componente declara
    // por el lienzo en mercator— y el borde caería dentro del color del vecino,
    // con un rectángulo de aspecto perfecto.
    const [, laMin, , laMax] = F.bbox;
    let peor = 0;
    for (let iy = 0; iy < F.alto; iy++) {
      const enGrados = laMax - ((laMax - laMin) * (iy + 1)) / F.alto;
      peor = Math.max(peor, Math.abs(bordeDeCelda(0, iy, F)[1] - enGrados) * 111.2);
    }
    assert.ok(peor > 1, `el desvío máximo salió de ${peor.toFixed(2)} km: `
      + 'si los dos caminos coinciden, este recorte no sirve para vigilar la proyección');
  });

  test('una celda que no existe no se dibuja: devuelve nada', () => {
    // Un rectángulo pintado donde no hay celda sería una medida inventada.
    for (const [ix, iy] of [[-1, 0], [0, -1], [F.ancho, 0], [0, F.alto], [1.5, 0]]) {
      assert.equal(bordeDeCelda(ix, iy, F), null, `${ix},${iy} devolvió recuadro`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('las tres piezas del dibujo', () => {

  /** Ocho apoyos en fila dentro de una celda, como una línea de verdad. */
  const PUNTOS = Array.from({ length: 8 }, (_, i) => ({ lat: 10.4 + i * 0.002, lon: -75.5 + i * 0.002 }));
  const CELDAS = celdasDelRecorrido(PUNTOS, F, celdaDe).celdas;
  const dib = dibujoDelRecorrido(PUNTOS, CELDAS, F, bordeDeCelda, 'LN-627');

  test('una celda tocada, un recuadro dibujado', () => {
    assert.equal(CELDAS.length, 1);
    assert.equal(dib.celdas.features.length, 1);
  });

  test('el anillo va CERRADO y coincide con el recuadro de la celda', () => {
    const anillo = dib.celdas.features[0].geometry.coordinates[0];
    assert.equal(anillo.length, 5, 'un anillo GeoJSON repite el primer punto al final');
    assert.deepEqual(anillo[0], anillo[4]);
    const b = bordeDeCelda(CELDAS[0].ix, CELDAS[0].iy, F);
    assert.deepEqual(anillo[0], [b[0], b[1]]);
    assert.deepEqual(anillo[2], [b[2], b[3]]);
  });

  test('la traza lleva TODAS las coordenadas y en su orden', () => {
    const c = dib.traza.features[0].geometry.coordinates;
    assert.equal(c.length, PUNTOS.length);
    assert.deepEqual(c[0], [PUNTOS[0].lon, PUNTOS[0].lat]);
    assert.deepEqual(c[7], [PUNTOS[7].lon, PUNTOS[7].lat]);
  });

  test('el rótulo se ancla al PRIMER punto, no al promedio', () => {
    // El promedio no está sobre la línea: ya se coló una vez como «el punto de
    // la línea» (`§ADR-064`). El primer punto es un sitio del recorrido.
    assert.deepEqual(dib.rotulo.features[0].geometry.coordinates,
      [PUNTOS[0].lon, PUNTOS[0].lat]);
    assert.equal(dib.rotulo.features[0].properties.nombre, 'LN-627');
  });

  test('cada pieza dice de qué línea es', () => {
    for (const col of [dib.celdas, dib.traza, dib.rotulo]) {
      for (const f of col.features) assert.equal(f.properties.nombre, 'LN-627');
    }
  });

  test('un recorrido que cruza dos celdas dibuja DOS recuadros', () => {
    const pts = [{ lat: 10.9, lon: -75.5 }, { lat: 11.1, lon: -75.5 }];
    const d = dibujoDelRecorrido(pts, celdasDelRecorrido(pts, F, celdaDe).celdas, F, bordeDeCelda, 'X');
    assert.equal(d.celdas.features.length, 2);
  });

  test('CON UN SOLO PUNTO NO SE EMITE TRAZA, y sí rótulo', () => {
    // El fallo nº 3: MapLibre descarta una línea de un punto sin decir nada.
    const uno = [{ lat: 10.4, lon: -75.5 }];
    const d = dibujoDelRecorrido(uno, celdasDelRecorrido(uno, F, celdaDe).celdas, F, bordeDeCelda, 'X');
    assert.equal(d.traza.features.length, 0, 'una línea de un punto es GeoJSON inválido');
    assert.equal(d.rotulo.features.length, 1, 'el sitio sí se puede rotular');
    assert.equal(d.celdas.features.length, 1);
  });

  test('sin coordenadas no se dibuja nada, y no revienta', () => {
    const d = dibujoDelRecorrido([], [], F, bordeDeCelda, 'X');
    assert.equal(d.celdas.features.length, 0);
    assert.equal(d.traza.features.length, 0);
    assert.equal(d.rotulo.features.length, 0);
  });

  test('una celda inexistente se salta, no se dibuja a medias', () => {
    const d = dibujoDelRecorrido(PUNTOS, [{ ix: 99, iy: 99 }], F, bordeDeCelda, 'X');
    assert.equal(d.celdas.features.length, 0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('lo que la pantalla NO puede volver a hacer', () => {

  const ATLAS = readFileSync(
    fileURLToPath(new URL('../web/src/componentes/AtlasCaribe.tsx', import.meta.url)), 'utf-8');

  test('las celdas del recorrido van con BORDE y sin relleno', () => {
    // El fallo nº 2. El dato es el color del cuadro; rodearlo no lo toca,
    // rellenarlo sí. Ni `fill` ni `fill-color` para esta fuente.
    assert.match(ATLAS, /id: 'recorrido-celdas', type: 'line'/,
      'el recuadro del recorrido dejó de ser un borde');
    assert.ok(!/source: 'recorrido-celdas',[\s\S]{0,120}type: 'fill'/.test(ATLAS),
      'volvió un relleno sobre la celda medida: dos verdades sobre el mismo cuadro');
    assert.ok(!/'fill-color'[\s\S]{0,80}recorrido/.test(ATLAS));
  });

  test('el dibujo va ENCIMA de la rejilla, no debajo', () => {
    // Debajo, el 0,72 de opacidad del cuadro se lo comería y el trazado
    // «no saldría» sin que nada fallara.
    const trozo = ATLAS.slice(ATLAS.indexOf("id: 'recorrido-celdas-camisa'"),
      ATLAS.indexOf("id: 'recorrido-rotulo'"));
    assert.ok(trozo.length > 0, 'desaparecieron las capas del trazado');
    assert.ok(!/def\.idCapa/.test(trozo),
      'el trazado se metió por debajo de la capa de la medida');
  });

  test('la geometría NO se calcula en la pantalla', () => {
    // Es donde se cuelan los desfases que nadie ve: vive en `vistas/`, probada.
    assert.match(ATLAS, /dibujoDelRecorrido\(recorrido\.puntos, delRecorrido\.celdas, ficha, bordeDeCelda/,
      'la pantalla volvió a armarse el dibujo por su cuenta');
  });

  test('sin línea cargada, el dibujo se RETIRA', () => {
    // El atlas se abre con `#/sol` sin línea y tiene que seguir siendo un atlas
    // de la región: capas de una línea que ya no está serían un fantasma.
    assert.match(ATLAS, /for \(const c of CAPAS\) if \(m\.getLayer\(c\)\) m\.removeLayer\(c\)/,
      'el dibujo dejó de retirarse cuando no hay línea');
  });

  test('el dibujo se ANUNCIA en palabras, y se acota', () => {
    // Un trazo de tres píxeles sobre siete departamentos se lee como una marca
    // cualquiera si nadie dice que es la línea — y quien no lo sepa buscará una
    // avería cuando no lo vea de lejos.
    assert.match(ATLAS, /trazado de \{recorrido\.codigo\}/,
      'la pantalla dejó de decir que ese trazo es la línea');
    assert.match(ATLAS, /se ve como un punto/,
      'dejó de advertirse por qué el trazado se ve diminuto al abrir');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL DIBUJO SE PUEDE MIRAR — la regla que dejó `§ADR-071` y que este ADR cumple
// con herramienta propia. Sin banco ni foto, verificar un mapa vuelve a depender
// de que alguien abra su navegador, y ahí es donde se declaró una regresión que
// no existía.
// ════════════════════════════════════════════════════════════════════════════
describe('el dibujo del mapa tiene que poder MIRARSE', () => {

  const BANCO = readFileSync(
    fileURLToPath(new URL('../web/src/sonda-satelital.tsx', import.meta.url)), 'utf-8');
  const FOTO = readFileSync(
    fileURLToPath(new URL('../herramientas/foto-del-banco.mjs', import.meta.url)), 'utf-8');

  test('el banco monta el ATLAS, no solo el mapa de la línea', () => {
    assert.match(BANCO, /<AtlasCaribe/, 'el banco dejó de poder enseñar el atlas');
    assert.match(BANCO, /codigo: 'LN-FALSA'/, 'la línea del banco tiene que ser falsa y decirlo');
  });

  test('y prueba los DOS dibujos: una celda y dos', () => {
    assert.match(BANCO, /atlas-una/);
    assert.match(BANCO, /atlas-dos/);
  });

  test('el banco se abre ya puesto por la dirección (si no, no hay foto)', () => {
    // Un Chrome sin cabeza no sabe pulsar botones para llegar al estado que se
    // quiere fotografiar. Con el estado en la dirección, sí.
    assert.match(BANCO, /new URLSearchParams\(location\.search\)/,
      'el banco dejó de aceptar su estado por la dirección');
  });

  test('la foto espera con RELOJ REAL, no con tiempo virtual', () => {
    // Medido: con `--virtual-time-budget` el ráster sale pintado y las capas
    // vectoriales NO —el trabajador de teselas se queda sin turno—, así que la
    // foto confirmaría justo lo que no ha ocurrido.
    assert.ok(!/virtual-time-budget/.test(FOTO.replace(/\/\/.*$/gm, '')),
      'la herramienta volvió al tiempo virtual: fotografiaría un mapa a medias');
    assert.match(FOTO, /await dormir\(espera\)/);
  });

  test('el banco NUNCA viaja al sitio publicado', () => {
    const VITE = readFileSync(
      fileURLToPath(new URL('../web/vite.config.ts', import.meta.url)), 'utf-8');
    assert.match(VITE, /process\.env\.SONDA_MAPA/,
      'el banco se construiría siempre: tiene que ir detrás de SONDA_MAPA');
  });
});
