// ============================================================================
// tests/campos-del-molde.test.js — el motor no puede leer un campo que el molde
// no admite, ni mandar a declarar uno que la base tira a la basura
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. Este fallo ya se cazó DOS veces a mano, con dos años-persona
// de distancia entre una y otra:
//
//   · §ADR-013 — `umbrales.js` leía `hipotesis.tiroAdmisible_pct` y el molde no
//     lo tenía. La rama «declarado» era inalcanzable: pasara lo que pasara el
//     tope valía 50 % y el informe se lo atribuía a una hipótesis que no lo
//     había declarado.
//   · §ADR-052 — lo MISMO con `resistenciaTierraMax_ohm` y con
//     `corrienteOperacion_A`. Dos años después, la misma forma, en las piezas
//     hermanas: «arreglado donde se veía, vivo en la pieza hermana» (`34 · L-65`).
//
// Cazarlo a mano una tercera vez sale caro y no se puede prometer. Este guardián
// vigila LA FUNCIÓN —la frontera entre el motor y el molde— y no a quien la
// llama, que es lo que cubre la carrera entera (`32 · L-67`).
//
// El daño no se ve nunca en pantalla: `validar()` (web/src/datos/firestore.ts)
// descarta EN SILENCIO lo que el molde no declara. No hay error, no hay aviso;
// simplemente el número que el Ingeniero declaró no llega, y el informe firma el
// valor por defecto diciendo que es el suyo.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => readFileSync(join(RAIZ, p), 'utf-8');

/**
 * El CÓDIGO, sin los comentarios.
 *
 * Hace falta porque el sitio donde mejor se explica por qué una rama se retiró
 * es justo encima de donde estaba, y ahí se nombra el campo retirado. Un
 * guardián que confundiera la explicación con el fallo obligaría a no explicar
 * nada — y la explicación es la mitad del valor de este repositorio.
 *
 * Se quitan los bloques `/* … *\/` y las líneas que son ENTERAS comentario. Un
 * `//` a media línea se deja: podría estar dentro de una cadena (una URL), y
 * cortar ahí sí escondería un campo real.
 */
const sinComentarios = (txt) => txt
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

/**
 * Los campos que el molde admite HOY en la hipótesis. Se leen del propio
 * `activos.ts` en vez de copiarse aquí: una lista copiada es una segunda lista
 * que algún día dice otra cosa, y entonces el guardián certifica en vez de
 * vigilar.
 */
function camposDelMolde(nombreEsquema, hasta) {
  const t = leer('contratos/src/activos.ts');
  const i = t.indexOf(`export const ${nombreEsquema}`);
  assert.ok(i > 0, `no se encontró el esquema ${nombreEsquema} en el molde`);
  const j = t.indexOf(hasta, i);
  assert.ok(j > i, `no se encontró el final del esquema ${nombreEsquema}`);
  const bloque = t.slice(i, j);
  return new Set([...bloque.matchAll(/^\s{2}([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)].map((m) => m[1]));
}

/**
 * ⚠️ MÓDULOS QUE RECIBEN EL DOCUMENTO `Hipotesis` TAL CUAL, sin traducir.
 *
 * `nucleo/cargas.js` NO está aquí a propósito, y no es un olvido: su parámetro
 * se llama `hipotesis` pero lo que le llega es un objeto de parámetros que arma
 * la vista (`vViento`, `cx`, `rho`, `circuitos`), no el documento. Marcarlo daría
 * falsos positivos, y un guardián que grita sin razón se acaba apagando.
 */
const RECIBEN_LA_HIPOTESIS = ['nucleo/umbrales.js'];

describe('el motor no lee campos que el molde no admite', () => {
  const declarados = camposDelMolde('Hipotesis', 'export type Linea');

  test('el molde de la hipótesis se pudo leer y no está vacío', () => {
    assert.ok(declarados.size > 10, `solo se leyeron ${declarados.size} campos del molde`);
    assert.ok(declarados.has('tiroAdmisible_pct'), 'el molde no trae el campo que cerró §ADR-013');
  });

  for (const archivo of RECIBEN_LA_HIPOTESIS) {
    test(`${archivo} solo lee campos que existen en el molde`, () => {
      const txt = sinComentarios(leer(archivo));
      const leidos = new Set(
        [...txt.matchAll(/\bhipotesis\s*\??\.\s*([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]),
      );
      const fantasmas = [...leidos].filter((c) => !declarados.has(c));
      assert.deepEqual(fantasmas, [],
        `${archivo} lee de la hipótesis ${fantasmas.join(', ')}, que el molde NO admite: la base los `
        + 'descarta en silencio al validar y esa rama del cálculo es inalcanzable. O se añaden al molde '
        + '(aditivo y opcional), o se retira la rama.');
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
describe('el motor no manda a declarar campos que no existen', () => {
  // La otra mitad, y la que le llega al Ingeniero: los textos que el motor
  // escribe para él citan el campo que falta —«No se declara la corriente de
  // operación (`hipotesis.corrienteOperacion_A`)»—. Si ese campo no está en el
  // molde, el mensaje manda a declarar algo que la validación tira a la basura.
  // Este guardián mira los TEXTOS, así que cubre cualquier módulo del núcleo y
  // de los exportes, esté o no en la lista de arriba.
  const declarados = camposDelMolde('Hipotesis', 'export type Linea');
  const modulos = [
    ...readdirSync(join(RAIZ, 'nucleo')).filter((f) => f.endsWith('.js')).map((f) => `nucleo/${f}`),
    ...readdirSync(join(RAIZ, 'exportar')).filter((f) => f.endsWith('.js')).map((f) => `exportar/${f}`),
  ];

  test('todo `hipotesis.campo` citado en un texto existe en el molde', () => {
    const malos = [];
    for (const m of modulos) {
      for (const cita of sinComentarios(leer(m)).matchAll(/`hipotesis\.([A-Za-z_][A-Za-z0-9_]*)`/g)) {
        if (!declarados.has(cita[1])) malos.push(`${m} → hipotesis.${cita[1]}`);
      }
    }
    assert.deepEqual(malos, [],
      'estos mensajes mandan al Ingeniero a declarar un campo que el molde no admite: '
      + `${malos.join(' · ')}`);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('un número con dueño único no se declara también a mano', () => {
  test('la ampacidad NO se puede declarar en la hipótesis', () => {
    // Se calcula en `nucleo/termica.js` (IEEE 738) con las condiciones
    // ambientales reales. Una ampacidad escrita a mano en la hipótesis sería un
    // SEGUNDO dueño del mismo número, y la de placa siempre gana por optimista:
    // un día en calma le quita al conductor cerca de un tercio de su capacidad.
    const declarados = camposDelMolde('Hipotesis', 'export type Linea');
    assert.ok(!declarados.has('ampacidad_A'),
      'el molde admite una ampacidad declarada a mano: competiría con la calculada');
    assert.ok(!/hipotesis\s*\??\.\s*ampacidad_A/.test(sinComentarios(leer('nucleo/umbrales.js'))),
      'el motor volvió a aceptar una ampacidad de la hipótesis');
  });
});
