// ============================================================================
// tests/detalle-gps.test.js — la pestaña del mapa a pantalla, y sus redes
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. Esta pestaña nació de una petición de disposición —«el fondo
// está en la mitad», «que se aprecie más grande»— y en el primer intento se
// llevó por delante tres salvaguardas que el proyecto había pagado caras. Las
// cazó una revisión adversarial ANTES de que las viera nadie más; esto es lo que
// impide que vuelvan:
//
//   1. UNA CARGA DIFERIDA SIN REINTENTOS MATA LA APLICACIÓN. Ya pasó en
//      producción: el trozo tardó en estar disponible, el navegador falló una
//      vez y la página quedó en blanco para siempre. `datos/cargar.ts` se
//      declara «la ÚNICA frontera» — y se creó una segunda sin reintentos.
//   2. UN MAPA SIN RED DEGRADA A CAJA VACÍA con un panel de capas que parece
//      sano y no hace nada: un hueco disfrazado de pantalla buena, que es
//      exactamente lo que este producto no puede permitirse.
//   3. EL ANCHO NO SE PREGUNTA A LA VENTANA. El caparazón de tres columnas se
//      come ~460 px, así que una regla de ventana de 900 px no se dispara nunca
//      y la pestaña «en grande» acababa enseñando un mapa MÁS ANGOSTO que el
//      pequeño del Resumen en cualquier portátil. El propio CSS lo tenía escrito
//      900 líneas antes para otra rejilla.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { avisoDeEscala } from '../web/src/vistas/temperatura.ts';
import { resumenDelLevantamiento } from '../web/src/vistas/planta.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => readFileSync(join(RAIZ, p), 'utf-8');
const GPS = leer('web/src/componentes/DetalleGps.tsx');
const CSS = leer('web/src/estilo.css');
const MAPA = leer('web/src/componentes/Mapa.tsx');

describe('el mapa nunca se monta sin sus redes', () => {
  test('TODA carga diferida del mapa pasa por `conReintentos`', () => {
    for (const [nombre, txt] of [['DetalleGps.tsx', GPS], ['Linea.tsx', leer('web/src/componentes/Linea.tsx')]]) {
      const perezosos = [...txt.matchAll(/lazy\(\(\) => ([^)]*)\)/g)].map((m) => m[1]);
      for (const p of perezosos) {
        assert.match(p, /conReintentos/,
          `${nombre} carga un trozo sin reintentos: si la descarga tropieza una vez, la página se `
          + 'queda en blanco para siempre (ya ocurrió en producción)');
      }
    }
  });

  test('donde se monta el mapa hay error boundary Y respaldo', () => {
    assert.match(GPS, /<RespaldoMapa/, 'sin boundary, un fallo del mapa se lleva la aplicación entera');
    assert.match(GPS, /respaldo=\{<PlantaSvg/,
      'sin respaldo, un fallo de descarga deja una caja vacía con el panel de capas encima: '
      + 'parece que funciona y no hace nada');
    assert.match(GPS, /Suspense/);
  });

  test('el respaldo dice que los datos siguen ahí, no solo que falló', () => {
    assert.match(GPS, /coordenadas de abajo siguen completas/,
      'quien pierde el mapa en campo tiene que saber que la tabla sigue sirviendo');
  });
});

describe('la disposición se decide por la COLUMNA, no por la ventana', () => {
  test('el panel lateral apila con un container query', () => {
    const bloque = CSS.slice(CSS.indexOf('.mapa-real--lado'));
    const corte = bloque.slice(0, bloque.indexOf('\n\n\n') + 1 || bloque.length);
    assert.ok(!/@media[^{]*\)\s*\{\s*\.mapa-real--lado/.test(CSS),
      'una regla de ventana no se dispara nunca dentro del caparazón de tres columnas: la pestaña '
      + '«en grande» acabaría más angosta que el mapa del Resumen');
    assert.match(corte, /@container contenido/,
      'se pregunta por el ancho de la columna, como ya hace `.resumen-grilla`');
  });

  test('el mapa a pantalla es MÁS ALTO que el del resumen', () => {
    assert.match(CSS, /\.mapa-real--lado \.mapa-lienzo\s*\{[^}]*height: calc\(100vh - 190px\)/,
      'si no gana alto, la pestaña no aporta nada sobre el mapa del resumen');
  });
});

describe('la leyenda no redondea a otra magnitud', () => {
  const FICHA = JSON.parse(leer('web/public/mapas/cartagena-temperatura.json'));

  test('la amplitud que se anuncia es la del MES mostrado, no la de la media anual', () => {
    // El fallo real: se imprimía `amplitud_espacial_c` —que es de la media
    // anual— con la frase «en un mes dado». En este recorte los meses van de
    // 0,8 a 1,7 °C: la cifra era falsa para once de los doce.
    const noviembre = FICHA.capas.find((c) => c.clave === '11');
    const enero = FICHA.capas.find((c) => c.clave === '01');
    const aNov = avisoDeEscala(FICHA, noviembre);
    const aEne = avisoDeEscala(FICHA, enero);
    assert.notEqual(aNov, aEne, 'dos meses con amplitudes distintas no pueden dar la misma frase');
    assert.match(aNov, new RegExp((noviembre.resumen.max - noviembre.resumen.min).toFixed(1)));
    assert.match(aEne, new RegExp((enero.resumen.max - enero.resumen.min).toFixed(1)));
    assert.match(aNov, /noviembre/i, 'la frase dice de qué mes habla');
  });

  test('sin capa, el aviso sigue dando la escala y no inventa una amplitud', () => {
    const a = avisoDeEscala(FICHA, null);
    assert.match(a, /ajustado a este recorte/);
    assert.ok(!/del punto más fresco/.test(a));
  });

  test('la pantalla le pasa la capa que está pintando', () => {
    // La leyenda térmica se mudó al atlas (`99 §ADR-087`), y con ella este
    // guardián: la escala tiene que hablar de la capa PINTADA, no de la ficha
    // entera. Se sigue vigilando, solo que donde vive ahora.
    assert.match(leer('web/src/componentes/CapasDelCorredor.tsx'), /avisoDeEscala\(ficha, actual\)/);
  });

  test('ninguna cifra de UNA línea concreta vive en el componente del mapa', () => {
    assert.ok(!/en 3 km/.test(MAPA),
      'esto es una fábrica de informes de cualquier línea: el largo de LN-627 no se quema aquí');
  });
});

describe('la pantalla no agrega datos por su cuenta', () => {
  const apoyo = (sistema, metodo, precision) => ({
    id: `ap-${sistema}-${metodo}-${precision}`,
    coordenada: { lat: 0, lon: 0, sistemaReferencia: sistema, metodo, precision_m: precision },
  });

  test('el sistema y el método se AGREGAN, no se toman del primer punto', () => {
    // El día que entre un punto con RTK, leer la primera fila diría «GPS de
    // mano, ±8 m» de un levantamiento mixto — peor que no decir nada.
    const r = resumenDelLevantamiento([apoyo('WGS84', 'gps_mano', 8), apoyo('WGS84', 'rtk', 0.02)]);
    assert.deepEqual(r.sistemas, ['WGS84']);
    assert.deepEqual(r.metodos, ['GPS de mano', 'rtk']);
  });

  test('la precisión que manda es la PEOR, nunca la media', () => {
    const r = resumenDelLevantamiento([apoyo('WGS84', 'rtk', 0.02), apoyo('WGS84', 'gps_mano', 8)]);
    assert.equal(r.peorPrecision_m, 8,
      'un levantamiento vale lo que su punto más flojo: promediar esconde justo el punto por el '
      + 'que se va a discutir un despeje');
  });

  test('sin precisión declarada no se inventa ninguna', () => {
    assert.equal(resumenDelLevantamiento([apoyo('WGS84', 'gps_mano', undefined)]).peorPrecision_m, null);
    assert.deepEqual(resumenDelLevantamiento([]).sistemas, []);
  });

  test('el .tsx no recalcula lo que ya tiene dueño', () => {
    assert.match(GPS, /resumenDelLevantamiento/);
    assert.ok(!/\.reduce<number \| null>/.test(GPS),
      'la peor precisión no es un `reduce` de pantalla: tiene dueño en `vistas/planta.ts`');
    assert.ok(!/filas\[0\]\?\.sistema/.test(GPS));
  });
});

describe('la pestaña está donde el Ingeniero la pidió', () => {
  const LINEA = leer('web/src/componentes/Linea.tsx');
  test('«Detalle GPS» va justo debajo de «Resumen»', () => {
    const iR = LINEA.indexOf("id: 'resumen'");
    const iG = LINEA.indexOf("id: 'gps'");
    const iD = LINEA.indexOf("id: 'distancias'");
    assert.ok(iR < iG && iG < iD, 'la pidió debajo de Resumen, y ahí es donde la va a buscar');
  });
  test('no es un segundo mapa: es el mismo componente con otra disposición', () => {
    assert.match(GPS, /panelALado/);
    assert.equal((GPS.match(/import\('\.\/Mapa'\)/g) ?? []).length, 1,
      'un segundo mapa sería un segundo sitio donde arreglar cada fallo');
  });
});
