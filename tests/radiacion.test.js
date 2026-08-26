// ============================================================================
// tests/radiacion.test.js — el recurso solar del corredor
// ----------------------------------------------------------------------------
// ESTA CAPA NO ES DECORACIÓN Y POR ESO SE VIGILA DISTINTO. La radiación solar es
// una ENTRADA del cálculo térmico de esta misma aplicación: la ampacidad
// (IEEE 738) se calcula con 1.000 W/m² ADOPTADOS. Poner una cifra de sol al lado
// de una línea invita a una conversión que NO se puede hacer —lo mapeado es
// energía diaria (kWh/m² al día) y lo que come la norma es una irradiancia
// instantánea (W/m² al mediodía)— así que la frase que lo impide se prueba como
// se prueba una defensa, no como se prueba un texto.
//
// Lo demás que se vigila: que el orden de las capas ponga la media del año al
// final y no en medio de los meses, que la oscilación entre el mes más soleado y
// el más flojo se publique —una media anual sola se la lleva por delante— y que
// el muestreo grueso se DECLARE.
//
// Datos sintéticos.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  capasOrdenadas, capaElegida, oscilacionAnual, avisoDeMuestreo, avisoDeEscala,
  NOTA_AMPACIDAD, NOTA_ENCUADRE,
} from '../web/src/vistas/radiacion.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => readFileSync(join(RAIZ, p), 'utf-8');

const capa = (clave, rotulo, p50) => ({
  clave, rotulo, archivo: `x-${clave}.png`, cobertura_pct: 100,
  resumen: { min: p50 - 0.3, p50, max: p50 + 0.3 },
});

const FICHA = {
  bbox: [0, 0, 0.4, 0.2], ancho: 4, alto: 2, resolucion_m: 2000, resolucion_nativa_m: 1000,
  codificacion: { offset: 0, paso: 0.03, sin_dato: 0 },
  rampa: [{ c: 3, rgb: [0, 0, 255] }, { c: 7, rgb: [255, 0, 0] }],
  unidad: 'kWh/m² al día',
  capas: [
    capa('anual', 'Media del año', 5.4),
    capa('03', 'Marzo', 6.2),
    capa('01', 'Enero', 5.8),
    capa('11', 'Noviembre', 4.6),
  ],
};

// ════════════════════════════════════════════════════════════════════════════
describe('el orden de las capas', () => {

  test('los meses van en orden y la media del año al FINAL', () => {
    // Si «anual» se colara entre los meses, el selector diría que después de
    // febrero viene la media del año — y quien elija a ojo se lleva otra cosa.
    assert.deepEqual(capasOrdenadas(FICHA).map((c) => c.clave), ['01', '03', '11', 'anual']);
  });

  test('sin elección se enseña la media del año, no el primer mes que caiga', () => {
    assert.equal(capaElegida(FICHA, null).clave, 'anual');
    assert.equal(capaElegida(FICHA, 'no-existe').clave, 'anual');
  });

  test('la capa pedida manda', () => {
    assert.equal(capaElegida(FICHA, '11').rotulo, 'Noviembre');
  });

  test('una ficha sin capas no revienta: devuelve nada', () => {
    assert.equal(capaElegida({ ...FICHA, capas: [] }, '01'), null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('la oscilación del año: lo que una media anual esconde', () => {

  test('nombra el mes más soleado, el más flojo y cuánto los separa', () => {
    const o = oscilacionAnual(FICHA);
    assert.equal(o.alto.rotulo, 'Marzo');
    assert.equal(o.bajo.rotulo, 'Noviembre');
    // (6,2 − 4,6) / 4,6 = 34,8 %
    assert.ok(Math.abs(o.pct - 34.7826) < 0.01, `esperaba ~34,8 %, dio ${o.pct}`);
  });

  test('la media del AÑO no entra en la comparación de meses', () => {
    // Con «anual» dentro, el mes «más flojo» podría salir siendo la media, que no
    // es un mes: la cifra dejaría de significar lo que dice.
    const o = oscilacionAnual({ ...FICHA, capas: [capa('anual', 'Media del año', 0.1), ...FICHA.capas.slice(1)] });
    assert.equal(o.bajo.rotulo, 'Noviembre');
  });

  test('con un solo mes no se inventa una oscilación', () => {
    assert.equal(oscilacionAnual({ ...FICHA, capas: [capa('01', 'Enero', 5)] }), null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('las dos frases que impiden el mal uso', () => {

  test('la nota de ampacidad nombra la magnitud que SÍ entra en el cálculo', () => {
    assert.match(NOTA_AMPACIDAD, /1\.000 W\/m²/,
      'sin nombrar el valor adoptado, la advertencia es un descargo genérico');
    assert.match(NOTA_AMPACIDAD, /INSTANT/i);
    assert.match(NOTA_AMPACIDAD, /ENERGÍA DIARIA/);
    assert.match(NOTA_AMPACIDAD, /regla de tres/,
      'hay que decir que NO se convierte, no solo que son distintas');
  });

  test('el muestreo grueso se declara cuando lo es', () => {
    const a = avisoDeMuestreo(FICHA);
    assert.match(a, /2\.0 km/);
    assert.match(a, /una muestra, no el original/);
  });

  test('si se muestrea al nativo o más fino, no se molesta con el aviso', () => {
    assert.equal(avisoDeMuestreo({ ...FICHA, resolucion_m: 1000 }), null);
    assert.equal(avisoDeMuestreo({ ...FICHA, resolucion_nativa_m: undefined }), null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PODER APRECIAR LA CAPA — el hueco que encontró el Ingeniero el 2026-08-21
// ----------------------------------------------------------------------------
// La capa se pintaba, se descargaba y respondía al clic: todo verde. Y aun así
// no se podía APRECIAR, por dos motivos que ya se habían resuelto en la capa
// hermana de temperatura y que nunca cruzaron:
//
//   · la rampa era FIJA y ancha (3,0 - 7,5), y la media del año ocupaba el 11 %
//     de la escala → `99 §ADR-041`, `30 · L-61`;
//   · no había forma de abarcar el recorte de un clic, y ceñida a los 3 km de la
//     línea el recurso solar es el mismo en todas las celdas → `99 §ADR-042`.
//
// Estas pruebas existen para que la próxima capa que nazca no repita el hueco.
// ════════════════════════════════════════════════════════════════════════════
describe('la escala se publica, porque el color afirma', () => {

  test('el aviso da la escala del recorte y niega la lectura fácil', () => {
    const a = avisoDeEscala(FICHA, null);
    assert.match(a, /ajustado a este recorte/);
    assert.match(a, /NO significa sol extremo/,
      'un rojo sin su número se lee como «aquí pega un sol brutal»');
    // Sin capa no se inventa una amplitud espacial.
    assert.ok(!/del punto más flojo/.test(a));
  });

  test('la amplitud que se anuncia es la del MES mostrado, no la de la media anual', () => {
    // El mismo fallo ya cazado en temperatura: imprimir la amplitud de la media
    // anual con la frase «en este mes» es falso para casi todos los meses.
    const marzo = FICHA.capas.find((c) => c.clave === '03');
    const nov = FICHA.capas.find((c) => c.clave === '11');
    const aMar = avisoDeEscala({ ...FICHA, capas: FICHA.capas.map((c) => (c.clave === '03'
      ? { ...c, resumen: { ...c.resumen, min: 5.8, max: 6.6 } } : c)) },
    { ...marzo, resumen: { min: 5.8, p50: 6.2, max: 6.6 } });
    const aNov = avisoDeEscala(FICHA, nov);
    assert.notEqual(aMar, aNov, 'dos meses con amplitudes distintas no pueden dar la misma frase');
    assert.match(aMar, /marzo/i, 'la frase dice de qué mes habla');
    assert.match(aMar, /0\.80/, 'la amplitud del mes mostrado, medida, no una constante');
  });

  test('una ficha sin rampa no revienta ni se inventa una escala', () => {
    assert.equal(avisoDeEscala({ ...FICHA, rampa: [] }, null), null);
  });

  test('la nota del encuadre explica el mapa liso SIN invitar a estirar la rampa', () => {
    assert.match(NOTA_ENCUADRE, /no es un fallo/);
    assert.match(NOTA_ENCUADRE, /recorte entero/);
    assert.ok(!/3 km|LN-627/.test(NOTA_ENCUADRE),
      'esto sirve a cualquier línea: el largo de LN-627 no se quema en el texto');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('la ficha publicada trae la escala de ESTE recorte', () => {
  const FICHA_REAL = JSON.parse(leer('web/public/mapas/cartagena-radiacion.json'));

  test('la rampa se declara ajustada al recorte', () => {
    assert.equal(FICHA_REAL.rampa_ajustada_al_recorte, true);
  });

  test('las trece capas ocupan la mayor parte de la escala, no un rincón', () => {
    // El invariante que faltaba. Con la rampa fija (3,0 - 7,5) los datos reales
    // —4,38 a 6,54— ocupaban el 48 % de la escala y la media del año, el 11 %:
    // el mapa salía de un color y parecía roto.
    const lo = Math.min(...FICHA_REAL.capas.map((c) => c.resumen.min));
    const hi = Math.max(...FICHA_REAL.capas.map((c) => c.resumen.max));
    const r0 = FICHA_REAL.rampa[0].c;
    const r1 = FICHA_REAL.rampa[FICHA_REAL.rampa.length - 1].c;
    const ocupa = (hi - lo) / (r1 - r0);
    assert.ok(ocupa > 0.8, `los datos ocupan el ${(ocupa * 100).toFixed(0)} % de la rampa: `
      + 'una escala que no es de este recorte deja el mapa de un solo color');
    assert.ok(r0 <= lo && r1 >= hi, 'la rampa tiene que cubrir el dato, no recortarlo');
  });

  test('el generador sabe rehacer la ficha SIN volver a muestrear', () => {
    // 352 peticiones a un servicio ajeno para cambiar un color no se piden. Que
    // la temperatura tuviera `--reusar` y el sol no fue lo que hizo parecer caro
    // corregir esta escala.
    const gen = leer('herramientas/teselas/construir-raster.py');
    assert.match(gen, /def radiacion\(reusar=False\)/);
    assert.match(gen, /def _publicar_radiacion\(/);
    assert.match(gen, /radiacion\(reusar=args\.reusar\)/);
  });

  test('la rampa NO se calcula por mes: un color, un valor', () => {
    // Una escala por mes repintaría el mismo color sobre valores distintos y
    // comparar dos meses engañaría — que es lo único que la rampa fija protegía.
    const gen = leer('herramientas/teselas/construir-raster.py');
    assert.match(gen, /rampa_de_radiacion\(min\(c\['resumen'\]\['min'\] for c in capas\)/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('las dos capas de medida se miran con las mismas herramientas', () => {
  // ⚠️ MIRA `CapasDelCorredor`, NO `Mapa` (`99 §ADR-087`): las dos capas se
  // mudaron a la pantalla del atlas. El guardián NO se borró al mudarse el
  // código — el hueco que vigila (una leyenda con botón y la otra sin él) puede
  // reabrirse igual de bien en su casa nueva.
  const MAPA = leer('web/src/componentes/CapasDelCorredor.tsx');

  test('las DOS leyendas reciben el encuadre, no solo la de temperatura', () => {
    // Éste es el guardián del hueco: `alEncuadrar` nació en la leyenda de
    // temperatura y a la del sol nunca se le pasó. Sin botón, la capa se ve de un
    // color y quien la enciende concluye que está rota — y tendría motivos.
    for (const leyenda of ['LeyendaRadiacion', 'LeyendaTemperatura']) {
      const i = MAPA.indexOf(`<${leyenda} `);
      assert.ok(i > 0, `no se monta ${leyenda}`);
      const bloque = MAPA.slice(i, MAPA.indexOf('/>', i));
      assert.match(bloque, /alEncuadrar=/,
        `${leyenda} se monta sin forma de abarcar el recorte: a escala de la línea `
        + 'su capa se ve de un solo color y parece rota');
    }
  });

  test('el encuadre al recorte tiene UN dueño, no una copia por leyenda', () => {
    // Ojo: el OTRO `fitBounds` del archivo es el encuadre inicial a la línea, que
    // es otra cosa. Lo que no puede haber es una copia dentro de cada leyenda.
    assert.equal((MAPA.match(/function irAlRecorte\(/g) ?? []).length, 1,
      'el encuadre al recorte tiene que ser UNA función, no una copia por sitio que lo pide: '
      + 'lo piden dos —el efecto al encenderla y el botón— y escrito dos veces un día discrepan');
    const alRecorte = (MAPA.match(/fitBounds\(\[\[x0, y0\], \[x1, y1\]\]/g) ?? []).length;
    assert.equal(alRecorte, 1,
      'dos copias del encuadre al recorte son dos comportamientos que un día discrepan: '
      + 'cada capa encuadraría distinto');
  });

  test('la leyenda del sol le pasa a la escala la capa que está pintando', () => {
    assert.match(MAPA, /avisoDeEscalaSol\(ficha, actual\)/);
  });
});
