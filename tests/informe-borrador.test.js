// ============================================================================
// tests/informe-borrador.test.js — el BORRADOR NO FIRMABLE, y la promesa de que
// el informe de una línea COMPLETA no cambió ni un carácter
// ----------------------------------------------------------------------------
// QUÉ SE PRUEBA: `informeBorradorHtml` de `exportar/informe.js`, el papel que
// sale de una línea que todavía no tiene torres (LN-617 y LN-628 entraron así,
// orden del Ingeniero del 2026-09-17), y la NO regresión de `informeHtml`.
//
// LAS CINCO COSAS QUE ESTE ARCHIVO DEFIENDE:
//
//   1. EL INFORME COMPLETO NO CAMBIA. Se compara la HUELLA (SHA-256) del
//      documento de una línea completa contra la que salía ANTES de que este
//      borrador existiera. No «se parece»: es el mismo byte a byte. Si alguien
//      toca `ESTILO`, un texto o una tabla del informe firmable, esta prueba se
//      pone roja antes de que el cambio llegue a un papel firmado.
//   2. EL BORRADOR SE DECLARA BORRADOR, en los tres sitios donde se mira antes
//      de firmar: la portada, el bloque de firma y el pie de cada copia.
//   3. LA LONGITUD NO MIENTE. Lo levantado con el GPS es un TRAMO COMPARTIDO y
//      no la longitud de la línea, y el papel lo dice con esas palabras. De ese
//      número cuelgan después las pérdidas y la memoria de cantidades: darlo
//      por bueno es el error caro de este borrador.
//   4. LA FIRMA ESTÁ BLOQUEADA Y DICE QUÉ FALTA, nombrando a la línea vecina:
//      las torres son las MISMAS, y mientras la vecina no traiga conductor e
//      hipótesis el veredicto de esas torres no se puede cerrar.
//   5. NO SE COPIA NADA DE OTRA LÍNEA. Ni conductor, ni hipótesis, ni longitud.
//
// Datos 100 % SINTÉTICOS: el repositorio es público. Ni una coordenada, ni un
// nombre de subestación ni de bahía. Los códigos de línea y de tramo sí valen.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  informeHtml, informeBorradorHtml, bloqueoDeFirma, limitesDelBorrador,
  rotuloDeSerie, fraseDeLongitudLevantada, TITULO_BORRADOR, n,
} from '../exportar/informe.js';

// ── Fixture A · una línea COMPLETA, la que NO puede cambiar ─────────────────
//
// Es el papel de siempre: conductor, hipótesis, torres con función declarada,
// tramos, vanos, cargas y umbrales. Si el borrador rozara una sola pieza común
// (`ESTILO`, `portada`, `tabla`, un literal), la huella de abajo cambiaría.

const LINEA_COMPLETA = {
  codigo: 'LN-627', nombre: 'Línea sintética de prueba', tensionNominal_kV: 66, circuitos: 1,
};
const CONDUCTOR_COMPLETO = {
  codigo: 'SINTETICO-1', material: 'AAAC', calibre: '477 MCM', seccion_mm2: 242,
  diametro_m: 0.0201, masaLineal_kg_m: 0.67, rts_kgf: 7300,
  moduloElastico_kg_mm2: 6300, dilatacion_1_C: 23e-6, procedencia: 'catalogo_fabricante',
  fuente: 'ficha sintética de prueba',
};
const HIPOTESIS_COMPLETA = {
  nombre: 'Hipótesis sintética', eds_pct: 20, tempEds_C: 28, tempMax_C: 75, tempMin_C: 22,
  vientoMax_kmh: 100, tempViento_C: 28, procedencia: 'supuesto', congelada: true,
  normaReferencia: 'criterio adoptado (prueba)',
};
const punto = (i, nombre, prog, vano) => ({
  n: i, tipo: 'Estructura', nombre, nombreCampo: nombre, lat: 10.4 + i * 0.002, lon: -75.5 - i * 0.002,
  latGMS: `10° 24' 0${i}.00" N`, lonGMS: `75° 30' 0${i}.00" W`, cota_m: 10 + i,
  local: `2026-08-09 09:0${i}:00`, progresiva_m: prog, vanoAnterior_m: vano,
  azimut_deg: 225, deflexion_grados: i === 1 ? null : 3,
  funcionEstructural: i === 1 || i === 3 ? 'Retención / anclaje' : 'Suspensión',
  esAncla: i === 1 || i === 3, precision_m: 8, metodo: 'gps_mano', sistemaReferencia: 'WGS84',
  distPuntoAnterior_m: vano, indiceEstructura: i, enVano: null,
});
const LEV_COMPLETO = {
  puntos: [punto(1, 'E01', 0, null), punto(2, 'E02', 310, 310), punto(3, 'E03', 640, 330)],
  tramos: [{ n: 1, desde: 'E01', hasta: 'E03', longitud_m: 640, nVanos: 2, puntos: [] }],
  nEstructuras: 3, nEmpalmes: 0, longitud_m: 640,
};
const TRAMOS_COMPLETOS = [{
  n: 1, desde: 'E01', hasta: 'E03', nVanos: 2, vanoMax: 330, vir: 320,
  hEds: 1460, hTMax: 1100, hViento: 2100, hTMin: 1700, pctRts: 28.8, flechaMax: 8.1, excede: false,
}];
const VANOS_COMPLETOS = [
  { n: 1, tramo: 1, a_m: 310, relVir: 0.97, flechaEds_m: 5.4, flechaTMax_m: 7.2, flechaTMin_m: 4.8,
    longitudConductor_m: 310.6, parametroC_m: 2180, fueraDeRango: false },
  { n: 2, tramo: 1, a_m: 330, relVir: 1.03, flechaEds_m: 6.1, flechaTMax_m: 8.1, flechaTMin_m: 5.4,
    longitudConductor_m: 330.7, parametroC_m: 2180, fueraDeRango: false },
];
const INDICADORES_COMPLETOS = [
  { id: 'tiro_maximo_pct_rts', etiqueta: 'Tiro máximo', valor: 28.8, unidad: '%', umbral: 50,
    procedenciaUmbral: 'criterio_clasico', comparador: '<=', estado: 'cumple',
    criterio: 'tope adoptado', fuente: 'criterio de diseño' },
  { id: 'tierra', etiqueta: 'Puesta a tierra', valor: null, unidad: 'Ω', umbral: 10,
    comparador: '<=', estado: 'no_evaluable', criterio: 'sin medición', fuente: 'RETIE' },
];
const CARGAS_COMPLETAS = [
  { n: 1, apoyo: 'E01', funcionEstructural: 'Retención / anclaje', esExtremo: true, tramos_n: [1],
    deflexion_grados: null, factorAngulo: null, amplifica: null, nConductores: 3,
    vanoViento_m: 155, tiro_kgf: 2100, estadoTiro: 'Máximo viento',
    ftAngulo_kgf: null, ftViento_kgf: 58, ftTotal_kgf: null,
    utilizacion_pct: null, margen_kgf: null, estadoUtilizacion: 'no_evaluable',
    notas: [], noEvaluable: 'apoyo extremo: la deflexión no está definida.' },
  { n: 2, apoyo: 'E02', funcionEstructural: 'Suspensión', esExtremo: false, tramos_n: [1],
    deflexion_grados: 3, factorAngulo: 0.052, amplifica: false, nConductores: 3,
    vanoViento_m: 320, tiro_kgf: 2100, estadoTiro: 'Máximo viento',
    ftAngulo_kgf: 328, ftViento_kgf: 120, ftTotal_kgf: 448,
    utilizacion_pct: null, margen_kgf: null, estadoUtilizacion: 'no_evaluable',
    notas: [], noEvaluable: null },
];
const EXPEDIENTE_COMPLETO = {
  linea: LINEA_COMPLETA, conductor: CONDUCTOR_COMPLETO, hipotesis: HIPOTESIS_COMPLETA,
  lev: LEV_COMPLETO, tramos: TRAMOS_COMPLETOS, vanos: VANOS_COMPLETOS,
  indicadores: INDICADORES_COMPLETOS, cargas: CARGAS_COMPLETAS, longitudinal: [],
  cantidades: null, investigaciones: [],
  meta: {
    generadoEn: '2026-09-17T09:00:00-05:00', generadoPor: 'pruebas',
    versionNucleo: '0.0.0-prueba', hipotesisNombre: 'Hipótesis sintética',
  },
};

/**
 * LA HUELLA DEL «ANTES». Se tomó con este mismo expediente contra la versión de
 * `exportar/informe.js` ANTERIOR a que existiera `informeBorradorHtml`, el
 * 2026-09-17. No es un número mágico: es la promesa de que el papel de LN-627
 * sigue saliendo idéntico, y el sitio donde se rompe si deja de serlo.
 *
 * ⚠️ Si esta prueba se pone roja, la pregunta NO es «¿actualizo la huella?».
 * Es: ¿qué cambió del informe que se firma, y quién lo autorizó?
 */
const HUELLA_ANTES = '0623bfb5452567aad0401e1371589feba151814d24b19c54ab5b074c6f5a747b';
const CARACTERES_ANTES = 23158;

const huella = (texto) => createHash('sha256').update(texto, 'utf8').digest('hex');

// ── Fixture B · LN-617, sin torres, sin conductor y sin hipótesis ───────────
//
// La línea tal como entró al parque: de ella solo hay el recorrido levantado
// el 09-08 y lo que el sistema de operación lleva meses grabando. Las torres
// son del TRAMO COMPARTIDO y las comparte con LN-628.

const NOMBRES_LEVANTADOS = (() => {
  // 28 puntos entre E07 y E36: faltan dos placas por el medio, que es justo lo
  // que hace que la suma de vanos NO sea la longitud de la línea.
  const saltados = new Set([20, 29]);
  const r = [];
  for (let k = 7; k <= 36 && r.length < 28; k++) {
    if (!saltados.has(k)) r.push(`E${String(k).padStart(2, '0')}`);
  }
  return r;
})();

const puntoLevantado = (i, nombre) => ({
  nombre,
  hora: `${String(7 + Math.floor(i / 10)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}:00`,
  cota_m: 12 + i * 1.5,
  vanoSiguiente_m: i === NOMBRES_LEVANTADOS.length - 1 ? null : 110 + ((i * 13) % 40),
  deflexion_grados: i === 0 ? null : (i % 5) * 2.4,
  margenDeflexion_grados: 1.2,
});

const RECORRIDO_617 = {
  codigoSerie: 'TR-618',
  rotulo: 'levantado el 09-08-2026 · sin registrar como torres',
  fecha: '09-08-2026',
  aparato: 'GPS de mano',
  desde: 'E07', hasta: 'E36',
  nPuntos: 28, nVanos: 27, longitud_m: 3183.04,
  vanoMax_m: 238.6, vanoMin_m: 24.1, vanoMedio_m: 117.9, medianaVano_m: 118.4,
  precision_m: 8, datum: 'WGS84', metodo: 'GPS de mano',
  circuitosPorTorre: 2,
  puntos: NOMBRES_LEVANTADOS.map((nombre, i) => puntoLevantado(i, nombre)),
  sospechosos: [{
    vano: 'E19 → E21', longitud_m: 238.6, veces: 2.02,
    motivo: '2,02 veces la mediana (118,4 m). Salta la placa E20: posible torre sin levantar.',
  }],
};

const ELECTRICOS_617 = {
  fuente: 'el sistema de operación de la línea',
  desde: '01-01-2026', hasta: '31-08-2026',
  archivos: 'archivo máximo, mínimo, promedio e instantáneo',
  nSenales: 8,
  pico: { valor_A: 412.7, fase: 'S', fecha: '12-02-2026', hora: 19 },
  dias: [
    { estadistico: 'Máximo', conArchivo: 198, sinArchivo: '03 a 12-01 · mayo entero · 12-08',
      sinCorriente: '31-05 (solo Q)' },
    { estadistico: 'Mínimo', conArchivo: 186, sinArchivo: 'empieza el 13-01', sinCorriente: null },
  ],
  senales: [
    { senal: 'I R', unidad: 'A', horas: 4512, ceros: 6, decimales: 1,
      bajo: { valor: 0, fecha: '18-03-2026', hora: 3 }, mediana: 131.4,
      alto: { valor: 402.1, fecha: '12-02-2026', hora: 19 } },
    { senal: 'U RS', unidad: 'kV', horas: 4498, ceros: 2, decimales: 2,
      bajo: { valor: 0, fecha: '18-03-2026', hora: 3 }, mediana: 65.8,
      alto: { valor: 68.2, fecha: '04-07-2026', hora: 2 } },
  ],
  aRevisar: {
    horas: 15,
    regla: 'Se marca la hora cuyo máximo de corriente pasa del doble de su mínimo. Es la misma '
      + 'regla de la pestaña Parámetros eléctricos.',
  },
  avisos: ['<b>Días sin archivo: no es solo mayo.</b> Al archivo máximo le faltan 45 días.'],
};

const CALIDAD_617 = [
  { severidad: 'atencion', titulo: 'Vano E19 → E21 de 238,6 m',
    detalle: '2,02 veces la mediana de los vanos levantados. Un vano falso falsea flecha, viento y '
      + 'el tramo de tensión entero.' },
  { severidad: 'aviso', titulo: 'Faltan las placas E01–E06',
    detalle: 'El levantamiento empieza en E07. Si esas torres existen, la línea es más larga que '
      + 'lo levantado.' },
];

const borrador617 = (extra = {}) => ({
  linea: { codigo: 'LN-617', nombre: 'Línea sintética 617', tensionNominal_kV: 66 },
  faltan: ['torres', 'conductor', 'hipotesis'],
  vecinas: [{ codigo: 'LN-628', faltan: ['torres', 'conductor', 'hipotesis'] }],
  recorrido: RECORRIDO_617,
  calidad: CALIDAD_617,
  electricos: ELECTRICOS_617,
  meta: { generadoEn: '2026-09-17T09:00:00-05:00', versionNucleo: '0.0.0-prueba' },
  ...extra,
});

/** Quita comentarios HTML antes de buscar rastros de recursos externos. */
const sinComentarios = (h) => h.replace(/<!--[\s\S]*?-->/g, '');
/** El texto que de verdad se lee en el papel, sin marcas. */
const soloTexto = (h) => h
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ');

// ════════════════════════════════════════════════════════════════════════════
describe('el informe de una línea COMPLETA no cambia ni un carácter', () => {

  // Antes de acusar al borrador: si el Node de turno no trae el formateador de
  // español, TODAS las cifras del documento salen distintas y la huella falla
  // por una razón que no tiene nada que ver con este cambio. Se comprueba
  // primero para que el mensaje diga la verdad.
  test('el formateador de cifras es el de siempre (es-CO, coma decimal)', () => {
    assert.equal(n(1234.5, 2), '1.234,50',
      'este Node no formatea en es-CO: la huella de abajo no significaría nada');
    assert.equal(n(3183.04, 0), '3.183');
  });

  test('la huella del documento es la misma que antes de que existiera el borrador', () => {
    const h = informeHtml(EXPEDIENTE_COMPLETO);
    assert.equal(h.length, CARACTERES_ANTES,
      'el informe firmable cambió de tamaño: algo suyo se tocó');
    assert.equal(huella(h), HUELLA_ANTES,
      'el informe firmable cambió. La pregunta no es si actualizar la huella, '
      + 'sino qué cambió del papel que se firma y quién lo autorizó');
  });

  test('y no se contagió de nada del borrador', () => {
    const h = informeHtml(EXPEDIENTE_COMPLETO);
    assert.ok(!h.includes('BORRADOR'), 'el informe completo no se declara borrador');
    assert.ok(!h.includes('firma-bloqueada'), 'su firma no está bloqueada');
    assert.ok(!h.includes('linea-firma tachada'), 'su línea de firma no está tachada');
    assert.ok(h.includes('Ingeniero responsable'), 'y sigue teniendo dónde firmar');
  });

  test('dos generaciones seguidas del mismo expediente dan el mismo documento', () => {
    assert.equal(informeHtml(EXPEDIENTE_COMPLETO), informeHtml(EXPEDIENTE_COMPLETO));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el borrador — documento bien formado y autocontenido', () => {

  test('es un documento HTML completo', () => {
    const h = informeBorradorHtml(borrador617());
    assert.ok(/^\s*<!DOCTYPE html>/i.test(h), 'empieza por el doctype');
    assert.ok(/<html[^>]*lang=["']es["']/i.test(h), 'declara el idioma español');
    assert.ok(/<meta[^>]+charset=["']?utf-8/i.test(h), 'declara la codificación');
    assert.ok(h.trimEnd().endsWith('</html>'), 'y cierra');
  });

  test('las etiquetas de bloque abren y cierran en el mismo número', () => {
    const h = informeBorradorHtml(borrador617());
    for (const t of ['html', 'head', 'body', 'style', 'table', 'thead', 'tbody', 'section',
      'div', 'ol', 'ul', 'tr', 'td', 'th']) {
      const abren = (h.match(new RegExp(`<${t}[\\s>]`, 'gi')) ?? []).length;
      const cierran = (h.match(new RegExp(`</${t}>`, 'gi')) ?? []).length;
      assert.equal(abren, cierran, `<${t}> abre ${abren} y cierra ${cierran}`);
    }
  });

  test('CERO JavaScript y CERO recursos externos: se abre sin internet', () => {
    const h = sinComentarios(informeBorradorHtml(borrador617()));
    assert.ok(!/<script/i.test(h), 'sin etiqueta script');
    assert.ok(!/\son\w+\s*=/i.test(h), 'sin manejadores en línea');
    assert.ok(!/javascript:/i.test(h), 'sin enlaces javascript:');
    assert.ok(!/https?:\/\//i.test(h), 'sin URLs http(s)');
    assert.ok(!/<link[^>]+rel=["']?stylesheet/i.test(h), 'sin hoja de estilo enlazada');
    assert.ok(!/@import/i.test(h), 'sin @import en el CSS');
  });

  test('el CSS es de papel: lleva el de siempre MÁS el del borrador', () => {
    const h = informeBorradorHtml(borrador617());
    assert.ok(/@page/.test(h), 'controla la paginación');
    assert.ok(!/var\(--/.test(h), 'no arrastra el tema oscuro de la aplicación');
    assert.ok(h.includes('.firma-bloqueada'), 'trae el estilo del recuadro de firma bloqueada');
    assert.ok(h.includes('.portada .borrador'), 'y el del sello de borrador');
  });

  test('no deja basura por los huecos', () => {
    const h = informeBorradorHtml(borrador617());
    assert.ok(!/undefined|NaN|\[object Object\]/.test(h));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el borrador — se declara BORRADOR y no se puede firmar', () => {

  test('lo dice en la portada, en el bloque de firma y en el pie', () => {
    const h = informeBorradorHtml(borrador617());
    const t = soloTexto(h);
    assert.ok(h.includes(`<p class="borrador">${TITULO_BORRADOR}</p>`), 'sello en la portada');
    assert.ok(h.includes('<title>BORRADOR NO FIRMABLE'), 'y hasta en el nombre de la pestaña');
    assert.ok(t.includes(`${TITULO_BORRADOR}: no se puede firmar.`), 'y en el pie de cada copia');
    assert.ok((h.match(/BORRADOR · NO FIRMABLE/g) ?? []).length >= 2,
      'no se dice una sola vez y en un rincón');
  });

  test('la línea de firma sigue impresa pero TACHADA: nadie la rellena a mano', () => {
    const h = informeBorradorHtml(borrador617());
    assert.ok(h.includes('<div class="linea-firma tachada">Ingeniero responsable'),
      'la línea de firma está y está tachada');
    assert.ok(!/<div class="linea-firma">/.test(h), 'y no queda ninguna sin tachar');
  });

  test('el bloqueo dice QUÉ falta y NOMBRA a la línea vecina que comparte las torres', () => {
    const t = soloTexto(informeBorradorHtml(borrador617()));
    assert.ok(t.includes('No se puede firmar: faltan torres, conductor e hipótesis de LN-617 y de '
      + 'LN-628 (comparten torres).'),
    'la frase del bloqueo, entera y con la vecina dentro');
  });

  test('la tabla «lo que desbloquea la firma» pone una columna por línea', () => {
    const h = informeBorradorHtml(borrador617());
    const t = soloTexto(h);
    assert.ok(t.includes('Lo que desbloquea la firma'), 'la tabla existe');
    assert.ok(/Falta LN-617 LN-628/.test(t), 'con una columna para cada línea');
    assert.ok(t.includes('ninguna registrada (son las mismas torres)'),
      'las torres van en una sola casilla: son las mismas');
    assert.ok(t.includes('Hipótesis de cálculo declarada y congelada'),
      'y se exige la hipótesis congelada, no solo declarada');
  });

  test('sin vecinas el bloqueo no se inventa ninguna', () => {
    const t = soloTexto(informeBorradorHtml(borrador617({ vecinas: [] })));
    assert.ok(t.includes('No se puede firmar: faltan torres, conductor e hipótesis de LN-617.'));
    assert.ok(!t.includes('comparten torres'));
  });

  test('de una vecina sin datos no se supone nada: se dice que no consta', () => {
    const t = soloTexto(informeBorradorHtml(borrador617({ vecinas: [{ codigo: 'LN-628' }] })));
    assert.ok(t.includes('no consta'),
      'de la vecina no se afirma que le falte el conductor si nadie lo ha mirado');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el borrador — la longitud levantada NO es la longitud de la línea', () => {

  test('la frase aprobada sale tal cual en el papel', () => {
    const t = soloTexto(informeBorradorHtml(borrador617()));
    assert.ok(t.includes('Levantado: tramo compartido 618 (E07–E36), 3.183 m — no es la longitud '
      + 'de la línea'),
    'la frase que impide que esos metros se lean como la longitud de LN-617');
  });

  test('el renglón «longitud de línea (eje)» queda en guion, no en cero', () => {
    const t = soloTexto(informeBorradorHtml(borrador617()));
    assert.ok(t.includes('Longitud de línea (eje) — No se conoce'),
      'un cero ahí se sumaría, se promediaría y acabaría comprando cable');
  });

  test('el código del tramo se pronuncia como lo dice el Ingeniero', () => {
    assert.equal(rotuloDeSerie('TR-618'), 'tramo compartido 618');
    assert.equal(rotuloDeSerie('LN-617'), 'LN-617');
    assert.equal(rotuloDeSerie(null), 'serie sin código');
  });

  test('sin longitud levantada no se imprime un número: se imprime el guion', () => {
    const f = fraseDeLongitudLevantada({ codigoSerie: 'TR-618', desde: 'E07', hasta: 'E36' });
    assert.equal(f, 'Levantado: tramo compartido 618 (E07–E36), — — no es la longitud de la línea');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el borrador — «Torres: sin registrar»', () => {

  test('la sección existe y dice por qué no hay torres', () => {
    const t = soloTexto(informeBorradorHtml(borrador617()));
    assert.ok(t.includes('Torres: sin registrar'), 'la sección está y se llama así');
    assert.ok(t.includes('LN-617 no tiene torres registradas.'));
    assert.ok(t.includes('se registrarán cuando el Ingeniero declare la función de cada una'),
      'y dice cuándo nacerán: cuando él lo declare, no solas');
    assert.ok(t.includes('no dibuja apoyos, no calcula vanos entre torres y no dictamina ninguna '
      + 'estructura'));
  });

  test('enseña el recorrido guardado tal cual, rotulado como lo que es', () => {
    const t = soloTexto(informeBorradorHtml(borrador617()));
    assert.ok(t.includes('levantado el 09-08-2026 · sin registrar como torres'), 'el rótulo');
    assert.ok(t.includes('Son posiciones, no torres'), 'y que no son torres');
    assert.ok(t.includes('Lo recorren LN-617 y LN-628: 2 circuitos tendidos en cada posición.'));
  });

  test('cada punto sale con su función SIN DECLARAR, nunca supuesta', () => {
    const h = informeBorradorHtml(borrador617());
    const filas = (h.match(/<i>sin declarar<\/i>/g) ?? []).length;
    assert.equal(filas, RECORRIDO_617.puntos.length,
      'los 28 puntos, y los 28 sin función: deducirla es el dato más caro de la línea');
  });

  test('el último punto no inventa un vano siguiente', () => {
    const h = informeBorradorHtml(borrador617());
    const ultimo = RECORRIDO_617.puntos[RECORRIDO_617.puntos.length - 1];
    const fila = new RegExp(`<tr><td>${ultimo.nombre}</td>[\\s\\S]*?</tr>`).exec(h);
    assert.ok(fila, 'la fila del último punto está');
    assert.ok(fila[0].includes('<td class="num">—</td>'), 'y su vano al siguiente es un guion');
  });

  test('los vanos con pinta de esconder una torre se señalan, sin dictaminar', () => {
    const t = soloTexto(informeBorradorHtml(borrador617()));
    assert.ok(t.includes('Vanos que podrían esconder una torre que no se levantó'));
    assert.ok(t.includes('No es un veredicto'), 'se señala dónde mirar, no se dictamina');
  });

  test('sin recorrido guardado el borrador no revienta y lo dice', () => {
    const h = informeBorradorHtml(borrador617({ recorrido: {}, calidad: [] }));
    const t = soloTexto(h);
    assert.ok(t.includes('no consta todavía ni una jornada de campo'));
    assert.ok(!/undefined|NaN/.test(h));
    assert.ok(!t.includes('Calidad del levantamiento'),
      'y no abre una sección de calidad de un levantamiento que no existe');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el borrador — sale con lo que SÍ hay', () => {

  test('los parámetros eléctricos medidos entran al papel', () => {
    const t = soloTexto(informeBorradorHtml(borrador617()));
    assert.ok(t.includes('Parámetros eléctricos medidos'), 'la sección existe');
    assert.ok(t.includes('8 señales'), 'con lo cargado');
    assert.ok(t.includes('I R (A)') && t.includes('U RS (kV)'), 'y la tabla señal por señal');
    assert.ok(t.includes('Corriente más alta medida 412,7 A'), 'el pico sube al resumen');
  });

  test('pero llegan SIN veredicto, y el papel dice por qué', () => {
    const t = soloTexto(informeBorradorHtml(borrador617()));
    assert.ok(t.includes('Es dato medido, sin veredicto'));
    assert.ok(t.includes('sin conductor no hay ampacidad contra la que comparar'));
    assert.ok(t.includes('tampoco hay pérdidas — faltan el conductor y la longitud de la línea'));
    assert.ok(t.includes('Sin veredicto: sin conductor no hay ampacidad contra la que compararla.'),
      'también en el renglón del resumen');
  });

  test('sin nada cargado no se finge: se dice que no hay', () => {
    const t = soloTexto(informeBorradorHtml(borrador617({ electricos: {} })));
    assert.ok(t.includes('No hay parámetros eléctricos cargados'));
    assert.ok(t.includes('No es un fallo'));
  });

  test('la calidad del levantamiento viaja con sus hallazgos', () => {
    const t = soloTexto(informeBorradorHtml(borrador617()));
    assert.ok(t.includes('Calidad del levantamiento'));
    assert.ok(t.includes('Vano E19 → E21 de 238,6 m'));
    assert.ok(t.includes('Faltan las placas E01–E06'));
  });

  test('el índice de la portada es el cuerpo, no una lista aparte', () => {
    const h = informeBorradorHtml(borrador617());
    const titulos = [...h.matchAll(/<h2>(\d+)\. ([^<]+)<\/h2>/g)].map((m) => `${m[1]}. ${m[2]}`);
    const indice = [...h.matchAll(/<li>(\d+)\. ([^<]+)<\/li>/g)].map((m) => `${m[1]}. ${m[2]}`);
    assert.deepEqual(indice, titulos, 'el índice y las secciones no pueden desincronizarse');
    assert.ok(titulos.length >= 5, 'y hay cuerpo que indexar');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el borrador — NO copia nada de otra línea', () => {

  test('no hay conductor, ni hipótesis, ni longitud tomados de la vecina', () => {
    const t = soloTexto(informeBorradorHtml(borrador617()));
    assert.ok(t.includes('No se declaró conductor'), 'lo dice');
    assert.ok(t.includes('No se usa el de otra línea'), 'y dice que no lo toma prestado');
    assert.ok(t.includes('Conductor: no declarado — no se usa el de otra línea'),
      'también en la procedencia de la portada');
    assert.ok(t.includes('Hipótesis de cálculo: no declarada'));
    assert.ok(!/RTS|kgf|EDS \d/.test(t), 'y no se cuela ni una cifra de conductor o de hipótesis');
  });

  test('las secciones de cálculo no salen, y cada una dice qué le falta', () => {
    const t = soloTexto(informeBorradorHtml(borrador617()));
    assert.ok(t.includes('Cálculo, cargas, capacidad y cantidades: no se calculan'));
    assert.ok(t.includes('ninguna se rellena con datos de otra línea'));
    for (const s of ['Cálculo mecánico por tramo de tensión', 'Detalle vano a vano',
      'Carga sobre las estructuras', 'Carga longitudinal sobre las estructuras',
      'Umbrales y criterios de evaluación', 'Capacidad en corriente de la línea',
      'Memoria de cantidades (geométrica)']) {
      assert.ok(t.includes(s), `la sección «${s}» aparece con su motivo`);
    }
    assert.ok(t.includes('y de LN-628 : cada torre lleva 2 circuitos')
      || t.includes('y de LN-628'), 'la carga sobre las torres depende también de la vecina');
  });

  test('el motor declara que en este borrador no calculó nada', () => {
    const t = soloTexto(informeBorradorHtml(borrador617()));
    assert.ok(t.includes('en este borrador no calculó nada'));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el borrador — lo que NO demuestra, derivado y no escrito a mano', () => {

  test('la sección final existe siempre y cierra con el bloqueo de firma', () => {
    const h = informeBorradorHtml(borrador617());
    const t = soloTexto(h);
    assert.ok(t.includes('Lo que este borrador NO demuestra'));
    assert.ok(t.includes('Alcance de este borrador'));
    const ultimaSeccion = h.slice(h.lastIndexOf('<section class="limites">'));
    assert.ok(ultimaSeccion.includes('firma-bloqueada'),
      'la última página del papel repite por qué no se puede firmar');
  });

  test('las limitaciones se derivan de lo que falta y de lo que hay', () => {
    const lim = limitesDelBorrador(borrador617());
    const titulos = lim.map((l) => l.titulo);
    assert.ok(titulos.includes('No hay torres registradas'));
    assert.ok(titulos.includes('No se declaró el conductor'));
    assert.ok(titulos.includes('No se declaró la hipótesis de cálculo'));
    assert.ok(titulos.includes('Comparte torres con LN-628'));
    assert.ok(titulos.includes('La longitud es la levantada, no la de la línea'));
    assert.ok(titulos.includes('Lo medido no tiene veredicto'));
    assert.ok(titulos.some((x) => x.startsWith('Calidad del levantamiento:')),
      'los hallazgos de ATENCIÓN del levantamiento también son un límite del papel');
  });

  test('cuando el conductor llegue, su limitación desaparece sola', () => {
    const lim = limitesDelBorrador(borrador617({ faltan: ['torres', 'hipotesis'] }));
    const titulos = lim.map((l) => l.titulo);
    assert.ok(!titulos.includes('No se declaró el conductor'));
    assert.ok(titulos.includes('No hay torres registradas'),
      'pero mientras no haya torres, el borrador sigue siendo borrador');
  });

  test('cada limitación declara de dónde sale', () => {
    for (const l of limitesDelBorrador(borrador617())) {
      assert.ok(l.origen && typeof l.origen === 'string', `«${l.titulo}» sin origen`);
      assert.ok(l.detalle && l.detalle.length > 20, `«${l.titulo}» sin detalle`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('el borrador — el dato de campo va escapado', () => {

  test('un nombre de punto con marcas no deforma el documento', () => {
    const h = informeBorradorHtml(borrador617({
      recorrido: {
        ...RECORRIDO_617,
        desde: '<b>E07', hasta: 'E36"',
        puntos: [{ nombre: '<script>x</script>', hora: '07:00:00', cota_m: 1,
          vanoSiguiente_m: null, deflexion_grados: null }],
      },
    }));
    assert.ok(!/<script/i.test(h), 'el nombre no inyecta nada');
    assert.ok(h.includes('&lt;script&gt;'), 'sale escapado y visible, que es lo correcto');
    assert.ok(h.includes('&lt;b&gt;E07'), 'y también en el rótulo del tramo');
  });

  test('y no se escapa DOS veces: en el papel no puede salir «&amp;lt;»', () => {
    // La frase de la longitud viaja a dos sitios —un párrafo del resumen y una
    // limitación— y cada uno escapa por su cuenta. Si además llegara ya
    // escapada, el papel imprimiría «&lt;» literal donde debía haber un «<».
    const h = informeBorradorHtml(borrador617({
      recorrido: { ...RECORRIDO_617, desde: '<b>E07' },
    }));
    assert.ok(!/&amp;(lt|gt|quot|#39);/.test(h), 'nada escapado dos veces');
  });

  test('ni el código de la serie, que también llega de la base', () => {
    const h = informeBorradorHtml(borrador617({
      recorrido: { ...RECORRIDO_617, codigoSerie: 'TR-<b>618' },
    }));
    assert.ok(!/tramo compartido <b>/.test(h), 'el código no inyecta etiquetas');
    assert.ok(h.includes('tramo compartido &lt;b&gt;618'), 'sale escapado');
  });

  test('el aviso libre admite énfasis pero no etiquetas con atributos', () => {
    const h = informeBorradorHtml(borrador617({
      electricos: { ...ELECTRICOS_617, avisos: ['<b>ojo</b> <a href="x">no</a>'] },
    }));
    assert.ok(h.includes('<b>ojo</b>'), 'el énfasis sin atributos se respeta');
    assert.ok(!/<a href/.test(h), 'y el enlace no pasa');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('bloqueoDeFirma — la pieza suelta', () => {

  test('con una sola falta la frase va en singular', () => {
    const b = bloqueoDeFirma({
      linea: { codigo: 'LN-617' }, faltan: ['conductor'], vecinas: [],
      recorrido: { codigoSerie: 'TR-618' },
    });
    assert.ok(b.texto.includes('falta conductor de LN-617.'));
    assert.ok(!b.texto.includes('faltan'));
  });

  test('la «e» del castellano delante de «hipótesis»', () => {
    const b = bloqueoDeFirma({
      linea: { codigo: 'LN-617' }, faltan: ['conductor', 'hipotesis'], vecinas: [],
      recorrido: {},
    });
    assert.ok(b.texto.includes('conductor e hipótesis'), 'no «conductor y hipótesis»');
  });

  test('el orden de lo que falta es fijo, venga como venga', () => {
    const b = bloqueoDeFirma({
      linea: { codigo: 'LN-617' }, faltan: ['hipotesis', 'torres', 'conductor'],
      vecinas: [], recorrido: {},
    });
    assert.deepEqual(b.faltan, ['torres', 'conductor', 'hipotesis']);
  });
});
