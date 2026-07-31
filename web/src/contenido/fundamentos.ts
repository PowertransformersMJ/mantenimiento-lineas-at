// ============================================================================
// contenido/fundamentos.ts — la doctrina de la pestaña Fundamentos, como DATO
// ----------------------------------------------------------------------------
// Portado del módulo original (array FUND, líneas 2138-2321; marco normativo,
// líneas 1443-1452). Contenido SIN datos de cliente: puede viajar en el
// paquete público. Los VALORES VIVOS "en esta línea" no viven aquí: los
// calcula el componente con el núcleo, desde los datos autenticados.
//
// Fidelidad con dos correcciones DECLARADAS (no silenciosas):
//  · El original afirmaba "T_máx ≤ 50 % · RTS" como si fuera norma. La
//    auditoría normativa del proyecto (docs/10 · TODO-11) encontró que el
//    RETIE fija 25 % de la carga de rotura en condición SIN carga externa y
//    que el 50 % es un criterio clásico de diseño, no un artículo del RETIE.
//    La tarjeta lo dice con esas palabras.
//  · El original citaba DOS resoluciones distintas del RETIE en dos sitios.
//    La contradicción se muestra como pendiente, no se resuelve en silencio.
//
// Los campos con marcado en línea (<b>, <i>, <sub>) y las fórmulas MathML se
// renderizan como HTML: son contenido NUESTRO, estático, sin entrada de
// usuario.
// ============================================================================

export interface TarjetaFundamento {
  id: string;
  titulo: string;
  concepto: string;
  formulaMathML: string;
  comoSeCalcula: string;
  queVigilar: string;
}

const MML = 'http://www.w3.org/1998/Math/MathML';

export const TARJETAS: TarjetaFundamento[] = [
  {
    id: 'cat',
    titulo: 'Catenaria',
    concepto:
      'La curva que adopta un conductor suspendido entre dos apoyos bajo su propio peso. No es una parábola ni un arco de círculo: es un coseno hiperbólico. Todo el cálculo mecánico de una línea parte de ella.',
    formulaMathML: `<math xmlns="${MML}" display="block"><mi>y</mi><mo>=</mo><mi>C</mi><mo>·</mo><mo>[</mo><mi>cosh</mi><mo>(</mo><mi>x</mi><mo>/</mo><mi>C</mi><mo>)</mo><mo>−</mo><mn>1</mn><mo>]</mo></math><math xmlns="${MML}" display="block"><mi>C</mi><mo>=</mo><mfrac><mi>H</mi><mi>w</mi></mfrac></math>`,
    comoSeCalcula:
      '<b>H</b> es la componente horizontal de la tensión, constante a lo largo de todo el vano. <b>w</b> es el peso por metro del conductor. El cociente <b>C</b> es el <b>parámetro de la catenaria</b> y tiene unidades de longitud: es el radio de curvatura del conductor en su punto más bajo. Cuanto mayor es C, más tenso y más recto está el conductor.',
    queVigilar:
      'C es el indicador más directo del riesgo de vibración eólica: por encima de unos 1 800 m el conductor está demasiado tenso y vibra sin amortiguar <i>(criterio práctico del módulo original; sin norma citada — se usa como bandera, no como dictamen)</i>.',
  },
  {
    id: 'flecha',
    titulo: 'Flecha máxima y mínima',
    concepto:
      'La distancia vertical entre la recta que une los puntos de sujeción y el punto más bajo del conductor. No es un valor único: cambia con la temperatura, con la carga de viento y con los años.',
    formulaMathML: `<math xmlns="${MML}" display="block"><msub><mi>f</mi><mi>cat</mi></msub><mo>=</mo><mi>C</mi><mo>·</mo><mo>[</mo><mi>cosh</mi><mo>(</mo><mfrac><mi>a</mi><mrow><mn>2</mn><mi>C</mi></mrow></mfrac><mo>)</mo><mo>−</mo><mn>1</mn><mo>]</mo></math><math xmlns="${MML}" display="block"><msub><mi>f</mi><mi>par</mi></msub><mo>=</mo><mfrac><mrow><mi>w</mi><mo>·</mo><msup><mi>a</mi><mn>2</mn></msup></mrow><mrow><mn>8</mn><mo>·</mo><mi>H</mi></mrow></mfrac></math>`,
    comoSeCalcula:
      'La primera es exacta. La segunda es su aproximación parabólica, válida mientras <b>a/C</b> se mantenga pequeño. Al calentarse, el conductor se dilata, la tensión H baja y la flecha crece; al enfriarse ocurre lo contrario.',
    queVigilar:
      'La <b>máxima</b> gobierna la distancia al terreno: es la condición de seguridad. La <b>mínima</b> gobierna el balanceo con viento, la separación entre fases y el arrancamiento en apoyos bajos.',
  },
  {
    id: 'vir',
    titulo: 'VIR — vano ideal de regulación',
    concepto:
      'Entre dos apoyos de retención el conductor pasa libremente por las grapas de suspensión, de modo que <b>la tensión se iguala en todos los vanos del tramo</b>. El VIR es el vano ficticio único que tendría esa misma tensión: permite calcular un tramo de vanos desiguales como si fuera uno solo.',
    formulaMathML: `<math xmlns="${MML}" display="block"><mi>VIR</mi><mo>=</mo><msqrt><mfrac><mrow><msubsup><mi>a</mi><mn>1</mn><mn>3</mn></msubsup><mo>+</mo><msubsup><mi>a</mi><mn>2</mn><mn>3</mn></msubsup><mo>+</mo><mo>…</mo><mo>+</mo><msubsup><mi>a</mi><mi>n</mi><mn>3</mn></msubsup></mrow><mrow><msub><mi>a</mi><mn>1</mn></msub><mo>+</mo><msub><mi>a</mi><mn>2</mn></msub><mo>+</mo><mo>…</mo><mo>+</mo><msub><mi>a</mi><mi>n</mi></msub></mrow></mfrac></msqrt></math>`,
    comoSeCalcula:
      'Se eleva al cubo cada vano, se suman, se divide entre la suma de los vanos y se extrae la raíz. Los vanos largos pesan mucho más que los cortos, por eso van al cubo. Con el VIR se resuelve la ecuación de cambio de estado una sola vez y el resultado se aplica a todo el tramo.',
    queVigilar:
      'La hipótesis del VIR solo es válida si cada vano no se aparta demasiado de él. Fuera del rango <b>0,7 – 1,3</b> la tensión real del vano se desvía de la calculada, y el tramo debería subdividirse.',
  },
  {
    id: 'tens',
    titulo: 'Tensión de rotura y tensiones de trabajo',
    concepto:
      'La <b>tensión de rotura</b> o RTS es la carga a la que el conductor se parte en ensayo. Nunca se trabaja cerca de ella: las tensiones de servicio se expresan como porcentaje de la RTS.',
    formulaMathML: `<math xmlns="${MML}" display="block"><mi>EDS</mi><mo>=</mo><mn>18</mn><mo>–</mo><mn>22</mn><mo>%</mo><mo>·</mo><mi>RTS</mi></math>`,
    comoSeCalcula:
      'El <b>EDS</b> (<i>every day stress</i>) es la tensión en la condición más frecuente del año, y su límite lo fija la fatiga por vibración, no la resistencia. En la condición más desfavorable (viento o temperatura mínima) manda la resistencia mecánica.',
    queVigilar:
      'Un EDS por debajo del 18 % da flechas excesivas; por encima del 22 % acelera la fatiga. <b>Sobre el tope de la condición máxima:</b> el módulo original adoptaba «≤ 50 % de la RTS» como si fuera norma; la auditoría normativa del proyecto encontró que <b>el RETIE fija el 25 % de la carga de rotura en condición sin carga externa</b> y que el 50 % es un criterio clásico de diseño, no un artículo del reglamento. El cierre contra la ficha real del conductor está pendiente y así se declara (docs/10 · TODO-11).',
  },
  {
    id: 'cambio',
    titulo: 'Ecuación de cambio de estado',
    concepto:
      'El conductor tiene una sola longitud física. Si cambia la temperatura o la carga, esa longitud se redistribuye entre dilatación térmica y alargamiento elástico, y la tensión se ajusta sola. La ecuación de cambio de estado es el balance que permite pasar de un estado conocido a otro.',
    formulaMathML: `<math xmlns="${MML}" display="block"><msubsup><mi>H</mi><mn>2</mn><mn>2</mn></msubsup><mo>·</mo><mo>[</mo><msub><mi>H</mi><mn>2</mn></msub><mo>−</mo><msub><mi>H</mi><mn>1</mn></msub><mo>+</mo><mi>α</mi><mo>·</mo><mi>E</mi><mo>·</mo><mi>S</mi><mo>·</mo><mo>(</mo><msub><mi>t</mi><mn>2</mn></msub><mo>−</mo><msub><mi>t</mi><mn>1</mn></msub><mo>)</mo><mo>+</mo><mfrac><mrow><msubsup><mi>w</mi><mn>1</mn><mn>2</mn></msubsup><mo>·</mo><msup><mi>a</mi><mn>2</mn></msup><mo>·</mo><mi>E</mi><mo>·</mo><mi>S</mi></mrow><mrow><mn>24</mn><mo>·</mo><msubsup><mi>H</mi><mn>1</mn><mn>2</mn></msubsup></mrow></mfrac><mo>]</mo><mo>=</mo><mfrac><mrow><msubsup><mi>w</mi><mn>2</mn><mn>2</mn></msubsup><mo>·</mo><msup><mi>a</mi><mn>2</mn></msup><mo>·</mo><mi>E</mi><mo>·</mo><mi>S</mi></mrow><mn>24</mn></mfrac></math>`,
    comoSeCalcula:
      '<b>α</b> es el coeficiente de dilatación, <b>E</b> el módulo elástico, <b>S</b> la sección y <b>a</b> el VIR del tramo. Es una ecuación cúbica en H₂ que se resuelve numéricamente; el núcleo la resuelve por bisección con tolerancia de un kilogramo, y su solución está validada por identidad física en las pruebas de oro (docs/40 §8).',
    queVigilar:
      'Es el motor de todo: sin ella no se puede saber qué flecha tendrá el conductor en una condición distinta de aquella en que se tendió.',
  },
  {
    id: 'defl',
    titulo: 'Ángulo de deflexión y carga transversal',
    concepto:
      'Cuando la línea cambia de dirección en un apoyo, las tensiones de los dos vanos no se cancelan: dejan una resultante sobre la bisectriz del ángulo que la estructura tiene que resistir. Es la carga que define si un apoyo puede ser de suspensión o debe ser de retención.',
    formulaMathML: `<math xmlns="${MML}" display="block"><mi>Ft</mi><mo>=</mo><mn>2</mn><mo>·</mo><mi>H</mi><mo>·</mo><mi>sen</mi><mo>(</mo><mi>α</mi><mo>/</mo><mn>2</mn><mo>)</mo><mspace width="1em"/><mtext>por conductor</mtext></math>`,
    comoSeCalcula:
      '<b>α</b> es el ángulo de deflexión, medido entre la prolongación del vano de entrada y el vano de salida. Se calcula a partir de los azimuts geodésicos de los dos vanos. La carga total del apoyo es Ft multiplicada por el número de conductores.',
    queVigilar:
      'Un mismo conductor con la misma tensión produce cargas muy distintas según el ángulo: a 0° la resultante es nula, a 60° iguala la tensión, a 120° la multiplica por 1,73.',
  },
  {
    id: 'vanos',
    titulo: 'Vano viento y vano peso',
    concepto:
      'Dos longitudes ficticias que reparten las cargas de un vano entre los dos apoyos que lo sostienen.',
    formulaMathML: `<math xmlns="${MML}" display="block"><msub><mi>a</mi><mi>viento</mi></msub><mo>=</mo><mfrac><mrow><msub><mi>a</mi><mn>1</mn></msub><mo>+</mo><msub><mi>a</mi><mn>2</mn></msub></mrow><mn>2</mn></mfrac></math>`,
    comoSeCalcula:
      'El <b>vano viento</b> es la semisuma de los vanos adyacentes y define la carga transversal por viento sobre el apoyo. El <b>vano peso</b> es la distancia entre los puntos más bajos de las dos catenarias contiguas y define la carga vertical. En terreno inclinado el vano peso puede ser <b>negativo</b>: el conductor tira hacia arriba y el apoyo trabaja a arrancamiento.',
    queVigilar:
      'Un vano peso negativo es condición de arrancamiento: la cadena de suspensión se levanta y puede desengancharse. Solo se detecta con perfil topográfico real.',
  },
  {
    id: 'amp',
    titulo: 'Ampacidad y balance térmico',
    concepto:
      'La corriente máxima que puede circular sin que el conductor supere su temperatura límite. No es una constante del conductor: depende del ambiente. El mismo cable transporta menos corriente en un día caluroso y sin viento.',
    formulaMathML: `<math xmlns="${MML}" display="block"><mi>I</mi><mo>=</mo><msqrt><mfrac><mrow><msub><mi>q</mi><mi>c</mi></msub><mo>+</mo><msub><mi>q</mi><mi>r</mi></msub><mo>−</mo><msub><mi>q</mi><mi>s</mi></msub></mrow><mrow><mi>R</mi><mo>(</mo><msub><mi>T</mi><mi>c</mi></msub><mo>)</mo></mrow></mfrac></msqrt></math>`,
    comoSeCalcula:
      '<b>q<sub>c</sub></b> es el calor evacuado por convección, que crece con el viento; <b>q<sub>r</sub></b> el evacuado por radiación; <b>q<sub>s</sub></b> el ganado del sol. <b>R(T<sub>c</sub>)</b> es la resistencia a la temperatura del conductor, que también sube con ella. Es el método de la norma IEEE Std 738.',
    queVigilar:
      'Con El Niño el ambiente sube y la ampacidad baja justo cuando la demanda sube. Es el momento en que una línea que siempre bastó deja de bastar.',
  },
  {
    id: 'terr',
    titulo: 'Distancia de seguridad al terreno',
    concepto:
      'La distancia vertical entre el punto más bajo del conductor y el terreno, en la condición más desfavorable: el conductor a su temperatura máxima, que es cuando más flecha tiene.',
    formulaMathML: `<math xmlns="${MML}" display="block"><mi>d</mi><mo>=</mo><mi>h</mi><mo>−</mo><msub><mi>f</mi><mi>máx</mi></msub><mo>≥</mo><msub><mi>d</mi><mtext>mín reglamentaria</mtext></msub></math>`,
    comoSeCalcula:
      '<b>h</b> es la altura del punto de sujeción sobre el terreno y <b>f<sub>máx</sub></b> la flecha a temperatura máxima. La distancia mínima la fija el RETIE según el nivel de tensión y el tipo de terreno bajo la línea — por eso las hipótesis de este sistema la declaran POR CATEGORÍA de terreno, nunca como un valor único.',
    queVigilar:
      'Es la verificación de seguridad más directa de una línea, y también la que más se degrada con el tiempo: la fluencia del aluminio aumenta la flecha con los años.',
  },
];

/** Marco normativo (líneas 1443-1452 del original, textual). */
export const MARCO_NORMATIVO: { norma: string; queRige: string; nota?: string }[] = [
  {
    norma: 'IEC 60826:2017 (Ed. 4.0)',
    queRige: 'Criterios de diseño de líneas aéreas de transmisión. Base probabilística de cargas climáticas, niveles de confiabilidad y coordinación de resistencias.',
  },
  {
    norma: 'RETIE (Colombia)',
    queRige: 'Reglamento colombiano de obligatorio cumplimiento: distancias de seguridad, señalización, puesta a tierra y requisitos de certificación.',
    nota: 'El módulo original citaba DOS resoluciones distintas para el RETIE en sitios distintos («Res. 40117 de 2024, modificada por Res. 40284 de 2026» en su marco normativo, y «Res. 90708 de 2013» en su informe de falla). La resolución vigente aplicable está PENDIENTE de verificación con fuente antes de usarse en una memoria de cálculo firmable.',
  },
  {
    norma: 'IEC 60071-1:2019 e IEC 60071-2:2023',
    queRige: 'Coordinación de aislamiento: define el BIL y las distancias en aire a partir de las sobretensiones esperadas.',
  },
  {
    norma: 'IEC TS 60815-1/-2/-3:2008',
    queRige: 'Selección y dimensionamiento de aisladores en ambiente contaminado. Sustenta la validación de distancia de fuga específica para el ambiente salino.',
  },
  {
    norma: 'IEEE Std 738-2023',
    queRige: 'Relación corriente-temperatura de conductores desnudos: de aquí sale la ampacidad real, no de una tabla genérica.',
  },
  {
    norma: 'IEEE Std 1243-1997',
    queRige: 'Mejora del desempeño frente a descargas atmosféricas: apantallamiento, resistencia de puesta a tierra y tasa de salidas.',
  },
  {
    norma: 'ASCE MOP 74 (3.ª ed., 2020)',
    queRige: 'Cargas estructurales en líneas de transmisión: viento, hielo, cargas longitudinales y de construcción.',
  },
  {
    norma: 'NESC — IEEE C2-2023',
    queRige: 'Código de seguridad estadounidense; útil como contraste de distancias de seguridad y criterios de cruce.',
  },
];

export const INTRO_FUNDAMENTOS =
  'Cada parámetro del cálculo, explicado con su concepto, su fórmula, cómo se calcula y el valor que toma hoy en esta línea — calculado por el núcleo verificado, con su procedencia.';
