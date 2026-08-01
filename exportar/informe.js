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
    longitud_m: Number.isFinite(L.longitud_m) ? L.longitud_m : 0,
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
        : 'Ninguno supera el tope adoptado en la hipótesis.'),
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

// ── 4 · Cálculo mecánico por tramo ──────────────────────────────────────────

function seccionMecanica(tramos, conductor, hipotesis) {
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
  const veredicto = excedidos.length
    ? `<p class="aviso"><b>Atención:</b> ${n(excedidos.length)} tramo(s) superan el tope de tiro adoptado: `
      + `${excedidos.map((t, i) => esc(String(t?.n ?? i + 1))).join(', ')}. `
      + 'El sistema señala el hecho; la decisión de aceptarlo, retensar o recalcular es del ingeniero.</p>'
    : parrafo('Ningún tramo supera el tope de tiro adoptado en la hipótesis.');

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
  const cierre = fuera
    ? `<p class="aviso"><b>${n(fuera)} vano(s)</b> se apartan más de un 30 % del VIR de su tramo (marcados con ▲). `
      + 'El tiro común del tramo los representa peor que a los demás, y la desviación va por el lado malo: '
      + 'en el vano largo la flecha real sale MAYOR que la calculada, justo donde se decide el gálibo. '
      + 'Síntoma en campo: la distancia medida con cinta no coincide con la del informe, y siempre en el '
      + 'vano más largo.</p>'
    : parrafo('Todos los vanos quedan dentro de la banda adoptada respecto al VIR de su tramo, '
      + 'de modo que el tiro común del tramo los representa a todos por igual.');

  return bloques.join('') + cierre;
}

// ── 6 · Umbrales ────────────────────────────────────────────────────────────

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

// ── 7 · Cantidades ──────────────────────────────────────────────────────────

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

// ── 8 · Expediente de falla ─────────────────────────────────────────────────

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

// ── 9 · Lo que este informe no demuestra ────────────────────────────────────

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
  if (fuera) {
    add(`${n(fuera)} vano(s) quedan fuera de la banda adoptada respecto al VIR de su tramo`,
      'En esos vanos el tiro común del tramo los representa peor que a los demás, y la desviación va por '
      + 'el lado inseguro: la flecha real del vano largo sale MAYOR que la calculada.', 'cálculo mecánico');
  }

  // 10 · Lo que un expediente de falla todavía no puede afirmar.
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
  const cantidades = objeto(e.cantidades);
  const investigaciones = lista(e.investigaciones);
  const calidad = lista(e.calidad ?? calidadLevantamiento(lev));

  // El índice de la portada se ARMA de esta lista, no se escribe aparte: así no
  // puede desincronizarse del cuerpo. Añadir una sección aquí la añade al índice.
  const cuerpo = [
    { titulo: 'Resumen ejecutivo', html: resumenEjecutivo(lev, tramos, indicadores, conductor) },
    { titulo: 'Calidad del levantamiento', html: seccionCalidad(calidad) },
    { titulo: 'Cálculo mecánico por tramo de tensión', html: seccionMecanica(tramos, conductor, hipotesis) },
    { titulo: 'Detalle vano a vano', html: seccionVanos(grupos) },
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
