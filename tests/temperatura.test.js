// ============================================================================
// tests/temperatura.test.js — la temperatura del AIRE, la que sí entra al cálculo
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. `ADR-036` publicó la temperatura de la SUPERFICIE y `ADR-037`
// la retiró: no entra en ninguna ecuación de este sistema. La del AIRE sí —es
// entrada de la ampacidad y el marco de las cuatro temperaturas de la hipótesis—
// y por eso mismo es más peligrosa: un dato que SÍ alimenta un cálculo, mal
// leído, sale firmado.
//
// Lo que se defiende aquí, en orden de daño:
//
//   1. QUE NADIE CONFUNDA UNA MEDIA CON UN EXTREMO. El tiro máximo se juega con
//      la MÍNIMA histórica y la ampacidad de diseño con un percentil ALTO. Leer
//      los 27 °C de media como «la mínima del sitio» deja el tiro en frío corto
//      y un apoyo terminal parece sano sin serlo.
//   2. QUE LA OSCILACIÓN SE DIGA EN GRADOS, NO EN PORCENTAJE. Un 5 % de 27 °C no
//      significa nada: la escala Celsius no tiene cero físico, y quien lea un
//      porcentaje sobre una temperatura acabará multiplicándolo por algo.
//   3. QUE UN MAPA LISO NO SE LEA COMO AVERÍA. Si no se dice cuánto varía de
//      verdad, el reflejo siguiente es estirar la rampa hasta que «se vea algo»
//      — que es exactamente como se fabrica un gradiente que no existe.
//   4. QUE LA CAPA NO MIENTA SOBRE SU ORIGEN: fuente, licencia y período van en
//      la ficha, y el período NO es «hoy».
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  capaElegida, capasOrdenadas, oscilacionEstacional, avisoDeEscala, avisoDeMuestreo,
  contraLaEds, NOTA_HIPOTESIS,
} from '../web/src/vistas/temperatura.ts';
import { valorDeByte, colorDeValor } from '../web/src/vistas/rejilla.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => readFileSync(join(RAIZ, p), 'utf-8');
const FICHA = JSON.parse(leer('web/public/mapas/cartagena-temperatura.json'));

// ════════════════════════════════════════════════════════════════════════════
// 1 · LA FICHA: qué es, de dónde salió y de cuándo
// ════════════════════════════════════════════════════════════════════════════

describe('la capa declara lo que es y lo que no', () => {
  test('es la del AIRE, no la de la superficie que se retiró', () => {
    assert.equal(FICHA.capa, 'temperatura');
    assert.match(FICHA.magnitud, /aire a 2 m/,
      'si esto volviera a decir «superficie», sería la capa que ADR-037 quitó por no entrar en '
      + 'ningún cálculo');
    assert.equal(FICHA.unidad, '°C');
  });

  test('dice de cuándo es, y NO es «hoy»', () => {
    assert.match(FICHA.periodo, /largo plazo/);
    assert.match(FICHA.periodo, /1994-2025/,
      'una media sin su período no se puede defender: no se sabe de qué años habla');
    assert.equal(FICHA.es_media_no_extremo, true);
  });

  test('trae fuente, licencia y atribución — el deber no es opcional', () => {
    assert.match(FICHA.fuente, /Global Solar Atlas/);
    assert.match(FICHA.licencia, /CC BY 4\.0/);
    assert.match(FICHA.licencia, /comercial/,
      'la licencia se guarda con su alcance: este proyecto no puede usar fuentes no comerciales');
    assert.ok(FICHA.atribucion && FICHA.atribucion.length > 20);
  });

  test('el recorte es el MISMO de las demás capas del mapa', () => {
    const rad = JSON.parse(leer('web/public/mapas/cartagena-radiacion.json'));
    assert.deepEqual(FICHA.bbox, rad.bbox,
      'dos capas con recortes distintos enseñarían territorios distintos y el borde parecería un fallo');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2 · LA REJILLA: que el byte diga lo que la ficha promete
// ════════════════════════════════════════════════════════════════════════════

describe('la rejilla mide lo que dice', () => {
  test('las 13 capas existen en el sitio y pesan lo declarado', () => {
    assert.equal(FICHA.capas.length, 13, 'los doce meses y la media del año');
    for (const c of FICHA.capas) {
      const ruta = join(RAIZ, 'web/public/mapas', c.archivo);
      assert.ok(existsSync(ruta), `falta ${c.archivo}: la capa no se encendería y nadie sabría por qué`);
      assert.ok(statSync(ruta).size > 0);
    }
  });

  test('el byte 0 es SIN DATO, nunca un valor', () => {
    assert.equal(FICHA.codificacion.sin_dato, 0);
    assert.equal(valorDeByte(0, FICHA.codificacion), null,
      'confundir «no se midió» con un valor pinta el extremo de la rampa donde falta la medida');
  });

  test('ida y vuelta: el byte devuelve el grado que se guardó', () => {
    const { offset, paso } = FICHA.codificacion;
    for (const grados of [25.4, 27.32, 28.4]) {
      const b = Math.round((grados - offset) / paso) + 1;
      const vuelta = valorDeByte(b, FICHA.codificacion);
      assert.ok(Math.abs(vuelta - grados) <= paso,
        `${grados} °C volvió como ${vuelta}: el paso de la codificación no cuadra`);
    }
  });

  test('los valores publicados caen dentro de la rampa, no fuera', () => {
    const min = FICHA.rampa[0].c;
    const max = FICHA.rampa[FICHA.rampa.length - 1].c;
    for (const c of FICHA.capas) {
      assert.ok(c.resumen.min >= min && c.resumen.max <= max,
        `${c.rotulo} (${c.resumen.min}…${c.resumen.max} °C) se sale de la rampa ${min}…${max}`);
    }
  });

  test('la rampa va en orden y da color a un valor real', () => {
    const cortes = FICHA.rampa.map((p) => p.c);
    assert.deepEqual(cortes, [...cortes].sort((a, b) => a - b), 'la rampa está desordenada');
    const rgb = colorDeValor(27.3, FICHA.rampa);
    assert.equal(rgb.length, 3);
    assert.ok(rgb.every((x) => x >= 0 && x <= 255));
  });

  test('la rampa se ajusta al recorte para que el gradiente SE VEA', () => {
    // Corrección de criterio (`99 §ADR-041`): la escala fija y ancha dejaba el
    // mapa de un color sobre un corredor costero, y un mapa que no enseña su
    // gradiente no informa. Se ajusta al dato — y se declara que se ajustó.
    const min = FICHA.rampa[0].c;
    const max = FICHA.rampa[FICHA.rampa.length - 1].c;
    const datoMin = Math.min(...FICHA.capas.map((c) => c.resumen.min));
    const datoMax = Math.max(...FICHA.capas.map((c) => c.resumen.max));
    assert.ok(min <= datoMin && max >= datoMax, 'la rampa tiene que cubrir todo el dato');
    assert.ok((max - min) <= (datoMax - datoMin) + 0.5,
      `la rampa cubre ${max - min} °C para un dato de ${(datoMax - datoMin).toFixed(2)}: sobra escala `
      + 'y el gradiente se pierde');
    assert.equal(FICHA.rampa_ajustada_al_recorte, true,
      'una escala ajustada que no se declara se lee como si fuera universal');
  });

});

// ════════════════════════════════════════════════════════════════════════════
// 3 · LO QUE LA PANTALLA TIENE QUE DECIR
// ════════════════════════════════════════════════════════════════════════════

describe('media no es extremo, y se dice', () => {
  test('la nota nombra las DOS hipótesis que esta capa NO cierra', () => {
    assert.match(NOTA_HIPOTESIS, /MEDIA/);
    assert.match(NOTA_HIPOTESIS, /mínima/, 'el tiro máximo en frío se juega con la mínima');
    assert.match(NOTA_HIPOTESIS, /ampacidad/, 'la ambiente de diseño es un percentil alto');
    assert.match(NOTA_HIPOTESIS, /percentiles de una SERIE/,
      'sin decir qué haría falta de verdad, el aviso solo asusta');
  });

  test('la oscilación se da en GRADOS, no en porcentaje', () => {
    const o = oscilacionEstacional(FICHA);
    assert.ok(o, 'con doce meses tiene que poder calcularla');
    assert.equal(typeof o.grados, 'number');
    assert.ok(!('pct' in o), 'un porcentaje sobre °C no significa nada: la escala no tiene cero físico');
    assert.ok(o.grados > 0);
    assert.equal(o.alto.clave !== 'anual' && o.bajo.clave !== 'anual', true,
      'la media del año no compite con los meses: los resumiría a los dos');
  });

  test('el aviso de la escala dice el rango y niega el «calor extremo»', () => {
    // El riesgo cambió de bando: con la rampa ajustada al recorte el mapa ya no
    // parece roto — ahora puede parecer que hay una diferencia térmica enorme
    // donde hay tres grados. Lo que se afirma con color se explica con números.
    const a = avisoDeEscala(FICHA);
    assert.ok(a, 'una escala ajustada sin explicar es peor que un mapa liso');
    assert.match(a, /ajustado a este recorte/);
    assert.match(a, /NO significa calor extremo/);
    assert.match(a, new RegExp(FICHA.rampa[0].c.toFixed(1)), 'el extremo frío tiene que ir escrito');
  });

  test('el muestreo grueso se declara, con su porqué', () => {
    const m = avisoDeMuestreo(FICHA);
    assert.ok(m, `se muestrea cada ${FICHA.resolucion_m} m sobre un dato de ${FICHA.resolucion_nativa_m} m`);
    assert.match(m, /muestra, no el original/);
  });
});

describe('comparar con la hipótesis NO es dictaminar', () => {
  test('nombra la diferencia y se niega a validar', () => {
    const c = contraLaEds(27.4, 25);
    assert.ok(c);
    assert.match(c.frase, /27\.4/);
    assert.match(c.frase, /2\.4 °C/, 'la diferencia se dice en grados, para poder discutirla');
    assert.match(c.frase, /No lo valida ni lo desmiente/,
      'un dato del sitio no valida una hipótesis de diseño, y decir lo contrario es el error caro');
  });

  test('si coinciden, lo dice sin inventar una alarma', () => {
    const c = contraLaEds(25.2, 25);
    assert.match(c.frase, /coinciden en la práctica/);
  });

  test('sin hipótesis declarada no se compara con nada', () => {
    assert.equal(contraLaEds(27.4, null), null);
    assert.equal(contraLaEds(null, 25), null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4 · LAS DOS MEDIDAS NO SE PISAN
// ════════════════════════════════════════════════════════════════════════════

describe('solo una capa de medida encendida', () => {
  // ⚠️ LAS DOS CAPAS SE MUDARON AL ATLAS (`99 §ADR-087`). Ninguno de estos
  // guardianes se borró: lo que vigilan —dos rampas que se tapan, una marca que
  // no distingue capas, una ficha reusada de la otra— puede volver a pasar
  // exactamente igual en la casa nueva. Lo único que cambia es dónde mirar.
  const CAPAS = leer('web/src/componentes/CapasDelCorredor.tsx');
  const CATALOGO = leer('web/src/vistas/corredor.ts');
  const MAPA = leer('web/src/componentes/Mapa.tsx');

  test('hay UNA sola capa de MapLibre para las medidas', () => {
    assert.match(CATALOGO, /export const ID_CAPA_CORREDOR = 'capa-corredor'/,
      'dos capas de rampa superpuestas no se leen: el color de arriba tapa al de abajo');
    assert.ok(!/'capa-radiacion'/.test(CAPAS),
      'quedó viva la capa vieja: dos ids para lo mismo dejan una encendida para siempre');
  });

  test('el mapa de la LÍNEA se quedó sin ellas, no con una copia', () => {
    // Es el guardián de la mudanza (`§ADR-087`). «Que aparezca en X» significa
    // MIGRAR: si el interruptor sobreviviera aquí, habría dos dueños del mismo
    // dibujo y el día que uno cambie el otro se queda mintiendo (`30 · M-01`).
    for (const rastro of ['MEDIDAS', 'ID_MEDIDA', 'LeyendaRadiacion', 'LeyendaTemperatura']) {
      assert.ok(!new RegExp(`\\b${rastro}\\b`).test(MAPA),
        `«${rastro}» sigue vivo en el mapa de la línea: se copió en vez de mudarse`);
    }
  });

  test('la marca de lo pintado incluye QUÉ medida, no solo el mes', () => {
    // Con solo el mes, pasar de radiación a temperatura en el mismo mes se
    // saltaría el repintado —la clave no cambia— y quedaría la capa anterior
    // debajo de la leyenda nueva.
    assert.match(CAPAS, /const marca = `\$\{puesta\}:\$\{capa\.clave\}`/);
    assert.match(CAPAS, /rejillaLista !== marca/);
  });

  test('cambiar de medida vuelve a pedir SU ficha', () => {
    assert.match(CAPAS, /ficha\?\.capa === puesta \? ficha : null/,
      'reusar la ficha de la otra capa pintaría la rampa del sol sobre los grados del aire');
  });

  test('el catálogo declara las dos, y la temperatura apunta a su ficha', () => {
    assert.match(CATALOGO, /temperatura: \{[\s\S]{0,300}cartagena-temperatura\.json/);
  });
});
