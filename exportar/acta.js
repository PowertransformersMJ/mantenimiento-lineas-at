// ============================================================================
// exportar/acta.js — el acta de una carga de puntos, como documento
// ----------------------------------------------------------------------------
// QUÉ ES. El papel que queda de un acto que NO SE PUEDE DESHACER. Un punto
// cargado no se borra ni se corrige desde la aplicación —está diseñado así para
// que nadie borre historia—, de modo que la única defensa posible es que quede
// escrito qué se hizo, quién lo hizo, con qué archivo y por qué.
//
// POR QUÉ EXISTE ESTE ARCHIVO Y NO BASTA CON LO QUE SE GUARDA EN LA BASE. El
// molde de un apoyo guarda dónde está el punto y qué papel cumple, pero no
// tiene dónde guardar el RAZONAMIENTO: por qué el Ingeniero decidió que ese
// pórtico es Terminal, por qué ese punto va en ese vano y no en el siguiente, o
// por qué uno de los tres que traía el aparato se quedó fuera. Ese razonamiento
// es justo lo que hará falta el día que alguien pregunte, y hoy solo existe
// mientras dure la memoria de quien decidió.
//
// LAS TRES REGLAS QUE GOBIERNAN EL ACTA:
//
// 1. **DECLARA LO QUE QUEDÓ FUERA.** Un acta que solo cuenta lo que entró
//    convierte una decisión deliberada («éste no lo verifiqué») en un olvido
//    silencioso. Lo que no se cargó sale con su motivo, con el mismo peso
//    tipográfico que lo que sí.
// 2. **NO CONVIERTE UNA AUSENCIA EN UN CERO.** Si el aparato no grabó la cota,
//    el acta dice que no la grabó. Un cero se leería como nivel del mar.
// 3. **DISTINGUE LO FIRMADO DE LO SUPUESTO.** Un papel estructural que el
//    Ingeniero no confirmó sale marcado como supuesto, en la fila y en el
//    resumen. Poner la firma de alguien sobre lo que no firmó es peor que no
//    tener el dato.
//
// AUTOCONTENIDO: cero JavaScript y cero recursos externos, igual que
// `informe.js`. Se abre con doble clic dentro de diez años y se ve igual.
// ============================================================================
import { ESTILO, esc, n, parrafo, nota, tabla, lista, objeto } from './informe.js';

const SIN_DATO = '—';

/** Fecha y hora en castellano. Si no hay instante, se dice; no se inventa. */
function cuandoLegible(iso) {
  if (!iso) return SIN_DATO;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' });
}

/** Coordenada tal cual se cargó, con los decimales que el aparato entregó. */
const coordenada = (p) => (Number.isFinite(p?.lat) && Number.isFinite(p?.lon)
  ? `${n(p.lat, 6)} ; ${n(p.lon, 6)}`
  : SIN_DATO);

/**
 * La cota, o la declaración de que no la hay.
 *
 * Regla 2 de la cabecera, aplicada: `null`/`undefined` NO son cero.
 */
const cota = (p) => (Number.isFinite(p?.cotaTerreno_m)
  ? `${n(p.cotaTerreno_m, 1)} m`
  : 'el GPS no la grabó');

// ── 1 · Encabezado: quién, cuándo y desde qué archivo ───────────────────────

function encabezado(entrada) {
  const L = objeto(entrada.linea);
  const Q = objeto(entrada.quien);
  const archivos = lista(entrada.archivos);

  const identidad = [L.codigo, L.nombre,
    Number.isFinite(L.tensionNominal_kV) ? `${n(L.tensionNominal_kV)} kV` : null]
    .filter(Boolean).map(esc).join(' · ');

  const filasArchivo = archivos.map((a) => `<tr>
    <td>${esc(a.nombre)}</td>
    <td>${esc(a.creator ?? SIN_DATO)}</td>
    <td class="num">${n(a.puntos)}</td>
  </tr>`);

  return `<section class="portada">
  <p class="rotulo">Acta de carga de puntos</p>
  <h1>${identidad || 'Línea sin identificar'}</h1>
  <p class="lema">Este sistema no certifica nada. Certifica el ingeniero que firma.
  El trabajo del sistema es hacer barato comprobar que ese ingeniero tiene razón.</p>

  <div class="procedencia">
    <h3>Quién cargó y cuándo</h3>
    <ul>
      <li><b>Quién:</b> ${esc(Q.correo ?? SIN_DATO)}</li>
      <li><b>Organización:</b> ${esc(Q.organizacion ?? SIN_DATO)}</li>
      <li><b>Permiso con el que entró:</b> ${esc(Q.rol ?? SIN_DATO)}</li>
      <li><b>Cuándo:</b> ${esc(cuandoLegible(entrada.cuando))}</li>
    </ul>
  </div>

  ${tabla({
    leyenda: 'Archivos aportados. Se leyeron en el computador del Ingeniero: no se subieron a ningún sitio.',
    cabecera: '<th>Archivo</th><th>Aparato que lo escribió</th><th class="num">Puntos marcados</th>',
    filas: filasArchivo,
  })}
  ${archivos.length ? '' : nota('No consta el archivo de origen de esta carga.')}
</section>`;
}

// ── 2 · Lo que se cargó ─────────────────────────────────────────────────────

function loQueSeCargo(entrada) {
  const puntos = lista(entrada.cargados);
  if (!puntos.length) {
    return `<h2>Lo que se cargó</h2>${parrafo('<b>No se cargó ningún punto.</b> '
      + 'La línea quedó exactamente como estaba.')}`;
  }

  const filas = puntos.map((p) => `<tr>
    <td><b>${esc(p.nombre)}</b></td>
    <td>${esc(p.nombreCampo ?? SIN_DATO)}</td>
    <td>${esc(p.tipoPunto ?? SIN_DATO)}</td>
    <td>${esc(p.funcionEstructural ?? SIN_DATO)}<br>
        <span class="sello ${p.funcionConfirmada ? 'sello-cumple' : 'sello-nulo'}">${
          p.funcionConfirmada ? 'confirmada por el Ingeniero' : 'SUPUESTA, sin firmar'}</span></td>
    <td>${esc(p.donde ?? SIN_DATO)}</td>
    <td class="num">${esc(coordenada(p))}</td>
    <td>${esc(cota(p))}</td>
    <td>${esc(p.tomadaEn ? cuandoLegible(p.tomadaEn) : 'el GPS no la grabó')}</td>
  </tr>`);

  const supuestas = puntos.filter((p) => !p.funcionConfirmada);

  const porQue = puntos.filter((p) => String(p.porQue ?? '').trim());
  const bloquePorQue = porQue.length
    ? `<h3>Por qué se decidió así</h3><ul>${porQue.map((p) =>
        `<li><b>${esc(p.nombre)}:</b> ${esc(p.porQue)}</li>`).join('')}</ul>`
    : nota('No se escribió el razonamiento de ninguna de estas decisiones. '
      + 'El molde de los datos no tiene dónde guardarlo: si no está aquí, no está en ningún sitio.');

  return `<h2>Lo que se cargó</h2>
${parrafo(`Se crearon <b>${n(puntos.length)}</b> punto(s). `
  + 'Un punto creado <b>no se puede borrar ni corregir</b> desde la aplicación.')}
${tabla({
  leyenda: 'Cada punto, tal como quedó escrito.',
  cabecera: '<th>Nombre</th><th>Como lo grabó el aparato</th><th>Qué es</th>'
    + '<th>Papel estructural</th><th>Dónde entró</th><th class="num">Coordenada (lat ; lon)</th>'
    + '<th>Cota del terreno</th><th>Hora de la toma</th>',
  filas,
  pie: 'Coordenadas en WGS84, tomadas con GPS de mano: el aparato declara ±8 m. '
    + 'El error vertical de un aparato de mano es del mismo orden que el gálibo que hay que demostrar: '
    + 'estas cotas NO son topografía.',
})}
${supuestas.length
  ? `<p class="aviso"><b>${n(supuestas.length)} punto(s) quedaron con el papel estructural SUPUESTO</b>, `
    + `no firmado por el Ingeniero: ${supuestas.map((p) => esc(p.nombre)).join(', ')}. `
    + 'De ese papel sale dónde se corta el tramo de tensión, y con eso el cálculo mecánico. '
    + 'La ficha de cada uno lo dirá mientras siga sin confirmar.</p>'
  : parrafo('Todos los papeles estructurales de esta carga los confirmó el Ingeniero.')}
${bloquePorQue}`;
}

// ── 3 · Lo que NO se cargó ──────────────────────────────────────────────────

/**
 * La sección que hace que este papel valga.
 *
 * Va SIEMPRE, tenga o no algo que declarar. Una sección que aparece solo cuando
 * hay malas noticias enseña a leerla como una alarma; una que va siempre enseña
 * a leerla como parte del trabajo.
 */
function loQueQuedoFuera(entrada) {
  const ignorados = lista(entrada.ignorados);
  const bloqueados = lista(entrada.bloqueados);
  const yaEstaban = lista(entrada.yaEstaban);
  const rechazados = lista(entrada.rechazados);

  if (!ignorados.length && !bloqueados.length && !yaEstaban.length && !rechazados.length) {
    return `<h2>Lo que quedó fuera</h2>${parrafo(
      '<b>Nada quedó fuera.</b> Todos los puntos que traía el archivo se cargaron.')}`;
  }

  const bloques = [];

  if (ignorados.length) {
    bloques.push(`<h3>Los dejó pendientes usted</h3>${tabla({
      leyenda: 'No se cargaron porque no los aprobó. Siguen pendientes: no se han perdido.',
      cabecera: '<th>Punto</th><th>Como lo grabó el aparato</th><th>Motivo</th>',
      filas: ignorados.map((x) => `<tr>
        <td>${esc(x.nombreCanonico ?? 'sin emparejar')}</td>
        <td>${esc(x.nombreCampo ?? SIN_DATO)}</td>
        <td>${esc(x.motivo ?? SIN_DATO)}</td>
      </tr>`),
    })}`);
  }

  if (bloqueados.length) {
    bloques.push(`<h3>Hoy no se pueden cargar</h3>${tabla({
      leyenda: 'El sistema se negó, y aquí está el motivo entero.',
      cabecera: '<th>Punto</th><th>Por qué no se pudo</th>',
      filas: bloqueados.map((x) => `<tr>
        <td>${esc(x.nombreCanonico ?? x.nombreCampo ?? SIN_DATO)}</td>
        <td>${esc(x.motivo ?? SIN_DATO)}</td>
      </tr>`),
    })}`);
  }

  if (yaEstaban.length) {
    bloques.push(`<h3>Ya estaban en la línea</h3>${parrafo(
      'No se volvieron a escribir: el segundo documento habría pisado al primero, '
      + 'con sus fotos y su expediente. '
      + yaEstaban.map((x) => `<b>${esc(x)}</b>`).join(', ') + '.')}`);
  }

  if (rechazados.length) {
    bloques.push(`<h3>No cumplían el molde de los datos</h3>${tabla({
      leyenda: 'Se comprobaron ANTES de mandarlos a la base. Ninguno llegó a escribirse.',
      cabecera: '<th>Punto</th><th>Qué no cumplía</th>',
      filas: rechazados.map((x) => `<tr>
        <td>${esc(x.nombre ?? SIN_DATO)}</td>
        <td>${esc(x.motivo ?? SIN_DATO)}</td>
      </tr>`),
    })}`);
  }

  return `<h2>Lo que quedó fuera</h2>${bloques.join('')}`;
}

// ── 4 · Cómo se movieron las cifras ─────────────────────────────────────────

function comoSeMovieron(entrada) {
  const filas = lista(entrada.cifras);
  if (!filas.length) return '';
  return `<h2>Cómo se movieron las cifras de la línea</h2>
${parrafo('Las produce el <b>mismo motor</b> que pinta las demás pantallas, corrido dos veces: '
  + 'una con la línea como estaba y otra con los puntos nuevos dentro. '
  + 'Aquí no hay una segunda aritmética.')}
${tabla({
  leyenda: 'Antes y después. Se declara también lo que NO se movió.',
  cabecera: '<th>Cifra</th><th>Antes</th><th>Después</th><th>¿Se movió?</th>',
  filas: filas.map((f) => `<tr${f.cambia ? ' class="revisar"' : ''}>
    <td>${esc(f.rotulo)}${f.porQue ? `<br><span class="origen">${esc(f.porQue)}</span>` : ''}</td>
    <td class="num">${esc(f.antes)}</td>
    <td class="num">${esc(f.despues)}</td>
    <td>${f.cambia ? 'sí' : 'no se movió'}</td>
  </tr>`),
})}`;
}

// ── 5 · Lo que esta acta NO demuestra ───────────────────────────────────────

/**
 * Obligatoria, como en el informe técnico. Un acta sin sus límites al lado
 * invita exactamente a la conclusión que este sistema quiere impedir: que un
 * punto cargado sea un punto verificado.
 */
function limites() {
  return `<section class="limites">
  <h2>Lo que esta acta NO demuestra</h2>
  <ol>
    <li><b>Que la coordenada sea la buena.</b> Es la que el GPS de mano grabó, con ±8 m
      declarados. No se comprobó contra topografía ni contra cartografía catastral.</li>
    <li><b>Que el punto esté en el vano correcto.</b> El sitio lo eligió el Ingeniero;
      el sistema no lo propuso ni lo verificó. A ±8 m, la distancia sola no decide de qué lado cae.</li>
    <li><b>Que el papel estructural sea el correcto</b> en los puntos marcados como SUPUESTOS.
      De él sale dónde se corta el tramo de tensión y con eso el cálculo mecánico.</li>
    <li><b>Que la cota sirva para verificar el gálibo.</b> No sirve: el error vertical de un
      aparato de mano es del mismo orden que la distancia que habría que demostrar.</li>
    <li><b>Que esto se pueda deshacer.</b> No se puede. Un punto cargado no se borra ni se
      corrige desde la aplicación. Corregirlo exige la llave de administración, desde el repositorio.</li>
  </ol>
</section>`;
}

/**
 * El acta completa de una carga.
 *
 * @param {Object} entrada
 * @param {Object} entrada.linea      `{codigo, nombre, tensionNominal_kV}`
 * @param {Object} entrada.quien      `{correo, organizacion, rol}` — nunca un identificador interno
 * @param {string} entrada.cuando     instante de la carga, en ISO
 * @param {Object[]} [entrada.archivos]   `{nombre, creator, puntos}`
 * @param {Object[]} [entrada.cargados]   los puntos creados, con su razonamiento
 * @param {Object[]} [entrada.ignorados]  los que el Ingeniero dejó fuera, con su motivo
 * @param {Object[]} [entrada.bloqueados] los que hoy no se pueden cargar, con el porqué
 * @param {string[]} [entrada.yaEstaban]  los que ya estaban en la línea
 * @param {Object[]} [entrada.rechazados] los que no cumplían el molde de los datos
 * @param {Object[]} [entrada.cifras]     el antes/después ya formateado
 * @returns {string} HTML autocontenido
 */
export function actaHtml(entrada) {
  const e = objeto(entrada);
  const L = objeto(e.linea);
  const titulo = `Acta de carga · ${L.codigo ?? 'línea sin identificar'}`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<style>${ESTILO}</style>
</head>
<body>
<div class="hoja">
${encabezado(e)}
${loQueSeCargo(e)}
${loQueQuedoFuera(e)}
${comoSeMovieron(e)}
${limites()}
<p class="pie">Acta generada por la propia aplicación en el momento de la carga.
Archívese: es el único sitio donde queda escrito por qué se decidió cada cosa.</p>
</div>
</body>
</html>`;
}
