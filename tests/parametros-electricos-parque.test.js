// ============================================================================
// tests/parametros-electricos-parque.test.js — la pestaña con VARIAS líneas
// ----------------------------------------------------------------------------
// QUÉ VIGILA. «Parámetros eléctricos» nació con una sola línea en el parque y
// daba por supuestas cuatro cosas que dejan de ser ciertas en cuanto entra la
// segunda. Las cuatro se ven en pantalla y las cuatro engañan en silencio:
//
//   1. **EL CARTEL DEL RECORTE MENTÍA.** Decía «se muestran los primeros»
//      mientras la consulta ya se traía los ÚLTIMOS (`cargabilidadRepo` ordena
//      `fecha desc` justo para que el tope se coma lo viejo). Quien lo leyera
//      buscaría sus meses recientes fuera de la pantalla que se los estaba
//      enseñando. La frase la escribe ahora quien hizo la consulta, que es el
//      único que sabe qué se dejó fuera y desde qué día empieza lo visible.
//
//   2. **LA LÍNEA SE TECLEABA.** Esa casilla decide bajo qué código se escribe
//      el histórico, y el histórico NO SE BORRA (`firestore.rules` niega el
//      borrado en las tres colecciones de cargabilidad). Un dígito cambiado no
//      da error: deja días y resúmenes reales a nombre de una línea que no
//      existe, sin pantalla que los abra y sin forma de retirarlos. Se elige de
//      la lista del parque, como el alta elige del libro de códigos.
//
//   3. **SIN CONDUCTOR NO HAY VEREDICTO, y hay que decirlo sin inventarlo.**
//      Las líneas nuevas entran sin conductor declarado (lo entrega el Ingeniero
//      después, y **no se copia el de otra línea** aunque comparta torres). Los
//      indicadores que no se pueden calcular dicen por qué; los que sí —la
//      corriente, las potencias, las horas— se siguen viendo enteros.
//
//   4. **SIN TENSIÓN MEDIDA, LA APARENTE NO ES LA MISMA COSA.** Con P y Q sale
//      de ellas y ninguna tensión participa. La nominal declarada solo entra si
//      falta una de las dos Y además falta la tensión medida — y entonces esos
//      MVA son placa, no operación, y se dice.
//
// ⚠️ CÓMO SE PRUEBA. Lo que es cálculo se EJECUTA (el motor y el libro de
// códigos, los dos importables desde Node). Lo que es pantalla se lee del
// archivo publicado, como el resto de pruebas de esta pestaña: montarla exige
// sesión y dato de cliente, y aquí no entra ni un byte de cliente (`L-23`).
//
// ⚠️ Y LN-627 TIENE QUE SEGUIR VIÉNDOSE IGUAL. Cada frase nueva va detrás de una
// condición que solo se cumple sin conductor o sin tensión medida: el último
// bloque comprueba que esas condiciones existen, y con el conductor real de
// LN-627 el motor las deja todas en falso.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ampacidadDeLinea } from '../nucleo/termica.js';
import { potenciasDelInstante } from '../nucleo/electrica.js';
import { codigosDelLibro, filaDelLibro } from '../importar/identidad.js';

const leer = (p) => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf-8');
const P = leer('web/src/componentes/Cargabilidad.tsx');
const LINEA = leer('web/src/componentes/Linea.tsx');
const REPO = leer('web/src/datos/cargabilidadRepo.ts');
const LIBRO = JSON.parse(leer('herramientas/codigos-emitidos.json'));

/** El cuerpo de un componente, para no cazar una coincidencia de otro. */
const cuerpo = (firma) => {
  const i = P.indexOf(`function ${firma}`);
  assert.ok(i >= 0, `falta function ${firma}`);
  const j = P.indexOf('\nfunction ', i + 10);
  return P.slice(i, j > i ? j : undefined);
};
const HIST = cuerpo('HistoricoGuardado(');
const SCADA = cuerpo('SenalesDelScada(');
const TABLERO = cuerpo('TableroDelHistorico(');
const VEREDICTO = cuerpo('VeredictoDelHistorico(');
const TRANSPORTA = cuerpo('QueTransporta(');
const CUESTA = cuerpo('LoQueCuesta(');

// ════════════════════════════════════════════════════════════════════════════
// 1 · EL CARTEL DEL RECORTE
// ════════════════════════════════════════════════════════════════════════════
describe('el recorte se dice como es, y antes de lo que afecta', () => {
  test('⚠️ la pantalla ya NO redacta su propia frase: usa la del que hizo la consulta', () => {
    // Ésta es la mentira concreta. Si vuelve, vuelve rojo.
    assert.doesNotMatch(P, /se muestran\s+los primeros/,
      'el cartel volvió a decir «los primeros» y la consulta trae los ÚLTIMOS');
    assert.match(HIST, /setAvisoDelRecorte\(res\.aviso\)/,
      'la frase tiene que venir del repositorio, que es el único que sabe qué quedó fuera');
    assert.doesNotMatch(HIST, /setRecortado\(/,
      'un booleano no basta: obliga a la pantalla a redactar, y ahí es donde se desactualiza');
  });

  test('y el repositorio la escribe diciendo que se quedó lo MÁS RECIENTE y desde cuándo', () => {
    assert.match(REPO, /aviso: string \| null/, 'el molde del resultado perdió la frase');
    assert.match(REPO, /los \$\{conMiles\(tope\)\} días más recientes/);
    assert.match(REPO, /lo que se ve empieza el \$\{desdeLeido\}/,
      'sin el primer día visible, nadie puede explicarse por qué las gráficas arrancan tarde');
    assert.match(REPO, /orderBy\('fecha', 'desc'\)/,
      'si la consulta vuelve a ser ascendente, la frase pasa a mentir otra vez');
  });

  test('⚠️ el aviso va ANTES de las gráficas, no al final de la pestaña', () => {
    const i = HIST.indexOf('{avisoDelRecorte && (');
    assert.ok(i > 0, 'desapareció el aviso del recorte');
    for (const debajo of ['<TableroDelHistorico', '<TendenciaDiaria', '<GraficasPorFase']) {
      assert.ok(HIST.indexOf(debajo) > i,
        `«${debajo}» se dibuja antes que el aviso: su eje empieza tarde y nadie sabe por qué`);
    }
  });

  test('⚠️ «cómo se comportó» dice cuándo habla de menos días que el resto de la pestaña', () => {
    // El veredicto, qué transporta, lo que cuesta y cómo se comportó salen de
    // las HORAS, que se leen con su propio tope; el resto sale de los resúmenes
    // diarios, que cubren el periodo entero. Sin esta frase, esa tarjeta
    // describe la cola del periodo bajo un rótulo que promete el periodo entero.
    assert.match(HIST, /recortadosPorEst\[estInd\] != null && \(/);
    assert.match(HIST, /días más recientes<\/b> del periodo: el veredicto, qué/);
    assert.match(HIST, /Los indicadores de los\s*\n?\s*resúmenes diarios sí cubren el periodo entero/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2 · LA LÍNEA SE ELIGE, NO SE TECLEA
// ════════════════════════════════════════════════════════════════════════════
describe('la línea del archivo sale de la lista del parque', () => {
  test('⚠️ la casilla es una lista, y ya no una casilla de texto', () => {
    assert.match(SCADA, /<select value=\{linea\} onChange=\{\(e\) => alCambiarLinea\(e\.target\.value\)\}/);
    assert.match(SCADA, /— elija una línea del parque —/, 'la primera opción pide elegir, no es una línea');
    assert.match(SCADA, /\{opcionesDeLinea\.map\(\(l\) => <option key=\{l\} value=\{l\}>\{l\}<\/option>\)\}/);
    assert.doesNotMatch(SCADA, /<input type="text" value=\{linea\}/,
      'volvió el texto libre: un código mal escrito deja un histórico que no se puede borrar');
  });

  test('⚠️ la lista sale del PARQUE, nunca del libro de códigos', () => {
    // Lo cazó la revisión del 17-09: el libro anota códigos RESERVADOS que
    // todavía no existen en la base. Ofrecerlos dejaba guardar el histórico a
    // nombre de una línea que no existe, y eso no se puede borrar.
    assert.match(P, /\.\.\.\(lineasDelParque \?\? \[\]\),/);
    assert.doesNotMatch(P, /lineasDelParque\?\.length \? lineasDelParque : LINEAS_DEL_LIBRO/,
      'volvió el libro como lista: ofrecería líneas que aún no están dadas de alta');
    assert.match(P, /import \{ codigosDelLibro, filaDelLibro \} from '@lineas\/importar\/identidad'/);
    assert.match(P, /Reservado en el libro y <b>todavía sin dar de alta<\/b>/,
      'lo reservado se NOMBRA para que «no aparece mi línea» no parezca un fallo');
  });

  test('⚠️ y esa lista trae las LÍNEAS, no los tramos compartidos', () => {
    // Se ejecuta de verdad: el mismo filtro que aplica la pantalla, sobre el
    // mismo libro que se despliega con ella.
    const lineas = codigosDelLibro(LIBRO).filter((c) => filaDelLibro(LIBRO, c)?.tipo === 'linea');
    assert.deepEqual(lineas, ['LN-627', 'LN-617', 'LN-628']);
    assert.ok(!lineas.includes('TR-618'),
      'el tramo compartido no es una línea: un histórico de carga a su nombre no lo abre nadie');
    assert.ok(codigosDelLibro(LIBRO).includes('TR-618'), 'el tramo sigue anotado, solo que no se ofrece aquí');
  });

  test('la línea ABIERTA entra siempre en la lista, aunque naciera antes del libro', () => {
    // LN-627 lleva meses en producción. Si un día no estuviera anotada, dejarla
    // fuera de su propia lista le impediría guardar su propio archivo.
    assert.match(P, /\.\.\.\(lineaAbierta \? \[lineaAbierta\] : \[\]\)/);
    assert.match(P, /new Set\(\[/, 'y sin repetirla si ya venía en la lista');
  });

  test('⚠️ guardar COMPRUEBA que la línea es del parque: el histórico no se borra', () => {
    assert.match(P, /if \(cargado\.ancho && !opcionesDeLinea\.includes\(linea\.trim\(\)\)\) \{/);
    assert.match(P, /no es una línea del parque/);
    assert.match(P, /El histórico no se puede borrar/,
      'el motivo tiene que estar en el mensaje: es lo que hace entender por qué no se deja pasar');
  });

  test('el padre pasa el parque de verdad; sin él, solo la línea abierta y se dice', () => {
    assert.match(P, /lineasDelParque\?: string\[\]/);
    assert.match(LINEA, /lineasDelParque=\{parque\.map\(\(l\) => l\.codigo\)\}/,
      'la pantalla de la línea es quien conoce el parque: si no lo pasa, la lista se queda coja');
    assert.match(P, /No se pudo leer el parque, así que solo se ofrece <b>la línea abierta<\/b>/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3 · UNA LÍNEA SIN CONDUCTOR
// ════════════════════════════════════════════════════════════════════════════
describe('sin conductor declarado: se dice, y lo guardado se sigue viendo', () => {
  const sinConductor = ampacidadDeLinea({ conductor: null });

  test('el motor lo declara con todas las letras, y no supone ninguna ampacidad', () => {
    assert.equal(sinConductor.ampacidad_A, null);
    assert.equal(sinConductor.vigente_A, null);
    assert.equal(sinConductor.motivo, 'no hay conductor declarado en la línea');
    assert.equal(sinConductor.esDictamen, false);
  });

  test('⚠️ sin ampacidad NO sale el veredicto térmico de los 90 °C', () => {
    // `esDictamen` también es `false` sin conductor, y ese párrafo hablaba de
    // «este conductor» y de «17 % de capacidad de más» en una línea que no
    // declara ninguno: un dictamen inventado en la única pantalla que no lo
    // puede dar. Ahora exige que HAYA amperaje que calificar.
    assert.match(VEREDICTO, /referencia\.esDictamen === false && referencia\.ampacidad_A != null && \(/);
    assert.ok(sinConductor.esDictamen === false && sinConductor.ampacidad_A == null,
      'la condición que apaga ese aviso tiene que cumplirse justo en este caso');
  });

  test('la ampacidad que falta dice además que NO se pide prestada a la vecina', () => {
    assert.match(VEREDICTO, /no se usa la de otra línea/);
    assert.match(VEREDICTO, /la torre se comparte, el conductor no tiene por\s*\n?\s*qué/,
      'dos líneas en las mismas torres pueden llevar conductores distintos');
  });

  test('el margen dice qué le falta a la LÍNEA, no al periodo', () => {
    assert.match(VEREDICTO,
      /'saldrá de restar la corriente del pico a la ampacidad, y esta línea no la tiene'/);
    assert.match(VEREDICTO,
      /'saldrá de restar la corriente del pico a la ampacidad, y este periodo no la tiene'/,
      'sin corriente el motivo es otro, y también se dice');
  });

  test('⚠️ «Días con sobrecarga» sale «—», no «0»: un cero en verde diría que no hay ninguna', () => {
    assert.match(TABLERO, /v=\{sinAmpacidad \? '—' : nf\(t\.diasConSobrecarga\)\}/);
    assert.match(TABLERO, /no hay con qué comparar: \$\{sinAmpacidad\}/);
    assert.match(TABLERO, /sin porcentaje: \$\{sinAmpacidad\}/);
    assert.match(HIST, /<TableroDelHistorico resumenes=\{filas\} sinAmpacidad=\{referencia\.motivo\}/);
  });

  test('las pérdidas dicen qué hace falta, no solo que faltan', () => {
    assert.match(CUESTA, /Son <b>3 · I² · R · L<\/b>/);
    assert.match(CUESTA, /la longitud, del\s*\n?\s*levantamiento de la línea/);
    assert.match(CUESTA, /La tensión no entra/);
  });

  test('⚠️ y lo guardado SE SIGUE VIENDO: corriente, potencias y horas no dependen del conductor', () => {
    // La corriente del pico no se apaga por no tener denominador, y qué
    // transporta tampoco: es lo que separa «no se puede dictaminar» de «no hay
    // nada». Se dibujan sin mirar la ampacidad.
    assert.match(VEREDICTO, /v=\{corriente == null \? null : `\$\{nf\(corriente\)\} A`\}/);
    assert.match(HIST, /\{operacionInd && picoInd && \(/, 'qué transporta no pregunta por la ampacidad');
    assert.match(HIST, /\{operacionInd && <LoQueCuesta/);
    assert.match(VEREDICTO, /Lo guardado se sigue viendo entero/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4 · SIN TENSIÓN MEDIDA
// ════════════════════════════════════════════════════════════════════════════
describe('la aparente sale del camino con menos supuestos, y se dice cuál', () => {
  test('⚠️ con P y Q la aparente sale de ellas: la nominal NO entra', () => {
    const conNominal = potenciasDelInstante({
      tensionNominal_kV: 66, corriente_A: 400, potenciaActiva_MW: -24, potenciaReactiva_MVAr: -10.1,
    });
    assert.equal(conNominal.origenAparente, 'de P y Q medidas');
    assert.equal(conNominal.aparente_MVA, Math.round(Math.hypot(-24, -10.1) * 100) / 100);
    // La misma hora sin tensión ninguna da EXACTAMENTE la misma aparente: es la
    // demostración de que la nominal no participó.
    const sinTension = potenciasDelInstante({
      corriente_A: 400, potenciaActiva_MW: -24, potenciaReactiva_MVAr: -10.1,
    });
    assert.equal(sinTension.aparente_MVA, conNominal.aparente_MVA);
    assert.equal(sinTension.origenAparente, 'de P y Q medidas');
  });

  test('sin Q, la tensión MEDIDA manda sobre la nominal', () => {
    const medida = potenciasDelInstante({
      tension_kV: 65.1, tensionNominal_kV: 66, corriente_A: 518.8, potenciaActiva_MW: -21.9,
    });
    assert.equal(medida.tensionUsada.de, 'medida');
    assert.equal(medida.tensionUsada.kV, 65.1);
    assert.match(medida.origenAparente, /tensión medida/);
  });

  test('⚠️ la NOMINAL solo entra si falta P o Q y además falta la tensión medida', () => {
    const placa = potenciasDelInstante({
      tensionNominal_kV: 66, corriente_A: 518.8, potenciaActiva_MW: -21.9,
    });
    assert.equal(placa.tensionUsada.de, 'nominal');
    assert.match(placa.origenAparente, /tensión nominal/);
    assert.ok(placa.aparente_MVA > 0, 'el motor no deja la aparente en blanco, la estima');
  });

  test('y la pantalla la marca como estimación de placa, no como medida', () => {
    assert.match(TRANSPORTA, /p\.tensionUsada\.de === 'nominal'\s*\n?\s*&& !\(p as \{ origenAparente\?: string \}\)\.origenAparente\?\.startsWith\('de P y Q'\)/);
    assert.match(TRANSPORTA, /Estos MVA son una estimación de placa, no una medida/);
    assert.match(TRANSPORTA, /nominal declarada<\/b> de la/);
  });

  test('⚠️ el factor de potencia dice de qué aparente sale', () => {
    // 0,374 con la aparente de √3·V·I y 0,374 con la de P y Q no significan lo
    // mismo, y hasta hoy salían iguales y mudos.
    assert.match(TRANSPORTA, /'con la aparente de √3·V·I, no de P y Q'/);
    // Y solo en ese caso: con P y Q la tarjeta se queda como estaba, sin subtítulo.
    assert.match(TRANSPORTA,
      /&& !\(p as \{ origenAparente\?: string \}\)\.origenAparente\?\.startsWith\('de P y Q'\)\s*\n?\s*\? 'con la aparente de √3·V·I, no de P y Q' : undefined\}/);
  });

  test('y la reactiva que falta lo dice en el idioma de donde se mira', () => {
    assert.match(TRANSPORTA, /'falta Q: el archivo de ese día no trae la fila de MVAr'/);
    assert.match(TRANSPORTA, /'esta carga no trae la columna de MVAr'/,
      'en el camino de un archivo recién cargado la frase de siempre no cambia');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5 · LN-627 SE SIGUE VIENDO IGUAL
// ════════════════════════════════════════════════════════════════════════════
describe('con conductor declarado, la pantalla es la de siempre', () => {
  // El conductor real de LN-627, el mismo que usa `veredicto-electrico`.
  const DARIEN = { codigo: 'Darien', material: 'AAAC', seccion_mm2: 283.5,
    diametro_m: 0.02179, tempMaxOperacion_C: 90 };
  const conConductor = ampacidadDeLinea({ conductor: DARIEN });

  test('⚠️ `motivo` es null, así que NINGUNA de las frases nuevas se enciende', () => {
    assert.equal(conConductor.motivo, null,
      'todas las frases nuevas van detrás de `sinAmpacidad`/`referencia.motivo`');
    assert.ok(conConductor.ampacidad_A > 0);
  });

  test('el aviso de «no es un dictamen» SIGUE saliendo: hay amperaje que calificar', () => {
    // La condición nueva no lo apaga donde ya salía — eso sería perder un aviso
    // que el Ingeniero pidió el 2026-09-05.
    assert.equal(conConductor.esDictamen, false, 'el Darien no declara su temperatura de fabricante');
    assert.ok(conConductor.ampacidad_A != null,
      'con ampacidad, `esDictamen === false && ampacidad_A != null` se sigue cumpliendo');
  });

  test('el tablero conserva sus subtítulos y su cifra de sobrecarga sin `sinAmpacidad`', () => {
    assert.match(TABLERO, /const sinPct = sinAmpacidad \? `sin porcentaje: \$\{sinAmpacidad\}` : undefined/,
      'sin motivo, el subtítulo vuelve a ser el de antes: `undefined`');
    assert.match(TABLERO, /: t\.horasDeSobrecarga > 0 \? `\$\{nf\(t\.horasDeSobrecarga\)\} h en total` : '≥ 100 %'/);
    assert.match(TABLERO, /color=\{!sinAmpacidad && t\.diasConSobrecarga > 0 \? 'var\(--tx-alerta\)' : undefined\}/);
  });

  test('y el veredicto de un archivo recién cargado no se ha tocado', () => {
    const EL = cuerpo('ElVeredicto(');
    assert.match(EL, /r="contra la AMPACIDAD"/);
    assert.match(EL, /r="% del ARCHIVO"/);
    assert.match(EL, /\{referencia\.esDictamen === false && \(/,
      'ahí el aviso no necesita guarda: la tarjeta ya no se monta sin contraste comparable');
  });
});
