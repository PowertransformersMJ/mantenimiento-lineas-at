// ============================================================================
// tests/rca.test.js — que el método no se pueda saltar
// ----------------------------------------------------------------------------
// Un análisis de causa raíz mal hecho NO se ve mal: se ve convincente. Ésa es
// toda su peligrosidad — manda cuadrillas al sitio equivocado y cierra
// expedientes que debían seguir abiertos. Estas pruebas no comprueban números:
// comprueban que las reglas del método SE IMPONGAN aunque quien investiga tenga
// prisa.
//
// La central es «LA TORMENTA QUE NO FUE»: el escenario donde los datos apuntan
// cómodamente a una causa equivocada. Si el motor deja pasar ese caso, el
// segmento entero no sirve, por bonito que se vea.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  revisarAcciones, resumenAcciones,
  ESPINAS, NIVEL_MINIMO_CAUSA_RAIZ,
  evaluarEspinas, fuerzaCadena, diagnosticoCadena, validarArbol,
  resumenBarreras, revisarHipotesis, condicionesCausaRaiz, auditarRespaldo,
  candidatosCausaRaiz, causasDeclaradas, avisoCausas,
} from '../nucleo/rca.js';

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('la tabla de descartes: el hueco tiene que verse', () => {
  test('devuelve SIEMPRE todas las espinas, incluso sin un solo dato', () => {
    const t = evaluarEspinas([]);
    // Eran once hasta el 2026-08-07; son dieciséis desde `99 §ADR-026`. Se lee de
    // ESPINAS a propósito: clavar el número aquí obliga a tocar la prueba cada
    // vez que la lista crece, y una prueba que se retoca a menudo deja de vigilar.
    assert.equal(t.length, ESPINAS.length);
    assert.deepEqual(t.map((e) => e.espina), [...ESPINAS]);
    assert.ok(t.every((e) => e.estado === 'no_evaluable'),
      'una espina que desaparece al faltar el dato se lee como «eso ya no aplica»');
  });

  test('conserva el ORDEN aunque las evaluaciones lleguen desordenadas', () => {
    const t = evaluarEspinas([
      { espina: 'operacion_maniobra', estado: 'abierta', motivo: 'x' },
      { espina: 'conductor', estado: 'abierta', motivo: 'y' },
    ]);
    assert.deepEqual(t.map((e) => e.espina), [...ESPINAS]);
  });

  test('DESCARTAR sin evidencia es un defecto: es el atajo que vacía un Ishikawa', () => {
    const [c] = evaluarEspinas([{ espina: 'conductor', estado: 'descartada', motivo: 'no parece' }]);
    assert.equal(c.defectos.length, 1);
    assert.match(c.defectos[0], /sin evidencia enlazada/);
  });

  test('SOSTENER sin evidencia también es defecto', () => {
    const [c] = evaluarEspinas([{ espina: 'conductor', estado: 'sostenida', motivo: 'seguro que fue esto' }]);
    assert.match(c.defectos[0], /sin evidencia enlazada/);
  });

  test('«no evaluable» sin decir qué dato falta es indistinguible de no haber mirado', () => {
    const [c] = evaluarEspinas([{ espina: 'conductor', estado: 'no_evaluable', motivo: 'nada' }]);
    assert.match(c.defectos[0], /qué dato falta/);
  });

  test('descartar CON evidencia es correcto y no deja defecto', () => {
    const [c] = evaluarEspinas([
      { espina: 'conductor', estado: 'descartada', motivo: 'los hilos no muestran fatiga', evidenciaIds: [ID(1)] },
    ]);
    assert.deepEqual(c.defectos, []);
  });
});

describe('los 5 porqués: parar en la física no es llegar a la causa', () => {
  const cadena = (...niveles) => ({
    id: ID(9), espina: 'conexiones_empalmes',
    eslabones: niveles.map((n, i) => ({ nivel: n, enunciado: `paso ${i}`, evidenciaIds: [ID(i + 1)] })),
  });

  test('una cadena que termina en el MECANISMO FÍSICO no es accionable', () => {
    const f = fuerzaCadena(cadena('efecto', 'modo_falla', 'mecanismo_fisico'));
    assert.equal(f.nivelAlcanzado, 'mecanismo_fisico');
    assert.equal(f.esAccionable, false, 'sobre la física no se puede actuar: eso no es causa raíz');
    assert.match(diagnosticoCadena(cadena('efecto', 'modo_falla', 'mecanismo_fisico')), /no se puede actuar/);
  });

  test('llegar a CONDICIÓN ya es accionable', () => {
    const f = fuerzaCadena(cadena('efecto', 'modo_falla', 'mecanismo_fisico', 'condicion'));
    assert.equal(f.esAccionable, true);
    assert.equal(NIVEL_MINIMO_CAUSA_RAIZ, 'condicion');
  });

  test('llegar a REGLA es el techo, y también accionable', () => {
    const f = fuerzaCadena(cadena('efecto', 'modo_falla', 'mecanismo_fisico', 'condicion', 'regla'));
    assert.equal(f.nivelAlcanzado, 'regla');
    assert.equal(f.esAccionable, true);
  });

  test('señala el eslabón MÁS DÉBIL, no solo que existe', () => {
    const c = {
      id: ID(9), espina: 'conductor',
      eslabones: [
        { nivel: 'efecto', enunciado: 'la línea se abrió', evidenciaIds: [ID(1)] },
        { nivel: 'modo_falla', enunciado: 'sin respaldo', evidenciaIds: [] },
        { nivel: 'condicion', enunciado: 'con respaldo', evidenciaIds: [ID(2)] },
      ],
    };
    const f = fuerzaCadena(c);
    assert.equal(f.sinEvidencia.length, 1);
    assert.equal(f.masDebil.enunciado, 'sin respaldo');
    assert.equal(f.esAccionable, true, 'llega a condición aunque un eslabón esté flojo');
  });

  test('una cadena CORTADA por falta de dato lo declara en vez de inventar el final', () => {
    const c = {
      id: ID(9), espina: 'operacion_maniobra',
      eslabones: [
        { nivel: 'efecto', enunciado: 'disparo', evidenciaIds: [ID(1)] },
        { nivel: 'modo_falla', enunciado: 'no consta la oscilografía', evidenciaIds: [], cortadaPorFaltaDeDato: 'el operador no entregó el registro' },
      ],
    };
    assert.equal(fuerzaCadena(c).cortada.motivo, 'el operador no entregó el registro');
    assert.match(diagnosticoCadena(c), /Cortada por falta de dato/);
  });
});

describe('LA TORMENTA QUE NO FUE — el caso que este sistema debe suspender', () => {
  // El escenario: falla nocturna, y el clima de IDEAM muestra viento fuerte y
  // lluvia esa noche. Es CÓMODO concluir «la tumbó el viento». Pero el viento
  // fuerte es frecuente en el Caribe y las líneas no se caen cada vez. Sin
  // evidencia física del mecanismo, esa hipótesis no puede subir de «baja».
  const climatica = {
    id: ID(1), espina: 'ambiente_clima',
    enunciado: 'El viento de esa noche derribó el conductor',
    verosimilitud: 'alta',
    sustento: 'IDEAM registró 14 m/s a las 02:10, la hora del disparo',
    queLaRefutaria: 'Que el conductor no muestre marcas de latigueo ni la grapa señales de arranque',
    evidenciaIds: [ID(50)],
    sustentoSoloClimatico: true,
  };

  test('una hipótesis con sustento SOLO climático queda topada en «baja»', () => {
    const [h] = revisarHipotesis([climatica]);
    assert.equal(h.verosimilitudEfectiva, 'baja', 'el clima es la correlación más tentadora del dominio');
    assert.equal(h.topadaPorClima, true);
    assert.match(h.defectos[0], /no prueba que lo causara/);
  });

  test('la misma hipótesis CON evidencia física deja de estar topada', () => {
    const [h] = revisarHipotesis([{ ...climatica, sustentoSoloClimatico: false }]);
    assert.equal(h.verosimilitudEfectiva, 'alta');
    assert.equal(h.topadaPorClima, false);
  });

  test('y con ella sola, la causa raíz NO se puede declarar', () => {
    const r = condicionesCausaRaiz({ hipotesis: [climatica] });
    assert.equal(r.puedeDeclararse, false);
    const c = r.condiciones.find((x) => x.clave === 'hipotesis_sostenida');
    assert.equal(c.cumple, false);
  });
});

describe('las hipótesis son hipótesis, no creencias', () => {
  test('sin declarar qué la refutaría, es defectuosa', () => {
    const [h] = revisarHipotesis([{
      id: ID(1), espina: 'conductor', enunciado: 'fue fatiga', verosimilitud: 'alta',
      sustento: 'me lo parece', queLaRefutaria: '', evidenciaIds: [ID(2)],
    }]);
    assert.match(h.defectos.join(' '), /no es una hipótesis, es una creencia/);
  });

  test('sin evidencia enlazada, defectuosa — salvo que esté descartada', () => {
    const [viva] = revisarHipotesis([{
      id: ID(1), espina: 'conductor', enunciado: 'x', verosimilitud: 'media',
      sustento: 's', queLaRefutaria: 'r', evidenciaIds: [],
    }]);
    assert.match(viva.defectos.join(' '), /Sin evidencia enlazada/);

    const [muerta] = revisarHipotesis([{
      id: ID(1), espina: 'conductor', enunciado: 'x', verosimilitud: 'descartada',
      sustento: 's', queLaRefutaria: 'r', evidenciaIds: [],
    }]);
    assert.equal(muerta.defectos.length, 0, 'una hipótesis ya descartada no necesita respaldo');
  });
});

describe('el árbol es un árbol, no un dibujo', () => {
  test('detecta el ciclo', () => {
    const v = validarArbol([
      { id: ID(1), enunciado: 'a', padreId: ID(2), tipoArista: 'necesaria', nivel: 'efecto', evidenciaIds: [ID(9)] },
      { id: ID(2), enunciado: 'b', padreId: ID(1), tipoArista: 'necesaria', nivel: 'condicion', evidenciaIds: [ID(9)] },
    ]);
    assert.equal(v.valido, false);
    assert.ok(v.problemas.some((p) => /ciclo/.test(p)));
  });

  test('detecta dos raíces: un evento tiene un solo efecto observado', () => {
    const v = validarArbol([
      { id: ID(1), enunciado: 'a', padreId: null, nivel: 'efecto', evidenciaIds: [] },
      { id: ID(2), enunciado: 'b', padreId: null, nivel: 'efecto', evidenciaIds: [] },
    ]);
    assert.ok(v.problemas.some((p) => /raíces/.test(p)));
  });

  test('exige declarar si la causa es necesaria, suficiente o contribuyente', () => {
    const v = validarArbol([
      { id: ID(1), enunciado: 'raíz', padreId: null, nivel: 'efecto', evidenciaIds: [] },
      { id: ID(2), enunciado: 'hijo', padreId: ID(1), nivel: 'condicion', evidenciaIds: [] },
    ]);
    assert.ok(v.problemas.some((p) => /necesaria, suficiente o contribuyente/.test(p)));
  });

  test('señala las ramas que mueren en la física, sin llamarlas error', () => {
    const v = validarArbol([
      { id: ID(1), enunciado: 'la línea se abrió', padreId: null, nivel: 'efecto', evidenciaIds: [ID(9)] },
      { id: ID(2), enunciado: 'corrosión', padreId: ID(1), tipoArista: 'necesaria', nivel: 'mecanismo_fisico', evidenciaIds: [ID(9)] },
    ]);
    assert.equal(v.valido, true, 'una rama a medias no invalida el árbol');
    assert.equal(v.hojasNoAccionables.length, 1);
    assert.equal(v.hojasNoAccionables[0].enunciado, 'corrosión');
  });
});

describe('las DIECISÉIS familias, y que las cinco nuevas son aditivas', () => {
  test('las once viejas siguen en su sitio y en su orden', () => {
    const viejas = [
      'conductor', 'conexiones_empalmes', 'aislamiento_herrajes', 'estructura_cimentacion',
      'tierra_apantallamiento', 'ambiente_clima', 'vegetacion_servidumbre', 'diseno_hipotesis',
      'montaje_tendido', 'operacion_maniobra', 'inspeccion_mantenimiento',
    ];
    assert.deepEqual(ESPINAS.slice(0, 11), viejas,
      'renombrar o mover una clave vieja rompería los expedientes ya escritos');
  });

  test('están las cinco nuevas, y PROTECCIÓN Y CONTROL la primera', () => {
    assert.equal(ESPINAS.length, 16);
    assert.deepEqual(ESPINAS.slice(11), [
      'proteccion_control', 'terceros_accidentales', 'acto_malicioso', 'fauna', 'fuego',
    ]);
  });

  test('las dieciséis se pintan SIEMPRE, incluso sin datos', () => {
    const t = evaluarEspinas([]);
    assert.equal(t.length, 16);
    assert.ok(t.every((e) => e.estado === 'no_evaluable'));
  });
});

describe('varias causas raíz, sin migrar lo ya escrito', () => {
  const CAUSA = (extra = {}) => ({
    nodoId: ID(4), enunciado: 'la especificación no exigía inhibidor',
    declaradaPor: ID(99), declaradaEn: '2026-08-07T10:00:00.000Z', condicionesNoCumplidas: [],
    ...extra,
  });

  test('la LISTA manda cuando trae algo', () => {
    const c = causasDeclaradas({
      causasRaiz: [CAUSA({ tipo: 'multiple' }), CAUSA({ tipo: 'contribuyente', enunciado: 'otra' })],
      causaRaiz: CAUSA({ enunciado: 'la vieja' }),
    });
    assert.equal(c.length, 2);
    assert.ok(c.every((x) => x.esLegado === false));
    assert.ok(!c.some((x) => x.enunciado === 'la vieja'));
  });

  test('un expediente VIEJO se lee, no se migra, y se marca como legado', () => {
    const c = causasDeclaradas({ causaRaiz: CAUSA() });
    assert.equal(c.length, 1);
    assert.equal(c[0].esLegado, true);
    assert.equal(c[0].tipo, 'unica', 'no se le inventa un tipo que su formulario no permitía');
  });

  test('sin causa declarada no hay causas: es el estado normal durante semanas', () => {
    assert.deepEqual(causasDeclaradas({}), []);
    assert.deepEqual(causasDeclaradas(), []);
  });

  test('AVISA cuando todas son contribuyentes: no se puede prometer que no vuelva', () => {
    const aviso = avisoCausas([CAUSA({ tipo: 'contribuyente' }), CAUSA({ tipo: 'contribuyente' })]);
    assert.match(aviso, /TODAS/);
    assert.match(aviso, /no puede afirmar que la falla no se repetirá/);
  });

  test('avisa también en la mezcla, y calla cuando ninguna es contribuyente', () => {
    assert.match(avisoCausas([CAUSA({ tipo: 'multiple' }), CAUSA({ tipo: 'contribuyente' })]), /1 de las 2/);
    assert.equal(avisoCausas([CAUSA({ tipo: 'multiple' })]), null);
    assert.equal(avisoCausas([]), null);
  });
});

describe('la SÉPTIMA condición: las hipótesis rivales no se dejan vivas y calladas', () => {
  const SOSTENIDA = {
    id: ID(1), enunciado: 'conector mal apretado', espina: 'conexiones_empalmes',
    verosimilitud: 'alta', sustento: 'termografía', queLaRefutaria: 'par de apriete correcto',
    evidenciaIds: [ID(9)],
  };
  const RIVAL = (extra = {}) => ({
    id: ID(2), enunciado: 'contorneo por contaminación', espina: 'aislamiento_herrajes',
    verosimilitud: 'media', sustento: 'salinidad alta', queLaRefutaria: 'aisladores limpios',
    evidenciaIds: [ID(9)], ...extra,
  });
  const cond = (hipotesis) => condicionesCausaRaiz({ hipotesis })
    .condiciones.find((c) => c.clave === 'rivales_cerradas');

  test('una rival viva y sin probar BLOQUEA, y dice cuál', () => {
    const c = cond([SOSTENIDA, RIVAL()]);
    assert.equal(c.cumple, false);
    assert.match(c.detalle, /contorneo por contaminación/);
  });

  test('se cierra diciendo qué se hizo y cómo quedó', () => {
    const c = cond([SOSTENIDA, RIVAL({ queSeHizo: 'se lavaron y se midió corriente de fuga', resultado: 'refutada' })]);
    assert.equal(c.cumple, true);
  });

  test('«no concluyente» CUENTA: no se obliga a fabricar un veredicto', () => {
    const c = cond([SOSTENIDA, RIVAL({ queSeHizo: 'se pidió la muestra y no llegó', resultado: 'no_concluyente' })]);
    assert.equal(c.cumple, true, 'obligar a concluir fabricaría la certeza que el método impide');
  });

  test('un resultado SIN decir qué se hizo no cierra nada', () => {
    assert.equal(cond([SOSTENIDA, RIVAL({ resultado: 'refutada' })]).cumple, false);
    assert.equal(cond([SOSTENIDA, RIVAL({ queSeHizo: '   ', resultado: 'refutada' })]).cumple, false);
  });

  test('una rival ya DESCARTADA no es rival', () => {
    assert.equal(cond([SOSTENIDA, RIVAL({ verosimilitud: 'descartada' })]).cumple, true);
  });

  test('LA TRAMPA: la topada por clima no queda atrapada para siempre', () => {
    // El tope climático la baja a «baja» pase lo que pase. Si la séptima
    // condición exigiera un veredicto, ese expediente no se podría cerrar nunca.
    const topada = RIVAL({
      verosimilitud: 'alta', sustentoSoloClimatico: true,
      queSeHizo: 'se buscó daño mecánico en el vano y no apareció', resultado: 'no_concluyente',
    });
    const c = cond([SOSTENIDA, topada]);
    assert.equal(c.cumple, true);
  });

  test('ahora son SIETE condiciones, no seis', () => {
    const r = condicionesCausaRaiz({});
    assert.equal(r.total, 7);
  });
});

describe('qué nodo puede ser declarado causa raíz', () => {
  // El árbol del caso real: la línea se abrió porque el conector se corroyó.
  // «Corrosión» es mecanismo físico, y el método dice que eso NO es causa raíz.
  const ARBOL = [
    { id: ID(1), enunciado: 'la línea se abrió', padreId: null, nivel: 'efecto', evidenciaIds: [ID(9)] },
    { id: ID(2), enunciado: 'el conector perdió continuidad', padreId: ID(1), tipoArista: 'necesaria', nivel: 'modo_falla', evidenciaIds: [ID(9)] },
    { id: ID(3), enunciado: 'corrosión galvánica', padreId: ID(2), tipoArista: 'necesaria', nivel: 'mecanismo_fisico', evidenciaIds: [ID(9)] },
    { id: ID(4), enunciado: 'herraje fuera de su función', padreId: ID(3), tipoArista: 'necesaria', nivel: 'condicion', evidenciaIds: [ID(9)] },
    { id: ID(5), enunciado: 'la especificación no exigía inhibidor', padreId: ID(4), tipoArista: 'necesaria', nivel: 'regla', evidenciaIds: [] },
  ];

  test('el efecto, el modo y el mecanismo NO pueden ser causa raíz', () => {
    const { candidatos } = candidatosCausaRaiz(ARBOL);
    const porNivel = Object.fromEntries(candidatos.map((c) => [c.nivel, c]));

    assert.equal(porNivel.efecto.puedeSerCausaRaiz, false);
    assert.equal(porNivel.modo_falla.puedeSerCausaRaiz, false);
    assert.equal(porNivel.mecanismo_fisico.puedeSerCausaRaiz, false);
    assert.match(porNivel.mecanismo_fisico.motivo, /física, no gestión/);
  });

  test('la condición y la regla sí, que es donde se puede actuar', () => {
    const { candidatos, declarables } = candidatosCausaRaiz(ARBOL);
    const porNivel = Object.fromEntries(candidatos.map((c) => [c.nivel, c]));

    assert.equal(porNivel.condicion.puedeSerCausaRaiz, true);
    assert.equal(porNivel.regla.puedeSerCausaRaiz, true);
    assert.equal(porNivel.condicion.motivo, null);
    assert.equal(declarables, 2);
  });

  test('NO esconde los nodos que no califican: los devuelve marcados', () => {
    const { candidatos } = candidatosCausaRaiz(ARBOL);
    assert.equal(candidatos.length, ARBOL.length,
      'un nodo que desaparece de la pantalla se lee como que no existe');
  });

  test('señala la falta de evidencia, pero NO bloquea por ella', () => {
    const { candidatos } = candidatosCausaRaiz(ARBOL);
    const regla = candidatos.find((c) => c.nivel === 'regla');
    assert.equal(regla.sinEvidencia, true);
    assert.equal(regla.puedeSerCausaRaiz, true,
      'bloquear por evidencia sería inventar una séptima condición de cierre');
  });

  test('EL ESTADO CERO: árbol entero en la física y ni un candidato', () => {
    const r = candidatosCausaRaiz(ARBOL.slice(0, 3));
    assert.equal(r.declarables, 0);
    assert.match(r.aviso, /Ningún nodo del árbol puede sostener una causa raíz/);
  });

  test('sin árbol no hay aviso: no hay nada de qué avisar', () => {
    const r = candidatosCausaRaiz([]);
    assert.equal(r.declarables, 0);
    assert.equal(r.aviso, null);
  });
});

describe('las barreras: la pregunta que suele valer más que la causa', () => {
  test('avisa cuando el evento atravesó más de una defensa', () => {
    const r = resumenBarreras([
      { id: ID(1), enunciado: 'a', padreId: null, nivel: 'efecto', barrera: { cual: 'inspeccion_visual', estado: 'no_aplicada', detalle: 'no se recorrió' } },
      { id: ID(2), enunciado: 'b', padreId: ID(1), nivel: 'condicion', barrera: { cual: 'termografia', estado: 'ausente', detalle: 'nunca se hizo' } },
    ]);
    assert.equal(r.fallaron, 2);
    assert.match(r.aviso, /deja las otras 1 abiertas/);
  });

  test('una barrera que FUNCIONÓ no cuenta como fallo', () => {
    const r = resumenBarreras([
      { id: ID(1), enunciado: 'a', padreId: null, nivel: 'efecto', barrera: { cual: 'proteccion_electrica', estado: 'funciono', detalle: 'despejó en 80 ms' } },
    ]);
    assert.equal(r.fallaron, 0);
    assert.equal(r.aviso, null);
  });
});

describe('declarar una causa raíz cuesta, y así debe ser', () => {
  test('un análisis vacío NO puede declararla', () => {
    const r = condicionesCausaRaiz({});
    assert.equal(r.puedeDeclararse, false);
    assert.equal(r.total, 7, 'la séptima entró con `99 §ADR-026`: cerrar las hipótesis rivales');
  });

  test('cada condición que falla dice POR QUÉ, no solo que falla', () => {
    const r = condicionesCausaRaiz({});
    const fallidas = r.condiciones.filter((c) => !c.cumple);
    assert.ok(fallidas.length > 0);
    assert.ok(fallidas.every((c) => c.texto && c.texto.length > 10),
      'un ingeniero necesita leer qué le falta, no ver un semáforo');
  });

  test('el motor NUNCA marca la causa: solo dice si se puede', () => {
    const r = condicionesCausaRaiz({});
    assert.equal('causaRaiz' in r, false, 'marcar es de la persona que firma');
  });
});

describe('auditoría de respaldo: distinguir un análisis de una narración', () => {
  test('cuenta las afirmaciones que no se apoyan en nada', () => {
    const a = auditarRespaldo({
      espinas: [{ espina: 'conductor', estado: 'sostenida', motivo: 'm', evidenciaIds: [] }],
      cadenas: [{ id: ID(1), espina: 'conductor', eslabones: [{ nivel: 'efecto', enunciado: 'e', evidenciaIds: [] }] }],
      arbol: [{ id: ID(2), enunciado: 'n', padreId: null, nivel: 'efecto', evidenciaIds: [] }],
      hipotesis: [{ id: ID(3), espina: 'conductor', enunciado: 'h', verosimilitud: 'media', sustento: 's', queLaRefutaria: 'r', evidenciaIds: [] }],
    });
    assert.equal(a.sinRespaldo, 4);
    assert.match(a.aviso, /Más de la mitad/);
  });

  test('un eslabón declarado como cortado NO cuenta como falta de respaldo', () => {
    const a = auditarRespaldo({
      cadenas: [{ id: ID(1), espina: 'conductor', eslabones: [
        { nivel: 'efecto', enunciado: 'e', evidenciaIds: [], cortadaPorFaltaDeDato: 'no consta' },
      ] }],
    });
    assert.equal(a.sinRespaldo, 0, 'declarar el hueco es lo correcto; no es una afirmación sin respaldo');
  });
});

describe('las acciones CAPA: un plan que nadie puede comprobar es una lista de deseos', () => {
  const base = { id: 'a1', clase: 'correctiva', que: 'cambiar el conector', estado: 'propuesta' };

  test('propuesta sin barrera es VÁLIDA: un deseo puede existir sin defensa asignada', () => {
    // Obligar la barrera al guardar empujaría a elegir una al azar con tal de
    // poder guardar — el atajo que vació el Ishikawa y por el que se eliminó
    // «no aplica». El campo mentiría, que es peor que estar vacío.
    const [a] = revisarAcciones([base]);
    assert.deepEqual(a.defectos, []);
    assert.equal(a.pruebaEs, null);
  });

  test('CERRAR SIN PRUEBA se marca: parece trabajo hecho y no se puede demostrar', () => {
    const [a] = revisarAcciones([{ ...base, estado: 'cerrada', barrera: 'termografia',
      cerradaPor: 'uid', cerradaEn: '2026-08-05T10:00:00.000Z' }]);
    assert.equal(a.pruebaEs, null);
    assert.ok(a.defectos.some((d) => /sin ninguna prueba de que se hizo/i.test(d)));
  });

  test('cerrar sin QUIÉN y sin CUÁNDO es una casilla marcada', () => {
    const [a] = revisarAcciones([{ ...base, estado: 'cerrada', barrera: 'termografia',
      comoSeComprobo: 'acta 118' }]);
    assert.ok(a.defectos.some((d) => /QUIÉN/.test(d)));
    assert.ok(a.defectos.some((d) => /CUÁNDO/.test(d)));
  });

  test('las DOS pruebas valen, y NO se igualan: el informe tiene que poder distinguirlas', () => {
    const cerrada = { ...base, estado: 'cerrada', barrera: 'termografia',
      cerradaPor: 'uid', cerradaEn: '2026-08-05T10:00:00.000Z' };

    const [conFoto] = revisarAcciones([{ ...cerrada, evidenciaIds: ['e1'] }]);
    assert.equal(conFoto.pruebaEs, 'evidencia');
    assert.deepEqual(conFoto.defectos, []);

    const [conNota] = revisarAcciones([{ ...cerrada, comoSeComprobo: 'orden de trabajo 4471' }]);
    assert.equal(conNota.pruebaEs, 'escrita');
    assert.deepEqual(conNota.defectos, [], 'un análisis sin investigación en alcance no podría cerrar nunca');
  });

  test('una CORRECTIVA cerrada tiene que decir qué barrera queda cubierta', () => {
    const [a] = revisarAcciones([{ ...base, estado: 'cerrada', cerradaPor: 'uid',
      cerradaEn: '2026-08-05T10:00:00.000Z', evidenciaIds: ['e1'] }]);
    assert.ok(a.defectos.some((d) => /qué barrera queda cubierta/.test(d)));

    // La preventiva no lo exige: puede endurecer una regla general.
    const [p] = revisarAcciones([{ ...base, clase: 'preventiva', estado: 'cerrada', cerradaPor: 'uid',
      cerradaEn: '2026-08-05T10:00:00.000Z', evidenciaIds: ['e1'] }]);
    assert.deepEqual(p.defectos, []);
  });

  test('descartar sin motivo es hacerla desaparecer', () => {
    const [a] = revisarAcciones([{ ...base, estado: 'descartada' }]);
    assert.ok(a.defectos.some((d) => /hacerla desaparecer/.test(d)));
    const [b] = revisarAcciones([{ ...base, estado: 'descartada', motivoDescarte: 'la línea se repotencia en 2027' }]);
    assert.deepEqual(b.defectos, []);
  });

  test('EL HUECO QUE MÁS IMPORTA: una barrera que falló y que nadie cubre', () => {
    // El resultado más incómodo de un RCA bien hecho. Una lista larga de
    // acciones puede tapar perfectamente que la barrera principal sigue abierta.
    const arbol = [
      { id: 'n1', barrera: { cual: 'termografia', estado: 'no_aplicada', detalle: 'no se hizo' } },
      { id: 'n2', barrera: { cual: 'poda_servidumbre', estado: 'inefectiva', detalle: 'poda parcial' } },
      { id: 'n3', barrera: { cual: 'proteccion_electrica', estado: 'funciono', detalle: 'despejó' } },
    ];
    const r = resumenAcciones([{ ...base, barrera: 'termografia' }], arbol);

    assert.deepEqual(r.barrerasSinAccion, ['poda_servidumbre']);
    assert.ok(!r.barrerasSinAccion.includes('proteccion_electrica'), 'una barrera que FUNCIONÓ no pide acción');
  });

  test('una acción DESCARTADA no cubre ninguna barrera', () => {
    const arbol = [{ id: 'n1', barrera: { cual: 'termografia', estado: 'ausente', detalle: '—' } }];
    const r = resumenAcciones(
      [{ ...base, barrera: 'termografia', estado: 'descartada', motivoDescarte: 'no procede' }], arbol);
    assert.deepEqual(r.barrerasSinAccion, ['termografia'], 'una acción descartada tapó un hueco real');
  });

  test('el resumen cuenta las cerradas que solo tienen una nota escrita', () => {
    const r = resumenAcciones([
      { ...base, estado: 'cerrada', barrera: 'termografia', cerradaPor: 'u', cerradaEn: '2026-08-05T10:00:00.000Z', comoSeComprobo: 'acta' },
      { ...base, id: 'a2', estado: 'cerrada', barrera: 'recierre', cerradaPor: 'u', cerradaEn: '2026-08-05T10:00:00.000Z', evidenciaIds: ['e1'] },
    ], []);
    assert.equal(r.cerradasSoloConNota, 1);
    assert.equal(r.porEstado.cerrada, 2);
    assert.equal(r.conDefectos, 0);
  });

  test('NO se ordenan ni se puntúan: salen en el orden en que se crearon', () => {
    // Ordenar es dictaminar (ADR-020). La que va primero se lee como la más
    // importante, y eso lo decide quien firma.
    const dadas = [
      { ...base, id: 'x', que: 'tercera' },
      { ...base, id: 'y', que: 'primera', estado: 'cerrada' },
      { ...base, id: 'z', que: 'segunda' },
    ];
    assert.deepEqual(revisarAcciones(dadas).map((a) => a.id), ['x', 'y', 'z']);
  });
});
