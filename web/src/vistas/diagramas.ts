// ============================================================================
// vistas/diagramas.ts — las nueve figuras de la pestaña Fundamentos
// ----------------------------------------------------------------------------
// QUÉ ES: un generador de SVG como CADENA de texto. Nueve figuras, una por
// concepto de la pestaña Fundamentos, dibujadas sobre el mismo lienzo.
//
// POR QUÉ EXISTE: el módulo original explicaba cada concepto en tres tiempos —
// concepto → FIGURA → fórmula. Al portarlo a la web se perdió la figura, y con
// ella el orden de lectura: quedó texto y fórmula seguidos, que es justo lo que
// un ingeniero de campo no lee. La figura es la que hace que la fórmula
// signifique algo antes de leerla.
//
// QUÉ REGLA LO GOBIERNA:
//  · Cadena PURA. No toca `document` ni `window`, no importa nada. Así se puede
//    probar con `node --test` sin navegador, y una figura no puede romperse
//    porque cambió otro módulo. Por eso NO reutiliza `nf` de ./formato: ese
//    módulo arrastra @lineas/exportar, y una figura no debería poder caerse
//    porque un exportador se movió de sitio.
//  · Color SOLO por variable CSS (--acc, --az, --rd, --gr, --mut, --tx). Ni un
//    hex fijo: la app tiene tema oscuro y hoja de impresión en claro (estilo.css
//    §@media print redefine la paleta entera). Un #f0a500 incrustado aquí sale
//    ámbar sobre papel blanco y no hay forma de corregirlo desde la hoja.
//  · No se inventan datos. Si un valor no llega o no es utilizable, la figura
//    se dibuja genérica y la etiqueta se queda SIMBÓLICA ("f = flecha"), nunca
//    con un número de relleno. Y lo que el sistema no puede calcular —la altura
//    de sujeción, el vano peso— se dibuja rotulado, jamás acotado con cifra.
//
// LA MEJORA SOBRE EL ORIGINAL: el original dibujaba siempre el caso genérico.
// Aquí, si llegan los datos de la línea, la panza de la curva, las marcas de la
// barra y la abertura del ángulo se dibujan DONDE la línea trabaja de verdad.
//
// ⚠️ LA MENTIRA DECLARADA: la escala vertical está exagerada ×6 a propósito.
// Una flecha real es del orden del 3 % del vano; dibujada a escala, la catenaria
// de una línea de alta tensión es una raya recta y la figura no enseña nada. Lo
// que NO se falsea es el ORDEN: más flecha real, más panza en el dibujo; una
// curva caliente siempre queda por debajo de la fría.
// ============================================================================

export type IdDiagrama = 'cat' | 'flecha' | 'vir' | 'tens' | 'cambio' | 'defl' | 'vanos' | 'amp' | 'terr';

/**
 * Lo que la pantalla puede pasarle a una figura para que deje de ser genérica.
 * Todo es opcional: una figura tiene que poder dibujarse en la pantalla de
 * ayuda, antes de que exista una sola línea cargada.
 */
export interface DatosDiagrama {
  flechaMax_m?: number;
  flechaMin_m?: number;
  vano_m?: number;
  pctEds?: number;
  pctViento?: number;
  pctTope?: number;
  deflexion_grados?: number;
  vanos_m?: number[];
  tMax_C?: number;
  tMin_C?: number;
}

// ── Lienzo común ────────────────────────────────────────────────────────────
// Las nueve comparten viewBox. No es capricho: van una debajo de otra en la
// misma pestaña, y si cada una trae su propia proporción el lector percibe que
// unas "pesan" más que otras y les asigna importancia que no tienen.
const ANCHO = 560;
const ALTO = 230;

const X_IZQ = 70;             // eje del apoyo izquierdo en las figuras de vano
const X_DER = 490;            // eje del apoyo derecho
const VANO_PX = X_DER - X_IZQ;
const X_MED = (X_IZQ + X_DER) / 2;
const Y_SUJ = 48;             // altura del punto de sujeción (cruceta)
const Y_TOPE_POSTE = 38;      // el poste sobresale un poco por encima
const Y_SUELO = 196;

/**
 * Cuánta panza se dibuja. A escala real no se vería nada (ver la cabecera), así
 * que se amplifica y se acota. Los topes son lo que impide que un dato absurdo
 * —una flecha del 40 % del vano— saque la curva del lienzo y deje la tarjeta en
 * blanco.
 */
const EXAGERACION = 6;
const PANZA_MIN = 16;

// ── Colores: única puerta de salida hacia el atributo `fill`/`stroke` ────────
type Tono = 'acc' | 'az' | 'rd' | 'gr' | 'mut' | 'tx';
const COLOR: Record<Tono, string> = {
  acc: 'var(--acc)',
  az: 'var(--az)',
  rd: 'var(--rd)',
  gr: 'var(--gr)',
  mut: 'var(--mut)',
  tx: 'var(--tx)',
};

// ── Utilería numérica ───────────────────────────────────────────────────────
const acota = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/**
 * Todo número que llega a un atributo pasa por aquí.
 *
 * ⚠️ Trampa que ya nos costó una tarjeta en blanco en el original: un solo
 * `NaN` dentro del atributo `d` de un `<path>` invalida el path ENTERO y el
 * navegador no dibuja nada — sin error en consola. Un trazo caído en el 0 se ve
 * y se investiga; una figura vacía parece que "no cargó" y nadie la reporta.
 * Por eso aquí no se propaga el no-finito: se aterriza en 0.
 */
const px = (v: number): string => (Number.isFinite(v) ? String(Math.round(v * 10) / 10) : '0');

/** Cifra para rótulo, en formato es-CO (coma decimal). Sin ceros de adorno. */
function cifra(v: number, dec = 1): string {
  if (!Number.isFinite(v)) return '—';
  const r = Math.round(v * 10 ** dec) / 10 ** dec;
  return r.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: dec });
}

/**
 * Escape de XML. Hoy los rótulos son texto nuestro y cifras, así que no puede
 * entrar marcado; se mantiene porque el día que alguien meta aquí el nombre de
 * un apoyo capturado en campo (`E-07 & 08`), un `&` suelto rompe el SVG entero.
 */
const esc = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── Primitivas de dibujo ────────────────────────────────────────────────────

interface OpcTrazo {
  grosor?: number;
  guion?: string;
  /** id del marcador de punta (sin `#`), para el extremo final. */
  punta?: string;
  /** id del marcador de punta para el extremo inicial: cota de doble flecha. */
  puntaInicio?: string;
  opacidad?: number;
}

function trazo(x1: number, y1: number, x2: number, y2: number, tono: Tono, o: OpcTrazo = {}): string {
  return `<line x1="${px(x1)}" y1="${px(y1)}" x2="${px(x2)}" y2="${px(y2)}"`
    + ` stroke="${COLOR[tono]}" stroke-width="${o.grosor ?? 1.6}"`
    + (o.guion ? ` stroke-dasharray="${o.guion}"` : '')
    + (o.opacidad !== undefined ? ` stroke-opacity="${o.opacidad}"` : '')
    + (o.punta ? ` marker-end="url(#${o.punta})"` : '')
    + (o.puntaInicio ? ` marker-start="url(#${o.puntaInicio})"` : '')
    + ' />';
}

function texto(
  x: number, y: number, t: string,
  tono: Tono = 'mut', tam = 10.5, anclaje: 'start' | 'middle' | 'end' = 'start',
): string {
  // Sin `font-family`: la figura hereda la tipografía de la app. El original la
  // fijaba en "sans-serif" y por eso sus rótulos no casaban con el resto.
  return `<text x="${px(x)}" y="${px(y)}" fill="${COLOR[tono]}" font-size="${tam}"`
    + ` text-anchor="${anclaje}">${esc(t)}</text>`;
}

const poste = (x: number, yTop: number, yBase: number, tono: Tono = 'mut'): string =>
  trazo(x, yTop, x, yBase, tono, { grosor: 4 });

const suelo = (y: number, x1 = 26, x2 = ANCHO - 20): string =>
  trazo(x1, y, x2, y, 'mut', { grosor: 2, guion: '5,4', opacidad: 0.7 });

/** Marquita perpendicular de cota: el "tope" del acotado. */
const topeCota = (x: number, y: number, tono: Tono, medio = 5, vertical = true): string =>
  vertical ? trazo(x, y - medio, x, y + medio, tono, { grosor: 1.4 })
           : trazo(x - medio, y, x + medio, y, tono, { grosor: 1.4 });

/**
 * Puntas de flecha. Los `id` van prefijados con el id de la figura porque las
 * nueve conviven en el MISMO documento HTML: si las nueve declaran `<marker
 * id="ar">`, el navegador se queda con la primera y las otras ocho heredan su
 * color. Síntoma: en la pestaña, la flecha roja de "resultante" sale ámbar.
 *
 * `orient="auto-start-reverse"` permite usar el mismo marcador en los dos
 * extremos de una cota sin declarar una versión espejada.
 */
function puntas(fig: string, tonos: Tono[]): string {
  const uno = (t: Tono) =>
    `<marker id="${fig}-${t}" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9"`
    + ` refX="7.6" refY="4.5" orient="auto-start-reverse">`
    + `<path d="M0,1 L8,4.5 L0,8 z" fill="${COLOR[t]}" /></marker>`;
  return `<defs>${tonos.map(uno).join('')}</defs>`;
}

interface Curva {
  d: string;
  /** Vértice: el punto más bajo del conductor. */
  vx: number;
  vy: number;
  /** false si el vértice cae FUERA del vano (pendiente fuerte: tiro hacia arriba). */
  dentro: boolean;
}

/**
 * Conductor colgando entre dos sujeciones, con `panza` píxeles de flecha
 * respecto de la cuerda que las une. Modelo parabólico: a la resolución de una
 * figura de 560 px la diferencia con el coseno hiperbólico no llega a un píxel,
 * y el cálculo de verdad no vive aquí — vive en `nucleo/mecanica.js`, que sí usa
 * la catenaria exacta.
 *
 * Devuelve también el VÉRTICE, porque en apoyos a distinta altura NO está en el
 * centro del vano: se corre hacia el apoyo más bajo. De ahí sale el vano peso.
 */
function catenaria(xa: number, ya: number, xb: number, yb: number, panza: number): Curva {
  const a = xb - xa;
  const f = Math.max(panza, 1);
  const s = (yb - ya) / a;                       // pendiente de la cuerda
  const y = (u: number) => ya + s * u + (4 * f * u * (a - u)) / (a * a);

  const n = 44;
  let d = '';
  for (let i = 0; i <= n; i++) {
    const u = (a * i) / n;
    d += `${i ? 'L' : 'M'}${px(xa + u)} ${px(y(u))} `;
  }

  const u0 = a / 2 + (s * a * a) / (8 * f);
  const dentro = u0 > 0 && u0 < a;
  const uc = acota(u0, 0, a);
  return { d: d.trim(), vx: xa + uc, vy: y(uc), dentro };
}

/** Altura de la curva en un vano NIVELADO. Para colgar rótulos de la propia curva. */
const yEnVanoNivelado = (x: number, panzaPx: number): number =>
  Y_SUJ + panzaPx * (1 - ((2 * (x - X_MED)) / VANO_PX) ** 2);

const camino = (d: string, tono: Tono, grosor = 2.4, guion?: string, punta?: string): string =>
  `<path d="${d}" fill="none" stroke="${COLOR[tono]}" stroke-width="${grosor}"`
  + (guion ? ` stroke-dasharray="${guion}"` : '')
  + (punta ? ` marker-end="url(#${punta})"` : '')
  + ' />';

/**
 * Envoltura común. `role="img"` + `<title>` referenciado por `aria-labelledby`
 * es lo que hace que un lector de pantalla anuncie la figura en vez de leer
 * suelto cada rótulo del dibujo (que es lo que pasa con un SVG sin rol).
 *
 * El `xmlns` no hace falta en HTML, pero convierte la cadena en un SVG válido
 * por sí solo: es lo que permite que la figura se pueda guardar o imprimir
 * aparte sin volver a generarla.
 *
 * El `style` en línea fija SOLO tamaño (nunca color) y es la red de seguridad
 * para no tener que tocar `estilo.css`, que es archivo compartido. La clase
 * `fund-figura` queda ahí para que la hoja le ponga marco y fondo cuando toque.
 */
function lienzo(id: string, titulo: string, cuerpo: string): string {
  return `<svg class="fund-figura" xmlns="http://www.w3.org/2000/svg"`
    + ` viewBox="0 0 ${ANCHO} ${ALTO}" width="100%" style="height:auto;display:block"`
    + ` role="img" aria-labelledby="dg-${id}-t">`
    + `<title id="dg-${id}-t">${esc(titulo)}</title>`
    + cuerpo
    + '</svg>';
}

// ── Saneo de la entrada ─────────────────────────────────────────────────────
// Ningún dibujo mira `d` directamente. Todo pasa antes por aquí, y lo que no
// sirve se convierte en `undefined` — que aguas abajo significa "dibuja el caso
// genérico y deja el rótulo simbólico". Es la traducción, en una figura, de la
// regla de no rellenar: preferimos un dibujo que no afirma nada a uno que
// afirma un número que no tenemos.

interface Saneados {
  fMax?: number; fMin?: number; vano?: number;
  pEds?: number; pVto?: number; pTope?: number;
  alfa?: number; vanos?: number[];
  tMax?: number; tMin?: number;
}

const positivo = (v: number | undefined): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;

const porcentaje = (v: number | undefined): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 100 ? v : undefined;

function sanear(d?: DatosDiagrama): Saneados {
  const s: Saneados = {
    fMax: positivo(d?.flechaMax_m),
    fMin: positivo(d?.flechaMin_m),
    vano: positivo(d?.vano_m),
    pEds: porcentaje(d?.pctEds),
    pVto: porcentaje(d?.pctViento),
    pTope: porcentaje(d?.pctTope),
    // 0° es un dato legítimo (línea recta), así que aquí NO se exige positivo.
    // Fuera de [0, 180] se RECHAZA, no se recorta: recortar 999° a 180° dibuja
    // un quiebre que nadie midió, y encima con pinta de dato bueno.
    alfa: typeof d?.deflexion_grados === 'number' && Number.isFinite(d.deflexion_grados)
      && d.deflexion_grados >= 0 && d.deflexion_grados <= 180
      ? d.deflexion_grados : undefined,
    // La temperatura puede ser negativa: solo se exige que sea un número.
    tMax: typeof d?.tMax_C === 'number' && Number.isFinite(d.tMax_C) ? d.tMax_C : undefined,
    tMin: typeof d?.tMin_C === 'number' && Number.isFinite(d.tMin_C) ? d.tMin_C : undefined,
  };
  const vs = (d?.vanos_m ?? []).filter((v): v is number => Number.isFinite(v) && v > 0);
  // Tope de 6: más vanos en 470 px dejan los rótulos ilegibles y el tramo se
  // convierte en un peine. Quien llama decide CUÁLES manda.
  if (vs.length >= 2) s.vanos = vs.slice(0, 6);
  return s;
}

/**
 * Panza en píxeles a partir de la flecha y el vano REALES.
 * Sin los dos datos no hay proporción que dibujar: devuelve el genérico.
 */
function panza(f: number | undefined, a: number | undefined, generico: number, tope: number): number {
  if (f === undefined || a === undefined) return generico;
  return acota(EXAGERACION * (f / a) * VANO_PX, PANZA_MIN, tope);
}

/** Rótulo de una magnitud: con cifra si la hay, simbólico si no. */
const rotulo = (simbolo: string, v: number | undefined, unidad: string, dec = 1): string =>
  v === undefined ? simbolo : `${simbolo.split(' =')[0]} = ${cifra(v, dec)} ${unidad}`;

// ════════════════════════════════════════════════════════════════════════════
// LAS NUEVE FIGURAS
// ════════════════════════════════════════════════════════════════════════════

// 1 · CATENARIA ──────────────────────────────────────────────────────────────
function dibCat(s: Saneados): string {
  const p = panza(s.fMax ?? s.fMin, s.vano, 78, 104);
  const c = catenaria(X_IZQ, Y_SUJ, X_DER, Y_SUJ, p);
  const fRot = rotulo('f = flecha', s.fMax ?? s.fMin, 'm', 2);
  const aRot = rotulo('a = vano', s.vano, 'm');

  return lienzo('cat',
    'Catenaria entre dos apoyos: el conductor cuelga bajo su propio peso. Se acotan la flecha '
    + `vertical en el vértice (${fRot}) y el vano horizontal entre apoyos (${aRot}).`,
    puntas('cat', ['az', 'gr'])
    + suelo(Y_SUELO)
    + poste(X_IZQ, Y_TOPE_POSTE, Y_SUELO) + poste(X_DER, Y_TOPE_POSTE, Y_SUELO)
    + camino(c.d, 'acc', 2.6)
    // Cota de flecha: de la cuerda al vértice.
    + trazo(c.vx, Y_SUJ, c.vx, c.vy, 'az', { grosor: 1.6, guion: '4,3', punta: 'cat-az' })
    + trazo(c.vx - 26, Y_SUJ, c.vx + 26, Y_SUJ, 'az', { grosor: 1, opacidad: 0.7 })
    // Cota de vano: doble flecha por encima de las crucetas.
    + trazo(X_IZQ, 26, X_DER, 26, 'gr', { grosor: 1.4, punta: 'cat-gr', puntaInicio: 'cat-gr' })
    + texto(c.vx + 8, (Y_SUJ + c.vy) / 2 + 4, fRot, 'az')
    + texto(X_MED, 19, aRot, 'gr', 10.5, 'middle')
    + texto(c.vx, c.vy + 17, 'vértice de la catenaria', 'mut', 10, 'middle')
    + texto(X_DER + 10, Y_SUJ + 14, 'apoyo', 'mut', 10)
    + texto(X_IZQ - 10, Y_SUJ + 14, 'apoyo', 'mut', 10, 'end')
    + texto(26, Y_SUELO + 16, 'nivel de terreno', 'mut', 10),
  );
}

// 2 · FLECHA MÁXIMA Y MÍNIMA ────────────────────────────────────────────────
function dibFlecha(s: Saneados): string {
  // Tope más bajo que en `cat`: hay que dejar sitio bajo la curva caliente para
  // acotar la altura libre, que es la razón de ser de esta figura.
  const pCal = panza(s.fMax, s.vano, 96, 96);
  // La curva fría se deriva de la caliente por RAZÓN de flechas, no por su
  // propia escala. Así jamás se cruzan aunque los datos vengan raros, y la
  // proporción entre ambas sigue siendo la real.
  const pFri = s.fMax !== undefined && s.fMin !== undefined
    ? acota(pCal * (s.fMin / s.fMax), 14, pCal - 12)
    : 52;

  const cal = catenaria(X_IZQ, Y_SUJ, X_DER, Y_SUJ, pCal);
  const fri = catenaria(X_IZQ, Y_SUJ, X_DER, Y_SUJ, pFri);
  const tCal = s.tMax !== undefined ? ` a ${cifra(s.tMax, 0)} °C` : '';
  const tFri = s.tMin !== undefined ? ` a ${cifra(s.tMin, 0)} °C` : '';
  const rMax = s.fMax !== undefined ? `f máx = ${cifra(s.fMax, 2)} m${tCal}` : `f máx — conductor caliente${tCal}`;
  const rMin = s.fMin !== undefined ? `f mín = ${cifra(s.fMin, 2)} m${tFri}` : `f mín — conductor frío${tFri}`;

  const xFri = X_IZQ + VANO_PX * 0.38;
  const yFri = yEnVanoNivelado(xFri, pFri);
  const xCal = X_IZQ + VANO_PX * 0.62;
  const yCal = yEnVanoNivelado(xCal, pCal);

  return lienzo('flecha',
    `El mismo vano con dos curvas: el conductor frío por encima (${rMin}) y el conductor caliente `
    + `por debajo (${rMax}). Entre la curva caliente y el terreno queda la altura libre.`,
    puntas('flecha', ['az', 'rd', 'gr'])
    + suelo(Y_SUELO)
    + poste(X_IZQ, Y_TOPE_POSTE, Y_SUELO) + poste(X_DER, Y_TOPE_POSTE, Y_SUELO)
    + camino(fri.d, 'az', 2)
    + camino(cal.d, 'rd', 2.6)
    + trazo(xFri, Y_SUJ, xFri, yFri, 'az', { grosor: 1.4, guion: '3,3', punta: 'flecha-az' })
    + trazo(xCal, Y_SUJ, xCal, yCal, 'rd', { grosor: 1.4, guion: '3,3', punta: 'flecha-rd' })
    // Altura libre: del punto más bajo del conductor caliente al terreno.
    + trazo(cal.vx, cal.vy, cal.vx, Y_SUELO, 'gr', { grosor: 1.8, punta: 'flecha-gr' })
    // ⚠️ Los rótulos van ARRIBA de las crucetas, no pegados a su curva. Pegados
    // quedaban tachados por el propio trazo del conductor: el rótulo cruzaba la
    // curva a media palabra y no se leía ninguno de los dos. El color del
    // rótulo y el de su cota de guiones son los que hacen la pareja.
    + texto(X_IZQ - 6, 24, rMin, 'az', 10)
    + texto(X_DER + 6, 24, rMax, 'rd', 10, 'end')
    + texto(cal.vx + 9, (cal.vy + Y_SUELO) / 2 + 4, 'altura libre', 'gr', 10)
    + texto(26, Y_SUELO + 16, 'terreno', 'mut', 10)
    + texto(X_MED, Y_SUELO + 30, 'la caliente manda la seguridad; la fría, el balanceo', 'mut', 10, 'middle'),
  );
}

// 3 · VIR — VANO IDEAL DE REGULACIÓN ────────────────────────────────────────
function dibVir(s: Saneados): string {
  // Cuatro vanos desiguales por defecto: si salen iguales, la figura no explica
  // para qué sirve el VIR.
  const largos = s.vanos ?? [0.22, 0.30, 0.16, 0.32];
  const total = largos.reduce((a, b) => a + b, 0);
  const xa = 45, xb = 515;
  const xs = [xa];
  for (const L of largos) xs.push(xs[xs.length - 1] + ((xb - xa) * L) / total);

  const yRet = 46, ySus = 60, ySueloV = 178;
  const lMax = Math.max(...largos);

  let cuerpo = '';
  for (let i = 0; i < largos.length; i++) {
    // La panza crece con el CUADRADO del vano: con una sola tensión H en todo
    // el tramo, f = w·a²/(8H). Es lo que hace ver de un vistazo por qué el vano
    // largo domina el tramo — y por qué en la fórmula del VIR los vanos van al
    // cubo y no sumados.
    const p = 11 + 32 * (largos[i] / lMax) ** 2;
    const yIzq = i === 0 ? yRet : ySus;
    const yDer = i === largos.length - 1 ? yRet : ySus;
    cuerpo += camino(catenaria(xs[i], yIzq, xs[i + 1], yDer, p).d, 'acc', 2.2);
  }

  for (let i = 0; i < xs.length; i++) {
    const extremo = i === 0 || i === xs.length - 1;
    cuerpo += poste(xs[i], extremo ? yRet : ySus, ySueloV, extremo ? 'rd' : 'mut');
  }

  const sub = '₁₂₃₄₅₆';
  for (let i = 0; i < largos.length; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2;
    const rot = s.vanos ? `a${sub[i]} = ${cifra(largos[i], 0)} m` : `a${sub[i]}`;
    cuerpo += texto(cx, 193, rot, 'tx', 10, 'middle');
  }

  return lienzo('vir',
    'Tramo de tensión entre dos apoyos de retención: los apoyos intermedios son de suspensión y el '
    + `conductor pasa por ellos, así que los ${largos.length} vanos comparten una sola tensión.`,
    puntas('vir', ['acc'])
    + suelo(ySueloV, 26, 540)
    + cuerpo
    + texto(xs[0], 38, 'RETENCIÓN', 'rd', 9, 'middle')
    + texto(xs[xs.length - 1], 38, 'RETENCIÓN', 'rd', 9, 'middle')
    + texto((xs[1] + xs[xs.length - 2]) / 2, 52, 'suspensión', 'mut', 9, 'middle')
    + trazo(xa, 207, xb, 207, 'acc', { grosor: 1.5, punta: 'vir-acc', puntaInicio: 'vir-acc' })
    + topeCota(xa, 207, 'acc') + topeCota(xb, 207, 'acc')
    + texto(X_MED, 223, 'un solo tramo de tensión — una sola H para todos los vanos', 'acc', 10, 'middle'),
  );
}

// 4 · TENSIÓN DE ROTURA Y TENSIONES DE TRABAJO ──────────────────────────────
function dibTens(s: Saneados): string {
  const x0 = 40, x1 = 520, yB = 96, hB = 26;
  const X = (p: number) => x0 + ((x1 - x0) * acota(p, 0, 100)) / 100;

  const pEds = s.pEds ?? 20;
  const pTope = s.pTope ?? 50;
  const pVto = s.pVto;

  // ⚠️ Si el EDS supera el tope adoptado, los datos se contradicen. La figura
  // NO lo endereza: pone cada marca donde el dato dice y el disparate se ve
  // (la verde a la derecha de la ámbar). Corregirlo aquí sería esconderlo, que
  // es exactamente lo que este sistema no debe hacer. Lo único que se ordena
  // son los límites de las franjas, para que ningún rectángulo salga de ancho
  // negativo y desaparezca.
  const z1 = Math.min(pEds, pTope);
  const z2 = Math.max(pEds, pTope);

  const franja = (pa: number, pb: number, tono: Tono) =>
    `<rect x="${px(X(pa))}" y="${px(yB)}" width="${px(X(pb) - X(pa))}" height="${hB}"`
    + ` fill="${COLOR[tono]}" fill-opacity="0.24" stroke="${COLOR[tono]}" stroke-opacity="0.55" />`;

  const marcas = [
    { p: pEds, tono: 'gr' as Tono, rot: 'EDS' },
    { p: pVto ?? 24.5, tono: 'az' as Tono, rot: 'viento' },
    { p: pTope, tono: 'acc' as Tono, rot: 'tope adoptado' },
  ].sort((a, b) => a.p - b.p);

  // Escalonado: dos marcas a menos de 78 px se pisan los rótulos. En una línea
  // real el EDS y la condición de viento caen a 4 puntos de distancia — sin
  // escalonar no se lee ninguno de los dos.
  let ultimoX = -Infinity, nivel = 0, marcado = '';
  for (const m of marcas) {
    const x = X(m.p);
    nivel = x - ultimoX < 78 ? Math.min(nivel + 1, 2) : 0;
    ultimoX = x;
    const dy = nivel * 25;
    marcado += trazo(x, yB - 8, x, yB + hB + 12 + dy, m.tono, { grosor: 1.8 })
      + texto(x, yB + hB + 26 + dy, m.rot, m.tono, 10, 'middle')
      + texto(x, yB + hB + 38 + dy, `${cifra(m.p, 1)} %`, 'mut', 9, 'middle');
  }

  const leyenda = (x: number, tono: Tono, t: string) =>
    `<rect x="${px(x)}" y="53" width="12" height="9" fill="${COLOR[tono]}" fill-opacity="0.24"`
    + ` stroke="${COLOR[tono]}" stroke-opacity="0.55" />` + texto(x + 17, 62, t, 'mut', 10);

  return lienzo('tens',
    `Barra de 0 a 100 % de la carga de rotura (RTS) en tres zonas, con la tensión de todos los días `
    + `en ${cifra(pEds, 1)} % y el tope adoptado en ${cifra(pTope, 1)} %.`,
    texto(X_MED, 28, 'las tensiones de servicio se expresan como porcentaje de la carga de rotura', 'mut', 10, 'middle')
    + leyenda(40, 'gr', 'zona de trabajo') + leyenda(190, 'acc', 'reserva') + leyenda(300, 'rd', 'no admisible')
    + `<rect x="${px(x0)}" y="${px(yB)}" width="${px(x1 - x0)}" height="${hB}" rx="4"`
    + ` fill="${COLOR.mut}" fill-opacity="0.10" stroke="${COLOR.mut}" stroke-opacity="0.5" />`
    + franja(0, z1, 'gr') + franja(z1, z2, 'acc') + franja(z2, 100, 'rd')
    + texto(x0, yB - 12, '0 % RTS', 'mut', 9)
    + texto(x1, yB - 12, '100 % RTS — rotura', 'rd', 9, 'end')
    + marcado,
  );
}

// 5 · ECUACIÓN DE CAMBIO DE ESTADO ──────────────────────────────────────────
function dibCambio(s: Saneados): string {
  const p2 = panza(s.fMax, s.vano, 92, 100);
  const p1 = s.fMax !== undefined && s.fMin !== undefined
    ? acota(p2 * (s.fMin / s.fMax), 14, p2 - 14)
    : 46;
  const c1 = catenaria(X_IZQ, Y_SUJ, X_DER, Y_SUJ, p1);
  const c2 = catenaria(X_IZQ, Y_SUJ, X_DER, Y_SUJ, p2);

  const e1 = s.tMin !== undefined ? `estado 1 — H₁, w₁, ${cifra(s.tMin, 0)} °C` : 'estado 1 — H₁, w₁, t₁';
  const e2 = s.tMax !== undefined ? `estado 2 — H₂, w₂, ${cifra(s.tMax, 0)} °C` : 'estado 2 — H₂, w₂, t₂';

  const ya = c1.vy + 7, yb = c2.vy - 7;
  const bow = `M${px(X_MED)} ${px(ya)} C${px(X_MED + 46)} ${px(ya + (yb - ya) * 0.25)},`
    + `${px(X_MED + 46)} ${px(ya + (yb - ya) * 0.75)},${px(X_MED)} ${px(yb)}`;

  return lienzo('cambio',
    `Dos estados del mismo conductor en el mismo vano: ${e1} arriba y ${e2} abajo. La ecuación de `
    + 'cambio de estado es la que traduce uno en el otro.',
    puntas('cambio', ['acc'])
    + suelo(Y_SUELO)
    + poste(X_IZQ, Y_TOPE_POSTE, Y_SUELO) + poste(X_DER, Y_TOPE_POSTE, Y_SUELO)
    + camino(c1.d, 'az', 2)
    + camino(c2.d, 'rd', 2.4)
    + camino(bow, 'acc', 1.8, undefined, 'cambio-acc')
    // Mismo criterio que en la figura de flechas: los rótulos por encima de las
    // crucetas. Colgados de su curva quedaban tachados por ella.
    + texto(X_IZQ - 6, 24, e1, 'az', 10)
    + texto(X_DER + 6, 24, e2, 'rd', 10, 'end')
    + texto(X_MED + 54, (ya + yb) / 2 + 4, 'Δt · Δw', 'acc', 10)
    + texto(X_MED, Y_SUELO + 18, 'una sola longitud de conductor: si cambia t o w, la tensión se ajusta sola',
      'mut', 10, 'middle'),
  );
}

// 6 · DEFLEXIÓN Y CARGA TRANSVERSAL (VISTA EN PLANTA) ───────────────────────
function dibDefl(s: Saneados): string {
  const alfa = s.alfa ?? 40;
  const vx = X_MED, vy = 62;                       // vértice arriba, la V abre hacia abajo
  const rad = Math.PI / 180;
  const th = (90 - alfa / 2) * rad;                // ángulo de cada brazo con la vertical
  const sn = Math.sin(th), cs = Math.cos(th);

  // Los brazos se acortan lo necesario para no salirse del lienzo. Con α = 120°
  // la V se cierra y unos brazos de largo fijo se irían fuera por arriba.
  const L = Math.min(215, cs > 0.01 ? 138 / cs : 215, sn > 0.01 ? 250 / sn : 215);
  const ax = vx - L * sn, ay = vy + L * cs;        // vano anterior
  const bx = vx + L * sn, by = vy + L * cs;        // vano siguiente

  // Arco de α: entre la PROLONGACIÓN del vano de entrada y el vano de salida.
  // El original lo dibujaba entre los dos brazos, que es el ángulo interior
  // (180 − α), no la deflexión. Con 40° de deflexión el original marcaba 140.
  const r = Math.min(38, L * 0.4);
  const arco = `M${px(vx + r * sn)} ${px(vy - r * cs)} A${px(r)} ${px(r)} 0 0 1 ${px(vx + r * sn)} ${px(vy + r * cs)}`;
  // La prolongación se recorta para no salirse por arriba: con α = 180° apunta
  // recto al borde del lienzo y, si se sale, el navegador la corta a la mitad y
  // parece un trazo roto.
  const largoProl = Math.min(r + 42, cs > 0.01 ? (vy - 20) / cs : r + 42);

  // ⚠️ SIGNO DE LA RESULTANTE. Los dos tiros salen del vértice hacia los vanos;
  // su suma apunta hacia el lado CÓNCAVO del quiebre (hacia adentro de la V).
  // El original la dibujaba hacia el lado convexo — que es la REACCIÓN del
  // apoyo, no la resultante de los tiros. Confundirlas es poner el tensor (la
  // riostra) del lado equivocado, y ese error solo se ve el día que la
  // estructura se inclina.
  //
  // El LARGO de la flecha roja es proporcional a 2·sen(α/2), que es el propio
  // factor de la fórmula: en una línea recta la resultante es cero y aquí queda
  // un muñón, no una flecha grande que sugiera una carga que no existe.
  const factor = 2 * Math.sin((alfa * rad) / 2);
  const yFt = vy + 16 + 134 * (factor / 2);

  const rotAlfa = s.alfa !== undefined ? `α = ${cifra(alfa, 2)}°` : 'α';
  const rotFt = s.alfa !== undefined
    ? `Ft = 2·H·sen(α/2) = ${cifra(factor, 3)}·H`
    : 'Ft = 2·H·sen(α/2)';

  return lienzo('defl',
    `Vista en planta de un apoyo con quiebre: ${rotAlfa} de deflexión entre el vano anterior y el `
    + 'siguiente. Los dos tiros no se cancelan y dejan una resultante sobre la bisectriz.',
    puntas('defl', ['gr', 'rd', 'mut'])
    + texto(26, 24, 'VISTA EN PLANTA', 'mut', 9)
    + trazo(ax, ay, vx, vy, 'acc', { grosor: 3 })
    + trazo(vx, vy, bx, by, 'acc', { grosor: 3 })
    // Prolongación del vano de entrada: la referencia desde la que se mide α.
    + trazo(vx, vy, vx + largoProl * sn, vy - largoProl * cs, 'mut',
      { grosor: 1.3, guion: '4,3', punta: 'defl-mut' })
    + camino(arco, 'az', 1.6)
    + `<circle cx="${px(vx)}" cy="${px(vy)}" r="7" fill="${COLOR.acc}" stroke="${COLOR.tx}" stroke-width="1.6" />`
    // Tiros del conductor: uno por vano, sobre la dirección de cada vano.
    + trazo(vx, vy, vx - 0.5 * L * sn, vy + 0.5 * L * cs, 'gr', { grosor: 1.6, guion: '4,3', punta: 'defl-gr' })
    + trazo(vx, vy, vx + 0.5 * L * sn, vy + 0.5 * L * cs, 'gr', { grosor: 1.6, guion: '4,3', punta: 'defl-gr' })
    // Resultante sobre la bisectriz, hacia el lado cóncavo.
    + trazo(vx, vy, vx, yFt, 'rd', { grosor: 2.4, punta: 'defl-rd' })
    + texto(vx + r * sn + 12, vy + 4, rotAlfa, 'az', 12)
    + texto(vx + 10, yFt + 4, rotFt, 'rd', 11)
    + texto(vx - 0.5 * L * sn - 8, vy + 0.5 * L * cs + 2, 'H', 'gr', 11, 'end')
    + texto(vx + 0.5 * L * sn + 8, vy + 0.5 * L * cs + 2, 'H', 'gr', 11)
    + texto(ax, ay + 15, 'vano anterior', 'mut', 10, 'middle')
    + texto(bx, by + 15, 'vano siguiente', 'mut', 10, 'middle')
    + texto(X_MED, ALTO - 8, 'resultante sobre la bisectriz', 'mut', 10, 'middle'),
  );
}

// 7 · VANO VIENTO Y VANO PESO ───────────────────────────────────────────────
function dibVanos(s: Saneados): string {
  const a1 = s.vanos?.[0], a2 = s.vanos?.[1];
  const xa = 60, xc = 500;
  // Reparto proporcional a los dos vanos reales cuando los hay.
  const frac = a1 !== undefined && a2 !== undefined ? a1 / (a1 + a2) : 0.48;
  const xb = xa + (xc - xa) * frac;

  // El apoyo central se dibuja MÁS ALTO a propósito. Con los tres al mismo
  // nivel los dos vértices caen justo en los medios de vano y las dos cotas se
  // superponen: la figura no enseña que el vano peso y el vano viento son cosas
  // distintas. Con el central en alto, los vértices se corren hacia AFUERA y el
  // vano peso sale mayor que el viento — que es exactamente lo que le pasa a un
  // apoyo en una loma: carga más conductor del que le tocaría por geometría.
  //
  // El desnivel es ILUSTRATIVO. El vano peso de la línea real NO se dibuja con
  // cifra: exige perfil del terreno, y la altimetría GPS (±8 m) no da. Lo mismo
  // que declara la tarjeta de Fundamentos: no se inventa.
  const yA = 96, yB = 58, yC = 104, ySueloV = 182;
  const c1 = catenaria(xa, yA, xb, yB, 42);
  const c2 = catenaria(xb, yB, xc, yC, 52);

  const mv1 = (xa + xb) / 2, mv2 = (xb + xc) / 2;
  const viento = a1 !== undefined && a2 !== undefined
    ? `vano viento = (a₁ + a₂)/2 = ${cifra((a1 + a2) / 2, 1)} m`
    : 'vano viento = (a₁ + a₂)/2';

  const guia = (x: number, y: number) =>
    trazo(x, y, x, 30, 'rd', { grosor: 1, guion: '3,4', opacidad: 0.65 })
    + `<circle cx="${px(x)}" cy="${px(y)}" r="4" fill="${COLOR.rd}" />`;

  return lienzo('vanos',
    'Tres apoyos y dos vanos: el vano viento va de medio vano a medio vano y reparte la carga '
    + 'transversal; el vano peso va de vértice a vértice de las dos catenarias y reparte la vertical.',
    puntas('vanos', ['gr', 'rd'])
    + suelo(ySueloV, 26, 540)
    + poste(xa, yA, ySueloV) + poste(xb, yB, ySueloV) + poste(xc, yC, ySueloV)
    + camino(c1.d, 'acc', 2.2) + camino(c2.d, 'acc', 2.2)
    // Vano peso: entre los dos vértices, arriba, en rojo.
    + (c1.dentro ? guia(c1.vx, c1.vy) : '')
    + (c2.dentro ? guia(c2.vx, c2.vy) : '')
    + trazo(c1.vx, 30, c2.vx, 30, 'rd', { grosor: 1.6, punta: 'vanos-rd', puntaInicio: 'vanos-rd' })
    + texto(X_MED, 21, 'vano peso = distancia entre vértices (exige perfil del terreno)', 'rd', 10, 'middle')
    // Vano viento: entre los medios de vano, abajo, en verde.
    + trazo(mv1, 208, mv2, 208, 'gr', { grosor: 2.2, punta: 'vanos-gr', puntaInicio: 'vanos-gr' })
    + topeCota(mv1, 208, 'gr', 6) + topeCota(mv2, 208, 'gr', 6)
    + trazo(xa, 208, mv1, 208, 'az', { grosor: 1.2, opacidad: 0.7 })
    + trazo(mv2, 208, xc, 208, 'az', { grosor: 1.2, opacidad: 0.7 })
    + texto((xa + xb) / 2, 196, a1 !== undefined ? `a₁ = ${cifra(a1, 0)} m` : 'a₁', 'tx', 10, 'middle')
    + texto((xb + xc) / 2, 196, a2 !== undefined ? `a₂ = ${cifra(a2, 0)} m` : 'a₂', 'tx', 10, 'middle')
    + texto(X_MED, 225, viento, 'gr', 10.5, 'middle'),
  );
}

// 8 · AMPACIDAD Y BALANCE TÉRMICO ───────────────────────────────────────────
function dibAmp(): string {
  const cx = X_MED, cy = 110, r = 44;

  // Esta figura NO consume datos, y es a propósito. Lo único que se podría
  // enchufar es tMax_C — pero esa es la temperatura de la HIPÓTESIS MECÁNICA
  // (la que gobierna la flecha), no la temperatura límite del conductor de la
  // hipótesis TÉRMICA. Son dos números distintos que a veces coinciden. Meter
  // uno donde va el otro es cruzar dominios: la figura diría algo que el
  // sistema no ha calculado.
  const entra = (x1: number, y1: number, x2: number, y2: number) =>
    trazo(x1, y1, x2, y2, 'rd', { grosor: 2, punta: 'amp-rd' });
  const sale = (x1: number, y1: number, x2: number, y2: number) =>
    trazo(x1, y1, x2, y2, 'az', { grosor: 2, punta: 'amp-az' });

  return lienzo('amp',
    'Balance térmico del conductor, sin escala: entran el efecto Joule y la radiación solar; salen '
    + 'la convección y la radiación. La ampacidad es la corriente que deja ese balance en equilibrio.',
    puntas('amp', ['rd', 'az'])
    + `<circle cx="${px(cx)}" cy="${px(cy)}" r="${r}" fill="${COLOR.acc}" fill-opacity="0.16"`
    + ` stroke="${COLOR.acc}" stroke-width="2.5" />`
    + texto(cx, cy - 3, 'CONDUCTOR', 'acc', 11, 'middle')
    + texto(cx, cy + 14, 'Tc', 'acc', 12, 'middle')
    + entra(146, 72, cx - r - 6, cy - 18)
    + texto(140, 66, 'I²·R — efecto Joule', 'rd', 10, 'end')
    + entra(146, 156, cx - r - 6, cy + 20)
    + texto(140, 164, 'qs — radiación solar', 'rd', 10, 'end')
    + sale(cx + r + 6, cy - 18, 414, 72)
    + texto(420, 66, 'qc — convección', 'az', 10)
    + sale(cx + r + 6, cy + 20, 414, 156)
    + texto(420, 164, 'qr — radiación', 'az', 10)
    + texto(cx, 34, 'sin escala: es un balance, no una geometría', 'mut', 10, 'middle')
    + texto(cx, 200, 'en equilibrio: lo que entra = lo que sale', 'mut', 10.5, 'middle')
    + texto(cx, 216, 'sube el ambiente o cae el viento → baja la ampacidad', 'mut', 10, 'middle'),
  );
}

// 9 · DISTANCIA DE SEGURIDAD AL TERRENO ─────────────────────────────────────
function dibTerr(s: Saneados): string {
  const p = panza(s.fMax, s.vano, 96, 96);
  const c = catenaria(X_IZQ, Y_SUJ, X_DER, Y_SUJ, p);
  const xh = 46;

  // `h` y `d` se rotulan con SÍMBOLO, nunca con cifra: la altura de sujeción no
  // está declarada por apoyo en este sistema, y sin ella `d` no existe. Poner
  // aquí un número sería fabricarlo. Solo `f máx` sale con cifra, porque esa sí
  // la calcula el núcleo.
  const rf = s.fMax !== undefined ? `f máx = ${cifra(s.fMax, 2)} m` : 'f máx';

  return lienzo('terr',
    `Condición más desfavorable: conductor a temperatura máxima, con la flecha ${rf}. La distancia `
    + 'libre d es la altura de sujeción h menos esa flecha, y debe superar el mínimo reglamentario.',
    puntas('terr', ['az', 'gr'])
    + suelo(Y_SUELO)
    + poste(X_IZQ, Y_TOPE_POSTE, Y_SUELO) + poste(X_DER, Y_TOPE_POSTE, Y_SUELO)
    + camino(c.d, 'rd', 2.6)
    // Altura de sujeción, a la izquierda del apoyo.
    + trazo(xh, Y_SUJ, xh, Y_SUELO, 'az', { grosor: 1.5, punta: 'terr-az', puntaInicio: 'terr-az' })
    + topeCota(xh, Y_SUJ, 'az', 5, false) + topeCota(xh, Y_SUELO, 'az', 5, false)
    + texto(xh - 8, (Y_SUJ + Y_SUELO) / 2 + 4, 'h', 'az', 12, 'end')
    // Flecha máxima y, debajo, lo que queda hasta el terreno.
    + trazo(c.vx, Y_SUJ, c.vx, c.vy, 'rd', { grosor: 1.5, guion: '3,3' })
    + trazo(c.vx, c.vy, c.vx, Y_SUELO, 'gr', { grosor: 2.2, punta: 'terr-gr' })
    + texto(c.vx + 10, (Y_SUJ + c.vy) / 2 + 4, rf, 'rd', 11)
    + texto(c.vx + 10, (c.vy + Y_SUELO) / 2 + 4, 'd = h − f máx', 'gr', 11)
    + texto(X_MED, 24, 'd debe superar el mínimo reglamentario', 'mut', 10, 'middle')
    + texto(X_MED, Y_SUELO + 18, 'h se declara por apoyo; sin ella, d no se calcula', 'mut', 10, 'middle'),
  );
}

// ════════════════════════════════════════════════════════════════════════════

const DIBUJOS: Record<IdDiagrama, (s: Saneados) => string> = {
  cat: dibCat,
  flecha: dibFlecha,
  vir: dibVir,
  tens: dibTens,
  cambio: dibCambio,
  defl: dibDefl,
  vanos: dibVanos,
  amp: dibAmp,
  terr: dibTerr,
};

/**
 * La figura de un concepto, como SVG listo para insertar.
 *
 * Sin `d`, o con datos inutilizables, devuelve el caso genérico: la figura
 * enseña la idea sin afirmar ninguna cifra. Con datos, dibuja donde la línea
 * trabaja de verdad.
 *
 * Un `id` desconocido no puede llegar aquí por tipos, pero si llega en tiempo de
 * ejecución (datos viejos en caché, un id escrito a mano) devuelve una figura
 * que lo DICE. No se lanza excepción: una figura rota no puede tumbar la
 * pestaña entera de Fundamentos.
 */
export function diagrama(id: IdDiagrama, d?: DatosDiagrama): string {
  const dibujo: ((s: Saneados) => string) | undefined = DIBUJOS[id];
  if (!dibujo) {
    return lienzo('nd', `No existe una figura con el identificador «${String(id)}».`,
      texto(X_MED, ALTO / 2, `figura no disponible: «${String(id)}»`, 'mut', 12, 'middle'));
  }
  return dibujo(sanear(d));
}
