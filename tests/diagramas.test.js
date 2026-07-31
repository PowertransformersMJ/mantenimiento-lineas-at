// ============================================================================
// tests/diagramas.test.js — las nueve figuras de Fundamentos
// ----------------------------------------------------------------------------
// Una figura no se puede "probar" mirándola, así que aquí NO se compara contra
// la salida del propio módulo (eso solo congela los errores que ya tenga). Se
// comprueban PROPIEDADES que se verifican a mano:
//
//  · Estructura: el SVG está bien formado y cierra todas sus etiquetas. Se
//    analiza con un lector de marcado escrito aquí, no con el del módulo.
//  · Identidades geométricas: la panza es proporcional a flecha/vano, así que
//    tres flechas en progresión aritmética deben dar tres profundidades en
//    progresión aritmética. La resultante de deflexión va con 2·sen(α/2), y
//    sen(30°) = 0,5 exacto, así que el tramo dibujado para 60° debe ser la
//    MITAD del de 180°. Ninguna de esas cuentas depende de las constantes que
//    el módulo eligió: se cancelan.
//  · Contrato de color: ni un hex. La app tiene tema oscuro y hoja de impresión
//    en claro; un color fijo aquí es un rótulo ilegible sobre papel.
//  · Sanidad: ningún `NaN` ni `undefined` en la salida, y nada se sale del
//    lienzo ni con datos absurdos.
//
// Datos SINTÉTICOS a propósito: este repositorio es público. Nada de la LN-627.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { diagrama } from '../web/src/vistas/diagramas.ts';

const IDS = ['cat', 'flecha', 'vir', 'tens', 'cambio', 'defl', 'vanos', 'amp', 'terr'];
const VIEWBOX = '0 0 560 230';

// ── Lector de marcado independiente del módulo ──────────────────────────────
// Exige atributos entrecomillados: si el generador emite `x=12` sin comillas,
// la etiqueta no casa y el `<` queda suelto en el texto → salta el error.
function analizar(svg) {
  const ETIQUETA = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[a-zA-Z_:][\w.:-]*="[^"]*")*)\s*(\/?)>/g;
  const ATRIBUTO = /([a-zA-Z_:][\w.:-]*)="([^"]*)"/g;
  const elementos = [];
  const pila = [];
  let pos = 0, m;

  while ((m = ETIQUETA.exec(svg)) !== null) {
    const texto = svg.slice(pos, m.index);
    assert.ok(!/[<>]/.test(texto), `marcado suelto entre etiquetas: ${JSON.stringify(texto)}`);
    pos = ETIQUETA.lastIndex;

    const [, cierre, nombre, crudo, auto] = m;
    if (cierre) {
      assert.equal(pila.pop(), nombre, `cierra </${nombre}> fuera de orden`);
      continue;
    }
    const atributos = {};
    for (const a of crudo.matchAll(ATRIBUTO)) {
      assert.ok(!(a[1] in atributos), `atributo repetido ${a[1]} en <${nombre}>`);
      atributos[a[1]] = a[2];
    }
    elementos.push({ nombre, atributos, dentroDe: [...pila] });
    if (!auto) pila.push(nombre);
  }

  assert.ok(!/[<>]/.test(svg.slice(pos)), 'marcado suelto al final');
  assert.equal(pila.length, 0, `etiquetas sin cerrar: ${pila.join(', ')}`);
  assert.equal(elementos[0].nombre, 'svg', 'la raíz debe ser <svg>');
  return elementos;
}

/** Números de un atributo `d`, en orden. */
const numerosDe = (d) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

/** El `<path>` de trazo más largo: en estas figuras, la curva del conductor. */
function curvas(elementos) {
  return elementos
    .filter((e) => e.nombre === 'path' && !e.dentroDe.includes('marker') && e.atributos.d.length > 60)
    .sort((a, b) => b.atributos.d.length - a.atributos.d.length);
}

/** Profundidad del trazo: la y más grande (la pantalla crece hacia abajo). */
function panzaDe(svg, indice = 0) {
  const d = curvas(analizar(svg))[indice].atributos.d;
  const n = numerosDe(d);
  return Math.max(...n.filter((_, i) => i % 2 === 1));
}

const lineas = (elementos, tono) =>
  elementos.filter((e) => e.nombre === 'line' && e.atributos.stroke === `var(--${tono})`);

const cerca = (real, esperado, tol, msg) =>
  assert.ok(Math.abs(real - esperado) <= tol, `${msg}: ${real} vs ${esperado}`);

// ════════════════════════════════════════════════════════════════════════════

describe('las nueve figuras existen y están bien formadas', () => {

  test('los nueve ids devuelven un SVG que cierra todas sus etiquetas', () => {
    for (const id of IDS) {
      const svg = diagrama(id);
      assert.ok(svg.startsWith('<svg'), `${id}: no empieza en <svg`);
      assert.ok(svg.endsWith('</svg>'), `${id}: no termina en </svg>`);
      analizar(svg);                                   // lanza si algo no cierra
    }
  });

  test('las nueve comparten lienzo: mismo viewBox', () => {
    for (const id of IDS) {
      assert.equal(analizar(diagrama(id))[0].atributos.viewBox, VIEWBOX, `${id}: otro lienzo`);
    }
  });

  test('cada figura es accesible: role="img" y un title propio y descriptivo', () => {
    for (const id of IDS) {
      const svg = diagrama(id);
      const raiz = analizar(svg)[0];
      assert.equal(raiz.atributos.role, 'img', `${id}: sin role="img"`);

      const titulo = /<title[^>]*>([^<]*)<\/title>/.exec(svg);
      assert.ok(titulo, `${id}: sin <title>`);
      assert.ok(titulo[1].trim().length > 60, `${id}: el title no describe nada (${titulo[1]})`);

      // El title tiene que estar ENLAZADO, si no el lector de pantalla no lo usa.
      const idTitulo = /<title id="([^"]+)"/.exec(svg)[1];
      assert.equal(raiz.atributos['aria-labelledby'], idTitulo, `${id}: title sin enlazar`);
    }
  });

  test('las nueve son distintas entre sí (nada de copiar y pegar)', () => {
    const vistos = new Map();
    for (const id of IDS) {
      const svg = diagrama(id);
      assert.ok(!vistos.has(svg), `${id} dibuja lo mismo que ${vistos.get(svg)}`);
      vistos.set(svg, id);
    }
  });

  test('toda referencia url(#..) apunta a un id definido en la MISMA figura', () => {
    for (const id of IDS) {
      const svg = diagrama(id);
      const definidos = new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
      assert.equal(definidos.size, [...svg.matchAll(/\sid="([^"]+)"/g)].length, `${id}: ids repetidos`);
      for (const m of svg.matchAll(/url\(#([^)]+)\)/g)) {
        assert.ok(definidos.has(m[1]), `${id}: referencia colgada a #${m[1]}`);
      }
    }
  });

  test('los ids de marcador van prefijados por figura (nueve SVG en la misma página)', () => {
    const todos = [];
    for (const id of IDS) {
      for (const m of diagrama(id).matchAll(/<marker id="([^"]+)"/g)) todos.push(m[1]);
    }
    assert.equal(new Set(todos).size, todos.length,
      'dos figuras declaran el mismo id de marcador: la segunda hereda el color de la primera');
  });
});

describe('contrato de color — ni un hex, solo variables CSS', () => {

  const DATOS_VARIADOS = [
    undefined,
    { flechaMax_m: 11.4, flechaMin_m: 6.2, vano_m: 340, tMax_C: 75, tMin_C: 12 },
    { pctEds: 19.4, pctViento: 23.8, pctTope: 50 },
    { deflexion_grados: 63.5, vanos_m: [180, 260, 145, 310] },
  ];

  test('ningún color literal en fill/stroke: solo none, var(--x) o url(#..)', () => {
    const PERMITIDO = /^(none|var\(--(acc|az|rd|gr|mut|tx)\)|url\(#[a-z0-9-]+\))$/;
    for (const id of IDS) {
      for (const d of DATOS_VARIADOS) {
        for (const e of analizar(diagrama(id, d))) {
          for (const attr of ['fill', 'stroke']) {
            const v = e.atributos[attr];
            if (v === undefined) continue;
            assert.match(v, PERMITIDO, `${id}: <${e.nombre} ${attr}="${v}">`);
          }
        }
      }
    }
  });

  test('el carácter # solo aparece en ids y en url(#..), nunca como color', () => {
    for (const id of IDS) {
      for (const d of DATOS_VARIADOS) {
        const limpio = diagrama(id, d)
          .replace(/\sid="[^"]*"/g, '')
          .replace(/\saria-labelledby="[^"]*"/g, '')
          .replace(/url\(#[^)]*\)/g, '');
        assert.ok(!limpio.includes('#'), `${id}: hay un # que no es id ni referencia`);
        assert.ok(!/rgb\(|hsl\(|rgba\(/.test(limpio), `${id}: color literal rgb/hsl`);
      }
    }
  });

  test('las opacidades son números entre 0 y 1 (no son colores, pero se colaron ahí)', () => {
    for (const id of IDS) {
      for (const e of analizar(diagrama(id, DATOS_VARIADOS[1]))) {
        for (const attr of ['fill-opacity', 'stroke-opacity']) {
          const v = e.atributos[attr];
          if (v === undefined) continue;
          const n = Number(v);
          assert.ok(Number.isFinite(n) && n >= 0 && n <= 1, `${id}: ${attr}="${v}"`);
        }
      }
    }
  });
});

describe('sanidad numérica — ni NaN, ni undefined, ni fuga del lienzo', () => {

  // Basura deliberada: lo que llega cuando el núcleo aún no calculó, cuando el
  // conductor no está declarado o cuando alguien guardó un cero.
  const BASURA = [
    { flechaMax_m: NaN, flechaMin_m: Infinity, vano_m: 0 },
    { flechaMax_m: -8, vano_m: -300, deflexion_grados: NaN },
    { pctEds: 0, pctViento: 250, pctTope: -3 },
    { vanos_m: [] },
    { vanos_m: [NaN, Infinity, -50] },
    { vanos_m: [200] },
    { deflexion_grados: 999, tMax_C: NaN, tMin_C: undefined },
    { flechaMax_m: 0.0001, vano_m: 100000 },       // casi recta
    { flechaMax_m: 900, vano_m: 12 },              // absurdo por arriba
    { deflexion_grados: 0 },
    { deflexion_grados: 180 },
    { pctEds: 99.9, pctViento: 99.95, pctTope: 100 },
    { pctEds: 62, pctTope: 30 },                   // datos contradictorios
    { vanos_m: [40, 900, 55, 800, 60, 700, 65] },  // más de los que caben
  ];

  test('nunca se emite NaN, undefined, null ni Infinity', () => {
    for (const id of IDS) {
      for (const d of [undefined, ...BASURA]) {
        const svg = diagrama(id, d);
        for (const veneno of ['NaN', 'undefined', 'null', 'Infinity']) {
          assert.ok(!svg.includes(veneno), `${id} con ${JSON.stringify(d)} emitió ${veneno}`);
        }
      }
    }
  });

  test('todo atributo numérico es un número finito', () => {
    const NUMERICOS = ['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx',
      'height', 'font-size', 'stroke-width', 'refX', 'refY', 'markerWidth', 'markerHeight'];
    for (const id of IDS) {
      for (const d of [undefined, ...BASURA]) {
        for (const e of analizar(diagrama(id, d))) {
          for (const attr of [...NUMERICOS, ...(e.nombre === 'svg' ? [] : ['width'])]) {
            const v = e.atributos[attr];
            if (v === undefined) continue;
            assert.ok(Number.isFinite(Number(v)), `${id}: <${e.nombre} ${attr}="${v}">`);
          }
          if (e.atributos.d !== undefined) {
            for (const n of numerosDe(e.atributos.d)) {
              assert.ok(Number.isFinite(n), `${id}: número inválido en d`);
            }
          }
        }
      }
    }
  });

  test('ni con datos absurdos se sale nada del lienzo', () => {
    for (const id of IDS) {
      for (const d of [undefined, ...BASURA]) {
        for (const e of analizar(diagrama(id, d))) {
          if (e.nombre === 'svg' || e.dentroDe.includes('marker')) continue;
          for (const [attr, v] of Object.entries(e.atributos)) {
            const n = Number(v);
            if (!Number.isFinite(n)) continue;
            if (/^(x|x1|x2|cx)$/.test(attr)) {
              assert.ok(n >= -6 && n <= 566, `${id}: ${attr}=${n} fuera del ancho`);
            }
            if (/^(y|y1|y2|cy)$/.test(attr)) {
              assert.ok(n >= -6 && n <= 236, `${id}: ${attr}=${n} fuera del alto`);
            }
          }
          if (e.nombre === 'path' && !e.dentroDe.includes('marker')) {
            for (const n of numerosDe(e.atributos.d)) {
              assert.ok(n >= -20 && n <= 600, `${id}: coordenada ${n} fuera del lienzo`);
            }
          }
        }
      }
    }
  });

  test('un id desconocido devuelve una figura que lo dice, no una excepción', () => {
    const svg = diagrama('inventado');
    analizar(svg);
    assert.match(svg, /no disponible/);
  });
});

describe('los datos de la línea CAMBIAN el dibujo (la mejora sobre el original)', () => {

  test('cat: la panza crece con la flecha, y lo hace de forma proporcional', () => {
    // Identidad: la panza es proporcional a flecha/vano. Tres flechas en
    // progresión aritmética (3, 6, 9 m sobre el mismo vano) deben dar tres
    // profundidades en progresión aritmética. No depende del factor que el
    // módulo haya elegido para exagerar: se cancela en la resta.
    const p = [3, 6, 9].map((f) => panzaDe(diagrama('cat', { flechaMax_m: f, vano_m: 300 })));
    assert.ok(p[0] < p[1] && p[1] < p[2], `no crece: ${p}`);
    cerca(p[1] - p[0], p[2] - p[1], 0.15, 'la panza no es proporcional a la flecha');
  });

  test('cat: el dibujo depende de la RAZÓN flecha/vano, no de los valores sueltos', () => {
    const a = diagrama('cat', { flechaMax_m: 4, vano_m: 200 });
    const b = diagrama('cat', { flechaMax_m: 8, vano_m: 400 });
    assert.equal(panzaDe(a), panzaDe(b), 'misma razón, distinta curva');
  });

  test('cat: sin datos dibuja el genérico y NO inventa cifras en los rótulos', () => {
    const generico = diagrama('cat');
    assert.match(generico, /f = flecha/);
    assert.match(generico, /a = vano/);
    assert.ok(!/\d+,\d+ m/.test(generico), 'aparece una cifra en metros sin dato que la respalde');

    const conDatos = diagrama('cat', { flechaMax_m: 12.35, vano_m: 418 });
    assert.match(conDatos, /12,35 m/);
    assert.match(conDatos, /418 m/);
    assert.notEqual(conDatos, generico);
  });

  test('flecha: la curva fría NUNCA queda por debajo de la caliente', () => {
    const casos = [
      { flechaMax_m: 12, flechaMin_m: 5, vano_m: 350 },
      { flechaMax_m: 5.2, flechaMin_m: 5.1, vano_m: 350 },   // casi iguales
      { flechaMax_m: 4, flechaMin_m: 12, vano_m: 350 },      // datos invertidos
      { flechaMax_m: 40, flechaMin_m: 1, vano_m: 350 },      // saturando el tope
      undefined,
    ];
    for (const d of casos) {
      const el = analizar(diagrama('flecha', d));
      const cal = curvas(el).find((c) => c.atributos.stroke === 'var(--rd)');
      const fri = curvas(el).find((c) => c.atributos.stroke === 'var(--az)');
      const hondo = (c) => Math.max(...numerosDe(c.atributos.d).filter((_, i) => i % 2 === 1));
      assert.ok(hondo(fri) < hondo(cal),
        `la fría se cruzó con la caliente en ${JSON.stringify(d)}: ${hondo(fri)} vs ${hondo(cal)}`);
    }
  });

  test('flecha: con temperaturas declaradas, los rótulos las llevan', () => {
    const svg = diagrama('flecha', { flechaMax_m: 9, flechaMin_m: 4, vano_m: 300, tMax_C: 75, tMin_C: 10 });
    assert.match(svg, /75 °C/);
    assert.match(svg, /10 °C/);
    assert.ok(!/°C/.test(diagrama('flecha')), 'sin datos no debería rotular temperaturas');
  });

  test('tens: las marcas caen en el porcentaje real, en escala lineal', () => {
    // Identidad: x(p) es afín en p, luego 10 / 20 / 30 % quedan equiespaciados
    // y el del 20 % es el punto medio exacto de los otros dos.
    const xDe = (pct) => {
      const el = analizar(diagrama('tens', { pctEds: pct, pctViento: 90, pctTope: 95 }));
      return Number(lineas(el, 'gr')[0].atributos.x1);
    };
    const [a, b, c] = [10, 20, 30].map(xDe);
    assert.ok(a < b && b < c, `las marcas no avanzan con el porcentaje: ${[a, b, c]}`);
    cerca(b, (a + c) / 2, 0.15, 'la escala de la barra no es lineal');
  });

  test('tens: sin datos usa el caso clásico 20 / 50 %, y con datos manda el dato', () => {
    assert.match(diagrama('tens'), /20 %/);
    assert.match(diagrama('tens'), /50 %/);
    const svg = diagrama('tens', { pctEds: 19.4, pctViento: 23.8, pctTope: 45 });
    assert.match(svg, /19,4 %/);
    assert.match(svg, /23,8 %/);
    assert.match(svg, /45 %/);
  });

  test('tens: unos datos contradictorios se ven, no se corrigen en silencio', () => {
    // EDS por encima del tope adoptado es un disparate de configuración. La
    // figura tiene que enseñarlo: la marca verde a la DERECHA de la ámbar.
    const el = analizar(diagrama('tens', { pctEds: 62, pctTope: 30 }));
    const xEds = Number(lineas(el, 'gr')[0].atributos.x1);
    const xTope = Number(lineas(el, 'acc')[0].atributos.x1);
    assert.ok(xEds > xTope, 'la figura enderezó un dato contradictorio en vez de mostrarlo');
    // Y ninguna franja puede quedar de ancho negativo (desaparecería la barra).
    for (const e of el.filter((x) => x.nombre === 'rect')) {
      assert.ok(Number(e.atributos.width) >= 0, `franja de ancho negativo: ${e.atributos.width}`);
    }
  });

  test('defl: la resultante crece como 2·sen(α/2) — comprobado con sen(30°) = 0,5', () => {
    // Con α = 0 / 60 / 180 el factor vale 0 / 1 / 2. Sea cual sea el largo base
    // que el módulo use, el tramo dibujado para 60° tiene que ser exactamente
    // la MITAD del de 180°. Es la propiedad física, no la implementación.
    const largo = (alfa) => {
      const el = analizar(diagrama('defl', { deflexion_grados: alfa }));
      const ft = lineas(el, 'rd').find((l) => l.atributos['marker-end'] === 'url(#defl-rd)');
      return Number(ft.atributos.y2) - Number(ft.atributos.y1);
    };
    const [L0, L60, L180] = [0, 60, 180].map(largo);
    assert.ok(L0 < L60 && L60 < L180, `la resultante no crece con α: ${[L0, L60, L180]}`);
    cerca(L60 - L0, (L180 - L0) / 2, 0.15, 'la resultante no sigue 2·sen(α/2)');
  });

  test('defl: el ángulo real abre la V y se rotula con su cifra', () => {
    const abertura = (alfa) => {
      const el = analizar(diagrama('defl', { deflexion_grados: alfa }));
      // Los dos brazos del vano son los trazos gruesos ámbar.
      const brazos = lineas(el, 'acc').filter((l) => l.atributos['stroke-width'] === '3');
      assert.equal(brazos.length, 2, 'deberían dibujarse exactamente dos vanos');
      return Math.abs(Number(brazos[0].atributos.x1) - Number(brazos[1].atributos.x2));
    };
    // Más deflexión = V más cerrada = brazos más juntos en horizontal.
    assert.ok(abertura(10) > abertura(60), 'la V no se cierra al crecer α');
    assert.ok(abertura(60) > abertura(140), 'la V no se cierra al crecer α');
    assert.match(diagrama('defl', { deflexion_grados: 63.47 }), /α = 63,47°/);
    assert.match(diagrama('defl'), /α<\/text>|>α</);
  });

  test('vir: los vanos reales reparten el ancho en su misma proporción', () => {
    // [100, 200, 100] debe dar tramos en razón 1 : 2 : 1. Comprobable a mano.
    const el = analizar(diagrama('vir', { vanos_m: [100, 200, 100] }));
    const postes = lineas(el, 'rd').concat(lineas(el, 'mut'))
      .filter((l) => l.atributos['stroke-width'] === '4')
      .map((l) => Number(l.atributos.x1))
      .sort((a, b) => a - b);
    assert.equal(postes.length, 4, 'tres vanos piden cuatro apoyos');
    const [w1, w2, w3] = [postes[1] - postes[0], postes[2] - postes[1], postes[3] - postes[2]];
    cerca(w2 / w1, 2, 0.02, 'el vano doble no salió al doble');
    cerca(w3 / w1, 1, 0.02, 'los dos vanos iguales no salieron iguales');
  });

  test('vir: los extremos son de retención y los intermedios de suspensión', () => {
    const el = analizar(diagrama('vir', { vanos_m: [120, 240, 90, 300] }));
    const rojos = lineas(el, 'rd').filter((l) => l.atributos['stroke-width'] === '4');
    const grises = lineas(el, 'mut').filter((l) => l.atributos['stroke-width'] === '4');
    assert.equal(rojos.length, 2, 'la retención está en los dos extremos, y solo ahí');
    assert.equal(grises.length, 3, 'cuatro vanos dejan tres apoyos de suspensión');
    const xs = [...rojos, ...grises].map((l) => Number(l.atributos.x1)).sort((a, b) => a - b);
    assert.deepEqual([xs[0], xs[4]], rojos.map((l) => Number(l.atributos.x1)).sort((a, b) => a - b));
  });

  test('vir: sin datos dibuja cuatro vanos DESIGUALES (si salen iguales no explica nada)', () => {
    const el = analizar(diagrama('vir'));
    const xs = el.filter((e) => e.nombre === 'line' && e.atributos['stroke-width'] === '4')
      .map((l) => Number(l.atributos.x1)).sort((a, b) => a - b);
    assert.equal(xs.length, 5);
    const anchos = xs.slice(1).map((x, i) => x - xs[i]);
    assert.ok(new Set(anchos.map((w) => Math.round(w))).size >= 3, `vanos poco variados: ${anchos}`);
  });

  test('vanos: el vano peso sale MAYOR que el viento, que es lo que la figura enseña', () => {
    // Con el apoyo central en alto, los vértices se corren hacia afuera. Si esta
    // propiedad se rompe, la figura deja de distinguir las dos longitudes y
    // vuelve al problema del original (las dos cotas superpuestas).
    for (const d of [undefined, { vanos_m: [220, 340] }, { vanos_m: [400, 120] }]) {
      const el = analizar(diagrama('vanos', d));
      const cota = (tono) => {
        const l = lineas(el, tono).find((x) => x.atributos['marker-start'] !== undefined);
        return Math.abs(Number(l.atributos.x2) - Number(l.atributos.x1));
      };
      assert.ok(cota('rd') > cota('gr'),
        `vano peso ${cota('rd')} no supera al viento ${cota('gr')} en ${JSON.stringify(d)}`);
    }
  });

  test('vanos: el vano viento SÍ se acota con cifra; el vano peso NO se inventa', () => {
    const svg = diagrama('vanos', { vanos_m: [220, 340] });
    assert.match(svg, /280 m/, 'el vano viento es (220+340)/2 = 280 m y debería salir calculado');
    assert.match(svg, /exige perfil del terreno/);
    // El vano peso no puede aparecer acotado con número por ninguna vía.
    assert.ok(!/vano peso = \d/.test(svg), 'se acotó con cifra un vano peso que no se puede calcular');
  });

  test('terr: la flecha máxima se acota con cifra, pero h y d se quedan simbólicas', () => {
    const svg = diagrama('terr', { flechaMax_m: 13.7, vano_m: 380 });
    assert.match(svg, /f máx = 13,7 m/);
    assert.match(svg, /d = h − f máx/);
    assert.ok(!/d = \d/.test(svg), 'se acotó con cifra una distancia libre que no se puede calcular');
    assert.ok(!/h = \d/.test(svg), 'se acotó con cifra una altura de sujeción no declarada');
  });

  test('cambio: las dos curvas son distintas y la caliente va por debajo', () => {
    const svg = diagrama('cambio', { flechaMax_m: 11, flechaMin_m: 5, vano_m: 320, tMax_C: 75, tMin_C: 8 });
    const el = analizar(svg);
    const hondo = (tono) => {
      const c = curvas(el).find((x) => x.atributos.stroke === `var(--${tono})`);
      return Math.max(...numerosDe(c.atributos.d).filter((_, i) => i % 2 === 1));
    };
    assert.ok(hondo('az') < hondo('rd'), 'el estado caliente no quedó por debajo del frío');
    assert.match(svg, /8 °C/);
    assert.match(svg, /75 °C/);
  });

  test('amp: es un balance sin escala — los datos de la línea NO lo tocan', () => {
    // Deliberado: lo único enchufable sería tMax_C, que es la temperatura de la
    // hipótesis MECÁNICA, no el límite térmico del conductor. Meter una donde
    // va la otra sería cruzar dominios y afirmar algo no calculado.
    const base = diagrama('amp');
    for (const d of [{ tMax_C: 75 }, { flechaMax_m: 9, vano_m: 300 }, { pctEds: 20 }]) {
      assert.equal(diagrama('amp', d), base, 'la figura del balance térmico consumió un dato ajeno');
    }
    assert.match(base, /sin escala/);
  });
});

describe('la basura entra y sale como caso genérico, nunca como cifra inventada', () => {

  const INUTILIZABLES = {
    cat: [{ flechaMax_m: NaN, vano_m: NaN }, { flechaMax_m: 0, vano_m: 0 }, { flechaMax_m: -9, vano_m: -300 }],
    tens: [{ pctEds: 0, pctViento: 250, pctTope: NaN }, { pctEds: -20 }],
    defl: [{ deflexion_grados: NaN }, { deflexion_grados: 999 }, { deflexion_grados: -12 }],
    vir: [{ vanos_m: [] }, { vanos_m: [200] }, { vanos_m: [NaN, -3] }],
    vanos: [{ vanos_m: [NaN, NaN] }, { vanos_m: [0, 0] }],
    terr: [{ flechaMax_m: Infinity, vano_m: Infinity }],
  };

  test('un dato que no se puede usar deja la figura EXACTAMENTE igual que sin datos', () => {
    for (const [id, casos] of Object.entries(INUTILIZABLES)) {
      const generico = diagrama(id);
      for (const d of casos) {
        assert.equal(diagrama(id, d), generico,
          `${id} con ${JSON.stringify(d)} dibujó algo distinto del genérico`);
      }
    }
  });

  test('un dato bueno se usa aunque el de al lado sea basura', () => {
    // Que la flecha venga en NaN no es motivo para tirar el vano: la cota
    // horizontal se acota con su cifra y la vertical se queda simbólica. Es la
    // diferencia entre "no sé esto" y "no sé nada".
    const svg = diagrama('cat', { flechaMax_m: NaN, vano_m: 300 });
    assert.match(svg, /a = 300 m/, 'se descartó un vano perfectamente utilizable');
    assert.match(svg, /f = flecha/, 'se rotuló una flecha que llegó en NaN');
    assert.notEqual(svg, diagrama('cat'));
  });

  test('una deflexión fuera de [0, 180] se rechaza: no se recorta al borde', () => {
    // Recortar 999° a 180° dibujaría un quiebre que nadie midió. Se declara
    // devolviendo el genérico, igual que hace el núcleo cuando no puede.
    assert.equal(diagrama('defl', { deflexion_grados: 999 }), diagrama('defl'));
    assert.notEqual(diagrama('defl', { deflexion_grados: 180 }), diagrama('defl'));
    assert.notEqual(diagrama('defl', { deflexion_grados: 0 }), diagrama('defl'));
  });
});
