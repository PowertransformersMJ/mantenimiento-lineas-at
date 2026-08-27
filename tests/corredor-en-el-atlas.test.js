// ============================================================================
// tests/corredor-en-el-atlas.test.js — las dos capas finas, en su casa nueva
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE (`99 §ADR-087`). El Ingeniero mandó el 22-08 que el clima
// dejara de vivir en Detalle GPS y viviera en la pantalla del ATLAS. Las últimas
// dos piezas que faltaban eran «Radiación solar» y «Temperatura ambiente» del
// corredor: celdas de 2 km del Global Solar Atlas.
//
// Mudarlas no es mover un componente de sitio. Al ponerlas en la pantalla del
// atlas aparecen CUATRO formas nuevas de mentir, y cada una tiene aquí su
// guardián:
//
//   1. **Decir que un promedio de treinta años es de ayer.** El atlas está
//      construido entero alrededor de «de cuándo es este dato». Estas dos no
//      tienen «cuándo», y una ficha sin `naturaleza` se lee como `medida`.
//   2. **Enseñar dos rampas de color sobre el mismo territorio.** Superpuestas
//      no se lee ninguna de las dos, y un clic contestaría dos veces en dos
//      unidades distintas.
//   3. **Acercarse más de lo que aguanta el dato… o el mapa base.** El atlas
//      tiene el techo en 9,5 porque su celda mide 111 km. La del corredor mide
//      2 km. Y el recorte del Caribe solo publica teselas hasta cierto zoom.
//   4. **Volver a publicar dibujo de mapa que nadie puede mirar** (`§ADR-071`).
//      Si el portero no sabe abrirlas, verificarlas vuelve a depender de que
//      alguien abra su navegador — que es lo que costó una sesión entera.
//
// ⚠️ Los guardianes de lo que estas capas YA hacían (la marca del repintado, la
// ficha que no se reusa, el encuadre con un solo dueño, la advertencia de la
// ampacidad) NO están aquí: siguen en `radiacion`, `temperatura` y `mapa-capas`,
// repuntados a la casa nueva. Un guardián no se duplica al mudarse el código.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  CELDA_DEL_ATLAS_M, CORREDOR, CORREDOR_EN_ORDEN, declaraSuNaturaleza, ID_CAPA_CORREDOR,
  MARGEN_SOBRE_EL_FONDO, NATURALEZA_CORREDOR, TECHO_DEL_ATLAS, techoDelCorredor,
} from '../web/src/vistas/corredor.ts';
import { ATLAS, ATLAS_EN_ORDEN } from '../web/src/vistas/atlasCatalogo.ts';

const url = (p) => fileURLToPath(new URL(p, import.meta.url));
const leer = (p) => readFileSync(url('../' + p), 'utf-8');
const ficha = (n) => JSON.parse(leer(`web/public/mapas/${n}`));

const CAPAS = leer('web/src/componentes/CapasDelCorredor.tsx');
const ATLAS_TSX = leer('web/src/componentes/AtlasCaribe.tsx');
const PORTERO = leer('herramientas/mirar-los-atlas.mjs');
const BANCO = leer('web/src/sonda-satelital.tsx');

// ════════════════════════════════════════════════════════════════════════════
// 1 · LA TERCERA NATURALEZA — ni medida, ni pronóstico
// ════════════════════════════════════════════════════════════════════════════
describe('un promedio de muchos años no se enseña como la medición de ayer', () => {
  test('las dos fichas publicadas lo declaran, y dicen «promedio»', () => {
    for (const clave of CORREDOR_EN_ORDEN) {
      const f = ficha(CORREDOR[clave].ficha.replace('/mapas/', ''));
      assert.equal(f.naturaleza, NATURALEZA_CORREDOR,
        `«${clave}» no declara qué es: al lado de ocho mediciones fechadas se lee como una más`);
      // Y lo que declara tiene que cuadrar con lo que el archivo dice de sí
      // mismo en prosa. Dos sitios que se contradicen es peor que uno solo.
      assert.match(String(f.periodo ?? ''), /largo plazo/,
        `«${clave}» se declara promedio pero su período no lo dice`);
    }
  });

  test('la pantalla se NIEGA a pintar lo que no diga qué es — sin valor por defecto', () => {
    assert.equal(declaraSuNaturaleza({ naturaleza: 'promedio' }), true);
    for (const mala of [null, undefined, {}, { naturaleza: '' }, { naturaleza: 'medida' },
      { naturaleza: 'pronostico' }]) {
      assert.equal(declaraSuNaturaleza(mala), false,
        `${JSON.stringify(mala)} pasó la puerta: un promedio pintado como medición`);
    }
    // El motor del atlas hace lo mismo desde `§ADR-086`, y por el mismo motivo:
    // un `?? 'medida'` convertiría olvidarlo en mentir.
    assert.match(CAPAS, /if \(!declaraSuNaturaleza\(f\)\) throw new Error\(SIN_NATURALEZA\)/,
      'se pinta antes de comprobar qué es, o no se comprueba');
    assert.ok(!/naturaleza\s*\?\?/.test(CAPAS) && !/naturaleza\s*\|\|/.test(CAPAS),
      'apareció un valor por defecto para la naturaleza: eso es exactamente la mentira');
  });

  test('la pantalla lo dice ANTES de las casillas, no en la letra pequeña', () => {
    const iAviso = CAPAS.indexOf('AVISO_PROMEDIO');
    const iCasillas = CAPAS.indexOf('CORREDOR_EN_ORDEN.map(');
    assert.ok(iAviso > 0 && iCasillas > 0);
    assert.ok(iAviso < iCasillas,
      'el aviso de que es un promedio va DESPUÉS de las casillas: quien la encienda ya la '
      + 'habrá leído como el tiempo de hoy');
  });

  test('no se coló en el catálogo de atlas, que es de capas FECHADAS', () => {
    // Meterla ahí habría obligado a la cinta de frescura a decir «actualizado
    // el …» de algo que no describe ningún día, y al motor a admitir una capa
    // sin calendario.
    for (const clave of CORREDOR_EN_ORDEN) {
      assert.ok(!ATLAS_EN_ORDEN.includes(clave)
        || !String(ATLAS[clave]?.ficha ?? '').includes('cartagena'),
        `«${clave}» acabó en el catálogo de atlas: allí todo lleva fecha y esto no tiene`);
    }
    for (const def of Object.values(ATLAS)) {
      assert.ok(!def.ficha.includes('cartagena-'),
        `un atlas apunta a una ficha del corredor (${def.ficha}): son subsistemas distintos`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2 · DOS RAMPAS SOBRE EL MISMO TERRITORIO NO SE LEEN
// ════════════════════════════════════════════════════════════════════════════
describe('el atlas de la región se aparta mientras la capa fina está puesta', () => {
  test('la capa de la región se apaga, y lo decide su propio efecto', () => {
    // ⚠️ El detalle que costaría un fallo mudo: el efecto que pinta la capa del
    // atlas vuelve a ponerla visible cada vez que cambia el cuadro (mes, día,
    // hora). Apagarla desde fuera duraría hasta el siguiente repintado y las dos
    // rampas reaparecerían solas, sin un solo error en consola.
    const i = ATLAS_TSX.indexOf('if (corredor) {');
    assert.ok(i > 0, 'el efecto que pinta el atlas no mira si hay una capa fina puesta');
    const iVisible = ATLAS_TSX.indexOf("setLayoutProperty(def.idCapa, 'visibility', 'visible')");
    assert.ok(i < iVisible,
      'la comprobación va DESPUÉS de volver a encender la capa: el repintado la resucita');
  });

  test('y el clic del atlas se calla: contesta una sola de las dos', () => {
    assert.match(ATLAS_TSX, /if \(!m \|\| !listoMapa \|\| !ficha \|\| corredor\) return;/,
      'con las dos escuchando, un clic devuelve dos valores en dos unidades distintas');
  });

  test('los dos estados que dependen de eso escuchan el cambio', () => {
    // Sin `corredor` en las dependencias, apagar la capa fina no repintaría la
    // del atlas: se quedaría invisible hasta que él tocara el mes.
    for (const deps of ['[cuadro, listoMapa, ficha, corredor]',
      '[listoMapa, ficha, mes, dia, hora, bytes, corredor]']) {
      assert.ok(ATLAS_TSX.includes(deps), `faltan dependencias: ${deps}`);
    }
  });

  test('la CINTA del atlas calla: no puede fechar lo que no está pintando', () => {
    // ⚠️ ESTE LO CAZÓ LA FOTO, NO UNA PRUEBA (`§ADR-087`). Con la capa del
    // corredor puesta, la cinta seguía diciendo «NASA POWER · trae dato medido
    // hasta el 23 de agosto» justo encima de un promedio de 1994-2025 del Global
    // Solar Atlas: fuente, naturaleza y fecha equivocadas, las tres afirmadas
    // con seguridad y sin un error en consola. Es `§ADR-086` burlado por la
    // puerta de al lado, y por eso el guardián se escribe aquí.
    assert.match(ATLAS_TSX, /\{frescura && !corredor && \(/,
      'la cinta de frescura sigue hablando mientras se pinta otra cosa');
    assert.match(ATLAS_TSX, /El mapa enseña ahora la capa fina del corredor/,
      'nadie dice qué es lo que se está pintando de verdad');
    // Y la entradilla, que describía celdas de 111 km a cuadros, tampoco.
    assert.match(ATLAS_TSX, /\{corredor \? \(\s*<>Debajo sigue el atlas de la región/,
      'la entradilla sigue describiendo la celda de 1° con celdas de 2 km en pantalla');
    // ⚠️ Y NO SE NOMBRA CON `toLowerCase()`. El título de un atlas ya trae su
    // artículo («Lluvia que se espera en el Caribe»), así que anteponerle otro y
    // bajarlo a minúsculas producía «el lluvia que se espera en el caribe» — se
    // vio en PRODUCCIÓN, no en una prueba. Se usa el rótulo corto, tal cual.
    assert.ok(!/def\.titulo\.toLowerCase\(\)|def\.rotulo\.toLowerCase\(\)/.test(ATLAS_TSX),
      'volvió el nombre del atlas en minúsculas detrás de un artículo: «el lluvia que…»');
  });

  test('solo hay UNA capa fina encendida a la vez, y una sola capa de MapLibre', () => {
    assert.equal(ID_CAPA_CORREDOR, 'capa-corredor');
    // El interruptor es excluyente por construcción: el estado es `clave | null`,
    // no un conjunto. Si un día alguien lo convierte en lista, esto se pone rojo.
    assert.match(CAPAS, /puesta: ClaveCorredor \| null;/,
      'el estado dejó de ser «una o ninguna»: dos rampas volverían a superponerse');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3 · EL TECHO DE ZOOM SALE DE LOS DOS TOPES REALES, NUNCA DE UN NÚMERO A MANO
// ════════════════════════════════════════════════════════════════════════════
describe('hasta dónde se puede acercar sin enseñar detalle que nadie midió', () => {
  test('manda el DATO cuando el mapa base da de sobra', () => {
    // Una celda 55 veces más fina que la del atlas son 5,8 niveles más de zoom.
    const esperado = TECHO_DEL_ATLAS + Math.log2(CELDA_DEL_ATLAS_M / 2000);
    assert.ok(Math.abs(techoDelCorredor(2000, 99) - esperado) < 1e-9);
    assert.ok(techoDelCorredor(2000, 99) > 15 && techoDelCorredor(2000, 99) < 15.5);
  });

  test('manda el MAPA BASE cuando es él quien se queda corto', () => {
    // Medido: `caribe.pmtiles` publica hasta z10. Estirarlo mucho más no dibuja
    // una calle de más: dibuja un croquis, y un fondo que parece roto hace dudar
    // de la capa que va encima, que sí está bien.
    assert.equal(techoDelCorredor(2000, 10), 10 + MARGEN_SOBRE_EL_FONDO);
    assert.ok(techoDelCorredor(2000, 10) < techoDelCorredor(2000, 99),
      'el tope del fondo no está mordiendo: el techo lo pone solo el dato');
  });

  test('encender una capa fina NUNCA aleja el mapa', () => {
    // El caso de borde que un `min` mal puesto convertiría en un salto atrás:
    // un fondo pobre no puede dejar el atlas peor de como estaba.
    assert.equal(techoDelCorredor(2000, 1), TECHO_DEL_ATLAS);
    assert.equal(techoDelCorredor(CELDA_DEL_ATLAS_M, 99), TECHO_DEL_ATLAS);
    // Y una ficha sin resolución declarada tampoco: se queda como el atlas.
    assert.equal(techoDelCorredor(0, 99), TECHO_DEL_ATLAS);
    assert.equal(techoDelCorredor(NaN, 99), TECHO_DEL_ATLAS);
  });

  test('el techo del atlas se escribe UNA vez, y el mapa lo usa de ahí', () => {
    // El número vivía a mano en `AtlasCaribe`. Con dos copias, subir el techo
    // por un lado y no por el otro dejaría el mapa clavado sin decir por qué.
    assert.match(ATLAS_TSX, /maxZoom: TECHO_DEL_ATLAS,/,
      'el mapa del atlas volvió a escribir su techo a mano');
    assert.ok(!/maxZoom:\s*9\.5/.test(ATLAS_TSX), 'quedó el 9,5 literal');
    assert.match(CAPAS, /m\.setMaxZoom\(TECHO_DEL_ATLAS\)/,
      'al apagar la capa fina el techo no vuelve al del atlas: quedaría acercable de más');
  });

  test('al encenderla el mapa va al recorte, o se lee como que no funciona', () => {
    // `§ADR-042`: a la escala de siete departamentos, 30 km son cuatro píxeles.
    // Encender la capa y que no pase nada visible es indistinguible de que esté
    // rota — y la conclusión sería razonable.
    assert.match(CAPAS, /irAlRecorte\(m, ficha\.bbox\)/,
      'encender la capa ya no lleva el mapa a su recorte');
    assert.match(CAPAS, /irALaRegion\(m, volverA\)/,
      'apagarla ya no devuelve a la región: se queda mirando un recorte vacío');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4 · SE PUEDEN MIRAR SIN NADIE DELANTE (`§ADR-071`)
// ════════════════════════════════════════════════════════════════════════════
describe('no se publica dibujo de mapa que no se pueda mirar', () => {
  test('el banco las abre por la dirección: un Chrome sin cabeza no pulsa casillas', () => {
    assert.match(BANCO, /delDirectorio<ClaveCorredor \| 'no'>\(\s*'corredor'/,
      'el banco no acepta `?corredor=`: volver a verificarlas exigiría abrir un navegador');
    assert.match(BANCO, /corredorInicial=\{corredor === 'no' \? null : corredor\}/);
    assert.match(CAPAS, /alPoner\(inicial\)/,
      'el componente ignora con qué capa le piden abrir');
  });

  test('el portero sabe mirarlas, y exige QUE LA CAPA ESTÉ PUESTA', () => {
    assert.match(PORTERO, /clave\.startsWith\('corredor:'\)/,
      'el portero no conoce las capas del corredor: quedarían fuera de su vigilancia');
    assert.match(PORTERO, /idCapa: ID_CAPA_CORREDOR/,
      'el portero mira el mapa pero no comprueba que la capa fina esté montada');
    assert.match(PORTERO, /--exigir-capa/,
      'sin `--exigir-capa` el portero aprobaría un mapa bonito con la capa apagada');
  });

  test('una clave inventada no pasa por buena', () => {
    // Un portero que acepta cualquier cosa y sale en verde es peor que no
    // tenerlo: enseña a confiar en un visto bueno que no miró nada.
    assert.match(PORTERO, /no es un atlas ni una capa del corredor/,
      'el portero dejó de rechazar claves que no existen');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5 · SE MUDÓ, NO SE COPIÓ — y llegó COMPLETA
// ════════════════════════════════════════════════════════════════════════════
describe('la mudanza no dejó piezas atrás ni copias detrás', () => {
  test('la hipótesis viajó con la capa que la necesita', () => {
    // Es la línea por la que esa capa vale más que una curiosidad: la media
    // térmica del sitio al lado de la EDS con la que se calcula. Migrar el
    // dibujo y dejar atrás su razón es la regresión de `30 · L-68`.
    assert.match(CAPAS, /edsHipotesis_C/,
      'la leyenda térmica se quedó sin con qué comparar');
    assert.match(ATLAS_TSX, /edsHipotesis_C=\{hipotesis\?\.tempEds_C\}/,
      'el atlas recibe la hipótesis pero no se la pasa a la capa');
    for (const [archivo, quien] of [
      ['web/src/App.tsx', 'el atlas a pantalla completa'],
      ['web/src/componentes/DetalleGps.tsx', 'el atlas embebido en Detalle GPS'],
    ]) {
      assert.match(leer(archivo), /hipotesis=\{/,
        `${quien} no le pasa la hipótesis: ahí la comparación desaparece sin decirlo`);
    }
  });

  test('las dos capas llegan por los DOS caminos que abren el atlas', () => {
    // ⚠️ El fallo que ya mordió una vez (`§ADR-078`): el hora a hora funcionaba
    // a pantalla completa y NO en el atlas abierto desde Detalle GPS. Se
    // comprueba cada camino, no «el atlas» en abstracto.
    assert.match(ATLAS_TSX, /<CapasDelCorredor/,
      'el atlas no monta las capas del corredor por ningún camino');
    // Van dentro del panel del atlas, así que sirven a los dos montajes —
    // pantalla completa y embebido — sin condición que los separe.
    const i = ATLAS_TSX.indexOf('<CapasDelCorredor');
    const bloque = ATLAS_TSX.slice(i, ATLAS_TSX.indexOf('/>', i));
    assert.ok(!/embebido/.test(bloque),
      'se escondieron en el atlas embebido: es el mismo hueco de `§ADR-078` otra vez');
  });

  test('el mapa de la línea se quedó SIN ellas y sin restos muertos', () => {
    const MAPA = leer('web/src/componentes/Mapa.tsx');
    for (const rastro of ['MEDIDAS', 'ID_MEDIDA', 'leerRejilla', 'NOTA_AMPACIDAD',
      'NOTA_HIPOTESIS', 'pintarRejilla', 'valorEnPunto']) {
      assert.ok(!new RegExp(`\\b${rastro}\\b`).test(MAPA),
        `«${rastro}» sigue en el mapa de la línea: o se copió, o quedó código muerto`);
    }
    assert.ok(!/hipotesis\?: Hipotesis;/.test(MAPA),
      'el mapa de la línea sigue pidiendo una hipótesis que ya no usa');
  });
});
