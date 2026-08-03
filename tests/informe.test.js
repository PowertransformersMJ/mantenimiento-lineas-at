// ============================================================================
// tests/informe.test.js — el documento que el Ingeniero firma
// ----------------------------------------------------------------------------
// QUÉ SE PRUEBA: `exportar/informe.js`, que compone un informe imprimible desde
// los datos del sistema (ADR-005: del dato al documento, jamás de la pantalla).
//
// LAS TRES COSAS QUE NO SE NEGOCIAN, y por eso son pruebas y no buenas
// intenciones:
//   1. AUTOCONTENIDO — cero JavaScript y cero recursos externos. Este archivo
//      tiene que abrirse dentro de diez años, en una máquina sin internet, y
//      enseñar exactamente lo mismo. Un <script> o una fuente remota lo rompen.
//   2. LA SECCIÓN DE LÍMITES SIEMPRE ESTÁ. Un informe que omite lo que no
//      demuestra parece más fuerte y es más frágil: la primera pregunta del
//      cliente apunta justo ahí.
//   3. TODO TEXTO DE DATOS VA ESCAPADO. Los nombres vienen de campo y traen de
//      todo; un `<` sin escapar deforma el documento en silencio.
//
// ⚠️ Estas pruebas las escribí yo (el integrador): el agente que construyó el
// módulo murió por un corte de conexión antes de escribirlas, así que llegó SIN
// VALIDAR. Datos 100 % sintéticos — el repositorio es público.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { informeHtml, limitacionesDeclaradas, TITULO_LIMITACIONES } from '../exportar/informe.js';

// ── Un expediente sintético mínimo pero completo ────────────────────────────

const LINEA = { codigo: 'DEMO-01', nombre: 'Línea de demostración', tensionNominal_kV: 66, circuitos: 1 };
const CONDUCTOR = {
  codigo: 'Generico', material: 'AAAC', calibre: '500 MCM', seccion_mm2: 280,
  diametro_m: 0.021, masaLineal_kg_m: 0.8, rts_kgf: 8000,
  moduloElastico_kg_mm2: 6300, dilatacion_1_C: 23e-6, procedencia: 'catalogo_fabricante',
};
const HIPOTESIS = {
  nombre: 'Hipótesis de demostración (SIN VALIDAR)', eds_pct: 20, tempEds_C: 28,
  tempMax_C: 75, tempMin_C: 22, vientoMax_kmh: 100, tempViento_C: 28,
  procedencia: 'supuesto', congelada: false, normaReferencia: 'RETIE (demo)',
};
const LEV = {
  puntos: [
    { n: 1, tipo: 'Estructura', nombre: 'P-01', nombreCampo: 'P01', lat: 4.6, lon: -74.08,
      latGMS: `4° 36' 00.00" N`, lonGMS: `74° 04' 48.00" W`, cota_m: 10, local: '2026-08-01 09:00:00',
      progresiva_m: 0, vanoAnterior_m: null, azimut_deg: null, deflexion_grados: null,
      funcionEstructural: 'Terminal', esAncla: true, precision_m: 8, metodo: 'gps_mano',
      sistemaReferencia: 'WGS84', distPuntoAnterior_m: null, indiceEstructura: 1, enVano: null },
    { n: 2, tipo: 'Estructura', nombre: 'P-02', nombreCampo: 'P02', lat: 4.602, lon: -74.082,
      latGMS: `4° 36' 07.20" N`, lonGMS: `74° 04' 55.20" W`, cota_m: 12, local: '2026-08-01 09:05:00',
      progresiva_m: 300, vanoAnterior_m: 300, azimut_deg: 225, deflexion_grados: 2,
      funcionEstructural: 'Terminal', esAncla: true, precision_m: 8, metodo: 'gps_mano',
      sistemaReferencia: 'WGS84', distPuntoAnterior_m: 300, indiceEstructura: 2, enVano: null },
  ],
  tramos: [{ n: 1, desde: 'P-01', hasta: 'P-02', longitud_m: 300, nVanos: 1, puntos: [] }],
  nEstructuras: 2, nEmpalmes: 0, longitud_m: 300,
};
const TRAMOS = [{
  n: 1, desde: 'P-01', hasta: 'P-02', nVanos: 1, vanoMax: 300, vir: 300,
  hEds: 1600, hTMax: 1200, hViento: 2200, hTMin: 1800, pctRts: 27.5, flechaMax: 7.5, excede: false,
}];
const VANOS = [{
  n: 1, tramo: 1, a_m: 300, relVir: 1, flechaEds_m: 5.6, flechaTMax_m: 7.5, flechaTMin_m: 5,
  longitudConductor_m: 300.6, parametroC_m: 2000, fueraDeRango: false,
}];
const INDICADORES = [
  // El `id` y `procedenciaUmbral` son los que emite de verdad `evaluarUmbrales`.
  // El informe DERIVA de aquí la frase del tope de tiro en vez de escribirla a
  // mano, así que un fixture con un id inventado ensayaría otra cosa.
  { id: 'tiro_maximo_pct_rts', etiqueta: 'Tiro máximo', valor: 27.5, unidad: '%', umbral: 50,
    procedenciaUmbral: 'criterio_clasico',
    comparador: '<=', estado: 'cumple', criterio: 'tope adoptado', fuente: 'criterio de diseño' },
  { id: 'tierra', etiqueta: 'Puesta a tierra', valor: null, unidad: 'Ω', umbral: 10,
    comparador: '<=', estado: 'no_evaluable', criterio: 'sin medición', fuente: 'RETIE' },
];
/**
 * Carga sobre las estructuras: un extremo sin carga, un apoyo que amplifica la
 * tensión y con capacidad declarada, y uno normal sin capacidad. Son los tres
 * casos que el informe tiene que saber contar de forma distinta.
 */
const CARGAS = [
  { n: 1, apoyo: 'P-01', funcionEstructural: 'Terminal', esExtremo: true, tramos_n: [1],
    deflexion_grados: null, factorAngulo: null, amplifica: null, nConductores: 3,
    vanoViento_m: 150, tiro_kgf: 2200, estadoTiro: 'Máximo viento',
    ftAngulo_kgf: null, ftViento_kgf: 60, ftTotal_kgf: null,
    utilizacion_pct: null, margen_kgf: null, estadoUtilizacion: 'no_evaluable',
    notas: [], noEvaluable: 'apoyo extremo: la deflexión no está definida.' },
  { n: 2, apoyo: 'P-02', funcionEstructural: 'Retención / anclaje', esExtremo: false, tramos_n: [1],
    deflexion_grados: 120, factorAngulo: 1.732, amplifica: true, nConductores: 3,
    vanoViento_m: 150, tiro_kgf: 2200, estadoTiro: 'Máximo viento',
    ftAngulo_kgf: 11431, ftViento_kgf: 60, ftTotal_kgf: 11491,
    utilizacion_pct: 62, margen_kgf: -2200, estadoUtilizacion: 'revisar',
    notas: [], noEvaluable: null },
  { n: 3, apoyo: 'P-03', funcionEstructural: 'Suspensión', esExtremo: false, tramos_n: [1],
    deflexion_grados: 2, factorAngulo: 0.035, amplifica: false, nConductores: 3,
    vanoViento_m: 150, tiro_kgf: 2200, estadoTiro: 'Máximo viento',
    ftAngulo_kgf: 231, ftViento_kgf: 60, ftTotal_kgf: 291,
    utilizacion_pct: null, margen_kgf: null, estadoUtilizacion: 'no_evaluable',
    notas: [], noEvaluable: null },
];

const META = { generadoEn: '2026-08-01T09:00:00-05:00', generadoPor: 'pruebas' };

const base = (extra = {}) => ({
  linea: LINEA, conductor: CONDUCTOR, hipotesis: HIPOTESIS, lev: LEV,
  tramos: TRAMOS, vanos: VANOS, indicadores: INDICADORES, cargas: CARGAS,
  cantidades: null, investigaciones: [], meta: META, ...extra,
});

/** Quita comentarios HTML antes de buscar rastros de recursos externos. */
const sinComentarios = (h) => h.replace(/<!--[\s\S]*?-->/g, '');

// ════════════════════════════════════════════════════════════════════════════
describe('informe — documento bien formado y autocontenido', () => {

  test('es un documento HTML completo', () => {
    const h = informeHtml(base());
    assert.ok(/^\s*<!DOCTYPE html>/i.test(h), 'empieza por el doctype');
    assert.ok(/<html[^>]*lang=["']es["']/i.test(h), 'declara el idioma español');
    assert.ok(/<meta[^>]+charset=["']?utf-8/i.test(h), 'declara la codificación');
    assert.ok(h.trimEnd().endsWith('</html>'), 'y cierra');
  });

  test('las etiquetas de bloque abren y cierran en el mismo número', () => {
    const h = informeHtml(base());
    for (const t of ['html', 'head', 'body', 'style', 'table', 'thead', 'tbody', 'section']) {
      const abren = (h.match(new RegExp(`<${t}[\\s>]`, 'gi')) ?? []).length;
      const cierran = (h.match(new RegExp(`</${t}>`, 'gi')) ?? []).length;
      assert.equal(abren, cierran, `<${t}> abre ${abren} y cierra ${cierran}`);
    }
  });

  test('CERO JavaScript: un informe no ejecuta nada', () => {
    const h = informeHtml(base());
    assert.ok(!/<script/i.test(h), 'sin etiqueta script');
    assert.ok(!/\son\w+\s*=/i.test(h), 'sin manejadores en línea (onclick y compañía)');
    assert.ok(!/javascript:/i.test(h), 'sin enlaces javascript:');
  });

  test('CERO recursos externos: debe abrirse sin internet dentro de diez años', () => {
    const h = sinComentarios(informeHtml(base()));
    assert.ok(!/https?:\/\//i.test(h), 'sin URLs http(s)');
    assert.ok(!/<link[^>]+rel=["']?stylesheet/i.test(h), 'sin hoja de estilo enlazada');
    assert.ok(!/@import/i.test(h), 'sin @import en el CSS');
    assert.ok(!/<img[^>]+src=["']https?:/i.test(h), 'sin imágenes remotas');
  });

  test('el CSS está pensado para PAPEL, no para el tema oscuro de la app', () => {
    const h = informeHtml(base());
    assert.ok(/<style/i.test(h), 'lleva su CSS embebido');
    assert.ok(/@page|break-inside\s*:\s*avoid/i.test(h), 'controla la paginación');
    assert.ok(!/var\(--/.test(h), 'no arrastra las variables del tema de la aplicación');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('informe — lo que NO puede faltar', () => {

  test('la sección de límites existe SIEMPRE, incluso sin limitaciones que declarar', () => {
    const h = informeHtml(base());
    assert.ok(h.includes(TITULO_LIMITACIONES) || /no demuestra/i.test(h),
      'aparece la sección de lo que el informe no demuestra');
  });

  test('y sigue estando con el expediente más pobre posible', () => {
    const h = informeHtml({
      linea: { codigo: 'X' }, conductor: null, hipotesis: null, lev: null,
      tramos: [], vanos: [], indicadores: [], cantidades: null, investigaciones: [], meta: {},
    });
    assert.ok(h.includes(TITULO_LIMITACIONES) || /no demuestra/i.test(h));
    assert.ok(!/undefined|NaN|\[object Object\]/.test(h), 'y sin basura por los huecos');
  });

  test('lo que no se pudo evaluar viaja al informe, no se calla', () => {
    const h = informeHtml(base());
    assert.ok(/no evaluable|no_evaluable|sin medición/i.test(h),
      'el indicador sin medición aparece declarado');
  });

  test('la portada lleva la procedencia: motor, hipótesis y fecha', () => {
    const h = informeHtml(base());
    assert.ok(/lineas\/exportar|exportador/i.test(h), 'versión del exportador');
    assert.ok(h.includes(HIPOTESIS.nombre), 'nombre de las hipótesis');
    assert.ok(h.includes('DEMO-01'), 'código de la línea');
  });

  test('limitacionesDeclaradas señala los huecos reales del expediente', () => {
    const lista = limitacionesDeclaradas(base());
    assert.ok(Array.isArray(lista) && lista.length > 0,
      'con hipótesis sin validar y un indicador no evaluable, hay límites que declarar');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('informe — la carga sobre las estructuras', () => {
  const html = informeHtml(base());

  test('la sección existe, está en el índice y va entre los vanos y los umbrales', () => {
    assert.match(html, /Carga sobre las estructuras/);
    // El índice de la portada se ARMA del cuerpo: si la sección no saliera en
    // los dos sitios, el documento tendría un índice que miente.
    const enIndice = (html.match(/Carga sobre las estructuras/g) ?? []).length;
    assert.ok(enIndice >= 2, 'tiene que aparecer en el índice y en el cuerpo');
    assert.ok(html.indexOf('Detalle vano a vano') < html.indexOf('Carga sobre las estructuras'));
    assert.ok(html.indexOf('Carga sobre las estructuras') < html.indexOf('Umbrales y criterios'));
  });

  test('el hallazgo va en PROSA antes de la tabla, con el nombre del apoyo', () => {
    // Quien hojea el informe en una reunión no va a ordenar una columna de
    // veinticuatro filas para encontrar el apoyo comprometido.
    assert.match(html, /reciben MÁS carga transversal que la propia tensión/);
    assert.match(html, /P-02/);
    assert.match(html, /carga permanente, no depende del viento/);
  });

  test('con capacidad declarada dice cuántos tienen veredicto y cuántos piden revisión', () => {
    assert.match(html, /1 de 3 apoyos<\/b> tienen capacidad declarada/);
    assert.match(html, /1 pide\(n\) revisión/);
  });

  test('sin ninguna capacidad declarada, lo dice y NO estima', () => {
    const sinCapacidad = CARGAS.map((c) => ({ ...c, utilizacion_pct: null, margen_kgf: null,
      estadoUtilizacion: 'no_evaluable' }));
    const h = informeHtml(base({ cargas: sinCapacidad }));
    assert.match(h, /Ningún apoyo declara su capacidad/);
    assert.match(h, /informe firmado sobre una suposición/);
    assert.doesNotMatch(h, /todos cumplen/);
  });

  test('sin la tabla de cargas, el informe lo declara en vez de callarlo', () => {
    const h = informeHtml(base({ cargas: [] }));
    assert.match(h, /No evaluable:<\/b> no llegó la carga sobre las estructuras/);
    // Y la limitación sube a la sección final, que es la que se lee al firmar.
    const lim = limitacionesDeclaradas(base({ cargas: [] }));
    assert.ok(lim.some((l) => /No se evaluó la carga sobre las estructuras/.test(l.titulo)));
  });

  test('las limitaciones nombran los apoyos sin capacidad, los extremos y el eje que falta', () => {
    const lim = limitacionesDeclaradas(base());
    const titulos = lim.map((l) => l.titulo).join(' | ');
    // P-03 es el único con carga calculada y sin capacidad: P-01 no tiene carga
    // (es extremo) y P-02 sí declara la suya.
    assert.match(titulos, /1 apoyo\(s\) tienen su carga calculada pero NO su capacidad declarada/);
    assert.match(titulos, /El apoyo extremo no está verificado/);
    assert.match(titulos, /Solo se evaluó la carga TRANSVERSAL/);

    const transversal = lim.find((l) => /Solo se evaluó la carga TRANSVERSAL/.test(l.titulo));
    assert.match(transversal.detalle, /vano peso/);
    assert.match(transversal.detalle, /longitudinal/);
    assert.equal(transversal.origen, 'carga sobre las estructuras');
  });

  test('un apoyo que pide revisión sale marcado en la fila, no solo en el texto', () => {
    assert.match(html, /<tr class="revisar">[\s\S]*?P-02/);
  });
});

describe('informe — los huecos NO se convierten en aprobados', () => {
  test('un vano SIN veredicto no se cuenta como «dentro de la banda»', () => {
    // `fueraDeRango` es de TRES estados: null cuando no hay VIR con el que
    // comparar. Contar solo los `true` y cerrar con «todos dentro» convierte el
    // hueco en un aprobado, en el documento que se firma — y contradice al CSV
    // del mismo exporte, que en esa fila escribe «no evaluable».
    const h = informeHtml(base({ vanos: [{ ...VANOS[0], fueraDeRango: null, relVir: null }] }));
    assert.doesNotMatch(h, /Todos los vanos quedan dentro de la banda/);
    assert.match(h, /NO tienen veredicto/);
    const lim = limitacionesDeclaradas(base({ vanos: [{ ...VANOS[0], fueraDeRango: null, relVir: null }] }));
    assert.ok(lim.some((l) => /sin veredicto sobre la banda del VIR/.test(l.titulo)),
      'y sube a la sección final, que es la que se lee al firmar');
  });

  test('con todos los vanos evaluados y dentro, sí se puede afirmar', () => {
    const h = informeHtml(base());
    assert.match(h, /Todos los vanos quedan dentro de la banda/);
  });

  test('los motivos del eje longitudinal llegan al papel, agrupados', () => {
    // Se perdían: la tabla pinta nueve columnas y ninguna es el motivo, así que
    // el aviso del piso de validez no salía del CSV.
    const conNota = CARGAS.map((c, i) => (i === 1
      ? { ...c, notas: ['En «Máxima temperatura» el tramo que llega baja a 8,3 % de su propio EDS.'] }
      : c));
    const h = informeHtml(base({ longitudinal: conNota }));
    assert.match(h, /supuso o no pudo resolver/);
    assert.match(h, /8,3 % de su propio EDS/);
    assert.match(h, /Sin carga calculada:/, 'y distingue el motivo del supuesto');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Los hallazgos de la auditoría de la ola 4 (§ADR-013) que vivían en este
// archivo. Ninguno rompía la suite: los 564 tests estaban en verde con los seis
// dentro. Por eso cada uno deja aquí su prueba — un informe que se puede firmar
// no se defiende con que «no falla nada», se defiende con que lo que afirma es
// comprobable (L-33).
// ════════════════════════════════════════════════════════════════════════════
describe('informe — lo que la auditoría encontró y no puede volver', () => {

  test('#4 · la carga se puede reproducir con una calculadora: tiro y nº de conductores a la vista', () => {
    // El informe publicaba Quiebre/Viento/Total ya multiplicados por los tres
    // conductores JUNTO a la fórmula que dice «por conductor», sin decir por
    // cuántos. Quien lo revisara con una calculadora obtenía un tercio.
    const h = informeHtml(base());
    assert.match(h, /<th class="num">Tiro \(kgf\)<\/th>/, 'la columna del tiro tiene que existir');
    assert.match(h, /<th class="num">Cond\.<\/th>/, 'y la del número de conductores');
    assert.match(h, /Quiebre = Factor × Tiro × Cond/,
      'y la leyenda tiene que decir cómo se reproduce la cifra');
    assert.match(h, /son los de TODOS los conductores del apoyo/);
  });

  test('#4 · la nota de los cables de guarda llega al papel firmado', () => {
    // El núcleo la escribe, la pantalla la muestra y el CSV la lleva; el informe
    // la tiraba. Y la cifra impresa va CORTA precisamente por eso.
    const conGuarda = CARGAS.map((c) => ({ ...c,
      notas: ['Se cuentan 3 conductores (3 fases × 1 circuito(s)). Los cables de guarda NO están contados.'] }));
    const h = informeHtml(base({ cargas: conGuarda }));
    assert.match(h, /cables de guarda NO están contados/);
    assert.match(h, /supuso o no pudo resolver/, 'agrupadas bajo su propia tabla');
  });

  test('#11 · el semáforo de utilización NO se imprime sin decir contra qué', () => {
    // «Cada criterio declara SU FUENTE. Un semáforo sin fuente es una opinión
    // con colores», dice la sección 8 de este mismo documento.
    const h = informeHtml(base());
    assert.match(h, /CRITERIO ADOPTADO \(sin norma citada\)/,
      'el texto del criterio viene del núcleo y tiene que estar impreso');
    assert.match(h, /50 % adoptado/, 'y el umbral contra el que se compara');
    assert.match(h, /La rotura NUNCA se estima/, 'con las palabras del núcleo, no reescritas');
  });

  test('#9 · el tope de tiro NO se atribuye a una hipótesis que no lo declara', () => {
    // La bandera `excede` sale de `0,5 · RTS` fijo en el motor. El informe decía
    // «el tope adoptado en la hipótesis» mientras su propia tabla de umbrales,
    // dos páginas después, decía que la hipótesis no lo declara.
    const h = informeHtml(base());
    assert.doesNotMatch(h, /tope adoptado en la hipótesis/,
      'esa frase inventa una decisión versionada donde solo hay una costumbre');
    assert.match(h, /criterio clásico sin norma citada: la hipótesis no lo declara/);
  });

  test('#9 · y cuando la hipótesis SÍ lo declara, el informe lo dice así', () => {
    const declarado = INDICADORES.map((i) => (i.id === 'tiro_maximo_pct_rts'
      ? { ...i, umbral: 25, procedenciaUmbral: 'hipotesis_declarada' }
      : i));
    const h = informeHtml(base({ indicadores: declarado }));
    assert.match(h, /tope de tiro declarado en la hipótesis de la línea \(25 % de la carga de rotura\)/);
  });

  test('#9 · el tope sale del indicador del núcleo, no de un 50 escrito a mano', () => {
    const otro = INDICADORES.map((i) => (i.id === 'tiro_maximo_pct_rts'
      ? { ...i, umbral: 25, procedenciaUmbral: 'criterio_clasico' }
      : i));
    const h = informeHtml(base({ indicadores: otro }));
    assert.match(h, /25 % de la carga de rotura/);
    assert.doesNotMatch(h, /Ningún tramo supera el tope de tiro adoptado por defecto \(50 %/);
  });

  test('#16 · con sección longitudinal, los límites NO la enumeran entre lo no evaluado', () => {
    // Al añadir la sección longitudinal se bifurcó el TÍTULO del límite y el
    // cuerpo se quedó igual, diciendo que ese eje no se evalúa — en la misma
    // página en que ya venía publicado.
    const lim = limitacionesDeclaradas(base({ longitudinal: CARGAS }));
    const vertical = lim.find((l) => /carga VERTICAL/.test(l.titulo));
    assert.ok(vertical, 'el límite de la carga vertical tiene que seguir estando');
    assert.match(vertical.detalle, /La LONGITUDINAL sí se calculó y se publica en la sección 7/);
    assert.match(vertical.detalle, /sin veredicto/);

    const extremo = lim.find((l) => /apoyo extremo/i.test(l.titulo));
    assert.match(extremo.detalle, /sección 7/,
      'el límite de los extremos tampoco puede decir que ese eje «está pendiente»');
    assert.doesNotMatch(extremo.detalle, /su verificación es otra y está pendiente/);
  });

  test('#16 · y SIN sección longitudinal el texto vuelve a ser el correcto', () => {
    const lim = limitacionesDeclaradas(base({ longitudinal: [] }));
    const transversal = lim.find((l) => /Solo se evaluó la carga TRANSVERSAL/.test(l.titulo));
    assert.ok(transversal);
    assert.match(transversal.detalle, /Son otros ejes y no se suman a estas cifras/);
    assert.doesNotMatch(transversal.detalle, /sí se calculó/);
  });

  test('#20 · una longitud de línea que no llegó se imprime como HUECO, no como 0,00 m', () => {
    // El propio informe defiende en cada tabla que «el guion (—) no es un cero»,
    // y aquí fabricaba uno: salía «0,00 m de línea» en la portada y «Longitud de
    // línea (eje): 0,00 m» en el resumen, con «Vano medio: —» al lado.
    const h = informeHtml(base({ lev: { ...LEV, longitud_m: undefined } }));
    assert.doesNotMatch(h, /0\.00 m de línea/, 'la portada no puede inventar una línea de cero metros');
    assert.doesNotMatch(h, /Longitud de línea \(eje\)<\/td><td class="num">0,00 m/);
    assert.match(h, /longitud no declarada/, 'se dice que falta, con esas palabras');
    assert.match(h, /Longitud de línea \(eje\)<\/td><td class="num">—/,
      'y en el resumen sale el guion, que es lo que este informe defiende en cada tabla');
  });

  test('#20 · y con la longitud declarada se imprime el número, como siempre', () => {
    const h = informeHtml(base());
    assert.match(h, /300\.00 m de línea/);
    assert.doesNotMatch(h, /longitud no declarada/);
  });
});

describe('informe — el texto de los datos va escapado', () => {

  test('un nombre con < > & " no deforma el documento', () => {
    // Se prueban campos que el informe SÍ imprime: la línea, las hipótesis y
    // los extremos de cada tramo. (El informe no lista punto por punto — eso lo
    // hace el registro fotográfico, que llega con la captura de campo.)
    const h = informeHtml(base({
      linea: { ...LINEA, codigo: 'DEMO<1>', nombre: 'Línea & <b>rara</b>' },
      hipotesis: { ...HIPOTESIS, nombre: 'H <script>alert(1)</script>' },
      tramos: [{ ...TRAMOS[0], desde: 'A<1>', hasta: 'B&2' }],
    }));
    assert.ok(!/<script/i.test(h), 'el intento de inyección no sobrevive');
    assert.ok(!h.includes('<b>rara</b>'), 'el marcado crudo no pasa');
    assert.ok(h.includes('DEMO&lt;1&gt;'), 'el código de la línea va escapado');
    assert.ok(h.includes('Línea &amp; &lt;b&gt;rara&lt;/b&gt;'), 'y su nombre también');
    assert.ok(h.includes('A&lt;1&gt;') && h.includes('B&amp;2'), 'los tramos también');
  });

  test('el expediente de falla se incluye cuando existe, también escapado', () => {
    const h = informeHtml(base({
      investigaciones: [{
        id: 'i1', apoyoId: 'a1', ocurrioEn: '2026-07-22T00:00:00-05:00',
        fechaTexto: '22 de julio', componenteAfectado: 'Conector <atornillado>',
        cronologia: [{ cuando: 'día 1', que: 'se registró' }],
        observaciones: [{ titulo: 'Obs', detalle: 'detalle', severidad: 'critica' }],
        hipotesis: [{ enunciado: 'Causa probable', verosimilitud: 'alta', sustento: 'porque sí' }],
        verificacionesPendientes: [{ que: 'Oscilografía', porQue: 'define el tipo de falla', estado: 'pendiente' }],
        cerrada: false,
      }],
    }));
    assert.ok(/Causa probable/.test(h), 'la hipótesis causal llega al informe');
    assert.ok(/Oscilograf/.test(h), 'y las verificaciones pendientes también');
    assert.ok(!h.includes('<atornillado>'), 'el texto del componente va escapado');
  });
});
