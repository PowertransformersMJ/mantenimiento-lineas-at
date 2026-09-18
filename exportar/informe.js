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
// La versión del exportador la sabe su propio módulo. El BORRADOR (final de este
// archivo) arma su portada a mano —no puede usar `bloqueProcedencia`, que habla
// de estructuras y de vanos reales que ahí no existen— y aun así tiene que
// declarar con qué versión salió: un papel sin eso no es reproducible.
import { VERSION_EXPORTADOR } from './version.js';
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
export const esc = (s) => String(s ?? '')
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
export const escRico = (s) => esc(s).replace(/&lt;(\/?)(b|i|em|strong|br)\/?&gt;/g, '<$1$2>');

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
export const n = (v, d = 0) => (Number.isFinite(v)
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

export const lista = (x) => (Array.isArray(x) ? x : []);
export const objeto = (x) => (x !== null && typeof x === 'object' && !Array.isArray(x) ? x : {});

/**
 * `lev` con la forma mínima que esperan `bloqueProcedencia` y
 * `calidadLevantamiento`. Sin esto, un informe sin levantamiento moriría dentro
 * de `lev.longitud_m.toFixed(2)` — y el usuario vería una pantalla en blanco en
 * vez de un documento que dice qué falta.
 */
export function levSeguro(lev) {
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
export const ESTILO = `
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
.supuesto { font-size: 7.5pt; font-style: italic; }

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

export const parrafo = (t) => `<p>${t}</p>`;
export const nota = (t) => `<p class="nota">${t}</p>`;

/** Tabla con su leyenda y su pie de «qué significa el guion». */
export function tabla({ leyenda, cabecera, filas, pie }) {
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
  // ⚠️ `null` = NADIE COMPROBÓ; `[]` = se comprobó y no salió nada. Decir «no se
  // detectó ningún problema» cuando no se pasó la calidad es firmar un control
  // que no se corrió (lo cazó la revisión del 17-09).
  if (hallazgos === null) {
    return parrafo('<b>La calidad del levantamiento no se comprobó al generar este borrador</b>: '
      + 'esta copia no trae el resultado de los controles automáticos. No dice que el levantamiento '
      + 'esté bien ni mal; dice que aquí no consta.');
  }
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

// ── La marca de un veredicto calculado sobre un dato que nadie verificó ─────
//
// ⚠️ UN VEREDICTO CALCULADO SOBRE UN DATO ESTIMADO A OJO NO PUEDE PARECERSE A UNO
// CALCULADO SOBRE UNA MEDIDA. La ficha le promete al Ingeniero, con estas
// palabras, que si marca un dato como estimado «el veredicto saldrá igual, y
// saldrá diciendo que se calculó sobre un supuesto». Esa promesa vivía SOLO en
// la pantalla: en el papel que se firma, un apoyo estimado desde el suelo salía
// «cumple» igual que uno medido con cinta.
//
// QUIÉN DECIDE QUÉ ESTÁ SUPUESTO: EL MOTOR, y por eso aquí solo se pinta. El
// núcleo es el único que sabe qué campos entraron en CADA eje —el transversal
// come la carga de rotura y las dos alturas; el longitudinal, la capacidad
// longitudinal, la altura de amarre y cuántas fases amarran—, así que una marca
// deducida aquí de `apoyo.procedencias` marcaría en un eje un dato que solo comió
// el otro. Ya pasó una vez: esta función existía leyendo una forma de sello que
// el sistema no escribe (`{origen:'estimado'}` en vez del `{procedencia:
// 'supuesto'}` del contrato), sobre un campo que la fila nunca trajo, y su prueba
// la daba por buena con un fixture inventado (`33 · L-53`).
//
// El detalle va en TEXTO VISIBLE, nunca en un `title=`: este documento se
// imprime, y en papel un tooltip no existe.
const marcaDeSupuesto = (c) => {
  const xs = lista(c?.supuestosDelVeredicto);
  if (!xs.length) return '';
  const campos = xs.map((x) => esc(x?.etiqueta ?? x?.campo ?? 'un dato')).join(', ');
  return ` <span class="supuesto">· sobre dato SUPUESTO: ${campos}</span>`;
};

/**
 * El párrafo que cuenta, para una sección, cuántos veredictos se apoyan en algo
 * que nadie verificó. Va ANTES de la tabla y no al pie: quien hojea el informe
 * en una reunión no recorre veinticuatro filas buscando la letra pequeña.
 *
 * Solo cuenta las filas CON veredicto: un apoyo sin dictamen no engaña a nadie,
 * y sumarlo aquí inflaría la alarma con casos que no la merecen.
 */
function avisoDeSupuestos(filas) {
  const conVeredicto = filas.filter((c) => Number.isFinite(c?.utilizacion_pct));
  const sobreSupuesto = conVeredicto.filter((c) => lista(c?.supuestosDelVeredicto).length);
  if (!sobreSupuesto.length) {
    return conVeredicto.length
      ? parrafo('Ninguno de los veredictos de esta tabla se calculó sobre un dato marcado como '
        + 'supuesto: todos los datos que entraron declaran un origen verificable.')
      : '';
  }
  const cuales = [...new Set(sobreSupuesto.flatMap(
    (c) => lista(c.supuestosDelVeredicto).map((x) => String(x?.etiqueta ?? x?.campo ?? ''))))]
    .filter(Boolean);
  return parrafo(`<b>${n(sobreSupuesto.length)} de ${n(conVeredicto.length)} veredictos de esta `
    + 'tabla se calcularon sobre un dato que NADIE VERIFICÓ</b> '
    + `(${esc(sobreSupuesto.map((c) => String(c?.apoyo ?? '')).join(', '))}). Lo estimado fue: `
    + `${esc(cuales.join(', '))}. El veredicto no cambia por eso —el motor dictamina sobre el `
    + 'número que se le dio—, pero el número lo puso alguien a ojo: <b>un «cumple» sobre una altura '
    + 'estimada desde el suelo no es un «cumple» medido con cinta</b>. Cada fila lo dice al lado de '
    + 'su estado.');
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
    <td>${sello(c?.estadoUtilizacion ?? 'no_evaluable')}${marcaDeSupuesto(c)}</td></tr>`);

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
    + avisoDeSupuestos(cargas)
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
    <td>${sello(c?.estadoUtilizacion ?? 'no_evaluable')}${marcaDeSupuesto(c)}</td></tr>`);

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
    + avisoDeSupuestos(filas)
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

    // ⚠️ EL LÍMITE MÁS PELIGROSO DE ESTA PÁGINA, porque no deja hueco: hay cifra,
    // hay dictamen y todo se ve completo. La ficha le promete al Ingeniero que un
    // dato estimado a ojo saldrá diciendo que se calculó sobre un supuesto, y
    // esta lista es la que lee quien no va a recorrer las tablas. Se cuentan los
    // DOS ejes por separado: cada uno come campos distintos, y el motor de cada
    // uno dice cuáles de los suyos entraron sin verificar.
    const supuestosDeEje = (filas) => filas.filter(
      (c) => Number.isFinite(c?.utilizacion_pct) && lista(c?.supuestosDelVeredicto).length);
    for (const [eje, filas] of [['transversal', cargas], ['longitudinal', longitudinal]]) {
      const conSupuesto = supuestosDeEje(filas);
      if (!conSupuesto.length) continue;
      const cuales = [...new Set(conSupuesto.flatMap(
        (c) => lista(c.supuestosDelVeredicto).map((x) => String(x?.etiqueta ?? x?.campo ?? ''))))]
        .filter(Boolean);
      add(`${n(conSupuesto.length)} veredicto(s) del eje ${eje} se calcularon sobre datos SUPUESTOS`,
        `${conSupuesto.map((c) => String(c?.apoyo ?? '')).filter(Boolean).join(', ')}. `
        + `Lo que nadie verificó: ${cuales.join(', ')}. El motor dictamina sobre el número que se le `
        + 'dio y lo hace bien; el número lo puso una persona a ojo. <b>Un «cumple» sobre una altura '
        + 'estimada desde el suelo no es un «cumple» medido con cinta</b>, y en este papel los dos se '
        + 'imprimen igual salvo por esta línea. Se cierra midiendo y volviendo a declarar el dato con '
        + 'su origen.', `carga ${eje} sobre las estructuras`);
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
/**
 * LA CAPACIDAD EN CORRIENTE, y la medida de operación si la hay.
 *
 * ⚠️ ESTA SECCIÓN NO EXISTÍA: la palabra «ampacidad» no aparecía ni una vez en
 * los quince generadores de papel. El número que decide cuánta corriente se
 * puede despachar por una línea no viajaba al documento que se firma.
 *
 * ⚠️ Y NO PUBLICA UN AMPERAJE SUELTO. La ampacidad del mismo conductor va de
 * 522 A en calma a 965 A con 2 m/s: sin sus condiciones al lado, el número no
 * significa nada. Si están ADOPTADAS y no ratificadas, el papel lo dice con
 * todas las letras — quien firma tiene derecho a saber qué eligió él y qué
 * eligió el programa (`99 §ADR-093`).
 */
function seccionAmpacidad(ref, carga) {
  if (!ref) {
    return parrafo('<b>No se declaró la capacidad en corriente de la línea.</b> Sin ella este '
      + 'informe no dice cuánta corriente puede despachar el conductor: la parte eléctrica del '
      + 'dictamen queda fuera.');
  }
  if (ref.ampacidad_A == null) {
    return parrafo(`<b>Capacidad en corriente: no evaluable.</b> ${esc(ref.motivo ?? '')}`);
  }

  const c = ref.condiciones ?? {};
  const CAMPOS = ['ambiente_C', 'viento_m_s', 'sol_W_m2', 'emisividad', 'absortividad', 'altitud_m'];
  const ROTULOS = ['Temperatura ambiente', 'Velocidad del viento', 'Radiación solar',
    'Emisividad', 'Absortividad', 'Altitud'];
  const UNIDADES = [' °C', ' m/s', ' W/m²', '', '', ' msnm'];
  const r = [];

  // ══════════════════════════════════════════════════════════════════════════
  // DE QUIÉN ES ESTE NÚMERO — `99 §ADR-098`
  // ──────────────────────────────────────────────────────────────────────────
  // Va en un papel que FIRMA un ingeniero. Desde la orden del 2026-09-05 la
  // ampacidad de registro puede ser la que declara el FABRICANTE en su ficha, y
  // en ese caso escribir «por IEEE Std 738» sería atribuir a una norma un número
  // que no salió de ella. El párrafo cambia entero según la naturaleza.
  // ══════════════════════════════════════════════════════════════════════════
  if (ref.naturaleza === 'declarada') {
    const f = ref.fabricante ?? {};
    r.push(parrafo(`<b>Ampacidad de la línea: ${nu(ref.ampacidad_A, 0, 'A')}</b> — cifra `
      + `<b>DECLARADA por el fabricante</b>, con el conductor a `
      + `${esc(String(ref.temperatura?.valor_C ?? ''))} °C.`));
    r.push(tabla({
      leyenda: 'De dónde sale la cifra. Es lo que la hace auditable.',
      cabecera: '<th>Dato</th><th>Valor</th>',
      filas: [
        `<tr><td>Fabricante</td><td>${esc(f.fabricante ?? '—')}</td></tr>`,
        `<tr><td>Documento</td><td>${esc(f.documento ?? '—')}</td></tr>`,
        `<tr><td>Ubicación en el documento</td><td>${esc(f.ubicacionEnDocumento ?? '—')}</td></tr>`,
        `<tr><td>Método declarado por el fabricante</td><td>${esc(f.metodo ?? 'no declarado')}</td></tr>`,
        `<tr><td>Declarada en el sistema</td><td>${esc(String(f.declaradaEn ?? '—'))}</td></tr>`,
      ],
    }));
    const cf = ref.condicionesDeLaFicha ?? {};
    if (cf.completa === false) {
      r.push(parrafo('<b>⚠️ La ficha del fabricante no imprime todas sus condiciones</b> '
        + `(faltan: ${esc((cf.faltan ?? []).join(', '))}). El amperaje es el suyo y es trazable, `
        + 'pero SIN esas condiciones no se puede comprobar si el clima de esta línea lo honra. '
        + 'Este informe no las supone.'));
    }
    if (ref.contraste?.elSitioEsMasDuro) {
      r.push(parrafo('<b>⚠️ EL SITIO ES MÁS DURO QUE LA FICHA.</b> Con las condiciones de esta '
        + `línea el mismo conductor daría ${nu(ref.contraste.enElSitio_A, 0, 'A')}, un `
        + `<b>${esc(Math.abs(ref.contraste.delta_pct).toFixed(1))} % menos</b> que la cifra de `
        + 'registro. Operar hasta el valor de catálogo en un día así excede lo que el conductor '
        + 'puede evacuar. <b>Decidir si se derratea, y cuánto, es del ingeniero que firma.</b>'));
    }
    if (Number.isFinite(ref.contraste?.desviacionDeLaFicha_pct)) {
      r.push(parrafo('Comprobación independiente: recalculando por IEEE Std 738 con las propias '
        + `condiciones de la ficha se obtienen ${nu(ref.contraste.reproducida_A, 0, 'A')}, un `
        + `${esc(ref.contraste.desviacionDeLaFicha_pct.toFixed(1))} % respecto a lo impreso. `
        + 'Una diferencia no invalida la ficha: los fabricantes no siempre usan el mismo método.'));
    }
  } else {
    r.push(parrafo(`<b>Ampacidad de la línea: ${nu(ref.ampacidad_A, 0, 'A')}</b>, <b>CALCULADA</b> `
      + `por IEEE Std 738 en régimen permanente, con el conductor a `
      + `${esc(ref.temperatura?.rotulo ?? '')}. <b>La línea no declara ampacidad de fabricante</b>, `
      + 'así que este número lo produjo el sistema, no un catálogo.'));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ⚠️ LO QUE MÁS PESA EN UN PAPEL QUE SE FIRMA — `99 §ADR-099`
  // ──────────────────────────────────────────────────────────────────────────
  // Orden del Ingeniero, 2026-09-05: la temperatura de operación tiene que
  // venir del FABRICANTE. Si no vino, el amperaje se imprime igual —quitarlo
  // sería esconder trabajo hecho— pero el informe declara, ANTES de la tabla de
  // condiciones, que ESTO NO ES UN DICTAMEN. Un lector que firme abajo tiene
  // derecho a saber que el denominador descansa sobre un supuesto del sistema.
  // ══════════════════════════════════════════════════════════════════════════
  if (ref.esDictamen === false) {
    r.push(parrafo('<b>⚠️ ESTE AMPERAJE NO ES UN DICTAMEN.</b> La temperatura de operación del '
      + `conductor no la ha declarado ningún fabricante: ${esc(ref.temperatura?.rotulo ?? '')}. `
      + 'Se publica porque el cálculo es correcto y sirve para orientarse, <b>no para decidir un '
      + 'despacho ni para firmar una capacidad</b>. Para el conductor de esta línea hay <b>siete '
      + 'fichas públicas de fabricante que recomiendan 75 °C</b> como máximo continuo; con los '
      + '90 °C típicos del material se publica del orden de un <b>17 % más de capacidad</b>, '
      + 'siempre por el lado optimista. Cierra aportando la ficha del fabricante del conductor.'));
  }

  r.push(tabla({
    leyenda: 'Las condiciones con las que se calculó, y de quién es cada una.',
    cabecera: '<th>Condición</th><th>Valor</th><th>Procedencia</th>',
    filas: CAMPOS.map((campo, i) => {
      const adoptada = (c.adoptadas ?? []).includes(campo);
      return `<tr${adoptada ? ' class="revisar"' : ''}><td>${esc(ROTULOS[i])}</td>`
        + `<td>${esc(String(c.valores?.[campo]))}${esc(UNIDADES[i])}</td>`
        + `<td>${esc(c.procedencias?.[campo] ?? '—')}</td></tr>`;
    }),
  }));

  if (c.todoAdoptado) {
    r.push(parrafo('<b>⚠️ LAS SEIS CONDICIONES ESTÁN ADOPTADAS POR EL SISTEMA</b>, no declaradas '
      + 'por el ingeniero que firma. Este amperaje es una REFERENCIA, no un dictamen de operación: '
      + 'con el mismo conductor, un día en calma deja la capacidad muy por debajo de esta cifra. '
      + '<b>Lo que este sistema tiene verificado contra tabla de fabricante es la RESISTENCIA del '
      + 'conductor, no esta ampacidad</b> (`99 §ADR-098`).'));
  } else if (!c.ratificada) {
    r.push(parrafo('<b>⚠️ La condición no está ratificada</b> por el ingeniero: hay valores '
      + 'declarados, pero nadie ha firmado que sean los de esta línea.'));
  } else {
    r.push(parrafo(`Condición <b>ratificada</b> el ${esc(String(c.ratificadaEn ?? ''))} `
      + `(${esc(c.fuente ?? 'sin fuente declarada')}).`));
  }

  if (Array.isArray(ref.sensibilidadViento) && ref.sensibilidadViento.length) {
    r.push(tabla({
      leyenda: 'El mismo conductor, cambiando SOLO el viento. Por eso la condición se declara.',
      cabecera: '<th>Viento</th><th>Capacidad</th>',
      filas: ref.sensibilidadViento.map((x) =>
        `<tr><td>${x.viento_m_s === 0 ? 'calma' : `${esc(String(x.viento_m_s))} m/s`}</td>`
        + `<td>${nu(x.ampacidad_A, 0, 'A')}</td></tr>`),
    }));
  }

  // ⚠️ CAPACIDAD y MEDIDA son cosas distintas. Si no hay archivo cargado se
  // DICE, en vez de dejar un hueco que alguien llene suponiendo.
  if (carga && Number.isFinite(carga.corriente_A)) {
    r.push(parrafo(`<b>Medida de operación:</b> ${nu(carga.corriente_A, 0, 'A')}`
      + `${carga.fecha ? ` el ${esc(String(carga.fecha))}` : ''} = `
      + `<b>${nu(carga.contraAmpacidad_pct, 1, '%')}</b> de la capacidad de arriba.`));
  } else {
    r.push(parrafo('<b>Sin medida de operación cargada.</b> Este informe publica la CAPACIDAD de '
      + 'la línea, no cuánta corriente lleva: para lo segundo hace falta cargar el archivo de '
      + 'operación en la pestaña de cargabilidad.'));
  }
  return r.join('\n');
}

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
    // ⚠️ DESPUÉS DE LOS UMBRALES Y ANTES DE LAS CANTIDADES. La capacidad en
    // corriente es un criterio de evaluación, no una cantidad a comprar. Y se
    // lee CON los umbrales delante: el veredicto eléctrico solo significa algo
    // si ya se sabe contra qué se mide.
    { titulo: 'Capacidad en corriente de la línea',
      html: seccionAmpacidad(e.ampacidadReferencia, e.cargabilidad) },
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

// ════════════════════════════════════════════════════════════════════════════
// EL BORRADOR — el informe de una línea que todavía no es una línea
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE (orden del Ingeniero, 2026-09-17). LN-617 y LN-628 entraron al
// parque SIN TORRES: de ellas solo hay el recorrido que se levantó con el GPS,
// guardado tal cual y rotulado «levantado el DD-MM-AAAA · sin registrar como
// torres». Las torres nacerán el día que él declare la función de cada una, y
// el conductor y las hipótesis llegan DESPUÉS.
//
// Con eso no se puede firmar nada — y esconder el informe hasta entonces sería
// peor: lo levantado y lo medido en el SCADA YA existen, ya cuestan dinero y ya
// hay que poder enseñarlos. Así que el papel SALE, con todo lo que sí hay, y
// dice en la portada, en la firma y en el pie que es un **BORRADOR NO
// FIRMABLE**. Es el mismo principio de siempre: declarar el hueco en vez de
// taparlo ni de fingir una avería (`99 §ADR-029/032`).
//
// LAS CUATRO REGLAS DE ARRIBA SIGUEN EN PIE, sin excepción: autocontenido, CSS
// de papel, todo el dato escapado, y aquí no se calcula nada — la geometría del
// recorrido llega ya derivada en `entrada.recorrido`.
//
// Y UNA QUINTA, QUE ES DE ESTE BORRADOR:
//
// 5) NO SE COPIA NADA DE OTRA LÍNEA. Ni el conductor de la vecina, ni su
//    hipótesis, ni su longitud. Donde falta un dato va el guion y el motivo. Un
//    borrador que se rellena con las cifras del vecino es exactamente el papel
//    que nadie podría defender tres años después.
//
// ⚠️ `informeHtml` NO SE TOCA. El informe de una línea completa tiene que salir
// byte por byte igual que ayer, y por eso esto es una función aparte con su
// propia hoja de estilo (`ESTILO_BORRADOR`, que se AÑADE a `ESTILO` y no lo
// modifica). Hay prueba que compara la huella del documento completo antes y
// después (`tests/informe-borrador.test.js`).
// ════════════════════════════════════════════════════════════════════════════

/** El sello que lleva el documento en la portada, en la firma y en el pie. */
export const TITULO_BORRADOR = 'BORRADOR · NO FIRMABLE';

/**
 * Lo que el BORRADOR añade a la hoja de papel. Va DETRÁS de `ESTILO`, nunca
 * dentro: tocar `ESTILO` cambiaría también el informe firmable, que no cambia.
 */
export const ESTILO_BORRADOR = `
/* El sello de borrador: lo primero que se ve, y se ve fotocopiado. */
.portada .borrador { font-family: Arial, Helvetica, sans-serif; font-size: 12pt; font-weight: bold;
  letter-spacing: 0.12em; border: 2.5pt solid #000000; padding: 2mm 4mm; margin: 0 0 5mm;
  display: inline-block; }

/* El recuadro que dice por qué no se puede firmar. Ocupa el sitio de la firma. */
.firma-bloqueada { border: 2pt solid #000000; padding: 3mm 4mm; margin: 5mm 0 0;
  font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; break-inside: avoid;
  page-break-inside: avoid; }
.firma-bloqueada table { margin-top: 3mm; }

/* La línea de firma sigue impresa y TACHADA: que se vea que había un sitio para
   firmar y que hoy está cerrado, en vez de un hueco que alguien rellene a mano. */
.firma .linea-firma.tachada { text-decoration: line-through; color: #555555; }
`;

/**
 * Cómo se LEE en pantalla el código de una serie.
 *
 * Un tramo compartido se escribe `TR-618` y se dice «tramo compartido 618»: son
 * las palabras del Ingeniero, y las de las maquetas que aprobó. El código sigue
 * siendo el dueño de la identidad; esto es solo cómo se pronuncia.
 */
export function rotuloDeSerie(codigo) {
  const c = String(codigo ?? '').trim();
  const m = /^TR-(.+)$/i.exec(c);
  if (m) return `tramo compartido ${m[1]}`;
  return c || 'serie sin código';
}

/**
 * El rótulo con sus extremos, en TEXTO PLANO: «tramo compartido 618 (E07–E36)».
 *
 * Crudo a propósito: también entra dentro de frases que se escapan enteras
 * después (las limitaciones), y escapar dos veces imprimiría `&amp;lt;` en un
 * papel que alguien va a leer.
 */
function rotuloDelRecorridoTexto(R) {
  const base = rotuloDeSerie(R.codigoSerie);
  return R.desde && R.hasta ? `${base} (${R.desde}–${R.hasta})` : base;
}

/**
 * El mismo, ya escapado, para pegarlo directamente en el HTML. El código de una
 * serie y los nombres de los extremos llegan de la base: el informe no da nada
 * por bueno, ni siquiera lo que el molde promete validar.
 */
function rotuloDelRecorrido(R) {
  return esc(rotuloDelRecorridoTexto(R));
}

/**
 * «a, b y c», con la «e» del castellano delante de palabra que empieza por i-.
 * Sin esto la frase del bloqueo sale «torres, conductor y hipótesis», que se
 * lee mal justo en el renglón que más se va a leer de este papel.
 */
function yLista(xs) {
  const L = xs.filter(Boolean);
  if (L.length <= 1) return L.join('');
  const ultimo = L[L.length - 1];
  const conjuncion = /^(i|hi(?!e))/i.test(ultimo) ? 'e' : 'y';
  return `${L.slice(0, -1).join(', ')} ${conjuncion} ${ultimo}`;
}

/** Cómo se dice en castellano cada cosa que puede faltar. Orden fijo. */
const NOMBRE_DE_FALTA = { torres: 'torres', conductor: 'conductor', hipotesis: 'hipótesis' };
const ORDEN_DE_FALTA = ['torres', 'conductor', 'hipotesis'];

const ordenarFaltas = (faltan) => ORDEN_DE_FALTA.filter((f) => lista(faltan).includes(f));

/**
 * POR QUÉ NO SE PUEDE FIRMAR, dicho en una frase y en una tabla.
 *
 * La frase nombra a las OTRAS líneas que van en las mismas torres, y eso no es
 * un adorno: mientras LN-628 no tenga conductor ni hipótesis congelada, el
 * veredicto de una torre del tramo compartido no se puede cerrar aunque LN-617
 * los traiga los dos — de esa torre tiran los dos circuitos. Firmar una no
 * congela la otra: exige que ya lo esté.
 *
 * @param {Object} q
 * @param {Object} q.linea     documento `Linea` (solo se usa el código)
 * @param {string[]} q.faltan  'torres' | 'conductor' | 'hipotesis'
 * @param {Array}  q.vecinas   `[{ codigo, faltan? }]` — las que recorren el mismo tramo
 * @param {Object} q.recorrido el recorrido levantado, para nombrar el tramo
 * @returns {{ texto: string, filas: string[], cabecera: string, faltan: string[] }}
 */
export function bloqueoDeFirma(q) {
  const Q = objeto(q);
  const L = objeto(Q.linea);
  const R = objeto(Q.recorrido);
  const codigo = esc(L.codigo ?? 'esta línea');
  const faltan = ordenarFaltas(Q.faltan);
  const vecinas = lista(Q.vecinas).filter((v) => objeto(v).codigo);

  const cosas = yLista(faltan.map((f) => NOMBRE_DE_FALTA[f]));
  const verbo = faltan.length === 1 ? 'falta' : 'faltan';
  // Los dueños del hueco. Con vecinas se dice «y comparten torres» con todas las
  // letras: es la razón por la que traer el conductor de una sola no desbloquea.
  const duenos = vecinas.length
    ? `${codigo} y de ${yLista(vecinas.map((v) => esc(v.codigo)))} (comparten torres)`
    : codigo;

  const texto = faltan.length
    ? `<b>No se puede firmar:</b> ${verbo} ${cosas} de ${duenos}.`
    : `<b>No se puede firmar:</b> este documento se generó como ${TITULO_BORRADOR}.`;

  // La tabla: una columna por línea implicada, para que se vea de un vistazo
  // cuál trae qué. Las torres van en una sola casilla a lo ancho — son LAS
  // MISMAS torres, y dos casillas sugerirían que cada línea tiene las suyas.
  const columnas = [{ codigo, faltan }, ...vecinas.map((v) => ({
    codigo: esc(v.codigo),
    // Sin `faltan` de la vecina no se supone nada: se dice que no consta.
    faltan: Array.isArray(v.faltan) ? ordenarFaltas(v.faltan) : null,
  }))];
  const casilla = (c, que) => {
    if (c.faltan === null) return '<i>no consta</i>';
    return c.faltan.includes(que) ? '○ falta' : '● declarado';
  };
  const filas = [
    `<tr><td>Torres del ${esc(rotuloDeSerie(R.codigoSerie))}, con función declarada</td>`
      + `<td colspan="${columnas.length}">○ ninguna registrada (son las mismas torres)</td></tr>`,
    `<tr><td>Conductor declarado</td>${columnas.map((c) => `<td>${casilla(c, 'conductor')}</td>`).join('')}</tr>`,
    `<tr><td>Hipótesis de cálculo declarada y congelada</td>`
      + `${columnas.map((c) => `<td>${casilla(c, 'hipotesis')}</td>`).join('')}</tr>`,
  ];
  const cabecera = `<th>Falta</th>${columnas.map((c) => `<th>${c.codigo}</th>`).join('')}`;

  return { texto, filas, cabecera, faltan };
}

/**
 * LA FRASE DE LA LONGITUD, que es la que este borrador no puede equivocar.
 *
 * Lo levantado con el GPS NO es la longitud de la línea, y la diferencia no es
 * un matiz: el recorrido empieza y acaba donde la cuadrilla pudo llegar, se
 * salta las torres que no encontró, y encima es de un TRAMO que comparten dos
 * líneas. Poner esos metros en el renglón «longitud de línea» sería fabricar
 * el dato del que después cuelgan las pérdidas y la memoria de cantidades.
 *
 * Devuelve TEXTO PLANO: quien la pegue en el HTML la escapa (y quien la meta en
 * una limitación no, porque la limitación entera se escapa después).
 */
export function fraseDeLongitudLevantada(recorrido) {
  const R = objeto(recorrido);
  const cifra = Number.isFinite(R.longitud_m) ? `${n(R.longitud_m, 0)} m` : SIN_DATO;
  return `Levantado: ${rotuloDelRecorridoTexto(R)}, ${cifra} — no es la longitud de la línea`;
}

// ── B1 · Resumen ejecutivo del borrador ─────────────────────────────────────

function borradorResumen(R, electricos, vecinas) {
  const f = (concepto, valor, significa) =>
    `<tr><td>${concepto}</td><td class="num">${valor}</td><td>${significa}</td></tr>`;
  const hayRec = Number.isFinite(R.nPuntos) && R.nPuntos > 0;
  const extremos = R.desde && R.hasta ? `${esc(R.desde)} a ${esc(R.hasta)}` : SIN_DATO;
  const P = objeto(electricos).pico;

  const filas = [
    f('Torres registradas', 'ninguna',
      'Se registran cuando el Ingeniero declare la función de cada una.'),
    f(`Longitud levantada: ${rotuloDelRecorrido(R)}`, nu(R.longitud_m, 0, 'm'),
      '<b>NO es la longitud de la línea.</b> Es la suma de los vanos entre los puntos que trajo el '
      + `GPS${lista(vecinas).filter((v) => objeto(v).codigo).length
        ? ', en un tramo que recorre más de una línea' : ''}.`),
    f('Longitud de línea (eje)', SIN_DATO,
      'No se conoce: no hay torres registradas ni recorrido completo declarado.'),
    f('Puntos del levantamiento', n(R.nPuntos),
      hayRec ? `De ${extremos}. Son posiciones, no torres: ninguna tiene función declarada.`
        : 'No hay recorrido guardado para esta línea.'),
    f('Vanos entre puntos', n(R.nVanos),
      'Entre puntos del GPS, <b>no entre torres</b>. Dos puntos seguidos pueden esconder una torre '
      + 'que no se levantó.'),
    f('Vano máximo entre puntos', nu(R.vanoMax_m, 1, 'm'),
      'Un vano muy por encima de la mediana suele delatar una torre sin levantar.'),
    f('Vano mínimo entre puntos', nu(R.vanoMin_m, 1, 'm'),
      'Un vano muy corto suele delatar un quiebre o un punto tomado dos veces.'),
    f('Vano medio entre puntos', nu(R.vanoMedio_m, 1, 'm'),
      `Longitud levantada dividida entre los vanos. Mediana: ${nu(R.medianaVano_m, 1, 'm')}.`),
    f('Empalmes', SIN_DATO, 'Sin torres registradas no se distinguen de los apoyos.'),
    f('Tramos de tensión', SIN_DATO,
      'Trozos entre anclajes: sin función estructural declarada no hay anclajes.'),
    f('Tiro máximo calculado', SIN_DATO, 'Sin conductor ni hipótesis no hay cálculo mecánico.'),
    f('Criterios evaluados', SIN_DATO, 'No se evaluó ninguno: no hay cálculo contra el que medirlos.'),
  ];
  if (objeto(P).valor_A != null) {
    const cuando = [objeto(P).fecha ? `el ${esc(String(objeto(P).fecha))}` : null,
      objeto(P).hora != null ? `a las ${esc(String(objeto(P).hora))} h` : null].filter(Boolean).join(' ');
    filas.push(f('Corriente más alta medida', nu(objeto(P).valor_A, 1, 'A'),
      `${objeto(P).fase ? `Fase ${esc(String(objeto(P).fase))}, ` : ''}${cuando}. `
      + '<b>Sin veredicto:</b> sin conductor no hay ampacidad contra la que compararla.'));
  }

  const conVecinas = lista(vecinas).filter((v) => objeto(v).codigo);
  return parrafo('<b>No se declaró conductor</b>: sin él no hay cálculo mecánico posible, solo '
    + 'geometría. <b>No se usa el de otra línea</b>, ni siquiera el de la que va en estas mismas '
    + 'torres.')
    + `<p class="aviso"><b>${esc(fraseDeLongitudLevantada(R))}.</b>`
    + `${conVecinas.length ? ` Esas torres las comparte con ${yLista(conVecinas.map((v) => esc(v.codigo)))}.` : ''}</p>`
    + tabla({
      leyenda: 'La línea en cifras. Salen del recorrido guardado y de lo medido; ninguna se '
        + 'escribió a mano, y ninguna viene de otra línea.',
      cabecera: '<th>Cifra</th><th class="num">Valor</th><th>Qué significa</th>',
      filas,
      pie: NOTA_HUECO,
    });
}

// ── B2 · Torres: sin registrar ──────────────────────────────────────────────

function borradorTorres(linea, R, vecinas) {
  const codigo = esc(objeto(linea).codigo ?? 'Esta línea');
  const conVecinas = lista(vecinas).filter((v) => objeto(v).codigo);
  const quienes = yLista([codigo, ...conVecinas.map((v) => esc(v.codigo))]);

  const r = [`<p class="aviso"><b>${codigo} no tiene torres registradas.</b> Las del `
    + `${rotuloDelRecorrido(R)} se registrarán cuando el Ingeniero declare la función de cada una. `
    + 'Hasta entonces este informe no dibuja apoyos, no calcula vanos entre torres y no dictamina '
    + 'ninguna estructura.</p>'];

  if (!Number.isFinite(R.nPuntos) || R.nPuntos <= 0) {
    r.push(parrafo('Tampoco hay recorrido guardado: de esta línea no consta todavía ni una jornada '
      + 'de campo. No es un fallo de la aplicación, es lo que hay declarado hoy.'));
    return r.join('\n');
  }

  const compartido = conVecinas.length
    ? ` Lo recorren ${quienes}${Number.isFinite(R.circuitosPorTorre)
      ? `: ${n(R.circuitosPorTorre)} circuitos tendidos en cada posición` : ''}.`
    : '';
  r.push(parrafo('Lo que sí hay es el levantamiento del GPS, guardado tal cual como registro '
    + `aparte: <b>${esc(R.rotulo ?? 'levantado en campo · sin registrar como torres')}</b>. De ahí `
    + `saldrán las torres.${compartido}`));

  const puntos = lista(R.puntos);
  if (puntos.length) {
    const filas = puntos.map((p) => {
      const P = objeto(p);
      const defl = Number.isFinite(P.deflexion_grados)
        ? `${n(P.deflexion_grados, 1)}°${Number.isFinite(P.margenDeflexion_grados)
          ? ` ±${n(P.margenDeflexion_grados, 1)}°` : ''}`
        : (P.notaDeflexion ? esc(P.notaDeflexion) : SIN_DATO);
      return `<tr><td>${esc(P.nombre)}</td><td>${esc(P.hora ?? SIN_DATO)}</td>`
        + `<td class="num">${n(P.cota_m, 1)}</td>`
        + `<td class="num">${n(P.vanoSiguiente_m, 1)}</td>`
        + `<td class="num">${defl}</td><td><i>sin declarar</i></td></tr>`;
    });
    r.push(tabla({
      leyenda: `Recorrido del ${rotuloDelRecorrido(R)} tal como lo grabó el GPS`
        + `${R.aparato ? ` (${esc(R.aparato)})` : ''}. <b>Son posiciones, no torres.</b>`,
      cabecera: '<th>Punto</th><th>Hora</th><th class="num">Cota (m)</th>'
        + '<th class="num">Vano al siguiente (m)</th><th class="num">Deflexión</th><th>Función</th>',
      filas,
      pie: `Suma de vanos: ${nu(R.longitud_m, 2, 'm')}. Las cotas son las que dio el aparato`
        + `${Number.isFinite(R.precision_m) ? ` (±${n(R.precision_m)} m)` : ''}: solo referencia. `
        + `${NOTA_HUECO}`,
    }));
  }

  // Los vanos con pinta de esconder una torre: no es un veredicto, es el aviso
  // que evita que un vano falso se lleve por delante flecha, viento y tramo.
  const sosp = lista(R.sospechosos);
  if (sosp.length) {
    r.push(tabla({
      leyenda: 'Vanos que podrían esconder una torre que no se levantó. No es un veredicto: es '
        + 'dónde mirar antes de registrar las torres.',
      cabecera: '<th>Vano</th><th class="num">Longitud</th><th>Por qué llama la atención</th>',
      filas: sosp.map((s) => {
        const S = objeto(s);
        return `<tr class="revisar"><td>${esc(S.vano)}</td><td class="num">${nu(S.longitud_m, 1, 'm')}</td>`
          + `<td>${esc(S.motivo ?? (Number.isFinite(S.veces)
            ? `${n(S.veces, 2)} veces la mediana de los vanos levantados.` : ''))}</td></tr>`;
      }),
    }));
  }
  return r.join('\n');
}

// ── B3 · Lo que NO se calcula, y qué le falta a cada cosa ───────────────────

function borradorNoSeCalcula(linea, R, vecinas) {
  const codigo = esc(objeto(linea).codigo ?? 'esta línea');
  const conVecinas = lista(vecinas).filter((v) => objeto(v).codigo);
  const vecinasTxt = conVecinas.length ? yLista(conVecinas.map((v) => esc(v.codigo))) : null;
  const circuitos = Number.isFinite(R.circuitosPorTorre)
    ? `: cada torre lleva ${n(R.circuitosPorTorre)} circuitos` : '';

  const f = (seccion, falta) => `<tr><td>${seccion}</td><td>${falta}</td></tr>`;
  return parrafo('Las secciones de cálculo del informe completo <b>no salen</b> en este borrador, y '
    + 'ninguna se rellena con datos de otra línea. Cada una dice qué le falta para volver a su sitio.')
    + tabla({
      leyenda: 'Qué le falta a cada sección para volver al informe.',
      cabecera: '<th>Sección del informe completo</th><th>Qué le falta</th>',
      filas: [
        f('Cálculo mecánico por tramo de tensión',
          `torres con función declarada (que son las que marcan los anclajes), conductor e hipótesis de ${codigo}`),
        f('Detalle vano a vano', `torres registradas, conductor e hipótesis de ${codigo}`),
        f('Carga sobre las estructuras', vecinasTxt
          ? `torres registradas; conductor e hipótesis de ${codigo} <b>y de ${vecinasTxt}</b>${circuitos}`
          : `torres registradas, conductor e hipótesis de ${codigo}`),
        f('Carga longitudinal sobre las estructuras', vecinasTxt
          ? 'lo mismo: las dos líneas tiran de las mismas torres'
          : 'lo mismo que la fila de arriba'),
        f('Umbrales y criterios de evaluación', 'el cálculo de las filas de arriba'),
        f('Capacidad en corriente de la línea',
          `el conductor de ${codigo} y el clima de su hipótesis`),
        f('Memoria de cantidades (geométrica)', 'torres registradas y conductor'),
      ],
    });
}

// ── B4 · Parámetros eléctricos medidos ──────────────────────────────────────
//
// LO QUE SÍ HAY. El SCADA lleva meses grabando por esta bahía, y eso no depende
// de que haya torres: es dato medido y entra al papel. Lo que NO entra es un
// veredicto — sin conductor no hay ampacidad contra la que comparar, y sin
// conductor ni longitud no hay pérdidas (3·I²·R·L). Se dice así, entero.

function borradorElectricos(E) {
  if (E === null) {
    return parrafo('<b>Los parámetros eléctricos no se consultaron al generar este borrador</b>: '
      + 'lo que haya cargado se ve en su pestaña. Esta copia no afirma si hay o no hay medidas.');
  }
  if (!E || !Object.keys(E).length) {
    return parrafo('<b>No hay parámetros eléctricos cargados</b> para esta línea. No es un fallo: '
      + 'es que nadie ha subido todavía el archivo de operación en la pestaña de cargabilidad.');
  }
  const periodo = E.desde && E.hasta
    ? `, del ${esc(String(E.desde))} al ${esc(String(E.hasta))}` : '';
  const partes = [E.archivos ? esc(String(E.archivos)) : null,
    Number.isFinite(E.nSenales) ? `${n(E.nSenales)} señales` : null].filter(Boolean);

  const r = [parrafo(`Lo cargado${E.fuente ? ` desde ${esc(String(E.fuente))}` : ''}${periodo}`
    + `${partes.length ? `: ${partes.join(', ')}` : ''}. <b>Es dato medido, sin veredicto</b>: sin `
    + 'conductor no hay ampacidad contra la que comparar, y tampoco hay pérdidas — faltan el '
    + 'conductor y la longitud de la línea (3·I²·R·L).')];

  const dias = lista(E.dias);
  if (dias.length) {
    r.push(tabla({
      leyenda: 'Días con archivo en el periodo. Un día sin archivo no es un día sin carga: es un '
        + 'día del que no se sabe.',
      cabecera: '<th>Estadístico</th><th class="num">Días con archivo</th><th>Días sin archivo</th>'
        + '<th>Con archivo pero sin corriente</th>',
      filas: dias.map((d) => {
        const D = objeto(d);
        return `<tr><td>${esc(D.estadistico)}</td><td class="num">${n(D.conArchivo)}</td>`
          + `<td>${esc(D.sinArchivo ?? SIN_DATO)}</td><td>${esc(D.sinCorriente ?? SIN_DATO)}</td></tr>`;
      }),
    }));
  }

  const senales = lista(E.senales);
  if (senales.length) {
    const cuando = (x) => {
      const X = objeto(x);
      const c = [X.fecha ? esc(String(X.fecha)) : null,
        X.hora != null ? `${esc(String(X.hora))} h` : null].filter(Boolean).join(' ');
      return c ? `<br><span class="supuesto">${c}</span>` : '';
    };
    r.push(tabla({
      leyenda: 'Lo cargado, señal por señal.',
      cabecera: '<th>Señal</th><th class="num">Horas</th><th class="num">En cero</th>'
        + '<th class="num">Más bajo</th><th class="num">Mediana</th><th class="num">Más alto</th>',
      filas: senales.map((s) => {
        const S = objeto(s);
        const d = S.decimales ?? 1;
        return `<tr><td>${esc(S.senal)}${S.unidad ? ` (${esc(S.unidad)})` : ''}</td>`
          + `<td class="num">${n(S.horas)}</td><td class="num">${S.ceros ? n(S.ceros) : SIN_DATO}</td>`
          + `<td class="num">${n(objeto(S.bajo).valor, d)}${cuando(S.bajo)}</td>`
          + `<td class="num">${n(S.mediana, d)}</td>`
          + `<td class="num">${n(objeto(S.alto).valor, d)}${cuando(S.alto)}</td></tr>`;
      }),
      pie: E.notaSenales ? esc(String(E.notaSenales)) : NOTA_HUECO,
    }));
  }

  const rev = objeto(E.aRevisar);
  if (Number.isFinite(rev.horas)) {
    r.push(parrafo(`<b>A revisar antes de usar estas cifras: ${n(rev.horas)} horas.</b> `
      + `${esc(rev.regla ?? '')}`));
  }
  const avisos = lista(E.avisos).filter((a) => typeof a === 'string' && a);
  if (avisos.length) {
    r.push(`<ul>${avisos.map((a) => `<li>${escRico(a)}</li>`).join('')}</ul>`);
  }
  return r.join('\n');
}

// ── B5 · Lo que este borrador NO demuestra ──────────────────────────────────

/**
 * Las limitaciones del borrador, DERIVADAS de lo que hay y de lo que falta.
 *
 * Misma regla que `limitacionesDeclaradas` del informe completo y por la misma
 * razón: escritas a mano se quedarían desactualizadas, y el día que llegue el
 * conductor seguiría impreso que no hay conductor.
 */
export function limitesDelBorrador(entrada) {
  const e = objeto(entrada);
  const L = objeto(e.linea);
  const R = objeto(e.recorrido);
  const faltan = ordenarFaltas(e.faltan);
  const vecinas = lista(e.vecinas).filter((v) => objeto(v).codigo);
  const codigo = L.codigo ?? 'esta línea';
  const lim = [];

  lim.push({
    titulo: 'No hay torres registradas',
    detalle: `La longitud, los vanos y las deflexiones de este papel son del recorrido levantado`
      + `${R.fecha ? ` el ${R.fecha}` : ''}, no de torres con función declarada. Ninguna estructura `
      + 'tiene veredicto, y este documento no dictamina ninguna.',
    origen: 'torres de la línea',
  });
  if (faltan.includes('conductor')) {
    lim.push({
      titulo: 'No se declaró el conductor',
      detalle: 'Sin masa lineal, sección, módulo elástico y carga de rotura no hay cálculo mecánico: '
        + 'lo que queda es geometría. No se toma el de ninguna otra línea.',
      origen: 'datos del conductor',
    });
  }
  if (faltan.includes('hipotesis')) {
    lim.push({
      titulo: 'No se declaró la hipótesis de cálculo',
      detalle: 'Temperaturas, viento y EDS son la mitad del resultado. Sin declararlas no hay tiros '
        + 'ni flechas que calcular: este borrador no trae ninguno.',
      origen: 'hipótesis de cálculo',
    });
  }
  if (vecinas.length) {
    lim.push({
      titulo: `Comparte torres con ${yLista(vecinas.map((v) => String(v.codigo)))}`,
      detalle: `Cada torre del ${rotuloDeSerie(R.codigoSerie)}`
        + `${Number.isFinite(R.circuitosPorTorre) ? ` lleva ${R.circuitosPorTorre} circuitos y` : ''}`
        + ` sostiene más de una línea: su veredicto depende también de la vecina. Firmar ${codigo} `
        + 'no congela la hipótesis de la otra línea: exige que ya lo esté.',
      origen: 'torres compartidas',
    });
  }
  if (Number.isFinite(R.longitud_m)) {
    lim.push({
      titulo: 'La longitud es la levantada, no la de la línea',
      detalle: `${fraseDeLongitudLevantada(R)}. Empieza y acaba donde llegó la cuadrilla, y puede `
        + 'saltarse torres que no se levantaron. No sirve para calcular pérdidas: para eso hacen '
        + 'falta el conductor y la longitud de la línea.',
      origen: 'recorrido de la línea',
    });
  }
  // La advertencia de las cotas NO puede depender de que alguien haya declarado
  // la precisión: el peligro es la cota en sí. Si la precisión consta, se
  // imprime; si no consta, se dice que no consta — que es peor, no mejor.
  if (Number.isFinite(R.nPuntos) && R.nPuntos > 0) {
    lim.push({
      titulo: Number.isFinite(R.precision_m)
        ? `Las cotas del terreno tienen precisión declarada de ±${R.precision_m} m`
        : 'Las cotas del terreno son las que dio el GPS, sin precisión declarada',
      detalle: 'El error vertical de un GPS de mano es del mismo orden que el gálibo que habría que '
        + 'demostrar. Las cotas sirven de referencia, NO de evidencia: este documento no verifica '
        + 'distancias de seguridad al terreno. Eso se cierra con topografía o LiDAR.',
      origen: 'precisión del levantamiento',
    });
  }
  for (const h of lista(e.calidad)) {
    const H = objeto(h);
    if (H.severidad !== 'atencion') continue;
    lim.push({
      titulo: `Calidad del levantamiento: ${H.titulo}`,
      detalle: String(H.detalle ?? ''),
      origen: 'calidad del levantamiento',
    });
  }
  const E = objeto(e.electricos);
  if (Object.keys(E).length) {
    lim.push({
      titulo: 'Lo medido no tiene veredicto',
      detalle: 'Las corrientes no se comparan con ninguna ampacidad (falta el conductor) y no hay '
        + 'pérdidas (faltan el conductor y la longitud de la línea). Son cifras medidas, no un '
        + 'dictamen de operación.',
      origen: 'parámetros eléctricos',
    });
  }
  lim.push({
    titulo: 'No se declaró norma de referencia',
    detalle: 'Los umbrales del sistema son criterios adoptados por el proyecto, no artículos '
      + 'citables. En este borrador ni siquiera se aplicaron: no hay cálculo que medir contra ellos.',
    origen: 'criterios de evaluación',
  });
  return lim;
}

function borradorLimites(entrada, bloqueo) {
  const lim = limitesDelBorrador(entrada);
  const R = objeto(objeto(entrada).recorrido);
  const hayElectricos = Object.keys(objeto(objeto(entrada).electricos)).length > 0;

  const alcance = `<div class="bloque">
    <h3>Alcance de este borrador</h3>
    <p>Este borrador cubre: el <b>recorrido levantado</b> del ${rotuloDelRecorrido(R)} tal como se
    grabó${hayElectricos ? ', y lo <b>medido</b> en el sistema de operación' : ''}.</p>
    <p>Este borrador <b>NO</b> cubre: torres, cálculo mecánico, cargas sobre las estructuras,
    capacidad en corriente, pérdidas ni cantidades. Tampoco lo que no cubre el informe completo: la
    verificación en campo de distancias de seguridad al terreno y a cruces; el cálculo estructural de
    apoyos, cimentaciones y retenidas; el diseño del aislamiento y la coordinación de aislamiento; los
    estudios eléctricos de la línea; ni el estado de conservación de los componentes.</p>
    <p><b>Nada de lo que sigue invalida lo que sí trae este papel.</b> Lo que hace es decir con
    exactitud hasta dónde llega — que es la razón por la que no se puede firmar todavía.</p>
  </div>`;

  const filas = lim.map((l) => `<li><b>${esc(l.titulo)}</b><br>${esc(l.detalle)}
    <span class="origen">Origen: ${esc(l.origen)}</span></li>`).join('');

  return `${alcance}
<div class="bloque"><h3>Limitaciones declaradas (${n(lim.length)})</h3>
  <p>Cada una se DERIVA de los datos con que se generó este borrador. No están escritas a mano y no
  se quedan desactualizadas: el día que llegue el dato que falta, la limitación desaparece sola del
  informe siguiente.</p></div>
<ol>${filas}</ol>
<div class="firma-bloqueada">${bloqueo.texto}</div>`;
}

// ── B6 · La portada del borrador ────────────────────────────────────────────

function portadaBorrador(linea, R, vecinas, electricos, meta, indice, bloqueo) {
  const L = objeto(linea);
  const identidad = [L.nombre, L.tensionNominal_kV != null ? `${n(L.tensionNominal_kV)} kV` : null,
    L.propietario].filter(Boolean).map(esc).join(' · ');
  const conVecinas = lista(vecinas).filter((v) => objeto(v).codigo);

  const renglones = [];
  renglones.push(`<li>Línea ${esc(L.codigo ?? 'sin identificar')}`
    + `${L.tensionNominal_kV != null ? ` · ${n(L.tensionNominal_kV)} kV` : ''}</li>`);
  renglones.push('<li>Torres registradas: <b>ninguna</b> · longitud de la línea no declarada</li>');
  if (Number.isFinite(R.nPuntos) && R.nPuntos > 0) {
    renglones.push(`<li>Recorrido guardado aparte: ${rotuloDelRecorrido(R)} · `
      + `${n(R.nPuntos)} puntos del GPS · ${nu(R.longitud_m, 2, 'm')} entre puntos · `
      + `${esc(R.rotulo ?? 'sin registrar como torres')}</li>`);
    const geo = [R.datum ? `sistema de referencia ${esc(R.datum)}` : null,
      R.metodo ? `método ${esc(R.metodo)}` : null,
      Number.isFinite(R.precision_m)
        ? `precisión declarada ±${n(R.precision_m)} m — cotas GPS referenciales, NO aptas para `
          + 'verificar distancias de seguridad' : null].filter(Boolean);
    if (geo.length) renglones.push(`<li>${geo.join(' · ').replace(/^./, (c) => c.toUpperCase())}</li>`);
  } else {
    renglones.push('<li>Recorrido guardado aparte: <b>ninguno</b> — de esta línea no consta todavía '
      + 'ni una jornada de campo</li>');
  }
  if (conVecinas.length) {
    renglones.push(`<li>Recorre el ${esc(rotuloDeSerie(R.codigoSerie))} junto con `
      + `${yLista(conVecinas.map((v) => esc(v.codigo)))}`
      + `${Number.isFinite(R.circuitosPorTorre)
        ? `: ${n(R.circuitosPorTorre)} circuitos tendidos en cada torre` : ''}</li>`);
  }
  const E = objeto(electricos);
  if (Object.keys(E).length) {
    renglones.push(`<li>Parámetros eléctricos: ${esc(String(E.fuente ?? 'lo cargado en el sistema'))}`
      + `${E.desde && E.hasta ? `, del ${esc(String(E.desde))} al ${esc(String(E.hasta))}` : ''}`
      + `${E.archivos ? ` · ${esc(String(E.archivos))}` : ''}</li>`);
  }
  const motor = meta.versionNucleo ?? meta.versionMotor;
  renglones.push(`<li>Motor de cálculo @lineas/nucleo: ${motor
    ? `v${esc(motor)}` : '<b>versión NO declarada</b>'} — en este borrador no calculó nada</li>`);
  renglones.push('<li>Conductor: <b>no declarado</b> — no se usa el de otra línea</li>');
  renglones.push('<li>Hipótesis de cálculo: <b>no declarada</b></li>');
  renglones.push(`<li>${meta.generadoEn ? `Generado ${esc(meta.generadoEn)} · ` : ''}`
    + `Exportador @lineas/exportar v${esc(VERSION_EXPORTADOR)} · generado desde los datos del `
    + 'sistema, no desde la pantalla (ADR-005/006)</li>');

  return `<section class="portada">
  <p class="borrador">${TITULO_BORRADOR}</p>
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
    <ul>${indice.map((t, i) => `<li>${i + 1}. ${esc(t)}</li>`).join('')}</ul>
    <p class="nota">Sin enlaces internos a propósito: en papel un enlace no lleva a ninguna parte,
    y el documento se guarda impreso tan a menudo como en pantalla.</p>
  </div>

  <div class="firma bloque">
    <p class="nota">El sistema produce las cifras; la responsabilidad técnica es de quien firma.</p>
    <div class="firma-bloqueada">${bloqueo.texto}
      ${tabla({
    leyenda: 'Lo que desbloquea la firma. Mientras haya un círculo (○) en esta tabla, este '
        + 'documento sigue siendo un borrador.',
    cabecera: bloqueo.cabecera,
    filas: bloqueo.filas,
  })}
    </div>
    <div class="linea-firma tachada">Ingeniero responsable — nombre, matrícula profesional y fecha</div>
  </div>
</section>`;
}

// ── Función pública del BORRADOR ────────────────────────────────────────────

/**
 * Genera el BORRADOR NO FIRMABLE de una línea sin torres (y normalmente sin
 * conductor ni hipótesis), en un solo archivo HTML autocontenido.
 *
 * Aquí NO se calcula nada: el recorrido llega ya derivado, igual que al informe
 * completo le llegan los tramos y los vanos ya calculados por `nucleo/`.
 *
 * @param {Object} [entrada]
 * @param {Object} [entrada.linea]      documento `Linea`
 * @param {Object} [entrada.recorrido]  el recorrido levantado, YA derivado:
 *   `{ codigoSerie, rotulo, fecha, aparato, desde, hasta, nPuntos, nVanos,
 *      longitud_m, vanoMax_m, vanoMin_m, vanoMedio_m, medianaVano_m,
 *      precision_m, datum, metodo, circuitosPorTorre, puntos[], sospechosos[] }`
 *   `puntos`: `{ nombre, hora, cota_m, vanoSiguiente_m, deflexion_grados,
 *      margenDeflexion_grados, notaDeflexion }`
 * @param {Array}  [entrada.vecinas]    otras líneas del mismo tramo: `{ codigo, faltan? }`
 * @param {string[]} [entrada.faltan]   'torres' | 'conductor' | 'hipotesis'
 * @param {Array}  [entrada.calidad]    hallazgos de `calidadLevantamiento`, si los hay
 * @param {Object} [entrada.electricos] lo medido, ya resumido para el papel
 * @param {Object} [entrada.meta]       `{ generadoEn, versionNucleo, generadoPor }`
 * @returns {string} documento HTML completo, sin JavaScript y sin recursos externos
 */
export function informeBorradorHtml(entrada) {
  const e = objeto(entrada);
  const linea = objeto(e.linea);
  const meta = objeto(e.meta);
  const R = objeto(e.recorrido);
  const vecinas = lista(e.vecinas);
  // `undefined` se distingue de la lista vacía en las dos: ver `seccionCalidad`
  // y `borradorElectricos`.
  const calidad = e.calidad === undefined ? null : lista(e.calidad);
  const electricos = e.electricos === undefined ? null : objeto(e.electricos);
  // Sin lista explícita, lo que falta es lo que se deduce de lo que no llegó.
  // Las torres SIEMPRE faltan en un borrador: es lo que lo hace borrador.
  const faltan = lista(e.faltan).length
    ? ordenarFaltas(e.faltan)
    : ['torres', 'conductor', 'hipotesis'];

  const bloqueo = bloqueoDeFirma({ linea, faltan, vecinas, recorrido: R });

  // El índice se ARMA de esta lista, igual que en el informe completo: así no
  // puede desincronizarse del cuerpo.
  const cuerpo = [
    { titulo: 'Resumen ejecutivo', html: borradorResumen(R, electricos, vecinas) },
    { titulo: 'Torres: sin registrar', html: borradorTorres(linea, R, vecinas) },
  ];
  if (Number.isFinite(R.nPuntos) && R.nPuntos > 0) {
    cuerpo.splice(1, 0, { titulo: 'Calidad del levantamiento', html: seccionCalidad(calidad) });
  }
  cuerpo.push({
    titulo: 'Cálculo, cargas, capacidad y cantidades: no se calculan',
    html: borradorNoSeCalcula(linea, R, vecinas),
  });
  cuerpo.push({ titulo: 'Parámetros eléctricos medidos', html: borradorElectricos(electricos) });
  cuerpo.push({
    titulo: 'Lo que este borrador NO demuestra',
    html: borradorLimites({ linea, recorrido: R, vecinas, faltan, calidad, electricos }, bloqueo),
    clase: 'limites',
  });

  const indice = cuerpo.map((s) => s.titulo);
  const secciones = cuerpo.map((s, i) =>
    `<section${s.clase ? ` class="${s.clase}"` : ''}>
  <h2>${i + 1}. ${esc(s.titulo)}</h2>
  ${s.html}
</section>`).join('\n');

  const titulo = `BORRADOR NO FIRMABLE — línea ${linea.codigo ?? 'sin identificar'}`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<style>${ESTILO}${ESTILO_BORRADOR}</style>
</head>
<body>
<main class="hoja">
${portadaBorrador(linea, R, vecinas, electricos, meta, indice, bloqueo)}
${secciones}
<p class="pie">${esc(linea.codigo ?? 'Línea sin identificar')} · documento generado por la plataforma de
mantenimiento de líneas AT${meta.generadoEn ? ` el ${esc(meta.generadoEn)}` : ''}. Este documento no
certifica nada por sí mismo: certifica el ingeniero que lo firma.
<b>${TITULO_BORRADOR}: no se puede firmar.</b></p>
</main>
</body>
</html>`;
}
