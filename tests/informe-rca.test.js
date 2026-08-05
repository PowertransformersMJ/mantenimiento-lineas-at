// ============================================================================
// tests/informe-rca.test.js — el informe del análisis, y sobre todo sus LÍMITES
// ----------------------------------------------------------------------------
// LO QUE ESTAS PRUEBAS VIGILAN no es que el documento «salga bien». Es que NO
// PUEDA salir sin decir lo que no sabe. Un análisis sin sus límites al lado
// invita exactamente a la conclusión que este sistema existe para impedir, y la
// sección que se escribe a mano es la que se olvida el día que corre prisa.
//
// Por eso la sección de límites se arma SOLA del dato, y por eso hay una prueba
// que la exige incluso en el análisis más vacío posible.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { informeRcaHtml } from '../exportar/informeRca.js';

/** El análisis más vacío que el sistema permite: recién abierto. */
const VACIO = {
  id: 'a-1', codigo: 'RCA-2026-08-05-0001', tipo: 'analisis_causa',
  titulo: 'Apertura de LN-999 sin causa identificada',
  estado: 'abierto', abiertoEn: '2026-08-05T02:00:00.000Z',
  alcance: { lineaIds: [], apoyoIds: [], investigacionIds: [], sinActivoIdentificado: 'aviso nocturno, cuadrilla en camino' },
  espinas: [], cadenas: [], arbol: [], hipotesis: [], ausencias: [], acciones: [], limitaciones: [],
  cerrado: false,
};

const html = (extra = {}) => informeRcaHtml({ analisis: { ...VACIO, ...extra.analisis }, ...extra });

describe('el documento se sostiene solo, y dice de qué está hecho', () => {
  test('es autocontenido: cero JavaScript y cero recursos externos', () => {
    const h = html();
    assert.doesNotMatch(h, /<script/i, 'un informe con JavaScript no se abre igual dentro de diez años');
    assert.doesNotMatch(h, /https?:\/\//, 'un recurso externo convierte el documento en una promesa');
    assert.match(h, /<style>/);
  });

  test('el índice se ARMA del cuerpo: no puede desincronizarse', () => {
    const h = html();
    for (const t of ['Alcance del análisis', 'Familias de causas', 'Causa raíz', 'Límites de este análisis']) {
      assert.ok((h.match(new RegExp(t, 'g')) ?? []).length >= 2, `«${t}» tiene que estar en el índice Y en el cuerpo`);
    }
  });

  test('un análisis SIN causa raíz se marca AVANCE en la portada, sin porcentajes', () => {
    const h = html();
    assert.match(h, /AVANCE — sin causa raíz declarada/);
    assert.doesNotMatch(h, /\d+\s*%\s*(completo|avance|progreso)/i, 'un porcentaje fabrica certeza');
    assert.doesNotMatch(h, /<progress/i, 'la barra de progreso está prohibida (ADR-020)');
  });

  test('con causa raíz declarada dice CONCLUSIÓN', () => {
    const h = html({ analisis: { causaRaiz: {
      nodoId: 'n1', enunciado: 'la especificación no exigía inhibidor',
      declaradaPor: 'uid', declaradaEn: '2026-08-05T10:00:00.000Z', condicionesNoCumplidas: [],
    } } });
    assert.match(h, /CONCLUSIÓN/);
    assert.doesNotMatch(h, /AVANCE — sin causa raíz/);
  });
});

describe('LA SECCIÓN DE LÍMITES es obligatoria y se arma sola', () => {
  test('el análisis MÁS VACÍO posible ya declara sus límites', () => {
    const h = html();
    assert.match(h, /Límites de este análisis/);
    assert.match(h, /NO tiene causa raíz declarada/);
    assert.match(h, /es un AVANCE, no una conclusión/i);
  });

  test('LOS RAYOS SE DECLARAN SIEMPRE, haya clima o no', () => {
    // Que no se pueda descartar un rayo es un RESULTADO del análisis. Una fila
    // ausente se leería como «descartado», y en una línea tropical el rayo es la
    // causa número uno.
    for (const caso of [{}, { sondeos: [SONDEO] }]) {
      const h = html(caso);
      assert.match(h, /Descargas atmosféricas: no hay dato/);
      assert.match(h, /no puede afirmar ni descartar/);
    }
  });

  test('las familias sin evaluar se declaran como NO MIRADAS, no como descartadas', () => {
    const h = html({ analisis: { espinas: [
      { espina: 'conductor', estado: 'no_evaluable', motivo: 'falta la ficha', evidenciaIds: [], datoQueFalta: 'carga de rotura' },
    ] } });
    assert.match(h, /familias no se pudieron evaluar/);
    assert.match(h, /No están descartadas: no se han podido mirar, que es distinto/);
  });

  test('las afirmaciones sin evidencia enlazada se cuentan y se dicen', () => {
    const h = html({ analisis: { espinas: [
      { espina: 'conductor', estado: 'descartada', motivo: 'las fotos no lo muestran', evidenciaIds: [] },
    ] } });
    assert.match(h, /no tienen evidencia enlazada/);
    assert.match(h, /lo que no son es comprobables/);
  });

  test('una causa raíz declarada CON condiciones sin cumplir lo lleva impreso', () => {
    // Es la defensa del informe: quien lo lea tiene que poder juzgar con qué se firmó.
    const h = html({ analisis: { causaRaiz: {
      nodoId: 'n1', enunciado: 'x', declaradaPor: 'uid', declaradaEn: '2026-08-05T10:00:00.000Z',
      condicionesNoCumplidas: ['Las once familias se recorrieron', 'Al menos una cadena llega a una regla'],
    } } });
    assert.match(h, /se declaró con 2 condición\(es\) sin cumplir/);
    assert.match(h, /es la defensa del informe/);
  });

  test('sin sondeo, la ausencia de clima NO se lee como descarte del clima', () => {
    const h = html();
    assert.match(h, /La ausencia de clima en este expediente no es un descarte del clima como causa/);
  });
});

const SONDEO = {
  id: 's1', consultadoEn: '2026-08-05T03:00:00.000Z',
  punto: { lat: 10.4, lon: -75.5, ocurrioEn: '2026-07-20T04:00:00.000Z' },
  desde: '2026-07-17T04:00:00.000Z', hasta: '2026-07-20T10:00:00.000Z',
  estacion: { codigo: '1', nombre: 'ESTACION SINTETICA', lat: 10.5, lon: -75.6, distancia_km: 42.3 },
  interpretacionHoraria: 'hora de Colombia',
  series: [{ variable: 'viento_velocidad', conjunto: 'sgfv-3yp8', unidad: 'm/s', n: 30, valores: [] }],
  fueraDeVentana: false,
  nota: 'Estación a 42.3 km del punto. Son observaciones DE ESA ESTACIÓN, no del vano.',
};

describe('el clima se imprime con sus límites, nunca como causa', () => {
  test('la nota del núcleo viaja al papel tal cual', () => {
    const h = html({ sondeos: [SONDEO] });
    assert.match(h, /Son observaciones DE ESA ESTACIÓN, no del vano/);
  });

  test('una estación LEJOS del punto se declara en los límites', () => {
    const h = html({ sondeos: [SONDEO] });
    assert.match(h, /a más de 20 km del punto/);
  });

  test('un evento posterior a lo publicado por IDEAM se declara', () => {
    const h = html({ sondeos: [{ ...SONDEO, fueraDeVentana: true }] });
    assert.match(h, /POSTERIOR al último dato/);
  });
});

describe('lo que el informe NO puede hacer, nunca', () => {
  // ⚠️ El orden de este fixture NO es casual. La primera escrita es la MENOS
  // verosímil y la segunda la MÁS: así, si alguien ordenase por verosimilitud,
  // el orden CAMBIARÍA y la prueba se pondría roja. Con dos hipótesis que
  // acaban en el mismo escalón —por ejemplo las dos topadas por clima— un
  // ordenamiento estable no movería nada y la prueba pasaría sin vigilar nada.
  const HIPOTESIS = [
    { id: 'h1', enunciado: 'primera escrita', espina: 'conductor', verosimilitud: 'baja',
      sustento: 'x', queLaRefutaria: 'y', evidenciaIds: ['e1'] },
    { id: 'h2', enunciado: 'segunda escrita', espina: 'conexiones_empalmes', verosimilitud: 'alta',
      sustento: 'hilos fundidos en la foto 4', queLaRefutaria: 'w', evidenciaIds: ['e2'] },
    { id: 'h3', enunciado: 'tercera escrita', espina: 'ambiente_clima', verosimilitud: 'alta',
      sustento: 'hubo viento', queLaRefutaria: 'z', evidenciaIds: ['e3'], sustentoSoloClimatico: true },
  ];

  test('NO ordena las hipótesis por verosimilitud: salen como se escribieron', () => {
    // Ordenar es dictaminar: la primera de una lista se lee como la buena.
    const h = html({ analisis: { hipotesis: HIPOTESIS } });
    assert.ok(h.indexOf('primera escrita') < h.indexOf('segunda escrita'),
      'se reordenaron las hipótesis, y eso es dictaminar');
    assert.ok(h.indexOf('segunda escrita') < h.indexOf('tercera escrita'),
      'se reordenaron las hipótesis, y eso es dictaminar');
  });

  test('la hipótesis con sustento SOLO climático sale topada, y se explica', () => {
    const h = html({ analisis: { hipotesis: HIPOTESIS } });
    assert.match(h, /topada\(s\) en «baja» por el motor/);
    assert.match(h, /hay viento fuerte muchas noches y las líneas no se caen/);
    // Y su verosimilitud impresa es la EFECTIVA, no la que alguien tecleó.
    // Se mira la CELDA, no el texto suelto: buscar «alta» a secas lo encuentra
    // dentro de «falta», que es como una prueba pasa a vigilar otra cosa.
    const fila = h.slice(h.indexOf('tercera escrita'), h.indexOf('tercera escrita') + 400);
    assert.match(fila, /<td>baja<\/td>/, 'no imprimió la verosimilitud EFECTIVA');
    assert.doesNotMatch(fila, /<td>alta<\/td>/, 'imprimió la verosimilitud que se tecleó, no la topada');
  });

  test('una barrera que falló y no tiene acción sale en los límites', () => {
    const h = html({ analisis: {
      arbol: [{ id: 'n1', padreId: null, nivel: 'efecto', enunciado: 'x', evidenciaIds: [],
        barrera: { cual: 'termografia', estado: 'no_aplicada', detalle: 'no se hizo' } }],
    } });
    assert.match(h, /siguen sin ninguna\s+acción/);
    assert.match(h, /termografia/);
  });

  test('una acción cerrada con solo una nota escrita se DISTINGUE de una con evidencia', () => {
    const h = html({ acciones: [
      { id: 'x1', clase: 'correctiva', que: 'cambiar el conector', estado: 'cerrada',
        barrera: 'termografia', cerradaPor: 'u', cerradaEn: '2026-08-05T10:00:00.000Z',
        comoSeComprobo: 'acta 118', evidenciaIds: [] },
    ] });
    assert.match(h, /solo nota escrita/);
    assert.match(h, /no es lo mismo que una fotografía del trabajo hecho/);
  });
});
