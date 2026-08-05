// ============================================================================
// exportar/informeRca.js — el análisis de causa raíz, como documento
// ----------------------------------------------------------------------------
// QUÉ ES. El expediente del razonamiento, imprimible y AUTOCONTENIDO: cero
// JavaScript y cero recursos externos, igual que `informe.js`. Se abre con doble
// clic dentro de diez años y se ve igual.
//
// LA REGLA QUE GOBIERNA ESTE ARCHIVO, y por la que existe:
//
//   > Un análisis sin sus límites al lado invita exactamente a la conclusión que
//   > este sistema quiere impedir.
//
// Por eso la sección de límites NO es un apéndice: es obligatoria, va SIEMPRE
// —haya o no algo que declarar— y se arma sola de lo que el motor sabe. Que
// nadie tenga que acordarse de escribirla es justo el punto: la que se escribe
// a mano es la que se olvida el día que el informe corre prisa.
//
// LO QUE ESTE DOCUMENTO NO HACE, NUNCA:
//   · No ordena las hipótesis por verosimilitud. Ordenar es dictaminar, y la
//     primera de una lista se lee como la buena (`99 §ADR-020`).
//   · No convierte una ausencia en un cero. Un hueco se declara.
//   · No presenta una correlación climática como causa. El motor ya topa en
//     «baja» la hipótesis con sustento solo meteorológico; aquí se imprime el
//     tope, no se disimula.
//   · No omite una espina sin evaluar. Las once salen siempre, incluso las que
//     nadie ha mirado: una espina que desaparece se lee como «eso ya no aplica».
//
// SE PUEDE IMPRIMIR UN ANÁLISIS A MEDIAS, y debe poder. El estado normal de un
// RCA durante semanas es no tener causa raíz. Lo que hace el documento es decir
// en la portada, con todas las letras, si es un AVANCE o una CONCLUSIÓN — sin
// barra de progreso y sin porcentaje, que están prohibidos porque fabrican
// certeza donde no la hay.
// ============================================================================
import { ESTILO, esc, escRico, n, parrafo, nota, tabla, lista, objeto } from './informe.js';
import {
  evaluarEspinas, validarArbol, resumenBarreras, revisarHipotesis,
  condicionesCausaRaiz, auditarRespaldo, resumenAcciones,
} from '@lineas/nucleo/rca';

const SIN_DATO = '—';

/** Los nombres legibles. Un solo sitio, y el mismo vocabulario de la pantalla. */
const ESPINAS = {
  conductor: 'Conductor',
  conexiones_empalmes: 'Conexiones y empalmes',
  aislamiento_herrajes: 'Aislamiento y herrajes',
  estructura_cimentacion: 'Estructura y cimentación',
  tierra_apantallamiento: 'Puesta a tierra y apantallamiento',
  ambiente_clima: 'Ambiente y clima',
  vegetacion_servidumbre: 'Vegetación y servidumbre',
  diseno_hipotesis: 'Diseño e hipótesis',
  montaje_tendido: 'Montaje y tendido',
  operacion_maniobra: 'Operación y maniobra',
  inspeccion_mantenimiento: 'Inspección y mantenimiento',
};

const ESTADO_ESPINA = {
  descartada: 'descartada',
  abierta: 'abierta',
  sostenida: 'sostenida',
  no_evaluable: 'no evaluable',
};

const NIVEL = {
  efecto: '1 · efecto',
  modo_falla: '2 · modo de falla',
  mecanismo_fisico: '3 · mecanismo físico',
  condicion: '4 · condición',
  regla: '5 · regla',
};

const ESTADO_BARRERA = {
  ausente: 'nunca existió',
  inefectiva: 'existía y no funcionó',
  no_aplicada: 'existía y no se aplicó',
  funciono: 'actuó y limitó el daño',
  no_evaluable: 'no consta',
};

const legible = (s) => String(s ?? '').replace(/_/g, ' ');

/**
 * `tabla()` recibe HTML YA ARMADO, no arreglos: la cabecera son `<th>` y las
 * filas son `<tr>` completos. Estos dos ayudantes lo hacen, para que las
 * secciones de abajo puedan pensar en columnas y no en etiquetas.
 */
const cab = (titulos) => titulos.map((t) => `<th>${esc(t)}</th>`).join('');
const fila = (celdas) => `<tr>${celdas.map((c) => `<td>${c}</td>`).join('')}</tr>`;

// ── LAS SECCIONES ───────────────────────────────────────────────────────────

/**
 * La tabla de descartes, con las ONCE familias siempre.
 *
 * El descarte razonado es el PRODUCTO, no el residuo: saber que once familias se
 * miraron y por qué diez se cayeron vale más que la que quedó en pie.
 */
function seccionEspinas(espinas) {
  const t = evaluarEspinas(espinas);
  const filas = t.map((e) => fila([
    ESPINAS[e.espina] ?? legible(e.espina),
    ESTADO_ESPINA[e.estado] ?? e.estado,
    escRico(e.motivo || SIN_DATO),
    e.evidenciaIds?.length ? `${n(e.evidenciaIds.length)}` : SIN_DATO,
    e.defectos?.length ? escRico(e.defectos.join(' · ')) : '',
  ]));

  const conDefecto = t.filter((e) => e.defectos?.length).length;

  return parrafo(
    'Las once familias de causas de una línea de alta tensión. <b>Salen las once, siempre</b>, '
    + 'incluidas las que nadie ha mirado todavía: una familia que desaparece de la tabla se lee '
    + 'como «eso ya no aplica», y eso es una afirmación que nadie ha hecho. No existe el estado '
    + '«no aplica»; si de verdad no aplica, es <i>descartada</i> y hay que decir con qué evidencia.',
  )
  + tabla({
    leyenda: 'Familias de causas y su estado',
    cabecera: cab(['Familia', 'Estado', 'Motivo', 'Evidencias', 'Defecto del método']),
    filas,
  })
  + (conDefecto
    ? nota(`<b>${n(conDefecto)} familia(s) con defecto de método</b>: un descarte o un sostenimiento `
      + 'sin evidencia enlazada no es un descarte, es una opinión. Va impreso a propósito.')
    : '');
}

/** Las cadenas de porqués, con su nivel y dónde se cortaron. */
function seccionPorques(cadenas) {
  if (!cadenas.length) return parrafo('No se ha construido ninguna cadena de porqués.');

  return cadenas.map((c) => {
    const filas = lista(c.eslabones).map((e, i) => fila([
      `${n(i + 1)}`,
      NIVEL[e.nivel] ?? legible(e.nivel),
      escRico(e.enunciado),
      e.evidenciaIds?.length ? `${n(e.evidenciaIds.length)}` : SIN_DATO,
      e.cortadaPorFaltaDeDato ? escRico(e.cortadaPorFaltaDeDato) : '',
    ]));
    const ultimo = lista(c.eslabones).at(-1);
    const paraEnFisica = ultimo && ultimo.nivel === 'mecanismo_fisico';

    return tabla({
      leyenda: `Cadena · ${ESPINAS[c.espina] ?? legible(c.espina)}`,
      cabecera: cab(['#', 'Nivel', 'Porqué', 'Evidencias', 'Cortada por falta de dato']),
      filas,
    }) + (paraEnFisica
      ? nota('<b>Esta cadena termina en el mecanismo físico.</b> Eso describe qué pasó, no por qué '
        + 'se pudo dar: sobre la física no se puede actuar. La causa raíz está en por qué ESE '
        + 'componente, en ESA función, sin ESE control.')
      : '');
  }).join('\n');
}

/** El árbol y el análisis de barreras. */
function seccionArbol(arbol) {
  if (!arbol.length) return parrafo('No se ha construido el árbol de causas.');

  const v = validarArbol(arbol);
  const b = resumenBarreras(arbol);

  const filas = arbol.map((x) => fila([
    NIVEL[x.nivel] ?? legible(x.nivel),
    escRico(x.enunciado),
    x.barrera ? legible(x.barrera.cual) : SIN_DATO,
    x.barrera ? (ESTADO_BARRERA[x.barrera.estado] ?? legible(x.barrera.estado)) : SIN_DATO,
    x.evidenciaIds?.length ? `${n(x.evidenciaIds.length)}` : SIN_DATO,
  ]));

  return parrafo(
    'Cada rama dice qué <b>defensa</b> debió cortarla y qué le pasó. Es lo que convierte un árbol '
    + 'en algo accionable: una causa sin barrera identificada no dice dónde intervenir.',
  )
  + tabla({
    leyenda: 'Árbol de causas y estado de las barreras',
    cabecera: cab(['Nivel', 'Enunciado', 'Barrera', 'Qué le pasó', 'Evidencias']),
    filas,
  })
  + (v.problemas?.length ? nota(`<b>Defectos de estructura:</b> ${escRico(v.problemas.join(' · '))}`) : '')
  + (b.fallaron > 0
    ? parrafo(`<b>${n(b.fallaron)} defensa(s) no cortaron la rama:</b> `
      + `${esc(b.cuales.map((x) => `${legible(x.cual)} (${ESTADO_BARRERA[x.estado] ?? legible(x.estado)})`).join(', '))}.`
      + (b.aviso ? ` ${escRico(b.aviso)}` : ''))
    : '');
}

/**
 * Las hipótesis, CON lo que las refutaría y SIN ordenar.
 *
 * Salen en el orden en que se escribieron. Ordenarlas por verosimilitud sería
 * dictaminar: la primera se lee como la buena, y eso lo decide quien firma.
 */
function seccionHipotesis(hipotesis) {
  if (!hipotesis.length) return parrafo('No se han formulado hipótesis.');

  const r = revisarHipotesis(hipotesis);
  const filas = r.map((h) => fila([
    escRico(h.enunciado),
    ESPINAS[h.espina] ?? legible(h.espina),
    legible(h.verosimilitudEfectiva),
    escRico(h.queLaRefutaria || SIN_DATO),
    h.evidenciaIds?.length ? `${n(h.evidenciaIds.length)}` : SIN_DATO,
    h.defectos?.length ? escRico(h.defectos.join(' · ')) : '',
  ]));

  const topadas = r.filter((h) => h.topadaPorClima);

  return parrafo(
    'En el orden en que se escribieron, <b>sin ordenar por verosimilitud</b>: la primera de una '
    + 'lista se lee como la buena, y esa decisión es de quien firma, no del documento. La columna '
    + 'que hace que esto sea un análisis y no una narración es <b>qué la refutaría</b>: una '
    + 'hipótesis que ninguna evidencia puede tumbar es una creencia.',
  )
  + tabla({
    leyenda: 'Hipótesis y su refutación',
    cabecera: cab(['Hipótesis', 'Familia', 'Verosimilitud', 'Qué la refutaría', 'Evidencias', 'Defecto']),
    filas,
  })
  + (topadas.length
    ? nota(`<b>${n(topadas.length)} hipótesis topada(s) en «baja» por el motor</b>: todo su sustento `
      + 'es meteorológico. Que hubiera ese clima el día del evento no prueba que lo causara — en el '
      + 'Caribe hay viento fuerte muchas noches y las líneas no se caen. Hace falta evidencia física '
      + 'del mecanismo.')
    : '');
}

/** El clima congelado, con su nota de límites tal como la redactó el núcleo. */
function seccionClima(sondeos) {
  if (!sondeos.length) {
    return parrafo(
      'No se congeló ningún sondeo meteorológico en este expediente. <b>La ausencia de clima no es '
      + 'un descarte del clima</b>: es que no se consultó, o que no se dejó constancia.',
    );
  }

  return sondeos.map((s) => {
    const est = objeto(s.estacion);
    const filas = lista(s.series).map((x) => fila([
      legible(x.variable),
      esc(x.unidad),
      `${n(x.n)}`,
      esc(x.conjunto),
    ]));

    return parrafo(
      `Consultado el <b>${esc(String(s.consultadoEn).slice(0, 16).replace('T', ' '))}</b> para el punto `
      + `${esc(Number(objeto(s.punto).lat).toFixed(4))}, ${esc(Number(objeto(s.punto).lon).toFixed(4))}, `
      + `ventana ${esc(String(s.desde).slice(0, 16).replace('T', ' '))} → `
      + `${esc(String(s.hasta).slice(0, 16).replace('T', ' '))}. Estación <b>${esc(est.nombre)}</b> `
      + `a <b>${n(est.distancia_km, 1)} km</b> del punto.`,
    )
    + tabla({
      leyenda: 'Series traídas',
      cabecera: cab(['Variable', 'Unidad', 'Lecturas', 'Conjunto de datos']),
      filas,
    })
    // La nota la redacta el NÚCLEO, no este archivo: los límites son parte del
    // resultado y no de la presentación.
    + nota(escRico(s.nota));
  }).join('\n');
}

/** Las acciones, con sus defectos y con el hueco que más importa. */
function seccionAcciones(acciones, arbol) {
  const r = resumenAcciones(acciones, arbol);

  if (!r.total) {
    return parrafo('No se ha propuesto ninguna acción.')
      + (r.barrerasSinAccion.length
        ? nota(`<b>Y hay ${n(r.barrerasSinAccion.length)} defensa(s) que no cortaron la rama sin `
          + `ninguna acción encima:</b> ${esc(r.barrerasSinAccion.map(legible).join(', '))}.`)
        : '');
  }

  const filas = r.acciones.map((a) => fila([
    legible(a.clase),
    escRico(a.que),
    a.barrera ? legible(a.barrera) : SIN_DATO,
    legible(a.estado),
    esc(a.responsable || SIN_DATO),
    a.estado === 'cerrada'
      ? (a.pruebaEs === 'evidencia' ? 'evidencia enlazada'
        : a.pruebaEs === 'escrita' ? 'solo nota escrita' : 'SIN PRUEBA')
      : SIN_DATO,
    a.defectos?.length ? escRico(a.defectos.join(' · ')) : '',
  ]));

  return tabla({
    leyenda: 'Acciones correctivas y preventivas',
    cabecera: cab(['Tipo', 'Qué se hace', 'Barrera', 'Estado', 'Responsable', 'Prueba del cierre', 'Defecto']),
    filas,
  })
  + (r.cerradasSoloConNota
    ? nota(`<b>${n(r.cerradasSoloConNota)} acción(es) cerrada(s) con una nota escrita y sin evidencia `
      + 'enlazada.</b> Vale como prueba, y se dice cuál es: no es lo mismo que una fotografía del '
      + 'trabajo hecho.')
    : '')
  + (r.barrerasSinAccion.length
    ? nota(`<b>${n(r.barrerasSinAccion.length)} defensa(s) que no cortaron la rama NO tienen ninguna `
      + `acción:</b> ${esc(r.barrerasSinAccion.map(legible).join(', '))}. Puede estar bien —quizá no `
      + 'procede— pero tiene que ser una decisión escrita, no un olvido. Una lista larga de acciones '
      + 'tapa perfectamente que la defensa principal sigue abierta.')
    : '');
}

/**
 * ⚠️ LA SECCIÓN QUE JUSTIFICA EL DOCUMENTO ENTERO.
 *
 * Se arma SOLA de lo que el motor sabe. Nadie tiene que acordarse de escribirla,
 * porque la que se escribe a mano es la que se olvida el día que el informe
 * corre prisa — y ese día es justo cuando más falta hace.
 */
function seccionLimites({ a, sondeos }) {
  const cond = condicionesCausaRaiz(a);
  const resp = auditarRespaldo(a);
  const acc = resumenAcciones(a.acciones ?? [], a.arbol ?? []);
  const espinas = evaluarEspinas(a.espinas ?? []);

  const bloques = [];

  // 1 · Lo que no se pudo mirar.
  const sinEvaluar = espinas.filter((e) => e.estado === 'no_evaluable');
  if (sinEvaluar.length) {
    bloques.push(
      `<b>${n(sinEvaluar.length)} de 11 familias no se pudieron evaluar</b> por falta de dato: `
      + `${esc(sinEvaluar.map((e) => ESPINAS[e.espina] ?? legible(e.espina)).join(', '))}. `
      + 'No están descartadas: no se han podido mirar, que es distinto.',
    );
  }

  // 2 · Las condiciones que NO se cumplían al declarar la causa.
  if (a.causaRaiz) {
    const noCumplidas = lista(a.causaRaiz.condicionesNoCumplidas);
    bloques.push(noCumplidas.length
      ? `<b>La causa raíz se declaró con ${n(noCumplidas.length)} condición(es) sin cumplir:</b> `
        + `${escRico(noCumplidas.join(' · '))}. Queda registrado porque es la defensa del informe: `
        + 'quien lo lea tiene que poder juzgar con qué se firmó.'
      : 'La causa raíz se declaró con las seis condiciones cumplidas.');
  } else {
    const faltan = lista(cond.condiciones).filter((c) => !c.cumple);
    bloques.push(
      `<b>Este análisis NO tiene causa raíz declarada.</b> Es un AVANCE, no una conclusión. `
      + (faltan.length
        ? `Faltan ${n(faltan.length)} condición(es): ${escRico(faltan.map((c) => c.texto).filter(Boolean).join(' · '))}.`
        : 'Las condiciones se cumplen; falta que una persona la declare — el sistema no la marca.'),
    );
  }

  // 3 · Lo que se afirma sin evidencia enlazada.
  const sinRespaldo = Number(resp?.sinRespaldo ?? 0);
  if (sinRespaldo > 0) {
    bloques.push(
      `<b>${n(sinRespaldo)} afirmación(es) de este análisis no tienen evidencia enlazada.</b> `
      + 'Pueden ser ciertas; lo que no son es comprobables por quien lea el documento.',
    );
  }

  // 4 · Las ausencias declaradas por el ingeniero.
  const aus = lista(a.ausencias);
  if (aus.length) {
    bloques.push(
      `<b>Lo que este análisis no puede afirmar hoy (${n(aus.length)}):</b> `
      + escRico(aus.map((x) => `${x.que}${x.porQue ? ` — ${x.porQue}` : ''}`).join(' · ')),
    );
  }

  // 5 · Las defensas sin acción.
  if (acc.barrerasSinAccion.length) {
    bloques.push(
      `<b>${n(acc.barrerasSinAccion.length)} defensa(s) que no cortaron la rama siguen sin ninguna `
      + `acción:</b> ${esc(acc.barrerasSinAccion.map(legible).join(', '))}.`,
    );
  }

  // 6 · LOS RAYOS. Se declara SIEMPRE, haya o no clima. Que no se pueda
  //     descartar un rayo es un RESULTADO del análisis, y una fila ausente se
  //     leería como «descartado».
  bloques.push(
    '<b>Descargas atmosféricas: no hay dato.</b> IDEAM no las publica en abierto, y el único '
    + 'conjunto de rayos disponible en el portal de datos abiertos es de otro operador — cubre el '
    + 'eje cafetero, no tiene ni un registro en el Caribe y termina en 2024. En una línea tropical '
    + 'el rayo es la causa número uno, así que este sistema <b>no puede afirmar ni descartar</b> que '
    + 'un rayo interviniera. No poder descartarlo es un resultado, no un fallo que disimular.',
  );

  // 7 · Los límites del clima que sí se trajo.
  if (!sondeos.length) {
    bloques.push(
      '<b>No se congeló ningún sondeo meteorológico.</b> La ausencia de clima en este expediente no '
      + 'es un descarte del clima como causa.',
    );
  } else {
    const lejos = sondeos.filter((s) => Number(objeto(s.estacion).distancia_km) > 20);
    if (lejos.length) {
      bloques.push(
        `<b>${n(lejos.length)} sondeo(s) vienen de una estación a más de 20 km del punto.</b> Son `
        + 'observaciones DE ESA ESTACIÓN, no del vano: una tormenta local puede no aparecer.',
      );
    }
    const fuera = sondeos.filter((s) => s.fueraDeVentana);
    if (fuera.length) {
      bloques.push(
        `<b>${n(fuera.length)} sondeo(s) se pidieron para un evento POSTERIOR al último dato `
        + 'publicado por IDEAM.</b> No hay clima que traer todavía: es el desfase de la fuente.',
      );
    }
  }

  return parrafo(
    'Esta sección se arma sola de lo que el análisis sabe de sí mismo. No se escribe a mano, y por '
    + 'eso está: la que se escribe a mano es la que se olvida el día que el informe corre prisa. '
    + '<b>Un análisis que declara sus límites parece más débil y es más sólido.</b>',
  ) + bloques.map((b) => `<p class="lim">${b}</p>`).join('\n');
}

// ── EL DOCUMENTO ────────────────────────────────────────────────────────────

const TITULO_LIMITES = 'Límites de este análisis';

/**
 * El informe del análisis, autocontenido.
 *
 * @param {Object} entrada
 * @param {Object} entrada.analisis  el documento `AnalisisCausa`
 * @param {Array}  [entrada.acciones]  las acciones CAPA (colección aparte)
 * @param {Array}  [entrada.sondeos]   los sondeos de clima congelados
 * @param {Object} [entrada.meta]      `{ generadoEn }`
 */
export function informeRcaHtml(entrada) {
  const e = objeto(entrada);
  const a = objeto(e.analisis);
  const acciones = lista(e.acciones);
  const sondeos = lista(e.sondeos);
  const meta = objeto(e.meta);

  // Se le pasan las acciones al motor por el mismo objeto que el resto: viven
  // en otra colección, pero para el razonamiento son parte del análisis.
  const conAcciones = { ...a, acciones };

  const cuerpo = [
    { titulo: 'Alcance del análisis', html: seccionAlcance(a) },
    { titulo: 'Familias de causas (tabla de descartes)', html: seccionEspinas(lista(a.espinas)) },
    { titulo: 'Cadenas de porqués', html: seccionPorques(lista(a.cadenas)) },
    { titulo: 'Árbol de causas y barreras', html: seccionArbol(lista(a.arbol)) },
    { titulo: 'Hipótesis', html: seccionHipotesis(lista(a.hipotesis)) },
    { titulo: 'Clima del evento', html: seccionClima(sondeos) },
    { titulo: 'Acciones correctivas y preventivas', html: seccionAcciones(acciones, lista(a.arbol)) },
    { titulo: 'Causa raíz', html: seccionCausaRaiz(a) },
  ];

  // OBLIGATORIA Y ÚLTIMA, con o sin límites que declarar.
  cuerpo.push({
    titulo: TITULO_LIMITES,
    html: seccionLimites({ a: conAcciones, sondeos }),
    clase: 'limites',
  });

  const indice = cuerpo.map((s) => s.titulo);
  const secciones = cuerpo.map((s, i) =>
    `<section${s.clase ? ` class="${s.clase}"` : ''}>
  <h2>${i + 1}. ${esc(s.titulo)}</h2>
  ${s.html}
</section>`).join('\n');

  const titulo = `Análisis de causa raíz ${a.codigo ?? 'sin identificar'}`;

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
${portadaRca(a, meta, indice)}
${secciones}
<p class="pie">${esc(a.codigo ?? 'Análisis sin identificar')} · documento generado por la plataforma
de mantenimiento de líneas AT${meta.generadoEn ? ` el ${esc(meta.generadoEn)}` : ''}. Este documento
no certifica nada por sí mismo: certifica el ingeniero que lo firma.</p>
</main>
</body>
</html>`;
}

function seccionAlcance(a) {
  const al = objeto(a.alcance);
  const cuenta = lista(al.lineaIds).length + lista(al.apoyoIds).length + lista(al.investigacionIds).length;
  return tabla({
    leyenda: 'Alcance',
    cabecera: cab(['Concepto', 'Valor']),
    filas: [
      ['Código', esc(a.codigo ?? SIN_DATO)],
      ['Título', escRico(a.titulo ?? SIN_DATO)],
      ['Estado', legible(a.estado ?? SIN_DATO)],
      ['Abierto', esc(String(a.abiertoEn ?? '').slice(0, 10) || SIN_DATO)],
      ['Líneas', `${n(lista(al.lineaIds).length)}`],
      ['Apoyos', `${n(lista(al.apoyoIds).length)}`],
      ['Expedientes de falla', `${n(lista(al.investigacionIds).length)}`],
    ].map(fila),
  }) + (cuenta === 0 && al.sinActivoIdentificado
    ? nota(`<b>Sin activo identificado todavía:</b> ${escRico(al.sinActivoIdentificado)}. Un análisis `
      + 'puede abrirse antes de saber qué apoyo de qué línea falló — exigirlo obligaría a inventarlo.')
    : '');
}

function seccionCausaRaiz(a) {
  if (!a.causaRaiz) {
    const cond = condicionesCausaRaiz(a);
    const faltan = lista(cond.condiciones).filter((c) => !c.cumple);
    return parrafo(
      '<b>Este análisis todavía no tiene causa raíz declarada</b>, y durante semanas ése es su '
      + 'estado normal. Lo que sigue es lo que falta para poder declararla; el sistema no la marca '
      + 'nunca: mide, y decide el ingeniero.',
    ) + (faltan.length
      ? tabla({
        leyenda: 'Condiciones pendientes',
        cabecera: cab(['Condición']),
        filas: faltan.map((c) => fila([escRico(c.texto ?? c.clave ?? '')])),
      })
      : parrafo('Las seis condiciones se cumplen: falta que una persona la declare.'));
  }

  const c = objeto(a.causaRaiz);
  return parrafo(`<b>${escRico(c.enunciado)}</b>`)
    + tabla({
      leyenda: 'Declaración',
      cabecera: cab(['Concepto', 'Valor']),
      filas: [
        ['Declarada por', esc(c.declaradaPor ?? SIN_DATO)],
        ['Fecha', esc(String(c.declaradaEn ?? '').slice(0, 16).replace('T', ' ') || SIN_DATO)],
        ['Condiciones sin cumplir al declararla', `${n(lista(c.condicionesNoCumplidas).length)}`],
      ].map(fila),
    });
}

/**
 * La portada dice de entrada si esto es un AVANCE o una CONCLUSIÓN.
 *
 * Sin barra de progreso y sin porcentaje: los dos fabrican certeza donde no la
 * hay, y están prohibidos por `99 §ADR-020`. Una palabra basta.
 */
function portadaRca(a, meta, indice) {
  const esConclusion = Boolean(a.causaRaiz);
  return `<header class="portada">
  <p class="sello">${esConclusion ? 'CONCLUSIÓN' : 'AVANCE — sin causa raíz declarada'}</p>
  <h1>Análisis de causa raíz · ${esc(a.codigo ?? 'sin identificar')}</h1>
  <p class="sub">${escRico(a.titulo ?? '')}</p>
  ${meta.generadoEn ? `<p class="nota">Generado el ${esc(meta.generadoEn)}.</p>` : ''}
  <ol class="indice">${indice.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
</header>`;
}
