// ============================================================================
// tests/fotos-pantalla.test.js — lo que la pestaña «Fotos» le dice al Ingeniero
// ----------------------------------------------------------------------------
// QUÉ SE PRUEBA: `web/src/vistas/fotosNuevas.ts`, que es todo lo que la pantalla
// SABE — las cifras, las frases, las faltas y el acuse—, más un guardián por
// texto sobre el componente.
//
// POR QUÉ ESTO NO ES DECORACIÓN. Esta pantalla escribe evidencias, y
// `firestore.rules` niega borrarlas: una foto colgada del punto equivocado se
// queda ahí para siempre. Lo único que hay entre el error y el expediente es
// que él LEA bien la tabla de reparto antes de firmar. Si el «106 entrarían
// nuevas» que él lee discrepara del reparto que de verdad se manda, la
// comprobación no comprobaría nada — y no habría forma de enterarse.
//
// ⚠️ MUNDO SINTÉTICO: línea, carpetas y puntos inventados (L-23, `33 · L-50`).
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  TEXTOS, actaDeFotos, confirmoConLaPalabra, faltasParaSubir, filasDeReparto,
  fraseDelProgreso, frasePedirConfirmacion, lineaDelActa, mapaActualizado,
  pieDelReparto, resumenDelActa, rotuloDelBoton,
} from '../web/src/vistas/fotosNuevas.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const fuente = (r) => readFileSync(join(RAIZ, r), 'utf-8');

const GRUPOS = [
  { carpeta: 'C1', nombreCanonico: 'LX-000 T01', apoyoCampo: 'T1', fotos: 8, nuevas: 0, yaEstan: 8, esEmpalme: false },
  { carpeta: 'CEMP', nombreCanonico: 'LX-000 EMP T03-T04', apoyoCampo: 'EMPX', fotos: 1, nuevas: 1, yaEstan: 0, esEmpalme: true },
  { carpeta: 'C4', nombreCanonico: 'LX-000 T04', apoyoCampo: 'T4', fotos: 7, nuevas: 7, yaEstan: 0, esEmpalme: false },
];

// ════════════════════════════════════════════════════════════════════════════
describe('LA TABLA DE REPARTO — es lo que va a pasar, no un informe de lo que pasará', () => {
  test('cada fila dice de dónde salió, a qué punto va y cómo se llama en el aparato', () => {
    const filas = filasDeReparto(GRUPOS);
    assert.deepEqual(filas.map((f) => f.carpeta), ['C1', 'CEMP', 'C4']);
    assert.deepEqual(filas.map((f) => f.nombreCampo), ['T1', 'EMPX', 'T4']);
  });

  test('el estado es UNO por fila, y manda «hay algo que subir»', () => {
    const filas = filasDeReparto(GRUPOS);
    assert.equal(filas[0].estado, 'ya está');
    assert.equal(filas[1].estado, 'entra nueva');
    assert.equal(filas[2].estado, 'entra nueva');
  });

  test('un grupo sin nada que hacer no se disfraza de «ya está»', () => {
    const [f] = filasDeReparto([{ ...GRUPOS[0], fotos: 0, nuevas: 0, yaEstan: 0 }]);
    assert.equal(f.estado, 'nada que subir');
  });

  test('un EMPALME va marcado: en este sistema no es un apoyo', () => {
    assert.equal(filasDeReparto(GRUPOS)[1].esEmpalme, true);
  });

  test('el nombre del aparato no desaparece cuando falta: se usa el canónico', () => {
    const [f] = filasDeReparto([{ ...GRUPOS[0], apoyoCampo: undefined }]);
    assert.equal(f.nombreCampo, 'LX-000 T01');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('EL PIE DE LA TABLA — la cifra que él lee antes de firmar', () => {
  test('cuenta fotos, puntos, nuevas y las que ya están', () => {
    const t = pieDelReparto({ fotos: 205, puntos: 28, nuevas: 106, yaEstan: 99, enEmpalmes: 12 });
    assert.match(t, /205 fotos en 28 puntos/);
    assert.match(t, /106 entrarían nuevas/);
    assert.match(t, /99 ya están/);
    assert.match(t, /12 de ellas en EMPALMES/);
  });

  test('sin empalmes NO se nombra a los empalmes: un cero que no significa nada es ruido', () => {
    assert.doesNotMatch(pieDelReparto({ fotos: 3, puntos: 1, nuevas: 3, yaEstan: 0, enEmpalmes: 0 }), /EMPALME/);
  });

  test('el singular se dice en singular: «1 foto en 1 punto», no «1 fotos»', () => {
    const t = pieDelReparto({ fotos: 1, puntos: 1, nuevas: 1, yaEstan: 1, enEmpalmes: 0 });
    assert.match(t, /1 foto en 1 punto/);
    assert.match(t, /1 entraría nueva/);
    assert.match(t, /1 ya está/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('EL BOTÓN APAGADO DICE QUÉ LE FALTA', () => {
  const base = {
    puedeSubir: true, rol: 'cuadrilla', hayIndice: true, hayMapa: true,
    problemas: 0, nuevas: 10, reviso: true, escribioSubir: true,
  };

  test('con todo puesto, no falta nada', () => {
    assert.deepEqual(faltasParaSubir(base), []);
  });

  test('sin permiso, lo dice con el permiso que tiene — no con un genérico', () => {
    const [f] = faltasParaSubir({ ...base, puedeSubir: false, rol: 'auditor' });
    assert.match(f, /«auditor»/);
    assert.match(f, /cuadrilla o superior/);
  });

  for (const [campo, patron] of [
    ['hayIndice', /índice del registro/],
    ['hayMapa', /mapa de carpetas/],
    ['reviso', /revisó punto por punto/],
    ['escribioSubir', /SUBIR/],
  ]) {
    test(`sin «${campo}» el motivo se nombra`, () => {
      const faltas = faltasParaSubir({ ...base, [campo]: false });
      assert.ok(faltas.some((f) => patron.test(f)), `no se dice qué falta cuando falta ${campo}`);
    });
  }

  test('una parada sin resolver apaga el botón y se cuenta', () => {
    const faltas = faltasParaSubir({ ...base, problemas: 3 });
    assert.ok(faltas.some((f) => /3 cosas que no casan/.test(f)));
  });

  test('«no hay nada nuevo» se dice como lo que es, no como una falta del usuario', () => {
    const faltas = faltasParaSubir({ ...base, nuevas: 0 });
    assert.ok(faltas.some((f) => /ya están en la base/.test(f)));
  });

  test('sin índice NO se acusa además de «no hay nada nuevo»: sería regañar por no haber terminado', () => {
    const faltas = faltasParaSubir({ ...base, hayIndice: false, nuevas: 0 });
    assert.equal(faltas.filter((f) => /ya están en la base/.test(f)).length, 0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('LA CONFIRMACIÓN EN FRÍO', () => {
  test('la palabra se acepta con espacios y en minúscula, pero tiene que ser ÉSA', () => {
    assert.equal(confirmoConLaPalabra('SUBIR'), true);
    assert.equal(confirmoConLaPalabra('  subir '), true);
    assert.equal(confirmoConLaPalabra('si'), false);
    assert.equal(confirmoConLaPalabra(''), false);
    assert.equal(confirmoConLaPalabra('SUBIRLAS'), false);
  });

  test('la pregunta dice CUÁNTAS van a subir: nadie confirma un número que no vio', () => {
    assert.match(frasePedirConfirmacion(106), /Van a subir 106 fotografías/);
    assert.match(frasePedirConfirmacion(1), /Van a subir 1 fotografía\b/);
  });

  test('el rótulo del botón lleva la cifra', () => {
    assert.equal(rotuloDelBoton(106), 'Subir las 106');
    assert.equal(rotuloDelBoton(1), 'Subir la fotografía');
  });

  test('el progreso nombra el punto, no un número de archivo', () => {
    assert.equal(fraseDelProgreso(37, 106, 'LX-000 T04'), 'Subiendo 37 de 106… (LX-000 T04)');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('EL ACUSE — cuenta también lo que quedó fuera', () => {
  const acta = actaDeFotos({
    linea: 'LX-000', quien: 'alguien@ejemplo.invalid', cuando: '2026-01-01T00:00:00.000Z',
    intentos: [
      { punto: 'LX-000 T04', entro: true, yaEstaba: false },
      { punto: 'LX-000 T04', entro: true, yaEstaba: false },
      { punto: 'LX-000 T01', entro: false, yaEstaba: true },
    ],
    fuera: [{ punto: 'LX-000 T05', archivo: 'x.jpg', motivo: 'se cortó la conexión' }],
  });

  test('cuenta lo que entró sobre lo que se intentó', () => {
    assert.equal(acta.entraron, 2);
    assert.equal(acta.yaEstaban, 1);
    assert.equal(acta.intentadas, 4);
    assert.equal(resumenDelActa(acta), 'Entraron 2 de 4.');
  });

  test('lo que quedó fuera aparece POR PUNTO: «no entró» sin el porqué se lee como «se perdió»', () => {
    const p = acta.porPunto.find((x) => x.punto === 'LX-000 T05');
    assert.equal(p.fallaron, 1);
    assert.equal(acta.fuera[0].motivo, 'se cortó la conexión');
  });

  test('cada línea del acuse se lee sin jerga y sin identificadores', () => {
    for (const p of acta.porPunto) {
      const t = lineaDelActa(p);
      assert.doesNotMatch(t, /undefined|NaN|\[object/, `la línea de ${p.punto} enseña un hueco de la máquina`);
      assert.match(t, new RegExp(p.punto.replace(/[-]/g, '\\-')));
    }
    assert.match(lineaDelActa({ punto: 'LX-000 T04', entraron: 9, yaEstaban: 0, fallaron: 0 }), /9 fotos, todas dentro/);
    assert.match(lineaDelActa({ punto: 'LX-000 T04', entraron: 1, yaEstaban: 0, fallaron: 0 }), /1 foto, dentro/);
  });

  test('un punto donde no pasó nada lo dice, en vez de salir vacío', () => {
    assert.match(lineaDelActa({ punto: 'LX-000 T09', entraron: 0, yaEstaban: 0, fallaron: 0 }), /nada que hacer/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('EL MAPA QUE SE DESCARGA — el MISMO papel, no una copia bonita', () => {
  const MAPA = {
    _nota: 'una nota que explica por qué vive fuera del repositorio',
    linea: 'LX-000',
    carpetas: [
      { carpeta: 'C1', nombreCanonico: 'LX-000 T01', yaCargado: true },
      { carpeta: 'C4', nombreCanonico: 'LX-000 T04' },
      { carpeta: 'C5', nombreCanonico: 'LX-000 T05' },
    ],
  };

  test('conserva la forma que ya lee el guion de consola: nota, línea y carpetas', () => {
    const salida = mapaActualizado(MAPA, [], []);
    assert.equal(salida._nota, MAPA._nota);
    assert.equal(salida.linea, 'LX-000');
    assert.equal(salida.carpetas.length, 3);
    assert.deepEqual(Object.keys(salida.carpetas[0]).sort(), ['carpeta', 'nombreCanonico', 'yaCargado']);
  });

  test('marca como cargadas las carpetas de hoy, y no desmarca lo que ya estaba', () => {
    const salida = mapaActualizado(MAPA, [], ['C4']);
    assert.equal(salida.carpetas.find((f) => f.carpeta === 'C1').yaCargado, true);
    assert.equal(salida.carpetas.find((f) => f.carpeta === 'C4').yaCargado, true);
    assert.equal(salida.carpetas.find((f) => f.carpeta === 'C5').yaCargado, false);
  });

  test('si él CORRIGIÓ el destino en pantalla, se guarda SU corrección', () => {
    const salida = mapaActualizado(MAPA, [{ carpeta: 'C4', nombreCanonico: 'LX-000 T09' }], []);
    assert.equal(salida.carpetas.find((f) => f.carpeta === 'C4').nombreCanonico, 'LX-000 T09');
    assert.equal(salida.carpetas.find((f) => f.carpeta === 'C5').nombreCanonico, 'LX-000 T05',
      'lo que no tocó no se toca');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('LAS FRASES — sin jerga, y las que tienen que estar', () => {
  test('ninguna frase enseña vocabulario de máquina', () => {
    for (const [clave, texto] of Object.entries(TEXTOS)) {
      assert.doesNotMatch(texto, /\b(JSON|sha256|uuid|id|token|batch|hash|R2|bucket)\b/i,
        `«${clave}» habla en el idioma de la máquina`);
      assert.doesNotMatch(texto, /undefined|\[object/);
    }
  });

  test('se dice que NO se puede borrar, y con esas palabras', () => {
    assert.match(TEXTOS.noSePuedeBorrar, /NO se puede borrar/);
    assert.match(TEXTOS.noSePuedeBorrar, /Se puede no cometerla/);
  });

  test('se dice que los archivos no salen del equipo hasta que él lo diga', () => {
    assert.match(TEXTOS.nadaSale, /Nada sale de aquí hasta que usted lo diga/);
  });

  test('la ausencia del índice NO se resuelve adivinando, y se dice', () => {
    assert.match(TEXTOS.sinIndice, /adivinarlo es justo lo que este sistema no va a hacer/);
  });

  test('se explica POR QUÉ la línea no se refresca sola — es la cicatriz de ADR-028', () => {
    assert.match(TEXTOS.porQueNoSeRefresca, /borraría este acuse/);
    assert.match(TEXTOS.porQueNoSeRefresca, /después de leer/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('GUARDIÁN POR TEXTO — la pantalla pinta, no calcula', () => {
  const tsx = fuente('web/src/componentes/Fotos.tsx');
  const codigo = tsx.replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

  test('en el componente no hay ni una fórmula de identidad ni de huella', () => {
    assert.doesNotMatch(codigo, /crypto\.subtle\.digest/, 'la huella se pide a @lineas/importar, no se calcula aquí');
    assert.doesNotMatch(codigo, /createHash/);
    assert.doesNotMatch(codigo, /slice\(\s*0\s*,\s*32\s*\)/, 'volvió la fórmula del identificador dentro de la pantalla');
  });

  test('el emparejamiento se le pide al módulo COMPARTIDO con el guion de consola', () => {
    assert.match(codigo, /prepararReparto/);
    assert.match(codigo, /from '@lineas\/importar\/evidencias'/,
      'si la pantalla tuviera su propio emparejador, discreparía del guion sin que nadie lo notara');
  });

  test('las cifras y las frases salen de la vista, no del componente', () => {
    assert.match(codigo, /from '\.\.\/vistas\/fotosNuevas'/);
    assert.doesNotMatch(codigo, /entrarían nuevas/, 'el pie de la tabla se arma en la vista, que sí tiene pruebas');
  });

  test('la casilla y la palabra empiezan VACÍAS: nada preseleccionado', () => {
    assert.match(codigo, /useState\(false\)/, 'la casilla de revisado empieza sin marcar');
    assert.match(codigo, /const \[palabra, setPalabra\] = useState\(''\)/);
  });

  test('el acuse NO se borra solo: la línea se refresca cuando él lo pide', () => {
    // La cicatriz de ADR-028. `refrescarLinea` solo puede aparecer colgado de un
    // botón; si apareciera dentro de un `useEffect` o justo después de subir,
    // destruiría el acuse en el mismo instante en que se genera.
    assert.match(codigo, /onClick=\{\(\) => void almacen\.refrescarLinea\(\)\}/);
    assert.equal((codigo.match(/refrescarLinea/g) ?? []).length, 1,
      'la línea se refresca en UN solo sitio, y es un botón');
  });

  test('la pantalla NO le pregunta a la base si una ficha ya existe', () => {
    // El fallo del 17-08: `getDoc` sobre un documento que aún no existe no
    // devuelve «no está», DENIEGA. Aquí se pregunta por lo que EXISTE.
    assert.doesNotMatch(codigo, /getDoc\b/, 'preguntar por un documento inexistente lo deniega la base');
    assert.match(codigo, /huellasEnLaBase/, 'lo que decide es la huella contra lo que ya está cargado en memoria');
  });

  test('no se nombra ninguna línea ni instalación real', () => {
    const linea = new RegExp(['LN', '627'].join('-'));
    const cliente = new RegExp(['AFI' + 'NIA', 'E' + 'PM', 'Membri' + 'llal'].join('|'), 'i');
    for (const ruta of ['web/src/componentes/Fotos.tsx', 'web/src/vistas/fotosNuevas.ts', 'web/src/datos/fotos.ts']) {
      assert.doesNotMatch(fuente(ruta), linea, `${ruta} nombra una línea real`);
      assert.doesNotMatch(fuente(ruta), cliente, `${ruta} nombra una instalación o un cliente`);
    }
  });
});
