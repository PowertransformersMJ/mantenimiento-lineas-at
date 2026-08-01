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
  { id: 'tiro', etiqueta: 'Tiro máximo', valor: 27.5, unidad: '%', umbral: 50,
    comparador: '<=', estado: 'cumple', criterio: 'tope adoptado', fuente: 'criterio de diseño' },
  { id: 'tierra', etiqueta: 'Puesta a tierra', valor: null, unidad: 'Ω', umbral: 10,
    comparador: '<=', estado: 'no_evaluable', criterio: 'sin medición', fuente: 'RETIE' },
];
const META = { generadoEn: '2026-08-01T09:00:00-05:00', generadoPor: 'pruebas' };

const base = (extra = {}) => ({
  linea: LINEA, conductor: CONDUCTOR, hipotesis: HIPOTESIS, lev: LEV,
  tramos: TRAMOS, vanos: VANOS, indicadores: INDICADORES,
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
