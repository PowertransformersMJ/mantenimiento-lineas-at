// ============================================================================
// tests/perfil-del-dia.test.js — el día entero en la celda de la línea
// ----------------------------------------------------------------------------
// LO QUE SE VIGILA, y viene de un fallo que se vio en producción el 2026-08-22:
// la pantalla daba el valor de UNA hora y, al lado, un resumen del día que era
// de la REGIÓN. El 19 de agosto la celda marcaba 32,5 °C a mediodía y debajo
// ponía «máxima del día: 29,79 °C». Una máxima menor que un valor del mismo día
// parece un error de cálculo, y quien lo lee deja de fiarse de la capa entera.
//
//   1. EL RESUMEN ES DE LA MISMA CELDA QUE EL NÚMERO. Nunca de otro sitio.
//   2. LA HORA DEL PICO NO SE CORRE CON LOS HUECOS. Buscar el máximo en la lista
//      filtrada devolvería una hora desplazada por cada hueco anterior.
//   3. UN HUECO NO ES UN CERO NI CUENTA COMO SUPERADO. Se cuenta aparte.
//   4. UN ARCHIVO QUE NO CUADRA CON SU FICHA NO SE LEE. Daría números creíbles
//      y desplazados, que es la peor clase de error (`32 · L-69`).
//
// Rejilla sintética minúscula, sin relación con ninguna línea real (`33 · L-23`).
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  perfilEnCelda, horasSobre, enTramos,
  intensidadDeLluvia, comoLlovio, ESCALA_LLUVIA, diasDelMesSobre,
  estadoDelCielo, comoEstuvoElCielo, ESCALA_CIELO, celdasDelRecorrido,
} from '../web/src/vistas/atlasCaribe.ts';

// Codificación de la casa: byte 0 = SIN DATO, y el valor sale de `(b-1)*paso+offset`.
const COD = { sin_dato: 0, paso: 1, offset: 0 };
const ANCHO = 2, ALTO = 2, HORAS = 24, DIAS = 2;

/** Un PNG de mentira: `valores[dia][hora][iy][ix]` en bytes ya codificados. */
function archivo(porHora) {
  const anchoPx = HORAS * ANCHO;
  const px = new Uint8Array(anchoPx * DIAS * ALTO);
  for (let d = 0; d < DIAS; d++) {
    for (let iy = 0; iy < ALTO; iy++) {
      for (let h = 0; h < HORAS; h++) {
        for (let ix = 0; ix < ANCHO; ix++) {
          px[((d * ALTO) + iy) * anchoPx + h * ANCHO + ix] = porHora(d + 1, h, ix, iy);
        }
      }
    }
  }
  return px;
}

const FICHA = {
  ancho: ANCHO, alto: ALTO, codificacion: COD, cuadros: { horas: HORAS },
};
const MES = { clave: '08', archivo: 'x.png', dias: DIAS };

// ════════════════════════════════════════════════════════════════════════════
describe('el día entero, leído en LA celda', () => {

  test('mínimo, máximo y la hora de cada uno salen de la celda pedida', () => {
    // La celda (0,0) hace un pico a las 14; la (1,1) va siempre plana en 10.
    // Si el resumen se calculara sobre otra celda, el máximo saldría 10.
    const px = archivo((d, h, ix, iy) => {
      if (ix === 0 && iy === 0) return h === 14 ? 41 : (h === 3 ? 6 : 21);
      return 11;
    });
    const p = perfilEnCelda(px, FICHA, MES, 1, 0, 0);
    assert.equal(p.max, 40, 'el máximo no es el de esta celda');
    assert.equal(p.horaMax, 14);
    assert.equal(p.min, 5);
    assert.equal(p.horaMin, 3);
    assert.equal(p.horas.length, 24);
    assert.equal(p.nSinDato, 0);
    // Y la celda de al lado da lo suyo, no lo de la primera.
    assert.equal(perfilEnCelda(px, FICHA, MES, 1, 1, 1).max, 10);
  });

  test('LA HORA DEL PICO NO SE CORRE con los huecos de antes', () => {
    // Huecos de 0 a 9, pico a las 20. Buscando el máximo en la lista filtrada
    // la hora saldría 10 en vez de 20: diez horas de error, y creíble.
    const px = archivo((d, h) => (h < 10 ? 0 : (h === 20 ? 31 : 16)));
    const p = perfilEnCelda(px, FICHA, MES, 1, 0, 0);
    assert.equal(p.horaMax, 20, 'la hora del pico se desplazó con los huecos');
    assert.equal(p.nSinDato, 10);
    assert.equal(p.max, 30);
  });

  test('un hueco NO es un cero: no entra en la media ni en el total', () => {
    // 12 horas a 10 y 12 huecos. La media es 10, no 5.
    const px = archivo((d, h) => (h < 12 ? 11 : 0));
    const p = perfilEnCelda(px, FICHA, MES, 1, 0, 0);
    assert.equal(p.media, 10, 'los huecos se contaron como ceros');
    assert.equal(p.total, 120);
    assert.equal(p.nSinDato, 12);
  });

  test('un día sin una sola medida es hueco declarado, no un cero', () => {
    const p = perfilEnCelda(archivo(() => 0), FICHA, MES, 1, 0, 0);
    assert.equal(p.max, null);
    assert.equal(p.min, null);
    assert.equal(p.horaMax, null);
    assert.equal(p.total, null);
    assert.equal(p.nSinDato, 24);
  });

  test('los días no se pisan entre sí', () => {
    const px = archivo((d) => (d === 1 ? 11 : 21));
    assert.equal(perfilEnCelda(px, FICHA, MES, 1, 0, 0).max, 10);
    assert.equal(perfilEnCelda(px, FICHA, MES, 2, 0, 0).max, 20);
  });

  test('un archivo que no cuadra con su ficha NO se lee', () => {
    // Lo contrario sería leer bytes corridos y devolver números con buen aspecto.
    assert.equal(perfilEnCelda(new Uint8Array(10), FICHA, MES, 1, 0, 0), null);
  });

  test('día u hora fuera de rango no revientan: devuelven hueco', () => {
    const px = archivo(() => 11);
    assert.equal(perfilEnCelda(px, FICHA, MES, 0, 0, 0), null);
    assert.equal(perfilEnCelda(px, FICHA, MES, 3, 0, 0), null);
    assert.equal(perfilEnCelda(px, FICHA, MES, 1, -1, 0), null);
    assert.equal(perfilEnCelda(px, FICHA, MES, 1, 0, 99), null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('las horas que pasaron del tope, dichas como las diría una persona', () => {

  test('un hueco no cuenta como superado', () => {
    const px = archivo((d, h) => (h < 6 ? 0 : (h >= 11 && h <= 15 ? 51 : 21)));
    const p = perfilEnCelda(px, FICHA, MES, 1, 0, 0);
    assert.deepEqual(horasSobre(p, 40), [11, 12, 13, 14, 15]);
    // Las seis primeras horas no se sabe: ni superan ni dejan de superar.
    assert.equal(p.nSinDato, 6);
  });

  test('el tope se SUPERA, no se alcanza', () => {
    const px = archivo(() => 41);   // exactamente 40
    const p = perfilEnCelda(px, FICHA, MES, 1, 0, 0);
    assert.deepEqual(horasSobre(p, 40), [], 'justo en el tope no se marca');
    assert.equal(horasSobre(p, 39).length, 24);
  });

  test('los tramos seguidos se dicen como tramos', () => {
    assert.equal(enTramos([11, 12, 13, 14, 15]), 'de 11:00 a 15:59');
    assert.equal(enTramos([7]), 'a las 07:00');
    assert.equal(enTramos([6, 7, 18, 19, 20]), 'de 06:00 a 07:59 y de 18:00 a 20:59');
    assert.equal(enTramos([]), '');
    // Con tres o más —lo normal en un día de nubosidad— coma entre todos y «y»
    // solo antes del último: la cadena de «y» encadenados no se lee.
    assert.equal(enTramos([1, 5, 9]), 'a las 01:00, a las 05:00 y a las 09:00');
    assert.equal(enTramos([0, 1, 4, 5, 8]),
      'de 00:00 a 01:59, de 04:00 a 05:59 y a las 08:00');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CÓMO LLOVIÓ, EN PALABRAS. Los cortes son los de la OMM/AEMET y por eso se
// pueden citar; lo que NO se puede es deducir de la lluvia cosas que la lluvia
// no mide — nubosidad y aparato eléctrico —, y eso también se vigila aquí.
// ════════════════════════════════════════════════════════════════════════════
describe('la intensidad de la lluvia, dicha en palabras', () => {

  test('cada corte cae en su grado', () => {
    assert.equal(intensidadDeLluvia(0).clave, 'seca');
    assert.equal(intensidadDeLluvia(0.05).clave, 'seca');
    assert.equal(intensidadDeLluvia(0.1).clave, 'llovizna');
    assert.equal(intensidadDeLluvia(1.9).clave, 'llovizna');
    assert.equal(intensidadDeLluvia(2).clave, 'moderada');
    assert.equal(intensidadDeLluvia(14.9).clave, 'moderada');
    assert.equal(intensidadDeLluvia(15).clave, 'fuerte');
    assert.equal(intensidadDeLluvia(30).clave, 'muy_fuerte');
    assert.equal(intensidadDeLluvia(60).clave, 'torrencial');
    assert.equal(intensidadDeLluvia(200).clave, 'torrencial');
  });

  test('una hora SIN MEDIR no es una hora seca', () => {
    // Pintar «no se sabe» igual que «se miró y no llovió» es el error de L-44.
    assert.equal(intensidadDeLluvia(null), null);
    assert.equal(intensidadDeLluvia(NaN), null);
  });

  test('el día se resume por grados, del más fuerte al más flojo', () => {
    // 08–09 llovizna (0,5), 12–13 moderada (5), 20 fuerte (20), resto seco.
    const px = archivo((d, h) => {
      if (h === 8 || h === 9) return 6;      // (6-1)*1+0 = 5 → con paso 1 esto es 5 mm
      if (h === 12 || h === 13) return 6;
      if (h === 20) return 21;               // 20 mm
      return 1;                              // 0 mm
    });
    const p = perfilEnCelda(px, FICHA, MES, 1, 0, 0);
    const r = comoLlovio(p);
    assert.equal(r[0].grado.clave, 'fuerte', 'lo más fuerte va primero');
    assert.deepEqual(r[0].horas, [20]);
    assert.equal(r[1].grado.clave, 'moderada');
    assert.deepEqual(r[1].horas, [8, 9, 12, 13]);
    // Las horas secas NO aparecen: enterrarían lo que importa.
    assert.ok(!r.some((x) => x.grado.clave === 'seca'));
  });

  test('un día sin una gota devuelve lista vacía, no un grado «seca»', () => {
    const p = perfilEnCelda(archivo(() => 1), FICHA, MES, 1, 0, 0);
    assert.deepEqual(comoLlovio(p), []);
  });

  test('las horas sin medir no se cuelan como lluvia ni como sequía', () => {
    const px = archivo((d, h) => (h < 12 ? 0 : 6));
    const p = perfilEnCelda(px, FICHA, MES, 1, 0, 0);
    const r = comoLlovio(p);
    assert.equal(r.length, 1);
    assert.deepEqual(r[0].horas, [12,13,14,15,16,17,18,19,20,21,22,23]);
    assert.equal(p.nSinDato, 12);
  });

  test('la escala NO inventa nubosidad ni tormenta', () => {
    // Es la garantía que sostiene la honestidad de la capa: de los milímetros no
    // sale ni «nublado» ni «tormenta eléctrica». Un día encapotado sin una gota
    // mide lo mismo que uno despejado, y ninguna cantidad de agua implica rayos.
    const nombres = ESCALA_LLUVIA.map((g) => g.nombre.toLowerCase()).join(' ');
    for (const prohibido of ['nublado', 'nuboso', 'tormenta', 'eléctric', 'despejado', 'cielo']) {
      assert.ok(!nombres.includes(prohibido),
        `«${prohibido}» no se puede deducir de los milímetros de lluvia`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el mes entero, para planificar', () => {

  test('cuenta los días que cruzaron el tope, y los que no se midieron', () => {
    // Día 1 con pico de 50; día 2 plano en 10.
    const px = archivo((d, h) => (d === 1 && h === 14 ? 51 : 11));
    const r = diasDelMesSobre(px, FICHA, MES, 0, 0, 40);
    assert.deepEqual(r.dias, [1]);
    assert.equal(r.medidos, 2);
    assert.equal(r.sinDato, 0);
  });

  test('un día entero sin medida se cuenta aparte, no como «no superó»', () => {
    const px = archivo((d) => (d === 1 ? 0 : 51));
    const r = diasDelMesSobre(px, FICHA, MES, 0, 0, 40);
    assert.deepEqual(r.dias, [2]);
    assert.equal(r.medidos, 1);
    assert.equal(r.sinDato, 1, 'el día sin medida se contó como medido');
  });

  test('para la lluvia se mide el TOTAL del día, no el pico de una hora', () => {
    // 24 horas a 1 mm: el pico es 1 (no cruza 20) pero el total es 24 (sí).
    const px = archivo(() => 2);
    assert.deepEqual(diasDelMesSobre(px, FICHA, MES, 0, 0, 20, 'max').dias, []);
    assert.deepEqual(diasDelMesSobre(px, FICHA, MES, 0, 0, 20, 'total').dias, [1, 2]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CÓMO ESTUVO EL CIELO. Cortes de la escala de OCTAS de la OMM (1 octa =
// 12,5 %). Y la misma garantía que en la lluvia: de las nubes tampoco sale una
// tormenta.
// ════════════════════════════════════════════════════════════════════════════
describe('el estado del cielo, dicho en palabras', () => {

  test('cada octa cae en su grado', () => {
    assert.equal(estadoDelCielo(0).clave, 'despejado');
    assert.equal(estadoDelCielo(12.4).clave, 'despejado');
    assert.equal(estadoDelCielo(12.5).clave, 'poco_nuboso');
    assert.equal(estadoDelCielo(37.4).clave, 'poco_nuboso');
    assert.equal(estadoDelCielo(37.5).clave, 'parcial');
    assert.equal(estadoDelCielo(62.5).clave, 'nuboso');
    assert.equal(estadoDelCielo(87.5).clave, 'cubierto');
    assert.equal(estadoDelCielo(100).clave, 'cubierto');
  });

  test('una hora sin medir no es un cielo despejado', () => {
    assert.equal(estadoDelCielo(null), null);
    assert.equal(estadoDelCielo(NaN), null);
  });

  test('«despejado» SÍ se enseña: es información, no ausencia de ella', () => {
    // Al revés que en la lluvia, donde las horas secas se esconden. Un cielo
    // abierto en el Caribe es sol a plomo sobre la cuadrilla.
    const px = archivo(() => 1);          // 0 % de nubes las 24 horas
    const p = perfilEnCelda(px, FICHA, MES, 1, 0, 0);
    const r = comoEstuvoElCielo(p);
    assert.equal(r.length, 1);
    assert.equal(r[0].grado.clave, 'despejado');
    assert.equal(r[0].horas.length, 24);
  });

  test('el día se ordena del cielo más cerrado al más abierto', () => {
    // 00–11 despejado (0 %), 12–23 cubierto (90 %).
    const px = archivo((d, h) => (h < 12 ? 1 : 91));
    const p = perfilEnCelda(px, FICHA, MES, 1, 0, 0);
    const r = comoEstuvoElCielo(p);
    assert.equal(r[0].grado.clave, 'cubierto', 'lo que cambia la jornada va primero');
    assert.equal(r[1].grado.clave, 'despejado');
  });

  test('la escala del cielo NO inventa tormenta ni lluvia', () => {
    const nombres = ESCALA_CIELO.map((g) => g.nombre.toLowerCase()).join(' ');
    for (const prohibido of ['tormenta', 'eléctric', 'lluvia', 'llov', 'rayo']) {
      assert.ok(!nombres.includes(prohibido),
        `«${prohibido}» no se puede deducir de la nubosidad`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('la escala se ENSEÑA, no solo se aplica', () => {

  // Tras `§ADR-069` la escala vive en `PanelDelClima.tsx`, del que tiran las dos
  // pantallas. Lo que se vigila NO cambia: que se publique con su procedencia.
  const PANEL = readFileSync(
    fileURLToPath(new URL('../web/src/componentes/PanelDelClima.tsx', import.meta.url)), 'utf-8');

  test('las dos escalas llegan a la pantalla, no se quedan en el módulo', () => {
    // La regla de la casa: el veredicto sale del valor contra la norma, y la
    // norma SE ENSEÑA. Aplicar un corte sin publicarlo deja al que lee sin poder
    // comprobar nada — y el Ingeniero discute estos números con un cliente.
    for (const escala of ['ESCALA_LLUVIA', 'ESCALA_CIELO']) {
      assert.ok(PANEL.includes(escala), `${escala} dejó de llegar a la pantalla`);
    }
    assert.match(PANEL, /<LaEscala/, 'el bloque que publica la escala desapareció');
  });

  test('la escala dice de QUIÉN es el criterio', () => {
    // Un umbral sin fuente presentado como escala es una opinión con uniforme.
    assert.match(PANEL, /OMM/, 'la procedencia de los cortes dejó de publicarse');
  });

  test('se publican TODOS los grados, no solo los que pasaron ese día', () => {
    // Enseñar solo los ocurridos dejaría la escala coja: haría creer que
    // «torrencial» no existe porque ese día no llovió así.
    assert.match(PANEL, /grados\.map\(/,
      'la tabla de la escala tiene que recorrer la escala entera');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('lo construido tiene que poder ENCONTRARSE', () => {

  const PANEL = readFileSync(
    fileURLToPath(new URL('../web/src/componentes/ClimaDelAnio.tsx', import.meta.url)), 'utf-8');

  test('desde un día sin medida hay un puente al último día medido', () => {
    // EL FALLO REAL (2026-08-22): la capa abre en HOY, y hoy es pronóstico. Todo
    // el desglose —24 horas, veredicto, mes, escala— vive solo en los días
    // medidos, así que quien encendía la capa no veía NADA de eso y no tenía
    // forma de saber que existía. «No me sale en producción», y tenía razón.
    // Lo que no se encuentra no existe, por muy construido que esté.
    assert.match(PANEL, /ultimoDiaConHoras\)\}/,
      'el botón que salta al último día medido desapareció');
    assert.match(PANEL, /regimen !== 'medido_horas'/,
      'el puente tiene que ofrecerse justo cuando NO hay medida a la vista');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL RECORRIDO ENTERO CONTRA LA REJILLA. La pantalla venía AFIRMANDO «una sola
// celda cubre toda la línea» sin comprobarlo: resolvía con el promedio de las
// coordenadas. En una línea que roce un borde, el promedio cae en una celda y
// los extremos en otra, y la frase se vuelve mentira sin que nada avise.
// ════════════════════════════════════════════════════════════════════════════
describe('cada coordenada del recorrido, no el promedio', () => {

  // Rejilla de juguete de 1° por celda, con las mismas fórmulas de `rejilla.ts`.
  const F = { bbox: [-77, 7, -71, 13], ancho: 6, alto: 6 };
  const rad = Math.PI / 180;
  const my = (lat) => Math.log(Math.tan(Math.PI / 4 + lat * rad / 2));
  const celdaDe = (lon, lat, f) => {
    const [loMin, laMin, loMax, laMax] = f.bbox;
    const y0 = my(laMin), y1 = my(laMax);
    if (lon < loMin || lon > loMax || my(lat) < y0 || my(lat) > y1) return null;
    return {
      ix: Math.min(f.ancho - 1, Math.floor(((lon - loMin) / (loMax - loMin)) * f.ancho)),
      iy: Math.min(f.alto - 1, Math.floor(((y1 - my(lat)) / (y1 - y0)) * f.alto)),
    };
  };

  test('una línea corta dentro de una celda declara UNA celda', () => {
    const pts = Array.from({ length: 31 }, (_, i) => ({ lat: 10.40 + i * 0.002, lon: -75.50 }));
    const r = celdasDelRecorrido(pts, F, celdaDe);
    assert.equal(r.celdas.length, 1);
    assert.equal(r.puntos, 31);
    assert.equal(r.fuera, 0);
  });

  test('EL CASO QUE EL PROMEDIO ESCONDE: extremos en celdas distintas', () => {
    // Los dos extremos a un lado y otro de un borde. El PROMEDIO cae limpiamente
    // en una de las dos y la pantalla diría «una sola celda» tan tranquila.
    const pts = [{ lat: 10.9, lon: -75.5 }, { lat: 11.1, lon: -75.5 }];
    const r = celdasDelRecorrido(pts, F, celdaDe);
    assert.equal(r.celdas.length, 2, 'el cruce de borde pasó desapercibido');
    // Y se comprueba que el promedio, efectivamente, lo habría escondido.
    const medio = { lat: 11.0, lon: -75.5 };
    assert.equal(celdasDelRecorrido([medio], F, celdaDe).celdas.length, 1);
  });

  test('un punto fuera del encuadre se cuenta aparte, no se descarta en silencio', () => {
    const pts = [{ lat: 10.4, lon: -75.5 }, { lat: 4.6, lon: -74.1 }];
    const r = celdasDelRecorrido(pts, F, celdaDe);
    assert.equal(r.fuera, 1);
    assert.equal(r.celdas.length, 1);
    assert.equal(r.puntos, 2, 'el total tiene que seguir contando los dos');
  });

  test('sin coordenadas no se inventa nada', () => {
    const r = celdasDelRecorrido([], F, celdaDe);
    assert.deepEqual(r.celdas, []);
    assert.equal(r.puntos, 0);
  });

  test('la pantalla recibe el recorrido ENTERO, no solo el promedio', () => {
    // Tras `§ADR-069` el clima vive en el atlas: es App quien le pasa la línea y
    // el atlas quien deriva el recorrido ENTERO con el filtro único.
    const APP = readFileSync(
      fileURLToPath(new URL('../web/src/App.tsx', import.meta.url)), 'utf-8');
    const ATLAS = readFileSync(
      fileURLToPath(new URL('../web/src/componentes/AtlasCaribe.tsx', import.meta.url)), 'utf-8');
    assert.match(APP, /linea=\{d\.fase === 'listo'/,
      'App dejó de pasar la línea al atlas');
    assert.match(ATLAS, /const E = soloEstructuras\(linea\.apoyos\)/,
      'el atlas dejó de derivar el recorrido con el filtro único');
    assert.match(ATLAS, /celdasDelRecorrido\(recorrido\.puntos/,
      'el atlas dejó de comprobar el recorrido punto por punto');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('quién es «la línea»: un solo filtro, no uno por pantalla', () => {

  test('el mapa usa `soloEstructuras`, no un filtro escrito a mano', () => {
    // `vistas/planta.ts` lo dice en su propio comentario: «se filtra AQUÍ, en un
    // solo sitio, para que ninguna vista pueda olvidarlo». El mapa lo había
    // olvidado: usaba `!== 'Empalme'`, que deja pasar los «Punto de referencia»
    // —marcas del levantamiento que no sostienen conductor— y los contaba como
    // apoyos. En LN-627 no hay ninguno todavía, así que el fallo era invisible:
    // exactamente la clase que espera a una línea nueva para aparecer.
    // Tras `§ADR-069` quien necesita saber «qué puntos son la línea» es el
    // atlas. La regla no cambia: la contesta `soloEstructuras`, nadie más.
    const FUENTES = ['componentes/AtlasCaribe.tsx', 'componentes/Mapa.tsx'].map((f) =>
      readFileSync(fileURLToPath(new URL('../web/src/' + f, import.meta.url)), 'utf-8'));
    assert.match(FUENTES[0], /soloEstructuras\(/,
      'el atlas volvió a decidir por su cuenta qué puntos son la línea');
    for (const src of FUENTES) {
      assert.ok(!/\.filter\(\(a\) => \(a\.tipoPunto \?\? 'Estructura'\) !== 'Empalme'\)/.test(src),
        'volvió el filtro a mano que cuenta los puntos de referencia como apoyos');
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el deslizador de la hora tiene que decir su número', () => {

  test('la pantalla publica el valor de la celda EN esa hora', () => {
    // Se perdió al migrar el clima al atlas (`§ADR-069`) y el Ingeniero lo echó
    // en falta: «se podía apreciar por día el hora a hora del comportamiento de
    // cada parámetro». Sin el número, mover la hora repinta el mapa pero el
    // panel calla — y el deslizador deja de ser un instrumento.
    const ATLAS = readFileSync(
      fileURLToPath(new URL('../web/src/componentes/AtlasCaribe.tsx', import.meta.url)), 'utf-8');
    assert.match(ATLAS, /delDia\.perfil\.horas\[hora\]/,
      'el panel dejó de publicar el valor de la hora elegida');
    // Y un hueco se dice, no se imprime como cero (el invariante que más muerde).
    assert.match(ATLAS, /no se midió esta hora/,
      'una hora sin medida volvió a poder salir como un número');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el nexo entre el recorrido de la línea y el atlas', () => {

  const ATLAS = readFileSync(
    fileURLToPath(new URL('../web/src/componentes/AtlasCaribe.tsx', import.meta.url)), 'utf-8');

  test('al abrir, el sujeto es LA LÍNEA, no una celda que haya que buscar', () => {
    // «Que los detalles se puedan apreciar al momento de seleccionar la línea y
    // no escoger celdas» (2026-08-22). El foco arranca en la celda del recorrido
    // —comprobada punto por punto— y solo lo desplaza un clic deliberado.
    assert.match(ATLAS, /if \(clic\) return \{ celda: celdaDe\(clic\.lon, clic\.lat, ficha\)/,
      'el clic dejó de poder desplazar el foco');
    assert.match(ATLAS, /delRecorrido\?\.celdas\.length === 1/,
      'el atlas dejó de tomar por defecto la celda del recorrido de la línea');
  });

  test('y se puede VOLVER a la línea sin recargar', () => {
    assert.match(ATLAS, /Volver a \{recorrido\.codigo\}/,
      'desapareció el camino de vuelta al recorrido tras mirar otra celda');
    assert.match(ATLAS, /onClick=\{\(\) => setClic\(null\)\}/,
      'el botón de volver dejó de soltar el clic');
  });

  test('el atlas conoce el recorrido ENTERO, no un punto', () => {
    // El nexo no es «la línea está por aquí»: son sus coordenadas, y con ellas
    // se comprueba en cuántas celdas cae (`§ADR-064`).
    assert.match(ATLAS, /celdasDelRecorrido\(recorrido\.puntos, ficha, celdaDe\)/,
      'el atlas dejó de cruzar el recorrido completo con la rejilla');
  });
});
