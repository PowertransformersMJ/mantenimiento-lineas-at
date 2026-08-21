// ============================================================================
// tests/sol-caribe.test.js — el recurso solar del Caribe, cuadro a cuadro
// ----------------------------------------------------------------------------
// QUÉ SE VIGILA, y por qué cada cosa es una forma real de mentir con un mapa
// que se ve perfecto:
//
//   1. EL CORTE DEL CUADRO. Sacar la hora de un día de un mes empaquetado es una
//      cuenta con cuatro índices. Equivocarse en uno enseña el día de al lado o
//      la hora de al lado — con colores impecables y sin un solo error.
//   2. LA NOCHE VALE CERO Y ESTÁ MEDIDA. Byte 0 = SIN DATO; byte 1 = 0 W/m².
//      Confundirlos borra la mitad de las horas del año y pinta el mapa nocturno
//      como una avería.
//   3. LAS TRES BANDAS DE 2026. Hay horas hasta una fecha, solo total del día
//      hasta otra, y después nada. Las fechas viven en la FICHA: escritas en el
//      código, la frontera miente en silencio en la siguiente reconstrucción.
//   4. QUE NO SE ABRA A MEDIANOCHE. Un mapa negro al entrar se lee como roto.
//   5. QUE EL ARCHIVO PUBLICADO SEA EL QUE LA FICHA DICE. Un PNG con otras
//      medidas se recortaría mal y nadie lo notaría.
//
// Las pruebas 1-4 corren sobre un mundo SINTÉTICO. La 5 abre el archivo real que
// viaja en el repositorio — que es dato ambiental público, no de cliente.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

import {
  bandaDelDia, cuadroDe, energiaDelDia, horaMasSoleada, isoDe, resumenDelCuadro,
} from '../web/src/vistas/solCaribe.ts';

const url = (r) => fileURLToPath(new URL(r, import.meta.url));
const MAPAS = url('../web/public/mapas/');

const COD = { offset: 0, paso: 4.5, sin_dato: 0 };
const FICHA = {
  capa: 'sol-caribe', ancho: 2, alto: 2, codificacion: COD,
  cuadros: { horas: 24, porFila: 24, celdaAncho: 2, celdaAlto: 2 },
  anio: 2026,
  ultimoDiaConHoras: '2026-05-30',
  ultimoDiaConTotal: '2026-08-16',
  energiaDiaria: [{ d: '2026-03-15', kwh: 5.4 }],
  meses: [], rampa: [], departamentos: [], bbox: [0, 0, 1, 1],
};
const MES = { clave: '03', archivo: 'x.png', dias: 3, horasConDato: 72, bytes: 0 };

/** Un mes sintético donde cada celda vale su propio (día, hora): así un corte
 *  equivocado se delata solo, en vez de devolver un número plausible. */
function mesDePrueba() {
  const anchoPx = 24 * FICHA.ancho, altoPx = MES.dias * FICHA.alto;
  const px = new Uint8Array(anchoPx * altoPx);
  for (let dia = 1; dia <= MES.dias; dia++)
    for (let h = 0; h < 24; h++)
      for (let fy = 0; fy < FICHA.alto; fy++)
        for (let fx = 0; fx < FICHA.ancho; fx++)
          px[((dia - 1) * FICHA.alto + fy) * anchoPx + (h * FICHA.ancho + fx)] = dia * 30 + h;
  return px;
}

describe('el corte del cuadro', () => {
  const px = mesDePrueba();

  test('saca EXACTAMENTE la hora del día pedidos', () => {
    for (const [dia, h] of [[1, 0], [1, 23], [2, 12], [3, 5]]) {
      const c = cuadroDe(px, FICHA, MES, dia, h);
      assert.ok(c, `sin cuadro para ${dia}/${h}`);
      assert.equal(c.length, FICHA.ancho * FICHA.alto);
      assert.ok([...c].every((v) => v === dia * 30 + h),
        `el cuadro ${dia}/${h} trajo ${[...c]} — se cortó el día o la hora de al lado`);
    }
  });

  test('fuera de rango devuelve null, NUNCA un cuadro de ceros', () => {
    // Un cuadro de ceros se pintaría como «no se midió» en todas las celdas y
    // se leería exactamente igual que una noche legítima.
    for (const [dia, h] of [[0, 12], [4, 12], [1, -1], [1, 24], [1.5, 12]]) {
      assert.equal(cuadroDe(px, FICHA, MES, dia, h), null, `${dia}/${h} debería ser null`);
    }
  });

  test('si el archivo es más corto que lo que dice la ficha, null', () => {
    assert.equal(cuadroDe(px.subarray(0, 10), FICHA, MES, 1, 0), null,
      'un PNG que no case con la ficha se recortaría mal y nadie lo notaría');
  });
});

describe('la noche está MEDIDA y vale cero', () => {
  test('byte 1 es 0 W/m² medido; byte 0 es que no se midió', () => {
    const noche = new Uint8Array([1, 1, 1, 1]);
    const r = resumenDelCuadro(noche, COD);
    assert.equal(r.max, 0, 'la noche tiene que valer 0 W/m², no null');
    assert.equal(r.nSinDato, 0, 'la noche NO es «sin dato»');

    const hueco = new Uint8Array([0, 0, 0, 0]);
    const h = resumenDelCuadro(hueco, COD);
    assert.equal(h.max, null, 'sin dato NO puede salir como 0 W/m²');
    assert.equal(h.nSinDato, 4);
  });

  test('un cuadro mixto no deja que el hueco arrastre el mínimo a cero', () => {
    const r = resumenDelCuadro(new Uint8Array([0, 100, 200, 0]), COD);
    assert.equal(r.nSinDato, 2);
    assert.ok(r.min > 0, `el mínimo salió ${r.min}: el hueco se coló como valor`);
  });
});

describe('las tres bandas de 2026', () => {
  test('cada día cae en su banda, leyendo las fechas de la FICHA', () => {
    assert.equal(bandaDelDia(FICHA, '2026-01-01'), 'horas');
    assert.equal(bandaDelDia(FICHA, '2026-05-30'), 'horas', 'el último día CON horas las tiene');
    assert.equal(bandaDelDia(FICHA, '2026-05-31'), 'solo_total');
    assert.equal(bandaDelDia(FICHA, '2026-08-16'), 'solo_total');
    assert.equal(bandaDelDia(FICHA, '2026-08-17'), 'sin_dato');
  });

  test('la frontera se mueve si la ficha cambia — no está escrita en el código', () => {
    const otra = { ...FICHA, ultimoDiaConHoras: '2026-07-15' };
    assert.equal(bandaDelDia(otra, '2026-06-20'), 'horas',
      'la banda no siguió a la ficha: la fecha está escrita en el código');
  });

  test('la energía de un día que no consta es null, no 0', () => {
    assert.equal(energiaDelDia(FICHA, '2026-03-15'), 5.4);
    assert.equal(energiaDelDia(FICHA, '2026-09-01'), null, 'un día sin medida no vale cero');
  });

  test('isoDe arma la fecha sin pasar por Date (sin husos horarios)', () => {
    assert.equal(isoDe(2026, '03', 7), '2026-03-07');
  });
});

describe('no se abre a medianoche', () => {
  test('elige la hora con más sol del día', () => {
    // Mundo sintético: solo las 11 traen valor alto.
    const anchoPx = 24 * FICHA.ancho;
    const px = new Uint8Array(anchoPx * MES.dias * FICHA.alto).fill(1);
    for (let fy = 0; fy < FICHA.alto; fy++)
      for (let fx = 0; fx < FICHA.ancho; fx++)
        px[fy * anchoPx + (11 * FICHA.ancho + fx)] = 200;
    assert.equal(horaMasSoleada(px, FICHA, MES, 1), 11,
      'abrir a medianoche pinta un mapa negro y se lee como una avería');
  });
});

describe('el archivo publicado es el que la ficha dice', () => {
  const fichaReal = existsSync(MAPAS + 'sol-caribe.json')
    ? JSON.parse(readFileSync(MAPAS + 'sol-caribe.json', 'utf-8')) : null;

  /** Lector mínimo: gris de 8 bits con filtro 0, que es lo que escribe el generador. */
  function leerPngGris(buf) {
    let p = 8, ancho = 0, alto = 0; const datos = [];
    while (p < buf.length) {
      const largo = buf.readUInt32BE(p);
      const tipo = buf.toString('ascii', p + 4, p + 8);
      const cuerpo = buf.subarray(p + 8, p + 8 + largo);
      if (tipo === 'IHDR') {
        ancho = cuerpo.readUInt32BE(0); alto = cuerpo.readUInt32BE(4);
        assert.equal(cuerpo[8], 8, 'el PNG no es de 8 bits');
        assert.equal(cuerpo[9], 0, 'el PNG no es en gris');
      }
      if (tipo === 'IDAT') datos.push(cuerpo);
      p += 12 + largo;
    }
    const crudo = inflateSync(Buffer.concat(datos));
    const px = new Uint8Array(ancho * alto);
    for (let y = 0; y < alto; y++) {
      assert.equal(crudo[y * (ancho + 1)], 0, 'filtro PNG no soportado');
      for (let x = 0; x < ancho; x++) px[y * ancho + x] = crudo[y * (ancho + 1) + 1 + x];
    }
    return { ancho, alto, px };
  }

  test('cada mes mide lo que la ficha promete', () => {
    if (!fichaReal) return;
    for (const m of fichaReal.meses) {
      assert.ok(existsSync(MAPAS + m.archivo), `la ficha nombra ${m.archivo} y no está`);
      const img = leerPngGris(readFileSync(MAPAS + m.archivo));
      assert.equal(img.ancho, fichaReal.cuadros.horas * fichaReal.ancho,
        `${m.archivo}: ancho ${img.ancho}, la ficha dice ${fichaReal.cuadros.horas * fichaReal.ancho}`);
      assert.equal(img.alto, m.dias * fichaReal.alto,
        `${m.archivo}: alto ${img.alto}, la ficha dice ${m.dias * fichaReal.alto}`);
    }
  });

  test('el mediodía trae sol y la medianoche cero MEDIDO, en el dato real', () => {
    if (!fichaReal || !fichaReal.meses.length) return;
    const m = fichaReal.meses[Math.floor(fichaReal.meses.length / 2)];
    const img = leerPngGris(readFileSync(MAPAS + m.archivo));
    const mediodia = cuadroDe(img.px, fichaReal, m, 15, 12);
    const medianoche = cuadroDe(img.px, fichaReal, m, 15, 0);
    assert.ok(mediodia && medianoche, 'no se pudo recortar el día 15');
    const rm = resumenDelCuadro(mediodia, fichaReal.codificacion);
    const rn = resumenDelCuadro(medianoche, fichaReal.codificacion);
    assert.ok(rm.max > 500, `el mediodía trajo ${rm.max} W/m²: eso no es mediodía tropical`);
    assert.equal(rn.max, 0, 'la medianoche debe valer 0 MEDIDO');
    assert.equal(rn.nSinDato, 0, 'la medianoche no puede ser «sin dato»');
  });

  test('la ficha declara HASTA CUÁNDO llega cada cosa', () => {
    if (!fichaReal) return;
    assert.match(fichaReal.ultimoDiaConHoras, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(fichaReal.ultimoDiaConTotal >= fichaReal.ultimoDiaConHoras,
      'el total del día va MÁS al día que las horas: si no, algo se generó al revés');
    assert.match(fichaReal.aviso, /media|MEDIA/,
      'la ficha no avisa de que es la media horaria y no el pico');
    assert.ok(fichaReal.atribucion?.includes('NASA'), 'falta la atribución de NASA POWER');
  });
});
