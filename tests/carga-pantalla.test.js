// ============================================================================
// tests/carga-pantalla.test.js — la pantalla que CREA activos
// ----------------------------------------------------------------------------
// POR QUÉ ESTA PRUEBA EXISTE. `Cargar.tsx` es la única pantalla del sistema cuyo
// efecto no se puede deshacer: las reglas de la base niegan borrar un apoyo. Y
// hasta que se construyó, las ~800 líneas de `importar/` y de
// `vistas/puntosNuevos.ts` no las llamaba nadie — código probado, verde y
// muerto. Una pieza que nadie invoca es exactamente lo que las pruebas de
// unidad no pueden detectar.
//
// QUÉ SE COMPRUEBA, y en dos capas distintas:
//
//   1. LA VISTA, ejecutándola de verdad (`vistas/puntosNuevos.ts`). Es donde
//      vive todo lo que la pantalla necesita saber, y es TypeScript sin React,
//      así que se puede correr aquí tal cual.
//   2. LA PANTALLA, por TEXTO. No se puede ejecutar `.tsx` desde `node --test`
//      sin montar un navegador entero. Lo que sí se puede comprobar —y es lo
//      que de verdad se cae— es que la pantalla esté ENCHUFADA, que no tenga
//      fórmulas dentro y que no le enseñe al Ingeniero el vocabulario de la
//      máquina. Es el mismo patrón que `cerrojo-revision.test.js` usa sobre
//      `firestore.ts`.
//
// ⚠️ MUNDO SINTÉTICO: línea LX-001, coordenadas inventadas sobre un meridiano
// que no es el de nadie.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  AL_FINAL, actaDeLaCarga, cifrasDeLaCarga, consecuenciaDeFuncion, CONSECUENCIA_TIPO,
  decisionDeLaFicha, faltantesDe, fichaEnBlanco, nombresParaLaFicha, posicionesPosibles,
  rotuloDelSitio, textoCota, textoDistancia,
} from '../web/src/vistas/puntosNuevos.ts';
import { planDeCarga } from '../importar/plan.js';
import { idEstable, ORG_POR_DEFECTO } from '../herramientas/identidad.mjs';
import { FuncionEstructural, TipoPunto } from '../contratos/src/activos.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => readFileSync(join(RAIZ, p), 'utf-8');

const PANTALLA = leer('web/src/componentes/Cargar.tsx');
const LINEA_TSX = leer('web/src/componentes/Linea.tsx');

// ── El mundo inventado ──────────────────────────────────────────────────────

const LINEA = 'LX-001';
const LINEA_ID = idEstable(ORG_POR_DEFECTO, LINEA, 'linea');
const NOMBRES = ['LX-001 A01', 'LX-001 A02', 'LX-001 A03', 'LX-001 N1', 'LX-001 N2'];
const REGISTRO = {
  [LINEA]: Object.fromEntries(NOMBRES.map((n) => [n, {
    semilla: `punto:${n}`, id: idEstable(ORG_POR_DEFECTO, LINEA, `punto:${n}`),
  }])),
};

const apoyo = (nombre, orden, lat) => ({
  id: REGISTRO[LINEA][nombre].id,
  orgId: ORG_POR_DEFECTO,
  creadoEn: '2026-01-01T00:00:00.000Z',
  creadoPor: 'uid-de-prueba',
  revision: 0,
  tipo: 'apoyo',
  lineaId: LINEA_ID,
  orden,
  tipoPunto: 'Estructura',
  nombreCampo: nombre,
  nombreNormalizado: nombre,
  coordenada: { lat, lon: -70, sistemaReferencia: 'WGS84', metodo: 'gps_mano', precision_m: 8 },
  funcionEstructural: orden === 0 ? 'Terminal' : 'Suspensión',
  funcionProcedencia: 'confirmado_humano',
  deflexion_grados: null,
  condicion: 'Sin evaluar',
  activo: true,
});

const BASE = [
  apoyo('LX-001 A01', 0, 5.0000),
  apoyo('LX-001 A02', 1, 5.0010),
  apoyo('LX-001 A03', 2, 5.0020),
];

/** El punto tal como sale del archivo del aparato, con la cota que no trajo. */
const DEL_APARATO = { nombreCampo: 'MARCA 07', lat: 5.0015, lon: -70 };

// ════════════════════════════════════════════════════════════════════════════
describe('LA FICHA ARRANCA VACÍA — nada preseleccionado, tampoco la aprobación', () => {

  test('las cinco respuestas empiezan sin contestar', () => {
    // Un campo prerrellenado sobre un acto que no se puede deshacer es un ancla:
    // quien ve una opción puesta la confirma en vez de decidirla.
    const f = fichaEnBlanco('jornada.gpx', 'k1', DEL_APARATO);
    assert.equal(f.nombreCanonico, '');
    assert.equal(f.tipoPunto, '');
    assert.equal(f.sitio, '');
    assert.equal(f.funcionEstructural, '');
    assert.equal(f.aprobado, false, 'la casilla de aprobación NO puede empezar marcada');
    assert.equal(f.funcionConfirmada, false, 'ni la firma del papel estructural');
  });

  test('lo que el aparato no grabó NO se convierte en una clave vacía ni en un cero', () => {
    const f = fichaEnBlanco('jornada.gpx', 'k1', DEL_APARATO);
    assert.equal('ele' in f, false, 'un cero se leería como nivel del mar y acabaría en un cálculo');
    assert.equal('utc' in f, false);
    assert.match(textoCota(f.ele), /el GPS no la grabó/);
  });

  test('y sí viaja lo que el aparato SÍ grabó', () => {
    const f = fichaEnBlanco('jornada.gpx', 'k1', { ...DEL_APARATO, ele: 41.2, utc: '2026-08-17T14:03:00Z' });
    assert.equal(f.ele, 41.2);
    assert.equal(f.utc, '2026-08-17T14:03:00Z');
    assert.match(textoCota(f.ele), /41,2 m/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('EL BOTÓN DICE QUÉ FALTA, Y DE CUÁL PUNTO', () => {

  const aprobadaSinNada = () => ({ ...fichaEnBlanco('j.gpx', 'k1', DEL_APARATO), aprobado: true });

  test('una ficha aprobada y vacía enumera las CUATRO preguntas sin contestar', () => {
    // Con el texto de la pregunta, no con el nombre de un campo: «falta
    // contestar “dónde va”» se entiende; «falta `sitio`» manda a buscar a
    // alguien que sepa de programación.
    const faltan = faltantesDe(aprobadaSinNada());
    assert.deepEqual(faltan, [
      'cuál de sus puntos aprobados es', 'qué es', 'dónde va', 'qué papel estructural cumple',
    ]);
  });

  test('cada respuesta retira exactamente una falta', () => {
    let f = aprobadaSinNada();
    assert.equal(faltantesDe(f).length, 4);
    f = { ...f, nombreCanonico: 'LX-001 N1' };
    assert.equal(faltantesDe(f).length, 3);
    f = { ...f, tipoPunto: 'Estructura' };
    assert.equal(faltantesDe(f).length, 2);
    f = { ...f, sitio: 'LX-001 A02' };
    assert.equal(faltantesDe(f).length, 1);
    f = { ...f, funcionEstructural: 'Suspensión' };
    assert.deepEqual(faltantesDe(f), []);
  });

  test('una ficha que él dejó PENDIENTE no tiene faltas: es una respuesta completa', () => {
    // Dejar un punto pendiente es una decisión, no un formulario a medias.
    assert.deepEqual(faltantesDe(fichaEnBlanco('j.gpx', 'k1', DEL_APARATO)), []);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('EL SISTEMA NO ELIGE EL VANO: enseña distancias crudas y ya', () => {

  test('los sitios salen en el RECORRIDO de la línea, nunca clasificados por cercanía', () => {
    // Clasificar por distancia es un dictamen disfrazado de lista: el primero de
    // una lista se lee como el bueno, y el aparato declara ±8 m.
    const sitios = posicionesPosibles(BASE, 5.0015, -70);
    assert.deepEqual(sitios.map((s) => s.valor), ['LX-001 A01', 'LX-001 A02', AL_FINAL]);
    // El más cercano NO es el primero de la lista: si alguien ordenara por
    // cercanía, esta comprobación se rompería.
    const masCerca = [...sitios].sort((a, b) => a.distanciaAtras_m - b.distanciaAtras_m)[0];
    assert.notEqual(masCerca.valor, sitios[0].valor);
  });

  test('cada sitio trae la distancia a los DOS vecinos, sin interpretar', () => {
    const [primero] = posicionesPosibles(BASE, 5.0015, -70);
    assert.ok(Number.isFinite(primero.distanciaAtras_m));
    assert.ok(Number.isFinite(primero.distanciaAdelante_m));
    assert.match(textoDistancia(primero.distanciaAtras_m), /^\d+,\d m$/);
    assert.equal(textoDistancia(null), 'sin medir');
  });

  test('el hueco de ANTES del primer punto no se ofrece siquiera', () => {
    // Ofrecerlo para después negarlo sería peor que no ofrecerlo: hoy no existe
    // camino para colocar un punto ahí sin mover todo lo que ya está cargado.
    const sitios = posicionesPosibles(BASE, 4.9990, -70);
    assert.ok(!sitios.some((s) => /antes de/.test(s.rotulo)));
    assert.equal(sitios[0].valor, 'LX-001 A01');
  });

  test('el rótulo del sitio elegido se lee en castellano, sin vocabulario de máquina', () => {
    const sitios = posicionesPosibles(BASE, 5.0015, -70);
    assert.match(rotuloDelSitio(sitios, 'LX-001 A02'), /^detrás de /);
    assert.match(rotuloDelSitio(sitios, AL_FINAL), /^al final de la línea/);
    assert.equal(rotuloDelSitio(sitios, ''), 'sin sitio declarado');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('LAS CONSECUENCIAS SALEN DEL MOLDE, NO DE UNA LISTA ESCRITA A MANO', () => {

  test('cada tipo de punto del molde tiene su consecuencia escrita', () => {
    for (const t of TipoPunto.options) {
      assert.ok(CONSECUENCIA_TIPO[t], `«${t}» está en el molde y la pantalla no sabe qué decir de él`);
    }
    assert.match(CONSECUENCIA_TIPO['Empalme'], /no cuenta como vano/);
  });

  test('las seis funciones del molde tienen consecuencia, y las que ANCLAN lo dicen', () => {
    assert.equal(FuncionEstructural.options.length, 6, 'el molde admite seis papeles estructurales');
    for (const f of FuncionEstructural.options) {
      assert.match(consecuenciaDeFuncion(f), /tramo de tensión/);
    }
    assert.match(consecuenciaDeFuncion('Terminal'), /se CORTA el tramo/);
    assert.match(consecuenciaDeFuncion('Suspensión'), /sigue de largo/);
  });

  test('«Derivación» —la sexta, la que al sembrador le falta— se admite aquí', () => {
    assert.ok(FuncionEstructural.options.includes('Derivación'));
    assert.match(consecuenciaDeFuncion('Derivación'), /se CORTA el tramo/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('DOS FICHAS NO PUEDEN PELEARSE POR EL MISMO NOMBRE', () => {

  test('el nombre que ya eligió otra ficha desaparece del desplegable', () => {
    // `@lineas/importar` lo detendría igual, pero lo detendría al final. Aquí no
    // llega ni a poder elegirse.
    const a = { ...fichaEnBlanco('j.gpx', 'k1', DEL_APARATO), nombreCanonico: 'LX-001 N1' };
    const b = fichaEnBlanco('j.gpx', 'k2', DEL_APARATO);
    const libres = nombresParaLaFicha(['LX-001 N1', 'LX-001 N2'], [a, b], 'k2');
    assert.deepEqual(libres, ['LX-001 N2']);
  });

  test('pero la ficha sigue viendo el nombre que ella misma eligió', () => {
    const a = { ...fichaEnBlanco('j.gpx', 'k1', DEL_APARATO), nombreCanonico: 'LX-001 N1' };
    assert.deepEqual(nombresParaLaFicha(['LX-001 N1', 'LX-001 N2'], [a], 'k1'),
      ['LX-001 N1', 'LX-001 N2'], 'si desapareciera, el desplegable se quedaría en blanco solo');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('DE LA FICHA AL PLAN — el recorrido entero, sin React', () => {

  /** Una ficha del todo contestada, como la deja el Ingeniero. */
  const contestada = (extra = {}) => ({
    ...fichaEnBlanco('jornada.gpx', 'k1', DEL_APARATO),
    nombreCanonico: 'LX-001 N1',
    tipoPunto: 'Empalme',
    sitio: 'LX-001 A02',
    funcionEstructural: 'Suspensión',
    aprobado: true,
    porQue: 'se ve desde el vano siguiente',
    ...extra,
  });

  const OPC = {
    codigoLinea: LINEA, creadoPor: 'uid-del-ingeniero', registro: REGISTRO,
    ahora: '2026-08-17T12:00:00.000Z',
  };

  test('la ficha se traduce a lo que el paquete espera, sin claves fantasma', () => {
    const d = decisionDeLaFicha(contestada());
    assert.equal(d.estado, 'aprobado');
    assert.equal(d.insertarDespuesDe, 'LX-001 A02');
    assert.equal('insertarAlFinal' in d, false);
    // Otra vez: lo que el aparato no grabó no viaja como clave vacía.
    assert.equal('ele' in d, false);
    assert.equal('utc' in d, false);
  });

  test('«al final de la línea» se traduce a lo suyo, y no a un nombre inventado', () => {
    const d = decisionDeLaFicha(contestada({ sitio: AL_FINAL }));
    assert.equal(d.insertarAlFinal, true);
    assert.equal('insertarDespuesDe' in d, false);
  });

  test('una ficha PENDIENTE llega al plan como ignorada, con su motivo entero', () => {
    const f = contestada({ aprobado: false, motivoPendiente: 'pendiente de verificar' });
    const plan = planDeCarga(BASE, [decisionDeLaFicha(f)], OPC);
    assert.equal(plan.documentos.length, 0);
    assert.equal(plan.ignorados.length, 1);
    assert.equal(plan.ignorados[0].motivo, 'pendiente de verificar');
  });

  test('una ficha completa produce UN documento y ni uno de los que ya estaban', () => {
    const yaEscritos = new Set(BASE.map((a) => a.id));
    const plan = planDeCarga(BASE, [decisionDeLaFicha(contestada())], OPC);
    assert.equal(plan.documentos.length, 1);
    assert.ok(!yaEscritos.has(plan.documentos[0].id), 'pisaría un documento ya escrito');
    assert.equal(plan.documentos[0].funcionProcedencia, 'supuesto',
      'sin firma explícita el papel queda SUPUESTO');
  });

  test('el antes/después se lee en cifras, y lo que NO se mueve también se declara', () => {
    const plan = planDeCarga(BASE, [decisionDeLaFicha(contestada())], OPC);
    const cifras = cifrasDeLaCarga(plan.antes, plan.despues);
    const porRotulo = Object.fromEntries(cifras.map((c) => [c.rotulo, c]));

    assert.equal(porRotulo['Puntos de la línea'].antes, '3');
    assert.equal(porRotulo['Puntos de la línea'].despues, '4');
    assert.equal(porRotulo['Puntos de la línea'].cambia, true);
    // Un empalme no es un apoyo: ni abre vano ni mueve el promedio.
    assert.equal(porRotulo['Empalmes (no son apoyos)'].cambia, true);
    assert.equal(porRotulo['Estructuras (las que sostienen)'].cambia, false);
    assert.equal(porRotulo['Vano promedio'].cambia, false,
      'lo que no se mueve se declara: si no, no se sabe si nadie lo miró');
    // Ni una cifra sale como texto de máquina.
    for (const c of cifras) {
      assert.equal(typeof c.antes, 'string');
      assert.doesNotMatch(c.antes, /undefined|NaN|\[object/);
      assert.doesNotMatch(c.despues, /undefined|NaN|\[object/);
    }
  });

  test('EL ACTA solo declara cargado lo que la base confirmó escrito', () => {
    // Un acta que liste lo que se INTENTÓ cargar es un papel que dice que un
    // punto existe cuando no existe — y es el papel el que se archiva.
    const f = contestada();
    const plan = planDeCarga(BASE, [decisionDeLaFicha(f)], OPC);
    const acta = actaDeLaCarga({
      linea: { codigo: LINEA, nombre: 'Línea de prueba', tensionNominal_kV: 110 },
      quien: { correo: 'quien@ejemplo.test', organizacion: ORG_POR_DEFECTO, rol: 'admin' },
      cuando: '2026-08-17T12:00:00.000Z',
      archivos: [{ nombre: 'jornada.gpx', creator: 'aparato de prueba', puntos: 1 }],
      fichas: [f],
      ignorados: plan.ignorados,
      bloqueados: plan.bloqueados,
      // La base dice que NO se escribió: el acta no puede decir que sí.
      resultado: { escritos: [], yaEstaban: [], rechazados: [] },
      cifras: cifrasDeLaCarga(plan.antes, plan.despues),
    });
    assert.deepEqual(acta.cargados, []);

    const conEscritura = actaDeLaCarga({
      linea: { codigo: LINEA }, quien: { correo: null, organizacion: ORG_POR_DEFECTO, rol: 'admin' },
      cuando: '2026-08-17T12:00:00.000Z', archivos: [], fichas: [f],
      ignorados: [], bloqueados: [],
      resultado: { escritos: ['LX-001 N1'], yaEstaban: [], rechazados: [] },
      cifras: [],
    });
    assert.equal(conEscritura.cargados.length, 1);
    assert.equal(conEscritura.cargados[0].porQue, 'se ve desde el vano siguiente',
      'el razonamiento no cabe en el molde de los datos: si no está en el acta, no está en ningún sitio');
    assert.equal('cotaTerreno_m' in conEscritura.cargados[0], false, 'ni aquí se inventa la cota');
    // Ni el acta enseña un identificador interno.
    assert.equal('id' in conEscritura.cargados[0], false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA PANTALLA, POR TEXTO. Lo que de verdad se cae no es una fórmula: es que la
// pantalla no exista, no esté enchufada, o le hable al Ingeniero en el idioma
// de la máquina.
// ════════════════════════════════════════════════════════════════════════════
describe('LA PANTALLA ESTÁ ENCHUFADA — el motor no puede quedarse sin quien lo llame', () => {

  test('`Linea.tsx` la importa, la pinta y le pasa la sesión', () => {
    assert.match(LINEA_TSX, /import \{ Cargar \} from '\.\/Cargar'/);
    assert.match(LINEA_TSX, /activa === 'cargar'/, 'la pestaña existe pero no pinta nada');
    assert.match(LINEA_TSX, /<Cargar[\s\S]{0,200}sesion=\{/, 'sin la sesión no se puede sellar el autor');
  });

  test('la pestaña SOLO se ofrece a quien tiene permiso de administración', () => {
    assert.match(LINEA_TSX, /id: 'cargar'[^}]*soloAdmin: true/);
    assert.match(LINEA_TSX, /useSesion\(\)/, 'el permiso hay que leerlo de la sesión, no suponerlo');
    // Y la lista que se pinta es la FILTRADA, no la completa: si se pintara
    // `PESTANAS`, el filtro existiría y no haría nada.
    assert.match(LINEA_TSX, /\{visibles\.map\(\(p\) =>/);
  });

  test('la pantalla llama al paquete puro, no a una copia suya', () => {
    assert.match(PANTALLA, /from '@lineas\/importar\/plan'/);
    assert.match(PANTALLA, /from '@lineas\/importar\/gpx'/);
    assert.match(PANTALLA, /from '@lineas\/importar\/identidad'/);
    assert.match(PANTALLA, /from '@lineas\/exportar\/acta'/, 'sin acta no queda papel del acto');
    assert.match(PANTALLA, /from '\.\.\/vistas\/puntosNuevos'/);
  });

  test('el archivo se lee en el computador: no hay ni una subida', () => {
    assert.match(PANTALLA, /leerArchivos/);
    assert.doesNotMatch(PANTALLA, /\bfetch\(|FormData|XMLHttpRequest/,
      'el archivo del GPS no sube a ningún sitio: se lee aquí');
  });

  test('el acuse va en una región que se anuncia sola', () => {
    // Mismo patrón que `Exportar.tsx`: quien no mira la pantalla entera tiene
    // que enterarse igual de lo que pasó.
    assert.match(PANTALLA, /aria-live="polite"/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('NI UNA FÓRMULA DENTRO DEL .tsx', () => {

  /** El fuente sin comentarios: lo que de verdad se ejecuta. */
  const codigo = PANTALLA
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

  test('la geodesia y la estadística se le piden al núcleo, no se escriben aquí', () => {
    // El día que esta pantalla tuviera su propia aritmética y discrepara de
    // Resumen, nadie sabría cuál mirar — y la discusión pasaría de ser sobre el
    // cálculo a ser sobre quién programó qué.
    for (const señal of ['Math.sqrt', 'Math.atan', 'Math.sin', 'Math.cos', 'vincenty', '* Math.PI']) {
      assert.ok(!codigo.includes(señal), `«${señal}» es cálculo, y el cálculo no vive en la pantalla`);
    }
  });

  test('el antes/después NO se recuenta aquí: sale del mismo motor de siempre', () => {
    assert.match(codigo, /cifrasDeLaCarga\(/);
    assert.ok(!/\.filter\([^)]*tipoPunto/.test(codigo),
      'contar estructuras por su cuenta es abrir una segunda aritmética');
  });

  test('las listas de opciones se leen del molde de los datos', () => {
    assert.match(codigo, /FuncionEstructural\.options/);
    assert.match(codigo, /TipoPunto\.options/);
    for (const o of [...FuncionEstructural.options, ...TipoPunto.options]) {
      assert.ok(!codigo.includes(`'${o}'`) && !codigo.includes(`"${o}"`),
        `«${o}» está escrito a mano en la pantalla: es una segunda copia de la lista del molde`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('EL INGENIERO NO LEE EL IDIOMA DE LA MÁQUINA', () => {

  /** El texto que de verdad sale por pantalla: sin comentarios y sin código. */
  const visible = PANTALLA
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')
    // Fuera lo que es sintaxis: nombres de propiedad, de variable y de clase.
    .replace(/className="[^"]*"/g, '')
    .replace(/\bimport[\s\S]*?from\s+'[^']*';/g, '');

  test('nunca ve «bisección», «semilla» ni «uid»', () => {
    // No es cosmética: son tres palabras que describen cómo funciona la máquina
    // por dentro. Quien las lee en una pantalla que va a firmar deja de mirar lo
    // que decide y se pone a descifrar.
    for (const palabra of [/bisecc/i, /\bsemilla/i, /\buid\b/i]) {
      const linea = visible.split('\n').find((l) => palabra.test(l) && />/.test(l));
      assert.equal(linea, undefined, `la palabra ${palabra} sale por pantalla: ${linea}`);
    }
  });

  test('nunca pinta un JSON ni un identificador interno', () => {
    assert.ok(!/JSON\.stringify/.test(visible), 'un JSON en pantalla no es información, es un volcado');
    assert.ok(!/\{[^}]*\.id\}/.test(visible), 'un identificador interno no le dice nada a nadie');
    // Los puntos se nombran por su NOMBRE en todo lo que vuelve a la pantalla.
    assert.match(visible, /nombreNormalizado/);
  });

  test('dice con todas las letras que esto no se puede deshacer', () => {
    // Y lo dice DOS veces: al entrar y en la confirmación en frío. Una sola vez,
    // arriba del todo, no la lee nadie al pulsar el botón.
    const veces = (visible.match(/no se puede deshacer/g) ?? []).length;
    assert.ok(veces >= 2, `«no se puede deshacer» sale ${veces} vez/veces: hacen falta al menos dos`);
    assert.match(visible, /confirmando/, 'falta la confirmación en frío antes de escribir');
  });

  test('declara qué quedó FUERA y por qué, no solo lo que entró', () => {
    // «No se cargó» sin el porqué se lee como «se perdió».
    assert.match(visible, /Sigue pendiente; no se ha perdido/);
    assert.match(visible, /quedó SUPUESTO/);
    assert.match(visible, /Ya estaban en la línea/);
  });

  test('un hueco se declara con palabras, nunca con un cero', () => {
    // Los dos que traducen una ausencia a una frase. Sin ellos, la cota que el
    // GPS no grabó saldría en blanco o —peor— como un cero, que se leería como
    // nivel del mar y acabaría en un cálculo de gálibo.
    assert.match(PANTALLA, /textoCota\(/);
    assert.match(PANTALLA, /textoHora\(/);
    // El defecto concreto: rellenar una MEDIDA que falta con un cero. Un
    // recuento sí puede valer cero — «no hay ningún punto» es un cero de verdad.
    for (const medida of ['ele', 'utc', 'lat', 'lon', 'cota', 'distancia']) {
      const patron = new RegExp(`${medida}[\\w.?]*\\s*\\?\\?\\s*0\\b`, 'i');
      assert.ok(!patron.test(visible), `«${medida}» se rellena con cero: una ausencia se disfraza de medida`);
    }
  });
});
