// ============================================================================
// nucleo/rca.js — las reglas del método de causa raíz, como código probado
// ----------------------------------------------------------------------------
// QUÉ ES: el guardián del método. Un análisis de causa raíz mal hecho no se ve
// mal — se ve CONVINCENTE, y esa es exactamente su peligrosidad: manda cuadrillas
// al sitio equivocado y cierra expedientes que debían seguir abiertos. Este
// módulo existe para que las reglas que impiden eso sean verificables y no
// dependan de que quien investiga se acuerde de aplicarlas.
//
// QUÉ REGLA LO GOBIERNA (CLAUDE.md §4): el veredicto sale del VALOR contra la
// NORMA, nunca del texto de un modelo. Aquí no hay excepción — con un matiz que
// importa: en un RCA la «norma» no es una cifra, es el MÉTODO. Así que lo que se
// verifica es el método, y se verifica entero.
//
// LO QUE ESTE MÓDULO NO HACE, Y ES DELIBERADO:
//
//   · NO declara la causa raíz. Calcula qué condiciones se cumplen y cuáles no,
//     y las devuelve. Marcar es de la persona que firma. La misma línea que el
//     resto del producto: el motor mide, el ingeniero decide.
//   · NO ordena las hipótesis. Ordenar es dictaminar. Devuelve conteos crudos;
//     no hay fórmula que los combine en un ranking.
//   · NO puntúa el avance. Un análisis «al 92 %» empuja a cerrar, y cerrar antes
//     de tiempo es el fallo que más caro sale.
//
// Módulo PURO: sin DOM, sin red, sin base. Igual que el resto de `nucleo/`.
// ============================================================================

/** Las once espinas, en el orden en que SIEMPRE se pintan. */
export const ESPINAS = Object.freeze([
  'conductor',
  'conexiones_empalmes',
  'aislamiento_herrajes',
  'estructura_cimentacion',
  'tierra_apantallamiento',
  'ambiente_clima',
  'vegetacion_servidumbre',
  'diseno_hipotesis',
  'montaje_tendido',
  'operacion_maniobra',
  'inspeccion_mantenimiento',
]);

/** La escalera de los porqués, de lo que se ve a lo que se puede cambiar. */
export const NIVELES = Object.freeze(['efecto', 'modo_falla', 'mecanismo_fisico', 'condicion', 'regla']);

/** Índice del nivel. Cuanto más alto, más cerca de algo sobre lo que se puede actuar. */
const rango = (nivel) => NIVELES.indexOf(nivel);

/** Un nivel a partir del cual una causa es ACCIONABLE: se puede cambiar una condición o una regla. */
export const NIVEL_MINIMO_CAUSA_RAIZ = 'condicion';

// ── LA TABLA DE DESCARTES ───────────────────────────────────────────────────

/**
 * Devuelve SIEMPRE las once espinas, en el mismo orden, con datos o sin ellos.
 *
 * La trampa que evita es la misma que ya evita `umbrales.js`: una espina que
 * desaparece cuando falta el dato se lee como «eso ya no aplica», y el informe
 * sale sin el hueco a la vista. Lo que no se evaluó tiene que verse.
 *
 * Y valida las dos reglas que sostienen el método:
 *   · `descartada` y `sostenida` EXIGEN evidencia enlazada. Descartar sin
 *     evidencia es el atajo que vacía un Ishikawa en diez minutos.
 *   · `no_evaluable` EXIGE decir qué dato falta. «No evaluable» a secas es
 *     indistinguible de «no me apeteció mirar».
 */
/** @param {Array} [evaluaciones] */
export function evaluarEspinas(evaluaciones = []) {
  const porEspina = new Map(evaluaciones.map((e) => [e.espina, e]));

  return ESPINAS.map((espina) => {
    const e = porEspina.get(espina);
    if (!e) {
      return {
        espina,
        estado: 'no_evaluable',
        motivo: 'Nadie ha mirado esta familia de causas todavía.',
        evidenciaIds: [],
        datoQueFalta: null,
        defectos: [],
      };
    }

    const defectos = [];
    const ev = e.evidenciaIds ?? [];
    if ((e.estado === 'descartada' || e.estado === 'sostenida') && ev.length === 0) {
      defectos.push(
        `«${e.estado}» sin evidencia enlazada: no se puede ${e.estado === 'descartada' ? 'descartar' : 'sostener'} una familia de causas sin decir con qué.`,
      );
    }
    if (e.estado === 'no_evaluable' && !e.datoQueFalta) {
      defectos.push('«no evaluable» sin decir qué dato falta: es indistinguible de no haber mirado.');
    }
    if (!e.motivo || !String(e.motivo).trim()) {
      defectos.push('sin motivo escrito: un estado que no se puede auditar no vale.');
    }

    return {
      espina,
      estado: e.estado,
      motivo: e.motivo ?? '',
      evidenciaIds: ev,
      datoQueFalta: e.datoQueFalta ?? null,
      defectos,
    };
  });
}

// ── LAS CADENAS DE PORQUÉS ──────────────────────────────────────────────────

/**
 * Qué tan lejos llegó una cadena, y dónde está su eslabón más débil.
 *
 * Una cadena vale lo que su eslabón peor sostenido: cinco porqués impecables y
 * uno sin evidencia producen una conclusión que se cae por ese sexto. Por eso se
 * devuelve CUÁL es, no solo que existe.
 */
export function fuerzaCadena(cadena) {
  const eslabones = cadena?.eslabones ?? [];
  if (!eslabones.length) {
    return { nivelAlcanzado: null, esAccionable: false, sinEvidencia: [], masDebil: null, cortada: null };
  }

  const cortada = eslabones.find((x) => x.cortadaPorFaltaDeDato) ?? null;
  const sinEvidencia = eslabones
    .map((x, i) => ({ i, nivel: x.nivel, enunciado: x.enunciado }))
    .filter((_, i) => (eslabones[i].evidenciaIds ?? []).length === 0);

  // El nivel alcanzado es el MÁS ALTO de la cadena, no el del último eslabón:
  // una cadena puede volver atrás para explicar una rama.
  const nivelAlcanzado = eslabones.reduce(
    (mejor, x) => (rango(x.nivel) > rango(mejor) ? x.nivel : mejor),
    eslabones[0].nivel,
  );

  return {
    nivelAlcanzado,
    esAccionable: rango(nivelAlcanzado) >= rango(NIVEL_MINIMO_CAUSA_RAIZ),
    sinEvidencia,
    masDebil: sinEvidencia[0] ?? null,
    cortada: cortada ? { enunciado: cortada.enunciado, motivo: cortada.cortadaPorFaltaDeDato } : null,
  };
}

/**
 * El diagnóstico que la pantalla enseña junto a una cadena.
 *
 * Es el texto, no un color: un ingeniero necesita leer POR QUÉ su cadena no
 * llega, no ver un semáforo ámbar sin explicación.
 */
export function diagnosticoCadena(cadena) {
  const f = fuerzaCadena(cadena);
  if (!f.nivelAlcanzado) return 'Cadena vacía.';
  if (f.cortada) {
    return `Cortada por falta de dato en «${f.cortada.enunciado}»: ${f.cortada.motivo}. `
         + 'Declararlo es preferible a inventar el último eslabón.';
  }
  if (!f.esAccionable) {
    return `Llega hasta ${f.nivelAlcanzado.replace('_', ' ')} y ahí se detiene. `
         + 'Eso describe física, no gestión — y sobre la física no se puede actuar. '
         + 'Una causa raíz vive en la condición que lo permitió o en la regla que lo consintió.';
  }
  if (f.sinEvidencia.length) {
    return `Llega a ${f.nivelAlcanzado}, pero ${f.sinEvidencia.length} eslabón(es) no tienen evidencia enlazada.`;
  }
  return `Llega a ${f.nivelAlcanzado}, con evidencia en todos sus eslabones.`;
}

// ── EL ÁRBOL ────────────────────────────────────────────────────────────────

/**
 * Comprueba que el árbol sea un árbol y no un dibujo bonito: sin ciclos, sin
 * huérfanos, con una sola raíz, y sin la trampa que más ensucia un RCA — un nodo
 * que culpa a una persona sin colgar de él la condición que lo permitió.
 */
/** @param {Array} [nodos] */
export function validarArbol(nodos = []) {
  const problemas = [];
  const porId = new Map(nodos.map((n) => [n.id, n]));

  const raices = nodos.filter((n) => n.padreId === null || n.padreId === undefined);
  if (nodos.length && raices.length === 0) problemas.push('El árbol no tiene raíz: todos los nodos cuelgan de otro.');
  if (raices.length > 1) problemas.push(`El árbol tiene ${raices.length} raíces; un evento tiene un solo efecto observado.`);

  for (const n of nodos) {
    if (n.padreId && !porId.has(n.padreId)) {
      problemas.push(`«${n.enunciado}» cuelga de un nodo que no existe.`);
    }
    if (n.padreId && !n.tipoArista) {
      problemas.push(`«${n.enunciado}» no dice si es causa necesaria, suficiente o contribuyente.`);
    }
  }

  // Ciclos: subir desde cada nodo hasta la raíz, con tope.
  for (const n of nodos) {
    const visto = new Set([n.id]);
    let actual = n.padreId ? porId.get(n.padreId) : null;
    let saltos = 0;
    while (actual && saltos++ < nodos.length + 1) {
      if (visto.has(actual.id)) { problemas.push(`Hay un ciclo en «${n.enunciado}».`); break; }
      visto.add(actual.id);
      actual = actual.padreId ? porId.get(actual.padreId) : null;
    }
  }

  const sinEvidencia = nodos.filter((n) => (n.evidenciaIds ?? []).length === 0);
  const hojas = nodos.filter((n) => !nodos.some((h) => h.padreId === n.id));
  const hojasNoAccionables = hojas.filter((n) => rango(n.nivel) < rango(NIVEL_MINIMO_CAUSA_RAIZ));

  return {
    valido: problemas.length === 0,
    problemas,
    nodos: nodos.length,
    sinEvidencia: sinEvidencia.length,
    /**
     * Ramas que terminan en efecto, modo o mecanismo. NO son un error del árbol
     * —una rama puede estar a medias— pero ninguna de ellas puede sostener una
     * causa raíz, y la pantalla lo dice.
     */
    hojasNoAccionables: hojasNoAccionables.map((n) => ({ id: n.id, enunciado: n.enunciado, nivel: n.nivel })),
  };
}

/** Las barreras que se analizaron, y cuántas fallaron. La pregunta que suele valer más que la causa. */
/** @param {Array} [nodos] */
export function resumenBarreras(nodos = []) {
  const conBarrera = nodos.filter((n) => n.barrera);
  const fallaron = conBarrera.filter((n) => ['ausente', 'inefectiva', 'no_aplicada'].includes(n.barrera.estado));
  return {
    analizadas: conBarrera.length,
    fallaron: fallaron.length,
    cuales: fallaron.map((n) => ({ cual: n.barrera.cual, estado: n.barrera.estado, detalle: n.barrera.detalle })),
    /**
     * Un evento que atravesó varias barreras no tiene UNA causa raíz: tiene
     * varios fallos de defensa. Arreglar solo la causa deja las demás abiertas.
     */
    aviso: fallaron.length > 1
      ? `Este evento atravesó ${fallaron.length} defensas. Corregir solo la causa deja las otras ${fallaron.length - 1} abiertas.`
      : null,
  };
}

// ── HIPÓTESIS ───────────────────────────────────────────────────────────────

/**
 * Aplica las dos reglas que impiden que una hipótesis sea una creencia.
 *
 * 1. TOPE CLIMÁTICO. Una hipótesis cuyo único sustento es meteorológico no puede
 *    pasar de `baja`, por muy sugerente que sea el dato. Que hubiera viento
 *    fuerte el día de la falla no prueba que el viento la causara: en el Caribe
 *    hay viento fuerte muchos días y las líneas no se caen. Es la correlación
 *    más tentadora que existe en este dominio, y por eso está topada en el
 *    motor y no en la buena voluntad de quien redacta.
 *
 * 2. REFUTABILIDAD. Una hipótesis que no dice qué la tumbaría no es una
 *    hipótesis. Se marca como defectuosa y no puede sostener una causa raíz.
 */
/** @param {Array} [hipotesis] */
export function revisarHipotesis(hipotesis = []) {
  return hipotesis.map((h) => {
    const defectos = [];
    let verosimilitud = h.verosimilitud;

    if (h.sustentoSoloClimatico && ['media', 'alta', 'confirmada'].includes(verosimilitud)) {
      defectos.push(
        'Sustento únicamente meteorológico: topada en «baja». Que hubiera ese clima el día del '
        + 'evento no prueba que lo causara — hace falta evidencia física del mecanismo.',
      );
      verosimilitud = 'baja';
    }
    if (!h.queLaRefutaria || !String(h.queLaRefutaria).trim()) {
      defectos.push('No declara qué evidencia la refutaría: eso no es una hipótesis, es una creencia.');
    }
    if ((h.evidenciaIds ?? []).length === 0 && verosimilitud !== 'descartada') {
      defectos.push('Sin evidencia enlazada.');
    }

    return { ...h, verosimilitudEfectiva: verosimilitud, topadaPorClima: verosimilitud !== h.verosimilitud, defectos };
  });
}

// ── LAS CONDICIONES PARA DECLARAR UNA CAUSA RAÍZ ────────────────────────────

/**
 * Las seis condiciones. **Este módulo NO marca la causa raíz**: dice cuáles se
 * cumplen y cuáles no, y quien firma decide con eso delante.
 *
 * Por eso la pantalla no tiene botón de cerrar mientras alguna falle: en su
 * sitio va la lista de lo que falta. Un botón deshabilitado invita a buscar cómo
 * habilitarlo; una lista de lo que falta invita a ir a buscarlo.
 */
/**
 * @param {Object}  [a]
 * @param {Array}   [a.espinas]    evaluaciones de las once familias
 * @param {Array}   [a.cadenas]    cadenas de porqués
 * @param {Array}   [a.arbol]      nodos del árbol de causas
 * @param {Array}   [a.hipotesis]  hipótesis con su sustento y su refutación
 * @param {Array}   [a.ausencias]  lo que falta por verificar
 */
export function condicionesCausaRaiz({ espinas = [], cadenas = [], arbol = [], hipotesis = [], ausencias = [] } = {}) {
  const tabla = evaluarEspinas(espinas);
  const revisadas = revisarHipotesis(hipotesis);
  const val = validarArbol(arbol);
  const barreras = resumenBarreras(arbol);

  const sinMirar = tabla.filter((e) => e.estado === 'no_evaluable' && !e.datoQueFalta);
  const conDefectos = tabla.filter((e) => e.defectos.length);
  const accionables = cadenas.map(fuerzaCadena).filter((f) => f.esAccionable);
  const sostenidas = revisadas.filter((h) => ['alta', 'confirmada'].includes(h.verosimilitudEfectiva));
  const pendientesCriticas = ausencias.filter((a) => a.estado === 'pendiente' || a.estado === 'solicitado');

  const condiciones = [
    {
      clave: 'espinas_recorridas',
      texto: 'Las once familias de causas se recorrieron: ninguna quedó sin mirar en silencio.',
      cumple: sinMirar.length === 0 && conDefectos.length === 0,
      detalle: sinMirar.length
        ? `${sinMirar.length} espina(s) sin mirar y sin decir qué dato falta.`
        : conDefectos.length ? `${conDefectos.length} espina(s) con defectos de método.` : null,
    },
    {
      clave: 'cadena_accionable',
      texto: 'Al menos una cadena de porqués llega a una condición o a una regla — algo sobre lo que se puede actuar.',
      cumple: accionables.length > 0,
      detalle: accionables.length ? null : 'Ninguna cadena pasa del mecanismo físico.',
    },
    {
      clave: 'arbol_valido',
      texto: 'El árbol de causas es coherente: una raíz, sin ciclos, con el tipo de cada relación declarado.',
      cumple: val.valido && val.nodos > 0,
      detalle: val.nodos === 0 ? 'No hay árbol.' : (val.problemas[0] ?? null),
    },
    {
      clave: 'barreras_analizadas',
      texto: 'Se analizó qué defensa debió detener el evento y por qué no lo hizo.',
      cumple: barreras.analizadas > 0,
      detalle: barreras.analizadas ? null : 'Ninguna barrera analizada: falta la pregunta que más suele valer.',
    },
    {
      clave: 'hipotesis_sostenida',
      texto: 'Hay al menos una hipótesis sostenida con evidencia física, y declara qué la refutaría.',
      cumple: sostenidas.length > 0 && sostenidas.every((h) => h.defectos.length === 0),
      detalle: sostenidas.length === 0
        ? 'Ninguna hipótesis llega a «alta» con evidencia propia.'
        : (sostenidas.find((h) => h.defectos.length)?.defectos[0] ?? null),
    },
    {
      clave: 'ausencias_resueltas',
      texto: 'Lo que faltaba por verificar se resolvió, o se declaró como no disponible.',
      cumple: pendientesCriticas.length === 0,
      detalle: pendientesCriticas.length ? `${pendientesCriticas.length} verificación(es) siguen pendientes.` : null,
    },
  ];

  return {
    condiciones,
    cumplidas: condiciones.filter((c) => c.cumple).length,
    total: condiciones.length,
    /** `true` solo si TODAS se cumplen. Aun así, quien declara es la persona. */
    puedeDeclararse: condiciones.every((c) => c.cumple),
  };
}

// ── AUDITORÍA DE RESPALDO ───────────────────────────────────────────────────

/**
 * Cuenta las afirmaciones que no se apoyan en nada.
 *
 * Es el número que impide que un análisis convincente pase por sólido: un
 * expediente con veinte afirmaciones y tres evidencias se lee muy bien y no
 * prueba nada.
 */
/**
 * @param {Object} [a]
 * @param {Array}  [a.espinas]
 * @param {Array}  [a.cadenas]
 * @param {Array}  [a.arbol]
 * @param {Array}  [a.hipotesis]
 */
export function auditarRespaldo({ espinas = [], cadenas = [], arbol = [], hipotesis = [] } = {}) {
  const sinRespaldo = [];

  for (const e of evaluarEspinas(espinas)) {
    if ((e.estado === 'descartada' || e.estado === 'sostenida') && e.evidenciaIds.length === 0) {
      sinRespaldo.push({ donde: 'espina', que: e.espina, detalle: `marcada «${e.estado}» sin evidencia` });
    }
  }
  for (const c of cadenas) {
    for (const x of c.eslabones ?? []) {
      if ((x.evidenciaIds ?? []).length === 0 && !x.cortadaPorFaltaDeDato) {
        sinRespaldo.push({ donde: 'porque', que: x.nivel, detalle: x.enunciado });
      }
    }
  }
  for (const n of arbol) {
    if ((n.evidenciaIds ?? []).length === 0) sinRespaldo.push({ donde: 'arbol', que: n.nivel, detalle: n.enunciado });
  }
  for (const h of hipotesis) {
    if ((h.evidenciaIds ?? []).length === 0) sinRespaldo.push({ donde: 'hipotesis', que: h.espina, detalle: h.enunciado });
  }

  const totalAfirmaciones = espinas.length + cadenas.reduce((s, c) => s + (c.eslabones?.length ?? 0), 0)
                          + arbol.length + hipotesis.length;

  return {
    totalAfirmaciones,
    sinRespaldo: sinRespaldo.length,
    detalle: sinRespaldo,
    /** Sin adornos: si más de la mitad no se apoya en nada, el análisis es una narración. */
    aviso: totalAfirmaciones > 0 && sinRespaldo.length * 2 > totalAfirmaciones
      ? 'Más de la mitad de las afirmaciones no tienen evidencia enlazada.'
      : null,
  };
}

// ── LAS ACCIONES CAPA ───────────────────────────────────────────────────────

/**
 * Revisa el conjunto de acciones y publica sus defectos.
 *
 * LA PREGUNTA QUE ESTO CONTESTA no es «¿está bien rellenado el formulario?»,
 * sino la que hace un auditor un año después: **¿se puede demostrar que esto se
 * hizo?** Un plan de acciones que nadie puede comprobar es una lista de buenas
 * intenciones con fecha.
 *
 * LAS TRES REGLAS, y ninguna es de gusto:
 *
 *   1. CERRAR EXIGE PRUEBA. Una acción `cerrada` sin quién y sin cuándo es una
 *      casilla marcada. Y sin nada que la respalde —ni evidencia enlazada ni una
 *      comprobación escrita— es peor: parece trabajo hecho.
 *
 *   2. UNA CORRECTIVA CERRADA TIENE QUE DECIR QUÉ BARRERA CERRÓ. Sin barrera se
 *      puede PROPONER —un deseo puede existir— pero no dar por consumado: si no
 *      se sabe qué defensa quedó cubierta, nadie sabe si la falla puede repetirse.
 *
 *   3. DESCARTAR EXIGE MOTIVO ESCRITO. Descartar sin decir por qué no es una
 *      decisión: es hacer desaparecer la acción de la lista.
 *
 * NO SE ORDENAN NI SE PUNTÚAN. Ordenar es dictaminar (ADR-020), y aquí valdría
 * lo mismo: la acción que va primero se lee como la más importante, y eso lo
 * decide quien firma, no un criterio escrito en el código.
 *
 * @param {Array} [acciones]
 */
export function revisarAcciones(acciones = []) {
  return acciones.map((a) => {
    const defectos = [];
    const evidencias = (a.evidenciaIds ?? []).length;
    const escrita = Boolean(a.comoSeComprobo && String(a.comoSeComprobo).trim());

    // Qué respalda el cierre. Las dos formas valen, y NO se igualan: el informe
    // tiene que poder decir «cerrada, probada solo con una nota escrita».
    const pruebaEs = evidencias > 0 ? 'evidencia' : escrita ? 'escrita' : null;

    if (a.estado === 'cerrada') {
      if (!a.cerradaPor) defectos.push('Cerrada sin decir QUIÉN la cerró.');
      if (!a.cerradaEn) defectos.push('Cerrada sin decir CUÁNDO se cerró.');
      if (pruebaEs === null) {
        defectos.push(
          'Cerrada sin ninguna prueba de que se hizo: ni evidencia enlazada ni comprobación '
          + 'escrita. Una acción así parece trabajo hecho y no se puede demostrar.',
        );
      }
      if (a.clase === 'correctiva' && !a.barrera) {
        defectos.push(
          'Correctiva cerrada sin decir qué barrera queda cubierta. Sin eso nadie sabe si la '
          + 'falla puede repetirse por el mismo camino.',
        );
      }
    }

    if (a.estado === 'descartada' && !(a.motivoDescarte && String(a.motivoDescarte).trim())) {
      defectos.push('Descartada sin motivo escrito: eso no es decidir, es hacerla desaparecer.');
    }

    if (!a.que || !String(a.que).trim()) {
      defectos.push('Sin decir qué se hace.');
    }

    return { ...a, pruebaEs, defectos };
  });
}

/**
 * Resumen de las acciones para el informe, y **el hueco que más importa**: las
 * barreras que fallaron y no tienen ninguna acción encima.
 *
 * Ese hueco es el resultado más incómodo de un RCA bien hecho, y por eso se
 * calcula aquí y no se deja a la vista de nadie: se identificó una defensa que
 * no funcionó y no se hizo nada al respecto. Una lista de acciones larga puede
 * tapar perfectamente que la barrera principal sigue abierta.
 *
 * @param {Array} [acciones]
 * @param {Array} [nodosArbol]  nodos del árbol; la barrera va anidada: `{cual, estado, detalle}`
 */
export function resumenAcciones(acciones = [], nodosArbol = []) {
  const revisadas = revisarAcciones(acciones);
  const porEstado = {};
  for (const a of revisadas) porEstado[a.estado] = (porEstado[a.estado] ?? 0) + 1;

  const vivas = revisadas.filter((a) => a.estado !== 'descartada');
  const conBarrera = new Set(vivas.map((a) => a.barrera).filter(Boolean));

  // Las tres formas de que una defensa NO cortara la rama. `funciono` y
  // `no_evaluable` quedan fuera a propósito: la primera actuó, y de la segunda
  // no consta nada — pedir una acción sobre lo que no se sabe es inventar trabajo.
  const NO_CORTO = ['ausente', 'inefectiva', 'no_aplicada'];
  const falladas = [...new Set(
    nodosArbol
      .filter((n) => n.barrera?.cual && NO_CORTO.includes(n.barrera.estado))
      .map((n) => n.barrera.cual),
  )];
  const barrerasSinAccion = falladas.filter((b) => !conBarrera.has(b));

  return {
    total: revisadas.length,
    porEstado,
    conDefectos: revisadas.filter((a) => a.defectos.length > 0).length,
    cerradasSoloConNota: revisadas.filter((a) => a.estado === 'cerrada' && a.pruebaEs === 'escrita').length,
    barrerasSinAccion,
    acciones: revisadas,
  };
}
