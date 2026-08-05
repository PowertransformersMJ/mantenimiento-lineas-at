// ============================================================================
// exportar/informe.js — el MODO INFORME: el documento imprimible que se firma
// ----------------------------------------------------------------------------
// Todo lo demás del sistema es el taller. Esto es lo que SALE del edificio: un
// solo archivo HTML que se abre, se imprime y se archiva junto al expediente de
// la línea. Cuando alguien discuta una cifra dentro de tres años, discutirá con
// ESTE papel, no con la pantalla que ya cambió.
//
// LAS CUATRO REGLAS QUE GOBIERNAN EL ARCHIVO GENERADO
//
// 1) CERO JavaScript y CERO recursos externos. Ni una etiqueta <script>, ni un
//    <link>, ni una fuente, ni una imagen remota. Un informe que necesita una
//    CDN para verse bien es un informe que muere el día que esa CDN muere — y
//    el informe tiene que abrir dentro de diez años, en un portátil sin
//    internet, desde un adjunto de correo. Todo el estilo va incrustado.
//
// 2) CSS de PAPEL, no de pantalla. Fondo blanco, tinta negra, A4, cabeceras de
//    tabla que se repiten en cada página y bloques que no se parten a la mitad.
//    El tema oscuro de la aplicación NO se reutiliza: gasta un cartucho por
//    página y en la fotocopiadora sale un rectángulo gris.
//    El semáforo tampoco se juega solo al color: cada estado lleva TEXTO y una
//    marca de forma (● ▲ ○), porque la mitad de estos informes se imprimen en
//    blanco y negro y un verde y un ámbar fotocopiados son el mismo gris.
//
// 3) Todo texto que venga de los datos se ESCAPA (ver `esc`). Un nombre de
//    estructura con un `&` o un `<` no puede romper el documento, y desde luego
//    no puede inyectar nada. La única excepción es un puñado de marcas de
//    énfasis SIN atributos que se reponen después de escapar (ver `escRico`):
//    el argumento de seguridad está escrito ahí y es demostrable.
//
// 4) Este archivo PRESENTA; no calcula. Cada cifra llega ya calculada por
//    `nucleo/` y ya derivada por `exportar/levantamiento.js`. Si el informe se
//    pusiera a calcular habría dos motores, y algún día darían resultados
//    distintos — con la mala suerte de que la discrepancia aparecería en el
//    documento firmado. Aquí solo se cuenta, se suma, se ordena y se redacta.
//
// LA REGLA DE FONDO (§0.0 del cerebro del proyecto)
// El sistema no certifica nada: certifica el ingeniero que firma. Por eso el
// documento termina —siempre, sin excepción, aunque no haya nada que declarar—
// con «LO QUE ESTE INFORME NO DEMUESTRA». Un informe que esconde sus límites
// parece más fuerte y es más frágil: la primera pregunta del cliente apunta
// justo ahí, y quien la contesta es el que firmó.
//
// JavaScript puro: sin DOM, sin red, sin framework. Devuelve el texto del
// archivo, igual que gpx.js / kml.js / csv.js.
// ============================================================================
import { bloqueProcedencia } from './procedencia.js';
import { calidadLevantamiento } from './calidad.js';
// El texto del criterio y su umbral tienen UN dueño: el núcleo. Aquí no se
// reescriben a mano — un criterio copiado es un criterio que algún día dice una
// cosa en la pantalla y otra en el papel firmado.
import { CRITERIO_UTILIZACION, UMBRAL_UTILIZACION_PCT } from '@lineas/nucleo/cargas';
// El eje longitudinal tiene sus PROPIOS textos, y son de su propio módulo: el
// criterio con el que se compara cuando hay capacidad declarada, y el motivo por
// el que hoy no hay veredicto en ninguna fila. Los dos vivían copiados a mano en
// este archivo; una copia es lo que hace que el papel firmado y la pantalla
// acaben diciendo cosas distintas el día que uno de los dos cambie.
import {
  CRITERIO_UTILIZACION_LONGITUDINAL, CRITERIO_CAPACIDAD_LONGITUDINAL,
} from '@lineas/nucleo/longitudinal';

// ── Escapado ────────────────────────────────────────────────────────────────

/**
 * Mismo patrón que `esc` de gpx.js, con dos añadidos deliberados:
 *
 * · la comilla simple también se escapa (`&#39;`) — no hace falta hoy porque
 *   ningún dato viaja dentro de un atributo, pero el día que alguien añada uno
 *   la protección ya está puesta y no hay que acordarse;
 * · `null` y `undefined` salen como cadena vacía, NO como el texto "null". En
 *   un GPX un "null" es feo; en un informe firmado es peor: se lee como si
 *   alguien hubiera medido algo y el resultado fuera «null».
 */
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/**
 * Escapado para los textos NARRATIVOS del expediente de falla, que en la base
 * vienen con un poco de énfasis puesto por el ingeniero (`<b>`, `<i>`, `<br>`).
 *
 * Se escapa TODO primero y solo después se reponen esas cinco marcas. Por qué
 * eso es seguro, y no un agujero disfrazado: tras `esc` no queda ni un `<` ni
 * un `>` crudo en la cadena, así que lo único que puede volver a ser etiqueta
 * es exactamente lo que este patrón nombra — cinco nombres, sin espacios y por
 * tanto SIN ATRIBUTOS POSIBLES. No hay forma de colar un `src`, un `href`, un
 * `onclick` ni un `javascript:`: para escribir un atributo hace falta un
 * espacio dentro de la etiqueta, y el patrón no lo admite.
 *
 * Si se prefiere el rigor absoluto sobre la legibilidad, cámbiese la llamada
 * por `esc` y el informe mostrará las marcas tal cual («<b>perno</b>»): feo,
 * pero no incorrecto.
 */
const escRico = (s) => esc(s).replace(/&lt;(\/?)(b|i|em|strong|br)\/?&gt;/g, '<$1$2>');

// ── Cifras ──────────────────────────────────────────────────────────────────

/**
 * Lo que se imprime donde no hay número.
 *
 * Un guion NO es un cero y el informe lo dice en cada tabla al pie: es un valor
 * que no se puede sostener con los datos de hoy. Rellenarlo con un cero sería
 * la mentira barata de este oficio — un cero se suma, se promedia y acaba
 * sosteniendo una decisión de compra.
 */
const SIN_DATO = '—';

const NOTA_HUECO = 'El guion (—) no es un cero: es una casilla que los datos de hoy no permiten '
  + 'llenar. El motivo de cada hueco se declara en la sección final del informe.';

/** Número formateado a la colombiana (coma decimal), o el guion si no hay dato. */
const n = (v, d = 0) => (Number.isFinite(v)
  ? v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d })
  : SIN_DATO);

/** Igual, con unidad pegada — y sin unidad cuando no hay valor (una unidad suelta engaña). */
const nu = (v, d, unidad) => (Number.isFinite(v) ? `${n(v, d)} ${unidad}` : SIN_DATO);

// ── Normalización de la entrada ─────────────────────────────────────────────
//
// El informe es lo último de la cadena: le llega lo que las pantallas tengan a
// mano, y a veces le llega a medias (una línea recién creada, un levantamiento
// sin conductor asignado). NO puede reventar por eso: un informe que lanza una
// excepción no le dice nada a nadie, mientras que un informe con secciones que
// declaran «no evaluable» es, él mismo, el diagnóstico de lo que falta.

const lista = (x) => (Array.isArray(x) ? x : []);
const objeto = (x) => (x !== null && typeof x === 'object' && !Array.isArray(x) ? x : {});

/**
 * `lev` con la forma mínima que esperan `bloqueProcedencia` y
 * `calidadLevantamiento`. Sin esto, un informe sin levantamiento moriría dentro
 * de `lev.longitud_m.toFixed(2)` — y el usuario vería una pantalla en blanco en
 * vez de un documento que dice qué falta.
 */
function levSeguro(lev) {
  const L = objeto(lev);
  return {
    puntos: lista(L.puntos),
    tramos: lista(L.tramos),
    nEstructuras: Number.isFinite(L.nEstructuras) ? L.nEstructuras : lista(L.puntos).filter((p) => p?.tipo !== 'Empalme' && p?.tipo !== 'Punto de referencia').length,
    nEmpalmes: Number.isFinite(L.nEmpalmes) ? L.nEmpalmes : lista(L.puntos).filter((p) => p?.tipo === 'Empalme').length,
    // ⚠️ `null`, NUNCA 0. Este archivo defiende en cada tabla que «el guion (—)
    // no es un cero», y aquí fabricaba uno: ese 0 se imprimía dos veces como si
    // fuera dato —en la portada («0,00 m de línea») y en el resumen ejecutivo
    // («Longitud de línea (eje): 0,00 m»)— mientras el mismo informe mostraba
    // «Vano medio: —» porque ese cálculo sí exige `longitud_m > 0`. Una línea de
    // longitud cero con vanos reales, en el renglón que este archivo defiende
    // con NOTA_HUECO (§ADR-013, hallazgo 20). `n()` y `nu()` ya imprimen el
    // guion solos cuando les llega un hueco.
    longitud_m: Number.isFinite(L.longitud_m) ? L.longitud_m : null,
  };
}

/**
 * El detalle vano a vano llega en dos formas según quién llame, y las dos son
 * razonables: agrupado por tramo (que es como se calcula) o aplanado (que es
 * como se lista). Se aceptan ambas y se normaliza a grupos.
 *
 * ⚠️ Importa de verdad: `detalleVanos` numera los vanos DENTRO de cada tramo,
 * así que un aplanado sin nombre de tramo produce tres «vano 1» distintos en la
 * misma tabla y nadie sabe de cuál se habla (lo avisa `nucleo/vanos.js`). Por
 * eso el grupo siempre lleva rótulo, aunque sea el ordinal.
 */
function gruposDeVanos(vanos) {
  const V = lista(vanos);
  if (!V.length) return [];
  if (V.some((g) => Array.isArray(g?.filas))) {
    return V.map((g, i) => ({
      titulo: rotuloTramo(g, i),
      filas: lista(g?.filas),
    }));
  }
  return [{ titulo: 'Toda la línea', filas: V }];
}

/** Nombre legible de un tramo, acepte la forma que acepte quien lo pase. */
function rotuloTramo(t, i) {
  const T = objeto(t);
  if (typeof T.nombre === 'string' && T.nombre) return T.nombre;
  const de = T.desde?.nombre ?? (typeof T.desde === 'string' ? T.desde : null);
  const a = T.hasta?.nombre ?? (typeof T.hasta === 'string' ? T.hasta : null);
  if (de && a) return `Tramo ${T.n ?? i + 1}: ${de} → ${a}`;
  return `Tramo ${T.n ?? i + 1}`;
}

// ── Estilo de PAPEL ─────────────────────────────────────────────────────────
//
// Va incrustado en el documento (regla 1). Se escribe una sola vez y aquí, a la
// vista, para que el día que el Ingeniero pida «más grande la letra de las
// tablas» se toque un número y no doce plantillas.
//
// ⚠️ Lo que NO se puede hacer desde aquí: numerar las páginas. Las cajas de
// margen de `@page` (`@top-center { content: counter(page) }`) NO las implementa
// ningún navegador de escritorio; el número de página lo pone el diálogo de
// impresión (Chrome: «Encabezados y pies de página»). Se dice aquí para que
// nadie pierda una tarde intentándolo.
const ESTILO = `
@page { size: A4 portrait; margin: 18mm 15mm 20mm 15mm; }

* { box-sizing: border-box; }
body {
  margin: 0; background: #ffffff; color: #000000;
  font: 10.5pt/1.5 Georgia, "Times New Roman", serif;
}
.hoja { max-width: 185mm; margin: 0 auto; padding: 12mm 10mm; }
@media print { .hoja { max-width: none; padding: 0; } }

h1, h2, h3 {
  font-family: Arial, Helvetica, sans-serif; color: #000000;
  /* Un título solo al pie de una página es un título huérfano: se baja con su texto. */
  break-after: avoid; page-break-after: avoid;
}
h1 { font-size: 21pt; margin: 0 0 3mm; line-height: 1.2; }
h2 { font-size: 13pt; margin: 9mm 0 3mm; padding-bottom: 1.5mm; border-bottom: 1.2pt solid #000000; }
h3 { font-size: 11pt; margin: 5mm 0 2mm; }
p { margin: 0 0 2.5mm; }
ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
li { margin-bottom: 1.5mm; }
b, strong { font-weight: bold; }

/* Lo que nunca se parte entre dos páginas. */
.bloque { break-inside: avoid; page-break-inside: avoid; margin-bottom: 5mm; }

table { width: 100%; border-collapse: collapse; font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt; }
caption { caption-side: top; text-align: left; font-style: italic; font-size: 8.5pt; padding-bottom: 2mm; }
th, td { border: 0.4pt solid #666666; padding: 1.3mm 1.7mm; vertical-align: top; text-align: left; }
/* La cabecera se REPITE en cada página que ocupe la tabla: una tabla de 200
   vanos sin esto obliga a volver a la primera hoja para saber qué columna es. */
thead { display: table-header-group; }
tfoot { display: table-footer-group; }
thead th { border-bottom: 1pt solid #000000; font-weight: bold; }
tr { break-inside: avoid; page-break-inside: avoid; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
tr.revisar td { font-weight: bold; }
tr.revisar td:first-child::before { content: "\\25B2  "; }

/* Semáforo legible en blanco y negro: forma + texto, nunca color a secas. */
.sello { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; white-space: nowrap;
         border: 0.6pt solid #000000; padding: 0.3mm 1.6mm; }
.sello-cumple::before { content: "\\25CF  "; }
.sello-revisar { border-width: 1.4pt; font-weight: bold; }
.sello-revisar::before { content: "\\25B2  "; }
.sello-nulo { border-style: dashed; }
.sello-nulo::before { content: "\\25CB  "; }

.portada { break-after: page; page-break-after: always; }
.portada .rotulo { font-family: Arial, Helvetica, sans-serif; font-size: 9pt;
                   letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 2mm; }
.portada .lema { border-left: 2.5pt solid #000000; padding-left: 4mm; margin: 6mm 0; font-style: italic; }

.procedencia { border: 0.8pt solid #000000; padding: 4mm 5mm; margin: 6mm 0;
               font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt; }
.procedencia h3 { margin: 0 0 2mm; font-size: 9.5pt; }
.procedencia li { margin-bottom: 1.5mm; }

.firma { margin-top: 10mm; }
.firma .linea-firma { border-top: 0.8pt solid #000000; width: 75mm; margin-top: 14mm; padding-top: 1.5mm;
                      font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt; }

.nota { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; color: #333333; margin-top: 1.5mm; }
.aviso { border-left: 2pt solid #000000; padding: 1mm 0 1mm 4mm; margin: 0 0 3mm; }

.limites { break-before: page; page-break-before: always; }
.limites h2 { border-bottom-width: 2.5pt; }
.limites ol { padding-left: 7mm; }
.limites li { margin-bottom: 3mm; break-inside: avoid; page-break-inside: avoid; }
.limites .origen { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; color: #333333; display: block; }

.pie { margin-top: 8mm; border-top: 0.6pt solid #000000; padding-top: 2mm;
       font-family: Arial, Helvetica, sans-serif; font-size: 8pt; }
`;

// ── Piezas reutilizables ────────────────────────────────────────────────────

const parrafo = (t) => `<p>${t}</p>`;
const nota = (t) => `<p class="nota">${t}</p>`;

/** Tabla con su leyenda y su pie de «qué significa el guion». */
function tabla({ leyenda, cabecera, filas, pie }) {
  if (!filas.length) return '';
  return `<div class="bloque"><table>
  <caption>${leyenda}</caption>
  <thead><tr>${cabecera}</tr></thead>
  <tbody>${filas.join('')}</tbody>
</table>${pie ? nota(pie) : ''}</div>`;
}

/** El sello del semáforo, con su forma y su texto (nunca solo color). */
function sello(estado) {
  const mapa = {
    cumple: ['sello-cumple', 'cumple'],
    revisar: ['sello-revisar', 'revisar'],
    no_evaluable: ['sello-nulo', 'no evaluable'],
  };
  const [clase, texto] = mapa[estado] ?? ['sello-nulo', String(estado ?? 'sin estado')];
  return `<span class="sello ${clase}">${esc(texto)}</span>`;
}

// ── 1 · Portada ─────────────────────────────────────────────────────────────

function portada(linea, conductor, hipotesis, lev, meta, indice) {
  const L = objeto(linea);
  const C = objeto(conductor);
  const H = objeto(hipotesis);

  const identidad = [L.nombre, L.tensionNominal_kV != null ? `${n(L.tensionNominal_kV)} kV` : null, L.propietario]
    .filter(Boolean).map(esc).join(' · ');

  // El bloque de procedencia se toma tal cual de `procedencia.js`: es el mismo
  // que llevan el GPX, el KML y el CSV. Si los cuatro archivos de una misma
  // exportación no dijeran lo mismo, el informe perdería el argumento entero.
  const renglones = bloqueProcedencia(L, lev, meta).map((r) => `<li>${esc(r)}</li>`);

  // La versión del motor NO la sabe este archivo (nucleo/ no publica su versión
  // y exportar/ no debe adivinarla): la declara quien manda a generar, con el
  // mismo nombre que usa `SelloCalculo.versionNucleo` en el contrato. Si no
  // llega, no se inventa — se declara el hueco aquí y otra vez al final.
  const motor = meta.versionNucleo ?? meta.versionMotor;
  renglones.push(`<li>Motor de cálculo @lineas/nucleo: ${motor
    ? `v${esc(motor)}`
    : '<b>versión NO declarada</b> — sin ella este informe no es reproducible'}</li>`);

  if (C.codigo) {
    renglones.push(`<li>Conductor: ${esc([C.material, C.codigo, C.calibre].filter(Boolean).join(' '))}`
      + ` · RTS ${nu(C.rts_kgf, 0, 'kgf')} · masa ${nu(C.masaLineal_kg_m, 3, 'kg/m')}`
      + ` · procedencia del dato: ${esc(C.procedencia ?? 'no declarada')}`
      + `${C.fuente ? ` (${esc(C.fuente)})` : ''}</li>`);
  }
  if (H.nombre) {
    renglones.push(`<li>Hipótesis «${esc(H.nombre)}»: EDS ${n(H.eds_pct, 1)} % a ${n(H.tempEds_C, 0)} °C`
      + ` · ${n(H.tempMin_C, 0)} a ${n(H.tempMax_C, 0)} °C`
      + ` · viento ${n(H.vientoMax_kmh, 0)} km/h a ${n(H.tempViento_C, 0)} °C`
      + ` · ${H.congelada ? 'CONGELADA' : '<b>no congelada</b> — puede cambiar y cambiar estas cifras'}</li>`);
  }

  const listado = indice
    .map((t, i) => `<li>${i + 1}. ${esc(t)}</li>`)
    .join('');

  return `<section class="portada">
  <p class="rotulo">Informe técnico de línea de alta tensión</p>
  <h1>${esc(L.codigo ?? 'Línea sin identificar')}</h1>
  ${identidad ? parrafo(identidad) : ''}

  <p class="lema">Este sistema no certifica nada. Certifica el ingeniero que firma.
  El trabajo del sistema es hacer barato comprobar que ese ingeniero tiene razón.</p>

  <div class="procedencia">
    <h3>Procedencia de este documento</h3>
    <ul>${renglones.join('')}</ul>
  </div>

  <div class="bloque">
    <h3>Contenido</h3>
    <ul>${listado}</ul>
    <p class="nota">Sin enlaces internos a propósito: en papel un enlace no lleva a ninguna parte,
    y el documento se guarda impreso tan a menudo como en pantalla.</p>
  </div>

  <div class="firma bloque">
    <p class="nota">El sistema produce las cifras; la responsabilidad técnica es de quien firma.</p>
    <div class="linea-firma">Ingeniero responsable — nombre, matrícula profesional y fecha</div>
  </div>
</section>`;
}

// ── 2 · Resumen ejecutivo ───────────────────────────────────────────────────

function resumenEjecutivo(lev, tramos, indicadores, conductor) {
  const C = objeto(conductor);
  const nVanos = Math.max(0, lev.nEstructuras - 1);

  // Estadística de vanos: se lee de los vanos REALES ya derivados (estructura a
  // estructura). Aquí no se vuelve a medir nada — solo se ordena lo que ya vino.
  const vanosReales = lev.puntos
    .map((p) => p?.vanoAnterior_m)
    .filter((v) => Number.isFinite(v) && v > 0);
  const vanoMax = vanosReales.length ? Math.max(...vanosReales) : null;
  const vanoMin = vanosReales.length ? Math.min(...vanosReales) : null;
  const vanoMedio = nVanos > 0 && lev.longitud_m > 0 ? lev.longitud_m / nVanos : null;

  const pctRts = tramos.map((t) => t?.pctRts).filter((x) => Number.isFinite(x));
  const picoPct = pctRts.length ? Math.max(...pctRts) : null;
  const excedidos = tramos.filter((t) => t?.excede === true).length;

  const cuenta = (e) => indicadores.filter((i) => i?.estado === e).length;

  const fila = (concepto, valor, significa) =>
    `<tr><td>${concepto}</td><td class="num">${valor}</td><td>${significa}</td></tr>`;

  const filas = [
    fila('Estructuras levantadas', n(lev.nEstructuras),
      'Puntos que sostienen el conductor. Los empalmes NO cuentan: no sostienen nada.'),
    fila('Empalmes', n(lev.nEmpalmes),
      'Uniones del conductor a mitad de vano. Contarlas como apoyos partiría vanos reales en dos falsos.'),
    fila('Vanos reales', n(nVanos),
      'Uno menos que las estructuras. Es lo que de verdad cuelga sobre el terreno.'),
    fila('Longitud de línea (eje)', nu(lev.longitud_m, 2, 'm'),
      'Suma de los vanos horizontales. <b>No es el conductor a comprar</b>: el cable cuelga y mide más.'),
    fila('Tramos de tensión', n(tramos.length || lev.tramos.length),
      'Trozos entre anclajes. Cada uno se calcula con su propio vano ideal de regulación.'),
    fila('Vano máximo', nu(vanoMax, 1, 'm'),
      'Es el vano que gobierna la flecha y el que primero se acerca al terreno.'),
    fila('Vano mínimo', nu(vanoMin, 1, 'm'), 'Un vano muy corto suele delatar un cruce o una derivación.'),
    fila('Vano medio', nu(vanoMedio, 1, 'm'), 'Longitud del eje dividida entre el número de vanos.'),
    fila('Tiro máximo calculado', Number.isFinite(picoPct) ? `${n(picoPct, 1)} % RTS` : SIN_DATO,
      'Porcentaje de la carga de rotura del conductor en el peor estado de todos los tramos.'),
    fila('Tramos sobre el umbral adoptado', n(excedidos),
      excedidos ? '<b>Requieren revisión del ingeniero antes de firmar.</b>'
        : `Ninguno supera ${topeDeTiro(indicadores)}.`),
    fila('Criterios que cumplen', n(cuenta('cumple')), 'Del total de criterios evaluados en la sección de umbrales.'),
    fila('Criterios a revisar', n(cuenta('revisar')), 'El sistema señala; dictamina quien firma.'),
    fila('Criterios no evaluables', n(cuenta('no_evaluable')),
      'No es un fallo de la aplicación: es un hecho sobre los datos disponibles hoy.'),
  ];

  const conductorTxt = C.codigo
    ? `Conductor ${esc([C.material, C.codigo, C.calibre].filter(Boolean).join(' '))},`
      + ` sección ${nu(C.seccion_mm2, 1, 'mm²')}, diámetro ${nu(C.diametro_m != null ? C.diametro_m * 1000 : null, 1, 'mm')},`
      + ` masa ${nu(C.masaLineal_kg_m, 3, 'kg/m')}, carga de rotura ${nu(C.rts_kgf, 0, 'kgf')}.`
    : '<b>No se declaró conductor</b>: sin él no hay cálculo mecánico posible, solo geometría.';

  return parrafo(conductorTxt) + tabla({
    leyenda: 'La línea en cifras. Todas salen de los datos del levantamiento y del cálculo del núcleo; '
      + 'ninguna se escribió a mano.',
    cabecera: '<th>Cifra</th><th class="num">Valor</th><th>Qué significa</th>',
    filas,
    pie: NOTA_HUECO,
  });
}

// ── 3 · Calidad del levantamiento ───────────────────────────────────────────

function seccionCalidad(hallazgos) {
  if (!hallazgos.length) {
    return parrafo('No se detectó ningún problema de calidad en el levantamiento con los controles '
      + 'automáticos vigentes (numeración, quiebres, vanos anómalos, precisión declarada y completitud). '
      + '<b>Eso no certifica que el levantamiento sea correcto</b>: certifica que estos controles no '
      + 'encontraron nada.');
  }
  const rotulo = { atencion: 'ATENCIÓN', aviso: 'Aviso', info: 'Información' };
  const filas = hallazgos.map((h) => `<tr${h?.severidad === 'atencion' ? ' class="revisar"' : ''}>
    <td>${esc(rotulo[h?.severidad] ?? h?.severidad)}</td>
    <td><b>${esc(h?.titulo)}</b></td>
    <td>${esc(h?.detalle)}</td></tr>`);

  return parrafo('Estas observaciones se DERIVAN de los datos cada vez que se genera el informe: '
    + 'si el dato se corrige, el hallazgo desaparece solo. No están escritas a mano.')
    + tabla({
      leyenda: 'Hallazgos de calidad sobre el levantamiento, ordenados de mayor a menor severidad.',
      cabecera: '<th>Severidad</th><th>Hallazgo</th><th>Por qué importa</th>',
      filas,
    });
}

// ── El tope de tiro: de dónde sale, dicho con las palabras verdaderas ───────
//
// La bandera `excede` de cada tramo la calcula hoy la vista con
// `nucleo/mecanica.tiroMaximoAdmisible()`, que es `0,5 · RTS` FIJO EN CÓDIGO.
// El informe lo atribuía «al tope adoptado en la hipótesis» en dos sitios, y en
// el mismo documento, dos páginas después, la tabla de umbrales imprimía lo
// contrario: «Umbral del 50 % adoptado por defecto (procedencia:
// criterio_clasico): la hipótesis no declara `tiroAdmisible_pct`. Es la
// práctica clásica, no una norma citada». Un criterio sin norma se declara
// ADOPTADO; no se viste de decisión versionada del ingeniero (§ADR-013,
// hallazgo 9).
//
// El dueño del criterio es `evaluarUmbrales`, así que la frase se DERIVA de su
// indicador en vez de escribirse a mano. Sin indicadores —un informe generado
// sin tabla de umbrales— se dice lo que es verdad hoy sin adornarlo.
function topeDeTiro(indicadores) {
  const ind = lista(indicadores).find((i) => i?.id === 'tiro_maximo_pct_rts');
  const pct = Number.isFinite(ind?.umbral) ? ind.umbral : null;

  if (pct === null) {
    return 'el tope de tiro adoptado por defecto (50 % de la carga de rotura, criterio clásico sin '
      + 'norma citada, fijado hoy en el motor de cálculo)';
  }
  return ind.procedenciaUmbral === 'hipotesis_declarada'
    ? `el tope de tiro declarado en la hipótesis de la línea (${n(pct, 0)} % de la carga de rotura)`
    : `el tope de tiro adoptado por defecto (${n(pct, 0)} % de la carga de rotura, criterio clásico `
      + 'sin norma citada: la hipótesis no lo declara)';
}

// ── 4 · Cálculo mecánico por tramo ──────────────────────────────────────────

function seccionMecanica(tramos, conductor, hipotesis, indicadores) {
  const C = objeto(conductor);
  const H = objeto(hipotesis);
  if (!tramos.length) {
    return parrafo('<b>No evaluable:</b> no llegó ningún tramo de tensión calculado. '
      + 'Sin al menos dos estructuras con función declarada no hay tramo que tensar, y sin conductor '
      + 'ni hipótesis no hay tiros que calcular.');
  }

  const tMax = Number.isFinite(H.tempMax_C) ? `${n(H.tempMax_C, 0)} °C` : 'T máx';
  const tMin = Number.isFinite(H.tempMin_C) ? `${n(H.tempMin_C, 0)} °C` : 'T mín';

  const filas = tramos.map((t, i) => `<tr${t?.excede ? ' class="revisar"' : ''}>
    <td class="num">${n(t?.n ?? i + 1)}</td>
    <td>${esc(t?.desde ?? '')} → ${esc(t?.hasta ?? '')}</td>
    <td class="num">${n(t?.nVanos)}</td>
    <td class="num">${n(t?.vanoMax, 1)}</td>
    <td class="num">${n(t?.vir, 1)}</td>
    <td class="num">${n(t?.hEds)}</td>
    <td class="num">${n(t?.hTMax)}</td>
    <td class="num">${n(t?.hViento)}</td>
    <td class="num">${n(t?.hTMin)}</td>
    <td class="num">${n(t?.pctRts, 1)}</td>
    <td class="num">${n(t?.flechaMax, 2)}</td></tr>`);

  const excedidos = tramos.filter((t) => t?.excede === true);
  const tope = topeDeTiro(indicadores);
  const veredicto = excedidos.length
    ? `<p class="aviso"><b>Atención:</b> ${n(excedidos.length)} tramo(s) superan ${tope}: `
      + `${excedidos.map((t, i) => esc(String(t?.n ?? i + 1))).join(', ')}. `
      + 'El sistema señala el hecho; la decisión de aceptarlo, retensar o recalcular es del ingeniero.</p>'
    : parrafo(`Ningún tramo supera ${tope}.`);

  return parrafo('Cada tramo de tensión se calcula con SU vano ideal de regulación (VIR = √(Σa³/Σa)), '
    + 'nunca con uno único para toda la línea: el tiro es común dentro del tramo y cambia entre tramos.')
    + tabla({
      leyenda: `Estados mecánicos por tramo. Tiros en kgf${C.rts_kgf ? `, sobre una carga de rotura de ${n(C.rts_kgf)} kgf` : ''}. `
        + 'La flecha es la del vano más largo del tramo, por catenaria exacta.',
      cabecera: `<th class="num">#</th><th>Tramo</th><th class="num">Vanos</th>`
        + `<th class="num">Vano máx (m)</th><th class="num">VIR (m)</th>`
        + `<th class="num">EDS</th><th class="num">${esc(tMax)}</th><th class="num">Viento</th>`
        + `<th class="num">${esc(tMin)}</th><th class="num">% RTS</th><th class="num">Flecha (m)</th>`,
      filas,
      pie: NOTA_HUECO,
    }) + veredicto;
}

// ── 5 · Vano a vano ─────────────────────────────────────────────────────────

function seccionVanos(grupos) {
  if (!grupos.length) {
    return parrafo('<b>No evaluable:</b> no llegó el detalle vano a vano. '
      + 'La tabla de tramos basta para dimensionar, pero el que roza un árbol o una carretera es un '
      + 'vano concreto, casi nunca el promedio: sin esta tabla esa comprobación no está hecha.');
  }

  const bloques = grupos.map((g) => {
    const filas = g.filas.map((f, i) => `<tr${f?.fueraDeRango === true ? ' class="revisar"' : ''}>
      <td class="num">${n(f?.n ?? i + 1)}</td>
      <td class="num">${n(f?.a_m, 1)}</td>
      <td class="num">${n(f?.relVir, 2)}</td>
      <td class="num">${n(f?.flechaEds_m, 2)}</td>
      <td class="num">${n(f?.flechaTMax_m, 2)}</td>
      <td class="num">${n(f?.flechaTMin_m, 2)}</td>
      <td class="num">${n(f?.longitudConductor_m, 2)}</td>
      <td class="num">${n(f?.parametroC_m, 0)}</td></tr>`);
    return `<h3>${esc(g.titulo)}</h3>` + (filas.length ? tabla({
      leyenda: 'Un renglón por vano, en el orden de la línea. La flecha va por catenaria exacta; '
        + 'la longitud de conductor y el parámetro C son los del estado más desfavorable del tramo.',
      cabecera: '<th class="num">Vano</th><th class="num">a (m)</th><th class="num">a/VIR</th>'
        + '<th class="num">Flecha EDS (m)</th><th class="num">Flecha T máx (m)</th>'
        + '<th class="num">Flecha T mín (m)</th><th class="num">Conductor (m)</th><th class="num">C (m)</th>',
      filas,
      pie: NOTA_HUECO,
    }) : parrafo('Sin vanos en este tramo.'));
  });

  const fuera = grupos.reduce((s, g) => s + g.filas.filter((f) => f?.fueraDeRango === true).length, 0);
  // ⚠️ `fueraDeRango` es de TRES estados: `nucleo/vanos.js` devuelve `null`
  // cuando no hay VIR contra el que comparar, y su comentario ya avisa de que
  // «`false` diría que está dentro de rango». Contar solo los `true` y cerrar
  // con «todos dentro» convierte esos huecos en un aprobado — en el documento
  // que se firma, y contradiciendo al CSV del mismo exporte, que en esa misma
  // fila escribe «no evaluable». Camino real: un VIR ausente, o dos estructuras
  // capturadas sobre la misma coordenada (el «punto doble» que ya vigila
  // `exportar/calidad.js`).
  const sinVeredicto = grupos.reduce(
    (s, g) => s + g.filas.filter((f) => f?.fueraDeRango !== true && f?.fueraDeRango !== false).length, 0);

  const avisoFuera = fuera
    ? `<p class="aviso"><b>${n(fuera)} vano(s)</b> se apartan más de un 30 % del VIR de su tramo (marcados con ▲). `
      + 'El tiro común del tramo los representa peor que a los demás, y la desviación va por el lado malo: '
      + 'en el vano largo la flecha real sale MAYOR que la calculada, justo donde se decide el gálibo. '
      + 'Síntoma en campo: la distancia medida con cinta no coincide con la del informe, y siempre en el '
      + 'vano más largo.</p>'
    : '';

  const avisoSinVeredicto = sinVeredicto
    ? `<p class="aviso"><b>${n(sinVeredicto)} vano(s) NO tienen veredicto</b> sobre la banda del VIR: `
      + 'su tramo no trajo un vano ideal de regulación con el que comparar. No es que estén dentro — '
      + 'es que no se sabe, y sobre ellos este informe no afirma nada.</p>'
    : '';

  const cierre = (fuera || sinVeredicto)
    ? avisoFuera + avisoSinVeredicto
    : parrafo('Todos los vanos quedan dentro de la banda adoptada respecto al VIR de su tramo, '
      + 'de modo que el tiro común del tramo los representa a todos por igual.');

  return bloques.join('') + cierre;
}

// ── 6 · Carga sobre las estructuras ─────────────────────────────────────────
//
// Las tres secciones anteriores hablan del CONDUCTOR: cuánto tira, cuánto cuelga
// y en qué vano. Ésta habla del APOYO, que es de lo que responde quien firma un
// mantenimiento. Se separa a propósito y no se mete en la tabla de tramos: son
// dos preguntas distintas y mezclarlas obliga al lector a separarlas él.

function seccionCargas(cargas) {
  if (!cargas.length) {
    return parrafo('<b>No evaluable:</b> no llegó la carga sobre las estructuras. '
      + 'Este documento dice entonces cuánto tira el conductor, pero no qué recibe el apoyo — '
      + 'y un apoyo con el conductor dentro de umbral puede estar igualmente comprometido.');
  }

  const amplifican = cargas.filter((c) => c?.amplifica === true);
  const conUtil = cargas.filter((c) => Number.isFinite(c?.utilizacion_pct));
  const revisar = cargas.filter((c) => c?.estadoUtilizacion === 'revisar');

  // ⚠️ Las tres columnas de kgf salen del núcleo YA MULTIPLICADAS por el número
  // de conductores (`ftAngulo = 2·sen(α/2) · H · n`), mientras el párrafo de
  // arriba enuncia la fórmula POR CONDUCTOR. Sin el tiro y sin `n` a la vista,
  // quien revisara el informe con una calculadora obtenía un TERCIO de la cifra
  // impresa y no podía saber por qué (§ADR-013, hallazgo 4). Las dos columnas
  // ya existían en el CSV; faltaban justo en el documento que se firma.
  const filas = cargas.map((c) => `<tr${c?.estadoUtilizacion === 'revisar' ? ' class="revisar"' : ''}>
    <td class="num">${n(c?.n)}</td>
    <td><b>${esc(c?.apoyo)}</b></td>
    <td>${esc(c?.funcionEstructural ?? SIN_DATO)}</td>
    <td class="num">${Number.isFinite(c?.deflexion_grados) ? `${n(c.deflexion_grados, 1)}°` : SIN_DATO}</td>
    <td class="num">${Number.isFinite(c?.factorAngulo) ? `${n(c.factorAngulo, 3)} ×` : SIN_DATO}</td>
    <td class="num">${Number.isFinite(c?.tiro_kgf) ? n(c.tiro_kgf) : SIN_DATO}</td>
    <td class="num">${Number.isFinite(c?.nConductores) ? n(c.nConductores) : SIN_DATO}</td>
    <td class="num">${Number.isFinite(c?.ftAngulo_kgf) ? n(c.ftAngulo_kgf) : SIN_DATO}</td>
    <td class="num">${Number.isFinite(c?.ftViento_kgf) ? n(c.ftViento_kgf) : SIN_DATO}</td>
    <td class="num">${Number.isFinite(c?.ftTotal_kgf) ? n(c.ftTotal_kgf) : SIN_DATO}</td>
    <td class="num">${Number.isFinite(c?.utilizacion_pct) ? `${n(c.utilizacion_pct, 1)} %` : SIN_DATO}</td>
    <td>${sello(c?.estadoUtilizacion ?? 'no_evaluable')}</td></tr>`);

  // El hallazgo va ANTES de la tabla, en prosa: quien hojea el informe en una
  // reunión no va a ordenar una columna de veinticuatro filas para encontrarlo.
  const titular = amplifican.length
    ? `<b>${n(amplifican.length)} estructura(s) reciben MÁS carga transversal que la propia tensión `
      + `del conductor</b> (${amplifican.map((c) => esc(c?.apoyo)).join(', ')}). Ocurre por encima de `
      + '60° de quiebre, y ocurre SIEMPRE: es carga permanente, no depende del viento. Un apoyo así, '
      + 'dimensionado «por el tiro», está dimensionado por poco más de la mitad de lo que se le pide.'
    : 'Ninguna estructura supera el factor 1: en toda la línea el quiebre deja sobre el apoyo menos '
      + 'carga transversal que la propia tensión del conductor.';

  // ⚠️ «declara su carga de rotura» y «tiene veredicto» son DOS HECHOS DISTINTOS.
  // Este párrafo deducía el primero del segundo —si ninguna fila tenía veredicto,
  // afirmaba que ningún apoyo declaraba su capacidad— y eso es falso en cuanto un
  // apoyo declare su rotura y le falte la altura libre. Coincidía por casualidad
  // mientras el inventario estaba vacío del todo. Ahora cada hecho se cuenta por
  // su lado, porque el núcleo los publica sueltos.
  const conCapacidad = cargas.filter((c) => c?.capacidadDeclarada === true);
  const faltas = new Map();
  for (const c of cargas) {
    if (c?.utilizacion_pct !== null && c?.utilizacion_pct !== undefined) continue;
    for (const q of c?.faltaParaVeredicto ?? []) faltas.set(q, (faltas.get(q) ?? 0) + 1);
  }
  const detalleFaltas = [...faltas.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([q, k]) => `${q} en ${n(k)}`)
    .join(', ');

  const semaforo = `El semáforo de la última columna compara la utilización contra el `
    + `<b>${n(UMBRAL_UTILIZACION_PCT)} % adoptado</b>, que no es una norma citada sino un criterio de `
    + 'este proyecto: va escrito al pie de la tabla, porque un semáforo sin fuente es una opinión con '
    + 'colores.';
  const noSeEstima = 'No se estima: un apoyo que «cumple» contra una capacidad supuesta es un informe '
    + 'firmado sobre una suposición.';

  const capacidad = conUtil.length
    ? `<b>${n(conUtil.length)} de ${n(cargas.length)} apoyos</b> llevan veredicto`
      + `${revisar.length ? `; ${n(revisar.length)} pide(n) revisión` : ', y todos cumplen'}. `
      + `De los ${n(cargas.length)}, <b>${n(conCapacidad.length)} declaran su carga de rotura</b>`
      + `${detalleFaltas ? `; a los que siguen sin veredicto les falta ${detalleFaltas}` : ''}. `
      + semaforo
    : conCapacidad.length
      // El caso que antes mentía: hay capacidad declarada y aun así cero veredictos.
      ? `<b>${n(conCapacidad.length)} de ${n(cargas.length)} apoyos declaran su carga de rotura, y `
        + 'ninguno lleva veredicto.</b> El hueco NO está en la carga de rotura: falta '
        + `${detalleFaltas || 'otro dato del inventario'}. Corregir el inventario donde el hueco no `
        + `está no cambiará nada. ${noSeEstima}`
      : `<b>Ningún apoyo declara su carga de rotura</b>, así que ninguna fila lleva veredicto. La `
        + 'tabla dice cuánto se les está pidiendo; no puede decir cuánto aguantan. Falta inventario '
        + '—carga de rotura, altura libre y altura del punto de sujeción—, y hasta que llegue, el '
        + `estado correcto es «no evaluable». ${noSeEstima}`;

  return parrafo('En cada quiebre el conductor deja sobre el apoyo una resultante que vale '
    + '<b>2 · tiro · sen(ángulo/2)</b> por conductor; a 60° iguala la tensión y por encima la supera. '
    + 'A eso se suma el empuje del viento sobre el medio vano de cada lado.')
    + parrafo(titular)
    + parrafo(capacidad)
    + tabla({
      leyenda: 'Carga TRANSVERSAL sobre cada estructura. <b>Los kgf de las columnas Quiebre, Viento '
        + 'y Total son los de TODOS los conductores del apoyo</b> —la fórmula de arriba es por '
        + 'conductor, y la columna «Cond.» dice por cuántos se multiplicó—, de modo que la cifra se '
        + 'puede reproducir con una calculadora: Quiebre = Factor × Tiro × Cond. Los apoyos extremos '
        + 'no llevan fila calculada: su caso de carga dominante es el longitudinal, que este cálculo '
        + 'no evalúa.',
      cabecera: '<th class="num">#</th><th>Apoyo</th><th>Función</th><th class="num">Deflexión</th>'
        + '<th class="num">Factor</th><th class="num">Tiro (kgf)</th><th class="num">Cond.</th>'
        + '<th class="num">Quiebre (kgf)</th><th class="num">Viento (kgf)</th>'
        + '<th class="num">Total (kgf)</th><th class="num">Utilización</th><th>Estado</th>',
      filas,
      pie: 'La utilización compara MOMENTOS, no fuerzas: la carga por la altura a la que actúa contra '
        + `la rotura por la altura a la que se ensayó. ${CRITERIO_UTILIZACION} ${NOTA_HUECO}`,
    })
    // Lo que el motor supuso o no pudo resolver, agrupado y con sus apoyos. Sin
    // esto, el semáforo de la última columna salía sin decir contra qué se
    // comparó y la nota del núcleo «los cables de guarda NO están contados»
    // —que sí llega a la pantalla y al CSV— no aparecía en el papel firmado
    // (§ADR-013, hallazgos 4 y 11). El texto es del núcleo: no se reescribe.
    + observacionesDeFilas(cargas, 'Lo que el cálculo de la carga transversal supuso o no pudo '
      + 'resolver, y en qué apoyos. Escrito por el propio motor, no redactado a mano.');
}

// ── 7 · Carga longitudinal ──────────────────────────────────────────────────
//
// El OTRO eje. Va en sección propia y no como columnas de la anterior: son
// cargas sobre ejes distintos, y ninguna página de este informe debe invitar a
// sumarlas.

function seccionLongitudinal(filas) {
  if (!filas.length) {
    return parrafo('<b>No evaluable:</b> no llegó la carga longitudinal. La sección anterior dice '
      + 'cuánto empuja el apoyo de LADO; sin ésta el documento no dice cuánto tira a lo LARGO de '
      + 'la línea, que es el eje del que cuelga la retención y el que gobierna un terminal.');
  }

  const terminales = filas.filter((c) => c?.caso === 'terminal');
  const invierten = filas.filter((c) => c?.inversionResoluble === true);
  const dudosos = filas.filter((c) => c?.sentidoResoluble === false);
  const conUtil = filas.filter((c) => Number.isFinite(c?.utilizacion_pct));
  const revisar = filas.filter((c) => c?.estadoUtilizacion === 'revisar');

  const cuerpo = filas.map((c) => `<tr${c?.estadoUtilizacion === 'revisar' || c?.caso === 'terminal' ? ' class="revisar"' : ''}>
    <td class="num">${n(c?.n)}</td>
    <td><b>${esc(c?.apoyo)}</b></td>
    <td>${esc(CASO_LONGITUDINAL[c?.caso] ?? c?.caso ?? SIN_DATO)}</td>
    <td class="num">${Number.isFinite(c?.deflexion_grados) ? `${n(c.deflexion_grados, 1)}°` : SIN_DATO}</td>
    <td class="num">${Number.isFinite(c?.factorLongitudinal) ? n(c.factorLongitudinal, 3) : SIN_DATO}</td>
    <td class="num">${Number.isFinite(c?.flAdelanteMax_kgf) ? n(c.flAdelanteMax_kgf) : SIN_DATO}</td>
    <td class="num">${Number.isFinite(c?.flAtrasMax_kgf) ? n(c.flAtrasMax_kgf) : SIN_DATO}</td>
    <td class="num">${Number.isFinite(c?.roturaAtras_kgf) ? n(c.roturaAtras_kgf) : SIN_DATO}</td>
    <td class="num">${Number.isFinite(c?.roturaAdelante_kgf) ? n(c.roturaAdelante_kgf) : SIN_DATO}</td>
    <td class="num">${Number.isFinite(c?.utilizacion_pct)
      ? `${n(c.utilizacion_pct, 1)} %${Number.isFinite(c?.umbralAplicado_pct)
        ? ` / ${n(c.umbralAplicado_pct)} %` : ''}`
      : SIN_DATO}</td>
    <td>${sello(c?.estadoUtilizacion ?? 'no_evaluable')}</td></tr>`);

  const titular = terminales.length
    ? `<b>Los ${n(terminales.length)} apoyos terminales soportan el tiro ENTERO del conductor</b> `
      + `(${terminales.map((c) => esc(c.apoyo)).join(', ')}). En un terminal no hay nada al otro `
      + 'lado que compense: es el caso más severo de este eje, y no depende de ninguna diferencia '
      + 'entre tramos.'
    : 'Ningún apoyo de esta línea trabaja como terminal en el modelo recibido.';

  const inversion = invierten.length
    ? `<b>${n(invierten.length)} apoyo(s) tiran hacia LOS DOS LADOS</b> seg\u00fan la temperatura `
      + `(${invierten.map((c) => esc(c.apoyo)).join(', ')}): el sentido del desequilibrio se `
      + 'invierte entre estados, y los dos sentidos pesan más que el ruido del tendido de obra. Es '
      + 'lo que decide si un apoyo necesita retención a un lado o a los dos.'
    : 'Ningún apoyo invierte su sentido de forma afirmable: donde el cálculo da los dos sentidos, '
      + 'el menor no supera lo que pesaría una diferencia de tendido de obra.';

  // El veredicto de este eje —y sobre todo su AUSENCIA— se cuenta en prosa antes
  // de la tabla, igual que en la sección anterior: quien hojea el informe en una
  // reunión no va a recorrer veinticuatro filas para descubrir que la última
  // columna está entera en gris. Y se DERIVA de las filas: el día que el
  // inventario traiga la capacidad, el párrafo cambia solo.
  // ⚠️ DOS CUENTAS DISTINTAS, y confundirlas mete una afirmación FALSA sobre el
  // inventario del cliente en un documento firmado. «Declarar capacidad» se mira
  // en el APOYO; «llevar veredicto» es el resultado. Un apoyo puede declarar su
  // capacidad y no llevar veredicto por otra razón —falta el conteo de fases,
  // falta la altura de amarre, es una suspensión, es una derivación— y entonces
  // decir «ningún apoyo declara su capacidad» manda a corregir el inventario,
  // que es justo donde NO está el hueco. Es el patrón de frases que envejecen
  // mal que §ADR-014 tuvo que arreglar en cinco sitios, y se coló otra vez con
  // otro predicado (§ADR-017).
  const declaran = filas.filter((c) => c?.capacidadDeclarada === true);
  const sinVeredictoPeroDeclarada = declaran.length - conUtil.length;

  const capacidad = conUtil.length
    ? `<b>${n(conUtil.length)} de ${n(filas.length)} apoyos</b> llevan veredicto en este eje`
      + (declaran.length > conUtil.length
        ? `; ${n(declaran.length)} declaran su capacidad longitudinal, así que a `
          + `${n(sinVeredictoPeroDeclarada)} le(s) falta OTRA cosa —el motivo va en su fila, y no `
          + 'es el inventario de capacidades'
        : '')
      + `${revisar.length ? `. ${n(revisar.length)} pide(n) revisión` : ', y todos cumplen'}. `
      + 'El tope contra el que se compara <b>no es el mismo para todos</b>: depende del tipo de '
      + 'capacidad que se haya declarado, y por eso va impreso al lado de cada porcentaje.'
    : declaran.length
      ? `<b>${n(declaran.length)} de ${n(filas.length)} apoyos declaran su capacidad longitudinal, `
        + 'y aun así ninguno lleva veredicto</b>: falta otra pieza en cada uno, y el motivo va '
        + 'escrito en su fila. <b>El hueco NO está en el inventario de capacidades</b> — corregirlo '
        + 'ahí no cambiaría nada.'
      : '<b>Ningún apoyo declara su capacidad longitudinal</b>, así que ninguna fila lleva veredicto '
        + 'en este eje. La tabla dice cuánto se le está pidiendo a cada estructura a lo largo de la '
        + 'línea; no puede decir cuánto aguanta. El porqué, con las palabras del propio motor, va al '
        + 'pie de la tabla — y no se estima: un apoyo que «cumple» contra una capacidad supuesta es '
        + 'un informe firmado sobre una suposición.';

  return parrafo('El desequilibrio de un anclaje es la <b>diferencia</b> de los tiros de sus dos '
    + 'tramos, proyectada sobre el eje de la línea; en un apoyo de suspensión vale cero porque la '
    + 'tensión es común a los dos lados. <b>Estas cifras NO se suman con las de la sección '
    + 'anterior:</b> son cargas sobre ejes distintos.')
    + parrafo(titular)
    + parrafo(inversion)
    + parrafo(capacidad)
    + (dudosos.length ? parrafo(`<b>Aviso:</b> en ${n(dudosos.length)} apoyo(s) el número sale pero `
      + 'el SENTIDO no es concluyente — queda por debajo de lo que pesaría una diferencia de '
      + 'tendido de obra, así que en el terreno podría apuntar al lado contrario.') : '')
    + tabla({
      leyenda: 'Carga longitudinal por conductor, CON SIGNO: «adelante» es hacia el apoyo siguiente. '
        + 'La rotura de conductor es caso ACCIDENTAL y se publica SIN veredicto: este proyecto no ha '
        + 'adoptado criterio de aceptación para ella. La <b>utilización</b> compara MOMENTOS —la '
        + 'carga por la altura a la que amarra el conductor, contra la capacidad por la altura a la '
        + 'que fue declarada—, y su segunda cifra es el tope aplicado.',
      cabecera: '<th class="num">#</th><th>Apoyo</th><th>Caso</th><th class="num">Deflexión</th>'
        + '<th class="num">cos(α/2)</th><th class="num">Adelante (kgf)</th><th class="num">Atrás (kgf)</th>'
        + '<th class="num">Rotura atrás (kgf)</th><th class="num">Rotura adelante (kgf)</th>'
        + '<th class="num">Utilización</th><th>Estado</th>',
      filas: cuerpo,
      // El texto del criterio NO se escribe aquí: se importa del núcleo. Y cuál
      // de los dos se imprime lo deciden los datos — el criterio de comparación
      // cuando hay algo comparado, y el motivo de la negativa cuando no lo hay.
      pie: `El mayor desequilibrio NO ocurre en el estado de mayor tiro: el tiro máximo es a mínima `
        + `temperatura, pero la mayor diferencia entre tramos es a MÁXIMA. `
        + `${conUtil.length ? CRITERIO_UTILIZACION_LONGITUDINAL : CRITERIO_CAPACIDAD_LONGITUDINAL} `
        + `${NOTA_HUECO}`,
    })
    // El criterio de cada apoyo CON veredicto viaja con las observaciones, que
    // ya agrupan por texto idéntico: así el papel dice de dónde salió el número
    // —qué capacidad, de qué tipo, a qué altura y de qué fuente— sin repetir
    // veinticuatro veces la misma frase. Un número sin origen no es firmable.
    + observacionesDeFilas(
      filas.map((c) => (c?.criterioUtilizacion
        ? { ...c, notas: [...lista(c?.notas), c.criterioUtilizacion] } : c)),
      'Lo que el cálculo del eje longitudinal supuso o no pudo resolver, '
      + 'y en qué apoyos. Escrito por el propio motor, no redactado a mano.');
}

/**
 * Los motivos y supuestos que el núcleo escribió POR FILA. La usan las DOS
 * secciones de carga —la transversal y la longitudinal—, porque el agujero era
 * el mismo en las dos: la tabla pinta columnas de números y ninguna es el
 * motivo, así que el papel firmado se quedaba sin lo que el propio motor había
 * escrito. Dos ejemplos reales de lo que se perdía:
 *
 * · en el eje LONGITUDINAL, el aviso del PISO DE VALIDEZ — cuando un tramo
 *   contiguo cae por debajo del 25 % de su propio EDS, el desequilibrio lo
 *   domina un tramo prácticamente flojo EN EL MODELO, y el propio núcleo lo
 *   llama «numéricamente el mismo fallo que un hueco convertido en cero, pero
 *   que entra por un número calculado»;
 * · en el TRANSVERSAL, «los cables de guarda NO están contados», que deja la
 *   carga corta justo en los apoyos más cargados.
 *
 * Los dos llegaban al CSV y a la pantalla, y ninguno al informe (§ADR-013).
 *
 * Se agrupan por texto idéntico, igual que en la pantalla: veinticuatro veces el
 * mismo párrafo tapa a las tres filas que dicen algo distinto.
 */
function observacionesDeFilas(filas, leyenda) {
  const grupos = new Map();
  for (const f of filas) {
    for (const [texto, esMotivo] of [
      ...(f?.noEvaluable ? [[f.noEvaluable, true]] : []),
      ...lista(f?.notas).map((x) => [x, false]),
    ]) {
      const limpio = String(texto ?? '').trim();
      if (!limpio) continue;
      const clave = (esMotivo ? 'X·' : 'N·') + limpio;
      if (grupos.has(clave)) grupos.get(clave).apoyos.push(f.apoyo);
      else grupos.set(clave, { texto: limpio, esMotivo, apoyos: [f.apoyo] });
    }
  }
  if (!grupos.size) return '';

  const orden = [...grupos.values()]
    .sort((a, b) => Number(b.esMotivo) - Number(a.esMotivo) || a.apoyos.length - b.apoyos.length);

  return tabla({
    leyenda,
    cabecera: '<th>Apoyos</th><th>Observación</th>',
    filas: orden.map((g) => `<tr><td>${esc(g.apoyos.length > 4
      ? `${n(g.apoyos.length)} apoyos` : g.apoyos.join(', '))}</td>
      <td>${g.esMotivo ? '<b>Sin carga calculada:</b> ' : ''}${esc(g.texto)}</td></tr>`),
    pie: NOTA_HUECO,
  });
}

const CASO_LONGITUDINAL = {
  terminal: 'terminal — tiro entero',
  desequilibrio: 'anclaje — diferencia',
  suspension: 'suspensión — cero del modelo',
  no_evaluable: 'no evaluable',
};

// ── 8 · Umbrales ────────────────────────────────────────────────────────────

function seccionUmbrales(indicadores) {
  if (!indicadores.length) {
    return parrafo('<b>No evaluable:</b> no llegó ninguna evaluación de umbrales. '
      + 'Sin ella este documento describe la línea pero no la juzga contra ningún criterio.');
  }

  const umbralTexto = (u, comp) => {
    if (u == null) return SIN_DATO;
    if (Array.isArray(u)) return `${n(u[0], 1)} – ${n(u[1], 1)}`;
    return `${comp === '<=' ? '≤ ' : comp === '>=' ? '≥ ' : ''}${n(u, 1)}`;
  };

  const filas = indicadores.map((i) => `<tr${i?.estado === 'revisar' ? ' class="revisar"' : ''}>
    <td><b>${esc(i?.etiqueta)}</b></td>
    <td class="num">${Number.isFinite(i?.valor) ? `${n(i.valor, 1)}${i?.unidad ? ` ${esc(i.unidad)}` : ''}` : SIN_DATO}</td>
    <td class="num">${esc(umbralTexto(i?.umbral, i?.comparador))}</td>
    <td>${sello(i?.estado)}</td>
    <td>${esc(i?.criterio)}<br><span class="nota">${esc(i?.fuente)}</span></td></tr>`);

  return parrafo('Cada criterio declara SU FUENTE. Un semáforo sin fuente es una opinión con colores. '
    + 'Ninguno de los estados se llama «incumple»: el sistema señala, dictamina quien firma.')
    + tabla({
      leyenda: 'Estado de la línea frente a los criterios adoptados. «No evaluable» no es un fallo de la '
        + 'aplicación: es un hecho sobre los datos disponibles.',
      cabecera: '<th>Indicador</th><th class="num">Valor</th><th class="num">Umbral</th>'
        + '<th>Estado</th><th>Criterio y fuente</th>',
      filas,
      pie: `Marcas: ● cumple · ▲ revisar · ○ no evaluable. ${NOTA_HUECO}`,
    });
}

// ── 9 · Cantidades ──────────────────────────────────────────────────────────

function seccionCantidades(cantidades) {
  const continuas = lista(cantidades.continuas);
  const discretas = lista(cantidades.discretas);
  const avisos = lista(cantidades.avisos);

  if (!continuas.length && !discretas.length && !avisos.length) {
    return parrafo('<b>No evaluable:</b> no llegó memoria de cantidades. '
      + 'Sin geometría válida no hay nada que cuantificar, y un listado de compra inventado es peor que '
      + 'no tener listado: el error se descubre con el carrete ya en la vía.');
  }

  const tContinuas = tabla({
    leyenda: 'Cantidades que se miden en unidades continuas (metros de conductor, de guarda, de eje).',
    cabecera: '<th>Concepto</th><th class="num">Cantidad</th><th>Unidad</th><th>Sobre qué base</th><th>Procedencia</th>',
    filas: continuas.map((c) => `<tr>
      <td>${esc(c?.concepto)}</td><td class="num">${n(c?.cantidad, 2)}</td><td>${esc(c?.unidad)}</td>
      <td>${esc(c?.base)}</td><td>${esc(c?.procedencia)}</td></tr>`),
    pie: NOTA_HUECO,
  });

  const tDiscretas = tabla({
    leyenda: 'Cantidades que se cuentan por unidades (apoyos por función estructural).',
    cabecera: '<th>Concepto</th><th class="num">Cantidad</th><th>Unidad</th><th>Procedencia</th>',
    filas: discretas.map((d) => `<tr>
      <td>${esc(d?.concepto)}</td><td class="num">${n(d?.cantidad)}</td><td>${esc(d?.unidad)}</td>
      <td>${esc(d?.procedencia)}</td></tr>`),
  });

  const tAvisos = tabla({
    leyenda: 'Renglones que NO se pudieron cuantificar y por qué. Una casilla vacía se ve; '
      + 'un número inventado no.',
    cabecera: '<th>Concepto</th><th>Por qué no se cuantificó</th>',
    filas: avisos.map((a) => `<tr><td><b>${esc(a?.concepto)}</b></td><td>${esc(a?.motivo)}</td></tr>`),
  });

  return parrafo('Aquí solo se cuantifica lo que se deduce de la GEOMETRÍA levantada. '
    + 'No se redondea al alza ni se agrega desperdicio no declarado: redondear un carrete es una '
    + 'decisión de compra, no de geometría, y se toma después, con nombre y firma.')
    + tContinuas + tDiscretas + tAvisos;
}

// ── 10 · Expediente de falla ─────────────────────────────────────────────────

function seccionExpediente(investigaciones, lev) {
  const nombreDelApoyo = (ev) => {
    // El expediente apunta al apoyo por su UUID inmutable, nunca por «E07».
    // Si el punto no está en este levantamiento se dice, en vez de rellenar con
    // el primero que se le parezca.
    const p = lev.puntos.find((x) => x?.id === ev?.apoyoId || x?.apoyoId === ev?.apoyoId);
    return p?.nombre ?? null;
  };

  return investigaciones.map((ev) => {
    const E = objeto(ev);
    const donde = nombreDelApoyo(E);
    const cabecera = `<h3>${esc(donde ?? 'Estructura no identificada en este levantamiento')}`
      + `${E.placa ? ` — placa ${esc(E.placa)}` : ''}</h3>`
      + parrafo([E.fechaTexto ?? E.ocurrioEn, E.componenteAfectado].filter(Boolean).map(esc).join(' · '));

    const cronologia = tabla({
      leyenda: 'Cronología: lo que se hizo y cuándo, según el registro de campo.',
      cabecera: '<th>Cuándo</th><th>Qué</th>',
      filas: lista(E.cronologia).map((c) => `<tr><td>${esc(c?.cuando)}</td><td>${escRico(c?.que)}</td></tr>`),
    });

    const observaciones = tabla({
      leyenda: 'Lo que se VE en la evidencia. NO son conclusiones: las conclusiones van en el bloque '
        + 'siguiente, con su grado de certeza declarado.',
      cabecera: '<th>Severidad</th><th>Observación</th><th>Detalle</th>',
      filas: lista(E.observaciones).map((o) => `<tr${o?.severidad === 'critica' ? ' class="revisar"' : ''}>
        <td>${esc(o?.severidad)}</td><td><b>${esc(o?.titulo)}</b></td><td>${escRico(o?.detalle)}</td></tr>`),
    });

    const hipotesis = tabla({
      leyenda: 'Lo que se CONCLUYE, ordenado por verosimilitud. Cada hipótesis declara en qué se apoya, '
        + 'para que se pueda discutir el razonamiento y no solo el veredicto.',
      cabecera: '<th class="num">#</th><th>Hipótesis</th><th>Verosimilitud</th><th>Sustento</th>',
      filas: lista(E.hipotesis).map((h, k) => `<tr>
        <td class="num">${n(k + 1)}</td><td><b>${esc(h?.enunciado)}</b></td>
        <td>${esc(h?.verosimilitud)}</td><td>${escRico(h?.sustento)}</td></tr>`),
    });

    const pendientes = lista(E.verificacionesPendientes);
    const sinCerrar = pendientes.filter((v) => v?.estado !== 'recibido').length;
    const verificaciones = tabla({
      leyenda: `Verificaciones que cerrarían o descartarían las hipótesis. ${n(sinCerrar)} de `
        + `${n(pendientes.length)} sin resolver: esta lista es lo que separa un informe defendible de `
        + 'uno que solo suena convincente.',
      cabecera: '<th>Qué se necesita</th><th>Por qué</th><th>Estado</th>',
      filas: pendientes.map((v) => `<tr${v?.estado !== 'recibido' ? ' class="revisar"' : ''}>
        <td><b>${escRico(v?.que)}</b></td><td>${escRico(v?.porQue)}</td>
        <td>${esc(String(v?.estado ?? '').replace('_', ' '))}</td></tr>`),
    });

    return `<div class="bloque">${cabecera}</div>${cronologia}${observaciones}${hipotesis}${verificaciones}
      <p class="aviso"><b>Este expediente no es un dictamen firmado.</b> Es el razonamiento documentado
      con la evidencia disponible hoy; las hipótesis se cierran con las verificaciones de arriba.
      ${E.cerrada ? 'La investigación figura como CERRADA en el sistema.' : 'La investigación sigue ABIERTA.'}</p>`;
  }).join('');
}

// ── 11 · Lo que este informe no demuestra ────────────────────────────────────

/** El título exacto de la sección. Se exporta para que nadie lo reescriba a mano. */
export const TITULO_LIMITACIONES = 'Lo que este informe NO demuestra';

/**
 * Reúne, en un solo sitio, todo lo que este documento NO puede sostener.
 *
 * No se redacta a mano: se DERIVA de los mismos datos que produjeron las
 * cifras. Por eso no se puede quedar desactualizada — el día que llegue la
 * ficha del fabricante, su limitación desaparece sola del informe siguiente.
 *
 * Se exporta aparte para que la aplicación pueda mostrar esta lista ANTES de
 * generar el PDF: enterarse de lo que falta después de imprimir y repartir es
 * enterarse tarde.
 *
 * @param {Object} [entrada] la misma que recibe `informeHtml`
 * @returns {{titulo:string, detalle:string, origen:string}[]}
 */
export function limitacionesDeclaradas(entrada) {
  const e = objeto(entrada);
  const lev = levSeguro(e.lev);
  const meta = objeto(e.meta);
  const H = objeto(e.hipotesis);
  const C = objeto(e.conductor);
  const out = [];
  const add = (titulo, detalle, origen) => out.push({ titulo, detalle, origen });

  // 1 · Lo que declaró a mano quien genera. Se acepta texto suelto u objeto.
  for (const l of lista(meta.limitaciones)) {
    if (typeof l === 'string') add('Limitación declarada', l, 'declarada al generar el informe');
    else add(objeto(l).titulo ?? 'Limitación declarada', objeto(l).detalle ?? '', 'declarada al generar el informe');
  }

  // 2 · Reproducibilidad: sin versión del motor, este papel no se puede repetir.
  if (!(meta.versionNucleo ?? meta.versionMotor)) {
    add('No se declaró la versión del motor de cálculo',
      'Sin saber con qué versión de @lineas/nucleo se produjeron estas cifras, el informe no es '
      + 'reproducible: dentro de tres años nadie podrá regenerarlo igual y comprobar que no cambió nada.',
      'procedencia del cálculo');
  }

  // 3 · Hipótesis: sin ella no hay cálculo, y sin congelar no hay informe estable.
  if (!H.nombre) {
    add('No se declaró la hipótesis de cálculo',
      'Temperaturas, viento y EDS son la mitad del resultado. Sin declararlas, los tiros y las flechas '
      + 'de este documento no significan nada concreto.', 'hipótesis de cálculo');
  } else if (H.congelada !== true) {
    add('La hipótesis de cálculo no está congelada',
      `«${H.nombre}» todavía se puede editar. Si se edita, estas cifras dejan de corresponder al documento `
      + 'impreso sin que nada lo avise. Antes de firmar hay que congelarla.', 'hipótesis de cálculo');
  }
  if (H.procedencia === 'supuesto') {
    add('La hipótesis es un supuesto, no un dato verificado',
      'Se arrastra marcada como «supuesto»: nadie la verificó contra norma ni contra registro climático.',
      'hipótesis de cálculo');
  }
  if (!H.normaReferencia) {
    add('No se declaró norma de referencia',
      'Los umbrales que se aplican son criterios adoptados por el proyecto, no artículos citables. '
      + 'Se pueden discutir, que es justo la intención — pero no se pueden invocar como norma.',
      'criterios de evaluación');
  }

  // 4 · Conductor: el dato de catálogo genérico y el de la ficha real no valen igual.
  if (!C.codigo) {
    add('No se declaró el conductor',
      'Sin masa lineal, sección, módulo elástico y carga de rotura no hay cálculo mecánico: '
      + 'lo que queda es geometría.', 'datos del conductor');
  } else {
    if (C.procedencia === 'supuesto' || C.procedencia == null) {
      add('Los datos del conductor no están confirmados',
        `El conductor ${C.codigo} se arrastra con procedencia «${C.procedencia ?? 'no declarada'}». `
        + 'La diferencia entre un valor de catálogo genérico y uno de la ficha del proveedor real ya ha '
        + 'decidido, en una línea de este tipo, si un tramo cumple o no.', 'datos del conductor');
    }
    if (C.moduloEs === 'no_declarado' || C.moduloEs == null) {
      add('No se declaró si el módulo elástico es INICIAL o FINAL',
        'La fluencia del conductor depende de ello: con el módulo inicial la flecha calculada sale menor '
        + 'que la que tendrá la línea al cabo de los años, y la flecha es lo que decide el gálibo.',
        'datos del conductor');
    }
  }

  // 5 · Altimetría: es la limitación que más informes ha tumbado.
  const precisiones = lev.puntos.map((p) => p?.precision_m).filter((x) => Number.isFinite(x));
  const cotas = lev.puntos.filter((p) => Number.isFinite(p?.cota_m)).length;
  if (precisiones.length && Math.max(...precisiones) >= 1) {
    add(`Las cotas del terreno tienen precisión declarada de ±${n(Math.max(...precisiones), 1)} m`,
      'El error vertical del GPS es del mismo orden que el gálibo que habría que demostrar. '
      + 'Las cotas sirven de referencia, NO de evidencia: este informe no verifica distancias de '
      + 'seguridad al terreno. Eso se cierra con topografía o LiDAR, no con este documento.',
      'precisión del levantamiento');
  }
  if (!cotas && lev.puntos.length) {
    add('No hay cotas de terreno en el levantamiento',
      'Sin perfil del terreno no se puede calcular ningún gálibo ni ningún vano peso real.',
      'precisión del levantamiento');
  }
  if (!lev.puntos.some((p) => Number.isFinite(p?.cotaSujecion_m))) {
    add('No se levantó la cota del punto de sujeción del conductor',
      'La cota del GPS es la del TERRENO al pie del apoyo, no la del punto donde cuelga el conductor. '
      + 'Sin esa segunda cota, el vano peso y el desnivel real de cada vano quedan sin verificar.',
      'precisión del levantamiento');
  }

  // 6 · Cada criterio que no se pudo evaluar, con su propio motivo.
  for (const i of lista(e.indicadores)) {
    if (i?.estado !== 'no_evaluable') continue;
    add(`Criterio sin evaluar: ${i?.etiqueta ?? i?.id ?? 'sin etiqueta'}`,
      String(i?.criterio ?? 'no se declaró el motivo.'), 'umbrales y criterios');
  }

  // 7 · Cada renglón de la memoria de cantidades que no se pudo cuantificar.
  for (const a of lista(objeto(e.cantidades).avisos)) {
    add(`Cantidad no cuantificada: ${a?.concepto ?? 'sin concepto'}`,
      String(a?.motivo ?? 'no se declaró el motivo.'), 'memoria de cantidades');
  }

  // 8 · Los hallazgos de calidad que sí comprometen lo que el informe afirma.
  const calidad = lista(e.calidad ?? calidadLevantamiento(lev));
  for (const h of calidad) {
    if (h?.severidad !== 'atencion') continue;
    add(`Calidad del levantamiento: ${h?.titulo ?? ''}`, String(h?.detalle ?? ''), 'calidad del levantamiento');
  }

  // 9 · Los vanos que el tiro común del tramo representa peor.
  const fuera = gruposDeVanos(e.vanos)
    .reduce((s, g) => s + g.filas.filter((f) => f?.fueraDeRango === true).length, 0);
  // Los vanos SIN veredicto también son una limitación: el informe no puede
  // decir de ellos que cumplen, y hasta hoy ni los contaba ni los declaraba.
  const vanosSinVeredicto = gruposDeVanos(e.vanos)
    .reduce((s, g) => s + g.filas.filter((f) => f?.fueraDeRango !== true && f?.fueraDeRango !== false).length, 0);
  if (vanosSinVeredicto) {
    add(`${n(vanosSinVeredicto)} vano(s) sin veredicto sobre la banda del VIR`,
      'Su tramo no trajo un vano ideal de regulación con el que comparar, así que no se sabe si el '
      + 'tiro común del tramo los representa bien. No están dentro de la banda: están sin evaluar.',
      'cálculo mecánico');
  }
  if (fuera) {
    add(`${n(fuera)} vano(s) quedan fuera de la banda adoptada respecto al VIR de su tramo`,
      'En esos vanos el tiro común del tramo los representa peor que a los demás, y la desviación va por '
      + 'el lado inseguro: la flecha real del vano largo sale MAYOR que la calculada.', 'cálculo mecánico');
  }

  // 10 · La estructura. Es la limitación más grande que hoy arrastra el informe,
  // y la que menos se ve: las tablas de arriba pueden estar todas en verde y no
  // haber dicho una palabra sobre si el apoyo aguanta lo que se le está pidiendo.
  const cargas = lista(e.cargas);
  const longitudinal = lista(e.longitudinal);

  // ⚠️ Cuántas filas del eje longitudinal tienen VEREDICTO. Se cuenta UNA vez y
  // gobierna los TRES párrafos de esta sección que hablan de ese eje. Los tres
  // eran texto fijo que afirmaba, sin condición, que no hay veredicto — cierto
  // hoy, y falso el mismo día que un apoyo declare su capacidad longitudinal. Es
  // literalmente el fallo que §ADR-014 tuvo que arreglar en cinco sitios: el
  // informe afirmando en su última página lo que su propia tabla desmiente dos
  // páginas antes. Se derivan de los datos y dejan de envejecer.
  const longConVeredicto = longitudinal.filter((c) => Number.isFinite(c?.utilizacion_pct));
  const longSinVeredicto = longitudinal.length - longConVeredicto.length;

  if (!cargas.length) {
    add('No se evaluó la carga sobre las estructuras',
      'Este documento verifica el CONDUCTOR —tiro, flecha, vano—, no el APOYO. Un conductor dentro '
      + 'de umbral puede estar colgado de una estructura comprometida, y este informe no lo diría.',
      'carga sobre las estructuras');
  } else {
    const sinCapacidad = cargas.filter((c) => Number.isFinite(c?.ftTotal_kgf)
      && !Number.isFinite(c?.utilizacion_pct));
    if (sinCapacidad.length) {
      add(`${n(sinCapacidad.length)} apoyo(s) tienen su carga calculada pero NO su capacidad declarada`,
        'Se sabe cuánto se les está pidiendo; no se sabe cuánto aguantan, así que este informe no '
        + 'dictamina sobre ellos. Faltan tres datos de inventario por apoyo: carga de rotura, altura '
        + 'libre sobre el terreno y altura del punto de sujeción. No se estiman — un apoyo que '
        + '«cumple» contra una capacidad supuesta es exactamente el error que este sistema existe '
        + 'para no cometer.', 'carga sobre las estructuras');
    }

    const sinCarga = cargas.filter((c) => !Number.isFinite(c?.ftTotal_kgf) && c?.esExtremo !== true);
    if (sinCarga.length) {
      add(`${n(sinCarga.length)} estructura(s) intermedias sin carga calculable`,
        `${sinCarga.map((c) => String(c?.apoyo ?? '')).filter(Boolean).join(', ')}. El motivo va en `
        + 'su fila de la tabla: sin el ingrediente que falta, el número saldría inventado con '
        + 'unidades correctas, que es la peor clase de error porque no se ve.',
        'carga sobre las estructuras');
    }

    // ⚠️ El TÍTULO y el CUERPO de estos dos límites se bifurcan JUNTOS. Cuando
    // se añadió la sección longitudinal se bifurcó solo el título y el cuerpo
    // se quedó enumerando el eje longitudinal entre los no evaluados —en la
    // misma página en que ese eje ya venía publicado, dos secciones antes—; y
    // el límite de los extremos seguía diciendo que su verificación «está
    // pendiente». No falsea ninguna cifra, pero desafina justo en la única
    // sección cuyo valor entero es ser exacta sobre el alcance (§ADR-013,
    // hallazgo 16).
    const extremos = cargas.filter((c) => c?.esExtremo === true);
    if (extremos.length) {
      const nombresExtremos = extremos.map((c) => String(c?.apoyo ?? '')).filter(Boolean).join(' y ');
      add(extremos.length === 1
        ? 'El apoyo extremo no está verificado en la carga transversal'
        : `Los ${n(extremos.length)} apoyos extremos no están verificados en la carga transversal`,
        `${nombresExtremos}: un extremo no tiene deflexión definida y su caso de carga dominante es `
        + 'el LONGITUDINAL —el conductor tirando en la dirección de la línea sin nada que lo '
        + 'compense al otro lado—, que es otro eje. ' + (longitudinal.length
          ? 'Esa carga longitudinal SÍ se calcula y se publica en la sección 7 de este informe, '
            + (longConVeredicto.length
              ? `con veredicto en ${n(longConVeredicto.length)} de ${n(longitudinal.length)} `
                + 'apoyos —los que declaran su capacidad para ese eje—. Que no tengan fila en esta '
                + 'tabla no significa que estén holgados en ésta.'
              : 'pero SIN veredicto: falta la capacidad declarada para ese eje. Que no tengan fila '
                + 'en esta tabla no significa que estén holgados.')
          : 'Que no tengan fila no significa que estén holgados: significa que su verificación es '
            + 'otra y está pendiente.'),
        'carga sobre las estructuras');
    }

    // Va SIEMPRE que haya tabla de cargas, aunque todo lo demás esté completo:
    // es el límite del método, no un problema de estos datos.
    add(longitudinal.length
      ? 'La carga VERTICAL (vano peso) sigue sin evaluarse'
      : 'Solo se evaluó la carga TRANSVERSAL',
      longitudinal.length
        ? 'La vertical (vano peso) depende de la cota del punto de sujeción, que no está levantada, '
          + 'así que este informe no dice nada de ella. La LONGITUDINAL sí se calculó y se publica '
          + 'en la sección 7, ' + (longConVeredicto.length
            ? `con veredicto en ${n(longConVeredicto.length)} de ${n(longitudinal.length)} apoyos`
              + `${longSinVeredicto ? `; los otros ${n(longSinVeredicto)} siguen sin veredicto` : ''}`
              + '. '
            : 'pero sin veredicto: hay cifras, no dictamen. ')
          + 'Los tres ejes no se suman entre sí, y un apoyo con la transversal holgada puede estar '
          + 'comprometido en cualquiera de los otros dos.'
        : 'La vertical (vano peso) depende de la cota del punto de sujeción, que no está levantada; '
          + 'la longitudinal es el desequilibrio de tiros entre tramos contiguos y la rotura de '
          + 'conductor. Son otros ejes y no se suman a estas cifras. Un apoyo con la transversal '
          + 'holgada puede estar comprometido en cualquiera de los dos.',
      'carga sobre las estructuras');
  }

  // 10b · El eje longitudinal, cuando se evaluó: lo que ese eje TAMPOCO demuestra.
  if (longitudinal.length) {
    const dudosos = longitudinal.filter((c) => c?.sentidoResoluble === false);
    if (dudosos.length) {
      add(`${n(dudosos.length)} apoyo(s) con carga longitudinal cuyo SENTIDO no es concluyente`,
        'Su desequilibrio calculado queda por debajo de lo que pesaría una diferencia de tendido '
        + 'de obra del 1 % de la carga de rotura. El valor se publica; el sentido no se afirma, '
        + 'porque en el terreno podría apuntar al lado contrario.', 'carga longitudinal');
    }

    // El PISO DE VALIDEZ. El núcleo lo escribe en la nota de la fila y él mismo
    // lo llama «numéricamente el mismo fallo que un hueco convertido en cero,
    // pero que entra por un número CALCULADO»: la cifra sale limpia y lo que la
    // domina es un tramo que en el MODELO está prácticamente flojo. Un límite
    // así pertenece a esta sección, no solo al pie de una tabla.
    const flojos = longitudinal.filter((c) =>
      lista(c?.notas).some((x) => /prácticamente flojo EN EL MODELO/i.test(String(x))));
    if (flojos.length) {
      add(`${n(flojos.length)} apoyo(s) con un lado que se derrumba EN EL MODELO`,
        `${flojos.map((c) => String(c?.apoyo ?? '')).filter(Boolean).join(', ')}: en alguno de los `
        + 'estados evaluados, uno de sus dos tramos baja por debajo del 25 % de su propio EDS. Por '
        + 'debajo de ese piso el modelo de cambio de estado y el supuesto de tensión común dejan de '
        + 'ser fiables, así que ese desequilibrio lo domina un tramo flojo en el modelo, no en el '
        + 'terreno. La cifra se publica; sostenerla exige comprobar el tendido real.',
        'carga longitudinal');
    }

    // Y las filas que no dieron número: el informe muestra guiones y la
    // etiqueta, pero el POR QUÉ solo estaba en la tabla — mientras que para la
    // carga transversal sí se cuenta y se nombra unas líneas más arriba.
    const sinNumero = longitudinal.filter((c) => c?.caso === 'no_evaluable' || c?.noEvaluable);
    if (sinNumero.length) {
      add(`${n(sinNumero.length)} fila(s) del eje longitudinal sin número`,
        `${sinNumero.map((c) => String(c?.apoyo ?? '')).filter(Boolean).join(', ')}. El motivo de `
        + 'cada una va escrito bajo la tabla de la sección 7, con las palabras del propio motor. '
        + 'Un guion ahí no es un cero: es un apoyo del que este informe no afirma nada en ese eje.',
        'carga longitudinal');
    }
    add('El desequilibrio longitudinal supone que todos los tramos se tensaron IGUAL',
      'La hipótesis de la línea declara un solo porcentaje de tendido, así que el modelo tensa '
      + 'todos los tramos al mismo valor a la misma temperatura. Lo que sale es el desequilibrio '
      + 'que produce la GEOMETRÍA, no el que dejó el tendido real de obra: en el estado de cada '
      + 'día vale cero exacto por construcción, y eso es un cero del modelo, no una medición.',
      'carga longitudinal');
    // El título y el cuerpo salen del CONTEO, no de una frase escrita hace tres
    // versiones, y el motivo es el del propio núcleo — aquí estaba copiado a
    // mano, que es como el papel firmado y la pantalla acaban divergiendo. Si un
    // día ningún apoyo se queda sin veredicto, esta limitación desaparece sola:
    // una lista de límites que enumera un hueco ya tapado desacredita a los que
    // siguen abiertos.
    if (longSinVeredicto) {
      add(longConVeredicto.length
        ? `${n(longSinVeredicto)} de ${n(longitudinal.length)} apoyos siguen sin veredicto en el `
          + 'eje longitudinal'
        : 'Ningún apoyo tiene veredicto en el eje longitudinal',
        `${CRITERIO_CAPACIDAD_LONGITUDINAL} El motivo de cada fila va escrito bajo la tabla de la `
        + 'sección 7, con las palabras del propio motor.', 'carga longitudinal');
    }
    add('La rotura de conductor se publica SIN criterio de aceptación',
      'Es caso ACCIDENTAL: se da la fuerza y sus dos componentes, pero este proyecto no ha '
      + 'adoptado ningún tope contra el que compararla, y las normas que lo tratan aplican '
      + 'factores de carga propios que no se pueden inventar. Además solo se resuelve en apoyos '
      + 'que ANCLAN: en los de suspensión depende de la cadena y de los apoyos vecinos, que este '
      + 'sistema no captura.', 'carga longitudinal');
  }

  // 11 · Lo que un expediente de falla todavía no puede afirmar.
  for (const ev of lista(e.investigaciones)) {
    for (const v of lista(objeto(ev).verificacionesPendientes)) {
      if (v?.estado === 'recibido') continue;
      add(`Verificación pendiente del expediente: ${v?.que ?? ''}`,
        `${v?.porQue ?? ''} Estado: ${String(v?.estado ?? 'pendiente').replace('_', ' ')}.`,
        'expediente de falla');
    }
  }

  return out;
}

function seccionLimites(entrada) {
  const limites = limitacionesDeclaradas(entrada);

  // El alcance NO es una limitación derivada de los datos: es lo que este
  // documento ES y lo que NO ES por diseño. Va siempre, aunque la lista de
  // abajo quede vacía, porque la pregunta «¿esto me sirve para el gálibo?» se
  // hace en toda revisión y merece una respuesta impresa.
  const alcance = `<div class="bloque">
    <h3>Alcance de este documento</h3>
    <p>Este informe cubre: la <b>geometría</b> levantada en campo (posiciones, vanos, deflexiones,
    tramos de tensión), el <b>cálculo mecánico</b> del conductor bajo las hipótesis declaradas en la
    portada, la <b>comparación</b> de esos resultados contra los criterios adoptados, y la
    <b>cuantificación geométrica</b> de materiales.</p>
    <p>Este informe <b>NO</b> cubre: la verificación en campo de distancias de seguridad al terreno y a
    cruces; el cálculo estructural de apoyos, cimentaciones y retenidas; el diseño del aislamiento y la
    coordinación de aislamiento; los estudios eléctricos de la línea; ni el estado de conservación de
    los componentes más allá de lo que se registró en las inspecciones citadas.</p>
    <p><b>Nada de lo que sigue invalida el informe.</b> Lo que hace es decir con exactitud hasta dónde
    llega, que es la única manera de que lo que sí afirma se sostenga.</p>
  </div>`;

  if (!limites.length) {
    return alcance + `<div class="bloque"><h3>Limitaciones declaradas</h3>
      <p class="aviso">Con los datos de esta versión <b>no quedó ninguna limitación por declarar</b>:
      la hipótesis está congelada, el conductor tiene procedencia confirmada, todos los criterios
      resultaron evaluables y no hay renglones sin cuantificar ni verificaciones pendientes.</p>
      <p>Eso <b>no significa que no las haya</b>: significa que ni los datos ni quien generó el informe
      declararon ninguna. Una lista vacía en esta página es, ella misma, algo que revisar antes de
      firmar.</p></div>`;
  }

  const filas = limites.map((l) => `<li><b>${esc(l.titulo)}</b><br>${esc(l.detalle)}
    <span class="origen">Origen: ${esc(l.origen)}</span></li>`).join('');

  return alcance + `<div class="bloque"><h3>Limitaciones declaradas (${n(limites.length)})</h3>
    <p>Cada una se DERIVA de los datos con que se generó este informe. No están escritas a mano y no se
    quedan desactualizadas: el día que llegue el dato que falta, la limitación desaparece sola del
    informe siguiente.</p></div>
    <ol>${filas}</ol>`;
}

// ── Función pública ─────────────────────────────────────────────────────────

/**
 * Genera el informe imprimible completo, en un solo archivo HTML autocontenido.
 *
 * @param {Object} [entrada]
 * @param {Object} [entrada.linea]           documento `Linea` (código, nombre, tensión, propietario)
 * @param {Object} [entrada.conductor]       documento `Conductor`
 * @param {Object} [entrada.hipotesis]       documento `Hipotesis`
 * @param {Object} [entrada.lev]             salida de `derivarLevantamiento(apoyos)`
 * @param {Array}  [entrada.tramos]          salida de `calcularTramos(...)` — una fila por tramo
 * @param {Array}  [entrada.vanos]           salida de `detalleVanos(...)`, plana o agrupada por tramo
 * @param {Array}  [entrada.indicadores]     salida de `evaluarUmbrales(...)`
 * @param {Array}  [entrada.cargas]          filas de `cargasDeLaLinea(...)` — una por estructura
 * @param {Array}  [entrada.longitudinal]    filas de `longitudinalDeLaLinea(...)` — el otro eje
 * @param {Object} [entrada.cantidades]      salida de `cantidadesGeometricas(...)`
 * @param {Array}  [entrada.investigaciones] documentos `Investigacion` de la línea
 * @param {Array}  [entrada.calidad]         salida de `calidadLevantamiento(lev)`; si no llega, se deriva
 * @param {Object} [entrada.meta]            `{ generadoEn, generadoPor, hipotesisNombre, versionNucleo,
 *                                              limitaciones }` — `generadoEn` lo pone quien llama:
 *                                              este módulo es puro y no mira el reloj
 * @returns {string} documento HTML completo, sin JavaScript y sin recursos externos
 */
export function informeHtml(entrada) {
  const e = objeto(entrada);
  const linea = objeto(e.linea);
  const conductor = objeto(e.conductor);
  const hipotesis = objeto(e.hipotesis);
  const meta = objeto(e.meta);
  const lev = levSeguro(e.lev);
  const tramos = lista(e.tramos);
  const grupos = gruposDeVanos(e.vanos);
  const indicadores = lista(e.indicadores);
  const cargas = lista(e.cargas);
  const longitudinal = lista(e.longitudinal);
  const cantidades = objeto(e.cantidades);
  const investigaciones = lista(e.investigaciones);
  const calidad = lista(e.calidad ?? calidadLevantamiento(lev));

  // El índice de la portada se ARMA de esta lista, no se escribe aparte: así no
  // puede desincronizarse del cuerpo. Añadir una sección aquí la añade al índice.
  const cuerpo = [
    { titulo: 'Resumen ejecutivo', html: resumenEjecutivo(lev, tramos, indicadores, conductor) },
    { titulo: 'Calidad del levantamiento', html: seccionCalidad(calidad) },
    { titulo: 'Cálculo mecánico por tramo de tensión', html: seccionMecanica(tramos, conductor, hipotesis, indicadores) },
    { titulo: 'Detalle vano a vano', html: seccionVanos(grupos) },
    // Va tras los vanos y antes de los umbrales: las tres tablas de cálculo
    // seguidas (tramo → vano → apoyo), y después la de criterios, que cierra.
    { titulo: 'Carga sobre las estructuras', html: seccionCargas(cargas) },
    { titulo: 'Carga longitudinal sobre las estructuras', html: seccionLongitudinal(longitudinal) },
    { titulo: 'Umbrales y criterios de evaluación', html: seccionUmbrales(indicadores) },
    { titulo: 'Memoria de cantidades (geométrica)', html: seccionCantidades(cantidades) },
  ];

  // El expediente solo aparece si existe: una sección de falla vacía en el
  // informe de una línea sana se lee como si alguien hubiera borrado algo.
  if (investigaciones.length) {
    cuerpo.push({
      titulo: `Expediente de falla (${n(investigaciones.length)})`,
      html: seccionExpediente(investigaciones, lev),
    });
  }

  // La sección final es OBLIGATORIA y va siempre la última, con o sin
  // limitaciones que declarar. Es la regla que gobierna este módulo.
  cuerpo.push({
    titulo: TITULO_LIMITACIONES,
    html: seccionLimites({ ...e, lev, calidad }),
    clase: 'limites',
  });

  const indice = cuerpo.map((s) => s.titulo);
  const secciones = cuerpo.map((s, i) =>
    `<section${s.clase ? ` class="${s.clase}"` : ''}>
  <h2>${i + 1}. ${esc(s.titulo)}</h2>
  ${s.html}
</section>`).join('\n');

  const titulo = `Informe de línea ${linea.codigo ?? 'sin identificar'}`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<style>${ESTILO}</style>
</head>
<body>
<main class="hoja">
${portada(linea, conductor, hipotesis, lev, meta, indice)}
${secciones}
<p class="pie">${esc(linea.codigo ?? 'Línea sin identificar')} · documento generado por la plataforma de
mantenimiento de líneas AT${meta.generadoEn ? ` el ${esc(meta.generadoEn)}` : ''}. Este documento no
certifica nada por sí mismo: certifica el ingeniero que lo firma.</p>
</main>
</body>
</html>`;
}
